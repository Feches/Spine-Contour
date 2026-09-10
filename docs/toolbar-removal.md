# Toolbar removal

Settings → Processing → Toolbar removal is an opt-in, saved boolean independent
of Crop localizer and resource mode. It applies to future predictions, including
each batch item; controls are disabled while a prediction or batch is running.
The default is Off, including preference files from earlier versions.

## Detector

`backend/toolbar.py` checks only 8-bit grayscale screenshots at least 128 pixels
on each side. Native higher-precision arrays and decoded DICOM floats are skipped.
No neural model, OCR invocation, image resize or new dependency is needed.

The detector scans the bottom 12% of rows, capped at 160, retaining at least 128
rows above any crop. A boundary must change brightness by more than 24/255 across
at least 65% of the width. Its panel must be 6 pixels to 12% of the image height.
Each of the first three panel rows must have at least 80% of pixels within 20 of
that row's median; at least 65% of all panel pixels must satisfy the same tolerance.
This starting-row guard prevents a valid toolbar from pulling textured anatomy
above it into the crop.

Pixels differing from their row median by more than 45 form a binary mask.
OpenCV connected components identify candidate glyph/button shapes. With panel
height b, component width must be 2..2b, height 3..<0.9b, and area 4..<b². At least
four components must span 35% of the image width by their left-edge positions.
The first boundary meeting every condition is selected; otherwise nothing is cut.
These are conservative heuristics, not a probability or a universal PACS detector.

## Coordinates and persistence

Cleanup happens once before framing/search, intensity normalization and model
inference. Only bottom rows are removed, so every retained pixel keeps its source
x/y coordinates. The result image and masks share the cleaned dimensions.
Calibration still reads/caches the original upload bytes, original dimensions and
source hash; manually reviewed references remain valid. The original file is never
written. Top/left crops would require additional coordinate handling and are not
part of this release.

`performance.toolbarRemoval` becomes multipart `toolbar_removal` (default false)
on `/predict` and `/predict-stream`. `qc.processing.toolbar_removal` records the
choice. `qc.framing.toolbar_removal` records enabled/status, original source size,
the retained window, removed rows and detection evidence when available. The
statuses are `disabled`, `not_found`, `unsupported_image` and `removed`.
The existing study/sidecar persistence saves this opaque QC object without a
schema change. Standalone calibration does not remove toolbars.

## Validation

Unit coverage includes varied widths/heights, light and dark panels, already-clean
images, noisy/flat edges, isolated/clustered labels, non-bottom panels, tiny inputs,
native precision, disabled bypass, both vertebral models and crop-localizer paths.
Retained pixels must equal the input exactly; controlled model outputs after cleanup
must equal processing the manually trimmed image, including landmark coordinates.
API tests cover both routes and resource modes, original-source corrected
calibration, partial anatomy without femoral heads, invalid options and alternating
On/Off requests. Renderer tests cover legacy preferences and saved choices.

Locally supplied example screenshots are used only for private smoke validation;
no radiographs or screenshots are committed. Synthetic fixtures in tests exercise
the algorithm's rules and are not evidence of clinical accuracy across PACS vendors.

Release verification: 385 backend tests and 480 renderer tests passed locally.
An isolated v1.0.4 desktop profile migrated pre-existing processing preferences to
Toolbar removal Off, saved On independently of Crop localizer, disabled both
choices during a three-image real ONNX batch, and persisted 22-row removal on all
three examples. Image and mask dimensions matched after cleanup; calibration kept
the original 801-row source, source hashes and 27.1/35.8/41.5 mm references.
Switching Off and re-running one study restored its 801-row output and recorded
cleanup as disabled. The controls and partial-anatomy results were inspected in
the actual Electron interface.
