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
  batch.js                        (2026-09-08, batch spec §8.2; 2026-09-12 similar-cases §12 adds the embed kind)
                                  startBatch(ids) (fixed to kind 'segment'), startEmbedBatch(ids) (fixed to kind 'embed'),
                                  stopBatch — three constants, not parameterised by kind: each is a one-line closure over
                                  the single createBatchDriver instance's internal startBatch(ids, kind)/stopBatch (data/batch.js,
                                  below). The one wiring of data/batch.js's createBatchDriver to the store, the toast,
                                  persistenceDisabledReason, segmentStudy and embedStudy; module scope
  demo-studies.js                 (2026-09-10, studies-table spec §9) demoToggleAvailable(), setDemoStudiesShown(shown) — the one wiring of
                                  data/demo-visibility.js to the store, the toast and api.setDemoStudiesHidden; module scope
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

  viewer/canvas.js                layered rendering
  viewer/interactions.js          pure interaction logic: zoom steps, hit tests, Tab order, nudge, debounce (no DOM)
  viewer/measure-queue.js         (plan 04) createMeasureQueue({measure, getState, setState, showToast, debounceMs})
                                  → {commitGeometry, replaceMeasured}: per-study revisions, one owner-tracked
                                  debounce, flush on study switch; session-only drafts, atomic geometry/measurement commit
  viewer/geometry.js              circle fit, coordinate transforms

  data/demo-studies.js            the nine fabricated studies
  data/persistence.js             study store read/write
  data/measurements.js            API response → display rows
  data/similarity.js              the ranking: shared-point shape, entry and appearance distances, fusion, findSimilar
                                  (rewritten 2026-10-03, stage 2)
  data/similarity-blocks.js       (2026-10-03, stage 2) the thirteen-block registry, the weight table and the readers
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
  data/batch.js                   (2026-09-08; 2026-09-12 similar-cases §12 adds the embed kind) pure:
                                  planBatch({visible, selected, running}) → {ids, label, note, enabled};
                                  planEmbed({visible, selected, running, needs, ineligible}) → {ids, label, note, enabled, hidden, excluded} —
                                  needs(study) picks eligible-but-not-yet-embedded studies, ineligible(study) counts the partial films
                                  that can never be embedded (gate decision 75);
                                  newBatch(ids, kind = 'segment'), advance, withStopping, isQueued, progressText, sidebarText, batchMessage;
                                  createBatchDriver({segment, embed = null, embedNeeded = () => false, getState, setState, showToast,
                                  persistenceDisabledReason}) → {startBatch(ids, kind = 'segment'), stopBatch} — the run callback is
                                  chosen by the returned startBatch's kind argument ('segment'|'embed'); renderer/batch.js (above) is
                                  the one instance, wiring it to the store, and exposes it as two fixed-kind root exports
                                  (startBatch(ids), startEmbedBatch(ids)) plus stopBatch, never the two-argument form directly
  data/find.js                    (2026-09-10, studies-table spec §6) DEFAULT_FIND_SORT, FIND_SORT_KEYS, statusRank, toggleFindSort,
                                  sortFindRows(studies, sort, runningId, batch), (2026-10-01) summaryCounts(studies, runningId,
                                  batch) — the Find list's sort and the Studies summary's counts; pure
  data/demo-visibility.js         (2026-09-10, §9) demoStudiesShown(state), demoVisibilityPatch(state, shown) — pure

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
other value that is present is nulled with a warning.

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
  selection: null,          // Selection — see viewer/interactions.js
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
export function deltaRow(row, otherRow, threshold)  // → {text,overThreshold}; '—' when either row's unit is 'px'
export function deltaThreshold(row)                // → 10 for an SVA row in 'mm', 2 for any other 'mm' row, else 5
                                                   //   *(amended 2026-10-03, final review, ruling R23; 10 mm provisional)*
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

export function deriveStatus(study)      // → 'fail'|'unseg'|'ok'|'rev'|'seg'  (2026-10-01; see the amendment below)
export function statusLabel(status)      // → 'Processing'|'Unsegmented'|'Failed'|'Segmented'|'Needs review'|'Reviewed'; '—' otherwise
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
that rule, not by rule 1; a stopping batch's waiting films read their own status, and so do an Embed batch's
(`batch.kind === 'embed'`, the 2026-09-12 amendment: it never segments a film). The Studies summary keeps its three
clauses and its UNSEGMENTED counts Unsegmented, Processing and Failed (`data/find.js summaryCounts`). The Find sort
ranks fail 0 · proc 1 · unseg 2 · rev 3 · seg 4 · ok 5. `statusLabel` names all six keys and returns `—` for any
other. A failed attempt stores `processingError` as `failureReason(message)` and `processingErrorAt` in the same
update; the Failed pill's tooltip is `failureTitle(processingError, processingErrorAt)`.

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

**Rewritten 2026-10-03 (similar-cases stage 2 — `docs/superpowers/specs/2026-09-30-similar-cases-stage-2-regions-design.md`;
stage 1's rewrite of 2026-09-12 is below it in history) — see the `## 2026-09-30 amendment` at the end of this
file for the full picture; this is the module's current interface.** Thirteen blocks in four families, shared-point
shape distances, entry distances over the entries both films have, a region axis beside the mode axis. The registry
and the readers live in `data/similarity-blocks.js` (next section); this module owns the distances, the fusion and
`findSimilar`. Pure, no DOM; imports `data/parameters.js`, `data/cervical.js` and `data/similarity-blocks.js`.

```js
// Re-exported from similarity-blocks.js, so a caller needs one import:
export { REGIONS, BLOCKS, BLOCK_KEYS, LANDMARK_ORDER, CERVICAL_ORDER, ALIGNMENT_ORDER, ALIGNMENT_WEIGHTS,
         weightsFor, hasRegion, defaultRegion, alignment, studyBlocks }

export const MODES            // Object.freeze(['all', 'shape', 'alignment', 'appearance']) — an ARRAY of mode names now, no longer
                              //   a table of weight tables; `weightsFor(region, mode)` is the only weight source
export const SCOPES           // Object.freeze(['all', 'workspace']) — an ARRAY; state.similarScope's values
export const LUMBAR_SHAPE     // Object.freeze({order: LANDMARK_ORDER, floor: 14, require: ['S1.SA', 'S1.SP']})
export const CERVICAL_SHAPE   // Object.freeze({order: CERVICAL_ORDER, floor: 14, require: []})

export function needsEmbedding(mode)     // → boolean   whether `mode` requires an embedding: 'appearance' only
                                         //   *(amended 2026-10-03, final review, ruling R22: was 'all' | 'appearance')*
export function sideSign(side)           // → -1 | 1    the cervical mirror: 'left' → -1, anything else 1
export function shapePair(a, b, shape, signA, signB)
                                         // → {d, a, b} | null   `a`/`b` are Maps name → [x, y] (lumbarPoints / cervicalPoints);
                                         //   `shape` is LUMBAR_SHAPE or CERVICAL_SHAPE. Takes the names in shape.order present in
                                         //   BOTH maps, null below shape.floor or without a required name; normalises each film over
                                         //   those shared points alone (mirror by signA / signB, or by the lumbar anterior-corner
                                         //   test when null; centre; scale the centroid size to one; never rotate) and returns the
                                         //   Euclidean distance `d` plus each film's transform `{list, sign, cx, cy, size}`
export function hipUnder(hip, transform)  // → [x, y]   the hip midpoint under one film's transform, so H follows V
export function vector(study)            // → {V: 44 numbers, H: [x, y] | null} | null   the COMPLETE 22-point lumbar vector
                                         //   (stage 1's, kept for the dataset export); null unless every level and S1 are present
export function cervicalVector(study)    // → {V: 44 numbers} | null   its cervical twin (C2 IA/IP, C3–C7 SA/SP/IA/IP), mirrored by
                                         //   the recorded anterior side
export function entryDistance(a, b, weights, floor)
                                         // → number | null   weighted RMS over the indices finite on both sides, `weights` null = 1
                                         //   each; null below `floor` shared entries
export function appearanceDistance(a, b) // → number   1 − a·b over unit vectors, floored at 0 for float noise
export function pairDistances(open, candidate, weights)
                                         // → {V, H, A, SL, D, VC, AC, BC, SC, B, W, C, CC: number | null}   `open`/`candidate`
                                         //   are studyBlocks() results, not Study records; a block is null when `weights[key]`
                                         //   is 0 or the pair lacks it (spec §6's last column); appearance blocks need the
                                         //   same `model.onnx_sha256` on both, and W both films `full_spine`
export function medianScale(values, nominal = 1)
                                         // → number   the median of the present values when at least three are present and
                                         //   it is above 1e-9 (NO_SPREAD), else `nominal`; findSimilar passes blockOf(key).scale
                                         //   *(amended 2026-10-03, final review: ruling R26 supersedes R20's "median of whatever
                                         //   is present", which scaled a lone candidate's every block to 1; R25 is the noise floor)*
export function fuse(distances, scales, weights)
                                         // → {d, blocks: string[]} | null   sqrt(Σ w (d/m)² / Σ w) over the present, weighted blocks
export function matchScore(d)            // → integer 0..100   round(100 · exp(−d))
export function candidates(open, all, {scope = 'all', region = 'lumbar', mode = 'all', embeddings = {}} = {})
                                         // → Study[]   real, not the open film, `hasRegion(c, region)`, in scope, not the same
                                         //   subject, and under appearance an embedding record of any version/model (a stale
                                         //   one still ranks on the other blocks). The qc.coverage.partial and unoriented flags
                                         //   gate nothing (spec decision 5) *(amended 2026-10-03, final review, ruling R22: under
                                         //   all no record is needed — the film ranks on its other blocks, the card names the
                                         //   crop; openReason's 'no-embedding' is likewise appearance-only)*
export function findSimilar(open, all, {scope = 'all', region = null, mode = 'all', embeddings = {}, n = 10} = {})
                                         // → {matches: [{study, d, match, blocks, absent}], total, stale, region, weights}
                                         //   `region` null → defaultRegion(open); `absent` lists the switched-on blocks the pair
                                         //   lacked (the card names them); `stale` counts candidates whose record came from
                                         //   another graph than the open film's, under all/appearance (a candidate with no record
                                         //   is not stale); `region` is the region
                                         //   used, `weights` the table; sorted by d, ties by id; `n` defaults to TEN (decision 15)
export function openReason(open, region, mode, embeddings)
                                         // → 'unsegmented' | 'no-region' | 'no-embedding' | 'no-alignment' | 'no-blocks' | null
                                         //   why the OPEN film has no cards; 'no-blocks' after the others: compared against
                                         //   ITSELF (pairDistances(b, b, weightsFor(region, mode))) the film has no present block
                                         //   *(amended 2026-10-03, final review, ruling R21)*
export function heldRegion(similarRegion, open)
                                         // → 'lumbar' | 'cervical' | 'full_spine'   the held pick when similarRegion.openId is the
                                         //   open film and hasRegion(open, pick), else defaultRegion(open) — the one rule the tab
                                         //   and the compare chip read *(new 2026-10-03, final review)*
export function angleLine(open, candidate, region = 'lumbar')
                                         // → string   the card's line 3: 'PI · LL · PT · SS' differences (lumbar, whole spine) or
                                         //   'Cobb · SVA' (cervical), whole units with a sign, a dash where either side is absent
export function subjectFilms(study, all) // → Study[]   the real films sharing study's subjectKey, or [study] alone
```

Two different `needsEmbedding` functions exist and neither is a typo: this module's takes a MODE and asks whether that
ranking needs an embedding at all; `renderer/embeddings.js`'s (root module, not `data/`) takes a STUDY and asks whether
that film still needs one computed. `embeddingOf` (private) accepts a `Map` (production: `embeddingsMap()`) or a plain
object keyed by study id (the unit tests). `matchesLocation(study, {workspace, folder})` is `data/parameters.js`'s.

### `renderer/data/similarity-blocks.js`

New 2026-10-03 (stage 2). The registry of the thirteen blocks and the pure readers that turn a study record — plus its
stored embedding record — into the points, entry arrays and vectors the ranking compares. No distances here. Pure; imports
`data/segmental.js`, `data/disc-heights.js`, `data/cervical.js` and `data/global-sva.js`, never `similarity.js`.

```js
export const REGIONS      // Object.freeze(['lumbar', 'cervical', 'full_spine'])
export const FAMILIES     // Object.freeze(['lumbar', 'cervical', 'whole', 'appearance'])
export const KINDS        // Object.freeze(['shape', 'alignment', 'appearance'])
export const LANDMARK_ORDER, CERVICAL_ORDER
                          // the point names in collection order: L1..L5 SA/SP/IA/IP then S1.SA, S1.SP (22); C2.IA, C2.IP then
                          //   C3..C7 SA/SP/IA/IP (22)
export const ALIGNMENT_ORDER    // ['PI', 'PT', 'SS', 'LL L1-S1', 'PI-LL', 'L1PA']
export const ALIGNMENT_WEIGHTS  // [1, 0.8, 0.8, 0.6, 1, 0.8]
export const LUMBAR_SEGMENTAL_ORDER, CERVICAL_SEGMENTAL_ORDER
                          // the ten SEG_* keys of segmentalColumns('lumbar') / ('cervical'), in column order
export const DISC_ORDER   // 'L1-L2 anterior' … 'L5-S1 posterior' (15), level-major, then anterior, middle, posterior
export const BLOCKS       // frozen list of 13 frozen {key, family, kind, regions, label, scale, weights?, floor?} — `label` is the card's
                          //   absent marker ('no hip', 'no disc heights' …), `floor` the least shared entries an entry block needs,
                          //   `scale` the block's nominal difference, a prior the notebook may replace: V 0.1, H 0.05, A 8, SL 5,
                          //   D 2, VC 0.1, AC 8, BC 10, SC 5, B 25, W 0.1, C 0.1, CC 0.1 *(amended 2026-10-03, final review, R26)*
export const BLOCK_KEYS   // ['V', 'H', 'A', 'SL', 'D', 'VC', 'AC', 'BC', 'SC', 'B', 'W', 'C', 'CC']
export const ENTRY_KEYS   // ['A', 'SL', 'D', 'AC', 'BC', 'SC', 'B']   the blocks compared as entry arrays

export function blockOf(key)              // → the BLOCKS entry | null
export function weightsFor(region, mode)  // → frozen {V…CC: number}   a block is on when its family is on under the region and its kind
                                          //   under the mode ('all' = every kind); on-blocks share their family's budget of one
                                          //   equally (1 / the family's on-blocks), off-blocks are 0 — computed, never typed
export function lumbarPoints(study)       // → Map name → [x, y]   a level enters whole (both endplates, four finite corners) and
                                          //   oriented (anterior_confirmed !== false); S1 needs both points; may be empty
export function cervicalPoints(study)     // → Map   C2 (inferior only) and C3–C7 whole; EMPTY without a valid anterior_side
export function alignment(study)          // → [PI, PT, SS, LL, PI−LL, L1PA]   each finite or null
export function lumbarSegmental(study)    // → ten numbers, each finite or null   (segmentalValues, degrees)
export function cervicalSegmental(study)  // → ten numbers, each finite or null
export function discHeights(study)        // → fifteen mm values, each finite or null   discRows's own values, so D equals what the Measurements panel
                                          //   and both CSV exports show (ruling R14: no boundCalibration gate, no pixels ever)
export function cervicalLordosis(study)   // → [C2C7_COBB]   finite or null
export function cervicalBalance(study)    // → [C2C7_SVA_MM]   finite or null
export function globalBalance(study)      // → [GLOBAL_SVA_MM]   null inside unless full spine and calibrated
export function studyBlocks(study, record)
                                          // → {region, lumbar: Map, cervical: Map, hip, side, entries: {A, SL, D, AC, BC, SC, B},
                                          //   vectors: {C, CC, W}, model}   one study's inputs to every block; `record` is its
                                          //   stored embedding record (or null); `vectors.C/CC/W` = record.lumbar/cervical/whole
export function hasRegion(study, region)  // → boolean   segmented and carrying ANY of the region's points or entries (Whole spine:
                                          //   studyRegion(study) === 'full_spine')
export function defaultRegion(study)      // → 'lumbar' | 'cervical' | 'full_spine'   the film's studyRegion (an unresolved 'auto' → 'lumbar')
```

### `renderer/data/csv.js`

```js
/** @typedef {{src: string, dest: string|null}} Mapping */

export const KNOWN_FIELDS = ['Age','Sex','BMI','Diagnosis','ODI',
                             'Treatment plan','Surgical history','Follow-up','Notes',
                             // similar-cases spec, 2026-09-12, §9.1: the outcome registry's fields and
                             // the shared follow-up, appended so no existing export column moves.
                             'Fusion extension','Fusion extension date','Last follow-up']

export function parse(text)              // → {headers: string[], rows: Object[]}
export function autoMap(headers)         // → Mapping[]   dest null when unmatched; (2026-09-12) matches
                                         //   KNOWN_FIELDS longest name first, so 'fusion_extension_date'
                                         //   claims 'Fusion extension date', not 'Fusion extension'
export const KEEP_NAME                   // (2026-09-12) the mapping select's sentinel value for
                                         //   "Keep column name": distinct from a KNOWN_FIELDS entry and from 'Unmapped'
export function keepColumnName(header)   // → string   (2026-09-12) the header trimmed, for a chip whose
                                         //   destination is KEEP_NAME — the custom clinical field's name
export function keepUnmapped(mapping, headers)   // → Mapping[]   (2026-09-12) `Keep all unmapped`: every
                                         //   still-`Unmapped` chip set to its own trimmed name, except a structural or
                                         //   join header (unchanged) and a header whose normalised name matches a
                                         //   free KNOWN_FIELDS entry (mapped to that field instead); a header whose
                                         //   trimmed name is already taken (by another kept or known column) stays Unmapped;
                                         //   unchanged rows come back BY REFERENCE, so a caller can count what would change
export function keepableCount(mapping, headers)   // → number   (2026-09-12) how many chips `keepUnmapped`
                                         //   would change, for the button's `Keep N unmapped columns` label
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

**Pointer (2026-09-13, v1.0.8, fork PR #21):** identity and pairing changed under this module after
this contract's last full pass here. A film's identity everywhere a person looks is `studyName(study)`
(`data/labels.js`), not the `SP-nnnn` record id, and pairing groups films into VISITS (subject + label
+ film date) rather than one film per label. `toCsv` and `toPairedCsv` above already reflect the
current shape (`Study ID` holds the study name; `toPairedCsv` is visit-based); the full description of
the visit grammar, the merge and disagreement rules, and the paired export's exact columns is the
pre-op/post-op spec's amended §11.2/§11.3 (`docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md`),
not restated here — this is a pointer, not a rewrite, because that gap predates the similar-cases plan
below and a full v1.0.8 contract amendment is a separate piece of work.

`autoMap` matches case-insensitively after stripping non-alphanumerics, treating the known
field's stripped name as a prefix of the stripped header, so `odi_base` → `ODI` and
`age_yrs` → `Age`; each known field is claimed by at most one column — the first matching
header wins (plan 06). **(2026-09-12)** Known fields are matched longest-name-first, so a header
`fusion_extension_date` claims `Fusion extension date` rather than the shorter `Fusion extension`. It is a **convenience, not an authority**.
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
a new CSV resets to `autoMap`'s output. **(2026-09-12, similar-cases spec §9.5)** The select
gains one more option after the known fields, `Keep column name (<header>)` — its value is
`KEEP_NAME`, distinct from a `KNOWN_FIELDS` entry and from `Unmapped` — which imports the column
as a custom clinical field under its own trimmed name (`keepColumnName`); the taken-name rule
covers it exactly like a known field. A `Keep N unmapped columns` button above the chips
(`keepableCount`, hidden at zero) runs `keepUnmapped` for every remaining `Unmapped` chip in one
click; `Set all… → Unmapped` clears every destination, kept and known alike.
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
export function nearestLandmark(geometry, clientX, clientY, canvas, radius = 14)
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

// 22 landmark stops, anatomical order:
//   L1 SA,SP,IA,IP · L2 … · L5 SA,SP,IA,IP · S1 SA,SP
export const TAB_ORDER = [...]

// TAB_ORDER plus the two femoral-head centre stops = 24 stops.
// This is what Tab/Shift+Tab actually cycles; the spec requires the heads to be
// reachable by keyboard, and they are not landmarks so they are not in TAB_ORDER.
export const FULL_ORDER = [...]

export function nextSelection(current, direction)   // → Selection, cycles FULL_ORDER
export function nudge(geometry, selection, dx, dy)  // mutates geometry
export function sameHandle(a, b)                    // (plan 04) → boolean, exact identity incl. femoral part
export function hitTestFemoral(circles, x, y, radius = 14)   // (plan 04) → Selection|null, coordinate-space agnostic
export function arrowKeyDelta(key, shiftKey)        // (plan 04) → {dx,dy}|null — 1px, 10px with Shift
export function debounce(fn, ms)                    // (plan 04) → fn with .cancel()

export const CHORD_MASK = 0b11                      // primary|secondary bits of PointerEvent.buttons
export function isChordHeld(buttons)                // → boolean — BOTH primary and secondary held
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

## 2026-09-12 amendment: similar cases and outcomes (stage 1)

Spec `docs/superpowers/specs/2026-09-12-similar-cases-outcomes-design.md` ("the spec" below); plans
`docs/superpowers/plans/2026-09-12-a-embeddings-backend.md` (Plan A, backend) and
`docs/superpowers/plans/2026-09-12-b-similar-cases-renderer.md` (Plan B, renderer). Implemented on
branch `claude/image-similarity-visualization-400922`, off `fork/main` @ `efe1df6` (v1.0.8); the human
gate passed 2026-09-14. This section carries spec §16's eleven amendment items with the interfaces'
**final** signatures, which in a few places differ from the spec's and the plans' own text — those
differences are called out, because a reader who trusts only the plan will name the wrong function.

**Superseded in part, 2026-10-03.** The stage-2 amendment at the end of this file (`## 2026-09-30 amendment:
similar cases stage 2`) replaces: item 1's five-block `similarity.js` (it is now the thirteen-block module, with
`similarity-blocks.js` beside it; the body above `### renderer/data/csv.js` is current), item 2's `EMBEDDING_VERSION = 1`
and `cannotEmbed(study)`, item 3's state keys (gains `similarRegion`), item 5's `embedding: {model, crop, whole,
film_type}` and item 2's `backend/embedding.py` list (`film_type` is gone), the dataset's `vectors.json` and film-type
columns (version 2, `Region`), and gate decision 75 (HANDOFF decision 78). Read this section for what stage 1 did and
that one for what is true now.

**1. `renderer/data/similarity.js` replaced.** The body above (`### renderer/data/similarity.js`) now
carries the current interface directly; it is not repeated here. The old `WEIGHTS`/`vector →
[LL,PI,PT,SS,PI-LL]`/`distance`/`matchScore(a,b) → 58..100`/`findSimilar(study,all,n=3)` shape is gone.

**2. New modules.**

- `renderer/data/outcomes.js` (pure; imports only `data/timepoints.js`): `OUTCOMES` (the registry,
  spec §9.1 — one entry, `fusionExtension`, `{key, field, dateField, primary, cardYes, cardNo,
  footer}`), `FOLLOW_UP_FIELD = 'Last follow-up'`, `OUTCOME_FIELDS` (every registry field plus the
  follow-up, in order — what `data/csv.js` folds into `KNOWN_FIELDS`), `primaryOutcome()`,
  `isOutcomeField(name)`, `isOutcomeDateField(name)`, `normaliseOutcomeValue(text)`,
  `recognisedOutcome(value)`, `recognisedDate(value)`, `resolveOutcomes(films, registry = OUTCOMES)`
  (spec §9.3's per-subject resolution table), `outcomeLine(resolved, outcome)` (card line 4),
  `footerLine(statuses, outcome)` (the footer's counts).
- `renderer/data/embeddings.js` (pure; the stored-record SHAPE only): `EMBEDDING_VERSION = 1`,
  `validEmbedding(record)`, `embeddingRecord(id, embedding, {sourceSha256 = null, computedAt =
  new Date().toISOString()} = {})`, `isCurrent(record, bundledSha)` (an unknown `bundledSha`, i.e.
  `null` from a 503, reads as "keep what is stored" per the planning ruling).
- `renderer/embeddings.js` — a ROOT module (not `data/`; the planning ruling), the lazy-loaded map and
  its IPC: `ensureEmbeddings()` (async; the first caller of any of the below triggers the one load;
  its `bump()` — the `embeddingsVersion` counter increment that tells subscribers to redraw — runs only
  after the `await`, never synchronously, because `store.js` throws on a re-entrant `setState` from
  inside a subscriber notification), `embeddingFor(id)`, `embeddingsMap()` (the `Map` that
  `similarity.js`'s `embeddingOf` reads), `bundledModelSha()`, `bundledModel()` (the full
  `{id, dim, input, onnx_sha256}` record from `GET /embedding-model`, or `null`; added at the final
  whole-branch review's fix wave so `Export dataset` can write it — `bundledModelSha()` is kept,
  derived from it, for existing callers), `storeEmbedding(record)` (saves via `api.saveEmbedding(record.id,
  record)`, then updates the map — one argument, the id lives on the record), `forgetEmbedding(id)`,
  `needsEmbedding(study)` (STUDY-keyed — see the note under `similarity.js`'s own `needsEmbedding`
  above, a MODE-keyed function of the same name in a different module), `cannotEmbed(study)`.
- `renderer/data/dataset.js` (pure; imports `data/csv.js`, `data/pairing.js`, `data/timepoints.js`
  (`PRE_OP`, for the subject-visit walk), `data/outcomes.js`, `data/similarity.js`,
  `data/embeddings.js`, `data/labels.js` — NOT `data/version.js`, despite the planning text: the
  version string is the caller's job, `screens/parameters.js` imports `VERSION_LABEL` and passes it
  as `buildDataset`'s `version` argument, keeping this module free of anything outside `data/`):
  `RESOLVED_COLUMNS` (the per-outcome `Subject <field>`/`Subject <date field>` column names plus
  `Subject last follow-up`, shared by `films.csv` and `subjects.csv`), `appendColumns(text, headers,
  cells)` (quote-aware: tracks quote state across the rendered CSV so a CRLF inside a quoted cell is
  never mistaken for a row break, and — after the final review's Critical fix — treats a line as a
  citation comment only BEFORE the header row is seen, `seenHeader`, so a data row whose first cell
  starts with `#` — a film literally named `#3 pre-op` — is never dropped as a comment and never
  shifts every later row's appended cells), `datasetReadme({counts, version, exportedAt,
  embeddingRecord})` (the gate's decision 77: the folder's `README.md`), `buildDataset({rows, post,
  embeddings, bundledSha, bundledModel = null, version, now = new Date()})` (`bundledModel` added at the final
  review's fix wave, alongside `bundledSha`, so `vectors.json` and `manifest.json` both carry the full
  model record, not the SHA alone — spec §13's "the embedding model record"), `datasetMessage(result,
  folder)`.
- `renderer/components/similar.js`: `mountSimilar(host) -> {update}` — the Find similar tab (spec §8).
- `backend/embedding.py` (Plan A): `EMBED_KIND`, `load_metadata()` (cached; raises
  `EmbeddingUnavailable` — added at Plan A's final review, subsuming a missing, unreadable or
  incomplete `embed.json` under one exception both endpoints map to 503, where the plan's own text
  had `/embedding-model` returning a bare 500 on a corrupt file and `/embed` a 422) — `model_record`,
  `preprocess`, `crop_window`, `film_type`, `embed`, `embedding_record`.

**3. State keys.** `similarScope` (default `'all'`), `similarRank` (default `'all'`),
`embeddingsVersion` (a counter; every subscriber that reads the embeddings map lists it in its key
array — the Analysis screen's tab, the Find tab's `update()`, the chip-match memo), `batch.kind`
(`'segment'` default or `'embed'`), `performance.embeddings` (default `true`; already listed under
Settings below).

**4. `renderer/api.js` / `main.js`.** `api.js`: `saveEmbedding(id, record)`, `loadEmbeddings()`,
`embeddingModel()`, `embed(request)`, `saveDataset(request)`; `deletePrediction(id)` now removes both
`predictions/<id>.json` and `embeddings/<id>.json` (ENOENT success for each). `main.js` IPC handlers:
`save-embedding`, `load-embeddings`, `embedding-model` (proxies the backend's `GET /embedding-model`,
mapping a 503 to `null`), `embed` (proxies `POST /embed`), `save-dataset`; the `load-studies`
quarantine handler now moves THREE things under one timestamp — `studies.json`, `predictions/`,
`embeddings/`.

**5. Backend API.** `/predict` and `/predict-stream` responses gain `embedding: {model, crop, whole,
film_type} | null`; `qc.processing.embeddings: bool`. New `POST /embed` (multipart `file` + optional
`framing`) → `{embedding}`; a missing/unreadable/incomplete `embed.json` is a 503 on both `/embed` and
`GET /embedding-model` (`EmbeddingUnavailable`, item 2 above), an unreadable image or malformed
`framing` a 422. New `GET /embedding-model` → `{id, dim, input, onnx_sha256} | 503`. The `embedding`
progress stage (`"Computing appearance embeddings"`) sits between `encoding` and `calibration`. The
fifth ONNX graph, `embed.onnx` (about 88 MB, dim 384), is exported, cached (`lru_cache(maxsize=5)` —
grown from four to hold all five kinds resident in standard mode) and verified alongside the four
structure models; `backend/verify_onnx.py` and `tools/packaging/check_bundled_inference.py` check five
graphs. `timm` stays export-only (`--exclude-module timm` in every workflow — see the correction to
§10.5 below).

**6. `KNOWN_FIELDS` is twelve names.** The body above (`### renderer/data/csv.js`) carries the full
list and `autoMap`'s longest-first matching rule directly.

**7. Persistence.** `embeddings/<id>.json` under `userData`, beside `predictions/`, one file per real
study — shape per `data/embeddings.js`'s `embeddingRecord`/`validEmbedding` above; `sourceSha256` is
the film's `calibration.source_sha256` or `null`. Written by `storeEmbedding` (which calls
`api.saveEmbedding(record.id, record)` and updates the map), after the sidecar and
before the record commit (and by the `Embed` run core), refused for the session after
`disablePersistence`. Loaded once, lazily, into `renderer/embeddings.js`'s module-scope map (not at
bootstrap — corrects spec §11's text, which named `renderer/data/embeddings.js`; the planning ruling
already put the map in the root module and the record shape alone in `data/`). Deleted with the study;
quarantined with the store as the THREE-way move in item 4. Two embeddings compare only when their
`model.onnx_sha256` match (`isCurrent`); a mismatched pair is `stale`, counted by `findSimilar` and by
the Find tab's tail, never silently discarded. No `STORE_VERSION` bump.

**8. Plan 07.** Tasks 1 (the five-angle distance) and 2 (the three-card tab) are superseded by this
spec. Tasks 3–6 (comparison mode) are kept, adapted: `mountViewer(container, {role = 'primary'} = {})` — the
compare pane is the same component with `currentStudy()` reading `state.compareId`, no edit, re-run,
run card or keyboard shortcuts, its own zoom/pan/panMode kept in the mount closure (`viewState()` /
`writeView()`), while the pointer-gesture state (`drag`, `hover`, `retracing`, `tracePoints`,
`tracePointPointer`) stays module-scope and shared — one live gesture at a time, the compare role can
only start a pan, and `detach()` resets it for both mounts together, which is safe only because the
compare mount is torn down together with the primary in `teardown()`, never on its own. The internal
`updateViewer(study, {match = null} = {})` (inside `mountViewer`'s closure, not a separate export) draws the
chip; the internal `updateMeasurements(study, other = null)` (inside `mountMeasurements`'s closure)
draws the second column, with `deltaRow(row, otherRow, threshold)` in `data/measurements.js` computing
`Δ` at 5° for angles and 2 mm for disc heights *(amended 2026-10-03, final review, ruling R23: the threshold is
`deltaThreshold(row)` — 10 mm for a C2–C7 or C7–S1 SVA row in millimetres, a provisional default — and a row in pixels
shows `—` for its `Δ`, never highlighted, because a cross-film pixel difference is magnification, not anatomy)*. `clinical-data.js`'s private `visibleStudies(state)`
returns `[open]` or `[open, compare]`, so the drawer shows two rows in comparison mode. **Naming, per
the gate (decision 76):** the badge, the compare chip, the viewer strip and its tooltip, and the
compare pane's watermark footer all read `filmLabel(study)` (`data/labels.js`) — never `study.id` —
so the `SP-nnnn` record id no longer appears on any viewer surface, on either pane; this supersedes an
earlier Task 8 ruling that had left the PRIMARY chip on the record id as a gate question.

**9. Both packaging allowlists: unchanged.** No new root file; `renderer/embeddings.js` ships under
`renderer/**/*`, already globbed by both `package.json`'s `build.files` and
`electron-builder.preview.yml`.

**10. Settings.** `state.performance.embeddings` (default `true`), normalised by the existing
`normalizePerformance`/`save-performance` path alongside `cropLocalizer`/`toolbarRemoval`; sent with
every `/predict` and `/predict-stream` request as the form field `embeddings`; parsed by
`runtime.parse_options(..., embeddings=True)` into `Options.embeddings` (a non-boolean is the same 422
shape the other switches raise); recorded on the result as `qc.processing.embeddings`. `/embed` ignores
the setting — it always runs.

**11. Workspace mapping.** The body above (`### renderer/data/csv.js`, the mapping-card paragraph)
carries `Keep column name (<header>)`, `Keep N unmapped columns` and `Set all… → Unmapped`
directly. `joinClinical` is unchanged; a `Mapping.dest` may now be any non-empty name, not only a
`KNOWN_FIELDS` entry.

**v1.0.8 base note.** The dataset's three tables (item 2 above; renamed at the gate to `parameters.csv`
and `paired.csv`, decision 77) key a film by its study name, following the pre-op/post-op spec's
amended §11.2 (the pointer paragraph above, under `### renderer/data/csv.js`); `subjects.csv`'s
successor `paired.csv` follows the paired export by visit; `vectors.json`'s `films` array is in
`films.csv`'s successor `parameters.csv`'s row order; the manifest's counts include merged visits and
carry an `identity` line naming the study-name rule.

**Not carried forward from the plans' own text (recorded so a reader does not go looking for them):**
spec §11's sample JSON showed `model: {..., "size": 224}` — the stored and wire shape is
`{id, dim, input: [height, width], onnx_sha256}`, no `size` key, on every endpoint and every stored
record; spec §10.5 said `--collect-all timm` — every workflow passes `--exclude-module timm`, and
`timm` has been export-only since the 2026-09-09 ONNX amendment above.

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

## 2026-09-30 amendment: similar cases stage 2 — regions and every measured parameter

Spec `docs/superpowers/specs/2026-09-30-similar-cases-stage-2-regions-design.md` ("the spec" below); plan
`docs/superpowers/plans/2026-09-30-similar-cases-stage-2-regions.md` (Tasks 1–10; its `## Ledger` holds every ruling).
Written 2026-09-30, built 2026-10-03 on branch `claude/image-similarity-visualization-400922` AFTER it merged `fork/main`
@ `c53e91d` (v1.0.15) as `afa6164` and a two-commit fix wave (`87b7a5d`, `4164673`, item 9). This section carries the
spec's §15 amendment list with the interfaces' **final** signatures; where the spec's or the plan's own text differs, this
section and the two module sections above win (`shapePair`'s signature and return, `discHeights`'s calibration rule,
`findSimilar`'s return and `planEmbed`'s shape are the four places they differ, and the spec carries the same
corrections in its text since 2026-10-03).

**1. The two modules.** `renderer/data/similarity.js` (rewritten) and `renderer/data/similarity-blocks.js` (new) — their
interfaces are the two `### renderer/data/similarity…` sections above. In outline: thirteen blocks in four families — lumbar
`V` shape, `H` hip, `A` alignment (PI, PT, SS, LL L1–S1, PI−LL, L1PA; weights 1, 0.8, 0.8, 0.6, 1, 0.8), `SL` lumbar
segmental, `D` disc heights; cervical `VC` shape, `AC` C2–C7 Cobb, `BC` C2–C7 SVA, `SC` cervical segmental; whole spine
`B` C7–S1 SVA, `W` whole-film appearance; appearance `C` lumbar crop, `CC` cervical crop. Units never mix inside a block;
millimetre blocks (`D`, `BC`, `B`) compare only between two films that carry the value; pixel values are never
compared. The shape blocks compare over the landmarks BOTH films have (floor 14 points: S1 and three levels for the
lumbar column, four cervical bodies for the neck; the cervical mirror is the recorded `anterior_side`, never the
corner means; the hip follows the lumbar pair's transform); an entry block is the weighted RMS over the entries both
have (floor 2 for `A` and `D`, 3 for `SL` and `SC`, 1 for `AC`, `BC`, `B`); an appearance block is present when both
films carry the vector under the same `model.onnx_sha256` (`W` only when both are `full_spine`). Every block's
distance is divided by its median over the candidates when at least three candidate pairs share the block (and that
median is above `NO_SPREAD = 1e-9`), else by the block's nominal scale, a prior on the registry (`BLOCKS[].scale`;
rulings R25, R26); `weightsFor(region, mode)` gives each family present a budget of
one shared equally among its switched-on blocks; the fused distance is the stage-1 weighted RMS. A film is never
excluded for what it lacks: `qc.coverage.partial` and `unoriented` gate nothing in the ranking, and each card names the
switched-on blocks the pair lacked. Ruling R14: block `D` follows `discRows`'s own calibration rule — the values the
Measurements panel and both CSV exports show — not `boundCalibration`.

**2. `renderer/data/embeddings.js` — record version 2, `readEmbedding`.** `EMBEDDING_VERSION = 2`. A stored record is
`{version: 2, id, computedAt, sourceSha256, model: {id, dim, input, onnx_sha256}, region, lumbar, cervical, whole}`,
each of the three vectors a finite list or `null`, at least one non-null, `region` one of `lumbar | cervical |
full_spine`. `validEmbedding(record)` accepts version 1 (finite `crop`, `whole` null or a list) and version 2.
`embeddingRecord(id, embedding, {sourceSha256, computedAt})` always writes version 2 from the backend's
`{model, lumbar, cervical, whole, region}` (an unknown `region` reads `'lumbar'`; null when all three vectors are
absent). `readEmbedding(record)` → `null` for an invalid record, a valid version-2 record as is, and a version-1 record
LIFTED to the same field set (`version` stays 1, `lumbar = crop`, `cervical = null`, `region = 'lumbar'`, `whole` kept).
`isCurrent(record, bundledSha)` is false for any record that is not version 2, so a version-1 film reads as needing
`Embed` once; an unknown bundled sha keeps what is stored, as in stage 1. No `STORE_VERSION` bump; `studies.json` is
unchanged.

**3. `renderer/embeddings.js` — `cannotEmbed` removed.** The module loads every stored record through `readEmbedding`
(the map holds lifted records), so every reader sees the version-2 field set. `cannotEmbed(study)` is deleted and
`needsEmbedding(study)` loses its shape gate: true for a real study with `measurements` and `geometry` that has no
current record — segmented before the build, the setting off, a failed stage, an older graph, or a version-1 record
*(amended 2026-10-03, final review: or a current record whose `region` is not `studyRegion(study)`, when that is one of
the three regions — a film re-segmented under another region; an unresolved `auto` film is not compared, since `Embed`
posts no region for it)*.
`needsEmbedding(study)` no longer calls `vector(study)` (stage 1's all-lumbar-landmarks gate); a version-2 record whose
`region` differs from the film's counts as not current there (M2, above). Nothing is ineligible; a film ranks on the
blocks it has (spec decision 5, HANDOFF decision 78).

**4. State key.** `similarRegion: null | {openId, region}` in `store.js`: the Find similar tab's region pick, held for the
film it was made on. The tab reads `state.similarRegion.region` when `openId` is the open film, else `defaultRegion(open)`,
so opening another film falls back to that film's own region with no `setState` inside a subscriber. It joins the tab's
redraw key and the compare chip's memo key. *(Amended 2026-10-03, final review: both read `heldRegion(similarRegion,
open)`, which also falls back when the film lacks the picked region's anatomy.)*

**5. Backend API.** `embedding` on `/predict` and `/predict-stream` — and the value under `POST /embed`'s `embedding` key
— is `{model, lumbar, cervical, whole, region} | null` (was `{model, crop, whole, film_type}`); `film_type` is gone.
`POST /embed` gains the multipart form field `region` (`lumbar` by default for a stage-1 caller; `cervical`;
`full_spine`; anything else is a 422). `/predict` passes the region the run resolved — `body_part` after automatic
film detection has replaced `auto` — to the embedding stage, so a cervical or full-spine film is embedded by its own
windows. `backend/embedding.py`: `REGIONS = ("lumbar", "cervical", "full_spine")`; `crop_window(image, window, *, xywh=False)`
cuts the film by corners `[left, top, right, bottom]` or, with `xywh`, by the cervical pipeline's `[x, y, width, height]`,
clipped to the film, and returns `None` — never the whole film standing in for a crop — for an absent, malformed or
degenerate window (under 8 px); `region_crops(image, framing, region)` picks the windows (lumbar: `framing.window`;
cervical: `framing.window` read as x/y/w/h; full spine: `framing.lumbar_window` and `framing.cervical_window`);
`embedding_record(image, framing, region="lumbar")` returns the record above, `whole` always, a window's vector `null`
where the region has none, and raises `ValueError` for an unknown region. All-or-nothing on a graph failure, 503 without
`embed.json`, the `embedding` progress stage: all stage 1, unchanged. `renderer/api.js`/`main.js`: the `embed` handler
appends `request.region` as the `region` form field when it is one of the three values.

**6. `planEmbed` and the Embed run core.** `planEmbed({visible, selected, running, needs}) → {ids, label, note, enabled,
hidden}`: no `excluded` and no `ineligible` argument; `needs` alone decides what the button embeds, and the
`{k} partial — not embeddable` note beside it is gone with its tooltip. `embedStudy` (`renderer/screens/analysis.js`)
reads `studyRegion(live)` before its `await` and posts it as `region` with the sidecar's image and framing.

**7. `Export dataset` — `vectors.json` version 2 and the `Region` columns.** `vectors.json` is
`{version: 2, exportedAt, families: {lumbar: [V, H, A, SL, D], cervical: [VC, AC, BC, SC], whole: [B, W], appearance: [C,
CC]}, blocks: {V: {dim: 44, order, normalisation}, H, A: {order, weights, unit}, SL, D, VC: {dim: 44, order,
normalisation}, AC, BC, SC, B, W, C, CC, embedding: <the model record>}, films: [{name, region, V, H, A, SL, D, VC, AC,
BC, SC, B, lumbar, cervical, whole}]}` *(amended 2026-10-03, final review, ruling R24: `families` is derived from
`similarity-blocks.js`'s `BLOCKS` and `FAMILIES`, and `blocks` carries the three appearance blocks by their film key —
`W: {vector: 'whole', unit: 'embedding'}`, `C: {vector: 'lumbar', …}`, `CC: {vector: 'cervical', …}` — so every key a
family names is a film key or a block's `vector`; the README states that mapping, the shape-null rule and why a folder
can have no embeddings; and, ruling R26, every `blocks` entry carries its registry `scale`, the nominal difference the
app divides by when fewer than three candidate pairs share the block, which the README also states)*, one entry per `parameters.csv` row in that order, `null` for an absent block (an all-null
entry block exports as `null`, not an array of nulls); `V`/`VC` are the COMPLETE 22-point vectors (null where the column
is incomplete), `H` follows `V`, the three appearance vectors come from a current embedding record only (a stored
version-1 record is lifted by `readEmbedding` but never current, so it exports as `null`). `parameters.csv`'s first
provenance column is `Region` (the film's own `studyRegion`, not the embedding's) in place of `Film type`; `paired.csv`'s
per-visit film-type columns become `<visit> region`; `manifest.json` counts films per region (`counts.regions`; an
unresolved `auto` film is tallied under its own key, never as lumbar) and its `citation` key becomes `notice` (ruling R4:
the 1.0.14 rule — no author names anywhere in the folder). `README.md` describes the families from the table. Stage 1's
rule stands: no image, no path, no record id.

**8. Gate decision 75 superseded.** The Embed count's eligibility rule and its `{k} partial — not embeddable` note are
replaced by HANDOFF decision 78: every segmented film is embeddable, and a film ranks on the blocks it has.

**9. The merge's consequences (Rulings R7, R9, R10; `87b7a5d`, `4164673`).**
- `backend/models/models.py`: `CPU_ONLY_KINDS = frozenset({"embed"})` — the appearance encoder is a CPU model. Its
  session is always built on the CPU provider with the CPU session options, whatever the processor setting, and
  `qc.processing.providers` reports CPU for it. `backend/gpu_parity.py`: `qualified_kinds()` is every `MODEL_NAMES` kind
  except `CPU_ONLY_KINDS`; the GPU fingerprint, `verify_gpu` and `verify_films` cover those kinds only, so a missing
  `embed.onnx` or a DirectML miss on the encoder can never cost a GPU run its GPU, and qualification never loads the
  encoder with `Appearance embeddings` Off. `probes('embed')` stays for `tools/packaging/check_cpu_wheels.py`.
- `_load_model`'s `lru_cache` holds **7** sessions (`maxsize=7`; the trunk's is 4, stage 1's text above says five):
  a lumbar run touches five kinds and a full-spine run six, so anything smaller reloads the 236 MB S1
  detector every film (R9). Low-memory mode still releases after each stage.
- `renderer/data/processing.js`: `describeProcessor` and `processorTitle` leave the CPU-only kinds out of the provider
  summary (`CPU_ONLY_KINDS = ['embed']`, mirroring the backend's), so a GPU run with embeddings on reads `GPU`, never a
  false `GPU + CPU` "fell back" (R10). A structure model on the CPU still reads `GPU + CPU`; the crop detector keeps
  main's behaviour.
- `renderer/data/status.js`: `displayStatus(study, runningId, batch)` keeps a film an Embed batch is running (and the
  films waiting in it) at its derived status — an Embed never segments, so it is never Processing, and
  `summaryCounts` never counts it Unsegmented. The embed signal is `batch.kind === 'embed'`.

**10. The tab, the chip and the cards.** `renderer/components/similar.js`: a `REGION` control — `Lumbar | Cervical | Whole
spine`, buttons keyed `data-similar-key="region-lumbar" | "region-cervical" | "region-full_spine"` — between `SCOPE` and
`RANK BY`; a button whose anatomy the open film lacks is disabled and titled `This study has no {region} anatomy`; the
eyebrow reads `RANKED BY {LUMBAR|CERVICAL|WHOLE-SPINE} {SHAPE, ALIGNMENT AND APPEARANCE|SHAPE|ALIGNMENT|APPEARANCE}`;
up to ten cards (spec decision 15; `findSimilar`'s default `n` and the tab's own); a card's first line is the film's name
and the match percentage, and the absent switched-on blocks follow on their own wrapping line
(`.similar-line.similar-missing`, from `BLOCKS[].label`: `· no hip`, `· no disc heights`, `· no cervical balance` …) so a
long list never squeezes the name out; line 3 is `angleLine` for the region. Empty states from `openReason`: `unsegmented`;
`no-region` (`This study has no {region} anatomy to rank on — choose another region.`); `no-embedding`; `no-alignment`
(`Alignment needs at least one measured {region} angle on this study.`). *(Amended 2026-10-03, final review: `no-region`
reads `This study has no anatomy to rank on yet.` when `hasRegion` fails for all three regions; `no-blocks` reads `This
study has no {region} {shape|alignment|appearance|shape, alignment or appearance} to rank on.`, with ` — choose another
region.` appended only when `hasRegion` is true for another region; the no-candidates sentence is `No other eligible {lumbar|cervical|whole-spine} studies in this
workspace.` / `… in the library.`)* `styles/components.css`: `.model-choice-btn:disabled`
(opacity .5, `not-allowed`, the same on hover; a pressed disabled button keeps a dimmed accent, so the sidebar's pickers
still show their setting while a run disables them) (R16). Comparison mode's chip (`renderer/screens/analysis.js`) calls
`findSimilar` with the same held region as the tab and lists `similarRegion` in its memo key, so the chip's percentage is
the card's under every region and mode (R15). The study-rename control's `title` no longer carries the `SP-nnnn` record id
(R17).

**11. Packaging and settings: unchanged.** No new root file — `similarity-blocks.js` ships under `renderer/**/*`, already
globbed by `package.json` `build.files` and `electron-builder.preview.yml`. `test/fixtures/similarity-fixtures.js` is test
support, never matched by the `test/*.test.js` glob. No CSP, dependency or setting change. Released with the first version
after 1.0.15 that this branch's release commit names (1.0.16 or later); that commit is separate from this amendment.

**Not carried forward from the spec's own text** (recorded so a reader does not go looking for them): spec §7.1's
`shapePair(a, b, order, floor, mirror) → {a, b, transformA, transformB}` is `shapePair(a, b, shape, signA, signB) →
{d, a, b}` with `a`/`b` each `{list, sign, cx, cy, size}`; §7.2's "all null when the film has no bound calibration" for
`discHeights` is `discRows`'s own rule (R14); §7.5's "a current embedding record" is "an embedding record" (a record from
another graph still ranks the film on the other blocks and is counted as `stale`); §7.6's `{matches, total, stale}` also
carries `region` and `weights`; §11's "`planEmbed`'s `excluded` is always 0" is no `excluded` at all.
