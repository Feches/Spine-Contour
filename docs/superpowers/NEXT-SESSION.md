# Next session prompt

Written at the wrap of the 2026-09-06 studies-and-UI-updates session. Paste the block below into
a fresh session. It is self-contained: it does not assume the previous conversation.

---

## Prompt

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
