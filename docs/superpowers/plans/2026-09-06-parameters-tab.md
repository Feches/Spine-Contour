# Parameters Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second tab on the Studies screen that shows every segmented film's measurements in one grid, filterable by workspace, folder and segmentation state, sortable, and exportable as one long-format CSV of whatever the filters show.

**Architecture:** All deciding (columns, values, filters, sort, empty-state reason, filename) lives in a new pure module `renderer/data/parameters.js` with `node --test` coverage. A new DOM module `renderer/screens/parameters.js` renders what that module decides and writes only to the store. `renderer/screens/studies.js` gains the tab strip and mounts the panel beside its existing list. `toCsv` stops taking a field list and exports the union of clinical keys present on the exported rows.

**Tech Stack:** Vanilla ES modules, no bundler, no runtime dependencies. `node --test` for pure logic. The CDP smoke harness in `tools/smoke/` for DOM behaviour. Electron 44 / Chromium 152.

**Spec:** `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` — this plan is **task 1 of its §15 sequencing**: §10 (the tab, grid, filters, sort, export) and §11.1 (long export with the union rule), with nothing from §7–§9 (no new record fields) and none of §10.3's subject, timepoint, view or paired-only filters. Read the spec's §5 (what exists today), §6 decisions 7–9, §10, §11.1, §11.3, §14 and §16 before starting.

## Global Constraints

Copied from `CLAUDE.md` and the spec. Every task's requirements include these.

- **Never display a fabricated measurement.** Absent values render `—` (U+2014), never `0`, never `N/A`. In a CSV an absent value is an empty cell.
- **Never label a value with a name it isn't.** The grid's column labels are the measurement panel's names; `PI–LL` is `PI − LL['L1-S1']`.
- **Never mutate store state in place.** Every `setState` patch passes a NEW object or array. The Studies screen's gates and the router compare by reference (`renderer/router.js` header comment).
- **`setState` must not be called from inside a subscriber.** The Studies screen's `update()` runs inside a store notification; only DOM event handlers call `setState`.
- **No bundler, no framework, no runtime dependencies.** `dependencies` stays empty; `devDependencies` stays exactly `electron` and `electron-builder`.
- **Do not loosen the CSP** in `index.html`. No new stylesheet link is needed: the new styles append to `styles/screens/studies.css`.
- **Both electron-builder allowlists already cover `renderer/**/*` and `styles/**/*`.** No allowlist change; do not touch `package.json` `build.files` or `electron-builder.preview.yml`.
- **Unit tests run as `node --test test/*.test.js`** (the glob form; the directory form fails on Node 24). Baseline before this plan: 293/293.
- **Pure-logic modules get real `node --test` coverage. DOM code gets explicit manual verification and smoke checks** — say so plainly; never write a fake test.
- **Smoke selectors key on `data-` attributes, never on a visible label** (HANDOFF "Known traps"). A smoke suite that prints nothing has thrown — re-run it bare and read the stack.
- **`el()` assigns to the property when the key exists on the node**, so pass real booleans (`checked: true`, `disabled: false`), never `'false'`.
- **Conventional commit prefixes** (`feat:`, `fix:`, `test:`, `docs:`, `chore:`); commit after every task; every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Branch:** work on `claude/preop-postop-xray-org-2c4d80` in the worktree `C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628`. Push only to `fork`, never `origin`; never merge to `main`.
- **Running the app from source** (three lines, from PowerShell; the shell starts in `C:\Users\codyj`):

  ```
  Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628"
  $env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"
  npm.cmd run dev
  ```

  If `node_modules\electron\dist` is missing in this worktree, `npm install` will NOT fetch it (this machine blocks install scripts): copy `node_modules\electron\dist` and `node_modules\electron\path.txt` from `..\studies-ui-updates-bb040d\node_modules\electron\`.

## File structure

| File | Responsibility | Status |
|---|---|---|
| `renderer/data/csv.js` | `toCsv(studies, opts)` — union-of-clinical-keys rule | modify |
| `renderer/data/labels.js` | export `lastSegment` (already defined, module-private) | modify |
| `renderer/data/parameters.js` | pure: columns, values, formatting, filter options, filter, sort, empty reason, export filename | create |
| `renderer/store.js` | four new keys: `studiesTab`, `paramFilters`, `paramSort`, `paramLevels` | modify |
| `renderer/screens/parameters.js` | DOM: filter bar, grid, sort headers, export button; `mountParameters(host, {onOpen}) → {update(live, queried)}` | create |
| `renderer/screens/studies.js` | tab strip, two tab panels, mounts the parameters panel, shares the search result | modify |
| `renderer/screens/analysis.js` | one call site of `toCsv` | modify |
| `styles/screens/studies.css` | tab strip, panels, filter bar, grid | modify |
| `test/csv.test.js`, `test/labels.test.js`, `test/store.test.js` | existing suites updated | modify |
| `test/parameters.test.js` | the pure module's suite | create |
| `tools/smoke/smoke-parameters.mjs` | DOM smoke over the demo library | create |
| `tools/smoke/README.md`, `docs/superpowers/plans/2026-08-31-00-architecture-contract.md`, `docs/ROADMAP.md`, `docs/superpowers/HANDOFF.md`, the spec | records | modify |

Two boundaries are deliberate. `renderer/data/parameters.js` never imports from `renderer/screens/` (the contract's layering: data and components never import from screens), so the Studies screen applies `matchesQuery` itself and hands the panel the already-searched list. And `renderer/screens/parameters.js` never imports `renderer/screens/studies.js`; the screen passes `openStudy` in as `onOpen`, which keeps the import graph acyclic.

One departure from the spec's wording, recorded here and in Task 8's docs: §10.3 lists "sort by study id". The grid has no id column (the id sits on the study name's tooltip, as on the Find list), so the STUDY header sorts by name and there is no separate id sort. The search box on the Studies header applies to the grid as well as the list — filters compose with it — because a visible control that does nothing on one tab reads as broken.

---

### Task 1: `toCsv` exports the union of clinical keys

**Files:**
- Modify: `renderer/data/csv.js:45-70`
- Modify: `renderer/screens/analysis.js:470`
- Modify: `test/csv.test.js`
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md:552`

**Interfaces:**
- Consumes: `clinicalFieldNames(studies)` (already exported from `csv.js`, defined below `toCsv` — a function declaration, so hoisted).
- Produces: `toCsv(studies, opts = {}) → string`. The `fields` parameter is gone. Clinical columns are `clinicalFieldNames(rows)` over the rows that survive the demo filter. Task 6 calls this with the grid's visible rows.

- [ ] **Step 1: Rewrite the existing clinical-field test and add the union tests**

In `test/csv.test.js`, replace the test `'toCsv appends one column per clinical field and quotes fields containing commas'` (lines 64–72) with these three:

```js
test('toCsv writes every clinical field present on the exported studies, KNOWN_FIELDS order first, then custom', () => {
  const csv = toCsv([
    study({ id: 'SP-1000', clinical: { Zeta: 'z', Age: '58' } }),
    study({ id: 'SP-1001', clinical: { Diagnosis: 'Spondylolisthesis, grade 2' } }),
  ], {});
  const lines = csv.split('\r\n');
  const header = lines[3].split(',');
  // Study ID, Source, View, ten measurement columns, then the union: known fields in
  // KNOWN_FIELDS order, then custom names in first-seen order.
  assert.deepEqual(header.slice(13), ['Age', 'Diagnosis', 'Zeta']);
  const row1000 = lines[4];
  const row1001 = lines[5];
  assert.ok(row1000.startsWith('SP-1000'));
  assert.ok(row1000.endsWith(',58,,z'));
  assert.ok(row1001.startsWith('SP-1001'));
  assert.ok(row1001.endsWith(',,"Spondylolisthesis, grade 2",'));
});

test('toCsv writes no clinical columns when no exported study carries a value', () => {
  const csv = toCsv([study({ clinical: {} }), study({ id: 'SP-1001' })], {});
  const header = csv.split('\r\n')[3].split(',');
  assert.equal(header.length, 13);
  assert.equal(header[12], 'LL L5-S1');
});

test("toCsv ignores an excluded demo study's clinical keys when choosing the columns", () => {
  const csv = toCsv([
    study({ id: 'SP-1000', clinical: { Age: '58' } }),
    study({ id: 'SP-0042', source: 'demo', clinical: { Notes: 'demo only' } }),
  ], {});
  const header = csv.split('\r\n')[3].split(',');
  assert.deepEqual(header.slice(13), ['Age']);
  assert.ok(!csv.includes('demo only'));
});
```

Then drop the old second argument from every remaining call in the file:

```bash
sed -i 's/, \[\], {})/, {})/g' test/csv.test.js
```

Check nothing else still passes an array: `grep -n "toCsv(" test/csv.test.js` must show only two-argument calls (`studies, {}` or `studies, { includeDemo: true }`).

- [ ] **Step 2: Run the CSV suite to see the new tests fail**

Run: `node --test test/csv.test.js`
Expected: the three new tests FAIL (the current `toCsv` treats `{}` as the field list and writes no clinical columns, so `header.slice(13)` is `[]`); every other test in the file passes because `toCsv(x, {})` with the old signature ignores the third argument.

- [ ] **Step 3: Change `toCsv`**

In `renderer/data/csv.js`, replace the `toCsv` function (from `export function toCsv(studies, fields, opts = {}) {` through its closing `}`) with:

```js
export function toCsv(studies, opts = {}) {
  const includeDemo = opts.includeDemo === true;
  const rows = studies.filter((study) => includeDemo || study.source !== 'demo');

  // Every clinical key present on the exported rows, KNOWN_FIELDS order then custom -- NOT the
  // session's visible field list. A column hidden in the drawer for the session used to vanish
  // from the file with nothing in the file to say so (roadmap item 1); now the file carries every
  // stored value, and a reader can tell an absent value from a hidden column because there are
  // no hidden columns. Computed over `rows`, after the demo filter, so an excluded demo study
  // cannot add a column.
  const fields = clinicalFieldNames(rows);

  const citation = [
    '# Spine Contour export',
    '# Created by Cody Woodhouse, MD; Michael Jayasuriya, BS.',
    '# Investigational software. NOT FOR CLINICAL USE.',
  ];
  const header = ['Study ID', 'Source', 'View', ...MEASUREMENT_COLUMNS, ...fields];

  const lines = [...citation, header.map(escapeField).join(',')];
  for (const study of rows) {
    const cells = [
      study.id,
      study.source,
      study.view,
      ...MEASUREMENT_COLUMNS.map((column) => measurementValue(study, column)),
      ...fields.map((field) => (study.clinical && study.clinical[field] != null ? study.clinical[field] : '')),
    ];
    lines.push(cells.map(escapeField).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}
```

- [ ] **Step 4: Update the one caller**

In `renderer/screens/analysis.js`, line 470, change

```js
    const csv = toCsv(live.studies.filter((s) => s.id === live.openId), live.fields, {});
```

to

```js
    const csv = toCsv(live.studies.filter((s) => s.id === live.openId), {});
```

`live.fields` has no other use in that function; leave the rest of `exportCsv` alone.

- [ ] **Step 5: Run the whole unit suite**

Run: `node --test test/*.test.js`
Expected: all pass; the total is 295 (293 + 3 new − 1 replaced).

- [ ] **Step 6: Record the signature in the contract**

In `docs/superpowers/plans/2026-08-31-00-architecture-contract.md`, in the `### renderer/data/csv.js` block, change

```js
export function toCsv(studies, fields, opts)   // → string
```

to

```js
export function toCsv(studies, opts)     // → string   (2026-09-06) clinical columns are clinicalFieldNames() over the
                                         //   exported rows -- the `fields` parameter is gone; see the pre-op/post-op spec §11.1
```

- [ ] **Step 7: Commit**

```bash
git add renderer/data/csv.js renderer/screens/analysis.js test/csv.test.js docs/superpowers/plans/2026-08-31-00-architecture-contract.md
git commit -m "feat: export every clinical field present on the exported studies

toCsv no longer takes the session's visible field list; a column hidden in the drawer
used to vanish from the file with nothing to say so (roadmap item 1).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The pure module `renderer/data/parameters.js`

**Files:**
- Modify: `renderer/data/labels.js:33-36` (export `lastSegment`)
- Create: `renderer/data/parameters.js`
- Create: `test/parameters.test.js`
- Modify: `test/labels.test.js`

**Interfaces:**
- Consumes: `sagittalRows(measurements, opts)`, `lordosisRows(measurements)` from `data/measurements.js` (row objects `{key, label, value, unit, absent, highlight}`); `studyName`, `workspaceLabel`, `folderLabel`, `lastSegment` from `data/labels.js`.
- Produces (all pure, all used by Tasks 4–6):

  ```js
  export const HAND_ADDED = '__hand__';                       // workspace filter value meaning "no workspaceFolder"
  export const DEFAULT_FILTERS = { workspace: null, folder: null, segmentedOnly: true };   // frozen
  export const DEFAULT_SORT = { key: 'study', dir: 'asc' };  // frozen
  export const CORE_COLUMNS   // [{key:'PI',label:'PI'},{key:'PT',…},{key:'SS',…},{key:'LL',label:'LL L1–S1'},{key:'PILL',label:'PI–LL'},{key:'L1PA',label:'L1PA'}]
  export const LEVEL_COLUMNS  // [{key:'L2-S1',label:'LL L2–S1'},…,{key:'L5-S1',label:'LL L5–S1'}]
  export function measurementColumns(showLevels)          // → CORE_COLUMNS, or CORE_COLUMNS + LEVEL_COLUMNS
  export function parameterValues(study)                  // → {PI, PT, SS, LL, PILL, L1PA, 'L2-S1', …} each number|null
  export function formatParameter(value)                  // → '—' | '47.1°'
  export function isSegmented(study)                      // → boolean   measurements != null
  export function workspaceOptions(studies)               // → [{value, label}]  roots first-seen, then HAND_ADDED if any study lacks one
  export function folderOptions(studies, workspace)       // → [{value, label}]  distinct folderLabel within the workspace filter
  export function normaliseFilters(filters, studies)      // → filters with a stale workspace/folder cleared
  export function filterParameters(studies, filters)      // → Study[]
  export function hiddenUnsegmented(studies, filters)     // → number
  export function sortParameters(studies, sort)           // → Study[]  new array; absent last in both directions; stable
  export function emptyReason({total, visible, filters, query})   // → null | 'none' | 'unsegmented' | 'filtered'
  export function exportFileName(workspace)               // → 'library-parameters.csv' | '<root last segment>-parameters.csv'
  ```

- [ ] **Step 1: Export `lastSegment` and pin it**

In `renderer/data/labels.js`, change `function lastSegment(path) {` to `export function lastSegment(path) {`. Update its comment's first line to read:

```js
// The last segment of a path, either separator, with trailing separators ignored. Exported for
// data/parameters.js, which labels a workspace root the same way workspaceLabel labels a study.
```

In `test/labels.test.js`, add `lastSegment` to the import and append:

```js
test('lastSegment reads the final path segment under either separator and ignores trailing separators', () => {
  assert.equal(lastSegment('C:\\Studies\\CohortA\\'), 'CohortA');
  assert.equal(lastSegment('/data/films/Fusion2025'), 'Fusion2025');
  assert.equal(lastSegment('Fusion2025'), 'Fusion2025');
  assert.equal(lastSegment(''), '');
});
```

Run: `node --test test/labels.test.js` — Expected: PASS.

- [ ] **Step 2: Write the failing tests for the pure module**

Create `test/parameters.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HAND_ADDED, DEFAULT_FILTERS, DEFAULT_SORT, CORE_COLUMNS, LEVEL_COLUMNS, measurementColumns,
  parameterValues, formatParameter, isSegmented, workspaceOptions, folderOptions, normaliseFilters,
  filterParameters, hiddenUnsegmented, sortParameters, emptyReason, exportFileName,
} from '../renderer/data/parameters.js';

const DASH = '\u2014';
const ROOT = 'C:\\films\\Fusion2025';

function measurements(PI, PT, SS, LL, extra = {}) {
  return { PI, PT, SS, LL: { 'L1-S1': LL, ...(extra.LL ?? {}) }, ...(extra.L1PA != null ? { L1PA: extra.L1PA } : {}) };
}

function study(overrides) {
  return {
    id: 'SP-1000', source: 'real', filePath: `${ROOT}\\pre-op\\a.png`, fileName: 'a.png', name: null,
    workspaceFolder: ROOT, addedAt: '2026-09-01T00:00:00.000Z', view: 'Standing lateral', thumbnail: null,
    measurements: null, geometry: null, qc: null, clinical: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// columns and values
// ---------------------------------------------------------------------------

test('measurementColumns is the six core columns, or ten with the lordosis levels', () => {
  assert.deepEqual(CORE_COLUMNS.map((c) => c.key), ['PI', 'PT', 'SS', 'LL', 'PILL', 'L1PA']);
  assert.deepEqual(LEVEL_COLUMNS.map((c) => c.key), ['L2-S1', 'L3-S1', 'L4-S1', 'L5-S1']);
  assert.deepEqual(measurementColumns(false), CORE_COLUMNS);
  assert.deepEqual(measurementColumns(true), [...CORE_COLUMNS, ...LEVEL_COLUMNS]);
  // The labels are the measurement panel's names; PI–LL is a derived value and says so.
  assert.equal(CORE_COLUMNS.find((c) => c.key === 'LL').label, 'LL L1\u2013S1');
  assert.equal(CORE_COLUMNS.find((c) => c.key === 'PILL').label, 'PI\u2013LL');
});

test('parameterValues reads every column from the record, deriving PI-LL, and nulls what is absent', () => {
  const values = parameterValues(study({
    measurements: measurements(52.7, 14.6, 38.2, 47.1, { L1PA: 21.3, LL: { 'L2-S1': 40.0, 'L3-S1': 30.5 } }),
  }));
  assert.equal(values.PI, 52.7);
  assert.equal(values.PT, 14.6);
  assert.equal(values.SS, 38.2);
  assert.equal(values.LL, 47.1);
  assert.ok(Math.abs(values.PILL - (52.7 - 47.1)) < 1e-9);
  assert.equal(values.L1PA, 21.3);
  assert.equal(values['L2-S1'], 40.0);
  assert.equal(values['L3-S1'], 30.5);
  assert.equal(values['L4-S1'], null);
  assert.equal(values['L5-S1'], null);
});

test('parameterValues is all null for an unsegmented study, and never 0 for an absent value', () => {
  const values = parameterValues(study({ measurements: null }));
  for (const column of measurementColumns(true)) assert.equal(values[column.key], null);
  const noL1pa = parameterValues(study({ measurements: measurements(50, 10, 40, 45) }));
  assert.equal(noL1pa.L1PA, null);
  assert.notEqual(noL1pa.L1PA, 0);
});

test('formatParameter renders one decimal with a degree sign, an em dash for null, and 0 as 0.0°', () => {
  assert.equal(formatParameter(47.06), '47.1\u00B0');
  assert.equal(formatParameter(-0.4), '-0.4\u00B0');
  assert.equal(formatParameter(0), '0.0\u00B0');
  assert.equal(formatParameter(null), DASH);
  assert.equal(formatParameter(undefined), DASH);
});

test('isSegmented is whether the record carries measurements', () => {
  assert.equal(isSegmented(study({ measurements: null })), false);
  assert.equal(isSegmented(study({ measurements: measurements(50, 10, 40, 45) })), true);
});

// ---------------------------------------------------------------------------
// filter options
// ---------------------------------------------------------------------------

test('workspaceOptions lists each root once in first-seen order, labelled by its last segment, then Added by hand', () => {
  const studies = [
    study({ id: 'SP-1000', workspaceFolder: 'C:\\films\\Fusion2025' }),
    study({ id: 'SP-1001', workspaceFolder: 'D:\\CohortB' }),
    study({ id: 'SP-1002', workspaceFolder: 'C:\\films\\Fusion2025' }),
    study({ id: 'SP-1003', workspaceFolder: null, filePath: 'C:\\loose\\x.png' }),
  ];
  assert.deepEqual(workspaceOptions(studies), [
    { value: 'C:\\films\\Fusion2025', label: 'Fusion2025' },
    { value: 'D:\\CohortB', label: 'CohortB' },
    { value: HAND_ADDED, label: 'Added by hand' },
  ]);
});

test('workspaceOptions omits Added by hand when every study has a root, and labels colliding roots by their full path', () => {
  const studies = [
    study({ id: 'SP-1000', workspaceFolder: 'C:\\a\\pre-op' }),
    study({ id: 'SP-1001', workspaceFolder: 'C:\\b\\pre-op' }),
  ];
  assert.deepEqual(workspaceOptions(studies), [
    { value: 'C:\\a\\pre-op', label: 'C:\\a\\pre-op' },
    { value: 'C:\\b\\pre-op', label: 'C:\\b\\pre-op' },
  ]);
  assert.deepEqual(workspaceOptions([]), []);
});

test('folderOptions lists the distinct containing folders within the workspace filter and skips films with no path', () => {
  const studies = [
    study({ id: 'SP-1000', filePath: `${ROOT}\\pre-op\\a.png` }),
    study({ id: 'SP-1001', filePath: `${ROOT}\\post-op\\a.png` }),
    study({ id: 'SP-1002', filePath: `${ROOT}\\pre-op\\b.png` }),
    study({ id: 'SP-1003', workspaceFolder: null, filePath: 'C:\\loose\\x.png' }),
    study({ id: 'SP-0042', source: 'demo', workspaceFolder: undefined, filePath: null }),
  ];
  assert.deepEqual(folderOptions(studies, ROOT), [{ value: 'pre-op', label: 'pre-op' }, { value: 'post-op', label: 'post-op' }]);
  assert.deepEqual(folderOptions(studies, HAND_ADDED), [{ value: 'loose', label: 'loose' }]);
  assert.deepEqual(folderOptions(studies, null).map((o) => o.value), ['pre-op', 'post-op', 'loose']);
});

// ---------------------------------------------------------------------------
// filtering
// ---------------------------------------------------------------------------

const LIBRARY = [
  study({ id: 'SP-1000', filePath: `${ROOT}\\pre-op\\a.png`, measurements: measurements(52.7, 14.6, 38.2, 47.1) }),
  study({ id: 'SP-1001', filePath: `${ROOT}\\post-op\\a.png`, measurements: measurements(52.3, 14.0, 38.3, 49.1) }),
  study({ id: 'SP-1002', filePath: `${ROOT}\\pre-op\\b.png`, measurements: null }),
  study({ id: 'SP-1003', workspaceFolder: null, filePath: 'C:\\loose\\x.png', measurements: measurements(48.6, 5.9, 42.7, 49.0) }),
  study({ id: 'SP-0042', source: 'demo', workspaceFolder: undefined, filePath: null, measurements: measurements(41.0, 8.0, 33.0, 44.0) }),
];

test('filterParameters defaults to segmented studies only, across every workspace', () => {
  assert.deepEqual(filterParameters(LIBRARY, {}).map((s) => s.id), ['SP-1000', 'SP-1001', 'SP-1003', 'SP-0042']);
  assert.deepEqual(filterParameters(LIBRARY, DEFAULT_FILTERS).map((s) => s.id), ['SP-1000', 'SP-1001', 'SP-1003', 'SP-0042']);
});

test('filterParameters with segmentedOnly off shows every study', () => {
  assert.equal(filterParameters(LIBRARY, { segmentedOnly: false }).length, 5);
});

test('filterParameters narrows by workspace root, by Added by hand, and by folder, composing with AND', () => {
  assert.deepEqual(filterParameters(LIBRARY, { workspace: ROOT }).map((s) => s.id), ['SP-1000', 'SP-1001']);
  assert.deepEqual(filterParameters(LIBRARY, { workspace: ROOT, segmentedOnly: false }).map((s) => s.id), ['SP-1000', 'SP-1001', 'SP-1002']);
  assert.deepEqual(filterParameters(LIBRARY, { workspace: HAND_ADDED }).map((s) => s.id), ['SP-1003', 'SP-0042']);
  assert.deepEqual(filterParameters(LIBRARY, { workspace: ROOT, folder: 'pre-op' }).map((s) => s.id), ['SP-1000']);
  assert.deepEqual(filterParameters(LIBRARY, { workspace: ROOT, folder: 'pre-op', segmentedOnly: false }).map((s) => s.id), ['SP-1000', 'SP-1002']);
  assert.deepEqual(filterParameters(LIBRARY, { folder: 'loose' }).map((s) => s.id), ['SP-1003']);
});

test('filterParameters returns a new array and leaves the input alone', () => {
  const copy = [...LIBRARY];
  const out = filterParameters(LIBRARY, {});
  assert.notEqual(out, LIBRARY);
  assert.deepEqual(LIBRARY, copy);
});

test('hiddenUnsegmented counts the studies the segmented-only filter removes from the current workspace and folder', () => {
  assert.equal(hiddenUnsegmented(LIBRARY, {}), 1);
  assert.equal(hiddenUnsegmented(LIBRARY, { workspace: ROOT }), 1);
  assert.equal(hiddenUnsegmented(LIBRARY, { workspace: ROOT, folder: 'post-op' }), 0);
  assert.equal(hiddenUnsegmented(LIBRARY, { workspace: HAND_ADDED }), 0);
  assert.equal(hiddenUnsegmented(LIBRARY, { segmentedOnly: false }), 0);
});

test('normaliseFilters clears a workspace that no study carries any more, and its folder with it', () => {
  assert.deepEqual(normaliseFilters({ workspace: 'C:\\gone', folder: 'pre-op' }, LIBRARY), { ...DEFAULT_FILTERS });
  assert.deepEqual(normaliseFilters({ workspace: ROOT, folder: 'nowhere' }, LIBRARY), { ...DEFAULT_FILTERS, workspace: ROOT });
  assert.deepEqual(normaliseFilters({ workspace: ROOT, folder: 'pre-op', segmentedOnly: false }, LIBRARY),
    { workspace: ROOT, folder: 'pre-op', segmentedOnly: false });
  assert.deepEqual(normaliseFilters(undefined, LIBRARY), { ...DEFAULT_FILTERS });
});

// ---------------------------------------------------------------------------
// sorting
// ---------------------------------------------------------------------------

const NAMED = [
  study({ id: 'SP-1000', fileName: 'delta.png', measurements: measurements(52.7, 14.6, 38.2, 47.1) }),
  study({ id: 'SP-1001', fileName: 'alpha.png', measurements: null }),
  study({ id: 'SP-1002', fileName: 'Charlie.png', measurements: measurements(48.6, 5.9, 42.7, 49.0) }),
  study({ id: 'SP-1003', fileName: 'bravo.png', name: 'Zulu', measurements: measurements(41.0, 8.0, 33.0, 44.0) }),
];

test('sortParameters by study sorts on the display name, case-insensitively, in either direction', () => {
  assert.deepEqual(sortParameters(NAMED, { key: 'study', dir: 'asc' }).map((s) => s.id), ['SP-1001', 'SP-1002', 'SP-1000', 'SP-1003']);
  assert.deepEqual(sortParameters(NAMED, { key: 'study', dir: 'desc' }).map((s) => s.id), ['SP-1003', 'SP-1000', 'SP-1002', 'SP-1001']);
  assert.deepEqual(sortParameters(NAMED, DEFAULT_SORT).map((s) => s.id), ['SP-1001', 'SP-1002', 'SP-1000', 'SP-1003']);
});

test('sortParameters by a measurement puts absent values last in BOTH directions', () => {
  assert.deepEqual(sortParameters(NAMED, { key: 'PI', dir: 'asc' }).map((s) => s.id), ['SP-1003', 'SP-1002', 'SP-1000', 'SP-1001']);
  assert.deepEqual(sortParameters(NAMED, { key: 'PI', dir: 'desc' }).map((s) => s.id), ['SP-1000', 'SP-1002', 'SP-1003', 'SP-1001']);
  // PI-LL is derived, and sorts like any other column.
  assert.deepEqual(sortParameters(NAMED, { key: 'PILL', dir: 'asc' }).map((s) => s.id), ['SP-1003', 'SP-1002', 'SP-1000', 'SP-1001']);
});

test('sortParameters is stable: ties and all-absent keys keep the input order', () => {
  const tied = [
    study({ id: 'SP-1000', measurements: measurements(50, 10, 40, 45) }),
    study({ id: 'SP-1001', measurements: measurements(50, 11, 39, 45) }),
    study({ id: 'SP-1002', measurements: measurements(50, 12, 38, 45) }),
  ];
  assert.deepEqual(sortParameters(tied, { key: 'PI', dir: 'asc' }).map((s) => s.id), ['SP-1000', 'SP-1001', 'SP-1002']);
  assert.deepEqual(sortParameters(tied, { key: 'PI', dir: 'desc' }).map((s) => s.id), ['SP-1000', 'SP-1001', 'SP-1002']);
  assert.deepEqual(sortParameters(tied, { key: 'L1PA', dir: 'asc' }).map((s) => s.id), ['SP-1000', 'SP-1001', 'SP-1002']);
});

test('sortParameters by workspace orders by workspace label, then folder, then name', () => {
  const mixed = [
    study({ id: 'SP-1000', workspaceFolder: 'D:\\Zeta', filePath: 'D:\\Zeta\\a.png', fileName: 'a.png' }),
    study({ id: 'SP-1001', workspaceFolder: 'C:\\Alpha', filePath: 'C:\\Alpha\\post-op\\b.png', fileName: 'b.png' }),
    study({ id: 'SP-1002', workspaceFolder: 'C:\\Alpha', filePath: 'C:\\Alpha\\pre-op\\c.png', fileName: 'c.png' }),
    study({ id: 'SP-1003', workspaceFolder: 'C:\\Alpha', filePath: 'C:\\Alpha\\pre-op\\a.png', fileName: 'a.png' }),
    study({ id: 'SP-1004', workspaceFolder: null, filePath: 'C:\\loose\\x.png', fileName: 'x.png' }),
  ];
  // An em dash (U+2014) sorts after every letter, so hand-added films come last.
  assert.deepEqual(sortParameters(mixed, { key: 'workspace', dir: 'asc' }).map((s) => s.id), ['SP-1001', 'SP-1003', 'SP-1002', 'SP-1000', 'SP-1004']);
});

test('sortParameters returns a new array and does not reorder the input', () => {
  const copy = [...NAMED];
  const out = sortParameters(NAMED, { key: 'PI', dir: 'asc' });
  assert.notEqual(out, NAMED);
  assert.deepEqual(NAMED, copy);
});

// ---------------------------------------------------------------------------
// empty state and export filename
// ---------------------------------------------------------------------------

test('emptyReason is null while anything is visible', () => {
  assert.equal(emptyReason({ total: 3, visible: 1, filters: {}, query: '' }), null);
});

test('emptyReason blames the right thing: an empty library, nothing segmented, or a filter the user set', () => {
  assert.equal(emptyReason({ total: 0, visible: 0, filters: {}, query: '' }), 'none');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: {}, query: '' }), 'unsegmented');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: { workspace: ROOT }, query: '' }), 'filtered');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: { folder: 'pre-op' }, query: '' }), 'filtered');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: {}, query: 'zzz' }), 'filtered');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: {}, query: '   ' }), 'unsegmented');
});

test('exportFileName names the workspace, or the library when there is no single root', () => {
  assert.equal(exportFileName(null), 'library-parameters.csv');
  assert.equal(exportFileName(HAND_ADDED), 'library-parameters.csv');
  assert.equal(exportFileName('C:\\films\\Fusion2025'), 'Fusion2025-parameters.csv');
  assert.equal(exportFileName('/data/Fusion 2025 (v2)/'), 'Fusion-2025-v2-parameters.csv');
  assert.equal(exportFileName('/'), 'workspace-parameters.csv');
});
```

- [ ] **Step 3: Run the new suite to see it fail**

Run: `node --test test/parameters.test.js`
Expected: FAIL at import — `Cannot find module '.../renderer/data/parameters.js'`.

- [ ] **Step 4: Write the module**

Create `renderer/data/parameters.js`:

```js
/**
 * Pure logic for the Parameters tab of the Studies screen (pre-op/post-op spec, 2026-09-06 §10):
 * which columns the grid shows, each study's value in them, the filter options, the filter and
 * sort over Study[], why the grid is empty, and the export filename. No DOM. screens/parameters.js
 * renders what this module decides; test/parameters.test.js pins it.
 *
 * Values come from the same row helpers the Measurements panel uses, so the grid and the panel
 * can never disagree about a number, and an absent value is null here and an em dash on screen --
 * never 0.
 */
import { sagittalRows, lordosisRows } from './measurements.js';
import { studyName, workspaceLabel, folderLabel, lastSegment } from './labels.js';

const DASH = '\u2014';

// The workspace filter's value for "this film has no workspace root" -- added with the picker or
// dropped on the list. A sentinel, not null, because null means "no workspace filter".
export const HAND_ADDED = '__hand__';

export const DEFAULT_FILTERS = Object.freeze({ workspace: null, folder: null, segmentedOnly: true });
export const DEFAULT_SORT = Object.freeze({ key: 'study', dir: 'asc' });

// Labels are the Measurements panel's names. `LL` is L1–S1; `PILL` is the derived PI − LL.
export const CORE_COLUMNS = Object.freeze([
  { key: 'PI', label: 'PI' },
  { key: 'PT', label: 'PT' },
  { key: 'SS', label: 'SS' },
  { key: 'LL', label: 'LL L1\u2013S1' },
  { key: 'PILL', label: 'PI\u2013LL' },
  { key: 'L1PA', label: 'L1PA' },
]);

export const LEVEL_COLUMNS = Object.freeze([
  { key: 'L2-S1', label: 'LL L2\u2013S1' },
  { key: 'L3-S1', label: 'LL L3\u2013S1' },
  { key: 'L4-S1', label: 'LL L4\u2013S1' },
  { key: 'L5-S1', label: 'LL L5\u2013S1' },
]);

export function measurementColumns(showLevels) {
  return showLevels ? [...CORE_COLUMNS, ...LEVEL_COLUMNS] : [...CORE_COLUMNS];
}

// One study's value in every measurement column: a finite number or null. sagittalRows keys its
// rows LL/PI/PT/SS/PILL/L1PA and lordosisRows keys L2-S1..L5-S1 -- exactly the column keys above.
export function parameterValues(study) {
  const values = {};
  for (const row of sagittalRows(study.measurements)) values[row.key] = row.absent ? null : row.value;
  for (const row of lordosisRows(study.measurements)) values[row.key] = row.absent ? null : row.value;
  return values;
}

// As the Measurements panel formats a row: one decimal and the unit, or an em dash.
export function formatParameter(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}\u00B0` : DASH;
}

export function isSegmented(study) {
  return study.measurements != null;
}

function rootOf(study) {
  return typeof study.workspaceFolder === 'string' && study.workspaceFolder !== '' ? study.workspaceFolder : null;
}

function matchesWorkspace(study, workspace) {
  if (!workspace) return true;
  const root = rootOf(study);
  return workspace === HAND_ADDED ? root === null : root === workspace;
}

// Distinct workspace roots in first-seen order, each labelled by its last path segment -- the
// same label the WORKSPACE column shows. Two roots that share a last segment are labelled by
// their full paths instead, so the dropdown never offers two identical entries. "Added by hand"
// is appended when at least one study has no root.
export function workspaceOptions(studies) {
  const roots = [];
  let hand = false;
  for (const study of studies) {
    const root = rootOf(study);
    if (root === null) { hand = true; continue; }
    if (!roots.includes(root)) roots.push(root);
  }
  const labels = roots.map((root) => lastSegment(root) || root);
  const options = roots.map((root, index) => {
    const label = labels[index];
    const collides = labels.some((other, i) => i !== index && other === label);
    return { value: root, label: collides ? root : label };
  });
  if (hand) options.push({ value: HAND_ADDED, label: 'Added by hand' });
  return options;
}

// Distinct containing-folder labels among the studies the workspace filter keeps, in first-seen
// order. A film with no path has no folder (the column shows an em dash) and is not an option.
export function folderOptions(studies, workspace) {
  const seen = [];
  for (const study of studies) {
    if (!matchesWorkspace(study, workspace)) continue;
    const folder = folderLabel(study);
    if (folder !== DASH && !seen.includes(folder)) seen.push(folder);
  }
  return seen.map((value) => ({ value, label: value }));
}

// A stored filter can name a root or folder that no study carries any more (the studies were
// deleted). Clear it for rendering and filtering rather than applying a filter the dropdown
// cannot show. Pure: the stale store value is harmless and is not rewritten here.
export function normaliseFilters(filters, studies) {
  const f = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
  if (f.workspace && !workspaceOptions(studies).some((o) => o.value === f.workspace)) {
    return { ...f, workspace: null, folder: null };
  }
  if (f.folder && !folderOptions(studies, f.workspace).some((o) => o.value === f.folder)) {
    return { ...f, folder: null };
  }
  return f;
}

export function filterParameters(studies, filters) {
  const f = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
  return studies.filter((study) => matchesWorkspace(study, f.workspace)
    && (!f.folder || folderLabel(study) === f.folder)
    && (!f.segmentedOnly || isSegmented(study)));
}

// How many studies the segmented-only filter is hiding from the current workspace and folder.
export function hiddenUnsegmented(studies, filters) {
  const f = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
  if (!f.segmentedOnly) return 0;
  return filterParameters(studies, { ...f, segmentedOnly: false }).length - filterParameters(studies, f).length;
}

const TEXT_SORTS = {
  study: (study) => studyName(study).toLowerCase(),
  // Workspace, then folder, then name. The em dash a hand-added film shows sorts after letters.
  workspace: (study) => `${workspaceLabel(study)}\u0000${folderLabel(study)}\u0000${studyName(study)}`.toLowerCase(),
};

// A sorted COPY. Text keys compare case-insensitively. Any other key is a measurement column:
// absent values go last in both directions (an em dash is not a small number), and ties keep
// the input order, so the list never shuffles under a stable sort.
export function sortParameters(studies, sort) {
  const { key, dir } = { ...DEFAULT_SORT, ...(sort ?? {}) };
  const sign = dir === 'desc' ? -1 : 1;
  if (key in TEXT_SORTS) {
    const read = TEXT_SORTS[key];
    const indexed = studies.map((study, index) => ({ study, index, text: read(study) }));
    indexed.sort((a, b) => (a.text < b.text ? -sign : a.text > b.text ? sign : a.index - b.index));
    return indexed.map((entry) => entry.study);
  }
  const indexed = studies.map((study, index) => ({ study, index, value: parameterValues(study)[key] ?? null }));
  indexed.sort((a, b) => {
    if (a.value === null && b.value === null) return a.index - b.index;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return a.value === b.value ? a.index - b.index : (a.value - b.value) * sign;
  });
  return indexed.map((entry) => entry.study);
}

// Why the grid is empty, so the screen never blames a filter the user did not set:
//   null           something is visible
//   'none'         the library is empty
//   'filtered'     a workspace or folder filter, or the search box, removed everything
//   'unsegmented'  studies exist, but none has measurements and segmented-only is on
export function emptyReason({ total, visible, filters, query }) {
  if (visible > 0) return null;
  if (total === 0) return 'none';
  const f = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
  if (f.workspace || f.folder || String(query ?? '').trim() !== '') return 'filtered';
  return 'unsegmented';
}

// `<root last segment>-parameters.csv` for a workspace filter, else the whole library. The
// segment is reduced to letters, digits, underscore and hyphen so the suggested name is a valid
// filename on every platform.
export function exportFileName(workspace) {
  if (!workspace || workspace === HAND_ADDED) return 'library-parameters.csv';
  const stem = lastSegment(workspace).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${stem || 'workspace'}-parameters.csv`;
}
```

- [ ] **Step 5: Run the suite until green**

Run: `node --test test/parameters.test.js`
Expected: PASS, 22 tests. If `sortParameters by workspace` fails on the hand-added film's position, check that `workspaceLabel` returns `\u2014` for a null root (it does — `data/labels.js`) and that the comparison is on the lowercased string, where U+2014 still sorts after `z`.

- [ ] **Step 6: Run the whole unit suite**

Run: `node --test test/*.test.js`
Expected: all pass; total 318 (295 + 1 labels + 22 parameters).

- [ ] **Step 7: Commit**

```bash
git add renderer/data/labels.js renderer/data/parameters.js test/labels.test.js test/parameters.test.js
git commit -m "feat: pure filter, sort and column logic for the Parameters tab

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Store keys for the tab, its filters, sort and level toggle

**Files:**
- Modify: `renderer/store.js:10`
- Modify: `test/store.test.js:13`
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md:271`

**Interfaces:**
- Produces: four store keys, each replaced wholesale on every change (the Studies screen's gate compares them by reference):

  ```js
  studiesTab: 'find',                                                  // 'find'|'parameters'
  paramFilters: { workspace: null, folder: null, segmentedOnly: true },   // see data/parameters.js DEFAULT_FILTERS
  paramSort: { key: 'study', dir: 'asc' },                             // see data/parameters.js DEFAULT_SORT
  paramLevels: false,                                                  // show the L2–S1..L5–S1 columns
  ```

  They are read only by `screens/studies.js` and `screens/parameters.js`, which subscribe to the store themselves; they are NOT added to `router.js`'s `SCREEN_KEYS` (a change to them must not remount the screen host).

- [ ] **Step 1: Pin the keys in the store test**

In `test/store.test.js`, inside `'getState returns the documented initial shape'`, after `assert.equal(state.query, '');` add:

```js
  assert.equal(state.studiesTab, 'find');
  assert.deepEqual(state.paramFilters, { workspace: null, folder: null, segmentedOnly: true });
  assert.deepEqual(state.paramSort, { key: 'study', dir: 'asc' });
  assert.equal(state.paramLevels, false);
```

Run: `node --test test/store.test.js` — Expected: FAIL (`state.studiesTab` is `undefined`).

- [ ] **Step 2: Add the keys**

In `renderer/store.js`, after the line `  query: '',` insert:

```js
  // The Studies screen's second tab (pre-op/post-op spec §10). Which tab is up, and the
  // Parameters tab's filters, sort and lordosis-level toggle. Store state rather than screen
  // scope so coming back from Analysis lands on the tab, filters and sort the user left. Each
  // is replaced wholesale on change -- the screen's gate compares by reference.
  studiesTab: 'find',
  paramFilters: { workspace: null, folder: null, segmentedOnly: true },
  paramSort: { key: 'study', dir: 'asc' },
  paramLevels: false,
```

Run: `node --test test/store.test.js` — Expected: PASS.

- [ ] **Step 3: Record them in the contract's state shape**

In `docs/superpowers/plans/2026-08-31-00-architecture-contract.md`, in the `**State shape**` block, after the line `  query: '',` insert:

```js
  studiesTab: 'find',       // 'find'|'parameters' (2026-09-06, pre-op/post-op spec §10.1)
  paramFilters: { workspace: null, folder: null, segmentedOnly: true },   // data/parameters.js DEFAULT_FILTERS;
                            // `workspace` is a stored root, HAND_ADDED ('__hand__') or null
  paramSort: { key: 'study', dir: 'asc' },   // key: 'study'|'workspace'|a measurement column key
  paramLevels: false,       // show LL L2–S1..L5–S1 columns
                            // All four are read by screens/studies.js's own subscription, never by SCREEN_KEYS.
```

- [ ] **Step 4: Run the whole unit suite and commit**

Run: `node --test test/*.test.js` — Expected: all pass, 318.

```bash
git add renderer/store.js test/store.test.js docs/superpowers/plans/2026-08-31-00-architecture-contract.md
git commit -m "feat: store keys for the Studies tab, its filters and sort

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The tab strip and an empty Parameters panel

**Files:**
- Modify: `renderer/screens/studies.js` (imports; `render(state)`)
- Create: `renderer/screens/parameters.js`
- Modify: `styles/screens/studies.css` (append)

**Interfaces:**
- Consumes: `emptyReason` from `data/parameters.js`; `matchesQuery`, `openStudy` (module-private) in `screens/studies.js`; store keys from Task 3.
- Produces: `mountParameters(host, { onOpen }) → { update(live, queried) }` in `screens/parameters.js`. `live` is the store state; `queried` is `live.studies` after the search box. Task 5 replaces this file's body; the signature does not change.

DOM code: no unit test. Verification is the manual step below and Task 7's smoke suite.

- [ ] **Step 1: Create the panel skeleton**

Create `renderer/screens/parameters.js`:

```js
/**
 * Parameters tab of the Studies screen (pre-op/post-op spec, 2026-09-06 §10). One row per film
 * with every measurement, a filter bar, sortable headers and an export of the visible rows.
 * All the deciding is in data/parameters.js; this file renders and writes to the store.
 *
 * Mounted once by screens/studies.js's render(); update(live, queried) is called from that
 * screen's subscription on every store notification the Studies screen sees, with `queried`
 * being the library after the search box. A reference-keyed gate inside decides whether to
 * rebuild. This module never imports screens/studies.js: the screen hands in `onOpen`.
 */
import { el, clear } from '../dom.js';
import { DEFAULT_FILTERS, normaliseFilters, filterParameters, sortParameters, emptyReason } from '../data/parameters.js';

const EMPTY_COPY = {
  none: 'No studies yet \u2014 choose or drop a radiograph on the Find tab, or load a workspace folder.',
  unsegmented: 'No segmented studies yet \u2014 open a study and run segmentation.',
  filtered: 'No studies match these filters.',
};

function sameKey(a, b) {
  return a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i]);
}

export function mountParameters(host, { onOpen }) {
  void onOpen; // used from Task 5 on, when rows exist to open
  clear(host);
  const root = el('div', { class: 'param-panel' });
  host.append(root);
  let lastKey = null;

  function update(live, queried) {
    const key = [live.studies, live.query, live.paramFilters, live.paramSort, live.paramLevels, live.fields];
    if (sameKey(key, lastKey)) return;
    lastKey = key;
    clear(root);
    const filters = normaliseFilters(live.paramFilters, live.studies);
    const visible = sortParameters(filterParameters(queried, filters), live.paramSort);
    root.append(el('div', { class: 'param-bar' },
      el('div', { class: 'param-count', 'data-param-key': 'count' }, `${visible.length} OF ${live.studies.length} STUDIES SHOWN`)));
    // Task 5 puts the grid here. Until then the tab shows the count line, and the empty-state
    // card when nothing is visible -- both real behaviour that Task 5 keeps.
    const reason = emptyReason({ total: live.studies.length, visible: visible.length, filters, query: live.query });
    if (reason !== null) {
      root.append(el('div', { class: 'studies-empty card param-empty', 'data-param-key': 'empty' }, EMPTY_COPY[reason]));
    }
  }

  return { update };
}
```

- [ ] **Step 2: Add the tab strip to the Studies screen**

In `renderer/screens/studies.js`, add one import after the `forgetPrediction` import:

```js
import { mountParameters } from './parameters.js';
```

Then replace the whole `export function render(state) { … }` at the end of the file with:

```js
export function render(state) {
  confirmingId = null;
  const summary = el('div', { class: 'studies-summary' });
  const search = el('input', {
    type: 'search', class: 'studies-search', value: state.query || '',
    placeholder: 'Search name, workspace, folder, patient…', 'aria-label': 'Search studies',
    // A keystroke here can filter the confirming row out of the table; clearing the prompt
    // first stops it reappearing, primed on Delete, when the search is cleared again.
    // The setState notification repaints through the same gate (confirmingId is in the key),
    // so no extra refreshTable() is needed.
    onInput: (event) => { confirmingId = null; setState({ query: event.target.value }); },
  });
  const tableHost = el('div', { class: 'studies-table-host' });

  // Two tabs. FIND is everything this screen was: the dropzone, the list and the search.
  // PARAMETERS is the grid of every segmented study's numbers (screens/parameters.js). The list
  // is for finding a study and the grid is for reading its numbers -- the split that paid for
  // deleting LORDOSIS from the list. The active tab is store state (studiesTab), so coming back
  // from Analysis lands on the tab the user left. The search box applies to both.
  const tabFind = el('button', {
    type: 'button', class: 'studies-tab', role: 'tab', id: 'studies-tab-find', 'data-param-key': 'tab-find',
    onClick: () => setState({ studiesTab: 'find' }),
  }, 'Find');
  const tabParameters = el('button', {
    type: 'button', class: 'studies-tab', role: 'tab', id: 'studies-tab-parameters', 'data-param-key': 'tab-parameters',
    onClick: () => setState({ studiesTab: 'parameters' }),
  }, 'Parameters');
  const tabs = el('div', { class: 'studies-tabs', role: 'tablist', 'aria-label': 'Studies views' }, tabFind, tabParameters);
  const findPanel = el('div', {
    class: 'studies-tabpanel', role: 'tabpanel', 'aria-labelledby': 'studies-tab-find',
  }, dropzone(), tableHost);
  const parametersHost = el('div', {
    class: 'studies-tabpanel studies-parameters-host', role: 'tabpanel', 'aria-labelledby': 'studies-tab-parameters',
  });
  const parameters = mountParameters(parametersHost, { onOpen: openStudy });
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
    const key = [live.studies, live.query, live.running, confirmingId];
    if (sameKey(key, lastKey)) return;
    lastKey = key;
    // The summary always describes the whole library, not the filtered view, and counts the
    // queue with exactly the rule buildRow badges it with.
    const queued = studies.filter((study) => (live.running === study.id ? 'proc' : deriveStatus(study)) === 'proc').length;
    summary.textContent = `${studies.length} STUDIES · ${queued} IN QUEUE`;
    mount(tableHost, buildTable(queried, live.running, query !== ''));
  }

  const root = el('main', { class: 'studies-page' },
    el('div', { class: 'studies-page-inner' },
      el('div', { class: 'studies-header' },
        el('div', {}, el('h1', { class: 'studies-heading' }, 'Studies'), summary),
        el('div', { class: 'studies-header-spacer' }),
        search),
      tabs,
      findPanel,
      parametersHost));
  mounted = { update, host: tableHost };
  update(state);
  return root;
}
```

- [ ] **Step 3: Style the strip and panels**

Append to `styles/screens/studies.css`:

```css
/* Tab strip: FIND (the list, search and dropzone) and PARAMETERS (the grid). Same shape as the
   Analysis panel's tab group. The list is for finding a study; the grid is for reading its
   numbers -- the split that paid for deleting LORDOSIS from the list. */
.studies-tabs {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 11px;
  background: var(--well);
  width: fit-content;
}

.studies-tab {
  padding: 6px 18px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font: 650 13px 'Source Sans 3', sans-serif;
  color: var(--muted);
  cursor: pointer;
  transition: background .15s ease, color .15s ease;
}

.studies-tab.is-active {
  background: var(--card);
  color: var(--ink);
}

.studies-tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* Both panels stay in the DOM; the tab toggles which one is shown, so the list's delete
   prompt and the grid's scroll position survive a tab switch. */
.studies-tabpanel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.studies-tabpanel.is-hidden {
  display: none;
}

/* Parameters tab */
.param-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.param-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
}

.param-count {
  margin-left: auto;
  font-family: 'Chivo Mono', monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.15em;
  color: var(--muted);
}

.param-empty {
  border-radius: 14px;
}

.param-table-wrap {
  border-radius: 14px;
  overflow-x: auto;
}
```

- [ ] **Step 4: Run the unit suite**

Run: `node --test test/*.test.js`
Expected: all pass, 318. (`test/studies.test.js` imports `screens/studies.js`, which now imports `screens/parameters.js`; neither touches `document` at module scope, so the import still succeeds under Node.)

- [ ] **Step 5: Manual verification**

Launch the app from source (Global Constraints). Then:

1. Acknowledge the landing gate and open Studies. A `Find | Parameters` strip sits between the header and the dropzone; Find is active and the list looks exactly as before.
2. Click Parameters. The dropzone and list disappear; a count line reads `9 OF 9 STUDIES SHOWN` (dev build, demo studies) and nothing else is rendered below it.
3. Type `zzz` in the search box. The count reads `0 OF 9 STUDIES SHOWN` and the card reads `No studies match these filters.` Clear the search.
4. Open a demo study from Find, then click Studies in the sidebar: the Parameters tab is still selected (it is store state).
5. Keyboard: Tab to the strip, Enter on Parameters switches; the active tab shows a focus ring.
6. The DevTools console shows no errors.

Record the outcome (each of the six, pass or fail) in the commit message body.

- [ ] **Step 6: Commit**

```bash
git add renderer/screens/studies.js renderer/screens/parameters.js styles/screens/studies.css
git commit -m "feat: a Find | Parameters tab strip on the Studies screen

Manual verification: <paste the six outcomes>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The filter bar and the grid

**Files:**
- Modify: `renderer/screens/parameters.js` (replace the whole file)
- Modify: `styles/screens/studies.css` (append)

**Interfaces:**
- Consumes: everything Task 2 exports; `isConsistent` from `data/measurements.js`; `studyName`, `workspaceLabel`, `folderLabel`, `pathTitle` from `data/labels.js`; store keys from Task 3; `onOpen(study)` from the screen.
- Produces: the same `mountParameters(host, { onOpen }) → { update(live, queried) }`. Every interactive control carries a `data-param-key` (`workspace`, `folder`, `segmented`, `levels`, `sort-<key>`, `open-<id>`), which is what the focus restore and Task 7's smoke suite key on. Task 6 adds one button (`export`) to the bar.

- [ ] **Step 1: Replace the panel module**

Replace the whole of `renderer/screens/parameters.js` with:

```js
/**
 * Parameters tab of the Studies screen (pre-op/post-op spec, 2026-09-06 §10). One row per film
 * with every measurement, a filter bar, sortable headers and an export of the visible rows.
 * All the deciding is in data/parameters.js; this file renders and writes to the store.
 *
 * Mounted once by screens/studies.js's render(); update(live, queried) is called from that
 * screen's subscription on every store notification the Studies screen sees, with `queried`
 * being the library after the search box. A reference-keyed gate inside decides whether to
 * rebuild. This module never imports screens/studies.js: the screen hands in `onOpen`.
 *
 * Every control carries a data-param-key. A rebuild replaces every node, which drops keyboard
 * focus to <body>; the key is how focus is handed back to the same control afterwards (the
 * data-row-key pattern in components/measurements.js), and it is what the smoke suite selects
 * on, never a visible label.
 */
import { el, clear } from '../dom.js';
import { setState } from '../store.js';
import { isConsistent } from '../data/measurements.js';
import { studyName, workspaceLabel, folderLabel, pathTitle } from '../data/labels.js';
import {
  HAND_ADDED, DEFAULT_SORT, measurementColumns, parameterValues, formatParameter,
  workspaceOptions, folderOptions, normaliseFilters, filterParameters, hiddenUnsegmented,
  sortParameters, emptyReason,
} from '../data/parameters.js';

const EMPTY_COPY = {
  none: 'No studies yet \u2014 choose or drop a radiograph on the Find tab, or load a workspace folder.',
  unsegmented: 'No segmented studies yet \u2014 open a study and run segmentation.',
  filtered: 'No studies match these filters.',
};

// The Measurements panel's own wording for a PI/PT/SS residual over the limit.
const INCONSISTENT_TITLE = 'Parameters inconsistent \u2014 check S1 and femoral landmarks.';

const CHECK_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 7"></path></svg>';

function sameKey(a, b) {
  return a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i]);
}

// Real booleans on purpose: el() assigns `checked` as a property, and the string 'false' is true.
function checkbox({ key, label, checked, note, onChange }) {
  const input = el('input', { type: 'checkbox', checked, 'data-param-key': key, onChange });
  return el('label', { class: 'checkbox-row param-check' },
    input,
    el('span', { class: 'checkbox-box', innerHTML: CHECK_SVG }),
    el('span', { class: 'param-check-label' }, label, note ? el('span', { class: 'param-check-note' }, note) : null));
}

export function mountParameters(host, { onOpen }) {
  clear(host);
  const root = el('div', { class: 'param-panel' });
  host.append(root);
  let lastKey = null;

  // Filters are one object replaced wholesale, so the screen's gate sees every change.
  function setFilters(patch) {
    setState((s) => ({ paramFilters: { ...s.paramFilters, ...patch } }));
  }

  function toggleSort(key) {
    setState((s) => {
      const current = { ...DEFAULT_SORT, ...(s.paramSort ?? {}) };
      const dir = current.key === key && current.dir === 'asc' ? 'desc' : 'asc';
      return { paramSort: { key, dir } };
    });
  }

  function buildFilterBar(live, queried, visible, filters) {
    const workspaceSelect = el('select', {
      class: 'param-select param-select-workspace', 'aria-label': 'Filter by workspace', 'data-param-key': 'workspace',
      // Changing the workspace clears the folder: a folder is only meaningful within its root.
      onChange: (event) => setFilters({ workspace: event.target.value === '' ? null : event.target.value, folder: null }),
    });
    workspaceSelect.append(el('option', { value: '' }, 'All workspaces'));
    // Options come from the whole library, not the searched subset, so a workspace does not
    // vanish from the dropdown because the search box happens to exclude its films.
    for (const option of workspaceOptions(live.studies)) {
      workspaceSelect.append(el('option', {
        value: option.value, ...(option.value === HAND_ADDED ? {} : { title: option.value }),
      }, option.label));
    }
    workspaceSelect.value = filters.workspace ?? '';

    const folderSelect = el('select', {
      class: 'param-select param-select-folder', 'aria-label': 'Filter by folder', 'data-param-key': 'folder',
      onChange: (event) => setFilters({ folder: event.target.value === '' ? null : event.target.value }),
    });
    folderSelect.append(el('option', { value: '' }, 'All folders'));
    for (const option of folderOptions(live.studies, filters.workspace)) {
      folderSelect.append(el('option', { value: option.value }, option.label));
    }
    folderSelect.value = filters.folder ?? '';

    const hidden = hiddenUnsegmented(queried, filters);
    const segmented = checkbox({
      key: 'segmented', label: 'Segmented only', checked: filters.segmentedOnly,
      note: filters.segmentedOnly && hidden > 0 ? ` \u00B7 ${hidden} unsegmented hidden` : null,
      onChange: (event) => setFilters({ segmentedOnly: event.target.checked }),
    });
    const levels = checkbox({
      key: 'levels', label: 'Levels', checked: live.paramLevels === true, note: null,
      onChange: (event) => setState({ paramLevels: event.target.checked }),
    });

    return el('div', { class: 'param-bar' },
      workspaceSelect, folderSelect, segmented, levels,
      el('div', { class: 'param-count', 'data-param-key': 'count' }, `${visible.length} OF ${live.studies.length} STUDIES SHOWN`));
  }

  function sortableHeader(key, label, sort, extraClass) {
    const active = sort.key === key;
    return el('th', {
      scope: 'col', class: `param-th${extraClass ? ` ${extraClass}` : ''}`,
      'aria-sort': active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none',
    },
      el('button', {
        type: 'button', class: `param-sort${active ? ' is-active' : ''}`, 'data-param-key': `sort-${key}`,
        onClick: () => toggleSort(key),
      },
        label,
        el('span', { class: 'param-sort-mark', 'aria-hidden': 'true' }, active ? (sort.dir === 'asc' ? ' \u25B4' : ' \u25BE') : '')));
  }

  function plainHeader(label) {
    return el('th', { scope: 'col', class: 'param-th' }, label);
  }

  function buildRow(study, columns, fields) {
    const values = parameterValues(study);
    const inconsistent = study.measurements != null && !isConsistent(study.measurements);
    const nameCell = el('th', { scope: 'row', class: 'param-cell-study' },
      el('button', {
        type: 'button', class: 'param-open', 'data-param-key': `open-${study.id}`, title: study.id,
        onClick: () => onOpen(study),
      }, studyName(study)),
      study.source === 'demo' ? el('span', { class: 'pill-demo' }, 'DEMO') : null);
    return el('tr', { class: 'param-row', 'data-study-id': study.id },
      nameCell,
      el('td', { class: 'param-cell-text' }, study.view || '\u2014'),
      ...columns.map((column) => {
        // The panel's consistency warning, on the PI cell: the residual |PI − (PT + SS)| is over
        // the limit, so the three pelvic numbers on this row do not agree with each other.
        const flag = column.key === 'PI' && inconsistent;
        return el('td', {
          class: `param-cell-num${flag ? ' is-inconsistent' : ''}`, ...(flag ? { title: INCONSISTENT_TITLE } : {}),
        }, formatParameter(values[column.key]));
      }),
      ...fields.map((field) => el('td', { class: 'param-cell-text' },
        study.clinical && study.clinical[field] != null && study.clinical[field] !== '' ? String(study.clinical[field]) : '')),
      el('td', { class: 'param-cell-text' }, workspaceLabel(study)),
      el('td', { class: 'param-cell-text', ...(pathTitle(study) ? { title: pathTitle(study) } : {}) }, folderLabel(study)));
  }

  function buildGrid(live, visible) {
    const columns = measurementColumns(live.paramLevels === true);
    const fields = live.fields ?? [];
    const sort = { ...DEFAULT_SORT, ...(live.paramSort ?? {}) };
    const head = el('thead', {}, el('tr', {},
      sortableHeader('study', 'STUDY', sort, 'param-col-study'),
      plainHeader('VIEW'),
      ...columns.map((column) => sortableHeader(column.key, column.label.toUpperCase(), sort, 'param-col-num')),
      ...fields.map((field) => plainHeader(field.toUpperCase())),
      sortableHeader('workspace', 'WORKSPACE', sort),
      plainHeader('FOLDER')));
    const body = el('tbody', {}, ...visible.map((study) => buildRow(study, columns, fields)));
    return el('div', { class: 'param-table-wrap card', 'data-param-key': 'grid' },
      el('table', { class: 'param-table' }, head, body));
  }

  function update(live, queried) {
    const key = [live.studies, live.query, live.paramFilters, live.paramSort, live.paramLevels, live.fields];
    if (sameKey(key, lastKey)) return;
    lastKey = key;

    // Focus snapshot, restored by data-param-key after the rebuild (components/measurements.js
    // does the same with data-row-key). Only when focus is inside this panel: a rebuild must
    // never steal focus from the search box or the tab strip.
    const active = document.activeElement;
    const focusKey = root.contains(active) ? active.getAttribute('data-param-key') : null;

    clear(root);
    const filters = normaliseFilters(live.paramFilters, live.studies);
    const visible = sortParameters(filterParameters(queried, filters), live.paramSort);
    root.append(buildFilterBar(live, queried, visible, filters));
    const reason = emptyReason({ total: live.studies.length, visible: visible.length, filters, query: live.query });
    if (reason !== null) {
      root.append(el('div', { class: 'studies-empty card param-empty', 'data-param-key': 'empty' }, EMPTY_COPY[reason]));
    } else {
      root.append(buildGrid(live, visible));
    }

    if (focusKey !== null) {
      for (const candidate of root.querySelectorAll('[data-param-key]')) {
        if (candidate.getAttribute('data-param-key') === focusKey) {
          if (typeof candidate.focus === 'function') candidate.focus();
          break;
        }
      }
    }
  }

  return { update };
}
```

- [ ] **Step 2: Style the bar and the grid**

Append to `styles/screens/studies.css`:

```css
.param-select {
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
  color: var(--ink);
  font: 400 13.5px 'Source Sans 3', sans-serif;
  cursor: pointer;
}

.param-select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.param-check {
  align-items: center;
  font: 400 13.5px 'Source Sans 3', sans-serif;
  color: var(--body);
}

.param-check .checkbox-box {
  width: 16px;
  height: 16px;
  margin-top: 0;
}

.param-check-note {
  color: var(--muted);
}

/* The grid is a real table: table semantics for assistive technology (the Find list's
   single-control row is the thing roadmap item 5 records), a sticky first column, and
   horizontal scroll inside .param-table-wrap -- the page never scrolls sideways. */
.param-table {
  border-collapse: separate;
  border-spacing: 0;
  min-width: 100%;
}

.param-th {
  padding: 12px 14px;
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid var(--border);
  background: var(--well);
  font-family: 'Chivo Mono', monospace;
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.15em;
  color: var(--muted);
}

.param-col-num,
.param-cell-num {
  text-align: right;
}

.param-sort {
  all: unset;
  cursor: pointer;
  font: inherit;
  color: inherit;
  letter-spacing: inherit;
  white-space: nowrap;
}

.param-sort.is-active {
  color: var(--ink);
}

.param-sort:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}

.param-row td,
.param-row th {
  padding: 11px 14px;
  border-top: 1px solid var(--border);
  white-space: nowrap;
  font: 400 14px 'Source Sans 3', sans-serif;
  color: var(--body);
  text-align: left;
}

.param-row:hover td,
.param-row:hover th {
  background: var(--well);
}

.param-cell-study,
.param-th.param-col-study {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--card);
}

.param-th.param-col-study {
  background: var(--well);
  z-index: 2;
}

.param-row:hover .param-cell-study {
  background: var(--well);
}

.param-open {
  all: unset;
  display: inline-block;
  vertical-align: middle;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  font: 600 14px 'Source Sans 3', sans-serif;
  color: var(--ink);
}

.param-open:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}

.param-cell-study .pill-demo {
  margin-left: 8px;
  vertical-align: middle;
}

.param-cell-num {
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}

.param-cell-num.is-inconsistent {
  color: var(--accent);
}

.param-cell-text {
  color: var(--muted);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 3: Run the unit suite**

Run: `node --test test/*.test.js` — Expected: all pass, 318.

- [ ] **Step 4: Manual verification**

Launch from source. On Studies → Parameters:

1. **Grid.** Nine demo rows (DEMO pill beside each name). Columns STUDY · VIEW · PI · PT · SS · LL L1–S1 · PI–LL · L1PA · WORKSPACE · FOLDER. Values read one decimal with a degree sign; L1PA reads `—` on every demo row (demos carry none); WORKSPACE and FOLDER read `—`.
2. **Sticky column and scroll.** Narrow the window until the grid overflows: the grid scrolls inside its card and the STUDY column stays put; the page does not scroll sideways.
3. **Levels.** Tick Levels: four `LL L2–S1`…`LL L5–S1` columns appear, all `—` on demos. Untick.
4. **Sort.** Click PI: rows order ascending with `▴` on the header; click again: descending with `▾`. Click STUDY: back to name order. Keyboard focus stays on the header button you activated after each rebuild.
5. **Segmented only.** Add a film with the dropzone (any PNG) without running it. Return to Parameters: the note reads `Segmented only · 1 unsegmented hidden`, the count `9 OF 10`. Untick: the new row appears with every number `—`. Tick again.
6. **Workspace and folder.** Load a folder in the Workspace screen with at least one subfolder (`tools/smoke/out/workspace-fixture` from a previous smoke run will do, or any folder). On Parameters, the Workspace dropdown offers that root's last segment and `Added by hand`; choosing the root shows only its films and the Folder dropdown offers only its subfolders; `Added by hand` shows the demos and the dropped film. Untick Segmented only to see unsegmented fixture films.
7. **Empty states.** With Workspace on the fixture root and Segmented only ticked, the grid reads `No studies match these filters.` (a filter you set), not the unsegmented copy.
8. **Open.** Click a study name: the Analysis screen opens that study. Studies in the sidebar returns to the Parameters tab with the same filters and sort.
9. **Clinical columns.** Open a study, add a clinical field (e.g. Age) and type a value in the drawer. Back on Parameters, an AGE column shows the value on that row and empty on the others.
10. **Inconsistent mark.** If any row shows PI in the accent colour, hovering it reads the panel's warning. (No demo row is inconsistent; this is verifiable only on a real film whose PI, PT and SS disagree. Record "not exercised" if none is at hand.)
11. Console: no errors.

- [ ] **Step 5: Commit**

```bash
git add renderer/screens/parameters.js styles/screens/studies.css
git commit -m "feat: the Parameters grid with workspace, folder and segmented-only filters and sortable headers

Manual verification: <paste the eleven outcomes>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Export the visible rows

**Files:**
- Modify: `renderer/screens/parameters.js` (imports; `buildFilterBar`; one new function)
- Modify: `styles/screens/studies.css` (append)

**Interfaces:**
- Consumes: `toCsv(studies, opts)` (Task 1); `exportFileName(workspace)` (Task 2); `saveCsv({text, suggestedName}) → string|null` from `renderer/api.js` (resolves null on cancel); `showToast(text)` from `components/toast.js`.
- Produces: an `Export CSV` button (`data-param-key="export"`) on the filter bar; disabled with a title when nothing exportable is visible. The Analysis screen's per-study export is untouched.

- [ ] **Step 1: Add the imports**

In `renderer/screens/parameters.js`, add after the `setState` import:

```js
import { saveCsv } from '../api.js';
import { showToast } from '../components/toast.js';
import { toCsv } from '../data/csv.js';
```

and add `exportFileName` to the `../data/parameters.js` import list.

- [ ] **Step 2: Add the export function**

Inside `mountParameters`, after `toggleSort`, add:

```js
  // The visible rows, as one long-format file (spec §11.1). toCsv drops demo rows itself; the
  // button is disabled when that would leave nothing, so the user is told why instead of being
  // handed a header with no data. A cancelled dialog resolves null and must not toast.
  async function exportVisible(visible, filters) {
    const real = visible.filter((study) => study.source === 'real');
    if (real.length === 0) return;
    const csv = toCsv(visible, {});
    try {
      const savedTo = await saveCsv({ text: csv, suggestedName: exportFileName(filters.workspace) });
      if (savedTo) showToast(`Exported ${real.length} ${real.length === 1 ? 'row' : 'rows'} to ${savedTo}`);
    } catch (error) {
      showToast(`Could not export: ${error.message}`);
    }
  }
```

- [ ] **Step 3: Put the button on the bar**

In `buildFilterBar`, replace the final `return el('div', { class: 'param-bar' }, …)` with:

```js
    const exportable = visible.filter((study) => study.source === 'real').length;
    const exportButton = el('button', {
      type: 'button', class: 'btn btn-small param-export', 'data-param-key': 'export',
      disabled: exportable === 0,
      // No tooltip on the enabled button: it would only repeat the label it sits on.
      title: exportable > 0 ? '' : (visible.length === 0 ? 'Nothing to export' : 'Demo studies are not exported'),
      onClick: () => exportVisible(visible, filters),
    }, 'Export CSV');

    return el('div', { class: 'param-bar' },
      workspaceSelect, folderSelect, segmented, levels,
      el('div', { class: 'param-count', 'data-param-key': 'count' }, `${visible.length} OF ${live.studies.length} STUDIES SHOWN`),
      exportButton);
```

- [ ] **Step 4: Style**

Append to `styles/screens/studies.css`:

```css
.param-export {
  flex: none;
}
```

- [ ] **Step 5: Run the unit suite**

Run: `node --test test/*.test.js` — Expected: all pass, 318.

- [ ] **Step 6: Manual verification**

Launch from source. On Parameters:

1. With only demo rows visible, Export CSV is disabled and its tooltip reads `Demo studies are not exported`.
2. Set a filter that shows nothing: the button is disabled with `Nothing to export`.
3. Segment one real film (open it, Run segmentation, wait). On Parameters with it visible, Export CSV is enabled. Click it: the native save dialog suggests `library-parameters.csv`; with a workspace filter set it suggests `<root>-parameters.csv`. Cancel: no toast. Save: the toast reads `Exported 1 row to <path>`.
4. Open the file: three `#` comment lines, then the header `Study ID,Source,View,LL L1-S1,PI,PT,SS,PI-LL Mismatch,L1PA,LL L2-S1,LL L3-S1,LL L4-S1,LL L5-S1` followed by any clinical fields the exported studies carry; one data row; no demo rows even if demos were visible.
5. Console: no errors.

- [ ] **Step 7: Commit**

```bash
git add renderer/screens/parameters.js styles/screens/studies.css
git commit -m "feat: export the Parameters grid's visible rows as one CSV

Manual verification: <paste the five outcomes>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Smoke suite for the Parameters tab

**Files:**
- Create: `tools/smoke/smoke-parameters.mjs`
- Modify: `tools/smoke/README.md`

**Interfaces:**
- Consumes: `connect()` from `tools/smoke/cdp-lib.mjs` (`evaluate`, `state`, `setState(patchSource)`, `rect(selector)`, `click(x, y)`, `settle(ms)`, `errors`, `close`); the `data-param-key` and `data-study-id` attributes from Tasks 4–6.
- Produces: a DOM-only suite, 22 checks, that needs no segmentation and no backend call. It injects two records straight into the store and removes them again in `finally`.

- [ ] **Step 1: Write the suite**

Create `tools/smoke/smoke-parameters.mjs`:

```js
// Parameters tab smoke (task 1 of the pre-op/post-op spec, 2026-09-06 §10): the tab strip, the
// grid over the demo library, the segmented-only and workspace filters, sort by a measurement
// column, the export button's disabled state, and the tab and sort surviving a trip to Analysis
// and back. DOM-only: nothing is segmented and the backend is never called, so it runs in a few
// seconds. Precondition: the app is running from source (demo studies present), any screen.
//
// Two records are injected straight into the store -- SP-9100 unsegmented, SP-9101 segmented
// under a workspace root -- and removed in `finally`, so a later suite never meets a stray
// Processing row. SP-9101 has measurements but no geometry, which is fine in-session (status is
// derived from measurements alone) but would be nulled by validate() on a restart; that is one
// more reason the cleanup runs unconditionally.
//
// Every selector here is a data-param-key or data-study-id. Never key on a visible label.
import { connect } from './cdp-lib.mjs';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

const WS_ROOT = 'C:\\smoke-fixture\\Fusion2025';
const RESET = '{ query: "", studiesTab: "find", paramFilters: { workspace: null, folder: null, segmentedOnly: true }, paramSort: { key: "study", dir: "asc" }, paramLevels: false }';

const cdp = await connect();
const count = (selector) => cdp.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
const has = (selector) => cdp.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
const text = (selector) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); return e ? e.textContent : null; })()`);
const hidden = (selector) => cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).classList.contains('is-hidden')`);
const rowIds = () => cdp.evaluate("[...document.querySelectorAll('.param-row')].map((r) => r.dataset.studyId)");
const numCells = (id) => cdp.evaluate(`(() => { const row = document.querySelector('.param-row[data-study-id="${id}"]'); return row ? [...row.querySelectorAll('.param-cell-num')].map((c) => c.textContent) : null; })()`);
const choose = (selector, value) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); return e.value; })()`);
const options = (selector) => cdp.evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)} + ' option')].map((o) => o.value)`);
async function clickKey(key) {
  const r = await cdp.rect(`[data-param-key="${key}"]`);
  if (!r) throw new Error(`no control with data-param-key ${key}`);
  await cdp.click(r.cx, r.cy);
  await cdp.settle(80);
}
const store = (expr) => cdp.evaluate(`import('./renderer/store.js').then((m) => { const s = m.getState(); return (${expr}); })`);

try {
  // 1. Land on Studies, Find tab, everything reset.
  await cdp.setState(`{ ack: true, screen: "studies", ...${RESET} }`);
  await cdp.settle(100);
  let s = await cdp.state();
  check('precondition: on Studies with the Find tab up', s.screen === 'studies' && s.studiesTab === 'find', { screen: s.screen, tab: s.studiesTab });
  check('two tabs, Find active', (await count('.studies-tab')) === 2 && (await has('[data-param-key="tab-find"].is-active')), await count('.studies-tab'));
  check('the Parameters panel is hidden while Find is up', (await hidden('.studies-parameters-host')) === true);

  // 2. Click the tab.
  await clickKey('tab-parameters');
  s = await cdp.state();
  check('clicking Parameters selects it in the store', s.studiesTab === 'parameters', s.studiesTab);
  check('the Find panel hides and the grid shows', (await hidden('.studies-parameters-host')) === false && (await has('[data-param-key="grid"]')));

  // 3. One row per segmented study; values as the panel formats them.
  const segmented = await store('s.studies.filter((x) => x.measurements != null).length');
  const ids = await rowIds();
  check('one grid row per segmented study', ids.length === segmented && ids.length > 0, { rows: ids.length, segmented });
  const cells = await numCells('SP-0042');
  const pi = await store("s.studies.find((x) => x.id === 'SP-0042').measurements.PI");
  check('SP-0042 PI reads the record to one decimal with a degree sign', cells !== null && cells[0] === `${pi.toFixed(1)}\u00B0`, { cells, pi });
  check('SP-0042 L1PA (absent on demos) reads an em dash', cells !== null && cells[5] === '\u2014', cells);
  const firstTwo = await cdp.evaluate("[...document.querySelectorAll('.param-row .param-open')].slice(0, 2).map((b) => b.textContent.toLowerCase())");
  check('rows sort by name ascending by default', firstTwo.length === 2 && firstTwo[0] <= firstTwo[1], firstTwo);

  // 4. Inject an unsegmented film and a segmented one under a workspace root.
  await cdp.setState(`(s) => ({ studies: [
    { id: 'SP-9100', source: 'real', filePath: 'C:\\\\loose\\\\smoke-unseg.png', fileName: 'smoke-unseg.png', name: null, workspaceFolder: null,
      addedAt: new Date().toISOString(), view: 'Standing lateral', thumbnail: null, measurements: null, geometry: null, qc: null, clinical: {} },
    { id: 'SP-9101', source: 'real', filePath: ${JSON.stringify(`${WS_ROOT}\\pre-op\\smoke-seg.png`)}, fileName: 'smoke-seg.png', name: null,
      workspaceFolder: ${JSON.stringify(WS_ROOT)}, addedAt: new Date().toISOString(), view: 'Standing lateral', thumbnail: null,
      measurements: { PI: 99.5, PT: 30.0, SS: 69.5, L1PA: 12.0, LL: { 'L1-S1': 60.0 } }, geometry: null, qc: null, clinical: {} },
    ...s.studies.filter((x) => x.id !== 'SP-9100' && x.id !== 'SP-9101'),
  ] })`);
  await cdp.settle(100);
  const note = await text('.param-check-note');
  check('segmented-only reports the one unsegmented film it hides', note !== null && note.includes('1 unsegmented hidden'), note);
  check('the segmented film is a row and the unsegmented one is not', (await rowIds()).includes('SP-9101') && !(await rowIds()).includes('SP-9100'));

  // 5. Segmented-only off.
  await clickKey('segmented');
  check('unticking segmented-only shows the unsegmented film with every number an em dash',
    (await rowIds()).includes('SP-9100') && (await numCells('SP-9100')).every((c) => c === '\u2014') && !(await has('.param-check-note')),
    await numCells('SP-9100'));
  await clickKey('segmented');

  // 6. Workspace and folder filters.
  const wsOptions = await options('.param-select-workspace');
  check('the workspace dropdown offers the injected root and Added by hand', wsOptions.includes(WS_ROOT) && wsOptions.includes('__hand__') && wsOptions[0] === '', wsOptions);
  await choose('.param-select-workspace', WS_ROOT);
  await cdp.settle(80);
  check('choosing the root shows exactly its segmented film', JSON.stringify(await rowIds()) === JSON.stringify(['SP-9101']), await rowIds());
  check('the folder dropdown offers only that root\'s subfolder', JSON.stringify(await options('.param-select-folder')) === JSON.stringify(['', 'pre-op']), await options('.param-select-folder'));
  check('export is enabled with a real segmented film visible', (await cdp.evaluate("document.querySelector('[data-param-key=\"export\"]').disabled")) === false);
  await choose('.param-select-workspace', '__hand__');
  await cdp.settle(80);
  const handIds = await rowIds();
  const exportState = await cdp.evaluate("(() => { const b = document.querySelector('[data-param-key=\"export\"]'); return { disabled: b.disabled, title: b.title }; })()");
  check('Added by hand shows the demos only, and export is disabled because demos are not exported',
    handIds.length > 0 && handIds.every((id) => /^SP-00\d\d$/.test(id)) && exportState.disabled === true && exportState.title === 'Demo studies are not exported',
    { handIds, exportState });
  await choose('.param-select-workspace', '');
  await cdp.settle(80);

  // 7. Sort by PI, twice.
  await clickKey('sort-PI');
  await clickKey('sort-PI');
  s = await cdp.state();
  const topAfterDesc = (await rowIds())[0];
  check('two clicks on PI sort descending, with the highest PI first', s.paramSort.key === 'PI' && s.paramSort.dir === 'desc' && topAfterDesc === 'SP-9101', { sort: s.paramSort, top: topAfterDesc });
  check('the sort header keeps keyboard focus across the rebuild', (await cdp.evaluate("document.activeElement?.getAttribute('data-param-key')")) === 'sort-PI');

  // 8. Open a row, come back: tab and sort survive.
  await clickKey('open-SP-9101');
  s = await cdp.state();
  check('clicking a study name opens it on Analysis', s.screen === 'analysis' && s.openId === 'SP-9101', { screen: s.screen, openId: s.openId });
  await cdp.setState('{ screen: "studies" }');
  await cdp.settle(100);
  s = await cdp.state();
  check('back on Studies, the Parameters tab and the PI sort are still in place', s.studiesTab === 'parameters' && s.paramSort.key === 'PI' && s.paramSort.dir === 'desc' && (await has('[data-param-key="grid"]')), { tab: s.studiesTab, sort: s.paramSort });

  // 9. No console errors or exceptions during the run.
  check('no console errors or exceptions during the run', cdp.errors.length === 0, cdp.errors);
} finally {
  // Remove the injected records and reset the tab state whatever happened above.
  await cdp.setState(`(s) => ({ studies: s.studies.filter((x) => x.id !== 'SP-9100' && x.id !== 'SP-9101'), openId: s.openId === 'SP-9101' ? null : s.openId, ...${RESET} })`).catch(() => {});
  cdp.close();
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${JSON.stringify(r.detail)}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it against a fresh launch**

From PowerShell, in the worktree, with `SPINE_CONTOUR_PYTHON` set as in Global Constraints:

```
node tools/smoke/launch.mjs
node tools/smoke/smoke-parameters.mjs
node tools/smoke/cdp.mjs --quit
```

Expected: `21/22 checks passed`. If the output is empty, the suite threw: re-run `node tools/smoke/smoke-parameters.mjs` bare and read the stack. If `launch.mjs` exits 3, run `node tools/smoke/cdp.mjs --quit` first and kill stray `electron` processes.

Then run the existing Studies suite on the same instance to prove the tab strip broke nothing it asserts:

```
node tools/smoke/smoke-studies.mjs
```

Expected: `60/60` (the two badge-timing checks the README documents as racy may read 58/60 on a warm machine; that is the suite's known issue, not this task's).

- [ ] **Step 3: Document the suite**

In `tools/smoke/README.md`, after the paragraph beginning `**Known baseline** (fresh scratch profile, this branch tip)`, add:

````markdown
## Running the Parameters suite

`smoke-parameters.mjs` drives the Studies screen's Parameters tab (pre-op/post-op spec task 1):
the tab strip, the grid over the demo library, the segmented-only and workspace filters, a
measurement sort, the export button's disabled state, and the tab and sort surviving a trip to
Analysis. DOM-only, no segmentation, no backend call; a few seconds. It injects `SP-9100`
(unsegmented) and `SP-9101` (segmented, workspace root `C:\smoke-fixture\Fusion2025`) into the
store and removes both in `finally`, so it can run before or after any other suite on the same
instance.

```
node tools/smoke/smoke-parameters.mjs
```

Every selector is a `data-param-key` or `data-study-id`. Baseline: 22/22.
````

And extend the `**Known baseline**` line to read `… `smoke-workspace.mjs` 96/96; `smoke-parameters.mjs` 22/22; …`.

- [ ] **Step 4: Commit**

```bash
git add tools/smoke/smoke-parameters.mjs tools/smoke/README.md
git commit -m "test: smoke suite for the Parameters tab

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Records — contract, roadmap, handoff, spec

**Files:**
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` (module list)
- Modify: `docs/ROADMAP.md` (item 1)
- Modify: `docs/superpowers/HANDOFF.md` ("Where things stand")
- Modify: `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` (§10.3 sort wording; §15 task 1 status)

- [ ] **Step 1: Contract module list**

In the contract's module tree (the block that lists `screens/studies.js` and `data/csv.js`), change the `screens/studies.js` line to

```
  screens/studies.js              exports render(state), formatDate, matchesQuery, newStudy; mounts screens/parameters.js
                                  under a Find | Parameters tab strip (2026-09-06)
```

add after `screens/analysis.js`:

```
  screens/parameters.js           (2026-09-06) the Parameters tab: exports mountParameters(host, {onOpen}) → {update(live, queried)};
                                  reads paramFilters/paramSort/paramLevels, writes them; never imports screens/
```

and add after `data/labels.js`:

```
  data/parameters.js              (2026-09-06) pure: columns, values, filter options, filter, sort, empty reason, export
                                  filename for the Parameters tab -- see the file header for the exported names
```

- [ ] **Step 2: Roadmap item 1**

In `docs/ROADMAP.md`, item 1, replace the bullet beginning `- **Export hidden fields or not?**` with:

```markdown
- ~~**Export hidden fields or not?**~~ **Decided and done (2026-09-06, Parameters tab task):** the export
  writes every clinical key present on the exported studies, KNOWN_FIELDS order then custom, and
  `toCsv` no longer takes the visible field list. A hidden column can no longer vanish from the file.
```

Under `### What happens today`, item 3 (`**Only currently-visible clinical columns are exported.**`), prefix it with `~~` … `~~` and append ` **Fixed 2026-09-06.**`. Items 1 and 2 stand.

- [ ] **Step 3: Handoff**

In `docs/superpowers/HANDOFF.md`, under `## Where things stand`, insert before `### Session 2026-09-06 — studies and UI updates`:

```markdown
### Parameters tab — task 1 of the pre-op/post-op spec (branch `claude/preop-postop-xray-org-2c4d80`)

Spec: `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` §10, §11.1. Plan:
`docs/superpowers/plans/2026-09-06-parameters-tab.md`. Commits: `git log --oneline 9735202..HEAD` on
that branch.

- The Studies screen has a `Find | Parameters` tab strip; the tab, the grid's filters, sort and
  level toggle are store keys (`studiesTab`, `paramFilters`, `paramSort`, `paramLevels`), read by
  the screen's own subscription, never by `SCREEN_KEYS`.
- `renderer/data/parameters.js` is pure and fully unit-tested; `renderer/screens/parameters.js` is
  DOM and is covered by `tools/smoke/smoke-parameters.mjs` (22 checks, DOM-only) plus the manual
  steps recorded in each task's commit message.
- `toCsv(studies, opts)`: the `fields` parameter is gone; clinical columns are the union of keys on
  the exported rows (roadmap item 1's third decision, now made).
- Not built here, by design: subject, timepoint, view, film date, the paired-only filter, the
  paired export and compare-with-pre-op -- spec tasks 2–4.

**Trap:** the panel rebuilds on every change to its key and restores focus by `data-param-key`;
a new control without that attribute drops keyboard focus to `<body>` after its own change event.
```

- [ ] **Step 4: Spec wording**

In the spec's §10.3, replace the sentence

```
Sort: by subject (then §7.2 order, then film date), by study id, by workspace then folder, or by any
measurement column (absent last).
```

with

```
Sort: by subject (then §7.2 order, then film date), by study name (the id is on the name's tooltip,
not a column), by workspace then folder, or by any measurement column (absent last). The Studies
search box applies to the grid as well as the Find list, composing with the filters.
```

In §15, change the start of item 1 from

```
1. **Parameters tab** with workspace, folder and segmented-only filters,
```

to

```
1. **Parameters tab** — DONE (plan `2026-09-06-parameters-tab.md`) — with workspace, folder and segmented-only filters,
```

- [ ] **Step 5: Final verification and commit**

Run: `node --test test/*.test.js` — Expected: 318/318.

```bash
git add docs/superpowers/plans/2026-08-31-00-architecture-contract.md docs/ROADMAP.md docs/superpowers/HANDOFF.md docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md
git commit -m "docs: record the Parameters tab in the contract, roadmap, handoff and spec

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Then push the branch to `fork` as a backup (it publishes nothing — the preview workflows fire only on `ui-redesign-cw`):

```bash
git push fork claude/preop-postop-xray-org-2c4d80
```

---

## Addendum (2026-09-07) — two changes decided with the user at the Task 6 gate

Approved in chat on 2026-09-07 as a bounded change (no separate spec document): drop the CSV's
`Source` column, and let the user export a chosen subset of the grid. The user's rule for hidden
picks: **the export writes the selected rows that are visible**, in grid order; hidden picks stay
ticked and return with the filter. The Global Constraints above bind every task here. The tasks are
executed the same way as Tasks 1–8 (Sonnet for 9, 10, 12; Opus for 11, which has a human gate).

### Task 9: Drop the CSV's `Source` column and the unused include-demo option

**Files:**
- Modify: `renderer/data/csv.js` (`toCsv`)
- Modify: `renderer/screens/analysis.js` (the one call and the comment above it)
- Modify: `renderer/screens/parameters.js` (the one call in `exportVisible`)
- Modify: `test/csv.test.js`
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` (the csv.js block: signature line and the paragraph that mentions `includeDemo`)
- Modify: `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` (§10.2 one sentence; §11.1 the three example lines)
- Modify: `docs/ROADMAP.md` (item 1, "What happens today": the example header and row)

**Why.** The `Source` column exists to mark fabricated demo rows in a file written with
`includeDemo: true`. No dialog ever sets that option, nothing in the app passes it, and no installer
ships demo studies (HANDOFF decision 19), so every file the app can write reads `real` on every row.
A constant column in a research CSV is noise, and an option nothing sets is a trap.

**Interfaces:**
- Produces: `toCsv(studies) → string`. The `opts` parameter is gone with its only key. Demo rows
  (`source === 'demo'`) are never written. Header: `Study ID,View,LL L1-S1,PI,PT,SS,PI-LL Mismatch,L1PA,LL L2-S1,LL L3-S1,LL L4-S1,LL L5-S1` followed by the clinical union.

- [ ] **Step 1: Narrow the tests first.** In `test/csv.test.js`: the test `'toCsv excludes demo studies by default and includes them with opts.includeDemo'` becomes `'toCsv never writes a demo study'` — keep its exclusion assertions, delete the `includeDemo: true` half. Every call `toCsv(x, {})` becomes `toCsv(x)`. Every header-position assertion moves one left: the comments "Study ID, Source, View, …" lose `Source`; `header.slice(13)` → `header.slice(12)`; `header.length === 13` → `12`; `header[12] === 'LL L5-S1'` → `header[11]`. Grep the file for `Source`, `includeDemo`, `slice(13`, `header[12]`, `length, 13` and fix each. Run `node --test test/csv.test.js`: the narrowed tests FAIL (the header still carries `Source`). Record the output.
- [ ] **Step 2: Change `toCsv`.** Signature `export function toCsv(studies)`. `const rows = studies.filter((study) => study.source !== 'demo');` with a comment: demo rows are never written; the option that once included them was wired to no dialog and no installer ships demos, so the `Source` column that marked them is gone with it (2026-09-07). Header `['Study ID', 'View', ...MEASUREMENT_COLUMNS, ...fields]`; the cells drop `study.source`. Run the CSV suite: PASS.
- [ ] **Step 3: The two callers.** `renderer/screens/analysis.js`: `toCsv(live.studies.filter((s) => s.id === live.openId))`, and rewrite the comment above it (it explains why `includeDemo` is not passed) to say that `toCsv` never writes a demo study, so the guard below it is what keeps a demo's export from producing a header with no rows. `renderer/screens/parameters.js`: `toCsv(visible)`.
- [ ] **Step 4: Records.** Contract csv.js block: `export function toCsv(studies)          // → string   (2026-09-07) demo rows are never written; the Source column and the includeDemo option are gone` (keep the earlier `(2026-09-06)` note about the union rule on the same entry), and in the paragraph beginning "`toCsv` emits the citation comment block first", replace "and excludes `source === 'demo'` unless `opts.includeDemo` is true" with "and never writes a `source === 'demo'` study (2026-09-07: the `includeDemo` option and the `Source` column are gone — no dialog ever set the option and no installer ships demos)". Spec §10.2: "excluded from export unless the export dialog includes them (spec §10.7)" → "never exported (2026-09-07: there is no include-demo option and no `Source` column)". Spec §11.1: drop `Source,` from the example header and `real,` from the two example rows. ROADMAP item 1 "What happens today": drop `Source,` and `real,` from the example header and row.
- [ ] **Step 5: Verify and commit.** `node --test test/*.test.js` — 322/322 (no test added, one narrowed). `grep -rn "includeDemo\|'Source'" renderer test` shows nothing. Commit the seven files:

```
feat: drop the CSV's Source column and the unused include-demo option

Every file the app can write read `real` on every row: no dialog ever set includeDemo and no
installer ships demo studies. toCsv(studies) never writes a demo row.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

### Task 10: Selection state and the pure helpers for exporting chosen studies

**Files:**
- Modify: `renderer/store.js` (one key)
- Modify: `test/store.test.js` (one assertion)
- Modify: `renderer/data/parameters.js` (four exports; header comment)
- Modify: `test/parameters.test.js` (a "selection" section)
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` (State shape: one line; module list: the `data/parameters.js` entry mentions the selection helpers)

**Interfaces:**
- Produces the store key `paramSelected: []` — `string[]` of study ids ticked on the Parameters grid, replaced wholesale on every change (the panel's gate compares by reference), session-only (never written to `studies.json`; the saver writes only `studies`), NOT in `router.js`'s `SCREEN_KEYS`.
- Produces, in `renderer/data/parameters.js`, all pure, all tolerating `selected` of `null`/`undefined` as `[]`, all returning NEW arrays and never mutating inputs:

  ```js
  export function toggleId(selected, id)              // → string[]  id appended if absent, removed if present
  export function withIds(selected, ids, on)          // → string[]  on: every id in `ids` present once (appended in `ids` order); off: every id in `ids` removed
  export function selectedVisible(visible, selected)  // → Study[]   the visible studies whose id is selected, in visible order; stale ids ignored
  export function rowsToExport(visible, selected)     // → Study[]   selectedVisible when it is non-empty, else visible
  ```

- [ ] **Step 1: Pin the store key.** In `test/store.test.js`, after the `paramLevels` assertion add `assert.deepEqual(state.paramSelected, []);` — FAIL. In `renderer/store.js`, after `paramLevels: false,` add `paramSelected: [],` with a comment: the study ids ticked on the Parameters grid (addendum, 2026-09-07); replaced wholesale; session-only, never persisted. PASS.
- [ ] **Step 2: Write the failing tests.** In `test/parameters.test.js`, import the four names and add a `// selection` section: `toggleId` adds an absent id at the end and removes a present one, returns a new array, leaves the input untouched, treats `undefined` as empty; `withIds` on adds only the missing ids in `ids` order and is idempotent, off removes every listed id and leaves others, both return new arrays; `selectedVisible` returns the visible studies in visible order for a selection given in a different order, ignores ids no visible study carries, and returns `[]` for `null`; `rowsToExport` returns `selectedVisible` when non-empty and the whole `visible` array (a new array, equal contents) when nothing visible is selected. Use the file's `study()` helper. Run: FAIL at import.
- [ ] **Step 3: Write the helpers** after `patchFilters`, each with a one-line comment, and add "the selection of rows to export" to the module header's list of what it decides. Run `node --test test/parameters.test.js`: PASS.
- [ ] **Step 4: Contract.** State shape: after the `paramLevels` line add `  paramSelected: [],        // string[] study ids ticked on the Parameters grid (2026-09-07); replaced wholesale; session-only`. Module list: extend the `data/parameters.js` entry with `; selection helpers toggleId/withIds/selectedVisible/rowsToExport (2026-09-07)`.
- [ ] **Step 5: Verify and commit.** `node --test test/*.test.js` — all pass (322 plus the new tests; report the total). Commit the five files:

```
feat: selection state and pure helpers for exporting chosen studies

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

### Task 11: Tick rows to export a chosen subset

**Files:**
- Modify: `renderer/screens/parameters.js`
- Modify: `styles/screens/studies.css` (append)

**Interfaces:**
- Consumes: `toggleId`, `withIds`, `selectedVisible`, `rowsToExport` (Task 10); `paramSelected` (Task 10); `toCsv(studies)` (Task 9).
- Produces: a checkbox in each row's STUDY cell (`data-param-key="select-<id>"`), a select-all checkbox in the STUDY header (`data-param-key="select-all"`), the Export button's label and target, a `· N SELECTED` suffix on the count line, and a visible reason beside the disabled button (`data-param-key="export-note"`).

DOM code: no unit test. Verification is a CDP dry run by the implementer, the manual step below (human gate), and Task 12's smoke checks.

- [ ] **Step 1: The row checkbox.** In `buildRow`, before the name button inside the sticky `<th scope="row">` STUDY cell, add a checkbox using the codebase's hidden-input + `.checkbox-box` pattern (see the file's `checkbox()` helper and `styles/components.css` `.checkbox-row`), with no visible text: the input carries `type: 'checkbox'`, a real boolean `checked` (`selected.includes(study.id)`), `'aria-label': \`Select ${studyName(study)}\``, `'data-param-key': \`select-${study.id}\``, and `onChange: () => setState((s) => ({ paramSelected: toggleId(s.paramSelected, study.id) }))`. `selected` is `live.paramSelected ?? []`, passed into `buildRow`. Keep the cell's sticky styling; the checkbox and the name sit on one line (`.param-cell-study` becomes a flex row with a small gap).
- [ ] **Step 2: Select-all.** In `buildGrid`, the STUDY header cell gets, before its sort button, a checkbox with `'data-param-key': 'select-all'`, `'aria-label': 'Select all visible studies'`, `checked` = `visible.length > 0 && every visible id is selected` (real boolean), and after creation set its `indeterminate` property to `true` when some but not all visible ids are selected. `onChange: (event) => setState((s) => ({ paramSelected: withIds(s.paramSelected, visible.map((x) => x.id), event.target.checked) }))`. The `visible` in that closure is the render's own array, exactly as the Export button captures it.
- [ ] **Step 3: The export target, label, count and note.** In `buildFilterBar`: `const chosen = selectedVisible(visible, live.paramSelected);` and `const rows = rowsToExport(visible, live.paramSelected);`. `exportable` counts the real studies in `rows`. The button's text is `chosen.length > 0 ? \`Export ${chosen.length} selected\` : 'Export CSV'`; its `onClick` calls `exportVisible(rows, filters)` (rename that function's first parameter to `rows` and update its comment: it writes the rows it is given — the visible rows, or the visible selected ones). The disabled reason stays as the `title` AND is rendered as `el('span', { class: 'param-export-note', 'data-param-key': 'export-note' }, reason)` placed right after the button, only when the button is disabled (Chromium shows no tooltip on a disabled control). The count line becomes `\`${visible.length} OF ${live.studies.length} STUDIES SHOWN${chosen.length > 0 ? \` · ${chosen.length} SELECTED\` : ''}\``.
- [ ] **Step 4: The gate key.** Add `live.paramSelected` to the key array in `update()` (the comment there says why every store key the grid reads must be listed).
- [ ] **Step 5: Style.** Append to `styles/screens/studies.css`: `.param-cell-study` as an inline flex row (`display: flex; align-items: center; gap: 10px;` — check the sticky rules still apply), the checkbox box sized like `.param-check .checkbox-box` (16px, no top margin), and `.param-export-note` (Chivo Mono 10px, `var(--muted)`, `flex: none`). The header's select-all sits before the sort button with the same gap.
- [ ] **Step 6: Unit suite.** `node --test test/*.test.js` — all pass, total unchanged from Task 10.
- [ ] **Step 7: Manual verification** (human gate; the implementer dry-runs the same checks over CDP first, injecting `SP-91xx` records for what the pickers cannot reach):
  1. Every row has a checkbox before its name in the STUDY cell; the STUDY header has a select-all checkbox before the sort button.
  2. Tick one row with the mouse: the count line ends `· 1 SELECTED` and the button reads `Export 1 selected`.
  3. Tick select-all: every visible row is ticked, the count says N; untick it: none; tick two rows by hand: the header checkbox shows the indeterminate state.
  4. With two real rows ticked, Export: the file holds exactly those two rows under the header; the toast reads `Exported 2 rows to <path>`.
  5. With a row ticked, set a filter or search that hides it: the count and label no longer count it; clear the filter: it is still ticked and counted again.
  6. Keyboard: Tab to a row checkbox, Space toggles it, and focus stays on that checkbox after the rebuild.
  7. With only demo rows visible (or "not reachable"): the disabled button has a visible note `Demo studies are not exported` beside it; with nothing visible, `Nothing to export`.
  8. Console: no errors.
- [ ] **Step 8: Commit** (body: `Manual verification: pending the human gate (eight checks) — outcomes recorded here by amendment before Task 12 starts.` until the gate; then the eight outcomes):

```
feat: tick rows on the Parameters grid to export a chosen subset

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

### Task 12: Smoke checks and records for the selected-studies export

**Files:**
- Modify: `tools/smoke/smoke-parameters.mjs`
- Modify: `tools/smoke/README.md` (the baseline figure; one sentence in the Parameters section)
- Modify: `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` (§10.2, §10.4)
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` (the `screens/parameters.js` module-list entry)

- [ ] **Step 1: Suite.** `RESET` and the `finally` patch gain `paramSelected: []`. After the sort step (7) and before the open step (8), add checks keyed only on `data-param-key`/`data-study-id`: tick `select-SP-9101` (clickKey on its box: click the rect of the `label`/`.checkbox-box` that wraps the hidden input, or dispatch a `click` on the input via `evaluate` — say which) → the count line text contains `1 SELECTED` and `[data-param-key="export"]` text is `Export 1 selected`; click `select-all` → every `.param-row` checkbox is checked and the label reads `Export <rows> selected`; click `select-all` again → none checked, label `Export CSV`; tick `select-SP-9101`, choose workspace `__hand__` → label `Export CSV` and no `SELECTED` in the count line; choose `''` → label `Export 1 selected` again; untick it; with workspace `__hand__` the note `[data-param-key="export-note"]` reads `Demo studies are not exported`. Then continue with the open step. Run on a fresh launch: every check passes; report the new total (22 + the checks you added).
- [ ] **Step 2: README.** Update `smoke-parameters.mjs`'s figure in the second "Known baseline" paragraph and in the Parameters section's `Baseline:` line to the new total; add "and ticking rows to export a chosen subset" to the section's first sentence.
- [ ] **Step 3: Spec.** §10.2: after the sentence about the study name being the link, add "Each row's Study cell also carries a checkbox, and the STUDY header a select-all for the visible rows (2026-09-07)." §10.4: after the filename sentence, add "Ticking rows narrows the export to the ticked rows that are visible, in grid order; the button reads `Export N selected` and the count line `· N SELECTED`; hidden picks stay ticked and return with the filter; with nothing ticked the export is the visible rows (decided 2026-09-07). The reason a disabled Export button cannot act is written beside it, not in a tooltip."
- [ ] **Step 4: Contract.** Extend the `screens/parameters.js` module-list entry: `reads paramFilters/paramSort/paramLevels/paramSelected, writes them`.
- [ ] **Step 5: Commit** the four files:

```
test: smoke checks for the selected-studies export; records

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

## Self-review against the spec

- **§10.1 placement, tab in store, return to the same tab** — Task 3 (key), Task 4 (strip), Task 7 check 20.
- **§10.2 columns, DEMO pill, sticky first column, horizontal scroll, panel-identical formatting, consistency mark on PI, row opens the study, table semantics** — Task 5. Subject, Timepoint and Film date columns are task 2 of the spec, not here.
- **§10.3 workspace (+Added by hand), folder, segmented-only default on with a hidden count, composable; sort by name / workspace / measurement with absent last; two empty states** — Tasks 2 and 5. Timepoint, subject, view and paired-only filters are spec task 2.
- **§10.4 export the visible set, filename, per-study export unchanged** — Tasks 1 and 6.
- **§11.1 union of clinical keys, comment block kept, absent as empty** — Task 1.
- **§11.3 "Exported N rows"** — Task 6.
- **§14 pure tests; smoke on data attributes; silent-suite rule** — Tasks 2, 3, 7.
- **§18 contract module list, state keys, `toCsv` signature; roadmap item 1** — Tasks 1, 3, 8.
- **§6 decision 7** (segmented-only default, count shown) — Task 5; **decision 8** (long export primary) — Task 6; **decision 9** (nothing drops silently: the export names its row count, the filter names its hidden count) — Tasks 5 and 6.

Names used across tasks were checked against each other: `mountParameters(host, {onOpen})`, `update(live, queried)`, `HAND_ADDED`, `DEFAULT_FILTERS`, `DEFAULT_SORT`, `measurementColumns`, `parameterValues`, `formatParameter`, `workspaceOptions`, `folderOptions`, `normaliseFilters`, `filterParameters`, `hiddenUnsegmented`, `sortParameters`, `emptyReason`, `exportFileName`, `toCsv(studies, opts)`, `lastSegment`, and the store keys `studiesTab`, `paramFilters`, `paramSort`, `paramLevels`.

---

## Ledger

This section travels with the repo. Append a session-end line at every wrap; record every decision
made in chat as `Ruling: <what> — <why> — <cost if wrong>`.

Session ended 2026-09-06: resume at **Task 1** (nothing implemented; unit 293/293 at the wrap).
Execution method chosen by the user: subagent-driven, a fresh subagent per task with two-stage
review; Sonnet for Tasks 1, 2, 3, 7 and 8, Opus for Tasks 4, 5 and 6; never Fable.

Rulings from the brainstorm and planning session (HANDOFF decisions 27–36 carry the same list):

- Ruling: subject, timepoint and film date are optional null-default fields on the film record, not
  folders, not clinical-map entries, not a patient entity, and no `STORE_VERSION` bump — folders
  cannot pair a hand-added or second-load film and give a one-year follow-up no home; a clinical-map
  entry cannot be acted on by the app; a patient entity carries nothing the per-film clinical map does
  not — cost if wrong: a later patient entity migrates two string fields into a `patients` array, a
  one-time lift.
- Ruling: the key is "Subject", a study code, never "Patient" or an MRN, and it is never burned into
  the film — PHI, the same reasoning as HANDOFF decision 26 — cost if wrong: a user who wants MRNs
  keeps a key elsewhere.
- Ruling: timepoint is an ordered label (Pre-op, Intra-op, Post-op, N wk/mo/yr, custom), not a
  two-value enum — fusion research has 6-week, 1-year and 2-year films; deformity work has intra-op —
  cost if wrong: pairing names a label rather than a boolean, and a misspelt label pairs nothing.
- Ruling: view is seeded from folder and stem tokens that name a position, never inferred from a
  timepoint, and a per-folder assignment table on the Workspace card replaces any per-load selector
  or null-until-set — the no-fabrication rule, and a whole-batch selector mislabels a
  flexion/extension workspace — cost if wrong: a layout with one folder per subject gets a long
  table; the column-header set-all control mitigates and row collapsing is the recorded escalation.
- Ruling: the acquisition date is "Film date" (`filmDate`); the Find tab's DATE stays the date
  added; a bare `date` CSV header is not recognised — two columns called DATE meaning different
  things, and a clinical sheet's `date` is as likely the surgery date — cost if wrong: a CSV headed
  `date` has to be renamed `film_date` or `study_date`.
- Ruling: no per-field provenance flag for seeded values; explicit (CSV) beats inferred (folder);
  nothing overwrites a stored value on load — the grid shows every value and the load message says
  what was inferred; matches the fill-blanks rule — cost if wrong: which values were guessed versus
  typed cannot be told apart later without re-loading.
- Ruling: the Parameters tab defaults to segmented-only and says how many it hides; long export is
  primary and the paired export ships last; nothing drops silently — the tab is for numbers; stats
  packages pivot long format in one line; the paired export shares its delta code with comparison
  mode — cost if wrong: an Excel-first user waits for spec task 4 for the wide file.
- Ruling: `toCsv` exports the union of clinical keys on the exported rows and drops its `fields`
  parameter — roadmap item 1's third decision; a hidden column vanished from the file with nothing
  to say so — cost if wrong: the file can carry a column the user deliberately hid, and the
  per-study export on Analysis changes with it.
- Ruling: task 1 sorts by study name, not id, and the Studies search box applies to the grid — there
  is no id column, and a visible control that does nothing on one tab reads as broken — cost if
  wrong: the spec's §10.3 wording is amended in Task 8; an id sort would need an id column.
- Ruling: branch strategy is a docs-only branch off `claude/studies-ui-updates-bb040d`, rebased onto
  its tip whenever the other session moves it, merged back when task 1 is done; pushed to `fork` as
  a backup, which publishes nothing — the preview workflows fire only on `ui-redesign-cw` — cost if
  wrong: none identified; the branch name can never build an installer.

Session 2026-09-06 (execution, subagent-driven) — pre-flight rulings before Task 1. The full scan table is
in `.superpowers/sdd/2026-09-06-parameters-tab/progress.md` (git-ignored; these lines are the durable copy).

- Ruling: Task 7's acceptance is 22/22, not the "21/22" its step 2 prints — the same task writes 22/22
  into the README baseline and the user said 22/22; a failing check is a finding to investigate — cost if
  wrong: one fix loop on a check the author expected to fail.
- Ruling: Task 7's README edit targets the second "Known baseline" paragraph (the one listing
  smoke-studies/workspace/persist) and corrects that line's stale unit figure (291) to 318 while touching
  it — cost if wrong: one number in a README.
- Ruling: Task 7's README sentence "can run before or after any other suite on the same instance" becomes
  "run it first on a fresh launch, before the suites that add real films"; the suite code stays as written,
  because its `Added by hand` check assumes only demos have no workspace root — cost if wrong: a README
  sentence.
- Ruling: Task 8 replaces the existing HANDOFF section "Pre-op/post-op organisation — spec and plan
  written, nothing implemented" with the plan's new "Parameters tab — task 1 …" section at the same
  position, rather than inserting beside it and leaving two sections that contradict each other — cost if
  wrong: a paragraph restored from git.
- Ruling: CLAUDE.md's branch paragraph and NEXT-SESSION.md are left to the session wrap, not to Task 8 —
  cost if wrong: the next session reads one stale paragraph before HANDOFF corrects it.

Rulings made during execution (2026-09-06, before the Task 4 gate):

- Ruling: Tasks 4, 5 and 6 commit their code BEFORE the human gate with the body line "Manual
  verification: pending the human gate — outcomes recorded here by amendment before the next task
  starts", and the controller amends that still-unpushed HEAD commit's message with the user's
  outcomes afterwards — the plan wants the outcomes in the commit body, the user wants each gate
  stopped at and asked, and an uncommitted working tree across a session boundary is fragile — cost
  if wrong: one unpushed commit message rewritten.
- Ruling: before each human gate the DOM task's implementer drives the same manual checks over the
  CDP harness on a scratch profile (clicks, typed text, Tab/Enter, screenshots, console errors) and
  records the outcomes in its report, so the human's run is a confirmation with real gestures — each
  stop costs a whole round trip and the harness exists for exactly this — cost if wrong: one extra
  launch per DOM task.
- Ruling: `sameKey` stays a module-private three-line predicate in `screens/parameters.js`
  (Task 4's review flagged the verbatim copy as plan-mandated duplication) — five copies already
  exist (`components/clinical-data.js`, `components/measurements.js`, `components/viewer.js`,
  `screens/studies.js`, and this one), the plan followed that established per-module redraw-gate
  pattern, and consolidating all five into `dom.js` is a cross-cutting refactor outside this plan;
  Task 8 records it as a ROADMAP item — cost if wrong: a three-line predicate lives in five files
  until someone consolidates it.

Harness note (Task 4's dry run): `tools/smoke/cdp-lib.mjs`'s `key('Enter')` dispatches keyDown/keyUp
with no `text`, so Blink emits no keypress and a native `<button>` never activates; sending the same
event with `text: '\r'` works. A harness gap, not a product defect; Task 7's suite clicks and never
presses Enter. Worth fixing in `key()` when the harness is next touched.

Session paused 2026-09-06: Tasks 1–3 complete (bee39cf, 68dbac2, 6b5d4ed; unit 318/318). Task 4 code
complete at 76695ad, reviewed clean (one parked finding above), harness dry run 6/6 — **awaiting the
human gate** (the six checks in Task 4 step 5). Resume by amending 76695ad's message with the
outcomes, then Task 5 (brief already generated; Opus implementer).

Task 4 human gate (2026-09-06): checks 1–5 pass on the user's real library (112 studies, 13 segmented);
check 6 (console) not run by the human.

- Ruling: Task 4's check 6 is recorded as "not checked by the human" and closed on combined evidence —
  the harness dry run at the same commit asserted 0 console errors/exceptions over the same six steps,
  and checks 2–3 rendered correctly, which `update()` could not have done had it thrown — with a human
  console check repeated at Task 5's gate (its step 11) — cost if wrong: a console error specific to the
  user's library goes unseen for one task.
- Process note: no docs commit goes between a DOM task's commit and its gate from here on (the ledger
  commit above Task 4's commit forced both to be re-created to amend the body); the plan ledger is
  written to disk uncommitted during a pause and committed after the amend.

Task 4 complete. Resume at Task 5 (brief generated; Opus implementer).

Session paused 2026-09-06 (second gate): Task 5 code complete at 182f4d6, reviewed clean (8 deferred
minors in the working ledger), harness dry run 11/11 — **awaiting the human gate** (the eleven checks
in Task 5 step 4; its step 11 also closes Task 4's unchecked console step). Resume by amending
182f4d6's message with the outcomes (it is HEAD; nothing is committed above it), then Task 6.

Task 5 human gate (2026-09-07): all eleven checks pass on the user's real library (112 studies, 13
segmented); no lag on search; the console check also closes Task 4's unchecked step 6. Task 5 complete.

Session paused 2026-09-07 (third gate): Task 6 code complete at c2409dd, reviewed clean, harness
13/13 on the reachable parts — **awaiting the human gate** (the five checks in Task 6 step 6: the
native save dialog, cancel without a toast, the toast's row count, the file's header). Resume by
amending c2409dd's message with the outcomes (it is HEAD), then Task 7.

Decisions with the user (2026-09-07, at the Task 6 gate):
- Ruling (user): the CSV's `Source` column and the unused `includeDemo` option are removed from `toCsv`
  — the export dialog that would have set the option was never built, nothing passes it, and no
  installer ships demos, so the column reads `real` on every row of every file the app can write; the
  import does not read it — cost if wrong: a fabricated demo row could no longer be marked, and no path
  writes one. Lands as a task appended after Task 8 and the final review.
- Ruling (user): "export selected studies" (checkbox column, header select-all, selection as a store key
  replaced wholesale, `Export N selected` when any visible row is selected else all visible, `N SELECTED`
  on the count line, the toast names the count) is a spec addendum to §10.4 with its own reviewed tasks
  and one more human gate, sequenced after Tasks 7–8 and the final whole-branch review and before the
  merge back — cost if wrong: one more gate before the merge.

Task 6 human gate (2026-09-07): checks 2, 3, 4, 5 pass on the user's real library; check 1 and the
`<root>-parameters.csv` half of check 3 are not reachable there (no demos-only view, no workspace
root) and stand on the harness's assertions on the scratch profile. Task 6 complete.

## Execution record (2026-09-06/07) — rulings and deferred findings carried out of the scratch ledger

Plan complete at `3bd633f`: eight tasks, three human gates, a final whole-branch review ("with fixes"), one fix wave, one scoped re-review (clean). Unit 322/322; `smoke-parameters.mjs` 22/22; `smoke-studies.mjs` 60/60. Every ruling made while executing, in order (the pre-flight and gate rulings above are repeated here only where they were not already recorded):

- - Ruling: Tasks 4, 5 and 6 commit their code BEFORE the human gate with a body line "Manual verification: pending the human gate — outcomes recorded here by amendment before the next task starts"; after the user reports, the controller amends that still-unpushed HEAD commit's message with the outcomes. — The plan wants the outcomes in the commit body, the user wants the gate stopped at and asked, and an uncommitted working tree across a session boundary is fragile. — Cost if wrong: one unpushed commit message rewritten.
- - Ruling: before each human gate, the DOM task's implementer drives the same manual checks over the CDP harness on a scratch profile (everything the harness can reach: clicks, typed text, Tab/Enter, screenshots, console errors) and records the outcomes in its report, so the human's run is a confirmation with real gestures, not a first look. — Each stop costs a whole round trip; the harness exists for exactly this. — Cost if wrong: one extra launch per DOM task.
- Task 4: parked — sameKey duplication — Ruling: the helper stays module-private in screens/parameters.js. Five copies already exist (components/clinical-data.js:90, components/measurements.js:78, components/viewer.js:120, screens/studies.js:242, plus this one): the plan followed the codebase's established per-module redraw-gate pattern, and consolidating all five into dom.js is a cross-cutting refactor outside this plan; Task 8 records it as a ROADMAP item so it is not lost. — Cost if wrong: a three-line predicate lives in five files until someone consolidates it.
- - Ruling: the final whole-branch review covers 868fe25..HEAD (this execution's range); the docs-only commits 9735202..868fe25 are the spec and the plan themselves, written and reviewed with the user in the previous session, and the reviewer gets them as files — cost if wrong: the final reviewer does not re-read a diff of the spec and plan text.
- - Ruling: the fix wave (ONE dispatch, Opus) takes the Important (#1, as a pure `patchFilters` helper with tests) plus the cheap, safe minors #2 (scroll restore + the CSS comment), #6 (gate the panel on studiesTab, before lastKey), #10 (no accent mark on an absent PI), and the docs of #5 (spec §10.2/§10.3 wording) and #3 (a ROADMAP accessibility line) — each is a few lines and the reviewer judged #6 provably safe — cost if wrong: a larger fix diff for the scoped re-review.
- - Ruling: #4 (the disabled Export button's title never shows) is carried into the export-selected-studies addendum, which reworks that button — cost if wrong: the "why" stays invisible until then.
- - Ruling: #7, #8, #9, #11 stay deferred: #7/#8/#9 as grid polish for the roadmap, #11's README paragraph for the session wrap (after the addendum changes the export again) and the contract's test listing was already stale before this branch — cost if wrong: a README without the tab for one more session.
- - Ruling (spec §10.2): the study name is the row's link and click target; the whole row is not a click target — table semantics with a per-row link is the spec's own second clause and a whole-row click fights the table's other affordances — cost if wrong: a user aiming at a number cell gets nothing.
- - Ruling (spec §10.3): there are no filter chips; each control shows and clears its own value (a dropdown's All entry, a checkbox's untick) — a chip would repeat the select beside it — cost if wrong: spec task 2 (subject/timepoint/view filters) revisits chips when there are more controls.

Deferred minors from the per-task and final reviews — the final review triaged all of them as not blocking the merge; the ones that matter are on the roadmap (`sameKey` consolidation, the ARIA tabs pattern) or ride with the addendum tasks:

- Task 1: minor (deferred): task-1-report.md RED narrative says 21 of 44 csv tests failed; only the 10 toCsv tests could — evidence-accuracy only, GREEN confirmed.
- Task 1: minor (deferred): test/csv.test.js:82 title says "carries a value" but the union keys off key presence (`clinical: { Age: '' }` yields an Age column) — brief's wording inherited; suggest "carries a clinical key".
- Task 1: minor (deferred): test/csv.test.js:64-80 has one custom field, so first-seen order of custom columns is not discriminated at the toCsv level (the clinicalFieldNames test covers it directly).
- Task 1: minor (deferred, pre-existing): renderer/data/csv.js:71 `study.clinical[field] != null` is not an own-property check; a custom key named like an Object.prototype member (`constructor`, `toString`) would stringify a function into other rows' cells. Remote; hardening is a one-line hasOwnProperty guard.
- Task 2: minor (deferred): parameters.js:24,31 Object.freeze is shallow; column objects shared via measurementColumns copies could be mutated by a future renderer.
- Task 2: minor (deferred): parameters.js:110,120,129,169 an explicit `segmentedOnly: undefined` in filters flips segmented-only OFF via spread; unreachable — the store seeds the key and T5's setFilters writes booleans.
- Task 2: minor (deferred): parameters.js:84 option label falls back to `root` where workspaceLabel falls back to U+2014 (root `/` only); unreachable from the picker.
- Task 2: minor (deferred): parameters.js:87 collision check is case-sensitive (Pre-Op vs pre-op not treated as colliding); cosmetic.
- Task 2: minor (deferred): parameters.js:167-172 emptyReason ignores segmentedOnly; unreachable via filterParameters.
- Task 2: minor (deferred): parameters.js:46,58,63 parameterValues/isSegmented/rootOf do not guard a null study, unlike labels.js siblings; unreachable from real records.
- Task 2: minor (deferred, plan-mandated wording): labels.js:32-33 the new lastSegment comment drops the "'' for an empty path" line; pinned by the new test only.
- Task 3: minor (deferred, pre-existing): store.js getState() freezes only the top level; nested `paramFilters`/`paramSort` objects are mutable in place — enforcement of "replaced wholesale" is by comment; T5's setFilters spreads a new object, to be checked in its review.
- Task 3: minor (deferred, brief wording): the store comment and the contract line say the keys are read by screens/studies.js only; the brief's Interfaces also names screens/parameters.js.
- Task 4: minor (deferred, plan-mandated): parameters.js:12 imports DEFAULT_FILTERS unused; Task 5 replaces the file and uses it.
- Task 4: minor (deferred, plan-mandated): styles/screens/studies.css:268-271 .param-table-wrap is dead until Task 5.
- Task 4: minor (deferred): tab strip lacks aria-controls / roving tabindex / arrow keys (WAI-ARIA APG polish); screen-reader output is correct as is.
- Task 4: minor (deferred): `queried` is computed before the table's gate now — one Array.filter per Studies notification; deliberate.
- Task 5: minor (deferred): parameters.js:131 a row with measurements but PI/PT/SS absent gets NaN residual → isConsistent false → a `—` PI cell painted accent with the warning; mirrors the Measurements panel; guard `values.PI !== null &&` if ever seen.
- Task 5: minor (deferred, brief-mandated): the consistency mark is colour + title only (WCAG 1.4.1).
- Task 5: minor (deferred): parameters.js:80 `title` on <option> is inert in Chromium's native menulist; harmless.
- Task 5: minor (deferred, Task 4 gate design): update()'s key lacks studiesTab, so the grid rebuilds on every search keystroke while the Find tab is up — cost grew from one div (T4) to ~11 nodes/row (T5).
- Task 5: minor (deferred): the bar mixes scopes — hidden count over the searched subset, count-line denominator over the whole library (`3 OF 112 · 2 unsegmented hidden` invites a wrong subtraction).
- Task 5: minor (deferred): parameters.js:163 `field.toUpperCase()` mangles a user-typed field name (eGFR → EGFR) and is locale-unsafe; `text-transform: uppercase` would keep the accessible name; `fields` dedupes case-sensitively so Age/age give two AGE columns.
- Task 5: minor (deferred): only the name is clickable, not the row (spec §10.2 says both "clicking a row" and "a per-row link"; the brief chose the link); no pointer cursor elsewhere on the row.
- Task 5: minor (deferred): parameters.js:197 `typeof candidate.focus === 'function'` guard is dead.
- Task 6: minor (deferred, brief-mandated): parameters.js exportVisible — `toCsv(visible, {})` sits outside the try; a throw there would reject the discarded promise silently; unreachable today (escapeField/measurementValue/clinicalFieldNames are null-safe).
- Task 6: minor (deferred, brief-mandated): the `{}` second argument to toCsv is redundant (defaulted).
- Task 6: design note (not a defect): with demos and real rows both visible the demo drop is disclosed only by the toast's count differing from the N OF M chip — the mechanism §11.3 names; the brief rules out a tooltip on the enabled button.
- Task 7: minor (deferred): smoke-parameters.mjs finally does not restore `screen` — on a throw between checks 20 and 21 it nulls openId with screen left 'analysis' (the analysis.js:530 warning); benign, next suite sets screen; add `screen: "studies"` to the cleanup patch.
- Task 7: minor (deferred): README section never says that empty output means the suite threw (house pattern; the brief's Step 2 says it but nothing committed does).
- Task 7: minor (deferred): README does not state the SP-0042 / demo-library precondition of checks 7–8.
- Task 7: minor (deferred): check 9 (default sort) compares only the first two names with <=, so equal names pass; weak.
- Task 7: minor (deferred): checks 3, 5, 11, 16, 19 pass no detail (a failure prints `-> undefined`); check 19 (focus restore) is the one most worth a detail.
- Task 7: minor (deferred): the two selects are selected by class though both carry data-param-key; not a label selector.
- Task 8: minor (deferred, brief-verbatim): ASCII `--` where the docs use `—` (HANDOFF:39, contract:142); contract:113 runs to 135 columns; HANDOFF:27 records the commit set as a git-log recipe that stops resolving after the merge.

Addendum approved by the user 2026-09-07 (bounded path, design in chat): Tasks 9–12 above — the
`Source` column and the include-demo option leave `toCsv`; ticked rows export as a chosen subset.
- Ruling (user): hidden picks — the export writes the selected rows that are VISIBLE, in grid order;
  hidden picks stay ticked and return with the filter — the file always matches what is on screen —
  cost if wrong: a user expecting a fixed list exports fewer rows than they ticked, but the button
  label and the count line say exactly how many.
- Ruling: the row checkbox lives inside the sticky STUDY cell rather than in a new first column — the
  spec's sticky first column and the `<th scope="row">` semantics stay untouched — cost if wrong: a
  crowded first cell on narrow windows.

Session paused 2026-09-07 (fourth gate): Task 11 code complete at 956894e, reviewed clean, harness dry
run 11/11 — **awaiting the human gate** (the eight checks in Task 11 step 7, plus clicking select-all
while it is indeterminate). Resume by amending 956894e's message with the outcomes (it is HEAD), then
Task 12.

Task 11 human gate (2026-09-07): all eight checks pass on the user's real library; clicking the
indeterminate select-all selects every visible row; no bar wrap issue. Task 11 complete.

## Execution record, addendum (2026-09-07) — rulings and deferred findings carried out of the scratch ledger

Addendum complete at `211a2b8`: Tasks 9–12, one fix round on Task 10, one human gate on Task 11, a whole-addendum review ("with fixes"), one fix wave, one scoped re-review (clean). Unit 333/333; `smoke-parameters.mjs` 33/33; `smoke-studies.mjs` 60/60; `smoke-workspace.mjs` 96/96.

- - Ruling: the addendum fix wave (ONE dispatch, Opus) takes the three Importants — the spec sentence; a prune of the deleted id in deleteStudy via withIds plus a smoke check that a deleted ticked study's id is gone from paramSelected; aria-label on the two <th>s — and the README unit figure while that file is touched for the new smoke total — cost if wrong: a larger fix diff for the re-review.
- - Ruling: the accessible-name finding is FIXED now rather than promoted to the roadmap — the fix is two attributes and §10.2's reason for table semantics is accessibility — cost if wrong: an aria-label on a <th> that a screen reader handles differently than expected; the human can check with Narrator later.
- - Ruling: the Analysis screen's title-only disabled reason and the absence of a clear-selection control go to the ROADMAP at the session wrap, with HANDOFF's stale lines (22 checks, "docs only", four keys, toCsv(studies, opts)) — cost if wrong: one more session before they are addressed.

Deferred minors from the addendum reviews — the whole-addendum review triaged the three that mattered into its fix wave; the rest may stay deferred:

- Task 9: minor (deferred): contract:594 one 106-char line not reflowed.
- Task 9: minor (deferred, out of scope by brief): tools/smoke/out/task6-export.mjs (git-ignored scratch) still pins the old header with Source.
- Task 10: minor (deferred): withIds(off) with empty ids not pinned as a new array (a same-reference short-circuit would pass).
- Task 10: minor (deferred, brief's insertion point): contract:283-284 the "All four are read by…" comment now trails five keys — should say five; store.js:10-13 block comment lists four concerns.
- Task 10: minor (deferred): includes-inside-filter is O(n·m); irrelevant at library scale.
- Task 11: minor (deferred): the row <th scope=row> and the STUDY <th scope=col> accessible names now include the tick's aria-label text; if a screen reader confirms the doubling, aria-labelledby on the two <th>s pointing at the name/sort button is the fix.
- Task 11: minor (deferred): a selection of only demo rows shows `Export N selected` greyed with the note "Demo studies are not exported" — accurate but the label and note describe different things.
- Task 11: minor (deferred): `label: null` as the bare-box switch in checkbox() is subtle; `bare: true` would be harder to misuse.
- Task 11: minor (deferred): `flex: none` on .param-pick is inert (parents are table cells).
- Task 11: minor (deferred): stale ids accumulate in paramSelected when a ticked study leaves the library; harmless (selectedVisible ignores them), session-only, nothing prunes.
- Task 12: minor (deferred): smoke check :119 `includes('1 SELECTED')` also matches `11 SELECTED` (its sibling label check catches the bug); :152's title claims the untick landed but the note reads the same either way; :141 is a negative assertion; :127 degenerates without demos; README sentence has two "and"s (brief-verbatim); nothing pins withIds leaving hidden ticks alone or the `Nothing to export` note branch.
- Task 12: minor (for the wrap): HANDOFF.md:34 still says the suite has 22 checks (now 32) and README:259 claims parity with HANDOFF's baseline paragraph.

Session ended 2026-09-07: the plan (Tasks 1–8) and its addendum (Tasks 9–12) are complete at
`211a2b8` plus the docs above it; two whole-branch reviews with their fix waves re-reviewed clean;
unit 333/333, `smoke-parameters.mjs` 33/33, `smoke-studies.mjs` 60/60, `smoke-workspace.mjs` 96/96.
Nothing is half-done and no finding is open. Resume at: (1) the merge back into
`claude/studies-ui-updates-bb040d` — the user's call, never unasked; (2) spec task 2 (subject,
timepoint, film date, view, the Workspace folder table), which has no plan yet — brainstorm against
spec §7–§9, then superpowers:writing-plans, then subagent-driven execution as before.
- Ruling: the wrap adds a user-facing README section for the Parameters tab (the first whole-branch
  review found the README silent on it) and two ROADMAP bullets under item 5 (the Analysis export
  button's invisible disabled reason; no clear-selection control) — records, not code — cost if
  wrong: a paragraph to edit.
- Ruling: HANDOFF's header, its Parameters section, decisions 37–39 and four new traps, CLAUDE.md's
  branch paragraph and NEXT-SESSION.md are edited in place at the wrap; the scratch SDD workspace
  under `.superpowers/sdd/` is kept (git-ignored) until the branch is finished — cost if wrong: prose.
