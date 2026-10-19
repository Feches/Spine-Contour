/**
 * One Find list header's filter menu (2026-10-19, header filters; spec F1, section 3.2): the menu's DOM only. The
 * screen (screens/studies.js) owns which menu is open, where it sits, the store writes and the focus; every control
 * here reports through a callback. `All` and `None` both clear the column's ticks (spec 3.1: a column never filters
 * to nothing by itself), then one tick box per value the library holds, a divider, the column's two sort directions,
 * and a close button. SUBJECT has no values to tick: its menu holds the "contains" text box in their place, and no
 * `All` / `None`, which would only clear the box.
 *
 * Every control carries a data-find-key (the Global Constraints' hook names), so the screen's focus snapshot can hand
 * focus back to the same control after the table rebuilds behind the menu. The menu does not take focus itself: it is
 * rebuilt with the table on every repaint, and only the screen knows when it has just been opened.
 */
import { el } from '../dom.js';
import { checkbox } from './checkbox.js';

// The 24-unit stroke-icon convention of screens/studies.js's TRASH_SVG and components/viewer.js's toolbar.
const CLOSE_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6 L18 18"></path><path d="M18 6 L6 18"></path></svg>';

// `options` is the column's { value, label }[] (data/find.js findFilterOptions), `ticked` its normalised ticks,
// `subjectText` the SUBJECT box's text, `sortKey` / `sortDir` the list's sort (the matching item reads pressed), and
// `sortLabels` the column's own words for ascending and descending. Escape anywhere in the menu is `onClose`.
export function filterMenu({
  column, label, options = [], ticked = [], subjectText = '', sortKey, sortDir,
  onToggle, onAll, onNone, onSubject, onSort, onClose, sortLabels,
}) {
  const key = (suffix) => `filter-${column}-${suffix}`;
  const values = column === 'subject'
    ? [el('input', {
      type: 'text', class: 'studies-filter-text', value: subjectText, spellcheck: false, placeholder: 'Contains…',
      'aria-label': 'Subject contains', 'data-find-key': key('text'),
      onInput: (event) => onSubject(event.target.value),
    })]
    : [
      el('div', { class: 'studies-filter-quick' },
        el('button', { type: 'button', class: 'studies-filter-item', 'data-find-key': key('all'), onClick: () => onAll() }, 'All'),
        el('button', { type: 'button', class: 'studies-filter-item', 'data-find-key': key('none'), onClick: () => onNone() }, 'None')),
      el('div', { class: 'studies-filter-options' },
        options.map((option) => checkbox({
          key: key(option.value), keyAttr: 'data-find-key', label: option.label, variant: 'menu',
          checked: ticked.includes(option.value), onChange: () => onToggle(option.value),
        }))),
    ];
  const sorts = [['asc', sortLabels[0]], ['desc', sortLabels[1]]].map(([dir, text]) => {
    const active = sortKey === column && sortDir === dir;
    return el('button', {
      type: 'button', class: `studies-filter-item${active ? ' is-active' : ''}`, 'aria-pressed': String(active),
      'data-find-key': `sort-${column}-${dir}`, onClick: () => onSort(dir),
    }, text);
  });
  return el('div', {
    class: 'studies-filter-menu', role: 'dialog', 'aria-label': `Filter by ${label}`, 'data-filter-menu': column,
    onKeydown: (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    },
  },
    ...values,
    el('div', { class: 'studies-filter-divider', role: 'separator' }),
    // The caption is what makes `Reverse` read as a sort; the group carries the same word for a screen reader.
    el('div', { class: 'studies-filter-sort', role: 'group', 'aria-label': 'Sort' },
      el('div', { class: 'studies-filter-caption', 'aria-hidden': 'true' }, 'Sort'), sorts),
    el('button', {
      type: 'button', class: 'icon-btn studies-filter-close', 'data-find-key': key('close'), title: 'Close',
      'aria-label': 'Close', innerHTML: CLOSE_SVG, onClick: () => onClose(),
    }));
}
