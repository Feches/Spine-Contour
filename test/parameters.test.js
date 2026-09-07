import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HAND_ADDED, NO_TIMEPOINT, ANY_POST, DEFAULT_FILTERS, DEFAULT_SORT, CORE_COLUMNS, LEVEL_COLUMNS, measurementColumns,
  parameterValues, formatParameter, isSegmented, workspaceOptions, folderOptions, normaliseFilters,
  patchFilters, filterParameters, hiddenUnsegmented, sortParameters, emptyReason, exportFileName,
  toggleId, withIds, selectedVisible, rowsToExport,
  subjectKey, timepointOptions, viewOptions, pairedWithOptions, pairedSubjects, hiddenUnpaired, subjectBreaks,
} from '../renderer/data/parameters.js';

const DASH = '\u2014';
const ROOT = 'C:\\films\\Fusion2025';

function measurements(PI, PT, SS, LL, extra = {}) {
  return { PI, PT, SS, LL: { 'L1-S1': LL, ...(extra.LL ?? {}) }, ...(extra.L1PA != null ? { L1PA: extra.L1PA } : {}) };
}

function study(overrides) {
  return {
    id: 'SP-1000', source: 'real', filePath: `${ROOT}\\pre-op\\a.png`, fileName: 'a.png', name: null,
    workspaceFolder: ROOT, addedAt: '2026-09-01T00:00:00.000Z', view: 'Standing lateral', thumbnail: null,
    subjectId: null, timepoint: null, filmDate: null,
    measurements: null, geometry: null, qc: null, clinical: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// columns and values
// ---------------------------------------------------------------------------

test('measurementColumns is the six core columns, or ten with the lordosis levels', () => {
  assert.deepEqual(CORE_COLUMNS.map((c) => c.key), ['PI', 'PT', 'SS', 'LL', 'PILL', 'L1PA']);
  assert.deepEqual(LEVEL_COLUMNS.map((c) => c.key), ['L2-S1', 'L3-S1', 'L4-S1', 'L5-S1']);
  assert.deepEqual(measurementColumns(false), CORE_COLUMNS);
  assert.deepEqual(measurementColumns(true), [...CORE_COLUMNS, ...LEVEL_COLUMNS]);
  // The labels are the measurement panel's names; PI–LL is a derived value and says so.
  assert.equal(CORE_COLUMNS.find((c) => c.key === 'LL').label, 'LL L1\u2013S1');
  assert.equal(CORE_COLUMNS.find((c) => c.key === 'PILL').label, 'PI\u2013LL');
});

test('parameterValues reads every column from the record, deriving PI-LL, and nulls what is absent', () => {
  const values = parameterValues(study({
    measurements: measurements(52.7, 14.6, 38.2, 47.1, { L1PA: 21.3, LL: { 'L2-S1': 40.0, 'L3-S1': 30.5 } }),
  }));
  assert.equal(values.PI, 52.7);
  assert.equal(values.PT, 14.6);
  assert.equal(values.SS, 38.2);
  assert.equal(values.LL, 47.1);
  assert.ok(Math.abs(values.PILL - (52.7 - 47.1)) < 1e-9);
  assert.equal(values.L1PA, 21.3);
  assert.equal(values['L2-S1'], 40.0);
  assert.equal(values['L3-S1'], 30.5);
  assert.equal(values['L4-S1'], null);
  assert.equal(values['L5-S1'], null);
});

test('parameterValues is all null for an unsegmented study, and never 0 for an absent value', () => {
  const values = parameterValues(study({ measurements: null }));
  for (const column of measurementColumns(true)) assert.equal(values[column.key], null);
  const noL1pa = parameterValues(study({ measurements: measurements(50, 10, 40, 45) }));
  assert.equal(noL1pa.L1PA, null);
  assert.notEqual(noL1pa.L1PA, 0);
});

test('formatParameter renders one decimal with a degree sign, an em dash for null, and 0 as 0.0°', () => {
  assert.equal(formatParameter(47.06), '47.1\u00B0');
  assert.equal(formatParameter(-0.4), '-0.4\u00B0');
  assert.equal(formatParameter(0), '0.0\u00B0');
  assert.equal(formatParameter(null), DASH);
  assert.equal(formatParameter(undefined), DASH);
});

test('isSegmented is whether the record carries measurements', () => {
  assert.equal(isSegmented(study({ measurements: null })), false);
  assert.equal(isSegmented(study({ measurements: measurements(50, 10, 40, 45) })), true);
});

// ---------------------------------------------------------------------------
// filter options
// ---------------------------------------------------------------------------

test('workspaceOptions lists each root once in first-seen order, labelled by its last segment, then Added by hand', () => {
  const studies = [
    study({ id: 'SP-1000', workspaceFolder: 'C:\\films\\Fusion2025' }),
    study({ id: 'SP-1001', workspaceFolder: 'D:\\CohortB' }),
    study({ id: 'SP-1002', workspaceFolder: 'C:\\films\\Fusion2025' }),
    study({ id: 'SP-1003', workspaceFolder: null, filePath: 'C:\\loose\\x.png' }),
  ];
  assert.deepEqual(workspaceOptions(studies), [
    { value: 'C:\\films\\Fusion2025', label: 'Fusion2025' },
    { value: 'D:\\CohortB', label: 'CohortB' },
    { value: HAND_ADDED, label: 'Added by hand' },
  ]);
});

test('workspaceOptions omits Added by hand when every study has a root, and labels colliding roots by their full path', () => {
  const studies = [
    study({ id: 'SP-1000', workspaceFolder: 'C:\\a\\pre-op' }),
    study({ id: 'SP-1001', workspaceFolder: 'C:\\b\\pre-op' }),
  ];
  assert.deepEqual(workspaceOptions(studies), [
    { value: 'C:\\a\\pre-op', label: 'C:\\a\\pre-op' },
    { value: 'C:\\b\\pre-op', label: 'C:\\b\\pre-op' },
  ]);
  assert.deepEqual(workspaceOptions([]), []);
});

test('folderOptions lists the distinct containing folders within the workspace filter and skips films with no path', () => {
  const studies = [
    study({ id: 'SP-1000', filePath: `${ROOT}\\pre-op\\a.png` }),
    study({ id: 'SP-1001', filePath: `${ROOT}\\post-op\\a.png` }),
    study({ id: 'SP-1002', filePath: `${ROOT}\\pre-op\\b.png` }),
    study({ id: 'SP-1003', workspaceFolder: null, filePath: 'C:\\loose\\x.png' }),
    study({ id: 'SP-0042', source: 'demo', workspaceFolder: undefined, filePath: null }),
  ];
  assert.deepEqual(folderOptions(studies, ROOT), [{ value: 'pre-op', label: 'pre-op' }, { value: 'post-op', label: 'post-op' }]);
  assert.deepEqual(folderOptions(studies, HAND_ADDED), [{ value: 'loose', label: 'loose' }]);
  assert.deepEqual(folderOptions(studies, null).map((o) => o.value), ['pre-op', 'post-op', 'loose']);
});

// ---------------------------------------------------------------------------
// filtering
// ---------------------------------------------------------------------------

const LIBRARY = [
  study({ id: 'SP-1000', filePath: `${ROOT}\\pre-op\\a.png`, measurements: measurements(52.7, 14.6, 38.2, 47.1) }),
  study({ id: 'SP-1001', filePath: `${ROOT}\\post-op\\a.png`, measurements: measurements(52.3, 14.0, 38.3, 49.1) }),
  study({ id: 'SP-1002', filePath: `${ROOT}\\pre-op\\b.png`, measurements: null }),
  study({ id: 'SP-1003', workspaceFolder: null, filePath: 'C:\\loose\\x.png', measurements: measurements(48.6, 5.9, 42.7, 49.0) }),
  study({ id: 'SP-0042', source: 'demo', workspaceFolder: undefined, filePath: null, measurements: measurements(41.0, 8.0, 33.0, 44.0) }),
];

test('filterParameters defaults to segmented studies only, across every workspace', () => {
  assert.deepEqual(filterParameters(LIBRARY, {}).map((s) => s.id), ['SP-1000', 'SP-1001', 'SP-1003', 'SP-0042']);
  assert.deepEqual(filterParameters(LIBRARY, DEFAULT_FILTERS).map((s) => s.id), ['SP-1000', 'SP-1001', 'SP-1003', 'SP-0042']);
});

test('filterParameters with segmentedOnly off shows every study', () => {
  assert.equal(filterParameters(LIBRARY, { segmentedOnly: false }).length, 5);
});

test('filterParameters narrows by workspace root, by Added by hand, and by folder, composing with AND', () => {
  assert.deepEqual(filterParameters(LIBRARY, { workspace: ROOT }).map((s) => s.id), ['SP-1000', 'SP-1001']);
  assert.deepEqual(filterParameters(LIBRARY, { workspace: ROOT, segmentedOnly: false }).map((s) => s.id), ['SP-1000', 'SP-1001', 'SP-1002']);
  assert.deepEqual(filterParameters(LIBRARY, { workspace: HAND_ADDED }).map((s) => s.id), ['SP-1003', 'SP-0042']);
  assert.deepEqual(filterParameters(LIBRARY, { workspace: ROOT, folder: 'pre-op' }).map((s) => s.id), ['SP-1000']);
  assert.deepEqual(filterParameters(LIBRARY, { workspace: ROOT, folder: 'pre-op', segmentedOnly: false }).map((s) => s.id), ['SP-1000', 'SP-1002']);
  assert.deepEqual(filterParameters(LIBRARY, { folder: 'loose' }).map((s) => s.id), ['SP-1003']);
});

test('filterParameters returns a new array and leaves the input alone', () => {
  const copy = [...LIBRARY];
  const out = filterParameters(LIBRARY, {});
  assert.notEqual(out, LIBRARY);
  assert.deepEqual(LIBRARY, copy);
});

test('hiddenUnsegmented counts the studies the segmented-only filter removes from the current workspace and folder', () => {
  assert.equal(hiddenUnsegmented(LIBRARY, {}), 1);
  assert.equal(hiddenUnsegmented(LIBRARY, { workspace: ROOT }), 1);
  assert.equal(hiddenUnsegmented(LIBRARY, { workspace: ROOT, folder: 'post-op' }), 0);
  assert.equal(hiddenUnsegmented(LIBRARY, { workspace: HAND_ADDED }), 0);
  assert.equal(hiddenUnsegmented(LIBRARY, { segmentedOnly: false }), 0);
});

test('normaliseFilters clears a workspace that no study carries any more, and its folder with it', () => {
  assert.deepEqual(normaliseFilters({ workspace: 'C:\\gone', folder: 'pre-op' }, LIBRARY), { ...DEFAULT_FILTERS });
  assert.deepEqual(normaliseFilters({ workspace: ROOT, folder: 'nowhere' }, LIBRARY), { ...DEFAULT_FILTERS, workspace: ROOT });
  assert.deepEqual(normaliseFilters({ workspace: ROOT, folder: 'pre-op', segmentedOnly: false }, LIBRARY),
    { ...DEFAULT_FILTERS, workspace: ROOT, folder: 'pre-op', segmentedOnly: false });
  assert.deepEqual(normaliseFilters(undefined, LIBRARY), { ...DEFAULT_FILTERS });
});

test('patchFilters merges a folder pick over a STALE stored workspace without losing the folder', () => {
  // The bug this exists for: patching the raw stored object writes { workspace: <gone>, folder },
  // and normaliseFilters then clears the folder along with the dead workspace, so the pick is
  // silently swallowed. Normalising FIRST means the patch is merged over what the user can see.
  assert.deepEqual(patchFilters({ workspace: 'C:\\gone', folder: null, segmentedOnly: true }, LIBRARY, { folder: 'pre-op' }),
    { ...DEFAULT_FILTERS, workspace: null, folder: 'pre-op', segmentedOnly: true });
});

test('patchFilters lets a workspace patch win over any stored value', () => {
  assert.deepEqual(patchFilters({ workspace: 'C:\\gone', folder: 'pre-op' }, LIBRARY, { workspace: ROOT, folder: null }),
    { ...DEFAULT_FILTERS, workspace: ROOT });
  assert.deepEqual(patchFilters({ workspace: HAND_ADDED, folder: 'loose', segmentedOnly: false }, LIBRARY, { workspace: ROOT, folder: null }),
    { ...DEFAULT_FILTERS, workspace: ROOT, folder: null, segmentedOnly: false });
});

test('patchFilters over absent stored filters is the defaults plus the patch', () => {
  assert.deepEqual(patchFilters(undefined, LIBRARY, { segmentedOnly: false }), { ...DEFAULT_FILTERS, segmentedOnly: false });
  assert.deepEqual(patchFilters(undefined, LIBRARY, {}), { ...DEFAULT_FILTERS });
});

test('patchFilters returns a new object and leaves the stored filters alone', () => {
  const stored = { workspace: 'C:\\gone', folder: 'pre-op', segmentedOnly: true };
  const before = { ...stored };
  const out = patchFilters(stored, LIBRARY, { folder: 'post-op' });
  assert.notEqual(out, stored);
  assert.deepEqual(stored, before);
});

// ---------------------------------------------------------------------------
// sorting
// ---------------------------------------------------------------------------

const NAMED = [
  study({ id: 'SP-1000', fileName: 'delta.png', measurements: measurements(52.7, 14.6, 38.2, 47.1) }),
  study({ id: 'SP-1001', fileName: 'alpha.png', measurements: null }),
  study({ id: 'SP-1002', fileName: 'Charlie.png', measurements: measurements(48.6, 5.9, 42.7, 49.0) }),
  study({ id: 'SP-1003', fileName: 'bravo.png', name: 'Zulu', measurements: measurements(41.0, 8.0, 33.0, 44.0) }),
];

test('sortParameters by study sorts on the display name, case-insensitively, in either direction', () => {
  assert.deepEqual(sortParameters(NAMED, { key: 'study', dir: 'asc' }).map((s) => s.id), ['SP-1001', 'SP-1002', 'SP-1000', 'SP-1003']);
  assert.deepEqual(sortParameters(NAMED, { key: 'study', dir: 'desc' }).map((s) => s.id), ['SP-1003', 'SP-1000', 'SP-1002', 'SP-1001']);
  assert.deepEqual(sortParameters(NAMED, DEFAULT_SORT).map((s) => s.id), ['SP-1001', 'SP-1002', 'SP-1000', 'SP-1003']);
});

test('sortParameters by a measurement puts absent values last in BOTH directions', () => {
  assert.deepEqual(sortParameters(NAMED, { key: 'PI', dir: 'asc' }).map((s) => s.id), ['SP-1003', 'SP-1002', 'SP-1000', 'SP-1001']);
  assert.deepEqual(sortParameters(NAMED, { key: 'PI', dir: 'desc' }).map((s) => s.id), ['SP-1000', 'SP-1002', 'SP-1003', 'SP-1001']);
  // PI-LL is derived, and sorts like any other column.
  assert.deepEqual(sortParameters(NAMED, { key: 'PILL', dir: 'asc' }).map((s) => s.id), ['SP-1003', 'SP-1002', 'SP-1000', 'SP-1001']);
});

test('sortParameters is stable: ties and all-absent keys keep the input order', () => {
  const tied = [
    study({ id: 'SP-1000', measurements: measurements(50, 10, 40, 45) }),
    study({ id: 'SP-1001', measurements: measurements(50, 11, 39, 45) }),
    study({ id: 'SP-1002', measurements: measurements(50, 12, 38, 45) }),
  ];
  assert.deepEqual(sortParameters(tied, { key: 'PI', dir: 'asc' }).map((s) => s.id), ['SP-1000', 'SP-1001', 'SP-1002']);
  assert.deepEqual(sortParameters(tied, { key: 'PI', dir: 'desc' }).map((s) => s.id), ['SP-1000', 'SP-1001', 'SP-1002']);
  assert.deepEqual(sortParameters(tied, { key: 'L1PA', dir: 'asc' }).map((s) => s.id), ['SP-1000', 'SP-1001', 'SP-1002']);
});

test('sortParameters by workspace orders by workspace label, then folder, then name', () => {
  const mixed = [
    study({ id: 'SP-1000', workspaceFolder: 'D:\\Zeta', filePath: 'D:\\Zeta\\a.png', fileName: 'a.png' }),
    study({ id: 'SP-1001', workspaceFolder: 'C:\\Alpha', filePath: 'C:\\Alpha\\post-op\\b.png', fileName: 'b.png' }),
    study({ id: 'SP-1002', workspaceFolder: 'C:\\Alpha', filePath: 'C:\\Alpha\\pre-op\\c.png', fileName: 'c.png' }),
    study({ id: 'SP-1003', workspaceFolder: 'C:\\Alpha', filePath: 'C:\\Alpha\\pre-op\\a.png', fileName: 'a.png' }),
    study({ id: 'SP-1004', workspaceFolder: null, filePath: 'C:\\loose\\x.png', fileName: 'x.png' }),
  ];
  // An em dash (U+2014) sorts after every letter, so hand-added films come last.
  assert.deepEqual(sortParameters(mixed, { key: 'workspace', dir: 'asc' }).map((s) => s.id), ['SP-1001', 'SP-1003', 'SP-1002', 'SP-1000', 'SP-1004']);
});

test('sortParameters returns a new array and does not reorder the input', () => {
  const copy = [...NAMED];
  const out = sortParameters(NAMED, { key: 'PI', dir: 'asc' });
  assert.notEqual(out, NAMED);
  assert.deepEqual(NAMED, copy);
});

// ---------------------------------------------------------------------------
// empty state and export filename
// ---------------------------------------------------------------------------

test('emptyReason is null while anything is visible', () => {
  assert.equal(emptyReason({ total: 3, visible: 1, filters: {}, query: '' }), null);
});

test('emptyReason blames the right thing: an empty library, nothing segmented, or a filter the user set', () => {
  assert.equal(emptyReason({ total: 0, visible: 0, filters: {}, query: '' }), 'none');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: {}, query: '' }), 'unsegmented');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: { workspace: ROOT }, query: '' }), 'filtered');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: { folder: 'pre-op' }, query: '' }), 'filtered');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: {}, query: 'zzz' }), 'filtered');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: {}, query: '   ' }), 'unsegmented');
});

test('exportFileName names the workspace, or the library when there is no single root', () => {
  assert.equal(exportFileName(null), 'library-parameters.csv');
  assert.equal(exportFileName(HAND_ADDED), 'library-parameters.csv');
  assert.equal(exportFileName('C:\\films\\Fusion2025'), 'Fusion2025-parameters.csv');
  assert.equal(exportFileName('/data/Fusion 2025 (v2)/'), 'Fusion-2025-v2-parameters.csv');
  assert.equal(exportFileName('/'), 'workspace-parameters.csv');
});

// ---------------------------------------------------------------------------
// selection
// ---------------------------------------------------------------------------

test('toggleId appends an absent id at the end and removes a present one, without mutating the input', () => {
  const selected = ['a', 'b'];

  const added = toggleId(selected, 'c');
  assert.deepEqual(added, ['a', 'b', 'c']);
  assert.notEqual(added, selected);
  assert.deepEqual(selected, ['a', 'b']); // input untouched

  const removed = toggleId(selected, 'b');
  assert.deepEqual(removed, ['a']);
  assert.notEqual(removed, selected);
  assert.deepEqual(selected, ['a', 'b']); // input still untouched
});

test('toggleId treats a null/undefined selection as empty', () => {
  assert.deepEqual(toggleId(undefined, 'a'), ['a']);
  assert.deepEqual(toggleId(null, 'a'), ['a']);
});

test('withIds "on" appends only the missing ids, in ids order, and is idempotent', () => {
  const selected = ['a', 'x'];

  const result = withIds(selected, ['x', 'b', 'c'], true);
  assert.deepEqual(result, ['a', 'x', 'b', 'c']); // 'x' already present, kept in place; 'b','c' appended in ids order
  assert.notEqual(result, selected);
  assert.deepEqual(selected, ['a', 'x']); // input untouched

  const again = withIds(result, ['x', 'b', 'c'], true);
  assert.deepEqual(again, result); // idempotent: nothing left to add
  assert.notEqual(again, result); // still a fresh array
});

test('withIds "on" adds a duplicated id in `ids` only once', () => {
  assert.deepEqual(withIds(['a'], ['b', 'b', 'c'], true), ['a', 'b', 'c']); // 'b' added once despite appearing twice
  assert.deepEqual(withIds(['b'], ['b', 'b'], true), ['b']); // already selected AND duplicated: not re-added
});

test('withIds "off" removes every listed id and leaves the rest, in their original order', () => {
  const selected = ['a', 'b', 'c', 'd'];

  const result = withIds(selected, ['b', 'd', 'z'], false); // 'z' is not selected; harmless
  assert.deepEqual(result, ['a', 'c']);
  assert.notEqual(result, selected);
  assert.deepEqual(selected, ['a', 'b', 'c', 'd']); // input untouched
});

test('withIds treats a null/undefined selection as empty', () => {
  assert.deepEqual(withIds(undefined, ['a', 'b'], true), ['a', 'b']);
  assert.deepEqual(withIds(null, ['a'], false), []);
});

test('selectedVisible returns the visible studies in VISIBLE order, not selection order', () => {
  const a = study({ id: 'a' });
  const b = study({ id: 'b' });
  const c = study({ id: 'c' });
  const visible = [a, b, c];

  const result = selectedVisible(visible, ['c', 'a']); // selection lists c before a
  assert.deepEqual(result, [a, c]); // visible order: a, then c
});

test('selectedVisible ignores ids no visible study carries', () => {
  const a = study({ id: 'a' });
  assert.deepEqual(selectedVisible([a], ['a', 'ghost']), [a]);
});

test('selectedVisible returns [] for a null/undefined selection', () => {
  const a = study({ id: 'a' });
  assert.deepEqual(selectedVisible([a], null), []);
  assert.deepEqual(selectedVisible([a], undefined), []);
});

test('rowsToExport returns selectedVisible when it is non-empty', () => {
  const a = study({ id: 'a' });
  const b = study({ id: 'b' });
  const visible = [a, b];

  assert.deepEqual(rowsToExport(visible, ['b']), [b]);
});

test('rowsToExport returns a new array equal to visible when nothing visible is selected', () => {
  const a = study({ id: 'a' });
  const b = study({ id: 'b' });
  const visible = [a, b];

  const result = rowsToExport(visible, []);
  assert.notEqual(result, visible); // a new array, not the same reference
  assert.deepEqual(result, visible); // same contents

  const stale = rowsToExport(visible, ['ghost']); // selected, but no visible match
  assert.notEqual(stale, visible);
  assert.deepEqual(stale, visible);
});

// ---------------------------------------------------------------------------
// task 2: subject, timepoint, view, paired-only (spec §10.3)

const S = (id, subjectId, timepoint, extra = {}) => study({
  id, subjectId, timepoint, fileName: `${id}.png`, filePath: `${ROOT}\\${id}.png`,
  measurements: measurements(50, 10, 40, 45), ...extra,
});
const COHORT = [
  S('SP-1000', 'S001', 'Pre-op', { filmDate: '2025-03-02', addedAt: '2026-09-01T00:00:00.000Z' }),
  S('SP-1001', 'S001', 'Post-op', { filmDate: '2025-09-14', addedAt: '2026-09-02T00:00:00.000Z' }),
  S('SP-1002', 's002', 'Pre-op', { view: 'Flexion lateral' }),
  S('SP-1003', 'S002', '1 yr'),
  S('SP-1004', null, null, { measurements: null }),
  S('SP-1005', 'S003', 'Pre-op', { workspaceFolder: null, filePath: 'C:\\loose\\SP-1005.png' }),
  S('SP-1006', 'S003', 'Post-op', { workspaceFolder: null, filePath: 'C:\\loose\\SP-1006.png' }),
  S('SP-1007', null, 'baseline', { view: '' }),
];

test('DEFAULT_FILTERS carries the four new filters at rest', () => {
  assert.deepEqual(DEFAULT_FILTERS, {
    workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, subject: '', pairedOnly: false, pairedWith: ANY_POST,
  });
  assert.equal(NO_TIMEPOINT, '__none__');
  assert.equal(ANY_POST, '__any__');
});

test('subjectKey is the trimmed lower-cased subject, or null', () => {
  assert.equal(subjectKey(study({ subjectId: ' S001 ' })), 's001');
  assert.equal(subjectKey(study({ subjectId: null })), null);
  assert.equal(subjectKey(study({ subjectId: '   ' })), null);
});

test('timepointOptions lists the labels present in §7.2 order, then No timepoint when any study lacks one', () => {
  assert.deepEqual(timepointOptions(COHORT), [
    { value: 'Pre-op', label: 'Pre-op' }, { value: 'Post-op', label: 'Post-op' }, { value: '1 yr', label: '1 yr' },
    { value: 'baseline', label: 'baseline' }, { value: NO_TIMEPOINT, label: 'No timepoint' },
  ]);
  assert.deepEqual(timepointOptions(COHORT.slice(0, 2)), [{ value: 'Pre-op', label: 'Pre-op' }, { value: 'Post-op', label: 'Post-op' }]);
  assert.deepEqual(timepointOptions([]), []);
});

test('viewOptions lists the distinct views present, first seen first, skipping a cleared view', () => {
  assert.deepEqual(viewOptions(COHORT), [{ value: 'Standing lateral', label: 'Standing lateral' }, { value: 'Flexion lateral', label: 'Flexion lateral' }]);
});

test('pairedWithOptions offers All paired first, then Post-op, then every other non-Pre-op label present in §7.2 order', () => {
  assert.deepEqual(pairedWithOptions([]), [{ value: ANY_POST, label: 'All paired' }, { value: 'Post-op', label: 'Post-op' }]);
  assert.deepEqual(pairedWithOptions(COHORT).map((o) => o.value), [ANY_POST, 'Post-op', '1 yr', 'baseline']);
});

test('pairedSubjects is the set of subject keys with a Pre-op film and a film with the chosen label', () => {
  assert.deepEqual([...pairedSubjects(COHORT, 'Post-op')].sort(), ['s001', 's003']);
  assert.deepEqual([...pairedSubjects(COHORT, '1 yr')], ['s002']);
  assert.deepEqual([...pairedSubjects(COHORT, 'baseline')], []);
  // All paired: every subject with a Pre-op film and any other labelled film.
  assert.deepEqual([...pairedSubjects(COHORT, ANY_POST)].sort(), ['s001', 's002', 's003']);
  // Subject keys compare case-insensitively: s002's Pre-op pairs with S002's 1 yr.
});

test('pairedSubjects never pairs a subject on an untimed film or on a second Pre-op film', () => {
  const untimed = [
    S('SP-3000', 'U1', 'Pre-op'),
    S('SP-3001', 'U1', null),
    S('SP-3002', 'U2', 'Pre-op'),
    S('SP-3003', 'U2', ''),
    S('SP-3004', 'U3', 'Pre-op'),
    S('SP-3005', 'U3', 'Pre-op'),
    S('SP-3006', 'U4', 'Pre-op'),
    S('SP-3007', 'U4', 'Post-op'),
  ];
  // A film with no timepoint is not a later film, and a second Pre-op film is not a pair: only U4 pairs.
  assert.deepEqual([...pairedSubjects(untimed, ANY_POST)], ['u4']);
  assert.deepEqual([...pairedSubjects(untimed, 'Post-op')], ['u4']);
  assert.deepEqual([...pairedSubjects(untimed, 'Pre-op')], []);
});

test('filterParameters narrows by timepoint, by No timepoint, by view and by subject substring', () => {
  const ids = (filters) => filterParameters(COHORT, filters).map((s) => s.id);
  assert.deepEqual(ids({ timepoint: 'Pre-op' }), ['SP-1000', 'SP-1002', 'SP-1005']);
  assert.deepEqual(ids({ timepoint: NO_TIMEPOINT, segmentedOnly: false }), ['SP-1004']);
  assert.deepEqual(ids({ view: 'Flexion lateral' }), ['SP-1002']);
  assert.deepEqual(ids({ subject: 's00' }), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003', 'SP-1005', 'SP-1006']);
  assert.deepEqual(ids({ subject: '  S002 ' }), ['SP-1002', 'SP-1003']);
  assert.deepEqual(ids({ subject: '' }), ids({}));
  // Composes with AND, and with the workspace filter.
  assert.deepEqual(ids({ workspace: ROOT, timepoint: 'Pre-op', subject: '2' }), ['SP-1002']);
});

test('filterParameters paired-only keeps paired subjects within the other filters, before the timepoint filter', () => {
  const ids = (filters) => filterParameters(COHORT, filters).map((s) => s.id);
  // The default pairs Pre-op with any later labelled film: S001 (Post-op), S002 (1 yr), S003 (Post-op).
  assert.deepEqual(ids({ pairedOnly: true }), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003', 'SP-1005', 'SP-1006']);
  assert.deepEqual(ids({ pairedOnly: true, pairedWith: 'Post-op' }), ['SP-1000', 'SP-1001', 'SP-1005', 'SP-1006']);
  assert.deepEqual(ids({ pairedOnly: true, pairedWith: '1 yr' }), ['SP-1002', 'SP-1003']);
  // Within a workspace: S003's pair is hand-added and drops out with the workspace filter.
  assert.deepEqual(ids({ pairedOnly: true, workspace: ROOT }), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003']);
  // Paired only + Pre-op is "the pre-op films of paired subjects", not nothing.
  assert.deepEqual(ids({ pairedOnly: true, timepoint: 'Pre-op' }), ['SP-1000', 'SP-1002', 'SP-1005']);
  // A missing pairedWith means All paired.
  assert.deepEqual(ids({ pairedOnly: true, pairedWith: null }), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003', 'SP-1005', 'SP-1006']);
});

test('hiddenUnpaired counts the rows the paired-only step removes, ignoring the timepoint filter', () => {
  assert.equal(hiddenUnpaired(COHORT, { pairedOnly: false }), 0);
  // Seven segmented rows; six are paired under All paired, four under Post-op, two under 1 yr.
  assert.equal(hiddenUnpaired(COHORT, { pairedOnly: true }), 1);
  assert.equal(hiddenUnpaired(COHORT, { pairedOnly: true, timepoint: 'Pre-op' }), 1);
  assert.equal(hiddenUnpaired(COHORT, { pairedOnly: true, pairedWith: 'Post-op' }), 3);
  assert.equal(hiddenUnpaired(COHORT, { pairedOnly: true, pairedWith: '1 yr' }), 5);
});

test('normaliseFilters clears a timepoint or view no study carries any more', () => {
  assert.deepEqual(normaliseFilters({ timepoint: '6 wk', view: 'Prone lateral' }, COHORT), { ...DEFAULT_FILTERS });
  assert.deepEqual(normaliseFilters({ timepoint: 'Pre-op', view: 'Flexion lateral', subject: 'x', pairedOnly: true, pairedWith: '1 yr' }, COHORT),
    { ...DEFAULT_FILTERS, timepoint: 'Pre-op', view: 'Flexion lateral', subject: 'x', pairedOnly: true, pairedWith: '1 yr' });
  assert.deepEqual(normaliseFilters({ timepoint: NO_TIMEPOINT }, COHORT), { ...DEFAULT_FILTERS, timepoint: NO_TIMEPOINT });
  assert.deepEqual(normaliseFilters({ timepoint: NO_TIMEPOINT }, COHORT.slice(0, 2)), { ...DEFAULT_FILTERS });
});

test('sortParameters by subject groups films by subject with no subject last in both directions, and Pre-op first inside a block', () => {
  const ids = (dir) => sortParameters(COHORT, { key: 'subject', dir }).map((s) => s.id);
  // s001 < s002 < s003, then the two with no subject in timepoint order (a label before none);
  // inside S001 Pre-op precedes Post-op, inside S002 Pre-op precedes 1 yr.
  assert.deepEqual(ids('asc'), ['SP-1000', 'SP-1001', 'SP-1002', 'SP-1003', 'SP-1005', 'SP-1006', 'SP-1007', 'SP-1004']);
  // Descending reverses the subject order only: a block still reads Pre-op first, no subject still last.
  assert.deepEqual(ids('desc'), ['SP-1005', 'SP-1006', 'SP-1002', 'SP-1003', 'SP-1000', 'SP-1001', 'SP-1007', 'SP-1004']);
  // Same timepoint: film date, then addedAt, break the tie.
  const twins = [
    S('SP-2000', 'T', 'Post-op', { filmDate: null, addedAt: '2026-09-03T00:00:00.000Z' }),
    S('SP-2001', 'T', 'Post-op', { filmDate: '2025-05-01', addedAt: '2026-09-04T00:00:00.000Z' }),
    S('SP-2002', 'T', 'Post-op', { filmDate: '2025-04-01', addedAt: '2026-09-05T00:00:00.000Z' }),
    S('SP-2003', 'T', 'Post-op', { filmDate: null, addedAt: '2026-09-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(sortParameters(twins, { key: 'subject', dir: 'asc' }).map((s) => s.id), ['SP-2002', 'SP-2001', 'SP-2003', 'SP-2000']);
});

test('subjectBreaks marks the first row of each new subject under the subject sort, and nothing otherwise', () => {
  const sorted = sortParameters(COHORT, { key: 'subject', dir: 'asc' });
  assert.deepEqual(subjectBreaks(sorted, { key: 'subject', dir: 'asc' }), [false, false, true, false, true, false, true, false]);
  assert.deepEqual(subjectBreaks(sorted, { key: 'study', dir: 'asc' }), sorted.map(() => false));
  assert.deepEqual(subjectBreaks([], { key: 'subject', dir: 'asc' }), []);
});

test('emptyReason blames a timepoint, view, subject or paired-only filter the user set', () => {
  assert.equal(emptyReason({ total: 2, visible: 0, filters: { timepoint: 'Pre-op' }, query: '' }), 'filtered');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: { view: 'Prone lateral' }, query: '' }), 'filtered');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: { subject: 'S0' }, query: '' }), 'filtered');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: { pairedOnly: true }, query: '' }), 'filtered');
  assert.equal(emptyReason({ total: 2, visible: 0, filters: { subject: '   ' }, query: '' }), 'unsegmented');
});
