# Batch calibration integration

Base: `Feches/Spine-Contour`, `claude/studies-ui-updates-bb040d` at `cbe5adb` (2026-09-09). This includes his batch segmentation, study fields, Parameters tab and paired export, plus upstream calibration at `5078b1c`.

The existing OpenCV capped-ruler detector and local Tesseract label reader are reused. Previously the folder calibration screen held results in a private session cache; the batch run, study persistence and CSV exports never received them. Every successful `/predict` now returns a compact calibration from the original image, and folder results attach when studies are loaded. Automatic scanning does not require reference teaching. Optional color feedback still supplements detection.

A calibration stores the printed length, fitted endpoints, pixel length, spacing, source and detection status. SHA-256 of the source bytes and original dimensions bind cached results and manual corrections to a specific image. Preview PNGs stay outside the study record. Corrections persist, survive re-scanning and reruns, and take precedence over an older in-flight detection of the same image. Replacing a file at the same path invalidates its cached scale. A file replacement does not apply the new scale to existing geometry of an older source.

The Measurements panel shows image scale and reopens the original reference for review. CSV and paired CSV append per-film calibration columns when results exist. Ambiguous/conflicting/missing references have no assigned spacing; unknown numeric fields export empty. DICOM row and column spacing retain their separate axes. Calibration failure does not discard otherwise successful segmentation.

## Verification

- `npm test`: 438 tests passed, including persistence, per-file attachment, invalid calibration records, exports and concurrent correction checks.
- `python -m pytest backend/tests -q`: 96 tests passed, including all model checkpoint checks, actual OCR, original-image versus cropped-image calibration, cached corrections, changed-source rejection, DICOM spacing and unavailable OCR.
- Existing Studies/batch desktop smoke: 103/103 checks passed, including real model runs, two-film batch completion, missing files and Stop. Prediction sidecars from the batch retain uncalibrated status for ruler-free films.
- Desktop `tools/smoke/smoke-calibration.mjs`: automatic folder processing, workspace attachment, manual correction, folder reopening, Stop, disk reload and clean console checked on three locally supplied WebP screenshots. A separate blank-image check confirmed that no scale is fabricated and Continue still returns to Workspace.
- Real example detections: 27.1 mm / 50.0003 px, 35.8 mm / 67.0000 px, 41.5 mm / 76.0277 px. Six resized/repositioned checks retained the printed values with endpoint errors below 1.5 px against transformed original detections. This measures transformation consistency, not independent clinical endpoint accuracy.

To repeat the desktop check, launch a fresh scratch profile with `tools/smoke/launch.mjs`, then:

```sh
CDP_PORT=9222 node tools/smoke/smoke-calibration.mjs /path/to/1.webp /path/to/2.webp /path/to/3.webp
```

Screenshots and test outputs are written under ignored `tools/smoke/out/` and `artifacts/`. No patient/source images are committed. This change has not been verified in a newly packaged Windows or macOS installer.

## Scope

The detector supports printed length labels paired with straight capped rulers. It does not infer a physical scale from anatomy alone, implement other ruler families, or compensate for unknown radiographic magnification. Current angular measurements and anatomical disc-height/slip definitions are unchanged. Pre-workspace results survive the session; loaded-study results persist to disk. Detection-profile import remains unsupported.
