/**
 * Workspace screen (spec 9.3). Three step cards -- image folder, optional clinical CSV, column
 * mapping -- and one Load workspace button that turns every scanned film into an unsegmented
 * real Study in a single setState. render(state) returns the screen's root; because
 * router.js remounts this host only on screen/ack, every handler refreshes the screen itself
 * after its setState. Persistence is the store subscriber in renderer/main.js: nothing here
 * calls saveStudies.
 */

import { el, mount } from '../dom.js';
import { getState, setState } from '../store.js';
import { chooseFolder, scanFolder, chooseCsv, readCsv } from '../api.js';
import {
  parse, autoMap, KNOWN_FIELDS, findJoinHeader, joinClinical, clinicalFieldNames,
  findStructuralHeaders, structuralFromRow, structuralField, STRUCTURAL_LABELS,
} from '../data/csv.js';
import { folderRows, folderKey, seedFields, STUDY_FIELDS } from '../data/seeding.js';
import { DEFAULT_VIEW, TIMEPOINT_SUGGESTIONS, VIEW_SUGGESTIONS } from '../data/timepoints.js';
import { nextId } from '../data/persistence.js';
import { newStudy } from './studies.js';
import { showToast } from '../components/toast.js';

// Icon wells, lifted from the design (design-reference/template.html) the way sidebar.js and
// landing.js do. FOLDER_SVG is the sidebar's Workspace icon path at the card-well size.
const FOLDER_SVG = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7 C3.5 5.6 4.6 5 5.5 5 H9.5 L11.5 7.5 H18.5 C19.6 7.5 20.5 8.4 20.5 9.5 V17 C20.5 18.1 19.6 19 18.5 19 H5.5 C4.4 19 3.5 18.1 3.5 17 Z"></path></svg>';
const CSV_SVG = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5 H14 L18.5 8 V20.5 H6 Z"></path><path d="M13.5 3.5 V8.5 H18.5"></path><path d="M9 13 H15.5"></path><path d="M9 16.5 H13"></path></svg>';
const ARROW_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12 H18"></path><path d="M12.5 6 L18.5 12 L12.5 18"></path></svg>';

// The last folder scan's skipped count, keyed to the folder it describes. Module scope, not
// a render() local: the router re-runs render() on every navigation while wsFolder/wsFiles
// survive in the store, and a count that came back as 0 would be a fabricated number. The
// clause renders only while lastScan.folder === state.wsFolder.
let lastScan = null; // { folder, skipped }

// Pure: the studies list a Load would commit, plus the counts the toast reports. Known films
// (same filePath, case-insensitively -- Windows paths) are never added twice; when the CSV has
// a row for a known film, the keys that record is MISSING (absent or empty) are filled onto a
// NEW object -- an existing value is never overwritten, and a record with nothing to fill is
// kept by reference and not counted. New records are front-inserted in scan order with
// consecutive ids; nextId is read once.
//
// The four study fields (pre-op/post-op spec §8.3) follow the same fill-blanks rule: seedFields
// hands back the stored value where there is one, so a change here is by construction a blank
// being filled. `seeding` counts, over the scanned films, how many had something read from the
// folder layout or the film's own name, how many took something from the CSV, how many end the
// load with no subject or no timepoint, and how many CSV dates could not be read (§8.4).
// `clinicalUpdated` counts only the records that had a clinical key filled; `updated` counts any
// blank filled, a study field included.
export function loadWorkspaceStudies(state) {
  const join = state.wsCsv
    ? joinClinical({ files: state.wsFiles, headers: state.wsCsvHeaders, rows: state.wsCsvRows, mapping: state.wsMapping })
    : null;
  const structural = state.wsCsv ? findStructuralHeaders(state.wsCsvHeaders) : null;
  const root = state.wsFolder ?? null;
  // The folder table the card showed (§8.5). A state seeded without one -- the smoke harness, a
  // unit test -- falls back to the rows the scan would have built, which is exactly what the card
  // shows before the user touches it.
  const rows = Array.isArray(state.wsFolderRows) && state.wsFolderRows.length > 0
    ? state.wsFolderRows
    : folderRows(state.wsFiles, root);
  const rowByFolder = new Map(rows.map((row) => [row.folder, row]));

  const knownByPath = new Map();
  for (const study of state.studies) {
    if (study.source === 'real' && typeof study.filePath === 'string' && study.filePath) {
      knownByPath.set(study.filePath.toLowerCase(), study);
    }
  }

  let next = Number(nextId(state.studies).slice(3));
  const added = [];
  const replacements = new Map(); // study id -> the updated record
  let known = 0;
  let updated = 0;
  let clinicalUpdated = 0;
  const seeding = { fromFolders: 0, fromCsv: 0, noSubject: 0, noTimepoint: 0, badDates: 0 };

  for (const filePath of state.wsFiles) {
    const existing = knownByPath.get(filePath.toLowerCase()) ?? null;
    const csvRow = join ? (join.rowByFile.get(filePath) ?? null) : null;
    const csv = csvRow ? structuralFromRow(csvRow, structural) : null;
    if (csv && csv.badDate) seeding.badDates += 1;
    const seeded = seedFields({ filePath, root, existing, csv, row: rowByFolder.get(folderKey(filePath, root)) ?? null });
    countSeeding(seeding, seeded);

    if (existing) {
      known += 1;
      const fromCsv = join ? join.byFile.get(filePath) : undefined;
      // Load FILLS BLANKS; it never overwrites. A value already on the record was either
      // typed in the drawer or imported deliberately, and a second Load -- or an overlapping
      // folder scanned with a stale CSV -- must not silently replace it. Only the keys whose
      // current value is absent or empty are taken; if none is, the record is kept BY
      // REFERENCE and not counted, so `updated` never reports work that did not happen.
      // The explicit overwrite path is `Import from CSV` in the drawer.
      const fills = {};
      for (const [key, value] of Object.entries(fromCsv ?? {})) {
        const current = existing.clinical ? existing.clinical[key] : undefined;
        if (current == null || current === '') fills[key] = value;
      }
      const studyFills = {};
      for (const field of STUDY_FIELDS) {
        const current = existing[field];
        if ((current == null || current === '') && seeded.fields[field] != null) studyFills[field] = seeded.fields[field];
      }
      const record = Object.keys(fills).length > 0 || Object.keys(studyFills).length > 0
        ? { ...existing, ...studyFills, clinical: { ...existing.clinical, ...fills } }
        : existing;
      if (record !== existing) {
        replacements.set(existing.id, record);
        updated += 1;
        // Counted apart from `updated`: the toast's "no blank clinical fields to fill" clause is
        // about clinical data, and a subject filled from a folder name must not make it claim a
        // clinical write (the first Load over a library that predates the study fields fills
        // subjects and nothing else).
        if (Object.keys(fills).length > 0) clinicalUpdated += 1;
      }
      countMissing(seeding, record);
      continue;
    }
    const id = `SP-${String(next++).padStart(4, '0')}`;
    const record = {
      // state.wsFolder is the ROOT the user picked. The scan recurses, so a film below it keeps
      // its own containing folder in filePath; the table shows both, and the pair is what tells
      // two same-named films under different workspaces apart.
      ...newStudy({ id, fileName: filePath.split(/[\\/]/).pop(), filePath, workspaceFolder: root }),
      // The seeded subject, timepoint, film date and view (§8.3). view is never null here: the
      // folder row always holds one, and it was on screen before Load.
      ...seeded.fields,
      // Spread, never the join's own object: the store never holds a reference the join still owns.
      clinical: { ...(join?.byFile.get(filePath) ?? {}) },
    };
    added.push(record);
    countMissing(seeding, record);
  }

  const existingWithUpdates = state.studies.map((study) => replacements.get(study.id) ?? study);
  return { studies: [...added, ...existingWithUpdates], added: added.length, known, updated, clinicalUpdated, join, seeding };
}

// "read from folder or file names" counts a film when any field came from a folder segment, the
// stem, or a folder-table row holding something other than the default view; "set from the CSV"
// when any came from the row. A stored value counts for neither: nothing was read for it.
function countSeeding(seeding, seeded) {
  const sources = seeded.sources;
  const inferred = STUDY_FIELDS.some((field) => sources[field] === 'folder' || sources[field] === 'stem')
    || sources.timepoint === 'row'
    || (sources.view === 'row' && seeded.fields.view !== DEFAULT_VIEW);
  if (inferred) seeding.fromFolders += 1;
  if (STUDY_FIELDS.some((field) => sources[field] === 'csv')) seeding.fromCsv += 1;
}

function countMissing(seeding, record) {
  if (record.subjectId == null || record.subjectId === '') seeding.noSubject += 1;
  if (record.timepoint == null || record.timepoint === '') seeding.noTimepoint += 1;
}

// The drawer's columns after a load. `fields` is what the session already shows, in its
// existing order; every clinical key the loaded studies carry and it does not is appended.
// Without this the values the load just wrote are on the records and on disk while the drawer
// reads NO FIELDS and Export CSV writes no clinical columns, until a relaunch -- bootstrap
// seeds the same list from the same function (renderer/main.js), so this is the restart fix
// applied to the load path. `fields` stays session state; nothing new is persisted.
export function workspaceLoadedFields(fields, studies) {
  const loaded = clinicalFieldNames(studies);
  return [...fields, ...loaded.filter((name) => !fields.includes(name))];
}

function films(n) {
  return `${n} film${n === 1 ? '' : 's'}`;
}

// §8.4: each clause only when its count is non-zero. The rejected dates are stored nowhere; the
// film's empty Film date cell on the Parameters grid is how the user finds which.
function seedingClauses(seeding) {
  if (!seeding) return '';
  const { fromFolders = 0, fromCsv = 0, noSubject = 0, noTimepoint = 0, badDates = 0 } = seeding;
  return (fromFolders ? ` · subject, timepoint or view read from folder or file names for ${films(fromFolders)}` : '')
    + (fromCsv ? ` · subject, timepoint, film date or view set from the CSV for ${films(fromCsv)}` : '')
    + (noSubject ? ` · ${films(noSubject)} ${noSubject === 1 ? 'has' : 'have'} no subject` : '')
    + (noTimepoint ? ` · ${films(noTimepoint)} ${noTimepoint === 1 ? 'has' : 'have'} no timepoint` : '')
    + (badDates ? ` · ${badDates} film date${badDates === 1 ? '' : 's'} could not be read` : '');
}

// The post-load toast. Every clause describes something the load actually did. `updated` counts
// records that had a blank filled -- a clinical key or one of the four study fields.
// `clinicalUpdated` defaults to `updated` for a caller that does not separate them.
export function workspaceLoadedMessage({ added, known, updated, join, mapping, seeding = null, clinicalUpdated = updated }) {
  return `Workspace loaded — ${added} ${added === 1 ? 'study' : 'studies'} added`
    + (known ? ` · ${known} already in the library` : '')
    + (updated ? ` (blank fields filled for ${updated})` : '')
    + (join
      ? (join.joinHeader === null
        ? ` · CSV has no study_id column — ${join.unmatched} row${join.unmatched === 1 ? '' : 's'} not linked`
        : (mapping.every((m) => !m.dest)
          ? ' · no columns mapped'
          // Nothing added and no clinical key filled, with rows that did match: the load wrote no
          // clinical data at all -- a subject or view filled from a folder name does not change
          // that, which is why the gate is `clinicalUpdated`, not `updated`. That is the
          // correction workflow -- fix a wrong Age in the CSV, re-pick it, press Load -- and Load
          // fills only BLANKS, so "clinical data linked" would describe a write that did not
          // happen. Say what happened instead, and name the control that does overwrite.
          : (added === 0 && clinicalUpdated === 0 && join.matched > 0
            ? ` · CSV matched ${join.matched} row${join.matched === 1 ? '' : 's'}; no blank clinical fields to fill (use Import from CSV to replace existing values)`
            : ` · clinical data linked (${join.matched} matched`
              + (join.unmatched ? `, ${join.unmatched} unmatched` : '')
              + (join.duplicates ? `, ${join.duplicates} duplicate study_id` : '')
              + (join.ambiguous ? `, ${join.ambiguous} ambiguous filename` : '')
              + ')')))
      : '')
    + seedingClauses(seeding);
}

export function render(state) {
  const inner = el('div', { class: 'workspace-page-inner' });
  const root = el('main', { class: 'workspace-page' }, inner);

  // SCREEN_KEYS carries no ws* key, so this screen rebuilds itself after each of its own
  // setState calls. Every caller is a DOM event handler, never a store subscriber. The rebuild
  // replaces every node, which drops keyboard focus to <body>; a control carrying a data-ws-key
  // gets focus back by that key (the Parameters panel's data-param-key pattern), so changing
  // one folder row's select does not strand a keyboard user on the page body.
  function refresh(live = getState()) {
    const active = document.activeElement;
    const focusKey = root.contains(active) ? active.getAttribute('data-ws-key') : null;
    mount(inner, buildScreen(live));
    if (focusKey !== null) {
      for (const candidate of inner.querySelectorAll('[data-ws-key]')) {
        if (candidate.getAttribute('data-ws-key') === focusKey) { candidate.focus(); break; }
      }
    }
  }

  async function onChooseFolder() {
    try {
      const folder = await chooseFolder();
      if (!folder) return;
      const { files, skipped } = await scanFolder(folder);
      lastScan = { folder, skipped };
      // The folder table (spec §8.5) is rebuilt by every scan: the rows are what Load applies.
      setState({ wsFolder: folder, wsFiles: files, wsFolderRows: folderRows(files, folder) });
      refresh();
    } catch (error) {
      showToast(`Could not read folder: ${error.message}`);
    }
  }

  async function onChooseCsv() {
    try {
      const csvPath = await chooseCsv();
      if (!csvPath) return;
      const text = await readCsv(csvPath);
      const { headers, rows } = parse(text);
      // A fresh file means fresh defaults: manual overrides never leak across loads.
      setState({ wsCsv: csvPath, wsCsvHeaders: headers, wsCsvRows: rows, wsMapping: autoMap(headers) });
      refresh();
      if (!findJoinHeader(headers)) {
        showToast('This CSV has no study_id column — rows cannot be linked to films.');
      }
      if (new Set(headers).size !== headers.length || headers.includes('')) {
        showToast('The CSV has duplicate or blank column names; those columns cannot be mapped reliably.');
      }
    } catch (error) {
      showToast(`Could not read CSV: ${error.message}`);
    }
  }

  // One new-array setState; the subscribed saver persists it. screen: 'studies' is spec 9.3
  // ("then navigates to Studies"); openId is left alone -- no study is opened. `fields` goes in
  // the SAME setState as the studies it describes: the drawer renders its columns from
  // `fields`, so a load that wrote clinical values without seeding them shows NO FIELDS over
  // values that are already on the record and on disk.
  function onLoadWorkspace() {
    const live = getState();
    if (!live.wsFolder) return;
    const result = loadWorkspaceStudies(live);
    setState({
      studies: result.studies,
      fields: workspaceLoadedFields(live.fields, result.studies),
      screen: 'studies',
    });
    showToast(workspaceLoadedMessage({ ...result, mapping: live.wsMapping }));
  }

  // Folder table edits write only wsFolderRows, replaced wholesale; Load is the only writer of
  // studies. Both refresh so the selects re-render from the store (and keep focus by key).
  function setFolderRow(folder, patch) {
    setState((s) => ({ wsFolderRows: s.wsFolderRows.map((row) => (row.folder === folder ? { ...row, ...patch } : row)) }));
    refresh();
  }

  function setAllFolderRows(patch) {
    setState((s) => ({ wsFolderRows: s.wsFolderRows.map((row) => ({ ...row, ...patch })) }));
    refresh();
  }

  // A row's dropdown: `none` as the first entry when given (the timepoint column), then the choices.
  function rowSelect({ key, label, value, choices, none, onChange }) {
    const select = el('select', { class: 'workspace-folder-select', 'aria-label': label, 'data-ws-key': key, onChange });
    if (none !== null) select.append(el('option', { value: '' }, none));
    for (const choice of choices) select.append(el('option', { value: choice }, choice));
    select.value = value ?? '';
    return select;
  }

  // The column-header control that sets every row at once (§8.5): how a layout with one folder
  // per subject is set in one action, and the whole-batch selector for a root with no subfolders.
  // It rests on a `Set all…` placeholder and returns to it after the rebuild.
  function setAllSelect({ key, label, choices, none, onChange }) {
    const select = el('select', {
      class: 'workspace-folder-select workspace-folder-all', 'aria-label': label, 'data-ws-key': key,
      onChange: (event) => { if (event.target.value !== '__all__') onChange(event.target.value); },
    });
    select.append(el('option', { value: '__all__' }, 'Set all…'));
    if (none !== null) select.append(el('option', { value: '' }, none));
    for (const choice of choices) select.append(el('option', { value: choice }, choice));
    select.value = '__all__';
    return select;
  }

  // §8.5: one row per folder holding films, showing what Load will assign to the films directly
  // in it. Every value is on screen before Load -- that is what makes `Standing lateral` on a
  // loaded film an honest label rather than a hard-coded one. The timepoint choices are the
  // drawer's suggestions plus any label a folder name inferred that the list lacks (`3 mo`).
  function buildFolderTable(live) {
    const rows = live.wsFolderRows ?? [];
    if (rows.length === 0) return null;
    const timepoints = [...TIMEPOINT_SUGGESTIONS];
    for (const row of rows) if (row.timepoint && !timepoints.includes(row.timepoint)) timepoints.push(row.timepoint);
    const views = [...VIEW_SUGGESTIONS];
    const head = el('tr', {},
      el('th', { scope: 'col' }, 'FOLDER'),
      el('th', { scope: 'col', class: 'workspace-folders-num' }, 'FILMS'),
      el('th', { scope: 'col' }, 'TIMEPOINT', setAllSelect({
        key: 'all-timepoint', label: 'Set the timepoint of every folder', choices: timepoints, none: 'none',
        onChange: (value) => setAllFolderRows({ timepoint: value === '' ? null : value }),
      })),
      el('th', { scope: 'col' }, 'VIEW', setAllSelect({
        key: 'all-view', label: 'Set the view of every folder', choices: views, none: null,
        onChange: (value) => setAllFolderRows({ view: value }),
      })));
    const body = rows.map((row) => el('tr', { 'data-ws-folder': row.folder },
      el('td', { class: 'workspace-folders-name', title: row.folder }, row.folder),
      el('td', { class: 'workspace-folders-num' }, String(row.count)),
      el('td', {}, rowSelect({
        key: `tp:${row.folder}`, label: `Timepoint for ${row.folder}`, value: row.timepoint, choices: timepoints, none: 'none',
        onChange: (event) => setFolderRow(row.folder, { timepoint: event.target.value === '' ? null : event.target.value }),
      })),
      el('td', {}, rowSelect({
        key: `view:${row.folder}`, label: `View for ${row.folder}`, value: row.view, choices: views, none: null,
        onChange: (event) => setFolderRow(row.folder, { view: event.target.value }),
      }))));
    return el('div', { class: 'workspace-folders-wrap' },
      el('div', { class: 'workspace-folders-scroll' },
        el('table', { class: 'workspace-folders', 'data-ws-key': 'folders' },
          el('thead', {}, head),
          el('tbody', {}, ...body))),
      el('div', { class: 'workspace-card-note workspace-folders-note' },
        'What Load will assign to the films in each folder, unless a film\u2019s own name or the CSV says otherwise. Films already in the library keep their stored values.'));
  }

  function buildFolderCard(live) {
    const hasFolder = Boolean(live.wsFolder);
    const n = live.wsFiles.length;
    let meta = 'DICOM, PNG, JPG · subfolders included';
    if (hasFolder) {
      meta = `${n} radiograph${n === 1 ? '' : 's'} found`;
      if (lastScan && lastScan.folder === live.wsFolder) {
        // All three of scan-folder.js's causes are named. It increments the same counter for a
        // link it never follows, a SUBFOLDER IT COULD NOT READ, and an unsupported file, so a
        // legend naming only two of them tells a user whose permission-denied subtree holds
        // forty radiographs that one unsupported file was skipped.
        meta += ` · ${lastScan.skipped} skipped (unsupported files, links, or folders that could not be read)`;
      }
    }
    return el('div', { class: `card workspace-card workspace-card-folder${hasFolder ? ' workspace-card-set' : ''}` },
      el('div', { class: 'workspace-card-row' },
        el('div', { class: 'workspace-card-icon', 'aria-hidden': 'true', innerHTML: FOLDER_SVG }),
        el('div', { class: 'workspace-card-text' },
          el('div', { class: 'eyebrow' }, '01 — IMAGE FOLDER'),
          el('div', { class: 'workspace-card-value' }, hasFolder ? live.wsFolder : 'No folder selected'),
          el('div', { class: 'workspace-card-meta' }, meta)),
        el('button', { type: 'button', class: 'btn btn-small', 'data-ws-key': 'choose-folder', onClick: onChooseFolder },
          hasFolder ? 'Change…' : 'Choose folder…')),
      hasFolder ? buildFolderTable(live) : null);
  }

  function buildCsvCard(live) {
    const hasCsv = Boolean(live.wsCsv);
    let meta = 'One row per study, with a study_id column';
    if (hasCsv) {
      const rows = live.wsCsvRows.length;
      const cols = live.wsCsvHeaders.length;
      const joinHeader = findJoinHeader(live.wsCsvHeaders);
      meta = `${rows} row${rows === 1 ? '' : 's'} · ${cols} column${cols === 1 ? '' : 's'} · `
        + (joinHeader ? `matched on ${joinHeader}` : 'no study_id column — rows cannot be matched');
    }
    return el('div', { class: `card workspace-card${hasCsv ? ' workspace-card-set' : ''}` },
      el('div', { class: 'workspace-card-icon', 'aria-hidden': 'true', innerHTML: CSV_SVG }),
      el('div', { class: 'workspace-card-text' },
        el('div', { class: 'eyebrow' }, '02 — CLINICAL DATA CSV · OPTIONAL'),
        el('div', { class: 'workspace-card-value' }, hasCsv ? live.wsCsv : 'No file selected'),
        el('div', { class: 'workspace-card-meta' }, meta)),
      el('button', { type: 'button', class: 'btn btn-small', onClick: onChooseCsv },
        hasCsv ? 'Change…' : 'Choose CSV…'));
  }

  // Each chip's destination is a <select>, not static text. autoMap is a convenience, not an
  // authority: it cannot know that `dx_text` means Diagnosis without a synonym table that
  // would guess wrong elsewhere, so the user gets the final say. Read state.wsMapping (not
  // autoMap) so manual overrides survive a re-render.
  function buildMappingCard(live) {
    const mapping = live.wsMapping;
    const joinHeader = findJoinHeader(live.wsCsvHeaders);
    const chips = mapping.map((m, index) => {
      // The join key and the four structural columns (spec §8.2) are read by the load itself: a
      // fixed destination and no select, so a column the load consumes never reads `Unmapped`.
      const field = structuralField(m.src, live.wsCsvHeaders);
      const fixed = m.src === joinHeader ? 'Join key' : (field ? STRUCTURAL_LABELS[field] : null);
      if (fixed !== null) {
        return el('div', { class: 'workspace-chip workspace-chip-fixed' },
          el('span', { class: 'workspace-chip-src' }, m.src),
          el('span', { class: 'workspace-chip-arrow' }, '→'),
          el('span', { class: 'workspace-chip-dest' }, fixed));
      }
      const select = el('select', {
        class: 'workspace-chip-select',
        'aria-label': `Map ${m.src}`,
        'data-ws-key': `map:${m.src}`,
        onChange: (event) => {
          const dest = event.target.value === '' ? null : event.target.value;
          setState((s) => ({
            wsMapping: s.wsMapping.map((row, i) => (i === index ? { ...row, dest } : row)),
          }));
          // Sibling selects drop or re-offer the field this chip just claimed or released,
          // and this chip's own mapped/unmapped styling changes; the change event has
          // already committed, and refresh() hands focus back by data-ws-key.
          refresh();
        },
      });
      select.append(el('option', { value: '' }, 'Unmapped'));
      for (const field of KNOWN_FIELDS) {
        // A field already claimed by another column is not offered twice.
        const takenElsewhere = mapping.some((other, i) => i !== index && other.dest === field);
        if (takenElsewhere && m.dest !== field) continue;
        select.append(el('option', { value: field }, field));
      }
      select.value = m.dest ?? '';
      return el('div', { class: `workspace-chip ${m.dest ? 'workspace-chip-mapped' : 'workspace-chip-unmapped'}` },
        el('span', { class: 'workspace-chip-src' }, m.src),
        el('span', { class: 'workspace-chip-arrow' }, '→'),
        select);
    });

    // Live preview of the join this mapping would make. Pure, no new state: the same call
    // onLoadWorkspace makes, against the same files, headers, rows and mapping.
    const join = joinClinical({ files: live.wsFiles, headers: live.wsCsvHeaders, rows: live.wsCsvRows, mapping });
    const rows = live.wsCsvRows.length;
    const preview = join.joinHeader === null
      ? 'This CSV has no study_id column, so no row can be linked.'
      : `${join.matched} of ${rows} rows match a film`
        + (join.unmatched ? ` · ${join.unmatched} unmatched` : '')
        + (join.duplicates ? ` · ${join.duplicates} duplicate study_id` : '')
        + (join.ambiguous ? ` · ${join.ambiguous} ambiguous filename` : '')
        + '. Rows that match no film are counted when the workspace loads and are not attached to any study.';

    return el('div', { class: 'card workspace-card workspace-card-stack' },
      el('div', { class: 'eyebrow' }, '03 — COLUMN MAPPING'),
      el('div', { class: 'workspace-chip-row' }, ...chips),
      el('div', { class: 'workspace-card-note' },
        'Rows are matched to films by ',
        el('span', { class: 'workspace-card-code' }, 'study_id'),
        '. ',
        preview));
  }

  // Returns a fragment so the heading, copy, cards and load row are direct children of
  // .workspace-page-inner (the stylesheet's margin-top rules are sibling rules); mount()
  // appends a fragment's children and clears them again on the next refresh.
  function buildScreen(live) {
    const cards = [buildFolderCard(live), buildCsvCard(live)];
    if (live.wsCsv) cards.push(buildMappingCard(live));
    const loadDisabled = !live.wsFolder;

    const fragment = document.createDocumentFragment();
    fragment.append(
      el('h1', { class: 'workspace-heading' }, 'Workspace'),
      el('div', { class: 'workspace-copy' },
        'Point SpineContour at a folder of radiographs and, optionally, a CSV of clinical data. Nothing is uploaded — files are read from disk on this workstation.'),
      el('div', { class: 'workspace-cards' }, ...cards),
      el('div', { class: 'workspace-load-row' },
        el('button', {
          type: 'button', class: 'btn btn-primary workspace-load',
          disabled: loadDisabled, // boolean: el() assigns node.disabled, and '' would coerce to false
          onClick: onLoadWorkspace,
        }, 'Load workspace', el('span', { class: 'btn-icon', innerHTML: ARROW_SVG })),
        el('div', { class: 'workspace-load-hint' },
          loadDisabled
            ? 'Choose an image folder to continue.'
            : 'New films are added to Studies as Processing. Open one and run segmentation from its Analysis screen.')),
    );
    return fragment;
  }

  refresh(state);
  return root;
}
