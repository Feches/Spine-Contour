"""Opt-in regression checks using local real radiographs and actual ONNX inference.

SPINE_CONTOUR_REAL_FEMORAL_CASES points to a local JSON manifest. Each case has
path, window (from recorded real model localization, in canonical coordinates),
mirror, expect_expansion, expect_truncated and expect_heads. No images are bundled
or synthesized; no detector or segmentation result is substituted.
"""
import json
import os
from pathlib import Path

import numpy as np
import pytest

from backend import framing, server
from backend.models import models, full_spine
from backend.utils import _femoral_geometry


def _cases():
    manifest = os.environ.get('SPINE_CONTOUR_REAL_FEMORAL_CASES')
    if not manifest:
        return [pytest.param(None, marks=pytest.mark.skip(reason='Supply a real-image manifest'))]
    cases = json.loads(Path(manifest).read_text())
    if not cases:
        raise ValueError('Real-image manifest must not be empty')
    return [pytest.param(case, id=Path(case['path']).stem) for case in cases]


@pytest.mark.parametrize('case', _cases())
def test_real_femoral_crop_retains_visible_heads(case):
    raw = server._decode_grayscale(Path(case['path']).read_bytes())
    if case.get('mirror'):
        raw = np.ascontiguousarray(raw[:, ::-1])
    original = raw.copy()
    window = tuple(case.get('window', (0, 0, raw.shape[1], raw.shape[0])))
    left, top, right, bottom = window
    _, transform = framing.prepare_crop(raw, window)
    baseline = models._restore_femoral_mask(
        models._femoral_probabilities(raw[top:bottom, left:right]), transform, raw.shape)
    if case.get('expect_original_rejection'):
        with pytest.raises(ValueError, match='femoral-head geometry rejected'):
            _femoral_geometry(baseline)
    result, circles, qc = full_spine._femoral_region(raw, {'window': window})
    np.testing.assert_array_equal(raw, original)
    assert result.shape == raw.shape
    assert bool(circles) == case['expect_heads']
    assert 0 <= qc['crop_expansions'] <= 2
    assert bool(qc['crop_expansions']) == case['expect_expansion']
    assert qc['touches_crop_edge'] == case['expect_truncated']
    a, b, c, d = qc['crop_window']
    assert 0 <= a <= left < right <= c <= raw.shape[1]
    assert 0 <= b <= top < bottom <= d <= raw.shape[0]
    if case['expect_expansion']:
        # This is anatomy the old crop discarded, predicted anew from real pixels.
        outside = result.copy()
        outside[top:bottom, left:right] = 0
        assert outside.any()
    else:
        np.testing.assert_array_equal(result, baseline)
    if qc['touches_crop_edge'] and qc['qc_pass']:
        assert qc['confidence'] <= .5
    if circles:
        assert np.isfinite(circles).all()
        assert min(circle[2] for circle in circles) > 0
