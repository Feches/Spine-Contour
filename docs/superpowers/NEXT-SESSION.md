# Next session — prompt

Written at the wrap of the 2026-09-10/11 session (v1.0.6 and v1.0.7 released). Paste everything below the line as
the first message of the next session.

---

Work on Spine Contour, an Electron + Python/FastAPI app that measures spinopelvic parameters from lateral lumbar
radiographs.
Working directory (absolute): `C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d`
This is a git worktree, not the primary checkout; its directory name predates this work and means nothing. Run
everything from here; do not `cd` to `C:\Users\codyj\spine contour`.
Branch: `claude/wrap-2026-09-11`, at the wrap's docs commit above `6704586`, which is `fork/main` = **v1.0.7, the
trunk** (published 2026-09-11 by the merge of fork PR #12). Upstream `origin/main` still has the OLD single-page UI and
is never a base. **Nothing is mid-flight**: v1.0.6 (the studies-table work, PR #11, `b083d7d`) and v1.0.7 (the backend
developer's editable femoral circles and overall image confidence reconciled with v1.0.6, PR #12) are both released;
the wrap branch holds only this session's records and should be merged to `fork/main` by a small PR (or folded into
the next feature PR). State at the wrap: unit 524/524 on `6704586`; backend unit 345 and integration 58 pass with
Tesseract on PATH; `smoke-studies.mjs` 136/136, `smoke-persist.mjs` 40/40 then 47/47, `smoke-parameters.mjs` 58/58,
`smoke-workspace.mjs` 100/100, `smoke-seeding.mjs` 36/36 on `83e658d` (the tree that merged).

Read in this order before doing anything:

1. `CLAUDE.md` — non-negotiables, commands, the branch/remote rules; the top paragraphs give the release history
   (v1.0.4 toolbar removal, v1.0.5 manual calibration persistence, v1.0.6 studies table, v1.0.7 femoral confidence)
2. `docs/superpowers/HANDOFF.md` — the "2026-09-10 — editable femoral circles and overall confidence" section (the
   1.0.7 integration's rulings 1–10 and what is still owed), "Where things stand" (studies table DONE), "Decisions
   already made" 1–74, "Known traps"
3. `docs/releases/1.0.7.md` and `docs/releases/1.0.6.md` — what shipped, in the user's words
4. `docs/superpowers/plans/2026-09-10-studies-table-review.md` `## Ledger` — the studies-table plan's full record
5. `docs/ROADMAP.md` §5 and §7 — the deferred items

Resume point. **No plan is in flight.** The open items, in order of value:

1. **Packaged-build checks on an installed 1.0.7** (owed since 1.0.6): Settings shows no DEMO STUDIES row; the profile
   never gains `library-preferences.json`; automatic ruler calibration works with the bundled OCR (the source launch's
   failure was a dev-only PATH gap, fixed in `8443b81`/`e0a7a12`).
2. **Merge the wrap branch's docs** into `fork/main` (a PR from `claude/wrap-2026-09-11`; CI builds review artifacts on
   PRs, publishes nothing).
3. **The backend developer's items**, routed in PR #12's description and `docs/superpowers/HANDOFF.md` ruling 6: his
   release note's Escape wording; a missing calibration always forcing the confidence badge's review tone;
   `allow_empty=True` on every `/measure`; `geometry.manually_cleared` without a `STORE_VERSION` bump; dead
   `formatConfidence` and its three tests; the undefined `--amber` token; the edit bar's stage-wide band; re-running
   `tools/smoke/smoke-femoral-confidence.mjs` with his 1906×801 fixture. Ask before changing his design.
4. **ROADMAP §5/§7** from the studies-table plan: header filters for both tabs together (§7); the swallowed first click
   while a SUBJECT editor is open; the editor's 8px right inset; the disabled Delete button's invisible title; the
   unwritten Settings Hide/Show smoke check; `canonical()`'s NaN collapse in `renderer/calibration.js`; `merge()`'s dead
   `hideDemos` option; the unused `demo-settings` class; the A1 smoke check's caret half.
5. **New feature work starts with `superpowers:brainstorming`, then a plan, then subagent-driven development** —
   Sonnet for plan-complete code, Opus for the Find tab (`screens/studies.js`), the viewer and Analysis merges and
   their reviews, never Fable; every dispatch that runs a smoke suite says "foreground, capture to a file".

Ledgers: the studies-table plan's `## Ledger` is in the repo and travels. The 1.0.7 integration had no plan file; its
scratch ledger was deleted with the session and its content lives in HANDOFF's 1.0.7 section and PR #12's
description. Any new plan gets a workspace under `.superpowers/sdd/<plan>/` (git-ignored; excluded locally via
`.git/info/exclude`) — its ledger does not travel; fold rulings into the plan's `## Ledger` at the wrap.

Decisions already made — do not relitigate. The studies-table spec's §11 (1–10); that plan's "Rulings made while
planning"; HANDOFF "Decisions already made" 1–74 (67–74 are 2026-09-10's); the 1.0.7 integration's rulings 1–10 in
HANDOFF's femoral section. In one line each, the ones most likely to come up:

* filters stay as the shared Workspace/Folder selects; header filters are a ROADMAP §7 item for both tabs together
* Delete acts on the ticked VISIBLE real rows; never touches a demo; the prompt takes the bar's place
* PATIENT is SUBJECT, edited in place by single click; Enter moves down; a rebuild mid-edit keeps the editor (the
  removal-blur guard in `screens/studies.js`)
* `reviewedAt` on the record; status `'ok'`/Reviewed outranks every qc reason; QC warnings stay; the mark is cleared ON
  THE WRITE by every commit that replaces measurements, geometry or calibration (run, correction, reset,
  `withCalibration`)
* the demo toggle is development-only, two gates; the user: "I do NOT want this in the installer"
* films loaded together share one `addedAt` (the newest-first sort keeps scan order)
* the Analysis header's confidence badge and status badge never share a label (`Review recommended`, `Limited
  information`, `Checks passed` vs `Segmented`/`Needs review`/`Processing`/`Reviewed`); a running study reads
  `Updating…`
* releases: patch increments for features (the project's practice); bump `package.json`, `renderer/data/version.js`,
  `CHANGELOG.md`, `docs/releases/<v>.md` AND `README.md` together; check other open PRs for a version claim first
* the user tests the merged dev build, opens the PR in the web UI from a body file, and clicks "Create a merge commit"
  themselves; a collaborator's branch is never rewritten — reconcile on a new branch and supersede his PR

Manual gates the human owns: the packaged-build checks above; every release's dev-build gate before the PR; the
merge click.

Remote rules.

* Push to `fork` (`github.com/Feches/Spine-Contour`) only, and only feature/wrap branches (publishes nothing: the
  workflows trigger on exact branch names). Never `origin` (upstream, no write access). `gh` is NOT installed on this
  laptop: PRs are opened in the web UI; status comes from the unauthenticated GitHub API (60 requests/hour; job logs
  need a login).
* Never merge to `main` (a push to `main` publishes a versioned release); never rename onto `ui-redesign-cw`; never
  force-push.

Verification commands.

    node --test test/*.test.js          # 524/524 at the wrap; the directory form FAILS on Node 24
    "C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend/tests/unit -q       # 345 passed with Tesseract on PATH
    "C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend/tests/integration -q   # 58 passed; never concurrently with a canvas smoke suite

Run the app from source (all three lines; the shell starts in `C:\Users\codyj`). The venv has `onnx`/`onnxruntime` and
`backend/onnx/*.onnx` are exported (re-run `python tools/export_onnx.py` if they are missing). Automatic calibration
finds Tesseract in `C:\Program Files\Tesseract-OCR` on its own since `8443b81`:

    Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d"
    $env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"
    npm.cmd run dev

Smoke harness on a scratch profile (`tools/smoke/README.md` has the run order and baselines). From the Bash tool, set
`SPINE_CONTOUR_PYTHON` in the same command as `launch.mjs`; run every suite in the foreground and capture it to a
file under `tools/smoke/out/`; a suite that prints nothing has thrown; `smoke-studies.mjs` needs a FRESH launch and
takes about ten minutes; `smoke-persist.mjs` runs in two phases across a real restart on the SAME profile
(`SMOKE_KEEP_PROFILE=1`); his `smoke-femoral-confidence.mjs` needs `SMOKE_PREDICTION` (a real-image prediction JSON,
1906×801) that is not in the repo:

    SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/launch.txt 2>&1
    node tools/smoke/smoke-studies.mjs > tools/smoke/out/studies.txt 2>&1         # FRESH launch only
    node tools/smoke/cdp.mjs --quit

Live traps (the full list is HANDOFF "Known traps"):

* The Write and Edit tools rewrite backslash-u escapes in source as glyphs. Never change the form of a non-ASCII
  character on a line you touch; write NEW ones as escapes; byte-check added lines before every commit
  (`git diff -U0 -- <files> | grep -nP '^[+-].*[^\x00-\x7F]'`) and repair with a Python script written to a file.
* The Bash tool halves a doubled backslash in command text (a heredoc'd Python script turned `'\\r'` into a literal
  CR); write scripts with the Write tool and run them with `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe"`
  (bare `python` is the Microsoft Store stub). The venv Python writes CRLF to a pipe — `| tr -d '\r'` before comparing
  lines in bash — and the Write tool writes `.sh` files with CRLF.
* A pure function that takes a `platform` argument must join paths with `ntpath`/`posixpath`, never the host's
  `os.path`: the macOS CI job fails while Windows passes, and GitHub's job logs need a login — reproduce the runner's
  condition locally instead.
* Chromium fires a focused input's `blur` when a rebuild removes it; a deferred commit queued from that blur must
  check `input.isConnected` (the SUBJECT editor does).
* `update()` in the Studies and Analysis screens runs inside a store notification: no `setState` there; the Studies
  key array must list every store key and module-scope value the Find tab reads (`studies, query, running,
  confirmingId, confirmingSelected, editingSubject, deletingStudies, paramFilters, paramSelected, batch, findSort`).
* `el()` assigns to a property when the key exists: real booleans, never `'false'`; `list` and `style` are read-only
  accessors, never `el()` props.
* A second Spine Contour instance on this laptop doubles the backend's memory and CPU; never kill another instance
  unasked (the user's gate session runs on the normal profile); ask the user to close it before a long suite. A suite
  that exceeds the Bash tool's 600 s timeout keeps running: poll its output file.
* `git commit --amend`, `git reset --soft`, `git checkout -B` and a plain `git rebase --onto` pass the classifier,
  `--hard` and `rebase -i` do not; never bare `git stash` (the stack is shared across worktrees and holds a foreign
  entry). Write a long commit message to a file and `git commit -F` it. Selectors key on `data-find-key`,
  `data-param-key` and `data-study-id`, never a visible label. Never re-run a suite on an instance where one was
  killed.
