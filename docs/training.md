# Local model training

Open **Training** to fine-tune a starting checkpoint from reviewed study corrections.
Three targets are available:

| Target | Labels | Starting checkpoint |
| --- | --- | --- |
| Lumbar landmarks | L1–L5 superior/inferior corners and available S1 endpoints | `hrnet_landmarks.pt` |
| Lumbar segmentation | Filled L1–L5 polygons formed from the four corrected corners | `vertebra_unet.pt` |
| Cervical landmarks | C2 inferior corners and centroid; C3–C7 corners | `cervical_hrnet.pt` |

Femoral heads are not training targets. Cervical training updates HRNet, not its detector.
Lumbar polygons approximate vertebral bodies; a Dice score against them measures polygon
agreement, not accuracy against manually traced anatomical masks. Polygons follow
superior-anterior → superior-posterior → inferior-posterior → inferior-anterior.
All L1–L5 bodies must have valid corners for segmentation training so an unannotated
body is never silently used as background. Landmark training masks missing endpoints.

## Setup

Training runs in a separate Python process. The installers include its source code but
not PyTorch or starting checkpoints. The normal inference runtime remains independent.
Use a dedicated Python environment and the matching checkpoint from this repository's
Git LFS `backend/weights/` files (or a compatible checkpoint you previously trained).

1. Create a Python virtual environment using a Python version supported by PyTorch.
2. Install PyTorch 2.11.0 and torchvision 0.26.0 for your processor using the
   [official PyTorch installation instructions](https://pytorch.org/get-started/locally/)
   and [version-specific commands](https://pytorch.org/get-started/previous-versions/).
   Select the CPU, CUDA or ROCm wheel appropriate for your OS and hardware.
3. In that environment, run `python -m pip install -r backend/requirements-training.txt`
   from the source checkout. Installed apps also include this file in
   `resources/training-source/backend` (macOS: the app's `Contents/Resources`).
4. Open **Training → Choose Python** and select that environment's Python executable.
   **Check runtime** lists its CPU and available CUDA or ROCm devices. macOS uses CPU.
   `SPINE_CONTOUR_TRAINING_PYTHON` can set the executable at launch; otherwise development
   uses `SPINE_CONTOUR_PYTHON` or `.venv`. The picker changes it for this app session.
5. Choose the checkpoint corresponding to the selected target.

The inference Processor setting is separate from training. DirectML inference does
not imply a CUDA/ROCm training runtime is installed. An unavailable training device
fails explicitly; it never silently falls back to another processor.

## Select and run

Correct the landmarks in Analysis, finish the edits, and mark each study reviewed.
Assign a consistent Subject ID to every film of the same patient. Select eligible
studies in Training. At least five distinct subjects are required. A subject stays
entirely within one deterministic split: approximately 60% training, 20% validation
and 20% held-out testing. The split is reproducible for the same subject set; adding
subjects can change it. Do not repeatedly optimize against the reported held-out test.

The worker verifies each source file's SHA-256 and dimensions against the geometry.
It rejects duplicate source bytes or decoded pixels, malformed or overlapping polygons,
and corrected landmarks outside the saved crop. Reprocess and review a study if its
source or model crop is missing or outdated. Duplicate detection does not identify
all rescaled or re-encoded copies; Subject IDs remain essential.

The saved image-only inference crop and its orientation are reused; labels never
choose the crop. Full-spine images use the saved regional crop and mirror transform.
Preprocessing matches each head: lumbar percentile rescaling and 768-pixel letterbox;
cervical RGB normalization and 384-pixel crop. High-bit-depth full-spine
cervical training is rejected because those records do not retain the original
search-window intensity transform; single-region cervical supports high-bit-depth sources. This evaluates fixed crops, not detector
or complete measurement-pipeline performance.

Choose epochs, batch size, learning rate and CPU threads, then **Start training**.
The app shows preparation, baseline evaluation, training, validation and testing,
with elapsed time and an estimated remaining training time. Start with batch size 1
on CPUs or limited-memory GPUs. **Cancel training** terminates the worker. Closing
the app terminates an active run; interrupted runs cannot be resumed.

## Results and regression check

**Open results folder** opens a unique run directory under the app's local data folder.
The directory contains source-bound geometry and split provenance (`dataset.json`),
preprocessed inputs and target overlays (`data/`), prediction overlays (`evaluation/`,
orange reference points/outlines and cyan predictions), hyperparameters (`config.json`),
starting-model metrics (`baseline.json`), per-epoch history, and `result.json`.
These local files contain patient-linked annotations and images, like the study library.

Validation chooses the epoch with the lowest mean error, only if it improves over the
starting checkpoint. The selected checkpoint is saved as `candidate.pt`. No candidate
is saved when validation does not improve. The held-out test compares the candidate
with the starting checkpoint on identical subjects and crops:

- Landmark heads: source-pixel Euclidean landmark error, using the inference decoder.
- Segmentation: one minus Dice for each L1–L5 body against the corner-derived polygons.
- Repeated films are averaged within subjects before averaging across subjects.
- The gate passes only if overall error and every evaluated label's error do not increase.

A failed candidate remains available for inspection and is explicitly marked as failed.
The app never activates a candidate automatically. The `.pt` checkpoint is a training
artifact; using it in the ONNX inference app requires separate export and full-pipeline
validation. A passing small-cohort check does not establish generalization, prevent
catastrophic forgetting on an unrepresented population, or measure clinical safety.
Review target overlays and assess an independent representative cohort before deployment.
