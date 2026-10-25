# Fixed-pipeline validation

## Model accuracy and data use

[Annotated-data fine-tuning](annotated-finetuning.md) reports the training cohorts, selection rules and before/after errors. Results are mixed. The cervical ZIP annotations are training data. The CSXA and clinical cohort retention panels largely appeared in the initial cervical checkpoint's training data; they are not independent tests. The original 541-image lumbar/S1 test split is excluded from fine-tuning and checkpoint selection.

## Full-spine pipeline check

The application pipeline processed all 99 real full-spine radiographs without inference errors. Each source file was checked against the private manifest's SHA-256. Cervical windows, lumbar localizers, orientation and pixel spacing were frozen to image-derived values. Reader measurements and reference landmarks were not passed to inference.

The reference workbook contains AI predictions from different model weights. The following values quantify changes from those predictions, not accuracy against human annotations. This cohort also has prior development use. No exact decoded-pixel or mirrored-pixel match was found between these 99 images and the fine-tuning image manifests.

| Measurement | Paired outputs | Mean absolute change (° or mm) | Maximum change (° or mm) | Newly available | Newly unavailable |
| --- | ---: | ---: | ---: | ---: | ---: |
| C2-C7 Cobb | 87 | 2.814 | 18.695 | 0 | 2 |
| C2-C7 SVA | 82 | 0.528 | 4.764 | 0 | 1 |
| Global SVA | 85 | 0.828 | 13.189 | 2 | 2 |
| L1-S1 Lordosis | 94 | 0.959 | 21.340 | 1 | 1 |
| Sacral Slope | 94 | 0.503 | 6.575 | 1 | 1 |
| Pelvic Incidence | 88 | 0.637 | 7.030 | 1 | 1 |
| Pelvic Tilt | 90 | 0.441 | 14.817 | 1 | 3 |

Compared with the reference AI workbook, cervical Cobb is newly unavailable in 2 cases and newly available in 0. Unavailable cases: 000131, 000156. Availability changes are not accuracy comparisons against human annotations. Anatomical checks remain enabled. Case 000019 lacks accepted lumbar/S1 geometry. Frozen crops can omit relevant anatomy, and difficult landmark errors persist.

The coordinate-graph decoder remains the global-SVA lumbar source. Cervical subpixel neighborhoods include each in-bounds cell once; lumbar subpixel neighborhoods retain their boundary-clipping convention. Pelvic tilt and global SVA retain their separate candidate-crop policies.

## Runtime and application checks

Hardware: RTX 3090 Ti and RTX 3090, 24 GB each. CUDA validation uses ONNX Runtime 1.23.2 and float32 graph tensors. The 50-image and 49-image shards take 334.84 and 331.41 seconds. The longer shard is **5m35s**. This includes loading, prediction, measurement and JSON output; it excludes fresh localization, automatic calibration, HTTP encoding and rendering. Timing was measured on a shared host with backend tests running during part of inference; it is not an isolated performance benchmark.

The backend suite passes **770 tests with three platform/data-dependent skips**. Checks cover measurement routes, saved calibration, partial anatomy, model provenance, processor selection, allocation backoff, cancellation and CPU fallback. Real-radiograph Torch/ONNX parity checks pass for both cervical graphs, lumbar heatmaps and coordinate outputs, the region detector, and single-image/four-image S1 inference.

S1 export checks cover actual radiographs and mirrored radiographs, plus a separate no-detection contract test. The blank-input lumbar test verifies heatmap parity and permits a one-cell coordinate difference only for nearly tied peaks; nonempty coordinate checks retain strict tolerances. Blank/noise checks are numerical contracts, not evidence of segmentation accuracy.

Real cervical, lumbar and full-spine overlays were visually inspected. Difficult vertebral-level errors and obscured cervical landmarks remain. A packaged Windows CUDA installation has not been validated.

## Reproduction

`tools/reproduce_fixed_pipeline.py` accepts a private image manifest, output directory, GPU and optional shards. `--fresh` recomputes localization but retains manifest calibration. `tools/smoke_fixed_api.py` exercises the actual HTTP route with fresh localization and OCR. `tools/compare_fixed_pipeline.py` compares completed outputs with a matching reference; its default 0.1°/mm threshold is an exact-reproduction criterion, not a threshold for model improvement.

Checkpoint/graph hashes and aggregate training metrics are recorded in [annotated-finetuning-results.json](annotated-finetuning-results.json). Model sidecars include export parity checks. Private images, patient identifiers and individual annotation files are not bundled with this report.
