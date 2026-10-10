"""HTTP contract of POST /decode: stateless, file in, JSON out."""

import math

from fastapi.testclient import TestClient

from backend import server
from backend.tests.integration.test_global_sva_server import upload


def test_decode_returns_the_films_dimensions_and_16_bit_pixels():
    response = TestClient(server.app).post("/decode", files={"file": ("film.png", upload(), "image/png")})
    assert response.status_code == 200
    body = response.json()
    assert (body["width"], body["height"]) == (100, 120)
    assert len(body["pixels_base64"]) == math.ceil(100 * 120 * 2 / 3) * 4
    assert body["value_min"] == body["value_max"] == 127
    assert body["bits_stored"] == 8
    assert body["window"] is None


def test_decode_rejects_empty_and_undecodable_files():
    client = TestClient(server.app)
    for payload in (b"", b"not an image"):
        response = client.post("/decode", files={"file": ("bad.png", payload, "image/png")})
        assert response.status_code == 422


def test_decode_rejects_an_upload_over_the_size_limit(monkeypatch):
    monkeypatch.setattr(server, "MAX_UPLOAD_BYTES", 10)
    response = TestClient(server.app).post("/decode", files={"file": ("film.png", upload(), "image/png")})
    assert response.status_code == 422
