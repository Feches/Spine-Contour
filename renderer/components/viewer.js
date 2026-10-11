import { segmentalValues } from '../data/segmental.js';
import { globalSvaMeasurements } from '../data/global-sva.js';
import { cervicalMeasurements, studyRegion, requiresAnteriorSide, regionRunReason } from '../data/cervical.js';
import { el } from '../dom.js';
import { getState, setState } from '../store.js';
import { measure } from '../api.js';
import { showToast } from './toast.js';
import {
  createLayeredCanvases, sizeCanvases, drawStaticLayer, drawDynamicLayer, constructionLabel, colorFor, LEVEL_HANDLE_RADIUS_PX,
} from '../viewer/canvas.js';
import { clientToImage } from '../viewer/geometry.js';
import { zoomIn, zoomOut, zoomAbout, isChordHeld, vertebraAt, arrowKeyDelta } from '../viewer/interactions.js';
import { createMeasureQueue } from '../viewer/measure-queue.js';
import { isQueued, WAIT_FOR_BATCH, WAIT_FOR_RUN } from '../data/batch.js';
import { inferenceView, unsupportedViewReason } from '../data/inference-view.js';
import { progressTitle, progressDetail } from '../data/processing.js';
import { cancelProcessing } from '../processing.js';
import { kindOf, rowName, placementSteps, placingLabel, placingHelp, canFinishPlacing } from '../data/levels.js';
import { levelHandles, hitTestLevelHandles, moveHandle, nudgeHandle, nextLevelHandle, handleAt } from '../viewer/level-handles.js';
import { dragWindow, windowText } from '../viewer/window-level.js';
import {
  enterLevelEditor, requestExit, keepEditing, placePoint, undoPlacedPoint, restorePlacing, selectPlacingStep, cancelPlace,
  fitPlacing, setFocusedHandle, selectLevelRow, commitHandleMove, openWindowPanel, closeWindowPanel, setWindow, resetWindow,
  resetLevelsToModel,
} from '../level-editor.js';

// Icons lifted verbatim from design-reference/template.html's Study Analysis toolbar.
// Same inline-SVG-through-innerHTML pattern plan 02 uses in components/sidebar.js and
// screens/landing.js. They replace the placeholder glyphs an earlier draft used, which
// also made every tooltip read as the glyph itself.
const SVG_OPEN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
const ICONS = {
  zoomOut: `${SVG_OPEN}<circle cx="11" cy="11" r="7"></circle><path d="M8 11 H14"></path><path d="M16.5 16.5 L21 21"></path></svg>`,
  zoomIn: `${SVG_OPEN}<circle cx="11" cy="11" r="7"></circle><path d="M8 11 H14"></path><path d="M11 8 V14"></path><path d="M16.5 16.5 L21 21"></path></svg>`,
  fit: `${SVG_OPEN}<path d="M9 4 H5 V8"></path><path d="M15 4 H19 V8"></path><path d="M9 20 H5 V16"></path><path d="M15 20 H19 V16"></path></svg>`,
  pan: `${SVG_OPEN}<path d="M12 3 V21"></path><path d="M3 12 H21"></path><path d="M9.5 5.5 L12 3 L14.5 5.5"></path><path d="M9.5 18.5 L12 21 L14.5 18.5"></path><path d="M5.5 9.5 L3 12 L5.5 14.5"></path><path d="M18.5 9.5 L21 12 L18.5 14.5"></path></svg>`,
  // (2026-10-10, level editor) The level-editor prototype's window / level glyph (docs/design/level-editor/
  // prototype/Main.dc.html): a circle with a vertical bar and three ticks.
  windowLevel: `${SVG_OPEN}<circle cx="12" cy="12" r="9"></circle><path d="M12 3 V21"></path><path d="M12 8 H17"></path><path d="M12 12 H18.5"></path><path d="M12 16 H17"></path></svg>`,
  overlays: `${SVG_OPEN}<path d="M12 3 L21 8 L12 13 L3 8 Z"></path><path d="M3 14 L12 19 L21 14"></path></svg>`,
  edit: `${SVG_OPEN}<path d="M12 20 H21"></path><path d="M16.5 3.5 a2.1 2.1 0 0 1 3 3 L7 19 L3 20 L4 16 Z"></path></svg>`,
  rerun: `${SVG_OPEN}<path d="M21 4 V10 H15"></path><path d="M3 20 V14 H9"></path><path d="M20.5 9.5 A8 8 0 0 0 5.6 6.6 L3 9"></path><path d="M3.5 14.5 A8 8 0 0 0 18.4 17.4 L21 15"></path></svg>`,
};

const MEASURE_DEBOUNCE_MS = 150;

// The edit bar's copy while no placement is running (handoff §3, §6).
const EDIT_LABEL = 'EDITING SEGMENTATION';
const WINDOW_LABEL = 'WINDOW / LEVEL';
const WINDOW_PAUSED_LABEL = 'WINDOW / LEVEL \u00B7 PLACING PAUSED';
const WINDOW_HELP = 'Drag on the film: left\u2013right sets width, up\u2013down sets level. Press Done to go back to editing.';
const IDLE_HELP = 'Select a level in the panel to adjust it, or place one the model missed.';

// Keyboard: in edit mode only text entry keeps its keys (a checkbox or a slider still lets Escape and Tab
// through), and Tab stays ordinary focus movement inside the stage's own controls and the levels panel.
const TEXT_ENTRY = 'input:not([type="checkbox"]):not([type="range"]), select, textarea, [contenteditable="true"]';
const OWN_TAB_ORDER = '.viewer-editbar, .viewer-wl, .level-editor, .analysis-level-host';

// ---------------------------------------------------------------------------
// Transient interaction state. Module scope, NOT the store, per the architecture
// contract's viewer/interactions.js section: only committed geometry reaches the store.
//
// One `drag` for every kind of gesture -- pan, a level's handle, the window / level drag, the
// construction label -- so two gestures can never be live at once and there is one place to look for
// what the pointer is doing. detach() resets all of it.
let drag = null;           // {kind:'pan', ...} | {kind:'levelHandle', ...} | {kind:'window', ...} | {kind:'label', ...} | null
let suppressClick = false; // a pointerdown that started a gesture eats the click that follows it
// Which pointer placed the newest placement point, so a chord that starts as a LEFT press while placing can
// take that point back: the press lands as a placement click before the second button makes it a chord.
// placePrior and placePressed are the editor's placing from before that press and the one it left; the take-back
// puts placePrior back (restorePlacing), so a press that re-placed a point returns the point to where it was.
let placePointer = null;
let placePrior = null;
let placePressed = null;

// Forgets the placement press: wherever a gesture ends or a new one begins.
function forgetPlacePress() {
  placePointer = null;
  placePrior = null;
  placePressed = null;
}

// Where the user has dragged each construction's label, in image pixels, for the open study.
let labelOffsets = new Map(); // construction key ('L3', 'PI', ...) -> {dx, dy}
let labelStudyId = null;

const measureQueue = createMeasureQueue({ measure, getState, setState, showToast, debounceMs: MEASURE_DEBOUNCE_MS });
// The level editor's projection reaches the store through here (renderer/level-editor.js, wired by
// screens/analysis.js): previewed as a draft, re-measured, then written to the study record.
export const { commitGeometry } = measureQueue;

// ---------------------------------------------------------------------------
// The raw /predict output per study: the target of RESET TO PREDICTION. Kept off the Study
// record (plan 05 persists and validates that record) and keyed by id, so a reset always
// returns to THIS study's own prediction, however many studies were opened in between.
const predictions = new Map();

export function recordPrediction(studyId, { measurements, geometry, qc }, measuredGeometry = geometry) {
  // A sidecar read back from disk is the one caller that can hand this an object missing
  // either half. structuredClone(undefined) stores undefined, and `predictions.has(id)` then
  // enables RESET TO PREDICTION over a snapshot that has nothing to reset to. No snapshot is
  // recorded, and nothing else is touched: the study keeps whatever it already had, and the
  // button stays disabled, which is what "there is no prediction to return to" looks like.
  if (measurements == null || geometry == null) return;
  const snapshot = { measurements: structuredClone(measurements), geometry: structuredClone(geometry), qc: structuredClone(qc ?? null) };
  predictions.set(studyId, snapshot);
  // A correction still pending or in flight belongs to the geometry this prediction just
  // replaced; only THIS study's is dropped. `measuredGeometry` is the geometry the study's
  // CURRENT measurements describe. It is the prediction's own for a fresh run; for a corrected
  // study restored from disk it is the stored geometry, so a failed /measure restores the
  // correction, never the prediction.
  measureQueue.replaceMeasured(studyId, measuredGeometry);
}

// (2026-10-10, level editor) The model's own output for a study, {measurements, geometry, qc}, or
// undefined: what the level editor compares each level against (renderer/level-editor.js).
export function getPrediction(studyId) {
  return predictions.get(studyId);
}

// The inverse of recordPrediction, for a deleted study. Drop its snapshot so RESET TO
// PREDICTION cannot write the deleted study's numbers onto a record that later reuses the
// id, and orphan any correction of it still pending or in flight so a late /measure
// response cannot land on that reused id either (HANDOFF plan-04 item 3).
export function forgetPrediction(studyId) {
  predictions.delete(studyId);
  measureQueue.replaceMeasured(studyId, null);
}

// Real <button>s, not <div>s: the toolbar has to be keyboard-reachable and
// screen-reader-nameable, and `title` has to be a sentence rather than the icon.
function toolButton(label, icon, onClick, props = {}) {
  return el('button', {
    type: 'button',
    class: 'viewer-tool',
    title: label,
    'aria-label': label,
    onClick,
    innerHTML: icon,
    ...props,
  });
}

// Text variant for the edit bar. Chivo Mono eyebrow, same 30px row as the icons.
function textButton(label, onClick, props = {}) {
  return el('button', { type: 'button', class: 'viewer-tool viewer-tool-text', onClick, ...props }, label);
}

// Writes only on a change: these run on every store notification, pan frames included.
function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function footerText(study) {
  // `study.pt` is the demo-set PATIENT label. It is not the PT pelvic-tilt measurement,
  // which lives at study.measurements.PT. Do not "fix" this to a number.
  const patient = study.pt ?? '\u2014';
  const sex = study.sex ?? '\u2014';
  const age = study.age ?? '\u2014';
  return `${study.id} \u00B7 ${patient} \u00B7 ${sex} \u00B7 ${age} \u2014 NOT FOR CLINICAL USE`;
}

// Redraw gating compares by REFERENCE, not by JSON.stringify: the dynamic key contains
// study.geometry, and stringifying a full geometry object on every pointermove frame is
// exactly the per-frame cost the layered design exists to avoid. Reference equality holds
// because nothing mutates the store's geometry or the level editor in place: /predict and
// /measure replace the geometry wholesale, every level-editor action builds a new editor
// (renderer/level-editor.js), and a handle drag works on a copy until its release.
function sameKey(a, b) {
  return a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i]);
}

function currentStudy() {
  const state = getState();
  const study = state.studies.find((s) => s.id === state.openId) ?? null;
  const draft = state.measurementDrafts?.[state.openId];
  return study && draft ? { ...study, geometry: draft } : study;
}

// (2026-10-10) The level editor of the study on the stage while editing, else null.
function editorFor(state, study) {
  const editor = state.levelEditor;
  return state.editing && editor && study && editor.studyId === study.id ? editor : null;
}

// The edit bar's help line (handoff §3; the prototype's renderVals): the W/L instruction, the placement step,
// the selected placed level, or the idle prompt.
function editHelpText(editor, windowOpen) {
  if (!editor) return '';
  if (windowOpen) return WINDOW_HELP;
  if (editor.placing) return placingHelp(editor) ?? '';
  const code = editor.selected;
  const entry = code ? editor.levels[code] : null;
  if (!entry?.visible || !entry.geometry) return IDLE_HELP;
  const name = rowName(code).replace('Head', 'Femoral head');
  return kindOf(code) === 'circle'
    ? `${name} selected \u2014 drag a rim point to refit it.`
    : `${name} selected \u2014 drag a handle to adjust it.`;
}

export function mountViewer(container) {
  const stage = el('div', { class: 'viewer-stage' });
  const host = el('div', { class: 'viewer-host' });
  const { staticCanvas, dynamicCanvas, staticCtx, dynamicCtx } = createLayeredCanvases(host);
  // createLayeredCanvases already appended both canvases to `host`. Do not append again.

  // The selected construction's label is a DOM chip INSIDE the transformed host, so the
  // host's own translate/scale pans and zooms it with the film, it may sit in the black
  // space around the film, and it drags by itself. Positioned in host coordinates at zoom 1.
  const labelChip = el('div', { class: 'viewer-label is-hidden', 'aria-hidden': 'true' });
  host.append(labelChip);

  // The study chip; while editing with the film decoded it also reads the window (handoff §3).
  const chipId = el('div', { class: 'viewer-chip-id' });
  const chipDivider = el('span', { class: 'viewer-chip-divider is-hidden', 'aria-hidden': 'true' });
  const chipWindow = el('span', { class: 'viewer-chip-window is-hidden' });
  const chip = el('div', { class: 'viewer-chip' }, chipId, chipDivider, chipWindow);

  const zoomLabel = el('div', { class: 'viewer-zoom' }, '100%');
  const panButton = toolButton('Pan', ICONS.pan, () => setState((s) => ({ panMode: !s.panMode })), { 'aria-pressed': 'false' });
  // Shown only while editing (updateViewer); opens and closes the window / level panel.
  const windowButton = toolButton('Window / level', ICONS.windowLevel, () => {
    if (getState().levelEditor?.window?.open) closeWindowPanel();
    else openWindowPanel();
  }, { 'aria-pressed': 'false' });
  const overlayButton = toolButton('Toggle segmentation overlay', ICONS.overlays, () => setState((s) => ({ overlays: !s.overlays })), { 'aria-pressed': 'false' });
  const editButton = toolButton('Edit segmentation', ICONS.edit, () => {
    // Entering edit mode drops the pan toggle (renderer/level-editor.js enterLevelEditor): with it on, a
    // primary-button drag pans and the handle press underneath never happens. Panning is not taken away --
    // the middle button and the left+right chord both still pan in every mode, edit included.
    //
    // ONE-WAY on purpose. Pressing Pan while already editing must keep pan winning: that is a
    // signed-off behaviour asserted by tools/smoke/smoke-gate1.mjs and stated in the gesture
    // comment on handlePointerDown. Leaving edit mode does not restore the toggle.
    const state = getState();
    if (state.editing) requestExit();
    else if (state.openId) enterLevelEditor(state.openId);
  }, { 'aria-pressed': 'false', disabled: true });
  let runHandler = null;
  const rerunButton = toolButton('Re-run segmentation', ICONS.rerun, () => { if (runHandler) runHandler(); }, { disabled: true });
  const fillSlider = el('input', {
    type: 'range',
    min: '0',
    max: '100',
    value: String(getState().overlayOpacity),
    class: 'viewer-fill-slider',
    'aria-label': 'Segmentation overlay opacity',
    onInput: (e) => setState({ overlayOpacity: Number(e.target.value) }),
  });

  const toolbar = el('div', { class: 'viewer-toolbar' },
    toolButton('Zoom out', ICONS.zoomOut, () => setState((s) => ({ zoom: zoomOut(s.zoom) }))),
    zoomLabel,
    toolButton('Zoom in', ICONS.zoomIn, () => setState((s) => ({ zoom: zoomIn(s.zoom) }))),
    toolButton('Fit to view', ICONS.fit, () => setState({ zoom: 1, panX: 0, panY: 0 })),
    el('div', { class: 'viewer-divider' }),
    panButton,
    windowButton,
    overlayButton,
    el('div', { class: 'viewer-divider' }),
    el('div', { class: 'viewer-fill' },
      el('div', { class: 'viewer-fill-label' }, 'FILL'),
      fillSlider),
    el('div', { class: 'viewer-divider' }),
    editButton,
    rerunButton);

  // The edit bar (handoff §3): the label, the help line, then -- while placing, and not while the window
  // / level panel is open -- the step chips, FIT (femoral heads), UNDO and CANCEL; then RESET TO PREDICTION
  // (D14) and DONE, always.
  const editLabel = el('div', { class: 'viewer-editbar-label' }, EDIT_LABEL);
  const editHelp = el('div', { class: 'viewer-edit-help' });
  const steps = el('div', { class: 'viewer-steps is-hidden' });
  const fitButton = textButton('FIT', () => fitPlacing(imageSize()), { 'aria-label': 'Fit the circle to the rim points', class: 'viewer-tool viewer-tool-text is-active is-hidden' });
  const undoButton = textButton('UNDO', () => undoPlacedPoint(), { class: 'viewer-tool viewer-tool-text is-hidden' });
  const placeCancelButton = textButton('CANCEL', () => cancelPlace(), { class: 'viewer-tool viewer-tool-text is-hidden' });
  const placeDivider = el('div', { class: 'viewer-divider is-hidden' });
  const resetButton = textButton('RESET TO PREDICTION', () => resetToPrediction(), { disabled: true });
  const doneButton = textButton('DONE', () => requestExit());
  const editBar = el('div', { class: 'viewer-editbar is-hidden' },
    editLabel,
    editHelp,
    steps,
    fitButton,
    undoButton,
    placeCancelButton,
    placeDivider,
    resetButton,
    doneButton);

  // The window / level panel (handoff §3, §6): display only. The slider bounds are the film's own
  // (window-level.js windowRange); the note says why there is nothing to window.
  const wlWidth = el('input', {
    type: 'range', class: 'viewer-wl-slider', min: '64', max: '256', step: '1', 'aria-label': 'Window width', disabled: true,
    onInput: (e) => setWindow({ width: Number(e.target.value), level: getState().levelEditor?.window?.level }),
  });
  const wlLevel = el('input', {
    type: 'range', class: 'viewer-wl-slider', min: '0', max: '255', step: '1', 'aria-label': 'Window level', disabled: true,
    onInput: (e) => setWindow({ width: getState().levelEditor?.window?.width, level: Number(e.target.value) }),
  });
  const wlWidthValue = el('span', { class: 'viewer-wl-value' }, '\u2014');
  const wlLevelValue = el('span', { class: 'viewer-wl-value' }, '\u2014');
  const wlNote = el('p', { class: 'viewer-wl-note is-hidden' });
  const wlPanel = el('div', { class: 'viewer-wl is-hidden', role: 'group', 'aria-label': 'Window and level' },
    el('div', { class: 'viewer-wl-head' },
      el('span', { class: 'viewer-wl-title' }, WINDOW_LABEL),
      textButton('RESET', () => resetWindow(), { title: "Reset to the file's default window", 'aria-label': "Reset to the file's default window" }),
      textButton('DONE', () => closeWindowPanel())),
    el('label', { class: 'viewer-wl-row' }, el('span', { class: 'viewer-wl-label' }, 'WIDTH'), wlWidth, wlWidthValue),
    el('label', { class: 'viewer-wl-row' }, el('span', { class: 'viewer-wl-label' }, 'LEVEL'), wlLevel, wlLevelValue),
    el('p', { class: 'viewer-wl-copy' }, "Display only. Measurements and the label record don't change."),
    wlNote);

  const footer = el('div', { class: 'viewer-footer' });

  // Stages and counts come from the backend; elapsed time is not a percentage.
  const runEyebrow = el('div', { class: 'run-eyebrow' });
  const runTitle = el('div', { class: 'run-title' });
  const runBody = el('div', { class: 'run-body' });
  const runSpinner = el('div', { class: 'run-spinner is-hidden' });
  const runButton = el('button', { type: 'button', class: 'run-button' }, 'Run segmentation');
  const cancelButton = el('button', { type: 'button', class: 'run-button is-hidden', onClick: cancelProcessing }, 'Cancel processing');
  const runCard = el('div', { class: 'run-card is-hidden' },
    el('div', { class: 'run-card-inner' }, runEyebrow, runTitle, runBody, runSpinner, runButton, cancelButton));

  stage.append(host, chip, toolbar, editBar, wlPanel, footer, runCard);
  container.append(stage);

  let currentImages = null;
  let lastStatic = null;
  let lastDynamic = null;
  let lastSteps = null;

  // 'loading' | 'missing' | null -- what this mount knows about the film for the open study.
  // A study restored from disk has numbers before it has bitmaps; screens/analysis.js drives
  // this while it reads the prediction sidecar. Closure state, not the store: it describes
  // this mount's progress, not the Study record, and plan 05 persists that record.
  let filmStatus = null;

  // Image pixels per CSS pixel at the current fit and zoom. Read from layout, so it is
  // right after a zoom, a resize or a sidebar collapse without anything having to say so.
  function pixelRatio() {
    const rect = dynamicCanvas.getBoundingClientRect();
    return rect.width > 0 ? dynamicCanvas.width / rect.width : 1;
  }

  // The stored image's size, which every placement click and handle point is clamped to.
  function imageSize() {
    return { width: dynamicCanvas.width, height: dynamicCanvas.height };
  }

  function clampToImage(point) {
    return [
      Math.max(0, Math.min(dynamicCanvas.width - 1, point[0])),
      Math.max(0, Math.min(dynamicCanvas.height - 1, point[1])),
    ];
  }

  // The geometry the stage should show: the store's (a level-handle drag travels separately, as
  // dragGeometry, because the editor draws levels, not study.geometry).
  function liveGeometry() {
    const study = currentStudy();
    return study ? study.geometry : null;
  }

  // A live handle drag's working copy of one level, for drawLevelEditor's `dragGeometry`.
  function dragGeometryFor(editor) {
    return drag && drag.kind === 'levelHandle' && drag.studyId === editor.studyId
      ? { code: drag.code, geometry: drag.geometry } : null;
  }

  // The ONE place the dynamic layer is drawn from. Store-driven redraws reach it through
  // updateViewer's reference-keyed gate; per-frame drag redraws call it directly. Both compose
  // the same options, so there is exactly one notion of what the dynamic layer shows.
  function redrawDynamic(geometry) {
    // Geometry is in the FILM's pixel space, and without the film there is nothing to draw it
    // on -- the canvases keep their default 300x150 until setImages sizes them, so painting
    // here would scatter image-space lines across a stub. A study restored from disk has its
    // geometry before its bitmaps, so this is the ordinary path, not an edge case.
    if (!currentImages) {
      dynamicCtx.clearRect(0, 0, dynamicCanvas.width, dynamicCanvas.height);
      labelChip.classList.add('is-hidden');
      return;
    }
    const state = getState();
    const study = currentStudy();
    const editor = editorFor(state, study);
    drawDynamicLayer(dynamicCtx, dynamicCanvas, geometry, {
      selectedLevel: state.selectedLevel,
      measurements: study && !state.measurementDrafts?.[study.id]
        ? { ...segmentalValues(study), ...(studyRegion(study) === 'cervical' ? cervicalMeasurements(study)
          : studyRegion(study) === 'full_spine' ? { ...study.measurements, ...cervicalMeasurements(study), ...globalSvaMeasurements(study) } : study.measurements) } : null,
      editing: state.editing,
      selection: state.selection,
      pixelRatio: pixelRatio(),
      // (2026-10-10) In edit mode the level editor draws every level, its handles and the placement.
      ...(editor ? {
        editor,
        handle: editor.handle,
        dragGeometry: dragGeometryFor(editor),
        overlays: state.overlays,
        overlayOpacity: state.overlayOpacity,
      } : {}),
    });
    placeLabel(geometry);
  }

  // Chip text sized with the film as laid out at zoom 1 (the host's scale does the rest),
  // clamped so a tiny film still reads and a huge one does not get a banner.
  function labelFontPx() {
    return Math.max(8, Math.min(13, dynamicCanvas.offsetHeight / 45));
  }

  function placeLabel(geometry) {
    const state = getState();
    const study = currentStudy();
    const label = constructionLabel(geometry, state.selectedLevel,
      study && !state.measurementDrafts?.[study.id]
        ? { ...segmentalValues(study), ...(studyRegion(study) === 'cervical' ? cervicalMeasurements(study)
          : studyRegion(study) === 'full_spine' ? { ...study.measurements, ...cervicalMeasurements(study), ...globalSvaMeasurements(study) } : study.measurements) } : null);
    labelChip.classList.toggle('is-hidden', !label);
    if (!label) return;
    const offset = labelOffsets.get(state.selectedLevel) ?? { dx: 0, dy: 0 };
    // The canvas's untransformed layout box maps image px to host px at zoom 1.
    const scale = dynamicCanvas.offsetWidth / dynamicCanvas.width || 1;
    const x = dynamicCanvas.offsetLeft + (label.anchor[0] + offset.dx) * scale;
    const y = dynamicCanvas.offsetTop + (label.anchor[1] + offset.dy) * scale;
    labelChip.textContent = label.text;
    labelChip.style.fontSize = `${labelFontPx()}px`;
    labelChip.style.transform = `translate(${x}px, ${y}px) translate(${label.side < 0 ? '-100%' : '0'}, -50%)`;
  }

  // Handles and construction labels are sized in CSS pixels, so a stage resize (window,
  // sidebar collapse) changes their image-space size in every mode. drawDynamicLayer copes
  // with a null geometry, so this is safe before a study is open.
  const resizeObserver = new ResizeObserver(() => {
    redrawDynamic(liveGeometry());
  });
  resizeObserver.observe(stage);

  // The grab radius in CSS pixels: 14 up to 1:1, where the handle is drawn 6 CSS px wide; past 1:1 the handle
  // keeps its 6 image px and grows with the film (R28), so the grab area follows the drawn disc (the re-review
  // of the gate feedback: at 800% on a small film a press inside the drawn handle missed it).
  const HANDLE_GRAB_PX = 14;
  function grabRadius() {
    return Math.max(HANDLE_GRAB_PX, LEVEL_HANDLE_RADIUS_PX / Math.min(1, pixelRatio()));
  }

  // The selected level's handle under the pointer, or null. Only the selected level has handles (handoff
  // §5), and none while it is being placed. Hit-tested in client space with grabRadius().
  function selectedHandleAt(editor, event) {
    const code = editor.selected;
    const entry = code ? editor.levels[code] : null;
    if (!entry?.visible || !entry.geometry || editor.placing?.code === code) return null;
    const handle = hitTestLevelHandles(levelHandles(code, entry.geometry), event.clientX, event.clientY, dynamicCanvas, grabRadius());
    return handle ? { code, handle, geometry: entry.geometry } : null;
  }

  // The grab cursor over a handle. No redraw: the editor draws no hover state.
  function updateHover(event) {
    const state = getState();
    const editor = editorFor(state, currentStudy());
    const over = Boolean(editor && currentImages && !editor.placing && !editor.window?.open
      && state.running !== editor.studyId && selectedHandleAt(editor, event));
    stage.classList.toggle('is-over-handle', over);
  }

  // NOTE ON COORDINATES, because this looks like a missing correction and is not.
  // clientToImage() derives its scale from canvas.getBoundingClientRect(), and the rect
  // ALREADY reflects the CSS `transform: translate(panX, panY) scale(zoom)` applied to the
  // canvases' shared host. Zoom and pan are therefore accounted for exactly once. Do not
  // "fix" a hit test by subtracting panX/panY or dividing by zoom -- that double-counts the
  // transform and every hit drifts further from the cursor the more you pan.

  function handleWheel(event) {
    event.preventDefault();
    // deltaY === 0 (shift+wheel, a horizontal trackpad swipe, a tilt wheel) used to fall into
    // the zoom-OUT branch of the old ternary. That was harmless while only `zoom` was written;
    // now it would also yank the pan sideways, so bail before anything is computed.
    if (event.deltaY === 0) return;
    // .viewer-host is inset:0 in a stage with NO border and NO padding, so the stage's rect IS
    // the host's untransformed box and its centre is the transform origin. Adding a border or
    // padding to .viewer-stage would break this silently.
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const offsetX = event.clientX - rect.left - rect.width / 2;
    const offsetY = event.clientY - rect.top - rect.height / 2;
    // A live pan drag baselines its pan at pointerdown and recomputes ABSOLUTELY from it. A
    // wheel is not a pointer event, so pointer capture does not withhold it and the `if (drag)
    // return` guard on pointerdown does not apply -- this DOES fire mid-drag. Without the
    // re-baseline below, the next pointermove would silently discard the pan this wheel just
    // wrote and the film would snap back.
    const before = drag && drag.kind === 'pan' ? getState() : null;
    setState((s) => zoomAbout(s, event.deltaY < 0 ? 1 : -1, offsetX, offsetY));
    if (before && drag && drag.kind === 'pan') {
      const after = getState();
      // Shift the baseline by exactly what the wheel changed, so `drag.panX + mouse delta`
      // keeps yielding the anchored pan. Deliberately does NOT touch drag.clientX/clientY: the
      // wheel may come from a different device than the pointer holding the drag.
      drag.panX += after.panX - before.panX;
      drag.panY += after.panY - before.panY;
    }
  }

  // Electron ships no default context menu -- main.js never requires Menu and nothing handles
  // webContents 'context-menu' -- so nothing pops today and the chord works without this. It is
  // a guard: on Windows `contextmenu` fires on the RIGHT BUTTON'S RELEASE, which for a chord is
  // the exact moment the pan ends (verified: it arrives with buttons=1, while the primary is
  // still held). The day anyone adds a context menu, it would otherwise appear at the end of
  // every chord pan. On `stage`, not the canvas: contextmenu is NOT retargeted by pointer
  // capture, so it lands on whatever the cursor is actually over -- canvas, chip, or the black
  // surround. That also covers the toolbar, edit bar and footer, which are stage children.
  function handleContextMenu(event) {
    event.preventDefault();
  }

  function startPan(event, chord = false) {
    const state = getState();
    drag = { kind: 'pan', chord, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, panX: state.panX, panY: state.panY };
    suppressClick = true;
    stage.classList.add('is-panning');
    if (!dynamicCanvas.hasPointerCapture(event.pointerId)) dynamicCanvas.setPointerCapture(event.pointerId);
  }

  // A chord outranks every other gesture, so starting one has to dismantle whatever was
  // running. Mouse-only and same-pointer: a pen in contact reports buttons=1 and its barrel
  // button adds 2, so contact+barrel would otherwise pan; a second pointer is ignored the same
  // way handlePointerDown ignores one.
  function chordStarts(event) {
    return event.pointerType === 'mouse'
      && isChordHeld(event.buttons)
      && (!drag || drag.pointerId === event.pointerId);
  }

  function startChordPan(event) {
    const previous = drag;
    if (previous && previous.kind === 'pan' && previous.chord) return; // idempotent: fires every move
    if (previous && previous.kind === 'label' && labelChip.hasPointerCapture(event.pointerId)) {
      labelChip.releasePointerCapture(event.pointerId);
      labelChip.classList.remove('is-dragging');
    }
    // A LEFT-first chord while placing has already placed a point with its first press. Take that press back by
    // putting the placing from before it back (restorePlacing), not by UNDO: UNDO clears the slot (R27), so a press
    // that re-placed a point would lose the point's earlier position. A press that finished the placement is not
    // taken back (placeAt keeps nothing for it): the level is placed and can be adjusted.
    if (placePointer === event.pointerId) restorePlacing(placePrior, placePressed);
    forgetPlacePress();
    startPan(event, true);
    stage.classList.remove('is-dragging-handle');
    stage.classList.remove('is-over-handle');
    // Load-bearing: panX/panY are absent from dynamicKey, so nothing else repaints and an
    // abandoned handle drag's working copy would stay painted. dragGeometryFor() returns null
    // here because drag.kind is already 'pan'.
    redrawDynamic(liveGeometry());
  }

  function endChordPan() {
    drag = null;
    stage.classList.remove('is-panning');
    // Capture and suppressClick stay: releasing the primary while the secondary is held fires
    // a real click on the canvas, and suppressClick is what stops it reselecting.
    // handlePointerDown resets suppressClick at the top of the next gesture, which is what
    // makes both the click-fires and no-click-fires orders safe.
  }

  // One placement click, at the pointer, clamped to the film by clientToImage and addPoint. The press is remembered
  // for a chord's take-back (the pointer, and the placing before and after it) only when it set a point and left the
  // placement open: a press addPoint dropped (within 1 px of another point of the placement, R26) leaves the placement
  // alone, and a press that finished it is not taken back.
  function placeAt(event) {
    event.preventDefault();
    suppressClick = true;
    const prior = getState().levelEditor?.placing ?? null;
    placePoint(clientToImage(event, dynamicCanvas), imageSize());
    const pressed = getState().levelEditor?.placing ?? null;
    forgetPlacePress();
    if (prior && pressed && pressed !== prior) {
      placePointer = event.pointerId;
      placePrior = prior;
      placePressed = pressed;
    }
  }

  // Gesture precedence: a LEFT+RIGHT chord pans in every mode and outranks everything below
  // it, including a handle drag while editing; the middle button pans in every mode; the
  // primary button pans when the pan toggle is on; while editing (level editor, handoff §6), a press
  // with the window / level panel open drags the window, a press while placing places the next point,
  // and a press on the selected level's handle starts a handle drag. A second pointer while a gesture is
  // live is ignored. The construction label has its own drag -- see handleLabelPointerDown below.
  //
  // The chord test is FIRST, above `if (drag) return`, because outranking a live handle drag
  // is the point. It is also, for a real mouse, dead code: Chromium fires pointerdown only on
  // the transition from no buttons to some button, so the second button of a chord arrives as
  // a pointermove and handlePointerMove is where the chord is actually born. It stays here so
  // that a pointerdown which DOES carry both bits -- a synthesised one, a future input
  // backend -- cannot be swallowed by the `if (drag) return` guard below.
  function handlePointerDown(event) {
    if (chordStarts(event)) {
      event.preventDefault();
      startChordPan(event);
      return;
    }
    if (drag) return;
    suppressClick = false;
    forgetPlacePress();
    const state = getState();
    if (event.button === 1 || (event.button === 0 && state.panMode)) {
      event.preventDefault();
      startPan(event);
      return;
    }
    if (event.button !== 0) return;
    const study = currentStudy();
    const editor = editorFor(state, study);
    // Busy means THIS study's /predict is in flight. A run on a different study must not
    // freeze this one's handles (state.running is that study's id, not a boolean). Without the
    // film there is nothing to place on: the canvas is still its 300x150 stub.
    if (!editor || state.running === study.id || !currentImages) return;
    if (editor.window?.open) {
      // Placement clicks and handle drags pause while the window / level panel is open.
      event.preventDefault();
      suppressClick = true;
      const wl = editor.window;
      if (wl.status !== 'ready') return;
      drag = { kind: 'window', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, start: { width: wl.width, level: wl.level } };
      dynamicCanvas.setPointerCapture(event.pointerId);
      stage.classList.add('is-windowing');
      return;
    }
    if (editor.placing) {
      placeAt(event);
      return;
    }
    const hit = selectedHandleAt(editor, event);
    if (!hit) return;
    event.preventDefault();
    suppressClick = true;
    // Drag a WORKING COPY. The editor is never mutated in place: the copy is committed as a
    // new level geometry on release (commitHandleMove), which this file's reference-keyed redraw
    // gate and router.js's key sets both require.
    drag = { kind: 'levelHandle', pointerId: event.pointerId, studyId: editor.studyId, code: hit.code, handle: hit.handle, geometry: structuredClone(hit.geometry), moved: false };
    dynamicCanvas.setPointerCapture(event.pointerId);
    stage.classList.add('is-dragging-handle');
    setFocusedHandle({ code: hit.code, handle: hit.handle });
  }

  // A placement click on the black surround around the film (handoff §11: clamped to the image bounds).
  // The film's own presses reach handlePointerDown on the canvas and bubble here; they are skipped.
  function handleHostPointerDown(event) {
    if (event.target === dynamicCanvas || event.button !== 0 || drag) return;
    const state = getState();
    if (state.panMode) return;
    const study = currentStudy();
    const editor = editorFor(state, study);
    if (!editor || !editor.placing || editor.window?.open || state.running === study.id || !currentImages) return;
    suppressClick = false;
    placeAt(event);
  }

  function handlePointerMove(event) {
    // THIS is where a chord is born and where it dies. Chromium fires pointerdown only on the
    // transition from no buttons to some button and pointerup only on the transition back to
    // zero; every intermediate press or release arrives here as a pointermove carrying
    // `button` = the button that changed and `buttons` = the new mask. Verified on Electron 44
    // / Chrome 152, both press orders. Do NOT move this test into pointerdown -- there it never
    // runs for a real mouse. And do not add an early return above it: anything that bails
    // before this line silently kills the whole feature.
    if (chordStarts(event)) {
      event.preventDefault();
      startChordPan(event); // no-op once the chord pan is running
    } else if (drag && drag.kind === 'pan' && drag.chord) {
      endChordPan();
      return;
    }
    if (!drag) {
      updateHover(event);
      return;
    }
    if (event.pointerId !== drag.pointerId) return;
    if (drag.kind === 'pan') {
      setState({
        panX: drag.panX + (event.clientX - drag.clientX),
        panY: drag.panY + (event.clientY - drag.clientY),
      });
      return;
    }
    if (drag.kind === 'window') {
      // Four per screen pixel: left-right for width, up-down for level (dragWindow), clamped.
      const range = getState().levelEditor?.window?.range;
      if (range) setWindow(dragWindow(drag.start, event.clientX - drag.clientX, event.clientY - drag.clientY, range));
      return;
    }
    if (drag.kind !== 'levelHandle') return;
    // moveHandle does not clamp; the stage does, to the stored image (rim points refit the head live).
    drag.geometry = moveHandle(drag.code, drag.geometry, drag.handle, clampToImage(clientToImage(event, dynamicCanvas)));
    drag.moved = true;
    redrawDynamic(liveGeometry());
  }

  function handlePointerLeave() {
    if (!drag) stage.classList.remove('is-over-handle');
  }

  function handlePointerUp(event) {
    if (drag && event.pointerId !== drag.pointerId) return;
    if (dynamicCanvas.hasPointerCapture(event.pointerId)) dynamicCanvas.releasePointerCapture(event.pointerId);
    const ended = drag;
    drag = null;
    forgetPlacePress();
    stage.classList.remove('is-dragging-handle');
    // Covers the ordinary pan, a chord released as one simultaneous pointerup, and pointercancel.
    stage.classList.remove('is-panning');
    if (!ended || ended.kind !== 'levelHandle') return;
    // A cancelled gesture (pen lifted out of range, window lost the pointer) discards the
    // working copy: the editor still holds the pre-drag geometry, so redraw from it. So does a
    // drag whose editor has gone (a run finished under it).
    if (event.type === 'pointercancel' || !ended.moved || getState().levelEditor?.studyId !== ended.studyId) {
      redrawDynamic(liveGeometry());
      return;
    }
    commitHandleMove(ended.code, ended.geometry);
  }

  // The chip drags itself. Deltas are converted to image px through the live canvas rect so
  // the offset stays anchored to the film at any zoom; nothing is committed and no /measure
  // is scheduled. The shared `drag` keeps the canvas gestures and keyboard out while it runs.
  function handleLabelPointerDown(event) {
    // Outside pan and edit mode the chip is a live pointer target, so with a construction
    // selected it swallows a chord two ways: right-first is dropped by the button bail below,
    // and left-first starts a label drag whose capture retargets every later move here. Both
    // hand off to the same chord pan.
    if (chordStarts(event)) { event.preventDefault(); startChordPan(event); return; }
    if (event.button !== 0 || drag) return;
    const state = getState();
    event.preventDefault();
    const rect = dynamicCanvas.getBoundingClientRect();
    const perPx = dynamicCanvas.width / rect.width;
    const startOffset = labelOffsets.get(state.selectedLevel) ?? { dx: 0, dy: 0 };
    drag = { kind: 'label', pointerId: event.pointerId, key: state.selectedLevel, start: [event.clientX, event.clientY], startOffset, perPx };
    labelChip.setPointerCapture(event.pointerId);
    labelChip.classList.add('is-dragging');
  }

  function handleLabelPointerMove(event) {
    // A chord that began on the chip reaches the film ONLY here: the chip holds pointer
    // capture, so the second button's pointermove is retargeted to the chip, not the canvas.
    // After the hand-off capture lives on dynamicCanvas and later moves go to handlePointerMove.
    if (chordStarts(event)) { event.preventDefault(); startChordPan(event); return; }
    if (!drag || drag.kind !== 'label' || event.pointerId !== drag.pointerId) return;
    labelOffsets.set(drag.key, {
      dx: drag.startOffset.dx + (event.clientX - drag.start[0]) * drag.perPx,
      dy: drag.startOffset.dy + (event.clientY - drag.start[1]) * drag.perPx,
    });
    placeLabel(liveGeometry());
  }

  function handleLabelPointerUp(event) {
    if (!drag || drag.kind !== 'label' || event.pointerId !== drag.pointerId) return;
    if (labelChip.hasPointerCapture(event.pointerId)) labelChip.releasePointerCapture(event.pointerId);
    drag = null;
    labelChip.classList.remove('is-dragging');
  }

  labelChip.addEventListener('pointerdown', handleLabelPointerDown);
  labelChip.addEventListener('pointermove', handleLabelPointerMove);
  labelChip.addEventListener('pointerup', handleLabelPointerUp);
  labelChip.addEventListener('pointercancel', handleLabelPointerUp);

  // Coarse click-select: the vertebra under the pointer becomes the construction target.
  // A click that ended a gesture is not a selection, and in edit mode a click selects nothing:
  // the levels panel selects a level.
  function handleClick(event) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (getState().editing) return;
    const study = currentStudy();
    if (!study || !study.geometry) return;
    const level = vertebraAt(study.geometry, clientToImage(event, dynamicCanvas));
    // Clicking the selected vertebra again, or empty stage, clears the construction.
    const state = getState();
    const next = level && level !== state.selectedLevel ? level : null;
    if (next !== state.selectedLevel) setState({ selectedLevel: next });
  }

  // RESET TO PREDICTION (D14): the whole study back to the model's output -- the prediction's own
  // numbers on the record, and every level of the editor back to the model's geometry.
  function resetToPrediction() {
    const study = currentStudy();
    const predicted = study ? predictions.get(study.id) : null;
    if (!predicted) return;
    // No /measure: the snapshot IS the prediction's own numbers. Orphan anything in flight.
    measureQueue.replaceMeasured(study.id, predicted.geometry);
    setState((current) => ({
      selection: null,
      studies: current.studies.map((item) => (item.id === study.id
        // The prediction's own numbers replace the corrected ones (studies-table spec 8.4, site 3).
        // A snapshot recorded without qc keeps the study's own rather than erasing every review reason.
        ? { ...item, measurements: structuredClone(predicted.measurements), geometry: structuredClone(predicted.geometry), qc: predicted.qc ? structuredClone(predicted.qc) : item.qc, reviewedAt: null }
        : item)),
    }));
    resetLevelsToModel();
  }

  // The step chips of the placement in progress: done (filled dot), current (accent ground), pending (outline dot); a
  // placed step chosen again is both. (Gate feedback G2, 2026-10-11) For a body, C2, an endplate or a centroid each
  // chip is a button that makes its step the one the next film click sets, in any order, a placed one included (the
  // click re-places it); disabled while this study's run is in flight, like UNDO. A femoral head's rim points are
  // unordered, so its chips stay plain progress (the owner's choice).
  function buildSteps(editor, busy) {
    const { code, points, current } = editor.placing;
    const circle = kindOf(code) === 'circle';
    const next = circle ? points.indexOf(null) : current;
    return placementSteps(code).steps.map((step, index) => {
      const dot = el('span', { class: 'viewer-step-dot' });
      dot.style.setProperty('--step-color', colorFor(step.colorKey, code));
      const done = points[index] != null;
      const className = `viewer-step${done ? ' is-done' : ''}${index === next ? ' is-current' : ''}`;
      if (circle) return el('span', { class: className }, dot, step.label);
      return el('button', {
        type: 'button',
        class: className,
        title: done ? `Re-place ${step.label}` : `Place ${step.label} next`,
        'aria-current': index === next ? 'step' : undefined,
        disabled: busy,
        onClick: () => selectPlacingStep(index),
      }, dot, step.label);
    });
  }

  // Edit-bar contents and button states (handoff §3). Called from updateViewer on every
  // notification; it only writes DOM, never the store.
  function updateEditBar(state, study) {
    const editor = editorFor(state, study);
    // Only a run on THIS study disables the edit bar; a run on another study leaves it alone.
    const busy = Boolean(study) && state.running === study.id;
    const windowOpen = Boolean(editor?.window?.open);
    const placing = editor?.placing ?? null;
    const showPlacement = Boolean(placing) && !windowOpen;
    setText(editLabel, windowOpen ? (placing ? WINDOW_PAUSED_LABEL : WINDOW_LABEL)
      : placing ? placingLabel(editor) : EDIT_LABEL);
    setText(editHelp, editHelpText(editor, windowOpen));
    // Rebuilt on every placing change (a new object per step) and when a run starts or ends (the chips' disabled state).
    const stepsKey = [showPlacement ? placing : null, busy];
    if (!sameKey(stepsKey, lastSteps)) {
      lastSteps = stepsKey;
      // A chip chosen from the keyboard is replaced by the rebuild; its successor at the same place keeps the focus.
      const focused = [...steps.children].indexOf(document.activeElement);
      steps.replaceChildren(...(showPlacement ? buildSteps(editor, busy) : []));
      const successor = focused >= 0 ? steps.children[focused] : null;
      if (successor instanceof HTMLButtonElement && !successor.disabled) successor.focus();
    }
    const circle = showPlacement && kindOf(placing.code) === 'circle';
    steps.classList.toggle('is-hidden', !showPlacement);
    fitButton.classList.toggle('is-hidden', !circle);
    // (R22) FIT follows finishPlacing's own rule: enough rim points, and a fit with a radius of at least 0.5 px.
    fitButton.disabled = busy || !circle || !canFinishPlacing(editor, imageSize());
    undoButton.classList.toggle('is-hidden', !showPlacement);
    // (G2) UNDO clears the most recently set point, so it is live while any point is set.
    undoButton.disabled = busy || !placing || placing.history.length === 0;
    placeCancelButton.classList.toggle('is-hidden', !showPlacement);
    placeCancelButton.disabled = busy;
    placeDivider.classList.toggle('is-hidden', !showPlacement);
    resetButton.disabled = busy || !study || !predictions.has(study.id);
    doneButton.disabled = busy;
  }

  // The window / level panel, its toolbar tool and the chip's window readout.
  function updateWindow(state, editor) {
    const wl = editor?.window ?? null;
    const open = Boolean(wl?.open);
    windowButton.classList.toggle('is-hidden', !state.editing);
    windowButton.classList.toggle('is-active', open);
    windowButton.setAttribute('aria-pressed', String(open));
    wlPanel.classList.toggle('is-hidden', !open);
    stage.classList.toggle('is-windowing', open);
    const ready = wl?.status === 'ready' && Boolean(wl.range);
    chipDivider.classList.toggle('is-hidden', !ready);
    chipWindow.classList.toggle('is-hidden', !ready);
    if (ready) setText(chipWindow, windowText(wl));
    if (!open) return;
    wlWidth.disabled = !ready;
    wlLevel.disabled = !ready;
    if (ready) {
      setSlider(wlWidth, wl.range.widthMin, wl.range.widthMax, wl.width);
      setSlider(wlLevel, wl.range.levelMin, wl.range.levelMax, wl.level);
    }
    setText(wlWidthValue, ready ? String(wl.width) : '\u2014');
    setText(wlLevelValue, ready ? String(wl.level) : '\u2014');
    const unavailable = wl.status === 'unavailable';
    wlNote.classList.toggle('is-hidden', !unavailable);
    setText(wlNote, unavailable ? (wl.reason ?? '') : '');
  }

  // Bounds before the value: a range input clamps an assigned value to its current min and max.
  function setSlider(input, min, max, value) {
    if (input.min !== String(min)) input.min = String(min);
    if (input.max !== String(max)) input.max = String(max);
    if (input.value !== String(value)) input.value = String(value);
  }

  // What the stage card shows for this study right now, or null when the film stands alone.
  // The demo branch comes FIRST. A demo study has measurements but neither geometry nor a
  // film, so every other branch would read it as an unprocessed real study and offer a Run
  // segmentation button whose only possible outcome is a "file is no longer available" toast.
  function describeCard(study, state, hasResult) {
    if (study.source === 'demo') {
      return {
        eyebrow: 'DEMO STUDY',
        title: 'No film for a demo study',
        body: 'Demo studies carry fabricated measurements for exploring the interface. There is no radiograph or segmentation to display.',
        spinner: false,
        button: null,
      };
    }
    // (2026-10-10, level editor) Edit mode keeps the stage clear: an unsegmented or failed film is
    // where levels are placed by hand (handoff §11), so no card covers it.
    if (state.editing) return null;
    // `busy` is THIS study's run; `otherRunning` is somebody else's. Everything the card SAYS
    // follows busy, so opening study B while A runs never claims B is running. Only the
    // button's `disabled` looks at any run at all, because only one run is allowed at a time,
    // and at a batch (batch spec 9): while one is up no single run starts. `queued` is this
    // study's place in the running batch -- QUEUED means that and nothing else; a film in no
    // batch reads UNSEGMENTED (spec decision 7), or FAILED when its last attempt failed (below).
    const busy = state.running === study.id;
    const otherRunning = Boolean(state.running) && !busy;
    const batch = state.batch ?? null;
    const queued = !busy && isQueued(batch, study.id);
    const waitTitle = batch ? WAIT_FOR_BATCH : (otherRunning ? WAIT_FOR_RUN : '');
    if (!hasResult && !busy && requiresAnteriorSide(study) && currentImages?.preview) return null;
    if (!hasResult && !busy && regionRunReason(study)) {
      return { eyebrow: studyRegion(study) === 'full_spine' ? 'FULL SPINE SETUP' : 'CERVICAL SETUP', title: 'Confirm image orientation',
        body: regionRunReason(study), spinner: false, button: null };
    }
    if (!hasResult && !busy && !inferenceView(study.view)) {
      return {
        eyebrow: 'UNSUPPORTED VIEW', title: 'Choose a lateral view',
        body: unsupportedViewReason(study.view), spinner: false, button: null,
      };
    }
    // (2026-10-01, issue #39; port spec 6) The last attempt failed: the stored reason, and
    // UNSEGMENTED's Run segmentation button under the same disabled rules and title. RUNNING and
    // QUEUED win -- a Failed film in a batch waits like any other. A film with results shows them;
    // the header pill and the region note carry its failure.
    if (!hasResult && !busy && !queued && study.processingError) {
      return {
        eyebrow: 'FAILED', title: 'Segmentation failed', body: study.processingError, spinner: false,
        button: { text: 'Run segmentation', disabled: Boolean(state.running) || Boolean(batch), title: waitTitle },
      };
    }
    if (!hasResult || busy) {
      return {
        eyebrow: busy ? 'RUNNING' : (queued ? 'QUEUED' : 'UNSEGMENTED'),
        title: busy ? progressTitle(state.runStage) : (queued ? 'Waiting for its turn in the batch' : 'No segmentation yet'),
        // Only backend-reported stages are shown.
        body: busy
          ? progressDetail(state.runStage)
          : (queued
            ? 'This study is in the running batch and will be segmented in turn.'
            : 'This study was uploaded but has not been processed. Run segmentation to generate measurements.'),
        spinner: busy,
        button: {
          text: busy ? 'Working…' : 'Run segmentation',
          disabled: Boolean(state.running) || Boolean(batch),
          title: waitTitle,
        },
      };
    }
    if (filmStatus === 'loading') {
      return { eyebrow: 'LOADING', title: 'Loading the film…', body: 'Reading the saved segmentation for this study.', spinner: true, button: null };
    }
    if (filmStatus === 'missing') {
      return {
        eyebrow: 'FILM UNAVAILABLE',
        title: 'The saved segmentation was not found',
        body: 'The film and overlay for this study are missing from this profile. Re-run segmentation to restore them; the measurements are unchanged.',
        spinner: false,
        button: {
          text: 'Re-run segmentation',
          disabled: Boolean(state.running) || Boolean(batch),
          title: waitTitle,
        },
      };
    }
    return null;
  }

  // The ONLY writer of the card's nodes. Writes every property on every call.
  function applyCard(card) {
    runCard.classList.toggle('is-hidden', !card);
    if (!card) return;
    runEyebrow.textContent = card.eyebrow;
    runTitle.textContent = card.title;
    runBody.textContent = card.body;
    runSpinner.classList.toggle('is-hidden', !card.spinner);
    cancelButton.classList.toggle('is-hidden', !card.spinner);
    const progress = getState().runStage;
    cancelButton.disabled = Boolean(progress?.cancelling) || progress?.stage === 'saving';
    runButton.classList.toggle('is-hidden', !card.button);
    runButton.textContent = card.button ? card.button.text : '';
    runButton.disabled = card.button ? card.button.disabled : true;
    runButton.title = card.button ? card.button.title : '';
  }

  // Keyboard lives on window: the canvas is not focusable and the shortcuts must work
  // wherever focus happens to be on the Analysis screen, except inside a text control.
  function handleKeyDown(event) {
    const state = getState();
    // The study is resolved up here, not at the arrow branch, because the busy check below
    // needs it: `running` is the running study's id, so a run on another study must not
    // swallow this study's keys. A null study is never busy.
    const study = currentStudy();
    const busy = Boolean(study) && state.running === study.id;
    const target = event.target instanceof Element ? event.target : null;
    if (!state.editing) {
      if (target && target.closest('input, select, textarea, [contenteditable="true"]')) return;
      // Outside edit mode Escape clears the construction -- the keyboard's way to get a
      // label plate off the stage. Inside edit mode Escape belongs to the level editor (below).
      if (event.key === 'Escape' && state.selectedLevel !== null && !drag) setState({ selectedLevel: null });
      return;
    }
    if (target && target.closest(TEXT_ENTRY)) return;
    if (busy || drag) return;
    const editor = editorFor(state, study);
    if (event.key === 'Escape') {
      // One thing at a time: the exit prompt (Keep editing), a placement, the window / level panel, then
      // edit mode itself -- which asks first when something is unsaved (D7).
      event.preventDefault();
      if (editor?.exitPrompt) keepEditing();
      else if (editor?.placing) cancelPlace();
      else if (editor?.window?.open) closeWindowPanel();
      else requestExit();
      return;
    }
    // Handles are disabled while placing or while the window / level panel is open (handoff §6).
    if (!editor || editor.placing || editor.window?.open) return;
    if (event.key === 'Tab') {
      // Inside the edit bar, the window / level panel and the levels panel, Tab stays ordinary focus
      // movement so their controls remain keyboard-operable once focus is there (BD-11 d).
      if (target && target.closest(OWN_TAB_ORDER)) return;
      const next = nextLevelHandle(editor, event.shiftKey ? -1 : 1);
      if (!next) return;
      event.preventDefault();
      if (editor.selected !== next.code) selectLevelRow(next.code);
      setFocusedHandle(next);
      return;
    }
    // Arrows nudge the focused handle by 1 px (Shift: 10), clamped to the film. A focused slider keeps
    // its own arrows. Delete and Backspace do nothing in the level editor.
    const delta = arrowKeyDelta(event.key, event.shiftKey);
    if (!delta || !editor.handle || !currentImages) return;
    if (target && target.matches('input[type="range"]')) return;
    const { code, handle } = editor.handle;
    const entry = editor.levels[code];
    const from = entry?.visible && entry.geometry ? handleAt(code, entry.geometry, handle) : null;
    if (!from) return;
    event.preventDefault();
    const [x, y] = clampToImage([from[0] + delta.dx, from[1] + delta.dy]);
    if (x === from[0] && y === from[1]) return;
    commitHandleMove(code, nudgeHandle(code, entry.geometry, handle, x - from[0], y - from[1]));
  }

  stage.addEventListener('wheel', handleWheel, { passive: false });
  stage.addEventListener('contextmenu', handleContextMenu);
  host.addEventListener('pointerdown', handleHostPointerDown);
  dynamicCanvas.addEventListener('pointerdown', handlePointerDown);
  dynamicCanvas.addEventListener('pointermove', handlePointerMove);
  dynamicCanvas.addEventListener('pointerleave', handlePointerLeave);
  dynamicCanvas.addEventListener('pointerup', handlePointerUp);
  dynamicCanvas.addEventListener('pointercancel', handlePointerUp);
  dynamicCanvas.addEventListener('click', handleClick);
  window.addEventListener('keydown', handleKeyDown);

  function detach() {
    stage.removeEventListener('wheel', handleWheel);
    stage.removeEventListener('contextmenu', handleContextMenu);
    host.removeEventListener('pointerdown', handleHostPointerDown);
    dynamicCanvas.removeEventListener('pointerdown', handlePointerDown);
    dynamicCanvas.removeEventListener('pointermove', handlePointerMove);
    dynamicCanvas.removeEventListener('pointerleave', handlePointerLeave);
    dynamicCanvas.removeEventListener('pointerup', handlePointerUp);
    dynamicCanvas.removeEventListener('pointercancel', handlePointerUp);
    dynamicCanvas.removeEventListener('click', handleClick);
    window.removeEventListener('keydown', handleKeyDown);
    labelChip.removeEventListener('pointerdown', handleLabelPointerDown);
    labelChip.removeEventListener('pointermove', handleLabelPointerMove);
    labelChip.removeEventListener('pointerup', handleLabelPointerUp);
    labelChip.removeEventListener('pointercancel', handleLabelPointerUp);
    resizeObserver.disconnect();
    // Every gesture kind ends with the mount: pan, level handle, window drag, label.
    drag = null;
    suppressClick = false;
    forgetPlacePress();
    stage.classList.remove('is-panning', 'is-windowing', 'is-dragging-handle', 'is-over-handle');
    labelOffsets = new Map();
    labelStudyId = null;
  }

  function applyTransform(state) {
    // The two per-frame node writes BD-3 sanctions. Everything else below is a class.
    host.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    fillSlider.value = String(state.overlayOpacity);

    zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
    stage.classList.toggle('is-pan-mode', state.panMode);
    panButton.classList.toggle('is-active', state.panMode);
    overlayButton.classList.toggle('is-active', state.overlays);
    panButton.setAttribute('aria-pressed', String(state.panMode));
    overlayButton.setAttribute('aria-pressed', String(state.overlays));
  }

  // Stores the decoded bitmaps and sizes the canvases to them. Deliberately does NOT
  // dispose the outgoing set: screens/analysis.js owns image lifetime and caches one
  // study's images across navigation, so disposing here would close bitmaps that are
  // still owned elsewhere. See BD-6.
  function setImages(images) {
    if (images === currentImages) return;
    currentImages = images;
    if (images) {
      // A film in hand ends whatever the sidecar read was reporting. The contract's sidecar
      // section says a re-run recreates a missing film; without this the FILM UNAVAILABLE card
      // and the disabled edit toggle would survive the re-run that fixed them, because a run
      // completing is not a restore and never calls setFilmStatus. restoreFilm still clears the
      // status explicitly before it gets here, so its path reads the same either way.
      filmStatus = null;
      sizeCanvases({ staticCanvas, dynamicCanvas }, images.width, images.height);
    }
    lastStatic = null;
    lastDynamic = null;
  }

  // 'loading' while the prediction sidecar is being read, 'missing' when it is not there, null
  // once the film is in hand. Repaints immediately so the card and the toolbar follow it: the
  // whole transition happens inside one mount, with no store change to ride on.
  function setFilmStatus(status) {
    filmStatus = status;
    const study = currentStudy();
    if (study) updateViewer(study);
  }

  function updateViewer(study) {
    const state = getState();
    // state.running is the id of the study whose /predict is in flight, so "busy" is only
    // true for the study on screen. A run on another study leaves this one alone.
    const busy = state.running === study.id;
    const editor = editorFor(state, study);
    applyTransform(state);
    if (study.id !== labelStudyId) {
      labelStudyId = study.id;
      labelOffsets = new Map();
    }
    setText(chipId, study.id);
    setText(footer, footerText(study));

    const hasResult = Boolean(study.measurements && study.geometry);
    applyCard(describeCard(study, state, hasResult));

    // Edit mode must not start under THIS study's own running prediction, nor while the saved film
    // is loading or missing (the levels are drawn in the stored film's pixel space; re-run is the
    // remedy for a missing one). It needs a film: the stored image, one already on the stage, or a
    // source file the level editor can decode (an unsegmented or failed film, handoff §11) -- entering
    // edit mode loads it. Re-run is the one control that answers to ANY run in flight, because only
    // one run is allowed at a time. A demo study has no film, no geometry and no source file.
    const canDecode = Boolean(study.filePath);
    editButton.disabled = busy || filmStatus !== null || (!hasResult && !currentImages && !canDecode);
    // Re-run answers to ANY run in flight and to a batch, because only one run is allowed at a time.
    // (2026-10-10, ruling R17) And not while editing: a run would replace the levels under the editor and
    // drop its unsaved edits without the exit prompt, and edit mode hides the RUNNING card and its Cancel.
    rerunButton.disabled = !hasResult || Boolean(state.running) || Boolean(state.batch) || filmStatus === 'loading' || !inferenceView(study.view) || Boolean(regionRunReason(study))
      || state.editing;
    rerunButton.title = state.editing ? 'Finish editing before re-running segmentation'
      : inferenceView(study.view) ? 'Re-run segmentation' : unsupportedViewReason(study.view);
    editButton.setAttribute('aria-pressed', String(state.editing));
    editButton.classList.toggle('is-active', state.editing);
    const editButtonLabel = state.editing ? 'Done editing' : 'Edit segmentation';
    editButton.title = editButtonLabel;
    editButton.setAttribute('aria-label', editButtonLabel);
    editBar.classList.toggle('is-hidden', !state.editing);
    stage.classList.toggle('is-editing', state.editing);
    if (!editor) stage.classList.remove('is-over-handle');
    updateEditBar(state, study);
    updateWindow(state, editor);

    // (2026-10-10) While editing, the film layer shows the decoded original at the editor's window once
    // it is ready (display only, D1/D11) and leaves the mask overlay off: the editor draws the levels.
    const wl = editor?.window ?? null;
    const staticKey = [state.overlays, state.overlayOpacity, currentImages, state.editing, wl?.width, wl?.level, wl?.status];
    if (!sameKey(staticKey, lastStatic)) {
      lastStatic = staticKey;
      drawStaticLayer(staticCtx, staticCanvas, currentImages, {
        overlays: state.overlays,
        overlayOpacity: state.overlayOpacity,
        editing: state.editing,
        window: wl?.status === 'ready' ? { width: wl.width, level: wl.level } : null,
      });
    }

    // editing, selection and zoom are in the key: handles appear and disappear with
    // editing, follow selection, and are sized in CSS pixels so zoom changes their image-
    // space size. panX/panY are deliberately NOT here -- a pan moves the host, not the pixels.
    // The level editor is in it (every action builds a new one), and so are the overlay toggle
    // and the fill while editing: the editor's level fills follow both.
    const dynamicKey = [study.calibration, study.geometry, state.measurementDrafts?.[study.id], state.selectedLevel, study.measurements, state.editing, state.selection, state.zoom,
      state.levelEditor, editor ? state.overlays : null, editor ? state.overlayOpacity : null];
    if (!sameKey(dynamicKey, lastDynamic)) {
      lastDynamic = dynamicKey;
      redrawDynamic(liveGeometry());
    }
  }

  function setRunHandler(handler) {
    runHandler = handler;
    runButton.onclick = handler;
  }

  return { updateViewer, setImages, setFilmStatus, setRunHandler, detach };
}
