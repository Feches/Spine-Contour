"""Research opt-in must leave default search and anatomical gates intact."""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend import framing, learned_region, runtime
from backend import server
from backend.models import full_spine, models


def test_default_off_and_boolean_validation():
    assert runtime.parse_options().learned_region_localizer is False
    for invalid in (0, None, "true"):
        with pytest.raises(ValueError):
            runtime.parse_options(learned_region_localizer=invalid)


def test_opt_in_without_model_paths_is_rejected_before_job(monkeypatch):
    monkeypatch.delenv("SPINE_REGION_DETECTOR_ONNX", raising=False)
    monkeypatch.delenv("SPINE_REGION_DETECTOR_METADATA", raising=False)
    response = TestClient(server.app).post("/predict", data={
        "modality": "xray", "body_part": "full_spine", "view": "lateral",
        "learned_region_localizer": "true"},
        files={"file": ("film.png", b"film", "image/png")})
    assert response.status_code == 422
    assert "requires configured ONNX" in response.json()["detail"]


def test_top_level_backend_import_for_standalone_launcher():
    import subprocess
    import sys
    from pathlib import Path
    backend_dir = Path(__file__).resolve().parents[2]
    result = subprocess.run([sys.executable, "-c", "import learned_region; import models.full_spine"],
                            env={"PYTHONPATH": str(backend_dir)}, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_box_source_coordinates_and_class_filter():
    proposals = [{"class": "cervical", "score": .9, "bbox": [1.2, 2.3, 22, 40]},
                 {"class": "lumbar", "score": .8, "bbox": [5.2, -2, 120.1, 250]}]
    assert learned_region.top_box(proposals, "cervical", (200, 100)) is None
    assert learned_region.top_box(proposals, "lumbar", (200, 100)) == (5, 0, 100, 200)


def test_low_memory_releases_detector_session(monkeypatch):
    class Session:
        def get_providers(self):
            return ["CPUExecutionProvider"]
    released = []
    def load(*_):
        return Session(), object()
    load.cache_clear = lambda: released.append(True)
    monkeypatch.setattr(learned_region, "_load", load)
    monkeypatch.setattr(learned_region.region_detector, "detect", lambda *_: [])
    monkeypatch.setenv("SPINE_REGION_DETECTOR_ONNX", "/research/model.onnx")
    monkeypatch.setenv("SPINE_REGION_DETECTOR_METADATA", "/research/model.json")
    with runtime.session(runtime.parse_options("low-memory", 1, learned_region_localizer=True)):
        assert learned_region.proposals(np.zeros((100, 100), np.uint8)) == []
    assert released == [True]


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
    assert info["learned_fallback"] == "not_found"


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
