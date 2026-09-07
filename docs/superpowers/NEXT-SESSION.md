# Next session prompt

Written at the wrap of the 2026-09-06/07 execution session on branch
`claude/preop-postop-xray-org-2c4d80` (the Parameters tab, spec task 1, plus its addendum). Paste the
block below into a fresh session. It is self-contained: it does not assume the previous conversation.
The studies-branch prompt from the wrap before is kept verbatim below it.

---

## Prompt

Work on Spine Contour, an Electron + Python/FastAPI app that measures spinopelvic parameters from
lateral lumbar radiographs.

**Working directory (absolute):** `C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-preview-audit-dd3628`
This is a **git worktree**, not the primary checkout; its directory name predates this work and means
nothing. Run everything from here; do not `cd` to `C:\Users\codyj\spine contour`.

**Branch:** `claude/preop-postop-xray-org-2c4d80`, at the docs commit made by this wrap, which sits
above `28431ef` (the ledger) and `211a2b8` (the last code commit). It holds spec task 1 — the
Parameters tab (plan Tasks 1–8) and its addendum (Tasks 9–12: the CSV's `Source` column removed;
ticked rows export a chosen subset) — above `claude/studies-ui-updates-bb040d` @ `9735202`. Pushed to
`fork`, which publishes nothing (both preview workflows fire only on a push to `ui-redesign-cw`;
`windows.yml` only on `main`). **Nothing is half-done, no test fails, no review finding is open.**

**Read in this order before doing anything:**
1. `CLAUDE.md` — non-negotiables, commands, the branch/remote rules
2. `docs/superpowers/HANDOFF.md` — "Where things stand" (the Parameters-tab section is first),
   "Decisions already made" (27–39 are from these sessions), "Known traps" (the first four are new)
3. `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` — the approved design;
   §7–§9 with §8.5 (the folder table) are spec task 2; §10–§11 as amended are what is built
4. `docs/superpowers/plans/2026-09-06-parameters-tab.md` — the completed plan; its `## Ledger` at the
   end holds every ruling and every deferred review finding
5. `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` — **binding**, wins over any plan
6. `docs/ROADMAP.md` — deferred work with no plan

**Resume point.** Two things, in order:
1. **The merge back into `claude/studies-ui-updates-bb040d`** — the user's call; never merge unasked.
   First `git fetch fork` and check whether that branch moved
   (`git log --oneline HEAD..fork/claude/studies-ui-updates-bb040d`); if it did, dry-run with
   `git merge-tree --write-tree fork/claude/studies-ui-updates-bb040d HEAD` and rebase before anything
   else. Use superpowers:finishing-a-development-branch to present the options.
2. **Spec task 2** — subject, timepoint, film date and view on the record (§7), seeding from folders
   and the CSV with the Workspace card's per-folder assignment table (§8, §8.5), the drawer's Study
   row group (§9), the timepoint/view/subject/paired-only filters and the subject sort on the
   Parameters grid, the load-message clauses, the three new export columns. **It has no plan.**
   Method: superpowers:brainstorming against §7–§9 (the design is approved; confirm the open points in
   §16), then superpowers:writing-plans to a new plan file, then superpowers:subagent-driven-development
   as before — a fresh subagent per task, Sonnet for mechanical tasks and Opus for DOM tasks, never
   Fable, the model set explicitly on every dispatch. The Parameters grid now has a `paramSelected`
   key, and `renderer/screens/parameters.js`'s `update()` has a key array that must list every store
   key the grid reads.

**Ledger.** `docs/superpowers/plans/2026-09-06-parameters-tab.md`, section `## Ledger`; it travels
with the repo. A new plan gets its own ledger the same way. Append `Session ended <date>: resume at
<…>` at every wrap and record every decision made in chat as `Ruling: <what> — <why> — <cost if wrong>`.

**Decisions already made — do not relitigate.** HANDOFF "Decisions already made" is the full list;
the spec's §6 has the design ones. From these sessions (HANDOFF 27–39):
- subject, timepoint and film date are optional null-default fields on the film record, no
  `STORE_VERSION` bump (27); the key is "Subject", never "Patient" or an MRN, never burned into the
  film (28); timepoint is an ordered label, not a binary (29); view is seeded from folder/stem tokens
  that name a position, never from a timepoint, with a per-folder assignment table on the Workspace
  card (30); "Film date" is the acquisition date and a bare `date` CSV header is not recognised (31);
  no per-field provenance flag, explicit beats inferred, nothing overwrites a stored value on load
  (32); the Parameters tab defaults to segmented-only and says how many it hides, long export
  primary (33); `toCsv` exports the union of clinical keys (34); sort by name and the search box
  applies to the grid (35); execution is subagent-driven, Sonnet or Opus by task kind (36)
- the CSV's `Source` column and the `includeDemo` option are gone; `toCsv(studies)` never writes a
  demo row (37)
- ticked rows export as a chosen subset: the export writes the selected rows that are VISIBLE, in
  grid order; hidden picks stay ticked and return with the filter; nothing ticked exports every
  visible row (38)
- the row checkbox lives inside the sticky STUDY cell; the study name is the row's link, not the
  whole row; there are no filter chips (39, controller rulings accepted at the gate)
- from the plan's Ledger: `sameKey` stays duplicated (ROADMAP item 6); DOM tasks commit before their
  gate with a pending line and are amended after; implementers dry-run the manual checks over the
  harness first; the whole-branch review covers the execution range, not the spec/plan docs commits

**Manual gates the human owns.** Every DOM task ends in a manual verification step that needs the app
running from source: stop and ask at each, record every outcome in that task's commit body (by
amending the still-unpushed commit), never mark one done on a partial check, and record a check the
user did not run as "not checked by the human" with what stands in for it. The native file and folder
pickers, the save dialog, real mouse gestures and installing a packaged build are human steps; the
harness reaches everything else (inject records into the store for what the pickers would add).
Plan 06's Gate 2 was skipped by the user and stays recorded as not run.

**Remote rules.**
- Push to `fork` (`github.com/Feches/Spine-Contour`) only. **Never** `origin` (upstream, no write
  access). Push only after the last amend of a gated commit.
- **Never merge to `main`.** `main` does not contain the redesign at all.
- Do not rename any branch onto `ui-redesign-cw` and do not push to `main`: those are the only two
  things that build an installer. A feature branch pushed to `fork` publishes nothing.
- Merging this branch back into `claude/studies-ui-updates-bb040d` is the user's call.

**Verification commands.**

```
node --test test/*.test.js          # 333/333 at the wrap; the directory form FAILS on Node 24
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
node tools/smoke/launch.mjs             # refuses with exit 3 if port 9222 is already held
node tools/smoke/smoke-parameters.mjs   # 33/33; run it FIRST, before suites that add real films
node tools/smoke/smoke-studies.mjs      # 60/60 (58/60 is the documented badge race)
node tools/smoke/cdp.mjs --quit
```

**Live traps** (the full list is `HANDOFF.md` "Known traps"):
- A Sonnet implementer that backgrounds a suite and "waits for the Monitor" ends its turn; SendMessage
  is unavailable, so say "foreground, capture to a file" in every dispatch that runs a suite, and
  recover with a fresh finisher told the working-tree state.
- `cdp-lib.mjs`'s `key('Enter')` and Space send no `text`; a native button never activates from them.
- Chromium shows no tooltip on a disabled control: a `title` there is invisible.
- Keep the ledger uncommitted during a gate; a docs commit above the gated commit forces a rewrite to
  amend its body. `git commit --amend` and `git reset --soft` pass the classifier; `--hard` does not.
- This worktree's `node_modules` was copied from `..\studies-ui-updates-bb040d`; `npm install` will
  NOT fetch the Electron binary here.
- `el()` assigns to a property when the key exists on the node: real booleans, never `'false'`.
- A smoke suite that prints nothing has thrown; re-run it bare. Selectors key on `data-param-key` and
  `data-study-id`, never on a visible label. Never re-run a suite on an instance where one was killed
  mid-run; relaunch.
- The Studies screen's `update()` runs inside a store notification: no `setState` there. The store's
  gates compare by reference: every patch passes a NEW object or array.

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
