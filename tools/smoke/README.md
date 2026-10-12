# CDP smoke harness

Trusted-input smoke checks driven over Chrome DevTools Protocol against the real,
running Electron app. The unit suite (`node --test test/*.test.js`) covers pure logic
only; canvas/pointer behaviour — drags, hover, keyboard nudges, pixel colours — is not
reachable from it. Every defect found in plans 03–04 of the UI redesign was caught by
these scripts or by a human, none by the unit suite. This directory is outside both
electron-builder file allowlists (`package.json` `build.files` and
`electron-builder.preview.yml` `files`), so nothing here ships.

## Launch and quit

```
node tools/smoke/launch.mjs            # SPINE_CONTOUR_PYTHON must point at the venv python
node tools/smoke/cdp.mjs --quit        # clean shutdown through Browser.close
```

`launch.mjs` starts the app from source, detached, on a scratch `SPINE_CONTOUR_USER_DATA`
directory (default `<tmp>/spine-contour-smoke`, wiped on each launch unless
`SMOKE_KEEP_PROFILE=1`) so smoke runs never touch a developer's real `studies.json`.
**`main.js` only honours `SPINE_CONTOUR_USER_DATA` from Task 5 onward** — until then the
app writes to its normal user-data directory regardless, which is expected, not a bug in
this harness.

**A process staying alive is not evidence of a successful launch.** A fatal startup
error shows a modal dialog and the Electron process keeps running. Always assert against
the live DOM over CDP (port 9222 by default, `CDP_PORT` to override) rather than trusting
the exit code or PID.

**And a port being open is not evidence that it is *your* app.** Electron cannot bind a
`--remote-debugging-port` another process already holds; it starts anyway with no CDP
endpoint, and the suites then drive the *older* instance still on the port — different
code, different profile — reporting results that look real. `launch.mjs` therefore probes
`/json/version` before spawning and refuses (exit 3) if anything answers, telling you to
run `node tools/smoke/cdp.mjs --quit` first (then kill stray `electron` processes if the
port stays open). To drive an already-running instance on purpose, set `SMOKE_ATTACH=1`:
it skips the spawn, touches no profile, and its ready line says `"attached": true`.

**On Windows with Node 24 the launcher's own exit code is not a signal.** `launch.mjs` prints its
`{"ready":true,...}` line and then may exit 127 with a libuv assertion
(`!(handle->flags & UV_HANDLE_CLOSING)`, `src\win\async.c`) as it detaches; the app is up and the suites drive it
normally. Observed on every launch on 2026-10-11. Confirm the launch by running a suite, not by the exit code.

## Running the plan-04 suites

For partial-segmentation regression, run `node tools/smoke/smoke-partial-segmentation.mjs`
against the scratch app. It checks L1-only display, keyboard editing, the real `/measure`
endpoint, reset and disk/page reload without screenshots. Optional local image paths run
the production batch with the actual models and save its summary under `out/partial-segmentation/`.

In order, against the launched app. Each suite expects a freshly segmented study.
`smoke-gate1.mjs` and `smoke-gate2.mjs` drag landmarks and re-measure as part of their
own checks, which is fine for those two, but it leaves the study's geometry different
from what was predicted — and `smoke-gate3.mjs` resets landmarks back to the *exact*
prediction recorded in `out/last-run.json`. Running the six suites straight through on
one study makes `smoke-gate3.mjs` fail (measured 22/23 that way); it needs its own
fresh `inject-study.js` + `run-and-wait.js` pair run immediately before it, not the one
from the top of the run, to get 23/23:

```
node tools/smoke/cdp.mjs --file tools/smoke/inject-study.js
node tools/smoke/cdp.mjs --file tools/smoke/run-and-wait.js > tools/smoke/out/last-run.json
node tools/smoke/smoke-parity.mjs
node tools/smoke/smoke-gate1.mjs
node tools/smoke/smoke-gate2.mjs
node tools/smoke/cdp.mjs --file tools/smoke/inject-study.js
node tools/smoke/cdp.mjs --file tools/smoke/run-and-wait.js > tools/smoke/out/last-run.json
node tools/smoke/smoke-gate3.mjs
node tools/smoke/smoke-chip.mjs
node tools/smoke/cdp.mjs --file tools/smoke/inject-study.js
node tools/smoke/cdp.mjs --file tools/smoke/run-and-wait.js > tools/smoke/out/last-run.json
node tools/smoke/smoke-chord.mjs
```

`inject-study.js` embeds its own tiny 157x280 sample film (the `design_src/13462cd9`
reference JPG, base64-encoded in the script) and injects it as study `SP-9000`, inserted
at the front of `state.studies` to match `addStudy`'s front-insertion (screens/studies.js),
then segmentation completes in roughly 7 seconds. `SP-9000` is a reserved id, not `SP-1000`:
from Task 6 on, a store saver persists whatever the harness injects, and a film added
through the app's native file picker on a fresh profile also lands on `SP-1000`. Using a
different id keeps a smoke run from silently overwriting a real, segmented `SP-1000`
study with an unsegmented one, and keeps repeated smoke runs from colliding with each
other in one profile.

`launch.mjs` creates `tools/smoke/out/` and writes the app's console output there as
`out/app.log`; `smoke-gate2.mjs` and `smoke-gate3.mjs` read it to count `/measure`
calls. `smoke-gate3.mjs` also reads `out/last-run.json` — the segmentation result it
resets landmarks back to — which is why every `run-and-wait.js` step above redirects
its JSON output there, overwriting it with the most recently segmented study. If you
run a suite without `launch.mjs` first (or after clearing `out/`), create the directory
yourself first; nothing else in the chain creates it.

Every suite exits non-zero on any failed check and asserts there were no console errors
during the run; a green process exit is sufficient to trust the result, no need to
eyeball output.

**Known baseline** (fresh scratch profile, this branch tip): parity 15/15, gate1
25/25, gate2 32/32, gate3 23/23 (with the fresh precondition above), chip 20/20,
chord 28/28. Use these to spot a real regression later.

`smoke-chord.mjs` covers the left+right chord pan and the cursor-anchored zoom. Its mouse
moves MUST carry the held buttons ({ button: 'left', buttons: 3 }): Chromium silently drops
pointer capture on a mouseMoved with button: 'none', which reads as "capture is lost during a
chord" and is a false negative. It drives the raw `mouse` primitive throughout, because
`cdp.click` and `cdp.drag` hardcode a single button. Since 2026-10-11 (gate feedback G4) the right button alone
windows the film, so a right-first chord begins as a window drag that the left button's arrival turns into the pan
(the suite presses the left button before any move, so the window does not change); unchanged at 28/28. Since the
review of G3/G4 (ruling R37) a right press is only a pending window drag until the pointer has moved 3 px, so the
suite's right-first chords, whose left button joins before any move, never begin one and decode nothing; not re-run
after that change.

**`smoke-label.superseded.mjs` is not in the run order and must not be added back.**
Plan-04 Task 20 built a canvas-drawn label plate; Task 21 replaced it with a DOM chip
(`.viewer-label`) and added `smoke-chip.mjs`, which is green and covers the shipped
behaviour. The old suite still tests the drawn plate, so it fails seven of its sixteen
checks against correct code (9/16, unchanged since plan 04). It is renamed rather than
deleted because it is the record of that debt — but a permanently red line beside green
ones is the same class of problem as a false green: it teaches the reader to skim
failures. Keep it out of the run order and out of any baseline. Do not fix or rewrite
it here; if the drawn plate is ever revived, that is the plan that owns this file.

## Running the plan-05 suites

**`smoke-studies.mjs` needs a profile that does not already contain `SP-9000`.** Its
step-5 check asserts the summary grows to `n+1` studies after `inject-study.js` runs,
but `inject-study.js` de-duplicates by id (it filters `SP-9000` out before prepending
it), so on a profile where an earlier suite already created that study the count does
not grow and the check fails — measured `"14 STUDIES · 1 UNSEGMENTED"` that way (the summary
read IN QUEUE until 2026-09-08). On a fresh profile every one of its checks runs
unconditionally (103 of them after the batch sections were added on 2026-09-08; 60 before
them, 28 before Task 9's). Same class of precondition as `smoke-gate3.mjs`'s above.

**`smoke-studies.mjs` segments `SP-9000` twice** (sections 7 and 8, ~9 s each), so it needs
the Python backend up and takes about 20 s longer than a DOM-only suite. `state.running` is
the running study's *id*, and the only way to prove the list badges the right study — and
that a demo study opened mid-run still shows the demo card — is to watch a real run. Two
consequences:

- **Never run it between `smoke-persist.mjs --phase run` and `--phase restart`.** Section 5
  re-injects `SP-9000` unsegmented, destroying the corrected geometry `--phase restart`
  compares against. (Pre-existing, but newly tempting now that the suite drives runs.)
- **It ends on Studies with `SP-9000` segmented and nothing open on Analysis.** Every suite
  documented as "assumes a segmented study open on Analysis" needs its own
  `inject-study.js` + `run-and-wait.js` pair *after* this one, not before it.

**Sections 10–14 (2026-09-08) segment three more injected copies of the sample film** in two
batches and fail a third on purpose (`SP-9001` has no bytes and no file). They leave
`SP-9002`, `SP-9003` and `SP-9005` segmented, `SP-9004` unsegmented and — since the 2026-10-01
Failed-status port (issue #39), which records the failure on the film — `SP-9001` Failed. A Failed
film counts under UNSEGMENTED, so the summary still ends `n+6 STUDIES · 2 UNSEGMENTED`. Section 14b
opens `SP-9001` (a Failed header pill with its dated tooltip, a red `Last run failed:` region note, a
FAILED card) and leaves it Failed, so section 15's status sort meets a Failed row; section 17
re-injects `SP-9002` and `SP-9003` as throwaway films and deletes them; section 18 changes `SP-9001`'s
Region, which clears the failure. The suite ends at `n+4 STUDIES · 2 UNSEGMENTED` and a TO REVIEW
count that depends on what the real runs produced.

**Two of its checks race the backend and can legitimately fail** (found 2026-09-04, on a
machine warm from repeated runs; four consecutive runs on hand-cleared profiles gave 56, 54, 56,
54) (the suite then had 56 checks; 151 since the 2026-10-01 port). Section 9 clicks
`Re-run segmentation`, waits only for `state.running !== null`, then navigates back to Studies and
samples the row, expecting the badge to still read `Processing`:

```
FAIL  a SEGMENTED study reads Processing while it is the running study  -> {"proc":false,"text":"Segmented","queued":0,"procRows":0}
FAIL  the summary counts the re-running study as unsegmented            -> {"proc":false,"text":"Segmented","queued":0,"procRows":0}
```

The detail object now carries `unsegRows` (the Processing, Unsegmented and Failed rows) in place of `procRows`.

Both details say the same thing: the run had already finished, so `running` was `null` again and
the badge correctly read `Segmented`. **That is the product behaving correctly and the suite
sampling a transient state it does not hold**, so do not "fix" the badge. The suite is what needs
the fix: sample the badge while the run is provably still in flight (assert before navigating, or
poll the row under the condition `s.running === RUNNING_ID` and fail only if that condition was
never observed). Until then, treat a run whose only failures are one or both of these two names
as green, and anything else as a real regression.

`smoke-persist.mjs` runs in three phases across two real restarts, and phases 2 and 3
read `out/persist-state.json` written by phase 1:

```
node tools/smoke/launch.mjs
node tools/smoke/smoke-persist.mjs --phase run
node tools/smoke/cdp.mjs --quit
SMOKE_KEEP_PROFILE=1 node tools/smoke/launch.mjs
node tools/smoke/smoke-persist.mjs --phase restart
```

There is a third phase, `--phase measurefail`, but it is **not part of the standard run**
and there is currently no way to execute it. See below before trying.

`SMOKE_KEEP_PROFILE=1` on the relaunch is what makes it a restart rather than a fresh
start — without it `launch.mjs` deletes the scratch profile and phase 2 has nothing to
restore. Phase 2 briefly moves `predictions/SP-9000.json` aside to exercise the
`FILM UNAVAILABLE` card and restores it in a `finally`; if a phase-2 run is killed
mid-section, check for a leftover `predictions/SP-9000.json.bak` before re-running.

Since the 2026-10-01 Failed-status port (issue #39) phase 1 also adds `SP-9010`, an unsegmented
lumbar film with no file, carrying a `processingError` and a `processingErrorAt` seeded through the
store (this suite tests that the record persists; `smoke-studies.mjs` drives the real failure path).
Phase 2 expects both fields back and the film Failed on the list and on the Analysis header, with a
dated `Segmentation failed` tooltip, before section B; and it seeds a failure on `SP-9000` before
section E's re-run, which must clear both fields. `SP-9010` stays in the profile. Never run
`smoke-studies.mjs` on the profile smoke-persist leaves behind: the Failed `SP-9010` counts under
UNSEGMENTED and is offered by the batch button, so its summary and button counts would be off by
one; `smoke-studies.mjs` always needs a fresh launch.

### `--phase measurefail` is parked — do not try to run it

**There is currently no way to make `/measure` fail without wedging the app, so this phase
cannot be exercised. Do not kill the backend to try.** An earlier version of this file told
you to; that recipe leaves Electron alive but completely undriveable, and it was measured,
not theorised — the suite dies with `TypeError: fetch failed / HeadersTimeoutError` because
CDP stops answering.

The phase exists because `recordPrediction`'s third argument is observable only when a
`/measure` **fails** on a corrected, restored study: the argument reaches nothing but the
measure queue's `measured` map (via `replaceMeasured`), and that map is read in exactly one
place — `recalculate`'s failure branch. A *successful* `/measure` overwrites the map, and
the restore only re-seeds it on a fresh mount, so the failing call has to be the first one
after a restore, in its own app session.

Every lever into that state is blocked:

- **Stub the bridge in-page** — no. `contextBridge.exposeInMainWorld` under
  `contextIsolation` makes `window.spineContour` non-configurable: property assignment
  silently no-ops and redefinition throws `Cannot redefine property`. `renderer/api.js`'s
  module exports are live bindings that cannot be reassigned from outside either, and
  `createMeasureQueue`'s `measure` is a closure parameter.
- **Kill the backend after launch** — no, and this is the harmful one. `main.js:253-256`
  raises `dialog.showErrorBox('Spine-Contour backend stopped', …)` on the backend's `exit`
  event whenever the window is up and the app is not already quitting. `showErrorBox` is
  modal and blocking, so it wedges the main process and the CDP endpoint stops responding.
  The app is alive and undriveable — this README's own "a process staying alive is not
  evidence of a successful launch" warning, arriving from the other direction.
- **Launch with a bogus `SPINE_CONTOUR_PYTHON` so the backend never starts** — no.
  `startBackend()` throws out of `waitForBackend()` (`main.js:224`) *before* `createWindow()`
  runs, and `app.whenReady()`'s catch shows its own modal at `main.js:272-275` and quits. No
  page target ever appears, so `launch.mjs` just times out.

**The correction-vs-prediction restore semantics are therefore covered by code review and by
the manual gate, not by this suite.** The reviewer traced `recordPrediction` →
`replaceMeasured` → the `measured` map → `recalculate`'s failure branch and confirmed the
third argument reaches nothing else; the product code is correct.

The phase itself is kept as written and needs no changes the day a lever exists. It
self-gates: it calls `/measure` straight through the bridge first, and if that call
*succeeds* the precondition check FAILS and every dependent assertion is reported as `SKIP`,
never `PASS` — so it can never certify coverage it did not get.

## Running the plan-06 suite

`smoke-workspace.mjs` drives the Workspace screen, the clinical data drawer and the two-step
delete end to end on a launched app: the folder scan and CSV read through `renderer/api.js`
(display-ready rejections included), the screen seeded from a fixture, the mapping override,
`Load workspace` twice, `Import from CSV`, a chip, typing into a cell, collapse/expand, the
persisted store through the bridge, and deleting a study with its sidecar. It never segments.

```
node tools/smoke/launch.mjs
node tools/smoke/smoke-workspace.mjs
node tools/smoke/cdp.mjs --quit
```

It writes its own fixture under `tools/smoke/out/workspace-fixture/` (git-ignored) on every
run — two 1×1 PNGs `a.png` and `b.PNG`, a nested `batch/c.jpg`, a `notes.txt` that is skipped —
and, beside that folder (not inside it, so the scan skips exactly one file), an Excel-style
`tools/smoke/out/workspace-fixture.csv` (BOM + CRLF) with two matching rows, one unmatched row
and one duplicate `study_id`.

Preconditions:

- **A fresh scratch profile.** `state.fields` after the Load is asserted to be exactly the three
  keys the fixture CSV wrote, and the drawer's count label `3 FIELDS · 1 STUDY`, which holds only
  while no persisted record carries clinical values at bootstrap. `smoke-studies.mjs`
  may run before it on the same profile (the plan's order: studies, then workspace) — every
  count is relative to the starting `n` and the fixture ids come from `nextId` at run time, so
  `SP-9000` being present is fine.
- **The backend up**, because `launch.mjs` does not report ready until the window exists, even
  though this suite runs nothing through it.
- **Never between `smoke-persist.mjs --phase run` and `--phase restart`.** It writes the store
  through the saver (three records added, one deleted); `--phase restart` compares against a
  store it did not expect to change.
- It ends on Studies with two fixture studies (`a.png`, `batch/c.jpg`) unsegmented and nothing
  mounted on Analysis.

**What it cannot drive — Gate 2 human steps.** The native folder and CSV pickers
(`chooseFolder`, `chooseCsv`) are dialogs, the same class as the dropzone click in
`smoke-studies.mjs`; the suite seeds `wsFolder/wsFiles/wsCsv…` from the fixture through the
store instead. Two consequences: the pickers themselves (including cancelling one, which must
change nothing) are human steps, and so is card 01's ` · N skipped (unsupported files, links, or
folders that could not be read)` clause — `screens/workspace.js` records the skipped count in
module scope only when its own folder handler ran the scan, so a state-seeded scan renders
`3 radiographs found` without the clause, and that is what the suite asserts.

**Known baseline** (fresh scratch profile, this branch tip): unit 505/505
(`node --test test/*.test.js`); `smoke-studies.mjs` 136/136 — section 16 gained two groups on 2026-09-10. The
first is spec 7.3, a rebuild mid-edit (forced through another row's tick, so nothing about the edited row
changes): the rebuild re-creates the editor with the draft, the focus and the caret, and the DESTROYED input's
deferred `blur` commit no longer fires one microtask later to write the half-typed draft to the record and close
the editor update() had just re-focused — the removal-blur guard (`!input.isConnected` in the editor's `onBlur`)
fixed that defect on 2026-09-10, and its two checks ("a rebuild while the editor is open keeps the editor, the
draft and the caret (spec 7.3)" and "the rebuild, and the Escape after it, leave the stored subject alone") pass.
The suite still writes the stored subject back afterwards — a no-op while the editor survives a rebuild, so a
regression of that fix cannot reach the checks below it. The second group is spec 8.2, a Reviewed row on the list: `badge badge-ok`/`Reviewed`, the
summary's TO REVIEW count following the mark, and the derived badge restored when it is cleared — all three
pass. Its stale diagnosis check was fixed 2026-09-08 (it
searches "meyerding", a word only SP-0042 carries); its `readProgress()` helper was fixed 2026-09-10 to strip the
nested `.study-processing-detail` span before reading `.studies-progress-text` (upstream commit `63b3484` nested
the live backend stage/detail inside that element), which is why the three progress checks ("the bar shows 0 of 2
done...", "after the first film the bar reads 1 of 2 done...", "Stop marks the batch stopping...") pass again — a
suite fix, not a product change; sections 10–14 run three real batches (two films, one
unreadable film, two films with a Stop), about three more real runs, so the suite takes roughly a minute longer;
sections 15–17, 2026-09-10, cover the sortable headers, the SUBJECT editor and Delete selected; it injects and
deletes SP-9002 and SP-9003; it must run on a FRESH launch, never after `smoke-workspace.mjs` on the same
instance, whose loaded films are still unsegmented (summary reads n+1 studies, 1 unsegmented then reads 3
UNSEGMENTED, 2026-09-08);
`smoke-workspace.mjs` 100/100 — measured 96/100 on 2026-09-10 (four FAILs, all null summary-parse reads) because
its `summaryParts()` regex (line 119) still expected the old two-clause summary against the studies-table spec's
third "· N TO REVIEW" clause (added by Task 4, already in this tip); the Task 7 addendum extended that regex
the same way `smoke-studies.mjs`'s own `summaryParts()` was fixed in this task, and a fresh run now reads 100/100
(see `tools/smoke/out/task7b-workspace.txt`); re-run 2026-09-10 on the merged `fork/main` v1.0.5 tree after the
shared-`addedAt` fix to `loadWorkspaceStudies` (a workspace load's records now stamp one timestamp instead of one
per record, so the Find tab's newest-first default sort keeps scan order), 100/100 again;
`smoke-parameters.mjs` 58/58; `smoke-seeding.mjs` 36/36 (re-run 2026-09-10 on the merged tree; the suite's own
`EXPORT_HEADER` constant gained the fifteen disc-height columns upstream's CSV export already carried; re-measured 2026-10-11 on the level-editor tree, 34/36 until the suite's
expectation followed the export's current columns and header line, then 36/36, see the seeding section); `smoke-persist.mjs` 40/40 then
47/47 — phase 1 marks SP-9000 reviewed and sets its subject after the last nudge; phase 2 asserts both survived
and that the re-run cleared the mark. Every check in the suite runs
unconditionally; there is no skip path.

**2026-10-01 (issue #39, the Failed-status port on 1.0.13):** `smoke-studies.mjs` goes from 136 to 151
checks (the header pills in sections 5, 7 and 12; the Failed pill with its dated tooltip and the
summary after section 11; the pills after the first batch turn and around Stop; section 14b's four
and section 18's four) and several are reworded; `smoke-persist.mjs` gains one check in phase 1 and
six in phase 2; `smoke-workspace.mjs` keeps its 100 checks, two of them updated (the hint and the
badges after Load). Measured 2026-10-02 against the real app on this branch, each suite on a fresh
scratch profile (unit 614/614): `smoke-studies.mjs` 151/151; `smoke-workspace.mjs` 100/100 (its first
run read 98/100: the two mapping-select checks still expected the option lists from before 1.0.12's
`Keep column name (<header>)` option, fixed in `97b7478`); `smoke-persist.mjs` 41/41 then 53/53. These
supersede the counts in the known baseline above, which predate 1.0.13.

## Running the Parameters suite

`smoke-parameters.mjs` drives the Studies screen's Parameters tab (pre-op/post-op spec task 1):
the tab strip, the grid over the demo library, the segmented-only and workspace filters, a
measurement sort, the export button's disabled state, ticking rows to export a chosen
subset, the paired export's button states and its file and toast text through the page's own
`pairStudies` and `toPairedCsv` (2026-09-08; the save dialog is the human's), and the tab and
sort surviving a trip to Analysis. DOM-only, no segmentation, no backend
call; a few seconds. It injects `SP-9100` (unsegmented) and `SP-9101`–`SP-9103` (segmented, subjects S001 Pre-op/Post-op and S002 Pre-op, workspace root
`C:\smoke-fixture\Fusion2025`) into the store and removes all four in `finally`. Run it first on a
fresh launch, before the suites that add real films (`smoke-studies.mjs`, `smoke-workspace.mjs`,
`smoke-persist.mjs`): its `Added by hand` check assumes only the demo studies lack a workspace
root.

```
node tools/smoke/smoke-parameters.mjs
```

Every selector is a `data-param-key` or `data-study-id`. Baseline: 58/58 (2026-09-07: the study columns, the timepoint, view, subject and paired-only filters, and the subject sort; 2026-09-08: the paired export).

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

2026-10-11: the suite's `EXPORT_HEADER` and its first-row expectation follow the export's current shape: the Spine
region and Anterior image side columns after Note (the fixture films are region `auto`, so `csv.js` writes them and the
row reads `auto` then an empty side), the ten lumbar segmental columns from 1.0.11 before Age, and the header on line
[2] with the first row on [3] since 1.0.14 dropped the authors' line. The suite had read 34/36 against correct code
since those changes; it reads 36/36 again (re-run 2026-10-11, fresh `%TEMP%` profile, CPU).

## Running the landing suite

`smoke-landing.mjs` drives the landing gate: the panel's copy (no author names, the contact line,
the methods-paper title and its status tag), then the acknowledgement ticked and unticked by real
clicks, with the page and its hero logo checked to be the same nodes afterwards and the logo's
riseIn not running again (a remount replays it: the logo blinks out and fades back in). It ends
by entering the app, so it needs a FRESH launch still on the gate, and runs first or alone.
DOM-only, a few seconds.

```
node tools/smoke/launch.mjs
node tools/smoke/smoke-landing.mjs
node tools/smoke/cdp.mjs --quit
```

Baseline: 16/16 (2026-10-01; 9/16 before the fix, the logo at opacity 0.07 40 ms after the click).

## Running the level editor suite

`smoke-levels.mjs` drives the vertebral level editor (plan `docs/superpowers/plans/2026-10-10-level-editor.md`,
Task 14; user doc `docs/level-editor.md`) against the real app: the Vertebral levels panel, placing a level,
unchecking one, Save edits and the label record on disk, Discard and the exit prompt, femoral rim points and FIT,
window / level (in edit mode, and since 2026-10-11 outside it, with the right-button drag and the double right-click),
the keyboard, the per-study stash, the main process's label-file name check, and (since 2026-10-12, gate feedback G6)
the label record Mark reviewed writes for a film that has none. Two phases:

```
SPINE_CONTOUR_USER_DATA=<%TEMP%>/spine-contour-levels-smoke SPINE_CONTOUR_PYTHON=<main checkout>/.venv/Scripts/python.exe node tools/smoke/launch.mjs
SPINE_CONTOUR_USER_DATA=<the same folder> node tools/smoke/smoke-levels.mjs                                  # phase dom
SPINE_CONTOUR_USER_DATA=<the same folder> SMOKE_PHASE=film node tools/smoke/smoke-levels.mjs <copy of a real film>
node tools/smoke/cdp.mjs --quit
```

- **The profile.** The suite reads the records it saves from `<userData>/labels/`, where userData is
  `SMOKE_USER_DATA`, else `SPINE_CONTOUR_USER_DATA` (pass the value you launched with), else launch.mjs's default.
  Always a scratch folder under `%TEMP%`, never the real `%APPDATA%\spine-contour`.
- **Phase `dom`** (the default) runs no model and reads no real film: two canvas-drawn 600x800 films. `SP-9300` is a
  segmented fixture with the prototype's geometry (L1, L2, L4, L5, S1 and two heads; L3 missing; an all-zero mask),
  measured by the real `/measure`, with a sidecar and a prediction id so it restores like a model result. `SP-9301`
  is an unsegmented film written to `%TEMP%\spine-contour-levels-films\levels-hand-placed.png` and decoded by the real
  `/decode`; it is placed by hand. Neither endpoint needs the model graphs. About 40 s.
- **Phase `film`** segments ONE real lateral lumbar film as `SP-9302` with the real models (region Lumbar), so the
  backend needs the ONNX graphs. A worktree's `backend/onnx/` holds only the tracked `crop_detector` and
  `view_classifier` pairs, so the other graphs are linked in from the main checkout (hard links on 2026-10-10, since
  the folder holds tracked files a directory junction would hide; `backend/onnx/` is gitignored, so they never reach a
  commit). Pass a COPY of the film, made under `%TEMP%`, never the original: the record names the copy. **A real film
  is on screen in this phase: the suite takes no screenshots, and none may be added; every check is a DOM, store or
  file read.** About a minute on the CPU.
- **Ids** `SP-9300`–`SP-9304`, reserved for this suite (`SP-9303`, a study with no film, only for section 17 to open
  and leave; `SP-9304`, a second copy of the segmented fixture with all five lumbar bodies, its own file name
  `levels-review-check.png`, sidecar and prediction id, for section 18). `finally` removes the studies, their sidecars,
  their label records (`levels-review-check.label.json` among them) and any stashed editor, deletes the
  synthetic film, and resets `editing`, `levelEditor`, `filmWindow`, `selection`, `screen`, `openId` and
  `measurementDrafts`. The dom phase prepends its studies and leaves the rest alone, so it may
  follow other suites on one launch; never run it between `smoke-persist.mjs --phase run` and `--phase restart`.

What it checks (numbers as in the plan's Task 14 brief): (1) Edit opens the panel, hides the tabs and the run card, and
the eyebrow and the edit bar read `EDITING SEGMENTATION`; (2) the summary `7 PLACED · 1 TO PLACE · 8 NOT VISIBLE`, the
Lumbar count, the group boxes, L3 `Not placed`; (3) Place… on L3, `PLACING L3 · 1 OF 4`, four step chips, four clicks
to `Manual`, L3 in the study and `LL['L3-S1']` measured, and (gate feedback G2, 2026-10-11) the step chips choosing the
next point: the fourth chip reads `PLACING L3 · 4 OF 4` and is current, a film click marks it done and the label goes
back to the first empty step (`1 OF 4`), the first chip reads `1 OF 4` again before the full placement; (4) UNDO and
CANCEL mid-placement, and UNDO after the out-of-order IP clears it (`4 OF 4` again, the chip no longer done); (5)
unchecking S1, its note `LL, PI, PT, SS, PI–LL, L1PA and L5–S1 will show —`, `s1_superior` and PI null; (6) Save
edits, the toast
`Saved 2 edits to the label record.`, `labels/levels-ui-check.label.json` valid against the schema (through
`test/fixtures/schema-check.js`), no SP id in it, `labelFile` on the study, and (gate feedback G5, 2026-10-11, plan
D18) each level's `edited_points`: L3 (manual) `['sa','sp','ia','ip']`, S1 (not visible) and L1 (segmented) `[]`, every
level and both heads carrying a list (empty unless edited or manual), and the record's `edits` equal to the summary the
suite computes from the record's own entries (one manual level, 4 points placed, none moved); (7) the exit prompt, Keep editing, Discard
and `Discarded 1 change.`, the Measurements panel back with PI `—`; (8) Head 1 re-placed from two rim points, FIT, then
a rim-point drag refits it; (9) the W/L panel on a film whose source is gone says `The source film could not be
found.`; (10) Escape cancels a placement and stays, Escape with nothing open and nothing unsaved leaves with no prompt;
(11) the stash across opening another study from the list, brought back by Edit, dropped by deleting the study (the
delete also removes its label record and sidecar); (12) contours: `null` for every body level of a film with no mask
outline (the fixture and the hand-placed film), at least 3 points for every segmented body level of the real film and
`null` for its edited one; also the hand-placed film's own record, `isHandPlaced`, and its original kept on the stage
outside edit mode (R16); (13) `saveLabelRecord('..')` and `saveLabelRecord('a/b.label.json')` rejected by the main
process with `Invalid label file name.`; (14) `hasStashedEditor` read from the page's own `renderer/level-editor.js`;
(15) Re-run disabled while editing, titled `Finish editing before re-running segmentation` (R17); (16) window / level
`ready` on a decoded film with the chip `W … · L …`, a drag changing both numbers, RESET, the sliders and DONE (both
phases: the synthetic film's 8-bit window and the real film's), and the chip hidden while the source is unavailable;
(17, dom; gate feedback G3 and G4, 2026-10-11, plan D15–D17) window / level outside edit mode on the hand-placed film
just left: the window kept on leaving edit mode, the W/L button shown, enabled and not pressed, the chip, the panel
under the toolbar (top 64) with its hint, a left drag with the panel open windowing by (−80, −40) from inside L1 and
selecting nothing, Escape closing the panel first (then the same press selects L1 and Escape clears it), a right-button
drag with the panel closed lowering the width and the level by (−80, −40) with the chip following and the windowing
classes gone after the release, a double right-click restoring the default, entering edit mode keeping the window,
another study opened (`SP-9303`, no film: its W/L button disabled) resetting it, the film reopened with no window until
asked for and the panel at the default, and a right-button drag on a film with no window yet decoding it and windowing
from its first move after. The window is read as `window.__lv.filmWindow()` (the store's `filmWindow`; the level
editor has carried no window since G3). The right-button gestures use the raw `mouse` primitive with the held button
on every event (`rightDragVia`, `doubleRightClick`). The review of G3/G4 (2026-10-11, rulings R35–R37) adds seven
section-17 checks, each where its film is on the stage: on `SP-9300` before section 1, before any window was asked for,
a right press released without moving leaves `filmWindow` null, the chip without W/L and the stage without the
windowing classes, and a right-first chord (the left button joining before any move) pans and leaves it so (R37); in
section 9, with the panel closed over `SP-9300`'s unavailable film, a right drag toasts `Window / level is unavailable.
The source film could not be found.` exactly once (R31); on `SP-9301`, a right drag that starts on the black surround
(a point `document.elementFromPoint` says is `.viewer-host`) windows by (+80, +40), a right drag while placing L3 in edit
mode windows by (−80, −40) and leaves the placing's points as they were (then CANCEL ends it), with Pan pressed and the
panel open a left drag windows and does not pan (R36), and with Pan pressed and the panel closed a right drag windows
and does not pan (Pan unpressed after). The no-window right drag is now two checks: the drag decodes the film once it
moves and leaves it at its default window, then the next right drag windows from its press by (−80, −40). (The first
version asserted a window change within one drag whose start waits for the decode; under R37 the decode starts at the
first move, so that would depend on how many separate moves Chromium delivers.) (18, dom, last; gate feedback G6,
2026-10-12, plan D19, rulings R40 and R41) Mark reviewed writes the label record of a film that has none: `SP-9304`,
opened from the list and restored from its sidecar (the precondition reads the prediction snapshot through the page's
own `components/viewer.js` `getPrediction`), with no record and Mark reviewed enabled; outside edit mode a click on the
Analysis panel's `.analysis-review` stamps `reviewedAt`, and (review round 1 of G6, R42) `SP-9301` is opened from the
list straight after the click, without waiting for the write, its load decoding its original and taking the single
image cache (`SP-9300` was deleted in section 11); within 10 s the study names `levels-review-check.label.json` and
the file is under `<userData>/labels/`; the toast `Saved the label record.` and no `Marked reviewed. The label record
could not be written:` toast; the record valid against the schema; every level and head `segmented` or
`not_visible`, every `edited_points` empty, `edits.edited` and `edits.manual` 0 and `edits` equal to the summary
computed from the entries; still no edit mode and no level editor. (R42) Once `SP-9301`'s decoded original holds the
cache (the page's own `ensureFilm`), the page's own `screens/analysis.js` `imageInfo('SP-9304', { storedOnly: true })`
reads the sidecar: the record's `sha256`, width and height, a mask, and `sidecarGeometry` equal to the study's
geometry; a second such read comes from the sidecar too (so the first cached nothing), `SP-9301` still open and no
toast. (`SP-9304`'s original does not exist, so the suite cannot show the decode race itself; the wiring test pins
that the review write asks for the stored image only.) Then `SP-9304` is opened again and, once the toast has gone,
unmark and mark again leave one record of that name, not written again (the same `saved_at`), and no second toast.
Nothing else in the suite clicks Mark reviewed; `smoke-persist.mjs` phase 1 clicks it in 11b on a study whose record
section 11 has just saved, so that click writes nothing (unchanged, no check added).
The film phase also saves a record whose `image.sha256` is 64 hex characters and whose `model.version` is the run's,
and (G5, D18) whose edited level, moved by the SA handle drag and the ArrowRight nudge, lists `edited_points` `['sa']`,
exactly the corners whose value differs from its `model_corners`, with `edits.points_moved` the sum of the edited
entries' lists and the whole `edits` block equal to the summary computed from the entries.

**Known baseline** (2026-10-10, branch `worktree-level-editor`, a fresh scratch profile, Windows 11, CPU processor):
phase `dom` 75/75, phase `film` 23/23 (one copied OLIF lumbar film; L1, L2, L4 and L5 segmented with contours of 9 to
15 points, L3 edited by a handle drag and a nudge, contour null). (2026-10-11, gate feedback G2) The dom phase gains
four step-chip checks in sections 3 and 4, so it should read 79/79; not re-run when they were written. (2026-10-11,
gate feedback G3 and G4, `8cf213d`) Section 17 adds fifteen dom checks: dom **94/94** (79 before; G2's four pass among
them) and film **23/23**, measured on one fresh `%TEMP%` profile, with parity, gate1–3, chip and chord green after it
on the same launch. (2026-10-11, the review of G3/G4, `8332dfb`) Eight more dom checks (seven new, and the no-window
right drag split in two): dom **102/102**, measured on a fresh `%TEMP%` profile (DOM, store and file reads only, no
screenshots); the film phase and the other suites not re-run. (2026-10-11, gate feedback G5, plan D18) Section 6 gains
three dom checks and the film phase two. Measured on one fresh `%TEMP%` profile (DOM, store and file reads only, no
screenshots): dom **105/105** (102 + 3) and film **25/25** (23 + 2, one copied OLIF lumbar film). (2026-10-12, gate
feedback G6, plan D19) Section 18 adds seven dom checks: dom **112/112** (105 + 7), measured when it was written on a
fresh `%TEMP%` profile (CDP port 9333; DOM, store and file reads only, no screenshots); the film phase is unchanged
and was not re-run, nor were the other suites. (2026-10-12, review round 1 of G6, R42) Section 18 opens `SP-9301`
straight after the click and adds two dom checks for the stored-only read: dom **114/114** (112 + 2), on a fresh
`%TEMP%` profile (CDP port 9333; DOM, store and file reads only, no screenshots); the film phase and the other suites
not re-run.

## The landmark-editor suites after the level editor (2026-10-10)

The level editor (plan 2026-10-10) replaced the old edit mode: the Edit button is `Edit segmentation` (it was `Edit
landmarks`), the edit bar reads `EDITING SEGMENTATION`, and `state.selection` is always null in edit mode. Only the
SELECTED level has handles; a suite selects a level with `selectLevelRow(code)` and focuses a handle with
`setFocusedHandle({code, handle})`, both imported from the page's own `./renderer/level-editor.js`, and reads the
focused handle from `state.levelEditor.handle`. A femoral head has rim points (four synthesised ones while it is the
model's) and no centre or circumference handle; a rim-point drag refits it, and the panel's Place… on a head (2 to 4
rim points, FIT from 2) replaces RETRACE. Leaving edit mode with unsaved level edits shows the panel's exit prompt
(plan D7), so a suite that ends an edit session on a change saves it (Save edits) or discards it at the prompt.
Three more things the suites now meet:

- **Ruling R16.** A study with neither a prediction id nor `qc.models` reads as placed by hand and opens on its
  decoded original. A synthetic fixture that wants its sidecar restored carries a `prediction_id` on the sidecar and the
  same `predictionId` on the record (disc-heights, partial-segmentation, accuracy).
- **The edit bar is taller** (its help line). In a small window it covers the film's upper landmarks and a press there
  lands on the bar, so gate1, gate2, gate3, chord and accuracy set a 1600x1100 viewport as the synthetic suites do.
- **Escape takes one thing at a time** (the exit prompt, a placement, the W/L panel, then edit mode).

Per suite, what changed and which checks were retired, each with the check that replaces it:

- `smoke-gate1.mjs` (25 → 25). Handle colours are checked with the level selected first; two checks added (`no handle
  at L1 SA until a level is selected`, `only the selected level has handles: L1 SA has none while S1 is selected`).
  Retired: `hover paints a label plate above-right of the handle` (the level editor draws no hover state; the hover
  cursor checks stay); `left femoral centre handle is femoral green` and `right femoral rim handle at 3 o'clock is
  femoral green` (a head has rim handles only, in the trace yellow), replaced by `Head 1's first rim handle is the
  trace yellow`.
- `smoke-gate2.mjs` (32 → 26). Drags select their level first; `dragging L2 SP focuses that handle` reads the editor's
  focused handle. Retired: `left centre drag translates the circle`, `radius unchanged by a centre drag` (no centre
  handle) and `rim drag leaves the centre alone` (a rim drag refits through the rim, so the centre moves), replaced by
  `a rim-point drag refits Head 2: its radius grows` and `the refit head keeps its four rim points, the dragged one
  moved`; `grabbing the circumference at 9 o'clock resizes` (handles are the rim points); `dragging the rim onto the
  centre floors the radius at 1, never negative` and `a 1px radius is accepted by /measure (no toast)` (no radius floor
  in the level editor); `clicking the left centre selects it` (no centre handle), `RETRACE enabled with a femoral
  selection` and `RETRACE toggles on` (no RETRACE), replaced by `Place… on Head 1 starts a rim placement`. Rewritten to the Place… flow: FIT disabled with 1 point and enabled with
  2 (it was 2 and 3), `the placement ends after FIT`, `CANCEL clears the points and hides FIT`, `selecting another
  level's row cancels the placement` (was `a landmark selection disables RETRACE`), `Escape while placing cancels the
  placement and stays in edit mode` (was "exits edit mode": Escape now takes one thing at a time), `re-entering edit
  mode shows no leftover placement`; added `DONE with unsaved edits asks, and its Discard leaves edit mode`.
- `smoke-gate3.mjs` (25 → 26). The old fixed 24-stop `TAB_ORDER` walk is retired; its intent survives in the level
  editor's handle order (`viewer/level-handles.js` `handleOrder`: every handle of every visible, placed level in panel
  order, each head's four rim points included, 30 stops on the sample film), so `Tab walks all 30 handles in panel
  order, selecting each handle's level` and the two wrap checks follow it. Nudges focus L3 SA through
  `setFocusedHandle`; `ArrowLeft nudges while a levels-panel row has focus` (the Measurements panel is hidden while
  editing); Tab in the edit bar starts from RESET TO PREDICTION (RETRACE is gone); `reset clears the focused handle`.
  Retired: `Re-run enabled with a result` (in edit mode), replaced by `Re-run is disabled while editing (R17)` and
  `Re-run is enabled again once edit mode is left`; `re-run exits edit mode and clears the selection` became `re-run
  leaves edit mode off and no level editor`.
- `smoke-chord.mjs` (28 → 28). §2 enters edit mode by the button and selects L3 before the chord on its SA handle; §7
  uses the new label; §8 presses Pan after entering edit mode by the button. No check retired.
- `smoke-chip.mjs` (20 → 20). §6 enters edit mode by the button and selects L4; the handle-press check reads the
  editor's focused handle; it leaves through the exit prompt's Discard. No check retired.
- `smoke-persist.mjs` (phase 1 41 → 42, phase 2 53 → 55). `nudgeAndSettle` focuses L1 SA through `setFocusedHandle`
  (it pressed Tab from a cleared selection); `Tab selects L1 SA` became `the level editor focuses L1 SA`. Phase 1 adds
  `Save edits writes the label record and the corrected geometry stays` before DONE (a correction is an unsaved level
  edit, and the prompt's Discard would undo it); phase 2 adds `reopening after the restart reads the saved label
  record: nothing unsaved` and `Save edits after the reset leaves nothing unsaved`.
- `smoke-femoral-confidence.mjs` (edit 16 → 16, reload 5 → 5). The test circles are placed relative to the
  prediction's image size and the canvas width is read from its PNG header (it was fixed at 1906 px). Rewritten:
  `a rim-point drag refits Head 1 and recalculates the hip axis` (was the centre drag), `a second rim point dragged
  outward grows the head` (was `rim drag resizes without translating the centre`), `hiding a head shows pending
  assessment before the response`, `hiding a head keeps one circle and clears dependent angles` and `hiding a head
  preserves all calibrated disc heights` (DELETE CIRCLE became the head's checkbox), `adding a circle by tracing
  restores the bilateral measurements` (ADD CIRCLE and FIT became Place… and four rim clicks), `the Delete key leaves
  a selected head in place (the level editor has no delete)` (was `Delete key removes selected circle`), `both circles
  can be hidden without losing the spinal result` (the Femoral heads group box); the reload phase enters edit mode by
  the button. Run it with `SMOKE_PREDICTION` pointing at a sidecar from a real run (2026-10-10: a copy of the sample
  film's `predictions/SP-9000.json` from the gate chain).
- `smoke-disc-heights.mjs` (13 → 13). The fixture carries a prediction id (R16); the correction goes through the
  button and L2 selected; DONE after the reset. Also fixed, unrelated to the level editor: the paired-CSV check built
  `toPairedCsv`'s input by hand in its pre-2026-09-11 shape and threw; it now goes through `pairStudies`.
- `smoke-global-sva.mjs` (21 → 21). C7 is a body of four corners in the level editor (its centroid is derived), so
  `nudging the four C7 corners 1 px moves its centroid 1 px and recalculates through real backend` replaces `C7
  centroid is selectable for editing` / `C7 nudge recalculates through real backend` (the first became `C7 is
  selectable for editing: its corners are handles`); `both femoral heads are placeable from the levels panel for
  standing-film pelvic measures` replaces the edit-bar circle-button count; `S1 anterior corner is editable too`.
  `SPINE_CONTOUR_PYTHON` and `SMOKE_GLOBAL_SVA_PROFILE` now override its macOS defaults, and the compact-window check
  allows half a CSS pixel (a scaled Windows display measured the panel's edge at 1100.00003 in an 1100-px viewport).
- `smoke-cervical.mjs` (not run here). Its edit section enters by the button and focuses C2's CENTROID handle (C2 is
  an inferior endplate plus a centroid, plan D8), and leaves by DONE after the reset.
- `smoke-studies.mjs` (151 → 151): the Edit button's label only.
- `smoke-partial-segmentation.mjs` (8 → 8): a prediction id on the fixture (R16); Tab on the L1-only film comes back to
  L1 SA after five presses; an annotator's edit confirms the anterior side, so `anterior_confirmed` is no longer
  `false` after the nudge (the projection keeps the model's `false` only while the level is the model's, plan Task 2).
- `smoke-accuracy.mjs` (17 → 17): a prediction id on the fixture, the 1600x1100 viewport, the button and the selected
  level; DONE after the reset.
- `smoke-segmental.mjs` (not run here): enters by the button, focuses the level's SA handle, and saves before DONE.

**Known baseline after the level editor** (2026-10-10, each on a fresh scratch profile under `%TEMP%`, Windows 11, CPU
processor; these supersede the plan-04 counts above): parity 15/15, gate1 25/25, gate2 26/26, gate3 26/26 (with its
fresh inject + run), chip 20/20, chord 28/28 (the gate chain in the plan-04 order on one launch); studies 151/151;
persist 42/42 then 55/55; femoral-confidence 16/16 then 5/5; disc-heights 13/13, partial-segmentation 8/8 and accuracy
17/17 (one launch); global-sva 21/21 (its own app). Not run: `smoke-cervical.mjs` and `smoke-segmental.mjs` need a
lateral cervical film with anterior on image left, which this workstation does not have, and both screenshot the
film they run on.

## Running the manual calibration suite

`smoke-manual-calibration.mjs` runs in three phases on one scratch profile, each given two LOCAL lumbar film paths
and each needing its own launch: `save` draws and saves a manual scale for each film (it asserts the profile's
reference store is fresh, so launch without `SMOKE_KEEP_PROFILE`); `batch` loads the two films as a workspace after a
full restart and runs the real batch segmentation, checking each saved scale survives into the result, the disc
heights and the CSV; `verify` restarts again and checks the segmentation and the corrected scales, then clears one
scale. Quit and relaunch between phases keeping the profile (`SMOKE_KEEP_PROFILE=1` on the second and third launch,
the same `SPINE_CONTOUR_USER_DATA` on every launch and every suite command).

```
node tools/smoke/launch.mjs                      # fresh profile
node tools/smoke/smoke-manual-calibration.mjs save   <a.jpg> <b.jpg>
node tools/smoke/cdp.mjs --quit
SMOKE_KEEP_PROFILE=1 node tools/smoke/launch.mjs
node tools/smoke/smoke-manual-calibration.mjs batch  <a.jpg> <b.jpg>
node tools/smoke/cdp.mjs --quit
SMOKE_KEEP_PROFILE=1 node tools/smoke/launch.mjs
node tools/smoke/smoke-manual-calibration.mjs verify <a.jpg> <b.jpg>
node tools/smoke/cdp.mjs --quit
```

It runs real segmentations with the region left on Auto (the suite sets `cpuThreads` 2), which searches both
orientations per film, so the `batch` phase takes about 4 to 5 minutes for two films on this CPU (275 s on
2026-10-11); the suite waits up to 600 s for it. The two films must be ones the detection can read (the wait ends
only when every study has a geometry). A real film is on screen throughout, so take no screenshots; the suite reads the
DOM and the store only and writes nothing to git. Baseline (2026-10-11, level-editor tree, CPU, fresh `%TEMP%`
profile): save 5/5, batch 7/7, verify 5/5. The `batch` phase had timed out on its 240 s wait on every run since
1.0.10 made Auto the import default, so its later checks and the whole `verify` phase had not run on this tree before.

## Library

`cdp-lib.mjs` exports `connect()`, whose returned object provides trusted-input helpers
(`click`, `drag`, `move`, `wheel`, `key`, `typeText`), state access (`state`, `setState`),
DOM helpers (`rect`, `toClient`, `evaluate`), and `screenshot(path)`. Suite authors write
screenshots under `tools/smoke/out/` (git-ignored). `cdp.mjs` is a small CLI wrapper over
the same library for one-off calls.

### Low-memory processing and live progress

Launch with a scratch `SPINE_CONTOUR_USER_DATA` and `CDP_PORT`, then run:

```sh
CDP_PORT=9339 node tools/smoke/smoke-processing.mjs /absolute/example1.webp /absolute/example2.webp
```

This suite writes only to the scratch profile. It runs real models, cancels and
restarts a batch, checks progress/cancellation and persisted results, and verifies
low-memory settings across reload. Pass de-identified local examples; no images or
screenshots are written into the repository. Results are ignored under
`tools/smoke/out/processing/`. The CPU resource comparison is separately reproducible
with `tools/benchmark_processing.py`; see `docs/low-memory-processing.md`.
