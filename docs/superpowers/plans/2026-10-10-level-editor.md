# Vertebral Level Editor, Window / Level and Label Record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In edit mode the Analysis screen's right panel becomes a level editor that lists every vertebral level in five
groups, lets the annotator place levels the model missed, mark levels not visible and adjust handles; the stage gains a
display-only window / level; **Save edits** writes one JSON label record per film for retraining.

**Architecture:** A new pure module, `renderer/data/levels.js`, owns the *level model*: sixteen items (C2–C7, T1, T4,
L1–L5, S1, two femoral heads), each `{visible, source, geometry}`, with state derivation, film-type defaults, the
measurement-to-level table that generates the dependency notes, the unsaved count and the training-label status. The
model lives in one new store key, `state.levelEditor`, while editing. Levels the film's region measures are *projected*
into `study.geometry` through the existing measure queue, so measurements, the em-dash rule and studies.json keep
working exactly as today; T1, T4, out-of-region groups, rim points and visibility live only in the level model and the
label record. The model's own output per level comes from the prediction snapshot the viewer already keeps. Window /
level reads the original film through a new backend `POST /decode` (16-bit pixels, value range, DICOM window defaults)
and applies a linear LUT to the film layer only. A new wiring module, `renderer/level-editor.js`, is the one place that
turns panel and stage events into store updates, geometry commits and the label-record save.

**Tech Stack:** Electron 44, vanilla ES modules (no bundler, no framework, no runtime dependencies), `node --test`
unit tests, CDP smoke suites in `tools/smoke/` against the real app, Python/FastAPI backend with pytest.

**Spec:** `docs/design/level-editor/HANDOFF.md` (commit `594a982`), "the handoff" below; its sections are cited as
"handoff §N". The prototype `docs/design/level-editor/prototype/Main.dc.html` is the behaviour reference: port its
logic, never its markup. The label record schema is `docs/design/level-editor/label-record.schema.json` (amended by
Task 5) and the example `label-record.example.json`. Where the handoff and this plan differ, the **Decisions** below win
(they are the owner's answers to handoff §12 and to the questions the code forced), then the handoff.

**Branch:** `worktree-level-editor` in the worktree
`C:\Users\codyj\Spine Contour Desktop\Spine-Contour\.claude\worktrees\level-editor`, off `origin/main` @ `20fd4c5`
(v1.0.17). `node_modules` is a junction to the main checkout's. The backend venv is the main checkout's
`.venv\Scripts\python.exe`; the ONNX graphs are in the main checkout's `backend/onnx/` (gitignored; the backend tests
that need them skip without them). Nothing is pushed and no PR is opened until the user says so (memory:
test-before-release). The release commit (1.0.18 or later) is separate, later work.

## Decisions (owner, 2026-10-10)

The handoff's open questions (§12) and the questions the code forced, as answered by the owner. Every task below
assumes these.

| # | Question | Decision |
|---|---|---|
| D1 | Window / level pixel source | A new backend endpoint `POST /decode` returns the original file's decoded pixels (16-bit), value range and DICOM window defaults. The renderer applies the LUT on the film layer only. No CSS filter, no LUT on the stored 8-bit PNG. The same decode gives a failed film something to display. |
| D2 | Save semantics | Drags keep auto-committing geometry through `/measure` to studies.json as today. **Save edits** writes the label record and resets the baseline. **Discard** restores the baseline (the saved record when one exists, else the state at entry) through the measure queue. |
| D3 | Label record location (§12.2) | `userData/labels/<stem>.label.json`, where stem is the film's filename without its extension (`lateral_lumbar_001.dcm` → `lateral_lumbar_001`). A second film with the same stem gets `<stem>-2.label.json`, the third `-3`, and the chosen name is stored on the study record as `labelFile` so it is stable and covered by delete and quarantine. |
| D4 | Branch base | A new worktree off `origin/main` (now v1.0.17), independent of the held similar-cases branch. |
| D5 | Film type → default visible groups (§12.1) | lumbar → Lumbar, Sacral, Femoral heads. cervical → Cervical plus **T1 only** (T4 starts not visible). full_spine → all five groups. Everything else starts `not_visible` with `source: film_type`. |
| D6 | A film with region Auto and no result | **Every one of the sixteen items starts visible** (not placed) until the annotator unchecks it. |
| D7 | Leaving edit mode with unsaved changes (§12.3) | An inline prompt in the panel footer, the app's two-step pattern: `Discard 2 unsaved changes? Saved edits are kept.` with three buttons **Save edits**, **Discard**, **Keep editing**. It covers DONE, the Edit button, Escape and Back. Sidebar navigation keeps the unsaved level state in memory for the session, so nothing is lost. |
| D8 | C2 | C2 is an **inferior endplate (IA, IP) plus a centroid**, in the panel, the handles and the record: three clicks to place. The schema gains a `c2` definition (Task 5). |
| D9 | Overlay colours | Keep the shipped `LEVEL_RGB` (C2 purple, C3–C7 = L1–L5's colours) and extend it with T1, T4 and S1. The handoff's L1-anchored cycle is not adopted. |
| D10 | Save with zero changes | Allow the first save: Save is disabled with `NOTHING TO SAVE` only when a record already exists for the study and nothing has changed since. |
| D11 | Window / level persistence (§12.4) | Not persisted and not recorded: display only, resets when the study is reopened, not in the label record, schema unchanged on this point. |
| D12 | T1 and T4 (§12.5) | Both are added as placeable levels in the Thoracic group and written to the record. No measurement reads them today, so they get no dependency note; T1 slope and T4 angles are out of scope. |
| D13 | Clear (§12.6) | Kept on manual levels. |
| D14 | RESET TO PREDICTION | Kept in the edit bar as the whole-study revert to the model's output, beside Discard. |

## Global Constraints

- **Never display a fabricated measurement.** Absent values render `—` (U+2014), never `0`, never a guess. In source
  the dash is the escape `\u2014`. A dependency note names the measurements that *will* show `—`; it never shows a value.
- **Never mutate the store's geometry, a Study record or the level editor state in place.** Every change builds a new
  object (`{ ...editor, levels: { ...editor.levels, [code]: next } }`) and the viewer's reference-keyed redraw gates and
  the panels' rebuild gates compare by reference.
- **All stage pointer and keyboard wiring lives in `renderer/components/viewer.js`.** `renderer/viewer/*.js` and
  `renderer/data/*.js` are pure logic with `node --test` coverage and contain no DOM code (a duck-typed `canvas` with
  `getBoundingClientRect()` and `width`/`height`, as `viewer/geometry.js` already takes, is allowed).
- **Subscribers never call `setState`.** `update()` functions only write DOM; every store write comes from an event
  handler or an async continuation.
- **No bundler, no framework, no runtime dependencies.** `package.json` `dependencies` stays empty; `devDependencies`
  stays exactly `electron` and `electron-builder`. No JSON Schema library: the schema check is hand-written in
  `test/fixtures/`. The backend adds no Python package.
- **Do not loosen the CSP** in `index.html`. No new stylesheet file: new rules go in `styles/screens/analysis.css`
  (section `05 — LEVEL EDITOR`) and `styles/components.css` (the checkbox variant). Colours in CSS come from
  `styles/tokens.css` and the `--stage-*` block on `.viewer-stage`; canvas colours are the literals in
  `renderer/viewer/canvas.js`. The panel's level swatches read `LEVEL_RGB` from `renderer/viewer/canvas.js` as inline
  `rgb()` styles so canvas and DOM share one source.
- **`renderer/` is browser code**: no `node:` imports. Anything touching `node:fs` is in `main.js` or a root CommonJS
  module imported only by `main.js`; a new root module goes in BOTH electron-builder allowlists (`package.json`
  `build.files` and `electron-builder.preview.yml` `files`). This plan adds no root module.
- **Coordinates:** every stored point is in pixels of the *stored* image (the sidecar's `image_png`), origin top-left,
  via `clientToImage()` from `renderer/viewer/geometry.js`; placement clicks clamp to `[0, width − 1] × [0, height − 1]`.
- **Copy, verbatim** (handoff §3, §6): panel title `Vertebral levels`; helper
  `Uncheck a level you can't see on this film. It's saved as not visible, not as missing.`; summary
  `{n} PLACED · {m} TO PLACE · {k} NOT VISIBLE` (a clause is omitted when its count is 0, PLACED always present); group
  ranges `C2–C7`, `T1 · T4`, `L1–L5`, `S1 ENDPLATE`, `2–4 RIM POINTS`; badges `Segmented`, `Edited`, `Manual`,
  `Not placed`, `Not visible`, `Placing…`; row actions `Place…`, `CLEAR`, `CANCEL`; footer labels
  `TRAINING LABEL · COMPLETE` / `TRAINING LABEL · INCOMPLETE`, `Every level is placed or marked not visible.`,
  `{list} is visible but not placed — place it or uncheck it.` / `… are visible but not placed — place them or uncheck them.`;
  `{n} UNSAVED CHANGES` / `1 UNSAVED CHANGE` / `NOTHING TO SAVE`; buttons `Discard`, `Save edits`; toasts
  `Saved {n} edits to the label record.` (`edit` when n = 1; `Saved the label record.` when n = 0), `Discarded {n} changes.`
  (`change.` when n = 1); edit-bar labels `EDITING SEGMENTATION`, `PLACING {LEVEL} · {k} OF {n}`,
  `PLACING FEMORAL HEAD 1 · {k} OF 4 RIM POINTS`, `WINDOW / LEVEL · PLACING PAUSED`; W/L panel `WINDOW / LEVEL`, `RESET`,
  `DONE`, `WIDTH`, `LEVEL`, `Display only. Measurements and the label record don't change.`; chip `W {w} · L {l}`;
  header eyebrow `EDITING SEGMENTATION`; dependency note `{names} will show —`; demo note `Demo studies are not exported`.
  Placement help copy is handoff §6's list, with the C2 variant in Task 1.
- **Accessibility (handoff §10):** real `<input type="checkbox">` through `renderer/components/checkbox.js`; level
  labels `{full name} visible on film`; group labels `{Group}: mark every level visible` / `… not visible`; mixed state
  sets `input.indeterminate`; group header `<button aria-expanded>`; level select `<button aria-pressed>`; icon-only
  toolbar buttons carry `aria-label` and `title`; focus rings `2px solid var(--accent)` (`var(--stage-accent)` on the
  stage), offset 2px, −2px inside rows; toasts keep the router host's `role="status"`.
- **Motion:** chevron `transform .2s ease`; hovers `.15s ease`; the toast's existing `riseIn .18s`. The film and data
  never animate.
- Unit tests: `node --test test/*.test.js` (the glob; `node --test test/` fails on Node 24). Baseline in this worktree:
  **615/615**. Backend tests: `"C:/Users/codyj/Spine Contour Desktop/Spine-Contour/.venv/Scripts/python.exe" -m pytest backend -q`
  from the worktree root (graph-dependent tests skip there).
- Commits: conventional prefixes (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), one per task, every message ending with a
  blank line and `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Verification of DOM, canvas and pointer behaviour is by the CDP smoke suite (Task 14) and the human gate (Task 15).
  Per memory: never view or send screenshots that show a real film; verify through DOM and state reads.
- The BrowserWindow's `minWidth` is 900 (`main.js`), so the handoff's stacked layout below 900 px cannot occur and is
  not built. The handoff's suggested row keys (↑/↓, Space, P) are not built either; they go to the ROADMAP (Task 14).

## Review Focus

The inputs the handoff implies but no acceptance criterion names, most likely to bite first. Each has its test in the
task that owns the code.

1. **Two clicks on the same spot** while placing a body or endplate give a zero-length endplate, which `/measure`
   rejects with a 422 and the measure queue toasts. `addPoint` ignores a click within 1 image pixel of the previous
   point for `body`, `c2` and `endplate` placements (Task 1).
2. **A toolbar-cropped stored image** (lumbar 8-bit film with Toolbar removal on) is shorter than the decoded original.
   The LUT must use the top `images.height` rows of the decoded buffer and must refuse a width mismatch (Task 8).
3. **The study is deleted, re-run or has its Region changed while its level editor state exists** (open or stashed).
   Every one of those paths must drop that study's editor and its stash, or a reused id inherits another film's
   levels (Task 10).
4. **A MONOCHROME1 DICOM** inverts its pixels for display; its WindowCenter must be inverted with them or the default
   window lands on the wrong end of the range (Task 7).
5. **A second film with the same filename stem** must get `<stem>-2.label.json`, and a study whose `labelFile` is
   already set must keep it across saves (Task 5, Task 6).

---

## File structure

New files, one responsibility each:

| File | Responsibility |
|---|---|
| `renderer/data/levels.js` | The level model: groups, codes, kinds, names; `LevelGeometry` shapes; film-type defaults; state derivation; placement steps and help copy; `addPoint`/`undoPoint`/`finishPlacing`; visibility toggles; the measurement-to-level table and dependency notes; unsaved count, summary, training status; baseline and save/revert. Pure. |
| `renderer/data/level-projection.js` | Both directions between the level model and `study.geometry`: `levelsFromGeometry`, `projectGeometry`, `projectionRegion`, `anteriorSideFrom`. Pure. |
| `renderer/viewer/level-handles.js` | Handles for one level's geometry, hit-testing in client space, moving and nudging a handle (rim points refit), synthesised rim points, Tab order across the editor. Pure. |
| `renderer/viewer/window-level.js` | Default window, ranges, clamping, the drag rule, the LUT into an RGBA buffer, the chip text, cropping a decoded buffer to the stored image height. Pure. |
| `renderer/data/label-record.js` | `viewSlug`, `labelFileName`, `appVersion`, `toLabelRecord`, `recordLevels`. Pure. |
| `renderer/data/contours.js` | Boundary trace of one label value in a mask raster and polygon simplification, for the record's `contour`. Pure. |
| `renderer/level-editor.js` | Store-wired singleton (the pattern of `renderer/batch.js`): enter/exit, save, discard, every panel and stage action, the W/L state, the per-study stash. Thin; verified by smoke. |
| `renderer/components/level-editor.js` | The right-panel component: `mountLevelEditor(host)` → `{ update(state, study) }`. DOM only. |
| `backend/decode.py` | `decode_film(payload)` → 16-bit pixels, range, DICOM window defaults. |
| `test/fixtures/schema-check.js` | A hand-written JSON Schema (draft 2020-12 subset) checker for the label record. Not matched by the test glob. |
| `test/levels.test.js`, `test/level-projection.test.js`, `test/level-handles.test.js`, `test/window-level.test.js`, `test/label-record.test.js`, `test/contours.test.js` | Unit tests, one per pure module. |
| `backend/tests/unit/test_decode.py`, `backend/tests/integration/test_decode_server.py` | Backend tests. |
| `tools/smoke/smoke-levels.mjs` | The CDP smoke suite. |
| `docs/level-editor.md` | The feature's user-facing doc. |

Modified: `renderer/store.js`, `renderer/screens/studies.js` and `renderer/data/demo-visibility.js` (FRESH_VIEW),
`renderer/components/viewer.js`, `renderer/viewer/canvas.js`, `renderer/screens/analysis.js`,
`renderer/components/checkbox.js`, `renderer/data/persistence.js`, `renderer/api.js`, `preload.js`, `main.js`,
`backend/server.py`, `backend/models/models.py`, `styles/screens/analysis.css`, `styles/components.css`,
`docs/design/level-editor/label-record.schema.json`, `label-record.example.json`, `HANDOFF.md` (§12), the records
(Task 14), and the tests that pin the shapes this plan changes (`test/store.test.js`, `test/canvas.test.js`,
`test/persistence.test.js`, `test/api.test.js`, `test/interactions.test.js`, `test/geometry.test.js`).

### Shared shapes (every task uses these names)

```js
// Codes, in panel order. Head 1 and Head 2 are FH1 and FH2; 'left'/'right' array slots map FH1 → 0, FH2 → 1.
LEVEL_CODES = ['C2','C3','C4','C5','C6','C7','T1','T4','L1','L2','L3','L4','L5','S1','FH1','FH2']

// kindOf(code): 'c2' for C2; 'body' for C3–C7 and L1–L5; 'endplate' for T1 and S1; 'centroid' for T4; 'circle' for FH1, FH2.

/** @typedef {[number, number]} Pt  image pixels of the stored image, origin top-left */
/** @typedef {{superior: [Pt, Pt], inferior: [Pt, Pt]}}      BodyGeometry      superior = [SA, SP], inferior = [IA, IP] */
/** @typedef {{inferior: [Pt, Pt], centroid: Pt}}            C2Geometry        inferior = [IA, IP] */
/** @typedef {{superior: [Pt, Pt]}}                          EndplateGeometry  T1 and S1: [SA, SP] */
/** @typedef {{centroid: Pt}}                                CentroidGeometry  T4 */
/** @typedef {{center: Pt, radius: number, rim: Pt[]|null}}  CircleGeometry    rim: 2–4 points, null for unedited model output */
/** @typedef {BodyGeometry|C2Geometry|EndplateGeometry|CentroidGeometry|CircleGeometry} LevelGeometry */

/** @typedef {{visible: boolean, source: 'model'|'annotator'|'film_type', geometry: LevelGeometry|null}} LevelEntry */

/** The store key `state.levelEditor`: null outside edit mode, else: */
/** @typedef {Object} LevelEditor
 *  @property {string} studyId
 *  @property {'lumbar'|'cervical'|'full_spine'|'auto'} region      the film type the defaults were taken from
 *  @property {Object<string, LevelEntry>} levels                    one per LEVEL_CODES
 *  @property {Object<string, LevelGeometry|null>} model             the prediction's geometry per code (null = none)
 *  @property {Object<string, {visible: boolean, source: string, geometry: LevelGeometry|null}>} baseline
 *  @property {{file: string|null, exists: boolean}} record           the label record on disk for this study
 *  @property {string|null} selected                                 the selected row's code
 *  @property {{code: string, handle: string}|null} handle           the focused handle: 'SA'|'SP'|'IA'|'IP'|'CENTROID'|'R0'..'R3'
 *  @property {{code: string, points: Pt[]}|null} placing
 *  @property {{cervical: boolean, thoracic: boolean, lumbar: boolean, sacral: boolean, femoral: boolean}} open
 *  @property {WindowState|null} window                              null until W/L is first opened for this study
 *  @property {{then: 'exit'|'back'}|null} exitPrompt
 */
/** @typedef {Object} WindowState
 *  @property {boolean} open
 *  @property {'loading'|'ready'|'unavailable'} status
 *  @property {string|null} reason                                   display-ready, when unavailable
 *  @property {number} width  @property {number} level
 *  @property {number} defaultWidth  @property {number} defaultLevel
 *  @property {number} min  @property {number} max                   the decoded value range
 */

/** The decoded film, held in screens/analysis.js's image cache as `images.raw`, never in the store: */
/** @typedef {{pixels: Uint16Array, width: number, height: number, valueMin: number, valueMax: number,
 *            bitsStored: number|null, window: {center: number, width: number}|null}} RawFilm
 *  pixel value = pixels[i] + valueMin */
```

---

### Task 1: The level model (`renderer/data/levels.js`)

**Files:**
- Create: `renderer/data/levels.js`
- Test: `test/levels.test.js`

**Interfaces:**
- Consumes: `fitCircle(points)` from `renderer/viewer/geometry.js` (→ `[cx, cy, r] | null`, needs ≥ 3 points; the
  contract says reuse it, never reimplement it). This is the one `data/` → `viewer/geometry.js` import; geometry.js is
  pure. `SEGMENTAL_PAIRS` from `renderer/data/segmental.js`; `DISC_LEVEL_PAIRS` from `renderer/data/disc-heights.js`.
- Produces (all pure, every function returning a *new* editor object):

```js
export const LEVEL_GROUPS   // [{key, title, range, codes}] in handoff §2 order; ranges verbatim (Global Constraints)
export const LEVEL_CODES    // the 16 codes above
export function kindOf(code)                     // 'c2'|'body'|'endplate'|'centroid'|'circle'
export function groupOf(code)                    // group key
export function rowName(code)                    // 'C2'…'C7', 'T1 endplate', 'T4 centroid', 'L1'…'L5', 'S1', 'Head 1', 'Head 2'
export function fullName(code)                   // 'C2'…, 'T1 superior endplate', 'T4 centroid', 'L1'…, 'S1', 'femoral head 1', 'femoral head 2'
export function filmTypeDefaults(region)         // → Set<string> of codes that start visible (D5, D6)
export function sameGeometry(a, b, eps = 1e-6)   // circles compare center and radius only; null === null
export function levelState(entry, modelGeometry) // 'not_visible'|'not_placed'|'manual'|'segmented'|'edited'
export function badgeFor(state, placing)         // → {className: 'badge badge-seg'|'badge badge-ok'|'badge badge-rev'|'badge badge-proc', label}
export function placementSteps(code)             // → {need, fitFrom, steps: [{label, help, colorKey}]}
export function geometryFromPoints(code, points) // → LevelGeometry (circle: fitRim(points))
export function fitRim(points, maxRadius)        // → CircleGeometry; 2 pts = diameter; ≥3 fitCircle, else farthest pair; r > maxRadius → farthest pair
export function synthesizeRim(circle)            // → 4 points at −45°, 45°, 135°, 225° on the circle (x right, y down)
export function levelsFromGeometry(geometry)     // → Object<code, LevelGeometry|null>; T1, T4 always null; null geometry → all null (rules in Task 2)
export function openEditor({ study, region, modelGeometry, saved })   // → LevelEditor; saved: { file, levels: Object<code, {visible, source, geometry}> } | null
export function toggleVisible(editor, code)
export function toggleGroup(editor, groupKey)
export function toggleOpen(editor, groupKey)
export function selectLevel(editor, code)        // selected = code; cancels a placement of ANOTHER code; handle = first handle of code or null
export function startPlacing(editor, code)       // placing = {code, points: []}; selected = code; handle = null
export function addPoint(editor, point, imageSize)   // clamps to [0, w−1]×[0, h−1]; drops a near-duplicate (< 1 px) for c2/body/endplate; auto-finishes at `need`
export function undoPoint(editor)
export function cancelPlacing(editor)
export function finishPlacing(editor, imageSize)     // FIT: circles with ≥ 2 points; others only at `need`
export function clearLevel(editor, code)         // geometry = null, source = 'annotator'; manual levels only (no-op otherwise)
export function setLevelGeometry(editor, code, geometry)   // source = 'annotator'
export function unsavedCount(editor)             // levels whose (visible, geometry) differ from baseline, sameGeometry tolerance
export function canSave(editor)                  // unsavedCount(editor) > 0 || !editor.record.exists   (D10)
export function unsavedText(n)                   // '2 UNSAVED CHANGES' | '1 UNSAVED CHANGE' | 'NOTHING TO SAVE'
export function summaryText(editor)              // '7 PLACED · 1 TO PLACE · 8 NOT VISIBLE' (zero clauses omitted; PLACED always)
export function groupCountText(editor, groupKey) // same rule per group; '' when every clause is zero
export function groupCheckState(editor, groupKey)// 'all'|'none'|'mixed'
export function trainingStatus(editor)           // → {complete, label, text, missing: string[]}  (fullName list, Oxford-free 'a, b and c')
export function placingLabel(editor)             // 'PLACING L3 · 2 OF 4' | 'PLACING FEMORAL HEAD 1 · 2 OF 4 RIM POINTS' | null
export function placingHelp(editor)              // the current step's help, or null
export const MEASUREMENT_INPUTS                  // [{key, label, regions: ['lumbar','full_spine'] | ['cervical','full_spine'] | ['full_spine'], codes: string[]}]
export function dependencyNote(code, region)     // 'LL, PI–LL, L1PA and L1–L2 will show —' | null
export function markSaved(editor, file)          // baseline = snapshot of levels (visible, source, geometry); record = {file, exists: true}
export function revertToBaseline(editor)         // levels ← baseline (visible, source, geometry); placing = null
```

Rules the signatures do not determine:

- `filmTypeDefaults`: `lumbar` → L1–L5, S1, FH1, FH2; `cervical` → C2–C7, T1; `full_spine` → all sixteen; any other
  value (`'auto'`, `null`, `undefined`) → all sixteen (D5, D6).
- `openEditor`: `levels[code].geometry` = `levelsFromGeometry(study.geometry)[code]` for codes the study's geometry
  carries; for the others (T1, T4, and any code the geometry lacks) `saved.levels[code].geometry` when `saved` is
  given, else null. `visible` = `saved.levels[code].visible` when `saved` is given, else `defaults.has(code) || geometry != null`.
  `source` = `saved.levels[code].source` when given, else `'model'` when `modelGeometry[code]` exists, else `'film_type'`.
  `model` = `levelsFromGeometry(modelGeometry)` (all null when `modelGeometry` is null). `baseline` = `saved.levels`
  when given, else a snapshot of `levels`. `record` = `{file: saved?.file ?? study.labelFile ?? null, exists: Boolean(saved)}`.
  `open[group]` = the group has a visible level. `selected = null`, `handle = null`, `placing = null`, `window = null`,
  `exitPrompt = null`. (`saved` is the record converted by Task 5's `recordLevels`; `levels.js` never imports
  `label-record.js`, which imports it.)
- `levelState`: not visible → `not_visible`; no geometry → `not_placed`; no model → `manual`; `sameGeometry` → `segmented`
  else `edited`.
- `badgeFor`: `segmented` → `badge badge-seg` / `Segmented`; `edited` → `badge badge-ok` / `Edited`; `manual` →
  `badge badge-ok` / `Manual`; `not_placed` → `badge badge-rev` / `Not placed`; `not_visible` → `badge badge-proc` /
  `Not visible`; `placing === true` overrides to `badge badge-rev` / `Placing…`.
- `placementSteps`: `body` need 4, labels `SA SP IA IP`, colorKeys `SA SP IA IP`, helps handoff §6 "Vertebra". `c2`
  need 3, labels `IA IP CENTROID`, colorKeys `IA IP level`, helps `Click the inferior-anterior corner of C2 (IA).`,
  `Click the inferior-posterior corner of C2 (IP).`, `Click the centroid of the C2 body.` `endplate` need 2, labels
  `ANT POST`, colorKeys `SA SP`, helps `Click the anterior corner of the {code} superior endplate.` / `…posterior…`.
  `centroid` need 1, label `CENTROID`, colorKey `level`, help `Click the centroid of T4.` `circle` need 4, `fitFrom` 2,
  labels `P1 P2 P3 P4`, colorKeys `trace`, helps handoff §6 "Femoral head" (four lines).
- `geometryFromPoints`: body `{superior: [p0, p1], inferior: [p2, p3]}`; c2 `{inferior: [p0, p1], centroid: p2}`;
  endplate `{superior: [p0, p1]}`; centroid `{centroid: p0}`; circle `fitRim(points, maxRadius)` where `maxRadius`
  is `Math.hypot(imageSize.width, imageSize.height)` (the prototype's `r > 1000` made image-relative).
- `fitRim`: 2 points → centre midpoint, radius half the distance (a tiny radius is accepted, handoff §11); ≥ 3 →
  `fitCircle(points)`; null or `r > maxRadius` or non-finite → the farthest pair as a diameter. `rim` = the points as
  given. Values rounded to 0.1 px as the prototype does (`Math.round(v * 10) / 10`).
- `addPoint` on a circle at the 4th point finishes; `finishPlacing` for a circle with < 2 points is a no-op; the finished
  level gets `visible: true, source: 'annotator'`; `placing = null`, `selected = code`.
- `toggleGroup`: if every level in the group is visible, all become not visible; else all visible. Every toggled level
  gets `source: 'annotator'`. A placement whose level becomes hidden is cancelled.
- `toggleVisible` on the level being placed cancels the placement. Geometry is **kept** when hidden (re-checking restores it).
- `MEASUREMENT_INPUTS` is built from code, not typed out per level, in this order (the Measurements panel's order):
  `LL` → `['L1','S1']` (lumbar, full_spine); `PI`, `PT` → `['S1','FH1','FH2']`; `SS` → `['S1']`; `PI–LL` →
  `['L1','S1','FH1','FH2']`; `L1PA` → `['L1','S1','FH1','FH2']`; then one entry per `SEGMENTAL_PAIRS` pair labelled
  `{upper}–{lower}` (the cervical pairs for cervical/full_spine, then the lumbar pairs for lumbar/full_spine; a pair's
  codes are its two levels; the `DISC_LEVEL_PAIRS` share the lumbar pairs' labels and add nothing); then `C2–C7 Cobb`
  → `['C2','C7']`; `C2–C7 SVA` → `['C2','C7']`; `C7–S1 SVA` → `['C7','S1']` (full_spine only).
- `dependencyNote(code, region)`: the labels of every entry whose `regions` include `region` (an `'auto'` region counts
  as every region) and whose `codes` include `code`, in `MEASUREMENT_INPUTS` order, joined `a, b and c`, followed by
  ` will show —`; null when none. Expected: `dependencyNote('L1', 'lumbar')` = `LL, PI–LL, L1PA and L1–L2 will show —`;
  `dependencyNote('S1', 'lumbar')` = `LL, PI, PT, SS, PI–LL, L1PA and L5–S1 will show —`; `dependencyNote('FH1', 'lumbar')`
  = `PI, PT, PI–LL and L1PA will show —`; `dependencyNote('C3', 'cervical')` = `C2–C3 and C3–C4 will show —`;
  `dependencyNote('C3', 'lumbar')` = null; `dependencyNote('T1', 'full_spine')` = null.
- `trainingStatus`: `missing` = fullName of every level with `visible && !geometry`, in LEVEL_CODES order;
  `complete = missing.length === 0`; `label` = `TRAINING LABEL · COMPLETE` / `· INCOMPLETE`; `text` = the verbatim
  sentences in Global Constraints with the list capitalised at its first character.

- [ ] **Step 1: Write the failing tests** (`test/levels.test.js`), one `test()` per rule above. Fixtures: a lumbar
  geometry with L1, L2, L4, L5, S1 and two circles (reuse `test/canvas.test.js`'s `fakeGeometry()` shape, inline);
  a model geometry equal to it. Assertions to include verbatim:

```js
assert.deepEqual([...filmTypeDefaults('lumbar')].sort(), ['FH1','FH2','L1','L2','L3','L4','L5','S1']);
assert.deepEqual([...filmTypeDefaults('cervical')].sort(), ['C2','C3','C4','C5','C6','C7','T1']);
assert.equal(filmTypeDefaults('auto').size, 16);
assert.equal(levelState({ visible: true, geometry: g }, g), 'segmented');
assert.equal(levelState({ visible: true, geometry: moved }, g), 'edited');
assert.equal(levelState({ visible: true, geometry: g }, null), 'manual');
assert.equal(levelState({ visible: true, geometry: null }, null), 'not_placed');
assert.equal(levelState({ visible: false, geometry: g }, g), 'not_visible');
assert.deepEqual(fitRim([[0, 0], [10, 0]], 1000), { center: [5, 0], radius: 5, rim: [[0, 0], [10, 0]] });
assert.deepEqual(fitRim([[0, 0], [10, 0], [20, 0]], 1000).center, [10, 0]);   // collinear → farthest pair
assert.equal(unsavedText(1), '1 UNSAVED CHANGE'); assert.equal(unsavedText(0), 'NOTHING TO SAVE');
assert.equal(summaryText(editorWithL3Missing), '7 PLACED · 1 TO PLACE · 8 NOT VISIBLE');
assert.equal(dependencyNote('L1', 'lumbar'), 'LL, PI–LL, L1PA and L1–L2 will show \u2014');
// addPoint: a duplicate click is dropped; the fourth corner finishes; the circle fits at 4
// toggleGroup: all → none → all; the placement cancels when its level hides
// canSave: a fresh editor with no record and no change → true; markSaved → false; one toggle → true
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/levels.test.js`
Expected: FAIL, `Cannot find module '…/renderer/data/levels.js'`

- [ ] **Step 3: Implement `renderer/data/levels.js`** with the exports above. Keep `MEASUREMENT_INPUTS` derived from
  `SEGMENTAL_PAIRS`; keep every mutator returning a new object.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/levels.test.js`
Expected: PASS, every test. Then `node --test test/*.test.js` → 615 + the new tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/levels.js test/levels.test.js
git commit -m "feat: the level model — sixteen levels, states, placement steps, dependency notes and the save baseline"
```

---

### Task 2: Projection between the level model and `study.geometry` (`renderer/data/level-projection.js`)

**Files:**
- Create: `renderer/data/level-projection.js`
- Test: `test/level-projection.test.js` (also covers Task 1's `levelsFromGeometry`)

**Interfaces:**
- Consumes: `LEVEL_CODES`, `kindOf`, `levelsFromGeometry` (Task 1); `studyRegion` and `CERVICAL_LEVELS` from
  `renderer/data/cervical.js`; `validate` and `STORE_VERSION` from `renderer/data/persistence.js` (tests only).
- Produces:

```js
export function projectionRegion(editor, study)       // → 'lumbar'|'cervical'|'full_spine'
export function anteriorSideFrom(editor, fallback)    // → 'left'|'right'|null
export function quadrilateral(body)                   // → [SA, SP, IP, IA]
export function projectGeometry(editor, study)        // → Geometry for /measure and the record, or null when nothing is projected
```

Rules:

- `levelsFromGeometry`: C2 → `{inferior: vertebrae.C2.inferior, centroid: c2_centroid}` when both exist, else null;
  C3–C7, L1–L5 → `{superior, inferior}` when the body has both pairs; S1 → `{superior: s1_superior}`; FH1/FH2 →
  `femoral_circles[0]/[1]` → `{center: [cx, cy], radius: r, rim: null}`; T1, T4 → null; a null geometry → all null.
- `projectionRegion`: `studyRegion(study)` when it is `lumbar`, `cervical` or `full_spine`. When it is `'auto'`
  (no result): `cervical` if a visible placed C-level exists and no visible placed L/S1/FH level does; `lumbar` if
  the reverse; `full_spine` if both; `lumbar` if neither.
- `anteriorSideFrom`: the first visible placed level in order C2 (IA.x < IP.x → `left`), then C3–C7 and L1–L5
  (SA.x < SP.x → `left`), then T1/S1 (`SA.x < SP.x`); else `fallback` (`study.geometry?.anterior_side ?? study.anteriorSide ?? null`).
  **Amended 2026-10-10 (ruling R8, Task 2 fix round 1, `725e114`): the precedence in `projectGeometry` is reversed.**
  A cervical or full-spine projection takes the film's stored `geometry.anterior_side`, then `study.anteriorSide` (each
  only when `left` or `right`), and only when neither exists the side derived from placed levels
  (`anteriorSideFrom(editor, null)`), else null. The user's explicit Orientation choice and the model's detection are
  authoritative: an annotator dragging SA past SP must not flip a film's sign conventions silently. `anteriorSideFrom`
  itself stays the general helper (derive first, then `fallback`); `projectGeometry` simply consults the stored and
  chosen sides before calling it. A projection still without a side keeps `anterior_side: null` and is not committed
  (R7).
- `projectGeometry` builds from `base = study.geometry ?? {}`:
  - **lumbar**: `{ ...base, region: 'lumbar', vertebrae: {L1..L5 visible&placed → {superior, inferior, quadrilateral,
    ...(base.vertebrae?.[code]?.anterior_confirmed === false && source === 'model' ? {anterior_confirmed: false} : {})}},
    s1_superior: S1 visible&placed ? superior : null, femoral_circles: [FH1, FH2].filter(visible&placed).map(c => [cx, cy, radius]),
    l1_center: null, hip_midpoint: null }` plus `manually_cleared: true` when `vertebrae` is empty, `s1_superior` is null
    and `femoral_circles` is empty. Drop `c2_centroid`, `c7_centroid` and any C-level keys from `base`.
  - **cervical**: `{ ...base, region: 'cervical', anterior_side: anteriorSideFrom(editor, …), c2_centroid: C2 visible&placed ?
    centroid : null, vertebrae: {C2 → {superior: null, inferior, quadrilateral: null}; C3..C7 → {superior, inferior, quadrilateral}},
    s1_superior: null, femoral_circles: [], hip_midpoint: null, l1_center: null }`.
  - **full_spine**: both of the above merged, `region: 'full_spine'`, `anterior_side` as cervical, plus
    `c7_centroid` = the mean of C7's four corners when C7 is visible&placed, else null.
  - T1 and T4 are never projected. `image_width`/`image_height`/`source_sha256`/`coordinate_space` on `base` are kept.
  - Returns null only when `editor` is null.

- [ ] **Step 1: Write the failing tests** (`test/level-projection.test.js`). Each region's projection is passed through
  `validate({ version: STORE_VERSION, studies: [{ id: 'SP-1000', source: 'real', fileName: 'a.png', addedAt: 't', view: 'Standing lateral',
  measurements, geometry }] })` with a matching all-null `measurements` object for the region (lumbar
  `{SS: null, PI: null, PT: null, L1PA: null, LL: {'L1-S1': null}}`; cervical `{region: 'cervical', C2C7_COBB: null,
  C2C7_SVA_PX: null, C2C7_SVA_MM: null}`; full_spine `{region: 'full_spine', GLOBAL_SVA_PX: null, GLOBAL_SVA_MM: null}`),
  and the test asserts the returned record's `geometry` is not null (the validator accepted it). Also:

```js
// lumbar: C3 placed on a lumbar film is NOT in vertebrae; T1 and T4 never are; hidden S1 → s1_superior null
// lumbar: nothing placed → { vertebrae: {}, s1_superior: null, femoral_circles: [], manually_cleared: true }
// cervical: s1_superior null and femoral_circles [] even when S1/FH1 are placed; C2 → superior null, quadrilateral null
// full_spine: c7_centroid equals the mean of C7's corners; anterior_side 'left' when SA.x < SP.x
// auto: only C3 placed → 'cervical'; only L3 → 'lumbar'; both → 'full_spine'; nothing → 'lumbar'
// levelsFromGeometry(fakeGeometry()).FH1 → { center: [10, 140], radius: 5, rim: null }
// quadrilateral({superior: [SA, SP], inferior: [IA, IP]}) → [SA, SP, IP, IA]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/level-projection.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `renderer/data/level-projection.js`.**

- [ ] **Step 4: Run the tests**

Run: `node --test test/level-projection.test.js test/levels.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/level-projection.js test/level-projection.test.js
git commit -m "feat: project the level model into study geometry per region, and read it back"
```

---

### Task 3: Handles for the level model (`renderer/viewer/level-handles.js`)

**Files:**
- Create: `renderer/viewer/level-handles.js`
- Test: `test/level-handles.test.js`

**Interfaces:**
- Consumes: `kindOf`, `LEVEL_CODES`, `fitRim`, `synthesizeRim`, `levelState` (Task 1); `imageToClient` from
  `renderer/viewer/geometry.js`.
- Produces:

```js
export const RIM_HANDLES = ['R0', 'R1', 'R2', 'R3']
export function levelHandles(code, geometry)                  // → [{handle, point, colorKey}] in Tab order; [] for null geometry
export function handleAt(code, geometry, handle)              // → Pt | null
export function moveHandle(code, geometry, handle, point)     // → new LevelGeometry; a rim move refits via fitRim over the (materialised) rim
export function nudgeHandle(code, geometry, handle, dx, dy)   // → new LevelGeometry
export function hitTestLevelHandles(handles, clientX, clientY, canvas, radius = 14)   // → handle string | null (nearest within radius, client space)
export function handleOrder(editor)                           // → [{code, handle}] over visible, placed, non-placing levels in LEVEL_CODES order
export function nextLevelHandle(editor, direction)            // → {code, handle} | null; from editor.handle, else editor.selected's first/last, else the first/last of handleOrder
```

Rules: `body` handles `SA SP IA IP` (colorKeys the same); `c2` `IA IP CENTROID` (colorKeys `IA IP level`); `endplate`
`SA SP`; `centroid` `CENTROID` (`level`); `circle` `R0..R3` over `geometry.rim ?? synthesizeRim(geometry)` with colorKey
`trace` — a model circle with `rim: null` therefore shows four synthesised handles, and `moveHandle` on one of them
materialises all four into `rim` before replacing the moved one and refitting (handoff §7). `moveHandle` on a centroid
sets it; on a body corner sets the matching pair entry. `nextLevelHandle` wraps around the whole `handleOrder`; a
`direction < 0` steps backwards.

- [ ] **Step 1: Write the failing tests** (`test/level-handles.test.js`): handle lists per kind; `hitTestLevelHandles`
  with a fake canvas `{ width: 200, height: 100, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 200 }) }`
  picks the nearest handle within 14 CSS px and null beyond; `moveHandle('FH1', {center: [50, 50], radius: 10, rim: null}, 'R0', [62, 50])`
  returns a rim of 4 points with `rim[0]` = `[62, 50]` and a refitted centre; `nudgeHandle('L3', body, 'SA', 1, -2)` moves
  only SA; `nextLevelHandle` wraps from the last handle of the last placed level to the first of the first, and steps
  backwards with −1.

- [ ] **Step 2: Run to verify failure.** `node --test test/level-handles.test.js` → module not found.

- [ ] **Step 3: Implement `renderer/viewer/level-handles.js`.**

- [ ] **Step 4: Run to verify pass.** `node --test test/level-handles.test.js`.

- [ ] **Step 5: Commit**

```bash
git add renderer/viewer/level-handles.js test/level-handles.test.js
git commit -m "feat: handles, hit-testing and Tab order for the level model, with rim-point refits"
```

---

### Task 4: The store key and its resets

**Files:**
- Modify: `renderer/store.js` (add `levelEditor: null` after `selection: null`, with a comment pointing at the
  `LevelEditor` typedef in `renderer/data/levels.js`)
- Modify: `renderer/screens/studies.js:109` and `renderer/data/demo-visibility.js` (`FRESH_VIEW` gains `levelEditor: null`)
- Test: `test/store.test.js` (`assert.equal(state.levelEditor, null)`), `test/demo-visibility.test.js` (unchanged; it
  pins the two copies equal and will fail until both are updated)

- [ ] **Step 1: Add the assertion** to `test/store.test.js`'s initial-shape test and run `node --test test/store.test.js` → FAIL.
- [ ] **Step 2: Add the key** to `renderer/store.js` and `levelEditor: null` to both `FRESH_VIEW` objects.
- [ ] **Step 3: Run** `node --test test/store.test.js test/demo-visibility.test.js` → PASS.
- [ ] **Step 4: Commit**

```bash
git add renderer/store.js renderer/screens/studies.js renderer/data/demo-visibility.js test/store.test.js
git commit -m "feat: state.levelEditor, reset with every fresh view"
```

---

### Task 5: The label record (`renderer/data/label-record.js`), the schema check, and the C2 schema amendment

**Files:**
- Create: `renderer/data/label-record.js`, `test/fixtures/schema-check.js`
- Modify: `docs/design/level-editor/label-record.schema.json` (C2), `docs/design/level-editor/label-record.example.json`
- Test: `test/label-record.test.js`

**Interfaces:**
- Consumes: `LEVEL_CODES`, `kindOf`, `levelState`, `trainingStatus` (Task 1); `fileStem` from `renderer/data/labels.js`;
  `VERSION_LABEL` from `renderer/data/version.js`.
- Produces:

```js
export const LABEL_SCHEMA = 'spinecontour.segmentation-label/1'
export function viewSlug(view)                     // 'Standing lateral' → 'standing_lateral'; '' or null → 'unknown'
export function appVersion(label = VERSION_LABEL)  // 'v1.0.17' → '1.0.17'
export function labelFileName(stem, taken)         // taken: Iterable<string>; → '<stem>.label.json' | '<stem>-2.label.json' | '-3' …
export function toLabelRecord({ editor, study, image, model, appVersion, savedAt, contours })   // → record (schema-valid)
export function recordLevels(record)               // → Object<code, {visible, source, geometry: LevelGeometry|null}> (femoral_heads[] → FH1/FH2)
```

- `image` = `{ file, sha256, width, height }`; `model` = `{ name, version }`; `contours` = `Object<code, Pt[]|null>`
  (Task 12 fills it; before that pass `{}` and every `contour` is null).
- Per level: `state` = `levelState`, `source`; placed states write geometry: body `corners: {sa, sp, ia, ip}`
  (= superior[0], superior[1], inferior[0], inferior[1]), `model_corners` = the model's mapped the same way when state
  is `edited` else null, `contour` = `contours[code] ?? null`; **C2** `corners: {ia, ip}`, `centroid`, `model_corners`,
  `model_centroid` (both the model's when `edited`, else null); endplates `corners: {sa, sp}`, `model_corners`; T4
  `centroid`, `model_centroid`; `femoral_heads` always two entries `{id: 1|2, state, source}` plus, when placed,
  `center`, `radius`, `rim` (2–4 points or null), `model_circle` (`{center, radius}` when `edited`, else null).
  `not_placed`/`not_visible` carry only `state` and `source`. `complete` = `trainingStatus(editor).complete`.
  `study` = `fileStem(study.fileName)` — never `studyName()` (a rename) and never the SP id. `film` =
  `{ region: editor.region === 'auto' ? projectionRegion(editor, study) : editor.region, view: viewSlug(study.view) }`.
- Schema amendment: add `$defs/c2corners` (`{ia, ip}` points, `additionalProperties: false`) and `$defs/c2`
  (`state`, `source`, `corners: c2corners`, `centroid: point`, `model_corners: c2corners|null`,
  `model_centroid: point|null`; placed states require all four; other states forbid them; when `edited` both model
  fields are non-null); point `levels.C2` at `#/$defs/c2`. Add to the schema's description: "C2 is an inferior
  endplate plus a centroid (owner decision 2026-10-10)". Keep the example valid (its C2 is `not_visible`).
- `test/fixtures/schema-check.js`: `export function validateAgainst(schema, value) → { ok, errors: string[] }`
  supporting exactly: `type` (object, array, string, number, integer, boolean, null), `const`, `enum`, `required`,
  `properties`, `additionalProperties: false`, `$ref` to `#/$defs/<name>`, `allOf`, `anyOf`, `oneOf`, `not`,
  `if`/`then`/`else`, `items`, `prefixItems`, `minItems`, `maxItems`, `minimum`, `exclusiveMinimum`, `minLength`,
  `pattern`; `format`, `description`, `examples`, `$schema`, `$id`, `title` are ignored. Errors name the JSON pointer.

- [ ] **Step 1: Write the failing tests** (`test/label-record.test.js`):

```js
test('the shipped example validates against the schema', …)              // validateAgainst(schema, example).ok === true
test('a record missing femoral_heads fails', …)                           // ok false, errors mention '/femoral_heads'
test('toLabelRecord from a lumbar editor validates and maps corners', …)  // L1 corners.sa deepEqual superior[0]; model_corners null when segmented
test('an edited level carries model_corners; a manual one carries null', …)
test('a not_visible level carries only state and source', …)
test('C2 writes corners {ia, ip} and a centroid', …)                      // from a cervical editor with C2 placed
test('femoral heads are two entries with rim null for unedited model output', …)
test('study is the filename stem, never the renamed name', …)             // study: { fileName: 'lateral_lumbar_001.dcm', name: 'My film' } → 'lateral_lumbar_001'
test('viewSlug and appVersion', …)                                        // 'Standing lateral' → 'standing_lateral'; 'v1.0.17' → '1.0.17'
test('labelFileName suffixes a clash', …)                                 // (stem, []) → 'a.label.json'; (stem, ['a.label.json']) → 'a-2.label.json'; … ['a.label.json','a-2.label.json'] → 'a-3.label.json'
test('recordLevels inverts toLabelRecord', …)                             // visible/source/geometry round trip for every code
```

- [ ] **Step 2: Run to verify failure.** `node --test test/label-record.test.js`.
- [ ] **Step 3: Amend the schema and example**, write `test/fixtures/schema-check.js`, then `renderer/data/label-record.js`.
- [ ] **Step 4: Run to verify pass.** `node --test test/label-record.test.js`; then the full glob.
- [ ] **Step 5: Commit**

```bash
git add renderer/data/label-record.js test/fixtures/schema-check.js test/label-record.test.js docs/design/level-editor/label-record.schema.json docs/design/level-editor/label-record.example.json
git commit -m "feat: build the label record from the level model; C2 is an inferior endplate plus centroid in the schema"
```

---

### Task 6: Persisting the record — `labelFile` on the study, IPC, API, delete and quarantine

**Files:**
- Modify: `renderer/data/persistence.js:168-254` (`validateStudy` returns `labelFile: optionalText(entry.labelFile)`),
  `main.js` (paths, three handlers, quarantine), `preload.js`, `renderer/api.js`, `renderer/screens/studies.js:475-575`
  (delete paths), `renderer/data/delete-studies.js` (`deleteStudyBatch` takes `deleteLabelRecord` too)
- Test: `test/persistence.test.js` (round trip), `test/api.test.js` (the three wrappers reject when persistence is
  disabled, as `deletePrediction` does), `test/delete-studies.test.js` (the batch deletes the record when the study has one)

**Interfaces:**
- `main.js`:

```js
const LABEL_FILE = /^(?!\.)[^\\/:*?"<>|\u0000-\u001f]{1,200}\.label\.json$/;   // no separators, no leading dot: '.' and '..' cannot form
function labelPath(name)                     // throws Error('Invalid label file name.') unless LABEL_FILE matches; → userData/labels/<name>
ipcMain.handle('load-label-record', (_e, name) => readJsonOrNull(labelPath(name)))
ipcMain.handle('save-label-record', async (_e, name, record) => { mkdir labels (recursive); writeJsonAtomic(labelPath(name), record) })   // throws 'Nothing to save.' on a non-object
ipcMain.handle('delete-label-record', async (_e, name) => unlink; ENOENT resolves; any other error → the delete-prediction sentence)
```
  The quarantine in `load-studies` renames `labels/` to `labels.corrupt-<stamp>` beside `predictions.corrupt-<stamp>`
  (ENOENT ignored); the notice's parenthesis becomes `(with ${sidecarDir} and ${labelsDir})`.
- `preload.js`: `loadLabelRecord(name)`, `saveLabelRecord(name, record)`, `deleteLabelRecord(name)`.
- `renderer/api.js`:

```js
export async function loadLabelRecord(name)            // → object | null
export async function saveLabelRecord(name, record)    // assertWritable(); → void
export async function deleteLabelRecord(name)          // assertWritable(); → void
```
- `renderer/screens/studies.js` `deleteStudy(id)`: after `deletePrediction(id)`, `if (study.labelFile) await deleteLabelRecord(study.labelFile)`
  inside the same try; `deleteSelectedStudies` passes `deleteLabelRecord` to `deleteStudyBatch(targets, { deletePrediction, deleteLabelRecord })`,
  which calls it for every study with a `labelFile`.
- Contract (Task 14 records it): `Study.labelFile: string|null`, optional, no `STORE_VERSION` bump.

- [ ] **Step 1: Write the failing tests.** `test/persistence.test.js`: a study with `labelFile: 'a.label.json'`
  validates with it kept; a missing field reads `null`. `test/api.test.js`: with `disablePersistence('r')` in effect
  `saveLabelRecord`/`deleteLabelRecord` reject with a message containing the reason, and `loadLabelRecord` calls the
  bridge (use `withWindow`). `test/delete-studies.test.js`: `deleteStudyBatch([{id:'SP-1000', labelFile:'a.label.json'}, {id:'SP-1001', labelFile: null}], {deletePrediction, deleteLabelRecord})`
  calls `deleteLabelRecord` once with `'a.label.json'`.
- [ ] **Step 2: Run to verify failure.** `node --test test/persistence.test.js test/api.test.js test/delete-studies.test.js`.
- [ ] **Step 3: Implement** the renderer side (persistence, api, studies.js, delete-studies.js) and the main-process
  side (main.js, preload.js). Mirror `delete-prediction`'s error mapping and comments.
- [ ] **Step 4: Run to verify pass**, then the full glob.
- [ ] **Step 5: Commit**

```bash
git add renderer/data/persistence.js renderer/api.js renderer/screens/studies.js renderer/data/delete-studies.js main.js preload.js test/persistence.test.js test/api.test.js test/delete-studies.test.js
git commit -m "feat: labels/<stem>.label.json on disk — labelFile on the record, load/save/delete IPC, delete and quarantine coverage"
```

---

### Task 7: Backend — `POST /decode` and per-model versions

**Files:**
- Create: `backend/decode.py`, `backend/tests/unit/test_decode.py`, `backend/tests/integration/test_decode_server.py`
- Modify: `backend/server.py` (the route; `qc["model_versions"]` in `_analyze`), `backend/models/models.py` (`model_versions`)
- Test: `backend/tests/unit/test_model_versions.py`

**Interfaces:**

```python
# backend/decode.py
def decode_film(payload: bytes) -> dict:
    """{"width", "height", "bits_stored" (int|None), "value_min", "value_max" (floats, after RescaleSlope/Intercept and
    MONOCHROME1 inversion), "window": {"center", "width"} | None (DICOM WindowCenter/WindowWidth, first value of a
    multi-value, inverted with the pixels for MONOCHROME1; None when absent or for non-DICOM), "photometric": str|None,
    "pixels_base64": base64 of little-endian uint16 of round(value - value_min)}. Raises ValueError for anything
    that is not a single-frame grayscale image or DICOM, or that exceeds 25 megapixels."""

# backend/server.py
@app.post("/decode", summary="Decode the original film for display windowing")
async def decode(file: UploadFile = File(...)) -> dict   # 422 on empty, > MAX_UPLOAD_BYTES, or ValueError

# backend/models/models.py
def model_versions(models: dict[str, str]) -> dict[str, str | None]:
    """For each structure in `models` ({'vertebrae': 'unet', …}) the onnx_sha256 of the graph(s) that read it, from
    ONNX_DIRECTORY/<kind>.json: unet/vertebrae → vertebra; unet/femoral → femoral; keypointrcnn → s1; hrnet → hrnet;
    cervical_hrnet → cervical_hrnet; cervical_detr → cervical_detr; dual_hrnet → 'cervical_hrnet+hrnet' joined by '+';
    a missing metadata file → None."""
```
- `_analyze` adds `"model_versions": model_versions(prediction["models"])` inside `qc`.
- Decode rules: Pillow first (`I;16*`, `I`, `F` modes keep precision; everything else `convert('L')`), pydicom as the
  fallback exactly as `_dicom_pixel_array` does (slope, intercept, MONOCHROME1 as `max + min − value`); `bits_stored`
  from `BitsStored` for DICOM, 8 for 8-bit images, 16 for 16-bit PNG/TIFF; `window.center` for MONOCHROME1 =
  `(max + min) − WindowCenter`.

- [ ] **Step 1: Write the failing tests.** Unit: an 8-bit PNG (`np.arange(0, 256)` tiled) → `value_min 0`, `value_max 255`,
  `bits_stored 8`, `window None`, pixels decode back to the array; a 16-bit PNG (`np.uint16` ramp to 4000) keeps 4000;
  a synthetic DICOM built with pydicom (`FileDataset`, `BitsStored 12`, `WindowCenter 2048`, `WindowWidth 4096`,
  `PhotometricInterpretation MONOCHROME2`, `RescaleSlope 1`, `RescaleIntercept 0`) → `window {"center": 2048, "width": 4096}`;
  the same with `MONOCHROME1` → pixels inverted and `window.center == (max + min) - 2048`; a multi-value
  `WindowCenter` takes the first; `b'not an image'` → `ValueError`; a 6000×5000 image → `ValueError`. Integration
  (`TestClient(server.app)`): `/decode` with `upload()` from `test_global_sva_server.py` → 200 with `width 100`,
  `height 120`, a base64 string of length `ceil(100*120*2/3)*4`; empty and garbage → 422. `model_versions`:
  monkeypatch `ONNX_DIRECTORY` to a tmp dir holding `vertebra.json` `{"onnx_sha256": "ab"}` and no `s1.json` →
  `{'vertebrae': 'ab', 's1': None}` for `{'vertebrae': 'unet', 's1': 'keypointrcnn'}`; `dual_hrnet` with both files → `'<c>+<h>'`.
- [ ] **Step 2: Run to verify failure.**

Run: `"C:/Users/codyj/Spine Contour Desktop/Spine-Contour/.venv/Scripts/python.exe" -m pytest backend/tests/unit/test_decode.py backend/tests/integration/test_decode_server.py backend/tests/unit/test_model_versions.py -q`
Expected: ImportError / 404.

- [ ] **Step 3: Implement** `backend/decode.py`, the route (shape of `/classify-view` at `server.py:228-240`),
  `model_versions` and the `qc` line.
- [ ] **Step 4: Run to verify pass**, then the whole backend suite (`-m pytest backend -q`; graph tests skip in the worktree).
- [ ] **Step 5: Commit**

```bash
git add backend/decode.py backend/server.py backend/models/models.py backend/tests/unit/test_decode.py backend/tests/integration/test_decode_server.py backend/tests/unit/test_model_versions.py
git commit -m "feat(backend): POST /decode returns the original film's 16-bit pixels and window defaults; qc.model_versions"
```

---

### Task 8: Window / level in the renderer — the pure module, the IPC, the film layer

**Files:**
- Create: `renderer/viewer/window-level.js`, `test/window-level.test.js`
- Modify: `main.js` (`decode-film`), `preload.js`, `renderer/api.js` (`decodeFilm`), `renderer/viewer/canvas.js:121-130`
  (`drawStaticLayer`), `renderer/screens/analysis.js` (`loadRawFilm`, `imagesFromRaw`, cache integration, export
  `ensureFilm`), `test/canvas.test.js`

**Interfaces:**

```js
// renderer/viewer/window-level.js
export const WIDTH_MIN = 64
export function defaultWindow(raw)                 // raw: RawFilm → {width, level}: DICOM window when present (clamped); else 8-bit → {256, 128}; else {max(64, valueMax − valueMin), (valueMin + valueMax) / 2} rounded
export function windowRange(raw)                   // → {widthMin: 64, widthMax: max(64, valueMax − valueMin + 1), levelMin: valueMin, levelMax: valueMax}   (8-bit → widthMax 256)
export function clampWindow(window, range)         // → {width, level} integers within range
export function dragWindow(start, dx, dy, range)   // → clampWindow({width: start.width + 4*dx, level: start.level + 4*dy}, range)   (dy < 0 lowers level → brighter)
export function windowText(window)                 // 'W 4096 · L 2048'
export function cropRaw(raw, height)               // → raw with the top `height` rows (same object when equal); throws when height > raw.height
export function applyWindow(raw, window, out)      // out: Uint8ClampedArray(width*height*4) → fills RGBA: v = round(255 * clamp((value − (level − width/2)) / width, 0, 1)), alpha 255

// renderer/api.js
export async function decodeFilm({ name, data })   // → { width, height, bitsStored, valueMin, valueMax, window, pixels: Uint8Array (uint16 LE bytes) }

// main.js
ipcMain.handle('decode-film', async (_e, request) => …)   // like classify-view: POST /decode, 60 s timeout; returns the JSON fields with pixels_base64 decoded to a Uint8Array

// renderer/viewer/canvas.js
export function drawStaticLayer(ctx, canvas, images, opts)   // opts gains {editing, window}: when opts.window && images.raw → putImageData(applyWindow(images.raw, opts.window, scratch)); else drawImage(images.image); the mask overlay is skipped when opts.editing
export function imagesFromRaw(raw, window)                    // → images {image: ImageBitmap|canvas, mask: null, overlayCanvas: null, width, height, raw, preview: true}

// renderer/screens/analysis.js
export async function ensureFilm(studyId)   // → {images, raw: RawFilm|null, reason: string|null}: resolves the open study's images (cache, sidecar restore, or a decode of the original for a film with no result), then the raw decode once per study (cached on images.raw); never throws
```

- `loadRawFilm` (private): `filmBytes(study)` → `decodeFilm({name: study.fileName, data})` → `raw` with
  `pixels: new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)`; when the study has stored `images`
  whose `height < raw.height` and equal width, `cropRaw(raw, images.height)`; a width mismatch → `reason`
  `The original film does not match the stored image.`; a missing file → `The source film could not be found.`;
  any other error → its message. The raw is attached to the cached `images` object (`images.raw = raw`, a new
  images object reference so `staticKey` changes).
- A film with no result and no sidecar (the main case): `ensureFilm` builds `imagesFromRaw(raw, defaultWindow(raw))`,
  caches it (`cacheImages`) and hands it to the viewer with `setImages`, so the stage shows the film.
- `drawStaticLayer`'s LUT path keeps one module-scope scratch `Uint8ClampedArray` per canvas size to avoid allocating
  per slider tick.

- [ ] **Step 1: Write the failing tests** (`test/window-level.test.js`): `defaultWindow` for 8-bit (`{256, 128}`), for a
  DICOM window (`{4096, 2048}`), for a 16-bit range 0..4000 with no window (`{4000, 2000}`); `windowRange`;
  `clampWindow` floors width at 64; `dragWindow({width: 1000, level: 500}, 10, -5, range)` → `{1040, 480}`;
  `applyWindow` on a 2×1 raw `[0, 100]` with `{width: 100, level: 50}` → pixels `0` and `255`, alpha 255; `cropRaw`
  keeps the first rows; `windowText`. `test/canvas.test.js`: `drawStaticLayer` with `{editing: true}` never draws the
  overlay canvas (recording context: one `drawImage`, no `globalAlpha` write); with `window` and `images.raw` it calls
  `putImageData` and not `drawImage`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** the module, the IPC trio, `drawStaticLayer`, `imagesFromRaw`, `ensureFilm`/`loadRawFilm`.
- [ ] **Step 4: Run to verify pass**, full glob.
- [ ] **Step 5: Commit**

```bash
git add renderer/viewer/window-level.js test/window-level.test.js main.js preload.js renderer/api.js renderer/viewer/canvas.js renderer/screens/analysis.js test/canvas.test.js
git commit -m "feat: window / level — decode the original film, a linear LUT on the film layer only, a film for unsegmented studies"
```

---

### Task 9: Drawing the level editor on the dynamic layer (`renderer/viewer/canvas.js`)

**Files:**
- Modify: `renderer/viewer/canvas.js` (`LEVEL_RGB` + T1/T4/S1; export `CORNER_COLORS`, `TRACE_COLOR`; new
  `drawLevelEditor`; `drawDynamicLayer` takes `opts.editor`)
- Test: `test/canvas.test.js`

**Interfaces:**
- Consumes: `LEVEL_CODES`, `kindOf`, `levelState`, `placementSteps` (Task 1); `levelHandles` (Task 3); `quadrilateral` (Task 2).
- Produces:

```js
export const LEVEL_RGB   // + T1: [255, 159, 64], T4: [255, 205, 86], S1: [255, 99, 132]  (D9)
export const CORNER_COLORS, TRACE_COLOR   // now exported; values unchanged
export function colorFor(colorKey, code)  // 'SA'|'SP'|'IA'|'IP' → CORNER_COLORS; 'trace' → TRACE_COLOR; 'level' → rgb(LEVEL_RGB[code]); circles → FEMORAL_OVERLAY_COLOR
export function drawLevelEditor(ctx, canvas, editor, opts)   // opts: {overlays, overlayOpacity, pixelRatio, handle, dragGeometry: {code, geometry}|null}
export function drawDynamicLayer(ctx, canvas, geometry, opts)   // when opts.editor: skips the outline/S1/C7/femoral loops, draws drawSelectedMeasurement, then drawLevelEditor
```

Drawing rules (handoff §5), all sizes in CSS px × `pixelRatio` unless image-scaled:
- Every visible placed level except the one being placed: fill (`rgba(level, 116/255 × overlayOpacity/100)`) when
  `overlays`; stroke level colour at alpha 0.85, `1.25` CSS px. Body → closed quadrilateral; c2 → inferior line plus a
  centroid dot (r 3); endplate → line; centroid → dot (r 5); circle → arc. Selected level → stroke `#D45A32`, 2 px.
  With `overlays` off nothing is filled or labelled and only the selected level is stroked.
- Selected and `edited`: the model geometry dashed `[6, 5]` in `rgba(250,247,242,.7)` under the current one.
- Labels (not circles, `overlays` on or selected): `500 11px Chivo Mono` on a plate (`LABEL_PLATE_FILL`, rx 4,
  18 px tall) anchored 14 px right of the posterior corner (SP/IP mean for bodies, IP for c2, SP for endplates, the
  point for T4); text `STAGE_LABEL_FILL`, selected `#D45A32`.
- Handles only for the selected level: r 6, `#0B0A09` stroke 2 px, colours by `colorFor`; circles add a non-draggable
  centre dot r 3.5 in `#FAF7F2`. The focused handle (`opts.handle`) gets the existing 10 px accent ring.
- Placement: placed points r 6 in the step colours; a dashed `#D45A32` polyline through them (not for circles);
  circles with ≥ 2 points draw the dashed fitted preview and its centre dot. The level being placed is not drawn.
- `dragGeometry` substitutes one level's geometry for the frame.

- [ ] **Step 1: Rewrite the handle tests** in `test/canvas.test.js`: the two old edit-mode tests (`2 + 22 + 4`, selection
  ring labels, retrace dots) are replaced by: `drawDynamicLayer(..., {editing: true, editor})` with a lumbar editor
  and `selected: 'L3'` draws 4 handle arcs plus the two circles plus nothing else arc-shaped; selecting `FH1` draws
  4 rim handles plus a centre dot; an `edited` selected level adds one `setLineDash([6, 5])`; `overlays: false` leaves
  no `fill()` call and only one stroked level; a placement with two body points draws two dots and one dashed polyline;
  a circle placement with two points draws a dashed preview arc; labels (`fillText`) list the visible levels' codes and
  no circle. Keep `drawDynamicLayer draws no handles outside edit mode` and the colour test, adding
  `assert.deepEqual(LEVEL_RGB.T1, [255, 159, 64])`.
- [ ] **Step 2: Run to verify failure.** `node --test test/canvas.test.js`.
- [ ] **Step 3: Implement** `drawLevelEditor` and the `drawDynamicLayer` branch. `drawHandles`/`drawTracePoints` stay
  until Task 13.
- [ ] **Step 4: Run to verify pass**, full glob.
- [ ] **Step 5: Commit**

```bash
git add renderer/viewer/canvas.js test/canvas.test.js
git commit -m "feat: draw the level editor — fills, outlines, label plates, selected-level handles, model ghost, placement preview"
```

---

### Task 10: The wiring module and the stage (`renderer/level-editor.js`, `renderer/components/viewer.js`)

**Files:**
- Create: `renderer/level-editor.js`
- Modify: `renderer/components/viewer.js` (toolbar, edit bar, W/L panel, chip, pointer, keyboard, redraw keys,
  Edit gating, card), `renderer/screens/analysis.js` (run completion, `changeRegion`, `releaseStudy` call
  `forgetLevelEditor`; `configureLevelEditor` gets `ensureFilm` and the image-info provider), `styles/screens/analysis.css`

**Interfaces:**

```js
// renderer/level-editor.js  (module scope; the only writer of state.levelEditor)
export function configureLevelEditor({ commitGeometry, getPrediction, ensureFilm, imageInfo })
//   commitGeometry(studyId, geometry)  from components/viewer.js's measure queue
//   getPrediction(studyId) → {measurements, geometry, qc} | undefined   (viewer.js's `predictions` Map)
//   ensureFilm(studyId) → Promise<{images, raw, reason}>               (screens/analysis.js, Task 8)
//   imageInfo(studyId) → Promise<{file, sha256, width, height, maskPixels: Uint8ClampedArray|null, labels: object|null}>   (screens/analysis.js; sha256 via crypto.subtle over the stored image's grayscale bytes; maskPixels and labels from the cached images / sidecar, Task 12)
export async function enterLevelEditor(studyId)       // a stashed editor for this study → reuse; else openEditor({ study, region: studyRegion(study), modelGeometry: getPrediction(studyId)?.geometry ?? null, saved }) where saved = study.labelFile ? { file: study.labelFile, levels: recordLevels(await api.loadLabelRecord(study.labelFile)) } : null (a missing file → null); setState({editing: true, panMode: false, selection: null, levelEditor}); then ensureFilm(studyId)
export function requestExit({ then = 'exit' } = {})   // unsaved → exitPrompt; else exitNow(then)
export function keepEditing()
export function exitNow(then = 'exit')                // setState({levelEditor: null, editing: false, selection: null, ...(then === 'back' ? {screen: 'studies'} : {})}), then deletes this study's stash entry
export function hasStashedEditor(studyId)             // → boolean (for the smoke suite)
export async function saveLevelEdits()                // see below; resolves after the toast
export function discardLevelEdits()                   // revertToBaseline → sync → toast 'Discarded N changes.'; if an exitPrompt is up, exitNow(prompt.then)
export function toggleLevelVisible(code), toggleLevelGroup(key), toggleGroupOpen(key), selectLevelRow(code)
export function startPlace(code), placePoint(point, imageSize), undoPlacedPoint(), cancelPlace(), fitPlacing(imageSize), clearPlacedLevel(code)
export function setFocusedHandle(handle)              // {code, handle} | null
export function commitHandleMove(code, geometry)      // setLevelGeometry → sync
export function openWindowPanel(), closeWindowPanel(), setWindow({ width, level }), resetWindow()
export function forgetLevelEditor(studyId)            // drops the stash and, if open for this study, clears it (delete, re-run, changeRegion)
```

- **The stash.** The module subscribes to the store once at import. Whenever `state.levelEditor` goes from an editor
  with `unsavedCount > 0` to null, that editor is kept in a module-scope `Map` by `studyId` (the subscriber only reads
  state and writes the Map; it never calls `setState`). `exitNow`, `saveLevelEdits` and `discardLevelEdits` delete the
  entry right after their own write, so only navigation away (opening another study through `FRESH_VIEW`, a delete)
  leaves one behind; `forgetLevelEditor` deletes it; `enterLevelEditor` reuses it. Sidebar navigation to another screen
  changes only `screen`, so the open editor simply survives in the store and edit mode resumes when the study is
  reopened through the OPEN STUDY card.

- `sync(editor)` (private): `commitGeometry(editor.studyId, projectGeometry(editor, study))` whenever a change
  touches a projected level (geometry or visibility of a C/L/S1/FH code, or any change on an `auto` film); label-only
  changes (T1, T4, out-of-region) do not commit.
- `saveLevelEdits`: demo study → toast `Demo studies are not exported` and return. Otherwise `n = unsavedCount`;
  `info = await imageInfo(studyId)`; `contours` = Task 12's per-level contours from `info.maskPixels` (empty `{}` until
  then); `record = toLabelRecord({ editor, study, image: {file: study.fileName, sha256: info.sha256, width, height},
  model: {name: study.qc?.models?.vertebrae ?? 'none', version: study.qc?.model_versions?.vertebrae ?? 'unknown'},
  appVersion: appVersion(), savedAt: new Date().toISOString(), contours })`; file = `study.labelFile ??
  labelFileName(fileStem(study.fileName), every other study's labelFile)`; `await api.saveLabelRecord(file, record)`;
  on success write `labelFile` onto the study record (new object, new array) and `markSaved(editor, file)`; toast
  `Saved N edits to the label record.`; if an `exitPrompt` is up, `exitNow(prompt.then)`. A rejected save toasts
  `Could not save the label record: {message}` and leaves the editor as it was.
- `openWindowPanel`: sets `window.open = true`; when `window === null` → `{open: true, status: 'loading', …zeros}`
  then `ensureFilm(studyId)` → `raw` ? `status: 'ready'` with `defaultWindow(raw)` and `windowRange(raw)` : `status: 'unavailable', reason`.
- Every mutator reads the current editor from `getState()`, returns early if `levelEditor` is null or `studyId !== openId`,
  and writes the new object with `setState({ levelEditor: next })`.

`renderer/components/viewer.js` changes:

- Module scope: `configureLevelEditor({ commitGeometry, getPrediction: (id) => predictions.get(id), ensureFilm, imageInfo })`
  is called by `screens/analysis.js` at its module scope (analysis.js owns `ensureFilm` and the image cache); viewer.js
  exports `getPrediction(studyId)` and `commitGeometry` for it. Remove `retracing`, `tracePoints`, `tracePointPointer`,
  `cancelRetrace`, `toggleRetrace`, `addCircle`, `deleteCircle`, `applyFit` and the ADD CIRCLE / DELETE CIRCLE /
  RETRACE / FIT(retrace) buttons; `startChordPan`'s trace-point rollback goes with them.
- Toolbar: `windowButton = toolButton('Window / level', ICONS.windowLevel, …)` inserted after `panButton`, hidden
  (`is-hidden`) unless editing; `aria-pressed` follows `levelEditor.window?.open`.
- Edit bar DOM (handoff §3): `editLabel` (`.viewer-editbar-label`, text set in `updateEditBar`: `EDITING SEGMENTATION`,
  `placingLabel(editor)`, or `WINDOW / LEVEL · PLACING PAUSED` / `WINDOW / LEVEL` while the panel is open), `editHelp`
  (`.viewer-edit-help`, 12 px `--stage-body`, flex 1: `placingHelp(editor)`; `Drag on the film: left–right sets width, up–down sets level. Press Done to go back to editing.`
  while W/L is open; `{rowName} selected — drag a handle to adjust it.` / `… drag a rim point to refit it.` for a
  selected placed level; else `Select a level in the panel to adjust it, or place one the model missed.`), `steps`
  (`.viewer-steps` of `.viewer-step` chips with `.is-done`/`.is-current` and a `.viewer-step-dot` coloured by
  `colorFor`), then `fitButton` (`FIT`, circles only, enabled from 2 points), `undoButton` (`UNDO`, disabled at 0),
  `cancelButton` (`CANCEL`), a divider, `resetButton` (`RESET TO PREDICTION`, D14), `doneButton` (`DONE` → `requestExit()`).
  Placement controls are hidden unless `editor.placing && !editor.window?.open`.
- W/L panel: `div.viewer-wl[role=group][aria-label="Window and level"]` with the verbatim copy, two
  `input.viewer-wl-slider[type=range]` (WIDTH `min 64 max range.widthMax`, LEVEL `min range.levelMin max range.levelMax`),
  `.viewer-wl-value` readouts, `RESET` → `resetWindow()`, `DONE` → `closeWindowPanel()`; a `.viewer-wl-note` showing
  `reason` when `status === 'unavailable'` and the sliders disabled. Hidden unless `editor.window?.open`.
- Chip: `.viewer-chip-divider` + `.viewer-chip-window` (`windowText`) appended while editing and `status === 'ready'`.
- `describeCard`: after the demo branch, `if (state.editing) return null`.
- Edit button: `disabled = busy || filmStatus !== null || !(hasResult || Boolean(currentImages))`; click →
  `state.editing ? requestExit() : enterLevelEditor(study.id)`. Label `Edit segmentation` / `Done editing`.
- `handlePointerDown` in edit mode (after the pan branches; `!study.geometry` no longer returns early while editing):
  W/L open and button 0 → `drag = {kind: 'window', pointerId, clientX, clientY, start: {width, level}}` and
  `stage.classList.add('is-windowing')`; else `editor.placing` → `placePoint(clientToImage(event, dynamicCanvas), {width, height})`
  with `suppressClick = true`; else hit-test `levelHandles(selected, geometry)` through `hitTestLevelHandles` →
  `drag = {kind: 'levelHandle', pointerId, code, handle, geometry: structuredClone(levelGeometry), moved: false}` and
  `setFocusedHandle({code, handle})`. `handlePointerMove`: `window` → `setWindow(dragWindow(drag.start, dx, dy, range))`;
  `levelHandle` → `drag.geometry = moveHandle(...)`, `redrawDynamic()` with `dragGeometry`. `handlePointerUp`:
  `levelHandle` moved → `commitHandleMove(code, geometry)`.
- `handleClick` in edit mode does nothing (row selection comes from the panel).
- A placement click on the black surround (handoff §11 "clamp to the image bounds"): `host` gets its own `pointerdown`
  listener (attached and removed with the others) that, while `editor.placing` is set and the target is not
  `dynamicCanvas`, runs the placement branch with `clientToImage(event, dynamicCanvas)`, which clamps.
- `handleKeyDown` in edit mode: the early return applies only to `input:not([type="checkbox"]):not([type="range"]), select, textarea, [contenteditable="true"]`;
  `Escape` → placing ? `cancelPlace()` : W/L open ? `closeWindowPanel()` : `requestExit()`; `Tab` outside
  `.viewer-editbar, .viewer-wl, .level-editor` → `nextLevelHandle(editor, ±1)` → `setFocusedHandle` and
  `selectLevelRow(code)`; arrows with a focused handle → `nudgeHandle` + `commitHandleMove`; Delete/Backspace do nothing.
- Redraw keys: `staticKey = [overlays, overlayOpacity, currentImages, state.editing, window?.width, window?.level, window?.status]`;
  `dynamicKey` adds `state.levelEditor`. `redrawDynamic` passes `editor`, `handle`, `dragGeometry`, `overlays`, `overlayOpacity`.
- `detach()` resets the new drag kinds and classes.
- `screens/analysis.js`: run completion for the open study, `changeRegion` and `releaseStudy` call `forgetLevelEditor(id)`;
  the Back button calls `requestExit({ then: 'back' })` when `state.editing`, else navigates as today.
- CSS (`styles/screens/analysis.css`, within section 02): `.viewer-editbar { justify-content: flex-start; gap: 10px; padding: 6px 6px 6px 10px }`;
  `.viewer-edit-help { flex: 1 1 220px; min-width: 0; font-size: 12px; line-height: 1.4; color: var(--stage-body); text-align: left }`;
  `.viewer-steps`, `.viewer-step` (mono 9px, padding 5px 8px, radius 8px, `.is-current` ground `--stage-accent-soft`
  text `--stage-accent`, `.is-done` text `--stage-ink`, pending text `--stage-muted`), `.viewer-step-dot` (7px,
  filled when done/current, outline `--stage-line` when pending); `.viewer-wl` (absolute, top 116px, right 14px,
  width 300px, the glass bar tokens, radius 12px, padding 8px 8px 12px 12px, column gap 10px), `.viewer-wl-row`,
  `.viewer-wl-label` (mono 8px `--stage-muted`, width 44px), `.viewer-wl-slider` (flex 1, `accent-color: var(--stage-accent)`),
  `.viewer-wl-value` (mono 9.5px `--stage-ink`, width 36px, right), `.viewer-wl-note` (11.5px `--stage-body`);
  `.viewer-chip-divider` (1px × 12px `--stage-line`), `.viewer-chip-window` (mono 9px `--stage-muted`, tabular);
  `.viewer-stage.is-windowing .viewer-canvas-dynamic { cursor: all-scroll; }` placed after the `.is-editing` cursor
  rules and before the `.is-panning` rules; `.viewer-tool.is-hidden` already exists.

- [ ] **Step 1: Write `renderer/level-editor.js`** against the interfaces above (no unit test: it is store wiring; the
  pure parts are Tasks 1–3 and 5).
- [ ] **Step 2: Rework `renderer/components/viewer.js`** as listed; add the W/L icon to `ICONS` (the prototype's circle
  with a vertical bar and three ticks, `Main.dc.html:119`).
- [ ] **Step 3: Wire `screens/analysis.js`** (`configureLevelEditor`, `forgetLevelEditor` at the three sites, Back,
  the stash on leaving the screen, `imageInfo`).
- [ ] **Step 4: Add the CSS.**
- [ ] **Step 5: Run the unit suite** (`node --test test/*.test.js`) → all pass (nothing here is unit-tested; this proves
  nothing broke). Then launch the app from the worktree (`npm run dev`; `SPINE_CONTOUR_USER_DATA` set to a scratch
  profile, never the real one) and verify by DOM reads, not screenshots: Edit on a segmented film opens edit mode with
  the edit bar reading `EDITING SEGMENTATION`, the card hidden, handles only after a row is selected (the panel arrives
  in Task 11, so select through `setState` on the store for now); W/L opens, the sliders move the film, the chip reads
  `W … · L …`, dragging on the film changes both, RESET restores, Escape closes it; placing through the store API works.
  Record what was checked in the Ledger.
- [ ] **Step 6: Commit**

```bash
git add renderer/level-editor.js renderer/components/viewer.js renderer/screens/analysis.js styles/screens/analysis.css
git commit -m "feat: the level editor on the stage — placement clicks, selected-level handles, window / level, the reworked edit bar"
```

---

### Task 11: The panel (`renderer/components/level-editor.js`) and the Analysis screen swap

**Files:**
- Create: `renderer/components/level-editor.js`
- Modify: `renderer/components/checkbox.js` (`variant`), `styles/components.css` (checkbox indeterminate for every
  `.checkbox-row`; a `.checkbox-row.level-check` size rule is in analysis.css), `renderer/screens/analysis.js`
  (host, swap, header eyebrow), `styles/screens/analysis.css` (section `05 — LEVEL EDITOR`)

**Interfaces:**

```js
// renderer/components/checkbox.js
export function checkbox({ key, keyAttr = 'data-param-key', label, checked, note, ariaLabel, indeterminate, onChange, onClick, variant })
//   variant: undefined (today's 'checkbox-row param-check[ param-pick]') | 'level' → class 'checkbox-row level-check', no param-* classes

// renderer/components/level-editor.js
export function mountLevelEditor(container)   // → { update(state, study) }
```

- `update(state, study)` rebuilds on the reference key `[state.levelEditor, study.id, study.geometry, state.measurementDrafts?.[study.id]]`
  with the `data-level-key` focus-restore pattern of `components/measurements.js:140-150`. It writes
  `input.indeterminate` for each group box after the rebuild. All handlers call `renderer/level-editor.js` exports.
- DOM (handoff §3 "Panel"), classes prefixed `lv-`: `div.lv-panel` > `div.lv-head` (`h2.lv-title` `Vertebral levels`,
  `div.lv-summary` mono, `p.lv-help`), `div.lv-list` (scrolls) of `section.lv-group` per `LEVEL_GROUPS`:
  `div.lv-group-row` (group `checkbox({variant:'level', label: null, ariaLabel, checked: all, indeterminate: mixed})`
  + `button.lv-group-btn[aria-expanded]` with `.lv-group-title`, `.lv-group-range`, spacer, `.lv-group-count`,
  `svg.lv-chevron` rotated −90° when closed), then when open `div.lv-rows` of `div.lv-row[.is-selected]` per code:
  level checkbox (`{full name} visible on film`), `button.lv-select[aria-pressed][data-level-key=code]` with
  `span.lv-swatch` (inline `background`/`border-color` from `LEVEL_RGB`/`FEMORAL_OVERLAY_COLOR`; hollow with
  `var(--border)` when not visible, hollow in the level colour when not placed), `span.lv-name`, the badge
  (`span.{badgeFor(...).className}` > `span.dot` + label), then `div.lv-actions` (70 px): `button.btn.btn-small.lv-place`
  `Place…` (`aria-label` `Place {full name}` / `Place rim points for {full name}`) when the state is `not_placed` or
  a visible circle and not placing; `button.lv-text-btn` `CLEAR` for `manual`; `CANCEL` while placing. A
  `p.lv-note` with `dependencyNote(code, editor.region)` under an unchecked row when the note is non-null.
  `div.lv-foot`: the status line (`span.lv-status-dot` sage/accent, `span.lv-status-label`, `span.lv-status-text`
  in `--body`, accent when incomplete) and the action row (`span.lv-unsaved` mono, `button.btn.btn-small` `Discard`
  disabled at 0 changes, `button.btn.btn-primary.btn-small` `Save edits` disabled when `!canSave(editor)`); for a demo
  study `span.lv-demo-note` `Demo studies are not exported` beside Save. When `editor.exitPrompt` is set the action
  row is replaced by `div.lv-prompt`: the sentence (count from `unsavedCount`), then `Save edits`, `Discard`,
  `Keep editing` (focus lands on Keep editing).
- `screens/analysis.js`: `levelHost = div.analysis-level-host.is-hidden` appended to `aside.analysis-panel` after
  `similarHost`; `mountLevelEditor(levelHost)`; in `update()`: `panel.classList.toggle('is-editing', live.editing)`,
  the tabs row, actions row, `measurementsHost` and `similarHost` get `is-hidden` while editing and `levelHost` shows;
  `levelPanel.update(live, open)` runs every notification like the others. Header: `div.analysis-meta.analysis-editing`
  (`EDITING SEGMENTATION`, `--accent`) before the status badge, `hidden` unless editing.
- CSS: `.analysis-level-host` (flex 1, min-height 0, column); `.analysis-editing { color: var(--accent); }`;
  `.analysis-panel.is-editing .analysis-tabs, .analysis-panel.is-editing .analysis-actions { display: none }`;
  `.level-check .checkbox-box { width: 20px; height: 20px; }`; in components.css a generic
  `.checkbox-row input[type="checkbox"]:indeterminate ~ .checkbox-box` rule (accent ground and an 8×2 `--on-accent`
  dash), copied from `studies.css:546-557` so `.param-pick` keeps working; the `lv-*` rules per handoff §3: head
  padding `14px 16px 12px`, title `650 15px` `--ink`, summary mono 10px `.15em` `--muted` tabular, help 12.5px `--body`;
  list `padding: 4px 8px 10px`, groups `border-bottom: 1px solid var(--border)`; group button `min-height 44px`,
  radius 10px, hover `--well`, title `650 14px` `--ink`, range mono 9.5px `--muted`, count mono 9px `--muted`;
  chevron `transition: transform .2s ease`; rows indented 26px, select button `min-height 40px` radius 8px,
  `.is-selected` ground `--well` and `.lv-name` `--accent`, `.lv-name` `600 14px`, not-visible name `--muted`;
  swatch 8px circle; `.lv-place { padding: 5px 12px; font-size: 13px }`; `.lv-text-btn` mono 9px `--accent` padding
  `7px 8px` radius 8px hover `--well`; `.lv-note` 12px `--body` `margin: -4px 0 4px; padding: 0 12px 0 36px`; footer
  `border-top`, padding `12px 16px 14px`, dot 7px; focus rings `2px solid var(--accent)`, offset −2px on the buttons.

- [ ] **Step 1: Extend `checkbox.js`** with `variant` (the default output stays byte-identical). No unit test: the
  component needs `document`; Step 4 and the smoke suite verify it.
- [ ] **Step 2: Write `renderer/components/level-editor.js`** and the CSS.
- [ ] **Step 3: Wire the swap and the header eyebrow** in `screens/analysis.js`.
- [ ] **Step 4: Run the unit suite**, then launch from the worktree on a scratch profile and verify by DOM reads: the
  panel replaces the measurements panel in edit mode and returns on DONE; group and level checkboxes toggle; the
  group box is indeterminate when mixed; counts and the summary update; `Place…` on L3 then four clicks on the film
  places it (`Manual`); `CLEAR` returns it to `Not placed`; unchecking S1 shows its note; `Save edits` writes
  `labels/<stem>.label.json` under the scratch profile (read the file; check `levels.L3.state === 'manual'`); DONE with a
  change shows the three-button prompt; Discard restores; dark theme reads correctly. Record in the Ledger.
- [ ] **Step 5: Commit**

```bash
git add renderer/components/level-editor.js renderer/components/checkbox.js renderer/screens/analysis.js styles/screens/analysis.css styles/components.css
git commit -m "feat: the Vertebral levels panel replaces Measurements in edit mode; save, discard, exit prompt, header eyebrow"
```

---

### Task 12: Contours from the label mask (`renderer/data/contours.js`)

**Files:**
- Create: `renderer/data/contours.js`, `test/contours.test.js`
- Modify: `renderer/level-editor.js` (`saveLevelEdits` passes `contours`), `renderer/screens/analysis.js`
  (`imageInfo` returns `maskPixels` and `labels` from the cached images / sidecar), `renderer/viewer/canvas.js`
  (`loadStudyImages` keeps `maskPixels` on the images object)

**Interfaces:**

```js
export function traceLabel(maskPixels, width, height, labelId)   // → Pt[] | null: the outer boundary of the largest 4-connected component of pixels whose red channel === labelId (RGBA buffer), as pixel-corner coordinates, clockwise; null when fewer than 3 pixels
export function simplify(points, tolerance = 1.5)                 // Douglas–Peucker on a closed polygon → Pt[] (≥ 3 points or the input)
export function levelContours(maskPixels, width, height, labels, editor)   // → Object<code, Pt[]|null> for body levels whose state is segmented or edited and whose model geometry exists; null elsewhere
```

- [ ] **Step 1: Write the failing tests**: a 10×10 mask with a 4×4 block of label 20 → `traceLabel` returns the four
  corners after `simplify` (`[[3,3],[7,3],[7,7],[3,7]]` or a rotation); two components → the larger one; no pixels → null;
  `levelContours` returns a polygon for `L1` (segmented) and null for a manual `L3` and for `S1`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement**, then wire `maskPixels` through `imageInfo` and `saveLevelEdits`.
- [ ] **Step 4: Run to verify pass**, full glob.
- [ ] **Step 5: Commit**

```bash
git add renderer/data/contours.js test/contours.test.js renderer/level-editor.js renderer/screens/analysis.js renderer/viewer/canvas.js
git commit -m "feat: the label record carries the model's mask outline per lumbar level"
```

---

### Task 13: Retire the landmark editor's superseded handle code

**Files:**
- Modify: `renderer/viewer/canvas.js` (remove `drawHandles`, `drawTracePoints`, `HANDLE_HOVER_RADIUS_PX`),
  `renderer/viewer/interactions.js` (remove `TAB_ORDER`, `FULL_ORDER`, `nextSelection`, `nudge`, `hitTestFemoral`,
  `sameHandle`), `renderer/viewer/geometry.js` (remove `nearestLandmark`, `landmarkHandles`), `renderer/data/cervical.js`
  (`CERVICAL_HANDLES`), `renderer/data/global-sva.js` (`GLOBAL_SVA_HANDLES`), their tests
- Keep: `landmarkAt`, `setLandmarkAt`, `fitCircle`, `femoralCircle`, `setFemoralCircle`, `removeFemoralCircle`,
  `clientToImage`, `imageToClient`, `vertebraAt`, `arrowKeyDelta`, `debounce`, the zoom helpers, `isChordHeld`.
  `state.selection` stays in the store (every FRESH_VIEW writer and the contract name it); it is always null now.

- [ ] **Step 1: Grep** for every removed name (`grep -rn "TAB_ORDER\|FULL_ORDER\|nextSelection\|nudge(\|hitTestFemoral\|sameHandle\|nearestLandmark\|landmarkHandles\|CERVICAL_HANDLES\|GLOBAL_SVA_HANDLES\|drawHandles\|drawTracePoints" renderer test tools`)
  and confirm the only references are the definitions and their tests.
- [ ] **Step 2: Remove** the code and the tests that pinned it (`test/interactions.test.js` TAB/FULL/nextSelection/nudge/
  hitTestFemoral/sameHandle tests; `test/geometry.test.js` nearestLandmark tests).
- [ ] **Step 3: Run** the full glob → pass; `npm run dev` smoke by eye for one film: edit mode still opens.
- [ ] **Step 4: Commit**

```bash
git add renderer/viewer/canvas.js renderer/viewer/interactions.js renderer/viewer/geometry.js renderer/data/cervical.js renderer/data/global-sva.js test/interactions.test.js test/geometry.test.js
git commit -m "chore: retire the landmark editor's handle cycling, nudge and hit-test code superseded by the level editor"
```

---

### Task 14: The smoke suite and the records

**Files:**
- Create: `tools/smoke/smoke-levels.mjs`, `docs/level-editor.md`
- Modify: `tools/smoke/README.md` (`## Running the level editor suite`, Known baseline), the architecture contract
  (`## 2026-10-10 amendment: vertebral level editor, window / level, label record`), `docs/superpowers/HANDOFF.md`
  (a "Where things stand" section and the decisions D1–D14), `CLAUDE.md` (top paragraph), `docs/ROADMAP.md`,
  `docs/design/level-editor/HANDOFF.md` (§12 becomes "Decisions", pointing at this plan), this plan's Ledger

**The suite** (`tools/smoke/smoke-levels.mjs`), two phases, id range `SP-9300`–`SP-9302` (unused):

- Phase `dom` (default; no backend model run, no real film; UI arithmetic only, per `AGENTS.md`): a synthetic
  600×800 grey PNG drawn on a canvas as `image_png`, an all-zero `mask_png`, `labels` = `{L1: 20, …, L5: 24}`, a
  geometry with L1, L2, L4, L5, S1 and two circles (the prototype's numbers); `api.measure` for measurements;
  `api.savePrediction('SP-9300', …)`; a store entry with `fileName: 'levels-ui-check.png'`, `filePath: '/test/levels-ui-check.png'`.
  Checks (`check(name, ok, detail)` and `until()` as in `smoke-similar.mjs`; every selector by class or `data-level-key`):
  1. Edit button enabled; click → `.lv-panel` present, `.analysis-tabs` hidden, `.analysis-editing` text `EDITING SEGMENTATION`,
     `.viewer-editbar-label` `EDITING SEGMENTATION`, run card hidden.
  2. Summary `7 PLACED · 1 TO PLACE · 8 NOT VISIBLE`; Lumbar count `4 PLACED · 1 TO PLACE`; the Cervical group box
     unchecked, Lumbar checked; `[data-level-key="L3"] .badge` reads `Not placed`.
  3. `Place…` on L3 → label `PLACING L3 · 1 OF 4`, four `.viewer-step` chips; four clicks via `cdp.toClient` at the
     prototype's L3 corners → badge `Manual`, `state.levelEditor.placing === null`, after drafts clear
     `study.geometry.vertebrae.L3` exists and `measurements.LL['L3-S1']` is a finite number.
  4. UNDO mid-placement removes a point; CANCEL returns the badge to `Not placed`.
  5. Uncheck S1 → `.lv-note` under S1 reads `LL, PI, PT, SS, PI–LL, L1PA and L5–S1 will show —`; after drafts clear
     `study.geometry.s1_superior === null` and `measurements.PI === null`.
  6. `Save edits` → toast starts `Saved 2 edits`; `fs.existsSync(<userData>/labels/levels-ui-check.label.json)`
     (userData from `launch.mjs`'s JSON, `SMOKE_USER_DATA` or the default); the file validates with
     `test/fixtures/schema-check.js`; `levels.L3.state === 'manual'`, `levels.S1.state === 'not_visible'`,
     `study === 'levels-ui-check'`; the study record's `labelFile` is set.
  7. Re-check S1, DONE → `.lv-prompt` present; `Keep editing` closes it; `Discard` → toast `Discarded 1 change.`,
     S1 back to not visible, edit mode exited, measurements panel back with PI `—`.
  8. Femoral: Edit, `Place…` on Head 1, two clicks → FIT enabled; FIT → badge `Edited`, `geometry.femoral_circles[0]`
     changed; a rim-point drag (`drag()` from `smoke-femoral-confidence.mjs`) refits (radius changes).
  9. W/L: the toolbar button present; click → `.viewer-wl` shown with `.viewer-wl-note` `The source film could not be found.`
     (the fixture's path does not exist); DONE closes it.
  10. Keyboard: Escape during a placement cancels it and stays in edit mode; Escape with nothing open exits (no prompt
      when nothing is unsaved).
  11. The stash: with one unsaved change, open a second injected study `SP-9301` from the list → `state.levelEditor`
      is null and `hasStashedEditor('SP-9300')` is true; reopen `SP-9300`, Edit → the change is still there; delete
      `SP-9300` from the list → `hasStashedEditor('SP-9300')` is false. `cdp.errors.length === 0` at the end.
  Cleanup in `finally`: remove the study, `deleteLabelRecord`, reset store keys.
- Phase `film` (`SMOKE_PHASE=film`, a real film path in `argv[2]`, the backend running): `newStudy` + `segmentStudy`;
  Edit; W/L → `status === 'ready'`, the chip reads `W … · L …`, a drag changes both numbers, RESET restores the
  defaults, sliders move them; Save edits writes a record whose `image.sha256` is 64 hex characters and whose
  `model.version` is not empty. No screenshots.

**Records:**
- Contract amendment: the new modules in the File structure block; `state.levelEditor` with its typedef and the
  rule that `renderer/level-editor.js` is its only writer; `Study.labelFile`; the `labels/` folder in Persistence
  (written atomically through `main.js`, deleted with the study, quarantined with the rest); `/decode` and
  `qc.model_versions` in the Backend API; the Geometry section's note that T1/T4/visibility/rim points never enter
  `study.geometry`; `LEVEL_RGB` gains T1/T4/S1; the Selection typedef is unchanged but unused in edit mode; the
  removed exports (Task 13) struck through with "superseded 2026-10-10".
- `CLAUDE.md`: a top paragraph in the house style (branch, worktree, what was built, counts, what was not run).
- `docs/level-editor.md`: what the panel does, the states and what they mean for training, the record's location and
  shape, window / level, the keyboard.
- `docs/design/level-editor/HANDOFF.md` §12: each question answered with its decision (D1–D14) and a pointer here.

- [ ] **Step 1: Write the suite** and its README section.
- [ ] **Step 2: Run it** from the worktree: `SPINE_CONTOUR_PYTHON=<main checkout>/.venv/Scripts/python.exe node tools/smoke/launch.mjs`
  (a fresh scratch profile, never the real one), then `node tools/smoke/smoke-levels.mjs`; then with a real film for
  the `film` phase; then `node tools/smoke/cdp.mjs --quit`. Expected: every check PASS; record the count as the Known baseline.
- [ ] **Step 3: Run the existing suites that touch edit mode** on a fresh launch: `smoke-femoral-confidence.mjs`
  (its RETRACE/ADD CIRCLE checks are superseded: update the suite to the level editor's Place… flow or retire the
  affected checks, recording which in the README), `smoke-studies.mjs`, `smoke-persist.mjs`, `smoke-gate1.mjs`.
  **Amended 2026-10-10 (Task 14, from Task 13's report):** the suites that name removed code or the old edit bar, or
  drive the old edit mode, are, in full: `smoke-femoral-confidence.mjs` (ADD/DELETE CIRCLE, RETRACE, FIT),
  `smoke-gate1.mjs`, `smoke-gate2.mjs`, `smoke-gate3.mjs` (RETRACE, Tab cycling, nudges), `smoke-chord.mjs` §2/§7,
  `smoke-disc-heights.mjs`, `smoke-persist.mjs` (`nudgeAndSettle`, a comment naming `nextSelection`),
  `smoke-cervical.mjs` (its centroid nudge), `smoke-global-sva.mjs` (its C7 and S1 nudges), plus, found while running
  them, `smoke-studies.mjs` (the Edit button's label), `smoke-chip.mjs` §6, `smoke-partial-segmentation.mjs`,
  `smoke-accuracy.mjs` and `smoke-segmental.mjs`. Each is rewritten to the level editor's flow where its intent
  survives (select a row with `selectLevelRow`, drag a handle at `levelHandles`, nudge with `setFocusedHandle` and an
  arrow, re-fit a head with Place… and FIT) and the checks whose intent is gone are retired; `tools/smoke/README.md`
  ("The landmark-editor suites after the level editor") names every retired check and its replacement.
- [ ] **Step 4: Write the records** listed above.
- [ ] **Step 5: Commit** (executed as three commits: the suite and its README section; the landmark-editor suites;
  the records).

```bash
git add tools/smoke/smoke-levels.mjs tools/smoke/README.md tools/smoke/smoke-femoral-confidence.mjs docs/level-editor.md docs/superpowers/plans/2026-08-31-00-architecture-contract.md docs/superpowers/HANDOFF.md CLAUDE.md docs/ROADMAP.md docs/design/level-editor/HANDOFF.md docs/superpowers/plans/2026-10-10-level-editor.md
git commit -m "test: smoke-levels covers the panel, placement, save, discard and window / level; docs: the records"
```

---

### Task 15: The human gate (the owner)

Handoff §13's acceptance criteria, on real films from the owner's library, in light and dark themes, with the
stage dark in both. The executor prepares the checklist below in the Ledger and the owner ticks it; nothing is
pushed, no PR is opened and no release is cut until the owner says so.

**Checklist prepared 2026-10-10 (Task 14); the owner ticks it.** Not yet run. Two things to look at on the way, from
the Ledger: whether `.viewer-wl` (top 116 px) overlaps an edit bar that wraps to two rows, and whether a level's label
plate fixed to the right of the posterior corner runs off a film whose anterior is on the right. Launch from the
worktree with a scratch `SPINE_CONTOUR_USER_DATA` or on the owner's library, at the owner's choice.

- [ ] The panel appears only in edit mode, replaces Measurements, and Measurements return on exit.
- [ ] All five groups show with tri-state group checkboxes and expand / collapse; film-type defaults per D5/D6.
- [ ] Every level shows the right badge; the summary and group counts update live.
- [ ] A missed level can be placed with the right number of clicks (4 / 3 for C2 / 2 / 1); UNDO and CANCEL work.
- [ ] Segmented vertebral levels have no Place, Reset or re-run action; handles and the checkbox still work.
- [ ] Femoral heads: Place… always available while visible; 2–4 rim points fit; FIT from 2; a rim drag refits.
- [ ] An edited level shows the model's original geometry dashed when selected.
- [ ] Unchecking a level makes its dependent measurements read `—` and shows the note.
- [ ] Window / level by sliders and by drag; RESET returns to the file default; only the film changes; placement is
  paused while open; a DICOM film's default window comes from its tags.
- [ ] Save edits writes `labels/<stem>.label.json` that validates; the SP id appears nowhere in it; demo studies never write one.
- [ ] Unsaved count, Discard and the training-label status behave as in handoff §6 and D10.
- [ ] Escape, Tab and arrows as in handoff §10 and Task 10; focus rings visible; both themes.
- [ ] At the default ~1166×837 window the taller edit bar (its help line) covers the top of the film; the owner
  checks whether the bar should collapse or the film should sit lower (ruling R19, from Task 14's smoke runs).
- [ ] A film whose segmentation failed entirely opens in edit mode on its original film and every level can be placed.

---

## Ledger

Filled in during execution, one line per ruling or result, newest last: unit totals per task, smoke counts, the
real-film outcomes, the human gate verdict, and every decision the executor or the user makes that this plan did not
already state.

| Date | Task | Entry |
|---|---|---|
| 2026-10-10 | — | Worktree `level-editor` on `worktree-level-editor` off `origin/main` @ `20fd4c5` (v1.0.17); handoff package committed as `594a982`; unit baseline 615/615; `node_modules` junctioned to the main checkout; `.claude/worktrees/` added to the shared `info/exclude`. Decisions D1–D14 recorded above. |
| 2026-10-10 | — | Plan committed `3a4019a`. Executed by subagent-driven development, a fresh implementer and a task review per task (implementers sonnet for Tasks 1–7, 9, 12, 13 and opus for 8, 10, 11, 14; reviewers likewise). The SDD ledger (`.superpowers/sdd/2026-10-10-level-editor/progress.md`, local, untracked) holds the agent log; this table holds what a reader needs. |
| 2026-10-10 | — | **Pre-flight rulings.** R1: Task 13 removes exports the architecture contract still names (`TAB_ORDER`, `FULL_ORDER`, `nextSelection`, `nudge`, `hitTestFemoral`, `sameHandle`, `nearestLandmark`, `landmarkHandles`, `CERVICAL_HANDLES`, `GLOBAL_SVA_HANDLES`); intentional, Task 14's contract amendment strikes them as superseded. *Cost if wrong:* the amendment reworded. R2: `renderer/data/levels.js` imports `fitCircle` from `renderer/viewer/geometry.js` (data → viewer), sanctioned because geometry.js is pure and the contract forbids reimplementing `fitCircle`. *Cost if wrong:* a one-line import move. R3: Tasks 10 and 11 carry no unit tests (DOM wiring, CLAUDE.md's convention); their verification is their manual steps and this plan's smoke suite. *Cost if wrong:* defects surface at the smoke suite or the gate. |
| 2026-10-10 | 1 | `77c8e5a`, unit 702/702; review clean. R4: `groupCountText` omits a zero PLACED clause (the prototype's group rule) while `summaryText` always writes PLACED; the brief's two sentences could not both hold, the prototype won. *Cost if wrong:* one string rule in one function. R5: `fitFrom` equals `need` for non-circle kinds; `geometryFromPoints(code, points, imageSize)` takes an optional third argument for the femoral radius cap; `DISC_LEVEL_PAIRS` is pinned equal to `SEGMENTAL_PAIRS.lumbar` by a test instead of imported. *Cost if wrong:* trivial signature churn. Deferred minors: `toggleVisible`/`toggleGroup` leave `editor.handle` on a level they hide (handled downstream: Task 3's order filters visible levels, Task 10 drops a stale handle); literal non-ASCII in JSDoc comments; `revertToBaseline`'s handle nulling untested; a misleading test message (`test/levels.test.js:853`); `LEVEL_CODES`/`LEVEL_GROUPS`/`MEASUREMENT_INPUTS` exported unfrozen; `sameGeometry` treats an undefined key and a null key as different (so `recordLevels` must emit exactly `levelsFromGeometry`'s shapes, which it does). |
| 2026-10-10 | 2 | `fb07447`, then fix round 1 `725e114`; unit 733/733; re-review clean. R6: the projection computes `l1_center` (the mean of L1's corners) and `hip_midpoint` (the mean of the two centres) instead of nulls, because the persistence validator rejects a null `l1_center` with L1 present and a null `hip_midpoint` with two circles; `/measure` overwrites both. *Cost if wrong:* two derived fields the backend recomputes anyway. R7: a cervical or full-spine projection with no orientation source keeps `anterior_side: null`, never invented; Task 10 does not commit it until an orientation exists. *Cost if wrong:* a 422 toast from `/measure`. R8 (reverses the brief's precedence; the review's I1): the film's stored `anterior_side`, then `study.anteriorSide`, then derivation from placed levels, then null; the user's explicit Orientation choice and the model's detection are authoritative, and an annotator dragging SA past SP must not flip a film's sign conventions silently (Task 2's text is amended above). *Cost if wrong:* a failed Auto film with no stored side still derives (the main case), so only cervical/full-spine films with a stored side differ. Notes carried to Task 10: heads whose fitted radius is 0 or non-finite are left out of `femoral_circles`; a stale `manually_cleared` is dropped unless the lumbar projection is empty. Deferred minors: M1 a radius-0 head from two identical rim clicks is dropped by the projection with no panel explanation (fix at the source: `addPoint`'s near-duplicate rule for circles, or a `fitRim` floor); M3 `c7_centroid` computed for cervical too; M4 unused destructured bindings; M5 coverage (study null, hidden C3–C7 omission, C2 tie); M6 an exotic `anterior_side` string blocks the fallback. |
| 2026-10-10 | 3 | `15f289a`, unit 778/778; review clean. Deferred minors: a rim longer than 4 points keeps its length through `moveHandle` (latent; the typedef says 2–4); an unreachable `?? geometry` (`level-handles.js:89`); `moveHandle` does not validate the point (callers clamp: Task 10 clamps nudges and drags to the image); a double lookup in `nudgeHandle`; thin coverage for `nudgeHandle` on C2/endplate/centroid. |
| 2026-10-10 | 4 | `c5d8771`, unit 778/778; review clean. Deferred: the store comment pointed at a `LevelEditor` typedef `levels.js` did not carry yet (added in Task 5); exit paths that clear `editing`/`selection` without FRESH_VIEW (Back, `changeRegion`, the viewer's exits) must also null `levelEditor` (done in Task 10). |
| 2026-10-10 | 5 | `7d8663d`, then fix round 1 `25f4c69`; unit 807 → 809; re-review clean. R9 (amended in the fix round): with a saved record, `openEditor` assigns the study's circles to FH1/FH2 by matching the record's head geometry (centre and radius); a matched head takes the SAVED geometry, rim included; unmatched circles fill FH1 then FH2, preferring heads the record does not mark not visible; without a record slot 0 is FH1. *Cost if wrong:* head attribution after a reopen differs in rare mixed cases; Discard clears it. R10: the record's `contour` is written only for `segmented` levels (null for edited and manual), matching the example and handoff §9; Task 12 supplies contours for segmented levels only. *Cost if wrong:* an edited level's record lacks the model outline (its `model_corners` still carry the model's quad). Deferred minors: two tests pin the literal `'1.0.17'` (derive from `VERSION_LABEL`); a missing `fileName` yields `study: ''` and an invalid record (the save refuses such a study since Task 10); the writer accepts any rim array while `recordLevels` accepts 2–4; `HEADS` and `copyPoint` duplicated across `levels.js`, `level-projection.js`, `label-record.js`; handoff §2 and §9 said C2 has four corners (amended by Task 14); two unmatched study circles with Head 1 hidden in the record land in reversed slot order (needs an inconsistent record). |
| 2026-10-10 | 6 | `2aebe22`, unit 816/816; review clean. R11: a non-ENOENT failure to rename `labels/` during quarantine takes the existing `persistenceUnsafe` path (nothing written for the session), as a `predictions/` failure does; the disabled-persistence tests live in `test/api-persistence.test.js`; `save-label-record` relies on `writeJsonAtomic`'s mkdir. *Cost if wrong:* a stuck labels folder disables saving for the session where a notice would have done. R12 (carried into Task 10): `labelFileName` sanitises the stem before naming the file — `\ / : * ? " < > \|` and control characters become `_`, leading dots go, the stem is capped at 180 characters, a Windows device name (CON, PRN, AUX, NUL, COM1–9, LPT1–9, any case) takes a `_`; the main-process regex stays as is. *Cost if wrong:* a save on such a film fails with the display-ready `Invalid label file name.` instead of succeeding. Deferred minors: no committed unit test of `LABEL_FILE`/`labelPath`/the quarantine loop (Task 14's smoke drives `saveLabelRecord('..', {})` through the real bridge); a save racing a delete leaves an orphan record (Task 10 drops the editor on delete and deletes a record written after its study went); the delete toast names the sidecar when the label delete failed; the quarantine notice names `labels.corrupt` even for libraries that never had one; `newStudy` does not list `labelFile: null`; the guard style differs between `deleteStudy` and the batch. |
| 2026-10-10 | 7 | `868e99e`; backend focused 24/24, whole 757 passed / 3 skipped / 5 failed (all five need the ONNX graphs, absent from the worktree then); renderer 816/816; review clean. Backend tests run with `C:\Users\codyj\sc-export\Scripts\python.exe` (the main venv has no pytest). Deferred minors: the decode logic is adapted from `server._decode_grayscale`, not shared (a MONOCHROME1 parity test would guard drift); three float64 temporaries at the 25 MP cap; fractional ranges collapse to integer levels (plan-mandated rounding); `NumberOfFrames` not pre-checked; importing `calibration` for `MAX_PIXELS` pulls cv2/pytesseract; test gaps (25 MP match, scaled midpoint, span exactly 65535, DICOM through the route, the real full-spine models dict); full-spine `detector` composites map to None. |
| 2026-10-10 | 8 | `6c3ee93`, then fix round 1 `daa8380`; unit 843 → 845; re-review clean. Ratified from the implementer: R-a a study with a result but a missing sidecar gets a reason, never the original film under its geometry; R-c the extra pure export `rawFromDecoded`; R-d `cacheImages` does not dispose bitmaps shared with the new entry. R13: the 8-bit window rule is `valueMin >= 0 && valueMax <= 255 && (bitsStored === 8 \|\| exactly 0..255)`, so an 8-bit DICOM with a rescale takes the general range. *Cost if wrong:* an odd default window on rare 8-bit DICOMs. R14: `ensureFilm` returns `superseded: true` as its own flag; `reason` stays display-ready (null when superseded). *Cost if wrong:* none visible; one field. The fix round's I1: a batch run of the open study off screen drops its stale cached film. Deferred minors: an `ensureFilm` started before an off-screen batch run lands on a film with no prior result can attach a preview to a study that now has a result; `imagesFromRaw` uses the shared scratch buffer (up to 100 MB alive for a decoded film even without W/L); an attach during navigation evicts the mounted study's cache entry without closing bitmaps; a failed restore from `ensureFilm` toasts and returns the same reason (Task 10 does not toast it again) and re-runs the restore on every call; `filmLoad` holds one promise; `analysis.js` grew ~100 lines; coverage gaps (run-count and cache-identity guards, the R-a branch, the crop/width wiring through `ensureFilm`, R-d). |
| 2026-10-10 | 9 | `eff7f6b`, unit 873/873; review clean. R15 (ratifying the implementer): `buildLabelColorMap` iterates a private `MASK_LEVELS` list (the original eleven keys), so S1's new `LEVEL_RGB` entry never colours a mask label. *Cost if wrong:* none; a later level mask would need the list extended. Deferred minors: labels are drawn interleaved with fills (a later disc can cover an earlier plate; a label pass after all levels would fix it); a selected C2/T4 centroid dot is filled with overlays off (covered by its handle); the label plate sits 14 px right of the posterior corner where the prototype offsets it 6 px left of the text; the label side is fixed to the right and not clamped to the canvas (anterior-right films; look at the gate); a NaN `overlayOpacity` paints a stale fillStyle; duplicated dot code; coverage gaps (C2/T1/T4 handle drawing, the C2 ghost, nothing selected with overlays off); `canvas.js` now 859 lines. |
| 2026-10-10 | 10 | `ffbac68` (R12's `labelFileName` sanitising) and `1ca16a9` (the stage wiring), unit 874; fix round 1 `9b099e9` (unit 876; re-walk 14/14), fix round 2 `0aef002` (unit 880); app walk 110/110 on a scratch profile with synthetic films (no model run: no graphs then); re-review clean over both rounds. All sixteen implementer rulings accepted (a `resetLevelsToModel` export; `WindowState.range`; Escape dismisses the prompt first; a chord takes back a placement point; `is-windowing` follows W/L open; overlays and opacity in the dynamic key while editing; the "Femoral head N selected" help; the Tab exemption includes `.analysis-level-host`; handles, Tab and arrows pause while placing or with W/L open; a busy guard on level actions; the save details; the completion write nulls `levelEditor` and calls `forgetLevelEditor`; `render()` calls `ensureFilm` on remount; R12 details; CSS and copy; `imageInfo` hashes the default-windowed decode for a film with no result). R16 (as amended in round 2): a study is hand-placed when `predictionId == null && !qc?.models` (one predicate, `isHandPlaced(study)` in `data/predictions.js`); `needsRestore` requires it false, `ensureFilm` decodes the original for a hand-placed film and `restoreFilm` never runs for it; R-a stands for studies with a prediction id or `qc.models` but no sidecar, a pre-v1.0.10 result included. *Cost if wrong:* a legacy film with no qc at all would open on its original. R17: Re-run is disabled while editing (title `Finish editing before re-running segmentation`, the region bar's Run segmentation too); a batch reaching a film with an open or stashed editor still drops that editor on completion. *Cost if wrong:* a rare lost label edit when a batch overtakes an unsegmented film being edited. Notes for the final review: a hand-placed film whose source moved opens to a black stage outside edit mode with no card (the toast appears on Edit); a batch started from the Find tab can still overtake an open or stashed editor (R17 is scoped to the stage); a very old record with a sidecar but neither prediction id nor `qc.models` would read as hand-placed. Deferred minors: `placePointer` set after a refused click or a host press (a chord then undoes a legitimate point); placing T1 can supply an orientation without a commit; a FRESH_VIEW mid-save drops post-snapshot edits from the stash; `imageInfo` decodes the original for a segmented film just to hash the stored image; surround clicks at zoom < 1 miss beyond the film (listen on `.viewer-stage`); the wiring module's header names only FRESH_VIEW as the other null-writer; `.viewer-wl` at top 116 may overlap a wrapped edit bar (check at the gate). |
| 2026-10-10 | 11 | `38dcccf` (unit 880, app walk 122/122), then fix round 1 `276c437` (unit 880); re-review clean. Implementer choices accepted: a per-field rebuild key; CLEAR hidden while its level is being placed; focus fallbacks; scroll kept; the prompt as a labelled group; extra classes and `data-level-key`s. R18: a row with two actions stacks them in a column (Place… above CLEAR) inside the 70px width (`.lv-actions.is-stacked`); both stay, CLEAR being the only way back to Not placed. *Cost if wrong:* one taller row for hand-placed heads. Fixed in the round: I1 the exit prompt could read 0 unsaved changes with a dead Save (the prompt now goes once nothing is unsaved, and its Save follows `canSave`); the selected row's `--well` ground moved to `.lv-row.is-selected` (handoff §3). Deferred minors: `unsavedPrompt(n)` copy lives in the DOM module untested (belongs beside `unsavedText` in `levels.js`); `DEMO_NOTE` defined twice; redundant CSS (an is-editing tab/actions rule beside the is-hidden toggles; `.level-check` 20px repeats the base; the studies.css indeterminate rule now covered by the generic one); `study.geometry`/`measurementDrafts` in the rebuild key (two rebuilds per `/measure` round trip); the demo note sits before Discard rather than beside Save; `.lv-text-btn` hover ground equals the selected row's ground (no hover feedback for CLEAR/CANCEL on a selected row); a prompt-initiated save whose later edits return to zero forgets the pending exit. |
| 2026-10-10 | 12 | `2051715`, unit 905/905; review clean (an independent 20,000-mask fuzz, 0 failures). Deferred minors: `simplify` returns the input array for < 4 points despite its comment; an O(n²) farthest-pair split (34 ms at 6k vertices; an O(n) two-pass alternative exists); a weak staircase assertion; the tolerance default repeated at the call site; the commit message says "lumbar" though body levels include C3–C7. |
| 2026-10-10 | 13 | `ccee104`, unit 905 → 879 (the 26 tests of the removed code: interactions 25, geometry 1); review clean. Also removed `drawHandle`, `HANDLE_RADIUS_PX`, `HANDLE_LABEL_PX` (no callers); kept `HANDLE_RING_RADIUS_PX`, `CORNER_COLORS`, `TRACE_COLOR`. Cervical, global-sva and partial-segmentation unit tests adapted (nudge → `setLandmarkAt`); the global-sva overlay assertion went from 3 arcs to 0 (handles come only from the editor now). Deferred minors: `canvas.js`'s non-editor femoral selected-stroke branch and `viewer.js`'s `selection` in the dynamic key are dead (`state.selection` is always null); stale comments ("retrace point colour" `canvas.js:194`, "retrace fit" `measure-queue.js:88`, `viewer.js:1147-1149`); test titles at `partial-segmentation.test.js:135` and `canvas.test.js:149` no longer match what they cover. |
| 2026-10-10 | 14 | `3b5ab3b` (`tools/smoke/smoke-levels.mjs` and its README section), `c37c112` (the landmark-editor suites follow the level editor), and the records commit (contract amendment, CLAUDE.md, HANDOFF, ROADMAP, `docs/level-editor.md`, handoff §2/§9/§12, this Ledger). Unit 879/879. Backend `pytest backend -q` (the sc-export venv, the main checkout's graphs hard-linked into the worktree's `backend/onnx/`): 762 passed, 3 skipped. Smoke, each on a fresh scratch profile under `%TEMP%` (Windows 11, CPU processor): `smoke-levels.mjs` dom **75/75**, film **23/23** (one copied OLIF lumbar film, DOM/store/file reads only, no screenshots; L1, L2, L4, L5 segmented with contours of 9–15 points, L3 edited, contour null); the gate chain in the README's plan-04 order on one launch: parity 15/15, gate1 25/25, gate2 26/26, gate3 26/26, chip 20/20, chord 28/28; studies 151/151; persist 42/42 then 55/55; femoral-confidence 16/16 then 5/5; disc-heights 13/13, partial-segmentation 8/8, accuracy 17/17 (one launch); global-sva 21/21 (its own app). Not run: `smoke-cervical.mjs`, `smoke-segmental.mjs` (no lateral cervical film on this workstation, and both screenshot their film). The brief's directory junction for `backend/onnx` was done as file hard links: the folder holds four tracked files (`crop_detector`, `view_classifier`) a junction would have hidden; gitignored, never committed. Rewrites and retired checks are listed per suite in `tools/smoke/README.md`. Suite findings: the taller edit bar covers the sample film's upper landmarks in a small window (gate1/2/3, chord and accuracy now set a 1600x1100 viewport); R16 broke every synthetic fixture with neither a prediction id nor `qc.models` (disc-heights, partial-segmentation, accuracy now carry one); `smoke-disc-heights.mjs`'s paired-CSV check had been stale since 2026-09-11 (fixed through `pairStudies`); `smoke-global-sva.mjs` hard-coded macOS paths (now overridable) and failed its compact-window check by 0.00003 px on a scaled display (now half a pixel's tolerance). |
| 2026-10-10 | 14 | Review: needs fixes (documentation only), fix round 1. I1: gate2's retired `clicking the left centre selects it` is now named (README, suite header). I2: `docs/level-editor.md` gives the synthesised rim points as −45°, 45°, 135° and 225°. R19 (controller): the records must be accurate, so in the same round Task 15's checklist gains the edit-bar item (at the default ~1166×837 window the taller edit bar covers the top of the film), the handoff's `levels.*.contour` row follows R10, "Location to confirm." is struck now that D3 decides it, and ROADMAP §8 says the near-duplicate click rule covers body, C2 and endplate placements. *Cost if wrong:* none; wording. No suite re-run; unit 879/879. |
| 2026-10-10 | 15 | Checklist prepared above (Task 15); the human gate is the owner's and has not run. Nothing pushed, no PR, no release: the release commit (1.0.18 or later) is separate work. |
