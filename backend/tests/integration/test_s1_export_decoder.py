"""Decoder tensor contracts, including empty detections; not accuracy tests."""
import numpy as np
import onnxruntime as ort
import torch
import torchvision.models.detection.roi_heads as heads
from backend.models.s1_export_decoder import configure_s1_decoder


def test_subpixel_export_supports_empty_and_variable_detection_counts(tmp_path):
    configure_s1_decoder('local_softmax')
    try:
        class Decoder(torch.nn.Module):
            def forward(self, logits, boxes):
                points, scores = heads.keypointrcnn_inference(logits, [boxes])
                return points[0], scores[0]
        model = Decoder()
        path = tmp_path/'decoder.onnx'
        heat = torch.zeros(1, 2, 56, 56)
        box = torch.tensor([[10., 20., 100., 80.]])
        torch.onnx.export(model, (heat, box), str(path), opset_version=17, dynamo=False,
                          input_names=['heat', 'boxes'], output_names=['points', 'scores'],
                          dynamic_axes={k: {0: 'detections'} for k in ('heat', 'boxes', 'points', 'scores')})
        session = ort.InferenceSession(str(path), providers=['CPUExecutionProvider'])
        for count in (0, 1, 3):
            h, b = heat.repeat(count, 1, 1, 1), box.repeat(count, 1)
            expected = model(h, b)
            actual = session.run(None, {'heat': h.numpy(), 'boxes': b.numpy()})
            for left, right in zip(expected, actual):
                np.testing.assert_allclose(left.numpy(), right, atol=1e-5)
    finally:
        configure_s1_decoder('legacy_subpixel')
