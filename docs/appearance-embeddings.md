# Appearance embeddings

Every segmentation computes appearance embeddings of the film through a general image
encoder — one of the whole film and one of each crop the structure models read for the
film's region — and returns them under `embedding` in the `/predict` response. They are the
appearance half of the Find similar tab's ranking and part of the research dataset export
(the similar-cases spec,
`docs/superpowers/specs/2026-09-12-similar-cases-outcomes-design.md`, and its stage-2
amendment `docs/superpowers/specs/2026-09-30-similar-cases-stage-2-regions-design.md`). They
are numbers, not images: 384 values each, unit length, rounded to five decimals.

## The record

`embedding` is `{model, lumbar, cervical, whole, region}`:

- `model` — `{id, dim, input, onnx_sha256}`, the graph that produced the vectors; two
  embeddings compare only when their `onnx_sha256` match.
- `lumbar` — the embedding of the lumbar crop, or `null` where the film's region has none.
- `cervical` — the embedding of the cervical crop, or `null`.
- `whole` — the embedding of the whole film, always present.
- `region` — the film's region, `lumbar`, `cervical` or `full_spine`: the one `/predict`
  resolved (after automatic film detection) or `/embed` was told.

The crops follow the region. A lumbar result's `qc.framing.window` is the lumbar crop
(corners `[left, top, right, bottom]`); a full-spine result's `lumbar_window` and
`cervical_window` give both; a cervical result's `window` is the cervical crop, and it is
`[x, y, width, height]`, not corners — `crop_window(image, window, *, xywh=False)` reads either
form. An absent, malformed or degenerate window (under 8 px) makes that vector `null`; the whole
film never stands in for a crop. The renderer stores the record as `embeddings/<id>.json`,
version 2 (`renderer/data/embeddings.js`); a version-1 record from before regions
(`crop`, `whole`, `film_type`) still reads, lifted to the same fields, but counts as stale, so the
Find tab's `Embed` recomputes it once.

## The encoder

Stage 1 ships DINOv2 ViT-S/14 (`vit_small_patch14_dinov2.lvd142m`, Apache 2.0) at 224 × 224,
the class token, exported to ONNX beside the structure models by
`python tools/export_onnx.py --kind embed`. Nothing about it is hard-coded outside
`backend/onnx/embed.json`: input height and width, channels, mean and standard deviation, the
output dimension and the pooling. A different network is a different command line
(`--embed-source`, `--embed-input`, `--embed-pool`), and every stored embedding names the graph
that produced it, so a swap invalidates cleanly.

The encoder always runs on the CPU provider, whatever the processor setting
(`CPU_ONLY_KINDS` in `backend/models/models.py`): the embedding stage is optional and never
allowed to fail a run, so GPU qualification (`backend/gpu_parity.py`) neither loads nor requires
it, and the Analysis header's processor badge ignores its CPU provider. See
`docs/gpu-processing.md`.

## The endpoints

`POST /embed` takes a stored sidecar `image_png`, optional `framing` and an optional `region`
form field (`lumbar` by default, so a stage-1 caller is unchanged; `cervical` or `full_spine`;
anything else is a 422) and returns `{embedding: {model, lumbar, cervical, whole, region}}` —
the same record `/predict` returns under `embedding`. `GET /embedding-model` takes nothing and
returns just the `model` block (`{id, dim, input, onnx_sha256}`) for the bundled encoder, 503
when none is installed; the renderer reads it once to tell whether a stored embedding's
`model.onnx_sha256` is still current.

## Settings → Processing → Appearance embeddings

On by default. Off skips the stage entirely — the graph is never loaded — and the response
carries `embedding: null`; `qc.processing.embeddings` records whether a run computed one. The
films it skips can be embedded later from the Find tab's `Embed` button, which calls `POST
/embed` with the stored sidecar image, framing and the film's region, and ignores the setting.

This backend ships together with the renderer's `Appearance embeddings` switch (Plan B
Task 1) — a renderer without the switch cannot turn the stage off, so the two are released
together.

## Failure

The stage can never fail a run: any error is logged, the study still segments, and the
embedding is left empty for `Embed` to fill.
