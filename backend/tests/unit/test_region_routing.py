"""Auto films are routed by the region detector's boxes alone."""
import numpy as np
import pytest

from backend import learned_region, server


def proposal(name, score, box):
    return {"class": name, "score": score, "bbox": list(box)}


NECK = proposal("cervical", .9, (40, 30, 200, 260))
LUMBAR = proposal("lumbar", .8, (60, 600, 260, 900))


@pytest.mark.parametrize("found, body_part", [
    ([NECK, LUMBAR], "full_spine"),
    ([NECK], "cervical"),
    ([LUMBAR], "lumbar"),
    ([], None),
    # Below the presence score a box is not evidence that the region is on the film.
    ([NECK, {**LUMBAR, "score": learned_region.PRESENT_SCORE - .01}], "cervical"),
])
def test_body_part_follows_the_detected_regions(monkeypatch, found, body_part):
    monkeypatch.setattr(learned_region, "proposals", lambda raw: found)
    routed = server.route_film(np.zeros((1000, 400), np.uint8))
    assert routed["body_part"] == body_part
    assert routed["status"] == ("detected" if body_part else "needs_selection")
    assert routed["qc"]["method"] == "region_detector" and routed["qc"]["requires_review"]
    assert routed["warnings"]


def test_regions_keep_the_best_box_per_class_in_film_pixels(monkeypatch):
    weaker = proposal("lumbar", .4, (0, 500, 100, 700))
    monkeypatch.setattr(learned_region, "proposals", lambda raw: [NECK, weaker, LUMBAR])
    regions = learned_region.regions(np.zeros((1000, 400), np.uint8))
    assert regions["cervical"] == (40, 30, 200, 260)
    assert regions["lumbar"] == (60, 600, 260, 900)
    assert regions["lumbar_score"] == .8


def test_full_spine_reuses_the_routing_boxes(monkeypatch):
    monkeypatch.setattr(learned_region, "proposals", lambda raw: [NECK, LUMBAR])
    routed = server.route_film(np.zeros((1000, 400), np.uint8))
    assert list(routed["_regions"]["cervical"]) == routed["qc"]["boxes"]["cervical"] == [40, 30, 200, 260]


def test_a_narrow_neck_on_a_small_film_is_still_a_region(monkeypatch):
    narrow = proposal("cervical", .9, (200, 40, 220, 120))
    monkeypatch.setattr(learned_region, "proposals", lambda raw: [narrow, LUMBAR])
    assert server.route_film(np.zeros((1000, 400), np.uint8))["body_part"] == "full_spine"
    sliver = proposal("cervical", .9, (200, 40, 205, 120))
    monkeypatch.setattr(learned_region, "proposals", lambda raw: [sliver, LUMBAR])
    assert server.route_film(np.zeros((1000, 400), np.uint8))["body_part"] == "lumbar"
