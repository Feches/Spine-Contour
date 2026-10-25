"""Export selected S1 weights for single-image and four-image inference.

Real radiographs verify Torch/ONNX parity for both desktop execution paths.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    import numpy as np
    import torch
    import onnx
    import onnxruntime as ort
    from PIL import Image
    from backend.models.training import build_s1_model
    from backend.models.models import _letterbox, _robust_rescale
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--checkpoint', type=Path, required=True)
    p.add_argument('--expected-sha256', required=True)
    p.add_argument('--image', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    digest = hashlib.sha256(a.checkpoint.read_bytes()).hexdigest()
    if digest != a.expected_sha256:
        raise ValueError('Checkpoint SHA-256 differs from selected training result')
    torch.set_num_threads(2)
    saved = torch.load(a.checkpoint, map_location='cpu', weights_only=False)
    decoder = saved.get('finetune_config', {}).get('decoder', 'legacy_subpixel')
    from backend.models.s1_export_decoder import configure_s1_decoder
    configure_s1_decoder(decoder)
    model = build_s1_model(768)
    model.load_state_dict(saved['model'])
    model.roi_heads.detections_per_img = 1
    model.eval()
    raw = np.asarray(Image.open(a.image).convert('L'))
    canvas = _letterbox(_robust_rescale(raw))[0]
    sample = torch.from_numpy(np.repeat(canvas[None, None], 3, axis=1).astype(np.float32)/255.)

    class Batch(torch.nn.Module):
        def __init__(self, batch):
            super().__init__()
            self.detector = model
            self.batch = batch
        def forward(self, image):
            predictions = self.detector([image[i] for i in range(self.batch)])
            if self.batch == 1:
                return predictions[0]['scores'], predictions[0]['keypoints']
            scores = torch.stack([torch.cat([p['scores'], p['scores'].new_zeros(1)])[0] for p in predictions])
            points = torch.stack([torch.cat([p['keypoints'], p['keypoints'].new_zeros((1, 2, 3))])[0] for p in predictions])
            return scores, points

    a.output.mkdir(parents=True, exist_ok=True)
    for batch, kind in ((1, 's1'), (4, 's1_batch')):
        network = Batch(batch).eval()
        example = sample.repeat(batch, 1, 1, 1)
        out = a.output/f'{kind}.onnx'
        axes = {name: {0: 'detections'} for name in ('scores', 'keypoints')} if batch == 1 else None
        with torch.inference_mode():
            torch.onnx.export(network, example, str(out), dynamo=False, dynamic_axes=axes,
                              opset_version=17, input_names=['image'], output_names=['scores', 'keypoints'])
        onnx.checker.check_model(str(out))
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        session = ort.InferenceSession(str(out), sess_options=options, providers=['CPUExecutionProvider'])
        checks = []
        for label, tensor in [('radiograph', example), ('mirrored_radiograph', example.flip(-1)),
                              ('empty_input_contract_check', torch.zeros_like(example))]:
            with torch.inference_mode():
                expected = network(tensor)
            actual = session.run(None, {'image': tensor.numpy()})
            errors = []
            for left, right in zip(expected, actual):
                np.testing.assert_allclose(left.numpy(), right, rtol=.002, atol=.002)
                errors.append(float(np.abs(left.numpy()-right).max()) if right.size else 0.)
            checks.append({'input': label, 'max_output_errors': errors})
        out.with_suffix('.json').write_text(json.dumps({
            'kind': kind, 'batch': batch, 'precision': 'float32', 'opset': 17, 'size': 768,
            'checkpoint_epoch': saved.get('epoch'), 'decoder': decoder, 'checks': checks,
            's1_top_detection_only': True, 'checkpoint_sha256': digest,
            'parity_image_sha256': hashlib.sha256(a.image.read_bytes()).hexdigest(),
            'onnx_sha256': hashlib.sha256(out.read_bytes()).hexdigest()}, indent=2)+'\n')
        print('Exported and verified', kind, flush=True)


if __name__ == '__main__':
    main()
