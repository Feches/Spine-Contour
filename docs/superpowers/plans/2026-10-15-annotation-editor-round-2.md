# Annotation Editor Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A comment on the label record, a `Hand-placed` status for annotator results that clears a film's failure on
its first hand-placed commit, and a per-level `REVERT` that returns an Edited level to the model's output.

**Architecture:** Three pure-model changes (`data/status.js` and `data/find.js`; `data/levels.js` and
`data/label-record.js`; `viewer/measure-queue.js`) carry the rules, each with `node --test` coverage. The level
editor's wiring (`renderer/level-editor.js`) gains three exports (`revertPlacedLevel`, `setLevelComment`, a
`clearFailure` flag on its commits) and two patches (`labelComment` on save). The panel (`components/level-editor.js`)
adds a REVERT button and a persistent comment box; the Analysis screen adds a read-only comment block. The smoke suite
on a scratch profile verifies the DOM, by DOM, store and file reads only.

**Tech Stack:** Vanilla ES modules, no bundler, no runtime dependencies. `node --test` for pure logic. The CDP smoke
harness in `tools/smoke/` for DOM behaviour. Electron 44 (Node 24).

**Spec:** `docs/superpowers/specs/2026-10-15-annotation-editor-round-2-design.md` (decisions E1–E7; "the spec"
below). Its companion `specs/2026-10-15-annotation-bundle-export-import-design.md` is built after this plan, from its
own plan. The level editor's handoff is `docs/design/level-editor/HANDOFF.md`, its plan
`plans/2026-10-10-level-editor.md` (decisions D1–D20, rulings R1–R45), its user doc `docs/level-editor.md`. The
binding architecture contract `plans/2026-08-31-00-architecture-contract.md` wins over this plan; Task 8 amends it.

## Global Constraints

Carried from the level editor plan and `CLAUDE.md`; every task's requirements include these.

- **Never display a fabricated measurement.** Absent values render `—` (U+2014), never `0`, never a guess.
- **Never mutate the store's geometry, a Study record or the level editor state in place.** Every change builds a new
  object; the viewer's reference-keyed redraw gates and the panels' rebuild gates compare by reference.
- **All stage pointer and keyboard wiring lives in `renderer/components/viewer.js`.** `renderer/viewer/*.js` and
  `renderer/data/*.js` are pure logic with `node --test` coverage and contain no DOM code.
- **Subscribers never call `setState`.** `update()` functions only write DOM; every store write comes from an event
  handler or an async continuation. The panel's handlers call the wiring module's exports, never `setState`.
- **`renderer/level-editor.js` is the only writer of `state.levelEditor`.**
- **No bundler, no framework, no runtime dependencies.** `package.json` `dependencies` stays empty; `devDependencies`
  stays exactly `electron` and `electron-builder`. No JSON Schema library: the checker is `test/fixtures/schema-check.js`.
- **Do not loosen the CSP.** No new stylesheet file: new rules go in `styles/screens/analysis.css` (section
  `05 — LEVEL EDITOR` for the panel; the Analysis panel section for the read-only block) and `styles/components.css`
  (the badge). Colours come from `styles/tokens.css` variables, never hex.
- **`renderer/` is browser code**: no `node:` imports. This plan adds no root module and no IPC channel.
- **`el()` assigns to the property when the key exists on the node.** Pass real booleans (`disabled: false`), property
  names for properties (`maxLength`, `rows`), never `style` or `list` as an `el()` prop. Handlers use its `on*`
  convention (`onClick`, `onChange`; `onInput` for the comment box, checked against `renderer/dom.js`).
- **The panel's rebuild key must list every field it reads** (`mountLevelEditor`'s `key` array) and nothing it does
  not: the comment's text is NOT in it; `commentChanged(editor)` (a boolean) is.
- **Copy, verbatim** (spec §3–§5): badge `Hand-placed`; row action `REVERT`; its `aria-label` and `title`
  `Revert {full name} to the model's output`; the comment block's label `COMMENT`; the box's placeholder
  `Anything the next reader or the trainer should know about this film.`; its `aria-label`
  `Comment on this film's annotation`; the Analysis block's label `COMMENT`. Every toast is unchanged.
- **Status keys** (`data/status.js`): `'proc'|'fail'|'unseg'|'ok'|'hand'|'rev'|'seg'`; an unrecognised key renders `—`.
- **Accessibility:** every new control carries `data-level-key`; focus rings as the panel has them; state never by
  colour alone (every badge carries its word).
- **Unit tests run as `node --test test/*.test.js`** (the glob form). Baseline on `06c8cdd`: 975/975. Pure-logic
  modules get real `node --test` coverage; DOM code gets smoke checks. Never write a fake test.
- **Smoke:** `tools/smoke/smoke-levels.mjs` on a fresh `%TEMP%` profile, CDP port 9333, DOM, store and file reads only;
  **never a screenshot while a film is on screen** (the dom phase's films are synthetic; the film phase's is real).
  Run every suite in the FOREGROUND and capture its output to `tools/smoke/out/<name>.txt`; a suite that prints
  nothing has thrown. Selectors key on `data-level-key`, `data-level-row`, `data-find-key` and `data-study-id`, never
  on a visible label.
- **Running from source:** from the worktree, `npm.cmd run dev` with `SPINE_CONTOUR_USER_DATA` at a `%TEMP%` profile
  (never the real `%APPDATA%\spine-contour`), `SPINE_CONTOUR_PYTHON` at the project venv, `TESSERACT_CMD` at the
  installed app's bundled OCR. `node_modules` here is a junction to the main checkout's (made 2026-10-15). The film
  phase needs `backend/onnx/` hard-linked from the main checkout's `backend/onnx/` (as the previous worktrees did).
- **Conventional commit prefixes** (`feat:`, `fix:`, `test:`, `docs:`, `chore:`); commit after every task; every
  commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Branch:** `worktree-annotation-round-2` in the worktree
  `C:\Users\codyj\Spine Contour Desktop\Spine-Contour\.claude\worktrees\annotation-round-2`, off `origin/main` @
  `06c8cdd` (v1.1.1). Never touch the main checkout (it holds uncommitted similarity work). Push, PR and release only
  on the owner's say-so after the human gate (Task 9).
- **Subagents** (the owner, 2026-10-15): the lowest-capability model that can do each task. Implementers on Sonnet
  for Tasks 1, 2, 4, 5 and 8; on Opus for Tasks 3, 6 and 7 (DOM focus handling and the smoke suite); reviewers on
  Opus. Never the top model for a task below.

## Review Focus

Input classes the spec implies and no feature test exercises by itself; each has its test in the owning task.

1. **The first hand-placed commit's `/measure` fails.** The film must stay Failed, its failure fields untouched, and
   the next commit must clear them. (Task 2, `measure-queue.test.js`: a rejected call leaves both fields.)
2. **A label record on disk whose `comment` is not a string** (hand-edited, a number or an object). The editor must
   open with an empty comment, never throw. (Task 4, `label-record.test.js`: `recordComment` on `42` and `{}`.)
3. **A rebuild while the annotator is typing.** Another editor change (a group opened from the keyboard, a commit's
   result) rebuilds the panel; the box must keep its text, focus and caret. (Task 7, smoke section 21.)
4. **A demo study** has no prediction id and no `qc.models`, exactly like a hand-placed film; it must keep reading
   Segmented or Needs review. (Task 1, `status.test.js`: `source: 'demo'`.)
5. **REVERT on an edited femoral head** whose rim points were synthesised for the drag: the level must take the model
   circle with `rim: null` and its focused handle must still resolve. (Task 3, `levels.test.js`.)

---

## File structure

| File | Responsibility | Status |
|---|---|---|
| `renderer/data/status.js` | `deriveStatus` gains `'hand'`; `statusLabel('hand')` | modify |
| `renderer/data/find.js` | `STATUS_RANK` and `summaryCounts` know `hand` | modify |
| `styles/components.css` | `.badge-hand` | modify |
| `renderer/viewer/measure-queue.js` | `commitGeometry(studyId, geometry, { clearFailure })`; the write nulls the failure | modify |
| `renderer/level-editor.js` | `sync` passes `clearFailure`; `revertPlacedLevel`, `setLevelComment`; `enterLevelEditor` reads the record's comment; `saveLevelEdits` patches `labelComment`; `withLabelFile` takes it | modify |
| `renderer/data/levels.js` | `revertLevel`; `comment`/`savedComment`, `setComment`, `commentChanged`; `unsavedCount`, `markSaved`, `revertToBaseline`, `openEditor` amended | modify |
| `renderer/data/label-record.js` | `comment` written; `normalizeComment`, `recordComment` | modify |
| `docs/design/level-editor/label-record.schema.json`, `label-record.example.json` | `comment` | modify |
| `renderer/data/persistence.js` | `labelComment` | modify |
| `renderer/screens/studies.js` | `newStudy` sets `labelComment: null`; `matchesQuery` reads it | modify |
| `renderer/components/level-editor.js` | REVERT in the row; the comment block in the footer; `fallbackKeys` | modify |
| `renderer/screens/analysis.js` | the read-only comment block | modify |
| `styles/screens/analysis.css` | `.lv-revert` (none needed beyond `.lv-text-btn`), `.lv-comment*`, `.analysis-comment*` | modify |
| `tools/smoke/smoke-levels.mjs` | the failure on SP-9301; section 12's status checks; sections 20 (REVERT) and 21 (comment) | modify |
| `test/status.test.js`, `test/find.test.js`, `test/measure-queue.test.js`, `test/levels.test.js`, `test/label-record.test.js`, `test/persistence.test.js`, `test/studies.test.js`, `test/level-editor-wiring.test.js` | extended | modify |
| the records (Task 8) | handoff, user doc, ROADMAP, two specs, the contract, CLAUDE.md, HANDOFF, the level editor plan's Ledger, the smoke README | modify |

Boundaries: `renderer/data/status.js` imports `isHandPlaced` from `data/predictions.js` (which imports only
`data/cervical.js`: no cycle). `data/levels.js` and `data/label-record.js` import nothing new. The panel imports
`commentChanged` from `data/levels.js` and `revertPlacedLevel`, `setLevelComment` from the wiring. `screens/analysis.js`
reads `labelComment` off the open study only.

## Rulings made while planning (2026-10-15)

Made against the code; the executor does not re-decide them. Each carries what it costs if wrong.

- **P1. The real-study guard is on `deriveStatus`'s own line.** `study.source === 'real' && isHandPlaced(study)`.
  Every existing `status.test.js` fixture lacks `source`, `predictionId` and `qc.models`; without the guard they all
  flip to `hand`. *Cost if wrong:* none; the guard is the spec's.
- **P2. The queue's flag is per study, set on a commit, read and dropped at the start of `recalculate`, dropped by
  `replaceMeasured`.** Coalesced commits share one `recalculate`, so a flag set by any of them reaches the write; a
  response orphaned by a later commit loses it, and that later commit (from `sync`, which recomputes it) sets it
  again. *Cost if wrong:* a viewer-side commit orphaning the editor's on a hand-placed film could drop the clear until
  the next editor commit.
- **P3. After a save the stored editor keeps the live text.** `saveLevelEdits` sets `savedComment` from the written
  editor and leaves `comment` as the annotator has it now, so typing during the write stays unsaved (the rule the
  levels already follow). The spec's `markSaved` trims both; the stored editor takes `savedComment` only. *Cost if
  wrong:* a trailing space typed before Save survives in the box until the next save.
- **P4. The box is labelled by `aria-label`; the visible `COMMENT` is a `<span>`.** No `id`/`for` pair to collide
  across rebuilds. *Cost if wrong:* none.
- **P5. `comment` in the schema is nullable the way `model_corners` is** (the same construction, whatever it is:
  `anyOf` or a type list), so the hand-written checker keeps accepting the schema. *Cost if wrong:* a checker
  keyword the schema does not use.
- **P6. `withLabelFile(studies, studyId, addedAt, file, labelComment)`** gains a fifth, optional argument: `undefined`
  leaves the field alone (`writeReviewRecord`), a string or `null` sets it (`saveLevelEdits`). *Cost if wrong:* none.
- **P7. The smoke's hand-placed fixture (SP-9301) gains the failure** (`processingError`, `processingErrorAt`) at its
  injection, so the existing section 12 flow covers Failed → Hand-placed; sections 20 (REVERT) and 21 (the comment)
  run on SP-9300 between sections 7 and 8, where the editor is open with a saved record and nothing unsaved, and
  leave it so. *Cost if wrong:* a section after 12 that read the Failed card would need updating (none does: the
  suite never asserts `Failed`).
- **P8. The comment box survives `clear(root)` by being re-appended, and its selection is snapshotted and restored**
  around the rebuild (`selectionStart`/`selectionEnd`, `setSelectionRange`), since detaching blurs it; `restoreFocus`
  finds it by `data-level-key="comment"`. *Cost if wrong:* a caret at the end after one of the two rebuilds typing
  causes.
- **P9. The viewer's keyboard needs no change.** In edit mode `handleKeyDown` returns for any key whose target
  matches `TEXT_ENTRY` (`components/viewer.js:66`, which names `textarea`) before its Escape branch, so Escape, Tab
  and the arrows stay in the box; Escape in the box does nothing (the annotator clicks DONE). Task 7 pins it.
  *Cost if wrong:* none.
- **P10. The Analysis screen's comment block is written on every `update()`**, as the review button's text is, with
  no rebuild key of its own; the spec's `analysis.test.js` item becomes smoke section 21's check of the block, since
  the block has no pure export to unit-test. *Cost if wrong:* one `textContent` write per notification.

---

### Task 1: The Hand-placed status

**Files:**
- Modify: `renderer/data/status.js:88-95` (`deriveStatus`), `:124-133` (`statusLabel`), the two JSDoc unions
- Modify: `renderer/data/find.js:21-24` (`STATUS_RANK`), `:80-88` (`summaryCounts`)
- Modify: `styles/components.css:116-124` (after `.badge-unseg .dot`)
- Test: `test/status.test.js`, `test/find.test.js:84-90`

**Interfaces:**
- Consumes: `isHandPlaced(study)` from `renderer/data/predictions.js` (`predictionId == null && !qc?.models`).
- Produces: `deriveStatus` and `displayStatus` return `'hand'`; `statusLabel('hand') === 'Hand-placed'`;
  `statusRank('hand') === 4`; `summaryCounts` counts `hand` in `toReview`; the pill class `badge-hand`.

- [ ] **Step 1: Write the failing tests**

In `test/status.test.js`:

```js
test('a real hand-placed result reads Hand-placed until reviewed; a failure, no result, a demo and a model result do not (spec §4.1)', () => {
  const hand = { source: 'real', measurements: { PI: 60, PT: 20, SS: 40 }, geometry: {}, qc: null, predictionId: null, reviewedAt: null, processingError: null };
  assert.equal(deriveStatus(hand), 'hand');
  assert.equal(displayStatus(hand, null, null), 'hand');
  assert.equal(deriveStatus({ ...hand, reviewedAt: '2026-10-15T10:00:00.000Z' }), 'ok');
  assert.equal(deriveStatus({ ...hand, processingError: 'No spine was found on this film.' }), 'fail');
  assert.equal(deriveStatus({ ...hand, measurements: null }), 'unseg');
  assert.equal(deriveStatus({ ...hand, source: 'demo' }), 'seg', 'a demo has neither model field and must not read Hand-placed');
  assert.equal(deriveStatus({ ...hand, predictionId: 'p-1' }), 'seg');
  assert.equal(deriveStatus({ ...hand, qc: { models: {} } }), 'seg');
  assert.equal(statusLabel('hand'), 'Hand-placed');
});
```

In `test/find.test.js`, the rank test at lines 84–90 becomes `fail 0, proc 1, unseg 2, rev 3, hand 4, seg 5, ok 6`,
`'nonsense'` still `null`; and a new case in the `summaryCounts` test: a study that derives `hand` adds one to
`toReview` and nothing to `unsegmented`.

- [ ] **Step 2: Run the two files to verify they fail**

Run: `node --test test/status.test.js test/find.test.js`
Expected: FAIL — `deriveStatus` returns `'rev'` or `'seg'` for the hand study; `statusRank('hand')` is `null`;
`statusRank('seg')` is `4`.

- [ ] **Step 3: Implement**

`status.js`: import `isHandPlaced`; in `deriveStatus`, after the `isReviewed` line,
`if (study.source === 'real' && isHandPlaced(study)) return 'hand';` (P1); `statusLabel`: `'hand'` → `Hand-placed`;
the JSDoc unions on `deriveStatus` and `displayStatus` gain `'hand'`; the header comment's first-match list names it.
`find.js`: `STATUS_RANK` as above; `summaryCounts`: `else if (status === 'rev' || status === 'hand') counts.toReview += 1;`
and the comment above it. `components.css`: `.badge-hand` with `background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent);`
and `.badge-hand .dot` with Unsegmented's hollow dot (`background: transparent; border: 1.5px solid currentColor; box-sizing: border-box;`),
with a comment naming the spec and the hollow dot's rule.

- [ ] **Step 4: Run the whole suite**

Run: `node --test test/*.test.js`
Expected: PASS, 975 + the new tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/status.js renderer/data/find.js styles/components.css test/status.test.js test/find.test.js
git commit -m "feat: a Hand-placed status for a real study whose result no model produced"
```

---

### Task 2: The first hand-placed commit clears the failure

**Files:**
- Modify: `renderer/viewer/measure-queue.js:11-14` (state), `:44-75` (`recalculate`), `:98-108` (`commitGeometry`), `:112-121` (`replaceMeasured`)
- Modify: `renderer/level-editor.js:123-130` (`sync`), the JSDoc on `configureLevelEditor` (`:52`)
- Test: `test/measure-queue.test.js`, `test/level-editor-wiring.test.js` (`wire()` at `:63-75`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `commitGeometry(studyId, geometry, { clearFailure = false } = {})`; a write that carries the flag also
  sets `processingError: null, processingErrorAt: null`. `sync` calls it with `{ clearFailure: isHandPlaced(study) }`.

- [ ] **Step 1: Write the failing tests**

In `test/measure-queue.test.js`, with the harness's studies given `processingError: 'boom', processingErrorAt: '2026-10-10T08:00:00.000Z'`:

```js
test('a commit with clearFailure nulls both failure fields in the same patch as the measurements', ...);
  // commitGeometry('A', geometryWith(1), { clearFailure: true }); tick(30); resolve → study('A').processingError === null,
  // processingErrorAt === null, measurements deepEqual the response's, geometry the response's — one setState (count the harness's setState calls).
test('without the flag both fields stay', ...);                 // commitGeometry('A', g) → both still set after the write
test('a rejected /measure leaves both fields and the next flagged commit clears them', ...);   // Review Focus 1
test('coalesced commits keep the flag any of them set', ...);   // flagged then unflagged before the debounce fires → one call → cleared
test('replaceMeasured drops the flag', ...);                     // flagged commit, replaceMeasured, unflagged commit → the write leaves 'boom'
```

In `test/level-editor-wiring.test.js`, `wire()`'s recorder becomes
`commitGeometry: (studyId, geometry, options) => { commits.push({ studyId, geometry, options }); queue.commitGeometry(studyId, geometry, options); }`
(existing assertions that deep-compare a whole commit compare `studyId` and `geometry`, or add `options`), then:

```js
test('the first hand-placed commit on a failed film carries clearFailure and the write clears the failure: the film reads Hand-placed (spec §4.3)', async () => {
  // failedAutoFilm('SP-9510'); wire(commits); enterLevelEditor; placeBody('L3', [100, 100]); await settle();
  // commits[0].options deepEqual { clearFailure: true }; studyOf: processingError === null, processingErrorAt === null,
  // measurements not null; deriveStatus(study) === 'hand'
});
test('a model result's commit carries clearFailure false and a failed re-run keeps reading Failed', async () => {
  // a study with geometry (the lumbar fixture), measurements, predictionId 'p-1', qc { models: { vertebrae: 'x' } },
  // processingError set; getPrediction returns { geometry }; enterLevelEditor; commitHandleMove('L1', <L1 moved 5 px>); settle;
  // commits[0].options deepEqual { clearFailure: false }; processingError unchanged; deriveStatus === 'fail'
});
```

- [ ] **Step 2: Run the two files to verify they fail**

Run: `node --test test/measure-queue.test.js test/level-editor-wiring.test.js`
Expected: FAIL — the failure fields stay set; `commits[0].options` is `undefined`.

- [ ] **Step 3: Implement**

`measure-queue.js`: a `clearing = new Set()`; `commitGeometry(studyId, geometry, { clearFailure = false } = {})` adds
the id when the flag is true; `recalculate` reads `const clear = clearing.delete(studyId);` right after `pendingId = null`
and spreads `...(clear ? { processingError: null, processingErrorAt: null } : {})` into the `writeStudy` patch;
`replaceMeasured` deletes the id (P2). The header comment gains one sentence on the flag.
`level-editor.js` `sync`: `deps.commitGeometry(editor.studyId, geometry, { clearFailure: isHandPlaced(study) });`
and the `configureLevelEditor` JSDoc's `commitGeometry` type gains the options argument.

- [ ] **Step 4: Run the whole suite**

Run: `node --test test/*.test.js`
Expected: PASS, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add renderer/viewer/measure-queue.js renderer/level-editor.js test/measure-queue.test.js test/level-editor-wiring.test.js
git commit -m "feat: the first hand-placed commit clears a film's failure in the measure queue's own write"
```

---

### Task 3: REVERT per level

**Files:**
- Modify: `renderer/data/levels.js` after `clearLevel` (`:604-610`)
- Modify: `renderer/level-editor.js` after `clearPlacedLevel` (`:519-525`), its import list (`:25-29`)
- Modify: `renderer/components/level-editor.js:60-107` (`levelRow`), `:21-24` (imports), `:232-246` (`fallbackKeys`)
- Test: `test/levels.test.js`, `test/level-editor-wiring.test.js`

**Interfaces:**
- Consumes: `levelState`, `setEntry`, the module's geometry-copy helper (the one `snapshot` uses), `update` in the wiring.
- Produces: `revertLevel(editor, code) -> editor` (pure); `revertPlacedLevel(code)` (wiring, commits);
  `data-level-key="revert:<code>"` on the button; `fallbackKeys('revert:<code>')` → `[code]`.

- [ ] **Step 1: Write the failing tests**

In `test/levels.test.js` (fixtures: `openEditor({ study: { geometry: lumbarGeometry() }, region: 'lumbar', modelGeometry: lumbarGeometry(), saved: null })`
gives every placed level `segmented`):

```js
test('revertLevel returns an Edited level to the model geometry with source model, and reads Segmented (spec §5.1)', ...);
  // setLevelGeometry(e, 'L4', body(10, 75)) → levelState 'edited' → revertLevel → sameGeometry(levels.L4.geometry, model.L4),
  // levels.L4.source === 'model', levelState 'segmented', unsavedCount 0, and the geometry is a copy (not the same object as model.L4)
test('revertLevel on a femoral head takes the model circle with rim null and keeps a focused handle (Review Focus 5)', ...);
  // setLevelGeometry(e, 'FH1', { center: [12, 140], radius: 5, rim: [[7,140],[17,140]] }); e = { ...e, handle: { code: 'FH1', handle: 'R0' } };
  // revertLevel → center [10,140], radius 5, rim null, source 'model', handle unchanged
test('revertLevel is a no-op for segmented, manual, not placed, not visible and placing levels', ...);
  // each returns the SAME editor object (assert.equal(revertLevel(e, code), e)); manual: setLevelGeometry(e, 'L3', body(10, 50)) (L3 has no model);
  // placing: startPlacing(e, 'FH1') then revertLevel(e, 'FH1') after setLevelGeometry made it edited
test('reverting a saved edit counts one unsaved change; reverting an unsaved one counts none', ...);
  // edited → markSaved → revertLevel → unsavedCount 1; fresh → edited → revertLevel → 0
```

In `test/level-editor-wiring.test.js`:

```js
test('revertPlacedLevel commits the model geometry through /measure; the study takes it and the level reads segmented with source model (spec §5.2)', async () => {
  // the Task 2 model-result fixture (no failure); enterLevelEditor; commitHandleMove('L1', moved); settle; revertPlacedLevel('L1'); settle;
  // commits.length === 2; studyOf().geometry.vertebrae.L1 deepEqual the prediction's L1; getState().levelEditor.levels.L1.source === 'model'
});
```

- [ ] **Step 2: Run the two files to verify they fail**

Run: `node --test test/levels.test.js test/level-editor-wiring.test.js`
Expected: FAIL with `revertLevel is not a function` / `revertPlacedLevel is not a function`.

- [ ] **Step 3: Implement the model and the wiring**

`levels.js`: `export function revertLevel(editor, code)`: no-op (returns `editor`) unless the entry exists, the model
entry exists, `editor.placing?.code !== code` and `levelState(entry, model) === 'edited'`; else
`setEntry(editor, code, { geometry: <copy of editor.model[code]>, source: 'model' })`. Document it with the spec's
§5.1 sentence. `level-editor.js`: `export function revertPlacedLevel(code) { update((editor) => revertLevel(editor, code), { edit: true }); }`
beside `clearPlacedLevel`, `revertLevel` imported.

- [ ] **Step 4: Run the two files to verify they pass**

Run: `node --test test/levels.test.js test/level-editor-wiring.test.js`
Expected: PASS.

- [ ] **Step 5: The panel**

`components/level-editor.js` `levelRow`: `const canRevert = !placing && state === 'edited';`; the actions column's
`is-stacked` class when `canPlace && (canClear || canRevert)`; after the CLEAR button, a REVERT button:
`el('button', { type: 'button', class: 'lv-text-btn lv-revert', 'aria-label': \`Revert ${name} to the model's output\`, title: <the same>, 'data-level-key': \`revert:${code}\`, onClick: () => revertPlacedLevel(code) }, 'REVERT')`
when `canRevert`. `fallbackKeys`: `case 'revert': return [rest];`. Import `revertPlacedLevel`. The row comment at
`:78-81` gains the REVERT sentence (spec §5.3). No CSS: `.lv-text-btn` and `.lv-actions.is-stacked` already style it.

- [ ] **Step 6: Run the whole suite, then look at it in the app**

Run: `node --test test/*.test.js` — PASS. Then from source on a `%TEMP%` profile with a synthetic or real film: drag
a corner of L4, the row shows `REVERT`, click, the badge reads Segmented and the ghost is gone. (No screenshot with a
real film on screen; Task 7 pins it by DOM.)

- [ ] **Step 7: Commit**

```bash
git add renderer/data/levels.js renderer/level-editor.js renderer/components/level-editor.js test/levels.test.js test/level-editor-wiring.test.js
git commit -m "feat: REVERT returns an Edited level to the model's output, one level at a time"
```

---

### Task 4: The comment in the model and the records

**Files:**
- Modify: `renderer/data/levels.js:402-435` (`openEditor`), `:618-651` (`unsavedCount`, `markSaved`, `revertToBaseline`), new `setComment`, `commentChanged`
- Modify: `renderer/data/label-record.js:160-183` (`toLabelRecord`), new `normalizeComment`, `recordComment`
- Modify: `docs/design/level-editor/label-record.schema.json` (`properties`, after `edits` at `:51`), `label-record.example.json`
- Modify: `renderer/data/persistence.js:251-253` (after `note`), `renderer/screens/studies.js:78-96` (`newStudy`)
- Test: `test/levels.test.js`, `test/label-record.test.js`, `test/persistence.test.js`, `test/studies.test.js`

**Interfaces:**
- Produces: `editor.comment: string`, `editor.savedComment: string`; `setComment(editor, text) -> editor`;
  `commentChanged(editor) -> boolean`; `openEditor` reads `saved.comment` (a string) else `study.labelComment`;
  `normalizeComment(text) -> string|null` (trimmed, `null` when blank or not a string);
  `recordComment(record) -> string` (`''` when absent or not a string); the record's `comment` after `edits`;
  `study.labelComment: string|null`.

- [ ] **Step 1: Write the failing tests**

`test/levels.test.js`:

```js
test('openEditor takes the comment from the saved record, else the study, else empty; savedComment matches (spec §3.3)', ...);
  // saved: { file, levels, comment: 'x' } → comment 'x', savedComment 'x'; saved null + study.labelComment 'y' → 'y'; neither → ''
test('setComment changes only the comment; commentChanged ignores surrounding whitespace', ...);
test('a comment change alone counts one unsaved change; with a level change, two', ...);
test('markSaved trims the comment into savedComment; revertToBaseline restores the saved text', ...);
```

`test/label-record.test.js`:

```js
test('toLabelRecord writes comment trimmed, null when blank, after edits and before levels; the example validates with one', ...);
  // Object.keys(record) order: ..., 'complete', 'edits', 'comment', 'levels', 'femoral_heads'
test('recordComment reads a string trimmed and reads anything else as empty (Review Focus 2)', ...);
  // 'a ' → 'a'; undefined, null, 42, {} → ''
test('normalizeComment: " x " → "x", "   " → null, undefined → null', ...);
```

`test/persistence.test.js`: `validate` carries `labelComment` as optional text, defaults it to `null`, drops a blank
or non-string (the `note` test at `:321` is the model). `test/studies.test.js`: `newStudy` has `labelComment: null`.

- [ ] **Step 2: Run the four files to verify they fail**

Run: `node --test test/levels.test.js test/label-record.test.js test/persistence.test.js test/studies.test.js`
Expected: FAIL — `setComment is not a function`; the record has no `comment`; `labelComment` is `undefined`.

- [ ] **Step 3: Implement**

`levels.js`: `openEditor` computes `const comment = saved ? (typeof saved.comment === 'string' ? saved.comment : '') : (typeof study?.labelComment === 'string' ? study.labelComment : '');`
and returns `comment, savedComment: comment`; `setComment(editor, text)` returns `{ ...editor, comment: String(text ?? '') }`;
`commentChanged(editor)` compares the trimmed strings; `unsavedCount` adds `commentChanged(editor) ? 1 : 0`;
`markSaved` sets `comment` and `savedComment` to the trimmed text; `revertToBaseline` sets `comment: editor.savedComment`.
`label-record.js`: `normalizeComment`, `recordComment` (exported); `toLabelRecord` writes `comment: normalizeComment(editor.comment)`
between `edits` and `levels`. Schema: `comment` nullable string, optional (P5), with a description naming the spec;
example: `"comment": "L5 is sacralised; the S1 endplate is the top of the fused body."` after `edits`.
`persistence.js`: `labelComment: optionalText(entry.labelComment),` after `note`, with a one-line comment; `newStudy`:
`labelComment: null,` after `note`.

- [ ] **Step 4: Run the whole suite**

Run: `node --test test/*.test.js`
Expected: PASS (the shipped-example test still passes with the new field).

- [ ] **Step 5: Commit**

```bash
git add renderer/data/levels.js renderer/data/label-record.js renderer/data/persistence.js renderer/screens/studies.js docs/design/level-editor/label-record.schema.json docs/design/level-editor/label-record.example.json test/levels.test.js test/label-record.test.js test/persistence.test.js test/studies.test.js
git commit -m "feat: a comment on the label record and its display copy on the study"
```

---

### Task 5: The comment through the wiring

**Files:**
- Modify: `renderer/level-editor.js:186-230` (`enterLevelEditor`), `:349-352` (`withLabelFile`), `:360-408` (`saveLevelEdits`), `:436-466` (`writeReviewRecord`), a new `setLevelComment` beside `toggleLevelVisible`, the import lists
- Test: `test/level-editor-wiring.test.js`

**Interfaces:**
- Consumes: Task 4's `setComment`, `recordComment`, `normalizeComment`.
- Produces: `setLevelComment(text)` (an edit, no commit); `withLabelFile(studies, studyId, addedAt, file, labelComment)`
  (P6); after Save edits the study has `labelComment` and the stored editor `savedComment` (P3).

- [ ] **Step 1: Write the failing tests**

In the G6 group's style (the bridge stubbed on `window.spineContour`, the written record captured):

```js
test('Save edits writes the comment into the record and labelComment onto the study in one patch; a blank comment writes null', async () => {
  // enterLevelEditor; setLevelComment('  Hardware over L4 '); unsaved 1; saveLevelEdits → captured record.comment === 'Hardware over L4',
  // studyOf().labelComment === 'Hardware over L4', editor.savedComment === 'Hardware over L4', unsavedCount 0;
  // then setLevelComment('   ') → unsaved 1 → save → record.comment === null, labelComment === null
});
test('Discard restores the saved comment; typing during the write stays unsaved (P3)', async () => {
  // stub saveLabelRecord to resolve on a deferred; saveLevelEdits (not awaited); setLevelComment('more'); resolve; await → unsavedCount 1, savedComment the written text
});
test('enterLevelEditor reads the record\'s comment; Mark reviewed\'s zero-change record carries the study\'s labelComment', async () => {
  // loadLabelRecord stub returns a record with comment 'from disk' → editor.comment === 'from disk';
  // a reviewed study with labelComment 'kept', no labelFile → writeReviewRecord → captured record.comment === 'kept'; studyOf().labelComment === 'kept'
});
test('RESET TO PREDICTION leaves the comment and savedComment alone (spec §3.3)', async () => {
  // the Task 2 model-result fixture; enterLevelEditor; setLevelComment('note'); resetLevelsToModel() → editor.comment === 'note', unsavedCount 1
});
```

- [ ] **Step 2: Run the file to verify it fails**

Run: `node --test test/level-editor-wiring.test.js`
Expected: FAIL with `setLevelComment is not a function`.

- [ ] **Step 3: Implement**

`enterLevelEditor`: `saved = { file: study.labelFile, levels: recordLevels(record), comment: recordComment(record) }`.
`setLevelComment(text)`: `update((editor) => setComment(editor, text), { edit: true, commit: false })`.
`withLabelFile`: the fifth argument spread as `...(labelComment === undefined ? {} : { labelComment })`.
`saveLevelEdits`: `const labelComment = normalizeComment(current.comment);` the `studies` patch applies when
`kept.labelFile !== file || kept.labelComment !== labelComment`, through `withLabelFile(..., file, labelComment)`;
the editor patch adds `savedComment: saved.savedComment` (P3). `writeReviewRecord` passes no fifth argument.

- [ ] **Step 4: Run the whole suite**

Run: `node --test test/*.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add renderer/level-editor.js test/level-editor-wiring.test.js
git commit -m "feat: the comment rides Save edits into the record and the study, and reopens from the record"
```

---

### Task 6: The comment box in the panel and the read-only block on the Analysis screen

**Files:**
- Modify: `renderer/components/level-editor.js:174-222` (`footer`), `:265-332` (`mountLevelEditor`), imports, new constants
- Modify: `renderer/screens/analysis.js:906-915` (the panel's children), `:1119-1127` (beside the review button's update)
- Modify: `renderer/screens/studies.js:62-66` (`matchesQuery`)
- Modify: `styles/screens/analysis.css` (after `.lv-unsaved` at `:1336`; after `.analysis-review-note` at `:176-178`)
- Test: `test/studies.test.js:17` (`matchesQuery`); the DOM by Task 7

**Interfaces:**
- Consumes: Task 4's `commentChanged`; Task 5's `setLevelComment`.
- Produces: `.lv-comment` > `.lv-comment-label` + `textarea.lv-comment-input[data-level-key="comment"]` in the footer,
  above `.lv-status`; `.analysis-comment` > `.analysis-comment-label` + `p.analysis-comment-text` after
  `.analysis-actions`, hidden while editing or when the study has no comment.

- [ ] **Step 1: Write the failing test**

`test/studies.test.js`, in the `matchesQuery` test: a study with `labelComment: 'Hardware over L4'` matches `'hardware'`.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/studies.test.js` — FAIL.

- [ ] **Step 3: `matchesQuery`**

Add `study.labelComment` to the joined list after `study.note`; one sentence in the comment above. Run the file: PASS.

- [ ] **Step 4: The panel**

In `mountLevelEditor`, once per mount: `const commentBox = el('textarea', { class: 'lv-comment-input', rows: 3, maxLength: 2000, placeholder: COMMENT_PLACEHOLDER, 'aria-label': COMMENT_ARIA, 'data-level-key': 'comment', onInput: (event) => setLevelComment(event.target.value) })`
(`COMMENT_PLACEHOLDER` and `COMMENT_ARIA` are the Global Constraints' copy). `footer(editor, study, commentBox)`
builds `el('div', { class: 'lv-comment' }, el('span', { class: 'lv-comment-label', 'aria-hidden': 'true' }, 'COMMENT'), commentBox)`
as the foot's first child (P4), and sets `commentBox.value = editor.comment ?? ''` only when
`document.activeElement !== commentBox`. The rebuild key gains `commentChanged(editor)` and nothing else. Around
`clear(root)`: when the active element is the box, snapshot `selectionStart`/`selectionEnd`; after the rebuild, once
`restoreFocus` has focused it (`focusKey === 'comment'`), `setSelectionRange` with the snapshot (P8). The header comment's
rebuild paragraph gains the sentence on why the text is not in the key (spec §3.4 requirement 1).

- [ ] **Step 5: The Analysis screen**

After `actionsRow`: `const commentText = el('p', { class: 'analysis-comment-text' }); const commentBlock = el('div', { class: 'analysis-comment is-hidden' }, el('span', { class: 'analysis-comment-label' }, 'COMMENT'), commentText);`
appended to `panel` between `actionsRow` and `measurementsHost`. In `update()`, beside the review button:
`const comment = typeof open.labelComment === 'string' && open.labelComment.trim() !== '' ? open.labelComment : null;`
`commentText.textContent = comment ?? ''; commentBlock.classList.toggle('is-hidden', editing || comment === null);`
(`editing` is computed a few lines below today; move the `const editing` up or compute it twice).

- [ ] **Step 6: CSS**

`styles/screens/analysis.css`, section `05 — LEVEL EDITOR`: `.lv-comment { display: flex; flex-direction: column; gap: 4px; }`,
`.lv-comment-label` as `.lv-status-label` (mono, `--muted`), `.lv-comment-input { width: 100%; min-height: 56px; resize: vertical; box-sizing: border-box; }`
plus the house text-input look (the clinical drawer's inputs in the same file: font `'Source Sans 3'` 12.5px, `--ink`
on `--card`, 1px `--border`, `var(--radius-input)`, the `--accent` focus ring at 2px offset). Analysis panel section:
`.analysis-comment { padding: 0 14px 10px; }`, `.analysis-comment-label` as `.lv-status-label`,
`.analysis-comment-text { margin: 2px 0 0; white-space: pre-wrap; font: 400 12.5px/1.45 'Source Sans 3', sans-serif; color: var(--body); }`,
`.analysis-comment.is-hidden, .analysis-panel.is-editing .analysis-comment { display: none; }`.

- [ ] **Step 7: Run the suite and the app**

Run: `node --test test/*.test.js` — PASS. From source on a `%TEMP%` profile with a synthetic film (no real film on
screen): type in the box, the count reads `1 UNSAVED CHANGE` after the first keystroke, the caret stays put, Save
edits enables; after Save, DONE shows the block under the actions row; Edit shows the text in the box.

- [ ] **Step 8: Commit**

```bash
git add renderer/components/level-editor.js renderer/screens/analysis.js renderer/screens/studies.js styles/screens/analysis.css test/studies.test.js
git commit -m "feat: the comment box in the Vertebral levels panel and its read-only block on the Analysis screen"
```

---

### Task 7: The smoke suite

**Files:**
- Modify: `tools/smoke/smoke-levels.mjs:813` (the SP-9301 fixture), `:1154-1192` (section 12), new sections 20 and 21 between sections 7 (`:1019`) and 8 (`:1048`), the header comment (`:1-60`)
- Modify: `tools/smoke/README.md` (the suite's counts and sections)

**Interfaces:**
- Consumes: the harness's `check`, `ev`, `js`, `until`, `text`, `badge`, `studyOf`, `settled`, `openFromList`,
  `clickSelector`, `clearToasts`, `toastSeen`, `readRecord`, `segRecordName`, `STUDIES_NAV`, `row(id)`; the wiring's
  exports through `import('./renderer/level-editor.js')` in the page.

- [ ] **Step 1: The failure on SP-9301 and section 12's status checks (P7)**

At `:813` the fixture gains `processingError: 'No spine was found on this film.', processingErrorAt: '2026-10-10T08:00:00.000Z'`.
In section 12, before `enterEdit()`: `check('12. the failed film\'s header pill reads Failed before Edit', (await text('.analysis-status .badge')) === 'Failed', …)`.
After `settled(HAND)` and the existing isHandPlaced check:
`check('12. the first hand-placed commit cleared the failure and the pill reads Hand-placed (spec §4.3)', handStudy.processingError === null && handStudy.processingErrorAt === null && (await text('.analysis-status .badge')) === 'Hand-placed', …)`.
After `windowOutsideEditChecks(windowInEdit)`: Mark reviewed (`.analysis-review`) is enabled, its note hidden; click
it → the button text starts with `Reviewed` and the pill reads `Reviewed`; click again → `Hand-placed`. Then
`clickSelector(STUDIES_NAV)`, `until(row(HAND))`, `check('12. the Find list\'s row reads Hand-placed', (await text(\`${row(HAND)} .badge\`)) === 'Hand-placed', …)`,
then `await openFromList(HAND)` so section 13 starts where it did.

- [ ] **Step 2: Section 20, REVERT, on SP-9300 after section 7**

With the editor open and `NOTHING TO SAVE`: through the page, `commitHandleMove('L4', <the editor's L4 geometry with every point shifted +5 px in x>)`;
`settled(SEG)`; checks: `badge('L4') === 'Edited'`, `present('[data-level-key="revert:L4"]')`, `text('.lv-unsaved') === '1 UNSAVED CHANGE'`;
`clickSelector('[data-level-key="revert:L4"]')`; `settled(SEG)`; checks: `badge('L4') === 'Segmented'`, the key absent,
`NOTHING TO SAVE`, `window.__lv.editor().levels.L4.source === 'model'`, the study's `geometry.vertebrae.L4.superior`
deep-equal `window.__lv.editor().model.L4.superior`. Then Head 1: `commitHandleMove('FH1', { center: [cx + 4, cy], radius, rim: null })`
→ `Edited`, `.lv-actions.is-stacked` present on FH1's row with both `place:FH1` and `revert:FH1`; click REVERT →
`Segmented`, `editor.levels.FH1.geometry.rim === null`, `NOTHING TO SAVE`. (A screenshot-free check: the ghost is
canvas-drawn and is not asserted.)

- [ ] **Step 3: Section 21, the comment, on SP-9300 straight after**

Focus `.lv-comment-input` (click it), type `Hardware over L4` with the harness's text-entry helper (the one the
subject-cell sections of `smoke-gate*.mjs` use; else CDP `Input.insertText`). Checks: `1 UNSAVED CHANGE`, `.lv-save`
enabled; a rebuild from the keyboard-free path `toggleGroupOpen('thoracic')` through the page (Review Focus 3):
`document.activeElement.classList.contains('lv-comment-input')`, its `value === 'Hardware over L4'`,
`selectionStart === 16`; press Escape in the box: still editing, no prompt, the box still focused (P9);
`clickSelector('.lv-save')` → `toastSeen('Saved 1 edit to the label record.')`, `readRecord(segRecordName).comment === 'Hardware over L4'`,
`(await studyOf(SEG)).labelComment === 'Hardware over L4'`, `NOTHING TO SAVE`; type ` more` → `1 UNSAVED CHANGE`;
`clickSelector('.lv-discard')` → `toastSeen('Discarded 1 change.')`, the box's value back to `Hardware over L4`;
`cdp.key('Escape')` (focus first on the panel's Discard button, not the box) → outside edit mode `.analysis-comment`
visible with `.analysis-comment-text` reading `Hardware over L4`; `enterEdit()` → the box reads it, `.analysis-comment`
hidden; leave in edit mode with `NOTHING TO SAVE` for section 8.

- [ ] **Step 4: Run the dom phase, then every runnable suite**

```bash
node tools/smoke/launch.mjs
node tools/smoke/smoke-levels.mjs > tools/smoke/out/smoke-levels.txt 2>&1
node tools/smoke/cdp.mjs --quit
```

Expected: every line `PASS`; the dom count is 121 plus the new checks (the summary line at the end of the file names
it); film 25/25 when `backend/onnx/` is linked and the real film is present, else the film phase is reported as not
run. Then the other suites the README lists as runnable here (`smoke-gate1/2/3`, `smoke-parameters`, `smoke-chip`,
`smoke-chord`, `smoke-landing`, `smoke-disc-heights`, `smoke-femoral-confidence`, `smoke-global-sva`,
`smoke-onnx-localizer`, `smoke-accuracy`), each in the foreground to its own file: no regressions (a status label
assertion that expected Segmented or Needs review on a hand-placed study would now read Hand-placed; fix the
assertion, not the app).

- [ ] **Step 5: README and commit**

`tools/smoke/README.md`: the suite's new sections and counts, the SP-9301 fixture's failure.

```bash
git add tools/smoke/smoke-levels.mjs tools/smoke/README.md
git commit -m "test: smoke sections for the Hand-placed film, REVERT and the comment"
```

---

### Task 8: The records

**Files:**
- Modify: `docs/design/level-editor/HANDOFF.md` §2 (the rule, after "Manual levels have Clear"), §3 "Row actions" and "Footer", §6 (two rows: REVERT; the comment box), §9 fields (`comment`), §11 ("Segmentation failed entirely": the status), §12 (a `## 12a. Decisions (2026-10-15)` block listing E1–E7 by reference to the spec)
- Modify: `docs/level-editor.md` "The panel" (the comment box, REVERT), "Discard, RESET TO PREDICTION, Save edits" (the comment counts), "The label record" (`comment`), "Films with no result" `:326-330` (the R24 paragraph replaced by the Hand-placed rule)
- Modify: `docs/ROADMAP.md:398-401` (the R24 item struck through, the ruling and the spec named)
- Modify: `docs/superpowers/specs/2026-10-01-failed-status-port-design.md:54` (P6: a third clearing site), `docs/superpowers/specs/2026-09-10-studies-table-review-design.md:232-240` (the status table gains `hand — Hand-placed`)
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` (status union; `persistence.js` field list; `commitGeometry`'s options; the wiring's exports), `docs/superpowers/plans/2026-10-10-level-editor.md` (a Ledger row: R24 closed by E2, the date, this plan)
- Modify: `CLAUDE.md` (first paragraph: this branch, built, at the gate), `docs/superpowers/HANDOFF.md` (first section)
- Modify: `README.md` if it lists the level editor's features (REVERT, the comment)

- [ ] **Step 1: Make every edit above**, each a sentence or a row in the document's own voice, naming the spec and
  the ruling (E1–E7, P1–P9). Nothing is deleted from the records; superseded text is struck through as the ROADMAP
  does.

- [ ] **Step 2: Check nothing else names R24 as open**

Run: `grep -rn "R24" docs CLAUDE.md` — every hit reads as closed or historical.

- [ ] **Step 3: Commit**

```bash
git add docs CLAUDE.md README.md
git commit -m "docs: the editor round-2 records: the comment, Hand-placed, REVERT, R24 closed"
```

---

### Task 9: The human gate (the owner's)

The session stops here and waits for "gate passed". Nothing is pushed, no PR, no release commit until the owner says
so (`docs/release-main.md` for the release; a minor, 1.2.0, is the spec's suggestion; fetch the tags first).

On a `%TEMP%` profile launched from the worktree, with `TESSERACT_CMD` set and real films from the workstation's
films folder (no screenshots):

- [ ] A failed real film: Edit, place L1–L5 and S1 by hand, DONE: the pill reads `Hand-placed`, the `Last run
      failed` note and the FAILED card are gone, the Find list sorts it after Needs review and before Segmented, the
      summary's TO REVIEW counts it, Mark reviewed enables and turns it Reviewed; a Re-run that fails reads Failed.
- [ ] A model result: drag two corners of L4 and a rim point of Head 1; each row shows `REVERT`; click both; the
      badges read Segmented, the ghosts are gone, the numbers match the prediction's; Save edits writes `segmented`
      with a contour for L4.
- [ ] The comment: type a sentence with a line break; the count and Save follow; arrows and Escape stay in the box;
      Save, DONE, the block under the actions row; Back, reopen, Edit: the text is in the box; Discard after a change
      restores it; the Find search finds it.
- [ ] The dark theme: the Hand-placed pill and the comment box read.
- [ ] Demo studies still read Segmented or Needs review.
- [ ] (The final review, I1) A failed real film: Edit, place one level by hand (the pill reads Hand-placed), then
      Discard: the pill reads Failed again with its stored reason, and after DONE the `Last run failed` note and the
      FAILED card are back and Mark reviewed is disabled again.
- [ ] (The final review, M2; unverified) Type in the comment box, drag a handle on the film, then press an arrow: the
      arrow must nudge the handle, not move the box's caret (the handle press's `preventDefault` in
      `components/viewer.js` (~:787) may leave the textarea focused).
- [ ] (The final review, I2) Ctrl+Z right after the first keystroke in the comment box takes it back (the box empty,
      `NOTHING TO SAVE`).
- [ ] (The final review, I2) A dead-key accent (or an IME character) as the comment's first character composes
      normally.
- [ ] (Spec §9) After upgrading, a look over the real library for old model results with neither `predictionId` nor
      `qc.models` that now read Hand-placed.
