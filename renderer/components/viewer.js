import { el } from '../dom.js';
import { getState, setState } from '../store.js';
import { measure } from '../api.js';
import { showToast } from './toast.js';
import {
  createLayeredCanvases, sizeCanvases, drawStaticLayer, drawDynamicLayer, constructionLabel,
} from '../viewer/canvas.js';
import { clientToImage, imageToClient, nearestLandmark, setLandmarkAt, femoralCircle, setFemoralCircle, fitCircle } from '../viewer/geometry.js';
import { zoomIn, zoomOut, zoomAbout, isChordHeld, vertebraAt, sameHandle, hitTestFemoral, nextSelection, nudge, arrowKeyDelta } from '../viewer/interactions.js';
import { createMeasureQueue } from '../viewer/measure-queue.js';
import { isQueued, WAIT_FOR_BATCH, WAIT_FOR_RUN } from '../data/batch.js';
import { inferenceView, unsupportedViewReason } from '../data/inference-view.js';
import { progressTitle, progressDetail } from '../data/processing.js';
import { cancelProcessing } from '../processing.js';

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
  overlays: `${SVG_OPEN}<path d="M12 3 L21 8 L12 13 L3 8 Z"></path><path d="M3 14 L12 19 L21 14"></path></svg>`,
  edit: `${SVG_OPEN}<path d="M12 20 H21"></path><path d="M16.5 3.5 a2.1 2.1 0 0 1 3 3 L7 19 L3 20 L4 16 Z"></path></svg>`,
  rerun: `${SVG_OPEN}<path d="M21 4 V10 H15"></path><path d="M3 20 V14 H9"></path><path d="M20.5 9.5 A8 8 0 0 0 5.6 6.6 L3 9"></path><path d="M3.5 14.5 A8 8 0 0 0 18.4 17.4 L21 15"></path></svg>`,
};

const MEASURE_DEBOUNCE_MS = 150;

// ---------------------------------------------------------------------------
// Transient interaction state. Module scope, NOT the store, per the architecture
// contract's viewer/interactions.js section: only committed geometry reaches the store.
//
// One `drag` for every kind of gesture -- pan, landmark handle, femoral handle -- so two
// gestures can never be live at once and there is one place to look for what the pointer
// is doing. Plan 03 kept the pan drag in a closure inside interactions.js; it moved here so
// plan 04's handle drag would not become a second copy. detach() resets all of it.
let drag = null;           // {kind:'pan', pointerId, clientX, clientY, panX, panY} | {kind:'handle', ...} | {kind:'label', ...} | null
let suppressClick = false; // a pointerdown that started a gesture eats the click that follows it
let hover = null;          // Selection | null -- the handle under the pointer
let retracing = false;
let tracePoints = [];      // [x, y][] in image space
// Which pointer placed the last retrace point, so a chord that starts as a left press in
// retrace mode can take that point back -- the retrace branch sets no `drag`, so nothing else
// would undo it and a stray point would survive the pan into fitCircle.
let tracePointPointer = null;

// Where the user has dragged each construction's label, in image pixels, for the open study.
let labelOffsets = new Map(); // construction key ('L3', 'PI', ...) -> {dx, dy}
let labelStudyId = null;

const measureQueue = createMeasureQueue({ measure, getState, setState, showToast, debounceMs: MEASURE_DEBOUNCE_MS });
const { commitGeometry } = measureQueue;

// ---------------------------------------------------------------------------
// The raw /predict output per study: the target of RESET TO PREDICTION. Kept off the Study
// record (plan 05 persists and validates that record) and keyed by id, so a reset always
// returns to THIS study's own prediction, however many studies were opened in between.
const predictions = new Map();

export function recordPrediction(studyId, { measurements, geometry }, measuredGeometry = geometry) {
  // A sidecar read back from disk is the one caller that can hand this an object missing
  // either half. structuredClone(undefined) stores undefined, and `predictions.has(id)` then
  // enables RESET TO PREDICTION over a snapshot that has nothing to reset to. No snapshot is
  // recorded, and nothing else is touched: the study keeps whatever it already had, and the
  // button stays disabled, which is what "there is no prediction to return to" looks like.
  if (measurements == null || geometry == null) return;
  const snapshot = { measurements: structuredClone(measurements), geometry: structuredClone(geometry) };
  predictions.set(studyId, snapshot);
  // A correction still pending or in flight belongs to the geometry this prediction just
  // replaced; only THIS study's is dropped. `measuredGeometry` is the geometry the study's
  // CURRENT measurements describe. It is the prediction's own for a fresh run; for a corrected
  // study restored from disk it is the stored geometry, so a failed /measure restores the
  // correction, never the prediction.
  measureQueue.replaceMeasured(studyId, measuredGeometry);
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
// because nothing mutates the store's geometry in place: /predict and /measure replace it
// wholesale, and every edit in this file works on a structuredClone and commits that clone
// as a new reference (see handlePointerUp, handleKeyDown, applyFit, resetToPrediction).
function sameKey(a, b) {
  return a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i]);
}

function currentStudy() {
  const state = getState();
  const study = state.studies.find((s) => s.id === state.openId) ?? null;
  const draft = state.measurementDrafts?.[state.openId];
  return study && draft ? { ...study, geometry: draft } : study;
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

  const chipId = el('div', { class: 'viewer-chip-id' });
  const chip = el('div', { class: 'viewer-chip' }, chipId);

  const zoomLabel = el('div', { class: 'viewer-zoom' }, '100%');
  const panButton = toolButton('Pan', ICONS.pan, () => setState((s) => ({ panMode: !s.panMode })), { 'aria-pressed': 'false' });
  const overlayButton = toolButton('Toggle segmentation overlay', ICONS.overlays, () => setState((s) => ({ overlays: !s.overlays })), { 'aria-pressed': 'false' });
  const editButton = toolButton('Edit landmarks', ICONS.edit, () => {
    if (getState().editing) exitEditMode();
    // Entering edit mode drops the pan toggle: with it on, a primary-button drag pans and the
    // handle press underneath never happens, so pressing Edit and then finding you cannot move
    // a landmark was the whole complaint. Panning is not taken away -- the middle button and
    // the left+right chord both still pan in every mode, edit included.
    //
    // ONE-WAY on purpose. Pressing Pan while already editing must keep pan winning: that is a
    // signed-off behaviour asserted by tools/smoke/smoke-gate1.mjs and stated in the gesture
    // comment on handlePointerDown. Do not make this symmetric without changing those too.
    // exitEditMode does not restore the toggle, so DONE/Escape returns with Pan off.
    else setState({ editing: true, panMode: false });
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
    overlayButton,
    el('div', { class: 'viewer-divider' }),
    el('div', { class: 'viewer-fill' },
      el('div', { class: 'viewer-fill-label' }, 'FILL'),
      fillSlider),
    el('div', { class: 'viewer-divider' }),
    editButton,
    rerunButton);

  // Shown only while editing: RETRACE, FIT and RESET TO PREDICTION alongside DONE.
  const retraceButton = textButton('RETRACE', () => toggleRetrace(), { 'aria-pressed': 'false', disabled: true });
  const fitButton = textButton('FIT', () => applyFit(), { disabled: true });
  const resetButton = textButton('RESET TO PREDICTION', () => resetToPrediction(), { disabled: true });
  const doneButton = textButton('DONE', () => exitEditMode());
  const editBar = el('div', { class: 'viewer-editbar is-hidden' },
    el('div', { class: 'viewer-editbar-label' }, 'EDITING LANDMARKS'),
    retraceButton,
    fitButton,
    resetButton,
    doneButton);

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

  stage.append(host, chip, toolbar, editBar, footer, runCard);
  container.append(stage);

  let currentImages = null;
  let lastStatic = null;
  let lastDynamic = null;

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

  // The geometry the stage should show right now: a live drag's working copy, else the store's.
  function liveGeometry() {
    if (drag && drag.kind === 'handle') return drag.geometry;
    const study = currentStudy();
    return study ? study.geometry : null;
  }

  // The ONE place the dynamic layer is drawn from. Store-driven redraws reach it through
  // updateViewer's reference-keyed gate; per-frame drag and hover redraws call it directly
  // with the working geometry. Both compose the same options, so there is exactly one
  // notion of what the dynamic layer shows.
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
    drawDynamicLayer(dynamicCtx, dynamicCanvas, geometry, {
      selectedLevel: state.selectedLevel,
      measurements: study && !state.measurementDrafts?.[study.id] ? study.measurements : null,
      editing: state.editing,
      selection: state.selection,
      hover,
      tracePoints,
      retracing,
      pixelRatio: pixelRatio(),
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
      study && !state.measurementDrafts?.[study.id] ? study.measurements : null);
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

  // Landmarks first, then femoral handles. The two sets are anatomically far apart, so the
  // order only matters in a degenerate geometry.
  function hitTestHandle(geometry, event) {
    const landmark = nearestLandmark(geometry, event.clientX, event.clientY, dynamicCanvas);
    if (landmark) return { kind: 'landmark', level: landmark.level, corner: landmark.corner };
    // hitTestFemoral is coordinate-space agnostic; feed it the circles in CLIENT space so
    // the hit radius is a constant 14 CSS pixels at any zoom, as nearestLandmark's is.
    const rect = dynamicCanvas.getBoundingClientRect();
    const scale = rect.width / dynamicCanvas.width;
    const circles = geometry.femoral_circles.map(([cx, cy, r]) => [...imageToClient([cx, cy], rect, dynamicCanvas), r * scale]);
    return hitTestFemoral(circles, event.clientX, event.clientY);
  }

  function setHover(next) {
    if (next === hover || sameHandle(hover, next)) return;
    hover = next;
    stage.classList.toggle('is-over-handle', Boolean(hover));
    redrawDynamic(liveGeometry());
  }

  function clearHover() {
    hover = null;
    stage.classList.remove('is-over-handle');
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
    // A LEFT-first chord in retrace mode has already appended a point. Take it back.
    if (tracePointPointer === event.pointerId && tracePoints.length > 0) {
      tracePoints = tracePoints.slice(0, -1);
      updateEditBar(getState(), currentStudy());
    }
    tracePointPointer = null;
    startPan(event, true);
    stage.classList.remove('is-dragging-handle');
    clearHover();
    // Load-bearing: panX/panY are absent from dynamicKey, so nothing else repaints and an
    // abandoned handle drag's working copy would stay painted. liveGeometry() returns the
    // store's geometry here because drag.kind is already 'pan'.
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

  // Gesture precedence: a LEFT+RIGHT chord pans in every mode and outranks everything below
  // it, including a handle drag while editing; the middle button pans in every mode; the
  // primary button pans when the pan toggle is on; while editing, a retrace press places a
  // point and a handle press starts a handle drag. A second pointer while a gesture is live is
  // ignored. The construction label has its own drag -- see handleLabelPointerDown below.
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
    const state = getState();
    if (event.button === 1 || (event.button === 0 && state.panMode)) {
      event.preventDefault();
      startPan(event);
      return;
    }
    if (event.button !== 0) return;
    const study = currentStudy();
    if (!study || !study.geometry) return;
    // Busy means THIS study's /predict is in flight. A run on a different study must not
    // freeze this one's handles (state.running is that study's id, not a boolean).
    const busy = state.running === study.id;
    if (state.editing && !busy) {
      if (retracing) {
        event.preventDefault();
        suppressClick = true;
        tracePoints = [...tracePoints, clientToImage(event, dynamicCanvas)];
        // Remember whose press this was, so a chord completed by the OTHER button can take the
        // point back rather than leaving a stray one to reach fitCircle.
        tracePointPointer = event.pointerId;
        updateEditBar(state, study);
        redrawDynamic(liveGeometry());
        return;
      }
      const hit = hitTestHandle(study.geometry, event);
      if (hit) {
        event.preventDefault();
        suppressClick = true;
        // Drag a WORKING COPY. The store's geometry is never mutated in place: the copy is
        // committed as a new reference on release, which is what this file's reference-keyed
        // redraw gate and router.js's key sets both require.
        drag = { kind: 'handle', pointerId: event.pointerId, selection: hit, geometry: structuredClone(study.geometry), studyId: study.id, moved: false };
        dynamicCanvas.setPointerCapture(event.pointerId);
        stage.classList.add('is-dragging-handle');
        setState({ selection: hit });
        return;
      }
    }
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
      const state = getState();
      if (!state.editing || retracing) return;
      const study = currentStudy();
      if (!study || !study.geometry) return;
      setHover(hitTestHandle(study.geometry, event));
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
    const point = clientToImage(event, dynamicCanvas);
    const { selection, geometry } = drag;
    if (selection.kind === 'landmark') {
      setLandmarkAt(geometry, selection.level, selection.corner, point);
    } else if (selection.part === 'center') {
      const [, , r] = femoralCircle(geometry, selection.side);
      setFemoralCircle(geometry, selection.side, [point[0], point[1], r]);
    } else {
      // Radius floored at 1px in setFemoralCircle: the backend rejects a non-positive
      // radius, and dragging the rim back through the centre must shrink smoothly, never
      // flip or go negative.
      const [cx, cy] = femoralCircle(geometry, selection.side);
      setFemoralCircle(geometry, selection.side, [cx, cy, Math.hypot(point[0] - cx, point[1] - cy)]);
    }
    drag.moved = true;
    redrawDynamic(geometry);
  }

  function handlePointerLeave() {
    if (!drag) setHover(null);
  }

  function handlePointerUp(event) {
    if (drag && event.pointerId !== drag.pointerId) return;
    if (dynamicCanvas.hasPointerCapture(event.pointerId)) dynamicCanvas.releasePointerCapture(event.pointerId);
    const ended = drag;
    drag = null;
    stage.classList.remove('is-dragging-handle');
    // Covers the ordinary pan, a chord released as one simultaneous pointerup, and pointercancel.
    stage.classList.remove('is-panning');
    if (!ended || ended.kind !== 'handle') return;
    // A cancelled gesture (pen lifted out of range, window lost the pointer) discards the
    // working copy: the store still holds the pre-drag geometry, so redraw from it.
    if (event.type === 'pointercancel' || !ended.moved) {
      redrawDynamic(liveGeometry());
      return;
    }
    commitGeometry(ended.studyId, ended.geometry);
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
  // A click that ended a gesture is not a selection.
  function handleClick(event) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const study = currentStudy();
    if (!study || !study.geometry) return;
    const level = vertebraAt(study.geometry, clientToImage(event, dynamicCanvas));
    // Clicking the selected vertebra again, or empty stage, clears the construction.
    const state = getState();
    const next = level && level !== state.selectedLevel ? level : null;
    if (next !== state.selectedLevel) setState({ selectedLevel: next });
  }

  // Retrace is bound to the selected femoral side (Task 14). Any selection change, and
  // every exit from edit mode, ends it.
  function cancelRetrace() {
    retracing = false;
    tracePoints = [];
    tracePointPointer = null;
  }

  // The one way out of edit mode. Clears every piece of transient edit state before the
  // store update so updateViewer sees a consistent picture.
  function exitEditMode() {
    cancelRetrace();
    clearHover();
    setState({ editing: false, selection: null });
  }

  function toggleRetrace() {
    const state = getState();
    if (!state.selection || state.selection.kind !== 'femoral') return;
    const next = !retracing;
    cancelRetrace();
    retracing = next;
    // No hover highlight while placing points. Cleared directly (not via setHover) so
    // this handler redraws exactly once.
    clearHover();
    updateEditBar(state, currentStudy());
    redrawDynamic(liveGeometry());
  }

  function applyFit() {
    const state = getState();
    const study = currentStudy();
    if (!study || !study.geometry || !state.selection || state.selection.kind !== 'femoral') return;
    const fitted = fitCircle(tracePoints);
    if (!fitted) {
      // Collinear points have no circle. Never apply a guess.
      showToast('Those points do not describe a circle. Place them along the head contour.');
      return;
    }
    const geometry = structuredClone(study.geometry);
    setFemoralCircle(geometry, state.selection.side, fitted);
    cancelRetrace();
    commitGeometry(study.id, geometry);
  }

  function resetToPrediction() {
    const study = currentStudy();
    const predicted = study ? predictions.get(study.id) : null;
    if (!predicted) return;
    cancelRetrace();
    // No /measure: the snapshot IS the prediction's own numbers. Orphan anything in flight.
    measureQueue.replaceMeasured(study.id, predicted.geometry);
    setState((current) => ({
      selection: null,
      studies: current.studies.map((item) => (item.id === study.id
        // The prediction's own numbers replace the corrected ones (studies-table spec 8.4, site 3).
        ? { ...item, measurements: structuredClone(predicted.measurements), geometry: structuredClone(predicted.geometry), reviewedAt: null }
        : item)),
    }));
  }

  // Edit-bar button states. Called from updateViewer on every notification and directly by
  // the retrace handlers; it only writes DOM, never the store.
  function updateEditBar(state, study) {
    // Only a run on THIS study disables the edit bar; a run on another study leaves it alone.
    // A null study is never busy -- toggleRetrace passes currentStudy(), which may be null.
    const busy = Boolean(study) && state.running === study.id;
    const femoralSelected = Boolean(state.selection && state.selection.kind === 'femoral');
    retraceButton.disabled = busy || !femoralSelected;
    retraceButton.setAttribute('aria-pressed', String(retracing));
    retraceButton.classList.toggle('is-active', retracing);
    fitButton.disabled = busy || !retracing || tracePoints.length < 3;
    resetButton.disabled = busy || !study || !predictions.has(study.id);
    doneButton.disabled = busy;
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
    // `busy` is THIS study's run; `otherRunning` is somebody else's. Everything the card SAYS
    // follows busy, so opening study B while A runs never claims B is running. Only the
    // button's `disabled` looks at any run at all, because only one run is allowed at a time,
    // and at a batch (batch spec 9): while one is up no single run starts. `queued` is this
    // study's place in the running batch -- QUEUED means that and nothing else; a film in no
    // batch reads UNSEGMENTED (spec decision 7).
    const busy = state.running === study.id;
    const otherRunning = Boolean(state.running) && !busy;
    const batch = state.batch ?? null;
    const queued = !busy && isQueued(batch, study.id);
    const waitTitle = batch ? WAIT_FOR_BATCH : (otherRunning ? WAIT_FOR_RUN : '');
    if (!hasResult && !busy && !inferenceView(study.view)) {
      return {
        eyebrow: 'UNSUPPORTED VIEW', title: 'Choose a lateral view',
        body: unsupportedViewReason(study.view), spinner: false, button: null,
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
  // Tab and Arrow branches follow the Escape branch below.
  function handleKeyDown(event) {
    const state = getState();
    // The study is resolved up here, not at the arrow branch, because the busy check below
    // needs it: `running` is the running study's id, so a run on another study must not
    // swallow this study's keys. A null study is never busy.
    const study = currentStudy();
    const busy = Boolean(study) && state.running === study.id;
    if (event.target instanceof Element && event.target.matches('input, select, textarea')) return;
    if (!state.editing) {
      // Outside edit mode Escape clears the construction -- the keyboard's way to get a
      // label plate off the stage. Inside edit mode Escape exits editing (below).
      if (event.key === 'Escape' && state.selectedLevel !== null && !drag) setState({ selectedLevel: null });
      return;
    }
    if (busy || drag) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      exitEditMode();
      return;
    }
    if (event.key === 'Tab') {
      // Inside the edit bar, Tab stays ordinary focus movement so RETRACE / FIT / RESET /
      // DONE remain keyboard-operable once focus is there (BD-11 d).
      if (event.target instanceof Element && event.target.closest('.viewer-editbar')) return;
      event.preventDefault();
      cancelRetrace(); // retrace is bound to the selected side; a new selection ends it
      setState({ selection: nextSelection(state.selection, event.shiftKey ? -1 : 1, liveGeometry()) });
      return;
    }
    const delta = arrowKeyDelta(event.key, event.shiftKey);
    if (!delta || !state.selection) return;
    if (!study || !study.geometry) return;
    event.preventDefault();
    const geometry = structuredClone(study.geometry);
    nudge(geometry, state.selection, delta.dx, delta.dy);
    commitGeometry(study.id, geometry);
  }

  stage.addEventListener('wheel', handleWheel, { passive: false });
  stage.addEventListener('contextmenu', handleContextMenu);
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
    drag = null;
    suppressClick = false;
    hover = null;
    retracing = false;
    tracePoints = [];
    tracePointPointer = null;
    stage.classList.remove('is-panning');
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
    applyTransform(state);
    if (study.id !== labelStudyId) {
      labelStudyId = study.id;
      labelOffsets = new Map();
    }
    chipId.textContent = study.id;
    footer.textContent = footerText(study);

    const hasResult = Boolean(study.measurements && study.geometry);
    applyCard(describeCard(study, state, hasResult));

    // Edit mode needs geometry to edit and must not start under THIS study's own running
    // prediction. A study whose film is missing must still be able to re-run -- that is the
    // remedy -- but must not be editable until the film is back: the handles are drawn in the
    // film's pixel space. Re-run is the one control that answers to ANY run in flight, because
    // only one run is allowed at a time. A demo study has neither measurements nor geometry,
    // so hasResult keeps both disabled for it.
    editButton.disabled = !hasResult || busy || filmStatus !== null;
    // Re-run answers to ANY run in flight and to a batch, because only one run is allowed at a time.
    rerunButton.disabled = !hasResult || Boolean(state.running) || Boolean(state.batch) || filmStatus === 'loading' || !inferenceView(study.view);
    rerunButton.title = inferenceView(study.view) ? 'Re-run segmentation' : unsupportedViewReason(study.view);
    editButton.setAttribute('aria-pressed', String(state.editing));
    editButton.classList.toggle('is-active', state.editing);
    const editLabel = state.editing ? 'Done editing' : 'Edit landmarks';
    editButton.title = editLabel;
    editButton.setAttribute('aria-label', editLabel);
    editBar.classList.toggle('is-hidden', !state.editing);
    stage.classList.toggle('is-editing', state.editing);
    updateEditBar(state, study);

    const staticKey = [state.overlays, state.overlayOpacity, currentImages];
    if (!sameKey(staticKey, lastStatic)) {
      lastStatic = staticKey;
      drawStaticLayer(staticCtx, staticCanvas, currentImages, {
        overlays: state.overlays,
        overlayOpacity: state.overlayOpacity,
      });
    }

    // editing, selection and zoom are in the key: handles appear and disappear with
    // editing, follow selection, and are sized in CSS pixels so zoom changes their image-
    // space size. panX/panY are deliberately NOT here -- a pan moves the host, not the pixels.
    const dynamicKey = [study.geometry, state.measurementDrafts?.[study.id], state.selectedLevel, study.measurements, state.editing, state.selection, state.zoom];
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
