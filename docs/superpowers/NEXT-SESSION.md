# Next session prompt

Written at the wrap of the 2026-09-08 brainstorm-and-planning session on branch `claude/batch-segmentation`
(batch segmentation of loaded films — spec and plan written, independently reviewed and folded; nothing implemented).
Paste the block below into a fresh session. It is self-contained: it does not assume the previous conversation. The
earlier prompts (the paired-export execution wrap, its planning wrap, the study-fields wrap, the Parameters-tab wrap
and the studies-branch wrap) are in this file's history at `192f303`, `c3a4265`, `adf3c19` and `76e86b7`.

---

## Prompt

Work on Spine Contour, an Electron + Python/FastAPI app that measures spinopelvic parameters from lateral lumbar
radiographs.
Working directory (absolute): `C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628`
This is a git worktree, not the primary checkout; its directory name predates this work and means nothing. Run
everything from here; do not `cd` to `C:\Users\codyj\spine contour`.
Branch: `claude/batch-segmentation`, at the wrap's docs commit above `caaede6` (the review fold), which sits above the
plan commit `3365f83` and the spec commit `02b04c6`, on the studies tip `192f303` (`claude/studies-ui-updates-bb040d`,
where spec tasks 1, 2 and 4 of the pre-op/post-op work are merged). Pushed to `fork`, which publishes nothing (both
preview workflows fire only on a push to `ui-redesign-cw`; `windows.yml` only on `main`). **Nothing of the batch work is
implemented**: four docs commits, unit 402/402, no failing test, no open review finding on the plan.

Read in this order before doing anything:

1. `CLAUDE.md` — non-negotiables, commands, the branch/remote rules
2. `docs/superpowers/HANDOFF.md` — "Where things stand" (the batch section is first), "Decisions already made"
   (1–50; 51–66 are the batch spec's §6 until Task 7 writes them), "Known traps", "Release prerequisites"
3. `docs/superpowers/specs/2026-09-08-batch-segmentation-design.md` — the approved spec, all of it; §6 is the decisions
4. `docs/superpowers/plans/2026-09-08-batch-segmentation.md` — the plan, all of it: the header's Global Constraints and
   "Rulings made while planning", Tasks 1–7, the self-review, and the `## Ledger` at the end
5. `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` — binding, wins over any plan

Resume point. **Execute the plan from Task 1** by superpowers:subagent-driven-development: a fresh subagent per task with
the plan's task text and Global Constraints in the brief, two-stage review after each task (spec compliance, then code
quality), the human gate at Task 5, a final whole-branch review on Opus over `caaede6..HEAD` at the end, then a fix
wave if it finds anything, then the wrap. Model assignment is a ruling: Sonnet for Tasks 1, 2, 4, 6, 7 (complete code in
the brief); Opus for Task 3 (the run core a human gated in plans 05–06) and Task 5 (DOM, with the gate); never Fable. The
merge back into `claude/studies-ui-updates-bb040d` happens only at the user's say-so, never unasked. Expected figures
along the way: unit 402 → 425 (Task 1) → 426 (Task 2); `smoke-parameters.mjs` 58/58 at Task 2; `smoke-studies.mjs`
59/60 at Tasks 3 and 5 (the stale diagnosis check, fixed by Task 6) and 103/103 after Task 6; `smoke-persist.mjs` 34/34
then 44/44 at Task 3; `smoke-workspace.mjs` 100/100 at Task 6.

Ledger. The plan's `## Ledger` travels with the repo and holds every ruling from the brainstorm, the planning and the
review fold. Execution creates the scratch SDD workspace `.superpowers/sdd/2026-09-08-batch-segmentation/` (git-ignored,
never travels) for briefs, reports and a running ledger; the repo ledger is written once at the wrap, after the last
amend, and stays uncommitted during the gate.

Decisions already made — do not relitigate. HANDOFF "Decisions already made" 1–50 are the earlier sessions'; the batch
spec's §6 holds 51–66 with the why and the cost of each; the plan's "Rulings made while planning" holds the planner's.
The batch decisions, in brief:

* the batch starts from the Find tab; the button follows the export rule — ticked visible rows, else every visible
  unsegmented film — and always says which and how many (1)
* already-segmented rows are skipped, never re-run; bulk re-run waits for ROADMAP item 3 (2)
* one selection for both tabs (`paramSelected`, name kept) and the workspace/folder filters shared (`paramFilters`) (3, 4)
* strictly serial; `state.running` unchanged, HANDOFF 13 stands (5)
* progress is a count of attempts, `{done} of {total} done`, never a percentage, stage or time (6)
* `IN QUEUE` → `UNSEGMENTED` in the summary; the viewer's plain eyebrow → `UNSEGMENTED`, `QUEUED` reserved for a film in
  the running batch (7); no fourth status pill (8)
* Stop finishes the film in flight, no abort (9); failures collected into one toast, the batch continues (10); a batch is
  allowed with persistence off, one warning at the start (11)
* approach 1: `renderer/batch.js` driver, `renderer/data/batch.js` planner, `segmentStudy` exported from the analysis
  screen (12); nothing persisted, no quit prompt (13); model choice read at each film's turn (14); ticks survive the
  batch (15); demo rows have no tick box on the Find tab (16)
* planner rulings (in the plan): "waiting in the batch" is index `>=` `done`; a failure names the study by `studyName()`;
  the shared checkbox keeps the grid's class names and takes `keyAttr`/`onClick`; `buildTable`'s third argument is an
  empty-state kind; the store key lands in Task 1; `startBatch` returns a boolean; the driver wraps `segment()` in
  try/catch; the stale studies check is fixed in Task 6 by searching `meyerding`; byte-checks look at added lines only
* review-fold rulings (in the plan's ledger): the post-picker guard sits ABOVE the revision check and tests `state.batch`
  only; the three `…` in the viewer's card are written as glyphs; `.param-pick`'s margin is zeroed in the cell; the smoke
  sections click through a null-safe `clickAt`
* earlier and still binding: HANDOFF 13 (`running` is one id), 6 (no timed stage labels), 38–39 (the grid's ticks), 45–50
  (the paired export)

Manual gates the human owns. **Task 5** (the Find tab), seven checks on the user's real library, written out in the plan's
Step 8: list them in the chat message itself, end the turn, record every outcome by amending the still-unpushed commit's
`Gate: pending` line, and tell the user to close any app instance left open from earlier first — it runs the code it was
launched with. No other gate; Task 3's run-core change is verified by the studies and persist smoke suites.

Remote rules.

* Push to `fork` (`github.com/Feches/Spine-Contour`) only. Never `origin` (upstream, no write access).
* Never merge to `main`. `main` does not contain the redesign at all.
* Do not rename any branch onto `ui-redesign-cw` and do not push to `main`: those are the only two things that
  build an installer. A feature branch pushed to `fork` publishes nothing.
* This branch is merged back into `claude/studies-ui-updates-bb040d` only at the user's say-so, never unasked; push
  only after the last amend of the gated commit.

Verification commands.

    node --test test/*.test.js          # 402/402 at the wrap; the directory form FAILS on Node 24
    "C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend -q    # 53 passed at an earlier wrap; untouched

Run the app from source (all three lines; the shell starts in `C:\Users\codyj`):

    Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628"
    $env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"
    npm.cmd run dev

Smoke harness on a scratch profile (`tools/smoke/README.md` has the run order and baselines). From the Bash tool, set
`SPINE_CONTOUR_PYTHON` in the same command as `launch.mjs`; run every suite in the foreground and capture it to a
file under `tools/smoke/out/`; a suite that prints nothing has thrown:

    SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/launch.txt 2>&1
    node tools/smoke/smoke-parameters.mjs > tools/smoke/out/parameters.txt 2>&1   # 58/58; FIRST, before suites that add real films
    node tools/smoke/smoke-seeding.mjs > tools/smoke/out/seeding.txt 2>&1         # 36/36
    node tools/smoke/smoke-workspace.mjs > tools/smoke/out/workspace.txt 2>&1     # 100/100
    node tools/smoke/cdp.mjs --quit
    SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/launch2.txt 2>&1
    node tools/smoke/smoke-studies.mjs > tools/smoke/out/studies.txt 2>&1         # FRESH launch only; 59/60 until Task 6, 103/103 after
    node tools/smoke/cdp.mjs --quit

The persist suite (Task 3 runs it) is two phases across a real restart: `--phase run` on a fresh launch, quit, relaunch
with `SMOKE_KEEP_PROFILE=1` in the same command, `--phase restart`; 34/34 then 44/44.

Live traps (the full list is HANDOFF "Known traps"; the plan's Global Constraints repeat the ones that bite here):

* The Edit and Write tools rewrite backslash-u escapes in JS source as the glyphs, and once turned a `§` in a JS
  comment into its escape; both forms compare equal at runtime, so no test catches it. Never change the form of a
  non-ASCII character on a line you touch; write NEW ones as escapes; byte-check added lines before every commit
  (`git diff -U0 -- <files> | grep -nP '^[+-].*[^\x00-\x7F]'`, every `+` glyph line paired with a `-` twin) and repair
  with a small Python script written to a file — the Bash tool's `python` is the Microsoft Store stub, so run scripts
  with `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe"`. Git Bash `sed` and `bash -c` one-liners drop
  backslashes. It hit four subagents in one session despite a warning in every brief.
* A Sonnet implementer that backgrounds a suite and "waits for the Monitor" ends its turn; `SendMessage` is
  unavailable here, so say "foreground, capture to a file" in every dispatch that runs a suite, and run a fix round
  with a fresh implementer given the report file.
* An app instance left open from an earlier day (this worktree's `electron.exe`, not on port 9222) runs old code; a
  gate launch must close it first. Never kill it unasked — it may be on the user's real library. The smoke
  harness's scratch-profile instance coexists with it.
* `list` and `style` are read-only accessors on a node: never `el()` props. `el()` assigns to a property when the
  key exists: real booleans, never `'false'`. The Studies screen's `update()` runs inside a store notification: no
  `setState` there; its key array must list every store key the Find tab reads (the plan adds `paramFilters`,
  `paramSelected`, `batch`); `SIDEBAR_KEYS` gains `batch`. Every patch passes a NEW object or array.
* Keep the ledger uncommitted during the gate; `git commit --amend` and `git reset --soft` pass the classifier,
  `--hard` does not. Write a long commit message to a file and `git commit -F` it. This worktree's `node_modules`
  carries the Electron binary; `npm install` would NOT fetch it. Selectors key on `data-find-key`, `data-param-key`
  and `data-study-id`, never a visible label. Never re-run a suite on an instance where one was killed mid-run.
  `cdp-lib.mjs`'s `key()` knows Tab/Enter/Escape/arrows only and sends no `text`; drive a select by setting `.value`
  and dispatching `change`. Chromium shows no tooltip on a disabled control. A smoke suite that throws prints nothing:
  a missing element must be a FAIL, never a dereference.
