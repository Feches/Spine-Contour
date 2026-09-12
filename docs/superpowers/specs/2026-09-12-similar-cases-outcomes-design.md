# Similar cases and outcomes — stage 1 design

**Status:** draft for review, 2026-09-12. Brainstormed on branch
`claude/image-similarity-visualization-400922` (off `fork/main` @ `6704586`, v1.0.7). Nothing here is
implemented.

**Builds on:** the approved spec `2026-08-31-spine-contour-ui-redesign-design.md` ("spec §" below;
§10.5 and §10.6 in particular), the pre-op/post-op spec `2026-09-06-preop-postop-organisation-design.md`
("pp §"), the batch spec `2026-09-08-batch-segmentation-design.md` ("batch §"), the studies-table spec
`2026-09-10-studies-table-review-design.md`, plan 07 `plans/2026-08-31-07-similar-comparison.md` and the
binding architecture contract `plans/2026-08-31-00-architecture-contract.md`. Where this document changes
a module interface, a state key, an endpoint or a stored file, §16 lists the amendment it forces.

**Supersedes:** plan 07's Task 1 (the five-angle distance) and Task 2 (the three-card tab). Plan 07's
Tasks 3–6 — the two comparison panes, the `COMPARING` badge and the wider panel, the `{other}` and `Δ`
measurement columns, the two-row clinical grid — stay as written, adapted to what plan 06 changed under
them (HANDOFF, "Resume plan 07 here").

**The programme this is stage 1 of:** the user has about 500 pre-op/post-op pairs with a known
reoperation outcome and wants, eventually, to predict mechanical failure from the films inside the app.
Stage 1 builds what is honest today — similar cases with their recorded outcomes, the vectors, the
labels and the dataset export a notebook trains on — and nothing that shows a risk number. Stages 2–4
(pair ranking, the cluster map, the model registry and risk panel, in-app retraining) are
`docs/ROADMAP.md` §8.

---

## 1. Problem

The Analysis screen's right panel has two tabs, `Measurements` and `Find similar`; the second reads
`Find similar arrives in a later build.` (`renderer/screens/analysis.js`, plan 03's placeholder). Plan 07
would fill it with the three studies nearest by a weighted distance over `[LL, PI, PT, SS, PI−LL]`. That
ranks by alignment numbers only: two spines with the same five angles but a different curvature
distribution, a slip, or a construct in one of them rank as identical, and a study whose PI is absent has
no vector at all.

Everything needed to do better is already stored. Every segmented study carries 22 landmarks in source
pixels (four corners for L1–L5, the two S1 endplate points), the femoral circles and hip midpoint, the
measurements derived from them, a 128 px thumbnail, and a sidecar with the framed image and the masks.
Nothing carries an outcome: the clinical fields are nine free-text names, none of them says whether the
patient was reoperated, and so nothing in the app can answer "what happened to the cases that look like
this one".

The research goal behind the tab is outcome prediction, and the honest path to it runs through the app:
the app is where the films are segmented, corrected and labelled, so it must be the place that produces
the per-film vectors and the per-subject dataset a model is trained on. Similarity search with outcomes
on the cards is useful from the first week and needs no model; it is also the nearest-neighbour
predictor, and the way labels get typed in.

## 2. Users and workflow

The researcher (spec §2), doing this:

1. Load a workspace whose folders give subject and timepoint (pp §8.1). Import the outcome spreadsheet
   through the same screen's CSV import; three new known fields carry the reoperation, its date and the
   last follow-up.
2. Segment the cohort with the batch (batch §2). Each run now also computes the appearance embedding of
   the film and stores it. For films segmented before this build, one `Embed` button on the Find tab
   fills the gap without re-segmenting.
3. Review the flagged studies and mark them reviewed as today. The shape vector follows every landmark
   correction because it is derived from the record's geometry, never stored.
4. Open a study, click `Find similar`, choose the scope (this workspace or the whole library) and what
   to rank by (shape and appearance, shape, appearance). Read five cards: who, how close, where the
   alignment differs, and what happened to them. Click one to compare side by side (spec §10.6).
5. On the Parameters tab, `Export dataset` writes a folder with the per-film table, the per-pair table,
   every vector and a manifest. The notebook starts from that folder.

## 3. Goals

- Rank stored studies by what the segmentation actually produced — the normalised landmark shape — and
  by what a general image model sees, combined, with the weights visible as a three-way control.
- Show outcomes on the cards and a count in the footer, as recorded facts about this library, never as
  a prediction.
- Capture reoperation, its date and the last follow-up as ordinary clinical fields, so the existing
  drawer, import and export paths carry them with no new storage shape.
- Compute embeddings inside the run every user already waits for, and let a library segmented before
  this build catch up in one click.
- Produce a dataset export a notebook can train on without reading the app's store: tables, vectors,
  a manifest that says exactly what produced them.
- Keep the single-run guarantees (batch §3), the no-fabrication rules and the CSP exactly.

## 4. Non-goals

- **A displayed probability or risk score.** Stage 3. The footer counts neighbours; it never says
  "risk".
- **Pair-vector ranking** (pre-op, post-op and delta as one vector), the cluster map, the model registry,
  the risk panel, in-app retraining. Stages 2–4, ROADMAP §8.
- **A subject-keyed CSV import.** The join stays per film by filename stem (HANDOFF "Resume plan 07
  here" item 4); a subject-level outcome is resolved across the subject's films (§9.3). One row per film
  in the spreadsheet, or the outcome on any one film of the subject, both work.
- **Mask-contour descriptors.** The landmarks are the mask corners; a contour block would mostly
  repeat the shape block. The fused distance has a slot for a third block if a later stage wants one.
- **Fine-tuning the embedding model**, a radiograph-specific model, or a second whole-film resolution.
- **Thoracic or global landmarks.** The models read L1–S1; global tilt and junctional measures are not
  in this build (pp §4 already excludes them).
- **`Compare with…` for the same subject** (pp §12). It is the next entry into comparison mode and gets
  its own small plan; nothing here blocks it.

## 5. Current state this builds on

- **Geometry** (contract "Data shapes"): `vertebrae.{L1..L5}.{superior, inferior, quadrilateral}` with
  only detected levels present, `s1_superior` as `[SA, SP]`, `femoral_circles`, `hip_midpoint`,
  `l1_center`, all in source pixels. The corner naming in `backend/landmarks.py` is `SA, SP, IA, IP`.
  Partial results (2026-09-09) carry `qc.coverage.{partial, available, missing, unoriented}`; an
  unoriented body has no trustworthy anterior/posterior assignment.
- **The sidecar** `predictions/<id>.json` is the raw `/predict` response: `image_png` (the framed image
  at source resolution), the masks, `measurements`, `geometry`, `qc`, `labels`, `calibration`. Read
  lazily; ids validated in the main process; deleted with the study; quarantined with `studies.json`.
- **Thumbnails** are on the record (`≤128 px` JPEG data URI). Nothing displays them yet; plan 07's
  cards were written to.
- **`/predict`** runs `decoding → measuring → encoding → calibration → complete` under
  `runtime.session`, one at a time; low-memory mode releases models between stages;
  `/predict-stream` carries the stages live. Calibration failure never fails the run.
- **ONNX models** are exported by `tools/export_onnx.py` from the LFS checkpoints, one per process,
  validated against PyTorch, described by a `<kind>.json` beside each graph; both release workflows run
  the export and then `backend/verify_onnx.py` and `tools/packaging/check_bundled_inference.py`, which
  today verify "all four" graphs. `timm` is an export dependency only.
- **Batch segmentation** (batch §8): `createBatchDriver` in `renderer/data/batch.js`, wired once in
  `renderer/batch.js` to `segmentStudy(id, {batch: true})`; `state.batch` is `{ids, done, failed,
  warnings, skipped, stopping}`; `state.running` stays a single id.
- **Pairing** (pp §11.2): `pairStudies(rows, {post})` groups a subject's films into one pre-op film plus
  one film per later label, judging unpaired and ambiguous subjects; `toPairedCsv` writes it.
- **Clinical fields**: `KNOWN_FIELDS` is nine names; every value is a trimmed string on `study.clinical`;
  `autoMap` is a prefix match, one column per known field, first wins; the drawer is one row per
  visible study.
- **Parameters filter bar**: `Export CSV` and `Export paired CSV` over the same rows (visible, or ticked
  visible), each with a disabled note and a toast sized by `toastDuration`.
- **Workspace scope**: `matchesWorkspace(study, root)` in `renderer/data/parameters.js`, with
  `HAND_ADDED` as the sentinel for films with no workspace root.

## 6. Decisions

Each with what it costs if it is wrong.

1. **The vector is three blocks: shape `S`, crop appearance `C`, whole-film appearance `W`.** No
   mask-contour block (§4). *Cost if wrong:* the fused distance takes a fourth block without changing
   its shape; the export's `vectors.json` gains a key.
2. **`S` is the 44 normalised coordinates of the 22 landmarks and nothing else.** The pelvic geometry
   is already summarised by PI, PT and SS, which every card shows as deltas. *Cost if wrong:* a pelvic
   sub-block is eight more numbers under the same normalisation, added later without a store change.
3. **Shape normalisation is mirror, translate, scale — never rotate.** Anterior is made to point to
   +x, the centroid goes to the origin, the centroid size goes to one. Orientation is kept as imaged
   because standing films use gravity as the reference and PT and SS depend on it. *Cost if wrong:* a
   film taken with a tilted cassette ranks farther than it should; the card's angle deltas make that
   visible.
4. **Appearance is DINOv2 ViT-S/14 at 224 px, the CLS token, cosine distance.** Generic weights,
   Apache 2.0, about 88 MB, exported to ONNX like the other graphs. *Cost if wrong:* the block is
   replaced by re-exporting under the same `embed` kind; every stored embedding records the model, so
   a change invalidates cleanly and `Embed` recomputes.
5. **Two appearance blocks, and `W` compares only whole-spine films with whole-spine films.** A
   lumbar-only film's whole-film block is nearly its crop block; comparing it with a whole-spine film's
   would rank the presence of a thorax. Film type comes from the framing record. *Cost if wrong:* with
   the crop localizer off every film reads as lumbar and `W` never contributes; the export records the
   setting per film so the notebook can see it.
6. **Fusion is a weighted root-mean-square of block distances, each divided by its median over the
   candidates.** The user picks `Shape + appearance`, `Shape` or `Appearance`. The match percentage is
   `round(100·exp(−d))`. *Cost if wrong:* the mapping is cosmetic and monotone; changing it changes no
   ranking.
7. **Five cards; scope defaults to `All studies`; the same subject is excluded; partial or unoriented
   studies and demo studies are never candidates.** *Cost if wrong:* each is a one-line rule in the
   pure module with a test.
8. **Outcomes are three known clinical fields per film, resolved per subject, shown as counts.** No
   new record field, no store version bump. *Cost if wrong:* a subject entity was rejected in pp §4 for
   the same reason; if the per-film join proves too clumsy, a subject-keyed import is ROADMAP §8.
9. **Embeddings live in `embeddings/<id>.json`, one file per study, beside `predictions/`.** The shape
   block is derived from the record's geometry every time and never stored. *Cost if wrong:* a single
   file would be rewritten on every run of an overnight batch; per-study files write once each and load
   once per session.
10. **The embedding is computed inside `/predict`, after `encoding`, and can never fail the run.**
    Missing graph or any error → `embedding: null`, logged, the study still segments. Older studies
    catch up through an `Embed` batch mode that posts the stored framed image and the film to `/embed`.
    *Cost if wrong:* a film whose embedding failed shows on the Find tab's `Embed` count until it
    succeeds; nothing is lost.
11. **`Export dataset` writes a folder, not a file, over the paired export's rows, with no images.**
    Four files: `films.csv`, `subjects.csv`, `vectors.json`, `manifest.json`. *Cost if wrong:* the
    notebook reads a different layout; the manifest carries a version for that.
12. **Comparison mode is plan 07's Tasks 3–6, unchanged in behaviour.** *Cost if wrong:* none new;
    those tasks were already approved.
13. **The DINOv2 weights are downloaded at export time from the model hub, and their SHA-256 is
    written into `embed.json`.** No new LFS object. *Cost if wrong:* a hub outage breaks a release
    build until the checkpoint is committed to LFS like the others; the pinned hash makes that swap
    verifiable.
14. **Subject identity for exclusion and resolution is `subjectKey` (trimmed, lower-cased), exactly
    the pairing module's.** *Cost if wrong:* a fifth copy of the rule; ROADMAP §6 already wants them
    consolidated.

## 7. Vectors

### 7.1 The shape block `S`

`vector(study)` in `renderer/data/similarity.js` returns 44 numbers or `null`.

1. **Collect** the 22 points in fixed order: for each of L1, L2, L3, L4, L5 the corners `SA, SP, IA,
   IP` (`superior[0]`, `superior[1]`, `inferior[0]`, `inferior[1]`, anterior first as the contract fixes
   for `s1_superior`), then S1 `SA, SP`. Every level must be present and `qc.coverage.partial` must be
   false and `qc.coverage.unoriented` empty; otherwise `null`. Demo studies have no geometry and
   return `null`.
2. **Mirror.** If the mean x of the anterior points (every `SA` and `IA`) is less than the mean x of
   the posterior points, negate every x. After this, anterior is +x on every study.
3. **Translate** so the centroid of the 22 points is the origin.
4. **Scale** by the centroid size, the square root of the summed squared distances to the centroid,
   so it becomes 1.
5. **Do not rotate.**

`shapeDistance(a, b)` is the Euclidean distance over the 44 numbers.

### 7.2 The appearance blocks `C` and `W`

The backend computes both from one graph (§10): `C` from the framed image the models ran on, `W` from
the whole film. Each is 384 numbers, L2-normalised. `appearanceDistance(a, b)` is `1 − a·b`.

`filmType` is `'whole-spine'` when the framing record says the search ran and chose a crop smaller than
the film, else `'lumbar'`. `W` enters a distance only when both studies are `'whole-spine'`.

### 7.3 The fused distance and the match score

For an open study `o`, a candidate set `K` (§7.4) and a mode:

| Mode | `wS` | `wC` | `wW` |
|---|---|---|---|
| `both` (`Shape + appearance`) | 1 | 1 | 1 |
| `shape` | 1 | 0 | 0 |
| `appearance` | 0 | 1 | 1 |

For each block present for the pair `(o, c)`: `d_i(c)` is that block's distance; `m_i` is the median of
`d_i` over every candidate in `K` for which the block is present, when at least three such candidates
exist and the median is positive, else `1`. Then

```
d(c) = sqrt( Σ_present w_i · (d_i(c) / m_i)²  /  Σ_present w_i )
```

A block is present for the pair when both studies have it and its weight is not zero; `W` additionally
needs both film types `'whole-spine'`. A candidate with no present block is dropped. Candidates sort by
`d` ascending, ties by id. `matchScore(d) = round(100 · exp(−d))`, an integer 0–100; the median-scaled
`d` is around 1 for a typical candidate, so the nearest of a few hundred usually reads 60–80.

`findSimilar(open, all, {scope, mode, n = 5})` returns `[{study, d, match, blocks}]`, where `blocks`
names the blocks that entered the distance, so a card can say `shape only`.

### 7.4 Candidates

A study `c` is a candidate for `o` when all hold:

- real (`source === 'real'`), and not `o` itself;
- segmented with full coverage: `vector(c)` is not `null`;
- under `both` or `appearance`, an embedding record exists for `c` (§11); under `shape` it need not;
- scope `'workspace'`: `matchesWorkspace(c, root(o))`, the Parameters grid's rule, `HAND_ADDED`
  included, so a hand-added film's workspace is the other hand-added films; scope `'all'`: every study;
- not the same subject: `subjectKey(c)` and `subjectKey(o)` are not both non-empty and equal.

The open study must itself pass the vector and, under `both`/`appearance`, the embedding test; if it
does not, the tab says why (§8.4) and shows no cards.

## 8. The Find similar tab

### 8.1 Layout

The right panel's second tab (spec §9, 400 px, 440 px in comparison mode). Top to bottom:

1. A segmented control `This workspace | All studies` → `state.similarScope`, default `'all'`.
2. A segmented control `Rank by  Shape + appearance | Shape | Appearance` → `state.similarRank`, default
   `'both'`.
3. The eyebrow, Chivo Mono caps like the measurement group headers: `RANKED BY SPINE SHAPE AND
   APPEARANCE`, `RANKED BY SPINE SHAPE`, `RANKED BY APPEARANCE`.
4. Up to five cards (§8.2), the nearest first.
5. The footer (§8.3).
6. The tail, plan 07's wording: `{m} MORE STUDIES BELOW`, where `m` is the candidate count beyond the
   cards, or nothing when `m` is 0.

Both controls are session-only store keys (like `findSort`), replaced wholesale; the tab is a
subscriber that recomputes on every store change and on `state.embeddingsVersion` (§11). Ranking a
thousand candidates is under five milliseconds; no memo is needed.

### 8.2 A card

| Line | Content | Absent value |
|---|---|---|
| Thumbnail | `study.thumbnail`, 56 px, left | an empty bordered box |
| 1 | `studyName(study)` left; `{match}%` right in Chivo Mono | — |
| 2 | `{subject} · {timepoint} · {view}` then `{filmDate}` | `—` per part |
| 3 | `PI {±n} · LL {±n} · PT {±n} · SS {±n}`, candidate minus open, whole degrees with sign | `—` per angle |
| 4 | the resolved outcome (§9.3): `Reoperation · {date}`, `No reoperation · last follow-up {date}`, `Outcome not recorded`, `Outcome conflicting` | — |
| 5 | `CLICK TO COMPARE IN VIEWER`, or `IN VIEWER · CLICK TO REMOVE` when it is `compareId` | — |

Under `both` or `appearance`, when `W` did not enter the distance (one or both films are lumbar), line
1 appends ` · shape + crop` or ` · crop` in the muted colour, so a card never implies a whole-film
comparison that did not happen. Line 3 is the "why": the angles are not in the distance, they explain
it.

Clicking a card toggles `compareId` (plan 07 Task 2); everything comparison mode does from there is
plan 07 Tasks 3–6. `compareId` is nulled on delete of either study, as HANDOFF already requires, and
re-ranking on a store change never touches it.

### 8.3 The footer

Over the cards shown (`n ≤ 5`): `{k} OF {n} WITH A REOPERATION · {u} NOT RECORDED`, where `k` counts
cards whose resolved status is `reoperation`, `u` counts `not-recorded` plus `conflicting`, and the
second clause is omitted when `u` is 0. It is a count of recorded facts about the cards on screen and
is worded so; it never reads as a rate or a risk.

### 8.4 Empty states

One sentence in the panel, the same voice as the drawer's:

- open study not segmented: `Segment this study to find similar cases.`
- open study partial or unoriented: `Similar cases need all five lumbar levels and S1; this study's
  coverage is partial.`
- open study without an embedding under `both`/`appearance`: `No appearance embedding for this study
  yet — run Embed on the Find tab, or rank by shape.`
- no candidates: `No other eligible studies in this workspace.` / `No other eligible studies in the
  library.`

### 8.5 What stays from plan 07

Task 3 (two panes, per-pane chip with id, match and close; `mountPane` reuse), Task 4 (`COMPARING`
badge, 440 px panel), Task 5 (`{other}` and `Δ` columns, 5° and 2 mm thresholds), Task 6 (two clinical
rows). The chip's match figure is this document's `match`, not plan 07's. Where plan 07 names an
export plan 06 does not have, HANDOFF's "Resume plan 07 here" is the map.

## 9. Outcomes

### 9.1 Three known fields

`KNOWN_FIELDS` grows from nine to twelve, the new names appended so no existing export column moves:
`'Reoperation'`, `'Reoperation date'`, `'Last follow-up'`. They are ordinary clinical keys: strings on
`study.clinical`, chips in the drawer, columns in the export, importable from the CSV.

### 9.2 Values

- `Reoperation`: recognised values are `Yes` and `No`. The drawer cell is a select with a blank, `Yes`
  and `No`. The import normalises `yes`, `y`, `true`, `1` → `Yes` and `no`, `n`, `false`, `0` → `No`,
  case-insensitively, and keeps anything else as typed, which then counts as not recorded.
- `Reoperation date`, `Last follow-up`: recognised when they match `YYYY-MM-DD`, the film-date rule.
  Anything else is kept as typed and counts as not recorded; the drawer cell shows the same warning
  treatment the Study group gives an unreadable film date.
- `autoMap` matches known names **longest first**, so a header `reoperation_date` maps to
  `Reoperation date`, not `Reoperation`. This is a change to the rule for every name, and is the only
  change the existing names see: none of the nine is a prefix of another.

### 9.3 Resolution per subject

`resolveOutcome(films)` in `renderer/data/outcomes.js`, pure, over the real films sharing a
`subjectKey` (a film with no subject is its own set):

| Recognised `Reoperation` values across the films | status |
|---|---|
| none | `not-recorded` |
| all `Yes` | `reoperation` |
| all `No` | `none` |
| both | `conflicting` |

`reoperationDate` is the first recognised date across the films in pp §7.2 timepoint order;
`lastFollowUp` is the latest recognised date across them. `conflicting` and `not-recorded` count as
unknown everywhere: the footer's `NOT RECORDED`, the export's `Outcome status` column, the toast.

### 9.4 Import

The join is unchanged (per film, by filename stem). A spreadsheet with one row per subject therefore
needs the outcome on at least one of that subject's films' rows; the Load message's existing counts
apply. A subject-keyed join is ROADMAP §8.

## 10. Backend

### 10.1 The graph

`tools/export_onnx.py --kind embed`: loads `vit_small_patch14_dinov2.lvd142m` through `timm` with
pretrained weights (downloaded at export time, decision 13), wraps it so the graph's single output
`embedding` is the CLS token after the final norm, exports at `1×3×224×224`, opset 17, validates two
tensors against PyTorch at the other kinds' tolerance, and writes `embed.json` with `kind: 'embed'`,
`size: 224`, `channels: 3`, `dim: 384`, `source` (the timm id), `weights_sha256`, `licence:
'Apache-2.0'`, the ImageNet mean and standard deviation, and the usual `onnx_sha256` and versions. The
no-argument run exports all five kinds, each in its own process.

`backend/models/models.py` loads, caches and releases the `embed` graph through the same
`InferenceModel` machinery as the four structure models, under the same thread and provider policy. It
is never offered by `GET /models`; `resolve_models` does not know it.

### 10.2 `backend/embedding.py`

- `preprocess(image)`: robust-rescale to 8 bit as the models do, letterbox to a 224 square with zero
  padding, replicate to three channels, scale to `[0, 1]`, subtract the ImageNet mean and divide by the
  standard deviation, `float32`, `1×3×224×224`.
- `embed(image)`: run the graph, L2-normalise, return 384 `float32`.
- `film_type(framing)`: `'whole-spine'` or `'lumbar'` per §7.2, `None` when `framing` is absent.
- `embedding_record(crop_image, whole_image, framing)` → `{model: {id, dim, size, onnx_sha256}, crop,
  whole, film_type}` with `null` for an input that was not given.

### 10.3 In `/predict`

After `encoding` and before `calibration`: `runtime.report("embedding", "Computing appearance
embeddings")`, then `embedding_record(prediction["image"], pixel_array, prediction["framing"])`. In
low-memory mode the structure models are already released by then; the embed graph is released after
the stage. Any exception is logged with the same discipline as calibration's and the response carries
`embedding: null`; `/predict-stream` reports the stage like every other. The response gains the key
`embedding`; the sidecar, being the raw response, therefore holds a copy, which nothing reads (§11).

### 10.4 `POST /embed`

Multipart: `file` (the whole film, optional), `crop_png` (the sidecar's `image_png`, optional),
`framing` (the stored `qc.framing` as JSON, optional). Runs under `runtime.session` — serialised with
predictions, cancellable, reported as one `embedding` stage — decodes what it was given with the same
readers `/predict` uses, and returns `{embedding}` per §10.2 with `null` blocks for absent inputs. With
neither image it is a 422. Rounded to five decimals on the way out, like everything the renderer
stores.

### 10.5 Verification and packaging

`backend/verify_onnx.py` and `tools/packaging/check_bundled_inference.py` verify five graphs: the
`embed` check runs zeros at `1×3×224×224` and asserts shape `(1, 384)` and finite values. Both workflows
are otherwise unchanged: `tools/export_onnx.py` exports the fifth graph into `backend/onnx/`, which the
PyInstaller `--add-data` already ships. `--collect-all timm` stays; `timm` is still export-only.

## 11. Storage

`embeddings/<id>.json` under `app.getPath('userData')`, beside `predictions/`, one file per real study:

```json
{ "version": 1, "id": "SP-1000", "computedAt": "2026-09-12T20:14:03.000Z",
  "sourceSha256": "…", "model": { "id": "vit_small_patch14_dinov2.lvd142m", "dim": 384, "size": 224, "onnx_sha256": "…" },
  "filmType": "whole-spine", "crop": [384 numbers], "whole": [384 numbers] }
```

`sourceSha256` is the film's `calibration.source_sha256` when the record has one, else `null`; `whole`
is `null` when the film was not available (§12).

- Written atomically by `api.saveEmbedding(id, record)` (IPC `save-embedding`) when a run completes with
  a non-null `embedding`, **after** the sidecar and before the record commit, and by the `Embed` run
  core. Ids are validated like the sidecar's. Refused for the session after `disablePersistence`.
- Read once by `api.loadEmbeddings()` (IPC `load-embeddings`) into a module-scope map in
  `renderer/data/embeddings.js` — the first time anything asks for it (the Find similar tab, the Find
  tab's `Embed` count, `Export dataset`), not at bootstrap; an unreadable file is skipped with a console
  warning. Every change to the map bumps
  `state.embeddingsVersion`, a counter, so subscribers redraw; the vectors themselves are never in
  `state`.
- Deleted with the study: `deletePrediction(id)` removes both `predictions/<id>.json` and
  `embeddings/<id>.json`, ENOENT is success for each, and `forgetEmbedding(id)` clears the map before the
  one `setState`, for the same reason every id-keyed cache is cleared on delete.
- Quarantined with the store: the `load-studies` handler moves `embeddings/` aside as
  `embeddings.corrupt-<timestamp>` under the **same** timestamp as `predictions/`, and the same fallback
  rule (a failed move sets `persistenceUnsafe`) covers it.
- A record whose `model.onnx_sha256` differs from the bundled `embed.json`'s is stale: it is loaded,
  used, and counted by the Find tab's `Embed` button so it can be recomputed; it is never silently
  discarded.

No `STORE_VERSION` bump: `studies.json` is unchanged.

## 12. The `Embed` action

On the Find tab's filter bar, beside `Segment`: `Embed {n}`, where `n` counts the visible (or ticked
visible) real studies that are segmented with full coverage and have no current embedding record.
Hidden when `n` is 0; disabled with `WAIT_FOR_RUN` / `WAIT_FOR_BATCH` while anything runs, like
`Segment`.

It runs through the batch driver as a second kind: `state.batch.kind` is `'segment'` (today's) or
`'embed'`, and the driver's run callback is chosen by kind. The run core `embedStudy(studyId, {batch})`
in `screens/analysis.js`, beside `segmentStudy`:

1. Reads the sidecar for `image_png` and `qc.framing`; no sidecar → failed, `no stored segmentation`.
2. Reads the film's bytes (this session's payload map, else `api.readFile(filePath)`); `null` in a
   batch → the whole-film block is `null` and the run continues, counted as a warning `film not found
   — appearance of the whole film not computed`, never a picker.
3. Sets `state.running`, posts `/embed`, checks the record's identity by `addedAt` after every `await`.
4. Saves `embeddings/<id>.json`, updates the map, bumps `embeddingsVersion`, clears `running` in one
   `setState`.

Progress reads `Embedding {done} of {total}` wherever the batch's text appears (batch §9), the viewer's
run card reads `Computing appearance embedding…` for the running study, `Stop` works after the current
film, and the closing toast follows `batchMessage`'s shape: `Embedded 38 films · 2 without the whole
film (not found)`. Segment runs, embed runs, delete-all and a single run stay mutually exclusive
through `state.running` and `state.batch`.

## 13. `Export dataset`

A third button on the Parameters filter bar, after `Export paired CSV`: `Export dataset`, or `Export
dataset · N selected` when rows are ticked, over exactly the rows the paired export would write
(visible, or ticked visible; demo rows dropped), disabled with the long button's note when that is
disabled. It never writes images.

`api.saveDataset(request)` (IPC `save-dataset`) opens a folder picker (`openDirectory`,
`createDirectory`), then creates `<workspace label or library>-dataset-<YYYY-MM-DD>/` inside it (a
`-2`, `-3` suffix when it exists) and writes four files atomically, each `.tmp` then rename. Cancel
resolves `null` and stays quiet.

| File | One row per | Columns |
|---|---|---|
| `films.csv` | film in the rows | everything `toCsv` writes, then `Film type`, `Coverage` (`full`/`partial`), `Reviewed` (the `reviewedAt` date or blank), `Embedding` (`yes`/`no`), `Crop localizer` (`on`/`off` from `qc.processing`), `Vertebra model`, `Femoral model`, `S1 model`, then the outcome resolved per subject (§9.3) as `Subject outcome`, `Subject reoperation date`, `Subject last follow-up` — so a film-level analysis, a pre-op-only model for instance, has its label on the row without joining the pair table |
| `subjects.csv` | pair per pp §11.2, same `with` rule as the paired export | everything `toPairedCsv` writes, then `Reoperation`, `Reoperation date`, `Last follow-up`, `Outcome status` (`reoperation`/`none`/`not-recorded`/`conflicting`), `Pre-op film type`, `<label> film type` per written visit |
| `vectors.json` | — | `{version: 1, exportedAt, shape: {dim: 44, order: [...22 point names], normalisation: 'mirror-anterior-positive-x, centroid, unit-centroid-size, no-rotation'}, embedding: {model}, films: {id: {shape, crop, whole, filmType}}}`, with `null` for a block the film lacks |
| `manifest.json` | — | app version, `exportedAt`, the counts (films, pairs, unpaired, ambiguous, with a recorded outcome, conflicting, without an embedding), the set of model ids and processing settings seen, the embedding model record, the citation line and `NOT FOR CLINICAL USE` |

Both CSVs open with the same `#` comment block the existing exports carry. The toast, sized by
`toastDuration`: `Dataset written to {folder} · {pairs} pairs · {unpaired} films without a pair ·
{conflicting} subjects with conflicting outcomes`, each clause present only when its count is, in the
paired export's pattern.

## 14. Compute and size

Measured on the development laptop (i5-1135G7, CPU only, two threads) or derived from those figures.

| | Amount |
|---|---|
| `/predict`, added by the embedding stage | about 1 s (two 224 px passes) |
| `Embed` backfill, per film | about 1.5 s including the file read |
| `Embed` backfill, 1,000 films | about 25 min, unattended |
| `embed.onnx` on disk | about 88 MB, beside 560 MB of existing graphs |
| One `embeddings/<id>.json` | about 8 KB |
| 1,000 studies loaded into the map | about 3 MB, read once per session |
| Ranking 1,000 candidates in the renderer | under 5 ms |
| `vectors.json` for 1,000 films | about 10 MB |

The segmentation itself remains the bill: a whole-spine film's crop search is minutes on this laptop.
Nothing here changes it.

## 15. Testing

Pure modules get `node --test`; the DOM gets a smoke suite and a human gate; the backend gets pytest.

- `test/similarity.test.js`: the 22-point order; mirror on a left-facing spine and not on a
  right-facing one; centroid and unit size; a partial or unoriented study → `null`; shape distance is
  zero for a copy and symmetric; cosine distance on unit vectors; median scaling with 2, 3 and many
  candidates and with a zero median; each mode's weights; `W` only between two whole-spine films;
  `matchScore` bounds; candidates: real only, not self, scope both ways including `HAND_ADDED`, same
  subject excluded, no embedding excluded under `both`/`appearance` and kept under `shape`; sort and
  tie order; `n`.
- `test/outcomes.test.js`: every row of §9.3's table; the date rules; a film without a subject; the
  import normalisation of `Reoperation`; `autoMap`'s longest-first rule with `reoperation_date`.
- `test/dataset.test.js`: `films.csv` and `subjects.csv` builders over a fixture library (columns,
  order, blanks never `0`, demo dropped, the rows equal the paired export's), `vectors.json` and the
  manifest counts, the folder name and its suffix rule, the toast.
- `test/batch.test.js` (extend): `kind`, the embed run's outcomes (`ok`, `warning`, `failed`), the
  progress text per kind.
- `test/persistence.test.js` / `test/api-persistence.test.js` (extend): `saveEmbedding` refused after
  `disablePersistence`; `deletePrediction` removes both files; the quarantine moves three things under
  one timestamp.
- Backend: `test_embedding.py` — `preprocess` shape, dtype, letterbox geometry and normalisation on a
  synthetic image; `embed` returns 384 finite unit-norm values on the real graph when it exists (skipped
  otherwise, as the ONNX tests already are); `film_type` per §7.2; `/embed` with both inputs, one input,
  none (422); `/predict` carries `embedding` and survives a missing graph with `null`.
  `test_onnx_models.py` / `test_onnx_runtime.py` (extend): five kinds; `embed.json`'s fields.
- `tools/smoke/smoke-similar.mjs`: injected studies (the existing `inject-study.js`) with synthetic
  geometry, `embeddings/` files and outcome fields; the tab's controls, five cards, the footer counts,
  empty states, card click → two panes and `Δ` columns, `Embed` count and a run, `Export dataset` over a
  scratch folder (four files, row counts). Baselines recorded in `tools/smoke/README.md`.
- Human gate, on a real library: the five nearest look alike to a clinician's eye in each mode; a
  whole-spine query's `W` contributes; the angle deltas read correctly signed; the outcome lines match
  the drawer; `Embed` fills an older library; the export folder opens in a spreadsheet and the notebook
  reads `vectors.json`.

## 16. Amendments this forces

To the architecture contract, in the same commit as the plan:

1. **`renderer/data/similarity.js`** — its section is replaced: `vector`, `shapeDistance`,
   `appearanceDistance`, `fuse`, `matchScore`, `candidates`, `findSimilar` per §7.
2. **New modules**: `renderer/data/outcomes.js` (§9.3), `renderer/data/embeddings.js` (§11),
   `renderer/data/dataset.js` (§13), `renderer/components/similar.js` (§8), `backend/embedding.py`
   (§10.2).
3. **State keys**: `similarScope`, `similarRank`, `embeddingsVersion`; `batch.kind`.
4. **`renderer/api.js`**: `saveEmbedding`, `loadEmbeddings`, `saveDataset`; `deletePrediction` removes
   two files. **`main.js`**: `save-embedding`, `load-embeddings`, `save-dataset`; the quarantine triple.
5. **Backend API**: `/predict` and `/predict-stream` responses gain `embedding`; new `POST /embed`;
   the `embedding` stage; the fifth graph in `backend/onnx/` and the verifiers.
6. **`KNOWN_FIELDS`** is twelve names; `autoMap` matches longest first.
7. **Persistence**: `embeddings/<id>.json`; the quarantine moves three things; `STORE_VERSION`
   unchanged.
8. **Plan 07**: Tasks 1–2 superseded by this document; Tasks 3–6 kept.
9. **Both packaging allowlists**: unchanged — no new root module; the IPC lives in `main.js` and the
   atomic write in `store-io.js`.

## 17. Sequencing

Two plans, the second depending on the first only for the `embedding` key and `/embed`:

- **Plan A, backend** (≈5 tasks): the export kind and `embed.json`; `backend/embedding.py`; the
  `/predict` stage; `/embed`; the verifiers and workflow strings; pytest throughout. Deliverable: a
  source launch whose `/predict` returns `embedding`.
- **Plan B, renderer** (≈9 tasks): `embeddings.js` and the IPC; `similarity.js`; `outcomes.js` and the
  three fields; the tab (`similar.js`, the analysis screen wiring); comparison mode (plan 07 Tasks 3–6);
  the `Embed` batch kind; `dataset.js` and `Export dataset`; the smoke suite; the human gate and the
  records.

Plan B's tab can be built and smoke-tested against injected `embeddings/` files before Plan A lands, so
the two can run in parallel on separate branches if wanted.

## 18. Risks and open questions

- **Embedding quality on radiographs is unproven here.** DINOv2 is a general model. The acceptance test
  is the human gate's first check, and the cheap fallback is ranking by shape, which needs no model.
  If appearance neighbours look random on the real library, decision 4 is what changes.
- **Whole-spine detection depends on the localizer being on.** Decision 5's cost. The export records
  the setting per film; the notebook can stratify.
- **The same subject in a later model.** Excluding the same subject from the cards is a display rule;
  the notebook must split by subject, not by film, when it trains. The manifest says so.
- **Short follow-ups.** `Last follow-up` exists so the notebook can apply a horizon; the app itself
  makes no such judgement and its footer counts what is recorded.
- **The hub download at export time** (decision 13). If it proves flaky, commit the checkpoint to LFS
  and point the export tool at it.
- **`/embed` inputs.** The framed `image_png` is source resolution; a very large film's PNG round-trips
  through the renderer today for the viewer, so the multipart size is nothing new, but the batch reads
  a thousand sidecars in a night — the read is lazy and sequential, one at a time, like the runs.
- **Card copy for `conflicting`.** Surfacing a data problem as an outcome line is deliberate; if it
  reads as noise, the alternative is a drawer warning and `not recorded` on the card.

## 19. Later stages

`docs/ROADMAP.md` §8 records stages 2–4: pair-vector ranking with pre, post and delta blocks; the
cluster map; the model registry, recipe file and risk panel; in-app retraining; a subject-keyed CSV
import; an optional pelvic sub-block; a whole-film block at a taller resolution.
