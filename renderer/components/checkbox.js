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
export function checkbox({ key, keyAttr = 'data-param-key', label, checked, note, ariaLabel, indeterminate, onChange, onClick }) {
  const input = el('input', {
    type: 'checkbox', checked, [keyAttr]: key, onChange,
    ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
  });
  // A property, not an attribute, and it has no markup form: it must be assigned on the node.
  if (indeterminate === true) input.indeterminate = true;
  return el('label', {
    class: `checkbox-row param-check${label === null ? ' param-pick' : ''}`,
    ...(onClick ? { onClick } : {}),
  },
    input,
    el('span', { class: 'checkbox-box', innerHTML: CHECK_SVG }),
    label === null ? null
      : el('span', { class: 'param-check-label' }, label, note ? el('span', { class: 'param-check-note' }, note) : null));
}
