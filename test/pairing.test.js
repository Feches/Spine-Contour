import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairStudies, postFromFilters, pairedExportMessage } from '../renderer/data/pairing.js';
import { ANY_POST } from '../renderer/data/parameters.js';

function film(id, subjectId, timepoint, overrides = {}) {
  return {
    id, source: 'real', filePath: `C:\\films\\${id}.png`, fileName: `${id}.png`, name: null,
    workspaceFolder: 'C:\\films', addedAt: '2026-09-01T00:00:00.000Z', view: 'Standing lateral', thumbnail: null,
    subjectId, timepoint, filmDate: null,
    measurements: null, geometry: null, qc: null, clinical: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// pairStudies
// ---------------------------------------------------------------------------

test('pairStudies under All paired gives one row per subject with a Pre-op film and a later film, visits in §7.2 order, subjects in first-appearance order', () => {
  const rows = [
    film('SP-1', 'S002', 'Pre-op'), film('SP-2', 'S001', 'Pre-op'), film('SP-3', 'S001', '1 yr'),
    film('SP-4', 'S001', 'Post-op'), film('SP-5', 'S002', '1 yr'),
  ];
  const pairing = pairStudies(rows, { post: ANY_POST });
  assert.deepEqual(pairing.visits, ['Post-op', '1 yr']);
  assert.equal(pairing.post, null);
  assert.deepEqual(pairing.subjects.map((s) => s.subject), ['S002', 'S001']);
  const s001 = pairing.subjects[1];
  assert.equal(s001.key, 's001');
  assert.ok(s001.films instanceof Map);
  assert.deepEqual([...s001.films.keys()], ['Pre-op', 'Post-op', '1 yr']);
  assert.equal(s001.films.get('Post-op').id, 'SP-4');
  const s002 = pairing.subjects[0];
  assert.deepEqual([...s002.films.keys()], ['Pre-op', '1 yr']);
  assert.equal(s002.films.has('Post-op'), false);
  assert.deepEqual(pairing.unpaired, []);
  assert.deepEqual(pairing.ambiguous, []);
  assert.equal(pairing.noSubject, 0);
  assert.equal(pairing.noTimepoint, 0);
  assert.deepEqual(pairing.otherVisits, { count: 0, labels: [] });
});

test('pairStudies defaults to All paired when no options are given', () => {
  const rows = [film('SP-1', 'S001', 'Pre-op'), film('SP-2', 'S001', '6 wk')];
  const pairing = pairStudies(rows);
  assert.equal(pairing.post, null);
  assert.deepEqual(pairing.visits, ['6 wk']);
  assert.deepEqual(pairing.subjects.map((s) => s.subject), ['S001']);
});

test('pairStudies reports a subject unpaired when it has no Pre-op film, or no film on any visit the file writes, and emits no column group for a label only unpaired subjects carry', () => {
  const rows = [
    film('SP-1', 'S001', 'Pre-op'),                                   // Pre-op only
    film('SP-2', 'S002', 'Post-op'),                                  // no Pre-op
    film('SP-3', 'S003', 'Pre-op'), film('SP-4', 'S003', null),       // Pre-op and an unlabelled film
    film('SP-5', 'S004', 'Pre-op'), film('SP-6', 'S004', '6 wk'),     // paired
  ];
  const pairing = pairStudies(rows);
  assert.deepEqual(pairing.subjects.map((s) => s.subject), ['S004']);
  assert.deepEqual(pairing.unpaired, ['S001', 'S002', 'S003']);
  assert.equal(pairing.noTimepoint, 1);
  // Post-op is carried only by S002, which is unpaired: no empty group for it.
  assert.deepEqual(pairing.visits, ['6 wk']);
});

test('pairStudies reports a subject ambiguous when a label the file writes is on two of its films, Pre-op included', () => {
  const rows = [
    film('SP-1', 'S001', 'Pre-op'), film('SP-2', 'S001', 'Pre-op'), film('SP-3', 'S001', 'Post-op'),
    film('SP-4', 'S002', 'Pre-op'), film('SP-5', 'S002', '6 wk'), film('SP-6', 'S002', '6 wk'), film('SP-7', 'S002', 'Post-op'),
  ];
  const pairing = pairStudies(rows);
  assert.deepEqual(pairing.subjects, []);
  assert.deepEqual(pairing.ambiguous, [
    { subject: 'S001', label: 'Pre-op', count: 2 },
    { subject: 'S002', label: '6 wk', count: 2 },
  ]);
  assert.deepEqual(pairing.unpaired, []);
  assert.deepEqual(pairing.visits, []);
});

test('pairStudies judges unpaired before ambiguous: two Pre-op films and no later film is unpaired', () => {
  const pairing = pairStudies([film('SP-1', 'S001', 'Pre-op'), film('SP-2', 'S001', 'Pre-op')]);
  assert.deepEqual(pairing.unpaired, ['S001']);
  assert.deepEqual(pairing.ambiguous, []);
});

test('pairStudies with a single label writes only that visit, ignores a duplicate on another label, and counts the films of other visits of written subjects only', () => {
  const rows = [
    film('SP-1', 'S001', 'Pre-op'), film('SP-2', 'S001', 'Post-op'), film('SP-3', 'S001', '6 wk'), film('SP-4', 'S001', '6 wk'), film('SP-5', 'S001', '1 yr'),
    film('SP-6', 'S002', 'Pre-op'), film('SP-7', 'S002', '6 wk'),
  ];
  const pairing = pairStudies(rows, { post: 'Post-op' });
  assert.equal(pairing.post, 'Post-op');
  assert.deepEqual(pairing.visits, ['Post-op']);
  assert.deepEqual(pairing.subjects.map((s) => s.subject), ['S001']);
  assert.deepEqual([...pairing.subjects[0].films.keys()], ['Pre-op', 'Post-op']);
  assert.deepEqual(pairing.ambiguous, []);
  assert.deepEqual(pairing.unpaired, ['S002']);
  // S001's two 6 wk films and its 1 yr film; S002's 6 wk film is covered by the unpaired clause.
  assert.deepEqual(pairing.otherVisits, { count: 3, labels: ['6 wk', '1 yr'] });
});

test('pairStudies with a single label no subject carries has no visits and no rows', () => {
  const pairing = pairStudies([film('SP-1', 'S001', 'Pre-op'), film('SP-2', 'S001', '6 wk')], { post: 'Post-op' });
  assert.deepEqual(pairing.visits, []);
  assert.deepEqual(pairing.subjects, []);
  assert.deepEqual(pairing.unpaired, ['S001']);
  assert.deepEqual(pairing.otherVisits, { count: 0, labels: [] });
});

test('pairStudies counts films with no subject, counts films with a subject and no timepoint whichever subject they belong to, and drops demo rows before anything', () => {
  const rows = [
    film('SP-1', null, 'Pre-op'), film('SP-2', '  ', 'Post-op'),
    film('SP-3', 'S001', 'Pre-op'), film('SP-4', 'S001', 'Post-op'), film('SP-5', 'S001', null),
    film('SP-6', 'S002', null),
    film('SP-0042', 'P-8841', 'Pre-op', { source: 'demo' }), film('SP-0039', 'P-8841', 'Post-op', { source: 'demo' }),
    film('SP-0040', null, null, { source: 'demo' }),
  ];
  const pairing = pairStudies(rows);
  assert.equal(pairing.noSubject, 2);
  assert.equal(pairing.noTimepoint, 2);
  assert.deepEqual(pairing.subjects.map((s) => s.subject), ['S001']);
  assert.deepEqual(pairing.unpaired, ['S002']);
});

test('pairStudies groups subjects case-insensitively after trimming and shows the first spelling seen', () => {
  const pairing = pairStudies([film('SP-1', ' S001 ', 'Pre-op'), film('SP-2', 's001', 'Post-op')]);
  assert.deepEqual(pairing.subjects.map((s) => s.subject), ['S001']);
  assert.equal(pairing.subjects[0].key, 's001');
  assert.equal(pairing.subjects[0].films.get('Post-op').id, 'SP-2');
});

test('pairStudies treats Intra-op as a later visit and orders visits Intra-op, Post-op, durations by length, then custom labels', () => {
  const rows = [
    film('SP-1', 'S001', 'Pre-op'), film('SP-2', 'S001', 'Final'), film('SP-3', 'S001', '2 yr'), film('SP-4', 'S001', 'Intra-op'),
    film('SP-5', 'S002', 'Pre-op'), film('SP-6', 'S002', '6 wk'), film('SP-7', 'S002', 'Post-op'),
  ];
  const pairing = pairStudies(rows);
  assert.deepEqual(pairing.visits, ['Intra-op', 'Post-op', '6 wk', '2 yr', 'Final']);
  assert.deepEqual([...pairing.subjects[0].films.keys()], ['Pre-op', 'Intra-op', '2 yr', 'Final']);
});

test('pairStudies leaves its input alone and handles an empty or absent list', () => {
  const rows = [film('SP-1', 'S001', 'Pre-op'), film('SP-2', 'S001', 'Post-op')];
  const copy = JSON.parse(JSON.stringify(rows));
  pairStudies(rows);
  assert.deepEqual(rows, copy);
  assert.deepEqual(pairStudies([]).subjects, []);
  assert.deepEqual(pairStudies([]).visits, []);
  assert.deepEqual(pairStudies(undefined).subjects, []);
});

// ---------------------------------------------------------------------------
// postFromFilters
// ---------------------------------------------------------------------------

test('postFromFilters is the with label only while Paired only is ticked, else All paired', () => {
  assert.equal(postFromFilters({ pairedOnly: true, pairedWith: 'Post-op' }), 'Post-op');
  assert.equal(postFromFilters({ pairedOnly: true, pairedWith: ANY_POST }), ANY_POST);
  assert.equal(postFromFilters({ pairedOnly: false, pairedWith: 'Post-op' }), ANY_POST);
  assert.equal(postFromFilters({ pairedOnly: true, pairedWith: '' }), ANY_POST);
  assert.equal(postFromFilters({}), ANY_POST);
  assert.equal(postFromFilters(null), ANY_POST);
});

// ---------------------------------------------------------------------------
// pairedExportMessage
// ---------------------------------------------------------------------------

test('pairedExportMessage says what was written and adds one clause per thing left out, only when nonzero', () => {
  const clean = { subjects: [{}, {}], unpaired: [], ambiguous: [], noSubject: 0, noTimepoint: 0, otherVisits: { count: 0, labels: [] } };
  assert.equal(pairedExportMessage(clean, 'C:\\out\\Fusion2025-paired.csv'), 'Exported 2 subjects to C:\\out\\Fusion2025-paired.csv');
  assert.equal(pairedExportMessage({ ...clean, subjects: [{}] }, 'x.csv'), 'Exported 1 subject to x.csv');
  const full = {
    subjects: Array(12).fill({}),
    unpaired: ['S007', 'S012', 'S020'],
    ambiguous: [{ subject: 'S003', label: '6 wk', count: 2 }],
    noSubject: 2, noTimepoint: 1, otherVisits: { count: 0, labels: [] },
  };
  assert.equal(pairedExportMessage(full, 'C:\\…\\Fusion2025-paired.csv'),
    'Exported 12 subjects to C:\\…\\Fusion2025-paired.csv \u00B7 3 unpaired (S007, S012, S020) \u00B7 1 ambiguous (two 6 wk films: S003) \u00B7 2 films with no subject \u00B7 1 film with no timepoint');
  const single = { ...clean, subjects: Array(12).fill({}), unpaired: ['S007', 'S012', 'S020'], otherVisits: { count: 4, labels: ['6 wk', '1 yr'] } };
  assert.equal(pairedExportMessage(single, 'C:\\…\\Fusion2025-paired.csv'),
    'Exported 12 subjects to C:\\…\\Fusion2025-paired.csv \u00B7 3 unpaired (S007, S012, S020) \u00B7 4 films of other visits not written (6 wk, 1 yr)');
  const one = { ...clean, subjects: [{}], noSubject: 1, noTimepoint: 1, otherVisits: { count: 1, labels: ['1 yr'] } };
  assert.equal(pairedExportMessage(one, 'x.csv'),
    'Exported 1 subject to x.csv \u00B7 1 film with no subject \u00B7 1 film with no timepoint \u00B7 1 film of other visits not written (1 yr)');
});

test('pairedExportMessage names at most five subjects per clause, then an ellipsis, and groups ambiguous subjects by the label and count they duplicated', () => {
  const pairing = {
    subjects: [], unpaired: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'],
    ambiguous: [
      { subject: 'S003', label: 'Pre-op', count: 2 }, { subject: 'S009', label: '6 wk', count: 2 },
      { subject: 'S010', label: 'Pre-op', count: 3 }, { subject: 'S011', label: 'Pre-op', count: 2 },
      { subject: 'S012', label: 'Post-op', count: 2 }, { subject: 'S013', label: 'Post-op', count: 2 },
    ],
    noSubject: 0, noTimepoint: 0, otherVisits: { count: 0, labels: [] },
  };
  assert.equal(pairedExportMessage(pairing, 'x.csv'),
    'Exported 0 subjects to x.csv \u00B7 7 unpaired (S1, S2, S3, S4, S5, \u2026) \u00B7 6 ambiguous (two Pre-op films: S003, S011; two 6 wk films: S009; three Pre-op films: S010; two Post-op films: S012, \u2026)');
  const five = { ...pairing, unpaired: ['S1', 'S2', 'S3', 'S4', 'S5'], ambiguous: [] };
  assert.equal(pairedExportMessage(five, 'x.csv'), 'Exported 0 subjects to x.csv \u00B7 5 unpaired (S1, S2, S3, S4, S5)');
});
