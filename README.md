Automated measurements from radiographs.

On Windows, download the current [Spine-Contour installer](https://github.com/mjayasur/Spine-Contour/releases/download/latest-windows/Spine-Contour-Windows.exe) and open it. Choose a radiograph, leave X-ray, Lumbar, and Lateral selected, then click **Measure radiograph**.

On a Mac with Apple Silicon, the same app builds as a disk image (`npm run package:mac`
from source, or the `preview-macos` prerelease when the preview workflow has run). It is
not signed with an Apple Developer ID, so the first time you open it macOS will say it
cannot verify the developer: right-click the app in the disk image, choose **Open**, and
confirm. Intel Macs are not built for.

## Workspace

The Workspace screen is part of the redesigned app on this branch; it is not in the current
`latest-windows` installer linked above.

It loads a folder of radiographs into the Studies library in one step, with an optional
clinical-data CSV.

- **Choose folder…** scans the folder and its subfolders for `.dcm`, `.dicom`, `.png`, `.jpg`,
  `.jpeg`, `.tif`, `.tiff` and `.bmp` files in any letter case. Other files, links and junctions
  are skipped and counted, as is any subfolder that cannot be read; links are never followed.
- After a scan, card 01 lists every folder that holds films with the **timepoint** and **view** the
  load will assign to the films in it — read off folder names such as `pre-op`, `post-op`, `6wk`,
  `flexion` or `prone`, else `none` and `Standing lateral` — and lets you change any row, or a whole
  column with **Set all…**, before pressing Load. A film's own name is more specific than its folder
  (`S001_preop_flexion.png` sets both), and the first folder below the root that names neither a
  timepoint nor a view is the film's **subject** (`pre-op/S001.png` and `S001/post-op.png` both read
  `S001`). Nothing overwrites a value a film already has; the study's drawer does that.
- **Choose CSV…** (optional) reads a file with one row per study and a `study_id` column. Rows
  join films on the film's filename without its extension, case-insensitively — `SP001.dcm`
  takes the row whose `study_id` is `SP001` or `sp001`. Rows that match no film are counted in
  the load message and not stored; when two rows share a `study_id` the first wins; when two
  films share a stem the row is attached to neither. Four columns are read as study details rather
  than clinical fields: `subject_id` (or `subject`), `timepoint` (or `visit`), `film_date` (or
  `study_date`; `YYYY-MM-DD` or `M/D/YYYY` — a bare `date` column is not read), and `view` (or
  `position`) — a known position such as `flexion` or `standing` is stored as its label. They beat
  what the folder names say.
- Only the nine known clinical fields auto-map — Age, Sex, BMI, Diagnosis, ODI, Treatment plan,
  Surgical history, Follow-up, Notes — by prefix on the column name (`age_yrs` → Age,
  `odi_base` → ODI). Any other column can be mapped from the dropdown on its chip or left
  unmapped. `study_id` itself is the join key, not a field.
- **Load workspace** adds each new film to Studies as `Processing` and attaches its CSV
  values. Films already in the library (same path) are not added again; the CSV only **fills
  in** clinical fields they are missing and never overwrites a value that is already there
  (use **Import from CSV** on the study's Analysis screen to replace values deliberately).
  Open a study and run segmentation from its Analysis screen; nothing runs automatically. The
  message also says how many films had a subject, timepoint or view read from folder or file
  names or set from the CSV, how many still have no subject or no timepoint, and how many film
  dates could not be read.
- On the Analysis screen the **Clinical data** drawer shows the study's fields. **Import from
  CSV** pulls the matching row from the workspace CSV loaded this session. Values are saved
  with the study; demo studies are not saved and their cells are read-only. The `×` on a
  column head **hides** that column for the session — the values stay on the studies, and the
  column comes back at the next launch if any study still holds a value for it.
- The drawer's **Study** group holds each film's **Subject**, **Timepoint**, **Film date** and
  **View**. Subject is a study code, not a name and not a medical record number — the library is not
  a place for identifiers, and nothing you type there is checked. Timepoint and View suggest the
  labels the app knows (`Pre-op`, `Intra-op`, `Post-op`, `6 wk`, `1 yr`, `2 yr`; the five lateral
  positions); a known position or label is stored as its label, anything else is kept as typed.
  **Import from CSV** also brings these four in when the CSV has the columns.
- Deleting a study from the Studies list removes its record and its saved segmentation
  (`predictions/<id>.json` in the app's data folder). The film on disk is not touched.

The app's own **Export CSV** file cannot be loaded back in through the Workspace. Three separate
things stop it, and `docs/ROADMAP.md` (item 1) sets out each of them and the design decision a
fix has to make first.

## Parameters tab

The Studies screen has two tabs. **Find** is the list. **Parameters** shows every segmented study's
measurements in one grid — subject, timepoint, view and film date, then PI, PT, SS, LL L1–S1, PI–LL,
L1PA, the L2–S1…L5–S1 levels behind a **Levels** toggle, any clinical fields in use, and the
workspace and folder each film came from.

- Filter by workspace, by folder within it, by timepoint (including films with none), by view, by a
  subject substring, and **Paired only** (subjects with a Pre-op film and, by default, any other
  labelled film — **All paired**; pick a label in the `with` dropdown to narrow to that visit), and by
  **Segmented only** (on by default; the note beside it says how many unsegmented films are hidden).
  The search box applies to the grid as well as the list. Click a column header to sort; absent
  values sort last. Sorting by **Subject** groups each subject's films, Pre-op first, with a rule
  between subjects.
- Click a study name to open it. Tick rows to choose a subset: the button reads **Export N selected**
  and writes the ticked rows that are visible; with nothing ticked, **Export CSV** writes every
  visible row. Hidden picks stay ticked and return with the filter.
- The file has three `#` comment lines, then the header
  `Study ID,View,Subject,Timepoint,Film date,LL L1-S1,PI,PT,SS,PI-LL Mismatch,L1PA,LL L2-S1,LL L3-S1,LL L4-S1,LL L5-S1`
  followed by every clinical field present on the exported studies. Absent values are empty cells. Demo
  studies are never exported.
- **Export paired CSV** writes one row per subject over the same rows: `Subject`, then every visit's `<label> study`,
  then every visit's `<label> view`, then every visit's `<label> film date` (`Pre-op` first within each kind, then
  every later timepoint present — Intra-op, Post-op, then durations by length, then other labels), then for each
  measurement `<M> Pre-op`, `<M> <label>` and `Delta <M> <label>` (the later value minus the Pre-op value over the
  values as written; empty when either is absent), then each clinical field per visit. A subject needs exactly one
  Pre-op film and one film per later visit it has; a subject with two films on one visit is left out and named in the
  message, as are subjects with no pair; films with no subject and films with no timepoint are counted. With **Paired
  only** ticked and a label chosen in `with`, the file has that visit only and the message counts the films of other
  visits it left out. Suggested name `<workspace>-paired.csv`.

## Models

Three structures are read from a lateral film — the L1–L5 vertebral bodies, the S1
endplate, and the femoral heads — and **Settings** in the sidebar shows which model reads
each. The femoral heads and the S1 endplate each have one. The vertebral bodies have two,
and the choice applies to the next run:

- **U-Net** segments each body and reads its corners off the mask.
- **HRNet** regresses each corner directly. It can place a corner where a mask
  has no pixels, so it never leaves a level out — and, for the same reason, it has no
  missing level to report when it is wrong.

Each study's Analysis header names the model that produced the numbers on screen, and the
saved result records it, so a library measured with both can still be told apart.

Before any model runs, the backend finds the lumbosacral region on the film and frames
it the way the models were trained to see it: a box slides over the lower film and the
best-framed one wins, with the whole film competing as one more box. A lumbar radiograph
wins as a whole; a full-spine radiograph is cropped. The frame is recorded with the
result.

## Test data

No radiograph ships with the app or the installer. Test with your own de-identified
lateral lumbar films, or with a public dataset:

- **BUU-LSPINE** — paper: https://www.mdpi.com/2076-3417/13/15/8646 — dataset: https://services.informatics.buu.ac.th/spine/
- **VinDr-SpineXR** — paper: https://arxiv.org/html/2106.12930v1 — dataset: https://physionet.org/content/vindr-spinexr/1.0.0/
- **Merlin** — paper: https://arxiv.org/abs/2406.06512 — dataset: see the paper

Each dataset has its own access terms and licence; check them before use. None of these
datasets is bundled with, or endorsed by, this project.


## Image and folder calibration

Choosing an image folder in **Workspace** now opens calibration automatically. Review the reference, then select **Calibrate folder and continue** to process the folder and return to workspace setup. **Skip for now** returns without requiring a reference. Changing the folder starts a fresh calibration step.

You can also open **Image calibration** in the sidebar. **Choose one image** reads a PNG's printed length label and capped ruler without running segmentation. Green points mark the reference: drag either endpoint, correct the length in millimeters, and select **Apply reference**. **Measure distance** places two yellow points and displays their distance using that scale.

For a folder, select **Choose image folder** or **Use workspace folder**. The app searches until it finds a reference to review. Correct and apply it, then select **Use reference appearance for folder** and **Process folder**. The corrected shaft supplies foreground-color settings that supplement ruler detection and OCR on the remaining images. Each image gets its own scale; the reference image's zoom-dependent scale is never copied to other films. Review missing, ambiguous or conflicting results in the image list. **Save calibration results** exports the detection profile and per-image references as JSON.

Calibration stays in this session when navigating between screens. It does not yet persist inside study records or import saved profiles; export the JSON to retain it. It does not change the current angular measurements or add anatomical disc-height definitions. The original-image canvas keeps references accessible outside the segmentation crop.

DICOM `PixelSpacing` preserves row and column spacing; detector-plane spacing is not silently substituted. Screenshot scale is derived from the printed annotation, not independently corrected for projection magnification. Capped straight rulers are supported; arrows, graduated scales and angle markers are not yet supported. Manual reference placement remains available when automatic OCR fails. The preview installers bundle Tesseract; development on macOS needs `brew install tesseract`.


## Clear the study library

On **Studies**, select **Delete all studies**, then confirm the displayed count. This clears every study, including entries hidden by search, plus saved segmentation results; in a development build that includes the demo studies (a packaged build has none). Original radiograph files are kept. Demo studies remain hidden after restarting. The action is unavailable during segmentation or when the saved library cannot safely be written. If a saved result cannot be deleted, its study remains in the library and the app reports the failure.
