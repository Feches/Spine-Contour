"""Exercise the converted assets, not mocks. Export before running this suite."""
import numpy as np
import pytest
import torch

from backend.models import models
from backend.models.training import load_checkpoint, decode_heatmaps


@pytest.mark.parametrize('kind', ['s1', 'vertebra', 'femoral', 'hrnet'])
def test_converted_models_match_checkpoints_on_empty_and_varied_inputs(kind):
    torch.set_num_threads(2)
    reference = load_checkpoint(kind, 'cpu')
    path = models.ONNX_DIRECTORY / f'{kind}.onnx'
    assert path.exists(), 'Run python tools/export_onnx.py before testing'
    session = models._load_model(kind, (2, True))
    generator = np.random.default_rng(51)
    for image in (np.zeros((768, 768), np.uint8), generator.integers(0, 255, (768, 768), np.uint8)):
        value = models._detection_input(image) if kind == 's1' else models._segmentation_input(image)
        with torch.inference_mode():
            output = reference([torch.from_numpy(value[0])])[0] if kind == 's1' else reference(torch.from_numpy(value))
            if kind == 's1':
                # Compare against the original five-proposal checkpoint path;
                # production has always consumed only its highest-score result.
                expected = [output['scores'][:1].numpy(), output['keypoints'][:1].numpy()]
            elif kind == 'hrnet':
                expected = [decode_heatmaps(output, reference.heatmap_stride).numpy()]
            else:
                expected = [output.numpy()]
        actual = session.run(None, {'image': value})
        for before, after in zip(expected, actual):
            np.testing.assert_allclose(after, before, rtol=2e-3, atol=2e-3)
        if kind in ('vertebra', 'femoral'):
            before = expected[0].argmax(1) if kind == 'vertebra' else expected[0] >= 0
            after = actual[0].argmax(1) if kind == 'vertebra' else actual[0] >= 0
            # Float32 kernels may flip a near-tied boundary pixel, never a region.
            assert np.mean(before == after) > .9999
    models.release_models()
