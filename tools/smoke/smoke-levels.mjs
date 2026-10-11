// The level editor (plan 2026-10-10 Task 14) against the real, running app: the Vertebral levels panel, placing a
// level (the step chips choose which point the next click sets: gate feedback G2, 2026-10-11), unchecking one, Save
// edits and the label record on disk, Discard and the exit prompt, femoral rim points and FIT, window / level, the
// keyboard, the per-study stash, and the main process's label-file name check. Section 17 (gate feedback G3 and G4,
// 2026-10-11): window / level outside edit mode -- the toolbar button, the panel, the chip, the window kept across
// edit mode and reset by opening another study (D15), the right-button drag (D16) and the double right-click (D17).
// The window is the view's, `state.filmWindow` (renderer/film-window.js), read through `window.__lv.filmWindow()`.
//
//   node tools/smoke/launch.mjs                                     (SPINE_CONTOUR_USER_DATA under %TEMP%)
//   node tools/smoke/smoke-levels.mjs                               phase `dom` (the default)
//   SMOKE_PHASE=film node tools/smoke/smoke-levels.mjs <real film>  phase `film`
//   node tools/smoke/cdp.mjs --quit
//
// Phase `dom`: no model run and no real film. Two synthetic, canvas-drawn films: SP-9300, a segmented fixture whose
// geometry is the prototype's (L1, L2, L4, L5, S1 and two heads; L3 missing) with an all-zero mask, measured by the
// real /measure; and SP-9301, an unsegmented film written to %TEMP% and placed by hand, decoded by the real /decode.
// Section 17 adds SP-9303, a study with no film, only so that another study can be opened and left.
// Phase `film`: one real lateral lumbar film, segmented by the real models as SP-9302 (backend/onnx must hold the
// graphs). A REAL FILM IS ON SCREEN IN THAT PHASE: this suite takes no screenshots in either phase, and every check
// is a DOM, store or file read.
//
// The scratch profile is SMOKE_USER_DATA, else SPINE_CONTOUR_USER_DATA (launch.mjs prints it), else launch.mjs's
// default. The label records are read from <userData>/labels/. Every selector is a class or a data attribute;
// visible text is read only where the check is about the text. Exit code 1 on any failed check; the injected studies,
// their sidecars and label records are removed in `finally`, and the store keys touched are reset.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp-lib.mjs';
import { validateAgainst } from '../../test/fixtures/schema-check.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PHASE = process.env.SMOKE_PHASE || 'dom';
const USER_DATA = process.env.SMOKE_USER_DATA || process.env.SPINE_CONTOUR_USER_DATA || path.join(os.tmpdir(), 'spine-contour-smoke');
const LABELS = path.join(USER_DATA, 'labels');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'design', 'level-editor', 'label-record.schema.json'), 'utf8'));
const FILM_DIR = path.join(os.tmpdir(), 'spine-contour-levels-films');

const SEG = 'SP-9300';   // the segmented fixture (dom)
const HAND = 'SP-9301';  // the unsegmented synthetic film, placed by hand (dom)
const REAL = 'SP-9302';  // the real film (film)
const OTHER = 'SP-9303'; // a study with no film, opened and left in section 17 (dom)
const SEG_FILE = 'levels-ui-check.png';
const HAND_FILE = 'levels-hand-placed.png';
const HAND_PATH = path.join(FILM_DIR, HAND_FILE);
const PREDICTION_ID = 'smoke-levels-fixture';

const DASH = '—';
const MID = '·';
const ELLIPSIS = '…';

// The prototype's numbers (docs/design/level-editor/prototype/Main.dc.html): corners [SA, SP, IA, IP].
const BODIES = {
  L1: [[289.5, 121.5], [396.9, 132.8], [283.1, 183.2], [390.5, 194.5]],
  L2: [[270.8, 211.1], [382.7, 217.0], [267.3, 277.0], [379.2, 282.9]],
  L4: [[252.3, 406.4], [369.4, 392.1], [260.6, 473.9], [377.7, 459.6]],
  L5: [[262.7, 508.2], [374.2, 476.2], [279.8, 567.8], [391.3, 535.8]],
};
const L3 = [[255.4, 307.0], [371.4, 305.0], [256.6, 375.0], [372.6, 373.0]];
const S1 = [[291, 603], [389, 547]];
const CIRCLES = [[214, 690, 40], [233, 677, 42]];

// ---------------------------------------------------------------------------
// Collect-and-report.

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${JSON.stringify(detail)}`}`);
}

const cdp = await connect();
const ev = (source) => cdp.evaluate(source);
const js = (value) => JSON.stringify(value);

// Polls a page expression until it is truthy; false on timeout (never throws, so later checks still run).
async function until(expression, timeoutMs = 10000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { if (await ev(expression)) return true; } catch (_error) { /* a transient page exception: poll again */ }
    if (Date.now() >= deadline) return false;
    await cdp.settle(stepMs);
  }
}

// Polls a node-side predicate.
async function untilNode(fn, timeoutMs = 5000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (fn()) return true;
    if (Date.now() >= deadline) return false;
    await cdp.settle(stepMs);
  }
}

const text = (selector) => ev(`document.querySelector(${js(selector)})?.textContent ?? null`);
const present = (selector) => ev(`Boolean(document.querySelector(${js(selector)}))`);
// Hidden: absent, `hidden`, or carrying the house's .is-hidden.
const isHidden = (selector) => ev(`(() => { const e = document.querySelector(${js(selector)}); return !e || e.hidden || e.classList.contains('is-hidden'); })()`);

// A control inside the levels list is scrolled into view first: the list scrolls, and a click at an off-screen row's
// rect lands on whatever is drawn there (the footer). Nothing else is scrolled (the app shell never scrolls).
async function clickSelector(selector) {
  await ev(`(() => { const e = document.querySelector(${js(selector)}); if (e && e.closest('.lv-list')) e.scrollIntoView({ block: 'center', inline: 'nearest' }); return true; })()`);
  await cdp.settle(30);
  const r = await cdp.rect(selector);
  if (!r || r.width === 0) return false;
  await cdp.click(r.cx, r.cy);
  await cdp.settle(80);
  return true;
}

async function clickImage(x, y) {
  const p = await cdp.toClient(x, y);
  await cdp.click(p.x, p.y);
  await cdp.settle(60);
}

// A trusted drag whose move and release are dispatched before either is awaited (smoke-femoral-confidence.mjs):
// Chromium can acknowledge a captured move only after the release.
async function drag(x0, y0, x1, y1) {
  await cdp.mouse('mouseMoved', x0, y0);
  await cdp.mouse('mousePressed', x0, y0, { button: 'left', buttons: 1, clickCount: 1 });
  const move = cdp.mouse('mouseMoved', x1, y1, { button: 'left', buttons: 1 });
  await cdp.settle(60);
  await Promise.all([move, cdp.mouse('mouseReleased', x1, y1, { button: 'left', buttons: 0, clickCount: 1 })]);
  await cdp.settle(80);
}

// (Section 17, gate feedback G4) The same drag on the RIGHT button, through `points` in order: the raw `mouse`
// primitive, every event carrying the held button (smoke-chord.mjs: a move without it drops pointer capture), the
// moves and the release dispatched before any is awaited, as above.
async function rightDragVia(x0, y0, points) {
  await cdp.mouse('mouseMoved', x0, y0);
  await cdp.mouse('mousePressed', x0, y0, { button: 'right', buttons: 2, clickCount: 1 });
  const moves = points.map(([x, y]) => cdp.mouse('mouseMoved', x, y, { button: 'right', buttons: 2 }));
  await cdp.settle(60);
  const [x1, y1] = points[points.length - 1];
  await Promise.all([...moves, cdp.mouse('mouseReleased', x1, y1, { button: 'right', buttons: 0, clickCount: 1 })]);
  await cdp.settle(80);
}
const rightDrag = (x0, y0, x1, y1) => rightDragVia(x0, y0, [[x1, y1]]);

// Two right-button clicks at one point, back to back (well inside isDoubleClick's 400 ms and 6 px).
async function doubleRightClick(x, y) {
  await cdp.mouse('mouseMoved', x, y);
  for (const clickCount of [1, 2]) {
    await cdp.mouse('mousePressed', x, y, { button: 'right', buttons: 2, clickCount });
    await cdp.mouse('mouseReleased', x, y, { button: 'right', buttons: 0, clickCount });
  }
  await cdp.settle(120);
}

// The page-side helpers, installed once per run: store reads, the wiring module's test hook (check 14), and a
// toast log fed by a store subscription that only reads (subscribers never call setState).
async function installHelpers() {
  await ev(`(async () => {
    const store = await import('./renderer/store.js');
    const wiring = await import('./renderer/level-editor.js');
    const levels = await import('./renderer/data/levels.js');
    if (window.__lv?.unsub) window.__lv.unsub();
    const lv = {
      study: (id) => store.getState().studies.find((s) => s.id === id) ?? null,
      editor: () => store.getState().levelEditor,
      // (Gate feedback G3, D15) The window / level is the view's, not the editor's.
      filmWindow: () => store.getState().filmWindow,
      settled: (id) => !store.getState().measurementDrafts?.[id],
      unsaved: () => { const e = store.getState().levelEditor; return e ? levels.unsavedCount(e) : null; },
      // Check 14: the stash's test hook, imported from the page's own module instance.
      hasStashedEditor: (id) => wiring.hasStashedEditor(id),
      toasts: [],
    };
    let last = store.getState().toast;
    lv.unsub = store.subscribe((s) => { if (s.toast && s.toast !== last) lv.toasts.push(s.toast); last = s.toast; });
    window.__lv = lv;
    return true;
  })()`);
}

const toastSeen = (exact) => until(`window.__lv.toasts.includes(${js(exact)})`, 8000);
const clearToasts = () => ev('(() => { window.__lv.toasts.length = 0; return true; })()');
const settled = (id, timeoutMs = 10000) => until(`window.__lv.settled(${js(id)})`, timeoutMs);
const studyOf = (id) => ev(`window.__lv.study(${js(id)})`);
const badge = (code) => text(`[data-level-key="${code}"] .badge`);
const editLabel = () => text('.viewer-editbar-label');
const readRecord = (name) => JSON.parse(fs.readFileSync(path.join(LABELS, name), 'utf8'));

// The edit bar's buttons have no class of their own; their order is fixed by components/viewer.js:
// FIT, UNDO, CANCEL, RESET TO PREDICTION, DONE. FIT carries an aria-label.
const EDITBAR_FIT = '.viewer-editbar [aria-label="Fit the circle to the rim points"]';
const EDITBAR_UNDO = '.viewer-editbar > button:nth-of-type(2)';
const EDITBAR_DONE = '.viewer-editbar > button:last-of-type';
const EDIT_TOOL = '.viewer-tool[aria-label="Edit segmentation"]';
const RERUN_TOOL = '.viewer-tool[aria-label="Re-run segmentation"]';
const WL_TOOL = '.viewer-tool[aria-label="Window / level"]';
// The step chips while placing a body (gate feedback G2): buttons in step order SA, SP, IA, IP.
const CHIP_SA = '.viewer-steps .viewer-step:nth-child(1)';
const CHIP_IP = '.viewer-steps .viewer-step:nth-child(4)';
const WL_DONE = '.viewer-wl-head > button:last-of-type';
const WL_RESET = '.viewer-wl [aria-label="Reset to the file\'s default window"]';
const WL_WIDTH = '.viewer-wl [aria-label="Window width"]';
const WL_LEVEL = '.viewer-wl [aria-label="Window level"]';
const STUDIES_NAV = '.nav-row[aria-label="Studies"]';
const row = (id) => `.studies-row[data-study-id="${id}"]`;
const checkboxOf = (code) => `[data-level-row="${code}"] .level-check`;

const windowState = () => ev('window.__lv.filmWindow() ?? null');
const chip = () => ev(`(() => { const c = document.querySelector('.viewer-chip-window'); return c ? { text: c.textContent, hidden: c.classList.contains('is-hidden') } : null; })()`);
const CHIP_TEXT = new RegExp(`^W \\d+ ${MID} L -?\\d+$`);

async function openFromList(id) {
  await clickSelector(STUDIES_NAV);
  await until(`document.querySelector(${js(row(id))})`, 5000);
  const opened = await clickSelector(row(id));
  await until(`(async () => (await import('./renderer/store.js')).getState().openId === ${js(id)})()`, 5000);
  return opened;
}

async function enterEdit() {
  await until(`(() => { const b = document.querySelector(${js(EDIT_TOOL)}); return b && !b.disabled; })()`, 15000);
  await clickSelector(EDIT_TOOL);
  return until(`Boolean(document.querySelector('.lv-panel .lv-summary'))`, 10000);
}

// The window / level panel's checks, run on a decoded film in both phases (16, and the film phase's list).
async function windowLevelChecks(prefix) {
  await clickSelector(WL_TOOL);
  const ready = await until(`window.__lv.filmWindow()?.status === 'ready'`, 30000);
  const wl = await windowState();
  const chipNow = await chip();
  check(`${prefix}: the W/L panel opens and the decoded film is ready`, ready && !(await isHidden('.viewer-wl')), wl);
  check(`${prefix}: the chip reads W … ${MID} L … at the file's default window`,
    Boolean(chipNow) && !chipNow.hidden && CHIP_TEXT.test(chipNow.text) && chipNow.text === `W ${wl?.defaultWidth} ${MID} L ${wl?.defaultLevel}`, { chip: chipNow, wl });
  check(`${prefix}: the edit bar reads WINDOW / LEVEL`, (await editLabel()) === 'WINDOW / LEVEL', await editLabel());

  // A drag on the film: left-right width, up-down level, 4 per pixel. Left and up, so an 8-bit film's maxed width
  // still moves.
  const canvas = await cdp.rect('.viewer-canvas-dynamic');
  await drag(canvas.cx, canvas.cy, canvas.cx - 20, canvas.cy - 10);
  const dragged = await windowState();
  check(`${prefix}: a drag on the film changes both width and level`,
    Boolean(dragged) && dragged.width !== wl.defaultWidth && dragged.level !== wl.defaultLevel, dragged && { width: dragged.width, level: dragged.level, defaults: [wl.defaultWidth, wl.defaultLevel] });
  check(`${prefix}: the chip follows the drag`, (await chip())?.text === `W ${dragged?.width} ${MID} L ${dragged?.level}`, await chip());

  await clickSelector(WL_RESET);
  const reset = await windowState();
  check(`${prefix}: RESET restores the file's default window`, reset?.width === wl.defaultWidth && reset?.level === wl.defaultLevel, reset && [reset.width, reset.level]);

  // The sliders keep their own arrows (a focused range input is exempt from the stage's keys).
  await ev(`document.querySelector(${js(WL_WIDTH)}).focus()`);
  await cdp.key('ArrowLeft');
  await cdp.settle(80);
  await ev(`document.querySelector(${js(WL_LEVEL)}).focus()`);
  await cdp.key('ArrowLeft');
  await cdp.settle(80);
  const slid = await windowState();
  check(`${prefix}: the width and level sliders move the window`, slid?.width === wl.defaultWidth - 1 && slid?.level === wl.defaultLevel - 1, slid && [slid.width, slid.level]);

  await clickSelector(WL_DONE);
  check(`${prefix}: DONE closes the W/L panel`, (await isHidden('.viewer-wl')) && (await ev('window.__lv.filmWindow()?.open')) === false, await windowState());
}

const pairOf = (wl) => (wl ? [wl.width, wl.level] : null);
const selectedLevel = () => ev(`import('./renderer/store.js').then((m) => m.getState().selectedLevel)`);
const editingNow = () => ev(`import('./renderer/store.js').then((m) => m.getState().editing)`);
const toolState = () => ev(`(() => { const b = document.querySelector(${js(WL_TOOL)}); return b ? { shown: !b.classList.contains('is-hidden') && b.offsetParent !== null, disabled: b.disabled, pressed: b.getAttribute('aria-pressed') } : null; })()`);
const stageClasses = () => ev(`(() => { const s = document.querySelector('.viewer-stage'); return { windowing: s.classList.contains('is-windowing'), dragging: s.classList.contains('is-window-drag'), editing: s.classList.contains('is-editing') }; })()`);

// 17 (gate feedback G3 and G4, 2026-10-11; plan D15-D17). Window / level outside edit mode, on the hand-placed
// synthetic film SP-9301 just left by Escape. `windowInEdit` is the window as edit mode left it (16's sliders put both
// numbers one below the 8-bit default). Every window move below is left and up, so the 8-bit film's maxed width moves.
async function windowOutsideEditChecks(windowInEdit) {
  const kept = await windowState();
  check('17. leaving edit mode keeps the window (D15)',
    kept?.status === 'ready' && kept.open === false && kept.width === windowInEdit?.width && kept.level === windowInEdit?.level,
    { kept: pairOf(kept), windowInEdit: pairOf(windowInEdit) });
  const tool = await toolState();
  check('17. outside edit mode the toolbar shows the W/L button, enabled and not pressed', tool?.shown === true && tool.disabled === false && tool.pressed === 'false', tool);
  const chipOut = await chip();
  check(`17. outside edit mode the chip reads W ${ELLIPSIS} ${MID} L ${ELLIPSIS}`,
    chipOut?.hidden === false && chipOut.text === `W ${kept?.width} ${MID} L ${kept?.level}`, chipOut);

  // The panel, outside edit mode: under the toolbar (no edit bar above it), with the hint the edit bar gives in edit mode.
  await clickSelector(WL_TOOL);
  const panel = await ev(`(() => { const p = document.querySelector('.viewer-wl'); const s = document.querySelector('.viewer-stage'); const h = document.querySelector('.viewer-wl-hint');
    return p && s ? { hidden: p.classList.contains('is-hidden'), top: Math.round(p.getBoundingClientRect().top - s.getBoundingClientRect().top), hint: Boolean(h) && !h.classList.contains('is-hidden') } : null; })()`);
  check('17. outside edit mode the W/L button opens the panel under the toolbar, with its hint, the button pressed',
    panel?.hidden === false && Math.abs(panel.top - 64) <= 1 && panel.hint === true && (await toolState())?.pressed === 'true' && (await windowState())?.open === true,
    { panel, tool: await toolState() });

  // With the panel open a LEFT drag windows the film and outranks construction selection: it starts inside L1, placed
  // by hand in 12 at (200,150) (400,160) (196,232) (396,242).
  const l1 = await cdp.toClient(298, 196);
  const beforeLeft = await windowState();
  await drag(l1.x, l1.y, l1.x - 20, l1.y - 10);
  const afterLeft = await windowState();
  const selectedAfterLeft = await selectedLevel();
  check('17. with the panel open a left drag windows the film, 4 per pixel, and selects no construction',
    afterLeft?.width === beforeLeft?.width - 80 && afterLeft?.level === beforeLeft?.level - 40 && selectedAfterLeft === null,
    { before: pairOf(beforeLeft), after: pairOf(afterLeft), selectedAfterLeft });

  // Escape outside edit mode: the panel first; the same press with the panel closed selects L1, and Escape clears it.
  await cdp.key('Escape');
  await cdp.settle(100);
  const closed = await windowState();
  const escapedEditing = await editingNow();
  check('17. Escape outside edit mode closes the panel, keeps the window and stays out of edit mode',
    closed?.open === false && (await isHidden('.viewer-wl')) && closed.width === afterLeft?.width && closed.level === afterLeft?.level && escapedEditing === false,
    { closed: closed && { open: closed.open, pair: pairOf(closed) }, escapedEditing });
  await clickImage(298, 196);
  const selectedByClick = await selectedLevel();
  await cdp.key('Escape');
  await cdp.settle(100);
  check('17. with the panel closed the same press selects L1, and Escape then clears the construction',
    selectedByClick === 'L1' && (await selectedLevel()) === null && (await windowState())?.width === afterLeft?.width, { selectedByClick, after: await selectedLevel() });

  // D16: the RIGHT button windows with the panel closed. Left lowers the width, up lowers the level (dragWindow).
  const canvas = await cdp.rect('.viewer-canvas-dynamic');
  const beforeRight = await windowState();
  await rightDrag(canvas.cx, canvas.cy, canvas.cx - 20, canvas.cy - 10);
  const afterRight = await windowState();
  check('17. a right-button drag with the panel closed windows the film: left lowers the width, up the level (D16)',
    afterRight?.width === beforeRight?.width - 80 && afterRight?.level === beforeRight?.level - 40 && afterRight.open === false && (await isHidden('.viewer-wl')),
    { before: pairOf(beforeRight), after: pairOf(afterRight), open: afterRight?.open });
  const chipRight = await chip();
  const released = await stageClasses();
  check('17. the chip follows the right-button drag, and the release ends the stage\'s windowing state',
    chipRight?.text === `W ${afterRight?.width} ${MID} L ${afterRight?.level}` && !released.windowing && !released.dragging, { chipRight, released });

  // D17: a double right-click restores the film's default window, clear of the drag's press in time and place.
  await cdp.settle(450);
  await doubleRightClick(canvas.cx + 40, canvas.cy + 40);
  const doubled = await windowState();
  check('17. a double right-click restores the film\'s default window, the panel still closed (D17)',
    doubled?.width === doubled?.defaultWidth && doubled?.level === doubled?.defaultLevel && doubled.open === false && !(await stageClasses()).dragging,
    doubled && { pair: pairOf(doubled), defaults: [doubled.defaultWidth, doubled.defaultLevel] });

  // D15: entering edit mode keeps the window, and leaving it again.
  await cdp.settle(450);
  await rightDrag(canvas.cx, canvas.cy, canvas.cx - 10, canvas.cy - 5);
  const beforeEdit = await windowState();
  const entered = await enterEdit();
  const inEdit = await windowState();
  check('17. entering edit mode keeps the window (D15)',
    entered && beforeEdit?.width === beforeEdit?.defaultWidth - 40 && inEdit?.width === beforeEdit.width && inEdit?.level === beforeEdit.level,
    { beforeEdit: pairOf(beforeEdit), inEdit: pairOf(inEdit), entered });
  await cdp.key('Escape');
  await until(`(async () => !(await import('./renderer/store.js')).getState().editing)()`, 5000);

  // D15: opening another study resets the window (FRESH_VIEW); coming back, the film opens at its default again.
  await ev(`(async () => {
    const store = await import('./renderer/store.js');
    const { newStudy } = await import('./renderer/screens/studies.js');
    const other = { ...newStudy({ id: ${js(OTHER)}, fileName: 'levels-other.png', filePath: null }), labelFile: null };
    store.setState((s) => ({ studies: [other, ...s.studies.filter((x) => x.id !== ${js(OTHER)})] }));
    return true;
  })()`);
  await openFromList(OTHER);
  const otherTool = await toolState();
  const otherWindow = await windowState();
  check('17. opening another study resets the window; with no film on the stage the W/L button is disabled',
    otherWindow === null && otherTool?.shown === true && otherTool.disabled === true, { otherWindow: pairOf(otherWindow), otherTool });
  await openFromList(HAND);
  await until(`document.querySelector('.viewer-canvas-dynamic')?.width === 600`, 10000);
  const back = await windowState();
  const backChip = await chip();
  check('17. coming back to the film: no window until it is asked for, and the chip reads none',
    back === null && backChip?.hidden === true, { back: pairOf(back), backChip });
  await clickSelector(WL_TOOL);
  await until(`window.__lv.filmWindow()?.status === 'ready'`, 15000);
  const fresh = await windowState();
  check('17. the W/L panel opens at the film\'s default window again',
    fresh?.width === fresh?.defaultWidth && fresh?.level === fresh?.defaultLevel && fresh.open === true,
    fresh && { pair: pairOf(fresh), defaults: [fresh.defaultWidth, fresh.defaultLevel] });
  await clickSelector(WL_DONE);

  // D16 on a film with no window yet: the press starts the decode (its original is cached by now, so it lands before
  // the first move), the first move after it is the drag's start, and the second windows from there: (-20, -10).
  await openFromList(OTHER);
  await openFromList(HAND);
  await until(`document.querySelector('.viewer-canvas-dynamic')?.width === 600`, 10000);
  const none = await windowState();
  const film = await cdp.rect('.viewer-canvas-dynamic');
  await rightDragVia(film.cx, film.cy, [[film.cx - 5, film.cy - 5], [film.cx - 25, film.cy - 15]]);
  const byDrag = await windowState();
  check('17. a right-button drag on a film with no window yet decodes it and windows from its first move after (D16)',
    none === null && byDrag?.status === 'ready' && byDrag.open === false
      && byDrag.width === byDrag.defaultWidth - 80 && byDrag.level === byDrag.defaultLevel - 40,
    { none: pairOf(none), byDrag: byDrag && { status: byDrag.status, pair: pairOf(byDrag), defaults: [byDrag.defaultWidth, byDrag.defaultLevel] } });
}

// ---------------------------------------------------------------------------
// Phase `dom`.

async function domPhase() {
  // Fixtures: a 600x800 grey film with an all-zero mask for SP-9300, and a 600x800 gradient film for SP-9301 whose
  // values run 0..255 (the 8-bit window rule, ruling R13), written to %TEMP% so /decode can read it.
  const films = await ev(`(() => {
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 800;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#777777'; ctx.fillRect(0, 0, 600, 800);
    ctx.fillStyle = '#a0a0a0'; ctx.font = '18px sans-serif'; ctx.fillText('SYNTHETIC TEST IMAGE', 24, 40);
    const image = canvas.toDataURL('image/png').split(',')[1];
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 600, 800);
    const mask = canvas.toDataURL('image/png').split(',')[1];
    const gradient = ctx.createLinearGradient(0, 0, 600, 0);
    gradient.addColorStop(0, '#000000'); gradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 600, 800);
    ctx.fillStyle = '#808080'; ctx.font = '18px sans-serif'; ctx.fillText('SYNTHETIC TEST IMAGE', 24, 40);
    const hand = canvas.toDataURL('image/png').split(',')[1];
    return { image, mask, hand };
  })()`);
  fs.mkdirSync(FILM_DIR, { recursive: true });
  fs.writeFileSync(HAND_PATH, Buffer.from(films.hand, 'base64'));

  const injected = await ev(`(async () => {
    const store = await import('./renderer/store.js');
    const api = await import('./renderer/api.js');
    const { newStudy } = await import('./renderer/screens/studies.js');
    const quad = (c) => ({ superior: [c[0], c[1]], inferior: [c[2], c[3]], quadrilateral: [c[0], c[1], c[3], c[2]] });
    const bodies = ${js(BODIES)};
    const vertebrae = Object.fromEntries(Object.entries(bodies).map(([code, c]) => [code, quad(c)]));
    const result = await api.measure({ vertebrae, s1_superior: ${js(S1)}, femoral_circles: ${js(CIRCLES)} });
    // A model result in every respect the app checks (a prediction id, a sidecar that matches), so the film is
    // restored from its sidecar and never read as hand-placed (ruling R16).
    const prediction = { ...result, image_png: ${js(films.image)}, mask_png: ${js(films.mask)},
      labels: { L1: 20, L2: 21, L3: 22, L4: 23, L5: 24 }, prediction_id: ${js(PREDICTION_ID)} };
    await api.savePrediction(${js(SEG)}, prediction);
    const seg = { id: ${js(SEG)}, source: 'real', fileName: ${js(SEG_FILE)}, filePath: '/test/levels-ui-check.png',
      name: 'Levels UI check', addedAt: new Date().toISOString(), view: 'Standing lateral', clinical: {},
      predictionId: ${js(PREDICTION_ID)}, labelFile: null, measurements: result.measurements, geometry: result.geometry, qc: result.qc ?? null };
    const hand = { ...newStudy({ id: ${js(HAND)}, fileName: ${js(HAND_FILE)}, filePath: ${js(HAND_PATH)} }), labelFile: null };
    const ours = new Set([${js(SEG)}, ${js(HAND)}, ${js(REAL)}, ${js(OTHER)}]);
    store.setState((s) => ({ ack: true, studies: [seg, hand, ...s.studies.filter((x) => !ours.has(x.id))], screen: 'studies',
      studiesTab: 'find', query: '', openId: null, editing: false, levelEditor: null, selection: null, measurementDrafts: {},
      running: null, batch: null, tab: 'meas', overlays: true }));
    store.setState({ screen: 'analysis', openId: ${js(SEG)}, selectedLevel: null, zoom: 1, panX: 0, panY: 0, panMode: false });
    return { regionFromMeasure: result.geometry?.region ?? null, ll: result.measurements?.LL ?? null };
  })()`);
  await installHelpers();
  const restored = await until(`document.querySelector('.viewer-canvas-dynamic')?.width === 600 && document.querySelector('.run-card')?.classList.contains('is-hidden')`, 15000);
  check('precondition: the fixture SP-9300 opens on its restored 600x800 film', restored, injected);

  // 1. Edit.
  const editEnabled = await until(`(() => { const b = document.querySelector(${js(EDIT_TOOL)}); return b && !b.disabled; })()`, 10000);
  check('1. the Edit button is enabled on a segmented film', editEnabled, null);
  await enterEdit();
  const ui = await ev(`(() => {
    const eyebrow = document.querySelector('.analysis-editing');
    return {
      panel: Boolean(document.querySelector('.lv-panel .lv-summary')),
      tabsHidden: document.querySelector('.analysis-tabs')?.classList.contains('is-hidden'),
      eyebrow: eyebrow && !eyebrow.hidden ? eyebrow.textContent : null,
      editbar: document.querySelector('.viewer-editbar-label')?.textContent ?? null,
      runCardHidden: document.querySelector('.run-card')?.classList.contains('is-hidden'),
    };
  })()`);
  check('1. Edit shows the levels panel and hides the tabs', ui.panel && ui.tabsHidden === true, ui);
  check('1. the header eyebrow and the edit bar read EDITING SEGMENTATION', ui.eyebrow === 'EDITING SEGMENTATION' && ui.editbar === 'EDITING SEGMENTATION', ui);
  check('1. the run card stays hidden in edit mode', ui.runCardHidden === true, ui);

  // 15. Re-run is disabled while editing (R17).
  const rerun = await ev(`(() => { const b = document.querySelector(${js(RERUN_TOOL)}); return b ? { disabled: b.disabled, title: b.title } : null; })()`);
  check('15. Re-run is disabled while editing, titled Finish editing before re-running segmentation (R17)',
    rerun?.disabled === true && rerun.title === 'Finish editing before re-running segmentation', rerun);

  // 2. Counts and boxes.
  const counts = await ev(`(() => ({
    summary: document.querySelector('.lv-summary')?.textContent,
    lumbar: document.querySelector('[data-group-key="lumbar"] .lv-group-count')?.textContent,
    cervical: (b => b && { checked: b.checked, indeterminate: b.indeterminate })(document.querySelector('input[data-level-key="group:cervical"]')),
    lumbarBox: (b => b && { checked: b.checked, indeterminate: b.indeterminate })(document.querySelector('input[data-level-key="group:lumbar"]')),
  }))()`);
  check(`2. the summary reads 7 PLACED ${MID} 1 TO PLACE ${MID} 8 NOT VISIBLE`, counts.summary === `7 PLACED ${MID} 1 TO PLACE ${MID} 8 NOT VISIBLE`, counts.summary);
  check(`2. the Lumbar group reads 4 PLACED ${MID} 1 TO PLACE`, counts.lumbar === `4 PLACED ${MID} 1 TO PLACE`, counts.lumbar);
  check('2. the Cervical group box is unchecked and the Lumbar box checked',
    counts.cervical?.checked === false && counts.cervical?.indeterminate === false && counts.lumbarBox?.checked === true, counts);
  check('2. L3 reads Not placed', (await badge('L3')) === 'Not placed', await badge('L3'));

  // 3 and 4. Place L3: the label and the four step chips, two points, UNDO, CANCEL; then Place… again, a step chip
  // chosen out of order (IP, a film click, UNDO), and the full placement from the first chip.
  await clickSelector('[data-level-key="place:L3"]');
  const placingStart = await ev(`(() => ({
    label: document.querySelector('.viewer-editbar-label')?.textContent,
    steps: document.querySelectorAll('.viewer-steps:not(.is-hidden) .viewer-step').length,
  }))()`);
  check(`3. Place… on L3 reads PLACING L3 ${MID} 1 OF 4 with four step chips`, placingStart.label === `PLACING L3 ${MID} 1 OF 4` && placingStart.steps === 4, placingStart);
  check(`3. the L3 badge reads Placing${ELLIPSIS}`, (await badge('L3')) === `Placing${ELLIPSIS}`, await badge('L3'));
  await clickImage(...L3[0]);
  await clickImage(...L3[1]);
  // `placing.points` holds one slot per step, null until set (gate feedback G2): the points placed are the non-null ones.
  const two = await ev('window.__lv.editor()?.placing?.points.filter(Boolean).length ?? null');
  check(`3. two clicks read PLACING L3 ${MID} 3 OF 4`, two === 2 && (await editLabel()) === `PLACING L3 ${MID} 3 OF 4`, { points: two, label: await editLabel() });
  const undoText = await text(EDITBAR_UNDO);
  await clickSelector(EDITBAR_UNDO);
  const afterUndo = await ev('window.__lv.editor()?.placing?.points.filter(Boolean).length ?? null');
  check('4. UNDO mid-placement removes a point', undoText === 'UNDO' && afterUndo === 1 && (await editLabel()) === `PLACING L3 ${MID} 2 OF 4`, { undoText, afterUndo, label: await editLabel() });
  await clickSelector('[data-level-key="cancel:L3"]');
  check('4. CANCEL returns the badge to Not placed', (await badge('L3')) === 'Not placed' && (await ev('window.__lv.editor()?.placing')) === null, await badge('L3'));
  await clickSelector('[data-level-key="place:L3"]');
  // 3 and 4 (gate feedback G2, 2026-10-11). A step chip chooses the point the next film click sets: the fourth chip
  // (IP) first; a film click sets IP and the label returns to the first empty step; UNDO clears IP and makes it current.
  const chipState = (selector) => ev(`(() => {
    const c = document.querySelector(${js(selector)});
    return c ? { tag: c.tagName, done: c.classList.contains('is-done'), current: c.classList.contains('is-current'), aria: c.getAttribute('aria-current'), title: c.title } : null;
  })()`);
  await clickSelector(CHIP_IP);
  const ipChosen = await chipState(CHIP_IP);
  check(`3. clicking the fourth step chip reads PLACING L3 ${MID} 4 OF 4 and makes that chip current`,
    (await editLabel()) === `PLACING L3 ${MID} 4 OF 4` && ipChosen?.tag === 'BUTTON' && ipChosen.current === true && ipChosen.done === false
      && ipChosen.aria === 'step' && ipChosen.title === 'Place IP next',
    { label: await editLabel(), chip: ipChosen });
  await clickImage(...L3[3]);
  const ipPlaced = await chipState(CHIP_IP);
  check(`3. a film click sets IP: its chip is done and the label returns to the first empty step (PLACING L3 ${MID} 1 OF 4)`,
    ipPlaced?.done === true && ipPlaced.current === false && ipPlaced.title === 'Re-place IP' && (await editLabel()) === `PLACING L3 ${MID} 1 OF 4`,
    { label: await editLabel(), chip: ipPlaced });
  await clickSelector(EDITBAR_UNDO);
  const ipUndone = await chipState(CHIP_IP);
  check(`4. UNDO clears IP: its chip is no longer done and the label reads PLACING L3 ${MID} 4 OF 4 again`,
    ipUndone?.done === false && ipUndone.current === true && (await editLabel()) === `PLACING L3 ${MID} 4 OF 4`,
    { label: await editLabel(), chip: ipUndone });
  // The full placement in the order the checks below expect: the first chip, then SA, SP, IA and IP.
  await clickSelector(CHIP_SA);
  check(`3. clicking the first step chip reads PLACING L3 ${MID} 1 OF 4`, (await editLabel()) === `PLACING L3 ${MID} 1 OF 4`, await editLabel());
  for (const point of L3) await clickImage(...point);
  check('3. four clicks place L3: the badge reads Manual and the placement ends',
    (await badge('L3')) === 'Manual' && (await ev('window.__lv.editor()?.placing')) === null, { badge: await badge('L3') });
  const l3Measured = await settled(SEG);
  const afterL3 = await studyOf(SEG);
  check("3. once measured the study has L3 and LL['L3-S1'] is a number",
    l3Measured && Boolean(afterL3?.geometry?.vertebrae?.L3) && Number.isFinite(afterL3?.measurements?.LL?.['L3-S1']), { measured: l3Measured, ll: afterL3?.measurements?.LL });

  // 5. Uncheck S1.
  await clickSelector(checkboxOf('S1'));
  const s1Note = await text('[data-group-key="sacral"] .lv-note');
  check(`5. unchecking S1 notes LL, PI, PT, SS, PI–LL, L1PA and L5–S1 will show ${DASH}`,
    s1Note === `LL, PI, PT, SS, PI–LL, L1PA and L5–S1 will show ${DASH}`, s1Note);
  check('5. S1 reads Not visible', (await badge('S1')) === 'Not visible', await badge('S1'));
  const s1Measured = await settled(SEG);
  const afterS1 = await studyOf(SEG);
  check('5. once measured s1_superior is null and PI is null',
    s1Measured && afterS1?.geometry?.s1_superior === null && afterS1?.measurements?.PI === null, { s1: afterS1?.geometry?.s1_superior, PI: afterS1?.measurements?.PI });

  // 6. Save edits.
  check('6. the footer reads 2 UNSAVED CHANGES', (await text('.lv-unsaved')) === '2 UNSAVED CHANGES', await text('.lv-unsaved'));
  await clearToasts();
  await clickSelector('.lv-save');
  check('6. Save edits toasts Saved 2 edits to the label record.', await toastSeen('Saved 2 edits to the label record.'), await ev('window.__lv.toasts'));
  const segRecordName = 'levels-ui-check.label.json';
  const segWritten = await untilNode(() => fs.existsSync(path.join(LABELS, segRecordName)));
  check('6. the record is written to <userData>/labels/levels-ui-check.label.json', segWritten, path.join(LABELS, segRecordName));
  let segRecord = null;
  try { segRecord = readRecord(segRecordName); } catch (error) { segRecord = null; }
  const segValid = segRecord ? validateAgainst(SCHEMA, segRecord) : { ok: false, errors: ['unreadable'] };
  check('6. the record validates against the label record schema', segValid.ok, segValid.errors.slice(0, 5));
  check("6. the record: L3 manual, S1 not_visible, study 'levels-ui-check'",
    segRecord?.levels?.L3?.state === 'manual' && segRecord?.levels?.S1?.state === 'not_visible' && segRecord?.study === 'levels-ui-check',
    segRecord && { L3: segRecord.levels?.L3?.state, S1: segRecord.levels?.S1?.state, study: segRecord.study });
  check('6. the record names no SP id anywhere', Boolean(segRecord) && !/SP-\d{4}/.test(JSON.stringify(segRecord)), null);
  check('6. the study record carries labelFile', (await studyOf(SEG))?.labelFile === segRecordName, (await studyOf(SEG))?.labelFile);
  check('6. after the save the footer reads NOTHING TO SAVE and Save edits is disabled',
    (await text('.lv-unsaved')) === 'NOTHING TO SAVE' && (await ev(`document.querySelector('.lv-save')?.disabled`)) === true, await text('.lv-unsaved'));
  // 12 (dom, segmented fixture). Its mask is all zero, so no level has a model outline: every contour is null.
  const segBodies = ['C3', 'C4', 'C5', 'C6', 'C7', 'L1', 'L2', 'L3', 'L4', 'L5'].map((code) => segRecord?.levels?.[code]).filter(Boolean);
  check('12. a film whose mask holds no level writes contour null for every placed body level',
    segBodies.length > 0 && segBodies.filter((l) => ['segmented', 'edited', 'manual'].includes(l.state)).every((l) => l.contour === null)
      && ['L1', 'L2', 'L4', 'L5'].every((code) => segRecord.levels[code].state === 'segmented'),
    segBodies.map((l) => [l.state, l.contour]));

  // 7. Re-check S1, the exit prompt, Keep editing, Discard.
  await clickSelector(checkboxOf('S1'));
  check('7. re-checking S1 is one unsaved change', (await text('.lv-unsaved')) === '1 UNSAVED CHANGE', await text('.lv-unsaved'));
  await clickSelector(EDITBAR_DONE);
  const prompt = await ev(`(() => { const p = document.querySelector('.lv-prompt'); return p ? { text: p.querySelector('.lv-prompt-text')?.textContent, keepFocused: document.activeElement === p.querySelector('.lv-prompt-keep') } : null; })()`);
  check('7. DONE with an unsaved change shows the exit prompt with focus on Keep editing',
    prompt?.text === 'Discard 1 unsaved change? Saved edits are kept.' && prompt.keepFocused === true, prompt);
  await clickSelector('.lv-prompt-keep');
  check('7. Keep editing closes the prompt and stays in edit mode',
    !(await present('.lv-prompt')) && (await ev('(async () => (await import("./renderer/store.js")).getState().editing)()')) === true, null);
  await clickSelector(EDITBAR_DONE);
  await until(`Boolean(document.querySelector('.lv-prompt-discard'))`, 3000);
  await clearToasts();
  await clickSelector('.lv-prompt-discard');
  check('7. Discard toasts Discarded 1 change.', await toastSeen('Discarded 1 change.'), await ev('window.__lv.toasts'));
  const exited = await until(`(async () => { const s = (await import('./renderer/store.js')).getState(); return !s.editing && s.levelEditor === null; })()`, 3000);
  check('7. Discard from the prompt leaves edit mode', exited, null);
  const discardMeasured = await settled(SEG);
  const afterDiscard = await studyOf(SEG);
  await until(`document.querySelector('[data-row-key="PI"] .meas-value')?.textContent === ${js(DASH)}`, 3000);
  const panelBack = await ev(`(() => ({
    measHidden: document.querySelector('.analysis-panel-host')?.classList.contains('is-hidden'),
    levelHidden: document.querySelector('.analysis-level-host')?.classList.contains('is-hidden'),
    pi: document.querySelector('[data-row-key="PI"] .meas-value')?.textContent ?? null,
  }))()`);
  check(`7. S1 is back to not visible: s1_superior null once measured, and the Measurements panel is back with PI ${DASH}`,
    discardMeasured && afterDiscard?.geometry?.s1_superior === null && panelBack.measHidden === false && panelBack.levelHidden === true && panelBack.pi === DASH,
    { s1: afterDiscard?.geometry?.s1_superior, panelBack });

  // 8. Femoral: Place… on Head 1, two rim points, FIT; then a rim-point drag refits.
  await enterEdit();
  // The Sacral group opens closed: its one level is not visible.
  const reopened = await ev(`({ s1: window.__lv.editor()?.levels?.S1?.visible ?? null, sacral: document.querySelector('[data-group-key="sacral"] .lv-group-count')?.textContent ?? null })`);
  check('8. reopening reads the saved record: S1 not visible (Sacral 1 NOT VISIBLE), L3 Manual',
    reopened.s1 === false && reopened.sacral === '1 NOT VISIBLE' && (await badge('L3')) === 'Manual', { ...reopened, L3: await badge('L3') });
  const circleBefore = (await studyOf(SEG))?.geometry?.femoral_circles?.[0] ?? null;
  await clickSelector('[data-level-key="place:FH1"]');
  check(`8. Place… on Head 1 reads PLACING FEMORAL HEAD 1 ${MID} 0 OF 4 RIM POINTS`, (await editLabel()) === `PLACING FEMORAL HEAD 1 ${MID} 0 OF 4 RIM POINTS`, await editLabel());
  await clickImage(168, 690);
  const fitOne = await ev(`(() => { const b = document.querySelector(${js(EDITBAR_FIT)}); return b ? { hidden: b.classList.contains('is-hidden'), disabled: b.disabled } : null; })()`);
  check('8. FIT is shown and disabled with one rim point', fitOne?.hidden === false && fitOne.disabled === true, fitOne);
  await clickImage(264, 690);
  const fitTwo = await ev(`document.querySelector(${js(EDITBAR_FIT)})?.disabled`);
  check('8. two rim points enable FIT', fitTwo === false, fitTwo);
  await clickSelector(EDITBAR_FIT);
  check('8. FIT finishes Head 1: the badge reads Edited', (await badge('FH1')) === 'Edited' && (await ev('window.__lv.editor()?.placing')) === null, await badge('FH1'));
  const fitMeasured = await settled(SEG);
  const circleFit = (await studyOf(SEG))?.geometry?.femoral_circles?.[0] ?? null;
  check('8. once measured femoral_circles[0] has changed', fitMeasured && Boolean(circleFit) && JSON.stringify(circleFit) !== JSON.stringify(circleBefore), { circleBefore, circleFit });
  const rim = await ev('window.__lv.editor()?.levels?.FH1?.geometry?.rim ?? null');
  if (Array.isArray(rim) && rim.length === 2) {
    const from = await cdp.toClient(rim[1][0], rim[1][1]);
    await drag(from.x, from.y, from.x + 14, from.y);
    const dragMeasured = await settled(SEG);
    const circleDragged = (await studyOf(SEG))?.geometry?.femoral_circles?.[0] ?? null;
    check('8. a rim-point drag refits the head (its radius changes)', dragMeasured && Boolean(circleDragged) && circleDragged[2] !== circleFit[2], { circleFit, circleDragged });
  } else {
    check('8. a rim-point drag refits the head (its radius changes)', false, { rim });
  }

  // 9 and 16 (dom). Window / level on a film whose source cannot be read.
  await clickSelector(WL_TOOL);
  const unavailable = await until(`window.__lv.filmWindow()?.status === 'unavailable'`, 10000);
  const wlNote = await ev(`(() => { const n = document.querySelector('.viewer-wl-note'); return n ? { text: n.textContent, hidden: n.classList.contains('is-hidden') } : null; })()`);
  check('9. the toolbar has the W/L button and it opens the panel', !(await isHidden(WL_TOOL)) && !(await isHidden('.viewer-wl')), null);
  check('9 / 16. with no readable source the panel says The source film could not be found.',
    unavailable && wlNote?.hidden === false && wlNote.text === 'The source film could not be found.', wlNote);
  check('16. the chip shows no window while the film is unavailable', (await chip())?.hidden === true, await chip());
  await clickSelector(WL_DONE);
  check('9. DONE closes the W/L panel', await isHidden('.viewer-wl'), null);

  // 10 (first half). Escape during a placement cancels it and stays in edit mode.
  await clickSelector('[data-level-key="place:FH2"]');
  const placingFH2 = await ev(`window.__lv.editor()?.placing?.code ?? null`);
  await cdp.send('Page.bringToFront');
  await cdp.key('Escape');
  await cdp.settle(100);
  const afterEscape = await ev(`(async () => { const s = (await import('./renderer/store.js')).getState(); return { editing: s.editing, placing: s.levelEditor?.placing ?? null }; })()`);
  check('10. Escape during a placement cancels it and stays in edit mode', placingFH2 === 'FH2' && afterEscape.editing === true && afterEscape.placing === null, { placingFH2, afterEscape });

  // 11. The stash: one unsaved change (Head 1), then another study opened from the list.
  check('11. one unsaved change before leaving', (await ev('window.__lv.unsaved()')) === 1, await ev('window.__lv.unsaved()'));
  await openFromList(HAND);
  const away = await ev(`(async () => ({ editor: (await import('./renderer/store.js')).getState().levelEditor, stashed: window.__lv.hasStashedEditor(${js(SEG)}) }))()`);
  check('11. opening SP-9301 from the list leaves no level editor and stashes SP-9300’s (hasStashedEditor)', away.editor === null && away.stashed === true, away);
  await openFromList(SEG);
  await enterEdit();
  check('11. reopening SP-9300 and pressing Edit brings the unsaved change back',
    (await badge('FH1')) === 'Edited' && (await text('.lv-unsaved')) === '1 UNSAVED CHANGE' && (await ev(`window.__lv.hasStashedEditor(${js(SEG)})`)) === false,
    { FH1: await badge('FH1'), unsaved: await text('.lv-unsaved') });

  // 10 (second half). Discard, then Escape with nothing open and nothing unsaved leaves at once.
  await clearToasts();
  await clickSelector('.lv-discard');
  check('10. Discard in the footer toasts Discarded 1 change.', await toastSeen('Discarded 1 change.'), await ev('window.__lv.toasts'));
  await settled(SEG);
  await cdp.key('Escape');
  await cdp.settle(120);
  const escapedOut = await ev(`(async () => { const s = (await import('./renderer/store.js')).getState(); return { editing: s.editing, editor: s.levelEditor, prompt: Boolean(document.querySelector('.lv-prompt')) }; })()`);
  check('10. Escape with nothing open and nothing unsaved exits with no prompt', escapedOut.editing === false && escapedOut.editor === null && escapedOut.prompt === false, escapedOut);

  // 11 (end). Stash again (T1 marked visible: one change, not projected), then delete SP-9300 from the list.
  await enterEdit();
  await clickSelector('[data-level-key="open:thoracic"]');
  await clickSelector(checkboxOf('T1'));
  const t1Change = await ev('window.__lv.unsaved()');
  await openFromList(HAND);
  const stashedAgain = await ev(`window.__lv.hasStashedEditor(${js(SEG)})`);
  await clickSelector(STUDIES_NAV);
  await until(`document.querySelector(${js(`${row(SEG)} .studies-delete`)})`, 5000);
  await clickSelector(`${row(SEG)} .studies-delete`);
  await clickSelector(`${row(SEG)} .studies-delete-confirm`);
  const deleted = await until(`window.__lv.study(${js(SEG)}) === null`, 5000);
  check('11. deleting a study with a stashed editor drops the stash (hasStashedEditor false)',
    t1Change === 1 && stashedAgain === true && deleted && (await ev(`window.__lv.hasStashedEditor(${js(SEG)})`)) === false, { t1Change, stashedAgain, deleted });
  check('11. the delete removes the study’s label record and sidecar from disk',
    await untilNode(() => !fs.existsSync(path.join(LABELS, segRecordName)) && !fs.existsSync(path.join(USER_DATA, 'predictions', `${SEG}.json`))),
    { label: fs.existsSync(path.join(LABELS, segRecordName)), sidecar: fs.existsSync(path.join(USER_DATA, 'predictions', `${SEG}.json`)) });

  // 12 and 16 (dom). The unsegmented film: it opens in edit mode on its decoded original, every level starts
  // visible (an Auto film with no result, D6), window / level is ready, a level placed by hand saves a record with
  // no contours, and outside edit mode it stays on its original (R16).
  await openFromList(HAND);
  const unseg = await studyOf(HAND);
  check('12. the unsegmented film has no result before Edit', unseg?.measurements === null && unseg?.geometry === null, unseg && { measurements: unseg.measurements, geometry: unseg.geometry });
  await enterEdit();
  const decoded = await until(`document.querySelector('.viewer-canvas-dynamic')?.width === 600 && document.querySelector('.viewer-canvas-dynamic')?.height === 800`, 20000);
  check('12. Edit opens the unsegmented film on its decoded original, no card over it',
    decoded && (await isHidden('.run-card')), await ev(`[document.querySelector('.viewer-canvas-dynamic')?.width, document.querySelector('.viewer-canvas-dynamic')?.height]`));
  check(`12. an Auto film with no result starts with all sixteen levels to place (0 PLACED ${MID} 16 TO PLACE)`,
    (await text('.lv-summary')) === `0 PLACED ${MID} 16 TO PLACE`, await text('.lv-summary'));
  await windowLevelChecks('16 (dom)');
  await clickSelector('[data-level-key="place:L1"]');
  for (const point of [[200, 150], [400, 160], [196, 232], [396, 242]]) await clickImage(...point);
  check('12. four clicks place L1 by hand (Manual)', (await badge('L1')) === 'Manual', await badge('L1'));
  await settled(HAND);
  const handStudy = await studyOf(HAND);
  check('12. the hand-placed film has geometry and measurements but no prediction id and no qc.models (isHandPlaced)',
    Boolean(handStudy?.geometry?.vertebrae?.L1) && Boolean(handStudy?.measurements) && handStudy.predictionId == null && !handStudy.qc?.models,
    handStudy && { predictionId: handStudy.predictionId, models: handStudy.qc?.models ?? null });
  await clearToasts();
  await clickSelector('.lv-save');
  check('12. Save edits toasts Saved 1 edit to the label record.', await toastSeen('Saved 1 edit to the label record.'), await ev('window.__lv.toasts'));
  const handRecordName = 'levels-hand-placed.label.json';
  await untilNode(() => fs.existsSync(path.join(LABELS, handRecordName)));
  let handRecord = null;
  try { handRecord = readRecord(handRecordName); } catch (error) { handRecord = null; }
  const handValid = handRecord ? validateAgainst(SCHEMA, handRecord) : { ok: false, errors: ['unreadable'] };
  check('12. the hand-placed record validates', handValid.ok, handValid.errors.slice(0, 5));
  const handContours = handRecord ? Object.values(handRecord.levels).filter((l) => 'contour' in l) : [];
  check('12. the hand-placed film writes contour null everywhere',
    handContours.length > 0 && handContours.every((l) => l.contour === null) && handRecord.levels.L1.state === 'manual', handContours.map((l) => [l.state, l.contour]));
  check("12. the hand-placed record names model 'none', the 600x800 image and a 64-hex digest",
    handRecord?.model?.name === 'none' && handRecord.image?.width_px === 600 && handRecord.image?.height_px === 800 && /^[0-9a-f]{64}$/.test(handRecord.image?.sha256 ?? ''),
    handRecord && { model: handRecord.model, image: handRecord.image });
  const windowInEdit = await windowState();   // for section 17: what leaving edit mode must keep
  await cdp.key('Escape');
  await cdp.settle(150);
  const outOfEdit = await ev(`(async () => ({ editing: (await import('./renderer/store.js')).getState().editing, width: document.querySelector('.viewer-canvas-dynamic')?.width, card: !document.querySelector('.run-card')?.classList.contains('is-hidden') }))()`);
  check('12. outside edit mode the hand-placed film stays on its original, with no card (R16)',
    outOfEdit.editing === false && outOfEdit.width === 600 && outOfEdit.card === false, outOfEdit);

  await windowOutsideEditChecks(windowInEdit);

  // 13. The main process refuses a label file name that is not a bare <stem>.label.json, through the real bridge.
  const refused = await ev(`Promise.allSettled([window.spineContour.saveLabelRecord('..', {}), window.spineContour.saveLabelRecord('a/b.label.json', {})])
    .then((outcomes) => outcomes.map((o) => (o.status === 'rejected' ? String(o.reason?.message ?? o.reason) : 'fulfilled')))`);
  check("13. saveLabelRecord('..') and saveLabelRecord('a/b.label.json') reject with Invalid label file name.",
    refused.length === 2 && refused.every((m) => m !== 'fulfilled' && m.endsWith('Invalid label file name.')), refused);
  const cleaned = await ev(`import('./renderer/api.js').then((api) => api.saveLabelRecord('..', {}).then(() => 'fulfilled', (e) => e.message))`);
  check('13. the api wrapper hands the rejection on as the display-ready Invalid label file name.', cleaned === 'Invalid label file name.', cleaned);
}

// ---------------------------------------------------------------------------
// Phase `film`: one real film. No screenshots.

async function filmPhase() {
  const film = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!film || !fs.existsSync(film)) {
    check('precondition: a real film path in argv[2]', false, film);
    return;
  }
  const fileName = path.basename(film);
  const stem = fileName.replace(/\.[^.]+$/, '');
  await ev(`(async () => {
    const store = await import('./renderer/store.js');
    const { newStudy } = await import('./renderer/screens/studies.js');
    const study = { ...newStudy({ id: ${js(REAL)}, fileName: ${js(fileName)}, filePath: ${js(film)} }), region: 'lumbar', labelFile: null };
    const ours = new Set([${js(SEG)}, ${js(HAND)}, ${js(REAL)}, ${js(OTHER)}]);
    store.setState((s) => ({ ack: true, studies: [study, ...s.studies.filter((x) => !ours.has(x.id))], screen: 'studies',
      studiesTab: 'find', query: '', openId: null, editing: false, levelEditor: null, selection: null, measurementDrafts: {},
      running: null, batch: null, tab: 'meas' }));
    store.setState({ screen: 'analysis', openId: ${js(REAL)}, selectedLevel: null, zoom: 1, panX: 0, panY: 0, panMode: false });
    const analysis = await import('./renderer/screens/analysis.js');
    window.__lvRun = analysis.segmentStudy(${js(REAL)}).then((outcome) => { window.__lvRunOutcome = outcome; });
    return true;
  })()`);
  await installHelpers();
  const finished = await until(`window.__lvRunOutcome !== undefined`, 400000, 500);
  const outcome = await ev('window.__lvRunOutcome ?? null');
  const segmented = await studyOf(REAL);
  check('film: the real film segments as a lumbar film', finished && outcome?.ok === true && Boolean(segmented?.measurements) && Object.keys(segmented?.geometry?.vertebrae ?? {}).length > 0,
    { outcome, vertebrae: Object.keys(segmented?.geometry?.vertebrae ?? {}), predictionId: Boolean(segmented?.predictionId) });
  await until(`document.querySelector('.viewer-canvas-dynamic')?.width > 300 && document.querySelector('.run-card')?.classList.contains('is-hidden')`, 15000);

  check('film: Edit opens the levels panel', await enterEdit(), null);
  await windowLevelChecks('16 (film)');

  // Edit one segmented lumbar level by a handle drag and a nudge, so the record holds an edited level.
  const code = await ev(`(() => {
    const e = window.__lv.editor();
    return ['L3', 'L2', 'L4', 'L1', 'L5'].find((c) => e?.levels?.[c]?.visible && e.levels[c].geometry && e.model?.[c]) ?? null;
  })()`);
  if (code) {
    await clickSelector(`[data-level-key="${code}"]`);
    const sa = await ev(`window.__lv.editor()?.levels?.${code}?.geometry?.superior?.[0] ?? null`);
    const focus = await ev('window.__lv.editor()?.handle ?? null');
    check(`film: selecting ${code} focuses its SA handle`, focus?.code === code && focus.handle === 'SA', focus);
    const from = await cdp.toClient(sa[0], sa[1]);
    await drag(from.x, from.y, from.x + 10, from.y + 8);
    await settled(REAL);
    const moved = await ev(`window.__lv.editor()?.levels?.${code}?.geometry?.superior?.[0] ?? null`);
    check(`film: dragging ${code} SA moves it and the badge reads Edited`,
      Boolean(moved) && (moved[0] !== sa[0] || moved[1] !== sa[1]) && (await badge(code)) === 'Edited', { sa, moved, badge: await badge(code) });
    await cdp.send('Page.bringToFront');
    await ev('(() => { const a = document.activeElement; if (a && a.blur) a.blur(); return true; })()');
    await cdp.key('ArrowRight');
    await settled(REAL);
    const nudged = await ev(`window.__lv.editor()?.levels?.${code}?.geometry?.superior?.[0] ?? null`);
    const stored = (await studyOf(REAL))?.geometry?.vertebrae?.[code]?.superior?.[0] ?? null;
    check(`film: ArrowRight nudges the focused ${code} SA by 1 px and /measure commits it`,
      Boolean(nudged && moved) && Math.abs(nudged[0] - moved[0] - 1) < 1e-6 && Boolean(stored) && Math.abs(stored[0] - nudged[0]) < 1e-6, { moved, nudged, stored });
  } else {
    check('film: a segmented lumbar level to edit', false, await ev('Object.keys(window.__lv.editor()?.model ?? {})'));
  }

  await clearToasts();
  await clickSelector('.lv-save');
  const savedToast = await until(`window.__lv.toasts.some((t) => t.startsWith('Saved '))`, 15000);
  check('film: Save edits toasts Saved 1 edit to the label record.', savedToast && (await ev('window.__lv.toasts')).includes('Saved 1 edit to the label record.'), await ev('window.__lv.toasts'));
  const name = (await studyOf(REAL))?.labelFile ?? `${stem}.label.json`;
  await untilNode(() => fs.existsSync(path.join(LABELS, name)));
  let record = null;
  try { record = readRecord(name); } catch (error) { record = null; }
  const valid = record ? validateAgainst(SCHEMA, record) : { ok: false, errors: ['unreadable'] };
  check(`film: the record ${name} validates against the schema`, valid.ok, valid.errors.slice(0, 5));
  check('film: image.sha256 is 64 hex characters', /^[0-9a-f]{64}$/.test(record?.image?.sha256 ?? ''), record?.image?.sha256);
  check('film: model.version is not empty', typeof record?.model?.version === 'string' && record.model.version.length > 0, record?.model);
  check("film: model.version comes from the run (not 'unknown')", typeof record?.model?.version === 'string' && record.model.version !== 'unknown', record?.model);
  const canvasSize = await ev(`[document.querySelector('.viewer-canvas-dynamic')?.width, document.querySelector('.viewer-canvas-dynamic')?.height]`);
  check('film: the record names the stored image size', record?.image?.width_px === canvasSize[0] && record?.image?.height_px === canvasSize[1], { image: record?.image, canvasSize });
  // 12 (film). A segmented body level carries the model's mask outline (>= 3 points); an edited or manual one null.
  const bodies = record ? ['C3', 'C4', 'C5', 'C6', 'C7', 'L1', 'L2', 'L3', 'L4', 'L5'].map((c) => [c, record.levels[c]]).filter(([, l]) => l && 'contour' in l) : [];
  const segBodies = bodies.filter(([, l]) => l.state === 'segmented');
  const otherBodies = bodies.filter(([, l]) => l.state !== 'segmented');
  console.log(`info  film record body levels: ${bodies.map(([c, l]) => `${c} ${l.state}${Array.isArray(l.contour) ? ` (${l.contour.length} pts)` : ''}`).join(', ')}`);
  check('12. (film) every segmented body level has a contour of at least 3 points',
    segBodies.length > 0 && segBodies.every(([, l]) => Array.isArray(l.contour) && l.contour.length >= 3), bodies.map(([c, l]) => [c, l.state, Array.isArray(l.contour) ? l.contour.length : l.contour]));
  check('12. (film) every edited or manual body level has contour null',
    otherBodies.length > 0 && otherBodies.every(([, l]) => l.contour === null), otherBodies.map(([c, l]) => [c, l.state, l.contour === null]));

  await cdp.key('Escape');
  await cdp.settle(150);
  check('film: Escape after the save leaves edit mode with no prompt',
    (await ev(`(async () => (await import('./renderer/store.js')).getState().editing)()`)) === false && !(await present('.lv-prompt')), null);
}

// ---------------------------------------------------------------------------

let crashed = null;
try {
  await until(`document.querySelector('#app')?.childElementCount > 0`, 30000);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.bringToFront');
  if (PHASE === 'film') await filmPhase();
  else await domPhase();
} catch (error) {
  crashed = error;
  check('the suite ran to the end without throwing', false, String(error?.stack ?? error));
} finally {
  // Remove what this run injected: the studies, their sidecars and label records, any stashed editor; reset the keys.
  try {
    const leftovers = await ev(`(async () => {
      const store = await import('./renderer/store.js');
      const api = await import('./renderer/api.js');
      const wiring = await import('./renderer/level-editor.js');
      const ids = [${js(SEG)}, ${js(HAND)}, ${js(REAL)}, ${js(OTHER)}];
      const s = store.getState();
      const names = s.studies.filter((x) => ids.includes(x.id) && x.labelFile).map((x) => x.labelFile);
      store.setState({ editing: false, levelEditor: null, filmWindow: null, selection: null, screen: 'studies', openId: null, measurementDrafts: {} });
      for (const id of ids) { wiring.forgetLevelEditor(id); try { await api.deletePrediction(id); } catch (_e) {} }
      for (const name of names) { try { await api.deleteLabelRecord(name); } catch (_e) {} }
      store.setState((st) => ({ studies: st.studies.filter((x) => !ids.includes(x.id)), paramSelected: (st.paramSelected ?? []).filter((id) => !ids.includes(id)) }));
      if (window.__lv?.unsub) window.__lv.unsub();
      delete window.__lv; delete window.__lvRun; delete window.__lvRunOutcome;
      return names;
    })()`);
    for (const name of ['levels-ui-check.label.json', 'levels-hand-placed.label.json', ...(leftovers ?? [])]) {
      fs.rmSync(path.join(LABELS, name), { force: true });
    }
    if (PHASE !== 'film') fs.rmSync(HAND_PATH, { force: true });
  } catch (error) {
    console.log(`cleanup failed: ${error.message}`);
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
  check('no console errors or exceptions during the run', cdp.errors.length === 0, cdp.errors);
  cdp.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed (phase ${PHASE})`);
process.exit(failed || crashed ? 1 : 0);
