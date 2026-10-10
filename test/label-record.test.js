import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LABEL_SCHEMA, viewSlug, appVersion, labelFileName, toLabelRecord, recordLevels,
} from '../renderer/data/label-record.js';
import {
  LEVEL_CODES, kindOf, levelState, trainingStatus, openEditor, setLevelGeometry, toggleVisible,
} from '../renderer/data/levels.js';
import { validateAgainst } from './fixtures/schema-check.js';

const SCHEMA = JSON.parse(fs.readFileSync(new URL('../docs/design/level-editor/label-record.schema.json', import.meta.url), 'utf8'));
const EXAMPLE = JSON.parse(fs.readFileSync(new URL('../docs/design/level-editor/label-record.example.json', import.meta.url), 'utf8'));

const SHA = 'a'.repeat(64);
const IMAGE = { file: 'lateral_lumbar_001.dcm', sha256: SHA, width: 200, height: 160 };
const MODEL = { name: 'U-Net', version: '2026-09-01' };
const SAVED_AT = '2026-10-10T15:00:00Z';
const STUDY = { id: 'SP-0001', fileName: 'lateral_lumbar_001.dcm', name: 'My film', view: 'Standing lateral', region: 'lumbar' };

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
  failsAt(withC2(c2 => { c2.model_centroid = null; return c2; }), '/levels/C2/model_centroid');
  failsAt(withC2(c2 => { c2.corners = { sa: [1, 1], sp: [2, 2], ia: [3, 3], ip: [4, 4] }; return c2; }), '/levels/C2/corners/sa');
  failsAt(withC2(c2 => { delete c2.corners.ip; return c2; }), '/levels/C2/corners/ip');
  failsAt(withC2(c2 => { c2.contour = null; return c2; }), '/levels/C2/contour');

  const manual = withC2(c2 => ({ ...c2, state: 'manual', source: 'annotator', model_corners: null, model_centroid: null }));
  assertValid(manual);
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
  assert.equal(appVersion(), '1.0.17', 'defaults to the shipped VERSION_LABEL');
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
    ['schema', 'study', 'image', 'film', 'model', 'app_version', 'saved_at', 'complete', 'levels', 'femoral_heads']);
  assert.equal(rec.complete, false, 'L3 is visible and not placed');
  assert.equal(rec.complete, trainingStatus(e).complete);
  const done = setLevelGeometry(e, 'L3', { superior: [[10, 50], [20, 50]], inferior: [[10, 60], [20, 60]] });
  assert.equal(record(done).complete, true);
  assertValid(record(done));
  assertValid(rec);
  assert.equal(record(e, { appVersion: undefined }).app_version, '1.0.17', 'the app version defaults to the shipped label');
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

test('a not_visible or not_placed level carries only state and source', () => {
  const e = sinkEditor();
  const rec = record(e);
  assert.deepEqual(rec.levels.C7, { state: 'not_visible', source: 'annotator' }, 'a hidden level\'s geometry is not recorded');
  assert.ok(e.levels.C7.geometry, 'the editor keeps the hidden level\'s geometry');
  assert.deepEqual(rec.levels.T4, { state: 'not_placed', source: 'film_type' });
  const lumbar = record(lumbarEditor());
  assert.deepEqual(lumbar.levels.C4, { state: 'not_visible', source: 'film_type' });
  assert.deepEqual(lumbar.levels.T1, { state: 'not_visible', source: 'film_type' });
  assert.deepEqual(lumbar.levels.L3, { state: 'not_placed', source: 'film_type' });
  assert.deepEqual(Object.keys(lumbar.levels.L3), ['state', 'source']);
});

test('C2 writes corners {ia, ip} and a centroid', () => {
  const segmented = editorFor(cervicalGeometry(), 'cervical');
  const rec = record(segmented);
  assertValid(rec);
  assert.deepEqual(rec.levels.C2, {
    state: 'segmented', source: 'model',
    corners: { ia: [40, 20], ip: [50, 20] }, centroid: [45, 12],
    model_corners: null, model_centroid: null,
  });
  assert.deepEqual(Object.keys(rec.levels.C2), ['state', 'source', 'corners', 'centroid', 'model_corners', 'model_centroid']);
  assert.equal('contour' in rec.levels.C2, false);
  assert.equal(rec.levels.C3.state, 'segmented', 'C3 stays a four-corner body');
  assert.deepEqual(Object.keys(rec.levels.C3.corners), ['sa', 'sp', 'ia', 'ip']);

  const edited = record(sinkEditor());
  assertValid(edited);
  assert.deepEqual(edited.levels.C2, {
    state: 'edited', source: 'annotator',
    corners: { ia: [41, 20], ip: [50, 20] }, centroid: [46, 13],
    model_corners: { ia: [40, 20], ip: [50, 20] }, model_centroid: [45, 12],
  });

  const manual = setLevelGeometry(editorFor(null, 'cervical'), 'C2', { inferior: [[1, 2], [3, 4]], centroid: [2, 1] });
  const manualRecord = record(manual);
  assertValid(manualRecord);
  assert.deepEqual(manualRecord.levels.C2, {
    state: 'manual', source: 'annotator',
    corners: { ia: [1, 2], ip: [3, 4] }, centroid: [2, 1], model_corners: null, model_centroid: null,
  });
});

test('T4 writes its centroid and the model centroid slot', () => {
  const e = setLevelGeometry(editorFor(fullGeometry(), 'full_spine'), 'T4', { centroid: [5, 6] });
  const rec = record(e);
  assertValid(rec);
  assert.deepEqual(rec.levels.T4, { state: 'manual', source: 'annotator', centroid: [5, 6], model_centroid: null });
});

test('femoral heads are two entries with rim null for unedited model output', () => {
  const rec = record(lumbarEditor());
  assertValid(rec);
  assert.equal(rec.femoral_heads.length, 2);
  assert.deepEqual(rec.femoral_heads, [
    { id: 1, state: 'segmented', source: 'model', center: [10, 140], radius: 5, rim: null, model_circle: null },
    { id: 2, state: 'segmented', source: 'model', center: [20, 140], radius: 5, rim: null, model_circle: null },
  ]);
});

test('femoral heads: an edited head carries its rim and the model circle; a hidden or unplaced one only state and source', () => {
  const rec = record(sinkEditor());
  assertValid(rec);
  assert.deepEqual(rec.femoral_heads[0], {
    id: 1, state: 'edited', source: 'annotator', center: [11, 141], radius: 6,
    rim: [[5, 141], [17, 141], [11, 135], [11, 147]], model_circle: { center: [10, 140], radius: 5 },
  });
  assert.equal(rec.femoral_heads[1].state, 'segmented');

  const hidden = toggleVisible(lumbarEditor(), 'FH1');
  const hiddenRecord = record(hidden);
  assertValid(hiddenRecord);
  assert.deepEqual(hiddenRecord.femoral_heads[0], { id: 1, state: 'not_visible', source: 'annotator' });
  assert.equal(hiddenRecord.femoral_heads.length, 2);

  const empty = record(editorFor(null, 'lumbar'));
  assertValid(empty);
  assert.deepEqual(empty.femoral_heads, [
    { id: 1, state: 'not_placed', source: 'film_type' },
    { id: 2, state: 'not_placed', source: 'film_type' },
  ]);

  const manual = record(setLevelGeometry(editorFor(null, 'lumbar'), 'FH2', { center: [30, 40], radius: 7, rim: [[23, 40], [37, 40]] }));
  assertValid(manual);
  assert.deepEqual(manual.femoral_heads[1], {
    id: 2, state: 'manual', source: 'annotator', center: [30, 40], radius: 7, rim: [[23, 40], [37, 40]], model_circle: null,
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
  const states = new Set();
  for (const e of [lumbarEditor(), sinkEditor(), editorFor(cervicalGeometry(), 'cervical'), editorFor(null, 'auto'),
    editorFor(null, 'full_spine'), toggleVisible(sinkEditor(), 'L1')]) {
    const rec = record(e);
    assertValid(rec);
    assertValid(JSON.parse(JSON.stringify(rec)));
    Object.values(rec.levels).forEach(level => states.add(level.state));
    rec.femoral_heads.forEach(head => states.add(head.state));
  }
  assert.deepEqual([...states].sort(), ['edited', 'manual', 'not_placed', 'not_visible', 'segmented']);
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
  assert.deepEqual(levels.FH2.geometry, { center: [792, 2302], radius: 143, rim: null });
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
  assert.equal(partial.C2.geometry, null, 'C2 without a centroid has no geometry');
  assert.equal(partial.T4.geometry, null);
  assert.equal(partial.FH2.geometry, null, 'a zero radius is no circle');
  assert.deepEqual(partial.FH1.geometry, { center: [5, 5], radius: 3, rim: null }, 'a one-point rim is dropped to null');
});
