/**
 * Showing and hiding the compiled-in demo studies (studies-table spec 2026-09-10, section 9). Pure: the
 * store patch for either direction, tested; renderer/demo-studies.js writes the preference and
 * applies the patch. Only a development build ever calls this -- the toggle is not built when the
 * main process did not allow demos -- but the patch itself does not know or care.
 */
import { merge } from './persistence.js';
import { withIds } from './parameters.js';

// Every path that changes openId resets the per-study view state, so a study never inherits the
// previous one's zoom, pan, selection or edit mode. The same seven keys as screens/studies.js's
// FRESH_VIEW, repeated here because data/ never imports from screens/. Exported so
// test/demo-visibility.test.js can pin the two copies equal.
export const FRESH_VIEW = { selectedLevel: null, zoom: 1, panX: 0, panY: 0, panMode: false, editing: false, selection: null };

export function demoStudiesShown(state) {
  return (state?.studies ?? []).some((study) => study.source === 'demo');
}

// The patch that shows or hides the demos. Showing appends the nine after the real studies
// (merge's order); hiding removes them, prunes their ids from the shared selection, and closes a
// demo that was open or held for comparison -- what "Delete all studies" did for them before
// (HANDOFF reconcile, 2026-09-08). Already in the asked-for state: an empty patch.
export function demoVisibilityPatch(state, shown) {
  if (demoStudiesShown(state) === shown) return {};
  const real = state.studies.filter((study) => study.source === 'real');
  if (shown) return { studies: merge(real) };
  const demoIds = state.studies.filter((study) => study.source === 'demo').map((study) => study.id);
  const gone = new Set(demoIds);
  return {
    studies: real,
    paramSelected: withIds(state.paramSelected ?? [], demoIds, false),
    ...(gone.has(state.openId) ? { openId: null, screen: 'studies', ...FRESH_VIEW } : {}),
    ...(gone.has(state.compareId) ? { compareId: null } : {}),
  };
}
