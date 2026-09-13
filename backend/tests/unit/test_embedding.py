"""backend/embedding.py's pure parts (similar-cases spec, 2026-09-12, section 10.2), against a
metadata fixture and a fake session: nothing here needs the graph."""
import numpy as np
import pytest

from backend import embedding
from backend.models import models

META = {'kind': 'embed', 'input': [32, 48], 'channels': 3, 'dim': 8, 'pooling': 'cls',
        'mean': [0.5, 0.5, 0.5], 'std': [0.25, 0.25, 0.25], 'onnx_sha256': 'abc', 'source': 'fixture'}


def test_preprocess_letterboxes_into_the_metadata_frame_and_normalises():
    # A tall flat film into a 32 x 48 (height x width) frame: scale = min(32/100, 48/50) = 0.32,
    # so it lands 32 high and 16 wide, centred at left = 16; the rest is zero padding.
    image = np.full((100, 50), 200, np.uint8)
    value = embedding.preprocess(image, META)
    assert value.shape == (1, 3, 32, 48) and value.dtype == np.float32
    inside = value[0, 0, :, 24]
    assert np.all(inside == inside[0]) and inside[0] == pytest.approx((200 / 255 - 0.5) / 0.25)
    assert np.all(value[0, 0, :, 0] == pytest.approx((0.0 - 0.5) / 0.25))
    assert np.all(value[0, 1] == value[0, 0]) and np.all(value[0, 2] == value[0, 0])


def test_preprocess_honours_a_different_shape_channel_count_and_normalisation():
    meta = {**META, 'input': [16, 24], 'channels': 1, 'mean': [0.0], 'std': [1.0]}
    value = embedding.preprocess(np.zeros((40, 40), np.uint8), meta)
    assert value.shape == (1, 1, 16, 24)
    assert np.all(value == 0.0)


def test_crop_window_cuts_clips_and_falls_back_to_the_film():
    image = np.zeros((100, 80), np.uint8)
    assert embedding.crop_window(image, {'window': [10, 20, 50, 70]}).shape == (50, 40)
    assert embedding.crop_window(image, {'window': [-10, -5, 500, 500]}).shape == (100, 80)
    assert embedding.crop_window(image, {'window': [10.4, 20.6, 50.0, 70.0]}).shape == (49, 40)
    assert embedding.crop_window(image, {'window': [10, 10, 12, 12]}) is image
    assert embedding.crop_window(image, None) is image
    assert embedding.crop_window(image, {'window': 'nope'}) is image
    assert embedding.crop_window(image, {'window': [0, 0, 'x', 1]}) is image


@pytest.mark.parametrize('framing,expected', [
    (None, None), ({}, None), ('text', None),
    ({'searched': True, 'whole_film_won': False}, 'whole-spine'),
    ({'searched': True, 'whole_film_won': True}, 'lumbar'),
    ({'searched': False, 'whole_film_won': True}, 'lumbar'),
    ({'searched': True}, 'whole-spine'),
])
def test_film_type_reads_the_search_and_who_won(framing, expected):
    assert embedding.film_type(framing) == expected


def fake_session(vector, shapes=None):
    def infer(kind, operation, message):
        assert kind == 'embed' and message is None
        class Model:
            def run(self, names, inputs):
                if shapes is not None:
                    shapes.append(inputs['image'].shape)
                return [np.asarray(vector, np.float32).reshape(1, -1)]
        return operation(Model())
    return infer


def test_embed_normalises_rounds_and_checks_the_dimension(monkeypatch):
    monkeypatch.setattr(models, '_infer', fake_session([3.0] * 8))
    vector = embedding.embed(np.zeros((64, 64), np.uint8), META)
    assert len(vector) == 8 and vector == [round(1 / np.sqrt(8), 5)] * 8
    monkeypatch.setattr(models, '_infer', fake_session([1.0] * 9))
    with pytest.raises(ValueError, match='embed.json says 8'):
        embedding.embed(np.zeros((64, 64), np.uint8), META)
    monkeypatch.setattr(models, '_infer', fake_session([0.0] * 8))
    with pytest.raises(ValueError, match='degenerate'):
        embedding.embed(np.zeros((64, 64), np.uint8), META)


def test_embedding_record_uses_the_crop_then_the_whole_film(monkeypatch):
    shapes = []
    monkeypatch.setattr(models, '_infer', fake_session([1.0] * 8, shapes))
    monkeypatch.setattr(embedding, 'load_metadata', lambda: META)
    record = embedding.embedding_record(np.zeros((200, 100), np.uint8),
                                        {'window': [0, 50, 100, 150], 'searched': True, 'whole_film_won': False})
    assert record['model'] == {'id': 'fixture', 'dim': 8, 'input': [32, 48], 'onnx_sha256': 'abc'}
    assert record['film_type'] == 'whole-spine'
    assert len(record['crop']) == 8 and len(record['whole']) == 8
    assert shapes == [(1, 3, 32, 48), (1, 3, 32, 48)]


def test_load_metadata_names_the_export_tool_when_the_graph_is_missing(monkeypatch, tmp_path):
    embedding.load_metadata.cache_clear()
    monkeypatch.setattr(models, 'ONNX_DIRECTORY', tmp_path)
    with pytest.raises(embedding.EmbeddingUnavailable, match='export_onnx.py --kind embed'):
        embedding.load_metadata()
    (tmp_path / 'embed.json').write_text('{"kind": "embed"}')
    embedding.load_metadata.cache_clear()
    with pytest.raises(embedding.EmbeddingUnavailable, match="missing 'input'"):
        embedding.load_metadata()
    embedding.load_metadata.cache_clear()
    (tmp_path / 'embed.json').write_text('not json')
    embedding.load_metadata.cache_clear()
    with pytest.raises(embedding.EmbeddingUnavailable, match='could not be read'):
        embedding.load_metadata()
    embedding.load_metadata.cache_clear()
