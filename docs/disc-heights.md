# Calibrated disc heights

The Measurements panel and both CSV exports report anterior, middle and posterior
heights for L1–L2, L2–L3, L3–L4, L4–L5 and L5–S1 in millimetres.

## Definition

For each disc, use the **inferior endplate of the upper vertebra** and the
**superior endplate of the lower vertebra**. At L5–S1 the lower endplate is
`geometry.s1_superior`. The backend names both endplates anatomically as
`[anterior, posterior]`; screen-left is not assumed to be anterior.

| Height | Upper endpoint | Lower endpoint |
| --- | --- | --- |
| Anterior | Upper vertebra's inferior anterior keypoint | Lower vertebra's superior anterior keypoint |
| Middle | Midpoint of the upper vertebra's inferior anterior/posterior keypoints | Midpoint of the lower vertebra's superior anterior/posterior keypoints |
| Posterior | Upper vertebra's inferior posterior keypoint | Lower vertebra's superior posterior keypoint |

Each height is the Euclidean distance between those points:

`height_mm = hypot((lower_x - upper_x) * column_mm, (lower_y - upper_y) * row_mm)`

The points use original-image coordinates. Printed/manual rulers normally supply
equal row and column spacing; DICOM spacing can differ and both axes are applied.
The middle height is the **distance between the two midpoints**, not the average
of anterior and posterior heights. These are point-to-point distances, not
perpendicular projections onto an endplate.

## Missing data and corrections

Both facing endplates must contain two distinct, finite keypoints within the
calibrated image dimensions. Missing or malformed endplates leave that disc's
three values absent. Missing, ambiguous, conflicting, cleared or invalid
calibration leaves all heights absent. The panel displays `—`; CSV cells are empty.
A measured zero gap is retained as zero. No physical scale is inferred from anatomy.

Heights are derived from the current stored geometry and normalized per-study
calibration whenever displayed or exported. There is no separate persisted height
cache to invalidate. Landmark edits, resets and scale corrections therefore update
the heights, including after disk reload. When combined with the accuracy-safeguards
PR, the panel hides disc heights during a pending landmark correction and exports
use the last complete saved geometry/measurement pair.

## Export schema

Both CSV formats always include 15 new columns after the ten existing angular
measurements and before clinical fields. Examples:

- `Disc height L1-L2 anterior (mm)`
- `Disc height L1-L2 middle (mm)`
- `Disc height L1-L2 posterior (mm)`

The order is L1–L2 through L5–S1, with anterior, middle, posterior at each level.
Values are written to one decimal, matching the panel. Scripts that read columns by
position need to account for these additional fields; header names are preferred.

Paired CSV uses the existing measurement-major layout, with visit suffixes such as
`Disc height L1-L2 anterior (mm) Pre-op` and `Delta Disc height L1-L2 anterior (mm) Post-op`.
Each film uses its own calibration. Deltas are later minus pre-op using the written
one-decimal values, following the existing `delta1` rule. If either value is absent,
its delta is empty. Calibration metadata remains appended per film.

## Verification

- `npm test`: 449 tests passed. Coverage includes all five levels, anatomical
  ordering under horizontal mirroring, midpoint geometry, oblique distances,
  anisotropic spacing, automatic/manual calibration, corrections, malformed or
  missing inputs, measured zero, ordinary CSV and paired values/deltas.
- `CDP_PORT=9351 node tools/smoke/smoke-disc-heights.mjs`: 13 checks passed in
  source Electron against a scratch profile. Exercises the real `/measure`
  endpoint and a landmark drag, reset, manual calibration correction, disk reload,
  ordinary/paired CSV, pending corrections, clearing calibration, compact layout
  and the renderer console.

- Full backend regression suite: 96 tests passed.
- Clean merge with accuracy PR #3 at `8db3d63`: 457 renderer tests and the same
  13 disc-height Electron checks passed on the combined tree.

These checks verify geometry arithmetic, data flow and UI behavior. They do not
establish anatomical landmark accuracy or compensate for unknown radiographic
magnification. A newly packaged installer has not been tested with this addition.
