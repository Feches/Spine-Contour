// Parameters tab smoke (task 1 of the pre-op/post-op spec, 2026-09-06 §10): the tab strip, the
// grid over the demo library, the segmented-only and workspace filters, sort by a measurement
// column, the export button's disabled state, the paired export's button and its file and toast
// text through the page's own modules, the tab and sort surviving a trip to Analysis and back,
// and a deleted study's tick being pruned from the selection. DOM-only: nothing is
// segmented and the backend is never called, so it runs in a few seconds. Precondition: the app
// is running from source (demo studies present), any screen.
//
// Four records are injected straight into the store -- SP-9100 unsegmented, SP-9101, SP-9102 and
// SP-9103 segmented under one workspace root (S001 Pre-op and Post-op, a pair, and S002 Pre-op,
// unpaired) -- and removed in `finally`, so a later suite never meets a stray Processing row.
// Each segmented record has measurements but no geometry, which is fine in-session (status is
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
// The injected records: one unsegmented hand-added film, and three segmented films under one
// workspace root -- S001 Pre-op and Post-op (a pair) and S002 Pre-op (unpaired).
const INJECTED = ['SP-9100', 'SP-9101', 'SP-9102', 'SP-9103'];
const RESET_FILTERS = '{ workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, subject: "", pairedOnly: false, pairedWith: "__any__" }';
const RESET = `{ query: "", studiesTab: "find", paramFilters: ${RESET_FILTERS}, paramSort: { key: "study", dir: "asc" }, paramLevels: false, paramSelected: [] }`;

// The paired file over the injected records under All paired (spec §11.2): S001 is the only real
// pair (the demo pair is never written; S002 is unpaired), so the one visit is Post-op. SP-9101
// (PI 99.5, PT 30, SS 69.5, L1PA 12, LL 60) against SP-9102 (PI 50, PT 15, SS 35, LL 45): PI-LL is
// 39.5 then 5; every delta is post minus pre over those one-decimal values; L1PA and the four
// levels are absent on one or both films, so their cells and deltas are empty. Built from arrays
// so the empty cells are counted, not eyeballed.
const PAIRED_MEASURES = ['LL L1-S1', 'PI', 'PT', 'SS', 'PI-LL Mismatch', 'L1PA', 'LL L2-S1', 'LL L3-S1', 'LL L4-S1', 'LL L5-S1'];
const PAIRED_HEADER = ['Subject', 'Pre-op study', 'Post-op study', 'Pre-op view', 'Post-op view', 'Pre-op film date', 'Post-op film date',
  ...PAIRED_MEASURES.flatMap((m) => [`${m} Pre-op`, `${m} Post-op`, `Delta ${m} Post-op`])].join(',');
const PAIRED_ROW = ['S001', 'SP-9101', 'SP-9102', 'Standing lateral', 'Standing lateral', '2025-03-02', '2025-09-14',
  '60', '45', '-15', '99.5', '50', '-49.5', '30', '15', '-15', '69.5', '35', '-34.5', '39.5', '5', '-34.5', '12', '', '',
  ...Array(12).fill('')].join(',');

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

// Scrolls the match into view before measuring it, the way smoke-workspace.mjs does: the Find
// list is longer than the viewport and cdp.click needs client-space coordinates that are on it.
const rectBy = (finderSource) => cdp.evaluate(`(() => {
  const e = (${finderSource})();
  if (!e) return null;
  e.scrollIntoView({ block: 'center' });
  const r = e.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
})()`);

// Polls the store through the page's own module instance, the way smoke-workspace.mjs does.
async function waitForState(predicateSource, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await store(`Boolean(${predicateSource})`)) return true;
    await cdp.settle(150);
  }
  return false;
}

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
      subjectId: null, timepoint: null, filmDate: null,
      addedAt: new Date().toISOString(), view: 'Standing lateral', thumbnail: null, measurements: null, geometry: null, qc: null, clinical: {} },
    { id: 'SP-9101', source: 'real', filePath: ${JSON.stringify(`${WS_ROOT}\\pre-op\\smoke-seg-a.png`)}, fileName: 'smoke-seg-a.png', name: null,
      workspaceFolder: ${JSON.stringify(WS_ROOT)}, subjectId: 'S001', timepoint: 'Pre-op', filmDate: '2025-03-02',
      addedAt: '2026-09-01T00:00:00.000Z', view: 'Standing lateral', thumbnail: null,
      measurements: { PI: 99.5, PT: 30.0, SS: 69.5, L1PA: 12.0, LL: { 'L1-S1': 60.0 } }, geometry: null, qc: null, clinical: {} },
    { id: 'SP-9102', source: 'real', filePath: ${JSON.stringify(`${WS_ROOT}\\post-op\\smoke-seg-b.png`)}, fileName: 'smoke-seg-b.png', name: null,
      workspaceFolder: ${JSON.stringify(WS_ROOT)}, subjectId: 'S001', timepoint: 'Post-op', filmDate: '2025-09-14',
      addedAt: '2026-09-02T00:00:00.000Z', view: 'Standing lateral', thumbnail: null,
      measurements: { PI: 50.0, PT: 15.0, SS: 35.0, LL: { 'L1-S1': 45.0 } }, geometry: null, qc: null, clinical: {} },
    { id: 'SP-9103', source: 'real', filePath: ${JSON.stringify(`${WS_ROOT}\\pre-op\\smoke-seg-c.png`)}, fileName: 'smoke-seg-c.png', name: null,
      workspaceFolder: ${JSON.stringify(WS_ROOT)}, subjectId: 'S002', timepoint: 'Pre-op', filmDate: null,
      addedAt: '2026-09-03T00:00:00.000Z', view: 'Standing lateral', thumbnail: null,
      measurements: { PI: 48.0, PT: 12.0, SS: 36.0, LL: { 'L1-S1': 44.0 } }, geometry: null, qc: null, clinical: {} },
    ...s.studies.filter((x) => !${JSON.stringify(INJECTED)}.includes(x.id)),
  ] })`);
  await cdp.settle(100);
  const note = await text('.param-check-note');
  check('segmented-only reports the one unsegmented film it hides', note !== null && note.includes('1 unsegmented hidden'), note);
  const idsAfterInject = await rowIds();
  check('the three segmented films are rows and the unsegmented one is not', ['SP-9101', 'SP-9102', 'SP-9103'].every((id) => idsAfterInject.includes(id)) && !idsAfterInject.includes('SP-9100'), idsAfterInject);

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
  check('choosing the root shows exactly its three segmented films, by name', JSON.stringify(await rowIds()) === JSON.stringify(['SP-9101', 'SP-9102', 'SP-9103']), await rowIds());
  check('the folder dropdown offers only that root\'s two subfolders', JSON.stringify(await options('.param-select-folder')) === JSON.stringify(['', 'pre-op', 'post-op']), await options('.param-select-folder'));
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

  // 8. Row selection: ticking a row and select-all move the export label and count line together;
  // a tick on a row a later filter hides stays in the store and comes back with the filter.
  await clickKey('select-SP-9101');
  const countAfterTick = await text('[data-param-key="count"]');
  const exportAfterTick = await text('[data-param-key="export"]');
  check('ticking a row adds 1 SELECTED to the count line', countAfterTick !== null && countAfterTick.includes('1 SELECTED'), countAfterTick);
  check('ticking a row changes the export label to Export 1 selected', exportAfterTick === 'Export 1 selected', exportAfterTick);

  const visibleBeforeSelectAll = await rowIds();
  await clickKey('select-all');
  const checkedAfterSelectAll = await cdp.evaluate(`[...document.querySelectorAll('.param-row input[type="checkbox"]')].map((i) => i.checked)`);
  const exportAfterSelectAll = await text('[data-param-key="export"]');
  check('select-all ticks every visible row\'s checkbox', checkedAfterSelectAll.length === visibleBeforeSelectAll.length && checkedAfterSelectAll.length > 0 && checkedAfterSelectAll.every(Boolean), { rows: visibleBeforeSelectAll.length, checked: checkedAfterSelectAll });
  check('select-all\'s label reads Export <rows> selected', exportAfterSelectAll === `Export ${visibleBeforeSelectAll.length} selected`, { rows: visibleBeforeSelectAll.length, label: exportAfterSelectAll });

  await clickKey('select-all');
  const checkedAfterClear = await cdp.evaluate(`[...document.querySelectorAll('.param-row input[type="checkbox"]')].map((i) => i.checked)`);
  const exportAfterClear = await text('[data-param-key="export"]');
  check('clicking select-all again unticks every row', checkedAfterClear.length > 0 && checkedAfterClear.every((c) => c === false), checkedAfterClear);
  check('with nothing ticked the label is back to Export CSV', exportAfterClear === 'Export CSV', exportAfterClear);

  await clickKey('select-SP-9101');
  await choose('.param-select-workspace', '__hand__');
  await cdp.settle(80);
  const exportHidden = await text('[data-param-key="export"]');
  const countHidden = await text('[data-param-key="count"]');
  check('a tick hidden by the workspace filter drops the export label back to Export CSV', exportHidden === 'Export CSV', exportHidden);
  check('and drops out of the count line too', countHidden !== null && !countHidden.includes('SELECTED'), countHidden);

  await choose('.param-select-workspace', '');
  await cdp.settle(80);
  const exportRestored = await text('[data-param-key="export"]');
  check('clearing the workspace filter brings the hidden tick back into the label', exportRestored === 'Export 1 selected', exportRestored);

  await clickKey('select-SP-9101');
  await choose('.param-select-workspace', '__hand__');
  await cdp.settle(80);
  const exportNote = await text('[data-param-key="export-note"]');
  check('with the tick cleared and only demos visible, the export note explains the disabled button', exportNote === 'Demo studies are not exported', exportNote);
  await choose('.param-select-workspace', '');
  await cdp.settle(80);

  // 9. Open a row, come back: tab and sort survive.
  await clickKey('open-SP-9101');
  s = await cdp.state();
  check('clicking a study name opens it on Analysis', s.screen === 'analysis' && s.openId === 'SP-9101', { screen: s.screen, openId: s.openId });
  await cdp.setState('{ screen: "studies" }');
  await cdp.settle(100);
  s = await cdp.state();
  check('back on Studies, the Parameters tab and the PI sort are still in place', s.studiesTab === 'parameters' && s.paramSort.key === 'PI' && s.paramSort.dir === 'desc' && (await has('[data-param-key="grid"]')), { tab: s.studiesTab, sort: s.paramSort });

  // 12. The study columns and the task-2 filters and sort (spec §10.2–§10.3). SP-9101 (S001 Pre-op)
  // and SP-9102 (S001 Post-op) pair; SP-9103 (S002 Pre-op) does not; the demo pair SP-0042/SP-0039
  // (P-8841) pairs as well. Every selector is a data-param-key, a class the grid owns, or an id.
  await cdp.setState('{ paramSort: { key: "study", dir: "asc" } }');
  await cdp.settle(80);
  const textCells = (id) => cdp.evaluate(`(() => { const row = document.querySelector('.param-row[data-study-id="${id}"]'); return row ? [...row.querySelectorAll('.param-cell-text')].slice(0, 4).map((c) => c.textContent) : null; })()`);
  const cellsA = await textCells('SP-9101');
  const cellsC = await textCells('SP-9103');
  check('a row shows subject, timepoint, view and film date, with an em dash where a value is absent',
    JSON.stringify(cellsA) === JSON.stringify(['S001', 'Pre-op', 'Standing lateral', '2025-03-02'])
    && JSON.stringify(cellsC) === JSON.stringify(['S002', 'Pre-op', 'Standing lateral', '\u2014']), { cellsA, cellsC });

  const timepointValues = await options('.param-select-timepoint');
  check('the timepoint dropdown lists the labels present in §7.2 order, then No timepoint',
    JSON.stringify(timepointValues) === JSON.stringify(['', 'Pre-op', 'Post-op', '__none__']), timepointValues);
  await choose('.param-select-timepoint', 'Post-op');
  await cdp.settle(80);
  const postIds = await rowIds();
  check('filtering by Post-op keeps the two post-op films', postIds.length === 2 && postIds.includes('SP-9102') && postIds.includes('SP-0039'), postIds);
  await choose('.param-select-timepoint', '__none__');
  await cdp.settle(80);
  const noneIds = await rowIds();
  check('No timepoint keeps the segmented films with none (the seven other demos)', noneIds.length === 7 && noneIds.every((id) => /^SP-00\d\d$/.test(id)), noneIds);
  await choose('.param-select-timepoint', '');
  await cdp.settle(80);

  const viewValues = await options('.param-select-view');
  check('the view dropdown lists the distinct views present', viewValues[0] === '' && viewValues.includes('Standing lateral') && viewValues.includes('Flexion lateral'), viewValues);
  await choose('.param-select-view', 'Flexion lateral');
  await cdp.settle(80);
  check('filtering by view keeps only the flexion film', JSON.stringify(await rowIds()) === JSON.stringify(['SP-0041']), await rowIds());
  await choose('.param-select-view', '');
  await cdp.settle(80);

  await clickKey('subject');
  await cdp.typeText('S00');
  await cdp.settle(150);
  const subjectIds = await rowIds();
  const subjectFocus = await cdp.evaluate("(() => { const e = document.activeElement; return { key: e?.getAttribute('data-param-key') ?? null, value: e?.value ?? null, caret: e?.selectionStart ?? null }; })()");
  check('typing in the subject box narrows to the matching subjects and keeps focus and the caret',
    subjectIds.length === 3 && subjectIds.every((id) => /^SP-910[123]$/.test(id)) && subjectFocus.key === 'subject' && subjectFocus.value === 'S00' && subjectFocus.caret === 3, { subjectIds, subjectFocus });
  await cdp.evaluate("(() => { const e = document.querySelector('[data-param-key=\"subject\"]'); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await cdp.settle(80);

  const visibleBeforePaired = (await rowIds()).length;
  await clickKey('paired');
  s = await cdp.state();
  const pairedIds = await rowIds();
  const pairedNote = await cdp.evaluate("(() => { const e = document.querySelector('[data-param-key=\"paired\"]'); return e?.closest('.param-check')?.querySelector('.param-check-note')?.textContent ?? null; })()");
  check('paired-only keeps the two paired subjects (four films) and says how many it hid',
    s.paramFilters.pairedOnly === true && pairedIds.length === 4 && ['SP-9101', 'SP-9102', 'SP-0042', 'SP-0039'].every((id) => pairedIds.includes(id))
    && pairedNote === ` \u00B7 ${visibleBeforePaired - 4} unpaired hidden`, { pairedIds, pairedNote, visibleBeforePaired });
  const withState = await cdp.evaluate("(() => { const e = document.querySelector('[data-param-key=\"paired-with\"]'); return { disabled: e.disabled, value: e.value }; })()");
  check('the with dropdown is enabled and reads All paired', withState.disabled === false && withState.value === '__any__', withState);
  await choose('.param-select-timepoint', 'Pre-op');
  await cdp.settle(80);
  const pairedPreIds = await rowIds();
  check('paired-only with Pre-op shows the pre-op halves of the pairs', pairedPreIds.length === 2 && pairedPreIds.includes('SP-9101') && pairedPreIds.includes('SP-0042'), pairedPreIds);
  await choose('.param-select-timepoint', '');
  await cdp.settle(80);
  await clickKey('paired');

  await clickKey('sort-subject');
  const sortedIds = await rowIds();
  const breaks = await cdp.evaluate("[...document.querySelectorAll('.param-row')].map((r) => r.classList.contains('param-row-break'))");
  // p-8841 < s001 < s002, then the seven demos with no subject; Pre-op before Post-op inside a subject.
  check('sorting by subject groups the pairs with Pre-op first and puts films with no subject last',
    JSON.stringify(sortedIds.slice(0, 5)) === JSON.stringify(['SP-0042', 'SP-0039', 'SP-9101', 'SP-9102', 'SP-9103']) && sortedIds.slice(5).every((id) => /^SP-00\d\d$/.test(id)), sortedIds);
  check('a rule starts each new subject block and never the first row',
    breaks.length === sortedIds.length && breaks[0] === false && breaks[1] === false && breaks[2] === true && breaks[3] === false && breaks[4] === true && breaks[5] === true && breaks.slice(6).every((b) => b === false), breaks);
  await clickKey('sort-subject');
  const descIds = await rowIds();
  check('descending reverses the subject order, a pair still reads Pre-op first, no-subject films still last',
    JSON.stringify(descIds.slice(0, 5)) === JSON.stringify(['SP-9103', 'SP-9101', 'SP-9102', 'SP-0042', 'SP-0039']) && descIds.slice(5).every((id) => /^SP-00\d\d$/.test(id)), descIds);
  await cdp.setState('{ paramSort: { key: "PI", dir: "desc" } }');
  await cdp.settle(80);

  // 13. The paired export (spec §10.4, §11.2, §11.3): the button's labels and reasons, and the file
  // and toast text through the page's own modules. The save dialog is the human's. S001 (SP-9101
  // Pre-op, SP-9102 Post-op) is the only real pair; the demo pair is never written; S002 is unpaired.
  await cdp.setState(`{ paramFilters: ${RESET_FILTERS}, paramSort: { key: "study", dir: "asc" }, paramSelected: [] }`);
  await cdp.settle(80);
  const pairedButton = () => cdp.evaluate("(() => { const b = document.querySelector('[data-param-key=\"export-paired\"]'); return b ? { disabled: b.disabled, title: b.title, text: b.textContent } : null; })()");
  const longDisabled = () => cdp.evaluate("document.querySelector('[data-param-key=\"export\"]').disabled");
  let pb = await pairedButton();
  check('the paired button is enabled over the library with the real pair visible and reads Export paired CSV',
    pb !== null && pb.disabled === false && pb.title === '' && pb.text === 'Export paired CSV' && !(await has('[data-param-key="export-paired-note"]')), pb);

  await clickKey('select-SP-9101');
  pb = await pairedButton();
  const pairedNoteOne = await text('[data-param-key="export-paired-note"]');
  check('ticking one film of a pair reads Export paired · 1 selected, disabled, with the no-paired-subjects note',
    pb.disabled === true && pb.text === 'Export paired \u00B7 1 selected' && pb.title === 'No paired subjects in these rows' && pairedNoteOne === 'No paired subjects in these rows', { pb, pairedNoteOne });
  check('the long button stays enabled beside it', (await longDisabled()) === false);

  await clickKey('select-SP-9102');
  pb = await pairedButton();
  check('ticking its partner enables the paired button and reads Export paired · 2 selected',
    pb.disabled === false && pb.text === 'Export paired \u00B7 2 selected' && !(await has('[data-param-key="export-paired-note"]')), pb);
  await cdp.setState('{ paramSelected: [] }');
  await cdp.settle(80);

  await cdp.evaluate("(() => { const e = document.querySelector('[data-param-key=\"subject\"]'); e.value = 'S002'; e.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await cdp.settle(120);
  pb = await pairedButton();
  const s002Rows = await rowIds();
  check('with only S002 visible the paired button is disabled with its own note and the long button is enabled',
    JSON.stringify(s002Rows) === JSON.stringify(['SP-9103']) && pb.disabled === true && (await text('[data-param-key="export-paired-note"]')) === 'No paired subjects in these rows' && (await longDisabled()) === false, { s002Rows, pb });
  await cdp.evaluate("(() => { const e = document.querySelector('[data-param-key=\"subject\"]'); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await cdp.settle(80);

  await choose('.param-select-workspace', '__hand__');
  await cdp.settle(80);
  pb = await pairedButton();
  check('with only demos visible both buttons are disabled and the one note is the long button\'s',
    pb.disabled === true && pb.title === 'Demo studies are not exported' && (await text('[data-param-key="export-note"]')) === 'Demo studies are not exported' && !(await has('[data-param-key="export-paired-note"]')), pb);
  await choose('.param-select-workspace', '');
  await cdp.settle(80);

  await cdp.evaluate("(() => { const e = document.querySelector('[data-param-key=\"subject\"]'); e.value = 'ZZZ'; e.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await cdp.settle(120);
  pb = await pairedButton();
  check('with nothing visible both buttons read Nothing to export and one note stands for both',
    pb.disabled === true && pb.title === 'Nothing to export' && (await text('[data-param-key="export-note"]')) === 'Nothing to export'
    && !(await has('[data-param-key="export-paired-note"]')) && (await longDisabled()) === true, pb);
  await cdp.evaluate("(() => { const e = document.querySelector('[data-param-key=\"subject\"]'); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await cdp.settle(80);

  await clickKey('paired');
  await choose('.param-select-paired-with', 'Post-op');
  await cdp.settle(80);
  const singlePairing = await cdp.evaluate(`Promise.all([import('./renderer/store.js'), import('./renderer/data/pairing.js'), import('./renderer/data/parameters.js')]).then(([st, pr, pm]) => {
    const s = st.getState();
    const f = pm.normaliseFilters(s.paramFilters, s.studies);
    const rows = pm.rowsToExport(pm.sortParameters(pm.filterParameters(s.studies, f), s.paramSort), s.paramSelected);
    const p = pr.pairStudies(rows, { post: pr.postFromFilters(f) });
    return { post: p.post, visits: p.visits, subjects: p.subjects.map((x) => x.subject) };
  })`);
  pb = await pairedButton();
  check('Paired only with Post-op collapses the pairing to that one visit and keeps the button enabled',
    singlePairing.post === 'Post-op' && JSON.stringify(singlePairing.visits) === JSON.stringify(['Post-op']) && JSON.stringify(singlePairing.subjects) === JSON.stringify(['S001']) && pb.disabled === false, { singlePairing, pb });
  await choose('.param-select-paired-with', '__any__');
  await cdp.settle(80);
  await clickKey('paired');

  const paired = await cdp.evaluate(`Promise.all([import('./renderer/store.js'), import('./renderer/data/pairing.js'), import('./renderer/data/csv.js'), import('./renderer/data/parameters.js')]).then(([st, pr, csvm, pm]) => {
    const s = st.getState();
    const f = pm.normaliseFilters(s.paramFilters, s.studies);
    const rows = pm.rowsToExport(pm.sortParameters(pm.filterParameters(s.studies, f), s.paramSort), s.paramSelected);
    const p = pr.pairStudies(rows, { post: pr.postFromFilters(f) });
    return { lines: csvm.toPairedCsv(p).split('\\r\\n'), message: pr.pairedExportMessage(p, 'X') };
  })`);
  check('the paired file\'s header is layout B over the one visit present, Post-op', paired.lines[3] === PAIRED_HEADER, paired.lines[3]);
  check('its one row is S001 with both films, the deltas over the written values, and empty cells where a value is absent', paired.lines[4] === PAIRED_ROW, paired.lines[4]);
  check('the file ends after that row', paired.lines.length === 6 && paired.lines[5] === '', paired.lines.length);
  check('the toast names the one subject written and the one unpaired', paired.message === 'Exported 1 subject to X \u00B7 1 unpaired (S002)', paired.message);
  // Back to the sort section 12 left, so section 10 sees exactly what it saw before this section.
  await cdp.setState('{ paramSort: { key: "PI", dir: "desc" } }');
  await cdp.settle(80);

  // 10. Deleting a ticked study prunes its tick. data/persistence.js's nextId is max+1 over the
  // surviving records, so deleting the highest-numbered study puts its id straight back in
  // circulation; a tick left behind on that id would arrive on the grid already selected and the
  // next export would write the wrong film. SP-9101 is ticked here on the Parameters tab and then
  // deleted through the Find list's own two-step control -- the flow the user actually has --
  // rather than by calling deleteStudy directly. This step consumes SP-9101, so it must stay
  // after section 9, which opens it.
  await clickKey('select-SP-9101');
  const tickedBeforeDelete = await store('s.paramSelected');
  await clickKey('tab-find');
  await cdp.settle(100);
  const deleteRect = await rectBy(`() => document.querySelector('.studies-row[data-study-id="SP-9101"] .studies-delete')`);
  if (!deleteRect) throw new Error('no .studies-delete on the SP-9101 row of the Find list');
  await cdp.click(deleteRect.cx, deleteRect.cy);
  await cdp.settle(100);
  const confirmRect = await rectBy(`() => document.querySelector('.studies-row[data-study-id="SP-9101"] .studies-delete-confirm')`);
  if (!confirmRect) throw new Error('the first click on Delete did not raise .studies-delete-confirm');
  await cdp.click(confirmRect.cx, confirmRect.cy);
  // deleteStudy awaits the delete-prediction IPC before its setState, so the removal is not
  // synchronous with the click. An injected record has no sidecar; the main-process handler
  // treats a missing file as the outcome the caller wanted and resolves.
  const pruned = await waitForState("!s.studies.some((x) => x.id === 'SP-9101') && !(s.paramSelected ?? []).includes('SP-9101')", 5000);
  await cdp.settle(150);
  const afterDelete = await store("({ selected: s.paramSelected, present: s.studies.some((x) => x.id === 'SP-9101'), toast: s.toast })");
  check('deleting a ticked study drops its id from paramSelected as well as from studies',
    pruned === true && afterDelete.present === false && !afterDelete.selected.includes('SP-9101'),
    { tickedBeforeDelete, afterDelete });
  await clickKey('tab-parameters');

  // 11. No console errors or exceptions during the run.
  check('no console errors or exceptions during the run', cdp.errors.length === 0, cdp.errors);
} finally {
  // Remove the injected records and reset the tab state whatever happened above.
  await cdp.setState(`(s) => ({ studies: s.studies.filter((x) => !${JSON.stringify(INJECTED)}.includes(x.id)), openId: ${JSON.stringify(INJECTED)}.includes(s.openId) ? null : s.openId, ...${RESET} })`).catch(() => {});
  cdp.close();
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${JSON.stringify(r.detail)}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
