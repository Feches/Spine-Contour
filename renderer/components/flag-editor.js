/**
 * The flag chips and the flag editor (2026-11-16, study flags; spec sections 3 and 4.3): DOM only. The screen
 * (screens/studies.js for the Find list's FLAGS cell, the Analysis side panel) owns the draft, the typed text, the
 * suggestions, the highlighted choice, the store writes and the focus; every change here is reported through a callback
 * and the screen repaints it. Nothing in this file holds state or moves focus.
 *
 * `flagChips(flags)` is the resting view: one chip per flag, or a muted dash when there are none (never a blank cell).
 * `flagEditor(...)` returns two nodes, because the popup is placed by the screen (it must escape the cell's overflow):
 * `field` is the chips with a x each, then the text box; `popup` is the suggestion list and its hint line.
 *
 * Keys (all stop here): Enter adds the highlighted choice (`active` >= 0); with nothing highlighted it closes
 * (`onDone`) when the box is empty, adds the typed text when it cleans to a flag the film does not already hold, and
 * otherwise does nothing (ruling 6 as amended, 2026-11-16, the final review: a silent no-op on typed text read as
 * broken). `active` is -1 when nothing is highlighted
 * (the screen passes -1 while the box is empty, 0 once the person types); ArrowUp and ArrowDown move it within
 * -1 ... choices.length - 1. Escape cancels; Backspace in an empty box removes the last flag. At the flag limit
 * (`full`) the box is readOnly, not disabled, so it still takes focus and these keys and `onLeave` still fire.
 *
 * A comma, a semicolon or a line break typed or pasted into the box adds the pieces before it AS TYPED, never the
 * highlighted suggestion (ruling 16, 2026-11-16): `onAdd(flags, rest)`, where `rest` is the pieces that are not flags
 * (data/flags.js splitTypedKeep), which stay in the box so the person sees what was refused. While the box holds text
 * that cannot be a flag, the hint line says why (flagTextProblem) in the accent colour, in place of ENTER ADDS.
 *
 * Every control carries `keyAttr` (the screen's hook name, data-find-key on the Find list), so the screen's focus
 * snapshot can hand focus back to the same control after the table rebuilds, and `onLeave` can name where focus went.
 */
import { el } from '../dom.js';
import { splitTyped, splitTypedKeep, flagTextProblem, sameFlag } from '../data/flags.js';

const DASH = '—';

export function flagChips(flags) {
  if (!flags || flags.length === 0) return el('span', { class: 'flag-none' }, DASH);
  return el('div', { class: 'flag-chips' },
    flags.map((flag) => el('span', { class: 'flag-chip', title: flag }, el('span', { class: 'flag-chip-text' }, flag))));
}

// `draft` is the flags as edited so far, `text` the box's text, `choices` data/flags.js flagChoices' { kind, flag }[]
// ('use' or 'create') and `active` the highlighted index (-1 for none), `full` that the film holds the most flags it
// may (the box is then read-only, still focusable). Callbacks:
// onText(value), onAdd(flags[], rest = ''), onRemove(index), onActive(index), onDone(), onCancel(), onLeave(relatedKey | null).
export function flagEditor({
  keyAttr, keyPrefix, ariaLabel, draft = [], text = '', choices = [], active = -1, full = false,
  onText, onAdd, onRemove, onActive, onDone, onCancel, onLeave,
}) {
  // Focus stays in the box while the popup or a x is pressed. It is the prevented MOUSEDOWN, not pointerdown, that
  // stops the input blurring, so a click on a suggestion does not close the editor before the click lands.
  const keepFocus = (event) => event.preventDefault();
  const stop = (event) => event.stopPropagation();
  const swallow = (event) => { event.preventDefault(); event.stopPropagation(); };

  const input = el('input', {
    type: 'text', class: 'flag-editor-input', spellcheck: false, value: text,
    [keyAttr]: `${keyPrefix}-input`, 'aria-label': ariaLabel,
    readOnly: full || undefined, placeholder: full ? '20 flags' : undefined,
    onInput: (event) => {
      const value = event.target.value;
      // (2026-11-16, the final review, I2) The pieces that are not flags stay in the box instead of being discarded.
      if (/[,;\r\n]/.test(value)) {
        const { flags, rest } = splitTypedKeep(value);
        onAdd(flags, rest);
      } else onText(value);
    },
    onKeydown: (event) => {
      if (event.key === 'Enter') {
        swallow(event);
        if (active >= 0 && choices[active]) onAdd([choices[active].flag]);
        else if (input.value === '') onDone();
        else {
          // (Ruling 6 as amended, 2026-11-16) Typed text that is a flag the film does not hold is added as typed.
          const typed = splitTyped(input.value).filter((flag) => !draft.some((held) => sameFlag(held, flag)));
          if (typed.length > 0) onAdd(typed);
        }
      } else if (event.key === 'Escape') {
        swallow(event);
        onCancel();
      } else if (event.key === 'Backspace' && input.value === '' && draft.length > 0) {
        swallow(event);
        onRemove(draft.length - 1);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        swallow(event);
        if (choices.length === 0) return;
        const next = event.key === 'ArrowDown' ? active + 1 : active - 1;
        onActive(Math.max(-1, Math.min(choices.length - 1, next)));
      }
    },
    // The SUBJECT editor's rule (screens/studies.js subjectCell onBlur): relatedTarget is read HERE, mid-transition,
    // and the leave is judged in a microtask. A repaint that replaces this node blurs it too, but then the node is
    // disconnected in the microtask, and that is a rebuild, not a person leaving: it must not save half a flag.
    onBlur: (event) => {
      const key = event.relatedTarget instanceof Element ? event.relatedTarget.getAttribute(keyAttr) : null;
      queueMicrotask(() => {
        if (!input.isConnected) return;
        onLeave(key);
      });
    },
  });

  // A press on the field's own padding or a chip's text would blur the box and so close the editor; it keeps focus in
  // the box instead (the x buttons do the same through their own mousedown).
  const field = el('div', {
    class: 'flag-editor', onClick: stop,
    onMousedown: (event) => { if (event.target !== input) { event.preventDefault(); input.focus(); } },
  },
    draft.map((flag, index) => el('span', { class: 'flag-chip', title: flag },
      el('span', { class: 'flag-chip-text' }, flag),
      el('button', {
        type: 'button', class: 'flag-chip-remove', 'aria-label': `Remove ${flag}`, [keyAttr]: `${keyPrefix}-remove-${index}`,
        onMousedown: keepFocus, onClick: (event) => { stop(event); onRemove(index); },
      }, '×'))),
    input);

  const problem = flagTextProblem(text);
  const popup = el('div', { class: 'flag-popup', onMousedown: keepFocus, onClick: stop },
    el('div', { class: 'flag-popup-options' },
      choices.map((choice, index) => el('button', {
        type: 'button', class: `flag-option${index === active ? ' is-active' : ''}`, [keyAttr]: `${keyPrefix}-option-${index}`,
        onMousedown: keepFocus, onClick: (event) => { stop(event); onAdd([choice.flag]); },
      }, choice.kind === 'create' ? `Create "${choice.flag}"` : choice.flag))),
    // (2026-11-16, the final review, I2) Text that cannot be a flag is refused out loud, not silently.
    problem
      ? el('div', { class: 'flag-popup-hint is-refused', role: 'status' }, problem)
      : el('div', { class: 'flag-popup-hint' }, 'ENTER ADDS · ESC CANCELS'));

  return { field, popup };
}

/**
 * (2026-11-16, the final review, M2) Scrolls the popup's suggestion list, and only that list, so the highlighted option
 * is inside its visible box. The list scrolls past about eight rows and is rebuilt on every arrow key, so without this
 * ArrowDown could highlight an option nobody can see. Not scrollIntoView: that also scrolls every scrolling ancestor,
 * the page and the table included. Called by the screen once the popup is placed (it needs layout).
 */
export function revealActiveChoice(popup) {
  const list = popup?.querySelector('.flag-popup-options');
  const option = list?.querySelector('.flag-option.is-active');
  if (!list || !option) return;
  const box = list.getBoundingClientRect();
  const row = option.getBoundingClientRect();
  if (row.top < box.top) list.scrollTop -= box.top - row.top;
  else if (row.bottom > box.bottom) list.scrollTop += row.bottom - box.bottom;
}
