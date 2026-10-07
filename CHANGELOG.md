# Changelog

## 1.1.0

- Adds an optional **Fast classifier** under **Settings → Automatic view selection**
  to identify the film type before segmentation. Landmark search remains the default.
- Adds **Check film type…** to preview the classification without running segmentation.
- Recognizes cervical lateral, lumbar lateral, full-spine lateral, lumbar AP, and other
  views. Unsupported or uncertain predictions ask for manual selection.

[Release notes](docs/releases/1.1.0.md)

## 1.0.16

- The trained automatic crop method from 1.0.13 is retired. **Settings → Processing →
  Crop method** now shows **Crop search** only, and every run uses it. A saved Trained
  model preference, and any request that still asks for the trained method, is run with
  Crop search instead. Crop localizer On/Off, automatic film detection and the existing
  landmark checks are unchanged. No measurement change; the weights are unchanged from
  1.0.15.

[Release notes](docs/releases/1.0.16.md)

## 1.0.15

- A film that has not been segmented reads **Unsegmented** instead of Processing.
  **Processing** now means the film is running or waiting in the running batch: a click
  on Segment turns every film in the batch to Processing at once, and each changes to its
  result as its turn ends. Stop returns the films still waiting to their own status.
- **Failed** has its own red. Its tooltip gives the date of the failed attempt (failures
  recorded before 1.0.15 show none) and the reason, and the Analysis screen shows the
  reason under the Region and Orientation controls and, for a film with no results whose
  Region is Lumbar or whose original image cannot be shown, on the film card.
- The reason kept for a failed attempt is a plain sentence: a lost connection to the
  processing backend reads "The processing backend stopped. Restart Spine Contour, then
  segment again." instead of the raw socket error. Toasts are unchanged.

[Release notes](docs/releases/1.0.15.md)

## 1.0.14

- The welcome screen no longer lists the authors. In place of the CREATED BY card it
  shows the contact paragraph and the title of the forthcoming methods paper.
- Ticking the acknowledgement on the welcome screen no longer makes the logo blink out
  and fade back in.
- Both CSV exports drop the comment line that named the authors, so the file now opens
  with two `#` lines before the header instead of three. A script that skips a fixed
  number of lines before the header must skip two. No model, measurement or processing
  change; the weights are unchanged from 1.0.13.

[Release notes](docs/releases/1.0.14.md)

## 1.0.13

- A segmentation attempt that fails, including one stopped because automatic film
  detection or orientation could not be established, now leaves a **Failed** status
  instead of Processing; the error is on the badge's tooltip, and batch runs record it
  too. Failed studies sort first on the Find tab, count as unsegmented, are offered again
  by batch segmentation and cannot be marked reviewed until a run succeeds. A failed
  re-run keeps the earlier results on screen but shows Failed until the next successful
  run. Retrying shows Processing and a successful run clears the failure.
- Vertebral outlines are drawn in the level colour palette on every film, so full-spine
  and cervical outlines match lumbar ones (C2 has its own colour; C3–C7 reuse the L1–L5
  colours).
- Under CVA, the five advisory lines named in issue #46 are no longer shown; the review
  status they feed and every other warning are unchanged.
- **Settings → Processing → Crop method** chooses **Crop search** (the default and the
  previous behaviour) or **Trained model**, a bundled ONNX region detector that proposes
  the cervical and lumbar crops on full-spine films, and the lumbar crop when Crop
  localizer is On. A region whose proposal is missing or fails the landmark checks falls
  back to Crop search. Each result records the method that supplied the crop and why any
  fallback ran.

[Release notes](docs/releases/1.0.13.md)

## 1.0.12

- On the Workspace's column-mapping card, an unknown CSV column can be imported under its
  own name: each chip's dropdown offers **Keep column name**, and **Keep N unmapped
  columns** keeps every remaining unmapped column at once. A kept column is a custom
  clinical field like any mapped one: Load workspace attaches its values, the Parameters
  table lists it after the known fields and both CSV exports carry it. The `study_id` join
  key and the four study-detail columns are never kept; an empty or already-used name is
  left unmapped; a header that names a free known field maps to that field instead. The
  row's **Set all…** dropdown offers **Unmapped** to clear every mapping. No model,
  measurement or processing change; the weights are unchanged from 1.0.11.

[Release notes](docs/releases/1.0.12.md)

## 1.0.11

- Add segmental lordosis and disc angulation at every adjacent level, C2–C3 through C6–C7
  and L1–L2 through L5–S1, to Measurements, the image constructions, Parameters and both
  CSV exports, with follow-up deltas in the paired file. Lordosis is superior endplate to
  superior endplate; angulation is the upper inferior endplate to the lower superior
  endplate. Both are unsigned acute angles, use the current image calibration and stay
  empty when either endplate is missing; the cervical model has no C2 superior endplate,
  so C2–C3 lordosis is unavailable. See [segmental angles](docs/segmental-angles.md).
- Add **Settings → Processing → Processor**: run the models on the CPU (default) or on
  a GPU listed by name. The Windows installer bundles ONNX Runtime's DirectML build, so
  any DirectX 12 card (NVIDIA, AMD, Intel) works without CUDA. Windows and NVIDIA
  per-program GPU preferences never affected processing and still do not. macOS keeps
  the CPU path.
- Before a GPU processes a film, all six models must pass a local parity check against
  the CPU reference; a failed check keeps the film on the CPU. DirectML vendor
  metacommands are off, because the review on issue #40 found them moving a landmark on
  an Intel UHD 770.
- A GPU error discards the whole GPU attempt and processes the film again on the CPU,
  with a toast; the result records the requested and resolved processor, the reason and
  where its models ran, and its Analysis header shows GPU, GPU + CPU or CPU. See
  [GPU processing](docs/gpu-processing.md).
- `spine-contour-backend.exe --verify-models` takes `--gpu` and `--parity-films` to check
  a workstation's GPU against the CPU, model by model and on real films.
- On standing films, expand the femoral crop toward a head the lumbar crop cut through,
  by at most two extra passes within the source image, and record the crop. A mask still
  reaching the crop edge caps the femoral confidence at 0.5 and asks for review instead
  of scoring a truncated head as a good fit. See
  [femoral real-image validation](docs/femoral-real-validation.md).

[Release notes](docs/releases/1.0.11.md)

## 1.0.10

- Automatically select cervical, lumbar or standing/full-spine processing for new
  imports, with manual region and anterior-side overrides and reviewable provenance.
- Detect standing-film anterior orientation using lumbar/S1 evidence from both
  image directions; ask for a manual side when evidence is ambiguous.
- Return cervical, lumbar and available pelvic measurements alongside global
  C7–S1 SVA on standing films. Preserve regional landmarks through editing,
  source-bound calibration, persistence and ordinary/paired CSV exports.
- Compare cervical landmark chains across mirrored searches in the source frame
  to withhold inconsistent regional identities before measuring them.
- Add a separate full-spine workflow combining cervical and lumbar HRNET crop
  searches for global C7–S1 SVA, with explicit orientation and crop-agreement checks.
- Add its measurement construction, editable C7/S1 anchors, source-bound
  calibration, persistence and CSV export. Keep cervical measurements separate.
- Add cervical HRNET and its paired spine detector,
  with offline ONNX inference and explicit anterior-side selection.
- Add C2–C7 inferior-endplate Cobb angle and C2–C7 sagittal vertical axis,
  construction overlays, editable landmarks, persistence and CSV export.
- Keep uncalibrated SVA in pixels; use the current image calibration for
  millimetres and for angles when row and column pixel spacing differ.
- License the source under the GNU AGPL, version 3 or later: the complete text in `LICENSE`,
  the notice in the README and the `license` field in `package.json`.

[Release notes](docs/releases/1.0.10.md)

## 1.0.9

- Update the femoral-head U-Net using the expanded rim-annotation dataset.
- Preserve the validated native-image contrast enhancement, 640px input, flipped-view averaging, and 0.35 threshold in the desktop ONNX pipeline.
- Retain support for zero, one, or two visible heads and existing manual corrections.

## 1.0.8

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
  of the SP-nnnn record id, which no longer appears anywhere a person looks: not in either file and
  not in the tooltips over a study's name. The name is also what a workspace CSV's `study_id`
  column must hold to match a film.

[Release notes](docs/releases/1.0.8.md)

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
