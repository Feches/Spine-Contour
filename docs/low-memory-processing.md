# Processing modes and progress

Choose **Settings → Processing → Low memory** on computers with limited RAM.
The setting is saved separately from the study library and applies to individual
images, batches and calibration OCR. Model choices are preserved. Settings cannot
change in the middle of a prediction or batch.

| Behavior | Standard | Low memory |
|---|---|---|
| Search regions per detector call | Up to 8 | 1 |
| Model cache | Reuse all selected models | Reuse current model; unload before the next model |
| CPU threads | Existing PyTorch setting | 2 by default; choose 1, 2 or 4, capped to available CPUs |
| OCR limit per pass | 8 seconds | 60 seconds |
| Model resolution | 768 × 768 | 768 × 768 |
| Search regions, thresholds, HRNet presence check | Full pipeline | Same full pipeline |
| Inference total deadline | None while heartbeat connection is healthy | Same |

The operating system/runtime can retain allocated memory after a model is freed.
This mode reduces concurrent model/crop allocations; it does not guarantee a fixed
RAM ceiling. One model and its activations must still fit in memory. Accelerators
remain selected automatically as before; CPU thread controls do not throttle a GPU.

## What progress means

The backend reports reading/preparing the image, loading a model, the actual count
of candidate regions checked, selected/refined crop inference, vertebral corner
extraction, femoral fitting/measurements, overlay encoding and calibration OCR.
Counts are local to their named stage: 85 regions checked does not mean the whole
image is finished. Crop refinement can legitimately run a model again.

Elapsed time comes from a monotonic backend clock. Heartbeats every two seconds
advance elapsed time without inventing progress. The desktop's sixty-second idle
connection timeout detects a lost worker; it is not a total processing limit.
Startup allows ten minutes. Standalone calibration also uses a heartbeat stream,
so extra ruler-guided OCR passes are not cut off by a total request deadline.

**Cancel processing** discards the pending result, keeps any previous result for that
study, and stops the remainder of a batch. Cancellation is cooperative between model
calls, search chunks and OCR passes; an executing native operation finishes first.
A new image can wait for that operation to release the worker. Batch **Stop** instead
finishes and saves the current image. Saved earlier batch results are retained.

The legacy JSON `/predict` endpoint is retained. Desktop progress uses the new
NDJSON `/predict-stream` endpoint; transport and control remain in Electron's main
process, with no new renderer network permission or npm runtime dependency.

## Validation

- Tests compare every prepared search region and the selected crop between modes.
- Cache ownership tests verify only one model remains alive before the next loads,
  while S1 is reused across search windows. Thread settings are restored after errors.
- API tests compare standard JSON predictions against both streaming modes on partial
  anatomy, for U-Net and HRNet, including absent femoral heads and null measurements.
- Transport tests cover fragmented UTF-8, heartbeats exceeding an idle deadline in
  total elapsed time, cancellation, stream errors/truncation and an unresponsive worker.
- Real-file CPU comparisons can be reproduced on macOS/Linux with
  `python tools/benchmark_processing.py --output /tmp/benchmark.json image.webp ...`.
  Each mode/file runs in a fresh process; results include peak resident memory,
  elapsed time, source/overlay hashes, geometry, measurements and stage events.
  These local files contain measurement data and should not be attached to a PR.

Resource benchmarks and desktop verification results for this change are recorded
in the pull request. Three local examples exercise software equivalence, not an
anatomical accuracy validation set or a minimum supported hardware specification.

### Measured CPU comparison for v1.0.2

Three local examples were run in fresh macOS processes with GPU use disabled,
U-Net selected, four threads in Standard and two in Low memory. Peak RSS includes
Python, libraries, models and image processing. These are observations on one
workstation, not guaranteed memory requirements or processing times.

| Example | Standard peak RSS (MiB) | Low-memory peak RSS (MiB) | Reduction | Standard time (s) | Low-memory time (s) |
|---|---:|---:|---:|---:|---:|
| 1 | 7,061.6 | 2,406.7 | 65.9% | 47.93 | 48.52 |
| 2 | 6,940.6 | 2,651.0 | 61.8% | 42.85 | 48.86 |
| 3 | 6,908.6 | 2,488.6 | 64.0% | 43.94 | 55.52 |

All three comparisons produced exactly matching geometry, measurements, calibration
and encoded source/segmentation image hashes. An additional HRNet comparison on
example 1 also matched every output, with peak RSS falling from 6,314.8 to 2,667.7
MiB (57.8%). Timing varies with caching, system load, hardware and model choice.

Desktop regression uses `tools/smoke/smoke-processing.mjs` with local image paths in
an isolated profile. It checks saved settings, actual search counts, stable DOM
nodes during progress, disabled settings during a batch, cancellation of a new run
and a re-run, batch completion on partial anatomy, disk persistence and reload.
