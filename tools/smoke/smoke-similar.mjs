// Find similar tab smoke (similar-cases spec, 2026-09-12; Plan B task 10): the tab's controls, the
// four ranking modes, the workspace/library scope, outcome and angle lines, comparison mode, the
// tab's empty states, the Studies screen's Embed count and the Export dataset button, all driven
// straight through the store the way smoke-parameters.mjs drives the Parameters tab. DOM-only: the
// backend need not carry the appearance-embedding graph -- every embeddings/<id>.json record this
// suite ranks by is injected through renderer/embeddings.js's own storeEmbedding, never computed.
// Precondition: the app is running from source on a scratch profile, any screen, run BEFORE the
// suites that add real segmented films (smoke-studies.mjs, smoke-workspace.mjs, smoke-persist.mjs)
// -- the same precondition smoke-parameters.mjs documents for the same reason. Section 10's Embed
// count assumes the only real, fully-covered studies in the library are this suite's own; a real
// segmented study left behind by an earlier suite on the same instance would inflate it.
//
// Nine records under SP-9200..SP-9208 carry the fixture (a synthetic "SIM-S0xx" cohort so no
// injected id collides with the demo library's SP-00xx or another suite's SP-9000/SP-91xx/SP-92xx
// range): SP-9200 is the open study; SP-9201 shares its subject and must never appear; SP-9202,
// SP-9203, SP-9204 and SP-9206 are the eligible candidates under Shape (SP-9202/9203/9204 share
// SP-9200's workspace root, SP-9206 is hand-added); SP-9205 is partial coverage; SP-9207 is
// unsegmented; SP-9208 shares SP-9200's subject (so it can never contaminate SP-9200's own
// candidate pool) but carries its own unique workspace root and no LL measurement, for the
// no-alignment and the two no-candidate empty states. SP-9210/SP-9211 are injected and removed
// again, transiently, only to push one ranking past five candidates for the "more" tail.
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
  study('SP-9205', { // partial coverage -- excluded from every ranking mode
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

// Transient extras for the "more than five" tail (section 4 / Task 6 review note): full shape,
// no embedding, SP-9200's own workspace root, distinct subjects. Injected and removed within one
// sub-step; never part of the baseline the other eleven sections assume.
const EXTRA = [
  study('SP-9210', { workspaceFolder: ROOT, subjectId: 'SIM-S010', timepoint: 'Pre-op', filmDate: '2025-04-01', fileName: 'sim-9210.png', measurements: MEAS(58), geometry: geom(15, 15, 1.1), qc: FULL_QC }),
  study('SP-9211', { workspaceFolder: ROOT, subjectId: 'SIM-S011', timepoint: 'Pre-op', filmDate: '2025-04-02', fileName: 'sim-9211.png', measurements: MEAS(65), geometry: geom(20, 20, 1.15), qc: FULL_QC }),
];
const ALL_IDS = [...MAIN_IDS, 'SP-9210', 'SP-9211'];

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

async function embedRecord(id, model, crop) {
  await cdp.evaluate(`import('./renderer/embeddings.js').then((m) => m.storeEmbedding({
    version: 1, id: ${JSON.stringify(id)}, computedAt: new Date().toISOString(), sourceSha256: null,
    model: { onnx_sha256: ${JSON.stringify(model)} }, filmType: null, crop: ${JSON.stringify(crop)}, whole: null,
  }))`);
}

try {
  // ---- 1. Injection --------------------------------------------------------------------
  await cdp.setState(`{ ack: true, screen: 'studies', studiesTab: 'find', query: '', tab: 'meas', openId: null, compareId: null, similarScope: 'all', similarRank: 'all' }`);
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

  let s = await store('{ openId: s.openId, tab: s.tab, similarScope: s.similarScope, similarRank: s.similarRank }');
  check('the nine injected records are in the store', await store(`${JSON.stringify(MAIN_IDS)}.every((id) => s.studies.some((x) => x.id === id))`), null);
  check('SP-9200 is open with the Find similar tab up', s.openId === 'SP-9200' && s.tab === 'sim', s);
  check('scope and rank reset to all/all', s.similarScope === 'all' && s.similarRank === 'all', s);
  check('the tab mounted (a scope/rank control is on screen)', await has('[data-similar-key="scope-all"]'), null);

  // ---- 2. Controls -----------------------------------------------------------------------
  check('scope-all is pressed', (await attr('[data-similar-key="scope-all"]', 'aria-pressed')) === 'true', null);
  check('scope-workspace is not pressed', (await attr('[data-similar-key="scope-workspace"]', 'aria-pressed')) === 'false', null);
  check('rank-all is pressed', (await attr('[data-similar-key="rank-all"]', 'aria-pressed')) === 'true', null);
  check('rank-shape is not pressed', (await attr('[data-similar-key="rank-shape"]', 'aria-pressed')) === 'false', null);
  check('the eyebrow reads the All-mode wording', (await text('.similar-eyebrow')) === 'RANKED BY SHAPE, ALIGNMENT AND APPEARANCE', await text('.similar-eyebrow'));

  // ---- 3. Cards under All ------------------------------------------------------------------
  let ids = await cardIds();
  check('cards exclude the same-subject study and the partial study, at most five', ids.length <= 5 && !ids.includes('SP-9201') && !ids.includes('SP-9205'), ids);
  check('the All-mode candidate set is exactly the three current-model embedded studies', sameSet(ids, ['SP-9202', 'SP-9203', 'SP-9204']), ids);
  check('the footer counts 1 of 3 with a fusion extension, 1 not recorded', (await text('[data-similar-key="footer"]')) === `1 OF 3 WITH A FUSION EXTENSION${SEP}1 NOT RECORDED`, await text('[data-similar-key="footer"]'));
  check('the stale tail names the one study under another model', (await text('[data-similar-key="stale"]')) === '1 STUDY NEEDS RE-EMBEDDING', await text('[data-similar-key="stale"]'));
  check("SP-9204's card carries the no-appearance missing marker", ((await cardText('SP-9204', '.similar-missing')) ?? '').includes('\u00B7 no appearance'), await cardText('SP-9204', '.similar-missing'));
  check("SP-9204's absent film date renders as a dash", ((await cardText('SP-9204', '.similar-meta')) ?? '').includes(DASH), await cardText('SP-9204', '.similar-meta'));
  check('SP-9202 renders its thumbnail as an img', await has('.similar-card[data-study-id="SP-9202"] img.similar-thumb'), null);
  check('SP-9203 with no thumbnail renders the empty placeholder, not an img', (await has('.similar-card[data-study-id="SP-9203"] .similar-thumb-empty')) && !(await has('.similar-card[data-study-id="SP-9203"] img.similar-thumb')), null);
  check('the card name tooltip is the study name, never the record id', (await attr('.similar-card[data-study-id="SP-9202"] .similar-name', 'title')) === 'sim-9202', await attr('.similar-card[data-study-id="SP-9202"] .similar-name', 'title'));

  // ---- 4. Rank by Shape / Alignment / Appearance -------------------------------------------
  await clickSimilar('rank-shape');
  ids = await cardIds();
  check('Shape ranks every study with a shape vector, including the stale-model and hand-added ones', sameSet(ids, ['SP-9202', 'SP-9203', 'SP-9204', 'SP-9206']), ids);
  check('Shape needs no embeddings, so there is no stale tail', !(await has('[data-similar-key="stale"]')), null);
  check("SP-9206's absent subject renders as a dash", ((await cardText('SP-9206', '.similar-meta')) ?? '').startsWith(DASH), await cardText('SP-9206', '.similar-meta'));
  check("SP-9206's card carries the no-hip missing marker", ((await cardText('SP-9206', '.similar-missing')) ?? '').includes('\u00B7 no hip'), await cardText('SP-9206', '.similar-missing'));
  check('the rank-shape control keeps keyboard focus after the click that rebuilt the list', (await cdp.evaluate("document.activeElement?.getAttribute('data-similar-key')")) === 'rank-shape', null);

  await clickSimilar('rank-alignment');
  check('the eyebrow switches to the Alignment wording', (await text('.similar-eyebrow')) === 'RANKED BY SPINOPELVIC ALIGNMENT', await text('.similar-eyebrow'));
  ids = await cardIds();
  check('the PI 75 study (the largest PI difference) ranks last under Alignment', ids[ids.length - 1] === 'SP-9204', ids);

  await clickSimilar('rank-appearance');
  check('the eyebrow switches to the Appearance wording', (await text('.similar-eyebrow')) === 'RANKED BY APPEARANCE', await text('.similar-eyebrow'));
  ids = await cardIds();
  check('only the two other current-model embedded studies rank under Appearance', sameSet(ids, ['SP-9202', 'SP-9203']), ids);
  check("a card carries the no-whole-film missing marker under Appearance (no study here has a whole-film vector)", ((await cardText('SP-9202', '.similar-missing')) ?? '').includes('\u00B7 no whole film'), await cardText('SP-9202', '.similar-missing'));

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
  check('the mode change still took effect', (await text('.similar-eyebrow')) === 'RANKED BY APPEARANCE', await text('.similar-eyebrow'));
  await cdp.setState('{ similarRank: "shape" }');
  await cdp.settle(200);

  // The "more than five" tail (Task 6 review note): six eligible candidates under Shape, only
  // five cards, the sixth counted in the tail. Injected and removed within this one sub-step.
  await cdp.setState(`(s) => ({ studies: [${EXTRA.map((r) => JSON.stringify(r)).join(',')}, ...s.studies] })`);
  await cdp.settle(200);
  check('six eligible candidates render at most five cards', (await count('.similar-card')) === 5, await count('.similar-card'));
  check('the sixth is named in the more tail (pluralisation not asserted, per the Task 6 review note)', ((await text('[data-similar-key="more"]')) ?? '').includes('MORE STUD'), await text('[data-similar-key="more"]'));
  await cdp.setState(`(s) => ({ studies: s.studies.filter((x) => x.id !== 'SP-9210' && x.id !== 'SP-9211') })`);
  await cdp.settle(200);
  ids = await cardIds();
  check('removing the extras restores the four-candidate Shape set', sameSet(ids, ['SP-9202', 'SP-9203', 'SP-9204', 'SP-9206']), ids);

  // ---- 5. Scope --------------------------------------------------------------------------
  await clickSimilar('scope-workspace');
  ids = await cardIds();
  check('scope-workspace drops the hand-added study', sameSet(ids, ['SP-9202', 'SP-9203', 'SP-9204']), ids);
  await clickSimilar('scope-all');
  ids = await cardIds();
  check('scope-all brings it back', sameSet(ids, ['SP-9202', 'SP-9203', 'SP-9204', 'SP-9206']), ids);

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
  check('the comparing badge names the study, not the record id', (await text('[data-similar-key="comparing"]')) === `COMPARING${SEP}sim-9202`, await text('[data-similar-key="comparing"]'));
  check('the panel carries is-comparing', (await count('.analysis-panel.is-comparing')) === 1, null);
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
  await cdp.setState(`{ openId: 'SP-9205' }`);
  await cdp.settle(400);
  check('the partial study reads the partial sentence, with a typographic apostrophe', (await text('[data-similar-key="empty"]')) === 'Similar cases need all five lumbar levels and S1; this study\u2019s coverage is partial.', await text('[data-similar-key="empty"]'));

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
  check('a study missing an alignment angle reads the no-alignment sentence', (await text('[data-similar-key="empty"]')) === 'Alignment needs PI, PT, SS and LL; this study is missing one \u2014 rank by shape instead.', await text('[data-similar-key="empty"]'));

  await cdp.setState(`{ similarRank: 'shape', similarScope: 'workspace' }`);
  await cdp.settle(400);
  check('a study alone in its workspace reads the workspace no-candidate sentence', (await text('[data-similar-key="empty"]')) === 'No other eligible studies in this workspace.', await text('[data-similar-key="empty"]'));

  // The library-wide no-candidate sentence needs every OTHER real study gone -- candidates() only
  // ever looks at source: 'real' studies, so the demo library alone can never produce it.
  await cdp.setState(`(s) => ({ studies: s.studies.filter((x) => x.source !== 'real' || x.id === 'SP-9208') })`);
  await cdp.setState(`{ similarScope: 'all' }`);
  await cdp.settle(400);
  check('with no other real study in the library, the library no-candidate sentence shows', (await text('[data-similar-key="empty"]')) === 'No other eligible studies in the library.', await text('[data-similar-key="empty"]'));

  await resetStudies();
  await cdp.setState(`{ openId: 'SP-9200', similarScope: 'all', similarRank: 'all', compareId: null }`);
  await cdp.settle(300);

  // ---- 10. Embed count --------------------------------------------------------------------
  await cdp.setState(`{ screen: 'studies', studiesTab: 'find', query: '', openId: null }`);
  await cdp.settle(300);
  const storedShaFor = { 'SP-9201': null, 'SP-9204': STALE_SHA, 'SP-9206': null, 'SP-9208': null };
  const expectedNeeded = Object.keys(storedShaFor).filter((id) => !isCurrentSim(storedShaFor[id], bundledSha));
  const embedTextBefore = await text('[data-find-key="embed"]');
  check(`the Embed button counts the fully-covered studies without a current record (the partial one excluded)`,
    embedTextBefore === `Embed ${expectedNeeded.length}`, { embedTextBefore, expectedNeeded, bundledSha });

  // The gate ruling (2026-09-12): SP-9205 (partial coverage) is the one segmented-but-unrankable
  // study in the baseline, so the note beside the Embed button reads "1 partial -- not embeddable".
  const embedNoteText = await text('[data-find-key="embed-note"]');
  check('the Embed note counts the one partial study the count leaves out', embedNoteText === `1 partial ${DASH} not embeddable`, embedNoteText);
  const embedNoteTitle = await attr('[data-find-key="embed-note"]', 'title');
  check('the Embed note explains why in its title',
    embedNoteTitle === 'Find similar needs all five lumbar levels and S1; a partial segmentation cannot be ranked, so it is not embedded.', embedNoteTitle);

  await embedRecord('SP-9201', CURRENT_SHA, [0.5, 0.5, 0]);
  await embedRecord('SP-9204', CURRENT_SHA, [0.5, 0.5, 0]);
  await embedRecord('SP-9206', CURRENT_SHA, [0.5, 0.5, 0]);
  await embedRecord('SP-9208', CURRENT_SHA, [0.5, 0.5, 0]);
  await cdp.settle(300);
  check('with every fully-covered study current, the Embed button is absent', !(await has('[data-find-key="embed"]')), await text('[data-find-key="embed"]'));
  check('the Embed note still shows the one partial study even with the Embed button hidden',
    (await text('[data-find-key="embed-note"]')) === `1 partial ${DASH} not embeddable`, await text('[data-find-key="embed-note"]'));

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
      filmsCsv: built.files['films.csv'],
    };
  })`);
  check('buildDataset writes exactly the four files', JSON.stringify(dataset.keys) === JSON.stringify(['films.csv', 'manifest.json', 'subjects.csv', 'vectors.json']), dataset.keys);
  check('films.csv and vectors.json both carry one row/entry per real visible study', dataset.filmsCount === dataset.realCount && dataset.vectorsFilmCount === dataset.realCount && dataset.realCount > 0, dataset);
  check('vectors.json is written single-line, manifest.json pretty-printed', dataset.vectorsIsSingleLine && dataset.manifestIsMultiLine, { vectorsIsSingleLine: dataset.vectorsIsSingleLine, manifestIsMultiLine: dataset.manifestIsMultiLine });

  const filmsLines = dataset.filmsCsv.split('\r\n').filter((line) => line !== '' && !line.startsWith('#'));
  const firstFields = filmsLines.slice(1).map((line) => (line.startsWith('"') ? line.slice(1, line.indexOf('"', 1)) : line.slice(0, line.indexOf(','))));
  check('films.csv names every row by study name: no path separator, no extension, no SP- record id',
    firstFields.length === dataset.realCount && firstFields.every((name) => !/[\\/]/.test(name) && !/\.[A-Za-z0-9]+$/.test(name) && !/^SP-\d+$/.test(name)),
    firstFields);
  check("SP-9202's own row is named by its study name", firstFields.includes('sim-9202'), firstFields);

  // ---- Console health ----------------------------------------------------------------------
  check('no console errors or exceptions during the run', cdp.errors.length === 0, cdp.errors);
} finally {
  // Remove the injected records and embeddings and reset every key this suite touched, whatever
  // happened above -- the store as smoke-similar.mjs found it.
  await cdp.setState(`(s) => ({
    studies: s.studies.filter((x) => !${JSON.stringify(ALL_IDS)}.includes(x.id)),
    openId: null, screen: 'studies', studiesTab: 'find', query: '',
    tab: 'meas', compareId: null, similarScope: 'all', similarRank: 'all',
    paramFilters: ${JSON.stringify(DEFAULT_PARAM_FILTERS)}, paramSort: { key: 'study', dir: 'asc' }, paramSelected: [],
  })`).catch(() => {});
  await cdp.evaluate(`import('./renderer/embeddings.js').then((m) => { ${ALL_IDS.map((id) => `m.forgetEmbedding(${JSON.stringify(id)});`).join(' ')} })`).catch(() => {});
  cdp.close();
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${JSON.stringify(r.detail)}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
