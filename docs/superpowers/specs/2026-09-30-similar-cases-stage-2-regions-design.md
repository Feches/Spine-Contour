# Similar cases, stage 2: every measured parameter, every region

**Status:** approved in conversation 2026-09-30 (the user's rulings are §5); written for the user's review of this
file, then `docs/superpowers/plans/2026-09-30-similar-cases-stage-2-regions.md`. Amends the stage-1 spec
(`2026-09-12-similar-cases-outcomes-design.md`, "stage 1" below): decisions 1, 2, 5, 7 and 15 change as §5 says;
everything else in stage 1 stands. Built on the branch `claude/image-similarity-visualization-400922` **after** it has
merged `fork/main` at its current tip — v1.0.15, `c53e91d`, as of 2026-10-03 — or later (`docs/superpowers/NEXT-SESSION.md`,
step 1); nothing here can be built on the
v1.0.8 base, because every new input comes from the trunk's 1.0.9–1.0.12 work.

**Implemented 2026-10-03** on `claude/image-similarity-visualization-400922`, after the merge of `fork/main` @ `c53e91d`
(v1.0.15) as `afa6164` and its two-commit fix wave (`87b7a5d`, `4164673`), by plan Tasks 1–9 (`e288b88`, `fcb02a1`,
`cafab47`+`948f487`, `335808d`, `6da2963`+`780d4c8`, `80effa6`+`a1f87d6`+`a564e1b`, `b1f93d5`, `3ef69c4`, `fceb3ac`; the
plan's `## Ledger` holds every ruling, R1–R17) and Task 10 (the records). Counts at the close: unit 678/678; backend
744 passed, 4 skipped; `smoke-similar.mjs` 125/125, `smoke-parameters.mjs` 58/58, `smoke-studies.mjs` 151/151,
`smoke-persist.mjs` 41/41 then 54/54. **Not run:** the human gate (plan Task 11), a packaged build, `/embed` over a real
uvicorn socket, a GPU machine for the CPU-only-encoder rule. Where the built interfaces differ from this document's
text, the architecture contract's `## 2026-09-30 amendment: similar cases stage 2` and the two `similarity` module
sections win; the corrections are applied in place below and marked *(amended 2026-10-03)*: §6's `D` row and §7.2 (ruling
R14: `D` follows `discRows`'s own calibration rule), §7.1's `shapePair` signature and return, §7.5's embedding
requirement, §7.6's return shape and §11's `planEmbed`.

## 1. Problem

Stage 1 ranks the library on five blocks: the 22 lumbar landmarks, the hip midpoint, five spinopelvic angles and two
appearance embeddings. Since it was built the trunk has added, per film: a resolved **region** (lumbar, cervical or full
spine, chosen by hand or by automatic detection), the ten lumbar segmental angles, C2–C7 landmarks with the C2–C7 Cobb
angle and C2–C7 SVA, the ten cervical segmental angles, and the global C7–S1 SVA; disc heights in millimetres have
existed since v1.0.2. None of it enters the ranking. Worse, the merge will make the ranking *lose* films: a full-spine
result folds cervical and lumbar coverage into one `qc.coverage.partial`, so a film with a complete lumbar column and one
missing neck endplate is dropped under stage 1's partial rule; a cervical-only film has none of the 22 lumbar points and
is never a candidate at all; and the crop embedding on a full-spine film would embed the whole film, because the
full-spine pipeline records its windows under different names, so it would rank a whole-body picture against lumbar
crops.

The user's ruling (2026-09-30): every measured parameter counts, a film without complete parameters still ranks on
what it has, cervical films rank too, and cervical parameters stay a family of their own, apart from the lumbar and
pelvic angles and apart from global balance.

## 2. Goals

1. Every parameter the app measures enters the ranking, each in a block whose entries share a unit, each block scaled
   by its own median (stage 1 §7.4) so no family drowns another by count or by unit.
2. A film ranks on the blocks it has. Missing hips, a missing level, no calibration, no embedding: each removes that
   block from the pair, never the film from the ranking.
3. Cervical and full-spine films rank: on the cervical family for cervical questions, on the lumbar family for lumbar
   questions, on both for whole-spine questions.
4. The user chooses the anatomy in question — Lumbar, Cervical or Whole spine — on the tab, beside the existing
   `Rank by` presets, and the choice follows the open film by default.
5. Appearance follows anatomy: a lumbar crop compares with lumbar crops, a cervical crop with cervical crops, the whole
   film with whole films of the same kind.
6. The dataset export carries every new block so the notebook sees what the app ranks on.

## 3. Non-goals

- No learned weights. Family budgets are equal and every block within a family shares its family's budget equally
  (§5.6); the table stays data, and the notebook learns better numbers once outcomes exist (stage 1 ROADMAP §8).
- No change to what is measured, how, or where it is stored: every input is read from the record as the Measurements
  panel and the CSV exports already read it (`renderer/data/segmental.js`, `cervical.js`, `global-sva.js`,
  `disc-heights.js` on the merged tree).
- No mask-contour block, no femoral radii, no taller whole-film encoder (stage 1 §19 and ROADMAP §8 stand).
- No change to comparison mode, outcomes, `Embed`'s run core, or the columns of `Export CSV` and `Export paired
  CSV` (the dataset folder's files do change, §12).
- No pair-vector ranking (pre, post, delta): that is ROADMAP §8's stage 2 proper and waits for outcomes.

## 4. Current state this builds on

Read on the merged tree, not on the branch as it stands:

- **Regions.** `studyRegion(study)` (`renderer/data/cervical.js`) resolves `'lumbar' | 'cervical' | 'full_spine'`
  from the record's requested region and the result's `geometry.region`. A lumbar result carries `vertebrae.L1–L5`
  (`superior`, `inferior`, `quadrilateral`, `anterior_confirmed`), `s1_superior`, `hip_midpoint`, `femoral_circles`,
  `l1_center`. A cervical result carries `vertebrae.C2` (`inferior` only) and `C3–C7` (`superior`, `inferior`),
  `c2_centroid`, `anterior_side` (`'left' | 'right'`, the user's or the detector's), no lumbar keys. A full-spine result
  carries both sets plus `c7_centroid`, and its `measurements` are the lumbar set (`PI`, `PT`, `SS`, `L1PA`, `LL`)
  merged with the cervical set and `GLOBAL_SVA_PX/MM`.
- **Coverage.** Lumbar: `qc.coverage.{partial, available, missing, unoriented}` over L1–L5, S1 and the femoral heads.
  Full spine: the same keys over the union of the cervical and lumbar coverage, so `partial` is true when anything in
  either region is missing. Cervical: over C2–C7.
- **Derived values, each pure and null-safe:** `segmentalValues(study)` → `{SEG_lordosis_L1-L2, SEG_angulation_L1-L2,
  …}` for the film's region (ten lumbar keys, ten cervical, twenty on full spine), degrees, from the saved endplates and
  the bound calibration; `discRows(study)` → five rows of `{anterior, middle, posterior}` in mm, null without a usable
  calibration *(`normalizeCalibration` plus its own width and height bounds, not `boundCalibration` — §7.2, amended
  2026-10-03)*; `cervicalMeasurements(study)` → `{C2C7_COBB, C2C7_SVA_PX, C2C7_SVA_MM}`; `globalSvaMeasurements(study)` →
  `{GLOBAL_SVA_PX, GLOBAL_SVA_MM}` (full spine only). `_MM` values are null without a bound calibration; `_PX` values
  are never compared across films (magnification).
- **Framing windows.** Lumbar: `qc.framing.window = [x0, y0, x1, y1]` (source pixels), `searched`, `whole_film_won`.
  Full spine: `qc.framing.lumbar_window` and `qc.framing.cervical_window`, each `[left, top, right, bottom]` or null,
  no `window`, no `searched`. Cervical: `qc.framing.window = [x0, y0, width, height]` — **x, y, width, height, not
  corners** — or null when the detector found nothing. The stage-1 `crop_window` reads only `window` as corners.
- **The embedding record** (stage 1 §11): `{version: 1, id, computedAt, sourceSha256, model, filmType, crop, whole}`;
  `filmType` is the framing proxy (`'whole-spine' | 'lumbar' | null`).
- **The tab** (stage 1 §8): `SCOPE` and `RANK BY` segmented controls, an eyebrow, five cards whose line 1 names the
  blocks that did not enter, line 3 the four angle differences, the footer, the tails.
- **`Embed`** (stage 1 §12, gate decision 75): counts films that `needsEmbedding` — real, segmented, `vector(study)`
  non-null, no current record — and a note `{k} partial — not embeddable` for the rest.

## 5. Decisions

Each with what it costs if it is wrong. Where a stage-1 decision is superseded, its number is named.

1. **Blocks are grouped into four families, and every parameter the app measures is in exactly one block.**
   *(replaces stage-1 decisions 1 and 15)* The families and blocks are §6's table. A family is anatomy (lumbar,
   cervical, whole spine) or kind (appearance); a block is a set of entries that share a unit and a meaning. A new
   single angle joins the block of its family and unit; a new per-level family becomes a block of its own. *Cost if
   wrong:* the fusion takes any number of blocks (stage 1 §7.4); moving an entry between blocks is a table change and
   a re-export of `vectors.json`, nothing stored changes.
2. **Cervical parameters are their own family, apart from the lumbar and pelvic angles and apart from global balance
   (the user, 2026-09-30).** C2–C7 Cobb is the cervical lordosis and joins no lumbar or pelvic block; C2–C7 SVA is
   cervical balance and sits beside neither C7–S1 SVA nor the angles; the cervical segmental angles are a block apart
   from the lumbar segmental angles. *Cost if wrong:* the families are a column in §6's table; regrouping is that
   column.
3. **Units never mix inside a block.** Degrees, millimetres, normalised shape and unit-length embeddings each have
   their own blocks, because one Euclidean distance over a 60 mm SVA and a 12° angle is an SVA ranking with an angle
   ornament. Within the cervical family this makes C2–C7 Cobb and C2–C7 SVA two blocks, grouped by family, not one.
   *Cost if wrong:* a block splits or merges in the table.
4. **Millimetre blocks are present for a pair only when both films carry a bound calibration; pixel values are never
   compared (the user: "when they are available, only on calibrated images").** Disc heights, C7–S1 SVA and C2–C7 SVA
   in `_MM` form only. An uncalibrated film ranks without them and its card says so. *(Amended 2026-10-03, ruling R14:
   "carry a bound calibration" for disc heights means the film has `discRows` values — §7.2.)* *Cost if wrong:* a magnification
   difference would read as anatomy.
5. **A block needs only its own inputs; a film is never excluded from ranking for what it lacks.** *(replaces
   stage-1 decision 7 and gate decision 75)* The partial and unoriented flags no longer gate candidacy or the open
   study; each block's own presence rule (§7) decides. The open study shows cards whenever at least one block of the
   chosen region is present on it; the empty state names the blocks it lacks. `Embed` counts every real segmented film
   without a current record; the `partial — not embeddable` note goes. *Cost if wrong:* a film with little in common
   ranks on the little it has — and the card names every block that did not enter, so the reader sees a thin match for
   what it is.
6. **Shared-entry distances.** *(new)* Every entry-wise block compares over the entries both films have, and the
   distance is normalised per entry so it does not shrink with fewer shared entries:
   - **Shape blocks** (lumbar `V`, cervical `VC`): collect the points present on both films in the block's fixed order,
     apply the block's transform (mirror, centre, scale — §7.1) to each film **over the shared points only**, and take
     the Euclidean distance. Floor: the lumbar shape needs S1 and at least three of L1–L5 shared (≥ 14 points), the
     cervical shape at least four of C2–C7 shared (≥ 14 points); below the floor the block is absent for the pair.
   - **Angle and millimetre blocks** (`A`, the segmental blocks, `D`, `AC`): a weighted root-mean-square over the
     shared entries, `sqrt(Σ w_i (a_i − b_i)² / Σ w_i)` with `w_i = 1` unless the block names weights. Floor: at least
     two shared entries for `A` and `D`, at least three for a segmental block; the single-entry blocks (`B`, `BC`, `AC`)
     are the absolute difference.
   - **Appearance blocks** are whole vectors: present or absent, cosine distance as in stage 1.
   The hip block `H` stays a single point under the lumbar shape's transform and is absent without a hip midpoint on
   both films — but it is now the *shared-point* transform's centroid and scale, so `H` moves consistently with `V`.
   *Cost if wrong:* a pair sharing few entries gets a noisy distance; the floors bound that, and the median scaling is
   over the present pairs only, as before.
7. **Family budgets: each family present for a pair has the same total weight, and each block within a family
   shares its family's budget equally (the user, 2026-09-30).** The nominal weight table is `w_block = 1 / (blocks in
   the family that the region and the mode switch on)`; the fusion's denominator `Σ_present w_i` does the rest when a
   block is absent for a pair. So under `Whole spine · All` a full-spine pair ranks on four families of weight one
   each; under `Lumbar · Alignment` on the lumbar family's three degree/mm blocks. *Cost if wrong:* one table, already
   data (stage 1 §7.4); the notebook replaces it once outcomes exist.
8. **The tab gains a `REGION` control — `Lumbar | Cervical | Whole spine` — and it is an axis of the weight table.**
   *(new, the user's question of 2026-09-30)* The region switches families on and off and narrows the candidates to
   films that have that anatomy (§7.5); `Rank by` switches kinds. Default: the open film's `studyRegion` (`full_spine`
   → Whole spine); the user's pick is a session key like the other two, held for the film it was made on and back to
   the default when another film is opened (the key stores the pick with the open study's id, so no store write is
   needed inside a subscriber), and back to the default as well when the film lacks the picked region's anatomy
   *(amended 2026-10-03, final review: `heldRegion(similarRegion, open)`, read by the tab and the compare chip alike)*.
   *Cost if wrong:* three store values and three rows in a table.
9. **Appearance follows anatomy; the film-type proxy is gone.** *(replaces stage-1 decision 5)* The embedding record
   carries three vectors — `lumbar` (the lumbar window), `cervical` (the cervical window) and `whole` — each null
   where the film has no such window, and the film's `region` from the result, not a guess from the framing. Block
   `C` compares `lumbar` with `lumbar`, `CC` compares `cervical` with `cervical`, `W` compares `whole` with `whole`
   **when both films are full spine**. The backend selects the windows by region (§8). A stage-1 record (`crop`,
   `whole`, `filmType`, version 1) is read as `lumbar = crop`, `cervical = null`, `region = 'lumbar'` and is
   **not current**: `Embed` recomputes it, so the whole library is re-embedded once after this ships (about 1.5 s a
   film, stage 1 §14). *Cost if wrong:* one `Embed` pass; nothing else stored changes.
10. **Cervical shape is 22 points: C2 IA, IP, then C3–C7 SA, SP, IA, IP; mirrored by the recorded `anterior_side`,
    never by the corner means.** *(new)* Cervical labels do not establish the anterior direction
    (`docs/automatic-film-detection.md`), which is why the app asks for the side; the ranking trusts the same answer.
    Centroids are not points of the block: `c7_centroid` is the mean of the four C7 corners already in it, and
    `c2_centroid` is the C2 body's centre from the detector, not a corner, so it would double-count C2. A full-spine
    film has both shape blocks. *Cost if wrong:* a point list and a mirror rule in one reader, exported in
    `vectors.json`'s `cervicalShape.order`.
11. **L1PA joins `A` at weight 0.8 (the user, 2026-09-30).** `A` is `[PI, PT, SS, LL L1-S1, PI−LL, L1PA]`, weights
    `[1, 0.8, 0.8, 0.6, 1, 0.8]`. *Cost if wrong:* one number.
12. **The card names every absent block of the chosen region and mode, in the family's words, and line 3 follows the
    region.** Lumbar and Whole spine keep `PI · LL · PT · SS` differences; Cervical shows `Cobb · SVA` differences
    (SVA in mm, or `—` when either film is uncalibrated). *Cost if wrong:* labels.
13. **`vectors.json` is version 2 and carries every block by its key; a stage-1 reader is told by the version.** The
    README describes the families. *Cost if wrong:* the manifest's version says which layout a folder has.
14. **The two Region presets are enough; no per-family sliders.** ROADMAP §8's slider idea stays deferred behind
    outcomes. *Cost if wrong:* the table is data; sliders are a later stage's UI over it.
15. **Ten cards, not five (the user, 2026-10-03).** *(replaces the card count in stage-1 decision 7 and §8.1)* The
    tab shows up to ten candidates, the nearest first; the footer counts over the cards shown (`n ≤ 10`); the tail
    counts the candidates beyond the ten; the panel scrolls as it already does. Nothing else about a card changes.
    *Cost if wrong:* one number — `findSimilar`'s default `n` — since the footer and the tails already take any `n`.

## 6. The blocks

| Family | Key | Block | Entries | Unit | Present for a pair when |
|---|---|---|---|---|---|
| lumbar | `V` | lumbar shape | L1–L5 SA, SP, IA, IP; S1 SA, SP (22 points), over the shared points | shape | S1 and ≥ 3 levels shared, no shared body unoriented |
| lumbar | `H` | hip | `hip_midpoint` under `V`'s shared-point transform | shape | `V` present and a hip midpoint on both |
| lumbar | `A` | spinopelvic alignment | PI, PT, SS, LL L1–S1, PI−LL, L1PA; weights 1, 0.8, 0.8, 0.6, 1, 0.8 | degrees | ≥ 2 entries shared |
| lumbar | `SL` | lumbar segmental | segmental lordosis and angulation, L1–L2 … L5–S1 (10) | degrees | ≥ 3 entries shared |
| lumbar | `D` | disc heights | anterior, middle, posterior at L1–L2 … L5–S1 (15) | mm | both films have `discRows` values (§7.2) and ≥ 2 entries shared *(amended 2026-10-03)* |
| cervical | `VC` | cervical shape | C2 IA, IP; C3–C7 SA, SP, IA, IP (22 points), over the shared points, mirrored by `anterior_side` | shape | ≥ 4 bodies shared, an anterior side on both |
| cervical | `AC` | cervical lordosis | C2–C7 Cobb | degrees | on both |
| cervical | `BC` | cervical balance | C2–C7 SVA | mm | both calibrated |
| cervical | `SC` | cervical segmental | segmental lordosis and angulation, C2–C3 … C6–C7 (10; C2–C3 lordosis is never available) | degrees | ≥ 3 entries shared |
| whole spine | `B` | global balance | C7–S1 SVA | mm | both full spine and calibrated |
| whole spine | `W` | whole film | the whole-film embedding | picture | both full spine, same model |
| appearance | `C` | lumbar crop | the lumbar-window embedding | picture | on both, same model |
| appearance | `CC` | cervical crop | the cervical-window embedding | picture | on both, same model |

`W` sits in the whole-spine family rather than appearance because it exists only for full-spine pairs; putting it
under appearance would make the appearance family's budget depend on the pair's regions. The three appearance
vectors live in one record and are computed together (§8).

**Region → families.** Lumbar: lumbar + `C`. Cervical: cervical + `CC`. Whole spine: all four families.
**Rank by → kinds.** All: every block. Shape: `V`, `H`, `D`, `VC`. Alignment: `A`, `SL`, `AC`, `BC`, `SC`, `B`.
Appearance: `C`, `CC`, `W`. A block is switched on when its family is on under the region **and** its kind is on
under the mode; its nominal weight is one over the number of switched-on blocks in its family.

## 7. Vectors

### 7.1 Shape blocks over shared points

`lumbarPoints(study)` → `Map<name, [x, y]>` of the points present (each level needs both endplates with four finite
corners and `anterior_confirmed !== false`; S1 needs both points), or an empty map. `cervicalPoints(study)` → the same
over C2 (inferior only) and C3–C7, empty without a valid `anterior_side`. Both return points in original-image
coordinates, unmirrored.

`shapePair(a, b, shape, signA, signB)` *(amended 2026-10-03; the plan reshaped the draft's `(a, b, order, floor, mirror)`)*:
`shape` is `{order, floor, require}` (`LUMBAR_SHAPE`: the 22-name order, floor 14, requiring `S1.SA` and `S1.SP`;
`CERVICAL_SHAPE`: the 22-name order, floor 14, requiring nothing). The names in `shape.order` present in both maps;
below `shape.floor`, or without a required name → null. For each film independently: mirror (`signA`/`signB` fix it when
given — the cervical `sideSign(anterior_side)`, `-1` for `'left'`; when null, the lumbar test: negate x when the mean x of
the shared anterior corners is below the mean x of the shared posterior corners), translate the shared points' centroid to
the origin, scale their centroid size to one, never rotate. Returns `{d, a, b}` where `d` is the Euclidean distance over
the two flattened lists and each of `a`/`b` carries `{list, sign, cx, cy, size}` — the film's normalised list and its
transform, so the hip can follow (`H = [(sign·hx − cx)/size, (hy − cy)/size]`, `hipUnder(hip, transform)`).

`vector(study)` (stage 1's export) stays for the dataset: the full 22-point lumbar vector when the column is complete,
else null; `cervicalVector(study)` is its cervical twin. The ranking no longer calls `vector` for presence.

### 7.2 Entry blocks

Each entry block is read into a fixed-order array with `null` for an absent entry:

- `alignment(study)` → `[PI, PT, SS, LL, PI−LL, L1PA]`, each finite or null.
- `lumbarSegmental(study)` → the ten `SEG_*` lumbar keys of `segmentalValues`, in `segmentalColumns('lumbar')` order.
- `cervicalSegmental(study)` → the ten cervical keys.
- `discHeights(study)` → the fifteen `discRows` values, level-major then anterior, middle, posterior. *(Amended
  2026-10-03, ruling R14.)* Block `D` follows `discRows`'s own calibration rule, unchanged — `normalizeCalibration` plus
  its own width and height bounds, the same values the Measurements panel and both CSV exports show — not
  `boundCalibration` (digest and size), which would blank `D` on a toolbar-removed film whose panel shows heights.
  `discRows` never returns pixels, so no pixel value can enter; the value is null where `discRows` has none. Cost if
  wrong: a calibration from another image of the same size could feed `D`, the same exposure the panel already has.
- `cervicalLordosis(study)` → `[C2C7_COBB]`; `cervicalBalance(study)` → `[C2C7_SVA_MM]`; `globalBalance(study)` →
  `[GLOBAL_SVA_MM]`, null unless `studyRegion` is `full_spine`.

`entryDistance(a, b, weights, floor)` → the weighted RMS over the indices finite on both, or null below the floor.

### 7.3 Appearance

Unchanged arithmetic: `1 − a·b` over unit vectors from the same `model.onnx_sha256`. `C` over `record.lumbar`, `CC`
over `record.cervical`, `W` over `record.whole` with both films `full_spine`.

### 7.4 The weight table and the fusion

`weightsFor(region, mode)` → `{V, H, A, SL, D, VC, AC, BC, SC, B, W, C, CC}` per §6's rule, computed, not hand-written,
so the families and kinds are the only tables. `fuse(distances, scales, weights)` is stage 1's, unchanged; `matchScore`
unchanged. `medianScale`: `m_i` is the median of `d_i` over every candidate for which the block is present — one
candidate's value is itself, two candidates' their mean — when at least one is present and the median is positive, else
`1` *(amended 2026-10-03, final review, ruling R20: stage 1 §7.4's "when at least three such candidates exist" let a
millimetre block shared by one or two calibrated candidates enter the fusion as raw millimetres beside median-scaled
blocks and bury those films)*.

### 7.5 Candidates

A study `c` is a candidate for `o` under `{scope, region, mode}` when: real and not `o`; segmented (`measurements` and
`geometry` present); in scope (stage 1's rule); not the same subject; **has the region's anatomy** — Lumbar: a
non-empty `lumbarPoints` or any finite lumbar entry; Cervical: a non-empty `cervicalPoints` or any finite cervical
entry; Whole spine: `studyRegion(c) === 'full_spine'`; and, under `all`/`appearance`, an embedding record *(amended
2026-10-03: any record, as in stage 1 — a record from another graph still ranks the film on the other blocks and is
counted as `stale`; the appearance blocks need the same graph on both films, §7.3)*. The
open study passes the same anatomy test or the tab shows an empty state. A pair with no present block is dropped, as
before.

### 7.6 `findSimilar`

`findSimilar(open, all, {scope, region, mode, embeddings, n})` → `{matches: [{study, d, match, blocks, absent}],
total, stale, region, weights}` *(amended 2026-10-03: `region` is the region used — the open film's when none is
passed — and `weights` the table; `n` defaults to 10)*; `absent` lists the switched-on blocks that were not present for the
pair, for the card. `stale` as in stage 1.

## 8. Backend

`embedding_record(image, framing, region)` → `{model, lumbar, cervical, whole, region}`:

- `region` is the result's region (`/predict`: `body_part` after detection; `/embed`: a new optional form field
  `region`, default `lumbar` for a stage-1 caller).
- Windows by region, each cut by a `crop_window` that accepts corners or, for the cervical pipeline, x/y/width/height
  (`framing.window` on a cervical result is `[x, y, w, h]`; the function converts when a `region` of `cervical` says
  so): lumbar → `framing.window`; full spine → `framing.lumbar_window` and `framing.cervical_window`; cervical →
  `framing.window` as the cervical window. A null or degenerate window → that vector is null, never the whole film
  standing in for a crop.
- `whole` as before; `film_type` is dropped.
- `/embed` keeps its multipart shape (`file`, `framing`) and adds `region`; `/predict` passes `body_part`. Everything
  else in stage 1 §10 stands: all-or-nothing on a graph failure, 503 without `embed.json`, the `embedding` stage.

## 9. Storage

`EMBEDDING_VERSION = 2`: `{version: 2, id, computedAt, sourceSha256, model, region, lumbar, cervical, whole}`, any of
the three vectors null. `validEmbedding` accepts version 1 and 2; `embeddingRecord` writes 2; `readEmbedding(record)`
lifts a version-1 record to the version-2 shape in memory (`lumbar = crop`, `cervical = null`, `region = 'lumbar'`);
`isCurrent` is false for a version-1 record, so `Embed` recomputes it. No `STORE_VERSION` bump; `studies.json` is
unchanged.

## 10. The tab

Top to bottom: `SCOPE` (unchanged), **`REGION  Lumbar | Cervical | Whole spine`** (`state.similarRegion`, default per
decision 8), `RANK BY` (unchanged), the eyebrow now `RANKED BY {REGION} {KINDS}` (`RANKED BY LUMBAR SHAPE`, `RANKED BY
CERVICAL ALIGNMENT`, `RANKED BY WHOLE-SPINE SHAPE, ALIGNMENT AND APPEARANCE`), up to ten cards (decision 15), the
footer over the cards shown, the tails. A Region button whose anatomy the open film lacks is disabled with a title
saying so.

**Card line 1** names each absent switched-on block in the family's words: `· no hip`, `· no alignment`, `· no
segmental`, `· no disc heights`, `· no cervical shape`, `· no cervical lordosis`, `· no cervical balance`, `· no
cervical segmental`, `· no global balance`, `· no lumbar crop`, `· no cervical crop`, `· no whole film`; `· no shape`
for `V`. **Line 3** per decision 12.

**Empty states:** unsegmented (unchanged); `This study has no {region} anatomy to rank on — choose another region.`, or
`This study has no anatomy to rank on yet.` when the film has none of the three regions' anatomy;
`No appearance embedding for this study yet — …` (unchanged); `Alignment needs at least one measured {region} angle on
this study.`; `This study has no {region} {shape|alignment|appearance|shape, alignment or appearance} to rank on — rank
by another kind or choose another region.` when the open film has none of the mode's blocks against itself; no
candidates, `No other eligible {region} studies in this workspace.` / `… in the library.` *(amended 2026-10-03, final
review, ruling R21: the no-anatomy and no-blocks sentences are new, and the no-candidates sentence names the region)*.

## 11. `Embed`

`needsEmbedding(study)`: real, segmented, no current record — `vector(study)` no longer gates. `cannotEmbed` and the
`partial — not embeddable` note are removed; `planEmbed` loses the `excluded` count and the `ineligible` predicate
altogether *(amended 2026-10-03: the draft said `excluded` stays at 0)*.
The run core posts `region: studyRegion(study)` with the sidecar image and framing.

## 12. `Export dataset`

`vectors.json` version 2: `{version: 2, exportedAt, families: {...}, blocks: {V: {dim: 44, order, normalisation}, H,
A: {order, weights}, SL: {order}, D: {order}, VC: {dim: 44, order, normalisation: 'mirror-by-anterior-side, …'}, AC,
BC, SC, B, embedding: {model}}, films: [{name, region, V, H, A, SL, D, VC, AC, BC, SC, B, lumbar, cervical, whole}]}`,
null per absent block; the full lumbar and cervical shape vectors (not shared-point ones, which are pairwise) with
null where the column is incomplete. `parameters.csv` replaces the `Film type` column with `Region`, and `paired.csv`'s
per-visit `<header> film type` columns become `<header> region`. `manifest.json` counts films per region. The README's block paragraph is rewritten from the table. Stage 1's rule stands: no image,
path or record id.

## 13. Testing

Unit (`test/similarity.test.js` extended, plus `test/similarity-regions.test.js`): the shared-point transform gives
the same distance as stage 1's when both films are complete; drops below the floor to null; mirrors a cervical film
by side; `entryDistance` ignores a null on either side and returns null below the floor; `weightsFor` sums to one per
switched-on family for every region×mode; a full-spine pair under Whole spine has thirteen candidate blocks, a
lumbar-vs-full-spine pair under Lumbar has six and no `W`; an uncalibrated film has no `D`, `B`, `BC`; a stage-1 record
lifts and reads as not current; candidates by region. Dataset tests for the version-2 file. Backend: `crop_window` on
each window form; `embedding_record` per region with null vectors; `/embed` with and without `region`.

Smoke (`smoke-similar.mjs`): the Region control renders and defaults to the open film's region; a cervical fixture
ranks under Cervical and is empty under Lumbar with the named reason; the card's absent labels; eleven eligible
candidates render ten cards and a tail of one.

Not automatable, the human gate: a real full-spine film opened under each region; a real cervical film; `Embed` over a
library holding stage-1 records (the count equals the library, then zero); `Export dataset`'s version-2 file opened.

## 14. Sequencing

Backend first (`embedding.py`, `/embed`, `/predict`; tests), then the record and store, then `similarity.js` block by
block behind the old signatures, then the region axis and `findSimilar`, then the tab, then `Embed`, then the export,
then the records (contract amendment, spec status lines, ROADMAP §8, HANDOFF, CLAUDE.md). The plan names the tasks.

## 15. Amendments this forces

Stage-1 spec: decisions 1, 2, 5, 7, 15 superseded as §5 says; §7, §8.1, §8.2, §8.4, §10.2, §10.4, §11, §12, §13
amended by reference to this document. Architecture contract: `renderer/data/similarity.js`'s interface (new exports
per §7, `findSimilar`'s `region` option, `BLOCK_KEYS` thirteen, `MODES` replaced by `weightsFor`), `data/embeddings.js`
(version 2, `readEmbedding`), `renderer/embeddings.js` (`cannotEmbed` removed), state key `similarRegion`, the
backend API's `embedding` shape and `/embed`'s `region` field, `vectors.json` version 2. ROADMAP §8: the segmental
item is done; family sliders stay. HANDOFF: gate decision 75 superseded.

## 16. Risks and open questions

- **Shared-point shape distances are pairwise, so `V` and `VC` have no single stored vector per film** — only the
  export's complete vectors. Ranking a thousand candidates stays under a few milliseconds (22 points a pair).
- **Equal family budgets are a prior, not a finding.** The user knows; the notebook learns better once outcomes exist.
- **A cervical film's `framing.window` is x/y/width/height.** The conversion is in one function with a test; a reader
  who assumes corners would cut the wrong region silently, which is why §8 spells it out.
- **The whole library is re-embedded once.** `Embed`'s count after the merge is the library size; the user should
  expect it.
