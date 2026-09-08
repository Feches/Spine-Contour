# Next session prompt

Written at the wrap of the 2026-09-07 execution session on branch `claude/preop-postop-study-fields`
(spec task 2 — the study fields — complete). Paste the block below into a fresh session. It is
self-contained: it does not assume the previous conversation. The two earlier prompts (the
Parameters-tab wrap and the studies-branch wrap) are in this file's history at `76e86b7`.

---

## Prompt

Work on Spine Contour, an Electron + Python/FastAPI app that measures spinopelvic parameters from
lateral lumbar radiographs.

**Working directory (absolute):** `C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628`
This is a **git worktree**, not the primary checkout; its directory name predates this work and means
nothing. Run everything from here; do not `cd` to `C:\Users\codyj\spine contour`.

**Branch:** `claude/preop-postop-study-fields`, at the docs commit made by this wrap, which sits
above `4c60ccf` (the final fix wave) and the eleven task commits of
`docs/superpowers/plans/2026-09-07-study-fields.md`, all above `claude/studies-ui-updates-bb040d` @
`76e86b7` (which has not moved). Pushed to `fork`, which publishes nothing (both preview workflows
fire only on a push to `ui-redesign-cw`; `windows.yml` only on `main`). **Nothing is half-done, no test
fails, no review finding is open.** The final whole-branch review was clean after one fix wave.

**Read in this order before doing anything:**
1. `CLAUDE.md` — non-negotiables, commands, the branch/remote rules
2. `docs/superpowers/HANDOFF.md` — "Where things stand" (the study-fields section is first),
   "Decisions already made" (27–46 are from the pre-op/post-op sessions; 40–46 from this one),
   "Known traps" (the `list`-accessor trap and the write-back trap are new)
3. `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` — the approved design as
   amended; §7–§11.1 are built; §11.2–§11.3 (paired export, task 4) and §12 (compare with pre-op,
   task 3) are not
4. `docs/superpowers/plans/2026-09-07-study-fields.md` — the completed plan; its "Rulings made while
   planning" and its `## Ledger` at the end hold every ruling, the execution record and the deferred
   findings
5. `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` — **binding**, wins over any plan
6. `docs/ROADMAP.md` — deferred work with no plan

**Resume point.** Two things, in order:
1. **The merge back into `claude/studies-ui-updates-bb040d` is DONE (fast-forward, 2026-09-07; both branches at the same commit on `fork`); branch the next task off the studies tip and never merge
   unasked.** First `git fetch fork` and check whether that branch moved
   (`git log --oneline HEAD..fork/claude/studies-ui-updates-bb040d`); if it did, dry-run with
   `git merge-tree --write-tree fork/claude/studies-ui-updates-bb040d HEAD` and rebase before anything
   else. Use superpowers:finishing-a-development-branch to present the options. Today it is a
   fast-forward.
2. **Spec task 4 (the paired wide export, §11.2–§11.3) or task 3 (compare with pre-op, §12 — needs
   plan 07's comparison mode first).** Neither has a plan. Method as before:
   superpowers:brainstorming against the section (the design is approved; confirm what is open),
   superpowers:writing-plans to a new plan file, superpowers:subagent-driven-development — a fresh
   subagent per task, Sonnet for mechanical tasks with complete code in the brief, Opus for DOM tasks,
   never Fable, the model set explicitly on every dispatch. `renderer/data/parameters.js` exports
   `pairedSubjects(studies, post)` and `ANY_POST`; `renderer/data/measurements.js` has `deltaRow`; the
   grid's `update()` key array must list every store key it reads.

**Ledger.** The plan's `## Ledger` (`docs/superpowers/plans/2026-09-07-study-fields.md`) travels with
the repo. The scratch SDD workspace `.superpowers/sdd/2026-09-07-study-fields/` (briefs, reports, review
packages, `progress.md`) is git-ignored and does NOT travel; it is kept until the branch is finished.
A new plan gets its own ledger the same way. Append `Session ended <date>: resume at <…>` at every wrap
and record every decision made in chat as `Ruling: <what> — <why> — <cost if wrong>`.

**Decisions already made — do not relitigate.** HANDOFF "Decisions already made" is the full list;
the spec's §6 has the design ones. From this session (HANDOFF 40–46 and the plan's rulings):
- the dev build seeds one demo pair — SP-0042 Pre-op and SP-0039 Post-op as subject `P-8841`, SP-0039's
  patient fields rewritten to match (40); the drawer's timepoint/view "chips" are native `<datalist>`
  suggestions (41); Import from CSV also writes the four study fields (42); task 2 is on its own branch,
  merged back by fast-forward at the user's say-so (43); the planner's rulings (44): a typed timepoint
  normalises to a known label, a cleared view stores `''` never null, the film date shows as stored,
  a `No timepoint` filter entry, paired-only is evaluated before the timepoint filter, the subject sort
  keeps a block Pre-op first in both directions, the load clause reads "folder or file names", fixed
  chips for the join key and structural columns, focus restore by `data-ws-key`
- the paired-only `with` dropdown's first entry and default is **All paired** (`ANY_POST`, `'__any__'`):
  a subject pairs on a Pre-op film plus any other labelled film; a label narrows; no timepoint never
  pairs (45)
- a CSV `view` and a drawer-typed view that name a known position are stored as the §7.3 label, like a
  timepoint (46)
- from the plan's Ledger: `seedFields` reports a derived row's view as `'row'`; `loadWorkspaceStudies`
  returns `clinicalUpdated` and the honesty clause reads "no blank clinical fields to fill"; the
  drawer's `commitStudyCell` writes the stored form back onto the node from both commit paths;
  `newStudy` uses `DEFAULT_VIEW`; a stale `pairedWith` stays displayed rather than reset

**Manual gates the human owns.** Every DOM task ends in a manual verification step that needs the
app running from source: stop and ask at each, **list the checks in the chat message itself** (the
user does not see prose behind a question widget), record every outcome in that task's commit body
(by amending the still-unpushed commit, or `git reset --soft` and re-committing when a fix commit sits
above it), never mark one done on a partial check, and record a check the user did not run as "not
checked by the human" with what stands in for it. The native file and folder pickers, the save dialog,
the datalist and date-picker popups, real mouse gestures and installing a packaged build are human
steps; the harness reaches everything else (inject records into the store; set a control's `.value`
and dispatch `change`). Plan 06's Gate 2 was skipped by the user and stays recorded as not run.

**Remote rules.**
- Push to `fork` (`github.com/Feches/Spine-Contour`) only. Never `origin` (upstream, no write
  access). Push only after the last amend of a gated commit.
- Never merge to `main`. `main` does not contain the redesign at all.
- Do not rename any branch onto `ui-redesign-cw` and do not push to `main`: those are the only two
  things that build an installer. A feature branch pushed to `fork` publishes nothing.
- Merging this branch back into `claude/studies-ui-updates-bb040d` is the user's call.

**Verification commands.**
```
node --test test/*.test.js          # 379/379 at the wrap; the directory form FAILS on Node 24
"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend -q    # 53 passed at an earlier wrap; untouched here
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
node tools/smoke/smoke-parameters.mjs   # 46/46; run it FIRST, before suites that add real films
node tools/smoke/smoke-seeding.mjs      # 36/36; before or after the others, never mid smoke-persist
node tools/smoke/smoke-workspace.mjs    # 100/100
node tools/smoke/smoke-studies.mjs      # 60/60 (58/60 is the documented badge race)
node tools/smoke/cdp.mjs --quit
```

**Live traps** (the full list is `HANDOFF.md` "Known traps"):
- A Sonnet implementer that backgrounds a suite and "waits for the Monitor" ends its turn;
  `SendMessage` is unavailable, so say "foreground, capture to a file" in every dispatch that runs a
  suite, and recover with a fresh finisher told the working-tree state. A reviewer can stall on the
  harness side (a 600 s watchdog) before reading anything — re-dispatch it.
- `list` and `style` are read-only accessors on a node: never `el()` props; `setAttribute` after
  construction. `el()` assigns to a property when the key exists: real booleans, never `'false'`.
- A commit that pre-arms the rebuild gate must write the stored form back onto the node when the
  store keeps something other than what was typed; the restore's blur listener is the only commit
  path after an external rebuild (`commitStudyCell`).
- `cdp-lib.mjs`'s `key()` knows Tab/Enter/Escape/arrows only (no Backspace) and sends no `text`; clear
  a cell by setting `.value` and dispatching `change`. Chromium shows no tooltip on a disabled control.
- Keep the ledger uncommitted during a gate; `git commit --amend` and `git reset --soft` pass the
  classifier, `--hard` does not. This worktree's `node_modules` carries the Electron binary; `npm
  install` would NOT fetch it. A smoke suite that prints nothing has thrown. Selectors key on `data-*`
  attributes, never a visible label. Never re-run a suite on an instance where one was killed mid-run.
- The Studies screen's `update()` runs inside a store notification: no `setState` there. The store's
  gates compare by reference: every patch passes a NEW object or array.
