# Next session — prompt

Written at the wrap of the 2026-09-08 handover session (batch merged back; the backend developer's trunk merged in;
the tip pushed as `fork/ui-redesign-cw`). Paste everything below the line as the first message of the next session.

---

Work on Spine Contour, an Electron + Python/FastAPI app that measures spinopelvic parameters from lateral lumbar
radiographs.
Working directory (absolute): `C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628`
This is a git worktree, not the primary checkout; its directory name predates this work and means nothing. Run
everything from here; do not `cd` to `C:\Users\codyj\spine contour`.
Branch: `claude/upstream-reconcile-2026-09-08`, at the wrap's docs commit above `245cae2` (the reconcile fix), which
sits above `5cf52c7` (the merge follow-up) and `2bf3d21` (the merge of `origin/ui-redesign-cw` @ `5078b1c`, the backend
developer's trunk), on `b7789b3` (the batch-segmentation wrap; the studies branch's tip before the merge). Three
branches point at this tip: `claude/upstream-reconcile-2026-09-08`, `claude/studies-ui-updates-bb040d` (fast-forwarded)
and `fork/ui-redesign-cw` (the handover branch; its push built the first preview installer from this lineage). State:
unit 433/433; `smoke-parameters.mjs` 58/58; `smoke-seeding.mjs` 36/36; `smoke-workspace.mjs` 100/100;
`smoke-studies.mjs` 103/103; `smoke-persist.mjs` 36/36 then 44/44; the merge and its fix each reviewed. No plan task,
fix round or failing test is open. **The backend developer has been told (or is about to be told) to take
`fork/ui-redesign-cw`.**

Read in this order before doing anything:

1. `CLAUDE.md` — non-negotiables, commands, the branch/remote rules; the two status paragraphs on the batch and the
   reconcile
2. `docs/superpowers/HANDOFF.md` — "Where things stand" (the reconcile section is first, then the batch), "Handing this
   to the backend author" (rewritten 2026-09-08), "Decisions already made" 1–66, "Release prerequisites", "Known traps"
3. `docs/ROADMAP.md` — §4 release prerequisites and §5 (five new bullets from the reconcile reviews)
4. `docs/superpowers/plans/2026-09-08-batch-segmentation.md` `## Ledger` only if the batch's rulings are needed

Resume point. **Nothing is mid-flight.** What is owed is human verification and then the release track:

* The preview installer built by the `fork/ui-redesign-cw` push (the `preview-windows` prerelease on
  `github.com/Feches/Spine-Contour`): install it beside the real app; it must open on an EMPTY library (decision 19 has
  never been seen in a packaged build); run one batch from the Find tab; choose a workspace folder and walk the backend
  developer's calibration screen once with the Tesseract runtime absent (Skip for now) — no suite covers that detour.
  Record the outcomes in HANDOFF "Release prerequisites".
* If the backend developer pushes more to `origin/ui-redesign-cw` before he takes the fork's branch, reconcile again
  the same way: `git fetch origin`, `git merge-tree --write-tree HEAD origin/ui-redesign-cw` as a dry run, merge with
  rulings recorded, re-run the suites, fast-forward the studies branch, push `fork/ui-redesign-cw`.
* Then the release prerequisites in HANDOFF: the `windows.yml` repository guard and its missing renderer-test and
  allowlist steps, before anything touches `main`. Ask the user which piece first; do not brainstorm a feature unprompted.

Ledger. The batch plan's `## Ledger` travels with the repo. The reconcile's ledger and briefs are git-ignored scratch in
`.superpowers/sdd/2026-09-08-upstream-reconcile/` (and the batch's in `.superpowers/sdd/2026-09-08-batch-segmentation/`);
their rulings are summarised in HANDOFF's reconcile section and in this prompt. Delete both directories when the branch
is finished.

Decisions already made — do not relitigate. HANDOFF "Decisions already made" 1–66; the batch plan's rulings P1, R2–R8;
and the reconcile's rulings (each with its cost in the scratch ledger and summarised in HANDOFF):

* R-M1: both demo gates coexist — `demoStudiesAllowed() && !hideDemos ? merge(real) : real`
* R-M2: the empty state is ours (`EMPTY_COPY`)
* R-M3: "Delete all studies" is kept as his feature, mounted library-level above the tab strip; it refuses while a batch
  is up; "including demos" only when a demo is present
* R-M4: his run-path deletion guard is an outcome in `segmentStudy`
* R-M5: the batch driver refuses while `deletingStudies`; the button is not disabled (ROADMAP §5)
* R-M6: one `setState` in the folder-choose handler carries our keys and his calibration request
* R-M7/R-M8: records from both sides; allowlists identical; CSP untouched
* R-M9: delete-all prunes `paramSelected`; the search input mirrors `live.query`; README says demos are cleared in a
  development build
* earlier and still binding: HANDOFF 13 (`running` is one id), 6 (no timed stage labels), 19 (no demos in any packaged
  build), 38–39 (the grid's ticks), 45–50 (the paired export), 51–66 (the batch)

Manual gates the human owns. The installer checks above. Before any push to `main` (a production release) the branch
must be tested through the preview installer (decision 16) and `windows.yml` must carry a repository guard.

Remote rules.

* Push to `fork` (`github.com/Feches/Spine-Contour`) only. Never `origin` (upstream, no write access).
* Never merge to `main`. `main` does not contain the redesign at all.
* `fork/ui-redesign-cw` is now the handover branch and a push to it builds the preview installer (the only branch that
  does, besides `main` for production). Push it only when the tip is verified; never force-push it.
* Do not push to `main`.

Verification commands.

    node --test test/*.test.js          # 433/433 at the wrap; the directory form FAILS on Node 24
    "C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend -q    # the backend developer's; not run here on the merged backend

Run the app from source (all three lines; the shell starts in `C:\Users\codyj`):

    Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628"
    $env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"
    npm.cmd run dev

Smoke harness on a scratch profile (`tools/smoke/README.md` has the run order and baselines). From the Bash tool, set
`SPINE_CONTOUR_PYTHON` in the same command as `launch.mjs`; run every suite in the foreground and capture it to a
file under `tools/smoke/out/`; a suite that prints nothing has thrown; `smoke-studies.mjs` needs a FRESH launch and
takes about ten minutes:

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
  heredocs; single escapes such as `\x00` survive. Write scripts to a file and run the file with
  `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe"` (the Bash tool's bare `python` is the Microsoft Store stub).
* The Edit and Write tools rewrite backslash-u escapes in JS source as glyphs. Never change the form of a non-ASCII
  character on a line you touch; write NEW ones as escapes; byte-check added lines before every commit
  (`git diff -U0 -- <files> | grep -nP '^[+-].*[^\x00-\x7F]'`) and repair with a Python script written to a file.
* The backend now imports `scipy` and `pytesseract` at startup; a venv without them makes the backend exit and the smoke
  harness cannot launch. The Tesseract runtime itself is needed only by `/calibrate`.
* A second Spine Contour instance on this laptop doubles the backend's memory and CPU (`/predict` 130–140 s instead of
  ~9 s) and the harness's Electron process has vanished mid-suite under it. Never kill another instance unasked; ask the
  user to close it before a long suite. A suite that exceeds the Bash tool's 600 s timeout keeps running: do not touch
  that instance; wait, then read the output file.
* A Sonnet implementer that backgrounds a suite and "waits for the Monitor" ends its turn; say "foreground, capture to a
  file" in every dispatch that runs a suite.
* `el()` assigns to a property when the key exists: real booleans, never `'false'`; `list` and `style` are read-only
  accessors, never `el()` props. `update()` in the Studies screen runs inside a store notification: no `setState` there;
  its key array lists `studies, query, running, confirmingId, confirmingAll, deletingStudies, paramFilters,
  paramSelected, batch`.
* `git commit --amend` and `git reset --soft` pass the classifier, `--hard` does not; never bare `git stash` (the stack
  is shared across worktrees). Write a long commit message to a file and `git commit -F` it. This worktree's
  `node_modules` carries the Electron binary; `npm install` would NOT fetch it. Selectors key on `data-find-key`,
  `data-param-key` and `data-study-id`, never a visible label. Never re-run a suite on an instance where one was killed.
