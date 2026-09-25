"""Conservative image-only routing between the available lateral-film models.

Detector scores are proposal gates, not calibrated classification confidence.
Automatic routing requires anatomically ordered landmark chains that repeat on
distinct crops. A single small region on a larger film is insufficient to call
that film regional. Filenames, image aspect ratio and DICOM labels are not used.
"""
from __future__ import annotations

import numpy as np

try:
    from . import framing, runtime
    from .models import cervical, full_spine, models
except ImportError:
    import framing
    import runtime
    from models import cervical, full_spine, models


# Conservative routing gates, not validation-derived accuracy estimates.
REGIONAL_HEIGHT_FRACTION = .30
WHOLE_CERVICAL_DETECTION_THRESHOLD = .5


def _whole_cervical_candidates(raw):
    """Check a regional neck film at its own scale, outside upper-film search."""
    image = raw.copy() if raw.dtype == np.uint8 else models._robust_rescale(raw)
    logits, boxes = models._infer(
        "cervical_detr", lambda session: session.run(None, cervical.detector_input(image)),
        "Checking the film for cervical anatomy")
    detected = cervical.detection_from_output(
        logits, boxes, image.shape, threshold=WHOLE_CERVICAL_DETECTION_THRESHOLD)
    if detected is None:
        return [], {"detections": 0, "hrnet_crops": 0}
    bbox = np.asarray(detected["bbox"], np.float64)
    centre = (bbox[:2]+bbox[2:])/2
    half = (bbox[2:]-bbox[:2])/2
    proposals = {}
    for factor in (.9, 1., 1.1):
        prepared = cervical.landmark_input(image, np.r_[centre-half*factor, centre+half*factor])
        if prepared is None:
            continue
        tensor, transform = prepared
        window = (transform.x0, transform.y0, transform.x1, transform.y1)
        proposals.setdefault(window, (tensor, transform))
    candidates = []
    invalid = 0

    def predict(session):
        nonlocal invalid
        for window, (tensor, transform) in proposals.items():
            heat = session.run(None, {"image": tensor})[0]
            try:
                points = transform.restore(cervical.decode_heatmaps(heat))
            except ValueError:
                invalid += 1
                continue
            if not full_spine._inside(points, window):
                continue
            scale = full_spine._body_chain(points[3:])
            if (scale is None or points[2, 1] >= points[3:7, 1].mean()
                    or points[1, 0] <= points[0, 0]
                    or np.linalg.norm(points[1]-points[0]) < scale*.3):
                continue
            candidates.append({"anchor": points[19:23].mean(0), "points": points,
                               "scale": scale, "score": detected["score"], "window": window})

    if proposals:
        models._infer("cervical_hrnet", predict, "Checking cervical landmark agreement")
    return candidates, {"detections": 1, "hrnet_crops": len(proposals),
                        "detector_score": detected["score"], "invalid_outputs": invalid}


def _cervical_consensus(candidates):
    """Require the entire chain to agree, not only the terminal C7 anchor."""
    selected, qc = full_spine.select_consensus(candidates)
    if selected is None:
        return None, qc
    compatible = [candidate for candidate in candidates
                  if np.linalg.norm(candidate["points"]-selected["points"], axis=1).max()
                  <= full_spine.CONSENSUS_RADIUS*min(candidate["scale"], selected["scale"])]
    if len(compatible) < full_spine.MIN_SUPPORT:
        return None, {**qc, "status": "inconsistent_cervical_chain", "support": len(compatible)}
    return selected, {**qc, "support": len(compatible)}


def _height_fraction(candidate, content_height):
    if candidate is None:
        return 0.
    points = candidate.get("points")
    if points is None:
        return 0.
    values = np.asarray(points, np.float64)
    if values.ndim != 2 or values.shape[1] != 2 or not np.isfinite(values).all():
        return 0.
    return float(np.ptp(values[:, 1])/max(1, content_height))


def _region_decision(searches, cervical_candidate, content_height):
    """Separate a complete regional chain from an incomplete standing-film scan."""
    necks = [value["neck"] for value in searches.values() if value.get("neck") is not None]
    pelves = [value["pelvis"] for value in searches.values() if value.get("pelvis") is not None]
    paired = [side for side, value in searches.items()
              if value.get("neck") is not None and value.get("pelvis") is not None]
    if paired:
        return "full_spine", "compatible_cervical_and_lumbar_regions"
    regional_neck = (cervical_candidate is not None and
                     _height_fraction(cervical_candidate, content_height) >= REGIONAL_HEIGHT_FRACTION)
    regional_lumbar = any(_height_fraction(pelvis, content_height) >= REGIONAL_HEIGHT_FRACTION
                         for pelvis in pelves)
    # Do not combine different mirror hypotheses into a synthetic full film.
    # Opposing region evidence must be resolved by the person reading the film.
    if (necks or cervical_candidate is not None) and pelves:
        return None, "conflicting_region_evidence"
    if regional_neck:
        return "cervical", "regional_cervical_chain"
    if regional_lumbar:
        return "lumbar", "regional_lumbosacral_chain"
    return None, "insufficient_region_evidence"


def detect_film(pixel_array, anterior_side=None):
    """Return a suggested body part, orientation evidence and reviewable QC.

    ``None``/``auto`` anterior tests both horizontal orientations. Cervical
    landmark labels are image-sided, so cervical-only detections cannot establish
    an anatomical anterior side. ``_orientation_evidence`` is private, transient
    model output for reusing the full-spine search; omit it from JSON responses.
    """
    if anterior_side not in (None, "", "auto", "left", "right"):
        raise ValueError("anterior_side must be auto, left or right")
    raw = np.asarray(pixel_array)
    if (raw.ndim != 2 or not raw.size or not np.issubdtype(raw.dtype, np.number)
            or not np.isfinite(raw).all()):
        raise ValueError("pixel_array must contain finite two-dimensional grayscale pixels")
    runtime.checkpoint()
    explicit_side = anterior_side if anterior_side in ("left", "right") else None
    base_qc = {"method": "detectors_and_repeatable_landmark_chains",
               "reference_landmarks_used": False, "filename_used": False,
               "requires_review": True, "scores_are_calibrated_confidence": False}
    if min(raw.shape) < 32 or np.ptp(raw.astype(np.float64)) == 0:
        return {"body_part": None, "anterior_side": explicit_side, "status": "needs_selection",
                "qc": {**base_qc, "reason": "no_usable_image_content"},
                "warnings": ["Automatic film detection found no usable anatomical evidence. Choose the film region manually."],
                "_orientation_evidence": {}}
    runtime.report("detecting", "Identifying the film region from image anatomy")
    sides = (explicit_side,) if explicit_side else ("left", "right")
    searches = {side: full_spine.search_orientation(raw, side) for side in sides}
    # Cervical landmarks describe image sides. The same anatomical neck must
    # therefore agree across source/mirrored observations before it is shared
    # with either lumbar orientation hypothesis.
    searches = full_spine.reconcile_cervical_searches(raw, searches)
    # Full-spine evidence already establishes both regions. Only run the extra
    # regional-scale cervical model when a complete pair was not found.
    whole_neck, whole_qc = None, {"status": "not_needed"}
    if not any(value.get("neck") is not None and value.get("pelvis") is not None
               for value in searches.values()):
        candidates, searched = _whole_cervical_candidates(raw)
        whole_neck, consensus = _cervical_consensus(candidates)
        whole_qc = {**searched, **consensus}
    _, top, _, bottom = framing.fallback_window(raw)
    body_part, reason = _region_decision(searches, whole_neck, bottom-top)
    if explicit_side:
        side, orientation = explicit_side, {"status": "user_selected", "anterior_side": explicit_side}
    elif body_part in ("full_spine", "lumbar"):
        side, orientation = full_spine.select_orientation(searches)
    else:
        side, orientation = None, {"status": "needs_selection", "reason": "anatomical_anterior_not_established"}
    warnings = (["Review the automatically detected film region and orientation before accepting measurements."]
                if body_part else
                ["Automatic film detection was inconclusive. Choose cervical, lumbar or standing / full spine manually."])
    if body_part is not None and side is None:
        warnings.append("Choose whether anterior is on the left or right of this image.")
    return {"body_part": body_part, "anterior_side": side,
            "status": "detected" if body_part else "needs_selection",
            "qc": {**base_qc, "reason": reason, "orientation": orientation,
                   "cervical_regional": whole_qc,
                   "hypotheses": {key: {"cervical": value.get("neck_qc", {}),
                                        "lumbar": value.get("pelvis_qc", {})}
                                  for key, value in searches.items()}},
            "warnings": warnings, "_orientation_evidence": searches}
