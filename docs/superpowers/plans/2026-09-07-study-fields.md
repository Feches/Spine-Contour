# Study Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every film a subject, a timepoint, a film date and an editable view; seed them from the workspace's folder layout and CSV through a per-folder assignment table shown before Load; edit them in the clinical drawer; filter, sort and export them on the Parameters tab.

**Architecture:** Two new pure modules carry the vocabulary and the inference: `renderer/data/timepoints.js` (labels, tokens, sort order, the film-date parser) and `renderer/data/seeding.js` (folder and stem classification, the folder table's rows, the §8.3 precedence). `renderer/data/csv.js` learns the four structural CSV columns and hands the matched raw row back from `joinClinical`. The record gains three optional null-default fields (`subjectId`, `timepoint`, `filmDate`) with no `STORE_VERSION` bump. The Workspace card gains the folder table; the drawer gains a Study group of four cells; the Parameters grid gains four text columns, four filters and a subject sort; `toCsv` writes three new columns.

**Tech Stack:** Vanilla ES modules, no bundler, no runtime dependencies. `node --test` for pure logic. The CDP smoke harness in `tools/smoke/` for DOM behaviour. Electron 44 / Chromium 152.

**Spec:** `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` — this plan is **task 2 of its §15 sequencing**: §7 (data model), §8 (seeding, including §8.5's folder table), §9 (editing), the timepoint, view, subject and paired-only filters and the subject sort of §10.3, the load-message clauses of §8.4, and the three new export columns of §11.1. Not here: §11.2 (paired export, task 4) and §12 (compare with pre-op, task 3). Read the spec's §6 decisions 1–6 and 9, §7–§9, §10.2–§10.3, §11.1, §14 and §16 before starting. The binding architecture contract `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` wins over this plan; Task 11 amends it.

## Global Constraints

Copied from `CLAUDE.md` and the spec. Every task's requirements include these.

- **Never display a fabricated measurement or a fabricated label.** Absent values render `—` (U+2014), never `0`, never `N/A`. In a CSV an absent value is an empty cell. A view is never inferred from a timepoint (an `intra-op` folder does not set prone). No film gets `Standing lateral` from a workspace load without that value having been shown on the folder table before Load.
- **The key is "Subject", never "Patient" and never an MRN.** Labels, placeholders and CSV headers say Subject; the subject id is never burned into the film.
- **Nothing overwrites a stored value on load.** Load fills blanks only; the drawer (typing, and Import from CSV) is the overwrite path.
- **Never mutate store state in place.** Every `setState` patch passes a NEW object or array; the store's gates compare by reference.
- **`setState` must not be called from inside a subscriber.** The Studies and Analysis screens' `update()` run inside store notifications; only DOM event handlers call `setState`, and an input's `change` handler defers its commit one microtask (Chromium fires `change` synchronously when a focused, edited input is removed from the DOM).
- **`el()` assigns to the property when the key exists on the node.** Pass real booleans (`checked: true`, `disabled: false`), never `'false'`. **Never pass `style` or `list` as an `el()` prop**: both are read-only accessors on the node and the assignment throws in strict mode; use `setAttribute` after construction.
- **No `STORE_VERSION` bump.** The three new fields are optional and default to `null`; `validateStudy` MUST return them or the saver writes them and the next load drops them.
- **No bundler, no framework, no runtime dependencies.** `dependencies` stays empty; `devDependencies` stays exactly `electron` and `electron-builder`. **Do not loosen the CSP.** No allowlist change: both electron-builder allowlists already cover `renderer/**/*` and `styles/**/*`.
- **Unit tests run as `node --test test/*.test.js`** (the glob form; the directory form fails on Node 24). Baseline before this plan: 333/333.
- **Pure-logic modules get real `node --test` coverage. DOM code gets explicit manual verification and smoke checks.** Never write a fake test.
- **Smoke selectors key on `data-` attributes and `data-study-id`, never on a visible label.** A smoke suite that prints nothing has thrown — re-run it bare and read the stack. Run every suite in the FOREGROUND and capture its output to a file under `tools/smoke/out/`; never background one and wait for it.
- **Conventional commit prefixes** (`feat:`, `fix:`, `test:`, `docs:`, `chore:`); commit after every task; every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Branch:** `claude/preop-postop-study-fields` in the worktree `C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628` (created 2026-09-07 off the tip of `claude/studies-ui-updates-bb040d`, `76e86b7`). Push only to `fork`, never `origin`; never merge to `main`; never rename onto `ui-redesign-cw`.
- **Running the app from source** (three lines, from PowerShell; the shell starts in `C:\Users\codyj`):

  ```
  Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628"
  $env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"
  npm.cmd run dev
  ```

  Smoke harness on a scratch profile: `node tools/smoke/launch.mjs` (refuses with exit 3 if port 9222 is held), the suite, then `node tools/smoke/cdp.mjs --quit`. If `node_modules\electron\dist` is missing here, `npm install` will NOT fetch it: copy `node_modules\electron\dist` and `node_modules\electron\path.txt` from `..\studies-ui-updates-bb040d\node_modules\electron\`.

## File structure

| File | Responsibility | Status |
|---|---|---|
| `renderer/data/timepoints.js` | pure: timepoint and view vocabularies, token normalisation, §7.2 sort order, the film-date parser, the drawer's suggestion lists | create |
| `renderer/data/seeding.js` | pure: folder segments, §8.1 inference from folders and stems, the folder table's rows, the §8.3 precedence | create |
| `renderer/data/csv.js` | `toCsv` three new columns; structural CSV headers; `joinClinical` returns the matched raw row; `autoMap` never claims a structural header | modify |
| `renderer/data/persistence.js` | `validateStudy` returns the three fields; malformed film date nulled with a warning | modify |
| `renderer/data/demo-studies.js` | SP-0042 and SP-0039 become one subject's Pre-op and Post-op films | modify |
| `renderer/screens/studies.js` | `newStudy` defaults; `matchesQuery` covers subject, timepoint and film date; search placeholder | modify |
| `renderer/store.js` | `wsFolderRows`; `paramFilters` gains timepoint, view, subject, pairedOnly, pairedWith | modify |
| `renderer/screens/workspace.js` | load seeds the fields under §8.3 and counts what it inferred; the load message's new clauses; the folder table on card 01; fixed chips for structural headers | modify |
| `renderer/components/clinical-data.js` | the Study group: four cells per row with datalists, `setStudyField`; Import from CSV carries the four fields | modify |
| `renderer/data/parameters.js` | timepoint/view/paired-with options, the four new filters, the subject sort, subject blocks, empty reason | modify |
| `renderer/screens/parameters.js` | four text columns, four filter controls, the subject sort header, block rules, caret restore for the subject box | modify |
| `styles/screens/workspace.css`, `styles/screens/analysis.css`, `styles/screens/studies.css` | folder table and fixed chips; the Study group; the new bar controls and block rule | modify |
| `test/timepoints.test.js`, `test/seeding.test.js` | the two pure modules' suites | create |
| `test/csv.test.js`, `test/persistence.test.js`, `test/demo-studies.test.js`, `test/studies.test.js`, `test/store.test.js`, `test/workspace.test.js`, `test/clinical-data.test.js`, `test/parameters.test.js` | existing suites extended | modify |
| `tools/smoke/smoke-parameters.mjs`, `tools/smoke/smoke-workspace.mjs` | updated for the new surfaces | modify |
| `tools/smoke/smoke-seeding.mjs` | new DOM suite over a pre-op/post-op fixture workspace: folder table, load message, grid filters, export header, drawer cells | create |
| `tools/smoke/README.md`, `README.md`, the contract, `docs/ROADMAP.md`, `docs/superpowers/HANDOFF.md`, the spec | records | modify |

Boundaries: `renderer/data/*` never imports from `renderer/screens/` or `renderer/components/`. `timepoints.js` imports nothing; `csv.js` imports `timepoints.js`; `seeding.js` imports both; `persistence.js` imports `timepoints.js` for the date pattern. No cycle.

## Rulings made while planning (2026-09-07)

Settled with the user before this plan was written, or made by the planner against the code and recorded here so the executor does not re-decide them. Each carries what it costs if wrong.

- **Ruling (user): the dev build seeds one demo pair.** SP-0042 stays the Pre-op film of subject `P-8841`; SP-0039 becomes the same patient's Post-op film after the L4–L5 TLIF its own outcome prose already describes, so its patient fields (`pt`, `age`, `bmi`, `odi`, `dx`, `plan`, `hx`, `outcome`) are edited to match SP-0042's. The double-entry test table changes with it (spec §7.4). — Cost if wrong: two demo records diverge from `design-reference/template.html`'s STUDIES array; the divergence is recorded in the file header.
- **Ruling (user): the drawer's "chips" are native `<datalist>` suggestions** on the Timepoint and View text cells (spec §9): Chromium shows the list on focus, typing filters it, any other label commits as typed. — Cost if wrong: a chip row would be a small addition; the datalists are one element each.
- **Ruling (user): Import from CSV also overwrites Subject, Timepoint, Film date and View** from the row's structural columns when the CSV has them; the toast counts them separately. — Cost if wrong: a user who wanted clinical-only re-import retypes four cells.
- **Ruling (user): the work is on a new branch** `claude/preop-postop-study-fields` off the studies tip; merge back is a fast-forward.
- **Ruling: a timepoint typed in the drawer is normalised through §7.2 when it names a known label** (`preop` → `Pre-op`, `6 weeks` → `6 wk`), as the CSV path is; anything else is committed as typed. — Why: pairing anchors on the label `Pre-op`, and a typed `preop` that never pairs is a silent failure. — Cost if wrong: a user who wants the literal text `preop` cannot have it.
- **Ruling: a cleared View cell stores `''`, never `null`,** and renders `—`; `validateStudy` requires `view` to be a string and throws otherwise, which would refuse the whole store on the next launch. — Cost if wrong: an empty string in one export cell.
- **Ruling: the grid and the CSV show the film date as stored, `YYYY-MM-DD`,** not through the Find tab's `Aug 21, 2026` formatter: it is unambiguous, sortable as text and identical in the file. — Cost if wrong: a US-locale reader sees ISO dates.
- **Ruling: the timepoint filter offers a `No timepoint` entry** (value `__none__`, the `HAND_ADDED` pattern) so unlabelled films can be found; the view filter does not, because a real film always has a view. — Cost if wrong: one dropdown entry.
- **Ruling: paired-only is evaluated over the rows the other filters keep, BEFORE the timepoint filter,** so `Paired only` + `Pre-op` reads as "the pre-op films of paired subjects" and a workspace filter pairs within that workspace. — Cost if wrong: a subject whose two films sit in different workspaces does not pair under a workspace filter, which the workspace filter's own meaning already implies.
- **Ruling: sort by subject puts films with no subject last in BOTH directions; the direction flips the subject order only,** so a block always reads Pre-op → Post-op (§7.2 order, then film date, then `addedAt`). — Cost if wrong: descending order does not reverse within a block.
- **Ruling: the load message's `(clinical data updated for N)` becomes `(blank fields filled for N)`**, because `updated` now also counts a subject or view filled onto a known record. — Cost if wrong: one changed string in two unit tests and one smoke constant.
- **Ruling: the mapping card shows the join header and the four structural headers as FIXED chips** (`study_id → Join key`, `subject_id → Subject`), with no select, so a column the load consumes never reads `Unmapped`. — Cost if wrong: the workspace smoke suite's chip checks change; they do.
- **Ruling: the Workspace screen's `refresh()` restores focus by `data-ws-key`** after its full rebuild (the Parameters panel's pattern), so changing one folder row's select does not drop keyboard focus to `<body>`. — Cost if wrong: none identified; the mapping chips gain the same key for free.
- **Ruling: the folder table's `Films` count and inferred values are computed by the pure `folderRows`, and a state seeded without `wsFolderRows` (the smoke harness, a unit test) falls back to the same rows the scan would have built** — exactly what the card shows before the user touches it, so the honesty rule holds. — Cost if wrong: a state injected without rows loads with defaults it did not display; only the harness can do that.
- **Ruling: subagent assignment.** Sonnet for Tasks 1, 2, 3, 4, 5, 8, 10, 11 (complete code in the brief); Opus for Tasks 6, 7, 9 (DOM, each with a human gate); never Fable. Every dispatch that runs a smoke suite says "foreground, capture to a file".

---

### Task 1: `renderer/data/timepoints.js` — the vocabulary

**Files:**
- Create: `renderer/data/timepoints.js`
- Create: `test/timepoints.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `PRE_OP`, `INTRA_OP`, `POST_OP`, `DEFAULT_VIEW` (`'Standing lateral'`), `TIMEPOINT_SUGGESTIONS`, `VIEW_SUGGESTIONS`, `FILM_DATE` (the stored-form regex), `normaliseTimepoint(token) → string|null`, `normaliseView(token) → string|null`, `timepointRank(label) → {rank, days, text}`, `compareTimepoints(a, b) → number`, `parseFilmDate(text) → 'YYYY-MM-DD'|null`. Tasks 2, 4, 3, 7, 8 consume these names exactly.

- [ ] **Step 1: Write the failing tests**

Create `test/timepoints.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRE_OP, INTRA_OP, POST_OP, DEFAULT_VIEW, TIMEPOINT_SUGGESTIONS, VIEW_SUGGESTIONS, FILM_DATE,
  normaliseTimepoint, normaliseView, timepointRank, compareTimepoints, parseFilmDate,
} from '../renderer/data/timepoints.js';

test('the three fixed labels and the default view are the spec\'s strings', () => {
  assert.equal(PRE_OP, 'Pre-op');
  assert.equal(INTRA_OP, 'Intra-op');
  assert.equal(POST_OP, 'Post-op');
  assert.equal(DEFAULT_VIEW, 'Standing lateral');
  assert.deepEqual([...TIMEPOINT_SUGGESTIONS], ['Pre-op', 'Intra-op', 'Post-op', '6 wk', '1 yr', '2 yr']);
  assert.deepEqual([...VIEW_SUGGESTIONS], ['Standing lateral', 'Supine lateral', 'Prone lateral', 'Flexion lateral', 'Extension lateral']);
});

test('normaliseTimepoint maps every §7.2 token to its label, whatever the case or separator', () => {
  for (const token of ['pre-op', 'preop', 'pre-operative', 'preoperative', 'pre', 'PRE-OP', 'Pre_Op', 'pre op', 'PreOperative']) {
    assert.equal(normaliseTimepoint(token), 'Pre-op', token);
  }
  for (const token of ['intra-op', 'intraop', 'intra-operative', 'intraoperative', 'INTRA_OP']) {
    assert.equal(normaliseTimepoint(token), 'Intra-op', token);
  }
  for (const token of ['post-op', 'postop', 'post-operative', 'postoperative', 'post', 'Post-Op']) {
    assert.equal(normaliseTimepoint(token), 'Post-op', token);
  }
});

test('normaliseTimepoint reads durations as N wk, N mo or N yr', () => {
  assert.equal(normaliseTimepoint('6wk'), '6 wk');
  assert.equal(normaliseTimepoint('6 weeks'), '6 wk');
  assert.equal(normaliseTimepoint('6-wk'), '6 wk');
  assert.equal(normaliseTimepoint('6_week'), '6 wk');
  assert.equal(normaliseTimepoint('12w'), '12 wk');
  assert.equal(normaliseTimepoint('3mo'), '3 mo');
  assert.equal(normaliseTimepoint('3 months'), '3 mo');
  assert.equal(normaliseTimepoint('12m'), '12 mo');
  assert.equal(normaliseTimepoint('1yr'), '1 yr');
  assert.equal(normaliseTimepoint('2 years'), '2 yr');
  assert.equal(normaliseTimepoint('5Y'), '5 yr');
});

test('normaliseTimepoint maps a canonical label to itself and anything else to null', () => {
  for (const label of ['Pre-op', 'Intra-op', 'Post-op', '6 wk', '3 mo', '1 yr']) assert.equal(normaliseTimepoint(label), label);
  // Whole-token matching only: a folder or stem that merely contains a token does not match.
  for (const text of ['Preoperative planning', 'Postgraduate', 'S001', 'baseline', 'wk', '6', '', '   ', null, undefined]) {
    assert.equal(normaliseTimepoint(text), null, String(text));
  }
});

test('normaliseView maps the §7.3 tokens and labels, and nothing else', () => {
  assert.equal(normaliseView('standing'), 'Standing lateral');
  assert.equal(normaliseView('UPRIGHT'), 'Standing lateral');
  assert.equal(normaliseView('erect'), 'Standing lateral');
  assert.equal(normaliseView('supine'), 'Supine lateral');
  assert.equal(normaliseView('Prone'), 'Prone lateral');
  assert.equal(normaliseView('flexion'), 'Flexion lateral');
  assert.equal(normaliseView('FLEX'), 'Flexion lateral');
  assert.equal(normaliseView('extension'), 'Extension lateral');
  assert.equal(normaliseView('ext'), 'Extension lateral');
  assert.equal(normaliseView('Standing lateral'), 'Standing lateral');
  assert.equal(normaliseView('Flexion-lateral'), 'Flexion lateral');
  for (const text of ['lateral', 'S001', 'pre-op', 'extended', '', null]) assert.equal(normaliseView(text), null, String(text));
});

test('compareTimepoints orders fixed labels, then durations by length, then custom labels, then none', () => {
  const order = ['Pre-op', 'Intra-op', 'Post-op', '6 wk', '3 mo', '1 yr', '2 yr', 'baseline', 'Follow-up', null];
  for (let i = 0; i < order.length; i += 1) {
    for (let j = 0; j < order.length; j += 1) {
      const expected = Math.sign(i - j);
      assert.equal(Math.sign(compareTimepoints(order[i], order[j])), expected, `${order[i]} vs ${order[j]}`);
    }
  }
  // 6 wk (42 days) sorts before 3 mo (90 days) and 12 wk (84 days) before 3 mo too.
  assert.ok(compareTimepoints('12 wk', '3 mo') < 0);
  assert.ok(compareTimepoints('12 mo', '1 yr') < 0);
  // Custom labels compare case-insensitively; an empty string is no label.
  assert.equal(compareTimepoints('baseline', 'BASELINE'), 0);
  assert.equal(compareTimepoints('', null), 0);
  assert.deepEqual(timepointRank('Post-op'), { rank: 2, days: 0, text: '' });
  assert.deepEqual(timepointRank('6 wk'), { rank: 3, days: 42, text: '' });
  assert.deepEqual(timepointRank('Baseline'), { rank: 4, days: 0, text: 'baseline' });
  assert.deepEqual(timepointRank(null), { rank: 5, days: 0, text: '' });
});

test('parseFilmDate accepts ISO and US M/D/YYYY and returns the stored form', () => {
  assert.equal(parseFilmDate('2025-03-02'), '2025-03-02');
  assert.equal(parseFilmDate('3/2/2025'), '2025-03-02');
  assert.equal(parseFilmDate('03/02/2025'), '2025-03-02');
  assert.equal(parseFilmDate('12/31/2024'), '2024-12-31');
  assert.equal(parseFilmDate('  2025-03-02  '), '2025-03-02');
  assert.ok(FILM_DATE.test(parseFilmDate('1/1/2025')));
});

test('parseFilmDate rejects impossible dates, other layouts and empty input', () => {
  for (const text of ['2025-02-30', '2025-13-01', '30/02/2025', '2025/03/02', '2-3-2025', 'March 2, 2025', '2025-03-02T10:00:00Z', '20250302', '', '   ', null, undefined]) {
    assert.equal(parseFilmDate(text), null, String(text));
  }
});
```

- [ ] **Step 2: Run the suite to see it fail**

Run: `node --test test/timepoints.test.js`
Expected: FAIL — `Cannot find module` for `renderer/data/timepoints.js`.

- [ ] **Step 3: Create the module**

Create `renderer/data/timepoints.js`:

```js
/**
 * Timepoint and view vocabularies (pre-op/post-op spec §7.2, §7.3), the film-date parser (§8.2)
 * and the timepoint sort order. Pure: no DOM, no store, no imports. data/seeding.js reads folder
 * and stem tokens through normaliseTimepoint/normaliseView; data/csv.js normalises CSV values
 * through the same two functions and parseFilmDate; data/parameters.js sorts with
 * compareTimepoints; the clinical drawer offers TIMEPOINT_SUGGESTIONS and VIEW_SUGGESTIONS.
 *
 * A token matches a label only as a WHOLE token: `Preoperative planning` does not match and
 * `Postgraduate` does not match. Separators (-, _, space) inside a token are ignored, so
 * `pre-op`, `pre_op`, `pre op` and `preop` are one token.
 */

export const PRE_OP = 'Pre-op';
export const INTRA_OP = 'Intra-op';
export const POST_OP = 'Post-op';
export const DEFAULT_VIEW = 'Standing lateral';

// The suggestions the drawer offers (§7.2, §7.3). Typing any other label commits it as typed.
export const TIMEPOINT_SUGGESTIONS = Object.freeze([PRE_OP, INTRA_OP, POST_OP, '6 wk', '1 yr', '2 yr']);

// The stored form of a film date; validateStudy nulls anything else with a warning (§7.4).
export const FILM_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Tokens are written squashed: lower-cased with every -, _ and space removed.
const FIXED_TIMEPOINTS = [
  { label: PRE_OP, rank: 0, tokens: ['preop', 'preoperative', 'pre'] },
  { label: INTRA_OP, rank: 1, tokens: ['intraop', 'intraoperative'] },
  { label: POST_OP, rank: 2, tokens: ['postop', 'postoperative', 'post'] },
];

const VIEWS = [
  { label: 'Standing lateral', tokens: ['standing', 'upright', 'erect'] },
  { label: 'Supine lateral', tokens: ['supine'] },
  { label: 'Prone lateral', tokens: ['prone'] },
  { label: 'Flexion lateral', tokens: ['flexion', 'flex'] },
  { label: 'Extension lateral', tokens: ['extension', 'ext'] },
];

export const VIEW_SUGGESTIONS = Object.freeze(VIEWS.map((view) => view.label));

function squash(token) {
  return String(token ?? '').toLowerCase().replace(/[-_\s]+/g, '');
}

// `6wk`, `6 weeks`, `3mo`, `3 months`, `1yr`, `2 years` (squashed): a count, then a unit word.
const DURATION = /^(\d+)(w|wk|wks|week|weeks|m|mo|mos|month|months|y|yr|yrs|year|years)$/;
const UNIT_DAYS = { w: 7, m: 30, y: 365 };
const UNIT_LABEL = { w: 'wk', m: 'mo', y: 'yr' };

function duration(token) {
  const match = DURATION.exec(squash(token));
  if (!match) return null;
  const count = Number(match[1]);
  const unit = match[2][0];
  return { label: `${count} ${UNIT_LABEL[unit]}`, days: count * UNIT_DAYS[unit] };
}

// The known label a token normalises to, or null. A canonical label normalises to itself.
export function normaliseTimepoint(token) {
  const key = squash(token);
  if (key === '') return null;
  const fixed = FIXED_TIMEPOINTS.find((entry) => entry.tokens.includes(key));
  if (fixed) return fixed.label;
  const spell = duration(token);
  return spell ? spell.label : null;
}

export function normaliseView(token) {
  const key = squash(token);
  if (key === '') return null;
  const view = VIEWS.find((entry) => entry.tokens.includes(key) || squash(entry.label) === key);
  return view ? view.label : null;
}

// Sort position of a stored label (§7.2): Pre-op 0, Intra-op 1, Post-op 2, durations 3 (then by
// length in days), any other label 4 (then alphabetically, case-insensitively), no label 5.
export function timepointRank(label) {
  const text = String(label ?? '').trim();
  if (text === '') return { rank: 5, days: 0, text: '' };
  const key = squash(text);
  const fixed = FIXED_TIMEPOINTS.find((entry) => entry.tokens.includes(key));
  if (fixed) return { rank: fixed.rank, days: 0, text: '' };
  const spell = duration(text);
  if (spell) return { rank: 3, days: spell.days, text: '' };
  return { rank: 4, days: 0, text: text.toLowerCase() };
}

export function compareTimepoints(a, b) {
  const ra = timepointRank(a);
  const rb = timepointRank(b);
  if (ra.rank !== rb.rank) return ra.rank - rb.rank;
  if (ra.days !== rb.days) return ra.days - rb.days;
  return ra.text < rb.text ? -1 : ra.text > rb.text ? 1 : 0;
}

// 'YYYY-MM-DD' for the two accepted forms -- ISO, and Excel's US default M/D/YYYY -- else null.
// The calendar is checked: 2025-02-30 is null, not March 2nd. Deliberately no third form and
// never Date.parse, which reads 3/4/2025 differently by locale (spec §16).
export function parseFilmDate(text) {
  const value = String(text ?? '').trim();
  let year;
  let month;
  let day;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
  } else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
    if (!match) return null;
    month = Number(match[1]); day = Number(match[2]); year = Number(match[3]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run the suite to see it pass**

Run: `node --test test/timepoints.test.js`
Expected: 8/8 pass. Then `node --test test/*.test.js` — Expected: 341/341.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/timepoints.js test/timepoints.test.js
git commit -m "feat: timepoint and view vocabularies, sort order and the film-date parser

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `renderer/data/seeding.js` — folders, stems, the folder table and the precedence

**Files:**
- Create: `renderer/data/seeding.js`
- Create: `test/seeding.test.js`

**Interfaces:**
- Consumes: `normaliseTimepoint`, `normaliseView`, `DEFAULT_VIEW` from `data/timepoints.js` (Task 1); `fileStem` from `data/csv.js` (exists).
- Produces: `folderSegments(filePath, root) → string[]`, `folderKey(filePath, root) → string` (`'.'` for the root), `inferFromFolder(segments) → {subjectId, timepoint, view}`, `inferFromStem(stem) → {subjectId, timepoint, view}`, `folderRows(files, root) → {folder, count, timepoint, view}[]`, `seedFields({filePath, root, existing, csv, row}) → {fields: {subjectId, timepoint, filmDate, view}, sources: {…}}`. Task 5 and Task 6 consume these names exactly; `csv` there is Task 4's `structuralFromRow` result.

- [ ] **Step 1: Write the failing tests**

Create `test/seeding.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  folderSegments, folderKey, inferFromFolder, inferFromStem, folderRows, seedFields,
} from '../renderer/data/seeding.js';

const ROOT = 'C:\\ws\\Fusion2025';
const film = (relative) => `${ROOT}\\${relative.replace(/\//g, '\\')}`;
const seed = (relative, extra = {}) => seedFields({ filePath: film(relative), root: ROOT, ...extra }).fields;

test('folderSegments returns the segments strictly below the root, without the file, either separator', () => {
  assert.deepEqual(folderSegments(film('pre-op/S001.png'), ROOT), ['pre-op']);
  assert.deepEqual(folderSegments(film('S001/post-op/lateral.dcm'), ROOT), ['S001', 'post-op']);
  assert.deepEqual(folderSegments(film('S001.png'), ROOT), []);
  assert.deepEqual(folderSegments('C:/ws/Fusion2025/pre-op/S001.png', ROOT), ['pre-op']);
  // The root is matched case-insensitively (Windows paths), and a film outside it has no segments.
  assert.deepEqual(folderSegments('c:\\WS\\fusion2025\\pre-op\\S001.png', ROOT), ['pre-op']);
  assert.deepEqual(folderSegments('D:\\elsewhere\\pre-op\\S001.png', ROOT), []);
  assert.deepEqual(folderSegments(film('pre-op/S001.png'), null), []);
});

test('folderKey joins the segments with / and reads . for the root itself', () => {
  assert.equal(folderKey(film('S001.png'), ROOT), '.');
  assert.equal(folderKey(film('pre-op/S001.png'), ROOT), 'pre-op');
  assert.equal(folderKey(film('CohortA/1yr/S001.png'), ROOT), 'CohortA/1yr');
});

test('inferFromFolder: the last timepoint and view segments win, the first plain segment is the subject', () => {
  assert.deepEqual(inferFromFolder(['pre-op']), { subjectId: null, timepoint: 'Pre-op', view: null });
  assert.deepEqual(inferFromFolder(['S001', 'post-op']), { subjectId: 'S001', timepoint: 'Post-op', view: null });
  assert.deepEqual(inferFromFolder(['flexion']), { subjectId: null, timepoint: null, view: 'Flexion lateral' });
  assert.deepEqual(inferFromFolder(['S001', 'pre-op', 'extension']), { subjectId: 'S001', timepoint: 'Pre-op', view: 'Extension lateral' });
  assert.deepEqual(inferFromFolder(['CohortA', '1yr']), { subjectId: 'CohortA', timepoint: '1 yr', view: null });
  assert.deepEqual(inferFromFolder(['CohortA', 'S001']), { subjectId: 'CohortA', timepoint: null, view: null });
  assert.deepEqual(inferFromFolder(['pre-op', 'post-op']), { subjectId: null, timepoint: 'Post-op', view: null });
  assert.deepEqual(inferFromFolder(['Preoperative planning']), { subjectId: 'Preoperative planning', timepoint: null, view: null });
  assert.deepEqual(inferFromFolder([]), { subjectId: null, timepoint: null, view: null });
});

test('inferFromStem peels trailing timepoint and view tokens and keeps the rest as the subject', () => {
  assert.deepEqual(inferFromStem('S001'), { subjectId: 'S001', timepoint: null, view: null });
  assert.deepEqual(inferFromStem('S001_preop'), { subjectId: 'S001', timepoint: 'Pre-op', view: null });
  assert.deepEqual(inferFromStem('S001_pre-op'), { subjectId: 'S001', timepoint: 'Pre-op', view: null });
  assert.deepEqual(inferFromStem('S001 pre op'), { subjectId: 'S001', timepoint: 'Pre-op', view: null });
  assert.deepEqual(inferFromStem('S001_preop_flexion'), { subjectId: 'S001', timepoint: 'Pre-op', view: 'Flexion lateral' });
  assert.deepEqual(inferFromStem('S001-6-wk'), { subjectId: 'S001', timepoint: '6 wk', view: null });
  assert.deepEqual(inferFromStem('S001_1yr_ext'), { subjectId: 'S001', timepoint: '1 yr', view: 'Extension lateral' });
  // A stem made only of tokens supplies no subject.
  assert.deepEqual(inferFromStem('pre-op'), { subjectId: null, timepoint: 'Pre-op', view: null });
  assert.deepEqual(inferFromStem('extension'), { subjectId: null, timepoint: null, view: 'Extension lateral' });
  assert.deepEqual(inferFromStem('preop_flexion'), { subjectId: null, timepoint: 'Pre-op', view: 'Flexion lateral' });
  // A leading token is not trailing and stays in the subject; IMG_0001 has no tokens at all.
  assert.deepEqual(inferFromStem('preop_S001'), { subjectId: 'preop_S001', timepoint: null, view: null });
  assert.deepEqual(inferFromStem('IMG_0001'), { subjectId: 'IMG_0001', timepoint: null, view: null });
  assert.deepEqual(inferFromStem('lateral'), { subjectId: 'lateral', timepoint: null, view: null });
  // The rightmost token of each kind wins, and peeling stops at the first non-token.
  assert.deepEqual(inferFromStem('S001_pre_post'), { subjectId: 'S001', timepoint: 'Post-op', view: null });
  assert.deepEqual(inferFromStem('S001_post_x_pre'), { subjectId: 'S001_post_x', timepoint: 'Pre-op', view: null });
  assert.deepEqual(inferFromStem(''), { subjectId: null, timepoint: null, view: null });
});

// Every row of the spec's §8.1 table, through seedFields with no CSV, no stored record and no
// user-set folder row -- the values the load assigns to a fresh workspace untouched on the card.
test('seedFields reproduces the §8.1 table for a fresh film', () => {
  const D = 'Standing lateral';
  const rows = [
    ['pre-op/S001.png', 'S001', 'Pre-op', D],
    ['S001/pre-op.png', 'S001', 'Pre-op', D],
    ['S001/post-op/lateral.dcm', 'S001', 'Post-op', D],
    ['S001_preop.png', 'S001', 'Pre-op', D],
    ['flexion/S001.png', 'S001', null, 'Flexion lateral'],
    ['S001/pre-op/extension.png', 'S001', 'Pre-op', 'Extension lateral'],
    ['S001_preop_flexion.png', 'S001', 'Pre-op', 'Flexion lateral'],
    ['intra-op/S001.dcm', 'S001', 'Intra-op', D],
    ['CohortA/1yr/S001.png', 'CohortA', '1 yr', D],
    ['S001.png', 'S001', null, D],
    ['IMG_0001.png', 'IMG_0001', null, D],
  ];
  for (const [relative, subjectId, timepoint, view] of rows) {
    assert.deepEqual(seed(relative), { subjectId, timepoint, filmDate: null, view }, relative);
  }
});

test('folderRows lists each folder directly holding a film, in scan order, with its count and inferred values', () => {
  const files = [
    film('S000.png'), film('pre-op/S001.png'), film('pre-op/S002.png'), film('post-op/S001.png'),
    film('flexion/S003.png'), film('CohortA/1yr/S001.png'),
  ];
  assert.deepEqual(folderRows(files, ROOT), [
    { folder: '.', count: 1, timepoint: null, view: 'Standing lateral' },
    { folder: 'pre-op', count: 2, timepoint: 'Pre-op', view: 'Standing lateral' },
    { folder: 'post-op', count: 1, timepoint: 'Post-op', view: 'Standing lateral' },
    { folder: 'flexion', count: 1, timepoint: null, view: 'Flexion lateral' },
    { folder: 'CohortA/1yr', count: 1, timepoint: '1 yr', view: 'Standing lateral' },
  ]);
  assert.deepEqual(folderRows([], ROOT), []);
  // A root with no subfolders is one row.
  assert.deepEqual(folderRows([film('a.png'), film('b.png')], ROOT), [{ folder: '.', count: 2, timepoint: null, view: 'Standing lateral' }]);
});

test('seedFields applies §8.3: stored beats CSV beats stem beats the folder row beats the default', () => {
  const row = { folder: 'pre-op', count: 2, timepoint: 'Intra-op', view: 'Extension lateral' };
  // A user-set row applies to a film whose own name says nothing.
  assert.deepEqual(seed('pre-op/S001.png', { row }), { subjectId: 'S001', timepoint: 'Intra-op', filmDate: null, view: 'Extension lateral' });
  // The film's own stem is more specific than its folder row.
  assert.deepEqual(seed('pre-op/S001_flexion.png', { row }), { subjectId: 'S001', timepoint: 'Intra-op', filmDate: null, view: 'Flexion lateral' });
  assert.deepEqual(seed('pre-op/S001_post.png', { row }), { subjectId: 'S001', timepoint: 'Post-op', filmDate: null, view: 'Extension lateral' });
  // A row set to no timepoint leaves the film with none, even though the folder is called pre-op.
  assert.deepEqual(seed('pre-op/S001.png', { row: { ...row, timepoint: null, view: 'Standing lateral' } }),
    { subjectId: 'S001', timepoint: null, filmDate: null, view: 'Standing lateral' });
  // The CSV beats the stem and the row; a CSV field it does not supply falls through.
  const csv = { subjectId: 'P-77', timepoint: 'Post-op', filmDate: '2025-09-14', view: 'Supine lateral', badDate: false };
  assert.deepEqual(seed('pre-op/S001_flexion.png', { row, csv }), { subjectId: 'P-77', timepoint: 'Post-op', filmDate: '2025-09-14', view: 'Supine lateral' });
  assert.deepEqual(seed('pre-op/S001_flexion.png', { row, csv: { ...csv, view: null, timepoint: null } }),
    { subjectId: 'P-77', timepoint: 'Intra-op', filmDate: '2025-09-14', view: 'Flexion lateral' });
  // A stored value is kept whatever the CSV, stem or row say; a stored '' is a blank.
  const existing = { subjectId: 'KEEP', timepoint: '6 wk', filmDate: '2020-01-01', view: 'Prone lateral' };
  assert.deepEqual(seed('pre-op/S001_flexion.png', { row, csv, existing }), existing);
  assert.deepEqual(seed('pre-op/S001.png', { row, existing: { subjectId: null, timepoint: '', filmDate: null, view: '' } }),
    { subjectId: 'S001', timepoint: 'Intra-op', filmDate: null, view: 'Extension lateral' });
  // Subject comes from the first plain folder segment before the stem, and never from the row.
  assert.deepEqual(seed('S001/pre-op/S001_extra.png', { row }).subjectId, 'S001');
  assert.equal(seed('CohortA/S001.png').subjectId, 'CohortA');
});

test('seedFields reports where each value came from', () => {
  const row = { folder: 'pre-op', count: 1, timepoint: 'Pre-op', view: 'Standing lateral' };
  const csv = { subjectId: null, timepoint: null, filmDate: '2025-03-02', view: null, badDate: false };
  const { sources } = seedFields({ filePath: film('pre-op/S001_ext.png'), root: ROOT, row, csv });
  assert.deepEqual(sources, { subjectId: 'stem', timepoint: 'row', filmDate: 'csv', view: 'stem' });
  const fresh = seedFields({ filePath: film('S001.png'), root: ROOT });
  assert.deepEqual(fresh.sources, { subjectId: 'stem', timepoint: null, filmDate: null, view: 'default' });
  const folderSubject = seedFields({ filePath: film('S001/post-op/lateral.dcm'), root: ROOT });
  assert.deepEqual(folderSubject.sources, { subjectId: 'folder', timepoint: 'row', filmDate: null, view: 'default' });
  const stored = seedFields({ filePath: film('S001.png'), root: ROOT, existing: { subjectId: 'X', timepoint: 'Pre-op', filmDate: '2025-01-01', view: 'Standing lateral' } });
  assert.deepEqual(stored.sources, { subjectId: 'stored', timepoint: 'stored', filmDate: 'stored', view: 'stored' });
});
```

Note on the third `sources` case: with no `row` given, `seedFields` derives the row from the folder's own path, so a timepoint that came from a folder segment is reported as `'row'` — the folder table is where that value was shown. `'folder'` is reserved for the subject (§8.1 rule 2), which has no row step.

- [ ] **Step 2: Run the suite to see it fail**

Run: `node --test test/seeding.test.js`
Expected: FAIL — `Cannot find module` for `renderer/data/seeding.js`.

- [ ] **Step 3: Create the module**

Create `renderer/data/seeding.js`:

```js
/**
 * Seeding subject, timepoint and view from a workspace's folder layout and filenames
 * (pre-op/post-op spec §8.1, §8.3, §8.5). Pure: no DOM, no store. screens/workspace.js runs the
 * scan's files through folderRows to build the card's folder table and through seedFields at
 * Load; the tests pin every row of the spec's §8.1 table.
 */
import { normaliseTimepoint, normaliseView, DEFAULT_VIEW } from './timepoints.js';
import { fileStem } from './csv.js';

const STUDY_FIELDS = ['subjectId', 'timepoint', 'filmDate', 'view'];

function parts(path) {
  return String(path ?? '').split(/[\\/]/).filter((part) => part !== '');
}

// The folder segments strictly below the root, in order, without the file itself. The root is
// compared segment by segment, case-insensitively (Windows paths). A film outside the root, or
// with no root at all, has no segments: it reads as sitting in the root, which infers nothing.
export function folderSegments(filePath, root) {
  const file = parts(filePath);
  file.pop();
  const base = parts(root);
  if (base.length === 0 || base.length > file.length) return [];
  for (let i = 0; i < base.length; i += 1) {
    if (file[i].toLowerCase() !== base[i].toLowerCase()) return [];
  }
  return file.slice(base.length);
}

// The folder table's key for a film: its segments joined with '/', or '.' for the root itself.
export function folderKey(filePath, root) {
  const segments = folderSegments(filePath, root);
  return segments.length === 0 ? '.' : segments.join('/');
}

// §8.1 rules 1 and 2 over the folder segments: the LAST segment naming a timepoint and the last
// naming a view supply those; the FIRST segment naming neither supplies the subject.
export function inferFromFolder(segments) {
  let subjectId = null;
  let timepoint = null;
  let view = null;
  for (const segment of segments ?? []) {
    const named = normaliseTimepoint(segment);
    if (named !== null) { timepoint = named; continue; }
    const position = normaliseView(segment);
    if (position !== null) { view = position; continue; }
    if (subjectId === null) subjectId = segment;
  }
  return { subjectId, timepoint, view };
}

// §8.1 rule 3 over the filename stem. Trailing tokens (separated by -, _ or space) are peeled
// right to left for as long as they name a timepoint or a view. Each pass takes the SHORTEST
// trailing run that names one, so `S001_pre-op` peels `pre-op` (not `op`) and `S001-6-wk` peels
// `6-wk`. Whatever remains, trimmed, is the subject; nothing remaining is no subject. The
// rightmost token of each kind wins.
export function inferFromStem(stem) {
  let rest = String(stem ?? '').trim();
  let timepoint = null;
  let view = null;
  while (rest !== '') {
    const separators = [...rest.matchAll(/[-_ ]+/g)];
    const candidates = separators
      .map((match) => ({ token: rest.slice(match.index + match[0].length), head: rest.slice(0, match.index) }))
      .reverse();
    candidates.push({ token: rest, head: '' });
    let taken = false;
    for (const { token, head } of candidates) {
      if (token === '') continue;
      const named = normaliseTimepoint(token);
      const position = named === null ? normaliseView(token) : null;
      if (named === null && position === null) continue;
      if (named !== null && timepoint === null) timepoint = named;
      if (position !== null && view === null) view = position;
      rest = head;
      taken = true;
      break;
    }
    if (!taken) break;
  }
  const subject = rest.trim();
  return { subjectId: subject === '' ? null : subject, timepoint, view };
}

// One row per folder that directly holds at least one scanned film, in scan order: the folder
// key, the film count, and the timepoint and view the folder's own path names (§8.1 rule 1 over
// ITS segments), the view defaulting to Standing lateral. These are the values the Workspace
// card shows and the user may change before Load (§8.5).
export function folderRows(files, root) {
  const rows = [];
  const byKey = new Map();
  for (const filePath of files ?? []) {
    const key = folderKey(filePath, root);
    let row = byKey.get(key);
    if (!row) {
      const inferred = inferFromFolder(folderSegments(filePath, root));
      row = { folder: key, count: 0, timepoint: inferred.timepoint, view: inferred.view ?? DEFAULT_VIEW };
      byKey.set(key, row);
      rows.push(row);
    }
    row.count += 1;
  }
  return rows;
}

function present(value) {
  return value !== null && value !== undefined && value !== '';
}

// §8.3, per field, most specific first: a stored value; else the CSV row's; else the film's own
// stem; else, for timepoint and view, the folder table row (§8.5), which starts at the folder's
// own inferred token and is whatever the user set it to; else null -- view falls to Standing
// lateral. subjectId takes the folder's first plain segment before the stem (§8.1 rules 2–3)
// and has no row step.
//
//   existing  the record already in the library, or null for a new film
//   csv       structuralFromRow's result for the film's CSV row, or null (data/csv.js)
//   row       the folder table row for the film's folder, or null (then inferred from the path)
//
// Returns { fields: {subjectId, timepoint, filmDate, view}, sources: {…} }, each source one of
// 'stored' | 'csv' | 'stem' | 'folder' | 'row' | 'default' | null, so the load message can say
// how many films had something inferred.
export function seedFields({ filePath, root, existing = null, csv = null, row = null }) {
  const segments = folderSegments(filePath, root);
  const folder = inferFromFolder(segments);
  const stem = inferFromStem(fileStem(filePath));
  const table = row ?? { timepoint: folder.timepoint, view: folder.view ?? DEFAULT_VIEW };
  const fields = {};
  const sources = {};
  function pick(name, candidates) {
    for (const [source, value] of candidates) {
      if (present(value)) { fields[name] = value; sources[name] = source; return; }
    }
    fields[name] = null;
    sources[name] = null;
  }
  pick('subjectId', [['stored', existing?.subjectId], ['csv', csv?.subjectId], ['folder', folder.subjectId], ['stem', stem.subjectId]]);
  pick('timepoint', [['stored', existing?.timepoint], ['csv', csv?.timepoint], ['stem', stem.timepoint], ['row', table.timepoint]]);
  pick('filmDate', [['stored', existing?.filmDate], ['csv', csv?.filmDate]]);
  pick('view', [['stored', existing?.view], ['csv', csv?.view], ['stem', stem.view], ['row', table.view], ['default', DEFAULT_VIEW]]);
  return { fields, sources };
}

export { STUDY_FIELDS };
```

- [ ] **Step 4: Run the suite to see it pass**

Run: `node --test test/seeding.test.js`
Expected: 8/8 pass. Then `node --test test/*.test.js` — Expected: 349/349.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/seeding.js test/seeding.test.js
git commit -m "feat: seed subject, timepoint and view from folders and stems; the folder table's rows

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 3: The three fields on the record — validate, `newStudy`, the export columns, the search, the demo pair

**Files:**
- Modify: `renderer/data/persistence.js` (imports; `validateStudy`)
- Modify: `renderer/screens/studies.js` (`matchesQuery`, `newStudy`, the search placeholder)
- Modify: `renderer/data/csv.js` (`toCsv` header and cells)
- Modify: `renderer/data/demo-studies.js` (header comment; SP-0042; SP-0039)
- Modify: `test/persistence.test.js`, `test/studies.test.js`, `test/csv.test.js`, `test/demo-studies.test.js`

**Interfaces:**
- Consumes: `FILM_DATE` from `data/timepoints.js` (Task 1).
- Produces: every `Study` returned by `validate` and every record built by `newStudy` carries `subjectId`, `timepoint`, `filmDate` (`string|null`, default `null`). `toCsv` writes `Study ID,View,Subject,Timepoint,Film date,<ten measurement columns>,<clinical union>`. Tasks 5, 7, 8, 9 and 10 read these three field names exactly.

- [ ] **Step 1: Write the failing tests**

In `test/persistence.test.js`, append:

```js
test('validate returns the three study fields and defaults them to null (pre-op/post-op spec §7.1)', () => {
  const [bare] = validate({ version: STORE_VERSION, studies: [identity('SP-1000')] });
  assert.equal(bare.subjectId, null);
  assert.equal(bare.timepoint, null);
  assert.equal(bare.filmDate, null);
  // Listed on the returned object, or the saver writes them and the next load drops them.
  assert.ok('subjectId' in bare && 'timepoint' in bare && 'filmDate' in bare);
  const [full] = validate({ version: STORE_VERSION, studies: [{ ...identity('SP-1001'), subjectId: 'S001', timepoint: 'Pre-op', filmDate: '2025-03-02' }] });
  assert.equal(full.subjectId, 'S001');
  assert.equal(full.timepoint, 'Pre-op');
  assert.equal(full.filmDate, '2025-03-02');
});

test('validate nulls a blank or non-string study field silently, and a malformed film date with one warning', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const [study] = validate({ version: STORE_VERSION, studies: [{ ...identity('SP-1000'), subjectId: '  ', timepoint: 42, filmDate: 20250302 }] });
  assert.equal(study.subjectId, null);
  assert.equal(study.timepoint, null);
  assert.equal(study.filmDate, null);
  assert.equal(warn.mock.callCount(), 0);
  const [dated] = validate({ version: STORE_VERSION, studies: [{ ...identity('SP-1001'), filmDate: '3/2/2025' }] });
  assert.equal(dated.filmDate, null);
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /SP-1001/);
});
```

In `test/studies.test.js`, append:

```js
test('newStudy carries the three study fields as null', () => {
  const study = newStudy({ id: 'SP-1000', fileName: 'film.dcm', filePath: 'C:/films/film.dcm' });
  assert.equal(study.subjectId, null);
  assert.equal(study.timepoint, null);
  assert.equal(study.filmDate, null);
  assert.ok('subjectId' in study && 'timepoint' in study && 'filmDate' in study);
});

// The Parameters grid shows all three, and the search box applies to the grid: a visible column
// you cannot search reads as broken.
test('matchesQuery finds a study by its subject, timepoint or film date', () => {
  const study = { id: 'SP-1000', view: 'Standing lateral', subjectId: 'S001', timepoint: 'Pre-op', filmDate: '2025-03-02', clinical: {} };
  assert.equal(matchesQuery(study, 's001'), true);
  assert.equal(matchesQuery(study, 'pre-op'), true);
  assert.equal(matchesQuery(study, '2025-03'), true);
  assert.equal(matchesQuery(study, 'post-op'), false);
  // Null fields on an older record never throw and never match.
  assert.equal(matchesQuery({ id: 'SP-1001', view: 'Standing lateral', subjectId: null, timepoint: null, filmDate: null }, 'null'), false);
});
```

In `test/csv.test.js`:

1. In `'toCsv exports absent measurements as empty cells, never 0'`, change the comment and loop to
   ```js
     // Study ID, View, Subject, Timepoint, Film date, then the ten measurement columns.
     for (let i = 5; i < 5 + 10; i += 1) assert.equal(cells[i], '');
   ```
2. In `'toCsv writes every clinical field present on the exported studies, KNOWN_FIELDS order first, then custom'`, change the comment to `// Study ID, View, Subject, Timepoint, Film date, ten measurement columns, then the union: known` and `header.slice(12)` to `header.slice(15)`.
3. In `'toCsv writes no clinical columns when no exported study carries a value'`, change `assert.equal(header.length, 12);` to `15` and `header[11]` to `header[14]`.
4. In `"toCsv ignores an excluded demo study's clinical keys when choosing the columns"`, change `header.slice(12)` to `header.slice(15)`.
5. Append:

```js
test('toCsv writes Subject, Timepoint and Film date after View, empty when absent (spec §11.1)', () => {
  const csv = toCsv([
    study({ id: 'SP-1000', subjectId: 'S001', timepoint: 'Pre-op', filmDate: '2025-03-02' }),
    study({ id: 'SP-1001' }),
  ]);
  const lines = csv.split('\r\n');
  assert.deepEqual(lines[3].split(',').slice(0, 5), ['Study ID', 'View', 'Subject', 'Timepoint', 'Film date']);
  assert.ok(lines[4].startsWith('SP-1000,Standing lateral,S001,Pre-op,2025-03-02,'), lines[4]);
  assert.ok(lines[5].startsWith('SP-1001,Standing lateral,,,,'), lines[5]);
});
```

In `test/demo-studies.test.js`:

1. Replace the `'SP-0039'` line of `EXPECTED` with
   ```js
     // SP-0039's patient fields were changed on 2026-09-07 so it is SP-0042's post-op film (pre-op/post-op
     // spec §7.4, user decision); its measurements, confidence, view, fileName and addedAt are still the
     // template's. The values below are the intended edit, transcribed here independently of the record.
     'SP-0039': { PI: 49.8, PT: 12.1, SS: 37.7, LL: 52.4, conf: 97, pt: 'P-8841', sex: 'F', age: 62, bmi: '27.4', odi: '22', view: 'Standing lateral', fileName: 'SP-0039.jpg', addedAt: '2026-08-20T12:00:00.000Z' },
   ```
2. Append:

```js
test('SP-0042 and SP-0039 are one subject\'s Pre-op and Post-op films; no other demo carries the study fields', () => {
  const byId = Object.fromEntries(DEMO_STUDIES.map((s) => [s.id, s]));
  assert.equal(byId['SP-0042'].subjectId, 'P-8841');
  assert.equal(byId['SP-0042'].timepoint, 'Pre-op');
  assert.equal(byId['SP-0042'].filmDate, '2026-01-14');
  assert.equal(byId['SP-0039'].subjectId, 'P-8841');
  assert.equal(byId['SP-0039'].timepoint, 'Post-op');
  assert.equal(byId['SP-0039'].filmDate, '2026-07-20');
  // One patient: the post-op film's patient fields match the pre-op film's.
  assert.equal(byId['SP-0039'].pt, byId['SP-0042'].pt);
  assert.equal(byId['SP-0039'].sex, byId['SP-0042'].sex);
  assert.equal(byId['SP-0039'].age, byId['SP-0042'].age);
  assert.equal(byId['SP-0039'].bmi, byId['SP-0042'].bmi);
  for (const study of DEMO_STUDIES) {
    if (study.id === 'SP-0042' || study.id === 'SP-0039') continue;
    assert.equal(study.subjectId ?? null, null, study.id);
    assert.equal(study.timepoint ?? null, null, study.id);
    assert.equal(study.filmDate ?? null, null, study.id);
  }
});
```

- [ ] **Step 2: Run the four suites to see the new tests fail**

Run: `node --test test/persistence.test.js test/studies.test.js test/csv.test.js test/demo-studies.test.js`
Expected: the two new persistence tests FAIL (`subjectId` not in the returned object); `newStudy` test FAILS; `matchesQuery` test FAILS on `s001`; the four edited toCsv tests FAIL (the header has 12 columns) and the new one FAILS; the double-entry test FAILS on SP-0039's `pt` and the new pair test FAILS. Everything else passes.

- [ ] **Step 3: `validateStudy` returns the fields**

In `renderer/data/persistence.js`, change the import block to:

```js
import { DEMO_STUDIES } from './demo-studies.js';
import { FILM_DATE } from './timepoints.js';
```

Add after `function finite(n) { … }`:

```js
// A non-empty string as given, else null: the rule for every optional text field on the record.
function optionalText(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
```

In `validateStudy`, after the `console.warn(… malformed measurements/geometry …)` block and before `return {`, insert:

```js
  // (2026-09-07, pre-op/post-op spec §7.1) three more optional, null-default text fields, on the
  // same terms as name and workspaceFolder below. A film date that is not YYYY-MM-DD is dropped
  // with a warning rather than failing the record (§7.4): a bad date is not fatal.
  const filmDateText = optionalText(entry.filmDate);
  const filmDate = filmDateText !== null && FILM_DATE.test(filmDateText) ? filmDateText : null;
  if (filmDateText !== null && filmDate === null) {
    console.warn(`persistence: ${entry.id} has a film date that is not YYYY-MM-DD ("${filmDateText}"); it is dropped.`);
  }
```

and in the returned object, after the `workspaceFolder:` line, insert:

```js
    subjectId: optionalText(entry.subjectId),
    timepoint: optionalText(entry.timepoint),
    filmDate,
```

- [ ] **Step 4: `newStudy`, `matchesQuery` and the placeholder**

In `renderer/screens/studies.js`:

1. In `newStudy`, change `name: defaultName(fileName), workspaceFolder,` to
   ```js
       name: defaultName(fileName), workspaceFolder,
       // Pre-op/post-op spec §7.1: set by a workspace load, the CSV or the drawer; null until then.
       subjectId: null, timepoint: null, filmDate: null,
   ```
2. In `matchesQuery`, change the array's first line to
   ```js
     return [study.id, studyName(study), study.subjectId, study.timepoint, study.filmDate, workspaceLabel(study), folderLabel(study), study.pt, study.dx, study.view, ...Object.values(study.clinical ?? {})]
   ```
   and add to the comment above it, after "a visible column you cannot search reads as broken.": `The subject, timepoint and film date are on the Parameters grid, which the box also filters.`
3. In `render`, change the search placeholder to `'Search name, subject, workspace, folder, patient…'`.

- [ ] **Step 5: `toCsv`'s three columns**

In `renderer/data/csv.js`, in `toCsv`, change

```js
  const header = ['Study ID', 'View', ...MEASUREMENT_COLUMNS, ...fields];
```

to

```js
  // Subject, Timepoint and Film date sit after View (pre-op/post-op spec §11.1): the identity a
  // paired analysis groups on, then the acquisition date. Absent values are empty, never 0 or —.
  const header = ['Study ID', 'View', 'Subject', 'Timepoint', 'Film date', ...MEASUREMENT_COLUMNS, ...fields];
```

and the `cells` array's first two entries to

```js
      study.id,
      study.view,
      study.subjectId ?? '',
      study.timepoint ?? '',
      study.filmDate ?? '',
```

- [ ] **Step 6: The demo pair**

In `renderer/data/demo-studies.js`:

1. Append to the header comment, before the closing ` */`:
   ```
    *
    * 2026-09-07 (pre-op/post-op spec §7.4, user decision): SP-0042 and SP-0039 are ONE subject's
    * Pre-op and Post-op films, so the dev build shows a pair without a fixture. SP-0039's patient
    * fields (pt, age, bmi, odi, dx, plan, hx, outcome) were rewritten to match SP-0042's -- the
    * L4–L5 TLIF its outcome already described is that patient's operation. Its measurements,
    * confidence, view and dates are still the template's. The other seven carry no subject.
   ```
2. In SP-0042, after `clinical: {},` insert
   ```js
       subjectId: 'P-8841', timepoint: 'Pre-op', filmDate: '2026-01-14',
   ```
3. Replace SP-0039's `clinical: {},` and the three lines after it with
   ```js
       clinical: {},
       subjectId: 'P-8841', timepoint: 'Post-op', filmDate: '2026-07-20',
       pt: 'P-8841', sex: 'F', age: 62, bmi: '27.4', odi: '22',
       dx: 'Anterior slip of L4 on L5 · after L4–L5 TLIF', plan: 'Routine follow-up', hx: 'L4–L5 TLIF, 2026; L3 laminectomy, 2019',
       outcome: 'L4–L5 TLIF, posterior instrumentation. ODI 46→22 at 6 mo.', conf: 97,
   ```

- [ ] **Step 7: Run the suites to see them pass**

Run: `node --test test/*.test.js`
Expected: 355/355 (349 + 2 persistence + 2 studies + 1 csv + 1 demo; the edited tests change no count).

Also run `grep -rn "P-7712\|Lenke" renderer tools/smoke test` — Expected: no matches outside `design-reference/`.

- [ ] **Step 8: Commit**

```bash
git add renderer/data/persistence.js renderer/screens/studies.js renderer/data/csv.js renderer/data/demo-studies.js test/persistence.test.js test/studies.test.js test/csv.test.js test/demo-studies.test.js
git commit -m "feat: subject, timepoint and film date on the record; three export columns; a demo pair

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The four structural CSV columns

**Files:**
- Modify: `renderer/data/csv.js` (imports; `autoMap`; after `findJoinHeader`; `joinClinical`)
- Modify: `test/csv.test.js`

**Interfaces:**
- Consumes: `normaliseTimepoint`, `parseFilmDate` from `data/timepoints.js` (Task 1).
- Produces: `findStructuralHeaders(headers) → {subjectId, timepoint, filmDate, view}` (header names or null), `structuralField(header, headers) → 'subjectId'|'timepoint'|'filmDate'|'view'|null`, `STRUCTURAL_LABELS`, `structuralFromRow(row, structural) → {subjectId, timepoint, filmDate, view, badDate}`; `joinClinical` additionally returns `rowByFile: Map<filePath, row>`; `autoMap` returns `dest: null` for a structural header. Tasks 5, 6 and 7 consume these names exactly.

- [ ] **Step 1: Write the failing tests**

In `test/csv.test.js`, change the import line to:

```js
import {
  toCsv, parse, autoMap, KNOWN_FIELDS, fileStem, findJoinHeader, joinClinical, clinicalFieldNames,
  findStructuralHeaders, structuralField, STRUCTURAL_LABELS, structuralFromRow,
} from '../renderer/data/csv.js';
```

In `'joinClinical with no study_id column links nothing and counts every row as unmatched'`, change the expected object to

```js
  assert.deepEqual(join, {
    joinHeader: null, byFile: new Map(), rowByFile: new Map(), matched: 0, unmatched: 3, duplicates: 0, ambiguous: 0,
  });
```

Append:

```js
// ---------------------------------------------------------------------------
// Structural columns (pre-op/post-op spec §8.2): subject, timepoint, film date, view.

test('findStructuralHeaders recognises the §8.2 aliases by normalised name, first header wins, and never a bare date', () => {
  assert.deepEqual(findStructuralHeaders(['study_id', 'Subject ID', 'Time_Point', 'Study Date', 'Position']),
    { subjectId: 'Subject ID', timepoint: 'Time_Point', filmDate: 'Study Date', view: 'Position' });
  assert.deepEqual(findStructuralHeaders(['subject', 'visit', 'film_date', 'view', 'subject_id']),
    { subjectId: 'subject', timepoint: 'visit', filmDate: 'film_date', view: 'view' });
  assert.deepEqual(findStructuralHeaders(['study_id', 'date', 'age']), { subjectId: null, timepoint: null, filmDate: null, view: null });
  assert.deepEqual(findStructuralHeaders([]), { subjectId: null, timepoint: null, filmDate: null, view: null });
  assert.equal(structuralField('Time_Point', ['study_id', 'Time_Point']), 'timepoint');
  assert.equal(structuralField('subject_id', ['subject', 'subject_id']), null);
  assert.equal(structuralField('age', ['age']), null);
  assert.deepEqual(STRUCTURAL_LABELS, { subjectId: 'Subject', timepoint: 'Timepoint', filmDate: 'Film date', view: 'View' });
});

test('structuralFromRow trims, normalises a known timepoint, keeps a custom one, and parses both date forms', () => {
  const structural = findStructuralHeaders(['subject_id', 'timepoint', 'film_date', 'view']);
  assert.deepEqual(structuralFromRow({ subject_id: ' S001 ', timepoint: 'preop', film_date: '3/2/2025', view: ' Supine lateral ' }, structural),
    { subjectId: 'S001', timepoint: 'Pre-op', filmDate: '2025-03-02', view: 'Supine lateral', badDate: false });
  assert.deepEqual(structuralFromRow({ subject_id: 'S002', timepoint: '6 weeks', film_date: '2025-09-14', view: '' }, structural),
    { subjectId: 'S002', timepoint: '6 wk', filmDate: '2025-09-14', view: null, badDate: false });
  assert.deepEqual(structuralFromRow({ subject_id: '', timepoint: 'baseline', film_date: '', view: 'flexion' }, structural),
    { subjectId: null, timepoint: 'baseline', filmDate: null, view: 'flexion', badDate: false });
  // A rejected date is not written and is flagged; a column the CSV lacks supplies nothing.
  assert.deepEqual(structuralFromRow({ subject_id: 'S003', timepoint: '', film_date: '2025-02-30', view: '' }, structural),
    { subjectId: 'S003', timepoint: null, filmDate: null, view: null, badDate: true });
  assert.deepEqual(structuralFromRow({ subject_id: 'S004' }, findStructuralHeaders(['study_id', 'subject_id'])),
    { subjectId: 'S004', timepoint: null, filmDate: null, view: null, badDate: false });
});

test('autoMap never claims a structural header as a clinical field', () => {
  assert.deepEqual(autoMap(['subject_id', 'timepoint', 'film_date', 'view', 'age']), [
    { src: 'subject_id', dest: null }, { src: 'timepoint', dest: null }, { src: 'film_date', dest: null },
    { src: 'view', dest: null }, { src: 'age', dest: 'Age' },
  ]);
  // A second subject column is not structural (the first wins) and is not a known field either.
  assert.deepEqual(autoMap(['subject', 'subject_id']), [{ src: 'subject', dest: null }, { src: 'subject_id', dest: null }]);
});

test('joinClinical hands back the matched raw row under the same file key, and a structural column never reaches clinical', () => {
  const join = joinClinical({
    files: ['C:\\films\\a.png', 'C:\\films\\b.png'],
    headers: ['study_id', 'timepoint', 'age_yrs'],
    rows: [{ study_id: 'a', timepoint: 'preop', age_yrs: '58' }, { study_id: 'zzz', timepoint: 'postop', age_yrs: '1' }],
    mapping: [{ src: 'study_id', dest: null }, { src: 'timepoint', dest: null }, { src: 'age_yrs', dest: 'Age' }],
  });
  assert.deepEqual(join.rowByFile.get('C:\\films\\a.png'), { study_id: 'a', timepoint: 'preop', age_yrs: '58' });
  assert.equal(join.rowByFile.has('C:\\films\\b.png'), false);
  assert.equal(join.rowByFile.size, 1);
  assert.deepEqual(join.byFile.get('C:\\films\\a.png'), { Age: '58' });
});
```

- [ ] **Step 2: Run the suite to see the new tests fail**

Run: `node --test test/csv.test.js`
Expected: FAIL at import (`findStructuralHeaders` is not exported).

- [ ] **Step 3: Implement**

In `renderer/data/csv.js`:

1. Add at the top of the file, before `const MEASUREMENT_COLUMNS`:
   ```js
   import { normaliseTimepoint, parseFilmDate } from './timepoints.js';
   ```
2. Replace `autoMap`'s first three lines (`export function autoMap(headers) {` through `return headers.map((src) => {`) with:
   ```js
   export function autoMap(headers) {
     const known = KNOWN_FIELDS.map((field) => ({ field, key: normalizeFieldName(field) }));
     const claimed = new Set();
     // A structural header (subject_id, timepoint, film_date, view -- pre-op/post-op spec §8.2) is
     // read by the load itself and is never a clinical field, whatever a known field's prefix might
     // otherwise match.
     const reserved = new Set(Object.values(findStructuralHeaders(headers)).filter((header) => header !== null));
     return headers.map((src) => {
       if (reserved.has(src)) return { src, dest: null };
   ```
3. Insert after `findJoinHeader`:
   ```js
   // The four structural columns (pre-op/post-op spec §8.2), recognised the way study_id is -- by
   // normalised header -- and never offered as clinical fields. The first header naming each field
   // wins; a second `subject` column is an ordinary (unmapped) chip. A bare `date` column is
   // deliberately not recognised: in a clinical sheet it is as likely the surgery date.
   const STRUCTURAL_KEYS = {
     subjectId: ['subjectid', 'subject'],
     timepoint: ['timepoint', 'visit'],
     filmDate: ['studydate', 'filmdate'],
     view: ['view', 'position'],
   };

   // What the mapping card writes beside a structural header.
   export const STRUCTURAL_LABELS = Object.freeze({ subjectId: 'Subject', timepoint: 'Timepoint', filmDate: 'Film date', view: 'View' });

   // → {subjectId, timepoint, filmDate, view}: the header that supplies each field, or null.
   export function findStructuralHeaders(headers) {
     const found = { subjectId: null, timepoint: null, filmDate: null, view: null };
     for (const header of headers ?? []) {
       const key = normalizeFieldName(header);
       for (const [field, keys] of Object.entries(STRUCTURAL_KEYS)) {
         if (found[field] === null && keys.includes(key)) found[field] = header;
       }
     }
     return found;
   }

   // The structural field `header` supplies among `headers`, or null.
   export function structuralField(header, headers) {
     const found = findStructuralHeaders(headers);
     return Object.keys(found).find((field) => found[field] === header) ?? null;
   }

   // The structural values one CSV row supplies (§8.2): subject and view as typed after trimming;
   // the timepoint normalised through §7.2 when it names a known label (`preop` → Pre-op,
   // `6 weeks` → 6 wk) and otherwise as typed; the film date as YYYY-MM-DD when it parses.
   // `badDate` says the row carried a date the parser rejected -- the text is stored nowhere and
   // the load counts it (§8.4).
   export function structuralFromRow(row, structural) {
     const read = (header) => (header === null || header === undefined ? '' : String(row?.[header] ?? '').trim());
     const subject = read(structural?.subjectId);
     const timepoint = read(structural?.timepoint);
     const date = read(structural?.filmDate);
     const view = read(structural?.view);
     const filmDate = date === '' ? null : parseFilmDate(date);
     return {
       subjectId: subject === '' ? null : subject,
       timepoint: timepoint === '' ? null : (normaliseTimepoint(timepoint) ?? timepoint),
       filmDate,
       view: view === '' ? null : view,
       badDate: date !== '' && filmDate === null,
     };
   }
   ```
4. In `joinClinical`: in the early return, change `byFile: new Map(),` to `byFile: new Map(), rowByFile: new Map(),`; after `const byFile = new Map();` add `const rowByFile = new Map();`; after `byFile.set(films[0], clinical);` add `rowByFile.set(films[0], row);`; change the final return to `return { joinHeader, byFile, rowByFile, matched, unmatched, duplicates, ambiguous };`. Append to the function's header comment: `rowByFile holds the matched RAW row under the same key, for the structural columns the load reads itself (spec §8.2); the mapping never copies those.`

- [ ] **Step 4: Run the suite to see it pass**

Run: `node --test test/csv.test.js` — Expected: all pass. Then `node --test test/*.test.js` — Expected: 359/359.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/csv.js test/csv.test.js
git commit -m "feat: recognise subject, timepoint, film date and view columns in a workspace CSV

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 5: The load seeds the fields, counts what it inferred, and says so

**Files:**
- Modify: `renderer/screens/workspace.js` (imports; `loadWorkspaceStudies`; `workspaceLoadedMessage`; two new module-private helpers)
- Modify: `renderer/store.js` (`wsFolderRows`)
- Modify: `test/workspace.test.js`, `test/store.test.js`
- Modify: `tools/smoke/smoke-workspace.mjs` (two toast constants — text only; the suite is run in Task 6's dry run)
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` (State shape: `wsFolderRows`)

**Interfaces:**
- Consumes: `folderRows`, `folderKey`, `seedFields`, `STUDY_FIELDS` from `data/seeding.js` (Task 2); `findStructuralHeaders`, `structuralFromRow` from `data/csv.js` (Task 4); `DEFAULT_VIEW` from `data/timepoints.js` (Task 1); `newStudy` (Task 3's shape).
- Produces: `state.wsFolderRows` (`{folder, count, timepoint, view}[]`, initial `[]`); `loadWorkspaceStudies(state)` additionally returns `seeding: {fromFolders, fromCsv, noSubject, noTimepoint, badDates}` and reads `state.wsFolderRows` (falling back to `folderRows(wsFiles, wsFolder)` when empty); `workspaceLoadedMessage({added, known, updated, join, mapping, seeding})` — `seeding` optional. Task 6 consumes both.

Wording ruling for this task: the §8.4 clause reads `subject, timepoint or view read from folder or file names for N films`, because a flat folder seeds every subject from the film's own stem and "folder names" alone would be untrue there. The `updated` parenthesis becomes `(blank fields filled for N)`.

- [ ] **Step 1: Write the failing tests**

In `test/workspace.test.js`:

1. Replace the `real` helper with one that carries the three fields (the shape `validate()` returns since Task 3) and accepts overrides:
   ```js
   // A persisted real record, the shape validate() returns (renderer/data/persistence.js).
   function real(id, filePath, clinical = {}, extra = {}) {
     return {
       id, source: 'real', filePath, fileName: filePath.split(/[\\/]/).pop(),
       addedAt: '2026-08-21T12:00:00.000Z', view: 'Standing lateral', thumbnail: null,
       subjectId: null, timepoint: null, filmDate: null,
       measurements: null, geometry: null, qc: null, clinical, ...extra,
     };
   }
   ```
2. In `'loadWorkspaceStudies skips films already in the library, matching filePath case-insensitively, and counts them'`, change `const known = real('SP-1000', 'C:\\Films\\A.PNG');` to `const known = real('SP-1000', 'C:\\Films\\A.PNG', {}, { subjectId: 'K' });` and add the comment line above it: `// K is stored, so the load has no blank subject to fill and the record comes back by reference.`
3. In `'loadWorkspaceStudies fills only the blank clinical keys of a known record and never overwrites'`, change `const b = real('SP-1002', 'C:\\films\\b.png', { Age: '44' });` to `const b = real('SP-1002', 'C:\\films\\b.png', { Age: '44' }, { subjectId: 'B' });`, and after `assert.deepEqual(a.clinical, { Notes: 'keep me', Age: '61', Sex: '' });` add:
   ```js
     // The stem `a` fills the record's blank subject on the same new object; the original is untouched.
     assert.equal(merged.subjectId, 'a');
     assert.equal(a.subjectId, null);
   ```
4. In `'workspaceLoadedMessage reports films already in the library and clinical updates'`, change `(clinical data updated for 2)` to `(blank fields filled for 2)`; in `'workspaceLoadedMessage says nothing was written when a re-Load found no blank to fill'`, change `(clinical data updated for 1)` to `(blank fields filled for 1)`.
5. Append:

```js
// ---------------------------------------------------------------------------
// Seeding the study fields on load (pre-op/post-op spec §8).

const WS = 'C:\\ws\\Fusion2025';
const at = (relative) => `${WS}\\${relative.replace(/\//g, '\\')}`;
const pick = (s) => ({ subjectId: s.subjectId, timepoint: s.timepoint, filmDate: s.filmDate, view: s.view });

test('loadWorkspaceStudies seeds subject, timepoint and view from the layout, and counts what it read', () => {
  const result = loadWorkspaceStudies(baseState({
    wsFolder: WS,
    wsFiles: [at('pre-op/S001.png'), at('post-op/S001.png'), at('flexion/S003.png'), at('S004_postop.png'), at('IMG_0001.png')],
  }));
  const by = (relative) => result.studies.find((s) => s.filePath === at(relative));
  assert.deepEqual(pick(by('pre-op/S001.png')), { subjectId: 'S001', timepoint: 'Pre-op', filmDate: null, view: 'Standing lateral' });
  assert.deepEqual(pick(by('post-op/S001.png')), { subjectId: 'S001', timepoint: 'Post-op', filmDate: null, view: 'Standing lateral' });
  assert.deepEqual(pick(by('flexion/S003.png')), { subjectId: 'S003', timepoint: null, filmDate: null, view: 'Flexion lateral' });
  assert.deepEqual(pick(by('S004_postop.png')), { subjectId: 'S004', timepoint: 'Post-op', filmDate: null, view: 'Standing lateral' });
  assert.deepEqual(pick(by('IMG_0001.png')), { subjectId: 'IMG_0001', timepoint: null, filmDate: null, view: 'Standing lateral' });
  assert.deepEqual(result.seeding, { fromFolders: 5, fromCsv: 0, noSubject: 0, noTimepoint: 2, badDates: 0 });
});

test('loadWorkspaceStudies applies the folder table: a user-set row beats the default, the film\'s own stem beats the row', () => {
  const result = loadWorkspaceStudies(baseState({
    wsFolder: WS,
    wsFiles: [at('pre-op/S001.png'), at('pre-op/S002_flexion.png'), at('S003.png')],
    wsFolderRows: [
      { folder: 'pre-op', count: 2, timepoint: 'Intra-op', view: 'Extension lateral' },
      { folder: '.', count: 1, timepoint: null, view: 'Standing lateral' },
    ],
  }));
  const by = (relative) => result.studies.find((s) => s.filePath === at(relative));
  assert.deepEqual(pick(by('pre-op/S001.png')), { subjectId: 'S001', timepoint: 'Intra-op', filmDate: null, view: 'Extension lateral' });
  assert.deepEqual(pick(by('pre-op/S002_flexion.png')), { subjectId: 'S002', timepoint: 'Intra-op', filmDate: null, view: 'Flexion lateral' });
  assert.deepEqual(pick(by('S003.png')), { subjectId: 'S003', timepoint: null, filmDate: null, view: 'Standing lateral' });
  assert.deepEqual(result.seeding, { fromFolders: 3, fromCsv: 0, noSubject: 0, noTimepoint: 1, badDates: 0 });
});

test('loadWorkspaceStudies fills a known record\'s blank study fields on a new object, never overwrites, and counts it', () => {
  const blank = real('SP-1000', at('pre-op/S001.png'));
  const full = real('SP-1001', at('flexion/S002.png'), {}, { subjectId: 'KEEP', timepoint: '6 wk', filmDate: '2020-01-01', view: 'Prone lateral' });
  const result = loadWorkspaceStudies(baseState({ studies: [blank, full, DEMO], wsFolder: WS, wsFiles: [at('pre-op/S001.png'), at('flexion/S002.png')] }));
  assert.equal(result.added, 0);
  assert.equal(result.known, 2);
  assert.equal(result.updated, 1);
  const filled = result.studies.find((s) => s.id === 'SP-1000');
  assert.notEqual(filled, blank);
  assert.deepEqual(pick(filled), { subjectId: 'S001', timepoint: 'Pre-op', filmDate: null, view: 'Standing lateral' });
  assert.deepEqual(pick(blank), { subjectId: null, timepoint: null, filmDate: null, view: 'Standing lateral' });
  // Everything stored stays, including a view the folder name contradicts, and the record is the same object.
  assert.equal(result.studies.find((s) => s.id === 'SP-1001'), full);
  assert.equal(result.studies[2], DEMO);
  assert.deepEqual(result.seeding, { fromFolders: 1, fromCsv: 0, noSubject: 0, noTimepoint: 0, badDates: 0 });
});

test('loadWorkspaceStudies takes the CSV\'s structural columns over the layout, never into clinical, and counts a bad date', () => {
  const headers = ['study_id', 'subject_id', 'timepoint', 'film_date', 'view', 'age_yrs'];
  const result = loadWorkspaceStudies(baseState({
    wsFolder: WS,
    wsFiles: [at('pre-op/S001.png'), at('post-op/S002.png')],
    wsCsv: 'C:\\ws\\clinical.csv', wsCsvHeaders: headers,
    wsCsvRows: [
      { study_id: 'S001', subject_id: 'P-1', timepoint: 'preop', film_date: '3/2/2025', view: 'Supine lateral', age_yrs: '58' },
      { study_id: 'S002', subject_id: '', timepoint: '', film_date: '2025-02-30', view: '', age_yrs: '' },
    ],
    wsMapping: [{ src: 'study_id', dest: null }, { src: 'subject_id', dest: null }, { src: 'timepoint', dest: null },
      { src: 'film_date', dest: null }, { src: 'view', dest: null }, { src: 'age_yrs', dest: 'Age' }],
  }));
  const by = (relative) => result.studies.find((s) => s.filePath === at(relative));
  assert.deepEqual(pick(by('pre-op/S001.png')), { subjectId: 'P-1', timepoint: 'Pre-op', filmDate: '2025-03-02', view: 'Supine lateral' });
  assert.deepEqual(by('pre-op/S001.png').clinical, { Age: '58' });
  // Blank CSV cells supply nothing: the layout fills in, and the rejected date is counted, not stored.
  assert.deepEqual(pick(by('post-op/S002.png')), { subjectId: 'S002', timepoint: 'Post-op', filmDate: null, view: 'Standing lateral' });
  assert.deepEqual(by('post-op/S002.png').clinical, {});
  assert.deepEqual(result.seeding, { fromFolders: 1, fromCsv: 1, noSubject: 0, noTimepoint: 0, badDates: 1 });
});

test('workspaceLoadedMessage appends the §8.4 seeding clauses, each only when its count is non-zero', () => {
  const base = { added: 2, known: 0, updated: 0, join: null, mapping: [] };
  assert.equal(workspaceLoadedMessage({ ...base, seeding: { fromFolders: 2, fromCsv: 0, noSubject: 0, noTimepoint: 0, badDates: 0 } }),
    'Workspace loaded — 2 studies added · subject, timepoint or view read from folder or file names for 2 films');
  assert.equal(workspaceLoadedMessage({ ...base, seeding: { fromFolders: 0, fromCsv: 1, noSubject: 1, noTimepoint: 2, badDates: 1 } }),
    'Workspace loaded — 2 studies added · subject, timepoint, film date or view set from the CSV for 1 film'
    + ' · 1 film has no subject · 2 films have no timepoint · 1 film date could not be read');
  assert.equal(workspaceLoadedMessage({ ...base, seeding: { fromFolders: 0, fromCsv: 0, noSubject: 0, noTimepoint: 0, badDates: 3 } }),
    'Workspace loaded — 2 studies added · 3 film dates could not be read');
  assert.equal(workspaceLoadedMessage({ ...base, seeding: { fromFolders: 0, fromCsv: 0, noSubject: 0, noTimepoint: 0, badDates: 0 } }),
    'Workspace loaded — 2 studies added');
  // No seeding record at all (an older caller): no clauses.
  assert.equal(workspaceLoadedMessage(base), 'Workspace loaded — 2 studies added');
});
```

In `test/store.test.js`, after `assert.deepEqual(state.wsMapping, []);` add `assert.deepEqual(state.wsFolderRows, []);`.

- [ ] **Step 2: Run the two suites to see the new tests fail**

Run: `node --test test/workspace.test.js test/store.test.js`
Expected: the five new workspace tests FAIL (`subjectId` undefined on the loaded records; no seeding clauses); the two edited message tests FAIL on the old parenthesis wording; the edited known-record tests FAIL (`updated` is 1 where 0 is expected / `merged.subjectId` undefined); the store test FAILS on `wsFolderRows`.

- [ ] **Step 3: The store key**

In `renderer/store.js`, after `wsMapping: [],` add:

```js
  // (2026-09-07, pre-op/post-op spec §8.5) One row per scanned folder that holds films --
  // { folder, count, timepoint, view } -- the assignment the Workspace card shows before Load.
  // Rebuilt by every scan, replaced wholesale on every change, never persisted.
  wsFolderRows: [],
```

In the contract's State shape (`docs/superpowers/plans/2026-08-31-00-architecture-contract.md`), after the `wsMapping: [],            // Mapping[] — see data/csv.js` line add:

```
  wsFolderRows: [],         // (2026-09-07, spec §8.5) {folder, count, timepoint, view}[] — one per scanned folder holding
                            // films, from data/seeding.js folderRows; rebuilt by every scan, replaced wholesale, never persisted
```

- [ ] **Step 4: The load and the message**

In `renderer/screens/workspace.js`:

1. Change the `csv.js` import to
   ```js
   import { parse, autoMap, KNOWN_FIELDS, findJoinHeader, joinClinical, clinicalFieldNames, findStructuralHeaders, structuralFromRow } from '../data/csv.js';
   ```
   and add after it:
   ```js
   import { folderRows, folderKey, seedFields, STUDY_FIELDS } from '../data/seeding.js';
   import { DEFAULT_VIEW } from '../data/timepoints.js';
   ```
2. Replace the whole `loadWorkspaceStudies` function (from its `// Pure: the studies list a Load would commit` comment through its closing `}`) with:

```js
// Pure: the studies list a Load would commit, plus the counts the toast reports. Known films
// (same filePath, case-insensitively -- Windows paths) are never added twice; when the CSV has
// a row for a known film, the keys that record is MISSING (absent or empty) are filled onto a
// NEW object -- an existing value is never overwritten, and a record with nothing to fill is
// kept by reference and not counted. New records are front-inserted in scan order with
// consecutive ids; nextId is read once.
//
// The four study fields (pre-op/post-op spec §8.3) follow the same fill-blanks rule: seedFields
// hands back the stored value where there is one, so a change here is by construction a blank
// being filled. `seeding` counts, over the scanned films, how many had something read from the
// folder layout or the film's own name, how many took something from the CSV, how many end the
// load with no subject or no timepoint, and how many CSV dates could not be read (§8.4).
export function loadWorkspaceStudies(state) {
  const join = state.wsCsv
    ? joinClinical({ files: state.wsFiles, headers: state.wsCsvHeaders, rows: state.wsCsvRows, mapping: state.wsMapping })
    : null;
  const structural = state.wsCsv ? findStructuralHeaders(state.wsCsvHeaders) : null;
  const root = state.wsFolder ?? null;
  // The folder table the card showed (§8.5). A state seeded without one -- the smoke harness, a
  // unit test -- falls back to the rows the scan would have built, which is exactly what the card
  // shows before the user touches it.
  const rows = Array.isArray(state.wsFolderRows) && state.wsFolderRows.length > 0
    ? state.wsFolderRows
    : folderRows(state.wsFiles, root);
  const rowByFolder = new Map(rows.map((row) => [row.folder, row]));

  const knownByPath = new Map();
  for (const study of state.studies) {
    if (study.source === 'real' && typeof study.filePath === 'string' && study.filePath) {
      knownByPath.set(study.filePath.toLowerCase(), study);
    }
  }

  let next = Number(nextId(state.studies).slice(3));
  const added = [];
  const replacements = new Map(); // study id -> the updated record
  let known = 0;
  let updated = 0;
  const seeding = { fromFolders: 0, fromCsv: 0, noSubject: 0, noTimepoint: 0, badDates: 0 };

  for (const filePath of state.wsFiles) {
    const existing = knownByPath.get(filePath.toLowerCase()) ?? null;
    const csvRow = join ? (join.rowByFile.get(filePath) ?? null) : null;
    const csv = csvRow ? structuralFromRow(csvRow, structural) : null;
    if (csv && csv.badDate) seeding.badDates += 1;
    const seeded = seedFields({ filePath, root, existing, csv, row: rowByFolder.get(folderKey(filePath, root)) ?? null });
    countSeeding(seeding, seeded);

    if (existing) {
      known += 1;
      const fromCsv = join ? join.byFile.get(filePath) : undefined;
      // Load FILLS BLANKS; it never overwrites. A value already on the record was either
      // typed in the drawer or imported deliberately, and a second Load -- or an overlapping
      // folder scanned with a stale CSV -- must not silently replace it. Only the keys whose
      // current value is absent or empty are taken; if none is, the record is kept BY
      // REFERENCE and not counted, so `updated` never reports work that did not happen.
      // The explicit overwrite path is `Import from CSV` in the drawer.
      const fills = {};
      for (const [key, value] of Object.entries(fromCsv ?? {})) {
        const current = existing.clinical ? existing.clinical[key] : undefined;
        if (current == null || current === '') fills[key] = value;
      }
      const studyFills = {};
      for (const field of STUDY_FIELDS) {
        const current = existing[field];
        if ((current == null || current === '') && seeded.fields[field] != null) studyFills[field] = seeded.fields[field];
      }
      const record = Object.keys(fills).length > 0 || Object.keys(studyFills).length > 0
        ? { ...existing, ...studyFills, clinical: { ...existing.clinical, ...fills } }
        : existing;
      if (record !== existing) {
        replacements.set(existing.id, record);
        updated += 1;
      }
      countMissing(seeding, record);
      continue;
    }
    const id = `SP-${String(next++).padStart(4, '0')}`;
    const record = {
      // state.wsFolder is the ROOT the user picked. The scan recurses, so a film below it keeps
      // its own containing folder in filePath; the table shows both, and the pair is what tells
      // two same-named films under different workspaces apart.
      ...newStudy({ id, fileName: filePath.split(/[\\/]/).pop(), filePath, workspaceFolder: root }),
      // The seeded subject, timepoint, film date and view (§8.3). view is never null here: the
      // folder row always holds one, and it was on screen before Load.
      ...seeded.fields,
      // Spread, never the join's own object: the store never holds a reference the join still owns.
      clinical: { ...(join?.byFile.get(filePath) ?? {}) },
    };
    added.push(record);
    countMissing(seeding, record);
  }

  const existingWithUpdates = state.studies.map((study) => replacements.get(study.id) ?? study);
  return { studies: [...added, ...existingWithUpdates], added: added.length, known, updated, join, seeding };
}

// "read from folder or file names" counts a film when any field came from a folder segment, the
// stem, or a folder-table row holding something other than the default view; "set from the CSV"
// when any came from the row. A stored value counts for neither: nothing was read for it.
function countSeeding(seeding, seeded) {
  const sources = seeded.sources;
  const inferred = STUDY_FIELDS.some((field) => sources[field] === 'folder' || sources[field] === 'stem')
    || sources.timepoint === 'row'
    || (sources.view === 'row' && seeded.fields.view !== DEFAULT_VIEW);
  if (inferred) seeding.fromFolders += 1;
  if (STUDY_FIELDS.some((field) => sources[field] === 'csv')) seeding.fromCsv += 1;
}

function countMissing(seeding, record) {
  if (record.subjectId == null || record.subjectId === '') seeding.noSubject += 1;
  if (record.timepoint == null || record.timepoint === '') seeding.noTimepoint += 1;
}
```

3. Replace `workspaceLoadedMessage` with:

```js
function films(n) {
  return `${n} film${n === 1 ? '' : 's'}`;
}

// §8.4: each clause only when its count is non-zero. The rejected dates are stored nowhere; the
// film's empty Film date cell on the Parameters grid is how the user finds which.
function seedingClauses(seeding) {
  if (!seeding) return '';
  const { fromFolders = 0, fromCsv = 0, noSubject = 0, noTimepoint = 0, badDates = 0 } = seeding;
  return (fromFolders ? ` · subject, timepoint or view read from folder or file names for ${films(fromFolders)}` : '')
    + (fromCsv ? ` · subject, timepoint, film date or view set from the CSV for ${films(fromCsv)}` : '')
    + (noSubject ? ` · ${films(noSubject)} ${noSubject === 1 ? 'has' : 'have'} no subject` : '')
    + (noTimepoint ? ` · ${films(noTimepoint)} ${noTimepoint === 1 ? 'has' : 'have'} no timepoint` : '')
    + (badDates ? ` · ${badDates} film date${badDates === 1 ? '' : 's'} could not be read` : '');
}

// The post-load toast. Every clause describes something the load actually did. `updated` counts
// records that had a blank filled -- a clinical key or one of the four study fields.
export function workspaceLoadedMessage({ added, known, updated, join, mapping, seeding = null }) {
  return `Workspace loaded — ${added} ${added === 1 ? 'study' : 'studies'} added`
    + (known ? ` · ${known} already in the library` : '')
    + (updated ? ` (blank fields filled for ${updated})` : '')
    + (join
      ? (join.joinHeader === null
        ? ` · CSV has no study_id column — ${join.unmatched} row${join.unmatched === 1 ? '' : 's'} not linked`
        : (mapping.every((m) => !m.dest)
          ? ' · no columns mapped'
          // Nothing added and nothing updated, with rows that did match: the load wrote no
          // clinical data at all. That is the correction workflow -- fix a wrong Age in the
          // CSV, re-pick it, press Load -- and Load fills only BLANKS, so "clinical data
          // linked" would describe a write that did not happen. Say what happened instead,
          // and name the control that does overwrite.
          : (added === 0 && updated === 0 && join.matched > 0
            ? ` · CSV matched ${join.matched} row${join.matched === 1 ? '' : 's'}; no blank fields to fill (use Import from CSV to replace existing values)`
            : ` · clinical data linked (${join.matched} matched`
              + (join.unmatched ? `, ${join.unmatched} unmatched` : '')
              + (join.duplicates ? `, ${join.duplicates} duplicate study_id` : '')
              + (join.ambiguous ? `, ${join.ambiguous} ambiguous filename` : '')
              + ')')))
      : '')
    + seedingClauses(seeding);
}
```

4. In `onLoadWorkspace`, the call `showToast(workspaceLoadedMessage({ ...result, mapping: live.wsMapping }));` already spreads `result`, which now carries `seeding`. No change.

- [ ] **Step 5: The workspace smoke suite's two toast constants**

In `tools/smoke/smoke-workspace.mjs`, replace the `TOAST_FIRST_LOAD` and `TOAST_SECOND_LOAD` definitions (and the comments above each) with:

```js
// workspaceLoadedMessage: added=3, known=0, updated=0, join present, tx_plan mapped by then. Since
// 2026-09-07 the load also seeds the study fields (spec §8.4): a.png and b.PNG take their subject
// from the stem, batch/c.jpg from its folder, and no folder in the fixture names a timepoint.
const SEEDING_FIRST_LOAD = ' · subject, timepoint or view read from folder or file names for 3 films · 3 films have no timepoint';
const TOAST_FIRST_LOAD = `Workspace loaded — 3 studies added · ${LINKED_CLAUSE}${SEEDING_FIRST_LOAD}`;
// Second load: added=0, known=3, updated=0 -- a and b already carry every CSV key from the
// first load and Load only fills BLANKS, so this load wrote NOTHING. The message says so and
// names the control that does overwrite, instead of the success-shaped `clinical data linked`
// clause; `matched` is still 2 (a and b), which is the number it reports. The subjects are
// stored now, so nothing is read from names; the three timepoints are still missing.
const TOAST_SECOND_LOAD = 'Workspace loaded — 0 studies added · 3 already in the library'
  + ' · CSV matched 2 rows; no blank fields to fill (use Import from CSV to replace existing values)'
  + ' · 3 films have no timepoint';
```

- [ ] **Step 6: Run the suites to see them pass**

Run: `node --test test/workspace.test.js test/store.test.js` — Expected: all pass. Then `node --test test/*.test.js` — Expected: 364/364.

- [ ] **Step 7: Commit**

```bash
git add renderer/screens/workspace.js renderer/store.js test/workspace.test.js test/store.test.js tools/smoke/smoke-workspace.mjs docs/superpowers/plans/2026-08-31-00-architecture-contract.md
git commit -m "feat: the workspace load seeds subject, timepoint, film date and view and says what it inferred

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The folder table on the Workspace card, and fixed chips for structural columns

**Files:**
- Modify: `renderer/screens/workspace.js` (imports; `render`: `refresh`, `onChooseFolder`, `buildFolderCard`, `buildMappingCard`; two new builders and two handlers)
- Modify: `styles/screens/workspace.css` (append)
- Modify: `tools/smoke/smoke-workspace.mjs` (`chipsSnapshot`; two chip checks)

**Interfaces:**
- Consumes: `folderRows` (Task 2); `structuralField`, `STRUCTURAL_LABELS`, `findJoinHeader` (Task 4 / existing); `TIMEPOINT_SUGGESTIONS`, `VIEW_SUGGESTIONS` (Task 1); `state.wsFolderRows` (Task 5).
- Produces: the DOM the smoke suites select on — `table.workspace-folders[data-ws-key="folders"]`, one `tr[data-ws-folder="<key>"]` per row with selects `[data-ws-key="tp:<key>"]` and `[data-ws-key="view:<key>"]`, header selects `[data-ws-key="all-timepoint"]` / `[data-ws-key="all-view"]`, chips `.workspace-chip-fixed` with `.workspace-chip-dest`. Task 10's seeding suite selects on these exactly.

DOM code: no unit test. Verification is the implementer's CDP dry run, the human gate in step 6, and Task 10's suite.

- [ ] **Step 1: Imports and handlers**

In `renderer/screens/workspace.js`:

1. Change the `csv.js` import to
   ```js
   import {
     parse, autoMap, KNOWN_FIELDS, findJoinHeader, joinClinical, clinicalFieldNames,
     findStructuralHeaders, structuralFromRow, structuralField, STRUCTURAL_LABELS,
   } from '../data/csv.js';
   ```
   and the `timepoints.js` import to
   ```js
   import { DEFAULT_VIEW, TIMEPOINT_SUGGESTIONS, VIEW_SUGGESTIONS } from '../data/timepoints.js';
   ```
2. Replace `refresh` (the function and the comment above it) with:
   ```js
     // SCREEN_KEYS carries no ws* key, so this screen rebuilds itself after each of its own
     // setState calls. Every caller is a DOM event handler, never a store subscriber. The rebuild
     // replaces every node, which drops keyboard focus to <body>; a control carrying a data-ws-key
     // gets focus back by that key (the Parameters panel's data-param-key pattern), so changing
     // one folder row's select does not strand a keyboard user on the page body.
     function refresh(live = getState()) {
       const active = document.activeElement;
       const focusKey = root.contains(active) ? active.getAttribute('data-ws-key') : null;
       mount(inner, buildScreen(live));
       if (focusKey !== null) {
         for (const candidate of inner.querySelectorAll('[data-ws-key]')) {
           if (candidate.getAttribute('data-ws-key') === focusKey) { candidate.focus(); break; }
         }
       }
     }
   ```
3. In `onChooseFolder`, change `setState({ wsFolder: folder, wsFiles: files });` to
   ```js
         // The folder table (spec §8.5) is rebuilt by every scan: the rows are what Load applies.
         setState({ wsFolder: folder, wsFiles: files, wsFolderRows: folderRows(files, folder) });
   ```
4. Add after `onLoadWorkspace`:
   ```js
     // Folder table edits write only wsFolderRows, replaced wholesale; Load is the only writer of
     // studies. Both refresh so the selects re-render from the store (and keep focus by key).
     function setFolderRow(folder, patch) {
       setState((s) => ({ wsFolderRows: s.wsFolderRows.map((row) => (row.folder === folder ? { ...row, ...patch } : row)) }));
       refresh();
     }

     function setAllFolderRows(patch) {
       setState((s) => ({ wsFolderRows: s.wsFolderRows.map((row) => ({ ...row, ...patch })) }));
       refresh();
     }
   ```

- [ ] **Step 2: The table and the card**

Add before `buildFolderCard`:

```js
  // A row's dropdown: `none` as the first entry when given (the timepoint column), then the choices.
  function rowSelect({ key, label, value, choices, none, onChange }) {
    const select = el('select', { class: 'workspace-folder-select', 'aria-label': label, 'data-ws-key': key, onChange });
    if (none !== null) select.append(el('option', { value: '' }, none));
    for (const choice of choices) select.append(el('option', { value: choice }, choice));
    select.value = value ?? '';
    return select;
  }

  // The column-header control that sets every row at once (§8.5): how a layout with one folder
  // per subject is set in one action, and the whole-batch selector for a root with no subfolders.
  // It rests on a `Set all…` placeholder and returns to it after the rebuild.
  function setAllSelect({ key, label, choices, none, onChange }) {
    const select = el('select', {
      class: 'workspace-folder-select workspace-folder-all', 'aria-label': label, 'data-ws-key': key,
      onChange: (event) => { if (event.target.value !== '__all__') onChange(event.target.value); },
    });
    select.append(el('option', { value: '__all__' }, 'Set all…'));
    if (none !== null) select.append(el('option', { value: '' }, none));
    for (const choice of choices) select.append(el('option', { value: choice }, choice));
    select.value = '__all__';
    return select;
  }

  // §8.5: one row per folder holding films, showing what Load will assign to the films directly
  // in it. Every value is on screen before Load -- that is what makes `Standing lateral` on a
  // loaded film an honest label rather than a hard-coded one. The timepoint choices are the
  // drawer's suggestions plus any label a folder name inferred that the list lacks (`3 mo`).
  function buildFolderTable(live) {
    const rows = live.wsFolderRows ?? [];
    if (rows.length === 0) return null;
    const timepoints = [...TIMEPOINT_SUGGESTIONS];
    for (const row of rows) if (row.timepoint && !timepoints.includes(row.timepoint)) timepoints.push(row.timepoint);
    const views = [...VIEW_SUGGESTIONS];
    const head = el('tr', {},
      el('th', { scope: 'col' }, 'FOLDER'),
      el('th', { scope: 'col', class: 'workspace-folders-num' }, 'FILMS'),
      el('th', { scope: 'col' }, 'TIMEPOINT', setAllSelect({
        key: 'all-timepoint', label: 'Set the timepoint of every folder', choices: timepoints, none: 'none',
        onChange: (value) => setAllFolderRows({ timepoint: value === '' ? null : value }),
      })),
      el('th', { scope: 'col' }, 'VIEW', setAllSelect({
        key: 'all-view', label: 'Set the view of every folder', choices: views, none: null,
        onChange: (value) => setAllFolderRows({ view: value }),
      })));
    const body = rows.map((row) => el('tr', { 'data-ws-folder': row.folder },
      el('td', { class: 'workspace-folders-name', title: row.folder }, row.folder),
      el('td', { class: 'workspace-folders-num' }, String(row.count)),
      el('td', {}, rowSelect({
        key: `tp:${row.folder}`, label: `Timepoint for ${row.folder}`, value: row.timepoint, choices: timepoints, none: 'none',
        onChange: (event) => setFolderRow(row.folder, { timepoint: event.target.value === '' ? null : event.target.value }),
      })),
      el('td', {}, rowSelect({
        key: `view:${row.folder}`, label: `View for ${row.folder}`, value: row.view, choices: views, none: null,
        onChange: (event) => setFolderRow(row.folder, { view: event.target.value }),
      }))));
    return el('div', { class: 'workspace-folders-wrap' },
      el('div', { class: 'workspace-folders-scroll' },
        el('table', { class: 'workspace-folders', 'data-ws-key': 'folders' },
          el('thead', {}, head),
          el('tbody', {}, ...body))),
      el('div', { class: 'workspace-card-note workspace-folders-note' },
        'What Load will assign to the films in each folder, unless a film\u2019s own name or the CSV says otherwise. Films already in the library keep their stored values.'));
  }
```

Replace `buildFolderCard`'s `return el('div', { class: \`card workspace-card${hasFolder ? ' workspace-card-set' : ''}\` }, …);` with:

```js
    return el('div', { class: `card workspace-card workspace-card-folder${hasFolder ? ' workspace-card-set' : ''}` },
      el('div', { class: 'workspace-card-row' },
        el('div', { class: 'workspace-card-icon', 'aria-hidden': 'true', innerHTML: FOLDER_SVG }),
        el('div', { class: 'workspace-card-text' },
          el('div', { class: 'eyebrow' }, '01 — IMAGE FOLDER'),
          el('div', { class: 'workspace-card-value' }, hasFolder ? live.wsFolder : 'No folder selected'),
          el('div', { class: 'workspace-card-meta' }, meta)),
        el('button', { type: 'button', class: 'btn btn-small', onClick: onChooseFolder },
          hasFolder ? 'Change…' : 'Choose folder…')),
      hasFolder ? buildFolderTable(live) : null);
```

- [ ] **Step 3: Fixed chips on the mapping card**

In `buildMappingCard`, replace `const chips = mapping.map((m, index) => {` and the `const select = el('select', {` that follows it with:

```js
    const joinHeader = findJoinHeader(live.wsCsvHeaders);
    const chips = mapping.map((m, index) => {
      // The join key and the four structural columns (spec §8.2) are read by the load itself: a
      // fixed destination and no select, so a column the load consumes never reads `Unmapped`.
      const field = structuralField(m.src, live.wsCsvHeaders);
      const fixed = m.src === joinHeader ? 'Join key' : (field ? STRUCTURAL_LABELS[field] : null);
      if (fixed !== null) {
        return el('div', { class: 'workspace-chip workspace-chip-fixed' },
          el('span', { class: 'workspace-chip-src' }, m.src),
          el('span', { class: 'workspace-chip-arrow' }, '→'),
          el('span', { class: 'workspace-chip-dest' }, fixed));
      }
      const select = el('select', {
        class: 'workspace-chip-select',
        'aria-label': `Map ${m.src}`,
        'data-ws-key': `map:${m.src}`,
```

(the rest of the select — its `onChange`, options and the chip wrapper — stays as it is).

- [ ] **Step 4: Styles**

Append to `styles/screens/workspace.css`:

```css
/* Card 01 grows a folder table below its row (pre-op/post-op spec §8.5): what Load will assign
   to the films directly in each folder, editable before Load. */
.workspace-card-folder {
  display: block;
}

.workspace-card-row {
  display: flex;
  align-items: center;
  gap: 18px;
}

.workspace-folders-wrap {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

/* Past roughly ten folders the rows scroll inside the card; the card never outgrows the window. */
.workspace-folders-scroll {
  max-height: 320px;
  overflow-y: auto;
}

.workspace-folders {
  width: 100%;
  border-collapse: collapse;
  font: 400 13px 'Source Sans 3', sans-serif;
  color: var(--ink);
}

.workspace-folders th {
  text-align: left;
  padding: 2px 12px 8px 0;
  font-family: 'Chivo Mono', monospace;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.13em;
  color: var(--muted);
  white-space: nowrap;
}

.workspace-folders td {
  padding: 5px 12px 5px 0;
  border-top: 1px solid var(--border);
  vertical-align: middle;
}

.workspace-folders-name {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Chivo Mono', monospace;
  font-size: 11.5px;
  letter-spacing: 0.04em;
}

.workspace-folders-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

.workspace-folder-select {
  font: 400 13px 'Source Sans 3', sans-serif;
  color: var(--ink);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 3px 6px;
  cursor: pointer;
}

.workspace-folder-select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.workspace-folder-all {
  margin-left: 8px;
  font-size: 11px;
  color: var(--muted);
}

.workspace-folders-note {
  margin-top: 12px;
  padding-top: 0;
  border-top: none;
}

/* A chip the load consumes itself: the join key and the structural columns. */
.workspace-chip-fixed {
  border-color: color-mix(in srgb, var(--sage) 40%, var(--border));
  background: color-mix(in srgb, var(--sage) 8%, transparent);
}

.workspace-chip-dest {
  font-weight: 600;
}
```

- [ ] **Step 5: The workspace smoke suite's chip checks, and the dry run**

In `tools/smoke/smoke-workspace.mjs`:

1. In `chipsSnapshot`, add two properties after `unmapped:`:
   ```js
     fixed: c.classList.contains('workspace-chip-fixed'),
     dest: c.querySelector('.workspace-chip-dest')?.textContent ?? null,
   ```
2. Replace the check `'study_id and tx_plan are unmapped chips with an empty selection'` with
   ```js
     check('study_id is a fixed Join key chip; tx_plan is an unmapped chip with an empty selection',
       chips[0]?.fixed && chips[0]?.dest === 'Join key' && chips[0]?.value === null && !chips[0]?.mapped && !chips[0]?.unmapped
       && chips[3]?.unmapped && !chips[3]?.fixed && chips[3]?.value === '', [chips[0], chips[3]]);
   ```
3. Replace the check `'each select is labelled Map <src>'` with
   ```js
     check('each mapping select is labelled Map <src>', chips.filter((c) => !c.fixed).every((c) => c.label === `Map ${c.src}`), chips.map((c) => [c.src, c.label]));
   ```

Then the dry run, on a scratch profile, every suite in the FOREGROUND with output captured to a file:

```
node tools/smoke/launch.mjs
node tools/smoke/smoke-parameters.mjs > tools/smoke/out/task6-parameters.txt 2>&1
node tools/smoke/smoke-workspace.mjs > tools/smoke/out/task6-workspace.txt 2>&1
```

Expected: `smoke-parameters.mjs` 33/33 (untouched surfaces); `smoke-workspace.mjs` 96/96 with Task 5's toast constants and this task's chip checks. Then drive the six manual checks below over CDP with a fixture of your own under `tools/smoke/out/task6-fixture/` (`pre-op/S001.png`, `pre-op/S002.png`, `post-op/S001.png`, `flexion/S003.png`, `S004_postop.png`, 1×1 PNGs as `smoke-workspace.mjs` writes them): seed `wsFolder`, `wsFiles` from `scanFolder` and `wsFolderRows` from `import('./renderer/data/seeding.js').folderRows(...)` through the page, mount the Workspace screen, read the table, change one row's select by setting `.value` and dispatching `change`, use the header `Set all…`, click Load, read the toast and the store. Record every outcome and a screenshot of the card in the task report. Quit with `node tools/smoke/cdp.mjs --quit`.

- [ ] **Step 6: Manual verification** (human gate; run the app from source)

1. Workspace → **Choose folder…** on a folder with at least two subfolders of films (a `pre-op`/`post-op` layout if one is to hand; any layout otherwise). Card 01 shows the folder table: one row per folder that directly holds films, the film count, TIMEPOINT read from a folder named `pre-op`/`post-op` (else `none`), VIEW `Standing lateral`.
2. Change one row's VIEW to `Extension lateral`, then press Tab: focus moves to the next control (not to the page body) and the row keeps the value.
3. Header **Set all…** under TIMEPOINT → `Post-op`: every row reads `Post-op`; the header select returns to `Set all…`. Set one row back to `none`.
4. If a CSV with `subject_id` or `timepoint` columns is to hand: **Choose CSV…** → those chips read `subject_id → Subject` / `timepoint → Timepoint` with no dropdown, `study_id → Join key`; the other chips keep their dropdowns. Otherwise: not checked by the human; the harness dry run covers it.
5. **Load workspace** → the toast carries the seeding clauses (`… read from folder or file names for N films`, `N films have no timepoint` if any). On the Find tab, films in the `Extension lateral` folder show VIEW `Extension lateral`; the others `Standing lateral`. Films already in the library keep their view.
6. DevTools console: no errors during 1–5.

- [ ] **Step 7: Commit** (body: `Manual verification: pending the human gate (six checks) — outcomes recorded here by amendment before Task 7 starts.` until the gate; then the six outcomes)

```bash
git add renderer/screens/workspace.js styles/screens/workspace.css tools/smoke/smoke-workspace.mjs
git commit -m "feat: the folder table on the Workspace card; fixed chips for the join key and structural columns

Manual verification: pending the human gate (six checks) — outcomes recorded here by amendment before Task 7 starts.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 7: The drawer's Study group, and Import from CSV carries the four fields

**Files:**
- Modify: `renderer/components/clinical-data.js` (imports; `importRowFor`; new `setStudyField`; `onImportFromCsv`; `buildGrid`; `rebuild`'s typed snapshot and restore)
- Modify: `styles/screens/analysis.css` (append)
- Modify: `test/clinical-data.test.js`
- Modify: `tools/smoke/smoke-workspace.mjs` (`drawerGrid`; four checks; two new checks)

**Interfaces:**
- Consumes: `findStructuralHeaders`, `structuralFromRow` (Task 4); `TIMEPOINT_SUGGESTIONS`, `VIEW_SUGGESTIONS`, `normaliseTimepoint` (Task 1); `joinClinical().rowByFile` (Task 4); the record fields (Task 3).
- Produces: `importRowFor(state, study) → {ok: true, values, fields, badDate} | {ok: false, reason, stem}` where `fields` holds only the structural values the row supplies; the DOM Task 10's suite selects on — `.clinical-grid-group`, `.clinical-cell[data-kind="study"][data-field="subjectId"|"timepoint"|"filmDate"|"view"]`, `datalist#clinical-timepoints`, `datalist#clinical-views`.

Pure part (`importRowFor`) is unit-tested; the DOM is the dry run, the human gate in step 7 and Task 10's suite.

- [ ] **Step 1: Write the failing tests**

In `test/clinical-data.test.js`:

1. In `'importRowFor returns the matched row for a scanned film whose stem is unique'`, change the expected object to `{ ok: true, values: { Age: '44' }, fields: {}, badDate: false }`.
2. In `'importRowFor falls back to the filename for a film with no path, and for one outside the scan'`, change both `{ ok: true, values: { Age: '44' } }` to `{ ok: true, values: { Age: '44' }, fields: {}, badDate: false }`.
3. Append:

```js
// The four study fields ride along with Import from CSV (user decision 2026-09-07): the drawer is
// the overwrite path, and one click re-syncs a corrected row instead of retyping four cells.
test('importRowFor carries the row\'s structural columns as fields, only where the row supplies one', () => {
  const headers = ['study_id', 'subject_id', 'timepoint', 'film_date', 'view', 'age_yrs'];
  const rows = [
    { study_id: 'SP002', subject_id: 'P-2', timepoint: 'postop', film_date: '9/14/2025', view: '', age_yrs: '44' },
    { study_id: 'SP003', subject_id: '', timepoint: '', film_date: '2025-02-30', view: 'flexion', age_yrs: '' },
  ];
  const mapping = [{ src: 'study_id', dest: null }, { src: 'subject_id', dest: null }, { src: 'timepoint', dest: null },
    { src: 'film_date', dest: null }, { src: 'view', dest: null }, { src: 'age_yrs', dest: 'Age' }];
  const state = csvState({ wsCsvHeaders: headers, wsCsvRows: rows, wsMapping: mapping });
  assert.deepEqual(importRowFor(state, study('SP002.png', 'C:\\batch1\\SP002.png')),
    { ok: true, values: { Age: '44' }, fields: { subjectId: 'P-2', timepoint: 'Post-op', filmDate: '2025-09-14' }, badDate: false });
  // Blank cells supply nothing; a rejected date is reported, never written.
  assert.deepEqual(importRowFor(state, study('SP003.png', 'C:\\batch1\\SP003.png')),
    { ok: true, values: {}, fields: { view: 'flexion' }, badDate: true });
});
```

- [ ] **Step 2: Run the suite to see it fail**

Run: `node --test test/clinical-data.test.js`
Expected: the three `ok: true` tests FAIL (no `fields`/`badDate` on the decision).

- [ ] **Step 3: `importRowFor` and `setStudyField`**

In `renderer/components/clinical-data.js`:

1. Change the two data imports to
   ```js
   import { KNOWN_FIELDS, joinClinical, fileStem, findStructuralHeaders, structuralFromRow } from '../data/csv.js';
   import { studyName } from '../data/labels.js';
   import { TIMEPOINT_SUGGESTIONS, VIEW_SUGGESTIONS, normaliseTimepoint } from '../data/timepoints.js';
   ```
2. Add after `const NO_CSV_TITLE = …;`:
   ```js
   // The Study group's four fixed columns (pre-op/post-op spec §9), ahead of the clinical fields:
   // top-level record fields, not clinical keys, so they cannot be hidden and never appear under
   // ADD FIELD. Timepoint and View suggest from a datalist (user decision 2026-09-07: native
   // suggestions, not chip buttons); Film date is a date input, whose value is already YYYY-MM-DD.
   const STUDY_COLUMNS = Object.freeze([
     { field: 'subjectId', head: 'SUBJECT', title: 'Subject', type: 'text', list: null },
     { field: 'timepoint', head: 'TIMEPOINT', title: 'Timepoint', type: 'text', list: 'clinical-timepoints' },
     { field: 'filmDate', head: 'FILM DATE', title: 'Film date', type: 'date', list: null },
     { field: 'view', head: 'VIEW', title: 'View', type: 'text', list: 'clinical-views' },
   ]);
   ```
3. In `importRowFor`, replace the last three lines (`const values = join.byFile.get(key);` through `return { ok: true, values };`) with:
   ```js
     const row = join.rowByFile.get(key);
     if (!row) return { ok: false, reason: 'no-row', stem };
     const values = join.byFile.get(key) ?? {};
     // The study fields the row supplies (spec §8.2), only where it supplies one: a blank CSV cell
     // never clears a stored value -- the rule the clinical values already follow.
     const structural = structuralFromRow(row, findStructuralHeaders(state.wsCsvHeaders));
     const fields = {};
     for (const name of ['subjectId', 'timepoint', 'filmDate', 'view']) {
       if (structural[name] !== null) fields[name] = structural[name];
     }
     return { ok: true, values, fields, badDate: structural.badDate };
   ```
   and change its doc comment's last line to `// → {ok: true, values, fields, badDate} | {ok: false, reason: 'no-csv'|'ambiguous'|'no-row', stem}`.
4. Add after `setValue`:
   ```js
     // The four study fields (spec §9) are top-level record fields, not clinical keys, with the same
     // one new-array write and the same pre-armed gate as setValue. Subject is stored trimmed. A
     // timepoint that names a known label is stored as that label (`preop` → Pre-op, `6 weeks` →
     // 6 wk) so a typed label pairs; anything else as typed. A date input's value is already
     // YYYY-MM-DD. An emptied cell stores null -- except view, which validateStudy requires to be
     // a string (it throws on anything else and would refuse the whole store at the next launch),
     // so it stores '' and renders as an em dash.
     function setStudyField(studyId, field, value) {
       const text = String(value ?? '').trim();
       let next;
       if (field === 'view') next = text;
       else if (field === 'timepoint') next = text === '' ? null : (normaliseTimepoint(text) ?? text);
       else next = text === '' ? null : text;
       setState((s) => {
         const studies = s.studies.map((study) => (study.id === studyId ? { ...study, [field]: next } : study));
         if (lastKey !== null) lastKey = [studies, ...lastKey.slice(1)];
         return { studies };
       });
     }
   ```
5. In `onImportFromCsv`, replace from `const fromCsv = decision.values;` to the end of the function with:
   ```js
       const fromCsv = decision.values;
       const fields = decision.fields;
       // A matched row whose mapped cells are all empty imports zero fields; the toast says 0
       // rather than claiming no row matched. The study fields it carried are counted apart.
       const keys = Object.keys(fromCsv);
       const fieldKeys = Object.keys(fields);
       setState((s) => ({
         studies: s.studies.map((x) => (x.id === study.id
           ? { ...x, ...fields, clinical: { ...x.clinical, ...fromCsv } }
           : x)),
         fields: [...s.fields, ...keys.filter((key) => !s.fields.includes(key))],
         dataOpen: true,
       }));
       refresh();
       showToast(`Imported ${keys.length} field${keys.length === 1 ? '' : 's'}`
         + (fieldKeys.length > 0 ? ` and ${fieldKeys.length} study detail${fieldKeys.length === 1 ? '' : 's'}` : '')
         + ' from CSV'
         + (decision.badDate ? ' · the film date could not be read' : ''));
     }
   ```

- [ ] **Step 4: Run the suite to see it pass**

Run: `node --test test/clinical-data.test.js` — Expected: all pass. Then `node --test test/*.test.js` — Expected: 365/365.

- [ ] **Step 5: The grid**

Replace the whole `buildGrid` function with:

```js
  function studyCell(study, column, isDemo) {
    const value = study[column.field];
    const input = el('input', {
      type: column.type,
      class: `clinical-cell clinical-cell-study${column.type === 'date' ? ' clinical-cell-date' : ''}`,
      value: value != null ? String(value) : '',
      // A date input draws its own empty mask; a placeholder there is ignored.
      placeholder: column.type === 'date' ? undefined : '—',
      'aria-label': `${studyName(study)} ${column.title}`,
      'data-focus-key': `study:${study.id}:${column.field}`,
      'data-study-id': study.id,
      'data-field': column.field,
      // How rebuild() tells this cell from a clinical cell whose field happens to be called `view`.
      'data-kind': 'study',
      disabled: isDemo,
      title: isDemo ? DEMO_TITLE : undefined,
      // Deferred one microtask for the same reason as the clinical cells: `change` also fires on
      // REMOVAL of an edited cell, inside a store notification, where setState throws.
      onChange: (event) => {
        const next = event.target.value;
        queueMicrotask(() => setStudyField(study.id, column.field, next));
      },
    });
    // `list` is a read-only accessor on HTMLInputElement (it returns the datalist node), so el()
    // must not receive it as a prop -- the assignment throws in strict mode. An attribute it is.
    if (column.list) input.setAttribute('list', column.list);
    return input;
  }

  function buildGrid(state, studies) {
    const fields = state.fields;
    // The group row: a blank over the name column, STUDY over the four fixed columns, CLINICAL
    // DATA over the fields (absent when there are none). Not a .clinical-grid-head row: the smoke
    // suite reads the head cells by that class and the data rows by its absence.
    const group = el('div', { class: 'clinical-grid-row clinical-grid-group' },
      el('div', { class: 'clinical-grid-cell' }),
      el('div', { class: 'clinical-grid-cell clinical-grid-group-study' }, 'STUDY'),
      fields.length > 0 ? el('div', { class: 'clinical-grid-cell clinical-grid-group-clinical' }, 'CLINICAL DATA') : null);

    const head = el('div', { class: 'clinical-grid-row clinical-grid-head' },
      el('div', { class: 'clinical-grid-cell' }, 'STUDY'),
      // No Hide button: the four are not fields and cannot leave the grid.
      ...STUDY_COLUMNS.map((column) => el('div', { class: 'clinical-grid-cell clinical-grid-head-study' }, el('span', {}, column.head))),
      ...fields.map((name) => el('div', { class: 'clinical-grid-cell' },
        el('span', {}, name.toUpperCase()),
        el('button', {
          type: 'button',
          class: 'clinical-remove',
          'aria-label': `Hide ${name}`,
          title: 'Hide field — values are kept',
          'data-focus-key': `remove:${name}`,
          onClick: () => removeField(name),
        }, '×'))));

    const rows = studies.map((study) => {
      // Demo records are never written (the saver filters them), so an edit would silently
      // vanish at the next launch. Say so instead of accepting it.
      const isDemo = study.source === 'demo';
      return el('div', { class: 'clinical-grid-row' },
        // The visible label is the study's name; every `data-` attribute below stays keyed on
        // the id, which is what the focus-restore machinery looks the row back up by.
        el('div', { class: 'clinical-grid-cell clinical-grid-id', title: study.id }, studyName(study)),
        ...STUDY_COLUMNS.map((column) => studyCell(study, column, isDemo)),
        ...fields.map((name) => el('input', {
          type: 'text',
          class: 'clinical-cell',
          // A present value renders as itself -- String() keeps a numeric 0 from a hand-edited
          // store visible; only null/undefined is absent, and absent shows the placeholder.
          value: study.clinical?.[name] != null ? String(study.clinical[name]) : '',
          placeholder: '—',
          'aria-label': `${studyName(study)} ${name}`,
          'data-focus-key': `cell:${study.id}:${name}`,
          // The cell's identity, readable back off the node after a rebuild replaced it.
          // Both go through setAttribute (they are not node properties), which is why they
          // are written as attribute names and not as a forbidden `dataset` prop.
          'data-study-id': study.id,
          'data-field': name,
          'data-kind': 'clinical',
          disabled: isDemo,
          title: isDemo ? DEMO_TITLE : undefined,
          // Chromium fires `change` SYNCHRONOUSLY when a rebuild's clear(host) removes a
          // focused, edited cell -- i.e. inside a store notification, where setState throws
          // (store.js's re-entrancy guard) and the throw is swallowed by the subscriber
          // try/catch, leaving a console exception and an uncommitted edit. Defer the commit
          // past the notification, the same mechanism the restore's blur listener uses.
          // event.target.value is captured BEFORE queuing: the node may be detached by the
          // time the microtask runs, but the captured string is what the user typed. In the
          // ordinary Tab/click case the microtask runs right after the `change` dispatch and
          // before `blur`, so setValue's pre-arm still keeps the component's own commit from
          // rebuilding, and the restored cell's blur listener later sees equal values and skips.
          onChange: (event) => {
            const value = event.target.value;
            queueMicrotask(() => setValue(study.id, name, value));
          },
        })));
    });

    const grid = el('div', { class: 'clinical-grid' }, group, head, ...rows);
    // A CSS custom property set AFTER construction. `style` must never be an el() prop: the
    // `key in node` branch would assign to the read-only CSSStyleDeclaration and throw.
    // repeat(0, …) is invalid CSS and would drop the whole declaration, hence the conditional.
    grid.style.setProperty('--clinical-cols',
      `110px repeat(4, minmax(130px, 1fr))${fields.length > 0 ? ` repeat(${fields.length}, minmax(150px, 1fr))` : ''}`);
    // The two datalists the Timepoint and View cells suggest from. Ids are document-wide; the
    // drawer is mounted once per Analysis screen and rebuilt whole, so one pair per rebuild.
    const lists = [
      el('datalist', { id: 'clinical-timepoints' }, ...TIMEPOINT_SUGGESTIONS.map((label) => el('option', { value: label }))),
      el('datalist', { id: 'clinical-views' }, ...VIEW_SUGGESTIONS.map((label) => el('option', { value: label }))),
    ];
    // With no clinical field the grid still shows the Study group; the empty state sits below it.
    return [grid, ...lists, fields.length === 0 ? el('div', { class: 'clinical-empty' }, EMPTY_COPY) : null];
  }
```

(`el()` flattens the returned array and skips `null`, so the `host.append(el('div', { class: 'clinical-body' }, buildChipRow(state), buildGrid(state, studies)))` call in `rebuild` needs no change.)

- [ ] **Step 6: The typed-value snapshot and restore**

In `rebuild`:

1. Change the first `typed = {` block (the `.clinical-cell` branch) to
   ```js
       typed = {
         kind: active.getAttribute('data-kind') === 'study' ? 'study' : 'clinical',
         studyId: active.getAttribute('data-study-id'),
         field: active.getAttribute('data-field'),
         value: active.value,
         // A date cell reports null for both (no text selection); the restore below skips the caret.
         selectionStart: active.selectionStart,
         selectionEnd: active.selectionEnd,
       };
   ```
2. In the restore, change the `for (const candidate of host.querySelectorAll('.clinical-cell')) {` loop's condition to
   ```js
           if (candidate.getAttribute('data-study-id') === typed.studyId
             && candidate.getAttribute('data-field') === typed.field
             && candidate.getAttribute('data-kind') === typed.kind) { field = candidate; break; }
   ```
3. Replace the blur listener's `queueMicrotask` body with
   ```js
               queueMicrotask(() => {
                 const s = getState();
                 const record = s.studies.find((x) => x.id === typed.studyId);
                 const stored = typed.kind === 'study' ? (record?.[typed.field] ?? '') : (record?.clinical?.[typed.field] ?? '');
                 if (field.value !== stored) {
                   if (typed.kind === 'study') setStudyField(typed.studyId, typed.field, field.value);
                   else setValue(typed.studyId, typed.field, field.value);
                 }
               });
   ```
4. Change the comment line `// Both controls are type="text", so setSelectionRange is supported; a null selection` to `// Text controls carry a caret; a date cell reports a null selection and is skipped here, and`.

- [ ] **Step 7: Styles**

Append to `styles/screens/analysis.css`:

```css
/* The Study group (pre-op/post-op spec §9): four fixed columns ahead of the clinical fields, under
   a group row. The group row spans with grid-column; the head and data rows keep one cell per
   column, so --clinical-cols stays one template for the whole grid. */
.clinical-grid-group { background: var(--well); }
.clinical-grid-group .clinical-grid-cell {
  padding: 6px 12px 4px;
  font-family: 'Chivo Mono', monospace;
  font-size: 8.5px;
  font-weight: 500;
  letter-spacing: 0.16em;
  color: var(--muted);
}
.clinical-grid-group-study { grid-column: 2 / span 4; }
.clinical-grid-group-clinical { grid-column: 6 / -1; }
.clinical-grid-head-study { background: color-mix(in srgb, var(--sage) 6%, var(--well)); }
.clinical-cell-study { background: color-mix(in srgb, var(--sage) 4%, transparent); }
.clinical-cell-date {
  font-family: 'Chivo Mono', monospace;
  font-size: 12px;
  letter-spacing: 0.04em;
}
.clinical-cell-date::-webkit-calendar-picker-indicator { opacity: 0.55; cursor: pointer; }
```

- [ ] **Step 8: The workspace smoke suite, and the dry run**

In `tools/smoke/smoke-workspace.mjs`:

1. Add after `const KNOWN_FIELDS = […];`:
   ```js
   // The drawer's head row since 2026-09-07 (pre-op/post-op spec §9): the Study group's four fixed
   // columns sit between STUDY and the clinical fields.
   const STUDY_HEADS = ['STUDY', 'SUBJECT', 'TIMEPOINT', 'FILM DATE', 'VIEW'];
   ```
2. In `drawerGrid`, change the rows filter to `.filter((r) => !r.classList.contains('clinical-grid-head') && !r.classList.contains('clinical-grid-group'))`.
3. Replace the check `'the columns are AGE, SEX and TREATMENT PLAN, holding the values the load linked'` with
   ```js
     check('the head row is the Study group then AGE, SEX and TREATMENT PLAN, holding the values the load linked',
       loadedGrid && same(loadedGrid.heads.slice(0, 5), STUDY_HEADS) && same([...loadedGrid.heads.slice(5)].sort(), ['AGE', 'SEX', 'TREATMENT PLAN'])
       && loadedGrid.rows.length === 1 && loadedGrid.rows[0].id === 'a'
       && loadedCells.AGE?.value === '58' && loadedCells.SEX?.value === 'F' && loadedCells['TREATMENT PLAN']?.value === 'Fusion', { heads: loadedGrid?.heads, loadedCells });
     check('the Study group cells hold the seeded subject and view, and an empty timepoint and film date',
       loadedCells.SUBJECT?.value === 'a' && loadedCells.TIMEPOINT?.value === '' && loadedCells['FILM DATE']?.value === '' && loadedCells.VIEW?.value === 'Standing lateral'
       && [loadedCells.SUBJECT, loadedCells.TIMEPOINT, loadedCells['FILM DATE'], loadedCells.VIEW].every((c) => c && c.disabled === false),
       { SUBJECT: loadedCells.SUBJECT, TIMEPOINT: loadedCells.TIMEPOINT, FILM: loadedCells['FILM DATE'], VIEW: loadedCells.VIEW });
   ```
4. Replace the check `'the head row is STUDY then the three fields, each with a Hide button'` with
   ```js
     check('the head row is the Study group then the three fields, each field with a Hide button',
       grid && same(grid.heads.slice(0, 5), STUDY_HEADS) && same([...grid.heads.slice(5)].sort(), ['AGE', 'SEX', 'TREATMENT PLAN']) && same([...grid.removeLabels].sort(), ['Hide Age', 'Hide Sex', 'Hide Treatment plan']), { heads: grid?.heads, removeLabels: grid?.removeLabels });
   ```
5. Change the check `'--clinical-cols is set for three fields'` to expect `'110px repeat(4, minmax(130px, 1fr)) repeat(3, minmax(150px, 1fr))'`.
6. After the `'the cell still shows the typed note after the commit'` check, add a typed timepoint:
   ```js
     // 9b. The Study group's Timepoint cell: type a token, leave it, and the record holds the
     // normalised label (`postop` → Post-op), so a typed timepoint pairs.
     const timepointCellRect = await rectBy("() => document.querySelector('.clinical-cell[data-kind=\"study\"][data-field=\"timepoint\"]')");
     check('the TIMEPOINT cell has layout and suggests from the datalist', Boolean(timepointCellRect)
       && (await cdp.evaluate("(() => { const e = document.querySelector('.clinical-cell[data-kind=\"study\"][data-field=\"timepoint\"]'); return e?.getAttribute('list') === 'clinical-timepoints' && [...document.querySelectorAll('#clinical-timepoints option')].map((o) => o.value).join('|'); })()")) === 'Pre-op|Intra-op|Post-op|6 wk|1 yr|2 yr', timepointCellRect);
     await cdp.click(timepointCellRect.cx, timepointCellRect.cy);
     await cdp.typeText('postop');
     await cdp.key('Tab');
     const timepointCommitted = await waitForState(`(s.studies.find((x) => x.id === ${JSON.stringify(ID_A)}) || {}).timepoint === 'Post-op'`, 3000);
     s = await cdp.state();
     check('leaving the TIMEPOINT cell writes the normalised label on the record', timepointCommitted === true && s.studies.find((x) => x.id === ID_A)?.timepoint === 'Post-op', s.studies.find((x) => x.id === ID_A)?.timepoint);
     grid = await drawerGrid();
     cells = cellsByField(grid);
     check('the TIMEPOINT cell shows the label after the commit', cells.TIMEPOINT?.value === 'Post-op', cells.TIMEPOINT);
   ```
7. In the demo-drawer check, change `demoDrawer.cells.length === 4` to `demoDrawer.cells.length === 8` and its name to `'a demo study mounts the drawer with every cell (four study, four clinical) disabled and titled Demo studies are not saved'`.

Then the dry run on a scratch profile, FOREGROUND, captured to files:

```
node tools/smoke/launch.mjs
node tools/smoke/smoke-parameters.mjs > tools/smoke/out/task7-parameters.txt 2>&1
node tools/smoke/smoke-workspace.mjs > tools/smoke/out/task7-workspace.txt 2>&1
```

Expected: `smoke-parameters.mjs` 33/33; `smoke-workspace.mjs` 100/100 (96 + 1 new after the load + 3 new typing checks). Then drive the eight checks below over CDP where the harness can reach them (the date picker's popup and the datalist's popup are the human's; set a date by assigning `.value` and dispatching `change`, and read back the record). Record every outcome and a screenshot of the drawer. Quit with `node tools/smoke/cdp.mjs --quit`.

- [ ] **Step 9: Manual verification** (human gate; run the app from source)

1. Open a real study. The drawer's grid starts with a group row (`STUDY` over four columns, `CLINICAL DATA` over the rest) and the cells SUBJECT, TIMEPOINT, FILM DATE, VIEW before the clinical columns. With no clinical field the Study group still shows and the "No clinical fields yet" note sits below the grid.
2. Type a subject, press Tab: the value stays; open another study and come back: it is still there. (A restart is optional; the saver persists every `studies` change.)
3. Click the TIMEPOINT cell: the six suggestions drop down; pick `Post-op`. Then type `preop` over it and press Tab: the cell reads `Pre-op`.
4. FILM DATE: pick a date with the picker; the cell shows it; clear it (Backspace on each segment, or the picker's Clear) and Tab: the cell is empty and the Parameters grid (Task 9) will show `—`.
5. VIEW: pick `Flexion lateral` from the list. The Find tab's VIEW column shows `Flexion lateral` for that study.
6. If a CSV with `subject_id`/`timepoint`/`film_date`/`view` columns is loaded in the Workspace: **Import from CSV** → toast `Imported N fields and M study details from CSV` and the four cells update. Otherwise: not checked by the human; the unit test and the harness stand in.
7. Open a demo study: the four study cells are disabled and titled `Demo studies are not saved`, like the clinical cells.
8. DevTools console: no errors during 1–7.

- [ ] **Step 10: Commit** (body: `Manual verification: pending the human gate (eight checks) — outcomes recorded here by amendment before Task 8 starts.` until the gate; then the eight outcomes)

```bash
git add renderer/components/clinical-data.js styles/screens/analysis.css test/clinical-data.test.js tools/smoke/smoke-workspace.mjs
git commit -m "feat: the drawer's Study group — subject, timepoint, film date and view cells; Import from CSV carries them

Manual verification: pending the human gate (eight checks) — outcomes recorded here by amendment before Task 8 starts.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `renderer/data/parameters.js` — the four filters, the subject sort, the blocks

**Files:**
- Modify: `renderer/data/parameters.js`
- Modify: `renderer/store.js` (`paramFilters`)
- Modify: `test/parameters.test.js`, `test/store.test.js`
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` (State shape: `paramFilters`)

**Interfaces:**
- Consumes: `compareTimepoints`, `PRE_OP`, `POST_OP` (Task 1); the record fields (Task 3).
- Produces: `NO_TIMEPOINT` (`'__none__'`); `DEFAULT_FILTERS` gains `timepoint: null, view: null, subject: '', pairedOnly: false, pairedWith: 'Post-op'`; `subjectKey(study)`, `timepointOptions(studies)`, `viewOptions(studies)`, `pairedWithOptions(studies)`, `pairedSubjects(studies, post)`, `hiddenUnpaired(studies, filters)`, `subjectBreaks(visible, sort) → boolean[]`; `filterParameters` honours the four filters; `sortParameters` accepts `key: 'subject'`; `normaliseFilters` clears a stale timepoint or view; `emptyReason` reports `'filtered'` for any of them. Task 9 consumes these names exactly.

- [ ] **Step 1: Write the failing tests**

In `test/parameters.test.js`:

1. Change the import to
   ```js
   import {
     HAND_ADDED, NO_TIMEPOINT, DEFAULT_FILTERS, DEFAULT_SORT, CORE_COLUMNS, LEVEL_COLUMNS, measurementColumns,
     parameterValues, formatParameter, isSegmented, workspaceOptions, folderOptions, normaliseFilters,
     patchFilters, filterParameters, hiddenUnsegmented, sortParameters, emptyReason, exportFileName,
     toggleId, withIds, selectedVisible, rowsToExport,
     subjectKey, timepointOptions, viewOptions, pairedWithOptions, pairedSubjects, hiddenUnpaired, subjectBreaks,
   } from '../renderer/data/parameters.js';
   ```
2. In the `study` helper, add `subjectId: null, timepoint: null, filmDate: null,` after `workspaceFolder: ROOT,`.
3. Every literal filter object a test compares a result against now needs the defaults spread in, because `normaliseFilters` and `patchFilters` return every key. Change:
   - `'normaliseFilters clears a workspace…'`, third assertion's expected value to `{ ...DEFAULT_FILTERS, workspace: ROOT, folder: 'pre-op', segmentedOnly: false }`;
   - `'patchFilters merges a folder pick over a STALE stored workspace…'`, expected to `{ ...DEFAULT_FILTERS, workspace: null, folder: 'pre-op', segmentedOnly: true }`;
   - `'patchFilters lets a workspace patch win…'`, second expected to `{ ...DEFAULT_FILTERS, workspace: ROOT, folder: null, segmentedOnly: false }`.
4. Append:

```js
// ---------------------------------------------------------------------------
// task 2: subject, timepoint, view, paired-only (spec §10.3)

const S = (id, subjectId, timepoint, extra = {}) => study({
  id, subjectId, timepoint, fileName: `${id}.png`, filePath: `${ROOT}\\${id}.png`,
  measurements: measurements(50, 10, 40, 45), ...extra,
});
const COHORT = [
  S('SP-1000', 'S001', 'Pre-op', { filmDate: '2025-03-02', addedAt: '2026-09-01T00:00:00.000Z' }),
  S('SP-1001', 'S001', 'Post-op', { filmDate: '2025-09-14', addedAt: '2026-09-02T00:00:00.000Z' }),
  S('SP-1002', 's002', 'Pre-op', { view: 'Flexion lateral' }),
  S('SP-1003', 'S002', '1 yr'),
  S('SP-1004', null, null, { measurements: null }),
  S('SP-1005', 'S003', 'Pre-op', { workspaceFolder: null, filePath: 'C:\\loose\\SP-1005.png' }),
  S('SP-1006', 'S003', 'Post-op', { workspaceFolder: null, filePath: 'C:\\loose\\SP-1006.png' }),
  S('SP-1007', null, 'baseline', { view: '' }),
];

test('DEFAULT_FILTERS carries the four new filters at rest', () => {
  assert.deepEqual(DEFAULT_FILTERS, {
    workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, subject: '', pairedOnly: false, pairedWith: 'Post-op',
  });
  assert.equal(NO_TIMEPOINT, '__none__');
});

test('subjectKey is the trimmed lower-cased subject, or null', () => {
  assert.equal(subjectKey(study({ subjectId: ' S001 ' })), 's001');
  assert.equal(subjectKey(study({ subjectId: null })), null);
  assert.equal(subjectKey(study({ subjectId: '   ' })), null);
});

test('timepointOptions lists the labels present in §7.2 order, then No timepoint when any study lacks one', () => {
  assert.deepEqual(timepointOptions(COHORT), [
    { value: 'Pre-op', label: 'Pre-op' }, { value: 'Post-op', label: 'Post-op' }, { value: '1 yr', label: '1 yr' },
    { value: 'baseline', label: 'baseline' }, { value: NO_TIMEPOINT, label: 'No timepoint' },
  ]);
  assert.deepEqual(timepointOptions(COHORT.slice(0, 2)), [{ value: 'Pre-op', label: 'Pre-op' }, { value: 'Post-op', label: 'Post-op' }]);
  assert.deepEqual(timepointOptions([]), []);
});

test('viewOptions lists the distinct views present, first seen first, skipping a cleared view', () => {
  assert.deepEqual(viewOptions(COHORT), [{ value: 'Standing lateral', label: 'Standing lateral' }, { value: 'Flexion lateral', label: 'Flexion lateral' }]);
});

test('pairedWithOptions always offers Post-op, then every other non-Pre-op label present, in §7.2 order', () => {
  assert.deepEqual(pairedWithOptions([]), [{ value: 'Post-op', label: 'Post-op' }]);
  assert.deepEqual(pairedWithOptions(COHORT).map((o) => o.value), ['Post-op', '1 yr', 'baseline']);
});

test('pairedSubjects is the set of subject keys with a Pre-op film and a film with the chosen label', () => {
  assert.deepEqual([...pairedSubjects(COHORT, 'Post-op')].sort(), ['s001', 's003']);
  assert.deepEqual([...pairedSubjects(COHORT, '1 yr')], ['s002']);
  assert.deepEqual([...pairedSubjects(COHORT, 'baseline')], []);
  // Subject keys compare case-insensitively: s002's Pre-op pairs with S002's 1 yr.
});

test('filterParameters narrows by timepoint, by No timepoint, by view and by subject substring', () => {
  const ids = (filters) => filterParameters(COHORT, filters).map((s) => s.id);
  assert.deepEqual(ids({ timepoint: 'Pre-op' }), ['SP-1000', 'SP-1002', 'SP-1005']);
  assert.deepEqual(ids({ timepoint: NO_TIMEPOINT, segmentedOnly: false }), ['SP-1004']);
  assert.deepEqual(ids({ view: 'Flexion lateral' }), ['SP-1002']);
  assert.deepEqual(ids({ subject: 's00' }), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003', 'SP-1005', 'SP-1006']);
  assert.deepEqual(ids({ subject: '  S002 ' }), ['SP-1002', 'SP-1003']);
  assert.deepEqual(ids({ subject: '' }), ids({}));
  // Composes with AND, and with the workspace filter.
  assert.deepEqual(ids({ workspace: ROOT, timepoint: 'Pre-op', subject: '2' }), ['SP-1002']);
});

test('filterParameters paired-only keeps paired subjects within the other filters, before the timepoint filter', () => {
  const ids = (filters) => filterParameters(COHORT, filters).map((s) => s.id);
  assert.deepEqual(ids({ pairedOnly: true }), ['SP-1000', 'SP-1001', 'SP-1005', 'SP-1006']);
  assert.deepEqual(ids({ pairedOnly: true, pairedWith: '1 yr' }), ['SP-1002', 'SP-1003']);
  // Within a workspace: S003's pair is hand-added and drops out with the workspace filter.
  assert.deepEqual(ids({ pairedOnly: true, workspace: ROOT }), ['SP-1000', 'SP-1001']);
  // Paired only + Pre-op is "the pre-op films of paired subjects", not nothing.
  assert.deepEqual(ids({ pairedOnly: true, timepoint: 'Pre-op' }), ['SP-1000', 'SP-1005']);
  // A missing pairedWith means Post-op.
  assert.deepEqual(ids({ pairedOnly: true, pairedWith: null }), ['SP-1000', 'SP-1001', 'SP-1005', 'SP-1006']);
});

test('hiddenUnpaired counts the rows the paired-only step removes, ignoring the timepoint filter', () => {
  assert.equal(hiddenUnpaired(COHORT, { pairedOnly: false }), 0);
  // Seven segmented rows; four are paired under Post-op.
  assert.equal(hiddenUnpaired(COHORT, { pairedOnly: true }), 3);
  assert.equal(hiddenUnpaired(COHORT, { pairedOnly: true, timepoint: 'Pre-op' }), 3);
  assert.equal(hiddenUnpaired(COHORT, { pairedOnly: true, pairedWith: '1 yr' }), 5);
});

test('normaliseFilters clears a timepoint or view no study carries any more', () => {
  assert.deepEqual(normaliseFilters({ timepoint: '6 wk', view: 'Prone lateral' }, COHORT), { ...DEFAULT_FILTERS });
  assert.deepEqual(normaliseFilters({ timepoint: 'Pre-op', view: 'Flexion lateral', subject: 'x', pairedOnly: true, pairedWith: '1 yr' }, COHORT),
    { ...DEFAULT_FILTERS, timepoint: 'Pre-op', view: 'Flexion lateral', subject: 'x', pairedOnly: true, pairedWith: '1 yr' });
  assert.deepEqual(normaliseFilters({ timepoint: NO_TIMEPOINT }, COHORT), { ...DEFAULT_FILTERS, timepoint: NO_TIMEPOINT });
  assert.deepEqual(normaliseFilters({ timepoint: NO_TIMEPOINT }, COHORT.slice(0, 2)), { ...DEFAULT_FILTERS });
});

test('sortParameters by subject groups films by subject with no subject last in both directions, and Pre-op first inside a block', () => {
  const ids = (dir) => sortParameters(COHORT, { key: 'subject', dir }).map((s) => s.id);
  // s001 < s002 < s003, then the two with no subject in timepoint order (a label before none);
  // inside S001 Pre-op precedes Post-op, inside S002 Pre-op precedes 1 yr.
  assert.deepEqual(ids('asc'), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003', 'SP-1005', 'SP-1006', 'SP-1007', 'SP-1004']);
  // Descending reverses the subject order only: a block still reads Pre-op first, no subject still last.
  assert.deepEqual(ids('desc'), ['SP-1005', 'SP-1006', 'SP-1002', 'SP-1003', 'SP-1000', 'SP-1001', 'SP-1007', 'SP-1004']);
  // Same timepoint: film date, then addedAt, break the tie.
  const twins = [
    S('SP-2000', 'T', 'Post-op', { filmDate: null, addedAt: '2026-09-03T00:00:00.000Z' }),
    S('SP-2001', 'T', 'Post-op', { filmDate: '2025-05-01', addedAt: '2026-09-04T00:00:00.000Z' }),
    S('SP-2002', 'T', 'Post-op', { filmDate: '2025-04-01', addedAt: '2026-09-05T00:00:00.000Z' }),
    S('SP-2003', 'T', 'Post-op', { filmDate: null, addedAt: '2026-09-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(sortParameters(twins, { key: 'subject', dir: 'asc' }).map((s) => s.id), ['SP-2002', 'SP-2001', 'SP-2003', 'SP-2000']);
});

test('subjectBreaks marks the first row of each new subject under the subject sort, and nothing otherwise', () => {
  const sorted = sortParameters(COHORT, { key: 'subject', dir: 'asc' });
  assert.deepEqual(subjectBreaks(sorted, { key: 'subject', dir: 'asc' }), [false, false, true, false, true, false, true, false]);
  assert.deepEqual(subjectBreaks(sorted, { key: 'study', dir: 'asc' }), sorted.map(() => false));
  assert.deepEqual(subjectBreaks([], { key: 'subject', dir: 'asc' }), []);
});

test('emptyReason blames a timepoint, view, subject or paired-only filter the user set', () => {
  assert.equal(emptyReason({ total: 2, visible: 0, filters: { timepoint: 'Pre-op' }, query: '' }), 'filtered');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: { view: 'Prone lateral' }, query: '' }), 'filtered');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: { subject: 'S0' }, query: '' }), 'filtered');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: { pairedOnly: true }, query: '' }), 'filtered');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: { subject: '   ' }, query: '' }), 'unsegmented');
});
```

In `test/store.test.js`, change the `paramFilters` assertion to
```js
  assert.deepEqual(state.paramFilters, {
    workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, subject: '', pairedOnly: false, pairedWith: 'Post-op',
  });
```

- [ ] **Step 2: Run the two suites to see the new tests fail**

Run: `node --test test/parameters.test.js test/store.test.js`
Expected: FAIL at import (`NO_TIMEPOINT` is not exported); the store test FAILS on `paramFilters`.

- [ ] **Step 3: The store key and the contract**

In `renderer/store.js`, change the `paramFilters` line to
```js
  paramFilters: { workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, subject: '', pairedOnly: false, pairedWith: 'Post-op' },
```
and in the contract's State shape change the `paramFilters:` line and its continuation to
```
  paramFilters: { workspace: null, folder: null, segmentedOnly: true,       // data/parameters.js DEFAULT_FILTERS;
                  timepoint: null, view: null, subject: '', pairedOnly: false, pairedWith: 'Post-op' },   // (2026-09-07, spec §10.3)
                            // `workspace` is a stored root, HAND_ADDED ('__hand__') or null; `timepoint` a label, NO_TIMEPOINT ('__none__') or null
```

- [ ] **Step 4: Implement**

In `renderer/data/parameters.js`:

1. Add after the `labels.js` import:
   ```js
   import { compareTimepoints, PRE_OP, POST_OP } from './timepoints.js';
   ```
2. Replace `export const DEFAULT_FILTERS = …;` with
   ```js
   // The timepoint filter's value for "this film has no timepoint" (spec §10.3) -- the HAND_ADDED
   // pattern: a sentinel, because null means "no timepoint filter".
   export const NO_TIMEPOINT = '__none__';

   export const DEFAULT_FILTERS = Object.freeze({
     workspace: null, folder: null, segmentedOnly: true,
     timepoint: null, view: null, subject: '', pairedOnly: false, pairedWith: POST_OP,
   });
   ```
3. Add after `folderOptions`:
   ```js
   // Subjects compare case-insensitively after trimming (spec §7.1), as the stem join does.
   export function subjectKey(study) {
     const subject = study?.subjectId;
     if (typeof subject !== 'string') return null;
     const key = subject.trim().toLowerCase();
     return key === '' ? null : key;
   }

   function timepointOf(study) {
     const label = study?.timepoint;
     return typeof label === 'string' && label.trim() !== '' ? label : null;
   }

   // Timepoint labels present, in §7.2 order, then `No timepoint` when any study lacks one.
   export function timepointOptions(studies) {
     const labels = [];
     let missing = false;
     for (const study of studies) {
       const label = timepointOf(study);
       if (label === null) { missing = true; continue; }
       if (!labels.includes(label)) labels.push(label);
     }
     labels.sort(compareTimepoints);
     const options = labels.map((value) => ({ value, label: value }));
     if (missing) options.push({ value: NO_TIMEPOINT, label: 'No timepoint' });
     return options;
   }

   // Views present, first seen first. A cleared view ('') is not an option: the column shows a dash.
   export function viewOptions(studies) {
     const seen = [];
     for (const study of studies) {
       const view = study?.view;
       if (typeof view === 'string' && view.trim() !== '' && !seen.includes(view)) seen.push(view);
     }
     return seen.map((value) => ({ value, label: value }));
   }

   // The post side of a pair: every label present other than Pre-op, in §7.2 order, with Post-op
   // always offered -- it is the default, and the control must show it before any study carries it.
   export function pairedWithOptions(studies) {
     const labels = [POST_OP];
     for (const study of studies) {
       const label = timepointOf(study);
       if (label !== null && label !== PRE_OP && !labels.includes(label)) labels.push(label);
     }
     labels.sort(compareTimepoints);
     return labels.map((value) => ({ value, label: value }));
   }

   // Subject keys with at least one Pre-op film and at least one film labelled `post` among
   // `studies`. A film with no subject pairs with nothing.
   export function pairedSubjects(studies, post) {
     const pre = new Set();
     const after = new Set();
     for (const study of studies) {
       const key = subjectKey(study);
       if (key === null) continue;
       const label = timepointOf(study);
       if (label === PRE_OP) pre.add(key);
       if (label === post) after.add(key);
     }
     return new Set([...pre].filter((key) => after.has(key)));
   }

   function matchesTimepoint(study, timepoint) {
     if (!timepoint) return true;
     const label = timepointOf(study);
     return timepoint === NO_TIMEPOINT ? label === null : label === timepoint;
   }

   function matchesSubject(study, needle) {
     const query = String(needle ?? '').trim().toLowerCase();
     if (query === '') return true;
     const key = subjectKey(study);
     return key !== null && key.includes(query);
   }
   ```
4. Replace `normaliseFilters` with
   ```js
   // A stored filter can name a root, folder, timepoint or view that no study carries any more
   // (the studies were deleted or relabelled). Clear it for rendering and filtering rather than
   // applying a filter the dropdown cannot show. Pure: the stale store value is harmless and is
   // not rewritten here.
   export function normaliseFilters(filters, studies) {
     let f = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
     if (f.workspace && !workspaceOptions(studies).some((o) => o.value === f.workspace)) f = { ...f, workspace: null, folder: null };
     if (f.folder && !folderOptions(studies, f.workspace).some((o) => o.value === f.folder)) f = { ...f, folder: null };
     if (f.timepoint && !timepointOptions(studies).some((o) => o.value === f.timepoint)) f = { ...f, timepoint: null };
     if (f.view && !viewOptions(studies).some((o) => o.value === f.view)) f = { ...f, view: null };
     return f;
   }
   ```
5. Replace `filterParameters` with
   ```js
   // Every filter but one composes with AND per study. Paired-only is evaluated over the studies
   // the other filters keep -- so a workspace filter pairs within that workspace -- and BEFORE the
   // timepoint filter, so `Paired only` with `Pre-op` reads as the pre-op films of paired subjects
   // rather than as nothing (planning ruling, 2026-09-07).
   export function filterParameters(studies, filters) {
     const f = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
     const kept = studies.filter((study) => matchesWorkspace(study, f.workspace)
       && (!f.folder || folderLabel(study) === f.folder)
       && (!f.segmentedOnly || isSegmented(study))
       && (!f.view || study.view === f.view)
       && matchesSubject(study, f.subject));
     const paired = f.pairedOnly ? pairedSubjects(kept, f.pairedWith || POST_OP) : null;
     return kept.filter((study) => (paired === null || paired.has(subjectKey(study)))
       && matchesTimepoint(study, f.timepoint));
   }

   // How many rows the paired-only step removes, before the timepoint filter narrows further.
   export function hiddenUnpaired(studies, filters) {
     const f = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
     if (!f.pairedOnly) return 0;
     return filterParameters(studies, { ...f, pairedOnly: false, timepoint: null }).length
       - filterParameters(studies, { ...f, timepoint: null }).length;
   }
   ```
6. In `sortParameters`, insert before `if (key in TEXT_SORTS) {`:
   ```js
     if (key === 'subject') {
       const indexed = studies.map((study, index) => ({ study, index }));
       indexed.sort((a, b) => {
         const ka = subjectKey(a.study);
         const kb = subjectKey(b.study);
         // No subject last in BOTH directions; the direction flips the subject order only, so a
         // block always reads Pre-op → Post-op (planning ruling, 2026-09-07).
         if (ka === null && kb === null) return compareWithinSubject(a, b);
         if (ka === null) return 1;
         if (kb === null) return -1;
         if (ka !== kb) return (ka < kb ? -1 : 1) * sign;
         return compareWithinSubject(a, b);
       });
       return indexed.map((entry) => entry.study);
     }
   ```
   and add before `sortParameters` (after `TEXT_SORTS`):
   ```js
   // Inside one subject (§7.2): timepoint order, then film date ascending (absent last), then
   // addedAt ascending, then input order.
   function compareWithinSubject(a, b) {
     const byTimepoint = compareTimepoints(a.study.timepoint, b.study.timepoint);
     if (byTimepoint !== 0) return byTimepoint;
     const da = a.study.filmDate ?? null;
     const db = b.study.filmDate ?? null;
     if (da !== db) {
       if (da === null) return 1;
       if (db === null) return -1;
       return da < db ? -1 : 1;
     }
     const aa = a.study.addedAt ?? '';
     const ab = b.study.addedAt ?? '';
     if (aa !== ab) return aa < ab ? -1 : 1;
     return a.index - b.index;
   }

   // Where a new subject block starts in a list sorted by subject: true at i when the row's subject
   // key differs from the previous row's. Every row is false under any other sort, and the first
   // row always is -- a rule above the first row would separate it from nothing.
   export function subjectBreaks(visible, sort) {
     const { key } = { ...DEFAULT_SORT, ...(sort ?? {}) };
     return visible.map((study, i) => key === 'subject' && i > 0 && subjectKey(study) !== subjectKey(visible[i - 1]));
   }
   ```
   Also update `sortParameters`'s comment to mention the subject key: change `// A sorted COPY. Text keys compare case-insensitively.` to `// A sorted COPY. 'subject' groups by subject (below); text keys compare case-insensitively.`
7. In `emptyReason`, change the condition to
   ```js
     if (f.workspace || f.folder || f.timepoint || f.view || String(f.subject ?? '').trim() !== '' || f.pairedOnly === true
       || String(query ?? '').trim() !== '') return 'filtered';
   ```
   and its comment's `'filtered'` line to `//   'filtered'     a workspace, folder, timepoint, view, subject or paired-only filter, or the search box, removed everything`.
8. Update the file header's first paragraph: after `which columns the grid shows,` insert `the timepoint, view and paired-with options,`.

- [ ] **Step 5: Run the suites to see them pass**

Run: `node --test test/parameters.test.js test/store.test.js` — Expected: all pass. Then `node --test test/*.test.js` — Expected: 378/378.

- [ ] **Step 6: Commit**

```bash
git add renderer/data/parameters.js renderer/store.js test/parameters.test.js test/store.test.js docs/superpowers/plans/2026-08-31-00-architecture-contract.md
git commit -m "feat: timepoint, view, subject and paired-only filters and the subject sort for the Parameters grid

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 9: The Parameters grid — four text columns, four filters, the subject sort

**Files:**
- Modify: `renderer/screens/parameters.js` (imports; `buildFilterBar`; `buildRow`; `buildGrid`; `update`)
- Modify: `styles/screens/studies.css` (append)
- Modify: `tools/smoke/smoke-parameters.mjs` (`RESET`)

**Interfaces:**
- Consumes: everything Task 8 exports; `POST_OP` (Task 1); the record fields (Task 3).
- Produces: the DOM Task 10 selects on — `[data-param-key="timepoint"]` (`.param-select-timepoint`), `[data-param-key="view"]` (`.param-select-view`), `[data-param-key="subject"]` (`.param-subject`), `[data-param-key="paired"]`, `[data-param-key="paired-with"]` (`.param-select-paired-with`), `[data-param-key="sort-subject"]`, `.param-row-break`, and the four `.param-cell-text` cells that now precede the numbers in each row (subject, timepoint, view, film date, in that order).

DOM code: no unit test. Verification is the dry run, the human gate in step 5 and Task 10's suite.

- [ ] **Step 1: Imports and the filter bar**

In `renderer/screens/parameters.js`:

1. Change the `data/parameters.js` import to
   ```js
   import {
     HAND_ADDED, DEFAULT_SORT, measurementColumns, parameterValues, formatParameter,
     workspaceOptions, folderOptions, normaliseFilters, patchFilters, filterParameters,
     hiddenUnsegmented, sortParameters, emptyReason, exportFileName,
     toggleId, withIds, selectedVisible, rowsToExport,
     timepointOptions, viewOptions, pairedWithOptions, hiddenUnpaired, subjectBreaks,
   } from '../data/parameters.js';
   import { POST_OP } from '../data/timepoints.js';
   ```
2. Add after `const INCONSISTENT_TITLE = …;`:
   ```js
   const DASH = '\u2014';
   ```
3. In `buildFilterBar`, insert after `folderSelect.value = filters.workspace …;` — i.e. after the line `folderSelect.value = filters.folder ?? '';` — and before `const hidden = hiddenUnsegmented(queried, filters);`:

```js
    // Timepoint and view: dropdowns of what is present (spec §10.3); each shows its value and
    // clears it with its All… entry. Options come from the whole library, as the workspace ones do.
    const timepointSelect = el('select', {
      class: 'param-select param-select-timepoint', 'aria-label': 'Filter by timepoint', 'data-param-key': 'timepoint',
      onChange: (event) => setFilters({ timepoint: event.target.value === '' ? null : event.target.value }),
    });
    timepointSelect.append(el('option', { value: '' }, 'All timepoints'));
    for (const option of timepointOptions(live.studies)) timepointSelect.append(el('option', { value: option.value }, option.label));
    timepointSelect.value = filters.timepoint ?? '';

    const viewSelect = el('select', {
      class: 'param-select param-select-view', 'aria-label': 'Filter by view', 'data-param-key': 'view',
      onChange: (event) => setFilters({ view: event.target.value === '' ? null : event.target.value }),
    });
    viewSelect.append(el('option', { value: '' }, 'All views'));
    for (const option of viewOptions(live.studies)) viewSelect.append(el('option', { value: option.value }, option.label));
    viewSelect.value = filters.view ?? '';

    // Substring on the subject, committed on every keystroke like the Studies search box. The
    // rebuild replaces this input; update() hands focus and the caret back by data-param-key.
    const subjectInput = el('input', {
      type: 'search', class: 'param-subject', placeholder: 'Subject…', 'aria-label': 'Filter by subject',
      'data-param-key': 'subject', value: filters.subject ?? '',
      onInput: (event) => setFilters({ subject: event.target.value }),
    });

    // Paired only, and which post-side label pairs with Pre-op (§10.3). The `with` select stays
    // disabled until the box is ticked; the note says how many rows the tick hides. A stored
    // label the options do not list (a relabelled library) is still offered so the control never
    // shows a value it does not hold.
    const pairedWithSelect = el('select', {
      class: 'param-select param-select-paired-with', 'aria-label': 'Paired with', 'data-param-key': 'paired-with',
      disabled: filters.pairedOnly !== true,
      onChange: (event) => setFilters({ pairedWith: event.target.value }),
    });
    const withOptions = pairedWithOptions(live.studies);
    const chosenWith = filters.pairedWith || POST_OP;
    if (!withOptions.some((option) => option.value === chosenWith)) withOptions.push({ value: chosenWith, label: chosenWith });
    for (const option of withOptions) pairedWithSelect.append(el('option', { value: option.value }, option.label));
    pairedWithSelect.value = chosenWith;
    const unpaired = hiddenUnpaired(queried, filters);
    const paired = checkbox({
      key: 'paired', label: 'Paired only', checked: filters.pairedOnly === true,
      note: filters.pairedOnly === true && unpaired > 0 ? ` \u00B7 ${unpaired} unpaired hidden` : null,
      onChange: (event) => setFilters({ pairedOnly: event.target.checked }),
    });
    const pairedGroup = el('div', { class: 'param-paired' }, paired, el('span', { class: 'param-paired-with' }, 'with'), pairedWithSelect);
```

4. Change the bar's return to
   ```js
       return el('div', { class: 'param-bar' },
         workspaceSelect, folderSelect, timepointSelect, viewSelect, subjectInput, pairedGroup, segmented, levels,
   ```
   (the `param-count` div and the export group that follow stay as they are).

- [ ] **Step 2: The grid**

1. Change `buildRow`'s signature to `function buildRow(study, columns, fields, selected, isBreak) {` and its `el('tr', { class: 'param-row', 'data-study-id': study.id },` to
   ```js
       // A rule above the first row of each subject block under the subject sort (spec §10.3).
       return el('tr', { class: `param-row${isBreak ? ' param-row-break' : ''}`, 'data-study-id': study.id },
   ```
2. Replace the row's `el('td', { class: 'param-cell-text' }, study.view || '\u2014'),` with
   ```js
         // Subject, timepoint, view, film date (spec §10.2): text as stored, an em dash when absent;
         // the film date as stored (YYYY-MM-DD), the Find tab's formatted DATE being the date added.
         el('td', { class: 'param-cell-text' }, study.subjectId || DASH),
         el('td', { class: 'param-cell-text' }, study.timepoint || DASH),
         el('td', { class: 'param-cell-text' }, study.view || DASH),
         el('td', { class: 'param-cell-text param-cell-date' }, study.filmDate || DASH),
   ```
3. In `buildGrid`, replace `plainHeader('VIEW'),` (the one right after the STUDY header) with
   ```js
         sortableHeader('subject', 'SUBJECT', sort),
         plainHeader('TIMEPOINT'),
         plainHeader('VIEW'),
         plainHeader('FILM DATE'),
   ```
   and replace `const body = el('tbody', {}, ...visible.map((study) => buildRow(study, columns, fields, selected)));` with
   ```js
       const breaks = subjectBreaks(visible, sort);
       const body = el('tbody', {}, ...visible.map((study, i) => buildRow(study, columns, fields, selected, breaks[i])));
   ```

- [ ] **Step 3: Focus and caret restore in `update`**

Replace
```js
    const active = document.activeElement;
    const focusKey = root.contains(active) ? active.getAttribute('data-param-key') : null;
```
with
```js
    const active = document.activeElement;
    const focusKey = root.contains(active) ? active.getAttribute('data-param-key') : null;
    // A text control's caret goes with its focus: the subject box is rebuilt on every keystroke,
    // and focus() alone would park the caret at the end of the text.
    const caret = focusKey !== null && active.tagName === 'INPUT' && active.type === 'search'
      ? { start: active.selectionStart, end: active.selectionEnd } : null;
```
and, in the restore loop, replace `if (typeof candidate.focus === 'function') candidate.focus();` with
```js
          candidate.focus();
          if (caret !== null && caret.start !== null && typeof candidate.setSelectionRange === 'function') {
            candidate.setSelectionRange(caret.start, caret.end);
          }
```

- [ ] **Step 4: Styles, the suite's reset, and the dry run**

Append to `styles/screens/studies.css`:

```css
/* The subject filter box, the paired-only group and the rule between subject blocks (pre-op/post-op
   spec §10.3). */
.param-subject {
  width: 150px;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
  color: var(--ink);
  font: 400 13.5px 'Source Sans 3', sans-serif;
}

.param-subject::placeholder {
  color: var(--muted);
}

.param-subject:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.param-paired {
  display: flex;
  align-items: center;
  gap: 8px;
}

.param-paired-with {
  font: 400 13px 'Source Sans 3', sans-serif;
  color: var(--muted);
}

.param-select:disabled {
  color: var(--muted);
  cursor: not-allowed;
}

.param-cell-date {
  font-family: 'Chivo Mono', monospace;
  font-size: 12px;
  letter-spacing: 0.04em;
}

/* Sorting by subject draws a rule above the first row of each subject, so a pair reads as a block. */
.param-row-break td,
.param-row-break th {
  border-top: 2px solid color-mix(in srgb, var(--ink) 30%, var(--border));
}
```

In `tools/smoke/smoke-parameters.mjs`, change `RESET` to
```js
const RESET = '{ query: "", studiesTab: "find", paramFilters: { workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, subject: "", pairedOnly: false, pairedWith: "Post-op" }, paramSort: { key: "study", dir: "asc" }, paramLevels: false, paramSelected: [] }';
```

Then the dry run on a scratch profile, FOREGROUND, captured to a file:

```
node tools/smoke/launch.mjs
node tools/smoke/smoke-parameters.mjs > tools/smoke/out/task9-parameters.txt 2>&1
```

Expected: 33/33 (the four text columns sit before `.param-cell-num`, which every existing check keys on). Then drive the eight checks below over CDP: inject three segmented records under one root with subjects `S001` Pre-op / `S001` Post-op / `S002` Pre-op (the shape Task 10 will pin), choose each dropdown by setting `.value` and dispatching `change`, type into the subject box with `Input.insertText` after clicking it and read `document.activeElement` and its `selectionStart`, tick paired-only, click the SUBJECT header twice and read the `.param-row-break` classes. Record every outcome and a screenshot of the grid. Quit with `node tools/smoke/cdp.mjs --quit`.

- [ ] **Step 5: Manual verification** (human gate; run the app from source)

1. Parameters tab: the columns read STUDY, SUBJECT, TIMEPOINT, VIEW, FILM DATE, then the numbers. The demo pair (dev build) shows `P-8841` Pre-op / Post-op with film dates; a real film shows what the load or the drawer set and `—` where nothing was.
2. The Timepoint dropdown lists the labels present in Pre-op → Intra-op → Post-op → durations → custom order, then `No timepoint`. Choosing one narrows the grid; `All timepoints` clears it.
3. The View dropdown lists the views present; choosing one narrows; `All views` clears.
4. Type in the Subject box: the grid narrows on each keystroke. Click into the middle of the typed text and type a character: it lands where the caret was, not at the end.
5. Tick Paired only: only subjects with both a Pre-op film and a Post-op film remain and the note reads `· N unpaired hidden`; the `with` dropdown enables; with Timepoint = Pre-op only the pre-op halves show; untick and the rows return.
6. Click the SUBJECT header: rows group by subject with a rule between subjects, Pre-op before Post-op inside a subject, films with no subject at the bottom. Click again: the subject order reverses, a pair still reads Pre-op first, no-subject films still last.
7. Export CSV: the file's header line reads `Study ID,View,Subject,Timepoint,Film date,LL L1-S1,…` and a row's subject and timepoint are the grid's.
8. DevTools console: no errors during 1–7.

- [ ] **Step 6: Commit** (body: `Manual verification: pending the human gate (eight checks) — outcomes recorded here by amendment before Task 10 starts.` until the gate; then the eight outcomes)

```bash
git add renderer/screens/parameters.js styles/screens/studies.css tools/smoke/smoke-parameters.mjs
git commit -m "feat: subject, timepoint, view and film date on the Parameters grid, with their filters and the subject sort

Manual verification: pending the human gate (eight checks) — outcomes recorded here by amendment before Task 10 starts.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Smoke — the Parameters suite's new checks, and a seeding suite over a pre-op/post-op fixture

**Files:**
- Modify: `tools/smoke/smoke-parameters.mjs`
- Create: `tools/smoke/smoke-seeding.mjs`
- Modify: `tools/smoke/README.md`

**Interfaces:**
- Consumes: `connect()` from `tools/smoke/cdp-lib.mjs`; the `data-param-key`, `data-ws-key`, `data-ws-folder`, `data-study-id`, `data-kind`/`data-field` attributes from Tasks 6, 7 and 9; `scanFolder`, `readCsv` through `window.spineContour`; the page's own `renderer/data/seeding.js`, `csv.js` and `store.js` modules.
- Produces: `smoke-parameters.mjs` at 46 checks; `smoke-seeding.mjs` at 36 checks, DOM-only, never segmenting.

Run every suite in the FOREGROUND with output captured to a file under `tools/smoke/out/`. A suite that prints nothing has thrown: re-run it bare and read the stack.

- [ ] **Step 1: The Parameters suite**

In `tools/smoke/smoke-parameters.mjs`:

1. Replace the injection in section 4 (the whole `await cdp.setState(\`(s) => ({ studies: [ … ] })\`);` call) with:

```js
  await cdp.setState(`(s) => ({ studies: [
    { id: 'SP-9100', source: 'real', filePath: 'C:\\\\loose\\\\smoke-unseg.png', fileName: 'smoke-unseg.png', name: null, workspaceFolder: null,
      subjectId: null, timepoint: null, filmDate: null,
      addedAt: new Date().toISOString(), view: 'Standing lateral', thumbnail: null, measurements: null, geometry: null, qc: null, clinical: {} },
    { id: 'SP-9101', source: 'real', filePath: ${JSON.stringify(`${WS_ROOT}\\pre-op\\smoke-seg-a.png`)}, fileName: 'smoke-seg-a.png', name: null,
      workspaceFolder: ${JSON.stringify(WS_ROOT)}, subjectId: 'S001', timepoint: 'Pre-op', filmDate: '2025-03-02',
      addedAt: '2026-09-01T00:00:00.000Z', view: 'Standing lateral', thumbnail: null,
      measurements: { PI: 99.5, PT: 30.0, SS: 69.5, L1PA: 12.0, LL: { 'L1-S1': 60.0 } }, geometry: null, qc: null, clinical: {} },
    { id: 'SP-9102', source: 'real', filePath: ${JSON.stringify(`${WS_ROOT}\\post-op\\smoke-seg-b.png`)}, fileName: 'smoke-seg-b.png', name: null,
      workspaceFolder: ${JSON.stringify(WS_ROOT)}, subjectId: 'S001', timepoint: 'Post-op', filmDate: '2025-09-14',
      addedAt: '2026-09-02T00:00:00.000Z', view: 'Standing lateral', thumbnail: null,
      measurements: { PI: 50.0, PT: 15.0, SS: 35.0, LL: { 'L1-S1': 45.0 } }, geometry: null, qc: null, clinical: {} },
    { id: 'SP-9103', source: 'real', filePath: ${JSON.stringify(`${WS_ROOT}\\pre-op\\smoke-seg-c.png`)}, fileName: 'smoke-seg-c.png', name: null,
      workspaceFolder: ${JSON.stringify(WS_ROOT)}, subjectId: 'S002', timepoint: 'Pre-op', filmDate: null,
      addedAt: '2026-09-03T00:00:00.000Z', view: 'Standing lateral', thumbnail: null,
      measurements: { PI: 48.0, PT: 12.0, SS: 36.0, LL: { 'L1-S1': 44.0 } }, geometry: null, qc: null, clinical: {} },
    ...s.studies.filter((x) => !${JSON.stringify(INJECTED)}.includes(x.id)),
  ] })`);
```

   and add near the top, after `const WS_ROOT = …;` (a Node-side constant, interpolated into every page expression that names the set):
   ```js
   // The injected records: one unsegmented hand-added film, and three segmented films under one
   // workspace root -- S001 Pre-op and Post-op (a pair) and S002 Pre-op (unpaired).
   const INJECTED = ['SP-9100', 'SP-9101', 'SP-9102', 'SP-9103'];
   ```
2. Update the header comment: `Two records are injected` → `Four records are injected`, and describe SP-9102/SP-9103 as above.
3. Replace the check `'the segmented film is a row and the unsegmented one is not'` with
   ```js
     const idsAfterInject = await rowIds();
     check('the three segmented films are rows and the unsegmented one is not', ['SP-9101', 'SP-9102', 'SP-9103'].every((id) => idsAfterInject.includes(id)) && !idsAfterInject.includes('SP-9100'), idsAfterInject);
   ```
4. Change `'choosing the root shows exactly its segmented film'` to expect `['SP-9101', 'SP-9102', 'SP-9103']` and rename it `'choosing the root shows exactly its three segmented films, by name'`; change `'the folder dropdown offers only that root\'s subfolder'` to expect `['', 'pre-op', 'post-op']` and rename it `'… that root\'s two subfolders'`.
5. In section 8, the checks that count ticks still hold (select-all ticks every visible row, whatever the count).
6. In the `finally`, change the cleanup filter to `s.studies.filter((x) => !${JSON.stringify(INJECTED)}.includes(x.id))` and `openId: s.openId === 'SP-9101' ? null : s.openId` to `openId: ${JSON.stringify(INJECTED)}.includes(s.openId) ? null : s.openId`.
7. Insert a new section between section 9 (`back on Studies, the Parameters tab and the PI sort are still in place`) and section 10 (the delete):

```js
  // 12. The study columns and the task-2 filters and sort (spec §10.2–§10.3). SP-9101 (S001 Pre-op)
  // and SP-9102 (S001 Post-op) pair; SP-9103 (S002 Pre-op) does not; the demo pair SP-0042/SP-0039
  // (P-8841) pairs as well. Every selector is a data-param-key, a class the grid owns, or an id.
  await cdp.setState('{ paramSort: { key: "study", dir: "asc" } }');
  await cdp.settle(80);
  const textCells = (id) => cdp.evaluate(`(() => { const row = document.querySelector('.param-row[data-study-id="${id}"]'); return row ? [...row.querySelectorAll('.param-cell-text')].slice(0, 4).map((c) => c.textContent) : null; })()`);
  const cellsA = await textCells('SP-9101');
  const cellsC = await textCells('SP-9103');
  check('a row shows subject, timepoint, view and film date, with an em dash where a value is absent',
    JSON.stringify(cellsA) === JSON.stringify(['S001', 'Pre-op', 'Standing lateral', '2025-03-02'])
    && JSON.stringify(cellsC) === JSON.stringify(['S002', 'Pre-op', 'Standing lateral', '\u2014']), { cellsA, cellsC });

  const timepointValues = await options('.param-select-timepoint');
  check('the timepoint dropdown lists the labels present in §7.2 order, then No timepoint',
    JSON.stringify(timepointValues) === JSON.stringify(['', 'Pre-op', 'Post-op', '__none__']), timepointValues);
  await choose('.param-select-timepoint', 'Post-op');
  await cdp.settle(80);
  const postIds = await rowIds();
  check('filtering by Post-op keeps the two post-op films', postIds.length === 2 && postIds.includes('SP-9102') && postIds.includes('SP-0039'), postIds);
  await choose('.param-select-timepoint', '__none__');
  await cdp.settle(80);
  const noneIds = await rowIds();
  check('No timepoint keeps the segmented films with none (the seven other demos)', noneIds.length === 7 && noneIds.every((id) => /^SP-00\d\d$/.test(id)), noneIds);
  await choose('.param-select-timepoint', '');
  await cdp.settle(80);

  const viewValues = await options('.param-select-view');
  check('the view dropdown lists the distinct views present', viewValues[0] === '' && viewValues.includes('Standing lateral') && viewValues.includes('Flexion lateral'), viewValues);
  await choose('.param-select-view', 'Flexion lateral');
  await cdp.settle(80);
  check('filtering by view keeps only the flexion film', JSON.stringify(await rowIds()) === JSON.stringify(['SP-0041']), await rowIds());
  await choose('.param-select-view', '');
  await cdp.settle(80);

  await clickKey('subject');
  await cdp.typeText('S00');
  await cdp.settle(150);
  const subjectIds = await rowIds();
  const subjectFocus = await cdp.evaluate("(() => { const e = document.activeElement; return { key: e?.getAttribute('data-param-key') ?? null, value: e?.value ?? null, caret: e?.selectionStart ?? null }; })()");
  check('typing in the subject box narrows to the matching subjects and keeps focus and the caret',
    subjectIds.length === 3 && subjectIds.every((id) => /^SP-910[123]$/.test(id)) && subjectFocus.key === 'subject' && subjectFocus.value === 'S00' && subjectFocus.caret === 3, { subjectIds, subjectFocus });
  await cdp.evaluate("(() => { const e = document.querySelector('[data-param-key=\"subject\"]'); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await cdp.settle(80);

  const visibleBeforePaired = (await rowIds()).length;
  await clickKey('paired');
  s = await cdp.state();
  const pairedIds = await rowIds();
  const pairedNote = await cdp.evaluate("(() => { const e = document.querySelector('[data-param-key=\"paired\"]'); return e?.closest('.param-check')?.querySelector('.param-check-note')?.textContent ?? null; })()");
  check('paired-only keeps the two paired subjects (four films) and says how many it hid',
    s.paramFilters.pairedOnly === true && pairedIds.length === 4 && ['SP-9101', 'SP-9102', 'SP-0042', 'SP-0039'].every((id) => pairedIds.includes(id))
    && pairedNote === ` \u00B7 ${visibleBeforePaired - 4} unpaired hidden`, { pairedIds, pairedNote, visibleBeforePaired });
  const withState = await cdp.evaluate("(() => { const e = document.querySelector('[data-param-key=\"paired-with\"]'); return { disabled: e.disabled, value: e.value }; })()");
  check('the with dropdown is enabled and reads Post-op', withState.disabled === false && withState.value === 'Post-op', withState);
  await choose('.param-select-timepoint', 'Pre-op');
  await cdp.settle(80);
  const pairedPreIds = await rowIds();
  check('paired-only with Pre-op shows the pre-op halves of the pairs', pairedPreIds.length === 2 && pairedPreIds.includes('SP-9101') && pairedPreIds.includes('SP-0042'), pairedPreIds);
  await choose('.param-select-timepoint', '');
  await cdp.settle(80);
  await clickKey('paired');

  await clickKey('sort-subject');
  const sortedIds = await rowIds();
  const breaks = await cdp.evaluate("[...document.querySelectorAll('.param-row')].map((r) => r.classList.contains('param-row-break'))");
  // p-8841 < s001 < s002, then the seven demos with no subject; Pre-op before Post-op inside a subject.
  check('sorting by subject groups the pairs with Pre-op first and puts films with no subject last',
    JSON.stringify(sortedIds.slice(0, 5)) === JSON.stringify(['SP-0042', 'SP-0039', 'SP-9101', 'SP-9102', 'SP-9103']) && sortedIds.slice(5).every((id) => /^SP-00\d\d$/.test(id)), sortedIds);
  check('a rule starts each new subject block and never the first row',
    breaks.length === sortedIds.length && breaks[0] === false && breaks[1] === false && breaks[2] === true && breaks[3] === false && breaks[4] === true && breaks[5] === true && breaks.slice(6).every((b) => b === false), breaks);
  await clickKey('sort-subject');
  const descIds = await rowIds();
  check('descending reverses the subject order, a pair still reads Pre-op first, no-subject films still last',
    JSON.stringify(descIds.slice(0, 5)) === JSON.stringify(['SP-9103', 'SP-9101', 'SP-9102', 'SP-0042', 'SP-0039']) && descIds.slice(5).every((id) => /^SP-00\d\d$/.test(id)), descIds);
  await cdp.setState('{ paramSort: { key: "PI", dir: "desc" } }');
  await cdp.settle(80);
```

   (The last line restores the PI sort that section 10 does not depend on but section 9 asserted; section 10 then deletes SP-9101 as before.)

8. Renumber nothing else; the section comment numbers are labels, not an index.

Run on a scratch profile: `node tools/smoke/launch.mjs`, then `node tools/smoke/smoke-parameters.mjs > tools/smoke/out/task10-parameters.txt 2>&1`. Expected: 46/46. Do not quit yet; the seeding suite runs on the same instance in step 3 (the Parameters suite removes its records).

- [ ] **Step 2: The seeding suite**

Create `tools/smoke/smoke-seeding.mjs`:

```js
// Seeding smoke (task 2 of the pre-op/post-op spec, 2026-09-07: §8 and §9, and the §10.3 filters
// over seeded films). Drives, on a launched app over CDP: the folder table on the Workspace card
// seeded from a fixture with pre-op/, post-op/ and flexion/ subfolders and a CSV with the four
// structural columns; a row changed before Load; Load and its message; the study fields the load
// wrote, read back from the store; the Parameters grid under the timepoint, paired-only and
// subject filters; the export's header and first row through the page's own toCsv; and the
// drawer's Study group on Analysis, including a typed timepoint. DOM-only, no segmentation.
// Fixture: tools/smoke/out/seeding-fixture/ plus tools/smoke/out/seeding-fixture.csv beside it.
//
// PRECONDITIONS
//   * A launched app (`node tools/smoke/launch.mjs`), any screen. It may follow
//     smoke-parameters.mjs on the same instance (that suite removes its records) and may precede
//     or follow smoke-workspace.mjs: every count here is over the fixture's own five records,
//     found by workspaceFolder, and the folder table is read by data-ws-folder.
//   * NEVER between `smoke-persist.mjs --phase run` and `--phase restart`: the load writes the
//     store through the saver, and the cleanup writes it again.
//   * It leaves the app on Studies with the five fixture records removed and the ws* keys cleared.
//
// NOT DRIVEABLE HERE: the native folder and CSV pickers (the state is seeded the way the two
// handlers would seed it), the datalist popup and the date picker popup (the values are set and
// read back instead), and the save dialog (the CSV text is read from toCsv, never written).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'out', 'seeding-fixture');
const CSV_PATH = path.join(__dirname, 'out', 'seeding-fixture.csv');
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Five films: S001 in both pre-op/ and post-op/ (a pair whose stem is ambiguous for the CSV, so it
// takes no row), S002 in pre-op/, S003 in flexion/, and S004_postop in the root. The CSV joins on
// the stem: S002 (timepoint `preop`, a US date, no view), S003 (a date the parser rejects),
// S004_postop (a subject the CSV supplies, an ISO date, a view). Excel-style: BOM and CRLF.
function writeFixture() {
  fs.rmSync(FIXTURE, { recursive: true, force: true });
  for (const dir of ['pre-op', 'post-op', 'flexion']) fs.mkdirSync(path.join(FIXTURE, dir), { recursive: true });
  const png = Buffer.from(PNG_1X1, 'base64');
  fs.writeFileSync(path.join(FIXTURE, 'pre-op', 'S001.png'), png);
  fs.writeFileSync(path.join(FIXTURE, 'pre-op', 'S002.png'), png);
  fs.writeFileSync(path.join(FIXTURE, 'post-op', 'S001.png'), png);
  fs.writeFileSync(path.join(FIXTURE, 'flexion', 'S003.png'), png);
  fs.writeFileSync(path.join(FIXTURE, 'S004_postop.png'), png);
  const csv = '\uFEFFstudy_id,subject_id,timepoint,film_date,view,age_yrs\r\n'
    + 'S002,,preop,3/2/2025,,58\r\n'
    + 'S003,,,2025-13-40,,61\r\n'
    + 'S004_postop,S004-CSV,,2025-09-14,Supine lateral,\r\n';
  fs.writeFileSync(CSV_PATH, csv, 'utf8');
}

const at = (relative) => path.join(FIXTURE, ...relative.split('/'));
const ROWS_AT_SCAN = [
  { folder: '.', count: 1, timepoint: null, view: 'Standing lateral' },
  { folder: 'flexion', count: 1, timepoint: null, view: 'Flexion lateral' },
  { folder: 'post-op', count: 1, timepoint: 'Post-op', view: 'Standing lateral' },
  { folder: 'pre-op', count: 2, timepoint: 'Pre-op', view: 'Standing lateral' },
];
const TOAST_LOAD = 'Workspace loaded — 5 studies added · clinical data linked (3 matched)'
  + ' · subject, timepoint or view read from folder or file names for 5 films'
  + ' · subject, timepoint, film date or view set from the CSV for 2 films'
  + ' · 1 film has no timepoint · 1 film date could not be read';
const EXPORT_HEADER = 'Study ID,View,Subject,Timepoint,Film date,LL L1-S1,PI,PT,SS,PI-LL Mismatch,L1PA,LL L2-S1,LL L3-S1,LL L4-S1,LL L5-S1,Age';
const RESET_WS = '{ wsFolder: null, wsFiles: [], wsFolderRows: [], wsCsv: null, wsCsvHeaders: [], wsCsvRows: [], wsMapping: [] }';
const RESET_PARAMS = '{ query: "", studiesTab: "find", paramFilters: { workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, subject: "", pairedOnly: false, pairedWith: "Post-op" }, paramSort: { key: "study", dir: "asc" }, paramLevels: false, paramSelected: [] }';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

const cdp = await connect();
const errorsAtStart = cdp.errors.length; // Runtime.enable replays older page exceptions; count deltas.
const store = (expr) => cdp.evaluate(`import('./renderer/store.js').then((m) => { const s = m.getState(); return (${expr}); })`);
const rowIds = () => cdp.evaluate("[...document.querySelectorAll('.param-row')].map((r) => r.dataset.studyId)");
const options = (selector) => cdp.evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)} + ' option')].map((o) => o.value)`);
const choose = (selector, value) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); return e.value; })()`);
const rectBy = (finderSource) => cdp.evaluate(`(() => {
  const e = (${finderSource})();
  if (!e) return null;
  e.scrollIntoView({ block: 'center' });
  const r = e.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
})()`);
async function waitForState(predicateSource, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await store(`Boolean(${predicateSource})`)) return true;
    await cdp.settle(150);
  }
  return false;
}
const fixtureFilter = `(x) => x.source === 'real' && x.workspaceFolder === ${JSON.stringify(FIXTURE)}`;
const fixtureRecords = () => store(`s.studies.filter(${fixtureFilter}).map((x) => ({ id: x.id, filePath: x.filePath, subjectId: x.subjectId, timepoint: x.timepoint, filmDate: x.filmDate, view: x.view, clinical: x.clinical }))`);
// The folder table as it reads: one entry per data-ws-folder row.
const tableRows = () => cdp.evaluate(`[...document.querySelectorAll('.workspace-folders tbody tr[data-ws-folder]')].map((r) => ({
  folder: r.dataset.wsFolder,
  count: Number(r.querySelector('.workspace-folders-num')?.textContent),
  timepoint: r.querySelector('[data-ws-key^="tp:"]')?.value || null,
  view: r.querySelector('[data-ws-key^="view:"]')?.value ?? null,
}))`);
// Set a folder-table select the way the DOM would, with focus on it first so the rebuild's
// focus restore has something to restore.
const setTableSelect = (key, value) => cdp.evaluate(`(() => { const e = document.querySelector('[data-ws-key=${JSON.stringify(key)}]'); e.focus(); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const activeKey = () => cdp.evaluate("document.activeElement?.getAttribute('data-ws-key') ?? null");

try {
  writeFixture();

  // 0. Ready, on Studies, with a clean workspace and grid state.
  check('precondition: the store has loaded (the demo studies are merged in at bootstrap)', await waitForState('s.studies.length > 0', 30000));
  await cdp.setState(`{ ack: true, screen: "studies", ...${RESET_WS}, ...${RESET_PARAMS} }`);
  await cdp.settle(100);

  // 1. The scan, through the bridge, and the rows the card will show.
  const scan = await cdp.evaluate(`window.spineContour.scanFolder(${JSON.stringify(FIXTURE)})`);
  check('scanFolder finds the five films, sorted by name depth-first', scan && scan.files.length === 5
    && same(scan.files, [at('S004_postop.png'), at('flexion/S003.png'), at('post-op/S001.png'), at('pre-op/S001.png'), at('pre-op/S002.png')]), scan);
  const rows = await cdp.evaluate(`import('./renderer/data/seeding.js').then((m) => m.folderRows(${JSON.stringify(scan.files)}, ${JSON.stringify(FIXTURE)}))`);
  check('folderRows infers one row per folder with its count, timepoint and view', same(rows, ROWS_AT_SCAN), rows);
  const csv = await cdp.evaluate(`Promise.all([window.spineContour.readCsv(${JSON.stringify(CSV_PATH)}), import('./renderer/data/csv.js')]).then(([text, m]) => {
    const parsed = m.parse(text);
    return { headers: parsed.headers, rows: parsed.rows, mapping: m.autoMap(parsed.headers) };
  })`);
  check('autoMap claims Age and leaves the join key and the four structural columns unmapped',
    same(csv.mapping, [{ src: 'study_id', dest: null }, { src: 'subject_id', dest: null }, { src: 'timepoint', dest: null },
      { src: 'film_date', dest: null }, { src: 'view', dest: null }, { src: 'age_yrs', dest: 'Age' }]), csv.mapping);

  // 2. Seed the state as the two handlers would and mount the Workspace screen.
  await cdp.setState(JSON.stringify({
    wsFolder: FIXTURE, wsFiles: scan.files, wsFolderRows: rows,
    wsCsv: CSV_PATH, wsCsvHeaders: csv.headers, wsCsvRows: csv.rows, wsMapping: csv.mapping,
  }));
  await cdp.setState('{ screen: "workspace" }');
  await cdp.settle(120);
  check('the Workspace screen mounts with the folder table', Boolean(await cdp.rect('.workspace-folders[data-ws-key="folders"]')));
  check('the table shows the four rows the scan inferred', same(await tableRows(), ROWS_AT_SCAN), await tableRows());

  // 3. Change the pre-op row's view, then use the header control, then set two rows by hand.
  await setTableSelect('view:pre-op', 'Extension lateral');
  await cdp.settle(100);
  let s = await cdp.state();
  check('changing a row\'s view writes wsFolderRows and keeps focus on that select',
    s.wsFolderRows.find((r) => r.folder === 'pre-op')?.view === 'Extension lateral' && (await activeKey()) === 'view:pre-op', { rows: s.wsFolderRows, active: await activeKey() });
  await setTableSelect('all-timepoint', 'Intra-op');
  await cdp.settle(100);
  s = await cdp.state();
  const headerValue = await cdp.evaluate("document.querySelector('[data-ws-key=\"all-timepoint\"]')?.value");
  check('Set all… writes every row\'s timepoint and returns to its placeholder',
    s.wsFolderRows.every((r) => r.timepoint === 'Intra-op') && headerValue === '__all__', { rows: s.wsFolderRows, headerValue });
  await setTableSelect('all-timepoint', '');
  await cdp.settle(100);
  await setTableSelect('tp:pre-op', 'Pre-op');
  await cdp.settle(100);
  await setTableSelect('tp:post-op', 'Post-op');
  await cdp.settle(100);
  s = await cdp.state();
  check('the rows read back: root none, flexion none, post-op Post-op, pre-op Pre-op + Extension lateral',
    same(s.wsFolderRows, [
      { folder: '.', count: 1, timepoint: null, view: 'Standing lateral' },
      { folder: 'flexion', count: 1, timepoint: null, view: 'Flexion lateral' },
      { folder: 'post-op', count: 1, timepoint: 'Post-op', view: 'Standing lateral' },
      { folder: 'pre-op', count: 2, timepoint: 'Pre-op', view: 'Extension lateral' },
    ]), s.wsFolderRows);

  // 4. The mapping card: fixed chips for the join key and the structural columns.
  const chips = await cdp.evaluate(`[...document.querySelectorAll('.workspace-chip')].map((c) => ({
    src: c.querySelector('.workspace-chip-src')?.textContent ?? null,
    fixed: c.classList.contains('workspace-chip-fixed'),
    dest: c.querySelector('.workspace-chip-dest')?.textContent ?? null,
    select: c.querySelector('.workspace-chip-select')?.value ?? null,
  }))`);
  check('study_id, subject_id, timepoint, film_date and view are fixed chips; age_yrs keeps its select',
    same(chips, [
      { src: 'study_id', fixed: true, dest: 'Join key', select: null },
      { src: 'subject_id', fixed: true, dest: 'Subject', select: null },
      { src: 'timepoint', fixed: true, dest: 'Timepoint', select: null },
      { src: 'film_date', fixed: true, dest: 'Film date', select: null },
      { src: 'view', fixed: true, dest: 'View', select: null },
      { src: 'age_yrs', fixed: false, dest: null, select: 'Age' },
    ]), chips);

  // 5. Load.
  const loadRect = await rectBy("() => document.querySelector('.workspace-load')");
  check('Load workspace has layout', Boolean(loadRect), loadRect);
  await cdp.click(loadRect.cx, loadRect.cy);
  await cdp.settle(200);
  s = await cdp.state();
  check('Load navigates to Studies and the toast reports the join and the seeding', s.screen === 'studies' && s.toast === TOAST_LOAD, s.toast);
  const records = await fixtureRecords();
  const byPath = (relative) => records.find((x) => x.filePath === at(relative));
  const fields = (x) => (x ? { subjectId: x.subjectId, timepoint: x.timepoint, filmDate: x.filmDate, view: x.view, clinical: x.clinical } : null);
  check('five fixture records were added', records.length === 5, records.map((x) => x.filePath));
  check('S004_postop: subject and view from the CSV, timepoint from its own name, the ISO date',
    same(fields(byPath('S004_postop.png')), { subjectId: 'S004-CSV', timepoint: 'Post-op', filmDate: '2025-09-14', view: 'Supine lateral', clinical: {} }), fields(byPath('S004_postop.png')));
  check('flexion/S003: subject from the stem, no timepoint, the folder\'s view, its Age; the bad date not written',
    same(fields(byPath('flexion/S003.png')), { subjectId: 'S003', timepoint: null, filmDate: null, view: 'Flexion lateral', clinical: { Age: '61' } }), fields(byPath('flexion/S003.png')));
  check('post-op/S001: the ambiguous stem took no CSV row; subject and timepoint from the layout',
    same(fields(byPath('post-op/S001.png')), { subjectId: 'S001', timepoint: 'Post-op', filmDate: null, view: 'Standing lateral', clinical: {} }), fields(byPath('post-op/S001.png')));
  check('pre-op/S001: the changed row\'s view applied to a film whose own name says nothing',
    same(fields(byPath('pre-op/S001.png')), { subjectId: 'S001', timepoint: 'Pre-op', filmDate: null, view: 'Extension lateral', clinical: {} }), fields(byPath('pre-op/S001.png')));
  check('pre-op/S002: the CSV\'s preop and US date, the row\'s view, its Age',
    same(fields(byPath('pre-op/S002.png')), { subjectId: 'S002', timepoint: 'Pre-op', filmDate: '2025-03-02', view: 'Extension lateral', clinical: { Age: '58' } }), fields(byPath('pre-op/S002.png')));
  // The saver writes asynchronously after the load's setState: poll the raw store through the bridge.
  let stored = [];
  for (const deadline = Date.now() + 5000; Date.now() < deadline && stored.length < 5;) {
    const persisted = await cdp.evaluate('window.spineContour.loadStudies()');
    stored = ((persisted && persisted.studies) || []).filter((x) => x.workspaceFolder === FIXTURE);
    if (stored.length < 5) await cdp.settle(150);
  }
  check('the store on disk carries the four fields (subject, timepoint, film date, view) for the fixture records',
    stored.length === 5 && same(stored.map((x) => [x.filePath, x.subjectId, x.timepoint, x.filmDate, x.view]).sort(),
      records.map((x) => [x.filePath, x.subjectId, x.timepoint, x.filmDate, x.view]).sort()), stored.map((x) => [x.filePath, x.subjectId, x.timepoint, x.filmDate, x.view]));

  // 6. The Parameters grid over the fixture: every filter the task added, with segmented-only off
  // (nothing here is segmented) and the workspace filter on the fixture root.
  await cdp.setState(`{ studiesTab: "parameters", paramFilters: { workspace: ${JSON.stringify(FIXTURE)}, folder: null, segmentedOnly: false, timepoint: null, view: null, subject: "", pairedOnly: false, pairedWith: "Post-op" } }`);
  await cdp.settle(120);
  const ids = records.map((x) => x.id);
  const idOf = (relative) => byPath(relative)?.id;
  let visible = await rowIds();
  check('the grid shows the five fixture rows under the workspace filter', visible.length === 5 && visible.every((id) => ids.includes(id)), visible);
  await choose('.param-select-timepoint', 'Pre-op');
  await cdp.settle(100);
  visible = await rowIds();
  check('Pre-op keeps the two pre-op films', same([...visible].sort(), [idOf('pre-op/S001.png'), idOf('pre-op/S002.png')].sort()), visible);
  await choose('.param-select-timepoint', '');
  await cdp.settle(100);
  const pairedRect = await cdp.rect('[data-param-key="paired"]');
  await cdp.click(pairedRect.cx, pairedRect.cy);
  await cdp.settle(120);
  visible = await rowIds();
  const pairedNote = await cdp.evaluate("(() => { const e = document.querySelector('[data-param-key=\"paired\"]'); return e?.closest('.param-check')?.querySelector('.param-check-note')?.textContent ?? null; })()");
  check('paired-only keeps S001\'s pre-op and post-op films and hides the other three, saying so',
    same([...visible].sort(), [idOf('pre-op/S001.png'), idOf('post-op/S001.png')].sort()) && pairedNote === ' \u00B7 3 unpaired hidden', { visible, pairedNote });
  await cdp.click(pairedRect.cx, pairedRect.cy);
  await cdp.settle(100);
  const subjectRect = await cdp.rect('[data-param-key="subject"]');
  await cdp.click(subjectRect.cx, subjectRect.cy);
  await cdp.typeText('s00');
  await cdp.settle(150);
  visible = await rowIds();
  check('the subject box matches case-insensitively: s00 keeps all five', visible.length === 5, visible);
  await cdp.typeText('4');
  await cdp.settle(150);
  visible = await rowIds();
  check('s004 keeps only the film whose CSV subject is S004-CSV', same(visible, [idOf('S004_postop.png')]), visible);
  await cdp.evaluate("(() => { const e = document.querySelector('[data-param-key=\"subject\"]'); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await cdp.settle(100);

  // 7. The export, through the page's own toCsv over the fixture rows in grid order (the save
  // dialog is the human's): the header and the first row.
  const exported = await cdp.evaluate(`Promise.all([import('./renderer/store.js'), import('./renderer/data/csv.js'), import('./renderer/data/parameters.js')]).then(([st, csvm, pm]) => {
    const s = st.getState();
    const rows = pm.sortParameters(pm.filterParameters(s.studies.filter(${fixtureFilter}), s.paramFilters), s.paramSort);
    return csvm.toCsv(rows).split('\\r\\n');
  })`);
  check('the export\'s header carries Subject, Timepoint and Film date after View, then the numbers, then Age', exported[3] === EXPORT_HEADER, exported[3]);
  // Sorted by name, the two S001 films tie and keep store order; the load front-inserted them in
  // scan order, so post-op/S001 (scanned before pre-op/) is first. Twelve empty cells follow the
  // timepoint: the film date, the ten measurement columns and Age.
  check('the first row (post-op/S001, by name then store order) reads its view, subject and timepoint, with empty numbers',
    exported[4] === `${idOf('post-op/S001.png')},Standing lateral,S001,Post-op,,,,,,,,,,,,`, exported[4]);

  // 8. The drawer on Analysis for pre-op/S002: the Study group's cells, the datalists, a typed
  // timepoint that normalises, a date set on the date input.
  await cdp.setState(`{ screen: "analysis", openId: ${JSON.stringify(idOf('pre-op/S002.png'))}, selectedLevel: null, zoom: 1, panX: 0, panY: 0, panMode: false, editing: false, selection: null }`);
  await cdp.settle(200);
  const drawer = await cdp.evaluate(`(() => {
    const d = document.querySelector('.clinical-data');
    const cell = (field) => d?.querySelector('.clinical-cell[data-kind="study"][data-field="' + field + '"]');
    const read = (field) => { const e = cell(field); return e ? { value: e.value, type: e.type, list: e.getAttribute('list'), disabled: e.disabled } : null; };
    return {
      group: d?.querySelector('.clinical-grid-group .clinical-grid-group-study')?.textContent ?? null,
      heads: [...(d ? d.querySelectorAll('.clinical-grid-head .clinical-grid-cell') : [])].map((c) => (c.querySelector('span') ? c.querySelector('span').textContent : c.textContent)),
      subject: read('subjectId'), timepoint: read('timepoint'), filmDate: read('filmDate'), view: read('view'),
      timepoints: [...document.querySelectorAll('#clinical-timepoints option')].map((o) => o.value),
      views: [...document.querySelectorAll('#clinical-views option')].map((o) => o.value),
    };
  })()`);
  // state.fields may hold more than Age when another suite ran first on this instance; only the
  // Study group's position and Age's presence are pinned.
  check('the drawer shows the STUDY group over SUBJECT, TIMEPOINT, FILM DATE, VIEW, then the fields including AGE',
    drawer.group === 'STUDY' && same(drawer.heads.slice(0, 5), ['STUDY', 'SUBJECT', 'TIMEPOINT', 'FILM DATE', 'VIEW']) && drawer.heads.slice(5).includes('AGE'), drawer.heads);
  check('the cells hold the loaded values: S002, Pre-op, 2025-03-02 (a date input), Extension lateral',
    drawer.subject?.value === 'S002' && drawer.timepoint?.value === 'Pre-op' && drawer.filmDate?.value === '2025-03-02' && drawer.filmDate?.type === 'date' && drawer.view?.value === 'Extension lateral'
    && [drawer.subject, drawer.timepoint, drawer.filmDate, drawer.view].every((c) => c && c.disabled === false), drawer);
  check('Timepoint and View suggest from their datalists',
    drawer.timepoint?.list === 'clinical-timepoints' && drawer.view?.list === 'clinical-views'
    && same(drawer.timepoints, ['Pre-op', 'Intra-op', 'Post-op', '6 wk', '1 yr', '2 yr'])
    && same(drawer.views, ['Standing lateral', 'Supine lateral', 'Prone lateral', 'Flexion lateral', 'Extension lateral']), drawer);
  const S002 = idOf('pre-op/S002.png');
  await cdp.evaluate("(() => { const e = document.querySelector('.clinical-cell[data-kind=\"study\"][data-field=\"timepoint\"]'); e.focus(); e.select(); })()");
  await cdp.typeText('6 weeks');
  await cdp.key('Tab');
  const timepointCommitted = await waitForState(`(s.studies.find((x) => x.id === ${JSON.stringify(S002)}) || {}).timepoint === '6 wk'`, 3000);
  check('a typed `6 weeks` commits as the label 6 wk on the record', timepointCommitted === true, await store(`s.studies.find((x) => x.id === ${JSON.stringify(S002)})?.timepoint`));
  await cdp.evaluate("(() => { const e = document.querySelector('.clinical-cell[data-kind=\"study\"][data-field=\"filmDate\"]'); e.value = '2025-04-01'; e.dispatchEvent(new Event('change', { bubbles: true })); })()");
  const dateCommitted = await waitForState(`(s.studies.find((x) => x.id === ${JSON.stringify(S002)}) || {}).filmDate === '2025-04-01'`, 3000);
  check('a date set on the FILM DATE input commits as YYYY-MM-DD', dateCommitted === true, await store(`s.studies.find((x) => x.id === ${JSON.stringify(S002)})?.filmDate`));
  // cdp-lib's key() knows no Backspace; clear the cell the way the date was set -- value, then change.
  await cdp.evaluate("(() => { const e = document.querySelector('.clinical-cell[data-kind=\"study\"][data-field=\"view\"]'); e.value = ''; e.dispatchEvent(new Event('change', { bubbles: true })); })()");
  const viewCleared = await waitForState(`(s.studies.find((x) => x.id === ${JSON.stringify(S002)}) || {}).view === ''`, 3000);
  check('a cleared VIEW cell stores an empty string, never null', viewCleared === true, await store(`s.studies.find((x) => x.id === ${JSON.stringify(S002)})?.view`));
  const cellAfter = await cdp.evaluate("(() => { const e = document.querySelector('.clinical-cell[data-kind=\"study\"][data-field=\"timepoint\"]'); return e ? e.value : null; })()");
  check('the TIMEPOINT cell shows the committed label', cellAfter === '6 wk', cellAfter);

  // 9. Import from CSV on S002 rewrites the row's structural values (the timepoint back to Pre-op).
  const importRect = await rectBy("() => document.querySelector('.clinical-import')");
  check('Import from CSV has layout and is enabled', Boolean(importRect) && (await cdp.evaluate("document.querySelector('.clinical-import')?.disabled")) === false, importRect);
  await cdp.click(importRect.cx, importRect.cy);
  await cdp.settle(200);
  s = await cdp.state();
  const S002after = s.studies.find((x) => x.id === S002);
  check('the import toast counts 1 field and 2 study details, and the record reads Pre-op and 2025-03-02 again',
    s.toast === 'Imported 1 field and 2 study details from CSV' && S002after?.timepoint === 'Pre-op' && S002after?.filmDate === '2025-03-02' && S002after?.clinical?.Age === '58', { toast: s.toast, record: S002after });

  // 10. Console.
  check('no console errors or exceptions during the run', cdp.errors.length === errorsAtStart, cdp.errors.slice(errorsAtStart));
} finally {
  // Remove the fixture records (the saver writes the new list), clear the workspace and grid state.
  await cdp.setState(`(s) => ({ studies: s.studies.filter((x) => !(${fixtureFilter})(x)), openId: null, screen: "studies", ...${RESET_WS}, ...${RESET_PARAMS} })`).catch(() => {});
  cdp.close();
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${JSON.stringify(r.detail)}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
```

Notes on two checks: the export's first row ends with eleven empty cells (ten measurement columns and Age, all absent on an unsegmented film with no Age), and `Import from CSV` counts `1 field` (Age) and `2 study details` (timepoint and film date — the CSV row supplies no subject and no view for S002). The `toast` of step 9 stays exact: if Task 7's wording changed, fix the constant here, not the product.

- [ ] **Step 3: Run the seeding suite**

On the same instance: `node tools/smoke/smoke-seeding.mjs > tools/smoke/out/task10-seeding.txt 2>&1`. Expected: 36/36. Then `node tools/smoke/smoke-workspace.mjs > tools/smoke/out/task10-workspace.txt 2>&1` — Expected: 100/100 (it tolerates the seeding suite's leftovers: none). Quit: `node tools/smoke/cdp.mjs --quit`.

If a check fails: it is a finding to investigate, not a number to adjust. Read the suite's `detail`, reproduce over `cdp.mjs`, and fix the product or the check — whichever is wrong — and say which in the report.

- [ ] **Step 4: The smoke README**

In `tools/smoke/README.md`:

1. In the `## Running the Parameters suite` section, change `Baseline: 33/33.` to `Baseline: 46/46 (2026-09-07: the study columns, the timepoint, view, subject and paired-only filters, and the subject sort).` and, in its first paragraph, change `It injects \`SP-9100\` (unsegmented) and \`SP-9101\` (segmented, workspace root` to `It injects \`SP-9100\` (unsegmented) and \`SP-9101\`–\`SP-9103\` (segmented, subjects S001 Pre-op/Post-op and S002 Pre-op, workspace root`.
2. Insert before `## Library` (the snippet carries its own three-backtick command block, hence the four-backtick fence here):

````markdown
## Running the seeding suite

`smoke-seeding.mjs` drives task 2 of the pre-op/post-op spec: the Workspace card's folder table over
a fixture with `pre-op/`, `post-op/` and `flexion/` subfolders and a CSV carrying `subject_id`,
`timepoint`, `film_date` and `view`; a row changed before Load; Load and its message; the four
study fields read back from the store and from disk; the Parameters grid under the timepoint,
paired-only and subject filters; the export's header and first row through the page's own
`toCsv`; and the drawer's Study group, including a typed timepoint, a date, a cleared view and
Import from CSV. DOM-only, nothing segments; about ten seconds.

```
node tools/smoke/launch.mjs
node tools/smoke/smoke-seeding.mjs
node tools/smoke/cdp.mjs --quit
```

It writes its fixture under `tools/smoke/out/seeding-fixture/` (git-ignored) and the CSV beside it
on every run, adds five records through Load and removes them in `finally`. It may run before or
after the other suites on one instance, but never between `smoke-persist.mjs --phase run` and
`--phase restart`. Not driveable: the native pickers, the datalist and date-picker popups, and
the save dialog. A silent run has thrown — re-run it bare. Baseline: 36/36.
````

3. In the `## Running the plan-06 suite` section's **Known baseline** paragraph, change `smoke-workspace.mjs\` 96/96` to `smoke-workspace.mjs\` 100/100`, `smoke-parameters.mjs\` 33/33` to `smoke-parameters.mjs\` 46/46`, add `\`smoke-seeding.mjs\` 36/36;` after it, and change the unit figure to the Task 8 total.

- [ ] **Step 5: Commit**

```bash
git add tools/smoke/smoke-parameters.mjs tools/smoke/smoke-seeding.mjs tools/smoke/README.md
git commit -m "test: smoke checks for the study fields — the Parameters filters and sort, and a seeding suite over a pre-op/post-op fixture

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Records — contract, roadmap, handoff, spec, README

**Files:**
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` (Study typedef; module list; `data/csv.js` block; `screens/workspace.js` line)
- Modify: `docs/ROADMAP.md` (item 1; item 5)
- Modify: `docs/superpowers/HANDOFF.md` (header; "Where things stand"; decisions 40–44; two traps)
- Modify: `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` (§7.4; §8.4; §9; §15)
- Modify: `README.md` (Workspace; Parameters tab; a research-use sentence)

`CLAUDE.md`'s branch paragraph and `docs/superpowers/NEXT-SESSION.md` are the session wrap's, not this task's (the previous plan's ruling).

- [ ] **Step 1: Contract**

1. In the `Study` typedef, after the `workspaceFolder` property lines, add:
   ```
    * @property {string|null} subjectId   (2026-09-07, pre-op/post-op spec §7.1) study code shared by every film of one
    *                                     subject; compared case-insensitively after trimming; never an MRN, never burned in
    * @property {string|null} timepoint   'Pre-op' | 'Intra-op' | 'Post-op' | 'N wk' | 'N mo' | 'N yr' | any user label (§7.2)
    * @property {string|null} filmDate    'YYYY-MM-DD', the acquisition date; never addedAt
   ```
   change the `view` line to ` * @property {string}  view        'Standing lateral' by default; seeded per folder by a workspace load and editable in the drawer (2026-09-07); '' when cleared` and, in the paragraph beginning "`name` and `workspaceFolder` are both **optional and default to `null`**", change it to begin "`name`, `workspaceFolder`, `subjectId`, `timepoint` and `filmDate` are all **optional and default to `null`**" and append the sentence "`filmDate` must match `/^\d{4}-\d{2}-\d{2}$/` or `validateStudy` nulls it with a warning."
2. In the module list: after the `data/labels.js` line add
   ```
     data/timepoints.js              (2026-09-07) pure: timepoint and view vocabularies, token normalisation, §7.2 sort order,
                                     parseFilmDate, the drawer's suggestion lists
     data/seeding.js                 (2026-09-07) pure: folder segments, §8.1 inference from folders and stems, folderRows for the
                                     Workspace card's table, seedFields for the §8.3 precedence
   ```
   change the `screens/workspace.js` lines to
   ```
     screens/workspace.js            exports render(state), loadWorkspaceStudies(state) → {…, seeding} (2026-09-07),
                                     workspaceLoadedMessage({added, known, updated, join, mapping, seeding}) (plan 06; §8.4 clauses 2026-09-07);
                                     the folder table (§8.5) and fixed chips for structural columns
   ```
   and the `components/clinical-data.js` line to
   ```
     components/clinical-data.js     drawer; exports mountClinicalData(host) → {update}, importRowFor (plan 06) — rows from
                                     visibleStudies(state), [open] until plan 07; a Study group of four cells (2026-09-07, spec §9)
   ```
3. In the `data/csv.js` block: change the `toCsv` line's comment to begin `// → string   (2026-09-07) Study ID,View,Subject,Timepoint,Film date, then the measurement columns, then the clinical union;`; change `joinClinical`'s return to `{joinHeader, byFile, rowByFile, matched, unmatched, duplicates, ambiguous}` with `(rowByFile: the matched raw row, 2026-09-07)`; add after `clinicalFieldNames`:
   ```js
   export function findStructuralHeaders(headers)   // (2026-09-07, spec §8.2) → {subjectId, timepoint, filmDate, view}: header names or null
   export function structuralField(header, headers) // → the field a header supplies, or null
   export function structuralFromRow(row, structural)   // → {subjectId, timepoint, filmDate, view, badDate}
   export const STRUCTURAL_LABELS                   // {subjectId: 'Subject', …} for the mapping card's fixed chips
   ```
   and add a paragraph after the `autoMap` paragraph: "`autoMap` never claims a structural header (`subject_id`/`subject`, `timepoint`/`time_point`/`visit`, `study_date`/`film_date`, `view`/`position`, by normalised name, first header wins; a bare `date` is not recognised); the mapping card shows those and the join key as fixed chips."

- [ ] **Step 2: Roadmap**

In `docs/ROADMAP.md`:

1. Item 1, "Decisions to make first", first bullet: append to option (c): ` **2026-09-07:** the record now carries \`subjectId\` and \`timepoint\` (pre-op/post-op spec task 2), which is the stable external identity for analysis; whether the import should join on them is still this decision.`
2. Item 5, append two bullets:
   ```markdown
   - **The folder table on the Workspace card has no collapsed form.** A layout with one folder per
     subject gives one row per subject; the rows scroll inside the card and the column-header `Set all…`
     sets a whole column, which is workable. If it proves not to be, spec §16's escalation is to collapse
     rows whose inferred values are identical into one summary row with an expand control — never to hide
     the table, because its point is that every assignment was on screen before Load.
   - **A film loaded before 2026-09-07 keeps `Standing lateral` for ever under the fill-blanks rule**
     (HANDOFF decision 32): `view` is never blank, so a later Load cannot correct it, and the drawer is the
     only path — one film at a time. A bulk relabel (select rows on the Parameters grid, set a view) would
     close this; it needs a decision on whether Load may overwrite a value the app itself hard-coded.
   ```

- [ ] **Step 3: Handoff**

In `docs/superpowers/HANDOFF.md`:

1. Header: change `**This copy is on:**` to name `claude/preop-postop-study-fields` (task 2 of the pre-op/post-op spec, code and docs; branched 2026-09-07 off the studies tip `76e86b7`; merge back is the user's call) and keep the worktree path.
2. Under `## Where things stand`, insert BEFORE `### Parameters tab — task 1 …`:

```markdown
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
  view, subject substring and paired-only (`with` a post label, default Post-op, evaluated before the
  timepoint filter), sorts by subject (no subject last in both directions; a block always reads Pre-op
  first) with a rule between blocks; `toCsv` writes `Subject,Timepoint,Film date` after `View`.
- The dev build's demo pair: SP-0042 (Pre-op) and SP-0039 (Post-op) are subject `P-8841`; SP-0039's
  patient fields were rewritten to match.
- Verified: unit 378/378; `smoke-parameters.mjs` 46/46; `smoke-seeding.mjs` 36/36;
  `smoke-workspace.mjs` 100/100. Tasks 6, 7 and 9 were verified by the user; the outcomes are in
  those commits' bodies.
- Not built here, by design: the paired export (§11.2, task 4) and compare-with-pre-op (§12, task 3,
  after plan 07).

**Traps:** `list` is a read-only accessor on `HTMLInputElement`, so it must never be an `el()` prop —
`setAttribute('list', …)` after construction (the `style` trap's sibling). The drawer's group row
carries `clinical-grid-group`, not `clinical-grid-head`; a smoke reader that filters rows by the
head class alone counts it as a data row.
```

3. Append to `## Decisions already made`:

```markdown
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
```

4. Append to `## Known traps`, after the first bullet:
   ```markdown
   - **`list` is a read-only accessor on `HTMLInputElement`** (it returns the bound datalist), so
     `el('input', { list: 'x' })` throws in strict mode the way `style` does. `setAttribute('list', …)`
     after construction. (2026-09-07, the drawer's Study group.)
   ```

- [ ] **Step 4: Spec**

In the spec:

1. §7.4: append to the paragraph ending "so the dev build demonstrates pairing without a fixture.": ` **Done 2026-09-07 as SP-0042 (Pre-op) and SP-0039 (Post-op), subject \`P-8841\`; SP-0039's patient fields were rewritten to match (user decision).**`
2. §8.4: change the first clause to `· subject, timepoint or view read from folder or file names for N films` and add after the list: `The "or file names" wording was added at implementation (2026-09-07): a flat folder seeds every subject from the film's own stem.`
3. §9: append a paragraph: `**Implemented 2026-09-07:** the chips are native \`<datalist>\` suggestions on the Timepoint and View cells (user decision); a typed timepoint that names a known label is stored as that label, so it pairs; a cleared View cell stores \`''\` (the store requires a string) and renders as a dash; Import from CSV also writes the four fields from the row's structural columns (user decision).`
4. §15: change the start of item 2 to `2. **Subject, timepoint, film date and view** — DONE (plan \`2026-09-07-study-fields.md\`):`.

- [ ] **Step 5: README**

In `README.md`:

1. Under `## Workspace`, after the **Choose folder…** bullet, add:
   ```markdown
   - After a scan, card 01 lists every folder that holds films with the **timepoint** and **view** the
     load will assign to the films in it — read off folder names such as `pre-op`, `post-op`, `6wk`,
     `flexion` or `prone`, else `none` and `Standing lateral` — and lets you change any row, or a whole
     column with **Set all…**, before pressing Load. A film's own name is more specific than its folder
     (`S001_preop_flexion.png` sets both), and the first folder below the root that names neither a
     timepoint nor a view is the film's **subject** (`pre-op/S001.png` and `S001/post-op.png` both read
     `S001`). Nothing overwrites a value a film already has; the study's drawer does that.
   ```
   In the **Choose CSV…** bullet, append: `Four columns are read as study details rather than clinical fields: \`subject_id\` (or \`subject\`), \`timepoint\` (or \`visit\`), \`film_date\` (or \`study_date\`; \`YYYY-MM-DD\` or \`M/D/YYYY\` — a bare \`date\` column is not read), and \`view\` (or \`position\`). They beat what the folder names say.`
   In the **Load workspace** bullet, append: `The message also says how many films had a subject, timepoint or view read from folder or file names or set from the CSV, how many still have no subject or no timepoint, and how many film dates could not be read.`
   After the Clinical data drawer bullet, add:
   ```markdown
   - The drawer's **Study** group holds each film's **Subject**, **Timepoint**, **Film date** and
     **View**. Subject is a study code, not a name and not a medical record number — the library is not
     a place for identifiers, and nothing you type there is checked. Timepoint and View suggest the
     labels the app knows (`Pre-op`, `Intra-op`, `Post-op`, `6 wk`, `1 yr`, `2 yr`; the five lateral
     positions); anything else is kept as typed. **Import from CSV** also brings these four in when the
     CSV has the columns.
   ```
2. Under `## Parameters tab`: change the first paragraph's list to begin `measurements in one grid — subject, timepoint, view and film date, then PI, PT, SS, …`; in the first bullet, after `by folder within it,` insert `by timepoint (including films with none), by view, by a subject substring, and **Paired only** (subjects with both a Pre-op film and the chosen post-side label, Post-op by default),`; append to that bullet: `Sorting by **Subject** groups each subject's films, Pre-op first, with a rule between subjects.`; change the header line in the last bullet to `` `Study ID,View,Subject,Timepoint,Film date,LL L1-S1,PI,PT,SS,PI-LL Mismatch,L1PA,LL L2-S1,LL L3-S1,LL L4-S1,LL L5-S1` ``.

- [ ] **Step 6: Final verification and commit**

Run: `node --test test/*.test.js` — Expected: 378/378, unchanged since Task 8. If the real figure differs, write the real one into the HANDOFF section and the smoke README's baseline paragraph.

```bash
git add docs/superpowers/plans/2026-08-31-00-architecture-contract.md docs/ROADMAP.md docs/superpowers/HANDOFF.md docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md README.md
git commit -m "docs: record the study fields in the contract, roadmap, handoff, spec and README

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Then push the branch to `fork` as a backup (it publishes nothing — the preview workflows fire only on `ui-redesign-cw`):

```bash
git push fork claude/preop-postop-study-fields
```

---

## Self-review against the spec

- §7.1 fields → Task 3; §7.2 vocabulary and order → Task 1; §7.3 views → Task 1; §7.4 validation and the demo pair → Task 3.
- §8.1 layout rules → Task 2 (every table row pinned); §8.2 CSV columns → Task 4; §8.3 precedence → Task 2's `seedFields`, applied in Task 5; §8.4 clauses → Task 5; §8.5 folder table → Tasks 2 (`folderRows`), 5 (`wsFolderRows`, the fallback), 6 (the card).
- §9 editing → Task 7 (datalists per the user's decision; deferred commits; new `studies` reference).
- §10.2 columns → Task 9; §10.3 filters and subject sort with the block rule → Tasks 8 and 9; the search box already applies (task 1) and now covers the new fields (Task 3).
- §11.1 columns → Task 3.
- §14 testing: `seeding.js` and `timepoints.js` suites (Tasks 1–2); `csv.js` structural cases (Task 4); `persistence.js` (Task 3); the filter/sort functions (Task 8); `workspaceLoadedMessage` clauses (Task 5); the smoke fixture with `pre-op/` and `post-op/`, the load message, grid counts under each filter, the export header and first row, a row changed to `Extension lateral` before Load read back from the store (Task 10). The compare badge is task 3 of the spec, not here.
- §16 PHI sentence in the README → Task 11.
- Not in this plan by design: §11.2, §11.3's paired wording, §12.

Type consistency checked: `seedFields` returns `{fields, sources}` (Tasks 2, 5); `structuralFromRow` returns `{subjectId, timepoint, filmDate, view, badDate}` (Tasks 4, 5, 7); `joinClinical().rowByFile` (Tasks 4, 5, 7); `importRowFor` returns `{ok, values, fields, badDate}` (Task 7 and its tests); `loadWorkspaceStudies().seeding` and `workspaceLoadedMessage({…, seeding})` (Tasks 5, 10's toast); `DEFAULT_FILTERS` keys (Tasks 8, 9, 10's `RESET`); `subjectBreaks(visible, sort)` (Tasks 8, 9).

## Ledger

This section travels with the repo. Append a session-end line at every wrap; record every decision
made in chat as `Ruling: <what> — <why> — <cost if wrong>`.

Session 2026-09-07 (planning): the four user decisions and the planner rulings are in "Rulings made
while planning" above; HANDOFF decisions 40–44 (Task 11) carry the user's four. Execution method:
subagent-driven, a fresh subagent per task with two-stage review; Sonnet for Tasks 1, 2, 3, 4, 5, 8,
10, 11, Opus for Tasks 6, 7, 9; never Fable. The three DOM tasks commit before their human gate with
a pending line and are amended after; the ledger stays uncommitted during a gate; each DOM
implementer dry-runs the manual checks over the CDP harness first, every suite in the foreground
with output captured to a file.

Session ended 2026-09-07 (planning): resume at **Task 1** (nothing implemented; unit 333/333 at the
wrap; branch `claude/preop-postop-study-fields` at `76e86b7` plus this plan's commit).

Execution record (2026-09-07, subagent-driven; the scratch ledger `.superpowers/sdd/2026-09-07-study-fields/progress.md`
holds the per-task detail, these lines are the durable copy). Rulings, in order:

- Ruling: Task 3's `newStudy` writes `view: DEFAULT_VIEW` (imported from data/timepoints.js) instead of the literal,
  so the default view has one source of truth — cost if wrong: one import line.
- Ruling: Task 2's test expectations for `sources.view` are `'row'`, not `'default'`, in the `fresh` and
  `folderSubject` cases — with no row given, `seedFields` derives the row as `folderRows` does (view defaulting to
  Standing lateral), so a defaulted view reports `'row'`; `'default'` fires only for a row object carrying no view.
  The module stands as written — cost if wrong: one label no UI reads.
- Ruling: `loadWorkspaceStudies` returns `clinicalUpdated` beside `updated`, and `workspaceLoadedMessage` gates its
  honesty clause on it, reworded "no blank clinical fields to fill" — folding study-field fills into `updated` let the
  first Load over a library that predates the fields claim "clinical data linked" while writing no clinical data
  (Task 5's review) — cost if wrong: one counter, four test strings, one smoke constant.
- Ruling: the two bare `.workspace-card-note` selectors in smoke-workspace.mjs are scoped to
  `.workspace-card-stack .workspace-card-note` in Task 7 (the folder table's note carries the class too) — cost if
  wrong: none.
- Ruling: the drawer's study cells write the STORED form back onto the node after the deferred commit, from both
  commit paths (`commitStudyCell`) — `setStudyField` pre-arms the rebuild gate, so a typed `postop` stayed on
  screen while the record held Post-op (Task 7's dry run and review) — cost if wrong: one helper.
- Ruling: the contract's `paramSort` domain comment gains `'subject'` in Task 9; a stale `pairedWith` stays
  displayed (the select appends the stored label) rather than being reset — cost if wrong: an empty grid until the
  user re-picks.
- Ruling (user, at the Task 9 gate): the `with` dropdown gains `All paired` (`ANY_POST`, `'__any__'`) as its first
  entry and default — a subject pairs when it has a Pre-op film and at least one other labelled film; a specific
  label narrows; a film with no timepoint never pairs. Spec §10.3's "default Post-op" is amended — cost if wrong:
  one default string.
- Fix rounds: Task 5 (1, the `clinicalUpdated` gate), Task 7 (1, the write-back on the blur path), the All-paired
  change (1, two edge-case tests). Every other task reviewed clean first time. Deferred minors are in the scratch
  ledger and were triaged by the final whole-branch review.

Session ended 2026-09-07: Tasks 1–11 complete; three human gates passed on the user's machine (outcomes in the
commits' bodies); unit 379/379; `smoke-parameters.mjs` 46/46; `smoke-seeding.mjs` 36/36; `smoke-workspace.mjs`
100/100. Resume at: the final whole-branch review's residuals if any, then the merge back into
`claude/studies-ui-updates-bb040d` at the user's say-so, then spec task 3 or 4.
