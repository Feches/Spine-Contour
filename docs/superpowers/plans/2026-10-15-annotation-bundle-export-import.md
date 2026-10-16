# Annotation Bundle Export and Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export chosen studies as a folder bundle (manifest, study records, sidecars, label records, calibration
references, the original films) and import such a bundle into another library, adding new films and updating a film
the library already holds when the bundle's annotation is newer.

**Architecture:** A pure planner `renderer/data/bundle.js` decides names, what each export entry carries, and what
each import entry does (add, update, skip with a reason) from the manifest, the local studies and their film hashes;
a root CommonJS module `bundle-io.js` does every file operation in the main process (write the bundle, read it,
hash films, place imported files) behind four IPC channels; the Studies screen adds two buttons, the flows and an
inline confirmation, and applies the plan to the store in one `setState` after the files are placed.

**Tech Stack:** Vanilla ES modules, no bundler, no runtime dependencies (`node:fs/promises`, `node:crypto`,
`node:path` in the root module only). `node --test` for pure logic and for the root module on temp folders. The CDP
smoke harness in `tools/smoke/` for the DOM, across two scratch profiles. Electron 44 (Node 24).

**Spec:** `docs/superpowers/specs/2026-10-15-annotation-bundle-export-import-design.md` (decisions B1–B9; "the
spec" below). It builds on the editor spec `specs/2026-10-15-annotation-editor-round-2-design.md`, already on this
branch (the record's `comment`, the study's `labelComment`). The binding architecture contract is
`plans/2026-08-31-00-architecture-contract.md`; Task 8 amends it. The studies-table spec
`specs/2026-09-10-studies-table-review-design.md` §5.3 is the inline-prompt pattern.

## Global Constraints

- **`renderer/` is browser code**: no `node:` imports. Anything touching `node:fs` is `main.js` or a root CommonJS
  module imported only by `main.js`. The new root module `bundle-io.js` goes in BOTH electron-builder allowlists
  (`package.json` `build.files` and `electron-builder.preview.yml` `files`); a missing entry ships a blank window.
- **No bundler, no framework, no runtime dependencies.** `dependencies` stays empty.
- **Nothing leaves the machine** (B9): local file I/O and native pickers only.
- **Never mutate the store's records in place**; every patch builds new objects. Subscribers never call `setState`.
- **The sidecar id rule** `/^SP-\d{4,}$/` with the number ≥ 1000 and **the label file rule** (a bare
  `<stem>.label.json`, no separators, no leading dot, at most 200 characters) are the main process's today
  (`predictionPath`, `labelPath` in `main.js`); this plan moves them into `bundle-io.js` as exported validators that
  `main.js` and the bundle code share, so nothing outside `<userData>/predictions/`, `labels/` and
  `calibrations/`, the chosen parent folder and the bundle folder is ever read or written.
- **Copy, verbatim** (spec §3–§5): the bundle folder `spine-contour-export-<YYYY-MM-DD>-<HHMM>`; manifest `schema`
  `spinecontour.bundle/1`; export button `Export N selected` / `Export all`, in flight `Exporting…`; import button
  `Import bundle…`; refusals `This folder is not a Spine Contour bundle.` and `This bundle was written by a newer
  Spine Contour (schema <id>). Update the app to import it.`; prompt `Import from <folder>: <a> to add, <u> to
  update, <s> to skip. The films stay in this folder, so keep it where it is.` with buttons `Import` and `Cancel`;
  skip reasons `already in the library`, `being edited`, `malformed`; toasts `Exported <n> studies to <path>` with
  clauses `· <k> films were not found and were left out (<names>)` and `· <k> sidecars could not be read (<names>)`;
  `Imported <n> studies, updated <u>, skipped <s> (<reason>: <names>; …)` with a `without film` clause;
  `Nothing to import: <reasons>`.
- **Selection rule** (B6): `rowsToExport(visible, state.paramSelected)` from `renderer/data/parameters.js`, demo
  rows never.
- **Both buttons disabled** with the bar's visible note while a run or batch is in flight (`WAIT_FOR_RUN`,
  `WAIT_FOR_BATCH`), while studies are not being saved (`persistenceDisabledReason()`), and while an export or
  import is in flight.
- **Demo studies** are never exported and never matched.
- **Smoke:** DOM, store and file reads only; **never a screenshot**; synthetic films only (canvas-drawn PNGs under
  `%TEMP%`); selectors key on `data-find-key`, `data-study-id`, classes, never visible labels; every suite runs in the
  foreground to `tools/smoke/out/<name>.txt`.
- **Unit tests run as `node --test test/*.test.js`.** Baseline on this branch: 1024/1024 (8 pre-existing
  `persistence:` warnings are known).
- **Conventional commit prefixes**, one commit per task, every message ending with the trailer
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never push, never `git stash`, never git outside this
  worktree.
- **Branch:** `worktree-annotation-round-2` in `.claude/worktrees/annotation-round-2` (tip `7dec644`, the 1.2.0
  release commit, already pushed as a backup). This work goes on the SAME branch so one PR carries both rounds; the
  1.2.0 release note and CHANGELOG are extended in Task 8, not a new release.
- **Subagents** (the owner): the lowest-capability model per task: Sonnet for Tasks 1, 2, 4 and 8; Opus for Tasks 3,
  5, 6 and 7; reviewers on Opus, Sonnet for small scoped re-reviews.

## Review Focus

Input classes the spec implies and no feature test exercises by itself; each has its test in the owning task.

1. **A manifest entry whose `dir`, `film`, `prediction`, `label` or `calibration` carries a separator or `..`.** Import
   must refuse the entry, never read outside the bundle or write outside the data folder. (Task 2, `readBundle`
   refuses the entry with a problem; Task 3, `placeImport` refuses the action.)
2. **A `study.json` that fails the store's validation** (no id, wrong `source`, a demo id). It is skipped as
   `malformed` and the rest of the bundle imports. (Task 4, `planImport`.)
3. **A film whose path no longer exists at export.** The study is still written with its sidecar and record, the
   manifest says `film: null`, and the toast names it. (Task 2, `exportBundle`.)
4. **The same bundle imported twice.** The second run adds nothing and skips every entry as `already in the
   library`, by hash, not by name. (Task 4, `planImport`; Task 7, smoke.)
5. **A matched local study open in edit mode or with a stashed editor.** It is skipped as `being edited`, its files
   untouched. (Task 4, `planImport`.)

---

## File structure

| File | Responsibility | Status |
|---|---|---|
| `renderer/data/labels.js` | `safeStem(stem)` moved here from `label-record.js` and exported | modify |
| `renderer/data/label-record.js` | imports `safeStem` from `labels.js` | modify |
| `renderer/data/bundle.js` | pure: `BUNDLE_SCHEMA`, `bundleFolderName`, `studyFolderName`, `localFilmHash`, `planExport`, `exportMessage`, `planImport`, `applyImport`, `importPromptText`, `importMessage` | create |
| `bundle-io.js` (root, CommonJS) | `isStudyId`, `isLabelFileName`, `isSafeName`, `exportBundle`, `readBundle`, `hashFiles`, `placeImport` | create |
| `main.js` | the validators imported from `bundle-io.js` for `predictionPath` / `labelPath`; handlers `export-bundle`, `read-bundle`, `hash-films`, `import-bundle` | modify |
| `preload.js`, `renderer/api.js` | `exportBundle`, `readBundle`, `hashFilms`, `importBundle` | modify |
| `package.json`, `electron-builder.preview.yml` | `bundle-io.js` in both allowlists | modify |
| `renderer/screens/studies.js` | the Export button on the bar, the Import button in the dropzone, the flows, the inline import prompt, the store patch | modify |
| `styles/screens/studies.css` | the import prompt and the two buttons | modify |
| `tools/smoke/smoke-bundle.mjs`, `tools/smoke/README.md` | the two-profile suite | create / modify |
| `docs/bundles.md` | user doc | create |
| `test/labels.test.js`, `test/label-record.test.js`, `test/bundle.test.js`, `test/bundle-io.test.js`, `test/api.test.js` | tests | modify / create |
| the records (Task 8) | contract, CLAUDE.md, HANDOFF, ROADMAP §1, `docs/level-editor.md`, the 1.2.0 release note and CHANGELOG | modify |

Boundaries: `renderer/data/*` never imports from screens or components. `bundle.js` imports `nextId` and `validate`
from `persistence.js`, `labelFileName` from `label-record.js`, `safeStem` and `fileStem` from `labels.js`,
`isHandPlaced` is NOT needed (the planner reads hashes and records only). `bundle-io.js` imports `writeJsonAtomic` and
`readJsonOrNull` from `store-io.js`. `screens/studies.js` imports the planner, the api functions, `hasStashedEditor`
and `forgetLevelEditor` from `../level-editor.js`, `releaseStudy` from `./analysis.js` (already imported) and
`forgetPrediction` from `../components/viewer.js` (already imported).

## Rulings made while planning (2026-10-15)

- **PB1. The validators move to `bundle-io.js`.** `main.js`'s `REAL_STUDY_ID` test with the ≥ 1000 range and
  `LABEL_FILE` become `isStudyId(id)` and `isLabelFileName(name)` exported from the root module, and `main.js`
  imports them; `isSafeName(name)` (no separator, no `..`, no leading dot, the label rule's character set, 1–200
  characters) guards every bundle path. *Cost if wrong:* a one-line import in `main.js`.
- **PB2. The renderer never sees film or sidecar bytes.** `read-bundle` returns parsed `study.json` and label records
  plus presence flags and absolute `filmPath`s; `export-bundle` and `import-bundle` copy files in the main process.
  *Cost if wrong:* none; it is the spec's §5.2.
- **PB3. Two IPC reads before an import plan.** After `read-bundle`, the screen computes `localFilmHash(study)` for
  every local real study; for the local studies that still lack one and share a bundle entry's `fileName` and have a
  `filePath`, it asks `hash-films`; then it loads the label records (`loadLabelRecord`) of every local study matched
  by hash and of every same-named local study with a record (the no-film fallback), and hands `planImport` the
  `localHashes` and `localRecords` maps. *Cost if wrong:* a few extra reads on large libraries.
- **PB4. `applyImport` is pure and the screen does ONE `setState`** after `import-bundle` resolves, so the store never
  names a sidecar or record that is not on disk. An update first releases the study's caches (`forgetLevelEditor`,
  `forgetPrediction`, `releaseStudy`) so the next open reads the new files. *Cost if wrong:* none.
- **PB5. `import-bundle` stops at the first failed action** and resolves what it placed; the screen applies only the
  placed actions and toasts how many were imported before the failure and why it stopped (spec §5.8). *Cost if
  wrong:* a re-import matches the placed studies by hash and skips them.
- **PB6. `export-bundle` writes `manifest.json` last**, and resolves even when every film is missing; only a failure
  to create the folder, write a `study.json` or write the manifest rejects. *Cost if wrong:* none; spec §4.2.
- **PB7. The smoke suite bypasses the native folder pickers.** The screen exports `exportBundleTo(parentDir)`,
  `importBundleFrom(dir)` and `confirmImport()` (the flows minus the picker); the buttons call `chooseFolder()` then
  these. The suite drives them through `window.__bundle`, as `smoke-levels.mjs` drives `window.__lv`. *Cost if
  wrong:* none.
- **PB8. Record timestamps compare by `Date.parse`;** an unparseable `saved_at` on either side counts as absent
  (skip unless the local has no record). *Cost if wrong:* a hand-edited record may be skipped.
- **PB9. Update keeps `labelFile` when the local study has one**, writing the bundle's record over it; otherwise the
  update takes a fresh clash-free name. *Cost if wrong:* none.
- **PB10. The release stays 1.2.0.** Task 8 extends `docs/releases/1.2.0.md` and the CHANGELOG's 1.2.0 entry with
  the bundle; no new bump, since 1.2.0 is unpublished. *Cost if wrong:* a bump is one commit.

---

### Task 1: The planner's names and the export plan

**Files:**
- Modify: `renderer/data/labels.js` (`safeStem` moved in, exported), `renderer/data/label-record.js` (imports it; `labelFileName` unchanged)
- Create: `renderer/data/bundle.js`
- Test: `test/labels.test.js`, `test/label-record.test.js` (unchanged behaviour), `test/bundle.test.js`

**Interfaces:**
- Consumes: `fileStem(name)` and `safeStem(stem)` from `labels.js`; `labelFileName(stem, taken)` from `label-record.js`.
- Produces: `BUNDLE_SCHEMA = 'spinecontour.bundle/1'`;
  `bundleFolderName(now: Date, taken: Iterable<string>) -> string` (`spine-contour-export-YYYY-MM-DD-HHMM`, local
  time, `-2`, `-3` on a case-insensitive clash);
  `studyFolderName(stem, taken) -> string` (`safeStem`, then `-2`, `-3` on a case-insensitive clash);
  `localFilmHash(study) -> string|null` (`study.calibration?.source_sha256 ?? study.geometry?.source_sha256 ?? null`,
  only a 64-hex string);
  `planExport(studies, now, takenFolderNames) -> { name, entries }` where each entry is
  `{ dir, sourceId, fileName, filePath, study, labelFile, calibrationDigest }`: `study` is the record with
  `filePath: null` (every other field as given), `labelFile` the study's or null, `calibrationDigest`
  `study.calibration?.source_sha256 ?? null`; demo studies dropped; entries in the given order;
  `exportMessage({ path, written, filmsMissing, notRead }) -> string`.

- [x] **Step 1: Write the failing tests**

`test/labels.test.js`: `safeStem` where it now lives (move the cases `label-record.test.js` has for it, keeping that
file's `labelFileName` tests). `test/bundle.test.js`:

```js
test('bundleFolderName is spine-contour-export-<date>-<HHMM> in local time with -2, -3 on a case-insensitive clash', ...);
  // new Date(2026, 9, 15, 14, 32) → 'spine-contour-export-2026-10-15-1432'; taken ['SPINE-CONTOUR-EXPORT-2026-10-15-1432'] → '-2'; both → '-3'
test('studyFolderName uses the safe stem and suffixes clashes', ...);   // 'a:b' → 'a_b'; taken ['A_B'] → 'a_b-2'
test('localFilmHash prefers the calibration digest, then the geometry digest, else null', ...);
test('planExport drops demo studies, clears filePath on the study copy, keeps the source path on the entry, and names folders without clashes', ...);
  // two real studies with fileName 'film.png' → dirs 'film' and 'film-2'; entries[0].study.filePath === null; entries[0].filePath === 'C:\\x\\film.png'; the input records are not mutated
test('exportMessage names the count and path, then the missing-film and not-read clauses only when non-zero', ...);
  // { path: 'P', written: 12, filmsMissing: [], notRead: [] } → 'Exported 12 studies to P'
  // filmsMissing ['a.png','b.png'], notRead ['SP-1003 sidecar'] → 'Exported 12 studies to P · 2 films were not found and were left out (a.png, b.png) · 1 sidecar could not be read (SP-1003 sidecar)'; 'study' singular at 1
```

- [x] **Step 2: Run the three files to verify they fail**

Run: `node --test test/labels.test.js test/label-record.test.js test/bundle.test.js`
Expected: FAIL — `safeStem` not exported from `labels.js`; `bundle.js` missing.

- [x] **Step 3: Implement**

Move `safeStem` (with its `STEM_MAX`, `UNSAFE_CHARACTERS`, `DEVICE_NAME` constants and comment) into `labels.js`,
export it, import it in `label-record.js`. Create `bundle.js` with the exports above; the clash suffix logic is one
shared helper used by both name functions and by Task 4's label naming.

- [x] **Step 4: Run the whole suite**

Run: `node --test test/*.test.js` — PASS, 1024 + the new tests.

- [x] **Step 5: Commit**

```bash
git add renderer/data/labels.js renderer/data/label-record.js renderer/data/bundle.js test/labels.test.js test/label-record.test.js test/bundle.test.js
git commit -m "feat: the bundle planner's names and export plan; safeStem moves to labels.js"
```

---

### Task 2: The root module: validators, export, read, hash

**Files:**
- Create: `bundle-io.js`
- Modify: `main.js:48-66` (`predictionPath`, `labelPath` use the imported validators; `REAL_STUDY_ID` and `LABEL_FILE` removed), `package.json:25-37`, `electron-builder.preview.yml:13-24`
- Test: `test/bundle-io.test.js` (temp folders, the `store-io.test.js` pattern)

**Interfaces:**
- Consumes: `writeJsonAtomic`, `readJsonOrNull` from `store-io.js`; Task 1's entry shape.
- Produces (all exported from `module.exports`):
  `isStudyId(id) -> boolean` (`/^SP-\d{4,}$/` and the number ≥ 1000);
  `isLabelFileName(name) -> boolean` (`main.js`'s `LABEL_FILE` rule);
  `isSafeName(name) -> boolean` (1–200 characters, none of `\ / : * ? " < > |` or U+0000–U+001F, not starting with `.`, not `..`);
  `exportBundle({ parent, name, entries, appVersion, paths }) -> Promise<{ path, written, filmsMissing, notRead }>`
  where `appVersion` is the string written as the manifest's `app_version` and
  `paths = { predictions, labels, calibrations }` are absolute folders; per entry: `mkdir <parent>/<name>/<dir>`,
  write `study.json` (the entry's `study`), copy `<paths.predictions>/<sourceId>.json` to `prediction.json` when it
  exists, copy `<paths.labels>/<labelFile>` to `<labelFile>` when named and present, copy
  `<paths.calibrations>/<calibrationDigest>.json` to `calibration.json` when named and present, stream the film from
  `filePath` to `film/<fileName>` while hashing (SHA-256 hex) — a null, missing or unreadable film adds `fileName` to
  `filmsMissing` and leaves `film: null`; a sidecar or record that exists but cannot be read (`readJsonOrNull` null)
  adds `<sourceId> sidecar` / `<labelFile>` to `notRead`; then `manifest.json` last, with `schema`, `app_version`
  (the `appVersion` argument), `exported_at` (ISO), and per study `{ dir, source_id, file_name, film,
  film_sha256, prediction, label, calibration }` (`null` where absent);
  `readBundle(dir) -> Promise<{ manifest, entries }>`: rejects `This folder is not a Spine Contour bundle.` when
  `manifest.json` is missing, unparseable or has no `schema`, and `This bundle was written by a newer Spine Contour
  (schema <id>). Update the app to import it.` when `schema !== BUNDLE_SCHEMA`; each entry
  `{ dir, manifest: <the entry>, study, record, has: { prediction, calibration, film }, filmPath, problems }` where
  `study` is the parsed `study.json` or null, `record` the parsed label record or null, `filmPath` the absolute film
  path or null, and `problems` lists `unsafe path` (any manifest path failing `isSafeName`, `film` allowed one
  `film/` prefix) or `study.json unreadable`; an unsafe entry has every `has` false and no `filmPath`;
  `hashFiles(paths) -> Promise<Record<string, string|null>>` (SHA-256 hex, null when unreadable, streamed).

- [x] **Step 1: Write the failing tests**

```js
test('isStudyId accepts SP-1000 and up, rejects SP-0999, demo ids, and non-strings', ...);
test('isLabelFileName and isSafeName accept bare names and reject separators, .., leading dots, control characters, and over-long names (Review Focus 1)', ...);
test('exportBundle writes study.json, copies the sidecar, record and calibration when present, streams the film with its hash, and writes the manifest last', ...);
  // temp userData with predictions/SP-1000.json, labels/film.label.json, calibrations/<64 hex>.json, a film file; after: manifest.studies[0].film === 'film/film.png', film_sha256 equals createHash of the file, prediction 'prediction.json', label 'film.label.json', calibration 'calibration.json'; the manifest's mtime is the newest file (or: a spy on writeJsonAtomic order)
test('a missing film leaves film null and names it; a sidecar that is not JSON is left out and named (Review Focus 3)', ...);
test('readBundle refuses a folder without a manifest, a manifest with another schema, and a newer schema with the spec\'s messages', ...);
test('readBundle returns parsed study and record, presence flags, the absolute film path, and marks an entry with a separator in dir or film as unsafe', ...);
test('hashFiles hashes each path and gives null for a missing file', ...);
```

- [x] **Step 2: Run the file to verify it fails**

Run: `node --test test/bundle-io.test.js` — FAIL (module missing).

- [x] **Step 3: Implement `bundle-io.js`; `main.js` adopts the validators; both allowlists gain `bundle-io.js`**

`main.js`'s `predictionPath` becomes `if (!isStudyId(id)) throw new Error('Invalid study id.')` and `labelPath`
`if (!isLabelFileName(name)) throw new Error('Invalid label file name.')`, their messages unchanged (the smoke suites
assert them). Streaming: `fs.createReadStream` piped through a `crypto.createHash('sha256')` and to the
`createWriteStream` destination; copies of JSON files use `copyFile`. `exportBundle`'s `app_version` comes from
`entries`' sibling argument `appVersion`.

- [x] **Step 4: Run the whole suite** — PASS.

- [x] **Step 5: Commit**

```bash
git add bundle-io.js main.js package.json electron-builder.preview.yml test/bundle-io.test.js
git commit -m "feat: bundle-io writes, reads and hashes a bundle in the main process; its validators guard main's paths"
```

---

### Task 3: Placing an import, and the four channels

**Files:**
- Modify: `bundle-io.js` (`placeImport`), `main.js` (four handlers after `delete-label-record`, ~:416), `preload.js`, `renderer/api.js` (after `deleteLabelRecord`)
- Test: `test/bundle-io.test.js`, `test/api.test.js`

**Interfaces:**
- Consumes: Task 2's validators and paths; `calibrationStore.save(reference)` from `main.js`'s store.
- Produces: `placeImport({ dir, actions, paths, saveCalibration }) -> Promise<{ placed: string[], failed: { id, message } | null }>`
  where each action is `{ kind: 'add'|'update', dir, id, prediction: 'prediction.json'|null, deleteLocalPrediction: boolean, label: { from, to }|null, calibration: 'calibration.json'|null }`:
  in order per action — the sidecar copied to `<paths.predictions>/<id>.json` (or the local one unlinked when
  `deleteLocalPrediction`, ENOENT ignored), the record copied to `<paths.labels>/<label.to>`, the calibration file
  parsed and handed to `saveCalibration`; every `id` must pass `isStudyId`, every `label.to` `isLabelFileName`,
  every `dir`/`label.from` `isSafeName`, else the action fails with `Invalid import action.`; the first failure stops
  the loop and is returned as `failed`.
  IPC: `export-bundle` `({ parent, name, entries, appVersion })` → `exportBundle` with `paths` under `userData`,
  after checking `parent` is an existing directory (`The folder was not found.`); `read-bundle` `(dir)` →
  `readBundle`; `hash-films` `(paths: string[])` → `hashFiles` (each path a string; at most 500); `import-bundle`
  `({ dir, actions })` → `placeImport` with `saveCalibration: (ref) => calibrationStore.save(ref)`.
  `preload.js` and `api.js`: `exportBundle(request)`, `readBundle(dir)`, `hashFilms(paths)`, `importBundle(request)`;
  `importBundle` is gated by `assertWritable()`; the others are reads of the bundle or writes outside the data
  folder and are not gated.

- [x] **Step 1: Write the failing tests**

```js
// bundle-io.test.js
test('placeImport copies a sidecar under the new id, the record under its new name, saves the calibration through the callback, and unlinks a local sidecar when told to', ...);
test('placeImport refuses an action with an unsafe dir, id or label name and reports it as the failure, placing nothing after it (Review Focus 1)', ...);
test('placeImport stops at the first failed copy and returns what it placed', ...);   // a bundle sidecar path that does not exist
// api.test.js (the withWindow stub pattern)
test('importBundle is gated by persistence; exportBundle, readBundle and hashFilms are not', ...);
test('the four bundle channels forward their arguments to the bridge', ...);
```

- [x] **Step 2: Run the two files to verify they fail** — FAIL (functions missing).

- [x] **Step 3: Implement** the four handlers in `main.js` (display-ready throws only, as `choose-folder`'s neighbours), the bridge entries and the api functions.

- [x] **Step 4: Run the whole suite** — PASS.

- [x] **Step 5: Commit**

```bash
git add bundle-io.js main.js preload.js renderer/api.js test/bundle-io.test.js test/api.test.js
git commit -m "feat: import placement in the main process and the four bundle channels"
```

---

### Task 4: The import plan

**Files:**
- Modify: `renderer/data/bundle.js`
- Test: `test/bundle.test.js`

**Interfaces:**
- Consumes: `validate` and `nextId` from `persistence.js`; `labelFileName` from `label-record.js`; Task 2's `readBundle` entry shape.
- Produces:
  `planImport({ bundle, studies, localHashes, localRecords, editing, now }) -> { add, update, skip, actions }` where
  `bundle` is `readBundle`'s result, `studies` the local list, `localHashes` `{ [id]: sha256|null }`,
  `localRecords` `{ [id]: { saved_at, image_sha256 }|null }` for the studies the screen read, `editing` a `Set` of
  local ids open in edit mode or stashed, `now` a Date (for nothing yet; reserved);
  per bundle entry in manifest order: `malformed` when `entry.problems` is non-empty, `entry.study` is null, or
  `validate({ version: 1, studies: [entry.study] })` throws; else match = a local real study whose `localHashes[id]`
  equals `entry.manifest.film_sha256` (when non-null), or, when the bundle film is null, a same-`fileName` local study
  whose `localRecords[id].image_sha256` equals `entry.record.image.sha256`; no match → `add` with `id` from `nextId`
  over the local list plus the ids assigned so far, `labelFile` from `labelFileName(fileStem(fileName), taken)` when
  the entry has a record (taken = the library's label files plus those assigned), `filePath` =
  `entry.filmPath`; match in `editing` → `skip` `being edited`; match with a bundle record and no local record → `update`;
  match with both records and the bundle's `saved_at` later (PB8) → `update`; else `skip` `already in the library`;
  two entries matching one local study → the later-saved one wins, the other skipped `already in the library`;
  `update` carries `{ id, labelFile (local or fresh), entry }`; `actions` is the Task 3 action list for adds and
  updates (`deleteLocalPrediction` true when the local study has a sidecar-bearing result and the entry has none);
  `applyImport(studies, plan, placedIds) -> studies'` (pure; `placedIds` the ids `placeImport` reported placed, every
  add and update by default): adds appended at the end as the entry's `study` with the new `id`,
  `filePath`, `labelFile`, `labelComment` (`study.labelComment ?? normalizeComment(record.comment)`), `addedAt` kept;
  updates patch the local record with the spec §5.7 field list from the entry's `study`, keeping `id`, `filePath`,
  `addedAt`, `name`, `workspaceFolder`, `subjectId`, `timepoint`, `filmDate`, `note`, `clinical`;
  `importPromptText(plan, dir) -> string`; `importMessage(result) -> string` where result is
  `{ added, updated, skipped: [{ fileName, reason }], withoutFilm: string[], stoppedAt: { fileName, message }|null }`.

- [x] **Step 1: Write the failing tests** — one per row of the spec's §5.4 table, plus:

```js
test('a malformed study.json is skipped and the others import (Review Focus 2)', ...);
test('matching is by film hash, never by file name alone', ...);            // same name, different hash → add
test('the no-film fallback matches by the records\' image.sha256 among same-named local studies', ...);
test('newer saved_at updates; equal, older or unparseable skips; no record on either side skips (PB8)', ...);
test('a matched study in edit mode or stashed is skipped as being edited (Review Focus 5)', ...);
test('the same bundle planned twice against the library it produced adds nothing (Review Focus 4)', ...);
test('ids and label names are assigned in manifest order without clashing with the library or each other', ...);
test('applyImport appends adds, patches updates with the §5.7 fields only, never mutates its input', ...);
test('importPromptText and importMessage read as the spec writes them', ...);
```

- [x] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Whole suite** — PASS.

- [x] **Step 5: Commit**

```bash
git add renderer/data/bundle.js test/bundle.test.js
git commit -m "feat: the bundle import plan: matching by film hash, newer annotation wins, one pure store patch"
```

---

### Task 5: Export from the Find tab

**Files:**
- Modify: `renderer/screens/studies.js` (the bar builder ~:770-806; a new export flow near `deleteSelectedStudies`), `styles/screens/studies.css`
- Test: the smoke suite (Task 7)

**Interfaces:**
- Consumes: `rowsToExport`, `planExport`, `exportMessage`, `chooseFolder`, `exportBundle`, `appVersion()` from `data/label-record.js`, `showToast`.
- Produces: a button `[data-find-key="export-bundle"]` on the bar after Delete, labelled `Export N selected` when
  any visible real row is ticked, else `Export all`, `Exporting…` and disabled while in flight, disabled with the
  bar's title under the Global Constraints' conditions and with `Nothing to export` when no visible real row exists; `export async function exportBundleTo(parentDir)` (the flow
  minus the picker: plan from `rowsToExport(visible real rows, paramSelected)`, `exportBundle`, the toast) and the
  button's handler `chooseFolder().then(dir => dir && exportBundleTo(dir))`; a module-scope `exporting` flag in the
  bar's rebuild key.

- [x] **Step 1: Implement** the button, the flow and CSS (the button takes `.btn.btn-small` like Delete). Nothing to
  unit-test: the flow is picker + api + toast.
- [x] **Step 2: Run the whole suite** — PASS (unchanged). Launch from source on a scratch profile with two synthetic
  films, click Export all, pick a folder, open it: `manifest.json` and one folder per film. No real film on screen.
- [x] **Step 3: Commit**

```bash
git add renderer/screens/studies.js styles/screens/studies.css
git commit -m "feat: Export all / Export N selected writes a bundle folder from the Find tab"
```

---

### Task 6: Import into the library

**Files:**
- Modify: `renderer/screens/studies.js` (`dropzone()` ~:167; the import flow; the inline prompt in the bar), `styles/screens/studies.css`
- Test: the smoke suite (Task 7)

**Interfaces:**
- Consumes: `readBundle`, `hashFilms`, `loadLabelRecord`, `importBundle`, `planImport`, `applyImport`,
  `importPromptText`, `importMessage`, `localFilmHash`; `hasStashedEditor`, `forgetLevelEditor`; `releaseStudy`,
  `forgetPrediction`; `nextId` is the planner's.
- Produces: `Import bundle…` (`[data-find-key="import-bundle"]`, `.btn.btn-small`) beside Choose radiograph in the
  dropzone (its click stops propagation like Choose's); `export async function importBundleFrom(dir)`: `readBundle`,
  the two local reads of PB3, `editing` = `{ state.openId when state.editing } ∪ stashed ids`, `planImport`; a plan with
  nothing to add or update → toast `Nothing to import: <reasons>`; else the inline prompt in the bar
  (`[data-find-key="import-prompt"]`, text `importPromptText`, buttons `[data-find-key="import-confirm"]` `Import` and
  `[data-find-key="import-cancel"]` `Cancel`, focus on Cancel, the delete prompt's style); `export async function
  confirmImport()`: `importBundle({ dir, actions })`, then for each placed update `forgetLevelEditor(id)`,
  `forgetPrediction(id)`, `releaseStudy(id)`, then ONE `setState` with `applyImport` over the placed actions only
  (PB4, PB5), then the toast; a module-scope `importing` flag and `pendingImport` in the bar's rebuild key; the
  button disabled under the Global Constraints' conditions.

- [x] **Step 1: Implement** the button, the flow, the prompt, the CSS.
- [x] **Step 2: Run the whole suite** — PASS. From source: export from one scratch profile, launch a second, import,
  the rows appear; import again, all skipped.
- [x] **Step 3: Commit**

```bash
git add renderer/screens/studies.js styles/screens/studies.css
git commit -m "feat: Import bundle… reads a bundle, plans adds and updates, confirms inline, and applies them in one patch"
```

---

### Task 7: The smoke suite

**Files:**
- Create: `tools/smoke/smoke-bundle.mjs`
- Modify: `tools/smoke/README.md`

**Interfaces:**
- Consumes: `tools/smoke/cdp-lib.mjs` (`connect`, `quitApp`), `launch.mjs` with `SPINE_CONTOUR_USER_DATA` per
  profile and `SMOKE_KEEP_PROFILE=1` for a relaunch; the page's modules (`./renderer/store.js`, `./renderer/api.js`,
  `./renderer/screens/studies.js` for `exportBundleTo` / `importBundleFrom` / `confirmImport` and `newStudy`,
  `./renderer/level-editor.js` for `setLevelComment` / `saveLevelEdits`); `smoke-levels.mjs`'s fixture construction
  (a canvas-drawn 600x800 film, a segmented fixture with a sidecar via `api.savePrediction`, a hand-placed one
  written to `%TEMP%`) as the model.

- [x] **Step 1: Write the suite** in three phases, each on its own launch, ids `SP-9400`–`SP-9405`:
  - `a` (profile `%TEMP%\spine-contour-bundle-a`, fresh): inject a segmented fixture SP-9400 with a sidecar and a
    label record (write one through `api.saveLabelRecord` built with `toLabelRecord` from the page, with `comment`
    `'from A'`, and set `labelFile`, `labelComment`, `reviewedAt` on the study) and an unsegmented film SP-9401 whose
    PNG is on disk under `%TEMP%\spine-contour-bundle-films\`; `exportBundleTo('%TEMP%\spine-contour-bundle-out')`;
    checks: the toast `Exported 2 studies to …`; the folder has `manifest.json` with `schema` and two entries; each
    `study.json` has `filePath` null and the right `fileName`; SP-9400's folder has `prediction.json` and its record
    with `comment` `'from A'`; SP-9401's `film/<name>` bytes hash to its `film_sha256`; the manifest's `prediction`
    is null for SP-9401. Write the bundle path to `tools/smoke/out/bundle-path.txt` for the next phase.
  - `b` (profile `…-bundle-b`, fresh): `importBundleFrom(<path>)` → the prompt reads `Import from …: 2 to add, 0 to
    update, 0 to skip. The films stay in this folder, so keep it where it is.`; `confirmImport()` → toast `Imported 2
    studies, updated 0, skipped 0`; two rows; the segmented one's pill reads Reviewed and its `labelComment` is
    `'from A'`; its sidecar exists under B's `predictions/` under the new id and `predictionMatchesStudy` holds (open
    it: the film shows from its stored image, DOM read); the search `from A` matches it; `importBundleFrom` again →
    `Nothing to import: already in the library: <both names>`; then on B: open the segmented one, enter edit mode,
    `setLevelComment('from B')`, `saveLevelEdits()`, exit; `exportBundleTo('%TEMP%\spine-contour-bundle-out-b')`.
  - `c` (profile `a` again with `SMOKE_KEEP_PROFILE=1`): `importBundleFrom(<B's bundle>)` → `1 to add` is 0, `1 to
    update, 1 to skip` (the unsegmented one has no record on either side); confirm → `Imported 0 studies, updated 1,
    skipped 1 (already in the library: …)`; SP-9400's `labelComment` is `'from B'` and its record on disk has
    `comment` `'from B'`; its `labelFile` unchanged. `finally` of each phase removes its studies, sidecars, records,
    films and the bundle folders.
- [x] **Step 2: Run** the three phases in order (`SMOKE_PHASE=a|b|c`), each `> tools/smoke/out/smoke-bundle-<phase>.txt 2>&1`, quitting between launches; every line PASS.
- [x] **Step 3: README** (the suite, its phases, profiles and counts). **Commit:**

```bash
git add tools/smoke/smoke-bundle.mjs tools/smoke/README.md
git commit -m "test: a two-profile smoke suite for the bundle export and import"
```

---

### Task 8: The records

**Files:**
- Create: `docs/bundles.md` (what a bundle holds; the identifiers warning, B3; keep the folder, B5; the duplicate rule, B4; where the buttons are)
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` (the root module and its exports; the four channels in the IPC list near `readCsv` at ~:506; `api.js`'s list; `data/bundle.js`'s boundaries; `safeStem`'s move), `docs/superpowers/HANDOFF.md` and `CLAUDE.md` (first sections), `README.md` (one line if it lists features; else untouched), `docs/level-editor.md` "The label record" (the record travels in bundles), `docs/ROADMAP.md` §1 (a note that the bundle is the annotation round trip; the CSV import stays), `docs/releases/1.2.0.md` and `CHANGELOG.md` (the 1.2.0 entries gain the bundle, PB10), `tools/smoke/README.md` (done in Task 7)

- [x] **Step 1: Make every edit**, each in the document's own voice, naming B1–B9 and PB1–PB10.
- [x] **Step 2:** `grep -rn "bundle" docs/ROADMAP.md README.md` reads consistently; `node --test test/*.test.js` still passes (no code touched).
- [x] **Step 3: Commit**

```bash
git add docs CLAUDE.md README.md CHANGELOG.md
git commit -m "docs: the bundle export and import in the records and the 1.2.0 release note"
```

---

### Task 9: The human gate (the owner's)

The session stops here and waits for "gate passed". The single PR (both rounds, 1.2.0) is pushed only then.

- [ ] On the scratch profile: Export all from a library of three real films (one segmented, one hand-placed, one
      unsegmented) to a folder on a USB stick or a second folder; open the bundle: one folder per film with the
      original film, `study.json`, the sidecar and the record where they exist.
- [ ] On the other computer (or a second scratch profile): Import bundle…, the prompt's counts, Import; the films
      open, the segmented one on its stored image, the hand-placed one on its original; re-run on an imported DICOM
      works; window / level works on it.
- [ ] Import the same bundle again: all skipped, already in the library.
- [ ] Edit a comment on one side, export, import on the other: one updated, the comment replaced; the local film
      path, name and subject untouched.
- [ ] Export with a film moved away: the toast names it, the study still imports without a film.

---

## Ledger

Filled during execution (2026-10-15, subagent-driven development in this worktree, the plan at `69a7262`, baseline unit
1024/1024 confirmed): the pre-flight scan's rulings, every ruling made on the way with what it costs if wrong, one row
per task, and the deferred minors in one list for the final whole-branch review to triage. The planning rulings PB1–PB10
are above and stood unchanged. The execution rulings are numbered S1–S36 in the order they were made; where one amends
another it says so (S21 amends S8). The session's working ledger
(`.superpowers/sdd/2026-10-15-annotation-bundle-export-import/`, local and untracked) is where these lines were written
first; this section is their copy in the repository (S36).

### Pre-flight scan (2026-10-15)

Before Task 1 every pair of tasks sharing a file or an interface was traced by hand (eleven pairs: the planner's entry
shape into the export, the folder-name helper into the screen, the read entry into the import plan, the two tasks
editing `bundle-io.js` and `main.js`, the screen flows into the smoke suite, the plan's boundaries against the spec's
section 6) and every task's own text was checked against the tree (eleven checks: the plan's quoted `main.js` anchors,
`validate`'s behaviour on a bad record, `safeStem`'s tests, the store's `openId`, `editing` and `hasStashedEditor`, the
button states against the Global Constraints). Most pairs were consistent; eight points needed a ruling:

- Ruling S1: the bundle folder's clash inside the chosen parent is resolved by `exportBundle` in the main process (mkdir
  of `<parent>/<name>` non-recursive; on EEXIST retry `<name>-2`, `-3`, … and report the folder actually created as
  `path`); `bundleFolderName(now, taken)` stays as the plan writes it (taken defaults to none) and the screen passes no
  `taken` — the renderer has no directory listing and the spec puts the clash "inside the chosen parent", which only
  main can see. Cost if wrong: the suffix rule lives twice (one pure, one mkdir loop); on a case-sensitive filesystem a
  case-different name does not clash.
- Ruling S2: Task 4 names label files with `labelFileName(fileStem(fileName), taken)` as its own text says; Task 1's
  shared clash helper serves `bundleFolderName` and `studyFolderName` only. Cost if wrong: none (labelFileName's suffix
  rule is the same, case-insensitive).
- Ruling S3: `readBundle` sets `filmPath` only when the manifest names a film AND the file exists (`has.film` true);
  otherwise null, so an import of a damaged bundle adds the study without a film (spec §5.6's "without film"). Cost if
  wrong: a study imported without a film that a later copy of the bundle would have had.
- Ruling S4: `exportBundle` validates every entry before writing anything: `dir` with isSafeName, `sourceId` with
  isStudyId, `labelFile` (when non-null) with isLabelFileName, `calibrationDigest` (when non-null) as 64 hex; any
  failure rejects with `Invalid export entry.`. A `fileName` failing isSafeName (a leading dot, a control character)
  counts that film as missing (`filmsMissing`, `film: null`) so the study still exports. Cost if wrong: one film left
  out of a bundle, named in the toast.
- Ruling S5: `bundle.js` does not import `isHandPlaced` (the plan's boundaries); the spec's §6 line listed it before the
  planner's matching was designed on hashes and records alone. Cost if wrong: one import line.
- Ruling S6: `test/labels.test.js` gains direct `safeStem` tests restating the R12 cases on the stem;
  `test/label-record.test.js` is left as it is (its labelFileName tests already cover the move's "unchanged behaviour").
  Cost if wrong: a duplicated test case.
- Ruling S7: `planImport` keeps the normalized record `validate(...)[0]` returns as the entry's study for `applyImport`,
  not the raw parsed `study.json`, so an import carries exactly the shape `load-studies` would accept. Cost if wrong:
  none (export wrote the validated shape).
- Ruling S8: "the local study has a sidecar-bearing result" means `study.predictionId != null` (a model run records one
  from v1.0.10 on, and only such results have a sidecar `predictions/<id>.json` to delete); `deleteLocalPrediction` is
  true when that holds and the bundle entry has no `prediction`. Cost if wrong: a pre-1.0.10 sidecar-less result leaves
  nothing to delete, which is harmless (ENOENT ignored).

### Per task

| Task | Implementer | Commits | Review | Fix rounds | Counts |
|---|---|---|---|---|---|
| 1 | Sonnet | `69a7262..a810827` | Opus: clean, one ⚠️ (S9); a minor folded into Task 4 (S10) | 0 | unit 1040/1040 |
| 2 | Sonnet | `a810827..5b3002c` (`8bd1375`, fix `5b3002c`) | Opus: Needs fixes, 1 Important (a non-string `fileName` rejected the whole export, against S4); re-review Sonnet clean | 1 | unit 1058/1058 (17 new in `8bd1375`) |
| 3 | Opus | `5b3002c..53ade2b` (`a0ea315` amended to `53ade2b`: the trailer only) | Opus: Approved, no Critical or Important | 0 | unit 1065/1065 (7 new) |
| 4 | Sonnet | `53ade2b..0e79356` (`9f185b6`, fix `0e79356`) | Opus: Needs fixes, 1 Important (S8 deleted a sidecar that still matched, lost image for good; S21 amends it, S20 added); re-review Sonnet clean | 1 | unit 1102/1102 (35 new in `9f185b6`) |
| 5 | Opus | `0e79356..21e45d5` | Opus: Approved, no Critical or Important | 0 | unit 1102/1102; source launch 24/24 over CDP (DOM, store and file reads, two canvas-drawn films) |
| 6 | Opus | `21e45d5..50d6311` (`5079860`, fix `50d6311`) | Opus: Needs fixes, 1 Important (a drop or Choose radiograph during placement could take an id the plan had reserved; S28, with S29–S31); re-review Sonnet clean | 1 | unit 1102/1102; CDP on two profiles, A 4/4 and B 20/20 and update path 6/6 before the fix, A 4/4 and B 15/15 after |
| 7 | Opus | `50d6311..188b103` | Opus: Approved, no Critical or Important; counts verified one to one against the output files | 0 | `smoke-bundle.mjs` phases a 17/17, b 18/18, c 9/9; unit 1102/1102 |
| 8 | Sonnet | `188b103..` the records commit | the controller's review follows this commit | — | unit 1102/1102 (no code touched) |

Reviewers were Opus on every task, Sonnet for the small scoped re-reviews after a fix round. The owner's trailer
(`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`) was verified from the commit log of each task; Task 3's
first commit carried the harness's own attribution and was amended (message only). Task 9, the human gate, is the
owner's and is not run.

### Rulings made on the way (S9–S36)

**Task 1.**

- Ruling S9 (Task 1 review ⚠️): `localFilmHash` returns the first VALID 64-hex digest (calibration, then geometry)
  rather than the literal `??` chain then validate — kept as built; a stored calibration digest is already validated
  (calibration.js:20), so the two forms differ only on data the store never holds. Cost if wrong: none observable.
- Task 1: minor (deferred): a study folder name can end in `.` or a space (bundle.js:38) — Windows tools cannot handle
  such names. Ruling S10: fold into Task 4 (same file): `studyFolderName` trims trailing dots and spaces, `film` when
  nothing is left. Cost if wrong: a folder name differing from its label stem by a trailing character.

**Task 2.**

- Ruling S11: `bundle-io.js` (CommonJS) holds its own `BUNDLE_SCHEMA = 'spinecontour.bundle/1'` and exports it; the
  renderer's `bundle.js` holds the same string; `test/bundle-io.test.js` asserts the two are equal. The root module
  stays standalone like store-io.js rather than requiring the renderer's ESM graph. Cost if wrong: a string in two
  places, pinned by a test.
- Ruling S12: `readBundle` adds the problem `label record unreadable` when the manifest names a label whose file is
  missing or does not parse (spec §5.2 "reported, not fatal": Task 4 then skips that entry as malformed and the rest
  imports); a manifest whose `studies` is not an array reads as not a bundle. Cost if wrong: a study with a damaged
  record is skipped instead of imported bare.
- Ruling S13 (Task 2 review ⚠️, the digest seam): `planExport` passes `calibrationDigest` only when it is 64 lower-case
  hex, else null (the planner's `SHA256_HEX` rule, as `localFilmHash` applies it), so one damaged digest in the library
  never blocks a whole export; `exportBundle` stays strict (a bad digest reaching it is a programming error). Folded
  into Task 4 (same file). Cost if wrong: a damaged calibration reference silently left out of a bundle.
- Task 2: minor (deferred): path hardening beyond the brief — symlinks/junctions inside a bundle are followed; Windows
  device names pass `isSafeName`; `sha256File` has no `isFile` check. Ruling S14: deferred, not blocking — bundles are
  the owner's own (B3) and the renderer that names hash paths is the app's own; the final review triages. Cost if wrong:
  a crafted bundle could read a file outside itself on the importing machine.

**Task 3.**

- Ruling S15: the persistence-gating test for `importBundle` lives in `test/api-persistence.test.js` (where
  `disablePersistence`, irreversible module state, is already exercised), and the forwarding test for the four channels
  in `test/api.test.js`; the plan named one file for both. Cost if wrong: a test in a different file than the plan says.

**Task 4.**

- Ruling S16: `importPromptText(plan, dir)` names the bundle by its last path segment (`lastSegment` from labels.js),
  not the full path the user just picked. Cost if wrong: a prompt line.
- Ruling S17: an update's `labelComment` uses the same expression as an add's (`study.labelComment ??
  normalizeComment(record.comment)`); spec §5.6 states the fallback for adds and §5.7 lists `labelComment` among the
  fields an update takes from the bundle. Cost if wrong: an updated study showing a comment the bundle's study.json did
  not carry but its record did.
- Ruling S18: two bundle entries matching one local study with neither `saved_at` parseable (only possible when the
  local has no record) → the first in manifest order wins. Cost if wrong: which of two hand-edited records lands.
- Ruling S19: `importMessage` for a stopped import reads `Imported <n> studies, updated <u>, skipped <s>[ (…)] · stopped
  at <fileName>: <message> Import the bundle again to continue.` (spec §5.8 gives the content, not the wording). Cost if
  wrong: a toast line.
- Ruling S20 (Task 4 concern 1 / review minor 1): when the manifest's `film_sha256` is null, the bundle entry's hash is
  `localFilmHash(entry's normalized study)` (its calibration or geometry `source_sha256`, the same film bytes' digest
  the local side already matches on), compared against `localHashes`; the record `image.sha256` fallback stays after it.
  An entry with no film, no result, no calibration and no record still matches nothing and is added each time (nothing
  to carry). Spec §5.3 gave no key for this case. Cost if wrong: none beyond the spec's own rule (file name alone never
  matches).
- Ruling S21 (amends S8): `deleteLocalPrediction` is true only when the local study has `predictionId != null`, the
  entry has no sidecar (`has.prediction` false), AND the bundle study's `predictionId` differs from the local one
  (`decision.study.predictionId !== local.predictionId`, null included — the hand-placed-over-model case S8 was written
  for). When the ids are equal the local sidecar still matches and is kept. Cost if wrong: an orphaned sidecar file when
  a re-run's sidecar was unreadable at export (harmless), against a stored image lost (the old S8).
- Ruling S22 (review minor 3): the record fallback also runs for a non-null `film_sha256` that is not a 64-hex digest (a
  hand-edited manifest) — kept as built; the fallback still needs the same file name and equal image hashes. Cost if
  wrong: none.

**Task 5.**

- Ruling S23: the Export button's disabled reason goes on its `title`, as Delete's does (the plan's Task 5 text says
  "the bar's title"; the Global Constraints' "visible note" is the segment button's pattern, whose label does not say
  what it would do). Cost if wrong: a tooltip where a note was wanted.
- Task 5: minor (deferred): an export in flight blocks nothing else — Delete, the row delete, Segment and Save edits
  stay live while main copies sidecars. Ruling S24: deferred to the final review and the owner — the spec disables
  export during a run, not runs during an export; the window is the copy's duration; a sidecar rewritten mid-copy is
  listed under notRead or copied whole (writeJsonAtomic renames), a deleted one reads as absent. Cost if wrong: a bundle
  naming one sidecar as not read.

**Task 6.**

- Ruling S25: while an import is reading or placing (`importing`), the bar's other actions are blocked as during a bulk
  delete (`barBlocked` gains `importing`), since the placement rewrites sidecars and records the other actions read;
  while the prompt is up (`pendingImport`) the prompt takes the bar's place, as Delete's does, so nothing else on the
  bar is reachable. Starting an import withdraws a pending Delete prompt. Cost if wrong: Export or Segment unavailable
  for the seconds an import takes.
- Ruling S26: a pending import plan is withdrawn silently in `update()` when `live.studies` is no longer the reference
  the plan was computed from, or the user leaves for the Parameters tab — mirroring the Delete prompt's withdrawal —
  because the plan's ids (`nextId`) and matches were computed against that list; `confirmImport()` with no pending plan
  does nothing. Cost if wrong: a prompt withdrawn by a subject edit or a run finishing, costing one more click.
- Ruling S27 (PB3 made concrete): the screen reads the label record of every local real study with a `labelFile` whose
  film hash equals any bundle entry's hash (manifest `film_sha256` or the entry study's `localFilmHash`) OR whose
  `fileName` equals any bundle entry's; a superset of what the rule needs, bounded by the bundle's size;
  `localRecords[id]` is `{ saved_at, image_sha256 }` or null when the read fails. `hashFilms` is called in batches of at
  most 500 paths. Cost if wrong: a few extra record reads.
- Ruling S28 (the id clash): closed where it manifests — after placement, `confirmImport` reads the current list and
  drops every placed add whose id is now taken (its placed files are orphans: a sidecar under the other study's id is
  ignored by predictionMatchesStudy and overwritten by that study's first run; a record under a fresh name is
  unreferenced), applying the rest and naming the dropped ones in the toast with ` · <k> not added because the library
  changed (<names>); import the bundle again`; updates apply as before. In addition the same-screen add paths
  (`handleChoose`, `handleDrop`, the zone's click and Enter) refuse while `importing` with the toast `Wait for the
  import to finish.`. The Workspace Load stays live (another screen) and is covered by the application-site guard. Cost
  if wrong: an add dropped and re-imported under a fresh id; a stray sidecar or record file.
- Ruling S29 (review minor 4, copy): a plan whose library changed during the read is not shown; `importBundleFrom`
  toasts `The library changed while the bundle was being read. Import it again.` instead of setting pendingImport. Cost
  if wrong: a toast line.
- Ruling S30 (review minor 2, copy): the Import button reads `Importing…` while `importing`, as Export reads
  `Exporting…`. Cost if wrong: a label.
- Ruling S31 (review minor 3): `stoppedAt.fileName`'s last-resort fallback is `a study`, never the SP id (the 2026-09-12
  rule: the record id is shown nowhere a person looks). Cost if wrong: none.
- Task 6: minor (deferred): a user who enters edit mode on an update target during the seconds of placement has those
  edits discarded by forgetLevelEditor; a Re-run started on an update target interleaves with the placement. Ruling S32:
  deferred — the window is the placement's duration and the prompt names what will be updated. Cost if wrong: an edit of
  a few seconds lost.
- Ruling S33: the S29 staleness check runs before both outcomes (the prompt and Nothing to import) — kept as built,
  since a stale list can make a Nothing-to-import wrong as well. Cost if wrong: one extra click.

**Task 7.**

- Ruling S34 (the plan's "finally of each phase removes its studies" cannot hold across the shared profile): phase a
  leaves its studies, records, sidecars, films and bundle in place (phases b and c need them); phase b removes its own
  profile's studies, sidecars and records at its end but keeps its bundle (`…-out-b`) for phase c; phase c removes
  profile A's studies, sidecars and records, the films folder, both bundle folders and `out/bundle-path.txt`. A phase
  that fails early still runs its own cleanup. Cost if wrong: scratch files left under %TEMP%.
- Ruling S35: both fixtures carry a real film on disk under `%TEMP%\spine-contour-bundle-films\` (the segmented one too,
  unlike smoke-levels' SP-9300), so the export streams and hashes both films and every match in phases b and c is by
  `film_sha256` against a hashed local film, the spec's primary rule; the record-hash fallback is the planner's unit
  tests' concern. Cost if wrong: none.

**Task 8.**

- Ruling S36: the plan file gains a `## Ledger` section (as the editor round's plan has) carrying this session's rulings
  S1–S35 verbatim with their costs, the per-task commit ranges and counts, and the deferred minors in one list — the
  project's convention is that a plan's Ledger holds every ruling, and the ignored SDD workspace is deleted after the
  final review. Cost if wrong: a longer plan file.

### Deferred minors, by task

Everything a task review or an implementer deferred, copied from the working ledger and left for the final whole-branch
review to triage, with the ⚠️ items carried into a later task. Some were closed by a later task or ruling, as each line
says (S10, S13, S20, S21 and S28–S31 among them); the final review reads the tree, not this list, to see which still
stand.

**Task 1.**

- Task 1: minor (deferred): a study folder name can end in `.` or a space (bundle.js:38) — Windows tools cannot handle
  such names. Ruling S10: fold into Task 4 (same file): `studyFolderName` trims trailing dots and spaces, `film` when
  nothing is left. Cost if wrong: a folder name differing from its label stem by a trailing character.
- Task 1: minor (deferred → Task 4): `clashFree`'s unused `ext` parameter (bundle.js:17); seed `dirs` with
  `manifest.json` so a study folder never collides with the root manifest (bundle.js:66); one running lower-cased set in
  `planExport` instead of a rebuilt set per study; assertions for `labelFile: ''` → null and a missing `fileName` →
  `film`.
- Task 1: minor (deferred): `calibrationDigest` unvalidated in the planner — covered by ruling S4 (exportBundle checks
  64 hex before building a path).

**Task 2.**

- Task 2 review ⚠️ carried into Tasks 3 and 4: `readBundle` returns `dir` unvalidated for unsafe rows and never
  validates `file_name` or `source_id`; consumers check `problems` first and never build a path from `file_name` or
  `source_id` (`placeImport` re-validates every name it uses).
- Task 2: minor (deferred → Task 4): reserved study-folder names `manifest.json` and `manifest.json.tmp` (the atomic
  write's temp name) must never be a study dir (seed the planner's taken set, ignoring case).
- Task 2: minor (deferred): `rowPaths` checks the manifest's `label` with `isSafeName` (200 chars) while export accepts
  `isLabelFileName` (211); check `row.label` with `isLabelFileName` in `readBundle` (bundle-io.js:250). Unreachable
  today (safeStem caps at 180).
- Task 2: minor (deferred): test/label-record.test.js:309 still holds a hard-coded copy of the label rule
  (`MAIN_LABEL_FILE`); import `isLabelFileName` from `../bundle-io.js` instead.
- Task 2: minor (deferred): untested branches — `Invalid export folders.`, a relative `parent`, a `parent` that is a
  file (ENOTDIR), the partial-film cleanup after a failed stream (checked only by an uncommitted scratch script).
- Task 2: minor (deferred): path hardening beyond the brief — symlinks/junctions inside a bundle are followed; Windows
  device names pass `isSafeName`; `sha256File` has no `isFile` check. Ruling S14: deferred, not blocking — bundles are
  the owner's own (B3) and the renderer that names hash paths is the app's own; the final review triages. Cost if wrong:
  a crafted bundle could read a file outside itself on the importing machine.

**Task 3.**

- Task 3: minor (deferred): a partly placed update (sidecar replaced, record or calibration step failed) is invisible to
  the renderer; the main.js comment "patches the store for exactly what is on disk" overclaims — correct the comment;
  optionally read calibration.json before the first write. Carried to Task 6 (the toast) and the final review.
- Task 3: minor (deferred → resolved by design in Task 4/6): the calibration store's two sentences do not name the
  study; `importMessage`'s `stoppedAt: { fileName, message }` names it. `calibrationFailure` passes any Error without a
  `code` through — latent (normalizeCalibration cannot throw a TypeError today).
- Task 3: minor (deferred): `isExistingFolder` in main.js uses sync `existsSync`/`statSync` (a disconnected network
  drive could block the main thread); use `fsPromises.stat`.
- Task 3: minor (deferred): untested — a sidecar that parses but fails to copy (`could not be copied`), a rename failure
  leaving a `.tmp` (destination is a folder).
- Task 3: minor (deferred): the `hash-films` comment says "50 MB reads"; the cap belongs to read-file; `hashFiles` has
  no size cap.
- Task 3: minor (deferred): the data-folder joins live in three places in main.js (`bundleDataFolders`,
  `predictionPath`, `labelPath`/the calibration store).
- Task 3 ⚠️ carried to Task 6: `hash-films` caps a request at 500 paths — the screen batches larger lists. The channels
  have not run in the app (Task 7's smoke does).

**Task 4.**

- Task 4: minor (deferred → Task 6): an unread local record (`localRecords[id]` null) and a missing one are treated the
  same (the bundle's record overwrites it); Task 6 reads the record of every matched local study with a `labelFile` and
  of every same-named one (PB3). Pin with a test later.
- Task 4: minor (deferred): two local copies of one film match the first in library order (bundle.js:158) — untested;
  the decision objects' key names (`{ add }` vs `{ update, study }`); the last-resort skip name is the 0-based manifest
  index.
- Task 4 ⚠️ carried to Task 6: `localHashes` must be built from `localFilmHash(study)` first and `hashFilms` only for
  the same-named studies lacking one (PB3); `localRecords[id]` set for every local study whose record the screen read;
  `withoutFilm` built by the caller from the placed adds with `filePath` null.

**Task 5.**

- Task 5: minor (deferred): an export in flight blocks nothing else — Delete, the row delete, Segment and Save edits
  stay live while main copies sidecars. Ruling S24: deferred to the final review and the owner — the spec disables
  export during a run, not runs during an export; the window is the copy's duration; a sidecar rewritten mid-copy is
  listed under notRead or copied whole (writeJsonAtomic renames), a deleted one reads as absent. Cost if wrong: a bundle
  naming one sidecar as not read.
- Task 5: minor (deferred): Export disabled during a bulk delete shows no title; the picker window is unguarded (a fast
  double-click before the modal appears could invoke choose-folder twice: the second pick is dropped silently or written
  as a second bundle); the file's top docblock (studies.js:3–4) still says the bar holds Delete and the segment button.
- Task 5 ⚠️ (deferred to Task 7's smoke): the WAIT_FOR_BATCH and `Studies are not being saved` titles, and the bar's
  wrapping with one more button, were not read.

**Task 6.**

- Task 6 concern 3 (unfixed, needs a ruling): during the confirm's placement, Choose radiograph, a drop and a Workspace
  folder load stay live; `addStudy`'s `nextId` could reuse an id the plan reserved, giving two studies one id. Ruling
  deferred until the review reports on its reach.
- Task 6: minor (deferred): a user who enters edit mode on an update target during the seconds of placement has those
  edits discarded by forgetLevelEditor; a Re-run started on an update target interleaves with the placement. Ruling S32:
  deferred — the window is the placement's duration and the prompt names what will be updated. Cost if wrong: an edit of
  a few seconds lost.
- Task 6: minor (deferred → Task 7): the batch / persistence-off / deletingStudies states of the Import button, Segment
  disabled while importing, the navigation clearing of pendingImport, the stoppedAt and withoutFilm mapping were not
  exercised; `releaseStudy` already calls `forgetLevelEditor` (called twice, harmless).
- Task 6: minor (deferred): when both `stoppedAt` and a lost add occur, the lost-add clause lands after "Import the
  bundle again to continue." — awkward but readable.

**Task 7.**

- Task 7: minor (deferred): `openFromRow` and the persistence check print no useful failure detail
  (smoke-bundle.mjs:433, :502, :562, :577); a failed freshness precondition does not stop the phase (:388, :520) while
  the README says it fails at once; the two path-file checks cannot fail (:504, :603); two check names overclaim (:454
  "its record unchanged" compares the name only; :645 "now B's copy" would pass with A's sidecar); the header's run
  sequence drifted from the README's (:150–158).

