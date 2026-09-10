# Manual calibration persistence

The pre-study path cache was session-only. A manually applied reference could be
lost before study creation on restart, and Windows folder/picker spellings could
miss the existing study. The old smoke suite changed an already detected label;
it did not draw a missing reference before study creation and restart.

`Apply reference` and `Clear scale` now write compact records atomically to
`userData/calibrations/<original-file-sha256>.json` through `calibration-io.js`.
No source pixels or previews are stored there. Writes are serialized and awaited
by subsequent image lookups. Invalid/corrupt/future records are reported and left
intact. The panel confirms a disk save only after the write completes; a failure
leaves the current session value with an explicit unsaved message.

Both desktop calibration and prediction read that record using the uploaded
bytes, independent of path and study id. The backend checks digest, original
dimensions, endpoints and length before reuse. Manual references also work when
OCR is unavailable or the ruler lies outside the inference crop. An optional
positive `review_revision` keeps a newer durable correction ahead of an older
reviewed session cache. Study format version remains 1.

Windows drive/UNC paths normalize separators and case for the existing session
lookup and study update; POSIX paths remain case-sensitive. Existing geometry is
still protected from references belonging to a replaced source file. Disc heights
remain derived from saved geometry and calibration, with the existing anatomical
definitions and missing-data rules.

Drawing/typing edits remain drafts until **Apply reference**. Only an applied
reference or explicit clear receives a durable save. Automatic detections retain
their existing persistence through loaded studies. No model weights, measurement
geometry or automatic ruler thresholds change.

## Verification

Verified on 2026-09-10: 487 JavaScript tests, 393 backend tests, and 17 source
Electron checks across the three phases and full app restarts. The desktop check
used two local example radiographs with deliberately distinct test scales and
actual ONNX batch processing. It verified all available A/M/P CSV values, then
halved one reference value and confirmed the corresponding heights halved with
identical saved geometry. Explicit clear left the other image's scale intact.
Packaged Windows/macOS validation is performed by the PR installer workflow.

Run `node --test test/*.test.js` and `python -m pytest backend -q`.
Coverage includes pre-study disk round trips, independent source identities,
queued saves, clearing, corrupt-record protection, Windows path variants,
revision precedence, OCR failure and both calibration/prediction routes.

For an actual desktop check, launch on a new scratch profile with the ONNX graphs
available, then run `CDP_PORT=<port> node tools/smoke/smoke-manual-calibration.mjs
save /local/first.webp /local/second.webp`. Quit and relaunch with
`SMOKE_KEEP_PROFILE=1`, run the `batch` phase with the same arguments, and quit/
relaunch again for `verify`. The two local lumbar films should support at least
one disc and be at least 701 by 301 pixels. The initial failed detector result is
seeded for the UI fallback; reference drawing, disk storage, restarts, ONNX batch
segmentation and CSV calculations are real. The suite creates no screenshots or
committed image fixtures.
