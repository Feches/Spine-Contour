# Find list header filters, REGION column and Unknown view — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every column of the Find list filters and sorts from a funnel menu in its header, a REGION column shows what each film is, and an imported film's view defaults to Unknown without blocking its run.

**Architecture:** The pure logic stays in `renderer/data/` (`find.js` owns the list's filters, order and options; `cervical.js` the region key and label; `inference-view.js`, `seeding.js`, `persistence.js`, `csv.js`, `parameters.js` the Unknown view), the screen in `renderer/screens/studies.js` with one new focused component, `renderer/components/filter-menu.js`, for the header menu. The store gains `findFilters` and loses `findStatus`; the Analysis screen's previous / next keeps reading `data/find.js`, so it follows the menus for free.

**Tech Stack:** Vanilla ES modules in Electron's renderer, `node --test` for unit tests, the CDP smoke harness in `tools/smoke/` for the DOM.

**Spec:** `docs/superpowers/specs/2026-10-19-find-list-header-filters-region-view-design.md` (decisions F1–F9).

## Global Constraints

- Branch `worktree-reviewer-navigation`, worktree `.claude/worktrees/reviewer-navigation`; every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; nothing is pushed.
- Unit suite: `node --test test/*.test.js` must stay green at every commit (1123 passing at the start).
- `data/` never imports from `screens/` or `components/`.
- Labels, exactly: `Unknown`, `Lumbar`, `Cervical`, `Full spine`; menu items `All`, `None`; the seven status labels from `statusLabel`; the empty copy `No studies match these filters.` unchanged.
- Hook names for the harness, exactly: `filter-<column>` (the funnel), `filter-<column>-all`, `filter-<column>-none`, `filter-<column>-<value key>`, `filter-<column>-text` (SUBJECT's box), `sort-<column>-asc`, `sort-<column>-desc`, `filter-<column>-close`; columns `subject`, `region`, `view`, `workspace`, `folder`, `status`; value keys are the stored value, or `__unknown__` (no view / no region), `__hand__` (no workspace root).
- The view is `string | null`; nothing rewrites a stored view; `DEFAULT_VIEW` stays exported.
- No STORE_VERSION bump (spec F8).
- No screenshots that show a real film; CDP checks read the DOM and the store.

## Review Focus

1. A record stored with `view: ''` by the old drawer must read Unknown and pass the gate — pinned in Task 2 (`validateStudy` nulls it; `inferenceView('')` is lateral).
2. A CSV import whose View cell is blank for a film that already has a stored view keeps the stored view — pinned in Task 2 (`seedFields` order).
3. FOLDER ticks that the current WORKSPACE ticks no longer offer are dropped — pinned in Task 4 (`normaliseFindFilters`).
4. A result that recorded no region (an old lumbar run, a demo study) reads Lumbar, never Unknown — pinned in Task 1 (`regionKey`).
5. A film the ticked STATUS no longer matches (marked reviewed under Needs review) still has a next and a previous — pinned in Task 4 (`findNeighbour` under `findFilters`).

---

### Task 1: Region key and label

**Files:**
- Modify: `renderer/data/cervical.js` (beside `studyRegion`, line 15)
- Test: `test/cervical.test.js`

**Interfaces:**
- Produces: `regionKey(study) -> 'unknown' | 'lumbar' | 'cervical' | 'full_spine'`; `regionLabel(key) -> 'Unknown' | 'Lumbar' | 'Cervical' | 'Full spine'`; `REGION_KEYS = Object.freeze(['unknown', 'lumbar', 'cervical', 'full_spine'])`. The menu's value key for `unknown` is Task 4's concern.

- [ ] **Step 1: Write the failing tests** in `test/cervical.test.js`:

```js
test('regionKey: the region set by a person, else the one the run detected, else a lumbar result with none, else unknown', () => {
  assert.equal(regionKey({ region: 'cervical', geometry: { region: 'lumbar' } }), 'cervical');
  assert.equal(regionKey({ region: 'auto', geometry: { region: 'full_spine' } }), 'full_spine');
  assert.equal(regionKey({ region: 'auto', geometry: null, measurements: null }), 'unknown');
  assert.equal(regionKey({ region: 'auto', geometry: { region: 'bogus' }, measurements: { PI: 50 } }), 'lumbar', 'a result that recorded no valid region is an old lumbar one');
  assert.equal(regionKey({ source: 'demo', measurements: { PI: 50 } }), 'lumbar');
  assert.equal(regionKey({}), 'unknown');
  assert.equal(regionKey(null), 'unknown');
});
test('regionLabel reads the four labels and Unknown for anything else', () => {
  assert.deepEqual(REGION_KEYS.map(regionLabel), ['Unknown', 'Lumbar', 'Cervical', 'Full spine']);
  assert.equal(regionLabel('bogus'), 'Unknown');
});
```

- [ ] **Step 2: Run** `node --test test/cervical.test.js` — FAIL: `regionKey` is not exported.
- [ ] **Step 3: Implement** `regionKey`, `regionLabel` and `REGION_KEYS` in `renderer/data/cervical.js`. Rule: `study.region` in `lumbar|cervical|full_spine` → it; else `study.geometry?.region` in those three → it; else `study.measurements != null` → `lumbar`; else `unknown`.
- [ ] **Step 4: Run** `node --test test/cervical.test.js` — PASS.
- [ ] **Step 5: Commit** `feat: regionKey and regionLabel -- the region a person set, else the one the run detected, else Unknown`.

### Task 2: The Unknown view in the data layer

**Files:**
- Modify: `renderer/data/inference-view.js`; `renderer/data/persistence.js:184-186` and `:227`; `renderer/data/seeding.js:57-59` and `:159`; `renderer/screens/studies.js` (`newStudy` `view: DEFAULT_VIEW` → `null`; `studyFromFile` unchanged, it spreads the seeded fields); `renderer/data/csv.js:145` (`study.view ?? ''`) and `:220` (already `?? ''`).
- Test: `test/inference-view.test.js`, `test/persistence.test.js`, `test/seeding.test.js`, `test/studies.test.js`, `test/csv.test.js`, `test/batch.test.js`

**Interfaces:**
- Produces: `inferenceView(view)` returns `'lateral'` for `null`, `undefined`, `''`, whitespace and the word `unknown` in any case; `validateStudy` stores `view: null` for a missing, empty or non-string view (no throw); `seedFields(...).fields.view` is `null` when nothing names a view and `sources.view` is then `null`; `newStudy(...).view === null`.

- [ ] **Step 1: Rewrite the two tests in `test/inference-view.test.js`:** the second test's list becomes `['AP', 'PA', 'oblique', 'AP/lateral', 'AP lateral', 'lateral oblique']` and a new test asserts `inferenceView(v) === 'lateral'` for `[null, undefined, '', '  ', 'unknown', 'Unknown', ' UNKNOWN ']` with the comment that an Unknown view is the backend's to classify (spec §5.2).
- [ ] **Step 2: Write the failing tests:**
  - `test/persistence.test.js`: `validate round-trips a null view, nulls an empty or non-string one with one warning, and keeps a stored label` — `validate({ version: STORE_VERSION, studies: [{ ...identity('SP-1001'), view: null }] })[0].view === null`; `view: ''` → `null` with exactly one `console.warn` (use the file's `t.mock.method(console, 'warn')` pattern); `view: 42` → `null`; `view: 'Flexion lateral'` kept.
  - `test/seeding.test.js`: `folderRows seeds no view for a folder that names none` — `folderRows(['root/pre-op/a.png'], 'root')[0].view === null`, and `['root/flexion/a.png']` → `'Flexion lateral'`; `seedFields: nothing names a view -> null with a null source; a stored view wins over a blank CSV cell` — `seedFields({ filePath: 'root/S001/a.png', root: 'root' }).fields.view === null` and `.sources.view === null`; `seedFields({ filePath: 'root/a.png', root: 'root', existing: { view: 'Supine lateral' }, csv: { view: null } }).fields.view === 'Supine lateral'` with source `'stored'`.
  - `test/studies.test.js`: `newStudy seeds no view` — `newStudy({ id: 'SP-1000', fileName: 'a.png' }).view === null`; `studyFromFile({ id, fileName: 'S1_flexion.png' }).view === 'Flexion lateral'`; `matchesQuery({ id: 'SP-1000', view: null }, 'sp-1000') === true`.
  - `test/csv.test.js`: `toCsv writes an empty View cell for a film with none` — the data row of a study with `view: null` has `''` in the View column (reuse the file's row-parsing helper).
  - `test/batch.test.js`: `planBatch offers a film whose view is unknown and never counts it unsupported` — `planBatch({ visible: [unsegmented('SP-1', { view: null })], selected: [], running: null })` has `ids` `['SP-1']` and a `note` of `null`.
- [ ] **Step 3: Run** the six files — FAIL on each new test.
- [ ] **Step 4: Implement:** `inferenceView` (the `label === '' || label === 'unknown'` branch returns `'lateral'` before the lateral list; non-string returns `'lateral'` too); `validateStudy` replaces the throw at :184 with `view: optionalText(entry.view)` written at :227, warning once when `entry.view !== undefined && entry.view !== null && optionalText(entry.view) === null`; `rowForSegments` returns `view: inferred.view` (null allowed); `seedFields`' `pick('view', …)` drops the `['default', DEFAULT_VIEW]` candidate and its comment says so; `newStudy` seeds `view: null`; `toCsv` writes `study.view ?? ''`.
- [ ] **Step 5: Run** `node --test test/*.test.js` — PASS (watch `test/workspace.test.js`, whose load-message expectations may count a `view` source that no longer fires; update its expectations to the new counts, not the code).
- [ ] **Step 6: Commit** `feat: the view is Unknown (null) until a person or a name sets it, and an Unknown view passes the segmentation gate`.

### Task 3: Unknown on screen: the list, the grid, the drawer, the import table, the header

**Files:**
- Modify: `renderer/data/parameters.js:174-182` (`viewOptions`), `:283-293` (`filterParameters`'s view clause), a new `NO_VIEW = '__unknown__'` export; `renderer/screens/parameters.js:295` (`study.view || DASH` → `study.view ?? 'Unknown'`, muted via class `param-cell-unknown`); `renderer/screens/studies.js:354` (the VIEW cell: `study.view ?? 'Unknown'`, class `studies-cell-unknown`); `renderer/components/clinical-data.js:168-180` (`setStudyField` stores `null` for an emptied view, like the other fields; the VIEW input's `placeholder` is `Unknown`); `renderer/screens/workspace.js:318-339` (`rowSelect` and `setAllSelect` take `none: 'Unknown'` for the VIEW column, `:358-360` and `:376-378`, writing `null` for `''`); `renderer/screens/analysis.js:1195` (`(open.view || 'Unknown')`).
- Styles: `styles/screens/studies.css` (`.studies-cell-unknown`, `.param-cell-unknown { color: var(--muted) }`).
- Test: `test/parameters.test.js`

**Interfaces:**
- Consumes: Task 2's null view.
- Produces: `NO_VIEW` (`'__unknown__'`); `viewOptions(studies)` appends `{ value: NO_VIEW, label: 'Unknown' }` last when any study has no view; `filterParameters` matches `NO_VIEW` to a null view.

- [ ] **Step 1: Write the failing tests** in `test/parameters.test.js`: `viewOptions lists the views present and Unknown last when a film has none` (`[{ view: 'Supine lateral' }, { view: null }, { view: 'Supine lateral' }]` → `[{ value: 'Supine lateral', label: 'Supine lateral' }, { value: NO_VIEW, label: 'Unknown' }]`; no null → no Unknown); `filterParameters: the Unknown view option keeps only films with none` (with `segmentedOnly: false`).
- [ ] **Step 2: Run** `node --test test/parameters.test.js` — FAIL.
- [ ] **Step 3: Implement** the data change, then the five screen edits listed above (the import table's VIEW `none` option reads `Unknown` and is the row's value when `row.view` is null; the "set all" writes `view: null` for `''`).
- [ ] **Step 4: Run** `node --test test/*.test.js` — PASS.
- [ ] **Step 5: CDP check** on a scratch launch (`tools/smoke/launch.mjs`, the smoke README): inject a record with `view: null` through `inject-study.js`'s pattern; the list's VIEW cell reads `Unknown` with class `studies-cell-unknown`, the Analysis header meta contains `UNKNOWN`, the grid's View filter offers `Unknown`; seed `wsFolderRows` with a row whose `view` is null (as `smoke-workspace.mjs` seeds) and read the folder table's VIEW select value `''` with first option text `Unknown`.
- [ ] **Step 6: Commit** `feat: an Unknown view reads Unknown on the list, the grid, the drawer, the import table and the header, and the grid filters by it`.

### Task 4: The Find list's filters in the store and the pure logic

**Files:**
- Modify: `renderer/store.js` (add `findFilters`, keep `findStatus` until Task 6); `renderer/data/find.js`
- Test: `test/find.test.js`

**Interfaces:**
- Consumes: `regionKey`, `regionLabel`, `REGION_KEYS` (Task 1); `NO_VIEW` (Task 3: the one sentinel, `'__unknown__'`, for a missing view AND a missing region in every menu); `workspaceOptions`, `folderOptions`, `toggleId`, `HAND_ADDED` from `parameters.js`; `statusLabel`, `displayStatus`.
- Produces, all in `renderer/data/find.js`:
  - `DEFAULT_FIND_FILTERS = Object.freeze({ subject: '', region: [], view: [], workspace: [], folder: [], status: [] })`
  - `FILTER_COLUMNS = Object.freeze(['subject', 'region', 'view', 'workspace', 'folder', 'status'])`
  - `findFilterOptions(studies, filters) -> { region: Option[], view: Option[], workspace: Option[], folder: Option[], status: Option[] }` where `Option = { value, label }`; region in `REGION_KEYS` order with `unknown` mapped to `NO_VIEW`, only keys present; view `{ NO_VIEW, 'Unknown' }` first when a film has none, then stored views A→Z; workspace `workspaceOptions(studies)` as is; folder `folderOptions` over the studies the WORKSPACE ticks keep (every study when none is ticked); status the seven pills in `STATUS_RANK` order, only those shown by some film (`displayStatus` with `null, null` — options never depend on a run).
  - `normaliseFindFilters(filters, studies) -> filters` (defaults filled, each array deduplicated and reduced to the values `findFilterOptions` offers, `folder` after `workspace`; `subject` a string)
  - `patchFindFilters(filters, studies, patch) -> filters` (`{ ...normaliseFindFilters(filters, studies), ...patch }`); a tick is `patchFindFilters(f, studies, { [column]: toggleId(f[column], value) })`
  - `matchesFindFilters(study, filters, runningId = null, batch = null) -> boolean` (F7; subject by the grid's contains rule — copy `matchesSubject` as `subjectMatches` here, two lines; region by `regionKey` with `unknown` ↔ `NO_VIEW`; view by `study.view ?? NO_VIEW`; workspace by `matchesLocation`'s root rule per ticked value, `HAND_ADDED` meaning no root; folder by `folderLabel`; status by `displayStatus(study, runningId, batch)`)
  - `activeColumns(filters) -> string[]` (columns with a tick or subject text, in `FILTER_COLUMNS` order)
  - `FIND_SORT_KEYS` gains `'region'` after `'subject'`; `sortValue` for `region` is `null` for `unknown`, else `regionLabel(key).toLowerCase()`.
  - `findPredicate(state)` applies `matchesQuery`, `matchesFindFilters(study, normaliseFindFilters(state.findFilters, studies), …)` AND, until Task 6 removes them, the existing `matchesLocation(paramFilters)` and `matchesStatus(findStatus)` clauses.

- [ ] **Step 1: Write the failing tests** in `test/find.test.js` (the file's `study()` helper; add `region`/`geometry.region` overrides as needed):
  - `findFilterOptions: region in workflow order, view with Unknown first, folder under the workspace ticks, status in pill order`
  - `normaliseFindFilters drops a value no longer offered and a folder outside the ticked workspaces` (Review Focus 3: ticks `workspace: ['C:\\films\\Cohort'], folder: ['Elsewhere']` → `folder: []`)
  - `matchesFindFilters: OR within a column, AND across columns, no ticks passes everything`
  - `matchesFindFilters: status follows the pill the row shows, with the running film and the batch` (the `matchesStatus` test's cases, through filters)
  - `findVisible, findNeighbour and findPosition read findFilters` (Review Focus 5: `status: ['rev']`, the open film marked reviewed → `findPosition.index === null`, `findNeighbour(…, 1)` the next Needs review film)
  - `activeColumns names the ticked columns in column order`
  - `sortFindRows by region puts Unknown last in both directions`
- [ ] **Step 2: Run** `node --test test/find.test.js` — FAIL.
- [ ] **Step 3: Implement** the exports above in `renderer/data/find.js` and add `findFilters: { subject: '', region: [], view: [], workspace: [], folder: [], status: [] }` to `renderer/store.js` beside `findStatus`, with a comment that Task 6 removes `findStatus`.
- [ ] **Step 4: Run** `node --test test/*.test.js` — PASS.
- [ ] **Step 5: Commit** `feat: findFilters -- the Find list's per-column ticks, their options, normalisation and matching, and the region sort key`.

### Task 5: The REGION column

**Files:**
- Modify: `renderer/screens/studies.js` (`buildRow` :352-376: a `studies-cell-region` cell after `subjectCell`, text `regionLabel(regionKey(study))`, class `studies-cell-unknown` when unknown; `buildTable` :436-446: `sortableHeader('region', 'REGION', sort)` after SUBJECT; `actionCell`'s confirming prompt starts one column later); `styles/screens/studies.css:74` (grid template gains `minmax(84px, 0.8fr)` after the SUBJECT track; the confirming prompt's `grid-column` start +1; `.studies-cell-region` font as `.studies-cell-view`); `renderer/data/csv.js:145-147` and `:220` (both exports' `Spine region` cell reads `regionLabel(regionKey(study))`; the `withRegions` rule and the anterior-side cell are unchanged).
- Test: `test/csv.test.js`; CDP.

**Interfaces:**
- Consumes: `regionKey`, `regionLabel` (Task 1); `FIND_SORT_KEYS` with `region` (Task 4).

- [ ] **Step 1: Write the failing test** in `test/csv.test.js`: `the Spine region cell reads the region label, Unknown for a film with no run` — a cervical result writes `Cervical`, an unsegmented auto film in the same export writes `Unknown`.
- [ ] **Step 2: Run** `node --test test/csv.test.js` — FAIL (`cervical` / `auto` today).
- [ ] **Step 3: Implement** the cell, the header, the CSS and the CSV cell.
- [ ] **Step 4: Run** `node --test test/*.test.js` — PASS (nothing pinned the column count; `smoke-studies.mjs` does, Task 7 updates it).
- [ ] **Step 5: CDP check:** the header row reads `STUDY, SUBJECT, REGION, VIEW, WORKSPACE, FOLDER, DATE, STATUS, ''`; a demo row reads `Lumbar`; an injected record with `region: 'cervical'` reads `Cervical`; an unsegmented auto record reads `Unknown`; clicking REGION sorts and the mark appears; a row's delete prompt still lays out on one line (`cdp.rect('.studies-cell-actions-confirming')` height under 40 px).
- [ ] **Step 6: Commit** `feat: the REGION column -- Unknown, Lumbar, Cervical or Full spine, sortable, and the CSV's region cell reads the same label`.

### Task 6: The header filter menus, the bar without its dropdowns, findStatus removed

**Files:**
- Create: `renderer/components/filter-menu.js`
- Modify: `renderer/screens/studies.js` (`sortableHeader` → `filterHeader`; `buildFilterBar` loses the three selects; `findRows` and `update()`'s key; module-scope `openMenu`); `renderer/store.js` (remove `findStatus`); `renderer/data/find.js` (remove `UNREVIEWED`, the `unreviewed` option, `findStatus` and `paramFilters` from `findPredicate`; keep `matchesStatus`, `STATUS_FILTERS` as the seven pills, `normaliseStatusFilter`); `renderer/screens/analysis.js:1251` (`navKey`: `live.findFilters` replaces `live.findStatus`, `live.paramFilters` goes); `styles/screens/studies.css` (`.studies-funnel`, `.studies-funnel.is-active`, `.studies-filter-count`, `.studies-filter-menu`, its rows, the text box; the header cell `position: relative`).
- Test: `test/find.test.js` (the `unreviewed` cases go; `STATUS_FILTERS` is the seven pills), `tools/smoke/smoke-reviewer.mjs` section 2 rewritten (below).

**Interfaces:**
- Consumes: Task 4's exports; `checkbox()` from `components/checkbox.js` with `variant: 'menu'` (add the variant: class `checkbox-row menu-check`, no `param-*` classes).
- Produces: `filterMenu({ column, label, options, ticked, subjectText, sortKey, sortDir, onToggle, onAll, onNone, onSubject, onSort, onClose, sortLabels }) -> HTMLElement` in `renderer/components/filter-menu.js` — the menu's DOM only (role `dialog`, `aria-label` `Filter by <label>`, keyed controls per the Global Constraints, Escape → `onClose`, focus on the first control when mounted); `filterHeader(...)` in `studies.js` builds the header cell: the sort button as today plus the funnel button (`data-find-key` `filter-<column>`, `aria-haspopup="dialog"`, `aria-expanded`, class `is-active` with the count span when `activeColumns` names the column, and then a `title` of `Filtered: <ticked labels, comma-separated>` — `Filtered: Cervical, Full spine` — or `Filtered: "<text>"` for SUBJECT; `Filter by <label>` otherwise) and, when `openMenu === column`, the menu mounted inside the cell.

- [ ] **Step 1: Remove `unreviewed`:** delete `UNREVIEWED`, its option and its tests; `STATUS_FILTERS` test expects the seven values; run `node --test test/find.test.js` — PASS.
- [ ] **Step 2: Build `filter-menu.js`** per the Interfaces block. Sort labels per column: `A to Z` / `Z to A` (subject, region, view, workspace, folder), `Workflow order` / `Reverse` (status). The SUBJECT menu renders the text box (`filter-subject-text`, `oninput` → `onSubject(value)`) in place of the value list.
- [ ] **Step 3: Wire the screen:** module-scope `let openMenu = null` (a column or null; cleared on navigation with the other prompts, listed in `update()`'s key); `filterHeader` for SUBJECT, REGION, VIEW, WORKSPACE, FOLDER, STATUS, plain `sortableHeader` for STUDY and DATE; the funnel's click toggles `openMenu` and calls `refreshTable('[data-find-key="filter-<column>"]')` (close) or focuses the menu's first control (open); a tick → `setState((s) => ({ findFilters: patchFindFilters(s.findFilters, s.studies, { [column]: toggleId(normaliseFindFilters(s.findFilters, s.studies)[column], value) }) }))`; `All` → `[]`; `None` → `[]`; subject text → `{ subject }`; a sort item → `findSort` and closes the menu; a document-level `pointerdown` outside the menu and its funnel closes it (registered while open, removed on close). `update()` keeps the menu open only while `findFilterOptions(...)[column]` and the column's ticks are unchanged (compare by `JSON.stringify` of the two, once per update, only while a menu is open); otherwise `openMenu = null`. `buildFilterBar` returns the bar without the three selects; `findRows` drops `filters`/`status` and returns `{ studies, query, queried, filters: normaliseFindFilters(...), visible }`; `emptyKind` is `'filters'` when `activeColumns(filters).length > 0`.
- [ ] **Step 4: Remove `findStatus`** from the store, `find.js`'s `findPredicate` (with its `paramFilters` clause) and `analysis.js`'s `navKey`; grep `findStatus` across `renderer/` and `test/` — none left.
- [ ] **Step 5: Run** `node --test test/*.test.js` — PASS.
- [ ] **Step 6: Rewrite `tools/smoke/smoke-reviewer.mjs` section 2** as the header menus: the funnel opens the STATUS menu (`aria-expanded` true, focus on `filter-status-all`); the options read the pills present; ticking `Unsegmented` keeps only Unsegmented rows and the funnel reads active with count `1`; ticking `Segmented` too shows both; `None` clears; Escape closes and returns focus to the funnel; a click outside closes; the REGION menu ticks `Unknown` (`filter-region-__unknown__`); the SUBJECT box narrows; `Sort Z to A` on REGION flips the sort and closes; with STATUS ticked `Needs review` and `Segmented`, section 3's arrows step through exactly those rows (reuse its DOM-order pattern); the empty copy under an impossible combination; the summary unchanged. Also replace every `[data-find-key="status"]` use in sections 3 and 4 with the menu (`pick(value)` becomes `tick('status', value)`).
- [ ] **Step 7: Run** `node tools/smoke/smoke-reviewer.mjs` on a scratch launch — every check passes.
- [ ] **Step 8: Commit** `feat: the Find list filters from its headers -- a funnel menu per column with multi-select ticks and the sort directions; the bar's dropdowns and findStatus go`.

### Task 7: The other suites, the docs, the whole-branch run

**Files:**
- Modify: `tools/smoke/smoke-studies.mjs:497-514` (the bar's Workspace/Folder selects → the WORKSPACE and FOLDER menus' options and ticks; the header list gains `REGION`); `tools/smoke/smoke-seeding.mjs:55-58, 180-182, 219, 289` (`view: 'Standing lateral'` → `null`; the export line's View cell empty and its region cell `Unknown` in place of `auto`); `tools/smoke/smoke-workspace.mjs:416` (the loaded film's VIEW cell value `''` and placeholder `Unknown`); `tools/smoke/smoke-reviewer.mjs` (a section 5: `SP-9000` after `run-and-wait.js` reads `Lumbar` in its REGION cell and the REGION menu offers `Lumbar`; a section 6 on a seeded `wsFolderRows` as `smoke-workspace.mjs` seeds them: the VIEW selects default to `Unknown`); `tools/smoke/README.md` (the reviewer suite's section; the seeding and workspace suites' notes); `docs/superpowers/HANDOFF.md` (a new first section under "Where things stand"); `CLAUDE.md` (a top paragraph); `docs/superpowers/NEXT-SESSION.md`.
- Test: the suites.

- [ ] **Step 1: Update the four suites** as listed.
- [ ] **Step 2: Run, on fresh scratch launches per the README's orders:** `smoke-parameters.mjs` then `smoke-studies.mjs` then `smoke-reviewer.mjs` then `smoke-workspace.mjs` (one launch); `smoke-seeding.mjs` (its own launch, per its section); `smoke-persist.mjs` run → restart (pass `SPINE_CONTOUR_USER_DATA` to the suite too); `smoke-levels.mjs` phase dom; `smoke-bundle.mjs` a/b/c. Record each count. Expected: every suite's full count; `smoke-studies.mjs` may show only the two documented race failures.
- [ ] **Step 3: Write the records:** HANDOFF's section (the decisions, the counts, a draft release-notes entry for this round, the gate steps: set two regions at once, tick two statuses and arrow through, import a folder and confirm the VIEW defaults, segment a batch of Unknown-view films, sort by REGION), CLAUDE.md's paragraph, the README sections, NEXT-SESSION.
- [ ] **Step 4: Run** `node --test test/*.test.js` once more — PASS; `git status` clean.
- [ ] **Step 5: Commit** `docs: the header filters, REGION and Unknown view round in the records; the suites re-run`.
