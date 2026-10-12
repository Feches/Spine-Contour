# Next session: brainstorm and plan model retraining from the level editor's label records

Paste the block below as the first message of a new Claude Code session opened on this repository. Everything under
"Context" is background the session needs; everything under "Open questions" is what the brainstorm has to settle.

---

Use superpowers skills. Start with `superpowers:brainstorming` to design how Spine Contour's segmentation models get
updated from the label records the level editor writes, then `superpowers:writing-plans` to turn the approved design
into an implementation plan. Do not write code in this session: the deliverables are a design spec at
`docs/superpowers/specs/<date>-model-retraining-design.md` and a plan at
`docs/superpowers/plans/<date>-model-retraining.md`, both committed on a new branch. Ask me the open questions with
AskUserQuestion before settling the parts they affect, one round at a time, with a recommended option first. If you
spawn agents, spawn the lowest-capability model that can do each task.

## Context

Read first: `CLAUDE.md` (the first paragraph is the level editor's state), `docs/level-editor.md` (section "The label
record"), `docs/design/level-editor/label-record.schema.json` and `label-record.example.json`,
`docs/design/level-editor/HANDOFF.md` §9 and §12, `docs/onnx-inference.md`, `docs/accuracy-safeguards.md`,
`backend/models/training.py`, `backend/models/models.py`, `tools/export_onnx.py`, and the memory notes the session
loads (the workstation assets note names the GPU, the venvs and the real films).

**Where the work sits.** The level editor lives on branch `worktree-level-editor` (worktree
`.claude/worktrees/level-editor`, off `origin/main` @ `20fd4c5`, v1.0.17). Its human gate is in progress and it is not
merged. Retraining needs no change to the app, so it is its own branch: off `main` once the level editor has merged,
otherwise off `worktree-level-editor` so the record format is in reach. Never start work on `main` itself.

**The records.** Save edits in the level editor writes one JSON file per film at `<userData>/labels/<stem>.label.json`
(schema id `spinecontour.segmentation-label/1`). Per film: the image file name, its SHA-256, width and height; the
film type; the model name and version that produced the prediction; the app version; a `complete` flag; one entry per
level (C2–C7, T1, T4, L1–L5, S1) and per femoral head with `state` (`segmented` = the model's, `edited` = corrected,
`manual` = placed by hand, `not_placed`, `not_visible`), `source`, the current geometry in stored-image pixels (body
corners `sa sp ia ip`; C2 `ia ip` + `centroid`; endplates `sa sp`; T4 `centroid`; heads `center`, `radius`, `rim`),
the model's original geometry when edited, the model's mask outline (`contour`) only for a level still the model's,
and `edited_points` (the keys the annotator moved; every key for manual; empty otherwise); and a top-level `edits`
summary (counts per state, `points_moved`, `points_placed`). A film saved with no change is a human-accepted
prediction: every entry `segmented`, the counts zero. Records written before 2026-10-11 lack `edited_points` and
`edits`. Window / level is never in the record. During the gate the records are in a scratch profile under `%TEMP%`
(`spine-contour-gate\labels`); in normal use they are in `%APPDATA%\spine-contour\labels`.

**The models** (ONNX graphs in `backend/onnx/`, checkpoints in `backend/weights/` under LFS, all inference on a
located crop letterboxed into a 768-pixel frame; the crop each run used is in the study's sidecar
`predictions/<id>.json` under `qc.framing`, and `qc.model_versions` names the graph hashes):
- vertebra reader, default: a ResNet-34 U-Net producing a mask per level (`vertebra_unet.pt`);
- vertebra reader, alternative: an HRNet landmark model producing corner heatmaps (`hrnet_landmarks.pt`), selectable
  per structure today (`vertebrae: hrnet`);
- femoral heads: a U-Net mask (`femoral_unet.pt`), fitted as two discs by `backend/femoral.py`;
- S1 superior endplate: a two-keypoint Keypoint R-CNN (`s1_keypointrcnn.pt`);
- cervical: a DETR detector plus an HRNet landmark model (`cervical_detr/`, `cervical_hrnet.pt`).
`backend/models/training.py` only builds these architectures for export and tests; there is no training loop, no
dataset builder and no training data in the repository. The original training data belongs to the backend author
(Michael Jayasuriya); ask whether a sample of it can be used for rehearsal.

**The workstation.** Windows 11, an RTX 4070 (12 GB) and an Intel iGPU; a Python 3.12 venv at
`C:\Users\codyj\sc-export` with torch, timm, onnx and pytest (used for exports and backend tests); the app's own venv
at the main checkout's `.venv` (ONNX Runtime DirectML, no torch). Real lateral films, the owner's own, are in
`C:\Users\codyj\OneDrive\Desktop\OLIF studies\` (nine lumbar JPGs, one full-spine PNG). Films are patient data: never
view or send screenshots of them, verify by reading values; datasets built from them never enter git.

**What has already been thought through** (start from here, do not re-derive it):
- Fit per model: corner-based models (HRNet, cervical HRNet, S1) take the record's corners directly; the femoral U-Net
  takes discs rasterised from the circles; the vertebra U-Net needs masks and an edited level gives only four corners,
  so the likely path is fine-tuning the HRNet corner reader and promoting it to the default, or rasterising quads.
- The loop: collect records + films + sidecars joined by SHA-256 → a dataset builder that reproduces each run's frame
  from the sidecar framing → fine-tune from the shipped checkpoints with a held-out set → export with
  `tools/export_onnx.py` and ship → measure the correction rate per model version from the `edits` summaries.
- Against catastrophic forgetting: train on acceptances as well as corrections; small learning rate, few epochs, a
  frozen backbone or a penalty toward the shipped weights, or distillation from the frozen original; always retrain
  from the original checkpoint on everything collected so far, never chain fine-tunes; a frozen, stratified benchmark
  (cervical, lumbar, full spine, DICOM, JPEG, missing levels) that must not regress; ship the new graph as a selectable
  reader beside the current one, with `qc.model_versions` and the record's model version giving the rollback and the
  comparison.

## Open questions for the brainstorm

1. Which model first: the HRNet corner reader (direct fit, could become the default), the femoral net, S1, or all?
2. Masks for the vertebra U-Net: rasterised quads, the model's own contour for untouched levels, or skip the U-Net?
3. The dataset builder: inputs (records, films, sidecars), how the frame is reproduced, output format, where datasets
   live on disk, how patient data is kept out of git and out of cloud sync.
4. Acceptances: is "saved with no change" enough as a verified label, or does the editor need an explicit Verified
   action? (That would be an app change on the level-editor branch.)
5. The benchmark: how the held-out films are chosen and frozen, the metrics (corner error in px and mm, Dice for
   heads, downstream measurement error), the per-stratum tolerances, and who signs off a release.
6. Training recipe: learning rate, epochs, what is frozen, the regulariser, augmentation, loss weighting by
   `edited_points`, and where it runs (the 4070).
7. Versioning and shipping: graph naming, sidecar hashes, how a fine-tuned graph is offered in Settings, how results
   record it, and the rollback path.
8. The feedback metric: the exact script over a labels folder that reports correction rates per model version.
9. Data volume: how many corrected and accepted films before the first retrain is worth running.
10. Whether a sample of the original training data is available for rehearsal, and under what terms.

## Constraints that carry over

The owner gates every change: no push, PR or release without their say-so. Conventional commits with the
`Co-Authored-By` trailer the session's instructions give. Keep the app's non-negotiables (no fabricated values, no new
runtime dependency, CSP unchanged) in mind even though this work should not touch the renderer. The design must not
require retraining to run inside the app.
