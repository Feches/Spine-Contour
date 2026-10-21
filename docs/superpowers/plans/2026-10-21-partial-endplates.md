# Partial Endplates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A vertebral body (C3–C7, L1–L5) can be placed, drawn, handled, measured, saved and reloaded with one of its
two endplates alone, and C2 with its inferior pair alone or its centroid alone, on cervical, full-spine and lumbar films.

**Architecture:** The level model (`renderer/data/levels.js`) learns the notion of a *part* (a body's `superior` and
`inferior` pairs; C2's `inferior` pair and `centroid`), each whole or null, and gains three pure steps: finish a
placement early, resume one for a missing part, remove a part. The projection, the persistence validator, the handles,
the canvas, the plates and the label record each read nullable parts; the backend's lumbar validator accepts them. The
viewer adds a FINISH button, hollow chips and the Delete key; the panel offers Place… on a partial level. The schema is
amended under its `/1` id. Every pure change has `node --test` coverage; the DOM has a new smoke section.

**Tech Stack:** Vanilla ES modules, no bundler, no runtime dependencies. `node --test` for pure logic. The CDP smoke
harness in `tools/smoke/` for DOM behaviour. Python/FastAPI backend with `pytest`. Electron 44 (Node 24).

**Spec:** `docs/superpowers/specs/2026-10-21-partial-endplates-design.md` (the owner's rulings N1–N4, all
"recommended", 2026-10-21; planner decisions N5–N7; "the spec" below). The level editor's handoff is
`docs/design/level-editor/HANDOFF.md`, its plan `plans/2026-10-10-level-editor.md` (D1–D20, R1–R45), its user doc
`docs/level-editor.md`; the 1.3.1 chips are in `docs/releases/1.3.1.md`. The binding architecture contract
`plans/2026-08-31-00-architecture-contract.md` wins over this plan.

## Global Constraints

Carried from the level editor plan, the round-2 plan and `CLAUDE.md`; every task's requirements include these.

- **Never display a fabricated measurement.** Absent values render `—` (U+2014), never `0`, never a guess. A partial
  body gives every measurement its one endplate supports and a null for the rest; nothing substitutes an endplate.
- **Never mutate the store's geometry, a Study record or the level editor state in place.** Every step returns a new
  object along the changed path, or the editor it was given when it has nothing to do.
- **A partial geometry carries every key of its kind, the missing part `null`, never absent**: a body is always
  `{superior, inferior}`, C2 always `{inferior, centroid}`. `sameGeometry` and `changedPoints` compare by key and treat
  a missing key as a difference (`near(undefined, null)` is false), so every writer of a geometry (the level model,
  the record reader, the projection reader) writes the canonical shape.
- **A part is whole or null, never half.** A geometry holding one corner of a pair is not a geometry: every reader
  returns null for it.
- **All stage pointer and keyboard wiring lives in `renderer/components/viewer.js`.** `renderer/viewer/*.js` and
  `renderer/data/*.js` are pure logic with `node --test` coverage and contain no DOM code.
- **`renderer/level-editor.js` is the only writer of `state.levelEditor`.** Subscribers never call `setState`; the
  panel's handlers call the wiring's exports.
- **No bundler, no framework, no runtime dependencies.** `package.json` `dependencies` stays empty; `devDependencies`
  stays exactly `electron` and `electron-builder`. No JSON Schema library: the checker is
  `test/fixtures/schema-check.js`, which supports `type`, `const`, `enum`, `required`, `properties`,
  `additionalProperties: false`, `$ref` to `#/$defs/<name>`, `allOf`, `anyOf`, `oneOf`, `not`, `if`/`then`/`else`,
  `items`, `prefixItems`, `minItems`, `maxItems`, `uniqueItems`, `minimum`, `exclusiveMinimum`, `minLength`,
  `pattern`, and throws on any other keyword.
- **The schema id stays `spinecontour.segmentation-label/1`** (N4). Every record saved before 1.4.0 validates and
  reads unchanged.
- **Do not loosen the CSP.** New CSS goes in `styles/screens/analysis.css` beside the `.viewer-step` rules; colours are
  token variables, never hex.
- **`el()` conventions** (`renderer/dom.js`): real booleans for `disabled`, handlers as `onClick`, `aria-*` as
  attributes; never `style` as a prop.
- **The edit bar's button order is fixed** and the smoke suite selects by it: FIT, FINISH (new, Task 8), UNDO, CANCEL,
  RESET TO PREDICTION, DONE. FIT and FINISH carry `aria-label`s; `EDITBAR_UNDO` in `tools/smoke/smoke-levels.mjs`
  becomes `button:nth-of-type(3)`.
- **Copy, verbatim** (the spec §4): FINISH's label `FINISH`, its `aria-label` and title
  `Finish with the points placed; the rest are not on this film`; a missing point's chip title
  `Place {label}: click here, then on the film`; a placed corner's chip title on a body or C2
  `Place {label}: click here, then on the film; Delete removes its endplate` (C2's centroid:
  `…; Delete removes it`); an armed chip's title is unchanged from 1.3.1. The placement labels and help lines are
  unchanged (`PLACING C7 · 3 OF 4`, `Click the inferior-anterior corner (IA).`).
- **Unit tests run as `node --test test/*.test.js`.** Baseline on `7e85035`: 1161/1161. `pytest backend/tests/unit`
  through the venv python (`$env:SPINE_CONTOUR_PYTHON`, from PowerShell). Never write a fake test.
- **Smoke:** `tools/smoke/smoke-levels.mjs` (phase `dom`) on the scratch profile `launch.mjs` makes, CDP port 9222,
  DOM, store and file reads only, never a screenshot. Baseline on `7e85035`: 154/154. Launch and run through the
  PowerShell tool, never the Bash tool (it kills the detached Electron): `Set-Location` to this worktree first,
  `$env:SPINE_CONTOUR_PYTHON` at the venv python, `node tools/smoke/launch.mjs`, then the suite in the FOREGROUND with
  its output captured to `tools/smoke/out/<name>.txt`, then `node tools/smoke/cdp.mjs --quit`. A suite that prints
  nothing has thrown. `backend/onnx/` is gitignored and present in this worktree; the dom phase needs no model.
- **Conventional commit prefixes** (`feat:`, `fix:`, `test:`, `docs:`, `chore:`); commit after every task; every
  commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never push: the owner pushes
  and opens the PR after their gate.
- **Branch:** `claude/partial-endplates-ca5755` in the worktree
  `C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d`, cut from
  `claude/segmentation-points-display-2df267` @ `7e85035` (1.3.1 + ROADMAP §9). The 1.3.1 branch is checked out in a
  sibling worktree and is never touched; `fork/main` is the trunk, `origin/main` never a base.

## Review Focus

Inputs the spec implies that a person will meet; each line names the task whose tests pin it.

1. **A record on disk with half a pair** (`corners.sa` a point, `corners.sp` null, from a hand edit or a future bug):
   the level reads Not placed, nothing throws, and the amended schema rejects the file. Task 6.
2. **The model's own partial output** (HRNet returns C7 with one endplate): the level reads Segmented and draws as its
   line; completing it reads Edited with a partial `model_corners`; REVERT returns it to the partial output. Tasks 1
   and 6.
3. **Delete on the last part, during a placement, or on T1, S1, T4 or a head**: nothing changes and nothing is
   committed; Delete on a part the level can spare commits once and moves the focus to a remaining handle. Tasks 1
   and 7.
4. **A cervical film placed by hand from one inferior endplate**: the anterior side is still read (from that pair),
   so the projection commits and SVA can be measured once C2's centroid and C7's superior exist. Task 2.
5. **A partial lumbar body on a full-spine film**: the backend's full-spine measurer accepts it through the lumbar
   validator, the store's full-spine validator accepts it, `c7_centroid` and `l1_center` are null and the global SVA,
   LL (for that body) and L1PA read null. Tasks 2 and 3.

---

### Task 1: The level model learns parts

**Files:**
- Modify: `renderer/data/levels.js` (the typedefs at the top; `bodyFrom`, `levelFromGeometry` ~L300–325;
  `geometryFromPoints` ~L279–290; `selectLevel`, `startPlacing` ~L470–500; `finishedGeometry`, `canFinishPlacing`,
  `finishPlacing` ~L600–640; new exports beside `clearLevel`)
- Test: `test/levels.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces (all pure, all exported from `renderer/data/levels.js`):
  - `partsOf(code: string): {key: string, steps: number[]}[]` — a body `[{key: 'superior', steps: [0, 1]}, {key: 'inferior', steps: [2, 3]}]`; C2 `[{key: 'inferior', steps: [0, 1]}, {key: 'centroid', steps: [2]}]`; an endplate `[{key: 'superior', steps: [0, 1]}]`; a centroid `[{key: 'centroid', steps: [0]}]`; a circle `[]`. A fresh array each call.
  - `partOfHandle(code: string, handle: string): string|null` — `'superior'` for SA and SP, `'inferior'` for IA and IP, `'centroid'` for CENTROID; null for a rim handle or a handle the kind lacks.
  - `missingParts(code: string, geometry: LevelGeometry|null): string[]` — the keys of the parts that are null; `[]` for a whole level, for a one-part kind that is placed, for a circle, and for null geometry.
  - `isPartial(code: string, geometry: LevelGeometry|null): boolean` — `missingParts(...).length > 0`.
  - `geometryFromPoints(code, points: (Pt|null)[], imageSize)` — now takes the slot array with nulls (see Step 3).
  - `canFinishPlacing(editor, imageSize): boolean` — true for a body or C2 placement with at least one part whole and no part half set (and, as before, a head from 2 rim points with a radius ≥ 0.5 px; T1, S1, T4 only when every slot is set).
  - `resumePlacing(editor, code: string, step?: number|null): LevelEditor` — a placement for a visible, partially placed body or C2 with its set slots pre-filled; unchanged otherwise.
  - `removePart(editor, code: string, handle: string): LevelEditor` — the focused handle's part nulled; unchanged when refused.
  - `BodyGeometry` is now `{superior: [Pt, Pt]|null, inferior: [Pt, Pt]|null}`, `C2Geometry` `{inferior: [Pt, Pt]|null, centroid: Pt|null}`.

- [ ] **Step 1: Write the failing tests** in `test/levels.test.js` (add `partsOf, partOfHandle, missingParts, isPartial, resumePlacing, removePart` to the import).

```js
test('partsOf names each kind\'s parts and the steps that place them; partOfHandle maps a handle to its part', () => {
  assert.deepEqual(partsOf('L3'), [{ key: 'superior', steps: [0, 1] }, { key: 'inferior', steps: [2, 3] }]);
  assert.deepEqual(partsOf('C2'), [{ key: 'inferior', steps: [0, 1] }, { key: 'centroid', steps: [2] }]);
  assert.deepEqual(partsOf('S1'), [{ key: 'superior', steps: [0, 1] }]);
  assert.deepEqual(partsOf('T4'), [{ key: 'centroid', steps: [0] }]);
  assert.deepEqual(partsOf('FH1'), []);
  assert.notEqual(partsOf('L3'), partsOf('L3'), 'a fresh array');
  assert.equal(partOfHandle('L3', 'SA'), 'superior');
  assert.equal(partOfHandle('L3', 'IP'), 'inferior');
  assert.equal(partOfHandle('C2', 'CENTROID'), 'centroid');
  assert.equal(partOfHandle('C2', 'SA'), null, 'C2 has no superior pair');
  assert.equal(partOfHandle('FH1', 'R0'), null);
});

test('levelsFromGeometry reads a body with one endplate, and C2 with its pair or its centroid alone, in the canonical shape', () => {
  const g = cervicalGeometry();
  g.vertebrae.C7 = { superior: [[10, 110], [20, 110]], inferior: null, quadrilateral: null };
  g.vertebrae.C6 = { superior: null, inferior: [[10, 100], [20, 100]], quadrilateral: null };
  const levels = levelsFromGeometry(g);
  assert.deepEqual(levels.C7, { superior: [[10, 110], [20, 110]], inferior: null });
  assert.deepEqual(levels.C6, { superior: null, inferior: [[10, 100], [20, 100]] });
  assert.deepEqual(levelsFromGeometry({ region: 'cervical', vertebrae: {}, c2_centroid: [45, 12] }).C2, { inferior: null, centroid: [45, 12] });
  assert.deepEqual(levelsFromGeometry({ region: 'cervical', vertebrae: { C2: { inferior: [[40, 20], [50, 20]] } }, c2_centroid: null }).C2,
    { inferior: [[40, 20], [50, 20]], centroid: null });
  assert.equal(levelsFromGeometry({ region: 'lumbar', vertebrae: { L1: { superior: [[1, 1]], inferior: null } } }).L1, null, 'half a pair is not a geometry');
  assert.equal(levelsFromGeometry({ region: 'lumbar', vertebrae: { L1: { superior: null, inferior: null } } }).L1, null, 'no part is not a geometry');
  assert.deepEqual(missingParts('C7', levels.C7), ['inferior']);
  assert.deepEqual(missingParts('C6', levels.C6), ['superior']);
  assert.deepEqual(missingParts('C3', levels.C3), []);
  assert.deepEqual(missingParts('C7', null), []);
  assert.equal(isPartial('C7', levels.C7), true);
  assert.equal(isPartial('S1', { superior: [[1, 1], [2, 2]] }), false);
});

test('the model\'s own partial output reads Segmented, is Edited once completed, and REVERT returns it to the partial output', () => {
  const partial = { superior: [[10, 110], [20, 110]], inferior: null };
  const study = { id: 'SP-0002', geometry: { region: 'cervical', vertebrae: { C7: { ...partial, quadrilateral: null } }, c2_centroid: null } };
  let e = openEditor({ study, region: 'cervical', modelGeometry: study.geometry, saved: null });
  assert.equal(levelState(e.levels.C7, e.model.C7), 'segmented');
  const whole = { superior: partial.superior, inferior: [[10, 120], [20, 120]] };
  e = setLevelGeometry(e, 'C7', whole);
  assert.equal(levelState(e.levels.C7, e.model.C7), 'edited');
  assert.deepEqual(changedPoints('C7', whole, e.model.C7), ['ia', 'ip']);
  e = revertLevel(e, 'C7');
  assert.deepEqual(e.levels.C7.geometry, partial);
  assert.equal(levelState(e.levels.C7, e.model.C7), 'segmented');
  assert.deepEqual(changedPoints('C7', { superior: null, inferior: whole.inferior }, whole), ['sa', 'sp'], 'a removed endplate lists its keys');
  assert.deepEqual(changedPoints('C7', partial, null), ['sa', 'sp'], 'a manual partial body lists its placed keys only');
});

test('geometryFromPoints takes the slot array: a whole part is written, an empty part is null, a half part makes no geometry', () => {
  const sa = [1, 1], sp = [2, 1], ia = [1, 2], ip = [2, 2];
  assert.deepEqual(geometryFromPoints('L3', [sa, sp, null, null], IMAGE), { superior: [sa, sp], inferior: null });
  assert.deepEqual(geometryFromPoints('L3', [null, null, ia, ip], IMAGE), { superior: null, inferior: [ia, ip] });
  assert.deepEqual(geometryFromPoints('L3', [sa, sp, ia, ip], IMAGE), { superior: [sa, sp], inferior: [ia, ip] });
  assert.equal(geometryFromPoints('L3', [sa, null, ia, ip], IMAGE), null, 'half a superior pair');
  assert.equal(geometryFromPoints('L3', [null, null, null, null], IMAGE), null);
  assert.deepEqual(geometryFromPoints('C2', [null, null, [5, 5]], IMAGE), { inferior: null, centroid: [5, 5] });
  assert.deepEqual(geometryFromPoints('C2', [ia, ip, null], IMAGE), { inferior: [ia, ip], centroid: null });
  assert.equal(geometryFromPoints('S1', [sa, null], IMAGE), null, 'an endplate has one part');
  assert.equal(geometryFromPoints('T4', [null], IMAGE), null);
  assert.deepEqual(geometryFromPoints('FH1', [[0, 10], null, [20, 10], null], IMAGE).center, [10, 10], 'a head fits the points it has');
});

test('a body or C2 may finish early once an endplate is whole and no part is half set; it still finishes by itself at every slot', () => {
  let e = startPlacing(blankEditor('cervical'), 'C7');
  assert.equal(canFinishPlacing(e, IMAGE), false, 'nothing set');
  e = addPoint(e, [10, 10], IMAGE);
  assert.equal(canFinishPlacing(e, IMAGE), false, 'one corner is half an endplate');
  e = addPoint(e, [30, 10], IMAGE);
  assert.equal(canFinishPlacing(e, IMAGE), true, 'SA and SP');
  const done = finishPlacing(e, IMAGE);
  assert.equal(done.placing, null);
  assert.deepEqual(done.levels.C7.geometry, { superior: [[10, 10], [30, 10]], inferior: null });
  assert.equal(done.levels.C7.source, 'annotator');
  assert.equal(levelState(done.levels.C7, done.model.C7), 'manual');
  e = addPoint(e, [10, 30], IMAGE);
  assert.equal(canFinishPlacing(e, IMAGE), false, 'three corners: the inferior pair is half set');
  assert.equal(finishPlacing(e, IMAGE), e, 'and FINISH is a no-op');
  e = addPoint(e, [30, 30], IMAGE);
  assert.equal(e.placing, null, 'the fourth corner finishes by itself');
  let lower = setPlacingStep(startPlacing(blankEditor('lumbar'), 'L1'), 2);
  lower = addPoint(addPoint(lower, [10, 30], IMAGE), [30, 30], IMAGE);
  assert.equal(canFinishPlacing(lower, IMAGE), true, 'IA and IP alone');
  assert.deepEqual(finishPlacing(lower, IMAGE).levels.L1.geometry, { superior: null, inferior: [[10, 30], [30, 30]] });
  let c2 = setPlacingStep(startPlacing(blankEditor('cervical'), 'C2'), 2);
  c2 = addPoint(c2, [45, 12], IMAGE);
  assert.equal(canFinishPlacing(c2, IMAGE), true, 'the centroid alone');
  assert.deepEqual(finishPlacing(c2, IMAGE).levels.C2.geometry, { inferior: null, centroid: [45, 12] });
  let s1 = addPoint(startPlacing(blankEditor('lumbar'), 'S1'), [10, 10], IMAGE);
  assert.equal(canFinishPlacing(s1, IMAGE), false, 'an endplate cannot finish early');
});

test('resumePlacing pre-fills the set slots of a partial level, with the given empty step or the first one current, and nothing to undo', () => {
  const partial = { superior: [[10, 10], [30, 10]], inferior: null };
  let e = setLevelGeometry(blankEditor('cervical'), 'C7', partial);
  const resumed = resumePlacing(e, 'C7');
  assert.deepEqual(resumed.placing, { code: 'C7', points: [[10, 10], [30, 10], null, null], current: 2, history: [] });
  assert.equal(resumed.selected, 'C7');
  assert.equal(resumed.handle, null);
  assert.equal(resumed.aiming, false);
  assert.deepEqual(resumed.levels.C7.geometry, partial, 'the level keeps its geometry while the placement runs');
  assert.deepEqual(resumePlacing(e, 'C7', 3).placing.current, 3, 'a chosen empty step');
  assert.deepEqual(resumePlacing(e, 'C7', 0).placing.current, 2, 'a set step is not chosen: the first empty one is');
  assert.equal(undoPoint(resumed), resumed, 'nothing to undo');
  const whole = addPoint(addPoint(resumed, [10, 30], IMAGE), [30, 30], IMAGE);
  assert.equal(whole.placing, null);
  assert.deepEqual(whole.levels.C7.geometry, { superior: [[10, 10], [30, 10]], inferior: [[10, 30], [30, 30]] });
  assert.deepEqual(cancelPlacing(resumed).levels.C7.geometry, partial, 'CANCEL leaves the level as it was');
  const finished = finishPlacing(resumed, IMAGE);
  assert.equal(finished.placing, null);
  assert.deepEqual(finished.levels.C7.geometry, partial, 'FINISH with nothing new writes the same shape');
  assert.equal(resumePlacing(e, 'C3'), e, 'an unplaced level is not resumed');
  const wholeC3 = setLevelGeometry(e, 'C3', { superior: [[1, 1], [2, 1]], inferior: [[1, 2], [2, 2]] });
  assert.equal(resumePlacing(wholeC3, 'C3'), wholeC3, 'a whole level is not resumed');
  const hidden = toggleVisible(e, 'C7');
  assert.equal(resumePlacing(hidden, 'C7'), hidden, 'a hidden level is not resumed');
  const placingC3 = startPlacing(e, 'C3');
  assert.equal(resumePlacing(placingC3, 'C7'), placingC3, 'not while a placement runs');
  const c2 = setLevelGeometry(e, 'C2', { inferior: null, centroid: [45, 12] });
  assert.deepEqual(resumePlacing(c2, 'C2').placing, { code: 'C2', points: [null, null, [45, 12]], current: 0, history: [] });
});

test('removePart nulls the focused handle\'s part and moves the focus; the last part, a one-part kind, a placement and a missing handle are refused', () => {
  const whole = { superior: [[10, 10], [30, 10]], inferior: [[10, 30], [30, 30]] };
  let e = selectLevel(setLevelGeometry(blankEditor('cervical'), 'C7', whole), 'C7');
  assert.deepEqual(e.handle, { code: 'C7', handle: 'SA' });
  const upperGone = removePart(e, 'C7', 'SP');
  assert.deepEqual(upperGone.levels.C7.geometry, { superior: null, inferior: whole.inferior });
  assert.equal(upperGone.levels.C7.source, 'annotator');
  assert.deepEqual(upperGone.handle, { code: 'C7', handle: 'IA' }, 'the first remaining handle');
  assert.equal(upperGone.aiming, false);
  assert.equal(removePart(upperGone, 'C7', 'IA'), upperGone, 'the last part stays');
  assert.equal(removePart(e, 'C7', 'CENTROID'), e, 'a handle the kind lacks');
  assert.equal(removePart(startPlacing(e, 'C7'), 'C7', 'SA'), startPlacing(e, 'C7'), 'not while it is being placed');
  const s1 = selectLevel(setLevelGeometry(e, 'S1', { superior: [[1, 1], [2, 1]] }), 'S1');
  assert.equal(removePart(s1, 'S1', 'SA'), s1, 'an endplate has one part');
  const fh = selectLevel(setLevelGeometry(e, 'FH1', { center: [50, 50], radius: 10, rim: null }), 'FH1');
  assert.equal(removePart(fh, 'FH1', 'R0'), fh, 'a head has none');
  const c2 = selectLevel(setLevelGeometry(e, 'C2', { inferior: [[40, 20], [50, 20]], centroid: [45, 12] }), 'C2');
  assert.deepEqual(removePart(c2, 'C2', 'CENTROID').levels.C2.geometry, { inferior: [[40, 20], [50, 20]], centroid: null });
  assert.deepEqual(removePart(c2, 'C2', 'IP').levels.C2.geometry, { inferior: null, centroid: [45, 12] });
  assert.deepEqual(removePart(c2, 'C2', 'IP').handle, { code: 'C2', handle: 'CENTROID' });
});

test('selectLevel focuses the level\'s first existing handle, so a body without its superior pair focuses IA', () => {
  const e = setLevelGeometry(blankEditor('cervical'), 'C7', { superior: null, inferior: [[10, 30], [30, 30]] });
  assert.deepEqual(selectLevel(e, 'C7').handle, { code: 'C7', handle: 'IA' });
  const c2 = setLevelGeometry(e, 'C2', { inferior: null, centroid: [45, 12] });
  assert.deepEqual(selectLevel(c2, 'C2').handle, { code: 'C2', handle: 'CENTROID' });
});

test('a partial level counts as placed and leaves the training label complete', () => {
  const e = setLevelGeometry(blankEditor('cervical'), 'C7', { superior: [[10, 10], [30, 10]], inferior: null });
  assert.equal(summaryText(e).startsWith('1 PLACED'), true);
  assert.equal(trainingStatus(e).missing.includes('C7'), false);
});
```

Also amend the existing assertion at ~L972 to read `'three corners: a half endplate'` (its value stays `false`), and
add to `'sameGeometry compares within eps…'`: `assert.equal(sameGeometry({ superior: g.superior, inferior: null }, { superior: g.superior }), false, 'a null part and an absent one differ: the canonical shape matters');`.

`blankEditor(region)` already exists in the file (used at ~L964); if it does not, it is `openEditor({ study: { id: 'SP-0009', geometry: null, labelFile: null }, region, modelGeometry: null, saved: null })`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/levels.test.js`
Expected: FAIL — `partsOf`, `partOfHandle`, `missingParts`, `isPartial`, `resumePlacing`, `removePart` are not exported; `levelsFromGeometry` returns null for a partial body; `canFinishPlacing` is false after SA and SP.

- [ ] **Step 3: Implement in `renderer/data/levels.js`**

- Typedefs: `BodyGeometry` and `C2Geometry` as in Interfaces; a `PART_STEPS` table per kind: `body` `[['superior', [0, 1]], ['inferior', [2, 3]]]`, `c2` `[['inferior', [0, 1]], ['centroid', [2]]]`, `endplate` `[['superior', [0, 1]]]`, `centroid` `[['centroid', [0]]]`, `circle` `[]`; `HANDLE_PARTS` `{SA: 'superior', SP: 'superior', IA: 'inferior', IP: 'inferior', CENTROID: 'centroid'}`, with `partOfHandle` returning the part only when `partsOf(code)` lists it (C2 has no `superior`).
- `partsOf(code)`, `partOfHandle(code, handle)`, `missingParts(code, geometry)` (`partsOf(code).filter(part => geometry[part.key] == null)` for a non-null geometry of a non-circle kind), `isPartial`.
- `bodyFrom(vertebra)`: `superior` = a copied pair when `isPair`, null when null or undefined, and REJECT (return null) when it is anything else non-null (a half pair, a bad shape); same for `inferior`; return null unless at least one is a pair. `levelFromGeometry('C2')`: `inferior` from `vertebrae.C2?.inferior` by the same rule, `centroid` from `c2_centroid` (`isPoint` → copy; null/undefined → null; else reject); at least one.
- `geometryFromPoints(code, points, imageSize)`: for `body` and `c2`, per part: all slots set → written (copied), all empty → null, else return null; return null when every part is null. `endplate` and `centroid`: null unless every slot is set. `circle`: `fitRim(points.filter(Boolean).map(copyPoint), …)` as before.
- `finishedGeometry(placing, imageSize)`: a circle as before (over its set points); every other kind `geometryFromPoints(placing.code, placing.points, imageSize)`, which is null exactly when the placement may not finish. `addPoint`'s self-finish stays "no slot left empty".
- `selectLevel`: the handle is `levelHandles`' first entry — but `levels.js` must not import `viewer/level-handles.js` (it imports `levels.js`). Instead: `firstHandle(code, geometry)` in levels.js walks `partsOf(code)` in order and returns the first handle name of the first non-null part (`body`: SA for `superior`, IA for `inferior`; `c2`: IA, CENTROID; `endplate`: SA; `centroid`: CENTROID; `circle`: R0). Export it; Task 4 pins that it agrees with `levelHandles(...)[0].handle` for every kind and part.
- `resumePlacing(editor, code, step = null)`: refuse (return `editor`) while any placement runs (`editor.placing`), and unless the entry is visible, has geometry, `isPartial`, and `kindOf` is `body` or `c2`; points = one slot per step, filled from the geometry's whole parts (`PART_STEPS` gives which slots; a pair fills its two slots in order, a centroid its one); `current` = `step` when it is an integer naming an empty slot, else the first empty slot; `history: []`; `selected: code`, `handle: null`, `aiming: false`, as `startPlacing` does.
- `removePart(editor, code, handle)`: refuse unless the entry is visible, has geometry, `editor.placing?.code !== code`, `partOfHandle` gives a part, that part is non-null and at least one OTHER part is non-null. Otherwise `setEntry` with the part null and `source: 'annotator'`, `handle: { code, handle: firstHandle(code, nextGeometry) }`, `aiming: false`.
- `revertLevel`, `clearLevel`, `changedPoints`, `sameGeometry`, `trainingStatus`, `summaryText`: unchanged (the tests above pass through them).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/levels.test.js`
Expected: PASS, every test in the file (the file held 1161/1161's share before; no existing test changes its outcome except the reworded message).

- [ ] **Step 5: Commit**

```bash
git add renderer/data/levels.js test/levels.test.js
git commit -m "feat(levels): a body or C2 may hold one part; finish early, resume and remove a part"
```

---

### Task 2: The projection and the store validator read nullable parts

**Files:**
- Modify: `renderer/data/level-projection.js` (`quadrilateral` ~L25; `anteriorSideFrom` ~L85–95; `cervicalPart` ~L100–115; `lumbarPart` ~L125–150)
- Modify: `renderer/data/persistence.js` (`isValidGeometry` lumbar branch ~L112–130 and the full-spine branch's lumbar bodies ~L90–97; `measurementsHaveLandmarks` ~L146–150)
- Test: `test/level-projection.test.js`, `test/persistence.test.js`

**Interfaces:**
- Consumes: Task 1's canonical shapes.
- Produces: `quadrilateral(body): Pt[]|null` (null unless both pairs); `projectGeometry` writes, per body, `superior: pair|null, inferior: pair|null, quadrilateral: quad|null`; `c7_centroid` null unless C7 has its quadrilateral; `l1_center` null unless L1 has its quadrilateral; `vertebrae.C2` is written only when C2 has its inferior pair (then `{superior: null, inferior, quadrilateral: null}`), `c2_centroid` only when it has its centroid (else null). `validate(raw)` accepts a lumbar body with one pair.

- [ ] **Step 1: Write the failing tests** in `test/level-projection.test.js`:

```js
test('quadrilateral is null for a body with one endplate', () => {
  assert.equal(quadrilateral({ superior: [[1, 1], [2, 1]], inferior: null }), null);
  assert.equal(quadrilateral({ superior: null, inferior: [[1, 2], [2, 2]] }), null);
});

test('a cervical projection writes a partial C7 with its pair, the other null and no quadrilateral, and no C7 centroid', (t) => {
  const editor = editorWith({ C7: { superior: [[10, 110], [20, 111]], inferior: null } }, { region: 'cervical' });
  const g = projectGeometry(editor, { geometry: { anterior_side: 'left', ...IMAGE_FIELDS } });
  assert.deepEqual(g.vertebrae.C7, { superior: [[10, 110], [20, 111]], inferior: null, quadrilateral: null });
  assert.equal(g.c7_centroid, undefined, 'a cervical projection has no c7_centroid key');
  const { study, warned } = reload(t, g, EMPTY.cervical);   // the file's helper (~L85) and its empty-measurements fixture (~L80)
  assert.notEqual(study.geometry, null, 'the store validator accepts it');
  assert.equal(warned, 0);
});

test('a full-spine projection leaves c7_centroid null for a partial C7 and l1_center null for a partial L1, and the validator accepts both', (t) => {
  const editor = editorWith({
    C7: { superior: [[10, 110], [20, 111]], inferior: null },
    L1: { superior: null, inferior: [[10, 140], [20, 141]] },
    S1: { superior: [[10, 200], [20, 200]] },
  });
  const g = projectGeometry(editor, { geometry: { anterior_side: 'left', ...IMAGE_FIELDS } });
  assert.equal(g.c7_centroid, null);
  assert.equal(g.l1_center, null);
  assert.deepEqual(g.vertebrae.L1, { superior: null, inferior: [[10, 140], [20, 141]], quadrilateral: null });
  assert.notEqual(reload(t, g, EMPTY.full_spine).study.geometry, null);
});

test('C2 with its centroid alone writes c2_centroid and no C2 vertebra; with its pair alone the vertebra and a null centroid', () => {
  const centroidOnly = projectGeometry(editorWith({ C2: { inferior: null, centroid: [45, 12] }, C7: CERVICAL_PLACEMENTS.C7 }, { region: 'cervical' }), { geometry: { anterior_side: 'left' } });
  assert.deepEqual(centroidOnly.c2_centroid, [45, 12]);
  assert.equal('C2' in centroidOnly.vertebrae, false);
  const pairOnly = projectGeometry(editorWith({ C2: { inferior: [[40, 20], [50, 22]], centroid: null } }, { region: 'cervical' }), { geometry: { anterior_side: 'left' } });
  assert.equal(pairOnly.c2_centroid, null);
  assert.deepEqual(pairOnly.vertebrae.C2, { superior: null, inferior: [[40, 20], [50, 22]], quadrilateral: null });
  assert.deepEqual(levelsFromGeometry(centroidOnly).C2, { inferior: null, centroid: [45, 12] }, 'and it reads back');
  assert.deepEqual(levelsFromGeometry(pairOnly).C2, { inferior: [[40, 20], [50, 22]], centroid: null });
});

test('anteriorSideFrom reads a body\'s superior pair, else its inferior pair, and skips C2 without its pair', () => {
  assert.equal(anteriorSideFrom(editorWith({ C7: { superior: null, inferior: [[10, 120], [20, 122]] } }), null), 'left');
  assert.equal(anteriorSideFrom(editorWith({ C7: { superior: null, inferior: [[20, 120], [10, 122]] } }), null), 'right');
  assert.equal(anteriorSideFrom(editorWith({ C2: { inferior: null, centroid: [45, 12] } }), null), null);
  assert.equal(anteriorSideFrom(editorWith({ C2: { inferior: null, centroid: [45, 12] }, C3: { superior: [[10, 30], [20, 31]], inferior: null } }), null), 'left');
});

test('a lumbar projection writes a partial body with no quadrilateral and the validator accepts it; a half pair, no pair and a stray quadrilateral are rejected', (t) => {
  const editor = editorWith({ L1: { superior: [[10, 10], [20, 11]], inferior: null }, L2: bodyAt(10, 30), S1: { superior: [[10, 200], [20, 200]] } }, { region: 'lumbar' });
  const g = projectGeometry(editor, { geometry: IMAGE_FIELDS });
  assert.deepEqual(g.vertebrae.L1, { superior: [[10, 10], [20, 11]], inferior: null, quadrilateral: null });
  assert.equal(g.l1_center, null);
  const kept = (geometry) => reload(t, geometry, EMPTY.lumbar).study.geometry;
  assert.notEqual(kept(g), null);
  assert.equal(kept({ ...g, vertebrae: { ...g.vertebrae, L1: { superior: [[10, 10]], inferior: null, quadrilateral: null } } }), null, 'half a pair is rejected');
  assert.equal(kept({ ...g, vertebrae: { ...g.vertebrae, L1: { superior: null, inferior: null, quadrilateral: null } } }), null, 'no pair is rejected');
  assert.equal(kept({ ...g, vertebrae: { ...g.vertebrae, L1: { ...g.vertebrae.L1, quadrilateral: [[0, 0], [1, 0], [1, 1], [0, 1]] } } }), null, 'a quadrilateral with a pair missing is rejected');
  assert.equal(kept({ ...g, l1_center: [15, 10] }), null, 'l1_center with a partial L1 is rejected');
});
```

In `test/persistence.test.js` add, beside `'validate accepts measurements with L1PA and the extra lordosis levels absent'`:

```js
test('validate accepts a lumbar body with one endplate and ties LL to that body\'s superior endplate', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const geometry = fullGeometry();   // the file's lumbar fixture
  geometry.vertebrae.L1 = { superior: null, inferior: [[10, 20], [20, 20]], quadrilateral: null };
  geometry.l1_center = null;
  const ok = { version: STORE_VERSION, studies: [{ ...identity('SP-1000'), measurements: { PI: 50, PT: 20, SS: 30, LL: { 'L1-S1': null, 'L2-S1': 40 } }, geometry }] };
  assert.notEqual(validate(ok)[0].geometry, null);
  const claims = { version: STORE_VERSION, studies: [{ ...identity('SP-1001'), measurements: { PI: 50, PT: 20, SS: 30, LL: { 'L1-S1': 45 } }, geometry }] };
  assert.equal(validate(claims)[0].measurements, null, 'an L1–S1 value with no L1 superior endplate has no landmark');
  assert.equal(warn.mock.callCount(), 1);
});
```

(`identity(id)` at ~L49 and `fullGeometry()` at ~L53 are the file's own fixtures; `fullGeometry()` is its lumbar study geometry with every body whole.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/level-projection.test.js test/persistence.test.js`
Expected: FAIL — `quadrilateral` throws on a null pair; the validator nulls the partial lumbar geometry; `anteriorSideFrom` throws on `superior[0]` of a null pair.

- [ ] **Step 3: Implement**

`renderer/data/level-projection.js`:
- `quadrilateral(body)`: `body.superior && body.inferior ? [...] : null`.
- `const copyPairOrNull = pair => (pair ? copyPair(pair) : null)`; `cervicalPart`: C2 is written into `vertebrae` only when `geometry.inferior` is a pair; `c2Centroid` = the centroid copied or null; each other body `{superior: copyPairOrNull(..), inferior: copyPairOrNull(..), quadrilateral: quadrilateral(geometry)}`; `c7_centroid: c7?.quadrilateral ? mean(c7.quadrilateral) : null`.
- `lumbarPart`: the same per body; `l1_center: vertebrae.L1?.quadrilateral ? mean(vertebrae.L1.quadrilateral) : null`.
- `anteriorSideFrom`: `const pair = kindOf(code) === 'c2' ? entry.geometry.inferior : (entry.geometry.superior ?? entry.geometry.inferior); if (!pair) continue;`.

`renderer/data/persistence.js`:
- A helper `partialBody(v)`: `v` an object; `superior` and `inferior` each null or `points(., 2)`; at least one a pair; `quadrilateral` is `points(., 4)` when both pairs are present and `null` otherwise (`== null` accepted for a stored body that never had the key on a cervical film: keep the cervical branch as it is).
- The lumbar branch: replace the three `points(...)` requirements with `partialBody(v)`; `l1_center` required exactly when `g.vertebrae.L1?.quadrilateral` is present, else must be null.
- The full-spine branch's lumbar bodies: `partialBody(body)` in place of the three `points(...)`.
- `measurementsHaveLandmarks`, lumbar branch: `Boolean(g.vertebrae[level]?.superior && g.s1_superior)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/level-projection.test.js test/persistence.test.js test/levels.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/level-projection.js renderer/data/persistence.js test/level-projection.test.js test/persistence.test.js
git commit -m "feat(projection): nullable endplates through the projection and the store validator"
```

---

### Task 3: The backend's lumbar validator accepts a body with one endplate

**Files:**
- Modify: `backend/utils.py` (`spinopelvic_measurements_from_geometry`, L308–400)
- Test: `backend/tests/unit/test_partial_measurements.py`

**Interfaces:**
- Consumes: the geometry Task 2 writes.
- Produces: `spinopelvic_measurements_from_geometry(vertebrae, s1_superior, femoral_circles, l1_center=None, *, allow_empty=False)` accepting, per body, `superior` and `inferior` each a (2, 2) pair of distinct finite points or `None`, at least one present; `quadrilateral` a (4, 2) array when both pairs are present and `None` otherwise; `LL["<level>-S1"]` None for a body without its superior endplate; `l1_center` None (and `L1PA` None) for an L1 without its quadrilateral; `qc.coverage.available` lists a partial body as a whole one.

- [ ] **Step 1: Write the failing tests** in `backend/tests/unit/test_partial_measurements.py`:

```python
def partial(top, keep):
    whole = body(top)
    return {'superior': whole['superior'] if keep == 'superior' else None,
            'inferior': whole['inferior'] if keep == 'inferior' else None,
            'quadrilateral': None}


def test_a_body_with_its_superior_endplate_alone_gives_its_lordosis_and_a_whole_l1_still_gives_l1pa():
    vertebrae, s1, circles = anatomy(NAMES)
    vertebrae['L3'] = partial(50, 'superior')
    result = spinopelvic_measurements_from_geometry(vertebrae, s1, circles)
    complete = spinopelvic_measurements_from_geometry(*anatomy(NAMES))
    assert result['measurements']['LL']['L3-S1'] == complete['measurements']['LL']['L3-S1']
    assert result['measurements']['L1PA'] == complete['measurements']['L1PA']
    assert result['geometry']['vertebrae']['L3'] == vertebrae['L3']
    assert result['qc']['coverage']['available'] == list(NAMES)


def test_a_body_with_its_inferior_endplate_alone_gives_no_lordosis_and_a_partial_l1_gives_no_l1pa():
    vertebrae, s1, circles = anatomy(NAMES)
    vertebrae['L1'] = partial(10, 'inferior')
    result = spinopelvic_measurements_from_geometry(vertebrae, s1, circles)
    assert result['measurements']['LL']['L1-S1'] is None
    assert result['measurements']['L1PA'] is None
    assert result['geometry']['l1_center'] is None
    assert result['measurements']['LL']['L2-S1'] is not None
    assert result['measurements']['PI'] is not None
    import json
    json.dumps(result, allow_nan=False)


@pytest.mark.parametrize('bad', [
    {'superior': None, 'inferior': None, 'quadrilateral': None},
    {'superior': [[20, 10]], 'inferior': None, 'quadrilateral': None},
    {'superior': [[20, 10], [80, 10]], 'inferior': None, 'quadrilateral': [[20, 10], [80, 10], [80, 20], [20, 20]]},
    {'superior': [[20, 10], [80, 10]], 'inferior': [[20, 20], [80, 20]], 'quadrilateral': None},
    {'superior': [[20, 10], [20, 10]], 'inferior': None, 'quadrilateral': None},
])
def test_a_body_with_no_endplate_a_half_pair_or_a_quadrilateral_that_does_not_match_its_pairs_is_rejected(bad):
    vertebrae, s1, circles = anatomy(NAMES)
    vertebrae['L2'] = bad
    with pytest.raises(ValueError):
        spinopelvic_measurements_from_geometry(vertebrae, s1, circles)


def test_a_full_spine_film_passes_a_partial_lumbar_body_through():
    from backend.global_sva_measurements import global_sva_measurements_from_geometry
    vertebrae, s1, circles = anatomy(NAMES)
    vertebrae['L1'] = partial(10, 'inferior')
    result = global_sva_measurements_from_geometry({
        'region': 'full_spine', 'anterior_side': 'left', 'vertebrae': vertebrae,
        's1_superior': s1, 'femoral_circles': circles, 'c7_centroid': None, 'c2_centroid': None})
    assert result['measurements']['LL']['L1-S1'] is None
    assert result['measurements']['L1PA'] is None
    assert result['measurements']['GLOBAL_SVA_PX'] is None
    assert result['geometry']['l1_center'] is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (PowerShell): `& $env:SPINE_CONTOUR_PYTHON -m pytest backend/tests/unit/test_partial_measurements.py -q`
Expected: FAIL — `ValueError: L3 inferior must contain finite image points` on the first two; the rejection test's fourth case (both pairs, no quadrilateral) already raises, the others must also raise after the change.

- [ ] **Step 3: Implement in `backend/utils.py` `spinopelvic_measurements_from_geometry`**

Per body: for `superior` and `inferior`, `None` is kept as `None`; a present value must be a (2, 2) finite array with distinct endpoints (the existing checks); at least one must be present (`ValueError(f"{level} needs its superior or inferior endplate")`). `quadrilateral`: when both pairs are present it must be a (4, 2) finite array (as today); when a pair is absent it must be `None` (`ValueError(f"{level} quadrilateral needs both endplates")`). `endplates[level]` is set only from a present `superior`. `l1_center` is derived from `vertebrae["L1"]["quadrilateral"]` only when it is not `None`; with no quadrilateral and no explicit `l1_center`, `l1_center_array` stays `None`. The returned `geometry["vertebrae"]` carries the bodies as given (nulls included). Everything else is unchanged.

- [ ] **Step 4: Run the backend unit suite**

Run (PowerShell): `& $env:SPINE_CONTOUR_PYTHON -m pytest backend/tests/unit -q`
Expected: PASS, every test (the parametrised subset test in the same file still passes: whole bodies are unchanged).

- [ ] **Step 5: Commit**

```bash
git add backend/utils.py backend/tests/unit/test_partial_measurements.py
git commit -m "feat(backend): the lumbar validator accepts a body with one endplate"
```

---

### Task 4: Handles and chips of a partial level

**Files:**
- Modify: `renderer/viewer/level-handles.js` (`selectedLevelChips` ~L118–135)
- Test: `test/level-handles.test.js`

**Interfaces:**
- Consumes: Task 1's `partsOf`, `firstHandle`, `isPartial`.
- Produces: `selectedLevelChips(editor)` → `{code, chips: {handle, label, colorKey, focused, aiming, placed}[]}|null` with one chip per **step** of the kind (a head: one per existing rim handle, as before, each `placed: true`); a missing point's chip has `placed: false, focused: false, aiming: false`; `STEP_HANDLES` exported: `{body: ['SA', 'SP', 'IA', 'IP'], c2: ['IA', 'IP', 'CENTROID'], endplate: ['SA', 'SP'], centroid: ['CENTROID']}`. `levelHandles`, `handleAt`, `handleOrder`, `nextLevelHandle`, `aimedStep`, `moveHandle`, `nudgeHandle` are unchanged in code and list existing points only.

- [ ] **Step 1: Write the failing tests** in `test/level-handles.test.js` (import `STEP_HANDLES`; from levels.js also `firstHandle, setLevelGeometry, aimHandle`):

```js
test('a partial body has the handles of its one endplate only, in Tab order, and Tab never reaches a missing point', () => {
  const partial = { superior: null, inferior: [[30, 30], [60, 30]] };
  assert.deepEqual(levelHandles('L3', partial).map((h) => h.handle), ['IA', 'IP']);
  assert.equal(handleAt('L3', partial, 'SA'), null);
  assert.equal(moveHandle('L3', partial, 'SA', [1, 1]), partial, 'a missing handle cannot be moved');
  const editor = setLevelGeometry(lumbarEditor(), 'L3', partial);
  assert.deepEqual(handleOrder(editor).filter((h) => h.code === 'L3').map((h) => h.handle), ['IA', 'IP']);
  assert.deepEqual(levelHandles('C2', { inferior: null, centroid: [45, 12] }).map((h) => h.handle), ['CENTROID']);
});

test('selectedLevelChips lists every step of a partial level, the missing points hollow (placed false) and never focused or armed', () => {
  const editor = selectLevel(setLevelGeometry(lumbarEditor(), 'L3', { superior: [[30, 20], [60, 20]], inferior: null }), 'L3');
  const { chips } = selectedLevelChips(editor);
  assert.deepEqual(chips.map((c) => [c.handle, c.label, c.placed, c.focused]), [['SA', 'SA', true, true], ['SP', 'SP', true, false], ['IA', 'IA', false, false], ['IP', 'IP', false, false]]);
  assert.deepEqual(chips.map((c) => c.colorKey), ['SA', 'SP', 'IA', 'IP']);
  const armed = aimHandle(editor, 'L3', 'IA');
  assert.equal(armed, editor, 'a missing point cannot be armed');
  assert.equal(aimedStep({ ...editor, aiming: true, handle: { code: 'L3', handle: 'IA' } }), null);
  const c2 = selectLevel(setLevelGeometry(lumbarEditor(), 'C2', { inferior: null, centroid: [45, 12] }), 'C2');
  assert.deepEqual(selectedLevelChips(c2).chips.map((c) => [c.label, c.placed, c.focused]), [['IA', false, false], ['IP', false, false], ['CENTROID', true, true]]);
});

test('a whole level\'s chips all read placed, and a head\'s chips are unchanged', () => {
  assert.deepEqual(selectedLevelChips(selectLevel(lumbarEditor(), 'L4')).chips.map((c) => c.placed), [true, true, true, true]);
  assert.deepEqual(selectedLevelChips(selectLevel(lumbarEditor(), 'FH1')).chips.map((c) => [c.label, c.placed]), [['P1', true], ['P2', true], ['P3', true], ['P4', true]]);
});

test('STEP_HANDLES names each kind\'s handles in step order, and firstHandle agrees with levelHandles for every part', () => {
  assert.deepEqual(STEP_HANDLES, { body: ['SA', 'SP', 'IA', 'IP'], c2: ['IA', 'IP', 'CENTROID'], endplate: ['SA', 'SP'], centroid: ['CENTROID'] });
  const cases = [
    ['L3', { superior: [[1, 1], [2, 1]], inferior: null }], ['L3', { superior: null, inferior: [[1, 2], [2, 2]] }], ['L3', body(1, 1)],
    ['C2', { inferior: null, centroid: [1, 1] }], ['C2', { inferior: [[1, 2], [2, 2]], centroid: null }], ['C2', c2],
    ['S1', endplate], ['T4', centroid], ['FH1', circle],
  ];
  for (const [code, geometry] of cases) assert.equal(firstHandle(code, geometry), levelHandles(code, geometry)[0].handle, code);
});
```

Note on the second test: `aimHandle` (levels.js) must refuse a handle the level lacks. That is a one-line addition to `aimHandle` in Task 1's file: refuse unless `partOfHandle`'s part is non-null in the geometry (a rim handle: unchanged). Make that change here, in this task, with this test.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/level-handles.test.js`
Expected: FAIL — `STEP_HANDLES` is not exported; `selectedLevelChips` lists two chips for the partial L3 and none carries `placed`; `aimHandle` arms IA.

- [ ] **Step 3: Implement**

`renderer/viewer/level-handles.js`: `export const STEP_HANDLES = {...}`; `selectedLevelChips`: for a circle as before with `placed: true`; otherwise map `STEP_HANDLES[kindOf(code)]` with `placementSteps(code).steps` by index, `placed = handleAt(code, entry.geometry, handle) !== null`, `focused`/`aiming` as before but only when `placed`. `renderer/data/levels.js` `aimHandle`: `if (kindOf(code) !== 'circle' && entry.geometry[partOfHandle(code, handle)] == null) return editor;` (a null part, or a handle the kind lacks).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/level-handles.test.js test/levels.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add renderer/viewer/level-handles.js renderer/data/levels.js test/level-handles.test.js
git commit -m "feat(handles): chips list a partial level's missing points hollow; a missing point cannot be armed"
```

---

### Task 5: The canvas, the plates and the hit test draw what exists

**Files:**
- Modify: `renderer/viewer/canvas.js` (`shapeParts` L497–517; `drawDynamicLayer`'s outline ~L750–755)
- Modify: `renderer/viewer/level-labels.js` (`hasPlateGeometry` L42–51, `labelAnchor` L55–63, `labelPlacement` L77–90)
- Modify: `renderer/viewer/interactions.js` (`vertebraAt` L126–136)
- Test: `test/canvas.test.js`, `test/level-labels.test.js`, `test/interactions.test.js`

**Interfaces:**
- Consumes: Task 1's shapes.
- Produces: `shapeParts` (internal) gives a body with one pair `[{line: pair}]` (no `area`, not `closed`), C2 its line and/or dot; outside edit mode a body's outline is `quadrilateral ?? inferior ?? superior`; `labelAnchor('L3', {superior: pair, inferior: null})` is SP, `labelAnchor('L3', {superior: null, inferior: pair})` is IP, `labelAnchor('C2', {inferior: null, centroid})` is the centroid; `labelPlacement` reads the side from the one pair (posterior x − anterior x) or, for C2 without its pair, the film's side; `vertebraAt` hits a body without a quadrilateral within `radius` of its one endplate.

- [ ] **Step 1: Write the failing tests**

`test/canvas.test.js` (beside `'a body is the closed quadrilateral SA SP IP IA…'` at ~L392; use the file's `drawEditor`, `recordingContext`, `lumbarEditor`, `arcsOf`, `levelStrokes` helpers):

```js
test('a body with one endplate is drawn as that line, open and unfilled; C2 with its centroid alone is the dot alone', () => {
  const upper = setLevelGeometry(lumbarEditor('L3'), 'L3', { superior: [[30, 20], [60, 20]], inferior: null });
  const rec = drawEditor(upper);
  const moves = rec.calls.filter(([name]) => name === 'moveTo').map(([, args]) => args);
  assert.deepEqual(moves.filter(([x, y]) => x === 30 && y === 20).length, 1, 'the superior line starts at SA');
  assert.equal(rec.calls.some(([name]) => name === 'closePath'), false, 'no closed quadrilateral');
  assert.equal(rec.calls.filter(([name]) => name === 'fill').length, 2, 'the two handle discs are filled; the line has no area to fill');
  const handleArcs = arcsOf(rec.calls).filter(([x, y]) => y === 20 && (x === 30 || x === 60));
  assert.equal(handleArcs.length, 2, 'handles at SA and SP');
  assert.equal(arcsOf(rec.calls).some(([, y]) => y === 50), false, 'no handle where the inferior pair would be');
  const c2 = setLevelGeometry(lumbarEditor('C2'), 'C2', { inferior: null, centroid: [45, 12] });
  const dots = arcsOf(drawEditor(c2).calls).filter(([x, y]) => x === 45 && y === 12);
  assert.equal(dots.length >= 1, true, 'the centroid dot');
  assert.equal(drawEditor(c2).calls.some(([name]) => name === 'moveTo'), false, 'no inferior line');
});

test('outside edit mode a body with one endplate is outlined as that line, open', () => {
  const closes = (geometry) => {
    const rec = recordingContext();
    drawDynamicLayer(rec.ctx, EDITOR_CANVAS, geometry, { selectedLevel: null, measurements: null });
    return { rec, closed: rec.calls.filter(([name]) => name === 'closePath').length };
  };
  const whole = closes(fakeGeometry()).closed;
  const geometry = fakeGeometry();
  const [code] = Object.keys(geometry.vertebrae);
  geometry.vertebrae[code] = { superior: [[10, 30], [20, 30]], inferior: null, quadrilateral: null };
  const { rec, closed } = closes(geometry);
  assert.equal(rec.calls.some(([name, args]) => name === 'moveTo' && args[0] === 10 && args[1] === 30), true, 'the line starts at SA');
  assert.equal(rec.calls.some(([name, args]) => name === 'lineTo' && args[0] === 20 && args[1] === 30), true, 'and reaches SP');
  assert.equal(closed, whole - 1, 'one body fewer closes its path');
});
```

`test/level-labels.test.js`:

```js
test('a body with one endplate anchors its plate on that endplate\'s posterior corner and reads its side from the pair', () => {
  assert.deepEqual(labelPlacement('L3', { superior: [[30, 20], [60, 20]], inferior: null }, null), { anchor: [60, 20], side: 1 });
  assert.deepEqual(labelPlacement('L3', { superior: null, inferior: [[90, 50], [60, 50]] }, null), { anchor: [60, 50], side: -1 });
  assert.deepEqual(labelPlacement('L3', { superior: [[40, 20], [40.5, 20]], inferior: null }, 'right'), { anchor: [40.5, 20], side: -1 }, 'under 1 px: the film\'s side');
});

test('C2 without its pair anchors on its centroid with the film\'s side; without its centroid it reads the side from IP against IA', () => {
  assert.deepEqual(labelPlacement('C2', { inferior: null, centroid: [45, 12] }, 'right'), { anchor: [45, 12], side: -1 });
  assert.deepEqual(labelPlacement('C2', { inferior: null, centroid: [45, 12] }, null), { anchor: [45, 12], side: 1 });
  assert.deepEqual(labelPlacement('C2', { inferior: [[40, 20], [50, 20]], centroid: null }, null), { anchor: [50, 20], side: 1 });
  assert.equal(labelPlacement('C2', { inferior: null, centroid: null }, null), null);
});
```

`test/interactions.test.js` (beside the `vertebraAt` tests at ~L135):

```js
test('vertebraAt hits a body with no quadrilateral within the radius of its one endplate', () => {
  const geometry = { region: 'lumbar', vertebrae: { L2: { superior: [[0, 20], [40, 20]], inferior: null, quadrilateral: null } }, s1_superior: null };
  assert.equal(vertebraAt(geometry, [20, 25]), 'L2');
  assert.equal(vertebraAt(geometry, [20, 60]), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/canvas.test.js test/level-labels.test.js test/interactions.test.js`
Expected: FAIL — `shapeParts` returns `[]` for the partial body (nothing drawn, no handles' arcs), `labelPlacement` returns null, `vertebraAt` throws or returns null.

- [ ] **Step 3: Implement**

- `canvas.js` `shapeParts`: `body` → both pairs: as now; one pair: `[{ line: pair }]`; neither (or a bad shape): `[]`. `c2` → `[...(isPair(inferior) ? [{ line: inferior }] : []), ...(isPoint(centroid) ? [{ arc: centroid, radius: …, area: true, dot: true }] : [])]`, `[]` when both are missing. `drawDynamicLayer`: `const outline = body.quadrilateral ?? body.inferior ?? body.superior;` (the `closePath` stays conditional on `body.quadrilateral`).
- `level-labels.js`: `hasPlateGeometry` `body` → `isPair(superior) || isPair(inferior)`; `c2` → `isPair(inferior) || isPoint(centroid)`. `labelAnchor` `body` → both pairs: the midpoint as now; else `copy(pair[1])` of the one pair; `c2` → `isPair(inferior) ? copy(inferior[1]) : copy(centroid)`. `labelPlacement` `body` → both pairs: as now; one pair: `sideOf(pair[1][0] - pair[0][0], anteriorSide)`; `c2` → pair and centroid: as now; pair only: `sideOf(inferior[1][0] - inferior[0][0], anteriorSide)`; centroid only: `filmSide(anteriorSide)`.
- `interactions.js` `vertebraAt`: `if (body && body.quadrilateral && pointInPolygon(point, body.quadrilateral)) return level; const plate = body && (body.superior ?? body.inferior); if (plate && distanceToSegment(point, plate[0], plate[1]) <= radius) return level;`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/canvas.test.js test/level-labels.test.js test/interactions.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add renderer/viewer/canvas.js renderer/viewer/level-labels.js renderer/viewer/interactions.js test/canvas.test.js test/level-labels.test.js test/interactions.test.js
git commit -m "feat(canvas): a partial body draws as its one endplate, with its plate and hit test on that line"
```

---

### Task 6: The label record and the amended schema

**Files:**
- Modify: `renderer/data/label-record.js` (`bodyCorners`, `c2Corners` ~L52–54; `levelRecord` ~L68–95; `geometryOf` ~L190–215)
- Modify: `docs/design/level-editor/label-record.schema.json` (`description`; `$defs/corners4`, `$defs/c2corners`, `$defs/c2`, `$defs/vertebra`'s manual `minItems`; a new `$defs/nullablePoint`)
- Create: `docs/design/level-editor/label-record.partial.example.json`
- Test: `test/label-record.test.js`

**Interfaces:**
- Consumes: Task 1's shapes and `changedPoints`.
- Produces: `toLabelRecord` writes a body's `corners` and `model_corners` as `{sa, sp, ia, ip}` with nulls by pair, C2's `corners` as `{ia, ip}` nullable together and `centroid` nullable; `recordLevels` reads them back into the canonical shapes and returns `geometry: null` for a half pair or an entry with no part. The schema accepts exactly that.

- [ ] **Step 1: Write the failing tests** in `test/label-record.test.js` (import `setLevelGeometry` is already there; add `PARTIAL_EXAMPLE` read like `EXAMPLE`):

```js
const PARTIAL_EXAMPLE = JSON.parse(fs.readFileSync(new URL('../docs/design/level-editor/label-record.partial.example.json', import.meta.url), 'utf8'));

test('a manual body with one endplate writes nullable corners by pair and lists its placed keys; the record validates and reads back', () => {
  let editor = openEditor({ study: { id: 'SP-0003', geometry: null, labelFile: null }, region: 'cervical', modelGeometry: null, saved: null });
  editor = setLevelGeometry(editor, 'C7', { superior: [[10, 110], [20, 110]], inferior: null });
  editor = setLevelGeometry(editor, 'C2', { inferior: null, centroid: [45, 12] });
  const record = toLabelRecord({ editor, study: { ...STUDY, region: 'cervical' }, image: IMAGE, model: MODEL, savedAt: SAVED_AT });
  assert.deepEqual(record.levels.C7.corners, { sa: [10, 110], sp: [20, 110], ia: null, ip: null });
  assert.deepEqual(record.levels.C7.edited_points, ['sa', 'sp']);
  assert.equal(record.levels.C7.state, 'manual');
  assert.deepEqual(record.levels.C2.corners, { ia: null, ip: null });
  assert.deepEqual(record.levels.C2.centroid, [45, 12]);
  assert.deepEqual(record.levels.C2.edited_points, ['centroid']);
  assert.equal(record.edits.points_placed, 3);
  assert.equal(record.complete, true);
  const valid = validateAgainst(SCHEMA, record);
  assert.deepEqual(valid.errors, []);
  const back = recordLevels(record);
  assert.deepEqual(back.C7.geometry, { superior: [[10, 110], [20, 110]], inferior: null });
  assert.deepEqual(back.C2.geometry, { inferior: null, centroid: [45, 12] });
});

test('an endplate removed from a model body writes edited with the removed keys and a whole model_corners; one added writes partial model_corners', () => {
  const whole = { superior: [[10, 110], [20, 110]], inferior: [[10, 120], [20, 120]] };
  const study = { id: 'SP-0004', geometry: { region: 'cervical', vertebrae: { C7: { ...whole, quadrilateral: null } }, c2_centroid: null } };
  let editor = openEditor({ study, region: 'cervical', modelGeometry: study.geometry, saved: null });
  editor = setLevelGeometry(editor, 'C7', { superior: whole.superior, inferior: null });
  let record = toLabelRecord({ editor, study: STUDY, image: IMAGE, model: MODEL, savedAt: SAVED_AT });
  assert.equal(record.levels.C7.state, 'edited');
  assert.deepEqual(record.levels.C7.edited_points, ['ia', 'ip']);
  assert.deepEqual(record.levels.C7.corners, { sa: [10, 110], sp: [20, 110], ia: null, ip: null });
  assert.deepEqual(record.levels.C7.model_corners, { sa: [10, 110], sp: [20, 110], ia: [10, 120], ip: [20, 120] });
  assert.equal(record.edits.points_moved, 2);
  assert.deepEqual(validateAgainst(SCHEMA, record).errors, []);
  const partialStudy = { id: 'SP-0005', geometry: { region: 'cervical', vertebrae: { C7: { superior: whole.superior, inferior: null, quadrilateral: null } }, c2_centroid: null } };
  editor = openEditor({ study: partialStudy, region: 'cervical', modelGeometry: partialStudy.geometry, saved: null });
  editor = setLevelGeometry(editor, 'C7', whole);
  record = toLabelRecord({ editor, study: STUDY, image: IMAGE, model: MODEL, savedAt: SAVED_AT });
  assert.deepEqual(record.levels.C7.edited_points, ['ia', 'ip']);
  assert.deepEqual(record.levels.C7.model_corners, { sa: [10, 110], sp: [20, 110], ia: null, ip: null });
  assert.deepEqual(validateAgainst(SCHEMA, record).errors, []);
});

test('the schema holds a pair together: a half pair, no pair, and a C2 with neither its pair nor its centroid are rejected; the partial example validates', () => {
  assert.deepEqual(validateAgainst(SCHEMA, PARTIAL_EXAMPLE).errors, []);
  assert.deepEqual(validateAgainst(SCHEMA, EXAMPLE).errors, [], 'the whole example still validates');
  const broken = (patch) => { const value = structuredClone(PARTIAL_EXAMPLE); patch(value); return validateAgainst(SCHEMA, value).ok; };
  assert.equal(broken((v) => { v.levels.C7.corners.sp = null; }), false, 'sa without sp');
  assert.equal(broken((v) => { v.levels.C7.corners.sa = null; v.levels.C7.corners.sp = null; }), false, 'no pair at all');
  assert.equal(broken((v) => { v.levels.C7.corners.ia = [1, 1]; }), false, 'ia without ip');
  assert.equal(broken((v) => { v.levels.C2.centroid = null; }), false, 'C2 with neither');
  assert.equal(broken((v) => { v.levels.C2.corners.ia = [1, 1]; }), false, 'C2 half a pair');
  assert.equal(broken((v) => { v.levels.C7.edited_points = []; }), false, 'a manual body lists at least one key');
  assert.equal(broken((v) => { v.levels.C7.corners.ia = [1, 2]; v.levels.C7.corners.ip = [2, 2]; v.levels.C7.edited_points = ['sa', 'sp', 'ia', 'ip']; }), true, 'made whole');
});

test('recordLevels reads a half pair or an entry with no part as no geometry, without throwing', () => {
  const record = structuredClone(PARTIAL_EXAMPLE);
  record.levels.C7.corners.sp = null;
  assert.equal(recordLevels(record).C7.geometry, null);
  record.levels.C7.corners = { sa: null, sp: null, ia: null, ip: null };
  assert.equal(recordLevels(record).C7.geometry, null);
  record.levels.C2.centroid = null;
  assert.equal(recordLevels(record).C2.geometry, null);
  assert.equal(recordLevels(record).C7.visible, true, 'the state is still read');
});

test('the schema description records the partial-endplates amendment under the same id', () => {
  assert.equal(SCHEMA.$id, 'spinecontour.segmentation-label/1');
  assert.match(SCHEMA.description, /2026-10-21/);
  assert.match(SCHEMA.description, /endplate/i);
});
```

The existing `'every record toLabelRecord builds validates, whatever the mix of states'` and R39 tests must keep passing unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/label-record.test.js`
Expected: FAIL — the partial example file does not exist; `bodyCorners` throws on `g.inferior[0]` of null; the schema rejects `ia: null`.

- [ ] **Step 3: Implement**

`renderer/data/label-record.js`: `const pointOrNull = p => (isPoint(p) ? copyPoint(p) : null)`; `bodyCorners(g)` → `{ sa: pointOrNull(g.superior?.[0]), sp: pointOrNull(g.superior?.[1]), ia: pointOrNull(g.inferior?.[0]), ip: pointOrNull(g.inferior?.[1]) }`; `c2Corners` likewise over `g.inferior`; `levelRecord` `c2`: `centroid: pointOrNull(g.centroid)`, `model_centroid: edited ? pointOrNull(model.centroid) : null`. `geometryOf`: `const pairOrNull = (a, b) => (a == null && b == null ? null : pointPair(a, b))`, where a half pair (`pointPair` null while one of them is non-null) marks the entry bad: `body` → `superior = pairOrNull(sa, sp)`, `inferior = pairOrNull(ia, ip)`; return null when either pair is "half" (one of its two keys non-null and `pointPair` null) or both are null; else `{superior, inferior}`. `c2` → `inferior = pairOrNull(ia, ip)`, `centroid = isPoint(raw.centroid) ? copy : (raw.centroid == null ? null : BAD)`; null when half, bad, or both absent; else `{inferior, centroid}`.

`label-record.schema.json`:
- `description`: append ` Amended 2026-10-21 (partial endplates, decision N4): a body's corners and a C2's corners and centroid are nullable by endplate — sa and sp together, ia and ip together, at least one part present — and a manual entry lists the keys it holds a point for; the id is unchanged, so every earlier record still validates.`
- `$defs/nullablePoint`: `{ "oneOf": [{ "$ref": "#/$defs/point" }, { "type": "null" }] }`.
- `$defs/corners4`: the four properties `$ref nullablePoint`, all four `required`, plus `"allOf": [PAIR(sa, sp), PAIR(ia, ip), { "anyOf": [{ "properties": { "sa": { "$ref": "#/$defs/point" } } }, { "properties": { "ia": { "$ref": "#/$defs/point" } } }] }]` where `PAIR(a, b)` is `{ "if": { "properties": { "a": { "type": "null" } } }, "then": { "properties": { "b": { "type": "null" } } }, "else": { "properties": { "b": { "$ref": "#/$defs/point" } } } }`.
- `$defs/c2corners`: `ia`, `ip` nullable with `PAIR(ia, ip)` (no "at least one" here: the centroid may carry C2).
- `$defs/c2`: `centroid` and `model_centroid` `$ref nullablePoint`; in the placed-state `then`, add `"anyOf": [{ "properties": { "centroid": { "$ref": "#/$defs/point" } } }, { "properties": { "corners": { "properties": { "ia": { "$ref": "#/$defs/point" } } } } }]`; the `edited` rule's `model_centroid` becomes `nullablePoint`; the manual `minItems` 3 → 1.
- `$defs/vertebra`: the manual `minItems` 4 → 1.

`label-record.partial.example.json`: a cervical film (`"region": "cervical"`, model name `HRNet`), C3–C6 `segmented` whole bodies with `contour` null (no mask on a cervical film), C2 `manual` with `corners {ia: null, ip: null}` and a centroid, `edited_points ["centroid"]`, C7 `manual` with `sa`, `sp` points and `ia`, `ip` null, `edited_points ["sa", "sp"]`, T1 `not_placed`, T4, L1–L5, S1 `not_visible`, both heads `not_visible`, `complete: false`, `edits` `{segmented: 4, edited: 0, manual: 2, not_placed: 1, not_visible: 9, points_moved: 0, points_placed: 3}`, `comment` `"C7's inferior endplate is behind the shoulders."`, the image 1800×2400, a 64-zero sha.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/label-record.test.js`
Expected: PASS (the R38/R39 tests included).

- [ ] **Step 5: Commit**

```bash
git add renderer/data/label-record.js docs/design/level-editor/label-record.schema.json docs/design/level-editor/label-record.partial.example.json test/label-record.test.js
git commit -m "feat(record): nullable corners by endplate under the /1 schema, with a partial example"
```

---

### Task 7: The wiring: FINISH, resume, Delete through the store

**Files:**
- Modify: `renderer/level-editor.js` (`startPlace` ~L540; new exports beside `aimHandle` ~L610–640)
- Test: `test/level-editor-wiring.test.js`

**Interfaces:**
- Consumes: Task 1's `resumePlacing`, `removePart`, `isPartial`; Task 2's projection.
- Produces (exports of `renderer/level-editor.js`): `startPlace(code)` resumes a partial body or C2 (`resumePlacing`) and starts every other level as before; `resumePlace(code: string, step?: number|null): void` — `update(editor => resumePlacing(editor, code, step), { edit: true })`; `removeFocusedPart(): void` — `update(editor => editor.handle ? removePart(editor, editor.handle.code, editor.handle.handle) : editor, { edit: true })`, which commits through `sync` when the level is projected; FINISH uses the existing `fitPlacing(imageSize)` (the wiring already imports `finishPlacing` from the level model, so that name is taken).

- [ ] **Step 1: Write the failing tests** in `test/level-editor-wiring.test.js` (import `resumePlace, removeFocusedPart` too):

```js
test('FINISH after SA and SP commits a C7 with its superior endplate alone, as a cervical film with its side from that pair', async () => {
  const commits = [];
  wire(commits);
  await withStore(failedAutoFilm('SP-9560'), async () => {
    await enterLevelEditor('SP-9560');
    startPlace('C7');
    placePoint([100, 300], IMAGE);
    placePoint([140, 302], IMAGE);
    fitPlacing(IMAGE);
    await settle();
    assert.equal(commits.length, 1);
    const { geometry } = commits[0];
    assert.equal(geometry.region, 'cervical');
    assert.equal(geometry.anterior_side, 'left');
    assert.deepEqual(geometry.vertebrae.C7, { superior: [[100, 300], [140, 302]], inferior: null, quadrilateral: null });
    assert.equal(getState().levelEditor.placing, null);
    assert.equal(levelState(getState().levelEditor.levels.C7, null), 'manual');
    assert.deepEqual(studyOf('SP-9560').geometry.vertebrae.C7.inferior, null, 'the study took it through the queue');
  });
});

test('Place… on a partial level resumes it at its first missing step, and the completing clicks commit the whole body', async () => {
  const commits = [];
  wire(commits);
  await withStore(failedAutoFilm('SP-9561'), async () => {
    await enterLevelEditor('SP-9561');
    startPlace('C7');
    placePoint([100, 300], IMAGE);
    placePoint([140, 302], IMAGE);
    fitPlacing(IMAGE);
    await settle();
    startPlace('C7');
    assert.deepEqual(getState().levelEditor.placing, { code: 'C7', points: [[100, 300], [140, 302], null, null], current: 2, history: [] }, 'Place… resumes at the first missing step');
    cancelPlace();
    assert.deepEqual(getState().levelEditor.levels.C7.geometry, { superior: [[100, 300], [140, 302]], inferior: null }, 'CANCEL left the level as it was');
    resumePlace('C7', 3);
    assert.equal(getState().levelEditor.placing.current, 3, 'a hollow chip chooses its step');
    placePoint([142, 332], IMAGE);
    placePoint([102, 330], IMAGE);
    await settle();
    assert.equal(commits.length, 2);
    assert.deepEqual(commits[1].geometry.vertebrae.C7.quadrilateral, [[100, 300], [140, 302], [142, 332], [102, 330]]);
    assert.equal(getState().levelEditor.placing, null);
  });
});

test('Delete with a point focused removes its endplate and commits; the last part, a placement and a head are refused and commit nothing', async () => {
  const commits = [];
  wire(commits);
  await withStore(failedAutoFilm('SP-9562'), async () => {
    await enterLevelEditor('SP-9562');
    placeBody('C7', [100, 300]);
    await settle();
    assert.equal(commits.length, 1);
    setFocusedHandle({ code: 'C7', handle: 'IP' });
    removeFocusedPart();
    await settle();
    assert.equal(commits.length, 2);
    assert.deepEqual(commits[1].geometry.vertebrae.C7, { superior: [[100, 300], [140, 302]], inferior: null, quadrilateral: null });
    assert.deepEqual(getState().levelEditor.handle, { code: 'C7', handle: 'SA' });
    removeFocusedPart();
    await settle();
    assert.equal(commits.length, 2, 'the last part stays');
    assert.deepEqual(getState().levelEditor.levels.C7.geometry, { superior: [[100, 300], [140, 302]], inferior: null });
    startPlace('C7');
    setFocusedHandle({ code: 'C7', handle: 'SA' });
    removeFocusedPart();
    assert.equal(commits.length, 2, 'not while placing');
    assert.deepEqual(getState().levelEditor.levels.C7.geometry, { superior: [[100, 300], [140, 302]], inferior: null });
  });
});

test('a partial level saves a record with nullable corners that validates, and Edit again reads it back intact', async () => {
  const commits = [];
  wire(commits);
  const bridge = labelBridge();
  bridge.spineContour.loadLabelRecord = async (name) => bridge.saved.find((entry) => entry.name === name)?.record ?? null;
  await withBridge(bridge, () => withStore(failedAutoFilm('SP-9563'), async () => {
    await enterLevelEditor('SP-9563');
    startPlace('C7');
    placePoint([100, 300], IMAGE);
    placePoint([140, 302], IMAGE);
    fitPlacing(IMAGE);
    await settle();
    await saveLevelEdits();
    assert.equal(bridge.saved.length, 1);
    const { record } = bridge.saved[0];
    assert.deepEqual(record.levels.C7.corners, { sa: [100, 300], sp: [140, 302], ia: null, ip: null });
    assert.deepEqual(validateAgainst(SCHEMA, record).errors, []);
    exitNow();
    await enterLevelEditor('SP-9563');
    assert.deepEqual(getState().levelEditor.levels.C7.geometry, { superior: [[100, 300], [140, 302]], inferior: null });
    assert.equal(unsavedCount(getState().levelEditor), 0);
  }));
});
```

The last test sits with the file's G6 group (after ~L500), where `labelBridge()` (~L488) records the main process's label-record channels and `withBridge` (~L502) installs it on `globalThis.window` for the test's duration; `SCHEMA` is defined there (~L438). `exitNow` then `enterLevelEditor` reads the record through the bridge's `loadLabelRecord`, which the test points at what was saved.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/level-editor-wiring.test.js`
Expected: FAIL — `resumePlace` and `removeFocusedPart` are not exported; `fitPlacing` after two corners commits nothing (before Task 1 it was a no-op; after Task 1 the first test may already pass: that is fine, the others fail).

- [ ] **Step 3: Implement in `renderer/level-editor.js`**

`startPlace(code)`: `update((editor) => { const entry = editor.levels[code]; if (!entry) return editor; return entry.visible && isPartial(code, entry.geometry) && ['body', 'c2'].includes(kindOf(code)) ? resumePlacing(editor, code) : startPlacing(editor, code); }, { edit: true })`. `resumePlace(code, step = null)` and `removeFocusedPart()` as in Interfaces, each with a doc comment naming the spec (§4) and the date. Import `resumePlacing, removePart, isPartial, kindOf` from `./data/levels.js`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/level-editor-wiring.test.js`
Expected: PASS.

- [ ] **Step 5: Run the whole unit suite**

Run: `node --test test/*.test.js`
Expected: every test passes; the count is 1161 plus the tests added in Tasks 1–7 (record the number for the release notes).

- [ ] **Step 6: Commit**

```bash
git add renderer/level-editor.js test/level-editor-wiring.test.js
git commit -m "feat(wiring): resume a partial level, remove a focused part, both committed through the store"
```

---

### Task 8: The edit bar, the chips, the Delete key and the panel row; smoke section 22

**Files:**
- Modify: `renderer/components/viewer.js` (the edit bar's buttons L312–330; `buildHandleChips` L1080–1096; `updateEditBar` L1098–1140; `handleKeyDown` L1305–1380)
- Modify: `renderer/components/level-editor.js` (`levelRow`'s `canPlace` ~L80)
- Modify: `styles/screens/analysis.css` (beside `.viewer-step.is-aiming`, L660)
- Modify: `tools/smoke/smoke-levels.mjs` (constants ~L80–112; `EDITBAR_UNDO` ~L257; `domPhase` seeding ~L823–845; a new `partialChecks` before `reviewRecordChecks` ~L1500; the `ours` sets and the `finally` cleanup ~L1520, ~L1620–1640)

**Interfaces:**
- Consumes: Task 4's chips (`placed`), Task 7's `resumePlace`, `removeFocusedPart`, `fitPlacing`; Task 1's `canFinishPlacing`, `kindOf`.
- Produces: DOM only. The FINISH button: `textButton('FINISH', () => fitPlacing(imageSize()), { 'aria-label': 'Finish with the points placed; the rest are not on this film', title: 'Finish with the points placed; the rest are not on this film', class: 'viewer-tool viewer-tool-text is-active is-hidden' })`, appended right after `fitButton`. A missing point's chip: `<button class="viewer-step is-missing" title="Place IA: click here, then on the film">` with its dot, `onClick: () => resumePlace(code, index)`; no `aria-pressed`, no `aria-current`. The CSS rule `.viewer-step.is-missing .viewer-step-dot { border-color: var(--step-color); background: transparent; }`.

- [ ] **Step 1: The viewer**

- Add `finishButton` as above; append it to the edit bar right after `fitButton` (the smoke's `EDITBAR_UNDO` moves to `nth-of-type(3)`).
- `updateEditBar`: `const partialKind = showPlacement && ['body', 'c2'].includes(kindOf(placing.code));` then `finishButton.classList.toggle('is-hidden', !partialKind); finishButton.disabled = busy || !partialKind || !canFinishPlacing(editor, imageSize());` beside the FIT lines (FIT keeps `circle`).
- `buildHandleChips({ code, chips }, busy)`: for `placed === false` build the missing chip as in Interfaces; for a placed chip of a body or C2, the title is the 1.3.1 title plus `; Delete removes its endplate` (C2's CENTROID: `; Delete removes it`); the armed title is unchanged. The chip row's rebuild key (`stepsKey`) already includes the geometry, so a part's removal rebuilds it.
- `handleKeyDown`: after the Tab block and before the arrow block:
  `if (event.key === 'Delete' || event.key === 'Backspace') { if (!editor.handle || !currentImages) return; event.preventDefault(); removeFocusedPart(); return; }` (the busy, drag, placing and window-open returns above it already apply). Update the comment that said Delete and Backspace do nothing.
- Import `resumePlace, removeFocusedPart` from `../level-editor.js` and `isPartial` is not needed here.

- [ ] **Step 2: The panel and the CSS**

`components/level-editor.js` `levelRow`: `const partial = entry.visible && Boolean(entry.geometry) && ['body', 'c2'].includes(kindOf(code)) && isPartial(code, entry.geometry); const canPlace = !placing && (state === 'not_placed' || (circle && entry.visible) || partial);` (import `isPartial`). The Place… button's handler stays `startPlace(code)` (the wiring resumes). The stacked layout already covers Place… above CLEAR or REVERT. `styles/screens/analysis.css`: the `is-missing` rule from Interfaces with a dated comment.

- [ ] **Step 3: Smoke section 22** in `tools/smoke/smoke-levels.mjs`

Constants: `const PARTIAL = 'SP-9305'; // a second unsegmented synthetic film, placed in part (section 22)`, `const PARTIAL_FILE = 'levels-partial.png'; const PARTIAL_PATH = path.join(FILM_DIR, PARTIAL_FILE); const PARTIAL_RECORD = 'levels-partial.label.json';`, `const EDITBAR_FINISH = '.viewer-editbar [aria-label="Finish with the points placed; the rest are not on this film"]';`, `const CHIP = (n) => \`.viewer-steps .viewer-step:nth-child(${n})\`;`, and `EDITBAR_UNDO` → `nth-of-type(3)` with its comment reading `FIT, FINISH, UNDO, CANCEL, RESET TO PREDICTION, DONE`. Seeding: write `films.hand` to `PARTIAL_PATH` too; add `PARTIAL` to every `ours` set and to the cleanup's `ids`, `PARTIAL_RECORD` to the cleanup's record list, `PARTIAL_PATH` to the film removal.

`async function partialChecks()` (called in `domPhase` right before `await reviewRecordChecks(films)`), injecting `SP-9305` as `newStudy({ id: PARTIAL, fileName: PARTIAL_FILE, filePath: PARTIAL_PATH })` with `labelFile: null` (no failure: an Auto film never run), then `openFromList(PARTIAL)`, `enterEdit()`, the 600×800 decode wait as section 12 does. Checks, each a `check('22. …', ok, detail)`:

1. Place… C2, the CENTROID chip (`CHIP(3)`), `editLabel()` reads `PLACING C2 ${MID} 3 OF 3`; `clickImage(300, 120)`; FINISH not hidden and enabled; click it; `badge('C2') === 'Manual'`; `geometryText('C2')` is `{"inferior":null,"centroid":[300,120]}`.
2. Place… C7; `clickImage(200, 400)`; FINISH disabled (one corner); `clickImage(400, 405)`; FINISH enabled; click it; `badge('C7') === 'Manual'`; the chip row has four `.viewer-step` whose classes read `is-done, is-done, is-missing, is-missing` and whose text reads `SA SP IA IP`; `editLabel()` reads `EDITING SEGMENTATION`; `[data-level-key="place:C7"]` is present (Place… offered again).
3. `settled(PARTIAL)`; the study's `geometry.region === 'cervical'`, `geometry.vertebrae.C7` deep-equals `{superior: [[200, 400], [400, 405]], inferior: null, quadrilateral: null}`, `geometry.c2_centroid` `[300, 120]`, `Number.isFinite(measurements.C2C7_SVA_PX)` and `measurements.C2C7_COBB === null`.
4. `clickSelector('.lv-save')`; `toastSeen('Saved 2 edits to the label record.')`; the record `PARTIAL_RECORD` exists under `LABELS`, validates against `SCHEMA`, `levels.C7.corners` deep-equals `{sa: [200, 400], sp: [400, 405], ia: null, ip: null}`, `levels.C7.edited_points` `['sa', 'sp']`, `levels.C2.corners` `{ia: null, ip: null}`, `levels.C2.centroid` `[300, 120]`, `levels.C2.edited_points` `['centroid']`, `edits.points_placed === 3`.
5. `cdp.key('Escape')` (nothing unsaved: edit mode leaves), `enterEdit()` again, `clickSelector('[data-level-key="C7"]')`; the chips read as in check 2 and the editor's `handle` is `{code: 'C7', handle: 'SA'}`.
6. Click `CHIP(3)` (the hollow IA); `editLabel()` reads `PLACING C7 ${MID} 3 OF 4`; the chips' classes read `is-done, is-done, is-current, (none)`; `clickImage(205, 470)`; `clickImage(405, 475)`; `badge('C7') === 'Manual'`; `geometryText('C7')` holds both pairs; `settled(PARTIAL)`; the study's `C7.quadrilateral` has four points and `C2C7_COBB === null` still (C2's inferior pair is missing).
7. `clickSelector('[data-level-key="C7"]')` (focus SA), blur the active element as the film phase does, `cdp.key('Delete')`; `geometryText('C7')` is `{"superior":null,"inferior":[[205,470],[405,475]]}`; the editor's `handle` is `{code: 'C7', handle: 'IA'}`; `settled(PARTIAL)`; the study's `C7.superior === null` and `measurements.C2C7_SVA_PX === null`; `cdp.key('Delete')` again; `geometryText('C7')` unchanged (the last part stays); `window.__lv.unsaved()` unchanged by the second press.
8. `cdp.key('Escape')` to leave with the prompt (unsaved), `clickSelector('[data-level-key="prompt:discard"]')`, which leaves edit mode; nothing else.

- [ ] **Step 4: Launch and run the smoke suite** (PowerShell, from this worktree)

```powershell
Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d"
node tools/smoke/launch.mjs
node tools/smoke/smoke-levels.mjs 2>&1 | Tee-Object -FilePath tools/smoke/out/partial-smoke-levels.txt
node tools/smoke/cdp.mjs --quit
```

Expected: the final line reads `N/N checks passed (phase dom)` with N = 154 plus section 22's checks (about 20), every earlier section unchanged, and `no console errors or exceptions during the run` PASS. A failed check prints `FAIL` with its detail: fix the cause (never the check) and run again from a fresh launch.

- [ ] **Step 5: Run the unit suite once more** (`node --test test/*.test.js`), since the viewer's imports changed.

- [ ] **Step 6: Commit**

```bash
git add renderer/components/viewer.js renderer/components/level-editor.js styles/screens/analysis.css tools/smoke/smoke-levels.mjs
git commit -m "feat(editor): FINISH while placing, hollow chips to complete a level, Delete removes an endplate"
```

---

### Task 9: Docs, the release files and the roadmap

**Files:**
- Modify: `docs/level-editor.md` (the placing table and its paragraphs; "Handles and the keyboard" and its key table; "The label record"; "Verification")
- Modify: `docs/design/level-editor/HANDOFF.md` (§2 "Groups and geometry" and "Rules"; §6's Place…, Handle and a new Delete row; §9's `corners` rows; a new §12b)
- Modify: `docs/ROADMAP.md` (§9)
- Modify: `CHANGELOG.md`, `README.md` (the release-notes link), `package.json` (`version`), `renderer/data/version.js`
- Create: `docs/releases/1.4.0.md`
- Modify: `docs/superpowers/specs/2026-10-21-partial-endplates-design.md` (status line: BUILT, the branch, the counts)

- [ ] **Step 1: `docs/level-editor.md`**

- "Placing a level": after the step-chips paragraph, a paragraph **Placing only some of a level's points** (2026-10-21, N1–N2): a body may be finished with one endplate (SA and SP, or IA and IP) and C2 with its inferior pair or its centroid alone: once that part is whole, the edit bar's **FINISH** is enabled (`Finish with the points placed; the rest are not on this film`) and pressing it stores the part placed, the rest recorded as not on this film; a level with one corner of a pair cannot finish (place the other corner or UNDO); T1, S1, T4 and the heads are unchanged. The table's body row gains `, or FINISH after one endplate`; C2's `, or FINISH after the pair or the centroid`.
- "Handles and the keyboard": the chips of a partial level list every point, the missing ones with a hollow dot; clicking a hollow chip (or the row's Place…) resumes the placement for that endplate, `PLACING C7 · 3 OF 4`, its placed points pre-filled and UNDO reaching only the new clicks; CANCEL or Escape leaves the level as it was. **Delete or Backspace** with a point of a body or C2 focused removes that point's endplate (C2's centroid, its centroid), committed like a drag; refused for the level's last part (CLEAR or uncheck it) and for T1, S1, T4 and the heads. The key table's Delete row becomes `removes the focused point's endplate on a body or C2 (its centroid on C2); nothing on the last part, on T1, S1, T4 or a head`.
- "The label record": `corners` nullable by endplate (`ia` and `ip` null for a C7 placed from its superior endplate; C2's `corners` null with a `centroid`, or the reverse); `edited_points` of a manual entry lists the keys it holds a point for, of an edited entry the keys that differ from the model's, a removed endplate's included; the schema id unchanged, amended 2026-10-21; a record saved before 1.4.0 validates and reads unchanged; a 1.3.x build reads a partial level as Not placed.
- "Films with no result": the model's own partial output (one endplate) now reads Segmented and draws as its line.
- "Verification": section 22 and the new unit groups.

- [ ] **Step 2: `HANDOFF.md`**

§2's table: C2 `… either part may stand alone (2026-10-21, N1)`; C3–C7 and L1–L5 `… or one endplate alone (N1)`. §2 "Rules": a bullet **Partial levels** (N1, N2) in two sentences. §6: amend the Place… row (*Amended 2026-10-21 (N2):* FINISH after a whole part; Place… on a partial level resumes it), add a **Delete / Backspace** row and a **Hollow chip** row. §9's `corners` rows: nullable by pair, the manual `edited_points` rule. §12b "Decisions (2026-10-21)": N1–N4 (owner), N5–N7 (planner), one line each, as §12a lists E1–E7, naming the spec and this plan.

- [ ] **Step 3: The release**

- `package.json` `"version": "1.4.0"`; `renderer/data/version.js` `VERSION_LABEL = 'v1.4.0'`; `README.md`: the `[v1.3.1 release notes](docs/releases/1.3.1.md)` link becomes `[v1.4.0 release notes](docs/releases/1.4.0.md)`.
- `CHANGELOG.md`: a `## 1.4.0` entry above 1.3.1, three bullets (FINISH and the partial level on the film and in the panel; Delete and the hollow chips; the record's nullable corners and the backend's lumbar validator, with the compatibility line), ending `[Release notes](docs/releases/1.4.0.md)`.
- `docs/releases/1.4.0.md` in 1.3.1's shape: a one-paragraph summary; sections **Placing only some of a level's points**, **Completing and removing an endplate**, **The label record**; **Verification** with the exact unit count, the smoke count of section 22's run, the pytest count, and the line that these are software checks, not clinical validation; **Compatibility**: the record under the same id, a 1.3.x build reading a partial level as Not placed and a partial lumbar study as unsegmented with a warning, the installer's backend carrying the validator, no store version bump, bundles and CSV unchanged.
- `docs/ROADMAP.md` §9: strike the heading's "deferred by the owner to its own session" and add a first paragraph `Built 2026-10-21 on claude/partial-endplates-ca5755 (the owner's rulings N1–N4, all the recommended column; spec docs/superpowers/specs/2026-10-21-partial-endplates-design.md, plan plans/2026-10-21-partial-endplates.md), released as 1.4.0.`; keep the decisions table as the record of what was chosen.
- The spec's status line: `BUILT` with the counts.

- [ ] **Step 4: Commit**

```bash
git add docs CHANGELOG.md README.md package.json renderer/data/version.js
git commit -m "docs(release): 1.4.0, placing only some of a level's points"
```

---

### Task 10: Final verification and hand-over

- [ ] **Step 1: The whole unit suite**: `node --test test/*.test.js` → all pass; record the count.
- [ ] **Step 2: The backend suite**: `& $env:SPINE_CONTOUR_PYTHON -m pytest backend/tests/unit -q` → all pass.
- [ ] **Step 3: The smoke suite once more from a fresh launch** (Task 8's commands) → `N/N checks passed (phase dom)` and no console errors; keep `tools/smoke/out/partial-smoke-levels.txt`.
- [ ] **Step 4: The electron-builder allowlists** are untouched (no new file under `renderer/` or `styles/`; the new example lives under `docs/`, outside both allowlists): `git diff 7e85035 --stat -- package.json electron-builder.preview.yml` shows only the version line.
- [ ] **Step 5: Check the counts in `docs/releases/1.4.0.md` and the spec's status line against Steps 1–3**; amend the docs commit if a number differs.
- [ ] **Step 6: `git log --oneline 7e85035..HEAD`** lists one commit per task in order; `git status` is clean; nothing is pushed. Report the branch, the counts and the human gate's checklist (a real cervical film with C7's inferior endplate hidden: place C7 SA and SP, FINISH, read SVA with Cobb a dash, save, reopen, complete C7 from the IA chip, Delete an endplate) to the owner.
