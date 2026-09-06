# Next session prompt

Written at the wrap of the 2026-09-06 pre-op/post-op brainstorm and planning session, on branch
`claude/preop-postop-xray-org-2c4d80`. Paste the block below into a fresh session. It is
self-contained: it does not assume the previous conversation. The previous session's prompt (for
the studies branch) is kept verbatim below it.

---

## Prompt

Work on Spine Contour, an Electron + Python/FastAPI app that measures spinopelvic parameters from
lateral lumbar radiographs.

**Working directory (absolute):** `C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628`
This is a **git worktree**, not the primary checkout; its directory name predates this work and
means nothing. Run everything from here; do not `cd` to `C:\Users\codyj\spine contour`.

**Branch:** `claude/preop-postop-xray-org-2c4d80`, at the docs commit made by this wrap, which sits
above `271d78a` (the plan commit). It is six commits above `claude/studies-ui-updates-bb040d` @
`9735202`, all docs; no code has changed. It is pushed to `fork`, which publishes nothing (both
preview workflows fire only on a push to `ui-redesign-cw`; `windows.yml` only on `main`). The intent
is to merge this branch back into `claude/studies-ui-updates-bb040d` when task 1 is done, at the
user's say-so — never unasked.

**Read in this order before doing anything:**
1. `CLAUDE.md` — non-negotiables, commands, the branch/remote rules
2. `docs/superpowers/HANDOFF.md` — "Where things stand" (the pre-op/post-op section is first),
   "Decisions already made" (27–36 are from this session), "Known traps"
3. `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` — the approved design;
   §5, §6, §10, §11.1 and §14–§16 matter for task 1
4. `docs/superpowers/plans/2026-09-06-parameters-tab.md` — the plan to execute: its Global
   Constraints and file structure first, then Task 1; its `## Ledger` at the end is the progress file
5. `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` — **binding**, wins over any plan

**Method.** Execute the plan with **superpowers:subagent-driven-development**: a fresh subagent per
task, two-stage review between tasks. The user chose this. Model per task: **Sonnet** for Tasks 1,
2, 3, 7 and 8 (a signature change, a pure module with its suite, store keys, a smoke script, records);
**Opus** for Tasks 4, 5 and 6 (DOM code with manual verification). Never default a subagent to
Fable; set the model explicitly on every dispatch. Before dispatching Task 1, `git fetch fork` and
check whether `claude/studies-ui-updates-bb040d` has moved; if it has, dry-run with
`git merge-tree --write-tree fork/claude/studies-ui-updates-bb040d HEAD`, rebase, and re-read
`CLAUDE.md` and `HANDOFF.md`.

**Resume point.** Nothing is half-done: no code from the plan exists yet. Start at **Task 1**
(`toCsv` exports the union of clinical keys). Unit baseline 293/293 at the wrap; the plan expects
295 after Task 1 and 318 from Task 2 on. No failing tests, no open findings.

**Ledger.** `docs/superpowers/plans/2026-09-06-parameters-tab.md`, section `## Ledger`; it travels
with the repo. Append `Session ended <date>: resume at <task, fix round, open finding>` at every
wrap and record every decision made in chat there as `Ruling: <what> — <why> — <cost if wrong>`.

**Decisions already made — do not relitigate.** HANDOFF "Decisions already made" is the full list;
the spec's §6 has the design ones with their reasons. From this session (HANDOFF 27–36):
- subject, timepoint and film date are optional null-default fields on the film record — not
  folders, not clinical-map entries, not a patient entity — with no `STORE_VERSION` bump (27)
- the key is "Subject", a study code, never "Patient" or an MRN, and never burned into the film (28)
- timepoint is an ordered label (Pre-op, Intra-op, Post-op, N wk/mo/yr, custom), not a binary (29)
- view is seeded from folder/stem tokens that name a position, never inferred from a timepoint; a
  per-folder assignment table on the Workspace card replaces any per-load selector or
  null-until-set (30)
- "Film date" (`filmDate`) is the acquisition date; the Find tab's DATE stays the date added; a
  bare `date` CSV header is not recognised (31)
- no per-field provenance flag; explicit (CSV) beats inferred (folder); nothing overwrites a
  stored value on load (32)
- the Parameters tab defaults to segmented-only and says how many it hides; long export is
  primary, paired export ships last; nothing drops silently (33)
- `toCsv(studies, opts)` exports the union of clinical keys on the exported rows; the `fields`
  parameter is gone (34)
- task 1 sorts by study name (there is no id column) and the Studies search box applies to the
  grid (35)
- execution is subagent-driven, Sonnet for mechanical tasks and Opus for DOM tasks (36)
From earlier sessions, the ones task 1 touches: a study is named after its film while `SP-nnnn`
stays its identity (21); provenance is the two columns WORKSPACE and FOLDER and LORDOSIS is deleted
from the Find list (22); no backfill and no `STORE_VERSION` bump for optional fields (23); demo
studies are absent from both installers and present only in `npm run dev` (19).

**Manual gates the human owns.** Plan Tasks 4, 5 and 6 each end in a manual verification step that
needs the app running from source: stop and ask at each, record every outcome in that task's commit
body, and never mark one done on a partial check. The native save dialog in Task 6 cannot be driven
by the smoke harness. Anything the harness cannot reach — the native file and folder pickers, real
mouse gestures, installing a packaged build — is a human step. Plan 06's Gate 2 was skipped by the
user and stays recorded as not run.

**Remote rules.**
- Push to `fork` (`github.com/Feches/Spine-Contour`) only. **Never** `origin` (upstream, no write
  access).
- **Never merge to `main`.** `main` does not contain the redesign at all.
- Do not rename any branch onto `ui-redesign-cw` and do not push to `main`: those are the only two
  things that build an installer. A feature branch pushed to `fork` publishes nothing.
- Merging this branch back into `claude/studies-ui-updates-bb040d` is the user's call.

**Verification commands.**

```
node --test test/*.test.js          # 293/293 at the wrap; the directory form FAILS on Node 24
"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend -q    # 53 passed at the previous wrap; untouched here
```

Run the app from source (all three lines; the shell starts in `C:\Users\codyj`):

```
Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628"
$env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"
npm.cmd run dev
```

Smoke harness on a scratch profile (`tools/smoke/README.md` has the run order and baselines):

```
node tools/smoke/launch.mjs        # refuses with exit 3 if port 9222 is already held
node tools/smoke/smoke-parameters.mjs   # exists from plan Task 7 on; 22/22 expected
node tools/smoke/cdp.mjs --quit
```

**Live traps** (the full list is `HANDOFF.md` "Known traps"):
- This worktree may lack `node_modules\electron\dist`. `npm install` will NOT fetch it (install
  scripts are blocked on this machine): copy `dist` and `path.txt` from
  `..\studies-ui-updates-bb040d\node_modules\electron\`.
- The auto-mode permission classifier refuses `git reset --hard`; `git checkout -B <branch> <target>`
  is accepted and is the same operation for a branch with no unique commits — prove that first.
- Another session works on `claude/studies-ui-updates-bb040d` and can move it under you; rebase
  before writing code, not after.
- `el()` assigns to a property when the key exists on the node: pass real booleans
  (`checked: true`, `disabled: false`), never the string `'false'`.
- A smoke suite that prints nothing has thrown, not passed; re-run it bare and read the stack.
  Smoke selectors key on `data-param-key` and `data-study-id`, never on a visible label.
- The Studies screen's `update()` runs inside a store notification: no `setState` there — DOM
  event handlers only.
- The store's gates compare by reference: every `setState` patch passes a NEW object or array.

---

## Previous prompt — studies-and-UI-updates wrap (2026-09-06)

Kept verbatim. It describes resuming on `claude/studies-ui-updates-bb040d`, the branch this one
merges back into; its open items (the demo gate never run in a packaged build, the preview installer
never tested with plan 06's code, the production workflow's missing checks) still stand.

### Prompt

Work on Spine Contour, an Electron + Python/FastAPI app that measures spinopelvic parameters from
lateral lumbar radiographs.

**Working directory (absolute):** `C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d`
This is a **git worktree**, not the primary checkout. Run everything from here; do not `cd` to
`C:\Users\codyj\spine contour`. The primary checkout is a separate working tree on another branch.

**Branch:** `claude/studies-ui-updates-bb040d`, at the docs commit made by this wrap, which sits on
top of `93e4850`. It is 8 commits above `origin/ui-redesign-cw` @ `0022d91` and is pushed to
`fork`. There is no work in progress and no failing test — the previous session closed clean.

**Read in this order before doing anything:**
1. `CLAUDE.md` — non-negotiables, commands, the branch/remote rules
2. `docs/superpowers/HANDOFF.md` — "Where things stand" (the 2026-09-06 section is first),
   "Decisions already made" (19–26 are from that session), "Known traps"
3. `docs/ROADMAP.md` — deferred work with no plan yet; items 2 and the demo-studies bullet are
   closed, the rest are open
4. `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` — **binding**, wins over any plan

**Method.** There is no plan document for the last session's work and none is needed: it was seven
changes the user asked for directly. If the next task is comparably sized, work the same way —
investigate against the real code first, implement, and verify at the running app. If it is a
plan-sized piece of work, `docs/superpowers/plans/` holds the numbered plans and
`2026-08-31-07-similar-comparison.md` is the deferred plan 07.

**Resume point.** Nothing is half-done. The open items, in the order they matter:

1. **The demo gate has never run in a packaged build.** An installed app now opens on an EMPTY
   studies list. The gate is `!app.isPackaged`, so every test ran with demos ON — the shipping
   branch has literally never executed. Worst case is cosmetic (an installed app that still shows
   nine demo studies) and it is obvious on first open. **Check it first the next time a preview
   installer is built for any reason.** Both electron-builder allowlists were verified
   byte-identical and `renderer/**/*` does cover the new `renderer/data/labels.js`, so the
   blank-window failure mode is already ruled out.
2. **The preview installer has still never been tested with plan 06's code in it** (pre-existing,
   see "Release prerequisites"). The last packaged build anyone ran was from `6592228`.
3. `docs/ROADMAP.md` "Release prerequisites" — in particular `.github/workflows/windows.yml`
   publishes the **production** installer while running pytest only: no renderer tests, no
   allowlist check.

**Ledger.** There is no separate ledger file; the numbered plans carry their own SDD ledgers inside
them and the last session was not executing a plan. `HANDOFF.md` is the current-state document and
it travels with the repo.

**Decisions already made — do not relitigate.** `HANDOFF.md` "Decisions already made" is the full
list. From 2026-09-06 specifically: demo studies are absent from BOTH installers, not just
production (19, reverses an earlier decision); the gate rides the `load-studies` payload and never
the allowlists (20); a study is named after its film while `SP-nnnn` stays its identity (21);
provenance is TWO columns and `LORDOSIS` is deleted (22); no backfill and no `STORE_VERSION` bump
(23); pan/edit exclusivity is ONE-WAY (24); "double click to move the x-ray" meant a left+right
chord, not a dblclick (25); the film's watermark keeps the id, not the name, because a filename can
carry PHI (26).

**Manual gates the human owns.** Anything the smoke harness cannot reach: the native file and
folder pickers, cancelling them, real mouse gestures, and installing and opening a packaged build.
Plan 06's Gate 2 was skipped by the user and is recorded as not run — do not mark it passed.
Stop and ask at every MANUAL VERIFICATION step; never mark one complete on a partial check.

**Remote rules.**
- Push to `fork` (`github.com/Feches/Spine-Contour`). **Never** `origin` (upstream, no write access).
- **Never merge to `main`.** `main` does not contain the redesign at all — it is still the flat
  `index.html`/`renderer.js` app, 199 commits behind. Nothing needs merging from it either.
- Workflow triggers are exact branch names, no wildcards: both preview workflows fire on a push to
  `ui-redesign-cw`; `windows.yml` fires on `main`. A feature branch pushed to `fork` publishes
  nothing. Do not rename a branch onto `ui-redesign-cw` without meaning to build an installer.
- `origin/ui-redesign-cw` is the real trunk and carries the newer backend (`framing.py`,
  `femoral.py`, `landmarks.py`, `models/hrnet.py`). Local and `fork/ui-redesign-cw` are an OLDER
  lineage sharing the name — read `origin/ui-redesign-cw` when you need "what the Preview runs".

**Verification commands.**

```
node --test test/*.test.js          # 293/293 as of the wrap; the directory form FAILS on Node 24
"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend -q    # 53 passed
```

Run the app from source (all three lines; the shell starts in `C:\Users\codyj`):

```
Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d"
$env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"
npm.cmd run dev
```

Smoke harness on a scratch profile (`tools/smoke/README.md` has the run order and the baselines):

```
node tools/smoke/launch.mjs        # refuses with exit 3 if port 9222 is already held
node tools/smoke/cdp.mjs --quit
```

Baselines at the wrap: `studies` 60/60, `workspace` 96/96, `persist` 36/36 then 44/44,
`parity` 15/15, `gate1` 25/25, `gate2` 32/32, `gate3` 23/23 — all at the final code commit
`93e4850`. **`chip` 20/20 and `chord` 28/28 are from one commit earlier (`eb7cf36`)**: three
attempts to re-run them wedged the renderer rather than failing, after hours of Electron and
segmentation on this laptop. `93e4850` cannot affect them — it touches only
`renderer/data/labels.js`, its test and a `smoke-persist` assertion, and `labels.js` is referenced
nowhere in `renderer/components/viewer.js` or `renderer/viewer/`. **Re-run both first thing on a
fresh machine**; if either fails, that is new information, not a known issue.

**Live traps** (the full list is `HANDOFF.md` "Known traps"; these four cost the most time):
- A mouse chord is born in `pointermove`, never `pointerdown` — Chromium fires `pointerdown` only
  on the no-buttons→some-button transition. Test the `buttons` bitmask, never `button`.
- A CDP `mouseMoved` with `button: 'none'` silently drops pointer capture — a false negative that
  looks exactly like a real defect. Carry the held buttons on every move.
- A smoke suite that prints NOTHING has thrown, not passed: `smoke-workspace` and `smoke-persist`
  buffer their results. Re-run bare, without `grep`, and read the stack.
- `npm install` in a fresh worktree does NOT give you a working Electron — this machine's npm blocks
  install scripts, so the ~244 MB binary never downloads. Copy `node_modules/electron/dist` and
  `path.txt` from a worktree that already has it.
