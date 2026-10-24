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
