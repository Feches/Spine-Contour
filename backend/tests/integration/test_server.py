import base64
import io

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

from backend import server
from backend.models import VertebraLabel


def test_predict_endpoint_returns_images_geometry_and_measurements(monkeypatch):
    def fake_prediction(pixel_array, modality, body_part, view, laterality, models):
        assert pixel_array.shape == (24, 16)
        assert (modality, body_part, view, laterality) == ("xray", "lumbar", "lateral", None)
        assert models == {"vertebrae": "hrnet", "femoral": None, "s1": None}
        mask = np.zeros(pixel_array.shape, dtype=np.uint8)
        mask[4:12, 3:13] = int(VertebraLabel.L1)
        return {
            "image": pixel_array,
            "mask": mask,
            "femoral_mask": np.zeros_like(mask),
            "landmarks": {"S1": {"superior": [[2, 20], [14, 18]]}, "vertebrae": {"L1": {}}},
            "models": {"vertebrae": "hrnet", "femoral": "unet", "s1": "keypointrcnn"},
            "framing": {"window": [0, 0, 16, 24], "reframed": False},
        }

    analysis = {
        "measurements": {"SS": 10.0, "PI": 42.0, "PT": 12.0, "LL": {"L1-S1": 50.0}},
        "geometry": {"vertebrae": {}, "s1_superior": [], "hip_midpoint": [], "femoral_circles": []},
        "qc": {"femoral": {"confidence": 0.9}},
    }
    monkeypatch.setattr(server, "spinopelvic_prediction", fake_prediction)
    monkeypatch.setattr(server, "spinopelvic_measurements_from_landmarks", lambda *args: analysis)
    upload = io.BytesIO()
    Image.fromarray(np.full((24, 16), 127, dtype=np.uint8)).save(upload, format="PNG")

    response = TestClient(server.app).post(
        "/predict",
        data={"modality": "xray", "body_part": "lumbar", "view": "lateral", "vertebra_model": "hrnet"},
        files={"file": ("radiograph.png", upload.getvalue(), "image/png")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["measurements"] == analysis["measurements"]
    mask = np.asarray(Image.open(io.BytesIO(base64.b64decode(body["mask_png"]))))
    assert mask.shape == (24, 16)
    assert set(np.unique(mask)) == {0, int(VertebraLabel.L1)}
    assert body["labels"]["L1"] == int(VertebraLabel.L1)
    # The femoral gate's numbers survive, and the response says what produced it.
    assert body["qc"]["femoral"] == {"confidence": 0.9}
    assert body["qc"]["models"]["vertebrae"] == "hrnet"
    assert body["qc"]["framing"]["window"] == [0, 0, 16, 24]


def test_predict_endpoint_rejects_a_model_that_is_not_offered():
    upload = io.BytesIO()
    Image.fromarray(np.full((24, 16), 127, dtype=np.uint8)).save(upload, format="PNG")
    response = TestClient(server.app).post(
        "/predict",
        data={"modality": "xray", "body_part": "lumbar", "view": "lateral", "vertebra_model": "resnet"},
        files={"file": ("radiograph.png", upload.getvalue(), "image/png")},
    )
    assert response.status_code == 422
    assert "available: unet, hrnet" in response.json()["detail"]


def test_predict_endpoint_rejects_an_ap_view_before_inference():
    upload = io.BytesIO()
    Image.fromarray(np.full((24, 16), 127, dtype=np.uint8)).save(upload, format="PNG")
    response = TestClient(server.app).post(
        "/predict", data={"modality": "xray", "body_part": "lumbar", "view": "AP"},
        files={"file": ("ap.png", upload.getvalue(), "image/png")},
    )
    assert response.status_code == 422
    assert "view='lateral'" in response.json()["detail"]


def test_models_endpoint_lists_a_choice_only_for_the_vertebrae():
    response = TestClient(server.app).get("/models")
    assert response.status_code == 200
    assert response.json() == {"vertebrae": ["unet", "hrnet"], "femoral": ["unet"], "s1": ["keypointrcnn"]}


def test_predict_endpoint_rejects_an_empty_upload():
    response = TestClient(server.app).post(
        "/predict",
        data={"modality": "xray", "body_part": "lumbar", "view": "lateral"},
        files={"file": ("empty.png", b"", "image/png")},
    )
    assert response.status_code == 400


def test_measure_endpoint_recalculates_corrected_landmarks():
    vertebrae = {
        level: {
            "quadrilateral": [[20, top], [80, top], [80, top + 10], [20, top + 10]],
            "superior": [[20, top], [80, top]],
            "inferior": [[20, top + 10], [80, top + 10]],
        }
        for level, top in zip(("L1", "L2", "L3", "L4", "L5"), (10, 30, 50, 70, 90))
    }
    response = TestClient(server.app).post(
        "/measure",
        json={
            "vertebrae": vertebrae,
            "s1_superior": [[20, 120], [80, 110]],
            "femoral_circles": [[35, 145, 12], [65, 145, 12]],
        },
    )

    assert response.status_code == 200
    assert set(response.json()["measurements"]["LL"]) == {
        "L1-S1", "L2-S1", "L3-S1", "L4-S1", "L5-S1"
    }
    assert response.json()["geometry"]["hip_midpoint"] == [50.0, 145.0]


def test_health_endpoint_reports_ready():
    response = TestClient(server.app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_predict_endpoint_rejects_a_non_boolean_embeddings_field():
    upload = io.BytesIO()
    Image.fromarray(np.full((24, 16), 127, dtype=np.uint8)).save(upload, format="PNG")
    response = TestClient(server.app).post(
        "/predict",
        data={"modality": "xray", "body_part": "lumbar", "view": "lateral", "embeddings": "maybe"},
        files={"file": ("radiograph.png", upload.getvalue(), "image/png")},
    )
    assert response.status_code == 422
    assert any(entry["loc"][-1] == "embeddings" for entry in response.json()["detail"])


def _fake_run(monkeypatch):
    """The first test's fakes, as a helper: a 24 x 16 film, one L1 body, fixed measurements."""
    def fake_prediction(pixel_array, modality, body_part, view, laterality, models):
        mask = np.zeros(pixel_array.shape, dtype=np.uint8)
        mask[4:12, 3:13] = int(VertebraLabel.L1)
        return {"image": pixel_array, "mask": mask, "femoral_mask": np.zeros_like(mask),
                "landmarks": {"S1": {"superior": [[2, 20], [14, 18]]}, "vertebrae": {"L1": {}}},
                "models": {"vertebrae": "unet", "femoral": "unet", "s1": "keypointrcnn"},
                "framing": {"window": [0, 0, 16, 24], "reframed": False, "searched": True, "whole_film_won": False}}
    analysis = {"measurements": {"SS": 10.0, "PI": 42.0, "PT": 12.0, "LL": {"L1-S1": 50.0}},
                "geometry": {"vertebrae": {}, "s1_superior": [], "hip_midpoint": [], "femoral_circles": []},
                "qc": {"femoral": {"confidence": 0.9}}}
    monkeypatch.setattr(server, "spinopelvic_prediction", fake_prediction)
    monkeypatch.setattr(server, "spinopelvic_measurements_from_landmarks", lambda *args: analysis)
    monkeypatch.setattr(server, "calibration_from_payload", lambda *args, **kwargs: {"status": "unavailable"})
    upload = io.BytesIO()
    Image.fromarray(np.full((24, 16), 127, dtype=np.uint8)).save(upload, format="PNG")

    def post(**data):
        return TestClient(server.app).post(
            "/predict",
            data={"modality": "xray", "body_part": "lumbar", "view": "lateral", **data},
            files={"file": ("radiograph.png", upload.getvalue(), "image/png")},
        )
    return post


RECORD = {"model": {"id": "fixture", "dim": 2, "input": [8, 8], "onnx_sha256": "h"},
          "crop": [0.6, 0.8], "whole": [1.0, 0.0], "film_type": "whole-spine"}


def test_predict_carries_the_embedding_and_records_that_it_computed_one(monkeypatch):
    post = _fake_run(monkeypatch)
    seen = {}
    def fake_record(image, framing):
        seen["shape"], seen["framing"] = image.shape, framing
        return dict(RECORD)
    monkeypatch.setattr(server, "embedding_record", fake_record)
    body = post().json()
    assert body["embedding"] == RECORD
    assert body["qc"]["processing"]["embeddings"] is True
    assert seen["shape"] == (24, 16) and seen["framing"]["window"] == [0, 0, 16, 24]


def test_predict_skips_the_embedding_when_the_setting_is_off(monkeypatch):
    post = _fake_run(monkeypatch)
    called = []
    monkeypatch.setattr(server, "embedding_record", lambda image, framing: called.append(1) or dict(RECORD))
    body = post(embeddings="false").json()
    assert body["embedding"] is None
    assert body["qc"]["processing"]["embeddings"] is False
    assert called == []
    assert body["measurements"]["PI"] == 42.0


def test_predict_survives_an_embedding_failure(monkeypatch):
    post = _fake_run(monkeypatch)
    def boom(image, framing):
        raise FileNotFoundError("Missing embedding metadata")
    monkeypatch.setattr(server, "embedding_record", boom)
    response = post()
    assert response.status_code == 200
    body = response.json()
    assert body["embedding"] is None
    assert body["qc"]["processing"]["embeddings"] is False
    assert body["measurements"]["PI"] == 42.0
