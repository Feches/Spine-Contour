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
// unpaired) -- and removed in `finally`, so a later suite never meets a stray Unsegmented row.
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
// (2026-11-16, study flags) SP-9104..SP-9106 are injected by section 14 and removed by it; listed so the final cleanup clears them too.
const INJECTED = ['SP-9100', 'SP-9101', 'SP-9102', 'SP-9103', 'SP-9104', 'SP-9105', 'SP-9106'];
const RESET_FILTERS = '{ workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, subject: "", pairedOnly: false, pairedWith: "__any__" }';
const RESET = `{ query: "", studiesTab: "find", paramFilters: ${RESET_FILTERS}, paramSort: { key: "study", dir: "asc" }, paramLevels: false, paramSelected: [] }`;

// The paired file over the injected records under All paired (spec §11.2): S001 is the only real
// pair (the demo pair is never written; S002 is unpaired), so the one visit is Post-op. SP-9101
// (PI 99.5, PT 30, SS 69.5, L1PA 12, LL 60) against SP-9102 (PI 50, PT 15, SS 35, LL 45): PI-LL is
// 39.5 then 5; every delta is post minus pre over those one-decimal values; L1PA and the four
// levels are absent on one or both films, so their cells and deltas are empty. Built from arrays
// so the empty cells are counted, not eyeballed.
// (2026-10-02) Since 1.0.11 (08471fe) both exports carry the ten lumbar segmental columns after the disc heights.
const PAIRED_MEASURES = ['LL L1-S1', 'PI', 'PT', 'SS', 'PI-LL Mismatch', 'L1PA', 'T4PA', 'LL L2-S1', 'LL L3-S1', 'LL L4-S1', 'LL L5-S1',
  ...['L1-L2', 'L2-L3', 'L3-L4', 'L4-L5', 'L5-S1'].flatMap(level =>
    ['anterior', 'middle', 'posterior'].map(position => `Disc height ${level} ${position} (mm)`)),
  ...['L1-L2', 'L2-L3', 'L3-L4', 'L4-L5', 'L5-S1'].flatMap(level =>
    ['lordosis', 'angulation'].map(kind => `Segmental ${kind} ${level} (deg)`))];
// (2026-11-16, study flags, Task 11) Each visit's flags follow the film-date columns: 'Pre-op flags', 'Post-op flags'.
const PAIRED_HEADER = ['Subject', 'Pre-op study', 'Post-op study', 'Pre-op view', 'Post-op view', 'Pre-op film date', 'Post-op film date', 'Pre-op flags', 'Post-op flags',
  ...PAIRED_MEASURES.flatMap((m) => [`${m} Pre-op`, `${m} Post-op`, `Delta ${m} Post-op`])].join(',');
const PAIRED_ROW = ['S001', 'smoke-seg-a', 'smoke-seg-b', 'Standing lateral', 'Standing lateral', '2025-03-02', '2025-09-14', '', '',
  '60', '45', '-15', '99.5', '50', '-49.5', '30', '15', '-15', '69.5', '35', '-34.5', '39.5', '5', '-34.5', '12', '', '',
  // 90 empties: 36 measures x 3 cells = 108, less the 18 literal cells above (six measures to L1PA); T4PA onward is all empty.
  ...Array(PAIRED_MEASURES.length * 3 - 18).fill('')].join(',');

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
  check('the paired file\'s header is layout B over the one visit present, Post-op', paired.lines[2] === PAIRED_HEADER, paired.lines[2]);
  check('its one row is S001 with both films, the deltas over the written values, and empty cells where a value is absent', paired.lines[3] === PAIRED_ROW, paired.lines[3]);
  check('the file ends after that row', paired.lines.length === 5 && paired.lines[4] === '', paired.lines.length);
  check('the toast names the one subject written and the one unpaired', paired.message === 'Exported 1 subject to X \u00B7 1 unpaired (S002)', paired.message);
  // Back to the sort section 12 left, so section 10 sees exactly what it saw before this section.
  await cdp.setState('{ paramSort: { key: "PI", dir: "desc" } }');
  await cdp.settle(80);


  // 14. (2026-11-16, study flags, Tasks 10 and 11; spec 4.5, 4.6; FL20, FL21, FL25) Flags on the Parameters tab and in both
  // CSV exports. Films: the injected SP-9101 (S001 Pre-op), SP-9102 (S001 Post-op) and SP-9103 (S002 Pre-op), plus SP-9104
  // (S001 Post-op, same day, noted: merges into SP-9102's visit), SP-9105 (S004 Pre-op) and SP-9106 (S004 `6 wk`), which
  // give the paired file a third visit that S001 lacks and a Post-op that S004 lacks. The save dialog is the human's, so
  // the exported text is built the way the buttons build it, through the page's own modules over the rows the grid shows
  // (as section 13 does for the paired file); line 3 of a file is its header (two comment lines above it).
  {
    const errorsBefore14 = cdp.errors.length;
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const FLAG_RESET = `{ workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, flag: null, subject: "", pairedOnly: false, pairedWith: "__any__" }`;
    const NEW = ['SP-9104', 'SP-9105', 'SP-9106'];
    const real = (id, name, subject, timepoint, filmDate, extra = {}) => `{ id: '${id}', source: 'real', filePath: ${JSON.stringify(`${WS_ROOT}\\${timepoint.toLowerCase().replace(' ', '')}\\${name}.png`)}, fileName: '${name}.png', name: null, workspaceFolder: ${JSON.stringify(WS_ROOT)},
      subjectId: '${subject}', timepoint: '${timepoint}', filmDate: '${filmDate}', addedAt: '2026-09-0${(Number(id.slice(-1)) % 8) + 1}T00:00:00.000Z', view: 'Standing lateral', thumbnail: null,
      measurements: { PI: 40, PT: 10, SS: 30, LL: { 'L1-S1': 35 } }, geometry: null, qc: null, clinical: {}, ...${JSON.stringify(extra)} }`;
    const putFlags = (map) => cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: s.studies.map((x) => (Object.prototype.hasOwnProperty.call(${JSON.stringify(map)}, x.id) ? { ...x, flags: ${JSON.stringify(map)}[x.id] } : x)) })))`);
    const injectNew = () => cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: [
      ${real('SP-9104', 'smoke-seg-b2', 'S001', 'Post-op', '2025-09-14', { note: 'femoral heads' })},
      ${real('SP-9105', 'smoke-seg-d', 'S004', 'Pre-op', '2025-04-01')},
      ${real('SP-9106', 'smoke-seg-e', 'S004', '6 wk', '2025-05-13')},
      ...s.studies.filter((x) => !${JSON.stringify(NEW)}.includes(x.id)) ] })))`);
    const flagSel = () => cdp.evaluate(`(() => { const e = document.querySelector('[data-param-key="flag"]'); return e ? { value: e.value, options: [...e.options].map((o) => [o.value, o.textContent]), focused: document.activeElement === e, selected: e.options[e.selectedIndex]?.textContent ?? null } : null; })()`);
    const chooseFlag = async (value) => {
      await cdp.evaluate("document.querySelector('[data-param-key=\"flag\"]')?.focus()");
      await choose('[data-param-key="flag"]', value);
      await cdp.settle(120);
    };
    const exportButtons = () => cdp.evaluate(`(() => { const q = (k) => { const b = document.querySelector('[data-param-key="' + k + '"]'); return b ? { disabled: b.disabled, title: b.title, text: b.textContent } : null; }; return { csv: q('export'), paired: q('export-paired') }; })()`);
    // The two files as the buttons would write them over the rows shown now (the selection, then the filters, as the screen does).
    const files = () => cdp.evaluate(`Promise.all([import('./renderer/store.js'), import('./renderer/data/pairing.js'), import('./renderer/data/csv.js'), import('./renderer/data/parameters.js')]).then(([st, pr, csvm, pm]) => {
      const s = st.getState();
      const f = pm.normaliseFilters(s.paramFilters, s.studies);
      const rows = pm.rowsToExport(pm.sortParameters(pm.filterParameters(s.studies, f), s.paramSort), s.paramSelected);
      const p = pr.pairStudies(rows, { post: pr.postFromFilters(f) });
      return { rows: rows.map((x) => x.id), csv: csvm.toCsv(rows), paired: p.subjects.length > 0 ? csvm.toPairedCsv(p) : null };
    })`);
    const parse = (fileText) => fileText.split('\r\n').filter((line, i, all) => !(i === all.length - 1 && line === '')).map((line) => line.split(','));

    await cdp.setState(`{ screen: "studies", studiesTab: "parameters", paramFilters: ${FLAG_RESET}, paramSort: { key: "study", dir: "asc" }, paramSelected: [], query: "" }`);
    await injectNew();
    await putFlags({ 'SP-9101': ['Hardware', 'OLIF outcomes'], 'SP-9102': ['hardware', 'cement'], 'SP-9104': ['HARDWARE', 'Cement', 'extra'], 'SP-9103': [], 'SP-9105': [], 'SP-9106': [] });
    await cdp.settle(250);

    // 14.1 The grid: FLAGS last, joined with ", " and titled in full, an em dash when none, read only.
    const grid1 = await cdp.evaluate(`(() => {
      const heads = [...document.querySelectorAll('.param-table thead th')].map((h) => h.textContent.replace(/[\\u25B4\\u25BE]/g, '').trim());
      const cell = (id) => { const c = document.querySelector('.param-row[data-study-id="' + id + '"] td:last-child'); return c ? { text: c.textContent, title: c.getAttribute('title'), role: c.getAttribute('role'), tab: c.getAttribute('tabindex'), inputs: c.querySelectorAll('input, button, [role="button"]').length } : null; };
      return { heads, last: heads[heads.length - 1], a: cell('SP-9102'), b: cell('SP-9103'), c: cell('SP-9101') };
    })()`);
    check('14.1 FLAGS is the grid\'s last header', grid1.last === 'FLAGS' && grid1.heads.filter((h) => h === 'FLAGS').length === 1, grid1.heads);
    check('14.1 a film with flags shows them joined with a comma and a space, the full text on the cell\'s title',
      grid1.a && grid1.a.text === 'hardware, cement' && grid1.a.title === 'hardware, cement' && grid1.c.text === 'Hardware, OLIF outcomes' && grid1.c.title === 'Hardware, OLIF outcomes', grid1);
    check('14.1 a film with none shows the em dash', grid1.b && grid1.b.text === '—', grid1.b);
    const cellRect = await cdp.rect('.param-row[data-study-id="SP-9102"] td:last-child');
    await cdp.click(cellRect.cx, cellRect.cy);
    await cdp.settle(150);
    const afterClick1 = await cdp.evaluate(`(() => { const c = document.querySelector('.param-row[data-study-id="SP-9102"] td:last-child'); return { inputs: c.querySelectorAll('input, button, textarea, select').length, role: c.getAttribute('role'), page: document.querySelectorAll('.flag-editor').length, screen: document.querySelector('.param-table') ? 'grid' : null }; })()`);
    check('14.1 the cell is not editable: no button role, nothing opens on a click, no editor appears',
      grid1.a.role === null && grid1.a.tab === null && grid1.a.inputs === 0 && afterClick1.inputs === 0 && afterClick1.page === 0 && afterClick1.screen === 'grid', { grid1: grid1.a, afterClick1 });

    // 14.2 The dropdown.
    let sel = await flagSel();
    check('14.2 the options read All flags, then one per flag in use A to Z by spelling, then No flags',
      sel && sel.options[0][0] === '' && sel.options[0][1] === 'All flags' && same(sel.options.slice(1, -1).map((o) => o[0]), ['cement', 'extra', 'hardware', 'olif outcomes'])
      && sel.options.slice(1, -1).every(([v, label]) => label.toLowerCase() === v) && sel.options[sel.options.length - 1][1] === 'No flags', sel && sel.options);
    await chooseFlag('hardware');
    const hw = await rowIds();
    sel = await flagSel();
    check('14.2 choosing a flag narrows the grid to the films holding it, whatever their case', same([...hw].sort(), ['SP-9101', 'SP-9102', 'SP-9104']) && sel.value === 'hardware', { hw, sel: sel && sel.value });
    check('14.2 and focus is back on the select after the rebuild', sel.focused === true, sel);
    await chooseFlag('__no_flags__');
    const none = await rowIds();
    check('14.2 No flags shows the films with none (the segmented demos and the flagless real films)', none.includes('SP-9103') && none.includes('SP-9105') && !none.includes('SP-9102') && !none.includes('SP-9101') && none.length > 2, none);
    await chooseFlag('');
    const everyone = await rowIds();
    check('14.2 All flags restores every row', everyone.length > none.length && ['SP-9101', 'SP-9102', 'SP-9103', 'SP-9104'].every((id) => everyone.includes(id)), everyone);

    // 14.3 A kept choice (FL25): the last film loses the chosen flag.
    await chooseFlag('extra');
    check('14.3 choosing extra leaves the one film holding it', same(await rowIds(), ['SP-9104']), await rowIds());
    await putFlags({ 'SP-9104': ['HARDWARE', 'Cement'] });
    await cdp.settle(250);
    sel = await flagSel();
    const emptyText = await text('[data-param-key="empty"]');
    const btn3 = await exportButtons();
    check('14.3 with extra removed from its last film the select still shows extra and the grid is empty with the filtered copy',
      sel.value === 'extra' && sel.selected === 'extra' && (await count('.param-row')) === 0 && emptyText === 'No studies match these filters.', { sel: sel.value, selected: sel.selected, emptyText });
    check('14.3 and both export buttons are disabled with Nothing to export', btn3.csv?.disabled === true && btn3.paired?.disabled === true && btn3.csv.title === 'Nothing to export', btn3);
    await putFlags({ 'SP-9103': ['extra'] });
    await cdp.settle(250);
    sel = await flagSel();
    check('14.3 giving extra to a film brings it back without touching the select', same(await rowIds(), ['SP-9103']) && sel.value === 'extra', { rows: await rowIds(), value: sel.value });
    await chooseFlag('');
    await putFlags({ 'SP-9103': [] });

    // 14.4 Options follow the library.
    await putFlags({ 'SP-9105': ['brandnew'] });
    await cdp.settle(250);
    sel = await flagSel();
    check('14.4 a flag added to a film adds its option', sel.options.some(([v]) => v === 'brandnew') && sel.value === '', sel.options);
    await putFlags({ 'SP-9105': [] });
    await cdp.settle(250);
    sel = await flagSel();
    check('14.4 a flag removed from its last film (not the chosen one) loses its option', !sel.options.some(([v]) => v === 'brandnew') && sel.value === '', sel.options);

    // 14.5 Export CSV with a flag chosen writes only the films holding it.
    await chooseFlag('hardware');
    const f5 = await files();
    const lines5 = parse(f5.csv);
    const head5 = lines5[2];
    const iNote = head5.indexOf('Note');
    const body5 = lines5.slice(3);
    const flagsByName = { 'smoke-seg-a': 'Hardware; OLIF outcomes', 'smoke-seg-b': 'hardware; cement', 'smoke-seg-b2': 'HARDWARE; Cement' };
    check('14.5 line 3 is the header and Flags sits directly after Note', head5[0] === 'Study ID' && iNote > 0 && head5[iNote + 1] === 'Flags', head5.slice(0, 8));
    check('14.5 only the three films holding hardware are written, each with its flags joined by "; "',
      body5.length === 3 && body5.every((row) => flagsByName[row[0]] === row[iNote + 1]) && same(body5.map((r) => r[0]).sort(), Object.keys(flagsByName).sort()), body5.map((r) => [r[0], r[iNote + 1]]));
    check('14.5 no cell and no header holds an SP- id', !/SP-\d/.test(f5.csv), f5.csv.split('\r\n').filter((l) => /SP-\d/.test(l)).slice(0, 2));
    await chooseFlag('__no_flags__');
    const f5b = await files();
    const body5b = parse(f5b.csv).slice(3);
    check('14.5 with No flags chosen every written row has an empty Flags cell', body5b.length > 0 && body5b.every((row) => row[parse(f5b.csv)[2].indexOf('Note') + 1] === ''), body5b.map((r) => r[0]));
    await chooseFlag('');

    // 14.6 The paired file. The merged visit's partner is given its flags in another order and case, so primary-first and no-repeats are both exercised.
    await putFlags({ 'SP-9104': ['Cement', 'extra2', 'HARDWARE'] });
    await cdp.settle(200);
    const f6 = await files();
    const lines6 = parse(f6.paired);
    const head6 = lines6[2];
    const dateCols = head6.map((h, i) => (/ film date$/.test(h) ? i : -1)).filter((i) => i >= 0);
    const flagCols = head6.map((h, i) => (/ flags$/.test(h) ? i : -1)).filter((i) => i >= 0);
    const visits6 = dateCols.map((i) => head6[i].replace(/ film date$/, ''));
    check('14.6 the header has a "<visit> flags" column for each visit directly after the last film-date column',
      visits6.length >= 3 && same(flagCols, dateCols.map((_, k) => dateCols[dateCols.length - 1] + 1 + k)) && same(flagCols.map((i) => head6[i]), visits6.map((v) => `${v} flags`)), { visits6, dateCols, flagCols });
    const rowFor = (subject) => lines6.slice(3).find((r) => r[0] === subject);
    const cellFor = (row, visit) => row[head6.indexOf(`${visit} flags`)];
    const s001 = rowFor('S001');
    const s004 = rowFor('S004');
    check('14.6 a single-film visit lists its film\'s flags joined with "; "', Boolean(s001) && cellFor(s001, 'Pre-op') === 'Hardware; OLIF outcomes', s001 && cellFor(s001, 'Pre-op'));
    check('14.6 a visit merged from two same-day films lists the primary film\'s flags first, without repeats of a different case',
      Boolean(s001) && cellFor(s001, 'Post-op') === 'hardware; cement; extra2', s001 && cellFor(s001, 'Post-op'));
    check('14.6 a visit with no film is empty (S001 has no 6 wk film, S004 no Post-op film)',
      Boolean(s001) && Boolean(s004) && cellFor(s001, '6 wk') === '' && cellFor(s004, 'Post-op') === '' && cellFor(s004, '6 wk') === '', { s001, s004 });
    check('14.6 no cell or header of the paired file holds an SP- id', !/SP-\d/.test(f6.paired), f6.paired.split('\r\n').filter((l) => /SP-\d/.test(l)).slice(0, 2));

    // 14.7 No flag chosen: the same rows both exports always held.
    const expectedRows = await store("s.studies.filter((x) => x.source === 'real' && x.measurements != null).map((x) => x.id).sort()");
    const csvIds = (await files()).rows.filter((id) => !/^SP-00/.test(id)).sort();
    const f7 = await files();
    check('14.7 with no flag chosen Export CSV writes every real segmented film, one row each', same(csvIds, expectedRows) && parse(f7.csv).length - 3 === expectedRows.length, { csvIds, expectedRows, lines: parse(f7.csv).length });
    check('14.7 and the paired file writes the subjects with a Pre-op film and a later visit (S001, S004), not S002',
      same(lines6.slice(3).map((r) => r[0]).sort(), ['S001', 'S004']), lines6.slice(3).map((r) => r[0]));

    // 14.8 The Find list's flag filter and the grid's are independent.
    await clickKey('tab-find');
    await cdp.settle(150);
    await cdp.evaluate(`document.querySelector('[data-find-key="filter-flags"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })`);
    const funnel8 = await cdp.rect('[data-find-key="filter-flags"]');
    await cdp.click(funnel8.cx, funnel8.cy);
    await cdp.settle(200);
    const tickRect = await cdp.rect('label:has(> [data-find-key="filter-flags-cement"])');
    if (tickRect) await cdp.click(tickRect.cx, tickRect.cy);
    await cdp.settle(200);
    const findFlags = (await cdp.state()).findFilters.flags;
    await cdp.key('Escape');
    await cdp.settle(100);
    await clickKey('tab-parameters');
    await cdp.settle(150);
    sel = await flagSel();
    s = await cdp.state();
    check('14.8 a tick in the Find list\'s FLAGS menu leaves the Parameters select and filter alone',
      same(findFlags, ['cement']) && sel.value === '' && s.paramFilters.flag === null && (await count('.param-row')) === everyone.length, { findFlags, select: sel.value, flag: s.paramFilters.flag });
    await chooseFlag('hardware');
    s = await cdp.state();
    check('14.8 and choosing a flag in the Parameters select leaves the Find list\'s ticks as they were', same(s.findFilters.flags, ['cement']) && s.paramFilters.flag === 'hardware', { find: s.findFilters.flags, param: s.paramFilters.flag });
    await chooseFlag('');
    await cdp.setState(`{ findFilters: { subject: "", region: [], view: [], workspace: [], folder: [], status: [], flags: [], flagsMatch: "any" } }`);

    // Tidy: the extra films go; the injected ones lose their flags.
    await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: s.studies.filter((x) => !${JSON.stringify(NEW)}.includes(x.id)).map((x) => (x.flags && x.flags.length ? { ...x, flags: [] } : x)) })))`);
    await cdp.setState(`{ paramFilters: ${RESET_FILTERS}, paramSort: { key: "PI", dir: "desc" }, paramSelected: [] }`);
    await cdp.settle(100);
    check('14.9 no console errors or exceptions in section 14', cdp.errors.length === errorsBefore14, cdp.errors.slice(errorsBefore14));
  }

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
