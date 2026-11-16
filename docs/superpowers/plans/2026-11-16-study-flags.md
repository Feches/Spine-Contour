# Flags on Films Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free-text flag list on every film, set from the Find list (one film or many) and the Analysis screen, filterable, and carried into the Parameters tab, both CSV exports, bundles and the label record.

**Architecture:** Flags live on the study record as `study.flags`. One pure module owns the rules (`renderer/data/flags.js`). One controller writes them (`renderer/study-flags.js`): a single store update, then `syncRecordFlags` in `renderer/level-editor.js`, which takes turns with Save edits and Mark reviewed on the label record. Screens read `study.flags` and edit through one shared DOM component that holds a draft and writes it when the box closes.

**Tech Stack:** Electron, vanilla ES modules, `node --test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-16-study-flags-design.md` (approved by the owner 2026-11-16). Read it before any task; section numbers below (§) are the spec's, and FLn are its decisions.

## Global Constraints

- Work only in this worktree (`.claude/worktrees/study-flags`, branch `claude/study-flags`). Never touch the main checkout at the repository root: it holds another branch with uncommitted work.
- No push, pull request, version bump or release. The owner tests first and says when.
- No bundler, framework or dependency: `dependencies` stays empty, `devDependencies` stays `electron` and `electron-builder`. Do not loosen the CSP.
- New files under `renderer/` and `styles/` are already covered by both electron-builder allowlists (`renderer/**/*`, `styles/**/*`). A new file anywhere else must be added to `package.json` `build.files` and `electron-builder.preview.yml` `files` together.
- Never mutate a study, a flag list or any store value in place; write new objects and arrays.
- The `SP-nnnn` id is never shown, exported or put in a toast or title.
- `STORE_VERSION` stays `1`, `BUNDLE_SCHEMA` stays `spinecontour.bundle/1`, `LABEL_SCHEMA` stays `spinecontour.segmentation-label/1`.
- A flag change never changes a film's status or `reviewedAt`, or a label record's `saved_at`, `app_version` or annotation.
- Comments are untouched (FL5): no change to where the comment is typed, saved, stored or shown.
- Exact values: a flag is 1 to 40 characters; at most 20 per film; `,` `;` and line breaks end a flag; a leading `#` is dropped; flags match ignoring case. Names: column `FLAGS`, CSV header `Flags`, paired header `<visit> flags`, record and study key `flags`, menu row `No flags`. CSV cells join with `; `, the Parameters cell with `, `.
- Unit tests: `node --test test/*.test.js` (in PowerShell quote the glob: `node --test "test/*.test.js"`). The directory form `node --test test/` fails on Node 24. Baseline on the branch point: 1265 passing.
- Pure logic gets real unit tests. DOM code gets the manual steps and smoke checks this plan names; do not write a fake test for it.
- No screenshot of a real radiograph is taken, read or sent. Check the running app by reading the page (DOM, store, files).
- Commits: conventional prefixes, one per task, written with `-m` flags (a heredoc containing the word "git" is refused by this worktree's shell guard). Every message ends with exactly one trailer line, `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`; a subagent must not substitute its own.

## Review Focus

Inputs the spec implies but its sections do not spell out. Each is pinned by a test in the task named.

1. **A library saved before flags, and demo studies: `flags` is missing.** Every reader treats missing as none: filter, sort, search, Parameters, both CSVs, the bundle merge. Tests in Tasks 2, 5, 10, 11, 12 each include a study with no `flags` key.
2. **Typed and pasted junk.** `#hardware, cement;  poor   segmentation` plus a line break, a 41-character flag, a 21st flag, text that is only `#` or spaces. Expected: three clean flags, the rest refused without an error. Task 1.
3. **A flag changed while a save is in flight, and Save edits clicked while a flag update is writing.** Expected: once writes settle the record's `flags` equal the study's, the levels the save wrote are intact, and the Save edits click is not dropped. Task 4.
4. **A label record that is missing, unreadable or malformed when a flag changes.** `labelFile` set but the load resolves `null`, rejects, or the record's `flags` is not a list. Expected: no file is created, the study's flags stand, a failed write is counted once in a toast. Task 4.
5. **The last film loses a ticked flag.** Expected: the tick stays, the list is empty, the menu still offers that flag; the Parameters dropdown keeps its choice. Tasks 5 and 10.

## File Structure

| File | Responsibility |
|---|---|
| `renderer/data/flags.js` (new) | The flag rules: clean, match, add, remove, in-use list, merge, editor choices, bulk state and change |
| `renderer/study-flags.js` (new) | The one writer: refusal reasons, `setStudyFlags`, the failure toast |
| `renderer/components/flag-editor.js` (new) | DOM only: chips at rest, the open editor's field and its suggestion list |
| `renderer/level-editor.js` | `syncRecordFlags`, taking turns with the two existing record writes |
| `renderer/data/label-record.js` | `flags` in `toLabelRecord`, `recordFlags`, `withRecordFlags` |
| `renderer/data/persistence.js`, `renderer/store.js` | The sanitizer line; default filter keys |
| `renderer/data/find.js` | Flags in the list's filter, sort and search |
| `renderer/components/filter-menu.js` | The any / every section |
| `renderer/screens/studies.js` | FLAGS column, row editor, FLAGS menu, bar button and bulk list, import wiring |
| `renderer/screens/analysis.js` | The FLAGS block in the side panel |
| `renderer/data/parameters.js`, `renderer/screens/parameters.js` | Flag dropdown and read-only column |
| `renderer/data/csv.js` | `Flags` and `<visit> flags` columns |
| `renderer/data/bundle.js` | Flags in the import plan, its application and its messages |
| `styles/components.css`, `styles/screens/studies.css`, `styles/screens/analysis.css` | Chips and editor; the grid's tenth track and the page cap; the Analysis block |
| `docs/design/level-editor/label-record.schema.json`, `label-record.example.json` | The optional `flags` property |

---

### Task 1: The flag rules

**Files:**
- Create: `renderer/data/flags.js`
- Test: `test/flags.test.js`

**Interfaces:**
- Produces (all pure, none mutates its arguments, every list returned is a new array):
  - `FLAG_MAX_LENGTH = 40`, `FLAGS_MAX = 20`, `NO_FLAGS = '__no_flags__'`
  - `cleanFlag(text) → string | null`
  - `flagKey(flag) → string` (the lower-cased flag; the value filters and maps key on)
  - `sameFlag(a, b) → boolean`
  - `sameFlagList(a, b) → boolean` (same length, same strings, same order; missing reads as empty)
  - `cleanFlags(value) → string[]`
  - `splitTyped(text) → string[]`
  - `addFlag(flags, flag) → string[]`, `removeFlag(flags, flag) → string[]`
  - `flagsInUse(studies) → string[]`
  - `librarySpelling(flag, inUse) → string`
  - `mergeFlags(local, incoming) → string[]`
  - `flagChoices({ inUse, draft, text }) → { kind: 'use' | 'create', flag: string }[]`
  - `bulkState(studies, ids, flag) → 'all' | 'some' | 'none'`
  - `bulkChange(studies, ids, flag, on) → { changes: { id: string, flags: string[] }[], full: number }`
  - `flagsText(flags, separator) → string`

- [ ] **Step 1: Write the failing tests** in `test/flags.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLAGS_MAX, cleanFlag, cleanFlags, splitTyped, sameFlag, sameFlagList, addFlag, removeFlag, flagsInUse,
  librarySpelling, mergeFlags, flagChoices, bulkState, bulkChange, flagsText,
} from '../renderer/data/flags.js';

test('cleanFlag trims, collapses spaces, drops a leading # and refuses what is not a flag', () => {
  assert.equal(cleanFlag('  poor   segmentation '), 'poor segmentation');
  assert.equal(cleanFlag('#hardware'), 'hardware');
  assert.equal(cleanFlag('## OLIF outcomes'), 'OLIF outcomes');
  assert.equal(cleanFlag('C#7'), 'C#7');
  assert.equal(cleanFlag('a'.repeat(40)), 'a'.repeat(40));
  for (const bad of ['', '   ', '#', 'a,b', 'a;b', 'a\nb', 'a'.repeat(41), null, 7, undefined]) assert.equal(cleanFlag(bad), null);
});

test('cleanFlags cleans a stored list, drops matches and junk, stops at 20, and never throws', () => {
  assert.deepEqual(cleanFlags([' hardware ', 'Hardware', '#cement', '', 7, 'a,b']), ['hardware', 'cement']);
  for (const junk of [undefined, null, 'hardware', 5, {}]) assert.deepEqual(cleanFlags(junk), []);
  assert.equal(cleanFlags(Array.from({ length: 25 }, (_, i) => `f${i}`)).length, FLAGS_MAX);
});

test('splitTyped reads a pasted list', () => {
  assert.deepEqual(splitTyped('#hardware, cement;  poor   segmentation\nhardware'), ['hardware', 'cement', 'poor segmentation']);
  assert.deepEqual(splitTyped(` # , ${'x'.repeat(41)}`), []);
});

test('addFlag and removeFlag return new lists and respect matches and the cap', () => {
  const flags = Object.freeze(['OLIF outcomes', 'hardware']);
  assert.deepEqual(addFlag(flags, 'cement'), ['OLIF outcomes', 'hardware', 'cement']);
  assert.deepEqual(addFlag(flags, 'HARDWARE'), ['OLIF outcomes', 'hardware']);
  assert.notEqual(addFlag(flags, 'HARDWARE'), flags);
  assert.deepEqual(removeFlag(flags, 'Hardware'), ['OLIF outcomes']);
  const full = Array.from({ length: 20 }, (_, i) => `f${i}`);
  assert.deepEqual(addFlag(full, 'one more'), full);
  assert.deepEqual(addFlag(undefined, 'cement'), ['cement']);
  assert.equal(sameFlag('Hardware', 'hardware'), true);
  assert.equal(sameFlagList(['a', 'b'], ['a', 'b']), true);
  assert.equal(sameFlagList(['a', 'b'], ['b', 'a']), false);
  assert.equal(sameFlagList(undefined, []), true);
});

test('flagsInUse gives one spelling per flag, the most used, A to Z ignoring case', () => {
  const studies = [{ flags: ['hardware', 'cement'] }, { flags: ['Hardware'] }, { flags: ['hardware'] }, { flags: ['Zeta', 'alpha'] }, {}];
  assert.deepEqual(flagsInUse(studies), ['alpha', 'cement', 'hardware', 'Zeta']);
  assert.deepEqual(flagsInUse([{ flags: ['Cement'] }, { flags: ['cement'] }]), ['Cement'], 'a tie keeps the first met');
  assert.equal(librarySpelling('HARDWARE', ['cement', 'hardware']), 'hardware');
  assert.equal(librarySpelling('new one', ['cement']), 'new one');
});

test('mergeFlags keeps the local order and spelling and appends what is new', () => {
  assert.deepEqual(mergeFlags(['Hardware', 'OLIF outcomes'], ['cement', 'hardware']), ['Hardware', 'OLIF outcomes', 'cement']);
  assert.deepEqual(mergeFlags(undefined, ['cement']), ['cement']);
  assert.deepEqual(mergeFlags(['cement'], undefined), ['cement']);
});

test('flagChoices offers the flags in use that fit, then Create', () => {
  const inUse = ['cement', 'hardware', 'OLIF outcomes'];
  assert.deepEqual(flagChoices({ inUse, draft: ['hardware'], text: '' }),
    [{ kind: 'use', flag: 'cement' }, { kind: 'use', flag: 'OLIF outcomes' }]);
  assert.deepEqual(flagChoices({ inUse, draft: [], text: 'ce' }), [{ kind: 'use', flag: 'cement' }, { kind: 'create', flag: 'ce' }]);
  assert.deepEqual(flagChoices({ inUse, draft: [], text: 'CEMENT' }), [{ kind: 'use', flag: 'cement' }]);
  assert.deepEqual(flagChoices({ inUse, draft: ['cement'], text: 'cement' }), []);
  assert.deepEqual(flagChoices({ inUse, draft: [], text: 'x'.repeat(41) }), []);
});

test('bulkState and bulkChange act on the given real films only', () => {
  const studies = [
    { id: 'A', source: 'real', flags: ['OLIF outcomes', 'hardware'] },
    { id: 'B', source: 'real', flags: ['OLIF outcomes'] },
    { id: 'C', source: 'real' },
    { id: 'D', source: 'demo', flags: [] },
    { id: 'E', source: 'real', flags: Array.from({ length: 20 }, (_, i) => `f${i}`) },
  ];
  assert.equal(bulkState(studies, ['A', 'B'], 'olif outcomes'), 'all');
  assert.equal(bulkState(studies, ['A', 'B', 'C'], 'hardware'), 'some');
  assert.equal(bulkState(studies, ['B', 'C'], 'hardware'), 'none');
  assert.equal(bulkState(studies, [], 'hardware'), 'none');
  assert.deepEqual(bulkChange(studies, ['A', 'B', 'C', 'D', 'E', 'gone'], 'hardware', true),
    { changes: [{ id: 'B', flags: ['OLIF outcomes', 'hardware'] }, { id: 'C', flags: ['hardware'] }], full: 1 });
  assert.deepEqual(bulkChange(studies, ['A', 'B', 'C'], 'HARDWARE', false), { changes: [{ id: 'A', flags: ['OLIF outcomes'] }], full: 0 });
});

test('flagsText joins a film\'s flags and reads a missing list as empty', () => {
  assert.equal(flagsText(['a', 'b'], '; '), 'a; b');
  assert.equal(flagsText(undefined, '; '), '');
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `node --test test/flags.test.js`
Expected: FAIL, cannot find module `renderer/data/flags.js`.

- [ ] **Step 3: Implement `renderer/data/flags.js`** to those signatures. The rules the tests do not fully determine:
  - `cleanFlag`: not a string → `null`. Trim; drop every leading `#` and the spaces after it; collapse each run of whitespace to one space; `null` when the result is empty, longer than 40, or holds `,`, `;`, `\r` or `\n`.
  - `cleanFlags`: not an array → `[]`; each entry through `cleanFlag`; a later match of an earlier flag is dropped; stop at 20.
  - `splitTyped`: split on `,`, `;`, `\r`, `\n`, then `cleanFlags`.
  - `addFlag`: cleans `flag`; appended unless it is `null`, matches one held, or the list already holds 20.
  - `flagsInUse`: count each spelling per `flagKey` over `cleanFlags(study.flags)`; per key the spelling with the most films, a tie going to the first met in `studies` order; sort by `flagKey`, a tie by the spelling.
  - `flagChoices`: `use` entries are the `inUse` flags not matched in `draft` whose key contains the cleaned text's key (all of them when `text` is empty or blank), in `inUse` order. One `create` entry follows when `cleanFlag(text)` is a flag that matches nothing in `inUse` and nothing in `draft`. Text that does not clean to a flag (too long, only `#`) gives `[]`.
  - `bulkState`, `bulkChange`: targets are the studies whose `id` is in `ids` and whose `source` is `'real'`. Adding skips a target that holds a match, and counts in `full` a target that holds 20. Removing lists only targets that held it. `changes` is in `studies` order.

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --test test/flags.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/flags.js test/flags.test.js
git commit -m "feat(flags): the flag rules as one pure module" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 2: Flags on the study record

**Files:**
- Modify: `renderer/screens/studies.js` (`newStudy`, about line 82), `renderer/data/persistence.js` (`validateStudy`, beside `labelComment` about line 271)
- Test: `test/studies.test.js`, `test/persistence.test.js`

**Interfaces:**
- Consumes: `cleanFlags` (Task 1).
- Produces: every study built by `newStudy` or returned by `validate` has `flags: string[]`. A demo study may have no `flags` key; readers use `cleanFlags(study.flags)` or `study.flags ?? []`.

- [ ] **Step 1: Write the failing tests.** In `test/studies.test.js`, beside the assertions that `newStudy` gives `labelComment: null` (about line 99): `assert.deepEqual(study.flags, [])`. In `test/persistence.test.js`, a test named `'a study keeps its flags through validate, cleaned; a library saved before flags reads as none'`: build two stored real studies the way the file's existing `validate` tests do, give the first `flags: [' hardware ', 'Hardware', 'a,b', 3]` and leave the key off the second, and assert the validated studies' `flags` are `['hardware']` and `[]`. Add a third stored study with `flags: 'hardware'` (not a list) and assert `[]`.

- [ ] **Step 2: Run and see them fail**

Run: `node --test test/studies.test.js test/persistence.test.js`
Expected: FAIL on the three new assertions (`flags` is `undefined`).

- [ ] **Step 3: Implement.** `newStudy` gains `flags: []` after `labelComment`, with a dated comment naming the spec. `validateStudy` gains `flags: cleanFlags(entry.flags)` after `labelComment`, with the comment `optional, no STORE_VERSION bump`. If any existing test pins a study's exact key list, add `flags` to it.

- [ ] **Step 4: Run the whole unit suite**

Run: `node --test test/*.test.js`
Expected: PASS, no failure.

- [ ] **Step 5: Commit**

```bash
git add renderer/screens/studies.js renderer/data/persistence.js test/studies.test.js test/persistence.test.js
git commit -m "feat(flags): flags on the study record and through the sanitizer" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 3: Flags in the label record

**Files:**
- Modify: `renderer/data/label-record.js` (`toLabelRecord`, about line 165), `docs/design/level-editor/label-record.schema.json`, `docs/design/level-editor/label-record.example.json`
- Test: `test/label-record.test.js`

**Interfaces:**
- Consumes: `cleanFlags` (Task 1).
- Produces:
  - `toLabelRecord(...)` output has `flags: string[]` directly after `comment`.
  - `recordFlags(record) → string[]`: the record's flags cleaned; `[]` when the key is absent or not a list. Never throws.
  - `withRecordFlags(record, flags) → object`: a new record equal to `record` except `flags`, which is `cleanFlags(flags)`. The key sits directly after `comment`, or directly before `levels` in a record with no `comment` key. Every other key keeps its value and order.

- [ ] **Step 1: Write the failing tests** in `test/label-record.test.js`
  - In the two tests that pin the key order (about lines 372 and 392), the list becomes `['schema', 'study', 'image', 'film', 'model', 'app_version', 'saved_at', 'complete', 'edits', 'comment', 'flags', 'levels', 'femoral_heads']`.
  - `'toLabelRecord writes the study\'s flags, cleaned, and an empty list when it has none'`: with the file's existing editor fixture and `study.flags = [' hardware ', 'Hardware']` → `rec.flags` deep-equals `['hardware']` and the record validates against `SCHEMA`; with no `flags` on the study → `[]`.
  - `'recordFlags reads any record'`: `recordFlags({ flags: ['a', 'A', 7] })` → `['a']`; `recordFlags({})`, `recordFlags(null)`, `recordFlags({ flags: 'a' })` → `[]`.
  - `'withRecordFlags changes flags and nothing else'`: from a record built by `toLabelRecord`, `withRecordFlags(rec, ['cement'])` deep-equals `{ ...rec, flags: ['cement'] }`, has the same `Object.keys` order as `rec`, leaves `rec` unchanged, and keeps `saved_at` identical. From `{ schema: 's', saved_at: 't', levels: {}, femoral_heads: [] }` (a record from before comments), the keys come out `['schema', 'saved_at', 'flags', 'levels', 'femoral_heads']`.
  - `'the schema takes an optional flags list and nothing looser'`: the shipped example validates; a copy without `flags` validates; `flags: ['a', 'a']`, `flags: ['']`, `flags: ['x'.repeat(41)]`, `flags: ['a,b']`, `flags: 'a'` and a list of 21 each fail.

- [ ] **Step 2: Run and see them fail**

Run: `node --test test/label-record.test.js`
Expected: FAIL on the new and the two amended tests.

- [ ] **Step 3: Implement.** In `toLabelRecord`, `flags: cleanFlags(study?.flags)` after `comment`. Export `recordFlags` and `withRecordFlags`. In the schema file add, after `comment`:

```json
"flags": {
  "description": "The film's flags (study flags spec 2026-11-16, section 4.8): the annotator's own short labels, in the order they were added. Optional, so a record saved before flags still validates; the app always writes it.",
  "type": "array",
  "maxItems": 20,
  "uniqueItems": true,
  "items": { "type": "string", "pattern": "^[^,;\\r\\n]{1,40}$" }
}
```

and append to the schema's top-level `description`: `Amended 2026-11-16 (flags): an optional flags list; the id is unchanged, so every earlier record still validates.` The test checker (`test/fixtures/schema-check.js`) has no `maxLength`, which is why the length is in the pattern. Add `"flags": ["OLIF outcomes", "hardware"]` after `comment` in the example file.

- [ ] **Step 4: Run and see them pass**

Run: `node --test test/label-record.test.js test/level-editor-wiring.test.js`
Expected: PASS. If a wiring test pins the record's key list, add `flags` after `comment` there too.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/label-record.js docs/design/level-editor/label-record.schema.json docs/design/level-editor/label-record.example.json test/label-record.test.js test/level-editor-wiring.test.js
git commit -m "feat(flags): the label record carries the study's flags" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 4: The one writer, and the label record kept in step

**Files:**
- Modify: `renderer/level-editor.js` (the write latch about lines 319–335; `saveLevelEdits` line 403)
- Create: `renderer/study-flags.js`
- Test: `test/level-editor-wiring.test.js`, `test/study-flags.test.js` (new)

**Interfaces:**
- Consumes: `recordFlags`, `withRecordFlags` (Task 3); `cleanFlags`, `sameFlagList` (Task 1).
- Produces:
  - `syncRecordFlags(studyIds) → Promise<{ written: string[], failed: string[] }>` in `renderer/level-editor.js` (both lists hold study ids). Never rejects.
  - In `renderer/study-flags.js`:
    - `setFlagsBusy(kind)`, `kind` is `'import'`, `'export'` or `null`
    - `flagsRefusal(state = getState()) → string`: `''`, or the sentence to show
    - `setStudyFlags(changes) → Promise<{ changed: string[], failed: string[] }>`, `changes` is `{ id, flags }[]`
    - `syncFlagsAndReport(ids) → Promise<void>`

**How the turns work today** (read `renderer/level-editor.js` 319–335, 402–453, 486–515): `saving` is `'edits'`, `'review'` or `null`; `holdWrite(kind)` takes the latch and returns its release; `writeEnded` resolves when it is released. Save edits waits out a `'review'` write and is dropped if another `'edits'` write is in flight. Mark reviewed waits out any write.

- [ ] **Step 1: Write the failing sync tests** in `test/level-editor-wiring.test.js`, using the file's `labelBridge` and `withBridge` helpers (about line 489) and a real study put in the store with `labelFile` set:
  - `'syncRecordFlags rewrites flags and nothing else'`: the bridge's `loadLabelRecord` returns a stored record with `saved_at: '2026-10-01T00:00:00.000Z'` and `flags: []`; the study has `flags: ['cement']`. After `await syncRecordFlags([id])`: one save, to the study's `labelFile`, deep-equal to the stored record with `flags: ['cement']`; result `{ written: [id], failed: [] }`.
  - `'syncRecordFlags writes nothing when the record already matches, has no file, or cannot be read'`: matching flags → no save; a study with `labelFile: null` → no save and no load; `loadLabelRecord` resolving `null` → no save; all three give `{ written: [], failed: [] }`. `loadLabelRecord` rejecting, or `saveLabelRecord` rejecting → `{ written: [], failed: [id] }` and no throw.
  - `'a flag changed while Save edits is writing still reaches the file'`: open the editor on a film with a result, make `saveLabelRecord` wait on a promise the test controls, call `saveLevelEdits()` without awaiting, change the study's `flags` in the store, call `syncRecordFlags([id])`, release the save, await both. The last save holds the new flags and the levels of the first save; exactly two saves.
  - `'Save edits clicked while a flag update is writing waits for it'`: make the flag update's save wait, call `syncRecordFlags([id])`, then `saveLevelEdits()`, release. Two saves in that order; the second has the editor's levels and the study's flags.
  - `'a film\'s first record takes a flag changed during its write'`: `writeReviewRecord` on a reviewed film with no `labelFile`, save held, flags changed and `syncRecordFlags([id])` called meanwhile; after release the file's last save has the new flags.

- [ ] **Step 2: Run and see them fail**

Run: `node --test test/level-editor-wiring.test.js`
Expected: FAIL, `syncRecordFlags` is not exported.

- [ ] **Step 3: Implement `syncRecordFlags`** in `renderer/level-editor.js`, after `writeReviewRecord`. For each id, in order, one film per turn (a bulk change must not hold the latch across films):
  1. `while (saving) await writeEnded;` then `const release = holdWrite('flags');`
  2. Read the study from `getState()` now. Skip unless it is a real study with a non-empty `labelFile`.
  3. `loadLabelRecord(file)`; skip when it resolves `null`. Skip when `sameFlagList(recordFlags(record), cleanFlags(study.flags))`.
  4. `saveLabelRecord(file, withRecordFlags(record, study.flags))`; push the id to `written`.
  5. A rejection in 3 or 4 pushes the id to `failed`. `release()` in a `finally`.

  In `saveLevelEdits` the first line becomes `while (saving === 'review' || saving === 'flags') await writeEnded;` so a click during a flag update waits instead of being dropped by the `saving` check below it. Update the latch's comment to name the third kind.

- [ ] **Step 4: Run and see them pass**

Run: `node --test test/level-editor-wiring.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing writer tests** in `test/study-flags.test.js` (real store, `labelBridge`-style stub on `globalThis.window.spineContour`; put the store back after each test as the wiring file does):
  - `'setStudyFlags writes one store update and leaves everything else alone'`: two real studies, one with `reviewedAt` set. `await setStudyFlags([{ id: a, flags: [' hardware ', 'Hardware'] }, { id: b, flags: [] }])` where `b` already has none: `changed` is `[a]`; study `a` has `flags: ['hardware']`, a new object, same `reviewedAt`, `labelFile`, `measurements`; study `b` is the same reference; a store subscriber fired once.
  - `'setStudyFlags ignores a demo study and an unknown id'`: `changed` is `[]`, the store's `studies` array is the same reference.
  - `'setStudyFlags refuses while a delete, an import or an export runs'`: with `deletingStudies: true` in the store → nothing written, `flagsRefusal()` is `'Wait for the delete to finish.'`; after `setFlagsBusy('import')` → `'Wait for the import to finish.'`; `'export'` → `'Wait for the export to finish.'`; `setFlagsBusy(null)` and `deletingStudies: false` → `''`.
  - `'setStudyFlags reports a record it could not update, once'`: the bridge's save rejects for a study with a `labelFile` → the study's flags are written, `failed` is `[id]`.

- [ ] **Step 6: Run and see them fail**

Run: `node --test test/study-flags.test.js`
Expected: FAIL, cannot find module.

- [ ] **Step 7: Implement `renderer/study-flags.js`.**
  - `flagsRefusal`: `state.deletingStudies` → `'Wait for the delete to finish.'`; busy `'import'` → `'Wait for the import to finish.'`; busy `'export'` → `'Wait for the export to finish.'`; `persistenceDisabledReason()` (from `./api.js`) → `` `Studies are not being saved: ${reason}` ``; else `''`.
  - `setStudyFlags`: when `flagsRefusal()` is not empty, `showToast` it and resolve `{ changed: [], failed: [] }`. Otherwise keep the changes whose study is real and whose `cleanFlags(flags)` differs from the study's by `sameFlagList`; with none left, resolve without a `setState`. One `setState((s) => ({ studies: s.studies.map(...) }))` replacing only those studies with `{ ...study, flags }`. Then `syncFlagsAndReport(changed)`.
  - `syncFlagsAndReport(ids)`: `await syncRecordFlags(ids)`; when `failed.length > 0`, `showToast` `` `Flags saved. The label record could not be updated for ${n} ${n === 1 ? 'film' : 'films'}.` ``. `setStudyFlags` resolves with that `failed`.

- [ ] **Step 8: Run the whole unit suite**

Run: `node --test test/*.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add renderer/level-editor.js renderer/study-flags.js test/level-editor-wiring.test.js test/study-flags.test.js
git commit -m "feat(flags): one writer for flags, and the label record kept in step with it" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 5: Flags in the Find list's filter, sort and search

**Files:**
- Modify: `renderer/data/find.js`, `renderer/store.js` (the `findFilters` default, about line 35)
- Test: `test/find.test.js`

**Interfaces:**
- Consumes: `cleanFlags`, `flagKey`, `flagsInUse`, `NO_FLAGS` (Task 1).
- Produces:
  - `DEFAULT_FIND_FILTERS` gains `flags: []` and `flagsMatch: 'any'`; `FILTER_COLUMNS` gains `'flags'` last; `FIND_SORT_KEYS` gains `'flags'` last.
  - `findFilterOptions(studies, filters).flags` is `{ value, label }[]`: `value` is a flag's key, `label` its library spelling; the flags in use together with every ticked key, sorted by key; then `{ value: NO_FLAGS, label: 'No flags' }`, always.
  - `normaliseFindFilters(...)` returns `flags` (the ticked keys, deduplicated, strings only) and `flagsMatch` (`'every'` or `'any'`).
  - `matchesFindFilters`, `matchesQuery` and `sortFindRows` read flags as below.

- [ ] **Step 1: Write the failing tests** in `test/find.test.js`, on five studies: `A` `['OLIF outcomes', 'hardware']`, `B` `['OLIF outcomes']`, `C` `['Hardware', 'cement']`, `D` `[]`, `E` with no `flags` key.
  - Options: with no ticks → labels `['cement', 'hardware', 'OLIF outcomes', 'No flags']` (the spelling `hardware` wins on the tie, first met). With `flags: ['gone flag']` ticked → `gone flag` is offered too, labelled by its key, in key order.
  - `normaliseFindFilters({ flags: ['hardware', 'hardware', 'gone flag', 7], flagsMatch: 'x' }, studies)` → `flags: ['hardware', 'gone flag']`, `flagsMatch: 'any'`; `flagsMatch: 'every'` is kept.
  - Match, by ids: `flags: ['hardware']` → `A, C`. `['hardware', 'olif outcomes']` any → `A, B, C`; every → `A`. `[NO_FLAGS]` → `D, E`. `['hardware', NO_FLAGS]` every → `A, C, D, E`. `['gone flag']` → none (the tick that stays, Review Focus 5). `[]` → all five.
  - `activeColumns` lists `'flags'` when a flag is ticked.
  - Search: `matchesQuery(A, 'hardw')` and `matchesQuery(C, 'CEMENT')` are true; `matchesQuery(E, 'hardware')` is false.
  - Sort: `sortFindRows(studies, { key: 'flags', dir: 'asc' })` → ids `C, B, A, D, E` (`hardware, cement`, then `olif outcomes`, then `olif outcomes, hardware`; the two with none last in library order); `desc` → `A, B, C, D, E` (the two with none are still last).

- [ ] **Step 2: Run and see them fail**

Run: `node --test test/find.test.js`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement.**
  - `matchesQuery`: add `...cleanFlags(study.flags)` to the searched values. Extend the comment above it: FLAGS is a visible column, so the box searches it.
  - `sortValue` case `'flags'`: the cleaned flags joined with `', '` and lower-cased, or `null` when there are none (the existing comparison already puts `null` last in both directions).
  - `findFilterOptions`: as in Interfaces. This is a third rule beside the fixed vocabularies and the "present" rule; say so in the comment and cite spec FL25.
  - `normaliseFindFilters`: `flags: offered('flags')` (the options include every ticked key, so nothing dissolves) and `flagsMatch`.
  - `matchesFindFilters`: with flag ticks, the study passes when `NO_FLAGS` is ticked and it has none, or it holds any ticked flag (`any`) or all of them (`every`); the `every` test is over the ticked flags other than `NO_FLAGS`, and with only `NO_FLAGS` ticked a flagged film does not pass.
  - `renderer/store.js`: the `findFilters` default gains `flags: [], flagsMatch: 'any'`.

- [ ] **Step 4: Run the whole unit suite**

Run: `node --test test/*.test.js`
Expected: PASS. A test that pins `DEFAULT_FIND_FILTERS`, `FILTER_COLUMNS` or the options' keys is amended to include the new entries.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/find.js renderer/store.js test/find.test.js
git commit -m "feat(flags): the Find list filters, sorts and searches by flag" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 6: The flag editor component and the chip styles

**Files:**
- Create: `renderer/components/flag-editor.js`
- Modify: `styles/components.css`

**Interfaces:**
- Consumes: `splitTyped` (Task 1).
- Produces (DOM only; the screen owns the state, the store writes and the focus, as `components/filter-menu.js` leaves them to its screen):
  - `flagChips(flags) → HTMLElement`: `div.flag-chips` of `span.flag-chip` (text and `title` the flag), or `span.flag-none` reading `—` when there are none.
  - `flagEditor({ keyAttr, keyPrefix, ariaLabel, draft, text, choices, active, full, onText, onAdd, onRemove, onActive, onDone, onCancel, onLeave }) → { field: HTMLElement, popup: HTMLElement }`
    - `field`: `div.flag-editor` holding, per draft flag, `span.flag-chip` with `button.flag-chip-remove` (`×`, `aria-label` `Remove <flag>`, key `<keyPrefix>-remove-<index>`), then `input.flag-editor-input` (`type="text"`, `spellcheck` off, `value` `text`, key `<keyPrefix>-input`, `aria-label` `ariaLabel`, `disabled` and placeholder `20 flags` when `full`).
    - `popup`: `div.flag-popup` holding one `button.flag-option` per choice (key `<keyPrefix>-option-<index>`, class `is-active` on index `active`, text the flag, or `Create "<flag>"` for a `create` choice), then `div.flag-popup-hint` reading `ENTER ADDS · ESC CANCELS`.
    - Callbacks: `onText(value)` on input; `onAdd(flags: string[])` when the value contains `,`, `;` or a line break (called with `splitTyped(value)`), on Enter with a choice (`[choices[active].flag]`), and on a click on an option; `onRemove(index)` on a × click and on Backspace in an empty box (the last index); `onActive(index)` on ArrowDown and ArrowUp, clamped; `onDone()` on Enter with an empty box; `onCancel()` on Escape; `onLeave(relatedKey)` on blur.

- [ ] **Step 1: Implement the component.** Three behaviours are easy to get wrong:
  - **Focus stays in the box while the popup or a × is pressed.** `mousedown` on the popup and on each × calls `preventDefault()`. It is the prevented `mousedown`, not `pointerdown`, that stops the input blurring, so a click on a suggestion does not close the editor first.
  - **A rebuild is not a blur.** `onLeave` is called from a microtask, and only if the input is still connected then: a repaint that replaces the node blurs it, and that must not save. `relatedKey` is the `keyAttr` value of `event.relatedTarget`, or `null`. This is the SUBJECT editor's rule; read the comment on `subjectCell`'s `onBlur` in `renderer/screens/studies.js` (about lines 280–300) before writing it.
  - **Keys stop here.** Enter, Escape, Backspace-on-empty, ArrowUp and ArrowDown call `preventDefault()` and `stopPropagation()`, and a click anywhere in `field` or `popup` stops propagation, so a row does not open and the Analysis screen does not step to another film.

- [ ] **Step 2: Add the styles** to `styles/components.css`, from the existing tokens only:
  - `.flag-chips`: wrapping flex, gap `4px 5px`, `min-width: 0`.
  - `.flag-chip`: inline-flex, `max-width: 100%`, padding `1px 8px 2px`, `1px solid var(--border)`, radius `6px`, background `var(--well)`, `font: 500 12.5px/1.45 'Source Sans 3', sans-serif`, colour `var(--ink)`, one line with an ellipsis (spec §4.3: a flag longer than the cell is cut inside its chip).
  - `.flag-none`: `var(--muted)`.
  - `.flag-chip-remove`: `all: unset`, pointer, muted, ink on hover, a `:focus-visible` outline in `var(--accent)`.
  - `.flag-editor`: the chips' flex, padding `4px 7px`, `1px solid var(--accent)`, radius `8px`, background `var(--card)`, the accent focus ring `.studies-subject-input:focus` uses.
  - `.flag-editor-input`: unstyled, `flex: 1`, `min-width: 60px`, `13.5px`.
  - `.flag-popup`: absolute, `z-index: 20`, min-width `200px`, max-width `280px`, padding `8px`, `1px solid var(--border)`, radius `12px`, background `var(--card)`, `box-shadow: 0 8px 24px var(--shadow)`; its options scroll past `240px`.
  - `.flag-option`: the look of `.studies-filter-item` at weight 400; `.is-active` and hover take `var(--well)`.
  - `.flag-popup-hint`: the mono caption face of `.studies-filter-caption`.

- [ ] **Step 3: Check the module loads**

Run: `node -e "import('./renderer/components/flag-editor.js').then(() => console.log('loaded'))"`
Expected: prints `loaded` (the module touches `document` only when its functions are called). Then `node --test test/*.test.js`: PASS. The component's behaviour is verified in the running app in Tasks 7 and 9.

- [ ] **Step 4: Commit**

```bash
git add renderer/components/flag-editor.js styles/components.css
git commit -m "feat(flags): the flag editor component and the chip styles" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 7: The FLAGS column, its in-row editor and its header menu

**Files:**
- Modify: `renderer/screens/studies.js`, `renderer/components/filter-menu.js`, `styles/screens/studies.css`

**Interfaces:**
- Consumes: `flagChips`, `flagEditor` (Task 6); `setStudyFlags`, `flagsRefusal` (Task 4); `flagsInUse`, `flagChoices`, `addFlag`, `removeFlag`, `librarySpelling`, `cleanFlags`, `splitTyped`, `FLAGS_MAX` (Task 1); the `flags` column of `findFilterOptions` and `normaliseFindFilters` (Task 5).
- Produces: `data-find-key` hooks `flags-<id>` (the cell at rest), `flags-<id>-input`, `flags-<id>-remove-<i>`, `flags-<id>-option-<i>`, `filter-flags`, `filter-flags-match-any`, `filter-flags-match-every`. Task 13's smoke checks use them.

Before starting, read in `renderer/screens/studies.js`: `subjectCell` (264–314), `buildRow` (319–373), `buildTable` (444–481), the module state and its comments (521–556), `buildMenu` and `placeMenu` (657–689), `beginSubjectEdit` to `commitSubject` (1064–1125), and `update()` (1276–1404). The flags editor copies the SUBJECT editor's shape.

- [ ] **Step 1: The any / every section in `renderer/components/filter-menu.js`.** `filterMenu` takes two more optional props, `match` and `onMatch`. When `match` is `'any'` or `'every'`, after the options and before the sort group it renders a divider, the caption `Show films with`, and two `studies-filter-item` buttons: `Any ticked flag` (key `filter-<column>-match-any`) and `Every ticked flag` (key `filter-<column>-match-every`), the chosen one `is-active` with `aria-pressed="true"`, each calling `onMatch('any' | 'every')`. Extend the file's header comment.

- [ ] **Step 2: The column.** In `buildTable`, `filterHeader('flags', 'FLAGS', sort, filters, options)` after STATUS. In `buildRow`, `confirming ? null : flagsCell(study)` after the status cell, and extend the comment there: the delete prompt now covers five cells. In `buildMenu`, pass `match: column === 'flags' ? filters.flagsMatch : undefined` and `onMatch: (value) => writeFindFilters(() => ({ flagsMatch: value }))`.

- [ ] **Step 3: The cell and its editor.**
  - Module state beside `editingSubject`: `let editingFlags = null; // { id, draft: string[], text: string, active: number }`, replaced and never mutated, cleared with `editingSubject` on navigation, listed in `update()`'s key directly after `editingSubject`.
  - `flagsCell(study)`: a demo study gets `div.studies-cell-flags` with `flagChips([])`. A real study at rest gets `div.studies-cell-flags.studies-flags-editable` (`role="button"`, `tabindex="0"`, key `flags-<id>`, `title` `Click to edit flags` or the `flagsRefusal()` sentence, `aria-label` `` `Flags for ${name}: ${flags.join(', ') || 'none'}. Press Enter to edit` ``) holding `flagChips(study.flags)`; click and Enter or Space call `beginFlagsEdit(id)` and stop propagation. The row being edited gets the editor's `field` with `keyPrefix` `flags-<id>`.
  - `beginFlagsEdit(id)`: nothing when the study is not real or `flagsRefusal()` is not empty (toast the sentence). Commits an open SUBJECT editor first (`commitSubject(editingSubject.id, 'blur')`) and an open flags editor on another row; `beginSubjectEdit` likewise commits an open flags editor first. Sets `editingFlags = { id, draft: cleanFlags(study.flags), text: '', active: 0 }` and `refreshTable` with focus on the input.
  - Editor callbacks, each replacing `editingFlags` and calling `refreshTable()` (the focus snapshot keeps the input): `onText` sets `text` and `active: 0`; `onAdd(flags)` adds each through `addFlag(draft, librarySpelling(flag, flagsInUse(studies)))` and clears `text`; `onRemove(index)`; `onActive(index)`.
  - `choices` is `flagChoices({ inUse: flagsInUse(live.studies), draft, text })`; `full` is `draft.length >= FLAGS_MAX`.
  - `commitFlags(id, focusKey = null)` for `onDone` and `onLeave`: idempotent like `commitSubject`. The final list is the draft plus any text still in the box (`splitTyped`, through `librarySpelling`). Clear `editingFlags`, call `setStudyFlags([{ id, flags }])` (it writes nothing when nothing changed), then `refreshTable` with focus on `focusKey`'s twin, else on `flags-<id>` after `onDone`.
  - `cancelFlagsEdit()` for `onCancel`: clear, `refreshTable` with focus on `flags-<id>`.
  - In `update()`: drop `editingFlags` when its study has left the library (beside the same line for `editingSubject`); add `flags-` input keys to the caret snapshot's condition; after the table is mounted and while `editingFlags` is set, append the editor's `popup` to `tableHost` and position it under the open cell the way `placeMenu` positions a menu (left edge on the cell, kept inside the host's width, top at the cell's bottom plus 4px). The popup cannot live inside the table: `.studies-table` clips below its rows.

- [ ] **Step 4: The grid and the cap** in `styles/screens/studies.css`.
  - `grid-template-columns` becomes `minmax(160px, 2.2fr) minmax(90px, 1fr) minmax(80px, 0.8fr) minmax(100px, 1fr) minmax(80px, 1fr) minmax(68px, 1fr) minmax(90px, 0.85fr) minmax(112px, 1.05fr) minmax(120px, 1.3fr) 44px`.
  - `.studies-page-inner { max-width: 1280px; }`.
  - Rewrite the comment above the columns: ten tracks, FLAGS ninth; the floors sum to 1096px (160 + 90 + 80 + 100 + 80 + 68 + 90 + 112 + 120 + 44, nine 12px gaps, 44px of padding) against the 1208px the 1280px cap gives; WORKSPACE and FOLDER gave up 16px each because both already truncate; the list needs a 1396px window with the sidebar open and 1232px with it collapsed (spec §4.3).
  - `.studies-cell-flags { min-width: 0; }`; `.studies-flags-editable` with the hover and focus outline of `.studies-subject-editable`; while editing the cell takes `overflow: visible`.
  - `.studies-cell-actions-confirming` keeps `grid-column: 5 / -1`.

- [ ] **Step 5: Run the unit suite**

Run: `node --test test/*.test.js`
Expected: PASS.

- [ ] **Step 6: Verify in the running app.** Launch from source on a scratch profile (`tools/smoke/README.md`, "Launch and quit") with a few films added from invented or the smoke suite's injected studies; read the page, take no screenshots.
  1. FLAGS is the last header, with a funnel. A film with no flags shows a muted dash.
  2. Click a FLAGS cell: the row does not open; the box has focus; the list under it offers the flags in use.
  3. Type `#hardware, cement` → two chips, the box empty. Type `ce` → `Create "ce"` is offered and `cement` is not (it is in the draft). × removes a chip. Backspace in the empty box removes the last one.
  4. Click another row's cell: the first row's flags are saved (`getState().studies`), the second opens.
  5. Esc: the draft is thrown away, focus is on the cell. Enter in an empty box: saved, focus on the cell. Tab: saved.
  6. While the box is open, start typing in the search box, then come back: one repaint per keystroke and the draft survived. The last row's popup is not clipped.
  7. FLAGS menu: tick two flags, switch `Any ticked flag` / `Every ticked flag`, the rows follow. Tick `No flags`, then open a row's cell and add two flags: the row stays until the box closes, then leaves.
  8. Remove a ticked flag from its last film: the list is empty with `No studies match these filters.`, the funnel still shows its count, the menu still lists the flag.
  9. Ask to delete a row: the prompt sits on one line and covers WORKSPACE to FLAGS.
  10. At a 1180px window with the sidebar collapsed the table scrolls sideways and the trash cell stays at the right edge.

- [ ] **Step 7: Commit**

```bash
git add renderer/screens/studies.js renderer/components/filter-menu.js styles/screens/studies.css
git commit -m "feat(flags): the FLAGS column, its in-row editor and its header menu" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 8: Flagging the ticked films

**Files:**
- Modify: `renderer/screens/studies.js` (`buildFilterBar`, about lines 1179–1272; module state; `update()`), `styles/screens/studies.css`

**Interfaces:**
- Consumes: `bulkState`, `bulkChange`, `flagsInUse`, `flagChoices`, `librarySpelling`, `splitTyped` (Task 1); `setStudyFlags`, `flagsRefusal` (Task 4); `checkbox` with `variant: 'menu'` and `indeterminate`.
- Produces: hooks `flag-selected` (the bar button), `bulk-flag-input`, `bulk-flag-<flag key>` (a row's box), `bulk-flag-create`.

- [ ] **Step 1: The button.** In `buildFilterBar`, after `exportButton`: a `btn btn-small studies-flag-selected` button, key `flag-selected`, reading `` `Flag ${targets.length} selected` `` or `Flag` with none. Disabled when `flagsRefusal(live)` is not empty or there are no targets; its title is the refusal sentence, else `Tick studies to flag` with none. It does **not** read `barBlocked`: a segmentation run or batch does not block flags (spec §4.3), unlike Delete and Export. `aria-haspopup="dialog"`, `aria-expanded`. The bar's order becomes Delete, Export, Flag, spacer, Segment.

- [ ] **Step 2: The list.**
  - Module state: `let bulkFlags = null; // { ids: string[], text: string, active: number }`, in `update()`'s key before `openMenu` (which must stay last), cleared on navigation.
  - Clicking the button toggles it. Opening captures `ids` from the ticked visible real rows at that moment (spec §4.3: the films it acts on are fixed when it opens) and closes an open header menu or row editor.
  - Built inside the bar's `.studies-filters` node as `div.studies-bulk-flags` (`role="dialog"`, `aria-label` `Flag the selected studies`), absolutely placed under the button and kept inside the bar's width:
    - `input.studies-filter-text`, key `bulk-flag-input`, placeholder `Find or create a flag…`.
    - One `checkbox({ variant: 'menu', ... })` row per flag in use that contains the typed text: `checked` when `bulkState(...)` is `'all'`, `indeterminate` when `'some'`, key `bulk-flag-<key>`, and a muted count after the label (`all 3`, `1 of 3`, nothing for none).
    - A `Create "<text>"` item, key `bulk-flag-create`, when `flagChoices` would offer one.
    - The caption `` `CHANGES THE ${n} TICKED ${n === 1 ? 'FILM' : 'FILMS'}` ``.
  - A box's change: `on` is true unless the state was `'all'`. Compute `bulkChange(getState().studies, bulkFlags.ids, librarySpelling(flag, inUse), on)`, call `setStudyFlags(changes)`, and when `full > 0` toast `` `${full} ${full === 1 ? 'film already has' : 'films already have'} 20 flags and ${full === 1 ? 'was' : 'were'} left out.` ``. Enter in the box with a creatable text, or a click on Create, adds that flag to every target the same way and clears the box.
  - The list stays open after a change. It closes on Escape (focus to the button), on a second click of the button, on a press outside it (the header menus' outside-press handling at lines 599–652 is the pattern; a press inside the list or on the button is not outside), and on leaving for the Parameters tab.
  - In `update()`: drop from `bulkFlags.ids` any id no longer in the library, and close the list when none is left.

- [ ] **Step 3: Styles.** `.studies-filters { position: relative; }` if it is not already; `.studies-bulk-flags` takes the look of `.studies-filter-menu` at 286px wide; its count is `var(--muted)`, pushed right.

- [ ] **Step 4: Run the unit suite**

Run: `node --test test/*.test.js`
Expected: PASS.

- [ ] **Step 5: Verify in the running app** (scratch profile, page reads only).
  1. Nothing ticked: `Flag`, disabled, title `Tick studies to flag`.
  2. Tick three films, one holding `hardware`: `Flag 3 selected`. Open: `hardware` reads `1 of 3` with a dash. Click it: all three have it and it reads `all 3`. Click again: none has it.
  3. Type a new flag, Enter: all three take it; the box clears; the list is still open.
  4. Filter the list by a flag, tick every row, open the list and clear that flag: the rows leave, the list stays open, and re-ticking the flag in it puts the flag back on those same films.
  5. Escape closes it with focus on the button. A click on a row closes it without opening the row's study.
  6. During a batch Delete and Export are disabled and the Flag button still works. While an export is writing it is disabled with `Wait for the export to finish.` (this half is checked after Task 12 wires the lock).

- [ ] **Step 6: Commit**

```bash
git add renderer/screens/studies.js styles/screens/studies.css
git commit -m "feat(flags): flag the ticked films from the bar" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 9: The FLAGS block on the Analysis screen

**Files:**
- Modify: `renderer/screens/analysis.js` (the panel, about lines 1032–1047; `update()`, about lines 1289–1337), `styles/screens/analysis.css`

**Interfaces:**
- Consumes: `flagChips`, `flagEditor` (Task 6); `setStudyFlags`, `flagsRefusal` (Task 4); the Task 1 helpers Task 7 uses.
- Produces: the block `div.analysis-flags`; hooks on `data-flags-key`: `analysis-flags-add`, `analysis-flags-input`, `analysis-flags-remove-<i>`, `analysis-flags-option-<i>`.

- [ ] **Step 1: Build the block.** `const flagsBlock = el('div', { class: 'analysis-flags is-hidden' })`, placed in the `panel` between `actionsRow` and `commentBlock`. State in the screen's closure: `let flagsEdit = null; // { studyId, draft, text, active }`.
  - At rest it holds the label `FLAGS` (the face of `.analysis-comment-label`), then the film's chips followed by a dashed `button.flag-chip.flag-chip-add` reading `+ Add flag` (key `analysis-flags-add`). With no flags the button stands alone. With `flagsRefusal()` not empty the button is disabled and carries the sentence as its title.
  - Clicking the button, or the chips, opens the editor (`keyAttr: 'data-flags-key'`, `keyPrefix: 'analysis-flags'`, `ariaLabel` `` `Flags for ${studyName(open)}` ``): `field` replaces the chips and `popup` goes inside the block, which is `position: relative`. The callbacks are Task 7's, writing `flagsEdit` and repainting the block alone; `onDone` and `onLeave` commit through `setStudyFlags` and close; `onCancel` closes.
  - Repainting the block restores focus and the caret to the element with the same `data-flags-key`.
- [ ] **Step 2: Wire it into `update()`,** beside the comment block's lines:
  - Hidden when the open study is not real, or `editing` is true (FL19); otherwise shown, with or without flags.
  - Repainted when the open study's `flags` reference, `flagsEdit` or the refusal sentence changed; not on every notification (a pan frame must not rebuild it).
  - An editor left open when `openId` changes, or when edit mode starts, is discarded: `flagsEdit = null`. Leaving the screen discards it too.
- [ ] **Step 3: Styles** in `styles/screens/analysis.css`: `.analysis-flags { padding: 0 14px 10px; flex-shrink: 0; position: relative; }`, hidden by `.is-hidden` and by `.analysis-panel.is-editing`, as `.analysis-comment` is; `.flag-chip-add` is a chip with a dashed border, a transparent ground and muted text, ink on hover; the popup opens under the field at the block's left.

- [ ] **Step 4: Run the unit suite**

Run: `node --test test/*.test.js`
Expected: PASS (`test/analysis.test.js` included).

- [ ] **Step 5: Verify in the running app** (scratch profile, page reads only).
  1. A real film with no flags shows `FLAGS` and `+ Add flag` on both tabs; the comment block below it is unchanged.
  2. Add two flags and click on the panel: both saved; back on the Find list the row shows them.
  3. With the caret in the box, press the Left and Right arrow keys: the caret moves, the film does not change. Escape closes the box without leaving the screen.
  4. Edit levels: the block is gone. DONE: it is back.
  5. Filter the Find list by a flag, open a film, remove that flag here: the header's position readout changes the way it does after Mark reviewed under a STATUS filter, and Next still steps to the following film.
  6. A demo study shows no block.

- [ ] **Step 6: Commit**

```bash
git add renderer/screens/analysis.js styles/screens/analysis.css
git commit -m "feat(flags): flags above the comment on the Analysis screen" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 10: Flags on the Parameters tab

**Files:**
- Modify: `renderer/data/parameters.js`, `renderer/screens/parameters.js`, `renderer/store.js` (the `paramFilters` default, about line 19)
- Test: `test/parameters.test.js`

**Interfaces:**
- Consumes: `cleanFlags`, `flagKey`, `flagsInUse`, `flagsText`, `NO_FLAGS` (Task 1).
- Produces:
  - `DEFAULT_FILTERS.flag = null`; the stored value is a flag's key, `NO_FLAGS`, or `null`.
  - `flagFilterOptions(studies, chosen) → { value, label }[]`: the flags in use (`value` the key, `label` the spelling), plus `chosen` when it is a key no film holds (labelled by the key), sorted by key, then `{ value: NO_FLAGS, label: 'No flags' }`.
  - `filterParameters` and `emptyReason` read `filters.flag`.

- [ ] **Step 1: Write the failing tests** in `test/parameters.test.js`, on Task 5's five studies, each made segmented the way the file's other filter tests do:
  - `flagFilterOptions(studies, null)` labels → `['cement', 'hardware', 'OLIF outcomes', 'No flags']`; with `chosen: 'gone flag'` that key is offered too.
  - `filterParameters(studies, { ...DEFAULT_FILTERS, flag: 'hardware' })` → `A, C`; `flag: NO_FLAGS` → `D, E`; `flag: 'gone flag'` → none; `flag: null` → all five.
  - `normaliseFilters({ flag: 'gone flag' }, studies).flag` is `'gone flag'` (the choice is kept, FL25); `normaliseFilters({ flag: 7 }, studies).flag` is `null`.
  - `emptyReason({ total: 5, visible: 0, filters: { ...DEFAULT_FILTERS, flag: 'gone flag' }, query: '' })` is `'filtered'`.

- [ ] **Step 2: Run and see them fail**

Run: `node --test test/parameters.test.js`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement the data.** `DEFAULT_FILTERS` and the store default gain `flag: null`. `filterParameters` adds a flag test to its first filter (the study holds the chosen key, or has none for `NO_FLAGS`). `normaliseFilters` keeps a string `flag` whatever the library holds and turns anything else into `null`; its comment says why this one filter does not reset (an export pressed next would write every film). `emptyReason` counts `f.flag` as a filter.

- [ ] **Step 4: Implement the screen** in `renderer/screens/parameters.js`.
  - In `buildFilterBar`, after the view select: `select.param-select.param-select-flag`, `aria-label` `Filter by flag`, `data-param-key` `flag`, first option `All flags` (value `''`), then `flagFilterOptions(live.studies, filters.flag)`; its change calls `setFilters({ flag: value === '' ? null : value })`.
  - In the grid's head, `plainHeader('FLAGS')` after FOLDER; in `buildRow`, a last cell `td.param-cell-text` holding `flagsText(study.flags, ', ')` or the em dash, with the full text as its `title`.

- [ ] **Step 5: Run the unit suite, then verify in the app**

Run: `node --test test/*.test.js`
Expected: PASS.
In the app: FLAGS is the grid's last column; choosing a flag narrows the grid and `Export CSV` then writes only those rows; removing the chosen flag from its last film (on the Find tab) leaves the dropdown on that flag and the grid empty.

- [ ] **Step 6: Commit**

```bash
git add renderer/data/parameters.js renderer/screens/parameters.js renderer/store.js test/parameters.test.js
git commit -m "feat(flags): a flag filter and a FLAGS column on the Parameters tab" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 11: Flags in both CSV exports

**Files:**
- Modify: `renderer/data/csv.js` (`toCsv` about lines 139–156, `toPairedCsv` about lines 199–227)
- Test: `test/csv.test.js`

**Interfaces:**
- Consumes: `flagsText`, `mergeFlags` (Task 1).
- Produces: per-film header `…, 'Film date', 'Note', 'Flags', …`; paired header `…, '<visit> film date' per visit, '<visit> flags' per visit, …`.

- [ ] **Step 1: Write the failing tests** in `test/csv.test.js`.
  - `'toCsv writes Flags after Note'`: three studies, flags `['OLIF outcomes', 'hardware']`, `[]`, and no key. The header line (line 3 of the text) has `Flags` at the index after `Note`; the rows' cells there are `OLIF outcomes; hardware`, empty, empty.
  - `'toPairedCsv writes each visit\'s flags after the film dates'`: a pairing built the way the file's paired tests build one, whose post-op visit merges two same-day films, the primary flagged `['hardware']` and the other `['Hardware', 'cement']`. The header has `<visit> flags` for each visit directly after the last `<visit> film date`; the merged visit's cell is `hardware; cement`; a visit with no film is empty.
  - Every existing assertion that reads a cell by position after `Note` (per-film) or after the film-date columns (paired) moves by one, or by the number of visits. Amend them; do not delete them.

- [ ] **Step 2: Run and see them fail**

Run: `node --test test/csv.test.js`
Expected: FAIL on the new tests; the position-bound old ones fail after Step 3 until amended.

- [ ] **Step 3: Implement.** `toCsv`: `'Flags'` after `'Note'` in the header, `flagsText(study.flags, '; ')` after the note cell. `toPairedCsv`: `...headers.map((name) => `${name} flags`)` after the film-date headers, and per visit the films' flags folded with `mergeFlags` in `visit.films` order (the primary is first), joined with `; `. Both columns are always written (FL21). Extend the two layout comments. The file already has a variable named `flagMerges`, which is about merged visits; do not reuse the name.

- [ ] **Step 4: Run the unit suite**

Run: `node --test test/*.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/csv.js test/csv.test.js
git commit -m "feat(flags): Flags in the per-film CSV and per visit in the paired CSV" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 12: Flags through bundles

**Files:**
- Modify: `renderer/data/bundle.js` (`decide` 202–229, `planImport` 275–314, `updatedStudy`, `addedStudy`, `applyImport`, `importPromptText`, `importMessage`), `renderer/screens/studies.js` (`exportBundleTo` 864, `importBundleFrom` 953, `confirmImport` 1010)
- Test: `test/bundle.test.js`

**Interfaces:**
- Consumes: `cleanFlags`, `mergeFlags`, `sameFlagList` (Task 1); `recordFlags` (Task 3); `setFlagsBusy`, `syncFlagsAndReport` (Task 4).
- Produces:
  - `planImport(...)` returns `{ add, update, flag, skip, actions }`. `flag` is `{ id, entry }[]`: a local film the bundle matches whose annotation is not replaced but which gains at least one flag. Such an entry is not in `skip` and has no action.
  - `applyImport(studies, plan, placedIds)` also applies `plan.flag`, which needs no placement.
  - `importMessage({ added, updated, flagged = 0, skipped, withoutFilm, stoppedAt })`.

- [ ] **Step 1: Write the failing tests** in `test/bundle.test.js`, with the file's `entryFor`, `bundleOf`, `labelRecord` and `day` helpers.
  - `'planImport: a matched film whose record is not newer but which gains a flag is flagged, not skipped'`: local film (hash matched, record saved `day(5)`, `flags: ['Hardware']`), entry with a record saved `day(3)` and `study.flags: ['hardware', 'cement']` → `plan.flag` has that id, `plan.skip`, `plan.update` and `plan.actions` are empty. With `study.flags: ['hardware']` → skipped as `already in the library`. With no `flags` on the entry's study but `flags: ['cement']` in its record → flagged (the record is the fallback). With no `flags` anywhere (an older bundle) → skipped.
  - `'planImport: a film being edited, a malformed entry and a losing duplicate bring no flags'`: each stays a skip with its own reason.
  - `'applyImport merges flags and never removes one'`: an update of a local film holding `['Hardware', 'OLIF outcomes']` from an entry holding `['cement', 'hardware']` → `['Hardware', 'OLIF outcomes', 'cement']`; an add takes the entry's flags; a `flag` item patches only `flags` (every other field of the local study is the same value, and the object is new); a local study with no `flags` key takes the entry's; with `placedIds: []` the `flag` item is still applied and the update is not.
  - `'importPromptText and importMessage name the flagged films only when there are some'`: with `plan.flag.length === 2` the prompt reads `…: 1 to add, 0 to update, 2 to flag, 3 to skip. The films stay in this folder, so keep it where it is.`; with none it is the existing sentence unchanged. `importMessage({ added: 1, updated: 0, flagged: 2, skipped: [] })` is `Imported 1 study, updated 0, flagged 2, skipped 0`; without `flagged` the existing text is unchanged.

- [ ] **Step 2: Run and see them fail**

Run: `node --test test/bundle.test.js`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement `renderer/data/bundle.js`.**
  - `const flagsOf = (study, record) => { const own = cleanFlags(study?.flags); return own.length > 0 ? own : recordFlags(record); };` beside `commentOf`.
  - `decide`: where a winning entry would return `{ skip: ALREADY_IN_LIBRARY }` because its record is not newer, return `{ flag: item.local, study: item.study }` instead when `mergeFlags(item.local.flags, flagsOf(item.study, entry.record))` is longer than the local list. Being edited, malformed and losing duplicates are unchanged.
  - `planImport`: `plan.flag` gets `{ id: local.id, entry: { ...entry, study: decision.study } }`.
  - `updatedStudy` adds `flags: mergeFlags(local.flags, flagsOf(entry.study, entry.record))`; `addedStudy` adds `flags: flagsOf(entry.study, entry.record)`; `applyImport` maps `plan.flag` to `{ ...study, flags: mergeFlags(study.flags, flagsOf(...)) }` whatever `placedIds` holds.
  - The two texts as the tests give them. Update the doc comments of `planImport`, `applyImport` and `UPDATED_FIELDS` (the local study keeps its flags and gains the bundle's).

- [ ] **Step 4: Wire the screen** in `renderer/screens/studies.js`.
  - `importBundleFrom`: the "nothing to import" test becomes `plan.add.length + plan.update.length + plan.flag.length === 0`.
  - `confirmImport`: when `plan.actions.length === 0` do not call `importBundle`; treat the result as nothing placed. After the `setState` that applies the plan, `await syncFlagsAndReport([...placed update ids, ...added ids, ...plan.flag ids])` so every touched film's record has its study's flags (an update just replaced the record with the sender's). Pass `flagged: plan.flag.length` to `importMessage`.
  - The busy lock: `setFlagsBusy('import')` wherever `importing` becomes true and `setFlagsBusy(null)` in the same `finally` that clears it (both functions); `setFlagsBusy('export')` and `null` around `exporting` in `exportBundleTo`. `confirmImport`'s own sync runs while the lock is held, which is why it calls `syncFlagsAndReport` and not `setStudyFlags`.

- [ ] **Step 5: Run the unit suite**

Run: `node --test test/*.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add renderer/data/bundle.js renderer/screens/studies.js test/bundle.test.js
git commit -m "feat(flags): flags travel in bundles and merge on import" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 13: Smoke checks and the written record

**Files:**
- Modify: `tools/smoke/smoke-studies.mjs`, `tools/smoke/smoke-parameters.mjs`, `tools/smoke/smoke-bundle.mjs`, `tools/smoke/smoke-levels.mjs`, `tools/smoke/smoke-persist.mjs`, `tools/smoke/smoke-reviewer.mjs`, `tools/smoke/README.md`
- Modify: `docs/bundles.md`, `docs/level-editor.md`, `README.md`, `docs/superpowers/HANDOFF.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: the `data-find-key`, `data-flags-key` and `data-param-key` hooks of Tasks 7 to 10.

- [ ] **Step 1: Run every listed suite as it stands** (launch and profile rules in `tools/smoke/README.md`; each suite's own header says what profile it needs). Fix the expectations this work moved and nothing else: the Find list's header count and the delete prompt's span, the CSV columns read by position after `Note` and after the film dates, the import prompt and toast when a film is only flagged, the label record's key list. Record each suite's count before and after.

- [ ] **Step 2: Add a section to each suite**, in its own style, asserting by DOM, store and file reads:
  - `smoke-studies.mjs`: Task 7's checks 1 to 9 and Task 8's checks 1 to 5.
  - `smoke-reviewer.mjs`: Task 9's checks 1 to 5.
  - `smoke-parameters.mjs`: the FLAGS column, the dropdown, the kept choice, and `Flags` in both exported files.
  - `smoke-levels.mjs`: after Save edits the record on disk has `flags`; a flag changed afterwards rewrites `flags` and leaves `saved_at` byte-identical; Mark reviewed on a flagged film with no record writes them.
  - `smoke-bundle.mjs`: an exported `study.json` and label record carry the flags; importing into a profile that holds the same film with other flags gives the union, names the film as flagged, and leaves its record's `saved_at` alone.
  - `smoke-persist.mjs`: flags survive a quit and relaunch; a store file written without `flags` loads with none.

- [ ] **Step 3: Run all six and the unit suite**

Run: each suite as its header says, then `node --test test/*.test.js`
Expected: every suite green; note the counts.

- [ ] **Step 4: Write it down.**
  - `docs/bundles.md` and `docs/level-editor.md`: flags in `study.json` and the label record, the merge rule on import, `saved_at` untouched.
  - `README.md`: `Flags` wherever it lists the CSV columns.
  - `tools/smoke/README.md`: the new sections.
  - `docs/superpowers/HANDOFF.md`: a "Where things stand" entry (branch, spec, plan, counts, what was not run), ending with what the release notes must say when the owner releases: every CSV column after `Note` moved one place right, and label records gain an optional `flags` list that a validator on the old schema file rejects.
  - `CLAUDE.md`: a dated paragraph at the top in the file's style. In the same edit correct its 1.7.0 paragraph, which still says the release PR is open, to `RELEASED as v1.7.0: PR #87, merge 4eea101`.
  - Not in this task: `CHANGELOG.md`, `docs/releases/`, `package.json` and `renderer/data/version.js` belong to the release commit, which waits for the owner.

- [ ] **Step 5: Commit**

```bash
git add tools/smoke docs README.md CLAUDE.md
git commit -m "test(flags): smoke sections for the list, Analysis, Parameters, bundles, records and persistence; the docs" -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 14: The owner's gate

No code. The owner tests the branch before anything is pushed; nothing here is done on his behalf.

- [ ] **Step 1:** Give the owner a launcher for this worktree on a scratch profile (memory note `pr-isolated-test-recipe` has the recipe: graphs from the installed bundle, `electron install.js`, a scratch `SPINE_CONTOUR_USER_DATA`). His real library is not opened by this branch until he chooses to.
- [ ] **Step 2:** Hand him this list to walk:
  1. Flag one film from the list; flag many with the bar button; fix a misspelt flag with the filter and the bar button.
  2. Filter by a flag, by two with any and every, and by `No flags`; sort by FLAGS; search for a flag.
  3. Work down a flagged set on the Analysis screen with the arrow keys, removing the flag as he goes, to the empty list at the end.
  4. Parameters: filter to a project flag and export both CSVs; open them and find `Flags`.
  5. Export a bundle; import it into a second scratch profile that already holds some of the films with different flags.
  6. Open a label record from the labels folder: `flags` is there, `saved_at` did not move after a flag-only change.
  7. Resize the window to about 1200 wide: the list scrolls sideways and FLAGS is the column scrolled to.
- [ ] **Step 3:** Record his rulings in a `## Ledger` at the end of this file, fix what he reports as new tasks with their own tests, and stop. Pushing, the pull request, the version and telling Michael about the schema (spec §11) wait for his word.
