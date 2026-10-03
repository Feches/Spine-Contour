import { segmentalRows } from '../data/segmental.js';
import { cervicalRows, studyRegion } from '../data/cervical.js';
import { globalSvaRows } from '../data/global-sva.js';
import { landmarkReviewReasons } from '../data/status.js';
import { el, clear } from '../dom.js';
import { getState, setState } from '../store.js';
import { calibrationSummary } from '../data/calibration.js';
import { DISC_POSITIONS } from '../data/disc-heights.js';
import { sagittalRows, lordosisRows, discRows, alignmentRows, isConsistent, deltaRow } from '../data/measurements.js';
import { studyName } from '../data/labels.js';

const INCONSISTENCY_WARNING = 'Parameters inconsistent \u2014 check S1 and femoral landmarks.';
const NOT_COMPUTED_NOTE = 'Not computed in this build.';
const CVA_EXTRA_WARNINGS = new Set([
  'Review the automatically detected film region and orientation before accepting measurements.',
  'Manually edited landmarks — verify the corrected positions.',
  'Verify the C7 centroid, S1 endplate and selected anterior image side.',
  'Review C7 identity, the S1 posterior corner, image orientation and calibration before accepting global SVA.',
  'Anterior orientation was selected automatically from regional crop agreement; confirm it before accepting measurements.',
]);

export function measurementWarnings(qc, region) {
  const warnings = landmarkReviewReasons(qc);
  return region === 'cervical' || region === 'full_spine'
    ? warnings.filter((warning) => !CVA_EXTRA_WARNINGS.has(warning)) : warnings;
}

function formatRowValue(row) {
  return row.absent ? '\u2014' : `${row.value.toFixed(1)}${row.unit}`;
}

function section(title, ...children) {
  return el('div', { class: 'meas-section' },
    el('div', { class: 'meas-section-head' },
      el('div', { class: 'meas-section-title' }, title),
      el('div', { class: 'meas-rule' })),
    ...children);
}

function valueCell(row, extraClass = '') {
  return el('div', { class: `meas-value${extraClass}` }, formatRowValue(row));
}

// The signed difference between the two studies, the compared one minus the open one, in the
// accent colour once it passes the threshold (similar-cases plan B Task 8, plan 07 Task 5).
// Two values in different units -- a calibrated SVA in mm beside an uncalibrated one in px --
// have no difference to show, so the delta is the absent dash rather than a number.
function deltaCell(row, otherRow, threshold) {
  const delta = deltaRow(row, row.unit === otherRow.unit ? otherRow : null, threshold);
  return el('div', { class: `meas-delta${delta.overThreshold ? ' is-over' : ''}` }, delta.text);
}

// The compared study's row for each of the open study's rows, matched by key (the regions'
// row lists differ: a cervical study has no PI, a lumbar one no C2-C7 Cobb). A row the compared
// study does not have is an absent value, never dropped and never borrowed from another row.
// Without a compared study it answers null, so the rows render without the two extra cells.
function pairRows(otherRows) {
  if (!otherRows) return () => null;
  return (row) => otherRows.find((candidate) => candidate.key === row.key) ?? { ...row, value: null, absent: true };
}

// A row that selects a vertebra. A real <button> so it is keyboard-reachable: these are
// the only way to drive the viewer's construction lines without a mouse until plan 04.
// With `other`, the compared study's value and the signed delta follow the value: 5 degrees
// for the angles.
function rowButton(row, onClick, other = null) {
  return el('button', {
    type: 'button',
    class: `meas-row${row.highlight ? ' is-selected' : ''}`,
    'aria-pressed': row.highlight ? 'true' : 'false',
    'data-row-key': row.key,
    onClick,
  },
    el('div', { class: 'meas-label' }, row.label),
    el('div', { class: 'meas-spacer' }),
    valueCell(row),
    other ? valueCell(other, ' meas-value-other') : null,
    other ? deltaCell(row, other, 5) : null);
}

// A row with no selectable construction.
function rowStatic(row, other = null) {
  return el('div', { class: 'meas-row-static' },
    el('div', { class: 'meas-label' }, row.label),
    el('div', { class: 'meas-spacer' }),
    valueCell(row),
    other ? valueCell(other, ' meas-value-other') : null,
    other ? deltaCell(row, other, 2) : null);
}

// The disc table: with `other`, each position cell stacks the value, the other's value and the
// delta (2 mm), so the table keeps its four columns.
function discTable(study, other = null) {
  const rows = discRows(study);
  const otherRows = other ? discRows(other) : null;
  const cell = (row, position, index) => {
    const value = row[position] === null ? '\u2014' : row[position].toFixed(1);
    if (!otherRows) return el('td', { class: 'meas-value', 'data-disc-position': position }, value);
    const otherRow = otherRows[index];
    const delta = deltaRow({ value: row[position], absent: row[position] === null },
      { value: otherRow[position], absent: otherRow[position] === null }, 2);
    return el('td', { class: 'meas-value meas-value-stacked', 'data-disc-position': position },
      el('div', {}, value),
      el('div', { class: 'meas-value-other' }, otherRow[position] === null ? '\u2014' : otherRow[position].toFixed(1)),
      el('div', { class: `meas-delta${delta.overThreshold ? ' is-over' : ''}` }, delta.text));
  };
  return el('table', { class: 'meas-disc-table', 'aria-label': 'Disc heights in millimetres' },
    el('thead', {}, el('tr', {},
      ...['Level', 'Anterior', 'Middle', 'Posterior'].map(label => el('th', { scope: 'col' }, label)))),
    el('tbody', {}, ...rows.map((row, index) => el('tr', { 'data-disc-level': row.key },
      el('th', { scope: 'row' }, row.label),
      ...DISC_POSITIONS.map(position => cell(row, position, index))))));
}

// Which vertebra a row's click selects.
//
// This is the WRITE half of the row/level mapping; data/measurements.js's SAGITTAL_DEFS
// is the READ half, and the two are deliberately asymmetric for exactly one row. PILL
// highlights when EITHER L1 or S1 is selected (`levels: ['L1','S1']`, because the PI-LL
// mismatch is a relationship between them), but a click has to choose one, and S1 is the
// one that draws a construction the user can see: the S1-midpoint-to-hip line shared by
// PI, PT and SS. Do not "reconcile" these into one table -- they answer different
// questions.
//
// L1PA is the opposite case: READ and WRITE agree exactly, both 'L1PA', and that
// agreement is itself the fix for a real bug. L1PA used to map here to 'L1', which
// selected the same construction a click on the LL row selects -- lumbar lordosis --
// so the row labelled L1 PELVIC ANGLE drew and labelled the lordosis line instead of
// its own construction. L1PA now names a construction target of its own (see the
// architecture contract's selectedLevel section); this map just has to point at it.
//
// PI, PT and SS are a third case, and read the same way as L1PA: each now maps to
// itself rather than to the shared 'S1' overview, because each is a different angle
// against a different reference axis. Before this fix all three mapped here to 'S1',
// which is exactly what drew one shared line and one combined, edge-clipped label for
// three distinct measurements. Their SAGITTAL_DEFS `levels` still include 'S1' (so
// clicking the sacrum's S1 row, or the sacrum on the image itself, highlights all
// three as the overview), but a click on the PI/PT/SS row itself now selects its own
// precise single-parameter construction.
const ROW_LEVELS = { LL: 'L1', PI: 'PI', PT: 'PT', SS: 'SS', PILL: 'S1', L1PA: 'L1PA' };

// Clicking the row that already owns the selection clears it. Without this a construction's
// label plate has no way off the stage, and in edit mode it sits on the handles.
function toggleLevel(target) {
  setState((s) => ({ selectedLevel: s.selectedLevel === target ? null : target }));
}

function sameKey(a, b) {
  return a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i]);
}

export function mountMeasurements(container) {
  clear(container);
  const root = el('div', { class: 'meas-panel' });
  container.append(root);

  let lastKey = null;
  let lastReviewKey = null;

  // `other` is the compared study (similar-cases plan B Task 8): every row gains its value and
  // the signed delta beside the open study's, and a header names the two columns.
  function updateMeasurements(study, other = null) {
    const state = getState();
    // Quality metadata and a pending correction can change without new numbers.
    const reviewKey = [study.qc, Boolean(state.measurementDrafts?.[study.id])];
    if (!sameKey(reviewKey, lastReviewKey)) lastKey = null;
    lastReviewKey = reviewKey;

    // Rebuild gate. screens/analysis.js calls this on every store notification, which
    // includes every pointermove pan frame; without the gate, a pan tears down and
    // rebuilds every row per frame, resetting scroll position and dropping focus.
    // Compared by reference: `measurements` is replaced wholesale by /predict, never
    // mutated. Same caveat as components/viewer.js -- plan 04 must replace, not mutate.
    const discPending = Boolean(state.measurementDrafts?.[study.id]);
    const key = [study.region, study.id, study.measurements, study.geometry, study.calibration, discPending, state.selectedLevel, state.showAllLordosis,
      other ? other.id : null, other ? other.region : null, other ? other.measurements : null, other ? other.geometry : null,
      other ? other.calibration : null];
    if (sameKey(key, lastKey)) return;
    lastKey = key;

    // Focus snapshot. clear(root) below destroys every row node, including
    // whichever one currently holds focus -- and per the HTML focus spec, removing
    // the focused element synchronously reverts document.activeElement to <body>
    // with nothing to undo it. That is the exact failure mode router.js's swap()
    // exists to prevent for screen/sidebar remounts (see router.js:102-131), so we
    // apply the same fix here: snapshot before the rebuild, restore after.
    // router.js matches by tag name + ordinal position, and its own comment admits
    // that heuristic breaks when a conditional sibling shifts the ordinal -- which
    // is exactly what happens here when the lordosis disclosure inserts or removes
    // four rows above a focused one. Matching on each button's stable
    // `data-row-key` attribute instead is an exact identity match and has no such
    // blind spot. Only capture a key when focus is actually inside `root`: a
    // rebuild must never steal focus from somewhere else on the page.
    const activeElement = document.activeElement;
    const focusKey = root.contains(activeElement) ? activeElement.getAttribute('data-row-key') : null;

    clear(root);
    const pending = Boolean(state.measurementDrafts?.[study.id]);
    const measurements = pending ? null : study.measurements;
    const cervical = studyRegion(study) === 'cervical';
    const fullSpine = studyRegion(study) === 'full_spine';
    const rows = cervical ? cervicalRows(pending ? { region: 'cervical' } : study, state.selectedLevel)
      : fullSpine ? globalSvaRows(pending ? { region: 'full_spine' } : study, state.selectedLevel)
      : sagittalRows(measurements, { selectedLevel: state.selectedLevel });
    // The compared study's rows, built by the same functions as the open study's and paired by
    // key (pairRows). Read from the record itself: a pending correction is the OPEN study's,
    // never the compared one's. Every pairing answers null without a compared study.
    const otherSection1 = pairRows(other ? (cervical ? cervicalRows(other) : fullSpine ? globalSvaRows(other)
      : sagittalRows(other.measurements)) : null);
    const otherSagittal = pairRows(other ? sagittalRows(other.measurements) : null);
    const otherCervical = pairRows(other ? cervicalRows(other) : null);
    const otherLordosis = pairRows(other ? lordosisRows(other.measurements) : null);
    const otherSegmental = pairRows(other ? segmentalRows(other) : null);
    const otherAlignment = pairRows(other ? alignmentRows(other) : null);

    const section1 = section(cervical ? '01 — CERVICAL ALIGNMENT' : fullSpine ? '01 — GLOBAL ALIGNMENT' : '01 \u2014 SAGITTAL PARAMETERS',
      el('div', { class: 'meas-rows' },
        ...rows.map((row) => rowButton(row, () => toggleLevel(cervical || fullSpine ? row.key : ROW_LEVELS[row.key]),
          otherSection1(row)))));

    const lumbarSection = fullSpine ? section('03 — SAGITTAL PARAMETERS',
      el('div', { class: 'meas-rows' }, ...sagittalRows(measurements, { selectedLevel: state.selectedLevel })
        .map(row => rowButton(row, () => toggleLevel(ROW_LEVELS[row.key]), otherSagittal(row))))) : section1;
    if (!cervical) lumbarSection.append(el('button', {
      type: 'button',
      class: 'meas-disclosure',
      'aria-expanded': state.showAllLordosis ? 'true' : 'false',
      'data-row-key': '__disclosure',
      onClick: () => setState((s) => ({ showAllLordosis: !s.showAllLordosis })),
    }, state.showAllLordosis ? 'HIDE LORDOSIS LEVELS' : 'SHOW ALL LORDOSIS LEVELS'));

    if (!cervical && state.showAllLordosis) {
      lumbarSection.append(el('div', { class: 'meas-rows' },
        // lordosisRows always returns highlight: false -- the component, not the data
        // layer, owns highlighting here, because state.selectedLevel lives on the store
        // and lordosisRows' signature is fixed by the architecture contract. Map it in
        // before rendering rather than reaching into the data layer for it.
        ...lordosisRows(measurements)
          .map((row) => ({ ...row, highlight: state.selectedLevel === row.key.split('-')[0] }))
          .map((row) => rowButton(
            row,
            // Row key 'L2-S1' uses an ASCII hyphen; the label uses an en dash. The split
            // below relies on the key form, so do not unify them.
            () => toggleLevel(row.key.split('-')[0]),
            otherLordosis(row),
          ))));
    }

    if (!isConsistent(measurements)) {
      section1.append(el('div', { class: 'meas-warning' }, INCONSISTENCY_WARNING));
    }

    if (pending) section1.append(el('div', { class: 'meas-note', role: 'status' }, 'Updating measurements…'));
    else for (const reason of study.measurements ? measurementWarnings(study.qc, studyRegion(study)) : []) {
      section1.append(el('div', { class: 'meas-warning' }, reason));
    }

    const section2 = section(fullSpine ? '04 — DISC HEIGHTS · MM' : '02 — DISC HEIGHTS · MM',
      // A pending correction makes BOTH columns pending: the open study's heights are being
      // recomputed, and a table that showed only the compared study's would read as a comparison
      // against nothing.
      discTable(discPending ? null : study, discPending ? null : other),
      el('div', { class: 'meas-note' }, discPending ? 'Updating disc heights…'
        : 'Facing endplates: anterior to anterior, midpoint to midpoint, posterior to posterior. Requires image scale and both endplates.'));

    const segmentalSection = section('SEGMENTAL ANGLES · °',
      el('div', { class: 'meas-rows' }, ...segmentalRows(pending ? { region: studyRegion(study) } : study, state.selectedLevel)
        .map(row => rowButton(row, () => toggleLevel(row.key), otherSegmental(row)))),
      el('div', { class: 'meas-note' }, 'Lordosis: superior to superior endplate. Angulation: inferior to superior (disc) endplates. Unsigned acute angles; image-space angles when uncalibrated. Missing endplates are unavailable.'));

    const section3 = section('03 \u2014 ALIGNMENT',
      el('div', { class: 'meas-rows' }, ...alignmentRows(study).map((row) => rowStatic(row, otherAlignment(row)))),
      el('div', { class: 'meas-note' }, NOT_COMPUTED_NOTE));

    const calibrationSection = section(fullSpine ? '05 — IMAGE SCALE' : '04 — IMAGE SCALE',
      el('div', { class: 'meas-note', 'data-calibration-status': study.calibration?.status || 'unchecked' },
        calibrationSummary(study.calibration)));
    if (study.source === 'real' && study.filePath) {
      calibrationSection.append(el('button', { type: 'button', class: 'meas-disclosure',
        'data-row-key': '__calibration',
        onClick: () => setState({ screen: 'calibration', calibrationRequest: { studyId: study.id, filePath: study.filePath } }),
      }, 'REVIEW IMAGE SCALE'));
    }
    // Which column is which, once there are two. The studies are named the way every other
    // surface names them -- never the SP-nnnn record id -- and the cell ellipsises inside its
    // 64px, so the full name is on the title. aria-hidden: the names are already on the panes'
    // chips and in the header badge, and a screen reader reading them again here as a bare row
    // of three tokens says nothing the rows below do not.
    if (other) {
      const openName = studyName(study);
      const otherName = studyName(other);
      root.append(el('div', { class: 'meas-compare-head', 'aria-hidden': 'true' },
        el('div', { class: 'meas-spacer' }),
        el('div', { class: 'meas-compare-id', title: openName }, openName),
        el('div', { class: 'meas-compare-id meas-compare-other', title: otherName }, otherName),
        el('div', { class: 'meas-compare-delta' }, '\u0394')));
    }
    if (fullSpine) {
      section1.append(el('div', { class: 'meas-note' },
        'C7–S1 SVA: C7 body centroid to the S1 posterosuperior corner, parallel to the image horizontal; positive anterior. Review the C7 centroid and both S1 endplate corners.'));
      const cervicalSection = section('02 — CERVICAL ALIGNMENT',
        el('div', { class: 'meas-rows' }, ...cervicalRows(pending ? { region: 'full_spine' } : study, state.selectedLevel)
          .map(row => rowButton(row, () => toggleLevel(row.key), otherCervical(row)))),
        el('div', { class: 'meas-note' }, 'Only measurements with visible, usable landmarks are shown. Review C2/C7 endplates and the C2 centroid.'));
      root.append(section1, cervicalSection, lumbarSection, segmentalSection, section2, calibrationSection);
    } else if (cervical) {
      section1.append(el('div', { class: 'meas-note' },
        'Cobb: unsigned acute angle between the C2 and C7 inferior endplates. SVA: C2 body centroid to the C7 posterosuperior corner, parallel to the image horizontal; positive anterior. Verify the editable endplates and centroid.'));
      root.append(section1, segmentalSection, calibrationSection);
    } else root.append(section1, segmentalSection, section2, section3, calibrationSection);

    // Focus restore. Find the rebuilt node carrying the same data-row-key and
    // refocus it, so there is no rendered frame in which focus visibly rests on
    // <body>. If the previously-focused row itself disappeared -- collapsing the
    // lordosis disclosure removes a focused lordosis row -- fall back to the
    // disclosure button, which always exists, rather than leaving focus on <body>.
    if (focusKey !== null) {
      let restoreTarget = null;
      for (const candidate of root.querySelectorAll('[data-row-key]')) {
        if (candidate.getAttribute('data-row-key') === focusKey) {
          restoreTarget = candidate;
          break;
        }
      }
      if (!restoreTarget) {
        restoreTarget = root.querySelector('[data-row-key="__disclosure"]');
      }
      if (restoreTarget && typeof restoreTarget.focus === 'function') restoreTarget.focus();
    }
  }

  return { updateMeasurements };
}
