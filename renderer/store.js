let state = {
  screen: 'landing',
  ack: false,
  theme: 'light',
  navCollapsed: false,
  settingsOpen: false,

  studies: [],
  query: '',
  // The Studies screen's second tab (pre-op/post-op spec §10). Which tab is up, and the
  // Parameters tab's filters, sort and lordosis-level toggle. Store state rather than screen
  // scope so coming back from Analysis lands on the tab, filters and sort the user left. Each
  // is replaced wholesale on change -- the screen's gate compares by reference.
  studiesTab: 'find',
  paramFilters: { workspace: null, folder: null, segmentedOnly: true },
  paramSort: { key: 'study', dir: 'asc' },
  paramLevels: false,
  // The study ids ticked on the Parameters grid (addendum, 2026-09-07); replaced wholesale;
  // session-only, never persisted.
  paramSelected: [],
  openId: null,
  compareId: null,

  tab: 'meas',
  selectedLevel: null,
  overlays: true,
  overlayOpacity: 50,
  zoom: 1,
  panX: 0,
  panY: 0,
  panMode: false,
  showAllLordosis: false,

  // Which model reads which structure on the next run; see renderer/data/models.js.
  models: { vertebrae: 'unet', femoral: 'unet', s1: 'keypointrcnn' },

  editing: false,
  selection: null,
  running: null, // string|null — the id of the study whose /predict is in flight; one run at a time
  runStage: null,

  wsFolder: null,
  wsFiles: [],
  wsCsv: null,
  wsCsvHeaders: [],
  wsCsvRows: [],
  wsMapping: [],

  fields: [],
  dataOpen: true,
  toast: '',
};

const listeners = new Set();

// True only while setState is iterating listeners for the current update.
// Enforces the architecture contract's rule that subscribers must not call
// setState during notification (see setState below).
let notifying = false;

export function getState() {
  return Object.freeze({ ...state });
}

export function setState(patchOrFn) {
  if (notifying) {
    throw new Error(
      'setState() must not be called from a subscriber; the contract forbids re-entrant updates.'
    );
  }
  const patch = typeof patchOrFn === 'function' ? patchOrFn(state) : patchOrFn;
  state = { ...state, ...patch };
  notifying = true;
  try {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch (error) {
        // One subscriber's throw must not silence the subscribers after it. Before this
        // guard, a TypeError inside a canvas draw function stopped the router's listener
        // too, and the whole UI froze instead of one layer going blank. The re-entrancy
        // error thrown by the nested setState() above is unaffected: it is raised inside
        // the offending subscriber, which is where it belongs.
        console.error('store: subscriber threw during notification', error);
      }
    }
  } finally {
    notifying = false;
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
