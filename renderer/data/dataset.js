/**
 * Export dataset (similar-cases spec, 2026-09-12, section 13; amended 2026-09-13 for v1.0.8): the four
 * files a notebook trains on, built entirely here from the rows the paired export would write. No
 * images, no paths, no record ids -- a film is named by its study name, the Study ID every export
 * writes, and the only other per-film identity is the calibration digest. Pure: the folder is written
 * by main.js's save-dataset handler; screens/parameters.js wires the button.
 */
import { toCsv, toPairedCsv } from './csv.js';
import { pairStudies } from './pairing.js';
import { PRE_OP } from './timepoints.js';
import { OUTCOMES, FOLLOW_UP_FIELD, resolveOutcomes, primaryOutcome } from './outcomes.js';
import { vector, alignment, subjectFilms, LANDMARK_ORDER, ALIGNMENT_ORDER, ALIGNMENT_WEIGHTS } from './similarity.js';
import { validEmbedding, isCurrent } from './embeddings.js';
import { lastSegment, studyName } from './labels.js';

const CITATION = 'Created by Cody Woodhouse, MD; Michael Jayasuriya, BS.';
const DISCLAIMER = 'Investigational software. NOT FOR CLINICAL USE.';
const IDENTITY = 'Films are named by study name (the stored name, else the film stem), the Study ID of every export; the record id is not exported.';
const SEP = ' \u00B7 ';

// Per registered outcome: `Subject <field>` (the status) and `Subject <date field>`, then the follow-up.
export const RESOLVED_COLUMNS = Object.freeze([
  ...OUTCOMES.flatMap((o) => [`Subject ${o.field.toLowerCase()}`, `Subject ${o.dateField.toLowerCase()}`]),
  `Subject ${FOLLOW_UP_FIELD.toLowerCase()}`,
]);
const PROVENANCE_COLUMNS = ['Film type', 'Coverage', 'Reviewed', 'Embedding', 'Crop localizer', 'Vertebra model', 'Femoral model', 'S1 model', 'Source SHA-256'];

function escapeField(value) {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

// Adds header cells and one cell list per data row to a CSV text: the comment lines are left
// alone, the header line is the first non-comment line, the data lines follow in order.
export function appendColumns(text, headers, cells) {
  const lines = text.split('\r\n');
  let dataIndex = -1;
  const out = lines.map((line) => {
    if (line === '' || line.startsWith('#')) return line;
    dataIndex += 1;
    const extra = dataIndex === 0 ? headers : (cells[dataIndex - 1] ?? headers.map(() => ''));
    return `${line},${extra.map(escapeField).join(',')}`;
  });
  return out.join('\r\n');
}

function filmType(embedding) {
  return embedding?.filmType ?? '';
}

function coverage(study) {
  if (study.measurements == null || study.geometry == null) return '';
  return study.qc?.coverage?.partial === true ? 'partial' : 'full';
}

function currentEmbedding(embeddings, id, bundledSha) {
  const record = embeddings instanceof Map ? embeddings.get(id) : embeddings?.[id];
  return validEmbedding(record) && isCurrent(record, bundledSha) ? record : null;
}

function resolvedCells(study, all) {
  const resolved = resolveOutcomes(subjectFilms(study, all));
  return [
    ...OUTCOMES.flatMap((o) => [resolved[o.key].status, resolved[o.key].date ?? '']),
    resolved.lastFollowUp ?? '',
  ];
}

function provenanceCells(study, embeddings, bundledSha) {
  const embedding = currentEmbedding(embeddings, study.id, bundledSha);
  const models = study.qc?.models ?? {};
  return [
    filmType(embedding), coverage(study), study.reviewedAt ? study.reviewedAt.slice(0, 10) : '',
    embedding ? 'yes' : 'no',
    study.qc?.processing?.crop_localizer === undefined ? '' : (study.qc.processing.crop_localizer ? 'on' : 'off'),
    models.vertebrae ?? '', models.femoral ?? '', models.s1 ?? '',
    study.calibration?.source_sha256 ?? '',
  ];
}

// main.js's save-dataset handler accepts /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/ and nothing else, and an
// ordinary workspace folder is `Fusion 2025 (v2)`: unreduced, the user would see `Could not export:
// Nothing to export.` on a perfectly good library. Every run of other characters becomes one space,
// whitespace collapses, and a leading non-alphanumeric goes -- the sibling reduction
// exportFileName (renderer/data/parameters.js:381) already applies to a suggested file name.
function folderLabel(segment) {
  const cleaned = String(segment ?? '')
    .replace(/[^A-Za-z0-9 ._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^A-Za-z0-9]+/, '');
  return cleaned === '' ? 'library' : cleaned;
}

export function buildDataset({ rows, post, embeddings, bundledSha, version, now = new Date() }) {
  const real = (rows ?? []).filter((study) => study.source === 'real');
  const date = now.toISOString().slice(0, 10);
  const roots = new Set(real.map((s) => (typeof s.workspaceFolder === 'string' && s.workspaceFolder !== '' ? s.workspaceFolder : null)).filter((r) => r !== null));
  const label = roots.size === 1 ? folderLabel(lastSegment([...roots][0])) : 'library';
  const folder = `${label}-dataset-${date}`;

  const filmsCsv = appendColumns(toCsv(real), [...PROVENANCE_COLUMNS, ...RESOLVED_COLUMNS],
    real.map((study) => [...provenanceCells(study, embeddings, bundledSha), ...resolvedCells(study, real)]));

  // Pairing by visit (v1.0.8): a written subject's visits are a Map keyed by header, Pre-op first,
  // each visit's films primary first. The resolved outcome is the subject's, so its pre-op visit's
  // primary film serves; a visit's film type is its primary film's.
  const pairing = pairStudies(real, { post });
  const headers = [PRE_OP, ...pairing.visits];
  const subjectsCsv = appendColumns(toPairedCsv(pairing),
    [...RESOLVED_COLUMNS, ...headers.map((h) => `${h} film type`)],
    pairing.subjects.map((row) => {
      const pre = row.visits.get(PRE_OP).films[0];
      return [
        ...resolvedCells(pre, real),
        ...headers.map((h) => { const visit = row.visits.get(h); return visit ? filmType(currentEmbedding(embeddings, visit.films[0].id, bundledSha)) : ''; }),
      ];
    }));

  // One entry per films.csv data row, in that order, named by study name: an array, so two films
  // that share a name both survive.
  const films = [];
  let withoutEmbedding = 0;
  for (const study of real) {
    const shape = vector(study);
    const embedding = currentEmbedding(embeddings, study.id, bundledSha);
    if (!embedding) withoutEmbedding += 1;
    films.push({
      name: studyName(study),
      shape: shape ? shape.V : null,
      hip: shape ? shape.H : null,
      alignment: alignment(study),
      crop: embedding ? embedding.crop : null,
      whole: embedding ? embedding.whole : null,
      filmType: embedding ? embedding.filmType : null,
    });
  }
  const vectors = {
    version: 1,
    exportedAt: now.toISOString(),
    shape: { dim: 44, order: [...LANDMARK_ORDER], normalisation: 'mirror-anterior-positive-x, centroid, unit-centroid-size, no-rotation' },
    hip: { dim: 2, normalisation: 'the shape transform' },
    alignment: { order: [...ALIGNMENT_ORDER], weights: [...ALIGNMENT_WEIGHTS] },
    embedding: { onnx_sha256: bundledSha ?? null },
    films,
  };

  const statuses = real.map((study) => resolveOutcomes(subjectFilms(study, real))[primaryOutcome().key].status);
  const subjectsSeen = new Set();
  let withOutcome = 0;
  let conflicting = 0;
  real.forEach((study, index) => {
    const key = study.subjectId ? study.subjectId.trim().toLowerCase() : `film:${study.id}`;
    if (subjectsSeen.has(key)) return;
    subjectsSeen.add(key);
    if (statuses[index] === 'yes' || statuses[index] === 'no') withOutcome += 1;
    if (statuses[index] === 'conflicting') conflicting += 1;
  });
  const models = { vertebrae: new Set(), femoral: new Set(), s1: new Set() };
  for (const study of real) for (const slot of Object.keys(models)) if (study.qc?.models?.[slot]) models[slot].add(study.qc.models[slot]);
  const counts = {
    films: real.length, pairs: pairing.subjects.length, unpaired: pairing.unpaired.length, ambiguous: pairing.ambiguous.length,
    mergedVisits: pairing.merged.length, withOutcome, conflicting, withoutEmbedding, noSubject: pairing.noSubject,
  };
  const manifest = {
    app: { name: 'Spine Contour', version },
    exportedAt: now.toISOString(),
    counts,
    models: Object.fromEntries(Object.entries(models).map(([slot, set]) => [slot, [...set].sort()])),
    embedding: { onnx_sha256: bundledSha ?? null },
    outcomes: OUTCOMES.map((o) => ({ key: o.key, field: o.field, dateField: o.dateField, primary: o.primary })),
    followUpField: FOLLOW_UP_FIELD,
    identity: IDENTITY,
    citation: CITATION,
    disclaimer: DISCLAIMER,
  };

  return {
    folder,
    files: {
      'films.csv': filmsCsv,
      'subjects.csv': subjectsCsv,
      'vectors.json': JSON.stringify(vectors),
      'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
    },
    counts,
    pairing,
  };
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

// The toast (spec 13): what was written, then each thing left out or flagged, only when nonzero.
export function datasetMessage(result, folder) {
  const { counts } = result;
  let text = `Dataset written to ${folder}${SEP}${plural(counts.pairs, 'pair', 'pairs')}`;
  if (counts.unpaired > 0) text += `${SEP}${plural(counts.unpaired, 'film without a pair', 'films without a pair')}`;
  if (counts.ambiguous > 0) text += `${SEP}${plural(counts.ambiguous, 'ambiguous subject', 'ambiguous subjects')}`;
  if (counts.mergedVisits > 0) text += `${SEP}${plural(counts.mergedVisits, 'merged visit', 'merged visits')}`;
  if (counts.conflicting > 0) text += `${SEP}${plural(counts.conflicting, 'subject with conflicting outcomes', 'subjects with conflicting outcomes')}`;
  if (counts.withoutEmbedding > 0) text += `${SEP}${plural(counts.withoutEmbedding, 'film without an embedding', 'films without an embedding')}`;
  return text;
}
