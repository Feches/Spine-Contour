# Find list header filters, the REGION column and the Unknown view — design

**Date:** 2026-10-19
**Branch:** on top of `worktree-reviewer-navigation` (worktree `.claude/worktrees/reviewer-navigation`, off `origin/main`
@ `cc1b548`, v1.2.0), after the reviewer navigation round, shipped with it as one release.
**Status:** design agreed in chat with the owner on 2026-10-19; this file is the written form for review before the plan.

## 1. Why

Reviewing a library of several hundred films, the owner found three things in the way:

1. The Find list's VIEW column reads `Standing lateral` on a cervical film. The view is the patient position (standing,
   supine, flexion, extension), seeded to Standing lateral on import unless a folder or file name says otherwise; the
   anatomical region a run detects (lumbar, cervical, full spine) is shown nowhere on the list, so the list cannot be
   filtered by it. "View is misleading and practically hard to input all at once."
2. The import's folder table makes every folder choose a view, defaulting to Standing lateral, which is wrong for most
   films and too much to set per folder. The owner wants the default to be Unknown.
3. Filtering lives in a bar of dropdowns above the table (Workspace, Folder and, since the reviewer navigation round,
   Status) while sorting lives in the column headers. The owner asked whether filtering and sorting every column from
   the headers would be easier, and chose the funnel-menu form (§3) after seeing both forms mocked up.

## 2. Decisions

The owner's (F1–F5), then the designer's (F6–F9), each with its reason, so nobody re-asks them.

- **F1 Funnel menus, not a filter row.** Each column name carries a funnel that opens a menu of checkboxes (the values
  present in the library) with the two sort directions; several values can be ticked at once. Chosen over a visible
  filter row under the headers because multi-select matters to the owner (two regions at once, several statuses).
- **F2 "Not reviewed" goes.** The status filter's combined option (Segmented, Needs review or Hand-placed, added in the
  reviewer navigation round) is redundant once the Status menu can tick those three together.
- **F3 A REGION column.** Between SUBJECT and VIEW, reading `Unknown`, `Lumbar`, `Cervical` or `Full spine`, updated
  the moment a run finishes; sortable and filterable like every other column.
- **F4 The view defaults to Unknown on import.** Unless a folder or file name names a view. An Unknown view does not
  block segmentation (§5): the backend already works out what the film is during a run.
- **F5 Built on the reviewer navigation branch.** The two rounds rewrite the same list; they ship as one release, the
  way the editor round and the bundle round shipped as 1.2.0.
- **F6 The Find list owns its filters.** A new store key, `findFilters`, replaces `findStatus` and the Find list's
  share of `paramFilters.workspace` / `paramFilters.folder`. The Parameters grid keeps `paramFilters` and its own bar.
  Batch spec decision 4 (the two tabs share workspace and folder) is withdrawn for the list: a multi-select list filter
  and a single-select grid filter cannot share one value, and the grid's bar is out of scope here. Session-only,
  replaced wholesale, never persisted, like `findSort`.
- **F7 Within a column OR, across columns AND.** A row passes a column whose menu has ticks when its value is one of
  them; a column with no ticks passes everything (the funnel is plain). The search box and the Subject text box narrow
  further.
- **F8 Unknown is stored as `null`.** The view field becomes `string | null`; the store's validation accepts null (no
  `STORE_VERSION` bump: every record written so far carries a string, and an optional-null field has never bumped it).
  Accepted limitation: a 1.2.0 build reading a library in which this build has stored a null view refuses the store
  ("missing view"), as it would for any newer field it cannot read; the owner runs one build at a time.
- **F9 The run fills the region, never the view.** Standing versus supine cannot be read from the pixels. The view stays
  Unknown until a person sets it (the import table, the drawer, a folder or file name token, the CSV).

## 3. The Find list's header menus (F1, F6, F7)

### 3.1 What each header offers

| Column | Menu | Values | Sort |
|---|---|---|---|
| STUDY | none (the search box covers the name) | — | A→Z / Z→A on the name, as today |
| SUBJECT | a text box, "contains", case-insensitive (the grid's `matchesSubject` rule) | — | as today |
| REGION | checkboxes | `Unknown`, `Lumbar`, `Cervical`, `Full spine`, in that order, those present | Unknown last; else alphabetical |
| VIEW | checkboxes | `Unknown` (films with none), then every stored view present, A→Z | Unknown last; else alphabetical |
| WORKSPACE | checkboxes | the roots present (labelled as the column is) and `Added by hand` when a film has no root | as today |
| FOLDER | checkboxes | the folder labels present among the films the WORKSPACE ticks keep | as today |
| DATE | none | — | as today |
| STATUS | checkboxes | the seven pills in workflow order (`Unsegmented`, `Processing`, `Failed`, `Needs review`, `Hand-placed`, `Segmented`, `Reviewed`), those present | as today |

"Those present" means the values the library holds now, computed from the whole library (not the searched subset), as
the bar's dropdowns did. A value that leaves the library (its last film deleted or relabelled) leaves the menu and is
dropped from the filter when the filters are normalised, the `normaliseFilters` rule. Each menu lists `All` and `None`
above its values: `All` clears the column's ticks (no filter), `None` unticks everything, which is also no filter — a
column never filters to nothing by itself, so the empty state comes only from a combination of ticks, as today.

### 3.2 The menu

- Opened by the funnel button in the header cell (`data-find-key` `filter-<column>`, `aria-haspopup`, `aria-expanded`),
  or by Enter / Space on it. One menu at a time; opening another closes the first. Closed by its own close button,
  Escape, a click outside, or opening a film. The menu does not survive the table's rebuilds: `update()` keeps it open
  only while nothing it shows has changed (its column's values and ticks), and closes it otherwise.
- Inside: `All` and `None` (`filter-<column>-all`, `filter-<column>-none`), one checkbox per value
  (`filter-<column>-<value key>`, where the key is the stored value, or `__unknown__`, `__hand__`), a divider, then
  `Sort A to Z` / `Sort Z to A` (`sort-<column>-asc`, `sort-<column>-desc`, reading the column's own words, e.g.
  `Newest first` / `Oldest first` for DATE, `Workflow order` / `Reverse` for STATUS). A tick applies at once (the table
  repaints behind the menu); Tab moves through the controls; focus returns to the funnel on close.
- The SUBJECT menu holds the text box instead of checkboxes; typing filters at once, as the search box does.
- An active column (any tick, or subject text) colours its funnel in the accent and shows the number of ticks beside it
  (or a dot for the subject text); its header title reads `Filtered: Cervical, Full spine`. The header's sort mark
  stays where it is today, on the column name, and clicking the name still toggles the sort.
- The top bar keeps the search box on the right of the heading and, in the bar under the dropzone, `Delete`,
  `Export all` / `Export N selected` and `Segment N …` with its note (unchanged), and nothing else: the Workspace,
  Folder and Status dropdowns go.

### 3.3 State and the pure logic

```js
// store.js
findFilters: { subject: '', region: [], view: [], workspace: [], folder: [], status: [] }
```

- `data/find.js` gains `DEFAULT_FIND_FILTERS`, `findFilterOptions(studies)` (per column, the values present, labelled
  as the cells are), `normaliseFindFilters(filters, studies)` (drops values no longer offered; `folder` ticks are kept
  only among the folders the workspace ticks keep), `patchFindFilters(filters, studies, patch)`, `matchesFindFilters
  (study, filters, runningId, batch)` (F7; STATUS matches the pill the row shows, as `matchesStatus` does today;
  REGION matches `regionKey(study)` §4; VIEW matches the stored view or `__unknown__` for null), and `activeColumns
  (filters)`. `findOrder`, `findVisible`, `findNeighbour` and `findPosition` read `findFilters`, so the Analysis
  screen's previous / next follows the menus exactly as it followed the bar. `matchesStatus`, `STATUS_FILTERS`
  (without `unreviewed`) and `normaliseStatusFilter` stay as the STATUS column's vocabulary; `findStatus` goes from the
  store, and `UNREVIEWED` goes.
- `screens/studies.js` builds the header cells with their funnels and menus; `update()` lists `findFilters` in its gate
  and keeps the module-scope "which menu is open" beside `confirmingId`; `findRows` filters through
  `matchesFindFilters` and no longer reads `paramFilters`.
- `Delete`, `Export` and `Segment` act over the filtered rows (today's rule); the summary counts the whole library; a
  filter with nothing left reads `No studies match these filters.`; the empty-copy kind is `filters` whenever any
  column is active.

## 4. The REGION column (F3)

- `data/cervical.js`, beside `studyRegion`, gains `regionKey(study)` → `'unknown' | 'lumbar' | 'cervical' |
  'full_spine'` and `regionLabel(key)` → `Unknown` / `Lumbar` / `Cervical` / `Full spine`: the region the person set
  on the Analysis screen or in the import table (`study.region` other than `auto`); else the region the run detected
  (`geometry.region`); else `unknown`. This is `studyRegion()` with `auto` read as unknown, written once so the list,
  the menu, the CSV and the sort agree.
- The cell reads the label, muted for Unknown. Sort key `region`: Lumbar, Cervical, Full spine alphabetically, Unknown
  last in both directions (the absent-value rule). `FIND_SORT_KEYS` gains `region`.
- The grid's column template gains a `minmax(84px, 0.8fr)` track between SUBJECT and VIEW; the delete prompt's start
  column moves one to the right (`buildRow`'s comment names this hazard).
- The CSV exports already write a `Spine region` column when any exported study is not lumbar
  (`data/csv.js` `withRegions`); it keeps its rule and reads `regionLabel` for the value, so `Unknown` appears there for
  a film with no run. The Analysis header's meta line already reads the region label; unchanged.
- After a run the record's `geometry.region` is set by the completion write, so the cell and the menu update with the
  list's ordinary repaint; nothing new to wire.

## 5. The Unknown view (F4, F8, F9)

### 5.1 Storage and display

- `view: string | null`. `newStudy` and `studyFromFile` seed `null` unless the file name names a view;
  `data/seeding.js` `rowForSegments` seeds `view: null` unless the folder path names one, and `seedFields` loses its
  `'default'` step (its `sources.view` is `null` for a film with no view, so the load message's "view read from folder
  or file names" clause counts only real inferences). `DEFAULT_VIEW` stays exported as the label `Standing lateral`
  (the drawer's suggestions and the CSV's normalisation use it) but nothing seeds it any more.
- `persistence.js` `validateStudy` accepts `view` as a non-empty string or `null`; anything else is `null` with a
  warning, the optional-null terms the review mark uses. Records already stored keep their strings (nothing rewrites a
  stored view; the pre-op/post-op spec's rule).
- The list's VIEW cell, the Parameters grid's VIEW cell, the drawer's VIEW field placeholder and the Analysis header's
  meta line read `Unknown` (the header's `—` for a missing value becomes `UNKNOWN`, since the meta line is upper-case);
  the CSV exports write an empty cell; a CSV import's blank view cell is Unknown (today it falls to the next source).
- The import table's VIEW select (per folder and "set all") offers `Unknown` first, the default; the five suggestions
  follow. The table's note ("What Load will assign … unless a film's own name or the CSV says otherwise") already
  describes the rule and is unchanged; only the default value shown changes.
- The grid's View filter and the list's VIEW menu offer `Unknown` for films with none (`viewOptions` gains the
  sentinel, as `NO_TIMEPOINT` does for the timepoint).

### 5.2 The gate before a run

- `inferenceView(view)`: `null`, `''` and the word `unknown` (any case) resolve to `'lateral'`, the backend's lateral
  pipeline, as the lateral labels do; an explicit non-lateral label (`AP`, `Oblique`, free text) still resolves to
  `null` and is refused before the run with `unsupportedViewReason`. `planBatch`'s `unsupported` count and the list's
  `Unsupported view` pill follow `inferenceView`, so an Unknown view is never "unsupported".
- The backend is unchanged: a run on Auto detect classifies the film (lumbar, cervical or full-spine lateral); a film it
  cannot place — an AP film among them — fails the run with its own reason (`Automatic film detection was
  inconclusive. Choose cervical, lumbar or standing / full spine manually.`), recorded as the Failed status with that
  reason on the pill, so a non-lateral film sent by mistake produces no numbers. The run never writes `view`.

### 5.3 What does not change

The view's role as metadata: the drawer edits it, the CSV import maps it, the paired export groups visits by it, the
Parameters grid filters by it. The view classifier setting (`performance.viewSelection`) and the `View original`
button. Demo studies keep their views.

## 6. Testing

- Unit: `test/find.test.js` (the options, normalisation, matching, activeColumns, the order with `region`, previous /
  next under the new filters); `test/cervical.test.js` (`regionKey`, `regionLabel`);
  `test/seeding.test.js` and `test/workspace.test.js` (the null default, the sources); `test/persistence.test.js`
  (null view round-trips, a bad view is nulled with a warning); `test/inference-view.test.js` (null and `unknown` pass,
  `AP` does not); `test/batch.test.js` (`planBatch` offers an Unknown view); `test/csv.test.js` (the empty cell both
  ways, the region label); `test/studies.test.js` (`newStudy` seeds null; `matchesQuery` tolerates a null view).
- CDP: `tools/smoke/smoke-reviewer.mjs` section 2 becomes the header menus (open, tick, All/None, sort, Escape, the
  active count, the arrow keys following the ticks); a new section for the REGION column after a run of the sample
  film and for the import table's Unknown default on a seeded workspace; `smoke-studies.mjs`, `smoke-bundle.mjs`,
  `smoke-workspace.mjs` and `smoke-parameters.mjs` updated where they drove the bar's selects or asserted
  `Standing lateral` on a seeded film, and re-run; `smoke-persist.mjs` and `smoke-levels.mjs` re-run.
- The owner's gate on real films, then the release as one with the reviewer navigation round.

## 7. Out of scope

The Parameters tab's bar (it keeps its dropdowns); a date-range filter; editing the region from the list (the Analysis
screen's Region select and the import table remain the places); any backend change; persisting the list's filters
across launches.
