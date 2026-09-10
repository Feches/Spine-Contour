# ONNX inference and crop localization

## Choosing the image extent

**Crop localizer On** is the default, including for old saved preferences. Full-spine
images need this search to locate the lumbar region at the scale used during training.
Every candidate region and existing crop acceptance safeguard is retained.

**Crop localizer Off** skips model-based search and S1-based reframing.
It removes broad near-black screenshot borders with the existing fast pixel-based
cleanup, then runs the selected models once on the visible image extent. Use it for lumbar-only
images already framed around the anatomy. This saves the repeated detector calls;
it does not turn off S1 measurements or femoral detection. Full-spine images can make the lumbar anatomy too small with this setting Off.

The setting applies to the next single run or batch, persists across restarts and
cannot change during processing. Calibration always uses the original image.
`qc.framing` and `qc.processing` record localization choice and runtime provenance.
Missing anatomy remains absent, and dependent measurements remain null.

## Runtime and resource policy

All four original models are exported as float32 ONNX graphs at the trained 768-square
resolution. There is no quantization or retraining. S1's exported graph keeps only
the highest-scoring box after the unchanged box scoring/NMS stage, before its
keypoint head. The original application also consumed only that box; tests compare
against the original five-box checkpoint path. Empty detections are supported.

HRNet includes the original subpixel heatmap decoder, without a new half-pixel
offset. Its vertebral presence evidence still comes from the U-Net. Input
normalization, output coordinate restoration and geometry calculations are preserved.

ONNX Runtime uses sequential graph execution, optimized graphs, no idle thread
spinning, and one image per detector call. Standard mode caches models and uses up
to four ONNX CPU threads. On macOS, the S1 detector additionally uses CoreML's CPU
implementation for static graph partitions. Dynamic/empty detections remain on
the ONNX CPU provider. CoreML manages its own CPU threads; it does not use reduced
precision GPU/Neural Engine execution here. If Apple compilation or execution fails,
the session switches to ONNX CPU and records the providers actually used.

Low memory uses the selected 1–4 CPU threads (default two), disables CPU memory
arenas/patterns and keeps only the current model session resident. It uses ONNX CPU
directly on both platforms, retaining control of its thread count. This may take
longer, especially with localization On. The operating system can retain freed
memory; there is no fixed RAM ceiling. Healthy long jobs retain their heartbeats.

Compiled Apple graphs are cached in the application's `onnx-cache` directory under
the ONNX file's SHA-256, runtime version and provider configuration. Export/weight
changes cannot reuse an older compilation. The cache contains models, not images.
Inference is offline and runtime telemetry is disabled.

## Development and packaging

```sh
python -m pip install -r backend/requirements-export.txt
git lfs pull
python tools/export_onnx.py
python -m pytest backend/tests -q
node --test test/*.test.js
```

`requirements.txt` contains runtime dependencies; `requirements-export.txt` adds
pinned training/export libraries and test dependencies. `backend/models/training.py`
owns PyTorch builders, and importing the application backend does not import them.
Generated graphs/manifests in `backend/onnx/` are ignored by Git. Export reads the
existing trusted `.pt` checkpoints, checks ONNX graph validity, compares random/blank
inputs against PyTorch, and records source/output SHA-256 plus library versions.

All installer workflows export before tests. PyInstaller includes ONNX Runtime and
graphs but excludes Torch, torchvision, timm, segmentation-models-pytorch and `.pt`
files. `check_bundled_inference.py` executes all four graphs in the frozen executable,
checks output shapes/finite values and verifies model hashes. Existing bundled OCR,
desktop source/version and packaging allowlist checks remain required. The numbered
release still waits for both operating-system installers.

## Validation and performance

Automated coverage includes model output parity, empty detections, partial L1-only
films with/without S1, absent femoral heads, localization bypass, settings migration,
streaming/legacy parity, session lifetime/settings, and actual bundled inference.
`tools/smoke/smoke-onnx-localizer.mjs` covers real desktop settings, saved Off state,
batch processing without search, actual ONNX provenance, restoring On, and cancellation.

Local benchmarks use `tools/benchmark_processing.py --localizer on|off`, with
`--reference-repo /path/to/original/worktree` for fresh-process PyTorch comparisons.
The output includes inference time (through landmark extraction), total processing
time, peak resident memory, masks, calibration, geometry and measurements. The JSON
contains local measurement data; do not attach it or source images to a PR.

Turning localization Off changes the input, so compare PyTorch and ONNX with the
same setting for output parity. Compare On/Off timing separately; do not claim their
measurements must be identical. Timing depends on hardware and available anatomy.
Three local examples are software regression cases, not a clinical accuracy dataset.

Implementation references: [ONNX Runtime thread controls](https://onnxruntime.ai/docs/performance/tune-performance/threading.html),
[CoreML provider configuration](https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html),
and [PyTorch ONNX export](https://docs.pytorch.org/docs/stable/onnx.html).
