# Spine Contour

**2026-10-03 similar cases stage 2 (regions and every measured parameter):** branch `claude/image-similarity-visualization-400922`
(worktree `studies-ui-updates-bb040d`), merged with `fork/main` @ `c53e91d` (v1.0.15) as `afa6164` (20 conflicts, keep-both),
then a two-commit fix wave (`87b7a5d`, `4164673`): a film an Embed batch is running keeps its status, and the appearance
encoder is a CPU model outside GPU qualification (`CPU_ONLY_KINDS` in `backend/models/models.py`,
`gpu_parity.qualified_kinds()`), which the processor badge ignores. Stage 2 is then built by plan
`docs/superpowers/plans/2026-09-30-similar-cases-stage-2-regions.md` (Tasks 1–10; its `## Ledger` holds rulings R1–R27 and
the deferred minors) from spec `docs/superpowers/specs/2026-09-30-similar-cases-stage-2-regions-design.md`. The Find similar
tab ranks on thirteen blocks in four families: lumbar `V` shape, `H` hip, `A` alignment (L1PA added), `SL` lumbar
segmental, `D` disc heights; cervical `VC` shape, `AC` C2–C7 Cobb, `BC` C2–C7 SVA, `SC` cervical segmental; whole spine
`B` C7–S1 SVA, `W` whole film; appearance `C` lumbar crop, `CC` cervical crop — the registry and `weightsFor(region, mode)`
in `renderer/data/similarity-blocks.js`, the shared-point shape distances, entry distances and `findSimilar` in
`renderer/data/similarity.js`. A film ranks on the blocks it has (HANDOFF decision 78 supersedes 75); cervical and
full-spine films rank; a `Region` control (`Lumbar | Cervical | Whole spine`, `state.similarRegion`) sits beside `Rank by`
and defaults to the open film's region; ten cards, each naming the blocks it lacks. The embedding record is version 2
(`lumbar`, `cervical`, `whole`, `region`; `/embed` takes a `region` form field): version-1 records read as stale, so the
whole library re-embeds once through `Embed`. `Export dataset`'s `vectors.json` is version 2, with a `Region` column in
`parameters.csv`. The final whole-branch review (Opus, over `afa6164..HEAD`, before the gate: R18) said "with fixes" and an
eight-commit fix wave (`809052b`..`a65d2fc`, rulings R20–R27) answered it: a block shared by fewer than three candidates
scales by its nominal scale, not by 1 or a lone pair (R26, superseding R20; R25 the noise floor), the open film's own gaps
get their own empty state (R21), under All no embedding record is needed (R22), the comparison column's Δ is per unit and
`—` for pixels (R23), `vectors.json` names its appearance blocks and carries every block's scale (R24, R26), a record cut
for another region needs re-embedding (M2); both scoped re-reviews were clean. Counts at HEAD (`a65d2fc`): unit 687/687;
`smoke-similar.mjs` 131/131; `smoke-parameters.mjs` 58/58; `smoke-studies.mjs` 151/151 (at `35b453e`); backend 744 passed,
4 skipped (eight ONNX graphs present; at `3694373`, untouched since); `smoke-persist.mjs` 41/41 then 54/54 (Task 9). Held on
the branch, nothing pushed; the release is a separate, later commit numbered **1.0.16 or later** (main is 1.0.15).
**Not run:** the human gate (plan Task 11); the packaged build (the seven graphs plus the encoder, and the installer's
growth); `/embed` over a real uvicorn socket; a GPU machine for the CPU-only-encoder rule; a persistence-disabled `Embed`;
the three-button export row at a narrow window; the release workflows' hub download and `export_embed`'s mean/std and
licence guards on the pinned export pair; the smoke suites after R25 and R26 other than `smoke-similar.mjs` and
`smoke-parameters.mjs` (`smoke-studies.mjs` last ran at `35b453e`, `smoke-persist.mjs` at Task 9). See the architecture
contract's `## 2026-09-30 amendment: similar cases stage 2`, HANDOFF's first "Where things stand" section and
`docs/ROADMAP.md` §8. `docs/superpowers/NEXT-SESSION.md` is stale (it still says release 1.0.11 and the v1.0.10 merge)
until the session wrap rewrites it.

**2026-10-02 release 1.0.15 (issue #39 Failed-status follow-up):** branch `claude/issue-39-failed-status-port` (the main
checkout, no worktree) off `main` @ `9992b99` (v1.0.13), merged with `origin/main` @ `e7ae5a3` (v1.0.14, PR #52) as
`0b92fbd` (a CHANGELOG conflict only). Five additions on 1.0.13's Failed status: films with no result read Unsegmented,
and Processing is the running film and every film waiting in the batch (`displayStatus(study, runningId, batch)`);
Failed is the new `--danger` red; `processingErrorAt` beside `processingError` gives the dated tooltip `failureTitle`;
the Analysis screen's red `failedRunNote` and the FAILED card in `describeCard`; stored reasons pass through
`renderer/data/failure.js` `failureReason`. Spec `docs/superpowers/specs/2026-10-01-failed-status-port-design.md`; plan
`docs/superpowers/plans/2026-10-01-failed-status-port.md` (counts and rulings in its `## Ledger`). Unit 614/614.
Merged-tree smoke: landing 16/16, studies 151/151, workspace 100/100, parameters 58/58, persist 41/41 then 53/53. Real
films (ten copies, RTX 4070) checked by DOM reads on the pre-merge branch, no screenshots. Stale smoke expectations
fixed: `97b7478` (1.0.12's Keep column name) and `e980f64` (1.0.11's segmental columns in the paired export). Pushed to
`origin` (Feches, the only remote in this checkout) at the owner's choice on 2026-10-02; merging the PR to `main`
publishes v1.0.15.

**2026-10-01 release 1.0.14 (landing page):** branch `claude/landing-page-logo-flash-5782c3` (worktree
`.claude/worktrees/design-system-extraction-eaac17`, moved off upstream `92c8e87` onto `fork/main` @ `9992b99`, v1.0.13,
with `checkout -B`). The landing panel drops the CREATED BY card (the owner's ruling: no author names) for the contact
paragraph and the methods-paper title with a `(METHODS PAPER · FORTHCOMING)` tag; both CSV exports drop the authors'
`#` line outright (the owner turned down a paper-title replacement), so the block is TWO comment lines and the header is
line 3 — every test/smoke read by position moved up one (`slice(2)`, header `[2]`, first row `[3]`). The logo flash: `ack` was in router.js `SCREEN_KEYS`, so
every tick remounted the landing page and the new `.landing-hero` replayed `riseIn` (opacity 0.07 at 40 ms); `ack` is
out of `SCREEN_KEYS` and landing.js updates its checkbox and Enter from a module-scope subscription. Unit 587/587;
`tools/smoke/smoke-landing.mjs` 16/16 (9/16 before). Still naming the authors, left on purpose: README's copyright line,
`package.json` `author`, `design-reference/template.html`.

**2026-10-01 release 1.0.13:** branch `ccr-b0ba7894-fm5spq` off `fork/main` @ `7ce278f` (v1.0.12, PR #48), with
Michael's two single-commit PRs merged in unchanged by merge commits: PR #50 (`8264de8`; a stored
`processingError` gives a `fail` status, Failed, sorted first, retried by batch, blocking Mark reviewed until a run
succeeds; `LEVEL_RGB` gains C2–C7 and every outline, lumbar included, draws in the level colour; `measurementWarnings`
hides the five lines named in #46 for cervical and full-spine studies only, while status still counts them) and PR #49
(`4a7f491`; `performance.cropMethod` `search` (default) or `model`, `backend/learned_region.py` and
`backend/region_detector.py`, Crop search fallback per region). The two touch no file in common. Merged as is at the
owner's request: `backend/onnx/crop_detector.onnx` (10.7 MB) is a plain git blob force-added inside the ignored
`backend/onnx/`, not LFS like `backend/weights/`, so a retrained graph adds another blob to history; moving it to LFS
is open. Unit 587/587; backend tests not run locally (each PR's Windows/macOS workflow ran them and the bundled-model
check). Not run: a source launch. Merging the release PR to `fork/main` with a merge commit publishes v1.0.13.

**2026-09-30 release 1.0.12 (CSV keep-column lift):** branch `claude/csv-keep-column-name` (worktree
`.claude/worktrees/csv-keep-column`) off `fork/main` @ `16088cd` (v1.0.11, PR #43). It carries exactly one feature
commit cherry-picked from the held similar-cases branch `claude/image-similarity-visualization-400922` (Plan B Task 5,
`e8eb247`): `Keep column name` and `Keep N unmapped columns` on the Workspace mapping card (`KEEP_NAME`,
`keepColumnName`, `keepUnmapped`, `keepableCount` in `renderer/data/csv.js`; the card in
`renderer/screens/workspace.js`; `.workspace-keep-row` in `styles/screens/workspace.css`; two tests). The cherry-pick
applied cleanly: main's changes to those files since `efe1df6` all lie outside the mapping card. Unit 582/582. Not
run: a source launch of this tree (the card was walked by hand on 2026-09-14 on the branch it came from). Everything
else from the similar-cases work (embeddings, Find similar, comparison mode, `Export dataset`, the three outcome
fields) stays held on its branch for the owner's offline testing; when that branch later merges `fork/main`, git sees
this commit's content as already applied and only the release files conflict. The 1.0.12 release commit is on this
branch; merging it to `fork/main` with a merge commit publishes v1.0.12.

**2026-09-28 release 1.0.11:** branch `claude/happy-faraday-vjiqgk` off `fork/main` @ `03d42a4` (PR #41), with
`fork/main` @ `110ff47` (PR #42, segmental lordosis and angulation) merged in. The merges of PR #37, #41 and #42
built both installers but published nothing: `tools/packaging/publish_release.py`
refuses a version whose tag already belongs to another commit, and `package.json` still said 1.0.10. Every
publication needs the bump in `docs/release-main.md` (`package.json`, `renderer/data/version.js`, `CHANGELOG.md`,
`docs/releases/<version>.md`, the README link). The 1.0.11 release commit is on the branch; merging it to `fork/main`
publishes v1.0.11 and moves `latest-windows`. Physical GPU qualification on a workstation is unreported for this
revision (PR #41's "Draft pending Windows validation" note).

**2026-09-27 GPU processor setting:** branch `claude/gracious-ptolemy-a4pxts` off `fork/main` @ `1c83e05` (v1.0.10 and
PR #37). Windows and NVIDIA per-program GPU preferences never reached inference: the backend is a separate process and
shipped CPU-only ONNX Runtime. **Settings → Processing → Processor** now chooses the CPU (default) or a GPU the backend
lists (`GET /processors`, `backend/processors.py`); 64-bit Windows installs `onnxruntime-directml==1.24.4` by requirement
markers (never both ONNX Runtime builds in one venv; `run.py` uninstalls first). Saved as `performance.processor`: `cpu`
or the PCI identity `gpu:<vendor>:<device>[:n]`, never Windows' adapter index, which each run re-reads through DXGI
(ONNX Runtime reads its list once per process). A GPU failure retries that model on the CPU (ONNX Runtime's own silent
retry is off); `qc.processing.processor` and per-model `providers` record what ran, and the Analysis header shows GPU, GPU + CPU or
CPU from the providers. CI has no GPU: check a workstation with `spine-contour-backend.exe --verify-models`, then one
film. See `docs/gpu-processing.md` and the 2026-09-27 contract amendment.

**2026-09-14 similar cases and outcomes (stage 1):** branch `claude/image-similarity-visualization-400922`
(worktree `studies-ui-updates-bb040d`) off `fork/main` @ `efe1df6` (v1.0.8), built by Plan A
(`docs/superpowers/plans/2026-09-12-a-embeddings-backend.md`, complete at `fcf94b9`) and Plan B
(`docs/superpowers/plans/2026-09-12-b-similar-cases-renderer.md`, complete at `a7e4a9e` plus three
gate-fix commits and a suite fix, `ffb8982`); spec
`docs/superpowers/specs/2026-09-12-similar-cases-outcomes-design.md`. The backend computes two
appearance embeddings (DINOv2 ViT-S/14, 224 px, CLS token) as a fifth ONNX graph inside every
`/predict`, unless `Appearance embeddings` is off, and serves `POST /embed` and `GET /embedding-model`
for backfilling and staleness checks. The Find similar tab (`renderer/components/similar.js`) ranks the
library by a fused shape/hip/alignment/appearance distance under four modes and two scopes, five cards
with a recorded outcome line and a footer count, never a risk. Outcomes are three new clinical fields
(fusion extension, its date, last follow-up) registered generically and resolved per subject
(`renderer/data/outcomes.js`). `Keep column name` and `Keep all unmapped` let a workspace CSV import an
unknown column under its own name. `Embed {n}` on the Find tab is a second batch kind beside `Segment`.
Comparison mode (plan 07's Tasks 3-6) is `mountViewer(container, {role})` serving both panes, every
on-screen surface naming a film by its parsed fields via `filmLabel` (`renderer/data/labels.js`), never
the `SP-nnnn` record id. `Export dataset` on the Parameters bar writes a five-file folder —
`parameters.csv`, `paired.csv`, `vectors.json`, `manifest.json`, `README.md` — keyed by study name, no
images, no paths, no record ids. Counts: unit 591/591; backend pytest 429 passed, 2 skipped;
`smoke-similar.mjs` 69/69; `smoke-studies.mjs` 136/136; `smoke-parameters.mjs` 58/58 (fresh launch);
`smoke-persist.mjs` 40/40 then 48/48. The human gate passed 2026-09-14 (the user: "passed the gates");
its rulings are HANDOFF decisions 75-77. Not run: the packaged five-graph check and the installer's
size growth (needs a packaged build); the release workflows' hub download and `export_embed`'s
mean/std and licence guards on the pinned export pair (`requirements-export.txt`'s torch 2.11.0/timm
1.0.27 versus the validating venv's 2.13.0/1.0.29); `/embed` over a real uvicorn socket; a
persistence-disabled `Embed`; the three-button export row at a narrow window. The gate's nine checks
were answered by the user as one pass, not itemised. See the architecture contract's `## 2026-09-12 amendment: similar cases
and outcomes (stage 1)`, HANDOFF's first "Where things stand" section and `docs/ROADMAP.md` §8. **Next:**
the user says when to push to `fork`; then a PR to `fork/main`. A release commit is separate, later work.
Wrapped 2026-09-14 with both suites green (unit 591/591; backend 429 passed, 2 skipped); `docs/superpowers/NEXT-SESSION.md`
is the prompt. *(Superseded 2026-10-03: the merge of the trunk happened — v1.0.15, `c53e91d` — and stage 2 was built on
it; see the paragraph at the top. The branch now releases as 1.0.16 or later, after the owner's offline testing.)*

**2026-09-11 filename grammar / note:** branch `claude/spine-contour-filename-parse-b6c1bb` off `fork/main` @
`6704586` (v1.0.7). Filename stems are read as underscore-separated fields — subject, then a timepoint, view or
`M-D-YYYY`/`YYYY-MM-DD` date in any order, then plain fields as a new `note` — by `inferFromStem`; `seedFields` seeds
`filmDate` and `note`; `studyFromFile` seeds picked/dropped films; the drawer has a fifth NOTE column and `toCsv` a
`Note` column. See the pre-op/post-op spec §8.1 (amended). A load never rewrites a stored subject, even one the old
parser stored as the whole stem (user decision: delete and re-add such films). The paired export (`data/pairing.js`,
`toPairedCsv`) now groups films into VISITS (subject + label + film date): a label's visits are numbered by date when a
subject has several, two same-day films merge under the unnoted-primary rule, a merged visit's PI-LL mismatch is
derived from the merged PI and LL, and every merge, disagreement and cross-film derivation is flagged in the toast and
in the file (spec §11.2/§11.3 amended). (2026-09-12) The study name on the Find list and the Parameters grid shares
one rule, `.study-name` at the end of `styles/screens/studies.css` (280px cap, wrap anywhere, no ellipsis; it must stay
after `.param-open`, whose `all: unset` would erase it), and the Find list's STUDY track flexes with a floor; the
sidebar's open-study card is an icon-only button when collapsed (`openStudyCard(state, collapsed)`). Both CSV exports
name a film by `studyName` (the stem) — `toCsv`'s `Study ID` holds it — and the SP-nnnn record id is shown nowhere a
person looks: not in either file, not in a tooltip (user rule 2026-09-12); `fileStem` moved to `data/labels.js`
(re-exported by `csv.js`). **Release commit `51ecba2` (v1.0.8, 2026-09-13) is on the branch, pushed to `fork`; the user
opens the PR to `fork/main` and merges it with Create a merge commit, which publishes the installers.** Read HANDOFF's
first "Where things stand" section (the rulings and what was not run) and `docs/superpowers/NEXT-SESSION.md`.

**2026-09-10 circle editing / confidence:** v1.0.7 supports 0/1/2 editable femoral circles and hides raw femoral masks. See `docs/releases/1.0.7.md` and the latest architecture amendment. Overall confidence is a categorical QC assessment, never a repurposed femoral percentage. Manual edits preserve original score provenance; reset restores QC too.

**2026-09-10 manual reference persistence:** v1.0.5 fixes calibration before study
creation and Windows path matching. Applied references/explicit clears are saved
by original-file digest and reused in calibration and prediction. See
`docs/manual-calibration-persistence.md`; retain per-image provenance and the
existing disc-height definitions. Unapplied edits are drafts, not saved references.

**2026-09-10 toolbar removal:** v1.0.4 starts from Cody's merged PR #8 (`6106463`).
The user explicitly requests pushing the tested release directly to the fork's
`main`. Settings adds `toolbarRemoval` (default false); see `docs/toolbar-removal.md`.
Fast bottom-strip cleanup precedes inference and reduces the output image/mask
height, preserving the source x/y origin. Calibration always reads the untouched
upload. Do not generalize this to top/left crops without coordinate restoration.

**2026-09-09 ONNX/localizer amendment:** `codex/onnx-localizer` starts from Cody's merged PR #7 (`c7aab15`) and prepares v1.0.3. All desktop inference uses ONNX Runtime; PyTorch builders now live in `backend/models/training.py` for export/test only. Install `backend/requirements-export.txt` and run `python tools/export_onnx.py` before development tests or launching from source. Settings adds `cropLocalizer` (default true). OFF bypasses model-based crop search/reframing while retaining cheap empty-border cleanup; ON retains the full search. The user explicitly requested this exception to the earlier always-search rule. See `docs/onnx-inference.md` and the latest architecture amendment. Package ONNX graphs/runtime, not Torch/timm/torchvision or `.pt` weights; this supersedes the older bundling advice below.

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

**Branch `claude/femoral-confidence-1.0.7` (2026-09-10)** — the backend developer's editable femoral
circles and overall image confidence (`ee735e1`, off v1.0.5) merged with `fork/main` @ `b083d7d` (v1.0.6) and
renumbered to 1.0.7; the Analysis header carries both his confidence badge and the status badge with disjoint
vocabularies; verification counts in `docs/releases/1.0.7.md`; next: a PR to `fork/main` superseding PR #10, whose
merge publishes 1.0.7.

**Branch `claude/studies-table-ui-updates-953945` (2026-09-10) — DONE, merged with `fork/main` v1.0.5.** It sits on
`fork/main` @ `6106463` and has been merged with `fork/main` @ `71d483f` (v1.0.5) — **`fork/main` is the trunk
now**: the backend developer took `fork/ui-redesign-cw` (the 2026-09-08 handover tip) and released v1.0.0–1.0.3 on top
of it through fork PRs #4–#8; `fork/ui-redesign-cw` is an ancestor of `fork/main`, the older
`claude/studies-ui-updates-bb040d` tip (`4f76063`) is superseded, and upstream `origin/main` still has the OLD
single-page UI and is never a base. It holds the studies-table work: spec
`docs/superpowers/specs/2026-09-10-studies-table-review-design.md` (`e6178fe`) and plan
`docs/superpowers/plans/2026-09-10-studies-table-review.md` (`f6e421b`; Tasks 1–9, its `## Ledger` at the end): Delete
over the ticked visible rows; sortable Find headers; SUBJECT editable in place; a stored `reviewedAt` and the fourth
status, Reviewed; a development-only demo toggle. On the branch before the v1.0.5 merge: unit 505/505;
`smoke-studies.mjs` 136/136; `smoke-persist.mjs` 40/40 then 47/47; `smoke-parameters.mjs` 58/58; `smoke-workspace.mjs`
100/100; `smoke-seeding.mjs` 36/36 (not re-run). The human gate passed 2026-09-10 (user). The merged tree reads unit
513/513; its smoke-suite counts are recorded in the plan's `## Ledger` and in the release PR's description once the
suites have run on the merged tree. Pushed to `fork`. **Next:** the 1.0.6 release commit, then a PR to `fork/main`
whose merge publishes the v1.0.6 installers; the packaged-build checks (no DEMO STUDIES row, no
`library-preferences.json`) run on that installer. **Done 2026-09-10:** v1.0.6 published (PR #11, `b083d7d`). The paragraphs below are historical.

**Superseded 2026-09-10 (kept for the record):** **Branch `claude/studies-table-ui-updates-953945` (2026-09-10) — PLANNED, execution not started.** It sits on
`fork/main` @ `6106463`, which is **the trunk now**: the backend developer took `fork/ui-redesign-cw` (the 2026-09-08
handover tip) and released v1.0.0–1.0.3 on top of it through fork PRs #4–#8; `fork/ui-redesign-cw` is an ancestor of
`fork/main`, the older `claude/studies-ui-updates-bb040d` tip (`4f76063`) is superseded, and upstream `origin/main`
still has the OLD single-page UI and is never a base. The branch holds the approved spec
`docs/superpowers/specs/2026-09-10-studies-table-review-design.md` (`e6178fe`) and the plan
`docs/superpowers/plans/2026-09-10-studies-table-review.md` (`f6e421b`; Tasks 1–9: Delete over the ticked visible rows,
sortable Find headers, SUBJECT editable in place, a stored `reviewedAt` and the fourth status Reviewed, a
development-only demo toggle). Unit 479/479 on this base; no code task has started. `docs/superpowers/NEXT-SESSION.md`
is the execution prompt. The branch paragraphs below are historical.

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
| `docs/superpowers/specs/2026-09-12-similar-cases-outcomes-design.md` | Similar cases and outcomes, stage 1 (approved; implemented 2026-09-14; partly superseded by stage 2) |
| `docs/superpowers/plans/2026-09-12-a-embeddings-backend.md` | Similar cases, Plan A: the backend appearance-embedding endpoints |
| `docs/superpowers/plans/2026-09-12-b-similar-cases-renderer.md` | Similar cases, Plan B: the Find similar tab, outcomes, comparison mode, `Export dataset` |
| `docs/superpowers/specs/2026-09-30-similar-cases-stage-2-regions-design.md` | Similar cases, stage 2: every measured parameter, every region (implemented 2026-10-03, gate not run) |
| `docs/superpowers/plans/2026-09-30-similar-cases-stage-2-regions.md` | Similar cases, stage 2 plan: the block registry, the region axis, the Region control, version-2 records (Tasks 1–10; Ledger holds R1–R27) |

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

Local only, on a random port. Six endpoints the measurement UI uses, plus the backend developer's two calibration
endpoints (`POST /calibrate`, `POST /calibration-profile`, 2026-09-07; `scipy`, `pytesseract` and the Tesseract runtime
are theirs — the venv needs the two packages for the backend to start):

Automatic ruler calibration needs a Tesseract binary: the installers bundle one, but a source
launch resolves it via `TESSERACT_CMD`, then the PATH, then the standard install folders
(`C:\Program Files\Tesseract-OCR`, `C:\Program Files (x86)\Tesseract-OCR`, or
`%LOCALAPPDATA%\Programs\Tesseract-OCR` on Windows) — see `backend.calibration.resolve_tesseract()`;
when none is found the backend logs `OCR: no Tesseract binary found ...` and every image reads
"Automatic ruler detection is unavailable."

- `POST /predict` — multipart file upload. Returns `image_png`, `mask_png`,
  `femoral_mask_png`, `measurements`, `geometry`, `qc`, `labels` (all base64 where
  relevant). Slow: locates the lumbosacral region, then runs the chosen models.
  Optional form fields `vertebra_model`, `femoral_model`, `s1_model` choose which model
  reads each structure; anything the backend does not offer is a 422, and omitted fields
  take the default. The form field `embeddings` (default true) adds the
  `embedding` stage and key; see `docs/appearance-embeddings.md`.
- `POST /measure` — geometry only, no image. Returns `{measurements, geometry}`.
  Cheap, which is what makes live re-measurement after landmark correction practical.
- `POST /embed` — multipart `file` (a stored sidecar `image_png`), optional `framing` JSON and
  optional `region` (`lumbar` by default, `cervical`, `full_spine`; anything else is a 422).
  Returns `{embedding: {model, lumbar, cervical, whole, region}}`, the same record `/predict`
  returns under `embedding` when the `embeddings` form field is on (the default); `/predict`
  passes the region its run resolved. About a second.
- `GET /embedding-model` — `{id, dim, input, onnx_sha256}` for the bundled encoder, the
  same `model` record every `/predict` and `/embed` embedding carries; 503 when no graph
  is installed. The renderer reads it once to tell a stale stored embedding from a
  current one (spec §11).
- `GET /models` — `{vertebrae: [...], femoral: [...], s1: [...]}`, the offered model ids.
- `GET /health` — `{"status": "ok"}`.
- `GET /processors` — `{processors: [{id, kind, name, memory_mb}]}`: the CPU, then each GPU ONNX Runtime can use.
  `/predict` and `/predict-stream` take an optional `processor` field (default `cpu`); see `docs/gpu-processing.md`.

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

`timm` (the HRNet trunk, also the appearance encoder's export dependency) is
export-only; every workflow passes `--exclude-module timm` so the backend bundle
never carries it.

## Git

This worktree (`.claude/worktrees/studies-ui-updates-bb040d`) is on branch
`claude/image-similarity-visualization-400922` (2026-09-13 → 14 similar cases and outcomes stage 1; 2026-10-03 merged
with `fork/main` @ `c53e91d`, v1.0.15, and stage 2 built), off `fork/main` @ `efe1df6` (v1.0.8). The sibling worktree
`.claude/worktrees/spine-contour-segmentation-failures-82e370` is on an older branch — never launch the
app from it while testing this branch; both worktrees read the same library. Two remotes:

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
