# Segmental lordosis and angulation

Implements [issue #15](https://github.com/Feches/Spine-Contour/issues/15) for cervical,
lumbar, and full-spine studies. The Measurements panel lists both angles at each
adjacent level: C2–C3 through C6–C7 and L1–L2 through L5–S1. Select a row to highlight
the two measured endplates and their extensions on the source radiograph.

- **Segmental lordosis:** superior endplate of the upper vertebra to superior
  endplate of the lower vertebra (for example, L4 superior to L5 superior).
- **Segmental angulation:** inferior endplate of the upper vertebra to superior
  endplate of the lower vertebra (the disc angle, for example L4 inferior to L5 superior).
- L5–S1 uses the sacral superior endplate for the lower line.

Values follow the existing LL/Cobb convention: unsigned acute angles (0–90°),
without a lordosis/kyphosis sign. Current image-bound calibration supplies row and
column spacing, including anisotropic pixels. Without it, angles use image
coordinates. A cleared calibration does not reuse a prediction's old spacing.

Each value requires its own two valid, nonzero endplates. Missing or invalid
endplates yield an em dash in the panel/table and an empty CSV cell. The current
cervical HRNET does not predict the C2 superior endplate, so **C2–C3 lordosis is
unavailable with that model**; C2–C3 disc angulation remains measurable. No missing
landmark is inferred from another level or replaced with zero.

All available cervical endplate corners can be edited. Results derive from saved
geometry, so edits, reset to prediction, calibration corrections, and reloads use
the same computation. The panel suppresses values while a correction is pending.
The Parameters table, ordinary CSV, and paired CSV include both measurements;
paired exports include the follow-up-minus-pre-op change.

## Validation

`npm test` covers the two definitions in both regions, missing/invalid inputs,
endpoint reversal and image reflection, L5–S1, full-spine coverage, anisotropic
calibration and clearing, geometry changes, and CSV/paired deltas. Analytic geometry
fixtures test arithmetic only; they are not segmentation validation.

For a scratch-profile Electron integration check with actual inference:

```sh
CDP_PORT=9335 SPINE_CONTOUR_PYTHON=/path/to/venv/bin/python node tools/smoke/launch.mjs
CDP_PORT=9335 node tools/smoke/smoke-segmental.mjs /path/to/cervical.png /path/to/lumbar.png
```

The cervical input must face anterior left. The smoke check saves source-based
screenshots and inference geometry to ignored `tools/smoke/out/segmental`, checks
both constructions, edits a real predicted endplate through `/measure`, and checks
reload persistence. Visual review is required; this is an integration check, not
a clinical accuracy benchmark.

Validated on 2026-09-28 with a real CSXA cervical radiograph and a BUU lateral
lumbar radiograph using the existing cervical HRNET and lumbar U-Net models.
All 580 JavaScript tests passed. Real inference yielded 9/10 cervical and 10/10
lumbar values; the cervical exception was the expected missing C2 superior
endplate. Both constructions were visually inspected on each source image.
Endplate corrections through `/measure` and reload persistence passed for both
regions, with no renderer errors. Cervical landmark review remains required,
as flagged by the existing app; this check does not establish measurement accuracy.
