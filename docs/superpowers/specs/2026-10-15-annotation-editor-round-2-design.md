# Annotation editor round 2: a comment on the record, the Hand-placed status, REVERT per level — design

**Status:** approved in conversation 2026-10-15; this document is the written spec. Branch
`worktree-annotation-round-2` in the worktree `.claude/worktrees/annotation-round-2`, off `origin/main` @ `06c8cdd`
(v1.1.1, the merge of PR #64). Nothing here is implemented.

**Builds on:** the vertebral level editor and the label record (released as v1.1.0 and v1.1.1; handoff
`docs/design/level-editor/HANDOFF.md`, plan `plans/2026-10-10-level-editor.md`, user doc `docs/level-editor.md`), the
Failed status (`specs/2026-10-01-failed-status-port-design.md`, "the port spec") and the review mark
(`specs/2026-09-10-studies-table-review-design.md` §8). The binding architecture contract is
`plans/2026-08-31-00-architecture-contract.md` ("contract"). Its companion is
`specs/2026-10-15-annotation-bundle-export-import-design.md` ("the bundle spec"), which carries the comment across
libraries; the two are built in this order.

---

## 1. Problem

Three gaps in the editor, each raised by the owner on 2026-10-15:

1. **Nothing in the annotation says why.** The label record (`<userData>/labels/<stem>.label.json`) holds geometry and
   states only. An annotator who sees a sacralised L5, hardware over L4 or a film too dark at T1 has nowhere to say
   so, and the trainer reading the record later cannot know. The study record's `note` is a library field read from
   the film's name, not part of the annotation.
2. **A failed film placed by hand stays Failed.** Editing works on a failed film (handoff §11: "the main case the
   feature exists for"), but the record keeps `processingError`, so the film reads Failed, sorts first and Mark
   reviewed is disabled with `Rerun segmentation after the failed attempt`. This is the open ruling R24 (plan Task 15,
   ROADMAP §8). A film that was never run and then placed by hand reads Segmented or Needs review, so the same
   annotator result reads two different ways depending on history.
3. **One edit cannot be undone on its own.** RESET TO PREDICTION returns every level to the model's output and
   Discard returns every level to the baseline. A level the annotator moved by mistake can only be dragged back by
   eye, or reset with every other level.

## 2. Decisions

User rulings (2026-10-15) are marked.

E1. **One comment per film, in the record, shown outside edit mode too** (user). A free-text comment typed in the
    Vertebral levels panel and written into the label record as `comment`. The Analysis panel shows it read-only when
    the study has one. Not per level.
E2. **A status of its own, Hand-placed, for any annotator result** (user). A real study whose result no model
    produced reads `Hand-placed`, whether its run failed first or never ran. The first hand-placed commit clears the
    failure, as a successful run does, so a later failed re-run reads Failed again. It sorts after Needs review and
    before Segmented, counts as TO REVIEW, and Mark reviewed turns it Reviewed. R24 closes with this.
E3. **REVERT next to the level** (user). A per-level control in the row's action column that returns an Edited level
    to the model's geometry.
E4. **Two specs, the editor first** (user). This document and the bundle spec; this one is built and gated first.
E5. **Where the comment lives twice** (planner). The record's `comment` is the training copy; the study record's
    `labelComment` is the display copy, so the Analysis panel and the Find search read it without a disk read. Both
    are written by the same save, the record first. *Cost if wrong:* a save whose record write succeeds and whose
    store write is lost leaves the panel a save behind; the next Save edits rewrites both.
E6. **The failure is cleared in the measure queue's own write** (planner), not by a second `setState`: the level
    editor's commit carries a flag and the write that puts the measurements on the record nulls the failure in the
    same patch. The film never reads Unsegmented between the two. *Cost if wrong:* none visible; see §4.3.
E7. **REVERT sets `source` back to `model`** (planner), as RESET TO PREDICTION does through a fresh open, so a
    reverted level's record entry is indistinguishable from one never touched. *Cost if wrong:* a record cannot say
    "the annotator looked and agreed"; `edits` and `edited_points` carry nothing for it either way.

## 3. The comment

### 3.1 The record field

`comment` joins the label record as an optional field: a string, or `null`. The writer trims it and writes `null`
for an empty or whitespace-only text. It is added to `label-record.schema.json` under the current schema id
`spinecontour.segmentation-label/1`, optional and nullable, exactly as `edits` and `edited_points` were (ruling R39):
a record written before this spec has none and reads as no comment; a record written by this spec validates against
the amended schema; `label-record.example.json` gains one. Nothing truncates a comment read from disk. The editor's
text box caps new text at 2,000 characters (its `maxlength`).

### 3.2 The study field

`labelComment` joins the study record (`studies.json`) on the optional-null terms of `note` (`optionalText` in
`renderer/data/persistence.js`, listed in `validateStudy`'s return so it survives a reload; no `STORE_VERSION` bump).
`newStudy` sets it `null`. It is written by exactly two paths: Save edits (§3.5) and the bundle spec's import. It is
not cleared by a re-run, a Region change or Unmark reviewed, since the record file stays through all three
(`labelFile` is not cleared by them today, and the comment belongs to the record). A delete removes the study and the
record together.

### 3.3 The editor model (`renderer/data/levels.js`)

The editor object gains two strings, `comment` and `savedComment`.

- `openEditor({ study, region, modelGeometry, saved })` takes `saved.comment` (the record's, read by a new
  `recordComment(record)` in `data/label-record.js`: a string trimmed, else `''`) when a record exists; otherwise the
  study's `labelComment ?? ''`. `savedComment` is the same value. (A study whose record is missing but whose
  `labelComment` is set, as after an import that lost the file, still shows its comment.)
- `setComment(editor, text)` returns the editor with `comment: String(text)`. It never touches levels, placing, the
  handle or the selection.
- `commentChanged(editor)` is `comment.trim() !== savedComment.trim()`.
- `unsavedCount(editor)` adds one to the level count while `commentChanged`. So `unsavedText`, `canSave`, the footer's
  count, the exit prompt and the stash (which keeps the whole editor) all follow it with no further change.
- `markSaved(editor, file)` also sets `savedComment: comment.trim()` and `comment: comment.trim()`.
- `revertToBaseline(editor)` (Discard) also sets `comment: savedComment`.
- `resetLevelsToModel` leaves both alone: the reset is about geometry (D14).

### 3.4 The panel (`renderer/components/level-editor.js`)

The footer gains a comment block above the training-label status line: a mono label `COMMENT` (the panel's
`mono-section` style, `muted`), then a `<textarea>` of three rows, `maxlength` 2000, full panel width, resizable
vertically only, with the placeholder `Anything the next reader or the trainer should know about this film.` and
`aria-label` `Comment on this film's annotation`. `data-level-key` is `comment`.

Requirements, in order of weight:

1. **Typing never loses the caret.** The panel rebuilds its DOM on every editor change. The text box is one node
   created when the panel mounts and reattached on every rebuild, and its value is set from `editor.comment` only
   while it is not the focused element. The panel's rebuild key carries `commentChanged(editor)` (a boolean), not the
   text, so typing rebuilds the panel once when the comment first differs from the saved text and once when it
   returns to it, never per keystroke.
2. **The count and Save edits follow each keystroke.** Each `input` event calls the wiring's `setLevelComment(text)`,
   which runs `setComment` through `update` with `edit: true, commit: false`: an edit, no `/measure`. The footer's
   `N UNSAVED CHANGES` and the Save button's state are right after the rebuild the boolean triggers.
3. **Keys typed in the box never reach the stage.** Tab, Shift+Tab, the arrows, Escape and letters move the caret or
   leave the box; they never cycle handles, nudge a point, cancel a placement or close the W/L panel. The plan verifies
   where the viewer's key handlers listen and scopes them away from the text box if they are on `document`.
4. **Focus after a rebuild** uses the existing rule (the same `data-level-key` first): a rebuild while the box is
   focused leaves focus in the box with its selection intact, since the node is the same.
5. The exit prompt (D7 of the level editor plan) replaces the footer's action row as today; the comment block stays
   above it so the text being kept or discarded is visible while the prompt asks.

Demo studies: the box works for the session and the existing `Demo studies are not exported` note stands; nothing is
written.

### 3.5 Writes

- **Save edits** (`saveLevelEdits` in `renderer/level-editor.js`): `toLabelRecord` takes `editor.comment` and writes
  `comment` (trimmed, or null) after `edits` and before `levels`. The `setState` patch that records `labelFile` on the
  study also sets `labelComment` to the same trimmed-or-null value, in one patch. The toast is unchanged: `Saved N
  edits to the label record.` counts the comment as one of the N when it changed; `Saved the label record.` for a
  first save with nothing changed.
- **Mark reviewed** (`writeReviewRecord`): the editor built in memory takes `comment` from the study's `labelComment`,
  so the zero-change record carries the study's current comment, usually none, and `labelComment` is not touched.
- **Discard**: the box returns to the saved text with the levels.

### 3.6 Outside edit mode

- **The Analysis panel** (`renderer/screens/analysis.js`): a block `analysis-comment` under the actions row and above
  the measurements host, shown only while the open study's `labelComment` is a non-empty string: a mono label
  `COMMENT` and a `<p>` with the text, `white-space: pre-wrap`, read-only. It is hidden in edit mode with the tabs
  and the actions row, where the editable box takes over. `labelComment` joins the screen's rebuild key.
- **The Find list**: `labelComment` joins the fields the search text is built from (`screens/studies.js`
  `searchText`), so a comment is searchable. No column.
- **The CSV exports** are unchanged; the comment is annotation, not a measurement.

## 4. The Hand-placed status

### 4.1 Derivation (`renderer/data/status.js`)

`deriveStatus` gains one line, first-match order kept:

```
if (study.processingError) return 'fail';
if (study.measurements == null) return 'unseg';
if (isReviewed(study)) return 'ok';
if (study.source === 'real' && isHandPlaced(study)) return 'hand';
return reviewReasons(study).length ? 'rev' : 'seg';
```

`isHandPlaced` is `data/predictions.js`'s existing test (no prediction id and no `qc.models`, R16). The real-study
guard is load-bearing: demo studies have neither field and must keep reading Segmented. A marked hand-placed film
reads Reviewed; a failed re-run over it reads Failed. `displayStatus` and `reviewBlockedReason` are unchanged.
`statusLabel('hand')` is `Hand-placed`. The JSDoc unions on `deriveStatus` and `displayStatus` gain the key.

### 4.2 Surfaces

| Surface | Change |
|---|---|
| Sort (`data/find.js` `STATUS_RANK`) | `fail 0, proc 1, unseg 2, rev 3, hand 4, seg 5, ok 6` |
| Summary (`summaryCounts`) | `hand` counts in TO REVIEW |
| Pill (`styles/components.css`) | `.badge-hand`: Needs review's terracotta tint (`--accent` at 14%) and text, with Unsegmented's hollow dot. The rule the hollow dot carries since the port spec: no model ran. |
| Analysis header pill, Find list pill, sidebar card | nothing: they call `statusBadge` with the key |
| Tooltips | none; `failureTitle` is the Failed pill's alone |

### 4.3 Clearing the failure

The level editor's commit path is `sync` in `renderer/level-editor.js` → `deps.commitGeometry(studyId, geometry)`
→ the viewer's measure queue (`renderer/viewer/measure-queue.js`) → `/measure` → `writeStudy`. It becomes:

- `commitGeometry(studyId, geometry, { clearFailure })`, the third argument new and optional. `sync` passes
  `clearFailure: isHandPlaced(study)` for the study it commits: a film with no model result. A landmark drag on a
  model result (the viewer's own commits) passes nothing, so a failed re-run over old numbers still reads Failed
  (port spec P6).
- The queue carries the flag through its debounce and coalescing: a study's pending commit is `true` once any
  coalesced commit set it.
- `writeStudy` adds `processingError: null, processingErrorAt: null` to its patch when the flag is set, beside the
  measurements, geometry, `reviewedAt: null` and qc it writes today. One `setState`; no intermediate status.
- A `/measure` error writes nothing, so the film stays Failed; the next commit tries again.

After the clear the film has measurements and no failure: `deriveStatus` reads `hand`, the header's `Last run failed`
note and the FAILED card go with the pill, and `reviewBlockedReason` returns null, so Mark reviewed enables. A film
whose projection measures nothing (a cervical reading with no anterior side, R7, which is not committed) stays Failed
until something is committed. This is a third clearing site beside the two the port spec names (a successful run,
`changeRegion`); §8 amends it.

### 4.4 What does not change

Batches still include Failed films. The relocate flow still clears nothing. Unmark reviewed on a hand-placed film
returns it to Hand-placed. A successful re-run makes it a model result again, keeping its record (the levels then
compare to the new model, as today).

## 5. REVERT per level

### 5.1 The model (`renderer/data/levels.js`)

`revertLevel(editor, code)`: a no-op unless `levelState(entry, editor.model[code]) === 'edited'` and no placement is
running for `code`. Otherwise the entry's `geometry` becomes a copy of `editor.model[code]` (point arrays copied; a
femoral head takes the model circle's `center` and `radius` with `rim: null`) and its `source` becomes `model` (E7).
`visible`, the selection and the focused handle stay (the handle names a point that still exists). Nothing else on
the editor changes. The level then reads Segmented, by the same `sameGeometry` test that made it Edited.

### 5.2 The wiring (`renderer/level-editor.js`)

`revertPlacedLevel(code)` runs `revertLevel` through `update` with `edit: true` (the default commit), so the geometry
reaches the study through `/measure` like a handle drag and the measurements follow. The busy guard that covers the
other level actions covers it. The unsaved count needs nothing: reverting an unsaved edit returns that level to its
baseline and the count falls; reverting an edit that was saved makes the level differ from its baseline and the count
rises. Save edits then writes it.

### 5.3 The panel (`renderer/components/level-editor.js`)

In `levelRow`, `canRevert = !placing && state === 'edited'`. The action column shows a mono text button `REVERT`
(the CLEAR and CANCEL style, `lv-text-btn`), `data-level-key` `revert:<code>`, `aria-label` and `title` `Revert <full
name> to the model's output`, `onClick` `revertPlacedLevel(code)`. An edited femoral head shows Place… and REVERT
stacked, Place… above, in the same 70 px (`is-stacked`, ruling R18's layout). A level being placed shows CANCEL
alone, as today. After the click the level reads Segmented, the button is gone, and the existing focus rule lands on
the nearest control that stands (the row's select button).

### 5.4 Stage and record

The dashed model ghost (handoff §5) is drawn for an edited level only, so it disappears with the revert. On save the
level writes `state: segmented`, `edited_points: []`, `model_corners` (or `model_centroid`, `model_circle`) `null`, and
a body level takes its `contour` from the mask again (ruling R10: the contour is written while the level is the
model's).

### 5.5 The rule it amends

Handoff §2 "Segmented vertebral levels can't be redone individually" keeps its meaning for Place…, re-run and Reset:
the model's output is not re-done one level at a time. It gains: an **Edited** level can be returned to the model's
output one level at a time with REVERT. Manual levels have nothing to revert to and keep CLEAR.

## 6. Stored fields

| Where | Field | Type | Written by | Read by |
|---|---|---|---|---|
| label record | `comment` | string or null, optional | Save edits, Mark reviewed's zero-change record | `openEditor` through `recordComment`; the bundle spec's import |
| study record | `labelComment` | string or null, default null | Save edits (with `labelFile`), the bundle spec's import | the Analysis panel's comment block, the Find search, `openEditor`'s fallback, `writeReviewRecord` |
| editor | `comment`, `savedComment` | strings | `openEditor`, `setComment`, `markSaved`, `revertToBaseline` | `unsavedCount`, the panel, `toLabelRecord` |
| status | key `hand` | `Hand-placed` | `deriveStatus` | every surface through `statusLabel`, `STATUS_RANK`, `summaryCounts`, `.badge-hand` |
| study record | `processingError`, `processingErrorAt` | unchanged | now also nulled by the measure queue's write when the commit carries `clearFailure` | unchanged |

## 7. Testing

Unit (`node --test test/*.test.js`, baseline 975/975 on `06c8cdd`):

- `levels.test.js`: `setComment`, `commentChanged`, `unsavedCount` with a comment change alone and with levels,
  `markSaved` trimming, `revertToBaseline` restoring the comment, `resetLevelsToModel` leaving it; `revertLevel` on
  each kind including a femoral head (rim null, `source: model`), its no-ops (segmented, manual, not placed, not
  visible, while placing), and the Segmented state after it.
- `label-record.test.js`: `comment` written trimmed or null, read back by `recordComment`, absent on a record written
  before; the fixture check (`test/fixtures/schema-check.js`) over the amended schema and example.
- `persistence.test.js`: `labelComment` round-trips, blank becomes null, a non-string is dropped.
- `status.test.js`: `hand` for a real hand-placed study with measurements; not for a demo, not with a failure, not
  once reviewed; `statusLabel`; `find.test.js`: the rank order and the summary.
- `measure-queue.test.js`: the flag nulls both failure fields in the same patch as the measurements; absent, it leaves
  them; coalescing keeps it.
- `level-editor-wiring.test.js`: `sync` passes `clearFailure: true` for a hand-placed study and nothing for a model
  result; Save edits' patch sets `labelComment` with `labelFile`; `writeReviewRecord` carries the study's comment.
- `analysis.test.js`: the comment block in the rebuild key and its hidden rule.

Smoke (`tools/smoke/smoke-levels.mjs` on a fresh `%TEMP%` profile with synthetic films, DOM, store and file reads only;
never a screenshot with a film on screen): new sections for the comment (type, count 1, Save, reopen, the record's
`comment`, the Analysis block, Discard), REVERT (drag L4, badge Edited, REVERT, badge Segmented, ghost gone, count,
save writes `segmented` with a contour), and the hand-placed film (`SP-9301`: Failed before, Hand-placed after the
first commit with `processingError` null in the store, sorts after Needs review, TO REVIEW counts it, Mark reviewed
enabled and turns it Reviewed, a failed re-run reads Failed). Existing sections that assert Failed after hand
placement (section 17) are updated to Hand-placed.

The human gate (the owner's test before any push, PR or release): the three features on real films from the
workstation's films folder, on a `%TEMP%` profile, with `TESSERACT_CMD` at the installed app's bundled OCR.

## 8. Amendments this forces

- `docs/design/level-editor/HANDOFF.md`: §2 rules (REVERT), §3 panel footer and row actions, §6 interactions
  (REVERT, the comment), §9 fields (`comment`), §11 "Segmentation failed entirely" (the status), §12 the decisions
  E1–E7 above as the 2026-10-15 set.
- `docs/design/level-editor/label-record.schema.json` and `label-record.example.json`: `comment`.
- `docs/level-editor.md`: the panel, REVERT, the record's fields, "Films with no result" (Hand-placed replaces the
  R24 paragraph).
- `docs/ROADMAP.md` §8: the R24 item struck through with the ruling; the deferred-minor list unchanged.
- `specs/2026-10-01-failed-status-port-design.md` P6: a third clearing site, the hand-placed commit.
- `specs/2026-09-10-studies-table-review-design.md` §8.2: the status list gains Hand-placed between Needs review and
  Segmented.
- The contract: `renderer/data/status.js`'s status union, `persistence.js`'s field list, the measure queue's
  `commitGeometry` signature, the level editor's new exports.
- `CLAUDE.md` first paragraph, `docs/superpowers/HANDOFF.md` first section, the plan's Ledger.
- A release note under `docs/releases/` when the owner picks the number (a minor, 1.2.0, is the suggestion).

## 9. Risks

- **Caret loss while typing** (§3.4 requirement 1) is the one place this spec touches the panel's rebuild model. If the
  node cannot be kept across rebuilds, the fallback is to commit the comment on `change` (blur) and on Save, Discard
  and exit, reading the live box; the count then updates on blur rather than per keystroke. The plan decides after
  reading `mountLevelEditor`'s rebuild.
- **Stage shortcuts reaching the box** (requirement 3) would nudge a handle while typing an arrow. The plan checks the
  listeners before building the box.
- **A pre-v1.0.10 result** with `qc.models` but no prediction id is a model result (R16) and reads Segmented or Needs
  review; a very old record with a sidecar but neither field reads Hand-placed, the same edge R16 already names.
- **The hollow terracotta dot** may read too close to Needs review at a glance; the word is on every pill (handoff
  §10), and the gate can pick another tint.
