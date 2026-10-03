// Find similar tab smoke (similar-cases spec, 2026-09-12; Plan B task 10; regions: spec 2026-09-30,
// stage 2 task 9): the tab's controls including the Region control, the four ranking modes, the
// workspace/library scope, outcome and angle lines, comparison mode, the tab's empty states, a
// cervical film and a full-spine film, the Studies screen's Embed count and the Export dataset
// button, all driven straight through the store the way smoke-parameters.mjs drives the Parameters
// tab. DOM-only: the backend need not carry the appearance-embedding graph -- every
// embeddings/<id>.json record this suite ranks by is injected (as a version-2 record) through
// renderer/embeddings.js's own storeEmbedding, never computed.
// Precondition: the app is running from source on a scratch profile, any screen, run BEFORE the
// suites that add real segmented films (smoke-studies.mjs, smoke-workspace.mjs, smoke-persist.mjs)
// -- the same precondition smoke-parameters.mjs documents for the same reason. Section 10's Embed
// count assumes the only real, segmented studies in the library are this suite's own; a real
// segmented study left behind by an earlier suite on the same instance would inflate it.
//
// Nine baseline records under SP-9200..SP-9208 carry the fixture (a synthetic "SIM-S0xx" cohort so
// no injected id collides with the demo library's SP-00xx or another suite's SP-9000/SP-91xx/SP-92xx
// range): SP-9200 is the open study; SP-9201 shares its subject and must never appear; SP-9202,
// SP-9203, SP-9204, SP-9205 and SP-9206 are the eligible candidates under Shape (SP-9202..9205 share
// SP-9200's workspace root, SP-9206 is hand-added); SP-9205 is partial coverage, and since stage 2 a
// partial film is a candidate like any other (no coverage flag is read); SP-9207 is unsegmented;
// SP-9208 shares SP-9200's subject (so it can never contaminate SP-9200's own candidate pool) but
// carries its own unique workspace root and no LL measurement, for the two no-candidate empty
// states. The transient records are injected and removed again within one section: SP-9209 (no
// anatomy at all), SP-9223 (S1 only), SP-9222 (one cervical body), SP-9226 (a lumbar film carrying only
// a cervical body) and SP-9227 (L1-L5, no S1) for the empty sentences,
// SP-9210..SP-9215 to push one ranking past ten candidates for the "more" tail, SP-9220/SP-9221 (a
// cervical pair) and SP-9224/SP-9225 (a full-spine pair) for the Region control. Every fixture's
// file name is "sim-NNNN", never its record id: the id must read nowhere on the tab.
//
// Every selector is a data-similar-key, data-find-key, data-param-key or data-study-id. Never key
// on a visible label or the spec's literal plural wording (the tails are pluralised by the
// component itself -- key on the invariant substring, per the Task 6 review notes).
import { connect } from './cdp-lib.mjs';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

const DASH = '\u2014';
const SEP = ' \u00B7 ';
const DOT = SEP.trim();
const ROOT = 'C:\\smoke-similar\\FusionA';
const ISOLATED_ROOT = 'C:\\smoke-similar\\Isolated';
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

// The same synthetic 5-level-plus-S1 geometry the Task 6/8 reviews' scratch checks used, scaled
// and offset per study so no two studies' shape vectors are identical. `hip: false` omits the
// hip midpoint (SP-9206's "no hip" MISSING marker under Shape).
function geom(dx, dy, scale, { hip = true } = {}) {
  const px = (x, y) => [x * scale + dx, y * scale + dy];
  const vertebrae = {};
  ['L1', 'L2', 'L3', 'L4', 'L5'].forEach((level, i) => {
    const top = 100 + i * 100;
    vertebrae[level] = {
      superior: [px(160, top), px(100, top)],
      inferior: [px(160, top + 80), px(100, top + 80)],
      quadrilateral: [px(160, top), px(100, top), px(100, top + 80), px(160, top + 80)],
    };
  });
  return {
    vertebrae,
    s1_superior: [px(170, 610), px(110, 620)],
    l1_center: px(130, 140),
    hip_midpoint: hip ? px(260, 760) : null,
    femoral_circles: [],
  };
}

// C2 (inferior only) over C3-C7, 60 px apart, anterior on the image LEFT: the unit tests' own
// cervicalGeometry (test/fixtures/similarity-fixtures.js). `levels` trims it to fewer bodies.
function cervicalGeom(dx, dy, scale, { levels = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'] } = {}) {
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
  return { region: 'cervical', vertebrae, anterior_side: 'left', c2_centroid: px(60, 70), image_width: 1000, image_height: 1000 };
}

// The cervical bodies over the lumbar ones (450 px lower), one geometry carrying both and the
// full-spine fields: region, anterior side, C2 and C7 centroids.
function fullSpineGeom(dx, dy, scale) {
  const lumbar = geom(dx, dy + 450, scale);
  const neck = cervicalGeom(dx, dy, scale);
  return {
    ...lumbar, ...neck, vertebrae: { ...neck.vertebrae, ...lumbar.vertebrae }, region: 'full_spine',
    c7_centroid: [60 * scale + dx, 370 * scale + dy], image_width: 1000, image_height: 1500,
  };
}

const FULL_QC = { coverage: { partial: false, unoriented: [] } };
const PARTIAL_QC = { coverage: { partial: true, unoriented: [] } };

function study(id, o) {
  const fileName = o.fileName ?? `${id}.png`;
  return {
    id,
    source: 'real',
    filePath: `${o.workspaceFolder ?? 'C:\\smoke-similar\\hand'}\\${fileName}`,
    fileName,
    name: null,
    workspaceFolder: o.workspaceFolder ?? null,
    subjectId: o.subjectId ?? null,
    timepoint: o.timepoint ?? null,
    filmDate: o.filmDate ?? null,
    reviewedAt: null,
    addedAt: o.addedAt ?? '2026-09-13T00:00:00.000Z',
    view: 'Standing lateral',
    ...(o.region ? { region: o.region, anteriorSide: 'left' } : {}),
    thumbnail: o.thumbnail ?? null,
    measurements: o.measurements === undefined ? null : o.measurements,
    geometry: o.geometry === undefined ? null : o.geometry,
    qc: o.qc === undefined ? null : o.qc,
    clinical: o.clinical ?? {},
  };
}

const MEAS = (pi) => ({ PI: pi, PT: 20, SS: 30, L1PA: 10, LL: { 'L1-S1': 50 } });

// The nine-record baseline (spec section 8; Task 6/7/8/9 reviews' gaps folded in, see the header
// comment for which id covers which trap). Rebuilt fresh into a JS literal on every (re)injection
// rather than patched incrementally, so a mid-suite mutation (the "more" tail, the isolated-study
// empty states) can always be undone by re-running this exact patch.
const RECORDS = [
  study('SP-9200', { // the open study
    workspaceFolder: ROOT, subjectId: 'SIM-S001', timepoint: 'Pre-op', filmDate: '2025-01-01',
    fileName: 'sim-9200.png', measurements: MEAS(50), geometry: geom(0, 0, 1), qc: FULL_QC,
  }),
  study('SP-9201', { // same subject as the open study -- must never appear as a candidate
    workspaceFolder: ROOT, subjectId: 'SIM-S001', timepoint: 'Post-op', filmDate: '2025-06-01',
    fileName: 'sim-9201.png', measurements: MEAS(52), geometry: geom(5, 5, 1.02), qc: FULL_QC,
  }),
  study('SP-9202', { // nearest candidate; fusion extended; a thumbnail
    workspaceFolder: ROOT, subjectId: 'SIM-S002', timepoint: 'Pre-op', filmDate: '2025-01-15',
    fileName: 'sim-9202.png', measurements: MEAS(52), geometry: geom(2, 2, 1.01), qc: FULL_QC,
    clinical: { 'Fusion extension': 'Yes', 'Fusion extension date': '2025-05-01' }, thumbnail: TINY_PNG,
  }),
  study('SP-9203', { // fusion not extended, a follow-up date; the angle-line PI +10 case
    workspaceFolder: ROOT, subjectId: 'SIM-S003', timepoint: 'Pre-op', filmDate: '2025-01-20',
    fileName: 'sim-9203.png', measurements: MEAS(60), geometry: geom(10, 10, 1.05), qc: FULL_QC,
    clinical: { 'Fusion extension': 'No', 'Last follow-up': '2025-06-15' },
  }),
  study('SP-9204', { // outcome not recorded; the stale-model embedding; the furthest PI under Alignment; absent filmDate
    workspaceFolder: ROOT, subjectId: 'SIM-S004', timepoint: 'Pre-op', filmDate: null,
    fileName: 'sim-9204.png', measurements: MEAS(75), geometry: geom(40, 40, 1.3), qc: FULL_QC,
  }),
  study('SP-9205', { // partial coverage -- a candidate like any other since stage 2 (no embedding, so Shape and Alignment only)
    workspaceFolder: ROOT, subjectId: 'SIM-S005', timepoint: 'Pre-op', filmDate: '2025-01-25',
    fileName: 'sim-9205.png', measurements: MEAS(58), geometry: geom(8, 8, 1.02), qc: PARTIAL_QC,
  }),
  study('SP-9206', { // hand-added, no embedding, no subject, no hip midpoint
    workspaceFolder: null, subjectId: null, timepoint: null, filmDate: '2025-02-01',
    fileName: 'sim-9206.png', measurements: MEAS(55), geometry: geom(6, 6, 1.02, { hip: false }), qc: FULL_QC,
  }),
  study('SP-9207', { // unsegmented -- the 'unsegmented' empty state
    workspaceFolder: null, subjectId: 'SIM-S007', timepoint: 'Pre-op', filmDate: '2025-02-05',
    fileName: 'sim-9207.png', measurements: null, geometry: null, qc: null,
  }),
  study('SP-9208', { // same subject as the open study (never its own candidate); a unique workspace root; no LL
    workspaceFolder: ISOLATED_ROOT, subjectId: 'SIM-S001', timepoint: 'Flexion', filmDate: '2025-03-01',
    fileName: 'sim-9208.png', measurements: { PI: 50, PT: 20, SS: 30 }, geometry: geom(3, 3, 1.01), qc: FULL_QC,
  }),
];
const MAIN_IDS = RECORDS.map((r) => r.id);

// Transient extras for the "more than ten" tail (section 4): six copies of the open study's shape
// at slightly different offsets, no embedding, SP-9200's own workspace root, distinct subjects, so
// the five baseline Shape candidates plus these make eleven. Injected and removed within one
// sub-step; never part of the baseline the other sections assume.
const EXTRA = [0, 1, 2, 3, 4, 5].map((i) => study(`SP-921${i}`, {
  workspaceFolder: ROOT, subjectId: `SIM-S01${i}`, timepoint: 'Pre-op', filmDate: `2025-04-0${i + 1}`,
  fileName: `sim-921${i}.png`, measurements: MEAS(56 + i), geometry: geom(12 + 3 * i, 12 + 3 * i, 1.05 + 0.02 * i), qc: FULL_QC,
}));
const MEAS_NULL = { PI: null, PT: null, SS: null, L1PA: null, LL: { 'L1-S1': null } };
// Segmented, but with no anatomy at all: the Region control has nothing to offer it. The geometry
// keeps `femoral_circles: []` the way every stored result does: the Analysis header's confidence
// badge reads its length, so a geometry without it throws in the store's subscriber.
const EMPTY_FILM = study('SP-9209', {
  subjectId: 'SIM-S009', timepoint: 'Pre-op', filmDate: '2025-03-05', fileName: 'sim-9209.png',
  measurements: MEAS_NULL, geometry: { vertebrae: {}, s1_superior: null, femoral_circles: [] }, qc: FULL_QC,
});
// S1 only (lumbar anatomy, but not one measured angle) and one cervical body only (cervical anatomy,
// but no Cobb, no SVA, no segmental angle): the no-alignment sentences, one per region word.
const S1_ONLY = study('SP-9223', {
  subjectId: 'SIM-S023', timepoint: 'Pre-op', filmDate: '2025-03-06', fileName: 'sim-9223.png',
  measurements: MEAS_NULL, geometry: { vertebrae: {}, s1_superior: [[170, 610], [110, 620]], femoral_circles: [] }, qc: FULL_QC,
});
const NECK_ONE = study('SP-9222', {
  region: 'cervical', subjectId: 'SIM-S022', timepoint: 'Pre-op', filmDate: '2025-03-07', fileName: 'sim-9222.png',
  measurements: { region: 'cervical' }, geometry: cervicalGeom(0, 0, 1, { levels: ['C3'] }), qc: FULL_QC,
});
// A film resolved as lumbar that carries only cervical landmarks: its own region has no anatomy but
// another region does, the one way the no-region sentence still reads "choose another region" now that
// a held pick the film lacks falls back to the film's own region (final review M1).
const LUMBAR_NECK = study('SP-9226', {
  region: 'lumbar', subjectId: 'SIM-S026', timepoint: 'Pre-op', filmDate: '2025-03-08', fileName: 'sim-9226.png',
  measurements: MEAS_NULL, geometry: { ...cervicalGeom(0, 0, 1, { levels: ['C3'] }), region: 'lumbar', femoral_circles: [] }, qc: FULL_QC,
});
// L1-L5 and no S1, uncalibrated: V needs S1 and D a scale, so it has nothing to rank on by shape
// ('no-blocks', ruling R21).
const NO_S1 = study('SP-9227', {
  subjectId: 'SIM-S027', timepoint: 'Pre-op', filmDate: '2025-03-09', fileName: 'sim-9227.png',
  measurements: MEAS_NULL, geometry: { ...geom(0, 0, 1), s1_superior: null }, qc: FULL_QC,
});
const CERVICAL = [0, 1].map((i) => study(`SP-922${i}`, {
  workspaceFolder: ROOT, region: 'cervical', subjectId: `SIM-S02${i}`, timepoint: 'Pre-op', filmDate: `2025-05-0${i + 1}`,
  fileName: `sim-922${i}.png`, measurements: { region: 'cervical' }, geometry: cervicalGeom(10 * i, 0, 1), qc: FULL_QC,
}));
const FULL_SPINE = [0, 1].map((i) => study(`SP-922${4 + i}`, {
  workspaceFolder: ROOT, region: 'full_spine', subjectId: `SIM-S02${4 + i}`, timepoint: 'Pre-op', filmDate: `2025-06-0${i + 1}`,
  fileName: `sim-922${4 + i}.png`, measurements: { ...MEAS(50 + 8 * i), region: 'full_spine' }, geometry: fullSpineGeom(8 * i, 8 * i, 1 + 0.03 * i), qc: FULL_QC,
}));
const TRANSIENT_IDS = [EMPTY_FILM, S1_ONLY, NECK_ONE, LUMBAR_NECK, NO_S1, ...EXTRA, ...CERVICAL, ...FULL_SPINE].map((r) => r.id);
const EXTRA_IDS = EXTRA.map((r) => r.id);
const ALL_IDS = [...MAIN_IDS, ...TRANSIENT_IDS];

const DEFAULT_PARAM_FILTERS = { workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, subject: '', pairedOnly: false, pairedWith: '__any__' };

const cdp = await connect();

const text = (selector) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); return e ? e.textContent.trim() : null; })()`);
const count = (selector) => cdp.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
const has = (selector) => cdp.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
const attr = (selector, name) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); return e ? e.getAttribute(${JSON.stringify(name)}) : null; })()`);
const prop = (selector, name) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); return e ? e[${JSON.stringify(name)}] : null; })()`);
const cardIds = () => cdp.evaluate("[...document.querySelectorAll('.similar-card')].map((c) => c.dataset.studyId)");
const cardText = (id, cls) => text(`.similar-card[data-study-id="${id}"] ${cls}`);
const store = (expr) => cdp.evaluate(`import('./renderer/store.js').then((m) => { const s = m.getState(); return (${expr}); })`);
const sameSet = (a, b) => Array.isArray(a) && a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

async function clickSelector(selector) {
  const r = await cdp.evaluate(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    if (!e) return null;
    e.scrollIntoView({ block: 'center' });
    const rect = e.getBoundingClientRect();
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  })()`);
  if (!r) throw new Error(`no element for ${selector}`);
  await cdp.click(r.cx, r.cy);
  await cdp.settle(150);
}
const clickSimilar = (key) => clickSelector(`[data-similar-key="${key}"]`);
const clickFind = (key) => clickSelector(`[data-find-key="${key}"]`);
const clickParam = (key) => clickSelector(`[data-param-key="${key}"]`);

// Re-injects the nine-record baseline, replacing any stale copies and leaving every other study
// (the demo library, anything a sibling suite left behind) untouched. Idempotent: safe to call
// after a mid-suite mutation (the isolated-study empty states strip every other real study;
// the "more" tail adds two) to bring the fixture back to its known-good shape.
const INJECT_SOURCE = `(s) => ({ studies: [${RECORDS.map((r) => JSON.stringify(r)).join(',')}, ...s.studies.filter((x) => !${JSON.stringify(MAIN_IDS)}.includes(x.id))] })`;
async function resetStudies() {
  await cdp.setState(INJECT_SOURCE);
  await cdp.settle(150);
}

// The bundled embedding model's real sha256, whatever it is (a real value if Plan A's graph is
// installed and the backend answered in time; null otherwise) -- fetched once and used to build
// embedding fixtures that read as genuinely CURRENT to isCurrent(), so section 10's Embed count is
// correct whether or not the backend carries the graph (spec precondition: it need not).
async function fetchBundledSha() {
  for (let i = 0; i < 20; i += 1) {
    const sha = await cdp.evaluate("import('./renderer/embeddings.js').then(async (m) => { await m.ensureEmbeddings(); return m.bundledModelSha(); })");
    if (sha) return sha;
    await cdp.settle(500);
  }
  return null;
}

// isCurrent's own rule (data/embeddings.js), mirrored here so section 10's expectation is computed
// the same way the product computes it, given OUR OWN bookkeeping of which sha (or none) each id
// was given -- not a hardcoded count that would silently go stale if the rule ever changes.
function isCurrentSim(storedSha, bundled) {
  if (storedSha === null || storedSha === undefined) return false;
  return bundled === null || storedSha === bundled;
}

// A version-2 record (data/embeddings.js): `crop` is the lumbar vector; `more` overrides the region and the
// other two vectors (a cervical film's, a full-spine film's).
async function embedRecord(id, model, crop, more = {}) {
  const record = {
    version: 2, id, computedAt: '2026-10-01T00:00:00.000Z', sourceSha256: null,
    model: { onnx_sha256: model }, region: 'lumbar', lumbar: crop, cervical: null, whole: null, ...more,
  };
  await cdp.evaluate(`import('./renderer/embeddings.js').then((m) => m.storeEmbedding(${JSON.stringify(record)}))`);
}

// Adds records to the front of the library / removes records by id, for the transient fixtures.
async function addStudies(records) {
  await cdp.setState(`(s) => ({ studies: [${records.map((r) => JSON.stringify(r)).join(',')}, ...s.studies] })`);
  await cdp.settle(200);
}
async function dropStudies(ids) {
  await cdp.setState(`(s) => ({ studies: s.studies.filter((x) => !${JSON.stringify(ids)}.includes(x.id)) })`);
  await cdp.settle(200);
}
// Every SP-nnnn the tab would show a person: its text and every tooltip under it (HANDOFF decision 76).
const tabIdLeaks = `(() => { const t = document.querySelector('.analysis-similar'); return [t.innerText, ...[...t.querySelectorAll('[title]')].map((e) => e.getAttribute('title'))].filter((x) => /SP-\\d{4}/.test(x)); })()`;
const forget = (ids) => cdp.evaluate(`import('./renderer/embeddings.js').then((m) => { ${ids.map((id) => `m.forgetEmbedding(${JSON.stringify(id)});`).join(' ')} })`);

try {
  // ---- 1. Injection --------------------------------------------------------------------
  // The page target exists before renderer/main.js's initial loadStudies() has resolved (HANDOFF's
  // "alive is not ready" trap); injecting into that empty store lets the load replace the fixture a
  // moment later. Wait for the library, as the other suites do.
  for (let i = 0; i < 60 && (await store('s.studies.length')) === 0; i += 1) await cdp.settle(500);
  await cdp.setState(`{ ack: true, screen: 'studies', studiesTab: 'find', query: '', tab: 'meas', openId: null, compareId: null, similarScope: 'all', similarRank: 'all', similarRegion: null }`);
  await resetStudies();
  await cdp.setState(`{ openId: 'SP-9200', screen: 'analysis' }`);
  await cdp.settle(500);

  const bundledSha = await fetchBundledSha();
  const CURRENT_SHA = bundledSha ?? 'smoke-fixture-sha';
  const STALE_SHA = `${CURRENT_SHA}-smoke-stale`;
  await embedRecord('SP-9200', CURRENT_SHA, [1, 0, 0]);
  await embedRecord('SP-9202', CURRENT_SHA, [0.98, 0.15, 0]);
  await embedRecord('SP-9203', CURRENT_SHA, [0.9, 0.4, 0]);
  await embedRecord('SP-9204', STALE_SHA, [0, 1, 0]);

  await cdp.setState(`{ tab: 'sim' }`);
  await cdp.settle(700);

  let s = await store('{ openId: s.openId, tab: s.tab, similarScope: s.similarScope, similarRank: s.similarRank, similarRegion: s.similarRegion }');
  check('the nine injected records are in the store', await store(`${JSON.stringify(MAIN_IDS)}.every((id) => s.studies.some((x) => x.id === id))`), null);
  check('SP-9200 is open with the Find similar tab up', s.openId === 'SP-9200' && s.tab === 'sim', s);
  check('scope and rank reset to all/all, and no region pick is remembered', s.similarScope === 'all' && s.similarRank === 'all' && s.similarRegion === null, s);
  check('the tab mounted (a scope/rank control is on screen)', await has('[data-similar-key="scope-all"]'), null);

  // ---- 2. Controls -----------------------------------------------------------------------
  check('scope-all is pressed', (await attr('[data-similar-key="scope-all"]', 'aria-pressed')) === 'true', null);
  check('scope-workspace is not pressed', (await attr('[data-similar-key="scope-workspace"]', 'aria-pressed')) === 'false', null);
  check('rank-all is pressed', (await attr('[data-similar-key="rank-all"]', 'aria-pressed')) === 'true', null);
  check('rank-shape is not pressed', (await attr('[data-similar-key="rank-shape"]', 'aria-pressed')) === 'false', null);
  check('region-lumbar is pressed for a lumbar film', (await attr('[data-similar-key="region-lumbar"]', 'aria-pressed')) === 'true', null);
  check('region-cervical is disabled for a lumbar film', await cdp.evaluate("document.querySelector('[data-similar-key=\"region-cervical\"]').disabled"), null);
  check('region-full_spine is disabled for a lumbar film', await cdp.evaluate("document.querySelector('[data-similar-key=\"region-full_spine\"]').disabled"), null);
  check('region-lumbar is enabled for a lumbar film', (await cdp.evaluate("document.querySelector('[data-similar-key=\"region-lumbar\"]').disabled")) === false, null);
  const controlLabels = await cdp.evaluate("[...document.querySelectorAll('.similar-control .sidebar-models-label')].map((e) => e.textContent.trim())");
  check('the controls read SCOPE, REGION, RANK BY in that order (REGION between the two)', JSON.stringify(controlLabels) === JSON.stringify(['SCOPE', 'REGION', 'RANK BY']), controlLabels);
  const regionKeys = await cdp.evaluate("[...document.querySelectorAll('.similar-control [data-similar-key]')].map((e) => e.getAttribute('data-similar-key'))");
  check('the Region control offers Lumbar, Cervical and Whole spine, between the scope and rank buttons',
    JSON.stringify(regionKeys) === JSON.stringify(['scope-workspace', 'scope-all', 'region-lumbar', 'region-cervical', 'region-full_spine', 'rank-all', 'rank-shape', 'rank-alignment', 'rank-appearance']), regionKeys);
  const regionTitles = [await attr('[data-similar-key="region-cervical"]', 'title'), await attr('[data-similar-key="region-full_spine"]', 'title'), await attr('[data-similar-key="region-lumbar"]', 'title')];
  check('a disabled Region button says why in its title, an enabled one carries none',
    regionTitles[0] === 'This study has no cervical anatomy' && regionTitles[1] === 'This study has no whole-spine anatomy' && regionTitles[2] === '', regionTitles);
  const regionOpacity = await cdp.evaluate("getComputedStyle(document.querySelector('[data-similar-key=\"region-cervical\"]')).opacity");
  check('a disabled Region button computes to opacity 0.5 (it reads as disabled)', Number(regionOpacity) === 0.5, regionOpacity);
  check('the eyebrow reads the All-mode wording under the lumbar region', (await text('.similar-eyebrow')) === 'RANKED BY LUMBAR SHAPE, ALIGNMENT AND APPEARANCE', await text('.similar-eyebrow'));

  // ---- 3. Cards under All ------------------------------------------------------------------
  let ids = await cardIds();
  check('cards exclude the same-subject study, at most ten', ids.length <= 10 && !ids.includes('SP-9201'), ids);
  check('the All-mode candidate set is exactly the three embedded studies (the partial one has no embedding, not a coverage flag, to thank)', sameSet(ids, ['SP-9202', 'SP-9203', 'SP-9204']), ids);
  check('the footer counts 1 of 3 with a fusion extension, 1 not recorded', (await text('[data-similar-key="footer"]')) === `1 OF 3 WITH A FUSION EXTENSION${SEP}1 NOT RECORDED`, await text('[data-similar-key="footer"]'));
  check('the stale tail names the one study under another model', (await text('[data-similar-key="stale"]')) === '1 STUDY NEEDS RE-EMBEDDING', await text('[data-similar-key="stale"]'));
  check("SP-9204's card carries the no-lumbar-crop missing marker (its embedding came from another graph)", ((await cardText('SP-9204', '.similar-missing')) ?? '').includes(`${DOT} no lumbar crop`), await cardText('SP-9204', '.similar-missing'));
  check('no card carries the retired no-appearance marker', !((await cardText('SP-9204', '.similar-missing')) ?? '').includes('no appearance'), await cardText('SP-9204', '.similar-missing'));
  check("SP-9202's card carries the no-disc-heights missing marker (the fixtures are uncalibrated)", ((await cardText('SP-9202', '.similar-missing')) ?? '').includes(`${DOT} no disc heights`), await cardText('SP-9202', '.similar-missing'));
  check("a card's absent blocks sit on their own line, so the film's name stays readable (every name over 80 px wide)",
    (await count('.similar-card .similar-missing')) > 0 && (await cdp.evaluate("[...document.querySelectorAll('.similar-name')].every((e) => e.clientWidth > 80)")), await cdp.evaluate("[...document.querySelectorAll('.similar-name')].map((e) => e.clientWidth)"));
  check('the tab does not scroll sideways under the cards', await cdp.evaluate("(() => { const t = document.querySelector('.analysis-similar'); return t.scrollWidth <= t.clientWidth; })()"), await cdp.evaluate("(() => { const t = document.querySelector('.analysis-similar'); return [t.scrollWidth, t.clientWidth]; })()"));
  check('the record id reads nowhere on the tab: not in its text, not in any tooltip', (await cdp.evaluate(tabIdLeaks)).length === 0, await cdp.evaluate(tabIdLeaks));
  check("SP-9204's absent film date renders as a dash", ((await cardText('SP-9204', '.similar-meta')) ?? '').includes(DASH), await cardText('SP-9204', '.similar-meta'));
  check('SP-9202 renders its thumbnail as an img', await has('.similar-card[data-study-id="SP-9202"] img.similar-thumb'), null);
  check('SP-9203 with no thumbnail renders the empty placeholder, not an img', (await has('.similar-card[data-study-id="SP-9203"] .similar-thumb-empty')) && !(await has('.similar-card[data-study-id="SP-9203"] img.similar-thumb')), null);
  check('the card name tooltip is the study name, never the record id', (await attr('.similar-card[data-study-id="SP-9202"] .similar-name', 'title')) === 'sim-9202', await attr('.similar-card[data-study-id="SP-9202"] .similar-name', 'title'));

  // ---- 4. Rank by Shape / Alignment / Appearance -------------------------------------------
  await clickSimilar('rank-shape');
  ids = await cardIds();
  check('Shape ranks every study with a shape vector, including the stale-model, hand-added and partial ones', sameSet(ids, ['SP-9202', 'SP-9203', 'SP-9204', 'SP-9205', 'SP-9206']), ids);
  check('the eyebrow switches to the Shape wording', (await text('.similar-eyebrow')) === 'RANKED BY LUMBAR SHAPE', await text('.similar-eyebrow'));
  check('Shape needs no embeddings, so there is no stale tail', !(await has('[data-similar-key="stale"]')), null);
  check("SP-9206's absent subject renders as a dash", ((await cardText('SP-9206', '.similar-meta')) ?? '').startsWith(DASH), await cardText('SP-9206', '.similar-meta'));
  check("SP-9206's card carries the no-hip missing marker", ((await cardText('SP-9206', '.similar-missing')) ?? '').includes('\u00B7 no hip'), await cardText('SP-9206', '.similar-missing'));
  check('the rank-shape control keeps keyboard focus after the click that rebuilt the list', (await cdp.evaluate("document.activeElement?.getAttribute('data-similar-key')")) === 'rank-shape', null);

  await clickSimilar('rank-alignment');
  check('the eyebrow switches to the Alignment wording', (await text('.similar-eyebrow')) === 'RANKED BY LUMBAR ALIGNMENT', await text('.similar-eyebrow'));
  ids = await cardIds();
  check('the PI 75 study (the largest PI difference) ranks last under Alignment', ids[ids.length - 1] === 'SP-9204', ids);

  await clickSimilar('rank-appearance');
  check('the eyebrow switches to the Appearance wording', (await text('.similar-eyebrow')) === 'RANKED BY LUMBAR APPEARANCE', await text('.similar-eyebrow'));
  ids = await cardIds();
  check('only the two other current-model embedded studies rank under Appearance', sameSet(ids, ['SP-9202', 'SP-9203']), ids);
  check("no card carries the whole-film marker under the lumbar region", !((await cardText('SP-9202', '.similar-missing')) ?? '').includes('no whole film'), await cardText('SP-9202', '.similar-missing'));

  // Focus a card that is about to drop out of the ranking, then change rank WITHOUT a click (a
  // direct store write, the way a keyboard-driven or programmatic change would arrive) -- the
  // Task 6 review note's focus-restore trap: restore() must not throw when its remembered key
  // names a node the rebuild no longer has.
  await clickSimilar('rank-shape');
  await cdp.evaluate('document.querySelector(\'[data-similar-key="card-SP-9206"]\').focus()');
  const errorsBeforeFocusDrop = cdp.errors.length;
  await cdp.setState('{ similarRank: "appearance" }');
  await cdp.settle(200);
  check('changing rank while a about-to-vanish card is focused raises no exception', cdp.errors.length === errorsBeforeFocusDrop, cdp.errors.slice(errorsBeforeFocusDrop));
  check('the mode change still took effect', (await text('.similar-eyebrow')) === 'RANKED BY LUMBAR APPEARANCE', await text('.similar-eyebrow'));
  await cdp.setState('{ similarRank: "shape" }');
  await cdp.settle(200);

  // The "more than ten" tail (spec decision 15): the five baseline Shape candidates plus six extras
  // are eleven eligible, ten cards, the eleventh counted in the tail. Injected and removed within
  // this one sub-step.
  await addStudies(EXTRA);
  check('eleven eligible candidates render at most ten cards', (await count('.similar-card')) === 10, await count('.similar-card'));
  check('the eleventh is named in the more tail', (await text('[data-similar-key="more"]')) === '1 MORE STUDY BELOW', await text('[data-similar-key="more"]'));
  const footerOfTen = await text('[data-similar-key="footer"]');
  check('the footer counts the ten cards on screen', /^\d+ OF 10 WITH A FUSION EXTENSION/.test(footerOfTen ?? ''), footerOfTen);
  await dropStudies(EXTRA_IDS);
  ids = await cardIds();
  check('removing the extras restores the five-candidate Shape set', sameSet(ids, ['SP-9202', 'SP-9203', 'SP-9204', 'SP-9205', 'SP-9206']), ids);
  check('with five candidates there is no more tail', !(await has('[data-similar-key="more"]')), null);

  // ---- 5. Scope --------------------------------------------------------------------------
  await clickSimilar('scope-workspace');
  ids = await cardIds();
  check('scope-workspace drops the hand-added study', sameSet(ids, ['SP-9202', 'SP-9203', 'SP-9204', 'SP-9205']), ids);
  await clickSimilar('scope-all');
  ids = await cardIds();
  check('scope-all brings it back', sameSet(ids, ['SP-9202', 'SP-9203', 'SP-9204', 'SP-9205', 'SP-9206']), ids);

  // ---- 6. Outcome lines --------------------------------------------------------------------
  await clickSimilar('rank-all');
  ids = await cardIds();
  check('back under All mode the three-study set is unchanged', sameSet(ids, ['SP-9202', 'SP-9203', 'SP-9204']), ids);
  check("SP-9202's outcome line reads Fusion extended with its date", (await cardText('SP-9202', '.similar-outcome')) === `Fusion extended${SEP}2025-05-01`, await cardText('SP-9202', '.similar-outcome'));
  check("SP-9203's outcome line reads Fusion not extended with the last follow-up", (await cardText('SP-9203', '.similar-outcome')) === `Fusion not extended${SEP}last follow-up 2025-06-15`, await cardText('SP-9203', '.similar-outcome'));
  check("SP-9204's outcome line reads Outcome not recorded", (await cardText('SP-9204', '.similar-outcome')) === 'Outcome not recorded', await cardText('SP-9204', '.similar-outcome'));

  // ---- 7. Angle line ---------------------------------------------------------------------
  check("SP-9203's angle line opens with PI +10 against the open study's PI 50", ((await cardText('SP-9203', '.similar-angles')) ?? '').startsWith('PI +10'), await cardText('SP-9203', '.similar-angles'));

  // ---- 8. Compare ------------------------------------------------------------------------
  await clickSimilar('card-SP-9202');
  await cdp.settle(600);
  check('the compare pane is visible', !(await cdp.evaluate("document.querySelector('.analysis-pane-compare').classList.contains('is-hidden')")), null);
  // SP-9202 carries subjectId 'SIM-S002', timepoint 'Pre-op', filmDate '2025-01-15' and no note --
  // filmLabel joins those three parts, never the record id and never the raw stem 'sim-9202' now
  // that fields are parsed (similar-cases gate ruling).
  check('the comparing badge names the study by its parsed fields, not the record id', (await text('[data-similar-key="comparing"]')) === `COMPARING${SEP}SIM-S002${SEP}Pre-op${SEP}2025-01-15`, await text('[data-similar-key="comparing"]'));
  check('the panel carries is-comparing', (await count('.analysis-panel.is-comparing')) === 1, null);
  const chipMatchDefault = await text('.viewer-chip-match');
  check("the compare chip's percentage is the card's own", chipMatchDefault !== null && /^\d+%$/.test(chipMatchDefault) && chipMatchDefault === (await cardText('SP-9202', '.similar-match')), { chip: chipMatchDefault, card: await cardText('SP-9202', '.similar-match') });
  check('the measurements panel shows delta cells', (await count('.meas-delta')) > 0, await count('.meas-delta'));
  check('the clinical drawer shows exactly two data rows beyond the group and head rows', (await count('.clinical-grid-row:not(.clinical-grid-group):not(.clinical-grid-head)')) === 2, await count('.clinical-grid-row:not(.clinical-grid-group):not(.clinical-grid-head)'));
  check("the compared card reads IN VIEWER, CLICK TO REMOVE", (await cardText('SP-9202', '.similar-state')) === `IN VIEWER${SEP}CLICK TO REMOVE`, await cardText('SP-9202', '.similar-state'));

  await clickSimilar('card-SP-9202');
  await cdp.settle(400);
  check('clicking the same card again ends the comparison', (await store('s.compareId')) === null, await store('s.compareId'));
  check('the compare pane is hidden again', await cdp.evaluate("document.querySelector('.analysis-pane-compare').classList.contains('is-hidden')"), null);
  check('the panel no longer carries is-comparing', (await count('.analysis-panel.is-comparing')) === 0, null);
  check('the comparing badge is hidden again', await prop('[data-similar-key="comparing"]', 'hidden'), null);

  // ---- 9. Empty states ---------------------------------------------------------------------
  await cdp.setState(`{ openId: 'SP-9205', similarRank: 'shape' }`);
  await cdp.settle(400);
  check('the partial study has no sentence of its own any more: under Shape it ranks like any other film', (await count('.similar-card')) > 0 && !(await has('[data-similar-key="empty"]')), await count('.similar-card'));
  await addStudies([EMPTY_FILM, S1_ONLY, NECK_ONE, LUMBAR_NECK, NO_S1]);
  await cdp.setState(`{ openId: 'SP-9209', similarRank: 'all', similarRegion: null }`);
  await cdp.settle(400);
  check('a study with no anatomy in any region reads the no-anatomy sentence, offering no other region', (await text('[data-similar-key="empty"]')) === 'This study has no anatomy to rank on yet.', await text('[data-similar-key="empty"]'));
  await cdp.setState(`{ openId: 'SP-9226' }`);
  await cdp.settle(400);
  check("a study whose own region has no anatomy, another region's having some, reads the no-region sentence with the lumbar word", (await text('[data-similar-key="empty"]')) === `This study has no lumbar anatomy to rank on ${DASH} choose another region.`, await text('[data-similar-key="empty"]'));
  // The buttons would refuse the other two regions on a lumbar film; a store write is how a stale or
  // programmatic pick could still arrive, and the tab falls back to the film's own region (M1).
  await cdp.setState(`{ openId: 'SP-9200', similarRegion: { openId: 'SP-9200', region: 'cervical' } }`);
  await cdp.settle(400);
  check('a cervical pick on a lumbar film falls back to Lumbar: Lumbar pressed, cards, no sentence',
    (await attr('[data-similar-key="region-lumbar"]', 'aria-pressed')) === 'true' && (await count('.similar-card')) > 0 && !(await has('[data-similar-key="empty"]')),
    { lumbar: await attr('[data-similar-key="region-lumbar"]', 'aria-pressed'), cards: await count('.similar-card'), empty: await text('[data-similar-key="empty"]') });
  await cdp.setState(`{ similarRegion: { openId: 'SP-9200', region: 'full_spine' } }`);
  await cdp.settle(400);
  check('a whole-spine pick on a lumbar film falls back to Lumbar the same way',
    (await attr('[data-similar-key="region-lumbar"]', 'aria-pressed')) === 'true' && (await count('.similar-card')) > 0 && !(await has('[data-similar-key="empty"]')),
    { lumbar: await attr('[data-similar-key="region-lumbar"]', 'aria-pressed'), cards: await count('.similar-card'), empty: await text('[data-similar-key="empty"]') });
  check('the eyebrow names the region actually ranked, not the stale pick', (await text('.similar-eyebrow')) === 'RANKED BY LUMBAR SHAPE, ALIGNMENT AND APPEARANCE', await text('.similar-eyebrow'));
  await cdp.setState(`{ similarRegion: null }`);

  // A film with no block of the mode: L1-L5 and no S1 under Shape (ruling R21).
  await cdp.setState(`{ openId: 'SP-9227', similarRank: 'shape' }`);
  await cdp.settle(400);
  check('a lumbar film without S1 under Shape reads the no-blocks sentence, not the no-candidates one', (await text('[data-similar-key="empty"]')) === `This study has no lumbar shape to rank on ${DASH} rank by another kind or choose another region.`, await text('[data-similar-key="empty"]'));
  await cdp.setState(`{ similarRank: 'alignment' }`);
  await cdp.settle(400);
  check('the same film under Alignment ranks on its segmental angles: cards, no sentence', (await count('.similar-card')) > 0 && !(await has('[data-similar-key="empty"]')), { cards: await count('.similar-card'), empty: await text('[data-similar-key="empty"]') });

  await cdp.setState(`{ openId: 'SP-9206', similarRank: 'all' }`);
  await cdp.settle(400);
  check('a study with no embedding under All reads the no-embedding sentence', (await text('[data-similar-key="empty"]')) === 'No appearance embedding for this study yet \u2014 run Embed on the Find tab, turn on Appearance embeddings in Settings, or rank by shape or alignment.', await text('[data-similar-key="empty"]'));

  await cdp.setState(`{ similarRank: 'shape' }`);
  await cdp.settle(400);
  check('the same study under Shape gets cards back', (await count('.similar-card')) > 0 && !(await has('[data-similar-key="empty"]')), await count('.similar-card'));

  await cdp.setState(`{ openId: 'SP-9207' }`);
  await cdp.settle(400);
  check('an unsegmented study reads the unsegmented sentence', (await text('[data-similar-key="empty"]')) === 'Segment this study to find similar cases.', await text('[data-similar-key="empty"]'));

  await cdp.setState(`{ openId: 'SP-9208', similarRank: 'alignment' }`);
  await cdp.settle(400);
  check('a study missing one alignment angle (no LL) still ranks on the angles it has: cards, no sentence', (await count('.similar-card')) > 0 && !(await has('[data-similar-key="empty"]')), await count('.similar-card'));

  await cdp.setState(`{ openId: 'SP-9223' }`);
  await cdp.settle(400);
  check('a lumbar study with no measured angle reads the no-alignment sentence with the lumbar word', (await text('[data-similar-key="empty"]')) === 'Alignment needs at least one measured lumbar angle on this study.', await text('[data-similar-key="empty"]'));
  await cdp.setState(`{ openId: 'SP-9222' }`);
  await cdp.settle(400);
  check('a cervical study with no measured angle reads the no-alignment sentence with the cervical word', (await text('[data-similar-key="empty"]')) === 'Alignment needs at least one measured cervical angle on this study.', await text('[data-similar-key="empty"]'));
  await dropStudies(['SP-9209', 'SP-9222', 'SP-9223', 'SP-9226', 'SP-9227']);

  await cdp.setState(`{ openId: 'SP-9208', similarRank: 'shape', similarScope: 'workspace' }`);
  await cdp.settle(400);
  check('a study alone in its workspace reads the workspace no-candidate sentence, naming the region', (await text('[data-similar-key="empty"]')) === 'No other eligible lumbar studies in this workspace.', await text('[data-similar-key="empty"]'));

  // The library-wide no-candidate sentence needs every OTHER real study gone -- candidates() only
  // ever looks at source: 'real' studies, so the demo library alone can never produce it.
  await cdp.setState(`(s) => ({ studies: s.studies.filter((x) => x.source !== 'real' || x.id === 'SP-9208') })`);
  await cdp.setState(`{ similarScope: 'all' }`);
  await cdp.settle(400);
  check('with no other real study in the library, the library no-candidate sentence shows, naming the region', (await text('[data-similar-key="empty"]')) === 'No other eligible lumbar studies in the library.', await text('[data-similar-key="empty"]'));

  await resetStudies();
  await cdp.setState(`{ openId: 'SP-9200', similarScope: 'all', similarRank: 'all', compareId: null }`);
  await cdp.settle(300);

  // ---- 10. Embed count --------------------------------------------------------------------
  await cdp.setState(`{ screen: 'studies', studiesTab: 'find', query: '', openId: null }`);
  await cdp.settle(300);
  // Every segmented real study without a current record counts, the partial SP-9205 included
  // (stage 2: a film ranks on the blocks it has, so Embed no longer skips it).
  const storedShaFor = { 'SP-9201': null, 'SP-9204': STALE_SHA, 'SP-9205': null, 'SP-9206': null, 'SP-9208': null };
  const expectedNeeded = Object.keys(storedShaFor).filter((id) => !isCurrentSim(storedShaFor[id], bundledSha));
  const embedTextBefore = await text('[data-find-key="embed"]');
  check('the Embed button counts every segmented study without a current record, the partial one too',
    embedTextBefore === `Embed ${expectedNeeded.length}`, { embedTextBefore, expectedNeeded, bundledSha });
  check('there is no partial note any more', !(await has('[data-find-key="embed-note"]')), null);

  // A version-1 record (one crop, a film-type proxy) reads as not current, so Embed recomputes it once.
  await cdp.evaluate(`import('./renderer/embeddings.js').then((m) => m.storeEmbedding(${JSON.stringify({
    version: 1, id: 'SP-9205', computedAt: '2026-09-13T00:00:00.000Z', sourceSha256: null,
    model: { onnx_sha256: CURRENT_SHA }, filmType: null, crop: [0.5, 0.5, 0], whole: null,
  })}))`);
  await cdp.settle(300);
  check('a version-1 record is not current: the Embed count still includes its film', (await text('[data-find-key="embed"]')) === `Embed ${expectedNeeded.length}`, await text('[data-find-key="embed"]'));

  await embedRecord('SP-9201', CURRENT_SHA, [0.5, 0.5, 0]);
  await embedRecord('SP-9204', CURRENT_SHA, [0.5, 0.5, 0]);
  await embedRecord('SP-9205', CURRENT_SHA, [0.5, 0.5, 0]);
  await embedRecord('SP-9206', CURRENT_SHA, [0.5, 0.5, 0]);
  await embedRecord('SP-9208', CURRENT_SHA, [0.5, 0.5, 0]);
  await cdp.settle(300);
  check('with every segmented study current, the Embed button is absent', !(await has('[data-find-key="embed"]')), await text('[data-find-key="embed"]'));
  check('there is still no partial note with the Embed button hidden', !(await has('[data-find-key="embed-note"]')), null);

  // ---- 11. Export dataset ------------------------------------------------------------------
  await clickParam('tab-parameters');
  await cdp.settle(200);
  check('Export dataset is enabled over the library with real segmented studies visible', (await cdp.evaluate("document.querySelector('[data-param-key=\"export-dataset\"]').disabled")) === false, null);

  const dataset = await cdp.evaluate(`Promise.all([
    import('./renderer/store.js'), import('./renderer/data/parameters.js'), import('./renderer/data/pairing.js'),
    import('./renderer/data/dataset.js'), import('./renderer/embeddings.js'),
  ]).then(async ([st, pm, pr, dm, em]) => {
    await em.ensureEmbeddings();
    const s = st.getState();
    const f = pm.normaliseFilters(s.paramFilters, s.studies);
    const visible = pm.sortParameters(pm.filterParameters(s.studies, f), s.paramSort);
    const rows = pm.rowsToExport(visible, s.paramSelected);
    const built = dm.buildDataset({ rows, post: pr.postFromFilters(f), embeddings: em.embeddingsMap(), bundledSha: em.bundledModelSha(), version: '9.9.9-smoke' });
    const real = rows.filter((x) => x.source === 'real');
    return {
      keys: Object.keys(built.files).sort(),
      filmsCount: built.counts.films,
      realCount: real.length,
      vectorsFilmCount: JSON.parse(built.files['vectors.json']).films.length,
      vectorsIsSingleLine: !built.files['vectors.json'].includes('\\n'),
      manifestIsMultiLine: built.files['manifest.json'].includes('\\n'),
      filmsCsv: built.files['parameters.csv'],
      pairedCsv: built.files['paired.csv'],
      pairs: built.counts.pairs,
      vectorsVersion: JSON.parse(built.files['vectors.json']).version,
      vectorsRegions: JSON.parse(built.files['vectors.json']).films.map((film) => film.region),
      vectorsBlocks: Object.keys(JSON.parse(built.files['vectors.json']).films[0] ?? {}).sort(),
      manifestKeys: Object.keys(JSON.parse(built.files['manifest.json'])).sort(),
    };
  })`);
  check('buildDataset writes exactly the five files', JSON.stringify(dataset.keys) === JSON.stringify(['README.md', 'manifest.json', 'paired.csv', 'parameters.csv', 'vectors.json']), dataset.keys);
  check('parameters.csv and vectors.json both carry one row/entry per real visible study', dataset.filmsCount === dataset.realCount && dataset.vectorsFilmCount === dataset.realCount && dataset.realCount > 0, dataset);
  check('vectors.json is written single-line, manifest.json pretty-printed', dataset.vectorsIsSingleLine && dataset.manifestIsMultiLine, { vectorsIsSingleLine: dataset.vectorsIsSingleLine, manifestIsMultiLine: dataset.manifestIsMultiLine });

  const filmsLines = dataset.filmsCsv.split('\r\n').filter((line) => line !== '' && !line.startsWith('#'));
  const firstFields = filmsLines.slice(1).map((line) => (line.startsWith('"') ? line.slice(1, line.indexOf('"', 1)) : line.slice(0, line.indexOf(','))));
  check('parameters.csv names every row by study name: no path separator, no extension, no SP- record id',
    firstFields.length === dataset.realCount && firstFields.every((name) => !/[\\/]/.test(name) && !/\.[A-Za-z0-9]+$/.test(name) && !/^SP-\d+$/.test(name)),
    firstFields);
  check("SP-9202's own row is named by its study name", firstFields.includes('sim-9202'), firstFields);

  // Stage 2 (spec 2026-09-30, section 13): the film's region rides every table, the vectors file is
  // version 2 with every block by key, and the manifest's citation is now a notice.
  const headerCells = (csv) => (csv.split('\r\n').find((line) => line !== '' && !line.startsWith('#')) ?? '').split(',');
  const filmsHeader = headerCells(dataset.filmsCsv);
  check('parameters.csv has a Region column and no Film type column', filmsHeader.includes('Region') && !filmsHeader.includes('Film type'), filmsHeader.filter((h) => /region|film type/i.test(h)));
  const pairedHeader = headerCells(dataset.pairedCsv);
  check('paired.csv names the region of every written visit (a "<visit> region" column)', dataset.pairs > 0 && pairedHeader.includes('Pre-op region'), { pairs: dataset.pairs, region: pairedHeader.filter((h) => /region/i.test(h)) });
  check('vectors.json is version 2 and every film carries its region', dataset.vectorsVersion === 2 && dataset.vectorsRegions.length === dataset.realCount && dataset.vectorsRegions.every((region) => region === 'lumbar'), { version: dataset.vectorsVersion, regions: dataset.vectorsRegions });
  check('a vectors.json film carries every block by key (null where the film lacks one)',
    ['name', 'region', 'V', 'H', 'A', 'SL', 'D', 'VC', 'AC', 'BC', 'SC', 'B', 'lumbar', 'cervical', 'whole'].every((key) => dataset.vectorsBlocks.includes(key)), dataset.vectorsBlocks);
  check('manifest.json names a notice and no citation', dataset.manifestKeys.includes('notice') && !dataset.manifestKeys.includes('citation'), dataset.manifestKeys);

  // ---- 12. A cervical film -------------------------------------------------------------------
  // Opened through the store like SP-9200. Under All it needs its own embedding (a cervical vector
  // only, region 'cervical'); with no other cervical film the pool is empty, and a second one makes
  // one card whose angle line is the cervical one.
  await addStudies([CERVICAL[0]]);
  await embedRecord('SP-9220', CURRENT_SHA, null, { region: 'cervical', cervical: [0, 1, 0] });
  await cdp.setState(`{ screen: 'analysis', openId: 'SP-9220', tab: 'sim', similarScope: 'all', similarRank: 'all', similarRegion: null, compareId: null }`);
  await cdp.settle(600);
  check('region-cervical is pressed for a cervical film', (await attr('[data-similar-key="region-cervical"]', 'aria-pressed')) === 'true', null);
  check('region-lumbar is disabled for a cervical film', await cdp.evaluate("document.querySelector('[data-similar-key=\"region-lumbar\"]').disabled"), null);
  check('region-full_spine is disabled for a cervical film', await cdp.evaluate("document.querySelector('[data-similar-key=\"region-full_spine\"]').disabled"), null);
  check('the eyebrow names the cervical region', (await text('.similar-eyebrow')) === 'RANKED BY CERVICAL SHAPE, ALIGNMENT AND APPEARANCE', await text('.similar-eyebrow'));
  check('with no other cervical film the library no-candidate sentence shows, with the cervical word', (await text('[data-similar-key="empty"]')) === 'No other eligible cervical studies in the library.', await text('[data-similar-key="empty"]'));

  await addStudies([CERVICAL[1]]);
  await embedRecord('SP-9221', CURRENT_SHA, null, { region: 'cervical', cervical: [0.9, 0.4, 0] });
  await cdp.settle(400);
  ids = await cardIds();
  check('a second cervical film is the one card (no lumbar film is a cervical candidate)', JSON.stringify(ids) === JSON.stringify(['SP-9221']), ids);
  check("the cervical card's angle line opens with Cobb", ((await cardText('SP-9221', '.similar-angles')) ?? '').startsWith('Cobb '), await cardText('SP-9221', '.similar-angles'));
  check('the cervical card names the block the uncalibrated pair lacks', ((await cardText('SP-9221', '.similar-missing')) ?? '').includes(`${DOT} no cervical balance`), await cardText('SP-9221', '.similar-missing'));
  await dropStudies(['SP-9221']);
  await forget(['SP-9221']);

  // ---- 13. A full-spine film -----------------------------------------------------------------
  // SP-9224 (open) and SP-9225 (a stale-model embedding, so only its shapes and angles rank): the
  // default region is Whole spine, a card there names every block the pair lacks on its own line,
  // and a click on Lumbar moves the pick, the eyebrow and the focus.
  await addStudies(FULL_SPINE);
  await embedRecord('SP-9224', CURRENT_SHA, [1, 0, 0], { region: 'full_spine', cervical: [0, 1, 0], whole: [0, 0, 1] });
  await embedRecord('SP-9225', STALE_SHA, [0.9, 0.4, 0], { region: 'full_spine', cervical: [0.9, 0.4, 0], whole: [0.9, 0.4, 0] });
  await cdp.setState(`{ openId: 'SP-9224', similarRegion: null, compareId: null }`);
  await cdp.settle(600);
  check('region-full_spine is pressed for a full-spine film', (await attr('[data-similar-key="region-full_spine"]', 'aria-pressed')) === 'true', null);
  check('a full-spine film can choose Lumbar and Cervical too', (await cdp.evaluate("['region-lumbar', 'region-cervical'].every((k) => document.querySelector('[data-similar-key=\"' + k + '\"]').disabled === false)")), null);
  check('the eyebrow names the whole spine', (await text('.similar-eyebrow')) === 'RANKED BY WHOLE-SPINE SHAPE, ALIGNMENT AND APPEARANCE', await text('.similar-eyebrow'));
  ids = await cardIds();
  check('under Whole spine only the other full-spine film is a candidate', JSON.stringify(ids) === JSON.stringify(['SP-9225']), ids);
  const wholeMissing = await cardText('SP-9225', '.similar-missing');
  check('a whole-spine card names every block it lacks, on its own line',
    ['no disc heights', 'no cervical balance', 'no global balance', 'no whole film', 'no lumbar crop', 'no cervical crop'].every((label) => (wholeMissing ?? '').includes(`${DOT} ${label}`)), wholeMissing);
  check('the card with six labels keeps its film name wider than 80 px', (await cdp.evaluate("document.querySelector('.similar-card[data-study-id=\"SP-9225\"] .similar-name').clientWidth")) > 80, await cdp.evaluate("document.querySelector('.similar-card[data-study-id=\"SP-9225\"] .similar-name').clientWidth"));
  check('the tab does not scroll sideways under a card with six labels', await cdp.evaluate("(() => { const t = document.querySelector('.analysis-similar'); return t.scrollWidth <= t.clientWidth; })()"), await cdp.evaluate("(() => { const t = document.querySelector('.analysis-similar'); return [t.scrollWidth, t.clientWidth]; })()"));
  check('the record id reads nowhere on the whole-spine tab', (await cdp.evaluate(tabIdLeaks)).length === 0, await cdp.evaluate(tabIdLeaks));
  check('the stale tail counts the one full-spine film under another graph', (await text('[data-similar-key="stale"]')) === '1 STUDY NEEDS RE-EMBEDDING', await text('[data-similar-key="stale"]'));

  const errorsBeforeRegionClick = cdp.errors.length;
  await clickSimilar('region-lumbar');
  check('a Region click moves the pressed button', (await attr('[data-similar-key="region-lumbar"]', 'aria-pressed')) === 'true' && (await attr('[data-similar-key="region-full_spine"]', 'aria-pressed')) === 'false', null);
  check('the eyebrow follows the Region click', (await text('.similar-eyebrow')) === 'RANKED BY LUMBAR SHAPE, ALIGNMENT AND APPEARANCE', await text('.similar-eyebrow'));
  check('the Region button keeps keyboard focus after the click that rebuilt the tab', (await cdp.evaluate("document.activeElement?.getAttribute('data-similar-key')")) === 'region-lumbar', await cdp.evaluate("document.activeElement?.getAttribute('data-similar-key')"));
  check('the pick is remembered against the open film', JSON.stringify(await store('s.similarRegion')) === JSON.stringify({ openId: 'SP-9224', region: 'lumbar' }), await store('s.similarRegion'));
  ids = await cardIds();
  check('under Lumbar the pool is every embedded film with lumbar anatomy, the other full-spine film included', ['SP-9202', 'SP-9203', 'SP-9225'].every((id) => ids.includes(id)) && !ids.includes('SP-9207'), ids);
  check('under Lumbar no card names a cervical, global or whole-film block', !/cervical|global|whole film/.test(await cdp.evaluate("[...document.querySelectorAll('.similar-missing')].map((e) => e.textContent).join(' ')")), await cdp.evaluate("[...document.querySelectorAll('.similar-missing')].map((e) => e.textContent).join(' ')"));

  // The compare chip's percentage under a non-default region: the chip recomputes with the pick.
  await clickSimilar('card-SP-9202');
  await cdp.settle(600);
  const chipMatchLumbar = await text('.viewer-chip-match');
  check("under a non-default region the compare chip's percentage is still the card's own", chipMatchLumbar !== null && /^\d+%$/.test(chipMatchLumbar) && chipMatchLumbar === (await cardText('SP-9202', '.similar-match')), { chip: chipMatchLumbar, card: await cardText('SP-9202', '.similar-match') });
  await clickSimilar('card-SP-9202');
  await cdp.settle(300);
  check('the comparison ended again', (await store('s.compareId')) === null, await store('s.compareId'));

  // Another film resets the control to ITS default; reopening the first film restores its own pick.
  await cdp.setState(`{ openId: 'SP-9220' }`);
  await cdp.settle(500);
  check('opening a cervical film resets the Region control to its default, not the last pick', (await attr('[data-similar-key="region-cervical"]', 'aria-pressed')) === 'true' && (await attr('[data-similar-key="region-lumbar"]', 'aria-pressed')) === 'false', null);
  await cdp.setState(`{ openId: 'SP-9200' }`);
  await cdp.settle(500);
  check('opening a lumbar film shows Lumbar pressed (its default)', (await attr('[data-similar-key="region-lumbar"]', 'aria-pressed')) === 'true', null);
  await cdp.setState(`{ openId: 'SP-9224' }`);
  await cdp.settle(500);
  check('reopening the full-spine film restores its Lumbar pick, not its Whole spine default', (await attr('[data-similar-key="region-lumbar"]', 'aria-pressed')) === 'true' && (await attr('[data-similar-key="region-full_spine"]', 'aria-pressed')) === 'false', null);
  check('no console error across the Region clicks', cdp.errors.length === errorsBeforeRegionClick, cdp.errors.slice(errorsBeforeRegionClick));

  await cdp.setState(`{ openId: null, screen: 'studies', studiesTab: 'find', tab: 'meas', similarRegion: null, compareId: null }`);
  await dropStudies(TRANSIENT_IDS);
  await forget(TRANSIENT_IDS);

  // ---- Console health ----------------------------------------------------------------------
  check('no console errors or exceptions during the run', cdp.errors.length === 0, cdp.errors);
} finally {
  // Remove the injected records and embeddings and reset every key this suite touched, whatever
  // happened above -- the store as smoke-similar.mjs found it.
  await cdp.setState(`(s) => ({
    studies: s.studies.filter((x) => !${JSON.stringify(ALL_IDS)}.includes(x.id)),
    openId: null, screen: 'studies', studiesTab: 'find', query: '',
    tab: 'meas', compareId: null, similarScope: 'all', similarRank: 'all', similarRegion: null,
    paramFilters: ${JSON.stringify(DEFAULT_PARAM_FILTERS)}, paramSort: { key: 'study', dir: 'asc' }, paramSelected: [],
  })`).catch(() => {});
  await cdp.evaluate(`import('./renderer/embeddings.js').then((m) => { ${ALL_IDS.map((id) => `m.forgetEmbedding(${JSON.stringify(id)});`).join(' ')} })`).catch(() => {});
  cdp.close();
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${JSON.stringify(r.detail)}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
