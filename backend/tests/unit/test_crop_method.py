"""Public requests use search; retained model internals remain testable."""
import numpy as np
import pytest

from backend import framing, learned_region, runtime
from backend.models import full_spine, models


def test_crop_method_defaults_to_search_and_rejects_unknown_values():
    assert runtime.parse_options().crop_method == "search"
    assert runtime.parse_options(crop_method="model").crop_method == "search"
    for value in (None, "auto", True, 0):
        with pytest.raises(ValueError):
            runtime.parse_options(crop_method=value)


def test_model_miss_falls_back_to_each_full_spine_crop_search(monkeypatch):
    raw = np.zeros((1000, 500), np.uint8)
    seen = []
    monkeypatch.setattr(learned_region, "proposals", lambda _: [])
    def neck(_, _found=None, *, force_search=False):
        seen.append(("cervical", force_search))
        return [], {"model_proposals": []} if not force_search else {"windows": 1}
    def pelvis(_, _found=None, *, force_search=False):
        seen.append(("lumbar", force_search))
        return [], {"model_proposals": []} if not force_search else {"windows": 1}
    monkeypatch.setattr(full_spine, "_cervical_candidates", neck)
    monkeypatch.setattr(full_spine, "_lumbar_candidates", pelvis)
    with runtime.session(runtime.Options(crop_method="model")):
        result = full_spine.search_orientation(raw, "left")
    assert seen == [("cervical", False), ("lumbar", False),
                    ("cervical", True), ("lumbar", True)]
    assert result["neck_search"]["method_used"] == "search_fallback"
    assert result["pelvis_search"]["method_used"] == "search_fallback"
    assert result["neck_search"]["model_fallback_reason"] == "not_found"


def test_accepted_model_regions_do_not_run_search(monkeypatch):
    raw = np.zeros((1000, 500), np.uint8)
    monkeypatch.setattr(learned_region, "proposals", lambda _: [])
    accepted = [{"anchor": np.array([100. + dx, 300.]), "scale": 20., "score": .9}
                for dx in (-1, 0, 1)]
    def candidates(_, _found=None, *, force_search=False):
        assert not force_search
        return accepted, {"model_proposals": [[1, 2, 3, 4]]}
    monkeypatch.setattr(full_spine, "_cervical_candidates", candidates)
    monkeypatch.setattr(full_spine, "_lumbar_candidates", candidates)
    with runtime.session(runtime.Options(crop_method="model")):
        result = full_spine.search_orientation(raw, "left")
    assert result["neck_search"]["method_used"] == "model"
    assert result["pelvis_search"]["method_used"] == "model"


def test_model_lumbar_proposal_reaches_selected_crop(monkeypatch):
    raw = np.ones((900, 600), np.uint8)
    box = (100, 200, 500, 800)
    monkeypatch.setattr(learned_region, "proposals", lambda _: [
        {"class": "lumbar", "score": .9, "bbox": list(box)}])
    monkeypatch.setattr(framing, "locate", lambda *_: pytest.fail("crop search ran in model mode"))
    def reached(*_):
        raise RuntimeError("selected model crop")
    monkeypatch.setattr(models, "_read_frame", reached)
    with runtime.session(runtime.Options(crop_method="model")):
        with pytest.raises(RuntimeError, match="selected model crop"):
            models.spinopelvic_prediction(raw)


def test_regional_model_miss_tries_search_before_visible_film(monkeypatch):
    raw = np.ones((900, 600), np.uint8)
    monkeypatch.setattr(learned_region, "proposals", lambda _: [])
    calls = []
    def locate(*_):
        calls.append("search")
        return None
    monkeypatch.setattr(framing, "locate", locate)
    def read(*_):
        assert calls == ["search"]
        raise RuntimeError("visible film reached")
    monkeypatch.setattr(models, "_read_frame", read)
    with runtime.session(runtime.Options(crop_method="model")):
        with pytest.raises(RuntimeError, match="visible film reached"):
            models.spinopelvic_prediction(raw)
    assert calls == ["search"]


def test_rejected_regional_model_crop_tries_search(monkeypatch):
    raw = np.ones((900, 600), np.uint8)
    box = (100, 200, 500, 800)
    monkeypatch.setattr(learned_region, "proposals", lambda _: [
        {"class": "lumbar", "score": .9, "bbox": list(box)}])
    calls = []
    def locate(*_):
        calls.append("search")
        return {"window": (80, 180, 520, 820), "searched": True,
                "whole_film_won": False, "whole_film_cost": None,
                "confidence": .8, "cost": .2, "candidates": 2}
    monkeypatch.setattr(framing, "locate", locate)
    def read(*_):
        if not calls:
            return {"s1": None, "s1_confidence": 0.}
        raise RuntimeError("search crop reached")
    monkeypatch.setattr(models, "_read_frame", read)
    with runtime.session(runtime.Options(crop_method="model")):
        with pytest.raises(RuntimeError, match="search crop reached"):
            models.spinopelvic_prediction(raw)
    assert calls == ["search"]


def test_model_lumbar_refinement_keeps_s1_and_pelvis_clearance():
    s1 = np.array([[400., 1000.], [500., 1000.]])
    broad = (0, 200, 1000, 1900)
    proposals = [(broad, None, None, .95, s1, False)]
    refined = full_spine._refined_lumbar_windows(proposals, (2000, 1000))
    assert len(refined) >= 2
    assert all(window[1] < 1000 - 6.42 * 100 for window in refined)
    assert all(window[3] > 1000 + 4.45 * 100 for window in refined)
    assert all((window[2]-window[0])*(window[3]-window[1])
               < (broad[2]-broad[0])*(broad[3]-broad[1]) for window in refined)


def test_refined_lumbar_requires_consensus_at_both_scales():
    def candidate(offset, refined):
        points = np.zeros((22, 2), dtype=float)
        points[:, 0] = offset
        return {"points": points, "anchor": np.array([offset, 0.]),
                "scale": 100., "score": .9, "refined": refined,
                "window": (100, 300, 400, 700) if refined else (0, 200, 500, 900)}
    broad = [candidate(0, False), candidate(1, False)]
    tight = [candidate(2, True), candidate(3, True)]
    preferred, info = full_spine._prefer_refined_lumbar(broad + tight)
    assert preferred["refined"] is True
    assert info["refined_crop"] is True
    incompatible = [candidate(35, True), candidate(36, True)]
    preferred, info = full_spine._prefer_refined_lumbar(broad + incompatible)
    assert preferred in broad
    assert not info.get("refined_crop")
