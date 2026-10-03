import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset, datasetMessage, appendColumns, RESOLVED_COLUMNS, datasetReadme } from '../renderer/data/dataset.js';
import { lumbarGeometry, cervicalGeometry, CALIBRATION } from './fixtures/similarity-fixtures.js';
import { BLOCKS, BLOCK_KEYS, FAMILIES } from '../renderer/data/similarity-blocks.js';

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
// A version-2 stored record: the region the film was embedded under and one vector per crop, any of them null.
const embedding = (id, sha = 'abc') => ({ version: 2, id, computedAt: 'x', sourceSha256: null, model: { onnx_sha256: sha }, region: 'lumbar', lumbar: unit([1, 0]), cervical: null, whole: unit([0, 1]) });

const rows = [
  film('SP-1000', 'S001 pre', 'S001', 'Pre-op', { 'Fusion extension': 'Yes', 'Fusion extension date': '2026-01-10' }),
  film('SP-1001', 'S001 post', 'S001', 'Post-op', { 'Last follow-up': '2026-06-01', 'Interbody type': 'PEEK' }, { filmDate: '2025-06-01' }),
  film('SP-1002', 'S002 pre', 'S002', 'Pre-op'),
  film('SP-1003', 'lone film', null, null, {}, { geometry: null, measurements: null, qc: null }),
  { ...film('SP-0042', 'demo', 'D', 'Pre-op'), source: 'demo' },
];
const embeddings = new Map([['SP-1000', embedding('SP-1000')], ['SP-1001', embedding('SP-1001', 'old')]]);
// The full bundled-model record (spec section 13): built() passes it so vectors.json and
// manifest.json carry the encoder's id and shape, not just its sha.
const BUNDLED_MODEL = { id: 'vit_small_patch14_dinov2.lvd142m', dim: 2, input: [224, 224], onnx_sha256: 'abc' };
const built = () => buildDataset({ rows, post: '__any__', embeddings, bundledSha: 'abc', bundledModel: BUNDLED_MODEL, version: '1.0.8', now: new Date('2026-09-12T20:00:00.000Z') });

test('the folder name carries the workspace label and the date, reduced to what save-dataset accepts', () => {
  assert.equal(built().folder, 'films-dataset-2026-09-12');
  assert.equal(buildDataset({ rows: [], post: '__any__', embeddings: new Map(), bundledSha: null, version: '1', now: new Date('2026-09-12T20:00:00.000Z') }).folder, 'library-dataset-2026-09-12');
  // An ordinary Windows folder carries brackets; save-dataset accepts only
  // /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/, so the label is reduced here rather than refused there.
  const bracketed = [{ ...rows[0], workspaceFolder: 'C:\\Fusion 2025 (v2)' }];
  assert.equal(buildDataset({ rows: bracketed, post: '__any__', embeddings: new Map(), bundledSha: null, version: '1', now: new Date('2026-09-12T20:00:00.000Z') }).folder,
    'Fusion 2025 v2-dataset-2026-09-12');
});

test('parameters.csv is toCsv plus the provenance, then the resolved outcome columns, one row per real film named by study name', () => {
  const text = built().files['parameters.csv'];
  const lines = text.split('\r\n').filter((l) => l !== '');
  assert.equal(lines[0], '# Spine Contour export');
  // Two comment lines since v1.0.14 (no authors line), so the header is line 3.
  const header = lines[2].split(',');
  assert.equal(header[0], 'Study ID');
  assert.deepEqual(header.slice(-12), ['Region', 'Coverage', 'Reviewed', 'Embedding', 'Crop localizer', 'Vertebra model', 'Femoral model', 'S1 model', 'Source SHA-256', ...RESOLVED_COLUMNS]);
  assert.deepEqual(RESOLVED_COLUMNS, ['Subject fusion extension', 'Subject fusion extension date', 'Subject last follow-up']);
  assert.equal(lines.length - 3, 4);
  const first = lines[3].split(',');
  assert.equal(first[0], 'S001 pre');
  const at = (name) => first[header.indexOf(name)];
  assert.equal(at('Region'), 'lumbar');
  assert.equal(at('Coverage'), 'full');
  assert.equal(at('Embedding'), 'yes');
  assert.equal(at('Crop localizer'), 'on');
  assert.equal(at('Vertebra model'), 'unet');
  assert.equal(at('Source SHA-256'), 'digest-1000');
  assert.equal(at('Subject fusion extension'), 'yes');
  assert.equal(at('Subject fusion extension date'), '2026-01-10');
  assert.equal(at('Subject last follow-up'), '2026-06-01');
  const second = lines[4].split(',');
  assert.equal(second[header.indexOf('Embedding')], 'no');
  const unsegmented = lines[6].split(',');
  assert.equal(unsegmented[0], 'lone film');
  assert.equal(unsegmented[header.indexOf('Coverage')], '');
  assert.equal(unsegmented[header.indexOf('Subject fusion extension')], 'not-recorded');
  assert.equal(lines.filter((l) => l.startsWith('demo,')).length, 0, 'demo rows dropped');
  assert.ok(!text.includes('C:\\films'), 'no path');
  assert.ok(!text.includes('.png'), 'no extension');
  assert.ok(!text.includes('SP-'), 'no record id');
});

test('paired.csv is the paired export by visit plus the resolved columns and each visit\u2019s region', () => {
  const lines = built().files['paired.csv'].split('\r\n').filter((l) => l !== '');
  const header = lines[2].split(',');
  assert.deepEqual(header.slice(-5), [...RESOLVED_COLUMNS, 'Pre-op region', 'Post-op region']);
  assert.equal(lines.length - 3, 1);
  const row = lines[3].split(',');
  assert.equal(row[0], 'S001');
  assert.equal(row[header.indexOf('Pre-op study')], 'S001 pre');
  assert.equal(row[header.indexOf('Subject fusion extension')], 'yes');
  assert.equal(row[header.indexOf('Pre-op region')], 'lumbar');
  // The region is the film's own, not the embedding's: SP-1001's stored embedding came from another
  // graph, yet its visit still reads lumbar.
  assert.equal(row[header.indexOf('Post-op region')], 'lumbar');
});

test('a merged visit counts once, is flagged in the toast, and takes its primary film\u2019s region', () => {
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
  const lines = merged.files['paired.csv'].split('\r\n').filter((l) => l !== '');
  const header = lines[2].split(',');
  const row = lines[3].split(',');
  assert.equal(row[header.indexOf('Pre-op study')], 'S003 pre + S003 pre flexion');
  assert.equal(row[header.indexOf('Pre-op region')], 'lumbar');
  assert.equal(datasetMessage(merged, 'D'), 'Dataset written to D \u00B7 1 pair \u00B7 1 merged visit \u00B7 2 films without an embedding');
});

test('vectors.json carries the blocks per film in parameters.csv order, named by study name, null where absent, never an embedding from another graph', () => {
  const vectors = JSON.parse(built().files['vectors.json']);
  assert.equal(vectors.version, 2);
  assert.equal(vectors.blocks.V.dim, 44);
  assert.equal(vectors.blocks.V.order.length, 22);
  assert.equal(vectors.blocks.H.dim, 2);
  assert.deepEqual(vectors.blocks.A.order, ['PI', 'PT', 'SS', 'LL L1-S1', 'PI-LL', 'L1PA']);
  assert.deepEqual(vectors.blocks.A.weights, [1, 0.8, 0.8, 0.6, 1, 0.8]);
  assert.deepEqual(vectors.films.map((f) => f.name), ['S001 pre', 'S001 post', 'S002 pre', 'lone film']);
  const [pre, post, , lone] = vectors.films;
  assert.equal(pre.V.length, 44);
  assert.equal(pre.H.length, 2);
  assert.deepEqual(pre.A, [50, 12, 38, 49, 1, 8]);
  assert.equal(pre.lumbar.length, 2);
  assert.equal(pre.whole.length, 2);
  assert.equal(pre.cervical, null);
  assert.equal(pre.region, 'lumbar');
  assert.equal(post.lumbar, null, 'another graph’s embedding is not carried');
  assert.equal(post.whole, null);
  assert.equal(lone.V, null);
  assert.equal(lone.A, null, 'a film with no entry of a block has null for it, not a list of nulls');
  assert.deepEqual(vectors.blocks.embedding, BUNDLED_MODEL);
  assert.ok(!built().files['vectors.json'].includes('SP-'), 'no record id');
  assert.ok(!built().files['vectors.json'].includes('\n'), 'not pretty-printed');
});

test('vectors.json version 2 carries every block by key with null where a film lacks it', () => {
  const rows = [
    film('SP-1', 'one', null, null, {}, { geometry: lumbarGeometry(), calibration: CALIBRATION }),
    film('SP-2', 'two', null, null, {}, { geometry: null, measurements: null }),
  ];
  const embeddings = { 'SP-1': { version: 2, id: 'SP-1', model: { onnx_sha256: 'abc' }, region: 'lumbar', lumbar: [1, 0], cervical: null, whole: [0, 1] } };
  const { files } = buildDataset({ rows, post: 'Post-op', embeddings, bundledSha: 'abc', version: '1.0.13' });
  const vectors = JSON.parse(files['vectors.json']);
  assert.equal(vectors.version, 2);
  // The families come from the registry, so the file cannot drift from it (ruling R24).
  assert.deepEqual(vectors.families, Object.fromEntries(FAMILIES.map((family) => [family, BLOCKS.filter((block) => block.family === family).map((block) => block.key)])));
  assert.deepEqual(vectors.families, { lumbar: ['V', 'H', 'A', 'SL', 'D'], cervical: ['VC', 'AC', 'BC', 'SC'], whole: ['B', 'W'], appearance: ['C', 'CC'] });
  assert.deepEqual(Object.keys(vectors.blocks), [...BLOCK_KEYS, 'embedding']);
  assert.deepEqual(vectors.blocks.C, { vector: 'lumbar', unit: 'embedding' });
  assert.deepEqual(vectors.blocks.CC, { vector: 'cervical', unit: 'embedding' });
  assert.deepEqual(vectors.blocks.W, { vector: 'whole', unit: 'embedding' });
  // Every key a family names is a film entry's key, or a block whose `vector` is one.
  const filmKeys = Object.keys(vectors.films[0]);
  for (const key of Object.values(vectors.families).flat()) {
    assert.ok(filmKeys.includes(key) || filmKeys.includes(vectors.blocks[key]?.vector), `${key} names no film entry`);
  }
  assert.equal(vectors.blocks.A.order.length, 6);
  assert.equal(vectors.blocks.SL.order.length, 10);
  assert.equal(vectors.blocks.D.order.length, 15);
  assert.equal(vectors.blocks.VC.dim, 44);
  assert.equal(vectors.blocks.VC.order.length, 22);
  assert.equal(vectors.blocks.VC.normalisation, 'mirror-by-anterior-side, centroid, unit-centroid-size, no-rotation');
  const [one, two] = vectors.films;
  assert.deepEqual(Object.keys(one), ['name', 'region', 'V', 'H', 'A', 'SL', 'D', 'VC', 'AC', 'BC', 'SC', 'B', 'lumbar', 'cervical', 'whole']);
  assert.equal(one.region, 'lumbar');
  assert.equal(one.V.length, 44);
  assert.equal(one.D.length, 15);
  assert.equal(one.VC, null);
  assert.deepEqual(one.lumbar, [1, 0]);
  assert.equal(two.V, null);
  assert.equal(two.lumbar, null);
  for (const key of ['H', 'A', 'SL', 'D', 'VC', 'AC', 'BC', 'SC', 'B', 'cervical', 'whole']) assert.equal(two[key], null, `${key} is null on a film with nothing for it`);
  const manifest = JSON.parse(files['manifest.json']);
  assert.deepEqual(manifest.counts.regions, { lumbar: 2, cervical: 0, full_spine: 0 });
});

test('Region, VC and the cervical vector follow each film’s own region; an unsegmented auto film is counted as auto, never as lumbar', () => {
  const rows = [
    film('SP-3', 'neck', null, null, {}, { region: 'cervical', geometry: cervicalGeometry(), measurements: { region: 'cervical' }, calibration: CALIBRATION }),
    film('SP-4', 'pending', null, null, {}, { region: 'auto', geometry: null, measurements: null }),
    film('SP-5', 'back', null, null, {}),
  ];
  const embeddings = { 'SP-3': { version: 2, id: 'SP-3', model: { onnx_sha256: 'abc' }, region: 'cervical', lumbar: null, cervical: [0, 1], whole: null } };
  const { files, counts } = buildDataset({ rows, post: 'Post-op', embeddings, bundledSha: 'abc', version: '1.0.13' });
  const lines = files['parameters.csv'].split('\r\n').filter((l) => l !== '');
  const header = lines[2].split(',');
  const regionOf = (line) => lines[line].split(',')[header.indexOf('Region')];
  assert.deepEqual([3, 4, 5].map(regionOf), ['cervical', 'auto', 'lumbar']);
  assert.equal(lines[3].split(',')[header.indexOf('Embedding')], 'yes', 'a cervical-only record is a current embedding');
  const [neck, pending, back] = JSON.parse(files['vectors.json']).films;
  assert.deepEqual([neck.region, pending.region, back.region], ['cervical', 'auto', 'lumbar']);
  assert.equal(neck.V, null);
  assert.equal(neck.VC.length, 44);
  assert.equal(neck.AC.length, 1);
  assert.ok(Number.isFinite(neck.AC[0]));
  assert.deepEqual(neck.cervical, [0, 1]);
  assert.equal(neck.lumbar, null);
  assert.equal(back.VC, null);
  assert.deepEqual(counts.regions, { lumbar: 1, cervical: 1, full_spine: 0, auto: 1 });
  assert.deepEqual(JSON.parse(files['manifest.json']).counts.regions, counts.regions);
});

test('a stage-1 (version 1) embedding is read but never exported as current', () => {
  const stage1 = { version: 1, id: 'SP-1000', computedAt: 'x', sourceSha256: null, model: { onnx_sha256: 'abc' }, filmType: 'whole-spine', crop: unit([1, 0]), whole: unit([0, 1]) };
  const result = buildDataset({ rows: rows.slice(0, 1), post: '__any__', embeddings: new Map([['SP-1000', stage1]]), bundledSha: 'abc', version: '1', now: new Date('2026-09-12T20:00:00.000Z') });
  const lines = result.files['parameters.csv'].split('\r\n').filter((l) => l !== '');
  const header = lines[2].split(',');
  assert.equal(lines[3].split(',')[header.indexOf('Embedding')], 'no');
  const [pre] = JSON.parse(result.files['vectors.json']).films;
  assert.equal(pre.lumbar, null);
  assert.equal(pre.whole, null);
  assert.equal(result.counts.withoutEmbedding, 1);
});

test('manifest.json names the app, the date, the counts, the models, the identity and the disclaimer', () => {
  const manifest = JSON.parse(built().files['manifest.json']);
  assert.equal(manifest.app.version, '1.0.8');
  assert.equal(manifest.exportedAt, '2026-09-12T20:00:00.000Z');
  assert.deepEqual(manifest.counts, { films: 4, pairs: 1, unpaired: 1, ambiguous: 0, mergedVisits: 0, withOutcome: 1, conflicting: 0, withoutEmbedding: 3, noSubject: 1, regions: { lumbar: 4, cervical: 0, full_spine: 0 } });
  assert.deepEqual(manifest.embedding, BUNDLED_MODEL);
  assert.deepEqual(manifest.models, { vertebrae: ['unet'], femoral: ['unet'], s1: ['keypointrcnn'] });
  assert.equal(manifest.identity, 'Films are named by study name (the stored name, else the film stem), the Study ID of every export; the record id is not exported.');
  assert.equal(manifest.disclaimer, 'Investigational software. NOT FOR CLINICAL USE.');
  // The exports name no one since v1.0.14: the folder says what it is, not who made it.
  assert.equal(manifest.notice, 'Spine Contour dataset export: measurements, paired visits and vectors from the library, with no images.');
  assert.equal('citation' in manifest, false);
  assert.equal(built().files['manifest.json'].includes('\n  '), true, 'pretty-printed');
});

test('no file of the dataset names a person', () => {
  for (const [name, text] of Object.entries(built().files)) {
    assert.ok(!/Created by|Woodhouse|Jayasuriya/.test(text), `${name} names an author`);
  }
});

test('buildDataset writes exactly the five files, named as the exports and the fixed three', () => {
  assert.deepEqual(Object.keys(built().files).sort(), ['README.md', 'manifest.json', 'paired.csv', 'parameters.csv', 'vectors.json']);
});

test('README.md names all five files, carries the identity sentence, the disclaimer, and says the split is by subject', () => {
  assert.equal(typeof datasetReadme, 'function');
  const readme = built().files['README.md'];
  assert.equal(typeof readme, 'string');
  for (const name of ['parameters.csv', 'paired.csv', 'vectors.json', 'manifest.json', 'README.md']) {
    assert.ok(readme.includes(name), `README.md does not mention ${name}`);
  }
  assert.ok(readme.includes('the record id is not exported'), 'README.md carries the identity sentence');
  assert.ok(readme.includes('Investigational software. NOT FOR CLINICAL USE.'), 'README.md carries the disclaimer');
  assert.ok(readme.includes('Split by subject'), 'README.md says the split is by subject');
  assert.ok(readme.startsWith('# Spine Contour dataset'), 'README.md opens with its title');
});

test('README.md describes vectors.json version 2: the region, every block key, the region columns and the nulls', () => {
  const readme = built().files['README.md'];
  assert.ok(readme.includes('`vectors.json` (version 2)'), 'names the version');
  assert.ok(readme.includes('`Region`'), 'parameters.csv’s Region column is listed');
  assert.ok(readme.includes('`<visit> region`') && readme.includes('`Pre-op region`'), 'paired.csv’s region columns are named');
  for (const key of ['V', 'H', 'A', 'SL', 'D', 'VC', 'AC', 'BC', 'SC', 'B', 'lumbar', 'cervical', 'whole']) {
    assert.ok(readme.includes(`\`${key}\``), `README.md does not name the ${key} block`);
  }
  assert.ok(readme.includes('PI, PT, SS, LL L1-S1, PI-LL, L1PA'), 'the six alignment entries in order');
  assert.ok(readme.includes('1, 0.8, 0.8, 0.6, 1, 0.8'), 'and their weights');
  assert.ok(readme.includes("A film lacking a block's inputs has `null` for that block."), 'the blank-value line');
  assert.ok(!readme.includes('film type') && !readme.includes('`shape`') && !readme.includes('`crop`'), 'no stage-1 names left');
});

test('README.md maps the appearance blocks to the film keys, states the shape-null rule and why a folder can lack embeddings (ruling R24)', () => {
  const readme = built().files['README.md'];
  assert.ok(readme.includes('`C` is `lumbar`, `CC` is `cervical` and `W` is `whole`'), 'the appearance block to film key mapping');
  assert.ok(readme.includes('`V` and `VC` are `null` unless the film has the complete column'), 'the shape-null rule');
  assert.ok(readme.includes('even though the app ranks two films over the landmarks they share'), 'and why it differs from the app');
  assert.ok(readme.includes('keeps a `null` in each slot the film lacks'), 'entry blocks keep per-slot nulls');
  assert.ok(readme.includes('from before version 2 or from another encoder are not exported') && readme.includes('`Embed`'), 'why a folder can have no embeddings');
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

test('appendColumns treats `#` as a comment only before the header, so a data row named with a leading # keeps its own cells', () => {
  const text = '# a\r\n# b\r\nX,Y\r\n#12 smith,2\r\nplain,4\r\n';
  assert.equal(appendColumns(text, ['Z'], [['z1'], ['z2']]), '# a\r\n# b\r\nX,Y,Z\r\n#12 smith,2,z1\r\nplain,4,z2\r\n');
});
