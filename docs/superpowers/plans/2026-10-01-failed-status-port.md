# Failed Status on 1.0.13 (issue #39 follow-up) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On top of 1.0.13's Failed status, films with no result read **Unsegmented**, **Processing** means
"running or waiting in the running batch", Failed is its own red with a dated tooltip, the Analysis screen names the
reason, and the stored reason is a plain sentence.

**Architecture:** Status stays derived. `deriveStatus` returns `unseg` instead of `proc` for a film with no result
and no failure; `displayStatus` becomes the only source of `proc`, for the running film and, given `state.batch`,
every film still waiting in a running batch. One new optional field, `processingErrorAt`, sits beside 1.0.13's
`processingError` and is written and cleared with it. A new pure module, `renderer/data/failure.js`, owns the stored
reason text and the tooltip. Every surface that shows a status (row pill, summary, sort, Analysis header, region
note, stage card) reads those.

**Tech Stack:** Electron, vanilla ES modules (no bundler, no framework, no runtime dependencies), `node --test` unit
tests, CDP smoke suites in `tools/smoke/` against the real app and the Python/ONNX backend.

**Spec:** `docs/superpowers/specs/2026-10-01-failed-status-port-design.md` (commit `85b9d54`), "the spec" below; its
sections are cited as "spec §N". The plan argues from it; read both. Where they differ, the spec wins.

**Branch:** `claude/issue-39-failed-status-port`, off `main` @ `9992b99` (v1.0.13), in the main checkout
`C:\Users\codyj\Spine Contour Desktop\Spine-Contour`. Remote `origin` is `github.com/Feches/Spine-Contour`. Nothing is
pushed and no PR is opened until the user says so. The older branch `claude/issue-39-failed-status` is a reference
only; never merge it, rebase onto it or cherry-pick from it.

**Verified:** every code block in Tasks 1–6 was applied, in order, to a clean throwaway worktree of this branch,
and the unit suite was run after each task; the totals stated in each task are the ones printed. Task 7's patch was
extracted from this plan with its own Step 1 command and applied on top of Tasks 1–6 there. Its suites first run
against the app in Task 8.

## Global Constraints

- Never display a fabricated measurement or a fabricated status (CLAUDE.md). An unrecognised status key renders `—`
  (U+2014), never `Processing`.
- No new dependencies: `package.json` `dependencies` stays empty; `devDependencies` stays exactly `electron` and
  `electron-builder`.
- `renderer/` is browser code and cannot import `node:` specifiers. Do not loosen the CSP in `index.html`.
- Never mutate store records in place; every write replaces the record (`{ ...s, … }`) and the array.
- Status labels, verbatim: `Processing`, `Unsegmented`, `Failed`, `Segmented`, `Needs review`, `Reviewed`.
- Sort rank, verbatim: `fail 0 · proc 1 · unseg 2 · rev 3 · seg 4 · ok 5`.
- Summary line, verbatim: `{n} STUDIES · {u} UNSEGMENTED · {r} TO REVIEW`; UNSEGMENTED counts `unseg`, `proc` and
  `fail`. In source the separator after STUDIES stays a literal middle dot and the one after UNSEGMENTED stays the
  six-character escape `\u00B7` (HANDOFF's glyph trap). No FAILED clause.
- Tooltip, verbatim: `Segmentation failed · Oct 1, 2026`, a newline, the reason; just `Segmentation failed`, a
  newline, the reason when there is no parseable time.
- Region note, verbatim: `Last run failed: {reason}`. Stage card, verbatim: eyebrow `FAILED`, title
  `Segmentation failed`, body the reason, button `Run segmentation`.
- Stored reasons: spec §5's table, first match wins; capped at 500 characters, the ellipsis included. Toasts and
  every outcome's `reason` keep the raw message.
- `--danger`: `#B42318` light, `#F07167` dark.
- Persistence warning, verbatim: `persistence: ${entry.id} has a malformed processing-error time; it is dropped.`
  No `STORE_VERSION` bump.
- Kept exactly as 1.0.13 has them (spec P6): batches include Failed films; a failed re-run over existing results
  reads Failed and blocks Mark reviewed (`REVIEW_FAILED`); a refusal before a run is recorded; a relocate does not
  clear a failure; the two clearing sites are a successful run and `changeRegion`.
- Unit tests: `node --test test/*.test.js` (the glob form; `node --test test/` fails on Node 24). Baseline on this
  branch: 587/587.
- Commits: conventional prefixes (`feat:`, `fix:`, `test:`, `docs:`), one per task, every message ending with a
  blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Real-film validation uses a scratch profile under `%TEMP%`, copies of the films, and DOM/state reads only: never
  view or send a screenshot that shows a radiograph (user rule 2026-09-30).

## Execution Notes (read before Task 1)

Each task repeats the notes it needs, because an implementer sees only its own task.

- **Glyph trap.** The Edit and Write tools decode a six-character escape such as `\u2014` into the glyph `—`,
  in `new_string` and in `old_string`. Both forms are equal at runtime, so no test notices; only the bytes do. Where
  a code block in this plan shows such an escape, type it in the tool call with `@@u` in place of the backslash and
  `u` (so `\u2014` is typed `@@u2014`), then run this fixer on the file, which turns every `@@u` into a backslash
  and `u`:
  ```bash
  python -c "import sys;B=chr(92);[open(p,'w',encoding='utf-8',newline='').write(s.replace('@@'+'u',B+'u')) for p in sys.argv[1:] for s in [open(p,encoding='utf-8',newline='').read()]]" FILE
  ```
  No `old_string` in this plan contains an escape; the edits are anchored so they never need one.
- **Scratch folder.** `tools/smoke/out/` is gitignored and exists in this checkout; if it does not, create it
  (`mkdir -p tools/smoke/out`) before a step writes there.
- **Line endings.** The checkout has `core.autocrlf=true`, so working files are CRLF. The Edit tool copes. A file
  the Write tool creates is LF; git normalises it on commit, so that is fine.
- **Shell.** If the shell refuses a heredoc or a compound command, save the script or message as a file and run it
  (`git commit -F <file>`). Put scratch files under the gitignored `tools/smoke/out/` and delete them afterwards.
  Git Bash mangles backslashes in `node -e '…'`; the fixer above has none.
- **Interim states.** After Task 2 the statuses are new but the Unsegmented pill has no CSS until Task 4 and the
  Analysis header ignores the batch until Task 5; after Task 4 the smoke suites' old expectations fail until Task 7.
  Do not run the app or the smoke suites before Task 8.
- **Unit totals.** Each task states the full-suite total it expects after itself. If one unrelated test fails, rerun
  once before investigating; one pre-existing test is timing-sensitive.
- **Line numbers** in the Files lists are from the branch before any task ran; earlier tasks shift them. Match the
  quoted old text, not the numbers.

## Review Focus

The five inputs a person will meet that the spec implies but its own test list does not spell out, most likely
first. Each is pinned by a test in its owning task.

1. **The backend dies mid-batch.** Every remaining film fails in seconds with raw socket text
   (`connect ECONNREFUSED 127.0.0.1:53211`). Each must be stored as
   `The processing backend stopped. Restart Spine Contour, then segment again.`, while the outcome and the toast keep
   the raw text. → Task 3, "raw socket text is stored as the backend-stopped sentence…".
2. **Stop during a batch.** The films still waiting must drop back to Unsegmented or Failed at once, while the film
   in flight stays Processing until it ends. → Task 2, "displayStatus reads Processing for every film still waiting…"
   and "by status: films waiting in a running batch sort as Processing until the batch is stopping"; Task 8 step 6f
   on real films.
3. **A library saved by 1.0.13 with a Failed film.** The record has `processingError` and no `processingErrorAt`; it
   must load without a warning, read Failed, and show a tooltip with no date. → Task 3, "validate round-trips
   processingErrorAt, loads a 1.0.13 failure…"; Task 1, `failureTitle('boom', null)`; Task 5, the legacy `badgeKey`.
4. **A Failed film retried, failing again.** The record carries the new reason and a newer time, and the Analysis
   header pill must rebuild, or its tooltip keeps the old reason. → Task 3, "a re-run that fails replaces the earlier
   reason and its time"; Task 5, "headerBadge keys a Failed pill on the failure and its time…".
5. **A batch over Failed films.** They read Processing while they wait and must not be counted twice in the summary.
   → Task 4, "summaryCounts: UNSEGMENTED counts Unsegmented, Processing and Failed…".

## Decisions this plan makes that the spec leaves open

- **D1.** The summary's counting moves into a pure `summaryCounts(studies, runningId, batch)` in
  `renderer/data/find.js`, so it is unit-tested; `screens/studies.js` calls it (spec §3 names the rule, not the place).
- **D2.** `headerBadge` and `failedRunNote` are exported from `renderer/screens/analysis.js` so the header and note
  rules are unit-tested; `test/analysis.test.js` already imports that module.
- **D3.** `processingErrorAt` that is present but not a parseable string (`12`, `''`) is dropped with the warning,
  like a string that does not parse (spec §4: "a non-null value that fails either test").
- **D4.** The header's rebuild key is `${status}|${processingErrorAt ?? ''}|${processingError ?? ''}` for every
  status except Unsupported view, which keeps 1.0.13's `unsupported:${view}`.
- **D5.** `segmentStudy`'s catch still reads `error.message` before clearing `running`, as 1.0.13 does; hardening it
  is out of scope (every error that reaches it is an `Error`).
- **D6.** Task 8's real-film check takes no screenshots at all, not even of the Find list; DOM and store reads only.

## File Map

| File | Task | Responsibility |
|---|---|---|
| `renderer/data/failure.js` (new), `test/failure.test.js` (new) | 1 | Stored reason text; the tooltip |
| `renderer/data/status.js`, `renderer/data/find.js`, `test/status.test.js`, `test/find.test.js` | 2 | `unseg`; batch-aware `displayStatus`; labels; rank; sort |
| `renderer/data/persistence.js`, `renderer/screens/studies.js` (`newStudy`), `renderer/screens/analysis.js` (`withProcessingFailure`, two clears), `test/persistence.test.js`, `test/failure-run.test.js` (new) | 3 | `processingErrorAt`; the reason rewrite at every write |
| `renderer/components/status-badge.js`, `styles/tokens.css`, `styles/components.css`, `renderer/data/find.js` (`summaryCounts`), `renderer/screens/studies.js`, `renderer/screens/analysis.js` (one call), `renderer/screens/workspace.js`, `README.md`, `renderer/data/confidence.js`, `test/find.test.js` | 4 | Red Failed and hollow Unsegmented pills, the tooltip, the batch on the list, the summary, the hint |
| `renderer/screens/analysis.js`, `renderer/components/viewer.js`, `styles/screens/analysis.css`, `test/analysis.test.js` | 5 | Header pill, region note, FAILED card |
| `docs/superpowers/plans/2026-08-31-00-architecture-contract.md`, `CHANGELOG.md` | 6 | Dated amendment; Unreleased entry |
| `tools/smoke/*.mjs`, `tools/smoke/README.md` | 7 | The suites follow the new statuses |
| `tools/smoke/README.md`, this plan's Ledger | 8 | Recorded counts; the verification record |

---

### Task 1: The stored reason and the tooltip — `renderer/data/failure.js`

**Files:**
- Create: `renderer/data/failure.js`
- Create: `test/failure.test.js`

**Interfaces:**
- Consumes: nothing. The module imports nothing.
- Produces (later tasks import these exact names):
  - `REASON_LIMIT` (`500`), `NO_REASON`, `FILE_NOT_FOUND_REASON`, `CONNECTION_ENDED_REASON`, `BACKEND_STOPPED_REASON`,
    `UNREADABLE_RESPONSE_REASON` — strings, verbatim from spec §5;
  - `capReason(text) → string` — trimmed, at most 500 characters with the ellipsis;
  - `failureReason(message) → string` — the text stored as `processingError` (Task 3);
  - `failureTitle(reason, at) → string` — the Failed pill's tooltip (Tasks 4 and 5).

**Glyph-safe writing (this task).** Both files hold six-character escapes (`\u2026`, `\u00B7`) and no
literal non-ASCII character. Type each escape as `@@u2026` / `@@u00B7` in the Write call, then run the fixer named in
the step.

- [ ] **Step 1: Write the failing test**

Create `test/failure.test.js` with exactly this content (escapes typed as `@@u…`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REASON_LIMIT, NO_REASON, FILE_NOT_FOUND_REASON, CONNECTION_ENDED_REASON, BACKEND_STOPPED_REASON,
  UNREADABLE_RESPONSE_REASON, capReason, failureReason, failureTitle,
} from '../renderer/data/failure.js';

// (2026-10-01, issue #39) docs/superpowers/specs/2026-10-01-failed-status-port-design.md section 5.
const AT = '2026-10-01T12:00:00.000Z';

test('failureReason stores backend sentences verbatim, trimmed', () => {
  const detection = 'Automatic film detection was inconclusive. Choose cervical, lumbar or standing / full spine manually.';
  assert.equal(failureReason(detection), detection);
  assert.equal(failureReason(`  ${detection}\n`), detection);
  assert.equal(failureReason('Detected a cervical film. Choose anterior left or right, then segment again.'),
    'Detected a cervical film. Choose anterior left or right, then segment again.');
  assert.equal(failureReason('intentional transport stop'), 'intentional transport stop');
});

test('failureReason: a blank or non-string message has a fixed reason', () => {
  for (const message of ['', '   ', null, undefined, 42, {}]) assert.equal(failureReason(message), NO_REASON, String(message));
  assert.equal(NO_REASON, 'Segmentation failed without a reason.');
});

test('failureReason: a file-read error is never rewritten, even when it carries a socket code', () => {
  const share = 'Could not read x.png: ECONNRESET: connection reset by peer, read';
  assert.equal(failureReason(share), share);
  assert.equal(failureReason('Could not read x.png: ETIMEDOUT: connection timed out, read'),
    'Could not read x.png: ETIMEDOUT: connection timed out, read');
});

test('failureReason rewrites the terse file-not-found outcome', () => {
  assert.equal(failureReason('file not found'), FILE_NOT_FOUND_REASON);
  assert.equal(FILE_NOT_FOUND_REASON,
    'The film was not found at its saved location. Run segmentation from its Analysis screen to choose its new location.');
});

test('failureReason: exactly "aborted" is a connection that ended early; a message merely containing it is not', () => {
  assert.equal(failureReason('aborted'), CONNECTION_ENDED_REASON);
  assert.equal(CONNECTION_ENDED_REASON, 'Processing connection ended before a result was received.');
  assert.equal(failureReason('The run was aborted by the detector'), 'The run was aborted by the detector');
});

test('failureReason rewrites raw socket text to the backend-stopped sentence', () => {
  for (const message of ['connect ECONNREFUSED 127.0.0.1:53211', 'read ECONNRESET', 'write EPIPE', 'connect ETIMEDOUT 127.0.0.1:1', 'socket hang up']) {
    assert.equal(failureReason(message), BACKEND_STOPPED_REASON, message);
  }
  assert.equal(BACKEND_STOPPED_REASON, 'The processing backend stopped. Restart Spine Contour, then segment again.');
});

test('failureReason rewrites a non-JSON reply', () => {
  assert.equal(failureReason('Unexpected token \'I\', "Internal S"... is not valid JSON'), UNREADABLE_RESPONSE_REASON);
  assert.equal(failureReason('Unexpected end of JSON input'), UNREADABLE_RESPONSE_REASON);
  assert.equal(UNREADABLE_RESPONSE_REASON,
    'The processing backend returned an unreadable response. Restart Spine Contour, then segment again.');
});

test('capReason: at most 500 characters, the ellipsis included', () => {
  assert.equal(REASON_LIMIT, 500);
  const capped = failureReason('x'.repeat(600));
  assert.equal(capped.length, 500);
  assert.ok(capped.endsWith('\u2026'));
  assert.equal(capped.slice(0, 499), 'x'.repeat(499));
  assert.equal(capReason('y'.repeat(500)), 'y'.repeat(500));
  assert.equal(capReason('  short  '), 'short');
  assert.equal(failureReason(`Could not read ${'z'.repeat(600)}`).length, 500);
});

test('failureTitle: the date line, a newline, the reason; no guessed date', () => {
  // Noon UTC so the local date is the 1st in every zone the app is tested in.
  assert.equal(failureTitle('boom', AT), 'Segmentation failed \u00B7 Oct 1, 2026\nboom');
  assert.equal(failureTitle('boom', 'not a date'), 'Segmentation failed\nboom');
  // A failure recorded by 1.0.13 has no time.
  assert.equal(failureTitle('boom', null), 'Segmentation failed\nboom');
  assert.equal(failureTitle('boom', undefined), 'Segmentation failed\nboom');
  assert.equal(failureTitle('boom', 12), 'Segmentation failed\nboom');
  assert.equal(failureTitle('', AT), `Segmentation failed \u00B7 Oct 1, 2026\n${NO_REASON}`);
  assert.equal(failureTitle(null, null), `Segmentation failed\n${NO_REASON}`);
});

// A reason that spans lines (a library ValueError, say) keeps its line breaks in the stored text and
// in the tooltip, and the cap still applies to it.
test('a multi-line reason keeps its line breaks in the stored text and the tooltip', () => {
  const message = 'Model output malformed' + '\n' + 'Expected 23 finite cervical landmarks';
  assert.equal(failureReason(message), message);
  assert.equal(failureTitle(message, AT), `Segmentation failed \u00B7 Oct 1, 2026\n${message}`);
  assert.equal(failureReason(`${message}\n${'q'.repeat(600)}`).length, 500);
});
```

Then run the fixer:
```bash
python -c "import sys;B=chr(92);[open(p,'w',encoding='utf-8',newline='').write(s.replace('@@'+'u',B+'u')) for p in sys.argv[1:] for s in [open(p,encoding='utf-8',newline='').read()]]" test/failure.test.js
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/failure.test.js`
Expected: FAIL — `Cannot find module` … `renderer/data/failure.js`.

- [ ] **Step 3: Write the module**

Create `renderer/data/failure.js` with exactly this content (escapes typed as `@@u…`):

```js
/**
 * The text of a failed segmentation attempt (issue #39;
 * docs/superpowers/specs/2026-10-01-failed-status-port-design.md, "the spec" below). Pure, no DOM.
 * screens/analysis.js stores `processingError: failureReason(message)` with `processingErrorAt`, an
 * ISO time; the Failed pill's tooltip is failureTitle(processingError, processingErrorAt).
 * test/failure.test.js pins it.
 */

// Spec 5: at most this many characters, the ellipsis included.
export const REASON_LIMIT = 500;
const ELLIPSIS = '\u2026';

export const NO_REASON = 'Segmentation failed without a reason.';
export const FILE_NOT_FOUND_REASON = 'The film was not found at its saved location. Run segmentation from its Analysis screen to choose its new location.';
export const CONNECTION_ENDED_REASON = 'Processing connection ended before a result was received.';
export const BACKEND_STOPPED_REASON = 'The processing backend stopped. Restart Spine Contour, then segment again.';
export const UNREADABLE_RESPONSE_REASON = 'The processing backend returned an unreadable response. Restart Spine Contour, then segment again.';

// Raw Node socket text from backend-client.cjs. The error code sits inside the message.
const SOCKET_TEXT = /ECONNREFUSED|ECONNRESET|EPIPE|ETIMEDOUT|socket hang up/;

export function capReason(text) {
  const trimmed = String(text).trim();
  return trimmed.length > REASON_LIMIT ? `${trimmed.slice(0, REASON_LIMIT - 1)}${ELLIPSIS}` : trimmed;
}

// The text stored for a failed attempt (spec 5). Rows in order, first match wins. Backend sentences
// and file-read errors are kept as they are; only transport and parser text, which says nothing to a
// clinician, is rewritten. Toasts and the batch's closing toast keep the raw message.
export function failureReason(message) {
  if (typeof message !== 'string' || message.trim() === '') return NO_REASON;
  const text = message.trim();
  // A file-system error from main's read-file, never from the backend client: a film on a network
  // share can fail with ETIMEDOUT, and "the backend stopped" would be a fabricated cause.
  if (text.startsWith('Could not read ')) return capReason(text);
  if (text === 'file not found') return FILE_NOT_FOUND_REASON;
  // Node's message when /predict-stream closes after the headers and before a result or error line;
  // the ECONNRESET code is on .code, which api.js does not carry across IPC.
  if (text === 'aborted') return CONNECTION_ENDED_REASON;
  if (SOCKET_TEXT.test(text)) return BACKEND_STOPPED_REASON;
  if (text.endsWith('is not valid JSON') || text === 'Unexpected end of JSON input') return UNREADABLE_RESPONSE_REASON;
  return capReason(text);
}

const failedDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// The Failed pill's native tooltip (spec 5): a date line, a newline, the reason. A `title`
// attribute renders the newline as a line break. The date is reviewedLabel's format and is never
// guessed: a failure 1.0.13 recorded has no time, and an unparseable `at` leaves just
// "Segmentation failed".
export function failureTitle(reason, at) {
  const time = Date.parse(typeof at === 'string' ? at : '');
  const head = Number.isNaN(time) ? 'Segmentation failed' : `Segmentation failed \u00B7 ${failedDate.format(new Date(time))}`;
  const text = typeof reason === 'string' && reason.trim() !== '' ? reason.trim() : NO_REASON;
  return `${head}\n${text}`;
}
```

Then run the fixer:
```bash
python -c "import sys;B=chr(92);[open(p,'w',encoding='utf-8',newline='').write(s.replace('@@'+'u',B+'u')) for p in sys.argv[1:] for s in [open(p,encoding='utf-8',newline='').read()]]" renderer/data/failure.js
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/failure.test.js`
Expected: `ℹ tests 10`, `ℹ pass 10`, `ℹ fail 0`.

Run: `node --test test/*.test.js`
Expected: `ℹ tests 597`, `ℹ pass 597`, `ℹ fail 0`.

- [ ] **Step 5: Byte check**

```bash
python -c "import sys;B=chr(92);[print(p, 'escapes', open(p,encoding='utf-8').read().count(B+'u'), 'sentinels', open(p,encoding='utf-8').read().count('@@'+'u'), 'glyphs', [hex(ord(c)) for c in open(p,encoding='utf-8').read() if ord(c)>127]) for p in sys.argv[1:]]" renderer/data/failure.js test/failure.test.js
```
Expected: `renderer/data/failure.js escapes 2 sentinels 0 glyphs []` and `test/failure.test.js escapes 4 sentinels 0 glyphs []`.

- [ ] **Step 6: Commit**

```bash
git add renderer/data/failure.js test/failure.test.js
git commit -m "feat: plain-English failure reasons and a dated Failed tooltip (issue #39)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Unsegmented, and Processing for the batch — `status.js` and `find.js`

**Files:**
- Modify: `renderer/data/status.js` (header comment, imports, `deriveStatus`, `displayStatus`, `statusLabel`; lines 1–109)
- Modify: `renderer/data/find.js` (`STATUS_RANK`, `sortValue`, `sortFindRows`; lines 19–61)
- Test: `test/status.test.js`, `test/find.test.js`

**Interfaces:**
- Consumes: `isQueued(batch, studyId) → boolean` from `renderer/data/batch.js` (exists: true from the film whose turn
  is starting to the last; false for a null batch). `renderer/data/batch.js` does not import `status.js`, so there is
  no import cycle.
- Produces:
  - `deriveStatus(study) → 'fail'|'unseg'|'ok'|'rev'|'seg'` (never `'proc'`);
  - `displayStatus(study, runningId = null, batch = null) → 'proc'|'fail'|'unseg'|'ok'|'rev'|'seg'` — `batch` is
    `state.batch`; Tasks 4 and 5 pass it;
  - `statusLabel(status)` — six labels, `'\u2014'` otherwise;
  - `sortFindRows(studies, sort, runningId = null, batch = null)` — Task 4 passes `live.batch`;
  - `statusRank` over `{ fail: 0, proc: 1, unseg: 2, rev: 3, seg: 4, ok: 5 }`.

**Glyph-safe editing (this task).** Two `new_string`s below contain `\u2014`: type it as `@@u2014`, then run
the fixer in Step 4. No `old_string` contains an escape.

- [ ] **Step 1: Write the failing tests**

In `test/status.test.js`:

Edit 1 of 4 — replace:

```js
test('deriveStatus returns proc when the study itself is null or undefined', () => {
  assert.equal(deriveStatus(null), 'proc');
  assert.equal(deriveStatus(undefined), 'proc');
});

test('deriveStatus returns proc when measurements is null', () => {
  const study = { measurements: null, qc: null };
  assert.equal(deriveStatus(study), 'proc');
});
```

with:

```js
test('deriveStatus returns unseg when the study itself is null or undefined', () => {
  assert.equal(deriveStatus(null), 'unseg');
  assert.equal(deriveStatus(undefined), 'unseg');
});

test('deriveStatus returns unseg when measurements is null and no attempt failed', () => {
  assert.equal(deriveStatus({ measurements: null, qc: null }), 'unseg');
  assert.equal(deriveStatus({ measurements: null, qc: null, processingError: null }), 'unseg');
  assert.equal(deriveStatus({ measurements: null, qc: null, processingError: '' }), 'unseg');
});
```

Edit 2 of 4 — replace:

```js
test('statusLabel maps every status to its display label', () => {
  assert.equal(statusLabel('seg'), 'Segmented');
  assert.equal(statusLabel('rev'), 'Needs review');
  assert.equal(statusLabel('proc'), 'Processing');
});
```

with:

```js
test('statusLabel maps every status to its display label and anything else to an em dash', () => {
  assert.equal(statusLabel('seg'), 'Segmented');
  assert.equal(statusLabel('rev'), 'Needs review');
  assert.equal(statusLabel('proc'), 'Processing');
  assert.equal(statusLabel('unseg'), 'Unsegmented');
  assert.equal(statusLabel('fail'), 'Failed');
  for (const key of ['nonsense', '', null, undefined]) assert.equal(statusLabel(key), '\u2014', String(key));
});
```

Edit 3 of 4 — replace:

```js
test('a review mark over no measurements is still Processing; a blank or non-string mark is no mark', () => {
  assert.equal(deriveStatus({ measurements: null, reviewedAt: MARK }), 'proc');
```

with:

```js
test('a review mark over no measurements is Unsegmented; a blank or non-string mark is no mark', () => {
  assert.equal(deriveStatus({ measurements: null, reviewedAt: MARK }), 'unseg');
```

Edit 4 of 4 — replace:

```js
  assert.equal(displayStatus(study), 'ok');
  assert.equal(displayStatus(null, null), 'proc');
});
```

with:

```js
  assert.equal(displayStatus(study), 'ok');
  assert.equal(displayStatus(null, null), 'unseg');
});

// (2026-10-01, issue #39; port spec 3) the batch half: a film waiting in a running batch reads
// Processing from the click until its own turn ends.
test('displayStatus reads Processing for every film still waiting in a running batch', () => {
  const failed = { id: 'SP-1000', measurements: null, processingError: 'Orientation is uncertain.' };
  const idle = { id: 'SP-1001', measurements: null };
  const done = { id: 'SP-1002', ...CLEAN };
  const outside = { id: 'SP-1003', measurements: null };
  const batch = { ids: ['SP-1002', 'SP-1000', 'SP-1001'], done: 1, failed: [], warnings: [], skipped: 0, stopping: false };
  // SP-1002's turn has ended: its own status. SP-1000 and SP-1001 are waiting, Failed or not.
  assert.equal(displayStatus(done, 'SP-1000', batch), 'seg');
  assert.equal(displayStatus(failed, 'SP-1000', batch), 'proc');
  assert.equal(displayStatus(idle, 'SP-1000', batch), 'proc');
  assert.equal(displayStatus(outside, 'SP-1000', batch), 'unseg');
  // The click that starts a batch: nothing has run yet and every film reads Processing.
  const started = { ...batch, done: 0 };
  assert.equal(displayStatus(done, null, started), 'proc');
  // Stopping: the film in flight stays Processing; the films that will not run read their own status.
  const stopping = { ...batch, stopping: true };
  assert.equal(displayStatus(failed, 'SP-1000', stopping), 'proc');
  assert.equal(displayStatus(idle, 'SP-1000', stopping), 'unseg');
  assert.equal(displayStatus(failed, null, stopping), 'fail');
  // No batch, or no study.
  assert.equal(displayStatus(idle, null, null), 'unseg');
  assert.equal(displayStatus(null, null, batch), 'unseg');
});
```

In `test/find.test.js`:

Edit 1 of 3 — replace:

```js
import { DEFAULT_FIND_SORT, FIND_SORT_KEYS, statusRank, toggleFindSort, sortFindRows } from '../renderer/data/find.js';
```

with:

```js
import { DEFAULT_FIND_SORT, FIND_SORT_KEYS, statusRank, toggleFindSort, sortFindRows } from '../renderer/data/find.js';
import { newBatch, withStopping } from '../renderer/data/batch.js';
```

Edit 2 of 3 — replace:

```js
test('by status: Failed, Processing, Needs review, Segmented, Reviewed; running reads Processing', () => {
```

with:

```js
test('by status: Failed, Processing, Unsegmented, Needs review, Segmented, Reviewed; running reads Processing', () => {
```

Edit 3 of 3 — replace:

```js
  assert.deepEqual(ids(sortFindRows(rows, { key: 'status', dir: 'asc' }, 'SP-1003')), ['SP-1004', 'SP-1002', 'SP-1003', 'SP-1001', 'SP-1000']);
  assert.equal(statusRank('fail'), 0);
  assert.equal(statusRank('proc'), 1);
  assert.equal(statusRank('ok'), 4);
  assert.equal(statusRank('nonsense'), null);
});
```

with:

```js
  assert.deepEqual(ids(sortFindRows(rows, { key: 'status', dir: 'asc' }, 'SP-1003')), ['SP-1004', 'SP-1003', 'SP-1002', 'SP-1001', 'SP-1000']);
  assert.equal(statusRank('fail'), 0);
  assert.equal(statusRank('proc'), 1);
  assert.equal(statusRank('unseg'), 2);
  assert.equal(statusRank('rev'), 3);
  assert.equal(statusRank('seg'), 4);
  assert.equal(statusRank('ok'), 5);
  assert.equal(statusRank('nonsense'), null);
});

// (2026-10-01, issue #39; port spec 3) the sort compares the status the row shows, batch included.
test('by status: films waiting in a running batch sort as Processing until the batch is stopping', () => {
  const rows = [study('SP-1000'), study('SP-1001'), study('SP-1002', SEG), study('SP-1003', { processingError: 'boom' })];
  const asc = { key: 'status', dir: 'asc' };
  assert.deepEqual(ids(sortFindRows(rows, asc)), ['SP-1003', 'SP-1000', 'SP-1001', 'SP-1002']);
  const batch = newBatch(['SP-1001', 'SP-1002']);
  assert.deepEqual(ids(sortFindRows(rows, asc, null, batch)), ['SP-1003', 'SP-1001', 'SP-1002', 'SP-1000']);
  assert.deepEqual(ids(sortFindRows(rows, asc, null, withStopping(batch))), ['SP-1003', 'SP-1000', 'SP-1001', 'SP-1002']);
});
```

Run the fixer on the test file that has a sentinel:
```bash
python -c "import sys;B=chr(92);[open(p,'w',encoding='utf-8',newline='').write(s.replace('@@'+'u',B+'u')) for p in sys.argv[1:] for s in [open(p,encoding='utf-8',newline='').read()]]" test/status.test.js
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/status.test.js test/find.test.js`
Expected: FAIL — `deriveStatus(null)` is `'proc'` not `'unseg'`; `statusLabel('unseg')` is `'Processing'`;
`statusRank('unseg')` is `null`; the batch tests read `'unseg'`/`'fail'` where `'proc'` is expected.

- [ ] **Step 3: Implement**

In `renderer/data/status.js`:

Edit 1 of 4 — replace:

```js
 * it: a marked study is `ok` whatever its qc says unless a later run failed.
 */
```

with:

```js
 * it: a marked study is `ok` whatever its qc says unless a later run failed. (2026-10-01, issue #39)
 * A study with no result and no failure is `unseg`; `proc` is displayStatus's alone, for the running
 * study and the films waiting in the running batch
 * (docs/superpowers/specs/2026-10-01-failed-status-port-design.md section 3).
 */
```

Edit 2 of 4 — replace:

```js
import { studyRegion } from './cervical.js';
```

with:

```js
import { studyRegion } from './cervical.js';
import { isQueued } from './batch.js';
```

Edit 3 of 4 — replace:

```js
/** @returns {'seg'|'rev'|'proc'|'ok'|'fail'} */
export function deriveStatus(study) {
  if (!study) return 'proc';
  if (study.processingError) return 'fail';
  if (study.measurements == null) return 'proc';
```

with:

```js
// First match wins (port spec 3). A failure outranks measurements and the review mark (1.0.13's
// rule); no result and no failure is Unsegmented, never Processing.
/** @returns {'fail'|'unseg'|'ok'|'rev'|'seg'} */
export function deriveStatus(study) {
  if (!study) return 'unseg';
  if (study.processingError) return 'fail';
  if (study.measurements == null) return 'unseg';
```

Edit 4 of 4 — replace:

```js
// and the Analysis header cannot disagree.
export function displayStatus(study, runningId = null) {
  return study && runningId !== null && runningId === study.id ? 'proc' : deriveStatus(study);
}

export function statusLabel(status) {
  if (status === 'fail') return 'Failed';
  if (status === 'seg') return 'Segmented';
  if (status === 'rev') return 'Needs review';
  if (status === 'ok') return 'Reviewed';
  return 'Processing';
}
```

with:

```js
// and the Analysis header cannot disagree. (2026-10-01, issue #39; port spec 3) `batch` is
// state.batch: every film still waiting in a running batch reads Processing too, from the click that
// starts it until its own turn ends; once the batch is stopping, the films that will not run read
// their own status again. This is the only source of 'proc'.
/** @returns {'proc'|'fail'|'unseg'|'ok'|'rev'|'seg'} */
export function displayStatus(study, runningId = null, batch = null) {
  if (study && runningId !== null && runningId === study.id) return 'proc';
  if (study && batch && !batch.stopping && isQueued(batch, study.id)) return 'proc';
  return deriveStatus(study);
}

// (2026-10-01, issue #39) Every key is named; anything else is an absent value, the em dash. An
// unrecognised key must never claim a run.
export function statusLabel(status) {
  if (status === 'proc') return 'Processing';
  if (status === 'unseg') return 'Unsegmented';
  if (status === 'fail') return 'Failed';
  if (status === 'seg') return 'Segmented';
  if (status === 'rev') return 'Needs review';
  if (status === 'ok') return 'Reviewed';
  return '\u2014';
}
```

In `renderer/data/find.js`:

Edit 1 of 4 — replace:

```js
// Workflow order: what still needs doing sorts first.
const STATUS_RANK = Object.freeze({ fail: 0, proc: 1, rev: 2, seg: 3, ok: 4 });
```

with:

```js
// Workflow order: what still needs doing sorts first. (2026-10-01, issue #39; port spec 3) A failure
// needs a person first, then the films running or waiting in the batch, then films nobody has run.
const STATUS_RANK = Object.freeze({ fail: 0, proc: 1, unseg: 2, rev: 3, seg: 4, ok: 5 });
```

Edit 2 of 4 — replace:

```js
function sortValue(study, key, runningId) {
```

with:

```js
function sortValue(study, key, runningId, batch) {
```

Edit 3 of 4 — replace:

```js
    case 'status': return statusRank(displayStatus(study, runningId));
```

with:

```js
    case 'status': return statusRank(displayStatus(study, runningId, batch));
```

Edit 4 of 4 — replace:

```js
// A sorted COPY. `runningId` is state.running, so the status compared is the one the row shows.
export function sortFindRows(studies, sort, runningId = null) {
  const { key, dir } = { ...DEFAULT_FIND_SORT, ...(sort ?? {}) };
  const sign = dir === 'desc' ? -1 : 1;
  const indexed = (studies ?? []).map((study, index) => ({ study, index, value: sortValue(study, key, runningId) }));
```

with:

```js
// A sorted COPY. `runningId` is state.running and `batch` is state.batch, so the status compared is
// the one the row shows.
export function sortFindRows(studies, sort, runningId = null, batch = null) {
  const { key, dir } = { ...DEFAULT_FIND_SORT, ...(sort ?? {}) };
  const sign = dir === 'desc' ? -1 : 1;
  const indexed = (studies ?? []).map((study, index) => ({ study, index, value: sortValue(study, key, runningId, batch) }));
```

- [ ] **Step 4: Fix the escape, run the tests**

```bash
python -c "import sys;B=chr(92);[open(p,'w',encoding='utf-8',newline='').write(s.replace('@@'+'u',B+'u')) for p in sys.argv[1:] for s in [open(p,encoding='utf-8',newline='').read()]]" renderer/data/status.js
```

Run: `node --test test/status.test.js test/find.test.js`
Expected: `ℹ tests 36`, `ℹ pass 36`, `ℹ fail 0`.

Run: `node --test test/*.test.js`
Expected: `ℹ tests 599`, `ℹ pass 599`, `ℹ fail 0`.

- [ ] **Step 5: Byte check**

```bash
git diff -U0 -- renderer/data/status.js renderer/data/find.js test/status.test.js test/find.test.js > tools/smoke/out/glyph.diff
```
```bash
python -c "t=open('tools/smoke/out/glyph.diff',encoding='utf-8').read().splitlines();print([l for l in t if l[:1] in '+-' and not l.startswith(('+++','---')) and (any(ord(c)>127 for c in l) or '@@u' in l)])"
```
Expected: `[]` (no added or removed line holds a literal non-ASCII character or a leftover sentinel).
```bash
grep -c "u2014'" renderer/data/status.js test/status.test.js
```
Expected: `renderer/data/status.js:1` and `test/status.test.js:1`. Delete `tools/smoke/out/glyph.diff`.

- [ ] **Step 6: Commit**

```bash
git add renderer/data/status.js renderer/data/find.js test/status.test.js test/find.test.js
git commit -m "feat: Unsegmented status; Processing for the running film and the batch's waiting films (issue #39)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Store the plain reason and its time — `processingErrorAt`

**Files:**
- Modify: `renderer/data/persistence.js` (`validateStudy`, lines 208–222)
- Modify: `renderer/screens/studies.js` (`newStudy`, lines 89–92)
- Modify: `renderer/screens/analysis.js` (imports line 20; `withProcessingFailure` lines 91–94; the success commit
  line 395; `changeRegion` lines 661–663)
- Test: `test/persistence.test.js`; create `test/failure-run.test.js`

**Interfaces:**
- Consumes: `failureReason(message)` from `renderer/data/failure.js` (Task 1); `deriveStatus` (Task 2).
- Produces:
  - Study record field `processingErrorAt: string | null` — an ISO time written in the same `setState` as
    `processingError`, `null` wherever `processingError` is cleared; `newStudy` sets it to `null`;
  - `validateStudy` keeps it only as a parseable string beside a non-blank `processingError`; any other present
    value is dropped with `console.warn(\`persistence: ${entry.id} has a malformed processing-error time; it is dropped.\`)`;
  - `processingError` is now stored as `failureReason(reason)`; outcomes and toasts keep the raw message.
- Every write site in `segmentStudy` already goes through `withProcessingFailure` (directly in the catch, or through
  `markProcessingFailure` at the two refusals, the second pair of refusals, the read error and the batch's
  `file not found`), so changing that one function covers them all.

No escapes in this task.

- [ ] **Step 1: Write the failing tests**

In `test/persistence.test.js`, add a test before the review-mark test:

The edit — replace:

```js
test('validate round-trips the review mark, defaults it to null, and drops a non-date with one warning (studies-table spec 8.1)', (t) => {
```

with:

```js
// (2026-10-01, issue #39; port spec 4) the failure's time: kept only as a date and only beside the
// error it dates; a 1.0.13 record, which has none, loads without a warning.
test('validate round-trips processingErrorAt, loads a 1.0.13 failure without one, and drops a malformed time with one warning', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const AT = '2026-10-01T12:00:00.000Z';
  const [bare] = validate({ version: STORE_VERSION, studies: [identity('SP-1000')] });
  assert.equal(bare.processingError, null);
  assert.equal(bare.processingErrorAt, null);
  // Listed on the returned object, or the saver writes it and the next load drops it.
  assert.ok('processingErrorAt' in bare);
  const [dated] = validate({ version: STORE_VERSION, studies: [{ ...identity('SP-1001'), processingError: 'boom', processingErrorAt: AT }] });
  assert.equal(dated.processingError, 'boom');
  assert.equal(dated.processingErrorAt, AT);
  const [legacy] = validate({ version: STORE_VERSION, studies: [{ ...identity('SP-1002'), processingError: 'boom' }] });
  assert.equal(legacy.processingError, 'boom');
  assert.equal(legacy.processingErrorAt, null);
  const [nulled] = validate({ version: STORE_VERSION, studies: [{ ...identity('SP-1003'), processingError: null, processingErrorAt: null }] });
  assert.equal(nulled.processingErrorAt, null);
  assert.equal(warn.mock.callCount(), 0);
  const malformed = [
    { ...identity('SP-1004'), processingError: 'boom', processingErrorAt: 'yesterday' },
    { ...identity('SP-1005'), processingError: 'boom', processingErrorAt: 12 },
    { ...identity('SP-1006'), processingError: 'boom', processingErrorAt: '' },
    { ...identity('SP-1007'), processingErrorAt: AT },
    { ...identity('SP-1008'), processingError: '   ', processingErrorAt: AT },
  ];
  const loaded = validate({ version: STORE_VERSION, studies: malformed });
  for (const study of loaded) assert.equal(study.processingErrorAt, null, study.id);
  assert.equal(loaded[0].processingError, 'boom', 'a dropped time keeps the error it dated');
  assert.equal(warn.mock.callCount(), malformed.length);
  malformed.forEach((entry, index) => {
    assert.equal(warn.mock.calls[index].arguments[0], `persistence: ${entry.id} has a malformed processing-error time; it is dropped.`);
  });
});

test('validate round-trips the review mark, defaults it to null, and drops a non-date with one warning (studies-table spec 8.1)', (t) => {
```

Create `test/failure-run.test.js` with exactly this content:

```js
/**
 * segmentStudy stores a failed attempt as a plain sentence with its time (issue #39;
 * docs/superpowers/specs/2026-10-01-failed-status-port-design.md sections 4 and 5). The window-stub
 * harness of test/automatic-detection.test.js: the bridge is stubbed on globalThis.window and the
 * store is put back after every test. Every film is SP-97nn, an id no other test file parks a
 * payload under, and no two tests here share one.
 *
 * Not covered here: the success commit and changeRegion clearing both fields (the harness cannot
 * decode images, and changeRegion lives inside render()); the smoke suites cover both.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { newStudy } from '../renderer/screens/studies.js';
import { segmentStudy, setFilePayload } from '../renderer/screens/analysis.js';
import { BACKEND_STOPPED_REASON, FILE_NOT_FOUND_REASON } from '../renderer/data/failure.js';
import { deriveStatus } from '../renderer/data/status.js';
import { unsupportedViewReason } from '../renderer/data/inference-view.js';
import { regionRunReason } from '../renderer/data/cervical.js';
import { getState, setState, subscribe } from '../renderer/store.js';

const DETECTION = 'Automatic film detection was inconclusive. Choose cervical, lumbar or standing / full spine manually.';
const SOCKET = 'connect ECONNREFUSED 127.0.0.1:53211';
const ADDED_AT = '2026-10-01T08:00:00.000Z';
const OLD_AT = '2026-09-28T10:00:00.000Z';
const OLD_REASON = 'Detected a cervical film. Choose anterior left or right, then segment again.';
const BYTES = new Uint8Array([1]);

// A real, unmeasured film with no path and nothing parked, unless the patch says otherwise.
function film(id, patch = {}) {
  return { ...newStudy({ id, fileName: `${id}.png`, filePath: null }), addedAt: ADDED_AT, ...patch };
}

const record = (id) => getState().studies.find((s) => s.id === id);
const unreachable = async () => assert.fail('this run must not reach the backend');
const isIsoTime = (value) => typeof value === 'string' && new Date(value).toISOString() === value;

// A single run toasts, and showToast arms a dismiss timer of up to 8 s that would hold this file's
// process open; the mocked setTimeout never fires and goes with the test.
async function withBridge(t, bridge, studies, body) {
  const saved = getState(), oldWindow = globalThis.window;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.window = { spineContour: bridge };
  try {
    setState({ studies, running: null, runStage: null, batch: null, deletingStudies: false, toast: '' });
    await body();
  } finally { globalThis.window = oldWindow; setState(saved); }
}

test('a backend sentence is stored verbatim with its time, in a batch and in a single run', async (t) => {
  const batchFilm = film('SP-9700'), singleFilm = film('SP-9701');
  await withBridge(t, { predict: async () => { throw new Error(DETECTION); } }, [batchFilm, singleFilm], async () => {
    setFilePayload(batchFilm.id, BYTES);
    setFilePayload(singleFilm.id, BYTES);
    assert.deepEqual(await segmentStudy(batchFilm.id, { batch: true }), { ok: false, reason: DETECTION });
    assert.deepEqual(await segmentStudy(singleFilm.id), { ok: false, reason: DETECTION });
    assert.equal(getState().toast, `Could not segment: ${DETECTION}`);
    for (const id of [batchFilm.id, singleFilm.id]) {
      assert.equal(record(id).processingError, DETECTION);
      assert.ok(isIsoTime(record(id).processingErrorAt), record(id).processingErrorAt);
      assert.equal(deriveStatus(record(id)), 'fail');
    }
    assert.equal(getState().running, null);
    assert.equal(getState().runStage, null);
  });
});

test('raw socket text is stored as the backend-stopped sentence; the outcome and the toast keep the raw text', async (t) => {
  const batchFilm = film('SP-9702'), singleFilm = film('SP-9703');
  await withBridge(t, { predict: async () => { throw new Error(SOCKET); } }, [batchFilm, singleFilm], async () => {
    setFilePayload(batchFilm.id, BYTES);
    setFilePayload(singleFilm.id, BYTES);
    assert.deepEqual(await segmentStudy(batchFilm.id, { batch: true }), { ok: false, reason: SOCKET });
    assert.deepEqual(await segmentStudy(singleFilm.id), { ok: false, reason: SOCKET });
    assert.equal(getState().toast, `Could not segment: ${SOCKET}`);
    for (const id of [batchFilm.id, singleFilm.id]) assert.equal(record(id).processingError, BACKEND_STOPPED_REASON);
  });
});

test('the failure and its time arrive in the same notification that clears running', async (t) => {
  const s = film('SP-9704');
  const seen = [];
  await withBridge(t, { predict: async () => { throw new Error(DETECTION); } }, [s], async () => {
    setFilePayload(s.id, BYTES);
    const unsubscribe = subscribe((state) => {
      const live = state.studies.find((x) => x.id === s.id);
      seen.push({ running: state.running, error: live?.processingError ?? null, at: live?.processingErrorAt ?? null });
    });
    try { await segmentStudy(s.id, { batch: true }); } finally { unsubscribe(); }
  });
  const started = seen.findIndex((n) => n.running === s.id);
  const finished = seen.findIndex((n, i) => i > started && n.running === null);
  assert.ok(started >= 0 && finished > started);
  // No notification shows the finished film as neither Processing nor Failed.
  assert.equal(seen.findIndex((n) => n.error !== null), finished);
  assert.ok(isIsoTime(seen[finished].at), seen[finished].at);
});

test('a re-run that fails replaces the earlier reason and its time', async (t) => {
  const s = film('SP-9705', { processingError: OLD_REASON, processingErrorAt: OLD_AT });
  await withBridge(t, { predict: async () => { throw new Error(DETECTION); } }, [s], async () => {
    setFilePayload(s.id, BYTES);
    await segmentStudy(s.id, { batch: true });
    assert.equal(record(s.id).processingError, DETECTION);
    assert.ok(isIsoTime(record(s.id).processingErrorAt));
    assert.notEqual(record(s.id).processingErrorAt, OLD_AT);
  });
});

test('a failed re-run over existing results is stored and keeps the results (1.0.13)', async (t) => {
  const measurements = { SS: 30, PI: 50, PT: 20, LL: { 'L1-S1': 45 } };
  const s = film('SP-9706', { measurements, geometry: { region: 'lumbar' } });
  await withBridge(t, { predict: async () => { throw new Error(DETECTION); } }, [s], async () => {
    setFilePayload(s.id, BYTES);
    assert.deepEqual(await segmentStudy(s.id), { ok: false, reason: DETECTION });
    assert.equal(record(s.id).processingError, DETECTION);
    assert.ok(isIsoTime(record(s.id).processingErrorAt));
    assert.equal(record(s.id).measurements, measurements);
    assert.equal(deriveStatus(record(s.id)), 'fail');
  });
});

test('a cancelled run stores nothing and keeps an earlier failure and its time', async (t) => {
  const batchFilm = film('SP-9707'), singleFilm = film('SP-9708', { processingError: OLD_REASON, processingErrorAt: OLD_AT });
  await withBridge(t, { predict: async () => { throw new Error('Processing cancelled.'); } }, [batchFilm, singleFilm], async () => {
    setFilePayload(batchFilm.id, BYTES);
    setFilePayload(singleFilm.id, BYTES);
    assert.deepEqual(await segmentStudy(batchFilm.id, { batch: true }), { skipped: true, cancelled: true });
    assert.deepEqual(await segmentStudy(singleFilm.id), { skipped: true, cancelled: true });
    assert.equal(record(batchFilm.id).processingError, null);
    assert.equal(record(batchFilm.id).processingErrorAt, null);
    assert.equal(record(singleFilm.id).processingError, OLD_REASON);
    assert.equal(record(singleFilm.id).processingErrorAt, OLD_AT);
  });
});

test('a refusal before a run is stored with its time (1.0.13)', async (t) => {
  const ap = film('SP-9709', { view: 'AP' });
  const cervical = film('SP-9710', { region: 'cervical', anteriorSide: null });
  await withBridge(t, { predict: unreachable }, [ap, cervical], async () => {
    assert.deepEqual(await segmentStudy(ap.id, { batch: true }), { ok: false, reason: unsupportedViewReason('AP') });
    assert.deepEqual(await segmentStudy(cervical.id), { ok: false, reason: regionRunReason(cervical) });
    assert.equal(record(ap.id).processingError, unsupportedViewReason('AP'));
    assert.equal(record(cervical.id).processingError, regionRunReason(cervical));
    for (const id of [ap.id, cervical.id]) assert.ok(isIsoTime(record(id).processingErrorAt), id);
  });
});

test('a batch that cannot find the film stores the file-not-found sentence; a single run whose picker is cancelled stores nothing', async (t) => {
  const batchFilm = film('SP-9711'), singleFilm = film('SP-9712');
  await withBridge(t, { selectFile: async () => null, predict: unreachable }, [batchFilm, singleFilm], async () => {
    // The outcome keeps the raw reason; the record keeps the sentence.
    assert.deepEqual(await segmentStudy(batchFilm.id, { batch: true }), { ok: false, reason: 'file not found' });
    assert.equal(record(batchFilm.id).processingError, FILE_NOT_FOUND_REASON);
    assert.ok(isIsoTime(record(batchFilm.id).processingErrorAt));
    assert.deepEqual(await segmentStudy(singleFilm.id), { ok: false, reason: 'file not found' });
    assert.equal(record(singleFilm.id).processingError, null);
    assert.equal(record(singleFilm.id).processingErrorAt, null);
  });
});

test('a film that cannot be read stores the read error verbatim, socket code and all', async (t) => {
  const s = film('SP-9713', { filePath: '/films/SP-9713.png' });
  // A film on a network share: the socket code is the file system's, not the backend's.
  const readFile = async () => { throw new Error('ECONNRESET: connection reset by peer, read'); };
  await withBridge(t, { readFile, predict: unreachable }, [s], async () => {
    const reason = 'Could not read SP-9713.png: ECONNRESET: connection reset by peer, read';
    assert.deepEqual(await segmentStudy(s.id, { batch: true }), { ok: false, reason });
    assert.equal(record(s.id).processingError, reason);
    assert.ok(isIsoTime(record(s.id).processingErrorAt));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/persistence.test.js test/failure-run.test.js`
Expected: FAIL — `processingErrorAt` is `undefined`, not `null`; the socket test stores the raw text; no
`processingErrorAt` is ever written.

- [ ] **Step 3: Implement**

In `renderer/data/persistence.js`:

Edit 1 of 2 — replace:

```js
  if (reviewedText !== null && reviewedAt === null) {
    console.warn(`persistence: ${entry.id} has a review mark that is not a date ("${reviewedText}"); it is dropped.`);
  }
```

with:

```js
  if (reviewedText !== null && reviewedAt === null) {
    console.warn(`persistence: ${entry.id} has a review mark that is not a date ("${reviewedText}"); it is dropped.`);
  }
  // (2026-10-01, issue #39; port spec 4) when the last attempt failed, beside 1.0.13's
  // processingError, on the review mark's optional-null terms. It is kept only as a date and only
  // with the error it dates; any other value that is present is dropped with a warning rather than
  // failing the record. A record written before it existed has none and loads without a warning.
  const processingError = optionalText(entry.processingError);
  const errorAtValue = entry.processingErrorAt;
  const processingErrorAt = typeof errorAtValue === 'string' && !Number.isNaN(Date.parse(errorAtValue))
    && processingError !== null ? errorAtValue : null;
  if (errorAtValue !== undefined && errorAtValue !== null && processingErrorAt === null) {
    console.warn(`persistence: ${entry.id} has a malformed processing-error time; it is dropped.`);
  }
```

Edit 2 of 2 — replace:

```js
    processingError: optionalText(entry.processingError),
```

with:

```js
    processingError,
    processingErrorAt,
```

In `renderer/screens/studies.js` (`newStudy`):

The edit — replace:

```js
    measurements: null, geometry: null, qc: null, clinical: {},
    processingError: null,
  };
```

with:

```js
    measurements: null, geometry: null, qc: null, clinical: {},
    // (1.0.13) the last failed attempt's reason; (2026-10-01, issue #39) and when it failed.
    processingError: null, processingErrorAt: null,
  };
```

In `renderer/screens/analysis.js`:

Edit 1 of 4 — replace:

```js
import { mountMeasurements } from '../components/measurements.js';
```

with:

```js
import { failureReason } from '../data/failure.js';
import { mountMeasurements } from '../components/measurements.js';
```

Edit 2 of 4 — replace:

```js
function withProcessingFailure(studies, studyId, addedAt, reason) {
  return studies.map((item) => item.id === studyId && item.addedAt === addedAt
    ? { ...item, processingError: String(reason || 'Segmentation failed.') } : item);
}
```

with:

```js
// (2026-10-01, issue #39; port spec 4-5) The record keeps the plain sentence failureReason gives and
// the time, in one update; the toast and the batch outcome keep the raw message.
function withProcessingFailure(studies, studyId, addedAt, reason) {
  return studies.map((item) => item.id === studyId && item.addedAt === addedAt
    ? { ...item, processingError: failureReason(reason), processingErrorAt: new Date().toISOString() } : item);
}
```

Edit 3 of 4 — replace:

```js
          reviewedAt: null, processingError: null }
```

with:

```js
          reviewedAt: null, processingError: null, processingErrorAt: null }
```

Edit 4 of 4 — replace:

```js
        geometry: null, measurements: null, qc: null, reviewedAt: null, predictionId: null,
        processingError: null } : s) });
```

with:

```js
        geometry: null, measurements: null, qc: null, reviewedAt: null, predictionId: null,
        processingError: null, processingErrorAt: null } : s) });
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/persistence.test.js test/failure-run.test.js`
Expected: `ℹ tests 41`, `ℹ pass 41`, `ℹ fail 0`.

Run: `node --test test/*.test.js`
Expected: `ℹ tests 609`, `ℹ pass 609`, `ℹ fail 0`. (`test/automatic-detection.test.js` still expects
`'intentional transport stop'` verbatim: no §5 row rewrites it.)

- [ ] **Step 5: Byte check**

```bash
git diff -U0 -- renderer/data/persistence.js renderer/screens/studies.js renderer/screens/analysis.js test/persistence.test.js > tools/smoke/out/glyph.diff
```
```bash
python -c "t=open('tools/smoke/out/glyph.diff',encoding='utf-8').read().splitlines();print([l for l in t if l[:1] in '+-' and not l.startswith(('+++','---')) and any(ord(c)>127 for c in l)])"
```
Expected: `[]`. Delete `tools/smoke/out/glyph.diff`.

- [ ] **Step 6: Commit**

```bash
git add renderer/data/persistence.js renderer/screens/studies.js renderer/screens/analysis.js test/persistence.test.js test/failure-run.test.js
git commit -m "feat: store a failed attempt's plain reason and its time (issue #39)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Find list — red Failed, hollow Unsegmented, the tooltip, the batch, the summary

**Files:**
- Modify: `renderer/components/status-badge.js` (header comment, `statusBadge`; lines 1–15)
- Modify: `styles/tokens.css` (lines 10–11, 24)
- Modify: `styles/components.css` (`.badge-fail`, lines 107–110)
- Modify: `renderer/data/find.js` (append `summaryCounts`)
- Modify: `renderer/screens/studies.js` (imports lines 15 and 25; `buildRow` lines 277–280 and 325; `buildTable` lines
  360–367; the sort call line 818; the summary lines 841–848; the table mount line 864)
- Modify: `renderer/screens/analysis.js` (the import from Task 3; the header pill's `statusBadge` call, line 831)
- Modify: `renderer/screens/workspace.js` (the load hint, line 569)
- Modify: `README.md` (line 113)
- Modify: `renderer/data/confidence.js` (comment, line 60)
- Test: `test/find.test.js`

**Interfaces:**
- Consumes: `failureTitle(reason, at)` (Task 1); `displayStatus(study, runningId, batch)` and
  `sortFindRows(studies, sort, runningId, batch)` (Task 2); `processingErrorAt` (Task 3).
- Produces:
  - `statusBadge(status, title) → HTMLElement` — `title` set only when truthy (callers pass a string or `undefined`);
    the pill's classes stay `badge badge-<status>`;
  - `summaryCounts(studies, runningId = null, batch = null) → { total, unsegmented, toReview }` in
    `renderer/data/find.js`;
  - CSS: the token `--danger` (`:root` `#B42318`, `body[data-dark]` `#F07167`); `.badge-fail` in `--danger`;
    `.badge-unseg` in Processing's colours with a hollow dot. Task 5 uses `--danger`.
- The Studies screen's repaint key already includes `live.batch` (`renderer/screens/studies.js` line 838); nothing
  to add there.

**Glyph trap (this task).** `renderer/screens/studies.js`'s summary line holds a literal `·` after STUDIES and the
escape `\u00B7` after UNSEGMENTED. This task does **not** edit that line: the edit below replaces only the
comment and the counting lines above it. No `old_string` or `new_string` here contains an escape.

- [ ] **Step 1: Write the failing test**

In `test/find.test.js`:

Edit 1 of 2 — replace:

```js
import { DEFAULT_FIND_SORT, FIND_SORT_KEYS, statusRank, toggleFindSort, sortFindRows } from '../renderer/data/find.js';
```

with:

```js
import { DEFAULT_FIND_SORT, FIND_SORT_KEYS, statusRank, toggleFindSort, sortFindRows, summaryCounts } from '../renderer/data/find.js';
```

Edit 2 of 2 — replace:

```js
test('an unknown key keeps the input order', () => {
```

with:

```js
// (2026-10-01, issue #39; port spec 3) the summary line counts the pills the rows show.
test('summaryCounts: UNSEGMENTED counts Unsegmented, Processing and Failed; TO REVIEW counts Needs review', () => {
  const rows = [
    study('SP-1000'), study('SP-1001', SEG), study('SP-1002', REV), study('SP-1003', { processingError: 'boom' }),
    study('SP-1004', { ...SEG, reviewedAt: '2026-09-10T12:00:00.000Z' }), study('SP-1005', { ...REV, processingError: 'boom' }),
  ];
  assert.deepEqual(summaryCounts(rows), { total: 6, unsegmented: 3, toReview: 1 });
  // A re-run of the Needs review film: it reads Processing, so it moves to UNSEGMENTED while it runs.
  assert.deepEqual(summaryCounts(rows, 'SP-1002'), { total: 6, unsegmented: 4, toReview: 0 });
  // A batch over the Unsegmented and Failed films: Processing while they wait, counted once, as before.
  assert.deepEqual(summaryCounts(rows, 'SP-1000', newBatch(['SP-1000', 'SP-1003', 'SP-1005'])), { total: 6, unsegmented: 3, toReview: 1 });
  assert.deepEqual(summaryCounts([]), { total: 0, unsegmented: 0, toReview: 0 });
  assert.deepEqual(summaryCounts(null), { total: 0, unsegmented: 0, toReview: 0 });
});

test('an unknown key keeps the input order', () => {
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/find.test.js`
Expected: FAIL — `summaryCounts` is not exported (`SyntaxError: The requested module … does not provide an export
named 'summaryCounts'`).

- [ ] **Step 3: `summaryCounts`**

In `renderer/data/find.js`:

The edit — replace:

```js
  return indexed.map((entry) => entry.study);
}
```

with:

```js
  return indexed.map((entry) => entry.study);
}

// The Studies summary line's counts (2026-10-01, issue #39; port spec 3), over the list given, which
// is the whole library. They follow the pills the rows show: UNSEGMENTED is every film shown as
// Unsegmented, Processing or Failed, TO REVIEW every film shown as Needs review; Segmented and
// Reviewed films count in the total only. A film showing the Unsupported view pill derives
// Unsegmented or Failed, so it is UNSEGMENTED too. `runningId` is state.running, `batch` state.batch.
export function summaryCounts(studies, runningId = null, batch = null) {
  const list = studies ?? [];
  const counts = { total: list.length, unsegmented: 0, toReview: 0 };
  for (const study of list) {
    const status = displayStatus(study, runningId, batch);
    if (status === 'unseg' || status === 'proc' || status === 'fail') counts.unsegmented += 1;
    else if (status === 'rev') counts.toReview += 1;
  }
  return counts;
}
```

Run: `node --test test/find.test.js`
Expected: `ℹ tests 11`, `ℹ pass 11`, `ℹ fail 0`.

- [ ] **Step 4: The pill takes a title**

In `renderer/components/status-badge.js`:

Edit 1 of 2 — replace:

```js
 * list's other badge, for an unsegmented film whose view no model reads.
 */
```

with:

```js
 * list's other badge, for an unsegmented film whose view no model reads.
 * (2026-10-01, issue #39) `title` is the pill's native tooltip: failureTitle() for a Failed pill,
 * nothing for the others (port spec 6). It is set only when it is a non-empty string -- el() skips
 * only undefined, and HTMLElement.title = null would store the text "null".
 */
```

Edit 2 of 2 — replace:

```js
export function statusBadge(status, reason = null) {
  return el('span', { class: `badge badge-${status}`,
    ...(status === 'fail' && reason ? { title: reason } : {}) },
  el('span', { class: 'dot' }), statusLabel(status));
}
```

with:

```js
export function statusBadge(status, title) {
  return el('span', { class: `badge badge-${status}`, ...(title ? { title } : {}) },
    el('span', { class: 'dot' }), statusLabel(status));
}
```

- [ ] **Step 5: The colours**

In `styles/tokens.css`:

Edit 1 of 2 — replace:

```css
  --sage: #6E8577;
  --on-accent: #FFFFFF;
```

with:

```css
  --sage: #6E8577;
  --danger: #B42318;
  --on-accent: #FFFFFF;
```

Edit 2 of 2 — replace:

```css
  --sage: #8AA894;
}
```

with:

```css
  --sage: #8AA894;
  --danger: #F07167;
}
```

In `styles/components.css`:

The edit — replace:

```css
.badge-fail {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}
```

with:

```css
/* Failed and Unsegmented (2026-10-01, issue #39; port spec 6). Failed is its own red, --danger, in
   the soft-tint style of the others, so it reads apart from Needs review's terracotta; --danger is at
   least 4.5:1 on its own 14% tint over --bg in both themes (5.12:1 light, 5.30:1 dark). Unsegmented
   keeps Processing's colours with a hollow dot in the same 6px box, so "nothing has run yet" reads
   apart from "running now". */
.badge-fail {
  background: color-mix(in srgb, var(--danger) 14%, transparent);
  color: var(--danger);
}
.badge-unseg {
  background: color-mix(in srgb, var(--muted) 14%, transparent);
  color: var(--muted);
}
.badge-unseg .dot {
  background: transparent;
  border: 1.5px solid currentColor;
  box-sizing: border-box;
}
```

- [ ] **Step 6: The Studies screen**

In `renderer/screens/studies.js`, apply these edits in order:

Edit 1 of 9 — replace:

```js
import { displayStatus } from '../data/status.js';
```

with:

```js
import { displayStatus } from '../data/status.js';
import { failureTitle } from '../data/failure.js';
```

Edit 2 of 9 — replace:

```js
import { sortFindRows, toggleFindSort } from '../data/find.js';
```

with:

```js
import { sortFindRows, toggleFindSort, summaryCounts } from '../data/find.js';
```

Edit 3 of 9 — replace:

```js
// `runningId` is state.running. displayStatus (data/status.js) applies spec 13.1's "or currently
// running" rule, so deriveStatus stays a pure function of the record.
function buildRow(study, runningId, selected) {
  const status = displayStatus(study, runningId);
```

with:

```js
// `runningId` is state.running and `batch` is state.batch. displayStatus (data/status.js) applies
// spec 13.1's "or currently running" rule and (2026-10-01, issue #39) the batch's waiting films, so
// deriveStatus stays a pure function of the record.
function buildRow(study, runningId, selected, batch) {
  const status = displayStatus(study, runningId, batch);
```

Edit 4 of 9 — replace:

```js
    confirming ? null : el('div', {}, unsupported ? unsupportedViewBadge(study.view) : statusBadge(status, study.processingError)),
```

with:

```js
    confirming ? null : el('div', {}, unsupported ? unsupportedViewBadge(study.view)
      : statusBadge(status, status === 'fail' ? failureTitle(study.processingError, study.processingErrorAt) : undefined)),
```

Edit 5 of 9 — replace:

```js
// `sort` is state.findSort; the rows arrive already sorted by it.
function buildTable(studies, runningId, emptyKind, selected, sort) {
```

with:

```js
// `sort` is state.findSort; the rows arrive already sorted by it. `batch` is state.batch.
function buildTable(studies, runningId, emptyKind, selected, sort, batch) {
```

Edit 6 of 9 — replace:

```js
    ? studies.map((study) => buildRow(study, runningId, selected))
```

with:

```js
    ? studies.map((study) => buildRow(study, runningId, selected, batch))
```

Edit 7 of 9 — replace:

```js
    const visible = sortFindRows(queried.filter((study) => matchesLocation(study, filters)), live.findSort, live.running);
```

with:

```js
    const visible = sortFindRows(queried.filter((study) => matchesLocation(study, filters)), live.findSort, live.running, live.batch);
```

Edit 8 of 9 — replace:

```js
    // The summary always describes the whole library, not the filtered view, and counts with
    // exactly the rule buildRow badges: UNSEGMENTED is every film shown as Processing (the running
    // one included, never "in queue" -- the batch's queue is the bar's business, spec decision 7);
    // TO REVIEW is every film shown as Needs review (studies-table spec 10). The line keeps its
    // existing separator glyph and adds the new one as an escape (HANDOFF's glyph trap).
    const shown = (study) => displayStatus(study, live.running);
    const unsegmented = studies.filter((study) => ['proc', 'fail'].includes(shown(study))).length;
    const toReview = studies.filter((study) => shown(study) === 'rev').length;
```

with:

```js
    // The summary always describes the whole library, not the filtered view, and counts with
    // exactly the rule buildRow badges (data/find.js summaryCounts): UNSEGMENTED is every film shown
    // as Unsegmented, Processing (the running film and, 2026-10-01, the films waiting in the batch)
    // or Failed (1.0.13; port spec 3); TO REVIEW is every film shown as Needs review (studies-table
    // spec 10). The line keeps its existing separator glyph and adds the new one as an escape
    // (HANDOFF's glyph trap).
    const { unsegmented, toReview } = summaryCounts(studies, live.running, live.batch);
```

Edit 9 of 9 — replace:

```js
    mount(tableHost, buildTable(visible, live.running, emptyKind, selected, live.findSort));
```

with:

```js
    mount(tableHost, buildTable(visible, live.running, emptyKind, selected, live.findSort, live.batch));
```

After the edits, the line below the new `const { unsegmented, toReview } = …` must still read, byte for byte:
```js
    summary.textContent = `${studies.length} STUDIES · ${unsegmented} UNSEGMENTED \u00B7 ${toReview} TO REVIEW`;
```
Check: `grep -n "UNSEGMENTED" renderer/screens/studies.js` shows that line with the six characters `\u00B7`
after UNSEGMENTED, and `grep -c "displayStatus" renderer/screens/studies.js` is still at least 2 (the import and
`buildRow`).

- [ ] **Step 7: The Analysis header's pill gets the dated tooltip**

In `renderer/screens/analysis.js` (Task 5 moves this call into `headerBadge`'s consumer; this keeps the header
correct in between):

Edit 1 of 2 — replace:

```js
import { failureReason } from '../data/failure.js';
```

with:

```js
import { failureReason, failureTitle } from '../data/failure.js';
```

Edit 2 of 2 — replace:

```js
      mount(statusHost, unsupported ? unsupportedViewBadge(open.view) : statusBadge(badgeStatus, open.processingError));
```

with:

```js
      mount(statusHost, unsupported ? unsupportedViewBadge(open.view)
        : statusBadge(badgeStatus, badgeStatus === 'fail' ? failureTitle(open.processingError, open.processingErrorAt) : undefined));
```

- [ ] **Step 8: Text — the Workspace hint, README, the confidence comment**

In `renderer/screens/workspace.js`:

The edit — replace:

```js
            : 'New films are added to Studies as Processing. Open one and run segmentation from its Analysis screen.')),
```

with:

```js
            : 'New films are added to Studies as Unsegmented. Open one and run segmentation from its Analysis screen.')),
```

In `README.md`:

The edit — replace:

```markdown
- **Load workspace** adds each new film to Studies as `Processing` and attaches its CSV
```

with:

```markdown
- **Load workspace** adds each new film to Studies as `Unsegmented` and attaches its CSV
```

In `renderer/data/confidence.js`:

The edit — replace:

```js
  // No tone may equal a statusLabel string ('Segmented'/'Needs review'/'Processing'/'Reviewed'):
```

with:

```js
  // No tone may equal a statusLabel string ('Segmented'/'Needs review'/'Processing'/'Reviewed'/'Failed'/'Unsegmented'):
```

- [ ] **Step 9: Run everything**

```bash
node --check renderer/components/status-badge.js
```
```bash
node --check renderer/screens/studies.js
```
```bash
node --check renderer/screens/analysis.js
```
Expected: no output from each.

Run: `node --test test/*.test.js`
Expected: `ℹ tests 610`, `ℹ pass 610`, `ℹ fail 0`.

- [ ] **Step 10: Byte check**

```bash
git diff -U0 > tools/smoke/out/glyph.diff
```
```bash
python -c "t=open('tools/smoke/out/glyph.diff',encoding='utf-8').read().splitlines();print([l for l in t if l[:1] in '+-' and not l.startswith(('+++','---')) and any(ord(c)>127 for c in l)])"
```
Expected: `[]`. Delete `tools/smoke/out/glyph.diff`.

- [ ] **Step 11: Commit**

```bash
git add renderer/components/status-badge.js styles/tokens.css styles/components.css renderer/data/find.js renderer/screens/studies.js renderer/screens/analysis.js renderer/screens/workspace.js README.md renderer/data/confidence.js test/find.test.js
git commit -m "feat: red Failed and hollow Unsegmented pills, dated tooltip, batch-aware Find list (issue #39)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Analysis screen names the failure — header pill, region note, FAILED card

**Files:**
- Modify: `renderer/screens/analysis.js` (after `formatConfidence`, line 29; the region note, line 763; the header
  pill block, lines 825–831)
- Modify: `renderer/components/viewer.js` (`describeCard`, lines 755–777)
- Modify: `styles/screens/analysis.css` (after line 884)
- Test: `test/analysis.test.js`

**Interfaces:**
- Consumes: `displayStatus(study, runningId, batch)` (Task 2); `processingErrorAt` (Task 3); `statusBadge(status,
  title)`, `failureTitle`'s import in `analysis.js` and `--danger` (Task 4); `inferenceView` (already imported).
- Produces:
  - `export function headerBadge(open, runningId = null, batch = null) → { unsupported, status, badgeKey }`;
  - `export function failedRunNote(open, { unsupported, status }, previewNote = '') → string | null`;
  - `.meas-note.is-failed` (the region note's class while the header reads Failed);
  - the FAILED stage card.
- `update()` declares `previewNote`, `unsupported`, `badgeStatus`, `badgeKey` and `failedNote` once, in the region
  note block, and the header block further down the same function reuses them; the old `const unsupported`,
  `badgeStatus` and `badgeKey` lines in the header block are removed.

No escapes in this task.

- [ ] **Step 1: Write the failing tests**

In `test/analysis.test.js`:

Edit 1 of 2 — replace:

```js
import { formatConfidence } from '../renderer/screens/analysis.js';
```

with:

```js
import { formatConfidence, headerBadge, failedRunNote } from '../renderer/screens/analysis.js';
```

Edit 2 of 2 — replace:

```js
test('formatConfidence renders 0% for a measured zero, not an em dash', () => {
  assert.equal(formatConfidence({ femoral: { confidence: 0 } }), '0%');
});
```

with:

```js
test('formatConfidence renders 0% for a measured zero, not an em dash', () => {
  assert.equal(formatConfidence({ femoral: { confidence: 0 } }), '0%');
});

// (2026-10-01, issue #39; port spec 6) the Analysis header pill and the region note of a Failed film.
const AT = '2026-10-01T12:00:00.000Z';
const REASON = 'Automatic film detection was inconclusive. Choose cervical, lumbar or standing / full spine manually.';
const film = (patch = {}) => ({ id: 'SP-1000', source: 'real', view: 'Standing lateral', measurements: null,
  processingError: null, processingErrorAt: null, ...patch });

test('headerBadge follows the list: Unsupported view, else the shown status, the batch included', () => {
  assert.deepEqual(headerBadge(film()), { unsupported: false, status: 'unseg', badgeKey: 'unseg||' });
  assert.deepEqual(headerBadge(film({ view: 'AP' })), { unsupported: true, status: 'unseg', badgeKey: 'unsupported:AP' });
  // Running wins over Unsupported, as on the list.
  assert.equal(headerBadge(film({ view: 'AP' }), 'SP-1000').unsupported, false);
  assert.equal(headerBadge(film(), 'SP-1000').status, 'proc');
  const batch = { ids: ['SP-1000'], done: 0, failed: [], warnings: [], skipped: 0, stopping: false };
  assert.equal(headerBadge(film(), null, batch).status, 'proc');
  assert.equal(headerBadge(film(), null, { ...batch, stopping: true }).status, 'unseg');
});

test('headerBadge keys a Failed pill on the failure and its time, so a new failure rebuilds it', () => {
  const first = headerBadge(film({ processingError: REASON, processingErrorAt: AT }));
  assert.equal(first.status, 'fail');
  assert.equal(first.badgeKey, `fail|${AT}|${REASON}`);
  const again = headerBadge(film({ processingError: REASON, processingErrorAt: '2026-10-02T12:00:00.000Z' }));
  assert.notEqual(again.badgeKey, first.badgeKey);
  const legacy = headerBadge(film({ processingError: REASON }));
  assert.equal(legacy.badgeKey, `fail||${REASON}`);
});

test('failedRunNote names the reason only when the pill reads Failed, the preview message after it', () => {
  const failed = film({ processingError: REASON, processingErrorAt: AT });
  assert.equal(failedRunNote(failed, { unsupported: false, status: 'fail' }), `Last run failed: ${REASON}`);
  assert.equal(failedRunNote(failed, { unsupported: false, status: 'fail' }, 'Loading original radiograph.'),
    `Last run failed: ${REASON} Loading original radiograph.`);
  assert.equal(failedRunNote(failed, { unsupported: true, status: 'fail' }), null);
  assert.equal(failedRunNote(failed, { unsupported: false, status: 'proc' }), null);
  assert.equal(failedRunNote(film(), { unsupported: false, status: 'unseg' }), null);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/analysis.test.js`
Expected: FAIL — `does not provide an export named 'headerBadge'`.

- [ ] **Step 3: The helpers, the region note and the header**

In `renderer/screens/analysis.js`:

Edit 1 of 3 — replace:

```js
export function formatConfidence(qc) {
  return scorePercent(qc?.femoral?.confidence);
}
```

with:

```js
export function formatConfidence(qc) {
  return scorePercent(qc?.femoral?.confidence);
}

// (2026-10-01, issue #39; port spec 6) The Analysis header pill, on the list's rule
// (screens/studies.js buildRow): Unsupported view for a real, unmeasured film no model reads that is
// not running, else displayStatus with state.running and state.batch. `status` is what the pill shows
// and `badgeKey` is what update() rebuilds it on: the key carries the failure and its time, so a new
// failure under the same status rebuilds the pill and its tooltip. statusBadge never receives the key.
export function headerBadge(open, runningId = null, batch = null) {
  const unsupported = open.source === 'real' && open.measurements == null && runningId !== open.id && !inferenceView(open.view);
  const status = displayStatus(open, runningId, batch);
  const badgeKey = unsupported ? `unsupported:${open.view}` : `${status}|${open.processingErrorAt ?? ''}|${open.processingError ?? ''}`;
  return { unsupported, status, badgeKey };
}

// (2026-10-01, issue #39; port spec 6) The region note of a film whose header pill reads Failed, or
// null for every other film, whose note stays exactly what it was. `previewNote` is the preview
// message update() would otherwise show, already gated on its own rule; it follows the reason after
// a space.
export function failedRunNote(open, { unsupported, status }, previewNote = '') {
  if (unsupported || status !== 'fail') return null;
  const note = `Last run failed: ${open.processingError}`;
  return previewNote ? `${note} ${previewNote}` : note;
}
```

Edit 2 of 3 — replace:

```js
    regionNote.textContent = mounted?.previewMessage && alignmentSetup ? mounted.previewMessage : open.measurements
```

with:

```js
    // The preview message shows only during alignment setup: it is not cleared when a preview is
    // abandoned, so its being set is not enough.
    const previewNote = mounted?.previewMessage && alignmentSetup ? mounted.previewMessage : '';
    // (2026-10-01, issue #39) Read here for the region note as well as for the header pill below. A
    // film whose pill reads Failed says why here, in --danger, next to the controls that fix most
    // failures, ahead of the ordinary guidance (port spec 6).
    const { unsupported, status: badgeStatus, badgeKey } = headerBadge(open, live.running, live.batch);
    const failedNote = failedRunNote(open, { unsupported, status: badgeStatus }, previewNote);
    regionNote.classList.toggle('is-failed', failedNote !== null);
    regionNote.textContent = failedNote !== null ? failedNote : previewNote ? previewNote : open.measurements
```

Edit 3 of 3 — replace:

```js
    // The list's badge, on the list's rule (screens/studies.js buildRow): Unsupported view for an
    // unsegmented film no model reads, else displayStatus with state.running.
    const unsupported = open.source === 'real' && open.measurements == null && live.running !== open.id && !inferenceView(open.view);
    const badgeStatus = displayStatus(open, live.running);
    const badgeKey = unsupported ? `unsupported:${open.view}` : `${badgeStatus}:${open.processingError ?? ''}`;
    if (badgeKey !== lastBadgeKey) {
```

with:

```js
    // The list's badge, on the list's rule (screens/studies.js buildRow): headerBadge's `unsupported`,
    // `status` and `badgeKey`, read above for the region note. A Failed pill carries the dated reason
    // as its tooltip (2026-10-01, issue #39).
    if (badgeKey !== lastBadgeKey) {
```

- [ ] **Step 4: The FAILED card**

In `renderer/components/viewer.js`:

Edit 1 of 2 — replace:

```js
    // study's place in the running batch -- QUEUED means that and nothing else; a film in no
    // batch reads UNSEGMENTED (spec decision 7).
```

with:

```js
    // study's place in the running batch -- QUEUED means that and nothing else; a film in no
    // batch reads UNSEGMENTED (spec decision 7), or FAILED when its last attempt failed (below).
```

Edit 2 of 2 — replace:

```js
        body: unsupportedViewReason(study.view), spinner: false, button: null,
      };
    }
    if (!hasResult || busy) {
```

with:

```js
        body: unsupportedViewReason(study.view), spinner: false, button: null,
      };
    }
    // (2026-10-01, issue #39; port spec 6) The last attempt failed: the stored reason, and
    // UNSEGMENTED's Run segmentation button under the same disabled rules and title. RUNNING and
    // QUEUED win -- a Failed film in a batch waits like any other. A film with results shows them;
    // the header pill and the region note carry its failure.
    if (!hasResult && !busy && !queued && study.processingError) {
      return {
        eyebrow: 'FAILED', title: 'Segmentation failed', body: study.processingError, spinner: false,
        button: { text: 'Run segmentation', disabled: Boolean(state.running) || Boolean(batch), title: waitTitle },
      };
    }
    if (!hasResult || busy) {
```

- [ ] **Step 5: The red note**

In `styles/screens/analysis.css`:

The edit — replace:

```css
.analysis-region-bar .meas-note { margin: 0; }
```

with:

```css
.analysis-region-bar .meas-note { margin: 0; }
/* (2026-10-01, issue #39) The region note of a film whose pill reads Failed: `Last run failed: ...`,
   in the Failed pill's red (port spec 6). screens/analysis.js toggles the class. */
.meas-note.is-failed { color: var(--danger); }
```

- [ ] **Step 6: Run everything**

```bash
node --check renderer/screens/analysis.js
```
```bash
node --check renderer/components/viewer.js
```
Expected: no output.

Run: `node --test test/analysis.test.js`
Expected: `ℹ tests 6`, `ℹ pass 6`, `ℹ fail 0`.

Run: `node --test test/*.test.js`
Expected: `ℹ tests 613`, `ℹ pass 613`, `ℹ fail 0`.

- [ ] **Step 7: Byte check**

```bash
git diff -U0 > tools/smoke/out/glyph.diff
```
```bash
python -c "t=open('tools/smoke/out/glyph.diff',encoding='utf-8').read().splitlines();print([l for l in t if l[:1] in '+-' and not l.startswith(('+++','---')) and any(ord(c)>127 for c in l)])"
```
Expected: `[]`. Delete `tools/smoke/out/glyph.diff`.

- [ ] **Step 8: Commit**

```bash
git add renderer/screens/analysis.js renderer/components/viewer.js styles/screens/analysis.css test/analysis.test.js
git commit -m "feat: the Analysis screen names a failed run: header tooltip, red region note, FAILED card (issue #39)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Amend the contract; CHANGELOG

**Files:**
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` (the module list, the Study typedef and the
  paragraph after it, the `renderer/data/status.js` section)
- Modify: `CHANGELOG.md` (top)

**Interfaces:**
- Consumes: the names Tasks 1–5 produced, as recorded below.
- Produces: documentation only.

The contract keeps its glyphs literal (`—`, `→`, `·`, `–`), so the edits below type them literally; there are no
escapes in either file. No tests change.

- [ ] **Step 1: The contract**

In `docs/superpowers/plans/2026-08-31-00-architecture-contract.md`:

Edit 1 of 10 — replace:

```markdown
  components/status-badge.js      (2026-09-10) statusBadge(status), unsupportedViewBadge(view) — the one badge both screens show
```

with:

```markdown
  components/status-badge.js      (2026-09-10) statusBadge(status, title), unsupportedViewBadge(view) — the one badge both screens
                                  show; (2026-10-01) `title`, when a non-empty string, is the pill's tooltip (failureTitle for Failed)
```

Edit 2 of 10 — replace:

```markdown
  data/status.js                  status derivation
```

with:

```markdown
  data/status.js                  status derivation
  data/failure.js                 (2026-10-01, issue #39) failureReason(message), failureTitle(reason, at), capReason — the stored
                                  text of a failed segmentation attempt and the Failed pill's tooltip; pure
```

Edit 3 of 10 — replace:

```markdown
                                  sortFindRows(studies, sort, runningId) — the Find list's sort; pure
```

with:

```markdown
                                  sortFindRows(studies, sort, runningId, batch), (2026-10-01) summaryCounts(studies, runningId,
                                  batch) — the Find list's sort and the Studies summary's counts; pure
```

Edit 4 of 10 — replace:

```markdown
 *                                     measurements, geometry or calibration (§8.4)
```

with:

```markdown
 *                                     measurements, geometry or calibration (§8.4)
 * @property {string|null} processingError    (1.0.13) the reason the last segmentation attempt failed; (2026-10-01) the
 *                                            plain sentence data/failure.js failureReason gives; null when no attempt
 *                                            failed; cleared by a successful run and by a Region/Orientation change
 * @property {string|null} processingErrorAt  (2026-10-01, issue #39) ISO time of that failure, written and cleared with
 *                                            it; null on a failure 1.0.13 recorded
```

Edit 5 of 10 — replace:

```markdown
must match `/^\d{4}-\d{2}-\d{2}$/` or `validateStudy` nulls it with a warning.
```

with:

```markdown
must match `/^\d{4}-\d{2}-\d{2}$/` or `validateStudy` nulls it with a warning. (2026-10-01, issue #39) `processingError`
(1.0.13) and `processingErrorAt` are optional-null on the same terms, with no `STORE_VERSION` bump, and are listed in
`validateStudy` too; `processingErrorAt` is kept only when it parses as a date and `processingError` is set, and any
other value that is present is nulled with a warning.
```

Edit 6 of 10 — replace:

```markdown
export function deriveStatus(study)      // → 'seg'|'rev'|'proc'|'ok'
export function statusLabel(status)      // → 'Segmented'|'Needs review'|'Processing'|'Reviewed'
```

with:

```markdown
export function deriveStatus(study)      // → 'fail'|'unseg'|'ok'|'rev'|'seg'  (2026-10-01; see the amendment below)
export function statusLabel(status)      // → 'Processing'|'Unsegmented'|'Failed'|'Segmented'|'Needs review'|'Reviewed'; '—' otherwise
```

Edit 7 of 10 — replace:

```markdown
export function displayStatus(study, runningId)  // → the status a row or header SHOWS: 'proc' while runningId === study.id, else deriveStatus
```

with:

```markdown
export function displayStatus(study, runningId, batch)  // → the status a row or header SHOWS: 'proc' while runningId === study.id
                                                        //   or (2026-10-01) the film waits in a running batch, else deriveStatus
```

Edit 8 of 10 — replace:

```markdown
export function reviewBlockedReason({ study, running, pending })   // → string|null: REVIEW_DEMO | REVIEW_RUNNING | REVIEW_NOTHING | REVIEW_PENDING
```

with:

```markdown
export function reviewBlockedReason({ study, running, pending })   // → string|null: REVIEW_DEMO | REVIEW_RUNNING | REVIEW_FAILED (1.0.13) | REVIEW_NOTHING | REVIEW_PENDING
```

Edit 9 of 10 — replace:

```markdown
summary counts them as UNSEGMENTED and the batch's own progress is the filter bar's and the
sidebar's (2026-09-08, batch spec decisions 7–8).
```

with:

```markdown
summary counts them as UNSEGMENTED and the batch's own progress is the filter bar's and the
sidebar's (2026-09-08, batch spec decisions 7–8).

**2026-10-01 amendment (issue #39; release 1.0.13 and
`docs/superpowers/specs/2026-10-01-failed-status-port-design.md`).** The rules are now, first match wins: no study →
`'unseg'`; a non-blank `processingError` → `'fail'` (1.0.13; it outranks measurements and the review mark);
`measurements == null` → `'unseg'`; then rules 1b–4. `'proc'` is no longer derived: `displayStatus` returns it for the
running study and, given `state.batch`, for every film still waiting in a running batch that is not stopping
(`data/batch.js isQueued`), and every caller passes `state.batch`. A batch's waiting films therefore read Processing by
that rule, not by rule 1; a stopping batch's waiting films read their own status. The Studies summary keeps its three
clauses and its UNSEGMENTED counts Unsegmented, Processing and Failed (`data/find.js summaryCounts`). The Find sort
ranks fail 0 · proc 1 · unseg 2 · rev 3 · seg 4 · ok 5. `statusLabel` names all six keys and returns `—` for any
other. A failed attempt stores `processingError` as `failureReason(message)` and `processingErrorAt` in the same
update; the Failed pill's tooltip is `failureTitle(processingError, processingErrorAt)`.
```

Edit 10 of 10 — replace:

```markdown
The other two states are still reachable — and reachable *honestly*: `Processing` is
what plan 06's workspace load produces for scanned films that have no measurements yet,
```

with:

```markdown
The other two states are still reachable — and reachable *honestly*: `Processing` is
what plan 06's workspace load produces for scanned films that have no measurements yet
(2026-10-01: that is `Unsegmented` now; `Processing` is a running film or one waiting in a running batch),
```

- [ ] **Step 2: CHANGELOG**

In `CHANGELOG.md`:

The edit — replace:

```markdown
# Changelog

## 1.0.13
```

with:

```markdown
# Changelog

## Unreleased

- A film that has not been segmented reads **Unsegmented** instead of Processing.
  **Processing** now means the film is running or waiting in the running batch: a click
  on Segment turns every film in the batch to Processing at once, and each changes to its
  result as its turn ends. Stop returns the films still waiting to their own status.
- **Failed** has its own red. Its tooltip gives the date of the failed attempt (failures
  recorded by 1.0.13 show none) and the reason, and the Analysis screen shows the reason
  under the Region and Orientation controls and, for a film with no results, on the film
  card.
- The reason kept for a failed attempt is a plain sentence: a lost connection to the
  processing backend reads "The processing backend stopped. Restart Spine Contour, then
  segment again." instead of the raw socket error. Toasts are unchanged.

## 1.0.13
```

- [ ] **Step 3: Check**

Run: `node --test test/*.test.js`
Expected: `ℹ tests 613`, `ℹ pass 613`, `ℹ fail 0` (nothing executable changed).

`git diff --stat` shows exactly the two files.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-08-31-00-architecture-contract.md CHANGELOG.md
git commit -m "docs: contract amendment and changelog for the Failed-status additions (issue #39)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The smoke suites follow the new statuses

**Files:**
- Modify: `tools/smoke/smoke-studies.mjs` (+225 −27), `tools/smoke/smoke-persist.mjs` (+78), `tools/smoke/smoke-workspace.mjs`
  (+9 −4), `tools/smoke/smoke-parameters.mjs` (one comment), `tools/smoke/README.md` (+26 −2)

**Interfaces:**
- Consumes (Tasks 1–5): row and header pills `badge badge-unseg` / `badge-proc` / `badge-fail`, with a `title` on a
  Failed pill only; `.analysis-status .badge`; `.analysis-region-bar .meas-note` and `is-failed`; the FAILED card
  (`.run-card`, `.run-eyebrow`, `.run-title`, `.run-body`, `.run-button`); the record fields `processingError` and
  `processingErrorAt`; the three-clause summary; the Workspace hint.
- Produces: suites that Task 8 runs against the real app. Expected counts: smoke-studies 151 checks (136 before),
  smoke-workspace 100 (two updated), smoke-persist 41 in the run phase and 53 in the restart phase (40 and 47
  before).

**What changes.** The suites were written before 1.0.13 and never re-run against it, so several idle-film
`Processing` probes already disagreed with it. The patch below:
- smoke-studies: idle films read Unsegmented (sections 5 and 7); the running film and the films waiting in a batch
  read Processing (section 12, including the Analysis header of a queued film and a read after the first turn); on
  Stop the waiting film reads Unsegmented again while the film in flight stays Processing (section 13); the
  unreadable SP-9001 ends Failed with the file-not-found sentence, a `processingErrorAt` within two minutes, and the
  dated tooltip (section 11), counted under UNSEGMENTED; section 14b reads its header pill, red region note and
  FAILED card; the rank helper learns `fail` and `unseg` (section 15); a new section 18 clears the failure through
  the Region select (a filmless study: `previewOriginal` only sets a message, it never opens the relocate picker).
  `clickAt` scrolls its target into view first (the Find table overflows horizontally at the default window size
  and clips the STATUS header).
- smoke-persist: phase 1 seeds a Failed film SP-9010 with both fields; phase 2 checks they survive the restart and
  read Failed with the dated title on the row and the header; a failure seeded on the measured SP-9000 reads Failed
  over a red `Last run failed: …` note, and the re-run clears both fields.
- smoke-workspace: the hint and the badges after Load read Unsegmented.
- smoke-parameters: one comment. README: what changed and the new counts.

**Glyph trap (this task).** The patch carries six-character `\u00B7` escapes. Never retype it or open it in
Write or Edit: extract it from this plan file with the script in Step 1, which copies the bytes, and apply it with
`git apply`.

Do **not** launch the app or run the suites; Task 8 does.

- [ ] **Step 1: Extract the patch from this plan**

```bash
python -c "t=open('docs/superpowers/plans/2026-10-01-failed-status-port.md',encoding='utf-8').read();a=t.rindex('<!-- smoke-port.patch:begin -->');b=t.rindex('<!-- smoke-port.patch:end -->');body=t[a:b].split(chr(10));s=[i for i,l in enumerate(body) if l.startswith(chr(96)*4)];open('tools/smoke/out/smoke-port.patch','w',encoding='utf-8',newline='').write(chr(10).join(body[s[0]+1:s[1]])+chr(10));print(s[1]-s[0]-1,'lines')"
```
Expected: `653 lines`.

- [ ] **Step 2: Check and apply it**

```bash
git apply --check tools/smoke/out/smoke-port.patch
```
Expected: no output.
```bash
git apply tools/smoke/out/smoke-port.patch
```
```bash
git diff --stat
```
Expected: `tools/smoke/README.md | 28`, `tools/smoke/smoke-parameters.mjs | 2`, `tools/smoke/smoke-persist.mjs | 78`,
`tools/smoke/smoke-studies.mjs | 252`, `tools/smoke/smoke-workspace.mjs | 13`; `5 files changed, 339 insertions(+), 34 deletions(-)`.

- [ ] **Step 3: Syntax and bytes**

```bash
node --check tools/smoke/smoke-studies.mjs
```
```bash
node --check tools/smoke/smoke-persist.mjs
```
```bash
node --check tools/smoke/smoke-workspace.mjs
```
```bash
node --check tools/smoke/smoke-parameters.mjs
```
Expected: no output from each.
```bash
python -c "import sys;B=chr(92);[print(p, open(p,encoding='utf-8').read().count(B+'u00B7')) for p in sys.argv[1:]]" tools/smoke/smoke-studies.mjs tools/smoke/smoke-persist.mjs tools/smoke/smoke-workspace.mjs
```
Expected: `tools/smoke/smoke-studies.mjs 10`, `tools/smoke/smoke-persist.mjs 1`, `tools/smoke/smoke-workspace.mjs 1`.

Run: `node --test test/*.test.js`
Expected: `ℹ tests 613`, `ℹ pass 613`, `ℹ fail 0` (no unit test changes).

- [ ] **Step 4: Commit**

Delete `tools/smoke/out/smoke-port.patch`, then:
```bash
git add tools/smoke/smoke-studies.mjs tools/smoke/smoke-persist.mjs tools/smoke/smoke-workspace.mjs tools/smoke/smoke-parameters.mjs tools/smoke/README.md
git commit -m "test: smoke suites follow Unsegmented, batch Processing and the dated Failed tooltip (issue #39)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The patch (`tools/smoke/out/smoke-port.patch` once extracted; paths are relative to the repo root):

<!-- smoke-port.patch:begin -->

````diff
diff --git a/tools/smoke/README.md b/tools/smoke/README.md
index b31b79c..c596fd4 100644
--- a/tools/smoke/README.md
+++ b/tools/smoke/README.md
@@ -135,8 +135,14 @@ consequences:
 
 **Sections 10–14 (2026-09-08) segment three more injected copies of the sample film** in two
 batches and fail a third on purpose (`SP-9001` has no bytes and no file). They leave
-`SP-9002`, `SP-9003` and `SP-9005` segmented and `SP-9001`, `SP-9004` unsegmented, so the
-summary ends `n+6 STUDIES · 2 UNSEGMENTED`.
+`SP-9002`, `SP-9003` and `SP-9005` segmented, `SP-9004` unsegmented and — since the 2026-10-01
+Failed-status port (issue #39), which records the failure on the film — `SP-9001` Failed. A Failed
+film counts under UNSEGMENTED, so the summary still ends `n+6 STUDIES · 2 UNSEGMENTED`. Section 14b
+opens `SP-9001` (a Failed header pill with its dated tooltip, a red `Last run failed:` region note, a
+FAILED card) and leaves it Failed, so section 15's status sort meets a Failed row; section 17
+re-injects `SP-9002` and `SP-9003` as throwaway films and deletes them; section 18 changes `SP-9001`'s
+Region, which clears the failure. The suite ends at `n+4 STUDIES · 2 UNSEGMENTED` and a TO REVIEW
+count that depends on what the real runs produced.
 
 **Two of its checks race the backend and can legitimately read 54/56** (found 2026-09-04, on a
 machine warm from repeated runs; four consecutive runs on hand-cleared profiles gave 56, 54, 56,
@@ -176,6 +182,16 @@ restore. Phase 2 briefly moves `predictions/SP-9000.json` aside to exercise the
 `FILM UNAVAILABLE` card and restores it in a `finally`; if a phase-2 run is killed
 mid-section, check for a leftover `predictions/SP-9000.json.bak` before re-running.
 
+Since the 2026-10-01 Failed-status port (issue #39) phase 1 also adds `SP-9010`, an unsegmented
+lumbar film with no file, carrying a `processingError` and a `processingErrorAt` seeded through the
+store (this suite tests that the record persists; `smoke-studies.mjs` drives the real failure path).
+Phase 2 expects both fields back and the film Failed on the list and on the Analysis header, with a
+dated `Segmentation failed` tooltip, before section B; and it seeds a failure on `SP-9000` before
+section E's re-run, which must clear both fields. `SP-9010` stays in the profile. Never run
+`smoke-studies.mjs` on the profile smoke-persist leaves behind: the Failed `SP-9010` counts under
+UNSEGMENTED and is offered by the batch button, so its summary and button counts would be off by
+one; `smoke-studies.mjs` always needs a fresh launch.
+
 ### `--phase measurefail` is parked — do not try to run it
 
 **There is currently no way to make `/measure` fail without wedging the app, so this phase
@@ -299,6 +315,14 @@ per record, so the Find tab's newest-first default sort keeps scan order), 100/1
 and that the re-run cleared the mark. Every check in the suite runs
 unconditionally; there is no skip path.
 
+**2026-10-01 (issue #39, the Failed-status port on 1.0.13):** `smoke-studies.mjs` goes from 136 to 151
+checks (the header pills in sections 5, 7 and 12; the Failed pill with its dated tooltip and the
+summary after section 11; the pills after the first batch turn and around Stop; section 14b's four
+and section 18's four) and several are reworded; `smoke-persist.mjs` gains one check in phase 1 and
+six in phase 2; `smoke-workspace.mjs` keeps its 100 checks, two of them updated (the hint and the
+badges after Load). The suites were never run against 1.0.13 itself, and the counts above predate
+the port; they are replaced with what the suites print once they have run against the real app on it.
+
 ## Running the Parameters suite
 
 `smoke-parameters.mjs` drives the Studies screen's Parameters tab (pre-op/post-op spec task 1):
diff --git a/tools/smoke/smoke-parameters.mjs b/tools/smoke/smoke-parameters.mjs
index d8145a2..9501ba2 100644
--- a/tools/smoke/smoke-parameters.mjs
+++ b/tools/smoke/smoke-parameters.mjs
@@ -8,7 +8,7 @@
 //
 // Four records are injected straight into the store -- SP-9100 unsegmented, SP-9101, SP-9102 and
 // SP-9103 segmented under one workspace root (S001 Pre-op and Post-op, a pair, and S002 Pre-op,
-// unpaired) -- and removed in `finally`, so a later suite never meets a stray Processing row.
+// unpaired) -- and removed in `finally`, so a later suite never meets a stray Unsegmented row.
 // Each segmented record has measurements but no geometry, which is fine in-session (status is
 // derived from measurements alone) but would be nulled by validate() on a restart; that is one
 // more reason the cleanup runs unconditionally.
diff --git a/tools/smoke/smoke-persist.mjs b/tools/smoke/smoke-persist.mjs
index 188aea8..adb9c78 100644
--- a/tools/smoke/smoke-persist.mjs
+++ b/tools/smoke/smoke-persist.mjs
@@ -17,6 +17,9 @@
 // that back and asserts the record, the film and the prediction snapshot all survived the
 // restart. Phase 3 would cover the one thing phases 1-2 cannot -- what a FAILED /measure restores
 // -- but see PARKED below. The scratch profile is SPINE_CONTOUR_USER_DATA, as launch.mjs defaults.
+// (2026-10-01, issue #39 port) Phase 1 also seeds a failure -- processingError and processingErrorAt --
+// on a second, unsegmented film, FAILED_ID, which phase 2 expects to read Failed, dated, after the
+// restart; phase 2 seeds one on SP-9000 before its re-run, which must clear both fields.
 //
 // WHY PHASE 3 IS ITS OWN APP SESSION. recordPrediction's third argument reaches nothing but the
 // measure queue's `measured` map (via replaceMeasured), and that map is read in exactly one
@@ -72,6 +75,11 @@ const OUT_DIR = path.join(HERE, 'out');
 const STATE_FILE = path.join(OUT_DIR, 'persist-state.json');
 const USER_DATA = process.env.SPINE_CONTOUR_USER_DATA || path.join(os.tmpdir(), 'spine-contour-smoke');
 const STUDY_ID = 'SP-9000';
+// (2026-10-01, issue #39 port) A real, unsegmented film carrying a stored failure, reserved for this
+// suite (no other suite injects SP-9010), and the failure seeded on it in the two fields the record
+// keeps (port spec 4): a real backend sentence (backend/film_detection.py) at a fixed time.
+const FAILED_ID = 'SP-9010';
+const SEEDED_FAILURE = { processingError: 'Automatic film detection was inconclusive. Choose cervical, lumbar or standing / full spine manually.', processingErrorAt: '2026-09-29T12:00:00.000Z' };
 const SIDECAR = path.join(USER_DATA, 'predictions', `${STUDY_ID}.json`);
 const JPEG_PREFIX = 'data:image/jpeg;base64,';
 
@@ -115,6 +123,15 @@ const storedStudy = () => cdp.evaluate(`import('./renderer/store.js').then((m) =
 const sidecarFromApp = () => cdp.evaluate(`window.spineContour.loadPrediction(${JSON.stringify(STUDY_ID)})`);
 const text = (selector) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); return e ? e.textContent : null; })()`);
 const l1sa = (geometry) => (geometry && geometry.vertebrae && geometry.vertebrae.L1 ? geometry.vertebrae.L1.superior[0] : null);
+// (2026-10-01, issue #39 port) A status pill as the page shows it: classes, label and title (null when
+// it has none). A Failed pill's title is `Segmentation failed`, a middle dot and the date of
+// processingErrorAt in reviewedLabel's format, a newline, then the reason (port spec 5). The date is
+// formatted here, in Node, on the same machine and time zone as the app.
+const statusPill = (selector) => cdp.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); return b ? { cls: b.className, text: b.textContent.trim(), title: b.getAttribute('title') } : null; })()`);
+const FAILED_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
+const SEEDED_TITLE = `Segmentation failed \u00B7 ${FAILED_DATE.format(new Date(SEEDED_FAILURE.processingErrorAt))}\n${SEEDED_FAILURE.processingError}`;
+const isSeededFailedPill = (pill) => Boolean(pill) && pill.cls === 'badge badge-fail' && pill.text === 'Failed' && pill.title === SEEDED_TITLE;
+const regionNote = () => cdp.evaluate(`(() => { const e = document.querySelector('.analysis-region-bar .meas-note'); return e ? { text: e.textContent, failed: e.classList.contains('is-failed') } : null; })()`);
 
 // The card as it reads on screen, plus the two toolbar buttons the film's state gates.
 const stageState = () => cdp.evaluate(`(() => {
@@ -458,6 +475,25 @@ try {
     await cdp.settle(150);
     check('the subject is on the record', (await storedStudy())?.subjectId === 'PERSIST-01', null);
 
+    // 11c. (2026-10-01, issue #39 port, port spec 4) A real unsegmented film carrying a failure and its
+    // time, seeded through the store beside SP-9000: this suite tests that both fields survive a
+    // restart; smoke-studies.mjs drives the real failure path. newStudy gives it the app's own record
+    // shape; lumbar, so opening it after the restart starts no original-preview read, and no file, so
+    // nothing can run it. Phase 2 expects it Failed, dated, on the list and on the Analysis header.
+    await cdp.evaluate(`(async () => {
+      const { newStudy } = await import('./renderer/screens/studies.js');
+      const store = await import('./renderer/store.js');
+      const record = { ...newStudy({ id: ${JSON.stringify(FAILED_ID)}, fileName: 'persist-failed.png', filePath: null }), region: 'lumbar', ...${JSON.stringify(SEEDED_FAILURE)} };
+      store.setState((st) => ({ studies: [record, ...st.studies.filter((x) => x.id !== record.id)] }));
+      return true;
+    })()`);
+    const failedSaved = await waitFor(async () => {
+      const raw = await cdp.evaluate(`window.spineContour.loadStudies().then((r) => (r.studies || []).find((x) => x.id === ${JSON.stringify(FAILED_ID)}) ?? null)`);
+      return raw && raw.measurements === null && raw.processingError === SEEDED_FAILURE.processingError && raw.processingErrorAt === SEEDED_FAILURE.processingErrorAt ? raw : null;
+    }, 5000);
+    check(`studies.json holds ${FAILED_ID} unsegmented, with its seeded processingError and processingErrorAt`, Boolean(failedSaved),
+      failedSaved ? { processingError: failedSaved.processingError, processingErrorAt: failedSaved.processingErrorAt } : null);
+
     // 12. Hand phase 2 the CORRECTED study, once studies.json has actually caught up with it.
     const final = await openStudy();
     check('the study is still open at the end of the phase', Boolean(final), null);
@@ -497,6 +533,31 @@ try {
     check('the restored geometry is the CORRECTION, not the prediction', Boolean(restored && sidecarAtStart) && !same(restored.geometry, sidecarAtStart.geometry), null);
     check('the sidecar still holds the model\'s own geometry', Boolean(sidecarAtStart && before) && !same(sidecarAtStart.geometry, before.geometry), null);
 
+    // A2. (2026-10-01, issue #39 port, port spec 4) The failure phase 1 seeded on FAILED_ID came back
+    // through validateStudy with its time, and the film reads Failed on the list and on the Analysis
+    // header, the dated reason one hover away. Before section B on purpose: this film has no result,
+    // so opening it reads no sidecar and leaves the film cache empty, as section B needs (the ORDER
+    // NOTE at the top).
+    const failedRestored = await cdp.evaluate(`import('./renderer/store.js').then((m) => m.getState().studies.find((x) => x.id === ${JSON.stringify(FAILED_ID)}) ?? null)`);
+    check(`${FAILED_ID} kept processingError and processingErrorAt through the restart and is still unsegmented`,
+      Boolean(failedRestored) && failedRestored.measurements === null
+      && failedRestored.processingError === SEEDED_FAILURE.processingError && failedRestored.processingErrorAt === SEEDED_FAILURE.processingErrorAt,
+      failedRestored ? { processingError: failedRestored.processingError, processingErrorAt: failedRestored.processingErrorAt } : null);
+    await cdp.setState('{ ack: true, screen: "studies", query: "" }');
+    await cdp.settle(120);
+    const failedRowPill = await statusPill(`.studies-row[data-study-id="${FAILED_ID}"] .badge`);
+    check('its row reads Failed, titled with the dated line and the reason', isSeededFailedPill(failedRowPill), failedRowPill);
+    const failedRow = await cdp.rect(`.studies-row[data-study-id="${FAILED_ID}"]`);
+    if (failedRow) {
+      await cdp.click(failedRow.cx, failedRow.cy);
+      await cdp.settle(150);
+    }
+    const failedOpenId = (await cdp.state()).openId;
+    const failedHeaderPill = await statusPill('.analysis-status .badge');
+    check('opening it, the Analysis header pill is badge badge-fail, Failed, with the same title',
+      failedOpenId === FAILED_ID && isSeededFailedPill(failedHeaderPill), { failedOpenId, failedHeaderPill });
+    check('back button returns to Studies from the failed film', await backToStudies(), null);
+
     // B. Missing sidecar FIRST (see the ORDER NOTE at the top): the film cache is still empty,
     // so this open really does read the sidecar, and a failed read leaves the cache empty.
     const sidecarOnDisk = fs.existsSync(SIDECAR);
@@ -628,6 +689,20 @@ try {
         const stageBefore = await stageState();
         check('the toolbar Re-run segmentation button is enabled before the re-run', stageBefore.rerunDisabled === false, stageBefore);
 
+        // (2026-10-01, issue #39 port, P6 and port spec 4) A successful run writes processingError: null
+        // and processingErrorAt: null beside reviewedAt: null. Seeded through the store on this
+        // MEASURED study, which then reads Failed -- 1.0.13's rule: a failure outranks measurements --
+        // with the red region note; only the re-run below can clear it.
+        await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((st) => ({ studies: st.studies.map((x) => (x.id === ${JSON.stringify(STUDY_ID)} ? { ...x, ...${JSON.stringify(SEEDED_FAILURE)} } : x)) })))`);
+        await cdp.settle(150);
+        const seeded = await storedStudy();
+        const seededPill = await statusPill('.analysis-status .badge');
+        const seededNote = await regionNote();
+        check('a failure seeded on the measured study reads Failed in the header, dated, over a red Last run failed note',
+          Boolean(seeded) && seeded.processingError === SEEDED_FAILURE.processingError && seeded.processingErrorAt === SEEDED_FAILURE.processingErrorAt
+          && isSeededFailedPill(seededPill) && Boolean(seededNote) && seededNote.text === `Last run failed: ${SEEDED_FAILURE.processingError}` && seededNote.failed === true,
+          { seeded: seeded ? [seeded.processingError, seeded.processingErrorAt] : null, seededPill, seededNote });
+
         // Arm the completion watcher BEFORE the click, the way run-and-wait.js does: `running`
         // goes to the study id and back to null inside the run, and a poll could miss both edges.
         // Bounded IN THE PAGE at 400 s, the cap run-and-wait.js uses for this film, so a run that
@@ -679,6 +754,9 @@ try {
         const afterRerun = await openStudy();
         check('the study still carries measurements and geometry after the re-run', Boolean(afterRerun && afterRerun.measurements && afterRerun.geometry), null);
         check('the re-run cleared the review mark (studies-table spec 8.4, site 1)', Boolean(afterRerun) && afterRerun.reviewedAt === null, afterRerun ? afterRerun.reviewedAt : null);
+        check('the re-run cleared the seeded processingError and processingErrorAt (port spec 4, the success commit)',
+          Boolean(afterRerun) && afterRerun.processingError === null && afterRerun.processingErrorAt === null,
+          afterRerun ? [afterRerun.processingError, afterRerun.processingErrorAt] : null);
 
         const recreated = fs.existsSync(SIDECAR);
         check('the re-run recreated the prediction sidecar on disk', recreated, SIDECAR);
diff --git a/tools/smoke/smoke-studies.mjs b/tools/smoke/smoke-studies.mjs
index 1be56e1..9ab1b3a 100644
--- a/tools/smoke/smoke-studies.mjs
+++ b/tools/smoke/smoke-studies.mjs
@@ -10,7 +10,10 @@
 // DOM-only sections and needs the Python backend up. Both runs are deliberate: `state.running`
 // is an id, and the only way to prove the list badges the RIGHT study is to watch a real run.
 // Sections 10–14 (2026-09-08) add three batches over injected copies of the same film — two
-// films, one unreadable film, and two films with a Stop — about three more real runs.
+// films, one unreadable film, and two films with a Stop — about three more real runs. Since
+// 2026-10-01 (issue #39, the Failed-status port on 1.0.13) section 11 leaves the unreadable film
+// Failed, section 14b reads that failure on its Analysis screen, and section 18 clears it through
+// its Region select.
 //
 // Two consequences for whoever sequences the suites:
 //   * NEVER run this between `smoke-persist.mjs --phase run` and `--phase restart`. Section 5
@@ -34,6 +37,23 @@ function check(name, ok, detail) {
 const rowCount = (cdp) => cdp.evaluate("document.querySelectorAll('.studies-row').length");
 const text = (cdp, selector) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); return e ? e.textContent : null; })()`);
 const clearSearch = (cdp) => cdp.evaluate("(() => { const el = document.querySelector('.studies-search'); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); })()");
+// (2026-10-01, issue #39 port) A status pill as the page shows it: its classes, its label and its
+// title, which only a Failed pill carries (getAttribute reads null when there is none). null with no
+// pill.
+const statusPill = (cdp, selector) => cdp.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); return b ? { cls: b.className, text: b.textContent.trim(), title: b.getAttribute('title') } : null; })()`);
+// What section 11's batch `file not found` stores on SP-9001 (port spec 5, renderer/data/failure.js).
+// The closing toast keeps the raw `file not found`.
+const FILE_NOT_FOUND_REASON = 'The film was not found at its saved location. Run segmentation from its Analysis screen to choose its new location.';
+// The Failed pill's title as failure.js failureTitle builds it (port spec 5): `Segmentation failed`,
+// a middle dot and the date in reviewedLabel's format, a newline, then the reason; no date when `at`
+// does not parse. The date is formatted here, in Node, from the record's own processingErrorAt, on
+// the same machine and time zone as the app, so the check pins the format without guessing the
+// moment.
+const FAILED_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
+const failedTitle = (reason, at) => {
+  const time = Date.parse(at ?? '');
+  return `${Number.isNaN(time) ? 'Segmentation failed' : `Segmentation failed \u00B7 ${FAILED_DATE.format(new Date(time))}`}\n${reason}`;
+};
 
 const cdp = await connect();
 
@@ -211,6 +231,11 @@ try {
   check('SP-9000 is unsegmented (measurements === null)', Boolean(sp9000) && sp9000.measurements === null, sp9000);
   const runCard = await cdp.evaluate("(() => { const card = document.querySelector('.run-card'); const btn = document.querySelector('.run-button'); return { visible: Boolean(card) && !card.classList.contains('is-hidden'), label: btn ? btn.textContent : null, eyebrow: document.querySelector('.run-eyebrow')?.textContent }; })()");
   check('the run card is visible, UNSEGMENTED, with a Run segmentation button', runCard.visible === true && runCard.label === 'Run segmentation' && runCard.eyebrow === 'UNSEGMENTED', runCard);
+  // (2026-10-01, issue #39 port, P1) An idle film with no result reads Unsegmented -- Processing is
+  // only the running film and the films waiting in a batch -- and its pill carries no title; only a
+  // Failed pill does.
+  const header5 = await statusPill(cdp, '.analysis-status .badge');
+  check('the header pill of the idle unsegmented study reads Unsegmented, with no title', Boolean(header5) && header5.cls === 'badge badge-unseg' && header5.text === 'Unsegmented' && header5.title === null, header5);
 
   const backRect2 = await cdp.rect('.icon-btn[aria-label="Back to studies"]');
   await cdp.click(backRect2.cx, backRect2.cy);
@@ -221,8 +246,9 @@ try {
     if (!row) return null;
     return {
       id: row.dataset.studyId,
-      badgeProc: Boolean(row.querySelector('.badge-proc')),
-      badgeText: row.querySelector('.badge-proc')?.textContent,
+      badgeUnseg: Boolean(row.querySelector('.badge-unseg')),
+      badgeText: row.querySelector('.badge-unseg')?.textContent,
+      badgeTitle: row.querySelector('.badge')?.getAttribute('title') ?? null,
       subject: row.querySelector('.studies-cell-subject')?.textContent.trim(),
       name: row.querySelector('.studies-cell-id')?.textContent,
       workspace: row.querySelector('.studies-cell-workspace')?.textContent,
@@ -230,7 +256,8 @@ try {
       demoPill: Boolean(row.querySelector('.pill-demo')),
     };
   })()`);
-  check('the new study is the first row, Processing, no DEMO pill', newRow && newRow.id === 'SP-9000' && newRow.badgeProc && newRow.badgeText === 'Processing' && newRow.subject === '—' && newRow.demoPill === false, newRow);
+  // (2026-10-01, issue #39 port, P1) Unsegmented, not Processing: nothing is running it.
+  check('the new study is the first row, Unsegmented with no title, no DEMO pill', newRow && newRow.id === 'SP-9000' && newRow.badgeUnseg && newRow.badgeText === 'Unsegmented' && newRow.badgeTitle === null && newRow.subject === '—' && newRow.demoPill === false, newRow);
   check('the injected study is named after its file, not its id',
     newRow && newRow.name === '13462cd9-a59f-4aab-9256-cbd723fb978c', newRow && newRow.name);
   // Added by hand: no workspace, but the folder is still derived from the film's own path.
@@ -282,11 +309,15 @@ try {
     buttonDisabled: document.querySelector('.run-button')?.disabled,
   }))()`);
   check("the running study's own card reads RUNNING with a spinner", cardWhileRunning.eyebrow === 'RUNNING' && cardWhileRunning.spinnerHidden === false && cardWhileRunning.buttonLabel === 'Working…' && cardWhileRunning.buttonDisabled === true, cardWhileRunning);
-
-  // Back to Studies mid-run, the way a user would. NOTE: SP-9000 is unsegmented here, so
-  // deriveStatus already returns 'proc' for it -- this pass proves the badge and the summary
-  // agree during a run, and section 8 below is what actually proves the "or currently running"
-  // rule, against a study deriveStatus calls 'seg'.
+  // (2026-10-01, issue #39 port, P1) Processing is the running film's pill, and it carries no title.
+  const headerWhileRunning = await statusPill(cdp, '.analysis-status .badge');
+  check("the running study's header pill reads Processing, with no title", Boolean(headerWhileRunning) && headerWhileRunning.cls === 'badge badge-proc' && headerWhileRunning.text === 'Processing' && headerWhileRunning.title === null, headerWhileRunning);
+
+  // Back to Studies mid-run, the way a user would. SP-9000 is unsegmented here; since the port
+  // (2026-10-01, issue #39) an idle unsegmented film derives 'unseg', so its Processing pill is
+  // already the "or currently running" rule at work, and this pass also proves the badges and the
+  // summary agree during a run. Section 8 below proves the same rule against a study deriveStatus
+  // calls 'seg'.
   const backRect4 = await cdp.rect('.icon-btn[aria-label="Back to studies"]');
   await cdp.click(backRect4.cx, backRect4.cy);
   await cdp.settle(200);
@@ -297,12 +328,15 @@ try {
     return {
       badgeProc: Boolean(row && row.querySelector('.badge-proc')),
       badgeText: row ? row.querySelector('.badge')?.textContent : null,
+      badgeTitle: row?.querySelector('.badge')?.getAttribute('title') ?? null,
       queued: m ? Number(m[2]) : null,
-      procRows: document.querySelectorAll('.studies-row .badge-proc').length,
+      // (2026-10-01, issue #39 port) UNSEGMENTED counts every film shown as Processing, Unsegmented
+      // or Failed (port spec 3), so those are the badges it is compared with.
+      unsegRows: document.querySelectorAll('.studies-row .badge-proc, .studies-row .badge-unseg, .studies-row .badge-fail').length,
     };
   })()`);
-  check('the running study is badged Processing in the list', listWhileRunning.badgeProc === true && listWhileRunning.badgeText === 'Processing', listWhileRunning);
-  check('the summary UNSEGMENTED count matches the Processing badges', listWhileRunning.queued !== null && listWhileRunning.queued === listWhileRunning.procRows && listWhileRunning.queued >= 1, listWhileRunning);
+  check('the running study is badged Processing in the list, with no title', listWhileRunning.badgeProc === true && listWhileRunning.badgeText === 'Processing' && listWhileRunning.badgeTitle === null, listWhileRunning);
+  check('the summary UNSEGMENTED count matches the Processing, Unsegmented and Failed badges', listWhileRunning.queued !== null && listWhileRunning.queued === listWhileRunning.unsegRows && listWhileRunning.queued >= 1, listWhileRunning);
 
   // The lie the id change exists to prevent: opening a DIFFERENT study mid-run must not make
   // that study's card read RUNNING. The `running` re-read is part of the assertion, not
@@ -333,10 +367,10 @@ try {
   check('the run leaves SP-9000 with measurements and geometry', Boolean(ran && ran.measurements && ran.geometry), ran ? { hasMeas: Boolean(ran.measurements), hasGeom: Boolean(ran.geometry) } : null);
 
   // 8. The "or currently running" badge rule itself (studies.js buildRow), against a study
-  // deriveStatus does NOT call 'proc'. Section 7's pass cannot fail if that rule is deleted --
-  // an unsegmented study derives 'proc' anyway -- so the rule is only actually under test here,
-  // on the SP-9000 section 7 just segmented. Deterministic for the same reason: its bytes are
-  // still in this session's payload map, so the re-run starts.
+  // deriveStatus calls 'seg' or 'rev': the SP-9000 section 7 just segmented. (Since the port,
+  // 2026-10-01, issue #39, section 7 exercises the rule too -- an idle unsegmented study derives
+  // 'unseg', not 'proc' -- but only on an unsegmented film.) Deterministic: its bytes are still in
+  // this session's payload map, so the re-run starts.
   await cdp.setState('{ screen: "studies" }');
   await cdp.settle(200);
   const badgeAtRest = await cdp.evaluate(`(() => {
@@ -371,11 +405,12 @@ try {
       proc: Boolean(row && row.querySelector('.badge-proc')),
       text: row ? row.querySelector('.badge')?.textContent : null,
       queued: m ? Number(m[2]) : null,
-      procRows: document.querySelectorAll('.studies-row .badge-proc').length,
+      // (2026-10-01, issue #39 port) As in section 7: Processing, Unsegmented and Failed all count.
+      unsegRows: document.querySelectorAll('.studies-row .badge-proc, .studies-row .badge-unseg, .studies-row .badge-fail').length,
     };
   })()`);
   check('a SEGMENTED study reads Processing while it is the running study', badgeWhileRerunning.proc === true && badgeWhileRerunning.text === 'Processing', badgeWhileRerunning);
-  check('the summary counts the re-running study as unsegmented', badgeWhileRerunning.queued === badgeWhileRerunning.procRows && badgeWhileRerunning.queued >= 1, badgeWhileRerunning);
+  check('the summary counts the re-running study as unsegmented', badgeWhileRerunning.queued === badgeWhileRerunning.unsegRows && badgeWhileRerunning.queued >= 1, badgeWhileRerunning);
 
   const rerunFinished = await waitForState('s.running === null', 400000);
   s = await cdp.state();
@@ -440,7 +475,12 @@ try {
   };
   // A missing element is a FAIL in the results, never a throw: the suite prints its results only at
   // the end, and a throw here would print nothing (HANDOFF's silent-suite trap).
-  const clickAt = async (selector) => { const r = await cdp.rect(selector); if (r) await cdp.click(r.cx, r.cy); return Boolean(r); };
+  // (2026-09-29, issue #39) Scroll first: at the default window the Find table scrolls sideways and the STATUS header sits at its clipped edge.
+  const clickAt = async (selector) => {
+    await cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (e) e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); })()`);
+    await cdp.settle(50);
+    const r = await cdp.rect(selector); if (r) await cdp.click(r.cx, r.cy); return Boolean(r);
+  };
   const FILTERS_RESET = '{ workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, subject: "", pairedOnly: false, pairedWith: "__any__" }';
 
   // 10. The filter bar and the ticks. SP-9001 sits under a workspace root, with no bytes and no
@@ -514,16 +554,33 @@ try {
   check('a checked select-all clears every visible real row', s.paramSelected.length === 0, s.paramSelected);
 
   // 11. A batch over a film that is not on disk ends in seconds with the failure named (spec 10).
+  // (2026-10-01, issue #39 port) The toast keeps the raw `file not found` (port spec P5); the record
+  // keeps the failure as port spec 5's sentence with the time it was written, so from here SP-9001
+  // reads Failed, dated, and still counts under UNSEGMENTED (port spec 3).
   await cdp.setState('{ paramSelected: ["SP-9001"] }');
   await cdp.settle(150);
   const bar11 = await readBar();
   check('with the unreadable film ticked the button offers it', bar11.label === 'Segment 1 selected' && bar11.disabled === false, bar11);
+  const summaryBefore11 = await summaryParts();
   await clickAt('[data-find-key="segment"]');
   const failed11 = await waitForState('s.toast.startsWith("Segmented 0 of 1")', 15000);
   s = await cdp.state();
   const sp9001 = s.studies.find((x) => x.id === 'SP-9001');
   check('the batch ends with the film counted as failed and named in the toast', failed11 === true && s.toast === 'Segmented 0 of 1 film. · 1 could not be segmented: S001 (file not found)', s.toast);
-  check('the unreadable film is untouched and the batch is cleared', s.batch === null && s.running === null && sp9001 && sp9001.measurements === null, { batch: s.batch, running: s.running });
+  check('the unreadable film records the failure and its time, with no result, and the batch is cleared',
+    s.batch === null && s.running === null && Boolean(sp9001) && sp9001.measurements === null
+    && sp9001.processingError === FILE_NOT_FOUND_REASON && typeof sp9001.processingErrorAt === 'string' && !Number.isNaN(Date.parse(sp9001.processingErrorAt))
+    && Math.abs(Date.now() - Date.parse(sp9001.processingErrorAt)) < 120000,
+    { batch: s.batch, running: s.running, processingError: sp9001 ? sp9001.processingError : null, processingErrorAt: sp9001 ? sp9001.processingErrorAt : null });
+  const pill11 = await statusPill(cdp, '.studies-row[data-study-id="SP-9001"] .badge');
+  check('after its turn the unreadable film reads Failed, its tooltip the dated line and the stored reason',
+    Boolean(pill11) && Boolean(sp9001) && pill11.cls === 'badge badge-fail' && pill11.text === 'Failed'
+    && pill11.title === failedTitle(FILE_NOT_FOUND_REASON, sp9001.processingErrorAt) && /^Segmentation failed \u00B7 [A-Z][a-z]{2} \d{1,2}, \d{4}\n/.test(pill11.title),
+    { pill11, processingErrorAt: sp9001 ? sp9001.processingErrorAt : null });
+  const summary11 = await summaryParts();
+  check('the summary keeps its three clauses and counts the Failed film under UNSEGMENTED',
+    summaryBefore11 !== null && summary11 !== null && summary11.studies === summaryBefore11.studies && summary11.unsegmented === summaryBefore11.unsegmented,
+    { summaryBefore11, summary11 });
 
   // 12. A real two-film batch (spec 9's worked example at fixture scale): the count, the badges,
   // the sidebar, the cards mid-batch, the toast, the ticks afterwards.
@@ -532,7 +589,9 @@ try {
   await cdp.setState('{ paramSelected: [] }');
   await cdp.settle(200);
   const bar12Plain = await readBar();
-  check('with nothing ticked the button counts every visible unsegmented film', bar12Plain.label === 'Segment 3 unsegmented' && bar12Plain.disabled === false, bar12Plain);
+  // (2026-10-01, issue #39 port, P6) SP-9001 is Failed since section 11 and a batch offers a Failed
+  // film again, so the three are SP-9001, SP-9002 and SP-9003.
+  check('with nothing ticked the button counts every visible unsegmented film, the Failed one included', bar12Plain.label === 'Segment 3 unsegmented' && bar12Plain.disabled === false, bar12Plain);
   await cdp.setState('{ paramSelected: ["SP-9002", "SP-9003"] }');
   await cdp.settle(150);
   const bar12 = await readBar();
@@ -545,7 +604,22 @@ try {
   const progress12a = await readProgress();
   check('the bar shows 0 of 2 done, an enabled Stop and no segment button', progress12a.text === '0 of 2 done' && progress12a.stopDisabled === false && progress12a.segmentButton === false, progress12a);
   check('the sidebar Studies row reads 0 OF 2 DONE', progress12a.sidebar === '0 OF 2 DONE', progress12a.sidebar);
-  check('the running, the queued and the unreadable film all read Processing', progress12a.procRows === 3, progress12a.procRows);
+  // (2026-10-01, issue #39 port, P1) This check used to pin all three at Processing. Now the film in
+  // flight and the film waiting its turn read Processing from the click, and the film the earlier
+  // batch could not find reads Failed, its dated reason one hover away.
+  const pills12 = {
+    running: await statusPill(cdp, '.studies-row[data-study-id="SP-9003"] .badge'),
+    queued: await statusPill(cdp, '.studies-row[data-study-id="SP-9002"] .badge'),
+    failed: await statusPill(cdp, '.studies-row[data-study-id="SP-9001"] .badge'),
+  };
+  const sp9001at12 = s.studies.find((x) => x.id === 'SP-9001');
+  check('the running and the queued film read Processing and the unreadable film reads Failed with its dated reason',
+    progress12a.procRows === 2
+    && pills12.running?.cls === 'badge badge-proc' && pills12.running.text === 'Processing' && pills12.running.title === null
+    && pills12.queued?.cls === 'badge badge-proc' && pills12.queued.text === 'Processing' && pills12.queued.title === null
+    && pills12.failed?.cls === 'badge badge-fail' && pills12.failed.text === 'Failed'
+    && Boolean(sp9001at12) && pills12.failed.title === failedTitle(FILE_NOT_FOUND_REASON, sp9001at12.processingErrorAt),
+    { procRows: progress12a.procRows, ...pills12 });
 
   // The cards mid-batch. The injected film segments in roughly 9 s; two openings take about 1 s.
   await clickAt('.studies-row[data-study-id="SP-9002"]');
@@ -555,12 +629,30 @@ try {
     disabled: document.querySelector('.run-button')?.disabled, buttonTitle: document.querySelector('.run-button')?.title,
   }))()`);
   check('a queued film opened mid-batch reads QUEUED, waiting for its turn, its run button disabled', queuedCard.eyebrow === 'QUEUED' && queuedCard.title === 'Waiting for its turn in the batch' && queuedCard.disabled === true && queuedCard.buttonTitle === 'Wait for the batch to finish', queuedCard);
+  // (2026-10-01, issue #39 port, P1 and port spec 3) The card keeps its QUEUED wording; the header
+  // pill passes state.batch to displayStatus as the list does, so it reads Processing (and still
+  // would once the film's turn starts).
+  const queuedHeader = await statusPill(cdp, '.analysis-status .badge');
+  check("a queued film's Analysis header pill reads Processing, with no title", Boolean(queuedHeader) && queuedHeader.cls === 'badge badge-proc' && queuedHeader.text === 'Processing' && queuedHeader.title === null, queuedHeader);
   await clickAt('.icon-btn[aria-label="Back to studies"]');
   await cdp.settle(150);
   await clickAt('.studies-row[data-study-id="SP-9001"]');
   await cdp.settle(200);
-  const outsideCard = await cdp.evaluate(`(() => ({ eyebrow: document.querySelector('.run-eyebrow')?.textContent, title: document.querySelector('.run-title')?.textContent, disabled: document.querySelector('.run-button')?.disabled, buttonTitle: document.querySelector('.run-button')?.title }))()`);
-  check('an unsegmented film outside the batch reads UNSEGMENTED with its run button disabled for the batch', outsideCard.eyebrow === 'UNSEGMENTED' && outsideCard.title === 'No segmentation yet' && outsideCard.disabled === true && outsideCard.buttonTitle === 'Wait for the batch to finish', outsideCard);
+  // (2026-10-01, issue #39 port, P4) SP-9001 is Failed since section 11: outside the batch its card
+  // reads FAILED with the stored reason, and the same Run segmentation button is disabled for the
+  // batch, by UNSEGMENTED's rules.
+  const outsideCard = await cdp.evaluate(`(() => {
+    const card = document.querySelector('.run-card');
+    return {
+      visible: Boolean(card) && !card.classList.contains('is-hidden'),
+      eyebrow: document.querySelector('.run-eyebrow')?.textContent, title: document.querySelector('.run-title')?.textContent,
+      body: document.querySelector('.run-body')?.textContent, label: document.querySelector('.run-button')?.textContent,
+      disabled: document.querySelector('.run-button')?.disabled, buttonTitle: document.querySelector('.run-button')?.title,
+    };
+  })()`);
+  check('a Failed film outside the batch reads FAILED with its stored reason, its run button disabled for the batch',
+    outsideCard.visible === true && outsideCard.eyebrow === 'FAILED' && outsideCard.title === 'Segmentation failed' && outsideCard.body === FILE_NOT_FOUND_REASON
+    && outsideCard.label === 'Run segmentation' && outsideCard.disabled === true && outsideCard.buttonTitle === 'Wait for the batch to finish', outsideCard);
   await clickAt('.icon-btn[aria-label="Back to studies"]');
   await cdp.settle(150);
 
@@ -568,6 +660,16 @@ try {
   const oneDone12 = await waitForState('s.batch !== null && s.batch.done === 1', 120000);
   const progress12b = await readProgress();
   check('after the first film the bar reads 1 of 2 done and the sidebar 1 OF 2 DONE', oneDone12 === true && progress12b.text === '1 of 2 done' && progress12b.sidebar === '1 OF 2 DONE', progress12b);
+  // (2026-10-01, issue #39 port, P1) Each film changes to its result as its turn ends: the first has
+  // left Processing for its own status, and the second, waiting or by now in flight, still reads
+  // Processing.
+  const pills12b = {
+    first: await statusPill(cdp, '.studies-row[data-study-id="SP-9003"] .badge'),
+    second: await statusPill(cdp, '.studies-row[data-study-id="SP-9002"] .badge'),
+  };
+  check('after the first turn the film it ran reads its result and the other still reads Processing',
+    oneDone12 === true && Boolean(pills12b.first) && ['badge badge-seg', 'badge badge-rev'].includes(pills12b.first.cls)
+    && pills12b.second?.cls === 'badge badge-proc' && pills12b.second.text === 'Processing', pills12b);
   const finished12 = await waitForState('s.batch === null', 400000);
   s = await cdp.state();
   const a12 = s.studies.find((x) => x.id === 'SP-9002');
@@ -590,23 +692,81 @@ try {
   const started13 = await waitForState('s.batch !== null && s.running !== null', 5000);
   const running13 = (await cdp.state()).running;
   check('the second batch starts with SP-9005 in flight', started13 === true && running13 === 'SP-9005', running13);
+  // (2026-10-01, issue #39 port, P1) Both films read Processing from the click. On Stop the film still
+  // waiting goes straight back to its own status (it will not run); the film in flight stays
+  // Processing until it finishes. The pills are read BEFORE the state below, so `running` still
+  // naming SP-9005 there proves it was in flight when they were read.
+  const readPills13 = async () => ({
+    inFlight: await statusPill(cdp, '.studies-row[data-study-id="SP-9005"] .badge'),
+    waiting: await statusPill(cdp, '.studies-row[data-study-id="SP-9004"] .badge'),
+  });
+  const pills13a = await readPills13();
   await clickAt('[data-find-key="stop"]');
   await cdp.settle(150);
   const stopping13 = await readProgress();
+  const pills13b = await readPills13();
   s = await cdp.state();
   check('Stop marks the batch stopping: the text, the disabled Stop and the sidebar say so', stopping13.text === 'Stopping after this film…' && stopping13.stopDisabled === true && stopping13.sidebar === 'STOPPING', stopping13);
   check('the film in flight keeps running after Stop', s.running === 'SP-9005' && s.batch && s.batch.stopping === true, { running: s.running, batch: s.batch });
+  check('both films read Processing before Stop; after it the film left waiting reads Unsegmented and the film in flight still Processing',
+    pills13a.inFlight?.cls === 'badge badge-proc' && pills13a.waiting?.cls === 'badge badge-proc'
+    && s.running === 'SP-9005' && pills13b.inFlight?.cls === 'badge badge-proc' && pills13b.inFlight.text === 'Processing'
+    && pills13b.waiting?.cls === 'badge badge-unseg' && pills13b.waiting.text === 'Unsegmented' && pills13b.waiting.title === null,
+    { before: pills13a, after: pills13b, running: s.running });
   const finished13 = await waitForState('s.batch === null', 400000);
   s = await cdp.state();
   const c13 = s.studies.find((x) => x.id === 'SP-9004');
   const d13 = s.studies.find((x) => x.id === 'SP-9005');
-  check('the batch ends after the film in flight, the other left unsegmented', finished13 === true && Boolean(d13 && d13.measurements) && c13 && c13.measurements === null, { c: Boolean(c13 && c13.measurements), d: Boolean(d13 && d13.measurements) });
+  // (2026-10-01, issue #39 port) Stop is never a failure: the film it left behind is not Failed.
+  check('the batch ends after the film in flight, the other left unsegmented and not Failed',
+    finished13 === true && Boolean(d13 && d13.measurements) && Boolean(c13) && c13.measurements === null && (c13.processingError ?? null) === null && (c13.processingErrorAt ?? null) === null,
+    { c: Boolean(c13 && c13.measurements), d: Boolean(d13 && d13.measurements), cError: c13 ? (c13.processingError ?? null) : null });
   check('the toast says the batch stopped', s.toast === 'Segmented 1 of 2 films, then stopped.', s.toast);
   const bar13 = await readBar();
   check('the bar offers the film Stop left behind and notes the one it segmented', bar13.label === 'Segment 1 selected' && bar13.disabled === false && bar13.note === '1 already segmented', bar13);
 
   // 14. No new console errors or exceptions across the batch sections.
   check('no console errors or exceptions during the batch sections', cdp.errors.length === errorsAfter9, cdp.errors.slice(errorsAfter9));
+
+  // 14b (2026-10-01, issue #39 port, P3 and P4). The Failed film on its Analysis screen with no run and
+  // no batch up: the header pill with its dated tooltip, the red region note and the FAILED card,
+  // whose Run segmentation button is enabled now, by UNSEGMENTED's rules. Nothing on it is clicked:
+  // SP-9001 has no bytes and no file, so a run would open the native relocate picker and wedge the
+  // suite. SP-9001 is lumbar (injectFilm writes no region), so no original preview loads and nothing
+  // follows the reason in the note. It stays Failed through sections 15-17, so section 15's sort meets
+  // a Failed row; section 18 clears it.
+  const errorsBefore14b = cdp.errors.length;
+  const regionNote = () => cdp.evaluate(`(() => { const e = document.querySelector('.analysis-region-bar .meas-note'); return e ? { text: e.textContent, failed: e.classList.contains('is-failed') } : null; })()`);
+  const runCardState = () => cdp.evaluate(`(() => {
+    const card = document.querySelector('.run-card');
+    return {
+      visible: Boolean(card) && !card.classList.contains('is-hidden'),
+      eyebrow: document.querySelector('.run-eyebrow')?.textContent ?? null, title: document.querySelector('.run-title')?.textContent ?? null,
+      body: document.querySelector('.run-body')?.textContent ?? null, label: document.querySelector('.run-button')?.textContent ?? null,
+      disabled: document.querySelector('.run-button')?.disabled ?? null,
+    };
+  })()`);
+  await cdp.setState(`{ screen: "studies", query: "", paramFilters: ${FILTERS_RESET}, paramSelected: [] }`);
+  await cdp.settle(200);
+  await clickAt('.studies-row[data-study-id="SP-9001"]');
+  await cdp.settle(200);
+  s = await cdp.state();
+  const sp9001at14b = s.studies.find((x) => x.id === 'SP-9001');
+  const header14b = await statusPill(cdp, '.analysis-status .badge');
+  check('SP-9001 opens with a Failed header pill titled with the dated line and its stored reason',
+    s.screen === 'analysis' && s.openId === 'SP-9001' && Boolean(sp9001at14b) && Boolean(header14b) && header14b.cls === 'badge badge-fail' && header14b.text === 'Failed'
+    && header14b.title === failedTitle(FILE_NOT_FOUND_REASON, sp9001at14b.processingErrorAt),
+    { screen: s.screen, openId: s.openId, header14b });
+  const note14b = await regionNote();
+  check('the region note reads "Last run failed: " and the stored reason, in the failed colour',
+    Boolean(note14b) && note14b.text === `Last run failed: ${FILE_NOT_FOUND_REASON}` && note14b.failed === true, note14b);
+  const card14b = await runCardState();
+  check('the stage card reads FAILED, Segmentation failed and the stored reason, with an enabled Run segmentation button',
+    card14b.visible === true && card14b.eyebrow === 'FAILED' && card14b.title === 'Segmentation failed' && card14b.body === FILE_NOT_FOUND_REASON
+    && card14b.label === 'Run segmentation' && card14b.disabled === false, card14b);
+  await clickAt('.icon-btn[aria-label="Back to studies"]');
+  await cdp.settle(200);
+  check('no console errors or exceptions during section 14b', cdp.errors.length === errorsBefore14b, cdp.errors.slice(errorsBefore14b));
   // ---------------------------------------------------------------------------------------------
   // 15-17 (2026-09-10, studies-table spec): sortable headers, the SUBJECT editor, Delete selected.
   // ---------------------------------------------------------------------------------------------
@@ -614,10 +774,13 @@ try {
   await cdp.setState(`{ screen: "studies", query: "", paramFilters: ${FILTERS_RESET}, paramSelected: [], findSort: { key: "date", dir: "desc" } }`);
   await cdp.settle(200);
   const badgeOrder = () => cdp.evaluate(`[...document.querySelectorAll('.studies-row')].map((r) => (r.querySelector('.badge') || {}).className || '')`);
-  const rank = (c) => (c.includes('badge-proc') ? 0 : c.includes('badge-rev') ? 1 : c.includes('badge-seg') ? 2 : c.includes('badge-ok') ? 3 : 9);
+  // (2026-10-01, issue #39 port) find.js STATUS_RANK, port spec 3: fail 0, proc 1, unseg 2, rev 3,
+  // seg 4, ok 5.
+  const rank = (c) => (c.includes('badge-fail') ? 0 : c.includes('badge-proc') ? 1 : c.includes('badge-unseg') ? 2 : c.includes('badge-rev') ? 3 : c.includes('badge-seg') ? 4 : c.includes('badge-ok') ? 5 : 9);
   const activeKey = () => cdp.evaluate(`document.activeElement ? document.activeElement.getAttribute('data-find-key') : null`);
 
-  // 15. Sort (spec 6). SP-9000 is segmented, SP-9001 unsegmented (section 10), the demos segmented.
+  // 15. Sort (spec 6). SP-9000 is segmented, SP-9001 Failed (section 11), SP-9004 Unsegmented (section
+  // 13), the demos segmented: an ascending sort puts the Failed row first (port spec 3).
   const dateMark = await cdp.evaluate(`document.querySelector('[data-find-key="sort-date"]')?.textContent ?? null`);
   check('DATE carries the descending mark by default', typeof dateMark === 'string' && dateMark.includes('\u25BE'), dateMark);
   await clickAt('[data-find-key="sort-status"]');
@@ -789,6 +952,41 @@ try {
   const summary17 = ((await text(cdp, '.studies-summary')) || '').trim();
   check('the summary carries the TO REVIEW clause after the delete', /^\d+ STUDIES \u00B7 \d+ UNSEGMENTED \u00B7 \d+ TO REVIEW$/.test(summary17), summary17);
   check('no console errors or exceptions during sections 15-17', cdp.errors.length === errorsAfter14, cdp.errors.slice(errorsAfter14));
+
+  // 18 (2026-10-01, issue #39 port, P6). A Region or Orientation change clears the stored failure and
+  // its time on the write, as it clears reviewedAt (1.0.13's changeRegion; port spec 4). It runs last
+  // so that sections 15-17 met SP-9001 Failed, and after the batches because changeRegion refuses
+  // while a batch or a run is up. SP-9001 is lumbar, which hides its Orientation select, so the Region
+  // select is the one changed -- to Auto detect, its value set and `change` dispatched the way
+  // smoke-cervical.mjs drives it. Auto detect then asks for the original preview, which this film
+  // cannot give (no bytes, no file), so the note reads that message instead of the failure.
+  const errorsBefore18 = cdp.errors.length;
+  await cdp.setState(`{ screen: "studies", query: "", paramFilters: ${FILTERS_RESET}, paramSelected: [] }`);
+  await cdp.settle(200);
+  await clickAt('.studies-row[data-study-id="SP-9001"]');
+  await cdp.settle(200);
+  s = await cdp.state();
+  const before18 = s.studies.find((x) => x.id === 'SP-9001');
+  const region18 = await cdp.evaluate(`(() => { const e = document.querySelector('[aria-label="Spine region"]'); if (!e) return null; e.value = 'auto'; e.dispatchEvent(new Event('change', { bubbles: true })); return e.value; })()`);
+  await cdp.settle(200);
+  const after18 = (await cdp.state()).studies.find((x) => x.id === 'SP-9001');
+  check('on the Failed SP-9001, changing the Region clears processingError and processingErrorAt and leaves the film unsegmented',
+    s.openId === 'SP-9001' && Boolean(before18) && before18.processingError === FILE_NOT_FOUND_REASON && typeof before18.processingErrorAt === 'string'
+    && region18 === 'auto' && Boolean(after18) && after18.region === 'auto' && after18.processingError === null && after18.processingErrorAt === null && after18.measurements === null,
+    { openId: s.openId, before: before18 ? [before18.processingError, before18.processingErrorAt] : null, region18, after: after18 ? [after18.region, after18.processingError, after18.processingErrorAt] : null });
+  const header18 = await statusPill(cdp, '.analysis-status .badge');
+  const note18 = await regionNote();
+  const card18 = await runCardState();
+  check('the header pill reads Unsegmented with no title, and neither the region note nor the card carries the failure',
+    Boolean(header18) && header18.cls === 'badge badge-unseg' && header18.text === 'Unsegmented' && header18.title === null
+    && Boolean(note18) && !note18.text.startsWith('Last run failed') && note18.failed === false
+    && card18.visible === true && card18.eyebrow === 'UNSEGMENTED',
+    { header18, note18, card18 });
+  await clickAt('.icon-btn[aria-label="Back to studies"]');
+  await cdp.settle(200);
+  const row18 = await statusPill(cdp, '.studies-row[data-study-id="SP-9001"] .badge');
+  check('back on the list SP-9001 reads Unsegmented with no title', Boolean(row18) && row18.cls === 'badge badge-unseg' && row18.text === 'Unsegmented' && row18.title === null, row18);
+  check('no console errors or exceptions during section 18', cdp.errors.length === errorsBefore18, cdp.errors.slice(errorsBefore18));
 } finally {
   cdp.close();
 }
diff --git a/tools/smoke/smoke-workspace.mjs b/tools/smoke/smoke-workspace.mjs
index 1fc711f..30c5747 100644
--- a/tools/smoke/smoke-workspace.mjs
+++ b/tools/smoke/smoke-workspace.mjs
@@ -287,9 +287,11 @@ try {
     cards.c2?.eyebrow === '02 — CLINICAL DATA CSV · OPTIONAL' && cards.c2?.value === CSV_PATH && cards.c2?.meta === '4 rows · 4 columns · matched on study_id' && cards.c2?.button === 'Change…', cards.c2);
   check('card 03 is the column mapping card', cards.c3Eyebrow === '03 — COLUMN MAPPING', cards.c3Eyebrow);
   check('the note preview reads the fixture join numbers', typeof cards.note === 'string' && cards.note.includes(NOTE_PREVIEW), cards.note);
+  // (2026-10-01, issue #39 port, port spec 6) A loaded film nobody has run reads Unsegmented, and the
+  // hint says so.
   check('Load workspace is enabled (boolean disabled) and the hint describes what happens next',
     cards.loadDisabled === false && cards.loadText === 'Load workspace'
-    && cards.hint === 'New films are added to Studies as Processing. Open one and run segmentation from its Analysis screen.', cards);
+    && cards.hint === 'New films are added to Studies as Unsegmented. Open one and run segmentation from its Analysis screen.', cards);
 
   let chips = await chipsSnapshot();
   check('four chips in header order', same(chips.map((c) => c.src), EXPECTED_HEADERS), chips.map((c) => c.src));
@@ -342,13 +344,16 @@ try {
     const rows = [...document.querySelectorAll('.studies-row')];
     const row = (id) => document.querySelector('.studies-row[data-study-id="' + id + '"]');
     return {
-      firstThree: rows.slice(0, 3).map((r) => ({ id: r.dataset.studyId, proc: Boolean(r.querySelector('.badge-proc')), badge: r.querySelector('.badge')?.textContent ?? null })),
+      firstThree: rows.slice(0, 3).map((r) => ({ id: r.dataset.studyId, unseg: Boolean(r.querySelector('.badge-unseg')), badge: r.querySelector('.badge')?.textContent ?? null })),
       deleteA: row(${JSON.stringify(ID_A)})?.querySelector('.studies-delete')?.getAttribute('aria-label') ?? null,
       deleteDemo: Boolean(row('SP-0042')?.querySelector('.studies-delete')),
     };
   })()`);
-  check('the first three rows are the new studies, badged Processing',
-    same(listAfterLoad.firstThree.map((r) => r.id), [ID_A, ID_B, ID_C]) && listAfterLoad.firstThree.every((r) => r.proc && r.badge === 'Processing'), listAfterLoad.firstThree);
+  // (2026-10-01, issue #39 port, P1) A loaded film nobody has run reads Unsegmented; Processing is only
+  // the film that is running and the films waiting in a batch. The summary still counts all three
+  // under UNSEGMENTED.
+  check('the first three rows are the new studies, badged Unsegmented',
+    same(listAfterLoad.firstThree.map((r) => r.id), [ID_A, ID_B, ID_C]) && listAfterLoad.firstThree.every((r) => r.unseg && r.badge === 'Unsegmented'), listAfterLoad.firstThree);
   const summaryAfterLoad = await summaryParts();
   check('the summary grew by 3 studies and 3 in queue', summaryAfterLoad && summaryAfterLoad.studies === startCount + 3 && summaryAfterLoad.queued === startSummary.queued + 3, { startSummary, summaryAfterLoad });
   // The delete button names the study the way the row does -- by its NAME, which defaults to the
````

<!-- smoke-port.patch:end -->

---

### Task 8: Run it for real — smoke suites, real films, the human gate (controller-run)

**Run by the controller, not dispatched.** It launches the app against real films, and its safety rules are the
controller's to keep.

**Precondition:** Tasks 1–7 are committed, and the final whole-branch code review has run with its fixes committed
(HANDOFF decision 74: the whole-branch review runs *before* the human gate).

**Files:**
- Modify: `tools/smoke/README.md` — its recorded counts, replaced with what the suites print.
- Modify: this plan's `## Ledger`.
- Scratch, never committed: `tools/smoke/out/` (gitignored) holds the suites' output and `rfp-load.mjs`.
- No product code, unless a check fails. Then fix it in the owning task's files, write the failing test first,
  commit it as `fix:`, and rerun whatever the fix touches.

**Interfaces:**
- Consumes: everything from Tasks 1–7. The DOM hooks it reads:
  - Row pills: `.studies-row .badge` (`badge-unseg`, `badge-proc`, `badge-fail`, `badge-seg`, `badge-rev`,
    `badge-ok`); only a Failed pill has a `title`.
  - Header pill: `.analysis-status .badge`. Region note: `.analysis-region-bar .meas-note` (`is-failed`).
  - Stage card: `.run-eyebrow`, `.run-title`, `.run-body`, and the first `.run-button`.
  - Batch bar: `[data-find-key="segment"]`, `[data-find-key="stop"]`, `[data-find-key="segment-note"]`,
    `.studies-progress-text`. Sort: `[data-find-key="sort-status"]`. Summary: `.studies-summary`.
- Produces: the verification record in the Ledger.

**Safety — read first.**
- The user's installed Spine Contour uses `%APPDATA%\spine-contour`. It is often running and has no single-instance
  lock. A source launch without `SPINE_CONTOUR_USER_DATA` writes that same `studies.json` (that includes
  `npm run dev`, `run.bat` and `run.py`).
- `tools/smoke/launch.mjs` **deletes** the folder `SPINE_CONTOUR_USER_DATA` points to unless `SMOKE_KEEP_PROFILE=1`.
  Every launch sets it to `$TEMP/spine-contour-<name>`, passes the guard below, and sets `SMOKE_KEEP_PROFILE=1`
  whenever the profile must survive.
- The real films are **copied**. The originals in `C:\Users\codyj\OneDrive\Desktop\OLIF studies\` are never moved,
  renamed or deleted.
- **No screenshots in this task** (D6; user rule 2026-09-30). Viewing an image sends it to Claude. Every check below
  is a DOM or store read.
- Never run `git clean`, and never delete `.claude/` or `.superpowers/`.

Launch guard, used in every Bash launch below:
```bash
[ -n "$TEMP" ] || exit 1; case "$SPINE_CONTOUR_USER_DATA" in "$TEMP"/spine-contour-?*) ;; *) echo "refusing: $SPINE_CONTOUR_USER_DATA"; exit 1;; esac;
```

**Tool limits.** Bash and PowerShell calls time out at 120 s by default and 600 s at most; give long calls
`timeout: 600000`, and use `run_in_background: true` for anything longer. Shell variables do not persist between
calls. Run from the repo root; `git branch --show-current` must print `claude/issue-39-failed-status-port`.

- [ ] **Step 1: Environment check**

This checkout was set up on 2026-09-29 (Electron in `node_modules`, `.venv` with ONNX Runtime DirectML, the six ONNX
graphs copied into the gitignored `backend/onnx/` from the installed app). `backend/weights/` and
`backend/requirements.txt` are unchanged between 1.0.11 and 1.0.13, so those copies still match; 1.0.13's
`crop_detector.onnx` is tracked in the repo. Confirm in one PowerShell call:
```powershell
$repo = "C:\Users\codyj\Spine Contour Desktop\Spine-Contour"; node -e "console.log(require('electron'))"; & "$repo\.venv\Scripts\python.exe" -c "import onnxruntime as o; print(o.__version__, o.get_available_providers())"; Get-ChildItem "$repo\backend\onnx\*.onnx" | ForEach-Object { $m = Get-Content ([IO.Path]::ChangeExtension($_.FullName,'.json')) -Raw | ConvertFrom-Json; $h = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(); '{0,-15} {1}' -f $_.BaseName, $(if (-not $m.onnx_sha256) {'tracked'} elseif ($h -eq $m.onnx_sha256) {'OK'} else {"MISMATCH $h"}) }
```
Expected: Electron's path; `1.24.4 ['DmlExecutionProvider', 'CPUExecutionProvider']`; six graphs `OK` and
`crop_detector   tracked` (1.0.13's detector is in git and its sidecar carries no hash).
If anything is missing, stop and ask the user before reinstalling (the 2026-09-29 setup took three long calls).

- [ ] **Step 2: Unit suite**

Run: `node --test test/*.test.js`
Expected: `ℹ tests 613`, `ℹ fail 0`, plus any tests the final review's fixes added.

- [ ] **Step 3: `smoke-studies.mjs` on a fresh launch**

Confirm nothing listens on 9222 (`curl -s http://127.0.0.1:9222/json/version` prints nothing), then:
```bash
export SPINE_CONTOUR_PYTHON="C:/Users/codyj/Spine Contour Desktop/Spine-Contour/.venv/Scripts/python.exe" SPINE_CONTOUR_USER_DATA="$TEMP/spine-contour-smoke" CDP_PORT=9222; unset ELECTRON_RUN_AS_NODE SMOKE_KEEP_PROFILE; [ -n "$TEMP" ] || exit 1; case "$SPINE_CONTOUR_USER_DATA" in "$TEMP"/spine-contour-?*) ;; *) echo "refusing: $SPINE_CONTOUR_USER_DATA"; exit 1;; esac; node tools/smoke/launch.mjs
```
Expected: `{"ready":true,…}` with `userData` under `Temp`. (`launch.mjs` may print
`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` as it exits; the app stays up. Ignore it.) If the port is
gone after the call returns, launch from PowerShell instead:
```powershell
$env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\Spine Contour Desktop\Spine-Contour\.venv\Scripts\python.exe"; $env:SPINE_CONTOUR_USER_DATA = "$env:TEMP\spine-contour-smoke"; $env:CDP_PORT = "9222"; $env:ELECTRON_RUN_AS_NODE = $null; $env:SMOKE_KEEP_PROFILE = $null; if (-not $env:SPINE_CONTOUR_USER_DATA.StartsWith("$env:TEMP\spine-contour-")) { throw "refusing: $env:SPINE_CONTOUR_USER_DATA" }; node tools/smoke/launch.mjs
```
Run the suite (`timeout: 600000`, or in the background):
```bash
set -o pipefail; mkdir -p tools/smoke/out; export SPINE_CONTOUR_USER_DATA="$TEMP/spine-contour-smoke" CDP_PORT=9222; node tools/smoke/smoke-studies.mjs 2>&1 | tee tools/smoke/out/studies.txt; echo "suite exit=$?"
```
Expected: `suite exit=0` with all 151 checks passing (136 before the port; counted from Task 7). The suite README names race checks that may fail legitimately on a
fast machine; any other failure is a defect. Quit: `CDP_PORT=9222 node tools/smoke/cdp.mjs --quit`.

- [ ] **Step 4: `smoke-workspace.mjs` on a fresh launch**

Launch as in Step 3, then:
```bash
set -o pipefail; export SPINE_CONTOUR_USER_DATA="$TEMP/spine-contour-smoke" CDP_PORT=9222; node tools/smoke/smoke-workspace.mjs 2>&1 | tee tools/smoke/out/workspace.txt; echo "suite exit=$?"
```
Expected: `suite exit=0` with all 100 checks passing. Quit.

- [ ] **Step 5: `smoke-persist.mjs`, both phases, nothing in between**

Launch as in Step 3, then:
```bash
set -o pipefail; export SPINE_CONTOUR_USER_DATA="$TEMP/spine-contour-smoke" CDP_PORT=9222; node tools/smoke/smoke-persist.mjs --phase run 2>&1 | tee tools/smoke/out/persist-run.txt; echo "suite exit=$?"
```
Quit, then relaunch keeping the profile:
```bash
export SPINE_CONTOUR_PYTHON="C:/Users/codyj/Spine Contour Desktop/Spine-Contour/.venv/Scripts/python.exe" SPINE_CONTOUR_USER_DATA="$TEMP/spine-contour-smoke" CDP_PORT=9222 SMOKE_KEEP_PROFILE=1; unset ELECTRON_RUN_AS_NODE; [ -n "$TEMP" ] || exit 1; case "$SPINE_CONTOUR_USER_DATA" in "$TEMP"/spine-contour-?*) ;; *) echo "refusing: $SPINE_CONTOUR_USER_DATA"; exit 1;; esac; node tools/smoke/launch.mjs
```
```bash
set -o pipefail; export SPINE_CONTOUR_USER_DATA="$TEMP/spine-contour-smoke" CDP_PORT=9222; node tools/smoke/smoke-persist.mjs --phase restart 2>&1 | tee tools/smoke/out/persist-restart.txt; echo "suite exit=$?"
```
Expected: `suite exit=0` in both phases, 41 checks in the run phase and 53 in the restart phase (40 and 47 before the port; counted from Task 7). Quit.

- [ ] **Step 6: Real films, real inference, a scratch profile, DOM reads only**

Prefix every `cdp.mjs` call in Steps 6–7 with `CDP_PORT=9223`; before 6b, confirm nothing listens on 9223. This
step uses its own folders and profile, so nothing left from the 2026-09-30 run on the older branch is reused.

6a. **Copy the films** (copy only):
```powershell
$films = "$env:TEMP\issue39-port-films"; New-Item -ItemType Directory -Force $films | Out-Null; Copy-Item "C:\Users\codyj\OneDrive\Desktop\OLIF studies\*" $films; Get-ChildItem $films | Select-Object Name, Length
```
Expected: 10 files, nine lumbar JPGs and `standing test.png`.

6b. **Launch** on a fresh profile:
```bash
export SPINE_CONTOUR_PYTHON="C:/Users/codyj/Spine Contour Desktop/Spine-Contour/.venv/Scripts/python.exe" SPINE_CONTOUR_USER_DATA="$TEMP/spine-contour-portfilm" CDP_PORT=9223; unset ELECTRON_RUN_AS_NODE SMOKE_KEEP_PROFILE; [ -n "$TEMP" ] || exit 1; case "$SPINE_CONTOUR_USER_DATA" in "$TEMP"/spine-contour-?*) ;; *) echo "refusing: $SPINE_CONTOUR_USER_DATA"; exit 1;; esac; node tools/smoke/launch.mjs
```

6c. **Load the folder as a workspace.** Copy the 2026-09-30 loader with the new folder name, then run it:
```bash
sed "s/'issue39-films'/'issue39-port-films'/" tools/smoke/out/rf-load.mjs > tools/smoke/out/rfp-load.mjs
```
```bash
grep -n "issue39-port-films" tools/smoke/out/rfp-load.mjs
```
```bash
CDP_PORT=9223 node tools/smoke/out/rfp-load.mjs
```
(If `tools/smoke/out/rf-load.mjs` is gone, the older branch's plan holds it: `git show
claude/issue-39-failed-status:docs/superpowers/plans/2026-09-29-failed-status.md`, Task 10 step 6c.)
Expected: `scan: 10 films, 0 skipped`; screen `studies`; the toast begins `Workspace loaded`; the summary reads
`10 STUDIES · 10 UNSEGMENTED · 0 TO REVIEW` with the demos hidden; ten real records under
`…\Temp\issue39-port-films\`. Then read the rows:
```bash
CDP_PORT=9223 node tools/smoke/cdp.mjs "[...document.querySelectorAll('.studies-row')].map((r) => { const b = r.querySelector('.badge'); return [r.dataset.studyId, b?.className, b?.textContent.trim(), b?.getAttribute('title')]; })"
```
Expected: ten rows, each `badge badge-unseg`, `Unsegmented`, title `null`.

6d. **Make one guaranteed failure.** Move one *copy* out of the loaded folder (a genuine batch `file not found`):
```powershell
$films = "$env:TEMP\issue39-port-films"; $held = "$env:TEMP\issue39-port-held"; New-Item -ItemType Directory -Force $held | Out-Null; Move-Item -LiteralPath "$films\sub225_post-op_3-22-2024.jpg" -Destination $held; Test-Path -LiteralPath "$films\sub225_post-op_3-22-2024.jpg"; Test-Path -LiteralPath "C:\Users\codyj\OneDrive\Desktop\OLIF studies\sub225_post-op_3-22-2024.jpg"
```
Expected: `False`, then `True`.

6e. **Choose the processor**: the RTX 4070, never the Intel UHD 770.
```bash
CDP_PORT=9223 node tools/smoke/cdp.mjs "Promise.all([import('./renderer/store.js'), import('./renderer/processing.js')]).then(async ([s, p]) => { await p.refreshProcessors(); const gpu = (s.getState().processors || []).find((x) => x.kind === 'gpu' && /RTX 4070/i.test(x.name)); if (gpu) await p.changePerformance({ processor: gpu.id }); return { processors: s.getState().processors, chosen: s.getState().performance.processor }; })"
```
Expected: `chosen: "gpu:10de:2786"`. If no GPU is listed it stays `cpu`; allow about 30 minutes for the films.

6f. **Start a batch, read Processing, Stop, read the revert.** Record toasts first (they clear within 8 s):
```bash
CDP_PORT=9223 node tools/smoke/cdp.mjs "import('./renderer/store.js').then((m) => { if (!window.__rfToasts) { window.__rfToasts = []; let last = ''; m.subscribe((s) => { if (s.toast && s.toast !== last) window.__rfToasts.push({ at: new Date().toISOString(), text: s.toast, batch: s.batch ? s.batch.done + '/' + s.batch.ids.length : null }); last = s.toast; }); } return true; })"
```
Click Segment and read the rows in the same call:
```bash
CDP_PORT=9223 node tools/smoke/cdp.mjs "import('./renderer/store.js').then(async (m) => { const b = document.querySelector('[data-find-key=segment]'); const text = b?.textContent.trim(); if (!b || b.disabled) return { clicked: false, text }; b.click(); await new Promise((r) => setTimeout(r, 300)); const s = m.getState(); const waiting = s.batch ? s.batch.ids.slice(s.batch.done) : []; const rows = [...document.querySelectorAll('.studies-row')].map((r) => ({ id: r.dataset.studyId, cls: r.querySelector('.badge')?.className })); return { clicked: true, text, done: s.batch?.done, running: s.running, proc: rows.filter((r) => r.cls.includes('badge-proc')).length, wrong: rows.filter((r) => waiting.includes(r.id) !== r.cls.includes('badge-proc')), summary: document.querySelector('.studies-summary')?.textContent.trim() }; })"
```
Expected: `text: "Segment 10 unsegmented"`; `wrong: []`; `proc` is `10 - done` (10 unless the moved film went first
and has already failed); summary `10 STUDIES · 10 UNSEGMENTED · 0 TO REVIEW` (Failed counts as unsegmented). P1:
the click turns every film in the batch to Processing at once.

Now Stop, and read every row against the running id:
```bash
CDP_PORT=9223 node tools/smoke/cdp.mjs "import('./renderer/store.js').then(async (m) => { document.querySelector('[data-find-key=stop]')?.click(); await new Promise((r) => setTimeout(r, 300)); const s = m.getState(); const rows = [...document.querySelectorAll('.studies-row')].map((r) => ({ id: r.dataset.studyId, cls: r.querySelector('.badge')?.className })); return { stopping: s.batch?.stopping, running: s.running, progress: (() => { const e = document.querySelector('.studies-progress-text'); if (!e) return null; const c = e.cloneNode(true); c.querySelectorAll('.study-processing-detail').forEach((n) => n.remove()); return c.textContent.trim(); })(), wrong: rows.filter((r) => (r.id === s.running) !== r.cls.includes('badge-proc')) }; })"
```
Expected: `stopping: true`; the progress reads `Stopping after this film…`; `wrong: []`. That is: the film in flight
(if any) reads Processing and every other row reads its own status (P1). Then wait for the batch to end
(`timeout: 600000`, repeat until `batch` is `null`):
```bash
CDP_PORT=9223 node tools/smoke/cdp.mjs "import('./renderer/store.js').then(async (m) => { const end = Date.now() + 540000; while (m.getState().batch && Date.now() < end) await new Promise((r) => setTimeout(r, 5000)); return { batch: m.getState().batch, toasts: window.__rfToasts }; })"
```

6g. **Run the rest.** Click Segment again (the label now reads `Segment N unsegmented`, N the films not yet run plus
any that failed), then wait as above, recording a mid-batch read once at least two turns have ended:
```bash
CDP_PORT=9223 node tools/smoke/cdp.mjs "import('./renderer/store.js').then((m) => { const s = m.getState(); const rows = [...document.querySelectorAll('.studies-row')].map((r) => ({ id: r.dataset.studyId, cls: r.querySelector('.badge')?.className })); const waiting = s.batch ? s.batch.ids.slice(s.batch.done) : []; return { done: s.batch?.done, running: s.running, wrong: rows.filter((r) => waiting.includes(r.id) !== r.cls.includes('badge-proc')) }; })"
```
Expected mid-batch: `wrong: []` — exactly the films still waiting (the running one included) read Processing; the
ones whose turn ended read their result. The last `toasts` entry is the closing toast; record it word for word.

6h. **Record every film's outcome.**
```bash
CDP_PORT=9223 node tools/smoke/cdp.mjs "import('./renderer/store.js').then((m) => ({ studies: m.getState().studies.filter((s) => s.source === 'real').map((s) => ({ id: s.id, name: s.fileName, measured: s.measurements != null, processingError: s.processingError, processingErrorAt: s.processingErrorAt })), rows: [...document.querySelectorAll('.studies-row')].map((r) => { const b = r.querySelector('.badge'); return { id: r.dataset.studyId, cls: b?.className, text: b?.textContent.trim(), title: b?.getAttribute('title') }; }), summary: document.querySelector('.studies-summary')?.textContent.trim() }))"
```
Expected:
- The moved film reads **Failed**; its title is `Segmentation failed · <today>`, a newline, then
  `The film was not found at its saved location. Run segmentation from its Analysis screen to choose its new location.`;
  its `processingErrorAt` is an ISO instant (UTC) within the last hour of this run, and the tooltip's `<today>` is that
  instant's LOCAL calendar date in the `Oct 2, 2026` format (after 8 pm EDT the ISO date prefix is already the next day;
  that is correct).
- Any model failure (2026-09-29 candidates: `sub225_pre-op_10-23-2023_femoral heads.jpg`, `sub226_pre-op_1-2-2024.jpg`)
  reads Failed with the backend's own sentence. If they segment this time, record that plainly; never fabricate a
  failure.
- Every film that segmented reads Segmented or Needs review. No row reads Processing or Unsegmented. No row has a
  `title` unless it is Failed.
- The summary's UNSEGMENTED count equals the number of Failed rows (no film is unsegmented or running now).

6i. **Sort.** `CDP_PORT=9223 node tools/smoke/cdp.mjs "(() => { document.querySelector('[data-find-key=sort-status]').click(); return true; })()"`,
then read the rows' classes in order: Failed rows first, then Needs review, Segmented, Reviewed (spec §3 rank).

6j. **Each Failed film on the Analysis screen.** Open each one from the Studies screen:
`m.setState({ screen: 'studies' })`, then `m.setState({ openId: '<id>', screen: 'analysis' })` (both through
`import('./renderer/store.js')`; openId is not a SCREEN_KEYS key, so setting it while already on Analysis would not
remount the screen or start the new film's preview), wait 500 ms, then:
```bash
CDP_PORT=9223 node tools/smoke/cdp.mjs "(() => { const pill = document.querySelector('.analysis-status .badge'); const note = document.querySelector('.analysis-region-bar .meas-note'); const q = (s) => document.querySelector(s)?.textContent.trim() ?? null; return { pill: pill?.className, pillText: pill?.textContent.trim(), pillTitle: pill?.getAttribute('title'), note: note?.textContent, noteFailed: note?.classList.contains('is-failed'), noteColor: note ? getComputedStyle(note).color : null, cardHidden: document.querySelector('.run-card')?.classList.contains('is-hidden'), eyebrow: q('.run-eyebrow'), title: q('.run-title'), body: q('.run-body'), button: q('.run-button') }; })()"
```
Expected: pill `badge badge-fail`, text `Failed`, the same title as its row; a note that starts with
`Last run failed: <reason>`. For the moved film the note is exactly
`Last run failed: <reason> Original preview unavailable: The source film could not be found.` (workspace films are Auto,
so the alignment-setup preview message follows after a space, spec §6). For a model-failed film, repeat the read every
1 s for up to 60 s until the note no longer ends in `Loading original radiograph…`. Then expect either exactly
`Last run failed: <reason>` with `cardHidden: true` (the preview loaded), or
`Last run failed: <reason> Original preview unavailable: <message>` with the FAILED card visible; record which.
`noteFailed: true`, `noteColor: "rgb(180, 35, 24)"`. For the moved film (no preview can load) `cardHidden: false` and
the card reads `FAILED` / `Segmentation failed` / `<reason>` / `Run segmentation`. For an Auto film whose original
preview has loaded the card is hidden by the existing rule (spec §6) and the note carries the reason; record which. No
screenshot: this screen shows the film.

6k. **Restart.** Quit, relaunch keeping the profile, then read the failures back:
```bash
CDP_PORT=9223 node tools/smoke/cdp.mjs --quit
```
```bash
export SPINE_CONTOUR_PYTHON="C:/Users/codyj/Spine Contour Desktop/Spine-Contour/.venv/Scripts/python.exe" SPINE_CONTOUR_USER_DATA="$TEMP/spine-contour-portfilm" CDP_PORT=9223 SMOKE_KEEP_PROFILE=1; unset ELECTRON_RUN_AS_NODE; [ -n "$TEMP" ] || exit 1; case "$SPINE_CONTOUR_USER_DATA" in "$TEMP"/spine-contour-?*) ;; *) echo "refusing: $SPINE_CONTOUR_USER_DATA"; exit 1;; esac; node tools/smoke/launch.mjs
```
```bash
CDP_PORT=9223 node tools/smoke/cdp.mjs "import('./renderer/store.js').then(async (m) => { const end = Date.now() + 30000; while (m.getState().studies.length === 0 && Date.now() < end) await new Promise((r) => setTimeout(r, 200)); m.setState({ ack: true, screen: 'studies' }); return m.getState().studies.filter((s) => s.processingError).map((s) => ({ name: s.fileName, processingError: s.processingError, processingErrorAt: s.processingErrorAt })); })"
```
Expected: the same names, reasons and times recorded in 6h.

6l. **Retry through the batch (1.0.13 offers Failed films).** With nothing ticked, read the bar:
```bash
CDP_PORT=9223 node tools/smoke/cdp.mjs "(() => { const b = document.querySelector('[data-find-key=segment]'); return { label: b?.textContent.trim(), disabled: b?.disabled, note: document.querySelector('[data-find-key=segment-note]')?.textContent.trim() ?? null }; })()"
```
Expected: `Segment N unsegmented`, N the number of Failed films. Click it, read that those N rows read Processing at
once (as in 6f), and wait as in 6f. The moved film fails again with the same sentence and a later `processingErrorAt`.

6m. **Dark theme.** Run it right after 6l's batch ends, while the moved film is Failed again. Begin with
`m.setState({ screen: 'studies' })`, then `m.setState({ theme: 'dark' })`, then read
`getComputedStyle(document.querySelector('.badge-fail')).color` (expected `rgb(240, 113, 103)`). Switch back with
`theme: 'light'`.

6n. **Fix one.** Open a model-failed film if there is one, else the moved film, and change Region to Lumbar:
```bash
CDP_PORT=9223 node tools/smoke/cdp.mjs "(() => { const sel = document.querySelector('.analysis-region-bar select'); sel.value = 'lumbar'; sel.dispatchEvent(new Event('change')); return sel.value; })()"
```
Expected: the header reads **Unsegmented** (`badge-unseg`, no title); the record's `processingError` and
`processingErrorAt` are both `null`; the region note is ordinary text without `is-failed`; the card reads
`UNSEGMENTED`. For a model-failed film, click `Run segmentation` and record whether it now segments. For the moved
film, do **not** click Run segmentation: it opens a native file picker CDP cannot close; the user does that at the gate.

Leave the app running on this profile for Step 7.

- [ ] **Step 7: The human gate**

Tell the user, in a short summary: the closing toasts; the Failed films and their reasons; the Stop and mid-batch
reads; the suite counts from Steps 3–5; anything that did not behave as expected, reported as it happened. No
screenshots are sent. Then:
- The test window is a source build on a scratch profile (`%TEMP%\spine-contour-portfilm`) holding copies from
  `%TEMP%\issue39-port-films`. Please quit the installed Spine Contour first; if it stays open, the test window is the
  one whose Settings show a DEMO STUDIES block.
- Do not start it with `run.bat`, `run.py` or `npm run dev` (those open the real library). If the window is gone,
  reopen it in PowerShell:
  ```powershell
  Set-Location "C:\Users\codyj\Spine Contour Desktop\Spine-Contour"; $env:SPINE_CONTOUR_PYTHON = "$PWD\.venv\Scripts\python.exe"; $env:SPINE_CONTOUR_USER_DATA = "$env:TEMP\spine-contour-portfilm"; $env:CDP_PORT = "9223"; $env:SMOKE_KEEP_PROFILE = "1"; $env:ELECTRON_RUN_AS_NODE = $null; node tools/smoke/launch.mjs
  ```
- Please check: a batch turns every film in it to Processing at once and each changes as its turn ends; Stop returns
  the waiting films to their own status; hover a Failed pill (date and reason); sort by STATUS; open a Failed film
  and read the red note and the card; open `sub225_post-op_3-22-2024`, click Run segmentation and **cancel** the
  picker (nothing changes); optionally run it again and choose the copy in `%TEMP%\issue39-port-held` (a success
  clears the failure).
- Raise the open items: the Unsegmented/Processing grey is about 3.3:1 (pre-existing `--muted`); Failed vs Needs
  review in the dark theme; the Find table's pre-existing horizontal overflow at the default window size (a separate
  task if wanted); whether to tell Michael; what to do with the older branch `claude/issue-39-failed-status`.

Then **stop and wait** for an explicit "gate passed". Changes the user asks for go in the owning task's files with
tests, are committed as `fix:`, and the affected checks rerun before returning here.

- [ ] **Step 8: Record and commit**

- Replace the recorded counts in `tools/smoke/README.md` with what the suites printed.
- Fill in the `## Ledger`: unit totals per task; smoke counts; Step 6's reads, outcomes and closing toasts word for
  word; the processor; the gate verdict; every ruling made during execution.
```bash
printf '%s\n\n%s\n' "docs: record the verification of the Failed-status additions (issue #39)" "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" > tools/smoke/out/commit-msg.txt
```
```bash
git add tools/smoke/README.md docs/superpowers/plans/2026-10-01-failed-status-port.md
```
```bash
git commit -F tools/smoke/out/commit-msg.txt
```

- [ ] **Step 9: Hand off**

- Quit the app: `CDP_PORT=9223 node tools/smoke/cdp.mjs --quit`.
- List these for the user to delete; do not delete them yourself: `%TEMP%\spine-contour-smoke`,
  `%TEMP%\spine-contour-portfilm`, `%TEMP%\issue39-port-films`, `%TEMP%\issue39-port-held`,
  `tools/smoke/out/rfp-load.mjs`, and the 2026-09-30 leftovers (`%TEMP%\spine-contour-realfilm`,
  `%TEMP%\issue39-films`, `%TEMP%\issue39-films-held`, `tools/smoke/out/rf-load.mjs`, `tools/smoke/out/probe-sort.mjs`).
- Then use `superpowers:finishing-a-development-branch`. Nothing is pushed and no PR is opened without the user's
  say-so; a PR description says it follows up Feches/Spine-Contour#39 and ends with the attribution line.

## Ledger

Filled in during execution, one line per ruling or result, newest last: unit totals per task, smoke counts, the
real-film outcomes, the human gate verdict, and every decision the executor or the user makes that this plan did not
already state.

| Date | Task | Entry |
|---|---|---|
