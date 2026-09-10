# Studies table: delete selected, sortable headers, editable subject, reviewed status — design

**Status:** draft for review, 2026-09-10. Brainstormed on branch `claude/studies-table-ui-updates-953945`
(off `fork/main` at `6106463`, the v1.0.3 trunk). Nothing here is implemented.

**Builds on:** `2026-08-31-spine-contour-ui-redesign-design.md` (the approved spec; "spec §" below),
`2026-09-06-preop-postop-organisation-design.md` ("pp §"), `2026-09-08-batch-segmentation-design.md`
("batch §") and the binding architecture contract `plans/2026-08-31-00-architecture-contract.md`.
§12 lists every amendment this forces.

---

## 1. Problem

Four things the user hit on the installed v1.0.x build, working a nine-film OLIF workspace:

- **Bulk delete is all-or-nothing.** `Delete all studies` sits above the tab strip and clears the
  whole library, the studies a search or a filter is hiding included. The rows already carry ticks
  and the STUDY header a select-all, but nothing deletes a chosen set.
- **The list cannot be sorted.** The Parameters grid has had click-to-sort headers since spec task 1
  (`sortableHeader`, `sortParameters`, `state.paramSort`); the Find tab's header row is inert text.
- **PATIENT is a column of em dashes.** The cell reads `pt`, a label only the nine compiled-in demo
  records carry. Real studies carry `subjectId`, seeded at a workspace load from the folder's first
  plain segment, else the film's stem with its timepoint and view tokens peeled off (pp §8.1). A film
  named `sub225_post-op_11-5-20.png` in the workspace root therefore reads as subject
  `sub225_post-op_11-5-20`: the user sees "the filename". Correcting it means opening each study and
  editing the clinical drawer's Study group, one film at a time.
- **`Needs review` can never be satisfied.** Status is derived from measurements and qc alone
  (spec §13.1; `renderer/data/status.js`), so a study a clinician has opened, checked and accepted
  reads `Needs review` for ever. There is no control that says the review happened.

What exists today, and what this design keeps:

- **Ticks are shared** between the Find list and the Parameters grid (`state.paramSelected`,
  batch §7.2), and the Segment button acts on the ticked rows that are *visible* (`selectedVisible`
  in `renderer/data/parameters.js`): a tick hidden by the search or a filter is never run.
- **The delete order is load-bearing.** `deleteStudy` refuses a running study, deletes the sidecar
  first, then the renderer caches keyed by the id, then removes the record in one `setState` that
  also prunes the tick and closes the study if it was open. `deleteAllStudies` does the same through
  `deleteStudyBatch` and sets `deletingStudies` before its first `await`, so a run, a batch and a
  bulk delete are mutually exclusive (HANDOFF reconcile rulings, 2026-09-08).
- **Status derivation is pure.** `deriveStatus(study)` knows nothing about the store; the "or
  currently running" half of the Processing rule lives in `buildRow`, which passes `state.running`.
- **The Workspace and Folder selects on the Find bar are shared with the grid** (batch §7.1,
  decision 4). They stay exactly as they are.
- **Demo gating has two gates**: `main.js` reports `demoStudies: !app.isPackaged`, and a development
  build additionally honours the `hideDemoStudies` preference in `library-preferences.json`. An
  installed build never shows a demo.
- **The record is replaced, never mutated**, and every optional field defaults to null and is listed
  in `validateStudy`, or it is written and then dropped on the next load (persistence.js's own
  warning). No `STORE_VERSION` bump for an optional null-default field (ROADMAP §2 precedent).

## 2. Workflow

The researcher (spec §2):

1. Loads a workspace. Nine films arrive; their subjects are seeded from the stems.
2. On the Find tab, clicks the first SUBJECT cell, types `sub225`, presses Enter, and the next
   row's cell opens. Nine subjects in nine Enters.
3. Clicks the STATUS header. The `Needs review` rows sort together. Opens each, checks the landmarks
   against the film, and clicks `Mark reviewed`. The badge reads `Reviewed` on the screen and on the
   list.
4. Ticks the two films that turned out to be the wrong view, clicks `Delete 2 selected`, confirms.
   The other seven, and everything the search was hiding, stay.
5. Switches to the Parameters tab. The corrected subjects pair pre-op with post-op.

## 3. Goals

- A delete that acts on the ticked, visible rows and nothing else, from the same bar as Segment.
- Every column of the Find list sortable, with the grid's own control and rules, so the two tabs
  read the same way.
- The subject id visible on the Find list and editable there in place, fast enough to correct a
  whole column without opening a study.
- A fourth status, `Reviewed`, that a person sets on the Analysis screen and that the app clears
  the moment the numbers it was set over change.
- Demo studies hideable and showable again in a development build, from Settings, and unreachable
  in an installed build.

## 4. Non-goals

- **Header filters.** The user chose to keep the Workspace and Folder selects and to plan header
  filtering for both tabs together later. Recorded in ROADMAP.
- **Bulk "Mark reviewed" from the list.** A one-click review over rows nobody opened is the wrong
  shape for a clinical tool. Held back deliberately.
- **Reviewer identity.** The app has no user account; the mark is a timestamp.
- **A `Reviewed` column in the CSV exports.** Not asked for; the export header is pinned by tests
  and by whatever the user's tooling reads. One column, when wanted.
- **Any change to the Parameters tab** beyond what a shared record shows (a subject edited on Find
  appears on the grid at once, because it is the same record).
- **Persisting the sort.** Session-only, like `paramSort` and `paramFilters`.
- **Deleting demo studies.** Demo rows have no tick and no trash button; hiding them is §9.

## 5. Delete selected

### 5.1 What goes

The library-level `Delete all studies` button, its confirm bar, the `studies-bulk-actions` host and
`confirmingAll` in `renderer/screens/studies.js`. `deleteStudyBatch` loses its `hideDemos` option and
its demo branch: demos are never among its targets any more.

### 5.2 The bar

`.studies-filters` becomes: Workspace select · Folder select · **Delete** · spacer · the Segment
group (or the batch progress group, unchanged). Delete is a secondary `.btn.btn-small` with
`data-find-key="delete"`.

| Ticked visible real rows | Label | State |
|---|---|---|
| 0 | `Delete` | disabled, title `Tick studies to delete` |
| N ≥ 1 | `Delete N selected` | enabled |

N is `selectedVisible(visibleRealRows, paramSelected).length`, the same helper `planBatch` uses, so a
tick the search or a filter is hiding is never deleted. The button is also disabled, with the same
titles today's delete-all uses, while `running`, `batch` or `deletingStudies` is set or persistence
is disabled.

### 5.3 Confirming

Clicking replaces the bar's controls with the existing `.studies-bulk-prompt` markup:

> Delete N studies, including their saved results? Original image files will be kept.
> **[Delete permanently] [Cancel]**

Focus lands on Cancel (the safe half of a destructive pair, as the row prompt does). Escape cancels.
Any change to the ticks, the search, the filters or the tab withdraws the prompt, as a keystroke
withdraws the row prompt today. `confirmingSelected` replaces `confirmingAll` at module scope and
stays in the rebuild key.

### 5.4 Deleting

`deleteSelectedStudies()` is `deleteAllStudies()` with two differences: its targets are the ticked
visible real rows captured at confirm time, and it does **not** clear the search (delete-all cleared
it because nothing was left to search). Everything else is kept exactly: `deletingStudies` set before
the first `await`; `deleteStudyBatch(targets, { deletePrediction })`; `forgetPrediction` and
`releaseStudy` per deleted id; one `setState` removing the records, pruning the ticks (`withIds`,
because `nextId` reuses a freed id at once), clearing `openId` and `compareId` if they were deleted;
the toast `Deleted N studies. Original image files were kept.` or the partial-failure wording.

The per-row trash button and its two-step prompt are unchanged.

## 6. Sortable headers

### 6.1 State

A new store key, `findSort: { key, dir }`, default `{ key: 'date', dir: 'desc' }` — newest first,
which is the order a hand-added film has always taken (it is inserted at the front). Replaced
wholesale on change; session-only; in the Find screen's rebuild key. The grid's `paramSort` is
untouched.

### 6.2 Keys

| Header | key | Compares |
|---|---|---|
| STUDY | `study` | `studyName(study)` |
| SUBJECT | `subject` | the cell's value (§7.1) |
| VIEW | `view` | `study.view` |
| WORKSPACE | `workspace` | `workspaceLabel(study)` |
| FOLDER | `folder` | `folderLabel(study)` |
| DATE | `date` | `addedAt` |
| STATUS | `status` | rank: Processing 0 · Needs review 1 · Segmented 2 · Reviewed 3 |

The status compared is the one the row shows, running included (`buildRow`'s rule), so the sort is
what the eye sees. Rules copied from `sortParameters`: text compares case-insensitively; an em dash
(absent value) sorts last in **both** directions; ties keep the incoming order, so a stable sort
never shuffles the list.

### 6.3 The header row

Each header cell takes the grid's control: a `<button class="param-sort">` carrying the label and
the ▴/▾ mark, `aria-sort` on the cell, `data-find-key="sort-<key>"` for focus restore. Clicking the
active key flips the direction; clicking another key sorts ascending by it (the grid's `toggleSort`
rule, one function shared or copied verbatim). The STUDY header keeps the select-all box before its
button, as the grid's does. The trailing actions header stays empty.

### 6.4 Where the logic lives

`renderer/data/find.js`, new and pure: `DEFAULT_FIND_SORT`, `statusRank(status)`,
`sortFindRows(studies, sort, runningId)`. Unit-tested. `screens/studies.js` sorts the filtered rows
before building the table; the ids the Segment and Delete buttons run are the sorted visible order,
which is what the user is looking at.

## 7. SUBJECT

### 7.1 The column

PATIENT becomes SUBJECT. The cell shows `study.subjectId`, else the demo record's `pt`, else an em
dash. The search already covers `subjectId` (spec §9.4); nothing changes there. The DEMO pill stays
in this cell for demo rows.

### 7.2 Editing in place

On a real row the SUBJECT cell is an editor. A **single click** on the cell opens it: an `<input>`
pre-filled with the stored subject, text selected, `aria-label` `Subject for <study name>`. The click
stops at the cell so the row underneath does not open — the rule the tick and the trash button
already follow. Double-click was considered and rejected: the row opens the study on the *first*
click of a double-click, so the second would land on the Analysis screen.

| Key | Effect |
|---|---|
| Enter | commit, then open the next real row's SUBJECT cell (so a column is typed straight down) |
| Tab / Shift+Tab | commit and move focus as the browser would |
| Escape | discard, restore the stored value, close |
| blur | commit |

Value rule: trimmed; empty becomes `null` (pp §7.1's `optionalText`). A commit that changes
nothing writes nothing. The write is one new-array `setState` replacing the record; the saver writes
it. Demo rows are not editable (never saved; the drawer disables them for the same reason), and
the cell has no editor affordance on them.

Affordance: on hover and on `:focus-visible` the cell shows a field outline and the title `Click to
edit subject`; an empty subject shows the em dash in the muted colour with the same outline. Not
in edit mode the cell is plain text, so the list does not read as a form.

### 7.3 Rebuild safety

The table rebuilds on every keyed store change — a batch's count moving, a run ending, a toast is
not one but a tick is. While a cell is being edited the rebuild must re-create the editor with the
text typed so far and restore focus and caret, so a batch finishing mid-word loses nothing. The
editing row's id and its draft live at module scope beside `confirmingId`, are read into the draft
before the rebuild and are part of the rebuild key. The commit itself is deferred with
`queueMicrotask`, as the name field and the drawer already do, because Chromium fires the input's
change while the node may be mid-replacement and `setState` notifies synchronously.

## 8. Reviewed

### 8.1 The record

`reviewedAt: string | null` — an ISO timestamp, optional, default `null`, listed in `validateStudy`
(a value that is not a parseable date is dropped with a console warning rather than failing the
record, the film-date rule). No `STORE_VERSION` bump. Demo records carry `null`.

### 8.2 The status

`deriveStatus(study)`:

| Status | Condition |
|---|---|
| `proc` — Processing | no measurements (or, in `buildRow`, currently running) |
| `ok` — Reviewed | measurements and `reviewedAt` set |
| `rev` — Needs review | measurements, not reviewed, `reviewReasons` non-empty |
| `seg` — Segmented | measurements, not reviewed, no reasons |

`statusLabel('ok')` is `Reviewed`. A new badge class `badge-ok`: the completed state, so it is the
sage of `badge-seg` at full strength with light text, where Segmented stays the tint before it. The
exact treatment is the plan's, checked at the human gate.

`reviewReasons` and `landmarkReviewReasons` are unchanged. The Measurements panel keeps showing the
QC warnings after a review: they are facts about the segmentation, not a to-do list, and hiding
them would hide the reason the study was worth a look.

### 8.3 Marking, on the Analysis screen

- **The control** sits in `.analysis-actions` beside Export CSV: `Mark reviewed`, a `.btn.btn-small`
  with `aria-pressed`. Once marked it reads `Reviewed · Sep 10, 2026` and a second click unmarks
  (title `Unmark reviewed`). One button, one toggle.
- **The header** gains the list's status badge, to the left of FEMORAL FIT CONFIDENCE, so the screen
  says what the row says. It reads Processing while this study's run is in flight, exactly as the
  row does.
- **Disabled, with a visible note beside it** (the Parameters bar's pattern, since Chromium shows no
  tooltip on a disabled control): a demo study (`Demo studies are not saved`); no measurements
  (`Nothing to review yet`); this study's run in flight; a measurement draft pending (`Wait for
  measurements to finish updating`).
- Marking writes `reviewedAt: new Date().toISOString()`; unmarking writes `null`. One new-array
  `setState`; the saver writes it.

### 8.4 The clearing rule

**The mark survives only edits that leave the numbers alone** — the name, the subject, the
timepoint, the film date, the view label, clinical values. It is cleared by every commit that
replaces `measurements`, `geometry` or `calibration`:

1. the run commit in `segmentStudy` (`renderer/screens/analysis.js`), interactive or batch;
2. the correction commit in `renderer/viewer/measure-queue.js` (`writeStudy`);
3. RESET TO PREDICTION in `renderer/components/viewer.js`;
4. the two calibration writes in `renderer/calibration.js` (`{ ...study, calibration }`), because
   disc heights follow the scale.

Otherwise `Reviewed` would sit over numbers that changed after the review, which is a fabricated
status. The clearing is done **on the write**, not derived, so each site is a one-line
`reviewedAt: null` with its own test, and a record read back from disk needs no reconciliation.

## 9. Demo studies toggle — development builds only

- **Settings** (the sidebar's settings blocks) gains a `DEMO STUDIES` row with `Show` / `Hide`, the
  same `model-choice` button pair the crop localizer uses. The row is built **only when
  `demoStudiesAllowed()` is true**, which the main process sets from `!app.isPackaged`: an installed
  build never renders it. This is the user's explicit requirement.
- **IPC.** `hide-demo-studies` becomes `set-demo-studies-hidden(hidden: boolean)`. The handler
  writes `{ ...preferences, hideDemoStudies: hidden }` to `library-preferences.json` and **refuses
  without writing when `app.isPackaged`**, a second gate so the preference cannot be set in an
  installed build even by a stray call. `preload.js` and `renderer/api.js` follow the rename.
  `demo-studies-hidden` (the read) is unchanged, and so is the boot rule in `renderer/main.js`.
- **Hide** writes the preference, then removes the demo records from `state.studies` in one
  `setState` that prunes their ticks and closes an open demo study — what delete-all did for them.
  **Show** writes `false`, then appends the nine compiled-in records (`merge(real)` order: real
  first, demos after). Both refuse while `running`, `batch` or `deletingStudies` is set, with the
  Settings block's existing `busy` treatment.
- The ROADMAP §5 item "Hiding the demo studies is one-way" closes.

## 10. Summary line

`{n} STUDIES · {m} UNSEGMENTED · {k} TO REVIEW`, k counting rows whose derived status is `rev` over
the whole library, running included, the way m is counted. Always present, `0 TO REVIEW` included,
as `0 UNSEGMENTED` is today.

## 11. Decisions

Rulings by the user, 2026-09-10, at the brainstorm:

1. **Filters stay as the Workspace and Folder selects**, shared with the grid (batch decision 4
   stands). Header filtering is deferred, to be planned for both tabs together (ROADMAP).
2. **Every column sorts**, consistent with the Parameters grid.
3. **Delete acts on the ticked visible rows**, never falls through to "all visible", and never
   touches a demo. (Presented; not objected to.)
4. **PATIENT becomes SUBJECT and is editable in place on the Find tab**, so a column can be
   corrected without opening each study. Single click, not double, for the reason in §7.2.
5. **Demo hiding moves to a Settings toggle, development builds only.** The user: "I do NOT want
   this in the installer."
6. **No bulk "Mark reviewed" from the list.** Agreed as a deliberate hold-back.

Assumptions made where the user gave no ruling, each reversible in a line:

7. **The review mark is cleared by every numbers-changing commit, calibration included** (§8.4).
   The conservative reading; a stale `Reviewed` is the worse failure.
8. **No `Reviewed` column in the CSV exports** (§4).
9. **The summary line gains `TO REVIEW`** (§10) — one clause, no decision worth a question.
10. **Enter in a SUBJECT cell commits and opens the next row's** (§7.2) — the bulk-entry path the
    user asked for. If it surprises, Enter can commit and stay.

## 12. Amendments this forces

**Architecture contract** (`plans/2026-08-31-00-architecture-contract.md`):

- `renderer/data/status.js`: `deriveStatus → 'seg'|'rev'|'proc'|'ok'`; `statusLabel` gains
  `'Reviewed'`; the precedence table of §8.2.
- The Study record: `reviewedAt: string|null` beside `subjectId`, `timepoint`, `filmDate`, on the
  same optional-null terms.
- Store state: `findSort` beside `paramSort`.
- New module `renderer/data/find.js` (§6.4).
- `renderer/data/delete-studies.js`: `deleteStudyBatch(studies, { deletePrediction })`.
- IPC: `hide-demo-studies` → `set-demo-studies-hidden(hidden)`, packaged builds refuse.

**Spec** (`2026-08-31-spine-contour-ui-redesign-design.md`): §9.4 — columns `STUDY, SUBJECT, VIEW,
WORKSPACE, FOLDER, DATE, STATUS`; sortable headers; the filter bar carries Delete; the summary's
third clause; the library-level Delete all row is gone. §13.1 — the status table gains `Reviewed`,
and "derived, not stored as an independent fact" becomes "derived from the record, the review mark
included; the mark is cleared on every numbers-changing write".

**Batch spec** (`2026-09-08-batch-segmentation-design.md`): §7.1 — the bar gains Delete; decision 4
unchanged.

**Pre-op/post-op spec** (`2026-09-06-preop-postop-organisation-design.md`): §9 — the subject is
editable on the Find list as well as in the drawer.

**HANDOFF**: the reconcile ruling "Delete all studies is kept as his feature, mounted
library-level" is superseded by §5 and §9; note it in the reconcile summary rather than rewriting
it.

**ROADMAP**: add header filtering for both tabs (with the §4 reasoning and the per-column table
from the brainstorm: checklists for VIEW, WORKSPACE, FOLDER, STATUS; sort-only for the text and date
columns); close "Hiding the demo studies is one-way"; close the parts of "Bulk-delete polish" that
the removal of delete-all makes moot and keep the ones that still apply to the row delete.

## 13. Testing and gates

Baseline on `6106463`: `node --test test/*.test.js` 479/479.

**Unit (`node --test`), pure modules:**

- `test/find.test.js`: every key ascending and descending; em dash last both ways; ties keep order;
  the status rank includes running; the default sort.
- `test/status.test.js`: `ok` beats `rev` and `seg`; `proc` beats `ok` (no measurements, a stale
  mark); `statusLabel('ok')`.
- `test/persistence.test.js`: `reviewedAt` round-trips; a non-date is dropped with a warning; absent
  reads `null`.
- `test/delete-studies.test.js`: real targets only; the demo branch is gone.
- `test/measure-queue.test.js`: `writeStudy` clears `reviewedAt`.
- `test/studies.test.js`: `newStudy` carries `reviewedAt: null`; `matchesQuery` unchanged.

**Smoke (`tools/smoke/`), DOM:**

- `smoke-studies.mjs`: the header reads `STUDY, SUBJECT, VIEW, WORKSPACE, FOLDER, DATE, STATUS`
  (sort marks stripped, as the grid's check does); clicking STATUS then DATE reorders the rows as
  §6.2 says; the SUBJECT cell opens on click, Enter commits and the next row's opens, the record
  carries the value, Escape restores; tick two rows → `Delete 2 selected` → prompt → confirm → toast,
  rows gone, ticks pruned, the search untouched; the summary matches
  `/^(\d+) STUDIES · (\d+) UNSEGMENTED · (\d+) TO REVIEW$/`.
- `smoke-persist.mjs`: a subject edited on Find and a `reviewedAt` set on Analysis survive a restart.
- An Analysis check: `Mark reviewed` on a segmented study flips the header badge and the row badge;
  a landmark correction clears it.
- Settings in the scratch profile (a development launch): Hide removes the nine, Show restores them,
  the preference file reads back.

**Human gate** (the DOM pieces, plainly): the bar's layout with both buttons; the header affordance
and mark; the in-place editor's feel, including Enter-down and a batch finishing mid-edit; the
Analysis controls and badge; and, at the next preview installer, that Settings has no demo row and
`library-preferences.json` is never written.

## 14. Open questions

- The `badge-ok` treatment (§8.2) — settled at the gate, not here.
- Whether Enter should move down (§11.10).
