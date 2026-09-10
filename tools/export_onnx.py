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
    sample = torch.rand(1, 3 if kind == 's1' else 1, 768, 768)
    names = ['scores', 'keypoints'] if kind == 's1' else ['output']
    path = destination / f'{kind}.onnx'
    destination.mkdir(parents=True, exist_ok=True)
    # TorchVision's supported detection exporter uses scripted ONNX loops for
    # variable proposals/keypoints. Keep fixed batch=1 and the trained 768 frame.
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
    metadata = {'kind': kind, 'opset': 17, 'size': 768, 'precision': 'float32',
                's1_top_detection_only': kind == 's1',
                'checkpoint_sha256': hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
                'onnx_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'torch': torch.__version__, 'onnx': onnx.__version__, 'onnxruntime': ort.__version__}
    path.with_suffix('.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(f'Exported and validated {kind}: {path}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kind', choices=['vertebra', 'femoral', 's1', 'hrnet'])
    parser.add_argument('--output', type=Path, default=ROOT / 'backend' / 'onnx')
    args = parser.parse_args()
    if args.kind:
        export(args.kind, args.output)
    else:
        # Bound conversion memory; each model is exported in a fresh process.
        import subprocess
        for kind in ('s1', 'vertebra', 'femoral', 'hrnet'):
            subprocess.run([sys.executable, __file__, '--kind', kind, '--output', str(args.output)], check=True)
