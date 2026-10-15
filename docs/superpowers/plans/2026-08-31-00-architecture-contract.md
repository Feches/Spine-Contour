# Architecture Contract — Spine Contour UI Redesign

> **Read this before any task in plans 01–07.** It fixes module boundaries, function
> signatures, and data shapes. Tasks in separate plans are implemented by workers who
> cannot see each other's code; this document is the only thing keeping their
> interfaces compatible. If a plan seems to contradict this file, this file wins —
> raise the discrepancy rather than guessing.

**Spec:** [`2026-08-31-spine-contour-ui-redesign-design.md`](../specs/2026-08-31-spine-contour-ui-redesign-design.md)

---

## Plan sequence

| # | Plan | Deliverable at the end |
|---|---|---|
| 01 | Preview build isolation | `Spine-Contour-Preview.exe` installs beside the real app |
| 02 | Foundation | Landing + Sidebar, tokens, theme toggle, `SS` rename |
| 03 | Analysis screen | Full measure flow, redesigned — **parity with today** |
| 04 | Landmark editing | Direct manipulation replaces the button matrix |
| 05 | Persistence & Studies | Measurements survive restart |
| 06 | Workspace & clinical data | Folder scan, CSV import, clinical grid |
| 07 | Find similar & comparison | Similarity ranking, side-by-side panes |

Each plan leaves the application launchable and usable. Do not start a plan until the
previous one's final commit is on the branch.

---

## Global constraints

These apply to **every task in every plan**. They are not repeated per task.

- **No bundler, no framework, no npm runtime dependencies.** Vanilla ES modules only.
  `package.json` `dependencies` stays empty; `devDependencies` stays exactly
  `electron` and `electron-builder`.
- **CSP is `default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'none'`.**
  It must not be loosened. No CDN, no Google Fonts, no remote anything.
- **Fonts are self-hosted** from `assets/fonts/`. Source Sans 3 and Chivo Mono, both SIL OFL.
- **Never display a fabricated measurement.** Absent values render the em dash `—`,
  never `0`, never `N/A`, never a guess.
- **Never label a value with a name it isn't.** See the `SS` rename (plan 02) and the
  `FEMORAL FIT CONFIDENCE` badge (plan 03).
- **Node's built-in test runner only.** No Jest, Vitest, or Mocha. The command is
  `node --test test/*.test.js` — verified on Node v24.19.0 on this machine. A bare
  directory argument (`node --test test/`) **fails** with `Cannot find module`, because
  Node treats it as a CommonJS entry point rather than a search root. Do not "fix" it
  back to the directory form.
- `renderer/package.json` and `test/package.json` each contain exactly `{"type":"module"}`
  so Node parses those trees as ESM while the repo root stays CommonJS for `main.js`
  and `preload.js`. This has no effect on Electron, which loads the renderer via
  `<script type="module">` and ignores `package.json` entirely.
- **Every `<script>` is `type="module"`.** No global scope leakage.
- Target Electron 44 / Chromium — modern syntax is fine. No transpilation.
- Commit after every task. Conventional commit prefixes (`feat:`, `fix:`, `test:`, `chore:`).

---

## File structure

Files marked **(new)** do not exist yet.

```
index.html                        shell only — no inline CSS, no inline script
main.js                           Electron main; gained its IPC handlers in plans 05–06
preload.js                        contextBridge surface; grew in plans 05–06
store-io.js                       (plan 05) disk I/O for the study store and the prediction sidecars — CommonJS
scan-folder.js                    (plan 06) recursive film discovery for the Workspace folder scan — CommonJS, node:fs only,
                                  required by main.js; listed in BOTH electron-builder allowlists
tools/smoke/                      (plan 05) CDP smoke harness: launch.mjs, cdp-lib.mjs, cdp.mjs, smoke-*.mjs — dev only, not packaged
```

**Why `store-io.js` is at the root and not under `renderer/data/`:** it uses `node:fs`,
and `renderer/` is loaded by the browser through `<script type="module">`, which cannot
resolve `node:` specifiers at all. `renderer/data/persistence.js` therefore stays pure —
IDs, merging, validation — and all filesystem work lives in `store-io.js`, imported only
by `main.js`. Both declare `STORE_VERSION`; a test asserts they stay equal. The repo root is
CommonJS (`package.json` has no `"type"`), so `store-io.js` is written with `require`/
`module.exports` and `main.js` requires it; the ESM tests import its named exports. Its
interface: `STORE_VERSION`, `isValidStoreShape(parsed)`, `readStudyStore(storePath) →
{version, studies}` (raw, after quarantine), `writeStudyStore(storePath, studies)`,
`readJsonOrNull(path)`, `writeJsonAtomic(path, value)`. **It must be listed in both
electron-builder allowlists** (`package.json` `build.files` and
`electron-builder.preview.yml` `files`); a root file `main.js` requires that is missing from
either ships an installer that opens a blank window. See "Persistence" below for the files it
writes.

```
styles/                           (new)
  tokens.css                      light + dark custom properties, nothing else
  base.css                        reset, @font-face, element defaults
  components.css                  button, pill, input, card, toast, badge
  screens/landing.css
  screens/workspace.css
  screens/studies.css
  screens/analysis.css

assets/fonts/                     (new) woff2 files

renderer/                         (new)
  main.js                         bootstrap: load studies, mount, subscribe
  store.js                        state container
  router.js                       screen switching
  api.js                          wraps window.spineContour
  batch.js                        (2026-09-08, batch spec §8.2) startBatch(ids), stopBatch() — the one wiring of data/batch.js's
                                  createBatchDriver to the store, the toast, persistenceDisabledReason and segmentStudy; module scope
  demo-studies.js                 (2026-09-10, studies-table spec §9) demoToggleAvailable(), setDemoStudiesShown(shown) — the one wiring of
                                  data/demo-visibility.js to the store, the toast and api.setDemoStudiesHidden; module scope
  level-editor.js                 (2026-10-10) the level editor's wiring, the pattern of batch.js: enter/exit, save, discard, every
                                  panel and stage action, the per-study stash; the ONLY writer of a non-null
                                  state.levelEditor; never imports components/viewer.js or screens/analysis.js (they hand it their
                                  parts through configureLevelEditor); module scope; verified by smoke. (2026-10-11, G3) The
                                  window / level state moved out to film-window.js. (2026-10-12, G6, D19) writeReviewRecord:
                                  the label record Mark reviewed writes for a film with none, through writeRecord, the one
                                  write it shares with Save edits. (2026-10-15, annotation editor round 2) setLevelComment(text)
                                  and revertPlacedLevel(code); sync passes { clearFailure: isHandPlaced(study) } to commitGeometry;
                                  saveLevelEdits writes the comment into the record and the study's labelComment
  film-window.js                  (2026-10-11, gate feedback G3/G4, plan D15–D17) the view's window / level, the pattern of
                                  level-editor.js: configureFilmWindow({ensureFilm}), windowFor(state, study), openWindowPanel(),
                                  ensureWindowLoaded(), closeWindowPanel(), setWindow({width, level}), resetWindow(),
                                  forgetFilmWindow(studyId), and (the review of G3/G4, R35) windowNeedsDecode(state, study,
                                  images) and redecodeKeptWindow(studyId); the ONLY writer of state.filmWindow; no subscriber;
                                  never imports components/viewer.js or screens/analysis.js; module scope; test/film-window.test.js
  dom.js                          el() helper, tiny render utilities

  screens/landing.js
  screens/workspace.js            exports render(state), loadWorkspaceStudies(state) → {…, updated, clinicalUpdated, seeding}
                                  (2026-09-07), workspaceLoadedMessage({added, known, updated, join, mapping, seeding,
                                  clinicalUpdated}) (plan 06; §8.4 clauses 2026-09-07); the folder table (§8.5) and fixed chips
                                  for structural columns; clinicalUpdated gates the "no blank clinical fields to fill" clause
                                  (2026-09-07)
  screens/studies.js              exports render(state), formatDate, matchesQuery, newStudy, studyFromFile (2026-09-11: newStudy plus the
                                  fields the film's own name supplies, for the picker and a drop); mounts screens/parameters.js
                                  under a Find | Parameters tab strip (2026-09-06); (2026-09-08) the Find tab's filter bar
                                  (workspace and folder selects over the shared keys), row ticks and select-all over the
                                  shared paramSelected, the segment button and the batch's progress group; the summary
                                  reads UNSEGMENTED
                                  ; (2026-09-10, studies-table spec) sortable headers over findSort, the SUBJECT column
                                  with its in-place editor, Delete over the ticked visible rows with an inline prompt,
                                  the summary's TO REVIEW clause; the library-level Delete all is gone
  screens/analysis.js             exports setFilePayload, releaseStudy(studyId) (plan 06); segmentStudy(studyId, {batch})
                                  → {ok, warning?} | {ok: false, reason} (2026-09-08, batch spec §8.3) — the run core,
                                  never throws; state.running set and cleared inside; restoreFilm's run guard is per study
                                  (a per-study run counter, not the global runRevision) so a batch's turns do not drop an
                                  unrelated restore (2026-09-08, batch spec §8.3); (2026-09-10) Mark reviewed with its note, and the
                                  list's status badge in the header
  screens/parameters.js           (2026-09-06) the Parameters tab: exports mountParameters(host, {onOpen}) → {update(live, queried)};
                                  reads paramFilters/paramSort/paramLevels/paramSelected, writes them; never imports screens/; the paired export button and its note (2026-09-08, spec §10.4)

  components/sidebar.js
  components/viewer.js            toolbar, canvas host, every pointer/keyboard listener on the stage;
                                  exports recordPrediction(studyId, {measurements, geometry}, measuredGeometry = geometry)
                                  (plan 04; plan 05 added the third argument — the geometry the study's CURRENT
                                  numbers describe, for a corrected study restored from disk). The viewer object
                                  mountViewer returns gains setFilmStatus('loading'|'missing'|null) (plan 05).
                                  Exports forgetPrediction(studyId) (plan 06). The run card's eyebrow is UNSEGMENTED
                                  for a real study without a result, QUEUED only for a film in the running batch,
                                  RUNNING for the film in flight (2026-09-08); (2026-10-01, issue #39) FAILED, with
                                  the stored reason and the Run segmentation button, for a real study without a result
                                  whose last attempt failed and that is neither running nor queued; the Run and re-run
                                  buttons are disabled while a batch is up.
  components/measurements.js      right panel, Measurements tab
  components/similar.js           right panel, Find similar tab
  components/clinical-data.js     drawer; exports mountClinicalData(host) → {update} (plan 06) — rows from
                                  visibleStudies(state), [open] until plan 07; a Study group of four cells (2026-09-07, spec §9)
  components/toast.js             showToast(message), render(state); toastDuration(text) (2026-09-08): 2.2 s to forty characters,
                                  then 40 ms per character, capped at 8 s, for every toast
  components/checkbox.js          (2026-09-08) checkbox({key, keyAttr, label, checked, note, ariaLabel, indeterminate, onChange, onClick})
                                  — the tick box both Studies tabs build; keyAttr is data-param-key (grid) or data-find-key (list)
  components/status-badge.js      (2026-09-10) statusBadge(status, title), unsupportedViewBadge(view) — the one badge both screens
                                  show; (2026-10-01) `title`, when a non-empty string, is the pill's tooltip (failureTitle for Failed)
  components/level-editor.js      (2026-10-10) the Vertebral levels panel that replaces the tabs and Measurements in edit mode:
                                  mountLevelEditor(host) → {update(state, study)}; DOM only; every control carries a data-level-key
                                  (each group a data-group-key, each row a data-level-row); every handler calls renderer/level-editor.js

  viewer/canvas.js                layered rendering
  viewer/interactions.js          pure interaction logic: zoom steps, ~~hit tests, Tab order, nudge~~ (superseded 2026-10-10 by
                                  viewer/level-handles.js), arrow deltas, chord, debounce (no DOM)
  viewer/level-handles.js         (2026-10-10) a level's handles, client-space hit testing, moving and nudging a handle (rim points
                                  refit the head, never under 0.5 px), the Tab order across the editor; pure
  viewer/window-level.js          (2026-10-10) display-only window / level: range, default, clamp, drag rule, chip text, crop to the
                                  stored image height, the decoded film as a RawFilm, the linear LUT; pure
  viewer/level-labels.js          (2026-10-13, gate feedback G7, plan D20) where a level's label plate sits (labelAnchor,
                                  labelPlacement, plateAnteriorSide; R43) and the plate drag's pure parts (plateOffset, plateAt,
                                  movePlate, resetPlate; R44); pure
  viewer/measure-queue.js         (plan 04) createMeasureQueue({measure, getState, setState, showToast, debounceMs})
                                  → {commitGeometry, replaceMeasured}: per-study revisions, one owner-tracked
                                  debounce, flush on study switch; session-only drafts, atomic geometry/measurement commit.
                                  (2026-10-15, round 2, spec §4.3) commitGeometry(studyId, geometry, { clearFailure }): the
                                  write that lands nulls processingError and processingErrorAt in the same patch
  viewer/geometry.js              circle fit, coordinate transforms

  data/demo-studies.js            the nine fabricated studies
  data/persistence.js             study store read/write
  data/measurements.js            API response → display rows
  data/similarity.js              weighted distance
  data/status.js                  status derivation
  data/failure.js                 (2026-10-01, issue #39) failureReason(message), failureTitle(reason, at), capReason — the stored
                                  text of a failed segmentation attempt and the Failed pill's tooltip; pure
  data/csv.js                     parse, auto-map, export; toPairedCsv and delta1 (2026-09-08); (2026-09-12) toCsv's
                                  Study ID is studyName (the stem) and the record id is not written; fileStem now
                                  lives in data/labels.js and is re-exported here, so labels.js imports nothing from csv.js
  data/labels.js                  how a study names itself and where it came from
  data/timepoints.js              (2026-09-07) pure: timepoint and view vocabularies, token normalisation, §7.2 sort order,
                                  parseFilmDate, the drawer's suggestion lists
  data/seeding.js                 (2026-09-07) pure: folder segments, §8.1 inference from folders and stems, folderRows for the
                                  Workspace card's table, seedFields for the §8.3 precedence; (2026-09-11) inferFromStem reads
                                  underscore-separated fields -- subject, then timepoint/view/date in any order, then the note --
                                  and seedFields seeds filmDate and note from the stem (spec §8.1 rule 3 amended)
  data/parameters.js              (2026-09-06) pure: columns, values, filter options, filter, sort, empty reason, export
                                  filename for the Parameters tab -- see the file header for the exported names;
                                  selection helpers toggleId/withIds/selectedVisible/rowsToExport (2026-09-07); exportFileName(workspace, kind = 'parameters') (2026-09-08);
                                  matchesLocation(study, filters) (2026-09-08)
  data/pairing.js                 (2026-09-08) pure: pairStudies(rows, {post}) → {visits, post, subjects: [{key, subject, visits: Map}],
                                  unpaired, ambiguous, noSubject, noTimepoint, otherVisits, merged, disagreements} for the paired
                                  export (spec §11.2, amended 2026-09-11: a VISIT is subject + label + film date; `visits` are
                                  headers, numbered `<label> N` by date when a subject has several; a subject's Map is keyed by
                                  header and each Visit carries header, label, filmDate, films (primary first), values per
                                  MEASUREMENT_COLUMNS, disagreements and derived (a merged visit's PI-LL mismatch is derived
                                  from its merged PI and LL and flagged when they came from different films); same-day films
                                  merge under the unnoted-primary rule; ambiguous entries carry kind 'films'|'visits');
                                  postFromFilters(filters); pairedExportMessage(pairing, savedTo) (§11.3, with the merged,
                                  disagreement and derived-across-films clauses)
  data/batch.js                   (2026-09-08) pure: planBatch({visible, selected, running}) → {ids, label, note, enabled};
                                  newBatch, advance, withStopping, isQueued, progressText, sidebarText, batchMessage;
                                  createBatchDriver({segment, getState, setState, showToast, persistenceDisabledReason})
  data/find.js                    (2026-09-10, studies-table spec §6) DEFAULT_FIND_SORT, FIND_SORT_KEYS, statusRank, toggleFindSort,
                                  sortFindRows(studies, sort, runningId, batch), (2026-10-01) summaryCounts(studies, runningId,
                                  batch) — the Find list's sort and the Studies summary's counts; pure
  data/demo-visibility.js         (2026-09-10, §9) demoStudiesShown(state), demoVisibilityPatch(state, shown) — pure
  data/levels.js                  (2026-10-10) the level model: sixteen codes in five groups, kinds, names, film-type defaults, state
                                  derivation, placement steps, visibility, the unsaved count, summary and training status, the
                                  measurement-to-level table behind the dependency notes; the LevelEditor and WindowState typedefs;
                                  (2026-10-11, D18) pointKeys and changedPoints, the record's edited points; (2026-10-15, round 2)
                                  revertLevel, setComment, commentChanged and the editor's comment / savedComment; pure
  data/level-projection.js        (2026-10-10) the level model into study.geometry per region (projectGeometry, projectionRegion,
                                  regionFollowsLevels, projectsLevel, anteriorSideFrom, quadrilateral); the reverse direction is
                                  levels.js levelsFromGeometry; pure
  data/label-record.js            (2026-10-10) the label record: toLabelRecord, recordLevels, labelFileName (a safe stem, -2/-3 on a
                                  clash), viewSlug, appVersion, LABEL_SCHEMA; (2026-10-11, D18) each entry's edited_points and the
                                  record's edits summary; (2026-10-15, round 2) normalizeComment, recordComment and the record's
                                  comment; pure
  data/contours.js                (2026-10-10) a level's outline in the label mask (traceLabel, simplify, levelContours), for the
                                  record's contour; pure

backend/decode.py                 (2026-10-10) decode_film(payload): the original film's 16-bit pixels, value range and DICOM window
                                  defaults for window / level; stateless, runs no model
test/fixtures/schema-check.js     (2026-10-10) a hand-written JSON Schema (draft 2020-12 subset) checker for the label record; test
                                  only, not matched by the unit-test glob (the app takes no JSON Schema library)

test/                             (new) mirrors renderer/ — node --test
  geometry.test.js  similarity.test.js  status.test.js
  csv.test.js  measurements.test.js  persistence.test.js  pairing.test.js  toast.test.js
  scan-folder.test.js  workspace.test.js  clinical-data.test.js  batch.test.js

electron-builder.preview.yml      (new, plan 01)
.github/workflows/windows-preview.yml   (new, plan 01)
```

`renderer.js` at the repo root is **deleted** at the end of plan 03, once every
behaviour it owns has moved. Do not delete it earlier — plans 02 and 03 reference it.

---

## Data shapes

### Study

The single record type. Demo and real studies share it exactly.

```js
/**
 * @typedef {Object} Study
 * @property {string}  id          'SP-0042' (demo) | 'SP-1000'+ (real)
 * @property {'real'|'demo'} source
 * @property {string|null} filePath   absolute path; null for demo
 * @property {string}  fileName
 * @property {string|null} name    display name, defaulted from fileName's stem and renamable
 * @property {string|null} workspaceFolder  the workspace ROOT this film was loaded from;
 *                                          null for a film added with the picker or dropped
 * @property {string|null} subjectId   (2026-09-07, pre-op/post-op spec §7.1) study code shared by every film of one
 *                                     subject; compared case-insensitively after trimming; never an MRN, never burned in
 * @property {string|null} timepoint   'Pre-op' | 'Intra-op' | 'Post-op' | 'N wk' | 'N mo' | 'N yr' | any user label (§7.2)
 * @property {string|null} filmDate    'YYYY-MM-DD', the acquisition date; never addedAt
 * @property {string|null} note        (2026-09-11, pre-op/post-op spec §7.1 amended) free text: the filename's plain
 *                                     fields after the recognised ones (spec §8.1 rule 3), or typed in the drawer
 * @property {string|null} reviewedAt  (2026-09-10, studies-table spec §8.1) ISO timestamp of the human review, set on the
 *                                     Analysis screen; null until marked; cleared by every write that replaces
 *                                     measurements, geometry or calibration (§8.4)
 * @property {string|null} processingError    (1.0.13) the reason the last segmentation attempt failed; (2026-10-01) the
 *                                            plain sentence data/failure.js failureReason gives (a failure 1.0.13
 *                                            recorded loads with its stored, possibly raw, text until the next attempt);
 *                                            null when no attempt failed; cleared by a successful run and by a
 *                                            Region/Orientation change
 * @property {string|null} processingErrorAt  (2026-10-01, issue #39) ISO time of that failure, written and cleared with
 *                                            it; null on a failure 1.0.13 recorded
 * @property {string}  addedAt     ISO 8601
 * @property {string}  view        'Standing lateral' by default; seeded per folder by a workspace load and editable in the drawer (2026-09-07); '' when cleared
 * @property {string|null} thumbnail  data URI, max 128px long edge; null if none
 * @property {Measurements|null} measurements  null when never segmented
 * @property {Geometry|null}     geometry
 * @property {Qc|null}           qc
 * @property {Object|null}       calibration  compact original-image scale record (2026-09-09 amendment below)
 * @property {string|null} labelFile  (2026-10-10, level editor) the bare file name of this film's label record under
 *                                    userData/labels/ (`<stem>.label.json`, `-2`/`-3` on a clash), set by its first
 *                                    Save edits (or, 2026-10-12, D19, by Mark reviewed on a film with none) and
 *                                    kept across saves; null until then
 * @property {string|null} labelComment  (2026-10-15, annotation editor round 2) the display copy of the label record's
 *                                    comment: its trimmed text, null for none; set with labelFile by Save edits (and by the
 *                                    bundle import), kept by a re-run, a Region change and Unmark reviewed
 * @property {Object<string,string>} clinical   field name → value
 */
```

`status` is **derived from the record, the review mark included** — see `data/status.js` (2026-09-10).

`name`, `workspaceFolder`, `subjectId`, `timepoint`, `filmDate`, `note` and `reviewedAt` are all **optional and default to `null`**, so they carry no
`STORE_VERSION` bump: a record written before they existed loads unchanged and simply reads as
its `SP-nnnn` id with no workspace. All seven must appear in `validateStudy`'s returned object or the
saver writes them and the next load silently drops them. `id` remains the record's identity —
it names the sidecar, keys the delete, and is the CSV's `Study ID` — so a rename is cosmetic by
construction and can never orphan a file. The folder shown beside the workspace is **derived
from `filePath`**, never stored, so it stays correct when a moved film is relocated. `filmDate`
must match `/^\d{4}-\d{2}-\d{2}$/` or `validateStudy` nulls it with a warning. (2026-10-01, issue #39) `processingError`
(1.0.13) and `processingErrorAt` are optional-null on the same terms, with no `STORE_VERSION` bump, and are listed in
`validateStudy` too; `processingErrorAt` is kept only when it parses as a date and `processingError` is set, and any
other value that is present is nulled with a warning. (2026-10-15, annotation editor round 2, spec §3.2) `labelComment`
is optional-null on the terms of `note` (`optionalText`), listed in `validateStudy`'s returned object so it survives a
reload, with no `STORE_VERSION` bump; `newStudy` sets it null.

Demo studies additionally carry `dx`, `plan`, `hx`, `outcome`, `pt`, `sex`, `age`,
`bmi`, `odi`, `conf` for display. Real studies leave these absent; the UI renders `—`.

### Measurements

Exactly the backend response, after the plan-02 rename.

```js
{
  SS: number|null,      // degrees — was SI before plan 02
  PI: number|null,
  PT: number|null,
  L1PA?: number|null,   // null for missing anatomy; absent on older/demo studies
  LL: { 'L1-S1': number|null, 'L2-S1'?: number|null, 'L3-S1'?: number|null,
        'L4-S1'?: number|null, 'L5-S1'?: number|null }
}
```

The backend returns every key, with null for unavailable measurements. The optional ones exist for the nine demo studies, which
have no source data for them; `validate` accepts them absent, and a missing or non-finite value
is an absent row (`—`), never `0`.

### Geometry

```js
{
  vertebrae: {
    L1: { superior: [[x,y],[x,y]], inferior: [[x,y],[x,y]],
          quadrilateral: [[x,y],[x,y],[x,y],[x,y]] },
    L2: {...}, L3: {...}, L4: {...}, L5: {...} // only detected levels are present
  },
  s1_superior:     [[x,y],[x,y]]|null,     // [SA, SP]
  l1_center:       [x,y]|null,
  hip_midpoint:    [x,y]|null,
  femoral_circles: [[cx,cy,r],[cx,cy,r]]|[]   // index 0 = left, 1 = right
}
```

### Qc

**Partial results (2026-09-09):** `qc.coverage` contains `partial`, `available`, `missing`
and `unoriented` arrays (except the boolean `partial`). Partial coverage requires review.
Each body may carry `anterior_confirmed: false` when U-Net has no S1 orientation reference;
preserve this flag through `/measure` and disk reload. Those bodies have neutral endpoint
labels and support midpoint disc heights only. Do not compute a numeric PI–LL mismatch or
PI residual from null inputs. `/measure` updates coverage while preserving model/framing
and femoral-fit provenance. The payload always contains some usable anatomy; an entirely
empty result is still rejected. See `docs/partial-segmentation.md` for dependencies.

```js
{ femoral: { method, component_count, circle_union_iou, radii_pixels,
             center_separation_pixels, radius_ratio,
             confidence /* 0..1 */, qc_pass, foreground_pixels } }
```

The renderer reads `femoral.confidence` and the optional `framing` record
(`s1_confidence`, `searched`, `search_confidence`) for review warnings. Other fields are
optional: demo studies carry `{ femoral: { confidence } }` alone rather than invented values, and
`validate` treats `qc` as opaque (any object, else `null`).

---

## Module interfaces

Signatures are binding. Do not rename, reorder parameters, or change return types.

### `renderer/store.js`

```js
export function getState()                      // → State (frozen shallow copy)
export function setState(patchOrFn)             // object | (state) => object
export function subscribe(fn)                   // → unsubscribe()
```

`setState` shallow-merges and notifies synchronously. Subscribers must not call
`setState` during notification. A subscriber that throws is reported through
`console.error` and does not stop the subscribers after it (plan 04): one unguarded read in
a draw function must blank a layer, never freeze the application.

**State shape** — every key, with its initial value:

```js
{
  screen: 'landing',        // 'landing'|'workspace'|'studies'|'analysis'
  ack: false,
  theme: 'light',           // 'light'|'dark'
  navCollapsed: false,
  settingsOpen: false,

  studies: [],              // Study[] — demo + real, merged
  measurementDrafts: {},    // study id → unmeasured Geometry; session-only, never saved
  query: '',
  studiesTab: 'find',       // 'find'|'parameters' (2026-09-06, pre-op/post-op spec §10.1)
  paramFilters: { workspace: null, folder: null, segmentedOnly: true,       // data/parameters.js DEFAULT_FILTERS;
                  timepoint: null, view: null, subject: '', pairedOnly: false, pairedWith: '__any__' },   // (2026-09-07, spec §10.3)
                            // `workspace` is a stored root, HAND_ADDED ('__hand__') or null; `timepoint` a label, NO_TIMEPOINT ('__none__') or null; `pairedWith` is a label or ANY_POST ('__any__', the default: any labelled non-Pre-op film); (2026-09-08) `workspace` and `folder` are shared with the Find tab's selects
  paramSort: { key: 'study', dir: 'asc' },   // key: 'study'|'subject'|'workspace'|a measurement column key (2026-09-07: 'subject' sorts by subject, then §7.2 order)
  paramLevels: false,       // show LL L2–S1..L5–S1 columns
  paramSelected: [],        // string[] study ids ticked on the Parameters grid (2026-09-07); replaced wholesale; session-only; screens/studies.js clears a deleted study's id from it; (2026-09-08) also ticked on the Find tab's rows — one selection for both tabs
                            // All four are read by screens/studies.js's own subscription, never by SCREEN_KEYS.
  findSort: { key: 'date', dir: 'desc' },   // (2026-09-10, studies-table spec §6.1) the Find list's sort: key 'study'|'subject'|'view'|'workspace'|'folder'|'date'|'status'; replaced wholesale; session-only; read by screens/studies.js's own subscription
  openId: null,
  compareId: null,

  tab: 'meas',              // 'meas'|'sim'
  selectedLevel: null,      // 'L1'..'L5'|'S1'|'PI'|'PT'|'SS'|'L1PA'|null  -- see below
  overlays: true,
  overlayOpacity: 50,       // 0..100
  zoom: 1,
  panX: 0,
  panY: 0,
  panMode: false,
  showAllLordosis: false,

  editing: false,
  selection: null,          // Selection — see viewer/interactions.js; (2026-10-10) always null in edit mode, the level editor
                            // holds the focused handle instead
  levelEditor: null,        // (2026-10-10) LevelEditor | null — the level editor's state while editing (typedef in
                            // renderer/data/levels.js); renderer/level-editor.js is the only writer of a non-null value;
                            // session-only, never persisted; reset to null by FRESH_VIEW, a run's completion and changeRegion
  filmWindow: null,         // (2026-10-11, gate feedback G3, plan D15) FilmWindow | null — the open film's window / level,
                            // part of the VIEW like zoom and pan, in every mode: {studyId, open, status: 'loading'|'ready'|
                            // 'unavailable', reason, width, level, defaultWidth, defaultLevel, min, max, range} (typedef in
                            // renderer/film-window.js, its ONLY writer); display only, session-only, never persisted, never in
                            // the label record; reset to null by FRESH_VIEW and by forgetFilmWindow (delete, a run's
                            // completion, changeRegion); entering and leaving edit mode keep it
  platePositions: {},       // (2026-10-13, gate feedback G7, plan D20, R44) { [levelCode]: [dx, dy] } in image px — where the
                            // user has dragged each level's label plate in edit mode; view state like zoom and pan: reset to
                            // {} by FRESH_VIEW, kept through entering and leaving edit mode; written ONLY by
                            // components/viewer.js, always a new object; session-only, never persisted, never in the record
  running: null,            // string | null — the id of the study whose /predict is in flight (plan 05);
                            // one run at a time. `if (state.running)` still means "a run is in flight";
                            // the viewer and the Studies list compare it with a study's id.
  performance: { mode: 'standard', cpuThreads: 2 }, // saved in performance.json
  runStage: null,           // live progress object | null; see v1.0.2 amendment
  batch: null,              // (2026-09-08, batch spec §8.1) the running batch or null: { ids, done, failed,
                            // warnings, skipped, stopping }, replaced wholesale by renderer/batch.js; never persisted;
                            // in SIDEBAR_KEYS and in the Studies screen's own update() key; state.running is untouched

  wsFolder: null,
  wsFiles: [],              // string[] absolute paths
  wsCsv: null,
  wsCsvHeaders: [],
  wsCsvRows: [],            // Object<string,string>[]
  wsMapping: [],            // Mapping[] — see data/csv.js
  wsFolderRows: [],         // (2026-09-07, spec §8.5) {folder, count, timepoint, view}[] — one per scanned folder holding
                            // films, from data/seeding.js folderRows; rebuilt by every scan, replaced wholesale, never persisted

  fields: [],               // string[] active clinical field names — seeded at bootstrap with
                            // clinicalFieldNames(studies) (plan 06); session-only otherwise
  dataOpen: true,
  toast: ''
}
```

### `renderer/api.js`

Every function rejects with an `Error` whose `message` is display-ready.

```js
export async function selectFile()              // → {name, data, path} | null
export async function predict(request)          // → PredictResponse
export async function measure(geometry)         // → {measurements, geometry}
export async function loadStudies()             // → Study[]   (plan 05) VALIDATED — calls validate() on the raw store
export async function saveStudies(studies)      // → void      (plan 05) real studies only; the caller filters
export async function loadPrediction(id)        // → object|null   (plan 05) the raw /predict response saved beside the study
export async function savePrediction(id, response)   // → void   (plan 05)
export async function readFile(filePath)        // → Uint8Array|null   (plan 05) null when the file no longer exists
export function pathForFile(file)               // → string|null   (plan 05) SYNCHRONOUS — a dropped File's absolute path
export function disablePersistence(reason)      // (plan 05) SYNCHRONOUS — after it, saveStudies/savePrediction reject for the session
export function persistenceDisabledReason()     // → string|null   (plan 05) SYNCHRONOUS — the reason, for callers that would otherwise report a rejected write
export function storeLoadNotice()               // → string|null   (plan 05 final review) SYNCHRONOUS — one display-ready sentence about what the main process had to do to the store on disk, set by the last loadStudies()
export async function chooseFolder()            // → string|null   (plan 06)
export async function scanFolder(dirPath)       // → {files: string[], skipped: number}
export async function chooseCsv()               // → string|null
export async function readCsv(filePath)         // → string  (raw text)
export async function deletePrediction(id)      // → void   (plan 06) removes predictions/<id>.json; ENOENT is not an error; rejects for the session after disablePersistence
export async function saveCsv(request)          // → string|null  absolute path, null if cancelled
export async function openExternal(url)         // → void
```

`predict(request)` takes `{name, data, modality: 'xray', bodyPart: 'lumbar', view: 'lateral'}`.
The three selectors are gone from the UI but the values are still sent.

`loadStudies()` is the one place the raw store becomes `Study[]`: it calls
`renderer/data/persistence.js`'s `validate` on what the IPC returns, so every consumer sees the
shapes the viewer and the panel read unguarded. A throw from `validate` is display-ready and is
not wrapped as an IPC failure. `readFile(filePath)` resolves `null` — not an error — when the
file is gone; that is the outcome the relocate flow handles. `pathForFile(file)` is synchronous
and returns `null` whenever the bridge cannot provide a path; a `null` path never blocks a drop.

`storeLoadNotice()` (plan 05 final review) returns whatever the last `loadStudies()` saw in the
raw store's `notice` field, captured **before** validation so it survives a `validate` throw, and
`null` when there was none. `loadStudies()` also calls `disablePersistence(notice)` itself when the
raw store carries `persistenceUnsafe: true`, so no caller can forget the one case where a quarantine
left orphaned sidecars a reused id could overwrite. `disablePersistence(reason)` ignores a falsy or
blank reason rather than assigning it: there is no re-enable path, so `disablePersistence('')` must
not become one.

`scanFolder(dirPath)`'s `skipped` (plan 06) counts unsupported files, links not followed, and
unreadable subfolders; the root folder itself rejects with a display-ready message.
`chooseFolder()` and `chooseCsv()` resolve `null` on cancel (not an error).

`saveCsv(request)` takes `{text, suggestedName}` and opens the native save dialog. It
resolves to the absolute path written, or `null` when the user cancels — cancelling is not
an error and must not produce a toast. Pulled forward from plan 06 during plan 03's manual
verification: the Export CSV button previously wrote to `console.log` and toasted "see
console output", which is a dead button by the spec's own standard — the same standard that
had `Export PDF report` omitted rather than shipped inert.

### `renderer/dom.js`

```js
export function el(tag, props, ...children)     // → HTMLElement
export function clear(node)                     // remove all children
export function mount(node, child)              // clear + append
```

`el('button', {class: 'x', onClick: fn}, 'Label')`. Resolution order for each `props`
key, in exactly this sequence:

1. `undefined` values are skipped entirely.
2. Keys starting `on` whose value is a function bind a listener
   (`onClick` -> `addEventListener('click', fn)`).
3. `class` is set via `setAttribute('class', value)` — `class`, never `className`.
4. A key that **exists as a property on the node** (`key in node`) is assigned as a
   property: `node[key] = value`.
5. Anything else goes through `setAttribute(key, value)`.

Step 4 is load-bearing and must not be simplified to "everything else sets
attributes". `innerHTML` is how every icon and the landing hero mark are injected,
and `setAttribute('innerHTML', '<svg…>')` is inert — the icons would silently render
as nothing. Booleans are worse: `setAttribute('disabled', false)` sets the *string*
`"false"`, which is truthy to the DOM, so a `disabled: !state.ack` button would be
permanently disabled and the Landing gate would never open.

**Two traps that follow from step 4 — avoid these prop keys.** `key in node` also
matches *inherited, getter-only* IDL properties, and assigning to one throws a
`TypeError` under ESM's strict mode. Never pass `style`, `dataset`, `list`, or `form`
as `el()` props: `'style' in node` is true but `HTMLElement.style` is a readonly
`CSSStyleDeclaration`, so `el('div', {style: 'left:12px'})` throws at construction.
Use flat `data-*` keys instead of `dataset`, and set inline styles after construction
(`node.style.cssText = …`) or inside an `innerHTML` template.

Separately, `class` takes a **string**, never an array: `setAttribute('class', ['a','b'])`
stringifies to `"a,b"` and silently matches nothing. Join conditional class lists
yourself before calling `el()`.

### `state.selectedLevel` — a construction target, not only a vertebra

`selectedLevel` names **which construction the viewer draws**, and its domain is the set of
constructions that exist:

| Value | Construction drawn on the dynamic layer |
|---|---|
| `'L1'`…`'L5'` | that level's superior endplate against the S1 endplate, labelled `LL {level}-S1` |
| `'S1'` | the S1-midpoint-to-hip line, labelled with `PI`, `PT` and `SS` together — the overview you get by clicking the sacrum itself |
| `'SS'` | the S1 superior endplate against a **horizontal** reference through its midpoint |
| `'PT'` | the hip-to-S1-midpoint line against a **vertical** reference through the hip |
| `'PI'` | the S1-midpoint-to-hip line against the **perpendicular to the S1 endplate** at its midpoint |
| `'L1PA'` | two rays from the hip midpoint — one to the L1 body centroid, one to the S1 endplate midpoint — labelled `L1PA` |
| `null` | nothing selected |

Each of `'PI'`, `'PT'` and `'SS'` draws the anatomical line **solid** and its reference axis
**dashed**, so it is never ambiguous which line is measured and which is the datum. The three
constructions are derived directly from the backend's own formulas in
`backend/utils.py:322-331`, so the drawing and the number can never disagree about what is
being measured:

- `SS` is `atan2` of the S1 endplate vector — an angle from the horizontal.
- `PT` is `atan2(s1_mid.x − hip.x, hip.y − s1_mid.y)` — an angle from the vertical.
- `PI` is the angle between the S1→hip connection and the endplate normal.

Anatomical clicks stay coarse: `vertebraAt()` returns only `'L1'`…`'L5'` and `'S1'`, so
clicking the sacrum on the image still gives the three-parameter overview. The precise
single-parameter constructions are reachable only by clicking their row.

**Why `'L1PA'` is in a key called `selectedLevel`.** It is not a vertebral level, and that
reads oddly. The alternative was worse. L1 pelvic angle has a construction of its own — the
angle subtended at the hip between the L1 centroid and the S1 midpoint — which is
geometrically unrelated to lumbar lordosis. Before this amendment the L1PA row mapped to
level `'L1'`, so clicking a row labelled **L1 PELVIC ANGLE** drew the lordosis line and
labelled it `LL L1-S1`. A row that shows you a different measurement than the one it names
is exactly what the "never label a value with a name it isn't" rule forbids, and it was
caught by a human during plan 03's manual verification, not by any test.

Widening this key's domain was chosen over adding a second state key or renaming it to
`selection` — `state.selection` is already taken by the landmark-editing `Selection` typedef
(see `viewer/interactions.js`), and a second key would let the two drift out of sync.

Consequences that bind every plan:

- **`vertebraAt()` never returns `'L1PA'`.** Canvas clicks hit geometry, and there is no
  L1PA polygon — clicking the L1 vertebra still selects `'L1'` and still draws lordosis.
  `'L1PA'` is reachable only by clicking the L1 PELVIC ANGLE row.
- **Row highlighting follows suit.** `sagittalRows`' `L1PA` entry carries `levels: ['L1PA']`,
  so selecting L1 highlights lumbar lordosis and PI–LL mismatch but *not* L1 pelvic angle,
  and vice versa. That asymmetry is the point.
- **Anything switching on `selectedLevel` must handle the non-level values explicitly**
  rather than falling through to an `else` that assumes a vertebral level. The bugs these
  amendments fix were exactly such fall-throughs — first `'L1PA'` drawing lordosis, then
  `PI`/`PT`/`SS` sharing one line and one combined label.
- **`PILL` has no construction of its own** and deliberately maps to `'S1'`: the PI–LL
  mismatch is a relationship between two other measurements rather than an angle in the
  image, so clicking it shows the pelvic overview. If a later plan gives it a construction,
  it needs both the L1–S1 lordosis line and the pelvic line drawn together.

---

### `renderer/data/measurements.js`

```js
/** @typedef {{key,label,value,unit,absent,highlight}} Row */

export function sagittalRows(measurements, opts)   // → Row[]
export function lordosisRows(measurements)         // → Row[]  L2-S1..L5-S1
export function discRows(study)                    // → DiscRow[]; 2026-09-09 disc-height amendment below
export function alignmentRows(study)               // → Row[]  always absent
export function piResidual(measurements)           // → number|null  |PI-(PT+SS)|
export function isConsistent(measurements)         // → boolean (residual <= RESIDUAL_LIMIT)
export function deltaRow(row, otherRow, threshold)  // → {text,overThreshold}
export const RESIDUAL_LIMIT = 1.0                  // (plan 05) the ONE residual threshold; data/status.js re-exports it
```

A row is `absent` when its value is missing or not a finite number — not only when
`measurements` is `null` (plan 05). A demo study has no `L1PA` and no `LL['L2-S1']`…`['L5-S1']`;
those rows render `—`, and nothing downstream ever calls `toFixed` on `undefined`.

`sagittalRows` returns exactly six rows in this order, with these `key` and `label`
values — the labels are user-visible copy and must match verbatim:

| key | label |
|---|---|
| `LL` | `LUMBAR LORDOSIS · L1–S1` |
| `PI` | `PELVIC INCIDENCE` |
| `PT` | `PELVIC TILT` |
| `SS` | `SACRAL SLOPE` |
| `PILL` | `PI–LL MISMATCH` |
| `L1PA` | `L1 PELVIC ANGLE` |

Note `·` (U+00B7) and `–` (en dash, U+2013). `unit` is `'°'` for all six.
`absent: true` when `measurements` is `null`; `value` is then `null` and the UI
renders `—`.

### `renderer/data/status.js`

```js
export const RESIDUAL_LIMIT = 1.0        // degrees
export const CONFIDENCE_LIMIT = 0.6
export const S1_CONFIDENCE_LIMIT = 0.6   // review threshold, not accuracy probability

export function reviewReasons(study)    // → string[]; shared by status and Analysis warnings

export function deriveStatus(study)      // → 'fail'|'unseg'|'ok'|'hand'|'rev'|'seg'  (2026-10-01; 2026-10-15 adds 'hand'; see the amendments below)
export function statusLabel(status)      // → 'Processing'|'Unsegmented'|'Failed'|'Segmented'|'Needs review'|'Hand-placed'|'Reviewed'; '—' otherwise
export function isReviewed(study)                // → boolean  (2026-09-10) a non-blank reviewedAt
export function displayStatus(study, runningId, batch)  // → the status a row or header SHOWS: 'proc' while runningId === study.id
                                                        //   or (2026-10-01) the film waits in a running batch, else deriveStatus
export function reviewedLabel(reviewedAt)        // → 'Reviewed · Sep 10, 2026' | 'Reviewed'
export function reviewBlockedReason({ study, running, pending })   // → string|null: REVIEW_DEMO | REVIEW_RUNNING | REVIEW_FAILED (1.0.13) | REVIEW_NOTHING | REVIEW_PENDING
```

Rules, in order:
1. `measurements == null` → `'proc'` (superseded 2026-10-01: `'unseg'`, after a `processingError` → `'fail'` rule; see the amendment below)
1b. `reviewedAt` a non-blank string → `'ok'` (2026-09-10, studies-table spec §8.2). The reasons stay: `reviewReasons` is unchanged and the Measurements panel keeps showing them.
2. `piResidual > RESIDUAL_LIMIT` **or** `qc.femoral.confidence < CONFIDENCE_LIMIT` → `'rev'`
3. A `qc.framing` record with missing/invalid S1 score or `s1_confidence < 0.6` → `'rev'`;
   if `searched`, a missing/invalid `search_confidence` or score below `0.6` also requires review.
4. otherwise `'seg'`

Boundaries are inclusive-pass: residual exactly `1.0` and confidence exactly `0.6`
both yield `'seg'`. Missing `qc` does not by itself force `'rev'`. `RESIDUAL_LIMIT` here is
`data/measurements.js`'s constant re-exported, and the residual comes from its `piResidual`,
so the list's status and the panel's consistency warning cannot disagree. Spec 13.1's second
`proc` condition — "currently running" — is a property of `state.running`, not of the record:
`displayStatus` (2026-09-10) is the one place that rule is written (`state.running === study.id` overrides
`deriveStatus`'s `'ok'`/`'rev'`/`'seg'` (2026-10-01: any status) while a run is in flight); `deriveStatus`
itself does not. (Superseded 2026-10-01 by the amendment below.) A batch's queued films are 'proc' by
rule 1 and are badged Processing like any unsegmented film; the Studies summary counts them as UNSEGMENTED
and the batch's own progress is the filter bar's and the sidebar's (2026-09-08, batch spec decisions 7–8).

**2026-10-01 amendment (issue #39; release 1.0.13 and
`docs/superpowers/specs/2026-10-01-failed-status-port-design.md`).** The rules are now, first match wins: no study →
`'unseg'`; a non-blank `processingError` → `'fail'` (1.0.13; it outranks measurements and the review mark);
`measurements == null` → `'unseg'`; then rules 1b–4. `'proc'` is no longer derived: `displayStatus` returns it for the
running study and, given `state.batch`, for every film still waiting in a running batch that is not stopping
(`data/batch.js isQueued`), and every caller passes `state.batch`. A batch's waiting films therefore read Processing by
that rule, not by rule 1; a stopping batch's waiting films read their own status. The Studies summary keeps its three
clauses and its UNSEGMENTED counts Unsegmented, Processing and Failed (`data/find.js summaryCounts`). The Find sort
ranks fail 0 · proc 1 · unseg 2 · rev 3 · ~~seg 4 · ok 5~~ hand 4 · seg 5 · ok 6 (2026-10-15). `statusLabel` names all
~~six~~ seven keys (2026-10-15: `hand`) and returns `—` for any other. A failed attempt stores `processingError` as
`failureReason(message)` and `processingErrorAt` in the same update; the Failed pill's tooltip is `failureTitle(processingError, processingErrorAt)`.

**2026-10-15 amendment (annotation editor round 2, E2;
`docs/superpowers/specs/2026-10-15-annotation-editor-round-2-design.md` §4).** `deriveStatus` gains one rule and its
first-match order is now: no study → `'unseg'`; a non-blank `processingError` → `'fail'`; `measurements == null` →
`'unseg'`; `isReviewed` → `'ok'`; **`study.source === 'real' && isHandPlaced(study)` → `'hand'`**; then `reviewReasons`
non-empty → `'rev'`, else `'seg'`. `isHandPlaced` is `data/predictions.js`'s test (no prediction id and no
`qc.models`, R16); the real-study guard is load-bearing, since a demo has neither field and keeps reading Segmented. A
marked hand-placed film reads Reviewed and a failed re-run over it reads Failed. `displayStatus` and
`reviewBlockedReason` are unchanged; `statusLabel('hand')` is `Hand-placed`. `data/find.js`: `STATUS_RANK` is fail 0 ·
proc 1 · unseg 2 · rev 3 · hand 4 · seg 5 · ok 6, and `summaryCounts` counts `hand` in TO REVIEW beside `rev`. The
pill is `.badge-hand` in `styles/components.css` (Needs review's tint with Unsegmented's hollow dot); every other
surface calls `statusBadge` with the key and needed no change.

**There is exactly one rule, and demo studies are not exempt from it.** All nine demo
studies have internally consistent parameters (residual ≈ 0) and confidence 0.82–0.97,
so all nine derive to `Segmented`. The source mockup labelled two rows `Needs review`
and two `Processing`, but those were arbitrary per-row choices with no underlying
formula; reproducing them would mean storing a status that contradicts the data beside
it, or inventing a lower confidence than the design specifies.

The other two states are still reachable — and reachable *honestly*: `Processing` is
what plan 06's workspace load produces for scanned films that have no measurements yet
(2026-10-01: that is `Unsegmented` now; `Processing` is a running film or one waiting in a running batch),
and `Needs review` is what a genuinely poor femoral fit produces. Neither needs faking
in the demo set.

### `renderer/data/similarity.js`

```js
export const WEIGHTS = [1, 0.8, 0.8, 0.6, 1]

export function vector(study)            // → [LL, PI, PT, SS, PI-LL] | null
export function distance(a, b)           // → number
export function matchScore(a, b)         // → number 58..100 (integer)
export function findSimilar(study, all, n = 3)   // → Study[]
```

`distance` is `sqrt(Σ Wᵢ (aᵢ − bᵢ)²)`. `matchScore` is
`max(58, round(100 − distance × 1.35))`. `findSimilar` excludes the study itself and
any study whose `vector()` is `null`, sorts ascending by distance, returns the first `n`.

### `renderer/data/csv.js`

```js
/** @typedef {{src: string, dest: string|null}} Mapping */

export const KNOWN_FIELDS = ['Age','Sex','BMI','Diagnosis','ODI',
                             'Treatment plan','Surgical history','Follow-up','Notes']

export function parse(text)              // → {headers: string[], rows: Object[]}
export function autoMap(headers)         // → Mapping[]   dest null when unmatched
export function toCsv(studies)           // → string   (2026-09-07) Study ID,View,Subject,Timepoint,Film date, then the
                                         //   measurement columns, then the clinical union; demo rows are never written;
                                         //   the Source column and the includeDemo option are gone. (2026-09-06) clinical
                                         //   columns are clinicalFieldNames() over the exported rows -- the `fields`
                                         //   parameter is gone; see the pre-op/post-op spec §11.1
export const MEASUREMENT_COLUMNS         // (2026-09-11) the export's measurement column names, the order data/pairing.js merges in
export function measurementValues(study) // → Array<number|''>  (2026-09-11) one value per MEASUREMENT_COLUMNS entry, for data/pairing.js
export function toPairedCsv(pairing)     // → string   (2026-09-08, spec §11.2; 2026-09-11 visits, `<visit> disagreements` and
                                         //   `<visit> derived across films` columns when any visit merged, a merged visit's films
                                         //   joined with ` + `) the wide file from pairStudies:
                                         //   citation block; layout-B header (every visit's `<label> study`, then every visit's
                                         //   view, then every visit's film date, then per measurement `<M> Pre-op`, `<M> <label>`,
                                         //   `Delta <M> <label>` per later visit, then `<F> <label>` per clinical key on the
                                         //   written films); one row per subject. Demo rows never reach it; headers use the
                                         //   stored label and ASCII `Delta`
export function delta1(pre, post)        // → number|''   post minus pre over the one-decimal forms of each, to one decimal; ''
                                         //   when either is not finite. Comparison mode (plan 07) applies the same rule
export function fileStem(name)           // → string   (plan 06) basename without its last extension
export function findJoinHeader(headers)  // → string|null   (plan 06) the first header normalising to 'studyid'
export function joinClinical({files, headers, rows, mapping})   // (plan 06) → {joinHeader, byFile, rowByFile, matched,
                                         //   unmatched, duplicates, ambiguous} (rowByFile: the matched raw row, 2026-09-07)
export function clinicalFieldNames(studies)   // → string[]   (plan 06) union of clinical keys, KNOWN_FIELDS order first
export function findStructuralHeaders(headers)   // (2026-09-07, spec §8.2) → {subjectId, timepoint, filmDate, view}: header names or null
export function structuralField(header, headers) // → the field a header supplies, or null
export function structuralFromRow(row, structural)   // → {subjectId, timepoint, filmDate, view, badDate}
export const STRUCTURAL_LABELS                   // {subjectId: 'Subject', …} for the mapping card's fixed chips
```

`parse` handles quoted fields, embedded commas, doubled quotes, and CRLF. It strips a UTF-8 BOM
and treats a quote as opening only at field start, leading whitespace allowed — a quote after
other text is literal (plan 06).

`autoMap` matches case-insensitively after stripping non-alphanumerics, treating the known
field's stripped name as a prefix of the stripped header, so `odi_base` → `ODI` and
`age_yrs` → `Age`; each known field is claimed by at most one column — the first matching
header wins (plan 06). It is a **convenience, not an authority**.
It deliberately has no medical synonym table: `dx_text` does not map to `Diagnosis`,
because teaching it `dx` would force teaching it `tx`, and a guess that silently maps
the wrong column is worse than one that maps nothing.

`autoMap` never claims a structural header (`subject_id`/`subject`, `timepoint`/`time_point`/`visit`,
`study_date`/`film_date`, `view`/`position`, by normalised name, first header wins; a bare `date` is
not recognised); the mapping card shows those and the join key as fixed chips.

Instead, **the mapping is user-editable**. Each chip on the Workspace screen renders a
`<select>` of `KNOWN_FIELDS` plus `Unmapped`, a field already claimed by another column
is not offered twice, and edits write back to `state.wsMapping`. Rendering reads
`state.wsMapping`, never `autoMap()` directly, so overrides survive re-render; choosing
a new CSV resets to `autoMap`'s output.
`toCsv` emits the citation comment block first, absent values as empty, and never writes a
`source === 'demo'` study (2026-09-07: the `includeDemo` option and the `Source` column are
gone — no dialog ever set the option and no installer ships demos). **Measurement columns are written to
one decimal**, matching what the Measurements panel displays, so a value read off the screen
and the same value in the file agree. This also keeps float noise out of the data: for a
study with `PI` 48.6 and `LL['L1-S1']` 49.0, the derived `PI-LL Mismatch` computes to
`-0.3999999999999986`, and sixteen digits of that beside a clean `48.6` in the same row
reads as a defect to whoever opens the file. One decimal is finer than the segmentation's own
accuracy, so nothing meaningful is lost. Clinical fields are user-supplied text and are
never rounded or reformatted.

### `renderer/viewer/geometry.js`

```js
export function fitCircle(points)        // → [cx,cy,r] | null  (needs ≥3, null if collinear)
export function imageToClient(pt, rect, canvas)   // → [x,y]
export function clientToImage(ev, canvas)          // → [x,y]  clamped to bounds
// ~~export function nearestLandmark(geometry, clientX, clientY, canvas, radius = 14)~~   superseded 2026-10-10
//   (viewer/level-handles.js hitTestLevelHandles); ~~landmarkHandles~~ superseded 2026-10-10 (levelHandles)
export function landmarkAt(geometry, level, corner)   // → [x,y]
export function setLandmarkAt(geometry, level, corner, point)   // mutates, keeps quadrilateral in sync
export const LEVELS = ['L1','L2','L3','L4','L5']
export const CORNERS = ['SA','SP','IA','IP']
export const FEMORAL_SIDES = ['left','right']                    // (plan 04) index 0 = left, 1 = right
export function femoralCircle(geometry, side)                    // (plan 04) → [cx,cy,r]
export function setFemoralCircle(geometry, side, circle)         // (plan 04) mutates, keeps hip_midpoint in sync
```

`fitCircle` is ported verbatim from `renderer.js:597` — algebraic least squares via
`solve3x3`. Do not reimplement it.

S1 has only `SA` and `SP`. `landmarkAt(g,'S1','SA')` is `g.s1_superior[0]`,
`'SP'` is `[1]`.

### `renderer/viewer/interactions.js`

```js
/** @typedef {{kind:'landmark', level:string, corner:string}
 *          | {kind:'femoral', side:'left'|'right', part:'center'|'rim'}} Selection */

// Superseded 2026-10-10 and removed (plan 2026-10-10 Task 13): the level editor's Tab order, nudge and hit test live in
// viewer/level-handles.js (handleOrder/nextLevelHandle, nudgeHandle, hitTestLevelHandles). The Selection typedef above
// is kept unchanged but unused in edit mode (state.selection is always null there).
// ~~export const TAB_ORDER = [...]~~                    superseded 2026-10-10 (22 landmark stops)
// ~~export const FULL_ORDER = [...]~~                   superseded 2026-10-10 (TAB_ORDER plus the two femoral centres)
// ~~export function nextSelection(current, direction)~~ superseded 2026-10-10
// ~~export function nudge(geometry, selection, dx, dy)~~ superseded 2026-10-10
// ~~export function sameHandle(a, b)~~                 superseded 2026-10-10
// ~~export function hitTestFemoral(circles, x, y, radius = 14)~~   superseded 2026-10-10
export function arrowKeyDelta(key, shiftKey)        // (plan 04) → {dx,dy}|null — 1px, 10px with Shift
export function debounce(fn, ms)                    // (plan 04) → fn with .cancel()

export const CHORD_MASK = 0b11                      // primary|secondary bits of PointerEvent.buttons
export function isChordHeld(buttons)                // → boolean — BOTH primary and secondary held
export function isDoubleClick(previous, next, { withinMs = 400, withinPx = 6 } = {})
//   → boolean — (2026-10-11, gate feedback G4, D17) `next` completes a double click with `previous`: both
//   {time, clientX, clientY, button}, the same button, 0..withinMs apart, within withinPx. Browsers fire no
//   dblclick for the secondary button; the stage's double right-click (the window reset) asks this. The caller
//   passes the events' own timeStamps; nothing here reads a clock.
export function exceedsSlop(start, point, px = 3)
//   → boolean — (2026-10-11, the review of G3/G4, ruling R37) `point` is at least `px` CSS px from `start` in a
//   straight line; both {clientX, clientY} (a pointer event or the stage's pending drag will do). The stage's right
//   press becomes a window drag only once this is true.
export function zoomAbout(view, direction, offsetX, offsetY)
//   → {zoom, panX, panY} — a zoom step anchored at a point instead of the film's centre.
//   `direction` is a SIGN, not a factor, so the wheel and the toolbar buttons reach
//   bit-identical zooms. Offsets are measured from the STAGE CENTRE because .viewer-host
//   has transform-origin:center. Does not mutate `view`.
```

`isChordHeld` tests the `buttons` **bitmask**, never `button`. The Pointer Events chorded-button
rule fires `pointerdown` only on the no-buttons→some-button transition, so the second button of a
chord arrives as a `pointermove`; a chord test placed only in a pointerdown handler is dead code.
The DOM half of that gesture lives in `components/viewer.js`, as all pointer wiring does.

**Transient interaction state** — the in-flight drag, the hovered handle, and the
retrace point buffer are **not** in `store.js`. They live as module-scope variables in
`renderer/components/viewer.js`, mirroring how `renderer.js` already keeps `dragging`
and `traces` outside shared state. Only committed geometry reaches the store. Plan 07's
comparison pane must not introduce a second copy of these — the comparison pane is
read-only and has no drag state at all.

Since plan 04 this includes the pan drag: **every** pointer and keyboard listener on the
stage is attached in `components/viewer.js` (and removed in its `detach()`), through one
module-scope `drag` for every gesture kind, and `viewer/interactions.js` contains no DOM
code. Edits work on a `structuredClone` of the store's geometry and commit a new reference;
the store's geometry object is never mutated in place.

### `renderer/data/persistence.js`

```js
export const STORE_VERSION = 1

export function nextId(studies)          // → 'SP-1000' etc, scans real studies only
export function merge(realStudies)       // → Study[]  real + demo, real first
export function validate(raw)            // → Study[]  throws on bad shape — see the rule below
export function createStudySaver({save, onError, disabledReason, initial})   // (plan 05) → {notify(state), flush()}
```

Real IDs start at `SP-1000`. Demo IDs are `SP-0030`–`SP-0042` and are never written
to disk.

**What `validate` throws on and what it repairs.** `raw` is the parsed store
`{version, studies}`. It throws when the root is not an object with a `studies` array, when
`version !== STORE_VERSION`, and when a record's identity is wrong (`id` not a non-empty
string, `source !== 'real'`, `fileName`/`addedAt`/`view` not strings). It does **not** throw
on a malformed payload: when `measurements` or `geometry` fails its shape check, **both** are
set to `null` with one `console.warn` naming the study (its status derives to `Unsegmented`
(2026-10-01; `Processing` before), or `Failed` when a failure is stored;
a re-run restores it). The validator accepts the partial shapes above: supplied bodies have
finite endplate pairs and four quadrilateral points; missing S1 and centers are null;
femoral circles are empty or exactly two finite positive-radius circles. Numeric measurements
require their corresponding anatomy. Drawing, picking and keyboard cycling skip absent
structures. `thumbnail` must start `data:image/`
or becomes `null`. Unknown keys are dropped. Why nulling rather than throwing: a throw discards
every other record, and with save-on-change the next write would replace the file with less
than it held.

`createStudySaver` is save-on-change with coalescing: `notify(state)` ignores a `studies`
reference it has already seen (and the `initial` one it was primed with), filters to
`source === 'real'`, and keeps one write in flight with one trailing write of the latest list —
no timers. Every `onError` message is display-ready. With a `disabledReason` it never writes
and reports once. It is subscribed in `renderer/main.js`, runs inside store notification, and
therefore never calls `setState`.

---

## Persistence

Two kinds of file under `app.getPath('userData')`, both written atomically (`.tmp` then
rename) by `store-io.js`, both reached only through `main.js`'s IPC handlers:

- **`studies.json`** — `{ version: STORE_VERSION, studies: Study[] }`, real studies only;
  demo studies are compiled in and merged at read time, never written. Read once at bootstrap,
  **before the first paint** (`renderer/main.js` awaits `api.loadStudies()` at module top
  level), so `nextId()` and the Studies list see every persisted record from the first frame.
  Written by `createStudySaver` on every change of `state.studies`'s reference — a chosen film,
  a completed run, every `/measure` correction, a relocated source. An unparseable file, or one
  without a `studies` array, is quarantined by the main process as
  `studies.json.corrupt-<timestamp>` and replaced with an empty store — and `predictions/` is moved
  aside with it as `predictions.corrupt-<timestamp>`, the **same** timestamp, in the same
  `load-studies` handler (plan 05 final review). The pair is one recoverable unit and must stay
  one: an empty store left beside live sidecars is indistinguishable from a fresh profile, so
  `nextId()` restarts at `SP-1000` and the first completed run's `savePrediction` replaces the
  previous library's film and overlay with no recovery — the same hazard the refused-store rule
  below exists to prevent. With both moved, the empty store is a genuinely fresh library, nothing
  is left for a reused id to overwrite, and **persistence stays on**. `readStudyStore` reports the
  quarantine as an optional `quarantined: string` (the bare filename; the field is absent on every
  other path, including the unknown-version pass-through), and `load-studies` returns the raw store
  plus `notice: string|null` — one display-ready sentence naming both files and how to restore
  them, which `renderer/main.js` toasts once after the first render via `api.storeLoadNotice()`.
  **Fallback:** if the `predictions/` rename fails for any reason other than "it does not exist" (a
  fresh profile has no `predictions/`; that is not an error), the handler says so in the `notice`
  and sets `persistenceUnsafe: true`, and `api.loadStudies()` calls `disablePersistence` itself —
  nothing is written for the session, so the orphaned sidecars cannot be clobbered. A `version` this build
  does not know passes through untouched: the renderer refuses it, runs on the demo studies,
  toasts, and **disables persistence for the session** (`api.disablePersistence`): neither
  `studies.json` nor any `predictions/<id>.json` is written again until the next launch, because
  `nextId()` restarts at `SP-1000` over a library the app cannot see and a sidecar write would
  replace another study's film. A newer build's data is never overwritten.
- **`predictions/<id>.json`** — the raw `/predict` response for one real study (`image_png`,
  `mask_png`, `femoral_mask_png`, `labels`, `measurements`, `geometry`, `qc`), written when a
  run completes (before the record's numbers are committed) and read lazily when the study is
  opened with no bitmaps cached. It is both the display source (`loadStudyImages`) and the
  `RESET TO PREDICTION` target (`recordPrediction(id, sidecar, study.geometry)`). The record
  keeps the **corrected** geometry; the sidecar keeps the model's. Missing or unreadable → the
  viewer's `FILM UNAVAILABLE` card, and a re-run recreates it. Ids are validated against
  `/^SP-\d{4,}$/` in the main process so a sidecar path cannot leave `predictions/`.
- **Deleting a study** (plan 06) removes its record — the saver writes the new list — and its
  sidecar through `deletePrediction`. A load-time orphan sweep of `predictions/` is deliberately
  not performed: a refused store must never lose data. Ids are max+1, so a deleted highest id is
  reused by the next film, which is why every id-keyed renderer cache is cleared on delete.
- **The film's bytes are never stored.** `filePath` is the film's identity. A re-run takes the
  bytes from this session's payload map, else from `api.readFile(filePath)`, and when that is
  `null` offers to relocate the film (toast + native picker); a relocation rewrites
  `fileName`/`filePath` on the record before the run. Drops carry a real path through
  `pathForFile`. **No radiograph ships with the app:** spec §9.4's `Use sample film` button is
  not built (user decision, 2026-09-02); the README links public datasets for testing, and the
  Studies screen's `Choose radiograph` button and dropzone are the only ways in.
- **`thumbnail`** is generated from the run's decoded film (`viewer/canvas.js`
  `thumbnailDataUri`, ≤ 128 px long edge, JPEG data URI) and stored on the record.
- **Development profile:** `app.getPath('userData')` is `%APPDATA%\spine-contour` from source
  and `%APPDATA%\Spine-Contour` for the production build — the **same directory** on Windows.
  `SPINE_CONTOUR_USER_DATA` (honoured only when `!app.isPackaged`) redirects a run to a scratch
  profile; `tools/smoke/launch.mjs` sets it so smoke studies never reach a real store.
- Spec §13 says full-resolution images are not copied into the store. The sidecar is a
  deliberate, user-approved deviation: without the model's PNGs a persisted study cannot be
  drawn, corrected, or reset after a restart, and the alternative — a model run on every first
  open — costs 5–60 s per study per session.

---

## Colour tokens

`styles/tokens.css` defines exactly these, and nothing else defines colours.

`--on-accent` is the foreground for anything sitting on `--accent` — the primary
button label, the checked-checkbox tick. It is deliberately **not** redefined under
`body[data-dark]`: both accents are dark enough for white, so the same value is
correct in both themes, and `--card` is *not* a substitute because it flips to a
near-black in dark mode. `--shadow` is likewise theme-invariant. Both exist so that
"nothing else defines colours" stays literally true — without them, primary buttons
and toasts have to hardcode.

(2026-10-01, issue #39; port spec P2 and 6) `--danger` is the Failed pill (`.badge-fail`:
its own 14% tint behind `var(--danger)` text) and the failed-run region note
(`.meas-note.is-failed`); it is never a button fill. Each theme's value is at least 4.5:1
on its own 14% tint over `--bg` (5.12:1 light, 5.30:1 dark), so, unlike `--on-accent`, it
is redefined under `body[data-dark]`.

```css
:root {
  --bg:#FEFDFC; --card:#FFFFFF; --well:#F4EEE4; --border:#E5DDD1;
  --ink:#201814; --body:#4A4038; --muted:#8A7E72;
  --accent:#C1502B; --sage:#6E8577; --danger:#B42318;
  --on-accent:#FFFFFF; --shadow:rgba(0,0,0,.18);
}
body[data-dark] {
  --bg:#151312; --card:#181614; --well:#282522; --border:#38342F;
  --ink:#FAF7F2; --body:#C9C2B8; --muted:#9A9188;
  --accent:#D45A32; --sage:#8AA894; --danger:#F07167;
}
```

The viewer stage is deliberately off-theme in both modes: background `#0B0A09`,
label fill `rgba(250,247,242,.75)`, selected accent `#D45A32`, divider `#38342F`.
These are hardcoded in `viewer/canvas.js` and must **not** use the tokens above. Plan 03 added a
fifth, the label plate fill `rgba(11,10,9,.78)` behind stage text, for the same reason.

Plan 04 extends that file's literal set with the pixels drawn **into** the canvas for
landmark editing, visible only in edit mode: the stage background as the handle outline,
the legacy editor's per-corner handle colours (SA `#32d4ff`, SP `#64e19a`, IA `#ffb259`,
IP `#fa78d4`), the femoral handle colour derived from `FEMORAL_OVERLAY_COLOR`, and the
retrace point colour `#ffe071`. The rule is unchanged in both directions: nothing drawn as
DOM over the stage uses these literals (that chrome reads `styles/screens/analysis.css`'s
`.viewer-stage` token block), and nothing in `canvas.js` reads a theme token.

## Typography

`Source Sans 3` for everything, 12–34px. `Chivo Mono` **only** for uppercase eyebrows,
IDs, units, and status labels at 8–12.5px, weight 500, `letter-spacing` 0.08–0.16em.
All numerics carry `font-variant-numeric: tabular-nums`.


---

## Amendment 2026-09-04 — model choice and framing

Made by the backend author while merging the crop search and the HRNet landmark head.
Binding on the same terms as the rest of this document.

**`state.models`** — `{vertebrae: 'unet'|'hrnet', femoral: 'unet', s1: 'keypointrcnn'}`,
session state like `theme`, initial value in `renderer/data/models.js`'s `DEFAULT_MODELS`.
Only `vertebrae` has more than one offered value. The sidebar's Settings panel is its one
writer; `'models'` is in the router's sidebar key set.

**`predict(request)`** additionally takes `models: state.models`. `main.js` forwards each
string as the form field `vertebra_model` / `femoral_model` / `s1_model`; the backend fills
defaults for anything omitted and rejects anything it does not offer with a 422 whose
`detail` names the offered ids. `renderer/data/models.js` mirrors the backend's list for
display; the backend is the authority.

**`qc`** is persisted as an opaque object and carries two backend records beside `femoral`:
`qc.models` (`{vertebrae, femoral, s1}` — the ids that produced the result) and
`qc.framing` (`{window: [left, top, right, bottom], searched, reframed, …}` — the film
pixels the models ran on). `validate` keeps treating `qc` as any object. The Analysis
header appends the vertebral model's label when `qc.models` is present and appends
nothing when it is not; it never assumes a model for a record that recorded none.
This is the per-result half of `docs/ROADMAP.md` item 3; the store-level half — a
provenance field `validate` preserves and a status that asks for a re-run — still stands.

**`GET /models`** — `{vertebrae: [...], femoral: [...], s1: [...]}`. Not called by the
renderer (its CSP has `connect-src 'none'` and there is no IPC for it); it exists so the
bundle can be asked what it offers.

Nothing about `measurements`, `geometry`, `/measure`, persistence shapes or
`STORE_VERSION` changes.


## 2026-09-07 amendment: image calibration

User-authorized addition on ui-redesign-cw: `screen: 'calibration'` mounts a persistent, session-only original-image calibration screen. It uses the existing sidebar shell, tokens, workspace folder scanner and IPC API wrappers. `renderer/components/calibration-viewer.js` owns pointer handling for its separate reference canvas; the anatomical stage remains exclusively owned by `components/viewer.js`. Pure distance/spacing logic is in `renderer/data/calibration.js` with Node test coverage. Calibration never mutates study geometry or reuses one image's pixel scale for another. Folder color feedback supplements detection, not neural-model training. Study persistence has not been extended; JSON export is explicit.

New optional backend endpoints: `POST /calibrate` (file, optional color profile, preview controls) and `POST /calibration-profile` (file and corrected endpoints). OCR failures preserve manual calibration. Desktop bundles include Tesseract and language data. No new npm dependencies or CSP changes.

Folder upload handoff: `state.calibrationRequest` is a session-only `{folder, files}` request, passed together with `wsFolder`, `wsFiles`, and `screen: 'calibration'` after a nonempty workspace scan. `SCREEN_KEYS` includes it. The calibration screen consumes each request once, after mounting via a microtask, and returns to Workspace on Continue or Skip without changing study or CSV state. Folder processing reports uncalibrated images for later review instead of fabricating their scale.


### Accuracy safeguards (2026-09-09)

`data/inference-view.js` maps the existing lateral position vocabulary and legacy lateral
labels to the backend's `lateral` model. Unsupported or unspecified labels are excluded
from `planBatch`, reported in its note, and rejected again by the driver and `segmentStudy`
(including after file reading). Metadata is not an automatic view classifier.

`commitGeometry` now previews in `state.measurementDrafts[studyId]`. The Study keeps the
last complete geometry/measurements pair until the latest `/measure` succeeds, when both
fields and draft removal commit in one notification. Failure discards the preview; reset,
delete and prediction replacement cancel that study's draft and stale responses. The viewer
reads drafts for hit testing, repeated nudges and drawing. Analysis hides numeric values and
shows “Updating measurements…” while a draft exists. Persistence never receives drafts;
closing before recalculation completes retains the last successful pair. Table exports use
that complete pair, and the Analysis export button is disabled during its pending edit.


## 2026-09-07 amendment: delete all studies

The user requested a complete library clear. Studies now offers a count-based confirmation covering the entire unfiltered library. `renderer/data/delete-studies.js` deletes real prediction sidecars by id before removing their records and reports per-item failures. It never deletes source films. `state.deletingStudies` blocks new prediction dispatch while clearing. The existing study saver writes the resulting real-study list; caches and open/compare references are cleared for successfully removed ids. Demo visibility is stored separately in `userData/library-preferences.json` through `demoStudiesHidden`/`hideDemoStudies` IPC so cleared demos do not reappear at startup. The default `merge(real)` behavior is preserved; bootstrap passes `{hideDemos: true}` only after that explicit preference. The persistence-disabled guard also applies to hiding demos.

Verified: 280 Node tests; a running Electron scratch-profile test covering confirmation, cancellation, deletion through a filtered view, sidecar removal, source-file retention, and an empty library after relaunch. No live user studies were deleted during verification.

**Superseded 2026-09-10 (studies-table spec §5, §9):** the library-level control is gone. Delete on the Find bar acts on the ticked visible rows through `deleteStudyBatch(studies, { deletePrediction })` — the `hideDemos` option and the demo branch are removed; `state.deletingStudies` and the mutual exclusion with run and batch are unchanged. Demo visibility is a development-only Settings toggle: `renderer/demo-studies.js` → `api.setDemoStudiesHidden(hidden)` → IPC `set-demo-studies-hidden`, which the main process refuses (returns false, writes nothing) when `app.isPackaged`; `hide-demo-studies` no longer exists. The read, `demo-studies-hidden`, and the bootstrap rule are unchanged.


## 2026-09-09 amendment: batch calibration integration

**2026-09-10 persistence extension:** Applied manual references and explicit clears
also persist independently of studies through `saveCalibration` IPC and
`calibration-io.js`, keyed by original-file SHA-256. Main supplies the matching
record to calibration/prediction; `/calibrate` and `/calibrate-stream` accept the
same optional `calibration` form field as prediction, including preview requests.
The optional positive `review_revision` prevents older reviewed caches from
replacing newer saved references. Windows drive/UNC session paths normalize case
and separators; POSIX paths remain case-sensitive. The existing source/geometry
guard and store version are unchanged. See `docs/manual-calibration-persistence.md`.

Supersedes the session-only persistence restriction in the 2026-09-07 calibration amendment. `Study.calibration` is an optional null-default compact record, independent of geometry and angular measurements; `STORE_VERSION` remains 1. It contains `version: 1`, SHA-256 `source_sha256`, original `width`/`height`, `coordinate_space: 'original_image'`, `status`, `spacing`, `candidates`, `selected_index` and a display message. Preview bytes never enter this field. `renderer/data/calibration.js` validates it, formats its summary and resolves concurrent manual corrections; `renderer/calibration.js` keeps path-keyed folder results until study creation and writes reviewed results to matching studies. A replaced source never recalibrates old geometry from a different file.

`POST /predict` accepts optional JSON form field `calibration`, validates its source digest and dimensions against the upload, and returns compact `calibration` alongside the existing response. When no matching result exists it runs the existing OpenCV/OCR extractor on the original upload. OCR failures return an unavailable calibration without losing a successful segmentation. Original image coordinates are never interpreted as model-crop coordinates. The serial batch driver and model selection stay unchanged.

Folder scans automatically process all images without requiring an appearance profile. Stop keeps completed results; Continue permits uncalibrated films. A reference correction or clear updates its study immediately. A correction made while prediction is in flight wins only when the response has the same source hash and dimensions. `calibrationRequest` additionally supports `{studyId, filePath}` for review from the Measurements panel, with a return to that study. CSV and paired CSV append calibration columns when at least one exported film has a valid calibration record; there are no calibration deltas and unknown scales remain blank.


## 2026-09-09 amendment: calibrated disc heights

User-authorized addition: `renderer/data/disc-heights.js` owns `discRows(study)`, re-exported by `data/measurements.js`. It returns five `DiscRow` objects in L1–L2 through L5–S1 order: `{key, label, unit: 'mm', anterior, middle, posterior}`; the three values are finite millimetres or `null`. This supersedes the always-absent, single-value disc-row interface above. `DISC_LEVEL_PAIRS` and `DISC_POSITIONS` share the order with the panel and exports.

Use the upper vertebra's `inferior` and lower vertebra's `superior` endplates (`s1_superior` for L5–S1), each ordered [anterior, posterior] in original-image coordinates. Anterior/posterior heights are corresponding endpoint-to-endpoint Euclidean distances. Middle height is the distance between the endplate midpoints, not the mean of the other two distances. Convert the x and y components using normalized calibration `column_mm` and `row_mm` respectively before taking their norm. Both facing endplates must have distinct, finite endpoints inside the calibrated image; absent/invalid geometry or scale produces three nulls for that disc. A measured zero remains zero.

Heights are derived on read from the saved study geometry and calibration, never persisted as a second cache. The panel rebuild gate includes both references and a pending correction flag. It hides heights during a `measurementDrafts[study.id]` correction when combined with the accuracy-safeguards branch. No new `/measure` fields, store version, runtime dependency, construction target or CSP permission is introduced.

Both CSV formats always include 15 disc-height columns after the ten angular columns and before clinical fields. Names are `Disc height L1-L2 anterior (mm)` etc. Paired CSV retains measurement-major layout and visit suffixes with `Delta` columns; `delta1` applies to each independently calibrated visit's written one-decimal value. Missing values and their deltas are empty, never zero. Calibration metadata remains appended per film as before. See `docs/disc-heights.md` for the full definitions and verification.


## 2026-09-09 amendment: low-memory mode and actual progress (v1.0.2)

User-requested extension of the original indeterminate-progress rule: a new backend
channel now reports real work. No timed stage labels or guessed whole-job percentage.

- `state.performance = {mode: 'standard'|'low-memory', cpuThreads: 1..4}`. Desktop
  Settings offers 1, 2, or 4 threads. Saved atomically in profile `performance.json`,
  independently of studies; no study-store schema bump. Settings/model controls are
  disabled during a prediction/batch. The setting also reaches standalone calibration.
- `state.runStage = null | {requestId, mode, stage, message, completed?, total?,
  elapsed_seconds, cancelling?}`. Request id rejects late events from older jobs.
  It is session-only, replaced wholesale, cleared on completion/failure/cancellation.
- `POST /predict` remains compatible and accepts `processing_mode`, `cpu_threads`.
  Desktop uses `POST /predict-stream` with the same multipart fields. NDJSON events:
  `progress` (stage/message/optional completed+total), `heartbeat` (elapsed time),
  then one `result` (original prediction contract) or `error` (message).
- `backend-client.cjs` uses Node HTTP with a 60-second inactivity timeout and no
  total inference deadline. Two-second backend heartbeats keep healthy long jobs alive.
  Backend startup allows ten minutes, with bounded health probes. Standalone calibration
  uses `/calibrate-stream` with the same heartbeat/idle policy. Low-memory OCR allows sixty seconds per pass (standard: eight).
- Preload exposes `onPredictionProgress(callback) → unsubscribe`, `cancelPredict(id)`,
  `loadPerformance()`, `savePerformance(settings)`. `predict` optionally takes `requestId`.
  The main process owns the loopback connection and cancellation; renderer CSP is unchanged.
- Inference/calibration jobs share a serialized worker lock around process-wide Torch
  thread/cache policy. Low-memory runs restore threads and clear models even on failure
  or cancellation; repeated S1 search windows reuse one detector. No resolution, search
  candidate, confidence-threshold, HRNet presence or calibration-coordinate changes.
- `qc.processing` records mode, actual CPU thread count and search batch size.
- `Cancel processing` disconnects the current request, triggers backend cooperative
  cancellation between operations and stops its batch. A running native operation is
  not killed mid-call. Cancelled re-runs preserve earlier results. Batch `cancelled`
  optionally counts cancelled attempts within `skipped`; closing copy distinguishes them.
- Sidebar progress and the Studies progress detail update in place, outside table/sidebar
  remount gates. Viewer stages follow only the active study. Progress never redraws
  segmentation canvases or persists per-heartbeat study writes.


## 2026-09-09 amendment: ONNX inference and optional crop localizer

User-authorized change after PR #7: `performance` adds boolean `cropLocalizer`, default
true on a new installation and when migrating older preferences. Explicit false must
survive save/load and IPC serialization. Settings explains that On is needed for
full-spine images; Off is intended for already-framed lumbar-only images. The switch
is disabled while a prediction/batch is active and applies to every image in that batch.

Prediction multipart adds `crop_localizer` (boolean, default true). Off bypasses
`framing.locate` and S1-based reframing, then runs the selected models
once on the visible film extent. The existing cheap `fallback_window` cleanup removes
only broad near-black screenshot borders; coordinates still restore to the original film. The S1 measurement detector and femoral/vertebral models
remain active. Calibration always sees the original image. `qc.framing.crop_localizer`
and `qc.processing.crop_localizer` record the choice; `searched` is false and candidates
zero when disabled. Existing result shapes/null rules and store version remain unchanged.

Inference uses exported float32 ONNX graphs for both U-Nets, S1 Keypoint R-CNN and HRNet.
HRNet's subpixel decoder is exported with its graph; its U-Net presence check remains.
Graphs use a fixed 768-square, single-image input; every candidate is still checked when
localization is enabled. Low-memory mode retains one session at a time. Session cache
keys include resource settings; switching settings evicts incompatible sessions. Progress
reports actual operations only and Off never emits a fabricated search stage.

Training builders/export libraries are separate from runtime imports. CI converts the
trusted LFS checkpoints, checks output parity, bundles only ONNX assets/runtime and runs
all four models in the frozen executable before building/publishing the installers.

## 2026-09-10 amendment: optional toolbar removal (v1.0.4)

`performance.toolbarRemoval` is a saved boolean, default false for new and legacy
preferences, serialized as `toolbar_removal` on both prediction routes. The sidebar
offers Toolbar removal On/Off independently of Crop localizer and resource mode.
It is disabled during prediction/batch and applies only to subsequent runs.

`backend/toolbar.py` removes only supported bottom screenshot panels before model
framing. Output image and masks use the reduced height. Since top/left are unchanged,
landmarks remain in original source x/y coordinates. Calibration, source hashing,
manual correction and original-image previews still use the entire upload. Native
high-bit-depth images and decoded DICOM floats are skipped. Uncertain cases remain
unchanged. See `docs/toolbar-removal.md` for exact checks and provenance fields.
Actual `toolbar` progress events report checking/removal; QC stores the preference,
original size, retained window and removed rows. No store version or CSP change.

## 2026-09-10 amendment: delete selected, sortable Find headers, editable subject, reviewed status, demo toggle

Spec `docs/superpowers/specs/2026-09-10-studies-table-review-design.md`; plan `plans/2026-09-10-studies-table-review.md`.
The record gains `reviewedAt` (§8.1, above). Status gains `'ok'`/Reviewed (§8.2); the mark is cleared ON THE WRITE at four sites:
`segmentStudy`'s run commit, `measure-queue.js`'s correction commit, the viewer's RESET TO PREDICTION, and `renderer/calibration.js`'s
`withCalibration(study, calibration)` (an unchanged scale returns the same record). The Find tab's module-scope UI state is
`confirmingId`, `confirmingSelected` and `editingSubject`, all in its `update()` key; its `data-find-key`s gain `delete`, `delete-prompt`,
`delete-confirm`, `delete-cancel`, `sort-<key>`, `subject-<id>`, `subject-input-<id>`. `SIDEBAR_KEYS` gains `deletingStudies`.
The header cells stay plain divs (no `aria-sort`; the ROADMAP accessibility item owns the table semantics).

**2026-09-10 fix (spec 7.3):** a rebuild mid-edit (a Find/Parameters notification arriving while a SUBJECT editor is open) re-creates
the editor with its draft, focus and caret restored, but Chromium still fires the destroyed `<input>`'s `blur` one microtask later.
The editor's deferred `onBlur` commit (`queueMicrotask` → `commitSubject(id, 'blur')`) skips the write when the input node is no
longer connected to the document (`!input.isConnected`) while `editingSubject` still names that row — a removal-blur, as opposed to a
user-driven blur, where the node is still connected at that moment. Without the guard the half-typed draft was written and the editor
closed out from under the user. See HANDOFF's "Known traps" and `smoke-studies.mjs`'s "a rebuild while the editor is open keeps the
editor, the draft and the caret" check, the tripwire for this guard.

## 2026-09-10 amendment: editable femoral circles and image confidence (v1.0.7)

User-authorized: raw femoral masks are no longer decoded or rendered; only the
vertebral label mask is overlaid. Geometry draws circles, centres and the bilateral
midpoint in both viewers. Legacy `side` selection keys identify array slots only;
visible names are Head 1/2. Circles are a compact array of zero, one or two triples.
`hip_midpoint` is null unless two circles exist. Deleting compacts the array and clears
selection. `/measure` accepts a single circle without inventing pelvic angles, and
permits an explicitly emptied correction with `geometry.manually_cleared: true`.
An empty automatic prediction still fails. Save/load preserves these partial edits.

All editing stays in `components/viewer.js`; geometry helpers mutate only clones.
Successful edits set `qc.manual_edits.landmarks` and, when circles changed, `femoral`.
Original model QC remains provenance; refreshed coverage describes current geometry.
Reset restores the prediction's QC along with its geometry and measurements. When
the snapshot carries no QC, reset keeps the study's own QC instead, never erasing
its review reasons (2026-09-10).

`data/confidence.js` derives a categorical overall review assessment and individual
score details. This supersedes the single femoral-fit badge. It must never present
femoral fit as overall accuracy or invent an aggregate probability. Missing checks,
partial anatomy, calibration, orientation, consistency and manual-edit provenance
remain visible. Pending corrections display Updating; a run in flight on the open
study displays it too (2026-09-10). No schema-version bump,
CSP change or new runtime dependency.

## 2026-09-23 amendment: HRNET cervical landmarks and alignment

User-authorized cervical inference extends the existing lumbar application.
Study `region` is `lumbar` (including absent legacy values) or `cervical`.
`anteriorSide` is explicitly `left`/`right` for a cervical run; no default
anatomical side is inferred from image-left/right model labels. Prediction
requests use `bodyPart: 'cervical'`, `models.vertebrae: 'cervical_hrnet'`, and
`anteriorSide`; the bridge sends `anterior_side`. Lumbar request fields and model
selection are unchanged. `/models?body_part=cervical` advertises the cervical
landmark model; the default `/models` response remains lumbar-compatible.

Cervical geometry is discriminated by `region: 'cervical'`, retains
`anterior_side`, and carries `c2_centroid` plus C2–C7 `vertebrae`. Endplate arrays
are always anatomically ordered anterior then posterior. C2 has only its inferior
endplate; its superior endplate and quadrilateral are null. Any absent endplate
remains null. Lumbar-specific S1/hip/L1-centre fields are null and femoral circles
are empty. Source coordinates preserve the uploaded image origin, dimensions and
vertical axis; no segmentation mask is fabricated from heatmap landmarks.

`/measure` dispatches cervical geometry to the independent cervical calculator.
Measurements use `region: 'cervical'`, `C2C7_COBB`, `C2C7_SVA_PX`, and
`C2C7_SVA_MM`. Cobb is the unsigned acute C2/C7 inferior-endplate angle. SVA uses
the C2 centroid and C7 superior-posterior corner, signed positive anterior.
Dependent values remain null when their anchors are absent. Optional
`pixel_spacing` uses `[row_mm, column_mm]`; missing scale never produces mm.
The current study calibration controls display, export and correction requests,
including anisotropic angle calculations and explicit scale clearing.

`state.selectedLevel` additionally accepts `C2C7_COBB` and `C2C7_SVA`, each with
its own construction. Cervical editing exposes the C2 centroid, C2 inferior pair,
C7 superior-posterior corner and C7 inferior pair; it preserves the existing
clone/measure/commit/reset queue. Persistence accepts discriminated cervical
geometry and measurements while retaining all existing lumbar validation.
Optional `Study.predictionId` and sidecar `prediction_id` bind each saved result
to its prediction run. Sidecar restoration checks run identity, region, anterior
side and source coordinates, including after decoding; an old sidecar cannot
become a new region's reset target if a newer sidecar write failed.

Cervical HRNET and its paired DETR are exported to
`cervical_hrnet.onnx` and `cervical_detr.onnx`. Both share the existing ONNX
session/resource/cancellation policy. The runtime imports no training libraries.
The common export and packaged-model verification cover all six models.


## 2026-09-23 amendment: global C7–S1 SVA

Study `region` additionally accepts `full_spine`. The existing cervical and
lumbar workflows remain independent. Full-spine requests explicitly carry
`bodyPart: 'full_spine'`, `models.vertebrae: 'dual_hrnet'`, and `anteriorSide`;
`/models?body_part=full_spine` advertises this combination. The pipeline searches
regional crops using the existing cervical detector/HRNET and S1 detector/lumbar
HRNET graphs. It adds no model weights or runtime dependencies.

Global geometry carries `region: 'full_spine'`, `anterior_side`, `c7_centroid`,
and `s1_superior` ordered anterior then posterior. The C7 centroid prediction is
the mean of its four predicted body corners. All anchors, crop rectangles,
source dimensions and calibration use the untouched uploaded image frame.
Internal anterior-left normalization is reversed before returning any landmarks.
Invalid, missing or competing crop clusters leave dependent anchors absent.

`/measure` dispatches global geometry independently. `GLOBAL_SVA_PX` and
`GLOBAL_SVA_MM` represent the horizontal offset of C7 from the S1 posterior
corner, signed positive anterior. Millimetres require the current source-bound
column spacing; missing or cleared calibration never creates a millimetre value.
`state.selectedLevel = 'GLOBAL_SVA'` draws the vertical C7 plumb line and
horizontal S1 offset. Three handles edit the centroid and S1 endplate endpoints,
using the existing correction queue and saved-prediction reset workflow.
Persistence, Parameters and single/paired exports keep global and cervical
measurements in their own fields. Crop agreement is not an accuracy probability;
landmark identity, anatomy and source orientation require review.


## 2026-09-27 amendment: processor choice (CPU or DirectML GPU)

User-requested after a GPU chosen in Windows graphics settings and the NVIDIA app left
inference on the CPU: those preferences pick the GPU that renders a program's graphics,
while inference runs in the backend process on the provider its session names. See
`docs/gpu-processing.md`.

`state.performance` adds `processor`: `'cpu'` (default, and for older `performance.json`)
or a GPU's PCI identity `gpu:<vendor>:<device>[:<n>]` (lowercase hex, 4–8 digits; `:n`
from 2 for identical cards). `normalizePerformance` (main) and `validPerformance`
(renderer) share one pattern; an invalid value is rejected, never coerced. It is locked
during a prediction/batch like the other processing settings. `state.processors` is
session-only: `null` until listed, then `[{id, kind: 'cpu'|'gpu', name}]`, CPU first.
Preload adds `listProcessors()` (IPC `list-processors` → backend `GET /processors`, reduced
by `normalizeProcessors`); boot does not wait for it. `SIDEBAR_KEYS` gains `processors`.

Prediction multipart adds `processor` (default `cpu`); a malformed id is a 422.
`runtime.session` resolves it once per request (`backend/processors.py`). ONNX Runtime
reads its device list once per process, but DirectML re-reads Windows' adapter order at
every session creation, so a listed GPU is matched by PCI identity against a live DXGI
enumeration (`_dxgi_adapters`) for its current index, which is never persisted. A GPU
absent from either list runs on the CPU with a real `processor` progress event; if DXGI
cannot be read, ONNX Runtime's startup index is used and a warning is logged. Session
cache policy is `(threads, low_memory, adapter)`, so a changed processor or index evicts
sessions. GPU sessions are `[('DmlExecutionProvider', {device_id}), 'CPUExecutionProvider']`
with memory patterns off. Sessions are created with `enable_fallback=0`: any error
creating or running an accelerated session (DirectML or the existing Core ML S1 path)
retries that model once on the CPU with a real progress message; CPU errors propagate.
Calibration never uses the setting.

`qc.processing.processor = {requested, resolved, name, note}` joins the per-model
`providers`. The Analysis header appends `GPU`, `GPU + CPU` or `CPU` only for results
carrying `processor`, derived from the recorded providers (never the setting); its title
gives the GPU name or the fallback note. No store version, CSP, runtime JS dependency or
model change. `backend/requirements.txt` selects `onnxruntime-directml==1.24.4` on 64-bit
Windows and `onnxruntime==1.24.4` elsewhere; the Windows bundle check requires
`DmlExecutionProvider` and `DirectML.dll`. CI has no GPU: the GPU path is verified on a
workstation with `--verify-models`, which exercises each listed GPU.


## 2026-10-10 amendment: vertebral level editor, window / level, label record

Spec `docs/design/level-editor/HANDOFF.md` (`594a982`); plan `plans/2026-10-10-level-editor.md`, whose Decisions
table (D1–D20, the owner's answers; D15–D18 from the gate feedback of 2026-10-11, D19 from G6 on 2026-10-12, D20
from G7 on 2026-10-13) wins over the spec and whose Ledger holds the execution rulings R1–R45 (R26 and R27 from the
gate feedback of 2026-10-11, the plan's "Gate feedback" section, R28 from its review, R29–R34 from G3 and G4, R35–R37
from their review, R38 and R39 from G5, R40 and R41 from G6, R42 from its review, R43 and R44 from G7); released as
v1.1.0 (PR #60, `cbbeb4e`, 2026-10-12), G7 after it; user doc
`docs/level-editor.md`; label record schema `docs/design/level-editor/label-record.schema.json`. Edit mode is the
level editor: the Analysis screen's right panel becomes the Vertebral levels panel (sixteen levels in five groups:
C2–C7, T1 · T4, L1–L5, S1, two femoral heads), the stage places, selects and adjusts levels, a display-only window /
level acts on the film layer, and **Save edits** writes one label record per film for retraining.

**File structure.** New: `renderer/level-editor.js`, `renderer/components/level-editor.js`, `renderer/data/levels.js`,
`renderer/data/level-projection.js`, `renderer/data/label-record.js`, `renderer/data/contours.js`,
`renderer/viewer/level-handles.js`, `renderer/viewer/window-level.js`, `backend/decode.py`,
`test/fixtures/schema-check.js` (one line each in the File structure block above), with their unit tests
(`test/levels`, `level-projection`, `level-handles`, `window-level`, `label-record`, `contours` `.test.js`;
`backend/tests/unit/test_decode.py`, `backend/tests/integration/test_decode_server.py`) and
`tools/smoke/smoke-levels.mjs`. No root module was added, so neither electron-builder allowlist changed. New exports
on existing modules: `api.js` `decodeFilm`, `loadLabelRecord`, `saveLabelRecord`, `deleteLabelRecord` (preload
`decodeFilm`, `loadLabelRecord`, `saveLabelRecord`, `deleteLabelRecord`); `screens/analysis.js` `ensureFilm(studyId)`
and `imageInfo(studyId)`; `components/viewer.js` `commitGeometry` (the measure queue's) and `getPrediction(studyId)`;
`data/predictions.js` `isHandPlaced(study)`; `viewer/canvas.js` `imagesFromRaw`, `colorFor` and the level editor's
draw path in `drawDynamicLayer` (`opts.editor`, `handle`, `dragGeometry`, `overlays`, `overlayOpacity`) and
`drawStaticLayer` (`opts.editing`, `opts.window`).

**`state.levelEditor`** (store block above): `LevelEditor | null`, typedef in `renderer/data/levels.js` (studyId,
region, levels, model, baseline, record, selected, handle, placing, open, exitPrompt; the `window` it held until
2026-10-11 is the store's own `filmWindow` now, see "Gate feedback" below). `renderer/level-editor.js`
is the only writer of a non-null value; the other writers only ever reset it to null: `FRESH_VIEW` (its keys in
`screens/studies.js` and `data/demo-visibility.js` gain `levelEditor: null`), a run's completion for that study
(`segmentStudy`), and `changeRegion`. Session-only, never persisted, never mutated in place: every action builds a new
editor, which the viewer's dynamic key and the panel's rebuild key compare by reference. An editor with unsaved changes
that leaves the store through a navigation is kept for the session in the wiring module's stash, keyed by study id,
and brought back by the next Edit on that study (D7); a delete, a re-run or a Region change drops it
(`forgetLevelEditor`). `state.selection` and the `Selection` typedef are unchanged but unused in edit mode
(`state.selection` is always null there; the focused handle is `state.levelEditor.handle`).

**`Study.labelFile: string|null`** (Study typedef above): optional and default null like the other optional fields, no
`STORE_VERSION` bump, listed in `validateStudy`'s returned object. The renderer picks the name (`labelFileName`, D3)
and keeps it on the record across saves; the main process only validates it.

**Persistence.** A third kind of file: **`userData/labels/<stem>.label.json`**, one per film, named for the film's
filename stem (`lateral_lumbar_001.dcm` → `lateral_lumbar_001`), `-2`, `-3` … when another study's `labelFile`
already holds the name (D3). The stem is made safe first (R12: `\ / : * ? " < > |` and control characters become `_`,
leading dots go, the stem is capped at 180 characters, a Windows device name takes a `_`); the main process accepts
only a bare `<name>.label.json` (`main.js` `LABEL_FILE`) and rejects anything else with `Invalid label file name.`.
Written atomically through `main.js` (`writeJsonAtomic`, IPC `save-label-record`, which creates `labels/`), read with
`load-label-record` (null when absent or unparseable), deleted with the study (`deleteStudy` and the bulk
`deleteStudyBatch`, inside the same try as the sidecar), and quarantined with the rest: a corrupt `studies.json` moves
`labels/` aside as `labels.corrupt-<stamp>` under the same stamp as `predictions.corrupt-<stamp>`; a non-ENOENT failure
to move it takes the existing `persistenceUnsafe` path, nothing written for the session (R11). Writes are gated by
`assertWritable` like every other write. The record never names the SP id; the study is named by its stem. Demo
studies never write one.

**Backend API.** `POST /decode` (multipart `file`, no model): `{width, height, bits_stored, value_min, value_max,
window: {center, width}|null, photometric, scaled, pixels_base64}`, the original film's pixels as little-endian uint16
of `round(value − value_min)` (RescaleSlope/Intercept applied; a MONOCHROME1 film inverted with its WindowCenter), the
25-megapixel cap and the 50 MB upload limit; 422 with a display-ready `detail` for a file it cannot read. A value
range wider than 65535 is scaled into 0..65535 and `scaled` is true; the renderer's `RawFilm` (`viewer/window-level.js`
`rawFromDecoded`) carries the factor as `scale` (value = pixel × scale + valueMin, 1 when unscaled). Both are a
deviation from the plan, which had neither (R23). IPC
`decode-film` hands the renderer bytes, not base64. Every `/predict` result's `qc` gains `model_versions`
(`backend/models/models.py` `model_versions(models)`: per structure the graph's `onnx_sha256`, two joined with `+`,
null when unknown), which the label record writes as `model.version`.

**Geometry.** T1, T4, per-level visibility, `source` and femoral rim points never enter `study.geometry`: they live in
the level model and the label record only. The levels a film's region measures are projected into `study.geometry`
through the existing measure queue (`projectGeometry` → `commitGeometry` → `/measure`), so measurements, the em-dash
rule and `studies.json` work as before (D2: drags keep auto-committing; Save edits writes only the record). C2 in the
level model is an inferior endplate plus a centroid (D8), projected as `vertebrae.C2.inferior` and `c2_centroid`.
**`isHandPlaced(study)`** (R16 as amended, `data/predictions.js`): true when `predictionId == null && !qc?.models`. It
gates the film: such a study has no sidecar, so `needsRestore` is false, `restoreFilm` never runs for it, and
`ensureFilm` decodes its original for the stage (never FILM UNAVAILABLE); a study with a prediction id or `qc.models`
(a pre-v1.0.10 result included) keeps the sidecar path. `LEVEL_RGB` gains `T1`, `T4` and `S1` (D9, the shipped colours
kept); `buildLabelColorMap` iterates a private `MASK_LEVELS` list (the original eleven keys) so S1's entry never colours
a mask label (R15).

**Removed by Task 13** (no live caller once the level editor drew its own handles), each superseded 2026-10-10:
`viewer/interactions.js` ~~`TAB_ORDER`~~, ~~`FULL_ORDER`~~, ~~`nextSelection`~~, ~~`nudge`~~, ~~`sameHandle`~~,
~~`hitTestFemoral`~~; `viewer/geometry.js` ~~`nearestLandmark`~~, ~~`landmarkHandles`~~; `viewer/canvas.js`
~~`drawHandle`~~, ~~`drawHandles`~~, ~~`drawTracePoints`~~, ~~`HANDLE_HOVER_RADIUS_PX`~~, ~~`HANDLE_RADIUS_PX`~~,
~~`HANDLE_LABEL_PX`~~; `data/cervical.js` ~~`CERVICAL_HANDLES`~~; `data/global-sva.js` ~~`GLOBAL_SVA_HANDLES`~~. Their
replacements are in `viewer/level-handles.js` (handleOrder/nextLevelHandle, nudgeHandle, hitTestLevelHandles,
levelHandles) and the canvas's `drawLevelHandles`. The old edit bar's RETRACE, FIT (as a retrace), ADD CIRCLE and
DELETE CIRCLE are gone: a femoral head is re-placed from 2–4 rim points with the panel's Place… and the edit bar's FIT,
refitted by a rim-point drag, and hidden with its checkbox; Delete and Backspace do nothing in the level editor.

**Behavioural rulings** (plan Ledger):

- R4: a group's header count omits a zero PLACED clause (the prototype's rule); the panel summary always writes PLACED.
- R5: `fitFrom` equals `need` for every kind but a femoral head (FIT from 2); `geometryFromPoints(code, points,
  imageSize)` caps a femoral fit at the image diagonal; disc heights add no dependency entries (their pairs are pinned
  equal to the lumbar segmental pairs by a test).
- R6: the projection computes `l1_center` (the mean of L1's corners) and `hip_midpoint` (the mean of two centres)
  rather than nulls, because the validator rejects null with L1 or two circles present; `/measure` overwrites both.
- R7: a cervical or full-spine projection with no orientation keeps `anterior_side: null` and is not committed until an
  orientation exists (`/measure` and the validator refuse it).
- R8: anterior side precedence in the projection: the film's stored `anterior_side`, then `study.anteriorSide`, then
  the side read from placed levels, then null. An annotator dragging SA past SP never flips a film's sign conventions.
- R9 (amended): with a saved record, the study's femoral circles are matched to Head 1/Head 2 by the record's head
  geometry (centre and radius); a matched head takes the saved geometry, rim included; unmatched circles fill the free
  heads FH1 then FH2, preferring a head the record does not mark not visible.
- R10: the record's `contour` is written only for a `segmented` body level; edited and manual levels write null (their
  `model_corners` carry the model's quad).
- R13: the 8-bit window rule is `valueMin >= 0 && valueMax <= 255 && (bitsStored === 8 || exactly 0..255)`, so an
  8-bit DICOM with a rescale takes the general range.
- R14: `ensureFilm` reports `superseded: true` as its own flag; `reason` stays display-ready (null when superseded).
- R17: Re-run (the toolbar's and the region bar's Run segmentation) is disabled while editing, titled `Finish editing
  before re-running segmentation`; a batch reaching a film with an open or stashed editor still drops that editor on
  completion.
- R18: a level row with two actions stacks them in its 70px column (Place… above CLEAR, `.lv-actions.is-stacked`).
- R20 (final review): a film's region follows its placed levels while `data/level-projection.js`
  `regionFollowsLevels(editor, study)` holds: the editor opened as Auto, or `requestedRegion(study) === 'auto'` and the
  study is `isHandPlaced` (or its result names no region). Then `projectionRegion` derives the region from the visible
  placed levels on every projection (C only → cervical, L/S1/head only → lumbar, both → full spine, neither → lumbar),
  never from the `geometry.region` a commit wrote; `projectsLevel(code, editor, study)` decides which level changes
  commit (every code but T1/T4 while the region follows); `enterLevelEditor` opens such a film with `region: 'auto'`
  (D6's defaults). R7 still holds a cervical or full-spine projection with no anterior side.
- R21 (final review): the region bar's Region and Orientation selects are disabled while editing, titled `Finish
  editing before changing the region` / `Finish editing before changing the orientation`, and `changeRegion` returns
  early while editing; outside edit mode it still drops a stashed editor (`forgetLevelEditor`).
- R22 (final review): `data/levels.js` `canFinishPlacing(editor, imageSize)` is false while a femoral head's fit would
  have a radius under 0.5 px (or below `fitFrom` clicks); `finishPlacing` is a no-op then, FIT's enabled state reads
  it, and `addPoint` drops a head's click within 1 px of any of its rim points.
- R24 (final review): ~~a hand-placed film whose run had failed keeps `processingError` and its Failed status; whether
  the first hand-placed commit should clear it, or the film get a status of its own, is the owner's decision (plan
  Task 15, ROADMAP §8).~~ Closed 2026-10-15 by E2 (annotation editor round 2, the amendment at the end of this file):
  a status of its own, `hand`, and the first hand-placed commit clears the failure.
- R25 (the wave's re-review): `viewer/level-handles.js` `moveHandle` refuses a rim-point move (a drag or an arrow nudge)
  whose refit would have a radius under `MIN_RADIUS` (0.5 px, exported by `data/levels.js`) and returns the geometry
  unchanged, so no path leaves a femoral head the label record's schema rejects.
- R26 (gate feedback G2): `addPoint` drops a click within 1 px of ANY other placed point of the placement, for every
  kind (it generalises the previous-point rule and keeps R22's rule for a head; a slot's own earlier point is not
  another point, and a double-click counts once).
- R27 (G2): a re-placed point counts once in `placing.history` and moves to its end, so UNDO after a re-place clears
  the point instead of restoring its earlier position.
- R28 (the review of the gate feedback): `viewer/canvas.js` `drawLevelEditor` and `drawDynamicLayer` floor the drawing
  ratio at 1 image pixel per CSS pixel (`Math.max(1, opts.pixelRatio ?? 1)`; `opts.pixelRatio` is still image pixels
  per CSS pixel). Below 1:1 every screen-sized part of the overlay holds its size on screen; past 1:1 it keeps its
  image-pixel size and magnifies with the film instead of falling under one image pixel. Hit testing
  (`viewer/level-handles.js` `hitTestLevelHandles`) is in client space; `components/viewer.js` passes it a grab radius
  of `Math.max(14, LEVEL_HANDLE_RADIUS_PX / Math.min(1, pixelRatio))` CSS px (`LEVEL_HANDLE_RADIUS_PX`, 6, is now
  exported by `viewer/canvas.js`), so a handle drawn larger than 14 px past 1:1 is grabbable over its whole disc.

**Gate feedback (2026-10-11).** G1: `viewer/interactions.js` `ZOOM_MAX` is 8 (was 2.4). G2: the step chips choose which
point the next placement click sets. `state.levelEditor.placing` is `{code, points, current, history} | null` for every
kind (typedef `Placing` in `renderer/data/levels.js`): `points` holds one slot per step (`placementSteps(code).need`),
null until set; `current` is the slot the next film click sets (a femoral head's first empty slot); `history` lists the
set slots in the order they were last set, each once. New exports: `data/levels.js`
**`setPlacingStep(editor, index)`** (every kind but a femoral head; an out-of-range or non-integer index, a head or no
placement returns the editor unchanged) and `renderer/level-editor.js` **`selectPlacingStep(index)`** (the chips'
click; no edit flag, nothing committed, paused while the window / level panel is open). `addPoint` sets the point in
slot `current` (a head: in its first empty slot), then moves `current` to the next empty slot after it, wrapping, and
finishes when none is empty; `undoPoint` clears the last `history` entry and makes it current; `finishPlacing`/`canFinishPlacing` count the
placed points; `placingLabel` reads `current + 1` (a head still counts its placed rim points) and `placingHelp` the
current step's help. While placing every kind but a head, each step chip in `components/viewer.js` is a `<button>`
(`viewer-step`, `is-done`, `is-current`, `aria-current="step"`); a head's chips stay spans. The review of the gate
feedback added `renderer/level-editor.js` **`restorePlacing(prior, pressed)`**: a LEFT-first chord's take-back of its
placement press (`components/viewer.js` `placeAt` keeps the placing from before the press and the one it left, only
when the press set a point and left the placement open; `startChordPan` calls it). It puts `prior` back while
`editor.placing` is still `pressed`, and is a no-op otherwise (the placing has moved on, or `pressed` is null); no edit
flag, nothing committed. UNDO is no longer the take-back: under R27 it clears the slot, so a press that re-placed a
point would lose the point's earlier position.

**Gate feedback G3 and G4 (2026-10-11; D15–D17).** Window / level works outside edit mode and belongs to the view.
**`state.filmWindow`** (store block above) replaces `state.levelEditor.window`: `FilmWindow | null`, the old window
state plus `studyId` (a decode for a film no longer open lands nowhere), typedef in the new **`renderer/film-window.js`**,
its only writer (File structure block above). FRESH_VIEW gains `filmWindow: null` in both copies (nine keys; pinned
equal, and to their content, by `test/demo-visibility.test.js`); entering and leaving edit mode keep the window.
Exports: **`configureFilmWindow({ensureFilm})`** (`screens/analysis.js` hands it `ensureFilm`, beside
`configureLevelEditor`); **`windowFor(state, study)`** (the store's window when its `studyId` is that study's, else
null; every reader in `components/viewer.js` and the level editor's placement guards go through it);
**`openWindowPanel()`** (a window loading or ready opens; none, or an unavailable one, starts a loading window with the
panel open and the decode); **`ensureWindowLoaded()`** (the same decode with the panel closed, for the right-button
drag, only when the open film has no window yet); **`closeWindowPanel()`**; **`setWindow({width, level})`** (clamped by
`clampWindow` to the window's `range`, only when ready, an unchanged window writes nothing); **`resetWindow()`**;
**`forgetFilmWindow(studyId)`** (`screens/analysis.js` calls it wherever it calls `forgetLevelEditor(studyId)` for a film
whose images change or go: `releaseStudy`, a run's completion, `changeRegion`). The two open functions return the
decode's promise. The decode is the level editor's former `loadWindow` (up to three attempts on a superseded outcome;
ready at `defaultWindow(raw)` with `windowRange(raw)`, or unavailable with a display-ready reason); only the newest
decode lands, on the loading window it was started for, while that film is open. **Removed** from
`renderer/level-editor.js`: ~~`openWindowPanel`~~, ~~`closeWindowPanel`~~, ~~`setWindow`~~, ~~`resetWindow`~~ (moved to
`film-window.js`) and the private `loadWindow`; `openEditor` writes no `window` and the stash no longer resets one; the
`WindowState` typedef left `data/levels.js`. `placePoint`, `selectPlacingStep` and `fitPlacing` pause while the view's
panel is open over the editor's film. `viewer/interactions.js` gains **`isDoubleClick`** (block above).

The stage, in every mode: the Window / level tool is always shown (disabled for a demo study and with no film on the
stage); the panel opens outside edit mode under the toolbar (`.viewer-stage:not(.is-editing) .viewer-wl`) with a hint
line; the chip reads the window whenever it is ready; `drawStaticLayer` gets `opts.window` from the view's window in
both modes (outside edit mode the overlay is drawn over the windowed film); a LEFT press with the panel open starts a
window drag in both modes (outside edit mode it outranks construction selection). A RIGHT press (`button === 2`, not a
chord) on the film (`handlePointerDown`) or the black surround (`handleHostPointerDown`) starts a window drag in every
mode, Pan on or off (D16), calling `ensureWindowLoaded()` and waiting with `start: null` until the window is ready; a
second right press that `isDoubleClick` accepts resets the window and starts no drag (D17); `startChordPan` dismantles a
window drag as it dismantles a label drag. A live window drag carries `is-window-drag` (its `all-scroll` cursor beats
the pan-mode cursor). Escape outside edit mode closes the panel before it clears the construction; in edit mode the
order is unchanged. Still display only: no measurement, geometry, record or persisted value depends on the window.

- R29 (G3): the window resets where zoom and pan reset, FRESH_VIEW; Back to the list and the sidebar's open-study card
  keep it as they keep zoom and pan; a writer that changes `openId` without FRESH_VIEW (the calibration screen's return)
  leaves a window `windowFor` refuses, its `studyId` being another film's.
- R30 (G4): `ensureWindowLoaded` does not retry an unavailable window; `openWindowPanel` does.
- R31 (G4): a right-button drag over an unavailable film with the panel closed toasts `Window / level is unavailable.`
  and the reason, once per drag at its first move.
- R32 (G4): the double right-click compares the two presses only (button, 400 ms, 6 px, the events' `timeStamp`s), on
  the film and the black surround alike; its second press is forgotten (a third begins a new pair); a chord forgets the
  right press before it; its first press is an ordinary right press.
- R33 (G3, G4): copy. The tool's tooltip `Window / level — or right-drag on the film; double right-click resets` (its
  accessible name stays `Window / level`); the panel's hint outside edit mode.
- R34 (G3, G4): windowing is not gated on the study's own run (display only; the completed run forgets the window), so
  a left press with the panel open windows before the busy check that guards placement and handles; with the panel
  open outside edit mode the construction label chip still takes its own left press.

**The review of G3 and G4 (2026-10-11; `8332dfb`).** D15's wording follows the behaviour: the window resets where zoom
and pan reset (FRESH_VIEW: another film opened from the list, or the open study closed); Back and the sidebar's return
keep it (R29). `renderer/film-window.js` gains **`windowNeedsDecode(state, study, images)`** (pure: `study`'s window is
ready or loading and `images`, the film's cached images or null, carry no `raw`) and **`redecodeKeptWindow(studyId)`**
(the deps' `ensureFilm` again, through the private `askFilm` the decode now shares, superseded outcomes asked again; no
original forgets a READY window of that film, a loading one is left to its own decode); `screens/analysis.js` `render()`
asks the first, with `cachedImages(study.id)`, ahead of its restore, preview and `ensureFilm` branches, and when it is
true calls the second in their place. `viewer/interactions.js` gains **`exceedsSlop`** (block above). In `components/viewer.js`
a right press starts a PENDING window drag (`{kind: 'window', pending: true, …}`, capture, the press point, no classes,
no decode) that `handlePointerMove` makes a window drag at the first move 3 CSS px from the press (`exceedsSlop`):
then, and not at the press, `ensureWindowLoaded()` runs for a film with no window yet, and a ready window starts the
drag with the press point as origin; `startChordPan` dismantles a pending drag as a live one; `is-windowing` ignores a
pending press. The left press's window branch comes before the Pan toggle's.

- R35 (review, finding 1): a kept window never outlives the decoded original it windows; at the mount a ready or loading
  window over cached images without `raw` (another study's run took the single cache entry) is decoded again through
  `ensureFilm`, which restores the stored image too, and a ready window whose re-decode brings no original is forgotten.
- R36 (finding 3): the open W/L panel outranks the Pan toggle for the left button, in both modes; the middle button and
  the chord still pan; the `.is-windowing` cursor rule follows the pan-mode rules.
- R37 (finding 4): a right press alone starts nothing; the drag begins, and decodes a film with no window yet, once the
  pointer has moved 3 CSS px; a stray right click or a chord formed before any movement decodes nothing; the double
  right-click still compares presses (R32); R31's toast comes at the move that begins the drag.

**Gate feedback G5 (2026-10-11; D18, `3e552e6`).** The label record lists which points each entry was given and sums
them. `renderer/data/levels.js` gains **`pointKeys(code)`** (the record's geometry keys of the code's kind, in record
order: a body `sa, sp, ia, ip`; C2 `ia, ip, centroid`; T1/S1 `sa, sp`; T4 `centroid`; a femoral head `center, radius`;
`[]` for an unknown code; a fresh array) and **`changedPoints(code, geometry, modelGeometry)`** (pure: the keys whose
value in `geometry` differs from `modelGeometry`'s by the per-value test `sameGeometry` uses, the private `near` with the
shared `SAME_EPS`, 1e-6, now also `sameGeometry`'s default eps; a head compares centre then radius, never its rim; every
key when `modelGeometry` is null, `[]` when `geometry` is). `renderer/data/label-record.js` `levelRecord` and
`headRecord` write **`edited_points`** right after `source` on every level and head: `changedPoints` for `edited`, every
key for `manual`, `[]` for `segmented`, `not_placed` and `not_visible`; `toLabelRecord` writes **`edits`** after
`complete`: `{segmented, edited, manual, not_placed, not_visible, points_moved, points_placed}`, entries per state over
the fourteen levels and two heads together, `points_moved` the edited entries' list lengths summed, `points_placed` the
manual entries'. `recordLevels` reads neither. The schema keeps its id; `edited_points` (per-kind `$defs`, `uniqueItems`
over the kind's enum) and `edits` (`$defs/edits`, seven required non-negative integers, nothing else) are optional;
`test/fixtures/schema-check.js` supports `uniqueItems`.

- R38 (G5): `state === 'edited'` exactly when `edited_points` is not empty: both read the same per-value comparison
  over the same values (the kind's points; a circle's rim is not one, so a rim-only change lists nothing and the head
  stays segmented). Pinned by a unit test over every single-number perturbation of each kind, and stated in the schema
  (`editedPointsRule` and a per-kind manual `minItems`) for records that carry the field.
- R39 (G5): both fields are additive; the schema id stays `spinecontour.segmentation-label/1` and neither field is
  required, so records saved before them validate and read the same; the app writes both on every save from now on.

The re-review of the window change, folded into G5: `renderer/level-editor.js` `showFilm` (entering edit mode) forgets
a READY window of the film (`forgetFilmWindow`) when `ensureFilm`'s outcome carries no decoded original, the rule of
`redecodeKeptWindow` (a loading window is left to its own decode; a superseded outcome changes nothing).

**Gate feedback G6 (2026-10-12; D19, `ad2b70b`).** Mark reviewed also writes the label record when the study has none
yet. `renderer/level-editor.js` gains **`writeReviewRecord(studyId)`** → `Promise<'written' | 'skipped' | 'failed'>`,
never rejecting: once the film has been read it builds an editor in memory, `openEditor({ study, region:
editorRegion(study), modelGeometry: deps.getPrediction(studyId)?.geometry ?? null, saved: null })` (`editorRegion` is
`enterLevelEditor`'s region rule, R20, now one private function both call), never puts it in the store and never
touches `state.levelEditor`, `editing` or the stash; it writes that editor's record, sets `labelFile` on the study and
toasts `Saved the label record.`, or toasts `Marked reviewed. The label record could not be written: <reason>` on a
failure. It skips (writes and says nothing) a study that is gone or re-added, a demo, one not marked reviewed, one with
no `measurements`/`geometry`, one with a `labelFile`, one whose own run is in flight, and one with an editor open or
stashed (R40), checked before the write and again once the film has been read; it refuses a model result whose
prediction snapshot is missing then (`the model's prediction is not loaded.`), which would otherwise record every
placed level `manual`. **The shared core** is the private `writeRecord(studyId, addedAt, editorOf)`: `deps.imageInfo`,
the same-record check across that await (`addedAt`), the editor `editorOf(state, study)` returns (null: nothing
written), the file (`labelFile`, else `labelFileName` of the stem over the other studies' names), `toLabelRecord` with
`levelContours`, `api.saveLabelRecord`, and the removal of a file written for a study deleted meanwhile; it resolves
`{file, editor, kept, state}` or null. `saveLevelEdits` is that core plus its baseline, editor and toast, so the two
records cannot drift. The re-entrancy latch `saving` is shared and holds `'edits'`, `'review'` or null, with a promise
that settles when the write ends: a second Save edits while one writes is dropped (as before), a Save edits waits for a
review write, and a review write waits for either. `screens/analysis.js` `toggleReviewed` calls
`writeReviewRecord(open.id)` after the `setState` that marks the study, never when unmarking; `reviewBlockedReason` is
unchanged.

- R40 (G6): no review write while an editor for the study is open or stashed (`state.levelEditor?.studyId ===
  studyId` or `hasStashedEditor(studyId)`); the mark still applies.
- R41 (G6): the mark never waits for or depends on the write: `reviewedAt` is set first, synchronously, and stands
  whatever the write does.
- R42 (G6, review round 1): the review write reads the stored image only. `screens/analysis.js` is now
  **`imageInfo(studyId, { storedOnly = false } = {})`**, its result gaining `sidecarGeometry` (object or null): with
  `storedOnly`, a model result (**`data/predictions.js` `hasStoredImage(study)`**, new: a real study with `measurements`
  and `geometry` that `isHandPlaced` does not claim, also `loadFilm`'s step-1 test now) is read from the image cache
  when it holds the film, else from its own sidecar for that call alone (restoreFilm's sidecar guards, none of its side
  effects: no `/decode`, nothing cached, no viewer handed anything, no restore started or superseded), and
  `sidecarGeometry` is that sidecar's geometry when it was read (else null). Without `storedOnly`, or for a film whose
  stored image is its decoded original (no result, or placed by hand), `imageInfo` reads through `ensureFilm` as before.
  The private core is now `writeRecord(studyId, addedAt, editorOf, imageOptions)`: `imageOptions` goes to
  `deps.imageInfo` and the facts to `editorOf(state, study, info)`. `writeReviewRecord` passes `{ storedOnly: true }`
  and takes the model's geometry from `deps.getPrediction(studyId)?.geometry`, else `info.sidecarGeometry`;
  `saveLevelEdits` passes no options.

**Gate feedback G7 (2026-10-13; D20, `6463f63`).** The level plates sit outside their level on the posterior side and
can be dragged. New pure module **`renderer/viewer/level-labels.js`** (File structure block above; `test/level-labels.test.js`):
**`labelAnchor(code, geometry)`** (moved from `canvas.js`, a fresh point or null), **`labelPlacement(code, geometry,
anteriorSide)`** → `{ anchor: [x, y], side: 1 | -1 } | null` (null for a femoral head or a geometry not of its kind),
**`plateAnteriorSide(study, editor)`** → `'left' | 'right' | null`, **`plateOffset(positions, code)`** → `[dx, dy]`,
**`plateAt(plates, point)`**, **`movePlate(positions, code, start, from, to)`** and **`resetPlate(positions, code)`**
(new objects; `resetPlate` hands back the same map when there is nothing to reset). `viewer/canvas.js`:
`drawLevelEditor(ctx, canvas, editor, opts)` takes `opts.anteriorSide` and `opts.platePositions` and **returns the
plates it drew**, `[{ code, x, y, width, height }]` in image px after the offsets, in drawing order; `drawDynamicLayer`
passes both options through and returns the editor's plates in edit mode, `[]` otherwise; a caller that ignores the
return value is unaffected. `viewer/geometry.js` `clientToImage(ev, canvas, { clamp = true } = {})`: `clamp: false`
maps a point outside the canvas without clamping. **`state.platePositions`** (store block above) is in the initial
state and in both FRESH_VIEW copies (ten keys now; pinned equal, and to their content, by
`test/demo-visibility.test.js`). `components/viewer.js` is its only writer and gains the plate drag (`drag.kind
'plate'`), the stage classes `is-over-plate` and `is-dragging-plate` (cursor rules in `styles/screens/analysis.css`),
`state.platePositions` in `dynamicKey`, and **`drawnPlates()`**, an export that returns the plates the last redraw drew
(read by its own hit test and by `smoke-levels.mjs`). All the plate wiring is in `components/viewer.js`; the
construction chip's drag is unchanged.

- R43 (G7): a plate's anchor is unchanged (a body's posterior-edge midpoint, C2's IP, an endplate's SP, T4's centroid)
  and `side` is the direction away from the level: a body the sign of (the posterior-edge midpoint x − the mean of its
  four corners' x), C2 of (IP x − the centroid x), an endplate of (SP x − SA x); under 1 px, and always for T4, opposite
  the film's anterior side (`'right'` → −1, `'left'` → +1, unknown +1), the side the stage passes being
  `plateAnteriorSide` (the stored geometry's, the study's chosen one, the placed levels', else null). Side −1 puts the
  plate's right edge `LABEL_OFFSET_PX` (14 CSS px times the R28-floored ratio) left of the anchor; side +1 its left edge
  that far right; centred vertically; then moved by the level's offset in image px.
- R44 (G7): in edit mode a left press that is not on the W/L panel's drag, with Pan off, not a placement click and not
  on the selected level's handle (handles win), and not during the study's own run, is hit-tested against the drawn
  plates and drags one (pointer capture); each move writes `platePositions[code]` as the offset at the press plus the
  pointer's travel since in image px (`movePlate` over unclamped `clientToImage` points); release and cancel keep it; a
  chord dismantles the drag; the second press of a double-click on the same plate (`isDoubleClick`) resets it and starts
  no drag; a right press on a plate still windows. View state: FRESH_VIEW resets it, edit mode keeps it, nothing
  persists or records it.
- R45 (the G7 review): `drawLevelLabel` clamps the plate's rect to the canvas (`drawLevelEditor` passes the canvas size
  as `bounds`), so a plate stays wholly on the film however far it is dragged and a plate beside a body at the film's
  edge is pushed inward rather than clipped; the returned rect is the clamped one, so `plateAt` finds it.

No `STORE_VERSION` bump, no CSP change, no runtime dependency, no new stylesheet file (rules in
`styles/screens/analysis.css` section `05 — LEVEL EDITOR` and `styles/components.css`), no Python package.

## 2026-10-15 amendment: annotation editor round 2 (a comment on the record, Hand-placed, REVERT)

Spec `docs/superpowers/specs/2026-10-15-annotation-editor-round-2-design.md` (E1–E7, the owner's rulings and the
planner's); plan `plans/2026-10-15-annotation-editor-round-2.md` (rulings P1–P10); branch `worktree-annotation-round-2`
off `origin/main` @ `06c8cdd` (v1.1.1), `9d5b4e6`..`fa0c181` and the records commit, then the final review's fix wave
(I1, I2); user doc `docs/level-editor.md`.
Nothing the 2026-10-10 amendment says is removed; R24 closes with E2.

**Status.** The 2026-10-15 amendment in the `data/status.js` section above: `'hand'`, `Hand-placed`, rank 4, TO REVIEW,
`.badge-hand`.

**`Study.labelComment`** and the study field list: the Study typedef above and the paragraph under it. Written by exactly
two paths, Save edits and the bundle spec's import (`specs/2026-10-15-annotation-bundle-export-import-design.md`).

**`viewer/measure-queue.js`: `commitGeometry(studyId, geometry, { clearFailure = false } = {})`.** The queue keeps a
per-study flag, set by any commit that passes `clearFailure`, kept through the debounce and coalescing, read and
dropped at the start of `recalculate`, and dropped by `replaceMeasured` (plan P2). The write that lands adds
`processingError: null, processingErrorAt: null` to the patch that sets the measurements, geometry, `reviewedAt: null`
and qc, in the same `setState` (E6), so the film never reads Unsegmented in between. A `/measure` error writes nothing:
the film stays Failed and the next commit tries again. The level editor's `sync` passes `clearFailure:
isHandPlaced(study)`, which is `false` on a model result, and any other commit passes nothing, so a failed re-run over
old numbers still reads Failed (port spec P6, which gains this third clearing site). `configureLevelEditor`'s
`commitGeometry` dependency takes the optional third argument.

**The empty hand-placed projection (the final review, I1; spec §4.3's amendment).** `components/viewer.js` exports the
queue's `replaceMeasured` beside `commitGeometry`, and `configureLevelEditor` takes a fifth dependency,
`clearResult(studyId, patch)`, supplied by `screens/analysis.js`: `replaceMeasured(studyId, null)` (any `/measure`
pending or in flight for the study is orphaned and its draft dropped), then `patch` onto the study, matched by id and
`addedAt`, in one `setState`. `sync`, for a study `isHandPlaced` whose projection `data/level-projection.js`
`projectionIsEmpty(geometry)` reads as empty (`manually_cleared`, or no vertebra, S1 endplate, femoral circle or C2/C7
centroid), calls `clearResult` with `measurements`, `geometry`, `qc` and `reviewedAt` null and the failure from
`editor.entryFailure` instead of committing: the film reads Failed again, or Unsegmented when the editor found no failure at Edit (a film that never ran, or a hand-placed film reopened in a later session). The
`LevelEditor` typedef gains `entryFailure: { processingError, processingErrorAt }`, read from the study by `openEditor`
(nulls when it has none) and carried by every step; `markSaved` and `revertToBaseline` leave it.

**Exports.** `data/levels.js`: `revertLevel(editor, code)`, `setComment(editor, text)`, `commentChanged(editor)`; the
`LevelEditor` typedef gains the strings `comment` and `savedComment`; `openEditor`'s `saved` takes an optional `comment`
(else the study's `labelComment`); `unsavedCount` adds one while `commentChanged`; `markSaved` sets both strings to the
trimmed text and `revertToBaseline` sets `comment` back to `savedComment`; `resetLevelsToModel` leaves both alone
(D14). `data/label-record.js`: `normalizeComment(text)` (trimmed, null when blank or not a string) and
`recordComment(record)` (trimmed, `''` for none); `toLabelRecord` writes `comment` after `edits`. `renderer/level-editor.js`
(the wiring, which stays the only writer of a non-null `state.levelEditor`): `setLevelComment(text)` (an edit that
commits nothing) and `revertPlacedLevel(code)` (an edit that commits); the private `withLabelFile(studies, studyId,
addedAt, file, labelComment)` gains a fifth, optional argument (P6: `undefined` leaves the field alone, as Mark reviewed's
write does; a string or `null` sets it, as Save edits does); `saveLevelEdits` sets `labelComment` with `labelFile` in
one patch and puts only `savedComment` into the stored editor (P3: the live `comment` stays as typed). `enterLevelEditor`
reads `recordComment(record)`; `writeReviewRecord` needs no change, since `openEditor` with no record takes the study's
`labelComment`. `screens/studies.js` `matchesQuery` searches `labelComment`.

**Panel and Analysis.** `components/level-editor.js`: the footer's comment box, one `<textarea>` made at mount in a
footer that persists (the final review, I2, superseding P8's re-append and selection restore): `.lv-foot` and its
`.lv-comment` block are never detached while an editor is shown; the head and the list rebuild around them, inserted
before the foot, and the status line and the actions row (or exit prompt) rebuild inside it, after the comment block;
only the no-editor path clears everything (the rebuild key carries `commentChanged(editor)`, not the text, and the
viewer's key handler already ignores keys typed in a `textarea`, P9), and the REVERT button
(`data-level-key` `revert:<code>`, `lv-text-btn lv-revert`; an edited head stacks Place… over REVERT in `is-stacked`).
`screens/analysis.js`: the read-only `analysis-comment` block under the actions row, written on every `update()` with no
key of its own (P10) and hidden in edit mode. CSS: `.badge-hand` in `styles/components.css`; `.lv-comment*`,
`.analysis-comment*` and the `is-stacked` column in `styles/screens/analysis.css`.

**Label record schema.** `docs/design/level-editor/label-record.schema.json` gains `comment`, optional and nullable the
way `model_corners` is (`oneOf` string / null, P5), under the same schema id; the example gains one. A record written
before it validates and reads as no comment.

No `STORE_VERSION` bump, no IPC or CSP change, no runtime dependency, no new module file, no backend change.
