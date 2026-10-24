"""Export dynamic-batch HRNet graphs from the fixed production checkpoints.

Exports retain each graph’s input and decoder contract.
Checkpoint paths are explicit inputs; no training or evaluation dataset is bundled.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def export(kind, checkpoint, image, output, expected_sha256):
    import numpy as np
    import onnx
    import onnxruntime as ort
    import torch
    from PIL import Image
    from backend.models.cervical_anatomical_training import HRNetKeypointModel
    from backend.models.cervical_anatomical import landmark_input
    from backend.models.hrnet import build_hrnet_model
    from backend.models.models import _letterbox, _robust_rescale, _segmentation_input
    torch.set_num_threads(2)
    digest = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    if digest != expected_sha256:
        raise ValueError('Checkpoint SHA-256 differs from the selected training result')
    saved = torch.load(checkpoint, map_location='cpu', weights_only=False)
    raw = np.asarray(Image.open(image).convert('L'))
    if kind in ('lumbar_heatmaps', 'hrnet'):
        model = build_hrnet_model(saved)
        example = _segmentation_input(_letterbox(_robust_rescale(raw))[0])
        if kind == 'hrnet':
            from backend.models.hrnet import decode_heatmaps
            class Coordinates(torch.nn.Module):
                def __init__(self, network):
                    super().__init__()
                    self.network = network
                def forward(self, image):
                    return decode_heatmaps(self.network(image), int(saved.get('stride', 4)))
            model = Coordinates(model)
    else:
        model = HRNetKeypointModel('hrnet_w32.ms_in1k', 23, False)
        model.load_state_dict(saved['model'], strict=True)
        example = landmark_input(raw)[0]
    model.eval()
    output.mkdir(parents=True, exist_ok=True)
    path = output/f'{kind}.onnx'
    output_name = 'output' if kind == 'hrnet' else 'heatmaps'
    with torch.inference_mode():
        torch.onnx.export(model, torch.from_numpy(example), str(path), opset_version=17,
                          input_names=['image'], output_names=[output_name], dynamo=False,
                          dynamic_axes={'image': {0: 'batch'}, output_name: {0: 'batch'}})
    onnx.checker.check_model(str(path))
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    session = ort.InferenceSession(str(path), sess_options=options, providers=['CPUExecutionProvider'])
    checks = []
    for batch in (1, 2):
        x = np.repeat(example, batch, axis=0)
        with torch.inference_mode():
            expected = model(torch.from_numpy(x)).numpy()
        actual = session.run(None, {'image': x})[0]
        np.testing.assert_allclose(actual, expected, rtol=.002, atol=.002)
        checks.append({'batch': batch, 'max_output_error': float(np.abs(actual-expected).max())})
    metadata = {'kind': kind, 'checkpoint_epoch': saved['epoch'], 'precision': 'float32',
                'checkpoint_sha256': digest,
                'onnx_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'dynamic_batch': True, 'checks': checks,
                'decoder': 'legacy-coordinate-graph' if kind == 'hrnet' else 'external',
                'parity_image_sha256': hashlib.sha256(image.read_bytes()).hexdigest()}
    if kind in ('hrnet', 'lumbar_heatmaps'):
        metadata['size'] = int(example.shape[-1])
    if kind.startswith('cervical_'):
        metadata.update(keypoints=saved['keypoints'], input_shape=list(example.shape),
                        output_shape=[1, *expected.shape[1:]],
                        preprocessing="grayscale uint8; OpenCV aspect-preserving letterbox; ImageNet normalization",
                        coordinate_transform="heatmap * 4, subtract padding, divide scale",
                        orientation_semantics='anatomical channel identity, preserved under mirroring')
    path.with_suffix('.json').write_text(json.dumps(metadata, indent=2)+'\n')
    print(json.dumps(metadata), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--kind', required=True, choices=['hrnet', 'lumbar_heatmaps', 'cervical_slope_hrnet', 'cervical_anatomical_hrnet'])
    p.add_argument('--checkpoint', type=Path, required=True)
    p.add_argument('--image', type=Path, required=True)
    p.add_argument('--output', type=Path, default=ROOT/'backend/onnx')
    p.add_argument('--expected-sha256', required=True, help='Selected checkpoint SHA-256')
    a = p.parse_args()
    export(a.kind, a.checkpoint, a.image, a.output, a.expected_sha256)
