"""Numeric contract checks, not claims about clinical detection performance."""
import numpy as np
import pytest

from backend.region_detector import DetectorContract, decode, detect, prepare


def metadata(**changes):
    value = {"schema_version": 1, "input_name": "images", "output_name": "detections",
             "input_size": [640, 640], "channels": 3,
             "pixel_normalization": "uint8_div_255", "letterbox_value": 114,
             "output_layout": "xyxy_score_class_rows", "box_units": "input_pixels",
             "classes": ["cervical", "lumbar"], "score_threshold": .25,
             "nms_iou_threshold": .5}
    value.update(changes)
    return value


def test_letterbox_and_native_coordinate_restoration():
    contract = DetectorContract.from_dict(metadata())
    image = np.full((1000, 500), 255, np.uint8)
    tensor, transform = prepare(image, contract)
    assert tensor.shape == (1, 3, 640, 640)
    assert tensor.dtype == np.float32
    assert transform.scale == .64 and transform.left == 160 and transform.top == 0
    assert tensor[0, 0, 0, 0] == pytest.approx(114 / 255)
    assert tensor[0, 0, 100, 200] == 1
    result = decode(np.array([[224, 64, 416, 576, .9, 0]], np.float32), contract, transform)
    assert result[0]["bbox"] == pytest.approx([100, 100, 400, 900])
    assert result[0]["class"] == "cervical"


def test_channel_layout_normalized_boxes_and_two_classes():
    contract = DetectorContract.from_dict(metadata(output_layout="cxcywh_class_scores_channels",
                                                box_units="normalized", channels=1))
    _, transform = prepare(np.zeros((640, 640), np.uint8), contract)
    channels = np.array([[.5, .25], [.5, .75], [.5, .25], [.5, .25], [.8, .1], [.2, .9]])
    result = decode(channels[None], contract, transform)
    assert [item["class"] for item in result] == ["lumbar", "cervical"]
    assert result[0]["bbox"] == pytest.approx([80, 400, 240, 560])
    assert result[1]["bbox"] == pytest.approx([160, 160, 480, 480])


def test_rounded_resize_uses_each_axis_actual_scale():
    contract = DetectorContract.from_dict(metadata())
    _, transform = prepare(np.zeros((1000, 333), np.uint8), contract)
    assert transform.x_scale == pytest.approx(213 / 333)
    assert transform.y_scale == pytest.approx(640 / 1000)
    result = decode(np.array([[transform.left, 0, transform.left + 213, 640, .9, 1]]),
                    contract, transform)
    assert result[0]["bbox"] == pytest.approx([0, 0, 333, 1000])


def test_invalid_empty_outside_threshold_and_classwise_nms():
    contract = DetectorContract.from_dict(metadata())
    _, transform = prepare(np.zeros((640, 640), np.uint8), contract)
    rows = np.array([[10, 10, 110, 110, .9, 0],
                     [12, 12, 112, 112, .8, 0],  # same class, suppressed
                     [10, 10, 110, 110, .7, 1],  # other class retained
                     [10, 10, 11, 11, .2, 0],
                     [np.nan, 0, 100, 100, .99, 0],
                     [10, 10, 110, 110, .9, 3],
                     [700, 700, 800, 800, .9, 0],
                     [110, 10, 10, 100, .9, 0]], np.float64)
    result = decode(rows, contract, transform)
    assert [(item["class"], item["score"]) for item in result] == [
        ("cervical", .9), ("lumbar", .7)]
    assert decode(np.empty((0, 6)), contract, transform) == []


def test_nonfinite_channel_score_rejects_entire_proposal():
    contract = DetectorContract.from_dict(metadata(output_layout="cxcywh_class_scores_channels"))
    _, transform = prepare(np.zeros((640, 640), np.uint8), contract)
    assert decode(np.array([[320], [320], [100], [100], [.9], [np.nan]]), contract, transform) == []


def test_detect_calls_named_output_once():
    class Session:
        def run(self, names, feeds):
            assert names == ["detections"]
            assert list(feeds) == ["images"]
            assert feeds["images"].shape == (1, 3, 640, 640)
            return [np.array([[[10, 10, 20, 20, .8, 1]]])]
    result = detect(Session(), np.zeros((640, 640), np.uint8), DetectorContract.from_dict(metadata()))
    assert result == [{"class": "lumbar", "score": .8, "bbox": [10., 10., 20., 20.]}]


@pytest.mark.parametrize("change", [
    {"classes": ["lumbar", "cervical"]}, {"output_layout": "auto"},
    {"score_threshold": float("nan")}, {"input_size": [0, 640]},
    {"pixel_normalization": "imagenet"}, {"unknown": True},
])
def test_metadata_rejects_unknown_contracts(change):
    with pytest.raises(ValueError):
        DetectorContract.from_dict(metadata(**change))


def test_output_shape_is_metadata_driven_and_input_validated():
    rows = DetectorContract.from_dict(metadata())
    _, transform = prepare(np.zeros((640, 640), np.uint8), rows)
    with pytest.raises(ValueError):
        decode(np.zeros((6, 7)), rows, transform)
    with pytest.raises(ValueError):
        decode(np.zeros((2, 1, 6)), rows, transform)
    with pytest.raises(ValueError):
        prepare(np.zeros((640, 640), np.float32), rows)
