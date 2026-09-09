# Measurement accuracy safeguards

This change addresses four failure cases in Cody's batch/studies branch.

| Case | Result |
| --- | --- |
| Weak S1 detection with a good femoral fit | The study reads **Needs review**, with an S1 warning in Analysis. A weak crop-search score also requests review. |
| Close during a landmark correction | The last successfully measured geometry and measurements remain saved together. The pending edit is a session-only preview. |
| AP, oblique, combined or unspecified view label | Batch selection excludes it and explains why. The driver and single-film run validate the view again before inference. |
| 16-bit PNG/TIFF or float TIFF | Native grayscale intensities reach model preprocessing without being clipped to 8-bit white. |

The S1/search review threshold is 0.6, inclusive at the boundary. It is a review policy,
not a calibrated probability that a measurement is correct. Invalid/missing S1 scores
inside a framing record also require review. Legacy records without framing metadata
keep their existing behavior. Review warnings do not certify anatomical correctness.

During a correction, Analysis shows **Updating measurements…** and hides numeric
values until recalculation finishes. Repeated nudges build on the preview. Success
saves both fields in one store update; failure removes the preview and retains the
previous pair. Reset, prediction replacement and deletion cancel pending edits for
the affected study. A metadata save during recalculation cannot persist mismatched
geometry and measurements. Table exports use the last complete pair; the Analysis
export button is disabled while its correction is pending.

View validation uses the study's label. It does not inspect the image to detect an AP
image incorrectly labelled lateral. Standing, supine, prone, flexion and extension
lateral positions remain supported, as do existing generic lateral labels.

## Verification

```sh
npm test
/path/to/python -m pytest backend/tests -q
```

On a scratch Electron profile with the backend running:

```sh
CDP_PORT=9350 node tools/smoke/smoke-studies.mjs
CDP_PORT=9350 node tools/smoke/smoke-accuracy.mjs
```

`smoke-accuracy.mjs` creates a synthetic image and geometry. It checks visible S1
warnings, pending-edit rendering, actual disk saves before and after recalculation,
failure recovery, batch exclusions and the single-film refusal. Screenshots and
results are written to `tools/smoke/out/accuracy/`. This fixture tests application
behavior, not model accuracy on radiographs. The existing landmark editing smoke
suites also exercise real backend recalculation, dragging, keyboard nudges and reset.

These safeguards are bundled with automatic calibration and calibrated disc-height
exports in the v0.2.0 preview. Unequal pixel-spacing angle correction and slip
calculations remain separate work. See [release notes](releases/0.2.0.md).
