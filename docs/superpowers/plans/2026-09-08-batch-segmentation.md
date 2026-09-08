# Batch Segmentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One click on the Studies screen's Find tab segments many loaded films, strictly one after another, with honest count-only progress visible from every screen, a Stop, and one closing report; the Find tab gains workspace and folder filters and row ticks so the batch is a chosen set.

**Architecture:** A new pure module `renderer/data/batch.js` decides what the button runs and says, holds the batch object's transitions and texts, and carries the driver loop as a factory over injected dependencies. A new `renderer/batch.js` beside the router is the one wiring of that factory to the real store, toast and the analysis screen's run core. The analysis screen's `runSegmentation` is split into an exported core, `segmentStudy(studyId, { batch })`, that returns an outcome and never throws, and the viewer's button keeps the interactive behaviour it has today. The Find tab in `screens/studies.js` grows a filter bar (the grid's two selects, shared keys), row ticks sharing `paramSelected`, and the segment button or, while a batch runs, its progress group. `state.running` is untouched.

**Tech Stack:** Vanilla ES modules, no bundler, no runtime dependencies. `node --test` for pure logic. The CDP smoke harness in `tools/smoke/` for DOM behaviour. Electron 44 / Chromium 152. A Python/FastAPI backend that serves `/predict` one film per request, five to sixty seconds each on the tested laptop.

**Spec:** `docs/superpowers/specs/2026-09-08-batch-segmentation-design.md` ("the spec" below; every "§" without a prefix refers to it). Read its §6 decisions, §7, §8, §9, §10 and §11 before starting; §12 is the testing this plan implements; §16 the records Task 7 writes. The redesign spec is `docs/superpowers/specs/2026-08-31-spine-contour-ui-redesign-design.md` ("spec §"), the pre-op/post-op spec is `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` ("pp §"). The binding architecture contract `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` wins over this plan; Task 7 amends it.

## Global Constraints

Copied from `CLAUDE.md` and the spec. Every task's requirements include these.

- **Never display a fabricated measurement or a fabricated status.** Absent values render `—` (U+2014). Progress is a COUNT of attempts (`{done} of {total} done`), never a percentage, a stage or a time; `/predict` has no progress channel (spec decision 6).
- **Never label a value with a name it isn't.** The summary's second number is films without measurements: it reads `UNSEGMENTED`, never `IN QUEUE`. The viewer's `QUEUED` eyebrow means "in the running batch" and nothing else.
- **Nothing drops silently.** Every film a batch does not segment is counted or named in the closing toast (§9).
- **Never re-run a segmented film in a batch** (§6 decision 2). Only real, unsegmented, visible rows are ever run.
- **One `/predict` in flight.** `state.running` stays the single id of the study whose `/predict` is in flight (HANDOFF decision 13); the batch is a sequence of single runs. `startBatch` refuses while a run or a batch is up; the viewer's Run and re-run buttons are disabled while a batch is up.
- **Never mutate store state in place.** Every `setState` patch passes a NEW object or array; `batch` is replaced wholesale on every change. `setState` must not be called from inside a subscriber: the Studies screen's `update()` and the viewer's `updateViewer()` run inside store notifications and only DOM event handlers and the driver's own async loop call `setState`.
- **The Studies screen's `update()` key array must list every store key the Find tab reads** — this plan adds `paramFilters`, `paramSelected` and `batch` to it (Task 5). `router.js`'s `SIDEBAR_KEYS` gains `batch` (Task 4). Miss either and the surface silently stops repainting.
- **`el()` assigns to the property when the key exists on the node.** Pass real booleans (`disabled: false`, `checked: true`), never `'false'`. Never pass `style`, `list`, `dataset` or `form` as an `el()` prop.
- **Never change the form of a non-ASCII character on a line you touch, and write any NEW non-ASCII character in JS source as a `\uXXXX` escape** (HANDOFF known trap, 2026-09-08: the Edit and Write tools rewrite escapes as glyphs and once turned a `§` in a JS comment into its escape; both forms compare equal at runtime, so no test catches it). Some existing lines carry glyphs (`·` in the Studies summary, `…` in the viewer's card): leave those as they are. Byte-check the diff before every commit that touches such a line — `git diff -- <files> | grep -nP '[^\x00-\x7F]'` must show only lines that carried the same glyphs before — and repair with a small Python script written to a file, never with `sed` or a `bash -c` one-liner.
- **No bundler, no framework, no runtime dependencies.** `dependencies` stays empty; `devDependencies` stays exactly `electron` and `electron-builder`. **Do not loosen the CSP.** No allowlist change: both electron-builder allowlists already ship `renderer/**/*` and `styles/**/*` by glob, and the two new modules are under `renderer/`.
- **Unit tests run as `node --test test/*.test.js`** (the glob form; the directory form fails on Node 24). Baseline before this plan: 402/402.
- **Pure-logic modules get real `node --test` coverage. DOM code gets explicit manual verification and smoke checks.** Never write a fake test.
- **Smoke selectors key on `data-find-key`, `data-param-key` and `data-study-id`, never on a visible label.** A smoke suite that prints nothing has thrown — re-run it bare and read the stack. Run every suite in the FOREGROUND and capture its output to a file under `tools/smoke/out/` (`> tools/smoke/out/<name>.txt 2>&1`); never background one and wait for it. Never re-run a suite on an instance where one was killed mid-run; relaunch. `smoke-studies.mjs` runs on a FRESH launch, never after `smoke-workspace.mjs` on the same instance, and never between `smoke-persist.mjs --phase run` and `--phase restart`.
- **Conventional commit prefixes** (`feat:`, `fix:`, `test:`, `docs:`, `chore:`); commit after every task; every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Write a multi-line message to a file and `git commit -F` it.
- **Branch:** `claude/batch-segmentation` in the worktree `C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628` (created 2026-09-08 off the tip of `claude/studies-ui-updates-bb040d`, `192f303`; the spec is `02b04c6`). Push only to `fork`, never `origin`; never merge to `main`; never rename onto `ui-redesign-cw`; push only after the last amend of the gated commit.
- **Running the app from source** (three lines, from PowerShell; the shell starts in `C:\Users\codyj`):

  ```
  Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628"
  $env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"
  npm.cmd run dev
  ```

  Smoke harness on a scratch profile, from the Bash tool with the variable set in the same command: `SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/<task>-launch.txt 2>&1` (refuses with exit 3 if port 9222 is held), the suite, then `node tools/smoke/cdp.mjs --quit`. If `node_modules\electron\dist` is missing here, `npm install` will NOT fetch it: copy `node_modules\electron\dist` and `node_modules\electron\path.txt` from `..\studies-ui-updates-bb040d\node_modules\electron\`. An app instance left open from an earlier day (this worktree's `electron.exe`, not on port 9222) runs old code; never kill it unasked — it may be on the user's real library.

## File structure

| File | Responsibility | Status |
|---|---|---|
| `renderer/data/batch.js` | pure: `planBatch`, `newBatch`, `advance`, `withStopping`, `isQueued`, `progressText`, `sidebarText`, `batchMessage`, `createBatchDriver`, the four text constants | create |
| `renderer/batch.js` | the one wiring of `createBatchDriver` to the store, the toast, `persistenceDisabledReason` and `segmentStudy`; exports `startBatch`, `stopBatch` | create |
| `renderer/components/checkbox.js` | the tick box both Studies tabs build (lifted from `screens/parameters.js`), with `keyAttr` and `onClick` | create |
| `renderer/store.js` | `batch: null` | modify |
| `renderer/data/parameters.js` | `matchesLocation(study, filters)` exported; `filterParameters` uses it | modify |
| `renderer/screens/parameters.js` | imports the shared checkbox; nothing else changes | modify |
| `renderer/screens/analysis.js` | `segmentStudy(studyId, { batch })` exported; `filmBytes` takes `park`; per-study run counter for `restoreFilm`; the run handler refuses during a batch | modify |
| `renderer/components/viewer.js` | the card's `UNSEGMENTED` / `QUEUED` states and the batch gating of the run and re-run buttons | modify |
| `renderer/components/sidebar.js`, `renderer/router.js` | the Studies row's sublabel; `batch` in `SIDEBAR_KEYS` | modify |
| `renderer/screens/studies.js`, `styles/screens/studies.css` | the filter bar, the ticks, the select-all, the segment button, the progress group, the summary wording, the empty-state kinds | modify |
| `test/batch.test.js` | the pure suite for `data/batch.js` | create |
| `test/parameters.test.js`, `test/store.test.js` | `matchesLocation`; the new key | modify |
| `tools/smoke/smoke-studies.mjs` | the renamed words, the stale search fixed, the run card's eyebrow, sections 10–14 (filters, ticks, three batches) | modify |
| `tools/smoke/smoke-persist.mjs`, `tools/smoke/smoke-workspace.mjs`, `tools/smoke/README.md` | the renamed words; baselines | modify |
| the contract, `docs/superpowers/HANDOFF.md`, `docs/ROADMAP.md`, the redesign spec §9.4/§9.5, the pre-op/post-op spec §10.3 | records | modify |

Boundaries: `renderer/data/*` never imports from `renderer/screens/`, `renderer/components/` or `renderer/batch.js`. `data/batch.js` imports `selectedVisible` and `isSegmented` from `data/parameters.js` and `studyName` from `data/labels.js`. `renderer/batch.js` imports `store.js`, `components/toast.js`, `api.js`, `screens/analysis.js` and `data/batch.js`; `screens/studies.js` imports `renderer/batch.js` (it already imports `screens/analysis.js`); `screens/analysis.js` imports neither. `components/checkbox.js` imports only `dom.js`. No cycle.

## Rulings made while planning (2026-09-08)

Settled with the user at the brainstorm (in the spec's §6, and HANDOFF decisions 51 onward after Task 7), or made by the planner against the code and recorded here so the executor does not re-decide them. Each carries what it costs if wrong.

- **Ruling (user): the batch starts from the Find tab; the button follows the export rule; already-segmented rows are skipped; one selection and shared workspace/folder filters across the tabs; strictly serial; count-only progress; `IN QUEUE` → `UNSEGMENTED`; Stop finishes the film in flight; failures collected into one toast; approach 1.** All in spec §6. — Cost if wrong: recorded there.
- **Ruling: "waiting in the batch" is index `>= batch.done`, not `> batch.done`.** The film at index `done` is the one whose turn is starting; between two films `running` is null for the milliseconds the next film's bytes take to read, and `>` would flash its card to `UNSEGMENTED`. `busy` (`state.running === id`) is tested first, so the film in flight still reads `RUNNING`. The spec's §9 sentence is read that way and Task 7 amends its wording. — Cost if wrong: one comparison.
- **Ruling: a failure names the study by `studyName()` (its display name), as the delete toast does**, not by `fileName`; the spec's §9 example wrote `S003.png` where the film had no name. — Cost if wrong: one call.
- **Ruling: the persistence-off toast reads `Studies are not being saved this session; batch results will be lost when the app closes.`** — no possessive, so the JS source carries no apostrophe glyph and no escape. — Cost if wrong: one string.
- **Ruling: the shared checkbox keeps the grid's class names** (`checkbox-row param-check param-pick`), and the Find tab's selects keep `param-select`. They are styling hooks in `styles/screens/studies.css`, not tab names; renaming them would touch the Parameters smoke suite for nothing. The Find tab's bar gets its own `studies-filters` / `studies-progress` classes. — Cost if wrong: a rename.
- **Ruling: the shared `checkbox()` gains `keyAttr` (default `'data-param-key'`) and `onClick` (bound on the `<label>`).** The grid passes neither and is unchanged. — Cost if wrong: two options.
- **Ruling: `buildTable`'s third argument becomes an empty-state KIND, `null | 'search' | 'filters'`**, so the two wordings of §7.5 come from one place. — Cost if wrong: one parameter.
- **Ruling: the select-all box is built only when at least one visible row is real**; the fresh dev library (nine demos) shows the plain `STUDY` header, and the smoke suite's header check keeps passing. — Cost if wrong: one conditional.
- **Ruling: the store key `batch` lands in Task 1** with its test, so every later task can read it. — Cost if wrong: none.
- **Ruling: `startBatch` returns `true` when it started a batch and `false` when it refused**, so the driver is testable; the Find tab ignores the value. — Cost if wrong: none.
- **Ruling: the driver wraps `segment()` in try/catch** and counts a rejection as a failure with the error's message, although the core promises never to reject: a batch must never be left with `state.batch` stuck non-null. — Cost if wrong: four lines.
- **Ruling: `segmentStudy` returns internal reasons (`superseded`, `another run is in flight`, `A file dialog is already open.`) on the early returns the interactive path used to take silently.** They never reach a toast: interactive callers ignore the outcome, and in batch mode those branches cannot be taken (one run at a time, no picker). — Cost if wrong: none.
- **Ruling: the stale studies smoke check (`searching the diagnosis text leaves only SP-0042`, 59/60 since `0f8f821`) is fixed in Task 6** by searching `meyerding`, a word only SP-0042's diagnosis carries — this plan rewrites that suite anyway, and ROADMAP §5 named exactly this fix. — Cost if wrong: one string.
- **Ruling: the new smoke sections are numbered 10–14 and appended after the existing section 9** (the no-errors check), which stays where it is; section 14 asserts no NEW errors by comparing `cdp.errors.length` with the count recorded at section 9. — Cost if wrong: none.
- **Ruling: Task 3 runs `smoke-studies.mjs` (expect 59/60, the stale name) and both phases of `smoke-persist.mjs` (34/34 then 44/44)**, because it changes the run core a human gated in plans 05–06 and edits the persist suite. Task 2 runs `smoke-parameters.mjs` (58/58) because it moves the grid's checkbox. — Cost if wrong: minutes.
- **Ruling: Task 5's human gate lists its checks in the chat message and ends the turn; Task 5 commits before the gate with a `Gate: pending` line and is amended after; the ledger stays uncommitted during the gate.** The user is told to close any app instance left open from earlier first. — Cost if wrong: one amend.
- **Ruling: subagent assignment.** Sonnet for Tasks 1, 2, 4, 6, 7 (complete code in the brief); Opus for Task 3 (the gated run core) and Task 5 (DOM, with the human gate); never Fable. Every dispatch that runs a smoke suite says "foreground, capture to a file". — Cost if wrong: a re-dispatch.

---

### Task 1: `renderer/data/batch.js` — the planner, the transitions, the texts, the driver; the store key

**Files:**
- Create: `renderer/data/batch.js`
- Create: `test/batch.test.js`
- Modify: `renderer/store.js` (after the `runStage: null,` line)
- Modify: `test/store.test.js` (after the `runStage` assertion)

**Interfaces:**
- Consumes: `selectedVisible(visible, selected)` and `isSegmented(study)` from `renderer/data/parameters.js`; `studyName(study)` from `renderer/data/labels.js`.
- Produces (all binding on Tasks 3–6):
  - `planBatch({ visible, selected, running })` → `{ ids: string[], label: string, note: string|null, enabled: boolean }` — the §7.3 table.
  - `newBatch(ids)` → `{ ids, done: 0, failed: [], warnings: [], skipped: 0, stopping: false }`.
  - `advance(batch, outcome)` → a new batch; `outcome` is `{ skipped: true }` | `{ ok: true, id, name, warning? }` | `{ ok: false, id, name, reason }`.
  - `withStopping(batch)` → a new batch with `stopping: true`.
  - `isQueued(batch, studyId)` → `boolean` (index `>= done`; false for a null batch).
  - `progressText(batch)` → `'2 of 12 done'` | `'Stopping after this film…'`; `sidebarText(batch)` → `'2 OF 12 DONE'` | `'STOPPING'`.
  - `batchMessage(batch)` → the closing toast.
  - `createBatchDriver({ segment, getState, setState, showToast, persistenceDisabledReason })` → `{ startBatch(ids) → Promise<boolean>, stopBatch() }`.
  - Constants: `STOPPING_TEXT`, `WAIT_FOR_RUN` (`'Wait for the current segmentation to finish'`), `WAIT_FOR_BATCH` (`'Wait for the batch to finish'`), `UNSAVED_BATCH`.
  - `state.batch`, initial `null`.

- [ ] **Step 1: Write the failing tests**

Create `test/batch.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planBatch, newBatch, advance, withStopping, isQueued, progressText, sidebarText, batchMessage,
  createBatchDriver, STOPPING_TEXT, WAIT_FOR_RUN, WAIT_FOR_BATCH, UNSAVED_BATCH,
} from '../renderer/data/batch.js';

// A real, unsegmented film. `n` gives each a distinct addedAt, which is the record's identity.
function film(id, overrides = {}) {
  return {
    id, source: 'real', filePath: `C:\\films\\${id}.png`, fileName: `${id}.png`, name: null, workspaceFolder: null,
    subjectId: null, timepoint: null, filmDate: null, addedAt: `2026-09-08T00:00:00.000Z`, view: 'Standing lateral',
    thumbnail: null, measurements: null, geometry: null, qc: null, clinical: {}, ...overrides,
  };
}
const segmented = (id, overrides = {}) => film(id, { measurements: { PI: 50, PT: 12, SS: 38, LL: { 'L1-S1': 49 } }, ...overrides });
const demo = (id) => film(id, { source: 'demo', filePath: null, measurements: { PI: 50, PT: 12, SS: 38, LL: { 'L1-S1': 49 } } });

// ---------------------------------------------------------------------------
// planBatch (spec §7.3)
// ---------------------------------------------------------------------------

test('planBatch with nothing ticked offers every visible real unsegmented film, in table order', () => {
  const visible = [segmented('SP-1'), film('SP-2'), demo('SP-0042'), film('SP-3')];
  const plan = planBatch({ visible, selected: [], running: null });
  assert.deepEqual(plan, { ids: ['SP-2', 'SP-3'], label: 'Segment 2 unsegmented', note: null, enabled: true });
});

test('planBatch with nothing ticked and every visible real film segmented is disabled and says so', () => {
  const plan = planBatch({ visible: [segmented('SP-1'), demo('SP-0042')], selected: [], running: null });
  assert.deepEqual(plan, { ids: [], label: 'Segment 0 unsegmented', note: 'All visible studies are segmented', enabled: false });
});

test('planBatch with no visible real row is disabled with Nothing to segment', () => {
  assert.deepEqual(planBatch({ visible: [demo('SP-0042')], selected: [], running: null }),
    { ids: [], label: 'Segment 0 unsegmented', note: 'Nothing to segment', enabled: false });
  assert.deepEqual(planBatch({ visible: [], selected: null, running: null }),
    { ids: [], label: 'Segment 0 unsegmented', note: 'Nothing to segment', enabled: false });
});

test('planBatch with ticked rows runs the unsegmented ticked ones and notes the segmented ones', () => {
  const visible = [film('SP-1'), segmented('SP-2'), film('SP-3'), segmented('SP-4'), film('SP-5')];
  const plan = planBatch({ visible, selected: ['SP-5', 'SP-2', 'SP-1', 'SP-4'], running: null });
  assert.deepEqual(plan, { ids: ['SP-1', 'SP-5'], label: 'Segment 2 selected', note: '2 already segmented', enabled: true });
});

test('planBatch with only unsegmented rows ticked has no note', () => {
  const plan = planBatch({ visible: [film('SP-1'), film('SP-2')], selected: ['SP-2'], running: null });
  assert.deepEqual(plan, { ids: ['SP-2'], label: 'Segment 1 selected', note: null, enabled: true });
});

test('planBatch with only segmented rows ticked is disabled and says so', () => {
  const plan = planBatch({ visible: [film('SP-1'), segmented('SP-2')], selected: ['SP-2'], running: null });
  assert.deepEqual(plan, { ids: [], label: 'Segment 0 selected', note: 'All selected studies are segmented', enabled: false });
});

test('planBatch ignores a tick that is not visible and a tick on a demo row (decision 38, decision 16)', () => {
  const visible = [film('SP-1'), demo('SP-0042')];
  const plan = planBatch({ visible, selected: ['SP-9', 'SP-0042'], running: null });
  // Nothing VISIBLE and real is ticked, so it is the nothing-ticked case over the visible rows.
  assert.deepEqual(plan, { ids: ['SP-1'], label: 'Segment 1 unsegmented', note: null, enabled: true });
});

test('planBatch is disabled with the wait note while a single run is in flight, whatever the rows say', () => {
  const visible = [film('SP-1'), film('SP-2')];
  assert.deepEqual(planBatch({ visible, selected: [], running: 'SP-1' }),
    { ids: ['SP-1', 'SP-2'], label: 'Segment 2 unsegmented', note: WAIT_FOR_RUN, enabled: false });
  assert.deepEqual(planBatch({ visible, selected: ['SP-2'], running: 'SP-1' }),
    { ids: ['SP-2'], label: 'Segment 1 selected', note: WAIT_FOR_RUN, enabled: false });
  assert.equal(WAIT_FOR_RUN, 'Wait for the current segmentation to finish');
  assert.equal(WAIT_FOR_BATCH, 'Wait for the batch to finish');
});

test('planBatch never mutates its inputs', () => {
  const visible = [film('SP-1')];
  const selected = ['SP-1'];
  planBatch({ visible, selected, running: null });
  assert.deepEqual(visible, [film('SP-1')]);
  assert.deepEqual(selected, ['SP-1']);
});

// ---------------------------------------------------------------------------
// the batch object (spec §8.1)
// ---------------------------------------------------------------------------

test('newBatch copies the ids and starts at zero', () => {
  const ids = ['SP-1', 'SP-2'];
  const batch = newBatch(ids);
  assert.deepEqual(batch, { ids: ['SP-1', 'SP-2'], done: 0, failed: [], warnings: [], skipped: 0, stopping: false });
  assert.notEqual(batch.ids, ids);
});

test('advance counts every kind of outcome in done and files each where it belongs, as a new object', () => {
  const b0 = newBatch(['SP-1', 'SP-2', 'SP-3', 'SP-4']);
  const b1 = advance(b0, { ok: true, id: 'SP-1', name: 'SP-1' });
  const b2 = advance(b1, { ok: false, id: 'SP-2', name: 'S002', reason: 'file not found' });
  const b3 = advance(b2, { skipped: true });
  const b4 = advance(b3, { ok: true, id: 'SP-4', name: 'S004', warning: 'the segmentation images could not be stored: disk full' });
  assert.equal(b0.done, 0);
  assert.equal(b4.done, 4);
  assert.deepEqual(b4.failed, [{ id: 'SP-2', name: 'S002', reason: 'file not found' }]);
  assert.deepEqual(b4.warnings, [{ id: 'SP-4', name: 'S004', reason: 'the segmentation images could not be stored: disk full' }]);
  assert.equal(b4.skipped, 1);
  assert.notEqual(b4, b3);
  assert.notEqual(b4.failed, b3.failed);
  assert.deepEqual(b3.failed, b2.failed, 'an earlier batch is never mutated');
});

test('withStopping sets the flag on a new object', () => {
  const b = newBatch(['SP-1']);
  const stopped = withStopping(b);
  assert.equal(stopped.stopping, true);
  assert.equal(b.stopping, false);
  assert.notEqual(stopped, b);
});

test('isQueued is true from the film whose turn is starting to the last, false before and for a null batch', () => {
  const b = advance(advance(newBatch(['SP-1', 'SP-2', 'SP-3']), { ok: true, id: 'SP-1', name: 'SP-1' }), { skipped: true });
  assert.equal(b.done, 2);
  assert.equal(isQueued(b, 'SP-1'), false);
  assert.equal(isQueued(b, 'SP-2'), false);
  assert.equal(isQueued(b, 'SP-3'), true);
  assert.equal(isQueued(b, 'SP-9'), false);
  assert.equal(isQueued(null, 'SP-3'), false);
  assert.equal(isQueued(newBatch(['SP-3']), 'SP-3'), true);
});

// ---------------------------------------------------------------------------
// texts (spec §7.4, §9)
// ---------------------------------------------------------------------------

test('progressText and sidebarText count attempts, and say STOPPING once Stop is pressed', () => {
  const b = advance(advance(newBatch(new Array(12).fill(0).map((_, i) => `SP-${i}`)), { ok: true, id: 'SP-0', name: 'a' }),
    { ok: false, id: 'SP-1', name: 'b', reason: 'x' });
  assert.equal(progressText(b), '2 of 12 done');
  assert.equal(sidebarText(b), '2 OF 12 DONE');
  assert.equal(progressText(withStopping(b)), STOPPING_TEXT);
  assert.equal(STOPPING_TEXT, 'Stopping after this film\u2026');
  assert.equal(sidebarText(withStopping(b)), 'STOPPING');
  assert.equal(progressText(newBatch(['SP-1'])), '0 of 1 done');
});

test('batchMessage for a clean run, the singular, and a stopped run', () => {
  let b = newBatch(['SP-1', 'SP-2']);
  b = advance(b, { ok: true, id: 'SP-1', name: 'a' });
  b = advance(b, { ok: true, id: 'SP-2', name: 'b' });
  assert.equal(batchMessage(b), 'Segmented 2 of 2 films.');
  assert.equal(batchMessage(advance(newBatch(['SP-1']), { ok: true, id: 'SP-1', name: 'a' })), 'Segmented 1 of 1 film.');
  const stopped = withStopping(advance(newBatch(['SP-1', 'SP-2']), { ok: true, id: 'SP-1', name: 'a' }));
  assert.equal(batchMessage(stopped), 'Segmented 1 of 2 films, then stopped.');
  // Stop pressed during the last film: every film ran, so nothing was stopped.
  assert.equal(batchMessage(withStopping(b)), 'Segmented 2 of 2 films.');
});

test('batchMessage adds one clause per thing left out, only when nonzero, names capped at five then an ellipsis', () => {
  let b = newBatch(['SP-1', 'SP-2', 'SP-3', 'SP-4', 'SP-5', 'SP-6', 'SP-7', 'SP-8', 'SP-9']);
  b = advance(b, { ok: true, id: 'SP-1', name: 'S001' });
  for (const n of [2, 3, 4, 5, 6, 7]) b = advance(b, { ok: false, id: `SP-${n}`, name: `S00${n}`, reason: n === 2 ? 'file not found' : 'Segmentation failed with status 500.' });
  b = advance(b, { ok: true, id: 'SP-8', name: 'S008', warning: 'the segmentation images could not be stored: EACCES' });
  b = advance(b, { skipped: true });
  assert.equal(batchMessage(b),
    'Segmented 2 of 9 films.'
    + ' \u00B7 6 could not be segmented: S002 (file not found), S003 (Segmentation failed with status 500.), S004 (Segmentation failed with status 500.), S005 (Segmentation failed with status 500.), S006 (Segmentation failed with status 500.), \u2026'
    + ' \u00B7 1 segmented without stored images: S008 (the segmentation images could not be stored: EACCES)'
    + ' \u00B7 1 skipped (deleted, or segmented meanwhile)');
});

// ---------------------------------------------------------------------------
// createBatchDriver (spec §8.2)
// ---------------------------------------------------------------------------

// A fake store with the getState/setState contract of renderer/store.js, and a segment() whose
// promises the test resolves or rejects by hand. `inFlight` proves the loop is strictly serial.
function harness({ studies, persistence = null, running = null }) {
  let state = { studies, running, batch: null };
  const calls = [];
  const toasts = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const driver = createBatchDriver({
    segment: (id) => new Promise((resolve, reject) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      calls.push({
        id,
        resolve: (value) => { inFlight -= 1; resolve(value); },
        reject: (error) => { inFlight -= 1; reject(error); },
      });
    }),
    getState: () => state,
    setState: (patchOrFn) => { state = { ...state, ...(typeof patchOrFn === 'function' ? patchOrFn(state) : patchOrFn) }; },
    showToast: (message) => toasts.push(message),
    persistenceDisabledReason: () => persistence,
  });
  return {
    driver, calls, toasts,
    get state() { return state; },
    get maxInFlight() { return maxInFlight; },
    patch: (patch) => { state = { ...state, ...patch }; },
  };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('startBatch sets state.batch before its first await, runs the ids one at a time in order, folds each outcome, then clears the batch and toasts once', async () => {
  const h = harness({ studies: [film('SP-1'), film('SP-2'), film('SP-3')] });
  const started = h.driver.startBatch(['SP-1', 'SP-2', 'SP-3']);
  assert.deepEqual(h.state.batch, { ids: ['SP-1', 'SP-2', 'SP-3'], done: 0, failed: [], warnings: [], skipped: 0, stopping: false });
  await tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].id, 'SP-1');
  h.calls[0].resolve({ ok: true });
  await tick();
  assert.equal(h.state.batch.done, 1);
  assert.equal(h.calls.length, 2, 'the second film starts only after the first outcome');
  h.calls[1].resolve({ ok: false, reason: 'file not found' });
  await tick();
  assert.deepEqual(h.state.batch.failed, [{ id: 'SP-2', name: 'SP-2', reason: 'file not found' }]);
  h.calls[2].resolve({ ok: true, warning: 'the segmentation images could not be stored: EACCES' });
  await tick();
  assert.equal(await started, true);
  assert.equal(h.state.batch, null);
  assert.equal(h.maxInFlight, 1);
  assert.deepEqual(h.toasts, ['Segmented 2 of 3 films. \u00B7 1 could not be segmented: SP-2 (file not found) \u00B7 1 segmented without stored images: SP-3 (the segmentation images could not be stored: EACCES)']);
});

test('startBatch refuses while a batch or a single run is up, and for an empty list', async () => {
  const h = harness({ studies: [film('SP-1')] });
  assert.equal(await h.driver.startBatch([]), false);
  h.patch({ running: 'SP-1' });
  assert.equal(await h.driver.startBatch(['SP-1']), false);
  h.patch({ running: null });
  const first = h.driver.startBatch(['SP-1']);
  await tick();
  assert.equal(await h.driver.startBatch(['SP-1']), false, 'a second batch is refused while one runs');
  assert.equal(h.calls.length, 1);
  h.calls[0].resolve({ ok: true });
  await first;
  assert.equal(h.state.batch, null);
  assert.deepEqual(h.toasts, ['Segmented 1 of 1 film.']);
});

test('stopBatch ends the loop after the film in flight; the toast says so', async () => {
  const h = harness({ studies: [film('SP-1'), film('SP-2'), film('SP-3')] });
  const run = h.driver.startBatch(['SP-1', 'SP-2', 'SP-3']);
  await tick();
  h.driver.stopBatch();
  assert.equal(h.state.batch.stopping, true);
  assert.equal(h.calls.length, 1, 'nothing new starts');
  h.calls[0].resolve({ ok: true });
  await run;
  assert.equal(h.calls.length, 1);
  assert.equal(h.state.batch, null);
  assert.deepEqual(h.toasts, ['Segmented 1 of 3 films, then stopped.']);
  h.driver.stopBatch();
  assert.equal(h.state.batch, null, 'stopBatch with no batch is a no-op');
});

test('a film deleted, reused under its id, or segmented before its turn is skipped and counted', async () => {
  const h = harness({ studies: [film('SP-1'), film('SP-2'), film('SP-3'), film('SP-4')] });
  const run = h.driver.startBatch(['SP-1', 'SP-2', 'SP-3', 'SP-4']);
  await tick();
  // While SP-1 runs: SP-2 deleted; SP-3 deleted and its id reused by a new film; SP-4 segmented.
  h.patch({
    studies: [
      film('SP-1'), film('SP-3', { addedAt: '2026-09-08T00:00:01.000Z' }), segmented('SP-4'),
    ],
  });
  h.calls[0].resolve({ ok: true });
  await run;
  assert.equal(h.calls.length, 1, 'only SP-1 was segmented');
  assert.deepEqual(h.toasts, ['Segmented 1 of 4 films. \u00B7 3 skipped (deleted, or segmented meanwhile)']);
});

test('a rejecting segment() is counted as a failure with its message, and the batch goes on', async () => {
  const h = harness({ studies: [film('SP-1'), film('SP-2')] });
  const run = h.driver.startBatch(['SP-1', 'SP-2']);
  await tick();
  h.calls[0].reject(new Error('backend gone'));
  await tick();
  assert.equal(h.calls.length, 2);
  h.calls[1].resolve({ ok: true });
  await run;
  assert.deepEqual(h.toasts, ['Segmented 1 of 2 films. \u00B7 1 could not be segmented: SP-1 (backend gone)']);
});

test('with persistence disabled the driver toasts the warning once, at the start, and nothing per film', async () => {
  const h = harness({ studies: [film('SP-1'), film('SP-2')], persistence: 'the saved studies could not be read' });
  const run = h.driver.startBatch(['SP-1', 'SP-2']);
  assert.deepEqual(h.toasts, [UNSAVED_BATCH]);
  assert.equal(UNSAVED_BATCH, 'Studies are not being saved this session; batch results will be lost when the app closes.');
  await tick();
  h.calls[0].resolve({ ok: true });
  await tick();
  h.calls[1].resolve({ ok: true });
  await run;
  assert.deepEqual(h.toasts, [UNSAVED_BATCH, 'Segmented 2 of 2 films.']);
});

test('a failure names the study by its display name', async () => {
  const h = harness({ studies: [film('SP-1', { name: 'Smith pre-op' })] });
  const run = h.driver.startBatch(['SP-1']);
  await tick();
  h.calls[0].resolve({ ok: false, reason: 'file not found' });
  await run;
  assert.deepEqual(h.toasts, ['Segmented 0 of 1 film. \u00B7 1 could not be segmented: Smith pre-op (file not found)']);
});
```

Add to `test/store.test.js`, directly after `assert.equal(state.runStage, null);`:

```js
  assert.equal(state.batch, null);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/batch.test.js test/store.test.js`
Expected: `test/batch.test.js` fails to load (`Cannot find module '../renderer/data/batch.js'`); the store test fails on `state.batch` (`undefined !== null`).

- [ ] **Step 3: Write the module and the store key**

Create `renderer/data/batch.js`:

```js
/**
 * Pure logic for batch segmentation (docs/superpowers/specs/2026-09-08-batch-segmentation-design.md,
 * "the spec" below): which films a click on the Find tab's segment button runs and what the button
 * says (spec 7.3), the batch object's transitions (8.1), the progress and sidebar texts (7.4, 9),
 * the closing toast (9), and the driver loop over injected dependencies (8.2). No DOM.
 * renderer/batch.js is the one wiring of createBatchDriver to the real store; screens/studies.js
 * renders what planBatch returns; components/viewer.js reads isQueued; test/batch.test.js pins it.
 */
import { selectedVisible, isSegmented } from './parameters.js';
import { studyName } from './labels.js';

// The toast's naming rule, as data/pairing.js applies it: up to five names, then an ellipsis.
const NAME_CAP = 5;
const ELLIPSIS = '\u2026';
const SEP = ' \u00B7 ';

export const STOPPING_TEXT = 'Stopping after this film\u2026';
export const WAIT_FOR_RUN = 'Wait for the current segmentation to finish';
export const WAIT_FOR_BATCH = 'Wait for the batch to finish';
export const UNSAVED_BATCH = 'Studies are not being saved this session; batch results will be lost when the app closes.';

// What the segment button runs and says (spec 7.3). `visible` is the Find tab's rows after the
// search and the two filters, in table order; `selected` is state.paramSelected; `running` is
// state.running. Only real, unsegmented, visible rows are ever run; "ticked" means ticked AND
// visible (HANDOFF decision 38). A single run in flight disables the button whatever the rows say.
export function planBatch({ visible, selected, running }) {
  const real = (visible ?? []).filter((study) => study.source === 'real');
  const chosen = selectedVisible(real, selected);
  const pool = chosen.length > 0 ? chosen : real;
  const ids = pool.filter((study) => !isSegmented(study)).map((study) => study.id);
  const already = pool.length - ids.length;
  const label = chosen.length > 0 ? `Segment ${ids.length} selected` : `Segment ${ids.length} unsegmented`;
  let note = null;
  if (running) {
    note = WAIT_FOR_RUN;
  } else if (chosen.length > 0) {
    if (ids.length === 0) note = 'All selected studies are segmented';
    else if (already > 0) note = `${already} already segmented`;
  } else if (ids.length === 0) {
    note = real.length === 0 ? 'Nothing to segment' : 'All visible studies are segmented';
  }
  return { ids, label, note, enabled: ids.length > 0 && !running };
}

// The batch object (spec 8.1). Every transition returns a NEW object: the store's gates compare
// by reference. `done` counts every turn that ended, so the count always reaches the total.
export function newBatch(ids) {
  return { ids: [...ids], done: 0, failed: [], warnings: [], skipped: 0, stopping: false };
}

// One turn ended. `outcome` is { skipped: true }, { ok: true, id, name, warning? } or
// { ok: false, id, name, reason }.
export function advance(batch, outcome) {
  const next = { ...batch, done: batch.done + 1, failed: [...batch.failed], warnings: [...batch.warnings] };
  if (outcome.skipped) {
    next.skipped = batch.skipped + 1;
  } else if (outcome.ok) {
    if (outcome.warning) next.warnings.push({ id: outcome.id, name: outcome.name, reason: outcome.warning });
  } else {
    next.failed.push({ id: outcome.id, name: outcome.name, reason: outcome.reason });
  }
  return next;
}

export function withStopping(batch) {
  return { ...batch, stopping: true };
}

// A film is "waiting in the batch" (spec 9) from the one whose turn is starting -- index `done`;
// state.running is what says it is in flight -- to the last. A film whose turn has ended sits
// below `done` and is not waiting.
export function isQueued(batch, studyId) {
  if (!batch) return false;
  return batch.ids.indexOf(studyId) >= batch.done;
}

// The filter bar's progress text (spec 7.4) and the Studies nav row's sublabel (spec 9).
export function progressText(batch) {
  return batch.stopping ? STOPPING_TEXT : `${batch.done} of ${batch.ids.length} done`;
}

export function sidebarText(batch) {
  return batch.stopping ? 'STOPPING' : `${batch.done} OF ${batch.ids.length} DONE`;
}

function names(entries) {
  return entries.slice(0, NAME_CAP).map((entry) => `${entry.name} (${entry.reason})`).join(', ')
    + (entries.length > NAME_CAP ? `, ${ELLIPSIS}` : '');
}

// The closing toast (spec 9): what was segmented, then one clause per thing that was not, each
// only when nonzero. "then stopped" only when Stop ended the batch before its last film.
export function batchMessage(batch) {
  const total = batch.ids.length;
  const ok = batch.done - batch.failed.length - batch.skipped;
  const stopped = batch.stopping && batch.done < total;
  let text = `Segmented ${ok} of ${total} ${total === 1 ? 'film' : 'films'}${stopped ? ', then stopped' : ''}.`;
  if (batch.failed.length > 0) text += `${SEP}${batch.failed.length} could not be segmented: ${names(batch.failed)}`;
  if (batch.warnings.length > 0) text += `${SEP}${batch.warnings.length} segmented without stored images: ${names(batch.warnings)}`;
  if (batch.skipped > 0) text += `${SEP}${batch.skipped} skipped (deleted, or segmented meanwhile)`;
  return text;
}

// The loop (spec 8.2), over injected dependencies so it is tested without a DOM, the way
// viewer/measure-queue.js takes an injected `measure`. `segment(studyId)` is the analysis screen's
// run core in batch mode: it resolves { ok: true, warning? } or { ok: false, reason } and promises
// never to reject; a rejection is still counted as a failure so state.batch can never be left
// stuck. Strictly serial: the next film starts only after the previous outcome is folded in.
export function createBatchDriver({ segment, getState, setState, showToast, persistenceDisabledReason }) {
  // Each id's addedAt at the click. Ids are max+1, so a deleted id is reused by the next film
  // added; the record's identity is addedAt, which a reused id never carries.
  const identity = new Map();

  async function startBatch(ids) {
    const state = getState();
    if (state.batch || state.running || !Array.isArray(ids) || ids.length === 0) return false;
    identity.clear();
    for (const id of ids) {
      const study = state.studies.find((item) => item.id === id);
      identity.set(id, study ? study.addedAt : null);
    }
    // Before the first await, so nothing can start a run or a second batch in between.
    setState({ batch: newBatch(ids) });
    if (persistenceDisabledReason()) showToast(UNSAVED_BATCH);
    for (const id of ids) {
      const study = getState().studies.find((item) => item.id === id);
      let outcome;
      if (!study || study.addedAt !== identity.get(id) || study.measurements != null) {
        outcome = { skipped: true };
      } else {
        let result;
        try {
          result = await segment(id);
        } catch (error) {
          result = { ok: false, reason: error && error.message ? error.message : String(error) };
        }
        outcome = { ...result, id, name: studyName(study) };
      }
      setState((current) => ({ batch: advance(current.batch, outcome) }));
      if (getState().batch.stopping) break;
    }
    const finished = getState().batch;
    setState({ batch: null });
    showToast(batchMessage(finished));
    return true;
  }

  function stopBatch() {
    if (!getState().batch) return;
    setState((current) => ({ batch: withStopping(current.batch) }));
  }

  return { startBatch, stopBatch };
}
```

In `renderer/store.js`, directly after the line `  runStage: null,` add:

```js
  // (2026-09-08, batch spec 8.1) The running batch, or null: { ids, done, failed, warnings, skipped,
  // stopping }. Replaced wholesale on every change by renderer/batch.js; never persisted.
  batch: null,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/batch.test.js test/store.test.js`
Expected: all pass (23 tests in `batch.test.js`; the store suite unchanged in count).

Run: `node --test test/*.test.js`
Expected: 425/425 (402 + 23).

- [ ] **Step 5: Byte-check and commit**

Run: `git diff -- renderer test | grep -nP '[^\x00-\x7F]'`
Expected: nothing (every non-ASCII glyph in the two JS files is written as an escape).

```bash
git add renderer/data/batch.js test/batch.test.js renderer/store.js test/store.test.js
git commit -m "feat: batch planner, transitions, texts and driver factory in data/batch.js; state.batch" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `matchesLocation` in `data/parameters.js`; the shared checkbox component

**Files:**
- Modify: `renderer/data/parameters.js` (the private `matchesWorkspace` is at ~line 80; `filterParameters` at ~line 259)
- Modify: `test/parameters.test.js` (append)
- Create: `renderer/components/checkbox.js`
- Modify: `renderer/screens/parameters.js` (delete the local `CHECK_SVG` and `checkbox()`, ~lines 45–68; add one import)

**Interfaces:**
- Produces: `matchesLocation(study, filters)` → `boolean` — true when `filters.workspace` (a root, `HAND_ADDED`, or null/absent) and `filters.folder` (a folder label or null/absent) both keep the study; exactly the workspace-and-folder half of `filterParameters`.
- Produces: `checkbox({ key, keyAttr = 'data-param-key', label, checked, note, ariaLabel, indeterminate, onChange, onClick })` → `HTMLLabelElement` from `renderer/components/checkbox.js`, the grid's control unchanged in shape; `onClick` is bound on the label.

- [ ] **Step 1: Write the failing test**

Append to `test/parameters.test.js` (add `matchesLocation` to the import list at the top of the file):

```js
// ---------------------------------------------------------------------------
// matchesLocation (batch spec §7.1): the Find tab filters by these two alone
// ---------------------------------------------------------------------------

test('matchesLocation is the workspace and folder halves of filterParameters, and a missing filter is no filter', () => {
  const rows = [
    study({ id: 'SP-1000' }),                                                              // Fusion2025 / pre-op
    study({ id: 'SP-1001', filePath: `${ROOT}\\post-op\\b.png` }),                          // Fusion2025 / post-op
    study({ id: 'SP-1002', workspaceFolder: 'C:\\films\\Other', filePath: 'C:\\films\\Other\\pre-op\\c.png' }),
    study({ id: 'SP-1003', workspaceFolder: null, filePath: 'C:\\Users\\me\\Desktop\\d.png' }), // added by hand
    study({ id: 'SP-1004', workspaceFolder: null, filePath: null }),                        // no path at all
  ];
  const keep = (filters) => rows.filter((row) => matchesLocation(row, filters)).map((row) => row.id);
  assert.deepEqual(keep({}), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003', 'SP-1004']);
  assert.deepEqual(keep(null), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003', 'SP-1004']);
  assert.deepEqual(keep({ workspace: ROOT }), ['SP-1000', 'SP-1001']);
  assert.deepEqual(keep({ workspace: ROOT, folder: 'pre-op' }), ['SP-1000']);
  assert.deepEqual(keep({ folder: 'pre-op' }), ['SP-1000', 'SP-1002']);
  assert.deepEqual(keep({ workspace: HAND_ADDED }), ['SP-1003', 'SP-1004']);
  assert.deepEqual(keep({ workspace: HAND_ADDED, folder: 'Desktop' }), ['SP-1003']);
  // Agreement with the grid's filter, with every other filter open.
  const open = { ...DEFAULT_FILTERS, segmentedOnly: false };
  for (const filters of [{ workspace: ROOT }, { workspace: ROOT, folder: 'post-op' }, { folder: 'pre-op' }, { workspace: HAND_ADDED }]) {
    assert.deepEqual(keep(filters), filterParameters(rows, { ...open, ...filters }).map((row) => row.id), JSON.stringify(filters));
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/parameters.test.js`
Expected: FAIL — `matchesLocation` is not exported (`SyntaxError: The requested module ... does not provide an export named 'matchesLocation'`).

- [ ] **Step 3: Export the predicate and use it in `filterParameters`**

In `renderer/data/parameters.js`, directly after the private `matchesWorkspace` function, add:

```js
// The workspace and folder halves of filterParameters, as one predicate (batch spec 7.1): the Find
// tab's list filters by these two alone and must agree with the grid about which folder a film is
// in. `filters` may be partial or null; a missing key is no filter.
export function matchesLocation(study, filters) {
  const f = filters ?? {};
  return matchesWorkspace(study, f.workspace ?? null) && (!f.folder || folderLabel(study) === f.folder);
}
```

In `filterParameters`, replace the two conditions

```js
  const kept = studies.filter((study) => matchesWorkspace(study, f.workspace)
    && (!f.folder || folderLabel(study) === f.folder)
    && (!f.segmentedOnly || isSegmented(study))
```

with

```js
  const kept = studies.filter((study) => matchesLocation(study, f)
    && (!f.segmentedOnly || isSegmented(study))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/parameters.test.js`
Expected: PASS, one more test than before.

- [ ] **Step 5: Create the shared checkbox component**

Create `renderer/components/checkbox.js`:

```js
/**
 * The tick box both tabs of the Studies screen build (batch spec 7.2): a hidden native checkbox
 * inside a <label>, a drawn box beside it, and optionally a text label with a note. Lifted from
 * screens/parameters.js unchanged in shape, so the grid's row ticks, its select-all and the Find
 * tab's are one control. `keyAttr` names the focus-restore attribute (data-param-key on the grid,
 * data-find-key on the list); `onClick` is bound on the <label>, which is where a click lands --
 * the Find tab uses it to stop the row's own click from opening the study.
 */
import { el } from '../dom.js';

const CHECK_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 7"></path></svg>';

// Real booleans on purpose: el() assigns `checked` as a property, and the string 'false' is true.
// `label: null` builds the bare tick box the tables use (row select and select-all), which carries
// its name in `ariaLabel` instead: a visible label in the STUDY column would repeat the row's own
// name in every row. The hidden input stays inside the <label> so a click anywhere on the box --
// including a synthetic click at the 1x1 input's own rect, which is how the smoke suites drive it
// -- lands on the label and toggles the control.
export function checkbox({ key, keyAttr = 'data-param-key', label, checked, note, ariaLabel, indeterminate, onChange, onClick }) {
  const input = el('input', {
    type: 'checkbox', checked, [keyAttr]: key, onChange,
    ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
  });
  // A property, not an attribute, and it has no markup form: it must be assigned on the node.
  if (indeterminate === true) input.indeterminate = true;
  return el('label', {
    class: `checkbox-row param-check${label === null ? ' param-pick' : ''}`,
    ...(onClick ? { onClick } : {}),
  },
    input,
    el('span', { class: 'checkbox-box', innerHTML: CHECK_SVG }),
    label === null ? null
      : el('span', { class: 'param-check-label' }, label, note ? el('span', { class: 'param-check-note' }, note) : null));
}
```

In `renderer/screens/parameters.js`: delete the `const CHECK_SVG = ...` line and the whole local `function checkbox({ key, label, checked, note, ariaLabel, indeterminate, onChange }) { ... }` with the comment block above it; add, after the `import { showToast } from '../components/toast.js';` line:

```js
import { checkbox } from '../components/checkbox.js';
```

Every call site in the file passes an object without `keyAttr` or `onClick`, so nothing else changes.

- [ ] **Step 6: Verify the grid is unchanged: unit and the Parameters smoke suite**

Run: `node --test test/*.test.js`
Expected: 426/426.

Run, in the foreground, capturing to files (the variable in the same command as the launch):

```bash
SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/task2-launch.txt 2>&1
node tools/smoke/smoke-parameters.mjs > tools/smoke/out/task2-parameters.txt 2>&1
node tools/smoke/cdp.mjs --quit
```

Expected: the last line of `tools/smoke/out/task2-parameters.txt` reads `58/58 checks passed`. A file with no lines means the suite threw: re-run it bare and read the stack.

- [ ] **Step 7: Byte-check and commit**

Run: `git diff -- renderer | grep -nP '[^\x00-\x7F]'`
Expected: nothing.

```bash
git add renderer/data/parameters.js test/parameters.test.js renderer/components/checkbox.js renderer/screens/parameters.js
git commit -m "feat: matchesLocation in data/parameters.js; the grid's checkbox lifted to components/checkbox.js" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The run core — `segmentStudy` in `screens/analysis.js`; the viewer's card and gating

**Files:**
- Modify: `renderer/screens/analysis.js` — `filmBytes` (~line 121), the module-scope counters (~line 74), `releaseStudy` (~line 63), `runSegmentation` (~lines 150–266, replaced by `segmentStudy`), `restoreFilm` (~lines 273–319, two guard lines), the run handler in `render()` (~line 450)
- Modify: `renderer/components/viewer.js` — `describeCard` (~lines 704–741), the `rerunButton.disabled` line (~line 899)
- Modify: `tools/smoke/smoke-persist.mjs:301-302` (the `QUEUED` expectation)

**Interfaces:**
- Consumes: `isQueued(batch, studyId)`, `WAIT_FOR_BATCH`, `WAIT_FOR_RUN` from `renderer/data/batch.js` (Task 1); `state.batch`.
- Produces: `export async function segmentStudy(studyId, { batch = false } = {})` → `Promise<{ ok: true, warning?: string } | { ok: false, reason: string }>`, never rejects; `state.running` set and cleared inside it for both modes. In batch mode: no picker, no toast, no image-cache write unless the study is on screen, bytes not parked.

This is the code a human gated in plans 05 and 06. Every existing `revision`/`addedAt` check stays; the interactive path's observable behaviour is unchanged. Read `runSegmentation` and `restoreFilm` in full before editing.

- [ ] **Step 1: The module-scope additions and `filmBytes`**

In `renderer/screens/analysis.js`, replace

```js
let runRevision = 0;
```

with

```js
let runRevision = 0;

// Runs started per study, for restoreFilm's guard (batch spec 8.3): a restore is dropped only when
// a run for the SAME study started meanwhile. runRevision above is global -- one run at a time --
// and a batch bumps it at every film's turn, which would drop every restore caught in that window
// and leave the card reading LOADING.
const runsByStudy = new Map();
```

In `releaseStudy`, add `runsByStudy.delete(studyId);` directly after `filePayloads.delete(studyId);`.

Replace the whole `filmBytes` function with:

```js
// The film bytes: this session's payload, else the file at filePath, else null (moved or never had
// a path). `park` keeps what was read for a later re-run; a batch passes false (batch spec 8.3), so
// forty films' bytes are not held for the session.
async function filmBytes(study, { park = true } = {}) {
  const cached = filePayloads.get(study.id);
  if (cached) return cached;
  if (!study.filePath) return null;
  const bytes = await readFile(study.filePath);
  if (bytes && park) filePayloads.set(study.id, bytes);
  return bytes;
}
```

- [ ] **Step 2: Replace `runSegmentation` with the exported core**

Replace the whole `async function runSegmentation(studyId) { ... }` (from its `async function` line to its closing brace, ~lines 150–266) with:

```js
// The one path from a film to a committed record, for the viewer's button (interactive) and for a
// batch (batch spec 8.3). Returns an outcome and never throws. `state.running` is set and cleared
// here for both. In batch mode there is no relocate picker, no toast, no image-cache write for a
// study that is not on screen, and the bytes read from disk are not parked; every message the
// interactive path toasts becomes the outcome instead. Interactive callers ignore the outcome.
export async function segmentStudy(studyId, { batch = false } = {}) {
  // A relocate picker is already open for a run that has not started; a second click must not
  // raise a second native dialog. It is not a run, so it never claims one (interactive only: a
  // batch never opens the picker).
  if (!batch && locating) return { ok: false, reason: 'A file dialog is already open.' };
  // The !study return sits ABOVE the revision bump on purpose: bumping and then returning
  // early invalidates an in-flight run, whose completion would then return at a revision
  // check WITHOUT clearing `running` -- and every card would read RUNNING forever.
  const study = getState().studies.find((s) => s.id === studyId);
  if (!study) return { ok: false, reason: 'The study is no longer in the library.' };
  // The record's identity, carried alongside its id for the checks after every await below.
  // Ids are max+1, so a deleted id is reused by the next film added; addedAt is not.
  const addedAt = study.addedAt;
  const revision = ++runRevision;
  runsByStudy.set(studyId, (runsByStudy.get(studyId) ?? 0) + 1);
  let data = null;
  let readError = null;
  if (!batch) locating = true;
  try {
    data = await filmBytes(study, { park: !batch });
    if (!data && !batch) data = await relocateFilm(study);
  } catch (error) {
    readError = error;
  } finally {
    if (!batch) locating = false;
  }
  if (readError) {
    const reason = `Could not read ${study.fileName}: ${readError.message}`;
    if (!batch) showToast(reason);
    return { ok: false, reason };
  }
  // Spec 10: in a batch a missing film is a named failure; the record is untouched and the user
  // relocates it from this screen, where the picker still opens.
  if (!data) return { ok: false, reason: 'file not found' };
  if (revision !== runRevision) return { ok: false, reason: 'superseded' };
  // The picker is modeless and `locating` is this module's own, so a batch can have started while
  // it was open (batch spec 8.3). Running now would set `running` over the batch's id and put a
  // second /predict in flight. The record and the payload map already carry the relocated film;
  // the run itself waits for the user.
  if (!batch && (getState().batch || getState().running)) {
    showToast(getState().batch ? WAIT_FOR_BATCH : WAIT_FOR_RUN);
    return { ok: false, reason: 'another run is in flight' };
  }
  // After a relocation the record carries the NEW name; the `study` binding above is stale.
  // The filename matters: its extension drives the backend's decoder, so relocating a .jpg
  // to a .png has to send the new name with the new bytes.
  const current = getState().studies.find((s) => s.id === studyId);
  // Deleted while the bytes were being read or the relocate picker was open: nothing runs
  // for a record that is gone. The read above (filmBytes/relocateFilm) may have re-parked
  // the bytes under this id AFTER releaseStudy cleared them, so drop them again -- the next
  // film can reuse the id. runRevision is deliberately not bumped anywhere on delete.
  // `addedAt` as well as existence, because that reuse may already have happened: a record
  // with this id can be a DIFFERENT study, and running this study's bytes and measurements
  // onto it would silently replace the film the user just added.
  if (!current || current.addedAt !== addedAt) {
    filePayloads.delete(studyId);
    return { ok: false, reason: 'The study is no longer in the library.' };
  }

  // The id, not a boolean: with a Studies list the user can open study B while A's /predict
  // is in flight, and the viewer and the list have to be able to ask WHICH study is running.
  // Every existing truthiness check still reads "a run is in flight" (one run at a time).
  setState({ running: studyId });
  let warning = null;
  try {
    const response = await predict({
      name: current.fileName,
      data,
      modality: 'xray',
      bodyPart: 'lumbar',
      view: 'lateral',
      models: getState().models,
    });
    if (revision !== runRevision) return { ok: false, reason: 'superseded' };

    const images = await loadStudyImages(response);
    if (revision !== runRevision) {
      disposeStudyImages(images);
      return { ok: false, reason: 'superseded' };
    }

    const thumbnail = thumbnailDataUri(images.image);

    // The sidecar first, then the record: a record that says "segmented" must point at a film
    // that exists. A failed sidecar write is reported and the run still completes -- the study
    // opens to FILM UNAVAILABLE next time, and a re-run recreates it. Neither toast starts with
    // "Could not": tools/smoke/run-and-wait.js treats that prefix as a failed run. In a batch the
    // persistence notice was raised once at the start, and the sidecar failure is the outcome's
    // warning, one clause in the closing toast.
    if (persistenceDisabledReason()) {
      if (!batch) showToast('Studies are not being saved this session, so the segmentation images were not stored.');
    } else {
      try {
        await savePrediction(studyId, response);
      } catch (error) {
        warning = `the segmentation images could not be stored: ${error.message}`;
        if (!batch) showToast(`Saved the measurements, but ${warning}`);
      }
    }
    if (revision !== runRevision) { disposeStudyImages(images); return { ok: false, reason: 'superseded' }; }

    // ORDER MATTERS (BD-6). setState notifies synchronously, so the module-scope
    // subscription's update() runs INSIDE the setState call below and asks the viewer to
    // repaint. The images have to be in place first, or that first paint sizes nothing
    // and draws nothing: every measurement populates while the stage stays black until
    // an unrelated click happens to fire the next update.
    //
    // Hand off to the live viewer only if it is still showing the study this run was
    // for. The user may have navigated to a different study (or back to Studies) while
    // /predict was in flight -- runRevision only guards against a SECOND run for the
    // SAME study, not against navigation, so without this check a slow-resolving run for
    // A can paint A's bitmaps into B's live viewer. This is the completion-time sibling
    // of the re-hand guard in render() (`imageCache.studyId === study.id`): that one checks
    // identity before handing a freshly mounted viewer its cached bitmaps, this one
    // checks identity before handing a freshly resolved run its live viewer. The cache
    // write and the setState below stay unconditional for an interactive run -- A's results are
    // real and belong in the store regardless of what's on screen; only the live paint is gated.
    // A BATCH writes the single-entry cache only for the study on screen (batch spec 8.3): forty
    // films must not evict the open study's bitmaps, and the decoded bitmaps of a film nobody is
    // looking at have served their thumbnail and are closed here.
    const onScreen = Boolean(mounted && mounted.studyId === studyId);
    if (!batch || onScreen) cacheImages(studyId, images);
    if (onScreen) mounted.viewer.setImages(images);
    else if (batch) disposeStudyImages(images);

    recordPrediction(studyId, response);

    // The finished study's own edit mode ends -- its geometry was just replaced under the
    // handles -- but ONLY if it is the study on screen. `editing` and `selection` belong to
    // `openId` (every writer of openId resets both, screens/studies.js FRESH_VIEW), and with a
    // Studies list the user may have opened study B and entered edit mode while A's /predict
    // was in flight: the viewer disables Edit only for the running study itself. A's completion
    // must not drop B out of edit mode. The error path below never touched either key.
    setState((state) => ({
      running: null,
      editing: state.openId === studyId ? false : state.editing,
      selection: state.openId === studyId ? null : state.selection,
      studies: state.studies.map((s) => (s.id === studyId
        ? { ...s, measurements: response.measurements, geometry: response.geometry, qc: response.qc ?? null, thumbnail }
        : s)),
    }));
    return warning ? { ok: true, warning } : { ok: true };
  } catch (error) {
    if (revision === runRevision) {
      setState({ running: null });
      if (!batch) showToast(`Could not segment: ${error.message}`);
      return { ok: false, reason: error.message };
    }
    return { ok: false, reason: 'superseded' };
  }
}
```

- [ ] **Step 3: `restoreFilm`'s guard becomes per-study**

In `restoreFilm`, replace

```js
  const runAtStart = runRevision;
```

with

```js
  // Per study, not runRevision: a batch bumps the global counter at every film's turn (batch spec
  // 8.3), and this restore is only stale if THIS study started a run meanwhile.
  const runAtStart = runsByStudy.get(studyId) ?? 0;
  const runMoved = () => (runsByStudy.get(studyId) ?? 0) !== runAtStart;
```

and replace both occurrences of `runAtStart !== runRevision` in that function with `runMoved()`. There are exactly two: one after `loadPrediction`, one after `loadStudyImages`.

- [ ] **Step 4: The run handler refuses during a batch**

In `render()`, replace

```js
  viewer.setRunHandler(() => {
    const live = getState();
    // `locating` too: a relocate picker is already open for a run that has not started, and a
    // second click must not raise a second native dialog. It is not a run, so it never claims one.
    if (live.running || locating) return;
    runSegmentation(live.openId);
  });
```

with

```js
  viewer.setRunHandler(() => {
    const live = getState();
    // `locating` too: a relocate picker is already open for a run that has not started, and a
    // second click must not raise a second native dialog. It is not a run, so it never claims one.
    // `batch` (batch spec 8.3): no single run starts while a batch is up, including in the window
    // between two films where `running` is null.
    if (live.running || live.batch || locating) return;
    segmentStudy(live.openId);
  });
```

Add to the file's imports, after the `describeModels` import line:

```js
import { WAIT_FOR_BATCH, WAIT_FOR_RUN } from '../data/batch.js';
```

- [ ] **Step 5: The viewer's card and gating**

In `renderer/components/viewer.js`, add after the `import { studyName } ...`-style data imports at the top (any position among the imports):

```js
import { isQueued, WAIT_FOR_BATCH, WAIT_FOR_RUN } from '../data/batch.js';
```

In `describeCard`, replace the block from `const busy = state.running === study.id;` through the end of the `filmStatus === 'missing'` return (the two `return { ... }` objects that carry a `button`) with:

```js
    // `busy` is THIS study's run; `otherRunning` is somebody else's. Everything the card SAYS
    // follows busy, so opening study B while A runs never claims B is running. Only the
    // button's `disabled` looks at any run at all, because only one run is allowed at a time,
    // and at a batch (batch spec 9): while one is up no single run starts. `queued` is this
    // study's place in the running batch -- QUEUED means that and nothing else; a film in no
    // batch reads UNSEGMENTED (spec decision 7).
    const busy = state.running === study.id;
    const otherRunning = Boolean(state.running) && !busy;
    const batch = state.batch ?? null;
    const queued = !busy && isQueued(batch, study.id);
    const waitTitle = batch ? WAIT_FOR_BATCH : (otherRunning ? WAIT_FOR_RUN : '');
    if (!hasResult || busy) {
      return {
        eyebrow: busy ? 'RUNNING' : (queued ? 'QUEUED' : 'UNSEGMENTED'),
        title: busy ? 'Segmenting and measuring\u2026' : (queued ? 'Waiting for its turn in the batch' : 'No segmentation yet'),
        // Describes what the pipeline does; never which model is executing (BD-4).
        body: busy
          ? 'Runs three models: vertebral segmentation, S1 keypoint detection, and femoral head fitting.'
          : (queued
            ? 'This study is in the running batch and will be segmented in turn.'
            : 'This study was uploaded but has not been processed. Run segmentation to generate measurements.'),
        spinner: busy,
        button: {
          text: busy ? 'Working\u2026' : 'Run segmentation',
          disabled: Boolean(state.running) || Boolean(batch),
          title: waitTitle,
        },
      };
    }
    if (filmStatus === 'loading') {
      return { eyebrow: 'LOADING', title: 'Loading the film\u2026', body: 'Reading the saved segmentation for this study.', spinner: true, button: null };
    }
    if (filmStatus === 'missing') {
      return {
        eyebrow: 'FILM UNAVAILABLE',
        title: 'The saved segmentation was not found',
        body: 'The film and overlay for this study are missing from this profile. Re-run segmentation to restore them; the measurements are unchanged.',
        spinner: false,
        button: {
          text: 'Re-run segmentation',
          disabled: Boolean(state.running) || Boolean(batch),
          title: waitTitle,
        },
      };
    }
    return null;
```

Check the current file for how the two `…` characters in the titles are written (`'Segmenting and measuring…'` as a glyph, or `\u2026`) and keep whichever form the file already uses on those lines — the diff must not turn a glyph into an escape or the reverse on a line this task did not mean to change. The strings above use escapes; if the file has glyphs, keep the glyphs.

In `updateViewer`, replace

```js
    rerunButton.disabled = !hasResult || Boolean(state.running) || filmStatus === 'loading';
```

with

```js
    // Re-run answers to ANY run in flight and to a batch, because only one run is allowed at a time.
    rerunButton.disabled = !hasResult || Boolean(state.running) || Boolean(state.batch) || filmStatus === 'loading';
```

- [ ] **Step 6: The persist suite's word**

In `tools/smoke/smoke-persist.mjs` (~line 301–302), replace

```js
    check('the run card is visible, QUEUED, offering Run segmentation',
      queued.cardVisible === true && queued.eyebrow === 'QUEUED' && queued.buttonVisible === true
```

with

```js
    check('the run card is visible, UNSEGMENTED, offering Run segmentation',
      queued.cardVisible === true && queued.eyebrow === 'UNSEGMENTED' && queued.buttonVisible === true
```

- [ ] **Step 7: Unit tests, then the two suites that cover the run core**

Run: `node --test test/*.test.js`
Expected: 426/426 (`test/analysis.test.js` imports the module and still passes).

The interactive path has no unit test; it is covered by `smoke-studies.mjs` sections 7–8 (a run and a re-run from the viewer's button, the badge and the summary mid-run) and by `smoke-persist.mjs` (a run, a restart, the FILM UNAVAILABLE card and RESET TO PREDICTION). Run both, each on a fresh launch, in the foreground, captured to files:

```bash
SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/task3-launch.txt 2>&1
node tools/smoke/smoke-studies.mjs > tools/smoke/out/task3-studies.txt 2>&1
node tools/smoke/cdp.mjs --quit
SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/task3-persist-launch.txt 2>&1
node tools/smoke/smoke-persist.mjs --phase run > tools/smoke/out/task3-persist-run.txt 2>&1
node tools/smoke/cdp.mjs --quit
SMOKE_KEEP_PROFILE=1 SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/task3-persist-relaunch.txt 2>&1
node tools/smoke/smoke-persist.mjs --phase restart > tools/smoke/out/task3-persist-restart.txt 2>&1
node tools/smoke/cdp.mjs --quit
```

Expected: `task3-studies.txt` ends `59/60 checks passed`, the one FAIL being exactly `searching the diagnosis text leaves only SP-0042` (stale since `0f8f821`; Task 6 fixes it); `task3-persist-run.txt` ends `34/34 checks passed`; `task3-persist-restart.txt` ends `44/44 checks passed`. Anything else is a regression in this task — stop and fix before committing. Note: `smoke-persist.mjs` may also carry the 54/56-style backend races documented in `tools/smoke/README.md`; a failure whose name the README lists as a race is re-run once on a fresh launch before being called a regression.

- [ ] **Step 8: Byte-check and commit**

Run: `git diff -- renderer tools | grep -nP '[^\x00-\x7F]'`
Expected: only lines that ALREADY carried a glyph before this task (compare against `git show HEAD:renderer/components/viewer.js | grep -nP '[^\x00-\x7F]'`); no new glyph, no escape where a glyph was.

Write the message to a file and commit:

```
feat: segmentStudy -- the run core exported for the batch; the card's UNSEGMENTED/QUEUED states

runSegmentation is split into an exported core, segmentStudy(studyId, { batch }), that returns an
outcome and never throws, and the viewer's button keeps the interactive behaviour it had. In batch
mode: no relocate picker, no toast, no image-cache write for a study off screen, bytes not parked.
Three guards the split needs (spec 8.3): the run handler and the core refuse while a batch is up,
including after the relocate picker resolves; restoreFilm's run guard is per study; the viewer's
run and re-run buttons are disabled during a batch. The plain card eyebrow reads UNSEGMENTED;
QUEUED is reserved for a film in the running batch (spec decision 7); smoke-persist updated.

Verified: unit 426/426; smoke-studies 59/60 (the stale diagnosis check, fixed in Task 6);
smoke-persist 34/34 then 44/44.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

```bash
git add renderer/screens/analysis.js renderer/components/viewer.js tools/smoke/smoke-persist.mjs
git commit -F <the message file>
```

---

### Task 4: `renderer/batch.js` — the wiring; the sidebar's sublabel; `batch` in `SIDEBAR_KEYS`

**Files:**
- Create: `renderer/batch.js`
- Modify: `renderer/components/sidebar.js` (the Studies `navRow` call in `render`, ~line 121; one import)
- Modify: `renderer/router.js` (`SIDEBAR_KEYS`, ~line 58)

**Interfaces:**
- Consumes: `createBatchDriver` from `renderer/data/batch.js` (Task 1); `segmentStudy` from `renderer/screens/analysis.js` (Task 3); `getState`, `setState` from `store.js`; `showToast` from `components/toast.js`; `persistenceDisabledReason` from `api.js`; `sidebarText` from `data/batch.js`.
- Produces: `startBatch(ids)` and `stopBatch()` from `renderer/batch.js`, for `screens/studies.js` (Task 5).

- [ ] **Step 1: Create the wiring module**

Create `renderer/batch.js`:

```js
/**
 * Batch segmentation driver (batch spec 8.2): the one wiring of data/batch.js's createBatchDriver
 * to the real store, the toast, the persistence flag and the analysis screen's run core. Module
 * scope, beside router.js, so a batch outlives any screen. screens/studies.js starts and stops it;
 * nothing else imports it. The loop itself is pure and tested in test/batch.test.js.
 */
import { getState, setState } from './store.js';
import { showToast } from './components/toast.js';
import { persistenceDisabledReason } from './api.js';
import { segmentStudy } from './screens/analysis.js';
import { createBatchDriver } from './data/batch.js';

const driver = createBatchDriver({
  segment: (studyId) => segmentStudy(studyId, { batch: true }),
  getState,
  setState,
  showToast,
  persistenceDisabledReason,
});

export const startBatch = driver.startBatch;
export const stopBatch = driver.stopBatch;
```

- [ ] **Step 2: The sidebar's Studies row reads the count**

In `renderer/components/sidebar.js`, add after the `import { studyName } from '../data/labels.js';` line:

```js
import { sidebarText } from '../data/batch.js';
```

and replace the Studies `navRow` call

```js
    navRow({
      icon: ICONS.studies,
      label: 'Studies',
      active: state.screen === 'studies',
      collapsed,
      onClick: () => setState({ screen: 'studies' }),
    }),
```

with

```js
    navRow({
      icon: ICONS.studies,
      label: 'Studies',
      // The running batch's count (batch spec 9), so it is visible from the Workspace and Analysis
      // screens; nothing while no batch runs. `batch` is in router.js's SIDEBAR_KEYS for this.
      subLabel: state.batch ? sidebarText(state.batch) : null,
      active: state.screen === 'studies',
      collapsed,
      onClick: () => setState({ screen: 'studies' }),
    }),
```

`navRow` already renders `subLabel` only when it is truthy and the sidebar is not collapsed.

- [ ] **Step 3: The router's key set**

In `renderer/router.js`, in `SIDEBAR_KEYS`, add `'batch',` after `'openId',` and extend the comment above the array so it reads:

```js
// Sidebar re-renders for: its own collapse/theme/settings toggles, the
// active-nav highlight (`screen`), the "open study" card (`openId`,
// `studies`), the workspace status line (`wsFolder`, `wsFiles`,
// `wsCsvRows`), and the Studies row's batch count (`batch`, 2026-09-08).
// See components/sidebar.js.
```

- [ ] **Step 4: Unit tests still pass; the module loads**

Run: `node --test test/*.test.js`
Expected: 426/426.

Run: `node -e "import('./renderer/batch.js').then((m) => console.log(typeof m.startBatch, typeof m.stopBatch))"` from the repo root.
Expected: `function function` (the module and everything it imports load under Node; `test/analysis.test.js` already proves the analysis module does).

- [ ] **Step 5: Byte-check and commit**

Run: `git diff -- renderer | grep -nP '[^\x00-\x7F]'`
Expected: nothing.

```bash
git add renderer/batch.js renderer/components/sidebar.js renderer/router.js
git commit -m "feat: renderer/batch.js wires the driver; the sidebar's Studies row counts the batch" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The Find tab — filter bar, ticks, select-all, the segment button, the progress group, the summary wording

**Files:**
- Modify: `renderer/screens/studies.js` — the header comment (line 2), the imports, `buildRow` (~line 189), `buildTable` (~line 228), `render()` (~line 340 to the end)
- Modify: `styles/screens/studies.css` — the `.studies-cell-id` rule (~line 101) and an appended block

**Interfaces:**
- Consumes: `checkbox` (Task 2); `matchesLocation`, `workspaceOptions`, `folderOptions`, `normaliseFilters`, `patchFilters`, `toggleId`, `withIds`, `HAND_ADDED` from `data/parameters.js`; `planBatch`, `progressText` from `data/batch.js` (Task 1); `startBatch`, `stopBatch` from `renderer/batch.js` (Task 4); `state.batch`, `state.paramFilters`, `state.paramSelected`.
- Produces: the DOM the smoke suite keys on — `[data-find-key]` values `workspace`, `folder`, `segment`, `segment-note`, `progress`, `stop`, `select-all`, `row-<id>`; classes `.studies-filters`, `.studies-progress-text`, `.studies-name`; the summary text `{n} STUDIES · {m} UNSEGMENTED`; the empty-state copy of §7.5.

This is DOM code: no unit test. Verification is the human gate below plus Task 6's smoke sections.

- [ ] **Step 1: Header comment and imports**

Replace the file's header comment (lines 1–6) with:

```js
/**
 * Studies screen (spec 9.4). Heading, the {n} STUDIES · {m} UNSEGMENTED summary, search, the
 * dropzone (click, drop, Choose radiograph), the Find tab's filter bar with the segment button
 * (batch spec 7), and the table with row ticks, derived status pills and the DEMO pill.
 * render(state) builds the shell; the summary, the bar and the table update in place from a
 * module-scope subscription, because router.js remounts this host only on screen/ack.
 */
```

Keep the `·` in `{m} UNSEGMENTED` in whatever form the line had (a glyph today).

Replace the import line

```js
import { withIds } from '../data/parameters.js';
```

with

```js
import {
  withIds, toggleId, workspaceOptions, folderOptions, normaliseFilters, patchFilters, matchesLocation, HAND_ADDED,
} from '../data/parameters.js';
import { planBatch, progressText } from '../data/batch.js';
import { checkbox } from '../components/checkbox.js';
import { startBatch, stopBatch } from '../batch.js';
```

- [ ] **Step 2: `buildRow` gains the tick**

Replace the signature `function buildRow(study, runningId) {` with `function buildRow(study, runningId, selected) {` and replace the STUDY cell

```js
    el('div', { class: 'studies-cell-id', title: study.id }, studyName(study)),
```

with

```js
    el('div', { class: 'studies-cell-id', title: study.id },
      // The tick (batch spec 7.2), on real rows only: a demo study has no film to segment, as it
      // has no delete control. The label's click stops at the label, so the row's own click does
      // not open the study; Space on the box is the box's own activation and already bypasses
      // the row's keydown handler (event.target !== row). toggleId returns a new array: the
      // store's selection -- the same paramSelected the Parameters grid ticks -- is replaced,
      // never mutated.
      study.source === 'real'
        ? checkbox({
          key: `row-${study.id}`, keyAttr: 'data-find-key', label: null, checked: selected.includes(study.id),
          ariaLabel: `Select ${studyName(study)}`,
          onClick: (event) => event.stopPropagation(),
          onChange: () => setState((s) => ({ paramSelected: toggleId(s.paramSelected, study.id) })),
        })
        : null,
      el('span', { class: 'studies-name' }, studyName(study))),
```

- [ ] **Step 3: `buildTable` gains the select-all and the empty-state kinds**

Replace the whole `buildTable` function and the comment above it with:

```js
// Why the table is empty (batch spec 7.5). 'search' and 'filters' used to be one sentence, because
// the nine demo studies made a genuinely empty library unreachable; now that an installed app opens
// with nothing, "No studies match that search." over a library the user has not filled yet would
// blame a search they never made. The search wording is pinned by tools/smoke/smoke-studies.mjs
// -- keep it exactly. The 'none' string is the one the file always carried.
const EMPTY_COPY = {
  search: 'No studies match that search.',
  filters: 'No studies match these filters.',
  none: 'No studies yet — choose or drop a radiograph above, or load a workspace folder.',
};

// `emptyKind` is null (the library is empty), 'search' or 'filters'. `selected` is paramSelected.
function buildTable(studies, runningId, emptyKind, selected) {
  // An explicit arrow, not `studies.map(buildRow)`: map passes the index as the second
  // argument, so every row would receive its own position as `runningId` and the running
  // study would silently never be badged Processing. The arrow is load-bearing.
  const body = studies.length > 0
    ? studies.map((study) => buildRow(study, runningId, selected))
    : [el('div', { class: 'studies-empty' }, EMPTY_COPY[emptyKind ?? 'none'])];
  // Select-all (batch spec 7.2) is about the VISIBLE real rows only, so it never ticks a film the
  // filter is hiding, and it is built only when there is one: the fresh dev library of demo
  // studies shows the plain heading. `ids` is this render's own array, captured by the handler;
  // withIds leaves ticks outside it alone. `checked` is read before setState: the rebuild it
  // triggers replaces this input.
  const ids = studies.filter((study) => study.source === 'real').map((study) => study.id);
  const picked = ids.filter((id) => selected.includes(id)).length;
  const selectAll = ids.length > 0
    ? checkbox({
      key: 'select-all', keyAttr: 'data-find-key', label: null, ariaLabel: 'Select all visible studies',
      checked: picked === ids.length, indeterminate: picked > 0 && picked < ids.length,
      onChange: (event) => {
        const on = event.target.checked;
        setState((s) => ({ paramSelected: withIds(s.paramSelected, ids, on) }));
      },
    })
    : null;
  return el('div', { class: 'studies-table card' },
    el('div', { class: 'studies-table-head' },
      el('div', { class: 'studies-head-study' }, selectAll, 'STUDY'), el('div', {}, 'PATIENT'), el('div', {}, 'VIEW'),
      el('div', {}, 'WORKSPACE'), el('div', {}, 'FOLDER'),
      el('div', {}, 'DATE'), el('div', {}, 'STATUS'),
      el('div', {})),
    ...body);
}
```

The `none` string is moved from the old `buildTable`, where it was a glyph em dash in the source: cut and paste it, do not retype it, and confirm in the byte-check that the line is byte-identical to the old one.

- [ ] **Step 4: `render()` — the bar host, `setFilters`, `buildFilterBar` and the new `update`**

In `render()`:

(a) After `const tableHost = el('div', { class: 'studies-table-host' });` add:

```js
  const barHost = el('div', { class: 'studies-filters-host' });
```

(b) Replace `}, dropzone(), tableHost);` (the `findPanel` children) with `}, dropzone(), barHost, tableHost);`.

(c) After the `const parameters = mountParameters(parametersHost, { onOpen: openStudy });` line, before `let lastKey = null;`, add:

```js
  // Filters are one object replaced wholesale. The patch is merged over the NORMALISED filters --
  // the ones the selects are showing -- exactly as screens/parameters.js does; patchFilters owns
  // that rule and is tested. These two keys are shared with the grid (batch spec decision 4).
  function setFilters(patch) {
    setState((s) => ({ paramFilters: patchFilters(s.paramFilters, s.studies, patch) }));
  }

  // The bar (batch spec 7.1, 7.3, 7.4): the grid's Workspace and Folder selects over the same
  // shared keys, then the segment button with its note -- or, while a batch runs, the progress
  // group. Chromium shows no tooltip on a disabled control, so the button's reason is a visible
  // note beside it. Options come from the whole library, not the searched subset, as the grid's
  // do. `visible` is the table's rows, in table order: the id list the button runs.
  function buildFilterBar(live, filters, visible) {
    const workspaceSelect = el('select', {
      class: 'param-select', 'aria-label': 'Filter by workspace', 'data-find-key': 'workspace',
      // Changing the workspace clears the folder: a folder is only meaningful within its root.
      onChange: (event) => setFilters({ workspace: event.target.value === '' ? null : event.target.value, folder: null }),
    });
    workspaceSelect.append(el('option', { value: '' }, 'All workspaces'));
    for (const option of workspaceOptions(live.studies)) {
      workspaceSelect.append(el('option', {
        value: option.value, ...(option.value === HAND_ADDED ? {} : { title: option.value }),
      }, option.label));
    }
    workspaceSelect.value = filters.workspace ?? '';

    const folderSelect = el('select', {
      class: 'param-select', 'aria-label': 'Filter by folder', 'data-find-key': 'folder',
      onChange: (event) => setFilters({ folder: event.target.value === '' ? null : event.target.value }),
    });
    folderSelect.append(el('option', { value: '' }, 'All folders'));
    for (const option of folderOptions(live.studies, filters.workspace)) {
      folderSelect.append(el('option', { value: option.value }, option.label));
    }
    folderSelect.value = filters.folder ?? '';

    let action;
    if (live.batch) {
      // Indeterminate ring plus a count of attempts. /predict has no progress channel, so there
      // is nothing else honest to show (spec decision 6). Stop finishes the film in flight.
      action = el('div', { class: 'studies-progress', 'data-find-key': 'progress' },
        el('span', { class: 'studies-progress-spinner', 'aria-hidden': 'true' }),
        el('span', { class: 'studies-progress-text' }, progressText(live.batch)),
        el('button', {
          type: 'button', class: 'btn btn-small', 'data-find-key': 'stop',
          disabled: live.batch.stopping === true,
          onClick: () => stopBatch(),
        }, 'Stop'));
    } else {
      const plan = planBatch({ visible, selected: live.paramSelected, running: live.running });
      action = el('div', { class: 'param-export-group' },
        el('button', {
          type: 'button', class: 'btn btn-primary btn-small', 'data-find-key': 'segment',
          disabled: !plan.enabled,
          title: plan.enabled ? '' : (plan.note ?? ''),
          onClick: () => startBatch(plan.ids),
        }, plan.label),
        plan.note ? el('span', { class: 'param-export-note', 'data-find-key': 'segment-note' }, plan.note) : null);
    }
    return el('div', { class: 'studies-filters' },
      workspaceSelect, folderSelect, el('div', { class: 'studies-header-spacer' }), action);
  }
```

(d) Replace the body of `update(live)` from the line `const studies = live.studies || [];` to the end of the function with:

```js
    const studies = live.studies || [];
    const query = (live.query || '').trim().toLowerCase();
    const queried = studies.filter((study) => matchesQuery(study, query));
    // The grid keeps its own reference-keyed gate; the search result is computed once here and
    // shared with the list below.
    parameters.update(live, queried);

    // live.running is in the key so the table repaints when a run starts or ends: the row
    // badge is derived from it, and nothing else in the key changes at either moment.
    // confirmingId is module scope, not store state; listing it here is what lets a
    // refreshTable() after a change to it get past the gate, while a notification that
    // changed nothing the table shows (a pan frame, a toast) still returns early.
    // paramFilters, paramSelected and batch are what the bar and the ticks read (batch spec 7):
    // every store key this list reads must be here, or it silently stops repainting for it.
    const key = [live.studies, live.query, live.running, confirmingId, live.paramFilters, live.paramSelected, live.batch];
    if (sameKey(key, lastKey)) return;
    lastKey = key;
    // The summary always describes the whole library, not the filtered view, and counts the
    // films without measurements with exactly the rule buildRow badges them: UNSEGMENTED, never
    // "in queue" -- the batch's queue is the bar's business (spec decision 7).
    const queued = studies.filter((study) => (live.running === study.id ? 'proc' : deriveStatus(study)) === 'proc').length;
    summary.textContent = `${studies.length} STUDIES · ${queued} UNSEGMENTED`;

    const filters = normaliseFilters(live.paramFilters, studies);
    const visible = queried.filter((study) => matchesLocation(study, filters));
    const selected = live.paramSelected ?? [];
    const emptyKind = filters.workspace !== null || filters.folder !== null ? 'filters' : (query !== '' ? 'search' : null);

    // Focus snapshot, restored by data-find-key after the rebuild (screens/parameters.js does the
    // same with data-param-key): a select change or a tick rebuilds the bar and the table, which
    // drops keyboard focus to <body>. Only when focus is inside them -- a rebuild must never steal
    // focus from the search box or the tab strip. refreshTable() restores the delete controls,
    // which carry no key, by its own selector afterwards.
    const active = document.activeElement;
    const focusKey = (barHost.contains(active) || tableHost.contains(active)) ? active.getAttribute('data-find-key') : null;
    mount(barHost, buildFilterBar(live, filters, visible));
    mount(tableHost, buildTable(visible, live.running, emptyKind, selected));
    if (focusKey !== null) {
      const target = barHost.querySelector(`[data-find-key="${focusKey}"]`) ?? tableHost.querySelector(`[data-find-key="${focusKey}"]`);
      if (target) target.focus();
    }
  }
```

Keep the `·` in the summary template in the form the old line had (a glyph today). Everything after `update` (`const root = ...`, `mounted = ...`, `update(state)`, `return root`) is unchanged.

- [ ] **Step 5: CSS**

In `styles/screens/studies.css`, replace

```css
.studies-cell-id {
  font: 600 14px 'Source Sans 3', sans-serif;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

with

```css
.studies-cell-id {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  font: 600 14px 'Source Sans 3', sans-serif;
  color: var(--ink);
}

/* The tick box before the name (batch spec 7.2) keeps its size; the name truncates. The box is
   the grid's control (components/checkbox.js) and keeps the grid's class names. */
.studies-cell-id > .param-check {
  flex: none;
}

.studies-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studies-head-study {
  display: flex;
  align-items: center;
  gap: 10px;
}
```

Append at the end of the file:

```css
/* The Find tab's filter bar (batch spec 7.1): the grid's Workspace and Folder selects over the
   same shared keys, then the segment button with its note (the grid's export-group and note
   classes), or -- while a batch runs -- the progress group. Wraps like .param-bar. */
.studies-filters {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.studies-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
}

/* Indeterminate on purpose: /predict has no progress channel (spec decision 6). The viewer's
   run-card ring at bar size; @keyframes spin is in styles/base.css. */
.studies-progress-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  animation: spin .8s linear infinite;
}

.studies-progress-text {
  font-family: 'Chivo Mono', monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.15em;
  color: var(--muted);
}
```

- [ ] **Step 6: Unit tests and a dry run over CDP**

Run: `node --test test/*.test.js`
Expected: 426/426 (`test/studies.test.js` imports the module; `formatDate`, `matchesQuery`, `newStudy` unchanged).

Launch the scratch profile and drive the new surface by hand over CDP before the human sees it (the same probes Task 6 will pin). In the foreground, captured to files:

```bash
SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/task5-launch.txt 2>&1
node tools/smoke/smoke-studies.mjs > tools/smoke/out/task5-studies.txt 2>&1
```

Expected: read the FAIL lines by name. The ones allowed to fail are the checks that read the summary through the old `IN QUEUE` regex — the four that name it, plus every check that uses the `n` that regex yields (`.studies-row count equals n`, `clearing the query restores all n rows`, `back returns to Studies with all n rows`, `summary reads n+1 studies, 1 in queue`) — and the stale diagnosis check; Task 6 rewrites all of them. NOTHING else may fail: in particular the header check (`the header row reads STUDY, PATIENT, ...`), the name checks (`the study cell shows the name derived from the filename`, `the injected study is named after its file`) and the sections 7–8 run checks must still pass. Then, on the same instance, a probe of the bar written to a `.mjs` file under `tools/smoke/out/` and run with `node tools/smoke/cdp.mjs --file <it>`:

```js
(() => {
  const opts = (key) => [...document.querySelectorAll('[data-find-key="' + key + '"] option')].map((o) => o.textContent);
  const button = document.querySelector('[data-find-key="segment"]');
  return {
    workspace: opts('workspace'), folder: opts('folder'),
    label: button && button.textContent, disabled: button && button.disabled,
    note: document.querySelector('[data-find-key="segment-note"]')?.textContent ?? null,
    ticks: document.querySelectorAll('input[data-find-key^="row-"]').length,
    selectAll: Boolean(document.querySelector('input[data-find-key="select-all"]')),
    summary: document.querySelector('.studies-summary').textContent,
  };
})()
```

Expected on that instance (SP-9000 segmented by the suite, nine demos): `workspace` `['All workspaces', 'Added by hand']`, `folder` `['All folders', 'design_src']`, `label` `Segment 0 unsegmented`, `disabled` true, `note` `All visible studies are segmented`, `ticks` 1, `selectAll` true, `summary` matching `/^\d+ STUDIES · 0 UNSEGMENTED$/`. Quit with `node tools/smoke/cdp.mjs --quit`.

- [ ] **Step 7: Byte-check, commit with the gate pending**

Run: `git diff -- renderer styles | grep -nP '[^\x00-\x7F]'`
Expected: exactly the lines that carried a glyph before (the `·` in the summary and the header comment, the `—` in the moved `none` string); compare with `git show HEAD:renderer/screens/studies.js | grep -nP '[^\x00-\x7F]'`.

Write the message to a file and commit; the gate outcomes are amended into this commit afterwards:

```
feat: the Find tab's filter bar, row ticks, select-all and segment button; UNSEGMENTED

The Find tab gains the grid's Workspace and Folder selects over the shared paramFilters keys, a
tick box in every real row's STUDY cell and a select-all in the header over the shared
paramSelected, and one button that follows the export rule: ticked visible rows when any are
ticked, else every visible unsegmented film, with the label and a visible note saying which
(batch spec 7). While a batch runs the button gives way to a spinner, "{done} of {total} done"
and Stop. The summary reads UNSEGMENTED (spec decision 7). Two empty-state wordings (7.5).

Gate: pending
```

```bash
git add renderer/screens/studies.js styles/screens/studies.css
git commit -F <the message file>
```

- [ ] **Step 8: HUMAN GATE — list these checks in the chat message, then end the turn**

Tell the user first: close any Spine Contour instance left open from earlier (it runs the code it was launched with), then run the app from source with the three PowerShell lines under Global Constraints. The checks, on their real library:

1. **Filter bar.** On Studies › Find, the `Workspace` and `Folder` selects list the workspaces and folders of the library; choosing a workspace narrows the folders and the rows; the summary line reads `N STUDIES · M UNSEGMENTED` and does not change with the filter; switching to Parameters shows the same workspace and folder chosen there, and back.
2. **Ticks.** Clicking a row's box selects it without opening the study; clicking the row elsewhere still opens it; the header box ticks every visible real row, reads indeterminate with a partial pick, and a second click clears them; Tab reaches a box and Space toggles it. (Dev only: demo rows have no box.)
3. **The button.** With nothing ticked it reads `Segment N unsegmented`; with rows ticked, `Segment N selected` and, when some of them are segmented, the note `K already segmented`; with only segmented rows ticked it is disabled with `All selected studies are segmented`.
4. **A batch.** Filter to a folder holding at least three unsegmented films, tick them, click. The bar shows the spinner, `0 of N done` and Stop; the sidebar's Studies row reads `0 OF N DONE`; the Studies rows read `Processing`. Open one of the waiting films: the card reads `QUEUED`, `Waiting for its turn in the batch`, its button disabled. Open a segmented study and drag a landmark: the correction applies while the batch runs. Back on Studies, the count has advanced.
5. **Stop.** Press Stop mid-batch: the text reads `Stopping after this film…`, Stop is disabled, the sidebar reads `STOPPING`; the film in flight finishes; the toast reads `Segmented k of N films, then stopped.`; the films left are still `Processing` and the button offers them (`Segment N-k selected`).
6. **Completion and export.** Click again and let it finish: the toast reads `Segmented … of … films.` with a clause for anything that failed; the ticks are still there; on Parameters, `Export N selected` counts the same rows.
7. **Console.** No errors in DevTools (Ctrl+Shift+I) through all of it.

Record every outcome by amending the commit's `Gate: pending` line (`git commit --amend -F <file>`) — passed as `Gate: passed 2026-09-08 (user)`, with any check the user could not reach named — before Task 6 starts. Keep the ledger uncommitted until then.

---

### Task 6: Smoke — the renamed words, the stale search, the run card's eyebrow, sections 10–14; the README's baselines

**Files:**
- Modify: `tools/smoke/smoke-studies.mjs`
- Modify: `tools/smoke/smoke-workspace.mjs:119`
- Modify: `tools/smoke/README.md` (the plan-05 section's `14 STUDIES · 1 IN QUEUE` mention, ~line 113; the "Known baseline" paragraph, ~lines 257–264)

**Interfaces:**
- Consumes: the DOM of Task 5 (`data-find-key` values), `state.batch` (Task 1), the card wording of Task 3, `inject-study.js`'s base64 sample film.

- [ ] **Step 1: The renamed words and the stale search**

In `tools/smoke/smoke-studies.mjs`:

- Line ~59–60: `IN QUEUE` → `UNSEGMENTED` in the regex and the check name (`summary matches "{n} STUDIES · {m} UNSEGMENTED" with n >= 9`).
- Line ~228: the literal `${n + 1} STUDIES · 1 IN QUEUE` → `${n + 1} STUDIES · 1 UNSEGMENTED`; the check name → `summary reads n+1 studies, 1 unsegmented`.
- Lines ~283 and ~356: the two `/(\\d+) STUDIES · (\\d+) IN QUEUE/` regexes → `UNSEGMENTED`; the check names at ~292 (`the summary UNSEGMENTED count matches the Processing badges`) and ~365 (`the summary counts the re-running study as unsegmented`).
- Section 3: replace `await cdp.typeText('anterior slip');` with `await cdp.typeText('meyerding');` and the check name with `searching a diagnosis phrase only SP-0042 carries leaves one row` (since `0f8f821` the demo pair share "Anterior slip"; `Meyerding` is on SP-0042 alone — `renderer/data/demo-studies.js`).
- Section 5: extend the `runCard` probe and its check so the plain eyebrow is asserted:

```js
  const runCard = await cdp.evaluate("(() => { const card = document.querySelector('.run-card'); const btn = document.querySelector('.run-button'); return { visible: Boolean(card) && !card.classList.contains('is-hidden'), label: btn ? btn.textContent : null, eyebrow: document.querySelector('.run-eyebrow')?.textContent }; })()");
  check('the run card is visible, UNSEGMENTED, with a Run segmentation button', runCard.visible === true && runCard.label === 'Run segmentation' && runCard.eyebrow === 'UNSEGMENTED', runCard);
```

- The header comment: after "This suite SEGMENTS SP-9000 twice (sections 7 and 8)" add a sentence: "Sections 10–14 (2026-09-08) add three batches over injected copies of the same film — two films, one unreadable film, and two films with a Stop — about three more real runs."

In `tools/smoke/smoke-workspace.mjs:119`: `IN QUEUE` → `UNSEGMENTED` in the regex.

- [ ] **Step 2: Sections 10–14**

In `tools/smoke/smoke-studies.mjs`, directly after section 9's check (`check('no console errors or exceptions during the run', ...)`) and before the `} finally {`, insert:

```js
  // ---------------------------------------------------------------------------------------------
  // 10–14 (2026-09-08, batch spec 7, 8, 9, 10, 11). The Find tab's filter bar and ticks, then three
  // real batches over films injected the way inject-study.js injects SP-9000. Every selector keys
  // on data-find-key; every store read goes through the page's own module.
  // ---------------------------------------------------------------------------------------------
  const errorsAfter9 = cdp.errors.length;
  const SAMPLE_BASE64 = /atob\('([^']+)'\)/.exec(injectExpression)[1];

  // Parks bytes (when given) for a new unsegmented real study and front-inserts it, like addStudy,
  // without opening it. A filePath under a workspace root gives the Workspace select a root to
  // offer; no bytes and no such file is the batch's file-not-found case.
  const injectFilm = ({ id, fileName, filePath, workspaceFolder, base64 }) => cdp.evaluate(`(async () => {
    const store = await import('./renderer/store.js');
    const analysis = await import('./renderer/screens/analysis.js');
    const base64 = ${JSON.stringify(base64)};
    if (base64) {
      const bin = atob(base64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      analysis.setFilePayload(${JSON.stringify(id)}, bytes);
    }
    const record = { id: ${JSON.stringify(id)}, source: 'real', filePath: ${JSON.stringify(filePath)}, fileName: ${JSON.stringify(fileName)}, name: null, workspaceFolder: ${JSON.stringify(workspaceFolder)}, subjectId: null, timepoint: null, filmDate: null, addedAt: new Date().toISOString(), view: 'Standing lateral', thumbnail: null, measurements: null, geometry: null, qc: null, clinical: {} };
    store.setState((s) => ({ studies: [record, ...s.studies.filter((x) => x.id !== record.id)] }));
    return store.getState().studies.length;
  })()`);
  const readBar = () => cdp.evaluate(`(() => {
    const b = document.querySelector('[data-find-key="segment"]');
    return { label: b ? b.textContent : null, disabled: b ? b.disabled : null, note: document.querySelector('[data-find-key="segment-note"]')?.textContent ?? null };
  })()`);
  const readProgress = () => cdp.evaluate(`(() => ({
    text: document.querySelector('[data-find-key="progress"] .studies-progress-text')?.textContent ?? null,
    stopDisabled: document.querySelector('[data-find-key="stop"]')?.disabled ?? null,
    segmentButton: Boolean(document.querySelector('[data-find-key="segment"]')),
    sidebar: document.querySelector('.nav-row[aria-label="Studies"] .nav-sublabel')?.textContent ?? null,
    procRows: document.querySelectorAll('.studies-row .badge-proc').length,
  }))()`);
  // A select is driven by setting its value and dispatching change (cdp-lib's key() cannot pick).
  const pick = (key, value) => cdp.evaluate(`(() => { const el = document.querySelector('[data-find-key="${key}"]'); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); return el.value; })()`);
  const summaryParts = async () => {
    const m = /^(\d+) STUDIES · (\d+) UNSEGMENTED$/.exec(((await text(cdp, '.studies-summary')) || '').trim());
    return m ? { studies: Number(m[1]), unsegmented: Number(m[2]) } : null;
  };
  const FILTERS_RESET = '{ workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, subject: "", pairedOnly: false, pairedWith: "__any__" }';

  // 10. The filter bar and the ticks. SP-9001 sits under a workspace root, with no bytes and no
  // such file; SP-9000 is segmented (section 8).
  await cdp.setState(`{ screen: "studies", query: "", paramFilters: ${FILTERS_RESET}, paramSelected: [] }`);
  await cdp.settle(200);
  const countBefore10 = (await cdp.state()).studies.length;
  await injectFilm({ id: 'SP-9001', fileName: 'S001.png', filePath: 'C:\\smoke\\Fusion2025\\pre-op\\S001.png', workspaceFolder: 'C:\\smoke\\Fusion2025', base64: null });
  await cdp.settle(200);
  const bar10 = await cdp.evaluate(`(() => {
    const opts = (key) => [...document.querySelectorAll('[data-find-key="' + key + '"] option')].map((o) => o.textContent);
    return { workspace: opts('workspace'), folder: opts('folder'), rows: document.querySelectorAll('.studies-row').length };
  })()`);
  check('the Workspace select offers the injected root, then Added by hand', JSON.stringify(bar10.workspace) === JSON.stringify(['All workspaces', 'Fusion2025', 'Added by hand']), bar10.workspace);
  check('the Folder select offers every folder shown, first seen first', JSON.stringify(bar10.folder) === JSON.stringify(['All folders', 'pre-op', 'design_src']), bar10.folder);
  check('the injected film is a row', bar10.rows === countBefore10 + 1, bar10.rows);
  const bar10Plain = await readBar();
  check('with nothing ticked the button offers every visible unsegmented film', bar10Plain.label === 'Segment 1 unsegmented' && bar10Plain.disabled === false && bar10Plain.note === null, bar10Plain);

  await pick('workspace', 'C:\\smoke\\Fusion2025');
  await cdp.settle(150);
  const ws10 = await cdp.evaluate(`(() => ({
    rows: [...document.querySelectorAll('.studies-row')].map((r) => r.dataset.studyId),
    folder: [...document.querySelectorAll('[data-find-key="folder"] option')].map((o) => o.textContent),
    value: document.querySelector('[data-find-key="workspace"]').value,
  }))()`);
  check('filtering by workspace leaves the one film under that root', JSON.stringify(ws10.rows) === JSON.stringify(['SP-9001']), ws10.rows);
  check('the Folder select narrows to that root and the select keeps its value across the rebuild', JSON.stringify(ws10.folder) === JSON.stringify(['All folders', 'pre-op']) && ws10.value === 'C:\\smoke\\Fusion2025', ws10);
  const summary10 = await summaryParts();
  check('the summary still describes the whole library', summary10 !== null && summary10.studies === countBefore10 + 1 && summary10.unsegmented === 1, summary10);
  const shared10 = (await cdp.state()).paramFilters;
  check('the filter lives in the shared paramFilters key', shared10.workspace === 'C:\\smoke\\Fusion2025' && shared10.folder === null, shared10);
  await pick('folder', 'pre-op');
  await cdp.settle(150);
  check('filtering by folder keeps the film in it', (await rowCount(cdp)) === 1, await rowCount(cdp));
  const searchRect10 = await cdp.rect('.studies-search');
  await cdp.click(searchRect10.cx, searchRect10.cy);
  await cdp.typeText('zzzznomatch');
  await cdp.settle();
  const empty10 = (await text(cdp, '.studies-empty') || '').trim();
  check('with a filter set and nothing left, the empty state names the filters', empty10 === 'No studies match these filters.', empty10);
  await clearSearch(cdp);
  await pick('workspace', '');
  await cdp.settle(150);
  check('clearing the workspace clears the folder and restores every row', (await rowCount(cdp)) === countBefore10 + 1 && (await cdp.state()).paramFilters.folder === null, await rowCount(cdp));

  const tickRect = await cdp.rect('input[data-find-key="row-SP-9000"]');
  const demoTick = await cdp.evaluate(`Boolean(document.querySelector('input[data-find-key="row-SP-0042"]'))`);
  check('a real row carries a tick box and a demo row does not', Boolean(tickRect) && demoTick === false, { tickRect, demoTick });
  await cdp.click(tickRect.cx, tickRect.cy);
  await cdp.settle(150);
  s = await cdp.state();
  check('ticking a row selects it without opening the study', s.screen === 'studies' && JSON.stringify(s.paramSelected) === JSON.stringify(['SP-9000']), { screen: s.screen, selected: s.paramSelected });
  const bar10Ticked = await readBar();
  check('with only a segmented row ticked the button is disabled and says so', bar10Ticked.label === 'Segment 0 selected' && bar10Ticked.disabled === true && bar10Ticked.note === 'All selected studies are segmented', bar10Ticked);
  const all10 = await cdp.evaluate(`(() => { const el = document.querySelector('input[data-find-key="select-all"]'); return { checked: el.checked, indeterminate: el.indeterminate }; })()`);
  check('select-all is indeterminate with one of two real rows ticked', all10.checked === false && all10.indeterminate === true, all10);
  const allRect = await cdp.rect('input[data-find-key="select-all"]');
  await cdp.click(allRect.cx, allRect.cy);
  await cdp.settle(150);
  s = await cdp.state();
  check('an indeterminate select-all ticks every visible real row', s.paramSelected.length === 2 && s.paramSelected.includes('SP-9000') && s.paramSelected.includes('SP-9001'), s.paramSelected);
  const bar10Both = await readBar();
  check('with a segmented and an unsegmented row ticked the button runs one and notes the other', bar10Both.label === 'Segment 1 selected' && bar10Both.disabled === false && bar10Both.note === '1 already segmented', bar10Both);
  const focus10 = await cdp.evaluate(`document.activeElement ? document.activeElement.getAttribute('data-find-key') : null`);
  check('the rebuild hands focus back to the select-all box', focus10 === 'select-all', focus10);
  const allRect2 = await cdp.rect('input[data-find-key="select-all"]');
  await cdp.click(allRect2.cx, allRect2.cy);
  await cdp.settle(150);
  s = await cdp.state();
  check('a checked select-all clears every visible real row', s.paramSelected.length === 0, s.paramSelected);

  // 11. A batch over a film that is not on disk ends in seconds with the failure named (spec 10).
  await cdp.setState('{ paramSelected: ["SP-9001"] }');
  await cdp.settle(150);
  const bar11 = await readBar();
  check('with the unreadable film ticked the button offers it', bar11.label === 'Segment 1 selected' && bar11.disabled === false, bar11);
  const segRect11 = await cdp.rect('[data-find-key="segment"]');
  await cdp.click(segRect11.cx, segRect11.cy);
  const failed11 = await waitForState('s.toast.startsWith("Segmented 0 of 1")', 15000);
  s = await cdp.state();
  const sp9001 = s.studies.find((x) => x.id === 'SP-9001');
  check('the batch ends with the film counted as failed and named in the toast', failed11 === true && s.toast === 'Segmented 0 of 1 film. · 1 could not be segmented: S001 (file not found)', s.toast);
  check('the unreadable film is untouched and the batch is cleared', s.batch === null && s.running === null && sp9001 && sp9001.measurements === null, { batch: s.batch, running: s.running });

  // 12. A real two-film batch (spec 9's worked example at fixture scale): the count, the badges,
  // the sidebar, the cards mid-batch, the toast, the ticks afterwards.
  await injectFilm({ id: 'SP-9002', fileName: 'batch-a.jpg', filePath: null, workspaceFolder: null, base64: SAMPLE_BASE64 });
  await injectFilm({ id: 'SP-9003', fileName: 'batch-b.jpg', filePath: null, workspaceFolder: null, base64: SAMPLE_BASE64 });
  await cdp.setState('{ paramSelected: [] }');
  await cdp.settle(200);
  const bar12Plain = await readBar();
  check('with nothing ticked the button counts every visible unsegmented film', bar12Plain.label === 'Segment 3 unsegmented' && bar12Plain.disabled === false, bar12Plain);
  await cdp.setState('{ paramSelected: ["SP-9002", "SP-9003"] }');
  await cdp.settle(150);
  const bar12 = await readBar();
  check('ticking the two real films offers exactly them', bar12.label === 'Segment 2 selected' && bar12.disabled === false && bar12.note === null, bar12);
  const summaryBefore12 = await summaryParts();
  const segRect12 = await cdp.rect('[data-find-key="segment"]');
  await cdp.click(segRect12.cx, segRect12.cy);
  const started12 = await waitForState('s.batch !== null && s.running !== null', 5000);
  s = await cdp.state();
  check('the click starts a batch over the ticked films in table order, the first in flight', started12 === true && s.batch && JSON.stringify(s.batch.ids) === JSON.stringify(['SP-9003', 'SP-9002']) && s.batch.done === 0 && s.running === 'SP-9003', { batch: s.batch, running: s.running });
  const progress12a = await readProgress();
  check('the bar shows 0 of 2 done, an enabled Stop and no segment button', progress12a.text === '0 of 2 done' && progress12a.stopDisabled === false && progress12a.segmentButton === false, progress12a);
  check('the sidebar Studies row reads 0 OF 2 DONE', progress12a.sidebar === '0 OF 2 DONE', progress12a.sidebar);
  check('the running, the queued and the unreadable film all read Processing', progress12a.procRows === 3, progress12a.procRows);

  // The cards mid-batch. The injected film segments in roughly 9 s; two openings take about 1 s.
  const queuedRect = await cdp.rect('.studies-row[data-study-id="SP-9002"]');
  await cdp.click(queuedRect.cx, queuedRect.cy);
  await cdp.settle(200);
  const queuedCard = await cdp.evaluate(`(() => ({
    eyebrow: document.querySelector('.run-eyebrow')?.textContent, title: document.querySelector('.run-title')?.textContent,
    disabled: document.querySelector('.run-button')?.disabled, buttonTitle: document.querySelector('.run-button')?.title,
    rerunDisabled: document.querySelector('.viewer-tool[aria-label="Re-run segmentation"]')?.disabled,
  }))()`);
  check('a queued film opened mid-batch reads QUEUED, waiting for its turn, its run button disabled', queuedCard.eyebrow === 'QUEUED' && queuedCard.title === 'Waiting for its turn in the batch' && queuedCard.disabled === true && queuedCard.buttonTitle === 'Wait for the batch to finish', queuedCard);
  let backRect12 = await cdp.rect('.icon-btn[aria-label="Back to studies"]');
  await cdp.click(backRect12.cx, backRect12.cy);
  await cdp.settle(150);
  const outsideRect = await cdp.rect('.studies-row[data-study-id="SP-9001"]');
  await cdp.click(outsideRect.cx, outsideRect.cy);
  await cdp.settle(200);
  const outsideCard = await cdp.evaluate(`(() => ({ eyebrow: document.querySelector('.run-eyebrow')?.textContent, title: document.querySelector('.run-title')?.textContent, disabled: document.querySelector('.run-button')?.disabled, buttonTitle: document.querySelector('.run-button')?.title }))()`);
  check('an unsegmented film outside the batch reads UNSEGMENTED with its run button disabled for the batch', outsideCard.eyebrow === 'UNSEGMENTED' && outsideCard.title === 'No segmentation yet' && outsideCard.disabled === true && outsideCard.buttonTitle === 'Wait for the batch to finish', outsideCard);
  backRect12 = await cdp.rect('.icon-btn[aria-label="Back to studies"]');
  await cdp.click(backRect12.cx, backRect12.cy);
  await cdp.settle(150);

  const oneDone12 = await waitForState('s.batch !== null && s.batch.done === 1', 400000);
  const progress12b = await readProgress();
  check('after the first film the bar reads 1 of 2 done and the sidebar 1 OF 2 DONE', oneDone12 === true && progress12b.text === '1 of 2 done' && progress12b.sidebar === '1 OF 2 DONE', progress12b);
  const finished12 = await waitForState('s.batch === null', 400000);
  s = await cdp.state();
  const a12 = s.studies.find((x) => x.id === 'SP-9002');
  const b12 = s.studies.find((x) => x.id === 'SP-9003');
  check('both films carry measurements and geometry when the batch ends', finished12 === true && Boolean(a12 && a12.measurements && a12.geometry) && Boolean(b12 && b12.measurements && b12.geometry), { a: Boolean(a12 && a12.measurements), b: Boolean(b12 && b12.measurements) });
  check('the closing toast reports the batch', s.toast === 'Segmented 2 of 2 films.', s.toast);
  const after12 = await readProgress();
  check('running is clear, the sidebar sublabel is gone and the segment button is back', s.running === null && after12.sidebar === null && after12.segmentButton === true, { running: s.running, ...after12 });
  const summaryAfter12 = await summaryParts();
  check('the summary lost two unsegmented films', summaryBefore12 !== null && summaryAfter12 !== null && summaryAfter12.unsegmented === summaryBefore12.unsegmented - 2, { before: summaryBefore12, after: summaryAfter12 });
  const bar12After = await readBar();
  check('the ticks survive the batch and the button says every selected film is segmented', s.paramSelected.includes('SP-9002') && s.paramSelected.includes('SP-9003') && bar12After.label === 'Segment 0 selected' && bar12After.note === 'All selected studies are segmented', { selected: s.paramSelected, ...bar12After });

  // 13. Stop finishes the film in flight and starts no other (spec 11).
  await injectFilm({ id: 'SP-9004', fileName: 'batch-c.jpg', filePath: null, workspaceFolder: null, base64: SAMPLE_BASE64 });
  await injectFilm({ id: 'SP-9005', fileName: 'batch-d.jpg', filePath: null, workspaceFolder: null, base64: SAMPLE_BASE64 });
  await cdp.setState('{ paramSelected: ["SP-9004", "SP-9005"] }');
  await cdp.settle(200);
  const segRect13 = await cdp.rect('[data-find-key="segment"]');
  await cdp.click(segRect13.cx, segRect13.cy);
  const started13 = await waitForState('s.batch !== null && s.running !== null', 5000);
  check('the second batch starts with SP-9005 in flight', started13 === true && (await cdp.state()).running === 'SP-9005', (await cdp.state()).running);
  const stopRect = await cdp.rect('[data-find-key="stop"]');
  await cdp.click(stopRect.cx, stopRect.cy);
  await cdp.settle(150);
  const stopping13 = await readProgress();
  s = await cdp.state();
  check('Stop marks the batch stopping: the text, the disabled Stop and the sidebar say so', stopping13.text === 'Stopping after this film…' && stopping13.stopDisabled === true && stopping13.sidebar === 'STOPPING', stopping13);
  check('the film in flight keeps running after Stop', s.running === 'SP-9005' && s.batch && s.batch.stopping === true, { running: s.running, batch: s.batch });
  const finished13 = await waitForState('s.batch === null', 400000);
  s = await cdp.state();
  const c13 = s.studies.find((x) => x.id === 'SP-9004');
  const d13 = s.studies.find((x) => x.id === 'SP-9005');
  check('the batch ends after the film in flight, the other left unsegmented', finished13 === true && Boolean(d13 && d13.measurements) && c13 && c13.measurements === null, { c: Boolean(c13 && c13.measurements), d: Boolean(d13 && d13.measurements) });
  check('the toast says the batch stopped', s.toast === 'Segmented 1 of 2 films, then stopped.', s.toast);
  const bar13 = await readBar();
  check('the bar offers the film Stop left behind and notes the one it segmented', bar13.label === 'Segment 1 selected' && bar13.disabled === false && bar13.note === '1 already segmented', bar13);

  // 14. No new console errors or exceptions across the batch sections.
  check('no console errors or exceptions during the batch sections', cdp.errors.length === errorsAfter9, cdp.errors.slice(errorsAfter9));
```

The `…` in the `Stopping after this film…` literal and the `·` in the toast literals and the summary regex are glyphs, as the file's existing `·` literals are; write them as glyphs here (the suite is not renderer source, and its existing regexes carry the glyph), and keep them glyphs through the byte-check.

- [ ] **Step 3: Run the suite on a fresh launch; then the workspace suite on its own launch**

```bash
SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/task6-launch.txt 2>&1
node tools/smoke/smoke-studies.mjs > tools/smoke/out/task6-studies.txt 2>&1
node tools/smoke/cdp.mjs --quit
SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/task6-ws-launch.txt 2>&1
node tools/smoke/smoke-workspace.mjs > tools/smoke/out/task6-workspace.txt 2>&1
node tools/smoke/cdp.mjs --quit
```

Expected: `task6-studies.txt` ends `103/103 checks passed` (60 existing, the stale one now green, plus 43 new); `task6-workspace.txt` ends `100/100 checks passed`. A silent file means the suite threw: re-run it bare on a FRESH launch and read the stack. The mid-batch card checks (section 12) race the first film's ~9 s run against two openings of ~1 s; if they fail with the batch already finished, re-run once on a fresh launch before treating it as a regression, and say so in the commit. Count the checks in the file and correct the figure above if it differs.

- [ ] **Step 4: The README's baselines**

In `tools/smoke/README.md`:

- ~line 113: `measured "14 STUDIES · 1 IN QUEUE" that way` → `measured "14 STUDIES · 1 UNSEGMENTED" that way (the summary read IN QUEUE until 2026-09-08)`.
- The "Known baseline" paragraph (~lines 257–264): replace the `smoke-studies.mjs` clause so it reads `smoke-studies.mjs 103/103 — its stale diagnosis check was fixed 2026-09-08 (it searches "meyerding", a word only SP-0042 carries); sections 10–14 run three real batches (two films, one unreadable film, two films with a Stop), about three more real runs, so the suite takes roughly a minute longer; it must run on a FRESH launch, never after smoke-workspace.mjs on the same instance, whose loaded films are still unsegmented (summary reads n+1 studies, 1 unsegmented then reads 3 UNSEGMENTED, 2026-09-08)`. Keep the rest of the paragraph (unit 426/426 now; `smoke-workspace.mjs` 100/100; `smoke-parameters.mjs` 58/58; `smoke-seeding.mjs` 36/36; `smoke-persist.mjs` 34/34 then 44/44).
- In the plan-05 section, after the paragraph beginning "**`smoke-studies.mjs` segments `SP-9000` twice**", add: "**Sections 10–14 (2026-09-08) segment three more injected copies of the sample film** in two batches and fail a third on purpose (`SP-9001` has no bytes and no file). They leave `SP-9002`, `SP-9003` and `SP-9005` segmented and `SP-9001`, `SP-9004` unsegmented, so the summary ends `n+6 STUDIES · 2 UNSEGMENTED`."

- [ ] **Step 5: Byte-check and commit**

Run: `git diff -- tools | grep -nP '[^\x00-\x7F]'`
Expected: the glyph lines this task wrote on purpose (`·`, `…`, `—`) and nothing that used to be an escape.

```bash
git add tools/smoke/smoke-studies.mjs tools/smoke/smoke-workspace.mjs tools/smoke/README.md
git commit -m "test: studies smoke reads UNSEGMENTED, fixes the stale diagnosis search, drives three batches (sections 10-14)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Records — the contract, HANDOFF, ROADMAP, the two older specs, the batch spec's §9 wording

**Files:**
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md`
- Modify: `docs/superpowers/HANDOFF.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/superpowers/specs/2026-08-31-spine-contour-ui-redesign-design.md` (§9.4, §9.5)
- Modify: `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` (§10.3)
- Modify: `docs/superpowers/specs/2026-09-08-batch-segmentation-design.md` (§9's "waiting" sentence and the example's name)

These are prose; write with the house style of each file (they use em dashes and `§` glyphs freely — the no-glyph rule is for JS source only). Verify each anchor exists with `grep -n` before editing; if one has moved, find the sentence and edit it where it is.

- [ ] **Step 1: The contract**

(a) State shape: after the `runStage: null,           // string | null` line add:

```
  batch: null,              // (2026-09-08, batch spec §8.1) the running batch or null: { ids, done, failed,
                            // warnings, skipped, stopping }, replaced wholesale by renderer/batch.js; never persisted;
                            // in SIDEBAR_KEYS and in the Studies screen's own update() key; state.running is untouched
```

(b) The `paramSelected` line: append to its comment `; (2026-09-08) also ticked on the Find tab's rows — one selection for both tabs`. The `paramFilters` block: append to its comment `; (2026-09-08) `workspace` and `folder` are shared with the Find tab's selects`.

(c) File structure: change the `screens/studies.js` line to add `; (2026-09-08) the Find tab's filter bar (workspace and folder selects over the shared keys), row ticks and select-all over the shared paramSelected, the segment button and the batch's progress group; the summary reads UNSEGMENTED`. Change the `screens/analysis.js` line to `exports setFilePayload, releaseStudy(studyId) (plan 06); segmentStudy(studyId, {batch}) → {ok, warning?} | {ok: false, reason} (2026-09-08, batch spec §8.3) — the run core, never throws; state.running set and cleared inside`. After the `components/toast.js` block add:

```
  components/checkbox.js          (2026-09-08) checkbox({key, keyAttr, label, checked, note, ariaLabel, indeterminate, onChange, onClick})
                                  — the tick box both Studies tabs build; keyAttr is data-param-key (grid) or data-find-key (list)
```

After the `viewer/measure-queue.js` block add:

```
  batch.js                        (2026-09-08, batch spec §8.2) startBatch(ids), stopBatch() — the one wiring of data/batch.js's
                                  createBatchDriver to the store, the toast, persistenceDisabledReason and segmentStudy; module scope
```

After the `data/pairing.js` block add:

```
  data/batch.js                   (2026-09-08) pure: planBatch({visible, selected, running}) → {ids, label, note, enabled};
                                  newBatch, advance, withStopping, isQueued, progressText, sidebarText, batchMessage;
                                  createBatchDriver({segment, getState, setState, showToast, persistenceDisabledReason})
```

Change the `data/parameters.js` block to mention `matchesLocation(study, filters) (2026-09-08)`. Add `batch.test.js` to the test list. In the `components/viewer.js` block append: `The run card's eyebrow is UNSEGMENTED for a real study without a result, QUEUED only for a film in the running batch, RUNNING for the film in flight (2026-09-08); the Run and re-run buttons are disabled while a batch is up.`

(d) In the `renderer/data/status.js` section, after "`deriveStatus` does not.", add: `A batch's queued films are 'proc' by rule 1 and are badged Processing like any unsegmented film; the Studies summary counts them as UNSEGMENTED and the batch's own progress is the filter bar's and the sidebar's (2026-09-08, batch spec decisions 7–8).`

- [ ] **Step 2: HANDOFF**

(a) The header's `**This copy is on:**` paragraph: replace with `**This copy is on:** \`claude/batch-segmentation\` (batch segmentation of loaded films; branched 2026-09-08 off the studies tip \`192f303\`), worktree \`C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628\` — see the first section under "Where things stand" and \`docs/superpowers/NEXT-SESSION.md\`.` and set `**Last updated:**` to the date of the edit.

(b) Under `## Where things stand`, insert as the FIRST subsection:

```
### Batch segmentation — DONE (branch `claude/batch-segmentation`)

Spec `docs/superpowers/specs/2026-09-08-batch-segmentation-design.md` (decisions 51–66 below); plan
`docs/superpowers/plans/2026-09-08-batch-segmentation.md` (Tasks 1–7, its `## Ledger` at the end). Commits:
`git log --oneline 192f303..HEAD`.

- `renderer/data/batch.js` (pure): `planBatch` decides what the Find tab's segment button runs and says (ticked visible
  real unsegmented rows, else every visible one; the notes of spec §7.3); `newBatch`/`advance`/`withStopping` are the
  batch object's transitions; `progressText`, `sidebarText`, `batchMessage`; `createBatchDriver` is the loop over
  injected dependencies. `renderer/batch.js` wires it (`startBatch`, `stopBatch`).
- `screens/analysis.js` exports `segmentStudy(studyId, {batch})`, the run core: an outcome, never a throw; in batch
  mode no picker, no toast, no image-cache write off screen, bytes not parked. Three guards: the run handler and the
  core refuse while `state.batch` is set (the picker re-checks when it resolves), `restoreFilm`'s run guard is per
  study, the viewer's Run and re-run buttons are disabled during a batch.
- The Find tab: Workspace and Folder selects over the shared `paramFilters` keys; a tick in every real row's STUDY
  cell and a select-all, over the shared `paramSelected`; `Segment N unsegmented` / `Segment N selected` with a
  visible note; while a batch runs a spinner, `{done} of {total} done` and `Stop`; the summary reads
  `{n} STUDIES · {m} UNSEGMENTED`; two empty-state wordings. The sidebar's Studies row reads `{done} OF {total} DONE`
  / `STOPPING`. The viewer's card reads `UNSEGMENTED` / `QUEUED` (in the batch) / `RUNNING`.
- Verified (fill in at the wrap): unit 426/426; `smoke-studies.mjs` 103/103 (the stale diagnosis check fixed);
  `smoke-workspace.mjs` 100/100; `smoke-parameters.mjs` 58/58; `smoke-persist.mjs` 34/34 then 44/44. Task 5's human
  gate: (the outcome, from the commit body).
```

(c) Under `## Decisions already made`, after decision 50, add a lead-in and decisions 51–66, one per spec §6 entry, each in the file's `**bold claim.** *Why:* … *Cost if wrong:* …` form, headed:

```
The following were settled with the user in chat on **2026-09-08**, at the batch-segmentation brainstorm, and are
the spec's §6 (`2026-09-08-batch-segmentation-design.md`). Implemented by plan `2026-09-08-batch-segmentation.md`.
```

Write each of the sixteen from the spec's §6, in order, keeping the spec's wording of the claim, the why and the cost; number them 51 to 66. Do not paraphrase the costs.

(d) In `## Known traps`, add a bullet ONLY for a trap execution actually hit (the ledger says which); otherwise nothing.

- [ ] **Step 3: ROADMAP, the two older specs, the batch spec**

(a) `docs/ROADMAP.md` item 3: after the 2026-09-04 note at the top, add a `> **2026-09-08:**` note: `the batch driver (\`renderer/batch.js\`, \`startBatch(ids)\`) is the vehicle for "re-run a selection": it skips segmented films by rule today (batch spec decision 2), and an explicit re-run flag that lifts that rule — after the provenance field exists — is the remaining piece.`

(b) `docs/ROADMAP.md` §5: mark the `smoke-studies.mjs reads 59/60` bullet done (`**Fixed 2026-09-08** — the suite searches "meyerding".`), and add a bullet: `**`/predict` has no timeout.** Neither a single run nor a batch bounds the wait for the backend; a hung backend hangs the run, and a batch's Stop then never returns. Bound the fetch in `main.js`'s predict handler (a generous ceiling, minutes, since a film takes up to a minute on the tested laptop) and surface the timeout as the run's failure reason. Recorded at the batch-segmentation brainstorm (2026-09-08).`

(c) Redesign spec §9.4: change `{n} STUDIES · {m} IN QUEUE` to `{n} STUDIES · {m} UNSEGMENTED`, and after the search sentence add: `A filter bar (2026-09-08, batch spec §7) carries \`Workspace\` and \`Folder\` selects, shared with the Parameters tab, and the segment button — \`Segment N unsegmented\`, or \`Segment N selected\` over the ticked rows — which a running batch replaces with its count and a Stop. Each real row's STUDY cell carries a tick box; the header a select-all.` In §9.5, change `` `QUEUED` / `RUNNING` state `` to `` `UNSEGMENTED` / `QUEUED` (in the running batch) / `RUNNING` state (2026-09-08) ``.

(d) Pre-op/post-op spec §10.3: add at the end of the filters paragraph: `(2026-09-08) The workspace and folder filters are the Studies screen's: the Find tab shows the same two selects over the same keys.`

(e) Batch spec §9: replace the sentence `"Waiting in the batch" means the id is in \`batch.ids\` at an index greater than \`batch.done\`; the film at index \`batch.done\` is the one in flight, and it is \`state.running\` that says so.` with `"Waiting in the batch" means the id is in \`batch.ids\` at an index at or after \`batch.done\` and it is not the film in flight; \`state.running\` says which film that is (planning ruling: between two films \`running\` is null for the milliseconds the next film's bytes take to read, and the card must not flash).` And in the toast example under §9's table, `S003.png (file not found), S007.png (…)` → `S003 (file not found), S007 (…)` with a note that a failure names the study by its display name.

- [ ] **Step 4: Verify and commit**

Run: `node --test test/*.test.js` — 426/426 (nothing under `renderer/` changed; a sanity check that the tree is whole). Read each edited passage once against the code it describes.

```bash
git add docs/superpowers/plans/2026-08-31-00-architecture-contract.md docs/superpowers/HANDOFF.md docs/ROADMAP.md docs/superpowers/specs/2026-08-31-spine-contour-ui-redesign-design.md docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md docs/superpowers/specs/2026-09-08-batch-segmentation-design.md
git commit -m "docs: record batch segmentation in the contract, handoff, roadmap and the specs" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review against the spec

Run by the planner after writing (2026-09-08):

- **Spec coverage.** §7.1 filter bar → Task 5 (bar) and Task 2 (`matchesLocation`); §7.2 ticks → Task 5 (rows, select-all) and Task 2 (the shared checkbox); §7.3 button → Task 1 (`planBatch`) and Task 5; §7.4 progress group → Task 1 (`progressText`) and Task 5; §7.5 empty states → Task 5; §8.1 store → Task 1; §8.2 driver → Task 1 (factory) and Task 4 (wiring); §8.3 run core, the three guards, bytes not parked → Task 3; §8.4 planner → Task 1; §8.5 model choice → Task 3 (unchanged read of `getState().models`); §9 summary, badges (unchanged), sidebar → Task 4, viewer card → Task 3, toast → Task 1; §10 failures → Tasks 1 and 3; §11 stop/delete/navigation/quit → Tasks 1, 3, 5 (delete's selection clearing already exists); §12 testing → Tasks 1, 2, 5 (gate), 6; §16 amendments → Task 7. No gap found.
- **Placeholder scan.** No TBD/TODO; every code step carries its code; the only "at the planner's discretion" names in the spec are fixed here (`matchesLocation`, `components/checkbox.js`).
- **Type consistency.** `segmentStudy(studyId, { batch })` → `{ ok, warning? } | { ok: false, reason }` in Tasks 3, 4 and the driver's `segment` in Task 1; `planBatch` → `{ ids, label, note, enabled }` in Tasks 1 and 5; `advance`'s outcome shape in Task 1's tests, module and driver; `data-find-key` values in Tasks 5 and 6; the toast strings in Task 1's tests and Task 6's expectations (`Segmented 0 of 1 film. · 1 could not be segmented: S001 (file not found)` — `S001` is `studyName` of a film named `S001.png` with `name: null`).
- **Counts.** Unit: 402 → 425 (Task 1) → 426 (Task 2). Smoke studies: 60 → 103 (43 new checks in sections 10–14, counted by the planner; Task 6 re-counts).

## Ledger

This section travels with the repo. Append a session-end line at every wrap; record every decision
made in chat as `Ruling: <what> — <why> — <cost if wrong>`.

Session 2026-09-08 (brainstorm and planning): the studies tip had not moved (`192f303`); branch `claude/batch-segmentation`
created off it. Brainstorm in chat with four user decisions — the Find tab as the entry point with ticks and workspace/folder
filters (A plus selection, the user's addition to the three options offered), skip already-segmented rows, approach 1 of
three for the mechanics, and the two-part design as presented — written into the spec (`02b04c6`, sixteen §6 decisions).
The spec's self-review added three guards to the run-core split (the relocate picker re-check, the per-study restore guard,
bytes not parked). Planner rulings are in "Rulings made while planning" above. Execution method: subagent-driven, a fresh
subagent per task with two-stage review; Sonnet for Tasks 1, 2, 4, 6, 7, Opus for Tasks 3 and 5; never Fable. Task 5 commits
before its human gate with a pending line and is amended after; the ledger stays uncommitted during the gate; every suite in
the foreground with output captured to a file.
