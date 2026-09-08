# Next session — prompt

Written at the wrap of the 2026-09-08 execution session on branch `claude/batch-segmentation` (batch segmentation of
loaded films — Tasks 1–7 executed, gated, reviewed whole-branch, one fix wave applied; NOT merged). Paste everything
below the line as the first message of the next session.

---

Work on Spine Contour, an Electron + Python/FastAPI app that measures spinopelvic parameters from lateral lumbar
radiographs.
Working directory (absolute): `C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628`
This is a git worktree, not the primary checkout; its directory name predates this work and means nothing. Run
everything from here; do not `cd` to `C:\Users\codyj\spine contour`.
Branch: `claude/batch-segmentation`, at the wrap's docs commit above `ec7ffff` (the final-review docs fix), which sits
above `9d4b267` (the final-review code fix), `c342a6a` (Task 7, the records), `ab0b049` + `bd5cdc8` (Task 6 and its fix
round), `095b53e` (Task 5, the Find tab, gate passed), `2bd13fe`, `e6b6f62`, `25fe7ec`, `c4aff7b` (Tasks 4, 3, 2, 1), on
the planning commits above the studies tip `192f303` (`claude/studies-ui-updates-bb040d`). Pushed to `fork`, which
publishes nothing for this branch name. **Batch segmentation is DONE**: unit 426/426; `smoke-studies.mjs` 103/103;
`smoke-workspace.mjs` 100/100; `smoke-parameters.mjs` 58/58; `smoke-persist.mjs` 36/36 then 44/44; the seven-check human
gate passed 2026-09-08; the final whole-branch review on Opus is clean after one fix wave. No task, fix round, failing
test or open finding remains.

Read in this order before doing anything:

1. `CLAUDE.md` — non-negotiables, commands, the branch/remote rules (the batch paragraph now says DONE)
2. `docs/superpowers/HANDOFF.md` — "Where things stand" (the batch section is first and records the final review and the
   parked items), "Decisions already made" 1–66, "Known traps" (a new first bullet on the Bash tool and backslashes),
   "Release prerequisites"
3. `docs/superpowers/plans/2026-09-08-batch-segmentation.md` — only its `## Ledger` at the end: the execution session's
   entry holds every ruling (P1, R2–R8) with its cost
4. `docs/ROADMAP.md` — §4 release prerequisites, §5 smaller limitations (two new bullets from the fix wave)

Resume point. **There is no plan task to execute.** The one thing this branch waits for is the user's say-so on the
merge back into `claude/studies-ui-updates-bb040d`; ask before doing it, never merge unasked. When the user says so:

    git fetch fork
    git log --oneline 192f303..fork/claude/studies-ui-updates-bb040d      # must print nothing for a fast-forward
    git merge-tree --write-tree claude/studies-ui-updates-bb040d HEAD     # a conflict dry run if it did move
    git checkout claude/studies-ui-updates-bb040d && git merge --ff-only claude/batch-segmentation
    git push fork claude/studies-ui-updates-bb040d

(this worktree is on `claude/batch-segmentation`; the studies branch is checked out in the worktree
`..\studies-ui-updates-bb040d` — merge from wherever that branch is checked out, or fast-forward it with
`git branch -f` only after proving the range above is empty). After the merge, delete the git-ignored SDD scratch
workspace `.superpowers/sdd/2026-09-08-batch-segmentation/`. Then the user's stated goal is a release: HANDOFF "Release
prerequisites" (the preview installer has never been tested with plan 06's code, let alone this branch; the empty-library
first launch of a packaged build is unverified; `windows.yml` lacks a repository guard) and the ROADMAP items; spec task 3
(compare with pre-op) waits for plan 07. Ask the user which; do not brainstorm a feature unprompted.

Ledger. The plan's `## Ledger` travels with the repo and is complete through this wrap. The SDD scratch workspace
`.superpowers/sdd/2026-09-08-batch-segmentation/progress.md` is git-ignored and does not travel; it is a superset of
the plan Ledger for this session and can be deleted with the workspace.

Decisions already made — do not relitigate. HANDOFF "Decisions already made" 1–66 (51–66 are the batch spec's §6, with
the why and the cost of each); the plan's "Rulings made while planning"; and the execution rulings in the plan Ledger:

* P1: no private `runSegmentation`; `segmentStudy(studyId, {batch})` with `batch: false` IS the interactive path
* R2: `smoke-persist.mjs` is 36/36 then 44/44 (the plan's 34 was stale)
* R3: undisposed bitmaps on a throw in the run core's catch is a ROADMAP §5 line, not a change
* R4: the smoke suite's `pick()`, select-all probe and `ws10` guard a missing element (FAIL, never a throw)
* R5: the delete/batch race is closed at both ends (`deleteStudy` refuses late after its await; `segmentStudy` re-checks
  identity before any side effect)
* R6: the `SAMPLE_BASE64` guard adds no check; the studies baseline is 103
* R7: "then stopped" only when a film was left unrun; spec §9 amended
* R8 (parked): the late refuse can leave a segmented record without its sidecar until the in-flight run rewrites it
  (interactive re-run only; recoverable as `FILM UNAVAILABLE`)
* earlier and still binding: HANDOFF 13 (`running` is one id), 6 (no timed stage labels), 38–39 (the grid's ticks),
  45–50 (the paired export), 51–66 (the batch)

Manual gates the human owns. None pending on this branch. The merge back is the user's decision. Before any push to
`main` (a production release) the branch must be tested through the preview installer (HANDOFF "Release prerequisites",
decision 16) — that test has never been run on plan 06's code or anything after it.

Remote rules.

* Push to `fork` (`github.com/Feches/Spine-Contour`) only. Never `origin` (upstream, no write access).
* Never merge to `main`. `main` does not contain the redesign at all.
* Do not rename any branch onto `ui-redesign-cw` and do not push to `main`: those are the only two things that build
  an installer. A feature branch pushed to `fork` publishes nothing.
* This branch is merged back into `claude/studies-ui-updates-bb040d` only at the user's say-so, never unasked.

Verification commands.

    node --test test/*.test.js          # 426/426 at the wrap; the directory form FAILS on Node 24
    "C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend -q    # untouched by this branch

Run the app from source (all three lines; the shell starts in `C:\Users\codyj`):

    Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628"
    $env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"
    npm.cmd run dev

Smoke harness on a scratch profile (`tools/smoke/README.md` has the run order and baselines). From the Bash tool, set
`SPINE_CONTOUR_PYTHON` in the same command as `launch.mjs`; run every suite in the foreground and capture it to a
file under `tools/smoke/out/`; a suite that prints nothing has thrown; `smoke-studies.mjs` needs a FRESH launch and now
takes about ten minutes (seven real segmentations):

    SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/launch.txt 2>&1
    node tools/smoke/smoke-parameters.mjs > tools/smoke/out/parameters.txt 2>&1   # 58/58; FIRST, before suites that add real films
    node tools/smoke/smoke-seeding.mjs > tools/smoke/out/seeding.txt 2>&1         # 36/36
    node tools/smoke/smoke-workspace.mjs > tools/smoke/out/workspace.txt 2>&1     # 100/100
    node tools/smoke/cdp.mjs --quit
    SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/launch2.txt 2>&1
    node tools/smoke/smoke-studies.mjs > tools/smoke/out/studies.txt 2>&1         # 103/103; FRESH launch only
    node tools/smoke/cdp.mjs --quit

Live traps (the full list is HANDOFF "Known traps"):

* The Bash tool delivers a doubled backslash in command text as a single one, even inside single quotes and quoted
  heredocs; single escapes such as `\x00` survive. A `grep -P` with a doubled backslash before `u` errors in PCRE and a
  Python heredoc string with one hits a SyntaxError. Write scripts to a file and run the file; the Bash tool's bare
  `python` is the Microsoft Store stub, so use `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe"`.
* The Edit and Write tools rewrite backslash-u escapes in JS source as glyphs (three in one new file this session).
  Never change the form of a non-ASCII character on a line you touch; write NEW ones as escapes; byte-check added lines
  before every commit (`git diff -U0 -- <files> | grep -nP '^[+-].*[^\x00-\x7F]'`, every `+` glyph line paired with a `-`
  twin) and repair with a Python script written to a file.
* A second Spine Contour instance on this laptop (the user's own, or one left from an earlier day) doubles the backend's
  memory and CPU: `/predict` went from about 9 s to 130–140 s per film and the smoke harness's Electron process vanished
  mid-suite twice. Never kill another instance unasked — it may be on the user's real library; ask the user to close it
  before a long suite. A suite that exceeds the Bash tool's 600 s timeout keeps running in the background: do not touch
  that instance; wait, then read the output file.
* A Sonnet implementer that backgrounds a suite and "waits for the Monitor" ends its turn; say "foreground, capture to a
  file" in every dispatch that runs a suite.
* `list` and `style` are read-only accessors on a node: never `el()` props. `el()` assigns to a property when the key
  exists: real booleans, never `'false'`. `update()` in the Studies screen runs inside a store notification: no
  `setState` there; its key array lists `studies, query, running, confirmingId, paramFilters, paramSelected, batch`.
* Keep the SDD ledger uncommitted during a gate; `git commit --amend` and `git reset --soft` pass the classifier,
  `--hard` does not. Write a long commit message to a file and `git commit -F` it. This worktree's `node_modules`
  carries the Electron binary; `npm install` would NOT fetch it. Selectors key on `data-find-key`, `data-param-key` and
  `data-study-id`, never a visible label. Never re-run a suite on an instance where one was killed mid-run.
