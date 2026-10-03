"""Export the trusted training checkpoints for desktop ONNX Runtime inference.

Run from the repository root: python tools/export_onnx.py
PyTorch is an export/test dependency, never a desktop inference dependency.
"""
from pathlib import Path
import argparse
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def export(kind, destination):
    import numpy as np
    import onnx
    import onnxruntime as ort
    import torch
    from backend.models import models
    from backend.models.hrnet import decode_heatmaps

    torch.set_num_threads(2)
    from backend.models.training import load_checkpoint
    model = load_checkpoint(kind, 'cpu')
    if kind == 's1':
        # The application consumes only the highest-scoring S1 detection. NMS
        # already sorts boxes by score. Prune unused boxes BEFORE the expensive
        # keypoint head, preserving the selected box and its exact two landmarks.
        model.roi_heads.detections_per_img = 1

    class Detector(torch.nn.Module):
        def __init__(self, network):
            super().__init__()
            self.network = network

        def forward(self, image):
            output = self.network([image[0]])[0]
            return output['scores'], output['keypoints']

    class Landmarks(torch.nn.Module):
        def __init__(self, network):
            super().__init__()
            self.network = network

        def forward(self, image):
            return decode_heatmaps(self.network(image), self.network.heatmap_stride)

    network = Detector(model) if kind == 's1' else Landmarks(model) if kind == 'hrnet' else model
    torch.manual_seed(123)
    size = models.FEMORAL_IMAGE_SIZE if kind == 'femoral' else models.MODEL_IMAGE_SIZE
    sample = torch.rand(1, 3 if kind == 's1' else 1, size, size)
    names = ['scores', 'keypoints'] if kind == 's1' else ['output']
    path = destination / f'{kind}.onnx'
    destination.mkdir(parents=True, exist_ok=True)
    # TorchVision's supported detection exporter uses scripted ONNX loops for
    # variable proposals/keypoints. Keep fixed batch=1 and each model's trained input size.
    with torch.inference_mode():
        torch.onnx.export(network.eval(), (sample,), str(path), dynamo=False,
                          opset_version=17, input_names=['image'], output_names=names,
                          dynamic_axes={name: {0: 'detections'} for name in names} if kind == 's1' else None)
    onnx.checker.check_model(str(path))
    settings = ort.SessionOptions()
    settings.intra_op_num_threads = 2
    session = ort.InferenceSession(str(path), sess_options=settings, providers=['CPUExecutionProvider'])
    for tensor in (sample, torch.zeros_like(sample)):
        with torch.inference_mode():
            expected = network(tensor)
        expected = expected if isinstance(expected, tuple) else (expected,)
        actual = session.run(None, {'image': tensor.numpy()})
        for left, right in zip(expected, actual):
            np.testing.assert_allclose(left.numpy(), right, rtol=2e-3, atol=2e-3)
    checkpoint = {'s1': models.S1_WEIGHTS_PATH, 'vertebra': models.VERTEBRA_WEIGHTS_PATH,
                  'femoral': models.FEMORAL_WEIGHTS_PATH, 'hrnet': models.HRNET_WEIGHTS_PATH}[kind]
    metadata = {'kind': kind, 'opset': 17, 'size': size, 'precision': 'float32',
                's1_top_detection_only': kind == 's1',
                'checkpoint_sha256': hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
                'onnx_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'torch': torch.__version__, 'onnx': onnx.__version__, 'onnxruntime': ort.__version__}
    if kind == 'femoral':
        metadata['inference'] = {'revision': models.FEMORAL_MODEL_REVISION,
                                 'threshold': models.FEMORAL_THRESHOLD,
                                 'clahe': {'clip_limit': 2., 'tile_grid': [8, 8]},
                                 'horizontal_flip_average': True,
                                 'reference_canvas': models.MODEL_IMAGE_SIZE}
    path.with_suffix('.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(f'Exported and validated {kind}: {path}', flush=True)


DEFAULT_EMBED_SOURCE = 'vit_small_patch14_dinov2.lvd142m'
DEFAULT_EMBED_INPUT = (224, 224)
DEFAULT_EMBED_POOL = 'cls'
DEFAULT_EMBED_LICENCE = 'Apache-2.0'


def embed_normalisation_and_licence(config, source, licence):
    """The encoder's own preprocessing constants and its licence, or no export at all.

    The desktop normalises every crop with the `mean` and `std` written into embed.json, so a
    substituted ImageNet default would mis-normalise every embedding while the metadata still
    read as if it came from the model: a source whose `pretrained_cfg` does not carry both is
    not exportable. The licence is stamped into a file that ships inside the installer, so
    `--embed-licence` must agree with whatever the model itself declares.
    """
    config = config or {}
    for key in ('mean', 'std'):
        if key not in config:
            raise ValueError(f"{source} has no pretrained_cfg {key}; "
                             "the export cannot guess the encoder's normalisation")
    declared = next((str(config[key]) for key in ('license', 'licence') if config.get(key)), None)
    if declared is not None and declared.strip().lower() != licence.strip().lower():
        raise ValueError(f'--embed-licence {licence!r} must match the licence {source} declares, {declared!r}')
    return [float(v) for v in config['mean']], [float(v) for v in config['std']], licence


def export_embed(destination, source=DEFAULT_EMBED_SOURCE, input_size=DEFAULT_EMBED_INPUT,
                 pooling=DEFAULT_EMBED_POOL, licence=DEFAULT_EMBED_LICENCE):
    """The appearance encoder (similar-cases spec, 2026-09-12, section 10.1). Every constant the
    desktop needs goes into embed.json, so a different network is a different command line."""
    import numpy as np
    import onnx
    import onnxruntime as ort
    import torch
    from backend.models.training import build_embedding_model

    torch.set_num_threads(2)
    height, width = (int(v) for v in input_size)
    network = build_embedding_model(source, (height, width), pooling).eval()
    # Fail before the expensive conversion, never by guessing a constant the desktop relies on.
    mean, std, licence = embed_normalisation_and_licence(
        getattr(network, 'pretrained_cfg', None), source, licence)
    torch.manual_seed(123)
    sample = torch.rand(1, 3, height, width)
    path = destination / 'embed.onnx'
    destination.mkdir(parents=True, exist_ok=True)
    with torch.inference_mode():
        torch.onnx.export(network, (sample,), str(path), dynamo=False, opset_version=17,
                          input_names=['image'], output_names=['embedding'])
    onnx.checker.check_model(str(path))
    settings = ort.SessionOptions()
    settings.intra_op_num_threads = 2
    session = ort.InferenceSession(str(path), sess_options=settings, providers=['CPUExecutionProvider'])
    dim = None
    for tensor in (sample, torch.zeros_like(sample)):
        with torch.inference_mode():
            expected = network(tensor).numpy()
        actual = session.run(None, {'image': tensor.numpy()})[0]
        assert expected.ndim == 2 and expected.shape[0] == 1, f'unexpected encoder output shape {expected.shape}'
        np.testing.assert_allclose(actual, expected, rtol=2e-3, atol=2e-3)
        dim = int(expected.shape[1])
    weights = hashlib.sha256()
    state = network.state_dict()
    for name in sorted(state):
        weights.update(name.encode('utf-8'))
        weights.update(state[name].detach().cpu().contiguous().numpy().tobytes())
    metadata = {'kind': 'embed', 'opset': 17, 'input': [height, width], 'channels': 3, 'dim': dim,
                'pooling': pooling, 'precision': 'float32', 'source': source,
                'mean': mean, 'std': std,
                'licence': licence, 'weights_sha256': weights.hexdigest(),
                'onnx_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'torch': torch.__version__, 'onnx': onnx.__version__, 'onnxruntime': ort.__version__}
    path.with_suffix('.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(f'Exported and validated embed: {path} ({source}, {height}x{width}, {pooling}, dim {dim})', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kind', choices=['vertebra', 'femoral', 's1', 'hrnet', 'embed'])
    parser.add_argument('--output', type=Path, default=ROOT / 'backend' / 'onnx')
    parser.add_argument('--embed-source', default=DEFAULT_EMBED_SOURCE, help='timm model id of the appearance encoder')
    parser.add_argument('--embed-input', type=int, nargs=2, default=list(DEFAULT_EMBED_INPUT), metavar=('HEIGHT', 'WIDTH'))
    parser.add_argument('--embed-pool', choices=['cls', 'mean'], default=DEFAULT_EMBED_POOL)
    parser.add_argument('--embed-licence', default=DEFAULT_EMBED_LICENCE)
    args = parser.parse_args()
    embed_args = ['--embed-source', args.embed_source, '--embed-input', *map(str, args.embed_input),
                  '--embed-pool', args.embed_pool, '--embed-licence', args.embed_licence]
    if args.kind == 'embed':
        export_embed(args.output, args.embed_source, tuple(args.embed_input), args.embed_pool, args.embed_licence)
    elif args.kind:
        export(args.kind, args.output)
    else:
        # Bound conversion memory; each model is exported in a fresh process.
        import subprocess
        for kind in ('s1', 'vertebra', 'femoral', 'hrnet', 'embed'):
            extra = embed_args if kind == 'embed' else []
            subprocess.run([sys.executable, __file__, '--kind', kind, '--output', str(args.output), *extra], check=True)
        subprocess.run([sys.executable, str(ROOT / 'tools' / 'export_cervical_onnx.py'),
                        '--output', str(args.output)], check=True)
