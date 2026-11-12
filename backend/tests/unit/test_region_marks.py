"""Crop marks: an S1 endplate or a C2–C7 span a person places, used in place of the region detector."""
import io
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend import framing, learned_region, region_hints, server
from backend.models import full_spine as full

S1 = [[300.0, 1500.0], [380.0, 1480.0]]
NECK = [[250.0, 200.0], [270.0, 520.0]]


def test_parse_accepts_either_mark_and_rejects_anything_else():
    marks = region_hints.parse(json.dumps({"s1": S1, "neck": None}))
    np.testing.assert_array_equal(marks["s1"], S1)
    assert marks["neck"] is None
    assert region_hints.parse(None) is None and region_hints.parse("") is None
    assert region_hints.parse(json.dumps({"s1": None, "neck": None})) is None
    for bad in ("not json", json.dumps([S1]), json.dumps({"l1": S1}), json.dumps({"s1": [[1, 2]]}),
                json.dumps({"s1": [[1, 2], [3, "x"]]}), '{"s1": [[1, 2], [NaN, 4]]}'):
        with pytest.raises(ValueError):
            region_hints.parse(bad)


def test_marks_must_lie_on_the_film_and_span_enough_pixels():
    region_hints.check(region_hints.parse(json.dumps({"s1": S1, "neck": NECK})), (2000, 800))
    with pytest.raises(ValueError, match="outside the film"):
        region_hints.check(region_hints.parse(json.dumps({"s1": [[300, 1500], [900, 1480]]})), (2000, 800))
    with pytest.raises(ValueError, match="too short"):
        region_hints.check(region_hints.parse(json.dumps({"neck": [[250, 200], [252, 205]]})), (2000, 800))


def test_the_neck_box_is_the_square_on_the_c2_c7_span_and_s1_frames_as_training_did():
    left, top, right, bottom = region_hints.neck_box(NECK, (2000, 800))
    side = np.hypot(20, 320)
    assert right - left == pytest.approx(side, abs=1) and bottom - top == pytest.approx(side, abs=1)
    assert (left + right) / 2 == pytest.approx(260, abs=1) and (top + bottom) / 2 == pytest.approx(360, abs=1)
    assert region_hints.s1_frame(S1, (2000, 800)) == framing.reframe(np.array(S1), (2000, 800))


def proposal(name, score, box):
    return {"class": name, "score": score, "bbox": list(box)}


@pytest.mark.parametrize("found, marks, body_part", [
    ([proposal("lumbar", .9, (200, 1100, 500, 1500))], {"neck": NECK}, "full_spine"),
    ([], {"s1": S1}, "lumbar"),
    ([], {"neck": NECK}, "cervical"),
    ([], {"s1": S1, "neck": NECK}, "full_spine"),
])
def test_a_marked_region_counts_as_found_when_routing(monkeypatch, found, marks, body_part):
    monkeypatch.setattr(learned_region, "proposals", lambda raw: found)
    marks = region_hints.parse(json.dumps(marks))
    routed = server.route_film(np.zeros((2000, 800), np.uint8), marks)
    assert routed["body_part"] == body_part
    assert routed["qc"]["marked"] == [n for n in ("cervical", "lumbar") if marks.get(server.MARK_FOR[n]) is not None]


def test_marks_replace_the_detector_boxes_and_say_so():
    detected = {"cervical": (10, 10, 100, 300), "lumbar": (200, 1100, 500, 1500)}
    regions = server.with_marks(detected, region_hints.parse(json.dumps({"s1": S1})), (2000, 800))
    assert regions["cervical"] == detected["cervical"] and regions["lumbar"] == detected["lumbar"]
    assert regions["lumbar_frame"] == framing.reframe(np.array(S1), (2000, 800))
    assert regions["_sources"] == {"cervical": "detector", "lumbar": "mark"}
    regions = server.with_marks({"cervical": None, "lumbar": None}, region_hints.parse(json.dumps({"neck": NECK})), (2000, 800))
    assert regions["cervical"] == region_hints.neck_box(NECK, (2000, 800))
    assert regions["_sources"] == {"cervical": "mark", "lumbar": None}


def test_full_spine_frames_the_lumbar_crops_from_a_marked_s1(monkeypatch):
    framed = []
    monkeypatch.setattr(full, "_cervical_candidates", lambda image, box: ([], {}))
    monkeypatch.setattr(full, "_lumbar_candidates", lambda image, box: pytest.fail("used the detector box"))
    monkeypatch.setattr(full, "_framed_lumbar_candidates", lambda image, window, record: framed.append((window, record)) or ([], record))
    monkeypatch.setattr(full, "_searched_cervical_candidates", lambda image: ([], {}))
    monkeypatch.setattr(full.framing, "locate", lambda image, score: None)
    frame = framing.reframe(np.array(S1), (2000, 800))
    with pytest.raises(ValueError, match="No cervical or lumbar landmarks"):
        full.full_spine_prediction(np.zeros((2000, 800), np.uint8),
                                   regions={"cervical": None, "lumbar": None, "lumbar_frame": frame})
    assert framed == [(frame, {"detector_box": None, "source": "s1_mark"})]
    # A selected right-facing frame reads the mirrored film, so the marked frame is mirrored with it.
    framed.clear()
    full.full_spine_prediction(np.zeros((2000, 800), np.uint8), "right",
                               regions={"cervical": None, "lumbar": None, "lumbar_frame": frame})
    assert framed[0][0] == full._mirror_box(frame, 800)


def film():
    out = io.BytesIO()
    Image.fromarray(np.full((2000, 800), 100, np.uint8)).save(out, format="PNG")
    return out.getvalue()


def post(fields):
    client = TestClient(server.app)
    return client.post("/predict", data={"modality": "xray", "view": "lateral", **fields},
                       files={"file": ("film.png", film())})


def test_the_api_refuses_malformed_marks_and_marks_on_a_cervical_film():
    assert post({"body_part": "full_spine", "region_hints": "nope"}).status_code == 422
    r = post({"body_part": "cervical", "region_hints": json.dumps({"neck": NECK})})
    assert r.status_code == 422 and "read whole" in r.json()["detail"]
    r = post({"body_part": "full_spine", "region_hints": json.dumps({"s1": [[300, 1500], [900, 1480]]})})
    assert r.status_code == 422 and "outside the film" in r.json()["detail"]


def test_the_api_passes_marks_to_the_pipeline_that_runs(monkeypatch):
    seen = {}
    monkeypatch.setattr(learned_region, "proposals", lambda raw: [])
    def fake_full(pixels, side, model=None, regions=None):
        seen["regions"] = regions
        raise ValueError("stop here")
    def fake_lumbar(pixels, *args, s1_mark=None):
        seen["s1_mark"] = s1_mark
        raise ValueError("stop here")
    monkeypatch.setattr(server, "full_spine_prediction", fake_full)
    monkeypatch.setattr(server, "spinopelvic_prediction", fake_lumbar)
    post({"body_part": "auto", "region_hints": json.dumps({"s1": S1, "neck": NECK})})
    assert seen["regions"]["_sources"] == {"cervical": "mark", "lumbar": "mark"}
    post({"body_part": "auto", "region_hints": json.dumps({"s1": S1})})
    np.testing.assert_array_equal(seen["s1_mark"], S1)
