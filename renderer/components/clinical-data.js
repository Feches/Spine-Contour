/**
 * Clinical data drawer (spec 9.5). Mounted by screens/analysis.js into its
 * `section.clinical-data` host and driven from that screen's update() on every store
 * notification, exactly like components/measurements.js. Rows come from
 * visibleStudies(state) -- [open] in this plan; plan 07 swaps that one expression for the
 * open study plus the comparison study and nothing else here changes.
 *
 * Persistence: this module never imports saveStudies. A cell edit commits ONE new
 * `studies` array through setState and renderer/main.js's subscribed saver writes the
 * real-only list (architecture contract, Persistence). `fields` and `dataOpen` are session
 * state on the store; bootstrap seeds `fields` from the saved clinical keys (Task 6).
 */

import { el, clear } from '../dom.js';
import { getState, setState } from '../store.js';
import { showToast } from './toast.js';
import { KNOWN_FIELDS, joinClinical, fileStem, findStructuralHeaders, structuralFromRow } from '../data/csv.js';
import { studyName } from '../data/labels.js';
import { TIMEPOINT_SUGGESTIONS, VIEW_SUGGESTIONS, normaliseTimepoint, normaliseView } from '../data/timepoints.js';

// 12x12 chevron pointing UP (the drawer is open by default); .clinical-toggle-closed rotates
// it 180deg in CSS. Same construction as sidebar.js's CHEVRON_SVG.
const CHEVRON_UP_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14 L12 8 L18 14"></path></svg>';
// 11x11 upload arrow for the Import button (design-reference/template.html:582).
const UPLOAD_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15 V4"></path><path d="M7.5 8.5 L12 4 L16.5 8.5"></path><path d="M5 19.5 H19"></path></svg>';

const EMPTY_COPY = 'No clinical fields yet — add the fields you want above, or import from the CSV.';
const DEMO_TITLE = 'Demo studies are not saved';
const NO_CSV_TITLE = 'Load a CSV in the Workspace first';

// The Study group's five fixed columns (pre-op/post-op spec §9; Note added 2026-09-11), ahead of
// the clinical fields: top-level record fields, not clinical keys, so they cannot be hidden and
// never appear under ADD FIELD. Timepoint and View suggest from a datalist (user decision
// 2026-09-07: native suggestions, not chip buttons); Film date is a date input, whose value is
// already YYYY-MM-DD; Note is free text, read from the filename's trailing fields or typed here.
const STUDY_COLUMNS = Object.freeze([
  { field: 'subjectId', head: 'SUBJECT', title: 'Subject', type: 'text', list: null },
  { field: 'timepoint', head: 'TIMEPOINT', title: 'Timepoint', type: 'text', list: 'clinical-timepoints' },
  { field: 'filmDate', head: 'FILM DATE', title: 'Film date', type: 'date', list: null },
  { field: 'view', head: 'VIEW', title: 'View', type: 'text', list: 'clinical-views' },
  { field: 'note', head: 'NOTE', title: 'Note', type: 'text', list: null },
]);

export function fieldCountLabel(fieldCount, studyCount) {
  if (!fieldCount) return 'NO FIELDS';
  return `${fieldCount} FIELD${fieldCount === 1 ? '' : 'S'} · ${studyCount} STUD${studyCount === 1 ? 'Y' : 'IES'}`;
}

function openStudy(state) {
  return state.studies.find((s) => s.id === state.openId) ?? null;
}

// Which CSV row `Import from CSV` may write onto `study`, decided the way the Workspace load
// decides it. Pure, so it is unit-tested; the handler below does the toasting and the write.
//
// The join runs against the WHOLE scan, not this one film, because `films.length > 1` --
// joinClinical's ambiguity branch -- can never be taken by a one-film join, and a drawer that
// joins one film at a time will happily attach a row the Workspace deliberately attached to
// nothing. A film that is NOT part of the scan (added by the picker or a drop, or opened
// before any folder was chosen) keeps the one-film join it has always had: it genuinely is
// not in the workspace, so the scan has no opinion about it. Membership is by filePath,
// case-insensitively, the same rule loadWorkspaceStudies uses for "already in the library".
//
// → {ok: true, values, fields, badDate} | {ok: false, reason: 'no-csv'|'ambiguous'|'no-row', stem}
export function importRowFor(state, study) {
  const stem = fileStem(study.fileName);
  if (!state.wsCsv) return { ok: false, reason: 'no-csv', stem };

  const filePath = typeof study.filePath === 'string' && study.filePath !== '' ? study.filePath : null;
  // The scan's own string for this film. byFile is keyed by the exact strings passed in, so
  // the row is read back with the path the scan holds, never with the record's spelling of it.
  const scanned = filePath === null
    ? null
    : (state.wsFiles.find((f) => f.toLowerCase() === filePath.toLowerCase()) ?? null);

  // In the scan and sharing its stem with another scanned film: this is exactly what the load
  // counts `ambiguous` and attaches to neither film. Refused before the join is even read --
  // the answer does not depend on whether a row happens to exist for that stem.
  if (scanned !== null
    && state.wsFiles.filter((f) => fileStem(f).toLowerCase() === stem.toLowerCase()).length > 1) {
    return { ok: false, reason: 'ambiguous', stem };
  }

  const key = scanned ?? (filePath ?? study.fileName);
  const join = joinClinical({
    files: scanned === null ? [key] : state.wsFiles,
    headers: state.wsCsvHeaders,
    rows: state.wsCsvRows,
    mapping: state.wsMapping,
  });
  const row = join.rowByFile.get(key);
  if (!row) return { ok: false, reason: 'no-row', stem };
  const values = join.byFile.get(key) ?? {};
  // The study fields the row supplies (spec §8.2), only where it supplies one: a blank CSV cell
  // never clears a stored value -- the rule the clinical values already follow.
  const structural = structuralFromRow(row, findStructuralHeaders(state.wsCsvHeaders));
  const fields = {};
  for (const name of ['subjectId', 'timepoint', 'filmDate', 'view']) {
    if (structural[name] !== null) fields[name] = structural[name];
  }
  return { ok: true, values, fields, badDate: structural.badDate };
}

// The studies the grid shows, one row each, in row order. Plan 07 replaces this one
// expression with the open study plus the comparison study; every row, and the count
// label, is derived from the array so nothing else in this module assumes a count.
function visibleStudies(state) {
  const open = openStudy(state);
  return open ? [open] : [];
}

function sameKey(a, b) {
  return a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i]);
}

export function mountClinicalData(host) {
  clear(host);
  let lastKey = null;

  // ---- actions. All run from DOM events, never inside a store subscriber. ----------

  function addField(name) {
    const state = getState();
    if (state.fields.includes(name)) return;
    setState({ fields: [...state.fields, name] });
    refresh();
  }

  // Hides a COLUMN, never data: the name leaves the session's `fields`, every value stays on
  // its record and on disk, and bootstrap seeds `fields` from the stored keys again at the
  // next launch. That is why the control is labelled "Hide" rather than "Remove".
  function removeField(name) {
    setState((s) => ({ fields: s.fields.filter((f) => f !== name) }));
    refresh();
  }

  // ONE new-array write; the record is replaced, never mutated. The saver subscribed in
  // renderer/main.js persists this reference change on its own. The grid must NOT rebuild
  // here: `change` on a text input is dispatched during the BLUR half of the focus update,
  // when document.activeElement is already <body>, so rebuild()'s focus snapshot would come
  // back null and clear(host) would destroy the very cell the user is tabbing or clicking
  // into -- focus would end on <body>, where viewer.js's window keydown handler (its
  // input/select/textarea guard no longer matching) would turn the next arrow key into a
  // landmark nudge. The input already shows the typed value, so pre-arm the gate with the
  // array update() is about to see; any LATER external change to studies still rebuilds.
  // That is the ordinary path. `change` ALSO fires on REMOVAL of an edited cell, inside a
  // store notification, so the handler defers this call one microtask to reach here legally.
  function setValue(studyId, field, value) {
    setState((s) => {
      const studies = s.studies.map((study) => {
        if (study.id !== studyId) return study;
        const clinical = { ...study.clinical };
        // An emptied cell removes the key rather than storing '': joinClinical never writes
        // a blank key either, and Task 6 seeds state.fields from the keys that exist, so a
        // stored '' would resurrect the column at every launch with no way to drop it.
        // Non-empty text is stored exactly as typed -- clinical values are never reformatted
        // (the join stores its own values trimmed; typed text keeps whatever spacing it has).
        if (value.trim() === '') delete clinical[field];
        else clinical[field] = value;
        return { ...study, clinical };
      });
      if (lastKey !== null) lastKey = [studies, ...lastKey.slice(1)];
      return { studies };
    });
  }

  // The five study fields (spec §9) are top-level record fields, not clinical keys, with the same
  // one new-array write and the same pre-armed gate as setValue. Subject is stored trimmed; a view
  // that names a known position is stored as its label (`flexion` → Flexion lateral), anything
  // else as typed. A timepoint that names a known label is stored as that label (`preop` →
  // Pre-op, `6 weeks` → 6 wk) so a typed label pairs; anything else as typed. A date input's
  // value is already YYYY-MM-DD. An emptied cell stores null -- except view, which validateStudy
  // requires to be a string (it throws on anything else and would refuse the whole store at the
  // next launch), so it stores '' and renders as an em dash (`normaliseView('')` is null, and the
  // `?? text` keeps the empty string).
  function setStudyField(studyId, field, value) {
    const text = String(value ?? '').trim();
    let next;
    if (field === 'view') next = normaliseView(text) ?? text;
    else if (field === 'timepoint') next = text === '' ? null : (normaliseTimepoint(text) ?? text);
    else next = text === '' ? null : text;
    setState((s) => {
      const studies = s.studies.map((study) => (study.id === studyId ? { ...study, [field]: next } : study));
      if (lastKey !== null) lastKey = [studies, ...lastKey.slice(1)];
      return { studies };
    });
  }

  // Commits a study cell and puts the STORED form back on the node. A timepoint is stored as its
  // label (`postop` → Post-op) and a subject trimmed, and setStudyField pre-arms the rebuild gate so
  // nothing repaints -- without this the cell would keep showing the typed text while the record
  // held something else. Both commit paths use it: the cell's own change handler, and the
  // restore's blur listener, which is the ONLY path after an external rebuild (assigning .value
  // there resets the change baseline, so no further `change` fires). A node the removal race has
  // already detached is harmless to write to; the visible node is written by whichever of the two
  // paths runs on it. A study that has left the store between the event and the microtask (a
  // delete landing mid-edit) gets no write-back: the rebuild that follows replaces the node.
  function commitStudyCell(node, studyId, field, value) {
    setStudyField(studyId, field, value);
    const record = getState().studies.find((x) => x.id === studyId);
    if (record) node.value = String(record[field] ?? '');
  }

  function onToggleOpen() {
    setState((s) => ({ dataOpen: !s.dataOpen }));
    refresh();
  }

  // Populates from the workspace CSV in the store (spec 9.5: the button "must not be lying").
  // The decision is importRowFor's, against the same scan the Workspace load sees, so the
  // drawer can never attach a row the load refused as ambiguous; a study added through the
  // picker, or one opened with a CSV chosen after the folder, still imports.
  function onImportFromCsv() {
    const state = getState();
    const study = openStudy(state);
    if (!study || study.source !== 'real' || !state.wsCsv) return;
    const decision = importRowFor(state, study);
    if (!decision.ok) {
      // 'no-csv' cannot reach here (the guard above returns, and the button is disabled
      // without a CSV), so there is nothing to say about it.
      if (decision.reason === 'ambiguous') {
        showToast(`More than one film in the workspace is named ${decision.stem} — the CSV row cannot be matched to this study.`);
      } else if (decision.reason === 'no-row') {
        showToast(`No CSV row matches ${study.fileName}.`);
      }
      return;
    }
    const fromCsv = decision.values;
    const fields = decision.fields;
    // A matched row whose mapped cells are all empty imports zero fields; the toast says 0
    // rather than claiming no row matched. The study fields it carried are counted apart.
    const keys = Object.keys(fromCsv);
    const fieldKeys = Object.keys(fields);
    setState((s) => ({
      studies: s.studies.map((x) => (x.id === study.id
        ? { ...x, ...fields, clinical: { ...x.clinical, ...fromCsv } }
        : x)),
      fields: [...s.fields, ...keys.filter((key) => !s.fields.includes(key))],
      dataOpen: true,
    }));
    refresh();
    showToast(`Imported ${keys.length} field${keys.length === 1 ? '' : 's'}`
      + (fieldKeys.length > 0 ? ` and ${fieldKeys.length} study detail${fieldKeys.length === 1 ? '' : 's'}` : '')
      + ' from CSV'
      + (decision.badDate ? ' · the film date could not be read' : ''));
  }

  // ---- builders. Pure functions of the state they are handed. ------------------------

  function buildHeader(state, studies, open) {
    const isDemo = open !== null && open.source === 'demo';
    const canImport = open !== null && !isDemo && Boolean(state.wsCsv);
    // No tooltip on the enabled button (screens/analysis.js's Export CSV precedent).
    const importTitle = isDemo ? DEMO_TITLE : (canImport ? '' : NO_CSV_TITLE);
    return el('div', { class: 'clinical-header' },
      el('button', {
        type: 'button',
        class: `icon-btn clinical-toggle${state.dataOpen ? '' : ' clinical-toggle-closed'}`,
        'aria-label': 'Toggle clinical data',
        'aria-expanded': String(state.dataOpen),
        title: 'Toggle clinical data',
        'data-focus-key': 'toggle',
        innerHTML: CHEVRON_UP_SVG,
        onClick: onToggleOpen,
      }),
      el('div', { class: 'clinical-title' }, 'Clinical data'),
      el('div', { class: 'eyebrow clinical-count' }, fieldCountLabel(state.fields.length, studies.length)),
      el('div', { class: 'clinical-spacer' }),
      el('button', {
        type: 'button',
        class: 'btn btn-small clinical-import',
        disabled: !canImport,
        title: importTitle,
        'data-focus-key': 'import',
        onClick: onImportFromCsv,
      },
        el('span', { class: 'btn-icon', innerHTML: UPLOAD_SVG }),
        'Import from CSV'));
  }

  function buildChipRow(state) {
    const available = KNOWN_FIELDS.filter((name) => !state.fields.includes(name));
    const custom = el('input', {
      type: 'text',
      class: 'clinical-custom',
      placeholder: '+ Custom field…',
      'aria-label': 'Add a custom field',
      'data-focus-key': 'custom',
      onKeydown: (event) => {
        if (event.key !== 'Enter') return;
        const name = custom.value.trim();
        if (!name) return;
        addField(name);
        // addField's refresh() rebuilt the row, so `custom` is now the detached old node.
        // Clear and focus the LIVE input so several custom fields can be added in a row;
        // for a duplicate name (no rebuild) this is the same node and just clears it.
        const live = host.querySelector('.clinical-custom');
        if (live) { live.value = ''; live.focus(); }
      },
    });
    return el('div', { class: 'clinical-chip-row' },
      el('div', { class: 'eyebrow' }, 'ADD FIELD'),
      ...available.map((name) => el('button', {
        type: 'button',
        class: 'clinical-chip',
        'data-focus-key': `chip:${name}`,
        onClick: () => addField(name),
      }, el('span', { class: 'clinical-chip-plus' }, '+'), name)),
      custom);
  }

  function studyCell(study, column, isDemo) {
    const value = study[column.field];
    const input = el('input', {
      type: column.type,
      class: `clinical-cell clinical-cell-study${column.type === 'date' ? ' clinical-cell-date' : ''}`,
      value: value != null ? String(value) : '',
      // A date input draws its own empty mask; a placeholder there is ignored.
      placeholder: column.type === 'date' ? undefined : '—',
      'aria-label': `${studyName(study)} ${column.title}`,
      'data-focus-key': `study:${study.id}:${column.field}`,
      'data-study-id': study.id,
      'data-field': column.field,
      // How rebuild() tells this cell from a clinical cell whose field happens to be called `view`.
      'data-kind': 'study',
      disabled: isDemo,
      title: isDemo ? DEMO_TITLE : undefined,
      // Deferred one microtask for the same reason as the clinical cells: `change` also fires on
      // REMOVAL of an edited cell, inside a store notification, where setState throws. The node
      // is captured with the value: the write-back in commitStudyCell needs it.
      onChange: (event) => {
        const node = event.target;
        const next = node.value;
        queueMicrotask(() => commitStudyCell(node, study.id, column.field, next));
      },
    });
    // `list` is a read-only accessor on HTMLInputElement (it returns the datalist node), so el()
    // must not receive it as a prop -- the assignment throws in strict mode. An attribute it is.
    if (column.list) input.setAttribute('list', column.list);
    return input;
  }

  function buildGrid(state, studies) {
    const fields = state.fields;
    // The group row: a blank over the name column, STUDY over the five fixed columns, CLINICAL
    // DATA over the fields (absent when there are none). Not a .clinical-grid-head row: the smoke
    // suite reads the head cells by that class and the data rows by its absence.
    const group = el('div', { class: 'clinical-grid-row clinical-grid-group' },
      el('div', { class: 'clinical-grid-cell' }),
      el('div', { class: 'clinical-grid-cell clinical-grid-group-study' }, 'STUDY'),
      fields.length > 0 ? el('div', { class: 'clinical-grid-cell clinical-grid-group-clinical' }, 'CLINICAL DATA') : null);

    const head = el('div', { class: 'clinical-grid-row clinical-grid-head' },
      el('div', { class: 'clinical-grid-cell' }, 'STUDY'),
      // No Hide button: the five are not fields and cannot leave the grid.
      ...STUDY_COLUMNS.map((column) => el('div', { class: 'clinical-grid-cell clinical-grid-head-study' }, el('span', {}, column.head))),
      ...fields.map((name) => el('div', { class: 'clinical-grid-cell' },
        el('span', {}, name.toUpperCase()),
        el('button', {
          type: 'button',
          class: 'clinical-remove',
          'aria-label': `Hide ${name}`,
          title: 'Hide field — values are kept',
          'data-focus-key': `remove:${name}`,
          onClick: () => removeField(name),
        }, '×'))));

    const rows = studies.map((study) => {
      // Demo records are never written (the saver filters them), so an edit would silently
      // vanish at the next launch. Say so instead of accepting it.
      const isDemo = study.source === 'demo';
      return el('div', { class: 'clinical-grid-row' },
        // The visible label is the study's name; every `data-` attribute below stays keyed on
        // the id, which is what the focus-restore machinery looks the row back up by.
        el('div', { class: 'clinical-grid-cell clinical-grid-id', title: study.id }, studyName(study)),
        ...STUDY_COLUMNS.map((column) => studyCell(study, column, isDemo)),
        ...fields.map((name) => el('input', {
          type: 'text',
          class: 'clinical-cell',
          // A present value renders as itself -- String() keeps a numeric 0 from a hand-edited
          // store visible; only null/undefined is absent, and absent shows the placeholder.
          value: study.clinical?.[name] != null ? String(study.clinical[name]) : '',
          placeholder: '—',
          'aria-label': `${studyName(study)} ${name}`,
          'data-focus-key': `cell:${study.id}:${name}`,
          // The cell's identity, readable back off the node after a rebuild replaced it.
          // Both go through setAttribute (they are not node properties), which is why they
          // are written as attribute names and not as a forbidden `dataset` prop.
          'data-study-id': study.id,
          'data-field': name,
          'data-kind': 'clinical',
          disabled: isDemo,
          title: isDemo ? DEMO_TITLE : undefined,
          // Chromium fires `change` SYNCHRONOUSLY when a rebuild's clear(host) removes a
          // focused, edited cell -- i.e. inside a store notification, where setState throws
          // (store.js's re-entrancy guard) and the throw is swallowed by the subscriber
          // try/catch, leaving a console exception and an uncommitted edit. Defer the commit
          // past the notification, the same mechanism the restore's blur listener uses.
          // event.target.value is captured BEFORE queuing: the node may be detached by the
          // time the microtask runs, but the captured string is what the user typed. In the
          // ordinary Tab/click case the microtask runs right after the `change` dispatch and
          // before `blur`, so setValue's pre-arm still keeps the component's own commit from
          // rebuilding, and the restored cell's blur listener later sees equal values and skips.
          onChange: (event) => {
            const value = event.target.value;
            queueMicrotask(() => setValue(study.id, name, value));
          },
        })));
    });

    const grid = el('div', { class: 'clinical-grid' }, group, head, ...rows);
    // A CSS custom property set AFTER construction. `style` must never be an el() prop: the
    // `key in node` branch would assign to the read-only CSSStyleDeclaration and throw.
    // repeat(0, …) is invalid CSS and would drop the whole declaration, hence the conditional.
    grid.style.setProperty('--clinical-cols',
      `110px repeat(${STUDY_COLUMNS.length}, minmax(130px, 1fr))${fields.length > 0 ? ` repeat(${fields.length}, minmax(150px, 1fr))` : ''}`);
    // The two datalists the Timepoint and View cells suggest from. Ids are document-wide; the
    // drawer is mounted once per Analysis screen and rebuilt whole, so one pair per rebuild.
    const lists = [
      el('datalist', { id: 'clinical-timepoints' }, ...TIMEPOINT_SUGGESTIONS.map((label) => el('option', { value: label }))),
      el('datalist', { id: 'clinical-views' }, ...VIEW_SUGGESTIONS.map((label) => el('option', { value: label }))),
    ];
    // With no clinical field the grid still shows the Study group; the empty state sits below it.
    return [grid, ...lists, fields.length === 0 ? el('div', { class: 'clinical-empty' }, EMPTY_COPY) : null];
  }

  // ---- rebuild -------------------------------------------------------------------------

  function rebuild(state) {
    const studies = visibleStudies(state);
    const open = openStudy(state);

    // Focus snapshot. clear(host) destroys the focused node and the HTML focus spec then
    // drops document.activeElement to <body>; same fix as measurements.js: remember the
    // node's stable data-focus-key, rebuild, focus the node that now carries it. Only when
    // focus is inside this host -- a rebuild must never steal focus from elsewhere.
    // A focused TEXT FIELD carries more than focus: `change` has not fired yet, so what the
    // user has typed is on the node and nowhere else, and the rebuilt cell would render the
    // older store value. Snapshot the live value and the caret for the two editable controls
    // and put them back below, so a rebuild triggered from OUTSIDE this component (a run
    // finishing, another screen's setState) cannot eat a half-typed cell.
    const active = document.activeElement;
    const inHost = host.contains(active);
    const focusKey = inHost ? active.getAttribute('data-focus-key') : null;
    let typed = null;
    if (inHost && active.classList.contains('clinical-cell')) {
      typed = {
        kind: active.getAttribute('data-kind') === 'study' ? 'study' : 'clinical',
        studyId: active.getAttribute('data-study-id'),
        field: active.getAttribute('data-field'),
        value: active.value,
        // A date cell reports null for both (no text selection); the restore below skips the caret.
        selectionStart: active.selectionStart,
        selectionEnd: active.selectionEnd,
      };
    } else if (inHost && active.classList.contains('clinical-custom')) {
      typed = {
        custom: true,
        value: active.value,
        selectionStart: active.selectionStart,
        selectionEnd: active.selectionEnd,
      };
    }

    clear(host);
    host.append(buildHeader(state, studies, open));
    if (state.dataOpen) {
      host.append(el('div', { class: 'clinical-body' }, buildChipRow(state), buildGrid(state, studies)));
    }

    // The typing restore runs first and wins: it is the only path that carries a value the
    // store does not have yet. Nodes are compared attribute by attribute rather than through
    // a built selector -- a custom field name is user text and could carry a quote.
    if (typed) {
      let field = null;
      if (typed.custom) {
        field = host.querySelector('.clinical-custom');
      } else {
        for (const candidate of host.querySelectorAll('.clinical-cell')) {
          if (candidate.getAttribute('data-study-id') === typed.studyId
            && candidate.getAttribute('data-field') === typed.field
            && candidate.getAttribute('data-kind') === typed.kind) { field = candidate; break; }
        }
      }
      if (field && !field.disabled) {
        field.value = typed.value;
        // Restoring the text is not the same as saving it. Assigning .value programmatically
        // resets the control's change-event baseline, so a user who typed BEFORE this rebuild
        // and then clicks away without typing again fires no `change`: setValue would never run
        // and the edit would be lost while it still sat on screen looking saved -- a worse
        // failure than no snapshot at all, where the text at least visibly disappears. Commit it
        // on blur instead. `change` fires BEFORE `blur`, so if the user does type again onChange
        // commits first and the guard below sees equal values and skips -- never committed twice.
        // The commit is deferred one microtask for a SECOND reason: this blur does not only fire
        // from the user. A later rebuild's clear(host) removes this node while it still holds
        // focus, and Chromium fires blur SYNCHRONOUSLY on removal -- inside that store
        // notification, where setState throws (store.js's re-entrancy guard) and the throw is
        // swallowed by the subscriber try/catch, dropping the edit with no signal. A microtask
        // runs after the notification loop has finished, so the commit is legal either way; same
        // reasoning as main.js's deferred showToast. Nothing is lost in that race regardless:
        // the later rebuild snapshots this node's typed value before removing it and restores it
        // into the new cell, whose own fresh listener then finds equal values and skips.
        // once:true because the next rebuild attaches a fresh listener to the node it restores.
        // Cells only: a half-typed custom FIELD NAME is not data and strands nothing.
        if (!typed.custom) {
          field.addEventListener('blur', () => {
            queueMicrotask(() => {
              const s = getState();
              const record = s.studies.find((x) => x.id === typed.studyId);
              const stored = typed.kind === 'study' ? (record?.[typed.field] ?? '') : (record?.clinical?.[typed.field] ?? '');
              if (field.value !== stored) {
                if (typed.kind === 'study') commitStudyCell(field, typed.studyId, typed.field, field.value);
                else setValue(typed.studyId, typed.field, field.value);
              }
            });
          }, { once: true });
        }
        // Text controls carry a caret; a date cell reports a null selection and is skipped here, and
        // (never seen on a text input, but cheap to tolerate) just skips the caret restore.
        if (typed.selectionStart !== null && typed.selectionEnd !== null) {
          field.setSelectionRange(typed.selectionStart, typed.selectionEnd);
        }
        field.focus();
        return;
      }
      // The cell or the field is gone (the study left visibleStudies, the column was hidden,
      // the drawer collapsed): fall through to the plain focus-key restore below.
    }

    if (focusKey !== null) {
      let target = null;
      for (const candidate of host.querySelectorAll('[data-focus-key]')) {
        if (candidate.getAttribute('data-focus-key') === focusKey) { target = candidate; break; }
      }
      // The focused control itself may be gone (a clicked chip, the × of the hidden field,
      // the body of a collapsed drawer); the toggle always exists.
      if (!target) target = host.querySelector('.clinical-toggle');
      if (target && typeof target.focus === 'function') target.focus();
    }
  }

  // Rebuild gate. screens/analysis.js calls this on EVERY store notification, including
  // every pointermove pan frame; without it a pan would tear down the grid's inputs per
  // frame. rebuild() carries focus, the typed value and the caret across a rebuild that does
  // happen, but not rebuilding at all is cheaper and steadier. Compared by reference:
  // `studies` and `fields` are replaced wholesale, never mutated. `wsCsv` is in the key because the
  // Import button's disabled state reads it.
  function update() {
    const state = getState();
    const key = [state.studies, state.fields, state.dataOpen, state.openId, state.compareId, state.wsCsv];
    if (sameKey(key, lastKey)) return;
    lastKey = key;
    rebuild(state);
  }

  // Forced rebuild after this component's own actions. When the drawer is mounted through
  // screens/analysis.js the store notification has usually rebuilt already (each action
  // changes a key); this pass is the guarantee that does not depend on who is subscribed.
  function refresh() {
    lastKey = null;
    update();
  }

  return { update };
}
