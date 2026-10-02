# Next session — prompt

Written 2026-10-02 at the end of the planning session for the Failed-status additions on 1.0.13 (issue #39
follow-up). Paste everything below the line as the first message of the next session, or tell the session "Read
`docs/superpowers/NEXT-SESSION.md` and follow the prompt in it." Start the session in the main checkout,
`C:\Users\codyj\Spine Contour Desktop\Spine-Contour`, not in a new worktree.

---

Work on Spine Contour, an Electron + Python/FastAPI app that measures spinal parameters from lateral radiographs.

**The job:** implement `docs/superpowers/plans/2026-10-01-failed-status-port.md` with
superpowers:subagent-driven-development, through Task 8's human gate. The plan is approved: I asked for it to be
run in a new session. Execution method: subagent-driven (my choice, already made — do not ask again).

**Where.**
- Working directory: `C:\Users\codyj\Spine Contour Desktop\Spine-Contour`, the main checkout, no worktree (ledger
  ruling R2: `node_modules`, `.venv` and the gitignored `backend/onnx/` graphs live only here, and Task 8 needs them).
- Branch: `claude/issue-39-failed-status-port`, at the docs commit above `c98be25` (the plan), on `main` @ `9992b99`
  (v1.0.13). Not pushed.
- Check first: `git rev-parse --show-toplevel` prints that path, `git branch --show-current` prints that branch, and
  `git status --short` is empty. If this session was started somewhere else (the desktop app can create a worktree
  off `main`), stop and ask me to restart it in the main checkout. Do not copy the environment into a worktree.

**Read, in this order, before dispatching anything.**
1. `docs/superpowers/specs/2026-10-01-failed-status-port-design.md` — the spec, the binding authority (189 lines).
2. The plan: header, Global Constraints, Execution Notes, Review Focus, "Decisions this plan makes", File Map. Read
   each task when you dispatch it; the skill's `task-brief` script extracts it.
3. The ledger `.superpowers/sdd/2026-10-01-failed-status-port/progress.md` (gitignored, local). Its first line names
   this plan. The pre-flight scan is done and ruled (R1–R4); no task has run; resume at Task 1. After any
   compaction, trust the ledger and `git log` over memory, and never re-dispatch a task the ledger marks complete.
4. `CLAUDE.md`: the non-negotiables and the commands. Its opening paragraphs, the older sections of
   `docs/superpowers/HANDOFF.md`, and any `C:\Users\codyj\spine contour\…` path describe another workstation's
   2026-09 layout; ignore those paths. HANDOFF's first section under "Where things stand" is this work.

**How to run it.**
- A fresh implementer subagent per task, then a task review (spec compliance and quality), per the skill. Models
  per ledger R3: Tasks 1 and 6 on haiku; Tasks 2–5 and 7 on sonnet; task reviewers on sonnet; the final
  whole-branch review on opus, after Task 7 and before Task 8.
- An implementer sees only its brief, so every dispatch also carries the plan's Global Constraints, and for Tasks
  1, 2 and 7 the glyph-trap note: the Edit and Write tools decode a six-character backslash-u escape into its
  glyph, so the plan has them type `@@u` and run its fixer (Task 7 extracts its patch with a script instead).
- Task 8 is run by you, the controller, not dispatched (R1). It launches the app on copies of my real films.
- Do not stop between tasks to check in. Decide ambiguities yourself and record each as
  `Ruling: <what> — <why> — <cost if wrong>` in the ledger. Stop only for: the human gate (Task 8 Step 7 — wait for
  my explicit "gate passed"), anything destructive or security-sensitive, any push, PR or merge, or a plan so broken
  that every path forward is a guess.

**Rules that are not negotiable.**
- Nothing is pushed and no PR is opened without my explicit say-so. The only remote is `origin`
  (`github.com/Feches/Spine-Contour`); never push `main`. `gh` is not installed; a PR is opened in the web UI from a
  body file.
- Never view (Read) or send (SendUserFile) a screenshot that shows a real radiograph: viewing it sends it to Claude.
  Check the app through DOM and store reads. Task 8 takes no screenshots at all.
- Every app launch uses a scratch profile, `SPINE_CONTOUR_USER_DATA=$TEMP/spine-contour-<name>`, behind Task 8's
  launch guard; never my real `%APPDATA%\spine-contour`. `tools/smoke/launch.mjs` deletes the folder that variable
  points to unless `SMOKE_KEEP_PROFILE=1`. Never `npm run dev`, `run.bat` or `run.py` (they open the real library).
- My films in `C:\Users\codyj\OneDrive\Desktop\OLIF studies\` are copied, never moved, renamed or deleted.
- Do not delete scratch folders or files; list them for me (Task 8 Step 9). Never `git clean`; never delete
  `.claude/` or `.superpowers/`.
- The local branch `claude/issue-39-failed-status` is an earlier, superseded design: a reference only. Never merge
  it, rebase onto it or cherry-pick from it.

**State at hand-off (2026-10-02).** Unit 587/587 on `85b9d54`. The plan's code was replayed in order on a clean
worktree; the unit totals after Tasks 1–6 were 597, 599, 609, 610, 613, 613, and Task 7's patch applied cleanly from
the plan's own command (5 files, +339 −34). The environment in this checkout was verified on 2026-10-01: Electron in
`node_modules`; `.venv` with onnxruntime 1.24.4 and `DmlExecutionProvider`; six ONNX graphs in `backend/onnx/` copied
from the installed app (their weights are unchanged since 1.0.11), plus 1.0.13's tracked `crop_detector.onnx`. The
smoke suites have never been run against 1.0.13 or this branch; Task 8 is their first run.

**At the end.** Give me the outcome in plain words, the Task 8 reads and counts, and a "Rulings I made" list. The
open items to raise at the gate are in Task 8 Step 7. Then use superpowers:finishing-a-development-branch; push or
open a PR only when I say so. A PR body says it follows up Feches/Spine-Contour#39.

**Live traps.**
- Unit tests: `node --test test/*.test.js` (the directory form fails on Node 24).
- The working tree is CRLF (`core.autocrlf=true`); the Edit tool copes, multi-line scripts must not assume LF.
- The Bash console is cp1252: set `PYTHONIOENCODING=utf-8` before a Python script that prints non-ASCII.
- Some sandboxes refuse heredocs and compound commands: write the script or message to a file and run it.
- Inside a double-quoted bash argument, backticks are command substitution; use `chr(96)` in Python one-liners.
- `launch.mjs` may print `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` as it exits; the app stays up. If
  the Bash tool kills the detached app, launch from PowerShell (Task 8 Step 3 has the command).
- The Find table overflows horizontally at the default 1180×900 window and clips the STATUS column (pre-existing;
  the smoke suite's `clickAt` scrolls its target into view).
