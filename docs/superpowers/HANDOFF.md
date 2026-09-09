# Handoff — Spine Contour UI Redesign

**Last updated:** 2026-09-08
**Branch:** `claude/studies-ui-updates-bb040d` (the studies work plus the Parameters tab, on top of `origin/ui-redesign-cw` @ `0022d91`)
**Worktree:** `C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d`
**This copy is on:** `claude/upstream-reconcile-2026-09-08` — the UI branch (batch segmentation included) with the
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

## Where things stand

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
  once). The search input mirrors `live.query`, which the bulk delete clears.
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
§5; one pre-existing prototype-key clinical leak is still open.

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

## Release prerequisites — before a production release

These are about shipping `latest-windows`, not about any remaining plan work; plan 07 is
deferred past the first release (decision 15). They must not be forgotten before a
production release:

- **Gate demo studies on build channel.** Dev and the preview installer keep the nine demo
  studies; the production build must exclude them. Not yet implemented (decision 14 above).
- **Add a repository guard to `windows.yml`.** It currently has only `branches: [main]`,
  unlike `windows-preview.yml`'s `if: github.repository == ...`. Merging this branch's
  descendants into the fork's `main` without that guard would run the production workflow on
  the fork and publish a release tagged `latest-windows`. See "Distributing a build from this
  branch" above.
- ~~**Supply the README's public dataset links.**~~ — done (2026-09-03, decision 11 above).
  BUU-LSPINE and VinDr-SpineXR link to both paper and dataset; Merlin links only to its paper
  since no public dataset link was supplied for it, and the README says so rather than
  guessing.
- **`windows.yml` runs no renderer tests and no packaging-allowlist check.** The preview workflow
  does both; the production one builds and publishes without either. The two allowlists are also
  the files most likely to conflict in a merge, and a merge that drops a root file from one of
  them would publish an installer that opens a blank window with CI green. Named at plan 06's
  closing whole-branch review and deliberately not changed there.
- **The first preview installer from this lineage is the one the 2026-09-08 push of `fork/ui-redesign-cw` builds.**
  It carries plan 06 and everything after it, plus the backend developer's Tesseract `--add-data` and
  `check_bundled_ocr.py`, none of which had ever been packaged. **Built and installed 2026-09-08/09** (run
  34292966476, `Spine-Contour-Preview-Windows.exe` 882 MB, up from 681 MB for the Tesseract bundle and scipy). The
  user's checks on it: no demo studies in the packaged build (54 real studies persisted from the earlier preview
  install, as designed); a batch from the Find tab ran; the calibration screen was walked — the user reports it
  asks for each image to be calibrated individually (the backend developer's design; raised with him, see ROADMAP
  §5); console clean. The true empty-library first launch was not seen because the upgrade kept the preview's
  data folder; the demo gate itself is proven.
- **Test the branch through the preview installer before pushing to the fork's `main`.**
  (decision 16 above). **Open, and never yet done for plan 06's code.** The user decided on
  2026-09-04 that they do not need the installer to work, so plan 06's Task 9 pushed the branch
  without running this test; the newest installer anyone has run was built from `6592228` on
  2026-09-03, before the Workspace existed. Strike this bullet only when the test passes on a
  build that contains plan 06.

## Known traps

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
  sits frozen at 240%.
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
- **Two checks in `smoke-studies.mjs` race the backend** and can legitimately report 54/56. See
  `tools/smoke/README.md` for the two names and why the product, not the suite, is right.

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
