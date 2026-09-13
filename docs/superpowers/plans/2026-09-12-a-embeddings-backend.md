# Similar Cases and Outcomes — Plan A, the Backend: Appearance Embeddings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `/predict` response carries an `embedding` — two unit vectors from a general image encoder, one of the whole film and one of the crop the models read, plus the film type — computed as one more stage inside the run when the `embeddings` setting is on and never able to fail it; a `POST /embed` computes the same from a stored sidecar image; the encoder is exported to ONNX beside the four structure models with every constant in its metadata, so a swap is a re-export.

**Architecture:** One new module, `backend/embedding.py`, owns preprocessing, the crop, the film type and the record, and reads every constant from `backend/onnx/embed.json`; the graph is loaded, cached and released by the existing `InferenceModel` machinery under the kind `embed`. `runtime.Options` gains `embeddings`; `server.py` gains the stage between `encoding` and `calibration`, the `embedding` response key, `qc.processing.embeddings`, and the `/embed` endpoint. `tools/export_onnx.py` gains the `embed` kind, built by a new `build_embedding_model` in `training.py` from timm's pretrained catalogue; the two verifiers check five graphs.

**Tech Stack:** Python 3.12, FastAPI, numpy, OpenCV, ONNX Runtime 1.24 for the desktop; PyTorch 2.11, timm 1.0.27 and onnx 1.21 for export and parity tests only (`backend/requirements-export.txt`). pytest.

**Spec:** `docs/superpowers/specs/2026-09-12-similar-cases-outcomes-design.md` ("the spec" below; every "§" without a prefix refers to it). Read §5, §6 decisions 4, 5, 10, 13, §7.3 and §10 before starting. Plan B (`2026-09-12-b-similar-cases-renderer.md`) consumes what this plan produces: the `embedding` key, the `embeddings` form field, and `/embed`.

## Global Constraints

Copied from `CLAUDE.md` and the spec. Every task's requirements include these.

- **Desktop inference is ONNX Runtime only.** `backend/embedding.py` imports numpy, OpenCV, `runtime` and `models.models` and nothing else; `test_onnx_runtime.py::test_server_import_does_not_load_training_libraries` pins that importing the server loads no torch, torchvision, timm or segmentation_models_pytorch, and this plan must keep it green. timm and torch appear only in `tools/export_onnx.py`, `backend/models/training.py` and the export-environment tests.
- **Nothing about the encoder is hard-coded outside `embed.json`** (§6 decision 4): input height and width, channels, mean, standard deviation, output dimension and pooling are read from the metadata; a test drives `preprocess` with a different shape, channel count and dimension to prove it.
- **The embedding can never fail a run** (§6 decision 10). Any exception in the stage is logged and the response carries `embedding: null`; `qc.processing.embeddings` records whether one was computed.
- **No fabricated status.** Stages come from `runtime.report`; the new stage is `embedding` with the message `Computing appearance embeddings`, reported before the work, never on a timer.
- **A stored result says what produced it.** Every embedding record names `model.id`, `model.dim`, `model.input` and `model.onnx_sha256`.
- **`/embed` never needs the film file.** Its input is the sidecar's `image_png`, which is the whole toolbar-trimmed film (§5); the crop is that image cut by `framing.window`.
- **Backend tests:** `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend -q` from the worktree root. Never `python` bare — there is no alias on this machine. Record the baseline count before Task 1 in the ledger.
- **The export environment** is the same venv with `backend/requirements-export.txt` installed. `python tools/export_onnx.py --kind embed` downloads the DINOv2 weights from the model hub the first time (about 88 MB, needs the network) and writes `backend/onnx/embed.onnx` and `embed.json`; `backend/onnx/` is gitignored. The parity and real-graph tests skip or assert per the existing pattern when the graph is absent.
- **Both release workflows already run `python tools/export_onnx.py` with no arguments**, so the fifth graph is exported into `backend/onnx/` and shipped by the existing `--add-data`. `--exclude-module timm` stays: timm is export-only. No workflow file changes except the model-count strings, if any.
- **Conventional commit prefixes** (`feat:`, `fix:`, `test:`, `docs:`, `chore:`); commit after every task; every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Write a multi-line message to a file under `tools/smoke/out/` and `git commit -F` it.
- **Branch:** `claude/image-similarity-visualization-400922` in the worktree `C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d`, on `fork/main` at v1.0.8 (the merge of fork PR #21, 2026-09-13; `git merge-base HEAD fork/main` prints the commit). Push only to `fork`, never `origin`; never merge to `main`; never rename onto `ui-redesign-cw`.
- **Subagent models (user instruction, 2026-09-10): the lowest model that completes the task reliably.** Sonnet for Tasks 1, 3, 4, 5 and 6 and their reviews; Opus for Task 2 (the ONNX export of a vision transformer, with its attention and position-embedding subtleties) and its review. Never Fable. Set the model explicitly on every dispatch. A dispatch that runs pytest says "foreground, capture to a file under `tools/smoke/out/`".

## File structure

| File | Responsibility | Status |
|---|---|---|
| `backend/runtime.py` | `Options.embeddings`; `parse_options(..., embeddings=True)` rejects a non-boolean | modify |
| `backend/models/models.py` | `MODEL_NAMES['embed']`, so `_load_model`/`_infer`/`release_models` serve the fifth graph | modify |
| `backend/models/training.py` | `build_embedding_model(source, input_size, pooling)` — the timm encoder, export and test only | modify |
| `tools/export_onnx.py` | `--kind embed` with `--embed-source`, `--embed-input`, `--embed-pool`, `--embed-licence`; `export_embed(...)`; `embed.json`; the no-argument loop exports five | modify |
| `backend/verify_onnx.py`, `tools/packaging/check_bundled_inference.py` | five graphs; the `embed` check runs zeros at its metadata's shape and asserts `(1, dim)` | modify |
| `backend/embedding.py` | `EMBED_KIND`, `load_metadata`, `model_record`, `preprocess`, `crop_window`, `film_type`, `embed`, `embedding_record` | create |
| `backend/server.py` | the `embeddings` form field; the `embedding` stage in `_analyze`; `qc.processing.embeddings`; the `embedding` response key; `embed_request`, `run_embedding`, `POST /embed` | modify |
| `backend/tests/unit/test_embedding.py` | the pure parts of `embedding.py` against a metadata fixture and a fake session | create |
| `backend/tests/integration/test_embedding_graph.py` | the real graph, skipped when it is not exported | create |
| `backend/tests/unit/test_runtime.py`, `backend/tests/integration/test_server.py`, `backend/tests/integration/test_processing_stream.py`, `backend/tests/integration/test_onnx_models.py`, `backend/tests/unit/test_onnx_runtime.py` | extended | modify |
| `docs/appearance-embeddings.md`, `docs/onnx-inference.md`, `CLAUDE.md` | records | create / modify |

Boundaries: `embedding.py` depends on `runtime` and `models.models` only. `server.py` imports `embedding_record` from `embedding.py` and calls it in exactly two places, `_analyze` and `run_embedding`. `training.py` and `tools/export_onnx.py` are the only files that import timm.

## Rulings made while planning (2026-09-12)

Settled with the user at the brainstorm (the spec's §6) or made by the planner against the code and recorded here so the executor does not re-decide them. Each carries what it costs if wrong.

- **Ruling (user): DINOv2 ViT-S/14 at 224, CLS token, cosine; two blocks, crop and whole film; the setting `Appearance embeddings` defaults on; the swap is a re-export.** Spec decisions 4, 5, 10. — Cost if wrong: recorded there.
- **Ruling: the sidecar's `image_png` is the whole toolbar-trimmed film** (`spinopelvic_prediction` returns `"image": _robust_rescale(raw)` at source resolution, `models.py:515`), so `/embed` takes one image and the stored framing, and the crop for both endpoints is `crop_window(image, framing)`. Spec §5 and §10.4 were corrected to say so on 2026-09-12. — Cost if wrong: none; the film file is never needed.
- **Ruling: film type reads `framing.searched` and `framing.whole_film_won`** — `'whole-spine'` when the search ran and the whole film did not win, `'lumbar'` otherwise, `None` without a record. With the localizer off `searched` is false and every film reads `'lumbar'` (§6 decision 5's cost). — Cost if wrong: one function with a table test.
- **Ruling: the stage is reported by the caller, and `_infer` is called with `message=None`**, so the progress event stays `embedding` while the graph loads and runs (`_infer` re-reports the previous progress when its message is None; a load reports `loading · Loading appearance embedding model` between, which is the existing convention for every graph). — Cost if wrong: one string.
- **Ruling: `qc.processing.embeddings` is whether an embedding was computed** (`embedding is not None`), not the setting's value: with the setting on and the graph missing it reads `false`, which is the truth the export needs. — Cost if wrong: one expression.
- **Ruling: the encoder's pooling is chosen in the builder** — timm's `global_pool='token'` for `cls`, `'avg'` for `mean` — and the graph's single output is already pooled, so `embed()` never pools; `pooling` in the metadata is a record, not an instruction the runtime executes. Fused attention is disabled for the export (`timm.layers.set_fused_attn(False)`) so the TorchScript exporter sees plain matmuls. — Cost if wrong: an export flag.
- **Ruling: `weights_sha256` is the SHA-256 over the state dict's tensors in name order**, computed at export time, since the hub's file layout is not ours to depend on. — Cost if wrong: a different but equally verifiable hash.
- **Ruling: a missing graph on `/embed` is a 503 with the export tool's message; an unreadable image is a 422; a `framing` that is not a JSON object is a 422.** — Cost if wrong: status codes.
- **Ruling: `/embed` has no streaming twin.** It runs about a second; the renderer's main process calls it with a plain `fetch`, like `/measure`. — Cost if wrong: a `/embed-stream` is the same five lines `/calibrate-stream` is.
- **Ruling: low-memory mode releases the embed graph after the stage, standard mode keeps it cached** — exactly the policy the structure models follow. — Cost if wrong: one `release_models()` call.
- **Ruling: the `embed` metadata carries `input` as `[height, width]`**, not the other kinds' `size`, because a taller whole-film graph is a named later option (ROADMAP §8). `verify_onnx` reads the shape from it. — Cost if wrong: a key name.
- **Ruling: task order is option → export tool and verifiers → `embedding.py` → the `/predict` stage → `/embed` → records.** The export goes second so the real graph exists for the integration tests from Task 3 on; if the download fails in the executor's environment, every later task still passes on its fakes and the real-graph test skips. — Cost if wrong: a reorder.

---

### Task 1: The `embeddings` option and form field

**Files:**
- Modify: `backend/runtime.py:17-22` (`Options`), `backend/runtime.py:41-50` (`parse_options`)
- Modify: `backend/server.py:84-99` (`prediction_request`)
- Test: `backend/tests/unit/test_runtime.py`, `backend/tests/integration/test_server.py`

**Interfaces:**
- Consumes: `runtime.Options` (frozen dataclass), `runtime.parse_options`, FastAPI `Form`.
- Produces (binding on Tasks 4 and 5, and on Plan B): `Options.embeddings: bool` (default `True`); `parse_options(mode, cpu_threads, crop_localizer, toolbar_removal, embeddings=True)` raising `ValueError("Appearance embeddings must be on or off")` for a non-boolean; the `/predict` and `/predict-stream` form field `embeddings` (`true`/`false`, default `true`).

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/unit/test_runtime.py`:

```python
def test_embeddings_option_defaults_on_and_rejects_non_booleans():
    assert runtime.parse_options().embeddings is True
    assert runtime.parse_options('standard', 2, True, False, False).embeddings is False
    assert runtime.parse_options('low-memory', 1, embeddings=True).embeddings is True
    for bad in ('no', 0, 1, None):
        with pytest.raises(ValueError, match='Appearance embeddings must be on or off'):
            runtime.parse_options('standard', 2, True, False, bad)
```

Append to `backend/tests/integration/test_server.py`:

```python
def test_predict_endpoint_rejects_a_non_boolean_embeddings_field():
    upload = io.BytesIO()
    Image.fromarray(np.full((24, 16), 127, dtype=np.uint8)).save(upload, format="PNG")
    response = TestClient(server.app).post(
        "/predict",
        data={"modality": "xray", "body_part": "lumbar", "view": "lateral", "embeddings": "maybe"},
        files={"file": ("radiograph.png", upload.getvalue(), "image/png")},
    )
    assert response.status_code == 422
```

- [ ] **Step 2: Run the two suites to verify they fail**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend/tests/unit/test_runtime.py backend/tests/integration/test_server.py -q`
Expected: the runtime test FAILS with `TypeError: parse_options() takes from 0 to 4 positional arguments` (or an `AttributeError` on `.embeddings`); the server test FAILS because an unknown form field is ignored today and the request proceeds past validation.

- [ ] **Step 3: Implement the option**

In `backend/runtime.py`, replace the `Options` dataclass and `parse_options` with:

```python
@dataclass(frozen=True)
class Options:
    mode: str = "standard"
    cpu_threads: int = 2
    crop_localizer: bool = True
    toolbar_removal: bool = False
    # Appearance embeddings during /predict (similar-cases spec, 2026-09-12, section 10.6).
    # Off skips the stage entirely; /embed ignores this and always runs.
    embeddings: bool = True

    @property
    def low_memory(self):
        return self.mode == "low-memory"

    @property
    def inference_threads(self):
        return self.cpu_threads if self.low_memory else min(4, os.cpu_count() or 1)

    @property
    def search_batch(self):
        # The ONNX detector has a fixed batch of one in both resource modes.
        return 1

    @property
    def ocr_timeout(self):
        return 60 if self.low_memory else 8


def parse_options(mode="standard", cpu_threads=2, crop_localizer=True, toolbar_removal=False, embeddings=True):
    if mode not in ("standard", "low-memory"):
        raise ValueError("Processing mode must be standard or low-memory")
    if isinstance(cpu_threads, bool) or not isinstance(cpu_threads, int) or not 1 <= cpu_threads <= 4:
        raise ValueError("CPU threads must be an integer from 1 to 4")
    if not isinstance(crop_localizer, bool):
        raise ValueError("Crop localizer must be on or off")
    if not isinstance(toolbar_removal, bool):
        raise ValueError("Toolbar removal must be on or off")
    if not isinstance(embeddings, bool):
        raise ValueError("Appearance embeddings must be on or off")
    return Options(mode, min(cpu_threads, os.cpu_count() or 1), crop_localizer, toolbar_removal, embeddings)
```

In `backend/server.py`, in `prediction_request`, add the field after `toolbar_removal` and pass it through:

```python
async def prediction_request(
    file: UploadFile = File(...), modality: str = Form(...), body_part: str = Form(...),
    view: str | None = Form(None), laterality: str | None = Form(None),
    vertebra_model: str | None = Form(None), femoral_model: str | None = Form(None),
    s1_model: str | None = Form(None), calibration: str | None = Form(None),
    processing_mode: str = Form("standard"), cpu_threads: int = Form(2),
    crop_localizer: bool = Form(True),
    toolbar_removal: bool = Form(False),
    embeddings: bool = Form(True),
):
    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if not payload:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The uploaded file exceeds 50 MB")
    try:
        settings = runtime.parse_options(processing_mode, cpu_threads, crop_localizer, toolbar_removal, embeddings)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"settings": settings, "payload": payload, "modality": modality, "body_part": body_part,
            "view": view, "laterality": laterality, "vertebra_model": vertebra_model,
            "femoral_model": femoral_model, "s1_model": s1_model, "calibration": calibration}
```

FastAPI parses `embeddings` as a boolean form field, so `maybe` is a 422 before the handler runs; `true`/`false`/`1`/`0`/`on`/`off` parse.

- [ ] **Step 4: Run the two suites to verify they pass**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend/tests/unit/test_runtime.py backend/tests/integration/test_server.py -q`
Expected: PASS, every test.

- [ ] **Step 5: Run the whole backend suite and commit**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend -q > tools/smoke/out/a1-pytest.txt 2>&1`
Expected: PASS; the count is the baseline plus two. Record both counts in the ledger.

```bash
git add backend/runtime.py backend/server.py backend/tests/unit/test_runtime.py backend/tests/integration/test_server.py
git commit -F tools/smoke/out/a1-commit.txt
```

Message: `feat(backend): an embeddings option on every run, default on` + a body naming the spec's §10.6 + the trailer.

---

### Task 2: The export tool's `embed` kind, the encoder builder, and the five-graph verifiers

**Files:**
- Modify: `backend/models/training.py` (append `build_embedding_model`)
- Modify: `backend/models/models.py:164-165` (`MODEL_NAMES`)
- Modify: `tools/export_onnx.py` (new `export_embed`, the argument parser, the no-argument loop)
- Modify: `backend/verify_onnx.py:12-30` (`verify`)
- Modify: `tools/packaging/check_bundled_inference.py`
- Test: `backend/tests/integration/test_onnx_models.py`, `backend/tests/unit/test_onnx_runtime.py`

**Interfaces:**
- Consumes: `timm.create_model`, `timm.layers.set_fused_attn`; the existing export pattern in `tools/export_onnx.py` (`torch.onnx.export`, `onnx.checker`, an ONNX Runtime parity check, a metadata JSON beside the graph).
- Produces (binding on Tasks 3 and 5): `backend/onnx/embed.onnx` with input `image` `1×3×H×W` float32 and one output `embedding` `1×dim`; `backend/onnx/embed.json` with keys `kind`, `opset`, `input` (`[H, W]`), `channels`, `dim`, `pooling`, `precision`, `source`, `mean`, `std`, `licence`, `weights_sha256`, `onnx_sha256`, `torch`, `onnx`, `onnxruntime`; `MODEL_NAMES['embed'] == 'appearance embedding model'`; `build_embedding_model(source, (h, w), pooling) -> nn.Module`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/integration/test_onnx_models.py` (torch is already imported at its top):

```python
import json


def test_converted_embedding_model_matches_the_timm_reference():
    from backend.models.training import build_embedding_model
    path = models.ONNX_DIRECTORY / 'embed.onnx'
    assert path.exists(), 'Run python tools/export_onnx.py --kind embed before testing'
    metadata = json.loads(path.with_suffix('.json').read_text())
    assert metadata['kind'] == 'embed' and metadata['channels'] == 3 and metadata['pooling'] in ('cls', 'mean')
    torch.set_num_threads(2)
    reference = build_embedding_model(metadata['source'], tuple(metadata['input']), metadata['pooling']).eval()
    session = models._load_model('embed', (2, True))
    generator = np.random.default_rng(51)
    height, width = metadata['input']
    for value in (np.zeros((1, 3, height, width), np.float32),
                  generator.standard_normal((1, 3, height, width)).astype(np.float32)):
        with torch.inference_mode():
            expected = reference(torch.from_numpy(value)).numpy()
        actual = session.run(None, {'image': value})[0]
        assert actual.shape == (1, metadata['dim']) and expected.shape == actual.shape
        np.testing.assert_allclose(actual, expected, rtol=2e-3, atol=2e-3)
    models.release_models()
```

Append to `backend/tests/unit/test_onnx_runtime.py`:

```python
def test_the_embedding_graph_is_a_known_kind_with_its_own_name():
    assert models.MODEL_NAMES['embed'] == 'appearance embedding model'
    assert set(models.MODEL_NAMES) == {'s1', 'vertebra', 'femoral', 'hrnet', 'embed'}
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend/tests/unit/test_onnx_runtime.py -q`
Expected: FAIL with `KeyError: 'embed'`.

- [ ] **Step 3: Add the kind name**

In `backend/models/models.py`, replace the `MODEL_NAMES` assignment with:

```python
MODEL_NAMES = {"s1": "S1 detector", "vertebra": "vertebra model",
               "femoral": "femoral-head model", "hrnet": "HRNet landmark model",
               # The appearance encoder (similar-cases spec, 2026-09-12, section 10): loaded,
               # cached and released like the four structure models, never offered by /models.
               "embed": "appearance embedding model"}
```

`resolve_models` and `MODEL_CHOICES` are untouched, so `GET /models` does not offer it.

- [ ] **Step 4: Add the encoder builder**

Append to `backend/models/training.py`:

```python
def build_embedding_model(source: str, input_size: tuple[int, int], pooling: str) -> nn.Module:
    """The appearance encoder, from timm's pretrained catalogue (similar-cases spec, 2026-09-12,
    section 10.1). Export and parity tests only; the desktop runs its ONNX graph.

    `source` is a timm model id (stage 1: vit_small_patch14_dinov2.lvd142m, Apache 2.0);
    `input_size` is (height, width), a multiple of the patch size, and timm resamples the
    pretrained position embeddings to it; `pooling` picks the graph's single output: the class
    token ('cls') or the mean over patch tokens ('mean'). Fused attention is turned off so the
    TorchScript exporter sees plain matmuls and softmaxes.
    """
    import timm
    from timm.layers import set_fused_attn

    if pooling not in ("cls", "mean"):
        raise ValueError("pooling must be cls or mean")
    set_fused_attn(False)
    return timm.create_model(source, pretrained=True, num_classes=0, img_size=tuple(input_size),
                             global_pool="token" if pooling == "cls" else "avg")
```

- [ ] **Step 5: Add the export**

In `tools/export_onnx.py`, add `export_embed` after `export` and replace the `__main__` block:

```python
DEFAULT_EMBED_SOURCE = 'vit_small_patch14_dinov2.lvd142m'
DEFAULT_EMBED_INPUT = (224, 224)
DEFAULT_EMBED_POOL = 'cls'
DEFAULT_EMBED_LICENCE = 'Apache-2.0'


def export_embed(destination, source=DEFAULT_EMBED_SOURCE, input_size=DEFAULT_EMBED_INPUT,
                 pooling=DEFAULT_EMBED_POOL, licence=DEFAULT_EMBED_LICENCE):
    """The appearance encoder (similar-cases spec, 2026-09-12, section 10.1). Every constant the
    desktop needs goes into embed.json, so a different network is a different command line."""
    import numpy as np
    import onnx
    import onnxruntime as ort
    import torch
    from backend.models.training import build_embedding_model

    torch.set_num_threads(2)
    height, width = (int(v) for v in input_size)
    network = build_embedding_model(source, (height, width), pooling).eval()
    torch.manual_seed(123)
    sample = torch.rand(1, 3, height, width)
    path = destination / 'embed.onnx'
    destination.mkdir(parents=True, exist_ok=True)
    with torch.inference_mode():
        torch.onnx.export(network, (sample,), str(path), dynamo=False, opset_version=17,
                          input_names=['image'], output_names=['embedding'])
    onnx.checker.check_model(str(path))
    settings = ort.SessionOptions()
    settings.intra_op_num_threads = 2
    session = ort.InferenceSession(str(path), sess_options=settings, providers=['CPUExecutionProvider'])
    dim = None
    for tensor in (sample, torch.zeros_like(sample)):
        with torch.inference_mode():
            expected = network(tensor).numpy()
        actual = session.run(None, {'image': tensor.numpy()})[0]
        assert expected.ndim == 2 and expected.shape[0] == 1, f'unexpected encoder output shape {expected.shape}'
        np.testing.assert_allclose(actual, expected, rtol=2e-3, atol=2e-3)
        dim = int(expected.shape[1])
    weights = hashlib.sha256()
    state = network.state_dict()
    for name in sorted(state):
        weights.update(name.encode('utf-8'))
        weights.update(state[name].detach().cpu().contiguous().numpy().tobytes())
    config = getattr(network, 'pretrained_cfg', {}) or {}
    metadata = {'kind': 'embed', 'opset': 17, 'input': [height, width], 'channels': 3, 'dim': dim,
                'pooling': pooling, 'precision': 'float32', 'source': source,
                'mean': [float(v) for v in config.get('mean', (0.485, 0.456, 0.406))],
                'std': [float(v) for v in config.get('std', (0.229, 0.224, 0.225))],
                'licence': licence, 'weights_sha256': weights.hexdigest(),
                'onnx_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'torch': torch.__version__, 'onnx': onnx.__version__, 'onnxruntime': ort.__version__}
    path.with_suffix('.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(f'Exported and validated embed: {path} ({source}, {height}x{width}, {pooling}, dim {dim})', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kind', choices=['vertebra', 'femoral', 's1', 'hrnet', 'embed'])
    parser.add_argument('--output', type=Path, default=ROOT / 'backend' / 'onnx')
    parser.add_argument('--embed-source', default=DEFAULT_EMBED_SOURCE, help='timm model id of the appearance encoder')
    parser.add_argument('--embed-input', type=int, nargs=2, default=list(DEFAULT_EMBED_INPUT), metavar=('HEIGHT', 'WIDTH'))
    parser.add_argument('--embed-pool', choices=['cls', 'mean'], default=DEFAULT_EMBED_POOL)
    parser.add_argument('--embed-licence', default=DEFAULT_EMBED_LICENCE)
    args = parser.parse_args()
    embed_args = ['--embed-source', args.embed_source, '--embed-input', *map(str, args.embed_input),
                  '--embed-pool', args.embed_pool, '--embed-licence', args.embed_licence]
    if args.kind == 'embed':
        export_embed(args.output, args.embed_source, tuple(args.embed_input), args.embed_pool, args.embed_licence)
    elif args.kind:
        export(args.kind, args.output)
    else:
        # Bound conversion memory; each model is exported in a fresh process.
        import subprocess
        for kind in ('s1', 'vertebra', 'femoral', 'hrnet', 'embed'):
            extra = embed_args if kind == 'embed' else []
            subprocess.run([sys.executable, __file__, '--kind', kind, '--output', str(args.output), *extra], check=True)
```

`hashlib`, `json`, `argparse`, `sys`, `Path` and `ROOT` are already imported at the top of the file.

- [ ] **Step 6: Export the graph**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" tools/export_onnx.py --kind embed > tools/smoke/out/a2-export.txt 2>&1`
Expected: the last line reads `Exported and validated embed: ...embed.onnx (vit_small_patch14_dinov2.lvd142m, 224x224, cls, dim 384)`; `backend/onnx/embed.onnx` is about 88 MB and `embed.json` carries every key listed under Produces. The first run downloads the weights; if the download fails (no network), record it in the ledger, continue with the remaining steps, and note that the real-graph tests skip.

- [ ] **Step 7: Update the two verifiers**

Replace the body of `verify()` in `backend/verify_onnx.py` from `results = {}` to the `models.release_models()` after the loop with:

```python
    results = {}
    with runtime.session(runtime.parse_options('low-memory', 1, False)):
        for kind in models.MODEL_NAMES:
            path = models.ONNX_DIRECTORY / f'{kind}.onnx'
            metadata = json.loads(path.with_suffix('.json').read_text())
            assert metadata['kind'] == kind and metadata['precision'] == 'float32'
            assert hashlib.sha256(path.read_bytes()).hexdigest() == metadata['onnx_sha256']
            if kind == 'embed':
                shape = (1, int(metadata['channels']), *(int(v) for v in metadata['input']))
            else:
                shape = (1, 3 if kind == 's1' else 1, 768, 768)
            output = models._infer(kind, lambda session: session.run(None, {'image': np.zeros(shape, np.float32)}), None)
            assert all(np.isfinite(value).all() for value in output)
            if kind == 's1':
                assert output[0].ndim == 1 and output[1].shape == (len(output[0]), 2, 3)
            elif kind == 'embed':
                assert output[0].shape == (1, int(metadata['dim']))
            else:
                expected = {'vertebra': (1, 6, 768, 768), 'femoral': (1, 1, 768, 768), 'hrnet': (1, 22, 2)}[kind]
                assert output[0].shape == expected
            results[kind] = [list(value.shape) for value in output]
        models.release_models()
```

In `tools/packaging/check_bundled_inference.py`, change the docstring to `"""Run all five ONNX graphs using the frozen executable and its bundled DLLs."""`, the assertion to `assert {'s1', 'vertebra', 'femoral', 'hrnet', 'embed'} <= set(report['verified'])`, and the print to `print('Verified all five bundled ONNX models:', report['verified'])`.

- [ ] **Step 8: Run the verifier and the tests**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m backend.verify_onnx > tools/smoke/out/a2-verify.txt 2>&1`
Expected: one JSON line whose `verified` has five keys, `embed` reading `[[1, 384]]`. (Skip with a ledger note if Step 6 could not download.)

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend/tests/unit/test_onnx_runtime.py backend/tests/integration/test_onnx_models.py -q > tools/smoke/out/a2-pytest.txt 2>&1`
Expected: PASS. `test_server_import_does_not_load_training_libraries` still passes: nothing at runtime imports timm.

- [ ] **Step 9: Commit**

```bash
git add backend/models/models.py backend/models/training.py tools/export_onnx.py backend/verify_onnx.py tools/packaging/check_bundled_inference.py backend/tests/integration/test_onnx_models.py backend/tests/unit/test_onnx_runtime.py
git commit -F tools/smoke/out/a2-commit.txt
```

Message: `feat(backend): export the appearance encoder as the fifth ONNX graph` + the trailer. `backend/onnx/` is gitignored and is not added.

---

### Task 3: `backend/embedding.py`

**Files:**
- Create: `backend/embedding.py`
- Test: `backend/tests/unit/test_embedding.py` (new), `backend/tests/integration/test_embedding_graph.py` (new)

**Interfaces:**
- Consumes: `models._robust_rescale`, `models._infer(kind, operation, message)`, `models.ONNX_DIRECTORY`, `runtime.session`.
- Produces (binding on Tasks 4 and 5):
  - `EMBED_KIND = "embed"`.
  - `load_metadata() -> dict` (cached; `FileNotFoundError` naming `tools/export_onnx.py --kind embed` when absent; `ValueError` when a key is missing).
  - `model_record(metadata) -> {"id", "dim", "input", "onnx_sha256"}`.
  - `preprocess(image, metadata) -> np.ndarray` float32 `1×channels×H×W`.
  - `crop_window(image, framing) -> np.ndarray` (a view of `image`, or `image` itself).
  - `film_type(framing) -> 'whole-spine' | 'lumbar' | None`.
  - `embed(image, metadata=None) -> list[float]` of length `dim`, unit norm, five decimals.
  - `embedding_record(image, framing) -> {"model", "crop", "whole", "film_type"}`.

- [ ] **Step 1: Write the failing unit tests**

Create `backend/tests/unit/test_embedding.py`:

```python
"""backend/embedding.py's pure parts (similar-cases spec, 2026-09-12, section 10.2), against a
metadata fixture and a fake session: nothing here needs the graph."""
import numpy as np
import pytest

from backend import embedding
from backend.models import models

META = {'kind': 'embed', 'input': [32, 48], 'channels': 3, 'dim': 8, 'pooling': 'cls',
        'mean': [0.5, 0.5, 0.5], 'std': [0.25, 0.25, 0.25], 'onnx_sha256': 'abc', 'source': 'fixture'}


def test_preprocess_letterboxes_into_the_metadata_frame_and_normalises():
    # A tall flat film into a 32 x 48 (height x width) frame: scale = min(32/100, 48/50) = 0.32,
    # so it lands 32 high and 16 wide, centred at left = 16; the rest is zero padding.
    image = np.full((100, 50), 200, np.uint8)
    value = embedding.preprocess(image, META)
    assert value.shape == (1, 3, 32, 48) and value.dtype == np.float32
    inside = value[0, 0, :, 24]
    assert np.all(inside == inside[0]) and inside[0] == pytest.approx((200 / 255 - 0.5) / 0.25)
    assert np.all(value[0, 0, :, 0] == pytest.approx((0.0 - 0.5) / 0.25))
    assert np.all(value[0, 1] == value[0, 0]) and np.all(value[0, 2] == value[0, 0])


def test_preprocess_honours_a_different_shape_channel_count_and_normalisation():
    meta = {**META, 'input': [16, 24], 'channels': 1, 'mean': [0.0], 'std': [1.0]}
    value = embedding.preprocess(np.zeros((40, 40), np.uint8), meta)
    assert value.shape == (1, 1, 16, 24)
    assert np.all(value == 0.0)


def test_crop_window_cuts_clips_and_falls_back_to_the_film():
    image = np.zeros((100, 80), np.uint8)
    assert embedding.crop_window(image, {'window': [10, 20, 50, 70]}).shape == (50, 40)
    assert embedding.crop_window(image, {'window': [-10, -5, 500, 500]}).shape == (100, 80)
    assert embedding.crop_window(image, {'window': [10.4, 20.6, 50.0, 70.0]}).shape == (49, 40)
    assert embedding.crop_window(image, {'window': [10, 10, 12, 12]}) is image
    assert embedding.crop_window(image, None) is image
    assert embedding.crop_window(image, {'window': 'nope'}) is image
    assert embedding.crop_window(image, {'window': [0, 0, 'x', 1]}) is image


@pytest.mark.parametrize('framing,expected', [
    (None, None), ({}, None), ('text', None),
    ({'searched': True, 'whole_film_won': False}, 'whole-spine'),
    ({'searched': True, 'whole_film_won': True}, 'lumbar'),
    ({'searched': False, 'whole_film_won': True}, 'lumbar'),
    ({'searched': True}, 'whole-spine'),
])
def test_film_type_reads_the_search_and_who_won(framing, expected):
    assert embedding.film_type(framing) == expected


def fake_session(vector, shapes=None):
    def infer(kind, operation, message):
        assert kind == 'embed' and message is None
        class Model:
            def run(self, names, inputs):
                if shapes is not None:
                    shapes.append(inputs['image'].shape)
                return [np.asarray(vector, np.float32).reshape(1, -1)]
        return operation(Model())
    return infer


def test_embed_normalises_rounds_and_checks_the_dimension(monkeypatch):
    monkeypatch.setattr(models, '_infer', fake_session([3.0] * 8))
    vector = embedding.embed(np.zeros((64, 64), np.uint8), META)
    assert len(vector) == 8 and vector == [round(1 / np.sqrt(8), 5)] * 8
    monkeypatch.setattr(models, '_infer', fake_session([1.0] * 9))
    with pytest.raises(ValueError, match='embed.json says 8'):
        embedding.embed(np.zeros((64, 64), np.uint8), META)
    monkeypatch.setattr(models, '_infer', fake_session([0.0] * 8))
    with pytest.raises(ValueError, match='degenerate'):
        embedding.embed(np.zeros((64, 64), np.uint8), META)


def test_embedding_record_uses_the_crop_then_the_whole_film(monkeypatch):
    shapes = []
    monkeypatch.setattr(models, '_infer', fake_session([1.0] * 8, shapes))
    monkeypatch.setattr(embedding, 'load_metadata', lambda: META)
    record = embedding.embedding_record(np.zeros((200, 100), np.uint8),
                                        {'window': [0, 50, 100, 150], 'searched': True, 'whole_film_won': False})
    assert record['model'] == {'id': 'fixture', 'dim': 8, 'input': [32, 48], 'onnx_sha256': 'abc'}
    assert record['film_type'] == 'whole-spine'
    assert len(record['crop']) == 8 and len(record['whole']) == 8
    assert shapes == [(1, 3, 32, 48), (1, 3, 32, 48)]


def test_load_metadata_names_the_export_tool_when_the_graph_is_missing(monkeypatch, tmp_path):
    embedding.load_metadata.cache_clear()
    monkeypatch.setattr(models, 'ONNX_DIRECTORY', tmp_path)
    with pytest.raises(FileNotFoundError, match='export_onnx.py --kind embed'):
        embedding.load_metadata()
    (tmp_path / 'embed.json').write_text('{"kind": "embed"}')
    embedding.load_metadata.cache_clear()
    with pytest.raises(ValueError, match="missing 'input'"):
        embedding.load_metadata()
    embedding.load_metadata.cache_clear()
```

Create `backend/tests/integration/test_embedding_graph.py`:

```python
"""The real appearance graph, when it has been exported (Plan A Task 2); skipped otherwise."""
import numpy as np
import pytest

from backend import embedding, runtime
from backend.models import models


def test_the_real_graph_returns_unit_vectors_of_the_declared_dimension():
    if not (models.ONNX_DIRECTORY / 'embed.onnx').exists():
        pytest.skip('run python tools/export_onnx.py --kind embed')
    embedding.load_metadata.cache_clear()
    film = np.random.default_rng(3).integers(0, 255, (300, 200), np.uint8)
    with runtime.session(runtime.parse_options('low-memory', 1)):
        record = embedding.embedding_record(film, {'window': [20, 40, 180, 260], 'searched': True, 'whole_film_won': False})
        models.release_models()
    dim = embedding.load_metadata()['dim']
    for key in ('crop', 'whole'):
        assert len(record[key]) == dim
        assert np.isclose(np.linalg.norm(record[key]), 1.0, atol=1e-3)
    assert record['crop'] != record['whole']
    assert record['film_type'] == 'whole-spine'
```

- [ ] **Step 2: Run the unit suite to verify it fails**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend/tests/unit/test_embedding.py -q`
Expected: FAIL at import, `ModuleNotFoundError: No module named 'backend.embedding'`.

- [ ] **Step 3: Write the module**

Create `backend/embedding.py`:

```python
"""Appearance embeddings: one general image encoder, exported to ONNX like the structure models,
run on the whole film and on the crop the models read (similar-cases spec, 2026-09-12, section 10).

Nothing about the encoder is hard-coded here. Input size, channels, mean, standard deviation,
output dimension and pooling all come from backend/onnx/embed.json, so swapping the network is a
re-export, not new code (spec decision 4). The graph is loaded, cached and released by the same
InferenceModel machinery as the four structure models, under the kind "embed".
"""
from __future__ import annotations

from functools import lru_cache
import json

import cv2
import numpy as np

try:
    from . import runtime
    from .models import models
except ImportError:  # Support `uvicorn server:app` from backend/.
    import runtime
    from models import models

EMBED_KIND = "embed"
REQUIRED_KEYS = ("input", "channels", "dim", "pooling", "mean", "std", "onnx_sha256", "source")


@lru_cache(maxsize=1)
def load_metadata() -> dict:
    """embed.json beside the graph. Cached for the process: it changes only with a re-export."""
    path = models.ONNX_DIRECTORY / f"{EMBED_KIND}.json"
    if not path.is_file():
        raise FileNotFoundError(f"Missing embedding metadata: {path}. Run python tools/export_onnx.py --kind embed.")
    metadata = json.loads(path.read_text())
    for key in REQUIRED_KEYS:
        if key not in metadata:
            raise ValueError(f"embed.json is missing '{key}'")
    return metadata


def model_record(metadata: dict) -> dict:
    """What every stored embedding says produced it (spec section 11)."""
    return {"id": str(metadata["source"]), "dim": int(metadata["dim"]),
            "input": [int(v) for v in metadata["input"]], "onnx_sha256": str(metadata["onnx_sha256"])}


def preprocess(image: np.ndarray, metadata: dict) -> np.ndarray:
    """Letterbox the film into the encoder's frame the way the structure models are fed.

    The models' own robust 8-bit rescale, a zero-padded letterbox to metadata['input'] (height,
    width), the one channel repeated to metadata['channels'], scaled to [0, 1] and normalised by
    the encoder's mean and standard deviation. float32, shape 1 x channels x height x width.
    """
    height, width = (int(v) for v in metadata["input"])
    channels = int(metadata["channels"])
    gray = models._robust_rescale(image)
    scale = min(height / gray.shape[0], width / gray.shape[1])
    resized_height = max(1, int(round(gray.shape[0] * scale)))
    resized_width = max(1, int(round(gray.shape[1] * scale)))
    resized = cv2.resize(gray, (resized_width, resized_height), interpolation=cv2.INTER_AREA)
    canvas = np.zeros((height, width), dtype=np.uint8)
    top = (height - resized_height) // 2
    left = (width - resized_width) // 2
    canvas[top:top + resized_height, left:left + resized_width] = resized
    value = canvas.astype(np.float32) / np.float32(255.0)
    stacked = np.repeat(value[None, None], channels, axis=1)
    mean = np.asarray(metadata["mean"], dtype=np.float32).reshape(1, channels, 1, 1)
    std = np.asarray(metadata["std"], dtype=np.float32).reshape(1, channels, 1, 1)
    return ((stacked - mean) / std).astype(np.float32)


def crop_window(image: np.ndarray, framing: dict | None) -> np.ndarray:
    """The film cut by the framing window the models ran on, clipped to the film. The whole film
    when the window is absent, malformed or degenerate (spec section 10.2)."""
    window = framing.get("window") if isinstance(framing, dict) else None
    if not isinstance(window, (list, tuple)) or len(window) != 4:
        return image
    try:
        x0, y0, x1, y1 = (int(round(float(v))) for v in window)
    except (TypeError, ValueError):
        return image
    height, width = image.shape[:2]
    x0, x1 = max(0, min(x0, width)), max(0, min(x1, width))
    y0, y1 = max(0, min(y0, height)), max(0, min(y1, height))
    if x1 - x0 < 8 or y1 - y0 < 8:
        return image
    return image[y0:y1, x0:x1]


def film_type(framing: dict | None) -> str | None:
    """'whole-spine' when the search ran and chose a crop smaller than the film; 'lumbar' when the
    models read the whole film (the search off, or the whole film won); None without a framing
    record (spec section 7.3, decision 5)."""
    if not isinstance(framing, dict) or "searched" not in framing:
        return None
    if framing.get("searched") and not framing.get("whole_film_won"):
        return "whole-spine"
    return "lumbar"


def embed(image: np.ndarray, metadata: dict | None = None) -> list[float]:
    """One unit-length embedding of one image through the bundled graph, rounded to five decimals.
    Reported under whatever stage the caller last reported: _infer re-emits it while loading."""
    metadata = metadata or load_metadata()
    value = preprocess(image, metadata)
    output = models._infer(EMBED_KIND, lambda model: model.run(None, {"image": value}), None)[0]
    vector = np.asarray(output, dtype=np.float32).reshape(-1)
    if vector.shape[0] != int(metadata["dim"]):
        raise ValueError(f"The embedding graph returned {vector.shape[0]} values; embed.json says {metadata['dim']}")
    norm = float(np.linalg.norm(vector))
    if not np.isfinite(norm) or norm == 0.0:
        raise ValueError("The embedding graph returned a degenerate vector")
    return [round(float(v), 5) for v in vector / norm]


def embedding_record(image: np.ndarray, framing: dict | None) -> dict:
    """{model, crop, whole, film_type} for one film (spec section 10.2): `whole` is the film,
    `crop` the framing window cut from it. Raises when the graph or its metadata is missing; the
    callers decide whether that fails anything (never in /predict, a 503 on /embed)."""
    metadata = load_metadata()
    return {"model": model_record(metadata),
            "crop": embed(crop_window(image, framing), metadata),
            "whole": embed(image, metadata),
            "film_type": film_type(framing)}
```

- [ ] **Step 4: Run the unit suite to verify it passes**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend/tests/unit/test_embedding.py -q`
Expected: PASS, all nine.

- [ ] **Step 5: Run the real-graph test and the import guard**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend/tests/integration/test_embedding_graph.py backend/tests/unit/test_onnx_runtime.py -q > tools/smoke/out/a3-pytest.txt 2>&1`
Expected: PASS (or one SKIP if Task 2 could not export). The import guard stays green: `embedding.py` imports no training library.

- [ ] **Step 6: Commit**

```bash
git add backend/embedding.py backend/tests/unit/test_embedding.py backend/tests/integration/test_embedding_graph.py
git commit -F tools/smoke/out/a3-commit.txt
```

Message: `feat(backend): appearance embeddings from the bundled encoder, every constant from embed.json` + the trailer.

---

### Task 4: The `embedding` stage in `/predict`

**Files:**
- Modify: `backend/server.py:20-38` (the two import blocks), `backend/server.py:127-195` (`_analyze`)
- Test: `backend/tests/integration/test_server.py`, `backend/tests/integration/test_processing_stream.py`

**Interfaces:**
- Consumes: `embedding_record(image, framing)` (Task 3), `runtime.options().embeddings` (Task 1), `release_models`.
- Produces (binding on Plan B): the `/predict` and `/predict-stream` result gains `embedding: {model, crop, whole, film_type} | null`; `qc.processing.embeddings: bool` is whether one was computed; the progress stage `embedding` (`Computing appearance embeddings`) between `encoding` and `calibration` when the setting is on.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/integration/test_server.py`:

```python
def _fake_run(monkeypatch):
    """The first test's fakes, as a helper: a 24 x 16 film, one L1 body, fixed measurements."""
    def fake_prediction(pixel_array, modality, body_part, view, laterality, models):
        mask = np.zeros(pixel_array.shape, dtype=np.uint8)
        mask[4:12, 3:13] = int(VertebraLabel.L1)
        return {"image": pixel_array, "mask": mask, "femoral_mask": np.zeros_like(mask),
                "landmarks": {"S1": {"superior": [[2, 20], [14, 18]]}, "vertebrae": {"L1": {}}},
                "models": {"vertebrae": "unet", "femoral": "unet", "s1": "keypointrcnn"},
                "framing": {"window": [0, 0, 16, 24], "reframed": False, "searched": True, "whole_film_won": False}}
    analysis = {"measurements": {"SS": 10.0, "PI": 42.0, "PT": 12.0, "LL": {"L1-S1": 50.0}},
                "geometry": {"vertebrae": {}, "s1_superior": [], "hip_midpoint": [], "femoral_circles": []},
                "qc": {"femoral": {"confidence": 0.9}}}
    monkeypatch.setattr(server, "spinopelvic_prediction", fake_prediction)
    monkeypatch.setattr(server, "spinopelvic_measurements_from_landmarks", lambda *args: analysis)
    monkeypatch.setattr(server, "calibration_from_payload", lambda *args, **kwargs: {"status": "unavailable"})
    upload = io.BytesIO()
    Image.fromarray(np.full((24, 16), 127, dtype=np.uint8)).save(upload, format="PNG")

    def post(**data):
        return TestClient(server.app).post(
            "/predict",
            data={"modality": "xray", "body_part": "lumbar", "view": "lateral", **data},
            files={"file": ("radiograph.png", upload.getvalue(), "image/png")},
        )
    return post


RECORD = {"model": {"id": "fixture", "dim": 2, "input": [8, 8], "onnx_sha256": "h"},
          "crop": [0.6, 0.8], "whole": [1.0, 0.0], "film_type": "whole-spine"}


def test_predict_carries_the_embedding_and_records_that_it_computed_one(monkeypatch):
    post = _fake_run(monkeypatch)
    seen = {}
    def fake_record(image, framing):
        seen["shape"], seen["framing"] = image.shape, framing
        return dict(RECORD)
    monkeypatch.setattr(server, "embedding_record", fake_record)
    body = post().json()
    assert body["embedding"] == RECORD
    assert body["qc"]["processing"]["embeddings"] is True
    assert seen["shape"] == (24, 16) and seen["framing"]["window"] == [0, 0, 16, 24]


def test_predict_skips_the_embedding_when_the_setting_is_off(monkeypatch):
    post = _fake_run(monkeypatch)
    called = []
    monkeypatch.setattr(server, "embedding_record", lambda image, framing: called.append(1) or dict(RECORD))
    body = post(embeddings="false").json()
    assert body["embedding"] is None
    assert body["qc"]["processing"]["embeddings"] is False
    assert called == []
    assert body["measurements"]["PI"] == 42.0


def test_predict_survives_an_embedding_failure(monkeypatch):
    post = _fake_run(monkeypatch)
    def boom(image, framing):
        raise FileNotFoundError("Missing embedding metadata")
    monkeypatch.setattr(server, "embedding_record", boom)
    response = post()
    assert response.status_code == 200
    body = response.json()
    assert body["embedding"] is None
    assert body["qc"]["processing"]["embeddings"] is False
    assert body["measurements"]["PI"] == 42.0
```

In `backend/tests/integration/test_processing_stream.py`, in `test_stream_matches_legacy_prediction_for_partial_anatomy_in_both_modes`, add one monkeypatch beside the calibration one and extend the stage assertion:

```python
    monkeypatch.setattr(server, 'embedding_record', lambda image, framing: {'model': {'id': 'x', 'dim': 1, 'input': [8, 8], 'onnx_sha256': 'h'}, 'crop': [1.0], 'whole': [1.0], 'film_type': 'lumbar'})
```

and replace the last assertion with:

```python
        stages = [e['stage'] for e in events if e['type'] == 'progress']
        assert stages.index('decoding') < stages.index('landmarks') < stages.index('measuring') < stages.index('encoding') < stages.index('embedding') < stages.index('calibration') < stages.index('complete')
        assert result['embedding']['crop'] == [1.0] and result['qc']['processing']['embeddings'] is True
```

- [ ] **Step 2: Run the two suites to verify they fail**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend/tests/integration/test_server.py backend/tests/integration/test_processing_stream.py -q`
Expected: FAIL — `AttributeError: module 'backend.server' has no attribute 'embedding_record'` on the monkeypatches, and `KeyError: 'embedding'` on the stream assertion.

- [ ] **Step 3: Implement the stage**

In `backend/server.py`, add the import to BOTH import blocks — `from .embedding import embedding_record` under the `try:` and `from embedding import embedding_record` under the `except ImportError:`.

In `_analyze`, replace everything from `runtime.report("encoding", ...)` through the `qc = {...}` assignment with:

```python
    runtime.report("encoding", "Preparing the image and segmentation overlays")
    encoded = {}
    for name in ("image", "mask", "femoral_mask"):
        output = io.BytesIO()
        Image.fromarray(prediction[name]).save(output, format="PNG", optimize=True)
        encoded[f"{name}_png"] = base64.b64encode(output.getvalue()).decode("ascii")
    # Appearance embeddings (similar-cases spec, 2026-09-12, section 10.3): one more stage inside
    # the run the user already waits for, and never able to fail it. Off in Settings skips it
    # entirely -- the graph is never loaded. `image` is the whole film; the crop is cut by the
    # framing window inside embedding_record.
    embedding = None
    if runtime.options().embeddings:
        runtime.report("embedding", "Computing appearance embeddings")
        try:
            embedding = embedding_record(prediction["image"], prediction["framing"])
        except runtime.Cancelled:
            raise
        except Exception:
            logging.getLogger(__name__).exception('Optional appearance embedding failed')
            embedding = None
        finally:
            if runtime.options().low_memory:
                release_models()
    # `qc` stays opaque to the renderer, which reads only `qc.femoral.confidence`;
    # the model choice and the crop ride along so a stored result says what
    # produced it. `processing.embeddings` says whether this run computed one.
    qc = {**analysis.get("qc", {}), "models": prediction["models"], "framing": prediction["framing"],
          "processing": {"mode": runtime.options().mode,
                         "cpu_threads": runtime.options().inference_threads,
                         "runtime": "onnxruntime", "runtime_version": ort.__version__,
                         "providers": runtime.providers(),
                         "crop_localizer": runtime.options().crop_localizer,
                         "toolbar_removal": runtime.options().toolbar_removal,
                         "search_batch": runtime.options().search_batch,
                         "embeddings": embedding is not None}}
```

and replace the final `return` of `_analyze` with:

```python
    runtime.report("complete", "Measurements ready")
    return {**encoded, **analysis, "qc": qc, "labels": VERTEBRA_LABELS, "calibration": image_calibration,
            "embedding": embedding}
```

- [ ] **Step 4: Run the two suites to verify they pass**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend/tests/integration/test_server.py backend/tests/integration/test_processing_stream.py -q`
Expected: PASS.

- [ ] **Step 5: Run the whole backend suite and commit**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend -q > tools/smoke/out/a4-pytest.txt 2>&1`
Expected: PASS.

```bash
git add backend/server.py backend/tests/integration/test_server.py backend/tests/integration/test_processing_stream.py
git commit -F tools/smoke/out/a4-commit.txt
```

Message: `feat(backend): /predict computes the appearance embedding as a stage that never fails the run` + the trailer.

---

### Task 5: `POST /embed`

**Files:**
- Modify: `backend/server.py` (after the `/measure` endpoint: `embed_request`, `run_embedding`, `embed`)
- Test: `backend/tests/integration/test_server.py`

**Interfaces:**
- Consumes: `_decode_grayscale`, `embedding_record`, `runtime.session`, `runtime.parse_options`, `release_models`.
- Produces (binding on Plan B): `POST /embed`, multipart `file` (required, the sidecar's `image_png`), `framing` (optional JSON object), `processing_mode` and `cpu_threads` (the same defaults as `/predict`) → `{"embedding": {model, crop, whole, film_type}}`; 400 empty file, 413 over 50 MB, 422 unreadable image or a non-object `framing`, 503 when the graph is not installed. Also `GET /embedding-model` → the bundled graph's `{id, dim, input, onnx_sha256}`, 503 when none is installed.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/integration/test_server.py`:

```python
def _png(height=24, width=16):
    upload = io.BytesIO()
    Image.fromarray(np.full((height, width), 127, dtype=np.uint8)).save(upload, format="PNG")
    return upload.getvalue()


def test_embed_endpoint_returns_the_record_from_the_stored_image_and_framing(monkeypatch):
    seen = {}
    def fake_record(image, framing):
        seen["shape"], seen["framing"] = image.shape, framing
        return dict(RECORD)
    monkeypatch.setattr(server, "embedding_record", fake_record)
    framing = {"window": [0, 0, 8, 8], "searched": True, "whole_film_won": False}
    response = TestClient(server.app).post(
        "/embed", data={"framing": json.dumps(framing)}, files={"file": ("SP-1000.png", _png(), "image/png")})
    assert response.status_code == 200
    assert response.json() == {"embedding": RECORD}
    assert seen["shape"] == (24, 16) and seen["framing"] == framing


def test_embed_endpoint_without_framing_and_with_bad_inputs(monkeypatch):
    monkeypatch.setattr(server, "embedding_record", lambda image, framing: {**RECORD, "film_type": None if framing is None else "x"})
    client = TestClient(server.app)
    ok = client.post("/embed", files={"file": ("SP-1000.png", _png(), "image/png")})
    assert ok.status_code == 200 and ok.json()["embedding"]["film_type"] is None
    assert client.post("/embed", files={"file": ("x.png", b"not an image", "image/png")}).status_code == 422
    assert client.post("/embed", data={"framing": "[1, 2]"}, files={"file": ("SP-1000.png", _png(), "image/png")}).status_code == 422
    assert client.post("/embed", data={"framing": "{not json"}, files={"file": ("SP-1000.png", _png(), "image/png")}).status_code == 422
    assert client.post("/embed", files={"file": ("empty.png", b"", "image/png")}).status_code == 400


def test_embed_endpoint_reports_a_missing_graph_as_unavailable(monkeypatch):
    def missing(image, framing):
        raise FileNotFoundError("Missing embedding metadata: embed.json. Run python tools/export_onnx.py --kind embed.")
    monkeypatch.setattr(server, "embedding_record", missing)
    response = TestClient(server.app).post("/embed", files={"file": ("SP-1000.png", _png(), "image/png")})
    assert response.status_code == 503
    assert "export_onnx.py --kind embed" in response.json()["detail"]
```

`json` is already imported at the top of `test_server.py`? It is not — add `import json` to its imports.

- [ ] **Step 2: Run the suite to verify it fails**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend/tests/integration/test_server.py -q`
Expected: the three new tests FAIL with 404s.

- [ ] **Step 3: Implement the endpoint**

In `backend/server.py`, after the `/measure` endpoint and before `GET /models`, add:

```python
async def embed_request(file: UploadFile = File(...), framing: str | None = Form(None),
                        processing_mode: str = Form("standard"), cpu_threads: int = Form(2)):
    """The stored sidecar image and its framing record (similar-cases spec, 2026-09-12, section
    10.4). The film file is never needed: the sidecar's image is the whole film."""
    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if not payload:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The uploaded file exceeds 50 MB")
    try:
        parsed = json.loads(framing) if framing else None
        settings = runtime.parse_options(processing_mode, cpu_threads)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if parsed is not None and not isinstance(parsed, dict):
        raise HTTPException(status_code=422, detail="framing must be a JSON object")
    return {"payload": payload, "framing": parsed, "settings": settings}


def run_embedding(request, reporter=None, cancelled=None):
    with runtime.session(request["settings"], reporter, cancelled):
        if request["settings"].low_memory:
            release_models()
        try:
            runtime.report("decoding", "Reading the stored film")
            image = _decode_grayscale(request["payload"])
            runtime.report("embedding", "Computing appearance embeddings")
            result = embedding_record(image, request["framing"])
            runtime.checkpoint()
            return {"embedding": result}
        except runtime.Cancelled:
            raise
        except FileNotFoundError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        finally:
            if request["settings"].low_memory:
                release_models()


@app.post("/embed", summary="Appearance embeddings for a stored segmentation image")
async def embed(request=Depends(embed_request)):
    return await run_in_threadpool(run_embedding, request)


@app.get("/embedding-model", summary="Which appearance encoder this backend bundles")
def embedding_model() -> dict[str, object]:
    """The bundled graph's model record, so the renderer can tell a stale stored embedding from a
    current one (similar-cases spec, 2026-09-12, section 11). 503 when no graph is installed."""
    try:
        return model_record(load_metadata())
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
```

Add `load_metadata` and `model_record` to both `embedding` import lines (`from .embedding import embedding_record, load_metadata, model_record` and the bare-module twin).

`json.JSONDecodeError` is a `ValueError`, so a malformed `framing` is a 422 through the same branch. `_decode_grayscale` raises `ValueError` for bytes that are neither an image nor a DICOM, which is the 422.

Append one more test to `backend/tests/integration/test_server.py`:

```python
def test_embedding_model_endpoint_reports_the_bundled_graph_or_its_absence(monkeypatch):
    monkeypatch.setattr(server, "load_metadata", lambda: {"source": "fixture", "dim": 2, "input": [8, 8], "onnx_sha256": "h"})
    assert TestClient(server.app).get("/embedding-model").json() == {"id": "fixture", "dim": 2, "input": [8, 8], "onnx_sha256": "h"}
    def missing():
        raise FileNotFoundError("Missing embedding metadata")
    monkeypatch.setattr(server, "load_metadata", missing)
    assert TestClient(server.app).get("/embedding-model").status_code == 503
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend/tests/integration/test_server.py -q`
Expected: PASS.

- [ ] **Step 5: Try it against the real graph, then commit**

If Task 2 exported the graph: start the backend from the venv (`"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m uvicorn backend.server:app --port 8765`, in the background from a PowerShell window the executor owns), post any grayscale PNG to `http://127.0.0.1:8765/embed` with `curl -F file=@<png>`, confirm `embedding.crop` and `embedding.whole` have 384 entries, then stop the server. Record the result in the ledger. Skip with a note if the graph is absent.

```bash
git add backend/server.py backend/tests/integration/test_server.py
git commit -F tools/smoke/out/a5-commit.txt
```

Message: `feat(backend): POST /embed computes appearance embeddings from a stored sidecar image` + the trailer.

---

### Task 6: Records — the docs, `CLAUDE.md`, and this plan's ledger

**Files:**
- Create: `docs/appearance-embeddings.md`
- Modify: `docs/onnx-inference.md` (the "Runtime and resource policy" opening sentence)
- Modify: `CLAUDE.md` (the "Backend API" list and its first paragraph)
- Modify: this plan's `## Ledger`

- [ ] **Step 1: Write the feature doc**

Create `docs/appearance-embeddings.md`:

```markdown
# Appearance embeddings

Every segmentation computes two appearance embeddings of the film through a general image
encoder — one of the whole film, one of the lumbar crop the structure models read — and returns
them under `embedding` in the `/predict` response. They are the appearance half of the Find
similar tab's ranking and one block of the research dataset export (the similar-cases spec,
`docs/superpowers/specs/2026-09-12-similar-cases-outcomes-design.md`). They are numbers, not
images: 384 values each, unit length, rounded to five decimals.

## The encoder

Stage 1 ships DINOv2 ViT-S/14 (`vit_small_patch14_dinov2.lvd142m`, Apache 2.0) at 224 × 224,
the class token, exported to ONNX beside the four structure models by
`python tools/export_onnx.py --kind embed`. Nothing about it is hard-coded outside
`backend/onnx/embed.json`: input height and width, channels, mean and standard deviation, the
output dimension and the pooling. A different network is a different command line
(`--embed-source`, `--embed-input`, `--embed-pool`), and every stored embedding names the graph
that produced it, so a swap invalidates cleanly.

## Settings → Processing → Appearance embeddings

On by default. Off skips the stage entirely — the graph is never loaded — and the response
carries `embedding: null`; `qc.processing.embeddings` records whether a run computed one. The
films it skips can be embedded later from the Find tab's `Embed` button, which calls `POST
/embed` with the stored sidecar image and framing and ignores the setting.

## Failure

The stage can never fail a run: any error is logged, the study still segments, and the
embedding is left empty for `Embed` to fill.
```

- [ ] **Step 2: Update the inference doc and `CLAUDE.md`**

In `docs/onnx-inference.md`, replace the first sentence of "Runtime and resource policy" — `All four original models are exported as float32 ONNX graphs at the trained 768-square resolution.` — with:

```markdown
The four structure models are exported as float32 ONNX graphs at the trained 768-square
resolution, and the appearance encoder as a fifth graph at its own input size (see
`appearance-embeddings.md`).
```

In `CLAUDE.md`, in the "Backend API" section, change the opening `Four endpoints the measurement UI uses` to `Five endpoints the measurement UI uses`, add after the `/measure` bullet:

```markdown
- `POST /embed` — multipart `file` (a stored sidecar `image_png`) and optional `framing` JSON.
  Returns `{embedding: {model, crop, whole, film_type}}`, the same record `/predict` returns
  under `embedding` when the `embeddings` form field is on (the default). About a second.
```

and add to the `/predict` bullet, after `omitted fields take the default.`: `The form field \`embeddings\` (default true) adds the \`embedding\` stage and key; see \`docs/appearance-embeddings.md\`.`

- [ ] **Step 3: Run the whole backend suite one last time and commit**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend -q > tools/smoke/out/a6-pytest.txt 2>&1`
Expected: PASS; record the final count in the ledger.

Fill this plan's `## Ledger`: one entry per task with the commit, the counts, the reviewer's findings and how each was settled, whether the graph was exported and verified locally.

```bash
git add docs/appearance-embeddings.md docs/onnx-inference.md CLAUDE.md docs/superpowers/plans/2026-09-12-a-embeddings-backend.md
git commit -F tools/smoke/out/a6-commit.txt
```

Message: `docs: appearance embeddings — the feature doc, the API list, Plan A's ledger` + the trailer.

---

## Self-review against the spec

- **§10.1 the graph**: Task 2 (`export_embed`, `build_embedding_model`, `embed.json` with every listed key, the no-argument loop exporting five).
- **§10.2 `embedding.py`**: Task 3 (`preprocess(image, metadata)`, `crop_window`, `film_type`, `embed`, `embedding_record`; every constant from the metadata; the proof test with a different shape and channel count).
- **§10.3 the stage**: Task 4 (after `encoding`, before `calibration`; `null` and a log on failure; skipped when off; `qc.processing.embeddings`; the `embedding` key; the stream order test).
- **§10.4 `/embed`**: Task 5 (the sidecar image, optional framing, 422s, 503; plus `GET /embedding-model`, which §11's stale rule needs on the renderer side).
- **§10.5 verification and packaging**: Task 2 (five graphs in both verifiers; the workflows untouched).
- **§10.6 the setting, backend half**: Task 1 (`Options.embeddings`, `parse_options`, the form field). The renderer half is Plan B Task 1.
- **§15 backend tests**: `test_embedding.py` (preprocess with a fixture and a second shape, `film_type`, the record), `test_server.py` (`/embed` with and without framing and with an unreadable image; `/predict` carries `embedding`, survives a missing graph, skips when off, records `qc.processing.embeddings`), `test_runtime.py` (a non-boolean rejected), `test_onnx_models.py` (five kinds, `embed.json`'s fields) — all present.
- Placeholder scan: none. Type consistency: `embedding_record(image, framing)` is the one signature in Tasks 3, 4 and 5; `RECORD` and `_fake_run` are defined in Task 4 before Task 5 uses them; `MODEL_NAMES['embed']` (Task 2) is what `_infer(EMBED_KIND, ...)` (Task 3) resolves.

## Ledger

Session ended 2026-09-12 (the planning session): resume at **Task 1**; nothing started, no fix round, no open finding. The spec is at `2c145bf` on `claude/image-similarity-visualization-400922`. Rulings made while planning are above, each with its cost.

Filled during execution: one entry per task — the commit, the counts, the reviewer's findings and how each was settled; every ruling made on the way.

**Pre-flight scan (2026-09-13, before Task 1)** — every anchor above checked against the working tree at `caa0fe8` (v1.0.8 base + docs) by a read-only Sonnet scan (40 anchors, plus the cross-task and self-consistency tables the execution protocol asks for): no mismatch, nothing missing; four line-number drifts only, none changing an instruction — `prediction_request` is `server.py:81-101` (not 84-99), the two import blocks close at `:39`, `_analyze` is `:129-195`, and the sidecar-image ruling's evidence is `image = _robust_rescale(raw)` at `models.py:434` with `"image": image` at `:515`. Cross-task interfaces (`Options.embeddings`, `MODEL_NAMES['embed']` ↔ `_infer(EMBED_KIND, …)`, `embedding_record(image, framing)`, `RECORD`/`_fake_run`, `load_metadata`/`model_record`) agree; each task's tests agree with its code (the letterbox arithmetic re-derived). No amendment made. Baselines on `caa0fe8`: unit 542/542; backend pytest 402 passed, 2 skipped (73.6 s). Venv: torch 2.13.0+cpu, timm 1.0.29, onnx 1.21.0, onnxruntime 1.24.4 — newer than `requirements-export.txt`'s pins (torch 2.11.0, timm 1.0.27); recorded as a fact, not a finding.

**Task 1 (the `embeddings` option and form field)** — dispatched to a Sonnet implementer, BASE `18ec92b`. Implementer DONE_WITH_CONCERNS, commit `e58984d`, suite 404 passed, 2 skipped; concern: the server test's RED already read 422 for an unrelated reason. Review (Sonnet, `review-18ec92b..e58984d.diff`): spec compliant; 1 Important (plan-mandated) — `test_predict_endpoint_rejects_a_non_boolean_embeddings_field` asserts only status 422, which the synthetic image already produces (landmark failure) with the feature absent. Ruling: strengthen the test rather than keep the plan's text — assert the 422 body names the field (an error whose loc ends in "embeddings"), the smallest change that makes the test discriminate; the spec (section 15) wants the non-boolean rejected, not merely a 422. Cost if wrong: one assertion line. Fix round 1/5 (resume implementer): DONE, commit `1833726`, `test_server.py` 8 passed; the discrimination check ran, its failure mode was a NameError at the call site rather than the assertion. Scoped re-review (`review-e58984d..1833726.diff`): 1 addressed, 0 open — the 422 test now asserts an error whose loc ends in "embeddings". Minor, deferred: the fix report's discrimination check (Form line commented out alone) produced a NameError in dependency resolution rather than the new assertion failing; the re-reviewer confirmed the assertion discriminates by static analysis (a reverted server returns a string detail, which the loc lookup rejects) — no code change, evidence quality only. Task complete, commits `18ec92b..1833726`, review clean after one fix round.

**Task 2 (the export tool's `embed` kind, the encoder builder, and the five-graph verifiers)** — dispatched to an Opus implementer, BASE `1833726`. Implementer DONE_WITH_CONCERNS, commit `7d6b1a0`, suite 406 passed, 2 skipped; `embed.onnx` exported and verified locally, 86.6 MB, dim 384, mean and std read from timm's `pretrained_cfg`. Concerns: (a) `_load_model` was `lru_cache(maxsize=4)` with five kinds now registered, so standard mode evicted a graph on every run; (b) Opus subagents receive their own model's trailer instruction, and the brief's Fable trailer was used correctly; (c) the release workflows now download 88 MB from the hub per fresh runner (spec decision 13, anticipated); (d) `check_bundled_inference.py`'s five-graph assertion is unverified until a packaged build — recorded as not run. Ruling: the model cache grows to five (`lru_cache(maxsize=5)` on `_load_model`, one line with a comment) in this task, before review — the plan says standard mode keeps the embed graph cached like the structure models, which a four-slot cache cannot do; low-memory mode is unaffected (its release is by key change). Cost if wrong: about 150 MB more resident memory in standard mode, the size of one graph. Pre-review fix (resume implementer): DONE, commit `6067b02`, `maxsize=5`, 24 passed on the two covering files, no test pinned four. Review (Opus, `review-1833726..6067b02.diff`): spec compliant, Approved; 2 Important (plan-mandated), both silent fallbacks in `export_embed`: (a) `config.get("mean"/"std", ImageNet)` fabricates normalisation constants when `pretrained_cfg` lacks them; (b) licence is a CLI default never reconciled with the cfg's license. 7 Minor deferred: `import json` mid-file in `test_onnx_models.py`; `set_fused_attn(False)` is a one-way process-global flip (comment it); `dim = None` sentinel is dead; `--embed-*` flags silently ignored for other kinds; no test pins `embed` out of `MODEL_CHOICES` (one-line assert suggested); a stray EOF blank line in `training.py`; `requirements-export.txt`'s pins (torch 2.11/timm 1.0.27) differ from the venv that validated the export (2.13/1.0.29) — CI exports on an untested pair, fail-loud via the parity assert. Ruling: (a) index the cfg — mean and std must come from pretrained_cfg or the export raises naming the source; no ImageNet fallback. (b) keep the --embed-licence flag and its default, and raise when the cfg carries a license that differs from it case-insensitively; a cfg without a license keeps the flag's value (the realistic timm case always carries one). Cost if wrong: a cfg-less source needs an explicit flag; a legitimately relicensed export needs the flag to match. Fix round 1/5 (resume implementer): DONE, commit `296c504`; helper `embed_normalisation_and_licence` plus one guard test, 11 passed on the covering files, no re-export. Scoped re-review (`review-6067b02..296c504.diff`, backend and tools paths; the docs commit `1e1fff5` in the range is the Plan B amendment): 2 addressed, 0 open — mean/std indexed from `pretrained_cfg` or the export raises; `--embed-licence` reconciled with the cfg case-insensitively. Minor, deferred: the new guard test inserts into `sys.path` at test-body time, a process-wide side effect; two extra edge cases (std present/mean absent; cfg with no licence key) live only in the standalone `a2-fix1-guards.py`, not in pytest. Task complete, commits `1833726..296c504`, review clean after one pre-review fix and one fix round; `embed.onnx` exported and verified locally — 86.6 MB, dim 384, and `backend.verify_onnx`'s output carries all five keys (`{"s1": [[0], [0, 2, 3]], "vertebra": [[1, 6, 768, 768]], "femoral": [[1, 1, 768, 768]], "hrnet": [[1, 22, 2]], "embed": [[1, 384]]}`). Not run: `check_bundled_inference.py`'s five-graph assertion, which needs a packaged build; the release workflows' hub download, untested until the next CI run.

**Task 3 (`backend/embedding.py`)** — dispatched to a Sonnet implementer, BASE `296c504`. Implementer DONE_WITH_CONCERNS, commit `12b1a2e`; unit 13/13 (the brief said nine — the parametrised `film_type` test is seven items), real-graph test plus import guard 11/11, no skip. Cosmetic: RED was `ImportError`, not `ModuleNotFoundError`. Harness note: the Bash tool refused the venv python for this Sonnet agent; PowerShell worked. Review (Sonnet, `review-296c504..12b1a2e.diff`): spec compliant, Approved, no Critical or Important. Minor, deferred: the non-finite-norm branch of `embed()` has no dedicated test, only the zero-norm path. Task complete, commits `296c504..12b1a2e`, review clean.

**Task 4 (the `embedding` stage in `/predict`)** — dispatched to a Sonnet implementer, BASE `12b1a2e`. Implementer DONE_WITH_CONCERNS, commit `2d2c812`, suite 424 passed, 2 skipped — reconciling as 406 at `7d6b1a0` plus one guard test (`296c504`) plus 14 from Task 3 plus 3 more equals 424. Review (Sonnet, `review-12b1a2e..2d2c812.diff`): spec compliant, Approved, no Critical or Important. Minor, deferred: the setting-off test proves `embedding_record` was not called, not that the graph was not loaded — inherent to mocking at the server layer. Task complete, commits `12b1a2e..2d2c812`, review clean.

**Task 5 (`POST /embed`)** — Ruling made ahead of dispatch: Step 5's live check runs in-process — a throwaway script posts a real PNG to /embed through FastAPI's TestClient against the exported graph and asserts 384 entries — instead of a backgrounded uvicorn plus curl, which is the stall pattern a Sonnet implementer has fallen into before (HANDOFF known trap). Cost if wrong: uvicorn's threadpool path is not exercised here; /predict already runs through it in production and the smoke suites will. Dispatched to a Sonnet implementer, BASE `2d2c812`. Implementer DONE, commit `81d8210`, `test_server.py` 15 passed, suite 428 passed, 2 skipped; the in-process live check returned 200, crop 384, whole 384, film type whole-spine, and `onnx_sha256` matching `embed.json`. Review (Sonnet, `review-2d2c812..81d8210.diff`): spec compliant, Approved, no Critical or Important. Minor, deferred: the 400/413 upload checks are now a third verbatim copy across `prediction_request`, `calibration_request` and `embed_request` — a shared `_read_upload` helper would remove it; no test exercises `/embed`'s 413 path. Task complete, commits `2d2c812..81d8210`, review clean.

**Task 6 (records — the feature doc, the inference doc, `CLAUDE.md`, and this ledger)** — dispatched to a Sonnet implementer, BASE `81d8210`. Wrote `docs/appearance-embeddings.md` verbatim from the brief; replaced the "Runtime and resource policy" opening sentence in `docs/onnx-inference.md`; in `CLAUDE.md` changed the Backend API paragraph from Four to Five endpoints, added the `/embed` bullet after `/measure`, and appended the `embeddings` form-field sentence to the `/predict` bullet; filled this Ledger. Whole backend suite: 428 passed, 2 skipped (`tools/smoke/out/a6-pytest.txt`), unchanged from Task 5's end — no code touched. Still not run: `check_bundled_inference.py`'s five-graph assertion, which needs a packaged build; the release workflows' hub download, untested until the next CI run.
