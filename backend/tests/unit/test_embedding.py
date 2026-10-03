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


def test_crop_window_takes_corners_or_xywh_and_returns_none_not_the_film():
    image = np.zeros((100, 80), np.uint8)
    assert embedding.crop_window(image, [10, 20, 50, 70]).shape == (50, 40)
    assert embedding.crop_window(image, [10, 20, 40, 50], xywh=True).shape == (50, 40)
    assert embedding.crop_window(image, [-10, -5, 500, 500]).shape == (100, 80)
    assert embedding.crop_window(image, [10.4, 20.6, 50.0, 70.0]).shape == (49, 40)
    for bad in ([10, 10, 12, 12], None, 'nope', [0, 0, 'x', 1], [1, 2, 3]):
        assert embedding.crop_window(image, bad) is None, bad


def test_region_crops_pick_the_windows_the_region_records():
    image = np.zeros((200, 100), np.uint8)
    lumbar = embedding.region_crops(image, {'window': [0, 50, 100, 150], 'searched': True}, 'lumbar')
    assert lumbar['lumbar'].shape == (100, 100) and lumbar['cervical'] is None
    cervical = embedding.region_crops(image, {'window': [10, 20, 60, 40]}, 'cervical')
    assert cervical['lumbar'] is None and cervical['cervical'].shape == (40, 60)  # x, y, width, height
    full = embedding.region_crops(image, {'lumbar_window': [0, 100, 100, 200], 'cervical_window': [0, 0, 100, 60]}, 'full_spine')
    assert full['lumbar'].shape == (100, 100) and full['cervical'].shape == (60, 100)
    assert embedding.region_crops(image, {'lumbar_window': None, 'cervical_window': None}, 'full_spine') == {'lumbar': None, 'cervical': None}
    assert embedding.region_crops(image, None, 'cervical') == {'lumbar': None, 'cervical': None}


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


def test_embedding_record_per_region(monkeypatch):
    shapes = []
    monkeypatch.setattr(models, '_infer', fake_session([1.0] * 8, shapes))
    monkeypatch.setattr(embedding, 'load_metadata', lambda: META)
    image = np.zeros((200, 100), np.uint8)
    record = embedding.embedding_record(image, {'window': [0, 50, 100, 150]}, 'lumbar')
    assert record['model'] == {'id': 'fixture', 'dim': 8, 'input': [32, 48], 'onnx_sha256': 'abc'}
    assert record['region'] == 'lumbar' and record['cervical'] is None
    assert len(record['lumbar']) == 8 and len(record['whole']) == 8
    assert 'film_type' not in record and 'crop' not in record
    # A cervical film whose detector found nothing: only the whole film, and the record still stands.
    record = embedding.embedding_record(image, {'window': None}, 'cervical')
    assert record == {**record, 'region': 'cervical', 'lumbar': None, 'cervical': None} and len(record['whole']) == 8
    record = embedding.embedding_record(image, {'lumbar_window': [0, 100, 100, 200], 'cervical_window': [0, 0, 100, 60]}, 'full_spine')
    assert len(record['lumbar']) == 8 and len(record['cervical']) == 8 and record['region'] == 'full_spine'
    assert embedding.embedding_record(image, None).get('region') == 'lumbar'  # the default for a stage-1 caller
    with pytest.raises(ValueError, match='region'):
        embedding.embedding_record(image, None, 'thoracic')
    assert all(shape == (1, 3, 32, 48) for shape in shapes)


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
