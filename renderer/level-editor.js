/**
 * The level editor's wiring (plan 2026-10-10 Task 10): the one place that turns panel and stage events into
 * `state.levelEditor` updates, geometry commits and the label-record save. Module scope, beside batch.js, so an
 * editor outlives the Analysis screen's mount. The level model itself is pure and tested (data/levels.js,
 * data/level-projection.js, viewer/level-handles.js, data/label-record.js); this file only wires it to the store,
 * the api and the toast, and is verified by the smoke suite.
 *
 * This module is the only writer of `state.levelEditor`. FRESH_VIEW (screens/studies.js, data/demo-visibility.js)
 * resets it to null on every change of the open study, which is what the stash below relies on.
 *
 * The screen hands in what it owns through configureLevelEditor: the viewer's measure queue (`commitGeometry`)
 * and prediction snapshots (`getPrediction`), and the analysis screen's film loader (`ensureFilm`) and image facts
 * (`imageInfo`). This file never imports components/viewer.js or screens/analysis.js, which both import it.
 */
import { getState, setState, subscribe } from './store.js';
import { loadLabelRecord, saveLabelRecord, deleteLabelRecord } from './api.js';
import { showToast } from './components/toast.js';
import {
  LEVEL_CODES, openEditor, toggleVisible, toggleGroup, toggleOpen, selectLevel, startPlacing, addPoint, undoPoint,
  cancelPlacing, finishPlacing, clearLevel, setLevelGeometry, unsavedCount, canSave, markSaved, revertToBaseline,
  sameGeometry,
} from './data/levels.js';
import { projectGeometry } from './data/level-projection.js';
import { toLabelRecord, recordLevels, labelFileName, appVersion } from './data/label-record.js';
import { CERVICAL_LEVELS, studyRegion, validAnteriorSide } from './data/cervical.js';
import { isHandPlaced } from './data/predictions.js';
import { fileStem } from './data/labels.js';
import { defaultWindow, windowRange, clampWindow } from './viewer/window-level.js';

const DEMO_NOTE = 'Demo studies are not exported';
const SAVE_FAILED = 'Could not save the label record: ';
const FILM_UNREADABLE = 'The original film could not be loaded.';

// ---------------------------------------------------------------------------
// What the screen supplies.

const deps = { commitGeometry: null, getPrediction: null, ensureFilm: null, imageInfo: null };

/**
 * @param {{commitGeometry: (studyId: string, geometry: object) => void,
 *   getPrediction: (studyId: string) => ({measurements: object, geometry: object, qc: object|null}|undefined),
 *   ensureFilm: (studyId: string) => Promise<{images: object|null, raw: object|null, reason: string|null, superseded: boolean}>,
 *   imageInfo: (studyId: string) => Promise<{file: string, sha256: string, width: number, height: number,
 *     maskPixels: Uint8ClampedArray|null, labels: object|null}>}} wiring
 */
export function configureLevelEditor({ commitGeometry, getPrediction, ensureFilm, imageInfo }) {
  Object.assign(deps, { commitGeometry, getPrediction, ensureFilm, imageInfo });
}

// ---------------------------------------------------------------------------
// The stash: an editor with unsaved changes that left the store without being saved or discarded (another study
// opened through FRESH_VIEW). Kept for the session by study id and reused by enterLevelEditor, so nothing the
// annotator did is lost to a navigation (D7). The subscriber only reads the store and writes this Map; it never
// calls setState. exitNow, saveLevelEdits, discardLevelEdits and forgetLevelEditor delete an entry right after their
// own write, so only a navigation away leaves one behind. A delete, a re-run or a Region change drops the study's
// entry through forgetLevelEditor, so a reused id never inherits another film's levels.

const stash = new Map();
let lastEditor = getState().levelEditor;

subscribe((state) => {
  const editor = state.levelEditor;
  if (editor === lastEditor) return;
  if (lastEditor && !editor && unsavedCount(lastEditor) > 0) stash.set(lastEditor.studyId, lastEditor);
  lastEditor = editor;
});

/** True while a study's unsaved editor is held in the stash (for the smoke suite). */
export function hasStashedEditor(studyId) {
  return stash.has(studyId);
}

// ---------------------------------------------------------------------------
// Reading the store.

function studyOf(state, studyId) {
  return state.studies.find((study) => study.id === studyId) ?? null;
}

// The open study's editor while editing, else null. Every action works on this one and no other.
function currentEditor(state) {
  const editor = state.levelEditor;
  return state.editing && editor && editor.studyId === state.openId ? editor : null;
}

// ---------------------------------------------------------------------------
// Which changes reach study.geometry.

const LUMBAR_PROJECTED = new Set(['L1', 'L2', 'L3', 'L4', 'L5', 'S1', 'FH1', 'FH2']);
const CERVICAL_PROJECTED = new Set(CERVICAL_LEVELS);

// Whether `code` is written into this study's geometry: T1 and T4 never are; a lumbar film projects L1-L5, S1
// and the heads, a cervical one C2-C7, a full-spine film all of those, and an Auto film with no result every code
// but T1 and T4 (its projection region follows what is placed, data/level-projection.js projectionRegion).
function projected(code, study) {
  if (code === 'T1' || code === 'T4') return false;
  const region = studyRegion(study);
  if (region === 'lumbar') return LUMBAR_PROJECTED.has(code);
  if (region === 'cervical') return CERVICAL_PROJECTED.has(code);
  return true;
}

// What the projection writes for one level: its geometry while it is visible and placed, else nothing.
const placedGeometry = (entry) => (entry?.visible && entry.geometry ? entry.geometry : null);

function projectedChange(before, after, study) {
  if (!study || before.levels === after.levels) return false;
  return LEVEL_CODES.some((code) => projected(code, study)
    && !sameGeometry(placedGeometry(before.levels[code]), placedGeometry(after.levels[code])));
}

// The editor's levels into study.geometry through the measure queue (D2): /measure re-measures and the study
// record (studies.json) takes the result. A cervical or full-spine projection with no anterior side is NOT
// committed (rulings R7/R8): /measure and the persistence validator both refuse it. The level model keeps the
// change, and the next change that gives an orientation commits the whole projection.
function sync(editor) {
  const study = studyOf(getState(), editor.studyId);
  if (!study || typeof deps.commitGeometry !== 'function') return;
  const geometry = projectGeometry(editor, study);
  if (!geometry) return;
  if ((geometry.region === 'cervical' || geometry.region === 'full_spine') && !validAnteriorSide(geometry.anterior_side)) return;
  deps.commitGeometry(editor.studyId, geometry);
}

// A focused handle on a level that is hidden, unplaced or being placed is dropped here, in one place, whatever
// step left it there (toggleVisible and toggleGroup keep `handle` on a level they hide).
function dropStaleHandle(editor) {
  const focus = editor.handle;
  if (!focus) return editor;
  const entry = editor.levels[focus.code];
  return entry?.visible && entry.geometry && editor.placing?.code !== focus.code ? editor : { ...editor, handle: null };
}

// (Task 11 fix round 1, I1) The exit prompt asks about unsaved changes; once a step has undone the last of them it
// has nothing to ask, so it goes. The pending exit is forgotten: DONE (or Back) again leaves at once.
function dropStalePrompt(editor) {
  return editor.exitPrompt && unsavedCount(editor) === 0 ? { ...editor, exitPrompt: null } : editor;
}

/**
 * Every action: the open study's editor, one pure step, and a write only when the step changed something.
 * `edit`: the step changes the level model, refused while this study's own run is in flight (its result is about
 * to replace the levels). `commit`: a change to a projected level commits the projection (sync). A step that
 * leaves nothing unsaved also drops the exit prompt (dropStalePrompt).
 * @returns {object|null} the editor now in the store, or null when there is none
 */
function update(step, { edit = false, commit = true } = {}) {
  const state = getState();
  const editor = currentEditor(state);
  if (!editor) return null;
  if (edit && state.running === editor.studyId) return editor;
  const stepped = step(editor);
  if (!stepped || stepped === editor) return editor;
  const next = dropStalePrompt(dropStaleHandle(stepped));
  setState({ levelEditor: next });
  if (commit && projectedChange(editor, next, studyOf(getState(), next.studyId))) sync(next);
  return next;
}

// ---------------------------------------------------------------------------
// Entering and leaving.

let entering = null; // the study whose label record is being read, so a second click does not open twice

/**
 * Edit mode for the open study: a stashed editor for it when there is one (its window / level and exit prompt
 * reset, D11), else a fresh one from the study, the model's own geometry (the viewer's prediction snapshot) and
 * the label record on disk. Then the film: ensureFilm gives an unsegmented or failed film its original.
 */
export async function enterLevelEditor(studyId) {
  const state = getState();
  const study = studyOf(state, studyId);
  if (!study || state.openId !== studyId || state.levelEditor || state.running === studyId || entering === studyId) return;
  let editor = stash.get(studyId) ?? null;
  if (editor) {
    stash.delete(studyId);
    editor = { ...editor, window: null, exitPrompt: null };
  } else {
    let saved = null;
    let source = study;
    if (study.labelFile) {
      entering = studyId;
      try {
        const record = await loadLabelRecord(study.labelFile);
        if (record) saved = { file: study.labelFile, levels: recordLevels(record) };
      } catch (error) {
        // Opened as if there were no record; Save writes the same file name again.
        showToast(`Could not read the label record: ${error.message}`);
      } finally {
        entering = null;
      }
      // Read across an await: the study must still be the open one, the same record, idle and not editing.
      const live = getState();
      source = studyOf(live, studyId);
      if (!source || source.addedAt !== study.addedAt || live.openId !== studyId || live.levelEditor
        || live.running === studyId || live.screen !== 'analysis') return;
    }
    editor = openEditor({
      study: source,
      region: studyRegion(source),
      modelGeometry: deps.getPrediction?.(studyId)?.geometry ?? null,
      saved,
    });
  }
  // Entering edit mode drops the pan toggle (a primary drag would pan, and no handle press would ever land).
  setState({ editing: true, panMode: false, selection: null, levelEditor: editor });
  showFilm(studyId);
}

// The film for the stage. A study with a model result already has its stored image (Edit is enabled only once it
// is on the stage); a film with none, or with levels placed by hand and no model run (R16, isHandPlaced), gets its decoded
// original here. A reason with no film is toasted once. A model result never reaches that branch except through
// restoreFilm, which has already said why (a toast, or FILM UNAVAILABLE), so it is not said twice.
async function showFilm(studyId) {
  if (typeof deps.ensureFilm !== 'function') return;
  const outcome = await deps.ensureFilm(studyId);
  if (!outcome || outcome.superseded || outcome.images || !outcome.reason) return;
  const live = getState();
  const study = studyOf(live, studyId);
  if (!study || currentEditor(live)?.studyId !== studyId || (study.measurements && study.geometry && !isHandPlaced(study))) return;
  showToast(outcome.reason);
}

/** DONE, the Edit button, Escape and Back: with unsaved changes the panel's prompt (D7), else out at once. */
export function requestExit({ then = 'exit' } = {}) {
  const state = getState();
  const editor = currentEditor(state);
  if (editor && unsavedCount(editor) > 0) {
    if (editor.exitPrompt?.then !== then) setState({ levelEditor: { ...editor, exitPrompt: { then } } });
    return;
  }
  exitNow(then);
}

/** The prompt's Keep editing. */
export function keepEditing() {
  update((editor) => (editor.exitPrompt ? { ...editor, exitPrompt: null } : editor));
}

/** Out of edit mode now, whatever is unsaved; `then === 'back'` also returns to the Studies list. */
export function exitNow(then = 'exit') {
  const state = getState();
  const studyId = state.levelEditor?.studyId ?? state.openId;
  setState({ levelEditor: null, editing: false, selection: null, ...(then === 'back' ? { screen: 'studies' } : {}) });
  if (studyId) stash.delete(studyId);
}

/**
 * A study whose levels are about to mean something else (deleted, re-run, Region changed): its stashed editor
 * goes, and its open editor is closed. Called before or after that study's own write; never from a subscriber.
 */
export function forgetLevelEditor(studyId) {
  if (getState().levelEditor?.studyId === studyId) setState({ levelEditor: null, editing: false, selection: null });
  stash.delete(studyId);
}

// ---------------------------------------------------------------------------
// Save and discard.

let saving = false;

function savedText(n) {
  if (n <= 0) return 'Saved the label record.';
  return n === 1 ? 'Saved 1 edit to the label record.' : `Saved ${n} edits to the label record.`;
}

/**
 * Save edits: writes userData/labels/<file> (D3), makes the written levels the baseline and records the file on
 * the study. Resolves after the toast. A demo study never writes one. The record is built from the editor as it
 * stands once the film has been read, and only those levels become the baseline, so a change made while the file
 * is being written stays unsaved.
 */
export async function saveLevelEdits() {
  const state = getState();
  const editor = currentEditor(state);
  if (!editor || saving) return;
  const study = studyOf(state, editor.studyId);
  if (!study) return;
  if (study.source === 'demo') {
    showToast(DEMO_NOTE);
    return;
  }
  if (!canSave(editor)) return;
  if (!fileStem(study.fileName ?? '')) {
    showToast(`${SAVE_FAILED}the study has no file name.`);
    return;
  }
  const { studyId } = editor;
  const { addedAt } = study;
  saving = true;
  try {
    const info = await deps.imageInfo(studyId);
    const live = getState();
    const current = currentEditor(live);
    const owner = studyOf(live, studyId);
    // Left, closed or deleted while the film was read: nothing is written.
    if (!current || current.studyId !== studyId || !owner || owner.addedAt !== addedAt) return;
    const n = unsavedCount(current);
    const others = live.studies.filter((item) => item.id !== studyId && item.labelFile).map((item) => item.labelFile);
    const file = owner.labelFile ?? labelFileName(fileStem(owner.fileName), others);
    const record = toLabelRecord({
      editor: current,
      study: owner,
      image: { file: owner.fileName, sha256: info.sha256, width: info.width, height: info.height },
      model: { name: owner.qc?.models?.vertebrae ?? 'none', version: owner.qc?.model_versions?.vertebrae ?? 'unknown' },
      appVersion: appVersion(),
      savedAt: new Date().toISOString(),
      // Task 12 supplies the model's mask outline per segmented level from info.maskPixels.
      contours: {},
    });
    await saveLabelRecord(file, record);
    const after = getState();
    const kept = studyOf(after, studyId);
    if (!kept || kept.addedAt !== addedAt) {
      // Deleted while the file was written: the delete could not see this file, so it is removed here unless
      // another study has taken the name since.
      const name = file.toLowerCase();
      if (!after.studies.some((item) => typeof item.labelFile === 'string' && item.labelFile.toLowerCase() === name)) {
        deleteLabelRecord(file).catch(() => {});
      }
      return;
    }
    const written = markSaved(current, file);
    const latest = currentEditor(after);
    const open = latest && latest.studyId === studyId ? latest : null;
    setState((s) => ({
      ...(kept.labelFile === file ? {} : {
        studies: s.studies.map((item) => (item.id === studyId && item.addedAt === addedAt ? { ...item, labelFile: file } : item)),
      }),
      ...(open ? { levelEditor: { ...open, baseline: written.baseline, record: written.record } } : {}),
    }));
    stash.delete(studyId);
    showToast(savedText(n));
    if (open?.exitPrompt) exitNow(open.exitPrompt.then);
  } catch (error) {
    showToast(`${SAVE_FAILED}${error.message}`);
  } finally {
    saving = false;
  }
}

/** Discard: every level back to the baseline (the saved record, else the state at entry), committed through the measure queue. */
export function discardLevelEdits() {
  const editor = currentEditor(getState());
  if (!editor) return;
  const n = unsavedCount(editor);
  const prompt = editor.exitPrompt;
  if (n > 0) {
    update((current) => revertToBaseline(current));
    stash.delete(editor.studyId);
    showToast(n === 1 ? 'Discarded 1 change.' : `Discarded ${n} changes.`);
  }
  if (prompt) exitNow(prompt.then);
}

/**
 * RESET TO PREDICTION (D14): every level back to the model's output, as a fresh open with no label record would
 * read it. The baseline, the record, the open groups and the window stay. Nothing is committed: the viewer writes
 * the prediction's own numbers onto the study (no /measure).
 */
export function resetLevelsToModel() {
  update((editor) => {
    const study = studyOf(getState(), editor.studyId);
    const modelGeometry = deps.getPrediction?.(editor.studyId)?.geometry ?? null;
    if (!study || !modelGeometry) return editor;
    const fresh = openEditor({ study: { ...study, geometry: modelGeometry }, region: editor.region, modelGeometry, saved: null });
    return { ...editor, levels: fresh.levels, model: fresh.model, placing: null, handle: null };
  }, { edit: true, commit: false });
}

// ---------------------------------------------------------------------------
// The panel's actions.

export function toggleLevelVisible(code) {
  update((editor) => toggleVisible(editor, code), { edit: true });
}

export function toggleLevelGroup(key) {
  update((editor) => toggleGroup(editor, key), { edit: true });
}

export function toggleGroupOpen(key) {
  update((editor) => toggleOpen(editor, key));
}

export function selectLevelRow(code) {
  update((editor) => (editor.levels[code] ? selectLevel(editor, code) : editor));
}

export function startPlace(code) {
  update((editor) => (editor.levels[code] ? startPlacing(editor, code) : editor), { edit: true });
}

export function clearPlacedLevel(code) {
  update((editor) => clearLevel(editor, code), { edit: true });
}

// ---------------------------------------------------------------------------
// The stage's actions. Points are image pixels of the stored image; `imageSize` is {width, height}.

/** One placement click (clamped by addPoint). Paused while the window / level panel is open. */
export function placePoint(point, imageSize) {
  update((editor) => (editor.placing && !editor.window?.open ? addPoint(editor, point, imageSize) : editor), { edit: true });
}

export function undoPlacedPoint() {
  update((editor) => undoPoint(editor));
}

export function cancelPlace() {
  update((editor) => cancelPlacing(editor));
}

/** FIT: finish a femoral head from 2 or 3 rim points. */
export function fitPlacing(imageSize) {
  update((editor) => (editor.window?.open ? editor : finishPlacing(editor, imageSize)), { edit: true });
}

/** The focused handle, `{code, handle}` or null. */
export function setFocusedHandle(handle) {
  update((editor) => {
    const same = editor.handle?.code === handle?.code && editor.handle?.handle === handle?.handle;
    return same ? editor : { ...editor, handle: handle ? { code: handle.code, handle: handle.handle } : null };
  });
}

/** A handle drag's release or an arrow nudge: the level's new geometry, then the projection. */
export function commitHandleMove(code, geometry) {
  update((editor) => (editor.levels[code] && geometry ? setLevelGeometry(editor, code, geometry) : editor), { edit: true });
}

// ---------------------------------------------------------------------------
// Window / level (D1, D11): display only, never persisted, never in the record. The range the sliders and the
// drag clamp to travels on the window state as `range` (viewer/window-level.js windowRange).

const LOADING_WINDOW = {
  open: true, status: 'loading', reason: null, width: 0, level: 0, defaultWidth: 0, defaultLevel: 0, min: 0, max: 0, range: null,
};

export function openWindowPanel() {
  const editor = currentEditor(getState());
  if (!editor) return;
  const wl = editor.window;
  if (wl && (wl.status === 'ready' || wl.status === 'loading')) {
    if (!wl.open) setState({ levelEditor: { ...editor, window: { ...wl, open: true } } });
    return;
  }
  setState({ levelEditor: { ...editor, window: { ...LOADING_WINDOW } } });
  loadWindow(editor.studyId);
}

async function loadWindow(studyId) {
  let outcome = null;
  // A superseded result is not a failure: the cache entry was replaced under the call. Ask again, a few times.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    outcome = typeof deps.ensureFilm === 'function' ? await deps.ensureFilm(studyId) : null;
    if (!outcome?.superseded) break;
  }
  const editor = currentEditor(getState());
  if (!editor || editor.studyId !== studyId || editor.window?.status !== 'loading') return;
  const raw = outcome?.superseded ? null : (outcome?.raw ?? null);
  if (raw) {
    const range = windowRange(raw);
    const start = defaultWindow(raw);
    setState({ levelEditor: { ...editor, window: {
      ...editor.window, status: 'ready', reason: null, width: start.width, level: start.level,
      defaultWidth: start.width, defaultLevel: start.level, min: raw.valueMin, max: raw.valueMax, range,
    } } });
  } else {
    setState({ levelEditor: { ...editor, window: { ...editor.window, status: 'unavailable', reason: outcome?.reason || FILM_UNREADABLE } } });
  }
}

export function closeWindowPanel() {
  update((editor) => (editor.window?.open ? { ...editor, window: { ...editor.window, open: false } } : editor));
}

/** Slider or drag: clamped to the film's range; only once the film is decoded. */
export function setWindow({ width, level }) {
  update((editor) => {
    const wl = editor.window;
    if (!wl || wl.status !== 'ready' || !wl.range) return editor;
    const next = clampWindow({ width, level }, wl.range);
    return next.width === wl.width && next.level === wl.level ? editor : { ...editor, window: { ...wl, ...next } };
  });
}

/** RESET: the file's default window. */
export function resetWindow() {
  const wl = currentEditor(getState())?.window;
  if (wl?.status === 'ready') setWindow({ width: wl.defaultWidth, level: wl.defaultLevel });
}
