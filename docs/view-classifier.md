# Experimental whole-film view classifier

## In the app

1. Open **Settings → Automatic view selection → Fast classifier**.
2. Use **Check film type…** to preview the classification of a local radiograph without changing a study or running segmentation.
3. For a study, leave **Region → Auto detect** and run segmentation. The classifier chooses cervical, lumbar, or full spine; the existing models then find landmarks and measure the selected region.
4. An explicit region always overrides automatic selection. Cervical measurements still require the anatomical anterior side. The classifier does not infer that side.
5. Select **Landmark search** to restore the existing method. That remains the default for new and existing profiles.

AP lumbar is a recognized class but cannot run the app's lateral measurements. A detected AP/other view or a score below the validation-selected threshold asks for manual selection. Unknown views can still receive confident incorrect predictions; review remains necessary. **AP cervical is not a trained class**: no verified eligible labeled set was available for this run.

This changes film selection only. The subsequent crop search, landmark models, calibration, and measurement definitions are unchanged. A fast region decision does not make the whole segmentation pipeline run in milliseconds.

## Model and preprocessing

MobileNetV3 Small, initialized with the torchvision ImageNet weights, with a five-class head:

- Cervical lateral
- Lumbar lateral
- Full-spine lateral (including broad spine PMC films)
- Lumbar AP
- Other (wrist radiographs in this training corpus)

The complete grayscale film is resized to fit inside 224 × 224 pixels and centered on a black canvas. It is repeated into three channels and normalized with the ImageNet mean and standard deviation. No filename, DICOM description, reference landmark, or aspect-ratio rule supplies the predicted class. The network can nevertheless learn source-specific shortcuts, including frame and acquisition appearance.

The shipped ONNX graph runs locally on CPU, without PyTorch at runtime. Its SHA-256, class order, temperature, threshold, and manifest digest are in `backend/onnx/view_classifier.json`. It is included in the existing backend model packaging directory. Manual requests do not load it. Low-memory mode releases its session after inference.

## Dataset and separation

All eligible images in the explicitly inventoried collections were considered, rather than a random training subset. There are **29,610 source files**, **1,174 exact duplicates removed**, and **28,436 distinct images**.

| Source | Distinct images | Role |
|---|---:|---|
| BUU lumbar AP/lateral, both local collections | 10,610 | Train/validation/test |
| CSXA cervical lateral | 4,963 | Train/validation/test |
| Complete full-spine collection | 236 | Train/validation/test |
| Reviewed PMC panels | 166 | Broad-film train/validation/test; partial/ambiguous cases quarantined for challenge evaluation |
| Wrist background collection | 12,312 | Train/validation/test |
| Independently reviewed VinDr lumbar hardware films | 149 | External evaluation only, 118 studies |

| Partition | Cervical lateral | Lumbar lateral | Full-spine lateral | Lumbar AP | Other | Total |
|---|---:|---:|---:|---:|---:|---:|
| Training | 3,472 | 3,730 | 239 | 3,730 | 11,904 | 23,075 |
| Validation | 748 | 800 | 46 | 800 | 196 | 2,590 |
| Test | 743 | 775 | 47 | 775 | 212 | 2,552 |
| External | 0 | 149 | 0 | 0 | 0 | 149 |
| PMC challenge | 0 | 0 | 70 | 0 | 0 | 70 |

Source case identifiers group BUU paired projections, CSXA identifiers, PMC article identifiers, wrist identifiers, and VinDr studies. Full-spine filenames are the available source identifiers; complete patient identities were unavailable. Group identities and exact pixel hashes are joined before splitting. Near-duplicate candidates also join if their 64-bit difference hashes differ by at most 3 bits, aspect ratios differ by less than 5%, and 32px letterboxed thumbnail mean absolute intensity difference is under 5/255. This is a leakage precaution, not proof that every same-patient or near-duplicate relationship is known.

Groups receive deterministic 70/15/15 split assignments. Reserved external and ambiguous PMC groups take precedence; this moves seven otherwise broad PMC panels into the 70-image challenge partition. Exact duplicates retain one record. Source membership and counts are recorded in `view-classifier-data.json`; raw images, patient/study identifiers, and filesystem manifests are not included in the PR.

Model-generated VinDr labels, thoracic/oblique views with uncertain targets, MRI, CT, and synthetic DRRs are not treated as verified training labels. AP cervical is not inferred from an “AP/lateral” series description. A background class composed of wrist films does not establish general out-of-distribution detection. Evaluation uses raster images; the DICOM decode/rescale path has not received an independent classifier accuracy benchmark.

## Aggressive augmentation without changing anatomical coverage

Training uses horizontal flips; ±15° rotations **with an expanded canvas**; up to 48px independent padding on each edge; contrast 0.4–2.0; brightness 0.5–1.6; gamma 0.5–1.8; Gaussian blur; grayscale noise; JPEG quality 35–95; and occasional intensity inversion. The whole transformed canvas is fitted back into 224px.

There are **no random crops, zoom-in transforms, clipping translations, erasing, or CutMix**. A full-spine image never becomes a lumbar-only image through geometric augmentation. A geometric regression test checks that all four source corner markers survive the rotation-and-padding path. Real full-spine augmentation examples were also visually inspected. Strong appearance changes can reduce visible detail; those effects are deliberately part of robustness training.

## Training and evaluation

Training starts afresh from ImageNet initialization, not the pilot classifier. AdamW uses learning rate 0.0003, weight decay 0.01, label smoothing 0.05, a cosine schedule, batch size 64, and a class-balanced sampler for 12 epochs. The manifest contains all eligible training images; balanced sampling oversamples rare full-spine examples. The seed is 42. CUDA kernels may introduce small run-to-run differences.

Validation balanced accuracy selects the checkpoint. Temperature and the abstention threshold are also selected using validation only. The nominal confidence target is empirical and is not an accuracy guarantee or a clinically calibrated probability. Test, external, and challenge examples do not select the checkpoint or threshold.

### Final measured results

| Evaluation | Correct top-class predictions | Automatic lateral routes | Correct automatic routes |
|---|---:|---:|---:|
| Standard held-out test | 2,552 / 2,552 (100%) | 1,565 | 1,565 / 1,565 |
| Same test films, one fixed strong augmentation each | 2,552 / 2,552 (100%) | 1,565 | 1,565 / 1,565 |
| External VinDr lumbar hardware | 144 / 149 (96.6%) | 144 | 141 / 144 (97.9%) |
| Partial PMC challenge, coarse-label agreement | 65 / 70 (92.9%) | 65 | 64 / 65 (98.5%) |

The 987 standard-test manual selections are all AP lumbar or other-view cases; they are intentionally not routed to lateral measurement models. External errors include three lumbar hardware images called full spine and two called AP. Four of the five PMC disagreements fall below threshold; one partial film is confidently called lumbar. These failures were visually inspected and remain unresolved. The harder external results should temper the perfect internal scores; source-specific appearance may make the internal task easier.

The selected temperature is 0.5 and routing threshold 0.70. Training plus export/evaluation took 502 seconds on Tower. Median warmed ONNX CPU inference was 5.07 ms (two threads, 30 runs); this excludes file decoding and downstream segmentation. The maximum PyTorch/ONNX logit difference on the real-image export check was 2.87e-6. No thresholds or weights were changed in response to test or stress-test results.

Detailed measured results are recorded in `view-classifier-metrics.json` and `view-classifier-stress-metrics.json`. The limited/partial PMC challenge has a coarse broad-spine source label, not independently adjudicated region ground truth. Report its agreement separately from the ordinary held-out test result; do not combine it into a single headline accuracy.

## Reproduce

Use Python with PyTorch, torchvision, Pillow, NumPy, scikit-learn, ONNX, and ONNX Runtime. No dataset is downloaded by these scripts.

```sh
python tools/view-classifier/prepare_full_spine.py \
  --images /path/to/full-spine-images --out /path/to/fullspine-cache \
  --cache-prefix /path/on/training-host/fullspine-cache
# Copy that cache and its manifest to the training host when needed.
python tools/view-classifier/prepare.py \
  --data-root /path/to/verified-collections \
  --pmc-root /path/to/reviewed-pmc-data \
  --full-spine-cached-manifest /path/to/fullspine-cache/manifest.json \
  --out /path/to/prepared
CUDA_VISIBLE_DEVICES=1 python tools/view-classifier/train.py \
  --manifest /path/to/prepared/manifest_all.json --out /path/to/run --epochs 12
```

The preparation adapters explicitly identify the local collection layout and provenance. Adapt paths, not clinical labels, for another installation. The full-spine cache includes source pixel hashes calculated before downsampling. The exported ONNX output is checked against the real-image PyTorch output before use. For the fixed augmentation stress test (no tuning):

```sh
python tools/view-classifier/stress_test.py \
  --manifest /path/to/prepared/manifest_all.json --run /path/to/run
```

## Verification

- 615 renderer/desktop tests passed.
- 77 focused backend tests passed, covering legacy defaults, method dispatch, manual overrides, HTTP preview, invalid inputs, model integrity, and preservation of all four image corners under augmentation geometry.
- A real held-out cervical film was imported into an isolated desktop profile. With Region set to Auto, Fast classifier selected cervical; the real cervical detector/HRNet ran, restored its overlay to the original film, and saved classifier provenance. The overlay was visually inspected. This is an integration check, not validation of the landmark measurements' accuracy. No scale reference was found for that image, so SVA remained in pixels.
- The existing installed app's study library was not modified. A new packaged Windows build is not validated by the local macOS preview.
