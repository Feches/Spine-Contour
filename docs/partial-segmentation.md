# Partial segmentation

The result no longer requires all five lumbar bodies, S1 and the femoral heads.
Model class identities are retained: an isolated L3 stays L3. No missing level is
filled by interpolation or renumbering.

| Output | Required anatomy |
| --- | --- |
| Vertebral overlay and editable landmarks | The detected body |
| Sacral slope | S1 superior endplate |
| LL L1–S1 … L5–S1 | That level's superior endplate and S1 |
| Pelvic incidence / tilt | S1 and a usable hip axis |
| L1 pelvic angle | L1 center, S1 and a usable hip axis |
| Disc midpoint height | Adjacent facing endplates and per-image calibration |
| Anterior/posterior disc height | The above plus known A/P ordering |

`geometry.vertebrae` contains only available bodies. Absent S1, L1 center and hip
midpoint are `null`; an unavailable femoral fit is `[]`. Angular keys remain present
with JSON `null` when their dependencies are absent. `/measure` accepts this same
partial shape, validates every supplied structure and recalculates coverage. Malformed
edits are rejected rather than silently deleting anatomy. No usable anatomy at all
remains an error.

The existing femoral fitter still rejects implausible fits; its failure becomes
`qc.femoral.reason` with `qc_pass: false`. `qc.coverage` records available and missing
structures and makes the study **Needs review**. The batch regards a saved partial
result as completed and proceeds. To retry it, open the study and rerun segmentation.

S1-based crop location is optional. If it fails, or the selected crop loses S1,
the image extent is used. Broad near-black screenshot margins are trimmed only when
the discarded strips are at least 95% near-black; small margins and sparse/empty
content retain the full image. Crop transforms restore masks and landmarks to the
original image, and calibration continues to use its original bytes.
HRNet always regresses all landmark slots, so its levels
now require U-Net body-mask evidence and a finite, convex, nondegenerate quadrilateral
inside the film. This adds a U-Net inference pass when HRNet is selected and can
withhold a real level that U-Net missed. It is a conservative presence check, not a
calibrated confidence estimate.

U-Net derives A/P identity from S1. When S1 is absent, its endplates use stable
image-coordinate ordering with `anterior_confirmed: false`. Their edit handles use
neutral upper/lower endpoint labels. Midpoint distances remain valid; anterior and
posterior disc heights are withheld. That flag survives correction and persistence.
HRNet provides anatomically named corners, subject to the presence check above.

Tests: `python -m pytest backend/tests -q`, `node --test test/*.test.js`, and
`node tools/smoke/smoke-partial-segmentation.mjs` against a scratch-profile app started
with `tools/smoke/launch.mjs`. Optional local image paths on the smoke command run
the production batch and record results under ignored `tools/smoke/out/`.
The deterministic geometry cases validate software behavior, not anatomy. No images
or screenshots are added to the PR.
