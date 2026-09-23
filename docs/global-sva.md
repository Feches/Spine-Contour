# Global C7–S1 sagittal vertical axis

Select **Full spine · HRNET** for a study, or assign **Full spine** to a workspace
folder. Use a lateral radiograph showing both C7 and S1. The original-image preview
is available before processing; explicitly choose whether anterior is on image
left or image right. The cervical workflow remains separate and continues to
measure C2–C7 Cobb and C2–C7 SVA.

Global SVA is the horizontal displacement of the **C7 body centroid** from the
**S1 superior-posterior corner**. Positive values indicate anterior displacement.
The reference vertical follows the acquired image; the app does not rotate the
film to make the spine upright. The overlay shows the C7 plumb line and its
horizontal distance to the posterior S1 corner.

Review C7 identity, its body centroid, and both S1 superior-endplate corners. In
edit mode, drag those three handles or use Tab and the arrow keys. Corrections
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

Prediction requests use `bodyPart: 'full_spine'`, `models.vertebrae: 'dual_hrnet'`
and an explicit `anteriorSide`. Geometry uses `region: 'full_spine'`,
`anterior_side`, `c7_centroid`, and `s1_superior` ordered anterior then posterior.
Landmarks remain in original-image coordinates with source dimensions and digest.
Measurements use `GLOBAL_SVA_PX` and `GLOBAL_SVA_MM`.

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
