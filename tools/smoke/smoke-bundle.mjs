// The annotation bundle (spec docs/superpowers/specs/2026-10-15-annotation-bundle-export-import-design.md; plan
// docs/superpowers/plans/2026-10-15-annotation-bundle-export-import.md, Task 7) against the real, running app: a
// library exported from one profile, imported into a second, edited there, exported again and imported back into the
// first. Three phases, each on its own launch, on two scratch profiles under %TEMP%:
//
//   a  profile A, fresh. Two synthetic films on disk under %TEMP%\spine-contour-bundle-films\ (ruling S35): SP-9400, a
//      segmented fixture (the level editor suite's geometry measured by the real /measure, a sidecar whose image_png
//      is the film's own bytes) and SP-9401, unsegmented. SP-9400's label record is written through the level editor
//      (Edit, the comment `from A`, Save edits, exit) and the film is marked reviewed with the Analysis screen's own
//      Mark reviewed button. Export all into %TEMP%\spine-contour-bundle-out: the toast, the manifest, each study.json,
//      the sidecar and the record in SP-9400's folder, both films' bytes against their `film_sha256`. The bundle's path
//      goes to tools/smoke/out/bundle-path.txt for phase b.
//   b  profile B, fresh. Import A's bundle: the prompt and its focus, the confirm's toast, two rows whose films stay in
//      the bundle, the segmented one Reviewed with its comment, its sidecar under its new id matching it, its film
//      restored from that sidecar, the search finding it by its comment; the same bundle again is Nothing to import.
//      Then the comment `from B` through the level editor and Export all into %TEMP%\spine-contour-bundle-out-b; that
//      bundle's path goes to tools/smoke/out/bundle-path-b.txt for phase c.
//   c  profile A again (SMOKE_KEEP_PROFILE=1). Import B's bundle: one update (B's record is newer) and one skip (the
//      unsegmented film has no record on either side); SP-9400's comment and record read `from B` under its own label
//      file, SP-9401 is untouched.
//
// The run sequence, as tools/smoke/README.md ("Running the bundle suite") gives it, from Git Bash with
// SPINE_CONTOUR_PYTHON (and on this workstation TESSERACT_CMD) set and ELECTRON_RUN_AS_NODE unset:
//
//   SPINE_CONTOUR_USER_DATA=<%TEMP%>/spine-contour-bundle-a node tools/smoke/launch.mjs
//   SPINE_CONTOUR_USER_DATA=<%TEMP%>/spine-contour-bundle-a SMOKE_PHASE=a node tools/smoke/smoke-bundle.mjs > tools/smoke/out/smoke-bundle-a.txt 2>&1
//   node tools/smoke/cdp.mjs --quit
//   SPINE_CONTOUR_USER_DATA=<%TEMP%>/spine-contour-bundle-b node tools/smoke/launch.mjs
//   SPINE_CONTOUR_USER_DATA=<%TEMP%>/spine-contour-bundle-b SMOKE_PHASE=b node tools/smoke/smoke-bundle.mjs > tools/smoke/out/smoke-bundle-b.txt 2>&1
//   node tools/smoke/cdp.mjs --quit
//   SMOKE_KEEP_PROFILE=1 SPINE_CONTOUR_USER_DATA=<%TEMP%>/spine-contour-bundle-a node tools/smoke/launch.mjs
//   SPINE_CONTOUR_USER_DATA=<%TEMP%>/spine-contour-bundle-a SMOKE_PHASE=c node tools/smoke/smoke-bundle.mjs > tools/smoke/out/smoke-bundle-c.txt 2>&1
//   node tools/smoke/cdp.mjs --quit
//
// The native folder pickers are bypassed (plan PB7): the suite calls the screen's own exportBundleTo, importBundleFrom
// and confirmImport. No model runs and no real film is read: /measure and /decode need no graphs. Every check is a DOM,
// store or file read; no screenshot is taken. Every selector is a data-find-key, a data-study-id or a class. The
// profile is SMOKE_USER_DATA, else SPINE_CONTOUR_USER_DATA, else the phase's own folder above. Ids SP-9400-SP-9405 are
// this suite's (SP-9402-SP-9405 unused); B's imported studies take whatever nextId gives and are found by file name.
// Cleanup (ruling S34), in `finally` so a failing phase still runs its own: a leaves everything for b and c; b removes
// its profile's studies, sidecars and records but keeps its bundle for c; c removes profile A's studies, sidecars and
// records, the films folder, both bundle folders and both path files. Exit code 1 on any failed check.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const PHASE = process.env.SMOKE_PHASE || 'a';
const TMP = os.tmpdir();
const PROFILE_A = path.join(TMP, 'spine-contour-bundle-a');
const PROFILE_B = path.join(TMP, 'spine-contour-bundle-b');
const USER_DATA = process.env.SMOKE_USER_DATA || process.env.SPINE_CONTOUR_USER_DATA || (PHASE === 'b' ? PROFILE_B : PROFILE_A);
const LABELS = path.join(USER_DATA, 'labels');
const PREDICTIONS = path.join(USER_DATA, 'predictions');
const FILM_DIR = path.join(TMP, 'spine-contour-bundle-films');
const OUT_A = path.join(TMP, 'spine-contour-bundle-out');
const OUT_B = path.join(TMP, 'spine-contour-bundle-out-b');
const PATH_A = path.join(OUT, 'bundle-path.txt');
const PATH_B = path.join(OUT, 'bundle-path-b.txt');

const SEG = 'SP-9400';    // the segmented fixture, with a sidecar and (from phase a on) a label record
const UNSEG = 'SP-9401';  // the unsegmented film
const SEG_FILE = 'bundle-segmented.png';
const UNSEG_FILE = 'bundle-unsegmented.png';
const SEG_PATH = path.join(FILM_DIR, SEG_FILE);
const UNSEG_PATH = path.join(FILM_DIR, UNSEG_FILE);
const OUR_FILES = [SEG_FILE, UNSEG_FILE];
const SEG_RECORD = 'bundle-segmented.label.json';   // labelFileName of the stem, no clash
const PREDICTION_ID = 'smoke-bundle-fixture';
const BUNDLE_SCHEMA = 'spinecontour.bundle/1';
const FROM_A = 'from A';
const FROM_B = 'from B';
const SAVED_ONE = 'Saved 1 edit to the label record.';
const KEEP_FOLDER = 'The films stay in this folder, so keep it where it is.';
const REVIEW_BUTTON = '.analysis-review';

// The level editor suite's prototype geometry (corners [SA, SP, IA, IP]), measured by the real /measure.
const BODIES = {
  L1: [[289.5, 121.5], [396.9, 132.8], [283.1, 183.2], [390.5, 194.5]],
  L2: [[270.8, 211.1], [382.7, 217.0], [267.3, 277.0], [379.2, 282.9]],
  L4: [[252.3, 406.4], [369.4, 392.1], [260.6, 473.9], [377.7, 459.6]],
  L5: [[262.7, 508.2], [374.2, 476.2], [279.8, 567.8], [391.3, 535.8]],
};
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

// Polls a node-side predicate (a file the main process writes).
async function untilNode(fn, timeoutMs = 5000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { if (fn()) return true; } catch (_error) { /* not written yet: poll again */ }
    if (Date.now() >= deadline) return false;
    await cdp.settle(stepMs);
  }
}

const text = (selector) => ev(`document.querySelector(${js(selector)})?.textContent ?? null`);
const present = (selector) => ev(`Boolean(document.querySelector(${js(selector)}))`);
const focusedKey = () => ev(`document.activeElement?.getAttribute('data-find-key') ?? null`);
const row = (id) => `.studies-row[data-study-id="${id}"]`;
const PROMPT = '[data-find-key="import-prompt"]';
const PROMPT_TEXT = `${PROMPT} > span`;

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const readRecord = (name) => readJson(path.join(LABELS, name));
const isInside = (file, folder) => typeof file === 'string' && file.toLowerCase().startsWith(`${folder}${path.sep}`.toLowerCase());
const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// `Exported 2 studies to <parent>\spine-contour-export-YYYY-MM-DD-HHMM`, exactly: no film missing, no sidecar unread.
const exportedToast = (parent) => new RegExp(`^Exported 2 studies to ${escapeRe(parent + path.sep)}spine-contour-export-\\d{4}-\\d{2}-\\d{2}-\\d{4}$`);

// The page-side helpers: store reads and a toast log fed by a store subscription that only reads (subscribers never
// call setState), as smoke-levels.mjs's window.__lv.
async function installHelpers() {
  await ev(`(async () => {
    const store = await import('./renderer/store.js');
    const levels = await import('./renderer/data/levels.js');
    if (window.__bundle?.unsub) window.__bundle.unsub();
    const b = {
      // A study by its id, else by its file name (B's imported studies get their ids from nextId).
      study: (key) => store.getState().studies.find((s) => s.id === key) ?? store.getState().studies.find((s) => s.fileName === key) ?? null,
      editor: () => { const e = store.getState().levelEditor; return e ? { studyId: e.studyId, comment: e.comment, unsaved: levels.unsavedCount(e) } : null; },
      toasts: [],
    };
    let last = store.getState().toast;
    b.unsub = store.subscribe((s) => { if (s.toast && s.toast !== last) b.toasts.push(s.toast); last = s.toast; });
    window.__bundle = b;
    return true;
  })()`);
}

const studyOf = (key) => ev(`window.__bundle.study(${js(key)})`);
const toasts = () => ev('window.__bundle.toasts.slice()');
const clearToasts = () => ev('(() => { window.__bundle.toasts.length = 0; return true; })()');
const toastSeen = (exact, timeoutMs = 8000) => until(`window.__bundle.toasts.includes(${js(exact)})`, timeoutMs);
const realIds = () => ev(`import('./renderer/store.js').then((m) => m.getState().studies.filter((s) => s.source === 'real').map((s) => s.id))`);
const setStore = (patch) => ev(`import('./renderer/store.js').then((m) => { m.setState(${patch}); return true; })`);
// A call into the screen's own module (PB7) or the level editor's wiring, awaited.
const viaScreen = (call) => ev(`import('./renderer/screens/studies.js').then(async (m) => { await ${call}; return true; })`);
const viaWiring = (call) => ev(`import('./renderer/level-editor.js').then(async (m) => { await ${call}; return true; })`);

// The Find tab, with no search, no tick and the bar's Export button drawn.
async function findTab() {
  await setStore(`{ screen: 'studies', studiesTab: 'find', query: '', paramSelected: [] }`);
  return until(`Boolean(document.querySelector('[data-find-key="export-bundle"]'))`, 5000);
}

// Opens a study through its Find row's own handler and waits for its film restored from the sidecar: the level editor
// suite's precondition (the 600x800 dynamic canvas, the run card hidden), a record whose film is a model run's stored
// image (hasStoredImage), and the viewer's prediction snapshot, which with no run in this session only a sidecar
// restore records.
async function openFromRow(id) {
  await findTab();
  await until(`Boolean(document.querySelector(${js(row(id))}))`, 5000);
  await ev(`document.querySelector(${js(row(id))}).click()`);
  return until(`(async () => {
    const store = await import('./renderer/store.js');
    const viewer = await import('./renderer/components/viewer.js');
    const { hasStoredImage } = await import('./renderer/data/predictions.js');
    const s = store.getState();
    return s.screen === 'analysis' && s.openId === ${js(id)}
      && document.querySelector('.viewer-canvas-dynamic')?.width === 600
      && document.querySelector('.run-card')?.classList.contains('is-hidden') === true
      && hasStoredImage(s.studies.find((x) => x.id === ${js(id)})) && Boolean(viewer.getPrediction(${js(id)})?.geometry);
  })()`, 15000);
}

// Edit mode on the open study, the comment set, Save edits, out of edit mode: the record written through the real path.
async function saveComment(id, comment) {
  await viaWiring(`m.enterLevelEditor(${js(id)})`);
  const entered = await until(`window.__bundle.editor()?.studyId === ${js(id)}`, 10000);
  const before = await ev('window.__bundle.editor()');
  await viaWiring(`m.setLevelComment(${js(comment)})`);
  const typed = await ev('window.__bundle.editor()');
  await clearToasts();
  await viaWiring('m.saveLevelEdits()');
  const saved = await toastSeen(SAVED_ONE);
  await viaWiring('m.exitNow()');
  const left = await until(`(async () => { const s = (await import('./renderer/store.js')).getState(); return !s.editing && !s.levelEditor; })()`, 5000);
  return { entered, before, typed, saved, left, toasts: await toasts() };
}

// Export all from the Find tab into `parent`; the bundle's path read from the toast, or null.
async function exportAll(parent) {
  await findTab();
  await clearToasts();
  await viaScreen(`m.exportBundleTo(${js(parent)})`);
  await until('window.__bundle.toasts.length > 0', 30000);
  const seen = await toasts();
  const toast = seen.find((t) => exportedToast(parent).test(t)) ?? null;
  return { toast, seen, bundle: toast ? toast.slice('Exported 2 studies to '.length) : null };
}

// Import a bundle: the prompt or the toast it ends with. importBundleFrom resolves after its closing repaint, which
// draws the prompt (and focuses its Cancel) synchronously, so both are read at once.
async function importFrom(dir) {
  await findTab();
  await clearToasts();
  await viaScreen(`m.importBundleFrom(${js(dir)})`);
  return {
    prompt: await text(PROMPT_TEXT),
    focus: await focusedKey(),
    toasts: await toasts(),
  };
}

async function confirm() {
  await clearToasts();
  await viaScreen('m.confirmImport()');
  await until('window.__bundle.toasts.length > 0', 30000);
  return toasts();
}

const promptText = (dir, add, update, skip) => `Import from ${path.basename(dir)}: ${add} to add, ${update} to update, ${skip} to skip. ${KEEP_FOLDER}`;

// The bundle folder's manifest from disk, its rows in manifest order and by source id.
function readBundleFolder(bundle) {
  const manifest = readJson(path.join(bundle, 'manifest.json'));
  const rows = Array.isArray(manifest.studies) ? manifest.studies : [];
  const bySource = Object.fromEntries(rows.map((r) => [r.source_id, r]));
  return { manifest, rows, bySource };
}

// ---------------------------------------------------------------------------
// Phase a: profile A, fresh. Two films, a record through the level editor, Mark reviewed, Export all.

async function phaseA() {
  // Phase a owns the films folder and A's bundle parent: a rerun starts from neither.
  fs.rmSync(FILM_DIR, { recursive: true, force: true });
  fs.rmSync(OUT_A, { recursive: true, force: true });
  fs.mkdirSync(FILM_DIR, { recursive: true });
  fs.mkdirSync(OUT_A, { recursive: true });
  fs.rmSync(PATH_A, { force: true });

  const before = await realIds();
  check(`a. precondition: profile A (${USER_DATA}) is fresh, no real study in the library`, Array.isArray(before) && before.length === 0, before);

  // Two synthetic 600x800 films: SP-9400's grey one (the sidecar's image_png and the file on disk are the same bytes,
  // ruling S35) with an all-zero mask, and SP-9401's gradient.
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
    const unseg = canvas.toDataURL('image/png').split(',')[1];
    return { image, mask, unseg };
  })()`);
  fs.writeFileSync(SEG_PATH, Buffer.from(films.image, 'base64'));
  fs.writeFileSync(UNSEG_PATH, Buffer.from(films.unseg, 'base64'));

  await installHelpers();
  const injected = await ev(`(async () => {
    const store = await import('./renderer/store.js');
    const api = await import('./renderer/api.js');
    const { newStudy } = await import('./renderer/screens/studies.js');
    const quad = (c) => ({ superior: [c[0], c[1]], inferior: [c[2], c[3]], quadrilateral: [c[0], c[1], c[3], c[2]] });
    const vertebrae = Object.fromEntries(Object.entries(${js(BODIES)}).map(([code, c]) => [code, quad(c)]));
    const result = await api.measure({ vertebrae, s1_superior: ${js(S1)}, femoral_circles: ${js(CIRCLES)} });
    // A model result in every respect the app checks (a prediction id, a sidecar that matches). Its region is Lumbar,
    // as the level editor suite's fixture reads with no region at all: /measure's geometry names none, so an 'auto'
    // study (newStudy's default) would not match its own sidecar (predictionMatchesStudy compares the regions).
    await api.savePrediction(${js(SEG)}, { ...result, image_png: ${js(films.image)}, mask_png: ${js(films.mask)},
      labels: { L1: 20, L2: 21, L3: 22, L4: 23, L5: 24 }, prediction_id: ${js(PREDICTION_ID)} });
    const seg = { ...newStudy({ id: ${js(SEG)}, fileName: ${js(SEG_FILE)}, filePath: ${js(SEG_PATH)} }), labelFile: null,
      view: 'Standing lateral', region: 'lumbar', predictionId: ${js(PREDICTION_ID)}, measurements: result.measurements, geometry: result.geometry, qc: result.qc ?? null };
    const unseg = { ...newStudy({ id: ${js(UNSEG)}, fileName: ${js(UNSEG_FILE)}, filePath: ${js(UNSEG_PATH)} }), labelFile: null };
    const ours = new Set([${js(SEG)}, ${js(UNSEG)}]);
    store.setState((s) => ({ ack: true, studies: [seg, unseg, ...s.studies.filter((x) => !ours.has(x.id))], screen: 'studies',
      studiesTab: 'find', query: '', paramSelected: [], openId: null, editing: false, levelEditor: null, selection: null,
      measurementDrafts: {}, running: null, batch: null }));
    return { measured: Boolean(result.measurements && result.geometry) };
  })()`);

  check('a. precondition: SP-9400 opens on its film restored from its sidecar (600x800, the run card hidden)', await openFromRow(SEG), injected);

  // The record through the real path: a changed comment is an unsaved change, saved into the record.
  const saved = await saveComment(SEG, FROM_A);
  check(`a. Edit, the comment "${FROM_A}" (1 unsaved change), Save edits toasts "${SAVED_ONE}", and edit mode ends`,
    saved.entered && saved.before?.unsaved === 0 && saved.typed?.comment === FROM_A && saved.typed?.unsaved === 1 && saved.saved && saved.left, saved);
  const seg = await studyOf(SEG);
  check(`a. SP-9400 names ${SEG_RECORD} and shows the comment "${FROM_A}"`, seg?.labelFile === SEG_RECORD && seg?.labelComment === FROM_A,
    seg && { labelFile: seg.labelFile, labelComment: seg.labelComment });
  let recordA = null;
  try { recordA = readRecord(SEG_RECORD); } catch (error) { recordA = { error: error.message }; }
  check(`a. the record on disk (labels/${SEG_RECORD}) has comment "${FROM_A}"`, recordA?.comment === FROM_A, recordA && { comment: recordA.comment, error: recordA.error });

  // Mark reviewed, the Analysis screen's own button: the film already has a record, so the mark writes nothing.
  await clearToasts();
  const reviewReady = await until(`(() => { const b = document.querySelector(${js(REVIEW_BUTTON)}); return b && !b.disabled && b.getBoundingClientRect().width > 0; })()`, 10000);
  const button = await cdp.rect(REVIEW_BUTTON);
  if (reviewReady && button) await cdp.click(button.cx, button.cy);
  const reviewed = await until(`typeof window.__bundle.study(${js(SEG)})?.reviewedAt === 'string'`, 5000);
  await cdp.settle(300);   // a toast's absence cannot be polled for: the review write would have said something by now
  const marked = await ev(`(() => { const s = window.__bundle.study(${js(SEG)}); return { reviewedAt: s?.reviewedAt ?? null, labelFile: s?.labelFile ?? null, pressed: document.querySelector(${js(REVIEW_BUTTON)})?.getAttribute('aria-pressed') ?? null }; })()`);
  check('a. Mark reviewed (.analysis-review) stamps reviewedAt on SP-9400, its record unchanged and nothing toasted',
    reviewReady && reviewed && marked.pressed === 'true' && marked.labelFile === SEG_RECORD && (await toasts()).length === 0, { marked, toasts: await toasts() });

  // Export all into A's bundle parent.
  const exported = await exportAll(OUT_A);
  const bundle = exported.bundle;
  check(`a. Export all toasts "Exported 2 studies to ${OUT_A}${path.sep}spine-contour-export-<date>-<time>"`,
    Boolean(exported.toast) && exported.seen.length === 1 && fs.existsSync(bundle ?? ''), exported.seen);
  if (!bundle) return;

  let read = null;
  try { read = readBundleFolder(bundle); } catch (error) { read = { error: error.message }; }
  const sources = (read?.rows ?? []).map((r) => r.source_id).sort();
  check(`a. manifest.json has schema ${BUNDLE_SCHEMA} and two entries, SP-9400 and SP-9401`,
    read?.manifest?.schema === BUNDLE_SCHEMA && read.rows.length === 2 && js(sources) === js([SEG, UNSEG]), read?.error ?? { schema: read?.manifest?.schema, sources });

  for (const [id, fileName] of [[SEG, SEG_FILE], [UNSEG, UNSEG_FILE]]) {
    const entry = read?.bySource?.[id];
    let study = null;
    try { study = readJson(path.join(bundle, entry.dir, 'study.json')); } catch (error) { study = { error: error.message }; }
    check(`a. ${id}'s study.json has filePath null and fileName ${fileName}`,
      study?.id === id && study.filePath === null && study.fileName === fileName, study && { id: study.id, filePath: study.filePath, fileName: study.fileName, error: study.error });
    const film = entry ? path.join(bundle, entry.dir, 'film', fileName) : null;
    const source = id === SEG ? SEG_PATH : UNSEG_PATH;
    const filmHash = film && fs.existsSync(film) ? sha256(film) : null;
    check(`a. ${id}'s film/${fileName} hashes to its manifest film_sha256, the source film's own digest`,
      entry?.film === `film/${fileName}` && Boolean(filmHash) && filmHash === entry.film_sha256 && filmHash === sha256(source),
      { film: entry?.film, film_sha256: entry?.film_sha256, filmHash });
  }

  const segEntry = read?.bySource?.[SEG];
  let sidecar = null;
  let bundled = null;
  try { sidecar = readJson(path.join(bundle, segEntry.dir, 'prediction.json')); } catch (error) { sidecar = { error: error.message }; }
  try { bundled = readJson(path.join(bundle, segEntry.dir, SEG_RECORD)); } catch (error) { bundled = { error: error.message }; }
  check(`a. SP-9400's folder has prediction.json (its sidecar) and ${SEG_RECORD} with comment "${FROM_A}"; the manifest names both`,
    segEntry?.prediction === 'prediction.json' && sidecar?.prediction_id === PREDICTION_ID && segEntry?.label === SEG_RECORD && bundled?.comment === FROM_A,
    { prediction: segEntry?.prediction, label: segEntry?.label, sidecarId: sidecar?.prediction_id ?? sidecar?.error, comment: bundled?.comment ?? bundled?.error });
  const unsegEntry = read?.bySource?.[UNSEG];
  check("a. the manifest's prediction and label are null for SP-9401", unsegEntry?.prediction === null && unsegEntry?.label === null,
    unsegEntry && { prediction: unsegEntry.prediction, label: unsegEntry.label });

  // Phase c relaunches on this profile: the library must be on disk before the quit.
  const persisted = await untilNode(() => {
    const stored = readJson(path.join(USER_DATA, 'studies.json')).studies ?? [];
    const s = stored.find((x) => x.id === SEG);
    return s?.labelFile === SEG_RECORD && s.labelComment === FROM_A && typeof s.reviewedAt === 'string' && stored.some((x) => x.id === UNSEG);
  });
  check("a. profile A's studies.json holds SP-9400 (its record, comment and review mark) and SP-9401 for phase c", persisted, null);

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(PATH_A, bundle);
  check("a. the bundle's path is written to tools/smoke/out/bundle-path.txt for phase b",
    fs.readFileSync(PATH_A, 'utf8') === bundle, bundle);
}

// ---------------------------------------------------------------------------
// Phase b: profile B, fresh. Import A's bundle, check it, import it again, edit the comment, Export all.

async function phaseB() {
  // Phase b owns B's bundle parent: a rerun starts from none.
  fs.rmSync(OUT_B, { recursive: true, force: true });
  fs.mkdirSync(OUT_B, { recursive: true });
  fs.rmSync(PATH_B, { force: true });

  const before = await realIds();
  check(`b. precondition: profile B (${USER_DATA}) is fresh, no real study in the library`, Array.isArray(before) && before.length === 0, before);
  const bundle = fs.existsSync(PATH_A) ? fs.readFileSync(PATH_A, 'utf8').trim() : null;
  let read = null;
  try { read = readBundleFolder(bundle); } catch (error) { read = { error: error.message }; }
  check("b. precondition: phase a's bundle (out/bundle-path.txt) is on disk with its manifest", Boolean(bundle) && read?.rows?.length === 2, { bundle, error: read?.error });
  if (!bundle || !read?.rows) return;
  const names = read.rows.map((r) => r.file_name);   // manifest order

  await setStore(`{ ack: true, screen: 'studies', studiesTab: 'find', query: '', paramSelected: [], openId: null, editing: false, levelEditor: null }`);
  await installHelpers();

  const first = await importFrom(bundle);
  check(`b. importBundleFrom: the prompt reads "${promptText(bundle, 2, 0, 0)}"`, first.prompt === promptText(bundle, 2, 0, 0), first);
  check('b. the prompt has the focus on its Cancel ([data-find-key="import-cancel"])', first.focus === 'import-cancel', first.focus);

  const confirmed = await confirm();
  check('b. confirmImport toasts "Imported 2 studies, updated 0, skipped 0"', js(confirmed) === js(['Imported 2 studies, updated 0, skipped 0']), confirmed);

  await until(`${js(OUR_FILES)}.every((name) => { const s = window.__bundle.study(name); return s && document.querySelector('.studies-row[data-study-id="' + s.id + '"]'); })`, 5000);
  const seg = await studyOf(SEG_FILE);
  const unseg = await studyOf(UNSEG_FILE);
  const rows = await ev(`[...document.querySelectorAll('.studies-row[data-study-id]')].map((r) => r.dataset.studyId)`);
  const real = await realIds();
  check('b. two real studies, one per film, each with its own .studies-row, its film in the bundle (filePath inside it, on disk)',
    real.length === 2 && Boolean(seg && unseg) && seg.id !== unseg.id && rows.includes(seg.id) && rows.includes(unseg.id)
      && [seg, unseg].every((s) => isInside(s.filePath, bundle) && fs.existsSync(s.filePath)),
    { real, rows, seg: seg && { id: seg.id, filePath: seg.filePath }, unseg: unseg && { id: unseg.id, filePath: unseg.filePath } });
  if (!seg || !unseg) return;
  const badge = await text(`${row(seg.id)} .badge`);
  check(`b. the segmented film's row reads Reviewed and its labelComment is "${FROM_A}"`, badge === 'Reviewed' && seg.labelComment === FROM_A,
    { badge, labelComment: seg.labelComment, reviewedAt: seg.reviewedAt });

  const sidecarFile = path.join(PREDICTIONS, `${seg.id}.json`);
  const matches = await ev(`(async () => {
    const api = await import('./renderer/api.js');
    const { predictionMatchesStudy } = await import('./renderer/data/predictions.js');
    const sidecar = await api.loadPrediction(${js(seg.id)});
    return { matches: predictionMatchesStudy(window.__bundle.study(${js(seg.id)}), sidecar), predictionId: sidecar?.prediction_id ?? null };
  })()`);
  check(`b. its sidecar is at predictions/${seg.id}.json in profile B and predictionMatchesStudy holds for it`,
    fs.existsSync(sidecarFile) && matches.matches === true && matches.predictionId === PREDICTION_ID, { sidecarFile, exists: fs.existsSync(sidecarFile), ...matches });

  check('b. opened, it shows its film restored from that sidecar (600x800, the run card hidden, the prediction snapshot)', await openFromRow(seg.id), null);

  await findTab();
  await setStore(`{ query: ${js(FROM_A)} }`);
  const searched = await until(`(() => { const ids = [...document.querySelectorAll('.studies-row[data-study-id]')].map((r) => r.dataset.studyId); return ids.length === 1 && ids[0] === ${js(seg.id)}; })()`, 5000);
  check(`b. the search "${FROM_A}" leaves exactly the segmented film's row`, searched,
    await ev(`[...document.querySelectorAll('.studies-row[data-study-id]')].map((r) => r.dataset.studyId)`));
  await setStore(`{ query: '' }`);

  const again = await importFrom(bundle);
  const nothing = `Nothing to import: already in the library: ${names.join(', ')}`;
  check(`b. importBundleFrom again toasts "${nothing}" and shows no prompt`,
    js(again.toasts) === js([nothing]) && again.prompt === null && !(await present(PROMPT)), again);

  // B's own edit: the comment `from B` through the level editor, on the imported record.
  check(`b. precondition: the segmented film opens again on its restored film`, await openFromRow(seg.id), null);
  const saved = await saveComment(seg.id, FROM_B);
  check(`b. Edit reads the imported record's comment "${FROM_A}"; "${FROM_B}" typed, Save edits toasts "${SAVED_ONE}", edit mode ends`,
    saved.entered && saved.before?.comment === FROM_A && saved.before?.unsaved === 0 && saved.typed?.comment === FROM_B && saved.typed?.unsaved === 1
      && saved.saved && saved.left, saved);
  const edited = await studyOf(seg.id);
  let recordB = null;
  try { recordB = readRecord(edited.labelFile); } catch (error) { recordB = { error: error.message }; }
  check(`b. the study shows "${FROM_B}" and its record in profile B (labels/${edited?.labelFile}) has comment "${FROM_B}"`,
    edited?.labelComment === FROM_B && recordB?.comment === FROM_B, { labelFile: edited?.labelFile, labelComment: edited?.labelComment, comment: recordB?.comment ?? recordB?.error });

  const exported = await exportAll(OUT_B);
  check(`b. Export all toasts "Exported 2 studies to ${OUT_B}${path.sep}spine-contour-export-<date>-<time>"`,
    Boolean(exported.toast) && exported.seen.length === 1 && fs.existsSync(exported.bundle ?? ''), exported.seen);
  if (!exported.bundle) return;
  let readB = null;
  let bundledB = null;
  try {
    readB = readBundleFolder(exported.bundle);
    const entry = readB.rows.find((r) => r.file_name === SEG_FILE);
    bundledB = readJson(path.join(exported.bundle, entry.dir, entry.label));
  } catch (error) { bundledB = { error: error.message }; }
  check(`b. B's bundle holds both films and the segmented film's record with comment "${FROM_B}"`,
    readB?.rows?.length === 2 && readB.rows.every((r) => typeof r.film_sha256 === 'string') && bundledB?.comment === FROM_B,
    { rows: readB?.rows?.map((r) => ({ file_name: r.file_name, film_sha256: r.film_sha256, label: r.label })), comment: bundledB?.comment ?? bundledB?.error });

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(PATH_B, exported.bundle);
  check('b. the bundle\'s path is written to tools/smoke/out/bundle-path-b.txt for phase c', fs.readFileSync(PATH_B, 'utf8') === exported.bundle, exported.bundle);
}

// ---------------------------------------------------------------------------
// Phase c: profile A again, kept. Import B's bundle: one update, one skip.

async function phaseC() {
  await setStore(`{ ack: true, screen: 'studies', studiesTab: 'find', query: '', paramSelected: [], openId: null, editing: false, levelEditor: null }`);
  await installHelpers();
  const start = await studyOf(SEG);
  const unsegStart = await studyOf(UNSEG);
  check(`c. precondition: profile A (${USER_DATA}) reloads SP-9400 (${SEG_RECORD}, "${FROM_A}", reviewed) and SP-9401 from phase a`,
    start?.labelFile === SEG_RECORD && start.labelComment === FROM_A && typeof start.reviewedAt === 'string' && unsegStart?.labelFile === null,
    { seg: start && { labelFile: start.labelFile, labelComment: start.labelComment, reviewedAt: start.reviewedAt }, unseg: unsegStart && { labelFile: unsegStart.labelFile } });
  const bundle = fs.existsSync(PATH_B) ? fs.readFileSync(PATH_B, 'utf8').trim() : null;
  check("c. precondition: phase b's bundle (out/bundle-path-b.txt) is on disk with its manifest",
    Boolean(bundle) && fs.existsSync(path.join(bundle, 'manifest.json')), bundle);
  if (!bundle || !start) return;

  const offered = await importFrom(bundle);
  check(`c. importBundleFrom B's bundle: the prompt reads "${promptText(bundle, 0, 1, 1)}"`, offered.prompt === promptText(bundle, 0, 1, 1), offered);
  check('c. the prompt has the focus on its Cancel ([data-find-key="import-cancel"])', offered.focus === 'import-cancel', offered.focus);

  // SP-9401's record as it stands, to tell "untouched" by reference: applyImport keeps a study the plan leaves alone.
  await ev(`(() => { window.__bundle.unsegBefore = window.__bundle.study(${js(UNSEG)}); return true; })()`);
  const confirmed = await confirm();
  const expected = `Imported 0 studies, updated 1, skipped 1 (already in the library: ${UNSEG_FILE})`;
  check(`c. confirmImport toasts "${expected}"`, js(confirmed) === js([expected]), confirmed);

  const seg = await studyOf(SEG);
  let record = null;
  try { record = readRecord(SEG_RECORD); } catch (error) { record = { error: error.message }; }
  check(`c. SP-9400 shows "${FROM_B}" under its own label file ${SEG_RECORD}, and that record on disk has comment "${FROM_B}"`,
    seg?.labelComment === FROM_B && seg.labelFile === start.labelFile && seg.labelFile === SEG_RECORD && record?.comment === FROM_B,
    { labelComment: seg?.labelComment, labelFile: seg?.labelFile, comment: record?.comment ?? record?.error });
  const sidecar = await ev(`(async () => {
    const api = await import('./renderer/api.js');
    const { predictionMatchesStudy } = await import('./renderer/data/predictions.js');
    return predictionMatchesStudy(window.__bundle.study(${js(SEG)}), await api.loadPrediction(${js(SEG)}));
  })()`);
  check('c. SP-9400 stays reviewed and the sidecar under its id still matches it (predictionMatchesStudy)', typeof seg?.reviewedAt === 'string' && sidecar === true, { reviewedAt: seg?.reviewedAt, sidecar });
  const untouched = await ev(`(() => { const s = window.__bundle.study(${js(UNSEG)}); return { same: s === window.__bundle.unsegBefore, labelFile: s ? s.labelFile : 'missing' }; })()`);
  const real = await realIds();
  check('c. SP-9401 is untouched (the same record, labelFile null) and the library still holds exactly the two films',
    untouched.same === true && untouched.labelFile === null && js([...real].sort()) === js([SEG, UNSEG]), { untouched, real });
}

// ---------------------------------------------------------------------------
// Cleanup (ruling S34). Every phase resets the store keys it touched and drops its helper.

const RESET = `{ editing: false, levelEditor: null, selection: null, screen: 'studies', studiesTab: 'find', openId: null, query: '', paramSelected: [] }`;

// Removes, in the running app, the real studies whose film is one of ours: their stashed editor, their sidecar, their
// label record and the record itself. Returns what it removed.
async function removeOurStudies() {
  return ev(`(async () => {
    const store = await import('./renderer/store.js');
    const api = await import('./renderer/api.js');
    const wiring = await import('./renderer/level-editor.js');
    const names = ${js(OUR_FILES)};
    const ours = store.getState().studies.filter((s) => s.source === 'real' && names.includes(s.fileName));
    const ids = ours.map((s) => s.id);
    const labels = ours.map((s) => s.labelFile).filter((name) => typeof name === 'string' && name !== '');
    store.setState(${RESET});
    for (const id of ids) { wiring.forgetLevelEditor(id); try { await api.deletePrediction(id); } catch (_e) {} }
    for (const name of labels) { try { await api.deleteLabelRecord(name); } catch (_e) {} }
    store.setState((st) => ({ studies: st.studies.filter((x) => !ids.includes(x.id)) }));
    return { ids, labels };
  })()`);
}

const dropHelpers = () => ev('(() => { if (window.__bundle?.unsub) window.__bundle.unsub(); delete window.__bundle; return true; })()');

async function cleanup() {
  if (PHASE === 'a') {
    // Everything stays for phases b and c: the studies, the sidecar, the record, the films and the bundle.
    await ev(`import('./renderer/level-editor.js').then((m) => { m.forgetLevelEditor(${js(SEG)}); return true; })`);
    await setStore(RESET);
  } else if (PHASE === 'b') {
    // B's studies, sidecars and records go; B's bundle and its path file stay for phase c.
    const removed = await removeOurStudies();
    for (const id of removed?.ids ?? []) fs.rmSync(path.join(PREDICTIONS, `${id}.json`), { force: true });
    for (const name of removed?.labels ?? []) fs.rmSync(path.join(LABELS, name), { force: true });
  } else if (PHASE === 'c') {
    // A's studies, sidecars and records, the films, both bundles and both path files.
    const removed = await removeOurStudies();
    for (const id of [SEG, UNSEG, ...(removed?.ids ?? [])]) fs.rmSync(path.join(PREDICTIONS, `${id}.json`), { force: true });
    for (const name of [SEG_RECORD, ...(removed?.labels ?? [])]) fs.rmSync(path.join(LABELS, name), { force: true });
    for (const folder of [FILM_DIR, OUT_A, OUT_B]) fs.rmSync(folder, { recursive: true, force: true });
    for (const file of [PATH_A, PATH_B]) fs.rmSync(file, { force: true });
  }
  await dropHelpers();
}

// ---------------------------------------------------------------------------

let crashed = null;
try {
  if (!['a', 'b', 'c'].includes(PHASE)) throw new Error(`SMOKE_PHASE must be a, b or c, not ${PHASE}`);
  await until(`document.querySelector('#app')?.childElementCount > 0`, 30000);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.bringToFront');
  if (PHASE === 'a') await phaseA();
  else if (PHASE === 'b') await phaseB();
  else await phaseC();
} catch (error) {
  crashed = error;
  check('the suite ran to the end without throwing', false, String(error?.stack ?? error));
} finally {
  try {
    await cleanup();
  } catch (error) {
    check(`phase ${PHASE}'s cleanup ran`, false, String(error?.stack ?? error));
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
  check('no console errors or exceptions during the run', cdp.errors.length === 0, cdp.errors);
  cdp.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed (phase ${PHASE})`);
process.exit(failed || crashed ? 1 : 0);
