"""qc.model_versions: the onnx_sha256 of the graph(s) that read each structure."""

import json

from backend.models import models


def write(directory, kind, digest):
    (directory / f"{kind}.json").write_text(json.dumps({"kind": kind, "onnx_sha256": digest}))


def test_each_structure_reports_its_graphs_hash_and_a_missing_file_is_none(monkeypatch, tmp_path):
    monkeypatch.setattr(models, "ONNX_DIRECTORY", tmp_path)
    write(tmp_path, "vertebra", "ab")
    assert models.model_versions({"vertebrae": "unet", "s1": "keypointrcnn"}) == {"vertebrae": "ab", "s1": None}


def test_the_unet_is_a_different_graph_for_vertebrae_and_femoral_heads(monkeypatch, tmp_path):
    monkeypatch.setattr(models, "ONNX_DIRECTORY", tmp_path)
    for kind, digest in (("vertebra", "v1"), ("femoral", "f1"), ("s1", "s1h")):
        write(tmp_path, kind, digest)
    assert models.model_versions({"vertebrae": "unet", "femoral": "unet", "s1": "keypointrcnn"}) == {
        "vertebrae": "v1", "femoral": "f1", "s1": "s1h"}


def test_every_landmark_graph_maps_to_its_own_metadata(monkeypatch, tmp_path):
    monkeypatch.setattr(models, "ONNX_DIRECTORY", tmp_path)
    for kind in ("hrnet", "cervical_hrnet", "cervical_detr"):
        write(tmp_path, kind, f"{kind}-hash")
    assert models.model_versions({"vertebrae": "hrnet", "cervical": "cervical_hrnet", "detector": "cervical_detr"}) == {
        "vertebrae": "hrnet-hash", "cervical": "cervical_hrnet-hash", "detector": "cervical_detr-hash"}


def test_the_dual_hrnet_joins_its_two_graphs(monkeypatch, tmp_path):
    monkeypatch.setattr(models, "ONNX_DIRECTORY", tmp_path)
    write(tmp_path, "cervical_anatomical_hrnet", "c")
    write(tmp_path, "hrnet", "h")
    assert models.model_versions({"vertebrae": "dual_hrnet"}) == {"vertebrae": "c+h"}


def test_the_dual_hrnet_with_one_graph_missing_is_none_not_half_a_version(monkeypatch, tmp_path):
    monkeypatch.setattr(models, "ONNX_DIRECTORY", tmp_path)
    write(tmp_path, "hrnet", "h")
    assert models.model_versions({"vertebrae": "dual_hrnet"}) == {"vertebrae": None}


def test_an_unknown_id_or_unreadable_metadata_is_none(monkeypatch, tmp_path):
    monkeypatch.setattr(models, "ONNX_DIRECTORY", tmp_path)
    (tmp_path / "s1.json").write_text("not json")
    (tmp_path / "femoral.json").write_text(json.dumps({"kind": "femoral"}))
    assert models.model_versions({"vertebrae": "mystery", "s1": "keypointrcnn", "femoral": "unet"}) == {
        "vertebrae": None, "s1": None, "femoral": None}


def test_a_prediction_response_carries_model_versions_in_qc(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    from backend import server
    from backend.tests.integration.test_global_sva_server import calibration, stub_prediction, upload

    monkeypatch.setattr(models, "ONNX_DIRECTORY", tmp_path)
    write(tmp_path, "cervical_anatomical_hrnet", "c")
    write(tmp_path, "hrnet", "h")
    payload = upload()
    stub_prediction(monkeypatch, [])
    monkeypatch.setattr(server, "calibration_from_payload", lambda source, include_preview, cached: calibration(source))
    response = TestClient(server.app).post("/predict", data={
        "modality": "xray", "body_part": "full_spine", "view": "lateral", "vertebra_model": "dual_hrnet",
    }, files={"file": ("synthetic.png", payload, "image/png")})
    assert response.status_code == 200
    qc = response.json()["qc"]
    assert qc["models"] == {"full_spine": "dual_hrnet", "vertebrae": "dual_hrnet"}
    assert qc["model_versions"] == {"full_spine": "c+h", "vertebrae": "c+h"}
