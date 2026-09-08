# Paired Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the paired (wide) CSV export to the Parameters tab: one row per subject, one visit per later timepoint present, deltas against Pre-op, a report of everything left out, over the same rows the long export writes.

**Architecture:** One new pure module, `renderer/data/pairing.js`, groups the export's rows by subject, judges each subject (unpaired first, then ambiguous), and returns the visits, the subjects that get a row and the §11.3 counts; it also builds the toast. `renderer/data/csv.js` gains `toPairedCsv(pairing)`, which only writes text in layout B (measurement-major), and a `delta1` helper computed over the one-decimal values written. `renderer/screens/parameters.js` adds the second button and its note to the existing export group and reads the `with` label from the filters it already has, so no store key changes. `renderer/components/toast.js` gets a pure duration function so a five-clause report can be read.

**Tech Stack:** Vanilla ES modules, no bundler, no runtime dependencies. `node --test` for pure logic. The CDP smoke harness in `tools/smoke/` for DOM behaviour. Electron 44 / Chromium 152.

**Spec:** `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` — this plan is **task 4 of its §15 sequencing**: §10.4 (the button, its labels, file names and disabled reasons), §11.2 (input, rows, columns, where it lives) and §11.3 (the toast and its duration), as laid out at the 2026-09-08 brainstorm; §14's `data/pairing.js`, `data/csv.js` and `components/toast.js` bullets and its smoke paragraph; §18's task-4 bullet. Read the spec's §6 decisions 8 and 9, §7.1–§7.2, §10.3–§10.4, §11 and §14 before starting. HANDOFF decisions 45 and 47 are the ones this builds on. The binding architecture contract `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` wins over this plan; Task 6 amends it.

## Global Constraints

Copied from `CLAUDE.md` and the spec. Every task's requirements include these.

- **Never display or write a fabricated measurement.** Absent values render `—` (U+2014) on screen and are EMPTY cells in a CSV, never `0`, never `N/A`. A delta with either side absent is an empty cell. No delta between films is written without both films' views beside it.
- **Never label a value with a name it isn't.** Column headers use the stored timepoint label (`Pre-op`, `Post-op`, `6 wk`), never a `pre`/`post` shorthand; `Delta <M> <label>` is the later value minus the `Pre-op` value.
- **Nothing drops silently.** Every subject or film the paired export leaves out is counted or named in the toast (spec §11.3).
- **The key is "Subject", never "Patient" and never an MRN.** The CSV header says `Subject`.
- **Never mutate store state in place.** Every `setState` patch passes a NEW object or array; the store's gates compare by reference. `pairStudies` never mutates its input.
- **`setState` must not be called from inside a subscriber.** The Parameters panel's `update()` runs inside a store notification; only DOM event handlers call `setState`.
- **`el()` assigns to the property when the key exists on the node.** Pass real booleans (`disabled: false`), never `'false'`. Never pass `style` or `list` as an `el()` prop.
- **The grid's `update()` key array must list every store key it reads.** This plan adds no store key, so the array is unchanged; do not add one.
- **No bundler, no framework, no runtime dependencies.** `dependencies` stays empty; `devDependencies` stays exactly `electron` and `electron-builder`. **Do not loosen the CSP.** No allowlist change: both electron-builder allowlists already cover `renderer/**/*` and `styles/**/*`.
- **Unit tests run as `node --test test/*.test.js`** (the glob form; the directory form fails on Node 24). Baseline before this plan: 379/379.
- **Pure-logic modules get real `node --test` coverage. DOM code gets explicit manual verification and smoke checks.** Never write a fake test.
- **Smoke selectors key on `data-param-key` and `data-study-id`, never on a visible label.** A smoke suite that prints nothing has thrown — re-run it bare and read the stack. Run every suite in the FOREGROUND and capture its output to a file under `tools/smoke/out/` (`> tools/smoke/out/<name>.txt 2>&1`); never background one and wait for it. Never re-run a suite on an instance where one was killed mid-run; relaunch.
- **Conventional commit prefixes** (`feat:`, `fix:`, `test:`, `docs:`, `chore:`); commit after every task; every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Branch:** `claude/preop-postop-paired-export` in the worktree `C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628` (created 2026-09-08 off the tip of `claude/studies-ui-updates-bb040d`, `adf3c19`). Push only to `fork`, never `origin`; never merge to `main`; never rename onto `ui-redesign-cw`; push only after the last amend of the gated commit.
- **Running the app from source** (three lines, from PowerShell; the shell starts in `C:\Users\codyj`):

  ```
  Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628"
  $env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"
  npm.cmd run dev
  ```

  Smoke harness on a scratch profile: `node tools/smoke/launch.mjs` (refuses with exit 3 if port 9222 is held), the suite, then `node tools/smoke/cdp.mjs --quit`. `smoke-parameters.mjs` runs FIRST on a fresh launch. If `node_modules\electron\dist` is missing here, `npm install` will NOT fetch it: copy `node_modules\electron\dist` and `node_modules\electron\path.txt` from `..\studies-ui-updates-bb040d\node_modules\electron\`.

## File structure

| File | Responsibility | Status |
|---|---|---|
| `renderer/data/pairing.js` | pure: `pairStudies(rows, {post})` — grouping, visits, the subjects written, the §11.3 counts; `postFromFilters(filters)`; `pairedExportMessage(pairing, savedTo)` | create |
| `renderer/data/csv.js` | `delta1(pre, post)`; `toPairedCsv(pairing)` writes the layout-B file | modify |
| `renderer/data/parameters.js` | `exportFileName(workspace, kind = 'parameters')` | modify |
| `renderer/components/toast.js` | `toastDuration(text)`; `showToast` uses it | modify |
| `renderer/screens/parameters.js` | the `Export paired CSV` button, its label with a selection, the shared note, `exportPaired` | modify |
| `test/pairing.test.js`, `test/toast.test.js` | the two pure suites | create |
| `test/csv.test.js`, `test/parameters.test.js` | existing suites extended | modify |
| `tools/smoke/smoke-parameters.mjs` | section 13: the button's states and the file and toast text through the page's modules | modify |
| `tools/smoke/README.md`, `README.md`, the contract, `docs/superpowers/HANDOFF.md`, the spec's §15 | records | modify |

Boundaries: `renderer/data/*` never imports from `renderer/screens/` or `renderer/components/`. `pairing.js` imports `subjectKey` and `ANY_POST` from `parameters.js` and `PRE_OP`, `compareTimepoints` from `timepoints.js`; `csv.js` imports `PRE_OP` from `timepoints.js`; `parameters.js` does not import `pairing.js`. No cycle. `screens/parameters.js` imports both `pairing.js` and `csv.js`.

## Rulings made while planning (2026-09-08)

Settled with the user at the brainstorm (the first three are in the spec and HANDOFF decisions 48–50 after Task 6), or made by the planner against the code and recorded here so the executor does not re-decide them. Each carries what it costs if wrong.

- **Ruling (user): layout B, measurement-major.** Identity columns per visit first, then per measurement `<M> Pre-op`, `<M> <label>`, `Delta <M> <label>`, then `<F> <label>` per clinical key. — Cost if wrong: a column reorder inside `toPairedCsv`.
- **Ruling (user): a subject with two films on any label the file writes is ambiguous and gets no row**; unpaired is judged first. — Cost if wrong: a retake at one visit hides the subject until relabelled.
- **Ruling (user): the toast's duration scales with its length**, for every toast. — Cost if wrong: long toasts linger.
- **Ruling: a written subject's `films` is a `Map` keyed by label, not a plain object.** A user-typed label can be `constructor` or `toString`, and a plain object would answer `in` for those before anything is written (the same guard `parse` in `csv.js` already carries). — Cost if wrong: none; `.get(label)` everywhere.
- **Ruling: an ambiguous entry carries `{subject, label, count}` and the clause writes the count as a word** (`two 6 wk films`, `three Pre-op films`), so a triple retake is not reported as "two". Entries group by `<count> <label> films` in first-appearance order; at most five subjects are named across the clause, then `…`. — Cost if wrong: one formatting function.
- **Ruling: the paired button's own note shows only when the long button is enabled.** When both are disabled for the same reason (`Nothing to export`, `Demo studies are not exported`) one note after both buttons stands for both; the paired button's `title` carries its reason in every disabled case, as the long one's does. — Cost if wrong: one span.
- **Ruling: `pairStudies` runs on every rebuild of the filter bar** (it is what disables the button), and again on click with the same result. — Cost if wrong: O(rows) per rebuild, on a grid that already sorts every row per rebuild.
- **Ruling: `postFromFilters` lives in `pairing.js`, not `parameters.js`**, so `parameters.js` changes only in `exportFileName`. — Cost if wrong: one import line.
- **Ruling: `exportFileName(workspace, kind = 'parameters')`**; every existing call and test is unchanged. — Cost if wrong: none.
- **Ruling: `delta1` lives in `csv.js` beside `round1`** and is exported for plan 07; `data/measurements.js`'s `deltaRow` (the viewer's text form, from raw values) is untouched here, and plan 07 decides whether it adopts `delta1`. — Cost if wrong: the panel and the file can differ by 0.1 in a rare case until plan 07 aligns them.
- **Ruling: the visits with columns are the candidates carried by at least one WRITTEN subject** (spec §11.2's empty-group rule), computed after the subjects are judged; the ambiguity check uses the candidates, not the emitted visits. — Cost if wrong: an all-empty column group.
- **Ruling: `otherVisits` counts only the films of written subjects** (spec §11.3): an unpaired subject's films are covered by its own clause. — Cost if wrong: a double count.
- **Ruling: no CSS change.** `.param-export-group` is a flex row with a 12 px gap and `.param-bar` wraps; two buttons and a note fit. If the human gate shows the note wrapping alone, the fix is `flex-wrap: nowrap` on the group, nothing else. — Cost if wrong: one CSS line.
- **Ruling: the smoke suite's new section is numbered 13 and sits after section 12**, before section 10 (the delete consumes SP-9101); its expected row is built from an array so the empty cells are counted, not eyeballed. — Cost if wrong: none.
- **Ruling: subagent assignment.** Sonnet for Tasks 1, 2, 3, 5, 6 (complete code in the brief); Opus for Task 4 (DOM, with a human gate); never Fable. Every dispatch that runs a smoke suite says "foreground, capture to a file". Task 4 commits before its gate with a pending line and is amended after; the ledger stays uncommitted during the gate.

---

### Task 1: `renderer/data/pairing.js` — grouping, judging, the report and the toast

**Files:**
- Create: `renderer/data/pairing.js`
- Create: `test/pairing.test.js`

**Interfaces:**
- Consumes: `subjectKey(study)` (→ trimmed lower-cased subject or null) and `ANY_POST` (`'__any__'`) from `renderer/data/parameters.js`; `PRE_OP` (`'Pre-op'`) and `compareTimepoints(a, b)` from `renderer/data/timepoints.js`.
- Produces:
  - `pairStudies(rows, { post = ANY_POST } = {})` → `Pairing`:
    ```js
    /**
     * @typedef {Object} Pairing
     * @property {string[]} visits        later labels that get columns, §7.2 order (empty when nothing is written)
     * @property {string|null} post       the single label, or null under All paired
     * @property {Array<{key: string, subject: string, films: Map<string, Study>}>} subjects
     *                                    one per row written, first-appearance order; films keyed by label, PRE_OP first
     * @property {string[]} unpaired      display subjects, first-appearance order
     * @property {Array<{subject: string, label: string, count: number}>} ambiguous
     * @property {number} noSubject       real rows with no subject
     * @property {number} noTimepoint     real rows with a subject and no timepoint
     * @property {{count: number, labels: string[]}} otherVisits   under a single label only: written subjects' films on other labels
     */
    ```
  - `postFromFilters(filters)` → `string`: `filters.pairedWith` while `filters.pairedOnly === true` and the label is neither `''` nor `ANY_POST`; else `ANY_POST`.
  - `pairedExportMessage(pairing, savedTo)` → `string`: the §11.3 toast.

- [ ] **Step 1: Write the failing tests**

Create `test/pairing.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairStudies, postFromFilters, pairedExportMessage } from '../renderer/data/pairing.js';
import { ANY_POST } from '../renderer/data/parameters.js';

function film(id, subjectId, timepoint, overrides = {}) {
  return {
    id, source: 'real', filePath: `C:\\films\\${id}.png`, fileName: `${id}.png`, name: null,
    workspaceFolder: 'C:\\films', addedAt: '2026-09-01T00:00:00.000Z', view: 'Standing lateral', thumbnail: null,
    subjectId, timepoint, filmDate: null,
    measurements: null, geometry: null, qc: null, clinical: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// pairStudies
// ---------------------------------------------------------------------------

test('pairStudies under All paired gives one row per subject with a Pre-op film and a later film, visits in §7.2 order, subjects in first-appearance order', () => {
  const rows = [
    film('SP-1', 'S002', 'Pre-op'), film('SP-2', 'S001', 'Pre-op'), film('SP-3', 'S001', '1 yr'),
    film('SP-4', 'S001', 'Post-op'), film('SP-5', 'S002', '1 yr'),
  ];
  const pairing = pairStudies(rows, { post: ANY_POST });
  assert.deepEqual(pairing.visits, ['Post-op', '1 yr']);
  assert.equal(pairing.post, null);
  assert.deepEqual(pairing.subjects.map((s) => s.subject), ['S002', 'S001']);
  const s001 = pairing.subjects[1];
  assert.equal(s001.key, 's001');
  assert.ok(s001.films instanceof Map);
  assert.deepEqual([...s001.films.keys()], ['Pre-op', 'Post-op', '1 yr']);
  assert.equal(s001.films.get('Post-op').id, 'SP-4');
  const s002 = pairing.subjects[0];
  assert.deepEqual([...s002.films.keys()], ['Pre-op', '1 yr']);
  assert.equal(s002.films.has('Post-op'), false);
  assert.deepEqual(pairing.unpaired, []);
  assert.deepEqual(pairing.ambiguous, []);
  assert.equal(pairing.noSubject, 0);
  assert.equal(pairing.noTimepoint, 0);
  assert.deepEqual(pairing.otherVisits, { count: 0, labels: [] });
});

test('pairStudies defaults to All paired when no options are given', () => {
  const rows = [film('SP-1', 'S001', 'Pre-op'), film('SP-2', 'S001', '6 wk')];
  const pairing = pairStudies(rows);
  assert.equal(pairing.post, null);
  assert.deepEqual(pairing.visits, ['6 wk']);
  assert.deepEqual(pairing.subjects.map((s) => s.subject), ['S001']);
});

test('pairStudies reports a subject unpaired when it has no Pre-op film, or no film on any visit the file writes, and emits no column group for a label only unpaired subjects carry', () => {
  const rows = [
    film('SP-1', 'S001', 'Pre-op'),                                   // Pre-op only
    film('SP-2', 'S002', 'Post-op'),                                  // no Pre-op
    film('SP-3', 'S003', 'Pre-op'), film('SP-4', 'S003', null),       // Pre-op and an unlabelled film
    film('SP-5', 'S004', 'Pre-op'), film('SP-6', 'S004', '6 wk'),     // paired
  ];
  const pairing = pairStudies(rows);
  assert.deepEqual(pairing.subjects.map((s) => s.subject), ['S004']);
  assert.deepEqual(pairing.unpaired, ['S001', 'S002', 'S003']);
  assert.equal(pairing.noTimepoint, 1);
  // Post-op is carried only by S002, which is unpaired: no empty group for it.
  assert.deepEqual(pairing.visits, ['6 wk']);
});

test('pairStudies reports a subject ambiguous when a label the file writes is on two of its films, Pre-op included', () => {
  const rows = [
    film('SP-1', 'S001', 'Pre-op'), film('SP-2', 'S001', 'Pre-op'), film('SP-3', 'S001', 'Post-op'),
    film('SP-4', 'S002', 'Pre-op'), film('SP-5', 'S002', '6 wk'), film('SP-6', 'S002', '6 wk'), film('SP-7', 'S002', 'Post-op'),
  ];
  const pairing = pairStudies(rows);
  assert.deepEqual(pairing.subjects, []);
  assert.deepEqual(pairing.ambiguous, [
    { subject: 'S001', label: 'Pre-op', count: 2 },
    { subject: 'S002', label: '6 wk', count: 2 },
  ]);
  assert.deepEqual(pairing.unpaired, []);
  assert.deepEqual(pairing.visits, []);
});

test('pairStudies judges unpaired before ambiguous: two Pre-op films and no later film is unpaired', () => {
  const pairing = pairStudies([film('SP-1', 'S001', 'Pre-op'), film('SP-2', 'S001', 'Pre-op')]);
  assert.deepEqual(pairing.unpaired, ['S001']);
  assert.deepEqual(pairing.ambiguous, []);
});

test('pairStudies with a single label writes only that visit, ignores a duplicate on another label, and counts the films of other visits of written subjects only', () => {
  const rows = [
    film('SP-1', 'S001', 'Pre-op'), film('SP-2', 'S001', 'Post-op'), film('SP-3', 'S001', '6 wk'), film('SP-4', 'S001', '6 wk'), film('SP-5', 'S001', '1 yr'),
    film('SP-6', 'S002', 'Pre-op'), film('SP-7', 'S002', '6 wk'),
  ];
  const pairing = pairStudies(rows, { post: 'Post-op' });
  assert.equal(pairing.post, 'Post-op');
  assert.deepEqual(pairing.visits, ['Post-op']);
  assert.deepEqual(pairing.subjects.map((s) => s.subject), ['S001']);
  assert.deepEqual([...pairing.subjects[0].films.keys()], ['Pre-op', 'Post-op']);
  assert.deepEqual(pairing.ambiguous, []);
  assert.deepEqual(pairing.unpaired, ['S002']);
  // S001's two 6 wk films and its 1 yr film; S002's 6 wk film is covered by the unpaired clause.
  assert.deepEqual(pairing.otherVisits, { count: 3, labels: ['6 wk', '1 yr'] });
});

test('pairStudies with a single label no subject carries has no visits and no rows', () => {
  const pairing = pairStudies([film('SP-1', 'S001', 'Pre-op'), film('SP-2', 'S001', '6 wk')], { post: 'Post-op' });
  assert.deepEqual(pairing.visits, []);
  assert.deepEqual(pairing.subjects, []);
  assert.deepEqual(pairing.unpaired, ['S001']);
  assert.deepEqual(pairing.otherVisits, { count: 0, labels: [] });
});

test('pairStudies counts films with no subject, counts films with a subject and no timepoint whichever subject they belong to, and drops demo rows before anything', () => {
  const rows = [
    film('SP-1', null, 'Pre-op'), film('SP-2', '  ', 'Post-op'),
    film('SP-3', 'S001', 'Pre-op'), film('SP-4', 'S001', 'Post-op'), film('SP-5', 'S001', null),
    film('SP-6', 'S002', null),
    film('SP-0042', 'P-8841', 'Pre-op', { source: 'demo' }), film('SP-0039', 'P-8841', 'Post-op', { source: 'demo' }),
    film('SP-0040', null, null, { source: 'demo' }),
  ];
  const pairing = pairStudies(rows);
  assert.equal(pairing.noSubject, 2);
  assert.equal(pairing.noTimepoint, 2);
  assert.deepEqual(pairing.subjects.map((s) => s.subject), ['S001']);
  assert.deepEqual(pairing.unpaired, ['S002']);
});

test('pairStudies groups subjects case-insensitively after trimming and shows the first spelling seen', () => {
  const pairing = pairStudies([film('SP-1', ' S001 ', 'Pre-op'), film('SP-2', 's001', 'Post-op')]);
  assert.deepEqual(pairing.subjects.map((s) => s.subject), ['S001']);
  assert.equal(pairing.subjects[0].key, 's001');
  assert.equal(pairing.subjects[0].films.get('Post-op').id, 'SP-2');
});

test('pairStudies treats Intra-op as a later visit and orders visits Intra-op, Post-op, durations by length, then custom labels', () => {
  const rows = [
    film('SP-1', 'S001', 'Pre-op'), film('SP-2', 'S001', 'Final'), film('SP-3', 'S001', '2 yr'), film('SP-4', 'S001', 'Intra-op'),
    film('SP-5', 'S002', 'Pre-op'), film('SP-6', 'S002', '6 wk'), film('SP-7', 'S002', 'Post-op'),
  ];
  const pairing = pairStudies(rows);
  assert.deepEqual(pairing.visits, ['Intra-op', 'Post-op', '6 wk', '2 yr', 'Final']);
  assert.deepEqual([...pairing.subjects[0].films.keys()], ['Pre-op', 'Intra-op', '2 yr', 'Final']);
});

test('pairStudies leaves its input alone and handles an empty or absent list', () => {
  const rows = [film('SP-1', 'S001', 'Pre-op'), film('SP-2', 'S001', 'Post-op')];
  const copy = JSON.parse(JSON.stringify(rows));
  pairStudies(rows);
  assert.deepEqual(rows, copy);
  assert.deepEqual(pairStudies([]).subjects, []);
  assert.deepEqual(pairStudies([]).visits, []);
  assert.deepEqual(pairStudies(undefined).subjects, []);
});

// ---------------------------------------------------------------------------
// postFromFilters
// ---------------------------------------------------------------------------

test('postFromFilters is the with label only while Paired only is ticked, else All paired', () => {
  assert.equal(postFromFilters({ pairedOnly: true, pairedWith: 'Post-op' }), 'Post-op');
  assert.equal(postFromFilters({ pairedOnly: true, pairedWith: ANY_POST }), ANY_POST);
  assert.equal(postFromFilters({ pairedOnly: false, pairedWith: 'Post-op' }), ANY_POST);
  assert.equal(postFromFilters({ pairedOnly: true, pairedWith: '' }), ANY_POST);
  assert.equal(postFromFilters({}), ANY_POST);
  assert.equal(postFromFilters(null), ANY_POST);
});

// ---------------------------------------------------------------------------
// pairedExportMessage
// ---------------------------------------------------------------------------

test('pairedExportMessage says what was written and adds one clause per thing left out, only when nonzero', () => {
  const clean = { subjects: [{}, {}], unpaired: [], ambiguous: [], noSubject: 0, noTimepoint: 0, otherVisits: { count: 0, labels: [] } };
  assert.equal(pairedExportMessage(clean, 'C:\\out\\Fusion2025-paired.csv'), 'Exported 2 subjects to C:\\out\\Fusion2025-paired.csv');
  assert.equal(pairedExportMessage({ ...clean, subjects: [{}] }, 'x.csv'), 'Exported 1 subject to x.csv');
  const full = {
    subjects: Array(12).fill({}),
    unpaired: ['S007', 'S012', 'S020'],
    ambiguous: [{ subject: 'S003', label: '6 wk', count: 2 }],
    noSubject: 2, noTimepoint: 1, otherVisits: { count: 0, labels: [] },
  };
  assert.equal(pairedExportMessage(full, 'C:\\…\\Fusion2025-paired.csv'),
    'Exported 12 subjects to C:\\…\\Fusion2025-paired.csv \u00B7 3 unpaired (S007, S012, S020) \u00B7 1 ambiguous (two 6 wk films: S003) \u00B7 2 films with no subject \u00B7 1 film with no timepoint');
  const single = { ...clean, subjects: Array(12).fill({}), unpaired: ['S007', 'S012', 'S020'], otherVisits: { count: 4, labels: ['6 wk', '1 yr'] } };
  assert.equal(pairedExportMessage(single, 'C:\\…\\Fusion2025-paired.csv'),
    'Exported 12 subjects to C:\\…\\Fusion2025-paired.csv \u00B7 3 unpaired (S007, S012, S020) \u00B7 4 films of other visits not written (6 wk, 1 yr)');
  const one = { ...clean, subjects: [{}], noSubject: 1, noTimepoint: 1, otherVisits: { count: 1, labels: ['1 yr'] } };
  assert.equal(pairedExportMessage(one, 'x.csv'),
    'Exported 1 subject to x.csv \u00B7 1 film with no subject \u00B7 1 film with no timepoint \u00B7 1 film of other visits not written (1 yr)');
});

test('pairedExportMessage names at most five subjects per clause, then an ellipsis, and groups ambiguous subjects by the label and count they duplicated', () => {
  const pairing = {
    subjects: [], unpaired: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'],
    ambiguous: [
      { subject: 'S003', label: 'Pre-op', count: 2 }, { subject: 'S009', label: '6 wk', count: 2 },
      { subject: 'S010', label: 'Pre-op', count: 3 }, { subject: 'S011', label: 'Pre-op', count: 2 },
      { subject: 'S012', label: 'Post-op', count: 2 }, { subject: 'S013', label: 'Post-op', count: 2 },
    ],
    noSubject: 0, noTimepoint: 0, otherVisits: { count: 0, labels: [] },
  };
  assert.equal(pairedExportMessage(pairing, 'x.csv'),
    'Exported 0 subjects to x.csv \u00B7 7 unpaired (S1, S2, S3, S4, S5, \u2026) \u00B7 6 ambiguous (two Pre-op films: S003, S011; two 6 wk films: S009; three Pre-op films: S010; two Post-op films: S012, \u2026)');
  const five = { ...pairing, unpaired: ['S1', 'S2', 'S3', 'S4', 'S5'], ambiguous: [] };
  assert.equal(pairedExportMessage(five, 'x.csv'), 'Exported 0 subjects to x.csv \u00B7 5 unpaired (S1, S2, S3, S4, S5)');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/pairing.test.js`
Expected: FAIL — `Cannot find module '.../renderer/data/pairing.js'`.

- [ ] **Step 3: Write the module**

Create `renderer/data/pairing.js`:

```js
/**
 * The paired (wide) export's grouping (pre-op/post-op spec §11.2) and its toast (§11.3). Pure: no
 * DOM, no store. data/csv.js's toPairedCsv writes the text from what pairStudies returns;
 * screens/parameters.js calls pairStudies on every rebuild of the filter bar to decide whether the
 * paired button has anything to write, and again on click to write it.
 *
 * A subject gets a row when it has exactly one Pre-op film and at least one film on a visit the
 * file writes, with exactly one film per such label. Unpaired is judged first (no Pre-op film, or
 * no film on any candidate visit); a subject that could pair but has two films on any label the
 * file writes is ambiguous and gets no row -- a blank cell that meant "two films, neither chosen"
 * is the silent omission the spec forbids, so the row is dropped and the subject named instead.
 * Demo rows are never written and are dropped before anything is counted.
 *
 * Subjects compare by subjectKey (trimmed, lower-cased) and display as the first spelling seen.
 * A written subject's films are a Map keyed by label, never a plain object: a user-typed label
 * can be `constructor` or `toString`, which a plain object answers for before anything is set.
 */
import { subjectKey, ANY_POST } from './parameters.js';
import { PRE_OP, compareTimepoints } from './timepoints.js';

const NAME_CAP = 5;
const ELLIPSIS = '\u2026';
const SEP = ' \u00B7 ';
const COUNT_WORDS = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

function timepointOf(study) {
  const label = study?.timepoint;
  return typeof label === 'string' && label.trim() !== '' ? label : null;
}

// The post label the export uses: the `with` label while Paired only is ticked, else All paired.
// A disabled `with` control (the box unticked) does not shape the file (spec §11.2).
export function postFromFilters(filters) {
  const f = filters ?? {};
  const label = typeof f.pairedWith === 'string' ? f.pairedWith : ANY_POST;
  return f.pairedOnly === true && label !== '' && label !== ANY_POST ? label : ANY_POST;
}

/**
 * @typedef {Object} Pairing
 * @property {string[]} visits        later labels that get columns, §7.2 order (empty when nothing is written)
 * @property {string|null} post       the single label, or null under All paired
 * @property {Array<{key: string, subject: string, films: Map<string, Object>}>} subjects
 *                                    one per row written, first-appearance order; films keyed by label, PRE_OP first
 * @property {string[]} unpaired      display subjects, first-appearance order
 * @property {Array<{subject: string, label: string, count: number}>} ambiguous
 * @property {number} noSubject       real rows with no subject
 * @property {number} noTimepoint     real rows with a subject and no timepoint
 * @property {{count: number, labels: string[]}} otherVisits   under a single label only: written subjects' films on other labels
 */

// `rows` are the rows the long export would write (visible, or ticked visible). `post` is a
// timepoint label for the two-visit file, or ANY_POST for one visit per later label present.
export function pairStudies(rows, { post = ANY_POST } = {}) {
  const single = typeof post === 'string' && post !== '' && post !== ANY_POST ? post : null;
  const real = (rows ?? []).filter((study) => study.source !== 'demo');

  // Group by subject key in first-appearance order; count the films no group can hold.
  const groups = new Map();
  let noSubject = 0;
  for (const study of real) {
    const key = subjectKey(study);
    if (key === null) { noSubject += 1; continue; }
    let group = groups.get(key);
    if (!group) {
      group = { key, subject: study.subjectId.trim(), films: [] };
      groups.set(key, group);
    }
    group.films.push(study);
  }

  // The candidate visits: the single label, or every label other than Pre-op among the films that
  // have a subject, in §7.2 order.
  let candidates;
  if (single !== null) {
    candidates = [single];
  } else {
    candidates = [];
    for (const group of groups.values()) {
      for (const study of group.films) {
        const label = timepointOf(study);
        if (label !== null && label !== PRE_OP && !candidates.includes(label)) candidates.push(label);
      }
    }
    candidates.sort(compareTimepoints);
  }
  // Every label the file writes -- the ones a duplicate makes a subject ambiguous on.
  const written = [PRE_OP, ...candidates];

  const subjects = [];
  const unpaired = [];
  const ambiguous = [];
  let noTimepoint = 0;
  let otherCount = 0;
  const otherLabels = [];
  for (const group of groups.values()) {
    const byLabel = new Map();
    for (const study of group.films) {
      const label = timepointOf(study);
      if (label === null) { noTimepoint += 1; continue; }
      const list = byLabel.get(label);
      if (list) list.push(study);
      else byLabel.set(label, [study]);
    }
    const later = candidates.filter((label) => byLabel.has(label));
    // Unpaired first: nothing to difference against, or nothing to difference.
    if (!byLabel.has(PRE_OP) || later.length === 0) { unpaired.push(group.subject); continue; }
    const duplicated = written.find((label) => (byLabel.get(label) ?? []).length > 1);
    if (duplicated !== undefined) {
      ambiguous.push({ subject: group.subject, label: duplicated, count: byLabel.get(duplicated).length });
      continue;
    }
    const films = new Map();
    for (const label of [PRE_OP, ...later]) films.set(label, byLabel.get(label)[0]);
    subjects.push({ key: group.key, subject: group.subject, films });
    // Under a single label, a written subject's films on any other label are left out of the
    // file and counted here (§11.3); an unpaired subject's are covered by its own clause.
    if (single !== null) {
      for (const [label, list] of byLabel) {
        if (written.includes(label)) continue;
        otherCount += list.length;
        if (!otherLabels.includes(label)) otherLabels.push(label);
      }
    }
  }
  otherLabels.sort(compareTimepoints);
  // A candidate gets columns only when a written subject has a film on it (§11.2), so a label
  // carried only by unpaired subjects adds no empty group.
  const visits = candidates.filter((label) => subjects.some((row) => row.films.has(label)));

  return {
    visits, post: single, subjects, unpaired, ambiguous, noSubject, noTimepoint,
    otherVisits: { count: otherCount, labels: otherLabels },
  };
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function countWord(count) {
  return COUNT_WORDS[count] ?? String(count);
}

// Up to five names, then an ellipsis (spec §11.3).
function names(list) {
  return list.slice(0, NAME_CAP).join(', ') + (list.length > NAME_CAP ? `, ${ELLIPSIS}` : '');
}

// `two Pre-op films: S003, S011; two 6 wk films: S009` -- grouped by the duplicated label and its
// count in first-appearance order, at most five subjects named across the clause, then an ellipsis.
function ambiguousDetail(entries) {
  const groups = [];
  let named = 0;
  let cut = false;
  for (const entry of entries) {
    if (named >= NAME_CAP) { cut = true; break; }
    const head = `${countWord(entry.count)} ${entry.label} films`;
    let group = groups.find((g) => g.head === head);
    if (!group) { group = { head, subjects: [] }; groups.push(group); }
    group.subjects.push(entry.subject);
    named += 1;
  }
  return groups.map((g) => `${g.head}: ${g.subjects.join(', ')}`).join('; ') + (cut ? `, ${ELLIPSIS}` : '');
}

// The §11.3 toast: what was written, then one clause per thing left out, each only when nonzero.
export function pairedExportMessage(pairing, savedTo) {
  const { subjects, unpaired, ambiguous, noSubject, noTimepoint, otherVisits } = pairing;
  let text = `Exported ${plural(subjects.length, 'subject', 'subjects')} to ${savedTo}`;
  if (unpaired.length > 0) text += `${SEP}${unpaired.length} unpaired (${names(unpaired)})`;
  if (ambiguous.length > 0) text += `${SEP}${ambiguous.length} ambiguous (${ambiguousDetail(ambiguous)})`;
  if (noSubject > 0) text += `${SEP}${plural(noSubject, 'film', 'films')} with no subject`;
  if (noTimepoint > 0) text += `${SEP}${plural(noTimepoint, 'film', 'films')} with no timepoint`;
  if (otherVisits.count > 0) text += `${SEP}${plural(otherVisits.count, 'film', 'films')} of other visits not written (${otherVisits.labels.join(', ')})`;
  return text;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/pairing.test.js`
Expected: 14 passing. Then `node --test test/*.test.js` — 393 passing (379 + 14), nothing else changed.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/pairing.js test/pairing.test.js
git commit -m "feat: pairStudies groups the paired export's rows by subject and builds its report (spec §11.2–§11.3)"
```

---

### Task 2: `toPairedCsv` and `delta1` in `csv.js`; `exportFileName` takes a kind

**Files:**
- Modify: `renderer/data/csv.js` (imports at the top; after `round1`; after `toCsv`)
- Modify: `renderer/data/parameters.js` (`exportFileName`, at the end of the file)
- Modify: `test/csv.test.js` (imports; append)
- Modify: `test/parameters.test.js` (append after the existing `exportFileName` test)

**Interfaces:**
- Consumes: `Pairing` from Task 1 (`visits`, `subjects[].subject`, `subjects[].films: Map<label, Study>`); the module-private `MEASUREMENT_COLUMNS`, `round1`, `measurementValue`, `escapeField` and the exported `clinicalFieldNames` already in `csv.js`; `PRE_OP` from `timepoints.js`.
- Produces: `toPairedCsv(pairing)` → `string` (CRLF lines, trailing CRLF, the three citation lines first); `delta1(pre, post)` → `number | ''`; `exportFileName(workspace, kind = 'parameters')` → `string`.

- [ ] **Step 1: Write the failing tests**

In `test/csv.test.js`, change the import block at the top to:

```js
import {
  toCsv, parse, autoMap, KNOWN_FIELDS, fileStem, findJoinHeader, joinClinical, clinicalFieldNames,
  findStructuralHeaders, structuralField, STRUCTURAL_LABELS, structuralFromRow,
  toPairedCsv, delta1,
} from '../renderer/data/csv.js';
import { pairStudies } from '../renderer/data/pairing.js';
```

and append at the end of the file:

```js
// ---------------------------------------------------------------------------
// the paired export (pre-op/post-op spec §11.2)
// ---------------------------------------------------------------------------

test('delta1 is post minus pre over the one-decimal forms of each, to one decimal, and empty when either side is absent', () => {
  assert.equal(delta1(21.4, 14.0), -7.4);
  assert.equal(delta1(52.1, 52.3), 0.2);          // 52.3 - 52.1 is 0.1999… in floating point
  assert.equal(delta1(38.2, 49.1), 10.9);
  assert.equal(delta1(21.36, 14.04), -7.4);       // over 21.4 and 14.0, not -7.3 over the raw values
  assert.equal(delta1(5, 5), 0);
  assert.equal(delta1('', 5), '');
  assert.equal(delta1(5, ''), '');
  assert.equal(delta1(undefined, 5), '');
  assert.equal(delta1(NaN, 1), '');
  assert.equal(delta1(1, Infinity), '');
});

const PAIR_PRE = { PI: 52.1, PT: 21.4, SS: 30.7, L1PA: 9.9, LL: { 'L1-S1': 38.2, 'L2-S1': 33.0, 'L3-S1': 25.1, 'L4-S1': 15.6, 'L5-S1': 5.2 } };
const PAIR_POST = { PI: 52.3, PT: 14.0, SS: 38.3, L1PA: 8.1, LL: { 'L1-S1': 49.1, 'L2-S1': 41.0, 'L3-S1': 30.2, 'L4-S1': 18.0, 'L5-S1': 6.4 } };
const PAIR_YEAR = { PI: 52.0, PT: 15.1, SS: 36.9, LL: { 'L1-S1': 47.5 } };

// S001 has Pre-op, Post-op and 1 yr films; S002 has Pre-op and 1 yr; S003 has only a Post-op film
// (unpaired, and its clinical key must add no column).
function pairedRows() {
  return [
    study({ id: 'SP-1000', subjectId: 'S001', timepoint: 'Pre-op', filmDate: '2025-03-02', measurements: PAIR_PRE, clinical: { Age: '61', Sex: 'F' } }),
    study({ id: 'SP-1001', subjectId: 'S001', timepoint: 'Post-op', filmDate: '2025-09-14', measurements: PAIR_POST, clinical: { Age: '61', ODI: '18' } }),
    study({ id: 'SP-1002', subjectId: 'S001', timepoint: '1 yr', filmDate: '2026-03-20', view: 'Prone lateral', measurements: PAIR_YEAR, clinical: {} }),
    study({ id: 'SP-1003', subjectId: 'S002', timepoint: 'Pre-op', filmDate: '2025-04-11', measurements: { PI: 48.6, PT: 12.1, SS: 36.5, LL: { 'L1-S1': 49.0 } }, clinical: { Age: '58' } }),
    study({ id: 'SP-1004', subjectId: 'S002', timepoint: '1 yr', filmDate: '2026-04-02', measurements: { PI: 48.9, PT: 9.8, SS: 39.1, LL: { 'L1-S1': 50.2 } }, clinical: {} }),
    study({ id: 'SP-1005', subjectId: 'S003', timepoint: 'Post-op', clinical: { Notes: 'unpaired, adds no column' } }),
  ];
}

const MEASURES = ['LL L1-S1', 'PI', 'PT', 'SS', 'PI-LL Mismatch', 'L1PA', 'LL L2-S1', 'LL L3-S1', 'LL L4-S1', 'LL L5-S1'];

test('toPairedCsv leads with the citation block and writes the layout-B header over the visits present', () => {
  const lines = toPairedCsv(pairStudies(pairedRows())).split('\r\n');
  assert.equal(lines[0], '# Spine Contour export');
  assert.match(lines[1], /^# Created by /);
  assert.match(lines[2], /NOT FOR CLINICAL USE/);
  const header = lines[3].split(',');
  assert.deepEqual(header.slice(0, 10), [
    'Subject', 'Pre-op study', 'Post-op study', '1 yr study', 'Pre-op view', 'Post-op view', '1 yr view',
    'Pre-op film date', 'Post-op film date', '1 yr film date',
  ]);
  // Each measurement's trajectory is contiguous: Pre-op, then value and Delta per later visit.
  assert.deepEqual(header.slice(10, 20), [
    'LL L1-S1 Pre-op', 'LL L1-S1 Post-op', 'Delta LL L1-S1 Post-op', 'LL L1-S1 1 yr', 'Delta LL L1-S1 1 yr',
    'PI Pre-op', 'PI Post-op', 'Delta PI Post-op', 'PI 1 yr', 'Delta PI 1 yr',
  ]);
  assert.deepEqual(header.slice(10), [
    ...MEASURES.flatMap((m) => [`${m} Pre-op`, `${m} Post-op`, `Delta ${m} Post-op`, `${m} 1 yr`, `Delta ${m} 1 yr`]),
    'Age Pre-op', 'Age Post-op', 'Age 1 yr', 'Sex Pre-op', 'Sex Post-op', 'Sex 1 yr', 'ODI Pre-op', 'ODI Post-op', 'ODI 1 yr',
  ]);
  assert.equal(header.length, 69);
  assert.ok(!lines[3].includes('Notes'), 'an unpaired subject\'s clinical key adds no column');
  // Two subjects written, then the trailing CRLF.
  assert.equal(lines.length, 7);
  assert.equal(lines[6], '');
});

test('toPairedCsv writes one row per subject with the deltas over the written one-decimal values and empty cells for a missing visit', () => {
  const lines = toPairedCsv(pairStudies(pairedRows())).split('\r\n');
  assert.equal(lines[4], [
    'S001', 'SP-1000', 'SP-1001', 'SP-1002', 'Standing lateral', 'Standing lateral', 'Prone lateral', '2025-03-02', '2025-09-14', '2026-03-20',
    '38.2', '49.1', '10.9', '47.5', '9.3',       // LL L1-S1
    '52.1', '52.3', '0.2', '52', '-0.1',         // PI
    '21.4', '14', '-7.4', '15.1', '-6.3',        // PT
    '30.7', '38.3', '7.6', '36.9', '6.2',        // SS
    '13.9', '3.2', '-10.7', '4.5', '-9.4',       // PI-LL Mismatch, derived per film then differenced
    '9.9', '8.1', '-1.8', '', '',                // L1PA: absent at 1 yr, so that value and its delta are empty
    '33', '41', '8', '', '',                     // LL L2-S1
    '25.1', '30.2', '5.1', '', '',               // LL L3-S1
    '15.6', '18', '2.4', '', '',                 // LL L4-S1
    '5.2', '6.4', '1.2', '', '',                 // LL L5-S1
    '61', '61', '', 'F', '', '', '', '18', '',   // Age, Sex, ODI per visit
  ].join(','));
  assert.equal(lines[5], [
    'S002', 'SP-1003', '', 'SP-1004', 'Standing lateral', '', 'Standing lateral', '2025-04-11', '', '2026-04-02',
    '49', '', '', '50.2', '1.2',
    '48.6', '', '', '48.9', '0.3',
    '12.1', '', '', '9.8', '-2.3',
    '36.5', '', '', '39.1', '2.6',
    '-0.4', '', '', '-1.3', '-0.9',
    '', '', '', '', '',
    '', '', '', '', '',
    '', '', '', '', '',
    '', '', '', '', '',
    '', '', '', '', '',
    '58', '', '', '', '', '', '', '', '',
  ].join(','));
  assert.equal(lines[5].split(',').length, 69);
  assert.ok(!lines.join('\n').includes('NaN'));
});

test('toPairedCsv under a single label writes the two-visit file with that label only', () => {
  const lines = toPairedCsv(pairStudies(pairedRows(), { post: 'Post-op' })).split('\r\n');
  const header = lines[3].split(',');
  assert.deepEqual(header.slice(0, 10), [
    'Subject', 'Pre-op study', 'Post-op study', 'Pre-op view', 'Post-op view', 'Pre-op film date', 'Post-op film date',
    'LL L1-S1 Pre-op', 'LL L1-S1 Post-op', 'Delta LL L1-S1 Post-op',
  ]);
  assert.equal(header.length, 43);
  assert.equal(lines.length, 6, 'S001 only: S002 has no Post-op film and S003 no Pre-op film');
  assert.ok(lines[4].startsWith('S001,SP-1000,SP-1001,Standing lateral,Standing lateral,2025-03-02,2025-09-14,38.2,49.1,10.9,52.1,52.3,0.2,'));
  assert.ok(!lines[3].includes('1 yr'));
});

test('toPairedCsv writes empty measurement and delta cells for an unsegmented film rather than dropping the subject', () => {
  const rows = [
    study({ id: 'SP-1000', subjectId: 'S001', timepoint: 'Pre-op', measurements: null }),
    study({ id: 'SP-1001', subjectId: 'S001', timepoint: 'Post-op', measurements: PAIR_POST }),
  ];
  const lines = toPairedCsv(pairStudies(rows)).split('\r\n');
  const cells = lines[4].split(',');
  assert.deepEqual(cells.slice(0, 7), ['S001', 'SP-1000', 'SP-1001', 'Standing lateral', 'Standing lateral', '', '']);
  assert.deepEqual(cells.slice(7, 13), ['', '49.1', '', '', '52.3', '']);
  assert.equal(cells.length, 37);
});

test('toPairedCsv never writes a demo row and quotes a label or value that needs it', () => {
  const rows = [
    study({ id: 'SP-0042', source: 'demo', subjectId: 'P-8841', timepoint: 'Pre-op', measurements: PAIR_PRE }),
    study({ id: 'SP-0039', source: 'demo', subjectId: 'P-8841', timepoint: 'Post-op', measurements: PAIR_POST }),
    study({ id: 'SP-1000', subjectId: 'S001', timepoint: 'Pre-op', measurements: PAIR_PRE, clinical: { Diagnosis: 'Spondylolisthesis, grade 2' } }),
    study({ id: 'SP-1001', subjectId: 'S001', timepoint: '6 wk, standing', measurements: PAIR_POST }),
  ];
  const csv = toPairedCsv(pairStudies(rows));
  assert.ok(!csv.includes('P-8841'));
  assert.ok(!csv.includes('SP-0042'));
  assert.ok(csv.includes('"6 wk, standing study"'));
  assert.ok(csv.includes('"Spondylolisthesis, grade 2"'));
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 6);
});

test('toPairedCsv over a pairing with nothing written is the citation block and a Pre-op-only header', () => {
  const lines = toPairedCsv(pairStudies([study({ id: 'SP-1000', subjectId: 'S001', timepoint: 'Pre-op' })])).split('\r\n');
  assert.equal(lines.length, 5);
  assert.ok(lines[3].startsWith('Subject,Pre-op study,Pre-op view,Pre-op film date,LL L1-S1 Pre-op,PI Pre-op,'));
  assert.equal(lines[3].split(',').length, 14);
});
```

In `test/parameters.test.js`, after the existing test `'exportFileName names the workspace, or the library when there is no single root'`, add:

```js
test('exportFileName takes a kind for the paired file and defaults to parameters', () => {
  assert.equal(exportFileName(null, 'paired'), 'library-paired.csv');
  assert.equal(exportFileName(HAND_ADDED, 'paired'), 'library-paired.csv');
  assert.equal(exportFileName('C:\\films\\Fusion2025', 'paired'), 'Fusion2025-paired.csv');
  assert.equal(exportFileName('/', 'paired'), 'workspace-paired.csv');
  assert.equal(exportFileName('C:\\films\\Fusion2025'), 'Fusion2025-parameters.csv');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/csv.test.js test/parameters.test.js`
Expected: the csv suite fails to load (`toPairedCsv` / `delta1` are not exported), and the new `exportFileName` test fails with `'library-parameters.csv' !== 'library-paired.csv'`.

- [ ] **Step 3: Implement**

In `renderer/data/csv.js`:

1. Change the first line to:
   ```js
   import { normaliseTimepoint, normaliseView, parseFilmDate, PRE_OP } from './timepoints.js';
   ```
2. Directly after the `round1` function, add:
   ```js
   // The later value minus the earlier, over the one-decimal forms of each (pre-op/post-op spec §11.2):
   // the file writes both sides to one decimal, so the delta is computed from what is written and
   // the three cells always agree to the digit. Empty when either side is absent, never 0. Exported
   // for comparison mode (plan 07) to apply the same rule.
   export function delta1(pre, post) {
     const a = round1(pre);
     const b = round1(post);
     if (a === '' || b === '') return '';
     return Number((b - a).toFixed(1));
   }
   ```
3. Directly after the `toCsv` function (before the `// CSV import:` banner), add:
   ```js
   // The paired (wide) file (pre-op/post-op spec §11.2) from what data/pairing.js's pairStudies
   // returns; this function only writes text. Layout B, measurement-major: Subject; `<label> study`,
   // `<label> view`, `<label> film date` per visit (Pre-op first); then per measurement column
   // `<M> Pre-op` followed by `<M> <label>`, `Delta <M> <label>` per later visit; then `<F> <label>`
   // per clinical key present on the written films. Headers use the stored label and ASCII `Delta`,
   // following `PI-LL Mismatch` for the on-screen `PI–LL`, so Excel and R read them without a
   // byte-order mark. Demo rows never reach this function: pairStudies drops them.
   export function toPairedCsv(pairing) {
     const { visits, subjects } = pairing;
     const labels = [PRE_OP, ...visits];
     const written = subjects.flatMap((row) => [...row.films.values()]);
     const fields = clinicalFieldNames(written);

     const citation = [
       '# Spine Contour export',
       '# Created by Cody Woodhouse, MD; Michael Jayasuriya, BS.',
       '# Investigational software. NOT FOR CLINICAL USE.',
     ];
     const header = [
       'Subject',
       ...labels.map((label) => `${label} study`),
       ...labels.map((label) => `${label} view`),
       ...labels.map((label) => `${label} film date`),
       ...MEASUREMENT_COLUMNS.flatMap((column) => [
         `${column} ${PRE_OP}`,
         ...visits.flatMap((label) => [`${column} ${label}`, `Delta ${column} ${label}`]),
       ]),
       ...fields.flatMap((field) => labels.map((label) => `${field} ${label}`)),
     ];

     const lines = [...citation, header.map(escapeField).join(',')];
     for (const row of subjects) {
       const film = (label) => row.films.get(label) ?? null;
       const pre = film(PRE_OP);
       const cells = [
         row.subject,
         ...labels.map((label) => film(label)?.id ?? ''),
         ...labels.map((label) => film(label)?.view ?? ''),
         ...labels.map((label) => film(label)?.filmDate ?? ''),
         ...MEASUREMENT_COLUMNS.flatMap((column) => {
           const before = pre ? measurementValue(pre, column) : '';
           return [
             before,
             ...visits.flatMap((label) => {
               const later = film(label);
               const value = later ? measurementValue(later, column) : '';
               return [value, delta1(before, value)];
             }),
           ];
         }),
         ...fields.flatMap((field) => labels.map((label) => {
           const study = film(label);
           return study && study.clinical && study.clinical[field] != null ? study.clinical[field] : '';
         })),
       ];
       lines.push(cells.map(escapeField).join(','));
     }
     return `${lines.join('\r\n')}\r\n`;
   }
   ```

In `renderer/data/parameters.js`, replace the `exportFileName` function at the end of the file with:

```js
// `<root last segment>-<kind>.csv` for a workspace filter, else the whole library; `kind` is
// 'parameters' (the long export) or 'paired' (spec §10.4). The segment is reduced to letters,
// digits, underscore and hyphen so the suggested name is a valid filename on every platform.
export function exportFileName(workspace, kind = 'parameters') {
  if (!workspace || workspace === HAND_ADDED) return `library-${kind}.csv`;
  const stem = lastSegment(workspace).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${stem || 'workspace'}-${kind}.csv`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/csv.test.js test/parameters.test.js`
Expected: all passing (the csv suite gains 7, the parameters suite 1). Then `node --test test/*.test.js` — 401 passing.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/csv.js renderer/data/parameters.js test/csv.test.js test/parameters.test.js
git commit -m "feat: toPairedCsv writes the layout-B wide file; delta1 over the written values; exportFileName takes a kind (spec §11.2)"
```

---

### Task 3: `toastDuration` — the toast stays as long as its text needs

**Files:**
- Modify: `renderer/components/toast.js`
- Create: `test/toast.test.js`

**Interfaces:**
- Consumes: nothing new. `toast.js` imports `el` from `../dom.js` and `setState` from `../store.js`, neither of which touches `document` at import time, so the module loads under Node.
- Produces: `toastDuration(text)` → `number` (ms); `TOAST_MIN_MS` (2200), `TOAST_MAX_MS` (8000). `showToast(message)` uses `toastDuration(message)` for its dismiss timer.

- [ ] **Step 1: Write the failing test**

Create `test/toast.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toastDuration, TOAST_MIN_MS, TOAST_MAX_MS } from '../renderer/components/toast.js';

test('toastDuration is 2.2 s up to forty characters, then 40 ms per character, capped at 8 s', () => {
  assert.equal(TOAST_MIN_MS, 2200);
  assert.equal(TOAST_MAX_MS, 8000);
  assert.equal(toastDuration(''), 2200);
  assert.equal(toastDuration(null), 2200);
  assert.equal(toastDuration(undefined), 2200);
  assert.equal(toastDuration('x'.repeat(40)), 2200);
  assert.equal(toastDuration('x'.repeat(41)), 2240);
  assert.equal(toastDuration('x'.repeat(150)), 6600);
  assert.equal(toastDuration('x'.repeat(185)), 8000);
  assert.equal(toastDuration('x'.repeat(400)), 8000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/toast.test.js`
Expected: FAIL — `toastDuration` is not exported.

- [ ] **Step 3: Implement**

Replace the whole of `renderer/components/toast.js` with:

```js
import { el } from '../dom.js';
import { setState } from '../store.js';

// How long a toast stays: 2.2 s for a short message, then 40 ms per character past forty, capped
// at 8 s (pre-op/post-op spec §11.3, 2026-09-08). The paired export's report and the workspace
// load message run to five clauses; a fixed 2.2 s could not be read. Pure, so it is unit-tested.
export const TOAST_MIN_MS = 2200;
export const TOAST_MAX_MS = 8000;
const TOAST_FREE_CHARS = 40;
const TOAST_MS_PER_CHAR = 40;

export function toastDuration(text) {
  const length = String(text ?? '').length;
  return Math.min(TOAST_MAX_MS, TOAST_MIN_MS + Math.max(0, length - TOAST_FREE_CHARS) * TOAST_MS_PER_CHAR);
}

let dismissTimer = null;

export function showToast(message) {
  if (dismissTimer) clearTimeout(dismissTimer);
  setState({ toast: message });
  dismissTimer = setTimeout(() => {
    setState({ toast: '' });
    dismissTimer = null;
  }, toastDuration(message));
}

export function render(state) {
  const visible = Boolean(state.toast);
  return el('div', { class: `toast${visible ? ' toast-visible' : ''}` }, state.toast || '');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/toast.test.js`
Expected: 1 passing. Then `node --test test/*.test.js` — 402 passing.

- [ ] **Step 5: Commit**

```bash
git add renderer/components/toast.js test/toast.test.js
git commit -m "feat: a toast stays as long as its text needs, 2.2 s to 8 s (spec §11.3)"
```

---

### Task 4: The `Export paired CSV` button on the Parameters filter bar

**Files:**
- Modify: `renderer/screens/parameters.js` (the file header comment; the imports; after `exportVisible`; the tail of `buildFilterBar` from `// What Export would write` to its `return`)

**Interfaces:**
- Consumes: `pairStudies`, `postFromFilters`, `pairedExportMessage` from `renderer/data/pairing.js` (Task 1); `toPairedCsv` from `renderer/data/csv.js` and `exportFileName(workspace, 'paired')` from `renderer/data/parameters.js` (Task 2); `showToast` (Task 3's duration applies by itself); `saveCsv` from `renderer/api.js` (resolves the path, or null when the dialog is cancelled).
- Produces: a `<button data-param-key="export-paired">` and, when it alone is disabled, a `<span data-param-key="export-paired-note">`; no new store key; the `update()` key array is unchanged.

**Human gate.** This task ends in a manual verification step. Commit before the gate with the body line `Manual verification: pending the human gate (7 checks) — outcomes recorded here by amendment before Task 5 starts.`; the controller amends the still-unpushed commit with the outcomes afterwards; the ledger stays uncommitted until then.

- [ ] **Step 1: The imports and the file header**

In `renderer/screens/parameters.js`:

1. In the header comment, change `with every measurement, a filter bar, sortable headers and an export of the visible rows.` to `with every measurement, a filter bar, sortable headers and two exports of the visible rows: long (one row per film) and paired (one row per subject, spec §11.2).`
2. Change `import { toCsv } from '../data/csv.js';` to `import { toCsv, toPairedCsv } from '../data/csv.js';`
3. After the `import { ... } from '../data/parameters.js';` block, add:
   ```js
   import { pairStudies, postFromFilters, pairedExportMessage } from '../data/pairing.js';
   ```

- [ ] **Step 2: The export handler**

Directly after the `exportVisible` function (after its closing brace), add:

```js
  // Writes one row per subject over the same rows (spec §11.2). pairStudies has already dropped
  // the demo rows, grouped the rest and judged each subject, and the button is disabled when it
  // found no subject to write, so this never hands the user a header with no data. The toast is
  // §11.3's report of what was written and what was left out; a cancelled dialog resolves null and
  // must not toast.
  async function exportPaired(pairing, filters) {
    if (pairing.subjects.length === 0) return;
    const csv = toPairedCsv(pairing);
    try {
      const savedTo = await saveCsv({ text: csv, suggestedName: exportFileName(filters.workspace, 'paired') });
      if (savedTo) showToast(pairedExportMessage(pairing, savedTo));
    } catch (error) {
      showToast(`Could not export: ${error.message}`);
    }
  }
```

- [ ] **Step 3: The button and the shared note**

In `buildFilterBar`, replace everything from the comment line `// What Export would write, and how much of it the user picked.` down to and including the function's `return el('div', { class: 'param-bar' }, … );` statement with this whole block (the long button's part is unchanged; what follows it is new):

```js
    // What Export would write, and how much of it the user picked. A tick on a row the current
    // filter hides counts for neither: `chosen` is the ticked rows that are VISIBLE, so the label,
    // the count and the file all describe the same set. The hidden tick stays in the store and
    // comes back with the filter.
    const chosen = selectedVisible(visible, live.paramSelected);
    const rows = rowsToExport(visible, live.paramSelected);
    const exportable = rows.filter((study) => study.source === 'real').length;
    // Chromium shows no tooltip on a disabled control, so the reason is both the title and a
    // visible note beside the button.
    const reason = visible.length === 0 ? 'Nothing to export' : 'Demo studies are not exported';
    const exportButton = el('button', {
      type: 'button', class: 'btn btn-small param-export', 'data-param-key': 'export',
      disabled: exportable === 0,
      // No tooltip on the enabled button: it would only repeat the label it sits on.
      title: exportable > 0 ? '' : reason,
      onClick: () => exportVisible(rows, filters),
    }, chosen.length > 0 ? `Export ${chosen.length} selected` : 'Export CSV');

    // The paired export over the same rows (spec §10.4, §11.2). The `with` label shapes the file
    // only while Paired only is ticked (postFromFilters); pairStudies decides on every rebuild
    // whether anything would be written, and that is what disables the button. Its reason is the
    // long button's when that one is disabled too, else §10.4's third reason.
    const pairing = pairStudies(rows, { post: postFromFilters(filters) });
    const pairedReason = exportable === 0 ? reason : 'No paired subjects in these rows';
    const pairedButton = el('button', {
      type: 'button', class: 'btn btn-small param-export param-export-paired', 'data-param-key': 'export-paired',
      disabled: pairing.subjects.length === 0,
      title: pairing.subjects.length > 0 ? '' : pairedReason,
      onClick: () => exportPaired(pairing, filters),
    }, chosen.length > 0 ? `Export paired \u00B7 ${chosen.length} selected` : 'Export paired CSV');

    // One note for the group: when the long button is disabled its reason applies to both buttons
    // and one note after them stands for both; the paired button's own reason shows only when the
    // long one is enabled. Each disabled button still carries its reason in its title.
    const note = exportable === 0
      ? el('span', { class: 'param-export-note', 'data-param-key': 'export-note' }, reason)
      : (pairing.subjects.length === 0
        ? el('span', { class: 'param-export-note', 'data-param-key': 'export-paired-note' }, pairedReason)
        : null);

    return el('div', { class: 'param-bar' },
      workspaceSelect, folderSelect, timepointSelect, viewSelect, subjectInput, pairedGroup, segmented, levels,
      el('div', { class: 'param-count', 'data-param-key': 'count' },
        `${visible.length} OF ${live.studies.length} STUDIES SHOWN${chosen.length > 0 ? ` \u00B7 ${chosen.length} SELECTED` : ''}`),
      // Buttons and note in one group: the bar wraps, and on their own they land on separate lines
      // with the reason at the far left, reading as a stray line rather than as the buttons'.
      el('div', { class: 'param-export-group' }, exportButton, pairedButton, note));
```

No CSS change: `.param-export-group` is already a flex row with a 12 px gap. If the dry run or the gate shows the note wrapping onto its own line, add `flex-wrap: nowrap;` to `.param-export-group` in `styles/screens/studies.css` and nothing else.

- [ ] **Step 4: Unit suite and the existing smoke suite still green**

Run: `node --test test/*.test.js` — 402 passing (this task adds no test; the DOM is covered by the dry run, the gate and Task 5).

Then, in the foreground with output captured:

```
node tools/smoke/launch.mjs > tools/smoke/out/task4-launch.txt 2>&1
node tools/smoke/smoke-parameters.mjs > tools/smoke/out/task4-smoke-parameters.txt 2>&1
```

Expected: `46/46 checks passed` (the suite does not yet know the new button; its `export-note` check in section 8 still holds because the long button's note keeps its key).

- [ ] **Step 5: Dry-run the gate over the harness**

With the instance from Step 4 still up, write `tools/smoke/out/task4-dryrun.mjs` (git-ignored) and run it with `node tools/smoke/out/task4-dryrun.mjs > tools/smoke/out/task4-dryrun.txt 2>&1`:

```js
// Task 4 dry run: the paired button's states and the file and toast text through the page's own
// modules, on the Parameters smoke suite's injected records. The save dialog is the human's.
import { connect } from '../cdp-lib.mjs';

const WS_ROOT = 'C:\\smoke-fixture\\Fusion2025';
const INJECTED = ['SP-9100', 'SP-9101', 'SP-9102', 'SP-9103'];
const RESET_FILTERS = '{ workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, subject: "", pairedOnly: false, pairedWith: "__any__" }';
const results = [];
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
const cdp = await connect();
const has = (selector) => cdp.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
const text = (selector) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); return e ? e.textContent : null; })()`);
const button = (key) => cdp.evaluate(`(() => { const b = document.querySelector('[data-param-key="${key}"]'); return b ? { disabled: b.disabled, title: b.title, text: b.textContent } : null; })()`);
const choose = (selector, value) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); return e.value; })()`);
async function clickKey(key) {
  const r = await cdp.rect(`[data-param-key="${key}"]`);
  if (!r) throw new Error(`no control with data-param-key ${key}`);
  await cdp.click(r.cx, r.cy);
  await cdp.settle(80);
}

try {
  await cdp.setState(`(s) => ({ ack: true, screen: 'studies', studiesTab: 'parameters', query: '', paramFilters: ${RESET_FILTERS}, paramSort: { key: 'study', dir: 'asc' }, paramLevels: false, paramSelected: [], studies: [
    { id: 'SP-9100', source: 'real', filePath: 'C:\\\\loose\\\\smoke-unseg.png', fileName: 'smoke-unseg.png', name: null, workspaceFolder: null,
      subjectId: null, timepoint: null, filmDate: null,
      addedAt: new Date().toISOString(), view: 'Standing lateral', thumbnail: null, measurements: null, geometry: null, qc: null, clinical: {} },
    { id: 'SP-9101', source: 'real', filePath: ${JSON.stringify(`${WS_ROOT}\\pre-op\\smoke-seg-a.png`)}, fileName: 'smoke-seg-a.png', name: null,
      workspaceFolder: ${JSON.stringify(WS_ROOT)}, subjectId: 'S001', timepoint: 'Pre-op', filmDate: '2025-03-02',
      addedAt: '2026-09-01T00:00:00.000Z', view: 'Standing lateral', thumbnail: null,
      measurements: { PI: 99.5, PT: 30.0, SS: 69.5, L1PA: 12.0, LL: { 'L1-S1': 60.0 } }, geometry: null, qc: null, clinical: {} },
    { id: 'SP-9102', source: 'real', filePath: ${JSON.stringify(`${WS_ROOT}\\post-op\\smoke-seg-b.png`)}, fileName: 'smoke-seg-b.png', name: null,
      workspaceFolder: ${JSON.stringify(WS_ROOT)}, subjectId: 'S001', timepoint: 'Post-op', filmDate: '2025-09-14',
      addedAt: '2026-09-02T00:00:00.000Z', view: 'Standing lateral', thumbnail: null,
      measurements: { PI: 50.0, PT: 15.0, SS: 35.0, LL: { 'L1-S1': 45.0 } }, geometry: null, qc: null, clinical: {} },
    { id: 'SP-9103', source: 'real', filePath: ${JSON.stringify(`${WS_ROOT}\\pre-op\\smoke-seg-c.png`)}, fileName: 'smoke-seg-c.png', name: null,
      workspaceFolder: ${JSON.stringify(WS_ROOT)}, subjectId: 'S002', timepoint: 'Pre-op', filmDate: null,
      addedAt: '2026-09-03T00:00:00.000Z', view: 'Standing lateral', thumbnail: null,
      measurements: { PI: 48.0, PT: 12.0, SS: 36.0, LL: { 'L1-S1': 44.0 } }, geometry: null, qc: null, clinical: {} },
    ...s.studies.filter((x) => !${JSON.stringify(INJECTED)}.includes(x.id)),
  ] })`);
  await cdp.settle(150);

  let pb = await button('export-paired');
  check('enabled over the library, Export paired CSV, no note', pb && pb.disabled === false && pb.title === '' && pb.text === 'Export paired CSV' && !(await has('[data-param-key="export-paired-note"]')), pb);
  await clickKey('select-SP-9101');
  pb = await button('export-paired');
  check('one film of a pair ticked: Export paired · 1 selected, disabled, its own note', pb.disabled === true && pb.text === 'Export paired \u00B7 1 selected' && pb.title === 'No paired subjects in these rows' && (await text('[data-param-key="export-paired-note"]')) === 'No paired subjects in these rows', pb);
  check('the long button is enabled beside it', (await button('export')).disabled === false);
  await clickKey('select-SP-9102');
  pb = await button('export-paired');
  check('its partner ticked: enabled, Export paired · 2 selected', pb.disabled === false && pb.text === 'Export paired \u00B7 2 selected' && !(await has('[data-param-key="export-paired-note"]')), pb);
  await cdp.setState('{ paramSelected: [] }');
  await cdp.settle(80);
  await choose('.param-select-workspace', '__hand__');
  await cdp.settle(80);
  pb = await button('export-paired');
  check('demos only: both disabled, the one note is the long button\'s', pb.disabled === true && pb.title === 'Demo studies are not exported' && (await text('[data-param-key="export-note"]')) === 'Demo studies are not exported' && !(await has('[data-param-key="export-paired-note"]')), pb);
  await choose('.param-select-workspace', '');
  await cdp.settle(80);
  const out = await cdp.evaluate(`Promise.all([import('./renderer/store.js'), import('./renderer/data/pairing.js'), import('./renderer/data/csv.js'), import('./renderer/data/parameters.js')]).then(([st, pr, csvm, pm]) => {
    const s = st.getState();
    const f = pm.normaliseFilters(s.paramFilters, s.studies);
    const rows = pm.rowsToExport(pm.sortParameters(pm.filterParameters(s.studies, f), s.paramSort), s.paramSelected);
    const p = pr.pairStudies(rows, { post: pr.postFromFilters(f) });
    return { header: csvm.toPairedCsv(p).split('\\r\\n')[3], row: csvm.toPairedCsv(p).split('\\r\\n')[4], message: pr.pairedExportMessage(p, 'X') };
  })`);
  check('the header starts with the layout-B identity columns', out.header.startsWith('Subject,Pre-op study,Post-op study,Pre-op view,Post-op view,Pre-op film date,Post-op film date,LL L1-S1 Pre-op,LL L1-S1 Post-op,Delta LL L1-S1 Post-op,'), out.header);
  check('the row is S001 with the deltas over the written values', out.row.startsWith('S001,SP-9101,SP-9102,Standing lateral,Standing lateral,2025-03-02,2025-09-14,60,45,-15,99.5,50,-49.5,'), out.row);
  check('the toast names the one subject written and the one unpaired', out.message === 'Exported 1 subject to X \u00B7 1 unpaired (S002)', out.message);
  check('no console errors or exceptions during the run', cdp.errors.length === 0, cdp.errors);
} finally {
  await cdp.setState(`(s) => ({ studies: s.studies.filter((x) => !${JSON.stringify(INJECTED)}.includes(x.id)), paramFilters: ${RESET_FILTERS}, paramSelected: [], studiesTab: 'find' })`).catch(() => {});
  cdp.close();
}
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${JSON.stringify(r.detail)}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
```

Expected: `9/9 checks passed`. Then `node tools/smoke/cdp.mjs --quit`. Paste the dry run's output into the report.

- [ ] **Step 6: Commit before the gate**

```bash
git add renderer/screens/parameters.js
git commit -F - <<'EOF'
feat: Export paired CSV on the Parameters filter bar (spec §10.4, §11.2, §11.3)

A second button beside Export CSV over the same rows (visible, or ticked visible): reads
`Export paired · N selected` with a selection; disabled with the long button's note when that
one is disabled, else with `No paired subjects in these rows`; the `with` label shapes the
file only while Paired only is ticked; the toast is §11.3's report. No new store key.

Manual verification: pending the human gate (7 checks) — outcomes recorded here by amendment
before Task 5 starts.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

- [ ] **Step 7: MANUAL VERIFICATION — the human gate**

Stop. The controller lists these seven checks in the chat message itself, with the launch lines, and ends the turn. Launch from source (the three PowerShell lines under Global Constraints), open Studies → Parameters on the real library:

1. **Demos only.** Set the Workspace filter to `Added by hand`. Both `Export CSV` and `Export paired CSV` are disabled, and one note after them reads `Demo studies are not exported`. Clear the filter.
2. **The file.** With paired subjects visible, `Export paired CSV` is enabled. Click it. The save dialog suggests `library-paired.csv` (or `<workspace>-paired.csv` with a Workspace filter set). Save it.
3. **In Excel.** The header reads `Subject`, `Pre-op study`, then the later visits' `study` columns, then views, then film dates, then per measurement `<M> Pre-op`, `<M> <label>`, `Delta <M> <label>`. One row per subject. Pick any Delta cell: it equals the cell two to its left subtracted from the cell one to its left. A subject missing a visit has blank cells in that visit's columns.
4. **The toast.** After saving, the toast reads `Exported N subjects to <path>` followed by the clauses that apply (`· M unpaired (…)`, `· K ambiguous (…)`, `· J films with no subject`, `· L films with no timepoint`), and stays several seconds — long enough to read.
5. **A selection.** Tick one film of a pair only: the paired button reads `Export paired · 1 selected` and is disabled, with `No paired subjects in these rows` beside it while `Export CSV` stays enabled. Tick its partner: `Export paired · 2 selected`, enabled.
6. **One visit.** Tick `Paired only` and choose a label in `with` (`6 wk` or `Post-op`). Export. The file has that visit's columns only; the toast adds `· P films of other visits not written (…)` when those subjects have films on other labels.
7. **Cancel.** Click `Export paired CSV` and cancel the save dialog: no toast.

Record every outcome in the commit body by amending (`git commit --amend`); a check not run is recorded as "not checked by the human" with what stands in for it (the dry run of Step 5 covers 1 and 5 and the file's first cells; nothing but the human reaches the dialog, Excel, the toast's duration or the cancel).

---

### Task 5: Smoke — the Parameters suite's paired-export section

**Files:**
- Modify: `tools/smoke/smoke-parameters.mjs` (the header comment; the constants after `WS_ROOT`; a new section 13 between section 12 and section 10)
- Modify: `tools/smoke/README.md` (the Parameters suite paragraph; the Known baseline paragraph)

**Interfaces:**
- Consumes: `connect()` from `tools/smoke/cdp-lib.mjs`; the `data-param-key` values `export`, `export-note`, `export-paired`, `export-paired-note`, `select-<id>`, `paired`, `subject` and the `.param-select-workspace` / `.param-select-paired-with` classes from Task 4 and the existing bar; the page's own `renderer/data/pairing.js`, `csv.js`, `parameters.js` and `store.js`.
- Produces: `smoke-parameters.mjs` at 57 checks, DOM-only.

Run every suite in the FOREGROUND with output captured to a file under `tools/smoke/out/`. A suite that prints nothing has thrown: re-run it bare and read the stack.

- [ ] **Step 1: The constants**

In `tools/smoke/smoke-parameters.mjs`:

1. Change the header comment's first sentence to end `… the export button's disabled state, the paired export's button and its file and toast text through the page's own modules, the tab and sort surviving a trip to Analysis and back, and a deleted study's tick being pruned from the selection.`
2. Replace the line `const RESET = '{ query: "", studiesTab: "find", paramFilters: { … }, paramSort: { key: "study", dir: "asc" }, paramLevels: false, paramSelected: [] }';` with:

```js
const RESET_FILTERS = '{ workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, subject: "", pairedOnly: false, pairedWith: "__any__" }';
const RESET = `{ query: "", studiesTab: "find", paramFilters: ${RESET_FILTERS}, paramSort: { key: "study", dir: "asc" }, paramLevels: false, paramSelected: [] }`;

// The paired file over the injected records under All paired (spec §11.2): S001 is the only real
// pair (the demo pair is never written; S002 is unpaired), so the one visit is Post-op. SP-9101
// (PI 99.5, PT 30, SS 69.5, L1PA 12, LL 60) against SP-9102 (PI 50, PT 15, SS 35, LL 45): PI-LL is
// 39.5 then 5; every delta is post minus pre over those one-decimal values; L1PA and the four
// levels are absent on one or both films, so their cells and deltas are empty. Built from arrays
// so the empty cells are counted, not eyeballed.
const PAIRED_MEASURES = ['LL L1-S1', 'PI', 'PT', 'SS', 'PI-LL Mismatch', 'L1PA', 'LL L2-S1', 'LL L3-S1', 'LL L4-S1', 'LL L5-S1'];
const PAIRED_HEADER = ['Subject', 'Pre-op study', 'Post-op study', 'Pre-op view', 'Post-op view', 'Pre-op film date', 'Post-op film date',
  ...PAIRED_MEASURES.flatMap((m) => [`${m} Pre-op`, `${m} Post-op`, `Delta ${m} Post-op`])].join(',');
const PAIRED_ROW = ['S001', 'SP-9101', 'SP-9102', 'Standing lateral', 'Standing lateral', '2025-03-02', '2025-09-14',
  '60', '45', '-15', '99.5', '50', '-49.5', '30', '15', '-15', '69.5', '35', '-34.5', '39.5', '5', '-34.5', '12', '', '',
  ...Array(12).fill('')].join(',');
```

- [ ] **Step 2: Section 13**

Insert the following between the end of section 12 (the line `await cdp.setState('{ paramSort: { key: "PI", dir: "desc" } }');` followed by `await cdp.settle(80);`) and the `// 10. Deleting a ticked study prunes its tick.` comment:

```js
  // 13. The paired export (spec §10.4, §11.2, §11.3): the button's labels and reasons, and the file
  // and toast text through the page's own modules. The save dialog is the human's. S001 (SP-9101
  // Pre-op, SP-9102 Post-op) is the only real pair; the demo pair is never written; S002 is unpaired.
  await cdp.setState(`{ paramFilters: ${RESET_FILTERS}, paramSort: { key: "study", dir: "asc" }, paramSelected: [] }`);
  await cdp.settle(80);
  const pairedButton = () => cdp.evaluate("(() => { const b = document.querySelector('[data-param-key=\"export-paired\"]'); return b ? { disabled: b.disabled, title: b.title, text: b.textContent } : null; })()");
  const longDisabled = () => cdp.evaluate("document.querySelector('[data-param-key=\"export\"]').disabled");
  let pb = await pairedButton();
  check('the paired button is enabled over the library with the real pair visible and reads Export paired CSV',
    pb !== null && pb.disabled === false && pb.title === '' && pb.text === 'Export paired CSV' && !(await has('[data-param-key="export-paired-note"]')), pb);

  await clickKey('select-SP-9101');
  pb = await pairedButton();
  const pairedNoteOne = await text('[data-param-key="export-paired-note"]');
  check('ticking one film of a pair reads Export paired · 1 selected, disabled, with the no-paired-subjects note',
    pb.disabled === true && pb.text === 'Export paired \u00B7 1 selected' && pb.title === 'No paired subjects in these rows' && pairedNoteOne === 'No paired subjects in these rows', { pb, pairedNoteOne });
  check('the long button stays enabled beside it', (await longDisabled()) === false);

  await clickKey('select-SP-9102');
  pb = await pairedButton();
  check('ticking its partner enables the paired button and reads Export paired · 2 selected',
    pb.disabled === false && pb.text === 'Export paired \u00B7 2 selected' && !(await has('[data-param-key="export-paired-note"]')), pb);
  await cdp.setState('{ paramSelected: [] }');
  await cdp.settle(80);

  await cdp.evaluate("(() => { const e = document.querySelector('[data-param-key=\"subject\"]'); e.value = 'S002'; e.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await cdp.settle(120);
  pb = await pairedButton();
  const s002Rows = await rowIds();
  check('with only S002 visible the paired button is disabled with its own note and the long button is enabled',
    JSON.stringify(s002Rows) === JSON.stringify(['SP-9103']) && pb.disabled === true && (await text('[data-param-key="export-paired-note"]')) === 'No paired subjects in these rows' && (await longDisabled()) === false, { s002Rows, pb });
  await cdp.evaluate("(() => { const e = document.querySelector('[data-param-key=\"subject\"]'); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await cdp.settle(80);

  await choose('.param-select-workspace', '__hand__');
  await cdp.settle(80);
  pb = await pairedButton();
  check('with only demos visible both buttons are disabled and the one note is the long button\'s',
    pb.disabled === true && pb.title === 'Demo studies are not exported' && (await text('[data-param-key="export-note"]')) === 'Demo studies are not exported' && !(await has('[data-param-key="export-paired-note"]')), pb);
  await choose('.param-select-workspace', '');
  await cdp.settle(80);

  await clickKey('paired');
  await choose('.param-select-paired-with', 'Post-op');
  await cdp.settle(80);
  const singlePairing = await cdp.evaluate(`Promise.all([import('./renderer/store.js'), import('./renderer/data/pairing.js'), import('./renderer/data/parameters.js')]).then(([st, pr, pm]) => {
    const s = st.getState();
    const f = pm.normaliseFilters(s.paramFilters, s.studies);
    const rows = pm.rowsToExport(pm.sortParameters(pm.filterParameters(s.studies, f), s.paramSort), s.paramSelected);
    const p = pr.pairStudies(rows, { post: pr.postFromFilters(f) });
    return { post: p.post, visits: p.visits, subjects: p.subjects.map((x) => x.subject) };
  })`);
  pb = await pairedButton();
  check('Paired only with Post-op collapses the pairing to that one visit and keeps the button enabled',
    singlePairing.post === 'Post-op' && JSON.stringify(singlePairing.visits) === JSON.stringify(['Post-op']) && JSON.stringify(singlePairing.subjects) === JSON.stringify(['S001']) && pb.disabled === false, { singlePairing, pb });
  await choose('.param-select-paired-with', '__any__');
  await cdp.settle(80);
  await clickKey('paired');

  const paired = await cdp.evaluate(`Promise.all([import('./renderer/store.js'), import('./renderer/data/pairing.js'), import('./renderer/data/csv.js'), import('./renderer/data/parameters.js')]).then(([st, pr, csvm, pm]) => {
    const s = st.getState();
    const f = pm.normaliseFilters(s.paramFilters, s.studies);
    const rows = pm.rowsToExport(pm.sortParameters(pm.filterParameters(s.studies, f), s.paramSort), s.paramSelected);
    const p = pr.pairStudies(rows, { post: pr.postFromFilters(f) });
    return { lines: csvm.toPairedCsv(p).split('\\r\\n'), message: pr.pairedExportMessage(p, 'X') };
  })`);
  check('the paired file\'s header is layout B over the one visit present, Post-op', paired.lines[3] === PAIRED_HEADER, paired.lines[3]);
  check('its one row is S001 with both films, the deltas over the written values, and empty cells where a value is absent', paired.lines[4] === PAIRED_ROW, paired.lines[4]);
  check('the file ends after that row', paired.lines.length === 6 && paired.lines[5] === '', paired.lines.length);
  check('the toast names the one subject written and the one unpaired', paired.message === 'Exported 1 subject to X \u00B7 1 unpaired (S002)', paired.message);
  await cdp.setState('{ paramSort: { key: "PI", dir: "desc" } }');
  await cdp.settle(80);
```

- [ ] **Step 3: Run the suite**

```
node tools/smoke/launch.mjs > tools/smoke/out/task5-launch.txt 2>&1
node tools/smoke/smoke-parameters.mjs > tools/smoke/out/task5-smoke-parameters.txt 2>&1
node tools/smoke/cdp.mjs --quit
```

Expected: `57/57 checks passed`. If a check fails, read its detail in the file; if the file is empty the suite threw — re-run it bare. Never re-run on an instance where a suite was killed mid-run.

- [ ] **Step 4: The smoke README**

In `tools/smoke/README.md`:

1. In `## Running the Parameters suite`, change `the export button's disabled state, and ticking rows to export a chosen subset, and the tab and sort surviving a trip to Analysis.` to `the export button's disabled state, ticking rows to export a chosen subset, the paired export's button states and its file and toast text through the page's own \`pairStudies\` and \`toPairedCsv\` (2026-09-08; the save dialog is the human's), and the tab and sort surviving a trip to Analysis.`
2. Change `Baseline: 46/46 (2026-09-07: the study columns, the timepoint, view, subject and paired-only filters, and the subject sort).` to `Baseline: 57/57 (2026-09-07: the study columns, the timepoint, view, subject and paired-only filters, and the subject sort; 2026-09-08: the paired export).`
3. In the `**Known baseline**` paragraph under the plan-06 suite, change `` `smoke-parameters.mjs` 46/46 `` to `` `smoke-parameters.mjs` 57/57 ``.

- [ ] **Step 5: Commit**

```bash
git add tools/smoke/smoke-parameters.mjs tools/smoke/README.md
git commit -m "test: smoke-parameters covers the paired export's button and file (57 checks)"
```

---

### Task 6: Records — contract, handoff, README, spec §15

**Files:**
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` (module list; `test/` listing; `data/csv.js` block)
- Modify: `docs/superpowers/HANDOFF.md` (header; "Where things stand"; decisions 48–50; a trap if execution found one)
- Modify: `README.md` (Parameters tab section)
- Modify: `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` (§15 item 4)

`CLAUDE.md`'s branch paragraph and `docs/superpowers/NEXT-SESSION.md` are the session wrap's, not this task's (the previous plans' ruling). `docs/ROADMAP.md` changes only if the ledger deferred something to it. Fill the verification figures from the reports of Tasks 1–5 (unit count, `smoke-parameters.mjs` 57/57, the gate's outcomes).

- [ ] **Step 1: Contract**

1. In the module list, after the two `data/parameters.js` lines, add:
   ```
     data/pairing.js                 (2026-09-08) pure: pairStudies(rows, {post}) → {visits, post, subjects: [{key, subject, films: Map}],
                                     unpaired, ambiguous, noSubject, noTimepoint, otherVisits} for the paired export (spec §11.2);
                                     postFromFilters(filters); pairedExportMessage(pairing, savedTo) (§11.3)
   ```
2. Change the `components/toast.js` line to:
   ```
     components/toast.js             showToast(message), render(state); toastDuration(text) (2026-09-08): 2.2 s to forty characters,
                                     then 40 ms per character, capped at 8 s, for every toast
   ```
3. Change the `data/csv.js` line to `  data/csv.js                     parse, auto-map, export; toPairedCsv and delta1 (2026-09-08)`.
4. Append to the second `data/parameters.js` line: `; exportFileName(workspace, kind = 'parameters') (2026-09-08)`.
5. Append to the `screens/parameters.js` block's last line: `; the paired export button and its note (2026-09-08, spec §10.4)`.
6. In the `test/` listing, change `csv.test.js  measurements.test.js  persistence.test.js` to `csv.test.js  measurements.test.js  persistence.test.js  pairing.test.js  toast.test.js`.
7. In the `data/csv.js` block, after the `toCsv` lines, add:
   ```js
   export function toPairedCsv(pairing)     // → string   (2026-09-08, spec §11.2) the wide file from data/pairing.js's pairStudies:
                                            //   citation block; layout-B header (`<label> study`, view, film date per visit, then per
                                            //   measurement `<M> Pre-op`, `<M> <label>`, `Delta <M> <label>` per later visit, then
                                            //   `<F> <label>` per clinical key on the written films); one row per subject. Demo rows
                                            //   never reach it; headers use the stored label and ASCII `Delta`
   export function delta1(pre, post)        // → number|''   post minus pre over the one-decimal forms of each, to one decimal; ''
                                            //   when either is not finite. Comparison mode (plan 07) applies the same rule
   ```

- [ ] **Step 2: Handoff**

In `docs/superpowers/HANDOFF.md`:

1. Header: change `**This copy is on:**` to `` `claude/preop-postop-paired-export` (task 4 of the pre-op/post-op spec, the paired export, code and docs; branched 2026-09-08 off the studies tip `adf3c19`; merge back is the user's call) `` and keep the worktree path.
2. Under `## Where things stand`, insert BEFORE `### Study fields — task 2 …`:

```markdown
### Paired export — task 4 of the pre-op/post-op spec, DONE (branch `claude/preop-postop-paired-export`)

Spec §10.4, §11.2, §11.3 as laid out at the 2026-09-08 brainstorm (decisions 47–50). Plan
`docs/superpowers/plans/2026-09-08-paired-export.md` (Tasks 1–6, its `## Ledger` at the end). Commits:
`git log --oneline adf3c19..HEAD`.

- `renderer/data/pairing.js` (pure): `pairStudies(rows, {post})` drops demo rows, groups by subject key, judges each
  subject (unpaired first — no Pre-op film or no film on a candidate visit — then ambiguous — two films on any label
  the file writes), and returns the visits with columns (candidates a written subject carries), one entry per written
  subject (`films` a Map by label, Pre-op first) and the §11.3 counts; `postFromFilters` reads the `with` label only
  while Paired only is ticked; `pairedExportMessage` builds the toast, five names per clause then `…`.
- `toPairedCsv(pairing)` in `renderer/data/csv.js` writes layout B (measurement-major): `<label> study`, `<label> view`,
  `<label> film date` per visit, then per measurement `<M> Pre-op`, `<M> <label>`, `Delta <M> <label>`, then `<F> <label>`
  per clinical key over the written films. `delta1(pre, post)` is post minus pre over the one-decimal values, empty
  when either is absent, exported for plan 07.
- `Export paired CSV` sits beside `Export CSV` on the Parameters filter bar over the same rows (visible, or ticked
  visible); reads `Export paired · N selected`; disabled with the long button's note when that one is disabled, else
  with its own `No paired subjects in these rows`; suggested name `<workspace>-paired.csv` / `library-paired.csv`.
- `toastDuration(text)` in `components/toast.js`: 2.2 s to forty characters, then 40 ms per character, capped at 8 s;
  every toast, the workspace load message included.
- Verified: unit <N>/<N>; `smoke-parameters.mjs` 57/57; Task 4's human gate (outcomes in its commit body).
```

3. After decision 47, append:

```markdown
48. **The paired file is layout B, measurement-major** (2026-09-08, chosen from two worked tables): identity columns
    (`<label> study`, view, film date) per visit first, then each parameter's trajectory — `<M> Pre-op`, then `<M> <label>`
    and `Delta <M> <label>` per later visit — contiguous, then clinical keys per visit. Headers use the stored label and
    ASCII `Delta` (the file's `PI-LL Mismatch` precedent); a delta is computed over the two one-decimal values written.
    *Cost if wrong:* a reader who wants one visit's block contiguous scrolls; a column reorder in `toPairedCsv`.
49. **A subject with two films on any label the file writes is ambiguous and gets no row** (2026-09-08), named in the
    toast with the label and count; unpaired is judged first; under a single label only Pre-op and that label are
    checked. *Cost if wrong:* a retake at one visit hides the subject from the wide file until one film is relabelled.
50. **The toast's duration scales with its length** (2026-09-08): 2.2 s to forty characters, then 40 ms per character,
    capped at 8 s, for every toast. *Cost if wrong:* long toasts linger; nothing dismisses one early.
```

4. Under `## Known traps`, add a bullet only for a trap execution actually hit (the ledger says); otherwise add nothing.

- [ ] **Step 3: README**

In `README.md`, `## Parameters tab`, after the bullet that begins `- The file has three \`#\` comment lines`, add:

```markdown
- **Export paired CSV** writes one row per subject over the same rows: `Subject`, then `<label> study`, `<label> view`
  and `<label> film date` per visit (`Pre-op` first, then every later timepoint present — Intra-op, Post-op, then
  durations by length, then other labels), then for each measurement `<M> Pre-op`, `<M> <label>` and `Delta <M> <label>`
  (the later value minus the Pre-op value over the values as written; empty when either is absent), then each clinical
  field per visit. A subject needs exactly one Pre-op film and one film per later visit it has; a subject with two films
  on one visit is left out and named in the message, as are subjects with no pair, films with no subject and films with
  no timepoint. With **Paired only** ticked and a label chosen in `with`, the file has that visit only and the message
  counts the films of other visits it left out. Suggested name `<workspace>-paired.csv`.
```

- [ ] **Step 4: Spec §15**

In the spec, change `4. **Paired export** (§11.2, §11.3).` to `4. **Paired export** (§11.2, §11.3) — DONE (plan \`2026-09-08-paired-export.md\`, branch \`claude/preop-postop-paired-export\`).`

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-08-31-00-architecture-contract.md docs/superpowers/HANDOFF.md README.md docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md
git commit -m "docs: record the paired export in the contract, handoff, spec and README"
```

---

## Self-review against the spec

- **§10.4** — the second button, `Export paired · N selected`, `<workspace>-paired.csv` / `library-paired.csv`, the third reason and the shared note: Task 4 (Task 2's `exportFileName` kind; Task 5 asserts every state).
- **§11.2 Input** — the same rows as the long export; demo rows dropped; candidates in §7.2 order; the single label under Paired only; a disabled `with` ignored: Task 1 (`pairStudies`, `postFromFilters`), wired in Task 4.
- **§11.2 Rows** — exactly one Pre-op and one film per written label; unpaired first; ambiguous on any written label; first-appearance order; an unsegmented film writes empty cells: Task 1 (judging) and Task 2 (`toPairedCsv`'s empty cells, tested).
- **§11.2 Columns** — layout B, stored labels, ASCII `Delta`, delta over the written one-decimal values, all ten measurements, clinical per visit over the written films, the empty-group rule: Task 2 (`toPairedCsv`, `delta1`) and Task 1 (`visits`).
- **§11.3** — `Exported N subjects to <path>` and the five clauses, five names then `…`, cancelled dialog toasts nothing, the toast's duration: Task 1 (`pairedExportMessage`), Task 4 (the handler), Task 3 (`toastDuration`).
- **§14** — `data/pairing.js`, the `toPairedCsv` cases, `components/toast.js`: Tasks 1–3; the smoke paragraph: Task 5; the human steps: Task 4's gate.
- **§18** — the contract amendments: Task 6.
- **Placeholders:** none — every step carries its code. **Types:** `Pairing.subjects[].films` is a `Map` in Task 1, read with `.get`/`.has` in Task 2 and the smoke evaluate; `postFromFilters` returns a string consumed as `post`; `exportFileName(workspace, 'paired')` in Task 4 matches Task 2's signature; `TOAST_MIN_MS`/`TOAST_MAX_MS` are exported in Task 3 and imported in its test.

## Ledger

This section travels with the repo. Append a session-end line at every wrap; record every decision
made in chat as `Ruling: <what> — <why> — <cost if wrong>`.

Session 2026-09-08 (brainstorm and planning): the studies tip had not moved (`adf3c19`); branch
`claude/preop-postop-paired-export` created off it. Brainstorm against spec §11.2–§11.3 with three
user decisions — layout B over visit-major (from two worked tables), ambiguous drops the row rather than
blanking a group, the toast wording and length-scaled duration as shown — written into the spec (§10.4,
§11.2, §11.3, §14, §18, decision 8's note; commit `651d72b`) and recorded as HANDOFF decisions 48–50 by
Task 6. Planner rulings are in "Rulings made while planning" above. Execution method: subagent-driven,
a fresh subagent per task with two-stage review; Sonnet for Tasks 1, 2, 3, 5, 6, Opus for Task 4; never
Fable. Task 4 commits before its human gate with a pending line and is amended after; the ledger stays
uncommitted during the gate; every suite in the foreground with output captured to a file.
