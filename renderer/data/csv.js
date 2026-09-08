import { normaliseTimepoint, normaliseView, parseFilmDate, PRE_OP } from './timepoints.js';

const MEASUREMENT_COLUMNS = [
  'LL L1-S1', 'PI', 'PT', 'SS', 'PI-LL Mismatch', 'L1PA',
  'LL L2-S1', 'LL L3-S1', 'LL L4-S1', 'LL L5-S1',
];

// Measurement columns are written to one decimal, matching what the Measurements panel
// displays, so a value read off the screen and the same value in the file agree. It also
// keeps float noise out of the data: PI 48.6 minus LL['L1-S1'] 49.0 computes to
// -0.3999999999999986, and sixteen digits of that beside a clean 48.6 in the same row reads
// as a defect to whoever opens the file. One decimal is finer than the segmentation's own
// accuracy, so nothing meaningful is lost.
function round1(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(1)) : '';
}

// The later value minus the earlier, over the one-decimal forms of each (pre-op/post-op spec §11.2):
// the file writes both sides to one decimal, so the delta is computed from what is written and
// the three cells always agree to the digit. Empty when either side is absent, never 0. Exported
// for comparison mode (plan 07) to apply the same rule.
export function delta1(pre, post) {
  const a = round1(pre);
  const b = round1(post);
  if (a === '' || b === '') return '';
  return Number((b - a).toFixed(1));
}

function measurementValue(study, column) {
  const m = study.measurements;
  if (!m) return '';
  const ll = m.LL;
  switch (column) {
    case 'LL L1-S1': return round1(ll?.['L1-S1']);
    case 'PI': return round1(m.PI);
    case 'PT': return round1(m.PT);
    case 'SS': return round1(m.SS);
    case 'PI-LL Mismatch': {
      if (!ll || m.PI == null) return '';
      const value = m.PI - ll['L1-S1'];
      return round1(value);
    }
    case 'L1PA': return round1(m.L1PA);
    case 'LL L2-S1': return round1(ll?.['L2-S1']);
    case 'LL L3-S1': return round1(ll?.['L3-S1']);
    case 'LL L4-S1': return round1(ll?.['L4-S1']);
    case 'LL L5-S1': return round1(ll?.['L5-S1']);
    default: return '';
  }
}

function escapeField(value) {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(studies) {
  // Demo rows are never written: the option that once included them was wired to no dialog,
  // and no installer ships demos, so the Source column that marked them is gone with it
  // (2026-09-07).
  const rows = studies.filter((study) => study.source !== 'demo');

  // Every clinical key present on the exported rows, KNOWN_FIELDS order then custom -- NOT the
  // session's visible field list. A column hidden in the drawer for the session used to vanish
  // from the file with nothing in the file to say so (roadmap item 1); now the file carries every
  // stored value, and a reader can tell an absent value from a hidden column because there are
  // no hidden columns. Computed over `rows`, after the demo filter, so an excluded demo study
  // cannot add a column.
  const fields = clinicalFieldNames(rows);

  const citation = [
    '# Spine Contour export',
    '# Created by Cody Woodhouse, MD; Michael Jayasuriya, BS.',
    '# Investigational software. NOT FOR CLINICAL USE.',
  ];
  // Subject, Timepoint and Film date sit after View (pre-op/post-op spec §11.1): the identity a
  // paired analysis groups on, then the acquisition date. Absent values are empty, never 0 or —.
  const header = ['Study ID', 'View', 'Subject', 'Timepoint', 'Film date', ...MEASUREMENT_COLUMNS, ...fields];

  const lines = [...citation, header.map(escapeField).join(',')];
  for (const study of rows) {
    const cells = [
      study.id,
      study.view,
      study.subjectId ?? '',
      study.timepoint ?? '',
      study.filmDate ?? '',
      ...MEASUREMENT_COLUMNS.map((column) => measurementValue(study, column)),
      ...fields.map((field) => (study.clinical && study.clinical[field] != null ? study.clinical[field] : '')),
    ];
    lines.push(cells.map(escapeField).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

// The paired (wide) file (pre-op/post-op spec §11.2) from what data/pairing.js's pairStudies
// returns; this function only writes text. Layout B, measurement-major: Subject; `<label> study`,
// `<label> view`, `<label> film date` per visit (Pre-op first); then per measurement column
// `<M> Pre-op` followed by `<M> <label>`, `Delta <M> <label>` per later visit; then `<F> <label>`
// per clinical key present on the written films. Headers use the stored label and ASCII `Delta`,
// following `PI-LL Mismatch` for the on-screen `PI–LL`, so Excel and R read them without a
// byte-order mark. Demo rows never reach this function: pairStudies drops them.
export function toPairedCsv(pairing) {
  const { visits, subjects } = pairing;
  const labels = [PRE_OP, ...visits];
  const written = subjects.flatMap((row) => [...row.films.values()]);
  const fields = clinicalFieldNames(written);

  const citation = [
    '# Spine Contour export',
    '# Created by Cody Woodhouse, MD; Michael Jayasuriya, BS.',
    '# Investigational software. NOT FOR CLINICAL USE.',
  ];
  const header = [
    'Subject',
    ...labels.map((label) => `${label} study`),
    ...labels.map((label) => `${label} view`),
    ...labels.map((label) => `${label} film date`),
    ...MEASUREMENT_COLUMNS.flatMap((column) => [
      `${column} ${PRE_OP}`,
      ...visits.flatMap((label) => [`${column} ${label}`, `Delta ${column} ${label}`]),
    ]),
    ...fields.flatMap((field) => labels.map((label) => `${field} ${label}`)),
  ];

  const lines = [...citation, header.map(escapeField).join(',')];
  for (const row of subjects) {
    const film = (label) => row.films.get(label) ?? null;
    const pre = film(PRE_OP);
    const cells = [
      row.subject,
      ...labels.map((label) => film(label)?.id ?? ''),
      ...labels.map((label) => film(label)?.view ?? ''),
      ...labels.map((label) => film(label)?.filmDate ?? ''),
      ...MEASUREMENT_COLUMNS.flatMap((column) => {
        const before = pre ? measurementValue(pre, column) : '';
        return [
          before,
          ...visits.flatMap((label) => {
            const later = film(label);
            const value = later ? measurementValue(later, column) : '';
            return [value, delta1(before, value)];
          }),
        ];
      }),
      ...fields.flatMap((field) => labels.map((label) => {
        const study = film(label);
        return study && study.clinical && study.clinical[field] != null ? study.clinical[field] : '';
      })),
    ];
    lines.push(cells.map(escapeField).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------
// CSV import: parse, auto-map, and the study_id join (plan 06). All pure.
// ---------------------------------------------------------------------------

/** @typedef {{src: string, dest: string|null}} Mapping */

export const KNOWN_FIELDS = ['Age', 'Sex', 'BMI', 'Diagnosis', 'ODI',
  'Treatment plan', 'Surgical history', 'Follow-up', 'Notes'];

// Hand-written RFC 4180 reader. Beyond quoted fields, embedded commas/newlines, doubled
// quotes and CRLF it also: strips a leading UTF-8 BOM (Excel "CSV UTF-8"); opens quoted mode
// ONLY while the field so far is empty or whitespace (that leading padding is discarded), so a
// quote after any other text — a stray inch mark in free text (5'11") — is a literal character
// rather than the start of a quoted run that would swallow every following row;
// ends a line on a lone CR; drops blank and whitespace-only lines; drops the extra cells of
// a row longer than the header and fills '' for a shorter one; and keeps the FIRST column
// when two headers share a name (the same first-wins rule autoMap applies to known fields).
// Values are not trimmed here — joinClinical trims what it copies.
export function parse(text) {
  const src = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = src.length;

  function pushField() {
    row.push(field);
    field = '';
  }

  function pushRow() {
    pushField();
    rows.push(row);
    row = [];
  }

  while (i < len) {
    const char = src[i];

    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field.trim() === '') {
      // Field start, or only whitespace so far: `1, "Doe, Jane"` is the quoted form Excel and
      // hand-edited CSVs both produce. The padding before the quote is not data, so drop it.
      field = '';
      inQuotes = true;
      i += 1;
      continue;
    }

    if (char === ',') {
      pushField();
      i += 1;
      continue;
    }

    if (char === '\r' && src[i + 1] === '\n') {
      pushRow();
      i += 2;
      continue;
    }

    if (char === '\n' || char === '\r') {
      pushRow();
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  // A blank or whitespace-only line parses to a single field with no text — drop those rather
  // than letting one become the header row or a data row. (This also drops a legitimate
  // single-column data row whose only value is whitespace; acceptable for this tool.)
  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0];
  // First column wins for a duplicated header name. Indexed by NAME, not by `h in obj`: `{}`
  // inherits Object.prototype, so `'toString' in obj` is already true before anything is
  // written and a column headed `constructor`/`toString`/`valueOf`/`hasOwnProperty` would be
  // silently dropped from every row while `headers` still advertised it.
  const firstIndex = new Map();
  headers.forEach((h, idx) => { if (!firstIndex.has(h)) firstIndex.set(h, idx); });
  const dataRows = nonEmpty.slice(1).map((r) => {
    const obj = {};
    for (const [h, idx] of firstIndex) obj[h] = r[idx] !== undefined ? r[idx] : '';
    return obj;
  });

  return { headers, rows: dataRows };
}

function normalizeFieldName(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// A known field matches a header when the field's normalised name equals, or is a prefix of,
// the header's normalised name: odi_base → ODI, age_yrs → Age, "Diagnosis date" → Diagnosis.
// It is a convenience, not an authority — no synonym table (dx_text and tx_plan stay
// unmapped) and no word boundaries (agent → Age; the user corrects it in the mapping chip).
// Each known field is claimed by at most one header; the first matching header wins and any
// later match comes back unmapped, so one clinical value is never fed by two columns.
export function autoMap(headers) {
  const known = KNOWN_FIELDS.map((field) => ({ field, key: normalizeFieldName(field) }));
  const claimed = new Set();
  // A structural header (subject_id, timepoint, film_date, view -- pre-op/post-op spec §8.2) is
  // read by the load itself and is never a clinical field, whatever a known field's prefix might
  // otherwise match.
  const reserved = new Set(Object.values(findStructuralHeaders(headers)).filter((header) => header !== null));
  return headers.map((src) => {
    if (reserved.has(src)) return { src, dest: null };
    const key = normalizeFieldName(src);
    if (key === '') return { src, dest: null };
    const match = known.find((f) => key === f.key || key.startsWith(f.key));
    if (!match || claimed.has(match.field)) return { src, dest: null };
    claimed.add(match.field);
    return { src, dest: match.field };
  });
}

// Basename (either separator) without its last extension: 'a.b.dcm' → 'a.b', 'noext' → 'noext'.
// A leading dot is not an extension ('.hidden' → '.hidden').
export function fileStem(name) {
  const base = String(name).split(/[\\/]/).pop();
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

// The join column is whichever header normalises to 'studyid' (study_id, Study ID, studyId…).
// It is found independently of autoMap: study_id is the join key, never a clinical field.
export function findJoinHeader(headers) {
  const found = headers.find((h) => normalizeFieldName(h) === 'studyid');
  return found === undefined ? null : found;
}

// The four structural columns (pre-op/post-op spec §8.2), recognised the way study_id is -- by
// normalised header -- and never offered as clinical fields. The first header naming each field
// wins; a second `subject` column is an ordinary (unmapped) chip. A bare `date` column is
// deliberately not recognised: in a clinical sheet it is as likely the surgery date.
const STRUCTURAL_KEYS = {
  subjectId: ['subjectid', 'subject'],
  timepoint: ['timepoint', 'visit'],
  filmDate: ['studydate', 'filmdate'],
  view: ['view', 'position'],
};

// What the mapping card writes beside a structural header.
export const STRUCTURAL_LABELS = Object.freeze({ subjectId: 'Subject', timepoint: 'Timepoint', filmDate: 'Film date', view: 'View' });

// → {subjectId, timepoint, filmDate, view}: the header that supplies each field, or null.
export function findStructuralHeaders(headers) {
  const found = { subjectId: null, timepoint: null, filmDate: null, view: null };
  for (const header of headers ?? []) {
    const key = normalizeFieldName(header);
    for (const [field, keys] of Object.entries(STRUCTURAL_KEYS)) {
      if (found[field] === null && keys.includes(key)) found[field] = header;
    }
  }
  return found;
}

// The structural field `header` supplies among `headers`, or null.
export function structuralField(header, headers) {
  const found = findStructuralHeaders(headers);
  return Object.keys(found).find((field) => found[field] === header) ?? null;
}

// The structural values one CSV row supplies (§8.2): subject as typed after trimming; the view
// normalised through §7.3 when it names a known position (`flexion` → Flexion lateral) and
// otherwise as typed; the timepoint normalised through §7.2 when it names a known label
// (`preop` → Pre-op, `6 weeks` → 6 wk) and otherwise as typed; the film date as YYYY-MM-DD
// when it parses.
// `badDate` says the row carried a date the parser rejected -- the text is stored nowhere and
// the load counts it (§8.4).
export function structuralFromRow(row, structural) {
  const read = (header) => (header === null || header === undefined ? '' : String(row?.[header] ?? '').trim());
  const subject = read(structural?.subjectId);
  const timepoint = read(structural?.timepoint);
  const date = read(structural?.filmDate);
  const view = read(structural?.view);
  const filmDate = date === '' ? null : parseFilmDate(date);
  return {
    subjectId: subject === '' ? null : subject,
    timepoint: timepoint === '' ? null : (normaliseTimepoint(timepoint) ?? timepoint),
    filmDate,
    view: view === '' ? null : (normaliseView(view) ?? view),
    badDate: date !== '' && filmDate === null,
  };
}

// Joins CSV rows to films on the film's filename stem, case-insensitively. A film has no id
// before it is loaded, so its filename is the only identity a row can name. Per row, in
// order: a blank study_id is unmatched; a study_id already seen is a duplicate (the first
// row wins); a stem no film carries is unmatched; a stem two or more films carry is
// ambiguous and attaches to none (a patient's data is never attached to an arbitrary film);
// otherwise the row is matched and every mapping with a dest copies row[src], trimmed,
// skipping empty values so absent data stays absent. byFile is keyed by the exact string
// given in `files`, so the caller reads it back with the same paths it passed in.
// rowByFile holds the matched RAW row under the same key, for the structural columns the load
// reads itself (spec §8.2); the mapping never copies those.
export function joinClinical({ files, headers, rows, mapping }) {
  const joinHeader = findJoinHeader(headers);
  if (joinHeader === null) {
    return { joinHeader: null, byFile: new Map(), rowByFile: new Map(), matched: 0, unmatched: rows.length, duplicates: 0, ambiguous: 0 };
  }

  const filmsByStem = new Map();
  for (const filePath of files) {
    const stem = fileStem(filePath).toLowerCase();
    const list = filmsByStem.get(stem);
    if (list) list.push(filePath);
    else filmsByStem.set(stem, [filePath]);
  }

  const mapped = mapping.filter((m) => m.dest);
  const seen = new Set();
  const byFile = new Map();
  const rowByFile = new Map();
  let matched = 0;
  let unmatched = 0;
  let duplicates = 0;
  let ambiguous = 0;

  for (const row of rows) {
    const key = String(row[joinHeader] ?? '').trim().toLowerCase();
    if (key === '') {
      unmatched += 1;
      continue;
    }
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    const films = filmsByStem.get(key);
    if (!films) {
      unmatched += 1;
      continue;
    }
    if (films.length > 1) {
      ambiguous += 1;
      continue;
    }
    matched += 1;
    const clinical = {};
    for (const m of mapped) {
      const value = String(row[m.src] ?? '').trim();
      if (value !== '') clinical[m.dest] = value;
    }
    byFile.set(films[0], clinical);
    rowByFile.set(films[0], row);
  }

  return { joinHeader, byFile, rowByFile, matched, unmatched, duplicates, ambiguous };
}

// The union of clinical field names over the studies: KNOWN_FIELDS order first, then custom
// names in first-seen order. Bootstrap seeds state.fields with it so persisted values are
// visible after a restart. A study without a clinical object contributes nothing.
export function clinicalFieldNames(studies) {
  const present = new Set();
  for (const study of studies) {
    const clinical = study && study.clinical;
    if (!clinical || typeof clinical !== 'object') continue;
    for (const name of Object.keys(clinical)) present.add(name);
  }
  const known = KNOWN_FIELDS.filter((name) => present.has(name));
  const custom = [...present].filter((name) => !KNOWN_FIELDS.includes(name));
  return [...known, ...custom];
}
