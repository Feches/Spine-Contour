"""Research opt-in must leave default search and anatomical gates intact."""
import numpy as np
import pytest

from backend import framing, learned_region, runtime
from backend.models import full_spine, models


def test_default_off_and_boolean_validation():
    assert runtime.parse_options().learned_region_localizer is False
    for invalid in (0, None, "true"):
        with pytest.raises(ValueError):
            runtime.parse_options(learned_region_localizer=invalid)


def test_box_source_coordinates_and_class_filter():
    proposals = [{"class": "cervical", "score": .9, "bbox": [1.2, 2.3, 22, 40]},
                 {"class": "lumbar", "score": .8, "bbox": [5.2, -2, 120.1, 250]}]
    assert learned_region.top_box(proposals, "cervical", (200, 100)) is None
    assert learned_region.top_box(proposals, "lumbar", (200, 100)) == (5, 0, 100, 200)


def test_local_lumbar_learned_proposal_bypasses_search_but_off_does_not(monkeypatch):
    raw = np.ones((900, 600), np.uint8)
    box = (100, 200, 500, 800)
    monkeypatch.setattr(learned_region, "proposals", lambda _: [
        {"class": "lumbar", "score": .9, "bbox": list(box)}])
    monkeypatch.setattr(framing, "locate", lambda *_: pytest.fail("standard search should be bypassed"))
    def reached(*_):
        raise RuntimeError("reached selected crop")
    monkeypatch.setattr(models, "_read_frame", reached)
    with runtime.session(runtime.parse_options(learned_region_localizer=True)):
        with pytest.raises(RuntimeError, match="reached selected crop"):
            models.spinopelvic_prediction(raw)
    # Turning the existing localizer off also bypasses the research proposal.
    monkeypatch.setattr(learned_region, "proposals", lambda _: pytest.fail("opt-in must respect localizer off"))
    with runtime.session(runtime.parse_options(crop_localizer=False,
                                               learned_region_localizer=True)):
        with pytest.raises(RuntimeError, match="reached selected crop"):
            models.spinopelvic_prediction(raw)


def test_full_spine_lumbar_proposal_retains_s1_gate_and_legacy_fallback(monkeypatch):
    raw = np.zeros((1000, 500), np.uint8)
    box = (50, 500, 450, 950)
    monkeypatch.setattr(learned_region, "proposals", lambda _: [
        {"class": "lumbar", "score": .9, "bbox": list(box)}])
    seen = []
    monkeypatch.setattr(full_spine, "lumbar_windows", lambda window, shape: seen.append(window) or [window])
    monkeypatch.setattr(framing, "prepare_crop", lambda *_: (np.zeros((768, 768), np.uint8), None))
    monkeypatch.setattr(models, "_score_s1", lambda _: [(0.0, None)])
    monkeypatch.setattr(framing, "locate", lambda *_: None)
    with runtime.session(runtime.parse_options(learned_region_localizer=True)):
        candidates, info = full_spine._lumbar_candidates(raw)
    assert candidates == []
    assert seen == [box]
    assert info["learned_fallback"] == "insufficient_landmark_evidence"


def test_full_spine_cervical_miss_uses_standard_windows(monkeypatch):
    raw = np.zeros((1000, 500), np.uint8)
    monkeypatch.setattr(learned_region, "proposals", lambda _: [])
    monkeypatch.setattr(full_spine, "cervical_windows", lambda *_: [(0, 0, 100, 100)])
    class EmptyDetector:
        def run(self, *_):
            return np.zeros((1, 1)), np.zeros((1, 4))
    monkeypatch.setattr(models, "_infer", lambda kind, fn, _: fn(EmptyDetector()))
    monkeypatch.setattr(full_spine.cervical, "detection_from_output", lambda *_args, **_kwargs: None)
    with runtime.session(runtime.parse_options(learned_region_localizer=True)):
        candidates, info = full_spine._cervical_candidates(raw)
    assert candidates == []
    assert info["windows"] == 1
    assert info["learned_proposal"] is None
