# Handoff — Spine Contour UI Redesign

**Last updated:** 2026-10-19
**Branch:** `worktree-reviewer-navigation` in the worktree `.claude\worktrees\reviewer-navigation` of the main checkout,
off `origin/main` @ `cc1b548` (v1.2.0): the reviewer navigation round (previous / next over the Find list's filtered
order, every unsegmented film's X-ray on the stage, the list's scroll fix) and, on top of it, the header filters round
(funnel menus on every Find header, the REGION column, the Unknown view) — the owner's gate PASSED on real films
(2026-10-19, after gate feedback G1 on the table's width was fixed), the **1.3.0 release commit** is on the branch and
the branch is PUSHED; the owner opens the PR from
`https://github.com/Feches/Spine-Contour/compare/main...worktree-reviewer-navigation?expand=1` and merges with Create a
merge commit, which publishes v1.3.0 (first two sections under "Where things stand").
**2026-10-15 branch (released):** `worktree-annotation-round-2` in the worktree `.claude\worktrees\annotation-round-2` of the main checkout,
off `origin/main` @ `06c8cdd` (v1.1.1): annotation editor round 2 (a comment on the label record, the Hand-placed
status, REVERT per level) — its owner gate passed; its 1.2.0 release commit is `7dec644`, backed up on `origin`, no PR
yet (second section under "Where things stand") — and, on the same branch after it, the annotation bundle export and
import (Export all / Import bundle…) — BUILT and through its final whole-branch review and fix wave, waiting at its own
owner gate (plan Task 9), not pushed (first section).
**2026-10-13 branch (released):** `claude/level-plates` in the worktree `.claude\worktrees\level-plates` of the main
checkout, off `origin/main` @ `cbbeb4e` (v1.1.0): gate feedback G7, the level plates outside the body and draggable —
~~BUILT, the 1.1.1 release commit on it, not pushed~~ RELEASED as v1.1.1 (PR #64, merge `06c8cdd`).
**2026-10-12 branch (released):** `worktree-level-editor` in the worktree `.claude\worktrees\level-editor`, off
`origin/main` @ `20fd4c5` (v1.0.17): the vertebral level editor, window / level and the label record, G1–G6
included — RELEASED as v1.1.0 on 2026-10-12 (PR #60, merged as `cbbeb4e`, tagged `v1.1.0`).
**2026-10-02 branch (historical):** `claude/issue-39-failed-status-port` (the Failed-status additions on 1.0.13, issue
#39 follow-up; DONE, merged with v1.0.14, release 1.0.15 committed and awaiting the PR)
**Checkout:** `C:\Users\codyj\Spine Contour Desktop\Spine-Contour`, the main checkout on this workstation (no
worktree). The `C:\Users\codyj\spine contour\…` worktree paths below are the 2026-09 layout of another workstation
and do not exist here.
**2026-09-13 branch (historical):** `claude/spine-contour-filename-parse-b6c1bb`, worktree
`C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-segmentation-failures-82e370`.
**Earlier copies (historical):** `claude/studies-ui-updates-bb040d` in worktree `studies-ui-updates-bb040d`, and
`claude/upstream-reconcile-2026-09-08` — the UI branch (batch segmentation included) with the
backend developer's trunk `origin/ui-redesign-cw` @ `5078b1c` merged in (2026-09-08); the studies branch was
fast-forwarded to it and the same tip is pushed as `fork/ui-redesign-cw`, the branch the backend developer takes.
Worktree `C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628` — see the first two
sections under "Where things stand" and `docs/superpowers/NEXT-SESSION.md`.

> The redesign line moved. `origin/ui-redesign-cw` (upstream, `mjayasur/Spine-Contour`) is the real
> trunk: it carries the redesigned renderer **and** the newer backend — `backend/framing.py`,
> `femoral.py`, `landmarks.py`, `models/hrnet.py`, weight `hrnet_landmarks.pt`. The **local**
> `ui-redesign-cw` and `fork/ui-redesign-cw` are the same name on an older lineage (`ac81866`,
> 12 commits behind). `main` is a third variant and does **not** contain the redesign at all — it is
> still the flat `index.html`/`renderer.js` app, 199 commits behind. Read `origin/ui-redesign-cw`
> when you need "what the installed Preview runs". Nothing needs merging from `main`: its three
> extra commits are upstream's parallel crop-search/HRNet work on the flat renderer, already
> superseded here.

---

## 2026-09-10 — editable femoral circles and overall confidence

Branch `claude/femoral-confidence-1.0.7` (2026-09-10). It starts from
`fork/codex/editable-femoral-confidence` (`ee735e1`), cut from v1.0.5 (`71d483f`), and is
merged with `main` @ `b083d7d` (v1.0.6), then renumbered to 1.0.7. **Fork PR #10's branch
is superseded by it** — the PR that publishes 1.0.7 is this branch's.

It hides raw femoral masks in both viewers, permits 0/1/2 circles through
correction/save/load, and adds the overall QC assessment with original-score provenance.
Reset restores QC as well as geometry/measurements, keeping the study's own qc when the
snapshot carries none. The confidence badge's tones (`Review recommended`, `Limited
information`, `Checks passed`) deliberately share no label with the status badge beside it,
which reads `Segmented`/`Needs review`/`Processing`/`Reviewed` from different inputs; the
badge also counts a run in flight as pending, so it never assesses the previous run's
numbers. See `docs/releases/1.0.7.md` for the verification counts on the merged tree and
the newest architecture amendment for controls and null rules. No model or calibration
algorithm changed; no screenshots were added.

## Where things stand

### Find list header filters, the REGION column and the Unknown view: BUILT, at the owner's gate, not pushed (branch `worktree-reviewer-navigation`, worktree `.claude/worktrees/reviewer-navigation`, on top of the reviewer navigation round below and shipping as one release with it, off `origin/main` @ `cc1b548`, v1.2.0)

2026-10-19. The owner, reviewing a library of several hundred films, found three things in the way. The Find list's VIEW
column read `Standing lateral` on a cervical film: the view is the patient position (standing, supine, flexion,
extension), seeded to Standing lateral on import unless a folder or file name said otherwise, and the anatomical region a
run detects (lumbar, cervical, full spine) was shown nowhere on the list, so the list could not be filtered by it ("View
is misleading and practically hard to input all at once"). The import's folder table made every folder choose a view,
defaulting to Standing lateral, which is wrong for most films and too much to set per folder: the default should be
Unknown. And filtering lived in a bar of dropdowns (Workspace, Folder and, since the reviewer round, Status) while
sorting lived in the column headers; the owner asked whether filtering and sorting every column from the headers would
be easier and chose the funnel-menu form after seeing two mock-ups. Designed in chat, written up as a spec
(`docs/superpowers/specs/2026-10-19-find-list-header-filters-region-view-design.md`) and a seven-task plan
(`docs/superpowers/plans/2026-10-19-find-list-header-filters-region-view.md`), built by one implementer per task with a
review after each, every task verified over CDP on a scratch profile with synthetic films, no screenshots. This round
sits on the reviewer navigation round below: the two rewrite the same list, so they ship as one release (the way the
editor round and the bundle round shipped as 1.2.0); that round's status dropdown, its `Not reviewed` option and
`findStatus` were replaced by this round's header menus before anything was released. The final whole-branch review
over both rounds returned "With fixes"; its one fix wave (rulings R13-R16, the counts) is recorded below.

**The decisions** (spec section 2; the owner's F1-F5, then the designer's F6-F9, each with its reason in the spec):

- **F1** Funnel menus, not a filter row: each column name carries a funnel opening a menu of checkboxes (the values
  present in the library) with the two sort directions; several values can be ticked at once (multi-select is what the
  owner cares about: two regions at once, several statuses).
- **F2** `Not reviewed` goes: the STATUS menu ticks Segmented, Needs review and Hand-placed together.
- **F3** A REGION column between SUBJECT and VIEW: `Unknown`, `Lumbar`, `Cervical` or `Full spine`, updated the moment a
  run finishes, sortable and filterable.
- **F4** The view defaults to Unknown on import, unless a folder or file name names one. An Unknown view does not block
  segmentation: the backend already works out what the film is during a run.
- **F5** Built on the reviewer navigation branch, shipped with it as one release.
- **F6** The Find list owns its filters: a store key `findFilters` replaces `findStatus` and the list's share of
  `paramFilters.workspace` / `paramFilters.folder`. The Parameters grid keeps `paramFilters` and its own bar. The batch
  spec's decision 4 (the two tabs share workspace and folder) is withdrawn for the list: a multi-select list filter and a
  single-select grid filter cannot share one value. Session-only, replaced wholesale, never persisted, like `findSort`.
- **F7** Within a column OR, across columns AND; a column with no ticks passes everything. The search box and the
  SUBJECT text narrow further.
- **F8** Unknown is stored as `null`: the view is `string | null`, `validateStudy` accepts null, no `STORE_VERSION`
  bump. Accepted limitation: a 1.2.0 build reading a library in which this build has stored a null view refuses the
  store ("missing view"), as it would for any newer field it cannot read; the owner runs one build at a time.
  (2026-10-19, final review; R16) Two more consequences of the same field:
  - Bundles exported with Unknown views import only into this version or later. A 1.2.0 build skips those films as
    malformed, because its `validate` refuses a non-string view (`renderer/data/bundle.js` `trustedStudy` runs
    `validate`).
  - A 1.2.0 library in which the drawer had cleared a view to `''` gets a null view on this build's first save
    (`validateStudy` reads `''` as Unknown), so that library too becomes unreadable by 1.2.0 afterwards.
- **F9** The run fills the region, never the view: standing versus supine cannot be read from the pixels, so the view
  stays Unknown until a person sets it (the import table, the drawer, a folder or file name token, the CSV).

**The controller's rulings** (made while the plan ran, each amending the plan or a brief; the cost is what is lost if the
ruling was wrong; the full ledger is `.superpowers/sdd/2026-10-19-find-list-header-filters-region-view/progress.md`,
untracked):

- **R1** `matchesSubject` is exported from `data/parameters.js` and reused by `data/find.js`, not copied: a verbatim copy
  is a defect and the plan should not mandate one. Cost if wrong: nothing (an export).
- **R2** Task 6's file list gains `components/checkbox.js`, for the `menu` variant its own Interfaces block names (a plan
  omission). Cost if wrong: nothing.
- **R3** `workspace.js` `countSeeding` counted a folder-table view as "read from folder or file names" only when it
  differed from Standing lateral; with no default firing, a folder named `standing/` is a real inference. The
  `!== DEFAULT_VIEW` clause went, the comment was reworded, the count pin was updated (Task 3). Cost if wrong: a wrong
  count in the Load message.
- **R4** The sidebar's open-study line printed an em dash for a missing view while the Analysis header beside it read
  `UNKNOWN`; it reads `Unknown` now (Task 5), so the fifth surface agrees with the spec's four. Cost if wrong: nothing.
- **R5** The STATUS menu lists the pills in the spec's order (Unsegmented, Processing, Failed, Needs review, Hand-placed,
  Segmented, Reviewed, the existing `STATUS_FILTERS` order the dropdown used), not the plan's "STATUS_RANK order", which
  puts a failure first. Cost if wrong: a reorder of one list.
- **R6** Processing is never a STATUS option: options are computed with no run, so a menu does not change under a running
  batch; the spec's "those present" would offer Processing only while a run is up and drop the tick when it ends. Cost
  if wrong: the running films cannot be filtered to, which the bar's progress already names. (Superseded by R13 at the
  final review: every pill is offered, Processing among them.)
- **R7** A menu stays open through its OWN ticks (the table repaints behind it) and closes on any other change to what it
  shows (a run ending adds a status, a delete removes a folder, a write from elsewhere): read literally, the plan's
  keep-open sentence would close it on every tick, which the spec's "a tick applies at once" forbids. Cost if wrong:
  nothing.
- **R8** The SUBJECT menu has no All / None: it holds a text box, not values. Cost if wrong: nothing.
- **R9** A click outside an open menu only closes it; it does not also open the row clicked. Cost if wrong: one extra
  click (a stray navigation while filtering is the worse failure). (Narrowed by R16 at the final review: only a press
  on the rows is swallowed; a press on the bar or a header closes the menu and does what it says.)
- **R10** R9 rests on the pointerdown rebuild replacing the row before its click arrives, which was undocumented and
  unpinned: the outside-press handler's comment now says so, and `smoke-reviewer.mjs` section 2 clicks a row with a menu
  open and reads that the menu closed and `screen` is still `studies`. Cost if wrong: a stray navigation if the rebuild
  ever stops replacing the row.
- **R11** Escape was handled only inside the menu, so a keyboard user whose focus had left it (Shift+Tab from All, a
  click on the menu's padding) could not close it: `screens/studies.js` registers a document-level `keydown` for Escape
  (bubble phase, so the menu's own handler, which stops the event, still takes focus inside it) together with the
  outside-press `pointerdown`, and removes both together; it closes the menu by the menu's own path, so focus lands on the
  funnel. Cost if wrong: nothing.
- **R12** At the default 1180 px window the REGION track pushes a row's Delete button past the viewport edge, so the Find
  table scrolls sideways about 100 px sooner than before (`smoke-levels.mjs` section 11 first read 143/145 until the suite
  scrolled the control into view). Accepted: the spec sized the track, the owner's window is wider (their screenshot is
  about 2000 px), and the smoke README already records the overflow at 1180 px. Cost if wrong: a sideways scroll to reach
  Delete on a narrow window, which the final review and the owner's gate will see. *Superseded by gate feedback G1
  (below): the reasoning was wrong, because the page column caps the table at 1088 px whatever the window, and the
  floors' sum had passed it.*

The final whole-branch review (`cc1b548..697f721`) returned "With fixes", with 4 Important and 9 Minor findings, and
the controller ruled on each (R13-R16 below; the ledger lines begin `Final: Ruling` in the same `progress.md`):

- **R13** STATUS and REGION are fixed vocabularies: their menus always offer every value (the seven pills, the four
  regions), and their ticks are normalised against the vocabulary, never against "those present", so a ticked Needs
  review stays ticked when its last film is marked and the list reads the empty copy with Next disabled; this
  supersedes R6 (Processing is now offered, and matches the running and queued films). The spec's "those present" rule,
  written for roots and folders, dissolved the review queue's filter at its last film: the whole library showed, the
  header read `4 / 5`, the arrows opened films outside the queue, and the stored tick came back unseen with the next
  Needs review film (Important #1). Cost if wrong: a menu lists values no film has.
- **R14** The region bar's two selects (Region, Orientation) do not own the arrow keys: with focus on one, an arrow is
  prevented (no value change) and navigates, and at either end it is still prevented; the dropdown opened with Space or
  Alt+Down still takes its own arrows inside its popup. On a closed select Chromium's arrow picks the next option, and a
  Right pressed by habit wiped a result through `changeRegion` (Important #2). Cost if wrong: a keyboard user opens the
  dropdown to change the region.
- **R15** `previewOriginal` reads the film with `park: false`, and `render()` starts a film's preview or decode only
  after a 150 ms settle, and only if the mount still shows that study; the restore and the kept window's redecode stay
  immediate. Arrow-stepping through hundreds of unsegmented films parked every file for the session and queued every
  decode (Important #3). Cost if wrong: a run re-reads the file from its path, as a batch already does, and a film's
  X-ray reaches the stage about 150 ms later, the run card covering the toolbar that much longer.
- **R16** The records say that bundles exported with Unknown views import only into this version or later (1.2.0 skips
  those films as malformed) and that a 1.2.0 library with a drawer-cleared `''` view becomes unreadable by 1.2.0 after
  this build's first save (Important #4); the word `Unknown` typed in the drawer or carried by a CSV View cell is stored
  as `null` (Minor #5); a press on the bar or a header while a menu is open closes the menu without swallowing the
  click, the rebuild only for a press on the table's rows, R9's case (Minor #6); the Analysis header reads `UNKNOWN`
  for an undetected Auto detect film (Minor #8); a bundle update keeps the local view when the bundle's is null (Minor
  #9); the WORKSPACE menu's rows carry the root's full path on their title (Minor #10); the records say the strip is the
  lumbar film's and the preview the others' (Minor #12). Deferred: Tab wrapping inside the menu (#11), wasted decodes
  under a full card (#13), the arrows from the Parameters tab ignoring the grid's filters (#7: a gate step below and
  the owner's call). Cost if wrong: each fix is local; the deferred three are the open ends.
- **R17** (parked at the fix wave's re-review) A record with no `region` field and no result — one stored before the
  field existed and never run — reads `UNKNOWN` in the Analysis header's meta line and in its REGION cell while the
  Region select beside it reads Lumbar, because `requestedRegion` falls back to lumbar for such a record. Accepted: the
  header follows the ruled rule (R16, Minor #8), only pre-region records that were never run are affected, and the
  select shows what a run would request. Cost if wrong: a cosmetic disagreement on those records until they are run or
  their region is set.

**What each task built** (commits on the branch, in order):

1. `8898778` `regionKey(study)` and `regionLabel(key)` in `data/cervical.js`, beside `studyRegion`: the region a person
   set (`study.region` other than `auto`), else the one the run detected (`geometry.region`), else a study carrying a
   result with none is lumbar (only the old lumbar pipeline wrote results without a region), else `unknown`; written once
   so the list, the menu, the CSV and the sort agree. `REGION_KEYS`.
2. `e2ab491` The Unknown view in the data layer: `view: string | null`; `newStudy`, `rowForSegments` and `seedFields`
   seed null (the `'default'` source is gone, so the load message counts only real inferences); `validateStudy` keeps a
   label, null and an absent key, and nulls anything else with one warning; `inferenceView` reads null, blank and
   `unknown` as lateral (`AP`, `Oblique` and other labels still refuse the run); the CSV writes an empty cell.
3. `a26449b` `Unknown` on screen: the list's and grid's VIEW cell (muted), the drawer's placeholder (an emptied cell
   stores null), the Analysis header's `UNKNOWN`, the import table's VIEW selects (per folder and Set all: Unknown
   first, the default, option value `''`, the row model says null), the grid's View filter (`NO_VIEW`, `__unknown__`).
4. `3658baa` `findFilters` in the store and the pure logic in `data/find.js`: `DEFAULT_FIND_FILTERS`, `FILTER_COLUMNS`,
   `findFilterOptions` (from the whole library, labelled as the cells are; FOLDER under the WORKSPACE ticks),
   `normaliseFindFilters` (drops values no longer offered), `patchFindFilters`, `matchesFindFilters` (F7; STATUS by the
   pill the row shows), `activeColumns`, and the `region` sort key.
5. `21798dd` The REGION column (cell, header, a `minmax(84px, 0.8fr)` track, the delete prompt's start column moved one
   track right) and the CSV's `Spine region` cell (and the paired export's regions cell) reading the label.
6. `91f9b53` The header menus: `components/filter-menu.js`, the funnel in every header but STUDY and DATE, the menu
   mounted on the table host (the table clips anything below its header row), the bar without its dropdowns,
   `findStatus` and `UNREVIEWED` removed, `findPredicate` and the Analysis `navKey` reading `findFilters`.
7. `2b251a0` the Escape listener and the outside-press comment (R10, R11), `smoke-reviewer.mjs` sections 5 and 6 and the
   other suites' pins; `fa466d1` these records and the counts; and the review's docs fix, `docs: ruling R12 and the unrun
   suites in the records` (R12 above, the unrun suites named in the smoke README and NEXT-SESSION).
8. The final review's fix wave: `1528bcf`, R13-R16 in code, tests, suites and the spec's dated notes (3.1, 4, 5.1);
   then `docs: the final review and its fix wave in the records` (these records, CLAUDE.md, the smoke README).

**The suites' changed pins** (fixed to the new truth, none loosened): `smoke-studies.mjs` section 2's header row gains
`REGION`, and section 10's Workspace / Folder selects became the WORKSPACE and FOLDER menus (their options, ticks, the
funnel's count and title, the narrowing of FOLDER under a ticked root, All, and the ticks living in `findFilters` while
`paramFilters` stay untouched); `smoke-seeding.mjs` reads `null` views for folders that name none (the table's VIEW
selects read the empty string), `S001,,S001,Post-op,,,Unknown` in the export's first row in place of
`S001,Standing lateral,S001,Post-op,,,auto`, and a cleared drawer VIEW cell stores null; `smoke-workspace.mjs` reads the
loaded film's VIEW cell as `''` with the placeholder `Unknown`; `smoke-cervical.mjs` reads `Cervical,<side>` in the CSV
(not run); `smoke-accuracy`, `smoke-onnx-localizer`, `smoke-processing` and `smoke-partial-segmentation` reset the list's
`findFilters` to its default where they reset `paramFilters` (not run); `smoke-reviewer.mjs` gains the Escape-from-
anywhere and row-click checks in section 2 (Shift+Tab from All, and focus moved to the search box with `.focus()`:
a click on the search box is itself an outside press, which closes the menu before Escape is tried), a section 5 (a real run of the sample film: `SP-9000`'s REGION cell reads
Unknown before and Lumbar after, and the REGION menu's Lumbar tick keeps it) and a section 6 (the import table's VIEW
selects default to Unknown on seeded folder rows).

**Counts** (2026-10-19, this worktree, each suite on a fresh scratch profile under the session scratchpad, synthetic
films, DOM, store and file reads only, no screenshots). Unit 1123 -> 1142 (`test/find.test.js`, `test/cervical.test.js`,
`test/seeding.test.js`, `test/persistence.test.js`, `test/inference-view.test.js`, `test/batch.test.js`,
`test/csv.test.js`, `test/studies.test.js`, `test/parameters.test.js`, `test/workspace.test.js`, `test/store.test.js`).
Profile `a` in the README's order, one launch: `smoke-parameters.mjs` 58/58; `smoke-studies.mjs` 155/155 (151 before:
section 2's header row and section 10's menu checks; the two documented race checks passed this run); `smoke-reviewer.mjs`
119/119 (97 at the end of Task 6, then six Escape and row-click checks in section 2, nine in the new section 5, seven in
the new section 6); `smoke-workspace.mjs` 100/100. Profile `b`: `smoke-seeding.mjs` 36/36. Profile `c`:
`smoke-persist.mjs` 42/42 then 55/55 across its restart. Profile `d`: `smoke-levels.mjs` phase dom 145/145.
`smoke-bundle.mjs` 17/17, 18/18 and 9/9 across its three launches (`bundle-a` fresh, `bundle-b` fresh, `bundle-a`
kept; `TESSERACT_CMD` set as the README says). Three suite faults the re-runs found and fixed, none in the app:
`smoke-levels.mjs` read 143/145 first, because section 11 clicks the Find row's delete control at the table's right end,
which is past the window's edge at the default 1166 px viewport (the table scrolls sideways; measured at scroll 0 the
button spans x 1347-1371, 100 px further right than before the REGION column, and a click there lands on nothing). With
the table scrolled the delete and its prompt work, so it is a click-reach fault in the suite, not an app regression, and
the suite now scrolls the control into view first, as `smoke-studies.mjs`'s `clickAt` does. One thing is not
explained: emulating the old layout in the page puts the same control past the edge too (x 1247-1271), yet the suite
passed at the reviewer round, so something once brought it into reach that this run did not; at the default window the
owner scrolls the table sideways to reach Delete, the overflow the README already lists. The other two were typos in the
suite edits (a `JSON.parse` of a JS literal in `smoke-studies.mjs`, a backtick inside a template literal in
`smoke-seeding.mjs`) that stopped those suites before any check ran.

**The final review and its fix wave** (2026-10-19). The final whole-branch review returned "With fixes" (4 Important, 9
Minor), and one fix wave (`1528bcf`) built rulings R13-R16 above. Counts, from this worktree on fresh scratch profiles,
synthetic films, no screenshots:
- Unit: 1142 -> 1147 (`test/find.test.js` +3: the whole vocabulary whatever the library, a status tick surviving
  normalisation, the queue reviewed to its end; `test/csv.test.js` +1, a View cell reading unknown; `test/bundle.test.js`
  +1, an update keeping the local view under a null bundle view).
- `smoke-reviewer.mjs`: 119 -> 131/131. Section 2: the STATUS options pinned to the seven pills, the REGION options to
  the four regions, and a header's sort button clicked with a menu open closing it and sorting on that one click (R16).
  Section 3: the Region select yielding ArrowRight with the film's region untouched (R14), and the queue reviewed to
  its end (`– / 0`, both arrows disabled, the arrows staying put, the ticks kept, the list's empty copy and the funnel's
  `3`; the marks then put back). Section 4: the header meta line reading `UNKNOWN · UNKNOWN · —`, and `Unknown` typed in
  the drawer storing null.
- `smoke-studies.mjs`: 155 -> 157/157. Section 10 reads the WORKSPACE root row's title. Section 7 waits for the strip
  before clicking Run segmentation: the decode now lands after the settle and moved the button out from under the
  click, 137/156 on one run.
- `smoke-studies.mjs` then `smoke-reviewer.mjs` ran on one fresh launch (profile `fix-g`). `smoke-levels.mjs` phase dom
  read 145/145 on its own fresh launch (`fix-f`) once its `enterEdit` waited until the Edit tool was the topmost
  element at its centre. Before that it read 130/145: the run card covers the toolbar until the film is on the stage,
  and a pointer log showed the Edit click landing on `DIV.run-card` at +148 ms. With the settle switched off as a test
  it read 145/145, so the settle (R15) is the cause, and the suite's click was the fault, not the app.

Not re-run, and why: `smoke-parameters`, `smoke-workspace` and `smoke-seeding` read nothing the wave changed (no menu,
no View cell reading unknown, no film opened and read before its load). `smoke-persist` reads SP-9000's card at open,
and the full card and the strip both pass; it runs through `run-and-wait.js`'s DOM click, and its later opens are
restores, which stay immediate. `smoke-bundle` imports films with stored images (restores) and views that are labels.

**Not run:** `smoke-global-sva.mjs` (its `Spine region` pin was changed to `Full spine` in Task 5; it needs a real
full-spine run), `smoke-cervical.mjs` (the `Cervical,<side>` pin above; a real cervical film),
`smoke-accuracy.mjs`, `smoke-onnx-localizer.mjs`, `smoke-processing.mjs` and `smoke-partial-segmentation.mjs` (model runs
on real films or the ONNX localizer; their edit is the mechanical `findFilters` reset), `smoke-levels.mjs` phase film
(a real film), the plan-04 gate suites, a packaged build.

**Gate feedback G1 (2026-10-19), the owner's first look at real films:** "The table is now cut off horizontally and I
have to scroll all the way to the bottom to see the delete on the right." The cause was R12's wrong premise:
`.studies-page-inner` caps the page column at 1160 px, so the Find table has at most 1088 px at ANY window, and the
REGION track (84 px) plus its 16 px gap had pushed the tracks' floors to 1128 px — the actions column was cut off for
everyone, and the only way to it was the table's horizontal scrollbar, which sits under the last of hundreds of rows.
Measured over CDP on a scratch profile: at the page cap the table overflowed by about 40 px (the 44 px actions track),
at the default 1166 px viewport by 197 px. The fix (`styles/screens/studies.css`): the floors are tightened to 160 ·
90 · 80 · 100 · 96 · 84 · 90 · 112 · 44 with 12 px gaps, a 996 px sum that fits the cap with 92 px to spare (STUDY's
160 px floor is safe because the name wraps; VIEW keeps `Standing lateral` on one line at 100 px), the comment now names
the cap as the load-bearing constraint; and the trash cell is `position: sticky; right: 0` with the row's background,
so on a window narrower than the sum — where the table still scrolls sideways, as before this branch — Delete stays one
click away instead of behind the scrollbar at the bottom. Also found while verifying: the Studies screen's
return-to-row scroll waited for `requestAnimationFrame`, which Chromium never fires in a hidden or fully covered window,
so the scroll did not happen while the app sat behind another window; it waits on a zero-delay timer now
(`screens/studies.js` render()). Verified over CDP: at a 1400 px viewport the table's scroll width equals its client
width (no overflow) and the trash button is the element under its own centre; at the default viewport the sticky trash
cell sits inside the table with its button on top; the delete prompt opens on one line (35 px) inside the row; unit
1147/1147; `smoke-reviewer.mjs` 131/131 and `smoke-levels.mjs` phase dom 145/145, both run in the hidden window (pass
`SPINE_CONTOUR_USER_DATA` to the levels suite as to the persistence suite, or its record reads miss the profile).

**Known limits and deferred notes.** The Find table's floors sum to 996 px, inside the page column's 1088 px; a window
narrower than that still scrolls the table sideways, as before this branch, with Delete sticky at the right edge. The
SUBJECT box matches `subjectId` only (the grid's rule), so it cannot
find a demo study's `pt` label that the SUBJECT cell shows; the search box can. A value key equal to `all`, `none`,
`close` or `text` (a folder named `none`) collides with the menu's own hooks. A menu's position is computed per rebuild,
so it does not follow a sideways scroll of the table or a window resize while open. `studies.js` is about 1400 lines (the
roughly 110 lines of menu wiring could move to their own module). `findPredicate` rebuilds the options per call (O(n)).
~~The Unknown typed into the drawer's VIEW box is stored as the string `Unknown` and sits beside the sentinel in the grid
filter.~~ (Fixed at the final review, R16: it stores null, as a CSV View cell reading Unknown does.) A 1.2.0 build
refuses a library with a null view (F8), skips this build's bundle films whose view is Unknown, and cannot read a 1.2.0
library this build has saved once if the drawer had cleared a view there (F8's two notes). Deferred at the final review:
Tab wrapping inside an open menu (#11), wasted decodes under a full card (#13), and a film opened from the Parameters
grid stepping through the Find list's filters, not the grid's (#7).

**Draft entry for the release notes:** *The Find list filters from its column headers: every header but STUDY and DATE
has a funnel opening a menu of the values in your library (the Status and Region menus always list every status and
region, so a tick stays put when its last film changes), with several ticks at once (two regions, three statuses) and
the sort directions; SUBJECT's menu is a text box; the bar's Workspace, Folder and Status dropdowns and the Not reviewed
option are replaced by the menus (the Status menu ticks Segmented, Needs review and Hand-placed together). A new REGION
column reads Unknown, Lumbar, Cervical or Full spine, fills in when a run finishes, and sorts and filters like the rest.
A film's view is Unknown until a folder name, a file name or you set it (the import table's VIEW selects default to
Unknown, and the Parameters grid's View filter offers Unknown), and an Unknown view no longer blocks segmentation: the
run works out the region itself. The CSV exports write the region as Cervical, Lumbar, Full spine or Unknown, and an
empty view cell for an Unknown view. Previous and next on the Analysis screen follow the menus. A library saved by this
version with an Unknown view cannot be opened by 1.2.0, and neither can a 1.2.0 library in which a view had been
cleared in the drawer, once this version has saved it; bundles exported with Unknown views import only into this
version or later (1.2.0 skips those films).* (Together with the reviewer navigation round's entry below.)

**The gate.** On real films: tick two regions at once in the REGION menu and confirm the list shows both and the funnel
reads `2`; tick two statuses (say Needs review and Hand-placed), open the first row and arrow through them, with
`3 / 12` and the greyed ends; import a folder (Workspace card) and confirm the folder table's VIEW selects default to
Unknown, then Load and confirm the list's VIEW cells read Unknown (muted) except where a folder or file name named a
view; select a batch of Unknown-view films and Segment them, and confirm none is refused as an unsupported view and the
REGION cells fill in as the runs finish; sort by REGION in both directions (Unknown last both ways); close a menu with
Escape (focus on the funnel), by clicking elsewhere (a click on a row only closes the menu, and does not open it), and by
opening a film; tick a workspace and confirm FOLDER offers only its folders; type in SUBJECT's box; export a CSV and read
the Spine region and View cells; open the Parameters tab and confirm its own dropdowns still work and the list's menus
are untouched by them. (2026-10-19, final review, three more:)
- With focus on the Analysis screen's Region select, press Right: it must open the next film, not change the region.
- Arrow through about thirty unsegmented real films and watch the app's memory and the latency of each step.
- Open a film from the Parameters grid with a workspace filter set there and press Right: the arrows follow the Find
  list's filters, not the grid's. Whether that should change is the owner's call (deferred minor #7).

### Reviewer navigation: previous / next over the filtered list, a status filter, every unsegmented film's X-ray, the scroll fix: BUILT, at the owner's gate, not pushed, part of the same release as the section above (branch `worktree-reviewer-navigation`, worktree `.claude/worktrees/reviewer-navigation`, off `origin/main` @ `cc1b548`, v1.2.0)

(2026-10-19, header filters round: the status dropdown, its `Not reviewed` option and `state.findStatus` described below were
replaced by the header menus above before release; everything else here stands. The counts below are the reviewer round's own.
The final whole-branch review's corrections to this section are marked inline: R14 on the arrow keys, the strip being
the lumbar film's.)

2026-10-19. The owner, reviewing segmentations: "Right now I have to click back to studies to see another image. I
want to be able to click through it with my arrow keys", over the list as filtered by workspace or folder, and by a
new status filter ("filter only unreviewed and then click arrows"); two smaller asks: lumbar films opened unsegmented
showed no image ("Default view should be the xray and it should say at the top or bottom bar that it is
unsegmented"), and selecting a study far down the list "puts me all the way at the bottom scroll". A bounded change,
designed in chat (no spec file): four commits, each verified over CDP on a scratch profile with synthetic films, no
screenshots.

- **The scroll fix** (`d670f0d`). Reproduced first: the tick box's hidden native input (`components/checkbox.js`) is
  `position: absolute` and had no positioned ancestor, so its containing block was the page; forty rows left forty
  1px inputs at the list's CONTENT coordinates, outside the list's own scroll clipping, and the document became
  scrollable to the last row's depth (2844 px against an 837 px window). Ticking a row near the bottom focused that
  input, the document scrolled to it and the app shell slid off the top of the window. `.checkbox-row` is now
  `position: relative` (load-bearing comment in `styles/components.css`); the document's scroll height is the
  window's again. And the Studies screen, rebuilt on every trip, centres the open study's row on the frame after the
  router places it (`revealRow` in `screens/studies.js`), so Back lands on the film you left instead of at the top.
- **The status filter** (`a81de5c`). A third dropdown after Folder (`data-find-key` `status`): All statuses, Not
  reviewed, then Unsegmented, Processing, Failed, Needs review, Hand-placed, Segmented, Reviewed (`data/find.js`
  `STATUS_FILTERS`, labelled by `statusLabel` so the dropdown and the column cannot disagree). Not reviewed is a
  result nobody has marked: Segmented, Needs review or Hand-placed. Each row is matched by the pill it SHOWS
  (`matchesStatus` with `state.running` and `state.batch`), so a film waiting in a batch is Processing here as in its
  cell. The value is `state.findStatus`: session-only, replaced wholesale, like `findSort`; the Parameters grid never
  reads it. Segment, Delete and Export act over the filtered rows as before; the summary counts the whole library; an
  empty result reads the filters empty copy.
- **Previous / next** (`3146038`). `data/find.js` `findOrder`, `findVisible`, `findNeighbour` and `findPosition` are
  the one definition of the Find list's order and filters (the search box, the workspace and folder filters normalised
  against the library, the status filter, the column sort); `matchesQuery` moved there from `screens/studies.js`,
  which re-exports it, so `data/` never imports a screen. On the Analysis screen Left/Up open the row before the open
  study and Right/Down the row after it, stepping from the study's OWN place in the full order whether or not it still
  passes the filters (a film marked reviewed under Not reviewed has left the list; its next is still the row after
  where it sat, so review-then-arrow goes straight down the list); nothing past either end, no wrap. The keys are
  ignored inside text entry, dropdowns and sliders (`KEEPS_ARROWS`), with any modifier, when another handler already
  took the event, and in edit mode, where the viewer's own window listener (registered first) nudges handles.
  (2026-10-19, final review, R14: except the region bar's Region and Orientation selects, where an arrow is prevented and
  navigates, since a closed select's arrow picked the next region and wiped the result.)
  Beside Back the header carries Previous and Next (`.analysis-nav-prev`, `.analysis-nav-next`, `icon-btn`) with the
  position between them (`.analysis-position`: `3 / 42`, or `– / 42` for a film the filters hide, the count on its
  title), disabled at the ends and while editing, each title naming its neighbour. `openId` is a key of the Analysis
  host (`router.js` `ANALYSIS_KEYS`, on that screen only: on Studies a delete clears it and the list must not be
  rebuilt), so the host remounts for the new film exactly as a click on the list does, with `swap`'s focus restore
  keeping a clicked Next focused; the screen's module-scope subscription skips an update whose `openId` is not its
  mount's. A film opened from the Parameters tab navigates by the Find list's order too.
- **Every unsegmented film's X-ray** (`2020b27`). Only cervical and full-spine films loaded their original before a
  run (`previewOriginal`, the anterior-side evidence); a lumbar film opened to a dark stage under the UNSEGMENTED card.
  Now every real film with no result is decoded at its default window through `ensureFilm`, the level editor's
  loader (`screens/analysis.js` `showOriginal`; `loadOriginal` dispatches by region, for the open and after a Region
  change), the region note reading `Loading original radiograph…` then clearing, or `Original preview unavailable:
  <reason>` when the original cannot be read, in which case the full card stays and its Run segmentation offers the
  relocate picker. Once the X-ray is on the stage the card keeps its classes and its button but is drawn as a STRIP
  along the bottom (`components/viewer.js` `describeCard` `strip` -> `.run-card-strip`): no scrim, the film fully
  visible, the eyebrow UNSEGMENTED, the title and the Run segmentation button on one line, the footer watermark lifted
  above it. The header pill says Unsegmented above; the strip says it below. Window / level works on the decoded film.
  Running, Queued, Failed, Unsupported-view, Loading and Film-unavailable keep their full cards. (The chat design said
  the button would move to the region bar; the strip keeps it on the stage, where every suite and every habit finds
  it, and is the "bottom bar" the owner asked for.)
  **Correction (2026-10-19, final review):** "every real film with no result is decoded" above is too wide. The
  decode and the UNSEGMENTED strip are the lumbar film's: a requested region of Lumbar (a record with no region field
  reads Lumbar) or an Auto detect run that detected lumbar. An Auto detect, cervical or full-spine unsegmented film
  shows the backend's preview (`previewOriginal`), with no card and the Run segmentation button on the region bar, as
  before this round. Every new film is Auto detect, so that is what a freshly loaded film shows. Since R15 either load
  starts after a 150 ms settle.
  **Amended 2026-10-21 (the owner, 1.3.1):** the strip serves every unsegmented film whose film is on the stage, the
  backend's preview included, so Run segmentation is in one place whatever the region; `describeCard`'s null branch
  for a previewed cervical, full-spine or Auto detect film is gone, and so is the region bar's own Run segmentation
  (`screens/analysis.js`), which kept View original and the two selects. The FAILED card is a strip too once the
  film is on the stage (`strip: Boolean(currentImages)`): the full card's `inset: 0` scrim paints over the toolbar,
  so a failed Auto detect or cervical film, which before this round had no card over its preview, would have lost
  Edit segmentation, the way to place it by hand (R16); `smoke-levels.mjs` section 12 caught it. The reason stays in
  the region note (`failedRunNote`). A film whose preview or decode cannot be read keeps the full card, as before.
  Checked by `tools/smoke/smoke-region-change.mjs` and `smoke-levels.mjs`.
- **Counts** (2026-10-19, this worktree, scratch profiles under the session scratchpad, synthetic films, no
  screenshots). Unit 1113 -> 1123 (`test/find.test.js`: the status filter, the order, the neighbour and the position;
  `test/analysis.test.js`: `positionLabel`, `NAV_STEP`). `tools/smoke/smoke-reviewer.mjs` (new) 64/64, twice;
  `smoke-parameters.mjs` 58/58; `smoke-studies.mjs` 151/151 on a fresh launch (146/151 when run after
  `smoke-parameters.mjs` on one launch, which found the two fixes in `9dbb63c`: the return-to-row scroll fired on a
  short list and pushed the search box off the top, and a Failed lumbar film's note gained the decode failure);
  `smoke-workspace.mjs` 100/100; `smoke-persist.mjs` 42/42 then 55/55 across its restart (pass the suite
  `SPINE_CONTOUR_USER_DATA` as well as the launcher: it checks the label file under that folder); `smoke-levels.mjs`
  phase dom 145/145; `smoke-bundle.mjs` 17/17, 18/18, 9/9 across its three launches. Not run: `smoke-levels.mjs`
  phase film (a real film), the gate suites of plan 04, a packaged build.
- **Not done, on purpose.** No version bump and no CHANGELOG entry: the release is the owner's step after their gate
  (`docs/release-main.md`). A draft entry for the release notes: *Previous and next on the Analysis screen: the arrow
  keys (Left/Up, Right/Down) and two header buttons step through the Find list exactly as it is filtered and sorted,
  with the film's place shown as `3 / 42`; the Find list filters by status, with a Not reviewed option; an
  unsegmented lumbar film opens on its X-ray, with the UNSEGMENTED strip along the bottom of the stage and window /
  level available (Auto detect, cervical and full-spine films show the original's preview, as before); ticking a row
  far down the list no longer scrolls the app off the window, and Back from a film lands on its row.* (2026-10-19,
  final review: corrected from "every unsegmented film opens on its X-ray, with the UNSEGMENTED strip".)
- **The gate.** On real films: open a film, press Right and Left through the list with a workspace filter set, then
  set Status to Not reviewed, open the first, Mark reviewed, press Right; check the `3 / 42` and the greyed arrows at
  the ends; open an unsegmented lumbar film and confirm the X-ray shows with the strip, then Run segmentation from the
  strip; a DICOM unsegmented film too; tick a row near the bottom of a long list and confirm nothing jumps; Back from a
  film far down the list lands on its row. In edit mode the arrows still nudge handles and the header arrows are
  greyed.

### Annotation bundles: export a folder of studies, import it into another library: RELEASED as v1.2.0 (PR #66, merge `cc1b548`, 2026-10-16) (branch `worktree-annotation-round-2`, worktree `.claude/worktrees/annotation-round-2`, on top of the editor round, off `origin/main` @ `06c8cdd`, v1.1.1)

2026-10-15. A study's data lives in four places (its row in `studies.json`, the prediction sidecar, the label record, the
original film at an external path) and nothing moved them; the only export was the measurements CSV, which cannot be
imported back. An annotator could not bring films and annotations to another computer, and a library could not take a
colleague's annotations of films it already held. Built on the same branch as the editor round so one PR carries both.

- Spec: `docs/superpowers/specs/2026-10-15-annotation-bundle-export-import-design.md` (decisions B1–B9: B1–B4 the owner's,
  B5–B8 the planner's, B9 the standing rule that nothing leaves the machine). Plan:
  `docs/superpowers/plans/2026-10-15-annotation-bundle-export-import.md` (nine tasks, rulings PB1–PB10; its `## Ledger`
  holds the execution rulings S1–S44, a row per task, the deferred minors and the final review's triage). The spec
  carries dated amendment notes from the final review at §4.2 (S37, S39, S40), §5.6 and §5.8 (S38). User doc:
  `docs/bundles.md`. SDD ledger
  `.superpowers/sdd/2026-10-15-annotation-bundle-export-import/` (local, untracked). Next-session prompt that started it:
  `docs/superpowers/NEXT-SESSION-bundle.md`.
- **The bundle** (B1, B2, B3, B7). A folder, `spine-contour-export-<YYYY-MM-DD>-<HHMM>` in local time: `manifest.json`
  (schema `spinecontour.bundle/1`, written last so a cut-off export has none and import refuses it) and one folder per
  real study holding `study.json` (the record with `filePath: null`), `prediction.json`, the label record under the
  study's own `labelFile` name, `calibration.json` (the manual scale reference, saved through the calibration store on
  import) and `film/<file>` (the original, streamed and SHA-256 hashed as it is copied; the hash is what a model result
  stores as `source_sha256`). Demo studies are never written.
- **Export** (B6). The Find bar's `Export all` / `Export N selected` (`data-find-key` `export-bundle`) takes the CSV's
  rows (`rowsToExport`: the ticked visible real rows, else every visible real row), asks `chooseFolder` for a parent and
  writes the bundle; `Exporting…` in flight; disabled, with the reason on its `title`, during a run, a batch, a bulk
  delete or an import, when studies are not being saved, and with no rows. The toast is `Exported 12 studies to <path>`,
  then `· 2 films were not found and were left out (…)` and `· 1 file could not be read (a.dcm sidecar)` when non-zero
  (S37, S40: a sidecar or calibration named by the film, a record by its own name, never the SP id). A destination that
  refuses a write (a full or read-only stick) rejects the export with `The film <name> could not be written to the
  bundle. Is the folder full or read-only?` or the like for a JSON file, never listing films as missing (S39).
- **Import** (B4, B5, B8). The dropzone's `Import bundle…` (`import-bundle`) asks for a bundle, `readBundle` returns
  the parsed records and presence flags, the screen reads the local films' hashes and the local records it needs, and
  `planImport` decides per entry, in manifest order: **add** when no local study has the film (matched by SHA-256, never
  by file name alone); **update** when one does and the bundle's record was saved strictly later than the local one, or
  the local study has none; **skip** `already in the library` (older, equal, unparseable or no bundle record), `being
  edited` (the match is open in edit mode or holds a stashed editor) or `malformed`. The inline prompt (`import-prompt`,
  `import-confirm`, `import-cancel`, focus on Cancel, Escape cancels) reads `Import from <folder>: 10 to add, 2 to
  update, 3 to skip. The films stay in this folder, so keep it where it is.` and takes the bar's place; a plan with
  nothing to do toasts `Nothing to import: …` instead. Confirm places the files in the main process (S38: `readBundle`
  has already parsed each sidecar and calibration, so a damaged one is `malformed` before the prompt; per study the
  calibration, the sidecar, then the label record LAST; a bundle file gone or damaged at placement, or a calibration the
  store refuses, skips that study, counted as `malformed`; a write failure in the data folder stops the import, and a
  re-import plans the stopped study again because its record is still the older one), then ONE `setState` applies what
  was placed. A local record whose read rejects is never written over (S42). Imported films stay in the bundle folder
  (B5): moving it breaks re-runs and a hand-placed film's display until the film is found again. An update keeps the
  local `id`, `filePath`, `addedAt`, `name`, `workspaceFolder`, `subjectId`, `timepoint`, `filmDate`, `note` and
  `clinical`, and takes the result, the review mark, the comment, the sidecar, the record and the scale.
- **Modules and channels.** `renderer/data/bundle.js` (pure; imports only `persistence.js`, `label-record.js` and
  `labels.js`; `hasStashedEditor` is handed in by the screen): `BUNDLE_SCHEMA`, `bundleFolderName`, `studyFolderName`,
  `localFilmHash`, `planExport`, `exportMessage`, `planImport`, `applyImport`, `importPromptText`, `importMessage`,
  `nothingToImportMessage`. `renderer/data/labels.js` now exports `safeStem` (moved from `label-record.js`). The root
  CommonJS `bundle-io.js` (imported only by `main.js`; imports `writeJsonAtomic` and `readJsonOrNull` from `store-io.js`;
  in both electron-builder allowlists): `BUNDLE_SCHEMA`, `isStudyId`, `isLabelFileName`, `isSafeName`, `exportBundle`,
  `readBundle`, `hashFiles`, `placeImport`; `main.js`'s `predictionPath` and `labelPath` call the validators (its
  `REAL_STUDY_ID` and `LABEL_FILE` are gone). Handlers `export-bundle`, `read-bundle`, `hash-films` (at most 500 paths)
  and `import-bundle`; `preload.js` and `renderer/api.js` `exportBundle`, `readBundle`, `hashFilms`, `importBundle` (only
  `importBundle` gated by `assertWritable`). `renderer/screens/studies.js` exports the flows `exportBundleTo(parentDir)`,
  `importBundleFrom(dir)` and `confirmImport()` (the smoke suite drives them, PB7); module flags `exporting`,
  `importing`, `pendingImport`. The contract's 2026-10-15 amendment "annotation bundles" is the binding text.
- What was built, by commit (`7dec644..` this branch's tip): the plan `ccb825d` and the next-session prompt `69a7262`;
  Task 1 the planner's names and export plan `a810827`; Task 2 `bundle-io.js` `8bd1375`, fixed `5b3002c`; Task 3
  `placeImport` and the four channels `53ade2b`; Task 4 the import plan `9f185b6`, fixed `0e79356`; Task 5 Export from
  the Find tab `21e45d5`; Task 6 Import into the library `5079860`, fixed `50d6311`; Task 7 `tools/smoke/smoke-bundle.mjs`
  `188b103`; then the records commits `27a817b` and `135a25a` (`docs/bundles.md`, the contract, this file, `CLAUDE.md`,
  `docs/level-editor.md`, ROADMAP §1, README, the 1.2.0 release note and CHANGELOG, the plan's Ledger); then the final
  review's fix wave: `eb90e6f` (S37–S40, S42 in code with their tests), `630af13` (the R12 test imports the real label
  rule; the bundle suite's header and one check name) and its records commit.
- Counts: unit 1110/1110 (1024 at the start of the plan; 1040, 1058, 1065 and 1102 after Tasks 1–4; 1110 after the
  fix wave); `smoke-bundle.mjs` phase a 17/17, b 18/18, c 9/9 on two fresh `%TEMP%` profiles (phase c reuses a's; two
  synthetic canvas-drawn films, DOM, store and file reads, no screenshots), the same before and after the fix wave;
  after the fix wave `smoke-studies.mjs` 151/151 and `smoke-workspace.mjs` 100/100, each on its own fresh profile;
  Tasks 5 and 6 were also walked from source over CDP (24/24, and two profiles at 4/4 and 15/15 after the fix).
- The release stays 1.2.0 (PB10): `docs/releases/1.2.0.md` gains a section "Export and import a folder of annotated
  films" and its opening sentence, CHANGELOG's 1.2.0 entry a bullet; no version bump anywhere.
- **Rulings.** The planning rulings PB1–PB10: the validators move to `bundle-io.js` (PB1); the renderer never sees film or
  sidecar bytes (PB2); two IPC reads before a plan (PB3); `applyImport` is pure and the screen does ONE `setState` after
  placement (PB4); `import-bundle` stops at the first failed action (PB5; since S38 only a data-folder write failure
  stops it, and a damaged bundle file skips its study); the manifest is written last (PB6); the smoke suite bypasses
  the pickers through exported flows (PB7); timestamps compare by `Date.parse`, unparseable counts as absent (PB8); an
  update keeps the local `labelFile` (PB9); the release stays 1.2.0 (PB10). The execution rulings S1–S44, each with
  its cost in the plan's Ledger: S1 the main process suffixes a clashing bundle folder; S2 label names
  come from `labelFileName`; S3 `filmPath` is set only when the file is there; S4 export validates every entry first and
  an unsafe `fileName` only costs that study its film; S5 `bundle.js` does not import `isHandPlaced`; S6 `safeStem` gets
  direct tests in `labels.test.js`; S7 the entry's study is the validated record; S8 `deleteLocalPrediction`, amended by
  S21 (only when the bundle's study names a different `predictionId`); S9 `localFilmHash` takes the first valid digest;
  S10 folder names never end in a dot or a space; S11 `BUNDLE_SCHEMA` is held twice and pinned equal by a test; S12 a
  damaged label record skips that entry as malformed; S13 a damaged calibration digest is null in `planExport`; S14
  path hardening beyond the brief (symlinks, device names) deferred; S15 the persistence-gating test lives in
  `api-persistence.test.js`; S16 the prompt names the bundle by its last path segment; S17 an update's `labelComment` is an
  add's expression; S18 a tie between two unparseable records takes the first in manifest order; S19 the stopped-import
  toast's wording; S20 a film-less entry matches by its result's digest; S22 the record fallback also runs for a
  `film_sha256` that is not hex; S23 Export's reason goes on its `title`; S24 an export in flight blocks nothing else
  (deferred); S25 an import blocks the bar's other actions and its prompt takes the bar's place; S26 a pending plan is
  withdrawn when the library or the tab changes; S27 which local records are read; S28 an add whose id the library took
  meanwhile is dropped and named, and the other add paths refuse while importing; S29 a library that changed during the
  read says so; S30 `Importing…`; S31 the import's toast never shows the record id; S32 an edit or re-run started on an
  update target during placement deferred; S33 the staleness check runs before both outcomes; S34 each smoke phase cleans
  its own scratch files and keeps the bundle the next phase needs; S35 both smoke fixtures have a real film on disk, so
  matches are by `film_sha256`; S36 the plan's Ledger carries all of this. From the final whole-branch review: S37
  `notRead` names files, never the SP id; S38 the placement order (calibration, sidecar, record last), source-side
  failures skip a study and destination-side ones stop the import, `readBundle` parses sidecars and calibrations; S39 a
  destination write failure rejects the export; S40 the export toast says files; S41 imported films all read FOLDER
  `film` (deferred to the owner); S42 a local record whose read rejects is never written over; S43 the review's
  "declined to judge" lines, accepted as outside the plan; S44 an invalid `labelFile` rejecting a whole export unnamed,
  and an add keeping the bundle's `addedAt` (deferred to the owner).
- Review: every task reviewed on Opus, four needed a fix round (Tasks 2, 4, 6 and 8; each re-reviewed clean on Sonnet).
  The final whole-branch review (Opus) read "With fixes": I1 a stopped placement could leave a half-applied update a
  re-import skipped for good, and a damaged bundle file stopped every later study on every re-import (S38); I2 a full
  stick at export was reported as films not found (S39); I3 the export toast named SP ids (S37, with S40); I4
  `smoke-studies` and `smoke-workspace` had not run since the Find bar changed. One fix wave closed all four and the
  triage's fix-before-merge items (the R12 test's hard-coded rule, two `main.js` comments, the records' accuracy
  items, the long lines and the editor-round headings, the bundle suite's header and one check name). The note that
  stood here ("one to read first": `notRead`'s `<SP id> sidecar`) is resolved by S37. A scoped re-review of the fix wave
  follows.
- Not run: a packaged build; the human gate (plan Task 9, the owner's); a real film (no screenshot of one); the owner's
  second computer; the other smoke suites on this tree (only `smoke-bundle`, `smoke-studies` and `smoke-workspace` ran
  after the bundle); backend pytest (no backend change).

**Next.** The owner's gate (plan Task 9): Export all from a library of three real films (one segmented, one hand-placed,
one unsegmented) to a folder on a stick, open the bundle; on the other computer (or a second scratch profile) Import
bundle…, read the prompt's counts, Import; the segmented film opens on its stored image, the hand-placed one on its
original, a re-run on an imported DICOM works and so does window / level; import the same bundle again (all skipped);
edit a comment on one side, export, import on the other (one updated, the local film path, name and subject untouched);
export with a film moved away (the toast names it and the study imports without a film). The final whole-branch review
is done and its fix wave landed; its scoped re-review comes first. The owner's list from it, to decide at the gate:
S41 (every imported film reads FOLDER `film` and WORKSPACE the exporting machine's root), S44 (one invalid `labelFile`
rejects a whole export unnamed; an add keeps the bundle's `addedAt`) and S43's lines. Push, the single PR (1.2.0) and
its merge only on the owner's say-so.

### Annotation editor round 2: a comment on the record, Hand-placed, REVERT: BUILT, owner gate passed, 1.2.0 release commit `7dec644` (backed up on `origin`, no PR), waiting on the bundle's gate (branch `worktree-annotation-round-2`, worktree `.claude/worktrees/annotation-round-2`, off `origin/main` @ `06c8cdd`, v1.1.1)

2026-10-15. Three gaps the owner raised in the level editor, each closed on this branch: nothing in the annotation said
why, a failed film placed by hand stayed Failed (the open ruling R24), and one edit could not be undone on its own.

- Spec: `docs/superpowers/specs/2026-10-15-annotation-editor-round-2-design.md` (decisions E1–E7; its section 8 lists the
  records it amends). Plan: `docs/superpowers/plans/2026-10-15-annotation-editor-round-2.md` (eight tasks, rulings
  P1–P10). Its companion, built after this one (E4): `specs/2026-10-15-annotation-bundle-export-import-design.md`,
  which carries the comment across libraries. SDD ledger `.superpowers/sdd/2026-10-15-annotation-editor-round-2/`
  (local, untracked).
- **A comment on the record (E1, E5).** The label record gains an optional, nullable `comment` after `edits` (schema id
  unchanged; a record saved before it validates and reads as no comment); the study gains `labelComment`, the display
  copy, written by the same save as `labelFile`. The editor carries `comment` and `savedComment`; `commentChanged` makes
  `unsavedCount` one higher, so the footer's count, Save edits, the exit prompt and the stash follow with no further
  change. The Vertebral levels footer has a `COMMENT` textarea (its footer never detached by a rebuild, I2; 2,000
  characters, `max-height: 30vh`); Save edits writes the record and `labelComment` and keeps the live text in the box
  (P3); Mark reviewed's zero-change record carries the study's comment; the Analysis screen shows it read-only (six lines,
  scrollable, hidden in edit mode) and the Find search matches it.
- **Hand-placed (E2, E6; closes R24).** `deriveStatus` returns `hand` (`Hand-placed`) for a real study with measurements,
  not failed, not reviewed, whose result no model produced (`isHandPlaced`; the real-study guard keeps demos Segmented,
  P1). Sort rank 4 (`fail 0, proc 1, unseg 2, rev 3, hand 4, seg 5, ok 6`), counted in TO REVIEW, `.badge-hand`. The
  level editor's `sync` passes `clearFailure: isHandPlaced(study)` and the measure queue's write nulls `processingError`
  and `processingErrorAt` in the same patch as the measurements (a per-study flag that survives the debounce, P2); a
  model result's commit passes `false` and any other commit nothing, so a failed re-run over old numbers still reads
  Failed.
- **REVERT (E3, E7).** `revertLevel(editor, code)` returns an Edited level to the model's geometry (a head: the model
  circle, `rim: null`) with `source` back to `model`; `revertPlacedLevel` commits it through `/measure` like a drag. A
  mono `REVERT` button in the row's action column (`revert:<code>`); an edited head stacks Place… over REVERT.
- What was built, by commit (`5835860..` this branch's tip): the Hand-placed status `9d5b4e6`; the queue's `clearFailure`
  `03ed4a3`; REVERT `4f34893`; the comment on the record and the study `872f94d`; Save edits and the reopen `71b7b8c`;
  the panel's box and the Analysis block `8341375`, their height caps `56cec01`; the smoke sections (12's failed film,
  20 REVERT, 21 the comment) `fa0c181`; then the records commit (the design handoff's sections 2, 3, 6, 9, 11 and the
  new 12a, `docs/level-editor.md`, ROADMAP §8, the port and studies-table specs, the contract, the level editor plan's
  Ledger, CLAUDE.md, this file, and four comment-only fixes the reviews flagged).
- Counts: unit 1005/1005 (975 on the base); `smoke-levels.mjs` dom 141/141 and film 25/25 (a fresh `%TEMP%` profile, one
  copied OLIF lumbar film, DOM, store and file reads only, no screenshots); the other suites this workstation runs were
  re-measured the same day, none with a FAIL line (`tools/smoke/README.md`).
- The final review's fix wave (`7be532f`, then a records commit): I1, Place then Discard (or CLEAR, or unchecking the
  only placed level) on a failed film read Hand-placed with nothing placed and its failure erased; now the editor keeps
  the study's failure at entry (`entryFailure`) and `sync` sends an empty hand-placed projection to the screen's
  `clearResult` (the queue's `replaceMeasured`, then one write) instead of `/measure`, so the film reads Failed again,
  or Unsegmented when it held no failure at Edit (a film that never ran, or a hand-placed film reopened in a later
  session); I2, the comment box lost Ctrl+Z and composition because every rebuild detached it; now the footer and its
  comment block persist and the head, list, status line and actions rebuild around them;
  `.analysis-comment-text` wraps long runs (M5); counts after it: unit 1014/1014, `smoke-levels.mjs` dom 145/145 and
  film 25/25, `smoke-studies.mjs` 151/151.
- Not run: a packaged build; backend pytest (no backend change); `smoke-cervical.mjs`, `smoke-segmental.mjs` and
  `smoke-calibration.mjs` (no cervical film, no ruler films, no Tesseract binary here).

**Next.** ~~The owner's gate: the three features on real films from the workstation's films folder, on a `%TEMP%`
profile with `TESSERACT_CMD` at the installed app's bundled OCR (no screenshot of a real film). The fix wave added to
the plan's Task 9 checklist: place then Discard on a failed film reads Failed again; type a comment, drag a handle,
then press an arrow (the arrow must nudge the handle, not move the caret; unverified, since the handle press's
`preventDefault` in `components/viewer.js` may leave the textarea focused); Ctrl+Z after the first keystroke; a
dead-key accent as the first character; and, after upgrading, a look over the real library for old model results with
neither `predictionId` nor `qc.models` reading Hand-placed (spec §9).~~ This gate has passed (`7dec644`'s message,
`docs/releases/1.2.0.md`). What waits now is the bundle's gate (plan Task 9, the section above), then one PR for both
rounds as 1.2.0. Push, PR and release only on the owner's say-so; ~~no release note is written yet (the owner picks
the number; 1.2.0 is the suggestion)~~ the 1.2.0 release commit `7dec644` is on the branch (the tip is backed up on
`origin`, no PR yet). R24 is closed. Still open: ~~the bundle spec's build, which follows this gate~~ (built, the
section above); PR #62 (release accuracy gate) and PR #63 (in-app training); the retraining brainstorm
(`docs/superpowers/NEXT-SESSION-retraining.md`, a new worktree off `main`); the human gate's checklist for the
released editor (plan Task 15).

### Vertebral level editor, window / level, label record — RELEASED as v1.1.0 on 2026-10-12 (PR #60, merge `cbbeb4e`; branch `worktree-level-editor`, worktree `.claude/worktrees/level-editor`, off `origin/main` @ `20fd4c5`, v1.0.17); gate feedback G7 ~~BUILT after it, release 1.1.1 committed, not pushed~~ RELEASED as v1.1.1 (PR #64, merge `06c8cdd`) (branch `claude/level-plates`, worktree `.claude/worktrees/level-plates`, off `origin/main` @ `cbbeb4e`)

2026-10-10. Edit mode on the Analysis screen is now a level editor. In edit mode the right panel is the **Vertebral
levels** panel: sixteen levels in five groups (C2–C7, T1 · T4, L1–L5, S1, two femoral heads), each with a visibility
checkbox, a state badge (Segmented, Edited, Manual, Not placed, Not visible) and Place… / CLEAR / CANCEL; the stage
places a missed level by clicks, gives the selected level its handles, and refits a femoral head from 2–4 rim points;
a display-only window / level decodes the original film and windows the film layer only; **Save edits** writes one
label record per film for retraining, at `userData/labels/<stem>.label.json` (and, since G6, **Mark reviewed** writes
the zero-change record of a film that has none). A film whose segmentation failed opens in edit mode on its original
and can be placed by hand.

- Spec: `docs/design/level-editor/HANDOFF.md` (`594a982`; its §12 now lists the decisions). Plan:
  `docs/superpowers/plans/2026-10-10-level-editor.md` (`3a4019a`), 15 tasks; its Decisions table D1–D20 and its
  `## Ledger` (every task's commits and counts, rulings R1–R45 with their costs, every deferred minor) and its
  `## Gate feedback (2026-10-11)` section (G1–G7, the spec of record for all seven). User doc:
  `docs/level-editor.md`. Contract: the 2026-10-10 amendment. SDD ledger
  `.superpowers/sdd/2026-10-10-level-editor/progress.md` (local, untracked).
- What was built, by commit (`594a982..` this branch's tip): the level model `77c8e5a`; the projection into
  `study.geometry` `fb07447`, `725e114` (R8); handles and Tab order `15f289a`; `state.levelEditor` `c5d8771`; the label
  record and the C2 schema amendment `7d8663d`, `25f4c69`; `labels/` on disk with `labelFile`, IPC, delete and
  quarantine `2aebe22`; `POST /decode` and `qc.model_versions` `868e99e`; window / level in the renderer `6c3ee93`,
  `daa8380`; drawing the level editor `eff7f6b`; the stage wiring `ffbac68`, `1ca16a9`, `9b099e9`, `0aef002` (R16, R17);
  the panel `38dcccf`, `276c437` (R18); contours from the label mask `2051715`; the old landmark editor's handle code
  retired `ccee104`; the smoke suite `3b5ab3b`; the landmark-editor smoke suites rewritten `c37c112`; the records
  `0d5d629`, `871b475` (R19). The final whole-branch review ("With fixes": I1–I4) and its wave: `7e9d502` (R20 an Auto
  film with no model run takes its region from its placed levels on every projection; R21 Region and Orientation
  disabled while editing; R22 no femoral head under 0.5 px), `e3d5df7` (version-derived test expectations; the panel's
  rebuild key), and the records (R23, R24, the gate checklist). The wave's re-review was clean; its one residual, a
  rim-point drag or nudge that would leave a head under 0.5 px, is refused: `f3a3a32` (R25). The pre-gate smoke run of
  2026-10-11 found two suites stale since before the branch base (seeding's export columns and header line;
  manual-calibration's 240 s batch wait against Auto detection), fixed in `f610a8d` with the README's baselines.
- The owner's gate feedback of 2026-10-11 (asked for at the human gate, which has not passed yet; the plan's "Gate
  feedback" section and its Ledger): G1 zoom to 8x, `ZOOM_MAX` 2.4 → 8 (`9e2deec`); G2 the step chips choose which
  point the next click places, in any order, a placed point is re-placed from its chip, and UNDO clears the most recently
  set point (`placing` is `{code, points, current, history}`, `setPlacingStep` / `selectPlacingStep`; R26 a click within
  1 px of any other point of the placement is dropped, R27 a re-placed point counts once, so UNDO clears it; `068c8e2`);
  the records `8fddcea`. Their review was approved with four minors, fixed in one wave: `dcd0cb5` (R28 past 1:1 the
  overlay keeps its image-pixel size and magnifies with the film instead of shrinking under a pixel; a LEFT-first
  chord's take-back of a placement press restores the placing from before the press, `restorePlacing(prior, pressed)`,
  so a press that re-placed a point no longer loses it) and the records commit (ROADMAP §8's fixed chord clause struck;
  decisions 114–116 below; Task 15 gains a G1 and a G2 item). Then G3 and G4 (the owner: "windowing available not in
  editing screen as well", and "right click and window as shortcut"; D15–D17, decisions 117–125 below): window / level
  works outside edit mode and belongs to the view like zoom and pan (`state.filmWindow`, written only by the new
  `renderer/film-window.js`; FRESH_VIEW resets it, edit mode keeps it; the level editor carries no window any more), a
  right-button drag windows the film in every mode without the panel, and a double right-click (`isDoubleClick`, pure)
  restores the default; rulings R29–R34. `8cf213d` (code, tests, smoke section 17) and the records commit `106042a`.
  Their review was approved with five minors, fixed in one wave (decisions 126–128 below): `8332dfb` (R35 a window
  kept across Back and the sidebar's return is decoded again at the mount when another study's run took the film's
  cache entry, `windowNeedsDecode` / `redecodeKeptWindow`, and forgotten when it cannot be; R36 the open W/L panel
  outranks the Pan toggle for the left button; R37 a right press windows only once it has moved 3 CSS px,
  `exceedsSlop`, so a stray right click or a right-first chord decodes nothing; smoke section 17's missing cases) and
  the records commit (D15 worded as the behaviour: it resets where zoom and pan reset, and Back and the sidebar's
  return keep it; Task 15 gains an R35–R37 item). Then G5 (D18, decisions 129–131 below): the label record lists each
  level's and head's `edited_points` and carries an `edits` summary, `edited` exactly when the list is not empty (R38),
  both fields optional under the same schema id (R39), with the window re-review's two minors folded in (entering edit
  mode forgets a ready window its film comes back without an original for; decision 121 reworded): `3e552e6` and the
  records commit, unit 939/939. Then G6 on 2026-10-12 (D19, decisions 132–134 below): Mark reviewed also writes the
  label record when the study has none yet, the zero-change record of the stored state (what Save edits writes right
  after entering edit mode with nothing changed); unmarking writes nothing, a study with a record is left alone, R40
  no write while the study's level edits are open or stashed, R41 the mark never waits for or depends on the write.
  `renderer/level-editor.js` `writeReviewRecord` over `writeRecord`, the one write it shares with Save edits (the
  latch `saving` shared, naming its holder); `toggleReviewed` calls it after marking. `ad2b70b` (code, tests, smoke
  section 18) and the records commit; unit 948/948. Its review round 1 (R42, decision 135): the review write reads the
  segmented film's stored image only (`imageInfo(studyId, { storedOnly: true })`, from the image cache or the sidecar,
  never `/decode`), so opening the next film straight after the click can no longer fail it; unit 953/953.
- **Released as v1.1.0 on 2026-10-12.** The branch was pushed to `origin` (Feches) at the owner's choice with the
  1.1.0 release commit `54c2511` on it (G6 and R42 included); PR #60 merged it to `main` as `cbbeb4e` the same day,
  which carries the tag `v1.1.0` and published the installers. The human gate's checklist (plan Task 15) stays the
  owner's to tick on the released build; ~~R24 is still open~~ (closed 2026-10-15 by E2, in the first section above).
- **Gate feedback G7 (2026-10-13, D20, decisions 136–138 below; branch `claude/level-plates` off `cbbeb4e`).** The
  owner: "the vertebral body labeling gets in the way. Is there a way to move them?" On a film facing right every
  level's plate sat inside its body (Task 9 fixed it 14 px right of the posterior edge). Each plate now sits outside
  its level on the posterior side (R43: `labelPlacement` in the new pure `renderer/viewer/level-labels.js`; a body by
  its posterior edge against its corners' mean x, C2 by IP against its centroid, an endplate by SP against SA, and under
  1 px, always for T4, the side opposite the film's anterior side, `plateAnteriorSide`; `drawLevelLabel` draws a side
  −1 plate with its right edge 14 px left of the anchor; `drawLevelEditor` and `drawDynamicLayer` return the plates
  drawn in image px), and any plate can be dragged in edit mode, a double-click putting it back (R44:
  `state.platePositions`, code → `[dx, dy]` image px, in the store and both FRESH_VIEW copies, written only by
  `components/viewer.js`; hit-tested after the selected level's handles, which win; not while placing, with the W/L
  panel open or with Pan on; a chord dismantles the drag; never persisted or recorded; `clientToImage` gains
  `{ clamp: false }`; `drawnPlates()` exported for the smoke). `6463f63` (code, tests, smoke section 19) and the
  records commit, then the 1.1.1 release commit (`docs/release-main.md`: `package.json`, `version.js`, CHANGELOG,
  `docs/releases/1.1.1.md`, the README link). Unit 974/974.
- Counts: unit 974/974 after G7 (level-labels +15, canvas +4, demo-visibility +1, geometry +1); `smoke-levels.mjs` dom
  121/121 after G7 (section 19's seven checks; twice on one launch on a fresh `%TEMP%` profile, CDP 9341, DOM, store
  and file reads only, no screenshots; the film phase and the other suites not re-run). Before G7: unit 953/953 after
  G6's review round 1 (948 after G6, 940 before it, 939 after G5; 925 after the review of G3 and G4, 918 after G3 and G4, 901 after the gate feedback's review wave,
  898 after G2, 888 after the final review's wave and R25, 887 after the wave, 879/879 before it; 615 at the base; 905
  before Task 13 retired 26 tests of removed code); `smoke-levels.mjs` dom 114/114 after G6's review round 1 (section
  18 opens the next film straight after the click and reads stored-only; fresh `%TEMP%` profile, CDP 9333, DOM, store
  and file reads only, no screenshots; the film phase and the other suites not re-run), dom 112/112 after G6 (section 18's seven checks;
  fresh `%TEMP%` profile, DOM, store and file reads only, no screenshots; the film phase and the other suites not
  re-run), dom 105/105 and film 25/25 after G5 (`tools/smoke/README.md`), dom 102/102 after the review of G3 and G4
  (fresh `%TEMP%` profile, DOM reads only, no screenshots; the film phase and the other suites not re-run); after G3 and G4 on a fresh
  `%TEMP%` profile: dom 94/94 (79 before section 17; G2's four checks pass among them) and film 23/23, then on the same
  launch parity 15/15, gate1 25/25, gate2 26/26, gate3 26/26, chip 20/20, chord 28/28 (DOM reads only, no
  screenshots). Backend `pytest
  backend -q` 762 passed, 3 skipped (the sc-export venv; the main checkout's graphs hard-linked into the worktree's
  gitignored `backend/onnx/`). The pre-gate smoke run of 2026-10-11 on `9287473`, every suite on its own fresh
  `%TEMP%` profile, one app at a time, DOM reads only (one copied real lumbar film for the film phases, two for
  processing, onnx-localizer and manual-calibration): landing 16/16; parameters 58/58; studies 151/151; workspace
  100/100; persist 42/42 then 55/55; parity 15/15, gate1 25/25, gate2 26/26, gate3 26/26, chip 20/20, chord 28/28;
  femoral-confidence 16/16 then 5/5; disc-heights 13/13; partial-segmentation 8/8; accuracy 17/17; global-sva 21/21;
  levels dom 75/75 and film 23/23; processing 15/15; onnx-localizer 10/10; seeding 34/36 then 36/36 and
  manual-calibration (timed out at 240 s) then 5/5, 7/7, 5/5 after `f610a8d`.
- Not run: the human gate (plan Task 15; its checklist is prepared in the plan, G7's item added); a packaged build of
  `claude/level-plates` (v1.1.0's installers were built by its merge; 1.1.1's will be built by its PR's merge); after
  G7, the film phase of `smoke-levels.mjs`, the gate chain (parity, gate1–3, chip, chord) and the other suites, and
  backend pytest (G7 changes no backend file); `smoke-cervical.mjs` and `smoke-segmental.mjs` (no lateral cervical film on this
  workstation, and both screenshot their film); `smoke-calibration.mjs` (no Tesseract binary and no ruler films on this
  workstation, and it screenshots); a DICOM film's default window from its tags on a real DICOM (the unit and backend
  tests cover it).

**Next.** (Written 2026-10-13, before PR #64 merged: v1.1.1 is released and this paragraph is history; the current Next is
the first section above.) The owner checks G7 on their right-facing film (plan Task 15's new item: the plates outside the bodies on
the posterior side, the drag, the double-click, the reset on opening another film) and says whether to push
`claude/level-plates`; its PR to `main`, merged with Create a merge commit, publishes v1.1.1. Before the push its smoke
baseline (dom 121/121 when written) is worth re-measuring with the gate chain (parity, gate1–3, chip, chord), since
the plates now take left presses in edit mode that used to do nothing. Still open on the released editor:

- ~~**R24, the owner's decision:** a film whose segmentation failed and whose levels were then placed by hand still
  reads Failed, sorts first and blocks Mark reviewed; clear `processingError` on the first hand-placed commit, or give
  such a film its own status? (Task 15's checklist; ROADMAP §8.)~~ Closed 2026-10-15 by E2 (annotation editor round 2:
  a status of its own, Hand-placed, and the first hand-placed commit clears the failure).
- **Michael's PR #61** (a missing-vertebra annotation in the old edit bar) was closed unmerged, as superseded by the
  level editor.
- **PR #62** (a release accuracy gate) is open; once merged, it blocks publication until its variables and token are set.
- **PR #63** (in-app training from reviewed annotations) is open and overlaps the retraining brainstorm,
  `docs/superpowers/NEXT-SESSION-retraining.md` (its own branch; no app change): read #63 before that brainstorm starts,
  so the two do not build the same pipeline twice.
- The human gate's checklist (Task 15) on the released build: real films from the owner's library, both themes, the
  items the final review added (a cervical film, a full-spine film, a DICOM film, a failed Auto film with C and L levels
  placed, a double-click while placing a head) and the re-check of G1 to G7.

**Follow-ups (deferred; see `docs/ROADMAP.md` §8):** the handoff's row keys (↑/↓, Space, P); a batch started from the
Find tab can still overtake an open or stashed editor; a hand-placed film whose
source moved opens to a black stage outside edit mode; and the smaller items in the plan's Ledger.

### Failed-status additions on 1.0.13 (issue #39 follow-up) — DONE; release 1.0.15 awaiting the PR (branch `claude/issue-39-failed-status-port`, off `main` @ `9992b99`, v1.0.13, merged with `origin/main` @ `e7ae5a3`, v1.0.14)

2026-10-01 → 02, main checkout. Issue Feches/Spine-Contour#39 (a batch film that failed orientation or automatic
detection stayed "Processing") was closed by Michael's 1.0.13 Failed status (PR #50, `8264de8`). The user compared it
with the design they had approved on the local branch `claude/issue-39-failed-status` (spec
`2026-09-29-failed-status-design.md`; tested end to end; never pushed) and chose to keep 1.0.13's model and add five
decisions on top: films with no result read Unsegmented, and Processing is the running film and every film waiting
in the running batch; Failed is its own red; the tooltip carries the date (`processingErrorAt`); the Analysis screen
shows the reason (red note, FAILED card); stored reasons are plain sentences.

- Spec: `docs/superpowers/specs/2026-10-01-failed-status-port-design.md` (`85b9d54`).
- Plan: `docs/superpowers/plans/2026-10-01-failed-status-port.md` (`c98be25`), 8 tasks; its `## Ledger` holds every
  task's commit and count, the Task 8 reads and the rulings made while executing.
- Executed 2026-10-02 by subagent-driven development, a fresh implementer and a task review per task; every task
  reviewed clean. Task 1 `178da6c` (unit 597), 2 `1972074` (599), 3 `a4727d3` (609), 4 `a44d1b3` (610), 5 `b84848c`
  (613), 6 `b88ba8b` (613), 7 `d2110b3` (613).
- The final whole-branch review (an opus workflow: five reviewers plus adversarial verification; verdict "with fixes";
  no product-code defect) left one missing unit test, a failure outranking the review mark (`2dff03f`, unit 614), plus
  the contract (`1bd4419`) and Task 8's expectations and the smoke README (`027054b`); all fixed and re-reviewed clean.
- Two stale smoke expectations from earlier releases, fixed here as test-only commits: `97b7478` (smoke-workspace,
  1.0.12's Keep column name option) and `e980f64` (smoke-parameters, 1.0.11's ten segmental columns in the paired
  export). No product code depends on them, but the release notes' Checks section counts their suites (100/100, 58/58):
  dropping either now means reverting it and editing `docs/releases/1.0.15.md`, CLAUDE.md and the plan Ledger, and that
  suite is red again.
- Task 8 on the pre-merge branch: unit 614/614; `smoke-studies.mjs` 151/151; `smoke-workspace.mjs` 98/100, then 100/100
  after `97b7478`; `smoke-persist.mjs` 41/41 then 53/53. Real films: ten copies on the RTX 4070, DOM reads only, no
  screenshots. A batch turned all ten to Processing at once and Stop returned the waiting films at once; a film whose
  file had been moved away read Failed with the file-not-found sentence and a dated tooltip; three films whose
  automatic film detection was inconclusive read Failed with the backend's sentence; the failures survived a restart;
  setting one of them to Lumbar cleared its failure and it then segmented. Verification record `168a3c5`. Human gate
  passed (user, 2026-10-02).
- Merged `origin/main` @ `e7ae5a3` (v1.0.14, PR #52) as `0b92fbd`: a CHANGELOG conflict only; 1.0.14's edits to the
  three shared screens are comment-only; unit 614/614. Smoke on the merged tree, each on a fresh scratch launch:
  `smoke-landing.mjs` 16/16, `smoke-studies.mjs` 151/151, `smoke-workspace.mjs` 100/100, `smoke-parameters.mjs` 58/58
  (56/58 before `e980f64`), `smoke-persist.mjs` 41/41 then 53/53.
- Release 1.0.15 committed as `2687cf5` (package.json, version.js, CHANGELOG, the README link,
  `docs/releases/1.0.15.md`, CLAUDE.md).
- SDD ledger: `.superpowers/sdd/2026-10-01-failed-status-port/progress.md` (gitignored, local to this checkout):
  rulings R1–R12 and the task log.
- `claude/issue-39-failed-status` is a reference only — never merged, rebased onto or cherry-picked.

**Next.** The branch is pushed to `origin` (`github.com/Feches/Spine-Contour`, the only remote in this checkout;
CLAUDE.md's Git section describes another workstation's `fork`/`origin` layout) at the owner's choice on 2026-10-02. The
owner opens the PR to `main` and merges it with **Create a merge commit**; the push to `main` publishes v1.0.15
(`docs/release-main.md`). The PR body says it follows up Feches/Spine-Contour#39.

**Follow-ups (deferred; each needs the owner's call):**

1. Stop pressed while a turn's film file is still being read: that film reads its own status briefly, then Processing
   (spec §3's formula vs P1; changing it needs the owner's ruling).
2. Failures recorded before 1.0.15 (by 1.0.13 or 1.0.14) keep their raw, uncapped text until the next attempt (the spec
   rewrites on write only).
3. Pre-existing 1.0.13 bug: `planBatch` (`renderer/data/batch.js:32`) offers a measured Failed film but the batch
   driver skips it (`batch.js:145`) and the closing toast says "segmented meanwhile" — a separate issue.
4. Contrast: the Unsegmented/Processing grey is about 3.3:1 (pre-existing `--muted`); the dark Failed pill is 4.28:1 on
   a hovered Find row; Failed vs Needs review in the dark theme.
5. After Stop, the Analysis card keeps QUEUED for films that will not run (both specs mandate it today).
6. Changing a Failed film's View does not clear its failure; no failure column in the Parameters grid or the CSV.
7. The Find table overflows horizontally at the default 1180×900 window (pre-existing).
8. Whether to tell Michael (PR #50's author); what to do with the superseded local branch
   `claude/issue-39-failed-status`.

### Filename grammar, note, paired visits, names — DONE; release 1.0.8 awaiting the PR (branch `claude/spine-contour-filename-parse-b6c1bb`, off `fork/main` @ `6704586`, v1.0.7)

2026-09-11 → 13, worktree `.claude/worktrees/spine-contour-segmentation-failures-82e370` (its directory name predates
this work). Four bounded brainstorms settled in chat, no spec or plan files: the pre-op/post-op spec was amended in place
(§7.1 `note`, §8.1 rule 3 and its second table, §8.3, §8.4, §9, §11.1, §11.2, §11.3, §18), with the contract's `Study`
typedef and module list and ROADMAP item 2. Commits: `a139f49` feat filename grammar + note; `efd9848` docs; `048415d`
feat paired export by visit; `991be31` docs; `dc41870` feat cross-film PI-LL mismatch; `2255ce6` docs; `b0cbcef` fix one
`.study-name` rule and the collapsed open-study button; `8bee7ec` feat exports name films by study name; `87c8a0a` fix no
record id anywhere a person looks; `85433a0` docs `docs/naming-films.md` (the website how-to's source); `51ecba2` chore
release 1.0.8. User-facing summary: `docs/releases/1.0.8.md`.

On `51ecba2`: unit 542/542; `smoke-studies.mjs` 136/136; `smoke-seeding.mjs` 36/36; `smoke-parameters.mjs` 58/58;
`smoke-workspace.mjs` 100/100 (three fresh scratch launches, 2026-09-13). NOT run: `smoke-persist.mjs` (the restart and
prediction path is untouched), the backend pytest (no backend change), `smoke-femoral-confidence.mjs` (needs the
developer's fixture), and the packaged-build checks (wait for the v1.0.8 installer). Human gate: the user ran the
source app on their own library on 2026-09-12/13 — nine films parsed, the paired export produced two subjects with the
merged pre-op visit, names and hover as expected — and said "ok that looks better". One false alarm on the way: a
"No paired subjects" report came from an Electron started in the OLD worktree (`studies-ui-updates-bb040d`); the fix
was the launch path, not the code (Known traps below).

**Rulings made in chat (2026-09-11 → 13)** — each with its cost if wrong:

1. **Underscore is the only field separator** in a film's stem; spaces and hyphens inside a field are content. Cost: a
   name using hyphens or spaces between fields (`S001-6-wk`, `S001 pre op`) parses as a subject only; rename the file.
2. **The note is a top-level `note` field** (drawer NOTE column, CSV `Note`, searchable), not a clinical key and with no
   CSV structural column. Cost: a workspace CSV cannot set it; it is read from the name or typed.
3. **A load never rewrites a stored subject**, even one the old parser stored as the whole stem; the user chose delete
   and re-add over a fill-blanks exception. Cost: libraries loaded before 1.0.8 need that per affected film.
4. **Paired export by visit**: visit = subject + label + film date; `<label> N` numbering only when some written subject
   has two or more on that label; the unnoted film is the primary and a noted film fills its gaps; disagreements are
   flagged in the toast (three columns per visit, then `+N more`) and in a per-visit `disagreements` column; two unnoted
   or two noted same-day films, and two Pre-op dates, are ambiguous and named. Cost: the file's header shape changes
   with the data (a second visit renames `Post-op` to `Post-op 1`), so downstream scripts must read headers by name.
5. **A merged visit's PI-LL mismatch is derived from the merged PI and LL** (the user asked for it after seeing it
   blank) and flagged in the toast and a per-visit `derived across films` column naming the film behind each input.
   Cost: a value no single film measured is in the file — flagged so a reader can discard it.
6. **One `.study-name` rule for the Find list and the Parameters grid**: 280px cap, `white-space: normal`,
   `overflow-wrap: anywhere`, never an ellipsis; Find's STUDY track is `minmax(200px, 2.2fr)` with floors on the other
   tracks and the table scrolls sideways when too narrow; the grid's sticky STUDY cell has `min-width: 226px`; the
   collapsed sidebar's open-study card is an icon-only button with the name as title. Cost: a window under about
   1300 CSS px with the sidebar open shows a horizontal scrollbar on Find.
7. **Both exports name a film by `studyName` (the stem)**; `Study ID` holds it (the import's join key); **the SP-nnnn
   record id appears nowhere a person looks** — the four id tooltips are gone and a `Record ID` column added earlier the
   same day was withdrawn. Cost: two films with the same stem under different workspaces are indistinguishable in a
   file; raise ROADMAP item 2 option (c) before ever exporting the id.
8. **`fileStem` lives in `data/labels.js`** and `data/csv.js` re-exports it, so labels.js imports nothing from csv.js
   and csv.js may import `studyName`. Cost: none.
9. **Find's DATE column stays the date added** (the studies-table design); the user was told and did not ask for the
   film date there.
10. **1.0.8 is a PATCH increment**, per the project's precedent for new features.

**Next.** The user opens the PR at `https://github.com/Feches/Spine-Contour/compare/main...claude/spine-contour-filename-parse-b6c1bb?expand=1`
from the body file handed over at the wrap, waits for the PR run, and merges with **Create a merge commit**; the push
to `main` publishes v1.0.8 (~12 min). Then the packaged-build checks on the installed 1.0.8: no DEMO STUDIES row, no
`library-preferences.json`, automatic calibration with the bundled OCR, and this release's own — the nine OLIF films'
names on Find and Parameters, `Export paired CSV` writing two subjects with the merged pre-op visit, and the note
surviving a restart. Open after that: ROADMAP item 1 (the comment block blocks a CSV round trip; the identity half is
done), the website how-to (source: `docs/naming-films.md`), `smoke-persist.mjs` on this tree.

### Studies table — DONE (branch `claude/studies-table-ui-updates-953945`, off `fork/main` @ `6106463`, merged with `fork/main` @ `71d483f`, v1.0.5)

2026-09-10. Spec `specs/2026-09-10-studies-table-review-design.md`; plan `plans/2026-09-10-studies-table-review.md` (Tasks 1–9,
its `## Ledger` at the end holds every ruling and count). Delete over the ticked visible rows replaces `Delete all studies`
(`830046d`, `1d3e09c`); every Find header sorts (`findSort`, `data/find.js`, `3102a07`); PATIENT is SUBJECT and edits in
place (`830046d`, fixed for focus/clipping/tab-withdrawal in `6c4abef`); a stored `reviewedAt` gives the fourth status,
Reviewed, set from the Analysis panel (`1b9093a`, `122a440`, `c227d7d`) and cleared on every numbers-changing write; demo
hiding is a development-only Settings toggle (`1d3e09c`, `set-demo-studies-hidden`, refused when packaged). Smoke coverage
and cleanup landed in `ae6f345` (Task 7's gated commit), `86d97ed` (chore), `c1e61a3` (test) and `295c9fd`
(fix: a rebuild mid-edit no longer commits and closes the SUBJECT editor, spec 7.3).

On the branch before the v1.0.5 merge: unit 505/505; `smoke-studies.mjs` 136/136; `smoke-persist.mjs` 40/40 then 47/47;
`smoke-parameters.mjs` 58/58; `smoke-workspace.mjs` 100/100; `smoke-seeding.mjs` 36/36 (not re-run). The human gate passed
2026-09-10 (user): "OK IT PASSED all 7." The packaged-build checks (no DEMO STUDIES row, no `library-preferences.json`)
were NOT run — wait for the next preview installer. `fork/main` is the trunk now: the backend developer took
`fork/ui-redesign-cw` and released v1.0.0–1.0.3 on top of it. The branch then merged `fork/main` @ `71d483f` (v1.0.5:
optional PACS toolbar removal + persisted manual image calibration) as `ceacc7e`; the merged tree reads unit 513/513;
its smoke-suite counts are recorded in the plan's `## Ledger` and in the release PR's description once the suites
have run on the merged tree. **Next:** the 1.0.6 release commit, then a PR to `fork/main` whose merge publishes the
v1.0.6 installers; the packaged-build checks run on that installer. **Done 2026-09-10:** v1.0.6 published from b083d7d (PR #11).

**Superseded (folded into the DONE section above, 2026-09-10) — the original planning-session status, kept for the record:**

### Studies table — PLANNED, not started (branch `claude/studies-table-ui-updates-953945`, off `fork/main` @ `6106463`)

2026-09-10. Brainstormed and planned in one session; execution is the next session's. Spec
`specs/2026-09-10-studies-table-review-design.md` (`e6178fe`; §11 holds the user's rulings and the planner's four
assumptions); plan `plans/2026-09-10-studies-table-review.md` (`f6e421b`; Tasks 1–9; its "Rulings made while planning"
carries every planner ruling with its cost; its `## Ledger` is empty until execution). What it builds: Delete over the
ticked visible rows replacing `Delete all studies`; every Find header sorts (`findSort`, `data/find.js`); PATIENT becomes
SUBJECT and edits in place; a stored `reviewedAt` gives the fourth status Reviewed, set on the Analysis panel and cleared
on every numbers-changing write; demo hiding becomes a development-only Settings toggle (`set-demo-studies-hidden`, refused
when packaged). **`fork/main` is the trunk now** — the backend developer took `fork/ui-redesign-cw` and released
v1.0.0–1.0.3 on top of it (fork PRs #4–#8); the reconcile section below and R-M3 are superseded where the plan says so.
Unit 479/479 on the base; the smoke baselines in `tools/smoke/README.md` were not re-run on it. Subagent models per the
user (2026-09-10): the lowest that is reliable — Sonnet everywhere but the Find tab task (Opus), never Fable.

### Upstream reconcile and handover — DONE (branch `claude/upstream-reconcile-2026-09-08`, pushed as `fork/ui-redesign-cw`)

On 2026-09-08, after the batch was merged back into `claude/studies-ui-updates-bb040d` (fast-forward to `b7789b3`), the
backend developer's trunk `origin/ui-redesign-cw` @ `5078b1c` — four commits from 2026-09-07: ruler-based folder
calibration (backend `calibration.py`, `ruler_extraction.py`, `/calibrate` and `/calibration-profile`; a renderer
`screens/calibration.js` with `components/calibration-viewer.js`, `components/folder-calibration.js`,
`data/calibration.js`), OCR packaging in the workflows (`tools/packaging/*.py`, a Tesseract `--add-data`), a calibration
prompt after every nonempty workspace folder scan, and "Delete all studies" with a one-way `hideDemoStudies` preference —
was merged into the UI branch as `2bf3d21`, followed by `5cf52c7` and `245cae2` (the reconcile fixes). Four
files conflicted (`renderer/main.js`, `screens/studies.js`, `screens/workspace.js`, `styles/screens/studies.css`);
the rulings, each with its cost, are in the reconcile ledger (git-ignored) and summarised here:

- Demo gating keeps both mechanisms: `demoStudiesAllowed() && !hideDemos ? merge(real) : real` — a packaged build never
  shows demos (decision 19), and a development build hides them after "Delete all studies" (his preference file
  `library-preferences.json` in userData). The empty-state wording is ours (`EMPTY_COPY`).
- "Delete all studies" is kept as his feature, mounted library-level between the Studies header and the Find | Parameters
  tab strip; it also refuses while a batch is up (`WAIT_FOR_BATCH`), says "including demos" only when a demo is present,
  and prunes the deleted ids from the shared `paramSelected` (as the single delete does; `nextId` reuses a freed id at
  once). The search input mirrors `live.query`, which the bulk delete clears. **Superseded 2026-09-10** by Delete over the ticked visible rows on the Find bar and a development-only Settings toggle for the demos (studies-table spec §5, §9).
- His run-path guard is an outcome in `segmentStudy` (`{ ok: false, reason }`, toast only when interactive); the batch
  driver refuses `startBatch` while `deletingStudies` (one test); `deleteAllStudies` sets `deletingStudies` before its
  first await, so run, batch and bulk delete are mutually exclusive.
- The workspace folder-choose handler sets our keys (`wsFolder`, `wsFiles`, `wsFolderRows`) and his
  (`calibrationRequest`, `screen: 'calibration'`) in one `setState`; his screen returns to Workspace, where the folder
  table is showing. **Every nonempty folder scan now detours through his calibration screen** (Skip for now / Calibrate
  folder and continue); no smoke suite drives that path.
- Verified: unit 433/433; `smoke-parameters.mjs` 58/58; `smoke-seeding.mjs` 36/36; `smoke-workspace.mjs` 100/100;
  `smoke-studies.mjs` 103/103; `smoke-persist.mjs` 36/36 then 44/44; both allowlists identical; CSP untouched. The
  Python suite was not run on the merged backend here (the backend developer's); `scipy` and `pytesseract` were added to
  the venv. Two reviews (the merge, then the fix) on Opus and Sonnet; findings in `docs/ROADMAP.md` §5.
- **Human checks done 2026-09-08/09 on the installed preview build** (`9e360fd`): no demo studies in the packaged
  build; a batch ran from the Find tab; his calibration screen was walked (the user reports each image has to be
  calibrated individually — his design, recorded in ROADMAP §5 for him); console clean. The empty-library first
  launch was not seen because the upgrade kept `%APPDATA%\Spine-Contour Preview` from the earlier preview install.

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
- Verified: unit 426/426; `smoke-studies.mjs` 103/103 (the stale diagnosis check fixed); `smoke-workspace.mjs`
  100/100; `smoke-parameters.mjs` 58/58; `smoke-persist.mjs` 36/36 then 44/44. Task 5's human gate passed 2026-09-08
  (user): all seven checks on the real library — filter bar, ticks, the button, a batch, Stop, completion and export,
  console clean.
- Final whole-branch review (Opus, 2026-09-08, after Tasks 1–7): one Important finding, fixed in `9d4b267` —
  `deleteStudy` checked `running` only BEFORE its `await deletePrediction`, so a delete confirmed on a queued study
  during the film's byte-read window could remove the record while the run continued and `recordPrediction` re-added a
  snapshot under an id `nextId` can reuse (RESET TO PREDICTION over another study's geometry). It now re-checks after
  the await and refuses late with the existing toast, and `segmentStudy` re-checks the record's identity by `addedAt`
  after the images decode, before the sidecar, the cache, the snapshot and the commit. Docs fixes in `ec7ffff`. Parked
  with rulings in the plan's `## Ledger`: the late refuse can leave a segmented record without its sidecar until the
  in-flight run rewrites it (interactive re-run only; recoverable as `FILM UNAVAILABLE`); a delete landing in the
  byte-read window is filed as failed, not skipped (ROADMAP §5); `smoke-persist.mjs` comments still say
  `runSegmentation` (ROADMAP §5); the race fix has no automated coverage.
- **Not done here: the merge back into `claude/studies-ui-updates-bb040d`** — at the user's say-so only. While the
  studies tip is still `192f303` it is a fast-forward.

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
- Verified at the wrap (2026-09-08, fresh scratch launches): unit 402/402; `smoke-parameters.mjs` 58/58;
  `smoke-seeding.mjs` 36/36; `smoke-workspace.mjs` 100/100; `smoke-studies.mjs` 59/60 — the one failure,
  `searching the diagnosis text leaves only SP-0042`, is stale since `0f8f821` (decision 40 gave SP-0039 a diagnosis
  containing "Anterior slip"), not this branch's; see `docs/ROADMAP.md` §5. Task 4's human gate passed (the user:
  "ok checks pass"; outcomes in `19b8d43`'s body). Final whole-branch review (Opus, 2026-09-08): ready to merge, no
  Critical or Important finding; one fix wave (`b37b759`: `pairStudies` reads a `Pre-op` post label as All paired
  instead of self-pairing; the demo predicate aligned to `=== 'real'`; two records reworded). Branch tip `b37b759`
  plus the wrap's docs commit, pushed to `fork`. **Merged back into `claude/studies-ui-updates-bb040d` on 2026-09-08 at
  the user's say-so (fast-forward; both branches at the same commit, both on `fork`).** The user's next work, decided
  in chat the same day: batch segmentation of loaded films, ahead of a release — new design, brainstorm first.

### Study fields — task 2 of the pre-op/post-op spec, DONE (branch `claude/preop-postop-study-fields`)

Spec: `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` §7, §8 (with §8.5), §9,
the §10.3 filters and subject sort, §11.1's three columns. Plan: `docs/superpowers/plans/2026-09-07-study-fields.md`
(its `## Ledger` carries every ruling and every deferred finding). Commits: `git log --oneline 76e86b7..HEAD`.

- Every record carries `subjectId`, `timepoint`, `filmDate` (optional, null-default, no `STORE_VERSION`
  bump; `validateStudy` returns them and nulls a malformed date with a warning). `view` is editable
  and seeded per folder; a cleared view stores `''`, never null.
- `renderer/data/timepoints.js` (vocabulary, §7.2 order, `parseFilmDate`) and `renderer/data/seeding.js`
  (folder/stem inference, `folderRows`, `seedFields` for §8.3) are pure and unit-tested. The workspace
  load seeds the four fields under fill-blanks, reads the CSV's `subject_id`/`timepoint`/`film_date`/`view`
  columns (never into `clinical`), and its toast carries the §8.4 clauses.
- The Workspace card shows the folder table (`state.wsFolderRows`, rebuilt by every scan, never
  persisted) with per-row and set-all selects; the mapping card shows the join key and structural
  columns as fixed chips.
- The drawer has a Study group (SUBJECT, TIMEPOINT with a datalist, FILM DATE as a date input, VIEW with a
  datalist) ahead of the clinical fields; a typed timepoint normalises to a known label; Import from
  CSV also writes the four fields.
- The Parameters grid shows the four columns after STUDY, filters by timepoint (with `No timepoint`),
  view, subject substring and paired-only (`with` a post label whose default is `All paired` — any
  labelled non-Pre-op film — evaluated before the timepoint filter), sorts by subject (no subject last
  in both directions; a block always reads Pre-op first) with a rule between blocks; `toCsv` writes
  `Subject,Timepoint,Film date` after `View`.
- The dev build's demo pair: SP-0042 (Pre-op) and SP-0039 (Post-op) are subject `P-8841`; SP-0039's
  patient fields were rewritten to match.
- Verified: unit 379/379; `smoke-parameters.mjs` 46/46; `smoke-seeding.mjs` 36/36;
  `smoke-workspace.mjs` 100/100. Tasks 6, 7 and 9 were verified by the user; the outcomes are in
  those commits' bodies.
- Not built here, by design: the paired export (§11.2, task 4) and compare-with-pre-op (§12, task 3,
  after plan 07).

- Final whole-branch review (2026-09-07): clean after one fix wave — views normalise like timepoints (decision 46),
  a cleared view renders `—` everywhere, `rowForSegments` shared by `folderRows` and `seedFields`, four records the
  new content had contradicted. Branch tip `4c60ccf` plus the wrap's docs commit; pushed to `fork`; merged back into `claude/studies-ui-updates-bb040d` on 2026-09-07 by fast-forward at the user's say-so, both branches at the same commit on `fork` — the merge back
  is the user's call.

**Traps:** `list` is a read-only accessor on `HTMLInputElement`, so it must never be an `el()` prop —
`setAttribute('list', …)` after construction (the `style` trap's sibling). The drawer's group row
carries `clinical-grid-group`, not `clinical-grid-head`; a smoke reader that filters rows by the
head class alone counts it as a data row.

### Parameters tab — task 1 of the pre-op/post-op spec, DONE with an addendum (branch `claude/preop-postop-xray-org-2c4d80`)

Spec: `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` §10, §11.1. Plan:
`docs/superpowers/plans/2026-09-06-parameters-tab.md` (Tasks 1–8, then the 2026-09-07 addendum
Tasks 9–12; its `## Ledger` carries every ruling and every deferred review finding). Commits:
`git log --oneline 9735202..HEAD` on that branch. Two whole-branch reviews (one per range), each
"with fixes"; the fixes landed and were re-reviewed clean. **Merged back into
`claude/studies-ui-updates-bb040d` on 2026-09-07 (fast-forward, at the user's say-so).**

**Verified at the wrap (2026-09-07):** unit 333/333; `smoke-parameters.mjs` 33/33; `smoke-studies.mjs`
60/60; `smoke-workspace.mjs` 96/96 — on a fresh scratch profile at `211a2b8`. Tasks 4, 5, 6 and 11
were verified by the user on their real library (112 studies); the outcomes are in those commits'
bodies, including the checks that were not reachable there and stand on the harness.

- The Studies screen has a `Find | Parameters` tab strip; the tab, the grid's filters, sort, level
  toggle and row selection are store keys (`studiesTab`, `paramFilters`, `paramSort`, `paramLevels`,
  `paramSelected`), read by the screen's own subscription, never by `SCREEN_KEYS`; none is
  persisted. `screens/studies.js` clears a deleted study's id from `paramSelected`, because `nextId`
  reissues it.
- `renderer/data/parameters.js` is pure and fully unit-tested (columns, values, filter options,
  filter, sort, empty reason, export filename, `patchFilters`, the selection helpers);
  `renderer/screens/parameters.js` is DOM and is covered by `tools/smoke/smoke-parameters.mjs`
  (33 checks, DOM-only; run it FIRST on a fresh launch) plus the manual steps in the commit bodies.
- `toCsv(studies)`: the `fields` parameter (2026-09-06: clinical columns are the union of keys on the
  exported rows) and then the `Source` column and the `includeDemo` option (2026-09-07) are gone;
  demo rows are never written. Header (task 1; task 2 later inserted `Subject,Timepoint,Film date`
  after `View`): `Study ID,View,LL L1-S1,PI,PT,SS,PI-LL Mismatch,L1PA,LL L2-S1,LL L3-S1,LL L4-S1,LL L5-S1`
  then the clinical union.
- Ticking rows exports a chosen subset: the export writes the selected rows that are VISIBLE, in
  grid order; hidden picks stay ticked and return with the filter; the button reads
  `Export N selected`, the count line `· N SELECTED`; a disabled Export button carries a visible
  note (Chromium shows no tooltip on a disabled control).
- Not built in task 1: subject, timepoint, view, film date, the folder table and the paired-only
  filter — **all built by spec task 2, the section above**; the paired export and
  compare-with-pre-op (tasks 3–4) remain.

**Traps:** the panel rebuilds on every change to its key array and restores focus (by
`data-param-key`) and the grid's scroll position; a new store key the grid reads MUST be added to
that array or the grid silently stops repainting for it, and a new control without a
`data-param-key` drops keyboard focus to `<body>` after its own change event. The panel is not
rebuilt while the Find tab is up (gated on `studiesTab` before the key is assigned).

### Session 2026-09-06 — studies and UI updates (7 commits, `e82ea42`..`93e4850`)

Seven changes the user asked for directly, outside any plan. Branched from
`origin/ui-redesign-cw` @ `0022d91` and **pushed to `fork` as
`claude/studies-ui-updates-bb040d`** — that branch name triggers **no** workflow (both preview
workflows fire only on a branch literally named `ui-redesign-cw`; `windows.yml` only on `main`), so
the push published nothing and the installer is untouched.

| # | Change | Commit |
|---|---|---|
| 1 | Demo studies gone from **both** installers (dev keeps them) | `cbb1fd3` |
| 2 | A study is named after its film; renamable from the Analysis header | `3ceb929` |
| 3 | `WORKSPACE` + `FOLDER` columns; `LORDOSIS` removed | `3ceb929` |
| 4 | The sidebar's OPEN STUDY card is a real control | `97bace9` |
| 5 | The whole radiograph fits the stage on open | `e82ea42` |
| 6 | Left+right chord pans; the wheel zooms at the cursor | `93e54c1` |
| 7 | Clicking Edit drops pan mode (one-way) | `93e54c1` |
| — | Smoke baselines + the new chord suite | `eb7cf36` |
| — | An existing study reads as its filename with no migration | `93e4850` |

**Verified.** Unit 293/293 and backend pytest 53 passed, both re-run at the wrap.

Smoke, at the final code commit `93e4850`: `studies` 60/60, `workspace` 96/96,
`persist` 36/36 + 44/44 across a real restart, `parity` 15/15, `gate1` 25/25, `gate2` 32/32,
`gate3` 23/23.

**`chip` (20/20) and `chord` (28/28) were last green one commit earlier, at `eb7cf36`, and were
NOT re-run at `93e4850`** — three attempts wedged the renderer rather than failing, on a machine
that had been running Electron and segmentation for hours. The gap is argued, not measured:
`93e4850` touches only `renderer/data/labels.js`, its unit test, and one `smoke-persist.mjs`
assertion, and `labels.js` is not referenced anywhere in `renderer/components/viewer.js` or
`renderer/viewer/` — which is the code those two suites exercise (`git show --stat 93e4850` and a
grep both confirm this). Treat it as very likely green and re-run both on a fresh machine before
relying on them.

**The one thing not verified: the demo gate's shipping branch has never executed.** It is
`!app.isPackaged`, so every test ran with demos ON. The plumbing is verified (the flag crosses the
existing `load-studies` payload, the getter defaults to false on a load error, the empty-library
copy renders), but no packaged build has been opened. Worst case is cosmetic — an installed app
that still shows nine demo studies — and it is visible the moment anyone opens one. **Check it
first the next time a preview installer is built for any reason.** Both electron-builder allowlists
were checked and are byte-identical and in the same order, and `renderer/**/*` does cover the new
`renderer/data/labels.js`, so the blank-window failure mode is ruled out.

**Plans 01 through 06 are complete.** Plan 06's implementation (Tasks 1–8, commit range
`439a185..4148299`, the six fix commits `d934eaa`..`d1cb14d` from its closing whole-branch review,
plus the docs commit that closes it out) is done and its **automated** verification is green: the
unit suite (270/270) and every `tools/smoke/` suite pass, and `smoke-workspace.mjs` (96/96) joined
the harness. Gate 1 (after Task 4) passed on 2026-09-03. **Gate 2 (after Task 8) was NOT run** — the
user chose on 2026-09-04 to skip it and hand the branch to the developer who wrote the Python
backend; see "Tasks that need the human" below for what that gate's substance is covered by, and for
the three things nothing covers. **`ui-redesign-cw` is pushed to `fork` at `4a0142c`** (never
`origin`, never `main`; the fork's `main` is untouched at `7aa1a86`), which rebuilds the preview
installer; **the preview-installer test
(decision 16) was not performed** — the user said on 2026-09-04 that they do not need the installer
to work — so the last packaged build of this branch anyone has run is still the one built from
`6592228`, which the user installed and reported working on 2026-09-03, before plan 06 existed. That
release prerequisite therefore stands open. Plan 07 is deferred past the first release (decision 15)
— see "Resume plan 07 here" for what plan 06 changed under it, **"Handing this to the backend author"
for what a model merge has to know first**, "Release prerequisites" for what stands between this
branch and `latest-windows`, and `docs/ROADMAP.md` for the deferred work that has no plan yet.

**Four commits land on top of plan 06** (`2c1329f`, `a8e2416`, `1f3ef53`, `4a0142c`), all requested
by the user after the plan closed, each verified at the running app and pushed. They are not part of
any plan and need no gate. (1) The landing gate was rewritten: it keeps its lead line and the
investigational paragraph, adds one on the open release of the weights, the training and evaluation
code and the annotation tool, and replaces the citation card with `CREATED BY` — both authors with
their affiliations and a contact address. The panel no longer fit a 900px window, so `.landing` is
now a fixed-height flex whose right column scrolls inside itself. (2) **No citation is required of
anyone any more**: the acknowledgement checkbox asks only that the tool is investigational and its
output needs independent verification, and the exported CSV's header names its authors instead of
demanding credit, with a test pinning that the old wording cannot return. A paper will be cited
there when there is one. (3) Michael Jayasuriya's name was missing its second `y` in the export and
in the test that asserted it; both are fixed. (4) The contact address is now a button that opens the
user's mail client, which meant **widening `main.js`'s `open-external` from http/https to also accept
a strict `mailto:`** — one address, no query string, because `?subject=`/`?body=` would let the page
compose a message on the user's behalf. It was checked by hand against fifteen cases and has no
automated test, because `main.js` cannot be unit-loaded; that gap is in `docs/ROADMAP.md`. (5) The
app icon is now the website's favicon, one vertebral body stroked in the accent on a transparent
ground, replacing a 100×192 panel that read as a dark rectangle at taskbar size.

Plan 03 restored parity with the old app and then went past it: the Analysis screen,
the layered viewer, the measurements panel, CSV export to a real file, and the deletion
of the legacy `renderer.js`. 64 tests across eight files.

- **Plan 01** (`c40f944`..`3a95d7d`) — preview installer, verified on real installs: two
  uninstall entries, separate `%APPDATA%` dirs (proved by **inode**, not name — Windows is
  case-insensitive and the name check gives a false pass), distinct window titles, and
  production still measuring after the preview was uninstalled.
- **Plan 02** (`3a95d7d`..`ad1d555`, 40 commits) — the renderer foundation. Landing gate,
  sidebar, tokens, fonts, `SS` rename, router, store, api. Walkthrough verified against the
  running app over Electron's `--remote-debugging-port`, not by proxy.
- **Plan 03** (`ad1d555`..`7de86cd`) — the Analysis screen, layered viewer, measurements panel,
  CSV export, `renderer.js` deleted. Three contract amendments during its manual verification.
- **Plan 04** (`a19befe`..`c687c75`, 33 commits) — direct-manipulation landmark editing: handles,
  hover, drag, femoral centre/rim, retrace + fit, Tab cycle, arrow nudges, reset to prediction,
  re-run, subscriber isolation, a tested `/measure` queue, and draggable construction labels that
  scale with the film. 115 tests across ten files. Three manual gates passed at the running app; 122
  trusted-input smoke checks over CDP, all green.
- **Plan 05** (`c6cf87f`..`8d8efe9`, 27 commits: 19 of implementation, the final fix wave, the
  closing docs, and one `ci:` fix to the preview workflow) —
  persistence: `createStudySaver`, a single store subscriber that writes real studies to
  `userData/studies.json` on every `state.studies` change; a `/predict` sidecar per study
  (`userData/predictions/<id>.json`) that makes a persisted study reviewable, correctable and
  resettable after a restart; `state.running` as the running study's id instead of a boolean;
  the Studies screen (summary, search, browse/drop, status and `DEMO` pills, thumbnails); re-run
  reading the film from disk with a relocate flow when it has moved; a refused store (bad record
  identity or an unknown `version`) disabling writes for the session rather than risking an
  overwrite of a newer build's data; `tools/smoke/` promoted into the repo as the verification
  harness, plus a final fix wave that quarantines `predictions/` alongside a corrupt
  `studies.json` and toasts the user how to restore both. Unit 201/201; `smoke-studies.mjs` 56/56; `smoke-persist.mjs --phase run` 33/33 and
  `--phase restart` 44/44; the plan-04 suites re-run clean (parity 15/15, gate1 25/25, gate2
  32/32, gate3 23/23, chip 20/20 — the superseded `smoke-label` suite, 9/16 against correct code,
  was renamed `smoke-label.superseded.mjs` and dropped from the run order; see
  `tools/smoke/README.md`). Gate 1 (after Task 9) and Gate 2 (after Task 11) both passed
  (Gate 2 on 2026-09-03); `ui-redesign-cw` was pushed to `fork` the same day.
- **Plan 06** (`439a185`..`4148299`, plus six fix commits and the closing docs commit) — the
  Workspace screen and clinical data: `scan-folder.js` (recursive, sorted and deterministic, links
  and junctions never followed) behind four new IPC channels; a real CSV parser (BOM, CRLF, lone CR,
  quotes only at field start) with prefix auto-mapping and a user-editable column map; rows joined
  to films on the filename stem = `study_id`, case-insensitively; a one-shot, idempotent load into
  Studies as `Processing` that never touches the film bytes; the clinical-data drawer on Analysis
  with `Import from CSV`, its `fields` seeded from the saved studies at bootstrap; delete a study
  together with its sidecar and every id-keyed cache; run completion no longer clears another
  study's edit mode. Unit 270/270 (201 → 270 across `scan-folder`, `api`, `csv`, `workspace`,
  `clinical-data`, `studies` and `api-persistence`); `smoke-workspace.mjs` 96/96; the plan-05 and
  plan-04 suites re-run clean. Gate 1 (after Task 4) passed 2026-09-03; **Gate 2 was not run** — the
  user's decision on 2026-09-04, recorded under "Tasks that need the human".

  Plan 06 closed with a seven-dimension whole-branch review — 17 agents, every serious finding then
  handed to a skeptic instructed to refute it — which produced 8 confirmed findings; all 8 were
  fixed, plus 2 copy defects the fix wave surfaced. Two were the kind a clinical tool must not ship.
  `Import from CSV` in the drawer joined against a single filename, so it could attach a CSV row
  that the workspace load had deliberately refused as ambiguous — one patient's clinical data bound
  to a film the app had determined it could not identify. And `loadPrediction` was ungated when
  persistence is disabled, so with a refused store a reused id could restore the previous library's
  sidecar and `RESET TO PREDICTION` could commit another study's measurements; it is now skipped
  when persistence is off. The rest: `Load workspace` wrote clinical values without seeding the
  drawer's column list, so the drawer showed its empty state over a record that had data and
  `Export CSV` omitted those columns until a relaunch — and `smoke-workspace.mjs` had frozen that
  wrong state as its expectation; the two new guards in `analysis.js` tested that a record with the
  id exists rather than that it is the same record, which id reuse after a delete defeats, and now
  compare `addedAt` as well; and four honesty fixes — a raw filesystem error reaching a toast, an
  unreadable subfolder reported as unsupported files, a re-load claiming it linked data when it
  wrote none, and the search box promising a diagnosis it could not find.

### Plan 05 amendment (2026-09-02) — historical record

**Plan 05 is now fully implemented (Tasks 0–11); the amendment below is kept as the record
of what was settled before implementation started, not as a starting point.** See "Resume
plan 06 here" for what plan 05 actually changed under the later plans.

The plan-05 document was rewritten in one reviewed pass against the live code at `7d4ab6e`
(12 tasks, `## Task 0` … `## Task 11`), and the architecture contract was amended in the same
pass. Nothing from it is implemented. The pre-flight scan (45 rows), the rulings, and the
two-round independent review live in the plan's SDD workspace,
`.superpowers/sdd/2026-08-31-05-persistence-studies/` (git-ignored): `progress.md` is the
ledger, `amendment-review.md` the review, and `plan05-amendment.diff` /
`contract-amendment.diff` the diffs. The ledger carries `Task N: complete` through Task 10;
Task 11 (this docs pass) and Gate 2 are what remain.

What the amendment settled, in the order a new session will meet it:

- **The live choose → Analysis → run-card flow stays.** Persistence is one store subscriber
  (`createStudySaver`) that writes the real studies whenever `state.studies` changes reference.
  There is no second `/predict` path inside the Studies screen.
- **A prediction sidecar per study** (`userData/predictions/<id>.json`, the raw `/predict`
  response) is what makes a persisted study reviewable after a restart: film, overlay,
  corrected geometry, and a `RESET TO PREDICTION` target. This deviates from spec §13's "no
  full-resolution images in the store" and is the accepted default; the alternative (a model
  run on every first open) was rejected for its 5–60 s cost per study per session.
- **`state.running` becomes the running study's id** (`string|null`) so a second study's card
  cannot claim to be running. One run at a time.
- **No sample film ships** (user decision). The design's `Use sample film` button is not built;
  the existing `Choose radiograph` button and the dropzone (click or drop) are the only ways
  in. The README gets a **Test data** section linking public lateral-radiograph datasets — Cody
  supplied the links on 2026-09-03 and they are in the README (BUU-LSPINE and VinDr-SpineXR link
  to both paper and dataset; for Merlin the user decided on 2026-09-03 to link the paper only for
  now, so only its paper is linked).
- **`sourceAvailable` is dropped.** A moved film is discovered when it is needed (re-run), and
  the relocate flow lives there, not on the row click.
- **`validate` throws on a broken record identity or an unknown store version and nulls a
  malformed measurements/geometry pair.** A refused store disables *all* writes for the
  session — `studies.json` and sidecars — so a newer build's data is never overwritten.
- **`store-io.js` is CommonJS** (the root is CommonJS) and must be in both packaging
  allowlists; the plan adds it to both.
- **The Studies screen updates in place** from a module-scope subscription; `SCREEN_KEYS`
  stays `['screen','ack']`.
- **Demo studies open** to a labelled demo card with a DEMO pill in the header; Export CSV
  is disabled for them.
- **Task 0 promotes the CDP harness** into `tools/smoke/` with a launcher
  (`node tools/smoke/launch.mjs`) that runs the app on a scratch profile via
  `SPINE_CONTOUR_USER_DATA`; `main.js` honours that variable in development only. The dev
  profile (`%APPDATA%\spine-contour`) and the future production profile
  (`%APPDATA%\Spine-Contour`) are the same directory on Windows — accepted, noted in the plan.
- **Deferred to plan 06:** deleting a study (and pruning `predictions/`). Thumbnails are
  generated and persisted now but only plan 07 displays them.
- **Two consolidated manual gates:** Gate 1 after Task 9, Gate 2 after Task 11. The controller
  runs the smoke suites before each.

What the review taught, so the next controller does not repeat it: every blocking defect it
found was in plan text that edited an existing `if` block by "adding a branch" without
restating the gate — the new branches were unreachable. The amended tasks now show whole
replacement blocks. When a task edits an existing conditional, insist on the same.

### Plan 06 amendment (2026-09-03) — historical record

**Plan 06 is now fully implemented (Tasks 1–9); the amendment below is kept as the record of what
was settled before implementation started, not as a starting point.** See "Resume plan 07 here" for
what plan 06 actually changed under the work that follows it.

The plan-06 document was rewritten in one reviewed pass against the live code at `d335ea0` (9 tasks,
`## Task 1` … `## Task 9`, GATE 1 after Task 4 and GATE 2 after Task 8), and the architecture contract was
amended in the same pass (seven items plus two ruling lines). Nothing from it was implemented at the
time this was written. The pre-flight scan (68 confirmed findings — four blocking as written: a CommonJS test file in the ESM test
tree, `scan-folder.js` in neither allowlist, a `render(container)` screen the router could never mount, and
direct `saveStudies` calls that would have written the demo studies and got the store refused), the
rulings, and the two-round independent review live in the plan's SDD workspace,
`.superpowers/sdd/2026-08-31-06-workspace-clinical-data/` (git-ignored): `progress.md` is the ledger,
`amendment-brief.md` the binding interface sheet the drafters worked from, `amendment-review.md` the
review, `plan06-amendment.diff` / `contract-amendment.diff` the diffs. The user reviewed the
amendment diff and said go on 2026-09-03; the ledger carries `Task N: complete` through Task 8, and
Task 9 is the docs commit that closes the plan. The unit suite ran 201 → 270 across the nine tasks:
259 at Task 8, plus 11 cases from the closing whole-branch review's fix wave.

What the amendment settled, in the order a new session will meet it:

- **Nothing calls `saveStudies` directly.** The plan-05 saver persists every new-array `setState`; a
  folder scan commits its records with one `setState` (front-inserted, in scan order) and navigates to
  Studies without setting `openId`.
- **The `study_id` join is pure, exported, tested logic in `renderer/data/csv.js`** (`joinClinical`,
  `fileStem`, `findJoinHeader`, `clinicalFieldNames`): join by filename stem, case-insensitive; duplicate
  `study_id` rows first-wins and counted; one stem matching two films attached to neither and counted;
  `autoMap` is a prefix match where each known field is claimed once (first header wins); `parse` strips a
  BOM and opens a quote only at field start (leading whitespace allowed).
- **Load is idempotent and fill-only.** A film already in the library (same `filePath`, case-insensitive)
  is skipped and counted; CSV values fill only EMPTY clinical keys on a known record and never overwrite
  a typed value — the drawer's `Import from CSV` is the explicit, per-study overwrite path.
- **`state.fields` is seeded at bootstrap** from the saved studies' clinical keys, so values on disk are
  visible after a restart; the field-header `×` HIDES a column (labelled so) and never deletes values.
- **The drawer is `mountClinicalData(host) → {update}`** with a reference-keyed rebuild gate, rows from
  `visibleStudies(state)` (`[open]` until plan 07); demo studies render disabled cells with the title
  `Demo studies are not saved`; a rebuild never eats typed text.
- **Delete lives on the Studies row** with a two-step inline confirm (focus lands on Cancel), refuses while
  that study is running, removes the sidecar first (`deletePrediction`), then clears every id-keyed
  renderer cache (`releaseStudy`, `forgetPrediction`) before ONE `setState`. `predictions/` is pruned on
  delete only — no load-time orphan sweep (a refused store must never lose data). The row's `role="button"`
  may flatten the in-row buttons for some screen readers: accepted, recorded for a later accessibility pass.
- **The `/measure` persist window stays deferred** with the design named (a `measurementsStale` flag read
  by the status rule); Task 9 carries it forward.
- **`scan-folder.js`** is CommonJS at the root, in both allowlists in the same task; `.dicom` joins the
  scanner's set; links are never followed and count as skipped; the root folder rejects display-ready.
- **Two user gates**, each preceded by the controller's unit + smoke runs, each starting with
  `Set-Location` and saying "copy it aside first"; GATE 1 ends with a restore step so fixture rows never
  linger in the real library. Task 9 pushes to `fork` and hands the preview installer to the user.
- **The drawer's `max-height: 40vh`** is a recorded addition to the design.

What the review taught: the plan's PowerShell steps were the weak spot — `.NET` file APIs
(`[IO.File]::WriteAllText`) resolve relative paths against the process directory, not `Set-Location`;
`\"` inside a double-quoted argument is not passed through to `node`; `Copy-Item` on a `predictions\` that
does not exist errors; `$env:SMOKE_KEEP_PROFILE` lingers in the shell. All fixed in the plan; the traps are
in "Known traps" below.

### Resume plan 05 here — what plan 04 changed under you

Plan 04 replaced the button-matrix landmark editor with direct manipulation. The contract was
amended in the same pass (commit `a19befe`), so the interfaces below are already in it; this list
is the *consequences* plan 05 inherits.

**1. `components/viewer.js` owns every pointer and keyboard listener on the stage.** The plan-03
`attachViewerInteractions` is gone; `viewer/interactions.js` is pure logic (zoom steps, hit tests,
Tab order, nudge, debounce) with real tests. One module-scope `drag` covers pan, landmark and
femoral gestures, gated on `pointerId`. Middle-button drag pans in every mode.

**2. Geometry is never mutated in place.** Every edit works on `structuredClone(study.geometry)`
and commits a **new** reference; `updateViewer`'s redraw gate and `router.js`'s key sets both
depend on that. If plan 05 writes geometry from disk, write a new object into `state.studies`.

**3. `/measure` bookkeeping lives in `viewer/measure-queue.js` and is unit-tested.**
`createMeasureQueue(...)` keeps per-study revisions and one owner-tracked debounce; `commitGeometry`
flushes another study's pending correction rather than replacing it; `replaceMeasured(id, geometry)`
runs on a new prediction and on reset and records the geometry the study's numbers now describe.
When a `/measure` call fails at the current revision, the queue restores that geometry and toasts
"The correction was not applied", so the panel never shows numbers beside a geometry they were not
computed from. The queue is module-scope in `viewer.js` and `detach()` deliberately does not clear
it: a correction committed just before navigation still lands on its own study. If plan 05 can
delete a study, call `replaceMeasured` for it first so an in-flight response cannot write to a
reused id.

**4. The prediction snapshot is session-only.** `recordPrediction(studyId, response)` (exported
from `viewer.js`, called by `runSegmentation`) keeps each study's raw `/predict` measurements and
geometry in a module Map. `RESET TO PREDICTION` restores both **without** a `/measure` call — the
backend recomputes `l1_center` from the L1 quadrilateral centroid, not the mask centroid `/predict`
used, so a round-trip would not return the original L1PA. After a restart there is no snapshot and
the reset button is disabled. Plan 05 should decide whether to persist the snapshot beside the
corrected measurements (it is what makes a correction reversible) — if so, off the `Study` record
or as a validated field, and re-record it on load.

**5. `filePayloads` are session-only too.** Re-run segmentation (new toolbar button) needs the raw
bytes; after a restart the handler toasts "file is no longer available". Plan 05 should re-read
from `filePath` when the payload map is empty.

**6. Opening a study must change `screen`, or the viewer must re-key on `openId`.** Setting
`openId` while already on Analysis does not remount the viewer (`SCREEN_KEYS` gates on `screen`),
so `mounted.studyId` goes stale, `setImages` is skipped, and the new study's geometry draws over
the previous study's bitmaps. Unreachable today — `studies.js` always sets `screen` too — but a
studies list that opens a study from inside Analysis would hit it. Also reset `editing: false,
selection: null` on every path that changes `openId` (`handleChoose` and the back button do).

**7. `running` is one global flag.** With a list that can reopen an already-segmented study while
another is mid-run, that study's card would show RUNNING and its edit/re-run buttons disable
(plan-03 deferred minor, widened by the re-run affordance; unreachable until a list exists).

**8. `store.js` isolates subscribers.** A throwing subscriber is reported through `console.error`
and no longer stops the ones after it. Check DevTools during verification: a red line there is a
real defect that used to freeze the UI.

**9. A selected construction can be cleared** (Gate 1 finding): clicking the selected row or
vertebra again, clicking empty stage, or Escape outside edit mode sets `selectedLevel` back to
`null`. Inside edit mode Escape still means "exit editing".

**10. The stage literal set grew** (contract colour section): the handle outline uses the stage
background, per-corner handle colours, the femoral handle colour derived from the overlay green,
and the retrace point colour — pixels drawn into the canvas, in edit mode only.

**11. The construction label is a DOM chip that scales with the film** (Tasks 20–21, user requests
after Gate 3). `canvas.js` exports the pure `constructionLabel(geometry, selectedLevel, measurements)`
→ `{ text, anchor, side } | null` and draws no measurement text; `viewer.js` renders `.viewer-label`
INSIDE the transformed host, so the host's translate/scale pans and zooms it with the film, it can
sit in the black stage around the film, and it drags by its own pointer events. Offsets are kept in
image px per construction for the open study (`labelOffsets`, cleared on study change and `detach`)
and are session-only; if plan 05 wants them to survive a restart they belong beside the corrections.
While editing the chip is pointer-transparent and faded so it can never block a handle. Endplate
labels anchor 15% of the endplate beyond the anterior corner; hip-line labels at their midpoint.

**Verification harness, worth keeping.** `.superpowers/sdd/2026-08-31-04-landmark-editing/` is
git-ignored scratch, but its `cdp-lib.mjs` (trusted mouse/keyboard input over
`--remote-debugging-port=9222`, console-error capture, `Browser.close` for clean restarts),
`cdp.mjs`, `inject-study.js` / `run-and-wait.js` (open and segment a sample without the native
dialog) and the four `smoke-*.mjs` suites are what verified plans 03–04's canvas and pointer code.
Every defect found at the app in plan 04 was caught by them or by the user; none by the unit
suite. Promote them into the repo before plan 05's verification rather than rewriting them.

**Accepted limitations, so they are not rediscovered as bugs** (plan BD-11): a measurement label on
the stage shows the last computed value beside a moved line for ≤150 ms plus one round-trip; after
the first `/measure`, `l1_center` is the L1 quadrilateral centroid (old-app behaviour); retrace has
no per-point undo (toggling RETRACE off clears); while editing, Tab is the handle cycle everywhere
except inside the edit bar. The segmentation fill is the model's mask and does not follow a dragged
corner — the measurements come from the geometry; and a rim resize does not move the hip midpoint,
which is the mean of the two centres.

### Resume plan 06 here — what plan 05 changed under you

Plan 05 added persistence and the Studies screen. The contract was amended in the same pass
(`9a6a583`), so the interfaces below are already in it; this list is the *consequences* plan
06 inherits.

**1. Persistence is one store subscriber.** `createStudySaver` (`renderer/data/persistence.js`)
is subscribed in `renderer/main.js` and writes the real studies to `userData/studies.json`
whenever `state.studies` changes reference — a chosen film, a completed run, every `/measure`
correction, a relocation. Demo studies are filtered out and never written. `addStudy`
(`renderer/screens/studies.js`) is the entry point for **one film arriving interactively**
(picker or drop): it inserts at the front, parks bytes in `filePayloads`, resets view state,
and navigates to Analysis. **Do not call it in a loop.** A **multi-file folder scan must
instead build records with `newStudy` and commit them in one new-array `setState`**
(front-inserted, newest first), leaving `openId` alone — "do not open a study"; the Load
handler does set `screen: 'studies'` (spec 9.3) — the saver persists that single reference
change on its own. Bytes are not parked for a scan; a scanned study runs
later through the normal re-run path, which reads from `filePath`. No new `/predict` path.

**2. The prediction sidecar** (`userData/predictions/<id>.json`) is the raw `/predict` response,
written by `runSegmentation` before the record's numbers are committed and read lazily by
`restoreFilm` when a persisted study is opened with no cached bitmaps. The record keeps the
corrected geometry; the sidecar keeps the model's. `recordPrediction(studyId, sidecar,
study.geometry)`'s third argument is the geometry the study's current numbers describe, so a
failed `/measure` restores the correction, never the prediction. Missing sidecar →
`FILM UNAVAILABLE` card; a re-run recreates it. Ids are validated in the main process
(`/^SP-\d{4,}$/` and ≥ 1000) so a sidecar path cannot leave `predictions/`.

**3. `state.running` is the running study's id** (`string|null`), not a boolean. Truthiness
still means "a run in flight"; the viewer keys its card and edit button on
`running === study.id`, and the Studies list badges that study `Processing`. One run at a time
— study B stays editable while A runs, but cannot start a second run.

**4. `filePath` is the film's identity; bytes are never stored.** A re-run takes them from this
session's `filePayloads`, else `api.readFile(filePath)`, and when that is `null` toasts
`<fileName> was not found. Choose its new location.` and opens the picker; a relocation
rewrites `fileName`/`filePath` on the record before the run. A module-scope `locating` flag
refuses a second run while the picker is open *without* setting `running` (no fabricated
status).

**5. A refused store disables all writes for the session; a corrupt store is quarantined WITH its
sidecars.** `validate` throws on a bad record identity or an unknown store `version`;
`renderer/main.js` catches it, runs on the demo studies, and calls `api.disablePersistence(reason)`
— after which `saveStudies` and `savePrediction` both reject, so a newer build's data is never
overwritten. A corrupt (unparseable/wrong-shape) `studies.json` takes a different route: `store-io.js`
renames it `studies.json.corrupt-<ts>` with its bytes intact and reports the filename as
`quarantined` — the quarantine preserves whatever bytes are on disk at the moment the app reads
them, so reproducing this by overwriting `studies.json`'s contents yourself destroys the records
before the app ever reads them and there is nothing to rename back to recover; anyone testing this
must copy `studies.json` somewhere safe first. Real-world corruption is usually a truncated file,
which the quarantine keeps intact. `main.js`'s `load-studies` handler moves `predictions/` aside as
`predictions.corrupt-<ts>` under the *same* timestamp. Both must move together — an empty store
beside live sidecars looks like a fresh profile, so `nextId()` reuses `SP-1000` and the first
completed run overwrites the old study's film. With the pair aside, the fresh store is a genuine
fresh library and **persistence stays on**; the handler returns a display-ready `notice` that
`renderer/main.js` toasts once after the first render (`api.storeLoadNotice()`). If the
`predictions/` rename fails for anything but ENOENT, the notice says so and `persistenceUnsafe: true`
makes `api.loadStudies()` disable persistence itself. `disablePersistence` ignores a falsy reason:
there is no re-enable path and `disablePersistence('')` must not become one.

**6. `validate` nulls a malformed `measurements`/`geometry` pair** (both together, one
`console.warn`) rather than throwing, so one bad payload cannot discard the whole store — that
study shows `Processing` and a re-run restores it.

**7. Demo studies open to a `DEMO STUDY` card; Export CSV is disabled for them** (tooltip
explains), and the header carries a `.pill-demo`.

**8. Thumbnails** (`≤128px` JPEG data URIs, `thumbnailDataUri` in `viewer/canvas.js`) are
generated at run completion and persisted on the record. Nothing displays them yet — plan 07's
cards consume them.

**9. `store-io.js` is CommonJS at the repo root** and is in both packaging allowlists
(`package.json` `build.files` and `electron-builder.preview.yml`). Any new root file `main.js`
requires must go in both.

**10. The dev profile is the production profile on Windows** (`%APPDATA%\spine-contour` vs
`Spine-Contour`, case-insensitive). `SPINE_CONTOUR_USER_DATA` (honoured only when
`!app.isPackaged`) redirects a run; `tools/smoke/launch.mjs` sets it to a scratch directory and
*wipes* that directory unless `SMOKE_KEEP_PROFILE=1` — never point it at a real profile.

**Verification harness, worth keeping.** `tools/smoke/` is now in the repo (Task 0); see
`tools/smoke/README.md` for the run order and preconditions. Baseline at this branch's tip:
unit 201/201; `smoke-studies.mjs` 56/56; `smoke-persist.mjs --phase run` 33/33 and
`--phase restart` 44/44; the plan-04 suites `smoke-parity` 15/15, `gate1` 25/25, `gate2` 32/32,
`gate3` 23/23, `chip` 20/20. Three harness facts worth their own lines: `launch.mjs` refuses a
CDP port another instance holds (exit 3) and gates `ready` on a real page target; never
interleave `smoke-studies.mjs` between the two persist phases (it re-injects `SP-9000`
unsegmented, destroying the corrected geometry `--phase restart` compares against);
`smoke-label.superseded.mjs` is out of the run order and out of the baseline — it tests the
canvas-drawn label plate that plan-04 Task 21 replaced with the DOM chip (`smoke-chip`, green),
so it fails 7 of its 16 checks against correct code. Renamed in plan 05's final fix wave: a
permanently red line beside green ones is the same class of problem as a false green. Do not run
it, do not add it back, and do not report its result as a regression.

**Known gap, stated honestly.** "A failed `/measure` on a restored study restores the
correction, not the prediction" has no automated coverage. `smoke-persist.mjs --phase
measurefail` exists and self-gates but cannot be run: `contextBridge` freezes
`window.spineContour` against stubbing, and every route to a genuinely failing `/measure`
raises a blocking modal (`main.js:253-256` on backend exit; the `app.whenReady()` catch when
it never starts) that wedges CDP. Covered by code review and the manual gate, not by the
suite. See `tools/smoke/README.md`'s "`--phase measurefail` is parked" section before trying
to make it runnable.

**Rough edges for plan 06 to know about.** (Historical — plan 06 fixed the run-completion clear
and now prunes `predictions/` on delete; the other edges still stand and are carried forward in
"Resume plan 07 here".) A run's completion clears `editing`/`selection`
globally, so a user mid-edit on study B loses edit mode when study A finishes (newly reachable
because B stays editable). While the relocate picker is open the Re-run buttons still render
enabled and a click is silently swallowed by `locating` (correct per the no-fabricated-status
rule, but worth a real disabled state later). `predictions/` is never pruned. The `DEMO` pill
is built in `render()`, not `update()` — safe today only because every writer also sets
`screen`. The quarantine toast's recovery instruction ("rename both back") is only useful when
the quarantined bytes are partially recoverable; plan 06 may want the toast (or the README) to
say so.

**Resolved (2026-09-09): landmark correction persistence.** Unmeasured edits now stay in
`state.measurementDrafts`, outside persisted Study records. The latest successful `/measure`
commits its geometry and measurements together; failures discard the preview. Closing during
a pending correction retains the last complete pair. See the architecture contract's
“Accuracy safeguards” amendment and `docs/accuracy-safeguards.md`.

### Resume plan 07 here — what plan 06 changed under you

Plan 06 added the Workspace screen, the clinical-data drawer and study deletion. The contract
was amended in the same pass (its `(plan 06)` markers), so the interfaces below are already in
it; this list is the *consequences* plan 07 inherits. Plan 07's own document was written
before plan 06 and was not amended — where it names a function plan 06 does not export, the
behaviour it specifies is normative and the name is not (plan 07's own dependency note).

**1. `renderer/data/csv.js` grew seven exports and two rules.** It exported only `toCsv` before;
`KNOWN_FIELDS` (the nine names the contract fixes) is new and exported. `parse(text)` strips a
UTF-8 BOM, accepts CRLF, LF and a lone CR, drops blank lines, and treats `"` as opening a quoted
field **only at field start, leading whitespace allowed and discarded** (`1, "Doe, Jane"` is
quoted; `5'11"` stays literal); duplicate header names keep the first column.
`autoMap(headers)` is a prefix match on lowercased, non-alphanumeric-stripped names
(`age_yrs` → `Age`, `odi_base` → `ODI`; `agent` → `Age` is the rule's known cost) and each known
field is claimed by at most one column, first wins. Also new: `fileStem(name)`,
`findJoinHeader(headers)` (the first header normalising to `studyid`, else `null`),
`joinClinical({files, headers, rows, mapping}) → {joinHeader, byFile, matched, unmatched,
duplicates, ambiguous}` and `clinicalFieldNames(studies)` (union of `clinical` keys,
`KNOWN_FIELDS` order first, then custom names first-seen). `toCsv` is unchanged and
`KNOWN_FIELDS`' nine strings are exactly the contract's. Plan 07's cards read
`sim.clinical?.Notes || sim.clinical?.Diagnosis` — those keys are exactly the `KNOWN_FIELDS`
names, and every value is a trimmed string. **The export cannot be re-imported**: `toCsv` writes
a `#` citation block that `parse` reads as the header row, and it writes the record id under
`Study ID` where the import expects a filename stem. That is `docs/ROADMAP.md` item 1, with the
three blockers and the identity decision written out; do not treat the round trip as working.

**2. Five new bridge methods, all through `invoke()`.** `chooseFolder()` and `chooseCsv()`
resolve `null` on cancel (not an error, no toast); `scanFolder(dirPath)` and `readCsv(filePath)`
reject with display-ready messages (`No folder was selected.`, `The folder was not found.`,
`The folder could not be read. Check that you still have permission to open it.`,
`No CSV file was selected.`, `The CSV file was not found.`, `The CSV file exceeds 50 MB.`,
`The CSV file could not be read. Check that you still have permission to open it.`);
`deletePrediction(id)` removes `predictions/<id>.json`, treats ENOENT as success, validates the
id in the main process like every other sidecar path, and rejects for the session after
`disablePersistence`. A failed unlink is mapped in the main process to `The file is locked or the
folder is not writable. Close anything that may be using it, then try again.` — the raw errno and
the `%APPDATA%` path never reach a toast. The native pickers cannot be driven over CDP; every
suite sets `ws*` state directly.

**3. `scan-folder.js` is a CommonJS root module in BOTH packaging allowlists** (`package.json`
`build.files`, `electron-builder.preview.yml`), like `store-io.js`. It walks depth-first with
entries sorted by name, so the ids a load assigns are the same on every filesystem; it never
follows a symlink or junction (each counts as one `skipped`), swallows a nested `readdir` failure
as one `skipped`, and rejects on the root. `SUPPORTED_EXTENSIONS` (`scan-folder.js:24`) is exactly
the native picker's filter (`main.js:53`) and the Studies dropzone's `FILM_EXTENSIONS`
(`renderer/screens/studies.js:92`) — spec
9.3's seven plus `.dicom`, so all three ingestion paths accept the same files. Because `skipped`
has three causes, card 01's clause names all three: ` · N skipped (unsupported files, links, or
folders that could not be read)`. The preview-installer run after plan 06 is the first CI run
that exercises this allowlist entry.

**4. The join rule: a film's identity before it has an id is its filename stem.** A CSV row
joins the film whose `fileStem(fileName)` equals the row's `study_id`, both trimmed and
lowercased. Rows that match no film are counted (`unmatched`) and stored nowhere; a second row
with the same `study_id` is `duplicates` (first wins); a stem shared by two films is `ambiguous`
(attached to neither). `study_id` is the join key, never a clinical field — `autoMap` leaves it
`Unmapped` on purpose. `loadWorkspaceStudies(state)` is idempotent on `filePath`
(case-insensitive): a known film is counted, not re-added, and the CSV **fills only its blank
clinical keys** (absent or `''`) onto a new record — an existing value is never overwritten by a
Load, and a known film with nothing to fill is returned by reference and not counted in
`updated`; `Import from CSV` in the drawer is the explicit overwrite path. New films get
consecutive ids from `nextId` in scan order and are front-inserted. The Load handler commits ONE
`setState({ studies, fields: workspaceLoadedFields(...), screen: 'studies' })` — no `saveStudies`
anywhere, the saver persists it — and toasts `workspaceLoadedMessage(...)`. The `fields` term is
not optional: without it the values are on the records and on disk while the drawer reads
`NO FIELDS` and `Export CSV` drops the columns until the next launch (that was finding F2 of the
closing review). `wsFolder/wsFiles/wsCsv…` survive navigation (no `wsLoaded` key exists), so Load
can be pressed again and reports `Workspace loaded — 0 studies added · N already in the library`,
followed by `(clinical data updated for K)` only when the CSV actually filled K records' blanks.
A plain second Load of the same folder and CSV fills nothing, and then the toast says so rather
than claiming a link it did not make: ` · CSV matched N rows; no blank fields to fill (use Import
from CSV to replace existing values)`. Otherwise the same `clinical data linked (…)` clause as the
first load appears whenever a CSV is set.

**5. `state.fields` is seeded at bootstrap.** `renderer/main.js` calls
`setState({ studies, fields: clinicalFieldNames(studies) })` after the store loads, so persisted
clinical values are visible after a restart. `fields` stays session-only otherwise: the `×` in a
column head is labelled **Hide** (`aria-label: Hide <name>`, `title: Hide field — values are
kept`) because it only drops the name from `fields` — the values stay on the record, and the
next launch re-seeds the column if any study still carries the key.

**6. `mountClinicalData(host) → {update}` is the drawer; `visibleStudies(state)` is the one
expression plan 07 replaces.** `analysis.js` creates `section.clinical-data` as the third child
of `main.analysis-screen` (after `.analysis-body`) and calls `clinical.update()` from its own
`update()` on every store notification; the drawer rebuilds only when its key
`[studies, fields, dataOpen, openId, compareId, wsCsv]` changes — `compareId` is already in the
key, so setting it re-renders the grid with no further wiring. Every row and the count label
(`fieldCountLabel(fieldCount, studyCount)` → `N FIELDS · K STUDIES`) derive from
`visibleStudies(state)`, which returns `[open]` today. Plan 07 Task 6 names the replacement
`visibleStudiesForGrid(state)`; implement it as that expression's body (or rename
`visibleStudies`) — nothing else in the drawer assumes one row. Cells for a demo study are
disabled with the title `Demo studies are not saved`; `Import from CSV` is disabled with a reason
when no CSV is loaded. **`importRowFor(state, study)` (exported, unit-tested) is the guard, and it
joins against the whole scan, not one filename**: a film that is in `state.wsFiles` and shares its
stem with another scanned film is refused as `ambiguous`, because that is exactly the row the
Workspace load attached to neither film. A film that is not in the scan — picked, dropped, or
opened before any folder was chosen — keeps the one-film join. Do not "simplify" that back to a
single-filename join; it was the most serious finding of plan 06's closing review. The drawer is
capped at `max-height: 40vh` (an addition to the design for the 900px window).

**7. Delete exists, and ids are reused.** The Studies table has a trailing action column; a real
row's trash button opens an inline two-step confirm (`Delete this study?` / `Delete` / `Cancel`,
no native dialog — `window.confirm` wedges CDP), cleared by Escape, Cancel, a click elsewhere
or navigation. `deleteStudy(id)` refuses while `running === id`, awaits `deletePrediction(id)`
when persistence is on, then `forgetPrediction(id)` (viewer snapshot + `replaceMeasured(id,
null)`), `releaseStudy(id)` (`filePayloads`, and `imageCache` unless it is mounted), then ONE
`setState` that filters `studies` and, if the study was open, resets `openId` and the view.
`nextId` is max+1, so a deleted highest id is reused by the next film — which is why every
id-keyed cache is cleared: the new record must not inherit the old film, bitmaps, snapshot or
pending correction. **Id reuse is the branch's sharpest edge.** Two of the closing review's
findings were reuse defects: `analysis.js`'s guards tested that a record with the id exists
rather than that it is the same record (they now compare `addedAt` as well), and `loadPrediction`
was ungated when persistence is disabled, so a reused id could restore a refused library's
sidecar. **Plan 07 adds caches keyed by id (`activePanes`, comparison bitmaps) and a second id in
state (`compareId`): clear them in the same place, compare `addedAt` rather than presence, and
null `compareId` in the same `setState` when the deleted study is the comparison study** — a
`compareId` that names no study must render as "not comparing", never throw. A study deleted
while its relocate picker is open never runs (`runSegmentation` re-checks membership before
`setState({ running })`). When the prompt opens, focus goes to **Cancel**
(`.studies-delete-cancel`), not Delete — the repaint would otherwise drop focus to `<body>`, and
the button a stray Enter or Space reaches must be the harmless one. **Accepted limitation, for a
later accessibility pass:** the Studies row keeps `role="button"` from plan 05, so some screen
readers flatten the row and do not announce the in-row delete controls as separate targets; mouse
and Tab both work, and reshaping the row was deliberately left out of plan 06.

**8. `predictions/` is pruned on delete only.** A load-time orphan sweep is deliberately not
done: a refused (newer-version) store must never lose data, and an orphan sidecar beside a
refused store is exactly the case where the app cannot tell an orphan from a study it cannot
see. The plan-05 quarantine (`predictions.corrupt-<ts>` beside `studies.json.corrupt-<ts>`) is
unchanged.

**9. Run completion keeps another study's edit mode.** `runSegmentation`'s completion now
resets `editing`/`selection` only when `state.openId === studyId`; a user mid-edit on study B
keeps edit mode when study A finishes. The error path was already study-local. A comparison
pane that shows study A while B is open and edited inherits this rule — do not reintroduce a
global clear.

**10. The `/measure` persist window is DEFERRED — a named post-06 fix-wave item, not plan 07's.**
The window recorded above (a corrected geometry is committed and persisted ~150 ms plus one
round trip before `/measure` returns, so an abrupt quit makes `geometry_new` + `measurements_old`
durable together) is unchanged by plan 06. Option A (hold the commit until `/measure` returns)
is not viable: the viewer draws handles from the store's geometry, so a held commit snaps the
dragged handle back. **Option B is the design when it is fixed:** an optional
`measurementsStale` flag on the record, set `true` by `commitGeometry` when it writes geometry
ahead of the round trip and cleared when `recalculate` writes the measurements it produced;
`validate` keeps the flag; the measurements panel marks stale numbers; `deriveStatus` treats a
stale record as needing a re-measure. It touches `viewer/measure-queue.js`,
`data/persistence.js` (`validate`), `components/measurements.js`, `data/status.js` and three test
files — a fix-wave task, not a workspace one. It needs exactly two contract amendments, to be
applied only when it lands: (a) the `Study` typedef gains `measurementsStale?: boolean`;
(b) the status derivation's rule 2 (`Needs review`) gains "or `measurementsStale`".

**11. The Workspace screen's shape, for anyone who touches it.** `render(state)` returns
`main.workspace-page`; a module-scope `refresh()` remounts `.workspace-page-inner` after each
handler's `setState` (handlers run from DOM events, never inside a subscriber; `SCREEN_KEYS` is
still `['screen','ack']`). The skipped-file count lives in a module-scope `lastScan` and
renders only while `lastScan.folder === state.wsFolder`, so it is never a fabricated `0`.
`styles/screens/workspace.css` is linked from `index.html` after `studies.css`; the sage "set"
tint is `color-mix` over tokens, no literals.

**Verification harness, worth keeping.** `tools/smoke/smoke-workspace.mjs` (Task 8) drives the
whole flow on a scratch profile from a fixture it writes under `tools/smoke/out/workspace-fixture/`
(two PNGs, a nested JPG, a `notes.txt`) with a BOM+CRLF `workspace-fixture.csv` beside the
folder: scan counts, parse/autoMap in page, the cards and chips, a select change, the note
preview, Load, the toast, the drawer, `Import from CSV`, a typed value reaching `studies.json`,
the two-step delete. See `tools/smoke/README.md` for its place in the run order; like
`smoke-studies.mjs` it must never run between the two `smoke-persist` phases. Baseline at this
branch's tip (`d1cb14d`, re-measured by the controller on a fresh scratch profile after the
closing fix wave): unit 270/270; `smoke-workspace.mjs` 96/96; `smoke-studies.mjs` 56/56;
`smoke-persist.mjs --phase run` 33/33 and `--phase restart` 44/44; `smoke-parity` 15/15,
`gate1` 25/25, `gate2` 32/32, `gate3` 23/23, `chip` 20/20. The native folder and CSV pickers are
the one thing no suite can press; Gate 1 covered them by hand on 2026-09-03.

**Rough edges for plan 07 to know about.** While the relocate picker is open the Re-run buttons
still render enabled and a click is swallowed by `locating` (unchanged from plan 05). The `DEMO`
pill on Analysis is still built in `render()`, not `update()` — safe because every writer of
`openId`, Load included, also sets `screen`. `autoMap`'s prefix rule maps `agent` → `Age`
(documented, tested, accepted: the dropdown fixes it). The two-step delete confirm is
module-scope state cleared on navigation; a plan-07 list that re-renders rows from another
subscriber must not resurrect it. `SUPPORTED_EXTENSIONS` accepts `.dicom` but the backend still
decides what it can decode. The quarantine toast still tells the user to rename both
`.corrupt-<ts>` artefacts back, which only helps when the quarantined bytes are partially
recoverable; the wording was not revisited in plan 06. `loadPrediction` is still the one
persistence entry point with no gate inside `renderer/api.js` — the fix for the reused-id defect
sits at its only caller, so a second caller would reintroduce it with nothing to catch it.
`docs/ROADMAP.md` carries the deferred work that has no plan yet: the CSV round trip, telling
studies apart when they come from more than one folder, measurement provenance, the release
prerequisites, and the smaller known limitations.

### Handing this to the backend author — read this first

Updated 2026-09-08. **Take `fork/ui-redesign-cw`** (`github.com/Feches/Spine-Contour`). It contains your trunk
`origin/ui-redesign-cw` @ `5078b1c` as a merge parent (`2bf3d21`), so merging it into your `ui-redesign-cw` is a
fast-forward, and every UI change since your `0022d91` sits on top: the Studies screen's Find | Parameters tabs, the
pre-op/post-op study fields and the paired export, batch segmentation, and the reconcile of your four 2026-09-07
commits (what changed in your files during that merge is the "Upstream reconcile" section at the top of this
document). Six things matter more than anything else below.

**1. Nothing at the store level records which model produced a stored measurement.** `qc.models` names the model per
result since 2026-09-04, but a study's `measurements`, `geometry` and `qc` carry no store-level provenance, there is no
"needs re-run" state, and bulk re-run is deliberately absent: a batch never re-runs a segmented film (decision 52). If
your payload changes **shape** rather than only its values, `validate` (`renderer/data/persistence.js`) nulls **both**
`measurements` and `geometry` on every affected record with one `console.warn` each; those studies fall back to
`Processing` and can then be segmented again — one click on the Find tab now runs every unsegmented film in a batch.
`docs/ROADMAP.md` item 3 has the shape of the full fix (a provenance field, `validate` preserving it, an explicit re-run
flag on the batch driver); it needs a `STORE_VERSION` bump and a contract amendment and deserves its own plan.

**2. The response contract your model has to satisfy.** The contract's **Measurements** and **Geometry** blocks
(`docs/superpowers/plans/2026-08-31-00-architecture-contract.md`) are binding. `POST /predict` (multipart; optional form
fields `vertebra_model`, `femoral_model`, `s1_model`, a 422 for anything `GET /models` does not offer) returns
`image_png`, `mask_png`, `femoral_mask_png`, `labels`, `measurements`, `geometry` and `qc`; `POST /measure` returns
`{measurements, geometry}` from geometry alone and is what makes live re-measurement after a landmark correction
affordable. `isValidMeasurements` requires finite `PI`, `PT`, `SS` and `LL['L1-S1']`; `L1PA` and `LL['L2-S1']`…`['L5-S1']`
may be absent, but a present non-finite value fails. `isValidGeometry` requires `vertebrae.L1`…`L5` each with `superior`
and `inferior` as two points and `quadrilateral` as four, `s1_superior` as two points, `l1_center` and `hip_midpoint` as
points, and exactly two `femoral_circles`, each `[cx, cy, r]` with a **positive** radius. `qc` is opaque except
`qc.femoral.confidence`, `qc.models` and `qc.framing`. Two project rules constrain the payload as much as the schema:
an absent value renders `—`, never `0` and never a guess, so do not substitute a placeholder for something the model
could not produce; and `SS` is sacral slope, not sacral inclination. Your `/calibrate` and `/calibration-profile`
endpoints are yours; the renderer calls them only from your calibration screen.

**3. How to prove you have not broken the renderer**, in this order:

1. `node --test test/*.test.js` — 433/433, no Electron needed, a few seconds. (`node --test test/` without the glob fails
   on Node 24.)
2. Launch from source: `SPINE_CONTOUR_PYTHON` must point at a venv python that has `backend/requirements.txt` installed
   (now including `scipy` and `pytesseract`), or the backend exits `9009`; a fatal startup error shows a *modal*, so a
   live process is not evidence of a successful launch.
3. The CDP smoke suites, in the order and with the preconditions in `tools/smoke/README.md`. Baselines at this tip:
   `smoke-parameters` 58/58, `smoke-seeding` 36/36, `smoke-workspace` 100/100 (one launch, in that order);
   `smoke-studies` 103/103 (a FRESH launch; about ten minutes, seven real segmentations); `smoke-persist --phase run`
   36/36 then `--phase restart` 44/44 across a real restart with `SMOKE_KEEP_PROFILE=1`; the viewer gates and the rest
   as the README lists. Two rules the run order exists for: **nothing may run between `smoke-persist`'s two phases**,
   and `smoke-studies` needs a **fresh scratch profile** (never after `smoke-workspace` on the same instance). A suite
   that prints nothing has thrown. Do not run `pytest` while a canvas suite runs; both starve on a CPU-only laptop.
4. `python -m pytest backend -q` — yours; not run here on the merged backend.

**4. Five things have no automated coverage, and each would stay green if broken.** The two deferred commits in the
clinical drawer (`queueMicrotask` in `renderer/components/clinical-data.js`). The delete paths' data-safety branches —
the sidecar removal, the id-keyed cache clears, the `paramSelected` prune in both the single and the bulk delete, and
the late `running` re-check in `deleteStudy` that closes a delete/batch race. The bootstrap step that seeds the drawer's
columns, `setState({ studies, fields: clinicalFieldNames(studies) })` in `renderer/main.js` — the block a merge is most
likely to conflict in; if the `fields` term is lost the app looks fine while every stored clinical value becomes
invisible and drops out of `Export CSV`. The relocate-picker path in `segmentStudy` and its post-picker
`state.batch` re-check. And **your calibration detour**: the folder-choose handler in `screens/workspace.js` now sends
every nonempty scan to `screens/calibration.js`; `smoke-workspace.mjs` calls `scanFolder` over CDP and never sees it.

**5. Decisions that bind the UI** (`## Decisions already made`, 1–66): the nine demo studies are absent from every
packaged build (19) — your `hideDemoStudies` preference coexists with that gate; `state.running` is one study id and
the batch is a strict sequence of single runs (13, 55); progress is a count of attempts, never a stage or a time (6,
56); `IN QUEUE` is `UNSEGMENTED` and `QUEUED` means only "in the running batch" (57); a batch never re-runs a segmented
film (52); ticked rows are one selection shared by both Studies tabs (53). Reopen any of them with the user, not in code.

**6. What must not be merged to `main` yet.** See "Release prerequisites". `.github/workflows/windows.yml` still has no
repository guard (only `branches: [main]`; your OCR step did not add one) and runs no renderer tests and no
packaging-allowlist check, while the preview workflows do both; the two allowlists (`package.json` `build.files` and
`electron-builder.preview.yml`) are identical today and are the files most likely to conflict in a merge — dropping a
root file from one ships an installer that opens a blank window with CI green. No installer has been built from this
lineage yet: the push of `fork/ui-redesign-cw` on 2026-09-08 is the first preview build to carry plan 06 and everything
after it, including your Tesseract `--add-data` and `check_bundled_ocr.py`. Known open defects are in `docs/ROADMAP.md`
§5; one pre-existing prototype-key clinical leak is still open. **Superseded 2026-09-10:** `windows.yml` now carries the repository guard, runs renderer and backend tests, the allowlist parity check and packaged source/version checks on both platforms, and publishes only on a push to `main` (the backend developer's v1.0.0 promotion).

### Backend merge 2026-09-04 — crop search and model choice

Branch `crop-search-and-model-choice`, from `ui-redesign-cw` at `ac81866`. What changed and
what it leaves for whoever picks the branch up:

- **The backend frames the film before it measures it.** `backend/framing.py` finds the
  lumbosacral region — a box slides over the lower film, the S1 detector gates the
  candidates, and a fixed point (the box whose height is the training multiple of the S1
  endplate it detects inside itself) chooses among them — and the models run on that crop.
  The whole film competes as one more box when the search agrees with it (or finds nothing
  it trusts), which is how a lumbar radiograph is taken whole and measures as before. Every
  film pays for the search, which on a CPU-only machine is tens of seconds; `qc.framing`
  records what won. A detector-only shortcut that skipped the search was tried and removed:
  on a full-spine film the detector can return a confident endplate that is not one.
- **Merged femoral heads are fitted as two discs.** On a true lateral the heads overlap into
  one mask component, and the previous Hough split saw one circle in it and rejected most such
  films. `backend/femoral.py` fits the component as the union of two discs (distance-transform
  seeds, a leashed robust circle fit per disc, then a direct polish of the union's overlap with
  the mask) and `utils._femoral_geometry` uses it for the single-component case. Its
  `qc.femoral.method` values are `two_disc_<seed>`; `confidence` is the union's overlap with
  the mask, and there is no longer a minimum centre separation for that path — superimposed
  heads are the normal case and are reported coincident. Two smaller changes in the same
  function: the mask is worked at a size set by the heads rather than by the film (a
  full-spine film used to shrink a normal head under the radius floor), and a second
  component only counts as a second head if it is at least a fifth the size of the first.
  A femoral mask that runs into the edge of the film is a head the frame cut off: it is still
  fitted, but `qc.femoral.touches_frame_edge` is set and the confidence is capped at 0.5, under
  the renderer's review threshold. The two-component fit and every other gate are as they were.
- **The vertebral corners have two sources.** `backend/models/hrnet.py` adds the HRNet
  landmark head (weights `backend/weights/hrnet_landmarks.pt`, LFS, `timm` in
  requirements). `POST /predict` takes `vertebra_model` (`unet` | `hrnet`); the femoral
  heads and S1 keep one model each and their fields exist for symmetry. Corners are named
  anatomically (`backend/landmarks.py`) from the S1 endplate's own A/P identity, and
  `utils.spinopelvic_measurements_from_landmarks` measures from named corners; the femoral
  fit and its quality gate, and every angle formula, are unchanged.
- **The renderer chooses and shows.** Settings gains a MODELS block (`renderer/components/
  sidebar.js`), `state.models` rides on `predict(request)`, and the Analysis header names
  the model behind the numbers on screen from `qc.models`. `renderer/data/models.js` is
  the display list with `node --test` coverage; the sidebar block is DOM code and was
  verified by launching the app, not by a test.
- **A macOS build.** `package.json` and the preview config carry a `mac` block (Apple
  Silicon `.dmg`, `identity: null` — there is no Developer ID, so it is ad-hoc signed and
  Gatekeeper asks the user to open it once). `.github/workflows/macos-preview.yml` mirrors
  the Windows preview workflow step for step, on a `macos-14` runner, and publishes to a
  separate `preview-macos` prerelease; it has the same repository guard. The backend
  bundle is built on the runner for its own arch; `main.js` already launched the bare
  binary on non-Windows. Verified locally: the image builds, the packaged app launches,
  the bundled backend answers, and a segmentation runs through it.
- **Contract amendment** at the end of the architecture contract; **ROADMAP item 3** is
  half-addressed (per-result provenance in `qc.models`), the store-level half still stands.
- **Not done here:** the smoke suites were not re-run on this branch; the preview
  installer has not been built with `timm` collected and the fourth weight file (the
  workflows already pass `--collect-all timm` and `--add-data backend/weights`, so it should
  package, but that is a prediction, not a test).

### Distributing a build from this branch

Plan 02's Task 19 removed the old single-screen UI and plan 03 restored parity, so this
branch is now worth building. Pushing `ui-redesign-cw` to `fork` triggers **only** the
preview installer workflow, which publishes to a `preview-windows` prerelease and cannot
touch the production `latest-windows` release the README links to.

**Until 2026-09-03 that workflow had never got past its own "Assert packaging allowlists
agree" step.** The runner checks the repo out with CRLF (Git for Windows default; there is no
`.gitattributes` rule for `.yml`), and the check's regex demanded a bare `files:\n`, so it
printed `FAIL: no files: block found` on every run — including the runs at `7d4ab6e` and
`9a6a583` — and no preview installer was ever built from this branch after the check was
added. `8d8efe9` makes the regex `\r?\n`-tolerant; run 33759824997 was the first to pass the
step. Plan 01's "verified on real installs" predates the check. If a future CI step parses a
checked-out text file, assume CRLF.

Still true, and still the reason not to merge: `windows.yml` has no repository guard, only
`branches: [main]`. Merging this branch into the fork's `main` would run the production
workflow on the fork and publish a release tagged `latest-windows`, flagged `--latest`,
containing redesign code.

### Running from source

`npm run dev` in this worktree fails with `backend exited with code 9009` — `.venv` is
gitignored so the worktree has none and it falls back to a bare `python` that isn't on PATH.
Set `SPINE_CONTOUR_PYTHON` to the main directory's venv python first:

```
$env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"
npm.cmd run dev
```

(`npm.cmd`, because PowerShell's execution policy blocks `npm.ps1`.)

**"Process alive" is NOT evidence of a successful launch.** A fatal startup error shows a
*modal dialog*, which keeps the process running — several verification passes in plans 01
and 02 reported false positives this way. Check for a real window title, or drive the app
over `--remote-debugging-port=9222` and assert against the live DOM.

## Carry into plan 03 (inherited from plan 02)

Two latent traps the final review flagged. Neither is a present defect; both should land
early, before plan 02 adds its first new top-level directory.

1. **The two `files` allowlists are guarded only by prose.** Add an executable parity
   check comparing `electron-builder.preview.yml`'s `files:` block against
   `package.json` `build.files`, failing the build on divergence. A missing entry ships an
   installer that opens a blank window while CI stays green. Plan 01 contains a worked
   example of prose-as-guard failing: a confident comment claimed `productName` gave a
   separate `%APPDATA%` folder, and it did not.
2. **The renderer test gate is unfailable two ways.** `Test renderer` carries
   `continue-on-error: true`, *and* `node --test 'test/*.test.js'` exits 0 reporting
   `tests 0` when nothing matches. Drop `continue-on-error` and assert a non-zero test
   count when `test/` lands, otherwise the gate is permanently green. Note `windows.yml`
   has no renderer test step at all, so the preview workflow is the only place the
   redesign's tests will ever run in CI.

**Do not merge `ui-redesign-cw` into the fork's `main`.** `windows.yml` has no repository
guard, only `branches: [main]` — merging there would run the production workflow on the
fork and publish a release tagged `latest-windows`, flagged `--latest`, containing
redesign code. `windows-preview.yml` has such a guard (`if: github.repository == ...`);
`windows.yml` does not, and editing it was out of scope for plan 01.

**Upstream carry-forward:** `mjayasur/Spine-Contour`'s `windows.yml` does the identical
packaging with no disk mitigation, so it may be one runner-image change from the same
failure. It fails *closed* — no `if:` conditions, so a packaging failure skips the publish
step and `gh release upload latest-windows --clobber` never runs; the existing asset
survives and users see a stale release, never a broken one. Worth raising upstream with
the diagnosis and the one-step fix.

## What is being built

A Claude Design mockup (`design-reference/template.html`) replaces the current
single-screen app with a five-screen research tool: Landing gate, collapsible Sidebar,
Workspace (folder + clinical CSV), Studies library, and Study Analysis with comparison
and cohort matching. Warm light/dark token system replaces the hardcoded GitHub-dark
theme.

**The user's overriding constraint:** the working production installer must not break.
Plan 01 exists to prove that before any UI work begins.

## Execution order

Plans are sequenced. **Do not start one until the previous plan's final commit is on
the branch.** Each leaves the app launchable.

| # | Plan | Tasks | Deliverable |
|---|---|---|---|
| 01 | `2026-08-31-01-preview-build.md` | 4 | **DONE** — preview installs beside the real app |
| 02 | `2026-08-31-02-foundation.md` | 20 | **DONE** — Landing, Sidebar, tokens, `SS` rename |
| 03 | `2026-08-31-03-analysis-screen.md` | 11 | **DONE** — Analysis screen, parity restored, `renderer.js` deleted |
| 04 | `2026-08-31-04-landmark-editing.md` | 19 | **DONE** — direct manipulation, retrace, reset, re-run |
| 05 | `2026-08-31-05-persistence-studies.md` | 12 | **DONE** (Gate 2 passed 2026-09-03) — measurements, film and corrections survive restart |
| 06 | `2026-08-31-06-workspace-clinical-data.md` | 9 | **DONE** (automated verification green; Gate 2 not run) — folder scan, CSV import, clinical grid, delete |
| 07 | `2026-08-31-07-similar-comparison.md` | 7 | Ranking, side-by-side |

82 tasks total (plan 05 grew from 10 to 12 tasks in its 2026-09-02 amendment; plan 06 from 6 to 9
in its amendment, which added delete, the smoke suite and this closing task).

`2026-08-31-00-architecture-contract.md` is not a plan — it is the binding interface
definition shared by all seven. Read it before every plan. **It wins over any
individual plan.**

## Tasks that need the human

Most tasks are autonomous. These are not:

- ~~**Plan 01, Task 4**~~ — done. Actions enabled, both apps installed, two uninstall
  entries confirmed, uninstall proved non-destructive.
- **Prefer a programmatic check over a human one where the OS exposes the fact.**
  Window titles are readable with `Get-Process | MainWindowTitle`; directory identity is
  readable by inode (`ls -di`). Plan 01 shipped a title bug precisely because the
  substituted check proved the process survived rather than reading the title, and the
  plan’s own name-based `%APPDATA%` check would have passed falsely on a shared folder.
- **Every task whose verification step says MANUAL VERIFICATION** — canvas rendering,
  pointer interaction, and screen layout cannot be unit tested here. These steps list
  exact clicks and exact expected results. They are real gates, not formalities.
- ~~**Plan 05, Gate 1 (after Task 9)**~~ — done. Covered the Studies screen, the picker and a
  real drag-and-drop (the one check that proves a dropped `File` crosses the context bridge
  with its path), opening a demo study, thumbnails, and the sidecar restore.
- ~~**Plan 05, Gate 2 (after Task 11)**~~ — passed (2026-09-03). Covered restart survival,
  re-run from disk, relocating a moved film, and corrupt and refused stores: steps 1–7 verified
  at the running app, step 8 by the user's observation of both toasts plus the controller's CDP
  proof that a refused store stays byte-identical, and step 9 by a controller console sweep.
  Step 7 proves the paired quarantine: a corrupt `studies.json` must produce a toast naming
  **both** `studies.json.corrupt-<n>` and `predictions.corrupt-<n>`, both artefacts must be on
  disk with their contents intact, and restoring means renaming **both** back. **Anyone
  reproducing step 7 must copy `studies.json` somewhere safe first**: the quarantine preserves
  whatever bytes are on disk when the app reads them, so overwriting the file's contents yourself
  destroys the records before the app ever reads them and "rename back" then restores nothing.
  Real-world corruption is usually a truncated file, which the quarantine keeps intact; a total
  overwrite is the one case nothing can recover. The controller ran the full unit suite and the
  `tools/smoke/` suites first, then this gate at the running app; `ui-redesign-cw` was pushed to
  `fork` at `8d8efe9`.
- ~~**Plan 06, the amendment diff review (before Task 1)**~~ — done (2026-09-03). The user reviewed
  the amended plan and the contract diff (commit `1864367`) and said go; Task 1 was dispatched after
  that.
- ~~**Plan 06, Gate 1 (after Task 4)**~~ — done (2026-09-03). Covered the native folder and
  CSV pickers (the one thing no suite can press), the card counts, the chips and dropdown
  overrides, the note preview, Load into Studies with the new rows at the top as `Processing`,
  the idempotent second Load, a cancelled picker changing nothing, and the rows surviving a
  relaunch with no `SP-00xx` id in `studies.json`. From source on the real dev profile, with
  `studies.json` and `predictions\` copied aside first, and the gate's restore step run at the end.
  One observation, not a defect: the user's first Load ran with the CSV column still `Unmapped`,
  and the toast is the only signal of that — it clears in about two seconds.
- **Plan 06, Gate 2 (after Task 8) — NOT RUN.** The user chose on 2026-09-04 to skip it and hand the
  branch to the backend author. Most of its substance is covered from other directions: steps 1–5
  (the native folder and CSV pickers, cancelling them, the skipped-file clause, the mapping
  override, Load, and the idempotent re-Load) were done by hand on the real profile at Gate 1 on
  2026-09-03 and are covered again by `smoke-workspace.mjs`; the drawer, the demo study's disabled
  cells, the restart seeding and the delete flow are covered by that suite and by the controller's
  Task 6 CDP walkthrough; and "run study A while editing study B" was verified with the race
  genuinely live (`running` was still A's id at the moment B entered edit mode). **Three things are
  covered by nothing:** adding a custom clinical field by typing a name and pressing Enter, the
  Escape key and the focus landing on Cancel in the delete confirm, and a delete performed by hand
  on the real profile against a study that has a saved segmentation. Anyone picking this up should
  run those three before trusting them.
- **Plan 06, Task 9** — done. The branch was pushed to `fork` on 2026-09-04 (at `a83bf20` then, and
  again through `4a0142c` as the post-plan commits landed) so the
  repository could be handed to the backend author; the fork's `main` was not touched and stands at
  `7aa1a86`. **The preview-installer test (decision 16) was not performed**: the user said on
  2026-09-04 that they do not need the installer to work. The release-prerequisite bullet for it
  therefore stands open, and the newest packaged build anyone has run is still the one from
  `6592228` (2026-09-03), which predates every line of plan 06.
- **Plan 07's gates can delete their throwaway studies.** Since plan 06 a real study can be
  deleted from the Studies list (trash button, inline confirm) and its sidecar goes with it, so
  a gate step on the real profile no longer has to hand-edit `studies.json` to clean up.
  "Copy it aside first" still applies to any step that overwrites or corrupts the store.

## Decisions already made — do not relitigate

These were settled with the user during brainstorming. Changing them needs their
explicit say-so.

1. **Full design, all five screens.** Only the nine demo studies are fabricated;
   everything else runs on real files and real computation.
2. **Disc heights and slip are not implemented.** They render `—` with the note
   "Not computed in this build." Both are lengths and need pixel spacing that PNG/JPG
   inputs lack.
3. **`L1PA` is added** as a sixth sagittal row, and `LL L2–S1`…`L5–S1` go behind a
   disclosure. The mockup omitted real backend output; we don't delete working
   measurements to match a mockup.
4. **`SI` → `SS` rename** is a breaking change across backend, tests, and renderer,
   landing as one atomic commit in plan 02.
5. **Landmark editing is kept and redesigned** to direct manipulation. The mockup
   dropped it entirely, which would have made `PI`/`PT` unfixable since both derive
   from femoral circles the design never draws.
6. **Segmentation progress is indeterminate.** Timed stage labels were explicitly
   rejected as fabricated status.
7. **`Reports` nav item is cut** (a dead stub). **`Export PDF report` is deferred** —
   button omitted rather than shipped dead.
8. **`Import from EMR` is relabelled `Import from CSV`.** There is no EMR integration.
9. **CSV column mapping is user-editable** via a dropdown per chip, rather than
   teaching `autoMap` medical synonyms that would guess wrong elsewhere.
10. **Demo studies get no status exemption.** All nine derive to `Segmented`. The other
    two states are reachable honestly — `Processing` from a workspace scan,
    `Needs review` from a genuinely poor femoral fit.
11. **No sample film ships with the app** (2026-09-02). The design's `Use sample film`
    button is cut; people test with their own films or with the public datasets the README
    links. No radiograph of unknown provenance goes into an installer. **The links were
    supplied by the user on 2026-09-03** and are in the README's "Test data" section
    (BUU-LSPINE, VinDr-SpineXR, and Merlin). **Merlin is paper-only by user decision**
    (2026-09-03, "paper only for now") — not an open item.
12. **The prediction sidecar is accepted despite spec §13's "no full-resolution images in the
    store."** Without it a persisted study cannot be redrawn, corrected, or reset after a
    restart; the alternative — a model run on every first open — costs 5–60 s per study per
    session.
13. **`state.running` is a study id, not a boolean; `sourceAvailable` is dropped.** A moved
    film is discovered when it's needed, at re-run, not by a background check on the row.
    Deleting a study and pruning `predictions/` are plan 06's. **Done in plan 06 (Task 7).**
14. ~~**Demo studies are gated on the build channel for release** (2026-09-03, decided at
    Gate 1): kept in dev and the preview installer, absent from the production build.~~
    **Superseded and implemented 2026-09-06** — see decision 19.
15. **Plan 06 (Workspace & clinical data) is done (2026-09-04 — implementation and automated
    verification complete; Gate 2 skipped by the user, not passed); plan 07 (Find similar &
    comparison) is deferred past the first release.**
16. **Before anything is pushed to the fork's `main`, the branch is tested through the
    preview installer.** Recorded alongside the other release prerequisites below.
17. **Plan 06's amendment rulings** (2026-09-03, reviewed by the user at the diff review the same
    day and implemented as written): Load is fill-only and idempotent; `fields` seeded at
    bootstrap and the `×` hides; delete on the Studies row with a two-step confirm and no orphan sweep;
    the `/measure` persist window deferred with its design named; two gates; the drawer's `max-height`.
    See "Plan 06 amendment (2026-09-03)".
18. **Subagents run on the lowest model that does the job** (user instruction, 2026-09-03): Sonnet for
    mechanical work (implementers with complete code in the brief, scoped re-reviews), Opus for judgment
    (reviewers, skeptics, integration implementers, the final whole-branch review); Fable only when
    genuinely necessary. Set the model explicitly on every dispatch.

All of the following were settled with the user in chat on **2026-09-06** and implemented the same
day. Each carries what it costs if it turns out to be the wrong call.

19. **Demo studies are absent from BOTH installers, not just production** (reverses decision 14 and
    `ROADMAP.md`'s "wanted in the preview installer"). Gated on `!app.isPackaged`, so they survive
    only in `npm run dev`. *Why:* the preview installer is the one the user tests, so leaving demos
    in it would mean the tested app never shows the empty state the real one ships with. *Cost if
    wrong:* the preview loses a ready-made fixture for eyeballing the UI — recoverable by changing
    one boolean to `!app.isPackaged || IS_PREVIEW`.
20. **The gate rides the existing `load-studies` payload, never the allowlists.** *Why:* both
    configs ship `renderer/**/*` by glob; excluding `renderer/data/demo-studies.js` would leave the
    bare import in `data/persistence.js` resolving to nothing and the renderer would fail to boot —
    and the allowlist CI check only compares the two lists **to each other**, so it would pass.
    *Cost if wrong:* none identified; it also avoided a new IPC channel and a preload entry.
21. **A study is named after its film; the `SP-nnnn` id stays its identity.** `name` is stored and
    renamable, and `studyName()` falls back to the filename stem so existing records need no
    migration. *Why:* the user found the generated id unintuitive against the file they opened.
    *Cost if wrong:* the id is no longer the first thing on screen — it is on every cell's `title`,
    still the sidecar filename, the delete key and the CSV's `Study ID`, so nothing is orphaned.
22. **Provenance is TWO columns, `WORKSPACE` + `FOLDER`, and `LORDOSIS` is deleted.** *Why:* either
    column alone is ambiguous — the derived folder cannot separate `CohortA/pre-op` from
    `CohortB/pre-op`, and the stored root cannot separate two subfolders of one workspace. The user
    judged lordosis to add nothing to a screen for *finding* a study, which is what paid for the
    width. *Cost if wrong:* the two columns duplicate each other on every non-nested row, and a
    lordosis reader has to open the study.
23. **No backfill and no `STORE_VERSION` bump.** `name` and `workspaceFolder` are optional and
    default to null. *Why:* the user's library is a test environment and an installed build now
    opens empty, so there is nothing to migrate; a bump is expensive (`validateStudy` throws,
    `renderer/main.js` then disables persistence for the session). *Cost if wrong:* studies that
    predate the change show `—` under `WORKSPACE` forever unless someone writes a backfill.
24. **Pan/edit exclusivity is ONE-WAY.** Clicking Edit clears `panMode`; pressing Pan while already
    editing still lets pan win. *Why:* the second half is behaviour a human signed off at Gate 1 on
    2026-09-03 and is asserted by `smoke-gate1.mjs`. Panning is not lost while editing — middle-drag
    and the new chord both still work. *Cost if wrong:* the toggle the user just pressed is silently
    cleared; the alternative the verifier preferred was to disable the Pan button while editing,
    which makes the exclusivity visible instead.
25. **"Double click to move the x-ray" was NOT double-click.** The user meant a left+right chord
    drag, plus cursor-anchored zoom. No `dblclick` handler exists anywhere and none was added.
    *Cost if wrong:* nothing built on a misread requirement — but see the chord trap below, because
    the obvious implementation of it does not work.
26. **The film's watermark keeps the `SP-nnnn` id, not the name.** *Why:* a filename is
    user-supplied text that can carry PHI, and the dropzone copy promises de-identified input.
    *Cost if wrong:* the burned-in stamp does not match the name on screen.

The following were settled with the user in chat on **2026-09-06** during the pre-op/post-op
brainstorm and are recorded in that spec's §6 and in the Parameters-tab plan's ledger. None is
implemented yet.

27. **Subject, timepoint and film date are optional null-default fields on the film record** — not
    folders, not clinical-map entries, not a patient entity — and there is **no `STORE_VERSION`
    bump** (decision 23's precedent). *Why:* folders cannot pair a hand-added or second-load film
    and give a one-year follow-up no home; a clinical-map entry cannot be acted on by the app; a
    patient entity would carry nothing the per-film clinical map does not. *Cost if wrong:* a later
    patient entity migrates two string fields into a `patients` array — a one-time lift.
28. **The key is "Subject", a study code, never "Patient" or an MRN, and it is never burned into the
    film.** *Why:* PHI; the same reasoning as decision 26. *Cost if wrong:* a user who wants MRNs
    keeps a key elsewhere.
29. **Timepoint is an ordered label** (Pre-op, Intra-op, Post-op, N wk/mo/yr, custom), **not a
    two-value enum.** *Why:* fusion research has 6-week, 1-year and 2-year films; deformity work has
    intra-op films. *Cost if wrong:* pairing names a label rather than a boolean, and a misspelt
    label pairs nothing.
30. **View is seeded from folder and stem tokens that name a position (`flexion`, `extension`,
    `prone`, `supine`, `standing`), never inferred from a timepoint, and a per-folder assignment
    table on the Workspace card replaces any per-load selector or null-until-set.** *Why:* the
    no-fabrication rule — an `intra-op` folder does not set prone — and a whole-batch selector
    mislabels a workspace with a flexion subfolder and an extension subfolder. *Cost if wrong:* a
    layout with one folder per subject gets a long table; the column-header set-all control
    mitigates and collapsing identical rows is the recorded escalation.
31. **The acquisition date is "Film date" (`filmDate`); the Find tab's DATE stays the date added;
    a bare `date` CSV header is not recognised** (`film_date` and `study_date` are). *Why:* two
    columns called DATE meaning different things, and a clinical sheet's `date` is as likely the
    surgery date. *Cost if wrong:* a CSV headed `date` has to be renamed.
32. **No per-field provenance flag for seeded values; explicit (CSV) beats inferred (folder);
    nothing overwrites a stored value on load.** *Why:* the grid shows every value and the load
    message says what was inferred; the last rule is the clinical load's fill-blanks rule. *Cost
    if wrong:* which values were guessed versus typed cannot be told apart later without
    re-loading.
33. **The Parameters tab defaults to segmented-only and says how many it hides; the long export is
    primary and the paired export ships last; nothing drops silently.** *Why:* the tab is for
    numbers; stats packages pivot long format in one line; the paired export shares its delta
    code with comparison mode. *Cost if wrong:* an Excel-first user waits for spec task 4 for the
    wide file.
34. **`toCsv` exports the union of clinical keys present on the exported rows and drops its
    `fields` parameter** (roadmap item 1's third decision, made). *Why:* a column hidden in the
    drawer vanished from the file with nothing to say so. *Cost if wrong:* the file can carry a
    column the user deliberately hid, and the per-study export on Analysis changes with it.
35. **Task 1 sorts the grid by study name, not id, and the Studies search box applies to the
    grid.** *Why:* there is no id column (the id is on the name's tooltip), and a visible control
    that does nothing on one tab reads as broken. *Cost if wrong:* the spec's §10.3 wording is
    amended in the plan's Task 8; an id sort would need an id column.
36. **Execution of the plan is subagent-driven: a fresh subagent per task, Sonnet for the
    mechanical tasks (1, 2, 3, 7, 8), Opus for the DOM tasks (4, 5, 6), never Fable.** *Why:* the
    user's standing instruction is the lowest model that can do the task. *Cost if wrong:* none
    identified; recorded so the next session does not ask again.

The following were settled with the user in chat on **2026-09-07**, at the Parameters tab's gates, and
are implemented on the same branch (the plan's addendum, Tasks 9–12).

37. **The CSV's `Source` column and the `includeDemo` option are gone; `toCsv(studies)` never writes
    a demo row.** *Why:* the export dialog that would have set the option was never built, nothing
    passed it, and no installer ships demos (19), so every file the app could write read `real` on
    every row. *Cost if wrong:* a fabricated demo row could no longer be marked in a file, and no path
    writes one.
38. **Ticked rows export as a chosen subset, and the export writes the selected rows that are
    VISIBLE, in grid order; hidden picks stay ticked and return with the filter; with nothing ticked
    the export is the visible rows.** *Why:* the file always matches what is on screen; the button
    label and the count line say exactly how many. *Cost if wrong:* a user expecting a fixed list
    exports fewer rows than they ticked — disclosed by the label.
39. **The row checkbox lives inside the sticky STUDY cell, not in a new first column; the study name
    is the row's link and the whole row is not a click target; there are no filter chips.** Controller
    rulings, accepted at the Task 11 gate and recorded in the plan's Ledger with their costs. *Why:*
    the spec's sticky first column and `<th scope="row">` semantics stay untouched; a whole-row click
    fights the table's other affordances; a chip would repeat the select beside it.

The following were settled with the user in chat on **2026-09-07**, before the study-fields plan was
written, and are implemented on `claude/preop-postop-study-fields`.

40. **The dev build seeds one demo pair: SP-0042 (Pre-op) and SP-0039 (Post-op) as subject `P-8841`,
    with SP-0039's patient fields rewritten to match SP-0042's** (spec §7.4 asked for two demos with the
    fields; the user chose to seed a pair over skipping it). *Cost if wrong:* two demo records diverge
    from the design template's STUDIES array; the file header says so.
41. **The drawer's timepoint and view "chips" are native `<datalist>` suggestions** on the text cells.
    *Cost if wrong:* a chip row would be a small addition.
42. **Import from CSV also overwrites Subject, Timepoint, Film date and View** from the row's structural
    columns, counted separately in the toast. *Cost if wrong:* a clinical-only re-import retypes four cells.
43. **Task 2 is on a new branch off the studies tip** (`claude/preop-postop-study-fields`), merged back
    by fast-forward at the user's say-so.
44. **Planner rulings recorded in the plan's header** (a typed timepoint normalises to a known label; a
    cleared view stores `''`; the grid and the CSV show the film date as stored; a `No timepoint` filter
    entry; paired-only is evaluated before the timepoint filter; the subject sort keeps a block Pre-op
    first in both directions; the load clause reads "folder or file names"; fixed chips; focus restore by
    `data-ws-key`). Each carries its cost in `docs/superpowers/plans/2026-09-07-study-fields.md`.
45. **The paired-only `with` dropdown's first entry and default is `All paired`** (value `'__any__'`, `ANY_POST`): a
    subject pairs when it has a Pre-op film and at least one other labelled film; a specific label narrows to that
    pair; a film with no timepoint never pairs. *Why:* the user's follow-up films were labelled `6 wk`, and nothing
    paired under `Post-op`. *Cost if wrong:* one default string; the spec's §10.3 is amended.

46. **A CSV `view` and a view typed in the drawer that name a known position are stored as the §7.3 label**
    (`flexion` → Flexion lateral), as a timepoint already is; anything else stays as typed (user decision at the
    final whole-branch review, 2026-09-07). *Why:* spec §8.2 said "stored as typed", so a CSV `standing` and a
    `standing/` folder gave two View values for one position — two dropdown entries, films that did not filter
    together, two spellings in the export. *Cost if wrong:* a user who wants the literal text `standing` cannot
    have it; §8.2 is amended.

47. **The paired (wide) export, spec task 4, is one row per subject with one column group per visit present**
    (`Pre`, then each later label among the exported rows — `6 wk`, `1 yr`, `Post-op`, … — each later group with
    its own Δ against Pre; a subject missing a visit gets empty cells in that group); with a single label chosen in
    the `with` dropdown it collapses to the spec's original two-group file. Decided in chat 2026-09-07 after the
    All-paired default made "which post film" a real question; it amends §11.2 at the task-4 brainstorm. *Cost if
    wrong:* a wide file with more column groups than an Excel-first user wants — the long export stays primary.

The following were settled with the user in chat on **2026-09-08**, at the task-4 brainstorm, and are written into
the spec's §10.4, §11.2 and §11.3. Implemented by plan `2026-09-08-paired-export.md` (spec task 4, DONE 2026-09-08).

48. **The paired file is layout B, measurement-major** (chosen from two worked tables): identity columns
    (`<label> study`, view, film date) per visit first, then each parameter's trajectory — `<M> Pre-op`, then `<M> <label>`
    and `Delta <M> <label>` per later visit — contiguous, then clinical keys per visit. Headers use the stored label and
    ASCII `Delta` (the file's `PI-LL Mismatch` precedent); a delta is computed over the two one-decimal values written.
    *Cost if wrong:* a reader who wants one visit's block contiguous scrolls; a column reorder in `toPairedCsv`.
49. **A subject with two films on any label the file writes is ambiguous and gets no row**, named in the toast with
    the label and count; unpaired (no Pre-op film, or no film on a written visit) is judged first; under a single label
    only Pre-op and that label are checked. *Cost if wrong:* a retake at one visit hides the subject from the wide file
    until one film is relabelled.
50. **The toast's duration scales with its length**: 2.2 s to forty characters, then 40 ms per character, capped at
    8 s, for every toast, the workspace load message included. *Cost if wrong:* long toasts linger; nothing dismisses
    one early.

The following were settled with the user in chat on **2026-09-08**, at the batch-segmentation brainstorm, and are
the spec's §6 (`2026-09-08-batch-segmentation-design.md`). Implemented by plan `2026-09-08-batch-segmentation.md`.

51. **The batch starts from the Find tab, and the button follows the export rule.** *Why:* ticked visible rows when
    any visible row is ticked, else every visible unsegmented film; the label says which and how many (HANDOFF
    decision 38, applied to a second action). The Find tab is where the status column and the count already are, and
    the workspace load lands there. *Cost if wrong:* a user who wants the whole library with a filter set has to
    clear the filter first.
52. **Already-segmented rows are skipped, never re-run.** *Why:* a batch re-run would overwrite the record's
    corrected geometry and the sidecar for many films at once, unrecoverably; the viewer's single re-run button
    still covers one study. Bulk re-run waits for ROADMAP item 3's provenance field. *Cost if wrong:* re-running a
    cohort with a new model stays one study at a time until then.
53. **One selection for both tabs.** *Why:* the Find tab reads and writes `state.paramSelected`, the key the
    Parameters grid uses; the name is kept because renaming it touches the grid, its tests and the smoke suite for
    no behaviour. Tick twelve films, segment them, switch tabs, export them. *Cost if wrong:* the key's name says
    `param`; a tick made for one purpose carries to the other, which is the feature.
54. **The workspace and folder filters are shared between the tabs.** *Why:* the Find tab's two selects read and
    write `paramFilters.workspace` and `paramFilters.folder`, exactly as the search box already applies to both tabs
    (decision 35). *Cost if wrong:* a folder chosen for segmenting narrows the grid too, until cleared.
55. **Strictly serial; `state.running` is unchanged.** *Why:* one `/predict` in flight, the batch a sequence of
    single runs; decision 13 stands. *Cost if wrong:* no throughput gain on a multi-core desktop; a later
    concurrency of two needs the backend's thread budget considered first.
56. **Progress is a count of attempts.** *Why:* `{done} of {total} done`, where `done` counts every film whose turn
    has ended — segmented, failed or skipped — so the count always reaches the total. The toast splits the outcome.
    Nothing per film, nothing timed (spec decision 6). *Cost if wrong:* none identified beyond decision 6's.
57. **`IN QUEUE` becomes `UNSEGMENTED`, and the viewer's plain `QUEUED` eyebrow becomes `UNSEGMENTED` too; `QUEUED`
    is reserved for a film in the running batch.** *Why:* both counts are films without measurements. Once a real
    queue exists the old words would label a number and a film as something they are not. *Cost if wrong:* four
    expectations in the studies smoke suite, one in the workspace suite, one in the persist suite, the smoke
    README's baselines, spec §9.4 and §9.5.
58. **No fourth status pill.** *Why:* the running film and every queued film read `Processing`, as spec §13.1
    defines it; the filter bar and the sidebar say what the batch is doing. *Cost if wrong:* a row alone does not
    say whether its film is in the batch.
59. **Stop finishes the film in flight and starts no other.** *Why:* there is no abort: `/predict` cannot be
    cancelled, the backend would keep computing, and an ignored result would waste a minute for nothing. *Cost if
    wrong:* up to a minute's wait after Stop.
60. **Failures are collected and reported once; the batch continues.** *Why:* a film that cannot be read, or that
    the backend rejects, is recorded with its display-ready reason and the next film starts. *Cost if wrong:* a dead
    backend fails every remaining film in seconds, and the toast says so.
61. **A batch is allowed with persistence disabled, with one warning at the start.** *Why:* the results are real for
    the session; the toast says they will be lost. *Cost if wrong:* a long batch whose results vanish at quit —
    after being told.
62. **Approach 1 of three: a driver module beside the router, a pure planner under `data/`, and the run core
    exported from the analysis screen.** *Why:* moving the byte map and the identity guards out of
    `screens/analysis.js` was rejected as relocating code a human gated in plans 05 and 06 for no behaviour gain; a
    main-process queue was rejected because the completion path needs the renderer anyway. *Cost if wrong:* the
    Studies screen depends on the analysis module a little more than it does now.
63. **Nothing about the queue is persisted; no quit prompt.** *Why:* the saver writes on every commit, so a quit
    loses only the film in flight; the remaining films are still unsegmented at relaunch and one click resumes.
    *Cost if wrong:* the user re-clicks.
64. **Model choice is read at each film's turn**, as a single run reads it. *Why:* changing it mid-batch applies
    from the next film; every result records `qc.models`. *Cost if wrong:* a batch's results can mix models, and the
    result says which.
65. **Ticks survive the batch** (decision 38: nothing clears a selection by itself). *Why:* after a batch over
    ticked rows the button reads `Segment 0 selected` with its note, until the ticks are cleared or the selection
    changes. *Cost if wrong:* a disabled button with a true note.
66. **Demo rows have no tick box on the Find tab**, as they have no delete control there: nothing on that tab can
    act on a demo study. *Why:* a demo id ticked on the Parameters grid is simply not counted by the Find tab. *Cost
    if wrong:* a tick made on one tab is invisible on the other for a dev-only fixture.

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
74. **The final whole-branch code review runs BEFORE the human gate** (2026-09-10, controller ruling). *Why:* so the user
    gates the code the branch ships and no fix wave lands after the gate.

**The vertebral level editor (2026-10-10).** 75–88 are the owner's decisions D1–D14 (the plan
`docs/superpowers/plans/2026-10-10-level-editor.md`, its Decisions table, which wins over the handoff
`docs/design/level-editor/HANDOFF.md`); 89–116 are the execution rulings R1–R28 from its Ledger, each with its cost
(114–116, R26–R28, from the owner's gate feedback of 2026-10-11 and its review).

75. **D1 — Window / level reads the original film.** A backend `POST /decode` returns the uploaded file's 16-bit pixels,
    value range and DICOM window defaults; the renderer applies a linear LUT on the film layer only. No CSS filter and no
    LUT on the stored 8-bit PNG. The same decode gives a failed film something to display.
76. **D2 — Save semantics.** Drags keep auto-committing geometry through `/measure` to `studies.json`. **Save edits**
    writes the label record and resets the baseline. **Discard** restores the baseline (the saved record when one
    exists, else the state at entry) through the measure queue.
77. **D3 — Label record location.** `userData/labels/<stem>.label.json`, the film's filename without its extension; a
    second film with the same stem gets `-2`, the third `-3`; the chosen name is stored on the study as `labelFile`, so
    it is stable and covered by delete and quarantine.
78. **D4 — Branch base.** A new worktree off `origin/main` (v1.0.17), independent of the held similar-cases branch.
79. **D5 — Film-type defaults.** lumbar → Lumbar, Sacral, Femoral heads; cervical → Cervical plus T1 only (T4 starts
    not visible); full_spine → all five groups; everything else starts `not_visible` with `source: film_type`.
80. **D6 — An Auto film with no result** starts with every one of the sixteen levels visible (not placed) until the
    annotator unchecks it.
81. **D7 — Leaving edit mode with unsaved changes** shows an inline prompt in the panel footer, `Discard 2 unsaved
    changes? Saved edits are kept.`, with Save edits, Discard and Keep editing; it covers DONE, the Edit button, Escape
    and Back. Sidebar navigation keeps the unsaved level state in memory for the session.
82. **D8 — C2 is an inferior endplate (IA, IP) plus a centroid**, in the panel, the handles and the record: three clicks.
    The schema gained a `c2` definition.
83. **D9 — Overlay colours.** The shipped `LEVEL_RGB` is kept (C2 purple, C3–C7 = L1–L5's colours) and extended with T1,
    T4 and S1; the handoff's L1-anchored cycle is not adopted.
84. **D10 — Save with zero changes.** The first save is allowed; Save is disabled with `NOTHING TO SAVE` only when a
    record already exists and nothing has changed since.
85. **D11 — Window / level is not persisted and not recorded**: display only, reset when the study is reopened, not in
    the label record.
86. **D12 — T1 and T4** are placeable levels in the Thoracic group and written to the record; no measurement reads them,
    so they get no dependency note. T1 slope and T4 angles are out of scope.
87. **D13 — Clear** is kept on manual levels.
88. **D14 — RESET TO PREDICTION** is kept in the edit bar as the whole-study revert to the model's output, beside
    Discard.
89. **R1 — Task 13 removes exports the contract named** (`TAB_ORDER`, `FULL_ORDER`, `nextSelection`, `nudge`,
    `hitTestFemoral`, `sameHandle`, `nearestLandmark`, `landmarkHandles`, `CERVICAL_HANDLES`, `GLOBAL_SVA_HANDLES`);
    the contract amendment strikes them as superseded. *Cost if wrong:* the amendment reworded.
90. **R2 — `data/levels.js` imports `fitCircle` from `viewer/geometry.js`** (data → viewer), because geometry.js is pure
    and the contract forbids reimplementing `fitCircle`. *Cost if wrong:* a one-line import move.
91. **R3 — The wiring (Task 10) and the panel (Task 11) carry no unit tests**; their verification is the smoke suite and
    the human gate. *Cost if wrong:* defects surface there.
92. **R4 — A group's count omits a zero PLACED clause; the summary always writes PLACED.** *Cost if wrong:* one string
    rule in one function.
93. **R5 — `fitFrom` equals `need` for every kind but a head** (FIT from 2); `geometryFromPoints` caps a femoral fit at
    the image diagonal; disc heights add no dependency entries (pinned by a test). *Cost if wrong:* trivial signature
    churn.
94. **R6 — The projection computes `l1_center` and `hip_midpoint`** (the validator rejects nulls beside L1 or two
    circles); `/measure` overwrites both. *Cost if wrong:* two derived fields the backend recomputes anyway.
95. **R7 — A cervical or full-spine projection with no orientation keeps `anterior_side: null`** and is not committed
    until an orientation exists. *Cost if wrong:* a 422 toast from `/measure`.
96. **R8 — Anterior side: the film's stored side, then `study.anteriorSide`, then the side read from placed levels.**
    *Why:* an annotator dragging SA past SP must not flip a film's sign conventions silently. *Cost if wrong:* only
    cervical/full-spine films with a stored side differ; a failed Auto film still derives.
97. **R9 (amended) — With a saved record, the study's circles are matched to the heads by the record's geometry**, a
    matched head takes the saved geometry with its rim, unmatched circles fill free heads preferring visible ones.
    *Cost if wrong:* head attribution after a reopen differs in rare mixed cases; Discard clears it.
98. **R10 — Only a `segmented` level writes `contour`**; edited and manual levels write null. *Cost if wrong:* an edited
    level's record lacks the model outline (its `model_corners` keep the model's quad).
99. **R11 — A non-ENOENT failure to move `labels/` aside during quarantine disables persistence for the session**, as a
    `predictions/` failure does. *Cost if wrong:* a stuck folder stops saving where a notice would have done.
100. **R12 — `labelFileName` makes the stem safe** (reserved and control characters to `_`, no leading dots, 180
     characters at most, a Windows device name takes `_`); the main process's regex stays. *Cost if wrong:* such a film's
     save fails with `Invalid label file name.`.
101. **R13 — The 8-bit window rule** is `valueMin >= 0 && valueMax <= 255 && (bitsStored === 8 || exactly 0..255)`.
     *Cost if wrong:* an odd default window on rare 8-bit DICOMs.
102. **R14 — `ensureFilm` reports `superseded` as its own flag**; `reason` stays display-ready. *Cost if wrong:* none
     visible.
103. **R15 — The mask colour map iterates a private `MASK_LEVELS`** (the original eleven), so S1's new colour never
     paints a mask label. *Cost if wrong:* a future level mask needs the list extended.
104. **R16 (amended) — Hand-placed means `predictionId == null && !qc?.models`** (`isHandPlaced`): such a study has no
     sidecar and is shown from its decoded original, never FILM UNAVAILABLE; a pre-v1.0.10 result keeps the sidecar
     path. *Cost if wrong:* a legacy film with no qc at all would open on its original.
105. **R17 — No run starts while editing** (Re-run and the region bar's Run segmentation are disabled, titled `Finish
     editing before re-running segmentation`); a batch reaching a film with an open or stashed editor still drops that
     editor on completion. *Cost if wrong:* a rare lost label edit when a batch overtakes a film being edited.
106. **R18 — A row with two actions stacks them** (Place… above CLEAR) in the 70px column. *Cost if wrong:* one taller
     row for hand-placed heads.
107. **R19 — The records must be accurate**: Task 14's review fixed its record-accuracy minors in the same round (the
     gate's edit-bar item, the handoff's contour row per R10, "Location to confirm." struck, the near-duplicate click
     rule's scope). *Cost if wrong:* none; wording.
108. **R20 — An Auto film with no model run takes its region from its placed levels on every projection** (an editor
     opened as Auto, or `requestedRegion === 'auto'` and `isHandPlaced` or a result that names no region), never from
     the `geometry.region` its last commit wrote; `projectionRegion`, `projectsLevel` (what commits) and the region the
     editor opens with share `regionFollowsLevels`. *Why:* the first commit locked the region, so C + L levels could
     never become a full spine. *Cost if wrong:* an Auto film's region flips as levels are placed (intended).
109. **R21 — Region and Orientation are disabled while editing** (`Finish editing before changing the region` / `…
     the orientation`), and `changeRegion` refuses while editing; outside edit mode it still drops a stashed editor.
     *Cost if wrong:* a region change needs DONE first.
110. **R22 — No femoral head under 0.5 px**: FIT is disabled and `finishPlacing` a no-op while the fit's radius would be
     under 0.5 px (`canFinishPlacing`), and a head's click within 1 px of any of its rim points is dropped. *Cost if
     wrong:* a deliberately tiny head cannot be placed.
111. **R23 — `/decode`'s `scaled` and `RawFilm.scale`** (a range wider than 65535 packed into uint16) are a recorded
     deviation from the plan, documented in the contract amendment. *Cost if wrong:* none.
112. **R24 — A hand-placed film's Failed status is the owner's call** (clear `processingError` on the first hand-placed
     commit, or a status of its own); on the gate's checklist and in ROADMAP §8, unchanged in code. *Cost if wrong:*
     Failed films sort first and block Mark reviewed until the owner decides. **Closed 2026-10-15 by E2** (annotation
     editor round 2): a status of its own, `hand`, and the first hand-placed commit clears the failure.
113. **R25 — A rim-point drag or nudge that would leave a femoral head under 0.5 px is refused** (`moveHandle` returns
     the geometry unchanged, so the handle stays where it was): the re-review of the final wave found the one path R22
     left to a radius of 0, which the label record's schema rejects. *Cost if wrong:* a rim point cannot be dragged
     within 1 px of the other point of a two-point rim.
114. **R26 — A placement click within 1 px of ANY other point of the placement is dropped**, for every kind (gate
     feedback G2, `068c8e2`): it generalises the previous-point rule for bodies, C2 and endplates and keeps R22's rule
     for a head; a slot's own earlier point is not another point, and a double-click still counts once. *Cost if
     wrong:* a body or endplate corner cannot be placed within 1 px of another of its points.
115. **R27 — A re-placed point counts once in the placement's history** and moves to its end, so UNDO after a re-place
     clears that point rather than restoring where it was (G2, `068c8e2`). *Cost if wrong:* re-placing a point loses
     its earlier position to UNDO. (A LEFT-first chord's take-back of a re-placing press is not UNDO: it restores the
     placing from before the press, `restorePlacing`, `dcd0cb5`.)
116. **R28 — Past 1:1 the overlay keeps its image-pixel size**: `viewer/canvas.js` `drawLevelEditor` and
     `drawDynamicLayer` floor the drawing ratio at 1 image pixel per CSS pixel (`dcd0cb5`). *Why:* the dynamic canvas is
     drawn at the stored image's resolution and CSS-scaled with the film, so past 1:1 on screen (which the 8x cap makes
     reachable) every CSS-sized stroke, dash, handle and label fell under one image pixel, was anti-aliased away and
     then magnified (faint lines, unreadable plates). Below 1:1 the overlay holds its screen size as before; hit testing
     is in client space, with a grab radius that follows the drawn handle past 1:1 (2df1373, the re-review's finding).
     *Cost if wrong:* handles and labels look large at 8x on a film that is already at 1:1 at low zoom (a small film).
117. **D15 (owner, 2026-10-11, gate feedback G3) — Window / level outside edit mode, and it belongs to the view.**
     Like zoom and pan, the window resets where zoom and pan reset (FRESH_VIEW: another film opened from the list, or
     the open study closed); Back and the sidebar's return keep it, as they keep zoom and pan; entering and leaving
     edit mode keep it; never persisted, never in the record. It is `state.filmWindow`, written only by
     `renderer/film-window.js`; the level editor carries no window (`8cf213d`). Supersedes D11's reset on entering edit
     mode. (Worded so by the review of G3/G4: the first wording said leaving the Analysis screen reset it, which Back
     does not do; the owner's choice was "while the film is open, like zoom and pan".)
118. **D16 (owner, 2026-10-11, G4) — A right-button drag windows the film** in every mode, without opening the panel:
     horizontal the width, vertical the level, four units per screen pixel; the chip shows the live W and L.
119. **D17 (owner, 2026-10-11, G4) — A double right-click resets the window** to the film's default (the panel's RESET
     stays). Browsers fire no `dblclick` for the right button, so `viewer/interactions.js` `isDoubleClick` (pure,
     tested) detects it.
120. **R29 — The window resets where zoom and pan reset**, FRESH_VIEW (another film opened from the list, this one too;
     the open study closed by a delete or the demo toggle); Back and the sidebar's open-study card keep it, as they keep
     zoom and pan; a delete, a completed run or a Region change forgets it. *Cost if wrong:* one `filmWindow: null` in
     Back's write.
121. **R30 — A right drag decodes a film with no window yet once it moves (R37) and does not retry an unavailable
     one**; opening the panel does. *Cost if wrong:* a film whose source comes back needs the panel opened once before
     the right drag works. (Worded as the behaviour since R37 on 2026-10-11; it first said a right press decodes.)
122. **R31 — A right-button drag over an undecodable film says why** in a toast (`Window / level is unavailable.` and
     the reason), once per drag, with the panel closed. *Cost if wrong:* one toast per attempt.
123. **R32 — The double right-click compares the two presses only** (400 ms, 6 px, the events' timestamps), on the film
     and the black surround; its second press starts no drag and is forgotten; a chord forgets the right press before
     it. *Cost if wrong:* a quick right-drag ending where it began, then a press there within 400 ms, resets the window.
124. **R33 — Copy**: the tool's tooltip names the right-button shortcuts (its accessible name stays `Window / level`),
     and outside edit mode the panel carries the help line the edit bar gives in edit mode. *Cost if wrong:* copy.
125. **R34 — Windowing is not gated on the study's own run** (display only; the completed run forgets the window), and
     with the panel open outside edit mode the construction label chip still takes its own left press. *Cost if
     wrong:* a busy guard in two places.
126. **R35 — A kept window never outlives the decoded original it windows** (the review of G3/G4, finding 1; `8332dfb`).
     At the mount, when the film's window is ready or loading and its cached images have no `raw` (another study's run
     took the single image-cache entry while the film was off screen), `screens/analysis.js` calls
     `redecodeKeptWindow` (`renderer/film-window.js`, beside the pure `windowNeedsDecode`) instead of the plain restore:
     `ensureFilm` restores the stored image, attaches the decode and hands both to the viewer; when no original comes
     back a ready window is forgotten, so the chip and the panel never claim a window the film layer does not draw.
     *Cost if wrong:* one `/decode` on such a return, or a forgotten window when the source has gone.
127. **R36 — The open W/L panel outranks the Pan toggle for the left button**, in both modes (finding 3). The middle
     button and the chord still pan; the cursor over the film with the panel open is the window cursor. *Cost if
     wrong:* with the panel open and Pan on, the left button cannot pan; the middle button, the chord and closing the
     panel can.
128. **R37 — A right press windows only once it moves** 3 CSS px (finding 4; `exceedsSlop`, pure): until then the drag
     is pending and nothing is decoded, so a stray right click, or a right-first chord formed before any movement,
     leaves a never-windowed film on its stored image with no W / L on the chip; the double right-click still compares
     presses. *Cost if wrong:* a right drag under 3 px does nothing; the crossing move applies the whole distance from
     the press at once.
129. **D18 (owner, 2026-10-11, gate feedback G5) — The label record lists each entry's edited points and carries an
     edits summary**, so a folder of records can be counted without diffing corners. Every level and femoral head gets
     `edited_points`, its own geometry keys (a body `sa, sp, ia, ip`; C2 `ia, ip, centroid`; T1/S1 `sa, sp`; T4
     `centroid`; a head `center, radius`): the moved ones when `edited`, every key when `manual`, none otherwise; the
     record gets `edits` after `complete` (entries per state over the sixteen, `points_moved`, `points_placed`).
     `data/levels.js` `pointKeys` / `changedPoints` (pure), written by `data/label-record.js` (`3e552e6`).
130. **R38 — `edited` exactly when `edited_points` is not empty.** The list is computed by the per-value test the state
     uses (`sameGeometry`'s `near`, 10⁻⁶ px), so the two never disagree; a head's rim is not a point, so a rim-only
     change lists nothing and the head stays segmented; the schema states it too. *Cost if wrong:* counting rim edits
     needs the rim compared, which would also badge rim-only changes Edited.
131. **R39 — Both fields are additive.** The schema keeps `spinecontour.segmentation-label/1` and requires neither, so
     records saved before them validate and read the same; the app writes both on every save from now on. *Cost if
     wrong:* a consumer tests for the fields instead of reading a schema version; a `/2` with both required would fail
     every earlier record.
132. **D19 (owner, 2026-10-12, gate feedback G6) — Mark reviewed writes the label record when the film has none
     yet.** Marking a study reviewed on the Analysis panel (no bulk mark) also writes the zero-change record of the
     stored state, exactly what Save edits writes right after entering edit mode with nothing changed, so a film accepted
     as the model segmented it is a human-accepted label without a trip through edit mode. Unmarking writes nothing; a
     study with a record is left alone (Save edits keeps owning it); a zero-change Save edits still works (D10).
     `renderer/level-editor.js` `writeReviewRecord` over `writeRecord`, the write it shares with Save edits, called by
     `screens/analysis.js` `toggleReviewed` after the mark (`ad2b70b`).
133. **R40 — Unsaved level edits come first.** No review write while an editor for the study is open or stashed
     (`state.levelEditor?.studyId === studyId` or `hasStashedEditor(studyId)`), checked before the write and once the
     film has been read; the mark still applies. A Save edits clicked while a review write reads the film waits for it.
     *Cost if wrong:* a film marked reviewed while its stashed edits wait gets no record until the annotator saves or
     discards and marks again.
134. **R41 — The mark never waits for or depends on the write.** `reviewedAt` is set first, synchronously, and stands;
     a failure toasts `Marked reviewed. The label record could not be written: <reason>` and sets nothing; a success
     toasts `Saved the label record.` and sets `labelFile`. *Cost if wrong:* a reviewed film can lack its record after
     a failed write (the toast says so; unmark and mark again, or Save edits, writes it), and unmarking never deletes a
     record already written.
135. **R42 (review round 1 of G6) — The review write reads the stored image only.** `screens/analysis.js`
     `imageInfo(studyId, { storedOnly: true })` takes a segmented film's stored image (`data/predictions.js`
     `hasStoredImage`) from the image cache, else from its sidecar for that call alone, with no `/decode` of the
     original and nothing cached or restored, and hands back the sidecar's geometry when it read it (the model's
     geometry when no prediction snapshot is in memory). Before it, a review write could decode the original, and the
     next film opened meanwhile superseded the read: the failure toast landed over the next film and no record was
     written. Save edits reads as before; a hand-placed film still decodes its original (its stored image). *Cost if
     wrong:* a click before a segmented film reaches the stage reads its sidecar twice; a hand-placed film's review
     write can still fail if another film is opened before that film's decode ends (the toast says so).
136. **D20 (owner, 2026-10-13, gate feedback G7) — The level plates sit outside the body on the posterior side and can
     be dragged.** Both fixes the owner was offered, after their right-facing film showed every plate inside its body
     (Task 9's fixed rightward plate). Where a plate was dragged is view state like zoom, pan and the window: FRESH_VIEW
     resets it, entering and leaving edit mode keep it, it is never persisted and never in the label record. Built on
     `claude/level-plates` off `cbbeb4e` (v1.1.0): `6463f63`, the records commit, the 1.1.1 release commit.
137. **R43 — A plate's side is read from its own level.** The anchor is unchanged (a body's posterior-edge midpoint,
     C2's IP, an endplate's SP, T4's centroid); the plate extends away from the level: a body by the sign of (the
     posterior-edge midpoint x − its corners' mean x), C2 by (IP x − the centroid x), an endplate by (SP x − SA x);
     under 1 px, and always for T4, opposite the film's anterior side (the stored geometry's, the study's chosen one,
     the placed levels', else +1). Side −1 puts the plate's right edge 14 px left of the anchor. `labelPlacement`,
     pure, in `renderer/viewer/level-labels.js`; `drawLevelEditor` returns the plates drawn. *Cost if wrong:* a level
     whose own shape reads the wrong way (a crushed or wedged body) gets its plate on the anterior side for that level,
     and the drag moves it; the plate stays wholly on the film (R45), so one beside a body at the film's edge is pushed
     inward rather than clipped.
138. **R44 — Any plate drags; a double-click puts it back.** `state.platePositions` (code → `[dx, dy]` image px),
     written only by `components/viewer.js`, always as a new object. In edit mode a left press past the selected
     level's handles (handles win), not while placing, with the W/L panel open, with Pan on or during the study's own
     run, drags the plate under it; the travel is read in image points (unclamped `clientToImage`), so the plate follows
     the pointer at any zoom; release and cancel keep the offset; a chord dismantles the drag; the second press of a
     double-click (`isDoubleClick`) resets it. `dynamicKey` includes `platePositions`. *Cost if wrong:* a plate dragged
     onto the selected level's handle is grabbed only outside the handle's 14 px circle; the offsets are lost when
     another film opens and are not kept across sessions (keeping them would mean a field on the study record).
139. **R45 — A plate stays wholly on the film** however far it is dragged: `drawLevelLabel` clamps the plate's rect to
     the canvas (the G7 review's finding), so it can always be seen and grabbed back, and a plate beside a body at the
     film's edge is pushed inward rather than clipped; the returned rect is the clamped one, so hit-testing follows.
     *Cost if wrong:* a plate cannot be parked off the film; a double-click puts it back where it belongs.

## Release prerequisites — v1.0.0 main promotion

Current instructions: [main release](../release-main.md). The earlier statements that
plan 06 had never been packaged, or that installed previews contain demos, are superseded.

- The merged preview lineage was tested in the v0.2.0 macOS installer: empty library,
  bundled backend and automatic calibration of three real WebP examples. Windows and
  macOS preview builds passed 458 renderer and 109 backend tests before PR #4 merged.
- The production workflow now runs renderer/backend tests, allowlist parity and actual
  packaged source/version checks on both Windows and macOS, with project-repository
  guards. Publication waits for both platforms.
- Only main can publish a numbered release; PR/manual feature builds create artifacts.
  Numbered versions retain their source and published binaries, while `latest-windows`
  remains the moving compatibility download. Preview channels remain separate.
- The source version advances main from 0.1.0 to 1.0.0. See the full release notes and
  all 305 incoming commits in `docs/releases/`. Production build results belong in
  the promotion PR. The macOS app remains unsigned; clinical validation and plan 07
  remain outside this release.
- **2026-09-10:** the studies-table branch merged `fork/main` v1.0.5 cleanly (`ceacc7e`); the release path is a
  version bump to 1.0.6 in `package.json`, `renderer/data/version.js`, `CHANGELOG.md` and `docs/releases/1.0.6.md`,
  then a PR to `fork/main`; merging publishes.

## Known traps

- **(2026-09-13) Two worktrees, one library, one version string.** `npm.cmd run dev` from the wrong worktree runs
  the wrong code against the same `%APPDATA%\spine-contour` library, and both footers read the same version until the
  release bump. When a report contradicts what the branch does on `studies.json`, check the running executable first:
  `Get-Process electron | Select Path`. An older app that saves the library drops fields it does not know (`note`).
- **(2026-09-12) CDP screenshots need `ack: true`** in the same `setState` as `screen`, or the landing gate stays and
  every capture is the disclaimer page (all identical byte sizes is the tell). The smoke window is 1167 CSS px wide.
- **(2026-09-12) `all: unset` erases later shared rules of equal specificity** unless the shared rule comes AFTER it
  in the stylesheet; `.study-name` is last in `styles/screens/studies.css` for that reason. A table's auto layout
  shrinks a cell whose text may break anywhere down to a word per line unless the cell has a `min-width`.
- **(2026-09-11) `smoke-workspace.mjs` runs once per instance** (its first run adds the Notes field); `backend/onnx/`
  is gitignored, so a fresh worktree needs the models copied from a sibling; plain `python` is the Store alias — use
  the venv's; Electron's binary may need `node node_modules/electron/install.js` after `npm ci` under npm's script policy.

- **A source launch with Tesseract installed but not on PATH silently reports every image as
  `unavailable`.** `configure_ocr()` only points `pytesseract` at the bundled copy shipped in
  installers; without one it used to fall through to `tesseract` on PATH with no further lookup,
  so a machine with Tesseract at e.g. `C:\Program Files\Tesseract-OCR` but no PATH entry got
  `TesseractNotFoundError` on every ruler extraction, silently caught and turned into "Automatic
  ruler detection is unavailable." (2026-09-10, this laptop, Tesseract 5.3.3.) `resolve_tesseract()`
  now also checks `TESSERACT_CMD` and the standard per-OS install folders; the console names the
  outcome (`OCR: using <path>` or `OCR: no Tesseract binary found ...`) so a source launch says why.
- **The Bash tool halves a doubled backslash in command text** (2026-09-08, batch execution): `\\\\` arrives as
  `\\`, so a `grep -P '\\u[0-9A-Fa-f]{4}'` written the natural way reaches PCRE as `\u` and errors, and a Python
  heredoc with `"\\u"` in a string hits a SyntaxError. Single escapes such as `\x00` are untouched. Double every
  doubled backslash, or write the script to a file first. The Write tool also turned three `\uXXXX` escapes into
  glyphs in one new file (caught by the byte-check, repaired with the venv python), which the existing bullet below
  already describes.
- **The Edit and Write tools can rewrite a `\uXXXX` escape in JS source as the literal glyph, and once turned
  a `§` in a JS comment into the six characters `\u00A7`** (2026-09-08, three times in one session: `\u2026`/`\u00B7`
  in `pairing.js` and `smoke-parameters.mjs`, `§` in `screens/parameters.js`). Both forms compare equal at
  runtime, so no test catches it; only a byte-level look at the diff does (`od`, or `cat -A`). Repair with a small
  Python script — Git Bash `sed` drops backslashes from replacement text, and a `bash -c` one-liner mangles them
  too. Check the diff for stray glyphs or `\u00` sequences before every commit that touches such a line.
- **`smoke-studies.mjs` must run on a fresh launch, never after `smoke-workspace.mjs` on the same instance.** The
  workspace suite's loaded films are still queued when the studies suite counts the queue, so `summary reads n+1
  studies, 1 unsegmented` reads `3 UNSEGMENTED` — a false failure that vanished on a fresh launch (2026-09-08). Its
  stale diagnosis check was fixed 2026-09-08 (the suite searches "meyerding", a word only SP-0042 carries); 103/103
  is green.
- **A Sonnet implementer that starts a multi-minute suite in the background and "waits for the
  Monitor" ends its turn mid-task** (twice on 2026-09-07), leaving files edited, nothing committed
  and the app alive on port 9222; `SendMessage` is not available in this harness, so it cannot be
  resumed. Say "run each suite in the foreground and capture its output to a file" in every dispatch
  that runs one; the recovery is a fresh finisher told the working-tree state.
- **`list` is a read-only accessor on `HTMLInputElement`** (it returns the bound datalist), so
  `el('input', { list: 'x' })` throws in strict mode the way `style` does. `setAttribute('list', …)`
  after construction. (2026-09-07, the drawer's Study group.)
- **A commit that pre-arms the rebuild gate must write the stored form back onto the node** when the store keeps
  something other than what was typed (a timepoint normalised to its label, a trimmed subject): nothing else
  repaints the cell, and the restore's blur listener is the only commit path after an external rebuild. The
  drawer's `commitStudyCell` does this for both paths (2026-09-07, Task 7's review).
- **`cdp-lib.mjs`'s `key('Enter')` and Space send no `text`**, so Blink emits no keypress and a native
  `<button>` or checkbox never activates from them; dispatch the key event with `text` yourself. The
  suites click; the human's real Enter works.
- **Chromium shows no tooltip on a disabled control.** A `title` on a disabled button is invisible;
  the Parameters tab renders its reason as a visible note. The Analysis screen's Export button still
  relies on `title` (roadmap item 5).
- **A docs commit above a gated task's commit forces a history rewrite to amend that body.** Keep the
  ledger uncommitted during a gate and commit it after the amend; `git commit --amend` and
  `git reset --soft` are accepted by the classifier (`--hard` is not). Push only after the last amend.
- **`git reset --hard` is refused by the auto-mode permission classifier; `git checkout -B <branch>
  <target>` is accepted** and is the same operation for a branch with no unique commits (2026-09-06,
  re-basing a fresh worktree branch onto the studies branch). Prove `git log <target>..HEAD` shows
  nothing that is not already on `main` or the target first, or the commits are gone.
- **Two sessions can work this repo at once, and the other one can move your base branch.** The
  studies-branch session added a docs commit to `claude/studies-ui-updates-bb040d` while the
  pre-op/post-op branch was being written. The fix was `git merge-tree --write-tree <target> HEAD`
  as a conflict dry run, `git rebase <target>`, then re-reading `CLAUDE.md` and this file — before
  writing any code, not after.
- **A mouse chord is born in `pointermove`, never in `pointerdown`.** Chromium implements the
  Pointer Events chorded-button rule: `pointerdown` fires only on the transition from no buttons to
  some button, and `pointerup` only on the transition back to zero. The second button of a
  left+right chord, and the first release out of one, **both arrive as `pointermove`** carrying
  `button` = the button that changed and `buttons` = the new mask. A chord test placed only in a
  pointerdown handler is dead code that silently never fires. Test the `buttons` **bitmask**, never
  `button` — a `button` test gets exactly one press order right. Verified on Electron 44 / Chrome
  152 in both orders; `renderer/viewer/interactions.js`'s `isChordHeld` is the predicate.
- **A CDP `mouseMoved` sent with `button: 'none'` silently drops pointer capture.** It reads as
  "capture is lost during a chord", which is a false negative that looks exactly like a real defect.
  Every move in a chord test must carry the held buttons (`{ button: 'left', buttons: 3 }`).
  `cdp.click` and `cdp.drag` hardcode a single button, so chord tests must use the raw `mouse`
  primitive. `cdp-lib.mjs`'s own `drag` already does this correctly — copy it.
- **A wheel is not a pointer event, so it slips past every drag guard.** `handleWheel` fires *during*
  a pan drag: pointer capture does not withhold it and `if (drag) return` never sees it. Now that
  the wheel writes pan as well as zoom, the live drag's baseline has to be re-based by exactly what
  the wheel changed, or the next `pointermove` discards it and the film snaps back.
- **`transform-origin: center` breaks the naive zoom-anchor formula.** `.viewer-host` scales about
  the stage's centre, so a host-local point lands at `C + P + z*(p - C)`, not `P + z*p`. The
  top-left formula is wrong by `(1-z)*C` — 500px at 2× on a 1000px stage: nearly right in the middle
  and grossly wrong at the edges, which is where a quick manual check does not look. And `k` must
  come from the **post-clamp** zoom, or the film creeps every tick at `ZOOM_MAX` while the label
  sits frozen at 800%.
- **Before believing a canvas/pointer suite's FAILURE, re-run it alone on a freshly launched
  instance.** On 2026-09-06 a batched re-run reported `gate1` 22/25 and `gate2` 28/32 — pan-vs-edit
  precedence, Escape-exits-edit, and a landmark drag all "failing". Run alone against the same
  commit, on a fresh `launch.mjs`, both were 25/25 and 32/32. The batch had followed a suite that
  was killed mid-run, and the existing "never re-run on an instance where a previous suite was
  killed" note is why: a wedged renderer produces failures that read exactly like real pointer
  regressions. The same run also stalled `parity` for minutes because `pytest backend` was loading
  torch on the same CPU-only laptop — **do not run the Python suite concurrently with a canvas
  suite**; the drag assertions are timing-sensitive and starve.
- **A smoke suite that prints nothing has thrown, not passed.** `smoke-workspace.mjs` and
  `smoke-persist.mjs` buffer their results and print at the very end, so an exception mid-run
  produces *no output at all* — not even the failures already recorded. When a suite is silent, re-run
  it without piping through `grep` and read the stack. It cost an afternoon here: a `rectBy(...)`
  returned null and the next line dereferenced `.cx`.
- **Do not key a smoke selector on a user-visible label.** Two `smoke-workspace.mjs` lookups selected
  on `aria-label="Delete SP-nnnn"`; renaming studies broke them into a null dereference. They select
  on `data-study-id` now. The same applies to any assertion on a name — read the store, not the cell,
  when the point is that a stored field survived.
- **`el()` assigns to the property when the key exists on the node.** `spellcheck: 'false'` sets the
  boolean property from a non-empty string and therefore turns it **on**. Pass real booleans.
- **`npm install` in a fresh worktree does not give you a working Electron.** This machine's npm
  blocks package install scripts, so Electron's postinstall never downloads the ~244 MB binary.
  Copy `node_modules/electron/dist` (and `path.txt`) from a worktree that already has it.
- **`cdp.errors` replays old page exceptions on every connect.** `cdp-lib.mjs`'s `connect()` enables
  `Runtime`, and Chromium re-emits the page's stored console messages, so a fresh `cdp.mjs` process
  prints exceptions from earlier in the same page session as if they had just happened. Only a
  relaunch clears the buffer. To attribute an exception to a step, record `cdp.errors.length` right
  after `connect()` and report deltas. This cost real time before it was understood.
- **Chromium fires `change` synchronously when a focused, edited input is removed from the DOM.** A
  component that rebuilds inside a store subscriber removes the focused cell, the cell's `onChange`
  runs mid-notification, and any `setState` in it throws. Both handlers in the clinical drawer defer
  their commit through `queueMicrotask` for exactly this reason; `renderer/main.js` uses the same
  trick for its toast. Assume any input handler that writes state needs the same treatment.
- **An SVG with a double hyphen in an XML comment silently fails to decode in Chromium.** It is
  illegal XML, and the image simply never loads with no error in the app. It bit the app-icon work;
  both mark files now carry a warning.
- **Two checks in `smoke-studies.mjs` race the backend** and can legitimately fail (found when the suite had 56
  checks; it has 151 since 2026-10-01). See `tools/smoke/README.md` for the two names and why the product, not the
  suite, is right: a run whose only failures are one or both of them is green, anything else is a real regression.

- **CI parses checked-out text files with CRLF endings.** The Windows runner's Git defaults to
  `autocrlf=true` and there is no `.gitattributes` rule for text. Any inline script that matches
  `\n` in a checked-out file silently fails — the preview workflow's allowlist parity check did,
  on every run, until `8d8efe9`. Write `\r?\n`, or `.trim()` every line.
- **Three layers of "alive is not ready" when driving the app over CDP.** A modal keeps the
  process alive; the CDP port answers before the window exists; a page target exists before
  `renderer/main.js`'s top-level `await loadStudies()` has resolved. `tools/smoke/launch.mjs`
  handles the first two; a probe must still poll until `getState().studies.length > 0` or it
  reads the initial empty store and looks like a persistence defect. Never re-run a suite on an
  instance where a previous suite was killed mid-run — relaunch.
- **A gate step that overwrites a file destroys its records before the app runs.** The quarantine
  preserves what is on disk at read time. Gate scripts must say "copy it aside first".
- **PowerShell steps that look right and are not** (found by plan 06's amendment review, 2026-09-03):
  .NET file APIs (`[IO.File]::WriteAllText`, `[IO.Directory]`) resolve relative paths against the
  process directory, which `Set-Location` does NOT move — use absolute paths; `\"` inside a
  double-quoted argument is not passed through to `node` (write the expression to a `.mjs` file and use
  `cdp.mjs --file`); `Copy-Item` on a `predictions\` that does not exist errors (guard with
  `Test-Path`); `$env:SMOKE_KEEP_PROFILE = "1"` lingers for the rest of the shell, so a later
  `launch.mjs` silently reuses a dirty profile (clear it after the relaunch).
- **`node --test test/` fails on Node 24.** Use `node --test test/*.test.js`.
- **Two electron-builder file allowlists exist** and must stay in sync. Plans 02 and 03
  each contain an assertion step that diffs them.
- **`renderer/` cannot import `node:fs`.** It is loaded by the browser through
  `<script type="module">`. Disk I/O lives in root-level `store-io.js`.
- **`design-reference/` is required, not decorative.** Plan 02 sources the ten woff2
  fonts from `design-reference/design_src/`; plan 05 sources a sample radiograph from
  the same place.
- **LFS bandwidth is NOT a problem — do not chase it.** Plan 01 lost time suspecting it.
  Measured in CI: `actions/checkout` with `lfs: true` takes ~54s and `git lfs pull` takes
  **1 second**. If a build is slow or dies, look at packaging, not LFS.
- **LFS quota.** Pushing this branch uploaded 432 MB of model weights to the fork, about
  43% of GitHub's free 1 GB. Avoid branches that touch `backend/weights/`.
- **Chromium fires a focused input's `blur` when a rebuild removes it**, so a deferred commit queued from that blur
  runs one microtask after the rebuild has re-created and re-focused the editor and would write the half-typed draft
  and close it; the Find tab's SUBJECT editor skips the commit when the input node is no longer connected
  (`!input.isConnected`) while the editor is still logically open on that row (`editingSubject.id === study.id`) — a
  removal-blur; a user blur leaves the node connected at that moment. Found by the final review's smoke check
  (spec 7.3), 2026-09-10; `smoke-studies.mjs`'s check `a rebuild while the editor is open keeps the editor, the draft
  and the caret` is the tripwire. Residual: a rebuild that filters the edited row out keeps an invisible draft until
  another edit flushes it (unreachable today).

## Recovering the design source

`design-reference/template.html` is already extracted. If it is ever lost, the original
export is a self-extracting bundle and `design-reference/unpack_design.py` regenerates
the assets:

```bash
"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" design-reference/unpack_design.py
```

The Claude Design MCP is **not** available — the account lacks Claude Design
entitlement (`HTTP 403`), and `/design-login` does not exist in CLI 2.1.251. Do not
retry it; use the extracted files.
