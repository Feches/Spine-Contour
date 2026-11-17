// A scale probe for the study flags (spec docs/superpowers/specs/2026-11-16-study-flags-design.md: slowness at several hundred
// films would make the feature a failure). Against the real, running app on a FRESH scratch profile (launch.mjs):
//
//   node tools/smoke/launch.mjs
//   node tools/smoke/smoke-flags-scale.mjs          # SPINE_CONTOUR_USER_DATA the launcher's folder, as smoke-persist.mjs
//   node tools/smoke/cdp.mjs --quit
//
// It injects invented, unsegmented real studies (first 100, then, after removing those, 400), 75% of them with a label record
// under <userData>/labels/ (75 and 300 files, a `labelFile` on the study) and the rest without; flags are drawn from ten in use
// (a few films have none), and one more flag, `unrecorded only`, is held only by films with no record, so a bulk add of it over
// the ticked films adds a flag none of them holds. It then measures, in milliseconds, each as the MEDIAN of repeated samples:
// the time from the trusted input event's arrival in the page (a capture listener, performance.now()) to the second animation
// frame after it (so the repaint and its layout and paint are inside the figure). Every number is printed whether or not it
// passes. Phase 100 reports a, b and the bulk sync of 75 records; phase 400 reports everything and asserts the ceilings:
//   b <= 3 x a and < 150 ms; c (open the FLAGS menu, tick one flag) < 300 ms; d (open the Flag list with 300 ticked, one
//   keystroke in its box) < 300 ms; the store part of the bulk add < 500 ms; the 300-record sync < 60 s.
// a one keystroke in the search box; b one keystroke in an open FLAGS cell's box (middle row); c the FLAGS header menu: open, tick,
// untick; d the bar's Flag list over the ticked films: open, one keystroke; e one store notification that changes nothing the
// list shows (setState of a key nothing reads). Then one bulk add and one bulk remove with 300 rows ticked: the time until the
// store shows the change on every ticked film, the time until every record file on disk shows it (Node polls the files; the
// page's Date.now() stamps the click), the responsiveness of the search box while the sync runs, and whether flagsBusy and
// deletingStudies stayed null throughout (a bulk change is not a lock). Afterwards every record carries the flag with its
// saved_at byte-identical, and no record file exists for the films that had none.
// Not observable here: the main process's own time inside saveLabelRecord (only the end to end sync is timed), and frame times
// below the display's refresh interval (a figure is at least one or two frames, ~16-33 ms at 60 Hz).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connect } from './cdp-lib.mjs';

const USER_DATA = process.env.SMOKE_USER_DATA || process.env.SPINE_CONTOUR_USER_DATA || path.join(os.tmpdir(), 'spine-contour-smoke');
const LABELS = path.join(USER_DATA, 'labels');
const PREFIX = 'scale-';
const FIRST = 8000;
const POOL = ['hardware', 'cement', 'olif', 'revision', 'pseudarthrosis', 'adjacent level', 'complication', 'good outcome', 'review later', 'outlier'];
const UNREC = 'unrecorded only';
const WORDS = ['lumbar', 'fusion', 'oblique', 'revision', 'standing', 'preop', 'postop', 'flexion', 'extension', 'followup'];

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: Boolean(ok) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${JSON.stringify(detail)}`}`); };
const numbers = [];
const report = (label, value, unit = 'ms') => { numbers.push([label, value]); console.log(`NUM   ${label}: ${typeof value === 'number' ? value.toFixed(1) : value} ${unit}`); };
const median = (list) => { const s = list.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length === 0 ? NaN : (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2); };
const js = (v) => JSON.stringify(v);

const cdp = await connect();
const ev = (source) => cdp.evaluate(source);
const FILTERS = '{ subject: "", region: [], view: [], workspace: [], folder: [], status: [], flags: [], flagsMatch: "any" }';
const resetView = () => cdp.setState(`{ ack: true, screen: "studies", studiesTab: "find", openId: null, query: "", findFilters: ${FILTERS}, paramSelected: [], findSort: { key: "date", dir: "desc" } }`);
const delay = (ms) => cdp.settle(ms);

// Page side: arm a one-shot capture listener for `type`; at the event, note the time, and stop it at the second frame after.
await ev(`(() => {
  window.__sc = { done: false, ms: null };
  window.__scArm = (type) => {
    window.__sc.done = false; window.__sc.ms = null;
    const h = () => { window.removeEventListener(type, h, true); const t0 = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => { window.__sc.ms = performance.now() - t0; window.__sc.done = true; })); };
    window.addEventListener(type, h, true);
  };
  return true;
})()`);

// Runs `action` (a trusted input) with the timer armed on `type`; the page's figure, or NaN when the event never arrived.
async function timed(type, action) {
  await ev(`window.__scArm(${js(type)})`);
  await action();
  const end = Date.now() + 4000;
  while (Date.now() < end) {
    if (await ev('window.__sc.done')) return ev('window.__sc.ms');
    await delay(5);
  }
  await ev(`window.dispatchEvent(new Event(${js(type)}))`).catch(() => {});   // disarm a listener that never fired
  return NaN;
}
const clickAt = async (selector, block = 'nearest') => {
  await ev(`(() => { const e = document.querySelector(${js(selector)}); if (e) e.scrollIntoView({ block: ${js(block)}, inline: 'nearest' }); })()`);
  await delay(40);
  const r = await cdp.rect(selector);
  if (r) await cdp.click(r.cx, r.cy);
  return Boolean(r);
};
const centreOf = async (selector, block = 'nearest') => {
  await ev(`(() => { const e = document.querySelector(${js(selector)}); if (e) e.scrollIntoView({ block: ${js(block)}, inline: 'nearest' }); })()`);
  await delay(40);
  return cdp.rect(selector);
};
const timedClick = async (selector, block = 'nearest') => {
  const r = await centreOf(selector, block);
  if (!r) return NaN;
  return timed('click', () => cdp.click(r.cx, r.cy));
};
const rowCount = () => ev(`document.querySelectorAll('.studies-row').length`);
const storeStudies = () => ev(`import('./renderer/store.js').then((m) => m.getState().studies.filter((s) => /^SP-8\\d{3}$/.test(s.id)).map((s) => ({ id: s.id, flags: s.flags, labelFile: s.labelFile })))`);

// ---- seeding ---------------------------------------------------------------------------------------------------------------
function plan(total) {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const recorded = Math.round(total * 0.75);
  const films = [];
  for (let i = 0; i < total; i += 1) {
    const hasRecord = i < recorded;
    const flags = [];
    if (rnd() > 0.15) {
      const n = 1 + Math.floor(rnd() * 3);
      while (flags.length < n) { const f = POOL[Math.floor(rnd() * POOL.length)]; if (!flags.includes(f)) flags.push(f); }
    }
    if (!hasRecord && i % 2 === 0) flags.push(UNREC);
    films.push({ id: `SP-${FIRST + i}`, fileName: `film-${i}-${WORDS[i % WORDS.length]}.png`, subjectId: `S${String(i % 70).padStart(3, '0')}`, flags, hasRecord, label: `${PREFIX}${FIRST + i}.label.json`, savedAt: `2026-02-${String(1 + (i % 27)).padStart(2, '0')}T0${i % 10}:00:00.${String(i).padStart(3, '0')}Z`, day: i % 28 });
  }
  // Mixed order, so the recorded films are not one block of the list.
  films.sort((a, b) => ((a.id.charCodeAt(7) * 7) % 5) - ((b.id.charCodeAt(7) * 7) % 5) || (a.id < b.id ? -1 : 1));
  return films;
}

async function seed(films) {
  await ev(`(async () => {
    const store = await import('./renderer/store.js');
    const { newStudy } = await import('./renderer/screens/studies.js');
    const films = ${js(films)};
    const studies = films.map((f) => ({ ...newStudy({ id: f.id, fileName: f.fileName, filePath: null }), region: 'lumbar', subjectId: f.subjectId, flags: f.flags,
      labelFile: f.hasRecord ? f.label : null, addedAt: new Date(Date.UTC(2026, 0, 1 + f.day, 8, 0, 0)).toISOString() }));
    for (const f of films) if (f.hasRecord) await window.spineContour.saveLabelRecord(f.label, { version: 1, saved_at: f.savedAt, app_version: '0.0.0-scale', comment: '', flags: f.flags, levels: {} });
    store.setState((s) => ({ studies: [...studies, ...s.studies.filter((x) => !/^SP-8\\d{3}$/.test(x.id))] }));
    return studies.length;
  })()`);
  await delay(600);
}

async function wipe() {
  await ev(`(async () => {
    const store = await import('./renderer/store.js');
    const api = await import('./renderer/api.js');
    const mine = store.getState().studies.filter((x) => /^SP-8\\d{3}$/.test(x.id));
    store.setState({ paramSelected: [], query: '', screen: 'studies' });
    for (const s of mine) if (s.labelFile) { try { await api.deleteLabelRecord(s.labelFile); } catch (_e) {} }
    store.setState((st) => ({ studies: st.studies.filter((x) => !/^SP-8\\d{3}$/.test(x.id)) }));
    return true;
  })()`);
  for (const f of fs.existsSync(LABELS) ? fs.readdirSync(LABELS) : []) if (f.startsWith(PREFIX)) fs.rmSync(path.join(LABELS, f), { force: true });
  await delay(400);
}

// ---- measurements ----------------------------------------------------------------------------------------------------------
async function measureSearch(reps) {
  await resetView();
  await delay(300);
  await clickAt('.studies-search');
  const samples = [];
  for (let i = 0; i < reps; i += 1) {
    samples.push(await timed('input', () => cdp.typeText('f')));
    samples.push(await timed('input', () => cdp.key('Backspace')));
  }
  await ev(`(() => { const s = document.querySelector('.studies-search'); if (s) { s.blur(); } return true; })()`);
  return samples;
}

async function measureCellBox(reps) {
  await resetView();
  await delay(300);
  const id = await ev(`(() => { const r = [...document.querySelectorAll('.studies-row')]; return r[Math.floor(r.length / 2)]?.dataset.studyId ?? null; })()`);
  if (!id) return { id, samples: [] };
  await clickAt(`[data-find-key="flags-${id}"]`, 'center');
  await delay(250);
  const open = await ev(`Boolean(document.querySelector('[data-find-key="flags-${id}-input"]'))`);
  const samples = [];
  if (open) {
    for (let i = 0; i < reps; i += 1) {
      samples.push(await timed('input', () => cdp.typeText('h')));
      samples.push(await timed('input', () => cdp.key('Backspace')));
    }
    await cdp.key('Escape');
    await delay(150);
  }
  return { id, open, samples };
}

async function measureMenu(reps) {
  await resetView();
  await delay(300);
  const opens = [];
  const ticks = [];
  const unticks = [];
  const tickSel = `label:has(> [data-find-key="filter-flags-${POOL[0]}"])`;
  for (let i = 0; i < reps; i += 1) {
    opens.push(await timedClick('[data-find-key="filter-flags"]'));
    await delay(150);
    ticks.push(await timedClick(tickSel));
    await delay(150);
    unticks.push(await timedClick(tickSel));
    await delay(150);
    await cdp.key('Escape');
    await delay(150);
  }
  await resetView();
  return { opens, ticks, unticks };
}

async function measureBulkList(ids, reps) {
  await resetView();
  await cdp.setState(`{ paramSelected: ${js(ids)} }`);
  await delay(400);
  const opens = [];
  const keys = [];
  for (let i = 0; i < reps; i += 1) {
    opens.push(await timedClick('[data-find-key="flag-selected"]'));
    await delay(200);
    const there = await ev(`Boolean(document.querySelector('[data-find-key="bulk-flag-input"]'))`);
    if (there) {
      keys.push(await timed('input', () => cdp.typeText('h')));
      keys.push(await timed('input', () => cdp.key('Backspace')));
    }
    await cdp.key('Escape');
    await delay(200);
  }
  return { opens, keys };
}

async function measureNotification(reps) {
  await resetView();
  await delay(300);
  const samples = [];
  for (let i = 0; i < reps; i += 1) {
    samples.push(await ev(`new Promise((resolve) => import('./renderer/store.js').then((m) => { const t0 = performance.now(); m.setState({ scaleProbe: ${i} }); requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0))); }))`));
    await delay(60);
  }
  return samples;
}

const flagOn = (study, flag) => (study.flags ?? []).some((f) => f.toLowerCase() === flag.toLowerCase());
const readRecordFlags = (name) => { try { return JSON.parse(fs.readFileSync(path.join(LABELS, name), 'utf8')); } catch (_e) { return null; } };

// One bulk change over the ticked films: `adding` ticks a flag none of them holds, else untick it. Measures the store part,
// the disk part and the search box meanwhile.
async function bulkChange(films, ticked, adding, tag) {
  await resetView();
  await cdp.setState(`{ paramSelected: ${js(ticked.map((f) => f.id))} }`);
  await delay(500);
  await clickAt('[data-find-key="flag-selected"]');
  await delay(300);
  const boxKey = `bulk-flag-${UNREC.toLowerCase()}`;
  const box = `label:has(> [data-find-key="${boxKey}"])`;
  const listReady = await ev(`Boolean(document.querySelector('[data-find-key="${boxKey}"]'))`);
  check(`${tag}: the Flag list over ${ticked.length} ticked films offers "${UNREC}" (held by films outside the ticked set)`, listReady, null);
  if (!listReady) return null;
  await ev(`(async () => {
    const store = await import('./renderer/store.js');
    const ids = ${js(ticked.map((f) => f.id))};
    const w = window.__bulk = { tClick: null, tStore: null, busy: [], notes: 0 };
    w.unsub = store.subscribe((s) => {
      w.notes += 1;
      if (s.flagsBusy !== null || s.deletingStudies) w.busy.push([s.flagsBusy, s.deletingStudies]);
      if (w.tStore === null && w.tClick !== null) {
        const have = s.studies.filter((x) => ids.includes(x.id) && (x.flags ?? []).some((f) => f.toLowerCase() === ${js(UNREC)}));
        if (${adding ? 'have.length === ids.length' : 'have.length === 0'}) w.tStore = Date.now();
      }
    });
    window.addEventListener('click', () => { window.__bulk.tClick = Date.now(); }, { capture: true, once: true });
    return true;
  })()`);
  const label = await centreOf(box);
  const nowDone = () => ticked.filter((f) => { const r = readRecordFlags(f.label); return r && (r.flags ?? []).some((x) => x.toLowerCase() === UNREC) === adding; }).length;
  if (!label) { check(`${tag}: the flag's box can be clicked`, false, box); return null; }
  await cdp.click(label.cx, label.cy);
  // The search box while the sync runs: a keystroke still repaints.
  const meanwhile = [];
  const nodeStart = Date.now();
  for (let i = 0; i < 3; i += 1) {
    const doneBefore = nowDone();
    const ms = i === 0 ? await timedClickless(() => clickAt('.studies-search')) : null;
    const typed = await timed('input', () => cdp.typeText('f'));
    const back = await timed('input', () => cdp.key('Backspace'));
    meanwhile.push({ syncing: doneBefore < ticked.length, typed, back, clicked: ms });
  }
  let tDisk = null;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (nowDone() === ticked.length) { tDisk = Date.now(); break; }
    await delay(25);
  }
  const bulk = await ev(`(() => { const w = window.__bulk; w.unsub(); const out = { tClick: w.tClick, tStore: w.tStore, busy: w.busy, notes: w.notes }; delete window.__bulk; return out; })()`);
  const storeMs = bulk.tStore !== null && bulk.tClick !== null ? bulk.tStore - bulk.tClick : NaN;
  const syncMs = tDisk !== null && bulk.tClick !== null ? tDisk - bulk.tClick : NaN;
  void nodeStart;
  return { storeMs, syncMs, meanwhile, busy: bulk.busy, notes: bulk.notes, tDisk };
}
async function timedClickless(fn) { await fn(); return null; }

async function measureAll(total, full) {
  const films = plan(total);
  await seed(films);
  const count = await rowCount();
  const mine = await storeStudies();
  check(`${total}: ${total} invented studies are in the library and ${count >= total ? 'their rows are' : 'their rows are NOT'} on the Find list`, mine.length === total && count >= total, { mine: mine.length, rows: count });
  const files = fs.readdirSync(LABELS).filter((f) => f.startsWith(PREFIX));
  const recorded = films.filter((f) => f.hasRecord);
  check(`${total}: ${recorded.length} label records are on disk, one per recorded film`, files.length === recorded.length, { files: files.length, want: recorded.length });
  const reps = 12;
  const a = median(await measureSearch(reps));
  report(`${total} films, a  search-box keystroke (median of ${reps * 2})`, a);
  const bm = await measureCellBox(reps);
  const b = median(bm.samples);
  report(`${total} films, b  FLAGS cell box keystroke, middle row ${bm.id} (median of ${bm.samples.length})`, b);
  check(`${total}: the middle row's FLAGS editor opened for the keystrokes`, bm.open === true && bm.samples.length === reps * 2 && bm.samples.every(Number.isFinite), bm);
  let menu = null; let bulkList = null; let e = NaN;
  if (full) {
    menu = await measureMenu(10);
    report('400 films, c1 open the FLAGS header menu (median of 10)', median(menu.opens));
    report('400 films, c2 tick one flag in it (median of 10; the list then narrows)', median(menu.ticks));
    report('400 films, c3 untick it (median of 10; the list widens again)', median(menu.unticks));
    bulkList = await measureBulkList(recorded.map((f) => f.id), 10);
    report(`400 films, d1 open the Flag list with ${recorded.length} ticked (median of 10)`, median(bulkList.opens));
    report('400 films, d2 one keystroke in its box (median of 20)', median(bulkList.keys));
    const notes = await measureNotification(15);
    e = median(notes);
    report('400 films, e  one store notification that changes nothing the list shows (median of 15)', e);
  }
  // The bulk add and the bulk remove over the recorded films.
  const savedAtBefore = Object.fromEntries(recorded.map((f) => [f.label, readRecordFlags(f.label)?.saved_at]));
  const rawBefore = Object.fromEntries(recorded.map((f) => [f.label, /"saved_at"\s*:\s*"[^"]*"/.exec(fs.readFileSync(path.join(LABELS, f.label), 'utf8'))?.[0] ?? null]));
  const add = await bulkChange(films, recorded, true, `${total} bulk add`);
  let remove = null;
  if (add) {
    report(`${total} films, bulk add over ${recorded.length}: until the store shows the flag on all`, add.storeMs);
    report(`${total} films, bulk add over ${recorded.length}: until all record files carry it`, add.syncMs);
    const after = await storeStudies();
    const onAll = recorded.every((f) => flagOn(after.find((s) => s.id === f.id) ?? {}, UNREC));
    check(`${total} bulk add: the store holds the flag on all ${recorded.length} ticked films`, onAll, null);
    const recs = recorded.map((f) => ({ f, r: readRecordFlags(f.label), raw: /"saved_at"\s*:\s*"[^"]*"/.exec(fs.readFileSync(path.join(LABELS, f.label), 'utf8'))?.[0] ?? null }));
    check(`${total} bulk add: every one of the ${recorded.length} records has the new flag and a byte-identical saved_at`,
      recs.every(({ f, r, raw }) => r && (r.flags ?? []).some((x) => x.toLowerCase() === UNREC) && raw !== null && raw === rawBefore[f.label] && r.saved_at === savedAtBefore[f.label]),
      recs.filter(({ f, r, raw }) => !(r && (r.flags ?? []).some((x) => x.toLowerCase() === UNREC) && raw === rawBefore[f.label])).slice(0, 3).map(({ f }) => f.label));
    const filesAfter = fs.readdirSync(LABELS).filter((x) => x.startsWith(PREFIX));
    const noRecord = films.filter((f) => !f.hasRecord);
    check(`${total} bulk add: no record file exists for the ${noRecord.length} films that had none`, filesAfter.length === recorded.length && noRecord.every((f) => !filesAfter.includes(f.label)), { files: filesAfter.length });
    check(`${total} bulk add: flagsBusy and deletingStudies stayed null throughout (a bulk change is not a lock)`, add.busy.length === 0, { seen: add.busy.slice(0, 3), notifications: add.notes });
    const during = add.meanwhile.filter((m) => m.syncing);
    report(`${total} films, bulk add: search-box keystrokes taken while the sync ran`, `${during.length} of ${add.meanwhile.length}${during.length ? `, median ${median(during.flatMap((m) => [m.typed, m.back])).toFixed(1)} ms` : ' (the sync finished before the first keystroke: too fast to catch)'}`, '');
    check(`${total} bulk add: the search box repainted for every keystroke typed around the sync`, add.meanwhile.every((m) => Number.isFinite(m.typed) && Number.isFinite(m.back)), add.meanwhile);
    remove = await bulkChange(films, recorded, false, `${total} bulk remove`);
    if (remove) {
      report(`${total} films, bulk remove over ${recorded.length}: until the store has dropped the flag on all`, remove.storeMs);
      report(`${total} films, bulk remove over ${recorded.length}: until all record files have dropped it`, remove.syncMs);
      const end = await storeStudies();
      check(`${total} bulk remove: the store holds the flag on none of the ticked films and every record has dropped it, saved_at still byte-identical`,
        recorded.every((f) => !flagOn(end.find((s) => s.id === f.id) ?? {}, UNREC)) && recorded.every((f) => { const r = readRecordFlags(f.label); const raw = /"saved_at"\s*:\s*"[^"]*"/.exec(fs.readFileSync(path.join(LABELS, f.label), 'utf8'))?.[0]; return r && !(r.flags ?? []).some((x) => x.toLowerCase() === UNREC) && raw === rawBefore[f.label]; }), null);
      check(`${total} bulk remove: flagsBusy and deletingStudies stayed null throughout`, remove.busy.length === 0, remove.busy.slice(0, 3));
    }
  }
  return { a, b, menu, bulkList, e, add, remove };
}

let crashed = null;
try {
  await ev(`document.querySelector('#app')?.childElementCount > 0`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.bringToFront');
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await resetView();
  const preexisting = (await storeStudies()).length;
  check('precondition: no study of this suite is in the profile (a fresh launch)', preexisting === 0, preexisting);

  console.log('--- 100 films ---');
  const small = await measureAll(100, false);
  await wipe();
  console.log('--- 400 films ---');
  const big = await measureAll(400, true);

  // Ceilings, at 400 films.
  const { a, b, menu, bulkList, add } = big;
  check(`b (${b.toFixed(1)} ms) is no more than 3 x a (${a.toFixed(1)} ms)`, b <= 3 * a, { a, b });
  check(`b (${b.toFixed(1)} ms) is under 150 ms`, b < 150, b);
  const c1 = median(menu.opens); const c2 = median(menu.ticks); const c3 = median(menu.unticks);
  check(`c: opening the FLAGS menu (${c1.toFixed(1)} ms) is under 300 ms`, c1 < 300, c1);
  check(`c: ticking one flag in it (${c2.toFixed(1)} ms) is under 300 ms`, c2 < 300, c2);
  check(`c: unticking it (${c3.toFixed(1)} ms) is under 300 ms`, c3 < 300, c3);
  const d1 = median(bulkList.opens); const d2 = median(bulkList.keys);
  check(`d: opening the Flag list over 300 ticked films (${d1.toFixed(1)} ms) is under 300 ms`, d1 < 300, d1);
  check(`d: one keystroke in its box (${d2.toFixed(1)} ms) is under 300 ms`, d2 < 300, d2);
  check(`bulk add, the store part (${add?.storeMs?.toFixed?.(1)} ms) is under 500 ms`, Number.isFinite(add?.storeMs) && add.storeMs < 500, add?.storeMs);
  check(`bulk add, the 300-record sync (${add?.syncMs?.toFixed?.(0)} ms) is under 60 s`, Number.isFinite(add?.syncMs) && add.syncMs < 60000, add?.syncMs);
  void small;
} catch (error) {
  crashed = error;
  check('the script ran to the end without throwing', false, String(error?.stack ?? error));
} finally {
  try { await wipe(); } catch (error) { console.log(`cleanup failed: ${error.message}`); }
  await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }).catch(() => {});
  check('no console errors or exceptions during the run', cdp.errors.length === 0, cdp.errors.slice(0, 3));
  cdp.close();
}

console.log('--- numbers ---');
for (const [label, value] of numbers) console.log(`  ${label}: ${typeof value === 'number' ? value.toFixed(1) : value}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed || crashed ? 1 : 0);
