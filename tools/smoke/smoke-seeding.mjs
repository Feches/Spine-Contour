// Seeding smoke (task 2 of the pre-op/post-op spec, 2026-09-07: §8 and §9, and the §10.3 filters
// over seeded films). Drives, on a launched app over CDP: the folder table on the Workspace card
// seeded from a fixture with pre-op/, post-op/ and flexion/ subfolders and a CSV with the four
// structural columns; a row changed before Load; Load and its message; the study fields the load
// wrote, read back from the store; the Parameters grid under the timepoint, paired-only and
// subject filters; the export's header and first row through the page's own toCsv; and the
// drawer's Study group on Analysis, including a typed timepoint. DOM-only, no segmentation.
// Fixture: tools/smoke/out/seeding-fixture/ plus tools/smoke/out/seeding-fixture.csv beside it.
//
// PRECONDITIONS
//   * A launched app (`node tools/smoke/launch.mjs`), any screen. It may follow
//     smoke-parameters.mjs on the same instance (that suite removes its records) and may precede
//     or follow smoke-workspace.mjs: every count here is over the fixture's own five records,
//     found by workspaceFolder, and the folder table is read by data-ws-folder.
//   * NEVER between `smoke-persist.mjs --phase run` and `--phase restart`: the load writes the
//     store through the saver, and the cleanup writes it again.
//   * It leaves the app on Studies with the five fixture records removed, the ws* keys cleared
//     and state.fields as it found it.
//
// NOT DRIVEABLE HERE: the native folder and CSV pickers (the state is seeded the way the two
// handlers would seed it), the datalist popup and the date picker popup (the values are set and
// read back instead), and the save dialog (the CSV text is read from toCsv, never written).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'out', 'seeding-fixture');
const CSV_PATH = path.join(__dirname, 'out', 'seeding-fixture.csv');
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Five films: S001 in both pre-op/ and post-op/ (a pair whose stem is ambiguous for the CSV, so it
// takes no row), S002 in pre-op/, S003 in flexion/, and S004_postop in the root. The CSV joins on
// the stem: S002 (timepoint `preop`, a US date, no view), S003 (a date the parser rejects),
// S004_postop (a subject the CSV supplies, an ISO date, a view). Excel-style: BOM and CRLF.
function writeFixture() {
  fs.rmSync(FIXTURE, { recursive: true, force: true });
  for (const dir of ['pre-op', 'post-op', 'flexion']) fs.mkdirSync(path.join(FIXTURE, dir), { recursive: true });
  const png = Buffer.from(PNG_1X1, 'base64');
  fs.writeFileSync(path.join(FIXTURE, 'pre-op', 'S001.png'), png);
  fs.writeFileSync(path.join(FIXTURE, 'pre-op', 'S002.png'), png);
  fs.writeFileSync(path.join(FIXTURE, 'post-op', 'S001.png'), png);
  fs.writeFileSync(path.join(FIXTURE, 'flexion', 'S003.png'), png);
  fs.writeFileSync(path.join(FIXTURE, 'S004_postop.png'), png);
  const csv = '\uFEFFstudy_id,subject_id,timepoint,film_date,view,age_yrs\r\n'
    + 'S002,,preop,3/2/2025,,58\r\n'
    + 'S003,,,2025-13-40,,61\r\n'
    + 'S004_postop,S004-CSV,,2025-09-14,Supine lateral,\r\n';
  fs.writeFileSync(CSV_PATH, csv, 'utf8');
}

const at = (relative) => path.join(FIXTURE, ...relative.split('/'));
const ROWS_AT_SCAN = [
  { folder: '.', count: 1, timepoint: null, view: 'Standing lateral' },
  { folder: 'flexion', count: 1, timepoint: null, view: 'Flexion lateral' },
  { folder: 'post-op', count: 1, timepoint: 'Post-op', view: 'Standing lateral' },
  { folder: 'pre-op', count: 2, timepoint: 'Pre-op', view: 'Standing lateral' },
];
const TOAST_LOAD = 'Workspace loaded — 5 studies added · clinical data linked (3 matched)'
  + ' · subject, timepoint, film date, view or note read from folder or file names for 5 films'
  + ' · subject, timepoint, film date or view set from the CSV for 2 films'
  + ' · 1 film has no timepoint · 1 film date could not be read';
// 2026-09-10: fifteen disc-height columns (renderer/data/csv.js, DISC_LEVEL_PAIRS x DISC_POSITIONS) now sit between LL L5-S1 and Age.
const EXPORT_HEADER = 'Study ID,View,Subject,Timepoint,Film date,Note,LL L1-S1,PI,PT,SS,PI-LL Mismatch,L1PA,LL L2-S1,LL L3-S1,LL L4-S1,LL L5-S1,Disc height L1-L2 anterior (mm),Disc height L1-L2 middle (mm),Disc height L1-L2 posterior (mm),Disc height L2-L3 anterior (mm),Disc height L2-L3 middle (mm),Disc height L2-L3 posterior (mm),Disc height L3-L4 anterior (mm),Disc height L3-L4 middle (mm),Disc height L3-L4 posterior (mm),Disc height L4-L5 anterior (mm),Disc height L4-L5 middle (mm),Disc height L4-L5 posterior (mm),Disc height L5-S1 anterior (mm),Disc height L5-S1 middle (mm),Disc height L5-S1 posterior (mm),Age,Record ID';
const RESET_WS = '{ wsFolder: null, wsFiles: [], wsFolderRows: [], wsCsv: null, wsCsvHeaders: [], wsCsvRows: [], wsMapping: [] }';
const RESET_PARAMS = '{ query: "", studiesTab: "find", paramFilters: { workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, subject: "", pairedOnly: false, pairedWith: "__any__" }, paramSort: { key: "study", dir: "asc" }, paramLevels: false, paramSelected: [] }';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

const cdp = await connect();
const errorsAtStart = cdp.errors.length; // Runtime.enable replays older page exceptions; count deltas.
const store = (expr) => cdp.evaluate(`import('./renderer/store.js').then((m) => { const s = m.getState(); return (${expr}); })`);
const rowIds = () => cdp.evaluate("[...document.querySelectorAll('.param-row')].map((r) => r.dataset.studyId)");
const options = (selector) => cdp.evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)} + ' option')].map((o) => o.value)`);
const choose = (selector, value) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); return e.value; })()`);
const rectBy = (finderSource) => cdp.evaluate(`(() => {
  const e = (${finderSource})();
  if (!e) return null;
  e.scrollIntoView({ block: 'center' });
  const r = e.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
})()`);
async function waitForState(predicateSource, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await store(`Boolean(${predicateSource})`)) return true;
    await cdp.settle(150);
  }
  return false;
}
const fixtureFilter = `(x) => x.source === 'real' && x.workspaceFolder === ${JSON.stringify(FIXTURE)}`;
const fixtureRecords = () => store(`s.studies.filter(${fixtureFilter}).map((x) => ({ id: x.id, filePath: x.filePath, subjectId: x.subjectId, timepoint: x.timepoint, filmDate: x.filmDate, view: x.view, clinical: x.clinical }))`);
// The folder table as it reads: one entry per data-ws-folder row.
const tableRows = () => cdp.evaluate(`[...document.querySelectorAll('.workspace-folders tbody tr[data-ws-folder]')].map((r) => ({
  folder: r.dataset.wsFolder,
  count: Number(r.querySelector('.workspace-folders-num')?.textContent),
  timepoint: r.querySelector('[data-ws-key^="tp:"]')?.value || null,
  view: r.querySelector('[data-ws-key^="view:"]')?.value ?? null,
}))`);
// Set a folder-table select the way the DOM would, with focus on it first so the rebuild's
// focus restore has something to restore.
const setTableSelect = (key, value) => cdp.evaluate(`(() => { const e = document.querySelector('[data-ws-key=${JSON.stringify(key)}]'); e.focus(); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const activeKey = () => cdp.evaluate("document.activeElement?.getAttribute('data-ws-key') ?? null");

// The clinical field list the load adds Age to; the finally puts it back. Declared out here so
// the finally can read it, and left null if the run never got as far as the snapshot.
let fieldsAtStart = null;

try {
  writeFixture();

  // 0. Ready, on Studies, with a clean workspace and grid state.
  check('precondition: the store has loaded (the demo studies are merged in at bootstrap)', await waitForState('s.studies.length > 0', 30000));
  fieldsAtStart = await store('s.fields');
  await cdp.setState(`{ ack: true, screen: "studies", ...${RESET_WS}, ...${RESET_PARAMS} }`);
  await cdp.settle(100);

  // 1. The scan, through the bridge, and the rows the card will show.
  const scan = await cdp.evaluate(`window.spineContour.scanFolder(${JSON.stringify(FIXTURE)})`);
  check('scanFolder finds the five films, sorted by name depth-first', scan && scan.files.length === 5
    && same(scan.files, [at('S004_postop.png'), at('flexion/S003.png'), at('post-op/S001.png'), at('pre-op/S001.png'), at('pre-op/S002.png')]), scan);
  const rows = await cdp.evaluate(`import('./renderer/data/seeding.js').then((m) => m.folderRows(${JSON.stringify(scan.files)}, ${JSON.stringify(FIXTURE)}))`);
  check('folderRows infers one row per folder with its count, timepoint and view', same(rows, ROWS_AT_SCAN), rows);
  const csv = await cdp.evaluate(`Promise.all([window.spineContour.readCsv(${JSON.stringify(CSV_PATH)}), import('./renderer/data/csv.js')]).then(([text, m]) => {
    const parsed = m.parse(text);
    return { headers: parsed.headers, rows: parsed.rows, mapping: m.autoMap(parsed.headers) };
  })`);
  check('autoMap claims Age and leaves the join key and the four structural columns unmapped',
    same(csv.mapping, [{ src: 'study_id', dest: null }, { src: 'subject_id', dest: null }, { src: 'timepoint', dest: null },
      { src: 'film_date', dest: null }, { src: 'view', dest: null }, { src: 'age_yrs', dest: 'Age' }]), csv.mapping);

  // 2. Seed the state as the two handlers would and mount the Workspace screen.
  await cdp.setState(JSON.stringify({
    wsFolder: FIXTURE, wsFiles: scan.files, wsFolderRows: rows,
    wsCsv: CSV_PATH, wsCsvHeaders: csv.headers, wsCsvRows: csv.rows, wsMapping: csv.mapping,
  }));
  await cdp.setState('{ screen: "workspace" }');
  await cdp.settle(120);
  check('the Workspace screen mounts with the folder table', Boolean(await cdp.rect('.workspace-folders[data-ws-key="folders"]')));
  check('the table shows the four rows the scan inferred', same(await tableRows(), ROWS_AT_SCAN), await tableRows());

  // 3. Change the pre-op row's view, then use the header control, then set two rows by hand.
  await setTableSelect('view:pre-op', 'Extension lateral');
  await cdp.settle(100);
  let s = await cdp.state();
  check('changing a row\'s view writes wsFolderRows and keeps focus on that select',
    s.wsFolderRows.find((r) => r.folder === 'pre-op')?.view === 'Extension lateral' && (await activeKey()) === 'view:pre-op', { rows: s.wsFolderRows, active: await activeKey() });
  await setTableSelect('all-timepoint', 'Intra-op');
  await cdp.settle(100);
  s = await cdp.state();
  const headerValue = await cdp.evaluate("document.querySelector('[data-ws-key=\"all-timepoint\"]')?.value");
  check('Set all… writes every row\'s timepoint and returns to its placeholder',
    s.wsFolderRows.every((r) => r.timepoint === 'Intra-op') && headerValue === '__all__', { rows: s.wsFolderRows, headerValue });
  await setTableSelect('all-timepoint', '');
  await cdp.settle(100);
  await setTableSelect('tp:pre-op', 'Pre-op');
  await cdp.settle(100);
  await setTableSelect('tp:post-op', 'Post-op');
  await cdp.settle(100);
  s = await cdp.state();
  check('the rows read back: root none, flexion none, post-op Post-op, pre-op Pre-op + Extension lateral',
    same(s.wsFolderRows, [
      { folder: '.', count: 1, timepoint: null, view: 'Standing lateral' },
      { folder: 'flexion', count: 1, timepoint: null, view: 'Flexion lateral' },
      { folder: 'post-op', count: 1, timepoint: 'Post-op', view: 'Standing lateral' },
      { folder: 'pre-op', count: 2, timepoint: 'Pre-op', view: 'Extension lateral' },
    ]), s.wsFolderRows);

  // 4. The mapping card: fixed chips for the join key and the structural columns.
  const chips = await cdp.evaluate(`[...document.querySelectorAll('.workspace-chip')].map((c) => ({
    src: c.querySelector('.workspace-chip-src')?.textContent ?? null,
    fixed: c.classList.contains('workspace-chip-fixed'),
    dest: c.querySelector('.workspace-chip-dest')?.textContent ?? null,
    select: c.querySelector('.workspace-chip-select')?.value ?? null,
  }))`);
  check('study_id, subject_id, timepoint, film_date and view are fixed chips; age_yrs keeps its select',
    same(chips, [
      { src: 'study_id', fixed: true, dest: 'Join key', select: null },
      { src: 'subject_id', fixed: true, dest: 'Subject', select: null },
      { src: 'timepoint', fixed: true, dest: 'Timepoint', select: null },
      { src: 'film_date', fixed: true, dest: 'Film date', select: null },
      { src: 'view', fixed: true, dest: 'View', select: null },
      { src: 'age_yrs', fixed: false, dest: null, select: 'Age' },
    ]), chips);

  // 5. Load.
  const loadRect = await rectBy("() => document.querySelector('.workspace-load')");
  check('Load workspace has layout', Boolean(loadRect), loadRect);
  await cdp.click(loadRect.cx, loadRect.cy);
  await cdp.settle(200);
  s = await cdp.state();
  check('Load navigates to Studies and the toast reports the join and the seeding', s.screen === 'studies' && s.toast === TOAST_LOAD, s.toast);
  const records = await fixtureRecords();
  const byPath = (relative) => records.find((x) => x.filePath === at(relative));
  const fields = (x) => (x ? { subjectId: x.subjectId, timepoint: x.timepoint, filmDate: x.filmDate, view: x.view, clinical: x.clinical } : null);
  check('five fixture records were added', records.length === 5, records.map((x) => x.filePath));
  check('S004_postop: subject and view from the CSV, timepoint from its own name, the ISO date',
    same(fields(byPath('S004_postop.png')), { subjectId: 'S004-CSV', timepoint: 'Post-op', filmDate: '2025-09-14', view: 'Supine lateral', clinical: {} }), fields(byPath('S004_postop.png')));
  check('flexion/S003: subject from the stem, no timepoint, the folder\'s view, its Age; the bad date not written',
    same(fields(byPath('flexion/S003.png')), { subjectId: 'S003', timepoint: null, filmDate: null, view: 'Flexion lateral', clinical: { Age: '61' } }), fields(byPath('flexion/S003.png')));
  check('post-op/S001: the ambiguous stem took no CSV row; subject and timepoint from the layout',
    same(fields(byPath('post-op/S001.png')), { subjectId: 'S001', timepoint: 'Post-op', filmDate: null, view: 'Standing lateral', clinical: {} }), fields(byPath('post-op/S001.png')));
  check('pre-op/S001: the changed row\'s view applied to a film whose own name says nothing',
    same(fields(byPath('pre-op/S001.png')), { subjectId: 'S001', timepoint: 'Pre-op', filmDate: null, view: 'Extension lateral', clinical: {} }), fields(byPath('pre-op/S001.png')));
  check('pre-op/S002: the CSV\'s preop and US date, the row\'s view, its Age',
    same(fields(byPath('pre-op/S002.png')), { subjectId: 'S002', timepoint: 'Pre-op', filmDate: '2025-03-02', view: 'Extension lateral', clinical: { Age: '58' } }), fields(byPath('pre-op/S002.png')));
  // The saver writes asynchronously after the load's setState: poll the raw store through the bridge.
  let stored = [];
  for (const deadline = Date.now() + 5000; Date.now() < deadline && stored.length < 5;) {
    const persisted = await cdp.evaluate('window.spineContour.loadStudies()');
    stored = ((persisted && persisted.studies) || []).filter((x) => x.workspaceFolder === FIXTURE);
    if (stored.length < 5) await cdp.settle(150);
  }
  check('the store on disk carries the four fields (subject, timepoint, film date, view) for the fixture records',
    stored.length === 5 && same(stored.map((x) => [x.filePath, x.subjectId, x.timepoint, x.filmDate, x.view]).sort(),
      records.map((x) => [x.filePath, x.subjectId, x.timepoint, x.filmDate, x.view]).sort()), stored.map((x) => [x.filePath, x.subjectId, x.timepoint, x.filmDate, x.view]));

  // 6. The Parameters grid over the fixture: every filter the task added, with segmented-only off
  // (nothing here is segmented) and the workspace filter on the fixture root.
  await cdp.setState(`{ studiesTab: "parameters", paramFilters: { workspace: ${JSON.stringify(FIXTURE)}, folder: null, segmentedOnly: false, timepoint: null, view: null, subject: "", pairedOnly: false, pairedWith: "__any__" } }`);
  await cdp.settle(120);
  const ids = records.map((x) => x.id);
  const idOf = (relative) => byPath(relative)?.id;
  let visible = await rowIds();
  check('the grid shows the five fixture rows under the workspace filter', visible.length === 5 && visible.every((id) => ids.includes(id)), visible);
  await choose('.param-select-timepoint', 'Pre-op');
  await cdp.settle(100);
  visible = await rowIds();
  check('Pre-op keeps the two pre-op films', same([...visible].sort(), [idOf('pre-op/S001.png'), idOf('pre-op/S002.png')].sort()), visible);
  await choose('.param-select-timepoint', '');
  await cdp.settle(100);
  const pairedRect = await cdp.rect('[data-param-key="paired"]');
  await cdp.click(pairedRect.cx, pairedRect.cy);
  await cdp.settle(120);
  visible = await rowIds();
  const pairedNote = await cdp.evaluate("(() => { const e = document.querySelector('[data-param-key=\"paired\"]'); return e?.closest('.param-check')?.querySelector('.param-check-note')?.textContent ?? null; })()");
  check('paired-only keeps S001\'s pre-op and post-op films and hides the other three, saying so',
    same([...visible].sort(), [idOf('pre-op/S001.png'), idOf('post-op/S001.png')].sort()) && pairedNote === ' \u00B7 3 unpaired hidden', { visible, pairedNote });
  await cdp.click(pairedRect.cx, pairedRect.cy);
  await cdp.settle(100);
  const subjectRect = await cdp.rect('[data-param-key="subject"]');
  await cdp.click(subjectRect.cx, subjectRect.cy);
  await cdp.typeText('s00');
  await cdp.settle(150);
  visible = await rowIds();
  check('the subject box matches case-insensitively: s00 keeps all five', visible.length === 5, visible);
  await cdp.typeText('4');
  await cdp.settle(150);
  visible = await rowIds();
  check('s004 keeps only the film whose CSV subject is S004-CSV', same(visible, [idOf('S004_postop.png')]), visible);
  await cdp.evaluate("(() => { const e = document.querySelector('[data-param-key=\"subject\"]'); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await cdp.settle(100);

  // 7. The export, through the page's own toCsv over the fixture rows in grid order (the save
  // dialog is the human's): the header and the first row.
  const exported = await cdp.evaluate(`Promise.all([import('./renderer/store.js'), import('./renderer/data/csv.js'), import('./renderer/data/parameters.js')]).then(([st, csvm, pm]) => {
    const s = st.getState();
    const rows = pm.sortParameters(pm.filterParameters(s.studies.filter(${fixtureFilter}), s.paramFilters), s.paramSort);
    return csvm.toCsv(rows).split('\\r\\n');
  })`);
  check('the export\'s header carries Subject, Timepoint, Film date and Note after View, then the numbers, then Age, then Record ID', exported[3] === EXPORT_HEADER, exported[3]);
  // Sorted by name, the two S001 films tie and keep store order; the load front-inserted them in
  // scan order, so post-op/S001 (scanned before pre-op/) is first. Study ID is the film's stem
  // (2026-09-12) and the record id closes the row; the film date, the note, the ten measurement
  // columns, the fifteen disc-height columns and Age all read empty -- derived from
  // EXPORT_HEADER's own column count (2026-09-10) so this stays in step with the header above.
  const emptyCells = ','.repeat(EXPORT_HEADER.split(',').length - 4);
  check('the first row (post-op/S001, by name then store order) reads its name, view, subject and timepoint, empty numbers, then its record id',
    exported[4] === `S001,Standing lateral,S001,Post-op${emptyCells}${idOf('post-op/S001.png')}`, exported[4]);

  // 8. The drawer on Analysis for pre-op/S002: the Study group's cells, the datalists, a typed
  // timepoint that normalises, a date set on the date input.
  await cdp.setState(`{ screen: "analysis", openId: ${JSON.stringify(idOf('pre-op/S002.png'))}, selectedLevel: null, zoom: 1, panX: 0, panY: 0, panMode: false, editing: false, selection: null }`);
  await cdp.settle(200);
  const drawer = await cdp.evaluate(`(() => {
    const d = document.querySelector('.clinical-data');
    const cell = (field) => d?.querySelector('.clinical-cell[data-kind="study"][data-field="' + field + '"]');
    const read = (field) => { const e = cell(field); return e ? { value: e.value, type: e.type, list: e.getAttribute('list'), disabled: e.disabled } : null; };
    return {
      group: d?.querySelector('.clinical-grid-group .clinical-grid-group-study')?.textContent ?? null,
      heads: [...(d ? d.querySelectorAll('.clinical-grid-head .clinical-grid-cell') : [])].map((c) => (c.querySelector('span') ? c.querySelector('span').textContent : c.textContent)),
      subject: read('subjectId'), timepoint: read('timepoint'), filmDate: read('filmDate'), view: read('view'),
      timepoints: [...document.querySelectorAll('#clinical-timepoints option')].map((o) => o.value),
      views: [...document.querySelectorAll('#clinical-views option')].map((o) => o.value),
    };
  })()`);
  // state.fields may hold more than Age when another suite ran first on this instance; only the
  // Study group's position and Age's presence are pinned.
  check('the drawer shows the STUDY group over SUBJECT, TIMEPOINT, FILM DATE, VIEW, NOTE, then the fields including AGE',
    drawer.group === 'STUDY' && same(drawer.heads.slice(0, 6), ['STUDY', 'SUBJECT', 'TIMEPOINT', 'FILM DATE', 'VIEW', 'NOTE']) && drawer.heads.slice(6).includes('AGE'), drawer.heads);
  check('the cells hold the loaded values: S002, Pre-op, 2025-03-02 (a date input), Extension lateral',
    drawer.subject?.value === 'S002' && drawer.timepoint?.value === 'Pre-op' && drawer.filmDate?.value === '2025-03-02' && drawer.filmDate?.type === 'date' && drawer.view?.value === 'Extension lateral'
    && [drawer.subject, drawer.timepoint, drawer.filmDate, drawer.view].every((c) => c && c.disabled === false), drawer);
  check('Timepoint and View suggest from their datalists',
    drawer.timepoint?.list === 'clinical-timepoints' && drawer.view?.list === 'clinical-views'
    && same(drawer.timepoints, ['Pre-op', 'Intra-op', 'Post-op', '6 wk', '1 yr', '2 yr'])
    && same(drawer.views, ['Standing lateral', 'Supine lateral', 'Prone lateral', 'Flexion lateral', 'Extension lateral']), drawer);
  const S002 = idOf('pre-op/S002.png');
  await cdp.evaluate("(() => { const e = document.querySelector('.clinical-cell[data-kind=\"study\"][data-field=\"timepoint\"]'); e.focus(); e.select(); })()");
  await cdp.typeText('6 weeks');
  await cdp.key('Tab');
  const timepointCommitted = await waitForState(`(s.studies.find((x) => x.id === ${JSON.stringify(S002)}) || {}).timepoint === '6 wk'`, 3000);
  check('a typed `6 weeks` commits as the label 6 wk on the record', timepointCommitted === true, await store(`s.studies.find((x) => x.id === ${JSON.stringify(S002)})?.timepoint`));
  await cdp.evaluate("(() => { const e = document.querySelector('.clinical-cell[data-kind=\"study\"][data-field=\"filmDate\"]'); e.value = '2025-04-01'; e.dispatchEvent(new Event('change', { bubbles: true })); })()");
  const dateCommitted = await waitForState(`(s.studies.find((x) => x.id === ${JSON.stringify(S002)}) || {}).filmDate === '2025-04-01'`, 3000);
  check('a date set on the FILM DATE input commits as YYYY-MM-DD', dateCommitted === true, await store(`s.studies.find((x) => x.id === ${JSON.stringify(S002)})?.filmDate`));
  // cdp-lib's key() knows no Backspace; clear the cell the way the date was set -- value, then change.
  await cdp.evaluate("(() => { const e = document.querySelector('.clinical-cell[data-kind=\"study\"][data-field=\"view\"]'); e.value = ''; e.dispatchEvent(new Event('change', { bubbles: true })); })()");
  const viewCleared = await waitForState(`(s.studies.find((x) => x.id === ${JSON.stringify(S002)}) || {}).view === ''`, 3000);
  check('a cleared VIEW cell stores an empty string, never null', viewCleared === true, await store(`s.studies.find((x) => x.id === ${JSON.stringify(S002)})?.view`));
  const cellAfter = await cdp.evaluate("(() => { const e = document.querySelector('.clinical-cell[data-kind=\"study\"][data-field=\"timepoint\"]'); return e ? e.value : null; })()");
  check('the TIMEPOINT cell shows the committed label', cellAfter === '6 wk', cellAfter);

  // 9. Import from CSV on S002 rewrites the row's structural values (the timepoint back to Pre-op).
  const importRect = await rectBy("() => document.querySelector('.clinical-import')");
  check('Import from CSV has layout and is enabled', Boolean(importRect) && (await cdp.evaluate("document.querySelector('.clinical-import')?.disabled")) === false, importRect);
  await cdp.click(importRect.cx, importRect.cy);
  await cdp.settle(200);
  s = await cdp.state();
  const S002after = s.studies.find((x) => x.id === S002);
  check('the import toast counts 1 field and 2 study details, and the record reads Pre-op and 2025-03-02 again',
    s.toast === 'Imported 1 field and 2 study details from CSV' && S002after?.timepoint === 'Pre-op' && S002after?.filmDate === '2025-03-02' && S002after?.clinical?.Age === '58', { toast: s.toast, record: S002after });

  // 10. Console.
  check('no console errors or exceptions during the run', cdp.errors.length === errorsAtStart, cdp.errors.slice(errorsAtStart));
} finally {
  // Remove the fixture records (the saver writes the new list), clear the workspace and grid
  // state, and put back the clinical field list the load added Age to.
  const restoreFields = fieldsAtStart === null ? '' : `fields: ${JSON.stringify(fieldsAtStart)}, `;
  await cdp.setState(`(s) => ({ studies: s.studies.filter((x) => !(${fixtureFilter})(x)), openId: null, screen: "studies", ${restoreFields}...${RESET_WS}, ...${RESET_PARAMS} })`).catch(() => {});
  cdp.close();
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${JSON.stringify(r.detail)}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
