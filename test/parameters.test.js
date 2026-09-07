import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HAND_ADDED, DEFAULT_FILTERS, DEFAULT_SORT, CORE_COLUMNS, LEVEL_COLUMNS, measurementColumns,
  parameterValues, formatParameter, isSegmented, workspaceOptions, folderOptions, normaliseFilters,
  patchFilters, filterParameters, hiddenUnsegmented, sortParameters, emptyReason, exportFileName,
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
    { workspace: ROOT, folder: 'pre-op', segmentedOnly: false });
  assert.deepEqual(normaliseFilters(undefined, LIBRARY), { ...DEFAULT_FILTERS });
});

test('patchFilters merges a folder pick over a STALE stored workspace without losing the folder', () => {
  // The bug this exists for: patching the raw stored object writes { workspace: <gone>, folder },
  // and normaliseFilters then clears the folder along with the dead workspace, so the pick is
  // silently swallowed. Normalising FIRST means the patch is merged over what the user can see.
  assert.deepEqual(patchFilters({ workspace: 'C:\\gone', folder: null, segmentedOnly: true }, LIBRARY, { folder: 'pre-op' }),
    { workspace: null, folder: 'pre-op', segmentedOnly: true });
});

test('patchFilters lets a workspace patch win over any stored value', () => {
  assert.deepEqual(patchFilters({ workspace: 'C:\\gone', folder: 'pre-op' }, LIBRARY, { workspace: ROOT, folder: null }),
    { ...DEFAULT_FILTERS, workspace: ROOT });
  assert.deepEqual(patchFilters({ workspace: HAND_ADDED, folder: 'loose', segmentedOnly: false }, LIBRARY, { workspace: ROOT, folder: null }),
    { workspace: ROOT, folder: null, segmentedOnly: false });
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
