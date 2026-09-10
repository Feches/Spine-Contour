# Next session — prompt

Written at the wrap of the 2026-09-10 planning session (the studies-table spec approved by the user, the plan written and
committed). Paste everything below the line as the first message of the next session.

---

Work on Spine Contour, an Electron + Python/FastAPI app that measures spinopelvic parameters from lateral lumbar
radiographs.
Working directory (absolute): `C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d`
This is a git worktree, not the primary checkout; its directory name predates this work and means nothing. Run
everything from here; do not `cd` to `C:\Users\codyj\spine contour`.
Branch: `claude/studies-table-ui-updates-953945`, at the wrap's docs commit above `f6e421b` (the plan) and `e6178fe` (the spec), on `fork/main`
@ `6106463`. **`fork/main` is the trunk now**: the backend developer took `fork/ui-redesign-cw` (the 2026-09-08 handover
tip) and released v1.0.0–1.0.3 on top of it through fork PRs #4–#8 (partial segmentation as a supported result, low-memory
mode with live `/predict-stream` progress, ONNX Runtime inference with a `cropLocalizer` setting). `fork/ui-redesign-cw` is
an ancestor of `fork/main`; the older `claude/studies-ui-updates-bb040d` tip (`4f76063`) is superseded; upstream
`origin/main` still has the OLD single-page UI and is never a base. State: unit 479/479 on `6106463`; the smoke baselines
in `tools/smoke/README.md` are the fork tip's and were not re-run on this base. **Nothing is mid-flight: the plan's Task 1
has not started.**

Read in this order before doing anything:

1. `CLAUDE.md` — non-negotiables, commands, the branch/remote rules, the ONNX amendment at the top (the backend needs
   `backend/requirements-export.txt` installed in the venv and `python tools/export_onnx.py` run once before a source
   launch; if `/health` never comes up, that is the first thing to check)
2. `docs/superpowers/specs/2026-09-10-studies-table-review-design.md` — the approved spec; §11 is the user's rulings
3. `docs/superpowers/plans/2026-09-10-studies-table-review.md` — the plan: Global Constraints, File structure, Rulings
   made while planning, then Task 1
4. `docs/superpowers/HANDOFF.md` — "Where things stand" (the reconcile section is first), "Decisions already made" 1–66,
   "Known traps"
5. `docs/ROADMAP.md` §5 — the bullets Task 9 closes or amends

Resume point. **Execute the plan with superpowers:subagent-driven-development, Task 1 first.** Nine tasks: the status
model (1), the Find list's sort (2), the four writes that clear the review mark (3), the Find tab (4), delete-studies and
the development-only demo toggle (5), the Analysis screen (6), the smoke suites (7), the human gate (8), the records (9).

Subagent models — the user's instruction of 2026-09-10, the lowest model that completes the task reliably: **Sonnet** for
Tasks 1, 2, 3, 5, 6, 7 and 9 and for their spec and code reviews (the code is complete in the plan); **Opus** for Task 4
(the Find tab rewrite, with its focus and rebuild subtleties) and its reviews; the orchestrator runs Task 8 itself; **never
Fable**. Set the model explicitly on every dispatch. Every dispatch that runs a smoke suite says "foreground, capture to a
file"; a Sonnet implementer that backgrounds a suite and "waits for the Monitor" ends its turn.

Gate flow. Task 7 commits with a `Gate: pending` line; Task 8 lists its seven checks in the chat message (not a widget)
and ends the turn, after telling the user to close any app instance left open from earlier; on the user's pass, amend
Task 7's commit to `Gate: passed <date> (user)`; fixes are new commits reviewed as tasks; the ledger stays uncommitted
until Task 9. The packaged-build checks (no DEMO STUDIES row, no `library-preferences.json`) wait for the next preview
installer and are recorded as not run. Push to `fork` only after the last amend.

Decisions already made — do not relitigate. The spec's §11 (1–10); the plan's "Rulings made while planning"; HANDOFF
"Decisions already made" 1–66; the batch plan's rulings; the reconcile's R-M1–R-M9, of which **R-M3 ("Delete all studies"
kept library-level) and the demo-hiding half of R-M1 are superseded by this plan** (Delete over the ticked visible rows;
a development-only Settings toggle with two gates). In one line each:

* filters stay as the shared Workspace/Folder selects; header filters are deferred to ROADMAP §7 for both tabs together
* every Find column sorts with the grid's control (`findSort`, `data/find.js`); newest first by default
* Delete acts on the ticked VISIBLE real rows, never falls through, never touches a demo; the prompt takes the bar's place
* PATIENT is SUBJECT; single click opens the in-place editor; Enter commits and moves down; Escape discards
* `reviewedAt` on the record; status `'ok'`/Reviewed outranks every qc reason; the warnings stay; the mark is cleared ON
  THE WRITE at four sites (run, correction, reset, calibration)
* the demo toggle is development-only: the block is built only when `demoStudiesAllowed()`, and `set-demo-studies-hidden`
  refuses when packaged; the user: "I do NOT want this in the installer"
* no bulk mark-reviewed; no CSV column; the summary gains `TO REVIEW`

Remote rules.

* Push to `fork` (`github.com/Feches/Spine-Contour`) only, and only this feature branch (publishes nothing: the workflows
  trigger on exact branch names). Never `origin` (upstream, no write access).
* Never merge to `main`; never rename onto `ui-redesign-cw`; never force-push either.

Verification commands.

    node --test test/*.test.js          # 479/479 at the wrap; the directory form FAILS on Node 24
    "C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend -q    # the backend developer's; not run here

Run the app from source (all three lines; the shell starts in `C:\Users\codyj`):

    Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d"
    $env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"
    npm.cmd run dev

Smoke harness on a scratch profile (`tools/smoke/README.md` has the run order and baselines). From the Bash tool, set
`SPINE_CONTOUR_PYTHON` in the same command as `launch.mjs`; run every suite in the foreground and capture it to a
file under `tools/smoke/out/`; a suite that prints nothing has thrown; `smoke-studies.mjs` needs a FRESH launch and
takes about ten minutes; `smoke-persist.mjs` runs in two phases across a real restart on the SAME profile:

    SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/launch.txt 2>&1
    node tools/smoke/smoke-studies.mjs > tools/smoke/out/studies.txt 2>&1         # FRESH launch only
    node tools/smoke/cdp.mjs --quit

Live traps (the full list is HANDOFF "Known traps"):

* The Write and Edit tools rewrite backslash-u escapes in source as glyphs — and turned the plan's own `join('\u0000')`
  into a real NUL byte once (repaired to `join(' ')`). Never change the form of a non-ASCII character on a line you
  touch; write NEW ones as escapes; byte-check added lines before every commit
  (`git diff -U0 -- <files> | grep -nP '^[+-].*[^\x00-\x7F]'`) and repair with a Python script written to a file. The
  Studies summary line deliberately keeps its existing `·` glyph and adds the new separator as `\u00B7` on the same line.
* The Bash tool delivers a doubled backslash in command text as a single one; write scripts to a file and run them with
  `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe"` (the Bash tool's bare `python` is the Microsoft Store stub);
  set `PYTHONIOENCODING=utf-8` when a script prints non-ASCII.
* `update()` in the Studies screen runs inside a store notification: no `setState` there; its key array must list every
  store key and module-scope value the Find tab reads — after Task 4 that is `studies, query, running, confirmingId,
  confirmingSelected, editing, deletingStudies, paramFilters, paramSelected, batch, findSort`. `SIDEBAR_KEYS` gains
  `deletingStudies` in Task 5.
* Task 4 calls `deleteStudyBatch(targets, { deletePrediction })` against the OLD implementation, which never invokes
  `hideDemos` for real-only targets; Task 4 also removes `screens/studies.js`'s `hideDemoStudies` import, so Task 5 can
  drop the export. Keep the task order.
* `el()` assigns to a property when the key exists: real booleans, never `'false'`; `list` and `style` are read-only
  accessors, never `el()` props.
* A second Spine Contour instance on this laptop doubles the backend's memory and CPU and the harness's Electron process
  has vanished mid-suite under it. Never kill another instance unasked; ask the user to close it before a long suite. A
  suite that exceeds the Bash tool's 600 s timeout keeps running: wait, then read the output file.
* `git commit --amend` and `git reset --soft` pass the classifier, `--hard` does not (`git checkout -B` is the reset for
  a branch with no unique commits); never bare `git stash` (the stack is shared across worktrees). Write a long commit
  message to a file and `git commit -F` it. Selectors key on `data-find-key`, `data-param-key` and `data-study-id`,
  never a visible label. Never re-run a suite on an instance where one was killed.
