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

## The endpoints

`POST /embed` takes a stored sidecar `image_png` and optional `framing` and returns
`{embedding: {model, crop, whole, film_type}}` — the same record `/predict` returns under
`embedding`. `GET /embedding-model` takes nothing and returns just the `model` block
(`{id, dim, input, onnx_sha256}`) for the bundled encoder, 503 when none is installed; the
renderer reads it once to tell whether a stored embedding's `model.onnx_sha256` is still
current.

## Settings → Processing → Appearance embeddings

On by default. Off skips the stage entirely — the graph is never loaded — and the response
carries `embedding: null`; `qc.processing.embeddings` records whether a run computed one. The
films it skips can be embedded later from the Find tab's `Embed` button, which calls `POST
/embed` with the stored sidecar image and framing and ignores the setting.

This backend ships together with the renderer's `Appearance embeddings` switch (Plan B
Task 1) — a renderer without the switch cannot turn the stage off, so the two are released
together.

## Failure

The stage can never fail a run: any error is logged, the study still segments, and the
embedding is left empty for `Embed` to fill.
