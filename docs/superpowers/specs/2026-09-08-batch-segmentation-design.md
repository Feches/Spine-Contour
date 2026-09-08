# Batch segmentation — design

**Status:** draft for review, 2026-09-08. Brainstormed on branch `claude/batch-segmentation` (off
`claude/studies-ui-updates-bb040d` at `192f303`). Nothing here is implemented.

**Builds on:** `2026-08-31-spine-contour-ui-redesign-design.md` (the approved spec; "spec §" below
refers to it), `2026-09-06-preop-postop-organisation-design.md` (the pre-op/post-op spec; "pp §"
below) and the binding architecture contract `plans/2026-08-31-00-architecture-contract.md`. Where
this document changes a module interface or a state key, §16 lists the amendment it forces.

---

## 1. Problem

A workspace load turns every film it finds into an unsegmented study, and every one of them then has
to be opened and run by hand: open the study, click `Run segmentation`, wait five to sixty seconds
in front of the screen, go back to the list, open the next. The pre-op/post-op workflow (pp §2, step
3: "Run segmentation across the cohort") has no button. Forty films is forty opens, forty clicks and
half an hour of watching a spinner.

What exists today, and what this design keeps:

- **One run at a time.** `runSegmentation` in `renderer/screens/analysis.js` reads the film's bytes
  (this session's payload map, else the file at `filePath`, else a native relocate picker), sets
  `state.running` to the study's id, posts to `/predict`, decodes the response's bitmaps, takes the
  thumbnail, writes the prediction sidecar, then commits the record in one `setState` that also
  clears `running`. Every step after an `await` re-checks the record's identity by `addedAt`, because
  ids are reused after a delete. `state.running` is the id of the one study whose `/predict` is in
  flight (HANDOFF decision 13), and the viewer, the Studies list, the delete path and the smoke
  harness all read it.
- **The backend cannot usefully run two at once.** `/predict` runs in FastAPI's thread pool
  (`run_in_threadpool`), so two concurrent requests would run concurrently — on the CPU-only laptop
  the app is tested on, that means two PyTorch runs competing for four cores and double the memory,
  slower per film than one after the other.
- **There is no progress channel.** `/predict` returns once, at the end. Spec decision 6 and the
  contract forbid timed stage labels; the viewer's run card shows an indeterminate ring and one static
  description.
- **Two counts already exist.** The Studies summary reads `{n} STUDIES · {m} IN QUEUE`, where `m` is
  every study without measurements, whether or not anything is queued to run it. The viewer's run
  card reads `QUEUED` for the same films. Both words predate any queue.
- **The Parameters grid already ticks rows** (`state.paramSelected`, HANDOFF decisions 38–39) and
  filters by workspace and folder (`state.paramFilters`). The Find tab has neither; its only filter
  is the search box, which both tabs share (decision 35).

## 2. Users and workflow

The researcher (spec §2), doing this:

1. Load a workspace, or drop films on the Studies screen.
2. On the Find tab, narrow the list to a workspace or a folder, and tick rows if the batch should be
   a subset of what is showing.
3. Click one button. The label says how many films it will run.
4. Do something else while it runs: open a finished study and correct its landmarks, load another
   folder, or leave the machine. The count is visible from every screen.
5. Come back and read the toast: how many were segmented, how many were not and why.
6. Switch to the Parameters tab. The same rows are still ticked; `Export 12 selected` is one click.

## 3. Goals

- One click segments many films, strictly one after another, with honest count-only progress
  visible from every screen.
- The Find tab can narrow to a workspace or a folder and pick rows, so a batch is a chosen set, not
  the whole library.
- A batch never re-runs a segmented film, never guesses, never drops a film silently, and can be
  stopped.
- The single-run path's guarantees are kept exactly: one `/predict` in flight, the sidecar written
  before the record, identity checked by `addedAt` after every `await`, every commit a new reference.
- Nothing is persisted for the queue. A quit loses at most the film in flight.

## 4. Non-goals

- Re-running segmented films in bulk. That is ROADMAP item 3's "re-run a selection", which wants a
  provenance field first; the batch driver built here is the vehicle it will use.
- More than one `/predict` in flight.
- Aborting a run in flight. `/predict` has no cancel and the backend would keep computing.
- A persisted queue that resumes after a relaunch.
- Starting a batch from the Workspace's Load button. The list is one click away and shows the count.
- Per-film progress, time estimates or stage labels (spec decision 6).
- A fourth status pill (`Queued`).
- A quit prompt while a batch runs.
- Bulk delete, bulk relabel, or any other action over the ticked rows.

## 5. Current state this builds on

- `renderer/screens/analysis.js`: `runSegmentation(studyId)` (module-private), `filmBytes`,
  `relocateFilm`, the single-entry `imageCache` and `cacheImages`, `runRevision`, `locating`, the
  module-scope `mounted`. Exports `setFilePayload` and `releaseStudy`, which `screens/studies.js`
  already imports.
- `renderer/components/viewer.js`: `describeCard(study, state, hasResult)` — the `RUNNING` / `QUEUED`
  / `LOADING` / `FILM UNAVAILABLE` cards; `setRunHandler`; the `rerunButton` and `editButton` gating on
  `state.running`.
- `renderer/screens/studies.js`: `buildRow(study, runningId)`, `buildTable`, `actionCell` (every click
  inside it stops propagation so the row's own click cannot open the study), the module-scope
  `confirmingId`, `refreshTable(focusSelector)`, `deleteStudy` (refuses the running study; clears the
  id from `paramSelected`), and `update(live)` with the key `[studies, query, running, confirmingId]`.
- `renderer/screens/parameters.js`: `buildFilterBar` with the workspace and folder selects, the local
  `checkbox()` helper, the `data-param-key` focus-restore convention, the export note pattern for a
  disabled button (Chromium shows no tooltip on a disabled control).
- `renderer/data/parameters.js`: `workspaceOptions`, `folderOptions`, `normaliseFilters`,
  `patchFilters`, `toggleId`, `withIds`, `selectedVisible`, `rowsToExport`, `isSegmented`, the private
  `matchesWorkspace`.
- `renderer/data/pairing.js`: the toast rule — up to five names, then an ellipsis; clauses only when
  nonzero.
- `renderer/components/sidebar.js`: `navRow` takes a `subLabel`; the Workspace row shows
  `{n} FILMS · {m} ROWS`.
- `renderer/router.js`: `SIDEBAR_KEYS`; the Studies and Analysis screens subscribe to the store
  themselves and are remounted only on `SCREEN_KEYS`.
- `tools/smoke/smoke-studies.mjs` pins `IN QUEUE` four times and runs one real segmentation through
  `inject-study.js` + `run-and-wait.js`; `smoke-workspace.mjs` reads the summary once;
  `smoke-persist.mjs:301` pins the `QUEUED` eyebrow.

## 6. Decisions

Each of these was a fork in the brainstorm (2026-09-08, in chat). The choice, the reason and the cost
if it turns out wrong are recorded so nobody reopens them by accident; any can be reversed before
implementation starts.

1. **The batch starts from the Find tab, and the button follows the export rule.** Ticked visible
   rows when any visible row is ticked, else every visible unsegmented film; the label says which and
   how many (HANDOFF decision 38, applied to a second action). The Find tab is where the status
   column and the count already are, and the workspace load lands there. *Cost if wrong:* a user who
   wants the whole library with a filter set has to clear the filter first.
2. **Already-segmented rows are skipped, never re-run.** A batch re-run would overwrite the record's
   corrected geometry and the sidecar for many films at once, unrecoverably; the viewer's single
   re-run button still covers one study. Bulk re-run waits for ROADMAP item 3's provenance field.
   *Cost if wrong:* re-running a cohort with a new model stays one study at a time until then.
3. **One selection for both tabs.** The Find tab reads and writes `state.paramSelected`, the key the
   Parameters grid uses; the name is kept because renaming it touches the grid, its tests and the
   smoke suite for no behaviour. Tick twelve films, segment them, switch tabs, export them. *Cost if
   wrong:* the key's name says `param`; a tick made for one purpose carries to the other, which is the
   feature.
4. **The workspace and folder filters are shared between the tabs.** The Find tab's two selects read
   and write `paramFilters.workspace` and `paramFilters.folder`, exactly as the search box already
   applies to both tabs (decision 35). *Cost if wrong:* a folder chosen for segmenting narrows the
   grid too, until cleared.
5. **Strictly serial; `state.running` is unchanged.** One `/predict` in flight, the batch a sequence
   of single runs; decision 13 stands. *Cost if wrong:* no throughput gain on a multi-core desktop;
   a later concurrency of two needs the backend's thread budget considered first.
6. **Progress is a count of attempts.** `{done} of {total} done`, where `done` counts every film
   whose turn has ended — segmented, failed or skipped — so the count always reaches the total. The
   toast splits the outcome. Nothing per film, nothing timed (spec decision 6). *Cost if wrong:*
   none identified beyond decision 6's.
7. **`IN QUEUE` becomes `UNSEGMENTED`, and the viewer's plain `QUEUED` eyebrow becomes `UNSEGMENTED`
   too; `QUEUED` is reserved for a film in the running batch.** Both counts are films without
   measurements. Once a real queue exists the old words would label a number and a film as something
   they are not. *Cost if wrong:* four expectations in the studies smoke suite, one in the workspace
   suite, one in the persist suite, the smoke README's baselines, spec §9.4 and §9.5.
8. **No fourth status pill.** The running film and every queued film read `Processing`, as spec
   §13.1 defines it; the filter bar and the sidebar say what the batch is doing. *Cost if wrong:* a
   row alone does not say whether its film is in the batch.
9. **Stop finishes the film in flight and starts no other.** There is no abort: `/predict` cannot be
   cancelled, the backend would keep computing, and an ignored result would waste a minute for
   nothing. *Cost if wrong:* up to a minute's wait after Stop.
10. **Failures are collected and reported once; the batch continues.** A film that cannot be read,
    or that the backend rejects, is recorded with its display-ready reason and the next film starts.
    *Cost if wrong:* a dead backend fails every remaining film in seconds, and the toast says so.
11. **A batch is allowed with persistence disabled, with one warning at the start.** The results are
    real for the session; the toast says they will be lost. *Cost if wrong:* a long batch whose
    results vanish at quit — after being told.
12. **Approach 1 of three: a driver module beside the router, a pure planner under `data/`, and the
    run core exported from the analysis screen.** Moving the byte map and the identity guards out of
    `screens/analysis.js` was rejected as relocating code a human gated in plans 05 and 06 for no
    behaviour gain; a main-process queue was rejected because the completion path needs the renderer
    anyway. *Cost if wrong:* the Studies screen depends on the analysis module a little more than it
    does now.
13. **Nothing about the queue is persisted; no quit prompt.** The saver writes on every commit, so a
    quit loses only the film in flight; the remaining films are still unsegmented at relaunch and one
    click resumes. *Cost if wrong:* the user re-clicks.
14. **Model choice is read at each film's turn**, as a single run reads it. Changing it mid-batch
    applies from the next film; every result records `qc.models`. *Cost if wrong:* a batch's results
    can mix models, and the result says which.
15. **Ticks survive the batch** (decision 38: nothing clears a selection by itself). After a batch
    over ticked rows the button reads `Segment 0 selected` with its note, until the ticks are cleared
    or the selection changes. *Cost if wrong:* a disabled button with a true note.
16. **Demo rows have no tick box on the Find tab**, as they have no delete control there: nothing on
    that tab can act on a demo study. A demo id ticked on the Parameters grid is simply not counted
    by the Find tab. *Cost if wrong:* a tick made on one tab is invisible on the other for a
    dev-only fixture.

## 7. The Find tab

### 7.1 Filter bar

A row between the dropzone and the table (`.studies-filters`): a `Workspace` select, a `Folder`
select, a spacer, then the segment button and its note (§7.3), or the progress group while a batch
runs (§7.4).

- The selects offer exactly what the Parameters tab's do — `workspaceOptions(state.studies)` and
  `folderOptions(state.studies, workspace)` — and read and write `paramFilters.workspace` and
  `paramFilters.folder` through `patchFilters`, with the grid's rule that choosing a workspace clears
  the folder. Rendering reads `normaliseFilters(state.paramFilters, state.studies)`, so a stale
  stored value is never applied.
- The table shows the studies the search keeps **and** the two filters keep, in library order. The
  matching rule is the grid's: `data/parameters.js` exports it as one predicate (`matchesLocation`,
  name at the planner's discretion) so the two tabs cannot disagree about which folder a film is in.
- The summary line keeps describing the whole library, never the filtered view.
- Every control on the bar carries a `data-find-key` (`workspace`, `folder`, `segment`,
  `segment-note`, `stop`, `progress`), the Parameters tab's `data-param-key` convention: the bar is
  rebuilt with the table, focus is handed back to the control with the same key, and the smoke suite
  selects on the key, never on a label.

### 7.2 Ticks

- Each **real** row's STUDY cell starts with a tick box (decision 16: none on a demo row), before the
  name. The box is the grid's control, so the grid's local `checkbox()` helper is lifted to
  `renderer/components/checkbox.js` and both tabs build the same node; a copy is not acceptable
  (ROADMAP §6 already counts five `sameKey` copies). A click
  on the box stops propagation so the row's own click does not open the study, as every control in
  `actionCell` already does; Space on the box is the box's own activation and already bypasses the
  row's keydown handler (`event.target !== row`). Each row's box carries
  `data-find-key="row-<id>"`.
- The STUDY header cell carries a select-all box (`data-find-key="select-all"`): ticked when every
  visible real row is selected, indeterminate when some are, and it ticks or unticks every visible
  real row through `withIds`. Indeterminate always selects, as the grid's does.
- The selection is `state.paramSelected` (decision 3), replaced wholesale, session-only. Decision 38
  carries over: a tick hidden by a filter or the search stays ticked and is not counted; the existing
  delete path already clears a deleted id.

### 7.3 The segment button

`data-find-key="segment"`, a primary small button; its note (`data-find-key="segment-note"`) is a
visible span beside it because Chromium shows no tooltip on a disabled control. The planner
(§8.4) decides the label, the note and the id list from the visible rows and the selection; the
screen renders what it returns.

| Situation | Label | Note | Enabled |
|---|---|---|---|
| Nothing ticked; 37 visible real unsegmented films | `Segment 37 unsegmented` | none | yes |
| Nothing ticked; visible real rows all segmented | `Segment 0 unsegmented` | `All visible studies are segmented` | no |
| No visible real rows | `Segment 0 unsegmented` | `Nothing to segment` | no |
| 12 ticked visible, 5 already segmented | `Segment 7 selected` | `5 already segmented` | yes |
| 12 ticked visible, all segmented | `Segment 0 selected` | `All selected studies are segmented` | no |
| A single run is in flight from the viewer (`state.running` set, `state.batch` null) | as above | `Wait for the current segmentation to finish` | no |

Only real, unsegmented, visible rows are ever run. "Ticked" means ticked **and visible**
(`selectedVisible`). The list of ids is in table order at the click.

### 7.4 The progress group

While `state.batch` is non-null the button and note are replaced by a group
(`data-find-key="progress"`): a small indeterminate spinner (the run card's `.run-spinner`, sized
for a bar), the text `{done} of {total} done`, and a `Stop` button (`data-find-key="stop"`). After
Stop is pressed the text reads `Stopping after this film…` (U+2026) and the button is disabled. The
selects and the ticks stay live during a batch; changing them changes nothing about the batch, whose
id list was fixed at the click. When the batch ends the bar goes back to §7.3, recomputed over
whatever is visible and ticked then.

### 7.5 Empty states

- The library is empty: the existing wording, unchanged.
- Only the search is active and nothing matches: `No studies match that search.` — pinned by the
  smoke suite, unchanged.
- A workspace or folder is set (with or without a search) and nothing matches: `No studies match
  these filters.` — the Parameters tab's wording.

## 8. Batch state and the loop

### 8.1 Store

One new key, replaced wholesale on every change, never persisted:

```js
batch: null | {
  ids: string[],                              // the snapshot at the click, in table order
  done: number,                               // turns ended: segmented + failed + skipped
  failed: { id, name, reason }[],             // display-ready reasons
  warnings: { id, name, reason }[],           // segmented, but the sidecar could not be written
  skipped: number,                            // gone, or no longer unsegmented, at its turn
  stopping: boolean,
}
```

`state.running` is untouched by this design: the run core sets and clears it for each film exactly
as a single run does, so every existing reader — the viewer's busy checks, the list's badge, the
delete refusal, `run-and-wait.js` — works unchanged. `done` counts attempts (decision 6).

### 8.2 The driver — `renderer/batch.js`

Module scope, beside `router.js` and `api.js`, so it outlives any screen. It wires a factory from the
pure module (§8.4) to the real store, toast and run core, and exports:

- `startBatch(ids)` — refuses (returns without effect) while `state.batch` is non-null, while
  `state.running` is set, or when `ids` is empty. Otherwise: records each id's `addedAt` at the click
  in a module-scope map; sets `state.batch` **before its first `await`**; if persistence is disabled,
  toasts once (`Studies are not being saved this session; the batch's results will be lost when the
  app closes.`); then, for each id in order:
  1. Reads the store. If the record is gone, its `addedAt` differs (the id was reused), or it has
     measurements, the film is skipped: `skipped + 1`, `done + 1`.
  2. Otherwise `await segmentStudy(id, { batch: true })` (§8.3) and folds the outcome in: `ok` →
     `done + 1` (and a `warnings` entry when the outcome carries one); not ok → a `failed` entry,
     `done + 1`.
  3. Reads `stopping`; if set, ends the loop.
  
  When the loop ends, for any reason: one `setState({ batch: null })`, then one toast from
  `batchMessage` (§9). No other toast is raised for the whole batch.
- `stopBatch()` — sets `stopping: true` on a new batch object. Nothing else.

The driver never calls `setState` from inside a store notification, and every write replaces the
`batch` object.

### 8.3 The run core — `screens/analysis.js`

`runSegmentation(studyId)` is split into an exported core and a private interactive wrapper, with
the interactive path's behaviour kept exactly as it is today.

```js
export async function segmentStudy(studyId, { batch = false } = {})
  // → { ok: true, warning?: string } | { ok: false, reason: string }; never throws
```

The core takes a film from bytes to a committed record: `filmBytes`, `setState({ running })`,
`predict` with `getState().models`, `loadStudyImages`, the thumbnail, `savePrediction`,
`recordPrediction`, the one `setState` that commits `measurements`/`geometry`/`qc`/`thumbnail` and
clears `running`, with every existing revision and `addedAt` check in place. In **batch** mode it
differs in exactly these ways:

- **No relocate picker.** `filmBytes` returning null is `{ ok: false, reason: 'file not found' }`;
  the record is untouched, and the user relocates it from the Analysis screen as today. `locating`
  is never set.
- **No toasts.** Every message the interactive path toasts becomes part of the outcome: a `/predict`
  rejection is `{ ok: false, reason }` with the backend's display-ready message; a sidecar write
  failure completes the run as today and returns `{ ok: true, warning }`; the persistence-disabled
  notice is not raised per film (the driver said it once).
- **No write to the image cache unless the film is the open study** (`mounted?.studyId === id`), and
  no `setImages` on a viewer showing another study — the same gate the completion path already
  applies to the live hand-off. The decoded bitmaps serve the thumbnail and are disposed. A batch of
  forty must not evict the open study's bitmaps and must not hold forty sets of them.
- **The prediction snapshot is still recorded** (`recordPrediction`), so RESET TO PREDICTION works
  on a batch-segmented study opened later in the session, as it does after a single run.
- **The film's bytes are not parked.** `filmBytes` today keeps what it reads from disk in the payload
  map for a later re-run; a batch of forty would hold forty films' bytes for the session. In batch
  mode the bytes are dropped after the run, and a later single run re-reads the file.

The interactive wrapper (`runSegmentation`, still private, still what `setRunHandler` calls) is the
core with `batch: false`: the picker, the `locating` guard, the per-run toasts, the image cache
write. `setRunHandler`'s guard gains `|| live.batch`, so no single run starts while a batch is up —
including in the short window between two films where `running` is null.

Two guards the split has to add, because the single-run code assumed that "a run" was always the
open study's own:

- **After the relocate picker resolves, the wrapper re-checks `state.batch` and `state.running`.**
  The picker is modeless and `locating` is private to the module, so a batch can start while it is
  open; today the wrapper would then set `running` over the batch's id and put a second `/predict` in
  flight. If either is set when the picker returns, the wrapper keeps the relocated path and the
  bytes on the record and the map, does not run, and toasts `Wait for the batch to finish` (or the
  current segmentation's wording).
- **`restoreFilm`'s run guard becomes per-study.** It drops its result when `runRevision` moved
  during the sidecar read — written for one run at a time on the open study, but a batch bumps the
  global counter at every film's turn, and a restore caught in that window returns early with the
  card left reading `LOADING`. The guard is narrowed to "a run for **this** study started meanwhile"
  (a per-study revision, as `viewer/measure-queue.js` keeps per study), which is what it meant.

### 8.4 The planner — `renderer/data/batch.js`

Pure, no DOM, unit-tested. Exports (names at the planner's discretion; the behaviour is binding):

- `planBatch({ visible, selected, running })` → `{ ids, label, note, enabled }` — the §7.3 table.
  `visible` is the table's rows after the search and the filters; `selected` is `paramSelected`;
  `running` is `state.running`.
- `newBatch(ids)` → the initial object; `advance(batch, outcome)` → a new object with the outcome
  folded in (`{ ok: true, warning? }`, `{ ok: false, name, reason }`, or `{ skipped: true }`);
  `withStopping(batch)`.
- `progressText(batch)` → `'2 of 12 done'` | `'Stopping after this film…'`;
  `sidebarText(batch)` → `'2 OF 12 DONE'` | `'STOPPING'`.
- `batchMessage(batch)` → the closing toast (§9).
- `createBatchDriver({ segment, getState, setState, showToast, persistenceDisabledReason })` →
  `{ startBatch, stopBatch }` — the §8.2 loop over injected dependencies, the way
  `viewer/measure-queue.js` takes an injected `measure`, so the sequencing, the stop, the skip and
  the failure collection are tested without a DOM. `renderer/batch.js` is the one wiring of it.

### 8.5 Model choice

Read at each film's turn (decision 14). Nothing snapshots `state.models` at the click.

## 9. What every surface reads during a batch

Worked example: 40 studies, 37 unsegmented. The user filters to the `pre-op` folder (12 films, all
unsegmented), ticks select-all, clicks `Segment 12 selected`.

| Moment | Summary line | Filter bar | Sidebar, Studies row sublabel | Viewer card on a queued film |
|---|---|---|---|---|
| Before the click | `40 STUDIES · 37 UNSEGMENTED` | `Segment 12 selected` | none | `UNSEGMENTED` / `No segmentation yet` / `Run segmentation` |
| Third film running | `40 STUDIES · 35 UNSEGMENTED` | spinner, `2 of 12 done`, `Stop` | `2 OF 12 DONE` | `QUEUED` / `Waiting for its turn in the batch` / button disabled, title `Wait for the batch to finish` |
| Stop pressed during the fifth | unchanged | `Stopping after this film…`, Stop disabled | `STOPPING` | unchanged |
| Fifth film finishes | `40 STUDIES · 32 UNSEGMENTED` | `Segment 7 selected` (the seven still ticked and unsegmented) | none | the plain card |
| Toast | `Segmented 5 of 12 films, then stopped.` | | | |

**Summary line.** `{n} STUDIES · {m} UNSEGMENTED` (decision 7); `m` is computed exactly as today.

**Row badges.** Unchanged (decision 8): the running film and every queued film read `Processing`.

**Sidebar.** The Studies nav row gains a `subLabel` while `state.batch` is non-null —
`sidebarText(batch)` — so the count is visible from the Workspace and Analysis screens. `batch` is
added to `SIDEBAR_KEYS`.

**Viewer run card** (`describeCard`), for a real study without a result, while `state.batch` is
non-null:

| The open study is | Eyebrow | Title | Body | Button |
|---|---|---|---|---|
| the film in flight | `RUNNING` | as today | as today | `Working…`, disabled |
| in the batch, waiting | `QUEUED` | `Waiting for its turn in the batch` | `This study is in the running batch and will be segmented in turn.` | `Run segmentation`, disabled, title `Wait for the batch to finish` |
| not in the batch | `UNSEGMENTED` | `No segmentation yet` | as today | `Run segmentation`, disabled, title `Wait for the batch to finish` |

With no batch, the card is as today except that the plain eyebrow reads `UNSEGMENTED` (decision 7).
The `FILM UNAVAILABLE` card's re-run button and the toolbar's re-run button are disabled while a
batch runs, with the same title. "Waiting in the batch" means the id is in `batch.ids` at an index
greater than `batch.done`; the film at index `batch.done` is the one in flight, and it is
`state.running` that says so.

**The closing toast**, from `batchMessage`, clauses joined as `pairedExportMessage` joins them and
raised only when nonzero, names capped at five then an ellipsis:

- `Segmented {ok} of {total} films.` — or `…, then stopped.` when `stopping` was set; `film` when the
  total is one.
- `{n} could not be segmented: {name} ({reason}), {name} ({reason}), …`
- `{n} segmented without stored images: {name} ({reason}), …`
- `{n} skipped (deleted, or segmented meanwhile).`

`toastDuration` (HANDOFF decision 50) already scales the toast to its length.

## 10. Failures and moved films

| Case | In a batch |
|---|---|
| Film not on disk and no payload for it | Failure `file not found`; no picker. The record is untouched. |
| `/predict` rejects (422, 500, an oversized file) or the backend is down | Failure with the backend's message. The batch continues; a dead backend fails every remaining film in seconds and the toast says so. |
| The sidecar cannot be written | The run completes and the record commits, as today; a `warnings` entry, one clause in the toast. |
| Persistence is disabled for the session | Allowed; one toast at the start (decision 11); the results are in the store for the session. |
| The record is deleted, or its id reused, before its turn | Skipped; counted. |

The core never toasts in batch mode (§8.3). A failure never stops the batch; only Stop does.

## 11. Stop, delete, navigation and quit

- **Stop** (decision 9) finishes the film in flight and starts no other. The progress text says so.
- **Delete** of the running study still refuses with the existing message. A queued study can be
  deleted and is skipped at its turn; the existing delete already clears its id from the selection.
- **Navigation is free.** Open any study; correct landmarks on a segmented one — `/measure` runs
  beside `/predict` in the backend's pool and is cheap; export; load another workspace. Films added
  during a batch, by drop, picker or Load, are not in it and can be run afterwards. The viewer's Run
  and re-run buttons stay disabled until the batch ends.
- **A second batch** is refused while one runs; the bar shows the progress group, not the button.
- **Quit mid-batch** loses the film in flight and nothing else (decision 13). No quit prompt.

## 12. Testing

Pure modules get `node --test` coverage:

- `data/batch.js`: `planBatch` for every row of the §7.3 table, including a tick hidden by a filter,
  a demo row ticked on the grid, and a running single run; `advance` over each outcome kind, the
  `done` invariant; `progressText` and `sidebarText` before and after Stop; `batchMessage` for a
  clean run, a stopped run, one and many failures, warnings, skips, the five-name cap, and the
  singular; `createBatchDriver` with an injected `segment`: ids run in order and one at a time (the
  injected function asserts it is never re-entered), `state.batch` set before the first call, the
  outcome folded after each, a Stop set mid-run ending after the current film, a record deleted or
  reused before its turn skipped, `startBatch` refused while a batch or a run is up, the closing
  `setState({ batch: null })` followed by exactly one toast, and the persistence-disabled toast.
- `data/parameters.js`: the exported location predicate agrees with `filterParameters` on
  workspace, folder and `HAND_ADDED`.
- `test/store.test.js`: the new key's initial value.

DOM code gets manual verification plus additions to `tools/smoke/`:

- `smoke-studies.mjs`: the four `IN QUEUE` expectations become `UNSEGMENTED`; new sections for the
  Workspace and Folder selects (the injected hand-added study reads `Added by hand` / `design_src`
  and filters in and out), the row tick and select-all (read `paramSelected` from the store, never
  the cell), the button's label and note across the §7.3 rows that the fixture can reach, and a real
  batch: two studies injected with the sample film's bytes, both ticked, the button clicked, then
  `state.batch.done` polled to 2 and `state.batch` to null, both records carrying measurements, the
  summary decremented, and the toast reading `Segmented 2 of 2 films.`; a second batch over one
  injected study with a nonexistent `filePath` and no payload, ending in seconds with `file not
  found` in the toast; Stop pressed during the first film of a two-film batch, ending with
  `Segmented 1 of 2 films, then stopped.` and the second still unsegmented.
- `smoke-workspace.mjs:119` and `smoke-persist.mjs:301`: the renamed words; the persist suite is run
  once by the plan because it is edited (HANDOFF's rule against blind edits to unrun suites).
- Human gate: the Find tab's controls on the real library; a batch over one folder of it with a Stop
  part-way, watched from the Analysis screen and the sidebar; the closing toast; the same rows then
  exported from the Parameters tab.

Two of HANDOFF's known traps apply directly: smoke selectors key on `data-find-key` and
`data-study-id`, never on a label; and a suite that prints nothing has thrown.

## 13. Sequencing

One plan, one branch (`claude/batch-segmentation`), merged back into
`claude/studies-ui-updates-bb040d` at the user's say-so. A suggested task order for the plan, which
may regroup it:

1. `data/batch.js`: the planner, the transitions, the texts, the driver factory, with tests.
2. `data/parameters.js`: the exported location predicate, with tests.
3. `screens/analysis.js`: the core/wrapper split, behaviour-preserving for the interactive path;
   `components/viewer.js`: the card wording and the batch gating.
4. `renderer/batch.js`: the wiring; `components/sidebar.js` and `router.js`: the sublabel and the key.
5. `screens/studies.js`: the filter bar, the ticks, the select-all, the button, the progress group,
   the summary wording, the shared checkbox helper — the human gate.
6. The smoke suites and their baselines; the records (§16).

## 14. Risks and open questions

- **A hung backend hangs the batch.** `/predict` has no timeout today, for a single run either; Stop
  would then never return. A timeout is out of scope here and is worth a ROADMAP §5 line.
- **Which film is running is not shown on the list.** Decision 8's cost. If it matters, append the
  running film's name to the progress text (`2 of 12 done · S003.png`); it is a known fact, not a
  fabrication.
- **Throughput and heat.** On the tested laptop a hundred films is one to two hours, longer on
  battery (the machine throttles). Nothing here can change that; the count is what makes it bearable.
- **Every commit writes `studies.json`.** The saver coalesces, so a batch of forty is at most forty
  writes of the whole store with its thumbnails. Fine at library scale; a several-thousand-film
  workspace (ROADMAP §5's "no ceiling") would feel it.
- **The studies smoke suite grows by three real runs**, roughly three minutes on the tested machine.
  Acceptable; if it becomes a problem, the Stop and the failure cases can share one launch.
- **ROADMAP item 3** will want `startBatch` to accept segmented films under an explicit re-run flag.
  The driver's skip rule is the only thing standing in the way; the flag is not built here.
- **The `paramSelected` name** now understates what the key is. A rename is a small mechanical
  change for a later branch, not this one (decision 3).

## 15. Out of scope

Everything in §4, plus: a concurrency setting; a batch over the Parameters grid's rows; per-row
"in batch" marks; sorting on the Find tab; a `Clear selection` control (ROADMAP §5 already lists it
for the grid, and the select-all covers the visible case); a batch started by the workspace load.

## 16. Amendments this forces

- **Architecture contract, state shape:** `batch` (§8.1) with its comment; `paramSelected` and
  `paramFilters` gain "read and written by both tabs of the Studies screen"; `SIDEBAR_KEYS` gains
  `batch`; the Studies screen's own `update()` key array gains `batch`, `paramFilters` and
  `paramSelected`.
- **Architecture contract, file structure:** `renderer/batch.js` and `renderer/data/batch.js` with
  their exports (§8.2, §8.4); `screens/analysis.js` exports `segmentStudy`; `data/parameters.js`
  exports the location predicate; `components/checkbox.js`; `screens/studies.js`'s filter bar,
  ticks and button; `components/viewer.js`'s card wording and batch gating; `restoreFilm`'s
  per-study run guard.
- **Spec §9.4:** the summary reads `{n} STUDIES · {m} UNSEGMENTED`; the filter bar, the ticks and the
  segment button. **Spec §9.5:** the needs-run overlay's states are `UNSEGMENTED` / `QUEUED` /
  `RUNNING`.
- **Pre-op/post-op spec §10.3:** the workspace and folder filters are the Studies screen's, shared
  with the Find tab.
- **`tools/smoke/README.md`:** the baselines and the renamed words.
- **`docs/ROADMAP.md`:** item 3 notes the batch driver as the vehicle for "re-run a selection"; §5
  gains the missing `/predict` timeout.
- **HANDOFF:** decisions 51 onward from §6, a "Where things stand" entry, and any trap execution
  hits — at the wrap.
