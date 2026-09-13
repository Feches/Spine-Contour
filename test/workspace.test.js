import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkspaceStudies, workspaceLoadedFields, workspaceLoadedMessage } from '../renderer/screens/workspace.js';

// A persisted real record, the shape validate() returns (renderer/data/persistence.js).
function real(id, filePath, clinical = {}, extra = {}) {
  return {
    id, source: 'real', filePath, fileName: filePath.split(/[\\/]/).pop(),
    addedAt: '2026-08-21T12:00:00.000Z', view: 'Standing lateral', thumbnail: null,
    subjectId: null, timepoint: null, filmDate: null,
    measurements: null, geometry: null, qc: null, clinical, ...extra,
  };
}

const DEMO = { id: 'SP-0042', source: 'demo', view: 'Standing lateral', clinical: {} };

function baseState(overrides) {
  return {
    studies: [], wsFolder: 'C:\\films', wsFiles: [],
    wsCsv: null, wsCsvHeaders: [], wsCsvRows: [], wsMapping: [],
    ...overrides,
  };
}

test('loadWorkspaceStudies front-inserts new films in scan order with consecutive ids from nextId', () => {
  const old = real('SP-1002', 'C:\\films\\old.png');
  const state = baseState({
    studies: [old, DEMO],
    wsFiles: ['C:\\films\\a.png', 'C:\\films\\b.PNG', 'C:\\films\\batch\\c.jpg'],
  });
  const result = loadWorkspaceStudies(state);
  assert.equal(result.added, 3);
  assert.equal(result.known, 0);
  assert.equal(result.updated, 0);
  assert.equal(result.join, null);
  assert.equal(result.studies.length, 5);
  assert.notEqual(result.studies, state.studies);
  assert.deepEqual(result.studies.slice(0, 3).map((s) => s.id), ['SP-1003', 'SP-1004', 'SP-1005']);
  assert.deepEqual(result.studies.slice(0, 3).map((s) => s.fileName), ['a.png', 'b.PNG', 'c.jpg']);
  assert.equal(result.studies[2].filePath, 'C:\\films\\batch\\c.jpg');
  assert.equal(result.studies[0].source, 'real');
  assert.equal(result.studies[0].measurements, null);
  assert.equal(result.studies[3], old);
  assert.equal(result.studies[4], DEMO);
});

test('loadWorkspaceStudies skips films already in the library, matching filePath case-insensitively, and counts them', () => {
  // K is stored, so the load has no blank subject to fill and the record comes back by reference.
  const known = real('SP-1000', 'C:\\Films\\A.PNG', {}, { subjectId: 'K' });
  const state = baseState({
    studies: [known, DEMO],
    wsFiles: ['c:\\films\\a.png', 'C:\\films\\b.png'],
  });
  const result = loadWorkspaceStudies(state);
  assert.equal(result.added, 1);
  assert.equal(result.known, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.studies.length, 3);
  assert.equal(result.studies[0].id, 'SP-1001');
  assert.equal(result.studies[0].filePath, 'C:\\films\\b.png');
  assert.equal(result.studies[1], known);
  assert.equal(result.studies[2], DEMO);
});

test('loadWorkspaceStudies fills only the blank clinical keys of a known record and never overwrites', () => {
  // `a` already carries Age (typed in the drawer) and an emptied Sex. The CSV row has both,
  // plus BMI. Load must fill Sex and BMI, leave Age alone, and replace the record with a NEW
  // object; `b` has nothing to fill and must come back by reference, uncounted.
  const a = real('SP-1000', 'C:\\films\\a.png', { Notes: 'keep me', Age: '61', Sex: '' });
  const b = real('SP-1002', 'C:\\films\\b.png', { Age: '44' }, { subjectId: 'B' });
  const other = real('SP-1001', 'C:\\films\\other.png');
  const state = baseState({
    studies: [other, a, b, DEMO],
    wsFiles: ['C:\\films\\a.png', 'C:\\films\\b.png'],
    wsCsv: 'C:\\films\\clinical.csv',
    wsCsvHeaders: ['study_id', 'age_yrs', 'sex', 'bmi'],
    wsCsvRows: [
      { study_id: 'A', age_yrs: '58', sex: 'F', bmi: '27' },
      { study_id: 'b', age_yrs: '30', sex: '', bmi: '' },
    ],
    wsMapping: [{ src: 'study_id', dest: null }, { src: 'age_yrs', dest: 'Age' },
      { src: 'sex', dest: 'Sex' }, { src: 'bmi', dest: 'BMI' }],
  });
  const result = loadWorkspaceStudies(state);
  assert.equal(result.added, 0);
  assert.equal(result.known, 2);
  // Only `a` had something to fill; `b`'s single CSV key (Age) is already set on the record.
  assert.equal(result.updated, 1);
  assert.equal(result.clinicalUpdated, 1);
  assert.equal(result.join.matched, 2);
  assert.equal(result.studies.length, 4);
  const merged = result.studies[1];
  assert.notEqual(merged, a);
  // (a) absent and empty keys are filled; (b) the existing Age is NOT overwritten by the CSV's 58.
  assert.deepEqual(merged.clinical, { Notes: 'keep me', Age: '61', Sex: 'F', BMI: '27' });
  assert.deepEqual(a.clinical, { Notes: 'keep me', Age: '61', Sex: '' });
  // The stem `a` fills the record's blank subject on the same new object; the original is untouched.
  assert.equal(merged.subjectId, 'a');
  assert.equal(a.subjectId, null);
  // (c) nothing to fill -> the same object, and no `updated` count for it.
  assert.equal(result.studies[2], b);
  assert.equal(result.studies[0], other);
  assert.equal(result.studies[3], DEMO);
});

test('loadWorkspaceStudies attaches {} without a CSV, and the matched row values with one', () => {
  const files = ['C:\\films\\a.png', 'C:\\films\\b.png'];
  const noCsv = loadWorkspaceStudies(baseState({ wsFiles: files }));
  assert.equal(noCsv.join, null);
  assert.deepEqual(noCsv.studies.map((s) => s.clinical), [{}, {}]);
  const withCsv = loadWorkspaceStudies(baseState({
    wsFiles: files,
    wsCsv: 'C:\\films\\clinical.csv',
    wsCsvHeaders: ['study_id', 'age_yrs'],
    wsCsvRows: [{ study_id: 'a', age_yrs: '58' }],
    wsMapping: [{ src: 'study_id', dest: null }, { src: 'age_yrs', dest: 'Age' }],
  }));
  assert.equal(withCsv.join.matched, 1);
  assert.equal(withCsv.join.unmatched, 0);
  assert.deepEqual(withCsv.studies.map((s) => s.clinical), [{ Age: '58' }, {}]);
  assert.notEqual(withCsv.studies[0].clinical, withCsv.studies[1].clinical);
});


// The load's own studies are what seed the drawer's columns, so this pins the list the
// Workspace must commit alongside them. Before the fix `fields` was left untouched by the
// load and the drawer read NO FIELDS over values already written to the record and to disk.
test('workspaceLoadedFields seeds the keys the load wrote, in KNOWN_FIELDS order', () => {
  const state = baseState({
    wsFiles: ['C:\\films\\a.png', 'C:\\films\\b.png'],
    wsCsv: 'C:\\films\\clinical.csv',
    wsCsvHeaders: ['study_id', 'age_yrs', 'tx_plan', 'sex'],
    wsCsvRows: [{ study_id: 'a', age_yrs: '58', tx_plan: 'Fusion', sex: 'F' },
      { study_id: 'b', age_yrs: '61', tx_plan: '', sex: 'M' }],
    wsMapping: [{ src: 'study_id', dest: null }, { src: 'age_yrs', dest: 'Age' },
      { src: 'tx_plan', dest: 'Treatment plan' }, { src: 'sex', dest: 'Sex' }],
  });
  const result = loadWorkspaceStudies(state);
  // The values really are on the records -- the columns below are not invented.
  assert.deepEqual(result.studies[0].clinical, { Age: '58', 'Treatment plan': 'Fusion', Sex: 'F' });
  assert.deepEqual(workspaceLoadedFields([], result.studies), ['Age', 'Sex', 'Treatment plan']);
});

test('workspaceLoadedFields keeps the session order and appends only what is missing', () => {
  const studies = [
    real('SP-1000', 'C:\\films\\a.png', { Age: '58', Notes: 'seen 2026-08' }),
    real('SP-1001', 'C:\\films\\b.png', { Sex: 'F' }),
    DEMO,
  ];
  // An existing column keeps its place even when it is not first in KNOWN_FIELDS order, a
  // hidden-then-reloaded column comes back, and a custom key is appended after the known ones.
  assert.deepEqual(workspaceLoadedFields(['Notes', 'ODI'], studies), ['Notes', 'ODI', 'Age', 'Sex']);
  assert.deepEqual(workspaceLoadedFields([], studies), ['Age', 'Sex', 'Notes']);
  // Nothing to add: the same names come back, never duplicated.
  assert.deepEqual(workspaceLoadedFields(['Age', 'Sex', 'Notes'], studies), ['Age', 'Sex', 'Notes']);
});

test('workspaceLoadedFields adds nothing for a load with no clinical data', () => {
  const noCsv = loadWorkspaceStudies(baseState({ wsFiles: ['C:\\films\\a.png'] }));
  assert.deepEqual(workspaceLoadedFields([], noCsv.studies), []);
  assert.deepEqual(workspaceLoadedFields(['Notes'], noCsv.studies), ['Notes']);
});
test('workspaceLoadedMessage pluralises the added count', () => {
  assert.equal(workspaceLoadedMessage({ added: 1, known: 0, updated: 0, join: null, mapping: [] }),
    'Workspace loaded — 1 study added');
  assert.equal(workspaceLoadedMessage({ added: 3, known: 0, updated: 0, join: null, mapping: [] }),
    'Workspace loaded — 3 studies added');
  assert.equal(workspaceLoadedMessage({ added: 0, known: 0, updated: 0, join: null, mapping: [] }),
    'Workspace loaded — 0 studies added');
});

test('workspaceLoadedMessage reports films already in the library and clinical updates', () => {
  assert.equal(workspaceLoadedMessage({ added: 0, known: 4, updated: 0, join: null, mapping: [] }),
    'Workspace loaded — 0 studies added · 4 already in the library');
  assert.equal(workspaceLoadedMessage({ added: 1, known: 4, updated: 2, join: null, mapping: [] }),
    'Workspace loaded — 1 study added · 4 already in the library (blank fields filled for 2)');
});

test('workspaceLoadedMessage says when the CSV could not be linked or nothing was mapped', () => {
  const noJoin = { joinHeader: null, byFile: new Map(), matched: 0, unmatched: 3, duplicates: 0, ambiguous: 0 };
  assert.equal(workspaceLoadedMessage({ added: 2, known: 0, updated: 0, join: noJoin, mapping: [{ src: 'age', dest: 'Age' }] }),
    'Workspace loaded — 2 studies added · CSV has no study_id column — 3 rows not linked');
  const joined = { joinHeader: 'study_id', byFile: new Map(), matched: 2, unmatched: 0, duplicates: 0, ambiguous: 0 };
  const nothingMapped = [{ src: 'study_id', dest: null }, { src: 'age_yrs', dest: null }];
  assert.equal(workspaceLoadedMessage({ added: 2, known: 0, updated: 0, join: joined, mapping: nothingMapped }),
    'Workspace loaded — 2 studies added · no columns mapped');
});

test('workspaceLoadedMessage lists matched, unmatched, duplicate and ambiguous counts, omitting zeros', () => {
  const mapping = [{ src: 'study_id', dest: null }, { src: 'age_yrs', dest: 'Age' }];
  const full = { joinHeader: 'study_id', byFile: new Map(), matched: 2, unmatched: 1, duplicates: 1, ambiguous: 1 };
  assert.equal(workspaceLoadedMessage({ added: 4, known: 0, updated: 0, join: full, mapping }),
    'Workspace loaded — 4 studies added · clinical data linked (2 matched, 1 unmatched, 1 duplicate study_id, 1 ambiguous filename)');
  const clean = { joinHeader: 'study_id', byFile: new Map(), matched: 2, unmatched: 0, duplicates: 0, ambiguous: 0 };
  assert.equal(workspaceLoadedMessage({ added: 2, known: 0, updated: 0, join: clean, mapping }),
    'Workspace loaded — 2 studies added · clinical data linked (2 matched)');
});

// The re-Load: a user notices a wrong Age, fixes it in the CSV, re-picks it and presses Load.
// Load fills only blanks, so nothing is written -- and the old message said "clinical data
// linked (2 matched)", which describes a write that did not happen and offers no way forward.
test('workspaceLoadedMessage says nothing was written when a re-Load found no blank to fill', () => {
  const mapping = [{ src: 'study_id', dest: null }, { src: 'age_yrs', dest: 'Age' }];
  const join = { joinHeader: 'study_id', byFile: new Map(), matched: 2, unmatched: 0, duplicates: 0, ambiguous: 0 };
  assert.equal(workspaceLoadedMessage({ added: 0, known: 3, updated: 0, join, mapping }),
    'Workspace loaded — 0 studies added · 3 already in the library'
    + ' · CSV matched 2 rows; no blank clinical fields to fill (use Import from CSV to replace existing values)');
  // Only that exact combination changes. One field filled, and the load DID write: the linked
  // clause and its counts come back verbatim.
  assert.equal(workspaceLoadedMessage({ added: 0, known: 3, updated: 1, join, mapping }),
    'Workspace loaded — 0 studies added · 3 already in the library (blank fields filled for 1)'
    + ' · clinical data linked (2 matched)');
  // The upgrade path: a library that predates the study fields gets its subjects filled from
  // folder names and nothing clinical -- `updated` is 1, `clinicalUpdated` is 0, and the message
  // must still say that no clinical data was written.
  assert.equal(workspaceLoadedMessage({ added: 0, known: 3, updated: 1, clinicalUpdated: 0, join, mapping }),
    'Workspace loaded — 0 studies added · 3 already in the library (blank fields filled for 1)'
    + ' · CSV matched 2 rows; no blank clinical fields to fill (use Import from CSV to replace existing values)');
  // A new film was added, so the load wrote its row: unchanged as well.
  assert.equal(workspaceLoadedMessage({ added: 1, known: 3, updated: 0, join, mapping }),
    'Workspace loaded — 1 study added · 3 already in the library · clinical data linked (2 matched)');
  // Nothing matched at all, so there is no write to describe either way: the linked clause
  // keeps reporting the zero and the counts that explain it.
  const noneMatched = { joinHeader: 'study_id', byFile: new Map(), matched: 0, unmatched: 2, duplicates: 0, ambiguous: 1 };
  assert.equal(workspaceLoadedMessage({ added: 0, known: 3, updated: 0, join: noneMatched, mapping }),
    'Workspace loaded — 0 studies added · 3 already in the library'
    + ' · clinical data linked (0 matched, 2 unmatched, 1 ambiguous filename)');
});

// A single matching row must not read "1 rows" -- pins the singular alongside the plural case above.
test('workspaceLoadedMessage says "1 row" for a single CSV match with nothing to fill', () => {
  const mapping = [{ src: 'study_id', dest: null }, { src: 'age_yrs', dest: 'Age' }];
  const join = { joinHeader: 'study_id', byFile: new Map(), matched: 1, unmatched: 0, duplicates: 0, ambiguous: 0 };
  assert.equal(workspaceLoadedMessage({ added: 0, known: 3, updated: 0, join, mapping }),
    'Workspace loaded — 0 studies added · 3 already in the library'
    + ' · CSV matched 1 row; no blank clinical fields to fill (use Import from CSV to replace existing values)');
});

// ---------------------------------------------------------------------------
// Seeding the study fields on load (pre-op/post-op spec §8).

const WS = 'C:\\ws\\Fusion2025';
const at = (relative) => `${WS}\\${relative.replace(/\//g, '\\')}`;
const pick = (s) => ({ subjectId: s.subjectId, timepoint: s.timepoint, filmDate: s.filmDate, view: s.view });

test('loadWorkspaceStudies seeds subject, timepoint and view from the layout, and counts what it read', () => {
  const result = loadWorkspaceStudies(baseState({
    wsFolder: WS,
    wsFiles: [at('pre-op/S001.png'), at('post-op/S001.png'), at('flexion/S003.png'), at('S004_postop.png'), at('IMG_0001.png')],
  }));
  const by = (relative) => result.studies.find((s) => s.filePath === at(relative));
  assert.deepEqual(pick(by('pre-op/S001.png')), { subjectId: 'S001', timepoint: 'Pre-op', filmDate: null, view: 'Standing lateral' });
  assert.deepEqual(pick(by('post-op/S001.png')), { subjectId: 'S001', timepoint: 'Post-op', filmDate: null, view: 'Standing lateral' });
  assert.deepEqual(pick(by('flexion/S003.png')), { subjectId: 'S003', timepoint: null, filmDate: null, view: 'Flexion lateral' });
  assert.deepEqual(pick(by('S004_postop.png')), { subjectId: 'S004', timepoint: 'Post-op', filmDate: null, view: 'Standing lateral' });
  assert.deepEqual(pick(by('IMG_0001.png')), { subjectId: 'IMG_0001', timepoint: null, filmDate: null, view: 'Standing lateral' });
  assert.deepEqual(result.seeding, { fromFolders: 5, fromCsv: 0, noSubject: 0, noTimepoint: 2, badDates: 0 });
});

test('loadWorkspaceStudies applies the folder table: a user-set row beats the default, the film\'s own stem beats the row', () => {
  const result = loadWorkspaceStudies(baseState({
    wsFolder: WS,
    wsFiles: [at('pre-op/S001.png'), at('pre-op/S002_flexion.png'), at('S003.png')],
    wsFolderRows: [
      { folder: 'pre-op', count: 2, timepoint: 'Intra-op', view: 'Extension lateral' },
      { folder: '.', count: 1, timepoint: null, view: 'Standing lateral' },
    ],
  }));
  const by = (relative) => result.studies.find((s) => s.filePath === at(relative));
  assert.deepEqual(pick(by('pre-op/S001.png')), { subjectId: 'S001', timepoint: 'Intra-op', filmDate: null, view: 'Extension lateral' });
  assert.deepEqual(pick(by('pre-op/S002_flexion.png')), { subjectId: 'S002', timepoint: 'Intra-op', filmDate: null, view: 'Flexion lateral' });
  assert.deepEqual(pick(by('S003.png')), { subjectId: 'S003', timepoint: null, filmDate: null, view: 'Standing lateral' });
  assert.deepEqual(result.seeding, { fromFolders: 3, fromCsv: 0, noSubject: 0, noTimepoint: 1, badDates: 0 });
});

test('loadWorkspaceStudies fills a known record\'s blank study fields on a new object, never overwrites, and counts it', () => {
  const blank = real('SP-1000', at('pre-op/S001.png'));
  const full = real('SP-1001', at('flexion/S002.png'), {}, { subjectId: 'KEEP', timepoint: '6 wk', filmDate: '2020-01-01', view: 'Prone lateral' });
  const result = loadWorkspaceStudies(baseState({ studies: [blank, full, DEMO], wsFolder: WS, wsFiles: [at('pre-op/S001.png'), at('flexion/S002.png')] }));
  assert.equal(result.added, 0);
  assert.equal(result.known, 2);
  assert.equal(result.updated, 1);
  // A study field filled is not a clinical write.
  assert.equal(result.clinicalUpdated, 0);
  const filled = result.studies.find((s) => s.id === 'SP-1000');
  assert.notEqual(filled, blank);
  assert.deepEqual(pick(filled), { subjectId: 'S001', timepoint: 'Pre-op', filmDate: null, view: 'Standing lateral' });
  assert.deepEqual(pick(blank), { subjectId: null, timepoint: null, filmDate: null, view: 'Standing lateral' });
  // Everything stored stays, including a view the folder name contradicts, and the record is the same object.
  assert.equal(result.studies.find((s) => s.id === 'SP-1001'), full);
  assert.equal(result.studies[2], DEMO);
  assert.deepEqual(result.seeding, { fromFolders: 1, fromCsv: 0, noSubject: 0, noTimepoint: 0, badDates: 0 });
});

test('loadWorkspaceStudies takes the CSV\'s structural columns over the layout, never into clinical, and counts a bad date', () => {
  const headers = ['study_id', 'subject_id', 'timepoint', 'film_date', 'view', 'age_yrs'];
  const result = loadWorkspaceStudies(baseState({
    wsFolder: WS,
    wsFiles: [at('pre-op/S001.png'), at('post-op/S002.png')],
    wsCsv: 'C:\\ws\\clinical.csv', wsCsvHeaders: headers,
    wsCsvRows: [
      { study_id: 'S001', subject_id: 'P-1', timepoint: 'preop', film_date: '3/2/2025', view: 'Supine lateral', age_yrs: '58' },
      { study_id: 'S002', subject_id: '', timepoint: '', film_date: '2025-02-30', view: '', age_yrs: '' },
    ],
    wsMapping: [{ src: 'study_id', dest: null }, { src: 'subject_id', dest: null }, { src: 'timepoint', dest: null },
      { src: 'film_date', dest: null }, { src: 'view', dest: null }, { src: 'age_yrs', dest: 'Age' }],
  }));
  const by = (relative) => result.studies.find((s) => s.filePath === at(relative));
  assert.deepEqual(pick(by('pre-op/S001.png')), { subjectId: 'P-1', timepoint: 'Pre-op', filmDate: '2025-03-02', view: 'Supine lateral' });
  assert.deepEqual(by('pre-op/S001.png').clinical, { Age: '58' });
  // Blank CSV cells supply nothing: the layout fills in, and the rejected date is counted, not stored.
  assert.deepEqual(pick(by('post-op/S002.png')), { subjectId: 'S002', timepoint: 'Post-op', filmDate: null, view: 'Standing lateral' });
  assert.deepEqual(by('post-op/S002.png').clinical, {});
  assert.deepEqual(result.seeding, { fromFolders: 1, fromCsv: 1, noSubject: 0, noTimepoint: 0, badDates: 1 });
});

test('loadWorkspaceStudies reads the film date and note from a film\'s name, fills them on a known record, and never rewrites a stored subject', () => {
  const stale = real('SP-1000', at('sub225_post-op_11-5-2024.jpg'), {}, { subjectId: 'sub225_post-op_11-5-2024' });
  const fixed = real('SP-1001', at('sub226_post-op_5-31-2024.jpg'), {}, { subjectId: 'sub226', timepoint: '1 yr' });
  const result = loadWorkspaceStudies(baseState({
    studies: [stale, fixed],
    wsFolder: WS,
    wsFiles: [at('sub225_post-op_11-5-2024.jpg'), at('sub226_post-op_5-31-2024.jpg'), at('sub225_pre-op_10-23-2023_femoral heads.jpg')],
  }));
  const by = (relative) => result.studies.find((s) => s.filePath === at(relative));
  const fresh = by('sub225_pre-op_10-23-2023_femoral heads.jpg');
  assert.deepEqual({ ...pick(fresh), note: fresh.note },
    { subjectId: 'sub225', timepoint: 'Pre-op', filmDate: '2023-10-23', view: 'Standing lateral', note: 'femoral heads' });
  // The hand-set label stays; the blank date is filled from the name (fill-blanks, §8.3).
  assert.deepEqual(pick(by('sub226_post-op_5-31-2024.jpg')), { subjectId: 'sub226', timepoint: '1 yr', filmDate: '2024-05-31', view: 'Standing lateral' });
  // A subject the old parser stored as the whole stem is a stored value like any other: the load
  // fills the blanks beside it and leaves it (user decision 2026-09-11: such films are deleted
  // and added again rather than have a load rewrite a subject).
  assert.deepEqual(pick(by('sub225_post-op_11-5-2024.jpg')),
    { subjectId: 'sub225_post-op_11-5-2024', timepoint: 'Post-op', filmDate: '2024-11-05', view: 'Standing lateral' });
  assert.equal(result.added, 1);
  assert.equal(result.updated, 2);
  assert.deepEqual(result.seeding, { fromFolders: 3, fromCsv: 0, noSubject: 0, noTimepoint: 0, badDates: 0 });
});

test('workspaceLoadedMessage appends the §8.4 seeding clauses, each only when its count is non-zero', () => {
  const base = { added: 2, known: 0, updated: 0, join: null, mapping: [] };
  assert.equal(workspaceLoadedMessage({ ...base, seeding: { fromFolders: 2, fromCsv: 0, noSubject: 0, noTimepoint: 0, badDates: 0 } }),
    'Workspace loaded — 2 studies added · subject, timepoint, film date, view or note read from folder or file names for 2 films');
  assert.equal(workspaceLoadedMessage({ ...base, seeding: { fromFolders: 0, fromCsv: 1, noSubject: 1, noTimepoint: 2, badDates: 1 } }),
    'Workspace loaded — 2 studies added · subject, timepoint, film date or view set from the CSV for 1 film'
    + ' · 1 film has no subject · 2 films have no timepoint · 1 film date could not be read');
  assert.equal(workspaceLoadedMessage({ ...base, seeding: { fromFolders: 0, fromCsv: 0, noSubject: 0, noTimepoint: 0, badDates: 3 } }),
    'Workspace loaded — 2 studies added · 3 film dates could not be read');
  assert.equal(workspaceLoadedMessage({ ...base, seeding: { fromFolders: 0, fromCsv: 0, noSubject: 0, noTimepoint: 0, badDates: 0 } }),
    'Workspace loaded — 2 studies added');
  // No seeding record at all (an older caller): no clauses.
  assert.equal(workspaceLoadedMessage(base), 'Workspace loaded — 2 studies added');
});
