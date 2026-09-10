# Studies Table — Delete Selected, Sortable Headers, Editable Subject, Reviewed Status — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Find tab's bar gets a `Delete` that acts on the ticked visible rows (the library-level `Delete all studies` goes); every column of the Find list sorts with the Parameters grid's own header control; PATIENT becomes SUBJECT and edits in place; a stored `reviewedAt` gives a fourth status, `Reviewed`, set from the Analysis screen and cleared by every write that changes the numbers; demo hiding becomes a development-only Settings toggle.

**Architecture:** Four pure additions carry the logic and the tests — `reviewedAt`/`'ok'` in `data/status.js` and `data/persistence.js`, a new `data/find.js` for the list's sort, `subjectLabel` in `data/labels.js`, and a new `data/demo-visibility.js` for the toggle's store patch. `screens/studies.js` grows the bar's Delete and prompt, the sortable header row, the in-place SUBJECT editor and the `TO REVIEW` count, all through the module-scope state and rebuild-key pattern it already uses. `screens/analysis.js` grows the `Mark reviewed` toggle and the list's status badge in its header. A new `renderer/demo-studies.js` beside `renderer/batch.js` wires the toggle to a renamed IPC (`set-demo-studies-hidden`, refused when packaged). The four numbers-changing writes each gain one `reviewedAt: null`.

**Tech Stack:** Vanilla ES modules, no bundler, no runtime dependencies. `node --test` for pure logic. The CDP smoke harness in `tools/smoke/` for DOM behaviour. Electron 44 / Chromium 152. Node 24.

**Spec:** `docs/superpowers/specs/2026-09-10-studies-table-review-design.md` ("the spec" below; every "§" without a prefix refers to it). Read its §5–§11 before starting; §12 is the amendments Task 9 writes; §13 the testing this plan implements. The redesign spec is `docs/superpowers/specs/2026-08-31-spine-contour-ui-redesign-design.md` ("spec §"), the pre-op/post-op spec `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` ("pp §"), the batch spec `docs/superpowers/specs/2026-09-08-batch-segmentation-design.md` ("batch §"). The binding architecture contract `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` wins over this plan; Task 9 amends it.

## Global Constraints

Copied from `CLAUDE.md` and the spec. Every task's requirements include these.

- **Never display a fabricated measurement or a fabricated status.** Absent values render `—` (U+2014). `Reviewed` is shown only while `reviewedAt` is set, and it is cleared by every commit that replaces `measurements`, `geometry` or `calibration` (§8.4). The QC warnings stay visible after a review (§8.2).
- **Status is derived from the record, the review mark included.** `deriveStatus(study)` stays a pure function of the record; the "currently running" half of spec §13.1 lives in `displayStatus(study, runningId)`, never in `deriveStatus`.
- **Never delete what the user cannot see.** Delete acts on `selectedVisible(...)` — the ticked rows that are visible — exactly as the segment button does (§5.2). Demo studies are never deleted; they have no tick.
- **Never mutate store state in place.** Every `setState` patch passes a NEW object or array; `findSort` is replaced wholesale. `setState` must not be called from inside a subscriber: the Studies screen's `update()` and the Analysis screen's `update()` run inside store notifications, and only DOM event handlers, microtasks queued from them, and async functions call `setState`.
- **The Studies screen's `update()` key array must list every store key and every module-scope value the Find tab reads** — this plan adds `findSort`, `confirmingSelected` and `editing` to it (Task 4). `router.js`'s `SIDEBAR_KEYS` gains `deletingStudies` (Task 5). Miss one and the surface silently stops repainting.
- **Every optional record field must be listed in `validateStudy`'s returned object** or the saver writes it and the next load drops it — `reviewedAt` (Task 1). No `STORE_VERSION` bump: optional, default `null`.
- **`el()` assigns to the property when the key exists on the node.** Pass real booleans (`disabled: false`, `checked: true`, `hidden: true`, `spellcheck: false`), never `'false'`. Never pass `style`, `list`, `dataset` or `form` as an `el()` prop.
- **Never change the form of a non-ASCII character on a line you touch, and write any NEW non-ASCII character in JS source as a `\uXXXX` escape** (HANDOFF known trap, 2026-09-08: the Edit and Write tools rewrite escapes as glyphs; both forms compare equal at runtime, so no test catches it). Some existing lines carry glyphs (`·` in the Studies summary, `—` in `study.view || '—'`): leave those characters as they are on any line you touch, and add new ones as escapes on the same line. Byte-check the diff before every commit that touches such a line — `git diff -U0 -- <files> | grep -nP '^[+-].*[^\x00-\x7F]'` must show every `+` line that carries a glyph paired with a `-` twin carrying the same glyph, and no other `+` line — and repair with a small Python script written to a file, never with `sed` or a `bash -c` one-liner. Markdown files (docs, this plan's ledger) are exempt.
- **No bundler, no framework, no runtime dependencies.** `dependencies` stays empty; `devDependencies` stays exactly `electron` and `electron-builder`. **Do not loosen the CSP.** No allowlist change: both electron-builder allowlists already ship `renderer/**/*` and `styles/**/*` by glob, and every new module is under `renderer/`. `main.js` and `preload.js` are already listed.
- **Unit tests run as `node --test test/*.test.js`** (the glob form; the directory form fails on Node 24). Baseline before this plan: 479/479 on `6106463`.
- **Pure-logic modules get real `node --test` coverage. DOM code gets explicit manual verification and smoke checks.** Never write a fake test.
- **Smoke selectors key on `data-find-key`, `data-param-key` and `data-study-id`, never on a visible label.** A smoke suite that prints nothing has thrown — re-run it bare and read the stack. Run every suite in the FOREGROUND and capture its output to a file under `tools/smoke/out/` (`> tools/smoke/out/<name>.txt 2>&1`); never background one and wait for it. Never re-run a suite on an instance where one was killed mid-run; relaunch. `smoke-studies.mjs` runs on a FRESH launch, never after `smoke-workspace.mjs` on the same instance, and never between `smoke-persist.mjs --phase run` and `--phase restart`.
- **Conventional commit prefixes** (`feat:`, `fix:`, `test:`, `docs:`, `chore:`); commit after every task; every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Write a multi-line message to a file under `tools/smoke/out/` and `git commit -F` it.
- **Branch:** `claude/studies-table-ui-updates-953945` in the worktree `C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d` (re-pointed at `fork/main` @ `6106463` on 2026-09-10; the spec is `e6178fe`). Push only to `fork`, never `origin`; never merge to `main`; never rename onto `ui-redesign-cw`; push only after the last amend of the gated commit.
- **Running the app from source** (three lines, from PowerShell; the shell starts in `C:\Users\codyj`):

  ```
  Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d"
  $env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"
  npm.cmd run dev
  ```

  The backend needs `backend/requirements-export.txt` installed in the venv and `python tools/export_onnx.py` run once (CLAUDE.md's ONNX amendment); if `/health` never comes up, that is the first thing to check. Smoke harness on a scratch profile, from the Bash tool with the variable set in the same command: `SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/<task>-launch.txt 2>&1` (refuses with exit 3 if port 9222 is held), the suite, then `node tools/smoke/cdp.mjs --quit`. An app instance left open from an earlier day (an `electron.exe` not on port 9222) runs old code; never kill it unasked — it may be on the user's real library.
- **Subagent models (user instruction, 2026-09-10): the lowest model that completes the task reliably.** Sonnet for every task whose code is complete in this plan (1, 2, 3, 5, 6, 7, 9) and for their reviews; Opus for Task 4 (the Find tab rewrite, with its focus and rebuild subtleties) and its review; the orchestrator runs the human gate (Task 8) itself. Never Fable. Every dispatch that runs a smoke suite says "foreground, capture to a file". Set the model explicitly on every dispatch.

## File structure

| File | Responsibility | Status |
|---|---|---|
| `renderer/data/status.js` | `deriveStatus` gains `'ok'`; `isReviewed`, `displayStatus`, `reviewedLabel`, `reviewBlockedReason` and its four reason constants | modify |
| `renderer/data/persistence.js` | `validateStudy` carries `reviewedAt` (optional, null, non-date dropped with a warning) | modify |
| `renderer/components/status-badge.js` | `statusBadge(status)`, `unsupportedViewBadge(view)` — the one badge both screens show | create |
| `styles/components.css` | `.badge-ok` | modify |
| `renderer/data/find.js` | pure: `DEFAULT_FIND_SORT`, `FIND_SORT_KEYS`, `statusRank`, `toggleFindSort`, `sortFindRows` | create |
| `renderer/data/labels.js` | `subjectLabel(study)` | modify |
| `renderer/store.js` | `findSort: { key: 'date', dir: 'desc' }` | modify |
| `renderer/screens/analysis.js` | the run commit clears `reviewedAt`; the header's status badge; `Mark reviewed` and its note | modify |
| `renderer/viewer/measure-queue.js` | the correction commit clears `reviewedAt` | modify |
| `renderer/components/viewer.js` | RESET TO PREDICTION clears `reviewedAt` | modify |
| `renderer/calibration.js` | `withCalibration(study, calibration)`: unchanged scale → same record; changed → new record, `reviewedAt: null`; both writes go through it | modify |
| `renderer/screens/studies.js`, `styles/screens/studies.css` | the bar's Delete and prompt; sortable headers; the SUBJECT column and its editor; the summary's third clause; `newStudy` carries `reviewedAt`; delete-all removed | modify |
| `renderer/data/delete-studies.js` | `deleteStudyBatch(studies, { deletePrediction })` — the demo branch is gone | modify |
| `main.js`, `preload.js`, `renderer/api.js` | `hide-demo-studies` → `set-demo-studies-hidden(hidden)`, refused when packaged | modify |
| `renderer/data/demo-visibility.js` | pure: `demoStudiesShown(state)`, `demoVisibilityPatch(state, shown)` | create |
| `renderer/demo-studies.js` | `demoToggleAvailable()`, `setDemoStudiesShown(shown)` — the toggle's wiring | create |
| `renderer/components/sidebar.js`, `renderer/router.js` | the `DEMO STUDIES` block; `deletingStudies` in `SIDEBAR_KEYS` | modify |
| `styles/screens/analysis.css` | the actions row holds two buttons and a note; `.analysis-status` | modify |
| `test/status.test.js`, `test/persistence.test.js`, `test/studies.test.js`, `test/labels.test.js`, `test/store.test.js`, `test/measure-queue.test.js`, `test/delete-studies.test.js` | extended | modify |
| `test/find.test.js`, `test/calibration-review.test.js`, `test/demo-visibility.test.js` | the new pure suites | create |
| `tools/smoke/smoke-studies.mjs`, `tools/smoke/smoke-persist.mjs`, `tools/smoke/README.md` | the renamed column, the summary's third clause, sections 15–17, the persisted subject and mark, the re-run clearing the mark; baselines | modify |
| the contract, the three specs, `docs/superpowers/HANDOFF.md`, `docs/ROADMAP.md`, `CLAUDE.md`, this plan's ledger | records | modify |

Boundaries: `renderer/data/*` never imports from `renderer/screens/`, `renderer/components/` or the root-level `renderer/*.js`. `data/find.js` imports `displayStatus` from `data/status.js` and the four labels from `data/labels.js`. `data/demo-visibility.js` imports `merge` from `data/persistence.js` and `withIds` from `data/parameters.js`. `components/status-badge.js` imports `dom.js`, `data/status.js` and `data/inference-view.js`. `renderer/demo-studies.js` imports `store.js`, `api.js`, `components/toast.js` and `data/demo-visibility.js`; `components/sidebar.js` imports it (it already imports the root-level `processing.js`). `screens/analysis.js` imports `components/status-badge.js` and never `screens/studies.js` (`screens/studies.js` imports it: a cycle would be the other way). No cycle.

## Rulings made while planning (2026-09-10)

Settled with the user at the brainstorm (the spec's §11) or made by the planner against the code and recorded here so the executor does not re-decide them. Each carries what it costs if wrong.

- **Ruling (user): filters stay as the shared Workspace/Folder selects; every column sorts; Delete acts on ticked visible rows and never on demos; PATIENT → SUBJECT, editable in place by single click; the demo toggle is development-only and never in the installer; no bulk mark-reviewed.** Spec §11.1–6. — Cost if wrong: recorded there.
- **Ruling (planner, spec §11.7–10): a calibration change clears the mark; no CSV column; the summary gains `TO REVIEW`; Enter in a SUBJECT cell moves down.** — Cost if wrong: one line each.
- **Ruling: the fourth status key is `'ok'`** (`'seg'|'rev'|'proc'|'ok'`), label `Reviewed`, badge class `badge-ok`. Three letters like its siblings; `rvd` reads as nothing. — Cost if wrong: a rename.
- **Ruling: `.badge-ok` is the sage ground at 26% with ink text and a sage dot**, not a filled sage ground with white text: sage on white is under 4.5:1 at 12.5 px in both themes. The gate checks legibility in light and dark. — Cost if wrong: one CSS rule.
- **Ruling: task order is status model → find sort → clearing sites → Find tab → delete/demo toggle → Analysis → smoke → gate → records.** The Find tab (Task 4) calls `deleteStudyBatch(targets, { deletePrediction })` against the OLD implementation, which never calls `hideDemos` for real-only targets, so it is safe before Task 5 changes the signature; Task 4 also removes `screens/studies.js`'s `hideDemoStudies` import, so Task 5 can drop the export without breaking the boot. Task 2's status-sort test needs Task 1's `'ok'`. — Cost if wrong: a reorder.
- **Ruling: `displayStatus(study, runningId)` lives in `data/status.js`** and is the one place spec §13.1's "or currently running" rule is written; `screens/studies.js`'s two inline copies of it and the Analysis header's badge all call it. `deriveStatus` is untouched in signature. — Cost if wrong: one function.
- **Ruling: `subjectLabel(study)` lives in `data/labels.js`** beside `workspaceLabel` and `folderLabel` (the cell labels), returning the subject id, else the demo record's `pt`, else the em dash; `data/find.js` treats the dash as absent for sorting. The grid's own subject cell (`study.subjectId || DASH`) is untouched. — Cost if wrong: one function.
- **Ruling: the SUBJECT editor opens on a single click on the cell** (spec §7.2), with `role="button"` and `tabindex="0"` on the cell so Enter/Space open it from the keyboard; nested under the row's `role="button"`, which the ROADMAP a11y item already carries for the tick. Enter commits and opens the editor on the next real row in the table's CURRENT DOM order (sorted, filtered) — that is the column the user is looking at. — Cost if wrong: one `mode` branch.
- **Ruling: `beginSubjectEdit` commits an editor already open on another row before opening the new one.** Chromium fires the old input's `blur` (and so its deferred commit) before the click on the new cell, so this is belt and braces — but an editor destroyed by a rebuild while focused gets no `blur`, and the guard is what keeps the typed text then. — Cost if wrong: one line.
- **Ruling: the Delete prompt replaces the bar's whole content** (selects, Delete, Segment) while it is up, as the old library-level prompt replaced its button; a change to the ticks, the search, the filters or the tab withdraws it. `update()` withdraws it by comparing the ticked visible ids with the ids it captured, so the prompt can never delete a set the user cannot see. — Cost if wrong: one comparison.
- **Ruling: `mounted` gains `bar`** (the bar host) beside `host` (the table host), so `refreshTable(selector)` can hand focus to a bar control (Delete, Cancel) as it hands it to a row control today. — Cost if wrong: one property.
- **Ruling: the summary line keeps its existing `·` glyph and adds the new separator as `\u00B7`** on the same line, so the byte-check passes without changing the form of a character on a touched line. Mixed forms compare equal at runtime. — Cost if wrong: one escape.
- **Ruling: the header cells stay plain `<div>`s** (the list is a CSS grid of divs with no table semantics; ROADMAP §5's accessibility pass owns that); the sort button carries a `title` that names the state instead of `aria-sort`, which is invalid outside a `columnheader` role. Task 9 adds the sortable header to the ROADMAP a11y item. — Cost if wrong: two attributes.
- **Ruling: `withCalibration(study, calibration)` returns the SAME record when the canonical JSON of the two scales is equal**, so a re-scan that finds the same ruler neither repaints nor un-reviews; `rememberCalibration` sets `changed` only when the record it got back is a new one. Exported for its unit test, since a valid calibration record is too long to build by hand. — Cost if wrong: one comparison.
- **Ruling: the demo toggle's store patch is a pure function in `data/demo-visibility.js`** (`demoVisibilityPatch(state, shown)`), tested; `renderer/demo-studies.js` writes the preference first and applies the patch even when the write fails (with a toast), the terms `changePerformance` uses for its own save. `FRESH_VIEW` is duplicated there with a comment, since `screens/studies.js` does not export it and `data/` may not import screens. — Cost if wrong: seven keys.
- **Ruling: `set-demo-studies-hidden` returns `false` without writing when `app.isPackaged`**, and the renderer never calls it in that case either (the Settings block is built only when `demoStudiesAllowed()`). Two gates, as the demo-loading rule has two. `demo-studies-hidden` (the read) is unchanged. — Cost if wrong: one `if`.
- **Ruling: `deletingStudies` joins `SIDEBAR_KEYS`** so the toggle's `busy` state repaints during a bulk delete; `studies` is already there for the Show/Hide pressed state. — Cost if wrong: one string.
- **Ruling: the Analysis header's badge is rebuilt only when its key changes** (`update()` runs on every pan frame); the `Mark reviewed` button's text, `aria-pressed`, `disabled` and note are assigned unconditionally (cheap property writes, no nodes). — Cost if wrong: a few lines.
- **Ruling: the smoke suite's new sections are numbered 15–17 and appended after the existing section 14's no-errors check**, with their own no-errors check against the count recorded at their start; the summary regex is updated at its three sites; the header check is rewritten to strip the sort marks. `smoke-persist.mjs` marks the study reviewed in `--phase run` (after the last nudge, before the state file is written), asserts the subject and the mark after the restart, and asserts the re-run cleared the mark. — Cost if wrong: minutes.
- **Ruling: Task 7 commits with a `Gate: pending` line and is amended after Task 8's gate passes; the ledger stays uncommitted during the gate.** Task 8 lists its checks in the chat message and ends the turn; the user is told to close any app instance left open from earlier first. — Cost if wrong: one amend.

---

### Task 1: The review mark on the record and the fourth status

**Files:**
- Modify: `renderer/data/status.js` (`deriveStatus`, `statusLabel`; new exports)
- Modify: `renderer/data/persistence.js:150-175` (`validateStudy`: the `filmDate` block and the returned object)
- Modify: `renderer/screens/studies.js:72-80` (`newStudy`)
- Create: `renderer/components/status-badge.js`
- Modify: `styles/components.css` (after `.badge-proc`)
- Test: `test/status.test.js`, `test/persistence.test.js`, `test/studies.test.js`

**Interfaces:**
- Consumes: `reviewReasons(study)`, `piResidual`/`RESIDUAL_LIMIT` (already in `status.js`); `optionalText` (already in `persistence.js`).
- Produces (binding on Tasks 2, 4, 6, 7):
  - `deriveStatus(study)` → `'seg'|'rev'|'proc'|'ok'`; `statusLabel('ok')` → `'Reviewed'`.
  - `isReviewed(study)` → `boolean` (a non-blank string `reviewedAt`).
  - `displayStatus(study, runningId = null)` → the status a row or header SHOWS (`'proc'` while `runningId === study.id`).
  - `reviewedLabel(reviewedAt)` → `'Reviewed \u00B7 Sep 10, 2026'` | `'Reviewed'`.
  - `reviewBlockedReason({ study, running = null, pending = false })` → `string|null`; constants `REVIEW_DEMO`, `REVIEW_NOTHING`, `REVIEW_RUNNING`, `REVIEW_PENDING`.
  - The Study record carries `reviewedAt: string|null`; `validate` returns it; `newStudy` sets it `null`.
  - `statusBadge(status)` → `HTMLElement` (`span.badge.badge-<status>` with a dot and the label); `unsupportedViewBadge(view)` → the `Unsupported view` badge the list shows today.

- [ ] **Step 1: Write the failing status tests**

Add a third import line and these tests at the end of `test/status.test.js`:

```js
import {
  isReviewed, displayStatus, reviewedLabel, reviewBlockedReason,
  REVIEW_DEMO, REVIEW_NOTHING, REVIEW_RUNNING, REVIEW_PENDING,
} from '../renderer/data/status.js';

// (2026-09-10, studies-table spec 8) the review mark and the fourth status.
const CLEAN = { measurements: { PI: 60, PT: 20, SS: 40 }, qc: { femoral: { confidence: 0.95 } } };
const SUSPECT = { measurements: { PI: 60, PT: 20, SS: 40 }, qc: { femoral: { confidence: 0.2 } } };
const MARK = '2026-09-10T12:00:00.000Z';

test('a review mark makes a study Reviewed whether or not its qc would ask for review, and the warnings stay', () => {
  assert.equal(deriveStatus({ ...CLEAN, reviewedAt: MARK }), 'ok');
  assert.equal(deriveStatus({ ...SUSPECT, reviewedAt: MARK }), 'ok');
  assert.equal(reviewReasons({ ...SUSPECT, reviewedAt: MARK }).length, 1);
});

test('a review mark over no measurements is still Processing; a blank or non-string mark is no mark', () => {
  assert.equal(deriveStatus({ measurements: null, reviewedAt: MARK }), 'proc');
  assert.equal(deriveStatus({ ...SUSPECT, reviewedAt: '' }), 'rev');
  assert.equal(deriveStatus({ ...SUSPECT, reviewedAt: null }), 'rev');
  assert.equal(deriveStatus({ ...CLEAN, reviewedAt: 12 }), 'seg');
  assert.equal(isReviewed({ reviewedAt: '  ' }), false);
  assert.equal(isReviewed({ reviewedAt: MARK }), true);
  assert.equal(isReviewed(null), false);
});

test('displayStatus reads Processing for the running study and deriveStatus otherwise', () => {
  const study = { id: 'SP-1000', ...CLEAN, reviewedAt: MARK };
  assert.equal(displayStatus(study, 'SP-1000'), 'proc');
  assert.equal(displayStatus(study, 'SP-1001'), 'ok');
  assert.equal(displayStatus(study, null), 'ok');
  assert.equal(displayStatus(study), 'ok');
  assert.equal(displayStatus(null, null), 'proc');
});

test('statusLabel names the fourth status', () => {
  assert.equal(statusLabel('ok'), 'Reviewed');
});

test('reviewedLabel carries the date and never invents one', () => {
  // Noon UTC so the local date is the 10th in every zone the app is tested in.
  assert.equal(reviewedLabel(MARK), 'Reviewed \u00B7 Sep 10, 2026');
  assert.equal(reviewedLabel('not a date'), 'Reviewed');
  assert.equal(reviewedLabel(null), 'Reviewed');
  assert.equal(reviewedLabel(undefined), 'Reviewed');
});

test('reviewBlockedReason: demo, then running, then nothing to review, then pending, then enabled', () => {
  assert.equal(reviewBlockedReason({ study: { id: 'SP-0042', source: 'demo', ...CLEAN } }), REVIEW_DEMO);
  assert.equal(reviewBlockedReason({ study: { id: 'SP-1000', source: 'real', ...CLEAN }, running: 'SP-1000' }), REVIEW_RUNNING);
  assert.equal(reviewBlockedReason({ study: { id: 'SP-1000', source: 'real', measurements: null }, running: null }), REVIEW_NOTHING);
  assert.equal(reviewBlockedReason({ study: { id: 'SP-1000', source: 'real', ...CLEAN }, pending: true }), REVIEW_PENDING);
  assert.equal(reviewBlockedReason({ study: { id: 'SP-1000', source: 'real', ...CLEAN }, running: 'SP-1001' }), null);
  assert.equal(reviewBlockedReason({ study: null }), REVIEW_NOTHING);
});
```

- [ ] **Step 2: Run the status suite to verify it fails**

Run: `node --test test/status.test.js`
Expected: FAIL — `isReviewed` is not exported (a SyntaxError on the import), so the whole file fails to load.

- [ ] **Step 3: Implement the status changes**

In `renderer/data/status.js`, replace `deriveStatus` and `statusLabel` (the last two functions) with:

```js
/** @returns {'seg'|'rev'|'proc'|'ok'} */
export function deriveStatus(study) {
  if (!study || study.measurements == null) return 'proc';
  if (isReviewed(study)) return 'ok';
  return reviewReasons(study).length ? 'rev' : 'seg';
}

// The review mark (studies-table spec 2026-09-10, section 8.1): a non-blank string on the record. It is an
// ISO timestamp -- validateStudy drops anything that is not a date -- but the status asks only
// whether a person set it. It outranks every qc reason (spec 8.2); the reasons themselves stay, and
// the Measurements panel keeps showing them after the review.
export function isReviewed(study) {
  return typeof study?.reviewedAt === 'string' && study.reviewedAt.trim() !== '';
}

// The status a row or a header SHOWS: spec 13.1's "or currently running" half, which is a property
// of state.running and not of the record. deriveStatus stays a pure function of the record; every
// surface that badges a study calls this with state.running, so the list, the summary, the sort
// and the Analysis header cannot disagree.
export function displayStatus(study, runningId = null) {
  return study && runningId !== null && runningId === study.id ? 'proc' : deriveStatus(study);
}

export function statusLabel(status) {
  if (status === 'seg') return 'Segmented';
  if (status === 'rev') return 'Needs review';
  if (status === 'ok') return 'Reviewed';
  return 'Processing';
}

const reviewedDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// The Analysis screen's button once marked (spec 8.3): `Reviewed \u00B7 Sep 10, 2026`, or just `Reviewed`
// when the stored value does not parse. It cannot fail to parse after validateStudy, but the label
// never guesses a date.
export function reviewedLabel(reviewedAt) {
  const time = Date.parse(reviewedAt ?? '');
  return Number.isNaN(time) ? 'Reviewed' : `Reviewed \u00B7 ${reviewedDate.format(new Date(time))}`;
}

export const REVIEW_DEMO = 'Demo studies are not saved';
export const REVIEW_NOTHING = 'Nothing to review yet';
export const REVIEW_RUNNING = 'Wait for the segmentation to finish';
export const REVIEW_PENDING = 'Wait for measurements to finish updating';

// Why the Mark reviewed button is disabled, or null when it is enabled (spec 8.3). In the order the
// screen would otherwise contradict itself: a demo is never saved whatever else is true; a study
// whose run is in flight has no numbers to review yet even when old ones are still on the record;
// no measurements means nothing to review; a pending correction means the numbers are about to
// change. `running` is state.running; `pending` is whether a measurement draft exists for it.
export function reviewBlockedReason({ study, running = null, pending = false }) {
  if (!study) return REVIEW_NOTHING;
  if (study.source === 'demo') return REVIEW_DEMO;
  if (running !== null && running === study.id) return REVIEW_RUNNING;
  if (study.measurements == null) return REVIEW_NOTHING;
  if (pending) return REVIEW_PENDING;
  return null;
}
```

Also update the file's header comment: after "Status is never stored on a Study — it is computed from measurements and qc every time it is needed." add the sentence " (2026-09-10) The review mark IS stored — `reviewedAt` — and the derivation reads it: a marked study is `ok` whatever its qc says." Keep the existing em dashes on those lines exactly as they are.

- [ ] **Step 4: Run the status suite to verify it passes**

Run: `node --test test/status.test.js`
Expected: PASS, every test including the six new ones.

- [ ] **Step 5: Write the failing persistence test**

Append to `test/persistence.test.js` (the file's `identity(id)` helper builds `{ id, source: 'real', fileName, addedAt, view }`):

```js
test('validate round-trips the review mark, defaults it to null, and drops a non-date with one warning (studies-table spec 8.1)', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const [bare] = validate({ version: STORE_VERSION, studies: [identity('SP-1000')] });
  assert.equal(bare.reviewedAt, null);
  // Listed on the returned object, or the saver writes it and the next load drops it.
  assert.ok('reviewedAt' in bare);
  const [marked] = validate({ version: STORE_VERSION, studies: [{ ...identity('SP-1001'), reviewedAt: '2026-09-10T12:00:00.000Z' }] });
  assert.equal(marked.reviewedAt, '2026-09-10T12:00:00.000Z');
  const [blank] = validate({ version: STORE_VERSION, studies: [{ ...identity('SP-1003'), reviewedAt: '   ' }] });
  assert.equal(blank.reviewedAt, null);
  assert.equal(warn.mock.callCount(), 0);
  const [bad] = validate({ version: STORE_VERSION, studies: [{ ...identity('SP-1002'), reviewedAt: 'yesterday' }] });
  assert.equal(bad.reviewedAt, null);
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /SP-1002/);
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `node --test test/persistence.test.js`
Expected: FAIL on `assert.ok('reviewedAt' in bare)` (the key is absent).

- [ ] **Step 7: Implement `reviewedAt` in `validateStudy`**

In `renderer/data/persistence.js`, directly after the `filmDate` block (the lines ending `console.warn(\`persistence: ${entry.id} has a film date that is not YYYY-MM-DD ...\`); }`) add:

```js
  // (2026-09-10, studies-table spec 8.1) the review mark, on the same optional-null terms as the
  // three fields above. A value that is not a date is dropped with a warning rather than failing
  // the record: a bad mark is not fatal, and a dropped one only asks for the review again.
  const reviewedText = optionalText(entry.reviewedAt);
  const reviewedAt = reviewedText !== null && !Number.isNaN(Date.parse(reviewedText)) ? reviewedText : null;
  if (reviewedText !== null && reviewedAt === null) {
    console.warn(`persistence: ${entry.id} has a review mark that is not a date ("${reviewedText}"); it is dropped.`);
  }
```

and in the returned object, directly after the `filmDate,` line, add `reviewedAt,`.

- [ ] **Step 8: Run it to verify it passes**

Run: `node --test test/persistence.test.js`
Expected: PASS.

- [ ] **Step 9: `newStudy` carries the mark — failing test, then the change**

In `test/studies.test.js`, extend the test `newStudy carries the three study fields as null` with two assertions before its closing brace:

```js
  assert.equal(study.reviewedAt, null);
  assert.ok('reviewedAt' in study);
```

Run `node --test test/studies.test.js` — expected FAIL on `'reviewedAt' in study`. Then in `renderer/screens/studies.js`'s `newStudy`, change the line

```js
    subjectId: null, timepoint: null, filmDate: null,
```

to

```js
    subjectId: null, timepoint: null, filmDate: null,
    // (2026-09-10, studies-table spec 8.1) the review mark; set on the Analysis screen, cleared by every write that changes the numbers.
    reviewedAt: null,
```

Run `node --test test/studies.test.js` — expected PASS.

- [ ] **Step 10: The badge component and its CSS (DOM; no unit test — say so in the commit)**

Create `renderer/components/status-badge.js`:

```js
/**
 * The status pill (spec 9.4; studies-table spec 2026-09-10, section 8.2), built in ONE place so the Find
 * list and the Analysis header cannot drift: the same classes (`badge badge-<status>`), the same
 * dot, the same label. `status` is what displayStatus() returned. The Unsupported view pill is the
 * list's other badge, for an unsegmented film whose view no model reads.
 */
import { el } from '../dom.js';
import { statusLabel } from '../data/status.js';
import { unsupportedViewReason } from '../data/inference-view.js';

export function statusBadge(status) {
  return el('span', { class: `badge badge-${status}` }, el('span', { class: 'dot' }), statusLabel(status));
}

export function unsupportedViewBadge(view) {
  return el('span', { class: 'badge badge-rev', title: unsupportedViewReason(view) },
    el('span', { class: 'dot' }), 'Unsupported view');
}
```

In `styles/components.css`, directly after the `.badge-proc { ... }` block, add:

```css
/* Reviewed (studies-table spec 2026-09-10, section 8.2): the completed state. A stronger sage ground than
   Segmented's with ink text and a sage dot, so it reads in both themes; a filled sage ground with
   white text is under 4.5:1 at this size. */
.badge-ok {
  background: color-mix(in srgb, var(--sage) 26%, transparent);
  color: var(--ink);
}
.badge-ok .dot {
  background: var(--sage);
}
```

Nothing imports the component yet; Task 4 (the list) and Task 6 (the header) do.

- [ ] **Step 11: Run the whole unit suite**

Run: `node --test test/*.test.js`
Expected: PASS, 479 + 7 = 486 tests (six new in status, one in persistence; the studies test grew in place).

- [ ] **Step 12: Commit**

```bash
git add renderer/data/status.js renderer/data/persistence.js renderer/screens/studies.js renderer/components/status-badge.js styles/components.css test/status.test.js test/persistence.test.js test/studies.test.js
git commit -F tools/smoke/out/task1-msg.txt
```

Message: `feat: reviewedAt on the record and a fourth status, Reviewed` — body: what `deriveStatus` now returns, that `validateStudy` carries the mark, that the badge component is DOM code with no unit test and is wired in Tasks 4 and 6; the trailer.

---

### Task 2: The Find list's sort — `data/find.js`, `subjectLabel`, `findSort`

**Files:**
- Create: `renderer/data/find.js`
- Create: `test/find.test.js`
- Modify: `renderer/data/labels.js` (append `subjectLabel`)
- Modify: `renderer/store.js` (after the `paramSelected: [],` line and its comment)
- Test: `test/labels.test.js`, `test/store.test.js`

**Interfaces:**
- Consumes: `displayStatus` (Task 1); `studyName`, `workspaceLabel`, `folderLabel` from `data/labels.js`.
- Produces (binding on Task 4):
  - `DEFAULT_FIND_SORT` = `{ key: 'date', dir: 'desc' }` (frozen); `FIND_SORT_KEYS` = the seven keys.
  - `statusRank(status)` → `0|1|2|3|null` (`proc`, `rev`, `seg`, `ok`).
  - `toggleFindSort(sort, key)` → a new `{ key, dir }`: the active key flips; another key starts `'asc'`.
  - `sortFindRows(studies, sort, runningId = null)` → a sorted COPY; absent values last in both directions; ties keep input order.
  - `subjectLabel(study)` → `study.subjectId` | the demo `pt` | `'\u2014'`.
  - `state.findSort`, initial `{ key: 'date', dir: 'desc' }`.

- [ ] **Step 1: Write the failing tests**

Create `test/find.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FIND_SORT, FIND_SORT_KEYS, statusRank, toggleFindSort, sortFindRows } from '../renderer/data/find.js';

// A real study under a workspace root. Every override is a record field.
function study(id, overrides = {}) {
  return {
    id, source: 'real', filePath: `C:\\films\\Cohort\\${id}.png`, fileName: `${id}.png`, name: null,
    workspaceFolder: 'C:\\films\\Cohort', subjectId: null, timepoint: null, filmDate: null,
    addedAt: '2026-09-10T10:00:00.000Z', view: 'Standing lateral', thumbnail: null,
    measurements: null, geometry: null, qc: null, reviewedAt: null, clinical: {}, ...overrides,
  };
}
const SEG = { measurements: { PI: 50, PT: 10, SS: 40, LL: { 'L1-S1': 45 } }, qc: { femoral: { confidence: 0.9 } } };
const REV = { measurements: { PI: 50, PT: 10, SS: 40, LL: { 'L1-S1': 45 } }, qc: { femoral: { confidence: 0.2 } } };
const ids = (rows) => rows.map((s) => s.id);

test('the default sort is newest first and the keys are the seven columns', () => {
  assert.deepEqual(DEFAULT_FIND_SORT, { key: 'date', dir: 'desc' });
  assert.ok(Object.isFrozen(DEFAULT_FIND_SORT));
  assert.deepEqual([...FIND_SORT_KEYS], ['study', 'subject', 'view', 'workspace', 'folder', 'date', 'status']);
});

test('toggleFindSort flips the active key and starts another key ascending', () => {
  assert.deepEqual(toggleFindSort({ key: 'date', dir: 'desc' }, 'date'), { key: 'date', dir: 'asc' });
  assert.deepEqual(toggleFindSort({ key: 'date', dir: 'asc' }, 'date'), { key: 'date', dir: 'desc' });
  assert.deepEqual(toggleFindSort({ key: 'date', dir: 'desc' }, 'study'), { key: 'study', dir: 'asc' });
  assert.deepEqual(toggleFindSort(null, 'status'), { key: 'status', dir: 'asc' });
  assert.deepEqual(toggleFindSort(undefined, 'date'), { key: 'date', dir: 'asc' }, 'the default is date desc, so date flips to asc');
});

test('sortFindRows returns a copy and tolerates no rows', () => {
  const rows = [study('SP-1000'), study('SP-1001')];
  const sorted = sortFindRows(rows, DEFAULT_FIND_SORT);
  assert.notEqual(sorted, rows);
  assert.deepEqual(ids(sorted), ['SP-1000', 'SP-1001']);
  assert.deepEqual(sortFindRows(undefined, null), []);
});

test('by date: newest first by default, oldest first ascending; an unparseable date sorts last both ways', () => {
  const rows = [
    study('SP-1000', { addedAt: '2026-09-01T00:00:00.000Z' }),
    study('SP-1001', { addedAt: 'not a date' }),
    study('SP-1002', { addedAt: '2026-09-03T00:00:00.000Z' }),
  ];
  assert.deepEqual(ids(sortFindRows(rows, DEFAULT_FIND_SORT)), ['SP-1002', 'SP-1000', 'SP-1001']);
  assert.deepEqual(ids(sortFindRows(rows, { key: 'date', dir: 'asc' })), ['SP-1000', 'SP-1002', 'SP-1001']);
});

test('by study: the display name, case-insensitively; ties keep input order in both directions', () => {
  const rows = [study('SP-1000', { name: 'beta' }), study('SP-1001', { name: 'Alpha' }), study('SP-1002', { name: 'alpha' })];
  assert.deepEqual(ids(sortFindRows(rows, { key: 'study', dir: 'asc' })), ['SP-1001', 'SP-1002', 'SP-1000']);
  assert.deepEqual(ids(sortFindRows(rows, { key: 'study', dir: 'desc' })), ['SP-1000', 'SP-1001', 'SP-1002']);
});

test('by subject: the subject id, else the demo label; an em dash last in both directions', () => {
  const demo = { ...study('SP-0042'), source: 'demo', filePath: null, workspaceFolder: null, pt: 'P-8841' };
  const rows = [study('SP-1000'), study('SP-1001', { subjectId: 'S002' }), demo, study('SP-1002', { subjectId: 's001' })];
  assert.deepEqual(ids(sortFindRows(rows, { key: 'subject', dir: 'asc' })), ['SP-0042', 'SP-1002', 'SP-1001', 'SP-1000']);
  assert.deepEqual(ids(sortFindRows(rows, { key: 'subject', dir: 'desc' })), ['SP-1001', 'SP-1002', 'SP-0042', 'SP-1000']);
});

test('by view, workspace and folder: the cell labels, em dash and blank last', () => {
  const hand = study('SP-1000', { workspaceFolder: null, filePath: 'D:\\loose\\a.png' });
  const a = study('SP-1001', { workspaceFolder: 'C:\\films\\Alpha', filePath: 'C:\\films\\Alpha\\pre-op\\a.png', view: 'Flexion lateral' });
  const b = study('SP-1002', { workspaceFolder: 'C:\\films\\Beta', filePath: 'C:\\films\\Beta\\post-op\\b.png', view: '' });
  assert.deepEqual(ids(sortFindRows([hand, a, b], { key: 'workspace', dir: 'asc' })), ['SP-1001', 'SP-1002', 'SP-1000']);
  assert.deepEqual(ids(sortFindRows([hand, a, b], { key: 'workspace', dir: 'desc' })), ['SP-1002', 'SP-1001', 'SP-1000']);
  assert.deepEqual(ids(sortFindRows([hand, a, b], { key: 'folder', dir: 'asc' })), ['SP-1000', 'SP-1002', 'SP-1001']);
  assert.deepEqual(ids(sortFindRows([hand, a, b], { key: 'view', dir: 'asc' })), ['SP-1001', 'SP-1000', 'SP-1002']);
  assert.deepEqual(ids(sortFindRows([hand, a, b], { key: 'view', dir: 'desc' })), ['SP-1000', 'SP-1001', 'SP-1002']);
});

test('by status: Processing, Needs review, Segmented, Reviewed; the running study reads Processing', () => {
  const rows = [
    study('SP-1000', SEG), study('SP-1001', REV), study('SP-1002'),
    study('SP-1003', { ...SEG, reviewedAt: '2026-09-10T12:00:00.000Z' }),
  ];
  assert.deepEqual(ids(sortFindRows(rows, { key: 'status', dir: 'asc' })), ['SP-1002', 'SP-1001', 'SP-1000', 'SP-1003']);
  assert.deepEqual(ids(sortFindRows(rows, { key: 'status', dir: 'desc' })), ['SP-1003', 'SP-1000', 'SP-1001', 'SP-1002']);
  assert.deepEqual(ids(sortFindRows(rows, { key: 'status', dir: 'asc' }, 'SP-1003')), ['SP-1002', 'SP-1003', 'SP-1001', 'SP-1000']);
  assert.equal(statusRank('proc'), 0);
  assert.equal(statusRank('ok'), 3);
  assert.equal(statusRank('nonsense'), null);
});

test('an unknown key keeps the input order', () => {
  const rows = [study('SP-1001'), study('SP-1000')];
  assert.deepEqual(ids(sortFindRows(rows, { key: 'lordosis', dir: 'asc' })), ['SP-1001', 'SP-1000']);
});
```

Add to `test/labels.test.js` (extend its import with `subjectLabel`, then append):

```js
test('subjectLabel shows the subject id, else the demo patient label, else an em dash', () => {
  assert.equal(subjectLabel({ subjectId: 'S001' }), 'S001');
  assert.equal(subjectLabel({ subjectId: 'S001', pt: 'P-1' }), 'S001');
  assert.equal(subjectLabel({ subjectId: null, pt: 'P-8841' }), 'P-8841');
  assert.equal(subjectLabel({ subjectId: '  ', pt: '' }), DASH);
  assert.equal(subjectLabel({}), DASH);
  assert.equal(subjectLabel(null), DASH);
});
```

Add to `test/store.test.js`, directly after the `assert.deepEqual(state.paramSelected, []);` line:

```js
  assert.deepEqual(state.findSort, { key: 'date', dir: 'desc' });
```

- [ ] **Step 2: Run the three suites to verify they fail**

Run: `node --test test/find.test.js test/labels.test.js test/store.test.js`
Expected: `find.test.js` fails to load (module not found); `labels.test.js` fails on the import; `store.test.js` fails on `findSort` (`undefined`).

- [ ] **Step 3: Implement `subjectLabel`, `findSort`, and `data/find.js`**

Append to `renderer/data/labels.js`:

```js
// The SUBJECT cell (studies-table spec 2026-09-10, section 7.1): the record's subject id, else the demo
// record's patient label -- `pt` exists only on the nine compiled-in records -- else an em dash. A
// real study with no subject shows the dash, and the Find tab's editor opens empty for it.
export function subjectLabel(study) {
  if (!study) return DASH;
  if (typeof study.subjectId === 'string' && study.subjectId.trim() !== '') return study.subjectId;
  if (typeof study.pt === 'string' && study.pt.trim() !== '') return study.pt;
  return DASH;
}
```

In `renderer/store.js`, after the `paramSelected: [],` line, add:

```js
  // (2026-09-10, studies-table spec 6.1) the Find list's sort: key 'study'|'subject'|'view'|'workspace'|
  // 'folder'|'date'|'status', dir 'asc'|'desc'. Replaced wholesale on change; session-only, never persisted;
  // read by the Studies screen's own subscription, never by SCREEN_KEYS. The grid's paramSort is separate.
  findSort: { key: 'date', dir: 'desc' },
```

Create `renderer/data/find.js`:

```js
/**
 * Pure logic for the Find list's sortable headers (studies-table spec 2026-09-10, section 6). No DOM.
 * screens/studies.js sorts the filtered rows through sortFindRows before building the table, so
 * the order on screen is the order the Segment and Delete buttons act in; test/find.test.js pins it.
 *
 * The rules are the grid's (data/parameters.js sortParameters): text compares case-insensitively;
 * an absent value -- an em dash, a blank, an unparseable date -- sorts LAST in both directions,
 * because a dash is not a small string; ties keep the incoming order, so a stable sort never
 * shuffles the list under the user.
 */
import { displayStatus } from './status.js';
import { studyName, workspaceLabel, folderLabel, subjectLabel } from './labels.js';

const DASH = '\u2014';

export const DEFAULT_FIND_SORT = Object.freeze({ key: 'date', dir: 'desc' });
export const FIND_SORT_KEYS = Object.freeze(['study', 'subject', 'view', 'workspace', 'folder', 'date', 'status']);

// Workflow order: what still needs doing sorts first.
const STATUS_RANK = Object.freeze({ proc: 0, rev: 1, seg: 2, ok: 3 });

export function statusRank(status) {
  return STATUS_RANK[status] ?? null;
}

// The grid's toggleSort rule as a pure function: clicking the active key flips it; another key
// starts ascending. `sort` may be null or partial; the default fills it.
export function toggleFindSort(sort, key) {
  const current = { ...DEFAULT_FIND_SORT, ...(sort ?? {}) };
  const dir = current.key === key && current.dir === 'asc' ? 'desc' : 'asc';
  return { key, dir };
}

// null for an absent value; otherwise the lower-cased text.
function text(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' || trimmed === DASH ? null : trimmed.toLowerCase();
}

function sortValue(study, key, runningId) {
  switch (key) {
    case 'study': return text(studyName(study));
    case 'subject': return text(subjectLabel(study));
    case 'view': return text(study.view);
    case 'workspace': return text(workspaceLabel(study));
    case 'folder': return text(folderLabel(study));
    case 'date': {
      const time = Date.parse(study.addedAt ?? '');
      return Number.isNaN(time) ? null : time;
    }
    case 'status': return statusRank(displayStatus(study, runningId));
    default: return null;
  }
}

// A sorted COPY. `runningId` is state.running, so the status compared is the one the row shows.
export function sortFindRows(studies, sort, runningId = null) {
  const { key, dir } = { ...DEFAULT_FIND_SORT, ...(sort ?? {}) };
  const sign = dir === 'desc' ? -1 : 1;
  const indexed = (studies ?? []).map((study, index) => ({ study, index, value: sortValue(study, key, runningId) }));
  indexed.sort((a, b) => {
    if (a.value === null && b.value === null) return a.index - b.index;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    if (a.value === b.value) return a.index - b.index;
    return (a.value < b.value ? -1 : 1) * sign;
  });
  return indexed.map((entry) => entry.study);
}
```

- [ ] **Step 4: Run the three suites to verify they pass**

Run: `node --test test/find.test.js test/labels.test.js test/store.test.js`
Expected: PASS.

- [ ] **Step 5: Run the whole unit suite**

Run: `node --test test/*.test.js`
Expected: PASS, 486 + 10 = 496 (nine in `find.test.js`, one in `labels.test.js`; the store test grew in place).

- [ ] **Step 6: Commit**

```bash
git add renderer/data/find.js renderer/data/labels.js renderer/store.js test/find.test.js test/labels.test.js test/store.test.js
git commit -F tools/smoke/out/task2-msg.txt
```

Message: `feat: pure sort for the Find list, subjectLabel, and the findSort store key`; the trailer.

---

### Task 3: The four writes that clear the review mark

**Files:**
- Modify: `renderer/viewer/measure-queue.js:56-57` (`writeStudy` call in `recalculate`)
- Modify: `renderer/screens/analysis.js:344-352` (the run commit in `segmentStudy`)
- Modify: `renderer/components/viewer.js:670-678` (`resetToPrediction`'s `setState`)
- Modify: `renderer/calibration.js` (a new `withCalibration`; both writes go through it)
- Test: `test/measure-queue.test.js` (the harness takes its studies; one new test), `test/calibration-review.test.js` (create)

**Interfaces:**
- Consumes: the record's `reviewedAt` (Task 1).
- Produces: `withCalibration(study, calibration)` → the same record, or a new one with the new scale and `reviewedAt: null` (exported from `renderer/calibration.js`, binding on nothing else). Every commit that replaces `measurements`, `geometry` or `calibration` writes `reviewedAt: null` (§8.4).

- [ ] **Step 1: Write the failing measure-queue test**

In `test/measure-queue.test.js`, change the harness signature so a test can seed its own studies. Replace

```js
function harness() {
  let state = { studies: [{ id: 'A', measurements: null, geometry: null }, { id: 'B', measurements: null, geometry: null }] };
```

with

```js
function harness(studies = [{ id: 'A', measurements: null, geometry: null }, { id: 'B', measurements: null, geometry: null }]) {
  let state = { studies };
```

(every existing call is `harness()`, unchanged). Then append:

```js
// (2026-09-10, studies-table spec 8.4, site 2) a correction that lands replaces the numbers the
// review was made over, so the mark goes with them. The draft alone -- the preview before /measure
// answers -- touches nothing on the record.
test('a correction that lands clears the review mark; the draft alone does not', async () => {
  const h = harness([{ id: 'A', measurements: { PI: 1 }, geometry: geometryWith(0), reviewedAt: '2026-09-10T12:00:00.000Z' }]);
  h.queue.commitGeometry('A', geometryWith(1));
  await tick(30);
  assert.equal(h.calls.length, 1);
  assert.equal(h.study('A').reviewedAt, '2026-09-10T12:00:00.000Z');
  h.calls[0].resolve({ measurements: { PI: 2 }, geometry: geometryWith(1) });
  await tick(0);
  assert.equal(h.study('A').reviewedAt, null);
  assert.deepEqual(h.study('A').measurements, { PI: 2 });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/measure-queue.test.js`
Expected: FAIL on `assert.equal(h.study('A').reviewedAt, null)` (still the timestamp).

- [ ] **Step 3: Clear the mark in the correction commit**

In `renderer/viewer/measure-queue.js`'s `recalculate`, change

```js
      writeStudy(studyId, { measurements: result.measurements, geometry: result.geometry,
        ...(result.qc?.coverage ? { qc: { ...current.qc, coverage: result.qc.coverage } } : {}) });
```

to

```js
      // The numbers a review was made over are being replaced, so the mark goes with them
      // (studies-table spec 2026-09-10, section 8.4). On the write, not derived: one line, one test.
      writeStudy(studyId, { measurements: result.measurements, geometry: result.geometry, reviewedAt: null,
        ...(result.qc?.coverage ? { qc: { ...current.qc, coverage: result.qc.coverage } } : {}) });
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/measure-queue.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing calibration test**

Create `test/calibration-review.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withCalibration } from '../renderer/calibration.js';

// Compact records, not full backend responses: withCalibration compares whatever it is given, and
// rememberCalibration / attachCalibrations normalise before they reach it.
const A = { version: 1, status: 'unavailable', width: 10, height: 20, candidates: [], selected_index: null };
const B = { ...A, status: 'cleared' };
const MARK = '2026-09-10T12:00:00.000Z';

test('withCalibration returns the SAME record when the scale is unchanged, key order included', () => {
  const study = { id: 'SP-1000', calibration: A, reviewedAt: MARK };
  assert.equal(withCalibration(study, { ...A }), study);
  assert.equal(withCalibration(study, { selected_index: null, candidates: [], height: 20, width: 10, status: 'unavailable', version: 1 }), study);
  const none = { id: 'SP-1001', calibration: null, reviewedAt: MARK };
  assert.equal(withCalibration(none, null), none);
});

test('withCalibration replaces the scale and clears the review mark when it changed (studies-table spec 8.4)', () => {
  const study = { id: 'SP-1000', calibration: A, reviewedAt: MARK };
  const next = withCalibration(study, B);
  assert.notEqual(next, study);
  assert.deepEqual(next.calibration, B);
  assert.equal(next.reviewedAt, null);
  assert.equal(study.reviewedAt, MARK, 'the record is replaced, never mutated');
  const first = withCalibration({ id: 'SP-1001', calibration: null, reviewedAt: null }, A);
  assert.deepEqual(first.calibration, A);
  assert.equal(first.reviewedAt, null);
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `node --test test/calibration-review.test.js`
Expected: FAIL on the import (`withCalibration` is not exported).

- [ ] **Step 7: Implement `withCalibration` and route both writes through it**

In `renderer/calibration.js`, after the `byPath` declaration and before `calibrationForStudy`, add:

```js
// Deep equality with key order normalised: a record read from disk and one the backend just
// returned need not agree on key order, and a re-scan that finds the same ruler is not a change.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
}

// The one way a study's calibration is written (studies-table spec 2026-09-10, section 8.4, site 4). An
// unchanged scale returns the SAME record, so nothing repaints and nothing is un-reviewed; a
// changed scale replaces the record and clears the review mark, because the disc heights on it are
// about to change. Exported for its unit test.
export function withCalibration(study, calibration) {
  if (JSON.stringify(canonical(study.calibration ?? null)) === JSON.stringify(canonical(calibration ?? null))) return study;
  return { ...study, calibration, reviewedAt: null };
}
```

In `rememberCalibration`, replace

```js
    changed = true;
    return { ...study, calibration };
```

with

```js
    const next = withCalibration(study, calibration);
    if (next !== study) changed = true;
    return next;
```

In `attachCalibrations`, replace `return { ...study, calibration };` with `return withCalibration(study, calibration);`.

- [ ] **Step 8: Run it to verify it passes**

Run: `node --test test/calibration-review.test.js test/calibration.test.js test/calibration-integration.test.js`
Expected: PASS (the two existing calibration suites are unaffected: the same records come back for the same scales).

- [ ] **Step 9: The two DOM-side writes (no unit test; the smoke persist suite's re-run check covers the first in Task 7)**

In `renderer/screens/analysis.js`, in `segmentStudy`'s final `setState`, change

```js
        ? { ...s, measurements: response.measurements, geometry: response.geometry, qc: response.qc ?? null,
          calibration: preferReviewedCalibration(response.calibration, calibrationForStudy(s)), thumbnail }
```

to

```js
        ? { ...s, measurements: response.measurements, geometry: response.geometry, qc: response.qc ?? null,
          calibration: preferReviewedCalibration(response.calibration, calibrationForStudy(s)), thumbnail,
          // A re-run replaces every number a review was made over (studies-table spec 2026-09-10, section 8.4, site 1).
          reviewedAt: null }
```

In `renderer/components/viewer.js`'s `resetToPrediction`, change

```js
        ? { ...item, measurements: structuredClone(predicted.measurements), geometry: structuredClone(predicted.geometry) }
```

to

```js
        // The prediction's own numbers replace the corrected ones (studies-table spec 8.4, site 3).
        ? { ...item, measurements: structuredClone(predicted.measurements), geometry: structuredClone(predicted.geometry), reviewedAt: null }
```

- [ ] **Step 10: Run the whole unit suite, byte-check, commit**

Run: `node --test test/*.test.js` — expected PASS, 496 + 3 = 499.

Byte-check the four renderer files: `git diff -U0 -- renderer/viewer/measure-queue.js renderer/screens/analysis.js renderer/components/viewer.js renderer/calibration.js | grep -nP '^[+-].*[^\x00-\x7F]'` — expected: no `+` lines (every new line above is ASCII).

```bash
git add renderer/viewer/measure-queue.js renderer/screens/analysis.js renderer/components/viewer.js renderer/calibration.js test/measure-queue.test.js test/calibration-review.test.js
git commit -F tools/smoke/out/task3-msg.txt
```

Message: `feat: every numbers-changing write clears the review mark` — body names the four sites and that two are DOM code covered by the persist smoke suite; the trailer.

---
### Task 4: The Find tab — Delete selected, sortable headers, the SUBJECT editor, the summary's third clause

**Files:**
- Modify: `renderer/screens/studies.js` (the import block; `buildRow`; `buildTable`; the module-scope state and `subscribe`; `refreshTable`; `askToDelete`; the delete-all functions replaced; new subject-editor functions; `render`'s hosts, `buildFilterBar` and `update`)
- Modify: `styles/screens/studies.css` (`.studies-cell-patient` → `.studies-cell-subject`; the editor; the bar's Delete; the prompt inside the bar; the bulk row's rule removed)

**Interfaces:**
- Consumes: `displayStatus` (Task 1); `statusBadge`, `unsupportedViewBadge` (Task 1); `sortFindRows`, `toggleFindSort`, `subjectLabel`, `state.findSort` (Task 2); `selectedVisible` from `data/parameters.js`; `WAIT_FOR_RUN`, `WAIT_FOR_BATCH` from `data/batch.js`; `deleteStudyBatch(targets, { deletePrediction })` — called WITHOUT `hideDemos`, which the current implementation never invokes for real-only targets.
- Produces (binding on Task 7's smoke sections): `data-find-key`s `delete`, `delete-prompt`, `delete-confirm`, `delete-cancel`, `sort-<key>`, `subject-<id>` (the cell), `subject-input-<id>` (the editor); classes `studies-cell-subject`, `studies-subject-editable`, `studies-subject-empty`, `studies-subject-input`, `studies-delete-selected`, `studies-th`; the summary `{n} STUDIES · {m} UNSEGMENTED · {k} TO REVIEW`; the prompt text `Delete N studies, including their saved results? Original image files will be kept.` (singular: `Delete 1 study, including its saved results? ...`); the toast `Deleted N studies. Original image files were kept.` (singular `Deleted 1 study. ...`); the Delete label `Delete` / `Delete N selected` / `Deleting studies…`.

This is DOM code: no unit test. Verification is Task 7's smoke sections and Task 8's gate. Read `screens/studies.js` in full before editing; every function below replaces the one of the same name, and the surrounding code (dropzone, `handleDrop`, `actionCell`, `deleteStudy`, `cancelDelete`, `EMPTY_COPY`, `sameKey`, `matchesQuery`, `newStudy`, `openStudy`, `addStudy`) is unchanged.

- [ ] **Step 1: The import block**

Replace the whole import block (from `import { deleteStudyBatch }` to `import { mountParameters }`) with:

```js
import { deleteStudyBatch } from '../data/delete-studies.js';
import { el, mount } from '../dom.js';
import { getState, setState, subscribe } from '../store.js';
import { selectFile, pathForFile, deletePrediction, persistenceDisabledReason } from '../api.js';
import { showToast } from '../components/toast.js';
import { displayStatus } from '../data/status.js';
import { inferenceView } from '../data/inference-view.js';
import { defaultName, studyName, workspaceLabel, folderLabel, pathTitle, subjectLabel } from '../data/labels.js';
import { nextId } from '../data/persistence.js';
import { DEFAULT_VIEW } from '../data/timepoints.js';
import {
  withIds, toggleId, selectedVisible, workspaceOptions, folderOptions, normaliseFilters, patchFilters, matchesLocation, HAND_ADDED,
} from '../data/parameters.js';
import { planBatch, progressText, WAIT_FOR_BATCH, WAIT_FOR_RUN } from '../data/batch.js';
import { sortFindRows, toggleFindSort } from '../data/find.js';
import { progressTitle, progressDetail } from '../data/processing.js';
import { checkbox } from '../components/checkbox.js';
import { statusBadge, unsupportedViewBadge } from '../components/status-badge.js';
import { startBatch, stopBatch } from '../batch.js';
import { setFilePayload, releaseStudy } from './analysis.js';
import { forgetPrediction } from '../components/viewer.js';
import { mountParameters } from './parameters.js';

const DASH = '\u2014';
```

Update the file's header comment: the third line's "the Find tab's filter bar with the segment button" becomes "the Find tab's filter bar with Delete and the segment button", and add a line: " * (2026-09-10, studies-table spec) Sortable headers, the SUBJECT column with its in-place editor, Delete over the ticked visible rows, and the summary's TO REVIEW count."

- [ ] **Step 2: `statusBadge` goes; `subjectCell` and the new `buildRow` come**

Delete the local `function statusBadge(status) { ... }`. Replace `buildRow` with the two functions below (the comment above `buildRow` about `runningId` stays, reworded to name `displayStatus`):

```js
// The SUBJECT cell (studies-table spec 2026-09-10, section 7). Demo rows show the demo label and the DEMO
// pill and are not editable (never saved). A real row's cell is a click-to-edit target: a SINGLE
// click, because the row underneath opens the study on the first click of a double-click. The
// click stops at the cell, as the tick's and the trash button's do. While this row is the one
// being edited the cell IS the editor, pre-filled with the draft so a rebuild mid-word (a batch
// finishing, a run ending) loses nothing; update() restores its focus and caret by data-find-key.
function subjectCell(study) {
  const label = subjectLabel(study);
  if (study.source !== 'real') {
    return el('div', { class: 'studies-cell-subject' }, label, el('span', { class: 'pill-demo' }, 'DEMO'));
  }
  const name = studyName(study);
  if (editing && editing.id === study.id) {
    const input = el('input', {
      type: 'text', class: 'studies-subject-input', value: editing.draft, spellcheck: false,
      'data-find-key': `subject-input-${study.id}`, 'aria-label': `Subject for ${name}`,
      onClick: (event) => event.stopPropagation(),
      onInput: (event) => { if (editing && editing.id === study.id) editing = { id: study.id, draft: event.target.value }; },
      onKeydown: (event) => {
        if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); commitSubject(study.id, 'next'); }
        else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelSubjectEdit(); }
      },
      // Deferred: Chromium can fire this while the node is being replaced, and setState notifies
      // synchronously -- the name field and the drawer defer their commits for the same reason.
      onBlur: () => queueMicrotask(() => commitSubject(study.id, 'blur')),
    });
    return el('div', { class: 'studies-cell-subject', onClick: (event) => event.stopPropagation() }, input);
  }
  const empty = label === DASH;
  return el('div', {
    class: `studies-cell-subject studies-subject-editable${empty ? ' studies-subject-empty' : ''}`,
    role: 'button', tabindex: '0', title: 'Click to edit subject', 'data-find-key': `subject-${study.id}`,
    'aria-label': `Subject for ${name}: ${empty ? 'none' : label}. Press Enter to edit`,
    onClick: (event) => { event.stopPropagation(); beginSubjectEdit(study.id); },
    onKeydown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); beginSubjectEdit(study.id); }
    },
  }, label);
}

// `runningId` is state.running. displayStatus (data/status.js) applies spec 13.1's "or currently
// running" rule, so deriveStatus stays a pure function of the record.
function buildRow(study, runningId, selected) {
  const status = displayStatus(study, runningId);
  const unsupported = study.source === 'real' && study.measurements == null
    && runningId !== study.id && !inferenceView(study.view);
  // While this row is confirming a delete, the prompt takes every cell from WORKSPACE rightwards
  // (see .studies-cell-actions-confirming); the study, subject and view cells stay visible.
  // Those four are nulled together and the prompt's grid-column start is the 4th track, so the
  // placement cursor is still at 4 when the action cell is laid out. Adding a VISIBLE cell
  // before the prompt without moving that start line would push the cursor past it and wrap the
  // prompt onto a second row.
  const confirming = confirmingId === study.id;
  const row = el('div', {
    class: 'studies-row', role: 'button', tabindex: '0', 'data-study-id': study.id,
    onClick: () => openStudy(study),
    onKeydown: (event) => {
      // Escape anywhere in the row (its prompt buttons included) withdraws the prompt.
      if (event.key === 'Escape' && confirmingId === study.id) { event.preventDefault(); cancelDelete(); return; }
      // Enter/Space on the row itself opens the study. On one of the action buttons, the tick or
      // the subject cell they are that control's own activation and must reach it.
      if (event.target !== row) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openStudy(study); }
    },
  },
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
    subjectCell(study),
    el('div', { class: 'studies-cell-view' }, study.view || '—'),
    confirming ? null : el('div', { class: 'studies-cell-workspace' }, workspaceLabel(study)),
    confirming ? null : el('div', { class: 'studies-cell-folder', ...(pathTitle(study) ? { title: pathTitle(study) } : {}) }, folderLabel(study)),
    confirming ? null : el('div', { class: 'studies-cell-date' }, formatDate(study.addedAt)),
    confirming ? null : el('div', {}, unsupported ? unsupportedViewBadge(study.view) : statusBadge(status)),
    actionCell(study, confirming));
  return row;
}
```

The `study.view || '—'` line is the file's existing line with its glyph: keep it byte-for-byte (do not replace the glyph with `DASH`).

- [ ] **Step 3: The sortable header row — `sortableHeader` and the new `buildTable`**

Replace `buildTable` with:

```js
// One header cell (studies-table spec 2026-09-10, section 6.3): the grid's sort control -- a button
// carrying the label and the up/down mark -- keyed for focus restore. `lead` goes before
// the button (the STUDY column's select-all). Clicking the active key flips the direction;
// another key sorts ascending (data/find.js toggleFindSort). The header cells stay plain divs,
// as the list's always were (ROADMAP section 5's accessibility pass owns the table semantics), so the
// state is on the button's title rather than an aria-sort the role would need.
function sortableHeader(key, label, sort, lead) {
  const active = sort.key === key;
  const button = el('button', {
    type: 'button', class: `param-sort${active ? ' is-active' : ''}`, 'data-find-key': `sort-${key}`,
    title: active
      ? (sort.dir === 'asc' ? 'Sorted ascending. Click to reverse' : 'Sorted descending. Click to reverse')
      : `Sort by ${label.toLowerCase()}`,
    onClick: () => setState((s) => ({ findSort: toggleFindSort(s.findSort, key) })),
  }, label, el('span', { class: 'param-sort-mark', 'aria-hidden': 'true' }, active ? (sort.dir === 'asc' ? ' \u25B4' : ' \u25BE') : ''));
  return el('div', { class: key === 'study' ? 'studies-head-study' : 'studies-th' }, lead ?? null, button);
}

// `emptyKind` is null (the library is empty), 'search' or 'filters'. `selected` is paramSelected.
// `sort` is state.findSort; the rows arrive already sorted by it.
function buildTable(studies, runningId, emptyKind, selected, sort) {
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
      sortableHeader('study', 'STUDY', sort, selectAll),
      sortableHeader('subject', 'SUBJECT', sort),
      sortableHeader('view', 'VIEW', sort),
      sortableHeader('workspace', 'WORKSPACE', sort),
      sortableHeader('folder', 'FOLDER', sort),
      sortableHeader('date', 'DATE', sort),
      sortableHeader('status', 'STATUS', sort),
      el('div', {})),
    ...body);
}
```

- [ ] **Step 4: Module-scope state, the subscription, `refreshTable`, `askToDelete`**

Replace the block from `let confirmingId = null;` through the end of `refreshTable` (i.e. `confirmingId`, `confirmingAll`, the `subscribe(...)`, and `refreshTable`) with:

```js
// The id of the real study whose row shows the two-step delete prompt, or null. Module scope,
// not the store: it is one screen's transient UI, and a new key would change the contract's
// state shape. The store cannot see it, so update() lists it in its key explicitly and every
// change to it below repaints through refreshTable().
let confirmingId = null;
// The ids the bar's Delete prompt is confirming (studies-table spec 2026-09-10, section 5.3), or null.
// Captured at the click; update() withdraws it the moment the ticked visible set no longer
// matches them, so the prompt can never delete a set the user cannot see.
let confirmingSelected = null;
// The SUBJECT cell being edited in place (spec 7.2): { id, draft }, or null. `draft` is the text typed
// so far, kept current by the input's own handler, so a rebuild mid-word re-creates the editor
// with it. Replaced, never mutated: it is compared by reference in update()'s key.
let editing = null;

subscribe((state) => {
  // Navigation withdraws an open prompt and an open editor along with the mount.
  if (state.screen !== 'studies') { mounted = null; confirmingId = null; confirmingSelected = null; editing = null; return; }
  if (mounted) mounted.update(state);
});

// Repaint the bar and the table from the current store after module-scope UI state changes.
// Called from DOM event handlers only, never from inside a subscriber. The repaint replaces the
// nodes, which drops keyboard focus onto the body; `focusSelector` names the node that gets it
// back -- in the table or on the bar. A text input that gets it also gets its text selected:
// that is how a fresh SUBJECT editor opens (spec 7.2).
function refreshTable(focusSelector) {
  if (!mounted) return;
  mounted.update(getState());
  if (focusSelector) {
    const target = mounted.host.querySelector(focusSelector) ?? mounted.bar.querySelector(focusSelector);
    if (target) {
      target.focus();
      if (target instanceof HTMLInputElement && target.type === 'text') target.select();
    }
  }
}
```

In `askToDelete`, change `confirmingAll = false;` to `confirmingSelected = null;`.

- [ ] **Step 5: `deleteAllStudies` goes; Delete selected and the subject editor come**

Delete the whole `deleteAllStudies` function and its comment. In its place add:

```js
// The bar's Delete (studies-table spec 2026-09-10, section 5): the ticked VISIBLE real rows, captured
// here so the prompt names exactly what the button said. Focus lands on Cancel, as the row
// prompt's does; the open subject editor closes uncommitted only if it was on one of these rows,
// which the rebuild handles by dropping the row.
function askToDeleteSelected(ids) {
  if (getState().deletingStudies || ids.length === 0) return;
  confirmingId = null;
  confirmingSelected = ids;
  refreshTable('[data-find-key="delete-cancel"]');
}

function cancelDeleteSelected() {
  confirmingSelected = null;
  refreshTable('[data-find-key="delete"]');
}

// The old deleteAllStudies with two differences (spec 5.4): the targets are the captured ids, re-read
// from the live store so a study deleted meanwhile is simply absent, and the search is NOT cleared
// (delete-all cleared it because nothing was left to search). Everything else is kept exactly:
// deletingStudies is set before the first await, so run, batch and bulk delete stay mutually
// exclusive (startBatch and segmentStudy both refuse on it); the sidecars go through
// deleteStudyBatch, which never deletes a source film; the caches keyed by each deleted id are
// dropped; ONE setState removes the records, prunes their ticks (nextId reuses a freed id at
// once, so a tick left behind would land on the next film added) and closes a deleted open or
// compared study. The persistence subscriber in renderer/main.js writes the new list.
async function deleteSelectedStudies(ids) {
  const live = getState();
  if (live.running || live.batch || live.deletingStudies || persistenceDisabledReason()) return;
  const wanted = new Set(ids);
  const targets = live.studies.filter((study) => study.source === 'real' && wanted.has(study.id));
  confirmingSelected = null;
  confirmingId = null;
  if (targets.length === 0) { refreshTable('[data-find-key="delete"]'); return; }
  setState({ deletingStudies: true });
  try {
    const { deleted, failed } = await deleteStudyBatch(targets, { deletePrediction });
    const removed = new Set(deleted);
    for (const id of removed) { forgetPrediction(id); releaseStudy(id); }
    setState((current) => ({
      studies: current.studies.filter((study) => !removed.has(study.id)),
      deletingStudies: false,
      paramSelected: withIds(current.paramSelected, [...removed], false),
      ...(removed.has(current.openId) ? { openId: null, screen: 'studies', ...FRESH_VIEW } : {}),
      ...(removed.has(current.compareId) ? { compareId: null } : {}),
    }));
    const count = `${deleted.length} ${deleted.length === 1 ? 'study' : 'studies'}`;
    showToast(failed.length
      ? `Deleted ${count}. ${failed.length} could not be deleted and remain in the library: ${failed[0].message}`
      : `Deleted ${count}. Original image files were kept.`);
  } finally {
    if (getState().deletingStudies) setState({ deletingStudies: false });
  }
}

// ---- SUBJECT in place (studies-table spec 2026-09-10, section 7.2) ----------------------------------

// The stored subject as the editor's starting text. subjectLabel's em dash is a display value,
// not a subject, so the editor opens empty for a study with none.
function subjectDraft(study) {
  return typeof study?.subjectId === 'string' ? study.subjectId : '';
}

function beginSubjectEdit(id) {
  const live = getState();
  const study = live.studies.find((s) => s.id === id);
  if (!study || study.source !== 'real' || live.deletingStudies) return;
  // An editor still open on another row is committed first. Chromium fires that input's blur --
  // and so its deferred commit -- before the click that lands here, so this is belt and braces;
  // but an editor a rebuild destroyed while focused got no blur, and this is what keeps its text.
  if (editing && editing.id !== id) commitSubject(editing.id, 'blur');
  confirmingId = null;
  editing = { id, draft: subjectDraft(study) };
  refreshTable(`[data-find-key="subject-input-${id}"]`);
}

function cancelSubjectEdit() {
  if (!editing) return;
  const { id } = editing;
  editing = null;
  refreshTable(`[data-find-key="subject-${id}"]`);
}

// The next real row below `id` in the table's CURRENT order (sorted, filtered), or null: Enter
// moves down the column the user is looking at.
function realRowBelow(id) {
  if (!mounted) return null;
  const rows = [...mounted.host.querySelectorAll('.studies-row[data-study-id]')];
  const index = rows.findIndex((row) => row.dataset.studyId === id);
  if (index === -1) return null;
  const below = rows.slice(index + 1).find((row) => row.querySelector('.studies-subject-editable, .studies-subject-input'));
  return below ? below.dataset.studyId : null;
}

// Commits the editor for `id`. `mode` is 'next' (Enter: commit, then open the row below) or
// 'blur' (Tab, a click elsewhere: commit and close). Idempotent: a blur that follows an Enter
// finds the editor already moved on and does nothing, so the one write cannot happen twice.
// Trimmed; empty stores null (pp spec 7.1, the drawer's rule); a value that did not change writes
// nothing. The record is replaced, never mutated; the saver writes it. After a write, update()
// has already repainted inside the setState (editing is in its key) but could not restore focus,
// because the node that had it is gone -- refreshTable's own pass lands it where spec 7.2 says.
function commitSubject(id, mode) {
  if (!editing || editing.id !== id) return;
  const draft = editing.draft.trim();
  const next = draft === '' ? null : draft;
  const nextId = mode === 'next' ? realRowBelow(id) : null;
  const live = getState();
  const study = live.studies.find((s) => s.id === id);
  editing = nextId ? { id: nextId, draft: subjectDraft(live.studies.find((s) => s.id === nextId)) } : null;
  if (study && study.source === 'real' && (study.subjectId ?? null) !== next) {
    setState((s) => ({ studies: s.studies.map((x) => (x.id === id ? { ...x, subjectId: next } : x)) }));
  }
  refreshTable(nextId ? `[data-find-key="subject-input-${nextId}"]` : (mode === 'next' ? `[data-find-key="subject-${id}"]` : null));
}
```

- [ ] **Step 6: `render` — the hosts, the bar, `update`**

In `render(state)`:

(a) Change the first line `confirmingId = null;` + `confirmingAll = false;` to `confirmingId = null; confirmingSelected = null; editing = null;`.

(b) Delete the `bulkHost` declaration and its comment, and remove `bulkHost,` from the `root` tree (the `el('main', ...)` at the end: its children become header, `tabs`, `findPanel`, `parametersHost`).

(c) Replace `buildFilterBar` with:

```js
  // The bar (batch spec 7.1, 7.3, 7.4; studies-table spec 2026-09-10, section 5): the grid's Workspace and
  // Folder selects over the same shared keys, then Delete over the ticked visible rows, a spacer,
  // then the segment button with its note -- or, while a batch runs, the progress group. While the
  // Delete prompt is up it takes the bar's place (spec 5.3). Chromium shows no tooltip on a disabled
  // control, so the segment button's reason is a visible note beside it; Delete's reason is on its
  // title, because its label already says what it would do. Options come from the whole library,
  // not the searched subset, as the grid's do. `visible` is the table's rows, in table order: the
  // id list both buttons run.
  function buildFilterBar(live, filters, visible) {
    const blocked = Boolean(live.running || live.batch || live.deletingStudies || persistenceDisabledReason());
    // The ticked VISIBLE real rows, the segment button's own rule (selectedVisible), so a tick the
    // search or a filter is hiding is never deleted.
    const targets = selectedVisible(visible.filter((study) => study.source === 'real'), live.paramSelected);
    if (confirmingSelected) {
      const n = confirmingSelected.length;
      return el('div', { class: 'studies-filters' },
        el('div', {
          class: 'studies-bulk-prompt', role: 'group', 'aria-label': 'Confirm deleting the selected studies',
          'data-find-key': 'delete-prompt',
          onKeydown: (event) => { if (event.key === 'Escape') { event.preventDefault(); cancelDeleteSelected(); } },
        },
          el('span', {}, `Delete ${n} ${n === 1 ? 'study' : 'studies'}, including ${n === 1 ? 'its' : 'their'} saved results? Original image files will be kept.`),
          el('button', {
            type: 'button', class: 'btn btn-small studies-delete-confirm', 'data-find-key': 'delete-confirm', disabled: blocked,
            onClick: () => deleteSelectedStudies(confirmingSelected),
          }, 'Delete permanently'),
          el('button', {
            type: 'button', class: 'btn btn-small studies-bulk-cancel', 'data-find-key': 'delete-cancel',
            onClick: () => cancelDeleteSelected(),
          }, 'Cancel')));
    }

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

    const deleteTitle = live.batch ? WAIT_FOR_BATCH
      : live.running ? WAIT_FOR_RUN
      : persistenceDisabledReason() ? `Studies are not being saved: ${persistenceDisabledReason()}`
      : targets.length === 0 ? 'Tick studies to delete' : '';
    const deleteButton = el('button', {
      type: 'button', class: 'btn btn-small studies-delete-selected', 'data-find-key': 'delete',
      disabled: blocked || targets.length === 0, title: deleteTitle,
      onClick: () => askToDeleteSelected(targets.map((study) => study.id)),
    }, live.deletingStudies ? 'Deleting studies\u2026' : (targets.length > 0 ? `Delete ${targets.length} selected` : 'Delete'));

    let action;
    if (live.batch) {
      // Batch count plus live backend stages. Stop finishes the film in flight;
      // the sidebar can also cancel the current image and stop the batch.
      action = el('div', { class: 'studies-progress', 'data-find-key': 'progress' },
        el('span', { class: 'studies-progress-spinner', 'aria-hidden': 'true' }),
        el('span', { class: 'studies-progress-text' }, progressText(live.batch),
          live.running ? el('span', { class: 'processing-note study-processing-detail' },
            `${progressTitle(live.runStage)} · ${progressDetail(live.runStage)}`) : null),
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
      workspaceSelect, folderSelect, deleteButton, el('div', { class: 'studies-header-spacer' }), action);
  }
```

The progress line `\`${progressTitle(live.runStage)} · ${progressDetail(live.runStage)}\`` is the file's existing line with its glyph: keep it byte-for-byte.

(d) Replace `update` with:

```js
  let lastKey = null;

  function update(live) {
    // Tab visibility first, unconditionally: class toggles are idempotent and cheap, and the
    // tab is not in the list's key below.
    const onParameters = live.studiesTab === 'parameters';
    tabFind.classList.toggle('is-active', !onParameters);
    tabFind.setAttribute('aria-selected', String(!onParameters));
    tabParameters.classList.toggle('is-active', onParameters);
    tabParameters.setAttribute('aria-selected', String(onParameters));
    findPanel.classList.toggle('is-hidden', onParameters);
    parametersHost.classList.toggle('is-hidden', !onParameters);

    // The store is the source of truth for the query. While the user types, the two are already
    // equal so this never moves the caret.
    if (search.value !== (live.query || '')) search.value = live.query || '';

    const studies = live.studies || [];
    const query = (live.query || '').trim().toLowerCase();
    const queried = studies.filter((study) => matchesQuery(study, query));
    // The grid keeps its own reference-keyed gate; the search result is computed once here and
    // shared with the list below.
    parameters.update(live, queried);
    const progressNode = barHost.querySelector('.study-processing-detail');
    if (progressNode) progressNode.textContent = `${progressTitle(live.runStage)} · ${progressDetail(live.runStage)}`;

    const filters = normaliseFilters(live.paramFilters, studies);
    // Filtered, then sorted (studies-table spec 2026-09-10, section 6): the rows in the order the table
    // shows them, which is the order the Segment and Delete buttons act in.
    const visible = sortFindRows(queried.filter((study) => matchesLocation(study, filters)), live.findSort, live.running);
    const selected = live.paramSelected ?? [];
    const targets = selectedVisible(visible.filter((study) => study.source === 'real'), selected).map((study) => study.id);
    // Module-scope UI state the store cannot see, reconciled BEFORE the key so it never sits on a
    // study that left the table: the Delete prompt is withdrawn the moment the ticked visible set
    // no longer matches what it named (a tick, a keystroke, a filter, the tab -- spec 5.3); an editor
    // on a study deleted meanwhile closes. Plain assignments, not setState: this runs inside a
    // store notification.
    if (confirmingSelected && confirmingSelected.join(' ') !== targets.join(' ')) confirmingSelected = null;
    if (editing && !studies.some((study) => study.id === editing.id)) editing = null;

    // live.running is in the key so the table repaints when a run starts or ends: the row badge is
    // derived from it. confirmingId, confirmingSelected and editing are module scope, not store
    // state; listing them here is what lets a refreshTable() after a change to them get past the
    // gate, while a notification that changed nothing the table shows (a pan frame, a toast) still
    // returns early. paramFilters, paramSelected, batch and findSort are what the bar, the ticks and
    // the header read; deletingStudies is what Delete reads: every store key this screen reads must
    // be here, or it silently stops repainting for it.
    const key = [live.studies, live.query, live.running, confirmingId, confirmingSelected, editing,
      live.deletingStudies, live.paramFilters, live.paramSelected, live.batch, live.findSort];
    if (sameKey(key, lastKey)) return;
    lastKey = key;
    // The summary always describes the whole library, not the filtered view, and counts with
    // exactly the rule buildRow badges: UNSEGMENTED is every film shown as Processing (the running
    // one included, never "in queue" -- the batch's queue is the bar's business, spec decision 7);
    // TO REVIEW is every film shown as Needs review (studies-table spec 10). The line keeps its
    // existing separator glyph and adds the new one as an escape (HANDOFF's glyph trap).
    const shown = (study) => displayStatus(study, live.running);
    const unsegmented = studies.filter((study) => shown(study) === 'proc').length;
    const toReview = studies.filter((study) => shown(study) === 'rev').length;
    summary.textContent = `${studies.length} STUDIES · ${unsegmented} UNSEGMENTED \u00B7 ${toReview} TO REVIEW`;

    const emptyKind = filters.workspace !== null || filters.folder !== null ? 'filters' : (query !== '' ? 'search' : null);

    // Focus snapshot, restored by data-find-key after the rebuild (screens/parameters.js does the
    // same with data-param-key): a select change, a tick, a sort click or a keystroke's commit
    // rebuilds the bar and the table, which drops keyboard focus to <body>. Only when focus is
    // inside them -- a rebuild must never steal focus from the search box or the tab strip. An
    // open SUBJECT editor keeps its caret too: a batch finishing mid-word must not move it.
    // refreshTable() restores the row's delete controls, which carry no key, by its own selector.
    const active = document.activeElement;
    const focusKey = (barHost.contains(active) || tableHost.contains(active)) ? active.getAttribute('data-find-key') : null;
    const caret = focusKey !== null && focusKey.startsWith('subject-input-') && typeof active.selectionStart === 'number'
      ? [active.selectionStart, active.selectionEnd] : null;
    mount(barHost, buildFilterBar(live, filters, visible));
    mount(tableHost, buildTable(visible, live.running, emptyKind, selected, live.findSort));
    if (focusKey !== null) {
      // The control that was focused may be gone: clicking Segment replaces the button with the
      // progress group, and the batch's end replaces the group with the button. Land on the other.
      const fallback = { segment: 'stop', stop: 'segment' }[focusKey] ?? null;
      const target = barHost.querySelector(`[data-find-key="${focusKey}"]`) ?? tableHost.querySelector(`[data-find-key="${focusKey}"]`)
        ?? (fallback ? barHost.querySelector(`[data-find-key="${fallback}"]`) : null);
      if (target) {
        target.focus();
        if (caret && typeof target.setSelectionRange === 'function') target.setSelectionRange(caret[0], caret[1]);
      }
    }
  }
```

Two lines above carry the file's existing `·` glyph (the progress detail and the summary): the summary line is a `+` line that keeps the glyph its `-` twin had and adds `·`; the progress line is unchanged from the file. Do not convert either glyph.

(e) Change `mounted = { update, host: tableHost };` to `mounted = { update, host: tableHost, bar: barHost };`.

- [ ] **Step 7: The styles**

In `styles/screens/studies.css`:

(a) Rename the `.studies-cell-patient` block and its pill rule: `.studies-cell-patient` → `.studies-cell-subject` in both selectors, and reword the comment above it: "The label and the DEMO pill sit on one line" stays; add "(2026-09-10) SUBJECT replaced PATIENT; a real row's cell is the click-to-edit target below."

(b) Directly after the `.studies-cell-subject > .pill-demo { ... }` rule, add:

```css
/* The SUBJECT editor (studies-table spec 2026-09-10, section 7.2). At rest the cell is plain text so the
   list does not read as a form; on hover and keyboard focus it shows a field outline (the same
   move the Analysis header's name field makes), and a subject the study has none of reads muted.
   The negative margins keep the outlined box the row's height without growing the row. */
.studies-subject-editable {
  cursor: text;
  margin: -4px -8px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
}

.studies-subject-editable:hover,
.studies-subject-editable:focus-visible {
  border-color: var(--border);
  background: var(--card);
  outline: none;
}

.studies-subject-editable:focus-visible {
  border-color: var(--accent);
}

.studies-subject-empty {
  color: var(--muted);
}

.studies-subject-input {
  width: 100%;
  min-width: 0;
  margin: -4px -8px;
  padding: 4px 8px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--card);
  color: var(--ink);
  font: 400 14px 'Source Sans 3', sans-serif;
}

.studies-subject-input:focus {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent);
}
```

(c) Directly after the `.studies-head-study > .param-check { ... }` rule, add:

```css
/* The header row's sort buttons (studies-table spec 2026-09-10, section 6.3) are the grid's .param-sort:
   `all: unset` plus the head's inherited mono face. .studies-th is a plain cell holding one. */
.studies-th {
  min-width: 0;
}
```

(d) Directly after the `.studies-delete-confirm:hover { ... }` rule, add:

```css
/* The bar's Delete (studies-table spec 2026-09-10, section 5.2): a secondary button that reads as the
   destructive half only once it can act. */
.studies-delete-selected:not(:disabled):hover,
.studies-delete-selected:not(:disabled):focus-visible {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
```

(e) At the end of the file, replace the three-line block `.studies-bulk-actions { ... }`, `.studies-bulk-prompt { ... }`, `.studies-bulk-prompt span { ... }` with:

```css
/* The Delete prompt (studies-table spec 2026-09-10, section 5.3) takes the bar's place while it is up:
   the same accent-bordered card the library-level prompt was, now the bar's only child. */
.studies-bulk-prompt {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--accent);
  border-radius: 12px;
  background: var(--card);
  color: var(--body);
  font-size: 14px;
}

.studies-filters > .studies-bulk-prompt {
  flex: 1 1 100%;
}

.studies-bulk-prompt span {
  flex: 1 1 260px;
}
```

- [ ] **Step 8: Launch from source and walk it once (the executor's own check, before the gate)**

From PowerShell (the three-line launch in Global Constraints), on the developer library: the bar reads Workspace · Folder · Delete · Segment; Delete is disabled with the title until a real row is ticked; the header buttons sort and mark; a SUBJECT cell opens on click, Enter moves down, Escape restores, Tab commits; the summary carries `TO REVIEW`; a demo row shows its label and pill and has no editor; the console is clean. Then run the unit suite (`node --test test/*.test.js`, expected 499/499 — nothing here is unit-tested) and the existing studies smoke suite on a fresh scratch launch to see what it says: `node tools/smoke/smoke-studies.mjs > tools/smoke/out/task4-studies.txt 2>&1`. Expected: the header check, the summary checks (three) and the PATIENT cell check FAIL by name (Task 7 rewrites them); everything else PASSES. Record the counts in the commit body.

- [ ] **Step 9: Byte-check and commit**

`git diff -U0 -- renderer/screens/studies.js | grep -nP '^[+-].*[^\x00-\x7F]'` — expected: the summary line appears as a `-`/`+` pair (both carrying `·`); the progress-detail line does not appear (unchanged); deleted lines from `deleteAllStudies` and the old PATIENT cell appear as `-` only; no other `+` line.

```bash
git add renderer/screens/studies.js styles/screens/studies.css
git commit -F tools/smoke/out/task4-msg.txt
```

Message: `feat: Find tab — Delete over the ticked rows, sortable headers, the SUBJECT editor, TO REVIEW` — body: delete-all removed; the smoke counts from Step 8 with the five expected failures named; `Gate: covered by Task 8`; the trailer.

---

### Task 5: `deleteStudyBatch` without demos; the IPC rename; the development-only demo toggle

**Files:**
- Modify: `renderer/data/delete-studies.js` (whole file)
- Modify: `test/delete-studies.test.js` (whole file)
- Modify: `main.js:247-251` (the `hide-demo-studies` handler)
- Modify: `preload.js:20`
- Modify: `renderer/api.js:206`
- Create: `renderer/data/demo-visibility.js`, `test/demo-visibility.test.js`
- Create: `renderer/demo-studies.js`
- Modify: `renderer/components/sidebar.js` (imports; a new `demoBlock`; one line in `render`)
- Modify: `renderer/router.js:61-75` (`SIDEBAR_KEYS`)

**Interfaces:**
- Consumes: `merge(real)` from `data/persistence.js`; `withIds` from `data/parameters.js`; `demoStudiesAllowed()` from `api.js`; `showToast`.
- Produces:
  - `deleteStudyBatch(studies, { deletePrediction })` → `{ deleted: string[], failed: {id, message}[] }` — real studies only.
  - IPC `set-demo-studies-hidden(hidden: boolean)` → `true` when written, `false` when packaged; bridge `setDemoStudiesHidden(hidden)`; `api.setDemoStudiesHidden(hidden)` (asserts writable). `hideDemoStudies` is gone from all three.
  - `demoStudiesShown(state)` → `boolean`; `demoVisibilityPatch(state, shown)` → a store patch (`{}` when already so).
  - `demoToggleAvailable()` → `boolean`; `setDemoStudiesShown(shown)` → `Promise<boolean>`.
  - The sidebar's `DEMO STUDIES` block with `data-demo-toggle="show"|"hide"` buttons, built only when `demoToggleAvailable()`.

- [ ] **Step 1: Rewrite the delete-studies test (failing)**

Replace `test/delete-studies.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteStudyBatch } from '../renderer/data/delete-studies.js';

const studies = [
  { id: 'SP-1000', source: 'real', filePath: '/original/image.png' },
  { id: 'SP-1001', source: 'real', filePath: '/original/other.png' },
  { id: 'SP-0030', source: 'demo' },
];

test('deletes the prediction sidecars of the real studies only, in order, and never touches a demo', async () => {
  const calls = [];
  const result = await deleteStudyBatch(studies, { deletePrediction: async (id) => calls.push(id) });
  assert.deepEqual(calls, ['SP-1000', 'SP-1001']);
  assert.deepEqual(result.deleted, ['SP-1000', 'SP-1001']);
  assert.deepEqual(result.failed, []);
});

test('locked saved results stay in the library while other deletions succeed', async () => {
  const result = await deleteStudyBatch(studies, {
    deletePrediction: async (id) => { if (id === 'SP-1000') throw new Error('File locked'); },
  });
  assert.deepEqual(result.deleted, ['SP-1001']);
  assert.deepEqual(result.failed, [{ id: 'SP-1000', message: 'File locked' }]);
});

test('an empty or demo-only target list deletes nothing and calls nothing', async () => {
  const calls = [];
  assert.deepEqual(await deleteStudyBatch([studies[2]], { deletePrediction: async (id) => calls.push(id) }), { deleted: [], failed: [] });
  assert.deepEqual(await deleteStudyBatch([], { deletePrediction: async (id) => calls.push(id) }), { deleted: [], failed: [] });
  assert.deepEqual(calls, []);
});

test('the demo branch is gone: no hideDemos is called even when offered', async () => {
  let hidden = false;
  const result = await deleteStudyBatch(studies, { deletePrediction: async () => {}, hideDemos: async () => { hidden = true; } });
  assert.equal(hidden, false);
  assert.deepEqual(result.deleted, ['SP-1000', 'SP-1001']);
});
```

Run: `node --test test/delete-studies.test.js` — expected: tests 1, 3 and 4 FAIL (the current implementation still takes the demo branch: it reports the demo as a failure when `hideDemos` is missing, and calls it when offered); test 2 passes.

- [ ] **Step 2: Rewrite `delete-studies.js`**

```js
// Only remove a library record after deleting its saved prediction succeeds. Original radiographs
// are never passed to a file-deletion API. Demo studies are never among the targets -- they carry
// no tick and no trash button (studies-table spec 2026-09-10, section 5) -- and are skipped if handed in;
// showing and hiding them is renderer/demo-studies.js's business (spec 9).
export async function deleteStudyBatch(studies, { deletePrediction }) {
  const deleted = [];
  const failed = [];
  for (const study of studies.filter((study) => study.source === 'real')) {
    try { await deletePrediction(study.id); deleted.push(study.id); }
    catch (error) { failed.push({ id: study.id, message: error.message }); }
  }
  return { deleted, failed };
}
```

Run: `node --test test/delete-studies.test.js` — expected PASS.

- [ ] **Step 3: The pure toggle patch (failing test, then the module)**

Create `test/demo-visibility.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoStudiesShown, demoVisibilityPatch } from '../renderer/data/demo-visibility.js';
import { DEMO_STUDIES } from '../renderer/data/demo-studies.js';

const real = [{ id: 'SP-1000', source: 'real' }, { id: 'SP-1001', source: 'real' }];

test('demoStudiesShown reads whether any demo record is in the library', () => {
  assert.equal(demoStudiesShown({ studies: real }), false);
  assert.equal(demoStudiesShown({ studies: [...real, DEMO_STUDIES[0]] }), true);
  assert.equal(demoStudiesShown({}), false);
});

test('hiding removes the demos, prunes their ticks and closes an open or compared demo', () => {
  const state = {
    studies: [...real, ...DEMO_STUDIES], paramSelected: ['SP-1000', DEMO_STUDIES[0].id],
    openId: DEMO_STUDIES[0].id, compareId: DEMO_STUDIES[1].id, screen: 'analysis',
  };
  const patch = demoVisibilityPatch(state, false);
  assert.deepEqual(patch.studies, real);
  assert.deepEqual(patch.paramSelected, ['SP-1000']);
  assert.equal(patch.openId, null);
  assert.equal(patch.screen, 'studies');
  assert.equal(patch.compareId, null);
  assert.equal(patch.editing, false, 'the per-study view state is reset with openId');
  assert.equal(state.studies.length, real.length + DEMO_STUDIES.length, 'the state is not mutated');
});

test('hiding leaves an open real study open', () => {
  const patch = demoVisibilityPatch({ studies: [...real, ...DEMO_STUDIES], paramSelected: [], openId: 'SP-1000', compareId: null, screen: 'analysis' }, false);
  assert.deepEqual(patch.studies, real);
  assert.equal('openId' in patch, false);
  assert.equal('screen' in patch, false);
});

test('showing appends the nine demos after the real studies; the asked-for state is an empty patch', () => {
  const shown = demoVisibilityPatch({ studies: real, paramSelected: [] }, true);
  assert.deepEqual(shown.studies.map((s) => s.id), [...real.map((s) => s.id), ...DEMO_STUDIES.map((s) => s.id)]);
  assert.deepEqual(demoVisibilityPatch({ studies: real, paramSelected: [] }, false), {});
  assert.deepEqual(demoVisibilityPatch({ studies: [...real, ...DEMO_STUDIES], paramSelected: [] }, true), {});
});
```

Run: `node --test test/demo-visibility.test.js` — expected: module not found.

Create `renderer/data/demo-visibility.js`:

```js
/**
 * Showing and hiding the compiled-in demo studies (studies-table spec 2026-09-10, section 9). Pure: the
 * store patch for either direction, tested; renderer/demo-studies.js writes the preference and
 * applies the patch. Only a development build ever calls this -- the toggle is not built when the
 * main process did not allow demos -- but the patch itself does not know or care.
 */
import { merge } from './persistence.js';
import { withIds } from './parameters.js';

// Every path that changes openId resets the per-study view state, so a study never inherits the
// previous one's zoom, pan, selection or edit mode. The same seven keys as screens/studies.js's
// FRESH_VIEW, repeated here because data/ never imports from screens/.
const FRESH_VIEW = { selectedLevel: null, zoom: 1, panX: 0, panY: 0, panMode: false, editing: false, selection: null };

export function demoStudiesShown(state) {
  return (state?.studies ?? []).some((study) => study.source === 'demo');
}

// The patch that shows or hides the demos. Showing appends the nine after the real studies
// (merge's order); hiding removes them, prunes their ids from the shared selection, and closes a
// demo that was open or held for comparison -- what "Delete all studies" did for them before
// (HANDOFF reconcile, 2026-09-08). Already in the asked-for state: an empty patch.
export function demoVisibilityPatch(state, shown) {
  if (demoStudiesShown(state) === shown) return {};
  const real = state.studies.filter((study) => study.source === 'real');
  if (shown) return { studies: merge(real) };
  const demoIds = state.studies.filter((study) => study.source === 'demo').map((study) => study.id);
  const gone = new Set(demoIds);
  return {
    studies: real,
    paramSelected: withIds(state.paramSelected ?? [], demoIds, false),
    ...(gone.has(state.openId) ? { openId: null, screen: 'studies', ...FRESH_VIEW } : {}),
    ...(gone.has(state.compareId) ? { compareId: null } : {}),
  };
}
```

Run: `node --test test/demo-visibility.test.js` — expected PASS.

- [ ] **Step 4: The IPC rename (main process, bridge, api)**

In `main.js`, replace the `hide-demo-studies` handler (four lines from `ipcMain.handle('hide-demo-studies', ...` to its closing `});`) with:

```js
// (2026-09-10, studies-table spec 9) the Settings toggle's write. The demos are a development
// fixture: a packaged build never shows them, never renders the toggle, and refuses this write
// outright -- so the preference cannot be set in an installed build even by a stray call.
ipcMain.handle('set-demo-studies-hidden', async (_event, hidden) => {
  if (app.isPackaged) return false;
  const file = path.join(app.getPath('userData'), 'library-preferences.json');
  const preferences = await readJsonOrNull(file);
  await writeJsonAtomic(file, { ...preferences, hideDemoStudies: hidden === true });
  return true;
});
```

In `preload.js`, replace the `hideDemoStudies:` line with:

```js
  setDemoStudiesHidden: (hidden) => ipcRenderer.invoke('set-demo-studies-hidden', hidden),
```

In `renderer/api.js`, replace the `export async function hideDemoStudies()` line with:

```js
// (2026-09-10, studies-table spec 9) true when the preference was written; false when the main
// process refused (a packaged build). The persistence-disabled guard applies, as it did to hiding.
export async function setDemoStudiesHidden(hidden) { assertWritable(); return invoke('setDemoStudiesHidden', hidden); }
```

`grep -rn "hideDemoStudies\|hide-demo-studies" --include=*.js --include=*.cjs --include=*.mjs . | grep -v node_modules` must now list only the `hideDemoStudies` KEY inside `library-preferences.json` (in `main.js`'s two handlers) and nothing else.

- [ ] **Step 5: The wiring module**

Create `renderer/demo-studies.js`:

```js
/**
 * The Settings toggle's wiring (studies-table spec 2026-09-10, section 9): write the preference through the
 * bridge, then apply data/demo-visibility.js's patch. Module scope, like renderer/batch.js; the
 * sidebar calls it from a click handler, never from inside a store notification.
 */
import { getState, setState } from './store.js';
import { demoStudiesAllowed, setDemoStudiesHidden } from './api.js';
import { showToast } from './components/toast.js';
import { demoVisibilityPatch } from './data/demo-visibility.js';

export { demoStudiesShown } from './data/demo-visibility.js';

// Whether the toggle exists at all: the main process reports demoStudies only for a development
// build (`!app.isPackaged`), so an installed build never renders it.
export function demoToggleAvailable() {
  return demoStudiesAllowed();
}

// Resolves true when the library was changed. Refuses while a run, a batch or a bulk delete is
// up, as the processing settings do. The preference write comes FIRST; a failure toasts but does
// not stop the session-level change -- the terms changePerformance's own save uses.
export async function setDemoStudiesShown(shown) {
  const live = getState();
  if (!demoStudiesAllowed()) return false;
  if (live.running || live.batch || live.deletingStudies) return false;
  try {
    await setDemoStudiesHidden(!shown);
  } catch (error) {
    showToast(`Demo studies ${shown ? 'shown' : 'hidden'} this session, but the setting could not be saved: ${error.message}`);
  }
  setState((current) => demoVisibilityPatch(current, shown));
  return true;
}
```

- [ ] **Step 6: The sidebar block and the router key**

In `renderer/components/sidebar.js`, add to the imports (after the `changePerformance` line):

```js
import { demoToggleAvailable, demoStudiesShown, setDemoStudiesShown } from '../demo-studies.js';
```

After `performanceBlock`, add:

```js
// (2026-09-10, studies-table spec 9) DEMO STUDIES: Show / Hide, development builds only. Built
// only when the main process allowed demos at all, which it does for `!app.isPackaged`: an
// installed build never renders this block, and its main-process write refuses too. `busy` is the
// processing block's rule plus a bulk delete; `deletingStudies` is in SIDEBAR_KEYS for it.
function demoBlock(state) {
  if (!demoToggleAvailable()) return null;
  const busy = Boolean(state.running || state.batch || state.deletingStudies);
  const shown = demoStudiesShown(state);
  return el('div', { class: 'sidebar-models demo-settings' },
    el('div', { class: 'sidebar-models-label' }, 'DEMO STUDIES'),
    el('div', { class: 'model-choice', role: 'group', 'aria-label': 'Demo studies' },
      ...[[true, 'Show'], [false, 'Hide']].map(([value, label]) => el('button', {
        type: 'button', class: 'model-choice-btn', disabled: busy,
        'data-demo-toggle': value ? 'show' : 'hide',
        'aria-pressed': shown === value ? 'true' : 'false',
        onClick: () => { setDemoStudiesShown(value); },
      }, label))),
    el('p', { class: 'processing-note' },
      'The nine compiled-in studies, for trying the interface. Development builds only; an installed build never has them.'));
}
```

In `render`, after the line `state.settingsOpen && !collapsed ? performanceBlock(state) : null,` add:

```js
    state.settingsOpen && !collapsed ? demoBlock(state) : null,
```

In `renderer/router.js`'s `SIDEBAR_KEYS`, after `'batch',` add `'deletingStudies',` with the comment `// (2026-09-10) the demo toggle's busy state`.

- [ ] **Step 7: Run the unit suite, launch, check both gates by hand**

`node --test test/*.test.js` — expected PASS, 499 + 1 (delete-studies: three tests become four) + 4 (demo-visibility) = 504; recount from the run and record it.

Launch from source (development build): Settings shows `DEMO STUDIES` with `Show` pressed; `Hide` removes the nine rows and the summary drops by nine; `Show` puts them back at the end; quit and relaunch: the choice held (`library-preferences.json` in the profile carries `hideDemoStudies`). With a demo open on Analysis, `Hide` returns to the list. Console clean. The packaged-build half (no block, no write) is checked at the next preview installer (Task 8 lists it).

- [ ] **Step 8: Commit**

```bash
git add renderer/data/delete-studies.js test/delete-studies.test.js main.js preload.js renderer/api.js renderer/data/demo-visibility.js test/demo-visibility.test.js renderer/demo-studies.js renderer/components/sidebar.js renderer/router.js
git commit -F tools/smoke/out/task5-msg.txt
```

Message: `feat: demo studies toggle in Settings for development builds; deleteStudyBatch is real-only` — body: the IPC rename and the packaged refusal; the trailer.

---
### Task 6: The Analysis screen — `Mark reviewed`, its note, and the header's status badge

**Files:**
- Modify: `renderer/screens/analysis.js` (the import block; `render`'s header, actions row and `update`; a new `toggleReviewed`)
- Modify: `styles/screens/analysis.css` (`.analysis-actions`, `.analysis-export`; new `.analysis-review`, `.analysis-review-note`, `.analysis-status`)

**Interfaces:**
- Consumes: `displayStatus`, `isReviewed`, `reviewedLabel`, `reviewBlockedReason` (Task 1); `statusBadge`, `unsupportedViewBadge` (Task 1); `inferenceView` (already imported); `mount` from `dom.js`.
- Produces (binding on Task 7): `button.analysis-review` with `aria-pressed`, text `Mark reviewed` | `Reviewed \u00B7 <date>`; `span.analysis-review-note` (hidden when enabled); `.analysis-status` holding the list's `span.badge.badge-<status>`.

This is DOM code: no unit test. Verification is Task 7's persist sections and Task 8's gate. Read `render` and `update` in `screens/analysis.js` in full before editing.

- [ ] **Step 1: Imports**

Change `import { el } from '../dom.js';` to `import { el, mount } from '../dom.js';`. After the `import { studyName, defaultName } from '../data/labels.js';` line add:

```js
import { displayStatus, isReviewed, reviewedLabel, reviewBlockedReason } from '../data/status.js';
import { statusBadge, unsupportedViewBadge } from '../components/status-badge.js';
```

- [ ] **Step 2: The header's badge**

In `render(state)`, directly after the `const confidenceBadge = el('div', { class: 'confidence-badge' }, ...);` statement, add:

```js
  // The list's status badge (studies-table spec 2026-09-10, section 8.3), so the screen says what the row
  // says: Processing while this study's run is in flight, Reviewed once marked. Rebuilt by update()
  // only when it would change.
  const statusHost = el('div', { class: 'analysis-status' });
```

and change the header's last two children from

```js
    el('div', { class: 'analysis-spacer' }),
    confidenceBadge);
```

to

```js
    el('div', { class: 'analysis-spacer' }),
    statusHost,
    confidenceBadge);
```

- [ ] **Step 3: The button, its note, the actions row**

Directly after the `const exportButton = el(...)` statement, add:

```js
  // Mark reviewed (studies-table spec 2026-09-10, section 8.3): one button that toggles the record's review
  // mark, with the reason it is disabled shown beside it -- Chromium shows no tooltip on a
  // disabled control, and the Parameters bar already renders its reason as a visible note.
  const reviewButton = el('button', {
    type: 'button', class: 'btn btn-small analysis-review', 'aria-pressed': 'false',
    onClick: () => toggleReviewed(),
  }, 'Mark reviewed');
  const reviewNote = el('span', { class: 'param-export-note analysis-review-note', hidden: true });
```

and change the panel's actions row from `el('div', { class: 'analysis-actions' }, exportButton),` to `el('div', { class: 'analysis-actions' }, exportButton, reviewButton, reviewNote),`.

- [ ] **Step 4: `toggleReviewed` and the badge key**

Directly before `async function exportCsv()`, add:

```js
  // The mark is a timestamp on the record (spec 8.1); unmarking writes null. Refused for the reasons
  // reviewBlockedReason lists, which update() also shows beside the button, so a keyboard
  // activation of a disabled-looking button cannot slip through. One new-array write; the saver
  // subscribed in renderer/main.js persists it. Every write that changes the numbers clears it
  // again (spec 8.4) -- none of that is here.
  function toggleReviewed() {
    const live = getState();
    const open = currentStudy(live);
    if (!open) return;
    const pending = Boolean(live.measurementDrafts?.[open.id]);
    if (reviewBlockedReason({ study: open, running: live.running, pending })) return;
    const reviewedAt = isReviewed(open) ? null : new Date().toISOString();
    setState((state) => ({
      studies: state.studies.map((study) => (study.id === open.id ? { ...study, reviewedAt } : study)),
    }));
  }

  // What the header badge last showed; update() runs on every notification, pan frames included,
  // and rebuilds the badge only when this changes.
  let lastBadgeKey = null;
```

- [ ] **Step 5: `update`**

In `update()`, directly after the `exportButton.title = ...;` statement (the three-line ternary), add:

```js
    // Mark reviewed (spec 8.3): enabled only when there is something to review and nothing is about
    // to change it. The text carries the date once marked; the note carries the reason otherwise.
    const reason = reviewBlockedReason({ study: open, running: live.running, pending: pendingMeasurement });
    const reviewed = isReviewed(open);
    reviewButton.disabled = reason !== null;
    reviewButton.textContent = reviewed ? reviewedLabel(open.reviewedAt) : 'Mark reviewed';
    reviewButton.setAttribute('aria-pressed', reviewed ? 'true' : 'false');
    reviewButton.title = reviewed && reason === null ? 'Unmark reviewed' : '';
    reviewNote.textContent = reason ?? '';
    reviewNote.hidden = reason === null;

    // The list's badge, on the list's rule (screens/studies.js buildRow): Unsupported view for an
    // unsegmented film no model reads, else displayStatus with state.running.
    const unsupported = open.source === 'real' && open.measurements == null && live.running !== open.id && !inferenceView(open.view);
    const badgeKey = unsupported ? `unsupported:${open.view}` : displayStatus(open, live.running);
    if (badgeKey !== lastBadgeKey) {
      lastBadgeKey = badgeKey;
      mount(statusHost, unsupported ? unsupportedViewBadge(open.view) : statusBadge(badgeKey));
    }
```

- [ ] **Step 6: Styles**

In `styles/screens/analysis.css`, replace the `.analysis-actions { ... }` and `.analysis-export { ... }` blocks with:

```css
/* Export CSV and Mark reviewed share the row (studies-table spec 2026-09-10, section 8.3); the note under
   them says why Mark reviewed is disabled, since Chromium shows no tooltip on a disabled control. */
.analysis-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 0 14px 10px;
  flex-shrink: 0;
}
.analysis-export,
.analysis-review {
  flex: 1 1 auto;
  justify-content: center;
}
.analysis-review[aria-pressed="true"]:not(:disabled) {
  color: var(--sage);
  border-color: color-mix(in srgb, var(--sage) 45%, var(--border));
}
.analysis-review-note {
  flex: 1 1 100%;
}

/* The list's status badge in the header, before FEMORAL FIT CONFIDENCE. */
.analysis-status {
  display: flex;
  align-items: center;
}
```

- [ ] **Step 7: Launch and walk it; unit suite; commit**

From source: open a segmented real study — the header shows the badge beside FEMORAL FIT CONFIDENCE and `Mark reviewed` beside Export CSV; click it — both badges (header, and the row back on the list) read Reviewed, the button reads `Reviewed · <today>` and `aria-pressed="true"`; click again — unmarked. A demo study: disabled, note `Demo studies are not saved`. An unsegmented study: disabled, note `Nothing to review yet`. Nudge a landmark on a reviewed study: the mark clears as the numbers update. Console clean.

`node --test test/*.test.js` — expected 504/504 (nothing new is unit-tested; recount and record).

```bash
git add renderer/screens/analysis.js styles/screens/analysis.css
git commit -F tools/smoke/out/task6-msg.txt
```

Message: `feat: Mark reviewed on the Analysis screen, with the list's status badge in its header` — body: DOM, no unit test, covered by the persist smoke suite and the gate; the trailer.

---

### Task 7: Smoke — the renamed column, the summary's third clause, sections 15–17, the persisted subject and mark, the re-run clearing it; the README's baselines

**Files:**
- Modify: `tools/smoke/smoke-studies.mjs` (lines 61–63, 85, 95–97, 215, 222, 230, 424–427; new sections after line 595)
- Modify: `tools/smoke/smoke-persist.mjs` (`--phase run` before its section 12; the state file; `--phase restart` section A and section E)
- Modify: `tools/smoke/README.md` (the "Known baseline" paragraph)

**Interfaces:**
- Consumes: every `data-find-key`, class and string Task 4 produces; `.analysis-review`, `.analysis-status .badge` (Task 6); `cdp.key(name)` and `cdp.typeText(text)` from `cdp-lib.mjs`; `injectFilm`, `clickAt`, `readBar`, `FILTERS_RESET`, `waitForState` already defined in the studies suite; `waitFor`, `storedStudy`, `STUDY_ID`, `STATE_FILE` already defined in the persist suite.

Line numbers are those of `fork/main` @ `6106463`; anchor on the quoted text, not the number.

- [ ] **Step 1: `smoke-studies.mjs` — the summary regex, three sites**

(a) Replace lines 61–63

```js
  const summaryMatch = /^(\d+) STUDIES · (\d+) UNSEGMENTED$/.exec(summaryText);
  check('summary matches "{n} STUDIES · {m} UNSEGMENTED" with n >= 9', Boolean(summaryMatch) && Number(summaryMatch[1]) >= 9, summaryText);
  const n = summaryMatch ? Number(summaryMatch[1]) : null;
```

with

```js
  // (2026-09-10, studies-table spec 10) a third clause. The regex keeps the file's separator glyph
  // and writes the new one as an escape (HANDOFF's glyph trap); both match the same character.
  const summaryMatch = /^(\d+) STUDIES · (\d+) UNSEGMENTED \u00B7 (\d+) TO REVIEW$/.exec(summaryText);
  check('summary matches "{n} STUDIES · {m} UNSEGMENTED · {k} TO REVIEW" with n >= 9', Boolean(summaryMatch) && Number(summaryMatch[1]) >= 9, summaryText);
  const n = summaryMatch ? Number(summaryMatch[1]) : null;
  const toReview0 = summaryMatch ? Number(summaryMatch[3]) : null;
```

(b) Line 230: change

```js
  check('summary reads n+1 studies, 1 unsegmented', summaryAfterAdd === `${n + 1} STUDIES · 1 UNSEGMENTED`, summaryAfterAdd);
```

to

```js
  check('summary reads n+1 studies, 1 unsegmented, the same to-review count', summaryAfterAdd === `${n + 1} STUDIES · 1 UNSEGMENTED \u00B7 ${toReview0} TO REVIEW`, summaryAfterAdd);
```

(c) In `summaryParts` (around line 424), change the regex line to

```js
    const m = /^(\d+) STUDIES · (\d+) UNSEGMENTED \u00B7 (\d+) TO REVIEW$/.exec(((await text(cdp, '.studies-summary')) || '').trim());
```

(the object it returns, `{ studies, unsegmented }`, is unchanged).

- [ ] **Step 2: `smoke-studies.mjs` — the header and the SUBJECT cell**

(a) Line 85: change

```js
      headers: [...document.querySelectorAll('.studies-table-head > div')].map((d) => d.textContent),
```

to

```js
      // (2026-09-10) every header holds a sort button; strip its mark, as the grid's check does.
      headers: [...document.querySelectorAll('.studies-table-head > div')].map((d) => { const b = d.querySelector('.param-sort'); return (b ? b.textContent.replace(/[\u25B4\u25BE]/g, '') : d.textContent).trim(); }),
```

(b) Lines 95–97: change the check to

```js
  check('the header row reads STUDY, SUBJECT, VIEW, WORKSPACE, FOLDER, DATE, STATUS',
    JSON.stringify(cellDetail.headers) === JSON.stringify(['STUDY', 'SUBJECT', 'VIEW', 'WORKSPACE', 'FOLDER', 'DATE', 'STATUS', '']),
    cellDetail.headers);
```

(c) Line 215: `patient: row.querySelector('.studies-cell-patient')?.textContent.trim(),` → `subject: row.querySelector('.studies-cell-subject')?.textContent.trim(),`. Line 222: `newRow.patient === '—'` → `newRow.subject === '—'` (keep that line's glyph as it is).

- [ ] **Step 3: `smoke-studies.mjs` — sections 15–17**

Directly after the line

```js
  check('no console errors or exceptions during the batch sections', cdp.errors.length === errorsAfter9, cdp.errors.slice(errorsAfter9));
```

and before `} finally {`, insert:

```js
  // ---------------------------------------------------------------------------------------------
  // 15-17 (2026-09-10, studies-table spec): sortable headers, the SUBJECT editor, Delete selected.
  // ---------------------------------------------------------------------------------------------
  const errorsAfter14 = cdp.errors.length;
  await cdp.setState(`{ screen: "studies", query: "", paramFilters: ${FILTERS_RESET}, paramSelected: [], findSort: { key: "date", dir: "desc" } }`);
  await cdp.settle(200);
  const badgeOrder = () => cdp.evaluate(`[...document.querySelectorAll('.studies-row')].map((r) => (r.querySelector('.badge') || {}).className || '')`);
  const rank = (c) => (c.includes('badge-proc') ? 0 : c.includes('badge-rev') ? 1 : c.includes('badge-seg') ? 2 : c.includes('badge-ok') ? 3 : 9);
  const activeKey = () => cdp.evaluate(`document.activeElement ? document.activeElement.getAttribute('data-find-key') : null`);

  // 15. Sort (spec 6). SP-9000 is segmented, SP-9001 unsegmented (section 10), the demos segmented.
  const dateMark = await cdp.evaluate(`document.querySelector('[data-find-key="sort-date"]')?.textContent ?? null`);
  check('DATE carries the descending mark by default', typeof dateMark === 'string' && dateMark.includes('\u25BE'), dateMark);
  await clickAt('[data-find-key="sort-status"]');
  await cdp.settle(150);
  s = await cdp.state();
  check('clicking STATUS sorts ascending by status', s.findSort.key === 'status' && s.findSort.dir === 'asc', s.findSort);
  const badgesAsc = await badgeOrder();
  check('ascending status never puts a higher rank before a lower one', badgesAsc.length > 0 && badgesAsc.map(rank).every((r, i, a) => i === 0 || a[i - 1] <= r), badgesAsc);
  const statusMark = await cdp.evaluate(`document.querySelector('[data-find-key="sort-status"]')?.textContent ?? null`);
  check('the STATUS header carries the ascending mark and kept focus across the rebuild', typeof statusMark === 'string' && statusMark.includes('\u25B4') && (await activeKey()) === 'sort-status', { statusMark, active: await activeKey() });
  await clickAt('[data-find-key="sort-status"]');
  await cdp.settle(150);
  const badgesDesc = await badgeOrder();
  check('clicking STATUS again reverses it', (await cdp.state()).findSort.dir === 'desc' && badgesDesc.map(rank).every((r, i, a) => i === 0 || a[i - 1] >= r), badgesDesc);
  await clickAt('[data-find-key="sort-study"]');
  await cdp.settle(150);
  const namesAsc = await cdp.evaluate(`[...document.querySelectorAll('.studies-row .studies-name')].map((e) => e.textContent.toLowerCase())`);
  check('clicking STUDY sorts the names ascending, case-insensitively', (await cdp.state()).findSort.key === 'study' && namesAsc.length > 1 && namesAsc.every((v, i, a) => i === 0 || a[i - 1] <= v), namesAsc);
  await cdp.setState('{ findSort: { key: "date", dir: "desc" } }');
  await cdp.settle(150);

  // 16. The SUBJECT editor on a real row (spec 7.2). SP-9000 has no subject yet.
  const cell16 = await cdp.rect('[data-find-key="subject-SP-9000"]');
  const cellText16 = ((await text(cdp, '[data-find-key="subject-SP-9000"]')) || '').trim();
  check('a real row has a click-to-edit SUBJECT cell reading an em dash', Boolean(cell16) && cellText16 === '\u2014', { cell16, cellText16 });
  const demoCell16 = await cdp.evaluate(`Boolean(document.querySelector('[data-find-key="subject-SP-0042"]'))`);
  check('a demo row has no editor', demoCell16 === false, demoCell16);
  if (cell16) await cdp.click(cell16.cx, cell16.cy);
  await cdp.settle(150);
  s = await cdp.state();
  const editor16 = await cdp.evaluate(`(() => { const i = document.querySelector('[data-find-key="subject-input-SP-9000"]'); return i ? { focused: document.activeElement === i, value: i.value } : null; })()`);
  check('clicking the cell opens an editor with focus and does not open the study', s.screen === 'studies' && Boolean(editor16) && editor16.focused === true && editor16.value === '', { screen: s.screen, editor16 });
  await cdp.typeText('S-42');
  await cdp.key('Enter');
  await cdp.settle(200);
  s = await cdp.state();
  check('Enter stores the trimmed subject on the record', s.studies.find((x) => x.id === 'SP-9000')?.subjectId === 'S-42', s.studies.find((x) => x.id === 'SP-9000')?.subjectId ?? null);
  const after16 = await cdp.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.studies-row')];
    const i = rows.findIndex((r) => r.dataset.studyId === 'SP-9000');
    const below = rows.slice(i + 1).find((r) => r.querySelector('.studies-subject-editable, .studies-subject-input'));
    const active = document.activeElement;
    return { cell: document.querySelector('[data-find-key="subject-SP-9000"]')?.textContent.trim() ?? null, below: below ? below.dataset.studyId : null, active: active ? active.getAttribute('data-find-key') : null };
  })()`);
  check('the cell shows the new subject', after16.cell === 'S-42', after16);
  check("Enter opened the next real row's editor, or stayed on the cell when none is below", after16.below ? after16.active === `subject-input-${after16.below}` : after16.active === 'subject-SP-9000', after16);
  await cdp.key('Escape');
  await cdp.settle(150);
  const cell16b = await cdp.rect('[data-find-key="subject-SP-9000"]');
  if (cell16b) await cdp.click(cell16b.cx, cell16b.cy);
  await cdp.settle(150);
  const reopened16 = await cdp.evaluate(`(() => { const i = document.querySelector('[data-find-key="subject-input-SP-9000"]'); return i ? { value: i.value, selected: i.selectionStart === 0 && i.selectionEnd === i.value.length } : null; })()`);
  check('reopening pre-fills the stored subject with the text selected', Boolean(reopened16) && reopened16.value === 'S-42' && reopened16.selected === true, reopened16);
  await cdp.typeText('zzz');
  await cdp.key('Escape');
  await cdp.settle(150);
  s = await cdp.state();
  check('Escape discards the typed text and returns focus to the cell', s.studies.find((x) => x.id === 'SP-9000')?.subjectId === 'S-42' && (await activeKey()) === 'subject-SP-9000', { subject: s.studies.find((x) => x.id === 'SP-9000')?.subjectId, active: await activeKey() });
  await cdp.setState('{ query: "S-42" }');
  await cdp.settle(150);
  check('the search box finds the study by its new subject', (await rowCount(cdp)) === 1, await rowCount(cdp));
  await clearSearch(cdp);
  await cdp.settle(150);

  // 17. Delete selected (spec 5). Two throwaway films, no bytes, no file: nothing to segment, and
  // no sidecar to delete, so deletePrediction's ENOENT-is-fine path is what runs.
  await injectFilm({ id: 'SP-9002', fileName: 'gone-a.png', filePath: 'C:\\smoke\\Fusion2025\\post-op\\gone-a.png', workspaceFolder: 'C:\\smoke\\Fusion2025', base64: null });
  await injectFilm({ id: 'SP-9003', fileName: 'gone-b.png', filePath: 'C:\\smoke\\Fusion2025\\post-op\\gone-b.png', workspaceFolder: 'C:\\smoke\\Fusion2025', base64: null });
  await cdp.setState('{ paramSelected: [], query: "gone" }');
  await cdp.settle(200);
  const countBefore17 = (await cdp.state()).studies.length;
  const readDelete = () => cdp.evaluate(`(() => { const b = document.querySelector('[data-find-key="delete"]'); return b ? { label: b.textContent, disabled: b.disabled, title: b.title } : null; })()`);
  const promptUp = () => cdp.evaluate(`Boolean(document.querySelector('[data-find-key="delete-prompt"]'))`);
  const d0 = await readDelete();
  check('with nothing ticked the bar reads Delete, disabled, and says to tick studies', Boolean(d0) && d0.label === 'Delete' && d0.disabled === true && d0.title === 'Tick studies to delete', d0);
  const deleteAllGone = await cdp.evaluate(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Delete all studies')`);
  check('no library-level Delete all studies control remains', deleteAllGone === false, deleteAllGone);
  await clickAt('input[data-find-key="select-all"]');
  await cdp.settle(150);
  s = await cdp.state();
  check('select-all over the searched rows ticks the two throwaway films', s.paramSelected.length === 2 && s.paramSelected.includes('SP-9002') && s.paramSelected.includes('SP-9003'), s.paramSelected);
  const d1 = await readDelete();
  check('the bar reads Delete 2 selected, enabled', Boolean(d1) && d1.label === 'Delete 2 selected' && d1.disabled === false, d1);
  await cdp.setState('{ query: "gone-a" }');
  await cdp.settle(150);
  const d2 = await readDelete();
  check('a tick hidden by the search is not counted: Delete 1 selected', Boolean(d2) && d2.label === 'Delete 1 selected', d2);
  await cdp.setState('{ query: "gone" }');
  await cdp.settle(150);
  await clickAt('[data-find-key="delete"]');
  await cdp.settle(150);
  const prompt17 = await cdp.evaluate(`(() => { const p = document.querySelector('[data-find-key="delete-prompt"]'); return p ? { text: p.querySelector('span')?.textContent, focus: document.activeElement?.getAttribute('data-find-key') } : null; })()`);
  check('Delete replaces the bar with a prompt naming two studies, focus on Cancel', Boolean(prompt17) && prompt17.text === 'Delete 2 studies, including their saved results? Original image files will be kept.' && prompt17.focus === 'delete-cancel', prompt17);
  await cdp.key('Escape');
  await cdp.settle(150);
  check('Escape withdraws the prompt and hands focus back to Delete', (await promptUp()) === false && (await activeKey()) === 'delete', { prompt: await promptUp(), active: await activeKey() });
  await clickAt('[data-find-key="delete"]');
  await cdp.settle(150);
  await clickAt('input[data-find-key="row-SP-9003"]');
  await cdp.settle(150);
  const d3 = await readDelete();
  check('changing a tick withdraws the prompt', (await promptUp()) === false && Boolean(d3) && d3.label === 'Delete 1 selected', d3);
  await clickAt('input[data-find-key="row-SP-9003"]');
  await cdp.settle(150);
  await clickAt('[data-find-key="delete"]');
  await cdp.settle(150);
  await clickAt('[data-find-key="delete-confirm"]');
  const gone17 = await waitForState(`s.studies.length === ${countBefore17 - 2} && !s.deletingStudies`, 5000);
  s = await cdp.state();
  check('Delete permanently removes the two records and nothing else', gone17 && !s.studies.some((x) => x.id === 'SP-9002' || x.id === 'SP-9003') && s.studies.some((x) => x.id === 'SP-9000'), { gone17, count: s.studies.length });
  check('their ticks are pruned and the search is untouched', s.paramSelected.length === 0 && s.query === 'gone', { selected: s.paramSelected, query: s.query });
  check('the toast reports the count', String(s.toast || '').startsWith('Deleted 2 studies.'), s.toast);
  await clearSearch(cdp);
  await cdp.settle(150);
  const summary17 = ((await text(cdp, '.studies-summary')) || '').trim();
  check('the summary carries the TO REVIEW clause after the delete', /^\d+ STUDIES · \d+ UNSEGMENTED \u00B7 \d+ TO REVIEW$/.test(summary17), summary17);
  check('no console errors or exceptions during sections 15-17', cdp.errors.length === errorsAfter14, cdp.errors.slice(errorsAfter14));
```

Two of the regexes above and the `summaryAfterAdd` template carry the file's existing `·` glyph beside a new `\u00B7` escape: that is deliberate (the glyph rule) and both match the same character.

- [ ] **Step 4: `smoke-persist.mjs` — mark and subject in `--phase run`; assert them after the restart; the re-run clears the mark**

(a) In `--phase run`, directly before the comment line `// 12. Hand phase 2 the CORRECTED study, once studies.json has actually caught up with it.`, insert:

```js
    // 11b. (2026-09-10, studies-table spec 8, spec 7) Mark the study reviewed from the Analysis panel
    // and give it a subject through the store, so phase 2 can prove both survive the restart. After
    // the last nudge on purpose: a correction clears the mark (spec 8.4), and phase 2's section E proves
    // the re-run clears it too.
    const reviewBefore = await cdp.evaluate(`(() => { const b = document.querySelector('.analysis-review'); return b ? { text: b.textContent.trim(), disabled: b.disabled, pressed: b.getAttribute('aria-pressed') } : null; })()`);
    check('the panel offers Mark reviewed, enabled, on a segmented study', Boolean(reviewBefore) && reviewBefore.text === 'Mark reviewed' && reviewBefore.disabled === false && reviewBefore.pressed === 'false', reviewBefore);
    const reviewRect = await cdp.rect('.analysis-review');
    if (reviewRect) await cdp.click(reviewRect.cx, reviewRect.cy);
    const marked = await waitFor(async () => { const x = await storedStudy(); return x && typeof x.reviewedAt === 'string' ? x : null; }, 3000);
    check('clicking it stamps reviewedAt on the record', Boolean(marked) && !Number.isNaN(Date.parse(marked.reviewedAt)), marked ? marked.reviewedAt : null);
    const reviewAfter = await cdp.evaluate(`(() => { const b = document.querySelector('.analysis-review'); const badge = document.querySelector('.analysis-status .badge'); return { text: b ? b.textContent.trim() : null, pressed: b ? b.getAttribute('aria-pressed') : null, badge: badge ? badge.className : null, badgeText: badge ? badge.textContent.trim() : null }; })()`);
    check('the button reads Reviewed with the date and the header badge reads Reviewed', String(reviewAfter.text).startsWith('Reviewed') && reviewAfter.pressed === 'true' && reviewAfter.badge === 'badge badge-ok' && reviewAfter.badgeText === 'Reviewed', reviewAfter);
    await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((st) => ({ studies: st.studies.map((x) => (x.id === ${JSON.stringify(STUDY_ID)} ? { ...x, subjectId: 'PERSIST-01' } : x)) })))`);
    await cdp.settle(150);
    check('the subject is on the record', (await storedStudy())?.subjectId === 'PERSIST-01', null);
```

(b) In the same phase, the state file: change

```js
      fs.writeFileSync(STATE_FILE, JSON.stringify({
        id: STUDY_ID, measurements: final.measurements, geometry: final.geometry, thumbnail: final.thumbnail,
      }, null, 2));
```

to

```js
      fs.writeFileSync(STATE_FILE, JSON.stringify({
        id: STUDY_ID, measurements: final.measurements, geometry: final.geometry, thumbnail: final.thumbnail,
        subjectId: final.subjectId, reviewedAt: final.reviewedAt,
      }, null, 2));
```

(c) In `--phase restart` section A, directly after `check('the geometry survived the restart', ...)`, add:

```js
    check('the subject survived the restart (studies-table spec 7)', Boolean(restored) && restored.subjectId === 'PERSIST-01' && restored.subjectId === before.subjectId, restored ? restored.subjectId : null);
    check('the review mark survived the restart (studies-table spec 8.1)', Boolean(restored) && typeof before.reviewedAt === 'string' && restored.reviewedAt === before.reviewedAt, restored ? restored.reviewedAt : null);
```

(d) In section E, directly after `check('the study still carries measurements and geometry after the re-run', ...)`, add:

```js
        check('the re-run cleared the review mark (studies-table spec 8.4, site 1)', Boolean(afterRerun) && afterRerun.reviewedAt === null, afterRerun ? afterRerun.reviewedAt : null);
```

- [ ] **Step 5: Run the suites, in the foreground, each captured to a file**

Follow `tools/smoke/README.md`'s launch and sequencing rules. Each on a FRESH scratch launch unless the README says otherwise; `node tools/smoke/cdp.mjs --quit` between them:

1. `node tools/smoke/smoke-studies.mjs > tools/smoke/out/task7-studies.txt 2>&1` — expected every check PASS (103 existing, minus none, plus the new sections' ~30). Record `N/N`.
2. `node tools/smoke/smoke-persist.mjs --phase run > tools/smoke/out/task7-persist-run.txt 2>&1`, quit, relaunch on the SAME profile (`SMOKE_KEEP_PROFILE=1`, per the README), `--phase restart > tools/smoke/out/task7-persist-restart.txt 2>&1`. Expected every check PASS. Record both counts.
3. `node tools/smoke/smoke-parameters.mjs > tools/smoke/out/task7-parameters.txt 2>&1` — expected 58/58 (the grid is mounted by `screens/studies.js`, which Task 4 rewrote in part).
4. `node tools/smoke/smoke-workspace.mjs > tools/smoke/out/task7-workspace.txt 2>&1` — expected 100/100.

A suite that prints nothing has thrown: re-run it bare and read the stack. A FAIL is a finding: fix the product (or the suite, if the check is wrong and you can say why) before moving on; never delete a check to get green.

- [ ] **Step 6: The README's baselines**

In `tools/smoke/README.md`, rewrite the "**Known baseline**" paragraph (the one beginning `**Known baseline** (fresh scratch profile, this branch tip): unit 426/426`) with the numbers the runs printed: unit (from `node --test test/*.test.js`), `smoke-studies.mjs` N/N ("sections 15–17, 2026-09-10, cover the sortable headers, the SUBJECT editor and Delete selected; it injects and deletes SP-9002 and SP-9003"), `smoke-workspace.mjs` 100/100, `smoke-parameters.mjs` 58/58, `smoke-seeding.mjs` 36/36 (unchanged, not re-run), `smoke-persist.mjs` N/N then N/N ("phase 1 marks SP-9000 reviewed and sets its subject after the last nudge; phase 2 asserts both survived and that the re-run cleared the mark"). Keep the paragraph's other sentences.

- [ ] **Step 7: Byte-check, commit with the gate pending**

`git diff -U0 -- tools/smoke/smoke-studies.mjs tools/smoke/smoke-persist.mjs | grep -nP '^[+-].*[^\x00-\x7F]'` — expected: the three summary-regex lines and the `summaryAfterAdd` line as `-`/`+` pairs, each `+` carrying the same `·` its twin carried; line 222's pair carrying `—`; no other `+` line.

```bash
git add tools/smoke/smoke-studies.mjs tools/smoke/smoke-persist.mjs tools/smoke/README.md
git commit -F tools/smoke/out/task7-msg.txt
```

Message: `test: smoke — sortable headers, the SUBJECT editor, Delete selected, the persisted mark and subject` — body: every count; the line `Gate: pending`; the trailer. Task 8 amends this commit.

---

### Task 8: HUMAN GATE — list these checks in the chat message, then end the turn

**Files:** none until the gate passes; then the amend of Task 7's commit.

This is the orchestrator's own task, not a subagent's. Tell the user first to close any app instance left open from earlier, then to launch from source (the three lines in Global Constraints) on their development library, and list these checks in the chat message. End the turn. Do not put the list in a widget (it hides the prose around it).

- [ ] **Step 1: Post the checks**

1. **The Find bar** reads Workspace · Folder · Delete · … · Segment. Delete is disabled with the title `Tick studies to delete`. Tick two real rows: `Delete 2 selected`. Click it: the bar becomes the prompt, focus on Cancel; Escape and Cancel both withdraw it. Confirm: exactly those two go, the toast says so, their ticks are gone, the search box is untouched. The per-row trash button and its prompt still work.
2. **Headers.** DATE carries ▾ by default (newest first). Click STATUS: Processing rows first, then Needs review, Segmented, Reviewed; click again: reversed. STUDY, SUBJECT, VIEW, WORKSPACE and FOLDER each sort, em dashes last both ways. Focus stays on the clicked header (Tab moves on sensibly).
3. **SUBJECT.** Click a real row's cell: an editor with its text selected. Type, Enter: stored, and the next real row's editor opens. Escape discards. Tab commits and moves on. Clicking elsewhere commits. The Parameters tab shows the same subject at once. A demo row shows its label and the DEMO pill and has no editor. Start a batch on another film, open an editor, type half a word, let the batch finish: the text and the caret are where you left them.
4. **Analysis.** A segmented study: the status badge sits beside FEMORAL FIT CONFIDENCE; `Mark reviewed` beside Export CSV. Click it: the header badge and (back on the list) the row badge read Reviewed; the button reads `Reviewed · <today>`; click again to unmark. A demo study: disabled, note `Demo studies are not saved`. An unsegmented study: disabled, note `Nothing to review yet`. On a reviewed study: a landmark nudge clears the mark; RESET TO PREDICTION clears it; a re-run clears it; a calibration review that changes the scale clears it (skip if no film on the library has a ruler).
5. **Settings** (development build): a DEMO STUDIES row with Show pressed. Hide removes the nine and the summary drops by nine; Show restores them at the end; quit and relaunch: the choice held. With a demo open on Analysis, Hide returns you to the list. Both buttons are disabled while a batch runs.
6. **The Reviewed badge is legible** in the light and the dark theme. The summary's `TO REVIEW` count matches the Needs review rows.
7. **The console is clean** (DevTools) throughout.

Deferred to the next preview installer, recorded in the ledger as not run: Settings has no DEMO STUDIES row in the packaged build, and its profile never gains `library-preferences.json`.

- [ ] **Step 2: On the user's answer**

Pass: amend Task 7's commit, replacing `Gate: pending` with `Gate: passed <date> (user)`; keep the trailer. Failures: fix each in the task that owns the code (a new commit per fix, reviewed as any task), re-run the suites the fix touches, then amend. Record the outcome, the checks not run, and every fix in the ledger (Task 9).

---

### Task 9: Records — the contract, the three specs, HANDOFF, ROADMAP, CLAUDE.md, this plan's ledger

**Files:**
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md`
- Modify: `docs/superpowers/specs/2026-08-31-spine-contour-ui-redesign-design.md` (§9.4, §13.1)
- Modify: `docs/superpowers/specs/2026-09-08-batch-segmentation-design.md` (§7.1)
- Modify: `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` (§9)
- Modify: `docs/superpowers/HANDOFF.md`, `docs/ROADMAP.md`, `CLAUDE.md`
- Modify: `docs/superpowers/plans/2026-09-10-studies-table-review.md` (the ledger at the end)

Markdown only: the glyph rule does not apply. Every edit below is additive or a marked supersession; never rewrite history.

- [ ] **Step 1: The contract**

(a) **File structure.** In the `renderer/` listing: after the `batch.js` entry add

```
  demo-studies.js                 (2026-09-10, studies-table spec §9) demoToggleAvailable(), setDemoStudiesShown(shown) — the one wiring of
                                  data/demo-visibility.js to the store, the toast and api.setDemoStudiesHidden; module scope
```

Under `components/`, add `  components/status-badge.js      (2026-09-10) statusBadge(status), unsupportedViewBadge(view) — the one badge both screens show`. Under `data/` (find the block listing `data/batch.js`, `data/parameters.js` and add beside them):

```
  data/find.js                    (2026-09-10, studies-table spec §6) DEFAULT_FIND_SORT, FIND_SORT_KEYS, statusRank, toggleFindSort,
                                  sortFindRows(studies, sort, runningId) — the Find list's sort; pure
  data/demo-visibility.js         (2026-09-10, §9) demoStudiesShown(state), demoVisibilityPatch(state, shown) — pure
```

Append to the `screens/studies.js` entry: `; (2026-09-10, studies-table spec) sortable headers over findSort, the SUBJECT column with its in-place editor, Delete over the ticked visible rows with an inline prompt, the summary's TO REVIEW clause; the library-level Delete all is gone`. Append to the `screens/analysis.js` entry: `; (2026-09-10) Mark reviewed with its note, and the list's status badge in the header`.

(b) **Study record.** After the `filmDate` property line add

```
 * @property {string|null} reviewedAt  (2026-09-10, studies-table spec §8.1) ISO timestamp of the human review, set on the
 *                                     Analysis screen; null until marked; cleared by every write that replaces
 *                                     measurements, geometry or calibration (§8.4)
```

Change the sentence `` `status` is **derived, never stored** — see `data/status.js`. `` to `` `status` is **derived from the record, the review mark included** — see `data/status.js` (2026-09-10). `` In the paragraph beginning `` `name`, `workspaceFolder`, `subjectId`, `timepoint` and `filmDate` are all **optional and default to `null`** ``, add `reviewedAt` to the list and change "All five must appear" to "All six must appear".

(c) **Store state.** After the `paramSelected:` lines add

```
  findSort: { key: 'date', dir: 'desc' },   // (2026-09-10, studies-table spec §6.1) the Find list's sort: key 'study'|'subject'|'view'|'workspace'|'folder'|'date'|'status'; replaced wholesale; session-only; read by screens/studies.js's own subscription
```

(d) **`renderer/data/status.js`.** In the signature block change `export function deriveStatus(study)      // → 'seg'|'rev'|'proc'` to `// → 'seg'|'rev'|'proc'|'ok'` and `statusLabel` to `// → 'Segmented'|'Needs review'|'Processing'|'Reviewed'`; add

```js
export function isReviewed(study)                // → boolean  (2026-09-10) a non-blank reviewedAt
export function displayStatus(study, runningId)  // → the status a row or header SHOWS: 'proc' while runningId === study.id, else deriveStatus
export function reviewedLabel(reviewedAt)        // → 'Reviewed · Sep 10, 2026' | 'Reviewed'
export function reviewBlockedReason({ study, running, pending })   // → string|null: REVIEW_DEMO | REVIEW_RUNNING | REVIEW_NOTHING | REVIEW_PENDING
```

In the "Rules, in order" list insert after rule 1: `1b. \`reviewedAt\` a non-blank string → \`'ok'\` (2026-09-10, studies-table spec §8.2). The reasons stay: \`reviewReasons\` is unchanged and the Measurements panel keeps showing them.` Change the sentence about "currently running" to name `displayStatus` as the one place that rule is written.

(e) **The 2026-09-07 delete-all amendment.** Append a paragraph: `**Superseded 2026-09-10 (studies-table spec §5, §9):** the library-level control is gone. Delete on the Find bar acts on the ticked visible rows through \`deleteStudyBatch(studies, { deletePrediction })\` — the \`hideDemos\` option and the demo branch are removed; \`state.deletingStudies\` and the mutual exclusion with run and batch are unchanged. Demo visibility is a development-only Settings toggle: \`renderer/demo-studies.js\` → \`api.setDemoStudiesHidden(hidden)\` → IPC \`set-demo-studies-hidden\`, which the main process refuses (returns false, writes nothing) when \`app.isPackaged\`; \`hide-demo-studies\` no longer exists. The read, \`demo-studies-hidden\`, and the bootstrap rule are unchanged.`

(f) **A new dated section at the end:**

```
## 2026-09-10 amendment: delete selected, sortable Find headers, editable subject, reviewed status, demo toggle

Spec `docs/superpowers/specs/2026-09-10-studies-table-review-design.md`; plan `plans/2026-09-10-studies-table-review.md`.
The record gains `reviewedAt` (§8.1, above). Status gains `'ok'`/Reviewed (§8.2); the mark is cleared ON THE WRITE at four sites:
`segmentStudy`'s run commit, `measure-queue.js`'s correction commit, the viewer's RESET TO PREDICTION, and `renderer/calibration.js`'s
`withCalibration(study, calibration)` (an unchanged scale returns the same record). The Find tab's module-scope UI state is
`confirmingId`, `confirmingSelected` and `editing`, all in its `update()` key; its `data-find-key`s gain `delete`, `delete-prompt`,
`delete-confirm`, `delete-cancel`, `sort-<key>`, `subject-<id>`, `subject-input-<id>`. `SIDEBAR_KEYS` gains `deletingStudies`.
The header cells stay plain divs (no `aria-sort`; the ROADMAP accessibility item owns the table semantics).
```

- [ ] **Step 2: The three specs**

Redesign spec §9.4: in the first paragraph, the summary becomes `` `{n} STUDIES · {m} UNSEGMENTED · {k} TO REVIEW` (the third clause 2026-09-10) ``; after "Each real row's STUDY cell carries a tick box; the header a select-all." add "(2026-09-10, studies-table spec §5) The bar also carries `Delete` / `Delete N selected` over the ticked visible rows, with an inline confirm that takes the bar's place; the library-level `Delete all studies` is gone." Replace the "Table columns" line with: `` Table columns: `STUDY`, `SUBJECT`, `VIEW`, `WORKSPACE`, `FOLDER`, `DATE`, `STATUS` (2026-09-10: SUBJECT replaced PATIENT and edits in place on a real row; every header sorts with the grid's control, newest first by default). Status pills: **Segmented** (sage), **Needs review** (accent), **Processing** (muted), **Reviewed** (sage, stronger, with ink text; 2026-09-10). ``

Redesign spec §13.1: add a row to the status table: `` | `ok` — Reviewed | Segmented and `reviewedAt` set (2026-09-10, studies-table spec §8) | `` and change "**Status** is derived, not stored as an independent fact:" to "**Status** is derived from the record (2026-09-10: the review mark `reviewedAt` is stored and read; it is cleared by every write that changes the numbers):".

Batch spec §7.1: add a bullet: "- (2026-09-10, studies-table spec §5) `Delete` sits between the Folder select and the spacer, over the same ticked-visible rule as the segment button; while its prompt is up it takes the bar's place. `data-find-key`s `delete`, `delete-prompt`, `delete-confirm`, `delete-cancel`."

Pre-op/post-op spec §9 (Editing): append "(2026-09-10, studies-table spec §7) The subject is also editable in place on the Find list's SUBJECT cell: single click, Enter commits and moves down a row, Escape discards; the same trim-and-null rule as the drawer."

- [ ] **Step 3: HANDOFF**

(a) Under `## Where things stand`, before the first `###`, add:

```
### Studies table — DONE (branch `claude/studies-table-ui-updates-953945`, off `fork/main` @ `6106463`)

2026-09-10. Spec `specs/2026-09-10-studies-table-review-design.md`; plan `plans/2026-09-10-studies-table-review.md` (Tasks 1–9,
its `## Ledger` at the end holds every ruling and count). Delete over the ticked visible rows replaces `Delete all studies`;
every Find header sorts (`findSort`, `data/find.js`); PATIENT is SUBJECT and edits in place; a stored `reviewedAt` gives the
fourth status, Reviewed, set from the Analysis panel and cleared on every numbers-changing write; demo hiding is a
development-only Settings toggle (`set-demo-studies-hidden`, refused when packaged). Unit N/N; `smoke-studies.mjs` N/N;
`smoke-persist.mjs` N/N then N/N; `smoke-parameters.mjs` 58/58; `smoke-workspace.mjs` 100/100. The human gate passed
<date>; the packaged-build checks (no DEMO STUDIES row, no preference file) wait for the next preview installer.
`fork/main` is the trunk now: the backend developer took `fork/ui-redesign-cw` and released v1.0.0–1.0.3 on top of it.
```

(fill the counts and the date from the ledger).

(b) In the reconcile summary's bullet beginning `- "Delete all studies" is kept as his feature`, append: ` **Superseded 2026-09-10** by Delete over the ticked visible rows on the Find bar and a development-only Settings toggle for the demos (studies-table spec §5, §9).`

(c) Under `## Decisions already made — do not relitigate`, after decision 66, add:

```
67. **The Find tab's filters stay as the shared Workspace and Folder selects** (2026-09-10, user). Header filtering is deferred
    to a later update for both tabs together (ROADMAP §7). *Why:* the two tabs must read the same way.
68. **Delete acts on the ticked VISIBLE real rows, never falls through to "all visible", never touches a demo.** *Why:*
    deleting something the user cannot see is worse than segmenting it; demo rows have no tick.
69. **PATIENT is SUBJECT, editable in place on the Find list by a SINGLE click; Enter commits and opens the next real row's
    editor; Escape discards.** *Why:* the user corrects a whole column without opening nine studies; double-click was
    rejected because the row opens the study on the first click.
70. **The review mark is a stored `reviewedAt`; status `'ok'`/Reviewed outranks every qc reason; the QC warnings stay
    visible; the mark is cleared ON THE WRITE by every commit that replaces measurements, geometry or calibration** (run,
    correction, reset, calibration). *Why:* a Reviewed badge over changed numbers is a fabricated status; a stale mark is
    the worse failure.
71. **Demo hiding is a Settings toggle for development builds only, with two gates** (the block is built only when the main
    process allowed demos; the IPC refuses when packaged). *Why:* the user: "I do NOT want this in the installer."
72. **No bulk Mark reviewed from the list.** *Why:* a one-click review over rows nobody opened is the wrong shape for a
    clinical tool.
73. **No `Reviewed` column in the CSV exports** (2026-09-10, planner's assumption, the user did not rule). One column when
    wanted.
```

(d) In the baseline paragraph the README mirrors (search for `smoke-persist.mjs\` 36/36 then 44/44`), update the counts to the ledger's.

- [ ] **Step 4: ROADMAP**

(a) Append a new section:

```
## 7. Header filters for the Find list and the Parameters grid

**Deferred 2026-09-10 (user ruling at the studies-table brainstorm).** The Find list's headers now sort but do not filter; the
Workspace and Folder selects stay, shared with the grid. When header filtering is built it is built for BOTH tabs at once, so
they keep reading the same way. The shape settled at the brainstorm: a click on a header opens a small popover with the two sort
buttons and, for the categorical columns only, a checklist of the values present in the library — VIEW, WORKSPACE, FOLDER
(scoped to the chosen workspaces) and STATUS. STUDY, SUBJECT and DATE get sort only: the search box already filters text, and a
checklist over two hundred unique filenames is worse than the search box. A filtered column shows a mark; the summary line
reads `Showing 5 of 9 · Clear filters`; the empty state offers the same link. The Find list's filters would then be a
session-only store key of its own (`findFilters`, multi-value per column), and the grid's bar would be rebuilt over the same
popover. Decide first whether the two tabs share one filter state or each keeps its own.
```

(b) In §5: the bullet `**Hiding the demo studies is one-way.**` — wrap it in `~~ ~~` and append ` **DONE (2026-09-10):** a DEMO STUDIES Show/Hide row in Settings, development builds only (studies-table spec §9).` The bullet `**The segment button is not disabled during a bulk delete.**` — change "a \"Delete all studies\" takes" to "a Delete of selected rows takes" (still open). The bullet `**Bulk-delete polish**` — append ` (2026-09-10) Delete all is gone; of these, the focus drop after Cancel is fixed by the new prompt (focus returns to Delete); the per-row trash buttons during a bulk delete, the `blocked` repaint and the first-failure-only toast still apply to Delete selected.` The bullet `**The Studies row is a single control for assistive technology.**` — append ` (2026-09-10) The header cells are plain divs with a sort button each (no `aria-sort`, which needs a `columnheader` role), and each real row's SUBJECT cell is a `role="button"` under the row's own — three more things for the accessibility pass.`

- [ ] **Step 5: CLAUDE.md**

(a) Before the `**Current branch (2026-09-06)` paragraph, add:

```
**Branch `claude/studies-table-ui-updates-953945` (2026-09-10)** sits on `fork/main` @ `6106463` — **`fork/main` is the trunk
now**: the backend developer took `fork/ui-redesign-cw` and released v1.0.0–1.0.3 on top of it through fork PRs #4–#8, so
`fork/ui-redesign-cw` is an ancestor of `fork/main` and the older `claude/studies-ui-updates-bb040d` tip (`4f76063`) is
superseded; upstream `origin/main` still has the OLD single-page UI and is never a base. It holds the studies-table work
(spec `docs/superpowers/specs/2026-09-10-studies-table-review-design.md`, plan
`docs/superpowers/plans/2026-09-10-studies-table-review.md`, its `## Ledger` at the end): Delete over the ticked visible rows;
sortable Find headers; SUBJECT editable in place; a stored `reviewedAt` and the fourth status, Reviewed; a development-only
demo toggle. Unit N/N; `smoke-studies.mjs` N/N; `smoke-persist.mjs` N/N then N/N; `smoke-parameters.mjs` 58/58;
`smoke-workspace.mjs` 100/100; the human gate passed <date>. Pushed to `fork`. **Next:** the packaged-build checks at the next
preview installer, then a PR to `fork/main`. The paragraphs below are historical.
```

(b) In `## Git`, change the first sentence to name this worktree and branch: `This worktree (`.claude/worktrees/studies-ui-updates-bb040d`, whose directory name predates this work) is on branch `claude/studies-table-ui-updates-953945` (2026-09-10), off `fork/main` @ `6106463`.` Keep the remotes and the workflow-trigger paragraphs.

- [ ] **Step 6: The ledger, then commit and push**

Append `## Ledger` to this plan with one entry per task: the commit, the counts, the reviewer's findings and how each was settled, the gate's outcome and the checks not run. Then:

```bash
git add docs CLAUDE.md
git commit -F tools/smoke/out/task9-msg.txt
git push fork claude/studies-table-ui-updates-953945
```

Message: `docs: records for the studies-table work — contract, specs, HANDOFF, ROADMAP, CLAUDE.md, ledger`; the trailer. The push publishes nothing (the workflows trigger on exact branch names).

---

## Self-review against the spec

| Spec | Task |
|---|---|
| §5.1 delete-all removed | 4 (`deleteAllStudies`, `bulkHost`, `confirmingAll` gone), 5 (`deleteStudyBatch` real-only) |
| §5.2 the bar's Delete, its label and titles | 4 Step 6(c) |
| §5.3 the prompt, focus on Cancel, Escape, withdrawal on any change | 4 Steps 5, 6(c), 6(d) |
| §5.4 the delete itself, search untouched, toast | 4 Step 5 |
| §6.1 `findSort` | 2 |
| §6.2 keys and rules | 2 (`data/find.js`, tests) |
| §6.3 the header row, toggle rule | 4 Step 3 |
| §6.4 sorted visible order drives both buttons | 4 Step 6(d) |
| §7.1 SUBJECT column, `subjectLabel` | 2, 4 Step 2 |
| §7.2 single click, the four keys, trim/null, demo rows not editable, affordance | 4 Steps 2, 5, 7 |
| §7.3 rebuild safety, caret, deferred commit | 4 Step 6(d), Step 2 |
| §8.1 `reviewedAt` on the record, validated | 1 |
| §8.2 the fourth status, badge, warnings stay | 1 |
| §8.3 the button, the note, the header badge, disabled reasons | 6 |
| §8.4 the four clearing sites | 3 |
| §9 the toggle, two gates, hide/show patch, IPC | 5 |
| §10 the summary's third clause | 4 Step 6(d) |
| §12 amendments | 9 |
| §13 unit, smoke, gate | 1–3, 5 (unit); 7 (smoke); 8 (gate) |

Placeholder scan: no TBD/TODO; every code step carries its code; the smoke and README counts are deliberately "record from the run", which is the repo's convention. Type consistency: `displayStatus(study, runningId)` (Tasks 1, 2, 4, 6); `sortFindRows(studies, sort, runningId)` and `toggleFindSort(sort, key)` (2, 4); `subjectLabel` (2, 4); `statusBadge` / `unsupportedViewBadge` (1, 4, 6); `deleteStudyBatch(studies, { deletePrediction })` (4, 5); `reviewBlockedReason({ study, running, pending })` (1, 6); `demoVisibilityPatch(state, shown)` (5); `withCalibration(study, calibration)` (3); `data-find-key`s (4, 7).

## Ledger

Session ended 2026-09-10 (the planning session): resume at **Task 1**; nothing started, no fix round, no open finding,
unit 479/479 on `6106463`. Rulings made in chat today are all recorded with their costs: the user's six in the spec's
§11.1–6, the planner's four assumptions in §11.7–10, and the planner's twenty in "Rulings made while planning" above.
Ruling: the branch was re-pointed at `fork/main` with `git checkout -B` (it had no commits of its own) — the screenshots
came from the v1.0.x build, whose source is `fork/main`, not upstream `main` — cost if wrong: none, nothing was lost.

Filled during execution: one entry per task — the commit, the counts, the reviewer's findings and how each was settled; the gate's outcome and the checks not run; every ruling made on the way.

### Pre-flight scan (2026-09-10)

Every anchor the plan quotes, checked against the working tree at `ae6af2f`; every pair of tasks sharing a file or
interface, traced by hand — all consistent. Three rulings: the spec §13 Settings Hide/Show smoke check is NOT added to
Task 7 (allocated to Task 5 Step 7 by hand and Task 8 check 5 instead — cost if wrong: one unautomated regression
path, noted for ROADMAP); Task 5's RED expectation ("test 2 passes") is a description slip, not a plan defect — the
implementer reports the RED output it actually sees; the orchestrator installs `onnx==1.21.0` and `onnxruntime==1.24.4`
into the venv and runs `tools/export_onnx.py` in the background during Tasks 1–3, without downgrading torch/torchvision/
timm unless export fails on the newer versions — it did not (PIP_OK, EXPORT_OK on torch 2.13.0).

### Task 1 — `reviewedAt` on the record and the fourth status, Reviewed

Implementer Sonnet, reviewer Sonnet. Commits `ae6af2f..1b9093a`. Unit 486/486; byte-check clean. Reviewer's one
finding (the runtime look of `.badge-ok` in both themes) resolved by the controller as Task 8's human gate, not a gap.
`1b9093a` is BASE for Task 2. Environment note: `onnx`/`onnxruntime` installed and `tools/export_onnx.py` run in the
background during this task (see the pre-flight scan); the backend was ready for a source launch by the end of it.

### Task 2 — pure sort for the Find list, `subjectLabel`, the `findSort` store key

Implementer Sonnet, DONE at `3102a07`; unit 496/496 (the Write tool turned one `—` into a glyph in `find.js`, repaired
with a Python script; byte-check clean after). Reviewer Sonnet: Approved; its one ⚠️ (that Task 4 will call the sort
correctly) was out of scope — Task 4 was unbuilt — and resolved by the controller. Three deferred minors: `store.js`'s
initial `findSort` literal duplicates `find.js`'s `DEFAULT_FIND_SORT` rather than importing it (plan-specified verbatim;
drift risk); `subjectLabel` returns an untrimmed `subjectId` for display while `find.js`'s `text()` trims for sorting;
`text()`'s non-string branch has no dedicated test (handled correctly; coverage implicit). Commits `1b9093a..3102a07`,
review clean. `3102a07` is BASE for Task 3.

### Task 3 — every numbers-changing write clears the review mark

Implementer Sonnet, DONE at `122a440`; unit 499/499; calibration suites green; byte-check clean. Reviewer Sonnet:
Approved; a cross-cutting grep found no fifth write of measurements/geometry/calibration beyond the four sites
(`segmentStudy`'s run commit, `measure-queue.js`'s correction commit, the viewer's RESET TO PREDICTION,
`renderer/calibration.js`'s `withCalibration`). One deferred minor: `canonical()` round-trips through `JSON.stringify`,
so `NaN` collapses to `null` and nested `undefined` is dropped — unreachable for calibration records today (carried to
ROADMAP by Task 9). Commits `3102a07..122a440`, review clean. `122a440` is BASE for Task 4.

### Task 4 — Find tab: Delete over the ticked rows, sortable headers, the SUBJECT editor, TO REVIEW

Implementer Opus, DONE_WITH_CONCERNS at `830046d`; unit 499/499; `smoke-studies.mjs` 91/103 on a fresh scratch launch
(expected — the plan's regex fix was Task 7's, not this task's); byte-check exactly the four predicted lines. Two
concerns raised and ruled on: (1) nine smoke failures rather than the plan's predicted five — no scope change, Task 7
absorbs the regex/derived-n fixes; (2) three PRE-EXISTING failures at `122a440` (`readProgress()` compares against an
exact string that upstream `63b3484` nested a live-stage span inside) — ruled as the product's deliberate feature; Task
7 fixes the suite's `readProgress()`, never the checks themselves.

Reviewer Opus: Needs fixes. Important 1: Tab out of a SUBJECT editor dropped focus to `<body>` (the trash button carried
no `data-find-key`). Important 2 (plan-mandated CSS): the editing wrapper's `overflow:hidden` clipped the outline/
border/focus ring on three sides. Minor 1 (spec-mandated, promoted to Important by ruling): switching to the Parameters
tab did not withdraw the Delete prompt (spec 5.3). Minors 2–6 deferred: the disabled Delete button's `title` never
shown by Chromium (ROADMAP's existing disabled-title item); the first click elsewhere while an editor is open is
swallowed (rebuild lands between mousedown/mouseup); `commitSubject`'s local `nextId` shadows the persistence.js import
(renamed to `below` in the fix wave); `api.hideDemoStudies` unreachable until Task 5; every keystroke rebuilds the
table (caret restored; an IME composition would drop).

Fix round 1/5, Opus, FIX_BASE `830046d` → `6c4abef`: the trash button gained `data-find-key="row-delete-<id>"` plus an
`onBlur` capture of `event.relatedTarget`'s key (new surface beyond the ruling, re-reviewed as such); the editing cell
gained class `studies-subject-editing` with `overflow: visible`; tab-switch now withdraws the prompt. CDP checks 1–4
passed; byte-check empty. Re-reviewer Opus: no new breakage, the `relatedTarget` path traced clean (null, search box,
outside nodes, idempotence after Enter, last row). Carried to Task 7/9: the editing wrapper's class list is
`studies-cell-subject studies-subject-editing`; Enter walking down more than one real row was not exercised (one real
study in the profile) — smoke section 16 covers it. One residual (deferred): a Tab-commit that changes the subject
while a search matched only the old value removes the row, dropping focus to `<body>` in that one corner.

Commits `122a440..6c4abef`, review clean after fix round 1. `6c4abef` is BASE for Task 5.

### Task 5 — demo studies toggle in Settings (development builds only); `deleteStudyBatch` real-only

Implementer Sonnet, DONE at `1d3e09c`; unit 504/504; a grep confirmed only the `hideDemoStudies` KEY remains in
`main.js`'s two handlers; CDP checks a–f 24/24 on a scratch profile; a relaunch on the kept profile held the
preference (one transient, self-resolved `ECONNREFUSED`, not attributed to the diff). The packaged-build half is not
checkable from source. Reviewer Sonnet: Approved; five named risks (IPC rename grep, `merge`/`withIds`, invoke/bridge
naming, the boot rule, ASCII diff) all clean. Two deferred minors: the sidebar's `demo-settings` class has no CSS rule
(plan-specified, unused hook — carried to ROADMAP by Task 9); `setDemoStudiesShown` ignores a resolved `false` from
`setDemoStudiesHidden` (unreachable — the same gate guards the call). Commits `6c4abef..1d3e09c`, review clean. `1d3e09c`
is BASE for Task 6.

### Task 6 — Mark reviewed on the Analysis screen, the list's status badge in its header

Implementer Sonnet, DONE at `c227d7d`; unit 504/504; CDP checks 1–6 (35 assertions) pass on a scratch profile with a
demo re-labelled real; byte-check clean. Reviewer Sonnet: Approved, no findings; risks traced (open non-null at the
insertion point; `render()` resets `lastBadgeKey` on every study switch; `mount()` clears first; `.param-export-note`
linked via `studies.css`). Commits `1d3e09c..c227d7d`, review clean. `c227d7d` is BASE for Task 7.

### Task 7 — smoke coverage: sortable headers, the SUBJECT editor, Delete selected, the persisted mark and subject

Two rulings ahead of implementation: the plan's new summary-regex line, as literally specified, carries a middle-dot
glyph Global Constraints forbid on a new line — written as the `\u00b7` escape instead, both separators the same
character (cost if wrong: none, both forms match); `readProgress()` in `smoke-studies.mjs` is fixed to read the
progress text without the nested `.study-processing-detail` upstream `63b3484` introduced (the three affected checks
stay; the README notes it — cost if wrong: three checks that describe the bar less exactly).

Implementer Sonnet, DONE_WITH_CONCERNS at an intermediate commit (Gate: pending); unit 504/504; `smoke-studies`
131/131; `smoke-persist` 40/40 then 47/47; `smoke-parameters` 58/58; `smoke-workspace` 96/100. Concern: `smoke-
workspace.mjs`, not in the plan's Task 7 file list, carried the same stale two-clause summary regex — four checks
failed on the new three-clause summary; not a product defect. Ruling: amended into the same gated commit (the regex
fix, a fresh-launch re-run to 100/100, and the README baseline) rather than opened as a second commit, so the gated
task stayed one commit — cost if wrong: one amend. An addendum implementer (Sonnet) made that amendment; four files in
the commit.

Reviewer Sonnet: Needs fixes. Important 1 (plan-mandated): a smoke check NAME gained a second literal middle dot (the
brief's text verbatim) — a diagnostic string, no behaviour; ruled superseded by Global Constraints and written as the
`\u00b7` escape. Important 2: the README's baseline paragraph lacked the `readProgress()`/nested-detail clause the
earlier ruling required — added. Its ⚠️ (commit body not visible in the diff file) resolved by the controller via
`git log -1 --format=%B`. Fix round 1/5, Sonnet, amended into the same commit: both addressed; `node --check` clean;
unit 504/504; Gate: pending kept. Re-reviewer Sonnet: no new breakage.

Task 7 complete: commits `c227d7d..ae6f345` (one gated commit — this is the FINAL hash; the commit carried the hash
`11ef3ab` at the time of this review and until Task 8's gate passed, when its message was amended in place to record
`Gate: passed 2026-09-10 (user)`, non-interactively, without changing its tree; see "Task 8 — the gate" below), Gate:
pending at the time, review clean after fix round 1.

### Final whole-branch code review (before the human gate)

Ruling ahead of the review: the final whole-branch CODE review (Opus, the most capable model the user allows) runs
BEFORE Task 8's human gate, over the full range, so the user gates the code the branch will ship and no fix wave
lands after the gate; any fix-wave commits above the reviewed tip are folded before the gate is posted — cost if
wrong: one extra review dispatch. Task 9's own docs get their own task review; the final review's residuals are
re-checked over the docs commit at the end.

Reviewer Opus, over `ae6af2f..ae6f345` (named `11ef3ab` at review time, see the note above): Ready to merge WITH
FIXES. Critical: none (the clinical rule traced watertight; five record-write hits, all clear the mark; both demo
gates real; byte discipline clean over the range). Important 1: spec 7.3's rebuild-mid-edit safety rests on Chromium
not firing `blur` on removal and had no automated check. Minors 2–13 triaged below. Every ledger-deferred item from
Tasks 1–7 may stay deferred, except the `nextId` rename (fixed now) and Task 3's `canonical()` NaN note (sent to
ROADMAP).

Ruling: ONE fix wave (Opus; the Find tab is Task 4's file) in two commits above the reviewed tip: (a) test: smoke
section 16 gains the rebuild-mid-edit assertion (Important 1) and a Reviewed row on the list (Minor 11); (b) chore:
rename `nextId` → `below` in `commitSubject` (Minor 4), module-scope `editing` → `editingSubject` (Minor 5), demo
records carry `reviewedAt: null` (Minor 8), stale PATIENT wording in the CSS comment and the search placeholder
(Minor 9), a null guard on `deleteSelectedStudies` (Minor 12), FRESH_VIEW parity pinned by one test (Minor 6).
Deferred to Task 9's records: the 5.3 id-list withdrawal wording (Minor 2), Escape only inside the prompt (Minor 3),
`aria-sort`/role nesting (Minor 13), `merge()`'s dead `hideDemos` option (Minor 7), the `demo-settings` class (Minor
10), the Settings smoke check and the `canonical()` NaN note — all now in ROADMAP §5/§6. Cost if wrong: one review
round.

Ruling: the gate's commit message is amended non-interactively once the gate passes (`git checkout --detach`, `commit
--amend -F msg`, a plain `git rebase --onto`, no `-i`) — cost if wrong: a rebase to redo.

The first dispatch of this fix wave was interrupted by the user before it started; not re-dispatched verbatim — the
controller reported state and stopped for direction. Re-dispatched to a fresh Opus implementer, told to keep the
partial edits already on disk (the B1/B2/B5/B6 renames and guards).

### Final fix wave and the spec 7.3 fix

Implementer Opus, DONE_WITH_CONCERNS — commits `86d97ed` (chore: B1–B6 cleanup; the search placeholder reads "...
folder, diagnosis…" because `matchesQuery` searches `dx` and clinical values, not "patient") and `c1e61a3` (test: A1
+ A2). Unit 505/505; `smoke-studies` 134/136 on a fresh launch; byte-check clean (two allowed glyph pairs).

A1 FAILED and exposed a REAL product defect (spec 7.3): after a rebuild mid-edit, `update()` re-creates the editor
with its draft, focus and caret restored, but the destroyed input's deferred blur commit
(`onBlur → queueMicrotask → commitSubject(id,'blur')`) still fires one microtask later, writes the half-typed draft,
and closes the editor. Proven over CDP (sync-after-rebuild editor:true; after microtasks editor:false, subject
overwritten, focus on `<body>`). The final reviewer's Important 1 was right: Chromium DOES fire `blur` (or the
deferred commit still runs) on removal of the focused input.

Ruling: the defect is load-bearing (the headline feature loses typing when a batch finishes mid-word) and is fixed
NOW as a Task 4 fix commit, reviewed, before the gate — the skill's no-second-fix-wave rule is a cost rule, and this
is one guard with a smoke check already written and red. Fix shape: the deferred blur commit skips the write when
`!input.isConnected && editingSubject?.id === study.id` (a removal-blur, as opposed to a user-driven blur where the
node is still connected) — cost if wrong: one commit to revert.

Implementer Opus, DONE at `295c9fd`: capture-phase probe confirmed the premise (blur: connected true; pre-commit
microtask: connected false). CDP after: editor kept, draft value intact, caret restored, subject unchanged on the
record. Unit 505/505; `smoke-studies` 136/136 (`tools/smoke/out/fix73-studies.txt`). README baseline 136/136. One
deferred residual (HANDOFF trap): a rebuild that also filters the edited row out keeps the draft instead of
committing (unreachable today — a search keystroke has already blurred the editor); the guard rests on Chromium's
observed blur-before-detach ordering, and the smoke check is the tripwire.

Scoped re-review, Opus, over `ae6f345..295c9fd` (three commits, named `11ef3ab..9a36eb9` at review time): all findings
ADDRESSED (Important 1 both halves; Minors 4, 5, 6, 8, 9, 11, 12), no new Critical/Important breakage; covering runs
confirmed against `tools/smoke/out/fix73-studies.txt` (136/136, 0 FAIL). One further deferred minor: the A1 smoke
check's caret assertion cannot fail alone (`el()`'s value setter parks the cursor at the end, so the check would need
to type, ArrowLeft, then assert 1/1 to pin the restore itself — sent to ROADMAP by Task 9).

### Task 8 — the human gate

Posted 2026-09-10 on tip `9a36eb9` (Task 7's gated commit still carried `Gate: pending`, with three fix-wave commits
above it). Unit 505/505; `smoke-studies` 136/136; `smoke-persist` 40/40 then 47/47; `smoke-parameters` 58/58;
`smoke-workspace` 100/100. GATE PASSED 2026-09-10 (user): "OK IT PASSED all 7." Packaged-build checks (no DEMO
STUDIES row; no `library-preferences.json`) NOT RUN — wait for the next installer. The user also reported `fork/main`
had moved twice since the branch started (now v1.0.5) and asked for a merge plus an installer update to v1.0.6.

Amend: Task 7 became `ae6f345` (message now `Gate: passed 2026-09-10 (user)`); the fix-wave commits replayed as
`86d97ed` (chore), `c1e61a3` (test), `295c9fd` (fix); the tree is identical to the pre-amend `9a36eb9`. The old hashes
`11ef3ab`/`96b2060`/`ea94f5d`/`9a36eb9` are superseded by `ae6f345`/`86d97ed`/`c1e61a3`/`295c9fd` respectively — every
reference to the old hashes above in this ledger names the commit that now carries the new one.

### Merge — `fork/main` v1.0.5

`fork/main` had advanced to `71d483f` = v1.0.5 (v1.0.4 PACS toolbar removal `815f4cf`; v1.0.5 manual calibration
persistence `467ddb8`). `git merge-tree --write-tree fork/main 9a36eb9` (pre-amend tip; tree identical to `295c9fd`)
exited 0: no textual conflicts. Overlapping files (`calibration.js`, `store.js`, `sidebar.js`, `main.js`, `preload.js`,
`api.js`, `CLAUDE.md`, the contract) changed on different lines. `windows.yml` already carried the repository guard
and published only on a `main` push — HANDOFF's stale "windows.yml still has no guard" line, superseded by Task 9.

Ruling: `fork/main` is MERGED into the branch (a merge commit, the 2026-09-08 reconcile's precedent; keeps the
reviewed SHAs), then post-merge verification (unit; a grep for any new record write of calibration in upstream's
v1.0.5 renderer code; smoke suites), then Task 9's records on the merged text, then a release commit for 1.0.6
(`package.json`, `version.js`, `CHANGELOG.md`, `docs/releases/1.0.6.md`), then a push to `fork` and a PR to `fork/main`
whose merge the user clicks — cost if wrong: a merge to redo.

Merge commit `ceacc7e` "Merge fork/main (v1.0.5) into the studies-table branch". Merged tree: unit 513/513; upstream's
v1.0.5 renderer code adds NO record write of calibration (`calibration-viewer.js:52` is an event payload consumed by
`rememberCalibration`); every calibration write still goes through `withCalibration`; the run commit still clears the
review mark. `package.json`/`version.js` still read 1.0.5 (the bump to 1.0.6 is the release commit, not yet made).
Dispatched in parallel after the merge: a Sonnet smoke VERIFIER over the merged tree (reads and runs only, no edits,
no git) and Task 9's records implementer (Sonnet, docs only, no app launch, no smoke suite — this task).

### Task 9 — records

This pass: the contract's file structure, Study record, store state, `data/status.js` signature and rules, the
2026-09-07 delete-all amendment's supersession, and a new 2026-09-10 dated section (plus its spec-7.3 fix note); the
redesign spec's §9.4 and §13.1; the batch spec's §7.1; the pre-op/post-op spec's §9; HANDOFF's "Where things stand"
(the studies-table entry moved from PLANNED to DONE, the old paragraph marked superseded rather than deleted), the
reconcile summary's "Delete all studies" bullet, decisions 67–74, item 6's stale `windows.yml` line, a Release
prerequisites bullet, and a Known traps bullet for the removal-blur guard; ROADMAP's new §7 (deferred header filters)
and eleven §5 edits/additions; CLAUDE.md's top studies-table paragraph (rewritten from PLANNED to DONE with the merged
counts) and the `## Git` paragraph (names the v1.0.5 merge); and this Ledger. Counts used throughout: on the branch
before the v1.0.5 merge, unit 505/505, `smoke-studies.mjs` 136/136, `smoke-persist.mjs` 40/40 then 47/47,
`smoke-parameters.mjs` 58/58, `smoke-workspace.mjs` 100/100, `smoke-seeding.mjs` 36/36 (not re-run); the merged tree
reads unit 513/513, with its own smoke counts going into `docs/releases/1.0.6.md` in the next (release) commit. One
item from the brief could not be applied as literally worded — "the baseline paragraph the README mirrors" (searched
for the literal string `smoke-persist.mjs\` 36/36 then 44/44\``): the only two matches in HANDOFF.md are historical
verification records for the 2026-09-08 reconcile and batch-segmentation branches (each a true record of what was
verified on THAT branch at THAT time); rewriting either would misstate history, so both were left untouched and the
counts were written only into the new studies-table paragraphs this task adds.

### 2026-09-10 — merged-tree verification, the load-order fix, and the 1.0.6 release path

Merge `ceacc7e` ("Merge fork/main (v1.0.5) into the studies-table branch", above) verified by a Sonnet smoke run over
the merged tree: unit 513/513, `smoke-studies.mjs` 136/136, `smoke-persist.mjs` 40/40 then 47/47,
`smoke-parameters.mjs` 58/58. Two suites read below baseline and were traced to source rather than "fixed" blind:

- `smoke-workspace.mjs` 99/100 — `the first three rows are the new studies, badged Processing` read
  `SP-1001, SP-1002, SP-1000` instead of scan order. `renderer/screens/studies.js` now sorts the visible table
  through `sortFindRows(...)` with `DEFAULT_FIND_SORT = { key: 'date', dir: 'desc' }` (this branch's own
  sortable-Find-headers feature); `renderer/screens/workspace.js`'s `loadWorkspaceStudies` built each new record
  through `newStudy()`, which stamps its own `addedAt: new Date().toISOString()` per call, so three records
  created in one tight synchronous loop could tie or land out of scan order under millisecond timing, and the
  date-desc sort surfaced that as a non-deterministic row order. Fixed in `2f123a1`: one `addedAt` computed before
  the load's loop, applied to every record of that load (override after the `newStudy()` spread), so the stable
  sort keeps scan order on the tie. `renderer/data/batch.js`'s `identity` map (createBatchDriver, ~line 121-142)
  keys a record's identity to its `addedAt` precisely so a reused id (after a delete) is never mistaken for the
  original record — records of one load keep distinct ids, so a shared `addedAt` across siblings does not weaken
  that check; it still distinguishes a genuinely reused id from the record that held it. Re-run on a fresh launch
  after the fix: 100/100.
- `smoke-seeding.mjs` 34/36 — both FAILs were the same stale suite constant: `EXPORT_HEADER`
  (`tools/smoke/smoke-seeding.mjs:64`) predated the fifteen disc-height columns upstream's CSV export
  (`renderer/data/csv.js`, `DISC_LEVEL_PAIRS` x `DISC_POSITIONS`) inserts between `LL L5-S1` and `Age`; the
  following row check's empty-cell count was built against the same stale column count. Not a product defect on
  either side. Fixed in `3be0c17`: `EXPORT_HEADER` rewritten to the real header string, dated with a one-line
  comment; the row check's empty-cell count now derives from `EXPORT_HEADER.split(',').length` instead of a
  second hardcoded string. Re-run on a fresh launch after the fix: 36/36.

Not run: `smoke-manual-calibration.mjs` and `smoke-calibration.mjs` (both need real radiograph images not checked
into the repo); the viewer/gate/parity/chip/chord suites (untouched by either side of the merge — the studies-table
branch never touches viewer/interaction code, and `fork/main` v1.0.5's own changes were calibration persistence and
PACS toolbar removal, not the viewer).

Release path: 1.0.6 by the user's decision (recorded above, "Merge — `fork/main` v1.0.5"); the backend developer's
`codex/editable-femoral-confidence` branch also claims 1.0.6 independently, so it renumbers to 1.0.7 once the two are
reconciled. Release commits `7ccd2dc` (chore: release 1.0.6) and `3b7f6cf` (chore: README to 1.0.6; changelog bullet
style) precede the two fix commits above on this branch. Packaged-build checks (no DEMO STUDIES row in a
built installer; no stray `library-preferences.json`) are NOT RUN here — source-level smoke only — and remain for
the next 1.0.6 installer.
