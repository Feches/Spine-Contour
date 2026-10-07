"""Routing/input contracts, not evidence of anatomical or clinical accuracy."""
import json

import numpy as np
import pytest

from backend import runtime, server, view_classifier as classifier


META = {"temperature": .5, "threshold": .7, "sha256": "test", "version": "test"}


@pytest.mark.parametrize("index,region", [(0, "cervical"), (1, "lumbar"), (2, "full_spine"),
                                        (3, None), (4, None)])
def test_routes_only_confident_supported_views(index, region):
    logits = np.zeros(5)
    logits[index] = 4
    actual, record = classifier.decision(logits, META)
    assert actual == region
    assert record["label"] == classifier.CLASSES[index]
    assert record["score"] > .99
    json.dumps(record)


def test_uncertain_or_invalid_outputs_cannot_select_region():
    assert classifier.decision(np.zeros(5), META)[0] is None
    for values in ([1, 2], [0, 0, 0, 0, float("nan")]):
        with pytest.raises(ValueError):
            classifier.decision(values, META)


def test_invalid_and_empty_content_does_not_load_model(monkeypatch):
    monkeypatch.setattr(classifier, "_load", lambda *_: pytest.fail("must not load"))
    for raw in (np.zeros((0, 0)), np.zeros((3, 4, 3)), np.full((32, 32), np.nan)):
        with pytest.raises(ValueError):
            classifier.detect_film(raw)
    result = classifier.detect_film(np.zeros((32, 32), np.uint8), "left")
    assert result["body_part"] is None
    assert result["anterior_side"] == "left"
    assert result["status"] == "needs_selection"


def test_whole_image_letterbox_keeps_edges_and_shape():
    # A mathematical intensity fixture verifies preprocessing only.
    raw = np.ones((112, 224), np.uint8)*255
    tensor = classifier.prepare_image(raw)
    assert tensor.shape == (1, 3, 224, 224) and tensor.dtype == np.float32
    restored = tensor[0, 0]*.229+.485
    assert np.allclose(restored[56:168], 1)
    assert np.allclose(restored[:56], 0)
    assert np.allclose(restored[168:], 0)


def test_default_and_selected_dispatch_use_different_algorithms(monkeypatch):
    from backend import film_detection
    monkeypatch.setattr(film_detection, "detect_film", lambda *a, **k: "landmarks")
    monkeypatch.setattr(classifier, "detect_film", lambda *a, **k: "classifier")
    with runtime.session(runtime.parse_options()):
        assert server.detect_film(None) == "landmarks"
    with runtime.session(runtime.parse_options(view_selection="classifier")):
        assert server.detect_film(None) == "classifier"
    with pytest.raises(ValueError, match="View selection"):
        runtime.parse_options(view_selection="guess")


def test_bundled_model_and_metadata_match():
    # Loads the actual shipped ONNX graph; accuracy is evaluated on real films separately.
    session, metadata = classifier._load(2)
    assert session.get_inputs()[0].shape == [1, 3, 224, 224]
    assert session.get_outputs()[0].shape == [1, 5]
    assert metadata["classes"] == list(classifier.CLASSES)
    classifier._load.cache_clear()


def test_aggressive_geometry_retains_all_four_source_corners(monkeypatch):
    """Colored corner markers test geometry, not medical model accuracy."""
    import importlib.util
    from pathlib import Path
    from PIL import Image
    path = Path(__file__).resolve().parents[3] / 'tools/view-classifier/augmentation.py'
    spec = importlib.util.spec_from_file_location('whole_film_augmentation', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module.random, 'random', lambda: .7)
    monkeypatch.setattr(module.random, 'uniform', lambda a, b: 15 if a == -15 else 1)
    monkeypatch.setattr(module.random, 'randint', lambda a, b: b)
    source = np.zeros((180, 240, 3), np.uint8)
    colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0)]
    for (y, x), color in zip([(0, 0), (0, 232), (172, 0), (172, 232)], colors):
        source[y:y+8, x:x+8] = color
    result = np.asarray(module.WholeFilmAugmentation()(Image.fromarray(source)), dtype=float)
    assert result.shape == (224, 224, 3)
    for color in colors:
        assert np.linalg.norm(result-np.asarray(color), axis=2).min() < 20
