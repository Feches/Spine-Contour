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
  assert.ok(s001.visits instanceof Map);
  assert.deepEqual([...s001.visits.keys()], ['Pre-op', 'Post-op', '1 yr']);
  // A visit: its header, its label, its date, its films (one here), the merged measurement values
  // in MEASUREMENT_COLUMNS order (25 columns, all empty for an unsegmented film) and no disagreements.
  const post = s001.visits.get('Post-op');
  assert.deepEqual(post.films.map((f) => f.id), ['SP-4']);
  assert.deepEqual({ header: post.header, label: post.label, filmDate: post.filmDate, disagreements: post.disagreements },
    { header: 'Post-op', label: 'Post-op', filmDate: null, disagreements: [] });
  assert.equal(post.values.length, 25);
  assert.ok(post.values.every((value) => value === ''));
  const s002 = pairing.subjects[0];
  assert.deepEqual([...s002.visits.keys()], ['Pre-op', '1 yr']);
  assert.equal(s002.visits.has('Post-op'), false);
  assert.deepEqual(pairing.unpaired, []);
  assert.deepEqual(pairing.ambiguous, []);
  assert.deepEqual(pairing.merged, []);
  assert.deepEqual(pairing.disagreements, []);
  assert.equal(pairing.noSubject, 0);
  assert.equal(pairing.noTimepoint, 0);
  assert.deepEqual(pairing.otherVisits, { count: 0, labels: [] });
});

const PRE = { PI: 52.1, PT: 21.4, SS: 30.7, L1PA: 9.9, LL: { 'L1-S1': 38.2 } };
const POST = { PI: 52.3, PT: 14.0, SS: 38.3, L1PA: 8.1, LL: { 'L1-S1': 49.1 } };

test('pairStudies numbers a label\'s visits by film date when a subject has more than one, and every subject fills them from its earliest', () => {
  const rows = [
    film('SP-1', 'sub226', 'Pre-op', { filmDate: '2024-01-02' }),
    film('SP-2', 'sub226', 'Post-op', { filmDate: '2024-05-31' }),
    film('SP-3', 'sub226', 'Post-op', { filmDate: '2024-04-30' }),
    film('SP-4', 'sub226', '1 yr', { filmDate: '2025-01-10' }),
    film('SP-5', 'sub227', 'Pre-op', { filmDate: '2024-02-01' }),
    film('SP-6', 'sub227', 'Post-op', { filmDate: '2024-06-01' }),
    film('SP-7', 'sub227', '1 yr', { filmDate: '2025-02-01' }),
  ];
  const pairing = pairStudies(rows);
  // Post-op is numbered because sub226 has two visits on it; 1 yr stays bare.
  assert.deepEqual(pairing.visits, ['Post-op 1', 'Post-op 2', '1 yr']);
  const a = pairing.subjects[0].visits;
  assert.deepEqual([...a.keys()], ['Pre-op', 'Post-op 1', 'Post-op 2', '1 yr']);
  assert.deepEqual(a.get('Post-op 1').films.map((f) => f.id), ['SP-3']);
  assert.deepEqual(a.get('Post-op 2').films.map((f) => f.id), ['SP-2']);
  assert.deepEqual([a.get('Post-op 1').label, a.get('Post-op 1').filmDate, a.get('Post-op 2').filmDate], ['Post-op', '2024-04-30', '2024-05-31']);
  assert.equal(a.get('1 yr').header, '1 yr');
  const b = pairing.subjects[1].visits;
  assert.deepEqual([...b.keys()], ['Pre-op', 'Post-op 1', '1 yr']);
  assert.equal(b.has('Post-op 2'), false);
  assert.deepEqual(pairing.ambiguous, []);
});

test('pairStudies orders an undated visit after the dated ones on its label', () => {
  const rows = [
    film('SP-1', 'S001', 'Pre-op', { filmDate: '2024-01-02' }),
    film('SP-2', 'S001', 'Post-op'),
    film('SP-3', 'S001', 'Post-op', { filmDate: '2024-04-30' }),
  ];
  const pairing = pairStudies(rows);
  assert.deepEqual(pairing.visits, ['Post-op 1', 'Post-op 2']);
  const v = pairing.subjects[0].visits;
  assert.equal(v.get('Post-op 1').films[0].id, 'SP-3');
  assert.equal(v.get('Post-op 2').films[0].id, 'SP-2');
  assert.equal(v.get('Post-op 2').filmDate, null);
});

test('pairStudies merges two same-day films of one visit: the unnoted film leads, the noted film fills its gaps, and a disagreement is listed', () => {
  const rows = [
    film('SP-1', 'sub225', 'Pre-op', { filmDate: '2023-10-23', measurements: { SS: 43.7, LL: { 'L1-S1': 56.0 } } }),
    film('SP-2', 'sub225', 'Pre-op', { filmDate: '2023-10-23', note: 'femoral heads', measurements: { PI: 62.3, PT: 18.1, SS: 44.2 } }),
    film('SP-3', 'sub225', 'Post-op', { filmDate: '2024-03-22', measurements: POST }),
  ];
  const pairing = pairStudies(rows);
  assert.deepEqual(pairing.subjects.map((s) => s.subject), ['sub225']);
  const pre = pairing.subjects[0].visits.get('Pre-op');
  assert.deepEqual(pre.films.map((f) => f.id), ['SP-1', 'SP-2']);
  // MEASUREMENT_COLUMNS order: LL L1-S1, PI, PT, SS, PI-LL Mismatch, L1PA. LL from the unnoted film,
  // PI and PT from the noted one, SS from the unnoted one (the noted film's 44.2 is set aside), and
  // the mismatch stays empty: it is derived per film and neither film has both PI and LL.
  assert.deepEqual(pre.values.slice(0, 6), [56, 62.3, 18.1, 43.7, '', '']);
  assert.deepEqual(pre.disagreements, ['SS']);
  assert.deepEqual(pairing.merged, [{ subject: 'sub225', header: 'Pre-op', films: 2 }]);
  assert.deepEqual(pairing.disagreements, [{ subject: 'sub225', header: 'Pre-op', columns: ['SS'] }]);
  assert.deepEqual(pairing.ambiguous, []);
  // A lone noted film on a date is simply that visit's film: nothing is merged.
  const alone = pairStudies([
    film('SP-1', 'S001', 'Pre-op', { filmDate: '2024-01-01', note: 'femoral heads', measurements: PRE }),
    film('SP-2', 'S001', 'Post-op', { filmDate: '2024-02-01', measurements: POST }),
  ]);
  assert.deepEqual(alone.merged, []);
  assert.equal(alone.subjects[0].visits.get('Pre-op').films[0].id, 'SP-1');
  assert.deepEqual(alone.subjects[0].visits.get('Pre-op').values.slice(0, 4), [38.2, 52.1, 21.4, 30.7]);
});

test('pairStudies reports two same-day films ambiguous when neither or both carry a note, and two Pre-op dates as two visits', () => {
  const rows = [
    film('SP-1', 'S001', 'Pre-op', { filmDate: '2024-01-02' }), film('SP-2', 'S001', 'Pre-op', { filmDate: '2024-01-02' }), film('SP-3', 'S001', 'Post-op', { filmDate: '2024-04-01' }),
    film('SP-4', 'S002', 'Pre-op', { filmDate: '2024-01-02', note: 'a' }), film('SP-5', 'S002', 'Pre-op', { filmDate: '2024-01-02', note: 'b' }), film('SP-6', 'S002', 'Post-op', { filmDate: '2024-04-01' }),
    film('SP-7', 'S003', 'Pre-op', { filmDate: '2023-11-01' }), film('SP-8', 'S003', 'Pre-op', { filmDate: '2024-01-02' }), film('SP-9', 'S003', 'Post-op', { filmDate: '2024-04-01' }),
  ];
  const pairing = pairStudies(rows);
  assert.deepEqual(pairing.subjects, []);
  assert.deepEqual(pairing.ambiguous, [
    { subject: 'S001', label: 'Pre-op', count: 2, kind: 'films' },
    { subject: 'S002', label: 'Pre-op', count: 2, kind: 'films' },
    { subject: 'S003', label: 'Pre-op', count: 2, kind: 'visits' },
  ]);
  assert.deepEqual(pairing.visits, []);
});

test('pairStudies defaults to All paired when no options are given', () => {
  const rows = [film('SP-1', 'S001', 'Pre-op'), film('SP-2', 'S001', '6 wk')];
  const pairing = pairStudies(rows);
  assert.equal(pairing.post, null);
  assert.deepEqual(pairing.visits, ['6 wk']);
  assert.deepEqual(pairing.subjects.map((s) => s.subject), ['S001']);
  // Pre-op as the post label would pair a film with itself; it is read as All paired instead.
  const preAsPost = pairStudies(rows, { post: 'Pre-op' });
  assert.equal(preAsPost.post, null);
  assert.deepEqual(preAsPost.visits, ['6 wk']);
  assert.deepEqual([...preAsPost.subjects[0].visits.keys()], ['Pre-op', '6 wk']);
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
    { subject: 'S001', label: 'Pre-op', count: 2, kind: 'films' },
    { subject: 'S002', label: '6 wk', count: 2, kind: 'films' },
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
  assert.deepEqual([...pairing.subjects[0].visits.keys()], ['Pre-op', 'Post-op']);
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
  assert.equal(pairing.subjects[0].visits.get('Post-op').films[0].id, 'SP-2');
});

test('pairStudies treats Intra-op as a later visit and orders visits Intra-op, Post-op, durations by length, then custom labels', () => {
  const rows = [
    film('SP-1', 'S001', 'Pre-op'), film('SP-2', 'S001', 'Final'), film('SP-3', 'S001', '2 yr'), film('SP-4', 'S001', 'Intra-op'),
    film('SP-5', 'S002', 'Pre-op'), film('SP-6', 'S002', '6 wk'), film('SP-7', 'S002', 'Post-op'),
  ];
  const pairing = pairStudies(rows);
  assert.deepEqual(pairing.visits, ['Intra-op', 'Post-op', '6 wk', '2 yr', 'Final']);
  assert.deepEqual([...pairing.subjects[0].visits.keys()], ['Pre-op', 'Intra-op', '2 yr', 'Final']);
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
  // Two Pre-op dates are two visits, not two films.
  const dates = { ...pairing, unpaired: [], ambiguous: [{ subject: 'S003', label: 'Pre-op', count: 2, kind: 'visits' }] };
  assert.equal(pairedExportMessage(dates, 'x.csv'), 'Exported 0 subjects to x.csv \u00B7 1 ambiguous (two Pre-op visits: S003)');
});

test('pairedExportMessage flags merged visits and their disagreements right after the count, naming at most five', () => {
  const base = { subjects: [{}, {}], unpaired: [], ambiguous: [], noSubject: 0, noTimepoint: 0, otherVisits: { count: 0, labels: [] } };
  const two = {
    ...base,
    merged: [{ subject: 'sub225', header: 'Pre-op', films: 2 }, { subject: 'sub226', header: 'Post-op 1', films: 3 }],
    disagreements: [{ subject: 'sub225', header: 'Pre-op', columns: ['SS'] }, { subject: 'sub226', header: 'Post-op 1', columns: ['PI', 'PT'] }],
  };
  assert.equal(pairedExportMessage(two, 'x.csv'),
    'Exported 2 subjects to x.csv \u00B7 2 merged visits (sub225 Pre-op: 2 films, sub226 Post-op 1: 3 films)'
    + ' \u00B7 3 disagreements, the unnoted film\'s values kept (sub225 Pre-op: SS; sub226 Post-op 1: PI, PT)');
  const one = { ...base, unpaired: ['S9'], merged: [{ subject: 'sub225', header: 'Pre-op', films: 2 }], disagreements: [{ subject: 'sub225', header: 'Pre-op', columns: ['SS'] }] };
  assert.equal(pairedExportMessage(one, 'x.csv'),
    'Exported 2 subjects to x.csv \u00B7 1 merged visit (sub225 Pre-op: 2 films) \u00B7 1 disagreement, the unnoted film\'s value kept (sub225 Pre-op: SS) \u00B7 1 unpaired (S9)');
  const many = { ...base, merged: Array.from({ length: 7 }, (_, i) => ({ subject: `S${i}`, header: 'Pre-op', films: 2 })), disagreements: [] };
  assert.equal(pairedExportMessage(many, 'x.csv'),
    'Exported 2 subjects to x.csv \u00B7 7 merged visits (S0 Pre-op: 2 films, S1 Pre-op: 2 films, S2 Pre-op: 2 films, S3 Pre-op: 2 films, S4 Pre-op: 2 films, \u2026)');
  // At most three columns are named per visit; the file's disagreements cell carries them all.
  const wide = { ...base, merged: [{ subject: 'sub225', header: 'Pre-op', films: 2 }], disagreements: [{ subject: 'sub225', header: 'Pre-op', columns: ['SS', 'LL L2-S1', 'LL L3-S1', 'LL L4-S1', 'LL L5-S1'] }] };
  assert.equal(pairedExportMessage(wide, 'x.csv'),
    'Exported 2 subjects to x.csv \u00B7 1 merged visit (sub225 Pre-op: 2 films) \u00B7 5 disagreements, the unnoted film\'s values kept (sub225 Pre-op: SS, LL L2-S1, LL L3-S1, +2 more)');
  // A pairing from before merging existed carries neither list.
  assert.equal(pairedExportMessage(base, 'x.csv'), 'Exported 2 subjects to x.csv');
});
