"""Conservative bottom PACS toolbar detection without model inference.

Only a thin, edge-attached panel with a strong horizontal boundary, a mostly
uniform background and distributed small components is removed. Cropping only
the bottom preserves the original x/y origin and pixel spacing. Source files and
the original calibration image are never modified.
"""
import cv2
import numpy as np


def remove_bottom_toolbar(image):
    height, width = image.shape
    details = {"enabled": True, "status": "not_found", "removed_bottom_px": 0,
               "source_size": [int(width), int(height)], "window": [0, 0, int(width), int(height)]}
    # These thresholds describe 8-bit screenshots, not native detector values.
    # Do not normalize a DICOM/16-bit film merely to make it match UI heuristics.
    if image.dtype != np.uint8 or min(height, width) < 128:
        details["status"] = "unsupported_image"
        return image, details
    start = max(128, height - min(160, round(height * .12)))
    if height - start < 6:
        return image, details
    outer = image[start - 1:]
    coverage = (cv2.absdiff(outer[1:], outer[:-1]) > 24).mean(axis=1)
    for offset in np.flatnonzero(coverage >= .65):
        bottom = start + int(offset)
        band = image[bottom:]
        thickness = height - bottom
        if not 6 <= thickness <= height * .12:
            continue
        background = np.median(band, axis=1).astype(np.int16)[:, None]
        difference = np.abs(band.astype(np.int16) - background)
        # The panel must start with flat rows. An overall flatness score alone
        # can absorb noisy anatomy immediately above an otherwise valid toolbar.
        if np.min((difference[:3] <= 20).mean(axis=1)) < .80:
            continue
        flat_fraction = float((difference <= 20).mean())
        if flat_fraction < .65:
            continue
        ink = (difference > 45).astype(np.uint8)
        _, _, stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
        positions = []
        for x, _, w, h, area in stats[1:]:
            if (2 <= w <= thickness * 2 and 3 <= h < thickness * .9
                    and 4 <= area < thickness ** 2):
                positions.append(int(x))
        if len(positions) < 4 or max(positions) - min(positions) < width * .35:
            continue
        details.update(status="removed", removed_bottom_px=thickness,
                       window=[0, 0, int(width), bottom],
                       boundary_coverage=float(coverage[offset]),
                       flat_fraction=flat_fraction, small_components=len(positions))
        return image[:bottom], details
    return image, details
