# Next session — prompt

Written at the wrap of 2026-09-13 (the filename-grammar / note / paired-visits / names branch done and released as
1.0.8 on the branch, the PR to `fork/main` still the user's to open and merge). Paste everything below the line as
the first message of the next session. Where it says "the docs commit above `51ecba2`", the wrap's own docs commit is
the branch tip.

---

Work on Spine Contour, an Electron + Python/FastAPI app that measures spinopelvic parameters from lateral lumbar
radiographs.

Working directory (absolute): `C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-segmentation-failures-82e370`
This is a git worktree, not the primary checkout; its directory name predates this work and means nothing. Run
everything from here; do not `cd` to `C:\Users\codyj\spine contour` (branch `my-changes`, old code) and never launch
the app from `.claude\worktrees\studies-ui-updates-bb040d` (branch `claude/wrap-2026-09-11`, v1.0.7 code) — both
worktrees read the same `%APPDATA%\spine-contour` library, and a 2026-09-13 "bug" was exactly that.
Branch: `claude/spine-contour-filename-parse-b6c1bb`, at the wrap's docs commit above `51ecba2` (`chore: release
1.0.8`), on `fork/main` @ `6704586` (v1.0.7). Pushed to `fork`.

Read in this order before doing anything:

1. `CLAUDE.md` — the first paragraph (this branch), non-negotiables, commands, the `## Git` rules
2. `docs/superpowers/HANDOFF.md` — the FIRST section under "Where things stand" (what was built, the ten rulings, what
   was not run, what is next) and the 2026-09-11/12/13 entries at the top of "Known traps"
3. `docs/releases/1.0.8.md` and `docs/naming-films.md` — the user-facing account of the release and the naming guide
4. `docs/superpowers/specs/2026-09-06-preop-postop-organisation-design.md` §8.1, §11.2, §11.3 — the amended rules
5. `docs/ROADMAP.md` item 2 (identity decided) and item 1 (the comment block, still open)

No plan file: the work was four bounded brainstorms settled in chat; the rulings live in HANDOFF's first section and
below. There is no ledger.

Resume point. **Nothing is mid-flight.** State on `51ecba2`: unit 542/542 (`node --test test/*.test.js`);
`smoke-studies.mjs` 136/136; `smoke-seeding.mjs` 36/36; `smoke-parameters.mjs` 58/58; `smoke-workspace.mjs` 100/100,
each on a fresh scratch launch on 2026-09-13. Not run: `smoke-persist.mjs`, the backend pytest, `smoke-femoral-confidence.mjs`,
the packaged-build checks. The next work is whichever of these the user asks for:

- **If v1.0.8 has been published** (`https://api.github.com/repos/Feches/Spine-Contour/releases`, unauthenticated,
  60/h): the packaged-build checks on the installed 1.0.8 — no DEMO STUDIES row, no `library-preferences.json`,
  automatic calibration with the bundled OCR, the nine OLIF films' names on Find and Parameters, `Export paired CSV`
  writing two subjects with the merged pre-op visit, the note surviving a restart. Record them in HANDOFF.
- **If the PR is not yet open**: the body is in the wrap message of 2026-09-13; the user opens it at
  `https://github.com/Feches/Spine-Contour/compare/main...claude/spine-contour-filename-parse-b6c1bb?expand=1` and
  merges with **Create a merge commit**. Do not open or merge it yourself. Check `git fetch fork` first: if `main`
  moved, merge it into the branch, re-run the four suites, and only then hand the PR back.
- Otherwise: brainstorm the next feature (superpowers:brainstorming; bounded changes get a short design in chat,
  larger ones a spec and plan), or ROADMAP item 1 (skip `#` comment lines on import so the app's own export round-trips).

Decisions already made — do not relitigate (HANDOFF "Rulings made in chat (2026-09-11 → 13)" 1–10; in one line each):

* underscore is the only field separator in a film's stem; spaces and hyphens inside a field are content
* `note` is a top-level record field (drawer NOTE, CSV `Note`, searchable), read from the stem's plain trailing fields
* a load never rewrites a stored subject; pre-1.0.8 films with the whole stem as subject are deleted and re-added
* paired export by VISIT (subject + label + film date); `<label> N` only when a subject has two or more; the unnoted
  film is primary and a noted film fills its gaps; disagreements flagged in the toast and a per-visit column; two
  unnoted or two noted same-day films, or two Pre-op dates, are ambiguous and named
* a merged visit's PI-LL mismatch is derived from the merged PI and LL and flagged as derived across films
* one `.study-name` rule (280px cap, wrap anywhere, no ellipsis) for Find and Parameters; Find scrolls sideways when
  too narrow; the collapsed sidebar card is an icon-only button
* both exports name films by `studyName` (the stem) under `Study ID`; the SP-nnnn id appears nowhere a person looks
  (no tooltips, no export column) — memory `no-record-ids-user-facing`
* `fileStem` lives in `data/labels.js`, re-exported by `data/csv.js`
* Find's DATE column stays the date added
* 1.0.8 is a PATCH increment; every release goes through the user's own gate and click

Manual gates the human owns: opening and merging the release PR; the packaged-build checks on the installed build;
any change to a collaborator's design (route it, do not rewrite it).

Remote rules: push to `fork` (`github.com/Feches/Spine-Contour`) only, feature branches only — a feature-branch push
publishes nothing; never push `main` or `ui-redesign-cw`; never merge to `main`; `origin` (`mjayasur/Spine-Contour`)
is read-only and its `main` is never a base. `gh` is not installed; PRs are opened in the web UI from a body file.

Live traps and commands:

* unit: `node --test test/*.test.js` (the glob; the directory form fails on Node 24)
* source launch on the user's real library (close the installed app first; do not run two at once):
  `Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\spine-contour-segmentation-failures-82e370"; $env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"; npm.cmd run dev`
* smoke launch on a scratch profile: `SPINE_CONTOUR_PYTHON=... node tools/smoke/launch.mjs`, suites in the foreground
  with output to `tools/smoke/out/`, `node tools/smoke/cdp.mjs --quit`; `smoke-workspace.mjs` runs once per instance;
  CDP screenshots need `ack: true` with the screen
* `backend/onnx/` is gitignored — copy from a sibling worktree if missing; plain `python` is the Store alias, use the venv's;
  after `npm ci`, run `node node_modules/electron/install.js` if `node_modules/electron/dist/electron.exe` is missing
* the Bash tool's console is cp1252: set `PYTHONIOENCODING=utf-8` before a Python script that prints non-ASCII
