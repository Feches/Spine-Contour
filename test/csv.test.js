import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toCsv, parse, autoMap, KNOWN_FIELDS, fileStem, findJoinHeader, joinClinical, clinicalFieldNames,
  findStructuralHeaders, structuralField, STRUCTURAL_LABELS, structuralFromRow,
  toPairedCsv, delta1,
} from '../renderer/data/csv.js';
import { pairStudies } from '../renderer/data/pairing.js';

function study(overrides) {
  return {
    id: 'SP-1000',
    source: 'real',
    filePath: 'C:/films/a.dcm',
    fileName: 'a.dcm',
    addedAt: '2026-08-31T00:00:00Z',
    view: 'Standing lateral',
    thumbnail: null,
    measurements: null,
    geometry: null,
    qc: null,
    clinical: {},
    ...overrides,
  };
}

test('toCsv leads with the attribution and NOT FOR CLINICAL USE comment block', () => {
  const csv = toCsv([]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], '# Spine Contour export');
  assert.match(lines[1], /^# Created by /);
  assert.match(lines[1], /Cody Woodhouse, MD/);
  assert.match(lines[1], /Michael Jayasuriya, BS/);
  // The export names its authors; it does not demand a citation. Pinned so the old wording
  // cannot come back by accident -- a paper will be cited here when there is one.
  assert.doesNotMatch(lines[1], /citation/i);
  assert.match(lines[2], /NOT FOR CLINICAL USE/);
});

test('toCsv never writes a demo study', () => {
  const studies = [study({ id: 'SP-1000', source: 'real' }), study({ id: 'SP-0030', source: 'demo' })];
  const excluded = toCsv(studies);
  assert.ok(excluded.includes('SP-1000'));
  assert.ok(!excluded.includes('SP-0030'));
});

test('toCsv exports absent measurements as empty cells, never 0', () => {
  const csv = toCsv([study({ measurements: null })]);
  const dataLine = csv.split('\r\n').find((line) => line.startsWith('SP-1000'));
  const cells = dataLine.split(',');
  // Study ID, View, Subject, Timepoint, Film date, Note, then the ten measurement columns.
  for (let i = 6; i < 6 + 10; i += 1) assert.equal(cells[i], '');
});

test('toCsv exports real measurements including the derived PI-LL mismatch column', () => {
  const measurements = {
    SS: 38.2, PI: 52.7, PT: 14.6, L1PA: 21.3,
    LL: { 'L1-S1': 47.1, 'L2-S1': 40.0, 'L3-S1': 30.5, 'L4-S1': 18.2, 'L5-S1': 6.4 },
  };
  const csv = toCsv([study({ measurements })]);
  const header = csv.split('\r\n')[3].split(',');
  const dataLine = csv.split('\r\n')[4].split(',');
  const mismatchIndex = header.indexOf('PI-LL Mismatch');
  assert.ok(Math.abs(Number(dataLine[mismatchIndex]) - (52.7 - 47.1)) < 1e-9);
});

test('toCsv writes every clinical field present on the exported studies, KNOWN_FIELDS order first, then custom', () => {
  const csv = toCsv([
    study({ id: 'SP-1000', clinical: { Zeta: 'z', Age: '58' } }),
    study({ id: 'SP-1001', clinical: { Diagnosis: 'Spondylolisthesis, grade 2' } }),
  ]);
  const lines = csv.split('\r\n');
  const header = lines[3].split(',');
  // Study ID, View, Subject, Timepoint, Film date, Note, 25 measurement columns, then the union:
  // known fields in KNOWN_FIELDS order, then custom names in first-seen order.
  assert.deepEqual(header.slice(31), ['Age', 'Diagnosis', 'Zeta']);
  const row1000 = lines[4];
  const row1001 = lines[5];
  assert.ok(row1000.startsWith('SP-1000'));
  assert.ok(row1000.endsWith(',58,,z'));
  assert.ok(row1001.startsWith('SP-1001'));
  assert.ok(row1001.endsWith(',,"Spondylolisthesis, grade 2",'));
});

test('toCsv writes no clinical columns when no exported study carries a value', () => {
  const csv = toCsv([study({ clinical: {} }), study({ id: 'SP-1001' })]);
  const header = csv.split('\r\n')[3].split(',');
  assert.equal(header.length, 31);
  assert.equal(header[30], 'Disc height L5-S1 posterior (mm)');
});

test("toCsv ignores an excluded demo study's clinical keys when choosing the columns", () => {
  const csv = toCsv([
    study({ id: 'SP-1000', clinical: { Age: '58' } }),
    study({ id: 'SP-0042', source: 'demo', clinical: { Notes: 'demo only' } }),
  ]);
  const header = csv.split('\r\n')[3].split(',');
  assert.deepEqual(header.slice(31), ['Age']);
  assert.ok(!csv.includes('demo only'));
});

test('toCsv is safe against incompletely populated measurements', () => {
  // Study with LL absent but PI/PT/SS/L1PA present: those values should export, LL-dependent columns empty
  const missingLl = study({ id: 'SP-2000', measurements: { PI: 52.7, PT: 14.6, SS: 38.2, L1PA: 21.3 } });
  const csvNoLl = toCsv([missingLl]);
  const headerNoLl = csvNoLl.split('\r\n')[3].split(',');
  const dataLineNoLl = csvNoLl.split('\r\n')[4].split(',');

  // PI, PT, SS, L1PA should have their real values
  const piIndex = headerNoLl.indexOf('PI');
  const ptIndex = headerNoLl.indexOf('PT');
  const ssIndex = headerNoLl.indexOf('SS');
  const l1paIndex = headerNoLl.indexOf('L1PA');
  assert.equal(dataLineNoLl[piIndex], '52.7');
  assert.equal(dataLineNoLl[ptIndex], '14.6');
  assert.equal(dataLineNoLl[ssIndex], '38.2');
  assert.equal(dataLineNoLl[l1paIndex], '21.3');

  // Five LL* and PI-LL Mismatch should be empty
  const llL1Index = headerNoLl.indexOf('LL L1-S1');
  const llL2Index = headerNoLl.indexOf('LL L2-S1');
  const llL3Index = headerNoLl.indexOf('LL L3-S1');
  const llL4Index = headerNoLl.indexOf('LL L4-S1');
  const llL5Index = headerNoLl.indexOf('LL L5-S1');
  const mismatchIndex = headerNoLl.indexOf('PI-LL Mismatch');
  assert.equal(dataLineNoLl[llL1Index], '');
  assert.equal(dataLineNoLl[llL2Index], '');
  assert.equal(dataLineNoLl[llL3Index], '');
  assert.equal(dataLineNoLl[llL4Index], '');
  assert.equal(dataLineNoLl[llL5Index], '');
  assert.equal(dataLineNoLl[mismatchIndex], '');

  // Study with LL present but PI absent: LL values export, PI-LL Mismatch empty, no NaN
  const missingPi = study({ id: 'SP-2001', measurements: { PT: 14.6, SS: 38.2, L1PA: 21.3, LL: { 'L1-S1': 47.1, 'L2-S1': 40.0, 'L3-S1': 30.5, 'L4-S1': 18.2, 'L5-S1': 6.4 } } });
  const csvNoPi = toCsv([missingPi]);
  assert.ok(!csvNoPi.includes('NaN'));
  const headerNoPi = csvNoPi.split('\r\n')[3].split(',');
  const dataLineNoPi = csvNoPi.split('\r\n')[4].split(',');

  // PI should be empty
  const piIndexNoPi = headerNoPi.indexOf('PI');
  assert.equal(dataLineNoPi[piIndexNoPi], '');

  // PI-LL Mismatch should be empty (needs PI)
  const mismatchIndexNoPi = headerNoPi.indexOf('PI-LL Mismatch');
  assert.equal(dataLineNoPi[mismatchIndexNoPi], '');

  // Five LL* should still have values
  const llL1IndexNoPi = headerNoPi.indexOf('LL L1-S1');
  const llL2IndexNoPi = headerNoPi.indexOf('LL L2-S1');
  const llL3IndexNoPi = headerNoPi.indexOf('LL L3-S1');
  const llL4IndexNoPi = headerNoPi.indexOf('LL L4-S1');
  const llL5IndexNoPi = headerNoPi.indexOf('LL L5-S1');
  assert.ok(Math.abs(Number(dataLineNoPi[llL1IndexNoPi]) - 47.1) < 1e-9);
  assert.ok(Math.abs(Number(dataLineNoPi[llL2IndexNoPi]) - 40.0) < 1e-9);
  assert.ok(Math.abs(Number(dataLineNoPi[llL3IndexNoPi]) - 30.5) < 1e-9);
  assert.ok(Math.abs(Number(dataLineNoPi[llL4IndexNoPi]) - 18.2) < 1e-9);
  assert.ok(Math.abs(Number(dataLineNoPi[llL5IndexNoPi]) - 6.4) < 1e-9);
});

test('toCsv rounds the derived PI-LL mismatch to one decimal, clearing float noise', () => {
  const measurements = {
    SS: 42.7, PI: 48.6, PT: 5.9, L1PA: 3.8,
    LL: { 'L1-S1': 49.0, 'L2-S1': 40.0, 'L3-S1': 30.5, 'L4-S1': 18.2, 'L5-S1': 6.4 },
  };
  const csv = toCsv([study({ measurements })]);
  const header = csv.split('\r\n')[3].split(',');
  const dataLine = csv.split('\r\n')[4].split(',');
  const mismatchIndex = header.indexOf('PI-LL Mismatch');
  assert.equal(dataLine[mismatchIndex], '-0.4');
  assert.ok(!csv.includes('-0.3999999999999986'));
  assert.ok(!/\.\d{2,}/.test(csv.replace(/^#.*$/gm, '')));
});

test('toCsv exports a real measured 0 as 0, not an empty cell', () => {
  const measurements = {
    SS: 0, PI: 52.7, PT: 14.6, L1PA: 21.3,
    LL: { 'L1-S1': 0, 'L2-S1': 40.0, 'L3-S1': 30.5, 'L4-S1': 18.2, 'L5-S1': 6.4 },
  };
  const csv = toCsv([study({ measurements })]);
  const header = csv.split('\r\n')[3].split(',');
  const dataLine = csv.split('\r\n')[4].split(',');
  const ssIndex = header.indexOf('SS');
  const llL1Index = header.indexOf('LL L1-S1');
  assert.equal(dataLine[ssIndex], '0');
  assert.equal(dataLine[llL1Index], '0');
});

test('toCsv writes Subject, Timepoint, Film date and Note after View, empty when absent (spec §11.1)', () => {
  const csv = toCsv([
    study({ id: 'SP-1000', subjectId: 'S001', timepoint: 'Pre-op', filmDate: '2025-03-02', note: 'femoral heads' }),
    study({ id: 'SP-1001' }),
  ]);
  const lines = csv.split('\r\n');
  assert.deepEqual(lines[3].split(',').slice(0, 6), ['Study ID', 'View', 'Subject', 'Timepoint', 'Film date', 'Note']);
  assert.ok(lines[4].startsWith('SP-1000,Standing lateral,S001,Pre-op,2025-03-02,femoral heads,'), lines[4]);
  assert.ok(lines[5].startsWith('SP-1001,Standing lateral,,,,,'), lines[5]);
});

// ---------------------------------------------------------------------------
// parse
// ---------------------------------------------------------------------------

test('parse handles quoted fields with embedded commas and doubled quotes', () => {
  const { headers, rows } = parse('name,note\n"Doe, Jane","Says ""hi"" often"\n');
  assert.deepEqual(headers, ['name', 'note']);
  assert.deepEqual(rows, [{ name: 'Doe, Jane', note: 'Says "hi" often' }]);
});

test('parse handles embedded newlines inside quoted fields', () => {
  const { headers, rows } = parse('id,notes\r\n1,"line one\nline two"\r\n2,plain\r\n');
  assert.deepEqual(headers, ['id', 'notes']);
  assert.deepEqual(rows, [
    { id: '1', notes: 'line one\nline two' },
    { id: '2', notes: 'plain' },
  ]);
});

test('parse handles CRLF line endings', () => {
  const { headers, rows } = parse('a,b\r\n1,2\r\n3,4\r\n');
  assert.deepEqual(headers, ['a', 'b']);
  assert.deepEqual(rows, [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
});

test("parse fills '' for a trailing empty cell and for a row shorter than the header", () => {
  const { headers, rows } = parse('a,b,c\n1,2,\n');
  assert.deepEqual(headers, ['a', 'b', 'c']);
  assert.deepEqual(rows, [{ a: '1', b: '2', c: '' }]);
  // A row that simply stops short of the header fills '' too, never undefined.
  assert.deepEqual(parse('a,b,c\n1,2\n').rows, [{ a: '1', b: '2', c: '' }]);
});

test('parse on a header-only file returns zero data rows, with or without a trailing newline', () => {
  const withNewline = parse('study_id,age,sex\n');
  assert.deepEqual(withNewline.headers, ['study_id', 'age', 'sex']);
  assert.deepEqual(withNewline.rows, []);
  const withoutNewline = parse('study_id,age,sex');
  assert.deepEqual(withoutNewline.headers, ['study_id', 'age', 'sex']);
  assert.deepEqual(withoutNewline.rows, []);
});

test('parse strips a leading UTF-8 BOM so the first header is clean', () => {
  // Excel's "CSV UTF-8" writes U+FEFF first; Node's readFile(path, 'utf8') keeps it.
  const { headers, rows } = parse('\uFEFFa,b\r\n1,2\r\n');
  assert.deepEqual(headers, ['a', 'b']);
  assert.deepEqual(rows, [{ a: '1', b: '2' }]);
});

test('parse treats a double quote inside an unquoted field as a literal character', () => {
  // A quote opens quoted mode only while the field so far is empty or whitespace (RFC 4180
  // plus a leading-space tolerance). An inch mark arrives after real text, so it must not
  // swallow every following row into one cell.
  const { headers, rows } = parse('a,b\n1,5\'11"\n2,x\n');
  assert.deepEqual(headers, ['a', 'b']);
  assert.deepEqual(rows, [{ a: '1', b: '5\'11"' }, { a: '2', b: 'x' }]);
});

test('parse opens a quoted field after leading whitespace and discards the padding', () => {
  // Hand-edited and Excel-exported CSVs both write `, "Doe, Jane"`. The space before the
  // quote is padding, not data: the quote still opens, and the value carries no leading space.
  assert.deepEqual(parse('a,b\n1, "Doe, Jane"\n').rows, [{ a: '1', b: 'Doe, Jane' }]);
});

test('parse drops the extra cells of a row longer than the header', () => {
  const { headers, rows } = parse('a,b\n1,2,3\n');
  assert.deepEqual(headers, ['a', 'b']);
  assert.deepEqual(rows, [{ a: '1', b: '2' }]);
});

test('parse drops blank and whitespace-only lines instead of treating them as data', () => {
  const { headers, rows } = parse('a,b\n   \n1,2\n\n3,4\n\t\n');
  assert.deepEqual(headers, ['a', 'b']);
  assert.deepEqual(rows, [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
});

test('parse keeps the first column when two headers share a name', () => {
  const { headers, rows } = parse('a,a\n1,2\n');
  assert.deepEqual(headers, ['a', 'a']);
  assert.deepEqual(rows, [{ a: '1' }]);
});

test('parse treats a lone CR as a line ending', () => {
  const { headers, rows } = parse('a,b\r1,2\r3,4\r');
  assert.deepEqual(headers, ['a', 'b']);
  assert.deepEqual(rows, [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
});

// ---------------------------------------------------------------------------
// autoMap
// ---------------------------------------------------------------------------

test('autoMap matches odi_base -> ODI and age_yrs -> Age and leaves STUDY_ID unmapped', () => {
  const mapping = autoMap(['odi_base', 'age_yrs', 'STUDY_ID']);
  assert.deepEqual(mapping, [
    { src: 'odi_base', dest: 'ODI' },
    { src: 'age_yrs', dest: 'Age' },
    { src: 'STUDY_ID', dest: null },
  ]);
});

test('autoMap leaves tx_plan unmapped — txplan is not a prefix of treatmentplan', () => {
  assert.deepEqual(autoMap(['tx_plan']), [{ src: 'tx_plan', dest: null }]);
});

test('autoMap leaves dx_text unmapped — there is no synonym table', () => {
  // "dx" is a common clinical abbreviation for diagnosis, but autoMap only tests whether
  // the stripped, lowercased known-field name is a literal prefix of the stripped header.
  // "dxtext" is not a prefix of "diagnosis", nor the reverse, so this column comes back
  // unmapped like any other unrecognised header. Teaching it dx would force teaching it tx.
  assert.deepEqual(autoMap(['dx_text']), [{ src: 'dx_text', dest: null }]);
});

test('autoMap matches an exact, case-insensitive field name', () => {
  assert.deepEqual(autoMap(['diagnosis', 'NOTES']), [
    { src: 'diagnosis', dest: 'Diagnosis' },
    { src: 'NOTES', dest: 'Notes' },
  ]);
});

test('autoMap returns an empty array for an empty header list', () => {
  assert.deepEqual(autoMap([]), []);
});

test('autoMap lets the first header claim a known field; a later match comes back unmapped', () => {
  assert.deepEqual(autoMap(['odi_base', 'odi_6mo']), [
    { src: 'odi_base', dest: 'ODI' },
    { src: 'odi_6mo', dest: null },
  ]);
});

test('autoMap leaves a blank header unmapped', () => {
  // A trailing comma in the header line yields a '' column; it cannot be mapped honestly.
  assert.deepEqual(autoMap(['', 'age']), [
    { src: '', dest: null },
    { src: 'age', dest: 'Age' },
  ]);
});

test('autoMap maps agent -> Age: the known cost of the prefix rule, corrected in the mapping chip', () => {
  // "age" is a prefix of "agent". This is documented, not a bug: the rule has no word
  // boundaries and no synonym table, and the user overrides it in the Workspace chip.
  assert.deepEqual(autoMap(['agent']), [{ src: 'agent', dest: 'Age' }]);
});

// ---------------------------------------------------------------------------
// KNOWN_FIELDS
// ---------------------------------------------------------------------------

test('KNOWN_FIELDS lists exactly the nine clinical fields in order', () => {
  assert.deepEqual(KNOWN_FIELDS, ['Age', 'Sex', 'BMI', 'Diagnosis', 'ODI',
    'Treatment plan', 'Surgical history', 'Follow-up', 'Notes']);
});

// ---------------------------------------------------------------------------
// fileStem
// ---------------------------------------------------------------------------

test('fileStem returns the basename without its last extension, for either path separator', () => {
  assert.equal(fileStem('C:\\films\\batch\\a.b.dcm'), 'a.b');
  assert.equal(fileStem('/films/batch/SP001.PNG'), 'SP001');
  assert.equal(fileStem('SP002.jpeg'), 'SP002');
});

test('fileStem returns a name without an extension unchanged', () => {
  assert.equal(fileStem('noext'), 'noext');
  assert.equal(fileStem('C:/films/noext'), 'noext');
});

// ---------------------------------------------------------------------------
// findJoinHeader
// ---------------------------------------------------------------------------

test('findJoinHeader finds the study_id column under any spelling', () => {
  assert.equal(findJoinHeader(['age', 'study_id']), 'study_id');
  assert.equal(findJoinHeader(['Study ID', 'age']), 'Study ID');
  assert.equal(findJoinHeader(['studyId']), 'studyId');
});

test('findJoinHeader returns null when no header normalises to studyid', () => {
  assert.equal(findJoinHeader(['id', 'age', 'patient_id']), null);
  assert.equal(findJoinHeader([]), null);
});

// ---------------------------------------------------------------------------
// joinClinical
// ---------------------------------------------------------------------------

const JOIN_MAPPING = [
  { src: 'study_id', dest: null },
  { src: 'age_yrs', dest: 'Age' },
];

test('joinClinical matches a row to the film whose stem equals its study_id, case-insensitively', () => {
  const files = ['C:\\films\\SP001.dcm', 'C:\\films\\sub\\sp002.PNG'];
  const join = joinClinical({
    files,
    headers: ['study_id', 'age_yrs'],
    rows: [{ study_id: 'sp001', age_yrs: '58' }, { study_id: 'SP002', age_yrs: '61' }],
    mapping: JOIN_MAPPING,
  });
  assert.equal(join.joinHeader, 'study_id');
  assert.equal(join.matched, 2);
  assert.equal(join.unmatched, 0);
  assert.equal(join.duplicates, 0);
  assert.equal(join.ambiguous, 0);
  assert.deepEqual(join.byFile.get('C:\\films\\SP001.dcm'), { Age: '58' });
  assert.deepEqual(join.byFile.get('C:\\films\\sub\\sp002.PNG'), { Age: '61' });
});

test('joinClinical counts a row with a blank study_id as unmatched', () => {
  const join = joinClinical({
    files: ['a.png'],
    headers: ['study_id', 'age_yrs'],
    rows: [{ study_id: '   ', age_yrs: '58' }, { study_id: '', age_yrs: '61' }],
    mapping: JOIN_MAPPING,
  });
  assert.equal(join.matched, 0);
  assert.equal(join.unmatched, 2);
  assert.equal(join.byFile.size, 0);
});

test('joinClinical with no study_id column links nothing and counts every row as unmatched', () => {
  const join = joinClinical({
    files: ['a.png', 'b.png'],
    headers: ['id', 'age_yrs'],
    rows: [{ id: 'a', age_yrs: '58' }, { id: 'b', age_yrs: '61' }, { id: 'c', age_yrs: '70' }],
    mapping: [{ src: 'id', dest: null }, { src: 'age_yrs', dest: 'Age' }],
  });
  assert.deepEqual(join, {
    joinHeader: null, byFile: new Map(), rowByFile: new Map(), matched: 0, unmatched: 3, duplicates: 0, ambiguous: 0,
  });
});

test('joinClinical keeps the first row for a repeated study_id and counts the rest as duplicates', () => {
  const join = joinClinical({
    files: ['a.png'],
    headers: ['study_id', 'age_yrs'],
    rows: [{ study_id: 'a', age_yrs: '58' }, { study_id: 'A', age_yrs: '99' }],
    mapping: JOIN_MAPPING,
  });
  assert.equal(join.matched, 1);
  assert.equal(join.duplicates, 1);
  assert.equal(join.unmatched, 0);
  assert.deepEqual(join.byFile.get('a.png'), { Age: '58' });
});

test('joinClinical attaches a row to no film when two films share its stem, and counts it ambiguous', () => {
  const join = joinClinical({
    files: ['C:\\films\\batch1\\SP001.dcm', 'C:\\films\\batch2\\SP001.png'],
    headers: ['study_id', 'age_yrs'],
    rows: [{ study_id: 'SP001', age_yrs: '58' }],
    mapping: JOIN_MAPPING,
  });
  assert.equal(join.ambiguous, 1);
  assert.equal(join.matched, 0);
  assert.equal(join.unmatched, 0);
  assert.equal(join.byFile.size, 0);
});

test('joinClinical copies only mapped columns under their dest names and trims key and values', () => {
  const join = joinClinical({
    files: ['a.png'],
    headers: ['study_id', 'age_yrs', 'sex', 'tx_plan'],
    rows: [{ study_id: ' a ', age_yrs: ' 58 ', sex: 'F', tx_plan: 'Fusion' }],
    mapping: [
      { src: 'study_id', dest: null },
      { src: 'age_yrs', dest: 'Age' },
      { src: 'sex', dest: 'Sex' },
      { src: 'tx_plan', dest: null },
    ],
  });
  assert.equal(join.matched, 1);
  assert.deepEqual(join.byFile.get('a.png'), { Age: '58', Sex: 'F' });
});

test('joinClinical skips empty and whitespace-only values so absent data stays absent', () => {
  const join = joinClinical({
    files: ['a.png'],
    headers: ['study_id', 'age_yrs', 'sex'],
    rows: [{ study_id: 'a', age_yrs: '', sex: '  ' }],
    mapping: [
      { src: 'study_id', dest: null },
      { src: 'age_yrs', dest: 'Age' },
      { src: 'sex', dest: 'Sex' },
    ],
  });
  assert.equal(join.matched, 1);
  assert.deepEqual(join.byFile.get('a.png'), {});
  assert.equal('Age' in join.byFile.get('a.png'), false);
});

// ---------------------------------------------------------------------------
// clinicalFieldNames
// ---------------------------------------------------------------------------

test('clinicalFieldNames lists known fields in KNOWN_FIELDS order, then custom fields in first-seen order', () => {
  const studies = [
    { id: 'SP-1000', clinical: { Notes: 'x', Zeta: '1' } },
    { id: 'SP-1001', clinical: { Age: '58', Alpha: '2' } },
    { id: 'SP-1002', clinical: {} },
  ];
  assert.deepEqual(clinicalFieldNames(studies), ['Age', 'Notes', 'Zeta', 'Alpha']);
});

test('clinicalFieldNames returns [] with no clinical data and never repeats a field', () => {
  assert.deepEqual(clinicalFieldNames([]), []);
  assert.deepEqual(clinicalFieldNames([{ id: 'SP-1000', clinical: {} }, { id: 'SP-0042' }]), []);
  assert.deepEqual(
    clinicalFieldNames([{ id: 'SP-1000', clinical: { Age: '58' } }, { id: 'SP-1001', clinical: { Age: '61' } }]),
    ['Age'],
  );
});

// ---------------------------------------------------------------------------
// Structural columns (pre-op/post-op spec §8.2): subject, timepoint, film date, view.

test('findStructuralHeaders recognises the §8.2 aliases by normalised name, first header wins, and never a bare date', () => {
  assert.deepEqual(findStructuralHeaders(['study_id', 'Subject ID', 'Time_Point', 'Study Date', 'Position']),
    { subjectId: 'Subject ID', timepoint: 'Time_Point', filmDate: 'Study Date', view: 'Position' });
  assert.deepEqual(findStructuralHeaders(['subject', 'visit', 'film_date', 'view', 'subject_id']),
    { subjectId: 'subject', timepoint: 'visit', filmDate: 'film_date', view: 'view' });
  assert.deepEqual(findStructuralHeaders(['study_id', 'date', 'age']), { subjectId: null, timepoint: null, filmDate: null, view: null });
  assert.deepEqual(findStructuralHeaders([]), { subjectId: null, timepoint: null, filmDate: null, view: null });
  assert.equal(structuralField('Time_Point', ['study_id', 'Time_Point']), 'timepoint');
  assert.equal(structuralField('subject_id', ['subject', 'subject_id']), null);
  assert.equal(structuralField('age', ['age']), null);
  assert.deepEqual(STRUCTURAL_LABELS, { subjectId: 'Subject', timepoint: 'Timepoint', filmDate: 'Film date', view: 'View' });
});

test('structuralFromRow trims, normalises a known timepoint or view, keeps a custom one, and parses both date forms', () => {
  const structural = findStructuralHeaders(['subject_id', 'timepoint', 'film_date', 'view']);
  assert.deepEqual(structuralFromRow({ subject_id: ' S001 ', timepoint: 'preop', film_date: '3/2/2025', view: ' Supine lateral ' }, structural),
    { subjectId: 'S001', timepoint: 'Pre-op', filmDate: '2025-03-02', view: 'Supine lateral', badDate: false });
  assert.deepEqual(structuralFromRow({ subject_id: 'S002', timepoint: '6 weeks', film_date: '2025-09-14', view: '' }, structural),
    { subjectId: 'S002', timepoint: '6 wk', filmDate: '2025-09-14', view: null, badDate: false });
  assert.deepEqual(structuralFromRow({ subject_id: '', timepoint: 'baseline', film_date: '', view: 'flexion' }, structural),
    { subjectId: null, timepoint: 'baseline', filmDate: null, view: 'Flexion lateral', badDate: false });
  // An unknown position is kept as typed; a known one is stored as its label.
  assert.deepEqual(structuralFromRow({ subject_id: 'S005', timepoint: '', film_date: '', view: 'Sitting' }, structural),
    { subjectId: 'S005', timepoint: null, filmDate: null, view: 'Sitting', badDate: false });
  // A rejected date is not written and is flagged; a column the CSV lacks supplies nothing.
  assert.deepEqual(structuralFromRow({ subject_id: 'S003', timepoint: '', film_date: '2025-02-30', view: '' }, structural),
    { subjectId: 'S003', timepoint: null, filmDate: null, view: null, badDate: true });
  assert.deepEqual(structuralFromRow({ subject_id: 'S004' }, findStructuralHeaders(['study_id', 'subject_id'])),
    { subjectId: 'S004', timepoint: null, filmDate: null, view: null, badDate: false });
});

test('autoMap never claims a structural header as a clinical field', () => {
  assert.deepEqual(autoMap(['subject_id', 'timepoint', 'film_date', 'view', 'age']), [
    { src: 'subject_id', dest: null }, { src: 'timepoint', dest: null }, { src: 'film_date', dest: null },
    { src: 'view', dest: null }, { src: 'age', dest: 'Age' },
  ]);
  // A second subject column is not structural (the first wins) and is not a known field either.
  assert.deepEqual(autoMap(['subject', 'subject_id']), [{ src: 'subject', dest: null }, { src: 'subject_id', dest: null }]);
});

test('joinClinical hands back the matched raw row under the same file key, and a structural column never reaches clinical', () => {
  const join = joinClinical({
    files: ['C:\\films\\a.png', 'C:\\films\\b.png'],
    headers: ['study_id', 'timepoint', 'age_yrs'],
    rows: [{ study_id: 'a', timepoint: 'preop', age_yrs: '58' }, { study_id: 'zzz', timepoint: 'postop', age_yrs: '1' }],
    mapping: [{ src: 'study_id', dest: null }, { src: 'timepoint', dest: null }, { src: 'age_yrs', dest: 'Age' }],
  });
  assert.deepEqual(join.rowByFile.get('C:\\films\\a.png'), { study_id: 'a', timepoint: 'preop', age_yrs: '58' });
  assert.equal(join.rowByFile.has('C:\\films\\b.png'), false);
  assert.equal(join.rowByFile.size, 1);
  assert.deepEqual(join.byFile.get('C:\\films\\a.png'), { Age: '58' });
});

// ---------------------------------------------------------------------------
// the paired export (pre-op/post-op spec §11.2)
// ---------------------------------------------------------------------------

test('delta1 is post minus pre over the one-decimal forms of each, to one decimal, and empty when either side is absent', () => {
  assert.equal(delta1(21.4, 14.0), -7.4);
  assert.equal(delta1(52.1, 52.3), 0.2);          // 52.3 - 52.1 is 0.1999… in floating point
  assert.equal(delta1(38.2, 49.1), 10.9);
  assert.equal(delta1(21.36, 14.04), -7.4);       // over 21.4 and 14.0, not -7.3 over the raw values
  assert.equal(delta1(5, 5), 0);
  assert.equal(delta1('', 5), '');
  assert.equal(delta1(5, ''), '');
  assert.equal(delta1(undefined, 5), '');
  assert.equal(delta1(NaN, 1), '');
  assert.equal(delta1(1, Infinity), '');
});

const PAIR_PRE = { PI: 52.1, PT: 21.4, SS: 30.7, L1PA: 9.9, LL: { 'L1-S1': 38.2, 'L2-S1': 33.0, 'L3-S1': 25.1, 'L4-S1': 15.6, 'L5-S1': 5.2 } };
const PAIR_POST = { PI: 52.3, PT: 14.0, SS: 38.3, L1PA: 8.1, LL: { 'L1-S1': 49.1, 'L2-S1': 41.0, 'L3-S1': 30.2, 'L4-S1': 18.0, 'L5-S1': 6.4 } };
const PAIR_YEAR = { PI: 52.0, PT: 15.1, SS: 36.9, LL: { 'L1-S1': 47.5 } };

// S001 has Pre-op, Post-op and 1 yr films; S002 has Pre-op and 1 yr; S003 has only a Post-op film
// (unpaired, and its clinical key must add no column).
function pairedRows() {
  return [
    study({ id: 'SP-1000', subjectId: 'S001', timepoint: 'Pre-op', filmDate: '2025-03-02', measurements: PAIR_PRE, clinical: { Age: '61', Sex: 'F' } }),
    study({ id: 'SP-1001', subjectId: 'S001', timepoint: 'Post-op', filmDate: '2025-09-14', measurements: PAIR_POST, clinical: { Age: '61', ODI: '18' } }),
    study({ id: 'SP-1002', subjectId: 'S001', timepoint: '1 yr', filmDate: '2026-03-20', view: 'Prone lateral', measurements: PAIR_YEAR, clinical: {} }),
    study({ id: 'SP-1003', subjectId: 'S002', timepoint: 'Pre-op', filmDate: '2025-04-11', measurements: { PI: 48.6, PT: 12.1, SS: 36.5, LL: { 'L1-S1': 49.0 } }, clinical: { Age: '58' } }),
    study({ id: 'SP-1004', subjectId: 'S002', timepoint: '1 yr', filmDate: '2026-04-02', measurements: { PI: 48.9, PT: 9.8, SS: 39.1, LL: { 'L1-S1': 50.2 } }, clinical: {} }),
    study({ id: 'SP-1005', subjectId: 'S003', timepoint: 'Post-op', clinical: { Notes: 'unpaired, adds no column' } }),
  ];
}

const MEASURES = ['LL L1-S1', 'PI', 'PT', 'SS', 'PI-LL Mismatch', 'L1PA', 'LL L2-S1', 'LL L3-S1', 'LL L4-S1', 'LL L5-S1',
  ...['L1-L2', 'L2-L3', 'L3-L4', 'L4-L5', 'L5-S1'].flatMap(level =>
    ['anterior', 'middle', 'posterior'].map(position => `Disc height ${level} ${position} (mm)`))];

test('toPairedCsv leads with the citation block and writes the layout-B header over the visits present', () => {
  const lines = toPairedCsv(pairStudies(pairedRows())).split('\r\n');
  assert.equal(lines[0], '# Spine Contour export');
  assert.match(lines[1], /^# Created by /);
  assert.match(lines[2], /NOT FOR CLINICAL USE/);
  const header = lines[3].split(',');
  assert.deepEqual(header.slice(0, 10), [
    'Subject', 'Pre-op study', 'Post-op study', '1 yr study', 'Pre-op view', 'Post-op view', '1 yr view',
    'Pre-op film date', 'Post-op film date', '1 yr film date',
  ]);
  // Each measurement's trajectory is contiguous: Pre-op, then value and Delta per later visit.
  assert.deepEqual(header.slice(10, 20), [
    'LL L1-S1 Pre-op', 'LL L1-S1 Post-op', 'Delta LL L1-S1 Post-op', 'LL L1-S1 1 yr', 'Delta LL L1-S1 1 yr',
    'PI Pre-op', 'PI Post-op', 'Delta PI Post-op', 'PI 1 yr', 'Delta PI 1 yr',
  ]);
  assert.deepEqual(header.slice(10), [
    ...MEASURES.flatMap((m) => [`${m} Pre-op`, `${m} Post-op`, `Delta ${m} Post-op`, `${m} 1 yr`, `Delta ${m} 1 yr`]),
    'Age Pre-op', 'Age Post-op', 'Age 1 yr', 'Sex Pre-op', 'Sex Post-op', 'Sex 1 yr', 'ODI Pre-op', 'ODI Post-op', 'ODI 1 yr',
  ]);
  assert.equal(header.length, 144);
  assert.ok(!lines[3].includes('Notes'), 'an unpaired subject\'s clinical key adds no column');
  // Two subjects written, then the trailing CRLF.
  assert.equal(lines.length, 7);
  assert.equal(lines[6], '');
});

test('toPairedCsv writes one row per subject with the deltas over the written one-decimal values and empty cells for a missing visit', () => {
  const lines = toPairedCsv(pairStudies(pairedRows())).split('\r\n');
  assert.equal(lines[4], [
    'S001', 'SP-1000', 'SP-1001', 'SP-1002', 'Standing lateral', 'Standing lateral', 'Prone lateral', '2025-03-02', '2025-09-14', '2026-03-20',
    '38.2', '49.1', '10.9', '47.5', '9.3',       // LL L1-S1
    '52.1', '52.3', '0.2', '52', '-0.1',         // PI
    '21.4', '14', '-7.4', '15.1', '-6.3',        // PT
    '30.7', '38.3', '7.6', '36.9', '6.2',        // SS
    '13.9', '3.2', '-10.7', '4.5', '-9.4',       // PI-LL Mismatch, derived per film then differenced
    '9.9', '8.1', '-1.8', '', '',                // L1PA: absent at 1 yr, so that value and its delta are empty
    '33', '41', '8', '', '',                     // LL L2-S1
    '25.1', '30.2', '5.1', '', '',                // LL L3-S1
    '15.6', '18', '2.4', '', '',                 // LL L4-S1
    '5.2', '6.4', '1.2', '', '',                 // LL L5-S1
    ...Array(75).fill(''),                     // 15 disc heights × five value/delta cells; no geometry/scale
    '61', '61', '', 'F', '', '', '', '18', '',   // Age, Sex, ODI per visit
  ].join(','));
  assert.equal(lines[5], [
    'S002', 'SP-1003', '', 'SP-1004', 'Standing lateral', '', 'Standing lateral', '2025-04-11', '', '2026-04-02',
    '49', '', '', '50.2', '1.2',
    '48.6', '', '', '48.9', '0.3',
    '12.1', '', '', '9.8', '-2.3',
    '36.5', '', '', '39.1', '2.6',
    '-0.4', '', '', '-1.3', '-0.9',
    '', '', '', '', '',
    '', '', '', '', '',
    '', '', '', '', '',
    '', '', '', '', '',
    '', '', '', '', '',
    ...Array(75).fill(''),
    '58', '', '', '', '', '', '', '', '',
  ].join(','));
  assert.equal(lines[5].split(',').length, 144);
  assert.ok(!lines.join('\n').includes('NaN'));
});

test('toPairedCsv under a single label writes the two-visit file with that label only', () => {
  const lines = toPairedCsv(pairStudies(pairedRows(), { post: 'Post-op' })).split('\r\n');
  const header = lines[3].split(',');
  assert.deepEqual(header.slice(0, 10), [
    'Subject', 'Pre-op study', 'Post-op study', 'Pre-op view', 'Post-op view', 'Pre-op film date', 'Post-op film date',
    'LL L1-S1 Pre-op', 'LL L1-S1 Post-op', 'Delta LL L1-S1 Post-op',
  ]);
  assert.equal(header.length, 88);
  assert.equal(lines.length, 6, 'S001 only: S002 has no Post-op film and S003 no Pre-op film');
  assert.ok(lines[4].startsWith('S001,SP-1000,SP-1001,Standing lateral,Standing lateral,2025-03-02,2025-09-14,38.2,49.1,10.9,52.1,52.3,0.2,'));
  assert.ok(!lines[3].includes('1 yr'));
});

test('toPairedCsv writes empty measurement and delta cells for an unsegmented film rather than dropping the subject', () => {
  const rows = [
    study({ id: 'SP-1000', subjectId: 'S001', timepoint: 'Pre-op', measurements: null }),
    study({ id: 'SP-1001', subjectId: 'S001', timepoint: 'Post-op', measurements: PAIR_POST }),
  ];
  const lines = toPairedCsv(pairStudies(rows)).split('\r\n');
  const cells = lines[4].split(',');
  assert.deepEqual(cells.slice(0, 7), ['S001', 'SP-1000', 'SP-1001', 'Standing lateral', 'Standing lateral', '', '']);
  assert.deepEqual(cells.slice(7, 13), ['', '49.1', '', '', '52.3', '']);
  assert.equal(cells.length, 82);
});

test('toPairedCsv never writes a demo row and quotes a label or value that needs it', () => {
  const rows = [
    study({ id: 'SP-0042', source: 'demo', subjectId: 'P-8841', timepoint: 'Pre-op', measurements: PAIR_PRE }),
    study({ id: 'SP-0039', source: 'demo', subjectId: 'P-8841', timepoint: 'Post-op', measurements: PAIR_POST }),
    study({ id: 'SP-1000', subjectId: 'S001', timepoint: 'Pre-op', measurements: PAIR_PRE, clinical: { Diagnosis: 'Spondylolisthesis, grade 2' } }),
    study({ id: 'SP-1001', subjectId: 'S001', timepoint: '6 wk, standing', measurements: PAIR_POST }),
  ];
  const csv = toPairedCsv(pairStudies(rows));
  assert.ok(!csv.includes('P-8841'));
  assert.ok(!csv.includes('SP-0042'));
  assert.ok(csv.includes('"6 wk, standing study"'));
  assert.ok(csv.includes('"Spondylolisthesis, grade 2"'));
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 6);
});

test('toPairedCsv writes a merged visit\'s films joined with +, and a disagreements column per visit when any visit merged', () => {
  const rows = [
    study({ id: 'SP-1000', subjectId: 'sub225', timepoint: 'Pre-op', filmDate: '2023-10-23', measurements: { SS: 43.7, LL: { 'L1-S1': 56.0 } }, clinical: { Age: '70' } }),
    study({ id: 'SP-1001', subjectId: 'sub225', timepoint: 'Pre-op', filmDate: '2023-10-23', note: 'femoral heads', measurements: { PI: 62.3, PT: 18.1, SS: 44.2 }, clinical: { Sex: 'M' } }),
    study({ id: 'SP-1002', subjectId: 'sub225', timepoint: 'Post-op', filmDate: '2024-03-22', measurements: PAIR_POST }),
  ];
  const lines = toPairedCsv(pairStudies(rows)).split('\r\n');
  const header = lines[3].split(',');
  assert.deepEqual(header.slice(0, 14), [
    'Subject', 'Pre-op study', 'Post-op study', 'Pre-op view', 'Post-op view', 'Pre-op film date', 'Post-op film date',
    'Pre-op disagreements', 'Post-op disagreements', 'Pre-op derived across films', 'Post-op derived across films',
    'LL L1-S1 Pre-op', 'LL L1-S1 Post-op', 'Delta LL L1-S1 Post-op',
  ]);
  const cells = lines[4].split(',');
  assert.deepEqual(cells.slice(0, 9), ['sub225', 'SP-1000 + SP-1001', 'SP-1002', 'Standing lateral', 'Standing lateral', '2023-10-23', '2024-03-22', 'SS', '']);
  // The derived-across-films cell names the column and the film each input came from; it holds
  // a comma, so the writer quotes it.
  assert.equal(cells[9], '"PI-LL Mismatch: PI from SP-1001');
  assert.equal(cells[10], ' LL L1-S1 from SP-1000"');
  assert.equal(cells[11], '');
  // LL from the unnoted film, PI and PT from the noted one, SS from the unnoted one; the mismatch
  // is derived from the merged PI and LL (62.3 - 56) and its delta from the written cells.
  assert.deepEqual(cells.slice(12, 27), ['56', '49.1', '-6.9', '62.3', '52.3', '-10', '18.1', '14', '-4.1', '43.7', '38.3', '-5.4', '6.3', '3.2', '-3.1']);
  // Clinical values merge the same way: Age from the unnoted film, Sex from the noted one.
  assert.ok(lines[4].endsWith(',70,,M,'), lines[4]);
  assert.equal(lines.length, 6);
});

test('toPairedCsv numbers a label\'s column groups when a subject has several visits on it, in date order, blank where a subject has fewer', () => {
  const rows = [
    study({ id: 'SP-1000', subjectId: 'S001', timepoint: 'Pre-op', filmDate: '2024-01-02', measurements: PAIR_PRE }),
    study({ id: 'SP-1001', subjectId: 'S001', timepoint: 'Post-op', filmDate: '2024-05-31', measurements: PAIR_YEAR }),
    study({ id: 'SP-1002', subjectId: 'S001', timepoint: 'Post-op', filmDate: '2024-04-30', measurements: PAIR_POST }),
    study({ id: 'SP-1003', subjectId: 'S002', timepoint: 'Pre-op', filmDate: '2024-02-01', measurements: PAIR_PRE }),
    study({ id: 'SP-1004', subjectId: 'S002', timepoint: 'Post-op', filmDate: '2024-06-01', measurements: PAIR_POST }),
  ];
  const lines = toPairedCsv(pairStudies(rows)).split('\r\n');
  const header = lines[3].split(',');
  assert.deepEqual(header.slice(0, 15), [
    'Subject', 'Pre-op study', 'Post-op 1 study', 'Post-op 2 study', 'Pre-op view', 'Post-op 1 view', 'Post-op 2 view',
    'Pre-op film date', 'Post-op 1 film date', 'Post-op 2 film date',
    'LL L1-S1 Pre-op', 'LL L1-S1 Post-op 1', 'Delta LL L1-S1 Post-op 1', 'LL L1-S1 Post-op 2', 'Delta LL L1-S1 Post-op 2',
  ]);
  assert.ok(lines[4].startsWith('S001,SP-1000,SP-1002,SP-1001,Standing lateral,Standing lateral,Standing lateral,2024-01-02,2024-04-30,2024-05-31,38.2,49.1,10.9,47.5,9.3,'), lines[4]);
  assert.ok(lines[5].startsWith('S002,SP-1003,SP-1004,,Standing lateral,Standing lateral,,2024-02-01,2024-06-01,,38.2,49.1,10.9,,,'), lines[5]);
  // No visit merged films, so neither the disagreements nor the derived-across-films columns.
  assert.ok(!lines[3].includes('disagreements'));
  assert.ok(!lines[3].includes('derived across films'));
});

test('toPairedCsv over a pairing with nothing written is the citation block and a Pre-op-only header', () => {
  const lines = toPairedCsv(pairStudies([study({ id: 'SP-1000', subjectId: 'S001', timepoint: 'Pre-op' })])).split('\r\n');
  assert.equal(lines.length, 5);
  assert.ok(lines[3].startsWith('Subject,Pre-op study,Pre-op view,Pre-op film date,LL L1-S1 Pre-op,PI Pre-op,'));
  assert.equal(lines[3].split(',').length, 29);
});
