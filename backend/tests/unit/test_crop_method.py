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
