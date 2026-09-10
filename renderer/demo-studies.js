/**
 * The Settings toggle's wiring (studies-table spec 2026-09-10, section 9): write the preference through the
 * bridge, then apply data/demo-visibility.js's patch. Module scope, like renderer/batch.js; the
 * sidebar calls it from a click handler, never from inside a store notification.
 */
import { getState, setState } from './store.js';
import { demoStudiesAllowed, setDemoStudiesHidden } from './api.js';
import { showToast } from './components/toast.js';
import { demoVisibilityPatch } from './data/demo-visibility.js';

export { demoStudiesShown } from './data/demo-visibility.js';

// Whether the toggle exists at all: the main process reports demoStudies only for a development
// build (`!app.isPackaged`), so an installed build never renders it.
export function demoToggleAvailable() {
  return demoStudiesAllowed();
}

// Resolves true when the library was changed. Refuses while a run, a batch or a bulk delete is
// up, as the processing settings do. The preference write comes FIRST; a failure toasts but does
// not stop the session-level change -- the terms changePerformance's own save uses.
export async function setDemoStudiesShown(shown) {
  const live = getState();
  if (!demoStudiesAllowed()) return false;
  if (live.running || live.batch || live.deletingStudies) return false;
  try {
    await setDemoStudiesHidden(!shown);
  } catch (error) {
    showToast(`Demo studies ${shown ? 'shown' : 'hidden'} this session, but the setting could not be saved: ${error.message}`);
  }
  setState((current) => demoVisibilityPatch(current, shown));
  return true;
}
