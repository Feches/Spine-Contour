# Global C7–S1 sagittal vertical axis

Use **Auto detect** or select **Full spine · HRNET** for a study; workspace folders
offer the same choices. Use a lateral radiograph showing both C7 and S1. The
original-image preview is available before processing. Orientation defaults to
automatic comparison of anterior-left and anterior-right hypotheses. If the
evidence cannot distinguish them, select a side manually and retry. An explicit
left/right choice always overrides detection; no rotation is applied.

Standing-film results include the available C2–C7 Cobb and SVA, lumbar lordosis,
sacral slope, pelvic incidence, pelvic tilt, L1 pelvic angle and derived disc
heights alongside global SVA. Measurements use the same regional definitions as
the cervical and lumbar workflows. Missing regional landmarks leave only the
dependent measurements unavailable. In particular, PI/PT/L1PA require reliable
femoral geometry; the existing femoral model and fitting checks run in the
accepted lumbar crop.

Global SVA is the horizontal displacement of the **C7 body centroid** from the
**S1 superior-posterior corner**. Positive values indicate anterior displacement.
The reference vertical follows the acquired image; the app does not rotate the
film to make the spine upright. The overlay shows the C7 plumb line and its
horizontal distance to the posterior S1 corner.

Review C7 identity, its body centroid, and both S1 superior-endplate corners. In
edit mode, drag those handles or the regional endplate and femoral handles, or use
Tab and the arrow keys. Moving a C7 body corner updates its centroid; the centroid
can also be corrected directly. Corrections
recalculate the result and are saved with the study. Reset restores the original
prediction. Missing landmarks leave the measurement unavailable; no replacement
landmark is invented.

SVA is shown in millimetres only with a valid calibration bound to the source
image. Otherwise the row explicitly shows pixels and is marked uncalibrated.
Only the column pixel spacing converts this horizontal distance. Changing or
clearing the image scale immediately updates the displayed and exported values;
old prediction spacing cannot override the current calibration.

The Parameters table and both single-study and paired CSV exports include separate
**C7–S1 SVA (mm)** and **C7–S1 SVA (px)** columns. Cervical values retain their own
columns. An unavailable millimetre value is blank, never inferred from pixels.

## Integration contract

Explicit full-spine prediction requests use `bodyPart: 'full_spine'` and
`models.vertebrae: 'dual_hrnet'`; `anteriorSide` can be omitted/`auto`, `left` or
`right`. Automatic region requests use `bodyPart: 'auto'` without model overrides.
Geometry uses the resolved `region: 'full_spine'`,
`anterior_side`, `c7_centroid`, and `s1_superior` ordered anterior then posterior.
Landmarks remain in original-image coordinates with source dimensions and digest.
Geometry also retains `c2_centroid`, C2–C7 and L1–L5 entries in `vertebrae`, and
available `femoral_circles`, `hip_midpoint` and `l1_center`. Measurements include
`GLOBAL_SVA_PX`/`GLOBAL_SVA_MM`, `C2C7_*`, `LL`, `SS`, `PI`, `PT` and `L1PA`.
The same combined contract is used by `/measure`, persistence and export.

The upper-image search runs cervical DETR and HRNET over overlapping crops. The
lower-image search uses the sliding S1 localizer and lumbar HRNET over translated
and scaled crops. Repeated source crops are deduplicated, and agreement selects
an observed medoid candidate rather than averaging landmark positions. Missing
anchors or competing candidate clusters are withheld for review. C7's centroid
is calculated as the mean of its four predicted body corners; it is not a direct
centroid-model output. The S1 HRNET endpoints require independent detector
corroboration. These checks describe how candidate landmarks are selected; they
are not accuracy estimates.

Synthetic tests cover signed distances, mirrored anatomy, missing anchors,
calibration changes, editable handles and constructions, persistence, source and
orientation guards, workspace/batch setup, and single/paired exports. These tests
verify software behavior rather than clinical accuracy.

Run `node --test test/global-sva.test.js` for the synthetic data tests. Run
`node tools/smoke/smoke-global-sva.mjs` for the live desktop check. The latter starts
its own scratch Electron profile, generates a clearly labelled canvas fixture,
and sends explicit geometry to the measurement endpoint. It does not run model
inference. Screenshots and results are written only to the ignored
`tools/smoke/out/global-sva/` directory, and the scratch app closes on completion.
