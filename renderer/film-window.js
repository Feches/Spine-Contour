/**
 * The view's window / level (gate feedback G3 and G4, 2026-10-11; plan D15-D17, after D1 and D11): the one place that
 * writes `state.filmWindow`. Display only: nothing here reaches a measurement, the study's geometry or the label
 * record, and nothing is persisted. The window belongs to the VIEW, like zoom and pan: it resets where zoom and pan
 * reset (FRESH_VIEW in screens/studies.js and data/demo-visibility.js: another film opened from the list, or the open
 * study closed); Back and the sidebar's return keep it, as they keep zoom and pan (R29); entering or leaving edit mode
 * keeps it. The stage asks for it from the toolbar's Window / level button and the right-button drag
 * (components/viewer.js); the pure rules are viewer/window-level.js.
 *
 * The screen hands in its film loader through configureFilmWindow: screens/analysis.js ensureFilm, which decodes the
 * original through POST /decode and caches it on the image cache entry as `images.raw`, never in the store. A kept
 * window never outlives that decode (R35): when the film is mounted again over images without it, the screen asks
 * windowNeedsDecode and calls redecodeKeptWindow. This file never imports components/viewer.js or screens/analysis.js,
 * which both import it. Store subscribers never call it. Covered by test/film-window.test.js through the real store;
 * the stage by tools/smoke/smoke-levels.mjs.
 */
import { getState, setState } from './store.js';
import { defaultWindow, windowRange, clampWindow } from './viewer/window-level.js';

/** The store key `state.filmWindow`: null until the window is first asked for on the open film, else:
 * @typedef {Object} FilmWindow
 *  @property {string} studyId                                       the film it belongs to; a decode for another lands nowhere
 *  @property {boolean} open                                         the panel is showing
 *  @property {'loading'|'ready'|'unavailable'} status
 *  @property {string|null} reason                                   display-ready, when unavailable
 *  @property {number} width  @property {number} level
 *  @property {number} defaultWidth  @property {number} defaultLevel the film's own window (window-level.js defaultWindow)
 *  @property {number} min  @property {number} max                   the decoded value range
 *  @property {{widthMin: number, widthMax: number, levelMin: number, levelMax: number}|null} range
 *                                                                   the slider and drag bounds (windowRange), null until ready
 */

const FILM_UNREADABLE = 'The original film could not be loaded.';

// ---------------------------------------------------------------------------
// What the screen supplies.

const deps = { ensureFilm: null };

/**
 * @param {{ensureFilm: (studyId: string) => Promise<{images: object|null, raw: object|null, reason: string|null,
 *   superseded: boolean}>}} wiring
 */
export function configureFilmWindow({ ensureFilm }) {
  deps.ensureFilm = ensureFilm;
}

// ---------------------------------------------------------------------------
// Reading the store.

/** The window of `study`, the study on the stage, or null: a window another film left behind is never this one's. */
export function windowFor(state, study) {
  const wl = state.filmWindow;
  return wl && study && wl.studyId === study.id ? wl : null;
}

// The open study's window. Every action below works on this one and no other.
function currentWindow(state) {
  const wl = state.filmWindow;
  return wl && state.openId && wl.studyId === state.openId ? wl : null;
}

/**
 * (Ruling R35) Whether `study`'s film must be decoded again for the window the view kept: the window is ready or
 * loading, and `images`, the film's cached images (null when the single cache entry went to another study, for
 * instance that study's interactive run completing while this film was off screen), carry no decoded original. A
 * ready window over the stored image alone would put W / L on the chip and in the panel while the film layer draws
 * the stored image. An unavailable window claims nothing. screens/analysis.js asks this as it mounts the film.
 */
export function windowNeedsDecode(state, study, images) {
  const wl = windowFor(state, study);
  return Boolean(wl && (wl.status === 'ready' || wl.status === 'loading') && !images?.raw);
}

// ---------------------------------------------------------------------------
// The decode.

let loadSeq = 0;               // the newest decode; only it may land
let pending = Promise.resolve(); // that decode, for a second caller while it is loading

function loadingWindow(studyId, open) {
  return { studyId, open, status: 'loading', reason: null, width: 0, level: 0, defaultWidth: 0, defaultLevel: 0, min: 0, max: 0, range: null };
}

// A new loading window for the open study, then its decode. Not for a demo study, which has no film, nor with no
// study open.
function startLoading(open) {
  const state = getState();
  const study = state.openId ? state.studies.find((item) => item.id === state.openId) : null;
  if (!study || study.source === 'demo') return Promise.resolve();
  setState({ filmWindow: loadingWindow(study.id, open) });
  const seq = ++loadSeq;
  pending = decode(study.id, seq);
  return pending;
}

// The screen's ensureFilm for one film. A superseded result is not a failure: the cache entry was replaced under the
// call, so it is asked again, a few times. A throw is an outcome with its message as the reason.
async function askFilm(studyId) {
  let outcome = null;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      outcome = typeof deps.ensureFilm === 'function' ? await deps.ensureFilm(studyId) : null;
      if (!outcome?.superseded) break;
    }
  } catch (error) {
    outcome = { images: null, raw: null, reason: error?.message || null, superseded: false };
  }
  return outcome;
}

async function decode(studyId, seq) {
  const outcome = await askFilm(studyId);
  // Lands only as the newest decode, on the loading window it was started for, while that film is still open:
  // FRESH_VIEW, another study opened or forgetFilmWindow has already put it out of reach.
  const state = getState();
  const wl = state.filmWindow;
  if (seq !== loadSeq || !wl || wl.studyId !== studyId || wl.status !== 'loading' || state.openId !== studyId) return;
  const usable = outcome && !outcome.superseded ? outcome : null;
  const raw = usable?.raw ?? null;
  if (raw) {
    const range = windowRange(raw);
    const start = defaultWindow(raw);
    setState({ filmWindow: {
      ...wl, status: 'ready', reason: null, width: start.width, level: start.level,
      defaultWidth: start.width, defaultLevel: start.level, min: raw.valueMin, max: raw.valueMax, range,
    } });
  } else {
    setState({ filmWindow: { ...wl, status: 'unavailable', reason: usable?.reason || FILM_UNREADABLE } });
  }
}

// ---------------------------------------------------------------------------
// The actions. Each writes only a change, and always a new object.

/**
 * The toolbar's Window / level button, in every mode: the panel for the open study. A window loading or ready just
 * shows; none, or an unavailable one, decodes again. Resolves once that decode has landed (or at once).
 */
export function openWindowPanel() {
  const wl = currentWindow(getState());
  if (wl && (wl.status === 'ready' || wl.status === 'loading')) {
    if (!wl.open) setState({ filmWindow: { ...wl, open: true } });
    return wl.status === 'loading' ? pending : Promise.resolve();
  }
  return startLoading(true);
}

/**
 * The right-button drag (D16): the same decode without the panel. Only when the open film has no window yet; an
 * unavailable one is not tried again from here (ruling R30): the panel says why, and opening it tries again.
 */
export function ensureWindowLoaded() {
  const wl = currentWindow(getState());
  if (wl) return wl.status === 'loading' ? pending : Promise.resolve();
  return startLoading(false);
}

/** The panel's DONE, the toolbar button again, and Escape: the panel goes, the window stays. */
export function closeWindowPanel() {
  const wl = currentWindow(getState());
  if (wl?.open) setState({ filmWindow: { ...wl, open: false } });
}

/** A slider, a drag (left with the panel open, right in every mode): clamped to the film's range; only once decoded. */
export function setWindow({ width, level }) {
  const wl = currentWindow(getState());
  if (!wl || wl.status !== 'ready' || !wl.range) return;
  const next = clampWindow({ width, level }, wl.range);
  if (next.width !== wl.width || next.level !== wl.level) setState({ filmWindow: { ...wl, ...next } });
}

/** The panel's RESET and a double right-click (D17): the film's own default window. */
export function resetWindow() {
  const wl = currentWindow(getState());
  if (wl?.status === 'ready') setWindow({ width: wl.defaultWidth, level: wl.defaultLevel });
}

/**
 * A study whose film is about to change or go (deleted, a run completed on it, its Region changed, released): its
 * window goes, so the next open decodes again. Never from a subscriber.
 */
export function forgetFilmWindow(studyId) {
  if (getState().filmWindow?.studyId === studyId) setState({ filmWindow: null });
}

/**
 * (Ruling R35) The mount's call when windowNeedsDecode says so: ensureFilm again, which restores the film's stored
 * image when it has a result, attaches the decoded original and hands both to the live viewer, so the kept window is
 * drawn again as it was (the window itself is not touched). A superseded outcome is asked again, as the panel's decode
 * does. When no original comes back, a READY window of that film is forgotten, so the chip and the panel never claim a
 * window the film layer does not draw; a loading one is left to its own decode, which lands it ready or unavailable
 * with its reason. Resolves once that has happened.
 */
export async function redecodeKeptWindow(studyId) {
  const outcome = await askFilm(studyId);
  if (outcome?.raw && !outcome.superseded) return;
  const wl = getState().filmWindow;
  if (wl?.studyId === studyId && wl.status === 'ready') forgetFilmWindow(studyId);
}
