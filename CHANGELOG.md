# Changelog

## 1.4.0

- **Place only some of a level's points.** A vertebral body can be finished with one endplate (SA and SP, or IA and
  IP) and C2 with its inferior pair or its centroid alone, for a part that is not on the film: the shoulders hide
  C7's inferior endplate, a lumbar film is cut off above L1. Once such a part is whole, the edit bar's **FINISH**
  (right after FIT) stores it and records the rest as not on this film. The level reads Manual or Edited, draws as its
  endplate line, and measures what it has: with C7's superior endplate alone, C2–C7 SVA and C6–C7 segmental lordosis
  read, and C2–C7 Cobb and C6–C7 disc angulation show —. A model result with one endplate now reads Segmented instead
  of Not placed.
- **Complete or remove an endplate later.** A partial level's chips in the edit bar list every point, the missing ones
  with a hollow dot; clicking one, or the row's Place…, resumes the placement for that endplate (`PLACING C7 · 3 OF
  4`). **Delete** or **Backspace** with a point of a body or C2 focused removes that point's endplate, refused for the
  level's last part and for T1, S1, T4 and the heads.
- **C7 has a placeable centroid.** C7 stays a body and carries an optional centroid like C2's: a fifth chip,
  CENTROID, hollow until placed (`PLACING C7 · n OF 5`), set during the placement or later from the chip or the row's
  Place…; four corner clicks still finish C7 by themselves. On a full-spine film the C7–S1 SVA plumb reads from the
  placed centroid even when C7 is partial. The record's `levels.C7` gains `centroid` and `model_centroid`, same schema id.
- **T1 slope and T4 pelvic angle.** A placed T1 endplate and T4 centroid are now kept with the film and drawn outside
  edit mode, and read as two new measurements: the T4 pelvic angle (L1PA's construction with the T4 centroid; lumbar and
  full-spine films) and the T1 slope (the T1 endplate's angle to the horizontal; cervical and full-spine films). Panel
  rows, Parameters grid columns and CSV columns `T4PA` and `T1 slope (deg)`; a missing input reads —, and no model places
  either point.
- **A level hidden in the editor stays hidden on the stage.** Entering edit mode and Save edits re-apply the levels
  the editor holds hidden or unplaced to the stored geometry when they disagree, for example after a re-measure
  that failed; like any re-measure, this clears the film's Reviewed mark. The mask overlay outside edit mode no
  longer colours a level the study no longer holds.
- **A femoral head cut off at the film's edge no longer blocks a full-spine film's edits.** Its fitted centre lies
  beyond the edge, which the full-spine measure path refused, failing every commit of the film; a centre now needs
  finite values only, as on the lumbar path.
- **The label record's corners are nullable by endplate**, under the same schema id (amended 2026-10-21), and
  `edited_points` lists the keys placed, moved or removed. The backend's lumbar validator accepts a body with one
  endplate (LL and L1PA read — where their endplate is missing). A record saved before 1.4.0 reads unchanged; a 1.3.x
  build reads a partial level as Not placed and a partial lumbar study as unsegmented, with a warning.

[Release notes](docs/releases/1.4.0.md)

## 1.3.1

- In edit mode the edit bar lists the **selected level's points** — `SA SP IA IP` for a vertebral body, each dot in
  its handle's colour — for every placed level, whether the model placed it or a hand did. Before, the chips showed
  only while a level was being placed, so selecting a level the model had found (L5, say) listed nothing. Clicking a
  chip arms that point: the bar reads `PLACING L4 · SA`, and the next click on the film places the point there, as a
  drag would; Escape or the chip again keeps it where it is, and the arrow keys nudge the point either way. A
  placement in progress keeps its own step chips.
- **A wrong Auto detect region can be corrected while a batch runs** (issue #68). The Analysis screen's Region and
  Orientation selects used to be disabled, with no tooltip, whenever any run or batch was in flight anywhere in the
  library, so a film the run had labelled lumbar could not be changed to cervical and the Measurements panel kept the
  lumbar parameters. Now only the film's own turn (its run in flight, or next up in the running batch), edit mode and
  a demo study lock them, each with a tooltip that says so. Changing the region still clears the result and asks for
  a run; Run segmentation keeps waiting for the batch or the current run, and now says which.
- **Run segmentation in one place.** An unsegmented cervical, full-spine or Auto detect film now shows the
  **UNSEGMENTED** strip along the bottom of the stage with its Run segmentation once its preview is on the stage, as
  a lumbar film has since 1.3.0 with its X-ray. The region bar keeps View original and the Region and Orientation
  selects and no longer has a run button of its own, so the button is in the same place whatever the region. A
  **Failed** film with its film on the stage shows a FAILED strip the same way, its reason in the region note, so
  Edit segmentation stays reachable to place the film by hand. A film whose preview or X-ray cannot be read keeps the
  full card.
- No model, measurement or record change.

[Release notes](docs/releases/1.3.1.md)

## 1.3.0

- **Previous and next on the Analysis screen.** The arrow keys (Left or Up for the previous film, Right or Down for
  the next) and two header buttons beside Back step through the Find list exactly as it is filtered and sorted, with
  the film's place shown between them (`3 / 42`, an en dash for a film the filters hide). A film that leaves the
  filtered list, such as one you just marked reviewed, still has a next and a previous. The keys are left alone in text
  fields, dropdowns, sliders and edit mode, and with focus on the Region or Orientation select they navigate instead of
  changing the region.
- **Filters in the column headers.** Every Find header but STUDY and DATE has a funnel opening a menu of the values in
  your library, with several ticks at once (two regions, three statuses), All, None and the two sort directions;
  SUBJECT's menu is a text box. The Status and Region menus always list every status and region, so a tick stays put
  when its last film changes. The bar's Workspace and Folder dropdowns are replaced by the menus; a filter with nothing
  left reads `No studies match these filters.`; Escape or a click elsewhere closes a menu.
- **A REGION column** reads Unknown, Lumbar, Cervical or Full spine (the region you set, else the one the run
  detected), fills in when a run finishes, and sorts and filters like the rest. The CSV exports' region cell reads the
  same label.
- **The view is Unknown until set.** A film's view (the patient position) is Unknown until a folder name, a file name,
  the CSV, the import table or the drawer sets it; the import table's VIEW selects default to Unknown, the Parameters
  grid's View filter offers Unknown, and an Unknown view no longer blocks segmentation: the run works out the region
  itself. The CSV writes an empty view cell for Unknown and reads a blank or `Unknown` cell as Unknown.
- **An unsegmented lumbar film opens on its X-ray**, decoded from the original, with the UNSEGMENTED notice as a strip
  along the bottom of the stage and window / level available; Auto detect, cervical and full-spine films show the
  original's preview as before.
- **Fixes.** Ticking a row far down the Studies list no longer scrolls the app off the window (the tick box's hidden
  input escaped the list's clipping). Back from a film lands on its row. The Find table fits the page column again
  after the new column, and its Delete control stays at the right edge on a narrow window instead of behind the
  scrollbar at the bottom of the list.

[Release notes](docs/releases/1.3.0.md)

## 1.2.0

- The Vertebral levels panel has a **COMMENT** box: whatever you type is saved with Save edits into the film's label
  record as `comment`, counts as one unsaved change until saved, and shows read-only on the Analysis screen and in the
  Studies search.
- A real film placed by hand, with no model run behind it, reads **Hand-placed**: after Needs review in the sort,
  counted in TO REVIEW, and Mark reviewed turns it Reviewed. The first level committed on a failed film clears its
  failure; taking every level off again returns the film to what the editor found at Edit.
- An Edited level's row shows **REVERT**, which returns that one level to the model's output and commits it like a
  drag.
- The selected level's handles shrink with the film below 1:1, to a floor of 3 px, instead of covering a zoomed-out
  vertebra at a fixed 6 px, and when zoomed in past 1:1 grow with the square root of the zoom instead of magnifying
  with the film (12 px at 4x, 17 at 8x, not 24 and 48).
- The study drawer's STUDY column grows with a long film name (to 280 px) and wraps it inside its cell instead of
  running it over SUBJECT.
- The C2 centroid is drawn outside edit mode as a cross in C2's colour on cervical and full-spine films, as the C7
  centroid is on a full-spine film.
- **Export all** (or **Export N selected**) on the Find tab writes a bundle folder: a manifest and, per film, the
  original file, the study's record, the model's result, the label record and the manual image scale. **Import
  bundle…** reads one into another library after asking in the bar: new films are added, a film the library already
  holds (matched by content) is updated only when the bundle's annotation was saved later, and the rest is skipped and
  named; a damaged file in the bundle skips only its film. An export folder that fills up or cannot be written stops
  the export with a message instead of reporting films as not found. Imported films stay in the bundle folder, so keep
  it where it is. A bundle can carry patient identifiers in a DICOM header: it is for your own machines. See
  `docs/bundles.md`.

[Release notes](docs/releases/1.2.0.md)

## 1.1.1

- In edit mode each level's name plate now sits **outside its vertebra, on the posterior side**, whichever way the
  film faces. Before, every plate went to the right of the posterior edge, which on a film facing right put it
  inside the body, over the anatomy being checked.
- Any plate can be **dragged** out of the way, and a double-click puts it back. Where the plates were dragged lasts
  while the film is open, like zoom and pan; it is never saved and never in the label record. Handles under a plate
  are still grabbed first.

[Release notes](docs/releases/1.1.1.md)

## 1.1.0

- Replaces the landmark editor with a **vertebral level editor**: sixteen levels in five groups, each placed by
  clicks when the model missed it, with step chips that choose the next point, handles on the selected level only,
  and an exit prompt for unsaved level edits.
- **Save edits** writes a per-film label record (`labels/<stem>.label.json`) for retraining: every level's state and
  points, the model's original points for edited levels, `edited_points` and an `edits` summary. **Mark reviewed**
  writes the record for a film that has none yet.
- **Window / level** on the stage in and out of edit mode, from the original film through the new `POST /decode`;
  a right-button drag windows, a double right-click resets. Display only.
- Zoom to 800% with the overlay kept crisp past 1:1; a film with no result can be placed by hand; Re-run and the
  Region / Orientation selects wait for edit mode to end; `qc.model_versions` names each model's graph.

[Release notes](docs/releases/1.1.0.md)

## 1.0.17

- Adds an optional **Fast classifier** under **Settings → Automatic view selection**
  to identify the film type before segmentation. Landmark search remains the default.
- Adds **Check film type…** to preview the classification without running segmentation.
- Recognizes cervical lateral, lumbar lateral, full-spine lateral, lumbar AP, and other
  views. Unsupported or uncertain predictions ask for manual selection.

[Release notes](docs/releases/1.0.17.md)

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
