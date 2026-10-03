"""The real appearance graph, when it has been exported (Plan A Task 2); skipped otherwise."""
import numpy as np
import pytest

from backend import embedding, runtime
from backend.models import models


def test_the_real_graph_returns_unit_vectors_of_the_declared_dimension():
    if not (models.ONNX_DIRECTORY / 'embed.onnx').exists():
        pytest.skip('run python tools/export_onnx.py --kind embed')
    embedding.load_metadata.cache_clear()
    film = np.random.default_rng(3).integers(0, 255, (300, 200), np.uint8)
    with runtime.session(runtime.parse_options('low-memory', 1)):
        record = embedding.embedding_record(film, {'window': [20, 40, 180, 260], 'searched': True, 'whole_film_won': False})
        models.release_models()
    dim = embedding.load_metadata()['dim']
    assert record['region'] == 'lumbar'
    for key in ('lumbar', 'whole'):
        assert len(record[key]) == dim
        assert np.isclose(np.linalg.norm(record[key]), 1.0, atol=1e-3)
    assert record['lumbar'] != record['whole']
    assert record['cervical'] is None
