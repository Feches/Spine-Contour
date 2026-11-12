"""Standing-film landmarks: one detector pass, then each regional model once.

The region detector proposes a cervical and a lumbar box on the original film.
The anatomical cervical HRNET and the lumbar HRNET run on a few crops framed
around each box, and crop agreement gates the landmarks. Agreement is a
repeatability check, not calibrated confidence or proof of vertebral identity.

Every landmark model was trained with horizontal flips that keep anatomical
identities, so it labels the anterior and posterior corners itself in either
facing direction, and the anterior image side is read from those labels; nothing
votes between mirrored hypotheses. The models are nonetheless most accurate with
anterior on the left, so a film whose landmarks face right is mirrored once and
read again in that frame. Every result requires anatomical review.
"""
from __future__ import annotations

import numpy as np

from . import cervical, models
try:
    from .. import framing, runtime, learned_region
except ImportError:
    import framing
    import runtime
    import learned_region

MODEL_NAME = "dual_hrnet"
MIN_SUPPORT = 2
CONSENSUS_RADIUS = .75  # in local body/endplate widths; not physical units
# The detector's cervical box often stops at C6/C7; frame it with extra context.
CERVICAL_CONTEXT = 1.3
# Lumbar crops are framed the way the BUU-LSPINE training films were.
LUMBAR_FRAMING = {"side": .45, "top": .256, "bottom": .498}


def _inside(points, window):
    p = np.asarray(points)
    left, top, right, bottom = window
    return (p.ndim == 2 and p.shape[1] == 2 and np.isfinite(p).all()
            and (p[:, 0] >= left).all() and (p[:, 0] <= right-1).all()
            and (p[:, 1] >= top).all() and (p[:, 1] <= bottom-1).all())



def anterior_delta(points):
    """Median anterior-minus-posterior x over [anterior, posterior] pairs."""
    pairs = np.asarray(points, np.float64).reshape(-1, 2, 2)
    return float(np.median(pairs[:, 0, 0]-pairs[:, 1, 0]))


def _canonical(points, delta):
    """Reflect a copy to anterior-left for geometric checks; never relabel."""
    p = np.asarray(points, np.float64).copy()
    if delta > 0:
        p[..., 0] *= -1
    return p


def _body_chain(points):
    """Broad geometric rejection of collapsed, reversed, or unordered bodies."""
    bodies = np.asarray(points, np.float64).reshape(-1, 4, 2)
    if not np.isfinite(bodies).all():
        return None
    bodies = _canonical(bodies, anterior_delta(bodies))
    widths = (np.linalg.norm(bodies[:, 1]-bodies[:, 0], axis=1)
              + np.linalg.norm(bodies[:, 3]-bodies[:, 2], axis=1))/2
    heights = bodies[:, 2:, 1].mean(1)-bodies[:, :2, 1].mean(1)
    centres = bodies.mean(1)
    scale = float(np.median(widths))
    if (scale < 3 or (widths < scale*.3).any()
            or (widths > scale*3).any() or (heights < widths*.1).any()
            or (heights > widths*2.5).any() or (np.diff(centres[:, 1]) < scale*.2).any()):
        return None
    # Every body must face the same way as the chain; crossed labels are not fixed.
    if ((bodies[:, 1, 0] <= bodies[:, 0, 0]).any()
            or (bodies[:, 3, 0] <= bodies[:, 2, 0]).any()):
        return None
    polygon = bodies[:, [0, 1, 3, 2], :]
    edges = np.roll(polygon, -1, axis=1)-polygon
    turns = edges[..., 0]*np.roll(edges[..., 1], -1, axis=1)-edges[..., 1]*np.roll(edges[..., 0], -1, axis=1)
    if not ((turns > 1e-6).all(1) | (turns < -1e-6).all(1)).all():
        return None
    return scale


def select_consensus(candidates):
    """Choose an observed medoid, never average incompatible level assignments."""
    if not candidates:
        return None, {"candidates": 0, "support": 0, "status": "not_found"}
    anchors = np.array([c["anchor"] for c in candidates], np.float64)
    scales = np.array([c["scale"] for c in candidates], np.float64)
    distance = np.linalg.norm(anchors[:, None]-anchors[None, :], axis=-1)
    agreement = distance <= CONSENSUS_RADIUS * np.minimum(scales[:, None], scales[None, :])
    if all("points" in candidate for candidate in candidates):
        # Regional measurements now use every retained endplate. Agreement on
        # C7 or S1 alone cannot corroborate inconsistent C2/L1 assignments.
        points = np.asarray([candidate["points"] for candidate in candidates], np.float64)
        regional_distance = np.linalg.norm(points[:, None]-points[None, :], axis=-1).max(axis=-1)
        agreement &= regional_distance <= CONSENSUS_RADIUS * np.minimum(scales[:, None], scales[None, :])
    support = agreement.sum(1)
    order = sorted(range(len(candidates)), key=lambda i: (
        -int(support[i]), float(np.mean(distance[i, agreement[i]])),
        -candidates[i]["score"]))
    best = order[0]
    info = {"candidates": len(candidates), "support": int(support[best]),
            "status": "accepted", "spread_px": float(distance[best, agreement[best]].max())}
    if support[best] < MIN_SUPPORT:
        return None, {**info, "status": "insufficient_agreement"}
    # Similar-sized distant clusters may be different vertebrae. Withhold them.
    rivals = [i for i in order[1:] if not agreement[best, i]
              and support[i] >= max(MIN_SUPPORT, .75*support[best])]
    if rivals:
        return None, {**info, "status": "ambiguous_clusters"}
    return candidates[best], info



def _anatomical_crop_points(session, crop):
    """Use the standalone cervical graph and return crop-pixel anatomical slots."""
    from . import cervical_anatomical as anatomy
    image = crop if crop.dtype == np.uint8 else models._robust_rescale(crop)
    tensor, transform = anatomy.landmark_input(image)
    heat = session.run(None, {"image": tensor})[0]
    points, _ = anatomy.decode_heatmaps(heat)
    # The standing-film contract puts the C2 centroid after its inferior pair.
    return transform.restore(points)[[1, 2, 0] + list(range(3, 23))]



def cervical_windows(box, shape):
    """Square crops around the detector's cervical box, with extra context."""
    height, width = shape
    left, top, right, bottom = box
    side = min(max(right-left, bottom-top)*CERVICAL_CONTEXT, width, height)
    cx, cy = (left+right)/2, (top+bottom)/2
    windows = set()
    for dx, dy, scale in ((0, 0, 1), (-.04, 0, 1.04), (.04, 0, 1.04), (0, .06, 1.04)):
        size = max(32, min(round(side*scale), width, height))
        x0 = round(np.clip(cx+dx*side-size/2, 0, width-size))
        y0 = round(np.clip(cy+dy*side-size/2, 0, height-size))
        windows.add((x0, y0, x0+size, y0+size))
    return sorted(windows)


def _cervical_candidates(raw, box):
    if box is None:
        return [], {"windows": 0, "hrnet_crops": 0, "invalid_outputs": 0, "detector_box": None}
    windows = cervical_windows(box, raw.shape)
    candidates = []
    invalid = 0
    def predict(session):
        nonlocal invalid
        for index, window in enumerate(windows):
            runtime.report("landmarks", "Reading cervical crops", index, len(windows))
            left, top, right, bottom = window
            try:
                points = _anatomical_crop_points(session, raw[top:bottom, left:right]) + (left, top)
            except ValueError:
                invalid += 1
                continue
            if not _inside(points, window):
                continue
            if _body_chain(points[3:]) is None or points[2, 1] >= points[3:7, 1].mean():
                continue
            body = points[19:23]
            c7_scale = float((np.linalg.norm(body[1]-body[0])+np.linalg.norm(body[3]-body[2]))/2)
            candidates.append({"anchor": body.mean(0), "scale": c7_scale,
                               "points": points, "window": window, "score": 1.})
    models._infer("cervical_anatomical_hrnet", predict, "Locating C2–C7 with anatomical HRNET")
    return candidates, {"windows": len(windows), "hrnet_crops": len(windows),
                        "invalid_outputs": invalid, "detector_box": list(box)}


MAX_CERVICAL_CROPS = 12


def cervical_search_windows(height, width):
    """1.6.1's overlapping upper-film windows at several scales, for the fallback neck search."""
    windows = set()
    for fraction in (.18, .28, .40):
        h = max(64, round(height * fraction))
        w = min(width, h)
        ys = np.arange(0, max(1, round(height * .55) - h + 1), max(1, h // 2))
        ys = np.unique(np.append(ys, max(0, min(height-h, round(height*.55)-h))))
        for y in ys:
            for x in np.linspace(0, max(0, width-w), 3):
                left, top = int(round(x)), int(y)
                windows.add((left, top, min(width, left+w), min(height, top+h)))
    return sorted(w for w in windows if w[2]-w[0] >= 32 and w[3]-w[1] >= 32)


def unique_cervical_crops(proposals):
    """Identical source rectangles provide only one spatial observation."""
    chosen = {}
    for proposal in sorted(proposals, key=lambda p: -p["score"]):
        ox, oy = proposal["origin"]
        t = proposal["transform"]
        source_crop = (ox+t.x0, oy+t.y0, ox+t.x1, oy+t.y1)
        if source_crop not in chosen:
            chosen[source_crop] = {**proposal, "source_crop": source_crop}
    return list(chosen.values())


def _searched_cervical_candidates(raw):
    """Search the upper film for the neck as 1.6.1 did: cervical DETR crops, then the anatomical HRNET.

    Used only when the region detector gives no neck box that the crops agree on (some films have a
    neck the detector misses entirely).
    """
    height, width = raw.shape
    windows = cervical_search_windows(height, width)
    proposals = []
    def detect(session):
        for index, window in enumerate(windows):
            runtime.report("search", "Searching upper-spine crops", index, len(windows))
            left, top, right, bottom = window
            crop = raw[top:bottom, left:right]
            crop = crop.copy() if crop.dtype == np.uint8 else models._robust_rescale(crop)
            logits, boxes = session.run(None, cervical.detector_input(crop))
            found = cervical.detection_from_output(logits, boxes, crop.shape, threshold=.2)
            if found is None:
                continue
            prepared = cervical.landmark_input(crop, found["bbox"])
            if prepared is not None:
                tensor, transform = prepared
                proposals.append({"tensor": tensor, "transform": transform, "origin": [left, top],
                                  "window": window, "score": found["score"]})
    models._infer("cervical_detr", detect, "Searching the upper film for the cervical spine")
    selected = unique_cervical_crops(proposals)[:MAX_CERVICAL_CROPS]
    candidates = []
    invalid = 0
    if selected:
        def predict(session):
            nonlocal invalid
            for index, proposal in enumerate(selected):
                runtime.report("landmarks", "Comparing cervical HRNET crops", index, len(selected))
                left, top, right, bottom = proposal["source_crop"]
                try:
                    points = _anatomical_crop_points(session, raw[top:bottom, left:right]) + (left, top)
                except ValueError:
                    invalid += 1
                    continue
                if not _inside(points, proposal["window"]):
                    continue
                if _body_chain(points[3:]) is None or points[2, 1] >= points[3:7, 1].mean():
                    continue
                body = points[19:23]
                c7_scale = float((np.linalg.norm(body[1]-body[0])+np.linalg.norm(body[3]-body[2]))/2)
                candidates.append({"anchor": body.mean(0), "scale": c7_scale, "points": points,
                                   "window": proposal["source_crop"], "score": proposal["score"]})
        models._infer("cervical_anatomical_hrnet", predict, "Locating C2–C7 with anatomical HRNET")
    return candidates, {"windows": len(windows), "detections": len(proposals),
                        "hrnet_crops": len(selected), "invalid_outputs": invalid}


def lumbar_window(box, shape):
    """Frame a detector lumbar box with the BUU-LSPINE margins."""
    height, width = shape
    left, top, right, bottom = box
    h = bottom-top
    return (max(0, int(round(left-LUMBAR_FRAMING["side"]*h))),
            max(0, int(round(top-LUMBAR_FRAMING["top"]*h))),
            min(width, int(round(right+LUMBAR_FRAMING["side"]*h))),
            min(height, int(round(bottom+LUMBAR_FRAMING["bottom"]*h))))


def lumbar_windows(window, shape):
    """Search regional crops with 15% extra superior context for L1."""
    left, top, right, bottom = window
    height, width = shape
    w, h = right-left, bottom-top
    cx, cy = (left+right)/2, (top+bottom)/2
    variants = [(0, 0, 1), (-.06, 0, 1), (.06, 0, 1), (0, -.06, 1),
                (0, .06, 1), (0, 0, .9), (0, 0, 1.1)]
    windows = {framing.clip_window(cx+dx*w, cy+dy*h, w*scale, h*scale, height, width)
               for dx, dy, scale in variants}
    # Extend every candidate before inference and consensus. Keep the sides and
    # inferior boundary fixed; unextended crops can truncate the L1 endplate.
    return sorted({(l, max(0, round(t-.15*(b-t))), r, b) for l, t, r, b in windows})



def _lumbar_candidates(raw, box):
    if box is None:
        return [], {"windows": 0, "hrnet_crops": 0, "detector_box": None, "window": None}
    return _framed_lumbar_candidates(raw, lumbar_window(box, raw.shape), {"detector_box": list(box)})


def _framed_lumbar_candidates(raw, framed, record):
    windows = lumbar_windows(framed, raw.shape)
    prepared = [framing.prepare_crop(raw, window) for window in windows]
    detections = models._score_s1([canvas for canvas, _ in prepared])
    proposals = []
    for window, (canvas, transform), (score, detected) in zip(windows, prepared, detections):
        if detected is None or score < .5:
            continue
        detected_source = transform.restore_points(detected)
        if _inside(detected_source, window):
            proposals.append((window, canvas, transform, score, detected_source))
    candidates = []
    if proposals:
        def predict(session):
            for index, (window, canvas, transform, score, detected) in enumerate(proposals):
                runtime.report("landmarks", "Comparing lumbar HRNET crops", index, len(proposals))
                points = session.run(None, {"image": models._segmentation_input(canvas)})[0][0]
                if points.shape != (22, 2) or not np.isfinite(points).all():
                    continue
                points = transform.restore_points(points)
                if not _inside(points, window):
                    continue
                body_scale = _body_chain(points[:20])
                if body_scale is None:
                    continue
                # Keypoint identities are anatomical [anterior, posterior]. S1
                # and the independent S1 detector must face the lumbar chain.
                delta = anterior_delta(points[:20])
                endplate = points[20:22]
                facing, found = _canonical(endplate, delta), _canonical(detected, delta)
                scale = float(np.linalg.norm(endplate[1]-endplate[0]))
                if (scale < 3 or not .5 < scale/body_scale < 2.5
                        or facing[1, 0] <= facing[0, 0] or found[1, 0] <= found[0, 0]
                        or endplate[:, 1].mean() <= points[16:20, 1].mean()):
                    continue
                discrepancy = float(np.linalg.norm(endplate-detected, axis=1).max()/scale)
                if discrepancy > .75:
                    continue
                candidates.append({"anchor": endplate[1], "scale": scale,
                                   "points": points, "endplate": endplate,
                                   "window": window, "score": float(score),
                                   "detector_disagreement_widths": discrepancy})
        models._infer("hrnet", predict, "Locating L1–S1 with HRNET")
    return candidates, {"windows": len(windows), "hrnet_crops": len(proposals), **record, "window": list(framed)}


def _femoral_region(raw, pelvis):
    """Read the heads without treating the lumbar crop boundary as anatomy.

    Consensus chooses a crop for vertebral landmarks. That crop can bisect a
    head even when the source radiograph contains it in full. Expand only the
    sides reached by the predicted mask, with at most two additional passes.
    Remaining crop truncation must request review just like a source-frame cut.
    """
    try:
        from ..utils import _femoral_geometry, EDGE_TOUCH_MAX_CONFIDENCE
    except ImportError:
        from utils import _femoral_geometry, EDGE_TOUCH_MAX_CONFIDENCE
    if pelvis is None:
        return np.zeros(raw.shape, np.uint8), [], {
            "qc_pass": False, "reason": "No consistent lumbar crop was established."}
    initial = tuple(pelvis["window"])
    window = initial
    height, width = raw.shape
    for attempt in range(3):
        left, top, right, bottom = window
        _, transform = framing.prepare_crop(raw, window)
        probability = models._femoral_probabilities(raw[top:bottom, left:right])
        mask = models._restore_femoral_mask(probability, transform, raw.shape)
        touches = [bool(mask[top:bottom, left].any()), bool(mask[top, left:right].any()),
                   bool(mask[top:bottom, right-1].any()), bool(mask[bottom-1, left:right].any())]
        dx, dy = max(1, round((right-left) * .25)), max(1, round((bottom-top) * .25))
        expanded = (max(0, left-dx) if touches[0] else left,
                    max(0, top-dy) if touches[1] else top,
                    min(width, right+dx) if touches[2] else right,
                    min(height, bottom+dy) if touches[3] else bottom)
        if expanded == window or attempt == 2:
            break
        runtime.report("femoral", "Extending the crop to include the femoral heads")
        window = expanded
    crop_qc = {"initial_crop_window": list(initial), "crop_window": list(window),
               "crop_expansions": attempt, "touches_crop_edge": any(touches)}
    try:
        _, circles, qc = _femoral_geometry(mask)
        if any(touches):
            qc["confidence"] = min(qc["confidence"], EDGE_TOUCH_MAX_CONFIDENCE)
        return mask, [np.asarray(circle).tolist() for circle in circles] if qc.get("qc_pass") else [], {**qc, **crop_qc}
    except ValueError as error:
        return mask, [], {"qc_pass": False, "confidence": None, "reason": str(error), **crop_qc}



# The femoral U-Net's starting crop in S1 endplate lengths, measured on the
# 1.6.1 windows of 94 unclipped reader films (median height 10.7, width 6.2,
# S1 midpoint 67.5% down and, facing left, 61% across). _femoral_region grows
# it toward any side the mask reaches.
FEMORAL_FRAME = {"height": 10.7, "width": 6.2, "x": .61, "y": .675}


def _femoral_frame(pelvis, shape):
    """Frame the femoral crop from S1, not from the detector-framed lumbar window.

    Starting crops larger than the ones 1.6.1 used shrink the heads and move
    their fitted centres, which shows up in PT and PI. ``pelvis`` is canonical
    (anterior to the left).
    """
    if pelvis is None:
        return None
    endplate = np.asarray(pelvis["endplate"], np.float64)
    length = float(np.linalg.norm(endplate[1]-endplate[0]))
    if not np.isfinite(length) or length < framing.MIN_ENDPLATE_PX:
        return pelvis
    mx, my = endplate.mean(0)
    w, h = FEMORAL_FRAME["width"]*length, FEMORAL_FRAME["height"]*length
    window = framing.clip_window(mx+(.5-FEMORAL_FRAME["x"])*w, my+(.5-FEMORAL_FRAME["y"])*h,
                                 w, h, *shape)
    return {**pelvis, "window": window}


def landmark_side(neck, pelvis):
    """The anterior image side the landmark models labelled, and whether they agree."""
    sides = {}
    if neck is not None:
        sides["cervical"] = anterior_delta(np.asarray(neck["points"])[3:])
    if pelvis is not None:
        sides["lumbar"] = anterior_delta(np.asarray(pelvis["points"])[:22])
    named = {region: "right" if delta > 0 else "left" for region, delta in sides.items() if delta}
    if not named:
        return None, {"source": "landmarks", "regions": named, "agree": None}
    # The lumbar chain and S1 carry the signed pelvic and global measurements.
    side = named.get("lumbar", named.get("cervical"))
    return side, {"source": "landmarks", "regions": named, "agree": len(set(named.values())) == 1}


def _read_regions(image, regions):
    """Run both regional models once around the detector's boxes."""
    neck_candidates, neck_search = _cervical_candidates(image, regions.get("cervical"))
    neck, neck_qc = select_consensus(neck_candidates)
    if neck is None:
        # No neck box, or its crops disagree: search the upper film as 1.6.1 did.
        searched, search_qc = _searched_cervical_candidates(image)
        found, found_qc = select_consensus(searched)
        neck_search = {**neck_search, "fallback_search": search_qc}
        if found is not None:
            neck, neck_qc = found, {**found_qc, "source": "upper_film_search"}
    if regions.get("lumbar_frame") is not None:
        # A marked S1 endplate frames the lumbar crop directly.
        pelvis_candidates, pelvis_search = _framed_lumbar_candidates(
            image, tuple(regions["lumbar_frame"]), {"detector_box": None, "source": "s1_mark"})
    else:
        pelvis_candidates, pelvis_search = _lumbar_candidates(image, regions.get("lumbar"))
    pelvis, pelvis_qc = select_consensus(pelvis_candidates)
    if pelvis is None:
        # Likewise the lumbar region: frame it with 1.6.1's S1 localizer search instead.
        located = framing.locate(image, models._score_s1)
        if located is not None:
            searched, search_qc = _framed_lumbar_candidates(image, tuple(located["window"]),
                                                            {"detector_box": None, "source": "s1_localizer"})
            found, found_qc = select_consensus(searched)
            pelvis_search = {**pelvis_search, "fallback_search": search_qc}
            if found is not None:
                pelvis, pelvis_qc = found, {**found_qc, "source": "s1_localizer_search"}
    if neck is not None and pelvis is not None:
        if pelvis["anchor"][1]-neck["anchor"][1] <= 2*max(neck["scale"], pelvis["scale"]):
            neck, neck_qc = None, {**neck_qc, "status": "incompatible_region_order"}
    return neck, neck_qc, neck_search, pelvis, pelvis_qc, pelvis_search


def _mirror_box(box, width):
    return None if box is None else (width-box[2], box[1], width-box[0], box[3])


def _mirror_points(points, width):
    p = np.asarray(points, np.float64).copy()
    p[..., 0] = width-1-p[..., 0]
    return p


def _mirror_candidate(candidate, width):
    """Reflect a candidate's coordinates; anatomical identities never change."""
    if candidate is None:
        return None
    return {**candidate, **{key: _mirror_points(candidate[key], width)
                            for key in ("anchor", "points", "endplate") if key in candidate},
            "window": _mirror_box(candidate["window"], width)}


def full_spine_prediction(pixel_array, anterior_side=None, model=MODEL_NAME, *, regions=None):
    """Source-coordinate standing-film anatomy from one detector pass.

    ``regions`` is this film's detector output, already computed while routing
    it; it is never user-supplied anatomy. The landmark models label the
    anterior side themselves. They are most accurate with anterior on the left,
    the orientation the training films were mostly read in, so a film whose
    landmarks face right is mirrored once and read again, and every point is
    returned in the original film's coordinates. A selected ``anterior_side``
    chooses that frame directly.
    """
    if anterior_side in ("", "auto"):
        anterior_side = None
    if anterior_side not in (None, "left", "right"):
        raise ValueError("The anterior image side must be auto, left or right")
    if model != MODEL_NAME:
        raise ValueError("The available full-spine model is dual_hrnet")
    raw = np.asarray(pixel_array)
    if (raw.ndim != 2 or not raw.size or not np.issubdtype(raw.dtype, np.number)
            or not np.isfinite(raw).all()):
        raise ValueError("pixel_array must contain finite two-dimensional grayscale pixels")
    runtime.report("preparing", "Preparing the full-spine radiograph")
    height, width = raw.shape
    if regions is None:
        # Full spine was chosen, not detected: both regions are on the film, so
        # take each class's best box instead of applying Auto's presence gate.
        regions = learned_region.regions(raw, present_score=0)
    first = None
    if anterior_side is None:
        first = _read_regions(raw, regions)
        inferred, first_orientation = landmark_side(first[0], first[3])
    frame_side = anterior_side or inferred
    mirrored = frame_side == "right"
    if mirrored:
        runtime.report("orientation", "Reading the regions with anterior on the left")
        canonical = np.ascontiguousarray(raw[:, ::-1])
        flipped = {name: _mirror_box(regions.get(name), width) for name in ("cervical", "lumbar", "lumbar_frame")}
        neck, neck_qc, neck_search, pelvis, pelvis_qc, pelvis_search = _read_regions(canonical, flipped)
        neck, pelvis = _mirror_candidate(neck, width), _mirror_candidate(pelvis, width)
        if neck is None and pelvis is None and first is not None:
            # Nothing agreed in the left-facing frame; keep the original read.
            mirrored, canonical = False, raw
            neck, neck_qc, neck_search, pelvis, pelvis_qc, pelvis_search = first
    else:
        canonical = raw
        neck, neck_qc, neck_search, pelvis, pelvis_qc, pelvis_search = first or _read_regions(raw, regions)
    inferred, orientation = landmark_side(neck, pelvis)
    if first is not None:
        orientation["first_read"] = first_orientation["regions"]
    warnings = ["Review C7 identity, the S1 posterior corner, image orientation and calibration before accepting global SVA."]
    if anterior_side is None:
        anterior_side = inferred
        orientation["status"] = "landmarks" if inferred else "unavailable"
    else:
        orientation = {**orientation, "status": "user_selected", "anterior_side": anterior_side}
        if inferred and inferred != anterior_side:
            warnings.append("Selected anterior side disagrees with the anatomical landmarks; review orientation before using signed measurements.")
    orientation["anterior_side"] = anterior_side
    if orientation.get("agree") is False:
        warnings.append("Cervical and lumbar landmarks face opposite directions; review orientation and both regions.")
    if neck is None:
        warnings.append("C7 centroid was not established consistently across crops; global SVA is unavailable.")
    if pelvis is None:
        warnings.append("S1 posterior corner was not established consistently across crops; global SVA is unavailable.")
    if anterior_side is None:
        raise ValueError("No cervical or lumbar landmarks were found on this film. Choose cervical, lumbar or full spine, then segment again.")
    geometry = {"region": "full_spine", "anterior_side": anterior_side,
                "c2_centroid": None,
                "c7_centroid": None if neck is None else np.asarray(neck["anchor"]).tolist(),
                "s1_superior": None if pelvis is None else np.asarray(pelvis["endplate"]).tolist(),
                "vertebrae": {}}
    if neck is not None:
        # Points are already anatomical [anterior, posterior]; "left" keeps that order.
        cervical_geometry = cervical.landmark_contract(neck["points"], "left")
        geometry["c2_centroid"] = cervical_geometry["c2_centroid"]
        geometry["vertebrae"].update(cervical_geometry["vertebrae"])
    if pelvis is not None:
        p = np.asarray(pelvis["points"][:20], np.float64).reshape(5, 4, 2)
        for level, body in zip(range(1, 6), p):
            geometry["vertebrae"][f"L{level}"] = {
                "superior": body[:2].tolist(), "inferior": body[2:].tolist(),
                "quadrilateral": body[[0, 1, 3, 2]].tolist()}
    femoral_mask, circles, femoral_qc = _femoral_region(
        canonical, _femoral_frame(_mirror_candidate(pelvis, width) if mirrored else pelvis, raw.shape))
    if mirrored:
        femoral_mask = np.ascontiguousarray(femoral_mask[:, ::-1])
        circles = [[width-1-circle[0], *circle[1:]] for circle in circles]
        for key in ("initial_crop_window", "crop_window"):
            if key in femoral_qc:
                femoral_qc[key] = list(_mirror_box(femoral_qc[key], width))
    if any(len(circle) != 3 or not np.isfinite(circle).all()
           or not (0 <= circle[0] < width and 0 <= circle[1] < height)
           or circle[2] <= 0 for circle in circles):
        # An extrapolated circle is not a measured head center. Preserve the
        # observed mask and spine landmarks without passing invalid optional
        # geometry to measurement validation or clipping it onto the border.
        circles = []
        femoral_qc = {**femoral_qc, "qc_pass": False,
                      "reason": "Fitted femoral head center falls outside the image or is invalid."}
    geometry["femoral_circles"] = [list(map(float, circle)) for circle in circles]
    if not femoral_qc["qc_pass"]:
        warnings.append("Femoral heads were not established reliably; PI, PT and L1PA are unavailable.")
    elif femoral_qc.get("touches_crop_edge"):
        warnings.append("The femoral mask reaches its crop boundary; review the head circles and pelvic measurements.")
    window = lambda candidate: None if candidate is None else list(candidate["window"])
    return {"image": raw.copy() if raw.dtype == np.uint8 else models._robust_rescale(raw),
            "mask": np.zeros(raw.shape, np.uint8), "femoral_mask": femoral_mask,
            "landmarks": geometry,
            "models": {"vertebrae": MODEL_NAME, "cervical": "cervical_anatomical_hrnet", "lumbar": "hrnet",
                       "detector": "region_detector+s1", "femoral": "unet"},
            "framing": {"coordinate_space": "original_image", "canonical_mirror": mirrored,
                        "region_sources": regions.get("_sources") or {
                            name: "detector" if regions.get(name) is not None else None for name in ("cervical", "lumbar")},
                        "cervical_window": window(neck), "lumbar_window": window(pelvis),
                        "cervical": {**neck_search, **neck_qc}, "lumbar": {**pelvis_search, **pelvis_qc},
                        "orientation": orientation, "femoral": femoral_qc},
            "warnings": warnings,
            "provenance": {"reference_landmarks_used": False, "segmentation_available": False,
                           "c7_centroid_method": "mean_of_four_body_corners",
                           "s1_source": "lumbar_hrnet", "vertical_reference": "image_vertical",
                           "anterior_side_source": orientation["status"]}}
