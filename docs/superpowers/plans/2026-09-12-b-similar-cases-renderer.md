# Similar Cases and Outcomes — Plan B, the Renderer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The `Find similar` tab ranks the library's studies by a fused distance over landmark shape, the hip, the five sagittal angles and two appearance embeddings, shows five cards with each neighbour's recorded fusion-extension outcome, and opens any of them side by side; the embeddings are stored one file per study and filled for an older library by an `Embed` batch; fusion extension, its date and the last follow-up are three known clinical fields; unknown spreadsheet columns can be kept by name; `Export dataset` writes the per-film and per-pair tables, every vector and a manifest into a folder.

**Architecture:** Four pure modules carry the logic and the tests — `data/similarity.js` (vectors, blocks, the fused distance, candidates, ranking), `data/outcomes.js` (the outcome registry, values, resolution, card and footer copy), `data/embeddings.js` (the stored record's shape), `data/dataset.js` (the export's four files) — plus `data/batch.js` and `data/csv.js` extended. One new root module, `renderer/embeddings.js`, owns the loaded map and its IPC, beside `renderer/batch.js`. One new component, `components/similar.js`, is the tab; comparison mode is plan 07's Tasks 3–6 adapted: a `role` on `mountViewer`, `{other}` and `Δ` columns on the measurements panel, two rows in the drawer, a badge in the header. `main.js` gains four IPC handlers and the quarantine triple.

**Tech Stack:** Vanilla ES modules, no bundler, no runtime dependencies. `node --test` for pure logic. The CDP smoke harness in `tools/smoke/` for DOM behaviour. Electron 44 / Chromium 152. Node 24.

**Spec:** `docs/superpowers/specs/2026-09-12-similar-cases-outcomes-design.md` ("the spec" below; every "§" without a prefix refers to it). Read §5–§9 and §11–§13 before starting; §16 is the amendments Task 12 writes; §15 the testing this plan implements. The redesign spec is `docs/superpowers/specs/2026-08-31-spine-contour-ui-redesign-design.md` ("spec §"), the pre-op/post-op spec `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` ("pp §"), the batch spec `docs/superpowers/specs/2026-09-08-batch-segmentation-design.md` ("batch §"), plan 07 `docs/superpowers/plans/2026-08-31-07-similar-comparison.md` (Tasks 3–6 are adapted by Task 8 here). The binding architecture contract `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` wins over this plan; Task 12 amends it. **Plan A** (`2026-09-12-a-embeddings-backend.md`) supplies the `embedding` key on `/predict`, the `embeddings` form field, `POST /embed` and `GET /embedding-model`; Tasks 1–6 and 9 here need none of them at runtime and can run before Plan A lands, Tasks 7, 10 and 11 need Plan A merged into the working tree.

## Global Constraints

Copied from `CLAUDE.md` and the spec. Every task's requirements include these.

- **Never display a fabricated measurement or a fabricated status.** Absent values render `—` (U+2014). A card's angle line shows `—` per absent angle; the outcome line says `Outcome not recorded`, never a guess; the footer counts what is recorded and never reads as a rate or a risk (§8.3).
- **Never rank across models.** Two embeddings enter a distance only when their `model.onnx_sha256` match (§11); the whole-film block only between two whole-spine films (§7.4).
- **Identity is the study name (v1.0.8).** `studyName(study)` — the stored name, else the film's stem — is what every export writes under `Study ID` and what the dataset's three files key on; the `SP-nnnn` record id appears in no file a person reads. It still keys the store, the sidecars and `embeddings/<id>.json`, and `pairStudies` now returns visits (spec §5).
- **Never mutate store state in place.** Every `setState` patch passes a NEW object or array; `similarScope`, `similarRank`, `batch` are replaced wholesale. `setState` must not be called from inside a subscriber: the tab, the Analysis screen's `update()` and the Studies screen's `update()` run inside store notifications; only DOM event handlers, microtasks queued from them, and async functions call `setState` — which is why `renderer/embeddings.js`'s `ensureEmbeddings()` is async and its `bump()` runs after an `await`.
- **The Studies screen's `update()` key array must list every store key and module-scope value the Find tab reads** — this plan adds `embeddingsVersion` to it (Task 7). The Analysis screen's tab subscribes to the store itself and reads `embeddingsVersion` (Task 6). `router.js`'s `SIDEBAR_KEYS` already carries `performance` (Task 1 changes nothing there).
- **Every optional record field must be listed in `validateStudy`'s returned object.** This plan adds none: outcomes are clinical values, embeddings live in their own files, shape is derived. No `STORE_VERSION` bump.
- **`el()` assigns to the property when the key exists on the node.** Pass real booleans (`disabled: false`, `hidden: true`, `spellcheck: false`), never `'false'`. Never pass `style`, `list`, `dataset` or `form` as an `el()` prop.
- **Never change the form of a non-ASCII character on a line you touch, and write any NEW non-ASCII character in JS source as a `\uXXXX` escape** (HANDOFF known trap): `\u00B7` for `·`, `\u2014` for `—`, `\u2212` for `−`, `\u2026` for `…`. Byte-check the diff before every commit that touches such a line — `git diff -U0 -- <files> | grep -nP '^[+-].*[^\x00-\x7F]'` must show every `+` line that carries a glyph paired with a `-` twin carrying the same glyph, and no other `+` line — and repair with a small Python script written to a file, never with `sed` or a `bash -c` one-liner. Markdown files are exempt.
- **No bundler, no framework, no runtime dependencies.** `dependencies` stays empty; `devDependencies` stays exactly `electron` and `electron-builder`. **Do not loosen the CSP.** No allowlist change: both electron-builder allowlists ship `renderer/**/*` and `styles/**/*` by glob; `main.js`, `preload.js`, `store-io.js` and `backend-client.cjs` are already listed, and this plan adds no root file.
- **`renderer/data/*` never imports from `renderer/screens/`, `renderer/components/`, `renderer/api.js` or the root-level `renderer/*.js`.** `data/outcomes.js` imports only `data/timepoints.js`; `data/csv.js` imports `data/outcomes.js` (no cycle: `outcomes.js` does not import `csv.js`); `data/similarity.js` imports `data/parameters.js`; `data/dataset.js` imports `data/csv.js`, `data/pairing.js`, `data/outcomes.js`, `data/similarity.js`, `data/embeddings.js`, `data/labels.js`, `data/version.js`.
- **Unit tests run as `node --test test/*.test.js`** (the glob form; the directory form fails on Node 24). Record the baseline count on the v1.0.8 base before Task 1 in the ledger (fork PR #21 reports 542).
- **Pure-logic modules get real `node --test` coverage. DOM code gets explicit manual verification and smoke checks.** Never write a fake test.
- **Smoke selectors key on `data-find-key`, `data-param-key`, `data-similar-key`, `data-study-id` and `data-focus-key`, never on a visible label.** A smoke suite that prints nothing has thrown — re-run it bare and read the stack. Run every suite in the FOREGROUND and capture its output to a file under `tools/smoke/out/` (`> tools/smoke/out/<name>.txt 2>&1`); never background one and wait for it. Never re-run a suite on an instance where one was killed mid-run; relaunch. `smoke-studies.mjs` runs on a FRESH launch.
- **Conventional commit prefixes** (`feat:`, `fix:`, `test:`, `docs:`, `chore:`); commit after every task; every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Write a multi-line message to a file under `tools/smoke/out/` and `git commit -F` it.
- **Branch:** `claude/image-similarity-visualization-400922` in the worktree `C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d`, on `fork/main` at v1.0.8 (the merge of fork PR #21, 2026-09-13; `git merge-base HEAD fork/main` prints the commit; PR #21 rewrote `data/pairing.js`, `data/csv.js`, `data/labels.js` and the studies, workspace and parameters screens, and this plan's anchors and Task 9 were amended to it on 2026-09-13). Push only to `fork`, never `origin`; never merge to `main`; never rename onto `ui-redesign-cw`; push only after the last amend of the gated commit.
- **Running the app from source** (three lines, from PowerShell; the shell starts in `C:\Users\codyj`):

  ```
  Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d"
  $env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"
  npm.cmd run dev
  ```

  The backend needs `backend/requirements-export.txt` installed in the venv and `python tools/export_onnx.py` run once (five graphs after Plan A; `backend/onnx/` is gitignored — copy it from a sibling worktree or export); if `/health` never comes up, that is the first thing to check. Smoke harness on a scratch profile, from the Bash tool with the variable set in the same command: `SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/<task>-launch.txt 2>&1` (refuses with exit 3 if port 9222 is held), the suite, then `node tools/smoke/cdp.mjs --quit`. An app instance left open from an earlier day runs old code; never kill it unasked.
- **Subagent models (user instruction, 2026-09-10): the lowest model that completes the task reliably.** Sonnet for Tasks 1, 2, 4, 5, 7, 9, 10 and 12 and their reviews; Opus for Task 3 (the geometry and the fusion), Task 6 (the tab's subscription and focus behaviour), Task 8 (comparison mode across four components) and their reviews; the orchestrator runs the human gate (Task 11) itself. Never Fable. Every dispatch that runs a smoke suite says "foreground, capture to a file". Set the model explicitly on every dispatch.

## File structure

| File | Responsibility | Status |
|---|---|---|
| `renderer/data/processing.js`, `backend-client.cjs`, `main.js` (`appendPerformance`), `renderer/components/sidebar.js` | the `Appearance embeddings` switch, persisted and sent with every run | modify |
| `renderer/data/embeddings.js` | pure: `EMBEDDING_VERSION`, `validEmbedding`, `embeddingRecord`, `isCurrent` | create |
| `renderer/embeddings.js` | the loaded map and its IPC: `ensureEmbeddings`, `embeddingFor`, `embeddingsMap`, `bundledModelSha`, `storeEmbedding`, `forgetEmbedding`, `needsEmbedding` | create |
| `main.js`, `preload.js`, `renderer/api.js` | `save-embedding`, `load-embeddings`, `embedding-model`, `embed`, `save-dataset`; `delete-prediction` removes two files; the quarantine moves three | modify |
| `renderer/store.js` | `embeddingsVersion`, `similarScope`, `similarRank` | modify |
| `renderer/data/similarity.js` | pure: `LANDMARK_ORDER`, `ALIGNMENT_ORDER`, `ALIGNMENT_WEIGHTS`, `MODES`, `vector`, `alignment`, `blocks`, the four distances, `pairDistances`, `medianScale`, `fuse`, `matchScore`, `candidates`, `findSimilar`, `openReason`, `angleLine`, `subjectFilms` | create |
| `renderer/data/outcomes.js` | pure: `OUTCOMES`, `FOLLOW_UP_FIELD`, `OUTCOME_FIELDS`, `primaryOutcome`, `isOutcomeField`, `isOutcomeDateField`, `normaliseOutcomeValue`, `recognisedOutcome`, `recognisedDate`, `resolveOutcomes`, `outcomeLine`, `footerLine` | create |
| `renderer/data/csv.js` | `KNOWN_FIELDS` grows by the registry; `autoMap` longest-first; `joinClinical` normalises outcome values; `keepColumnName`, `keepUnmapped`, `unmappedKeepable` | modify |
| `renderer/components/clinical-data.js`, `styles/screens/analysis.css` | outcome cells: a select for a Yes/No field, a validated date cell | modify |
| `renderer/screens/workspace.js`, `styles/screens/workspace.css` | `Keep column name` in the chip select; the `Keep N unmapped columns` button and `Set all…` | modify |
| `renderer/components/similar.js`, `styles/screens/analysis.css`, `renderer/screens/analysis.js` | the Find similar tab | create / modify |
| `renderer/data/batch.js`, `renderer/batch.js`, `renderer/screens/analysis.js` (`embedStudy`, the run completion), `renderer/screens/studies.js` | the `Embed` batch kind and button; `forgetEmbedding` on delete | modify |
| `renderer/components/viewer.js`, `renderer/components/measurements.js`, `renderer/components/clinical-data.js`, `renderer/screens/analysis.js`, `styles/screens/analysis.css` | comparison mode (plan 07 Tasks 3–6 adapted) | modify |
| `renderer/data/dataset.js`, `renderer/screens/parameters.js`, `styles/screens/studies.css` | `Export dataset` | create / modify |
| `test/processing.test.js`, `test/store.test.js`, `test/api-persistence.test.js`, `test/batch.test.js`, `test/csv.test.js`, `test/workspace.test.js`, `test/measurements.test.js` | extended | modify |
| `test/embeddings.test.js`, `test/similarity.test.js`, `test/outcomes.test.js`, `test/dataset.test.js` | the new pure suites | create |
| `tools/smoke/smoke-similar.mjs`, `tools/smoke/README.md` | the smoke suite and its baseline | create / modify |
| the contract, the spec, `docs/superpowers/HANDOFF.md`, `docs/ROADMAP.md`, `CLAUDE.md`, this plan's ledger | records | modify |

## Rulings made while planning (2026-09-12)

Settled with the user at the brainstorm (the spec's §6) or made by the planner against the code and recorded here so the executor does not re-decide them. Each carries what it costs if wrong.

- **Ruling (user): five blocks, four modes, five cards, scope defaults to All, the same subject excluded, fusion extension as the registered outcome, no images or file names in the export, a bulk Keep all unmapped, an Appearance embeddings switch defaulting on.** Spec §6. — Cost if wrong: recorded there.
- **Ruling: the shape block reads the corners as `superior[0]`, `superior[1]`, `inferior[0]`, `inferior[1]` = SA, SP, IA, IP** — the contract fixes anterior-first for `s1_superior` and `backend/landmarks.py` names the corners so; a body carrying `anterior_confirmed: false` makes the study ineligible (its anterior is a guess, and the mirror step needs it). — Cost if wrong: one index table in `similarity.js` with a test.
- **Ruling: `renderer/embeddings.js` is a ROOT module, not `data/`**, because it imports `api.js` and the store, exactly as `renderer/processing.js` and `renderer/batch.js` do; the pure record shape lives in `data/embeddings.js`. The Find similar component imports the root module the way `components/sidebar.js` imports `processing.js`. — Cost if wrong: an import path.
- **Ruling: the stored map is loaded once, lazily, by the first caller of `ensureEmbeddings()`** — the tab, the Find tab's `Embed` count, `Export dataset` — never at bootstrap (§11). Its `bump()` runs after an `await`, so it never fires inside a subscriber. — Cost if wrong: a bootstrap load is one line in `renderer/main.js`.
- **Ruling: `GET /embedding-model` (Plan A Task 5) tells the renderer which graph is bundled**; the renderer fetches it once with the map, and `isCurrent(record, sha)` treats an unknown bundled model (backend not ready, 503) as "keep what is stored". — Cost if wrong: the count on the Embed button.
- **Ruling: `embedStudy` sets `state.running` like a segmentation**, so every surface that already reads `running` (the viewer's card, the list badge, the Settings block's `busy`) stays correct without new wiring; its `runStage.message` is `Computing appearance embedding`, which the viewer's card already shows as its title. Cancel is not wired for it (the run is about a second; `cancel-predict` finds no request and does nothing). — Cost if wrong: a cancel path is the same three lines the segmentation's has.
- **Ruling: the `Embed` button follows `planBatch`'s shape as `planEmbed`**, over the visible (or ticked visible) rows, and the batch driver takes a `kind`: `newBatch(ids, kind)`, `startBatch(ids, kind)`, one `embed` dependency beside `segment`, one `embedNeeded` predicate, `progressText`, `sidebarText` and `batchMessage` reading `batch.kind`. Every existing call (`newBatch(ids)`, `startBatch(ids)`) keeps its meaning through the default `'segment'`. — Cost if wrong: one string per surface.
- **Ruling: `mountViewer(container, { role = 'primary' })`** — the compare pane is the same component with `currentStudy()` reading `state.compareId`, no edit, re-run or run card, no keyboard shortcuts, its own zoom and pan state kept in the mount (not the store's `zoom`/`panX`/`panY`, which belong to the primary), and the chip showing the id and the match. `analysis.js` mounts it into a second host when `compareId` is set and restores its film from its own sidecar. Plan 07 assumed a `mountPane` that does not exist; the role is the adaptation HANDOFF's "Resume plan 07 here" allows. — Cost if wrong: Task 8 is the one Opus DOM task and carries the risk; the gate checks it.
- **Ruling: the measurements panel's second column is `updateMeasurements(study, other)`** — `other` null today, the compare study in comparison mode; `deltaRow` in `data/measurements.js` (already exported, plan 07's preparation) computes `Δ` with 5° for angles and 2 mm for disc heights. — Cost if wrong: one function signature.
- **Ruling: the tab's controls reuse `.model-choice` / `.model-choice-btn`** from `styles/components.css` (the Settings block's segmented buttons), keyed `data-similar-key`. — Cost if wrong: a class name.
- **Ruling: the export folder is written by the main process in one handler** (`save-dataset` receives the four texts and the folder name; it creates the folder with a `-2`, `-3` suffix when taken and writes each file `.tmp` then rename); the renderer builds every byte. No new root module: `writeJsonAtomic`'s sibling for text is five lines in `main.js`. — Cost if wrong: a root module and two allowlist entries.
- **Ruling: `vectors.json` is built with `JSON.stringify` and no pretty-printing** — 1,000 films of five blocks is about 10 MB; pretty-printing would double it for no reader's benefit. `manifest.json` is pretty-printed. — Cost if wrong: one argument.
- **Ruling: task order is settings → embeddings store → similarity → outcomes → keep-name → the tab → the Embed batch → comparison mode → the export → smoke → gate → records.** Task 6 (the tab) needs Tasks 2–4; Task 7 needs Task 2 and Plan A; Task 8 needs Task 6; Task 9 needs Tasks 2–4. — Cost if wrong: a reorder.

---

### Task 1: The `Appearance embeddings` switch

**Files:**
- Modify: `renderer/data/processing.js:1-7` (`DEFAULT_PERFORMANCE`, `validPerformance`)
- Modify: `backend-client.cjs:3-13` (`normalizePerformance`)
- Modify: `main.js:78-85` (`appendPerformance`)
- Modify: `renderer/components/sidebar.js:47-86` (`performanceBlock`)
- Test: `test/processing.test.js`

**Interfaces:**
- Consumes: `changePerformance(patch)` from `renderer/processing.js` (already validates and saves), `postForm`.
- Produces (binding on Tasks 7 and 10): `state.performance.embeddings: boolean` (default `true`); the `/predict` form field `embeddings`; `normalizePerformance` accepts a legacy file without the key and returns it `true`.

- [ ] **Step 1: Write the failing tests**

Append to `test/processing.test.js`:

```js
test('appearance embeddings default on for older preferences and save independently of the other switches', () => {
  const legacy = { mode: 'standard', cpuThreads: 2, cropLocalizer: true, toolbarRemoval: false };
  assert.deepEqual(normalizePerformance(legacy), { ...legacy, embeddings: true });
  assert.deepEqual(DEFAULT_PERFORMANCE, { ...legacy, embeddings: true });
  for (const embeddings of [true, false]) {
    const saved = { ...legacy, embeddings };
    assert.deepEqual(normalizePerformance(JSON.parse(JSON.stringify(saved))), saved);
    assert.equal(validPerformance(saved), true);
  }
  for (const embeddings of [null, 'false', 0, 1]) {
    assert.throws(() => normalizePerformance({ ...legacy, embeddings }));
    assert.equal(validPerformance({ ...legacy, embeddings }), false);
  }
});
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `node --test test/processing.test.js`
Expected: FAIL — `normalizePerformance(legacy)` returns no `embeddings` key.

- [ ] **Step 3: Implement the switch**

`renderer/data/processing.js`, replace the first seven lines:

```js
export const DEFAULT_PERFORMANCE = Object.freeze({ mode: 'standard', cpuThreads: 2, cropLocalizer: true, toolbarRemoval: false, embeddings: true });

export function validPerformance(value) {
  return value && ['standard', 'low-memory'].includes(value.mode)
    && Number.isInteger(value.cpuThreads) && value.cpuThreads >= 1 && value.cpuThreads <= 4
    && typeof value.cropLocalizer === 'boolean' && typeof value.toolbarRemoval === 'boolean'
    && typeof value.embeddings === 'boolean';
}
```

`backend-client.cjs`, replace `normalizePerformance`:

```js
function normalizePerformance(value) {
  const mode = value?.mode ?? 'standard';
  const cpuThreads = value?.cpuThreads ?? 2;
  const cropLocalizer = value?.cropLocalizer === undefined ? true : value.cropLocalizer;
  const toolbarRemoval = value?.toolbarRemoval === undefined ? false : value.toolbarRemoval;
  // Appearance embeddings (similar-cases spec, 2026-09-12, section 10.6): on for every
  // preference file written before the switch existed.
  const embeddings = value?.embeddings === undefined ? true : value.embeddings;
  if (!['standard', 'low-memory'].includes(mode) || !Number.isInteger(cpuThreads) || cpuThreads < 1 || cpuThreads > 4
    || typeof cropLocalizer !== 'boolean' || typeof toolbarRemoval !== 'boolean' || typeof embeddings !== 'boolean') {
    throw new Error('Invalid processing settings.');
  }
  return { mode, cpuThreads, cropLocalizer, toolbarRemoval, embeddings };
}
```

`main.js`, in `appendPerformance`, add after the `toolbar_removal` line: `form.append('embeddings', String(settings.embeddings));`

`renderer/components/sidebar.js`, in `performanceBlock`, append a fourth group after the toolbar-removal note (inside the same `el('div', { class: 'sidebar-models processing-settings' }, ...)` call, as its last three children):

```js
    el('div', { class: 'sidebar-models-label' }, 'APPEARANCE EMBEDDINGS'),
    el('div', { class: 'model-choice', role: 'group', 'aria-label': 'Appearance embeddings' },
      ...[[true, 'On'], [false, 'Off']].map(([embeddings, label]) => el('button', {
        type: 'button', class: 'model-choice-btn', disabled: busy,
        'aria-pressed': settings.embeddings === embeddings ? 'true' : 'false',
        'data-setting': `embeddings-${embeddings ? 'on' : 'off'}`,
        onClick: () => changePerformance({ embeddings }),
      }, label))),
    el('p', { class: 'processing-note' },
      'Computes the appearance embeddings the Find similar tab ranks by, about a second per film. Off skips them; the Find tab can embed later.'),
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `node --test test/processing.test.js`
Expected: PASS.

- [ ] **Step 5: Run the whole unit suite and commit**

Run: `node --test test/*.test.js > tools/smoke/out/b1-unit.txt 2>&1`
Expected: PASS; the count is the baseline plus one.

```bash
git add renderer/data/processing.js backend-client.cjs main.js renderer/components/sidebar.js test/processing.test.js
git commit -F tools/smoke/out/b1-commit.txt
```

Message: `feat: an Appearance embeddings switch in Settings, on by default, sent with every run` + the trailer.

---

### Task 2: The embeddings store

**Files:**
- Create: `renderer/data/embeddings.js`
- Create: `renderer/embeddings.js`
- Modify: `main.js` (after `delete-prediction`; `load-studies`; after `measure`), `preload.js`, `renderer/api.js`
- Modify: `renderer/store.js` (`embeddingsVersion: 0` after `compareId`)
- Modify: `renderer/screens/analysis.js:363-380` (the run completion), `renderer/screens/studies.js:501-502` and `:560` (the two delete paths)
- Test: `test/embeddings.test.js` (new), `test/api-persistence.test.js`, `test/store.test.js`

**Interfaces:**
- Consumes: `writeJsonAtomic`, `readJsonOrNull` (`store-io.js`); `predictionPath`'s id rule; `persistenceDisabledReason`, `assertWritable` (`api.js`).
- Produces (binding on Tasks 6, 7, 9):
  - `data/embeddings.js`: `EMBEDDING_VERSION = 1`; `validEmbedding(record) -> boolean`; `embeddingRecord(id, embedding, { sourceSha256, computedAt }) -> record | null` from a `/predict` or `/embed` `embedding`; `isCurrent(record, bundledSha) -> boolean`.
  - `renderer/embeddings.js`: `ensureEmbeddings() -> Promise<void>` (loads once); `embeddingFor(id) -> record | null`; `embeddingsMap() -> Map` (read only); `bundledModelSha() -> string | null`; `storeEmbedding(record) -> Promise<void>` (saves, updates, bumps); `forgetEmbedding(id)`; `needsEmbedding(study) -> boolean` (real, full coverage, no current record).
  - `api.js`: `saveEmbedding(id, record)`, `loadEmbeddings() -> record[]`, `embeddingModel() -> {id, dim, input, onnx_sha256} | null`, `embed({ id, imagePng, framing }) -> { embedding }`; `deletePrediction(id)` now removes both files.
  - The store record on disk: `embeddings/<id>.json` = `{ version, id, computedAt, sourceSha256, model, filmType, crop, whole }` (§11).
  - `state.embeddingsVersion: number`, bumped on every change to the map.

- [ ] **Step 1: Write the failing tests**

Create `test/embeddings.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMBEDDING_VERSION, validEmbedding, embeddingRecord, isCurrent } from '../renderer/data/embeddings.js';

const MODEL = { id: 'vit_small_patch14_dinov2.lvd142m', dim: 3, input: [224, 224], onnx_sha256: 'abc' };
const EMBEDDING = { model: MODEL, crop: [0.6, 0.8, 0], whole: [1, 0, 0], film_type: 'whole-spine' };

test('embeddingRecord builds the stored shape from a /predict embedding and keeps null blocks null', () => {
  const record = embeddingRecord('SP-1000', EMBEDDING, { sourceSha256: 'sha', computedAt: '2026-09-12T20:00:00.000Z' });
  assert.deepEqual(record, {
    version: EMBEDDING_VERSION, id: 'SP-1000', computedAt: '2026-09-12T20:00:00.000Z', sourceSha256: 'sha',
    model: MODEL, filmType: 'whole-spine', crop: [0.6, 0.8, 0], whole: [1, 0, 0],
  });
  assert.notEqual(record.model, MODEL);
  assert.equal(embeddingRecord('SP-1000', { ...EMBEDDING, whole: null, film_type: null }).whole, null);
  assert.equal(embeddingRecord('SP-1000', { ...EMBEDDING, whole: null, film_type: null }).filmType, null);
  assert.equal(embeddingRecord('SP-1000', null), null);
  assert.equal(embeddingRecord('SP-1000', { model: MODEL, crop: [] }), null);
  assert.equal(typeof embeddingRecord('SP-1000', EMBEDDING).computedAt, 'string');
});

test('validEmbedding accepts the stored shape and rejects a broken one', () => {
  const good = embeddingRecord('SP-1000', EMBEDDING);
  assert.equal(validEmbedding(good), true);
  assert.equal(validEmbedding({ ...good, whole: null }), true);
  assert.equal(validEmbedding({ ...good, filmType: 'lumbar' }), true);
  for (const bad of [null, 'x', { ...good, version: 2 }, { ...good, id: 7 }, { ...good, crop: [] }, { ...good, crop: ['a'] },
    { ...good, model: {} }, { ...good, whole: 'x' }, { ...good, filmType: 'thoracic' }]) {
    assert.equal(validEmbedding(bad), false, JSON.stringify(bad));
  }
});

test('isCurrent compares the record to the bundled graph and trusts the record when the graph is unknown', () => {
  const record = embeddingRecord('SP-1000', EMBEDDING);
  assert.equal(isCurrent(record, 'abc'), true);
  assert.equal(isCurrent(record, 'def'), false);
  assert.equal(isCurrent(record, null), true);
  assert.equal(isCurrent(null, 'abc'), false);
  assert.equal(isCurrent(null, null), false);
});
```

Append to `test/store.test.js`'s first test, after the `compareId` line: `assert.equal(state.embeddingsVersion, 0);`

Append to `test/api-persistence.test.js`:

```js
// Appended by the similar-cases plan B, Task 2. Runs after the tests above, so persistence is off.
test('after disablePersistence, saveEmbedding rejects without touching the bridge', async () => {
  const { saveEmbedding, persistenceDisabledReason } = await import('../renderer/api.js');
  assert.ok(persistenceDisabledReason(), 'precondition: persistence is already disabled');
  await withWindow({ spineContour: { saveEmbedding: async () => { throw new Error('the bridge must not be reached'); } } }, async () => {
    await assert.rejects(saveEmbedding('SP-1000', { version: 1 }), /not being saved/);
  });
});
```

- [ ] **Step 2: Run the three suites to verify they fail**

Run: `node --test test/embeddings.test.js test/store.test.js test/api-persistence.test.js`
Expected: `embeddings.test.js` fails to load (no module); the store test fails on `embeddingsVersion`; the api test fails because `saveEmbedding` is not exported.

- [ ] **Step 3: The pure module**

Create `renderer/data/embeddings.js`:

```js
/**
 * The stored appearance-embedding record (similar-cases spec, 2026-09-12, section 11): one file per
 * real study under embeddings/<id>.json, written when a run or an Embed completes. Pure: the map
 * that holds them and its IPC live in renderer/embeddings.js. Shape vectors are never stored --
 * data/similarity.js derives them from the record's geometry every time.
 */
export const EMBEDDING_VERSION = 1;

const FILM_TYPES = new Set(['whole-spine', 'lumbar']);

function finiteList(value) {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'number' && Number.isFinite(v));
}

export function validEmbedding(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  if (record.version !== EMBEDDING_VERSION || typeof record.id !== 'string') return false;
  if (!record.model || typeof record.model !== 'object' || typeof record.model.onnx_sha256 !== 'string') return false;
  if (!finiteList(record.crop)) return false;
  if (record.whole !== null && !finiteList(record.whole)) return false;
  return record.filmType === null || FILM_TYPES.has(record.filmType);
}

// From the `embedding` a /predict or /embed response carries. Null when the backend computed none.
export function embeddingRecord(id, embedding, { sourceSha256 = null, computedAt = new Date().toISOString() } = {}) {
  if (!embedding || typeof embedding !== 'object' || !finiteList(embedding.crop)) return null;
  return {
    version: EMBEDDING_VERSION,
    id,
    computedAt,
    sourceSha256,
    model: { ...(embedding.model ?? {}) },
    filmType: FILM_TYPES.has(embedding.film_type) ? embedding.film_type : null,
    crop: embedding.crop,
    whole: finiteList(embedding.whole) ? embedding.whole : null,
  };
}

// A record is current when it came from the bundled graph. An unknown bundled graph (the backend
// not ready, or no graph installed) keeps what is stored: nothing is counted stale on a guess.
export function isCurrent(record, bundledSha) {
  if (!record) return false;
  return bundledSha == null || record.model?.onnx_sha256 === bundledSha;
}
```

- [ ] **Step 4: The main process, the bridge and the api wrappers**

`main.js`: after `predictionPath`, add the sibling path (the same id rule, the sibling folder):

```js
function embeddingPath(id) {
  if (typeof id !== 'string' || !REAL_STUDY_ID.test(id) || Number(id.slice(3)) < 1000) {
    throw new Error('Invalid study id.');
  }
  return path.join(app.getPath('userData'), 'embeddings', `${id}.json`);
}
```

After the `delete-prediction` handler, add:

```js
// Appearance embeddings (similar-cases spec, 2026-09-12, section 11): one small file per study,
// written once per run or Embed and read all at once when something first asks.
ipcMain.handle('save-embedding', async (_event, id, record) => {
  if (!record || typeof record !== 'object') throw new Error('Nothing to save.');
  await writeJsonAtomic(embeddingPath(id), record);
});

ipcMain.handle('load-embeddings', async () => {
  const dir = path.join(app.getPath('userData'), 'embeddings');
  let names;
  try {
    names = await fsPromises.readdir(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error('The saved embeddings could not be read.');
  }
  const records = [];
  for (const name of names) {
    if (!/^SP-\d{4,}\.json$/.test(name)) continue;
    const parsed = await readJsonOrNull(path.join(dir, name));
    if (parsed) records.push(parsed);
    else console.warn(`embeddings: ${name} could not be read and is skipped`);
  }
  return records;
});

ipcMain.handle('embedding-model', async () => {
  if (!backendBaseUrl) throw new Error('The bundled backend is not ready.');
  const response = await fetch(`${backendBaseUrl}/embedding-model`);
  if (response.status === 503) return null;
  if (!response.ok) throw new Error(`The embedding model could not be read (status ${response.status}).`);
  return response.json();
});

// The Embed batch's request (spec section 12): the sidecar's image_png and framing, never the film.
ipcMain.handle('embed', async (_event, request) => {
  if (!backendBaseUrl) throw new Error('The bundled backend is not ready.');
  if (!request || typeof request.imagePng !== 'string' || !request.imagePng) throw new Error('No stored segmentation image.');
  const bytes = Buffer.from(request.imagePng, 'base64');
  if (bytes.byteLength === 0) throw new Error('No stored segmentation image.');
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error('The stored image exceeds 50 MB.');
  const form = new FormData();
  form.append('file', new Blob([bytes]), `${typeof request.id === 'string' ? request.id : 'study'}.png`);
  if (request.framing && typeof request.framing === 'object') form.append('framing', JSON.stringify(request.framing));
  const settings = normalizePerformance(request.performance);
  form.append('processing_mode', settings.mode);
  form.append('cpu_threads', String(settings.cpuThreads));
  const response = await fetch(`${backendBaseUrl}/embed`, { method: 'POST', body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || `Embedding failed with status ${response.status}.`);
  return body;
});
```

In `delete-prediction`, replace the body's `try` with one that removes both files, ENOENT is success for each:

```js
  const file = predictionPath(id);
  const embedding = embeddingPath(id);
  for (const target of [file, embedding]) {
    try {
      await fsPromises.unlink(target);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw new Error('The file is locked or the folder is not writable. Close anything that may be using it, then try again.');
    }
  }
```

In `load-studies`, the quarantine moves three things under one stamp. Replace the `try { await fsPromises.rename(...predictions...) } catch (error) {...}` block with a loop over both folders; a failure on either is the same `persistenceUnsafe` outcome:

```js
  const stamp = /\.corrupt-(\d+)$/.exec(store.quarantined);
  const suffix = `.corrupt-${stamp ? stamp[1] : Date.now()}`;
  const sidecarDir = `predictions${suffix}`;
  const root = app.getPath('userData');
  for (const folder of ['predictions', 'embeddings']) {
    try {
      await fsPromises.rename(path.join(root, folder), path.join(root, `${folder}${suffix}`));
    } catch (error) {
      // A fresh profile has neither folder. That is the normal case, not a failure.
      if (error.code !== 'ENOENT') {
        return {
          ...store,
          notice: sidecarMoveFailedNotice(store.quarantined),
          persistenceUnsafe: true,
          demoStudies: SHOW_DEMO_STUDIES,
        };
      }
    }
  }
  return { ...store, notice: quarantineNotice(store.quarantined, sidecarDir), demoStudies: SHOW_DEMO_STUDIES };
```

`preload.js`: add five lines to the exposed object:

```js
  saveEmbedding: (id, record) => ipcRenderer.invoke('save-embedding', id, record),
  loadEmbeddings: () => ipcRenderer.invoke('load-embeddings'),
  embeddingModel: () => ipcRenderer.invoke('embedding-model'),
  embed: (request) => ipcRenderer.invoke('embed', request),
  saveDataset: (request) => ipcRenderer.invoke('save-dataset', request),
```

(`save-dataset`'s handler is Task 9; exposing the channel now is harmless.)

`renderer/api.js`: after `deletePrediction`, add:

```js
// Appearance embeddings (similar-cases spec, 2026-09-12, section 11). The write is gated like the
// sidecar's; the read is not -- a refused store has no embeddings to mis-attribute, because ids
// are validated on the way in and the map is keyed by id only for the session.
export async function saveEmbedding(id, record) {
  assertWritable();
  return invoke('saveEmbedding', id, record);
}

export async function loadEmbeddings() {
  const records = await invoke('loadEmbeddings');
  return Array.isArray(records) ? records : [];
}

// The bundled graph's model record, or null when the backend has none installed.
export async function embeddingModel() {
  return invoke('embeddingModel');
}

// The Embed batch's call (spec section 12): the sidecar's image_png and framing.
export async function embed(request) {
  return invoke('embed', { performance: getState().performance, ...request });
}

export async function saveDataset(request) {
  return invoke('saveDataset', request);
}
```

and update `deletePrediction`'s comment to say it removes `predictions/<id>.json` and `embeddings/<id>.json`.

`renderer/store.js`: after `compareId: null,` add:

```js
  // (similar-cases spec, 2026-09-12, section 11) bumped by renderer/embeddings.js on every change
  // to the loaded embeddings map, so the Find similar tab and the Embed button repaint. The
  // vectors themselves are never in state.
  embeddingsVersion: 0,
```

- [ ] **Step 5: The root module**

Create `renderer/embeddings.js`:

```js
/**
 * The loaded appearance embeddings (similar-cases spec, 2026-09-12, section 11): one Map of
 * embeddings/<id>.json records, read once when something first asks -- the Find similar tab, the
 * Find tab's Embed count, Export dataset -- never at bootstrap. Module scope beside batch.js and
 * processing.js, because it imports api.js and the store; the pure record shape is
 * data/embeddings.js. Every change bumps state.embeddingsVersion so subscribers repaint; the map
 * itself never enters the store.
 */
import { setState } from './store.js';
import { loadEmbeddings, saveEmbedding, embeddingModel } from './api.js';
import { validEmbedding, isCurrent } from './data/embeddings.js';
import { vector } from './data/similarity.js';

const records = new Map();
let loading = null;
let model = null;

// setState after an await, never inside a subscriber (store.js forbids re-entrant updates).
function bump() {
  setState((s) => ({ embeddingsVersion: (s.embeddingsVersion ?? 0) + 1 }));
}

export function ensureEmbeddings() {
  if (loading) return loading;
  loading = (async () => {
    let loaded = [];
    try {
      loaded = await loadEmbeddings();
    } catch (error) {
      console.warn('Could not load the saved embeddings:', error.message);
    }
    for (const record of loaded) {
      if (validEmbedding(record)) records.set(record.id, record);
      else console.warn(`embeddings: a stored record was skipped (${record?.id ?? 'unknown id'})`);
    }
    try {
      model = await embeddingModel();
    } catch (error) {
      model = null;
      console.warn('Could not read the bundled embedding model:', error.message);
    }
    bump();
  })();
  return loading;
}

export function embeddingFor(id) {
  return records.get(id) ?? null;
}

// Read-only for callers; every write goes through storeEmbedding and forgetEmbedding.
export function embeddingsMap() {
  return records;
}

export function bundledModelSha() {
  return typeof model?.onnx_sha256 === 'string' ? model.onnx_sha256 : null;
}

export async function storeEmbedding(record) {
  await saveEmbedding(record.id, record);
  records.set(record.id, record);
  bump();
}

// On delete, with every other id-keyed cache: the next film can reuse the id.
export function forgetEmbedding(id) {
  if (records.delete(id)) bump();
}

// The Embed button's rule (spec section 12): a real, fully covered, segmented study without a
// current record -- segmented before this build, with the setting off, after a failed stage, or
// under an older graph.
export function needsEmbedding(study) {
  if (!study || study.source !== 'real' || study.measurements == null || study.geometry == null) return false;
  if (vector(study) === null) return false;
  return !isCurrent(records.get(study.id), bundledModelSha());
}
```

`data/similarity.js` is Task 3; until it lands, create it as a stub exporting `vector` returning `null` is NOT allowed (no placeholders) — instead order the work: implement Task 3 before running Task 2's Step 6 app check, or run Tasks 2 and 3 in one dispatch. The unit tests in this task do not import `renderer/embeddings.js`.

- [ ] **Step 6: The run completion saves, the delete paths forget**

`renderer/screens/analysis.js`: import `{ storeEmbedding, forgetEmbedding }` is NOT needed here for delete (that is `studies.js`); import `{ storeEmbedding }` from `'../embeddings.js'` and `{ embeddingRecord }` from `'../data/embeddings.js'`. In `segmentStudy`, directly after the sidecar write block (after the `if (revision !== runRevision) { disposeStudyImages(images); return ...superseded }` that follows `savePrediction`) and before `const onScreen = ...`, add:

```js
    // The embedding record (similar-cases spec, 2026-09-12, section 11), after the sidecar and
    // before the record commit. A failed write is a warning, never a failed run; a response
    // without an embedding (the setting off, or the stage failed) stores nothing and the Find
    // tab's Embed button counts the study.
    const embedding = embeddingRecord(studyId, response.embedding ?? null,
      { sourceSha256: response.calibration?.source_sha256 ?? null });
    if (embedding && !persistenceDisabledReason()) {
      try {
        await storeEmbedding(embedding);
      } catch (error) {
        warning = warning ? `${warning}; the appearance embedding could not be stored: ${error.message}`
          : `the appearance embedding could not be stored: ${error.message}`;
        if (!batch) showToast(`Saved the measurements, but ${warning}`);
      }
      if (revision !== runRevision) { disposeStudyImages(images); return { ok: false, reason: 'superseded' }; }
    }
```

`renderer/screens/studies.js`: import `{ forgetEmbedding }` from `'../embeddings.js'`; at both delete sites (`forgetPrediction(id); releaseStudy(id);` at ~502 and the loop at ~560), add `forgetEmbedding(id);` beside `releaseStudy(id)`. The bulk site already nulls `compareId` when the compare study goes.

- [ ] **Step 7: Run the suites, then commit**

Run: `node --test test/embeddings.test.js test/store.test.js test/api-persistence.test.js`
Expected: PASS.

Run: `node --test test/*.test.js > tools/smoke/out/b2-unit.txt 2>&1`
Expected: PASS. (Loading `renderer/embeddings.js` is not exercised by any unit test; it is exercised by the app in Task 6 and the smoke suite in Task 10.)

```bash
git add renderer/data/embeddings.js renderer/embeddings.js main.js preload.js renderer/api.js renderer/store.js renderer/screens/analysis.js renderer/screens/studies.js test/embeddings.test.js test/store.test.js test/api-persistence.test.js
git commit -F tools/smoke/out/b2-commit.txt
```

Message: `feat: store appearance embeddings one file per study; load them once; forget them on delete` + the trailer. If Task 3 has not landed yet, commit this task together with Task 3 (the root module imports `data/similarity.js`).

---

### Task 3: `renderer/data/similarity.js` — vectors, blocks, the fused distance, candidates, ranking

**Files:**
- Create: `renderer/data/similarity.js`
- Test: `test/similarity.test.js` (new)

**Interfaces:**
- Consumes: `HAND_ADDED`, `matchesLocation`, `subjectKey` from `data/parameters.js`.
- Produces (binding on Tasks 6, 7, 9):
  - `LANDMARK_ORDER` (22 names `L1.SA` … `S1.SP`), `ALIGNMENT_ORDER = ['PI', 'PT', 'SS', 'LL L1-S1', 'PI-LL']`, `ALIGNMENT_WEIGHTS = [1, 0.8, 0.8, 0.6, 1]`, `MODES` (`all`, `shape`, `alignment`, `appearance` → block weights), `BLOCK_KEYS = ['V', 'H', 'A', 'C', 'W']`, `SCOPES = ['all', 'workspace']`.
  - `vector(study) -> { V: number[44], H: number[2] | null } | null`; `alignment(study) -> number[5] | null`.
  - `blocks(study, embedding) -> { V, H, A, C, W, filmType, model }`.
  - `shapeDistance(a, b)`, `pelvicDistance(a, b)`, `alignmentDistance(a, b)`, `appearanceDistance(a, b)` over arrays.
  - `pairDistances(open, candidate, mode) -> { V, H, A, C, W }` (a number or `null` per block).
  - `medianScale(values) -> number`; `fuse(distances, scales, weights) -> { d, blocks } | null` (`weights` is a `{ V, H, A, C, W }` table such as `MODES[mode]`, so a later stage can pass its own); `matchScore(d) -> integer 0..100`.
  - `candidates(open, all, { scope, mode, embeddings }) -> Study[]` (`embeddings` is a Map or a plain object keyed by study id, everywhere below).
  - `findSimilar(open, all, { scope, mode, embeddings, n = 5 }) -> { matches: [{ study, d, match, blocks }], total, stale }`.
  - `openReason(open, mode, embeddings) -> 'unsegmented' | 'partial' | 'no-embedding' | 'no-alignment' | null`.
  - `angleLine(open, candidate) -> string` (`PI +2 · LL −6 · PT +1 · SS −3`, `—` per absent angle).
  - `subjectFilms(study, all) -> Study[]` (the real films sharing its subject key, or `[study]`).
  - `needsEmbedding(mode) -> boolean` (`all` or `appearance`).

- [ ] **Step 1: Write the failing tests**

Create `test/similarity.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LANDMARK_ORDER, ALIGNMENT_ORDER, ALIGNMENT_WEIGHTS, MODES, BLOCK_KEYS, vector, alignment, blocks,
  shapeDistance, pelvicDistance, alignmentDistance, appearanceDistance, pairDistances, medianScale, fuse,
  matchScore, candidates, findSimilar, openReason, angleLine, subjectFilms, needsEmbedding,
} from '../renderer/data/similarity.js';
import { HAND_ADDED } from '../renderer/data/parameters.js';

// A synthetic column: five bodies stacked 100 px apart, anterior on the RIGHT (x = 160/140), S1 under
// them, the hip well below and in front. `dx`, `dy`, `scale` place a copy elsewhere; `flip` mirrors it.
function geometry({ dx = 0, dy = 0, scale = 1, flip = false, levels = ['L1', 'L2', 'L3', 'L4', 'L5'], hip = true, s1 = true } = {}) {
  const px = (x, y) => [flip ? -(x * scale + dx) : x * scale + dx, y * scale + dy];
  const vertebrae = {};
  levels.forEach((level) => {
    const i = ['L1', 'L2', 'L3', 'L4', 'L5'].indexOf(level);
    const top = 100 + i * 100;
    vertebrae[level] = {
      superior: [px(160, top), px(100, top)],
      inferior: [px(160, top + 80), px(100, top + 80)],
      quadrilateral: [px(160, top), px(100, top), px(100, top + 80), px(160, top + 80)],
    };
  });
  return {
    vertebrae,
    s1_superior: s1 ? [px(170, 610), px(110, 620)] : null,
    l1_center: levels.includes('L1') ? px(130, 140) : null,
    hip_midpoint: hip ? px(260, 760) : null,
    femoral_circles: hip ? [[...px(250, 760), 30], [...px(270, 760), 30]] : [],
  };
}

function study(id, overrides = {}) {
  return {
    id, source: 'real', filePath: `C:\\films\\${id}.png`, fileName: `${id}.png`, name: null, workspaceFolder: 'C:\\films',
    subjectId: null, timepoint: null, filmDate: null, reviewedAt: null, addedAt: '2026-09-12T00:00:00.000Z',
    view: 'Standing lateral', thumbnail: null,
    measurements: { PI: 50, PT: 12, SS: 38, L1PA: 8, LL: { 'L1-S1': 49 } },
    geometry: geometry(), qc: { coverage: { partial: false, unoriented: [] } }, clinical: {}, ...overrides,
  };
}

const unit = (values) => { const n = Math.hypot(...values); return values.map((v) => v / n); };
function embedding(id, crop, whole = null, filmType = 'lumbar', sha = 'abc') {
  return { version: 1, id, computedAt: 'x', sourceSha256: null, model: { onnx_sha256: sha }, filmType, crop: unit(crop), whole: whole ? unit(whole) : null };
}

test('the landmark order is the 22 corners then S1, and the alignment order carries its weights', () => {
  assert.equal(LANDMARK_ORDER.length, 22);
  assert.deepEqual(LANDMARK_ORDER.slice(0, 4), ['L1.SA', 'L1.SP', 'L1.IA', 'L1.IP']);
  assert.deepEqual(LANDMARK_ORDER.slice(20), ['S1.SA', 'S1.SP']);
  assert.deepEqual(ALIGNMENT_ORDER, ['PI', 'PT', 'SS', 'LL L1-S1', 'PI-LL']);
  assert.deepEqual(ALIGNMENT_WEIGHTS, [1, 0.8, 0.8, 0.6, 1]);
  assert.deepEqual(BLOCK_KEYS, ['V', 'H', 'A', 'C', 'W']);
  assert.deepEqual(MODES.all, { V: 1, H: 1, A: 1, C: 1, W: 1 });
  assert.deepEqual(MODES.shape, { V: 1, H: 1, A: 0, C: 0, W: 0 });
  assert.deepEqual(MODES.alignment, { V: 0, H: 0, A: 1, C: 0, W: 0 });
  assert.deepEqual(MODES.appearance, { V: 0, H: 0, A: 0, C: 1, W: 1 });
});

test('vector centres the 22 points, scales them to unit centroid size and carries the hip through the same transform', () => {
  const v = vector(study('SP-1'));
  assert.equal(v.V.length, 44);
  const xs = v.V.filter((_, i) => i % 2 === 0);
  const ys = v.V.filter((_, i) => i % 2 === 1);
  const mean = (list) => list.reduce((s, x) => s + x, 0) / list.length;
  assert.ok(Math.abs(mean(xs)) < 1e-12 && Math.abs(mean(ys)) < 1e-12);
  assert.ok(Math.abs(Math.hypot(...v.V) - 1) < 1e-12);
  // The hip is below and in front of the column: positive x (anterior), positive y (down).
  assert.ok(v.H[0] > 0 && v.H[1] > 0.5);
});

test('a translated, scaled or mirrored copy has the same vector, and orientation is never removed', () => {
  const base = vector(study('SP-1'));
  const moved = vector(study('SP-2', { geometry: geometry({ dx: 500, dy: -40, scale: 2.5 }) }));
  const flipped = vector(study('SP-3', { geometry: geometry({ flip: true }) }));
  assert.ok(shapeDistance(base.V, moved.V) < 1e-9);
  assert.ok(shapeDistance(base.V, flipped.V) < 1e-9);
  assert.ok(pelvicDistance(base.H, flipped.H) < 1e-9);
  // A column tilted 15 degrees is a different shape: no rotation normalisation.
  const c = Math.cos(Math.PI / 12), s = Math.sin(Math.PI / 12);
  const rotated = structuredClone(study('SP-4').geometry);
  const rotate = ([x, y]) => [c * x - s * y, s * x + c * y];
  for (const body of Object.values(rotated.vertebrae)) {
    body.superior = body.superior.map(rotate); body.inferior = body.inferior.map(rotate); body.quadrilateral = body.quadrilateral.map(rotate);
  }
  rotated.s1_superior = rotated.s1_superior.map(rotate);
  rotated.hip_midpoint = rotate(rotated.hip_midpoint);
  assert.ok(shapeDistance(base.V, vector(study('SP-4', { geometry: rotated })).V) > 0.05);
});

test('vector is null for a missing level, a missing S1, partial or unoriented coverage, a demo, or an unsegmented study', () => {
  assert.equal(vector(study('SP-1', { geometry: geometry({ levels: ['L1', 'L2', 'L3', 'L4'] }) })), null);
  assert.equal(vector(study('SP-1', { geometry: geometry({ s1: false }) })), null);
  assert.equal(vector(study('SP-1', { qc: { coverage: { partial: true, unoriented: [] } } })), null);
  assert.equal(vector(study('SP-1', { qc: { coverage: { partial: false, unoriented: ['L3'] } } })), null);
  const unconfirmed = geometry(); unconfirmed.vertebrae.L2.anterior_confirmed = false;
  assert.equal(vector(study('SP-1', { geometry: unconfirmed })), null);
  assert.equal(vector({ id: 'SP-0042', source: 'demo', measurements: { PI: 50 }, geometry: null, qc: null }), null);
  assert.equal(vector(study('SP-1', { measurements: null, geometry: null })), null);
  assert.equal(vector(study('SP-1', { geometry: geometry({ hip: false }) })).H, null);
});

test('alignment is the five angles with PI-LL derived, or null with one missing', () => {
  assert.deepEqual(alignment(study('SP-1')), [50, 12, 38, 49, 1]);
  assert.equal(alignment(study('SP-1', { measurements: { PI: null, PT: 12, SS: 38, LL: { 'L1-S1': 49 } } })), null);
  assert.equal(alignment(study('SP-1', { measurements: { PI: 50, PT: 12, SS: 38, LL: { 'L1-S1': null } } })), null);
  assert.equal(alignment({ measurements: null }), null);
  assert.equal(alignment(null), null);
});

test('the four distances: zero for a copy, symmetric, weighted for alignment, cosine for appearance', () => {
  const a = vector(study('SP-1'));
  assert.equal(shapeDistance(a.V, a.V), 0);
  assert.equal(pelvicDistance(a.H, a.H), 0);
  assert.equal(alignmentDistance([50, 12, 38, 49, 1], [50, 12, 38, 49, 1]), 0);
  assert.ok(Math.abs(alignmentDistance([50, 12, 38, 49, 1], [60, 12, 38, 49, 11]) - Math.sqrt(1 * 100 + 1 * 100)) < 1e-9);
  assert.ok(Math.abs(alignmentDistance([50, 12, 38, 49, 1], [50, 22, 38, 49, 1]) - Math.sqrt(0.8 * 100)) < 1e-9);
  assert.equal(alignmentDistance([1, 2, 3, 4, 5], [2, 3, 4, 5, 6]), alignmentDistance([2, 3, 4, 5, 6], [1, 2, 3, 4, 5]));
  assert.ok(Math.abs(appearanceDistance(unit([1, 0]), unit([1, 0]))) < 1e-12);
  assert.ok(Math.abs(appearanceDistance(unit([1, 0]), unit([0, 1])) - 1) < 1e-12);
  assert.ok(Math.abs(appearanceDistance(unit([1, 0]), unit([-1, 0])) - 2) < 1e-12);
});

test('blocks and pairDistances: every block only when both have it, the same model, and W only between two whole-spine films', () => {
  const open = blocks(study('SP-1'), embedding('SP-1', [1, 0], [1, 0], 'whole-spine'));
  const same = blocks(study('SP-2'), embedding('SP-2', [1, 0], [0, 1], 'whole-spine'));
  const lumbar = blocks(study('SP-3'), embedding('SP-3', [0, 1], [0, 1], 'lumbar'));
  const otherModel = blocks(study('SP-4'), embedding('SP-4', [1, 0], [1, 0], 'whole-spine', 'zzz'));
  const noHip = blocks(study('SP-5', { geometry: geometry({ hip: false }), measurements: { PI: null, PT: null, SS: 38, LL: { 'L1-S1': 49 } } }), null);
  const all = pairDistances(open, same, 'all');
  assert.equal(all.V, 0); assert.equal(all.H, 0); assert.equal(all.A, 0); assert.equal(all.C, 0);
  assert.ok(Math.abs(all.W - 1) < 1e-12);
  const withLumbar = pairDistances(open, lumbar, 'all');
  assert.ok(Math.abs(withLumbar.C - 1) < 1e-12);
  assert.equal(withLumbar.W, null);
  const across = pairDistances(open, otherModel, 'all');
  assert.equal(across.C, null); assert.equal(across.W, null); assert.equal(across.V, 0);
  const sparse = pairDistances(open, noHip, 'all');
  assert.equal(sparse.H, null); assert.equal(sparse.A, null); assert.equal(sparse.C, null); assert.equal(sparse.V, 0);
  assert.deepEqual(pairDistances(open, same, 'shape'), { V: 0, H: 0, A: null, C: null, W: null });
  assert.deepEqual(pairDistances(open, same, 'alignment'), { V: null, H: null, A: 0, C: null, W: null });
  const appearance = pairDistances(open, same, 'appearance');
  assert.equal(appearance.V, null); assert.equal(appearance.C, 0); assert.ok(Math.abs(appearance.W - 1) < 1e-12);
});

test('medianScale needs three present values and a positive median, else 1', () => {
  assert.equal(medianScale([]), 1);
  assert.equal(medianScale([2, 4]), 1);
  assert.equal(medianScale([null, 2, 4]), 1);
  assert.equal(medianScale([2, 4, 9]), 4);
  assert.equal(medianScale([2, 4, 9, 20]), 6.5);
  assert.equal(medianScale([0, 0, 0]), 1);
  assert.equal(medianScale([null, 1, 3, 5, undefined]), 3);
});

test('fuse is the weighted root-mean-square of the present scaled blocks and names them; nothing present is null', () => {
  const scales = { V: 2, H: 1, A: 10, C: 0.5, W: 0.5 };
  const one = fuse({ V: 2, H: null, A: null, C: null, W: null }, scales, MODES.all);
  assert.deepEqual(one, { d: 1, blocks: ['V'] });
  const two = fuse({ V: 2, H: 3, A: null, C: null, W: null }, scales, MODES.all);
  assert.ok(Math.abs(two.d - Math.sqrt((1 + 9) / 2)) < 1e-12);
  assert.deepEqual(two.blocks, ['V', 'H']);
  assert.deepEqual(fuse({ V: 2, H: 3, A: 20, C: 1, W: 1 }, scales, MODES.alignment), { d: 2, blocks: ['A'] });
  assert.equal(fuse({ V: null, H: null, A: null, C: null, W: null }, scales, MODES.all), null);
  assert.equal(fuse({ V: 2, H: 3, A: null, C: null, W: null }, scales, MODES.appearance), null);
  // Any weight table works, not only the four presets: a later stage's sliders pass their own.
  const custom = fuse({ V: 2, H: 3, A: null, C: null, W: null }, scales, { V: 3, H: 1, A: 0, C: 0, W: 0 });
  assert.ok(Math.abs(custom.d - Math.sqrt((3 * 1 + 1 * 9) / 4)) < 1e-12);
});

test('matchScore is 100 at zero distance, falls with it, and is clamped to 0..100', () => {
  assert.equal(matchScore(0), 100);
  assert.equal(matchScore(0.5), 61);
  assert.equal(matchScore(1), 37);
  assert.equal(matchScore(10), 0);
  assert.equal(matchScore(-1), 100);
});

test('candidates: real, not self, full coverage, in scope, not the same subject, with an embedding when the mode needs one', () => {
  const open = study('SP-1', { subjectId: 'S001', workspaceFolder: 'C:\\A' });
  const all = [
    open,
    study('SP-2', { workspaceFolder: 'C:\\A' }),
    study('SP-3', { workspaceFolder: 'C:\\B' }),
    study('SP-4', { workspaceFolder: null }),
    study('SP-5', { workspaceFolder: 'C:\\A', subjectId: ' s001 ' }),
    study('SP-6', { workspaceFolder: 'C:\\A', qc: { coverage: { partial: true, unoriented: [] } } }),
    { ...study('SP-0042'), source: 'demo', geometry: null },
  ];
  const embeddings = { 'SP-2': embedding('SP-2', [1, 0]), 'SP-3': embedding('SP-3', [1, 0]) };
  const ids = (list) => list.map((s) => s.id);
  assert.deepEqual(ids(candidates(open, all, { scope: 'all', mode: 'shape', embeddings })), ['SP-2', 'SP-3', 'SP-4']);
  assert.deepEqual(ids(candidates(open, all, { scope: 'workspace', mode: 'shape', embeddings })), ['SP-2']);
  assert.deepEqual(ids(candidates(open, all, { scope: 'all', mode: 'all', embeddings })), ['SP-2', 'SP-3']);
  assert.deepEqual(ids(candidates(open, all, { scope: 'all', mode: 'appearance', embeddings })), ['SP-2', 'SP-3']);
  assert.deepEqual(ids(candidates(open, all, { scope: 'all', mode: 'alignment', embeddings: {} })), ['SP-2', 'SP-3', 'SP-4']);
  // A hand-added open study's workspace is the other hand-added films.
  const hand = study('SP-9', { workspaceFolder: null });
  assert.deepEqual(ids(candidates(hand, [hand, ...all], { scope: 'workspace', mode: 'shape', embeddings: {} })), ['SP-4']);
  assert.equal(HAND_ADDED, '__hand__');
});

test('findSimilar ranks ascending, breaks ties by id, returns n, and counts the stale-model candidates', () => {
  const open = study('SP-1');
  const near = study('SP-2', { geometry: geometry({ dx: 3, dy: 1 }), measurements: { PI: 52, PT: 12, SS: 40, LL: { 'L1-S1': 49 } } });
  const far = study('SP-3', { measurements: { PI: 75, PT: 30, SS: 45, LL: { 'L1-S1': 30 } } });
  const twin = study('SP-4');
  const twinToo = study('SP-5');
  const stale = study('SP-6');
  const embeddings = {
    'SP-1': embedding('SP-1', [1, 0]), 'SP-2': embedding('SP-2', [0.9, 0.1]), 'SP-3': embedding('SP-3', [0, 1]),
    'SP-4': embedding('SP-4', [1, 0]), 'SP-5': embedding('SP-5', [1, 0]), 'SP-6': embedding('SP-6', [1, 0], null, 'lumbar', 'old'),
  };
  const all = [open, far, twinToo, near, twin, stale];
  const result = findSimilar(open, all, { scope: 'all', mode: 'all', embeddings, n: 5 });
  // SP-6 shares the open study's geometry and angles: it ties at zero on V, H and A (its embedding
  // is from another graph, so C never enters), and the tie breaks by id.
  assert.deepEqual(result.matches.map((m) => m.study.id), ['SP-4', 'SP-5', 'SP-6', 'SP-2', 'SP-3']);
  assert.equal(result.matches[0].d, 0);
  assert.equal(result.matches[0].match, 100);
  assert.deepEqual(result.matches[0].blocks, ['V', 'H', 'A', 'C']);
  assert.deepEqual(result.matches[2].blocks, ['V', 'H', 'A']);
  assert.equal(result.total, 5);
  assert.equal(result.stale, 1);
  assert.equal(findSimilar(open, all, { scope: 'all', mode: 'all', embeddings, n: 2 }).matches.length, 2);
  // Under appearance the stale candidate has no block at all and is dropped from the ranking.
  const appearance = findSimilar(open, all, { scope: 'all', mode: 'appearance', embeddings });
  assert.deepEqual(appearance.matches.map((m) => m.study.id), ['SP-4', 'SP-5', 'SP-2', 'SP-3']);
  assert.equal(appearance.total, 4);
  assert.equal(appearance.stale, 1);
  assert.deepEqual(findSimilar(open, [open], { embeddings }), { matches: [], total: 0, stale: 0 });
});

test('openReason names why the tab shows no cards', () => {
  const e = { 'SP-1': embedding('SP-1', [1, 0]) };
  assert.equal(openReason(study('SP-1', { measurements: null, geometry: null }), 'all', e), 'unsegmented');
  assert.equal(openReason(study('SP-1', { qc: { coverage: { partial: true, unoriented: [] } } }), 'all', e), 'partial');
  assert.equal(openReason(study('SP-1'), 'all', {}), 'no-embedding');
  assert.equal(openReason(study('SP-1'), 'appearance', {}), 'no-embedding');
  assert.equal(openReason(study('SP-1'), 'shape', {}), null);
  assert.equal(openReason(study('SP-1', { measurements: { PI: null, PT: 12, SS: 38, LL: { 'L1-S1': 49 } } }), 'alignment', e), 'no-alignment');
  assert.equal(openReason(study('SP-1', { measurements: { PI: null, PT: 12, SS: 38, LL: { 'L1-S1': 49 } } }), 'all', e), null);
  assert.equal(openReason(study('SP-1'), 'all', e), null);
  assert.equal(needsEmbedding('all'), true);
  assert.equal(needsEmbedding('appearance'), true);
  assert.equal(needsEmbedding('shape'), false);
  assert.equal(needsEmbedding('alignment'), false);
});

test('angleLine is the candidate minus the open study in whole signed degrees, with a dash per absent angle', () => {
  const open = study('SP-1');
  const other = study('SP-2', { measurements: { PI: 52.4, PT: 11.6, SS: 40.5, LL: { 'L1-S1': 43 } } });
  assert.equal(angleLine(open, other), 'PI +2 \u00B7 LL \u22126 \u00B7 PT 0 \u00B7 SS +3');
  const missing = study('SP-3', { measurements: { PI: null, PT: 12, SS: null, LL: { 'L1-S1': 49 } } });
  assert.equal(angleLine(open, missing), 'PI \u2014 \u00B7 LL 0 \u00B7 PT 0 \u00B7 SS \u2014');
  assert.equal(angleLine(open, { measurements: null }), 'PI \u2014 \u00B7 LL \u2014 \u00B7 PT \u2014 \u00B7 SS \u2014');
});

test('subjectFilms is the real films sharing the subject key, or the study alone', () => {
  const a = study('SP-1', { subjectId: 'S001' });
  const b = study('SP-2', { subjectId: ' s001' });
  const c = study('SP-3', { subjectId: 'S002' });
  const d = study('SP-4');
  const demo = { ...study('SP-0042', { subjectId: 'S001' }), source: 'demo' };
  assert.deepEqual(subjectFilms(a, [a, b, c, d, demo]).map((s) => s.id), ['SP-1', 'SP-2']);
  assert.deepEqual(subjectFilms(d, [a, b, c, d]).map((s) => s.id), ['SP-4']);
});
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `node --test test/similarity.test.js`
Expected: FAIL at import (no module).

- [ ] **Step 3: Write the module**

Create `renderer/data/similarity.js`:

```js
/**
 * Pure ranking for the Find similar tab (similar-cases spec, 2026-09-12, section 7). No DOM.
 *
 * Five blocks per study: V, the 44 normalised coordinates of the 22 landmarks (mirror so anterior
 * points to +x, translate to the centroid, scale to unit centroid size, never rotate); H, the hip
 * midpoint under the same transform; A, the five sagittal angles with spec 10.5's weights; C and
 * W, the crop and whole-film appearance embeddings (cosine). Each block's distance is divided by
 * its median over the candidates, the mode picks the weights, and the fused distance is a
 * weighted root-mean-square. Shape is derived from the record's geometry every time and never
 * stored; the embeddings arrive as the records renderer/embeddings.js holds.
 */
import { HAND_ADDED, matchesLocation, subjectKey } from './parameters.js';

const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'];
const CORNERS = ['SA', 'SP', 'IA', 'IP'];
export const LANDMARK_ORDER = Object.freeze([
  ...LEVELS.flatMap((level) => CORNERS.map((corner) => `${level}.${corner}`)), 'S1.SA', 'S1.SP',
]);
export const ALIGNMENT_ORDER = Object.freeze(['PI', 'PT', 'SS', 'LL L1-S1', 'PI-LL']);
export const ALIGNMENT_WEIGHTS = Object.freeze([1, 0.8, 0.8, 0.6, 1]);
export const BLOCK_KEYS = Object.freeze(['V', 'H', 'A', 'C', 'W']);
export const MODES = Object.freeze({
  all: Object.freeze({ V: 1, H: 1, A: 1, C: 1, W: 1 }),
  shape: Object.freeze({ V: 1, H: 1, A: 0, C: 0, W: 0 }),
  alignment: Object.freeze({ V: 0, H: 0, A: 1, C: 0, W: 0 }),
  appearance: Object.freeze({ V: 0, H: 0, A: 0, C: 1, W: 1 }),
});
export const SCOPES = Object.freeze(['all', 'workspace']);

const DASH = '\u2014';
const SEP = ' \u00B7 ';
const MINUS = '\u2212';

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function point(p) {
  return Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]);
}

function mean(list) {
  return list.reduce((sum, v) => sum + v, 0) / list.length;
}

export function needsEmbedding(mode) {
  return mode === 'all' || mode === 'appearance';
}

// The 22 points in LANDMARK_ORDER, or null: every level and S1 must be present, the coverage full,
// no body unoriented (its anterior is a guess and the mirror step needs it) -- spec 7.1 step 1.
function landmarks(study) {
  const g = study?.geometry;
  if (!g || !g.vertebrae || typeof g.vertebrae !== 'object') return null;
  if (!Array.isArray(g.s1_superior) || !point(g.s1_superior[0]) || !point(g.s1_superior[1])) return null;
  const coverage = study.qc?.coverage;
  if (coverage?.partial === true) return null;
  if (Array.isArray(coverage?.unoriented) && coverage.unoriented.length > 0) return null;
  const points = [];
  for (const level of LEVELS) {
    const body = g.vertebrae[level];
    if (!body || body.anterior_confirmed === false) return null;
    if (!Array.isArray(body.superior) || !Array.isArray(body.inferior)) return null;
    const [sa, sp] = body.superior;
    const [ia, ip] = body.inferior;
    if (![sa, sp, ia, ip].every(point)) return null;
    points.push(sa, sp, ia, ip);
  }
  points.push(g.s1_superior[0], g.s1_superior[1]);
  return points;
}

// Index i of the 22 is anterior when it is an SA or IA corner (even position within its body) or
// S1.SA (index 20); SP, IP and S1.SP (index 21) are posterior.
function isAnterior(index) {
  return index === 20 || (index < 20 && index % 4 !== 1 && index % 4 !== 3);
}

// Mirror, translate, scale -- never rotate (spec 7.1 steps 2-5). { V, H } or null.
export function vector(study) {
  const points = landmarks(study);
  if (!points) return null;
  const anterior = [];
  const posterior = [];
  points.forEach(([x], index) => (isAnterior(index) ? anterior : posterior).push(x));
  const sign = mean(anterior) < mean(posterior) ? -1 : 1;
  const mirrored = points.map(([x, y]) => [sign * x, y]);
  const cx = mean(mirrored.map(([x]) => x));
  const cy = mean(mirrored.map(([, y]) => y));
  const centred = mirrored.map(([x, y]) => [x - cx, y - cy]);
  const size = Math.sqrt(centred.reduce((sum, [x, y]) => sum + x * x + y * y, 0));
  if (!(size > 0)) return null;
  const V = centred.flatMap(([x, y]) => [x / size, y / size]);
  const hip = study.geometry.hip_midpoint;
  const H = point(hip) ? [(sign * hip[0] - cx) / size, (hip[1] - cy) / size] : null;
  return { V, H };
}

// [PI, PT, SS, LL L1-S1, PI - LL] in degrees, or null with one of the four measured angles absent.
export function alignment(study) {
  const m = study?.measurements;
  if (!m || typeof m !== 'object') return null;
  const ll = m.LL?.['L1-S1'];
  if (![m.PI, m.PT, m.SS, ll].every(finite)) return null;
  return [m.PI, m.PT, m.SS, ll, m.PI - ll];
}

function unitList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(finite) ? value : null;
}

// The stored records keyed by id: renderer/embeddings.js's Map, or a plain object in tests.
function embeddingOf(embeddings, id) {
  if (!embeddings) return null;
  return embeddings instanceof Map ? (embeddings.get(id) ?? null) : (embeddings[id] ?? null);
}

// One study's five blocks, from its record and its stored embedding (or null).
export function blocks(study, embedding) {
  const shape = vector(study);
  const crop = unitList(embedding?.crop);
  return {
    V: shape ? shape.V : null,
    H: shape ? shape.H : null,
    A: alignment(study),
    C: crop,
    W: crop ? unitList(embedding?.whole) : null,
    filmType: embedding?.filmType ?? null,
    model: typeof embedding?.model?.onnx_sha256 === 'string' ? embedding.model.onnx_sha256 : null,
  };
}

function euclid(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function shapeDistance(a, b) {
  return euclid(a, b);
}

export function pelvicDistance(a, b) {
  return euclid(a, b);
}

export function alignmentDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < ALIGNMENT_WEIGHTS.length; i += 1) {
    const d = a[i] - b[i];
    sum += ALIGNMENT_WEIGHTS[i] * d * d;
  }
  return Math.sqrt(sum);
}

// 1 - cosine over unit vectors, floored at 0 for float noise.
export function appearanceDistance(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return Math.max(0, 1 - dot);
}

// Every block distance the pair shares under the mode's weights, or null per block (spec 7.4): H
// needs a hip on both, A the four angles on both, C and W the same model on both, W two whole-spine films.
export function pairDistances(open, candidate, mode) {
  const w = MODES[mode] ?? MODES.all;
  const sameModel = open.model !== null && open.model === candidate.model;
  const both = (key) => open[key] !== null && candidate[key] !== null;
  return {
    V: w.V && both('V') ? shapeDistance(open.V, candidate.V) : null,
    H: w.H && both('H') ? pelvicDistance(open.H, candidate.H) : null,
    A: w.A && both('A') ? alignmentDistance(open.A, candidate.A) : null,
    C: w.C && sameModel && both('C') ? appearanceDistance(open.C, candidate.C) : null,
    W: w.W && sameModel && both('W') && open.filmType === 'whole-spine' && candidate.filmType === 'whole-spine'
      ? appearanceDistance(open.W, candidate.W) : null,
  };
}

// The median of the present values when there are at least three and it is positive, else 1.
export function medianScale(values) {
  const present = (values ?? []).filter(finite);
  if (present.length < 3) return 1;
  const sorted = [...present].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return median > 0 ? median : 1;
}

// sqrt(sum w_i (d_i / m_i)^2 / sum w_i) over the present, weighted blocks; null with none. `weights`
// is a { V, H, A, C, W } table -- one of MODES today, a user's own sliders in a later stage -- so
// changing what counts is a table, never a code path.
export function fuse(distances, scales, weights) {
  const w = weights ?? MODES.all;
  let sum = 0;
  let weight = 0;
  const present = [];
  for (const key of BLOCK_KEYS) {
    const d = distances[key];
    if (!w[key] || !finite(d)) continue;
    const scaled = d / (finite(scales?.[key]) && scales[key] > 0 ? scales[key] : 1);
    sum += w[key] * scaled * scaled;
    weight += w[key];
    present.push(key);
  }
  if (weight === 0) return null;
  return { d: Math.sqrt(sum / weight), blocks: present };
}

export function matchScore(d) {
  return Math.max(0, Math.min(100, Math.round(100 * Math.exp(-d))));
}

function rootOf(study) {
  return typeof study.workspaceFolder === 'string' && study.workspaceFolder !== '' ? study.workspaceFolder : HAND_ADDED;
}

// Spec 7.5: real, not self, full coverage, in scope, not the same subject, and with an embedding
// when the mode needs one.
export function candidates(open, all, { scope = 'all', mode = 'all', embeddings = {} } = {}) {
  const openKey = subjectKey(open);
  const filters = { workspace: rootOf(open), folder: null };
  return (all ?? []).filter((c) => c && c.source === 'real' && c.id !== open.id
    && vector(c) !== null
    && (scope !== 'workspace' || matchesLocation(c, filters))
    && !(openKey !== null && subjectKey(c) === openKey)
    && (!needsEmbedding(mode) || unitList(embeddingOf(embeddings, c.id)?.crop) !== null));
}

// { matches: [{ study, d, match, blocks }], total, stale }. `stale` counts candidates whose stored
// embedding came from another graph than the open study's (spec 11): under all they rank on the
// other blocks, under appearance they have none and are dropped; either way the tab says so.
export function findSimilar(open, all, { scope = 'all', mode = 'all', embeddings = {}, n = 5 } = {}) {
  const openBlocks = blocks(open, embeddingOf(embeddings, open.id));
  const pool = candidates(open, all, { scope, mode, embeddings });
  const entries = pool.map((study) => {
    const b = blocks(study, embeddingOf(embeddings, study.id));
    return { study, b, distances: pairDistances(openBlocks, b, mode) };
  });
  const scales = {};
  for (const key of BLOCK_KEYS) scales[key] = medianScale(entries.map((e) => e.distances[key]));
  const ranked = [];
  let stale = 0;
  for (const entry of entries) {
    if (needsEmbedding(mode) && entry.b.model !== null && openBlocks.model !== null && entry.b.model !== openBlocks.model) stale += 1;
    const fused = fuse(entry.distances, scales, MODES[mode] ?? MODES.all);
    if (!fused) continue;
    ranked.push({ study: entry.study, d: fused.d, match: matchScore(fused.d), blocks: fused.blocks });
  }
  ranked.sort((a, b) => (a.d - b.d) || (a.study.id < b.study.id ? -1 : a.study.id > b.study.id ? 1 : 0));
  return { matches: ranked.slice(0, n), total: ranked.length, stale };
}

// Why the tab shows no cards for the open study, or null (spec 8.4).
export function openReason(open, mode, embeddings) {
  if (!open || open.measurements == null || open.geometry == null) return 'unsegmented';
  if (vector(open) === null) return 'partial';
  if (needsEmbedding(mode) && unitList(embeddingOf(embeddings, open.id)?.crop) === null) return 'no-embedding';
  if (mode === 'alignment' && alignment(open) === null) return 'no-alignment';
  return null;
}

function angleOf(study, key) {
  const m = study?.measurements;
  if (!m) return null;
  const value = key === 'LL' ? m.LL?.['L1-S1'] : m[key];
  return finite(value) ? value : null;
}

// The card's third line (spec 8.2): the candidate's angle minus the open study's, whole degrees with
// a sign, a dash where either side is absent. A difference between two films, never a delta.
export function angleLine(open, candidate) {
  return ['PI', 'LL', 'PT', 'SS'].map((key) => {
    const a = angleOf(open, key);
    const b = angleOf(candidate, key);
    if (a === null || b === null) return `${key} ${DASH}`;
    const diff = Math.round(b - a);
    const text = diff > 0 ? `+${diff}` : diff < 0 ? `${MINUS}${Math.abs(diff)}` : '0';
    return `${key} ${text}`;
  }).join(SEP);
}

// The real films sharing the study's subject key, in library order, or the study alone.
export function subjectFilms(study, all) {
  const key = subjectKey(study);
  if (key === null) return [study];
  return (all ?? []).filter((s) => s.source === 'real' && subjectKey(s) === key);
}
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `node --test test/similarity.test.js`
Expected: PASS, all fourteen. If `subjectKey` in `data/parameters.js` trims and lower-cases (it does: `subjectKey(study)` at `parameters.js:130`), the `' s001 '` case passes; if a test's expected order differs by one because `medianScale` scales differently than the executor's mental model, the ranking test's asserted order is normative and the module is what changes.

- [ ] **Step 5: Run the whole unit suite and commit (with Task 2 if it is uncommitted)**

Run: `node --test test/*.test.js > tools/smoke/out/b3-unit.txt 2>&1`
Expected: PASS.

```bash
git add renderer/data/similarity.js test/similarity.test.js
git commit -F tools/smoke/out/b3-commit.txt
```

Message: `feat: the fused similarity ranking — shape, hip, alignment and appearance blocks` + the trailer.

---

### Task 4: `renderer/data/outcomes.js`, the three known fields, and the drawer's outcome cells

**Files:**
- Create: `renderer/data/outcomes.js`
- Modify: `renderer/data/csv.js:218-221` (`KNOWN_FIELDS`), `:328-353` (`autoMap`), `:428-482` (`joinClinical`'s copy)
- Modify: `renderer/components/clinical-data.js:398-432` (the clinical cell in `buildGrid`), `styles/screens/analysis.css` (after `.clinical-cell`)
- Test: `test/outcomes.test.js` (new), `test/csv.test.js`

**Interfaces:**
- Consumes: `FILM_DATE`, `compareTimepoints` from `data/timepoints.js`; `normalizeFieldName`, `KNOWN_FIELDS` in `csv.js`.
- Produces (binding on Tasks 6, 9):
  - `OUTCOMES` (one entry: `{ key: 'fusionExtension', field: 'Fusion extension', dateField: 'Fusion extension date', primary: true, cardYes: 'Fusion extended', cardNo: 'Fusion not extended', footer: 'WITH A FUSION EXTENSION' }`), `FOLLOW_UP_FIELD = 'Last follow-up'`, `OUTCOME_FIELDS` (the registry's fields and date fields, then the follow-up), `primaryOutcome()`, `isOutcomeField(name)`, `isOutcomeDateField(name)`.
  - `normaliseOutcomeValue(text) -> 'Yes' | 'No' | the trimmed text`; `recognisedOutcome(value) -> 'Yes' | 'No' | null`; `recognisedDate(value) -> 'YYYY-MM-DD' | null`.
  - `resolveOutcomes(films, registry = OUTCOMES) -> { <key>: { status, date }, lastFollowUp }` with `status` in `'yes' | 'no' | 'not-recorded' | 'conflicting'`.
  - `outcomeLine(resolved, outcome = primaryOutcome()) -> string`; `footerLine(statuses, outcome = primaryOutcome()) -> string`.
  - `KNOWN_FIELDS` is twelve names; `autoMap` matches longest first; `joinClinical` normalises an outcome field's value.

- [ ] **Step 1: Write the failing tests**

Create `test/outcomes.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTCOMES, FOLLOW_UP_FIELD, OUTCOME_FIELDS, primaryOutcome, isOutcomeField, isOutcomeDateField,
  normaliseOutcomeValue, recognisedOutcome, recognisedDate, resolveOutcomes, outcomeLine, footerLine,
} from '../renderer/data/outcomes.js';
import { KNOWN_FIELDS, autoMap, joinClinical } from '../renderer/data/csv.js';

const film = (timepoint, clinical) => ({ id: 'SP-1', source: 'real', subjectId: 'S001', timepoint, clinical });

test('the registry has one primary outcome, and the known fields carry its two fields and the follow-up last', () => {
  assert.equal(OUTCOMES.length, 1);
  assert.equal(primaryOutcome().key, 'fusionExtension');
  assert.deepEqual(OUTCOME_FIELDS, ['Fusion extension', 'Fusion extension date', 'Last follow-up']);
  assert.deepEqual(KNOWN_FIELDS.slice(-3), OUTCOME_FIELDS);
  assert.equal(KNOWN_FIELDS.length, 12);
  assert.equal(isOutcomeField('Fusion extension'), true);
  assert.equal(isOutcomeField('Fusion extension date'), false);
  assert.equal(isOutcomeDateField('Fusion extension date'), true);
  assert.equal(isOutcomeDateField(FOLLOW_UP_FIELD), true);
  assert.equal(isOutcomeDateField('Age'), false);
});

test('values: Yes and No are recognised in their common spellings, anything else is kept as typed and not recognised', () => {
  for (const yes of ['Yes', 'yes', ' Y ', 'TRUE', '1']) assert.equal(normaliseOutcomeValue(yes), 'Yes');
  for (const no of ['No', 'n', 'false', '0']) assert.equal(normaliseOutcomeValue(no), 'No');
  assert.equal(normaliseOutcomeValue(' maybe '), 'maybe');
  assert.equal(normaliseOutcomeValue(null), '');
  assert.equal(recognisedOutcome('Yes'), 'Yes');
  assert.equal(recognisedOutcome('maybe'), null);
  assert.equal(recognisedDate('2025-03-14'), '2025-03-14');
  assert.equal(recognisedDate(' 2025-03-14 '), '2025-03-14');
  assert.equal(recognisedDate('14/03/2025'), null);
  assert.equal(recognisedDate(null), null);
});

test('resolveOutcomes: every row of the status table, the first date in timepoint order, the latest follow-up', () => {
  const none = resolveOutcomes([film('Pre-op', {}), film('Post-op', {})]);
  assert.deepEqual(none, { fusionExtension: { status: 'not-recorded', date: null }, lastFollowUp: null });
  const yes = resolveOutcomes([
    film('Post-op', { 'Fusion extension': 'Yes', 'Fusion extension date': '2026-01-10', 'Last follow-up': '2026-06-01' }),
    film('Pre-op', { 'Fusion extension': 'Yes', 'Last follow-up': '2025-01-01' }),
  ]);
  assert.deepEqual(yes, { fusionExtension: { status: 'yes', date: '2026-01-10' }, lastFollowUp: '2026-06-01' });
  const no = resolveOutcomes([film('Pre-op', { 'Fusion extension': 'No' }), film('Post-op', { 'Last follow-up': '2026-02-02' })]);
  assert.deepEqual(no, { fusionExtension: { status: 'no', date: null }, lastFollowUp: '2026-02-02' });
  const conflicting = resolveOutcomes([film('Pre-op', { 'Fusion extension': 'Yes' }), film('Post-op', { 'Fusion extension': 'No' })]);
  assert.equal(conflicting.fusionExtension.status, 'conflicting');
  const unrecognised = resolveOutcomes([film('Pre-op', { 'Fusion extension': 'maybe', 'Fusion extension date': 'soon' })]);
  assert.deepEqual(unrecognised.fusionExtension, { status: 'not-recorded', date: null });
  // A film with no timepoint sorts after the labelled ones for the date pick.
  const dated = resolveOutcomes([film(null, { 'Fusion extension': 'Yes', 'Fusion extension date': '2027-01-01' }), film('Post-op', { 'Fusion extension': 'Yes', 'Fusion extension date': '2026-01-01' })]);
  assert.equal(dated.fusionExtension.date, '2026-01-01');
  assert.deepEqual(resolveOutcomes([]), { fusionExtension: { status: 'not-recorded', date: null }, lastFollowUp: null });
});

test('the registry is generic: a second outcome registered in the test resolves the same way', () => {
  const registry = [...OUTCOMES, { key: 'rodFracture', field: 'Rod fracture', dateField: 'Rod fracture date', primary: false, cardYes: 'Rod fractured', cardNo: 'No rod fracture', footer: 'WITH A ROD FRACTURE' }];
  const resolved = resolveOutcomes([film('Post-op', { 'Fusion extension': 'No', 'Rod fracture': 'Yes', 'Rod fracture date': '2026-03-03' })], registry);
  assert.deepEqual(resolved.rodFracture, { status: 'yes', date: '2026-03-03' });
  assert.deepEqual(resolved.fusionExtension, { status: 'no', date: null });
  assert.equal(outcomeLine(resolved, registry[1]), 'Rod fractured \u00B7 2026-03-03');
  assert.equal(footerLine(['yes', 'no', 'not-recorded'], registry[1]), '1 OF 3 WITH A ROD FRACTURE \u00B7 1 NOT RECORDED');
});

test('outcomeLine and footerLine read the primary outcome and its registry copy', () => {
  assert.equal(outcomeLine({ fusionExtension: { status: 'yes', date: '2025-03-14' }, lastFollowUp: null }), 'Fusion extended \u00B7 2025-03-14');
  assert.equal(outcomeLine({ fusionExtension: { status: 'yes', date: null }, lastFollowUp: null }), 'Fusion extended');
  assert.equal(outcomeLine({ fusionExtension: { status: 'no', date: null }, lastFollowUp: '2026-01-10' }), 'Fusion not extended \u00B7 last follow-up 2026-01-10');
  assert.equal(outcomeLine({ fusionExtension: { status: 'no', date: null }, lastFollowUp: null }), 'Fusion not extended');
  assert.equal(outcomeLine({ fusionExtension: { status: 'not-recorded', date: null }, lastFollowUp: null }), 'Outcome not recorded');
  assert.equal(outcomeLine({ fusionExtension: { status: 'conflicting', date: null }, lastFollowUp: null }), 'Outcome conflicting');
  assert.equal(footerLine(['yes', 'yes', 'no', 'not-recorded', 'conflicting']), '2 OF 5 WITH A FUSION EXTENSION \u00B7 2 NOT RECORDED');
  assert.equal(footerLine(['yes', 'no']), '1 OF 2 WITH A FUSION EXTENSION');
  assert.equal(footerLine([]), '0 OF 0 WITH A FUSION EXTENSION');
});

test('autoMap matches the longest known name first, so fusion_extension_date is the date field', () => {
  assert.deepEqual(autoMap(['fusion_extension_date', 'Fusion extension', 'last_follow_up', 'follow_up_months']), [
    { src: 'fusion_extension_date', dest: 'Fusion extension date' },
    { src: 'Fusion extension', dest: 'Fusion extension' },
    { src: 'last_follow_up', dest: 'Last follow-up' },
    { src: 'follow_up_months', dest: 'Follow-up' },
  ]);
  // The nine older names keep their behaviour: none is a prefix of another.
  assert.deepEqual(autoMap(['odi_base', 'age_yrs', 'STUDY_ID']), [
    { src: 'odi_base', dest: 'ODI' }, { src: 'age_yrs', dest: 'Age' }, { src: 'STUDY_ID', dest: null },
  ]);
});

test('joinClinical normalises an outcome field on the way in and leaves other fields as typed', () => {
  const join = joinClinical({
    files: ['C:\\films\\a.png'], headers: ['study_id', 'fusion', 'dx'],
    rows: [{ study_id: 'a', fusion: ' y ', dx: ' Scoliosis ' }],
    mapping: [{ src: 'study_id', dest: null }, { src: 'fusion', dest: 'Fusion extension' }, { src: 'dx', dest: 'Diagnosis' }],
  });
  assert.deepEqual(join.byFile.get('C:\\films\\a.png'), { 'Fusion extension': 'Yes', Diagnosis: 'Scoliosis' });
});
```

- [ ] **Step 2: Run the two suites to verify they fail**

Run: `node --test test/outcomes.test.js test/csv.test.js`
Expected: `outcomes.test.js` fails at import; the csv suite still passes (its new tests are in `outcomes.test.js`).

- [ ] **Step 3: The registry module**

Create `renderer/data/outcomes.js`:

```js
/**
 * Outcomes (similar-cases spec, 2026-09-12, section 9). An outcome is a registered pair of clinical
 * fields -- a Yes/No field naming the event and a date field for when it happened -- stored per
 * film like every clinical value and resolved per subject whenever it is read. `Last follow-up`
 * is one more field, shared by every outcome. Stage 1 registers fusion extension: a reoperation
 * that extended the construct, which captures hardware failure, adjacent-segment disease and
 * proximal junctional kyphosis as one mechanical endpoint. Adding another is one entry here.
 * Pure: imports only data/timepoints.js. data/csv.js reads OUTCOME_FIELDS into KNOWN_FIELDS.
 */
import { FILM_DATE, compareTimepoints } from './timepoints.js';

export const OUTCOMES = Object.freeze([
  Object.freeze({
    key: 'fusionExtension', field: 'Fusion extension', dateField: 'Fusion extension date', primary: true,
    cardYes: 'Fusion extended', cardNo: 'Fusion not extended', footer: 'WITH A FUSION EXTENSION',
  }),
]);
export const FOLLOW_UP_FIELD = 'Last follow-up';
export const OUTCOME_FIELDS = Object.freeze([...OUTCOMES.flatMap((o) => [o.field, o.dateField]), FOLLOW_UP_FIELD]);

const SEP = ' \u00B7 ';
const YES = new Set(['yes', 'y', 'true', '1']);
const NO = new Set(['no', 'n', 'false', '0']);

export function primaryOutcome() {
  return OUTCOMES.find((o) => o.primary) ?? OUTCOMES[0];
}

export function isOutcomeField(name) {
  return OUTCOMES.some((o) => o.field === name);
}

export function isOutcomeDateField(name) {
  return name === FOLLOW_UP_FIELD || OUTCOMES.some((o) => o.dateField === name);
}

// The import's and the drawer's write rule (spec 9.2): the common spellings become Yes or No;
// anything else is kept as typed, which then counts as not recorded.
export function normaliseOutcomeValue(text) {
  const trimmed = String(text ?? '').trim();
  const key = trimmed.toLowerCase();
  if (YES.has(key)) return 'Yes';
  if (NO.has(key)) return 'No';
  return trimmed;
}

export function recognisedOutcome(value) {
  return value === 'Yes' || value === 'No' ? value : null;
}

export function recognisedDate(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return FILM_DATE.test(trimmed) ? trimmed : null;
}

// Labelled films first in pp 7.2 order, then unlabelled ones, so "the first date" is the earliest visit's.
function byTimepoint(a, b) {
  const aNone = a.timepoint == null || a.timepoint === '';
  const bNone = b.timepoint == null || b.timepoint === '';
  if (aNone !== bNone) return aNone ? 1 : -1;
  return aNone ? 0 : compareTimepoints(a.timepoint, b.timepoint);
}

// Spec 9.3, over the films sharing a subject (or one film alone). One entry per registered outcome
// plus the latest follow-up. `conflicting` and `not-recorded` count as unknown everywhere.
export function resolveOutcomes(films, registry = OUTCOMES) {
  const ordered = [...(films ?? [])].sort(byTimepoint);
  const resolved = {};
  for (const outcome of registry) {
    const values = ordered.map((f) => recognisedOutcome(f?.clinical?.[outcome.field])).filter((v) => v !== null);
    let status = 'not-recorded';
    if (values.length > 0) {
      status = values.every((v) => v === 'Yes') ? 'yes' : values.every((v) => v === 'No') ? 'no' : 'conflicting';
    }
    const date = ordered.map((f) => recognisedDate(f?.clinical?.[outcome.dateField])).find((d) => d !== null) ?? null;
    resolved[outcome.key] = { status, date };
  }
  const followUps = ordered.map((f) => recognisedDate(f?.clinical?.[FOLLOW_UP_FIELD])).filter((d) => d !== null).sort();
  resolved.lastFollowUp = followUps.length > 0 ? followUps[followUps.length - 1] : null;
  return resolved;
}

// The card's fourth line (spec 8.2), from the registry entry's own wording.
export function outcomeLine(resolved, outcome = primaryOutcome()) {
  const entry = resolved?.[outcome.key] ?? { status: 'not-recorded', date: null };
  if (entry.status === 'yes') return entry.date ? `${outcome.cardYes}${SEP}${entry.date}` : outcome.cardYes;
  if (entry.status === 'no') return resolved.lastFollowUp ? `${outcome.cardNo}${SEP}last follow-up ${resolved.lastFollowUp}` : outcome.cardNo;
  if (entry.status === 'conflicting') return 'Outcome conflicting';
  return 'Outcome not recorded';
}

// The footer (spec 8.3): a count of recorded facts about the cards on screen, never a rate.
export function footerLine(statuses, outcome = primaryOutcome()) {
  const list = statuses ?? [];
  const yes = list.filter((s) => s === 'yes').length;
  const unknown = list.filter((s) => s === 'not-recorded' || s === 'conflicting').length;
  return `${yes} OF ${list.length} ${outcome.footer}${unknown > 0 ? `${SEP}${unknown} NOT RECORDED` : ''}`;
}
```

- [ ] **Step 4: `csv.js` — the twelve names, longest-first, normalised import**

In `renderer/data/csv.js`, add to its imports: `import { OUTCOME_FIELDS, isOutcomeField, normaliseOutcomeValue } from './outcomes.js';`

Replace the `KNOWN_FIELDS` export with:

```js
// The nine names the contract fixed, then the outcome registry's fields and the follow-up
// (similar-cases spec, 2026-09-12, section 9.1) -- appended, so no existing export column moves.
export const KNOWN_FIELDS = ['Age', 'Sex', 'BMI', 'Diagnosis', 'ODI',
  'Treatment plan', 'Surgical history', 'Follow-up', 'Notes', ...OUTCOME_FIELDS];
```

In `autoMap`, replace the `known` line so the longest normalised name is tried first (`reoperation`-style prefixes cannot steal a longer sibling's column):

```js
  const known = KNOWN_FIELDS.map((field) => ({ field, key: normalizeFieldName(field) }))
    .sort((a, b) => b.key.length - a.key.length);
```

In `joinClinical`, replace the copy loop's assignment:

```js
    for (const m of mapped) {
      const raw = String(row[m.src] ?? '').trim();
      const value = isOutcomeField(m.dest) ? normaliseOutcomeValue(raw) : raw;
      if (value !== '') clinical[m.dest] = value;
    }
```

- [ ] **Step 5: The drawer's outcome cells**

In `renderer/components/clinical-data.js`, import `{ isOutcomeField, isOutcomeDateField, normaliseOutcomeValue, recognisedDate }` from `'../data/outcomes.js'`. In `buildGrid`, replace the `...fields.map((name) => el('input', {...}))` expression inside `rows` with `...fields.map((name) => clinicalCell(study, name, isDemo))`, and add this builder beside `studyCell`:

```js
  // One clinical cell. An outcome field is a select over blank, Yes and No (spec 9.2), keeping an
  // unrecognised stored value as a fourth option so it is never silently lost; a date field is a
  // text cell flagged while its text is not YYYY-MM-DD; every other field is the text cell it was.
  // All three carry the same class and data attributes, so the rebuild's focus and typing restore
  // treat them alike (a select has no caret; the restore skips it).
  function clinicalCell(study, name, isDemo) {
    const stored = study.clinical?.[name] != null ? String(study.clinical[name]) : '';
    const shared = {
      class: 'clinical-cell',
      'aria-label': `${studyName(study)} ${name}`,
      'data-focus-key': `cell:${study.id}:${name}`,
      'data-study-id': study.id,
      'data-field': name,
      'data-kind': 'clinical',
      disabled: isDemo,
      title: isDemo ? DEMO_TITLE : undefined,
    };
    if (isOutcomeField(name)) {
      const select = el('select', {
        ...shared,
        class: 'clinical-cell clinical-cell-select',
        onChange: (event) => {
          const value = normaliseOutcomeValue(event.target.value);
          queueMicrotask(() => setValue(study.id, name, value));
        },
      },
        el('option', { value: '' }, '\u2014'),
        el('option', { value: 'Yes' }, 'Yes'),
        el('option', { value: 'No' }, 'No'),
        stored !== '' && stored !== 'Yes' && stored !== 'No' ? el('option', { value: stored }, `${stored} (not recognised)`) : null);
      select.value = stored;
      return select;
    }
    const isDate = isOutcomeDateField(name);
    const invalid = isDate && stored !== '' && recognisedDate(stored) === null;
    return el('input', {
      ...shared,
      type: 'text',
      class: `clinical-cell${isDate ? ' clinical-cell-outcome-date' : ''}${invalid ? ' clinical-cell-invalid' : ''}`,
      value: stored,
      placeholder: isDate ? 'YYYY-MM-DD' : '\u2014',
      title: isDemo ? DEMO_TITLE : (invalid ? 'Enter a date as YYYY-MM-DD; this value is not counted' : (isDate ? 'YYYY-MM-DD' : undefined)),
      onChange: (event) => {
        const value = event.target.value;
        queueMicrotask(() => setValue(study.id, name, value));
      },
    });
  }
```

The rebuild's typing restore reads `active.value` and `selectionStart` off a `.clinical-cell`; a `<select>` has `value` and no `selectionStart`, which the existing null-caret branch already handles. `setValue` stores the string exactly as given, so the select writes `Yes`/`No` and the date cell writes what was typed (spec 9.2: kept as typed, flagged).

In `styles/screens/analysis.css`, after the `.clinical-cell` rules, add:

```css
/* Outcome cells (similar-cases spec, 2026-09-12, section 9.2): the Yes/No select shares the cell's
   box; a date that is not YYYY-MM-DD is flagged, kept, and not counted. */
.clinical-cell-select { appearance: auto; cursor: pointer; }
.clinical-cell-invalid { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
```

- [ ] **Step 6: Run the suites, then commit**

Run: `node --test test/outcomes.test.js test/csv.test.js test/clinical-data.test.js test/workspace.test.js`
Expected: PASS. If an existing csv test pinned `KNOWN_FIELDS.length` at nine or the exact array, update that assertion to the twelve names (the only intended change).

Run: `node --test test/*.test.js > tools/smoke/out/b4-unit.txt 2>&1`
Expected: PASS.

```bash
git add renderer/data/outcomes.js renderer/data/csv.js renderer/components/clinical-data.js styles/screens/analysis.css test/outcomes.test.js test/csv.test.js
git commit -F tools/smoke/out/b4-commit.txt
```

Message: `feat: the outcome registry — fusion extension, its date and the last follow-up as known fields` + the trailer.

---

### Task 5: `Keep column name` and `Keep all unmapped` on the Workspace mapping card

**Files:**
- Modify: `renderer/data/csv.js` (after `autoMap`: `KEEP_NAME`, `keepColumnName`, `keepUnmapped`, `keepableCount`)
- Modify: `renderer/screens/workspace.js:423-470` (`buildMappingCard`), `styles/screens/workspace.css`
- Test: `test/csv.test.js`

**Interfaces:**
- Consumes: `findJoinHeader`, `findStructuralHeaders`, `normalizeFieldName`, `KNOWN_FIELDS` (`csv.js`); `setAllSelect` (`workspace.js`).
- Produces: `KEEP_NAME = '__keep__'` (the select option's value); `keepColumnName(header) -> string` (trimmed); `keepUnmapped(mapping, headers) -> Mapping[]` (unchanged rows keep their identity); `keepableCount(mapping, headers) -> number`. A `Mapping.dest` may now be any non-empty name.

- [ ] **Step 1: Write the failing tests**

Append to `test/csv.test.js` (add `keepUnmapped, keepableCount, keepColumnName, KEEP_NAME` to its import from `csv.js`):

```js
// Keep column name (similar-cases spec, 2026-09-12, section 9.5).
test('keepUnmapped gives every unmapped header its own name, skips the reserved ones, prefers a free known field, leaves a taken name', () => {
  const headers = ['study_id', 'subject', 'Interbody type', ' Levels fused ', 'odi_base', 'odi_6mo', 'Age', 'age_at_surgery', ''];
  const mapping = [
    { src: 'study_id', dest: null }, { src: 'subject', dest: null }, { src: 'Interbody type', dest: null },
    { src: ' Levels fused ', dest: null }, { src: 'odi_base', dest: 'ODI' }, { src: 'odi_6mo', dest: null },
    { src: 'Age', dest: null }, { src: 'age_at_surgery', dest: 'Age' }, { src: '', dest: null },
  ];
  const kept = keepUnmapped(mapping, headers);
  assert.deepEqual(kept, [
    { src: 'study_id', dest: null }, { src: 'subject', dest: null }, { src: 'Interbody type', dest: 'Interbody type' },
    { src: ' Levels fused ', dest: 'Levels fused' }, { src: 'odi_base', dest: 'ODI' }, { src: 'odi_6mo', dest: 'odi_6mo' },
    { src: 'Age', dest: null }, { src: 'age_at_surgery', dest: 'Age' }, { src: '', dest: null },
  ]);
  // Unchanged rows keep their identity, so a caller can count what the action would change.
  assert.equal(kept[0], mapping[0]);
  assert.equal(kept[4], mapping[4]);
  assert.equal(keepableCount(mapping, headers), 3);
  assert.equal(keepableCount(kept, headers), 0);
  assert.equal(keepColumnName('  Interbody type '), 'Interbody type');
  assert.equal(KEEP_NAME, '__keep__');
});

test('keepUnmapped takes a free known field for a header that names one, rather than a custom copy', () => {
  const headers = ['study_id', 'diagnosis_text'];
  const mapping = [{ src: 'study_id', dest: null }, { src: 'diagnosis_text', dest: null }];
  assert.deepEqual(keepUnmapped(mapping, headers)[1], { src: 'diagnosis_text', dest: 'Diagnosis' });
});
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `node --test test/csv.test.js`
Expected: FAIL at import (`keepUnmapped` is not exported).

- [ ] **Step 3: The pure helpers**

In `renderer/data/csv.js`, after `autoMap`, add:

```js
// Keep column name (similar-cases spec, 2026-09-12, section 9.5): an unknown spreadsheet column
// imported under its own name as a custom clinical field. The chip select's option value:
export const KEEP_NAME = '__keep__';

export function keepColumnName(header) {
  return String(header ?? '').trim();
}

// The headers the load reads itself -- the join key and the four structural columns -- which are
// never clinical fields and never kept.
function reservedHeaders(headers) {
  return new Set([findJoinHeader(headers ?? []), ...Object.values(findStructuralHeaders(headers ?? []))].filter((h) => h !== null));
}

// The bulk action: every header still unmapped gets its own trimmed name -- unless it names a FREE
// known field (that field instead), or its name is empty, reserved, or already another column's
// destination (left unmapped). Unchanged rows are returned by reference, so a caller can count
// what would change.
export function keepUnmapped(mapping, headers) {
  const reserved = reservedHeaders(headers);
  const taken = new Set((mapping ?? []).filter((m) => m.dest).map((m) => m.dest));
  const known = KNOWN_FIELDS.map((field) => ({ field, key: normalizeFieldName(field) }))
    .sort((a, b) => b.key.length - a.key.length);
  return (mapping ?? []).map((m) => {
    if (m.dest || reserved.has(m.src)) return m;
    const key = normalizeFieldName(m.src);
    const match = key === '' ? undefined : known.find((f) => key === f.key || key.startsWith(f.key));
    const dest = match && !taken.has(match.field) ? match.field : keepColumnName(m.src);
    if (dest === '' || taken.has(dest)) return m;
    taken.add(dest);
    return { src: m.src, dest };
  });
}

export function keepableCount(mapping, headers) {
  const next = keepUnmapped(mapping, headers);
  return next.filter((row, index) => row !== (mapping ?? [])[index]).length;
}
```

- [ ] **Step 4: The mapping card**

In `renderer/screens/workspace.js`, add `KEEP_NAME, keepColumnName, keepUnmapped, keepableCount` to the `csv.js` import. In `buildMappingCard`, replace the chip select's option loop and the `select.value` line with:

```js
      select.append(el('option', { value: '' }, 'Unmapped'));
      for (const field of KNOWN_FIELDS) {
        // A field already claimed by another column is not offered twice.
        const takenElsewhere = mapping.some((other, i) => i !== index && other.dest === field);
        if (takenElsewhere && m.dest !== field) continue;
        select.append(el('option', { value: field }, field));
      }
      // Keep column name (spec 9.5): the header itself as the destination. Offered only when the
      // name is not a known field (those are offered above) and not another column's destination.
      const own = keepColumnName(m.src);
      const ownTaken = mapping.some((other, i) => i !== index && other.dest === own);
      const keeping = m.dest !== null && m.dest === own && !KNOWN_FIELDS.includes(own);
      if (own !== '' && !KNOWN_FIELDS.includes(own) && (!ownTaken || keeping)) {
        select.append(el('option', { value: KEEP_NAME }, `Keep column name (${own})`));
      }
      select.value = keeping ? KEEP_NAME : (m.dest ?? '');
```

and replace the select's `onChange` body's first line with:

```js
          const picked = event.target.value;
          const dest = picked === '' ? null : (picked === KEEP_NAME ? keepColumnName(m.src) : picked);
```

Above the chips, add the bulk controls. Immediately before the chips are placed into the card, build:

```js
    // The bulk action (spec 9.5): every remaining unmapped column under its own name, by the
    // user's hand, with the reminder that an unknown column can be an identifier. Absent at zero.
    const keepable = keepableCount(mapping, live.wsCsvHeaders);
    const bulk = el('div', { class: 'workspace-keep-row' },
      keepable > 0 ? el('button', {
        type: 'button', class: 'btn btn-small', 'data-ws-key': 'keep-all',
        onClick: () => {
          setState((s) => ({ wsMapping: keepUnmapped(s.wsMapping, s.wsCsvHeaders) }));
          refresh();
        },
      }, `Keep ${keepable} unmapped ${keepable === 1 ? 'column' : 'columns'}`) : null,
      keepable > 0 ? el('span', { class: 'workspace-keep-help' },
        'Imports every remaining column under its own name \u2014 check that none is an identifier.') : null,
      setAllSelect({
        key: 'map-all', label: 'Set every column', choices: [], none: 'Unmapped',
        onChange: () => {
          // Clears every destination, kept and known alike; the fixed columns have no select and are untouched.
          setState((s) => {
            const fixed = new Set([findJoinHeader(s.wsCsvHeaders), ...Object.values(findStructuralHeaders(s.wsCsvHeaders))].filter((h) => h !== null));
            return { wsMapping: s.wsMapping.map((row) => (fixed.has(row.src) ? row : { ...row, dest: null })) };
          });
          refresh();
        },
      }));
```

and place `bulk` as the first child of the element that receives `...chips` (the chip container), so it sits above the chips inside the card. `setAllSelect` already exists in this file (the folder table's column-header control) and takes `{ key, label, choices, none, onChange }`; with `choices: []` and `none: 'Unmapped'` it renders `Set all…` and `Unmapped`.

In `styles/screens/workspace.css`, add:

```css
/* The mapping card's bulk row (similar-cases spec, 2026-09-12, section 9.5). */
.workspace-keep-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin-bottom: 8px; }
.workspace-keep-help { font: 400 12px 'Source Sans 3', sans-serif; color: var(--muted); }
```

- [ ] **Step 5: Run the suites, then commit**

Run: `node --test test/csv.test.js test/workspace.test.js`
Expected: PASS.

Manual check (from source, any CSV with an unknown column): the unknown column's chip offers `Keep column name (<header>)`; choosing it turns the chip mapped; `Keep N unmapped columns` sets every remaining one and disappears; `Set all… → Unmapped` clears them; the load then writes the kept column onto `clinical`, and the drawer shows it as a column. Record the check in the ledger.

```bash
git add renderer/data/csv.js renderer/screens/workspace.js styles/screens/workspace.css test/csv.test.js
git commit -F tools/smoke/out/b5-commit.txt
```

Message: `feat: keep an unknown CSV column under its own name, one at a time or all at once` + the trailer.

---

### Task 6: The Find similar tab

**Files:**
- Create: `renderer/components/similar.js`
- Modify: `renderer/store.js` (`similarScope`, `similarRank` after `tab`), `renderer/screens/analysis.js:552-561` (the placeholder host) and `:700-712` (`update()`), `styles/screens/analysis.css` (after `.analysis-similar.is-hidden`)
- Test: `test/store.test.js`; the DOM in Task 10's smoke suite and Task 11's gate

**Interfaces:**
- Consumes: `findSimilar`, `openReason`, `angleLine`, `subjectFilms`, `MODES` (Task 3); `resolveOutcomes`, `outcomeLine`, `footerLine`, `primaryOutcome` (Task 4); `ensureEmbeddings`, `embeddingsMap` (Task 2); `studyName`, `subjectLabel`; `el`, `clear`.
- Produces: `mountSimilar(host) -> { update }`, driven from the Analysis screen's `update()` on every notification, rebuilding only when its key changes; `state.similarScope: 'all' | 'workspace'` (default `'all'`), `state.similarRank: 'all' | 'shape' | 'alignment' | 'appearance'` (default `'all'`); a card click toggles `state.compareId`; every control carries a `data-similar-key`.

- [ ] **Step 1: Write the failing store test**

In `test/store.test.js`'s first test, after the `embeddingsVersion` line, add:

```js
  assert.equal(state.similarScope, 'all');
  assert.equal(state.similarRank, 'all');
```

Run: `node --test test/store.test.js` — Expected: FAIL on `similarScope`.

- [ ] **Step 2: The store keys**

In `renderer/store.js`, after `tab: 'meas',`:

```js
  // (similar-cases spec, 2026-09-12, section 8.1) the Find similar tab's two controls: the scope of
  // the candidates and what the ranking weighs. Session-only, replaced wholesale, never persisted.
  similarScope: 'all',
  similarRank: 'all',
```

Run: `node --test test/store.test.js` — Expected: PASS.

- [ ] **Step 3: The component**

Create `renderer/components/similar.js`:

```js
/**
 * The Find similar tab (similar-cases spec, 2026-09-12, section 8). Mounted by screens/analysis.js
 * into its `.analysis-similar` host and driven from that screen's update() on every store
 * notification, like the measurements panel; a reference-keyed gate decides whether to rebuild.
 * The ranking is data/similarity.js's, the outcomes data/outcomes.js's; the embeddings come from
 * renderer/embeddings.js, loaded the first time the tab is shown (its load bumps
 * state.embeddingsVersion, which is in the key, so the cards fill in when it lands).
 * Every control carries a data-similar-key; the smoke suite keys on those, never on a label.
 */
import { el, clear } from '../dom.js';
import { getState, setState } from '../store.js';
import { findSimilar, openReason, angleLine, subjectFilms, MODES } from '../data/similarity.js';
import { resolveOutcomes, outcomeLine, footerLine, primaryOutcome } from '../data/outcomes.js';
import { studyName, subjectLabel } from '../data/labels.js';
import { ensureEmbeddings, embeddingsMap } from '../embeddings.js';

const DASH = '\u2014';
const SEP = ' \u00B7 ';
const SCOPE_OPTIONS = [['workspace', 'This workspace'], ['all', 'All studies']];
const RANK_OPTIONS = [['all', 'All'], ['shape', 'Shape'], ['alignment', 'Alignment'], ['appearance', 'Appearance']];
const EYEBROW = {
  all: 'RANKED BY SHAPE, ALIGNMENT AND APPEARANCE',
  shape: 'RANKED BY SPINE SHAPE',
  alignment: 'RANKED BY SPINOPELVIC ALIGNMENT',
  appearance: 'RANKED BY APPEARANCE',
};
const EMPTY = {
  unsegmented: 'Segment this study to find similar cases.',
  partial: 'Similar cases need all five lumbar levels and S1; this study\u2019s coverage is partial.',
  'no-embedding': 'No appearance embedding for this study yet \u2014 run Embed on the Find tab, turn on Appearance embeddings in Settings, or rank by shape or alignment.',
  'no-alignment': 'Alignment needs PI, PT, SS and LL; this study is missing one \u2014 rank by shape instead.',
};
// A block the mode asked for that did not enter the distance, named on the card (spec 8.2).
const MISSING = { H: '\u00B7 no hip', A: '\u00B7 no alignment', C: '\u00B7 no appearance', W: '\u00B7 no whole film' };

function sameKey(a, b) {
  return a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i]);
}

export function mountSimilar(host) {
  clear(host);
  const root = el('div', { class: 'similar-tab' });
  host.append(root);
  let lastKey = null;
  let loadRequested = false;

  function segmented(label, key, options, current, onPick) {
    return el('div', { class: 'similar-control' },
      el('div', { class: 'sidebar-models-label' }, label),
      el('div', { class: 'model-choice', role: 'group', 'aria-label': label },
        ...options.map(([value, text]) => el('button', {
          type: 'button', class: 'model-choice-btn', 'data-similar-key': `${key}-${value}`,
          'aria-pressed': current === value ? 'true' : 'false',
          onClick: () => onPick(value),
        }, text))));
  }

  function card(match, open, state, mode) {
    const { study, blocks } = match;
    const resolved = resolveOutcomes(subjectFilms(study, state.studies));
    const status = resolved[primaryOutcome().key].status;
    const active = state.compareId === study.id;
    const missing = ['H', 'A', 'C', 'W']
      .filter((key) => MODES[mode][key] && !blocks.includes(key))
      .map((key) => MISSING[key]).join(' ');
    return el('button', {
      type: 'button',
      class: `similar-card${active ? ' is-active' : ''}`,
      'data-similar-key': `card-${study.id}`,
      'data-study-id': study.id,
      'aria-pressed': active ? 'true' : 'false',
      onClick: () => setState((s) => ({ compareId: s.compareId === study.id ? null : study.id })),
    },
      study.thumbnail
        ? el('img', { class: 'similar-thumb', src: study.thumbnail, alt: '' })
        : el('div', { class: 'similar-thumb similar-thumb-empty', 'aria-hidden': 'true' }),
      el('div', { class: 'similar-body' },
        el('div', { class: 'similar-line similar-line-1' },
          el('span', { class: 'similar-name', title: study.id }, studyName(study)),
          el('span', { class: 'similar-match' }, `${match.match}%`,
            missing ? el('span', { class: 'similar-missing' }, ` ${missing}`) : null)),
        el('div', { class: 'similar-line similar-meta' },
          `${subjectLabel(study)}${SEP}${study.timepoint ?? DASH}${SEP}${study.view || DASH}${study.filmDate ? `${SEP}${study.filmDate}` : ''}`),
        el('div', { class: 'similar-line similar-angles' }, angleLine(open, study)),
        el('div', { class: 'similar-line similar-outcome', 'data-outcome': status }, outcomeLine(resolved)),
        el('div', { class: 'similar-line similar-state eyebrow' },
          active ? 'IN VIEWER \u00B7 CLICK TO REMOVE' : 'CLICK TO COMPARE IN VIEWER')));
  }

  function restore(focusKey) {
    if (focusKey === null) return;
    const target = root.querySelector(`[data-similar-key="${focusKey}"]`);
    if (target) target.focus();
  }

  function update() {
    const state = getState();
    const open = state.studies.find((s) => s.id === state.openId) ?? null;
    if (!open || state.tab !== 'sim') return;
    // The embeddings load once, the first time the tab is shown. The load is async and bumps
    // embeddingsVersion when it lands, which is in the key below, so the cards fill in then.
    if (!loadRequested) {
      loadRequested = true;
      ensureEmbeddings();
    }
    const key = [state.studies, state.openId, state.compareId, state.similarScope, state.similarRank, state.embeddingsVersion];
    if (sameKey(key, lastKey)) return;
    lastKey = key;

    const active = document.activeElement;
    const focusKey = root.contains(active) ? active.getAttribute('data-similar-key') : null;
    clear(root);
    const scope = state.similarScope;
    const mode = state.similarRank;
    root.append(
      segmented('SCOPE', 'scope', SCOPE_OPTIONS, scope, (value) => setState({ similarScope: value })),
      segmented('RANK BY', 'rank', RANK_OPTIONS, mode, (value) => setState({ similarRank: value })),
      el('div', { class: 'eyebrow similar-eyebrow' }, EYEBROW[mode]));

    const embeddings = embeddingsMap();
    const reason = openReason(open, mode, embeddings);
    if (reason) {
      root.append(el('div', { class: 'similar-empty', 'data-similar-key': 'empty' }, EMPTY[reason]));
      restore(focusKey);
      return;
    }
    const { matches, total, stale } = findSimilar(open, state.studies, { scope, mode, embeddings, n: 5 });
    if (matches.length === 0) {
      root.append(el('div', { class: 'similar-empty', 'data-similar-key': 'empty' },
        scope === 'workspace' ? 'No other eligible studies in this workspace.' : 'No other eligible studies in the library.'));
    } else {
      root.append(el('div', { class: 'similar-cards' }, ...matches.map((match) => card(match, open, state, mode))));
      const statuses = matches.map((match) => resolveOutcomes(subjectFilms(match.study, state.studies))[primaryOutcome().key].status);
      root.append(el('div', { class: 'eyebrow similar-footer', 'data-similar-key': 'footer' }, footerLine(statuses)));
      const more = total - matches.length;
      if (more > 0) root.append(el('div', { class: 'eyebrow similar-tail', 'data-similar-key': 'more' }, `${more} MORE ${more === 1 ? 'STUDY' : 'STUDIES'} BELOW`));
    }
    if (stale > 0) {
      root.append(el('div', { class: 'eyebrow similar-tail similar-stale', 'data-similar-key': 'stale' },
        `${stale} ${stale === 1 ? 'STUDY NEEDS' : 'STUDIES NEED'} RE-EMBEDDING`));
    }
    restore(focusKey);
  }

  return { update };
}
```

- [ ] **Step 4: Wire the screen**

In `renderer/screens/analysis.js`: import `{ mountSimilar }` from `'../components/similar.js'`. Replace the placeholder

```js
  const similarHost = el('div', { class: 'analysis-similar is-hidden' },
    'Find similar arrives in a later build.');
```

with `const similarHost = el('div', { class: 'analysis-similar is-hidden' });`. After `const clinical = mountClinicalData(clinicalHost);` add `const similar = mountSimilar(similarHost);`. In `update()`, after `clinical.update();`, add:

```js
    // Same contract again: every notification, its own reference-keyed gate, reads the store itself.
    similar.update();
```

- [ ] **Step 5: The styles**

In `styles/screens/analysis.css`, after `.analysis-similar.is-hidden { display: none; }`, add:

```css
/* ===== 05 — FIND SIMILAR TAB (similar-cases spec, 2026-09-12, section 8) ================= */
.analysis-similar { color: var(--body); }
.similar-tab { display: flex; flex-direction: column; gap: 12px; }
.similar-control .sidebar-models-label { margin-bottom: 4px; }
.similar-cards { display: flex; flex-direction: column; gap: 8px; }
.similar-card {
  display: flex;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: var(--ink);
  font: 400 13px 'Source Sans 3', sans-serif;
  transition: background .15s ease, border-color .15s ease;
}
.similar-card:hover { background: var(--well); }
.similar-card.is-active {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 7%, var(--card));
}
.similar-card:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.similar-thumb { width: 56px; height: 56px; flex-shrink: 0; object-fit: cover; border-radius: 8px; background: var(--well); }
.similar-thumb-empty { border: 1px solid var(--border); }
.similar-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.similar-line-1 { display: flex; align-items: baseline; gap: 8px; }
.similar-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 650; }
.similar-match { font-family: 'Chivo Mono', monospace; font-size: 12px; font-weight: 500; color: var(--ink); white-space: nowrap; }
.similar-missing { color: var(--muted); font-size: 10px; letter-spacing: .08em; }
.similar-meta, .similar-angles { color: var(--muted); font-variant-numeric: tabular-nums; }
.similar-outcome[data-outcome="yes"] { color: var(--accent); }
.similar-outcome[data-outcome="conflicting"] { color: var(--accent); font-style: italic; }
.similar-state { color: var(--muted); }
.similar-card.is-active .similar-state { color: var(--accent); }
.similar-footer { padding-top: 6px; border-top: 1px solid var(--border); color: var(--ink); }
.similar-tail { color: var(--muted); }
.similar-empty { color: var(--muted); font: 400 13px 'Source Sans 3', sans-serif; }
```

- [ ] **Step 6: Run the unit suite, try the tab from source, commit**

Run: `node --test test/*.test.js > tools/smoke/out/b6-unit.txt 2>&1`
Expected: PASS.

From source (Plan A not required: with no backend graph the embeddings map is empty), open any segmented real study, click `Find similar`: the two controls render, `Rank by Shape` lists up to five cards over a library with two or more fully segmented studies, `All` shows the `no-embedding` sentence, a card click marks it `IN VIEWER · CLICK TO REMOVE` (comparison mode itself is Task 8). Record the check in the ledger.

```bash
git add renderer/components/similar.js renderer/store.js renderer/screens/analysis.js styles/screens/analysis.css test/store.test.js
git commit -F tools/smoke/out/b6-commit.txt
```

Message: `feat: the Find similar tab — scope, rank by, five cards with outcomes, the footer count` + the trailer.

---

### Task 7: The `Embed` batch kind and button

**Files:**
- Modify: `renderer/data/batch.js` (`planEmbed`, `newBatch(ids, kind)`, `progressText`, `sidebarText`, `batchMessage`, `createBatchDriver`)
- Modify: `renderer/batch.js`
- Modify: `renderer/screens/analysis.js` (new `embedStudy` beside `segmentStudy`)
- Modify: `renderer/screens/studies.js:772-781` (the segment group), `:835-838` (the update key), `render()` (one `ensureEmbeddings()` call)
- Test: `test/batch.test.js`

**Interfaces:**
- Consumes: `embed(request)` (api, Task 2), `embeddingRecord` (Task 2), `storeEmbedding`, `needsEmbedding`, `ensureEmbeddings` (Task 2), `loadPrediction`, `persistenceDisabledReason`.
- Produces: `planEmbed({ visible, selected, running, needs }) -> { ids, label, note, enabled, hidden }`; `newBatch(ids, kind = 'segment')` with `batch.kind`; `createBatchDriver({ segment, embed, embedNeeded, ... })` whose `startBatch(ids, kind = 'segment')` runs one dependency or the other; `startEmbedBatch(ids)` from `renderer/batch.js`; `embedStudy(studyId, { batch }) -> { ok, warning? } | { ok: false, reason }`, never throws, sets and clears `state.running`.

- [ ] **Step 1: Write the failing tests**

Append to `test/batch.test.js` (add `planEmbed` to its import):

```js
// The Embed batch kind (similar-cases spec, 2026-09-12, section 12).
const needs = (study) => study.id === 'SP-2' || study.id === 'SP-3';

test('planEmbed counts the visible (or ticked visible) real studies that need an embedding, hidden at zero', () => {
  const visible = [segmented('SP-1'), segmented('SP-2'), segmented('SP-3'), demo('SP-0042')];
  assert.deepEqual(planEmbed({ visible, selected: [], running: null, needs }),
    { ids: ['SP-2', 'SP-3'], label: 'Embed 2', note: null, enabled: true, hidden: false });
  assert.deepEqual(planEmbed({ visible, selected: ['SP-3', 'SP-1'], running: null, needs }),
    { ids: ['SP-3'], label: 'Embed 1 selected', note: null, enabled: true, hidden: false });
  assert.deepEqual(planEmbed({ visible, selected: [], running: 'SP-9', needs }),
    { ids: ['SP-2', 'SP-3'], label: 'Embed 2', note: WAIT_FOR_RUN, enabled: false, hidden: false });
  assert.deepEqual(planEmbed({ visible: [segmented('SP-1')], selected: [], running: null, needs }),
    { ids: [], label: 'Embed 0', note: null, enabled: false, hidden: true });
});

test('newBatch carries its kind; progress, sidebar and closing texts read it', () => {
  assert.equal(newBatch(['SP-1']).kind, 'segment');
  const batch = newBatch(['SP-1', 'SP-2', 'SP-3'], 'embed');
  assert.equal(batch.kind, 'embed');
  assert.equal(progressText(batch), 'Embedding 0 of 3');
  assert.equal(sidebarText(batch), 'EMBEDDING 0 OF 3');
  assert.equal(progressText(withStopping(batch)), STOPPING_TEXT);
  let done = advance(batch, { ok: true, id: 'SP-1', name: 'a' });
  done = advance(done, { ok: false, id: 'SP-2', name: 'b', reason: 'no stored segmentation' });
  done = advance(done, { skipped: true });
  assert.equal(batchMessage(done), 'Embedded 1 of 3 films. \u00B7 1 could not be embedded: b (no stored segmentation) \u00B7 1 skipped (deleted, or embedded meanwhile)');
  assert.equal(batchMessage(advance(newBatch(['SP-1'], 'embed'), { ok: true, id: 'SP-1', name: 'a', warning: 'not stored' })),
    'Embedded 1 of 1 film. \u00B7 1 embedded without a stored record: a (not stored)');
});

test('the driver runs the embed dependency for an embed batch and skips studies that no longer need one', async () => {
  let state = { studies: [segmented('SP-1'), segmented('SP-2'), segmented('SP-3')], batch: null, running: null, deletingStudies: false };
  const calls = [];
  const driver = createBatchDriver({
    segment: async (id) => { calls.push(`segment:${id}`); return { ok: true }; },
    embed: async (id) => { calls.push(`embed:${id}`); return id === 'SP-3' ? { ok: false, reason: 'no stored segmentation' } : { ok: true }; },
    embedNeeded: (study) => study.id !== 'SP-1',
    getState: () => state,
    setState: (patch) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; },
    showToast: (text) => calls.push(`toast:${text}`),
    persistenceDisabledReason: () => null,
  });
  assert.equal(await driver.startBatch(['SP-1', 'SP-2', 'SP-3'], 'embed'), true);
  assert.deepEqual(calls, ['embed:SP-2', 'embed:SP-3',
    'toast:Embedded 1 of 3 films. \u00B7 1 could not be embedded: SP-3 (no stored segmentation) \u00B7 1 skipped (deleted, or embedded meanwhile)']);
  assert.equal(state.batch, null);
});
```

If an existing test deep-equals `newBatch(ids)`'s object, add `kind: 'segment'` to its expected value — the only intended change to old tests.

- [ ] **Step 2: Run the suite to verify it fails**

Run: `node --test test/batch.test.js`
Expected: FAIL — `planEmbed` is not exported.

- [ ] **Step 3: The pure changes**

In `renderer/data/batch.js`:

After `planBatch`, add:

```js
// The Embed button (similar-cases spec, 2026-09-12, section 12): the visible (or ticked visible)
// real studies that `needs` says lack a current embedding -- segmented before this build, with the
// setting off, after a failed stage, or under an older graph. Hidden at zero, like nothing else on
// the bar: an absent count is not a state the user has to read.
export function planEmbed({ visible, selected, running, needs }) {
  const real = (visible ?? []).filter((study) => study.source === 'real');
  const chosen = selectedVisible(real, selected);
  const pool = chosen.length > 0 ? chosen : real;
  const ids = pool.filter((study) => needs(study)).map((study) => study.id);
  const label = chosen.length > 0 ? `Embed ${ids.length} selected` : `Embed ${ids.length}`;
  return { ids, label, note: running ? WAIT_FOR_RUN : null, enabled: ids.length > 0 && !running, hidden: ids.length === 0 };
}
```

Replace `newBatch`, `progressText`, `sidebarText` and `batchMessage`:

```js
// The batch object (spec 8.1), with its kind (similar-cases spec section 12): 'segment' or 'embed'.
// Every transition returns a NEW object: the store's gates compare by reference.
export function newBatch(ids, kind = 'segment') {
  return { ids: [...ids], kind, done: 0, failed: [], warnings: [], skipped: 0, stopping: false };
}
```

```js
export function progressText(batch) {
  if (batch.stopping) return STOPPING_TEXT;
  return batch.kind === 'embed' ? `Embedding ${batch.done} of ${batch.ids.length}` : `${batch.done} of ${batch.ids.length} done`;
}

export function sidebarText(batch) {
  if (batch.stopping) return 'STOPPING';
  return batch.kind === 'embed' ? `EMBEDDING ${batch.done} OF ${batch.ids.length}` : `${batch.done} OF ${batch.ids.length} DONE`;
}
```

```js
export function batchMessage(batch) {
  const total = batch.ids.length;
  const ok = batch.done - batch.failed.length - batch.skipped;
  const stopped = batch.stopping && batch.done < total;
  const embed = batch.kind === 'embed';
  let text = `${embed ? 'Embedded' : 'Segmented'} ${ok} of ${total} ${total === 1 ? 'film' : 'films'}${stopped ? ', then stopped' : ''}.`;
  if (batch.failed.length > 0) text += `${SEP}${batch.failed.length} could not be ${embed ? 'embedded' : 'segmented'}: ${names(batch.failed)}`;
  if (batch.warnings.length > 0) {
    text += `${SEP}${batch.warnings.length} ${embed ? 'embedded without a stored record' : 'segmented without stored images'}: ${names(batch.warnings)}`;
  }
  const cancelled = batch.cancelled ?? 0;
  if (cancelled) text += `${SEP}${cancelled} cancelled`;
  if (batch.skipped > cancelled) text += `${SEP}${batch.skipped - cancelled} skipped (deleted, or ${embed ? 'embedded' : 'segmented'} meanwhile)`;
  return text;
}
```

In `createBatchDriver`, take the two new dependencies and branch per kind. Replace its signature and the loop body:

```js
export function createBatchDriver({ segment, embed = null, embedNeeded = () => false, getState, setState, showToast, persistenceDisabledReason }) {
  const identity = new Map();

  async function startBatch(ids, kind = 'segment') {
    const state = getState();
    if (state.batch || state.running || state.deletingStudies || !Array.isArray(ids) || ids.length === 0) return false;
    if (kind === 'embed' && typeof embed !== 'function') return false;
    identity.clear();
    for (const id of ids) {
      const study = state.studies.find((item) => item.id === id);
      identity.set(id, study ? study.addedAt : null);
    }
    setState({ batch: newBatch(ids, kind) });
    if (persistenceDisabledReason()) showToast(UNSAVED_BATCH);
    for (const id of ids) {
      const study = getState().studies.find((item) => item.id === id);
      let outcome;
      if (!study || study.addedAt !== identity.get(id)) {
        outcome = { skipped: true };
      } else if (kind === 'embed') {
        if (!embedNeeded(study)) {
          outcome = { skipped: true };
        } else {
          let result;
          try {
            result = await embed(id);
          } catch (error) {
            result = { ok: false, reason: error && error.message ? error.message : String(error) };
          }
          outcome = { ...result, id, name: studyName(study) };
        }
      } else if (study.measurements != null) {
        outcome = { skipped: true };
      } else if (!inferenceView(study.view)) {
        outcome = { ok: false, id, name: studyName(study), reason: unsupportedViewReason(study.view) };
      } else {
        let result;
        try {
          result = await segment(id);
        } catch (error) {
          result = { ok: false, reason: error && error.message ? error.message : String(error) };
        }
        outcome = { ...result, id, name: studyName(study) };
      }
      setState((current) => ({ batch: advance(current.batch, outcome) }));
      if (getState().batch.stopping) break;
    }
    const finished = getState().batch;
    setState({ batch: null });
    showToast(batchMessage(finished));
    return true;
  }
```

`stopBatch` and the return are unchanged.

- [ ] **Step 4: The run core**

In `renderer/screens/analysis.js`, add `embed` to the `api.js` import, `{ embeddingRecord }` from `'../data/embeddings.js'` (already imported in Task 2) and `{ storeEmbedding }` (already imported). After `segmentStudy`, add:

```js
// The Embed batch's run core (similar-cases spec, 2026-09-12, section 12): the stored sidecar's
// image and framing to /embed, the record to embeddings/<id>.json. Sets and clears state.running
// like a segmentation, so every surface that reads `running` stays right; never reads the film
// file (the sidecar's image is the whole film). Returns an outcome and never throws.
export async function embedStudy(studyId, { batch = false } = {}) {
  const study = getState().studies.find((s) => s.id === studyId);
  if (!study) return { ok: false, reason: 'The study is no longer in the library.' };
  if (getState().running) return { ok: false, reason: WAIT_FOR_RUN };
  if (!batch && getState().batch) return { ok: false, reason: WAIT_FOR_BATCH };
  const addedAt = study.addedAt;
  let sidecar = null;
  try {
    sidecar = persistenceDisabledReason() ? null : await loadPrediction(studyId);
  } catch (error) {
    return { ok: false, reason: `the stored segmentation could not be read: ${error.message}` };
  }
  if (!sidecar || typeof sidecar.image_png !== 'string' || sidecar.image_png === '') {
    return { ok: false, reason: 'no stored segmentation' };
  }
  const live = getState().studies.find((s) => s.id === studyId);
  if (!live || live.addedAt !== addedAt) return { ok: false, reason: 'The study is no longer in the library.' };
  if (getState().running || getState().deletingStudies) return { ok: false, reason: WAIT_FOR_RUN };
  const requestId = crypto.randomUUID();
  setState({ running: studyId, runStage: { requestId, mode: getState().performance.mode,
    stage: 'embedding', message: 'Computing appearance embedding', elapsed_seconds: 0, kind: 'embed' } });
  try {
    const response = await embed({ id: studyId, imagePng: sidecar.image_png, framing: sidecar.qc?.framing ?? null });
    const after = getState().studies.find((s) => s.id === studyId);
    if (!after || after.addedAt !== addedAt) {
      setState({ running: null, runStage: null });
      return { ok: false, reason: 'The study is no longer in the library.' };
    }
    const record = embeddingRecord(studyId, response?.embedding ?? null,
      { sourceSha256: after.calibration?.source_sha256 ?? null });
    if (!record) throw new Error('The backend returned no embedding.');
    let warning = null;
    if (persistenceDisabledReason()) {
      warning = 'not stored: studies are not being saved this session';
    } else {
      await storeEmbedding(record);
    }
    setState({ running: null, runStage: null });
    return warning ? { ok: true, warning } : { ok: true };
  } catch (error) {
    setState({ running: null, runStage: null });
    if (!batch) showToast(`Could not embed: ${error.message}`);
    return { ok: false, reason: error.message };
  }
}
```

`WAIT_FOR_RUN` joins `WAIT_FOR_BATCH` in the `data/batch.js` import.

- [ ] **Step 5: The wiring and the button**

`renderer/batch.js`, replace the file body:

```js
import { getState, setState } from './store.js';
import { showToast } from './components/toast.js';
import { persistenceDisabledReason } from './api.js';
import { segmentStudy, embedStudy } from './screens/analysis.js';
import { needsEmbedding } from './embeddings.js';
import { createBatchDriver } from './data/batch.js';

const driver = createBatchDriver({
  segment: (studyId) => segmentStudy(studyId, { batch: true }),
  // The Embed kind (similar-cases spec, 2026-09-12, section 12): the same loop, the other run core.
  embed: (studyId) => embedStudy(studyId, { batch: true }),
  embedNeeded: needsEmbedding,
  getState,
  setState,
  showToast,
  persistenceDisabledReason,
});

export const startBatch = (ids) => driver.startBatch(ids, 'segment');
export const startEmbedBatch = (ids) => driver.startBatch(ids, 'embed');
export const stopBatch = driver.stopBatch;
```

`renderer/screens/studies.js`: import `planEmbed` from `'../data/batch.js'`, `startEmbedBatch` from `'../batch.js'`, `{ ensureEmbeddings, needsEmbedding }` from `'../embeddings.js'`. In `buildFilterBar`'s non-batch branch, build the Embed button beside Segment:

```js
      const plan = planBatch({ visible, selected: live.paramSelected, running: live.running });
      const embedPlan = planEmbed({ visible, selected: live.paramSelected, running: live.running, needs: needsEmbedding });
      action = el('div', { class: 'param-export-group' },
        el('button', {
          type: 'button', class: 'btn btn-primary btn-small', 'data-find-key': 'segment',
          disabled: !plan.enabled,
          title: plan.enabled ? '' : (plan.note ?? ''),
          onClick: () => startBatch(plan.ids),
        }, plan.label),
        plan.note ? el('span', { class: 'param-export-note', 'data-find-key': 'segment-note' }, plan.note) : null,
        embedPlan.hidden ? null : el('button', {
          type: 'button', class: 'btn btn-small', 'data-find-key': 'embed',
          disabled: !embedPlan.enabled,
          title: embedPlan.enabled ? 'Compute the appearance embeddings the Find similar tab ranks by' : (embedPlan.note ?? ''),
          onClick: () => startEmbedBatch(embedPlan.ids),
        }, embedPlan.label));
```

Add `live.embeddingsVersion` to `update()`'s `key` array (after `live.findSort`), and in `render()` — once, before the first `update(state)` — call `ensureEmbeddings();` (async, not awaited: its bump re-runs `update` through the subscription when the map has loaded).

- [ ] **Step 6: Run the suites, then commit**

Run: `node --test test/batch.test.js test/processing.test.js`
Expected: PASS (`processing.test.js` constructs a driver too).

Run: `node --test test/*.test.js > tools/smoke/out/b7-unit.txt 2>&1`
Expected: PASS.

With Plan A in the tree and the graph exported, from source: segment one film with `Appearance embeddings` off, then turn it on — the Find tab shows `Embed 1`; click it; the bar reads `Embedding 0 of 1` then the toast `Embedded 1 of 1 film.`; `embeddings/SP-nnnn.json` appears in the scratch profile. Record in the ledger.

```bash
git add renderer/data/batch.js renderer/batch.js renderer/screens/analysis.js renderer/screens/studies.js test/batch.test.js
git commit -F tools/smoke/out/b7-commit.txt
```

Message: `feat: an Embed batch fills the embeddings of films segmented without one` + the trailer.

---

### Task 8: Comparison mode — plan 07's Tasks 3–6, adapted

**Files:**
- Modify: `renderer/components/viewer.js` (`mountViewer(container, { role })`; the role-aware study, view state, toolbar, card, chip, handlers)
- Modify: `renderer/components/measurements.js` (`updateMeasurements(study, other)`)
- Modify: `renderer/components/clinical-data.js:107-110` (`visibleStudies`)
- Modify: `renderer/screens/analysis.js` (the second pane, its film, the badge, the panel width, `compareId` hygiene)
- Modify: `renderer/screens/studies.js` (every writer of `openId` also writes `compareId: null`; the single-delete site nulls it)
- Modify: `styles/screens/analysis.css`
- Test: `test/measurements.test.js` (if it exists; else `test/analysis.test.js`) for `deltaRow` usage is already pinned in `test/measurements.test.js` — the DOM is Task 10's smoke and Task 11's gate

**Interfaces:**
- Consumes: `deltaRow` (`data/measurements.js`, already exported), `loadStudyImages`, `disposeStudyImages`, `loadPrediction`, `findSimilar` (Task 3), `embeddingsMap` (Task 2), `state.compareId`.
- Produces: `mountViewer(container, { role = 'primary' })` where `role: 'compare'` draws `state.compareId`, is read-only, keeps its own zoom and pan, and shows a chip with the id, the match and a close control; `updateViewer(study, { match = null } = {})`; `mountMeasurements(container).updateMeasurements(study, other = null)`; the drawer shows two rows in comparison mode; the header shows `COMPARING · {id}`; the panel is 440 px in comparison mode.

This is the plan's one large DOM task. The behaviour below is normative; where `viewer.js`'s internals differ from the anchors named, adapt the call site and keep the behaviour.

- [ ] **Step 1: `viewer.js` — the role**

1. Signature: `export function mountViewer(container, { role = 'primary' } = {})`.
2. The study: the module-level `currentStudy()` (line ~129, reading `state.openId`) becomes role-aware. Inside `mountViewer`, define
   ```js
   function currentStudy() {
     const state = getState();
     const id = role === 'compare' ? state.compareId : state.openId;
     const study = state.studies.find((s) => s.id === id) ?? null;
     const draft = role === 'primary' ? state.measurementDrafts?.[id] : null;
     return study && draft ? { ...study, geometry: draft } : study;
   }
   ```
   and delete the module-level function once `grep -n "currentStudy" renderer/components/viewer.js` shows every caller is inside the mount.
3. View state: the primary keeps reading and writing the store's `zoom`, `panX`, `panY`; the compare pane keeps its own `const local = { zoom: 1, panX: 0, panY: 0 }`. Introduce two closures used at every zoom/pan read and write — `handleWheel` (`zoomAbout`), `startPan`, the pan branch of `handlePointerMove`, the toolbar's zoom out/in/fit buttons, and `applyTransform(state)`:
   ```js
   function viewState() {
     const state = getState();
     return role === 'compare' ? { ...state, zoom: local.zoom, panX: local.panX, panY: local.panY } : state;
   }
   function writeView(update) {
     if (role === 'compare') {
       const next = typeof update === 'function' ? update(viewState()) : update;
       local.zoom = next.zoom ?? local.zoom; local.panX = next.panX ?? local.panX; local.panY = next.panY ?? local.panY;
       applyTransform(viewState());
       redrawDynamic(liveGeometry());
     } else {
       setState(update);
     }
   }
   ```
   Every `setState((s) => ({ zoom: ... }))`, `setState({ zoom: 1, panX: 0, panY: 0 })` and `setState((s) => zoomAbout(s, ...))` in the zoom/pan paths becomes `writeView(...)`; `applyTransform(state)` in `updateViewer` receives `viewState()`; `startPan` baselines from `viewState()`; `handleWheel`'s `before`/`after` read `viewState()`.
4. Read-only: in the compare role the toolbar has zoom out, the label, zoom in, fit, a divider, the pan toggle, the overlay toggle and the fill slider — no edit button, no re-run button, no edit bar; `describeCard` returns `null` unless `filmStatus` is `'loading'` or `'missing'` (the `LOADING` and `FILM UNAVAILABLE` cards, the latter without a button); `handleKeyDown` is not attached; `handlePointerDown` treats a primary-button press as a pan only when `state.panMode`, never as a handle press, a retrace point or a click selection; `handleClick` does nothing; `setRunHandler` stores nothing and the run button is never shown.
5. The chip: in the compare role `chip` holds `chipId` (the study id), `chipMatch` (`{match}%` when `updateViewer` is given a match, else empty) and `chipClose`, a `button.viewer-chip-close` with `aria-label: 'Stop comparing'` whose click is `setState({ compareId: null })`. `updateViewer(study, { match = null } = {})` writes `chipMatch.textContent = match === null ? '' : `${match}%``.
6. `footerText` is unchanged (it reads the study it is given).
7. `detach()` also removes the chip close listener; nothing else changes.

Smoke and gate check every item above; `test/interactions.test.js` and `test/canvas.test.js` stay green because nothing in `viewer/*` changes.

- [ ] **Step 2: `measurements.js` — the other column and Δ**

Replace `rowButton`, `rowStatic`, `discTable` and the signature so a second study's values sit beside the first with a signed delta. The row helpers gain an optional `other` row and a threshold:

```js
function valueCell(row, extraClass = '') {
  return el('div', { class: `meas-value${extraClass}` }, formatRowValue(row));
}

function deltaCell(row, otherRow, threshold) {
  const delta = deltaRow(row, otherRow, threshold);
  return el('div', { class: `meas-delta${delta.overThreshold ? ' is-over' : ''}` }, delta.text);
}

// A row that selects a vertebra. With `other`, the compared study's value and the signed delta
// follow the value (similar-cases plan B, plan 07 Task 5): 5 degrees for the angles.
function rowButton(row, onClick, other = null) {
  return el('button', {
    type: 'button',
    class: `meas-row${row.highlight ? ' is-selected' : ''}`,
    'aria-pressed': row.highlight ? 'true' : 'false',
    'data-row-key': row.key,
    onClick,
  },
    el('div', { class: 'meas-label' }, row.label),
    el('div', { class: 'meas-spacer' }),
    valueCell(row),
    other ? valueCell(other, ' meas-value-other') : null,
    other ? deltaCell(row, other, 5) : null);
}

function rowStatic(row, other = null) {
  return el('div', { class: 'meas-row-static' },
    el('div', { class: 'meas-label' }, row.label),
    el('div', { class: 'meas-spacer' }),
    valueCell(row),
    other ? valueCell(other, ' meas-value-other') : null,
    other ? deltaCell(row, other, 2) : null);
}

// The disc table: with `other`, each position cell stacks the value, the other's value and the
// delta (2 mm), so the table keeps its four columns.
function discTable(study, other = null) {
  const rows = discRows(study);
  const otherRows = other ? discRows(other) : null;
  const cell = (row, position, index) => {
    const value = row[position] === null ? '\u2014' : row[position].toFixed(1);
    if (!otherRows) return el('td', { class: 'meas-value', 'data-disc-position': position }, value);
    const otherRow = otherRows[index];
    const delta = deltaRow({ value: row[position], absent: row[position] === null }, { value: otherRow[position], absent: otherRow[position] === null }, 2);
    return el('td', { class: 'meas-value meas-value-stacked', 'data-disc-position': position },
      el('div', {}, value),
      el('div', { class: 'meas-value-other' }, otherRow[position] === null ? '\u2014' : otherRow[position].toFixed(1)),
      el('div', { class: `meas-delta${delta.overThreshold ? ' is-over' : ''}` }, delta.text));
  };
  return el('table', { class: 'meas-disc-table', 'aria-label': 'Disc heights in millimetres' },
    el('thead', {}, el('tr', {},
      ...['Level', 'Anterior', 'Middle', 'Posterior'].map(label => el('th', { scope: 'col' }, label)))),
    el('tbody', {}, ...rows.map((row, index) => el('tr', { 'data-disc-level': row.key },
      el('th', { scope: 'row' }, row.label),
      ...DISC_POSITIONS.map(position => cell(row, position, index))))));
}
```

Import `deltaRow` from `'../data/measurements.js'` (add it to the existing import). Change the signature to `function updateMeasurements(study, other = null)`; add `other ? other.id : null, other ? other.measurements : null, other ? other.geometry : null, other ? other.calibration : null` to the rebuild `key`; compute `const otherRows = other ? sagittalRows(other.measurements) : null;` and `const otherLordosis = other ? lordosisRows(other.measurements) : null;`, and pass `otherRows[index]` / `otherLordosis[index]` into `rowButton` by index; pass `other` to `discTable(discPending ? null : study, other)` (when `discPending`, pass `null` for both); `alignmentRows(study)` rows get `other ? alignmentRows(other)[index] : null`. When `other` is set, insert a header row before section 1:

```js
    if (other) {
      root.append(el('div', { class: 'meas-compare-head', 'aria-hidden': 'true' },
        el('div', { class: 'meas-spacer' }),
        el('div', { class: 'meas-compare-id' }, study.id),
        el('div', { class: 'meas-compare-id meas-compare-other' }, other.id),
        el('div', { class: 'meas-compare-delta' }, '\u0394')));
    }
```

Add to `test/measurements.test.js` (or create it beside the existing data tests if the file only tests `data/measurements.js`): nothing new is pure here beyond `deltaRow`, which is already tested; the panel is DOM and is checked by the smoke suite.

- [ ] **Step 3: The drawer, the screen, the styles**

`renderer/components/clinical-data.js`, replace `visibleStudies`:

```js
// The studies the grid shows, one row each: the open study, then the compared one when comparison
// mode is on (similar-cases plan B Task 8, plan 07 Task 6). Every row and the count label derive
// from this array.
function visibleStudies(state) {
  const open = openStudy(state);
  if (!open) return [];
  const other = state.compareId && state.compareId !== open.id ? state.studies.find((s) => s.id === state.compareId) ?? null : null;
  return other ? [open, other] : [open];
}
```

`renderer/screens/analysis.js`:

1. Imports: `findSimilar` from `'../data/similarity.js'`, `embeddingsMap` from `'../embeddings.js'`.
2. Two pane hosts inside `viewerHost`: `const primaryHost = el('div', { class: 'analysis-pane analysis-pane-primary' }); const compareHost = el('div', { class: 'analysis-pane analysis-pane-compare is-hidden' }); const viewerHost = el('div', { class: 'analysis-viewer-host' }, primaryHost, compareHost);` The primary viewer mounts into `primaryHost`; `const compareViewer = mountViewer(compareHost, { role: 'compare' });` beside it. `teardown()` also calls `mounted.compareViewer.detach()` and disposes the compare images.
3. The compare film: a `restoreCompareFilm(compareId)` sibling of `restoreFilm` — reads the sidecar (gated by `persistenceDisabledReason()` the same way), decodes it with `loadStudyImages`, checks that `getState().compareId` is still the id and the record's `addedAt` unchanged, hands the bitmaps to `compareViewer.setImages`, keeps them in a `compareImages` closure variable, and disposes the previous set. `compareViewer.setFilmStatus('loading')` before the read and `'missing'` when the sidecar is absent. Triggered from `update()` whenever `compareId` changes (`lastCompareId` closure variable), disposed when it becomes null.
4. `update()`: `const other = live.compareId && live.compareId !== open.id ? live.studies.find((s) => s.id === live.compareId) ?? null : null;` then `compareHost.classList.toggle('is-hidden', !other); panel.classList.toggle('is-comparing', Boolean(other)); compareBadge.hidden = !other; if (other) { compareBadge.textContent = `COMPARING · ${other.id}`; }`. The match for the chip: `const match = other ? findSimilar(open, live.studies, { scope: 'all', mode: live.similarRank, embeddings: embeddingsMap(), n: Infinity }).matches.find((m) => m.study.id === other.id)?.match ?? null : null;` and `if (other) compareViewer.updateViewer(other, { match });`. `measurementsPanel.updateMeasurements(open, other);`.
5. The badge: `const compareBadge = el('div', { class: 'eyebrow analysis-compare', hidden: true, 'data-similar-key': 'comparing' });` placed in the header after `statusHost`.
6. Hygiene: `compareId` is nulled by every writer of `openId` — in `screens/studies.js`, `openStudy`, `addStudy` and the single-delete `setState` (add `compareId: null` to each patch; the bulk delete already does it) — and the Analysis header's back button leaves it alone (returning to the same study keeps the comparison). A `compareId` that names no study, or names the open study, renders as not comparing and never throws.

`styles/screens/analysis.css`:

```css
/* ===== 06 — COMPARISON MODE (plan 07 Tasks 3–6, adapted) ================================ */
.analysis-viewer-host { display: flex; gap: 2px; }
.analysis-pane { flex: 1; min-width: 0; display: flex; position: relative; }
.analysis-pane.is-hidden { display: none; }
.analysis-panel.is-comparing { width: 440px; }
.analysis-compare { color: var(--accent); white-space: nowrap; }
.viewer-chip-match { font-family: 'Chivo Mono', monospace; font-size: 10px; letter-spacing: .1em; color: var(--muted); margin-left: 8px; }
.viewer-chip-close { margin-left: 6px; border: none; background: transparent; color: inherit; cursor: pointer; font: inherit; }
.meas-compare-head { display: flex; align-items: baseline; gap: 8px; padding: 0 12px; font-family: 'Chivo Mono', monospace; font-size: 8.5px; letter-spacing: .12em; }
.meas-compare-id { width: 64px; text-align: right; color: var(--ink); }
.meas-compare-other { color: var(--muted); }
.meas-compare-delta { width: 46px; text-align: right; color: var(--muted); }
.meas-value-other { color: var(--body); }
.meas-delta { width: 46px; text-align: right; font-family: 'Chivo Mono', monospace; font-size: 10.5px; font-weight: 500; color: var(--muted); }
.meas-delta.is-over { color: var(--accent); }
.meas-value-stacked div + div { font-size: 11px; }
```

- [ ] **Step 4: Verify from source, run the unit suite, commit**

Run: `node --test test/*.test.js > tools/smoke/out/b8-unit.txt 2>&1`
Expected: PASS (nothing pure changed in `viewer/*`; `measurements.js`'s `deltaRow` is already pinned).

From source, with two fully segmented studies: open one, `Find similar → Shape`, click a card — the stage splits into two panes, the right pane shows the other film with its overlay and the chip `SP-nnnn · NN%` and a close control, its own wheel zoom and pan, no edit button; the header reads `COMPARING · SP-nnnn`; the panel is wider with `{other}` and `Δ` columns, deltas over 5° in the accent colour; the drawer shows two rows; the card reads `IN VIEWER · CLICK TO REMOVE`; clicking it again, or the chip's close, or opening another study, ends the comparison; deleting the compared study ends it without an error. Record each in the ledger.

```bash
git add renderer/components/viewer.js renderer/components/measurements.js renderer/components/clinical-data.js renderer/screens/analysis.js renderer/screens/studies.js styles/screens/analysis.css
git commit -F tools/smoke/out/b8-commit.txt
```

Message: `feat: comparison mode — a second read-only pane, the other column and deltas, two drawer rows, the COMPARING badge` + the trailer.

---

### Task 9: `Export dataset`

**Files:**
- Create: `renderer/data/dataset.js`
- Modify: `main.js` (after `save-csv`: `save-dataset`), `renderer/screens/parameters.js:88-100` (a third export), `:198-232` (the button and note), `styles/screens/studies.css` (nothing new unless the group wraps badly)
- Test: `test/dataset.test.js` (new)

**Interfaces:**
- Consumes: `toCsv`, `toPairedCsv`, `clinicalFieldNames` (`csv.js`); `pairStudies`, `postFromFilters` (`pairing.js`, by visit since v1.0.8: `subjects[].visits` is a Map keyed by header, `Pre-op` first, each visit `{header, label, filmDate, films, values, disagreements, derived}` with films primary first; `pairing.visits` the later headers; `pairing.merged` the multi-film visits); `studyName`, `lastSegment` (`labels.js`); `resolveOutcomes`, `OUTCOMES`, `FOLLOW_UP_FIELD` (Task 4); `vector`, `alignment`, `subjectFilms`, `LANDMARK_ORDER`, `ALIGNMENT_ORDER`, `ALIGNMENT_WEIGHTS` (Task 3); `validEmbedding` (Task 2); `APP_VERSION` from `data/version.js` (check its export name with `cat renderer/data/version.js` — two lines); `rowsToExport`, `exportFileName` (`parameters.js`); `saveDataset` (api, Task 2); `ensureEmbeddings`, `embeddingsMap`, `bundledModelSha` (Task 2).
- Produces: `buildDataset({ rows, post, embeddings, bundledSha, version, now }) -> { folder, files: { 'films.csv', 'subjects.csv', 'vectors.json', 'manifest.json' }, counts, pairing }` (`counts` has `mergedVisits`; `vectors.json`'s `films` is an array in `films.csv` row order, each with `name`, the study name); `datasetMessage(result, folder) -> string`; the IPC `save-dataset({ folder, files })` → the folder's absolute path, or `null` on cancel.

- [ ] **Step 1: Write the failing tests**

Create `test/dataset.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset, datasetMessage, appendColumns, RESOLVED_COLUMNS } from '../renderer/data/dataset.js';

function geometry() {
  const body = (top) => ({ superior: [[160, top], [100, top]], inferior: [[160, top + 80], [100, top + 80]], quadrilateral: [[160, top], [100, top], [100, top + 80], [160, top + 80]] });
  return { vertebrae: { L1: body(100), L2: body(200), L3: body(300), L4: body(400), L5: body(500) }, s1_superior: [[170, 610], [110, 620]], l1_center: [130, 140], hip_midpoint: [260, 760], femoral_circles: [[250, 760, 30], [270, 760, 30]] };
}
// A film is named by its study name in every export since v1.0.8 (set explicitly here; a film with no
// stored name reads as its stem); the SP id keys the record and appears in no file.
function film(id, name, subjectId, timepoint, clinical = {}, extra = {}) {
  return { id, source: 'real', filePath: `C:\\films\\${id}.png`, fileName: `${id}.png`, name, workspaceFolder: 'C:\\films', subjectId, timepoint,
    filmDate: '2025-01-01', note: null, reviewedAt: null, addedAt: '2026-09-12T00:00:00.000Z', view: 'Standing lateral', thumbnail: null,
    measurements: { PI: 50, PT: 12, SS: 38, L1PA: 8, LL: { 'L1-S1': 49, 'L2-S1': 40, 'L3-S1': 30, 'L4-S1': 20, 'L5-S1': 10 } },
    geometry: geometry(), qc: { coverage: { partial: false, unoriented: [] }, models: { vertebrae: 'unet', femoral: 'unet', s1: 'keypointrcnn' }, framing: { searched: true, whole_film_won: false }, processing: { crop_localizer: true } },
    calibration: { version: 1, source_sha256: `digest-${id.slice(3)}`, status: 'unavailable', spacing: null, candidates: [], selected_index: null, coordinate_space: 'original_image', width: 1, height: 1 },
    clinical, ...extra };
}
const unit = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const embedding = (id, sha = 'abc') => ({ version: 1, id, computedAt: 'x', sourceSha256: null, model: { onnx_sha256: sha }, filmType: 'whole-spine', crop: unit([1, 0]), whole: unit([0, 1]) });

const rows = [
  film('SP-1000', 'S001 pre', 'S001', 'Pre-op', { 'Fusion extension': 'Yes', 'Fusion extension date': '2026-01-10' }),
  film('SP-1001', 'S001 post', 'S001', 'Post-op', { 'Last follow-up': '2026-06-01', 'Interbody type': 'PEEK' }, { filmDate: '2025-06-01' }),
  film('SP-1002', 'S002 pre', 'S002', 'Pre-op'),
  film('SP-1003', 'lone film', null, null, {}, { geometry: null, measurements: null, qc: null }),
  { ...film('SP-0042', 'demo', 'D', 'Pre-op'), source: 'demo' },
];
const embeddings = new Map([['SP-1000', embedding('SP-1000')], ['SP-1001', embedding('SP-1001', 'old')]]);
const built = () => buildDataset({ rows, post: '__any__', embeddings, bundledSha: 'abc', version: '1.0.8', now: new Date('2026-09-12T20:00:00.000Z') });

test('the folder name carries the workspace label and the date', () => {
  assert.equal(built().folder, 'films-dataset-2026-09-12');
  assert.equal(buildDataset({ rows: [], post: '__any__', embeddings: new Map(), bundledSha: null, version: '1', now: new Date('2026-09-12T20:00:00.000Z') }).folder, 'library-dataset-2026-09-12');
});

test('films.csv is toCsv plus the provenance, then the resolved outcome columns, one row per real film named by study name', () => {
  const text = built().files['films.csv'];
  const lines = text.split('\r\n').filter((l) => l !== '');
  assert.equal(lines[0], '# Spine Contour export');
  const header = lines[3].split(',');
  assert.equal(header[0], 'Study ID');
  assert.deepEqual(header.slice(-12), ['Film type', 'Coverage', 'Reviewed', 'Embedding', 'Crop localizer', 'Vertebra model', 'Femoral model', 'S1 model', 'Source SHA-256', ...RESOLVED_COLUMNS]);
  assert.deepEqual(RESOLVED_COLUMNS, ['Subject fusion extension', 'Subject fusion extension date', 'Subject last follow-up']);
  assert.equal(lines.length - 4, 4);
  const first = lines[4].split(',');
  assert.equal(first[0], 'S001 pre');
  const at = (name) => first[header.indexOf(name)];
  assert.equal(at('Film type'), 'whole-spine');
  assert.equal(at('Coverage'), 'full');
  assert.equal(at('Embedding'), 'yes');
  assert.equal(at('Crop localizer'), 'on');
  assert.equal(at('Vertebra model'), 'unet');
  assert.equal(at('Source SHA-256'), 'digest-1000');
  assert.equal(at('Subject fusion extension'), 'yes');
  assert.equal(at('Subject fusion extension date'), '2026-01-10');
  assert.equal(at('Subject last follow-up'), '2026-06-01');
  const second = lines[5].split(',');
  assert.equal(second[header.indexOf('Embedding')], 'no');
  const unsegmented = lines[7].split(',');
  assert.equal(unsegmented[0], 'lone film');
  assert.equal(unsegmented[header.indexOf('Coverage')], '');
  assert.equal(unsegmented[header.indexOf('Subject fusion extension')], 'not-recorded');
  assert.equal(lines.filter((l) => l.startsWith('demo,')).length, 0, 'demo rows dropped');
  assert.ok(!text.includes('C:\\films'), 'no path');
  assert.ok(!text.includes('.png'), 'no extension');
  assert.ok(!text.includes('SP-'), 'no record id');
});

test('subjects.csv is the paired export by visit plus the resolved columns and the film types', () => {
  const lines = built().files['subjects.csv'].split('\r\n').filter((l) => l !== '');
  const header = lines[3].split(',');
  assert.deepEqual(header.slice(-5), [...RESOLVED_COLUMNS, 'Pre-op film type', 'Post-op film type']);
  assert.equal(lines.length - 4, 1);
  const row = lines[4].split(',');
  assert.equal(row[0], 'S001');
  assert.equal(row[header.indexOf('Pre-op study')], 'S001 pre');
  assert.equal(row[header.indexOf('Subject fusion extension')], 'yes');
  assert.equal(row[header.indexOf('Pre-op film type')], 'whole-spine');
  // SP-1001's stored embedding came from another graph, so nothing current says its film type.
  assert.equal(row[header.indexOf('Post-op film type')], '');
});

test('a merged visit counts once, is flagged in the toast, and takes its primary film\u2019s type', () => {
  const merged = buildDataset({
    rows: [
      film('SP-2000', 'S003 pre', 'S003', 'Pre-op'),
      film('SP-2001', 'S003 pre flexion', 'S003', 'Pre-op', {}, { note: 'flexion' }),
      film('SP-2002', 'S003 post', 'S003', 'Post-op', {}, { filmDate: '2025-06-01' }),
    ],
    post: '__any__', embeddings: new Map([['SP-2000', embedding('SP-2000')]]), bundledSha: 'abc', version: '1', now: new Date('2026-09-12T20:00:00.000Z'),
  });
  assert.equal(merged.counts.pairs, 1);
  assert.equal(merged.counts.mergedVisits, 1);
  const lines = merged.files['subjects.csv'].split('\r\n').filter((l) => l !== '');
  const header = lines[3].split(',');
  const row = lines[4].split(',');
  assert.equal(row[header.indexOf('Pre-op study')], 'S003 pre + S003 pre flexion');
  assert.equal(row[header.indexOf('Pre-op film type')], 'whole-spine');
  assert.equal(datasetMessage(merged, 'D'), 'Dataset written to D \u00B7 1 pair \u00B7 1 merged visit \u00B7 2 films without an embedding');
});

test('vectors.json carries the blocks per film in films.csv order, named by study name, null where absent, never an embedding from another graph', () => {
  const vectors = JSON.parse(built().files['vectors.json']);
  assert.equal(vectors.version, 1);
  assert.equal(vectors.shape.dim, 44);
  assert.equal(vectors.shape.order.length, 22);
  assert.equal(vectors.hip.dim, 2);
  assert.deepEqual(vectors.alignment.order, ['PI', 'PT', 'SS', 'LL L1-S1', 'PI-LL']);
  assert.deepEqual(vectors.alignment.weights, [1, 0.8, 0.8, 0.6, 1]);
  assert.deepEqual(vectors.films.map((f) => f.name), ['S001 pre', 'S001 post', 'S002 pre', 'lone film']);
  const [pre, post, , lone] = vectors.films;
  assert.equal(pre.shape.length, 44);
  assert.equal(pre.hip.length, 2);
  assert.equal(pre.alignment.length, 5);
  assert.equal(pre.crop.length, 2);
  assert.equal(pre.whole.length, 2);
  assert.equal(pre.filmType, 'whole-spine');
  assert.equal(post.crop, null);
  assert.equal(post.whole, null);
  assert.equal(lone.shape, null);
  assert.equal(lone.alignment, null);
  assert.ok(!built().files['vectors.json'].includes('SP-'), 'no record id');
  assert.ok(!built().files['vectors.json'].includes('\n'), 'not pretty-printed');
});

test('manifest.json names the app, the date, the counts, the models, the identity and the disclaimer', () => {
  const manifest = JSON.parse(built().files['manifest.json']);
  assert.equal(manifest.app.version, '1.0.8');
  assert.equal(manifest.exportedAt, '2026-09-12T20:00:00.000Z');
  assert.deepEqual(manifest.counts, { films: 4, pairs: 1, unpaired: 1, ambiguous: 0, mergedVisits: 0, withOutcome: 1, conflicting: 0, withoutEmbedding: 3, noSubject: 1 });
  assert.deepEqual(manifest.embedding, { onnx_sha256: 'abc' });
  assert.deepEqual(manifest.models, { vertebrae: ['unet'], femoral: ['unet'], s1: ['keypointrcnn'] });
  assert.equal(manifest.identity, 'Films are named by study name (the stored name, else the film stem), the Study ID of every export; the record id is not exported.');
  assert.equal(manifest.disclaimer, 'Investigational software. NOT FOR CLINICAL USE.');
  assert.ok(manifest.citation.startsWith('Created by'));
  assert.equal(built().files['manifest.json'].includes('\n  '), true, 'pretty-printed');
});

test('datasetMessage counts what was written and left out, each clause only when nonzero', () => {
  assert.equal(datasetMessage(built(), 'C:\\out\\films-dataset-2026-09-12'),
    'Dataset written to C:\\out\\films-dataset-2026-09-12 \u00B7 1 pair \u00B7 1 film without a pair \u00B7 3 films without an embedding');
  const clean = buildDataset({ rows: rows.slice(0, 2), post: '__any__', embeddings: new Map([['SP-1000', embedding('SP-1000')], ['SP-1001', embedding('SP-1001')]]), bundledSha: 'abc', version: '1', now: new Date() });
  assert.equal(datasetMessage(clean, 'D'), 'Dataset written to D \u00B7 1 pair');
});

test('appendColumns adds cells to every data line of a CSV text and leaves the comment block alone', () => {
  const text = '# a\r\n# b\r\nX,Y\r\n1,2\r\n3,4\r\n';
  assert.equal(appendColumns(text, ['Z'], [['z1'], ['z2']]), '# a\r\n# b\r\nX,Y,Z\r\n1,2,z1\r\n3,4,z2\r\n');
});
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `node --test test/dataset.test.js`
Expected: FAIL at import.

- [ ] **Step 3: The module**

Create `renderer/data/dataset.js`:

```js
/**
 * Export dataset (similar-cases spec, 2026-09-12, section 13; amended 2026-09-13 for v1.0.8): the four
 * files a notebook trains on, built entirely here from the rows the paired export would write. No
 * images, no paths, no record ids -- a film is named by its study name, the Study ID every export
 * writes, and the only other per-film identity is the calibration digest. Pure: the folder is written
 * by main.js's save-dataset handler; screens/parameters.js wires the button.
 */
import { toCsv, toPairedCsv } from './csv.js';
import { pairStudies } from './pairing.js';
import { PRE_OP } from './timepoints.js';
import { OUTCOMES, FOLLOW_UP_FIELD, resolveOutcomes, primaryOutcome } from './outcomes.js';
import { vector, alignment, subjectFilms, LANDMARK_ORDER, ALIGNMENT_ORDER, ALIGNMENT_WEIGHTS } from './similarity.js';
import { validEmbedding, isCurrent } from './embeddings.js';
import { lastSegment, studyName } from './labels.js';

const CITATION = 'Created by Cody Woodhouse, MD; Michael Jayasuriya, BS.';
const DISCLAIMER = 'Investigational software. NOT FOR CLINICAL USE.';
const IDENTITY = 'Films are named by study name (the stored name, else the film stem), the Study ID of every export; the record id is not exported.';
const SEP = ' \u00B7 ';

// Per registered outcome: `Subject <field>` (the status) and `Subject <date field>`, then the follow-up.
export const RESOLVED_COLUMNS = Object.freeze([
  ...OUTCOMES.flatMap((o) => [`Subject ${o.field.toLowerCase()}`, `Subject ${o.dateField.toLowerCase()}`]),
  `Subject ${FOLLOW_UP_FIELD.toLowerCase()}`,
]);
const PROVENANCE_COLUMNS = ['Film type', 'Coverage', 'Reviewed', 'Embedding', 'Crop localizer', 'Vertebra model', 'Femoral model', 'S1 model', 'Source SHA-256'];

function escapeField(value) {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

// Adds header cells and one cell list per data row to a CSV text: the comment lines are left
// alone, the header line is the first non-comment line, the data lines follow in order.
export function appendColumns(text, headers, cells) {
  const lines = text.split('\r\n');
  let dataIndex = -1;
  const out = lines.map((line) => {
    if (line === '' || line.startsWith('#')) return line;
    dataIndex += 1;
    const extra = dataIndex === 0 ? headers : (cells[dataIndex - 1] ?? headers.map(() => ''));
    return `${line},${extra.map(escapeField).join(',')}`;
  });
  return out.join('\r\n');
}

function filmType(embedding) {
  return embedding?.filmType ?? '';
}

function coverage(study) {
  if (study.measurements == null || study.geometry == null) return '';
  return study.qc?.coverage?.partial === true ? 'partial' : 'full';
}

function currentEmbedding(embeddings, id, bundledSha) {
  const record = embeddings instanceof Map ? embeddings.get(id) : embeddings?.[id];
  return validEmbedding(record) && isCurrent(record, bundledSha) ? record : null;
}

function resolvedCells(study, all) {
  const resolved = resolveOutcomes(subjectFilms(study, all));
  return [
    ...OUTCOMES.flatMap((o) => [resolved[o.key].status, resolved[o.key].date ?? '']),
    resolved.lastFollowUp ?? '',
  ];
}

function provenanceCells(study, embeddings, bundledSha) {
  const embedding = currentEmbedding(embeddings, study.id, bundledSha);
  const models = study.qc?.models ?? {};
  return [
    filmType(embedding), coverage(study), study.reviewedAt ? study.reviewedAt.slice(0, 10) : '',
    embedding ? 'yes' : 'no',
    study.qc?.processing?.crop_localizer === undefined ? '' : (study.qc.processing.crop_localizer ? 'on' : 'off'),
    models.vertebrae ?? '', models.femoral ?? '', models.s1 ?? '',
    study.calibration?.source_sha256 ?? '',
  ];
}

export function buildDataset({ rows, post, embeddings, bundledSha, version, now = new Date() }) {
  const real = (rows ?? []).filter((study) => study.source === 'real');
  const date = now.toISOString().slice(0, 10);
  const roots = new Set(real.map((s) => (typeof s.workspaceFolder === 'string' && s.workspaceFolder !== '' ? s.workspaceFolder : null)).filter((r) => r !== null));
  const label = roots.size === 1 ? (lastSegment([...roots][0]) || 'library') : 'library';
  const folder = `${label}-dataset-${date}`;

  const filmsCsv = appendColumns(toCsv(real), [...PROVENANCE_COLUMNS, ...RESOLVED_COLUMNS],
    real.map((study) => [...provenanceCells(study, embeddings, bundledSha), ...resolvedCells(study, real)]));

  // Pairing by visit (v1.0.8): a written subject's visits are a Map keyed by header, Pre-op first,
  // each visit's films primary first. The resolved outcome is the subject's, so its pre-op visit's
  // primary film serves; a visit's film type is its primary film's.
  const pairing = pairStudies(real, { post });
  const headers = [PRE_OP, ...pairing.visits];
  const subjectsCsv = appendColumns(toPairedCsv(pairing),
    [...RESOLVED_COLUMNS, ...headers.map((h) => `${h} film type`)],
    pairing.subjects.map((row) => {
      const pre = row.visits.get(PRE_OP).films[0];
      return [
        ...resolvedCells(pre, real),
        ...headers.map((h) => { const visit = row.visits.get(h); return visit ? filmType(currentEmbedding(embeddings, visit.films[0].id, bundledSha)) : ''; }),
      ];
    }));

  // One entry per films.csv data row, in that order, named by study name: an array, so two films
  // that share a name both survive.
  const films = [];
  let withoutEmbedding = 0;
  for (const study of real) {
    const shape = vector(study);
    const embedding = currentEmbedding(embeddings, study.id, bundledSha);
    if (!embedding) withoutEmbedding += 1;
    films.push({
      name: studyName(study),
      shape: shape ? shape.V : null,
      hip: shape ? shape.H : null,
      alignment: alignment(study),
      crop: embedding ? embedding.crop : null,
      whole: embedding ? embedding.whole : null,
      filmType: embedding ? embedding.filmType : null,
    });
  }
  const vectors = {
    version: 1,
    exportedAt: now.toISOString(),
    shape: { dim: 44, order: [...LANDMARK_ORDER], normalisation: 'mirror-anterior-positive-x, centroid, unit-centroid-size, no-rotation' },
    hip: { dim: 2, normalisation: 'the shape transform' },
    alignment: { order: [...ALIGNMENT_ORDER], weights: [...ALIGNMENT_WEIGHTS] },
    embedding: { onnx_sha256: bundledSha ?? null },
    films,
  };

  const statuses = real.map((study) => resolveOutcomes(subjectFilms(study, real))[primaryOutcome().key].status);
  const subjectsSeen = new Set();
  let withOutcome = 0;
  let conflicting = 0;
  real.forEach((study, index) => {
    const key = study.subjectId ? study.subjectId.trim().toLowerCase() : `film:${study.id}`;
    if (subjectsSeen.has(key)) return;
    subjectsSeen.add(key);
    if (statuses[index] === 'yes' || statuses[index] === 'no') withOutcome += 1;
    if (statuses[index] === 'conflicting') conflicting += 1;
  });
  const models = { vertebrae: new Set(), femoral: new Set(), s1: new Set() };
  for (const study of real) for (const slot of Object.keys(models)) if (study.qc?.models?.[slot]) models[slot].add(study.qc.models[slot]);
  const counts = {
    films: real.length, pairs: pairing.subjects.length, unpaired: pairing.unpaired.length, ambiguous: pairing.ambiguous.length,
    mergedVisits: pairing.merged.length, withOutcome, conflicting, withoutEmbedding, noSubject: pairing.noSubject,
  };
  const manifest = {
    app: { name: 'Spine Contour', version },
    exportedAt: now.toISOString(),
    counts,
    models: Object.fromEntries(Object.entries(models).map(([slot, set]) => [slot, [...set].sort()])),
    embedding: { onnx_sha256: bundledSha ?? null },
    outcomes: OUTCOMES.map((o) => ({ key: o.key, field: o.field, dateField: o.dateField, primary: o.primary })),
    followUpField: FOLLOW_UP_FIELD,
    identity: IDENTITY,
    citation: CITATION,
    disclaimer: DISCLAIMER,
  };

  return {
    folder,
    files: {
      'films.csv': filmsCsv,
      'subjects.csv': subjectsCsv,
      'vectors.json': JSON.stringify(vectors),
      'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
    },
    counts,
    pairing,
  };
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

// The toast (spec 13): what was written, then each thing left out or flagged, only when nonzero.
export function datasetMessage(result, folder) {
  const { counts } = result;
  let text = `Dataset written to ${folder}${SEP}${plural(counts.pairs, 'pair', 'pairs')}`;
  if (counts.unpaired > 0) text += `${SEP}${plural(counts.unpaired, 'film without a pair', 'films without a pair')}`;
  if (counts.ambiguous > 0) text += `${SEP}${plural(counts.ambiguous, 'ambiguous subject', 'ambiguous subjects')}`;
  if (counts.mergedVisits > 0) text += `${SEP}${plural(counts.mergedVisits, 'merged visit', 'merged visits')}`;
  if (counts.conflicting > 0) text += `${SEP}${plural(counts.conflicting, 'subject with conflicting outcomes', 'subjects with conflicting outcomes')}`;
  if (counts.withoutEmbedding > 0) text += `${SEP}${plural(counts.withoutEmbedding, 'film without an embedding', 'films without an embedding')}`;
  return text;
}
```

Note `pairing.unpaired` counts SUBJECTS without a pair, not films; the toast's wording in the test (`1 film without a pair`) is what the spec wrote, and `S002` is one subject with one film, so both readings agree in the fixture. Keep the spec's wording.

- [ ] **Step 4: The main-process handler and the button**

`main.js`, after `save-csv`:

```js
// Export dataset (similar-cases spec, 2026-09-12, section 13): a folder of four text files. The
// renderer builds every byte; this picks the parent folder, creates `<folder>` (a -2, -3 suffix
// when it exists), and writes each file .tmp then rename. Cancelling resolves null.
ipcMain.handle('save-dataset', async (_event, request) => {
  if (!request || typeof request.folder !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(request.folder)) throw new Error('Nothing to export.');
  if (!request.files || typeof request.files !== 'object') throw new Error('Nothing to export.');
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Choose where to write the dataset folder', properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return null;
  const parent = result.filePaths[0];
  let target = path.join(parent, request.folder);
  for (let n = 2; fs.existsSync(target); n += 1) target = path.join(parent, `${request.folder}-${n}`);
  await fsPromises.mkdir(target, { recursive: true });
  for (const [name, text] of Object.entries(request.files)) {
    if (!/^[A-Za-z0-9._-]+$/.test(name) || typeof text !== 'string') throw new Error('Nothing to export.');
    const file = path.join(target, name);
    await fsPromises.writeFile(`${file}.tmp`, text, 'utf8');
    await fsPromises.rename(`${file}.tmp`, file);
  }
  return target;
});
```

`renderer/screens/parameters.js`: import `{ saveDataset }` from `'../api.js'`, `{ buildDataset, datasetMessage }` from `'../data/dataset.js'`, `{ ensureEmbeddings, embeddingsMap, bundledModelSha }` from `'../embeddings.js'`, and the app version from `'../data/version.js'` (its export name from `cat renderer/data/version.js`). Beside `exportPaired`, add:

```js
  // The research dataset over the same rows (similar-cases spec section 13): a folder, four
  // files, no images. The embeddings load first so the vectors file is complete.
  async function exportDataset(rows, filters) {
    if (rows.filter((study) => study.source === 'real').length === 0) return;
    try {
      await ensureEmbeddings();
      const built = buildDataset({ rows, post: postFromFilters(filters), embeddings: embeddingsMap(), bundledSha: bundledModelSha(), version: APP_VERSION });
      const folder = await saveDataset({ folder: built.folder, files: built.files });
      if (folder) showToast(datasetMessage(built, folder));
    } catch (error) {
      showToast(`Could not export: ${error.message}`);
    }
  }
```

In `buildFilterBar`, after `pairedButton`, add a third button and include it in the group:

```js
    const datasetButton = el('button', {
      type: 'button', class: 'btn btn-small param-export param-export-dataset', 'data-param-key': 'export-dataset',
      disabled: exportable === 0,
      title: exportable > 0 ? 'Write the per-film and per-pair tables, every vector and a manifest into a folder' : reason,
      onClick: () => exportDataset(rows, filters),
    }, chosen.length > 0 ? `Export dataset \u00B7 ${chosen.length} selected` : 'Export dataset');
```

and `el('div', { class: 'param-export-group' }, exportButton, pairedButton, datasetButton, note)`.

- [ ] **Step 5: Run the suites, try it, commit**

Run: `node --test test/dataset.test.js test/parameters.test.js`
Expected: PASS.

Run: `node --test test/*.test.js > tools/smoke/out/b9-unit.txt 2>&1`
Expected: PASS.

From source: Parameters tab, `Export dataset`, pick a folder — the four files appear, `films.csv` opens in a spreadsheet, `vectors.json` parses. Record in the ledger.

```bash
git add renderer/data/dataset.js main.js renderer/screens/parameters.js test/dataset.test.js
git commit -F tools/smoke/out/b9-commit.txt
```

Message: `feat: Export dataset writes the per-film and per-pair tables, every vector and a manifest` + the trailer.

---

### Task 10: Smoke — `smoke-similar.mjs`, and the README's baseline

**Files:**
- Create: `tools/smoke/smoke-similar.mjs`
- Modify: `tools/smoke/README.md` (a section and the baseline table)

The suite follows `smoke-parameters.mjs`'s shape: `connect()`, injected records straight into the store, `check(name, ok, detail)`, results printed as JSON, cleanup in `finally`. Precondition: the app is running from source on a scratch profile, any screen; the backend need not have the graph (the suite injects `embeddings/` records through the page's own module).

- [ ] **Step 1: Write the suite**

Sections, each a `check` group, selectors by `data-similar-key`, `data-find-key`, `data-param-key`, `data-study-id`:

1. **Injection.** Six real records under one workspace root: `SP-9200` (open, S001 Pre-op, full geometry, PI 50), `SP-9201` (S001 Post-op — same subject, must never appear), `SP-9202`–`SP-9205` (S002–S005, full geometry with small offsets, PI 52/60/75/50), one of them partial (`qc.coverage.partial: true`), plus one hand-added film `SP-9206` with no workspace. Clinical: `SP-9202` `Fusion extension: Yes` + date, `SP-9203` `No` + `Last follow-up`, `SP-9204` nothing. Then, through `import('./renderer/embeddings.js')`, `storeEmbedding(...)` for `SP-9200`, `SP-9202`, `SP-9203` with unit vectors and one for `SP-9204` under another `onnx_sha256`. Reset `similarScope`/`similarRank`; open `SP-9200`; `setState({ tab: 'sim' })`.
2. **Controls.** `[data-similar-key="scope-all"]` is pressed, `rank-all` pressed; eyebrow text `RANKED BY SHAPE, ALIGNMENT AND APPEARANCE`.
3. **Cards under All.** Cards in order exclude `SP-9201` (same subject) and the partial one; at most five; the footer reads `1 OF n WITH A FUSION EXTENSION · k NOT RECORDED`; the stale tail reads `1 STUDY NEEDS RE-EMBEDDING`; `SP-9204`'s card carries `· no appearance`.
4. **Rank by Shape** (click `rank-shape`): every eligible study appears including `SP-9204` and `SP-9206`; no stale tail. **Alignment**: the eyebrow changes; the PI 75 study is last. **Appearance**: only the three embedded, same-model studies rank.
5. **Scope** (click `scope-workspace`): `SP-9206` disappears; back to `scope-all` it returns.
6. **Outcome lines.** `SP-9202`'s card line reads `Fusion extended · <date>`; `SP-9203`'s `Fusion not extended · last follow-up <date>`; `SP-9204`'s `Outcome not recorded`.
7. **Angle line.** `SP-9203`'s reads `PI +10 · …` against PI 50.
8. **Compare.** Click `card-SP-9202`: `.analysis-pane-compare` visible, `[data-similar-key="comparing"]` reads `COMPARING · SP-9202`, the panel has `is-comparing`, `.meas-delta` cells exist, the drawer has two `.clinical-grid-row`s beyond the head and group rows, the card reads `IN VIEWER · CLICK TO REMOVE`; click again: all of it gone.
9. **Empty states.** Open the partial study: the `empty` node reads the partial sentence. Open a study with no embedding under `all`: the `no-embedding` sentence; under `shape` cards return.
10. **Embed count.** Back on Studies: `[data-find-key="embed"]` reads `Embed N` where N is the injected fully-covered studies without a current record (the partial one excluded); it is absent when every study has one (inject the rest, check).
11. **Export dataset.** Parameters tab: `[data-param-key="export-dataset"]` enabled; the button's `datasetMessage` cannot be driven through the native folder picker over CDP — instead call `buildDataset` through the page's own module over the visible rows and assert the four keys, the row counts, and that `films.csv` names its rows by study name and contains no path, no extension and no `SP-` record id.
12. **Cleanup** in `finally`: `forgetEmbedding` for the injected ids, remove the records, reset `compareId`, `tab`, `similarScope`, `similarRank`.

Print `{ passed, failed, results }` and exit non-zero on a failure, as the other suites do.

- [ ] **Step 2: Run it**

```
SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/b10-launch.txt 2>&1
node tools/smoke/smoke-similar.mjs > tools/smoke/out/b10-similar.txt 2>&1
node tools/smoke/smoke-studies.mjs > tools/smoke/out/b10-studies.txt 2>&1
node tools/smoke/smoke-parameters.mjs > tools/smoke/out/b10-parameters.txt 2>&1
node tools/smoke/smoke-persist.mjs --phase run > tools/smoke/out/b10-persist-run.txt 2>&1
node tools/smoke/cdp.mjs --quit
SMOKE_KEEP_PROFILE=1 SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/b10-launch2.txt 2>&1
node tools/smoke/smoke-persist.mjs --phase restart > tools/smoke/out/b10-persist-restart.txt 2>&1
node tools/smoke/cdp.mjs --quit
```

Expected: `smoke-similar.mjs` all green; the three existing suites at their README baselines (`smoke-studies.mjs` may grow by the `Embed` button's presence — a changed count is recorded, a failed check is a defect). `smoke-persist.mjs --phase restart` additionally proves an `embeddings/SP-9000.json` written in `--phase run` (Plan A in the tree) is loaded back: add that check to `--phase restart` if Plan A is present, else record it as not run.

- [ ] **Step 3: Record the baseline and commit**

Add a `smoke-similar.mjs` row to `tools/smoke/README.md`'s baseline table with its count and the sequencing note (DOM-only, no backend graph needed, injects `embeddings/` records and removes them).

```bash
git add tools/smoke/smoke-similar.mjs tools/smoke/README.md
git commit -F tools/smoke/out/b10-commit.txt
```

Message: `test: smoke-similar.mjs — the tab, the ranking modes, the scope, outcomes, comparison, the Embed count, the dataset builder` + the trailer.

---

### Task 11: HUMAN GATE — list these checks in the chat message, then end the turn

The orchestrator runs this itself: launch from source on the user's real library (Plan A merged, the graph exported, at least two fully segmented studies with `Appearance embeddings` on), list the checks below in the chat message, and end the turn. The user answers tersely; record every answer in the ledger, including checks not run.

1. Settings → Processing shows `Appearance embeddings` On/Off; Off then a run: the run is about a second faster and the Find tab shows `Embed 1`; `Embed` fills it.
2. Find similar under `All` on a real study: the five nearest look alike to a clinician's eye; the angle line reads correctly signed; the match figures fall with the cards.
3. `Shape`, `Alignment`, `Appearance` each change the order sensibly; `Alignment` alone matches what the Parameters grid's numbers suggest.
4. A whole-spine query's cards say nothing about `no whole film` against other whole-spine films, and do against lumbar-only ones.
5. Outcomes: type `Yes` and a date on a pre-op film's drawer cells; its post-op film's card, opened from another study, shows `Fusion extended · date`; the footer count agrees.
6. Compare: click a card — two panes, the chip, the badge, the `{other}` and `Δ` columns, two drawer rows; the compare pane pans and zooms on its own; Edit stays available on the primary only; close from the chip.
7. `Keep column name` on a CSV with an unknown column; `Keep N unmapped columns`; the column reaches the drawer and both exports.
8. `Export dataset` on the Parameters tab: the folder opens, `films.csv` in a spreadsheet, `vectors.json` parses, no file names or paths anywhere in it.
9. Light and dark: the cards, the badge and the compare chip are legible in both.

---

### Task 12: Records — the contract, the spec, HANDOFF, ROADMAP, CLAUDE.md, this plan's ledger

**Files:**
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` (a dated amendment: §16 of the spec, verbatim where it names interfaces)
- Modify: `docs/superpowers/specs/2026-09-12-similar-cases-outcomes-design.md` (status line: implemented, the branch, the gate's date)
- Modify: `docs/superpowers/HANDOFF.md` ("Where things stand", the decisions list, "Known traps": the Map/object dual in `similarity.js`, the `bump()`-after-await rule, the compare pane's local view state)
- Modify: `docs/ROADMAP.md` (§8: what stage 1 shipped; anything the gate deferred)
- Modify: `CLAUDE.md` (the branch paragraph at the top; the "Read these first" table gains the spec and the two plans)
- Modify: this plan's `## Ledger`

- [ ] **Step 1: Write the contract amendment** — one section `## 2026-09-12 amendment: similar cases and outcomes (stage 1)` carrying the spec's §16 items 1–11 with the final signatures from Tasks 2–9, and the `renderer/data/similarity.js` block replaced by the one in Task 3's Interfaces.
- [ ] **Step 2: Update the spec's status line, HANDOFF, ROADMAP and CLAUDE.md** as listed.
- [ ] **Step 3: Fill the ledger** — one entry per task: the commit, the counts, the reviewer's findings and how each was settled; the gate's answers and the checks not run; every ruling made on the way.
- [ ] **Step 4: Run the whole unit suite one last time and commit**

Run: `node --test test/*.test.js > tools/smoke/out/b12-unit.txt 2>&1`
Expected: PASS; record the final count.

```bash
git add docs/superpowers/plans/2026-08-31-00-architecture-contract.md docs/superpowers/specs/2026-09-12-similar-cases-outcomes-design.md docs/superpowers/HANDOFF.md docs/ROADMAP.md CLAUDE.md docs/superpowers/plans/2026-09-12-b-similar-cases-renderer.md
git commit -F tools/smoke/out/b12-commit.txt
```

Message: `docs: similar cases and outcomes, stage 1 — the contract amendment, the records, Plan B's ledger` + the trailer.

---

## Self-review against the spec

- **§7 vectors**: Task 3 (`vector` with mirror/centroid/size and no rotation, `H`, `alignment` with §10.5's weights, `pairDistances` with the presence rules, `medianScale`, `fuse`, `matchScore`, `candidates`, `findSimilar` with `stale`).
- **§8 the tab**: Task 6 (the two controls and their defaults, the eyebrows, five cards with the five lines, the muted block note, the footer, the two tails, the four empty states, the card click); Task 8 (what stays from plan 07).
- **§9 outcomes**: Task 4 (the registry, values, resolution, `KNOWN_FIELDS`, longest-first `autoMap`, the drawer's select and date cells, the import normalisation); §9.5 Task 5 (`Keep column name`, `Keep all unmapped`, `Set all… → Unmapped`).
- **§10.6 the setting, renderer half**: Task 1.
- **§11 storage**: Task 2 (`embeddings/<id>.json`, the lazy load, `embeddingsVersion`, delete removes two files, the quarantine triple, the stale rule through `isCurrent` and Task 3's `stale`).
- **§12 the Embed action**: Task 7 (`planEmbed`, the batch kind, `embedStudy` from the sidecar alone, the texts).
- **§13 Export dataset**: Task 9 (the four files, the columns including the resolved subject columns and per-visit film types, `vectors.json` as an array in row order without other-model embeddings, the manifest counts and identity line, the toast; no images, paths or record ids; every film named by its study name, v1.0.8).
- **§15 tests**: `similarity.test.js`, `outcomes.test.js`, `embeddings.test.js`, `dataset.test.js`, the `batch.test.js`, `processing.test.js`, `store.test.js`, `api-persistence.test.js`, `csv.test.js` extensions, `smoke-similar.mjs`, the human gate — all present. `test/workspace.test.js` is exercised by Task 5's csv-level tests; the mapping card itself is smoke and gate.
- **§16 amendments**: Task 12.
- Placeholder scan: none. Type consistency: `findSimilar(open, all, { scope, mode, embeddings, n })` returns `{ matches, total, stale }` in Tasks 3, 6 and 8; `embeddingRecord(id, embedding, { sourceSha256 })` in Tasks 2 and 7; `mountViewer(container, { role })` and `updateViewer(study, { match })` in Task 8 only; `updateMeasurements(study, other)` in Task 8; `newBatch(ids, kind)` / `startBatch(ids, kind)` in Task 7 only; `RESOLVED_COLUMNS` in Task 9's module and test.

## Ledger

Session ended 2026-09-12 (the planning session): resume at **Plan A Task 1**, then this plan's Task 1; nothing started, no fix round, no open finding. The spec is at `2c145bf` on `claude/image-similarity-visualization-400922`; the rulings made while planning are above, each with its cost.

Filled during execution: one entry per task — the commit, the counts, the reviewer's findings and how each was settled; the gate's answers and the checks not run; every ruling made on the way.
