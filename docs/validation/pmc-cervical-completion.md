# Cervical output completion on PMC images

The anatomical cervical model returned landmarks without manual orientation on all
202 PMC cervical images and all 202 horizontally mirrored copies. Complete
in-bounds output increased from 255/404 (63.1%) to 391/404 (96.8%).

| Pipeline | Image orientation | Any endplate output | Complete C2–C7 output | Partial output | No output |
|---|---|---:|---:|---:|---:|
| Previous automatic orientation + detector + HRNet | Original | 128/202 | 127/202 | 1/202 | 74/202 |
| Previous automatic orientation + detector + HRNet | Mirrored | 128/202 | 128/202 | 0/202 | 74/202 |
| Anatomical HRNet | Original | 202/202 | 195/202 | 7/202 | 0/202 |
| Anatomical HRNet | Mirrored | 202/202 | 196/202 | 6/202 | 0/202 |

All 148 previous-pipeline no-output requests returned HTTP 422 asking the user to
select orientation because the orientation classifier was uncertain. Both
pipelines were tested through the actual `/predict` route with cervical region
and lateral view supplied, and no manual orientation. This comparison therefore
tests cervical processing, not automatic body-region classification. All image
versions were included; none were excluded after inspecting model output.

“Complete” means all 11 noncollapsed endplate pairs and the C2 centroid are within
the image. “Partial” means at least one endplate pair exists but that complete
criterion fails. These are landmark outputs, not pixel segmentation masks.
The new model supplied complete output in both orientations for 194/202 source images.

## Evidence and limitations

The collection contains 202 native-resolution crops from PMC figures, including
142 images with hardware. It is the cervical portion of
`pmc_cervical_202_lumbar_109_clean.zip`. Mirrored copies are paired transformations,
not independent patients. Multiple images can come from the same article or
patient. This collection was not used to train the anatomical cervical model;
patient independence across all source collections has not been established.

No reference landmark annotations were available for this comparison. Visual
inspection of recovered and partial cases found plausible predictions as well as
misplaced landmarks on difficult postoperative, cropped, or low-resolution images.
An output meeting the completeness rule can still be anatomically wrong. The
100% output rate must not be interpreted as 100% accuracy or automatic suitability
for measurement. The model does not yet reliably reject unrelated images or
withhold every invisible anatomical landmark.

The anatomical model uses the epoch-87 checkpoint fine-tuned on CSXA4963 + QOD204,
with 20 QOD validation patients used for checkpoint selection. Its ONNX SHA-256 is
`54ea239b9744320c7d6e8957343b2c3d17cd48f3045932cd359ffc6a127c3e78`.
The previous baseline is the automatic-orientation implementation in the
`codex` orientation checkout, based on commit
`b66b8ca2370e649d6d79c9943cf16c8e314b8f66`, including its local orientation integration.
Exact backend hashes and model hashes are recorded in the accompanying provenance.

Per-request output counts are in [pmc-cervical-completion.csv](pmc-cervical-completion.csv).
Run `tools/benchmark_cervical_completion.py` separately against each checkout,
using the same directory of 202 cervical PNGs and a fresh output directory:

```sh
python tools/benchmark_cervical_completion.py --app-root /path/to/checkout \
  --images /path/to/cervical --output /path/to/results
```

The benchmark records input, backend, and model hashes. Raw images are not bundled
with this report. The final anatomical graph is bundled through Git LFS; normal
packaging verifies its checksum, while checkpoint re-export requires real-image
parity checks.

Validation: 780 backend tests passed (3 skipped), 976 frontend tests passed, and
15 desktop checks passed on each of an original PMC image and its mirrored copy,
including the hidden cervical orientation selector and measurement editing.
