/**
 * The tick box both tabs of the Studies screen build (batch spec 7.2): a hidden native checkbox
 * inside a <label>, a drawn box beside it, and optionally a text label with a note. Lifted from
 * screens/parameters.js unchanged in shape, so the grid's row ticks, its select-all and the Find
 * tab's are one control. `keyAttr` names the focus-restore attribute (data-param-key on the grid,
 * data-find-key on the list); `onClick` is bound on the <label>, which is where a click lands --
 * the Find tab uses it to stop the row's own click from opening the study.
 */
import { el } from '../dom.js';

const CHECK_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 7"></path></svg>';

// Real booleans on purpose: el() assigns `checked` as a property, and the string 'false' is true.
// `label: null` builds the bare tick box the tables use (row select and select-all), which carries
// its name in `ariaLabel` instead: a visible label in the STUDY column would repeat the row's own
// name in every row. The hidden input stays inside the <label> so a click anywhere on the box --
// including a synthetic click at the 1x1 input's own rect, which is how the smoke suites drive it
// -- lands on the label and toggles the control.
// `variant: 'level'` (2026-10-10, the level editor's panel) gives the label 'checkbox-row level-check' and none
// of the param-* classes, so the Studies screen's sizing and placement rules never reach it; with no variant
// the output is exactly what it always was. `variant: 'menu'` (2026-10-19, the Find list's header filter menus) does
// the same with 'checkbox-row menu-check', and its text span is 'menu-check-label', since the menu's rows carry text.
const VARIANT_CLASS = { level: 'checkbox-row level-check', menu: 'checkbox-row menu-check' };

export function checkbox({ key, keyAttr = 'data-param-key', label, checked, note, ariaLabel, indeterminate, onChange, onClick, variant }) {
  const input = el('input', {
    type: 'checkbox', checked, [keyAttr]: key, onChange,
    ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
  });
  // A property, not an attribute, and it has no markup form: it must be assigned on the node.
  if (indeterminate === true) input.indeterminate = true;
  return el('label', {
    class: VARIANT_CLASS[variant] ?? `checkbox-row param-check${label === null ? ' param-pick' : ''}`,
    ...(onClick ? { onClick } : {}),
  },
    input,
    el('span', { class: 'checkbox-box', innerHTML: CHECK_SVG }),
    label === null ? null
      : el('span', { class: variant === 'menu' ? 'menu-check-label' : 'param-check-label' }, label, note ? el('span', { class: 'param-check-note' }, note) : null));
}
