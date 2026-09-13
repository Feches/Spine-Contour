import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTCOMES, FOLLOW_UP_FIELD, OUTCOME_FIELDS, primaryOutcome, isOutcomeField, isOutcomeDateField,
  normaliseOutcomeValue, recognisedOutcome, recognisedDate, resolveOutcomes, outcomeLine, footerLine,
} from '../renderer/data/outcomes.js';
import { KNOWN_FIELDS, autoMap, joinClinical } from '../renderer/data/csv.js';

const film = (timepoint, clinical) => ({ id: 'SP-1', source: 'real', subjectId: 'S001', timepoint, clinical });

test('the registry has one primary outcome, and the known fields carry its two fields and the follow-up last', () => {
  assert.equal(OUTCOMES.length, 1);
  assert.equal(primaryOutcome().key, 'fusionExtension');
  assert.deepEqual(OUTCOME_FIELDS, ['Fusion extension', 'Fusion extension date', 'Last follow-up']);
  assert.deepEqual(KNOWN_FIELDS.slice(-3), OUTCOME_FIELDS);
  assert.equal(KNOWN_FIELDS.length, 12);
  assert.equal(isOutcomeField('Fusion extension'), true);
  assert.equal(isOutcomeField('Fusion extension date'), false);
  assert.equal(isOutcomeDateField('Fusion extension date'), true);
  assert.equal(isOutcomeDateField(FOLLOW_UP_FIELD), true);
  assert.equal(isOutcomeDateField('Age'), false);
});

test('values: Yes and No are recognised in their common spellings, anything else is kept as typed and not recognised', () => {
  for (const yes of ['Yes', 'yes', ' Y ', 'TRUE', '1']) assert.equal(normaliseOutcomeValue(yes), 'Yes');
  for (const no of ['No', 'n', 'false', '0']) assert.equal(normaliseOutcomeValue(no), 'No');
  assert.equal(normaliseOutcomeValue(' maybe '), 'maybe');
  assert.equal(normaliseOutcomeValue(null), '');
  assert.equal(recognisedOutcome('Yes'), 'Yes');
  assert.equal(recognisedOutcome('maybe'), null);
  assert.equal(recognisedDate('2025-03-14'), '2025-03-14');
  assert.equal(recognisedDate(' 2025-03-14 '), '2025-03-14');
  assert.equal(recognisedDate('14/03/2025'), null);
  assert.equal(recognisedDate(null), null);
});

test('resolveOutcomes: every row of the status table, the first date in timepoint order, the latest follow-up', () => {
  const none = resolveOutcomes([film('Pre-op', {}), film('Post-op', {})]);
  assert.deepEqual(none, { fusionExtension: { status: 'not-recorded', date: null }, lastFollowUp: null });
  const yes = resolveOutcomes([
    film('Post-op', { 'Fusion extension': 'Yes', 'Fusion extension date': '2026-01-10', 'Last follow-up': '2026-06-01' }),
    film('Pre-op', { 'Fusion extension': 'Yes', 'Last follow-up': '2025-01-01' }),
  ]);
  assert.deepEqual(yes, { fusionExtension: { status: 'yes', date: '2026-01-10' }, lastFollowUp: '2026-06-01' });
  const no = resolveOutcomes([film('Pre-op', { 'Fusion extension': 'No' }), film('Post-op', { 'Last follow-up': '2026-02-02' })]);
  assert.deepEqual(no, { fusionExtension: { status: 'no', date: null }, lastFollowUp: '2026-02-02' });
  const conflicting = resolveOutcomes([film('Pre-op', { 'Fusion extension': 'Yes' }), film('Post-op', { 'Fusion extension': 'No' })]);
  assert.equal(conflicting.fusionExtension.status, 'conflicting');
  const unrecognised = resolveOutcomes([film('Pre-op', { 'Fusion extension': 'maybe', 'Fusion extension date': 'soon' })]);
  assert.deepEqual(unrecognised.fusionExtension, { status: 'not-recorded', date: null });
  // A film with no timepoint sorts after the labelled ones for the date pick.
  const dated = resolveOutcomes([film(null, { 'Fusion extension': 'Yes', 'Fusion extension date': '2027-01-01' }), film('Post-op', { 'Fusion extension': 'Yes', 'Fusion extension date': '2026-01-01' })]);
  assert.equal(dated.fusionExtension.date, '2026-01-01');
  assert.deepEqual(resolveOutcomes([]), { fusionExtension: { status: 'not-recorded', date: null }, lastFollowUp: null });
});

test('the registry is generic: a second outcome registered in the test resolves the same way', () => {
  const registry = [...OUTCOMES, { key: 'rodFracture', field: 'Rod fracture', dateField: 'Rod fracture date', primary: false, cardYes: 'Rod fractured', cardNo: 'No rod fracture', footer: 'WITH A ROD FRACTURE' }];
  const resolved = resolveOutcomes([film('Post-op', { 'Fusion extension': 'No', 'Rod fracture': 'Yes', 'Rod fracture date': '2026-03-03' })], registry);
  assert.deepEqual(resolved.rodFracture, { status: 'yes', date: '2026-03-03' });
  assert.deepEqual(resolved.fusionExtension, { status: 'no', date: null });
  assert.equal(outcomeLine(resolved, registry[1]), 'Rod fractured \u00B7 2026-03-03');
  assert.equal(footerLine(['yes', 'no', 'not-recorded'], registry[1]), '1 OF 3 WITH A ROD FRACTURE \u00B7 1 NOT RECORDED');
});

test('outcomeLine and footerLine read the primary outcome and its registry copy', () => {
  assert.equal(outcomeLine({ fusionExtension: { status: 'yes', date: '2025-03-14' }, lastFollowUp: null }), 'Fusion extended \u00B7 2025-03-14');
  assert.equal(outcomeLine({ fusionExtension: { status: 'yes', date: null }, lastFollowUp: null }), 'Fusion extended');
  assert.equal(outcomeLine({ fusionExtension: { status: 'no', date: null }, lastFollowUp: '2026-01-10' }), 'Fusion not extended \u00B7 last follow-up 2026-01-10');
  assert.equal(outcomeLine({ fusionExtension: { status: 'no', date: null }, lastFollowUp: null }), 'Fusion not extended');
  assert.equal(outcomeLine({ fusionExtension: { status: 'not-recorded', date: null }, lastFollowUp: null }), 'Outcome not recorded');
  assert.equal(outcomeLine({ fusionExtension: { status: 'conflicting', date: null }, lastFollowUp: null }), 'Outcome conflicting');
  assert.equal(footerLine(['yes', 'yes', 'no', 'not-recorded', 'conflicting']), '2 OF 5 WITH A FUSION EXTENSION \u00B7 2 NOT RECORDED');
  assert.equal(footerLine(['yes', 'no']), '1 OF 2 WITH A FUSION EXTENSION');
  assert.equal(footerLine([]), '0 OF 0 WITH A FUSION EXTENSION');
});

test('autoMap matches the longest known name first, so fusion_extension_date is the date field', () => {
  assert.deepEqual(autoMap(['fusion_extension_date', 'Fusion extension', 'last_follow_up', 'follow_up_months']), [
    { src: 'fusion_extension_date', dest: 'Fusion extension date' },
    { src: 'Fusion extension', dest: 'Fusion extension' },
    { src: 'last_follow_up', dest: 'Last follow-up' },
    { src: 'follow_up_months', dest: 'Follow-up' },
  ]);
  // The nine older names keep their behaviour: none is a prefix of another.
  assert.deepEqual(autoMap(['odi_base', 'age_yrs', 'STUDY_ID']), [
    { src: 'odi_base', dest: 'ODI' }, { src: 'age_yrs', dest: 'Age' }, { src: 'STUDY_ID', dest: null },
  ]);
});

test('joinClinical normalises an outcome field on the way in and leaves other fields as typed', () => {
  const join = joinClinical({
    files: ['C:\\films\\a.png'], headers: ['study_id', 'fusion', 'dx'],
    rows: [{ study_id: 'a', fusion: ' y ', dx: ' Scoliosis ' }],
    mapping: [{ src: 'study_id', dest: null }, { src: 'fusion', dest: 'Fusion extension' }, { src: 'dx', dest: 'Diagnosis' }],
  });
  assert.deepEqual(join.byFile.get('C:\\films\\a.png'), { 'Fusion extension': 'Yes', Diagnosis: 'Scoliosis' });
});
