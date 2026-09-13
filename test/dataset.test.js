import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset, datasetMessage, appendColumns, RESOLVED_COLUMNS } from '../renderer/data/dataset.js';

function geometry() {
  const body = (top) => ({ superior: [[160, top], [100, top]], inferior: [[160, top + 80], [100, top + 80]], quadrilateral: [[160, top], [100, top], [100, top + 80], [160, top + 80]] });
  return { vertebrae: { L1: body(100), L2: body(200), L3: body(300), L4: body(400), L5: body(500) }, s1_superior: [[170, 610], [110, 620]], l1_center: [130, 140], hip_midpoint: [260, 760], femoral_circles: [[250, 760, 30], [270, 760, 30]] };
}
// A film is named by its study name in every export since v1.0.8 (set explicitly here; a film with no
// stored name reads as its stem); the SP id keys the record and appears in no file.
function film(id, name, subjectId, timepoint, clinical = {}, extra = {}) {
  return { id, source: 'real', filePath: `C:\\films\\${id}.png`, fileName: `${id}.png`, name, workspaceFolder: 'C:\\films', subjectId, timepoint,
    filmDate: '2025-01-01', note: null, reviewedAt: null, addedAt: '2026-09-12T00:00:00.000Z', view: 'Standing lateral', thumbnail: null,
    measurements: { PI: 50, PT: 12, SS: 38, L1PA: 8, LL: { 'L1-S1': 49, 'L2-S1': 40, 'L3-S1': 30, 'L4-S1': 20, 'L5-S1': 10 } },
    geometry: geometry(), qc: { coverage: { partial: false, unoriented: [] }, models: { vertebrae: 'unet', femoral: 'unet', s1: 'keypointrcnn' }, framing: { searched: true, whole_film_won: false }, processing: { crop_localizer: true } },
    calibration: { version: 1, source_sha256: `digest-${id.slice(3)}`, status: 'unavailable', spacing: null, candidates: [], selected_index: null, coordinate_space: 'original_image', width: 1, height: 1 },
    clinical, ...extra };
}
const unit = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const embedding = (id, sha = 'abc') => ({ version: 1, id, computedAt: 'x', sourceSha256: null, model: { onnx_sha256: sha }, filmType: 'whole-spine', crop: unit([1, 0]), whole: unit([0, 1]) });

const rows = [
  film('SP-1000', 'S001 pre', 'S001', 'Pre-op', { 'Fusion extension': 'Yes', 'Fusion extension date': '2026-01-10' }),
  film('SP-1001', 'S001 post', 'S001', 'Post-op', { 'Last follow-up': '2026-06-01', 'Interbody type': 'PEEK' }, { filmDate: '2025-06-01' }),
  film('SP-1002', 'S002 pre', 'S002', 'Pre-op'),
  film('SP-1003', 'lone film', null, null, {}, { geometry: null, measurements: null, qc: null }),
  { ...film('SP-0042', 'demo', 'D', 'Pre-op'), source: 'demo' },
];
const embeddings = new Map([['SP-1000', embedding('SP-1000')], ['SP-1001', embedding('SP-1001', 'old')]]);
const built = () => buildDataset({ rows, post: '__any__', embeddings, bundledSha: 'abc', version: '1.0.8', now: new Date('2026-09-12T20:00:00.000Z') });

test('the folder name carries the workspace label and the date, reduced to what save-dataset accepts', () => {
  assert.equal(built().folder, 'films-dataset-2026-09-12');
  assert.equal(buildDataset({ rows: [], post: '__any__', embeddings: new Map(), bundledSha: null, version: '1', now: new Date('2026-09-12T20:00:00.000Z') }).folder, 'library-dataset-2026-09-12');
  // An ordinary Windows folder carries brackets; save-dataset accepts only
  // /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/, so the label is reduced here rather than refused there.
  const bracketed = [{ ...rows[0], workspaceFolder: 'C:\\Fusion 2025 (v2)' }];
  assert.equal(buildDataset({ rows: bracketed, post: '__any__', embeddings: new Map(), bundledSha: null, version: '1', now: new Date('2026-09-12T20:00:00.000Z') }).folder,
    'Fusion 2025 v2-dataset-2026-09-12');
});

test('films.csv is toCsv plus the provenance, then the resolved outcome columns, one row per real film named by study name', () => {
  const text = built().files['films.csv'];
  const lines = text.split('\r\n').filter((l) => l !== '');
  assert.equal(lines[0], '# Spine Contour export');
  const header = lines[3].split(',');
  assert.equal(header[0], 'Study ID');
  assert.deepEqual(header.slice(-12), ['Film type', 'Coverage', 'Reviewed', 'Embedding', 'Crop localizer', 'Vertebra model', 'Femoral model', 'S1 model', 'Source SHA-256', ...RESOLVED_COLUMNS]);
  assert.deepEqual(RESOLVED_COLUMNS, ['Subject fusion extension', 'Subject fusion extension date', 'Subject last follow-up']);
  assert.equal(lines.length - 4, 4);
  const first = lines[4].split(',');
  assert.equal(first[0], 'S001 pre');
  const at = (name) => first[header.indexOf(name)];
  assert.equal(at('Film type'), 'whole-spine');
  assert.equal(at('Coverage'), 'full');
  assert.equal(at('Embedding'), 'yes');
  assert.equal(at('Crop localizer'), 'on');
  assert.equal(at('Vertebra model'), 'unet');
  assert.equal(at('Source SHA-256'), 'digest-1000');
  assert.equal(at('Subject fusion extension'), 'yes');
  assert.equal(at('Subject fusion extension date'), '2026-01-10');
  assert.equal(at('Subject last follow-up'), '2026-06-01');
  const second = lines[5].split(',');
  assert.equal(second[header.indexOf('Embedding')], 'no');
  const unsegmented = lines[7].split(',');
  assert.equal(unsegmented[0], 'lone film');
  assert.equal(unsegmented[header.indexOf('Coverage')], '');
  assert.equal(unsegmented[header.indexOf('Subject fusion extension')], 'not-recorded');
  assert.equal(lines.filter((l) => l.startsWith('demo,')).length, 0, 'demo rows dropped');
  assert.ok(!text.includes('C:\\films'), 'no path');
  assert.ok(!text.includes('.png'), 'no extension');
  assert.ok(!text.includes('SP-'), 'no record id');
});

test('subjects.csv is the paired export by visit plus the resolved columns and the film types', () => {
  const lines = built().files['subjects.csv'].split('\r\n').filter((l) => l !== '');
  const header = lines[3].split(',');
  assert.deepEqual(header.slice(-5), [...RESOLVED_COLUMNS, 'Pre-op film type', 'Post-op film type']);
  assert.equal(lines.length - 4, 1);
  const row = lines[4].split(',');
  assert.equal(row[0], 'S001');
  assert.equal(row[header.indexOf('Pre-op study')], 'S001 pre');
  assert.equal(row[header.indexOf('Subject fusion extension')], 'yes');
  assert.equal(row[header.indexOf('Pre-op film type')], 'whole-spine');
  // SP-1001's stored embedding came from another graph, so nothing current says its film type.
  assert.equal(row[header.indexOf('Post-op film type')], '');
});

test('a merged visit counts once, is flagged in the toast, and takes its primary film\u2019s type', () => {
  const merged = buildDataset({
    rows: [
      film('SP-2000', 'S003 pre', 'S003', 'Pre-op'),
      film('SP-2001', 'S003 pre flexion', 'S003', 'Pre-op', {}, { note: 'flexion' }),
      film('SP-2002', 'S003 post', 'S003', 'Post-op', {}, { filmDate: '2025-06-01' }),
    ],
    post: '__any__', embeddings: new Map([['SP-2000', embedding('SP-2000')]]), bundledSha: 'abc', version: '1', now: new Date('2026-09-12T20:00:00.000Z'),
  });
  assert.equal(merged.counts.pairs, 1);
  assert.equal(merged.counts.mergedVisits, 1);
  const lines = merged.files['subjects.csv'].split('\r\n').filter((l) => l !== '');
  const header = lines[3].split(',');
  const row = lines[4].split(',');
  assert.equal(row[header.indexOf('Pre-op study')], 'S003 pre + S003 pre flexion');
  assert.equal(row[header.indexOf('Pre-op film type')], 'whole-spine');
  assert.equal(datasetMessage(merged, 'D'), 'Dataset written to D \u00B7 1 pair \u00B7 1 merged visit \u00B7 2 films without an embedding');
});

test('vectors.json carries the blocks per film in films.csv order, named by study name, null where absent, never an embedding from another graph', () => {
  const vectors = JSON.parse(built().files['vectors.json']);
  assert.equal(vectors.version, 1);
  assert.equal(vectors.shape.dim, 44);
  assert.equal(vectors.shape.order.length, 22);
  assert.equal(vectors.hip.dim, 2);
  assert.deepEqual(vectors.alignment.order, ['PI', 'PT', 'SS', 'LL L1-S1', 'PI-LL']);
  assert.deepEqual(vectors.alignment.weights, [1, 0.8, 0.8, 0.6, 1]);
  assert.deepEqual(vectors.films.map((f) => f.name), ['S001 pre', 'S001 post', 'S002 pre', 'lone film']);
  const [pre, post, , lone] = vectors.films;
  assert.equal(pre.shape.length, 44);
  assert.equal(pre.hip.length, 2);
  assert.equal(pre.alignment.length, 5);
  assert.equal(pre.crop.length, 2);
  assert.equal(pre.whole.length, 2);
  assert.equal(pre.filmType, 'whole-spine');
  assert.equal(post.crop, null);
  assert.equal(post.whole, null);
  assert.equal(lone.shape, null);
  assert.equal(lone.alignment, null);
  assert.ok(!built().files['vectors.json'].includes('SP-'), 'no record id');
  assert.ok(!built().files['vectors.json'].includes('\n'), 'not pretty-printed');
});

test('manifest.json names the app, the date, the counts, the models, the identity and the disclaimer', () => {
  const manifest = JSON.parse(built().files['manifest.json']);
  assert.equal(manifest.app.version, '1.0.8');
  assert.equal(manifest.exportedAt, '2026-09-12T20:00:00.000Z');
  assert.deepEqual(manifest.counts, { films: 4, pairs: 1, unpaired: 1, ambiguous: 0, mergedVisits: 0, withOutcome: 1, conflicting: 0, withoutEmbedding: 3, noSubject: 1 });
  assert.deepEqual(manifest.embedding, { onnx_sha256: 'abc' });
  assert.deepEqual(manifest.models, { vertebrae: ['unet'], femoral: ['unet'], s1: ['keypointrcnn'] });
  assert.equal(manifest.identity, 'Films are named by study name (the stored name, else the film stem), the Study ID of every export; the record id is not exported.');
  assert.equal(manifest.disclaimer, 'Investigational software. NOT FOR CLINICAL USE.');
  assert.ok(manifest.citation.startsWith('Created by'));
  assert.equal(built().files['manifest.json'].includes('\n  '), true, 'pretty-printed');
});

test('datasetMessage counts what was written and left out, each clause only when nonzero', () => {
  assert.equal(datasetMessage(built(), 'C:\\out\\films-dataset-2026-09-12'),
    'Dataset written to C:\\out\\films-dataset-2026-09-12 \u00B7 1 pair \u00B7 1 film without a pair \u00B7 3 films without an embedding');
  const clean = buildDataset({ rows: rows.slice(0, 2), post: '__any__', embeddings: new Map([['SP-1000', embedding('SP-1000')], ['SP-1001', embedding('SP-1001')]]), bundledSha: 'abc', version: '1', now: new Date() });
  assert.equal(datasetMessage(clean, 'D'), 'Dataset written to D \u00B7 1 pair');
});

test('appendColumns adds cells to every data line of a CSV text and leaves the comment block alone', () => {
  const text = '# a\r\n# b\r\nX,Y\r\n1,2\r\n3,4\r\n';
  assert.equal(appendColumns(text, ['Z'], [['z1'], ['z2']]), '# a\r\n# b\r\nX,Y,Z\r\n1,2,z1\r\n3,4,z2\r\n');
});

test('appendColumns keeps a quoted cell carrying an embedded CRLF whole, rather than splitting inside it', () => {
  const text = '# a\r\n# b\r\nX,Y\r\n"multi\r\nline",2\r\n3,4\r\n';
  assert.equal(appendColumns(text, ['Z'], [['z1'], ['z2']]), '# a\r\n# b\r\nX,Y,Z\r\n"multi\r\nline",2,z1\r\n3,4,z2\r\n');
});
