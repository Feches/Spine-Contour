# Next session — prompt

Written at the wrap of the 2026-09-13/14 execution session: Plan A (backend embeddings) and Plan B (the similar-cases
renderer) built, reviewed, gated by the user and recorded. Updated in place at the 2026-09-28 wrap of the GitHub
versioning audit: the trunk moved to v1.0.10, so the resume point, the release number, the gates and the rulings below
changed. Paste everything below the line as the first message of the next session.

---

Work on Spine Contour, an Electron + Python/FastAPI app that measures spinopelvic parameters from lateral lumbar
radiographs.
Working directory (absolute): `C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d`
This is a git worktree, not the primary checkout; its directory name predates this work. Run everything from here; do
not `cd` to `C:\Users\codyj\spine contour`. If the harness pins the session to a different worktree, switch with the
`EnterWorktree` tool and this path before any write (Write/Edit refuse other worktrees; Bash does not).
Branch: `claude/image-similarity-visualization-400922`, cut from `fork/main` at v1.0.8 (`efe1df6`, the merge of fork
PR #21). **`fork/main` is the trunk** and has since moved to **v1.0.10 (`3ddb8bb`)**, which this branch has NOT merged.
Upstream `origin/main` still has the OLD single-page UI and is never a base. The harness may open the session on
another branch in this worktree (the 2026-09-28 session found `claude/github-versioning-audit-82c4c1` @ `92c8e87`,
which has no unique commits). Switch to this branch with `git switch claude/image-similarity-visualization-400922`.
The untracked `backend/onnx/*` and `tools/smoke/out/*` it shows are this branch's gitignored files.

**Where things stand.** Stage 1 of the similar-cases programme is COMPLETE on this branch: Plan A
(`docs/superpowers/plans/2026-09-12-a-embeddings-backend.md`, six tasks) at `fcf94b9`, Plan B
(`docs/superpowers/plans/2026-09-12-b-similar-cases-renderer.md`, twelve tasks) at `5e8d48b`, and the wrap's docs
commit above it (the HEAD you find; `git log --oneline efe1df6..HEAD` lists 53 commits: 18 docs commits from the
planning sessions, then the execution). Every task was reviewed, both
whole-branch reviews closed clean after one fix wave each, the human gate passed 2026-09-14, and the records are
written (the contract amendment, the spec's status line and corrections, HANDOFF decisions 75–77 and its new traps,
ROADMAP §4/§5/§8, CLAUDE.md's top paragraph, both plans' `## Ledger`). Counts at the wrap: unit 591/591; backend
pytest 429 passed, 2 skipped; `smoke-similar.mjs` 69/69, `smoke-studies.mjs` 136/136, `smoke-parameters.mjs` 58/58,
`smoke-persist.mjs` 40/40 then 48/48. **Nothing is pushed** unless the user said so at the wrap (check
`git log fork/claude/image-similarity-visualization-400922` — absent means unpushed). No task, fix round or finding
is open. The execution ledgers under `.superpowers/sdd/` are git-ignored and do not travel; the plans' `## Ledger`
sections hold everything they held.

Read in this order before doing anything:

1. `CLAUDE.md` — the 2026-09-14 paragraph at the top, the non-negotiables, the Backend API (six endpoints), the Git
   section (this worktree's branch; the sibling worktree `spine-contour-segmentation-failures-82e370` is on an older
   branch — never launch the app from it while testing this one; both read the same library).
2. `docs/superpowers/HANDOFF.md` — the 2026-09-14 "Where things stand" subsection (the rulings with their costs, what
   was not run), decisions 75–77, the new "Known traps".
3. `docs/superpowers/specs/2026-09-12-similar-cases-outcomes-design.md` — the status line and the sections amended
   2026-09-14 (§8.1, §8.2, §8.5, §10.2, §10.5, §11, §12, §13).
4. `docs/ROADMAP.md` §4 (release prerequisites), §5 (the deferred minors from both final reviews), §8 (stages 2–4,
   not to be started before a notebook has trained on a stage-1 export).
5. The two plans' `## Ledger` sections, only if a ruling needs its context.

**Resume point: bring the branch up to the released trunk, then the owner's offline testing, then the release.**
HEAD is the 2026-09-28 wrap's docs commit, above `f4e24cf`. The owner holds this branch for more offline testing
before any merge (2026-09-23), so ask before each step.

1. **Merge `fork/main` (v1.0.10, `3ddb8bb`) into this branch.** Do it in a merge commit, as the project has done before.
   - `git merge-tree --write-tree fork/main HEAD` lists ten conflicting files: `backend/models/models.py`, `backend/server.py`, `backend/verify_onnx.py`, `tools/export_onnx.py`, `tools/packaging/check_bundled_inference.py`, `renderer/components/measurements.js`, `renderer/components/viewer.js`, `renderer/screens/analysis.js`, `styles/screens/analysis.css` and the architecture contract.
   - The trunk added the femoral 640 px model, six ONNX graphs (cervical DETR + HRNet), and the cervical, full-spine and Auto-detect regions (`region`/`anteriorSide` on a study; `body_part=auto`).
   - Resolve keep-both. The embed stage must work for every region or be skipped honestly for the non-lumbar ones: the spec's candidate rules name lumbar films.
   - Re-export `backend/onnx/` (now seven graphs with `embed`). Then re-run the unit and backend suites and the smoke suites in their documented order.
   - Dispatch the resolution to Opus, never Fable.
2. **The owner's offline testing** of the merged build.
3. **The release as 1.0.11** (1.0.9 and 1.0.10 are taken). Follow the project's release process (`docs/release-main.md`; the memory `spine-contour-release-process`):
   - Bump `package.json`, `renderer/data/version.js` (`VERSION_LABEL`), `CHANGELOG.md` ("Unreleased" → 1.0.11), `docs/releases/1.0.11.md` and the README's release-notes link, together in one `chore: release 1.0.11` commit. The README title is unversioned now, the backend developer's choice.
   - Push to `fork` when the owner says. The owner opens the PR to `fork/main` from a body file and merges with "Create a merge commit", which publishes the installers in about twelve minutes.
   - Before the release commit, ask the owner whether the `Appearance embeddings` stage should be on in the installed build (it's on by default; about a second per run and 86 MB more resident memory in standard mode). The spec says on.

   Then come the packaged-build checks on the installed 1.0.11, which the owner does.

**Decisions already made — do not relitigate** (the costs are in HANDOFF and the ledgers):
- The vector is five blocks (V shape 44, H hip 2, A alignment 5 with weights [1, 0.8, 0.8, 0.6, 1], C crop and W whole
  film 384 each from DINOv2 ViT-S/14 at 224, CLS token); mirror–translate–scale, never rotate; median-scaled fusion;
  four Rank-by presets; five cards; scope defaults to All; the same subject excluded; partial, unoriented and demo
  studies never candidates and never embedded (spec decisions 1–7, 15).
- The outcome registry: fusion extension (Yes/No + date) and `Last follow-up` as known fields, resolved per subject
  when read, shown as counts never rates; `KNOWN_FIELDS` is twelve; `autoMap` longest-first; `Keep column name` and
  `Keep all unmapped` exist and `autoMap` never chooses them (decisions 8, 16).
- Embeddings live in `embeddings/<id>.json` beside `predictions/`, computed inside `/predict` when the setting is on
  and never able to fail a run, backfilled by the `Embed` batch from the sidecar alone; two embeddings compare only
  when their `model.onnx_sha256` match; the weights are downloaded from the hub at export time with their SHA-256 in
  `embed.json` (decisions 9, 10, 13); the model cache holds five graphs; a corrupt or missing `embed.json` is a 503.
- The dataset export is a folder of `parameters.csv`, `paired.csv`, `vectors.json`, `manifest.json`, `README.md`,
  over the paired export's rows, with no image, path or record id anywhere; films are named by study name (decision
  11, gate decision 77).
- Gate rulings 2026-09-14 (HANDOFF 75–77): the Embed count excludes partial films and the Find tab says why beside the
  button (`4 partial — not embeddable`); the viewer's strip, both chips and the comparison badge show the parsed
  fields (`subject · timepoint · date · note`, `filmLabel`), so the `SP-nnnn` id appears nowhere on screen; the
  tails read `1 MORE STUDY BELOW` / `n MORE STUDIES BELOW`.
- Comparison mode is plan 07's Tasks 3–6 adapted: `mountViewer(container, { role })`, `updateMeasurements(study,
  other)`, two drawer rows, the badge, the pane's own zoom/pan/panMode, no cancel control on the read-only pane.
- Rulings from 2026-09-23/25 (HANDOFF's first "Where things stand" section):
  - Hold this branch for offline testing; it stays unpushed until the owner says.
  - Patch numbering continues, so this is 1.0.11. The milestone names were not adopted.
  - #36 shipped as-is at the owner's call despite review findings. Auto detect is slow for lumbar films, refuses films without an S1 consensus, and ignores the L1–L5 model choice. Those fixes are the backend developer's, not this branch's.
  - `LICENSE` inside the installers is owed. It needs `package.json` `build` and `electron-builder.preview.yml`, kept in sync.
  - The owner merges the backend developer's PRs themselves when he asks for review. His "draft" flag does not mean "not ready".
- Subagents: the lowest model that completes the task; never Fable; the brief's `Co-Authored-By: Claude Fable 5.1
  <noreply@anthropic.com>` trailer wins over a subagent's own instruction; every dispatch that runs a suite says
  "foreground, capture to a file under `tools/smoke/out/`".

**Manual gates the human owns:** the offline testing of the merged branch before anything is pushed. Then the
packaged-build checks on the installed 1.0.11 — no DEMO STUDIES row, no
`library-preferences.json`, automatic calibration with the bundled OCR, the five ONNX graphs bundled (the installer
grows by about 86 MB), a real segmentation carrying an embedding, `Embed` on the Find tab, `Export dataset` writing
the five files; and the items not run in this session: `/embed` over a real uvicorn socket, a persistence-disabled
Embed, the three-button export row at a narrow window.

**Remote rules:** push only to `fork` (`github.com/Feches/Spine-Contour`), never `origin`; never merge to `main`
yourself; never rename onto `ui-redesign-cw`; the user opens and merges PRs.

**Live traps and the commands:**
- A push to `main` without a version bump runs the whole release workflow, and its publish step fails on purpose ("This
  version already belongs to another commit"). Nothing is published. The owner reads that red X as breakage, so explain it.
- `gh` is not installed. Read PR and CI state from the unauthenticated API
  (`https://api.github.com/repos/Feches/Spine-Contour/...`, 60 requests an hour), parsing it with the venv python.
  Hand PR bodies over as files, and give the owner exact web-UI clicks.
- A PR run uploads the installers as artifacts; the owner tests those before merging. The direct link has the form
  `https://github.com/Feches/Spine-Contour/actions/runs/<run>/artifacts/<id>`.
- A scratch worktree for a docs-only change: `GIT_LFS_SKIP_SMUDGE=1 git worktree add <scratchpad path> <branch>`. It
  avoids pulling about 850 MB of LFS weights. Unset the upstream of a branch created from `fork/main`.
- `node --test test/*.test.js` (the glob form; the directory form fails on Node 24). Backend:
  `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend -q` — never bare `python`; if the Bash
  tool refuses the venv python (it did for every Sonnet subagent), use the PowerShell tool with
  `Set-Location "<worktree>"` first and `& "<venv python>" …`.
- Launch from source (PowerShell): `Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d"; $env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"; npm.cmd run dev`.
  `backend/onnx/` is gitignored and now needs all FIVE graphs (`test_onnx_models.py` hard-asserts `embed.onnx`);
  export with `python tools/export_onnx.py --kind embed` (downloads 88 MB from the hub once) or copy from this worktree.
- Smoke, on a scratch profile from the Bash tool: `SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/<name>-launch.txt 2>&1`, the suite to a file,
  `node tools/smoke/cdp.mjs --quit`. `smoke-similar.mjs` and `smoke-parameters.mjs` run BEFORE `smoke-studies.mjs`;
  `smoke-studies.mjs` on a fresh launch. A suite that prints nothing has thrown.
- The worktree-isolation classifier refuses `bash <script>`, `awk` programs and shell variables in git-adjacent
  commands: use plain `sed -n 'a,bp'` with literal paths, and three plain appends for a review package.
- The Write/Edit tools can turn a `\uXXXX` escape into a glyph: byte-check every JS diff
  (`git diff -U0 -- <files> | grep -nP '^[+-].*[^\x00-\x7F]'`) and repair with a Python script, never `sed`.
- `requirements-export.txt` pins torch 2.11.0 / timm 1.0.27; the venv that validated the export has 2.13.0 / 1.0.29 —
  the next CI run is the first `embed` export on the pinned pair, and the export's mean/std and licence guards can
  refuse it. If it does, bump the pins to the validated pair (ROADMAP §4).
