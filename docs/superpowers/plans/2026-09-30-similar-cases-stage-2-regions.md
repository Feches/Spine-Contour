# Similar Cases Stage 2 (Regions and Every Measured Parameter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank the library on every parameter the app measures, grouped into four block families with equal budgets, with a Region control on the Find similar tab, so lumbar, cervical and full-spine films all rank on what they have.

**Architecture:** A new pure module `renderer/data/similarity-blocks.js` holds the block registry (thirteen blocks in four families, each with its region list, kind, floor and weights) and the readers that turn a study record plus its embedding record into points, entry arrays and vectors. `renderer/data/similarity.js` keeps the ranking: shared-point shape distances, per-entry distances, the computed weight table, candidates by region, `findSimilar`. The backend's `embedding_record` chooses windows by region and returns three vectors; the stored record moves to version 2 and a version-1 record reads as stale so `Embed` recomputes it. The tab gains a `REGION` segmented control whose pick is keyed to the open study's id.

**Tech Stack:** Vanilla ES modules (no bundler, no dependencies), `node --test`; Python/FastAPI with ONNX Runtime, pytest; the CDP smoke harness under `tools/smoke/`.

**Spec:** `docs/superpowers/specs/2026-09-30-similar-cases-stage-2-regions-design.md` (stage 2). Stage 1 is `docs/superpowers/specs/2026-09-12-similar-cases-outcomes-design.md`; the binding interfaces are `docs/superpowers/plans/2026-08-31-00-architecture-contract.md`.

## Prerequisites (not tasks — the state the executor must find)

- The branch `claude/image-similarity-visualization-400922` has merged `fork/main` at `7ce278f` (v1.0.12) or later
  in a merge commit (`docs/superpowers/NEXT-SESSION.md`, step 1), and on the merged tree: `node --test test/*.test.js`
  and the backend pytest are green; `renderer/data/segmental.js`, `cervical.js`, `global-sva.js`, `disc-heights.js`
  exist; `backend/server.py`'s `/predict` carries both main's `body_part` resolution and the branch's `embedding`
  stage; `backend/onnx/` holds the seven graphs (`s1`, `vertebra`, `femoral`, `hrnet`, `cervical_detr`,
  `cervical_hrnet`, `embed`).
- Working directory: the worktree `C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d`. Never
  `cd` to the primary checkout. Backend tests: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest
  backend -q` (from PowerShell with `Set-Location` first if the Bash tool refuses the venv python). Unit tests:
  `node --test test/*.test.js` (the glob; the directory form fails on Node 24).
- Line numbers below are from the branch before the merge; on the merged tree, search for the quoted anchors.

## Global Constraints

- **Never display a fabricated measurement**: an absent value renders `—` (U+2014), never `0`, never a guess
  (CLAUDE.md). An absent block is absent, never a distance of 0.
- **Never mutate the store's geometry in place**; every reader here is pure and copies nothing it does not own.
- **No bundler, no framework, no runtime dependencies**; `renderer/` cannot import `node:` modules.
- **The `SP-nnnn` record id appears nowhere a person looks** (HANDOFF decision 76): cards and labels name films by
  `studyName`/`filmLabel`; the id only keys rows.
- **Units never mix inside a block; millimetre blocks compare only between two calibrated films; pixel values are
  never compared** (spec decisions 3, 4).
- **A block needs only its own inputs; a film is never excluded for what it lacks** (spec decision 5). The
  `qc.coverage.partial` and `unoriented` flags gate nothing in the ranking.
- **Family budgets are equal and computed, never hand-typed**: `weightsFor(region, mode)` is the only weight source
  (spec decision 7).
- **A cervical result's `framing.window` is `[x, y, width, height]`**; every other window is corners
  `[left, top, right, bottom]` (spec §4, §8).
- **Two embeddings compare only when their `model.onnx_sha256` match** (stage 1 §11).
- Copy: `\u2014` for the dash, `\u00B7` for the separator, `\u2212` for minus in source; commit with the trailer
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; conventional prefixes `feat:`, `fix:`, `test:`, `docs:`.
- Subagent models (the user's standing rule): Sonnet for Tasks 1, 2, 3, 7, 8, 9, 10; Opus for Tasks 4, 5, 6 and for
  every review; never Fable. Every dispatch that runs a suite says "foreground, capture to a file under
  `tools/smoke/out/`".

## Review Focus

1. **A cervical film whose detector found nothing** (`framing.window: null`): the record must still be valid through
   `whole`, `Embed` must not count it forever, and the tab must show it under Cervical on `AC`/`SC` if measured —
   pinned in Task 1 (`test_embedding_record_per_region`) and Task 3 (`validEmbedding` with two null vectors).
2. **A level marked `anterior_confirmed: false` on one film**: it must leave the shared-point set rather than mirror
   the whole film the wrong way — pinned in Task 4 (`lumbarPoints skips an unoriented level`).
3. **Calibration on one film only**: `D`, `B`, `BC` absent for the pair and the card names them — pinned in Task 5
   (`entryDistance returns null below the floor`, `pairDistances leaves the millimetre blocks null when one film is
   uncalibrated`).
4. **A full-spine film with no cervical landmarks at all** (the neck detector failed) under Whole spine: it ranks on
   the lumbar blocks and `B`/`W`, and the cervical blocks are listed absent — pinned in Task 5
   (`findSimilar under full_spine lists the absent cervical blocks`).
5. **`weightsFor` with a family that has no switched-on block** (Whole spine under Shape has no whole-family shape
   block): no division by zero, weights sum to one per switched-on family — pinned in Task 4
   (`weightsFor sums to one per family`).

---

### Task 1: Backend — region windows and the three-vector record

**Files:**
- Modify: `backend/embedding.py` (`crop_window`, remove `film_type`, add `region_crops`, change `embedding_record`)
- Test: `backend/tests/unit/test_embedding.py`

**Interfaces:**
- Consumes: `models._infer`, `load_metadata`, `model_record`, `embed` (unchanged).
- Produces: `REGIONS = ("lumbar", "cervical", "full_spine")`; `crop_window(image, window, *, xywh=False) ->
  ndarray | None`; `region_crops(image, framing, region) -> {"lumbar": ndarray | None, "cervical": ndarray | None}`;
  `embedding_record(image, framing, region="lumbar") -> {"model", "lumbar", "cervical", "whole", "region"}` (each
  vector a `list[float]` or `None`; raises `ValueError` for an unknown region).

- [ ] **Step 1: Replace the window tests with the new contract**

In `backend/tests/unit/test_embedding.py`, delete `test_crop_window_cuts_clips_and_falls_back_to_the_film`,
`test_film_type_reads_the_search_and_who_won` (and its `@pytest.mark.parametrize`) and
`test_embedding_record_uses_the_crop_then_the_whole_film`. Add:

```python
def test_crop_window_takes_corners_or_xywh_and_returns_none_not_the_film():
    image = np.zeros((100, 80), np.uint8)
    assert embedding.crop_window(image, [10, 20, 50, 70]).shape == (50, 40)
    assert embedding.crop_window(image, [10, 20, 40, 50], xywh=True).shape == (50, 40)
    assert embedding.crop_window(image, [-10, -5, 500, 500]).shape == (100, 80)
    assert embedding.crop_window(image, [10.4, 20.6, 50.0, 70.0]).shape == (49, 40)
    for bad in ([10, 10, 12, 12], None, 'nope', [0, 0, 'x', 1], [1, 2, 3]):
        assert embedding.crop_window(image, bad) is None, bad


def test_region_crops_pick_the_windows_the_region_records():
    image = np.zeros((200, 100), np.uint8)
    lumbar = embedding.region_crops(image, {'window': [0, 50, 100, 150], 'searched': True}, 'lumbar')
    assert lumbar['lumbar'].shape == (100, 100) and lumbar['cervical'] is None
    cervical = embedding.region_crops(image, {'window': [10, 20, 60, 40]}, 'cervical')
    assert cervical['lumbar'] is None and cervical['cervical'].shape == (40, 60)  # x, y, width, height
    full = embedding.region_crops(image, {'lumbar_window': [0, 100, 100, 200], 'cervical_window': [0, 0, 100, 60]}, 'full_spine')
    assert full['lumbar'].shape == (100, 100) and full['cervical'].shape == (60, 100)
    assert embedding.region_crops(image, {'lumbar_window': None, 'cervical_window': None}, 'full_spine') == {'lumbar': None, 'cervical': None}
    assert embedding.region_crops(image, None, 'cervical') == {'lumbar': None, 'cervical': None}


def test_embedding_record_per_region(monkeypatch):
    shapes = []
    monkeypatch.setattr(models, '_infer', fake_session([1.0] * 8, shapes))
    monkeypatch.setattr(embedding, 'load_metadata', lambda: META)
    image = np.zeros((200, 100), np.uint8)
    record = embedding.embedding_record(image, {'window': [0, 50, 100, 150]}, 'lumbar')
    assert record['model'] == {'id': 'fixture', 'dim': 8, 'input': [32, 48], 'onnx_sha256': 'abc'}
    assert record['region'] == 'lumbar' and record['cervical'] is None
    assert len(record['lumbar']) == 8 and len(record['whole']) == 8
    assert 'film_type' not in record and 'crop' not in record
    # A cervical film whose detector found nothing: only the whole film, and the record still stands.
    record = embedding.embedding_record(image, {'window': None}, 'cervical')
    assert record == {**record, 'region': 'cervical', 'lumbar': None, 'cervical': None} and len(record['whole']) == 8
    record = embedding.embedding_record(image, {'lumbar_window': [0, 100, 100, 200], 'cervical_window': [0, 0, 100, 60]}, 'full_spine')
    assert len(record['lumbar']) == 8 and len(record['cervical']) == 8 and record['region'] == 'full_spine'
    assert embedding.embedding_record(image, None).get('region') == 'lumbar'  # the default for a stage-1 caller
    with pytest.raises(ValueError, match='region'):
        embedding.embedding_record(image, None, 'thoracic')
    assert all(shape == (1, 3, 32, 48) for shape in shapes)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend/tests/unit/test_embedding.py -q`
Expected: FAIL — `region_crops` not defined; `crop_window` returns the image for a bad window; `film_type` still exists.

- [ ] **Step 3: Rewrite the window and record functions**

In `backend/embedding.py`, replace `crop_window`, `film_type` and `embedding_record` with:

```python
REGIONS = ("lumbar", "cervical", "full_spine")


def crop_window(image: np.ndarray, window, *, xywh: bool = False) -> np.ndarray | None:
    """The film cut by `window`, clipped to the film: corners [left, top, right, bottom], or with
    `xywh` the cervical pipeline's [x, y, width, height] (spec 2026-09-30, section 8). None -- never
    the whole film standing in for a crop -- when the window is absent, malformed or degenerate."""
    if not isinstance(window, (list, tuple)) or len(window) != 4:
        return None
    try:
        values = [float(v) for v in window]
    except (TypeError, ValueError):
        return None
    if xywh:
        x0, y0, w, h = values
        x1, y1 = x0 + w, y0 + h
    else:
        x0, y0, x1, y1 = values
    x0, y0, x1, y1 = (int(round(v)) for v in (x0, y0, x1, y1))
    height, width = image.shape[:2]
    x0, x1 = max(0, min(x0, width)), max(0, min(x1, width))
    y0, y1 = max(0, min(y0, height)), max(0, min(y1, height))
    if x1 - x0 < 8 or y1 - y0 < 8:
        return None
    return image[y0:y1, x0:x1]


def region_crops(image: np.ndarray, framing, region: str) -> dict:
    """The lumbar and cervical crops a region's framing record locates (spec section 8): a lumbar
    result's `window` is the lumbar crop; a cervical result's `window` (x, y, width, height) is the
    cervical crop; a full-spine result names both under `lumbar_window` and `cervical_window`."""
    framing = framing if isinstance(framing, dict) else {}
    if region == "cervical":
        return {"lumbar": None, "cervical": crop_window(image, framing.get("window"), xywh=True)}
    if region == "full_spine":
        return {"lumbar": crop_window(image, framing.get("lumbar_window")),
                "cervical": crop_window(image, framing.get("cervical_window"))}
    return {"lumbar": crop_window(image, framing.get("window")), "cervical": None}


def embedding_record(image: np.ndarray, framing, region: str = "lumbar") -> dict:
    """{model, lumbar, cervical, whole, region} for one film (spec 2026-09-30, sections 8 and 9):
    each crop vector None where the region has no such window; `whole` always. Raises ValueError for
    an unknown region and EmbeddingUnavailable without the graph; the callers decide what fails."""
    if region not in REGIONS:
        raise ValueError(f"Unknown region {region!r}; available: {', '.join(REGIONS)}")
    metadata = load_metadata()
    crops = region_crops(image, framing, region)
    return {"model": model_record(metadata),
            "lumbar": embed(crops["lumbar"], metadata) if crops["lumbar"] is not None else None,
            "cervical": embed(crops["cervical"], metadata) if crops["cervical"] is not None else None,
            "whole": embed(image, metadata),
            "region": region}
```

Update the module docstring's second paragraph to say the record carries a lumbar crop, a cervical crop and the
whole film, chosen by region.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend/tests/unit/test_embedding.py -q`
Expected: PASS. Then the whole backend suite: the `/embed` and `/predict` integration tests in
`backend/tests/integration/test_server.py` that assert `film_type` or `crop` will now FAIL — that is Task 2's work;
note the failing names in the commit body and go on.

- [ ] **Step 5: Commit**

```bash
git add backend/embedding.py backend/tests/unit/test_embedding.py
git commit -m "feat(backend): the embedding record carries lumbar, cervical and whole-film vectors chosen by region"
```

---

### Task 2: Backend — `/embed` takes a region; `/predict` passes the resolved one

**Files:**
- Modify: `backend/server.py` (`embed_request`, `run_embedding`, the `embedding` stage inside `predict`)
- Test: `backend/tests/integration/test_server.py`

**Interfaces:**
- Consumes: `embedding_record(image, framing, region)` from Task 1.
- Produces: `POST /embed` multipart gains `region` (`lumbar` default; `cervical`, `full_spine`; anything else 422);
  the response `{"embedding": {model, lumbar, cervical, whole, region}}`; `/predict`'s `embedding` key has the same
  shape with `region` = the resolved `body_part`.

- [ ] **Step 1: Update the server tests**

In `backend/tests/integration/test_server.py`, find `test_embed_endpoint_returns_the_record_from_the_stored_image_and_framing`
and `test_predict_carries_the_embedding_and_records_that_it_computed_one`. Wherever they patch
`server.embedding_record` with a fake, make the fake accept `(image, framing, region="lumbar")` and return
`{"model": {...}, "lumbar": [...], "cervical": None, "whole": [...], "region": region}`; replace every assertion on
`film_type`/`crop` with `region`/`lumbar`. Add:

```python
def test_embed_endpoint_passes_the_region_and_rejects_an_unknown_one(monkeypatch):
    seen = {}

    def fake_record(image, framing, region="lumbar"):
        seen['region'] = region
        return {"model": {"id": "m", "dim": 2, "input": [8, 8], "onnx_sha256": "abc"},
                "lumbar": None, "cervical": [1.0, 0.0], "whole": [0.0, 1.0], "region": region}

    monkeypatch.setattr(server, "embedding_record", fake_record)
    response = client.post("/embed", files={"file": ("s.png", PNG_BYTES, "image/png")},
                           data={"region": "cervical", "framing": json.dumps({"window": [1, 2, 30, 40]})})
    assert response.status_code == 200 and seen['region'] == 'cervical'
    assert response.json()["embedding"]["region"] == "cervical"
    response = client.post("/embed", files={"file": ("s.png", PNG_BYTES, "image/png")})
    assert response.status_code == 200 and seen['region'] == 'lumbar'
    response = client.post("/embed", files={"file": ("s.png", PNG_BYTES, "image/png")}, data={"region": "thoracic"})
    assert response.status_code == 422 and "region" in response.json()["detail"]
```

Use the same `client`, `PNG_BYTES` (or whatever the file already names its one-pixel PNG fixture) and `server`
import the neighbouring `/embed` tests use; read them first.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend/tests/integration/test_server.py -q -k "embed or embedding"`
Expected: FAIL — `region` is not a form field; the fakes are called with two arguments.

- [ ] **Step 3: Thread the region through**

In `embed_request`:

```python
async def embed_request(file: UploadFile = File(...), framing: str | None = Form(None),
                        region: str = Form("lumbar"),
                        processing_mode: str = Form("standard"), cpu_threads: int = Form(2)):
    ...
    if region not in REGIONS:
        raise HTTPException(status_code=422, detail=f"Unknown region {region!r}; available: {', '.join(REGIONS)}")
    return {"payload": payload, "framing": parsed, "region": region, "settings": settings}
```

Import `REGIONS` beside `embedding_record` in both import branches at the top of `server.py`. In `run_embedding`:
`result = embedding_record(image, request["framing"], request["region"])`. In `predict`, the embedding stage the
branch added ("Computing appearance embeddings") becomes
`embedding = embedding_record(prediction["image"], prediction["framing"], body_part)` — `body_part` is the variable
main's `predict` reassigns after auto detection, so it is the resolved region by the time the stage runs.

- [ ] **Step 4: Run the whole backend suite**

Run: `"C:/Users/codyj/spine contour/.venv/Scripts/python.exe" -m pytest backend -q`
Expected: PASS (the counts go in the ledger).

- [ ] **Step 5: Commit**

```bash
git add backend/server.py backend/tests/integration/test_server.py
git commit -m "feat(backend): /embed takes the film's region; /predict embeds by the resolved one"
```

---

### Task 3: The stored record, version 2

**Files:**
- Modify: `renderer/data/embeddings.js`
- Modify: `renderer/embeddings.js:32-35` (the load loop) and `:81-92` (`needsEmbedding`, `cannotEmbed`)
- Test: `test/embeddings.test.js`

**Interfaces:**
- Produces: `EMBEDDING_VERSION = 2`; `validEmbedding(record)` (accepts version 1 and 2); `embeddingRecord(id,
  embedding, opts)` (writes version 2 from a `{model, lumbar, cervical, whole, region}` response); `readEmbedding(record)
  -> record | null` (a version-1 record lifted to the version-2 field set, keeping `version: 1`); `isCurrent(record,
  bundledSha)` (false for any version other than 2). `renderer/embeddings.js`: `needsEmbedding(study)` no longer
  requires a shape vector; `cannotEmbed` is deleted.

- [ ] **Step 1: Rewrite the record tests**

Replace the body of `test/embeddings.test.js` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMBEDDING_VERSION, validEmbedding, embeddingRecord, readEmbedding, isCurrent } from '../renderer/data/embeddings.js';

const MODEL = { id: 'vit_small_patch14_dinov2.lvd142m', dim: 3, input: [224, 224], onnx_sha256: 'abc' };
const EMBEDDING = { model: MODEL, lumbar: [0.6, 0.8, 0], cervical: null, whole: [1, 0, 0], region: 'lumbar' };
const V1 = { version: 1, id: 'SP-1', computedAt: 'x', sourceSha256: null, model: MODEL, filmType: 'lumbar', crop: [0, 1, 0], whole: null };

test('embeddingRecord writes version 2 from a backend record and keeps null vectors null', () => {
  const record = embeddingRecord('SP-1000', EMBEDDING, { sourceSha256: 'sha', computedAt: '2026-09-30T20:00:00.000Z' });
  assert.deepEqual(record, {
    version: 2, id: 'SP-1000', computedAt: '2026-09-30T20:00:00.000Z', sourceSha256: 'sha',
    model: MODEL, region: 'lumbar', lumbar: [0.6, 0.8, 0], cervical: null, whole: [1, 0, 0],
  });
  assert.equal(EMBEDDING_VERSION, 2);
  assert.notEqual(record.model, MODEL);
  assert.equal(embeddingRecord('SP-1', { ...EMBEDDING, region: 'cervical', lumbar: null, cervical: [1, 0, 0] }).region, 'cervical');
  assert.equal(embeddingRecord('SP-1', { ...EMBEDDING, region: 'thoracic' }).region, 'lumbar');
  // A cervical film whose detector found nothing carries only the whole film, and that is a record.
  assert.equal(embeddingRecord('SP-1', { ...EMBEDDING, lumbar: null, region: 'cervical' }).whole.length, 3);
  assert.equal(embeddingRecord('SP-1', { ...EMBEDDING, lumbar: null, whole: null }), null);
  assert.equal(embeddingRecord('SP-1', null), null);
  assert.equal(embeddingRecord('SP-1', { model: MODEL, lumbar: ['a'], whole: null, region: 'lumbar' }), null);
});

test('validEmbedding accepts version 1 and version 2 and rejects a broken record', () => {
  const good = embeddingRecord('SP-1000', EMBEDDING);
  assert.equal(validEmbedding(good), true);
  assert.equal(validEmbedding({ ...good, lumbar: null, cervical: null }), true);
  assert.equal(validEmbedding(V1), true);
  for (const bad of [null, 'x', { ...good, version: 3 }, { ...good, id: 7 }, { ...good, region: 'thoracic' },
    { ...good, lumbar: [] }, { ...good, whole: 'x' }, { ...good, model: {} }, { ...good, lumbar: null, cervical: null, whole: null },
    { ...V1, crop: [] }]) {
    assert.equal(validEmbedding(bad), false, JSON.stringify(bad));
  }
});

test('readEmbedding lifts a version-1 record to the version-2 fields and leaves its version alone', () => {
  assert.deepEqual(readEmbedding(V1), { version: 1, id: 'SP-1', computedAt: 'x', sourceSha256: null, model: MODEL,
    region: 'lumbar', lumbar: [0, 1, 0], cervical: null, whole: null });
  const v2 = embeddingRecord('SP-2', EMBEDDING);
  assert.equal(readEmbedding(v2), v2);
  assert.equal(readEmbedding({ ...V1, crop: 'x' }), null);
});

test('isCurrent needs version 2 and the bundled graph, and trusts the record when the graph is unknown', () => {
  const record = embeddingRecord('SP-1000', EMBEDDING);
  assert.equal(isCurrent(record, 'abc'), true);
  assert.equal(isCurrent(record, 'def'), false);
  assert.equal(isCurrent(record, null), true);
  assert.equal(isCurrent(readEmbedding(V1), 'abc'), false);
  assert.equal(isCurrent(null, 'abc'), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/embeddings.test.js`
Expected: FAIL — `readEmbedding` is not exported; `EMBEDDING_VERSION` is 1.

- [ ] **Step 3: Rewrite `renderer/data/embeddings.js`**

```js
/**
 * The stored appearance-embedding record (similar-cases spec 2026-09-30, section 9): one file per
 * real study under embeddings/<id>.json. Version 2 carries three vectors chosen by region -- the
 * lumbar crop, the cervical crop and the whole film -- any of them null. A version-1 record (one
 * crop, a film-type proxy) is still read, lifted to the same field set, and reads as not current,
 * so Embed recomputes it once. Pure: the map lives in renderer/embeddings.js.
 */
export const EMBEDDING_VERSION = 2;

const REGIONS = new Set(['lumbar', 'cervical', 'full_spine']);
const VECTORS = ['lumbar', 'cervical', 'whole'];

function finiteList(value) {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'number' && Number.isFinite(v));
}

function vectorOrNull(value) {
  return finiteList(value) ? value : null;
}

function baseValid(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  if (typeof record.id !== 'string') return false;
  return Boolean(record.model && typeof record.model === 'object' && typeof record.model.onnx_sha256 === 'string');
}

export function validEmbedding(record) {
  if (!baseValid(record)) return false;
  if (record.version === 1) return finiteList(record.crop) && (record.whole === null || finiteList(record.whole));
  if (record.version !== EMBEDDING_VERSION || !REGIONS.has(record.region)) return false;
  for (const key of VECTORS) if (record[key] !== null && !finiteList(record[key])) return false;
  return VECTORS.some((key) => record[key] !== null);
}

// From the `embedding` a /predict or /embed response carries. Null when the backend computed none.
export function embeddingRecord(id, embedding, { sourceSha256 = null, computedAt = new Date().toISOString() } = {}) {
  if (!embedding || typeof embedding !== 'object') return null;
  const vectors = Object.fromEntries(VECTORS.map((key) => [key, vectorOrNull(embedding[key])]));
  if (VECTORS.every((key) => vectors[key] === null)) return null;
  return {
    version: EMBEDDING_VERSION,
    id,
    computedAt,
    sourceSha256,
    model: { ...(embedding.model ?? {}) },
    region: REGIONS.has(embedding.region) ? embedding.region : 'lumbar',
    ...vectors,
  };
}

// What the map holds: a valid version-2 record as is, a version-1 record lifted to the same fields
// (its crop was the lumbar window; it never had a cervical vector; every stage-1 film was lumbar).
export function readEmbedding(record) {
  if (!validEmbedding(record)) return null;
  if (record.version === EMBEDDING_VERSION) return record;
  return {
    version: 1, id: record.id, computedAt: record.computedAt, sourceSha256: record.sourceSha256 ?? null,
    model: record.model, region: 'lumbar', lumbar: record.crop, cervical: null, whole: record.whole ?? null,
  };
}

// A record is current when it is the current version and came from the bundled graph. An unknown
// bundled graph (the backend not ready, or no graph installed) keeps what is stored.
export function isCurrent(record, bundledSha) {
  if (!record || record.version !== EMBEDDING_VERSION) return false;
  return bundledSha == null || record.model?.onnx_sha256 === bundledSha;
}
```

- [ ] **Step 4: Read through `readEmbedding` in the store, and drop the shape gate from `needsEmbedding`**

In `renderer/embeddings.js`: import `readEmbedding` beside `validEmbedding, isCurrent`; in `ensureEmbeddings`'s loop
replace the two lines with

```js
    for (const record of loaded) {
      const read = readEmbedding(record);
      if (read) records.set(read.id, read);
      else console.warn(`embeddings: a stored record was skipped (${record?.id ?? 'unknown id'})`);
    }
```

Replace `needsEmbedding` and delete `cannotEmbed` and the `vector` import:

```js
// The Embed button's rule (spec 2026-09-30, section 11): a real, segmented study without a current
// record -- segmented before this build, with the setting off, after a failed stage, under an older
// graph, or with a version-1 record. Coverage gates nothing: a film ranks on the blocks it has.
export function needsEmbedding(study) {
  if (!study || study.source !== 'real' || study.measurements == null || study.geometry == null) return false;
  return !isCurrent(records.get(study.id), bundledModelSha());
}
```

`renderer/screens/studies.js` still imports `cannotEmbed` at this point; Task 7 removes it. Until then the unit
tests pass (no test imports the root module) but the app would throw at load — do Task 7 before launching.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/embeddings.test.js` then `node --test test/*.test.js`
Expected: `embeddings.test.js` PASS; the full run shows failures only in `test/similarity.test.js` and
`test/dataset.test.js` for `filmType`/`crop` (Tasks 5 and 8). Name them in the commit body.

- [ ] **Step 6: Commit**

```bash
git add renderer/data/embeddings.js renderer/embeddings.js test/embeddings.test.js
git commit -m "feat: embedding record version 2 — lumbar, cervical and whole-film vectors by region; version 1 reads as stale"
```

---

### Task 4: `renderer/data/similarity-blocks.js` — the registry and the readers

**Files:**
- Create: `renderer/data/similarity-blocks.js`
- Test: `test/similarity-blocks.test.js`

**Interfaces:**
- Consumes (merged tree): `segmentalColumns(region)`, `segmentalValues(study)` from `./segmental.js`; `discRows(study)`,
  `DISC_LEVEL_PAIRS`, `DISC_POSITIONS` from `./disc-heights.js`; `cervicalMeasurements(study)`, `studyRegion(study)`,
  `validAnteriorSide(side)` from `./cervical.js`; `globalSvaMeasurements(study)` from `./global-sva.js`.
- Produces: `REGIONS`, `FAMILIES`, `KINDS`, `BLOCKS`, `BLOCK_KEYS`, `ENTRY_KEYS`, `LANDMARK_ORDER`, `CERVICAL_ORDER`,
  `ALIGNMENT_ORDER`, `ALIGNMENT_WEIGHTS`, `LUMBAR_SEGMENTAL_ORDER`, `CERVICAL_SEGMENTAL_ORDER`, `DISC_ORDER`,
  `blockOf(key)`, `weightsFor(region, mode)`, `lumbarPoints(study)`, `cervicalPoints(study)`, `alignment(study)`,
  `lumbarSegmental(study)`, `cervicalSegmental(study)`, `discHeights(study)`, `cervicalLordosis(study)`,
  `cervicalBalance(study)`, `globalBalance(study)`, `studyBlocks(study, record)`, `hasRegion(study, region)`,
  `defaultRegion(study)`.

- [ ] **Step 1: Write the failing tests**

Create `test/similarity-blocks.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REGIONS, FAMILIES, BLOCKS, BLOCK_KEYS, ENTRY_KEYS, LANDMARK_ORDER, CERVICAL_ORDER, ALIGNMENT_ORDER, ALIGNMENT_WEIGHTS,
  LUMBAR_SEGMENTAL_ORDER, CERVICAL_SEGMENTAL_ORDER, DISC_ORDER, blockOf, weightsFor, lumbarPoints, cervicalPoints,
  alignment, lumbarSegmental, cervicalSegmental, discHeights, cervicalLordosis, cervicalBalance, globalBalance,
  studyBlocks, hasRegion, defaultRegion,
} from '../renderer/data/similarity-blocks.js';

// Five lumbar bodies 100 px apart, anterior on the right, S1 under them, the hip below and in front.
export function lumbarGeometry({ dx = 0, dy = 0, scale = 1, levels = ['L1', 'L2', 'L3', 'L4', 'L5'], hip = true, s1 = true, unoriented = [] } = {}) {
  const px = (x, y) => [x * scale + dx, y * scale + dy];
  const vertebrae = {};
  levels.forEach((level) => {
    const i = ['L1', 'L2', 'L3', 'L4', 'L5'].indexOf(level);
    const top = 100 + i * 100;
    vertebrae[level] = {
      superior: [px(160, top), px(100, top)], inferior: [px(160, top + 80), px(100, top + 80)],
      quadrilateral: [px(160, top), px(100, top), px(100, top + 80), px(160, top + 80)],
      ...(unoriented.includes(level) ? { anterior_confirmed: false } : {}),
    };
  });
  return { vertebrae, s1_superior: s1 ? [px(170, 610), px(110, 620)] : null, l1_center: px(130, 140),
    hip_midpoint: hip ? px(260, 760) : null, femoral_circles: [], image_width: 1000, image_height: 1000 };
}

// C2 (inferior only) over C3-C7, 60 px apart, anterior on the LEFT of the image (anterior_side 'left').
export function cervicalGeometry({ dx = 0, dy = 0, scale = 1, side = 'left', levels = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'] } = {}) {
  const px = (x, y) => [x * scale + dx, y * scale + dy];
  const vertebrae = {};
  levels.forEach((level) => {
    const i = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'].indexOf(level);
    const top = 50 + i * 60;
    vertebrae[level] = level === 'C2'
      ? { superior: null, inferior: [px(40, top + 40), px(80, top + 40)], quadrilateral: null }
      : { superior: [px(40, top), px(80, top)], inferior: [px(40, top + 40), px(80, top + 40)],
        quadrilateral: [px(40, top), px(80, top), px(80, top + 40), px(40, top + 40)] };
  });
  return { region: 'cervical', vertebrae, anterior_side: side, c2_centroid: px(60, 70), image_width: 1000, image_height: 1000 };
}

export const CALIBRATION = { version: 1, source_sha256: 'sha', width: 1000, height: 1000, coordinate_space: 'original_image',
  status: 'calibrated', spacing: { row_mm: 0.5, column_mm: 0.5, source: 'ruler' }, candidates: [], selected_index: null };

export function study(id, overrides = {}) {
  return {
    id, source: 'real', filePath: `C:\\films\\${id}.png`, fileName: `${id}.png`, name: null, workspaceFolder: 'C:\\films',
    subjectId: null, timepoint: null, filmDate: null, reviewedAt: null, addedAt: '2026-09-30T00:00:00.000Z',
    view: 'Standing lateral', thumbnail: null, region: 'lumbar', anteriorSide: null,
    measurements: { PI: 50, PT: 12, SS: 38, L1PA: 8, LL: { 'L1-S1': 49 } },
    geometry: lumbarGeometry(), qc: { coverage: { partial: false, unoriented: [] } }, clinical: {}, calibration: null, ...overrides,
  };
}

test('the registry: thirteen blocks in four families, each with a kind and a region list', () => {
  assert.deepEqual(REGIONS, ['lumbar', 'cervical', 'full_spine']);
  assert.deepEqual(FAMILIES, ['lumbar', 'cervical', 'whole', 'appearance']);
  assert.deepEqual(BLOCK_KEYS, ['V', 'H', 'A', 'SL', 'D', 'VC', 'AC', 'BC', 'SC', 'B', 'W', 'C', 'CC']);
  assert.deepEqual(ENTRY_KEYS, ['A', 'SL', 'D', 'AC', 'BC', 'SC', 'B']);
  assert.equal(BLOCKS.length, 13);
  assert.deepEqual(blockOf('A'), { key: 'A', family: 'lumbar', kind: 'alignment', regions: ['lumbar', 'full_spine'], label: 'no alignment', weights: ALIGNMENT_WEIGHTS, floor: 2 });
  assert.deepEqual(blockOf('W').regions, ['full_spine']);
  assert.equal(blockOf('CC').family, 'appearance');
  assert.deepEqual(ALIGNMENT_ORDER, ['PI', 'PT', 'SS', 'LL L1-S1', 'PI-LL', 'L1PA']);
  assert.deepEqual(ALIGNMENT_WEIGHTS, [1, 0.8, 0.8, 0.6, 1, 0.8]);
  assert.equal(LANDMARK_ORDER.length, 22);
  assert.deepEqual(CERVICAL_ORDER.slice(0, 6), ['C2.IA', 'C2.IP', 'C3.SA', 'C3.SP', 'C3.IA', 'C3.IP']);
  assert.equal(CERVICAL_ORDER.length, 22);
  assert.equal(LUMBAR_SEGMENTAL_ORDER.length, 10);
  assert.equal(CERVICAL_SEGMENTAL_ORDER.length, 10);
  assert.deepEqual(DISC_ORDER.slice(0, 3), ['L1-L2 anterior', 'L1-L2 middle', 'L1-L2 posterior']);
  assert.equal(DISC_ORDER.length, 15);
});

test('weightsFor sums to one per family switched on, by region and mode, and never divides by zero', () => {
  const sum = (w, keys) => keys.reduce((s, k) => s + w[k], 0);
  const w = weightsFor('full_spine', 'all');
  assert.ok(Math.abs(sum(w, ['V', 'H', 'A', 'SL', 'D']) - 1) < 1e-12);
  assert.ok(Math.abs(sum(w, ['VC', 'AC', 'BC', 'SC']) - 1) < 1e-12);
  assert.ok(Math.abs(sum(w, ['B', 'W']) - 1) < 1e-12);
  assert.ok(Math.abs(sum(w, ['C', 'CC']) - 1) < 1e-12);
  const lumbar = weightsFor('lumbar', 'all');
  assert.deepEqual(BLOCK_KEYS.filter((k) => lumbar[k] > 0), ['V', 'H', 'A', 'SL', 'D', 'C']);
  assert.equal(lumbar.C, 1);
  const cervical = weightsFor('cervical', 'alignment');
  assert.deepEqual(BLOCK_KEYS.filter((k) => cervical[k] > 0), ['AC', 'BC', 'SC']);
  assert.ok(Math.abs(cervical.AC - 1 / 3) < 1e-12);
  const shape = weightsFor('full_spine', 'shape');
  assert.deepEqual(BLOCK_KEYS.filter((k) => shape[k] > 0), ['V', 'H', 'D', 'VC']);
  assert.equal(shape.B, 0);
  assert.equal(shape.W, 0);
  assert.ok(Object.values(shape).every(Number.isFinite));
  assert.deepEqual(weightsFor('lumbar', 'appearance'), { ...Object.fromEntries(BLOCK_KEYS.map((k) => [k, 0])), C: 1 });
  assert.ok(Object.isFrozen(w));
});

test('lumbarPoints collects whole levels and S1, skips an incomplete or unoriented level, and needs no coverage flag', () => {
  const full = lumbarPoints(study('a'));
  assert.equal(full.size, 22);
  assert.deepEqual(full.get('L1.SA'), [160, 100]);
  assert.deepEqual(full.get('S1.SP'), [110, 620]);
  const missing = lumbarPoints(study('b', { geometry: lumbarGeometry({ levels: ['L2', 'L3', 'L4', 'L5'] }), qc: { coverage: { partial: true, unoriented: [] } } }));
  assert.equal(missing.size, 18);
  assert.equal(missing.has('L1.SA'), false);
  const unoriented = lumbarPoints(study('c', { geometry: lumbarGeometry({ unoriented: ['L3'] }) }));
  assert.equal(unoriented.size, 18);
  assert.equal(unoriented.has('L3.IP'), false);
  assert.equal(lumbarPoints(study('d', { geometry: lumbarGeometry({ s1: false }) })).size, 20);
  assert.equal(lumbarPoints(study('e', { geometry: null })).size, 0);
  assert.equal(lumbarPoints(study('f', { geometry: cervicalGeometry() })).size, 0);
});

test('cervicalPoints collects C2 inferior and C3-C7 corners, only with an anterior side', () => {
  const points = cervicalPoints(study('a', { region: 'cervical', geometry: cervicalGeometry() }));
  assert.equal(points.size, 22);
  assert.deepEqual(points.get('C2.IA'), [40, 90]);
  assert.deepEqual(points.get('C7.IP'), [80, 390]);
  assert.equal(cervicalPoints(study('b', { region: 'cervical', geometry: cervicalGeometry({ side: null }) })).size, 0);
  assert.equal(cervicalPoints(study('c', { region: 'cervical', geometry: cervicalGeometry({ levels: ['C3', 'C4', 'C5', 'C6', 'C7'] }) })).size, 20);
  assert.equal(cervicalPoints(study('d')).size, 0);
});

test('the entry readers return fixed-order arrays with null per absent value', () => {
  const s = study('a');
  assert.deepEqual(alignment(s), [50, 12, 38, 49, 1, 8]);
  assert.deepEqual(alignment(study('b', { measurements: { PI: null, PT: 12, SS: 38, L1PA: null, LL: { 'L1-S1': 49 } } })), [null, 12, 38, 49, null, null]);
  assert.deepEqual(alignment(study('c', { measurements: null })), [null, null, null, null, null, null]);
  const seg = lumbarSegmental(s);
  assert.equal(seg.length, 10);
  assert.ok(seg.every((v) => v === null || Number.isFinite(v)));
  assert.deepEqual(cervicalSegmental(s), new Array(10).fill(null));
  assert.deepEqual(discHeights(s), new Array(15).fill(null));
  const calibrated = study('d', { calibration: CALIBRATION });
  const heights = discHeights(calibrated);
  assert.equal(heights.length, 15);
  assert.ok(heights.every(Number.isFinite));
  assert.ok(Math.abs(heights[1] - 10) < 1e-9, 'L1-L2 middle: 20 px between endplate midpoints at 0.5 mm/px');
  assert.deepEqual(cervicalLordosis(s), [null]);
  assert.deepEqual(cervicalBalance(s), [null]);
  assert.deepEqual(globalBalance(s), [null]);
  const cervical = study('e', { region: 'cervical', geometry: cervicalGeometry(), measurements: { region: 'cervical' }, calibration: CALIBRATION });
  assert.ok(Number.isFinite(cervicalLordosis(cervical)[0]));
  assert.ok(Number.isFinite(cervicalBalance(cervical)[0]));
  assert.deepEqual(cervicalBalance(study('f', { region: 'cervical', geometry: cervicalGeometry(), measurements: { region: 'cervical' } })), [null], 'no calibration, no millimetres');
});

test('studyBlocks assembles region, points, hip, side, entries, vectors and model', () => {
  const record = { version: 2, id: 'a', model: { onnx_sha256: 'abc' }, region: 'lumbar', lumbar: [1, 0], cervical: null, whole: [0, 1] };
  const b = studyBlocks(study('a'), record);
  assert.equal(b.region, 'lumbar');
  assert.equal(b.lumbar.size, 22);
  assert.equal(b.cervical.size, 0);
  assert.deepEqual(b.hip, [260, 760]);
  assert.equal(b.side, null);
  assert.deepEqual(Object.keys(b.entries), ENTRY_KEYS);
  assert.deepEqual(b.vectors, { C: [1, 0], CC: null, W: [0, 1] });
  assert.equal(b.model, 'abc');
  const none = studyBlocks(study('b', { geometry: null, measurements: null }), null);
  assert.equal(none.lumbar.size, 0);
  assert.equal(none.hip, null);
  assert.deepEqual(none.vectors, { C: null, CC: null, W: null });
  assert.equal(none.model, null);
});

test('hasRegion and defaultRegion follow the anatomy a film carries', () => {
  const lumbar = study('a');
  assert.equal(hasRegion(lumbar, 'lumbar'), true);
  assert.equal(hasRegion(lumbar, 'cervical'), false);
  assert.equal(hasRegion(lumbar, 'full_spine'), false);
  assert.equal(defaultRegion(lumbar), 'lumbar');
  const anglesOnly = study('b', { geometry: { vertebrae: {}, s1_superior: null } });
  assert.equal(hasRegion(anglesOnly, 'lumbar'), true, 'measured angles alone are lumbar anatomy');
  const cervical = study('c', { region: 'cervical', geometry: cervicalGeometry(), measurements: { region: 'cervical' } });
  assert.equal(hasRegion(cervical, 'cervical'), true);
  assert.equal(hasRegion(cervical, 'lumbar'), false);
  assert.equal(defaultRegion(cervical), 'cervical');
  const lumbar = lumbarGeometry();
  const cervical = cervicalGeometry();
  const full = study('d', {
    region: 'auto',
    geometry: { ...lumbar, vertebrae: { ...lumbar.vertebrae, ...cervical.vertebrae }, anterior_side: 'left', c2_centroid: [60, 70], c7_centroid: [60, 370], region: 'full_spine' },
    measurements: { PI: 50, PT: 12, SS: 38, L1PA: 8, LL: { 'L1-S1': 49 }, region: 'full_spine' },
  });
  assert.equal(hasRegion(full, 'full_spine'), true);
  assert.equal(hasRegion(full, 'lumbar'), true);
  assert.equal(hasRegion(full, 'cervical'), true);
  assert.equal(defaultRegion(full), 'full_spine');
  assert.equal(hasRegion(study('e', { measurements: null, geometry: null }), 'lumbar'), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/similarity-blocks.test.js`
Expected: FAIL — cannot find module `similarity-blocks.js`.

- [ ] **Step 3: Write the module**

Create `renderer/data/similarity-blocks.js`:

```js
/**
 * The similar-cases block registry and readers (spec 2026-09-30, sections 6 and 7): thirteen blocks in
 * four families, each with the regions and the kind that switch it on, and the pure readers that turn
 * a study record (plus its stored embedding) into the points, entry arrays and vectors the ranking
 * compares. No distances here: renderer/data/similarity.js owns those. No DOM.
 */
import { segmentalColumns, segmentalValues } from './segmental.js';
import { discRows, DISC_LEVEL_PAIRS, DISC_POSITIONS } from './disc-heights.js';
import { cervicalMeasurements, studyRegion, validAnteriorSide } from './cervical.js';
import { globalSvaMeasurements } from './global-sva.js';

export const REGIONS = Object.freeze(['lumbar', 'cervical', 'full_spine']);
export const FAMILIES = Object.freeze(['lumbar', 'cervical', 'whole', 'appearance']);
export const KINDS = Object.freeze(['shape', 'alignment', 'appearance']);

const LUMBAR_LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'];
const CERVICAL_LEVELS = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'];
const CORNERS = ['SA', 'SP', 'IA', 'IP'];
export const LANDMARK_ORDER = Object.freeze([
  ...LUMBAR_LEVELS.flatMap((level) => CORNERS.map((corner) => `${level}.${corner}`)), 'S1.SA', 'S1.SP',
]);
export const CERVICAL_ORDER = Object.freeze([
  'C2.IA', 'C2.IP', ...CERVICAL_LEVELS.slice(1).flatMap((level) => CORNERS.map((corner) => `${level}.${corner}`)),
]);
export const ALIGNMENT_ORDER = Object.freeze(['PI', 'PT', 'SS', 'LL L1-S1', 'PI-LL', 'L1PA']);
export const ALIGNMENT_WEIGHTS = Object.freeze([1, 0.8, 0.8, 0.6, 1, 0.8]);
export const LUMBAR_SEGMENTAL_ORDER = Object.freeze(segmentalColumns('lumbar').map((column) => column.key));
export const CERVICAL_SEGMENTAL_ORDER = Object.freeze(segmentalColumns('cervical').map((column) => column.key));
export const DISC_ORDER = Object.freeze(DISC_LEVEL_PAIRS.flatMap(([upper, lower]) => DISC_POSITIONS.map((position) => `${upper}-${lower} ${position}`)));

const LUMBAR_REGIONS = Object.freeze(['lumbar', 'full_spine']);
const CERVICAL_REGIONS = Object.freeze(['cervical', 'full_spine']);
const FULL_SPINE = Object.freeze(['full_spine']);

// `label` is the card's absent marker (spec section 10). `floor` is the least shared entries an entry
// block needs; `weights` an entry block's per-entry weights (else 1 each).
export const BLOCKS = Object.freeze([
  { key: 'V', family: 'lumbar', kind: 'shape', regions: LUMBAR_REGIONS, label: 'no shape' },
  { key: 'H', family: 'lumbar', kind: 'shape', regions: LUMBAR_REGIONS, label: 'no hip' },
  { key: 'A', family: 'lumbar', kind: 'alignment', regions: LUMBAR_REGIONS, label: 'no alignment', weights: ALIGNMENT_WEIGHTS, floor: 2 },
  { key: 'SL', family: 'lumbar', kind: 'alignment', regions: LUMBAR_REGIONS, label: 'no segmental', floor: 3 },
  { key: 'D', family: 'lumbar', kind: 'shape', regions: LUMBAR_REGIONS, label: 'no disc heights', floor: 2 },
  { key: 'VC', family: 'cervical', kind: 'shape', regions: CERVICAL_REGIONS, label: 'no cervical shape' },
  { key: 'AC', family: 'cervical', kind: 'alignment', regions: CERVICAL_REGIONS, label: 'no cervical lordosis', floor: 1 },
  { key: 'BC', family: 'cervical', kind: 'alignment', regions: CERVICAL_REGIONS, label: 'no cervical balance', floor: 1 },
  { key: 'SC', family: 'cervical', kind: 'alignment', regions: CERVICAL_REGIONS, label: 'no cervical segmental', floor: 3 },
  { key: 'B', family: 'whole', kind: 'alignment', regions: FULL_SPINE, label: 'no global balance', floor: 1 },
  { key: 'W', family: 'whole', kind: 'appearance', regions: FULL_SPINE, label: 'no whole film' },
  { key: 'C', family: 'appearance', kind: 'appearance', regions: LUMBAR_REGIONS, label: 'no lumbar crop' },
  { key: 'CC', family: 'appearance', kind: 'appearance', regions: CERVICAL_REGIONS, label: 'no cervical crop' },
].map((block) => Object.freeze({ ...block, regions: [...block.regions] })));
export const BLOCK_KEYS = Object.freeze(BLOCKS.map((block) => block.key));
export const ENTRY_KEYS = Object.freeze(['A', 'SL', 'D', 'AC', 'BC', 'SC', 'B']);

const BY_KEY = new Map(BLOCKS.map((block) => [block.key, block]));
export function blockOf(key) {
  return BY_KEY.get(key) ?? null;
}

// Spec decision 7: a block is on when its family is on under the region and its kind under the mode;
// every family present has budget one, shared equally by its switched-on blocks. Computed, never typed.
export function weightsFor(region, mode) {
  const on = BLOCKS.filter((block) => block.regions.includes(region) && (mode === 'all' || block.kind === mode));
  const perFamily = new Map();
  for (const block of on) perFamily.set(block.family, (perFamily.get(block.family) ?? 0) + 1);
  const weights = {};
  for (const block of BLOCKS) weights[block.key] = on.includes(block) ? 1 / perFamily.get(block.family) : 0;
  return Object.freeze(weights);
}

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function point(p) {
  return Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]);
}

function plate(p) {
  return Array.isArray(p) && p.length === 2 && point(p[0]) && point(p[1]);
}

// The lumbar points present: a level enters only whole (both endplates, four finite corners) and
// oriented; S1 needs both points. No coverage flag is read (spec decision 5).
export function lumbarPoints(study) {
  const g = study?.geometry;
  const points = new Map();
  if (!g || !g.vertebrae || typeof g.vertebrae !== 'object') return points;
  for (const level of LUMBAR_LEVELS) {
    const body = g.vertebrae[level];
    if (!body || body.anterior_confirmed === false || !plate(body.superior) || !plate(body.inferior)) continue;
    points.set(`${level}.SA`, body.superior[0]);
    points.set(`${level}.SP`, body.superior[1]);
    points.set(`${level}.IA`, body.inferior[0]);
    points.set(`${level}.IP`, body.inferior[1]);
  }
  if (plate(g.s1_superior)) {
    points.set('S1.SA', g.s1_superior[0]);
    points.set('S1.SP', g.s1_superior[1]);
  }
  return points;
}

// The cervical points present: C2's inferior endplate, C3-C7 whole. Empty without a recorded anterior
// side, because the mirror step trusts the side, not the corners (spec decision 10).
export function cervicalPoints(study) {
  const g = study?.geometry;
  const points = new Map();
  if (!g || !g.vertebrae || typeof g.vertebrae !== 'object' || !validAnteriorSide(g.anterior_side)) return points;
  const c2 = g.vertebrae.C2;
  if (c2 && plate(c2.inferior)) {
    points.set('C2.IA', c2.inferior[0]);
    points.set('C2.IP', c2.inferior[1]);
  }
  for (const level of CERVICAL_LEVELS.slice(1)) {
    const body = g.vertebrae[level];
    if (!body || !plate(body.superior) || !plate(body.inferior)) continue;
    points.set(`${level}.SA`, body.superior[0]);
    points.set(`${level}.SP`, body.superior[1]);
    points.set(`${level}.IA`, body.inferior[0]);
    points.set(`${level}.IP`, body.inferior[1]);
  }
  return points;
}

const orNull = (v) => (finite(v) ? v : null);

export function alignment(study) {
  const m = study?.measurements && typeof study.measurements === 'object' ? study.measurements : {};
  const ll = orNull(m.LL?.['L1-S1']);
  const pi = orNull(m.PI);
  return [pi, orNull(m.PT), orNull(m.SS), ll, pi !== null && ll !== null ? pi - ll : null, orNull(m.L1PA)];
}

function segmental(study, order) {
  const values = study?.measurements ? segmentalValues(study) : {};
  return order.map((key) => orNull(values[key]));
}

export function lumbarSegmental(study) {
  return segmental(study, LUMBAR_SEGMENTAL_ORDER);
}

export function cervicalSegmental(study) {
  return segmental(study, CERVICAL_SEGMENTAL_ORDER);
}

export function discHeights(study) {
  const rows = study?.geometry ? discRows(study) : [];
  return DISC_LEVEL_PAIRS.flatMap(([upper, lower]) => {
    const row = rows.find((r) => r.key === `${upper}-${lower}`);
    return DISC_POSITIONS.map((position) => orNull(row?.[position]));
  });
}

export function cervicalLordosis(study) {
  return [orNull(study?.measurements ? cervicalMeasurements(study).C2C7_COBB : null)];
}

export function cervicalBalance(study) {
  return [orNull(study?.measurements ? cervicalMeasurements(study).C2C7_SVA_MM : null)];
}

export function globalBalance(study) {
  return [orNull(study?.measurements ? globalSvaMeasurements(study).GLOBAL_SVA_MM : null)];
}

function unitList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(finite) ? value : null;
}

// One study's inputs to every block, from its record and its stored embedding record (or null).
export function studyBlocks(study, record) {
  const g = study?.geometry;
  return {
    region: studyRegion(study),
    lumbar: lumbarPoints(study),
    cervical: cervicalPoints(study),
    hip: point(g?.hip_midpoint) ? g.hip_midpoint : null,
    side: validAnteriorSide(g?.anterior_side) ? g.anterior_side : null,
    entries: {
      A: alignment(study), SL: lumbarSegmental(study), D: discHeights(study),
      AC: cervicalLordosis(study), BC: cervicalBalance(study), SC: cervicalSegmental(study), B: globalBalance(study),
    },
    vectors: { C: unitList(record?.lumbar), CC: unitList(record?.cervical), W: unitList(record?.whole) },
    model: typeof record?.model?.onnx_sha256 === 'string' ? record.model.onnx_sha256 : null,
  };
}

// Spec section 7.5: a film has a region's anatomy when it carries any of that region's points or
// entries; whole spine is the resolved region itself.
export function hasRegion(study, region) {
  if (!study || study.measurements == null || study.geometry == null) return false;
  if (region === 'full_spine') return studyRegion(study) === 'full_spine';
  const b = studyBlocks(study, null);
  const keys = region === 'cervical' ? ['AC', 'BC', 'SC'] : ['A', 'SL', 'D'];
  const points = region === 'cervical' ? b.cervical : b.lumbar;
  return points.size > 0 || keys.some((key) => b.entries[key].some(finite));
}

export function defaultRegion(study) {
  const region = studyRegion(study);
  return REGIONS.includes(region) ? region : 'lumbar';
}
```

If `discRows` on the merged tree keys its rows differently from `${upper}-${lower}` (read `renderer/data/disc-heights.js`
first: the row's `key` is `` `${upper}-${lower}` `` at this writing), match whatever it uses.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/similarity-blocks.test.js`
Expected: PASS. If `segmentalValues` needs `study.calibration` bound to the geometry's `source_sha256` to produce
numbers, the `lumbarSegmental` test only asserts null-or-finite, so it passes either way; the `discHeights` test
needs `CALIBRATION.source_sha256` to match nothing (`discRows` uses `normalizeCalibration`, not `boundCalibration`)
— if it fails, set `source_sha256: 'sha'` on the fixture geometry too.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/similarity-blocks.js test/similarity-blocks.test.js
git commit -m "feat: the similar-cases block registry — thirteen blocks in four families, with the readers and the computed weight table"
```

---

### Task 5: `renderer/data/similarity.js` — shared-point shape, entry distances, region-aware ranking

**Files:**
- Modify: `renderer/data/similarity.js` (rewrite; keep `subjectFilms`, `medianScale`, `fuse`, `matchScore`,
  `appearanceDistance`, `needsEmbedding(mode)`, `SCOPES`, the `embeddingOf` helper)
- Test: `test/similarity.test.js` (rewrite)

**Interfaces:**
- Consumes: everything Task 4 exports; `HAND_ADDED`, `matchesLocation`, `subjectKey` from `./parameters.js`;
  `cervicalMeasurements` from `./cervical.js`.
- Produces: re-exports `LANDMARK_ORDER`, `CERVICAL_ORDER`, `ALIGNMENT_ORDER`, `ALIGNMENT_WEIGHTS`, `BLOCK_KEYS`,
  `REGIONS`, `weightsFor`, `hasRegion`, `defaultRegion`, `alignment`, `studyBlocks`; `SCOPES`; `MODES =
  Object.freeze(['all', 'shape', 'alignment', 'appearance'])` (now an ARRAY of mode names, not weight tables);
  `LUMBAR_SHAPE`, `CERVICAL_SHAPE`; `vector(study) -> {V, H} | null` (unchanged meaning, for the export);
  `cervicalVector(study) -> {V} | null`; `shapePair(a, b, shape, signA, signB) -> {d, a, b} | null`; `hipUnder(hip,
  transform)`; `entryDistance(a, b, weights, floor) -> number | null`; `appearanceDistance`; `pairDistances(open,
  candidate, weights) -> {V..CC: number | null}`; `medianScale`; `fuse`; `matchScore`; `candidates(open, all, {scope,
  region, mode, embeddings})`; `findSimilar(open, all, {scope, region, mode, embeddings, n}) -> {matches: [{study, d,
  match, blocks, absent}], total, stale, region, weights}`; `openReason(open, region, mode, embeddings) -> 'unsegmented'
  | 'no-region' | 'no-embedding' | 'no-alignment' | null`; `angleLine(open, candidate, region)`; `subjectFilms`;
  `needsEmbedding(mode)`.

- [ ] **Step 1: Rewrite the tests**

Replace `test/similarity.test.js` with the following. It imports the fixtures Task 4's test file exports.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LANDMARK_ORDER, CERVICAL_ORDER, BLOCK_KEYS, MODES, SCOPES, LUMBAR_SHAPE, CERVICAL_SHAPE, vector, cervicalVector,
  shapePair, hipUnder, entryDistance, appearanceDistance, pairDistances, medianScale, fuse, matchScore, candidates,
  findSimilar, openReason, angleLine, subjectFilms, needsEmbedding, weightsFor, studyBlocks,
} from '../renderer/data/similarity.js';
import { lumbarPoints, cervicalPoints } from '../renderer/data/similarity-blocks.js';
import { HAND_ADDED } from '../renderer/data/parameters.js';
import { lumbarGeometry, cervicalGeometry, CALIBRATION, study } from './similarity-blocks.test.js';

const unit = (values) => { const n = Math.hypot(...values); return values.map((v) => v / n); };
function record(id, { lumbar = null, cervical = null, whole = null, region = 'lumbar', sha = 'abc' } = {}) {
  return { version: 2, id, computedAt: 'x', sourceSha256: null, model: { onnx_sha256: sha }, region,
    lumbar: lumbar ? unit(lumbar) : null, cervical: cervical ? unit(cervical) : null, whole: whole ? unit(whole) : null };
}
function fullSpine(id, overrides = {}) {
  const lumbar = lumbarGeometry(overrides.lumbar ?? {});
  const cervical = cervicalGeometry(overrides.cervical ?? {});
  return study(id, {
    region: 'full_spine',
    geometry: { ...lumbar, vertebrae: { ...lumbar.vertebrae, ...cervical.vertebrae }, anterior_side: 'left',
      c2_centroid: [60, 70], c7_centroid: [60, 370], region: 'full_spine', source_sha256: 'sha' },
    measurements: { PI: 50, PT: 12, SS: 38, L1PA: 8, LL: { 'L1-S1': 49 }, region: 'full_spine', GLOBAL_SVA_MM: null, GLOBAL_SVA_PX: null },
    ...overrides.study,
  });
}
function cervicalStudy(id, overrides = {}) {
  return study(id, { region: 'cervical', geometry: cervicalGeometry(overrides.geometry ?? {}), measurements: { region: 'cervical' }, ...overrides.study });
}

test('the module re-exports the registry and names the modes and scopes', () => {
  assert.deepEqual(MODES, ['all', 'shape', 'alignment', 'appearance']);
  assert.deepEqual(SCOPES, ['all', 'workspace']);
  assert.equal(BLOCK_KEYS.length, 13);
  assert.equal(LANDMARK_ORDER.length, 22);
  assert.equal(CERVICAL_ORDER.length, 22);
  assert.deepEqual(LUMBAR_SHAPE, { order: LANDMARK_ORDER, floor: 14, require: ['S1.SA', 'S1.SP'] });
  assert.deepEqual(CERVICAL_SHAPE, { order: CERVICAL_ORDER, floor: 14, require: [] });
  assert.equal(needsEmbedding('all'), true);
  assert.equal(needsEmbedding('shape'), false);
});

test('vector gives the complete 44-number lumbar shape or null; cervicalVector its twin', () => {
  const v = vector(study('a'));
  assert.equal(v.V.length, 44);
  assert.equal(v.H.length, 2);
  assert.ok(Math.abs(Math.hypot(...v.V) - 1) < 1e-12);
  assert.equal(vector(study('b', { geometry: lumbarGeometry({ levels: ['L2', 'L3', 'L4', 'L5'] }) })), null);
  assert.equal(vector(study('c', { geometry: lumbarGeometry({ hip: false }) })).H, null);
  const c = cervicalVector(cervicalStudy('d'));
  assert.equal(c.V.length, 44);
  assert.equal(cervicalVector(study('e')), null);
});

test('shapePair over shared points equals the complete distance when both films are complete, is invariant to translation and scale, mirrors, and drops below the floor', () => {
  const a = lumbarPoints(study('a'));
  const b = lumbarPoints(study('b', { geometry: lumbarGeometry({ dx: 300, dy: -50, scale: 2 }) }));
  const pair = shapePair(a, b, LUMBAR_SHAPE, null, null);
  assert.ok(pair.d < 1e-9, `translated and scaled copy: ${pair.d}`);
  const va = vector(study('a')).V;
  const vb = vector(study('b', { geometry: lumbarGeometry({ dx: 300, dy: -50, scale: 2 }) })).V;
  assert.ok(Math.abs(pair.d - Math.hypot(...va.map((x, i) => x - vb[i]))) < 1e-9, 'the shared-point distance is the complete distance');
  const flipped = lumbarPoints(study('c', { geometry: { ...lumbarGeometry(), vertebrae: Object.fromEntries(Object.entries(lumbarGeometry().vertebrae).map(([k, body]) => [k, { ...body, superior: body.superior.map(([x, y]) => [-x, y]), inferior: body.inferior.map(([x, y]) => [-x, y]) }])), s1_superior: [[-170, 610], [-110, 620]] } }));
  assert.ok(shapePair(a, flipped, LUMBAR_SHAPE, null, null).d < 1e-9, 'a mirrored film reads as the same shape');
  const four = lumbarPoints(study('d', { geometry: lumbarGeometry({ levels: ['L2', 'L3', 'L4', 'L5'] }) }));
  const shared = shapePair(a, four, LUMBAR_SHAPE, null, null);
  assert.ok(shared && shared.d < 1e-9, 'four shared levels plus S1 rank on the shared points');
  const two = lumbarPoints(study('e', { geometry: lumbarGeometry({ levels: ['L4', 'L5'] }) }));
  assert.equal(shapePair(a, two, LUMBAR_SHAPE, null, null), null, 'two levels are below the floor');
  const noS1 = lumbarPoints(study('f', { geometry: lumbarGeometry({ s1: false }) }));
  assert.equal(shapePair(a, noS1, LUMBAR_SHAPE, null, null), null, 'the lumbar shape needs S1');
  // The transforms travel with the pair so the hip can follow them.
  assert.deepEqual(Object.keys(pair.a).sort(), ['cx', 'cy', 'list', 'sign', 'size']);
  const hipA = hipUnder([260, 760], pair.a);
  const hipB = hipUnder([300 + 520, -50 + 1520], pair.b);
  assert.ok(Math.hypot(hipA[0] - hipB[0], hipA[1] - hipB[1]) < 1e-9);
});

test('the cervical shape mirrors by the recorded side and needs four bodies', () => {
  const left = cervicalPoints(cervicalStudy('a'));
  const right = cervicalPoints(cervicalStudy('b', { geometry: { side: 'right' } }));
  const mirrored = new Map([...right].map(([name, [x, y]]) => [name, [-x, y]]));
  assert.ok(shapePair(left, mirrored, CERVICAL_SHAPE, -1, 1).d < 1e-9, 'a right-facing copy mirrored in x is the same shape');
  assert.ok(shapePair(left, right, CERVICAL_SHAPE, -1, 1).d > 0.1, 'without the mirror they differ');
  const three = cervicalPoints(cervicalStudy('c', { geometry: { levels: ['C5', 'C6', 'C7'] } }));
  assert.equal(shapePair(left, three, CERVICAL_SHAPE, -1, -1), null);
  const four = cervicalPoints(cervicalStudy('d', { geometry: { levels: ['C2', 'C5', 'C6', 'C7'] } }));
  assert.ok(shapePair(left, four, CERVICAL_SHAPE, -1, -1) !== null, 'C2 plus three bodies is fourteen points');
});

test('entryDistance is a weighted RMS over the entries both have, null below the floor', () => {
  assert.ok(Math.abs(entryDistance([1, 2, 3], [1, 2, 3], null, 1)) < 1e-12);
  assert.ok(Math.abs(entryDistance([0, 0], [3, 4], null, 1) - Math.sqrt(12.5)) < 1e-12);
  assert.ok(Math.abs(entryDistance([0, 0, 10], [3, 4, null], null, 2) - Math.sqrt(12.5)) < 1e-12, 'a null on either side leaves the entry out');
  assert.equal(entryDistance([0, null, 10], [3, 4, null], null, 2), null, 'one shared entry is below a floor of two');
  assert.ok(Math.abs(entryDistance([0, 0], [1, 1], [1, 3], 1) - 1) < 1e-12, 'weights divide out');
  assert.equal(entryDistance([null], [null], null, 1), null);
});

test('pairDistances fills every switched-on block or null, follows the weights, and keeps millimetre blocks off an uncalibrated pair', () => {
  const open = studyBlocks(study('a', { calibration: CALIBRATION }), record('a', { lumbar: [1, 0, 0], whole: [0, 1, 0] }));
  const same = studyBlocks(study('b', { calibration: CALIBRATION, geometry: lumbarGeometry({ dx: 10 }) }), record('b', { lumbar: [1, 0, 0], whole: [0, 1, 0] }));
  const d = pairDistances(open, same, weightsFor('lumbar', 'all'));
  assert.deepEqual(Object.keys(d), BLOCK_KEYS);
  assert.ok(d.V < 1e-9 && d.H < 1e-9 && d.A < 1e-9 && d.C < 1e-9);
  assert.equal(d.D !== null, true, 'both calibrated: disc heights present');
  assert.equal(d.W, null, 'W is off under lumbar');
  assert.equal(d.VC, null);
  const uncalibrated = studyBlocks(study('c', { geometry: lumbarGeometry({ dx: 10 }) }), record('c', { lumbar: [1, 0, 0] }));
  const e = pairDistances(open, uncalibrated, weightsFor('lumbar', 'all'));
  assert.equal(e.D, null, 'one film uncalibrated: no disc heights');
  assert.ok(e.V < 1e-9);
  const noHip = studyBlocks(study('d', { geometry: lumbarGeometry({ hip: false }) }), null);
  const f = pairDistances(open, noHip, weightsFor('lumbar', 'all'));
  assert.equal(f.H, null);
  assert.equal(f.C, null, 'no embedding on one side');
  const other = studyBlocks(study('e'), record('e', { lumbar: [1, 0, 0], sha: 'zzz' }));
  assert.equal(pairDistances(open, other, weightsFor('lumbar', 'all')).C, null, 'different models never compare');
  const shapeOnly = pairDistances(open, same, weightsFor('lumbar', 'shape'));
  assert.equal(shapeOnly.A, null, 'a block with weight 0 is not computed');
  assert.ok(shapeOnly.V < 1e-9);
});

test('pairDistances between two full-spine films fills the cervical and whole-spine blocks, and W only when both are full spine', () => {
  const a = studyBlocks(fullSpine('a', { study: { calibration: CALIBRATION } }), record('a', { lumbar: [1, 0], cervical: [0, 1], whole: [1, 1], region: 'full_spine' }));
  const b = studyBlocks(fullSpine('b', { lumbar: { dx: 5 }, cervical: { dx: 5 }, study: { calibration: CALIBRATION } }), record('b', { lumbar: [1, 0], cervical: [0, 1], whole: [1, 1], region: 'full_spine' }));
  const d = pairDistances(a, b, weightsFor('full_spine', 'all'));
  assert.ok(d.VC < 1e-9 && d.CC < 1e-9 && d.W < 1e-9);
  assert.equal(d.AC !== null, true);
  assert.equal(d.SC !== null, true);
  const lumbar = studyBlocks(study('c', { calibration: CALIBRATION }), record('c', { lumbar: [1, 0], whole: [1, 1] }));
  const mixed = pairDistances(a, lumbar, weightsFor('full_spine', 'all'));
  assert.equal(mixed.W, null, 'a lumbar film has no whole-film block against a full-spine one');
  assert.ok(mixed.V < 1e-9, 'but the lumbar shape compares');
  assert.equal(mixed.VC, null);
});

test('medianScale, fuse and matchScore are stage 1 (fuse over thirteen keys)', () => {
  assert.equal(medianScale([1, 2, 3]), 2);
  assert.equal(medianScale([1, 2]), 1);
  assert.equal(medianScale([0, 0, 0]), 1);
  const distances = Object.fromEntries(BLOCK_KEYS.map((k) => [k, null]));
  distances.V = 2; distances.A = 4;
  const fused = fuse(distances, { V: 2, A: 2 }, weightsFor('lumbar', 'all'));
  assert.deepEqual(fused.blocks, ['V', 'A']);
  assert.ok(Math.abs(fused.d - Math.sqrt((0.2 * 1 + 0.2 * 4) / 0.4)) < 1e-12);
  assert.equal(fuse(Object.fromEntries(BLOCK_KEYS.map((k) => [k, null])), {}, weightsFor('lumbar', 'all')), null);
  assert.equal(matchScore(0), 100);
  assert.equal(matchScore(1), 37);
});

test('candidates filter by region anatomy, scope, subject and embedding need — never by coverage', () => {
  const open = study('open', { subjectId: 'S1' });
  const pool = [
    open,
    study('same-subject', { subjectId: 's1' }),
    study('partial', { geometry: lumbarGeometry({ levels: ['L3', 'L4', 'L5'], hip: false }), qc: { coverage: { partial: true, unoriented: [] } } }),
    study('angles-only', { geometry: { vertebrae: {}, s1_superior: null } }),
    cervicalStudy('neck'),
    study('hand', { workspaceFolder: '' }),
    study('unsegmented', { measurements: null, geometry: null }),
    study('demo', { source: 'demo' }),
  ];
  const ids = (list) => list.map((s) => s.id);
  assert.deepEqual(ids(candidates(open, pool, { scope: 'all', region: 'lumbar', mode: 'shape' })), ['partial', 'angles-only', 'hand']);
  assert.deepEqual(ids(candidates(open, pool, { scope: 'workspace', region: 'lumbar', mode: 'shape' })), ['partial', 'angles-only']);
  assert.deepEqual(ids(candidates(open, pool, { scope: 'all', region: 'cervical', mode: 'shape' })), ['neck']);
  assert.deepEqual(ids(candidates(open, pool, { scope: 'all', region: 'full_spine', mode: 'shape' })), []);
  const embeddings = { partial: record('partial', { lumbar: [1, 0] }) };
  assert.deepEqual(ids(candidates(open, pool, { scope: 'all', region: 'lumbar', mode: 'all', embeddings })), ['partial']);
});

test('findSimilar ranks by region, names the absent blocks, counts stale records, and defaults the region to the open film', () => {
  const open = study('open', { calibration: CALIBRATION });
  const near = study('near', { geometry: lumbarGeometry({ dx: 3 }), calibration: CALIBRATION });
  const far = study('far', { measurements: { PI: 75, PT: 30, SS: 45, L1PA: 20, LL: { 'L1-S1': 30 } }, geometry: lumbarGeometry({ scale: 1.3, dy: 40 }) });
  const noHip = study('nohip', { geometry: lumbarGeometry({ hip: false }), measurements: { PI: null, PT: null, SS: 38, L1PA: null, LL: { 'L1-S1': 49 } } });
  const stale = study('stale');
  const embeddings = {
    open: record('open', { lumbar: [1, 0, 0] }), near: record('near', { lumbar: [1, 0, 0] }),
    far: record('far', { lumbar: [0, 1, 0] }), stale: record('stale', { lumbar: [1, 0, 0], sha: 'old' }),
  };
  const all = findSimilar(open, [open, near, far, noHip, stale], { scope: 'all', mode: 'all', embeddings });
  assert.equal(all.region, 'lumbar');
  // near and stale both sit at distance 0 on every block they share with the open film (stale is the
  // same geometry; its differing model only removes C), so they tie and sort by id; far's angles differ.
  assert.deepEqual(all.matches.map((m) => m.study.id), ['near', 'stale', 'far']);
  assert.equal(all.stale, 1);
  assert.equal(all.total, 3);
  assert.deepEqual(all.matches[0].blocks, ['V', 'H', 'A', 'SL', 'D', 'C']);
  assert.deepEqual(all.matches[0].absent, []);
  assert.deepEqual(all.matches[1].absent, ['D', 'C'], 'stale has another model and no calibration');
  assert.deepEqual(all.matches[2].absent, ['D'], 'far is uncalibrated');
  const shape = findSimilar(open, [open, near, far, noHip, stale], { scope: 'all', mode: 'shape' });
  assert.deepEqual(shape.matches.map((m) => m.study.id).slice(0, 2), ['near', 'stale']);
  assert.ok(shape.matches.some((m) => m.study.id === 'nohip' && m.absent.includes('H') && m.absent.includes('D')));
  assert.equal(shape.stale, 0);
  const alignment = findSimilar(open, [open, near, far, noHip], { scope: 'all', mode: 'alignment' });
  assert.equal(alignment.matches.at(-1).study.id, 'far');
  assert.ok(alignment.matches.some((m) => m.study.id === 'nohip' && m.blocks.includes('A')), 'two shared angles are enough for A');
});

test('findSimilar under full_spine lists the absent cervical blocks for a film whose neck was not found', () => {
  const open = fullSpine('open', { study: { calibration: CALIBRATION } });
  const neckless = fullSpine('neckless', { study: { calibration: CALIBRATION } });
  for (const level of ['C2', 'C3', 'C4', 'C5', 'C6', 'C7']) delete neckless.geometry.vertebrae[level];
  neckless.geometry.c2_centroid = null;
  neckless.geometry.c7_centroid = null; // no C7, no global SVA either
  const embeddings = { open: record('open', { lumbar: [1, 0], cervical: [0, 1], whole: [1, 1], region: 'full_spine' }),
    neckless: record('neckless', { lumbar: [1, 0], whole: [1, 1], region: 'full_spine' }) };
  const { matches, region } = findSimilar(open, [open, neckless], { scope: 'all', mode: 'all', embeddings });
  assert.equal(region, 'full_spine');
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].absent, ['VC', 'AC', 'BC', 'SC', 'B', 'CC']);
  assert.ok(matches[0].blocks.includes('W') && matches[0].blocks.includes('V'));
});

test('openReason names why the open study has no cards', () => {
  const embeddings = { a: record('a', { lumbar: [1, 0] }) };
  assert.equal(openReason(study('a', { measurements: null, geometry: null }), 'lumbar', 'all', embeddings), 'unsegmented');
  assert.equal(openReason(study('a'), 'cervical', 'shape', embeddings), 'no-region');
  assert.equal(openReason(study('b'), 'lumbar', 'all', embeddings), 'no-embedding');
  // Landmarks present (so the film has lumbar anatomy) but no angle: the measured ones null and the
  // segmental readers refusing endplates outside a 10 px image.
  assert.equal(openReason(study('a', { measurements: { PI: null, PT: null, SS: null, L1PA: null, LL: {} }, geometry: { ...lumbarGeometry(), image_width: 10, image_height: 10 } }), 'lumbar', 'alignment', embeddings), 'no-alignment');
  assert.equal(openReason(study('a'), 'lumbar', 'all', embeddings), null);
  assert.equal(openReason(study('a', { geometry: lumbarGeometry({ levels: ['L5'], hip: false }), qc: { coverage: { partial: true, unoriented: [] } } }), 'lumbar', 'shape', embeddings), null, 'partial is not a reason any more');
});

test('angleLine follows the region: lumbar angles, or the cervical Cobb and SVA', () => {
  const open = study('a', { calibration: CALIBRATION });
  const other = study('b', { measurements: { PI: 60, PT: 15, SS: 45, L1PA: 8, LL: { 'L1-S1': 44 } } });
  assert.equal(angleLine(open, other, 'lumbar'), 'PI +10 \u00B7 LL \u22125 \u00B7 PT +3 \u00B7 SS +7');
  assert.equal(angleLine(open, other, 'full_spine'), 'PI +10 \u00B7 LL \u22125 \u00B7 PT +3 \u00B7 SS +7');
  const neckA = cervicalStudy('c', { study: { calibration: CALIBRATION } });
  const neckB = cervicalStudy('d', { geometry: { dx: 20 }, study: { calibration: CALIBRATION } });
  assert.match(angleLine(neckA, neckB, 'cervical'), /^Cobb [+\u2212]?\d+ \u00B7 SVA [+\u2212]?\d+$/);
  const uncalibrated = cervicalStudy('e', { geometry: { dx: 20 } });
  assert.match(angleLine(neckA, uncalibrated, 'cervical'), /SVA \u2014$/);
});

test('subjectFilms is stage 1', () => {
  const a = study('a', { subjectId: 'S1' });
  const b = study('b', { subjectId: 's1' });
  assert.deepEqual(subjectFilms(a, [a, b, study('c')]).map((s) => s.id), ['a', 'b']);
  assert.deepEqual(subjectFilms(study('d'), [a]).map((s) => s.id), ['d']);
});
```

Note: `entryDistance([0, 0], [1, 1], [1, 3], 1)` is `sqrt((1·1 + 3·1) / 4) = 1`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/similarity.test.js`
Expected: FAIL — `shapePair`, `entryDistance`, `weightsFor` not exported; `MODES` is an object.

- [ ] **Step 3: Rewrite `renderer/data/similarity.js`**

```js
/**
 * Pure ranking for the Find similar tab (similar-cases spec 2026-09-30, sections 6 and 7; stage 1's
 * section 7.4 fusion unchanged). Thirteen blocks in four families, read by data/similarity-blocks.js:
 * shape blocks compare over the landmarks both films share (mirror, centre, scale over the shared
 * points -- never rotate); entry blocks are a weighted RMS over the entries both films have; the
 * appearance blocks are cosine distances over unit vectors from the same encoder. Each block's
 * distance is divided by its median over the candidates; the region and the mode pick the weight
 * table (equal family budgets); the fused distance is a weighted root-mean-square. No DOM.
 */
import { HAND_ADDED, matchesLocation, subjectKey } from './parameters.js';
import { cervicalMeasurements } from './cervical.js';
import {
  REGIONS, BLOCKS, BLOCK_KEYS, ENTRY_KEYS, LANDMARK_ORDER, CERVICAL_ORDER, ALIGNMENT_ORDER, ALIGNMENT_WEIGHTS,
  blockOf, weightsFor, lumbarPoints, cervicalPoints, alignment, studyBlocks, hasRegion, defaultRegion,
} from './similarity-blocks.js';

export { REGIONS, BLOCKS, BLOCK_KEYS, LANDMARK_ORDER, CERVICAL_ORDER, ALIGNMENT_ORDER, ALIGNMENT_WEIGHTS, weightsFor, hasRegion, defaultRegion, alignment, studyBlocks };
export const MODES = Object.freeze(['all', 'shape', 'alignment', 'appearance']);
export const SCOPES = Object.freeze(['all', 'workspace']);
export const LUMBAR_SHAPE = Object.freeze({ order: LANDMARK_ORDER, floor: 14, require: Object.freeze(['S1.SA', 'S1.SP']) });
export const CERVICAL_SHAPE = Object.freeze({ order: CERVICAL_ORDER, floor: 14, require: Object.freeze([]) });

const DASH = '\u2014';
const SEP = ' \u00B7 ';
const MINUS = '\u2212';

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function mean(list) {
  return list.reduce((sum, v) => sum + v, 0) / list.length;
}

function euclid(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function needsEmbedding(mode) {
  return mode === 'all' || mode === 'appearance';
}

// Mirror by `sign`, translate the centroid to the origin, scale the centroid size to one (spec 7.1).
function normalise(points, sign) {
  const mirrored = points.map(([x, y]) => [sign * x, y]);
  const cx = mean(mirrored.map(([x]) => x));
  const cy = mean(mirrored.map(([, y]) => y));
  const centred = mirrored.map(([x, y]) => [x - cx, y - cy]);
  const size = Math.sqrt(centred.reduce((sum, [x, y]) => sum + x * x + y * y, 0));
  if (!(size > 0)) return null;
  return { list: centred.flatMap(([x, y]) => [x / size, y / size]), sign, cx, cy, size };
}

// The lumbar mirror: anterior corners (SA, IA) must sit at +x. Decided over the points given.
function lumbarSign(names, points) {
  const anterior = [];
  const posterior = [];
  names.forEach((name, i) => (name.endsWith('.SA') || name.endsWith('.IA') ? anterior : posterior).push(points[i][0]));
  return mean(anterior) < mean(posterior) ? -1 : 1;
}

export function sideSign(side) {
  return side === 'left' ? -1 : 1;
}

// The shape distance over the points both films have (spec decision 6): the names in `shape.order`
// present in both maps, each film normalised over those points alone; null below the floor or
// without a required point. `signA`/`signB` fix the mirror (the cervical side); null = the lumbar test.
export function shapePair(a, b, shape, signA, signB) {
  const names = shape.order.filter((name) => a.has(name) && b.has(name));
  if (names.length < shape.floor || !shape.require.every((name) => names.includes(name))) return null;
  const pa = names.map((name) => a.get(name));
  const pb = names.map((name) => b.get(name));
  const ta = normalise(pa, signA ?? lumbarSign(names, pa));
  const tb = normalise(pb, signB ?? lumbarSign(names, pb));
  if (!ta || !tb) return null;
  return { d: euclid(ta.list, tb.list), a: ta, b: tb };
}

export function hipUnder(hip, transform) {
  return [(transform.sign * hip[0] - transform.cx) / transform.size, (hip[1] - transform.cy) / transform.size];
}

// The complete lumbar shape for the export (stage 1's vector): null unless every level and S1 are present.
export function vector(study) {
  const points = lumbarPoints(study);
  if (points.size !== LANDMARK_ORDER.length) return null;
  const list = LANDMARK_ORDER.map((name) => points.get(name));
  const t = normalise(list, lumbarSign(LANDMARK_ORDER, list));
  if (!t) return null;
  const hip = study.geometry.hip_midpoint;
  return { V: t.list, H: Array.isArray(hip) && finite(hip[0]) && finite(hip[1]) ? hipUnder(hip, t) : null };
}

export function cervicalVector(study) {
  const points = cervicalPoints(study);
  if (points.size !== CERVICAL_ORDER.length) return null;
  const t = normalise(CERVICAL_ORDER.map((name) => points.get(name)), sideSign(study.geometry.anterior_side));
  return t ? { V: t.list } : null;
}

// Weighted RMS over the indices finite on both sides; null below `floor` shared entries.
export function entryDistance(a, b, weights, floor) {
  let sum = 0;
  let weight = 0;
  let shared = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (!finite(a[i]) || !finite(b[i])) continue;
    const w = weights ? weights[i] : 1;
    const d = a[i] - b[i];
    sum += w * d * d;
    weight += w;
    shared += 1;
  }
  if (shared < floor || weight <= 0) return null;
  return Math.sqrt(sum / weight);
}

// 1 - cosine over unit vectors, floored at 0 for float noise.
export function appearanceDistance(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return Math.max(0, 1 - dot);
}

// Every switched-on block's distance for the pair, or null where the pair lacks it (spec section 6's
// last column). `open` and `candidate` are studyBlocks() results.
export function pairDistances(open, candidate, weights) {
  const on = (key) => weights[key] > 0;
  const d = {};
  for (const key of BLOCK_KEYS) d[key] = null;
  const lumbar = on('V') || on('H') ? shapePair(open.lumbar, candidate.lumbar, LUMBAR_SHAPE, null, null) : null;
  if (on('V') && lumbar) d.V = lumbar.d;
  if (on('H') && lumbar && open.hip && candidate.hip) d.H = euclid(hipUnder(open.hip, lumbar.a), hipUnder(candidate.hip, lumbar.b));
  if (on('VC') && open.side && candidate.side) {
    const cervical = shapePair(open.cervical, candidate.cervical, CERVICAL_SHAPE, sideSign(open.side), sideSign(candidate.side));
    if (cervical) d.VC = cervical.d;
  }
  for (const key of ENTRY_KEYS) {
    if (!on(key)) continue;
    const block = blockOf(key);
    d[key] = entryDistance(open.entries[key], candidate.entries[key], block.weights ?? null, block.floor);
  }
  const sameModel = open.model !== null && open.model === candidate.model;
  const both = (key) => sameModel && open.vectors[key] !== null && candidate.vectors[key] !== null;
  if (on('C') && both('C')) d.C = appearanceDistance(open.vectors.C, candidate.vectors.C);
  if (on('CC') && both('CC')) d.CC = appearanceDistance(open.vectors.CC, candidate.vectors.CC);
  if (on('W') && both('W') && open.region === 'full_spine' && candidate.region === 'full_spine') d.W = appearanceDistance(open.vectors.W, candidate.vectors.W);
  return d;
}

// The median of the present values when there are at least three and it is positive, else 1.
export function medianScale(values) {
  const present = (values ?? []).filter(finite);
  if (present.length < 3) return 1;
  const sorted = [...present].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return median > 0 ? median : 1;
}

// sqrt(sum w_i (d_i / m_i)^2 / sum w_i) over the present, weighted blocks; null with none.
export function fuse(distances, scales, weights) {
  let sum = 0;
  let weight = 0;
  const present = [];
  for (const key of BLOCK_KEYS) {
    const d = distances[key];
    if (!(weights[key] > 0) || !finite(d)) continue;
    const scaled = d / (finite(scales?.[key]) && scales[key] > 0 ? scales[key] : 1);
    sum += weights[key] * scaled * scaled;
    weight += weights[key];
    present.push(key);
  }
  if (weight === 0) return null;
  return { d: Math.sqrt(sum / weight), blocks: present };
}

export function matchScore(d) {
  return Math.max(0, Math.min(100, Math.round(100 * Math.exp(-d))));
}

function rootOf(study) {
  return typeof study.workspaceFolder === 'string' && study.workspaceFolder !== '' ? study.workspaceFolder : HAND_ADDED;
}

// The stored records keyed by id: renderer/embeddings.js's Map, or a plain object in tests.
function embeddingOf(embeddings, id) {
  if (!embeddings) return null;
  return embeddings instanceof Map ? (embeddings.get(id) ?? null) : (embeddings[id] ?? null);
}

// Spec 7.5: real, not self, segmented, with the region's anatomy, in scope, not the same subject, and
// with an embedding record when the mode needs one. Coverage flags are never read.
export function candidates(open, all, { scope = 'all', region = 'lumbar', mode = 'all', embeddings = {} } = {}) {
  const openKey = subjectKey(open);
  const filters = { workspace: rootOf(open), folder: null };
  return (all ?? []).filter((c) => c && c.source === 'real' && c.id !== open.id
    && hasRegion(c, region)
    && (scope !== 'workspace' || matchesLocation(c, filters))
    && !(openKey !== null && subjectKey(c) === openKey)
    && (!needsEmbedding(mode) || embeddingOf(embeddings, c.id) !== null));
}

// { matches: [{ study, d, match, blocks, absent }], total, stale, region, weights }. `absent` lists the
// switched-on blocks the pair lacked, for the card; `stale` counts candidates whose record came from
// another graph than the open study's (stage 1 section 11).
export function findSimilar(open, all, { scope = 'all', region = null, mode = 'all', embeddings = {}, n = 5 } = {}) {
  const r = REGIONS.includes(region) ? region : defaultRegion(open);
  const weights = weightsFor(r, mode);
  const on = BLOCK_KEYS.filter((key) => weights[key] > 0);
  const openBlocks = studyBlocks(open, embeddingOf(embeddings, open.id));
  const pool = candidates(open, all, { scope, region: r, mode, embeddings });
  const entries = pool.map((study) => {
    const b = studyBlocks(study, embeddingOf(embeddings, study.id));
    return { study, b, distances: pairDistances(openBlocks, b, weights) };
  });
  const scales = {};
  for (const key of BLOCK_KEYS) scales[key] = medianScale(entries.map((e) => e.distances[key]));
  const ranked = [];
  let stale = 0;
  for (const entry of entries) {
    if (needsEmbedding(mode) && entry.b.model !== null && openBlocks.model !== null && entry.b.model !== openBlocks.model) stale += 1;
    const fused = fuse(entry.distances, scales, weights);
    if (!fused) continue;
    ranked.push({ study: entry.study, d: fused.d, match: matchScore(fused.d), blocks: fused.blocks,
      absent: on.filter((key) => !fused.blocks.includes(key)) });
  }
  ranked.sort((a, b) => (a.d - b.d) || (a.study.id < b.study.id ? -1 : a.study.id > b.study.id ? 1 : 0));
  return { matches: ranked.slice(0, n), total: ranked.length, stale, region: r, weights };
}

// Why the tab shows no cards for the open study, or null (spec section 10).
export function openReason(open, region, mode, embeddings) {
  if (!open || open.measurements == null || open.geometry == null) return 'unsegmented';
  if (!hasRegion(open, region)) return 'no-region';
  if (needsEmbedding(mode) && embeddingOf(embeddings, open.id) === null) return 'no-embedding';
  if (mode === 'alignment') {
    const b = studyBlocks(open, null);
    const keys = BLOCKS.filter((block) => block.kind === 'alignment' && block.regions.includes(region)).map((block) => block.key);
    if (!keys.some((key) => b.entries[key].some(finite))) return 'no-alignment';
  }
  return null;
}

function signed(diff) {
  const rounded = Math.round(diff);
  return rounded > 0 ? `+${rounded}` : rounded < 0 ? `${MINUS}${Math.abs(rounded)}` : '0';
}

function lumbarAngle(study, key) {
  const m = study?.measurements;
  if (!m) return null;
  const value = key === 'LL' ? m.LL?.['L1-S1'] : m[key];
  return finite(value) ? value : null;
}

// The card's third line: the candidate's value minus the open study's, whole units with a sign, a
// dash where either side is absent. Lumbar and whole spine: PI, LL, PT, SS in degrees. Cervical:
// C2-C7 Cobb in degrees and C2-C7 SVA in millimetres (a dash when either film is uncalibrated).
export function angleLine(open, candidate, region = 'lumbar') {
  if (region === 'cervical') {
    const a = cervicalMeasurements(open);
    const b = cervicalMeasurements(candidate);
    const pair = (label, x, y) => `${label} ${finite(x) && finite(y) ? signed(y - x) : DASH}`;
    return [pair('Cobb', a.C2C7_COBB, b.C2C7_COBB), pair('SVA', a.C2C7_SVA_MM, b.C2C7_SVA_MM)].join(SEP);
  }
  return ['PI', 'LL', 'PT', 'SS'].map((key) => {
    const a = lumbarAngle(open, key);
    const b = lumbarAngle(candidate, key);
    return `${key} ${a === null || b === null ? DASH : signed(b - a)}`;
  }).join(SEP);
}

// The real films sharing the study's subject key, in library order, or the study alone.
export function subjectFilms(study, all) {
  const key = subjectKey(study);
  if (key === null) return [study];
  return (all ?? []).filter((s) => s.source === 'real' && subjectKey(s) === key);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/similarity.test.js test/similarity-blocks.test.js`
Expected: PASS. Then `node --test test/*.test.js`: only `test/dataset.test.js` may still fail (Task 8); the
Find similar tab and the export still import names that moved (`MODES` as a table, `alignment`'s five entries) —
Tasks 6 and 8 fix their callers. Do not launch the app between Tasks 5 and 8.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/similarity.js test/similarity.test.js
git commit -m "feat: the ranking compares over shared landmarks and entries, thirteen blocks by region with equal family budgets"
```

---

### Task 6: The tab — the `REGION` control, the eyebrow, the absent labels, the empty states

**Files:**
- Modify: `renderer/components/similar.js` (whole file; the anchors below are the stage-1 lines)
- Modify: `renderer/store.js:39-40` (add `similarRegion: null` after `similarRank`)

**Interfaces:**
- Consumes: `findSimilar`, `openReason`, `angleLine`, `subjectFilms`, `hasRegion`, `defaultRegion`, `BLOCKS`,
  `REGIONS` from `../data/similarity.js`; `embeddingsMap`, `ensureEmbeddings` from `../embeddings.js`;
  `resolveOutcomes`, `primaryOutcome`, `outcomeLine`, `footerLine` from `../data/outcomes.js` (unchanged).
- Produces: state key `similarRegion: null | {openId, region}`; the control's buttons carry
  `data-similar-key="region-lumbar" | "region-cervical" | "region-full_spine"`; the eyebrow text
  `RANKED BY {LUMBAR|CERVICAL|WHOLE-SPINE} {SHAPE, ALIGNMENT AND APPEARANCE|SHAPE|ALIGNMENT|APPEARANCE}`.

- [ ] **Step 1: Add the state key**

In `renderer/store.js` after `similarRank: 'all',`:

```js
  // (similar-cases spec 2026-09-30, decision 8) the Find similar tab's region pick, held for the film
  // it was made on: null, or { openId, region }. The tab reads the open film's own region otherwise.
  similarRegion: null,
```

- [ ] **Step 2: Rewrite the tab's constants and controls**

In `renderer/components/similar.js` replace the imports and the constants block (`SCOPE_OPTIONS` through `MISSING`)
with:

```js
import { findSimilar, openReason, angleLine, subjectFilms, hasRegion, defaultRegion, BLOCKS } from '../data/similarity.js';
import { getState, setState } from '../store.js';
import { el, clear } from '../dom.js';
import { studyName, subjectLabel } from '../data/labels.js';
import { resolveOutcomes, primaryOutcome, outcomeLine, footerLine } from '../data/outcomes.js';
import { embeddingsMap, ensureEmbeddings } from '../embeddings.js';

const DASH = '\u2014';
const SEP = ' \u00B7 ';
const SCOPE_OPTIONS = [['workspace', 'This workspace'], ['all', 'All studies']];
const REGION_OPTIONS = [['lumbar', 'Lumbar'], ['cervical', 'Cervical'], ['full_spine', 'Whole spine']];
const RANK_OPTIONS = [['all', 'All'], ['shape', 'Shape'], ['alignment', 'Alignment'], ['appearance', 'Appearance']];
const REGION_WORD = { lumbar: 'LUMBAR', cervical: 'CERVICAL', full_spine: 'WHOLE-SPINE' };
const REGION_TEXT = { lumbar: 'lumbar', cervical: 'cervical', full_spine: 'whole-spine' };
const KIND_WORDS = { all: 'SHAPE, ALIGNMENT AND APPEARANCE', shape: 'SHAPE', alignment: 'ALIGNMENT', appearance: 'APPEARANCE' };
const MISSING = Object.fromEntries(BLOCKS.map((block) => [block.key, `\u00B7 ${block.label}`]));

function emptyText(reason, region) {
  switch (reason) {
    case 'unsegmented': return 'Segment this study to find similar cases.';
    case 'no-region': return `This study has no ${REGION_TEXT[region]} anatomy to rank on \u2014 choose another region.`;
    case 'no-embedding': return 'No appearance embedding for this study yet \u2014 run Embed on the Find tab, turn on Appearance embeddings in Settings, or rank by shape or alignment.';
    case 'no-alignment': return `Alignment needs at least one measured ${REGION_TEXT[region]} angle on this study.`;
    default: return '';
  }
}
```

Keep the file's existing imports for `getState`/`setState`, `el`/`clear`, labels and outcomes exactly as they are
if their paths differ from the lines above — the point is the constants, not the import spelling. Delete the old
`EYEBROW`, `EMPTY` and `MISSING` constants.

Change `segmented` so an option may be disabled with a title:

```js
  function segmented(label, key, options, current, onPick, disabled = () => null) {
    return el('div', { class: 'similar-control' },
      el('div', { class: 'sidebar-models-label' }, label),
      el('div', { class: 'model-choice', role: 'group', 'aria-label': label },
        ...options.map(([value, text]) => {
          const why = disabled(value);
          return el('button', {
            type: 'button', class: 'model-choice-btn', 'data-similar-key': `${key}-${value}`,
            'aria-pressed': current === value ? 'true' : 'false',
            disabled: why !== null, title: why ?? '',
            onClick: () => onPick(value),
          }, text);
        })));
  }
```

- [ ] **Step 3: Rewrite `card` and `update` for the region**

`card(match, open, state, region)`:

```js
  function card(match, open, state, region) {
    const { study, absent } = match;
    const resolved = resolveOutcomes(subjectFilms(study, state.studies));
    const status = resolved[primaryOutcome().key].status;
    const active = state.compareId === study.id;
    const missing = absent.map((key) => MISSING[key]).join(' ');
    return el('button', {
      type: 'button',
      class: `similar-card${active ? ' is-active' : ''}`,
      'data-similar-key': `card-${study.id}`,
      'data-study-id': study.id,
      'aria-pressed': active ? 'true' : 'false',
      onClick: () => setState((s) => ({ compareId: s.compareId === study.id ? null : study.id })),
    },
      study.thumbnail
        ? el('img', { class: 'similar-thumb', src: study.thumbnail, alt: '' })
        : el('div', { class: 'similar-thumb similar-thumb-empty', 'aria-hidden': 'true' }),
      el('div', { class: 'similar-body' },
        el('div', { class: 'similar-line similar-line-1' },
          el('span', { class: 'similar-name', title: studyName(study) }, studyName(study)),
          el('span', { class: 'similar-match' }, `${match.match}%`,
            missing ? el('span', { class: 'similar-missing' }, ` ${missing}`) : null)),
        el('div', { class: 'similar-line similar-meta' },
          `${subjectLabel(study)}${SEP}${study.timepoint ?? DASH}${SEP}${study.view || DASH}${SEP}${study.filmDate || DASH}`),
        el('div', { class: 'similar-line similar-angles' }, angleLine(open, study, region)),
        el('div', { class: 'similar-line similar-outcome', 'data-outcome': status }, outcomeLine(resolved)),
        el('div', { class: 'similar-line similar-state eyebrow' },
          active ? 'IN VIEWER \u00B7 CLICK TO REMOVE' : 'CLICK TO COMPARE IN VIEWER')));
  }
```

In `update()`: add `state.similarRegion` to the `key` array; after `const mode = state.similarRank;` compute

```js
    const region = state.similarRegion?.openId === open.id ? state.similarRegion.region : defaultRegion(open);
    const regionReason = (value) => (hasRegion(open, value) ? null : `This study has no ${REGION_TEXT[value]} anatomy`);
```

and render the three controls and the eyebrow:

```js
    root.append(
      segmented('SCOPE', 'scope', SCOPE_OPTIONS, scope, (value) => setState({ similarScope: value })),
      segmented('REGION', 'region', REGION_OPTIONS, region, (value) => setState({ similarRegion: { openId: open.id, region: value } }), regionReason),
      segmented('RANK BY', 'rank', RANK_OPTIONS, mode, (value) => setState({ similarRank: value })),
      el('div', { class: 'eyebrow similar-eyebrow' }, `RANKED BY ${REGION_WORD[region]} ${KIND_WORDS[mode]}`));
```

Replace `openReason(open, mode, embeddings)` with `openReason(open, region, mode, embeddings)` and `EMPTY[reason]`
with `emptyText(reason, region)`; pass `region` into `findSimilar(open, state.studies, { scope, region, mode,
embeddings, n: 5 })` and into every `card(match, open, state, region)`. Everything else in `update` (the footer, the
tails, focus restore) stays as it is.

- [ ] **Step 4: Verify by hand from source**

Launch from PowerShell: `Set-Location "C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d"; $env:SPINE_CONTOUR_PYTHON = "C:\Users\codyj\spine contour\.venv\Scripts\python.exe"; npm.cmd run dev`
(Task 7 must be done first, or `studies.js`'s `cannotEmbed` import throws.) Open a lumbar film → the Find similar tab
shows `SCOPE`, `REGION` with Lumbar pressed and Cervical/Whole spine disabled (hover: "This study has no cervical
anatomy"), `RANK BY`; the eyebrow reads `RANKED BY LUMBAR SHAPE, ALIGNMENT AND APPEARANCE`; cards carry `· no disc
heights` on uncalibrated candidates. Open another film: the region resets to that film's. Console clean. Record what
was seen in the commit body; this is DOM code with no unit test.

- [ ] **Step 5: Commit**

```bash
git add renderer/components/similar.js renderer/store.js
git commit -m "feat: a Region control on the Find similar tab; cards name every absent block; the eyebrow names the region"
```

---

### Task 7: `Embed` counts every segmented film and posts the region

**Files:**
- Modify: `renderer/data/batch.js:52-70` (`planEmbed`)
- Modify: `renderer/screens/studies.js:32` (the import) and `:786-806` (the embed row)
- Modify: `renderer/screens/analysis.js:430` (`embedStudy`'s request)
- Modify: `main.js:398-412` (the `embed` handler)
- Test: `test/batch.test.js` (the `planEmbed` tests)

**Interfaces:**
- Consumes: `needsEmbedding(study)` (Task 3), `studyRegion` from `renderer/data/cervical.js`.
- Produces: `planEmbed({visible, selected, running, needs}) -> {ids, label, note, enabled, hidden}` (no `excluded`);
  the `/embed` request gains `region`.

- [ ] **Step 1: Update the `planEmbed` tests**

In `test/batch.test.js` find the tests that call `planEmbed` with `ineligible` or assert `excluded`; remove the
`ineligible` argument and the `excluded` assertions, and add:

```js
test('planEmbed has no excluded count: every segmented film needs can embed', () => {
  const plan = planEmbed({ visible: [{ id: 'a', source: 'real' }, { id: 'b', source: 'real' }], selected: new Set(), running: null, needs: (s) => s.id === 'a' });
  assert.deepEqual(Object.keys(plan).sort(), ['enabled', 'hidden', 'ids', 'label', 'note']);
  assert.deepEqual(plan.ids, ['a']);
  assert.equal(plan.label, 'Embed 1');
});
```

Read the file's existing `planEmbed` tests first and keep their `selected` shape (a `Set` of ids or whatever
`selectedVisible` takes).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/batch.test.js`
Expected: FAIL — `excluded` is still a key.

- [ ] **Step 3: Simplify `planEmbed`, the Find tab's row, the run core and the IPC**

`renderer/data/batch.js`:

```js
// The Embed button (similar-cases spec 2026-09-30, section 11): the visible (or ticked visible) real
// studies that `needs` says lack a current embedding. Hidden at zero, like nothing else on the bar.
// Nothing is ineligible any more: a film ranks on the blocks it has.
export function planEmbed({ visible, selected, running, needs }) {
  const real = (visible ?? []).filter((study) => study.source === 'real');
  const chosen = selectedVisible(real, selected);
  const pool = chosen.length > 0 ? chosen : real;
  const ids = pool.filter((study) => needs(study)).map((study) => study.id);
  const label = chosen.length > 0 ? `Embed ${ids.length} selected` : `Embed ${ids.length}`;
  return { ids, label, note: running ? WAIT_FOR_RUN : null, enabled: ids.length > 0 && !running, hidden: ids.length === 0 };
}
```

`renderer/screens/studies.js`: the import becomes `import { forgetEmbedding, ensureEmbeddings, needsEmbedding } from '../embeddings.js';`;
`planEmbed({ visible, selected: live.paramSelected, running: live.running, needs: needsEmbedding })`; delete the
`embedPlan.excluded > 0 ? el('span', ...) : null` element (the `embed-note`).

`renderer/screens/analysis.js`: import `studyRegion` from `'../data/cervical.js'` (if not already imported) and
change the request to
`embed({ id: studyId, imagePng: sidecar.image_png, framing: sidecar.qc?.framing ?? null, region: studyRegion(after ?? live) })`
— compute `const region = studyRegion(live);` before the `await` and pass `region`.

`main.js` `embed` handler, after the `framing` line:

```js
  if (typeof request.region === 'string' && ['lumbar', 'cervical', 'full_spine'].includes(request.region)) form.append('region', request.region);
```

- [ ] **Step 4: Run the tests and launch**

Run: `node --test test/*.test.js` — expected: PASS except `test/dataset.test.js` (Task 8). Launch from source (the
PowerShell block in Task 6) and on the Find tab confirm: no `partial — not embeddable` note; `Embed {n}` counts every
segmented real film without a version-2 record (after this build, the whole library); run `Embed` on one film and
check `embeddings/<id>.json` under the profile is version 2 with `region`, `lumbar`, `cervical`, `whole`. Record
the count seen in the commit body.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/batch.js renderer/screens/studies.js renderer/screens/analysis.js main.js test/batch.test.js
git commit -m "feat: Embed counts every segmented film and posts the film's region; the partial note is gone"
```

---

### Task 8: `Export dataset` — `vectors.json` version 2, `Region` columns, the README

**Files:**
- Modify: `renderer/data/dataset.js` (`PROVENANCE_COLUMNS`, `filmType`, `provenanceCells`, the paired columns,
  the `films` loop, `vectors`, the manifest counts, `datasetReadme`)
- Test: `test/dataset.test.js`

**Interfaces:**
- Consumes: `vector`, `cervicalVector`, `studyBlocks`, `LANDMARK_ORDER`, `CERVICAL_ORDER`, `ALIGNMENT_ORDER`,
  `ALIGNMENT_WEIGHTS`, `subjectFilms` from `./similarity.js`; `LUMBAR_SEGMENTAL_ORDER`, `CERVICAL_SEGMENTAL_ORDER`,
  `DISC_ORDER`, `FAMILIES`, `BLOCKS` from `./similarity-blocks.js`; `studyRegion` from `./cervical.js`;
  `readEmbedding`, `isCurrent` from `./embeddings.js`.
- Produces: `vectors.json` `{version: 2, exportedAt, families, blocks, films: [{name, region, V, H, A, SL, D, VC, AC,
  BC, SC, B, lumbar, cervical, whole}]}`; `parameters.csv`'s first provenance column is `Region`; `paired.csv`'s
  per-visit columns are `<header> region`; `manifest.json` gains `counts.regions`.

- [ ] **Step 1: Update the dataset tests**

In `test/dataset.test.js` change every embedding fixture from `{version: 1, ..., filmType, crop, whole}` to
`{version: 2, ..., region: 'lumbar', lumbar: [...], cervical: null, whole: [...]}`; every assertion on `Film type` →
`Region` with the value `'lumbar'`; `<h> film type` → `<h> region`; `vectors.version` → 2; `films[i].shape` →
`films[i].V`, `.hip` → `.H`, `.alignment` → `.A` (now six numbers), `.crop` → `.lumbar`, `.filmType` → `.region`.
Add:

```js
test('vectors.json version 2 carries every block by key with null where a film lacks it', () => {
  const rows = [study('SP-1', { calibration: CALIBRATION }), study('SP-2', { geometry: null, measurements: null })];
  const embeddings = { 'SP-1': { version: 2, id: 'SP-1', model: { onnx_sha256: 'abc' }, region: 'lumbar', lumbar: [1, 0], cervical: null, whole: [0, 1] } };
  const { files } = buildDataset({ rows, post: 'Post-op', embeddings, bundledSha: 'abc', version: '1.0.13' });
  const vectors = JSON.parse(files['vectors.json']);
  assert.equal(vectors.version, 2);
  assert.deepEqual(vectors.families, { lumbar: ['V', 'H', 'A', 'SL', 'D'], cervical: ['VC', 'AC', 'BC', 'SC'], whole: ['B', 'W'], appearance: ['C', 'CC'] });
  assert.deepEqual(Object.keys(vectors.blocks), ['V', 'H', 'A', 'SL', 'D', 'VC', 'AC', 'BC', 'SC', 'B', 'embedding']);
  assert.equal(vectors.blocks.A.order.length, 6);
  assert.equal(vectors.blocks.VC.normalisation, 'mirror-by-anterior-side, centroid, unit-centroid-size, no-rotation');
  const [one, two] = vectors.films;
  assert.deepEqual(Object.keys(one), ['name', 'region', 'V', 'H', 'A', 'SL', 'D', 'VC', 'AC', 'BC', 'SC', 'B', 'lumbar', 'cervical', 'whole']);
  assert.equal(one.region, 'lumbar');
  assert.equal(one.V.length, 44);
  assert.equal(one.D.length, 15);
  assert.equal(one.VC, null);
  assert.deepEqual(one.lumbar, [1, 0]);
  assert.equal(two.V, null);
  assert.equal(two.lumbar, null);
  const manifest = JSON.parse(files['manifest.json']);
  assert.deepEqual(manifest.counts.regions, { lumbar: 2, cervical: 0, full_spine: 0 });
});
```

Adapt `study`, `CALIBRATION` and the `files` access to what the file already uses (read its first fifty lines: it
has its own `study` fixture and reads `buildDataset`'s result through whatever key it exposes — `files`, `folder`,
`counts`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/dataset.test.js`
Expected: FAIL — `vectors.version` is 1; `Film type` column; `films[0].V` undefined.

- [ ] **Step 3: Rewrite the export's blocks**

In `renderer/data/dataset.js`:

- Imports: replace `vector, alignment, subjectFilms, LANDMARK_ORDER, ALIGNMENT_ORDER, ALIGNMENT_WEIGHTS` with
  `vector, cervicalVector, studyBlocks, subjectFilms, LANDMARK_ORDER, CERVICAL_ORDER, ALIGNMENT_ORDER, ALIGNMENT_WEIGHTS`
  from `./similarity.js`; add `import { LUMBAR_SEGMENTAL_ORDER, CERVICAL_SEGMENTAL_ORDER, DISC_ORDER } from './similarity-blocks.js';`
  and `import { studyRegion } from './cervical.js';`.
- `PROVENANCE_COLUMNS`: `'Film type'` → `'Region'`. Delete `filmType(embedding)`; in `provenanceCells` the first cell is
  `studyRegion(study)`.
- The paired columns: `` `${h} film type` `` → `` `${h} region` ``, and the cell
  `visit ? studyRegion(visit.films[0]) : ''`.
- The `films` loop:

```js
  for (const study of real) {
    const embedding = currentEmbedding(embeddings, study.id, sha);
    if (!embedding) withoutEmbedding += 1;
    const lumbar = vector(study);
    const cervical = cervicalVector(study);
    const b = studyBlocks(study, null);
    films.push({
      name: studyName(study),
      region: studyRegion(study),
      V: lumbar ? lumbar.V : null,
      H: lumbar ? lumbar.H : null,
      A: b.entries.A, SL: b.entries.SL, D: b.entries.D,
      VC: cervical ? cervical.V : null,
      AC: b.entries.AC, BC: b.entries.BC, SC: b.entries.SC, B: b.entries.B,
      lumbar: embedding ? embedding.lumbar : null,
      cervical: embedding ? embedding.cervical : null,
      whole: embedding ? embedding.whole : null,
    });
  }
  const vectors = {
    version: 2,
    exportedAt: now.toISOString(),
    families: { lumbar: ['V', 'H', 'A', 'SL', 'D'], cervical: ['VC', 'AC', 'BC', 'SC'], whole: ['B', 'W'], appearance: ['C', 'CC'] },
    blocks: {
      V: { dim: 44, order: [...LANDMARK_ORDER], normalisation: 'mirror-anterior-positive-x, centroid, unit-centroid-size, no-rotation' },
      H: { dim: 2, normalisation: 'the V transform' },
      A: { order: [...ALIGNMENT_ORDER], weights: [...ALIGNMENT_WEIGHTS], unit: 'deg' },
      SL: { order: [...LUMBAR_SEGMENTAL_ORDER], unit: 'deg' },
      D: { order: [...DISC_ORDER], unit: 'mm' },
      VC: { dim: 44, order: [...CERVICAL_ORDER], normalisation: 'mirror-by-anterior-side, centroid, unit-centroid-size, no-rotation' },
      AC: { order: ['C2-C7 Cobb'], unit: 'deg' },
      BC: { order: ['C2-C7 SVA'], unit: 'mm' },
      SC: { order: [...CERVICAL_SEGMENTAL_ORDER], unit: 'deg' },
      B: { order: ['C7-S1 SVA'], unit: 'mm' },
      embedding: embeddingRecord,
    },
    films,
  };
```

- The counts: add `regions: { lumbar: 0, cervical: 0, full_spine: 0 }` filled by `for (const study of real) regions[studyRegion(study)] += 1;`.
- `currentEmbedding` reads through `readEmbedding` before `isCurrent`: `const record = readEmbedding(raw); return record && isCurrent(record, bundledSha) ? record : null;`.
- `datasetReadme`: replace the `vectors.json` bullet with

```js
    `- \`vectors.json\` (version 2) - one entry per row of parameters.csv, in the same order, named by study name, with the film's region. Blocks by key, \`null\` where a film lacks one: lumbar family \`V\` (44 numbers, the 22 lumbar landmarks ${LANDMARK_ORDER.join(', ')} after mirroring anterior to +x, centring and scaling to unit centroid size, never rotated), \`H\` (the hip midpoint under the same transform), \`A\` (${ALIGNMENT_ORDER.join(', ')} in degrees, weighted ${ALIGNMENT_WEIGHTS.join(', ')}), \`SL\` (the ten lumbar segmental lordosis and angulation values, degrees), \`D\` (fifteen disc heights in mm, calibrated films only); cervical family \`VC\` (44 numbers, ${CERVICAL_ORDER.join(', ')} mirrored by the recorded anterior side), \`AC\` (C2-C7 Cobb, degrees), \`BC\` (C2-C7 SVA, mm, calibrated only), \`SC\` (the ten cervical segmental values); whole-spine family \`B\` (C7-S1 SVA, mm, full-spine calibrated films only); and the appearance vectors \`lumbar\`, \`cervical\` and \`whole\` from ${encoder}, unit length, never carried from an encoder other than the one manifest.json names. In the app every block is scaled by its median over the candidates and the four families share equal budgets.`,
```

and the blank-value line's "A partial segmentation has no `shape`" → "A film lacking a block's inputs has `null`
for that block."

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/*.test.js`
Expected: PASS, every file.

- [ ] **Step 5: Commit**

```bash
git add renderer/data/dataset.js test/dataset.test.js
git commit -m "feat: Export dataset writes vectors.json version 2 with every block by key and a Region column"
```

---

### Task 9: The smoke suite

**Files:**
- Modify: `tools/smoke/smoke-similar.mjs`

**Interfaces:**
- Consumes: the tab's `data-similar-key` values (Task 6), the version-2 record (Task 3), the Embed row (Task 7).

- [ ] **Step 1: Update the fixture and the checks**

Read the suite top to bottom first (`sed -n '1,120p'`, then the sections). Then:

1. `embedRecord(id, model, crop)` injects `{ version: 2, id, computedAt, sourceSha256: null, model, region: 'lumbar', lumbar: crop, cervical: null, whole: null }`.
2. Section 1: after the scope/rank checks add
   `check('region-lumbar is pressed for a lumbar film', (await attr('[data-similar-key="region-lumbar"]', 'aria-pressed')) === 'true', null);`
   and `check('region-cervical is disabled for a lumbar film', await cdp.evaluate("document.querySelector('[data-similar-key=\"region-cervical\"]').disabled"), null);`.
3. Every eyebrow expectation: `RANKED BY SHAPE, ALIGNMENT AND APPEARANCE` → `RANKED BY LUMBAR SHAPE, ALIGNMENT AND APPEARANCE`;
   `RANKED BY SPINE SHAPE` → `RANKED BY LUMBAR SHAPE`; `RANKED BY SPINOPELVIC ALIGNMENT` → `RANKED BY LUMBAR ALIGNMENT`;
   `RANKED BY APPEARANCE` → `RANKED BY LUMBAR APPEARANCE`.
4. The partial study `SP-9205` is a candidate now: change `cards exclude the same-subject study and the partial study`
   to exclude only `SP-9201`, and add `SP-9205` to the Shape set (`['SP-9202', 'SP-9203', 'SP-9204', 'SP-9205', 'SP-9206']`)
   — then the "six eligible candidates render at most five cards" section needs one fewer injected extra; adjust the
   count it injects.
5. The missing markers: `· no appearance` → `· no lumbar crop`; `· no whole film` under Appearance for a lumbar film
   no longer appears (W is off under the lumbar region) — replace that check with
   `check("no card carries the whole-film marker under the lumbar region", !((await cardText('SP-9202', '.similar-missing')) ?? '').includes('no whole film'), await cardText('SP-9202', '.similar-missing'));`.
   Uncalibrated fixtures now carry `· no disc heights` on every card under All and Shape: add one check for it on `SP-9202`.
6. The empty-state section: the `partial` wording check (`Similar cases need all five lumbar levels and S1`) is
   replaced by injecting a study with no geometry at all (`geometry: { vertebrae: {}, s1_superior: null }`, measurements all null)
   and checking `This study has no lumbar anatomy to rank on \u2014 choose another region.`.
7. Section 10 (the Embed count): with version-2 fixture records the count is unchanged; the `embed-note` check
   becomes `check('there is no partial note any more', !(await has('[data-find-key="embed-note"]')), null);`.
8. A cervical fixture: add `SP-9212` with `region: 'cervical'`, `geometry` from a `cervicalGeom()` helper mirroring
   Task 4's test fixture (C2 inferior, C3–C7 corners, `anterior_side: 'left'`, `region: 'cervical'`), `measurements: { region: 'cervical' }`,
   `qc: FULL_QC`; open it (`setState({ openId: 'SP-9212', tab: 'sim' })`) and check: `region-cervical` pressed,
   `region-lumbar` disabled, the eyebrow `RANKED BY CERVICAL SHAPE, ALIGNMENT AND APPEARANCE`, and with no other cervical
   film the empty text `No other eligible studies in the library.`; inject a second cervical fixture `SP-9213` (dx 10)
   and check one card renders with an angle line starting `Cobb `.

- [ ] **Step 2: Run the suite**

From the Bash tool, foreground, captured to a file:

```bash
SPINE_CONTOUR_PYTHON="C:/Users/codyj/spine contour/.venv/Scripts/python.exe" node tools/smoke/launch.mjs > tools/smoke/out/similar-launch.txt 2>&1
node tools/smoke/smoke-similar.mjs > tools/smoke/out/smoke-similar.txt 2>&1
node tools/smoke/cdp.mjs --quit
```

Expected: every check passes; the file's last line is the count (stage 1 was 69/69; record the new total). Then
`smoke-parameters.mjs` and, on a fresh launch, `smoke-studies.mjs`, in that order, each to its own file.

- [ ] **Step 3: Commit**

```bash
git add tools/smoke/smoke-similar.mjs
git commit -m "test: smoke-similar covers the Region control, version-2 records, the partial study ranking and a cervical film"
```

---

### Task 10: The records

**Files:**
- Modify: `docs/superpowers/plans/2026-08-31-00-architecture-contract.md` (the `### renderer/data/similarity.js`
  section and a new `## 2026-09-30 amendment: similar cases stage 2 — regions and every measured parameter`)
- Modify: `docs/superpowers/specs/2026-09-12-similar-cases-outcomes-design.md` (status line: decisions 1, 2, 5, 7, 15
  superseded by the stage-2 spec; gate decision 75 superseded)
- Modify: `docs/superpowers/specs/2026-09-30-similar-cases-stage-2-regions-design.md` (status line: implemented,
  the counts)
- Modify: `docs/superpowers/HANDOFF.md` (decision 78: supersedes 75 — the Embed count includes every segmented film;
  a film ranks on the blocks it has)
- Modify: `docs/ROADMAP.md:493` (the segmental item is done; note the family sliders stay deferred)
- Modify: `docs/appearance-embeddings.md` (the record shape: `lumbar`, `cervical`, `whole`, `region`; `/embed`'s
  `region` field)
- Modify: `CLAUDE.md` (a 2026-09-30 stage-2 paragraph at the top; the Backend API's `/embed` line)
- Modify: this plan's `## Ledger`

- [ ] **Step 1: Write the contract amendment**

Replace the body of `### renderer/data/similarity.js` with the interface list from Task 5's **Produces** block, in
the contract's `export …  // comment` style, and add `### renderer/data/similarity-blocks.js` right after it with
Task 4's **Produces** list. The new amendment section carries: (1) the two modules; (2) `data/embeddings.js` version 2
and `readEmbedding`; (3) `renderer/embeddings.js` — `cannotEmbed` removed, `needsEmbedding` without the shape gate;
(4) state key `similarRegion: null | {openId, region}`; (5) the backend API — `embedding: {model, lumbar, cervical,
whole, region} | null`, `/embed`'s `region` form field (422 outside the three values); (6) `planEmbed` without
`excluded`/`ineligible`; (7) `vectors.json` version 2 and the `Region` columns; (8) gate decision 75 superseded.

- [ ] **Step 2: Write the other records**

Each file's change is one paragraph or one line, in that document's own voice; the counts come from the ledger.
`CLAUDE.md`'s new paragraph names the branch, the spec, this plan, the thirteen blocks by family, the Region control,
the version-2 record and the one-time re-embed, and the counts.

- [ ] **Step 3: Run everything once more**

`node --test test/*.test.js`; the backend suite; the smoke order from Task 9. Record the counts in the ledger.

- [ ] **Step 4: Commit**

```bash
git add docs CLAUDE.md
git commit -m "docs: similar cases stage 2 — the contract amendment, the records, the ledger"
```

---

### Task 11: Human gate

Not a code task. List these in chat and end the turn (the user answers there):

1. A real lumbar film: the tab opens on Lumbar, the other two regions disabled with their titles; cards name `· no
   disc heights` on uncalibrated candidates and rank sensibly under each `Rank by`.
2. A real full-spine film: the tab opens on Whole spine; Lumbar and Cervical are enabled; under Whole spine the
   cards name every absent cervical or whole-spine block; under Lumbar the film ranks against lumbar films.
3. A real cervical film: the tab opens on Cervical; the angle line reads `Cobb … · SVA …`.
4. `Embed` on the Find tab counts the whole library once, runs, and counts zero after.
5. `Export dataset`: `vectors.json` opens as version 2 with the families and blocks; `parameters.csv` has a `Region`
   column.
6. Console clean throughout.

Then the ledger line `Gate: passed <date>` and the final whole-branch review (Opus).

## Ledger

(Empty at planning. Every ruling, review verdict and count goes here as the tasks run.)
