// The level editor (plan 2026-10-10 Task 14) against the real, running app: the Vertebral levels panel, placing a
// level (the step chips choose which point the next click sets: gate feedback G2, 2026-10-11), unchecking one, Save
// edits and the label record on disk, Discard and the exit prompt, femoral rim points and FIT, window / level, the
// keyboard, the per-study stash, and the main process's label-file name check. Section 17 (gate feedback G3 and G4,
// 2026-10-11): window / level outside edit mode -- the toolbar button, the panel, the chip, the window kept across
// edit mode and reset by opening another study (D15), the right-button drag (D16) and the double right-click (D17).
// The window is the view's, `state.filmWindow` (renderer/film-window.js), read through `window.__lv.filmWindow()`.
// The review of G3/G4 (2026-10-11) adds section-17 checks elsewhere in the run, where their film is on the stage: a
// right press without movement, and a right-first chord, decode nothing on SP-9300 before any window was asked for
// (R37, first, before section 1); a right drag on SP-9300's unavailable film with the panel closed toasts its reason
// once (R31, in section 9); and on SP-9301 a right drag while placing L3, from the black surround, and with Pan
// pressed (the panel closed), and a left drag with Pan pressed and the panel open (R36).
// Gate feedback G5 (2026-10-11, plan D18): the saved record lists each level's and head's `edited_points` and carries
// an `edits` summary. Section 6 reads them on SP-9300 (L3 manual lists every corner, S1 not visible and a segmented
// level nothing, every entry carries a list, and the summary agrees with the entries, computed here from the record
// alone); the film phase reads them on the level edited by the SA handle drag and the nudge (that corner only, and
// `edits.points_moved` the sum of the edited lists).
// Gate feedback G6 (2026-10-12, plan D19, rulings R40 and R41): Mark reviewed writes the label record of a film that
// has none. Section 18, last in the dom phase, injects SP-9304, a fresh copy of the segmented fixture with all five
// lumbar bodies (its own file name, sidecar and prediction id), and outside edit mode clicks the Analysis panel's Mark
// reviewed: within 10 s the study names `levels-review-check.label.json`, the file is under <userData>/labels/ and
// validates, every entry reads segmented or not visible with no edited points, and `Saved the label record.` is
// toasted; then unmark and mark again leave that one file, unwritten, with no second toast. Review round 1 of G6
// (R42): the click is followed at once by opening SP-9301, whose load takes the single image cache, and the write still
// lands; with SP-9301 cached, the page's own imageInfo(SP-9304, { storedOnly: true }) reads SP-9304's sidecar, twice.
// Gate feedback G7 (2026-10-13, plan D20, rulings R43 and R44): the level plates sit outside their level on the
// posterior side and can be dragged. Section 19 runs on SP-9300 in edit mode straight after section 3 (L3 just placed),
// reading the plates the stage last drew through the page's own components/viewer.js `drawnPlates()` (image px): every
// plate outside its level on the posterior side (rightward: the fixture faces left), the grab hover and the drag class,
// a left drag on L3's plate by (40, 20) client px setting `platePositions.L3` to that travel in image px and moving the
// rect by it, L3's SA handle under the plate still winning the press, a double-click putting the plate back, and another
// study opened from the list resetting `platePositions` to {} (SP-9300 then reopened, its stash bringing L3 back).
// Annotation editor round 2 (2026-10-15; docs/superpowers/specs/2026-10-15-annotation-editor-round-2-design.md): SP-9301
// is seeded as a film whose run failed (`processingError` 'No spine was found on this film.'). Section 12 reads its header
// pill Failed before Edit and Hand-placed once the first level placed by hand is committed (the measure queue's own write
// clears the failure, §4.3); Discard then takes that level off and the pill reads Failed again, the failure back and
// the result gone (the round's final review, I1), and L1 is placed again; outside edit mode it marks and unmarks the
// film reviewed (Reviewed, then Hand-placed again) and reads Hand-placed on the Find list's row. Section 20, on SP-9300
// after section 7: REVERT returns an Edited level to the model's output, L4 moved through the page's own
// commitHandleMove and then Head 1, whose row stacks Place… over REVERT (§5). Section 21, straight after: the comment
// box in the panel's footer, its first keystroke undone by Ctrl+Z (I2: the foot is never detached), typed, kept with its
// focus and caret across a rebuild that leaves the foot and the comment block the same nodes, Escape in it ignored by
// the stage, saved into the record's `comment` and the study's `labelComment`, discarded, shown read-only on the
// Analysis panel outside edit mode and read back on Edit (§3); it leaves SP-9300 in edit mode for section 8.
//
//   node tools/smoke/launch.mjs                                     (SPINE_CONTOUR_USER_DATA under %TEMP%)
//   node tools/smoke/smoke-levels.mjs                               phase `dom` (the default)
//   SMOKE_PHASE=film node tools/smoke/smoke-levels.mjs <real film>  phase `film`
//   node tools/smoke/cdp.mjs --quit
//
// Phase `dom`: no model run and no real film. Two synthetic, canvas-drawn films: SP-9300, a segmented fixture whose
// geometry is the prototype's (L1, L2, L4, L5, S1 and two heads; L3 missing) with an all-zero mask, measured by the
// real /measure; and SP-9301, an unsegmented film written to %TEMP% and placed by hand, decoded by the real /decode, its
// last run recorded as failed (round 2).
// Section 17 adds SP-9303, a study with no film, only so that another study can be opened and left; section 18 adds
// SP-9304, the second copy of the segmented fixture, for Mark reviewed.
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
const REVIEW = 'SP-9304'; // a second copy of the segmented fixture, marked reviewed in section 18 (dom; G6)
const SEG_FILE = 'levels-ui-check.png';
const REVIEW_FILE = 'levels-review-check.png';
const REVIEW_RECORD = 'levels-review-check.label.json';
const REVIEW_BUTTON = '.analysis-review';
const SAVED_TOAST = 'Saved the label record.';
const REVIEW_WRITE_FAILED = 'Marked reviewed. The label record could not be written: ';
const HAND_FILE = 'levels-hand-placed.png';
const HAND_PATH = path.join(FILM_DIR, HAND_FILE);
const HAND_FAILURE = 'No spine was found on this film.';   // SP-9301's seeded failure (round 2, spec §4.3)
const HAND_FAILED_AT = '2026-10-10T08:00:00.000Z';         // and when it was recorded
const PREDICTION_ID = 'smoke-levels-fixture';
const STATUS_PILL = '.analysis-status .badge';
const COMMENT = 'Hardware over L4';

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
// (Round 2) A call into the page's own renderer/level-editor.js (`m`), as the panel's controls and the stage make it.
const viaWiring = (call) => ev(`import('./renderer/level-editor.js').then((m) => { ${call}; return true; })`);
const editLabel = () => text('.viewer-editbar-label');
const readRecord = (name) => JSON.parse(fs.readFileSync(path.join(LABELS, name), 'utf8'));

// (Gate feedback G5, D18) A record's entries, levels and heads together, and the edits summary computed from them
// alone, to compare with the record's own `edits`. Null when an entry has no edited_points list.
const recordEntries = (record) => [...Object.values(record?.levels ?? {}), ...(record?.femoral_heads ?? [])];
function editsFromEntries(record) {
  const entries = recordEntries(record);
  if (entries.length === 0 || !entries.every((e) => Array.isArray(e.edited_points))) return null;
  const count = (state) => entries.filter((e) => e.state === state).length;
  const points = (state) => entries.filter((e) => e.state === state).reduce((n, e) => n + e.edited_points.length, 0);
  return {
    segmented: count('segmented'), edited: count('edited'), manual: count('manual'), not_placed: count('not_placed'),
    not_visible: count('not_visible'), points_moved: points('edited'), points_placed: points('manual'),
  };
}

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

// (2026-10-19, final review; R15) Enabled is not enough: until the film is on the stage the run card covers the toolbar,
// and an unsegmented film's preview or decode now starts 150 ms after it opens, so a click in that time lands on the
// card (section 12 read 130/145 that way). The tool must also be the topmost thing at its own centre.
async function enterEdit() {
  await until(`(() => {
    const b = document.querySelector(${js(EDIT_TOOL)});
    if (!b || b.disabled) return false;
    const r = b.getBoundingClientRect();
    return b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  })()`, 15000);
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
// (Section 17, R36) The view's pan and the Pan toggle.
const PAN_TOOL = '.viewer-tool[aria-label="Pan"]';
const viewNow = () => ev(`import('./renderer/store.js').then((m) => { const s = m.getState(); return { panX: s.panX, panY: s.panY, panMode: s.panMode }; })`);
const R31_TOAST = 'Window / level is unavailable. The source film could not be found.';
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

  // D16 on the black surround (the review's finding 5): a right drag that starts beside the film, on .viewer-host, windows
  // it as one on the film does. Right and down, back up from the drag above. The point is the first of the surround's
  // left, right and lower middles that the page itself says is the host.
  const surround = await ev(`(() => {
    const s = document.querySelector('.viewer-stage').getBoundingClientRect();
    const c = document.querySelector('.viewer-canvas-dynamic').getBoundingClientRect();
    const candidates = [[(s.left + c.left) / 2, c.top + c.height / 2], [(c.right + s.right) / 2, c.top + c.height / 2], [c.left + c.width / 2, (c.bottom + s.bottom) / 2]];
    for (const [x, y] of candidates.map(([x, y]) => [Math.round(x), Math.round(y)])) {
      const target = document.elementFromPoint(x, y);
      if (target && target.classList.contains('viewer-host')) return { x, y };
    }
    return null;
  })()`);
  const beforeSurround = await windowState();
  if (surround) await rightDrag(surround.x, surround.y, surround.x + 20, surround.y + 10);
  const afterSurround = await windowState();
  check('17. a right-button drag that starts on the black surround windows the film: right raises the width, down the level (D16)',
    Boolean(surround) && afterSurround?.width === beforeSurround?.width + 80 && afterSurround?.level === beforeSurround?.level + 40 && afterSurround.open === false
      && !(await stageClasses()).dragging,
    { surround, before: pairOf(beforeSurround), after: pairOf(afterSurround) });

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

  // D16 while placing (the review's finding 5): L3 placed by one click, then a right drag windows the film and places
  // nothing; CANCEL ends the placement with nothing changed. Clear of the drag above in time (no double right-click).
  await clickSelector('[data-level-key="place:L3"]');
  await clickImage(250, 430);
  const placingBefore = await ev('window.__lv.editor()?.placing ?? null');
  const beforePlacingDrag = await windowState();
  const editFilm = await cdp.rect('.viewer-canvas-dynamic');
  await cdp.settle(450);
  await rightDrag(editFilm.cx, editFilm.cy, editFilm.cx - 20, editFilm.cy - 10);
  const placingAfter = await ev('window.__lv.editor()?.placing ?? null');
  const afterPlacingDrag = await windowState();
  await clickSelector('[data-level-key="cancel:L3"]');
  const placingCancelled = await ev('window.__lv.editor()?.placing ?? null');
  check('17. while placing L3 a right-button drag windows the film and leaves the placing\'s points as they were; CANCEL then ends it (D16)',
    placingBefore?.code === 'L3' && placingBefore.points.filter(Boolean).length === 1 && placingAfter?.code === 'L3'
      && JSON.stringify(placingAfter.points) === JSON.stringify(placingBefore.points) && placingAfter.current === placingBefore.current
      && afterPlacingDrag?.width === beforePlacingDrag?.width - 80 && afterPlacingDrag?.level === beforePlacingDrag?.level - 40
      && placingCancelled === null && (await badge('L3')) === 'Not placed',
    { before: placingBefore?.points ?? null, after: placingAfter?.points ?? null, window: [pairOf(beforePlacingDrag), pairOf(afterPlacingDrag)], placingCancelled, L3: await badge('L3') });
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

  // R36 (the review's finding 3): with Pan pressed and the panel open the LEFT button windows and does not pan; then,
  // the panel closed and Pan still pressed, a RIGHT drag windows and does not pan either (D16); Pan unpressed after.
  await clickSelector(PAN_TOOL);
  const panPressed = await viewNow();
  const panFilm = await cdp.rect('.viewer-canvas-dynamic');
  await drag(panFilm.cx, panFilm.cy, panFilm.cx - 20, panFilm.cy - 10);
  const panLeft = await windowState();
  const viewAfterLeft = await viewNow();
  check('17. with Pan pressed and the panel open a left drag windows the film and does not pan (R36)',
    panPressed.panMode === true && panLeft?.width === fresh?.width - 80 && panLeft?.level === fresh?.level - 40 && panLeft.open === true
      && viewAfterLeft.panX === panPressed.panX && viewAfterLeft.panY === panPressed.panY,
    { panPressed, viewAfterLeft, before: pairOf(fresh), after: pairOf(panLeft) });
  await clickSelector(WL_DONE);
  await cdp.settle(450);
  await rightDrag(panFilm.cx, panFilm.cy, panFilm.cx - 20, panFilm.cy - 10);
  const panRight = await windowState();
  const viewAfterRight = await viewNow();
  await clickSelector(PAN_TOOL);
  const panReleased = await viewNow();
  const panTool = await ev(`document.querySelector(${js(PAN_TOOL)})?.getAttribute('aria-pressed') ?? null`);
  check('17. with Pan pressed and the panel closed a right drag windows the film and does not pan; Pan is unpressed after (D16)',
    panRight?.width === panLeft?.width - 80 && panRight?.level === panLeft?.level - 40 && panRight.open === false
      && viewAfterRight.panX === panPressed.panX && viewAfterRight.panY === panPressed.panY && panReleased.panMode === false && panTool === 'false',
    { before: pairOf(panLeft), after: pairOf(panRight), viewAfterRight, panReleased, panTool });

  // D16 on a film with no window yet, after R37: the first move past the slop starts the decode (its original is
  // cached by now, so it lands within that move's task) and the drag's start is the first move after it, so the drag
  // leaves the film at its default window however the moves arrive; the next right drag windows from its press.
  await openFromList(OTHER);
  await openFromList(HAND);
  await until(`document.querySelector('.viewer-canvas-dynamic')?.width === 600`, 10000);
  const none = await windowState();
  const film = await cdp.rect('.viewer-canvas-dynamic');
  await rightDragVia(film.cx, film.cy, [[film.cx - 5, film.cy - 5], [film.cx - 10, film.cy - 10]]);
  await until(`window.__lv.filmWindow()?.status === 'ready'`, 10000);
  const byDrag = await windowState();
  check('17. a right-button drag on a film with no window yet decodes it once it moves, the panel closed, at the default (D16, R37)',
    none === null && byDrag?.status === 'ready' && byDrag.open === false
      && byDrag.width === byDrag.defaultWidth && byDrag.level === byDrag.defaultLevel,
    { none: pairOf(none), byDrag: byDrag && { status: byDrag.status, pair: pairOf(byDrag), defaults: [byDrag.defaultWidth, byDrag.defaultLevel] } });
  await cdp.settle(450);
  await rightDrag(film.cx, film.cy, film.cx - 20, film.cy - 10);
  const windowed = await windowState();
  check('17. the next right-button drag windows it from its press: (-80, -40) (D16)',
    windowed?.width === windowed?.defaultWidth - 80 && windowed?.level === windowed?.defaultLevel - 40 && (await chip())?.text === `W ${windowed?.width} ${MID} L ${windowed?.level}`,
    { windowed: windowed && { pair: pairOf(windowed), defaults: [windowed.defaultWidth, windowed.defaultLevel] }, chip: await chip() });
}

// 18 (gate feedback G6, 2026-10-12; plan D19, rulings R40 and R41). Mark reviewed, outside edit mode, writes the label
// record of a film that has none: the zero-change record of the stored state. On SP-9304, a fresh copy of the segmented
// fixture with all five lumbar bodies (L3 included), so every entry reads segmented or not visible; its sidecar and
// prediction id make it a model result that restores from the sidecar (R16). `films` is the dom phase's drawn films.
async function reviewRecordChecks(films) {
  fs.rmSync(path.join(LABELS, REVIEW_RECORD), { force: true });   // a crashed run's leftover, never this run's
  const injected = await ev(`(async () => {
    const store = await import('./renderer/store.js');
    const api = await import('./renderer/api.js');
    const quad = (c) => ({ superior: [c[0], c[1]], inferior: [c[2], c[3]], quadrilateral: [c[0], c[1], c[3], c[2]] });
    const bodies = ${js({ ...BODIES, L3 })};
    const vertebrae = Object.fromEntries(Object.entries(bodies).map(([code, c]) => [code, quad(c)]));
    const result = await api.measure({ vertebrae, s1_superior: ${js(S1)}, femoral_circles: ${js(CIRCLES)} });
    await api.savePrediction(${js(REVIEW)}, { ...result, image_png: ${js(films.image)}, mask_png: ${js(films.mask)},
      labels: { L1: 20, L2: 21, L3: 22, L4: 23, L5: 24 }, prediction_id: ${js(PREDICTION_ID)} });
    const study = { id: ${js(REVIEW)}, source: 'real', fileName: ${js(REVIEW_FILE)}, filePath: '/test/levels-review-check.png',
      name: 'Levels review check', addedAt: new Date().toISOString(), view: 'Standing lateral', clinical: {},
      predictionId: ${js(PREDICTION_ID)}, labelFile: null, reviewedAt: null,
      measurements: result.measurements, geometry: result.geometry, qc: result.qc ?? null };
    store.setState((s) => ({ studies: [study, ...s.studies.filter((x) => x.id !== ${js(REVIEW)})] }));
    return { vertebrae: Object.keys(result.geometry?.vertebrae ?? {}) };
  })()`);
  await openFromList(REVIEW);
  // The restore records the prediction snapshot the record's segmented states are read against.
  const restored = await until(`import('./renderer/components/viewer.js').then((m) => Boolean(m.getPrediction(${js(REVIEW)})))`, 15000);
  const button = () => ev(`(() => { const b = document.querySelector(${js(REVIEW_BUTTON)}); return b ? { text: b.textContent.trim(), disabled: b.disabled, pressed: b.getAttribute('aria-pressed') } : null; })()`);
  const before = await studyOf(REVIEW);
  const offered = await button();
  check('18. precondition: SP-9304 opens on its restored film outside edit mode, with no label record and Mark reviewed enabled',
    restored && (await editingNow()) === false && before?.labelFile === null && !fs.existsSync(path.join(LABELS, REVIEW_RECORD))
      && offered?.text === 'Mark reviewed' && offered.disabled === false,
    { injected, restored, labelFile: before?.labelFile, offered });

  await clearToasts();
  await clickSelector(REVIEW_BUTTON);
  // (Review round 1 of G6, R42) Then, without waiting for the write, the next film, as a review session runs: SP-9301,
  // the film placed by hand (SP-9300 was deleted in section 11), whose load decodes its original by the real /decode
  // and takes the single image cache. The write read SP-9304's stored image already, with no /decode of its original,
  // so the move cannot fail it. (SP-9304's original does not exist, so this step cannot show the decode race itself;
  // test/level-editor-wiring.test.js pins that the review write asks for the stored image only.)
  const movedOn = await openFromList(HAND);
  const named = await until(`window.__lv.study(${js(REVIEW)})?.labelFile === ${js(REVIEW_RECORD)}`, 10000);
  const written = await untilNode(() => fs.existsSync(path.join(LABELS, REVIEW_RECORD)), 10000);
  const marked = await studyOf(REVIEW);
  check(`18. Mark reviewed stamps the study and within 10 s names ${REVIEW_RECORD} on it and writes it under <userData>/labels/, with SP-9301 opened straight after the click (D19, R42)`,
    movedOn && named && written && typeof marked?.reviewedAt === 'string',
    { movedOn, labelFile: marked?.labelFile, reviewedAt: marked?.reviewedAt, written });
  const seen = await toastSeen(SAVED_TOAST);
  const failed = await ev(`window.__lv.toasts.filter((t) => t.startsWith(${js(REVIEW_WRITE_FAILED)}))`);
  check(`18. the toast reads ${SAVED_TOAST}, and no "could not be written" toast came over the next film`,
    seen && failed.length === 0, await ev('window.__lv.toasts'));
  let record = null;
  try { record = readRecord(REVIEW_RECORD); } catch (_error) { record = null; }
  const valid = record ? validateAgainst(SCHEMA, record) : { ok: false, errors: ['unreadable'] };
  check('18. the record validates against the label record schema', valid.ok, valid.errors.slice(0, 5));
  const entries = recordEntries(record);
  check('18. the zero-change record: every level and head segmented or not_visible with no edited points, edits.edited 0 and edits.manual 0',
    entries.length === 16 && entries.every((e) => ['segmented', 'not_visible'].includes(e.state) && Array.isArray(e.edited_points) && e.edited_points.length === 0)
      && record.edits?.edited === 0 && record.edits?.manual === 0 && js(record.edits) === js(editsFromEntries(record)),
    record && { states: entries.map((e) => e.state), edits: record.edits });
  const after = await ev(`(async () => { const s = (await import('./renderer/store.js')).getState(); return { editing: s.editing, editor: s.levelEditor }; })()`);
  check('18. no edit mode was entered: editing false and no level editor in the store', after.editing === false && after.editor === null, after);

  // (R42) The stored-only read when the cache does not hold the film (Mark reviewed clicked before the restore landed):
  // once SP-9301's decoded original holds the single image cache (the page's own ensureFilm, which shares the load the
  // open started), the page's own imageInfo reads SP-9304 from its sidecar, for that call alone. Read twice: the second
  // read comes from the sidecar too, so the first cached nothing.
  const handCached = await until(`import('./renderer/screens/analysis.js').then((m) => m.ensureFilm(${js(HAND)}))
    .then((o) => Boolean(o.images && o.raw && !o.superseded))`, 15000);
  const toastsBefore = await ev('window.__lv.toasts.length');
  const readFact = (id) => `(async () => {
    const m = await import('./renderer/screens/analysis.js');
    try {
      const info = await m.imageInfo(${js(id)}, { storedOnly: true });
      return { sha256: info.sha256, width: info.width, height: info.height, mask: Boolean(info.maskPixels),
        geometry: info.sidecarGeometry ? JSON.stringify(info.sidecarGeometry) : null };
    } catch (error) { return { error: error.message }; }
  })()`;
  const fromSidecar = await ev(readFact(REVIEW));
  const reviewGeometry = await ev(`JSON.stringify(window.__lv.study(${js(REVIEW)})?.geometry ?? null)`);
  check('18. a stored-only read of SP-9304 while SP-9301\'s film holds the image cache reads its sidecar: the record\'s sha256, width and height, its mask, and the sidecar\'s geometry (R42)',
    handCached && record && fromSidecar.sha256 === record.image?.sha256 && fromSidecar.width === record.image?.width_px
      && fromSidecar.height === record.image?.height_px && fromSidecar.mask === true && fromSidecar.geometry === reviewGeometry,
    { handCached, fromSidecar: { ...fromSidecar, geometry: fromSidecar.geometry && `${fromSidecar.geometry.length} chars` }, image: record?.image });
  const twice = await ev(readFact(REVIEW));
  const stage = await ev(`(async () => ({ openId: (await import('./renderer/store.js')).getState().openId, toasts: window.__lv.toasts.length }))()`);
  check('18. that read cached nothing and left the open film alone: a second read comes from the sidecar too, SP-9301 still open, no toast',
    twice.sha256 === fromSidecar.sha256 && twice.geometry !== null && twice.geometry === fromSidecar.geometry
      && stage.openId === HAND && stage.toasts === toastsBefore,
    { twice: { ...twice, geometry: twice.geometry && 'set' }, stage, toastsBefore });

  // Back to SP-9304 for its button.
  await openFromList(REVIEW);
  await until(`(() => { const b = document.querySelector(${js(REVIEW_BUTTON)}); return Boolean(b && !b.disabled); })()`, 10000);

  // Unmark, then mark again, once the first toast has gone (the toast log records a change of text, not a repeat).
  await until(`import('./renderer/store.js').then((m) => m.getState().toast === '')`, 10000);
  await clickSelector(REVIEW_BUTTON);
  const unmarked = await until(`window.__lv.study(${js(REVIEW)})?.reviewedAt === null`, 3000);
  await clickSelector(REVIEW_BUTTON);
  const remarked = await until(`typeof window.__lv.study(${js(REVIEW)})?.reviewedAt === 'string'`, 3000);
  await cdp.settle(1500);
  const files = fs.existsSync(LABELS) ? fs.readdirSync(LABELS).filter((name) => name.startsWith('levels-review-check')) : [];
  let again = null;
  try { again = readRecord(REVIEW_RECORD); } catch (_error) { again = null; }
  const savedToasts = await ev(`window.__lv.toasts.filter((t) => t === ${js(SAVED_TOAST)}).length`);
  check('18. unmark and mark again: still one record, the same name, not written again, and no second toast',
    unmarked && remarked && js(files) === js([REVIEW_RECORD]) && (await studyOf(REVIEW))?.labelFile === REVIEW_RECORD
      && Boolean(again) && again.saved_at === record?.saved_at && savedToasts === 1,
    { unmarked, remarked, files, savedAt: [record?.saved_at ?? null, again?.saved_at ?? null], toasts: await ev('window.__lv.toasts') });
}

// ---------------------------------------------------------------------------
// 19 (gate feedback G7, 2026-10-13; plan D20, rulings R43 and R44). The level plates.

// The plates the stage's last redraw drew, `[{code, x, y, width, height}]` in image px, from the page's own
// components/viewer.js; the store's plate offsets; the canvas's image px per CSS px on each axis.
const drawnPlates = () => ev(`import('./renderer/components/viewer.js').then((m) => m.drawnPlates())`);
const platePositions = () => ev(`import('./renderer/store.js').then((m) => m.getState().platePositions)`);
const canvasRatio = () => ev(`(() => { const c = document.querySelector('.viewer-canvas-dynamic'); const r = c.getBoundingClientRect(); return { rx: c.width / r.width, ry: c.height / r.height }; })()`);
const stageHas = (name) => ev(`document.querySelector('.viewer-stage')?.classList.contains(${js(name)}) ?? null`);
const plateOf = (plates, code) => plates.find((plate) => plate.code === code) ?? null;
const middleOf = (rect) => [rect.x + rect.width / 2, rect.y + rect.height / 2];
const inRect = (rect, [x, y]) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
const near = (a, b, tolerance = 0.01) => Math.abs(a - b) <= tolerance;
const geometryText = (code) => ev(`JSON.stringify(window.__lv.editor()?.levels?.${code}?.geometry ?? null)`);

// Whether a rect and a convex polygon share any point: the separating-axis test, image px.
function rectMeetsPolygon(rect, polygon) {
  const box = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x + rect.width, rect.y + rect.height], [rect.x, rect.y + rect.height]];
  const axes = [box, polygon].flatMap((shape) => shape.map((a, i) => { const b = shape[(i + 1) % shape.length]; return [b[1] - a[1], a[0] - b[0]]; }));
  return axes.every(([ax, ay]) => {
    const along = (shape) => shape.map(([x, y]) => x * ax + y * ay);
    const p = along(box);
    const q = along(polygon);
    return Math.max(...p) >= Math.min(...q) && Math.max(...q) >= Math.min(...p);
  });
}

// On SP-9300 in edit mode straight after section 3: L3 placed by hand and selected, L1, L2, L4, L5 and S1 segmented,
// the two heads (which have no plate). The fixture faces LEFT (every SA left of its SP), so its posterior side is
// rightward. Seven checks: where the plates sit; the hover and the press; a left drag's offset; the rect it moves; a
// handle under a plate still winning; a double-click putting the plate back; another study resetting the offsets.
async function plateChecks() {
  const LEVEL_PLATES = ['L1', 'L2', 'L3', 'L4', 'L5', 'S1'];
  await until(`import('./renderer/components/viewer.js').then((m) => m.drawnPlates().length === ${LEVEL_PLATES.length})`, 5000);
  const first = await drawnPlates();
  const geometries = await ev(`(() => { const e = window.__lv.editor(); return Object.fromEntries(${js(LEVEL_PLATES)}.map((c) => [c, e?.levels?.[c]?.geometry ?? null])); })()`);
  // R43: a body's plate meets none of its quad (SA SP IP IA) and starts right of its anchor, the posterior edge's
  // middle, its middle right of the body's; S1's starts right of SP.
  const placed = first.map((plate) => {
    const g = geometries[plate.code];
    if (!g?.superior) return { code: plate.code, ok: false };
    if (plate.code === 'S1') return { code: 'S1', ok: plate.x >= g.superior[1][0] };
    const [sa, sp] = g.superior;
    const [ia, ip] = g.inferior;
    const outside = !rectMeetsPolygon(plate, [sa, sp, ip, ia]);
    const posterior = plate.x >= (sp[0] + ip[0]) / 2 && middleOf(plate)[0] > (sa[0] + sp[0] + ia[0] + ip[0]) / 4;
    return { code: plate.code, ok: outside && posterior, outside, posterior };
  });
  check('19. every drawn plate (L1-L5 and S1; no head has one) lies outside its level on the posterior side, right on this left-facing fixture (R43)',
    js(first.map((plate) => plate.code)) === js(LEVEL_PLATES) && placed.every((p) => p.ok), { first, placed });

  // R44: a left drag on L3's plate by (40, 20) client px, its press and release dispatched as `drag` does them.
  const before = plateOf(first, 'L3');
  const l3Before = await geometryText('L3');
  const unsavedBefore = await ev('window.__lv.unsaved()');
  const { rx, ry } = await canvasRatio();
  const start = await cdp.toClient(...middleOf(before));
  const x0 = Math.round(start.x);
  const y0 = Math.round(start.y);
  await cdp.mouse('mouseMoved', x0, y0);
  await cdp.settle(60);
  const hover = await stageHas('is-over-plate');
  await cdp.mouse('mousePressed', x0, y0, { button: 'left', buttons: 1, clickCount: 1 });
  await cdp.settle(40);
  const pressing = await stageHas('is-dragging-plate');
  const move = cdp.mouse('mouseMoved', x0 + 40, y0 + 20, { button: 'left', buttons: 1 });
  await cdp.settle(60);
  await Promise.all([move, cdp.mouse('mouseReleased', x0 + 40, y0 + 20, { button: 'left', buttons: 0, clickCount: 1 })]);
  await cdp.settle(80);
  check('19. over a plate the stage shows grab (is-over-plate), and a press on it starts the plate drag (is-dragging-plate)',
    hover === true && pressing === true, { hover, pressing });
  const moved = await platePositions();
  check('19. a left drag on L3\'s plate by (40, 20) client px sets platePositions.L3 to that travel in image px, and nothing else (R44)',
    Array.isArray(moved?.L3) && near(moved.L3[0], 40 * rx) && near(moved.L3[1], 20 * ry) && js(Object.keys(moved)) === js(['L3']),
    { moved, expected: [40 * rx, 20 * ry] });
  const after = plateOf(await drawnPlates(), 'L3');
  const released = await stageHas('is-dragging-plate');
  check('19. the drag moves L3\'s rect by the same image px, its size unchanged; L3\'s geometry and the unsaved count are untouched, and the release ends the drag',
    Boolean(after) && near(after.x - before.x, 40 * rx) && near(after.y - before.y, 20 * ry) && after.width === before.width && after.height === before.height
      && (await geometryText('L3')) === l3Before && (await ev('window.__lv.unsaved()')) === unsavedBefore && released === false,
    { before, after, released });

  // Handles win: L3 (re)selected from its row, its plate dragged so that the SA handle sits 3 CSS px inside the plate's
  // left edge at its middle height; then the pointer over SA and a press there.
  await clickSelector('[data-level-key="L3"]');
  const sa = await ev('window.__lv.editor()?.levels?.L3?.geometry?.superior?.[0] ?? null');
  const from = await cdp.toClient(...middleOf(after));
  const fx = Math.round(from.x);
  const fy = Math.round(from.y);
  await drag(fx, fy, fx + Math.round((sa[0] - 3 * rx - after.x) / rx), fy + Math.round((sa[1] - after.height / 2 - after.y) / ry));
  const over = plateOf(await drawnPlates(), 'L3');
  const positionsOver = await platePositions();
  const saClient = await cdp.toClient(sa[0], sa[1]);
  const sx = Math.round(saClient.x);
  const sy = Math.round(saClient.y);
  await cdp.mouse('mouseMoved', sx, sy);
  await cdp.settle(60);
  const hovered = { handle: await stageHas('is-over-handle'), plate: await stageHas('is-over-plate') };
  await cdp.mouse('mousePressed', sx, sy, { button: 'left', buttons: 1, clickCount: 1 });
  await cdp.settle(60);
  const pressed = { handle: await stageHas('is-dragging-handle'), plate: await stageHas('is-dragging-plate'), focus: await ev('window.__lv.editor()?.handle ?? null') };
  await cdp.mouse('mouseReleased', sx, sy, { button: 'left', buttons: 0, clickCount: 1 });
  await cdp.settle(80);
  check('19. with L3\'s plate over its SA handle the handle wins: the hover is the handle\'s, and a press there starts the handle\'s drag, not the plate\'s',
    Boolean(over) && inRect(over, sa) && hovered.handle === true && hovered.plate === false && pressed.handle === true && pressed.plate === false
      && pressed.focus?.code === 'L3' && pressed.focus.handle === 'SA' && js(await platePositions()) === js(positionsOver) && (await geometryText('L3')) === l3Before,
    { over, sa, hovered, pressed, positionsOver });

  // A double-click on the plate, 3 CSS px inside its right edge (clear of the handle's 14 px grab), puts it back.
  const spot = await cdp.toClient(over.x + over.width - 3 * rx, over.y + over.height / 2);
  const qx = Math.round(spot.x);
  const qy = Math.round(spot.y);
  const clear = Math.hypot(qx - sx, qy - sy);
  await cdp.mouse('mouseMoved', qx, qy);
  for (const clickCount of [1, 2]) {
    await cdp.mouse('mousePressed', qx, qy, { button: 'left', buttons: 1, clickCount });
    await cdp.mouse('mouseReleased', qx, qy, { button: 'left', buttons: 0, clickCount });
  }
  await cdp.settle(120);
  const reset = await platePositions();
  const back = plateOf(await drawnPlates(), 'L3');
  check('19. a double-click on L3\'s plate puts it back: platePositions holds no L3 and the plate is where it was first drawn (R44)',
    clear > 15 && js(reset) === '{}' && Boolean(back) && near(back.x, before.x, 1e-6) && near(back.y, before.y, 1e-6),
    { clear, reset, back, before });

  // Another study opened from the list resets the offsets (FRESH_VIEW); back on SP-9300 the stash brings L3 back
  // (as section 11 shows) and every plate is drawn where it was first.
  const l1 = plateOf(await drawnPlates(), 'L1');
  const l1From = await cdp.toClient(...middleOf(l1));
  await drag(Math.round(l1From.x), Math.round(l1From.y), Math.round(l1From.x) + 20, Math.round(l1From.y));
  const l1Moved = await platePositions();
  await openFromList(HAND);
  const away = await platePositions();
  await openFromList(SEG);
  await enterEdit();
  await until(`import('./renderer/components/viewer.js').then((m) => m.drawnPlates().length === ${LEVEL_PLATES.length})`, 10000);
  const again = await drawnPlates();
  const unsavedBack = await ev('window.__lv.unsaved()');
  check('19. opening another study resets platePositions to {} (FRESH_VIEW); back on SP-9300, L3 restored from the stash, every plate is where it was first drawn',
    Array.isArray(l1Moved?.L1) && js(away) === '{}' && js(await platePositions()) === '{}' && (await badge('L3')) === 'Manual' && unsavedBack === unsavedBefore
      && again.length === first.length && again.every((plate) => { const was = plateOf(first, plate.code); return Boolean(was) && near(plate.x, was.x, 1e-6) && near(plate.y, was.y, 1e-6); }),
    { l1Moved, away, unsavedBack, again });
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
    // (Annotation editor round 2, spec §4.3) A film whose run failed: the first hand-placed commit clears the failure.
    const hand = { ...newStudy({ id: ${js(HAND)}, fileName: ${js(HAND_FILE)}, filePath: ${js(HAND_PATH)} }), labelFile: null,
      processingError: ${js(HAND_FAILURE)}, processingErrorAt: ${js(HAND_FAILED_AT)} };
    const ours = new Set([${js(SEG)}, ${js(HAND)}, ${js(REAL)}, ${js(OTHER)}, ${js(REVIEW)}]);
    store.setState((s) => ({ ack: true, studies: [seg, hand, ...s.studies.filter((x) => !ours.has(x.id))], screen: 'studies',
      studiesTab: 'find', query: '', openId: null, editing: false, levelEditor: null, selection: null, measurementDrafts: {},
      running: null, batch: null, tab: 'meas', overlays: true }));
    store.setState({ screen: 'analysis', openId: ${js(SEG)}, selectedLevel: null, zoom: 1, panX: 0, panY: 0, panMode: false });
    return { regionFromMeasure: result.geometry?.region ?? null, ll: result.measurements?.LL ?? null };
  })()`);
  await installHelpers();
  const restored = await until(`document.querySelector('.viewer-canvas-dynamic')?.width === 600 && document.querySelector('.run-card')?.classList.contains('is-hidden')`, 15000);
  check('precondition: the fixture SP-9300 opens on its restored 600x800 film', restored, injected);

  // 17 (ruling R37; the review of G3/G4, finding 4) on a film never windowed: SP-9300 before any window was asked for.
  // A right press released where it began decodes nothing and starts no window drag; nor does a right-first chord,
  // whose left button joins before the pointer moves (the chord suite's press order), though it pans. Before R37 the
  // press alone decoded the original (here: an unavailable window, its source being gone).
  {
    const seg = await cdp.rect('.viewer-canvas-dynamic');
    const x = Math.round(seg.cx);
    const y = Math.round(seg.cy);
    await clearToasts();
    await cdp.mouse('mouseMoved', x, y);
    await cdp.mouse('mousePressed', x, y, { button: 'right', buttons: 2, clickCount: 1 });
    await cdp.settle(80);
    const pressed = await windowState();
    const pressedClasses = await stageClasses();
    await cdp.mouse('mouseReleased', x, y, { button: 'right', buttons: 0, clickCount: 1 });
    await cdp.settle(150);
    const clicked = await windowState();
    const chipClicked = await chip();
    check('17. a right press without movement on a film never windowed leaves filmWindow null and the chip without W/L (R37)',
      pressed === null && clicked === null && chipClicked?.hidden === true && !pressedClasses.windowing && !pressedClasses.dragging
        && (await ev('window.__lv.toasts.length')) === 0,
      { pressed, clicked, chipClicked, pressedClasses, toasts: await ev('window.__lv.toasts') });

    await cdp.settle(450);
    const viewBefore = await viewNow();
    await cdp.mouse('mousePressed', x, y, { button: 'right', buttons: 2, clickCount: 1 });
    await cdp.settle(40);
    await cdp.mouse('mouseMoved', x, y, { button: 'left', buttons: 3 });           // the left button joins: a chord
    await cdp.settle(40);
    await cdp.mouse('mouseMoved', x + 30, y - 20, { button: 'left', buttons: 3 });
    await cdp.mouse('mouseMoved', x + 60, y - 40, { button: 'left', buttons: 3 });
    await cdp.settle(60);
    const during = await viewNow();
    await cdp.mouse('mouseMoved', x + 60, y - 40, { button: 'left', buttons: 2 });  // the left button lifts first
    await cdp.settle(40);
    await cdp.mouse('mouseReleased', x + 60, y - 40, { button: 'right', buttons: 0, clickCount: 1 });
    await cdp.settle(150);
    const chordWindow = await windowState();
    const chordChip = await chip();
    check('17. a right-first chord pan on that film pans and keeps it unwindowed: filmWindow null, the chip without W/L (R37)',
      Math.abs(during.panX - viewBefore.panX - 60) <= 1.5 && Math.abs(during.panY - viewBefore.panY + 40) <= 1.5
        && chordWindow === null && chordChip?.hidden === true && (await ev('window.__lv.toasts.length')) === 0,
      { viewBefore, during, chordWindow, chordChip });
    await ev(`import('./renderer/store.js').then((m) => { m.setState({ panX: 0, panY: 0 }); return true; })`);
    await cdp.settle(80);
  }

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
  // (2026-10-20) The chip row stays once the placement ends, now listing the selected level's points: L3's four, every
  // dot filled and none current (a finished placement focuses no handle), under EDITING SEGMENTATION; a chip click
  // focuses its handle (IP); L4's row, a level the model placed, lists its four points with SA, the row's first
  // handle, current, and the help line says a point can be picked; then L3's row again, so section 19 finds L3 selected.
  const placedChips = await ev(`(() => {
    const chips = [...document.querySelectorAll('.viewer-steps:not(.is-hidden) .viewer-step')];
    return { label: document.querySelector('.viewer-editbar-label')?.textContent, n: chips.length,
      text: chips.map((c) => c.textContent).join(' '), done: chips.every((c) => c.classList.contains('is-done')),
      current: chips.filter((c) => c.classList.contains('is-current')).length, buttons: chips.every((c) => c.tagName === 'BUTTON'),
      handle: window.__lv.editor()?.handle ?? null };
  })()`);
  check('3. L3 placed keeps four chips, SA SP IA IP, every dot filled and none current, under EDITING SEGMENTATION',
    placedChips.label === 'EDITING SEGMENTATION' && placedChips.n === 4 && placedChips.text === 'SA SP IA IP'
      && placedChips.done === true && placedChips.current === 0 && placedChips.buttons === true && placedChips.handle === null, placedChips);
  await clickSelector(CHIP_IP);
  const ipFocused = await chipState(CHIP_IP);
  const ipHandle = await ev('window.__lv.editor()?.handle ?? null');
  check("3. clicking L3's IP chip focuses that handle: the chip is done and current with aria-current true",
    ipFocused?.done === true && ipFocused.current === true && ipFocused.aria === 'true' && ipFocused.title === 'Select IP; the arrow keys nudge it'
      && ipHandle?.code === 'L3' && ipHandle?.handle === 'IP', { chip: ipFocused, handle: ipHandle });
  await clickSelector('[data-level-key="L4"]');
  const l4Chips = await ev(`(() => {
    const chips = [...document.querySelectorAll('.viewer-steps:not(.is-hidden) .viewer-step')];
    return { n: chips.length, current: chips.map((c) => c.classList.contains('is-current')).join(), handle: window.__lv.editor()?.handle ?? null,
      help: document.querySelector('.viewer-edit-help')?.textContent };
  })()`);
  check('3. selecting L4, a level the model placed, lists its four points with SA current and says so in the help line',
    l4Chips.n === 4 && l4Chips.current === 'true,false,false,false' && l4Chips.handle?.code === 'L4' && l4Chips.handle?.handle === 'SA'
      && l4Chips.help === `L4 selected ${DASH} drag a handle to adjust it, or pick a point and nudge it with the arrow keys.`, l4Chips);
  await clickSelector('[data-level-key="L3"]');
  const l3Again = await ev('window.__lv.editor()?.handle ?? null');
  check("3. L3's row again selects it with SA focused", l3Again?.code === 'L3' && l3Again?.handle === 'SA', l3Again);

  // 19 (gate feedback G7, D20). The level plates, here where L3 has just been placed; it leaves SP-9300 in edit mode
  // with the same one unsaved change, so section 5 goes on from where section 3 left it.
  await plateChecks();

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
  // (G5, D18) The points each level was given: L3 placed by hand lists every corner, S1 (not visible) and a
  // segmented level nothing; every entry, heads included, carries the list; the summary agrees with the entries.
  const pointsOf = (code) => segRecord?.levels?.[code]?.edited_points;
  check("6. (G5) edited_points: L3 (manual) ['sa','sp','ia','ip'], S1 (not_visible) [], L1 (segmented) []",
    js(pointsOf('L3')) === js(['sa', 'sp', 'ia', 'ip']) && js(pointsOf('S1')) === '[]'
      && segRecord?.levels?.L1?.state === 'segmented' && js(pointsOf('L1')) === '[]',
    { L3: pointsOf('L3'), S1: pointsOf('S1'), L1: [segRecord?.levels?.L1?.state, pointsOf('L1')] });
  check('6. (G5) every level and both heads carry edited_points, empty for each one not edited or manual',
    recordEntries(segRecord).length === 16 && recordEntries(segRecord).every((e) => Array.isArray(e.edited_points)
      && (['edited', 'manual'].includes(e.state) || e.edited_points.length === 0)),
    recordEntries(segRecord).map((e) => [e.state, e.edited_points]));
  const segEdits = editsFromEntries(segRecord);
  check('6. (G5) the edits summary agrees with the entries (one manual level, 4 points placed, none moved)',
    Boolean(segEdits) && js(segRecord?.edits) === js(segEdits) && segEdits.manual === 1 && segEdits.points_placed === 4
      && segEdits.edited === 0 && segEdits.points_moved === 0,
    { edits: segRecord?.edits, fromEntries: segEdits });
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

  // 20 (annotation editor round 2, spec §5). REVERT, on SP-9300 back in edit mode with nothing unsaved: an Edited level
  // returns to the model's output one level at a time. L4 moved 5 px right through the page's own commitHandleMove (a
  // handle drag's commit), then its REVERT; then Head 1 moved 4 px, its row stacking Place… over REVERT, then its
  // REVERT. (The dashed model ghost is canvas-drawn and is not asserted.)
  await enterEdit();
  const nothingBefore = await text('.lv-unsaved');
  const l4Moved = await ev(`(() => {
    const shift = (v) => (Array.isArray(v) ? (v.length === 2 && v.every((n) => typeof n === 'number') ? [v[0] + 5, v[1]] : v.map(shift))
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, inner]) => [k, shift(inner)])) : v);
    return shift(window.__lv.editor()?.levels?.L4?.geometry ?? null);
  })()`);
  await viaWiring(`m.commitHandleMove('L4', ${js(l4Moved)})`);
  await settled(SEG);
  check('20. L4 moved 5 px reads Edited, with REVERT on its row and 1 UNSAVED CHANGE',
    nothingBefore === 'NOTHING TO SAVE' && Boolean(l4Moved?.superior) && (await badge('L4')) === 'Edited'
      && (await present('[data-level-key="revert:L4"]')) && (await text('.lv-unsaved')) === '1 UNSAVED CHANGE',
    { nothingBefore, L4: await badge('L4'), revert: await present('[data-level-key="revert:L4"]'), unsaved: await text('.lv-unsaved') });
  await clickSelector('[data-level-key="revert:L4"]');
  await settled(SEG);
  const l4Focus = await ev(`document.activeElement?.getAttribute('data-level-key') ?? null`);
  check('20. REVERT on L4: Segmented, its REVERT gone with focus on the row\'s select button, and NOTHING TO SAVE',
    (await badge('L4')) === 'Segmented' && !(await present('[data-level-key="revert:L4"]')) && (await text('.lv-unsaved')) === 'NOTHING TO SAVE' && l4Focus === 'L4',
    { L4: await badge('L4'), revert: await present('[data-level-key="revert:L4"]'), unsaved: await text('.lv-unsaved'), l4Focus });
  const l4Reverted = await ev(`(() => { const e = window.__lv.editor(); return { source: e?.levels?.L4?.source ?? null, model: JSON.stringify(e?.model?.L4?.superior ?? null) }; })()`);
  const l4Stored = js((await studyOf(SEG))?.geometry?.vertebrae?.L4?.superior ?? null);
  check('20. the reverted L4 is the model\'s again: source model, and the study\'s L4 superior endplate is the model\'s',
    l4Reverted.source === 'model' && l4Reverted.model !== 'null' && l4Stored === l4Reverted.model,
    { ...l4Reverted, stored: l4Stored });

  const fh1 = await ev('window.__lv.editor()?.levels?.FH1?.geometry ?? null');
  if (fh1?.center) await viaWiring(`m.commitHandleMove('FH1', ${js({ center: [fh1.center[0] + 4, fh1.center[1]], radius: fh1.radius, rim: null })})`);
  await settled(SEG);
  const fh1Actions = await ev(`(() => { const a = document.querySelector('[data-level-row="FH1"] .lv-actions.is-stacked');
    return a ? [...a.querySelectorAll('[data-level-key]')].map((b) => b.getAttribute('data-level-key')) : null; })()`);
  check('20. Head 1 moved 4 px reads Edited, its row stacking Place… over REVERT (is-stacked)',
    Boolean(fh1?.center) && (await badge('FH1')) === 'Edited' && js(fh1Actions) === js(['place:FH1', 'revert:FH1']) && (await text('.lv-unsaved')) === '1 UNSAVED CHANGE',
    { FH1: await badge('FH1'), fh1Actions, unsaved: await text('.lv-unsaved') });
  await clickSelector('[data-level-key="revert:FH1"]');
  await settled(SEG);
  check('20. REVERT on Head 1: Segmented, its rim null, NOTHING TO SAVE',
    (await badge('FH1')) === 'Segmented' && (await ev('window.__lv.editor()?.levels?.FH1?.geometry?.rim')) === null && (await text('.lv-unsaved')) === 'NOTHING TO SAVE',
    { FH1: await badge('FH1'), geometry: await ev('window.__lv.editor()?.levels?.FH1?.geometry ?? null'), unsaved: await text('.lv-unsaved') });

  // 21 (round 2, spec §3). The comment, on SP-9300 straight after: typed into the panel's one textarea, its first
  // keystroke undone by Ctrl+Z, kept with its focus and caret across a rebuild, Escape in it ignored by the stage (P9),
  // saved into the record and onto the study, discarded back to the saved text, shown read-only outside edit mode, and
  // read back on Edit.
  const COMMENT_BOX = '.lv-comment-input';
  const boxValue = () => ev(`document.querySelector(${js(COMMENT_BOX)})?.value ?? null`);
  await clickSelector(COMMENT_BOX);
  // (The final review of round 2, I2) The first keystroke rebuilds the panel (the comment now differs from the saved
  // text). The foot that holds the box is never detached by a rebuild, so the textarea's own undo takes it back.
  await cdp.typeText('H');
  await cdp.settle(80);
  const typedOne = { value: await boxValue(), unsaved: await text('.lv-unsaved') };
  await cdp.key('z', { ctrl: true });
  await cdp.settle(120);
  const undone = { value: await boxValue(), unsaved: await text('.lv-unsaved') };
  check('21. Ctrl+Z after the first keystroke (H, 1 UNSAVED CHANGE) undoes it: the box is empty and the footer reads NOTHING TO SAVE (I2)',
    typedOne.value === 'H' && typedOne.unsaved === '1 UNSAVED CHANGE' && undone.value === '' && undone.unsaved === 'NOTHING TO SAVE', { typedOne, undone });
  // Whatever Ctrl+Z left, the box's text is selected and the comment typed over it.
  await ev(`(() => { const b = document.querySelector(${js(COMMENT_BOX)}); b.focus(); b.select(); return true; })()`);
  await cdp.typeText(COMMENT);
  await cdp.settle(80);
  check('21. typing in the comment box is one unsaved change and enables Save edits',
    (await boxValue()) === COMMENT && (await text('.lv-unsaved')) === '1 UNSAVED CHANGE' && (await ev(`document.querySelector('.lv-save')?.disabled`)) === false,
    { value: await boxValue(), unsaved: await text('.lv-unsaved'), saveDisabled: await ev(`document.querySelector('.lv-save')?.disabled`) });

  // A rebuild from the keyboard-free path (a group opened through the page): the same node, focus and caret kept.
  // (I2) The foot and its comment block are the same nodes after it; the list is a new one.
  await ev(`(() => { for (const s of ['.lv-foot', '.lv-comment', '.lv-list']) document.querySelector(s).__lvProbe = true; return true; })()`);
  await viaWiring(`m.toggleGroupOpen('thoracic')`);
  await cdp.settle(80);
  const keptBox = await ev(`(() => { const a = document.activeElement; return { box: Boolean(a?.classList.contains('lv-comment-input')), value: a?.value ?? null,
    start: a?.selectionStart ?? null, thoracicOpen: Boolean(document.querySelector('[data-group-key="thoracic"] .lv-rows')) }; })()`);
  check(`21. a rebuild while typing (a group opened through the page) keeps the focus in the box, its text and its caret at ${COMMENT.length}`,
    keptBox.box && keptBox.value === COMMENT && keptBox.start === COMMENT.length && keptBox.thoracicOpen, keptBox);
  const nodes = await ev(`(() => ({ foot: document.querySelector('.lv-foot')?.__lvProbe === true, comment: document.querySelector('.lv-comment')?.__lvProbe === true,
    newList: Boolean(document.querySelector('.lv-list')) && document.querySelector('.lv-list').__lvProbe !== true,
    order: [...document.querySelector('.lv-panel').children].map((n) => n.className),
    footChildren: [...document.querySelector('.lv-foot').children].map((n) => n.className) }))()`);
  check('21. the rebuild kept the foot and its comment block (the same nodes) and built a new list before them (I2)',
    nodes.foot === true && nodes.comment === true && nodes.newList && js(nodes.order) === js(['lv-head', 'lv-list', 'lv-foot'])
      && js(nodes.footChildren) === js(['lv-comment', 'lv-status', 'lv-actions-row']), nodes);
  await viaWiring(`m.toggleGroupOpen('thoracic')`);
  await cdp.settle(80);

  // P9: Escape typed in the box never reaches the stage: still editing, no prompt, the box still focused.
  await cdp.key('Escape');
  await cdp.settle(120);
  const escapedBox = await ev(`(async () => ({ editing: (await import('./renderer/store.js')).getState().editing, prompt: Boolean(document.querySelector('.lv-prompt')),
    box: Boolean(document.activeElement?.classList.contains('lv-comment-input')) }))()`);
  check('21. Escape in the comment box leaves edit mode alone: still editing, no prompt, the box still focused (P9)',
    escapedBox.editing === true && escapedBox.prompt === false && escapedBox.box === true, escapedBox);

  await clearToasts();
  await clickSelector('.lv-save');
  const commentSaved = await toastSeen('Saved 1 edit to the label record.');
  let commentRecord = null;
  try { commentRecord = readRecord(segRecordName); } catch (_error) { commentRecord = null; }
  check('21. Save edits toasts Saved 1 edit to the label record. and the record carries the comment',
    commentSaved && commentRecord?.comment === COMMENT, { toasts: await ev('window.__lv.toasts'), comment: commentRecord?.comment });
  check('21. the study carries the comment as labelComment, and the footer reads NOTHING TO SAVE',
    (await studyOf(SEG))?.labelComment === COMMENT && (await text('.lv-unsaved')) === 'NOTHING TO SAVE',
    { labelComment: (await studyOf(SEG))?.labelComment, unsaved: await text('.lv-unsaved') });

  await clickSelector(COMMENT_BOX);
  await ev(`(() => { const b = document.querySelector(${js(COMMENT_BOX)}); b.setSelectionRange(b.value.length, b.value.length); return true; })()`);
  await cdp.typeText(' more');
  await cdp.settle(80);
  check('21. typing more after the save is one unsaved change again',
    (await boxValue()) === `${COMMENT} more` && (await text('.lv-unsaved')) === '1 UNSAVED CHANGE', { value: await boxValue(), unsaved: await text('.lv-unsaved') });
  await clearToasts();
  await clickSelector('.lv-discard');
  const commentDiscarded = await toastSeen('Discarded 1 change.');
  await settled(SEG);
  check('21. Discard toasts Discarded 1 change. and the box reads the saved comment again',
    commentDiscarded && (await boxValue()) === COMMENT && (await text('.lv-unsaved')) === 'NOTHING TO SAVE',
    { toasts: await ev('window.__lv.toasts'), value: await boxValue(), unsaved: await text('.lv-unsaved') });

  // Out of edit mode by Escape, focus first on L1's select button (the controller's ruling: Discard is disabled with
  // nothing unsaved and cannot take focus): the Analysis panel shows the comment read-only.
  await ev(`(() => { document.querySelector('[data-level-key="L1"]')?.focus(); return true; })()`);
  await cdp.key('Escape');
  await until(`(async () => !(await import('./renderer/store.js')).getState().editing)()`, 5000);
  await until(`document.querySelector('.analysis-comment')?.classList.contains('is-hidden') === false`, 3000);
  const shown = await ev(`(() => { const b = document.querySelector('.analysis-comment');
    return b ? { hidden: b.classList.contains('is-hidden'), text: b.querySelector('.analysis-comment-text')?.textContent ?? null } : null; })()`);
  check('21. outside edit mode the Analysis panel shows the comment read-only (.analysis-comment)',
    (await editingNow()) === false && shown?.hidden === false && shown.text === COMMENT, { editing: await editingNow(), shown });

  // Back into edit mode, for section 8: the box reads the comment from the record, the read-only block hides.
  await enterEdit();
  await until(`document.querySelector('.analysis-comment')?.classList.contains('is-hidden') === true`, 3000);
  check('21. Edit again: the box reads the saved comment, the read-only block is hidden, NOTHING TO SAVE',
    (await boxValue()) === COMMENT && (await isHidden('.analysis-comment')) && (await text('.lv-unsaved')) === 'NOTHING TO SAVE',
    { value: await boxValue(), blockHidden: await isHidden('.analysis-comment'), unsaved: await text('.lv-unsaved') });

  // 8. Femoral: Place… on Head 1, two rim points, FIT; then a rim-point drag refits. Section 21 left SP-9300 in edit
  // mode, reopened from its saved record.
  if (!(await editingNow())) await enterEdit();
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

  // 17 (ruling R31; the review of G3/G4, finding 5): with the panel closed, a right drag over the same unavailable film
  // says why in a toast, once for the whole drag, and changes nothing.
  await clearToasts();
  const segFilm = await cdp.rect('.viewer-canvas-dynamic');
  await rightDragVia(segFilm.cx, segFilm.cy, [[segFilm.cx - 10, segFilm.cy - 5], [segFilm.cx - 20, segFilm.cy - 10], [segFilm.cx - 30, segFilm.cy - 15]]);
  const r31Seen = await toastSeen(R31_TOAST);
  await cdp.settle(200);
  const r31Count = await ev(`window.__lv.toasts.filter((t) => t === ${js(R31_TOAST)}).length`);
  const r31Window = await windowState();
  check(`17. a right drag on the unavailable film with the panel closed toasts ${R31_TOAST} once (R31)`,
    r31Seen && r31Count === 1 && r31Window?.status === 'unavailable' && r31Window.open === false && (await isHidden('.viewer-wl')),
    { toasts: await ev('window.__lv.toasts'), window: r31Window && { status: r31Window.status, open: r31Window.open } });

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
  // (2026-10-19, header filters) The delete controls sit at the Find table's right end, past the window's edge at the
  // default size (the table scrolls sideways, and the REGION column made it 100 px wider), so each is scrolled into
  // view before its click, as smoke-studies.mjs's clickAt does.
  const reach = (selector) => ev(`document.querySelector(${js(selector)})?.scrollIntoView({ block: 'nearest', inline: 'nearest' })`);
  await reach(`${row(SEG)} .studies-delete`);
  await clickSelector(`${row(SEG)} .studies-delete`);
  await reach(`${row(SEG)} .studies-delete-confirm`);
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
  // (Annotation editor round 2, spec §4.3) The fixture's run failed, so the header pill reads Failed until a level is
  // placed by hand.
  await until(`document.querySelector(${js(STATUS_PILL)})?.textContent === 'Failed'`, 3000);
  check('12. the failed film\'s header pill reads Failed before Edit',
    (await text(STATUS_PILL)) === 'Failed' && unseg?.processingError === HAND_FAILURE,
    { pill: await text(STATUS_PILL), processingError: unseg?.processingError ?? null });
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
  // (Round 2, spec §4.3) The first commit of a level placed by hand clears the failure in the measure queue's own
  // write, and the pill derives Hand-placed.
  await until(`document.querySelector(${js(STATUS_PILL)})?.textContent === 'Hand-placed'`, 3000);
  check('12. the first hand-placed commit cleared the failure and the pill reads Hand-placed (spec §4.3)',
    handStudy?.processingError === null && handStudy?.processingErrorAt === null && (await text(STATUS_PILL)) === 'Hand-placed',
    handStudy && { processingError: handStudy.processingError, processingErrorAt: handStudy.processingErrorAt, pill: await text(STATUS_PILL) });
  // (The final review of round 2, I1) Discard takes L1 off again: the film has no level placed and no result left, so
  // nothing goes to /measure and the failure it carried at Edit comes back: the pill reads Failed again. L1 is then
  // placed again by the same four clicks, so the rest of the section runs as it did.
  await clickSelector('.lv-discard');
  await settled(HAND);
  await until(`document.querySelector(${js(STATUS_PILL)})?.textContent === 'Failed'`, 3000);
  const discardedHand = await studyOf(HAND);
  check('12. Discard after placing L1 by hand: the pill reads Failed again, the failure is back and the result gone (I1)',
    (await text(STATUS_PILL)) === 'Failed' && discardedHand?.processingError === HAND_FAILURE && discardedHand?.processingErrorAt === HAND_FAILED_AT
      && discardedHand?.measurements === null && discardedHand?.geometry === null && (await badge('L1')) !== 'Manual',
    discardedHand && { pill: await text(STATUS_PILL), processingError: discardedHand.processingError, processingErrorAt: discardedHand.processingErrorAt,
      measurements: discardedHand.measurements, geometry: discardedHand.geometry, L1: await badge('L1') });
  await clickSelector('[data-level-key="place:L1"]');
  for (const point of [[200, 150], [400, 160], [196, 232], [396, 242]]) await clickImage(...point);
  await settled(HAND);
  await until(`document.querySelector(${js(STATUS_PILL)})?.textContent === 'Hand-placed'`, 3000);
  const replacedHand = await studyOf(HAND);
  check('12. L1 placed again by hand: Manual, the pill reads Hand-placed and the failure is cleared again',
    (await badge('L1')) === 'Manual' && (await text(STATUS_PILL)) === 'Hand-placed' && replacedHand?.processingError === null
      && Boolean(replacedHand?.geometry?.vertebrae?.L1) && Boolean(replacedHand?.measurements),
    replacedHand && { L1: await badge('L1'), pill: await text(STATUS_PILL), processingError: replacedHand.processingError });
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

  // 12 (round 2, spec §4.1 and §4.4). The hand-placed film outside edit mode: with its failure cleared Mark reviewed is
  // enabled; marking it reads Reviewed, unmarking returns it to Hand-placed (its record exists, so the mark writes
  // nothing), and the Find list's row reads Hand-placed too.
  const reviewButton = () => ev(`(() => { const b = document.querySelector(${js(REVIEW_BUTTON)}); const n = document.querySelector('.analysis-review-note');
    return b ? { text: b.textContent.trim(), disabled: b.disabled, noteHidden: !n || n.hidden } : null; })()`);
  const handOffered = await reviewButton();
  check('12. on the hand-placed film Mark reviewed is enabled and its note hidden',
    handOffered?.text === 'Mark reviewed' && handOffered.disabled === false && handOffered.noteHidden === true, handOffered);
  await clickSelector(REVIEW_BUTTON);
  await until(`document.querySelector(${js(STATUS_PILL)})?.textContent === 'Reviewed'`, 3000);
  const handMarked = await reviewButton();
  check('12. Mark reviewed on the hand-placed film: the button reads Reviewed and so does the pill',
    handMarked?.text.startsWith('Reviewed') === true && (await text(STATUS_PILL)) === 'Reviewed' && typeof (await studyOf(HAND))?.reviewedAt === 'string',
    { button: handMarked, pill: await text(STATUS_PILL) });
  await clickSelector(REVIEW_BUTTON);
  await until(`document.querySelector(${js(STATUS_PILL)})?.textContent === 'Hand-placed'`, 3000);
  check('12. unmarking returns the pill to Hand-placed (spec §4.4)',
    (await text(STATUS_PILL)) === 'Hand-placed' && (await reviewButton())?.text === 'Mark reviewed' && (await studyOf(HAND))?.reviewedAt === null,
    { pill: await text(STATUS_PILL), button: await reviewButton() });
  await clickSelector(STUDIES_NAV);
  await until(`document.querySelector(${js(row(HAND))})`, 5000);
  check('12. the Find list\'s row reads Hand-placed', (await text(`${row(HAND)} .badge`)) === 'Hand-placed', await text(`${row(HAND)} .badge`));
  await openFromList(HAND);

  // 13. The main process refuses a label file name that is not a bare <stem>.label.json, through the real bridge.
  const refused = await ev(`Promise.allSettled([window.spineContour.saveLabelRecord('..', {}), window.spineContour.saveLabelRecord('a/b.label.json', {})])
    .then((outcomes) => outcomes.map((o) => (o.status === 'rejected' ? String(o.reason?.message ?? o.reason) : 'fulfilled')))`);
  check("13. saveLabelRecord('..') and saveLabelRecord('a/b.label.json') reject with Invalid label file name.",
    refused.length === 2 && refused.every((m) => m !== 'fulfilled' && m.endsWith('Invalid label file name.')), refused);
  const cleaned = await ev(`import('./renderer/api.js').then((api) => api.saveLabelRecord('..', {}).then(() => 'fulfilled', (e) => e.message))`);
  check('13. the api wrapper hands the rejection on as the display-ready Invalid label file name.', cleaned === 'Invalid label file name.', cleaned);

  // 18 (gate feedback G6, D19). Last: it opens a study of its own and leaves the rest of the run as it was.
  await reviewRecordChecks(films);
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
    const ours = new Set([${js(SEG)}, ${js(HAND)}, ${js(REAL)}, ${js(OTHER)}, ${js(REVIEW)}]);
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
  // (G5, D18) The level edited above by the SA handle drag and the nudge lists that corner alone: exactly the corners
  // whose value differs from the model's, which the suite reads from the record's own corners and model_corners.
  const editedEntry = code ? record?.levels?.[code] : null;
  const differing = editedEntry?.corners && editedEntry?.model_corners
    ? ['sa', 'sp', 'ia', 'ip'].filter((key) => editedEntry.corners[key].some((v, i) => Math.abs(v - editedEntry.model_corners[key][i]) > 1e-6)) : null;
  check(`film: (G5) the edited ${code} lists the moved corner only: edited_points ['sa']`,
    editedEntry?.state === 'edited' && js(editedEntry.edited_points) === js(['sa']) && js(differing) === js(['sa']),
    { state: editedEntry?.state, edited_points: editedEntry?.edited_points, differing });
  const filmEdits = editsFromEntries(record);
  const movedSum = recordEntries(record).filter((e) => e.state === 'edited').reduce((n, e) => n + (e.edited_points?.length ?? 0), 0);
  check('film: (G5) edits.points_moved is the sum of the edited levels\' lists, and the summary agrees with the entries',
    Boolean(filmEdits) && record?.edits?.points_moved === movedSum && movedSum >= 1 && js(record?.edits) === js(filmEdits),
    { edits: record?.edits, fromEntries: filmEdits, movedSum });

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
      const ids = [${js(SEG)}, ${js(HAND)}, ${js(REAL)}, ${js(OTHER)}, ${js(REVIEW)}];
      const s = store.getState();
      const names = s.studies.filter((x) => ids.includes(x.id) && x.labelFile).map((x) => x.labelFile);
      store.setState({ editing: false, levelEditor: null, filmWindow: null, platePositions: {}, selection: null, screen: 'studies', openId: null, measurementDrafts: {} });
      for (const id of ids) { wiring.forgetLevelEditor(id); try { await api.deletePrediction(id); } catch (_e) {} }
      for (const name of names) { try { await api.deleteLabelRecord(name); } catch (_e) {} }
      store.setState((st) => ({ studies: st.studies.filter((x) => !ids.includes(x.id)), paramSelected: (st.paramSelected ?? []).filter((id) => !ids.includes(id)) }));
      if (window.__lv?.unsub) window.__lv.unsub();
      delete window.__lv; delete window.__lvRun; delete window.__lvRunOutcome;
      return names;
    })()`);
    for (const name of ['levels-ui-check.label.json', 'levels-hand-placed.label.json', REVIEW_RECORD, ...(leftovers ?? [])]) {
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
