/**
 * Export dataset (similar-cases spec, 2026-09-12, section 13; amended 2026-09-13 for v1.0.8, and again
 * for the gate ruling that renamed two of the tables and added a README; and 2026-09-30 for stage 2's
 * regions: vectors.json version 2 carries every block by key, the film's region rides each table): the five files a notebook
 * trains on, built entirely here from the rows the paired export would write. No images, no paths, no
 * record ids -- a film is named by its study name, the Study ID every export writes, and the only
 * other per-film identity is the calibration digest. Pure: the folder is written by main.js's
 * save-dataset handler; screens/parameters.js wires the button.
 */
import { toCsv, toPairedCsv } from './csv.js';
import { pairStudies } from './pairing.js';
import { PRE_OP } from './timepoints.js';
import { OUTCOMES, FOLLOW_UP_FIELD, resolveOutcomes, primaryOutcome } from './outcomes.js';
import {
  vector, cervicalVector, studyBlocks, subjectFilms, LANDMARK_ORDER, CERVICAL_ORDER, ALIGNMENT_ORDER, ALIGNMENT_WEIGHTS,
} from './similarity.js';
import { LUMBAR_SEGMENTAL_ORDER, CERVICAL_SEGMENTAL_ORDER, DISC_ORDER, BLOCKS, FAMILIES, ENTRY_KEYS } from './similarity-blocks.js';
import { readEmbedding, isCurrent } from './embeddings.js';
import { studyRegion } from './cervical.js';
import { lastSegment, studyName } from './labels.js';

// No author names in any file of the folder (the 1.0.14 rule the CSV exports follow): the notice says
// what the folder is, the app name and version sit in the manifest and the README's first lines.
const NOTICE = 'Spine Contour dataset export: measurements, paired visits and vectors from the library, with no images.';
const DISCLAIMER = 'Investigational software. NOT FOR CLINICAL USE.';
const IDENTITY = 'Films are named by study name (the stored name, else the film stem), the Study ID of every export; the record id is not exported.';
const SEP = ' \u00B7 ';

// Per registered outcome: `Subject <field>` (the status) and `Subject <date field>`, then the follow-up.
export const RESOLVED_COLUMNS = Object.freeze([
  ...OUTCOMES.flatMap((o) => [`Subject ${o.field.toLowerCase()}`, `Subject ${o.dateField.toLowerCase()}`]),
  `Subject ${FOLLOW_UP_FIELD.toLowerCase()}`,
]);
const PROVENANCE_COLUMNS = ['Region', 'Coverage', 'Reviewed', 'Embedding', 'Crop localizer', 'Vertebra model', 'Femoral model', 'S1 model', 'Source SHA-256'];
// The appearance blocks are keyed in the registry by block (C, CC, W) but carried on each film entry by
// the record's vector name (ruling R24): vectors.json's `blocks` and the README both read this map.
const APPEARANCE_VECTORS = Object.freeze({ C: 'lumbar', CC: 'cervical', W: 'whole' });
// Each block's nominal scale, from the registry (ruling R26): the divisor the app uses for a block that fewer
// than three candidate pairs share, so a notebook can reproduce the ranking's units.
const SCALE = Object.freeze(Object.fromEntries(BLOCKS.map((block) => [block.key, block.scale])));
// The families, from the registry rather than typed here, so the file cannot drift from it.
const VECTOR_FAMILIES = Object.fromEntries(FAMILIES.map((family) => [family, BLOCKS.filter((block) => block.family === family).map((block) => block.key)]));

function escapeField(value) {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

// Splits a CSV text on \r\n, but never inside a quoted field: a `"` toggles quoted state, and a
// doubled `""` while quoted (an escaped quote, csv.js's own escapeField rule) stays inside. A
// quoted cell may carry an embedded \r\n or \n -- escapeField quotes such a value rather than
// rejecting it, and csv.js's parse() reads it back as one field -- so splitting blindly on every
// literal \r\n would tear that one cell into two lines and shift every later row's appended cells.
function splitCsvLines(text) {
  const lines = [];
  let start = 0;
  let inQuotes = false;
  let i = 0;
  const len = text.length;
  while (i < len) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i += 1;
      continue;
    }
    if (!inQuotes && char === '\r' && text[i + 1] === '\n') {
      lines.push(text.slice(start, i));
      i += 2;
      start = i;
      continue;
    }
    i += 1;
  }
  lines.push(text.slice(start));
  return lines;
}

// Adds header cells and one cell list per data row to a CSV text: only the lines BEFORE the
// header are comments, so `#` is tested by position, not by content -- a data row named with a
// leading `#` (escapeField quotes only on [",\r\n], so a bare `#` reaches the file) still gets
// its own appended cells rather than being read as a comment and shifting every later row up.
export function appendColumns(text, headers, cells) {
  const lines = splitCsvLines(text);
  let seenHeader = false;
  let dataIndex = -1;
  const out = lines.map((line) => {
    if (!seenHeader) {
      if (line === '' || line.startsWith('#')) return line;
      seenHeader = true;
      return `${line},${headers.map(escapeField).join(',')}`;
    }
    if (line === '') return line;
    dataIndex += 1;
    const extra = cells[dataIndex] ?? headers.map(() => '');
    return `${line},${extra.map(escapeField).join(',')}`;
  });
  return out.join('\r\n');
}

function coverage(study) {
  if (study.measurements == null || study.geometry == null) return '';
  return study.qc?.coverage?.partial === true ? 'partial' : 'full';
}

// The stored record lifted to the version-2 fields, or null when it is invalid, from another graph, or
// not the current version (a stage-1 record reads as lumbar-only and is never current: Embed recomputes it).
function currentEmbedding(embeddings, id, bundledSha) {
  const raw = embeddings instanceof Map ? embeddings.get(id) : embeddings?.[id];
  const record = readEmbedding(raw);
  return record && isCurrent(record, bundledSha) ? record : null;
}

// An entry block (A, SL, D, AC, BC, SC, B) is a list with one slot per entry and null in the slots a film
// lacks; a film with nothing in any slot lacks the block, so it is null like a missing shape.
function entriesOrNull(values) {
  return values.some((v) => typeof v === 'number' && Number.isFinite(v)) ? values : null;
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
    studyRegion(study), coverage(study), study.reviewedAt ? study.reviewedAt.slice(0, 10) : '',
    embedding ? 'yes' : 'no',
    study.qc?.processing?.crop_localizer === undefined ? '' : (study.qc.processing.crop_localizer ? 'on' : 'off'),
    models.vertebrae ?? '', models.femoral ?? '', models.s1 ?? '',
    study.calibration?.source_sha256 ?? '',
  ];
}

// The folder's own README (gate ruling, 2026-09-14): pure markdown, called from buildDataset with
// what it already computed, so the file always describes the sibling tables' actual shape rather
// than a hand-written copy that can drift. ASCII throughout -- ordinary hyphens stand in for what
// would otherwise be an em dash, since this text is JS source even though it reads as markdown.
export function datasetReadme({ counts, version, exportedAt, embeddingRecord }) {
  const provenance = PROVENANCE_COLUMNS.join(', ');
  const resolved = RESOLVED_COLUMNS.join(', ');
  const encoder = embeddingRecord?.id ?? 'the bundled encoder';
  const lines = [
    '# Spine Contour dataset',
    '',
    `Spine Contour v${version}, exported ${exportedAt}.`,
    '',
    '## Files',
    '',
    `- \`parameters.csv\` - one row per film: the Export CSV file (the measurements, disc heights, calibration and clinical fields) plus the provenance columns ${provenance}, then the outcome columns resolved per subject: ${resolved}. \`Region\` is the film's own spine region: lumbar, cervical or full_spine, or auto for a film not yet segmented.`,
    `- \`paired.csv\` - one row per subject with a pre-op film and at least one later visit: the Export paired CSV file plus the same resolved outcome columns (${resolved}) and a \`<visit> region\` column per written visit (for example \`Pre-op region\`, \`Post-op region\`), each the visit's primary film's region.`,
    `- \`vectors.json\` (version 2) - one entry per row of parameters.csv, in the same order, named by study name, with the film's region. Blocks by key, \`null\` where a film lacks one: lumbar family \`V\` (44 numbers, the 22 lumbar landmarks ${LANDMARK_ORDER.join(', ')} after mirroring anterior to +x, centring and scaling to unit centroid size, never rotated), \`H\` (the hip midpoint under the same transform), \`A\` (${ALIGNMENT_ORDER.join(', ')} in degrees, weighted ${ALIGNMENT_WEIGHTS.join(', ')}), \`SL\` (the ten lumbar segmental lordosis and angulation values, degrees), \`D\` (fifteen disc heights in mm, calibrated films only); cervical family \`VC\` (44 numbers, ${CERVICAL_ORDER.join(', ')} mirrored by the recorded anterior side), \`AC\` (C2-C7 Cobb, degrees), \`BC\` (C2-C7 SVA, mm, calibrated only), \`SC\` (the ten cervical segmental values); whole-spine family \`B\` (C7-S1 SVA, mm, full-spine calibrated films only); and the appearance vectors \`lumbar\`, \`cervical\` and \`whole\` from ${encoder}, unit length, never carried from an encoder other than the one manifest.json names. In \`blocks\` and \`families\` the appearance vectors go by their block keys: \`C\` is \`${APPEARANCE_VECTORS.C}\`, \`CC\` is \`${APPEARANCE_VECTORS.CC}\` and \`W\` is \`${APPEARANCE_VECTORS.W}\` (each block's \`vector\` names the film key). In the app every block is scaled by its median over the candidates when at least three candidate pairs share the block (and that median is above float noise), else by the block's nominal scale, a prior listed as \`scale\` in \`vectors.json\`'s \`blocks\`; the four families share equal budgets.`,
    '- `manifest.json` - the counts (with the films of each region), the models seen, the encoder record, the identity line, the notice, the disclaimer.',
    '- `README.md` - this file.',
    '',
    '## Identity',
    '',
    `${IDENTITY} The file path and the image are not exported either, and neither can be recovered from these files.`,
    '',
    '## Blanks',
    '',
    "A blank cell is unknown, never zero. A film lacking a block's inputs has `null` for that block. `not-recorded` and `conflicting` outcomes are unknown, not a result.",
    '',
    `\`V\` and \`VC\` are \`null\` unless the film has the complete column (all 22 landmarks), even though the app ranks two films over the landmarks they share; an entry block (${ENTRY_KEYS.map((key) => `\`${key}\``).join(', ')}) keeps a \`null\` in each slot the film lacks and is \`null\` only when every slot is. A folder can carry no appearance vectors at all: embedding records from before version 2 or from another encoder are not exported, and \`Embed\` on the Find tab recomputes them.`,
    '',
    '## Before training',
    '',
    "Split by subject, never by film: a subject's films share one outcome, and the app's own similar-cases tab excludes the same subject for the same reason.",
    '',
    `- ${counts.films} films`,
    `- ${counts.pairs} pairs`,
    `- ${counts.unpaired} unpaired`,
    `- ${counts.ambiguous} ambiguous`,
    `- ${counts.mergedVisits} merged visits`,
    `- ${counts.withOutcome} with a recorded outcome`,
    `- ${counts.conflicting} conflicting`,
    `- ${counts.withoutEmbedding} without an embedding`,
    '',
    NOTICE,
    DISCLAIMER,
    '',
  ];
  return lines.join('\n');
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

export function buildDataset({ rows, post, embeddings, bundledSha, bundledModel = null, version, now = new Date() }) {
  const real = (rows ?? []).filter((study) => study.source === 'real');
  // The full model record when the caller has it (spec section 13), else just the sha for
  // callers -- and the older tests -- that only have that.
  const sha = bundledModel?.onnx_sha256 ?? bundledSha ?? null;
  const embeddingRecord = bundledModel ? { ...bundledModel } : { onnx_sha256: sha };
  const date = now.toISOString().slice(0, 10);
  const roots = new Set(real.map((s) => (typeof s.workspaceFolder === 'string' && s.workspaceFolder !== '' ? s.workspaceFolder : null)).filter((r) => r !== null));
  const label = roots.size === 1 ? folderLabel(lastSegment([...roots][0])) : 'library';
  const folder = `${label}-dataset-${date}`;

  const filmsCsv = appendColumns(toCsv(real), [...PROVENANCE_COLUMNS, ...RESOLVED_COLUMNS],
    real.map((study) => [...provenanceCells(study, embeddings, sha), ...resolvedCells(study, real)]));

  // Pairing by visit (v1.0.8): a written subject's visits are a Map keyed by header, Pre-op first,
  // each visit's films primary first. The resolved outcome is the subject's, so its pre-op visit's
  // primary film serves; a visit's region is its primary film's.
  const pairing = pairStudies(real, { post });
  const headers = [PRE_OP, ...pairing.visits];
  const subjectsCsv = appendColumns(toPairedCsv(pairing),
    [...RESOLVED_COLUMNS, ...headers.map((h) => `${h} region`)],
    pairing.subjects.map((row) => {
      const pre = row.visits.get(PRE_OP).films[0];
      return [
        ...resolvedCells(pre, real),
        ...headers.map((h) => { const visit = row.visits.get(h); return visit ? studyRegion(visit.films[0]) : ''; }),
      ];
    }));

  // One entry per parameters.csv data row, in that order, named by study name: an array, so two films
  // that share a name both survive.
  const films = [];
  let withoutEmbedding = 0;
  for (const study of real) {
    const embedding = currentEmbedding(embeddings, study.id, sha);
    if (!embedding) withoutEmbedding += 1;
    const lumbar = vector(study);
    const cervical = cervicalVector(study);
    // Block D follows disc-heights.js's own calibration rule: studyBlocks reads it, nothing is recomputed here.
    const b = studyBlocks(study, null);
    films.push({
      name: studyName(study),
      region: studyRegion(study),
      V: lumbar ? lumbar.V : null,
      H: lumbar ? lumbar.H : null,
      A: entriesOrNull(b.entries.A), SL: entriesOrNull(b.entries.SL), D: entriesOrNull(b.entries.D),
      VC: cervical ? cervical.V : null,
      AC: entriesOrNull(b.entries.AC), BC: entriesOrNull(b.entries.BC), SC: entriesOrNull(b.entries.SC), B: entriesOrNull(b.entries.B),
      lumbar: embedding ? embedding.lumbar : null,
      cervical: embedding ? embedding.cervical : null,
      whole: embedding ? embedding.whole : null,
    });
  }
  const vectors = {
    version: 2,
    exportedAt: now.toISOString(),
    families: VECTOR_FAMILIES,
    blocks: {
      V: { dim: 44, order: [...LANDMARK_ORDER], normalisation: 'mirror-anterior-positive-x, centroid, unit-centroid-size, no-rotation', scale: SCALE.V },
      H: { dim: 2, normalisation: 'the V transform', scale: SCALE.H },
      A: { order: [...ALIGNMENT_ORDER], weights: [...ALIGNMENT_WEIGHTS], unit: 'deg', scale: SCALE.A },
      SL: { order: [...LUMBAR_SEGMENTAL_ORDER], unit: 'deg', scale: SCALE.SL },
      D: { order: [...DISC_ORDER], unit: 'mm', scale: SCALE.D },
      VC: { dim: 44, order: [...CERVICAL_ORDER], normalisation: 'mirror-by-anterior-side, centroid, unit-centroid-size, no-rotation', scale: SCALE.VC },
      AC: { order: ['C2-C7 Cobb'], unit: 'deg', scale: SCALE.AC },
      BC: { order: ['C2-C7 SVA'], unit: 'mm', scale: SCALE.BC },
      SC: { order: [...CERVICAL_SEGMENTAL_ORDER], unit: 'deg', scale: SCALE.SC },
      B: { order: ['C7-S1 SVA'], unit: 'mm', scale: SCALE.B },
      W: { vector: APPEARANCE_VECTORS.W, unit: 'embedding', scale: SCALE.W },
      C: { vector: APPEARANCE_VECTORS.C, unit: 'embedding', scale: SCALE.C },
      CC: { vector: APPEARANCE_VECTORS.CC, unit: 'embedding', scale: SCALE.CC },
      embedding: embeddingRecord,
    },
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
  // Films per region. A film still at `auto` (not segmented, so unresolved) is tallied under `auto`, a key
  // that exists only when such a film does -- never folded into lumbar.
  const regions = { lumbar: 0, cervical: 0, full_spine: 0 };
  for (const study of real) {
    const region = studyRegion(study);
    regions[region] = (regions[region] ?? 0) + 1;
  }
  const counts = {
    films: real.length, pairs: pairing.subjects.length, unpaired: pairing.unpaired.length, ambiguous: pairing.ambiguous.length,
    mergedVisits: pairing.merged.length, withOutcome, conflicting, withoutEmbedding, noSubject: pairing.noSubject, regions,
  };
  const manifest = {
    app: { name: 'Spine Contour', version },
    exportedAt: now.toISOString(),
    counts,
    models: Object.fromEntries(Object.entries(models).map(([slot, set]) => [slot, [...set].sort()])),
    embedding: embeddingRecord,
    outcomes: OUTCOMES.map((o) => ({ key: o.key, field: o.field, dateField: o.dateField, primary: o.primary })),
    followUpField: FOLLOW_UP_FIELD,
    identity: IDENTITY,
    notice: NOTICE,
    disclaimer: DISCLAIMER,
  };

  const readme = datasetReadme({ counts, version, exportedAt: manifest.exportedAt, embeddingRecord });

  return {
    folder,
    files: {
      'parameters.csv': filmsCsv,
      'paired.csv': subjectsCsv,
      'vectors.json': JSON.stringify(vectors),
      'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
      'README.md': readme,
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
