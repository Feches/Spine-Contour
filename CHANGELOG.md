# Changelog

## Unreleased

- Read the subject, timepoint, film date and a note from a film's name on load: underscores
  separate the fields (`sub225_post-op_3-22-2024_femoral heads`), in any order after the subject;
  the date is `M-D-YYYY` or `YYYY-MM-DD`. A film added with the picker or dropped on the list is
  read the same way.
- Add a Note to each study: a fifth column in the drawer's Study group, a `Note` column in the
  CSV export after Film date, and searchable from the Find box. It is what tells two same-day
  films of one subject apart.
- A film named with a date after its timepoint used to load with the whole name as its subject and
  no timepoint, so it never paired. Such films loaded before this release keep that subject: delete
  them and load the folder again.
- The paired CSV now writes one column group per visit: a subject's Post-op films on different
  dates become `Post-op 1`, `Post-op 2`, … in date order, each with its film date, instead of
  making the subject ambiguous. Two films on the same day merge when one carries a note: the
  film without a note leads and the noted film fills what it lacks. Every merge is flagged in
  the toast and in a `disagreements` column beside the visit, naming the measurements the two
  films disagreed on. A merged visit's PI-LL mismatch is computed from its merged PI and LL, and
  a `derived across films` column beside the visit says which film supplied each when they differ.
- Show a study's full name on the Find list, as the Parameters grid does. Both screens now share
  one rule for the name: the same face, a 280 pixel cap, and a wrap past it instead of an
  ellipsis, so a long filename reads in full on either screen.
- Collapse the sidebar with a study open and the OPEN STUDY card becomes an icon-only button with
  the name in its tooltip, instead of a filename wrapped one letter per line; expanded, a long
  name wraps inside the card instead of running past its edge.
- Both CSV exports now name a film by its study name, the filename without its extension, instead
  of the SP-nnnn record id: the long export's `Study ID` column holds the name and a new
  `Record ID` column after the clinical fields keeps the id; the paired export's study cells hold
  the names. The name is also what a workspace CSV's `study_id` column must hold to match a film.

## 1.0.7

- Show femoral heads as editable circles with centre marks and a bilateral midpoint; hide the raw femoral segmentation in analysis and comparison views.
- Move, resize, retrace, add or delete circles. Save partial corrections and leave dependent pelvic angles blank until both heads are available.
- Add an expandable overall image-confidence assessment with separate model quality checks, anatomy coverage, calibration and edit provenance.

[Release notes](docs/releases/1.0.7.md)

## 1.0.6

- Delete the ticked studies from the Find tab's filter bar, replacing the library-wide
  "Delete all studies"; a search or a filter hiding a tick keeps that study safe.
- Sort the Find list by any column, newest first by default, with the same click-to-sort
  headers as the Parameters grid.
- Rename PATIENT to SUBJECT and edit it in place on the list: click the cell, type, Enter
  commits and moves to the next row.
- Add a fourth status, Reviewed, set with a Mark reviewed button on the Analysis screen
  and cleared automatically by a re-run, a landmark correction, a reset or a calibration
  change; the quality warnings stay visible either way.
- Add a Show/Hide demo-studies switch to Settings for development builds only; installers
  never show demo studies.

[Release notes](docs/releases/1.0.6.md)

## 1.0.5

- Save manually applied image references independently of study creation. Reuse
  each image's reference after restart and during single/batch segmentation so
  disc heights and CSV exports use the corrected scale.
- Identify references by original image contents, handle Windows path case and
  separator differences, and keep newer saved corrections ahead of stale caches.
- Confirm successful reference saves and report write failures. Persist explicit
  scale clearing so a later scan cannot silently restore an unwanted ruler.

[Release notes](docs/releases/1.0.5.md)

## 1.0.4

- Add a saved Toolbar removal setting, independent of Crop localizer, for fast
  detection and removal of bottom PACS screenshot strips before segmentation.
- Preserve source files, original-image calibration, native high-bit-depth images
  and partial-anatomy handling. Keep uncertain cases unchanged and record the
  selected setting, detected boundary and removed rows with each result.
- Cover light/dark panels, varied strip sizes, noisy edges, uncertain content,
  preference migration and both prediction routes with regression tests.

[Release notes](docs/releases/1.0.4.md)

## 1.0.3

- Add a saved crop-localizer switch: On for full-spine images; Off skips crop
  search and reframing for already-framed lumbar-only images.
- Run all four existing models through ONNX Runtime, retaining float32 weights,
  768-pixel model resolution, partial-anatomy checks and calibration.
- Export and validate model graphs during installer builds, and verify all four
  graphs using the packaged executable. Keep PyTorch and training checkpoints out
  of the runtime bundle.

[Release notes](docs/releases/1.0.3.md)

## 1.0.2

- Add a saved low-memory processing mode: one search crop at a time, one model
  cached at a time, configurable CPU threads and longer calibration OCR waits.
- Show real backend stages, region/pass counts and elapsed time for individual
  images and batches. Keep long jobs alive with heartbeats; allow cancellation.
- Keep the full anatomical search, model resolution, partial-anatomy handling,
  original-image calibration and blank unsupported measurements.

[Release notes](docs/releases/1.0.2.md)

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
