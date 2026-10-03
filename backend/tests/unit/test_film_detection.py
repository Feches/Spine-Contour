"""Routing and refusal behavior; synthetic geometry is not clinical validation."""
import json

import numpy as np
import pytest

from backend import film_detection as detection


def image(height=1000, width=500):
    return np.broadcast_to(np.arange(width, dtype=np.uint16), (height, width)).copy()


def chain(top=100, bottom=500, x=100):
    points = np.array([[x-10, top], [x+10, top], [x, top-10]] +
                      [[xx, yy] for y in np.linspace(top+30, bottom-15, 5)
                       for xx, yy in ((x-10, y), (x+10, y+1), (x-10, y+14), (x+10, y+15))])
    return {"anchor": points[19:23].mean(0), "scale": 20., "score": .9,
            "points": points, "window": (0, 0, 500, 1000)}


def evidence(neck=None, pelvis=None):
    return {"neck": neck, "pelvis": pelvis,
            "neck_qc": {"status": "accepted" if neck is not None else "not_found"},
            "pelvis_qc": {"status": "accepted" if pelvis is not None else "not_found"}}


def patch_search(monkeypatch, left=None, right=None, whole=None):
    hypotheses = {"left": left or evidence(), "right": right or evidence()}
    calls = []

    def search(raw, side):
        calls.append(side)
        return hypotheses[side]

    monkeypatch.setattr(detection.full_spine, "search_orientation", search, raising=False)
    monkeypatch.setattr(detection.full_spine, "reconcile_cervical_searches", lambda raw, values: values, raising=False)
    monkeypatch.setattr(detection, "_whole_cervical_candidates", lambda raw: ([], {}))
    monkeypatch.setattr(detection, "_cervical_consensus", lambda candidates: (whole, {"status": "accepted" if whole else "not_found"}))
    return calls, hypotheses


def test_both_anatomical_regions_route_standing_and_reuse_exact_evidence(monkeypatch):
    neck, pelvis = chain(50, 250), chain(600, 850)
    calls, searches = patch_search(monkeypatch, left=evidence(neck, pelvis))
    monkeypatch.setattr(detection, "_whole_cervical_candidates", lambda raw: pytest.fail("complete standing search needs no extra neck inference"))
    monkeypatch.setattr(detection.full_spine, "select_orientation", lambda values: ("left", {"status": "detected"}), raising=False)
    result = detection.detect_film(image())
    assert result["body_part"] == "full_spine" and result["anterior_side"] == "left"
    assert calls == ["left", "right"]
    assert result["_orientation_evidence"]["left"] is searches["left"]
    json.dumps({key: value for key, value in result.items() if not key.startswith("_")})


def test_region_routing_uses_cross_orientation_review_before_accepting_neck(monkeypatch):
    patch_search(monkeypatch, left=evidence(chain(40, 200), chain(600, 800)))
    reviewed = {"left": evidence(pelvis=chain(600, 800)), "right": evidence()}
    monkeypatch.setattr(detection.full_spine, "reconcile_cervical_searches", lambda raw, searches: reviewed)
    result = detection.detect_film(image())
    assert result["body_part"] is None
    assert result["_orientation_evidence"] is reviewed


def test_cervical_routing_does_not_infer_anterior_from_image_sided_labels(monkeypatch):
    patch_search(monkeypatch, whole=chain())
    monkeypatch.setattr(detection.full_spine, "select_orientation", lambda values: pytest.fail("cervical labels cannot decide anterior"), raising=False)
    result = detection.detect_film(image())
    assert result["body_part"] == "cervical" and result["status"] == "detected"
    assert result["anterior_side"] is None
    assert any("anterior" in warning for warning in result["warnings"])


def test_explicit_side_is_preserved_and_only_that_orientation_is_searched(monkeypatch):
    calls, _ = patch_search(monkeypatch, whole=chain())
    result = detection.detect_film(image(), "right")
    assert result["body_part"] == "cervical" and result["anterior_side"] == "right"
    assert calls == ["right"]
    assert result["qc"]["orientation"]["status"] == "user_selected"


def test_complete_lumbar_chain_routes_lumbar(monkeypatch):
    patch_search(monkeypatch, left=evidence(pelvis=chain(200, 650)))
    monkeypatch.setattr(detection.full_spine, "select_orientation", lambda values: ("left", {"status": "detected"}), raising=False)
    assert detection.detect_film(image())["body_part"] == "lumbar"


@pytest.mark.parametrize("height,width", [(1000, 500), (500, 1000), (1500, 250)])
def test_no_anatomy_never_classifies_by_aspect_ratio(monkeypatch, height, width):
    patch_search(monkeypatch)
    result = detection.detect_film(image(height, width))
    assert result["body_part"] is None and result["status"] == "needs_selection"


@pytest.mark.parametrize("region", ["neck", "pelvis"])
def test_small_single_region_on_large_film_requires_selection(monkeypatch, region):
    small = chain(100, 200)
    patch_search(monkeypatch, left=evidence(**{region: small}), whole=small if region == "neck" else None)
    result = detection.detect_film(image())
    assert result["body_part"] is None
    assert result["qc"]["reason"] == "insufficient_region_evidence"


def test_opposite_orientation_regions_are_not_combined_into_full_spine(monkeypatch):
    patch_search(monkeypatch, left=evidence(neck=chain(40, 400)),
                 right=evidence(pelvis=chain(500, 850)))
    result = detection.detect_film(image())
    assert result["body_part"] is None
    assert result["qc"]["reason"] == "conflicting_region_evidence"


def test_conflicting_regional_cervical_and_lumbar_evidence_requires_selection(monkeypatch):
    patch_search(monkeypatch, left=evidence(pelvis=chain(500, 850)), whole=chain(40, 400))
    assert detection.detect_film(image())["body_part"] is None


def test_detected_region_retains_ambiguous_orientation_for_manual_selection(monkeypatch):
    patch_search(monkeypatch, left=evidence(pelvis=chain(200, 650)),
                 right=evidence(pelvis=chain(200, 650)))
    monkeypatch.setattr(detection.full_spine, "select_orientation", lambda values: (None, {"status": "ambiguous"}), raising=False)
    result = detection.detect_film(image())
    assert result["body_part"] == "lumbar" and result["anterior_side"] is None


@pytest.mark.parametrize("raw", [np.zeros((300, 500)), np.full((800, 200), 255.), np.zeros((2, 2))])
def test_blank_or_tiny_input_avoids_expensive_model_search(monkeypatch, raw):
    monkeypatch.setattr(detection.full_spine, "search_orientation", lambda *args: pytest.fail("blank input must not run models"), raising=False)
    result = detection.detect_film(raw)
    assert result["body_part"] is None
    assert result["qc"]["reason"] == "no_usable_image_content"


@pytest.mark.parametrize("raw", [np.zeros((2, 2, 3)), np.zeros((0, 0)), [[np.nan]], [[np.inf]], [["x"]]])
def test_invalid_pixels_are_rejected(raw):
    with pytest.raises(ValueError, match="grayscale"):
        detection.detect_film(raw)


def test_invalid_orientation_is_rejected():
    with pytest.raises(ValueError, match="anterior_side"):
        detection.detect_film(image(), "posterior")


def test_terminal_anchor_agreement_cannot_hide_disagreeing_cervical_chain():
    first, second = chain(), chain()
    second["points"][:19, 0] += 60
    selected, qc = detection._cervical_consensus([first, second])
    assert selected is None and qc["status"] != "accepted"


def test_whole_cervical_missed_detection_does_not_run_landmark_model(monkeypatch):
    called = []

    def infer(kind, operation, message):
        called.append(kind)
        return np.array([[[-10., 10.]]]), np.array([[[.5, .5, .8, .8]]])

    monkeypatch.setattr(detection.models, "_infer", infer)
    candidates, qc = detection._whole_cervical_candidates(image())
    assert candidates == [] and qc["hrnet_crops"] == 0
    assert called == ["cervical_detr"]


def test_high_detector_score_cannot_override_collapsed_landmarks(monkeypatch):
    class Session:
        def run(self, output_names, inputs):
            return [np.zeros((1, 23, 96, 96), np.float32)]

    def infer(kind, operation, message):
        if kind == "cervical_detr":
            return np.array([[[10., -10.]]]), np.array([[[.5, .5, .6, .6]]])
        return operation(Session())

    monkeypatch.setattr(detection.models, "_infer", infer)
    candidates, qc = detection._whole_cervical_candidates(image(300, 250))
    assert qc["detector_score"] > .99 and qc["hrnet_crops"] > 1
    assert candidates == []
    assert detection._cervical_consensus(candidates)[0] is None
