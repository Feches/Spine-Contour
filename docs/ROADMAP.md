# Roadmap — deferred work

Work that is understood and deliberately not built yet. Each item says what happens today, what
"done" looks like, and the decisions someone has to make before writing code.

This is not a wish list. Everything here came out of building plans 01–06 or out of the whole-branch
review at the end of plan 06, and each item is either a limitation a user will hit or a hazard a
maintainer will hit. Items are ordered by when they are likely to matter, not by size.

Authoritative detail lives in `docs/superpowers/HANDOFF.md` (state, decisions, traps) and in
`docs/superpowers/plans/2026-08-31-00-architecture-contract.md` (binding interfaces). Where an item
would change a stored file's shape, that is called out, because it forces a store version bump.

---

## 1. The exported CSV cannot be imported back

**Priority: next.** This is the item the roadmap was opened for.

Plan 06 put clinical import and clinical export in the same module and made clinical values part of
both. The obvious workflow is therefore: export the study list, fill in Diagnosis and ODI in Excel,
load the file back. That does not work today, and it fails silently rather than with a message.

### What happens today

Export (`toCsv` in `renderer/data/csv.js`) writes (header as of 2026-09-07; `Subject`, `Timepoint`
and `Film date` came with spec task 2):

```
# Spine Contour export
# Created by Cody Woodhouse, MD; Michael Jayasuriya, BS.
# Investigational software. NOT FOR CLINICAL USE.
Study ID,View,Subject,Timepoint,Film date,LL L1-S1,PI,PT,SS,PI-LL Mismatch,L1PA,LL L2-S1,...,<clinical fields present>
SP-1000,Standing lateral,S001,Pre-op,2025-03-02,49.0,48.6,12.1,36.5,-0.4,...,58,F,Fusion
```

Three separate things then block the import, and all three have to be dealt with:

1. **The citation block is read as data.** `parse` drops blank lines only, so the first line,
   `# Spine Contour export`, becomes the header row and the file parses as one nameless column.
   Nothing downstream can recover from that. This alone kills the round trip.
2. ~~**The identity column holds the wrong kind of value.** Past the comments, `Study ID` does
   normalise to `studyid`, so `findJoinHeader` would find it. But the import joins a row to a film by
   the film's **filename stem**, while the export writes the **record id** (`SP-1000`). Nothing
   matches, and every row is reported unmatched. The two identifiers were designed for different
   moments: a film on disk has no id until it is loaded, which is why the import joins on filename.~~
   **Fixed 2026-09-12:** `Study ID` now holds the film's stem — the name every screen shows — and
   the record id is not exported at all (the user's rule: it appears nowhere a person looks, tooltips
   included). The app's own export therefore names its films the way the import joins them; only the
   comment block (item 1) still stands between the file and a round trip.
3. ~~**Only currently-visible clinical columns are exported.** `toCsv(studies, fields, …)` takes the
   session's active field list, and the drawer's column control hides a field for the session. So a
   hidden column is absent from the export with nothing in the file to say so, and a round trip
   through that file would drop those values even once 1 and 2 are fixed.~~ **Fixed 2026-09-06.**

### What "done" looks like

A researcher exports the library, edits clinical columns in Excel, saves as CSV UTF-8, loads the file
in the Workspace, and every row lands on the study it came from. Measurement columns are ignored on
import (they are outputs, never inputs). Nothing is silently skipped: whatever does not match is
counted and named in the load message, as unmatched rows already are.

### Decisions to make first

- ~~**Which identity does the round trip use?**~~ **Decided 2026-09-12:** the stem, under `Study ID`;
  the record id stays internal and is not exported. The options as they stood:
  (a) Export a `study_id` column holding the filename stem alongside the human-facing `Study ID`.
  Cheapest, keeps the import rule unchanged, but puts two identity columns in a file people read.
  (b) Teach the import to join on the record id when the column holds one, falling back to the
  filename stem. Handles the app's own export directly, but means a row can now name a study that
  does not exist in this library, which needs its own reporting.
  (c) Give every study a stable external identifier and export that. Cleanest long term, and it is
  the same conversation as item 3 below, but it changes the stored record and forces a version bump.
  **2026-09-07:** the record now carries `subjectId` and `timepoint` (pre-op/post-op spec task 2),
  which is the stable external identity for analysis; whether the import should join on them is
  still this decision.
- **Comment lines: skip or forbid?** Skipping lines that begin with `#` before the header is a small
  change to `parse` and makes the app's own export readable. It also silently changes how a
  third-party CSV whose first column legitimately starts with `#` is read. Decide, then test it.
- ~~**Export hidden fields or not?**~~ **Decided and done (2026-09-06, Parameters tab task):** the export
  writes every clinical key present on the exported studies, KNOWN_FIELDS order then custom, and
  `toCsv` no longer takes the visible field list. A hidden column can no longer vanish from the file.

### Where the code is

`renderer/data/csv.js` owns all of it: `toCsv` (export), `parse`, `findJoinHeader`, `joinClinical`
(import). All of it is pure and unit-tested in `test/csv.test.js`, so this work is testable without
launching the app. The Workspace wiring is `renderer/screens/workspace.js`; the per-study import is
`renderer/components/clinical-data.js`.

### Rough size

Small to medium. The parser and export changes are hours. The identity decision is what makes it
larger, and option (c) makes it a plan of its own.

---

## 2. Telling studies apart when they come from more than one folder

There is no workspace as a saved thing. The app has one library, and "workspace" is a transient
pointer to the folder and CSV last picked; none of it is persisted. Loading a second folder merges
its films into the same library, with ids continuing across them.

Today nothing in the Studies table says which folder a study came from. The columns are id, patient,
view, date, status and lordosis, and the search box covers id, patient, view and clinical values. So
a library assembled from several folders cannot be filtered back down to one of them.

Two sizes of answer:

- **Show the containing folder, derived from the film's path.** No change to stored data. The catch
  is that the scan follows subfolders and the record keeps only the film's own path, so a film in a
  subfolder shows the subfolder while its siblings show the parent. Honest under a heading of
  FOLDER, not under one of WORKSPACE. Pairs naturally with extending the search to cover the path,
  which is roughly a line and is what actually delivers filtering.
- **Store the chosen folder on each study.** Truthful as a workspace, but it adds a field to the
  record, which means the validator, the contract's record definition, a decision about the studies
  already in the library, and a version bump.

**DONE (2026-09-06) — both, as two columns.** The user chose to take both halves rather than pick
one, because on their own each is ambiguous: the derived folder alone cannot separate `CohortA/pre-op`
from `CohortB/pre-op`, and the stored root alone cannot separate two subfolders of the same workspace.
`WORKSPACE` shows the stored root and `FOLDER` the derived containing folder; together they are unique.
A film added by hand shows `—` for the workspace and its own source folder for FOLDER, which is how an
ad-hoc film is told from a loaded one at a glance.

No backfill and **no `STORE_VERSION` bump**: `workspaceFolder` is optional and defaults to null, so an
existing record loads unchanged and reads `—` forever. That was the user's explicit call — the library
is a test environment, and an installed build now opens empty anyway (see the demo-studies bullet
below), so there is nothing to migrate. Width came from deleting `LORDOSIS`, which the user judged to
add nothing to a screen for *finding* a study. Search now covers the two folder names shown, but still
not the full path — the deferral recorded in `screens/studies.js` stands for the path itself.

---

## 3. Nothing records which model produced a stored measurement

> **2026-09-04:** partly addressed. Every `/predict` response now carries `qc.models` (which
> model read each structure) and `qc.framing` (the crop it ran on), and the Analysis header
> shows the vertebral model behind a result. The store-level half — a provenance field that
> `validate` preserves, a status that asks for a re-run, a way to re-run a selection — is
> unchanged and still needs its own plan.

> **2026-09-08:** the batch driver (`renderer/batch.js`, `startBatch(ids)`) is the vehicle for "re-run a selection":
> it skips segmented films by rule today (batch spec decision 2), and an explicit re-run flag that lifts that rule —
> after the provenance field exists — is the remaining piece.

**Read this before merging a new segmentation model.**

A study's `measurements`, `geometry` and `qc` are stored with no indication of what produced them.
The moment a second model exists, old and new numbers sit in one library, one exported CSV and one
set of prediction sidecars with nothing to tell them apart, and there is no way to ask "which
studies need re-running" or to re-run them in bulk.

If the payload changes shape rather than just its numbers, the validator nulls the
measurements and geometry of every affected record with a console warning, the studies fall back to
`Processing`, and each one has to be re-run by hand from its own screen.

What it needs: a provenance field on the record (a model name and version at minimum), the validator
preserving it, the status derivation treating a study measured by an older model as needing a re-run,
and a way to re-run a selection of studies. This changes the stored record, so it is a store version
bump and a contract amendment, and it deserves its own plan rather than a patch.

---

## 4. Release prerequisites

Not code quality; these stand between the branch and a production release.

- **The production build workflow runs no renderer tests and no packaging-allowlist check.**
  `.github/workflows/windows.yml` builds and publishes without either, while the preview workflow has
  both. The two allowlists are also the files most likely to conflict in a merge. A merge that drops
  a root file from one list would publish an installer that opens a blank window, with CI green.
- **`windows.yml` has no repository guard**, only a branch filter, so merging a descendant of this
  branch into a fork's `main` would run the production workflow there and publish a release tagged
  as the latest.
- ~~**The nine demo studies ship in every build.** They are wanted in development and in the preview
  installer, and must be absent from a production build.~~
  **DONE (2026-09-06), and stricter than this said.** They are gated on `!app.isPackaged`, so they
  appear in `npm run dev` only and are absent from **both** installers, preview included. The user
  reversed the preview half deliberately: the preview installer is the one they test, so leaving
  demos in it would mean the tested app never shows the empty state the real one ships with. The
  gate rides the existing `load-studies` payload — it is **not** an allowlist exclusion, because
  `renderer/**/*` ships by glob and dropping `demo-studies.js` would leave a bare import resolving
  to nothing, failing the renderer boot while the allowlist CI check still passed.

---

## 5. Smaller known limitations

> **2026-09-08, reconcile:** the release list in §4 gains the Tesseract runtime — the preview and production
> workflows now `choco install tesseract` and `--add-data` it into the backend bundle, and `check_bundled_ocr.py`
> verifies the bundle. None of that has been exercised by an installer yet, and `pytest backend` has not been run
> on the merged backend from this side.

- **A bulk load has no ceiling.** The scan, the IPC payload and the load are unbounded. The realistic
  input is a public dataset of thousands of films, not a mistaken drive root.
- **Five things have no automated coverage**, and each would stay green if broken: the two deferred
  commits in the clinical drawer that stop a rebuild stranding typed text, the delete path's
  data-safety branches, the bootstrap step that makes stored clinical values visible after a
  restart, the refusal branch of the drawer's `Import from CSV` when a filename is ambiguous, and the
  gate that stops a refused store's sidecar being read under a reused id. The bootstrap one sits in
  the file a backend merge is most likely to touch.

  The last two were verified by hand against the running app when they were fixed, and neither has a
  check that would catch a regression. The sidecar gate is the one worth closing first, because its
  failure mode is another patient's measurements one click away from being committed: write a store
  with an unsupported `version` into a scratch profile, open a study that has measurements and
  geometry but no cached bitmaps, and assert both that the film reads as unavailable and that
  `RESET TO PREDICTION` is disabled. The ambiguity refusal needs only a second film sharing a stem in
  the smoke fixture, which would also give the workspace load's ambiguous counter its first live
  assertion.
- **The external-URL check has no automated test.** The landing gate's contact address made
  `open-external` accept `mailto:` alongside http and https, and the pattern is deliberately strict:
  one address, no query string, because a `?subject=` or `?body=` would let a caller compose a
  message in the user's real mail client. It was verified by hand against fifteen cases, including
  header injection and the `javascript:` and `file:` schemes, but it lives in `main.js`, which no
  unit test can load. Moving the two patterns into a small root module beside `store-io.js` would
  make them testable, at the cost of an entry in both packaging allowlists.
- **Two checks in the studies smoke suite race the backend.** They click re-run, navigate, then
  expect the row to still read `Processing`; on a fast or warmed-up machine the run has already
  finished and the badge correctly reads `Segmented`. The suite reads 54 of 56 when that happens.
  The product is right and the suite is wrong, so the fix belongs in the suite: sample the badge
  while the run is provably still in flight. Details and the two check names are in
  `tools/smoke/README.md`, so nobody mistakes it for a regression.
- **A landmark correction is saved before its measurement round trip returns.** An abrupt quit inside
  roughly 150 milliseconds makes a corrected geometry durable beside the previous numbers. The design
  for the fix is written down in plan 06's design notes: an optional staleness flag on the record,
  set on commit and cleared on the result, read by the status rule.
- **The Studies row is a single control for assistive technology.** It keeps the button role it was
  given in plan 05, so some screen readers do not announce the in-row delete controls separately.
  Mouse and keyboard both work. Recorded for an accessibility pass. (2026-09-08) The row now nests a real
  checkbox — a second tab stop per row under a `role="button"` parent whose children some readers treat as
  presentational. Mouse and keyboard both work; the accessibility pass owns it. The Find tab's focus
  restore falls back between Segment and Stop, and either can be disabled at that moment (Stop after it
  is pressed; Segment after a batch over ticked rows ends): `.focus()` on a disabled control is a no-op
  and focus drops to `<body>`; test `!target.disabled` and fall back to the bar. (Found at the final
  whole-branch review, 2026-09-08.) (2026-09-10) The header cells are plain divs with a sort button each (no `aria-sort`, which needs a
  `columnheader` role), and each real row's SUBJECT cell is a `role="button"` under the row's own — three more
  things for the accessibility pass.
- **The Studies screen's `Find | Parameters` tab strip is an incomplete ARIA tabs pattern.** It
  carries `role="tablist"`, `role="tab"` and `aria-selected`, but no `aria-controls`, no roving
  `tabindex` and no Arrow-key handling, so a screen reader announces tabs that do not behave like
  tabs. Either complete the pattern — ids on both panels, `aria-controls` on each tab,
  `tabindex="-1"` on the inactive one, and ArrowLeft/ArrowRight plus Home/End moving the selection —
  or drop the roles and let the two buttons be what the Analysis panel's plain buttons already are.
  Mouse and Tab-then-Enter both work today.
- **The Analysis screen's Export CSV button explains its disabled state in a `title` only**, and
  Chromium shows no tooltip on a disabled control, so the reason ("Demo studies are not exported") is
  invisible. The Parameters tab renders its reason as a visible note beside the button
  (2026-09-07); do the same here. (2026-09-10) The Find tab's disabled Delete button has the same defect — spec 5.2's title
  (`Tick studies to delete` / `WAIT_FOR_*`) is never shown either; same fix, same day it is done here.
- **Hidden picks on the Parameters grid are invisible until the filter changes, and there is no
  "clear selection" control.** Both follow from the rule that the export writes the selected rows
  that are visible (HANDOFF decision 38): a tick hidden by a filter is still a tick. Clicking an
  indeterminate select-all selects everything visible, so clearing a partial pick is two clicks. A
  `Clear selection` control shown whenever any pick exists, visible or not, would blunt both.
- **The folder table on the Workspace card has no collapsed form.** A layout with one folder per
  subject gives one row per subject; the rows scroll inside the card and the column-header `Set all…`
  sets a whole column, which is workable. If it proves not to be, spec §16's escalation is to collapse
  rows whose inferred values are identical into one summary row with an expand control — never to hide
  the table, because its point is that every assignment was on screen before Load.
- **A film loaded before 2026-09-07 keeps `Standing lateral` for ever under the fill-blanks rule**
  (HANDOFF decision 32): `view` is never blank, so a later Load cannot correct it, and the drawer is the
  only path — one film at a time. A bulk relabel (select rows on the Parameters grid, set a view) would
  close this; it needs a decision on whether Load may overwrite a value the app itself hard-coded.
- **The Parameters tab's Subject box rebuilds the grid on every keystroke with no debounce.** Fine at library
  scale so far; on a several-hundred-film workspace with `Levels` on it will be felt, and destroying the focused
  input mid-keystroke would cut an IME composition. A debounce, or excluding the filter bar from the rebuild, is
  the fix when it is needed (2026-09-07, Task 9's review).
- **A custom clinical field named after an `Object.prototype` key writes a fabricated value.** `study.clinical[field]`
  guarded only by `!= null` — the long export (`renderer/data/csv.js`, `toCsv`), the paired export (`toPairedCsv`) and
  the Parameters grid's clinical cell (`renderer/screens/parameters.js`) — resolves `constructor` or `toString` to the
  inherited function on any study without an own key of that name, and its text lands in the file or the cell. The
  drawer's `Add a custom field` accepts such a name. Fix all three with one own-property helper
  (`clinicalValue(study, field)`) and a test per export. Found by the paired-export branch's final review
  (2026-09-08); pre-existing, deliberately not fixed there. A custom field named like a measurement column (`PI`)
  also gives a duplicate header in both exports, exactly so in the paired file.
- **`renderer/data/csv.js` carries the citation block twice** (`toCsv` and `toPairedCsv`, 2026-09-08). Lift it to one
  `CITATION` const the next time the file is touched, so the NOT FOR CLINICAL USE line cannot drift between the two
  exports; the clinical-cell guard above is the natural companion.
- **`smoke-gate2.mjs:120` asserts toast absence after a 300 ms settle**, and the window a stale toast can occupy grew
  from 2.2 s to as much as 8 s with `toastDuration` (2026-09-08). Every toast that suite raises is short, so it is
  unaffected today; if it ever fails there, clear the toast through the store before the drag at line 113.
- **`smoke-studies.mjs` reads 59/60 since `0f8f821`** (2026-09-07): `searching the diagnosis text leaves only SP-0042`
  finds SP-0039 too, because decision 40 gave the demo pair matching patient fields and both diagnoses contain
  "Anterior slip". **Fixed 2026-09-08** — the suite searches "meyerding". Run that suite on a fresh launch, never
  after `smoke-workspace.mjs` on one instance, whose loaded films are still queued and turn `1 UNSEGMENTED` into
  `3 UNSEGMENTED`.
- **`/predict` has no timeout.** Neither a single run nor a batch bounds the wait for the backend; a hung backend
  hangs the run, and a batch's Stop then never returns. Bound the fetch in `main.js`'s predict handler (a generous
  ceiling, minutes, since a film takes up to a minute on the tested laptop) and surface the timeout as the run's
  failure reason. Recorded at the batch-segmentation brainstorm (2026-09-08).
- **A throw from the thumbnail or the prediction snapshot leaves decoded bitmaps undisposed.** In `segmentStudy`
  (screens/analysis.js) a throw from `thumbnailDataUri` or `recordPrediction` lands in the outer catch without
  `disposeStudyImages`; inherited from the old run path, and a batch amplifies it (one orphaned bitmap set per
  film). Hoist the `images` binding out of the `try` and dispose in the catch. Found at Task 3's review, 2026-09-08.
- **A delete that lands during a batch film's byte read is reported as a failure, not a skip.** `segmentStudy`
  returns `The study is no longer in the library.` from its post-read identity check, and the driver files every
  non-ok outcome under `could not be segmented`; the batch spec's §9 meant `skipped (deleted, or segmented
  meanwhile)`. Cosmetic toast wording; a `skipped: true` outcome kind from the core would fix it. Found at the final
  review's fix wave, 2026-09-08.
- **`tools/smoke/smoke-persist.mjs` comments (around lines 561, 590 and 683) still name `runSegmentation`**, which
  became `segmentStudy` on 2026-09-08. A word sweep the next time that suite is edited.
- **The segment button is not disabled during a bulk delete.** `startBatch` refuses while `state.deletingStudies` is
  set (the reconcile's ruling R-M5), but the Find tab's button still reads `Segment N …` for the seconds a Delete of
  selected rows takes, and a click in that window does nothing and says nothing. Feed `deletingStudies` to `planBatch`
  as a `note`, the way `running` is. Reconcile of 2026-09-08. Still open.
- ~~**Hiding the demo studies is one-way.** "Delete all studies" in a development build writes
  `hideDemoStudies: true` to `library-preferences.json` in userData and nothing writes it back, so the nine fixtures
  the smoke suites and every manual check lean on are gone until the file is edited by hand (the scratch profile the
  smoke harness uses is fresh per launch and is not affected). A packaged build has no demos and is unaffected.
  Upstream's design (2026-09-07); worth a "Show demo studies" toggle in Settings for development builds.~~ **DONE
  (2026-09-10):** a DEMO STUDIES Show/Hide row in Settings, development builds only (studies-table spec §9).
- **Calibration follow-up (2026-09-09):** automatic per-image folder scanning, batch integration, persisted study scales and CSV exports are now implemented. Reference teaching is optional; missing rulers leave scales unavailable and Continue permits uncalibrated films. The new desktop calibration smoke covers the folder handoff, corrections, reopening, Stop and disk reload. A source-only check does not replace the next preview installer check. Leaving onboarding through a sidebar item still retains its request for the next visit; Skip / Continue clear it. See [batch-calibration.md](batch-calibration.md).
- **Bulk-delete polish** (upstream's feature, 2026-09-07; found at the reconcile review): the per-row trash buttons
  are not disabled during a bulk delete and the guards return silently; the bulk row sits outside the Find tab's
  focus snapshot, so focus drops to `<body>` after Cancel; `blocked` reads `persistenceDisabledReason()`, which is not
  a store key, so persistence disabled mid-session does not repaint the row until another key changes; the
  partial-failure toast names only the first failure. (2026-09-10) Delete all is gone; of these, the focus drop after Cancel is fixed by the new prompt (focus
  returns to Delete); the per-row trash buttons during a bulk delete, the `blocked` repaint and the first-failure-only
  toast still apply to Delete selected.
- **The studies-table Delete prompt withdraws on a change to the ticked-visible id LIST, not exactly spec 5.3's
  wording.** A search or filter change that happens to leave the same set of ids ticked and visible leaves the prompt
  standing; the safety property (never act on ids the user has not just confirmed) still holds. A documented
  deviation, `renderer/screens/studies.js`'s `confirmingSelected` reconciliation. Found at Task 4's review, 2026-09-10.
- **Escape cancels the Find bar's Delete prompt only while focus is inside it.** Pressing Escape elsewhere on the
  page does nothing. `renderer/screens/studies.js`. Deferred at Task 4's review, 2026-09-10.
- **`merge()`'s `hideDemos` option in `renderer/data/persistence.js` is dead code.** No caller passes it now that
  `deleteStudyBatch` is real-only and demo visibility moved to `renderer/demo-visibility.js` /
  `renderer/data/demo-visibility.js`. Remove it the next time the file is touched. Found at Task 5's review, 2026-09-10.
- **The sidebar's `demo-settings` class has no CSS rule.** `renderer/components/sidebar.js` adds it to the Settings
  block holding the DEMO STUDIES toggle; no stylesheet selects it — an unused hook, plan-specified. Found at Task 5's
  review, 2026-09-10.
- **The studies-table spec's §13 Settings Hide/Show smoke check was never written as an automated suite.**
  Coverage is Task 5's by-hand CDP run (checks a–f) and Task 8's human gate check 5, not a `tools/smoke/` section.
  Ruled at the pre-flight scan, 2026-09-10 (see the plan's `## Ledger`).
- **`canonical()` in `renderer/calibration.js` collapses `NaN` to `null` through `JSON.stringify`.** Unreachable
  today because `normalizeCalibration` guards its inputs before `canonical()` runs; if it were ever reached, the
  failure direction is a stale Reviewed status (a changed calibration reads as unchanged, so the review mark is not
  cleared). Found at Task 3's review, 2026-09-10 (studies-table plan); confirmed still deferred at the final review.
- **The first click elsewhere while a SUBJECT editor is open commits the value but does not land where the user
  clicked.** The rebuild replaces the control between `mousedown` and `mouseup`, so moving editor-to-editor by mouse
  takes two clicks, and clicking a row's tick box mid-edit commits the subject but does not tick the row.
  `renderer/screens/studies.js`. Inherent to the rebuild-on-commit design; found at Task 4's review, 2026-09-10.
- **The open SUBJECT editor's input box is inset 8px on its right** (`width: 100%` with `margin: -8px` on both
  sides — off-centre, not clipped). One line (`width: calc(100% + 16px)`) if it is ever minded.
  `renderer/screens/studies.js` / its stylesheet. Found at Task 4's fix round 1, 2026-09-10.
- **The rebuild-mid-edit smoke check's caret assertion cannot fail on its own.** `el()`'s value setter parks the
  cursor at the end of the string, so the check would need to type, press ArrowLeft, then assert caret 1/1 to
  actually pin the restore rather than the setter's own default. `tools/smoke/smoke-studies.mjs` section 16. Found
  at the final fix wave's re-review, 2026-09-10.

---

## 6. Consolidate the five `sameKey` copies

The identical three-line reference-equality redraw-gate predicate lives, by convention rather than
import, in `renderer/components/clinical-data.js`, `renderer/components/measurements.js`,
`renderer/components/viewer.js`, `renderer/screens/studies.js` and `renderer/screens/parameters.js`. It
belongs in `renderer/dom.js` as one export — the contract already lists `dom.js` as "el() helper, tiny
render utilities" — but consolidating touches five files and the contract's `dom.js` block, so it waits
for its own small change rather than riding on a feature task.

---

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
