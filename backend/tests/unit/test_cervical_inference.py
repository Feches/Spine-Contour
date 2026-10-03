import subprocess
import sys
import threading

import numpy as np
import pytest

from backend import runtime
from backend.models import cervical


def test_runtime_import_has_no_training_frameworks():
    subprocess.run([sys.executable, "-c", "import sys; from backend.models import cervical; "
                    "assert not {'torch', 'torchvision', 'timm', 'transformers'} & sys.modules.keys()"], check=True)


@pytest.mark.parametrize("shape,expected", [((400, 600), (800, 1200)), ((200, 800), (333, 1333)),
                                           ((800, 200), (1333, 333)), ((800, 800), (800, 800))])
def test_detector_resize_preserves_saved_aspect_policy(shape, expected):
    assert cervical.detector_size(*shape) == expected


def test_tensor_and_decode_match_training_convention():
    value = cervical._rgb_tensor(np.full((3, 4), 255, np.uint8))
    np.testing.assert_allclose(value[0, :, 0, 0], (1-np.array([.485, .456, .406]))/np.array([.229, .224, .225]), rtol=1e-6)
    heat = np.zeros((1, 23, 96, 96), np.float32)
    heat[:, :, 17, 29] = 1
    np.testing.assert_array_equal(cervical.decode_heatmaps(heat), np.tile([29, 17], (23, 1)))
    heat[0, 0, 0, 0] = np.nan
    with pytest.raises(ValueError, match="non-finite"):
        cervical.decode_heatmaps(heat)


def test_source_inverse_uses_actual_integer_crop_and_does_not_clip_coordinates():
    image = np.zeros((123, 245), np.uint8)
    _, transform = cervical.landmark_input(image, [151.8, 63.2, 235.6, 116.4])
    x, y, width, height = transform.window
    points = transform.restore([[0, 0], [96, 96], [24, 72]])
    np.testing.assert_allclose(points, [[x, y], [x+width, y+height], [x+width/4, y+height*3/4]])


def test_mirrored_film_retains_anatomical_endpoints():
    points = np.arange(46, dtype=float).reshape(23, 2)
    left = cervical.landmark_contract(points, "left")
    mirrored = points.copy()
    mirrored[:, 0] = 400-mirrored[:, 0]
    for a, b in [(0, 1)] + [(i, i+1) for i in range(3, 23, 2)]:
        mirrored[[a, b]] = mirrored[[b, a]]
    right = cervical.landmark_contract(mirrored, "right")
    for level, body in left["vertebrae"].items():
        for endplate in ("superior", "inferior"):
            if body[endplate] is not None:
                expected = np.array(body[endplate]); expected[:, 0] = 400-expected[:, 0]
                np.testing.assert_allclose(right["vertebrae"][level][endplate], expected)
    assert left["vertebrae"]["C2"]["superior"] is None
    assert left["vertebrae"]["C2"]["quadrilateral"] is None
    assert "T1" not in left["vertebrae"]


def test_detector_rejects_missing_nonfinite_and_outside_boxes():
    assert cervical.detection_from_output(np.array([[[-10., 10.]]]), np.array([[[.5, .5, .4, .4]]]), (100, 200)) is None
    assert cervical.detection_from_output(np.array([[[np.nan, 0.]]]), np.array([[[.5, .5, .4, .4]]]), (100, 200)) is None
    assert cervical.detection_from_output(np.array([[[10., 0.]]]), np.array([[[3., 3., .1, .1]]]), (100, 200)) is None
    output = cervical.detection_from_output(np.array([[[10., 0.]]]), np.array([[[.5, .5, .4, .4]]]), (100, 200))
    np.testing.assert_allclose(output["bbox"], [60, 30, 140, 70])


def test_collapsed_endplate_is_nullable_without_discarding_other_levels():
    points = np.arange(46, dtype=float).reshape(23, 2)
    points[7] = points[8]  # C4 superior; C2 and C7 remain independently usable.
    geometry = cervical.landmark_contract(points, "left")
    assert geometry["vertebrae"]["C4"]["superior"] is None
    assert geometry["vertebrae"]["C4"]["quadrilateral"] is None
    assert geometry["vertebrae"]["C4"]["inferior"] is not None
    assert geometry["vertebrae"]["C2"]["inferior"] is not None
    assert geometry["vertebrae"]["C7"]["inferior"] is not None
    assert geometry["c2_centroid"] == points[2].tolist()
    assert len(geometry["review_reasons"]) == 1


def test_no_detection_never_runs_landmark_model_or_invents_mask(monkeypatch):
    calls = []
    def infer(kind, operation, message):
        calls.append(kind)
        return np.array([[[-20., 20.]]]), np.array([[[.5, .5, .8, .8]]])
    monkeypatch.setattr(cervical.models, "_infer", infer)
    result = cervical.cervical_prediction(np.zeros((30, 40), np.uint8), "left")
    assert calls == ["cervical_detr"]
    assert result["landmarks"]["vertebrae"] == {}
    assert result["landmarks"]["c2_centroid"] is None
    assert not result["mask"].any() and not result["femoral_mask"].any()
    assert result["warnings"]


def test_explicit_orientation_required_before_inference(monkeypatch):
    monkeypatch.setattr(cervical.models, "_infer", lambda *a: pytest.fail("must not infer"))
    for side in (None, "", "auto", "posterior"):
        with pytest.raises(ValueError, match="anterior"):
            cervical.cervical_prediction(np.zeros((30, 40), np.uint8), side)


def test_cancelled_request_stops_before_loading_models(monkeypatch):
    stop = threading.Event()
    with runtime.session(cancelled=stop):
        stop.set()
        monkeypatch.setattr(cervical.models, "_infer", lambda *a: pytest.fail("must not infer"))
        with pytest.raises(runtime.Cancelled):
            cervical.cervical_prediction(np.zeros((30, 40), np.uint8), "right")


def test_bilinear_antialias_keeps_constant_and_averages_downsample():
    np.testing.assert_array_equal(cervical.resize_detector_image(np.full((5, 9), 73, np.uint8), (13, 4)), 73)
    resized = cervical.resize_detector_image(np.array([[0, 255], [255, 0]], np.uint8), (1, 1))
    assert resized[0, 0] == 128
