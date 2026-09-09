# Spine Contour

**2026-09-09 low-memory mode:** `codex/low-memory-progress` starts from Cody's merged PR #6 (`ceff2ef`) and prepares v1.0.2. See `docs/low-memory-processing.md`. `/predict-stream` now provides actual stage/count events and heartbeats; no timer-generated stages or guessed overall percentages. Keep the full crop search and HRNet presence checks in both modes.

**2026-09-09 partial-segmentation fix:** `codex/partial-segmentation` starts from the merged v1.0.0 main (`f177247`) and prepares v1.0.1. Missing anatomy is now a supported result, not a whole-image failure. See `docs/partial-segmentation.md` and the updated architecture contract. Preserve nulls and absent levels through editing, saving and export; do not reinstate all-five/S1/hip requirements or infer A/P from image side when S1 is absent.

**2026-09-09 main promotion:** `codex/release-v1.0.0-main` starts at Cody's merged PR #4 (`594e63f`) and targets `Feches/Spine-Contour:main`. It retains all 305 incoming commits and prepares v1.0.0 numbered Windows/macOS releases. Current release instructions are in `docs/release-main.md`; `CHANGELOG.md` and `docs/releases/1.0.0-commits.md` summarize the incoming history. The older branch/status notes below are historical.

**2026-09-09 combined release:** `codex/combined-next-release` combines calibration/disc-height PR #2 and accuracy PR #3, retaining both histories. It targets Cody's installer branch `ui-redesign-cw` for the v0.2.0 preview. Merging builds Windows and macOS installers; manual feature-branch builds produce review artifacts only. See `docs/releases/0.2.0.md` and `docs/release-preview.md`.

**2026-09-09 calibration integration:** `codex/batch-opencv-calibration` is based on the latest Feches studies tip (`cbe5adb`). Single and batch predictions now return source-bound image calibration; loaded studies persist it and CSV exports include it. Folder scanning is automatic without reference teaching. See `docs/batch-calibration.md` and the 2026-09-09 architecture amendment.

Electron desktop app that measures spinopelvic parameters from lateral lumbar
radiographs. A Python/FastAPI backend runs three PyTorch models locally; the Electron
main process spawns it on a random `127.0.0.1` port and polls `/health`.

**Currently mid-redesign — plans 01–06 of 07 are done; plan 07 is deferred past the first
release.** Plan 06's automated verification is green and its Gate 1 passed on 2026-09-03, but
**Gate 2 was not run** — the user chose on 2026-09-04 to skip it and hand the branch to the
developer who wrote the Python backend — and **the preview installer has never been tested with
plan 06's code in it**.

**Current branch (2026-09-06): `claude/studies-ui-updates-bb040d`**, 7 commits of user-requested
studies/UI work on top of `origin/ui-redesign-cw` @ `0022d91`, pushed to `fork`. Unit 293/293 and
every `tools/smoke/` suite green, including a new `smoke-chord.mjs`. **One thing is unverified: an
installed app now opens on an EMPTY library, and that branch of the demo gate has never run in a
packaged build** (it is `!app.isPackaged`, so every test had demos on) — check it first the next
time a preview installer exists. `origin/ui-redesign-cw` is the real trunk and carries the newer
backend; the local and fork `ui-redesign-cw` are an older lineage sharing the name, and `main` does
not contain the redesign at all. See `docs/superpowers/HANDOFF.md` before doing anything: "Handing this
to the backend author" if you are merging a new segmentation model, "Resume plan 07 here" for
what plan 06 changed under plan 07 (the contract was amended in step; the plan-07 document was
not), and "Release prerequisites" for what stands between this branch and a production release.
`docs/ROADMAP.md` carries the deferred work that has no plan yet.

**Branch `claude/preop-postop-study-fields` (2026-09-07)** sits above the studies branch (which
already carries spec task 1, the Parameters tab) and holds **spec task 2 complete**: subject, timepoint,
film date and an editable view on the record; the Workspace card's per-folder assignment table; the
drawer's Study group; the Parameters grid's timepoint, view, subject and paired-only filters (paired-only
defaults to `All paired`) and subject sort; three export columns. Plan
`docs/superpowers/plans/2026-09-07-study-fields.md` (Tasks 1–11, its `## Ledger` at the end), all
reviewed, three human gates passed, the final whole-branch review clean after one fix wave. Unit 379/379;
`smoke-parameters.mjs` 46/46; `smoke-seeding.mjs` 36/36; `smoke-workspace.mjs` 100/100. Pushed to `fork`.
**Merged back into the studies branch on 2026-09-07 (fast-forward; both branches at the same commit); the next work is spec task 4
(the paired export) or task 3 (compare with pre-op, after plan 07), each needing its own plan.**
`docs/superpowers/NEXT-SESSION.md` is the prompt.

**Branch `claude/preop-postop-paired-export` (2026-09-08)** sits on the studies tip (`adf3c19`, where task 2 was
merged back) and holds **spec task 4 complete**: `renderer/data/pairing.js` (grouping, judging, the toast), `toPairedCsv`
and `delta1` in `csv.js`, `toastDuration` in `components/toast.js`, the `Export paired CSV` button on the Parameters
filter bar, smoke section 13 and the records. Plan `docs/superpowers/plans/2026-09-08-paired-export.md` (Tasks 1–6, its
`## Ledger` at the end): every task reviewed, the human gate passed, the final whole-branch review clean after one fix
wave (`b37b759`). Unit 402/402; `smoke-parameters.mjs` 58/58; `smoke-seeding.mjs` 36/36; `smoke-workspace.mjs` 100/100;
`smoke-studies.mjs` 59/60 (one stale check since `0f8f821`, see `docs/ROADMAP.md` §5). Pushed to `fork`. **Merged back
into the studies branch on 2026-09-08 (fast-forward; both branches at the same commit). The user's next work is batch
segmentation of loaded films, ahead of a release — brainstorm it first; spec task 3 waits for plan 07 and the ROADMAP
items wait behind it.** `docs/superpowers/NEXT-SESSION.md` is the prompt.

**Branch `claude/batch-segmentation` (2026-09-08)** sits on the studies tip (`192f303`) and holds **batch
segmentation, DONE, reviewed and gated, awaiting the merge back**: spec
`docs/superpowers/specs/2026-09-08-batch-segmentation-design.md` (its §6 is HANDOFF decisions 51–66) and plan
`docs/superpowers/plans/2026-09-08-batch-segmentation.md` (Tasks 1–7, executed by subagent-driven development on
2026-09-08; its `## Ledger` at the end holds every ruling). One click on the Find tab segments the ticked or visible
unsegmented films one after another with count-only progress, a Stop and one closing toast; the Find tab has
workspace/folder filters and row ticks shared with the Parameters tab; `IN QUEUE` is `UNSEGMENTED`; `state.running`
stays a single id; `segmentStudy(studyId, {batch})` is the exported run core. Task 5's seven-check human gate passed
2026-09-08 (user). The final whole-branch review (Opus) found one delete/batch race, fixed in `9d4b267` (docs
`ec7ffff`). Unit 426/426; `smoke-studies.mjs` 103/103 (the stale diagnosis check fixed); `smoke-workspace.mjs`
100/100; `smoke-parameters.mjs` 58/58; `smoke-persist.mjs` 36/36 then 44/44. Pushed to `fork`. **The merge back into
`claude/studies-ui-updates-bb040d` waits for the user's say-so** (a fast-forward while the studies tip is still
`192f303`); after it, the release prerequisites and the ROADMAP items; spec task 3 waits for plan 07.
`docs/superpowers/NEXT-SESSION.md` is the prompt.

**Branch `claude/upstream-reconcile-2026-09-08` (2026-09-08)** is the handover tip: the batch was merged back into
`claude/studies-ui-updates-bb040d` (fast-forward to `b7789b3`), then the backend developer's trunk
`origin/ui-redesign-cw` @ `5078b1c` (ruler-based folder calibration and its screen, OCR packaging, a calibration
prompt after every nonempty folder scan, "Delete all studies" with a one-way demo-hiding preference) was merged in
as `2bf3d21`, with `5cf52c7` and `245cae2` reconciling the two sides (both demo gates coexist; delete-all,
batch and single run are mutually exclusive; delete-all prunes the shared selection). Unit 433/433; every smoke
suite green (`smoke-studies.mjs` 103/103 on a fresh launch). The studies branch is fast-forwarded to this tip and
**the same tip is pushed as `fork/ui-redesign-cw`, the branch the backend developer takes** (his merge is a
fast-forward); that push built the first preview installer to carry plan 06 and everything after it, and **the user
installed and checked it (2026-09-09): no demos in the packaged build, a batch ran, the calibration screen was
walked (each image individually — his design, ROADMAP §5), console clean.** HANDOFF's "Handing this to the backend
author" is rewritten for him.
`docs/superpowers/NEXT-SESSION.md` is the prompt.

## Read these first

| Document | What it is |
|---|---|
| `docs/superpowers/HANDOFF.md` | Current state, what's done, what's next |
| `docs/superpowers/specs/2026-08-31-spine-contour-ui-redesign-design.md` | The approved spec |
| `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` | **Binding** module interfaces |
| `docs/superpowers/plans/2026-08-31-0{1..7}-*.md` | Seven sequenced implementation plans |

The architecture contract wins over any individual plan. If a plan contradicts it,
raise the discrepancy rather than guessing.

## Non-negotiables

These come from the spec and apply to every change.

- **Never display a fabricated measurement.** Absent values render `—` (U+2014), never
  `0`, never `N/A`, never a guess. This is a clinical tool; it is the single most
  important rule in the project.
- **Never label a value with a name it isn't.** The backend used to return sacral slope
  under the key `SI` (sacral inclination is its 90° complement). That rename is part of
  plan 02. Don't reintroduce the confusion.
- **No fabricated status either.** Segmentation stages/counts come from `/predict-stream`.
  Heartbeats advance elapsed time only; never invent stage labels or overall percentages.
- **Never draw a construction under the wrong measurement's name.** `state.selectedLevel`
  names which construction the viewer draws, and its domain is `'L1'`…`'L5'` | `'S1'` |
  `'PI'` | `'PT'` | `'SS'` | `'L1PA'` | `null` — not just a vertebral level. Anything
  switching on it must handle the non-level values **explicitly**; falling through to an
  `else` that assumes a vertebra is how the L1 pelvic angle row came to draw the lumbar
  lordosis line. See the architecture contract's `selectedLevel` section.
- **Never mutate the store's geometry in place.** Every edit works on a `structuredClone`
  and commits a new reference; the viewer's redraw gate and the router's key sets compare by
  reference, so an in-place mutation silently stops repainting.
- **All stage pointer and keyboard wiring lives in `renderer/components/viewer.js`.**
  `renderer/viewer/interactions.js` is pure logic with tests; do not add DOM code to it.
- **No bundler, no framework, no runtime dependencies.** Vanilla ES modules.
  `dependencies` stays empty; `devDependencies` stays exactly `electron` and
  `electron-builder`.
- **Do not loosen the CSP** in `index.html`. No CDN, no Google Fonts, no remote
  anything. Fonts are self-hosted from `assets/fonts/`.
- **Keep both electron-builder file allowlists in sync.** `package.json` `build.files`
  and `electron-builder.preview.yml` `files` must match. A missing entry does not fail
  the build — it ships an installer that opens a blank window. Both configs also carry a
  `mac` block (Apple Silicon `.dmg`, unsigned: `identity: null`); keep those two in step
  the same way.

## Commands

```bash
npm run dev                       # launch the app (starts the Python backend too)
node --test test/*.test.js        # renderer unit tests
npm test                          # same
npm run package:mac               # Apple Silicon .dmg into dist/ (needs backend-dist/ built first)
```

If the app launched from this shell dies at `app.isPackaged`, the shell exports
`ELECTRON_RUN_AS_NODE=1` (IDE-hosted terminals do); `unset` it first.

`node --test test/` (directory form) **fails** on Node 24 — it treats the directory as
a CommonJS entry point. Use the glob. Do not "fix" it back.

Backend tests:

```bash
"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend -q
```

## Backend API

Local only, on a random port. Four endpoints the measurement UI uses, plus the backend developer's two calibration
endpoints (`POST /calibrate`, `POST /calibration-profile`, 2026-09-07; `scipy`, `pytesseract` and the Tesseract runtime
are theirs — the venv needs the two packages for the backend to start):

- `POST /predict` — multipart file upload. Returns `image_png`, `mask_png`,
  `femoral_mask_png`, `measurements`, `geometry`, `qc`, `labels` (all base64 where
  relevant). Slow: locates the lumbosacral region, then runs the chosen models.
  Optional form fields `vertebra_model`, `femoral_model`, `s1_model` choose which model
  reads each structure; anything the backend does not offer is a 422, and omitted fields
  take the default.
- `POST /measure` — geometry only, no image. Returns `{measurements, geometry}`.
  Cheap, which is what makes live re-measurement after landmark correction practical.
- `GET /models` — `{vertebrae: [...], femoral: [...], s1: [...]}`, the offered model ids.
- `GET /health` — `{"status": "ok"}`.

`measurements` is `{SS, PI, PT, L1PA, LL: {'L1-S1'…'L5-S1'}}` after the plan-02 rename.
`PI–LL mismatch` is derived (`PI − LL['L1-S1']`), not returned.

`qc` review warnings read `qc.femoral.confidence` and S1/search scores in `qc.framing`, and it carries two
records the backend adds: `qc.models` (which model read each structure) and
`qc.framing` (the crop the models ran on, and whether the whole film won). A stored
result therefore says what produced it. See `backend/framing.py` for why a film is
searched at all, and for why the whole film only competes when the search agrees with
it.

The femoral heads overlap on a lateral and segment as one blob; `backend/femoral.py` fits
that blob as the union of two discs, and `qc.femoral.confidence` is how much of the blob the
two discs explain. A pair reported with near-zero separation is superimposed heads, not a
failed fit.

`PI = PT + SS` is a geometric identity, but the backend derives all three
independently. The residual is used as a landmark-quality signal, not assumed to be
zero.

Anterior, middle and posterior disc heights (L1–L2 through L5–S1) are derived from facing endplate keypoints and per-image calibration in `renderer/data/disc-heights.js`, displayed in Measurements, and exported in ordinary/paired CSV. See `docs/disc-heights.md` for definitions and blank-value rules. Spondylolisthesis slip remains unimplemented.

The backend bundle collects `timm` (the HRNet trunk) alongside the other model
packages; keep `--collect-all timm` in both workflows.

## Git

This worktree is on branch `claude/upstream-reconcile-2026-09-08` (2026-09-08), the handover tip described above;
`claude/studies-ui-updates-bb040d` and `fork/ui-redesign-cw` point at the same commit. Two remotes:

- `fork` → `github.com/Feches/Spine-Contour` — **push here**
- `origin` → `github.com/mjayasur/Spine-Contour` — upstream, read-only in practice
  (the authenticated account has no write access)

Pushing `ui-redesign-cw` triggers only the preview installer workflow, which publishes
to a `preview-windows` prerelease. It cannot touch the production `latest-windows`
release the README links to. Keep it that way.

The triggers are **exact branch names, no wildcards** (verified 2026-09-06):
`windows-preview.yml` and `macos-preview.yml` fire on `push` to `ui-redesign-cw`;
`windows.yml` fires on `push` to `main` and additionally guards `github.ref`. So a
feature branch like `claude/studies-ui-updates-bb040d` can be pushed to `fork` as a
backup and **publishes nothing at all**. Only renaming a branch onto `ui-redesign-cw`,
or pushing to `main`, builds an installer.

## Conventions

- Conventional commit prefixes: `feat:`, `fix:`, `test:`, `chore:`, `ci:`.
- Commit after every completed task.
- Pure-logic modules get real `node --test` coverage. DOM and canvas code gets explicit
  manual verification steps — say so plainly rather than writing a fake test.
- `renderer/` is browser code and cannot resolve `node:` specifiers. Anything touching
  `node:fs` belongs at the repo root and is imported only by `main.js`.
