# Failed status on 1.0.13: Unsegmented, red, dated tooltip, the reason on Analysis, plain reasons — design

**Status:** approved in conversation 2026-10-01; this document is the written spec. Branch
`claude/issue-39-failed-status-port`, off `main` @ `9992b99` (v1.0.13). Nothing here is implemented.

**Issue:** [Feches/Spine-Contour#39](https://github.com/Feches/Spine-Contour/issues/39), closed by the 1.0.13 release.

**Builds on:** Michael's 1.0.13 Failed status (PR #50, commit `8264de8`) — the behaviour of record. The fuller
design on branch `claude/issue-39-failed-status` (spec `2026-09-29-failed-status-design.md`, commit `6f6a48d`, tested
end to end but never merged) is the source of the five additions below; where this document and that one differ,
this one wins. The binding architecture contract is `plans/2026-08-31-00-architecture-contract.md` ("contract").

---

## 1. Problem

1.0.13 replaced the never-ending grey `Processing` of a failed film with a `Failed` status: `segmentStudy` stores the
attempt's message as `processingError` (a string), `deriveStatus` returns `fail` while it is set, the pill's
`title` is the raw message, Failed sorts first, batches re-run Failed films, a failed re-run over existing results
reads Failed and blocks Mark reviewed, a refused run is recorded as a failure, and a successful run or a
Region/Orientation change clears it.

The user compared it with the design they had approved and chose to add five of those decisions on top of it,
keeping everything else as 1.0.13 has it:

| # | Added | 1.0.13 today |
|---|---|---|
| 1 | Films with no result read **Unsegmented**; **Processing** is the running film and every film waiting in the running batch | every film with no result reads Processing |
| 3 | Failed is a new **red** | terracotta, the Needs review colour |
| 4 | The tooltip reads `Segmentation failed · {date}`, then the reason | the raw message only, no date |
| 5 | The Analysis screen shows the reason: a red `Last run failed: {reason}` note and a FAILED card | the header pill's tooltip only |
| 9 | Raw transport text is stored as a plain sentence | stored as is (`connect ECONNREFUSED 127.0.0.1:…`) |

## 2. Decisions

User rulings are marked.

P1. **Unsegmented, and Processing for the batch** (user, 2026-10-01). A film with no result and no failure reads
    `Unsegmented`. `Processing` is shown for the film whose run is in flight **and for every film still waiting in
    the running batch**: a click on `Segment N …` turns all N to Processing at once, and each changes to its result
    as its turn ends. On Stop, the films still waiting go straight back to their own status (they will not run); the
    film in flight stays Processing until it finishes. A single run shows Processing on that film only, as before.
    An unrecognised status key renders `—` (U+2014), never `Processing`.
P2. **Failed is red** (user). A new token `--danger`, `#B42318` light and `#F07167` dark, each at least 4.5:1 on its
    own 14% tint over `--bg` (5.12:1 and 5.30:1, measured 2026-09-29).
P3. **The tooltip carries the date** (user). One new optional field beside 1.0.13's, `processingErrorAt` (ISO
    timestamp), written in the same update as `processingError` and cleared with it. A failure recorded by 1.0.13
    has no time; its tooltip shows `Segmentation failed` without a date — the label never guesses one.
P4. **The reason is visible on the Analysis screen** (user). A red `Last run failed: {reason}` note under the
    Region/Orientation bar whenever the header pill reads Failed, and a FAILED card in place of "No segmentation yet"
    for a Failed film with no result.
P5. **Plain reasons** (user). The stored `processingError` goes through the reason rewrite of §5. Toasts and the
    batch's closing toast are unchanged.
P6. **Kept as 1.0.13 has it** (user): batches include Failed films; a failed re-run over existing results reads
    Failed and blocks Mark reviewed (`REVIEW_FAILED`); a refusal before a run (unsupported view, `regionRunReason`) is
    recorded as a failure; a relocate does not clear a failure; the summary has no FAILED clause; the two clearing
    sites (a successful run, `changeRegion`).

## 3. Status model

`renderer/data/status.js`:

- `deriveStatus(study) → 'fail'|'unseg'|'ok'|'rev'|'seg'`, first match wins:
  1. `!study` → `'unseg'`
  2. `processingError` is a non-blank string → `'fail'` (1.0.13's rule, unchanged: it outranks measurements and the
     review mark)
  3. `measurements == null` → `'unseg'`
  4. `isReviewed(study)` → `'ok'`
  5. `reviewReasons(study).length > 0` → `'rev'`
  6. otherwise `'seg'`
- `displayStatus(study, runningId = null, batch = null) → 'proc' | deriveStatus(study)`: `'proc'` when
  `study && runningId !== null && runningId === study.id`, or when `study && batch && !batch.stopping &&
  isQueued(batch, study.id)` (`renderer/data/batch.js`; a film is queued from the turn that is starting to the
  last); otherwise `deriveStatus(study)`.
- `statusLabel`: `proc` `Processing`, `unseg` `Unsegmented`, `fail` `Failed`, `seg` `Segmented`, `rev` `Needs review`,
  `ok` `Reviewed`; anything else `—` (U+2014, written as the six-character escape in source).
- `reviewBlockedReason` is unchanged (1.0.13's `REVIEW_FAILED` stays).

Every caller of `displayStatus` passes `state.batch` as the third argument: `buildRow` and the summary in
`renderer/screens/studies.js`, `sortFindRows` (`renderer/data/find.js`, which gains a `batch = null` parameter after
`runningId`), and the Analysis header in `renderer/screens/analysis.js`. The Studies screen's repaint key already
includes `live.batch`.

`STATUS_RANK` (`renderer/data/find.js`): `fail 0 · proc 1 · unseg 2 · rev 3 · seg 4 · ok 5`.

Summary line (`renderer/screens/studies.js`), 1.0.13's three clauses kept:
`{n} STUDIES · {u} UNSEGMENTED · {r} TO REVIEW`, where UNSEGMENTED counts `unseg`, `proc` and `fail` (1.0.13 counted
`proc` and `fail`) and TO REVIEW counts `rev`. The line keeps its existing glyph bytes (a literal middle dot after
STUDIES, the six-character escape after UNSEGMENTED).

The Unsupported view pill still wins on a real, unmeasured, not-running film whose view is not lateral (unchanged).
The Analysis card keeps its existing QUEUED wording for a waiting film; only the pills read Processing.

## 4. Stored fields

- `processingError: string | null` — 1.0.13's field, now stored as `failureReason(message)` (§5).
- `processingErrorAt: string | null` — new; `new Date().toISOString()` in the same `setState` as `processingError`
  at every write site (1.0.13's `withProcessingFailure`), and `null` wherever `processingError` is cleared (the success
  commit and `changeRegion`). `newStudy` sets it to `null`.
- `validateStudy` (`renderer/data/persistence.js`) lists `processingErrorAt` right after `processingError`: kept only
  when it is a string that `Date.parse` accepts **and** `processingError` is set; a non-null value that fails either
  test is dropped with `console.warn(\`persistence: ${entry.id} has a malformed processing-error time; it is dropped.\`)`.
  An absent value (every 1.0.13 record) is `null` with no warning. No `STORE_VERSION` bump.

## 5. Reason text

`renderer/data/failure.js` (new, pure, ported from the 2026-09-29 branch's tested module): `failureReason(message)`
decides the stored text. Rows in order, first match wins:

| Message | Stored reason |
|---|---|
| blank, or not a string | `Segmentation failed without a reason.` |
| starts with `Could not read ` | the message, trimmed and capped — never rewritten, even with a socket code inside |
| exactly `file not found` | `The film was not found at its saved location. Run segmentation from its Analysis screen to choose its new location.` |
| exactly `aborted` | `Processing connection ended before a result was received.` |
| contains `ECONNREFUSED`, `ECONNRESET`, `EPIPE`, `ETIMEDOUT` or `socket hang up` | `The processing backend stopped. Restart Spine Contour, then segment again.` |
| ends in `is not valid JSON`, or is `Unexpected end of JSON input` | `The processing backend returned an unreadable response. Restart Spine Contour, then segment again.` |
| anything else | the message, trimmed and capped |

Capped means at most 500 characters, the ellipsis included. `withProcessingFailure` stores
`failureReason(reason)` instead of `String(reason || 'Segmentation failed.')`. Outcomes and toasts keep the raw
message.

`failureTitle(reason, at) → string`: `Segmentation failed · {date}`, a newline, then the reason; the date in the
`reviewedLabel` format (`Oct 1, 2026`); when `at` does not parse, just `Segmentation failed`, a newline, the reason.

## 6. UI

- `statusBadge(status, title)` (`renderer/components/status-badge.js`) puts `title` on the pill only when it is a
  non-empty string (`...(title ? { title } : {})`). Callers pass
  `failureTitle(study.processingError, study.processingErrorAt)` when the status is `fail`, nothing otherwise (1.0.13
  passed the raw `processingError`).
- CSS: `--danger` in `styles/tokens.css` (`:root` and `body[data-dark]`); `.badge-fail` becomes
  `color-mix(in srgb, var(--danger) 14%, transparent)` on `var(--danger)`; `.badge-unseg` takes `.badge-proc`'s
  colours with a hollow dot (transparent fill, `1.5px solid currentColor`, `box-sizing: border-box`);
  `.meas-note.is-failed { color: var(--danger); }` in `styles/screens/analysis.css`.
- Analysis header: the rebuild key includes `processingError` and `processingErrorAt`, so a new failure under the same
  status rebuilds the pill and its tooltip; `statusBadge` receives the bare status, never the key.
- Region note: when the header shows Failed (status `fail`, no Unsupported view pill) it reads
  `Last run failed: {processingError}` and carries `is-failed`; a preview message follows after a space only under the
  existing rule `mounted.previewMessage && alignmentSetup`. Otherwise the note is exactly today's.
- Stage card (`describeCard`, `renderer/components/viewer.js`): a new branch after the Unsupported view branch and
  before UNSEGMENTED/QUEUED/RUNNING — no result, not busy, not queued, `processingError` set — returns eyebrow
  `FAILED`, title `Segmentation failed`, body the reason, and the same `Run segmentation` button and disabled rules as
  UNSEGMENTED. QUEUED and RUNNING win over it; the card stays hidden once an Auto/full-spine preview has loaded (the
  region note covers that case).
- Text: the Workspace hint reads `New films are added to Studies as Unsegmented. Open one and run segmentation from
  its Analysis screen.`; README's Load workspace line says `Unsegmented`; `renderer/data/confidence.js`'s comment
  listing the status labels gains `Failed` and `Unsegmented`.

## 7. Testing

TDD for every pure part (`node --test test/*.test.js`; baseline 587/587 on this branch).

- `failure.js`: every §5 row; the cap; `failureTitle` with and without a date and with a multi-line reason.
- `status.js`: the six keys; `fail` outranks measurements and the mark (1.0.13's test stays); `deriveStatus(null)` is
  `unseg`; `displayStatus` — running beats everything, a queued film reads `proc`, a film whose turn ended reads its
  own status, nothing queued reads `proc` while `batch.stopping`, a film outside the batch is unaffected;
  `statusLabel` for all six and `—` for an unknown key.
- `find.js`: the new rank and a mixed sort, including a batch that makes queued films sort as Processing.
- `persistence.js`: `processingErrorAt` round-trips; a 1.0.13 record (no field) loads `null` without a warning; a
  malformed value, or a time without `processingError`, is dropped with the warning.
- `segmentStudy` (the `window`-stub harness): a stream error stores the rewritten reason and an ISO
  `processingErrorAt` in the same notification that clears `running`; a raw socket error stores the backend-stopped
  sentence while the outcome keeps the raw text; a cancelled run stores nothing.
- Smoke suites (`tools/smoke/`; never run against 1.0.13, so their idle-film `Processing` probes already disagree with
  it): idle films read Unsegmented; the running film and the films waiting in a batch read Processing; the
  unreadable SP-9001 reads Failed with a dated tooltip; the summary keeps three clauses with UNSEGMENTED counting
  Failed too; the rank helper learns `fail` and `unseg`; the Analysis header, region note and FAILED card for a Failed
  film; the Workspace hint.
- Real films, real inference, in a scratch profile, checked through the page's text and state only — **never a
  screenshot that shows a radiograph** (user rule 2026-09-30).
- The human gate before any push.

## 8. Amendments

- Architecture contract: a dated 2026-10-01 note recording 1.0.13's `processingError` and this change's
  `processingErrorAt` on the Study record; `status.js`'s six keys, `displayStatus`'s batch argument and the labels;
  `renderer/data/failure.js`; `statusBadge(status, title)`; the rank.
- `CHANGELOG.md`: an Unreleased entry.

## 9. Risks

- **Smoke-suite churn**, as on the 2026-09-29 branch; its reviewed edits are a reference, but the semantics differ
  (Failed films are offered again by batches; waiting films read Processing; no FAILED clause).
- **A film added mid-batch under a reused id** reads Processing until the batch reaches that id and skips it — the
  same limitation the card's existing `isQueued` check has.
- **A film with results and a failed re-run that a batch includes** reads Processing while it waits and counts under
  UNSEGMENTED while it is Failed (1.0.13's counting rule).
