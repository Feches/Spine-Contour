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
 * Every control carries `keyAttr` (the screen's hook name, data-find-key on the Find list), so the screen's focus
 * snapshot can hand focus back to the same control after the table rebuilds, and `onLeave` can name where focus went.
 */
import { el } from '../dom.js';
import { splitTyped } from '../data/flags.js';

const DASH = '—';

export function flagChips(flags) {
  if (!flags || flags.length === 0) return el('span', { class: 'flag-none' }, DASH);
  return el('div', { class: 'flag-chips' },
    flags.map((flag) => el('span', { class: 'flag-chip', title: flag }, flag)));
}

// `draft` is the flags as edited so far, `text` the box's text, `choices` the popup's { flag, create? }[] and `active`
// the highlighted index, `full` that the film holds the most flags it may (the box is then disabled). Callbacks:
// onText(value), onAdd(flags[]), onRemove(index), onActive(index), onDone(), onCancel(), onLeave(relatedKey | null).
export function flagEditor({
  keyAttr, keyPrefix, ariaLabel, draft = [], text = '', choices = [], active = 0, full = false,
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
    disabled: full || undefined, placeholder: full ? '20 flags' : undefined,
    onInput: (event) => {
      const value = event.target.value;
      if (/[,;\r\n]/.test(value)) onAdd(splitTyped(value));
      else onText(value);
    },
    onKeydown: (event) => {
      if (event.key === 'Enter') {
        swallow(event);
        if (choices.length > 0) onAdd([choices[active].flag]);
        else onDone();
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
        onActive(Math.max(0, Math.min(choices.length - 1, next)));
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

  const field = el('div', { class: 'flag-editor', onClick: stop },
    draft.map((flag, index) => el('span', { class: 'flag-chip', title: flag },
      flag,
      el('button', {
        type: 'button', class: 'flag-chip-remove', 'aria-label': `Remove ${flag}`, [keyAttr]: `${keyPrefix}-remove-${index}`,
        onMousedown: keepFocus, onClick: (event) => { stop(event); onRemove(index); },
      }, '×'))),
    input);

  const popup = el('div', { class: 'flag-popup', onMousedown: keepFocus, onClick: stop },
    el('div', { class: 'flag-popup-options' },
      choices.map((choice, index) => el('button', {
        type: 'button', class: `flag-option${index === active ? ' is-active' : ''}`, [keyAttr]: `${keyPrefix}-option-${index}`,
        onMousedown: keepFocus, onClick: (event) => { stop(event); onAdd([choice.flag]); },
      }, choice.create ? `Create "${choice.flag}"` : choice.flag))),
    el('div', { class: 'flag-popup-hint' }, 'ENTER ADDS · ESC CANCELS'));

  return { field, popup };
}
