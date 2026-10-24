# Annotated-data fine-tuning

The bundled cervical and lumbar landmark models, S1 detector and optional region detector use existing trained weights as initialization. Cropping, horizontal mirroring, rotation, scaling, translation and intensity augmentation expose the landmark models to varied framing. Anatomical landmark identities remain fixed under mirroring. Landmarks outside a crop are masked from the loss; S1 crops retain both supervised endpoints.

## Data and supervision

| Model | Training images | Supervision |
| --- | ---: | --- |
| Cervical landmarks | 4,506 | 3,986 original CSXA, 163 original clinical cohort images, 39 annotated cervical, 36 annotated full-spine, 157 Astra-accepted PMC and 125 Astra-accepted clinical cohort images |
| Lumbar landmarks | 4,423 | 4,328 original images, 55 annotated lumbar and 40 annotated full-spine images |
| S1 endpoints | 4,423 | The same original and annotated lumbar/full-spine images |
| Optional region detector | 611 | Original region boxes and envelopes from annotated or accepted landmarks; unannotated classes excluded from the classification loss |

Annotated labels take priority over duplicate original or prediction-derived labels. Incomplete, unsuitable or mismatched annotations identified in the source manifests are excluded. Source-visible landmark masks preserve partial annotations. Exact decoded-pixel and horizontal-mirror checks reduce duplicates, but do not establish independence between every article or patient.

All usable ZIP annotations enter training. The 39 cervical ZIP images and 40 full-spine ZIP images are therefore not test sets. Astra-accepted landmarks are model predictions, not human reference annotations; their cervical training loss has weight 0.5 relative to original and annotated supervision.

## Training and selection

Cervical training initializes from the anatomical epoch-87 checkpoint. A broad phase runs 24 epochs with AdamW at 5×10⁻⁶ and selects epoch 9 by original-validation point, slope and Cobb ratios, each limited to 10% degradation. The annotation-focused phase runs 16 epochs at learning rates 1×10⁻⁵ and 3×10⁻⁵; the bundled checkpoint is epoch 16 of the 3×10⁻⁵ run. Each epoch samples 128 batches of 24 images. Sampling assigns 65% to ZIP annotations, 20% to original data and 15% to accepted predictions. Batch-normalization statistics remain fixed. Dedicated cervical images use 60% full framing, 30% complete-neck crops and 10% partial crops; full-spine images use 10%, 80% and 10%, respectively. The loss weights C2/C7 inferior endpoints threefold and includes endplate-direction and relative Cobb-angle terms.

Cervical selection minimizes equal-domain annotation-fit ratios for normalized point, endplate-slope and Cobb error, requiring each original-validation metric to remain within 15% of the annotation-focused phase's starting value. This explicitly selects for fit to the annotated training images; it is not an independent accuracy evaluation.

Lumbar and S1 training retain original replay. Lumbar selects epoch 1. The S1 run at 5×10⁻⁶ rejected every trained epoch under the validation guard; a 1×10⁻⁶ run with 60% original, 30% annotated lumbar and 10% annotated full-spine sampling selects epoch 1. Both runs stop at epoch 12 under the eight-epoch patience rule. Their full/tight/partial crop probabilities are 50%/30%/20%, with S1 crops falling back to full framing if an endpoint would be lost.

The cervical guard uses the original 20-patient validation panel. Lumbar/S1 selection uses a fixed 64-patient original validation panel and minimizes the mean relative point, slope and angle error among trained epochs, requiring each metric to remain within 10% of its starting-model value and no additional S1 detection misses. If all trained epochs fail, the starting weights are retained. This permits modest regression in individual metrics and does not guarantee improvement.

The region detector uses a fixed eight-epoch continuation. Training-set box scores are not independent validation results. The default pipeline retains search-based localization; the fine-tuned region model is available through the existing model-based localization option.

## Evaluation

| Evaluation set | Metric | Starting model | Selected model |
| --- | --- | ---: | ---: |
| Cervical validation, 20 patients | Landmark MAE, native pixels | 9.92 | 9.84 |
| Cervical validation, 20 patients | C2–C7 Cobb MAE, degrees | 4.60 | 4.90 |
| CSXA retention, 469 images | Landmark MAE, native pixels | 1.80 | 1.89 |
| CSXA retention, 469 images | C2–C7 Cobb MAE, degrees | 2.31 | 2.39 |
| Clinical cohort retention, 19 images | Landmark MAE, native pixels | 8.02 | 8.52 |
| Clinical cohort retention, 19 images | C2–C7 Cobb MAE, degrees | 4.45 | 3.61 |
| Original lumbar test, 541 images | L1–S1 angle MAE, degrees | 3.38 | 3.51 |
| Original S1 test, 541 images | Endplate slope MAE, degrees | 2.42 | 2.30 |
| Cervical ZIP training, 39 images | Landmark MAE, native pixels | 12.86 | 2.89 |
| Cervical ZIP training, 39 images | C2–C7 Cobb MAE, degrees | 7.13 | 1.62 |

For the unmirrored, equally weighted image views shown in the annotation gallery, the bundled model has landmark/Cobb MAE of **2.60 pixels / 1.43°** on 39 cervical images and **3.12 pixels / 1.77°** on 36 full-spine images in saved crop mode, including full-image fallbacks. These use different averaging from the group-weighted, mirrored-view table above. Errors cover valid reference landmarks only; predictions at unlabeled landmarks remain unscored.

All 469 CSXA retention images and 18 of the 19 clinical cohort retention images appeared in the initial cervical checkpoint's training manifest. They are excluded from this fine-tuning run, but cannot establish performance on unseen patients. The 20-patient cervical validation panel participates in checkpoint selection. ZIP scores describe fit to training images. The original lumbar/S1 test split is excluded from fitting and checkpoint selection.

Cervical metrics average original and mirrored views within source groups before averaging groups. Native-pixel errors cannot be compared across datasets as physical distances. Lumbar/S1 test comparisons use the same subpixel decoder for starting and selected weights, isolating the weight update. The selected S1 decoder was chosen using validation data.

The results are mixed. Fine-tuning improves fit to cervical ZIP annotations and S1 test slopes, while lumbar test lordosis error and several landmark metrics increase. Visual inspection of real lumbar overlays shows persistent vertebral-level errors in difficult images. Full-film landmark inference without localization remains unreliable; pipeline crops are still required.

## Export and traceability

Landmark ONNX sidecars record checkpoint and graph SHA-256 hashes, selected epochs and numerical parity checks. The region detector keeps its strict runtime contract in `backend/onnx/crop_detector.json`; training hashes and export checks are stored separately in [crop-detector-provenance.json](crop-detector-provenance.json). Cervical regional and global-SVA routes use the same selected weights with their respective existing decoders. The global lumbar coordinate graph preserves its original decoder; regional lumbar measurements retain the 9×9 local decoder. S1 single-image and four-image exports use the same selected weights and decoder.

The S1 decoder handles empty detections by padding its internal calculation and removing the padding before returning results. This avoids provider-dependent reductions over empty tensors. Export validation includes actual radiographs, mirrored radiographs and a separate empty-input contract check; the latter is not accuracy evidence. Femoral segmentation and the existing cervical search-localization checkpoints are retained.
