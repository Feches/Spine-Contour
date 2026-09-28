# GPU processing

**Settings → Processing → Processor** chooses where the models run: the CPU (the
default), or a GPU the bundled ONNX Runtime can use. On 64-bit Windows that is any
DirectX 12 graphics card — NVIDIA, AMD or Intel — through the installed display
driver. Nothing else needs to be installed: no CUDA, no cuDNN, no model download.
macOS lists only the CPU.

## Why a Windows or NVIDIA GPU preference changes nothing

The models run in the backend process, `resources\backend-runtime\spine-contour-backend.exe`,
which `main.js` starts; `Spine-Contour.exe` is only the window. Until this setting,
the installer shipped the CPU-only `onnxruntime` package and every model session
asked for `CPUExecutionProvider`, so there was no GPU code to switch to.

**Windows Settings → Display → Graphics** and the NVIDIA app's per-program preferred
graphics processor choose which GPU draws a program's graphics. They cannot move
a CPU library's arithmetic to a GPU, and a preference set on `Spine-Contour.exe` does
not apply to the backend executable. Neither is needed now: the Processor setting
names the GPU directly.

## What the setting does

The Windows x64 installer bundles `onnxruntime-directml` (the same ONNX Runtime
release, 1.24.4, built with the DirectML execution provider). The backend lists the
CPU and each hardware GPU ONNX Runtime reports (`GET /processors`), and Settings shows
them by name. Windows' software renderer, the Microsoft Basic Render Driver, is never
offered: DirectML refuses it, and a machine without a GPU driver can report it as one. The choice is saved with the other processing settings in
`performance.json` as `processor`: `cpu`, or the card's PCI identity,
`gpu:<vendor>:<device>` in hexadecimal (`gpu:10de:2520`; `:2`, `:3`… for identical
cards). DirectML opens a GPU by its Windows adapter index, which can change while the
app is open (a display moved to the other card, the Windows graphics preference
changed), and ONNX Runtime reads its device list only once. So the index is never
saved: each run finds the chosen card by its identity in Windows' current adapter
list (DXGI), and a card that has gone is reported as not found. The list Settings
shows is read when the app starts; restart it after adding a GPU or installing its
driver. Existing preferences read as `cpu`. The setting applies to the next single
run or batch and is locked while processing, like the others. Calibration OCR always
uses the CPU.

A GPU session is created with `DmlExecutionProvider` for that adapter, then
`CPUExecutionProvider`. ONNX Runtime runs any operator DirectML lacks on the CPU
inside the same session: all six graphs are ONNX opset 17, within DirectML's limit,
and the S1 detector's detection loop and non-maximum suppression are the parts
expected to stay on the CPU. Memory patterns are off for GPU sessions (DirectML does
not support them). Low memory still keeps one model session resident at a time.

If DirectML cannot create or run a model's session — a driver reset, an operator
the card rejects, too little GPU memory — that model is retried once on the CPU and
the progress line says so. (ONNX Runtime's own silent retry is turned off so the
backend can report it.) A cached session then stays on the CPU until the
processing settings change or the app restarts; Low memory, which reloads each
model, tries the GPU again next time. A CPU error is never retried. If the saved GPU is not
found (removed, disabled, no driver), the run uses the CPU and says so; Settings
keeps showing the saved choice as **Saved GPU · not found** rather than silently
changing it.

## Checking where a result ran

- While a film processes, the sidebar shows the model loading on the GPU by name,
  and says so when a model or the whole run falls back to the CPU.
- A result processed with this version ends its Analysis header with **GPU**,
  **GPU + CPU** (some models fell back) or **CPU**; hover it for the GPU's name or
  the reason. This comes from the providers each model's session actually recorded,
  never from the setting. Older results show nothing.
- Each saved result keeps `qc.processing.providers` (per model) and
  `qc.processing.processor = {requested, resolved, name, note}`.
- Windows Task Manager: on **Processes**, `spine-contour-backend.exe` shows GPU use,
  and its **GPU engine** column (right-click the header to add it) names the card's
  3D engine, for example `GPU 1 - 3D`. On **Performance**, that GPU's **3D** graph and
  dedicated memory rise. DirectML submits through a Direct3D 12 graphics queue, so
  the work appears under 3D rather than Compute.
- `"<install folder>\resources\backend-runtime\spine-contour-backend.exe" --verify-models`
  runs every model on the CPU, then the vertebra model on each GPU, and prints JSON
  with `gpus` and `gpu_providers` (`["DmlExecutionProvider", "CPUExecutionProvider"]`
  means the GPU ran it).

## GPU and CPU results

GPU arithmetic is float32 like the CPU's but not bit-identical, so a mask edge or
landmark can move by a pixel and a measurement can differ slightly. The export
parity checks validate the ONNX CPU path, which is why the CPU stays the default.
Results record where they ran; review GPU results as usual. How much faster a GPU
is depends on the card and the film, and an integrated GPU may not beat the CPU.

## Development and packaging

`backend/requirements.txt` selects `onnxruntime-directml` on 64-bit Windows and
`onnxruntime` everywhere else. The two install into the same `onnxruntime` package
directory, so pip cannot swap one for the other in place. In an existing Windows
virtual environment:

```sh
pip uninstall -y onnxruntime onnxruntime-directml
pip install -r backend/requirements-export.txt
```

`run.py` does this itself whenever `requirements.txt` changes. The installer
workflows need no change: `--collect-all onnxruntime` bundles `DirectML.dll` beside
ONNX Runtime, which loads it from there rather than the older copy in `System32`.
`tools/packaging/check_bundled_inference.py` fails a Windows build whose frozen
backend lacks `DmlExecutionProvider` or `DirectML.dll`. The installed backend grows
by about 34 MB (`DirectML.dll` and the larger DirectML build of ONNX Runtime).

GitHub's Windows runners have no GPU, so CI proves the DirectML bundle and the CPU
path only. The GPU path is checked on a workstation: `--verify-models` as above,
then one film with the GPU selected.

Microsoft has put DirectML in sustained engineering: it remains supported, and new
work goes to Windows ML (`onnxruntime-windowsml`). Moving there later would change
the package, not the setting or the saved ids.
