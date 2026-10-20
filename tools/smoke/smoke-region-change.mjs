// Issue #68 (2026-10-20): the Analysis screen's Region select on a film whose Auto detect run found the wrong region.
// Before, any run or batch anywhere in the library disabled the Region and Orientation selects with no tooltip, so a
// reviewer stepping through a library while its batch ran could not change a film the run had labelled lumbar to
// cervical, and the Measurements panel kept the lumbar parameters. Now only the film's own turn (its run in flight,
// or next up in the running batch), edit mode and a demo study lock the two selects, each with a tooltip that says so.
//
//   node tools/smoke/launch.mjs            (SPINE_CONTOUR_PYTHON must point at the venv python; the backend answers /measure)
//   node tools/smoke/smoke-region-change.mjs
//   node tools/smoke/cdp.mjs --quit
//
// Fixtures: SP-9400, a synthetic 600x800 film with a lumbar result measured by the real /measure, its record reading
// Auto detect (`region: 'auto'`) with `geometry.region` lumbar, as an Auto detect run that found lumbar leaves it; and
// SP-9401, an unsegmented film with a path that points nowhere. Batches and runs are simulated in the store (a batch
// over SP-9401 never starts a run: nothing calls the driver). Reads the DOM and the store only; no screenshot. The
// injected studies are removed at the end and the store put back. Exit code 1 on any failed check.
import { connect } from './cdp-lib.mjs';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${JSON.stringify(detail)}`}`);
}

const cdp = await connect();
const ev = (source) => cdp.evaluate(source);
const js = (value) => JSON.stringify(value);

async function until(expression, timeoutMs = 15000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { if (await ev(expression)) return true; } catch (_error) { /* a transient page exception: poll again */ }
    if (Date.now() >= deadline) return false;
    await cdp.settle(stepMs);
  }
}

const SEG = 'SP-9400';
const OTHER = 'SP-9401';
const PREDICTION_ID = 'smoke-region-change-fixture';
const WAIT_THIS_FILM = "Wait for this film's segmentation to finish before changing the region";
const WAIT_FOR_BATCH = 'Wait for the batch to finish';
const WAIT_FOR_RUN = 'Wait for the current segmentation to finish';

// The lumbar result the fixture carries: five bodies, the S1 endplate and two heads, measured by the real /measure,
// then given the region an Auto detect run writes. Called again to put the result back between scenarios.
const RESULT_SOURCE = `(async () => {
  const api = await import('./renderer/api.js');
  const body = (y) => ({ superior: [[200, y], [320, y]], inferior: [[200, y + 60], [320, y + 60]],
    quadrilateral: [[200, y], [320, y], [320, y + 60], [200, y + 60]] });
  const vertebrae = { L1: body(100), L2: body(190), L3: body(280), L4: body(370), L5: body(460) };
  const result = await api.measure({ vertebrae, s1_superior: [[200, 560], [320, 575]], femoral_circles: [[180, 700, 40], [260, 700, 40]] });
  return { ...result, geometry: { ...result.geometry, region: 'lumbar' } };
})()`;

const bar = () => ev(`(async () => {
  const store = await import('./renderer/store.js');
  const s = store.getState();
  const open = s.studies.find((x) => x.id === s.openId) ?? null;
  const region = document.querySelector('[aria-label="Spine region"]');
  const orientation = document.querySelector('.analysis-region-bar select:not([aria-label="Spine region"])');
  const run = [...document.querySelectorAll('.analysis-region-bar button')].find((b) => b.textContent === 'Run segmentation') ?? null;
  return {
    value: region?.value ?? null, disabled: region?.disabled ?? null, title: region?.title ?? null,
    orientationDisabled: orientation?.disabled ?? null, orientationTitle: orientation?.title ?? null,
    note: document.querySelector('.analysis-region-bar .meas-note')?.textContent ?? null,
    section: document.querySelector('.meas-section-title')?.textContent ?? null,
    run: run ? { hidden: run.hidden, disabled: run.disabled, title: run.title } : null,
    study: open ? { region: open.region ?? null, geometryRegion: open.geometry?.region ?? null, measured: open.measurements != null } : null,
    running: s.running, batch: s.batch ? { ids: s.batch.ids, done: s.batch.done, stopping: s.batch.stopping } : null, editing: s.editing,
  };
})()`);

// What a pick from the select's popup fires.
const pick = (value) => ev(`(() => {
  const e = document.querySelector('[aria-label="Spine region"]');
  if (e.disabled) return 'disabled';
  e.value = ${js(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); return 'changed';
})()`);

const restoreResult = () => ev(`(async () => {
  const store = await import('./renderer/store.js');
  const result = await ${RESULT_SOURCE};
  store.setState((s) => ({ studies: s.studies.map((x) => (x.id === ${js(SEG)}
    ? { ...x, region: 'auto', anteriorSide: null, measurements: result.measurements, geometry: result.geometry, qc: result.qc ?? null, predictionId: ${js(PREDICTION_ID)} } : x)) }));
  return true;
})()`);

const patch = (source) => ev(`import('./renderer/store.js').then((m) => { m.setState(${source}); return true; })`);
const batchOver = (ids, done = 0, stopping = false) => patch(`{ batch: { ids: ${js(ids)}, done: ${done}, failed: [], warnings: [], skipped: 0, stopping: ${stopping} } }`);

try {
  await until("import('./renderer/store.js').then((m) => Array.isArray(m.getState().studies))");
  const films = await ev(`(() => {
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 800;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#777777'; ctx.fillRect(0, 0, 600, 800);
    ctx.fillStyle = '#a0a0a0'; ctx.font = '18px sans-serif'; ctx.fillText('SYNTHETIC TEST IMAGE', 24, 40);
    const image = canvas.toDataURL('image/png').split(',')[1];
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 600, 800);
    const mask = canvas.toDataURL('image/png').split(',')[1];
    return { image, mask };
  })()`);
  const injected = await ev(`(async () => {
    const store = await import('./renderer/store.js');
    const api = await import('./renderer/api.js');
    const { newStudy } = await import('./renderer/screens/studies.js');
    const result = await ${RESULT_SOURCE};
    await api.savePrediction(${js(SEG)}, { ...result, image_png: ${js(films.image)}, mask_png: ${js(films.mask)},
      labels: { L1: 20, L2: 21, L3: 22, L4: 23, L5: 24 }, prediction_id: ${js(PREDICTION_ID)} });
    const seg = { ...newStudy({ id: ${js(SEG)}, fileName: 'region-change-check.png', filePath: '/test/region-change-check.png' }),
      region: 'auto', view: 'Standing lateral', predictionId: ${js(PREDICTION_ID)}, labelFile: null,
      measurements: result.measurements, geometry: result.geometry, qc: result.qc ?? null };
    const other = { ...newStudy({ id: ${js(OTHER)}, fileName: 'region-change-other.png', filePath: '/test/region-change-other.png' }), region: 'auto', labelFile: null };
    const ours = new Set([${js(SEG)}, ${js(OTHER)}]);
    store.setState((s) => ({ ack: true, studies: [seg, other, ...s.studies.filter((x) => !ours.has(x.id))], screen: 'studies',
      studiesTab: 'find', query: '', openId: null, editing: false, levelEditor: null, selection: null, measurementDrafts: {},
      running: null, batch: null, tab: 'meas', overlays: true }));
    store.setState({ screen: 'analysis', openId: ${js(SEG)}, selectedLevel: null, zoom: 1, panX: 0, panY: 0, panMode: false });
    return { region: result.geometry.region, ll: result.measurements?.LL?.['L1-S1'] ?? null };
  })()`);
  const restored = await until(`document.querySelector('.viewer-canvas-dynamic')?.width === 600 && document.querySelector('.run-card')?.classList.contains('is-hidden')`);
  check('precondition: SP-9400 opens on its restored film, an Auto detect record whose run found lumbar', restored && injected.region === 'lumbar', injected);

  // 1. Idle: the select is live, the note says Detected lumbar, the panel lists the lumbar parameters.
  let b = await bar();
  check('1. idle: the Region select reads Auto detect, enabled, no tooltip, the lumbar parameters listed',
    b.value === 'auto' && b.disabled === false && b.title === '' && b.note.startsWith('Detected lumbar.') && b.section === '01 — SAGITTAL PARAMETERS', b);
  check('1. picking Cervical clears the result, sets the region and lists the cervical parameters, with Run segmentation live',
    (await pick('cervical')) === 'changed' && await until(`import('./renderer/store.js').then((m) => m.getState().studies.find((x) => x.id === ${js(SEG)})?.region === 'cervical')`, 3000)
      && (b = await bar()).value === 'cervical' && b.study.region === 'cervical' && b.study.measured === false && b.section === '01 — CERVICAL ALIGNMENT'
      && b.run?.hidden === false && b.run.disabled === false && b.run.title === '', b);
  await restoreResult(); await cdp.settle(200);
  check('1. the fixture is back to Auto detect with its lumbar result', (b = await bar()).value === 'auto' && b.study.measured === true, b);

  // 2. A batch runs over OTHER films (issue #68's case: a reviewer under a library-wide batch): this film is free to change.
  await batchOver([OTHER], 0); await cdp.settle(200);
  b = await bar();
  check('2. a batch over other films leaves the Region select enabled with no tooltip', b.disabled === false && b.title === '' && b.batch?.ids[0] === OTHER, b);
  check('2. and picking Cervical works under the batch; Run segmentation waits for it with its tooltip',
    (await pick('cervical')) === 'changed' && await until(`import('./renderer/store.js').then((m) => m.getState().studies.find((x) => x.id === ${js(SEG)})?.region === 'cervical')`, 3000)
      && (b = await bar()).section === '01 — CERVICAL ALIGNMENT' && b.run?.hidden === false && b.run.disabled === true && b.run.title === WAIT_FOR_BATCH, b);
  await restoreResult(); await cdp.settle(200);

  // 3. This film's own turn: next up in the batch, or its run in flight. Then done, later in the queue, or a stopping batch.
  await batchOver([SEG, OTHER], 0); await cdp.settle(200);
  b = await bar();
  check("3. this film next up in the batch: the select is disabled with the wait tooltip, and a pick changes nothing",
    b.disabled === true && b.title === WAIT_THIS_FILM && b.orientationDisabled === true && (await pick('cervical')) === 'disabled' && (await bar()).study.region === 'auto', b);
  await batchOver([SEG, OTHER], 1); await cdp.settle(200);
  check('3. its turn over (done 1): enabled again', (b = await bar()).disabled === false && b.title === '', b);
  await batchOver([OTHER, SEG], 0); await cdp.settle(200);
  check('3. later in the queue: enabled', (b = await bar()).disabled === false, b);
  await batchOver([SEG, OTHER], 0, true); await cdp.settle(200);
  check('3. a stopping batch starts no further turn: enabled', (b = await bar()).disabled === false, b);
  await patch('{ batch: null, running: ' + js(SEG) + ' }'); await cdp.settle(200);
  check("3. this film's run in flight: disabled with the wait tooltip", (b = await bar()).disabled === true && b.title === WAIT_THIS_FILM, b);
  await patch('{ running: ' + js(OTHER) + ' }'); await cdp.settle(200);
  b = await bar();
  check("3. another film's run in flight: enabled, and the bar's Run segmentation would wait for that run",
    b.disabled === false && b.title === '', b);
  await patch('{ running: null }'); await cdp.settle(200);

  // 4. Edit mode locks both with the editing tooltips (ruling R21, unchanged).
  await patch('{ editing: true }'); await cdp.settle(200);
  b = await bar();
  check('4. edit mode: both selects disabled with the editing tooltips',
    b.disabled === true && b.title === 'Finish editing before changing the region' && b.orientationDisabled === true && b.orientationTitle === 'Finish editing before changing the orientation', b);
  await patch('{ editing: false, selection: null, levelEditor: null }'); await cdp.settle(200);
  check('4. out of edit mode: enabled', (b = await bar()).disabled === false && b.title === '', b);

  check('no console errors or exceptions during the run', cdp.errors.length === 0, cdp.errors);
} finally {
  // Put the store back and drop the injected studies; the sidecar of SP-9400 goes with its record (deleteStudy's job
  // elsewhere; here the saver never wrote it, so only the memory copy is removed).
  await ev(`import('./renderer/store.js').then((m) => { m.setState((s) => ({ screen: 'studies', openId: null, editing: false, selection: null, levelEditor: null,
    running: null, batch: null, studies: s.studies.filter((x) => ![${js(SEG)}, ${js(OTHER)}].includes(x.id)) })); return true; })`).catch(() => {});
  cdp.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
