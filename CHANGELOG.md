# Changelog

## 1.0.1

- Keep detected vertebrae, S1 and usable femoral geometry when other anatomy is
  missing. Compute each measurement independently; preserve partial results through
  batch processing, landmark editing, saved-study reload and both CSV formats.
- Fall back to the whole film without an S1 crop anchor. Require body-mask evidence
  for HRNet levels, and withhold anterior/posterior disc heights when U-Net has no
  anatomical orientation reference.
- Fix null-to-zero mismatch calculations and missing-landmark viewer controls.
- Point the app's Documentation button to Cody's repository.

[Release notes](docs/releases/1.0.1.md)

## 1.0.0

Promotes the redesigned application from Cody's `ui-redesign-cw` branch to `main`:
305 existing commits through PR #4, with all original histories retained.

- Redesigned desktop navigation and image review; editable landmarks and femoral
  circles; durable study/prediction storage and workspace/clinical CSV import.
- Batch segmentation, study/visit organization, Parameters grid, selected-study CSV
  and paired pre-op/post-op exports.
- Crop/model selection, HRNet support, femoral/S1 confidence safeguards and native
  image-intensity preservation.
- Automatic OpenCV/DICOM calibration, persistent per-study scales, 15 calibrated
  disc heights and WebP input across import paths.
- Numbered releases with Windows/macOS installers, checksums, version/source checks
  and guarded publication after both builds succeed.

[Full release notes](docs/releases/1.0.0.md) ·
[Every incoming commit](docs/releases/1.0.0-commits.md)

## 0.2.0 preview

Combined calibration, disc-height exports and accuracy safeguards on the preview
branch, before promotion to main. [Preview notes](docs/releases/0.2.0.md).

## 0.1.0

The package version on the previous `main` baseline (`7aa1a86`). It provided the
original single-radiograph application and Windows installer; Cody's fork did not
have a numbered production GitHub release for this version.
