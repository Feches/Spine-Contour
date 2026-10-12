/**
 * The Vertebral levels panel (plan 2026-10-10 Task 11; handoff §3 "Panel", §6, §10). In edit mode it takes the
 * place of the Analysis screen's tabs, actions row and Measurements panel (screens/analysis.js toggles the hosts).
 *
 * DOM only. It reads `state.levelEditor` and the open study, and every handler calls an export of the wiring
 * module, renderer/level-editor.js, which is the one writer of `state.levelEditor`. update() never calls setState.
 * The words come from data/levels.js (summaryText, groupCountText, badgeFor, trainingStatus, unsavedText,
 * dependencyNote) so the panel, the tests and the label record read one source; the swatches take the canvas's own
 * LEVEL_RGB and FEMORAL_OVERLAY_COLOR, so the panel and the overlay never disagree on a level's colour.
 *
 * Every focusable control carries a `data-level-key`, which is what the focus restore matches on after a rebuild
 * (the pattern of components/measurements.js), and what the smoke suite drives.
 */
import { el, clear } from '../dom.js';
import { checkbox } from './checkbox.js';
import {
  LEVEL_GROUPS, kindOf, rowName, fullName, levelState, badgeFor, summaryText, groupCountText, groupCheckState,
  trainingStatus, unsavedCount, unsavedText, canSave, dependencyNote,
} from '../data/levels.js';
import { LEVEL_RGB, FEMORAL_OVERLAY_COLOR } from '../viewer/canvas.js';
import {
  toggleLevelVisible, toggleLevelGroup, toggleGroupOpen, selectLevelRow, startPlace, cancelPlace, clearPlacedLevel,
  saveLevelEdits, discardLevelEdits, keepEditing,
} from '../level-editor.js';

const TITLE = 'Vertebral levels';
const HELP = "Uncheck a level you can't see on this film. It's saved as not visible, not as missing.";
const DEMO_NOTE = 'Demo studies are not exported';
const ELLIPSIS = '…';

// 12x12 chevron pointing down (open); .is-closed rotates it -90deg in CSS. The house construction of
// sidebar.js's and clinical-data.js's chevrons, with the path the handoff's prototype uses.
const CHEVRON_SVG = '<svg class="lv-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>';

// dom.js's el() creates HTML elements, so the SVG is parsed from markup; its node keeps the class.
function chevron(closed) {
  const holder = document.createElement('span');
  holder.innerHTML = CHEVRON_SVG;
  const svg = holder.firstElementChild;
  if (closed) svg.classList.add('is-closed');
  return svg;
}

// A level's overlay colour as CSS, from the canvas's table: the femoral heads share the femoral green.
function levelColor(code) {
  const rgb = kindOf(code) === 'circle' ? FEMORAL_OVERLAY_COLOR : LEVEL_RGB[code];
  return rgb ? `rgb(${rgb.join(', ')})` : 'var(--muted)';
}

function sameKey(a, b) {
  return a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i]);
}

function unsavedPrompt(n) {
  return `Discard ${n} unsaved ${n === 1 ? 'change' : 'changes'}? Saved edits are kept.`;
}

// ---------------------------------------------------------------------------
// One level row (handoff §3 "Level row", §6): the visible checkbox, the select button with its swatch, name and
// badge, the 70px action column, and under an unchecked row the measurements it leaves as a dash.

function levelRow(editor, code) {
  const entry = editor.levels[code];
  const state = levelState(entry, editor.model?.[code] ?? null);
  const placing = editor.placing?.code === code;
  const selected = editor.selected === code;
  const circle = kindOf(code) === 'circle';
  const name = fullName(code);
  const badge = badgeFor(state, placing);
  const color = levelColor(code);

  // Filled in the level colour once it is visible and placed; hollow in the level colour while it waits to be
  // placed; hollow in --border while it is not visible.
  const swatch = el('span', { class: 'lv-swatch', 'aria-hidden': 'true' });
  swatch.style.background = entry.visible && entry.geometry ? color : 'transparent';
  swatch.style.borderColor = entry.visible ? color : 'var(--border)';

  // Place… for a level with nothing placed, or for any visible femoral head (rim points refit it); CLEAR for a level
  // placed by hand; CANCEL alone while it is being placed, which also covers a head placed by hand being re-placed
  // (a CLEAR there would leave the placement running with nothing to clear). A head placed by hand takes both
  // Place… and CLEAR (ruling R18): `is-stacked` lays them out as a column, Place… above CLEAR, in the same 70px.
  const canPlace = !placing && (state === 'not_placed' || (circle && entry.visible));
  const canClear = !placing && state === 'manual';
  const actions = el('div', { class: `lv-actions${canPlace && canClear ? ' is-stacked' : ''}` },
    canPlace ? el('button', {
      type: 'button',
      class: 'btn btn-small lv-place',
      'aria-label': circle ? `Place rim points for ${name}` : `Place ${name}`,
      'data-level-key': `place:${code}`,
      onClick: () => startPlace(code),
    }, `Place${ELLIPSIS}`) : null,
    canClear ? el('button', {
      type: 'button',
      class: 'lv-text-btn lv-clear',
      'aria-label': `Clear the placed ${name}`,
      title: `Clear the placed ${name}`,
      'data-level-key': `clear:${code}`,
      onClick: () => clearPlacedLevel(code),
    }, 'CLEAR') : null,
    placing ? el('button', {
      type: 'button',
      class: 'lv-text-btn lv-cancel',
      'aria-label': `Cancel placing ${name}`,
      'data-level-key': `cancel:${code}`,
      onClick: () => cancelPlace(),
    }, 'CANCEL') : null);

  const row = el('div', {
    class: `lv-row${selected ? ' is-selected' : ''}${entry.visible ? '' : ' is-hidden-level'}`,
    'data-level-row': code,
  },
    checkbox({
      key: `visible:${code}`,
      keyAttr: 'data-level-key',
      label: null,
      variant: 'level',
      ariaLabel: `${name} visible on film`,
      checked: entry.visible,
      onChange: () => toggleLevelVisible(code),
    }),
    el('button', {
      type: 'button',
      class: 'lv-select',
      'aria-pressed': selected ? 'true' : 'false',
      'data-level-key': code,
      onClick: () => selectLevelRow(code),
    },
      swatch,
      el('span', { class: 'lv-name' }, rowName(code)),
      el('span', { class: 'lv-spacer' }),
      el('span', { class: badge.className }, el('span', { class: 'dot' }), badge.label)),
    actions);

  const note = entry.visible ? null : dependencyNote(code, editor.region);
  return note ? [row, el('p', { class: 'lv-note' }, note)] : [row];
}

// ---------------------------------------------------------------------------
// One group (handoff §3 "Group row"): the tri-state checkbox, the disclosure button, and the rows while open.

function groupSection(editor, group) {
  const check = groupCheckState(editor, group.key);
  const all = check === 'all';
  const open = Boolean(editor.open?.[group.key]);
  return el('section', { class: 'lv-group', 'data-group-key': group.key },
    el('div', { class: 'lv-group-row' },
      checkbox({
        key: `group:${group.key}`,
        keyAttr: 'data-level-key',
        label: null,
        variant: 'level',
        // Says what a click does (handoff §10): with every level visible it hides them all, else it shows them all.
        ariaLabel: `${group.title}: mark every level ${all ? 'not visible' : 'visible'}`,
        checked: all,
        indeterminate: check === 'mixed',
        onChange: () => toggleLevelGroup(group.key),
      }),
      el('button', {
        type: 'button',
        class: 'lv-group-btn',
        'aria-expanded': open ? 'true' : 'false',
        'data-level-key': `open:${group.key}`,
        onClick: () => toggleGroupOpen(group.key),
      },
        el('span', { class: 'lv-group-title' }, group.title),
        el('span', { class: 'lv-group-range' }, group.range),
        el('span', { class: 'lv-spacer' }),
        el('span', { class: 'lv-group-count' }, groupCountText(editor, group.key)),
        chevron(!open))),
    open ? el('div', { class: 'lv-rows' }, ...group.codes.flatMap((code) => levelRow(editor, code))) : null);
}

// ---------------------------------------------------------------------------
// The footer (handoff §3 "Footer"; D7, D10): the training-label status, then the unsaved count with Discard and
// Save edits, or, once leaving was asked for with changes unsaved, the three-button prompt in their place.

function footer(editor, study) {
  const status = trainingStatus(editor);
  const n = unsavedCount(editor);
  const statusLine = el('div', { class: 'lv-status' },
    el('span', { class: `lv-status-dot${status.complete ? ' is-complete' : ''}`, 'aria-hidden': 'true' }),
    el('div', { class: 'lv-status-body' },
      el('span', { class: 'lv-status-label' }, status.label),
      el('span', { class: `lv-status-text${status.complete ? '' : ' is-incomplete'}` }, status.text)));

  // The wiring drops the prompt once nothing is unsaved (I1); its Save edits still follows canSave, as the action
  // row's does, so it is never an enabled button that does nothing.
  const actions = editor.exitPrompt
    ? el('div', { class: 'lv-prompt', role: 'group', 'aria-labelledby': 'lv-prompt-text' },
      el('p', { class: 'lv-prompt-text', id: 'lv-prompt-text' }, unsavedPrompt(n)),
      el('div', { class: 'lv-prompt-actions' },
        el('button', {
          type: 'button', class: 'btn btn-primary btn-small lv-prompt-save', disabled: !canSave(editor),
          'data-level-key': 'prompt:save',
          onClick: () => saveLevelEdits(),
        }, 'Save edits'),
        el('button', {
          type: 'button', class: 'btn btn-small lv-prompt-discard', 'data-level-key': 'prompt:discard',
          onClick: () => discardLevelEdits(),
        }, 'Discard'),
        el('button', {
          type: 'button', class: 'btn btn-small lv-prompt-keep', 'data-level-key': 'prompt:keep',
          onClick: () => keepEditing(),
        }, 'Keep editing')))
    : el('div', { class: 'lv-actions-row' },
      el('span', { class: 'lv-unsaved' }, unsavedText(n)),
      // Demo studies cannot enter edit mode (they have no film), so this never shows today; the wiring refuses
      // their save with the same words.
      study?.source === 'demo' ? el('span', { class: 'lv-demo-note' }, DEMO_NOTE) : null,
      el('button', {
        type: 'button', class: 'btn btn-small lv-discard', disabled: n === 0, 'data-level-key': 'discard',
        onClick: () => discardLevelEdits(),
      }, 'Discard'),
      // D10: a study with no record yet may save once with nothing changed (it confirms the model output), so the
      // status can read NOTHING TO SAVE while Save edits is enabled.
      el('button', {
        type: 'button', class: 'btn btn-primary btn-small lv-save', disabled: !canSave(editor), 'data-level-key': 'save',
        onClick: () => saveLevelEdits(),
      }, 'Save edits'));

  return el('div', { class: 'lv-foot' }, statusLine, actions);
}

// ---------------------------------------------------------------------------
// Focus after a rebuild. The same key first; when that control is gone or disabled (Place… becomes CANCEL, CLEAR
// becomes Place…, the prompt closes, Save edits disables itself after a save), the nearest control that stands
// for the same thing, then the selected row, then the first control, so focus never drops to <body> from inside
// the panel: the stage's keyboard handler reads a Tab from <body> as "cycle the handles".

function fallbackKeys(key) {
  const colon = key.indexOf(':');
  const kind = colon === -1 ? key : key.slice(0, colon);
  const rest = colon === -1 ? '' : key.slice(colon + 1);
  switch (kind) {
    case 'place': return [`cancel:${rest}`, rest];
    case 'cancel': return [`place:${rest}`, rest];
    case 'clear': return [`place:${rest}`, rest];
    case 'visible': return [rest];
    case 'prompt': return ['save', 'discard'];
    case 'save': return ['discard'];
    case 'discard': return ['save'];
    default: return [];
  }
}

function focusable(node) {
  return Boolean(node) && typeof node.focus === 'function' && !node.disabled;
}

function restoreFocus(root, focusKey, editor) {
  const byKey = new Map([...root.querySelectorAll('[data-level-key]')].map((node) => [node.getAttribute('data-level-key'), node]));
  for (const key of [focusKey, ...fallbackKeys(focusKey), editor.selected]) {
    const node = key ? byKey.get(key) : null;
    if (focusable(node)) {
      node.focus({ preventScroll: true });
      return;
    }
  }
  const first = [...byKey.values()].find(focusable);
  if (first) first.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------

export function mountLevelEditor(container) {
  clear(container);
  const root = el('div', { class: 'lv-panel' });
  container.append(root);

  let lastKey = null;
  let lastStudyId = null;
  let promptShown = false;

  function update(state, study) {
    const editor = state.levelEditor;
    // Rebuild gate. screens/analysis.js calls this on every store notification, pan and window / level drag
    // frames included. The key is every field this panel reads: the editor's, field by field, and the study's id
    // and source. The focused handle replaces `state.levelEditor` on every Tab press and changes nothing here (a
    // window / level drag no longer touches the editor at all: the window is the view's, `state.filmWindow`,
    // since gate feedback G3), and a rebuild between a press and its release would swallow the click that
    // press began. The study's geometry and its pending measurement are left out (the final review's minor 6):
    // the panel reads neither, and keying on them rebuilt it twice per /measure round trip.
    const key = [
      editor?.studyId, editor?.region, editor?.levels, editor?.model, editor?.baseline, editor?.record,
      editor?.selected, editor?.placing, editor?.open, editor?.exitPrompt,
      study?.id, study?.source,
    ];
    if (sameKey(key, lastKey)) return;
    lastKey = key;

    // Focus and scroll snapshots: clear(root) destroys the focused control, and a new list starts at the top.
    // Only a key from inside this panel is taken, so a rebuild never pulls focus from elsewhere on the page.
    const active = document.activeElement;
    const focusKey = active && root.contains(active) ? active.getAttribute('data-level-key') : null;
    const oldList = root.querySelector('.lv-list');
    const scrollTop = oldList && editor && editor.studyId === lastStudyId ? oldList.scrollTop : 0;

    clear(root);
    if (!editor || !study || editor.studyId !== study.id) {
      lastStudyId = null;
      promptShown = false;
      return;
    }
    lastStudyId = editor.studyId;

    const list = el('div', { class: 'lv-list' }, ...LEVEL_GROUPS.map((group) => groupSection(editor, group)));
    root.append(
      el('div', { class: 'lv-head' },
        el('h2', { class: 'lv-title' }, TITLE),
        el('div', { class: 'lv-summary' }, summaryText(editor)),
        el('p', { class: 'lv-help' }, HELP)),
      list,
      footer(editor, study));
    if (scrollTop) list.scrollTop = scrollTop;

    // `indeterminate` is a property with no markup form, so it is written on the live boxes after the rebuild.
    for (const group of LEVEL_GROUPS) {
      const input = root.querySelector(`[data-level-key="group:${group.key}"]`);
      if (input) input.indeterminate = groupCheckState(editor, group.key) === 'mixed';
    }

    // A prompt that has just appeared takes focus on Keep editing (D7), wherever focus was: DONE, Escape and Back
    // all ask from outside the panel. Otherwise focus goes back where it was.
    const showPrompt = Boolean(editor.exitPrompt);
    const keep = showPrompt && !promptShown ? root.querySelector('[data-level-key="prompt:keep"]') : null;
    promptShown = showPrompt;
    if (keep) keep.focus({ preventScroll: true });
    else if (focusKey !== null) restoreFocus(root, focusKey, editor);
  }

  return { update };
}
