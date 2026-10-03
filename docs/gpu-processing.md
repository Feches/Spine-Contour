# Processor selection and GPU parity

Choose **Settings → Processing → Processor**. CPU is the default and validated
reference path. Windows x64 offers hardware DirectX 12 adapters through the
bundled ONNX Runtime 1.24.4 DirectML provider; CUDA is not required. macOS,
including Apple Silicon, keeps the existing CPU path (with CPU-only Core ML
acceleration for the S1 detector in standard mode). This change does not enable
Apple GPU inference.

A Windows graphics preference controls drawing, not model inference. Choose the
inference processor inside Spine-Contour. Its PCI identity is saved, and each
request resolves that identity against the current DXGI adapter order. If the
identity cannot be verified, processing uses the CPU with an explanation. Settings
retries discovery and retries again when reopened. Restart after installing a new
driver or adding hardware.

## Qualification and fallback

DirectML vendor metacommands are disabled with `disable_metacommands: "True"`.
The review attached to [issue #40](https://github.com/Feches/Spine-Contour/issues/40)
found Intel UHD 770 metacommands exceeded export tolerance and moved a landmark
2.74 pixels and a measurement 0.28 degrees. Disabling them passed the reported raw
checks on that Intel GPU and an RTX 4070. These are historical measurements, not a
validation of every driver or of this revision. Integrated GPUs can be slower than
CPU inference.

Before a GPU processes a film, all six models must pass a local numerical check:

- finite outputs with matching shapes/dtypes and `abs(gpu - cpu) <= .002 + .002 * abs(cpu)`;
- repeated GPU runs against the CPU reference;
- decoded mask agreement of at least 99.99%, unchanged vertebral corners,
  HRNet/S1 coordinates within .05 model pixels, identical cervical heatmap peaks,
  and cervical detector presence/query/box checks;
- bit-identical CPU outputs under the GPU memory-pattern policy;
- an ONNX Runtime profile showing actual DirectML node execution for each model;
- an additional low-memory pass for vertebra and S1.

The appearance encoder (`embed.onnx`) always runs on the CPU provider, whatever the
processor setting, and is not part of qualification.

The inputs are numerical probes (zero, blank/preprocessed, seeded noise and smooth
arrays, plus both cervical detector aspect ratios). They are not evidence of
segmentation accuracy on radiographs. Qualification can take several minutes. Its
verdict is cached only for the backend lifetime and keyed by GPU identity, adapter,
live Windows driver versions, ONNX Runtime version and model hashes. A changed
key reruns it. If driver versions cannot be read, the verdict is not cached.
A failed check refuses GPU use and processes the film on the CPU.

Any DirectML creation/run error aborts the entire GPU attempt. All cached sessions
and intermediate results are discarded, and the original film is processed again
from decoding, region detection and crop search through measurements on the CPU.
There is no per-call CPU retry within a GPU attempt. CPU errors propagate and
cancellation prevents a restart. The exception is logged; its model and reason
remain in `qc.processing.processor.note`, with `requested` preserving the saved
GPU and `resolved` set to `cpu`. A toast makes the fallback visible even when the
progress line advances immediately.

## Verification on a Windows workstation

Run the installed backend:

```text
spine-contour-backend.exe --verify-models
spine-contour-backend.exe --verify-models --gpu gpu:10de:2786 --parity-films films.json
```

In development use `python -m backend.verify_onnx` with the same optional flags.
The final stdout line is a JSON report containing `gpu_parity`, tolerances, hashes,
per-model metrics, node placement and optional film comparisons. Exit 3 means
parity failure; exit 4 means a GPU failed or was not found. CPU/model assertions
retain exit 1. A machine with no GPU reports an empty GPU map and a passing CPU
check; explicitly requesting a missing GPU fails.

The local manifest is a nonempty JSON array, for example:

```json
[
  {"path": "films/lumbar.png", "region": "lumbar", "vertebra_model": "unet", "localizer": true},
  {"path": "films/lumbar.png", "region": "lumbar", "vertebra_model": "hrnet", "localizer": false},
  {"path": "films/cervical.dcm", "region": "cervical", "anterior_side": "left"},
  {"path": "films/standing.png", "region": "full_spine"},
  {"path": "films/standing.png", "region": "auto"}
]
```

Include both cervical orientations, partial anatomy, 8-bit and 16-bit DICOM, both
resource modes, and localizer on/off. Use `mode: "low-memory"` and `cpu_threads`
for the low-memory cases. Every CPU model feed, including search windows and
flipped images, is replayed twice through DirectML. Each film also runs twice
through the production GPU pipeline. Comparisons require matching geometry
structure/anatomy, landmarks within .25 source pixels, measurements within .1
degrees or mm, matching detection/crop behavior, and no CPU fallback. Reports use
source hashes and indices rather than filenames or pixels. Keep reports per
vendor/driver and visually inspect real-film overlays before release. Numerical
qualification alone does not establish real-film parity.

`qc.processing.providers` lists **registered providers**, not a node-execution
trace. A GPU badge means a DirectML session was used, not that every operator ran
on the GPU. Unsupported operators may execute on CPU within that session. The
verification profiler supplies node-placement evidence.

## Packaging and Apple Silicon

The requirements select `onnxruntime-directml` on Windows x64 and `onnxruntime`
on macOS. Both wheels use the same Python package name and must not be installed
together. Packaged verification checks the six models, parity report, DirectML
provider and Windows DLL. GPU-less CI cannot validate a physical GPU. Apple Silicon
must run the CPU checks and real-film smoke test on arm64; its CPU/Core ML policy
is retained. Windows driver qualification does not apply to macOS.
