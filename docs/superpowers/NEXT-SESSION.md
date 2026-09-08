# Next session prompt

Written at the wrap of the 2026-09-08 planning session on branch `claude/preop-postop-paired-export`
(spec task 4 — the paired export — brainstormed, spec amended, plan written and reviewed; nothing
implemented). Paste the block below into a fresh session. It is self-contained: it does not assume the
previous conversation. The earlier prompts (the study-fields wrap, the Parameters-tab wrap and the
studies-branch wrap) are in this file's history at `adf3c19` and `76e86b7`.

---

## Prompt

Work on Spine Contour, an Electron + Python/FastAPI app that measures spinopelvic parameters from
lateral lumbar radiographs.

**Working directory (absolute):** `C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628`
This is a **git worktree**, not the primary checkout; its directory name predates this work and means
nothing. Run everything from here; do not `cd` to `C:\Users\codyj\spine contour`.

**Branch:** `claude/preop-postop-paired-export`, at the docs commit made by this wrap, which sits above
`83ab3a8` (the reviewed plan), `bf2266f` (the plan), `651d72b` (the spec amendment) and the studies tip
`adf3c19` (`claude/studies-ui-updates-bb040d`, which holds spec tasks 1 and 2 merged; it had not moved at
the wrap). Pushed to `fork`, which publishes nothing (both preview workflows fire only on a push to
`ui-redesign-cw`; `windows.yml` only on `main`). **No code has been written for task 4; no test fails (unit
379/379); no review finding is open.**

**Read in this order before doing anything:**
1. `CLAUDE.md` — non-negotiables, commands, the branch/remote rules
2. `docs/superpowers/HANDOFF.md` — "Where things stand" (the paired-export section is first), "Decisions
   already made" (27–50 are from the pre-op/post-op sessions; 47–50 are the paired export's), "Known traps"
3. `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` — §6 decisions 8–9, §7.1–§7.2,
   §10.3–§10.4, §11 (all of it), §14: the approved design, with §10.4, §11.2 and §11.3 as amended on 2026-09-08
4. `docs/superpowers/plans/2026-09-08-paired-export.md` — **the plan to execute**: its header, Global
   Constraints, "Rulings made while planning", the six tasks, and its `## Ledger` at the end
5. `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` — **binding**, wins over any plan
6. Only if a question arises: `docs/superpowers/plans/2026-09-07-study-fields.md` "Rulings made while
   planning" and `## Ledger` — the previous task's rulings, which the code already embodies

**Resume point.** First `git fetch fork` and check whether the studies branch moved
(`git log --oneline HEAD..fork/claude/studies-ui-updates-bb040d`); if it did, dry-run with
`git merge-tree --write-tree fork/claude/studies-ui-updates-bb040d HEAD` and rebase before anything else.
Then **execute the plan from Task 1** with superpowers:subagent-driven-development: a fresh subagent per
task with two-stage review; Sonnet for Tasks 1, 2, 3, 5, 6 (complete code is in each brief), Opus for Task 4
(DOM, human gate); never Fable; the model set explicitly on every dispatch. Task 4 commits before its gate
with a pending line, the gate's seven checks are listed in the chat message, the commit is amended with the
outcomes, and only then does Task 5 start. Do not re-brainstorm and do not re-plan: the design is approved
and the plan was independently reviewed (Opus, no blocking finding) and amended.

**Ledger.** The plan's `## Ledger` (`docs/superpowers/plans/2026-09-08-paired-export.md`) travels with the
repo. Create the scratch SDD workspace `.superpowers/sdd/2026-09-08-paired-export/` (git-ignored; briefs,
reports, review packages, `progress.md`) at the start of execution; it does NOT travel. Append
`Session ended <date>: resume at <…>` at every wrap and record every decision made in chat as
`Ruling: <what> — <why> — <cost if wrong>`.

**Decisions already made — do not relitigate.** HANDOFF "Decisions already made" is the full list; the
spec's §6 has the design ones; the plan's "Rulings made while planning" has the planner's (a written
subject's `films` is a Map; the ambiguous clause writes the count as a word; one shared note under the
buttons; `postFromFilters` lives in `pairing.js`; `exportFileName(workspace, kind)`; `delta1` in `csv.js`;
visits are the candidates a written subject carries; `otherVisits` counts written subjects' films only; no
CSS change; smoke section 13 with twelve checks; the Sonnet/Opus assignment). From the 2026-09-08
brainstorm (HANDOFF 47–50, spec §10.4/§11.2/§11.3):
- the wide file is one row per subject with one visit per later label present; under a single `with` label
  it collapses to the two-visit file (47)
- layout B, measurement-major: identity columns per visit, then per measurement `<M> Pre-op`,
  `<M> <label>`, `Delta <M> <label>`, then clinical keys per visit; stored labels in headers, ASCII `Delta`,
  deltas computed over the one-decimal values written (48)
- a subject with two films on any written label is ambiguous and gets no row, named in the toast with the
  label and count; unpaired (no Pre-op film, or no film on a written visit) is judged first (49)
- the toast's duration scales with its length: 2.2 s to forty characters, then 40 ms per character,
  capped at 8 s, for every toast (50)
- the paired button reads `Export paired · N selected` with a selection; disabled with the long button's
  note when that one is disabled, else `No paired subjects in these rows`; file `<workspace>-paired.csv` or
  `library-paired.csv` (§10.4)
- earlier and still binding: the paired-only `with` default is `All paired` (45); views and timepoints
  normalise to known labels (46); `subjectId`/`timepoint`/`filmDate` are optional null-default fields with no
  `STORE_VERSION` bump (27); the key is Subject, never an MRN, never burned into the film (28)

**Manual gates the human owns.** Task 4 ends in a manual verification step — seven checks: the demos-only
note, the save dialog's suggested name, the file in Excel, the toast and its duration, a partial selection,
a single-label export, a cancelled dialog — that needs the app running from source. Stop and ask at it,
**list the checks in the chat message itself** (the user does not see prose behind a question widget),
record every outcome in that task's commit body by amending the still-unpushed commit, never mark one done
on a partial check, and record a check the user did not run as "not checked by the human" with what stands
in for it. The save dialog, Excel, the toast's duration and the cancel are human steps; the harness reaches
the button states and the file text (Task 4's dry run).

**Remote rules.**
- Push to `fork` (`github.com/Feches/Spine-Contour`) only. Never `origin` (upstream, no write access).
  Push only after the last amend of the gated commit.
- Never merge to `main`. `main` does not contain the redesign at all.
- Do not rename any branch onto `ui-redesign-cw` and do not push to `main`: those are the only two things
  that build an installer. A feature branch pushed to `fork` publishes nothing.
- Merging this branch back into `claude/studies-ui-updates-bb040d` is the user's call, never unasked.

**Verification commands.**
```
node --test test/*.test.js          # 379/379 at the wrap; 402/402 after Task 3; the directory form FAILS on Node 24
"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend -q    # 53 passed at an earlier wrap; untouched
```
Run the app from source (all three lines; the shell starts in `C:\Users\codyj`):
```
Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628"
$env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"
npm.cmd run dev
```
Smoke harness on a scratch profile (`tools/smoke/README.md` has the run order and baselines):
```
node tools/smoke/launch.mjs             # refuses with exit 3 if port 9222 is already held
node tools/smoke/smoke-parameters.mjs   # 46/46 now, 58/58 after Task 5; run it FIRST, before suites that add real films
node tools/smoke/smoke-seeding.mjs      # 36/36; before or after the others, never mid smoke-persist
node tools/smoke/smoke-workspace.mjs    # 100/100
node tools/smoke/smoke-studies.mjs      # 60/60 (58/60 is the documented badge race)
node tools/smoke/cdp.mjs --quit
```

**Live traps** (the full list is `HANDOFF.md` "Known traps"):
- A Sonnet implementer that backgrounds a suite and "waits for the Monitor" ends its turn; `SendMessage` is
  unavailable, so say "foreground, capture to a file" in every dispatch that runs a suite, and recover with
  a fresh finisher told the working-tree state. A reviewer can stall on the harness side (a 600 s watchdog)
  before reading anything — re-dispatch it.
- `list` and `style` are read-only accessors on a node: never `el()` props; `setAttribute` after
  construction. `el()` assigns to a property when the key exists: real booleans, never `'false'`.
- The Parameters grid's `update()` key array must list every store key it reads; task 4 adds no store key
  — do not add one.
- `cdp-lib.mjs`'s `key()` knows Tab/Enter/Escape/arrows only (no Backspace) and sends no `text`; clear a
  cell by setting `.value` and dispatching `input` or `change`. Chromium shows no tooltip on a disabled
  control.
- Keep the ledger uncommitted during a gate; `git commit --amend` and `git reset --soft` pass the
  classifier, `--hard` does not. Write a long commit message to a file and `git commit -F` it: long or
  quote-heavy heredocs fail to parse here, and Git Bash `sed` drops backslashes from replacement text (patch
  `\u`-bearing text with a small Python script). This worktree's `node_modules` carries the Electron
  binary; `npm install` would NOT fetch it. A smoke suite that prints nothing has thrown. Selectors key on
  `data-*` attributes, never a visible label. Never re-run a suite on an instance where one was killed
  mid-run.
- The Studies screen's `update()` runs inside a store notification: no `setState` there. The store's gates
  compare by reference: every patch passes a NEW object or array.
