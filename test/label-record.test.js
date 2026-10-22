import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LABEL_SCHEMA, viewSlug, appVersion, labelFileName, toLabelRecord, recordLevels, recordComment, normalizeComment,
} from '../renderer/data/label-record.js';
import {
  LEVEL_CODES, kindOf, levelState, trainingStatus, openEditor, setLevelGeometry, toggleVisible,
  startPlacing, addPoint, finishPlacing, pointKeys, setComment,
} from '../renderer/data/levels.js';
import { VERSION_LABEL } from '../renderer/data/version.js';
import { isLabelFileName } from '../bundle-io.js';
import { validateAgainst } from './fixtures/schema-check.js';

const SCHEMA = JSON.parse(fs.readFileSync(new URL('../docs/design/level-editor/label-record.schema.json', import.meta.url), 'utf8'));
const EXAMPLE = JSON.parse(fs.readFileSync(new URL('../docs/design/level-editor/label-record.example.json', import.meta.url), 'utf8'));

const SHA = 'a'.repeat(64);
const IMAGE = { file: 'lateral_lumbar_001.dcm', sha256: SHA, width: 200, height: 160 };
const MODEL = { name: 'U-Net', version: '2026-09-01' };
const SAVED_AT = '2026-10-10T15:00:00Z';
const STUDY = { id: 'SP-0001', fileName: 'lateral_lumbar_001.dcm', name: 'My film', view: 'Standing lateral', region: 'lumbar' };
// The shipped version without its leading 'v' (the final review's minor 1: no test pins a release number).
const SHIPPED_VERSION = VERSION_LABEL.replace(/^v/, '');

// ---------- fixtures (inline: the study geometry shape the app stores) ----------

function body(x, y) {
  return {
    superior: [[x, y], [x + 10, y]],
    inferior: [[x, y + 10], [x + 10, y + 10]],
    quadrilateral: [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]],
  };
}

// Lumbar film with L3 missing: L1, L2, L4, L5, S1 and both femoral heads.
function lumbarGeometry() {
  return {
    region: 'lumbar',
    vertebrae: { L1: body(10, 10), L2: body(10, 30), L4: body(10, 70), L5: body(10, 90) },
    s1_superior: [[10, 110], [20, 110]],
    femoral_circles: [[10, 140, 5], [20, 140, 5]],
  };
}

function cervicalGeometry() {
  return {
    region: 'cervical',
    vertebrae: {
      C2: { superior: null, inferior: [[40, 20], [50, 20]], quadrilateral: null },
      C3: body(10, 30), C4: body(10, 50), C5: body(10, 70), C6: body(10, 90), C7: body(10, 110),
    },
    c2_centroid: [45, 12],
  };
}

function fullGeometry() {
  const cervical = cervicalGeometry();
  const lumbar = lumbarGeometry();
  return {
    region: 'full_spine',
    vertebrae: { ...cervical.vertebrae, ...lumbar.vertebrae },
    c2_centroid: cervical.c2_centroid,
    s1_superior: lumbar.s1_superior,
    femoral_circles: lumbar.femoral_circles,
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function editorFor(geometry, region, extra = {}) {
  return openEditor({ study: { id: 'SP-0001', geometry, labelFile: null }, region, modelGeometry: geometry, saved: null, ...extra });
}

const lumbarEditor = () => editorFor(lumbarGeometry(), 'lumbar');

const record = (editor, extra = {}) => toLabelRecord({
  editor, study: STUDY, image: IMAGE, model: MODEL, appVersion: '1.0.17', savedAt: SAVED_AT, contours: {}, ...extra,
});

// A full-spine film in every state: C2 (edited), C3 (segmented), C4 (edited), C7 (not visible), T1 (manual),
// T4 (not placed), L2 (edited), L3 (manual), S1 (edited), Head 1 (edited, four rim points), Head 2 (segmented).
function sinkEditor() {
  let e = editorFor(fullGeometry(), 'full_spine');
  e = setLevelGeometry(e, 'C2', { inferior: [[41, 20], [50, 20]], centroid: [46, 13] });
  e = setLevelGeometry(e, 'C4', { superior: [[11, 50], [21, 50]], inferior: [[11, 60], [21, 60]] });
  e = toggleVisible(e, 'C7');
  e = setLevelGeometry(e, 'T1', { superior: [[30, 5], [60, 7]] });
  e = setLevelGeometry(e, 'L2', { superior: [[10, 30], [20, 31]], inferior: [[10, 40], [20, 40]] });
  e = setLevelGeometry(e, 'L3', { superior: [[10, 50], [20, 50]], inferior: [[10, 60], [20, 60]] });
  e = setLevelGeometry(e, 'S1', { superior: [[10, 111], [20, 110]] });
  e = setLevelGeometry(e, 'FH1', { center: [11, 141], radius: 6, rim: [[5, 141], [17, 141], [11, 135], [11, 147]] });
  return e;
}

function assertValid(value) {
  const result = validateAgainst(SCHEMA, value);
  assert.ok(result.ok, result.errors.join('\n'));
}

function failsAt(value, where) {
  const result = validateAgainst(SCHEMA, value);
  assert.equal(result.ok, false, `expected a failure at ${where}`);
  assert.ok(result.errors.some(error => error.startsWith(where)), result.errors.join('\n'));
}

// (D18) The record's entries, levels and heads together, and the edits summary computed from them alone.
const entriesOf = rec => [...Object.values(rec.levels), ...rec.femoral_heads];

function summaryOf(rec) {
  const entries = entriesOf(rec);
  const count = state => entries.filter(entry => entry.state === state).length;
  const points = state => entries.filter(entry => entry.state === state).reduce((n, entry) => n + entry.edited_points.length, 0);
  return {
    segmented: count('segmented'), edited: count('edited'), manual: count('manual'), not_placed: count('not_placed'),
    not_visible: count('not_visible'), points_moved: points('edited'), points_placed: points('manual'),
  };
}

// (R39) A record as saved before D18: no edits, and no edited_points on any entry.
function withoutD18(rec) {
  const old = structuredClone(rec);
  delete old.edits;
  entriesOf(old).forEach(entry => delete entry.edited_points);
  return old;
}

// ---------- the schema and the checker ----------

test('the shipped example validates against the schema', () => {
  const result = validateAgainst(SCHEMA, EXAMPLE);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(result.errors, []);
});

test('a record missing femoral_heads fails', () => {
  const { femoral_heads: _heads, ...rest } = EXAMPLE;
  const result = validateAgainst(SCHEMA, rest);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('/femoral_heads')), result.errors.join('\n'));
});

test('the schema description records the C2 decision', () => {
  assert.match(SCHEMA.description, /C2 is an inferior endplate plus a centroid \(owner decision 2026-10-10\)\./);
  assert.equal(SCHEMA.properties.levels.properties.C2.$ref, '#/$defs/c2');
});

test('the amended schema holds C2 to {ia, ip}, a centroid and both model fields when placed', () => {
  const base = toLabelRecord({ editor: sinkEditor(), study: STUDY, image: IMAGE, model: MODEL, appVersion: '1.0.17', savedAt: SAVED_AT, contours: {} });
  assertValid(base);
  assert.equal(base.levels.C2.state, 'edited');
  const withC2 = patch => ({ ...base, levels: { ...base.levels, C2: patch(structuredClone(base.levels.C2)) } });
  const failsAt = (value, where) => {
    const result = validateAgainst(SCHEMA, value);
    assert.equal(result.ok, false, `expected a failure at ${where}`);
    assert.ok(result.errors.some(error => error.startsWith(where)), result.errors.join('\n'));
  };

  failsAt(withC2(c2 => { delete c2.centroid; return c2; }), '/levels/C2/centroid');
  failsAt(withC2(c2 => { delete c2.model_centroid; return c2; }), '/levels/C2/model_centroid');
  failsAt(withC2(c2 => { delete c2.model_corners; return c2; }), '/levels/C2/model_corners');
  failsAt(withC2(c2 => { c2.model_corners = null; return c2; }), '/levels/C2/model_corners');
  // (2026-10-21, partial endplates) an edited C2's model_centroid may be null: the model placed none.
  assertValid(withC2(c2 => { c2.model_centroid = null; return c2; }));
  failsAt(withC2(c2 => { c2.corners = { sa: [1, 1], sp: [2, 2], ia: [3, 3], ip: [4, 4] }; return c2; }), '/levels/C2/corners/sa');
  failsAt(withC2(c2 => { delete c2.corners.ip; return c2; }), '/levels/C2/corners/ip');
  failsAt(withC2(c2 => { c2.contour = null; return c2; }), '/levels/C2/contour');

  const manual = withC2(c2 => ({
    ...c2, state: 'manual', source: 'annotator', edited_points: ['ia', 'ip', 'centroid'], model_corners: null, model_centroid: null,
  }));
  assertValid(manual);
  failsAt(withC2(c2 => ({ ...c2, state: 'manual', edited_points: [], model_corners: null, model_centroid: null })), '/levels/C2/edited_points');
  failsAt(withC2(() => ({ state: 'not_visible', source: 'film_type', centroid: [1, 1] })), '/levels/C2');
  failsAt(withC2(() => ({ state: 'not_placed', source: 'film_type', corners: { ia: [1, 1], ip: [2, 2] } })), '/levels/C2');
  assertValid(withC2(() => ({ state: 'not_placed', source: 'film_type' })));
});

test('the schema check enforces the keywords the label record relies on', () => {
  const ok = (schema, value) => validateAgainst(schema, value);
  const point = { type: 'array', prefixItems: [{ type: 'number' }, { type: 'number' }], minItems: 2, maxItems: 2 };

  assert.equal(ok({ type: 'integer' }, 3).ok, true);
  assert.equal(ok({ type: 'integer' }, 3.5).ok, false);
  assert.equal(ok({ type: 'number' }, '3').ok, false);
  assert.equal(ok({ type: 'object' }, []).ok, false);
  assert.equal(ok({ type: 'array' }, {}).ok, false);
  assert.equal(ok({ type: 'null' }, null).ok, true);
  assert.equal(ok({ type: 'boolean' }, 0).ok, false);
  assert.equal(ok({ type: 'string' }, null).ok, false);

  assert.equal(ok({ const: 'a' }, 'a').ok, true);
  assert.equal(ok({ const: 'a' }, 'b').ok, false);
  assert.equal(ok({ const: { x: [1] } }, { x: [1] }).ok, true, 'const compares deeply');
  assert.equal(ok({ enum: [1, 2] }, 3).ok, false);
  assert.equal(ok({ enum: [1, 2] }, 2).ok, true);

  const strict = { type: 'object', additionalProperties: false, required: ['a'], properties: { a: { type: 'string' } } };
  assert.equal(ok(strict, { a: 'x' }).ok, true);
  const missing = ok(strict, {});
  assert.equal(missing.ok, false);
  assert.match(missing.errors[0], /^\/a: /);
  const extra = ok(strict, { a: 'x', b: 1 });
  assert.equal(extra.ok, false);
  assert.match(extra.errors[0], /^\/b: /);
  assert.match(ok(strict, { a: 1 }).errors[0], /^\/a: /, 'a nested failure names its pointer');
  assert.match(ok(strict, 5).errors[0], /^\(root\): /);
  assert.match(ok({ properties: { 'a/b': { type: 'string' } } }, { 'a/b': 1 }).errors[0], /^\/a~1b: /, 'pointers escape / and ~');

  assert.equal(ok(point, [1, 2]).ok, true);
  assert.equal(ok(point, [1]).ok, false, 'minItems');
  assert.equal(ok(point, [1, 2, 3]).ok, false, 'maxItems');
  assert.equal(ok(point, [1, 'x']).ok, false, 'prefixItems');
  assert.equal(ok({ type: 'array', items: { type: 'integer' } }, [1, 2.5]).errors[0].slice(0, 3), '/1:');
  assert.equal(ok({ prefixItems: [{ type: 'string' }], items: { type: 'integer' } }, ['a', 1, 2]).ok, true, 'items start after prefixItems');
  assert.equal(ok({ prefixItems: [{ type: 'string' }], items: { type: 'integer' } }, ['a', 1, 'b']).ok, false);

  assert.equal(ok({ minimum: 1 }, 0).ok, false);
  assert.equal(ok({ minimum: 1 }, 1).ok, true);
  assert.equal(ok({ exclusiveMinimum: 0 }, 0).ok, false);
  assert.equal(ok({ exclusiveMinimum: 0 }, 0.1).ok, true);
  assert.equal(ok({ minLength: 1 }, '').ok, false);
  assert.equal(ok({ pattern: '^[a-f0-9]{4}$' }, 'abcd').ok, true);
  assert.equal(ok({ pattern: '^[a-f0-9]{4}$' }, 'abcg').ok, false);

  assert.equal(ok({ allOf: [{ type: 'number' }, { minimum: 2 }] }, 1).ok, false);
  assert.equal(ok({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 1).ok, true);
  assert.equal(ok({ anyOf: [{ type: 'string' }, { type: 'number' }] }, null).ok, false);
  assert.equal(ok({ oneOf: [{ type: 'number' }, { minimum: 0 }] }, 1).ok, false, 'oneOf fails when two branches match');
  assert.equal(ok({ oneOf: [{ type: 'string' }, { type: 'number' }] }, 1).ok, true);
  assert.equal(ok({ oneOf: [{ type: 'string' }, { type: 'number' }] }, null).ok, false, 'oneOf fails when none match');
  assert.equal(ok({ not: { type: 'string' } }, 'x').ok, false);
  assert.equal(ok({ not: { type: 'string' } }, 1).ok, true);

  const conditional = { if: { properties: { k: { const: 1 } }, required: ['k'] }, then: { required: ['a'] }, else: { required: ['b'] } };
  assert.equal(ok(conditional, { k: 1, a: 0 }).ok, true);
  assert.equal(ok(conditional, { k: 1, b: 0 }).ok, false);
  assert.equal(ok(conditional, { k: 2, b: 0 }).ok, true);
  assert.equal(ok(conditional, { k: 2, a: 0 }).ok, false);
  assert.equal(ok(conditional, { b: 0 }).ok, true, 'an absent k does not satisfy the if when it lists required');

  const refs = { $defs: { n: { type: 'number' } }, properties: { x: { $ref: '#/$defs/n' } } };
  assert.equal(ok(refs, { x: 1 }).ok, true);
  assert.equal(ok(refs, { x: 'a' }).ok, false);

  assert.equal(ok({ format: 'date-time', description: 'd', examples: [1], title: 't', $id: 'i', $schema: 's' }, 'whatever').ok, true, 'annotations are ignored');
  assert.throws(() => ok({ contains: { type: 'string' } }, []), /unsupported keyword "contains"/);
  assert.throws(() => ok({ $ref: '#/$defs/missing' }, 1), /unknown \$ref/);
  assert.throws(() => ok({ additionalProperties: { type: 'string' } }, {}), /additionalProperties/);
});

test('the schema check enforces uniqueItems, an enum inside items, and an integer minimum (D18)', () => {
  const ok = (schema, value) => validateAgainst(schema, value);
  const keys = { type: 'array', uniqueItems: true, items: { enum: ['sa', 'sp'] } };
  assert.equal(ok(keys, []).ok, true);
  assert.equal(ok(keys, ['sa', 'sp']).ok, true);
  assert.equal(ok(keys, ['sp', 'sa']).ok, true, 'uniqueItems says nothing of order');
  const repeated = ok(keys, ['sa', 'sp', 'sa']);
  assert.equal(repeated.ok, false);
  assert.match(repeated.errors[0], /^\(root\): items 0 and 2 are equal \(uniqueItems\)/);
  const unknown = ok(keys, ['sa', 'ia']);
  assert.equal(unknown.ok, false, 'an enum inside items holds every item');
  assert.match(unknown.errors[0], /^\/1: /);
  assert.equal(ok({ uniqueItems: true }, [[1, 2], [1, 2]]).ok, false, 'items compare deeply');
  assert.equal(ok({ uniqueItems: true }, [{ a: 1 }, { a: 1 }]).ok, false);
  assert.equal(ok({ uniqueItems: true }, [1, '1', [1], { a: 1 }]).ok, true);
  assert.equal(ok({ uniqueItems: false }, [1, 1]).ok, true);
  assert.equal(ok({ uniqueItems: true }, 'not an array').ok, true, 'only arrays are held to it');
  assert.throws(() => ok({ uniqueItems: 'yes' }, []), /uniqueItems/);

  const count = { type: 'object', properties: { n: { type: 'integer', minimum: 0 } } };
  assert.equal(ok(count, { n: 0 }).ok, true);
  assert.equal(ok(count, { n: 3 }).ok, true);
  assert.match(ok(count, { n: -1 }).errors[0], /^\/n: must be >= 0/);
  assert.equal(ok(count, { n: 1.5 }).ok, false);
});

// ---------- viewSlug, appVersion, labelFileName ----------

test('viewSlug and appVersion', () => {
  assert.equal(viewSlug('Standing lateral'), 'standing_lateral');
  assert.equal(viewSlug('  Flexion  lateral '), 'flexion_lateral');
  assert.equal(viewSlug('Supine-lateral / 2'), 'supine_lateral_2');
  assert.equal(viewSlug(''), 'unknown');
  assert.equal(viewSlug('   '), 'unknown');
  assert.equal(viewSlug(null), 'unknown');
  assert.equal(viewSlug(undefined), 'unknown');
  assert.equal(viewSlug('???'), 'unknown');
  assert.equal(appVersion('v1.0.17'), '1.0.17');
  assert.equal(appVersion('1.0.17'), '1.0.17');
  assert.equal(appVersion(), SHIPPED_VERSION, 'defaults to the shipped VERSION_LABEL');
});

test('labelFileName suffixes a clash', () => {
  assert.equal(labelFileName('a', []), 'a.label.json');
  assert.equal(labelFileName('a', ['a.label.json']), 'a-2.label.json');
  assert.equal(labelFileName('a', ['a.label.json', 'a-2.label.json']), 'a-3.label.json');
  assert.equal(labelFileName('a', ['a-2.label.json']), 'a.label.json', 'a gap is not filled out of order');
  assert.equal(labelFileName('a', new Set(['a.label.json'])), 'a-2.label.json', 'any iterable');
  assert.equal(labelFileName('a', ['b.label.json', 'a.label.jsonx']), 'a.label.json');
  assert.equal(labelFileName('Film', ['film.label.json']), 'Film-2.label.json', 'Windows and macOS file names ignore case');
});

// The main process's own rule is bundle-io.js isLabelFileName, imported above: every name labelFileName returns must
// pass it.
test('labelFileName sanitises the stem so the main process accepts the name (R12)', () => {
  assert.equal(labelFileName('a:b*c?d"e<f>g|h', []), 'a_b_c_d_e_f_g_h.label.json', 'reserved characters become _');
  assert.equal(labelFileName('a\\b/c', []), 'a_b_c.label.json', 'both separators become _');
  assert.equal(labelFileName('tab\there\u0000\u001f', []), 'tab_here__.label.json', 'control characters become _');
  assert.equal(labelFileName('\u007fété', []), '\u007fété.label.json', 'DEL and non-ASCII letters are kept');
  assert.equal(labelFileName('..hidden', []), 'hidden.label.json', 'leading dots are stripped');
  assert.equal(labelFileName('a.b', []), 'a.b.label.json', 'an inner dot is kept');
  assert.equal(labelFileName('...', []), 'film.label.json', 'nothing left: film');
  assert.equal(labelFileName('', []), 'film.label.json', 'an empty stem: film');
  assert.equal(labelFileName('x'.repeat(250), []), `${'x'.repeat(180)}.label.json`, 'capped at 180 characters');
  const astral = `${'x'.repeat(179)}\u{1F600}`;
  assert.equal(labelFileName(astral, []), `${'x'.repeat(179)}.label.json`, 'the cap never splits a surrogate pair');
  for (const device of ['CON', 'prn', 'Aux', 'NUL', 'COM1', 'com9', 'LPT1', 'lpt9']) {
    assert.equal(labelFileName(device, []), `${device}_.label.json`, `${device} is a Windows device name`);
  }
  assert.equal(labelFileName('con.x', []), 'con_.x.label.json', 'a device name before the first dot is a device too');
  for (const plain of ['COM10', 'CONSOLE', 'LPT0', 'nul_', 'xCON']) {
    assert.equal(labelFileName(plain, []), `${plain}.label.json`, `${plain} is not a device name`);
  }
  assert.equal(labelFileName('a:b', ['A_B.label.json']), 'a_b-2.label.json', 'the clash check runs on the sanitised name');
  for (const stem of ['a:b', '..x', '', 'x'.repeat(250), 'CON', 'con.x', 'tab\t', '.', 'a b']) {
    for (const taken of [[], [labelFileName(stem, [])]]) {
      const name = labelFileName(stem, taken);
      assert.equal(isLabelFileName(name), true, `${JSON.stringify(stem)} gives a name the main process accepts`);
    }
  }
});

// ---------- toLabelRecord ----------

test('toLabelRecord from a lumbar editor validates and maps corners', () => {
  const e = lumbarEditor();
  const rec = record(e);
  assertValid(rec);
  assert.equal(rec.schema, LABEL_SCHEMA);
  assert.equal(LABEL_SCHEMA, 'spinecontour.segmentation-label/1');
  const l1 = e.levels.L1.geometry;
  assert.deepEqual(rec.levels.L1.corners.sa, l1.superior[0]);
  assert.deepEqual(rec.levels.L1.corners.sp, l1.superior[1]);
  assert.deepEqual(rec.levels.L1.corners.ia, l1.inferior[0]);
  assert.deepEqual(rec.levels.L1.corners.ip, l1.inferior[1]);
  assert.equal(rec.levels.L1.state, 'segmented');
  assert.equal(rec.levels.L1.source, 'model');
  assert.equal(rec.levels.L1.model_corners, null);
  assert.equal(rec.levels.L1.contour, null, 'contours were not supplied');
  assert.deepEqual(Object.keys(rec.levels), ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'T1', 'T4', 'L1', 'L2', 'L3', 'L4', 'L5', 'S1']);
  assert.deepEqual(rec.levels.S1.corners, { sa: [10, 110], sp: [20, 110] });
  assert.equal(rec.levels.S1.model_corners, null);
  assert.equal('contour' in rec.levels.S1, false, 'the endplate definition has no contour');
});

test('toLabelRecord writes the envelope: image, film, model, versions, time, completeness', () => {
  const e = lumbarEditor();
  const rec = record(e);
  assert.deepEqual(rec.image, { file: 'lateral_lumbar_001.dcm', sha256: SHA, width_px: 200, height_px: 160 });
  assert.deepEqual(rec.film, { region: 'lumbar', view: 'standing_lateral' });
  assert.deepEqual(rec.model, { name: 'U-Net', version: '2026-09-01' });
  assert.equal(rec.app_version, '1.0.17');
  assert.equal(rec.saved_at, SAVED_AT);
  assert.deepEqual(Object.keys(rec),
    ['schema', 'study', 'image', 'film', 'model', 'app_version', 'saved_at', 'complete', 'edits', 'comment', 'levels', 'femoral_heads']);
  assert.equal(rec.complete, false, 'L3 is visible and not placed');
  assert.equal(rec.complete, trainingStatus(e).complete);
  const done = setLevelGeometry(e, 'L3', { superior: [[10, 50], [20, 50]], inferior: [[10, 60], [20, 60]] });
  assert.equal(record(done).complete, true);
  assertValid(record(done));
  assertValid(rec);
  assert.equal(record(e, { appVersion: undefined }).app_version, SHIPPED_VERSION, 'the app version defaults to the shipped label');
});

test('toLabelRecord writes comment trimmed, null when blank, after edits and before levels; the example validates with one', () => {
  const e = lumbarEditor();
  const blank = record(e);
  assert.equal(blank.comment, null, 'no comment is null, not absent');
  assert.ok('comment' in blank);
  assertValid(blank);
  const typed = record(setComment(e, '  L5 is sacralised.\n'));
  assert.equal(typed.comment, 'L5 is sacralised.');
  assertValid(typed);
  assert.deepEqual(Object.keys(typed),
    ['schema', 'study', 'image', 'film', 'model', 'app_version', 'saved_at', 'complete', 'edits', 'comment', 'levels', 'femoral_heads']);
  assert.equal(record(setComment(e, '   \n')).comment, null, 'whitespace alone is no comment');
  assert.equal(record(setComment(e, 'x'.repeat(3000))).comment.length, 3000, 'nothing here truncates; the text box caps it');
  assert.equal(typeof EXAMPLE.comment, 'string', 'the shipped example carries one');
  assert.equal(validateAgainst(SCHEMA, EXAMPLE).ok, true);
});

test('the schema takes a comment that is a string or null, optional, and nothing else', () => {
  const rec = record(lumbarEditor());
  const { comment: _comment, ...without } = rec;
  assertValid(without);
  assertValid({ ...rec, comment: null });
  assertValid({ ...rec, comment: 'a note' });
  failsAt({ ...rec, comment: 42 }, '/comment');
  failsAt({ ...rec, comment: {} }, '/comment');
  failsAt({ ...rec, comment: ['a'] }, '/comment');
  assert.match(SCHEMA.properties.comment.description, /spec/i, 'the description names the spec');
});

test('film.region is the editor region, or the projection\'s reading of the placed levels for Auto', () => {
  const auto = (...placed) => {
    let e = editorFor(null, 'auto');
    for (const [code, geometry] of placed) e = setLevelGeometry(e, code, geometry);
    return record(e, { study: { ...STUDY, region: 'auto' } }).film.region;
  };
  const bodyGeometry = { superior: [[10, 10], [20, 10]], inferior: [[10, 20], [20, 20]] };
  assert.equal(record(editorFor(cervicalGeometry(), 'cervical')).film.region, 'cervical');
  assert.equal(record(editorFor(fullGeometry(), 'full_spine')).film.region, 'full_spine');
  assert.equal(auto(), 'lumbar', 'nothing placed reads as lumbar');
  assert.equal(auto(['C4', bodyGeometry]), 'cervical');
  assert.equal(auto(['L2', bodyGeometry]), 'lumbar');
  assert.equal(auto(['C4', bodyGeometry], ['L2', bodyGeometry]), 'full_spine');
  assert.equal(auto(['S1', { superior: [[1, 1], [9, 1]] }]), 'lumbar');
});

test('film.view is the view slug, unknown when the film has none', () => {
  const e = lumbarEditor();
  assert.equal(record(e, { study: { ...STUDY, view: 'Supine lateral' } }).film.view, 'supine_lateral');
  assert.equal(record(e, { study: { ...STUDY, view: '' } }).film.view, 'unknown');
  assert.equal(record(e, { study: { ...STUDY, view: undefined } }).film.view, 'unknown');
});

test('an edited level carries model_corners; a manual one carries null', () => {
  const e = sinkEditor();
  const rec = record(e);
  assertValid(rec);
  assert.equal(levelState(e.levels.L2, e.model.L2), 'edited');
  assert.equal(rec.levels.L2.state, 'edited');
  assert.equal(rec.levels.L2.source, 'annotator');
  assert.deepEqual(rec.levels.L2.corners, { sa: [10, 30], sp: [20, 31], ia: [10, 40], ip: [20, 40] });
  assert.deepEqual(rec.levels.L2.model_corners, { sa: [10, 30], sp: [20, 30], ia: [10, 40], ip: [20, 40] },
    'the model\'s own corners, mapped sa/sp/ia/ip');
  assert.equal(rec.levels.L3.state, 'manual');
  assert.equal(rec.levels.L3.model_corners, null);
  assert.deepEqual(rec.levels.L3.corners, { sa: [10, 50], sp: [20, 50], ia: [10, 60], ip: [20, 60] });
  assert.equal(rec.levels.C3.state, 'segmented');
  assert.equal(rec.levels.C3.model_corners, null);
  assert.equal(rec.levels.S1.state, 'edited');
  assert.deepEqual(rec.levels.S1.model_corners, { sa: [10, 110], sp: [20, 110] });
  assert.deepEqual(rec.levels.S1.corners, { sa: [10, 111], sp: [20, 110] });
  assert.equal(rec.levels.T1.state, 'manual');
  assert.deepEqual(rec.levels.T1.corners, { sa: [30, 5], sp: [60, 7] });
  assert.equal(rec.levels.T1.model_corners, null);
});

test('a not_visible or not_placed level carries only state, source and an empty edited_points', () => {
  const e = sinkEditor();
  const rec = record(e);
  assert.deepEqual(rec.levels.C7, { state: 'not_visible', source: 'annotator', edited_points: [] }, 'a hidden level\'s geometry is not recorded');
  assert.ok(e.levels.C7.geometry, 'the editor keeps the hidden level\'s geometry');
  assert.deepEqual(rec.levels.T4, { state: 'not_placed', source: 'film_type', edited_points: [] });
  const lumbar = record(lumbarEditor());
  assert.deepEqual(lumbar.levels.C4, { state: 'not_visible', source: 'film_type', edited_points: [] });
  assert.deepEqual(lumbar.levels.T1, { state: 'not_visible', source: 'film_type', edited_points: [] });
  assert.deepEqual(lumbar.levels.L3, { state: 'not_placed', source: 'film_type', edited_points: [] });
  assert.deepEqual(Object.keys(lumbar.levels.L3), ['state', 'source', 'edited_points']);
});

test('C2 writes corners {ia, ip} and a centroid', () => {
  const segmented = editorFor(cervicalGeometry(), 'cervical');
  const rec = record(segmented);
  assertValid(rec);
  assert.deepEqual(rec.levels.C2, {
    state: 'segmented', source: 'model', edited_points: [],
    corners: { ia: [40, 20], ip: [50, 20] }, centroid: [45, 12],
    model_corners: null, model_centroid: null,
  });
  assert.deepEqual(Object.keys(rec.levels.C2), ['state', 'source', 'edited_points', 'corners', 'centroid', 'model_corners', 'model_centroid']);
  assert.equal('contour' in rec.levels.C2, false);
  assert.equal(rec.levels.C3.state, 'segmented', 'C3 stays a four-corner body');
  assert.deepEqual(Object.keys(rec.levels.C3.corners), ['sa', 'sp', 'ia', 'ip']);

  const edited = record(sinkEditor());
  assertValid(edited);
  assert.deepEqual(edited.levels.C2, {
    state: 'edited', source: 'annotator', edited_points: ['ia', 'centroid'],
    corners: { ia: [41, 20], ip: [50, 20] }, centroid: [46, 13],
    model_corners: { ia: [40, 20], ip: [50, 20] }, model_centroid: [45, 12],
  });

  const manual = setLevelGeometry(editorFor(null, 'cervical'), 'C2', { inferior: [[1, 2], [3, 4]], centroid: [2, 1] });
  const manualRecord = record(manual);
  assertValid(manualRecord);
  assert.deepEqual(manualRecord.levels.C2, {
    state: 'manual', source: 'annotator', edited_points: ['ia', 'ip', 'centroid'],
    corners: { ia: [1, 2], ip: [3, 4] }, centroid: [2, 1], model_corners: null, model_centroid: null,
  });
});

test('T4 writes its centroid and the model centroid slot', () => {
  const e = setLevelGeometry(editorFor(fullGeometry(), 'full_spine'), 'T4', { centroid: [5, 6] });
  const rec = record(e);
  assertValid(rec);
  assert.deepEqual(rec.levels.T4, { state: 'manual', source: 'annotator', edited_points: ['centroid'], centroid: [5, 6], model_centroid: null });
});

test('femoral heads are two entries with rim null for unedited model output', () => {
  const rec = record(lumbarEditor());
  assertValid(rec);
  assert.equal(rec.femoral_heads.length, 2);
  assert.deepEqual(rec.femoral_heads, [
    { id: 1, state: 'segmented', source: 'model', edited_points: [], center: [10, 140], radius: 5, rim: null, model_circle: null },
    { id: 2, state: 'segmented', source: 'model', edited_points: [], center: [20, 140], radius: 5, rim: null, model_circle: null },
  ]);
});

test('femoral heads: an edited head carries its rim and the model circle; a hidden or unplaced one only state and source', () => {
  const rec = record(sinkEditor());
  assertValid(rec);
  assert.deepEqual(rec.femoral_heads[0], {
    id: 1, state: 'edited', source: 'annotator', edited_points: ['center', 'radius'], center: [11, 141], radius: 6,
    rim: [[5, 141], [17, 141], [11, 135], [11, 147]], model_circle: { center: [10, 140], radius: 5 },
  });
  assert.equal(rec.femoral_heads[1].state, 'segmented');

  const hidden = toggleVisible(lumbarEditor(), 'FH1');
  const hiddenRecord = record(hidden);
  assertValid(hiddenRecord);
  assert.deepEqual(hiddenRecord.femoral_heads[0], { id: 1, state: 'not_visible', source: 'annotator', edited_points: [] });
  assert.equal(hiddenRecord.femoral_heads.length, 2);

  const empty = record(editorFor(null, 'lumbar'));
  assertValid(empty);
  assert.deepEqual(empty.femoral_heads, [
    { id: 1, state: 'not_placed', source: 'film_type', edited_points: [] },
    { id: 2, state: 'not_placed', source: 'film_type', edited_points: [] },
  ]);

  const manual = record(setLevelGeometry(editorFor(null, 'lumbar'), 'FH2', { center: [30, 40], radius: 7, rim: [[23, 40], [37, 40]] }));
  assertValid(manual);
  assert.deepEqual(manual.femoral_heads[1], {
    id: 2, state: 'manual', source: 'annotator', edited_points: ['center', 'radius'], center: [30, 40], radius: 7, rim: [[23, 40], [37, 40]], model_circle: null,
  });
});

test('study is the filename stem, never the renamed name or the record id', () => {
  const e = lumbarEditor();
  const renamed = { id: 'SP-0042', fileName: 'lateral_lumbar_001.dcm', name: 'My film', view: 'Standing lateral' };
  const rec = record(e, { study: renamed });
  assert.equal(rec.study, 'lateral_lumbar_001');
  assert.notEqual(rec.study, 'My film');
  assert.notEqual(rec.study, 'SP-0042');
  assert.equal(record(e, { study: { ...renamed, fileName: 'C:\\films\\a.b.dcm' } }).study, 'a.b', 'the last extension goes, the folder goes');
  assert.equal(JSON.stringify(rec).includes('SP-0042'), false, 'the SP id appears nowhere in the record');
});

test('a contour is written only for a segmented body level; edited, manual and every other level get null (R10)', () => {
  const square = [[10, 10], [20, 10], [20, 20], [10, 20]];
  const e = sinkEditor();
  assert.deepEqual(['L1', 'L2', 'L3', 'L4', 'C3', 'C4'].map(code => levelState(e.levels[code], e.model[code])),
    ['segmented', 'edited', 'manual', 'segmented', 'segmented', 'edited']);
  const rec = record(e, {
    contours: { L1: square, L2: square, L3: square, C4: square, C2: square, S1: square, L4: [[1, 1], [2, 2]], L5: null },
  });
  assertValid(rec);
  assert.deepEqual(rec.levels.L1.contour, square, 'a segmented level carries the polygon it was given');
  assert.notEqual(rec.levels.L1.contour, square, 'the polygon is copied');
  assert.equal(rec.levels.L2.contour, null, 'the contour of an edited level is null even when one is supplied');
  assert.equal(rec.levels.C4.contour, null, 'an edited cervical body too');
  assert.equal(rec.levels.L3.contour, null, 'the contour of a manual level is null even when one is supplied');
  assert.equal(rec.levels.L4.contour, null, 'a polygon of fewer than 3 points is not a polygon');
  assert.equal(rec.levels.L5.contour, null);
  assert.equal(rec.levels.C3.contour, null, 'segmented but none supplied');
  assert.equal('contour' in rec.levels.C2, false, 'C2 has no contour field');
  assert.equal('contour' in rec.levels.S1, false, 'an endplate has no contour field');
  assert.equal(record(sinkEditor()).levels.L1.contour, null, 'contours default to none');
  assert.equal(toLabelRecord({ editor: sinkEditor(), study: STUDY, image: IMAGE, model: MODEL, savedAt: SAVED_AT }).levels.L1.contour, null);
  assert.equal(record(sinkEditor(), { contours: { L7: square } }).levels.L1.contour, null);
  assert.equal(record(sinkEditor(), { contours: { C7: square } }).levels.C7.contour, undefined, 'a hidden level takes no contour');
});

test('toLabelRecord reads the editor without mutating it and shares no points with it', () => {
  const e = deepFreeze(sinkEditor());
  const rec = record(e);
  rec.levels.L1.corners.sa[0] = 999;
  rec.levels.L2.model_corners.sa[0] = 999;
  rec.levels.C2.centroid[0] = 999;
  rec.femoral_heads[0].rim[0][0] = 999;
  rec.femoral_heads[0].model_circle.center[0] = 999;
  rec.femoral_heads[1].center[0] = 999;
  assert.equal(e.levels.L1.geometry.superior[0][0], 10);
  assert.equal(e.model.L2.superior[0][0], 10);
  assert.equal(e.levels.C2.geometry.centroid[0], 46);
  assert.equal(e.levels.FH1.geometry.rim[0][0], 5);
  assert.equal(e.model.FH1.center[0], 10);
  assert.equal(e.levels.FH2.geometry.center[0], 20);
});

test('every record toLabelRecord builds validates, whatever the mix of states', () => {
  // R22's floor: the smallest head a placement can finish with, two rim points 1 px apart, has radius 0.5 (> 0).
  const smallestHead = finishPlacing(addPoint(addPoint(startPlacing(editorFor(null, 'lumbar'), 'FH1'), [50, 50], IMAGE), [51, 50], IMAGE), IMAGE);
  assert.equal(smallestHead.placing, null, 'the head was placed');
  assert.equal(smallestHead.levels.FH1.geometry.radius, 0.5);
  const states = new Set();
  for (const e of [lumbarEditor(), sinkEditor(), editorFor(cervicalGeometry(), 'cervical'), editorFor(null, 'auto'),
    editorFor(null, 'full_spine'), toggleVisible(sinkEditor(), 'L1'), smallestHead]) {
    const rec = record(e);
    assertValid(rec);
    assertValid(JSON.parse(JSON.stringify(rec)));
    Object.values(rec.levels).forEach(level => states.add(level.state));
    rec.femoral_heads.forEach(head => states.add(head.state));
    // (D18, R38) Every entry lists its edited points, in agreement with its state, and the summary sums them.
    for (const entry of entriesOf(rec)) {
      assert.ok(Array.isArray(entry.edited_points), JSON.stringify(entry));
      assert.equal(entry.state === 'edited', entry.edited_points.length > 0 && entry.state !== 'manual', JSON.stringify(entry));
    }
    assert.deepEqual(rec.edits, summaryOf(rec));
    assert.equal(LEVEL_CODES.length, Object.values(rec.edits).slice(0, 5).reduce((a, b) => a + b, 0), 'every level and head counted once');
  }
  assert.deepEqual([...states].sort(), ['edited', 'manual', 'not_placed', 'not_visible', 'segmented']);
});

// ---------- edited points and the edits summary (gate feedback G5, plan D18) ----------

test('D18: a segmented, an edited and a manual level and an edited head list their points, and edits sums them', () => {
  let e = lumbarEditor();
  e = setLevelGeometry(e, 'L2', { superior: [[10, 30], [20, 30]], inferior: [[11, 41], [20, 40]] });   // IA moved
  e = setLevelGeometry(e, 'L3', { superior: [[10, 50], [20, 50]], inferior: [[10, 60], [20, 60]] });   // placed by hand
  e = setLevelGeometry(e, 'FH1', { center: [12, 140], radius: 5, rim: [[7, 140], [17, 140], [12, 135]] });   // the centre moved
  const rec = record(e);
  assertValid(rec);
  assert.equal(rec.levels.L1.state, 'segmented');
  assert.deepEqual(rec.levels.L1.edited_points, []);
  assert.equal(rec.levels.L2.state, 'edited');
  assert.deepEqual(rec.levels.L2.edited_points, ['ia'], 'one corner moved: that corner alone');
  assert.deepEqual(Object.keys(rec.levels.L2), ['state', 'source', 'edited_points', 'corners', 'model_corners', 'contour']);
  assert.equal(rec.levels.L3.state, 'manual');
  assert.deepEqual(rec.levels.L3.edited_points, ['sa', 'sp', 'ia', 'ip'], 'a manual level lists every key');
  assert.deepEqual(rec.levels.S1.edited_points, []);
  assert.deepEqual(rec.levels.C4.edited_points, [], 'not visible');
  assert.equal(rec.femoral_heads[0].state, 'edited');
  assert.deepEqual(rec.femoral_heads[0].edited_points, ['center'], 'the radius kept: the centre alone');
  assert.deepEqual(Object.keys(rec.femoral_heads[0]), ['id', 'state', 'source', 'edited_points', 'center', 'radius', 'rim', 'model_circle']);
  assert.deepEqual(rec.femoral_heads[1].edited_points, []);
  for (const entry of entriesOf(rec)) {
    if (entry.edited_points.length > 0) assert.ok(rec.levels.L2 === entry || rec.levels.L3 === entry || rec.femoral_heads[0] === entry);
  }
  assert.deepEqual(rec.edits, { segmented: 5, edited: 2, manual: 1, not_placed: 0, not_visible: 8, points_moved: 2, points_placed: 4 });
  assert.deepEqual(Object.keys(rec.edits), ['segmented', 'edited', 'manual', 'not_placed', 'not_visible', 'points_moved', 'points_placed']);
  // Each key indexes the entry's own geometry.
  for (const key of rec.levels.L2.edited_points) assert.notDeepEqual(rec.levels.L2.corners[key], rec.levels.L2.model_corners[key]);
  for (const key of rec.levels.L3.edited_points) assert.ok(Array.isArray(rec.levels.L3.corners[key]));
});

test('D18: a rim-only change lists nothing and stays segmented; a hidden edit lists nothing; the record never shares the list', () => {
  const rimOnly = record(setLevelGeometry(lumbarEditor(), 'FH1', { center: [10, 140], radius: 5, rim: [[5, 140], [15, 140]] }));
  assertValid(rimOnly);
  assert.equal(rimOnly.femoral_heads[0].state, 'segmented', 'R38: a rim is not a point, as levelState has it');
  assert.deepEqual(rimOnly.femoral_heads[0].edited_points, []);
  assert.equal(rimOnly.edits.edited, 0);
  assert.equal(rimOnly.edits.points_moved, 0);

  const hidden = record(toggleVisible(sinkEditor(), 'L2'));
  assert.deepEqual(hidden.levels.L2, { state: 'not_visible', source: 'annotator', edited_points: [] });

  const sink = record(sinkEditor());
  assert.deepEqual(sink.levels.L2.edited_points, ['sp']);
  assert.deepEqual(sink.levels.C4.edited_points, ['sa', 'sp', 'ia', 'ip'], 'every corner shifted by 1 px');
  assert.deepEqual(sink.levels.S1.edited_points, ['sa']);
  assert.deepEqual(sink.levels.T1.edited_points, ['sa', 'sp'], 'manual endplate');
  assert.deepEqual(sink.edits, summaryOf(sink));
  // C3, C5, C6, L1, L4, L5, Head 2 | C2 (2), C4 (4), L2 (1), S1 (1), Head 1 (2) | T1 (2), L3 (4) | T4 | C7.
  assert.deepEqual(sink.edits, { segmented: 7, edited: 5, manual: 2, not_placed: 1, not_visible: 1, points_moved: 10, points_placed: 6 });
  const again = record(sinkEditor());
  assert.notEqual(sink.levels.L1.edited_points, again.levels.L1.edited_points, 'a fresh list per record');
});

test('R39: a record without edited_points and edits, the shape saved before D18, still validates and reads the same', () => {
  const oldExample = withoutD18(EXAMPLE);
  assert.equal('edits' in oldExample, false);
  assert.ok(entriesOf(oldExample).every(entry => !('edited_points' in entry)));
  assertValid(oldExample);
  const sink = record(sinkEditor());
  const oldSink = withoutD18(sink);
  assertValid(oldSink);
  assert.deepEqual(recordLevels(oldSink), recordLevels(sink), 'reading a record ignores both fields');
  // Each field is optional on its own.
  const { edits: _edits, ...noEdits } = sink;
  assertValid(noEdits);
  assertValid({ ...oldSink, edits: sink.edits });
  // A literal pre-D18 record: an empty lumbar film.
  const literal = {
    schema: LABEL_SCHEMA, study: 'film', image: { file: 'film.png', sha256: SHA, width_px: 10, height_px: 10 },
    film: { region: 'lumbar', view: 'unknown' }, model: { name: 'none', version: 'unknown' }, app_version: '1.0.17',
    saved_at: SAVED_AT, complete: false,
    levels: Object.fromEntries(LEVEL_CODES.filter(code => kindOf(code) !== 'circle').map(code => [code, { state: 'not_placed', source: 'film_type' }])),
    femoral_heads: [{ id: 1, state: 'not_placed', source: 'film_type' }, { id: 2, state: 'not_placed', source: 'film_type' }],
  };
  assertValid(literal);
});

test('the schema holds edited_points to each kind\'s keys, without repeats, in agreement with the state (R38)', () => {
  // Each definition's edited_points enumerates exactly pointKeys(code).
  const resolve = ref => SCHEMA.$defs[ref.replace('#/$defs/', '')];
  for (const code of LEVEL_CODES) {
    const def = kindOf(code) === 'circle' ? resolve(SCHEMA.properties.femoral_heads.items.$ref) : resolve(SCHEMA.properties.levels.properties[code].$ref);
    const points = resolve(def.properties.edited_points.$ref);
    assert.deepEqual(points.items.enum, pointKeys(code), code);
    assert.equal(points.uniqueItems, true, code);
    assert.equal(def.required.includes('edited_points'), false, `${code}: optional (R39)`);
  }
  assert.equal(SCHEMA.required.includes('edits'), false, 'edits is optional (R39)');
  assert.equal(SCHEMA.$id, 'spinecontour.segmentation-label/1', 'the schema id is kept');

  const base = record(sinkEditor());
  assertValid(base);
  const patched = (where, patch) => {
    const copy = structuredClone(base);
    patch(copy);
    failsAt(copy, where);
  };
  patched('/levels/L2/edited_points', rec => { rec.levels.L2.edited_points = ['sp', 'sp']; });
  patched('/levels/L2/edited_points/0', rec => { rec.levels.L2.edited_points = ['centroid']; });
  patched('/levels/C2/edited_points/0', rec => { rec.levels.C2.edited_points = ['sa']; });
  patched('/levels/S1/edited_points/0', rec => { rec.levels.S1.edited_points = ['ia']; });
  patched('/levels/T4/edited_points/0', rec => { rec.levels.T4.edited_points = ['sa']; });
  patched('/femoral_heads/0/edited_points/0', rec => { rec.femoral_heads[0].edited_points = ['rim']; });
  patched('/levels/L2/edited_points', rec => { rec.levels.L2.edited_points = 'sp'; });
  // R38 in the schema: edited lists something, manual lists the keys it holds, every other state nothing (2026-10-22, the final review, M5).
  patched('/levels/L2/edited_points', rec => { rec.levels.L2.edited_points = []; });
  patched('/femoral_heads/0/edited_points', rec => { rec.femoral_heads[0].edited_points = []; });
  patched('/levels/C3/edited_points', rec => { rec.levels.C3.edited_points = ['sa']; });
  // (2026-10-21, partial endplates) a manual body lists the keys it holds, so any list from one key is valid; none is not.
  patched('/levels/L3/edited_points', rec => { rec.levels.L3.edited_points = []; });
  patched('/levels/T1/edited_points', rec => { rec.levels.T1.edited_points = ['sa']; });
  patched('/levels/C7/edited_points', rec => { rec.levels.C7.edited_points = ['sa']; });
  patched('/levels/T4/edited_points', rec => { rec.levels.T4.edited_points = ['centroid']; });
  patched('/femoral_heads/1/edited_points', rec => { rec.femoral_heads[1].edited_points = ['center']; });
  // The summary: seven non-negative integers, nothing else.
  patched('/edits/points_placed', rec => { delete rec.edits.points_placed; });
  patched('/edits/segmented', rec => { rec.edits.segmented = -1; });
  patched('/edits/edited', rec => { rec.edits.edited = 1.5; });
  patched('/edits/extra', rec => { rec.edits.extra = 0; });
  patched('/edits', rec => { rec.edits = [1, 2]; });
  assertValid({ ...base, levels: { ...base.levels, L3: { ...base.levels.L3, edited_points: ['ip', 'ia', 'sp', 'sa'] } } });
});

test('the shipped example lists its edited points and its edits block agrees with its entries', () => {
  assert.deepEqual(EXAMPLE.levels.L1.edited_points, []);
  assert.deepEqual(EXAMPLE.levels.L2.edited_points, ['ia', 'ip']);
  assert.deepEqual(EXAMPLE.levels.L3.edited_points, ['sa', 'sp', 'ia', 'ip']);
  assert.deepEqual(EXAMPLE.levels.C2.edited_points, []);
  assert.equal(EXAMPLE.femoral_heads[1].state, 'edited');
  assert.deepEqual(EXAMPLE.femoral_heads[1].edited_points, ['center', 'radius']);
  for (const entry of entriesOf(EXAMPLE)) assert.ok(Array.isArray(entry.edited_points), JSON.stringify(entry));
  assert.deepEqual(EXAMPLE.edits, summaryOf(EXAMPLE));
  assert.deepEqual(EXAMPLE.edits, { segmented: 5, edited: 2, manual: 1, not_placed: 0, not_visible: 8, points_moved: 4, points_placed: 4 });
  assert.deepEqual(Object.keys(EXAMPLE).slice(7, 11), ['complete', 'edits', 'comment', 'levels']);
  // The example's edited lists name the keys whose value differs from the model's.
  const l2 = EXAMPLE.levels.L2;
  assert.deepEqual(Object.keys(l2.corners).filter(key => l2.corners[key].some((v, i) => v !== l2.model_corners[key][i])), l2.edited_points);
});

// ---------- recordLevels ----------

test('recordLevels inverts toLabelRecord', () => {
  const e = sinkEditor();
  const rec = record(e);
  const levels = recordLevels(rec);
  assert.deepEqual(Object.keys(levels), LEVEL_CODES);
  for (const code of LEVEL_CODES) {
    const entry = e.levels[code];
    assert.equal(levels[code].visible, entry.visible, `${code} visible`);
    assert.equal(levels[code].source, entry.source, `${code} source`);
    assert.deepEqual(levels[code].geometry, entry.visible ? entry.geometry : null, `${code} geometry`);
  }
  assert.equal(levels.C7.visible, false);
  assert.equal(levels.C7.geometry, null, 'a hidden level\'s geometry is not in the record');
  assert.deepEqual(levels.T4, { visible: true, source: 'film_type', geometry: null });
});

test('recordLevels emits exactly the editor\'s geometry shapes for every placed code', () => {
  const editors = [sinkEditor(), lumbarEditor(), editorFor(cervicalGeometry(), 'cervical'),
    setLevelGeometry(editorFor(fullGeometry(), 'full_spine'), 'T4', { centroid: [5, 6] })];
  const seen = new Set();
  for (const e of editors) {
    const rec = record(e);
    for (const viaJson of [false, true]) {
      const levels = recordLevels(viaJson ? JSON.parse(JSON.stringify(rec)) : rec);
      for (const code of LEVEL_CODES) {
        const entry = e.levels[code];
        if (!entry.visible || !entry.geometry) continue;
        seen.add(kindOf(code));
        assert.deepEqual(levels[code].geometry, entry.geometry, `${code} geometry (${viaJson ? 'via JSON' : 'direct'})`);
      }
    }
  }
  assert.deepEqual([...seen].sort(), ['body', 'c2', 'centroid', 'circle', 'endplate']);
  const circle = recordLevels(record(lumbarEditor())).FH1.geometry;
  assert.deepEqual(Object.keys(circle), ['center', 'radius', 'rim']);
  assert.equal(circle.rim, null, 'rim is null, not absent, for unedited model output');
  assert.deepEqual(Object.keys(recordLevels(record(sinkEditor())).C2.geometry), ['inferior', 'centroid']);
  assert.deepEqual(Object.keys(recordLevels(record(sinkEditor())).L1.geometry), ['superior', 'inferior']);
  assert.deepEqual(Object.keys(recordLevels(record(sinkEditor())).S1.geometry), ['superior']);
  assert.deepEqual(Object.keys(recordLevels(record(sinkEditor())).T1.geometry), ['superior']);
});

test('recordLevels reads the example record: FH1/FH2 from femoral_heads, states to visibility', () => {
  const levels = recordLevels(EXAMPLE);
  assert.deepEqual(Object.keys(levels), LEVEL_CODES);
  assert.deepEqual(levels.C2, { visible: false, source: 'film_type', geometry: null });
  assert.deepEqual(levels.L2.geometry, {
    superior: [[921, 718], [1301, 738]], inferior: [[900, 954], [1308, 981]],
  });
  assert.equal(levels.L2.source, 'annotator');
  assert.deepEqual(levels.S1.geometry, { superior: [[989, 2050], [1323, 1860]] });
  assert.deepEqual(levels.FH1, { visible: true, source: 'model', geometry: { center: [728, 2346], radius: 136, rim: null } });
  assert.deepEqual(levels.FH2, {
    visible: true, source: 'annotator', geometry: { center: [795, 2302], radius: 141, rim: [[654, 2302], [936, 2302], [795, 2161]] },
  }, 'an edited head reads its rim (D18 made Head 2 edited)');
});

test('recordLevels leaves out what a damaged record does not say, and never invents geometry', () => {
  assert.deepEqual(recordLevels(null), {});
  assert.deepEqual(recordLevels({}), {});
  assert.deepEqual(recordLevels({ levels: 'x', femoral_heads: 3 }), {});
  const partial = recordLevels({
    levels: {
      L1: { state: 'segmented', source: 'model' },
      L2: { state: 'bogus', source: 'model' },
      L3: { state: 'manual', source: 'nobody', corners: { sa: [1, 1], sp: [2, 1], ia: [1, 2], ip: [2, 2] } },
      L4: { state: 'manual', source: 'annotator', corners: { sa: [1, 1], sp: [2, 1], ia: [1, 2], ip: ['x', 2] } },
      L5: { state: 'not_visible', source: 'annotator', corners: { sa: [1, 1], sp: [2, 1], ia: [1, 2], ip: [2, 2] } },
      C2: { state: 'manual', source: 'annotator', corners: { ia: [1, 1], ip: [2, 2] } },
      T4: { state: 'manual', source: 'annotator', centroid: [1] },
    },
    femoral_heads: [
      { id: 2, state: 'manual', source: 'annotator', center: [5, 5], radius: 0, rim: null },
      { id: 7, state: 'manual', source: 'annotator', center: [5, 5], radius: 3, rim: null },
      { id: 1, state: 'manual', source: 'annotator', center: [5, 5], radius: 3, rim: [[1, 1]] },
    ],
  });
  assert.deepEqual(Object.keys(partial), ['C2', 'T4', 'L1', 'L4', 'L5', 'FH1', 'FH2'], 'L2 (bad state) and L3 (bad source) are left out');
  assert.deepEqual(partial.L1, { visible: true, source: 'model', geometry: null }, 'a placed state without corners has no geometry');
  assert.equal(partial.L4.geometry, null, 'a corner that is not a point voids the geometry');
  assert.deepEqual(partial.L5, { visible: false, source: 'annotator', geometry: null }, 'not_visible never carries geometry');
  assert.deepEqual(partial.C2.geometry, { inferior: [[1, 1], [2, 2]], centroid: null }, 'C2 without a centroid keeps its inferior pair (partial endplates)');
  assert.equal(partial.T4.geometry, null);
  assert.equal(partial.FH2.geometry, null, 'a zero radius is no circle');
  assert.deepEqual(partial.FH1.geometry, { center: [5, 5], radius: 3, rim: null }, 'a one-point rim is dropped to null');
});

// ---------- the comment (annotation editor round 2, spec §3) ----------

test('recordComment reads a string trimmed and reads anything else as empty (Review Focus 2)', () => {
  assert.equal(recordComment({ comment: 'a ' }), 'a');
  assert.equal(recordComment({ comment: '  L5 is sacralised.\n' }), 'L5 is sacralised.');
  assert.equal(recordComment({ comment: '   ' }), '');
  assert.equal(recordComment({ comment: null }), '');
  assert.equal(recordComment({ comment: 42 }), '');
  assert.equal(recordComment({ comment: {} }), '');
  assert.equal(recordComment({ comment: ['a'] }), '');
  assert.equal(recordComment({}), '');
  assert.equal(recordComment(null), '');
  assert.equal(recordComment(undefined), '');
  assert.equal(recordComment(42), '');
  assert.equal(recordComment(EXAMPLE), EXAMPLE.comment);
});

test('recordComment inverts toLabelRecord, and a record saved before the comment reads empty', () => {
  const rec = record(setComment(lumbarEditor(), '  held on disk  '));
  assert.equal(recordComment(rec), 'held on disk');
  assert.equal(recordComment(JSON.parse(JSON.stringify(rec))), 'held on disk');
  assert.equal(recordComment(record(lumbarEditor())), '');
  const { comment: _comment, ...older } = rec;
  assert.equal(recordComment(older), '');
});

test('normalizeComment: " x " → "x", "   " → null, undefined → null', () => {
  assert.equal(normalizeComment(' x '), 'x');
  assert.equal(normalizeComment('   '), null);
  assert.equal(normalizeComment(''), null);
  assert.equal(normalizeComment(undefined), null);
  assert.equal(normalizeComment(null), null);
  assert.equal(normalizeComment(42), null);
  assert.equal(normalizeComment({}), null);
  assert.equal(normalizeComment('a\n\nb'), 'a\n\nb', 'inner line breaks are kept');
});

const PARTIAL_EXAMPLE = JSON.parse(fs.readFileSync(new URL('../docs/design/level-editor/label-record.partial.example.json', import.meta.url), 'utf8'));

test('a manual body with one endplate writes nullable corners by pair and lists its placed keys; the record validates and reads back', () => {
  let editor = openEditor({ study: { id: 'SP-0003', geometry: null, labelFile: null }, region: 'cervical', modelGeometry: null, saved: null });
  editor = setLevelGeometry(editor, 'C7', { superior: [[10, 110], [20, 110]], inferior: null, centroid: null });
  editor = setLevelGeometry(editor, 'C2', { inferior: null, centroid: [45, 12] });
  const record = toLabelRecord({ editor, study: { ...STUDY, region: 'cervical' }, image: IMAGE, model: MODEL, savedAt: SAVED_AT });
  assert.deepEqual(record.levels.C7.corners, { sa: [10, 110], sp: [20, 110], ia: null, ip: null });
  assert.deepEqual(record.levels.C7.edited_points, ['sa', 'sp']);
  assert.equal(record.levels.C7.state, 'manual');
  assert.deepEqual(record.levels.C2.corners, { ia: null, ip: null });
  assert.deepEqual(record.levels.C2.centroid, [45, 12]);
  assert.deepEqual(record.levels.C2.edited_points, ['centroid']);
  assert.equal(record.edits.points_placed, 3);
  assert.equal(record.complete, false, 'C3 to C6 and T1 are still visible and not placed');
  const valid = validateAgainst(SCHEMA, record);
  assert.deepEqual(valid.errors, []);
  const back = recordLevels(record);
  assert.deepEqual(back.C7.geometry, { superior: [[10, 110], [20, 110]], inferior: null, centroid: null });
  assert.deepEqual(back.C2.geometry, { inferior: null, centroid: [45, 12] });
});

test('an endplate removed from a model body writes edited with the removed keys and a whole model_corners; one added writes partial model_corners', () => {
  const whole = { superior: [[10, 110], [20, 110]], inferior: [[10, 120], [20, 120]] };
  const study = { id: 'SP-0004', geometry: { region: 'cervical', vertebrae: { C7: { ...whole, quadrilateral: null } }, c2_centroid: null } };
  let editor = openEditor({ study, region: 'cervical', modelGeometry: study.geometry, saved: null });
  editor = setLevelGeometry(editor, 'C7', { superior: whole.superior, inferior: null, centroid: null });
  let record = toLabelRecord({ editor, study: STUDY, image: IMAGE, model: MODEL, savedAt: SAVED_AT });
  assert.equal(record.levels.C7.state, 'edited');
  assert.deepEqual(record.levels.C7.edited_points, ['ia', 'ip']);
  assert.deepEqual(record.levels.C7.corners, { sa: [10, 110], sp: [20, 110], ia: null, ip: null });
  assert.deepEqual(record.levels.C7.model_corners, { sa: [10, 110], sp: [20, 110], ia: [10, 120], ip: [20, 120] });
  assert.equal(record.edits.points_moved, 2);
  assert.deepEqual(validateAgainst(SCHEMA, record).errors, []);
  const partialStudy = { id: 'SP-0005', geometry: { region: 'cervical', vertebrae: { C7: { superior: whole.superior, inferior: null, quadrilateral: null } }, c2_centroid: null } };
  editor = openEditor({ study: partialStudy, region: 'cervical', modelGeometry: partialStudy.geometry, saved: null });
  editor = setLevelGeometry(editor, 'C7', { ...whole, centroid: null });
  record = toLabelRecord({ editor, study: STUDY, image: IMAGE, model: MODEL, savedAt: SAVED_AT });
  assert.deepEqual(record.levels.C7.edited_points, ['ia', 'ip']);
  assert.deepEqual(record.levels.C7.model_corners, { sa: [10, 110], sp: [20, 110], ia: null, ip: null });
  assert.deepEqual(validateAgainst(SCHEMA, record).errors, []);
});

test('the schema holds a pair together: a half pair, no pair, and a C2 with neither its pair nor its centroid are rejected; the partial example validates', () => {
  assert.deepEqual(validateAgainst(SCHEMA, PARTIAL_EXAMPLE).errors, []);
  assert.deepEqual(validateAgainst(SCHEMA, EXAMPLE).errors, [], 'the whole example still validates');
  const broken = (patch) => { const value = structuredClone(PARTIAL_EXAMPLE); patch(value); return validateAgainst(SCHEMA, value).ok; };
  assert.equal(broken((v) => { v.levels.C7.corners.sp = null; }), false, 'sa without sp');
  // (2026-10-22, the final review, M6) the pair rule's other direction: sp a point demands sa.
  assert.equal(broken((v) => { v.levels.C7.corners.sa = null; }), false, 'sp without sa');
  assert.equal(broken((v) => { v.levels.C7.corners.sa = null; v.levels.C7.corners.sp = null; }), false, 'no pair at all');
  assert.equal(broken((v) => { v.levels.C7.corners.ia = [1, 1]; }), false, 'ia without ip');
  assert.equal(broken((v) => { v.levels.C2.centroid = null; }), false, 'C2 with neither');
  assert.equal(broken((v) => { v.levels.C2.corners.ia = [1, 1]; }), false, 'C2 half a pair');
  assert.equal(broken((v) => { v.levels.C7.edited_points = []; }), false, 'a manual body lists at least one key');
  assert.equal(broken((v) => { v.levels.C7.corners.ia = [1, 2]; v.levels.C7.corners.ip = [2, 2]; v.levels.C7.edited_points = ['sa', 'sp', 'ia', 'ip']; }), true, 'made whole');
});

test('recordLevels reads a half pair or an entry with no part as no geometry, without throwing', () => {
  const record = structuredClone(PARTIAL_EXAMPLE);
  record.levels.C7.corners.sp = null;
  assert.equal(recordLevels(record).C7.geometry, null);
  record.levels.C7.corners = { sa: null, sp: null, ia: null, ip: null };
  assert.equal(recordLevels(record).C7.geometry, null);
  record.levels.C2.centroid = null;
  assert.equal(recordLevels(record).C2.geometry, null);
  assert.equal(recordLevels(record).C7.visible, true, 'the state is still read');
});

test('the schema description records the partial-endplates amendment under the same id', () => {
  assert.equal(SCHEMA.$id, 'spinecontour.segmentation-label/1');
  assert.match(SCHEMA.description, /2026-10-21/);
  assert.match(SCHEMA.description, /endplate/i);
});
