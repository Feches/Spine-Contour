// Parameters tab smoke (task 1 of the pre-op/post-op spec, 2026-09-06 §10): the tab strip, the
// grid over the demo library, the segmented-only and workspace filters, sort by a measurement
// column, the export button's disabled state, and the tab and sort surviving a trip to Analysis
// and back. DOM-only: nothing is segmented and the backend is never called, so it runs in a few
// seconds. Precondition: the app is running from source (demo studies present), any screen.
//
// Two records are injected straight into the store -- SP-9100 unsegmented, SP-9101 segmented
// under a workspace root -- and removed in `finally`, so a later suite never meets a stray
// Processing row. SP-9101 has measurements but no geometry, which is fine in-session (status is
// derived from measurements alone) but would be nulled by validate() on a restart; that is one
// more reason the cleanup runs unconditionally.
//
// Every selector here is a data-param-key or data-study-id. Never key on a visible label.
import { connect } from './cdp-lib.mjs';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

const WS_ROOT = 'C:\\smoke-fixture\\Fusion2025';
const RESET = '{ query: "", studiesTab: "find", paramFilters: { workspace: null, folder: null, segmentedOnly: true }, paramSort: { key: "study", dir: "asc" }, paramLevels: false }';

const cdp = await connect();
const count = (selector) => cdp.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
const has = (selector) => cdp.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
const text = (selector) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); return e ? e.textContent : null; })()`);
const hidden = (selector) => cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).classList.contains('is-hidden')`);
const rowIds = () => cdp.evaluate("[...document.querySelectorAll('.param-row')].map((r) => r.dataset.studyId)");
const numCells = (id) => cdp.evaluate(`(() => { const row = document.querySelector('.param-row[data-study-id="${id}"]'); return row ? [...row.querySelectorAll('.param-cell-num')].map((c) => c.textContent) : null; })()`);
const choose = (selector, value) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); return e.value; })()`);
const options = (selector) => cdp.evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)} + ' option')].map((o) => o.value)`);
async function clickKey(key) {
  const r = await cdp.rect(`[data-param-key="${key}"]`);
  if (!r) throw new Error(`no control with data-param-key ${key}`);
  await cdp.click(r.cx, r.cy);
  await cdp.settle(80);
}
const store = (expr) => cdp.evaluate(`import('./renderer/store.js').then((m) => { const s = m.getState(); return (${expr}); })`);

try {
  // 1. Land on Studies, Find tab, everything reset.
  await cdp.setState(`{ ack: true, screen: "studies", ...${RESET} }`);
  await cdp.settle(100);
  let s = await cdp.state();
  check('precondition: on Studies with the Find tab up', s.screen === 'studies' && s.studiesTab === 'find', { screen: s.screen, tab: s.studiesTab });
  check('two tabs, Find active', (await count('.studies-tab')) === 2 && (await has('[data-param-key="tab-find"].is-active')), await count('.studies-tab'));
  check('the Parameters panel is hidden while Find is up', (await hidden('.studies-parameters-host')) === true);

  // 2. Click the tab.
  await clickKey('tab-parameters');
  s = await cdp.state();
  check('clicking Parameters selects it in the store', s.studiesTab === 'parameters', s.studiesTab);
  check('the Find panel hides and the grid shows', (await hidden('.studies-parameters-host')) === false && (await has('[data-param-key="grid"]')));

  // 3. One row per segmented study; values as the panel formats them.
  const segmented = await store('s.studies.filter((x) => x.measurements != null).length');
  const ids = await rowIds();
  check('one grid row per segmented study', ids.length === segmented && ids.length > 0, { rows: ids.length, segmented });
  const cells = await numCells('SP-0042');
  const pi = await store("s.studies.find((x) => x.id === 'SP-0042').measurements.PI");
  check('SP-0042 PI reads the record to one decimal with a degree sign', cells !== null && cells[0] === `${pi.toFixed(1)}\u00B0`, { cells, pi });
  check('SP-0042 L1PA (absent on demos) reads an em dash', cells !== null && cells[5] === '\u2014', cells);
  const firstTwo = await cdp.evaluate("[...document.querySelectorAll('.param-row .param-open')].slice(0, 2).map((b) => b.textContent.toLowerCase())");
  check('rows sort by name ascending by default', firstTwo.length === 2 && firstTwo[0] <= firstTwo[1], firstTwo);

  // 4. Inject an unsegmented film and a segmented one under a workspace root.
  await cdp.setState(`(s) => ({ studies: [
    { id: 'SP-9100', source: 'real', filePath: 'C:\\\\loose\\\\smoke-unseg.png', fileName: 'smoke-unseg.png', name: null, workspaceFolder: null,
      addedAt: new Date().toISOString(), view: 'Standing lateral', thumbnail: null, measurements: null, geometry: null, qc: null, clinical: {} },
    { id: 'SP-9101', source: 'real', filePath: ${JSON.stringify(`${WS_ROOT}\\pre-op\\smoke-seg.png`)}, fileName: 'smoke-seg.png', name: null,
      workspaceFolder: ${JSON.stringify(WS_ROOT)}, addedAt: new Date().toISOString(), view: 'Standing lateral', thumbnail: null,
      measurements: { PI: 99.5, PT: 30.0, SS: 69.5, L1PA: 12.0, LL: { 'L1-S1': 60.0 } }, geometry: null, qc: null, clinical: {} },
    ...s.studies.filter((x) => x.id !== 'SP-9100' && x.id !== 'SP-9101'),
  ] })`);
  await cdp.settle(100);
  const note = await text('.param-check-note');
  check('segmented-only reports the one unsegmented film it hides', note !== null && note.includes('1 unsegmented hidden'), note);
  check('the segmented film is a row and the unsegmented one is not', (await rowIds()).includes('SP-9101') && !(await rowIds()).includes('SP-9100'));

  // 5. Segmented-only off.
  await clickKey('segmented');
  check('unticking segmented-only shows the unsegmented film with every number an em dash',
    (await rowIds()).includes('SP-9100') && (await numCells('SP-9100')).every((c) => c === '\u2014') && !(await has('.param-check-note')),
    await numCells('SP-9100'));
  await clickKey('segmented');

  // 6. Workspace and folder filters.
  const wsOptions = await options('.param-select-workspace');
  check('the workspace dropdown offers the injected root and Added by hand', wsOptions.includes(WS_ROOT) && wsOptions.includes('__hand__') && wsOptions[0] === '', wsOptions);
  await choose('.param-select-workspace', WS_ROOT);
  await cdp.settle(80);
  check('choosing the root shows exactly its segmented film', JSON.stringify(await rowIds()) === JSON.stringify(['SP-9101']), await rowIds());
  check('the folder dropdown offers only that root\'s subfolder', JSON.stringify(await options('.param-select-folder')) === JSON.stringify(['', 'pre-op']), await options('.param-select-folder'));
  check('export is enabled with a real segmented film visible', (await cdp.evaluate("document.querySelector('[data-param-key=\"export\"]').disabled")) === false);
  await choose('.param-select-workspace', '__hand__');
  await cdp.settle(80);
  const handIds = await rowIds();
  const exportState = await cdp.evaluate("(() => { const b = document.querySelector('[data-param-key=\"export\"]'); return { disabled: b.disabled, title: b.title }; })()");
  check('Added by hand shows the demos only, and export is disabled because demos are not exported',
    handIds.length > 0 && handIds.every((id) => /^SP-00\d\d$/.test(id)) && exportState.disabled === true && exportState.title === 'Demo studies are not exported',
    { handIds, exportState });
  await choose('.param-select-workspace', '');
  await cdp.settle(80);

  // 7. Sort by PI, twice.
  await clickKey('sort-PI');
  await clickKey('sort-PI');
  s = await cdp.state();
  const topAfterDesc = (await rowIds())[0];
  check('two clicks on PI sort descending, with the highest PI first', s.paramSort.key === 'PI' && s.paramSort.dir === 'desc' && topAfterDesc === 'SP-9101', { sort: s.paramSort, top: topAfterDesc });
  check('the sort header keeps keyboard focus across the rebuild', (await cdp.evaluate("document.activeElement?.getAttribute('data-param-key')")) === 'sort-PI');

  // 8. Open a row, come back: tab and sort survive.
  await clickKey('open-SP-9101');
  s = await cdp.state();
  check('clicking a study name opens it on Analysis', s.screen === 'analysis' && s.openId === 'SP-9101', { screen: s.screen, openId: s.openId });
  await cdp.setState('{ screen: "studies" }');
  await cdp.settle(100);
  s = await cdp.state();
  check('back on Studies, the Parameters tab and the PI sort are still in place', s.studiesTab === 'parameters' && s.paramSort.key === 'PI' && s.paramSort.dir === 'desc' && (await has('[data-param-key="grid"]')), { tab: s.studiesTab, sort: s.paramSort });

  // 9. No console errors or exceptions during the run.
  check('no console errors or exceptions during the run', cdp.errors.length === 0, cdp.errors);
} finally {
  // Remove the injected records and reset the tab state whatever happened above.
  await cdp.setState(`(s) => ({ studies: s.studies.filter((x) => x.id !== 'SP-9100' && x.id !== 'SP-9101'), openId: s.openId === 'SP-9101' ? null : s.openId, ...${RESET} })`).catch(() => {});
  cdp.close();
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${JSON.stringify(r.detail)}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
