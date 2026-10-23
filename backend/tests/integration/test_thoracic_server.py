"""/measure echoes T1 and T4 and computes T1S and T4PA on every region path; synthetic geometry only."""

import pytest
from fastapi.testclient import TestClient

from backend import server
from backend.tests.unit.test_cervical_measurements import geometry as cervical_geometry
from backend.tests.unit.test_global_sva_measurements import geometry as full_spine_geometry

T1 = [[0, 10], [20, 20]]
T4 = [25, 20]


def lumbar_geometry():
    body = {"superior": [[10, 10], [30, 12]], "inferior": [[10, 30], [30, 32]],
            "quadrilateral": [[10, 10], [30, 12], [30, 32], [10, 30]]}
    return {"vertebrae": {"L1": body}, "s1_superior": [[20, 80], [40, 90]],
            "femoral_circles": [[30, 95, 8], [34, 99, 8]]}


def full_spine_with_circles():
    return {**full_spine_geometry(), "femoral_circles": [[30, 95, 8], [34, 99, 8]]}


def post(body):
    return TestClient(server.app).post("/measure", json=body)


@pytest.mark.parametrize("build", [lumbar_geometry, cervical_geometry, full_spine_with_circles])
def test_measure_computes_and_echoes_t1_and_t4_on_every_region(build):
    response = post({**build(), "t1_superior": T1, "t4_centroid": T4})
    assert response.status_code == 200
    body = response.json()
    assert body["measurements"]["T1S"] == pytest.approx(26.565051)
    assert body["geometry"]["t1_superior"] == [[0.0, 10.0], [20.0, 20.0]]
    assert body["geometry"]["t4_centroid"] == [25.0, 20.0]
    has_hip = build is not cervical_geometry
    assert (body["measurements"]["T4PA"] is not None) == has_hip


def test_measure_lumbar_keeps_its_keys_and_both_fields_are_null_without_the_request_keys():
    for build in (lumbar_geometry, cervical_geometry, full_spine_with_circles):
        body = post(build()).json()
        assert body["measurements"]["T1S"] is None and body["measurements"]["T4PA"] is None
        assert body["geometry"]["t1_superior"] is None and body["geometry"]["t4_centroid"] is None
    lumbar = post({**lumbar_geometry(), "t1_superior": T1, "t4_centroid": T4}).json()
    for key in ("SS", "PI", "PT", "L1PA", "LL"):
        assert key in lumbar["measurements"]
    for key in ("vertebrae", "s1_superior", "l1_center", "hip_midpoint", "femoral_circles"):
        assert key in lumbar["geometry"]


def test_a_malformed_t4_centroid_is_a_422_and_a_degenerate_t1_pair_is_not():
    response = post({**lumbar_geometry(), "t4_centroid": [1]})
    assert response.status_code == 422
    assert "T4 centroid" in response.json()["detail"]
    degenerate = post({**lumbar_geometry(), "t1_superior": [[5, 5], [5, 5]]})
    assert degenerate.status_code == 200
    assert degenerate.json()["measurements"]["T1S"] is None
