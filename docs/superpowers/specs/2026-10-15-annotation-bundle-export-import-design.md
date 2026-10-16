# Annotation bundles: export a folder of studies and import it into another library — design

**Status:** approved in conversation 2026-10-15; this document is the written spec. Branch
`worktree-annotation-round-2` in the worktree `.claude/worktrees/annotation-round-2`, off `origin/main` @ `06c8cdd`
(v1.1.1). Nothing here is implemented. Built after its companion
`specs/2026-10-15-annotation-editor-round-2-design.md` ("the editor spec"), whose `labelComment` field and `comment`
record field it carries.

**Builds on:** the study store and its sidecars (`renderer/data/persistence.js`, root `store-io.js`, main.js's
`load-studies` / `save-prediction` / `save-label-record` handlers), the label record (`renderer/data/label-record.js`,
`<userData>/labels/`), the manual calibration store (root `calibration-io.js`, `<userData>/calibrations/<sha256>.json`),
the Find tab's bar (`specs/2026-09-10-studies-table-review-design.md` §5) and the CSV export's selection rule
(`rowsToExport` in `renderer/data/parameters.js`). The binding architecture contract is
`plans/2026-08-31-00-architecture-contract.md` ("contract").

---

## 1. Problem

A study's data lives in four places: its row in `studies.json` (measurements, geometry, qc, calibration, clinical and
library fields, the thumbnail, the review mark, the comment), the prediction sidecar `predictions/<id>.json` (the
model's result and the stored 8-bit image), the label record `labels/<stem>.label.json` (the annotation), and the
original film at an external `filePath`. Nothing moves them. The only export is the measurements CSV, which cannot be
imported back (ROADMAP §1). An annotator working on one computer cannot bring their films and annotations to
another, and a library cannot take a colleague's annotations of films it already holds.

## 2. Decisions

User rulings (2026-10-15) are marked.

B1. **Import adds to the other computer's library** (user). The bundle carries the film pixels, the model result, the
    label record and the review state; import makes each film a study in the Studies list, ready to open, review and
    edit. Not a trainer-only export.
B2. **A folder, not an archive** (user). One folder with a manifest, inspectable, copied as-is to a stick or a share.
    No archive code.
B3. **The original film file** (user). The DICOM or PNG as it was added, so the other computer can re-run, window on
    the full bit depth and relocate it like any film. A DICOM header can hold patient identifiers: the bundle is for
    the owner's own machines, and the user doc says so.
B4. **Newer annotation wins on a duplicate** (user). A film the library already holds keeps its film; its result and
    annotation are replaced only when the bundle's label record was saved later than the local one, or the local
    study has no record. Otherwise it is skipped and named.
B5. **The films stay in the bundle folder** (planner). An imported study's `filePath` points into the bundle, as every
    film's path points outside the data folder today. The app owns no film bytes; the confirmation says to keep the
    folder. *Cost if wrong:* moving the folder breaks re-runs and a hand-placed film's display until the existing
    film-not-found relocate (`FILE_NOT_FOUND_REASON`) is used; a model result still shows its stored image.
B6. **The selection rule is the CSV's** (planner). Ticked visible real rows when any are ticked, else every visible
    real row (`rowsToExport`). *Cost if wrong:* an accidental all-export writes a large folder; the picker is the
    confirmation.
B7. **The manual calibration reference travels** (planner). When the exporting library holds
    `calibrations/<sha256>.json` for the film, the bundle carries it and import saves it through the calibration
    store, so a re-run on the other computer keeps the correction. *Cost if wrong:* one small file per film.
B8. **Import confirms inline, with the counts** (planner), in the Studies bar's prompt style (Delete's §5.3), never a
    native dialog: the plan is computed first, so the prompt states what will be added, updated and skipped.
B9. **Nothing leaves the machine** (standing rule). Both directions are local file I/O through native pickers.

## 3. The bundle

### 3.1 Layout

```
spine-contour-export-2026-10-15-1432/
  manifest.json
  lateral_lumbar_001/
    study.json                       the study record, filePath cleared
    prediction.json                  the sidecar, when the study has one
    lateral_lumbar_001.label.json    the label record under the study's own labelFile name, when it has one
    calibration.json                 the manual calibration reference, when the library holds one (B7)
    film/lateral_lumbar_001.dcm      the original film, when it could be read (B3)
  lateral_lumbar_001-2/              a second study with the same stem
```

The folder name is `spine-contour-export-<YYYY-MM-DD>-<HHMM>` (local time), `-2`, `-3` on a clash inside the chosen
parent. A study's folder is its film's safe stem (`safeStem`, moved from `data/label-record.js` to `data/labels.js`
and exported so both callers share ruling R12's rules), with `-2`, `-3` on a clash within the bundle, case-insensitive.

### 3.2 `manifest.json`

```json
{
  "schema": "spinecontour.bundle/1",
  "app_version": "1.2.0",
  "exported_at": "2026-10-15T14:32:10.000Z",
  "studies": [
    {
      "dir": "lateral_lumbar_001",
      "source_id": "SP-1004",
      "file_name": "lateral_lumbar_001.dcm",
      "film": "film/lateral_lumbar_001.dcm",
      "film_sha256": "…64 hex…",
      "prediction": "prediction.json",
      "label": "lateral_lumbar_001.label.json",
      "calibration": "calibration.json"
    }
  ]
}
```

`film`, `film_sha256`, `prediction`, `label` and `calibration` are `null` when absent. Every path is relative to the
study's folder and never contains a separator other than the one `film/` carries. `film_sha256` is the SHA-256 of the
film's bytes, computed as the file is copied; it is what a model result stores as `geometry.source_sha256` and
`calibration.source_sha256` (the backend hashes the same bytes), which is what import matches on (§5.3). The manifest
is written last: a bundle cut off mid-export has none and import refuses it.

### 3.3 `study.json`

The study record exactly as `validateStudy` returns it, with `filePath: null`. It therefore carries the id (reassigned
on import, kept as the manifest's `source_id`), `fileName`, `addedAt`, `view`, `region`, `anteriorSide`,
`predictionId`, the failure fields, `name`, `workspaceFolder`, `subjectId`, `timepoint`, `filmDate`, `note`,
`reviewedAt`, `labelFile`, `labelComment`, `thumbnail`, `measurements`, `geometry`, `qc`, `calibration` and
`clinical`. Demo studies are never written (B6 reads real rows only).

## 4. Export

### 4.1 The button

On the Find tab's bar beside Delete and Segment: `Export N selected` while any visible real row is ticked, else
`Export all` over the visible real rows; `data-find-key` `export-bundle`. Disabled, with the bar's visible note, while
a run or batch is in flight (`WAIT_FOR_RUN` / `WAIT_FOR_BATCH`), while studies are not being saved
(`persistenceDisabledReason`: nothing is on disk to copy), while an export is in flight (`Exporting…`), and when the
rows are empty. It needs no confirmation: the folder picker is the commitment.

### 4.2 The flow

1. The renderer takes the rows (`rowsToExport`) and asks main for a parent folder through the existing
   `chooseFolder` (`choose-folder`, an `openDirectory` dialog); cancel does nothing.
2. `planExport(studies, now)` in the new pure `renderer/data/bundle.js` returns the bundle's folder name, and per
   study its folder name and the study record with `filePath` cleared. Pure: no I/O.
3. `exportBundle({ parent, name, entries })` (new IPC, root `bundle-io.js`) creates the folder, then per study:
   writes `study.json`; copies `predictions/<id>.json` when it exists; copies `labels/<labelFile>` when the record
   names one and it exists; copies `calibrations/<sha256>.json` when `calibration.source_sha256` names one that
   exists; streams the film from the study's `filePath` into `film/<fileName>` while hashing it. A study whose film
   path is null, missing or unreadable keeps everything else and is listed under `filmsMissing`; a sidecar or record
   that exists but cannot be read is listed under `notRead` and left out. Then the manifest. It resolves
   `{ path, written, filmsMissing, notRead }`; a failure to create the folder or write the manifest rejects with a
   display-ready message, and a partial folder is left for the user to delete (it has no manifest, so it cannot be
   imported).
4. `exportMessage(result)` builds the toast: `Exported 12 studies to <path>`, then `· 2 films were not found and
   were left out (a, b)` and `· 1 sidecar could not be read (c)` when non-zero; the toast's duration follows
   `toastDuration`.

*Amended 2026-10-15 (final review, rulings S37, S39, S40):* a film is missing only when its source is absent or will
not open; once it is open, or once a sidecar, record or reference has parsed, a failure to copy it into the bundle
rejects the export with `The film <name> could not be written to the bundle. Is the folder full or read-only?` (and the
like for the other three), so a full or read-only stick is never reported as films not found. `notRead` names a sidecar
or reference by the study's file name, never its record id, and the clause reads `· 1 file could not be read (c.dcm
sidecar)`, since the list holds three kinds of file.

Main-process rules: the parent must be an existing directory; names come from the renderer but are validated with
`safeStem`'s character rules and the sidecar id (`/^SP-\d{4,}$/`) and label (`LABEL_FILE`) regexes before any path is
built; nothing outside `<userData>` and the chosen parent is read or written.

## 5. Import

### 5.1 The button

`Import bundle…` beside `Choose radiograph` on the Studies screen's dropzone, `data-find-key` `import-bundle`.
Disabled under export's conditions (a run or batch in flight, studies not being saved, an import in flight).

### 5.2 Reading

The user picks the bundle folder (`chooseFolder`). `readBundle(dir)` (new IPC, `bundle-io.js`) requires
`manifest.json` with `schema` `spinecontour.bundle/1` (anything else rejects: `This folder is not a Spine Contour
bundle.` / `This bundle was written by a newer Spine Contour (schema <id>). Update the app to import it.`), then per
manifest entry reads `study.json` and the label record (small JSON; a missing or unparseable file is reported, not
fatal) and checks that the named sidecar, calibration and film exist. It returns the manifest, each entry's parsed
study and record, and the presence flags. Sidecars and films are never read into the renderer.

### 5.3 Matching

A bundle study matches a local study when their film hashes agree:

- the bundle's hash is the manifest's `film_sha256` (null when the film was not exported: then the bundle's
  record's `image.sha256`, the stored-image hash, matches only the `image.sha256` of a local record, read for the
  local studies that share the bundle study's `fileName` and have a record);
- a local model result's hash is `study.calibration?.source_sha256 ?? study.geometry?.source_sha256`;
- a local study with neither (unsegmented or hand-placed) that shares the bundle study's `fileName` is hashed on
  request: the renderer asks `hashFilms(paths)` (new IPC) for those local films only, and a film that cannot be read
  matches nothing.

File name alone never matches. Two bundle studies matching the same local study are reported; the later-saved one
applies.

### 5.4 The rule

For each bundle study, in manifest order, `planImport({ bundle, studies, localHashes, now })` (pure, `bundle.js`)
decides:

| Case | Action |
|---|---|
| `study.json` missing, or `validateStudy` rejects it (the same checks `load-studies` applies, run through `validate` on a one-record store) | **skip**, `malformed` |
| no local match | **add** |
| match; the local study is open in edit mode or has a stashed editor (`hasStashedEditor`) | **skip**, `being edited` |
| match; the bundle has a record and the local study has none | **update** |
| match; both have records and the bundle's `saved_at` parses later than the local record's | **update** |
| match; otherwise (older, equal, unparseable, or neither has a record) | **skip**, `already in the library` |

Local records are read through `loadLabelRecord(labelFile)` only where the rule needs them: `saved_at` for the
matched studies, and `image.sha256` for the same-named candidates of §5.3's no-film fallback. No other record is
opened.

### 5.5 Confirming

The Studies bar shows an inline prompt (Delete's pattern, §5.3 of the studies-table spec): `Import from <folder>: 10
to add, 2 to update, 3 to skip. The films stay in this folder, so keep it where it is.` with `Import` and `Cancel`.
Focus lands on Cancel. A plan with nothing to add or update shows the toast `Nothing to import: …` with the skip
reasons instead of the prompt.

### 5.6 Adding

Ids come from `nextId` over the current list, assigned in manifest order. Per study, `importBundle({ dir, actions })`
(new IPC, main) first places the files, then the renderer patches the store, in the order the run-complete path uses
(a record that says segmented must point at a stored image that exists):

1. the sidecar, when present, copied to `predictions/<newId>.json` (its `prediction_id` is the record's
   `predictionId`; both come from the bundle, so `predictionMatchesStudy` holds);
2. the label record, when present, copied to `labels/<name>`, `name` from `labelFileName(stem, taken)` over the
   library's names and the names already assigned in this import;
3. the calibration reference, when present, saved through the calibration store's `save` (which validates it);
4. then the record joins `state.studies` in one `setState`: the bundle's record with the new `id`, `filePath` the
   absolute path of `film/<fileName>` inside the bundle (or null when the film was not exported), `labelFile` the
   name from step 2, `labelComment` from `study.json`, falling back to the record's `comment`, `addedAt` kept.

*Amended 2026-10-15 (final review, ruling S38):* for an add and an update (§5.7) alike, every bundle file a study
places is parsed first (`readBundle` already parses the sidecar and the reference, so a damaged one makes the entry
`malformed` before the prompt), then the files are written in the order calibration reference, sidecar, label record
last. A stop before the record leaves the local record older than the bundle's, so importing again plans the study
again instead of skipping it as already in the library.

A study without a film imports with `filePath: null` and is named in the toast (`without film`); a model result still
opens on its stored image, a hand-placed one shows the existing film-not-found behaviour.

### 5.7 Updating

The local study keeps `id`, `filePath`, `addedAt`, `name`, `workspaceFolder`, `subjectId`, `timepoint`, `filmDate`,
`note` and `clinical`. It takes from the bundle: `view`, `region`, `anteriorSide`, `predictionId`,
`processingError`, `processingErrorAt`, `measurements`, `geometry`, `qc`, `calibration`, `thumbnail`, `reviewedAt`,
`labelComment`, the sidecar and the label record. Files first: the bundle's sidecar replaces `predictions/<id>.json`,
or the local one is deleted when the bundle's study has none (a hand-placed newer result over an old model result);
the bundle's record is written over `labels/<localLabelFile>`, or under a new name when the local study had none; the
calibration reference is saved when present. Then the record is patched in one `setState`. The updated study is
treated as a re-run study: its level editor state is forgotten (`forgetLevelEditor`) and its cached images dropped,
so the next open reads the new files.

### 5.8 The toast

`Imported 10 studies, updated 2, skipped 3 (already in the library: a, b; being edited: c)`, with `malformed` and
`without film` clauses when non-zero, through `importMessage(result)` and `toastDuration`. A write failure mid-import
stops at that study: the studies already placed stay, the toast says how many were imported before the failure and
why it stopped, and the bundle can be imported again (its remaining studies match nothing yet).

*Amended 2026-10-15 (final review, ruling S38):* only a write that fails in this library's data folder stops an
import. A bundle file that is gone or damaged by the time it is placed, or a reference the calibration store refuses,
skips that study, nothing of it written, and the import goes on; the toast counts it under `malformed`. After a stop,
importing again skips the studies already placed as already in the library (their records are the bundle's) and
offers the one it stopped at again.

## 6. Modules and IPC

| File | Responsibility | Status |
|---|---|---|
| `renderer/data/bundle.js` | pure: `BUNDLE_SCHEMA`, `bundleFolderName(now)`, `planExport`, `planImport`, `exportMessage`, `importMessage`, the hash and newer-wins rules | create |
| `renderer/data/labels.js` | `safeStem` moved here from `label-record.js` and exported | modify |
| `bundle-io.js` (root, CommonJS) | `exportBundle`, `readBundle`, `hashFiles`, `placeImport`; path validation shared with main.js (`labelPath`, the sidecar path builder, moved into it or passed in) | create |
| `main.js` | handlers `export-bundle`, `read-bundle`, `hash-films`, `import-bundle`; `choose-folder` reused | modify |
| `preload.js`, `renderer/api.js` | `exportBundle`, `readBundle`, `hashFilms`, `importBundle`, the writes gated by `assertWritable` like `saveStudies` | modify |
| `renderer/screens/studies.js` | the two buttons, the export flow, the import flow and its prompt | modify |
| `renderer/data/persistence.js` | nothing new beyond the editor spec's `labelComment`; `validate` reused for bundle records | — |
| `styles/screens/studies.css` | the import prompt and the two buttons' states | modify |
| `docs/bundles.md` | user doc: what a bundle holds, the identifiers warning (B3), keep the folder (B5), the duplicate rule (B4) | create |

Boundaries: `renderer/data/*` never imports from screens or components; `bundle.js` imports `nextId` and `validate`
from `persistence.js`, `labelFileName` from `label-record.js`, `safeStem` from `labels.js`, `isHandPlaced` from
`predictions.js`; `hasStashedEditor` is handed in by the screen, never imported. `bundle-io.js` imports `store-io.js`'s
`writeJsonAtomic` and `readJsonOrNull`. No bundler, no dependency: `node:fs/promises`, `node:crypto` and `node:path`
only.

## 7. Testing

Unit:

- `bundle.test.js`: folder names and clash suffixes (case-insensitive); `planExport` clears `filePath` and writes no
  demo; `planImport` over every row of §5.4 (hash agreement from calibration, from geometry, from a hashed local film;
  file name alone never matches; newer, equal, older and unparseable `saved_at`; no record on either side; being
  edited; malformed); id assignment in manifest order; label names avoiding both the library's and this import's;
  `exportMessage` and `importMessage` clauses.
- `bundle-io.test.js` (temp folders, like `store-io.test.js`): the layout written and the manifest written last; a
  missing film reported and the study still written; `readBundle` refusing no manifest, a wrong schema, a newer
  schema, a path with `..` or a separator; `hashFiles` on a missing file; `placeImport` copying under the given names
  and refusing a name the regexes reject; the sidecar delete on update.
- `api.test.js` / preload wiring: the four channels, the writes gated.
- `labels.test.js`: `safeStem` where it now lives; `label-record.test.js` unchanged in behaviour.

Smoke (`tools/smoke/smoke-bundle.mjs`): launch on scratch profile A with synthetic films, segment two and hand-place
one, comment and review one, export all to a temp folder; read the folder (manifest, study files, the record, the
film bytes' hash); launch on scratch profile B, import, read the Find list (three rows, statuses, the comment in
search), open one, enter edit mode, confirm the record loaded; import again (three skipped, already in the library);
save an edit on B, export from B, import into A (one updated, the rest skipped). DOM, store and file reads only.

The human gate: a real export from the workstation's library to a stick, an import on the owner's other computer,
re-run and window / level on an imported DICOM, and a second import after an edit.

## 8. Amendments this forces

- The contract: the new root module and its channel list, `api.js`'s function list, the `data/bundle.js` and
  `safeStem` boundaries.
- `docs/superpowers/HANDOFF.md`, `CLAUDE.md`, `README.md` (the user-facing feature list), `docs/level-editor.md` "The
  label record" (the record travels in bundles; `comment`).
- `docs/ROADMAP.md` §1: a note that the bundle is the round trip for annotations; the CSV import stays its own item.
- `tools/smoke/README.md`: the new suite and its two profiles.
- A release note when the owner picks the number (1.3.0 is the suggestion if the editor spec ships as 1.2.0; one
  release if both ship together).

## 9. Risks

- **Large bundles.** Films of tens of megabytes each are streamed, never buffered, and the export button reads
  `Exporting…` until the toast. There is no progress bar; a hundred DICOMs take as long as copying them.
- **The bundle folder moves** (B5): the existing relocate flow is the remedy; the import prompt and `docs/bundles.md`
  say to keep the folder.
- **Identifiers in DICOM headers** (B3): the user doc states it; a later option to carry the stored 8-bit image only
  (the "stored image only" choice the owner declined for now) would need an import path for a PNG study with no
  original.
- **A library's study edited on both computers** is resolved by `saved_at` only; the older annotation is dropped on
  update, with its film named in the toast. A three-way merge is out of scope.
- **Embeddings** (the similar-cases work, not on `main`): nothing to carry until it lands; when it does, an imported
  study has none until an Embed batch runs, as a newly segmented one does today.
