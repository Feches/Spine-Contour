# Next session prompt

Written at the wrap of the 2026-09-08 execution session on branch `claude/preop-postop-paired-export`
(spec task 4 — the paired export — implemented, reviewed and gated; nothing is left in its plan). Paste the
block below into a fresh session. It is self-contained: it does not assume the previous conversation. The earlier
prompts (the paired-export planning wrap, the study-fields wrap, the Parameters-tab wrap and the studies-branch
wrap) are in this file's history at `c3a4265`, `adf3c19` and `76e86b7`.

---

## Prompt

Work on Spine Contour, an Electron + Python/FastAPI app that measures spinopelvic parameters from lateral lumbar
radiographs.
Working directory (absolute): `C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628`
This is a git worktree, not the primary checkout; its directory name predates this work and means nothing. Run
everything from here; do not `cd` to `C:\Users\codyj\spine contour`.
Branch: `claude/preop-postop-paired-export`, at the merge-record docs commit above `b73e02e` (the wrap), which sits
above the seven execution commits `55447a5`..`b37b759` and the four planning commits, on the studies tip `adf3c19`.
`claude/studies-ui-updates-bb040d` (spec tasks 1, 2 and now 4 merged) was fast-forwarded to the same commit on
2026-09-08 at the user's say-so, so both branches are at the same tip and both are on `fork`, which publishes
nothing (both preview workflows fire only on a push to `ui-redesign-cw`; `windows.yml` only on `main`). Spec task 4
is COMPLETE: every plan task done and reviewed, the human gate passed, the final whole-branch review clean after one
fix wave; no test fails (unit 402/402); no review finding is open. Start the next feature on a NEW branch off that
tip.

Read in this order before doing anything:

1. `CLAUDE.md` — non-negotiables, commands, the branch/remote rules
2. `docs/superpowers/HANDOFF.md` — "Where things stand" (the paired-export section is first), "Decisions already
   made" (27–50 are the pre-op/post-op sessions'), "Known traps"
3. `docs/superpowers/plans/2026-09-08-paired-export.md` `## Ledger` (the end of the file) — every ruling made while
   planning and executing, and why
4. `docs/ROADMAP.md` — the deferred work, including the four §5 items this branch added on 2026-09-08
5. Only if the next work is spec task 3: `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md`
   §12 and §15
6. `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` — binding, wins over any plan

Resume point. There is nothing to resume in the paired-export plan, and the merge back is done. The user's next work,
decided in chat on 2026-09-08: **batch segmentation of loaded films, ahead of a release.** It is new design — in
neither the pre-op/post-op spec nor `docs/ROADMAP.md` — so it starts with superpowers:brainstorming (a short design
conversation with worked examples, then a spec and a plan via superpowers:writing-plans, executed in a separate
session by subagent-driven development), on a new branch off the studies tip. Constraints the brainstorm must respect:
`state.running` is a single study id by decision (HANDOFF 13) and `sourceAvailable` was dropped with it; `/predict`
takes one film per request at roughly five to sixty seconds each on this CPU-only laptop and has no progress channel,
so per-film progress stays indeterminate and only a COUNT ("3 of 40 done") is honest status; the viewer's measure
queue (`viewer/measure-queue.js`) owns `/measure` re-runs, not `/predict`; the Parameters grid already ticks rows and
the Studies summary already counts films "in queue". The CSV round trip (ROADMAP §1), spec task 3 (after plan 07) and
the smaller ROADMAP items wait behind it. The release prerequisites in HANDOFF still stand before any production
build, batch segmentation included: no installer has been tested since before plan 06, and `windows.yml` lacks the
repository guard and the allowlist check.

Ledger. The plan's `## Ledger` (`docs/superpowers/plans/2026-09-08-paired-export.md`) travels with the repo and holds
every ruling from planning and execution. The scratch SDD workspace `.superpowers/sdd/2026-09-08-paired-export/`
was deleted at the wrap; it never travelled. A new plan creates its own workspace when execution starts.

Decisions already made — do not relitigate. HANDOFF "Decisions already made" is the full list; the spec's §6 has the
design ones; the paired-export plan's "Rulings made while planning" and `## Ledger` have the planner's and the
executor's. From the paired export (HANDOFF 47–50, spec §10.4/§11.2/§11.3, all built):

* one row per subject with one visit per later label present; a single `with` label collapses it to the two-visit
  file (47)
* layout B, measurement-major: identity columns kind by kind (every visit's study, then view, then film date), then
  per measurement `<M> Pre-op`, `<M> <label>`, `Delta <M> <label>`, then clinical keys per visit; stored labels in
  headers, ASCII `Delta`, deltas over the one-decimal values written (48)
* a subject with two films on any written label is ambiguous and gets no row, named in the toast with the label and
  count; unpaired (no Pre-op film, or no film on a written visit) is judged first (49)
* every toast lasts 2.2 s to forty characters, then 40 ms per character, capped at 8 s (50)
* the paired button reads `Export paired · N selected` with a selection; disabled with the long button's note when
  that one is disabled, else `No paired subjects in these rows`; file `<workspace>-paired.csv` or
  `library-paired.csv` (§10.4)
* settled during execution (2026-09-08, in the plan's ledger): a `Pre-op` post label is read as All paired, never
  self-paired; the paired path's demo predicate is `source === 'real'` like the long one; the prototype-key clinical
  leak, the citation-block duplication in `csv.js`, the gate-2 toast window and the stale studies check are ROADMAP
  items, not this branch's fixes
* earlier and still binding: the paired-only `with` default is `All paired` (45); views and timepoints normalise to
  known labels (46); `subjectId`/`timepoint`/`filmDate` are optional null-default fields with no `STORE_VERSION`
  bump (27); the key is Subject, never an MRN, never burned into the film (28)

Manual gates the human owns. None pending. Task 4's seven-check gate passed on 2026-09-08 (the user replied "ok
checks pass"); the outcomes are in `19b8d43`'s body. A new plan's DOM tasks get their own gates: list the checks in
the chat message itself, end the turn, record every outcome by amending the still-unpushed commit, and tell the user
to close any app instance left open from earlier first — it runs the code it was launched with.

Remote rules.

* Push to `fork` (`github.com/Feches/Spine-Contour`) only. Never `origin` (upstream, no write access).
* Never merge to `main`. `main` does not contain the redesign at all.
* Do not rename any branch onto `ui-redesign-cw` and do not push to `main`: those are the only two things that
  build an installer. A feature branch pushed to `fork` publishes nothing.
* This branch was merged back on 2026-09-08. The next feature gets its own branch off the studies tip and is merged
  back only at the user's say-so, never unasked; each task branch is merged before the next starts.

Verification commands.

```
node --test test/*.test.js          # 402/402 at the wrap; the directory form FAILS on Node 24
"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend -q    # 53 passed at an earlier wrap; untouched
```

Run the app from source (all three lines; the shell starts in `C:\Users\codyj`):

```
Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628"
$env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"
npm.cmd run dev
```

Smoke harness on a scratch profile (`tools/smoke/README.md` has the run order and baselines). From the Bash tool, set
`SPINE_CONTOUR_PYTHON` in the same command as `launch.mjs`; run every suite in the foreground and capture it to a
file under `tools/smoke/out/`; a suite that prints nothing has thrown:

```
node tools/smoke/launch.mjs             # refuses with exit 3 if port 9222 is already held
node tools/smoke/smoke-parameters.mjs   # 58/58; run it FIRST, before suites that add real films
node tools/smoke/smoke-seeding.mjs      # 36/36
node tools/smoke/smoke-workspace.mjs    # 100/100
node tools/smoke/cdp.mjs --quit
node tools/smoke/launch.mjs             # smoke-studies on a FRESH launch, never after smoke-workspace
node tools/smoke/smoke-studies.mjs      # 59/60: "searching the diagnosis text leaves only SP-0042" is stale since 0f8f821
node tools/smoke/cdp.mjs --quit
```

Live traps (the full list is HANDOFF "Known traps"):

* The Edit and Write tools rewrite backslash-u escapes in JS source as the glyphs, and once turned a `§` in a JS
  comment into its escape; both forms compare equal at runtime, so no test catches it. Byte-check the diff before
  every commit that touches such a line and repair with a small Python script written to a file — Git Bash `sed`
  and `bash -c` one-liners drop the backslashes. It hit four subagents in one session despite a warning in every
  brief.
* A Sonnet implementer that backgrounds a suite and "waits for the Monitor" ends its turn; `SendMessage` is
  unavailable here, so say "foreground, capture to a file" in every dispatch that runs a suite, and run a fix round
  with a fresh implementer given the report file.
* An app instance left open from an earlier day (this worktree's `electron.exe`, not on port 9222) runs old code; a
  gate launch must close it first. Never kill it unasked — it may be on the user's real library. The smoke
  harness's scratch-profile instance coexists with it.
* `list` and `style` are read-only accessors on a node: never `el()` props. `el()` assigns to a property when the
  key exists: real booleans, never `'false'`. The Parameters grid's `update()` key array must list every store key
  it reads. The Studies screen's `update()` runs inside a store notification: no `setState` there. Every patch
  passes a NEW object or array.
* Keep the ledger uncommitted during a gate; `git commit --amend` and `git reset --soft` pass the classifier,
  `--hard` does not. Write a long commit message to a file and `git commit -F` it. This worktree's `node_modules`
  carries the Electron binary; `npm install` would NOT fetch it. Selectors key on `data-*` attributes, never a
  visible label. Never re-run a suite on an instance where one was killed mid-run. `cdp-lib.mjs`'s `key()` knows
  Tab/Enter/Escape/arrows only and sends no `text`; clear a cell by setting `.value` and dispatching `input` or
  `change`. Chromium shows no tooltip on a disabled control.
