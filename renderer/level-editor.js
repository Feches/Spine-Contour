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
 * and prediction snapshots (`getPrediction`), and the analysis screen's film loader (`ensureFilm`), image facts
 * (`imageInfo`) and result clear (`clearResult`, over the queue's replaceMeasured). This file never imports
 * components/viewer.js or screens/analysis.js, which both import it.
 *
 * (2026-10-11, gate feedback G3; plan D15) The window / level is no longer the editor's: it belongs to the view
 * (`state.filmWindow`, renderer/film-window.js) and outlives entering and leaving edit mode. The editor only reads
 * whether its panel is open, to pause placement while it is.
 *
 * (2026-10-12, gate feedback G6; plan D19) The label record has a second writer beside Save edits: Mark reviewed on a
 * film with no record yet (writeReviewRecord). Both go through one write, writeRecord, so the two records never drift.
 */
import { getState, setState, subscribe } from './store.js';
import { loadLabelRecord, saveLabelRecord, deleteLabelRecord } from './api.js';
import { showToast } from './components/toast.js';
import {
  LEVEL_CODES, openEditor, toggleVisible, toggleGroup, toggleOpen, selectLevel, startPlacing, addPoint, undoPoint,
  setPlacingStep, cancelPlacing, finishPlacing, clearLevel, revertLevel, setLevelGeometry, unsavedCount, canSave,
  markSaved, revertToBaseline, sameGeometry, setComment, aimHandle as armHandle, cancelAim as disarmHandle,
  resumePlacing, removePart, canResume,
} from './data/levels.js';
import { moveHandle } from './viewer/level-handles.js';
import { projectGeometry, projectsLevel, regionFollowsLevels, projectionIsEmpty, staleStudyLevels } from './data/level-projection.js';
import { toLabelRecord, recordLevels, recordComment, normalizeComment, labelFileName, appVersion } from './data/label-record.js';
import { levelContours } from './data/contours.js';
import { studyRegion, validAnteriorSide } from './data/cervical.js';
import { isHandPlaced } from './data/predictions.js';
import { isReviewed } from './data/status.js';
import { fileStem } from './data/labels.js';
import { windowFor, forgetFilmWindow } from './film-window.js';

const DEMO_NOTE = 'Demo studies are not exported';
const SAVE_FAILED = 'Could not save the label record: ';
const NO_FILE_NAME = 'the study has no file name.';
// (D19, R41) Mark reviewed's own wording: the mark stands whatever happened to the record.
const REVIEW_WRITE_FAILED = 'Marked reviewed. The label record could not be written: ';
const NO_PREDICTION = 'the model\'s prediction is not loaded.';

// ---------------------------------------------------------------------------
// What the screen supplies.

const deps = { commitGeometry: null, clearResult: null, getPrediction: null, ensureFilm: null, imageInfo: null };

/**
 * `clearResult(studyId, patch)` (the final review of round 2, I1): orphans any /measure pending or in flight for the
 * study (the measure queue's replaceMeasured) and writes `patch` onto it in one setState; what sync calls when a film
 * no model produced is left with nothing placed.
 * @param {{commitGeometry: (studyId: string, geometry: object, options?: {clearFailure?: boolean}) => void,
 *   clearResult: (studyId: string, patch: object) => void,
 *   getPrediction: (studyId: string) => ({measurements: object, geometry: object, qc: object|null}|undefined),
 *   ensureFilm: (studyId: string) => Promise<{images: object|null, raw: object|null, reason: string|null, superseded: boolean}>,
 *   imageInfo: (studyId: string, options?: {storedOnly?: boolean}) => Promise<{file: string, sha256: string,
 *     width: number, height: number, maskPixels: Uint8ClampedArray|null, labels: object|null,
 *     sidecarGeometry?: object|null}>}} wiring
 */
export function configureLevelEditor({ commitGeometry, clearResult, getPrediction, ensureFilm, imageInfo }) {
  Object.assign(deps, { commitGeometry, clearResult, getPrediction, ensureFilm, imageInfo });
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

// (G3, D15) Whether the view's window / level panel is open over this editor's film: placement pauses while it is.
function windowPanelOpen(editor) {
  return Boolean(windowFor(getState(), { id: editor.studyId })?.open);
}

// ---------------------------------------------------------------------------
// Which changes reach study.geometry.

// What the projection writes for one level: its geometry while it is visible and placed, else nothing.
const placedGeometry = (entry) => (entry?.visible && entry.geometry ? entry.geometry : null);

// Whether the step changed a level this study's projection reads (data/level-projection.js projectsLevel: T1 and T4
// never; a lumbar film L1-L5, S1 and the heads; a cervical one C2-C7; a full-spine film, and an Auto film whose
// region follows its placed levels (R20), every other code).
function projectedChange(before, after, study) {
  if (!study || before.levels === after.levels) return false;
  return LEVEL_CODES.some((code) => projectsLevel(code, after, study)
    && !sameGeometry(placedGeometry(before.levels[code]), placedGeometry(after.levels[code])));
}

// The editor's levels into study.geometry through the measure queue (D2): /measure re-measures and the study
// record (studies.json) takes the result. A cervical or full-spine projection with no anterior side is NOT
// committed (rulings R7/R8): /measure and the persistence validator both refuse it. The level model keeps the
// change, and the next change that gives an orientation commits the whole projection.
//
// (The final review of round 2, I1) A film no model produced whose projection now places nothing (Discard after
// placing, CLEAR on its only level, every level unchecked) has no result left: nothing goes to /measure. The screen's
// clearResult orphans any /measure still pending or in flight for it and, in one write, takes its result away and puts
// back the failure it carried when edit mode was entered (`editor.entryFailure`), so it reads Failed again, or
// Unsegmented if it never ran. Checked before the anterior side: an empty projection needs no orientation.
function sync(editor) {
  const study = studyOf(getState(), editor.studyId);
  if (!study) return;
  const geometry = projectGeometry(editor, study);
  if (!geometry) return;
  if (isHandPlaced(study) && projectionIsEmpty(geometry)) {
    if (typeof deps.clearResult !== 'function') return;
    const failure = editor.entryFailure ?? {};
    deps.clearResult(editor.studyId, {
      measurements: null, geometry: null, qc: null, reviewedAt: null,
      processingError: failure.processingError ?? null, processingErrorAt: failure.processingErrorAt ?? null,
    });
    return;
  }
  if (typeof deps.commitGeometry !== 'function') return;
  if ((geometry.region === 'cervical' || geometry.region === 'full_spine') && !validAnteriorSide(geometry.anterior_side)) return;
  // (2026-10-15, annotation editor round 2, section 4.3) A film no model produced is the editor's alone: its first
  // landed commit clears the failure the film carried. A model result's commit passes false, so a failed re-run over
  // old numbers still reads Failed; any other commit passes nothing.
  deps.commitGeometry(editor.studyId, geometry, { clearFailure: isHandPlaced(study) });
}

// (2026-10-22, round 2, Task 16: the owner's report) Commits the editor's projection once when the study still carries
// a level the editor holds hidden or unplaced; never with no editor, and never while the study's own run is in flight.
function healStudy(editor, study) {
  if (!editor || !study || getState().running === study.id) return;
  if (staleStudyLevels(editor, study).length) sync(editor);
}

// A focused handle on a level that is hidden, unplaced or being placed is dropped here, in one place, whatever
// step left it there (toggleVisible and toggleGroup keep `handle` on a level they hide).
function dropStaleHandle(editor) {
  const focus = editor.handle;
  if (!focus) return editor;
  const entry = editor.levels[focus.code];
  return entry?.visible && entry.geometry && editor.placing?.code !== focus.code ? editor : { ...editor, handle: null, aiming: false };
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

// (R20) The film type an editor opens with: an Auto film with no model run opens as Auto (every level visible, D6) even
// after a commit has written a region into its geometry: its region follows the placed levels, so that region is no
// film type to default to. Shared by enterLevelEditor and writeReviewRecord (D19), so the review record is the one a
// save right after entering edit mode would write.
function editorRegion(study) {
  return regionFollowsLevels(null, study) ? 'auto' : studyRegion(study);
}

/**
 * Edit mode for the open study: a stashed editor for it when there is one (its exit prompt reset), else a fresh one
 * from the study, the model's own geometry (the viewer's prediction snapshot) and the label record on disk. Then the
 * film: ensureFilm gives an unsegmented or failed film its original. The view's window / level is not touched: it
 * belongs to the view and stays as it was (D15, superseding D11's reset on entry).
 */
export async function enterLevelEditor(studyId) {
  const state = getState();
  const study = studyOf(state, studyId);
  if (!study || state.openId !== studyId || state.levelEditor || state.running === studyId || entering === studyId) return;
  let editor = stash.get(studyId) ?? null;
  if (editor) {
    stash.delete(studyId);
    editor = { ...editor, exitPrompt: null };
  } else {
    let saved = null;
    let source = study;
    if (study.labelFile) {
      entering = studyId;
      try {
        const record = await loadLabelRecord(study.labelFile);
        // (spec §3.3) The record on disk is the source of the comment; the study's labelComment is only its display copy.
        if (record) saved = { file: study.labelFile, levels: recordLevels(record), comment: recordComment(record) };
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
      study: source, region: editorRegion(source), modelGeometry: deps.getPrediction?.(studyId)?.geometry ?? null, saved,
    });
  }
  // Entering edit mode drops the pan toggle (a primary drag would pan, and no handle press would ever land).
  setState({ editing: true, panMode: false, selection: null, levelEditor: editor });
  // (2026-10-22, round 2, Task 16: the owner's report) A level the editor holds hidden that the study still carries
  // (a re-measure that failed or was overtaken) is projected out now: the editor's view wins.
  healStudy(editor, studyOf(getState(), studyId));
  showFilm(studyId);
}

// The film for the stage. A study with a model result already has its stored image (Edit is enabled only once it
// is on the stage); a film with none, or with levels placed by hand and no model run (R16, isHandPlaced), gets its decoded
// original here. A reason with no film is toasted once. A model result never reaches that branch except through
// restoreFilm, which has already said why (a toast, or FILM UNAVAILABLE), so it is not said twice.
// (2026-10-11, the window re-review's minor; the rule of film-window.js redecodeKeptWindow, R35) An outcome with no
// decoded original forgets a READY window of this film, so the chip and the panel never claim a window the film layer
// does not draw (another study's run took the image cache meanwhile); a loading one is left to its own decode. A
// superseded outcome says nothing about the film and changes nothing.
async function showFilm(studyId) {
  if (typeof deps.ensureFilm !== 'function') return;
  const outcome = await deps.ensureFilm(studyId);
  if (!outcome || outcome.superseded) return;
  if (!outcome.raw) {
    const wl = getState().filmWindow;
    if (wl?.studyId === studyId && wl.status === 'ready') forgetFilmWindow(studyId);
  }
  if (outcome.images || !outcome.reason) return;
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
// Save and discard, and the record Mark reviewed writes (D19).

// The label-record write in flight, 'edits' (Save edits) or 'review' (writeReviewRecord), else null, and a promise
// that settles when it ends. One at a time, so a review write and a save never interleave: a second Save edits while
// one is writing is dropped (the re-entrancy latch), a Save edits waits for a review write to end, and a review write
// for either.
let saving = null;
let writeEnded = Promise.resolve();

// Takes the latch for `kind`; the function returned releases it.
function holdWrite(kind) {
  let release;
  saving = kind;
  writeEnded = new Promise((resolve) => { release = resolve; });
  return () => {
    saving = null;
    release();
  };
}

function savedText(n) {
  if (n <= 0) return 'Saved the label record.';
  return n === 1 ? 'Saved 1 edit to the label record.' : `Saved ${n} edits to the label record.`;
}

/**
 * The write Save edits and Mark reviewed share (D19), so their records can never drift. The film's image facts first
 * (deps.imageInfo, with `imageOptions`: Mark reviewed's `{ storedOnly: true }`, R42); then, read across that await, the
 * study, which must still be the same record (`addedAt`), and the editor `editorOf(state, study, info)` gives for it
 * (null: nothing is written; a throw is the caller's to report). The record goes to the study's own label file, else a
 * new name from its stem (D3), with the model's mask outline for each level still segmented (R10). Resolves with
 * `{ file, editor, kept, state }` (`kept` the study and `state` the store once the file is written), or null when
 * nothing was written or the study went while the file was written: the delete could not see that file, so it is
 * removed here unless another study has taken the name since. Rejects with a display-ready message.
 */
async function writeRecord(studyId, addedAt, editorOf, imageOptions) {
  const info = await deps.imageInfo(studyId, imageOptions);
  const live = getState();
  const owner = studyOf(live, studyId);
  if (!owner || owner.addedAt !== addedAt) return null;
  const editor = editorOf(live, owner, info);
  if (!editor) return null;
  const others = live.studies.filter((item) => item.id !== studyId && item.labelFile).map((item) => item.labelFile);
  const file = owner.labelFile ?? labelFileName(fileStem(owner.fileName), others);
  const record = toLabelRecord({
    editor,
    study: owner,
    image: { file: owner.fileName, sha256: info.sha256, width: info.width, height: info.height },
    model: { name: owner.qc?.models?.vertebrae ?? 'none', version: owner.qc?.model_versions?.vertebrae ?? 'unknown' },
    appVersion: appVersion(),
    savedAt: new Date().toISOString(),
    // The model's mask outline for each level still segmented now (R10); all null for a film with no mask.
    contours: levelContours(info.maskPixels, info.width, info.height, info.labels, editor),
  });
  await saveLabelRecord(file, record);
  const after = getState();
  const kept = studyOf(after, studyId);
  if (!kept || kept.addedAt !== addedAt) {
    // Deleted while the file was written: the delete could not see this file, so it is removed here unless another
    // study has taken the name since.
    const name = file.toLowerCase();
    if (!after.studies.some((item) => typeof item.labelFile === 'string' && item.labelFile.toLowerCase() === name)) {
      deleteLabelRecord(file).catch(() => {});
    }
    return null;
  }
  return { file, editor, kept, state: after };
}

// The studies with `file` named on the one record it was written for (that id and that `addedAt`). (Spec §3.5) With
// `labelComment` (a string, or null for none) the study's display copy of the record's comment is set in the same
// patch; left out (undefined), it is left alone, which is what Mark reviewed's zero-change record does.
function withLabelFile(studies, studyId, addedAt, file, labelComment) {
  return studies.map((item) => (item.id === studyId && item.addedAt === addedAt
    ? { ...item, labelFile: file, ...(labelComment === undefined ? {} : { labelComment }) }
    : item));
}

/**
 * Save edits: writes userData/labels/<file> (D3), makes the written levels the baseline and records the file on
 * the study, with the comment it carries (spec §3.5). Resolves after the toast. A demo study never writes one. The record
 * is built from the editor as it stands once the film has been read, and only those levels and that comment become the
 * baseline and the saved text, so a change or typing made while the file is being written stays unsaved. (D19) A
 * review write in flight ends first, so a save clicked meanwhile is not lost.
 */
export async function saveLevelEdits() {
  while (saving === 'review') await writeEnded;
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
    showToast(`${SAVE_FAILED}${NO_FILE_NAME}`);
    return;
  }
  const { studyId } = editor;
  const { addedAt } = study;
  const release = holdWrite('edits');
  try {
    // Left, closed or deleted while the film was read: nothing is written.
    const written = await writeRecord(studyId, addedAt, (live) => {
      const current = currentEditor(live);
      return current && current.studyId === studyId ? current : null;
    });
    if (!written) return;
    const { file, editor: current, kept, state: after } = written;
    const n = unsavedCount(current);
    const saved = markSaved(current, file);
    // (spec §3.5) The study's display copy of the comment is what the record was written with: the editor the record was
    // built from (`current`), not `open`, which may hold newer typing.
    const labelComment = normalizeComment(current.comment);
    const latest = currentEditor(after);
    const open = latest && latest.studyId === studyId ? latest : null;
    setState((s) => ({
      ...(kept.labelFile === file && kept.labelComment === labelComment
        ? {} : { studies: withLabelFile(s.studies, studyId, addedAt, file, labelComment) }),
      // (plan P3) Only the saved text moves to what was written: `comment` stays as typed, so text typed while the file
      // was being written is still unsaved, as a level changed meanwhile is.
      ...(open ? { levelEditor: { ...open, baseline: saved.baseline, record: saved.record, savedComment: saved.savedComment } } : {}),
    }));
    stash.delete(studyId);
    // (2026-10-22, round 2, Task 16: the owner's report) The same heal after a save.
    if (open) healStudy(open, studyOf(getState(), studyId));
    showToast(savedText(n));
    if (open?.exitPrompt) exitNow(open.exitPrompt.then);
  } catch (error) {
    showToast(`${SAVE_FAILED}${error.message}`);
  } finally {
    release();
  }
}

// (D19; R40) Whether Mark reviewed may write this study's label record now: a real study, marked reviewed, with a
// result (a model run's or levels placed by hand: a film with neither has nothing to label), no record yet (Save edits
// keeps owning a record that exists), no run of its own in flight, and no editor open or stashed for it (those unsaved
// level edits are the annotator's to save or discard).
function reviewWritable(state, study) {
  return Boolean(study) && study.source !== 'demo' && isReviewed(study) && !study.labelFile
    && Boolean(study.measurements && study.geometry) && state.running !== study.id
    && state.levelEditor?.studyId !== study.id && !stash.has(study.id);
}

/**
 * (2026-10-12, gate feedback G6; plan D19) Mark reviewed on a study with no label record writes one: the zero-change
 * record of the stored state, exactly what Save edits writes right after entering edit mode with nothing changed.
 * The editor is built in memory once the film has been read (openEditor with enterLevelEditor's region rule, the
 * model's geometry from the prediction snapshot and no saved record) and is never put in the store: `levelEditor`,
 * `editing` and the stash are left alone, and so is the mark, which the caller has already set and which stands
 * whatever happens here (R41). The write is writeRecord's, as Save edits' is, after any write in flight.
 *
 * (2026-10-12, review round 1 of G6; ruling R42) The film is read for its stored image only (`{ storedOnly: true }`):
 * a model result's image facts come from the stored image in memory, else from its sidecar, with no /decode of the
 * original, which the record never needs, so another film opened straight after the click cannot take the image from
 * under the read. The model's geometry is the prediction snapshot's, else the sidecar's that read loaded
 * (`info.sidecarGeometry`, the same geometry a restore would have recorded as the snapshot). A film placed by hand
 * still has its original decoded: that decode is its stored image.
 *
 * Skipped, nothing written and nothing said, when reviewWritable says no before the write or once the film has been
 * read, or the study was deleted or re-added meanwhile. Written: `Saved the label record.` and `labelFile` on the
 * study. Failed (no image facts, a model result with no prediction in memory, no file name, a refused file): `Marked
 * reviewed. The label record could not be written: ` and the reason. Never rejects.
 * @returns {Promise<'written'|'skipped'|'failed'>}
 */
export async function writeReviewRecord(studyId) {
  while (saving) await writeEnded;
  const study = studyOf(getState(), studyId);
  if (!reviewWritable(getState(), study)) return 'skipped';
  if (!fileStem(study.fileName ?? '')) {
    showToast(`${REVIEW_WRITE_FAILED}${NO_FILE_NAME}`);
    return 'failed';
  }
  const { addedAt } = study;
  const release = holdWrite('review');
  try {
    const written = await writeRecord(studyId, addedAt, (live, owner, info) => {
      if (!reviewWritable(live, owner)) return null;
      const modelGeometry = deps.getPrediction?.(studyId)?.geometry ?? info?.sidecarGeometry ?? null;
      // A model result read with no prediction in memory would record every placed level as placed by hand.
      if (!modelGeometry && !isHandPlaced(owner)) throw new Error(NO_PREDICTION);
      return openEditor({ study: owner, region: editorRegion(owner), modelGeometry, saved: null });
    }, { storedOnly: true });
    if (!written) return 'skipped';
    const { file, kept } = written;
    if (kept.labelFile !== file) setState((s) => ({ studies: withLabelFile(s.studies, studyId, addedAt, file) }));
    showToast(savedText(0));
    return 'written';
  } catch (error) {
    showToast(`${REVIEW_WRITE_FAILED}${error.message}`);
    return 'failed';
  } finally {
    release();
  }
}

/**
 * Discard: every level back to the baseline (the saved record, else the state at entry), committed through the measure
 * queue; on a film no model produced whose baseline places nothing, the result is cleared instead (sync, I1).
 */
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
 * read it. The baseline, the record and the open groups stay (and the view's window, which is not the editor's).
 * Nothing is committed: the viewer writes the prediction's own numbers onto the study (no /measure).
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

/**
 * (2026-10-15, annotation editor round 2, spec §3.3) The comment box's text, as typed. An edit like every other (refused
 * while the study's own run is in flight) that changes no level, so nothing is committed and /measure is not called.
 */
export function setLevelComment(text) {
  update((editor) => setComment(editor, text), { edit: true, commit: false });
}

export function toggleGroupOpen(key) {
  update((editor) => toggleOpen(editor, key));
}

export function selectLevelRow(code) {
  update((editor) => (editor.levels[code] ? selectLevel(editor, code) : editor));
}

export function startPlace(code) {
  update((editor) => {
    const entry = editor.levels[code];
    if (!entry) return editor;
    // (2026-10-21, partial endplates, spec §4) Place... on a partial body or C2 resumes it at its first missing step.
    return canResume(code, entry) // (2026-10-22, the final review, M4) the panel's Place... shares it
      ? resumePlacing(editor, code)
      : startPlacing(editor, code);
  }, { edit: true });
}

/**
 * (2026-10-21, partial endplates, spec §4) A hollow chip of a partial level, clicked: the placement resumes at that
 * step (or at the first missing one with no step). Nothing is committed until the placement finishes.
 */
export function resumePlace(code, step = null) {
  update((editor) => resumePlacing(editor, code, step), { edit: true });
}

/**
 * (2026-10-21, partial endplates, spec §4) Delete with a point focused: that endplate (or C2's pair or centroid) is removed
 * from the level, the focus moves to a remaining point, and a projected level commits through sync. The last part, a
 * placement in flight, a one-part kind and a femoral head are refused by the level model (2026-10-22, the final
 * review, M5: a head's rim is never removed).
 */
export function removeFocusedPart() {
  update((editor) => (editor.handle ? removePart(editor, editor.handle.code, editor.handle.handle) : editor), { edit: true });
}

export function clearPlacedLevel(code) {
  update((editor) => clearLevel(editor, code), { edit: true });
}

/**
 * REVERT (annotation editor round 2, spec §5.2): an Edited level back to the model's output, committed like a handle
 * drag, so the study takes the model's geometry through /measure and the measurements follow. The unsaved count needs
 * nothing: the level returns to its baseline (the count falls) or leaves a saved edit (it rises).
 */
export function revertPlacedLevel(code) {
  update((editor) => revertLevel(editor, code), { edit: true });
}

// ---------------------------------------------------------------------------
// The stage's actions. Points are image pixels of the stored image; `imageSize` is {width, height}.

/** One placement click (clamped by addPoint). Paused while the window / level panel is open. */
export function placePoint(point, imageSize) {
  update((editor) => (editor.placing && !windowPanelOpen(editor) ? addPoint(editor, point, imageSize) : editor), { edit: true });
}

/** UNDO: the most recently set point of the placement is cleared and its step becomes the current one. */
export function undoPlacedPoint() {
  update((editor) => undoPoint(editor));
}

/**
 * A chord's take-back of the placement press it started from (the gate feedback review, F2): `prior` is the placing
 * from before that press, `pressed` the one the press left. UNDO would clear the pressed point's slot (R27), so a press
 * that RE-PLACED a point would lose the point's earlier position; this puts the placing from before the press back
 * instead (points, current step and history). A no-op unless the placing is still the one the press left: the
 * placement has moved on, or the press finished it (`pressed` null). Not an edit, so no run refuses it, and nothing
 * is committed (no level changes).
 */
export function restorePlacing(prior, pressed) {
  update((editor) => (pressed && editor.placing === pressed ? { ...editor, placing: prior } : editor));
}

/**
 * A step chip (gate feedback G2): the step the next placement click sets, a placed one included (that click re-places
 * it). Not for a femoral head (setPlacingStep). Paused while the window / level panel is open. Nothing is committed.
 */
export function selectPlacingStep(index) {
  update((editor) => (editor.placing && !windowPanelOpen(editor) ? setPlacingStep(editor, index) : editor));
}

export function cancelPlace() {
  update((editor) => cancelPlacing(editor));
}

/** FIT: finish a femoral head from 2 or 3 rim points; FINISH: end a body's or C2's placement with what is placed
 * (2026-10-22, the final review, M5). */
export function fitPlacing(imageSize) {
  update((editor) => (windowPanelOpen(editor) ? editor : finishPlacing(editor, imageSize)), { edit: true });
}

/** The focused handle, `{code, handle}` or null. (2026-10-21) Moving the focus disarms an armed point. */
export function setFocusedHandle(handle) {
  update((editor) => {
    const same = editor.handle?.code === handle?.code && editor.handle?.handle === handle?.handle;
    return same ? editor : { ...editor, handle: handle ? { code: handle.code, handle: handle.handle } : null, aiming: false };
  });
}

/**
 * (2026-10-21) A chip of the selected placed level, clicked: the point is focused and armed, so the next film click
 * places it (levels.js aimHandle). Nothing is committed.
 */
export function aimHandle(code, handle) {
  update((editor) => armHandle(editor, code, handle));
}

/** Escape, or the armed chip clicked again: disarm, keeping the focus on the point. Nothing is committed. */
export function cancelAim() {
  update((editor) => disarmHandle(editor));
}

/**
 * The film click that places the armed point (the viewer clamps `point` to the image): the level's geometry with that
 * handle moved there, committed like a handle drag's release, and the point disarmed but still focused, so the arrow
 * keys nudge it. Paused while the W/L panel is open, like a placement click. A move the handle refuses (a rim point
 * that would leave the head under MIN_RADIUS) disarms and changes nothing.
 */
export function placeAimedPoint(point) {
  update((editor) => {
    if (!editor.aiming || !editor.handle || windowPanelOpen(editor)) return editor;
    const { code, handle } = editor.handle;
    const entry = editor.levels[code];
    if (!entry?.visible || !entry.geometry) return disarmHandle(editor);
    const moved = moveHandle(code, entry.geometry, handle, point);
    const disarmed = disarmHandle(editor);
    return moved === entry.geometry ? disarmed : setLevelGeometry(disarmed, code, moved);
  }, { edit: true });
}

/** A handle drag's release or an arrow nudge: the level's new geometry, then the projection. */
export function commitHandleMove(code, geometry) {
  update((editor) => (editor.levels[code] && geometry ? setLevelGeometry(editor, code, geometry) : editor), { edit: true });
}
