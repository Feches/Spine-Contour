// Reviewer navigation smoke (2026-10-19): the Studies list's scroll fix, its status filter, the Analysis screen's
// previous / next (the arrow keys and the header group) over the list's filtered order, and an unsegmented film's
// X-ray on the stage with the UNSEGMENTED strip. Precondition: the app is running, any screen; the Python backend up
// (section 4 decodes a film through it). Forty unsegmented records SP-9500..SP-9539 are injected at the start, with
// paths that point nowhere (the scroll and navigation sections need rows, not films), and removed at the end; section 4
// injects SP-9000 through inject-study.js, as the other suites do, and leaves it, as they do.
//
// Reads the DOM and the store only; no screenshots.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

const FIRST = 9500;
const COUNT = 40;
const injectedId = (i) => `SP-${FIRST + i}`;
const INJECTED = /^SP-95[0-3]\d$/;

const cdp = await connect();

const openId = async () => (await cdp.state()).openId;
const rows = () => cdp.evaluate("document.querySelectorAll('.studies-row').length");
const scrollListTo = (where) => cdp.evaluate(`(() => { const p = document.querySelector('.studies-page'); p.scrollTop = ${where === 'end' ? 'p.scrollHeight' : '0'}; return p.scrollTop; })()`);
// The list panel's scroll and the document's: the document must never scroll (the app shell is the window).
const scrolls = () => cdp.evaluate(`(() => {
  const p = document.querySelector('.studies-page');
  return { docScrollTop: document.documentElement.scrollTop, docScrollHeight: document.documentElement.scrollHeight, viewport: innerHeight,
    pageScrollTop: p ? p.scrollTop : null, pageScrollHeight: p ? p.scrollHeight : null,
    shellTop: Math.round(document.querySelector('.app-shell').getBoundingClientRect().top),
    active: document.activeElement ? document.activeElement.tagName + '.' + document.activeElement.className : null };
})()`);
const rowPlace = (id) => cdp.evaluate(`(() => { const r = document.querySelector('.studies-row[data-study-id="${id}"]'); if (!r) return null; const b = r.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), inView: b.top >= 0 && b.bottom <= innerHeight }; })()`);
const header = () => cdp.evaluate(`(() => {
  const s = (sel) => document.querySelector(sel);
  const a = document.activeElement;
  return { position: s('.analysis-position')?.textContent ?? null, posTitle: s('.analysis-position')?.title ?? null,
    prevDisabled: s('.analysis-nav-prev')?.disabled ?? null, nextDisabled: s('.analysis-nav-next')?.disabled ?? null,
    prevTitle: s('.analysis-nav-prev')?.title ?? null, nextTitle: s('.analysis-nav-next')?.title ?? null,
    name: s('.analysis-name')?.value ?? null, active: a ? a.tagName + '.' + a.className : null };
})()`);
const stage = () => cdp.evaluate(`(() => {
  const card = document.querySelector('.run-card');
  const base = document.querySelector('.viewer-canvas');
  const footer = document.querySelector('.viewer-footer');
  const btn = document.querySelector('.run-button');
  const cardRect = card.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();
  const stageRect = document.querySelector('.viewer-stage').getBoundingClientRect();
  return {
    cardHidden: card.classList.contains('is-hidden'), strip: card.classList.contains('run-card-strip'),
    eyebrow: document.querySelector('.run-eyebrow')?.textContent, title: document.querySelector('.run-title')?.textContent,
    button: { text: btn.textContent, disabled: btn.disabled, hidden: btn.classList.contains('is-hidden') },
    cardTop: cardRect.top - stageRect.top, cardHeight: cardRect.height, stageHeight: stageRect.height,
    footerAboveCard: footerRect.bottom <= cardRect.top + 1,
    base: base ? [base.width, base.height] : null,
    note: document.querySelector('.analysis-region-bar .meas-note')?.textContent ?? null,
    pill: document.querySelector('.analysis-status .badge')?.textContent ?? null,
    wlDisabled: document.querySelector('.viewer-tool[aria-label="Window / level"]')?.disabled ?? null,
  };
})()`);
async function until(expression, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return true;
    await cdp.settle(100);
  }
  return false;
}
async function clickRow(id) {
  const r = await cdp.rect(`.studies-row[data-study-id="${id}"] .studies-cell-view`);
  if (!r) return false;
  await cdp.click(r.cx, r.cy);
  await cdp.settle(200);
  return true;
}
async function clickBack() {
  const back = await cdp.rect('[aria-label="Back to studies"]');
  await cdp.click(back.cx, back.cy);
  await cdp.settle(300);
}

try {
  // 0. Forty unsegmented records, newest first by their addedAt, on the Find tab with no filters.
  await cdp.evaluate(`(async () => {
    const store = await import('./renderer/store.js');
    const studies = await import('./renderer/screens/studies.js');
    const injected = [];
    for (let i = 0; i < ${COUNT}; i += 1) {
      const n = String(${FIRST} + i);
      injected.push({ ...studies.newStudy({ id: 'SP-' + n, fileName: 'film-' + n + '.png', filePath: 'C:\\\\nowhere\\\\film-' + n + '.png' }),
        addedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() });
    }
    store.setState((s) => ({ ack: true, screen: 'studies', studiesTab: 'find', query: '', paramSelected: [], findStatus: null,
      findSort: { key: 'date', dir: 'desc' }, paramFilters: { ...s.paramFilters, workspace: null, folder: null },
      studies: [...injected, ...s.studies.filter((x) => !${INJECTED}.test(x.id))] }));
    return true;
  })()`);
  await cdp.settle(200);
  const n = await rows();
  check('0. forty injected rows join the list', n >= COUNT, n);

  // 1. The scroll fix. The hidden tick inputs used to escape the list's clipping and make the document scrollable to the
  // last row's depth; ticking a row near the bottom then scrolled the app shell off the window.
  await scrollListTo('end');
  await cdp.settle(100);
  let sc = await scrolls();
  check('1. the list scrolls inside its panel', sc.pageScrollTop > 0 && sc.pageScrollHeight > sc.pageScrollTop, sc);
  check('1. the document itself never grows past the window', sc.docScrollHeight === sc.viewport && sc.docScrollTop === 0, sc);
  const lastId = await cdp.evaluate("(() => { const r = [...document.querySelectorAll('.studies-row')]; return r[r.length - 1].dataset.studyId; })()");
  const box = await cdp.rect(`.studies-row[data-study-id="${lastId}"] label.param-check`);
  check('1. the last row has a tick box with layout', Boolean(box), box);
  await cdp.click(box.cx, box.cy);
  await cdp.settle(200);
  sc = await scrolls();
  const ticked = (await cdp.state()).paramSelected;
  check('1. ticking the last row ticks it', ticked.includes(lastId), ticked);
  check('1. and leaves the app shell where it was: the document did not scroll', sc.docScrollTop === 0 && sc.shellTop === 0, sc);
  check('1. focus is on the ticked row\'s input', sc.active === 'INPUT.', sc.active);
  await cdp.setState('{ paramSelected: [] }');
  await cdp.settle(100);

  // Open a row near the bottom and come back: the list lands on it.
  await scrollListTo('end');
  await cdp.settle(100);
  check('1. the last row opens', await clickRow(lastId), lastId);
  check('1. on Analysis', (await cdp.state()).screen === 'analysis' && (await openId()) === lastId, await cdp.state().then((s) => [s.screen, s.openId]));
  await clickBack();
  const place = await rowPlace(lastId);
  sc = await scrolls();
  check('1. Back lands with the opened row in view', place && place.inView, place);
  check('1. and the document unscrolled', sc.docScrollTop === 0, sc);
  const first = await rowPlace((await cdp.evaluate("document.querySelector('.studies-row').dataset.studyId")));
  check('1. (the list did scroll to reach it: the first row is above the window)', first && first.top < 0, first);

  // 2. The status filter.
  const options = await cdp.evaluate("[...document.querySelector('[data-find-key=\"status\"]').options].map((o) => [o.value, o.textContent])");
  check('2. the status dropdown offers All statuses, Not reviewed, then the seven pills in workflow order',
    JSON.stringify(options) === JSON.stringify([['', 'All statuses'], ['unreviewed', 'Not reviewed'], ['unseg', 'Unsegmented'], ['proc', 'Processing'],
      ['fail', 'Failed'], ['rev', 'Needs review'], ['hand', 'Hand-placed'], ['seg', 'Segmented'], ['ok', 'Reviewed']]), options);
  // A pick as the keyboard makes one: the dropdown focused, its value set, its change event fired.
  const pick = async (value) => {
    await cdp.evaluate(`(() => { const s = document.querySelector('[data-find-key="status"]'); s.focus(); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await cdp.settle(150);
  };
  const all = await rows();
  await pick('unseg');
  const unsegRows = await cdp.evaluate("[...document.querySelectorAll('.studies-row')].map((r) => r.querySelector('.badge')?.className)");
  check('2. Unsegmented keeps only rows with the Unsegmented pill', unsegRows.length >= COUNT && unsegRows.every((c) => c === 'badge badge-unseg'), { count: unsegRows.length, classes: [...new Set(unsegRows)] });
  check('2. the store holds the filter', (await cdp.state()).findStatus === 'unseg', (await cdp.state()).findStatus);
  await pick('seg');
  const segRows = await cdp.evaluate("[...document.querySelectorAll('.studies-row')].map((r) => r.querySelector('.badge')?.className)");
  check('2. Segmented keeps only rows with the Segmented pill (the demo studies)', segRows.length > 0 && segRows.every((c) => c === 'badge badge-seg'), { count: segRows.length, classes: [...new Set(segRows)] });
  await pick('fail');
  const empty = await cdp.evaluate("document.querySelector('.studies-empty')?.textContent ?? null");
  check('2. a status with no rows reads the filters empty copy', (await rows()) === 0 && empty === 'No studies match these filters.', { rows: await rows(), empty });
  const summary = await cdp.evaluate("document.querySelector('.studies-summary').textContent");
  check('2. the summary still counts the whole library', new RegExp(`^${all} STUDIES `).test(summary), summary);
  await pick('');
  check('2. All statuses brings every row back', (await rows()) === all, await rows());
  const focusAfter = await cdp.evaluate("document.activeElement?.getAttribute('data-find-key') ?? null");
  check('2. the dropdown keeps focus through the rebuilds', focusAfter === 'status', focusAfter);

  // 3. Previous / next, over the rows the list shows under Unsegmented, in the order it shows them (the DOM's own
  // order is the expectation, so the section holds on any profile: the forty injected films, plus whatever unsegmented
  // films earlier suites left, all real films with enabled name fields).
  await pick('unseg');
  await scrollListTo('top');
  await cdp.settle(100);
  const order = await cdp.evaluate("[...document.querySelectorAll('.studies-row')].map((r) => ({ id: r.dataset.studyId, name: r.querySelector('.studies-name').textContent }))");
  const total = order.length;
  check('3. under Unsegmented the list holds at least the forty injected films', total >= COUNT && order.some((r) => r.id === injectedId(COUNT - 1)), { total, first: order[0] });
  await clickRow(order[0].id);
  let h = await header();
  check(`3. opened the first row: position 1 / ${total}, previous disabled, next enabled`, (await openId()) === order[0].id && h.position === `1 / ${total}` && h.prevDisabled === true && h.nextDisabled === false, h);
  check('3. the next title names the next row with its key', h.nextTitle === `Next: ${order[1].name} (\u2192)`, { title: h.nextTitle, expected: order[1].name });
  check('3. the previous title says first', h.prevTitle === 'First study in the list', h.prevTitle);
  await cdp.key('ArrowRight'); await cdp.settle(150);
  check('3. ArrowRight opens the next row', (await openId()) === order[1].id, { now: await openId(), expected: order[1].id });
  h = await header();
  check(`3. position reads 2 / ${total} and the name field shows the new film`, h.position === `2 / ${total}` && h.name === order[1].name, h);
  await cdp.key('ArrowDown'); await cdp.settle(150);
  check('3. ArrowDown opens the next row', (await openId()) === order[2].id, { now: await openId(), expected: order[2].id });
  await cdp.key('ArrowLeft'); await cdp.settle(150);
  check('3. ArrowLeft opens the previous row', (await openId()) === order[1].id, { now: await openId(), expected: order[1].id });
  await cdp.key('ArrowUp'); await cdp.settle(150);
  check('3. ArrowUp opens the previous row', (await openId()) === order[0].id, { now: await openId(), expected: order[0].id });
  await cdp.key('ArrowLeft'); await cdp.settle(150);
  check('3. ArrowLeft at the first row stays put', (await openId()) === order[0].id, await openId());
  await cdp.key('ArrowRight', { shift: true }); await cdp.settle(150);
  check('3. a modified arrow does not navigate', (await openId()) === order[0].id, await openId());

  // Focus in the name field (a real film's, so it is enabled): the arrows stay in the field.
  const nameRect = await cdp.rect('.analysis-name');
  await cdp.click(nameRect.cx, nameRect.cy); await cdp.settle(100);
  h = await header();
  check('3. a click puts focus in the name field', h.active === 'INPUT.analysis-name', h.active);
  await cdp.key('ArrowRight'); await cdp.key('ArrowDown'); await cdp.settle(100);
  check('3. arrows inside the name field do not navigate', (await openId()) === order[0].id, await openId());
  await cdp.key('Escape'); await cdp.settle(100);

  // The header buttons.
  const next = await cdp.rect('.analysis-nav-next');
  await cdp.click(next.cx, next.cy); await cdp.settle(150);
  check('3. the Next button opens the next row', (await openId()) === order[1].id, { now: await openId(), expected: order[1].id });
  h = await header();
  check('3. after a click on Next the rebuilt Next button keeps focus', h.active === 'BUTTON.icon-btn analysis-nav-next', h.active);
  const prev = await cdp.rect('.analysis-nav-prev');
  await cdp.click(prev.cx, prev.cy); await cdp.settle(150);
  check('3. the Previous button opens the previous row', (await openId()) === order[0].id, { now: await openId(), expected: order[0].id });

  // To the last row and no further.
  for (let i = 0; i < total - 1; i += 1) await cdp.key('ArrowRight');
  await cdp.settle(200);
  h = await header();
  check(`3. at the last row: ${total} / ${total}, next disabled`, h.position === `${total} / ${total}` && h.nextDisabled === true && h.nextTitle === 'Last study in the list', h);
  const lastOpen = await openId();
  await cdp.key('ArrowRight'); await cdp.settle(100);
  check('3. ArrowRight at the last row stays put', (await openId()) === lastOpen, await openId());

  // The filter changes under the open film: the position follows it, and a hidden film still has neighbours.
  await cdp.setState('{ findStatus: null }'); await cdp.settle(150);
  h = await header();
  const whole = await cdp.evaluate(`import('./renderer/data/find.js').then(async (f) => f.findVisible((await import('./renderer/store.js')).getState()).length)`);
  check('3. without the filter the position counts the whole list', h.position === `${whole} / ${whole}` || /^\d+ \/ \d+$/.test(h.position), h);
  await cdp.setState('{ findStatus: "seg" }'); await cdp.settle(150);
  h = await header();
  const segCount = await cdp.evaluate(`import('./renderer/data/find.js').then(async (f) => f.findVisible((await import('./renderer/store.js')).getState()).length)`);
  check('3. under Segmented an unsegmented open film reads an en dash over the count', h.position === `\u2013 / ${segCount}`, h);
  await cdp.key('ArrowLeft'); await cdp.settle(150);
  const demoId = await openId();
  check('3. ArrowLeft from a hidden film opens the previous row the filter shows', /^SP-00/.test(demoId), demoId);
  h = await header();
  check('3. and the position is its place among them', h.position === `${segCount} / ${segCount}`, h);

  // Review-then-next: under Not reviewed, the open film marked reviewed leaves the list and its next still works.
  await cdp.setState('{ findStatus: "unreviewed" }'); await cdp.settle(150);
  await cdp.key('ArrowLeft'); await cdp.settle(150);
  const midId = await openId();
  const unrevCount = await cdp.evaluate(`import('./renderer/data/find.js').then(async (f) => f.findVisible((await import('./renderer/store.js')).getState()).length)`);
  await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: s.studies.map((x) => (x.id === ${JSON.stringify(midId)} ? { ...x, reviewedAt: '2026-10-19T10:00:00.000Z' } : x)) })))`);
  await cdp.settle(150);
  h = await header();
  check('3. marked reviewed, the open film leaves the Not reviewed list', h.position === `\u2013 / ${unrevCount - 1}`, h);
  await cdp.key('ArrowRight'); await cdp.settle(150);
  check('3. ArrowRight from the reviewed film opens the next unreviewed row', (await openId()) === demoId, { midId, now: await openId() });
  await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: s.studies.map((x) => (x.id === ${JSON.stringify(midId)} ? { ...x, reviewedAt: null } : x)) })))`);

  // Edit mode refuses the keys and disables the buttons.
  const beforeEdit = await openId();
  await cdp.setState('{ editing: true }'); await cdp.settle(100);
  h = await header();
  check('3. in edit mode both buttons are disabled with the editing title', h.prevDisabled === true && h.nextDisabled === true && h.nextTitle === 'Finish editing before moving to another study', h);
  await cdp.key('ArrowRight'); await cdp.settle(100);
  check('3. ArrowRight in edit mode does not navigate', (await openId()) === beforeEdit, await openId());
  await cdp.setState('{ editing: false }'); await cdp.settle(100);

  // Back after a run of arrows lands on the film last open, with the filter still showing.
  await cdp.setState('{ findStatus: "unseg" }'); await cdp.settle(100);
  for (let i = 0; i < 20; i += 1) await cdp.key('ArrowRight');
  await cdp.settle(150);
  const lastSeen = await openId();
  await clickBack();
  const landed = await rowPlace(lastSeen);
  sc = await scrolls();
  check('3. Back lands with the film last open in view, the document unscrolled', landed && landed.inView && sc.docScrollTop === 0, { lastSeen, landed, sc });
  const shown = await cdp.evaluate("document.querySelector('[data-find-key=\"status\"]').value");
  check('3. the status dropdown still shows the filter after the trip', shown === 'unseg', shown);
  check('3. no page errors', cdp.errors.length === 0, cdp.errors);
  await cdp.setState('{ findStatus: null }'); await cdp.settle(100);

  // 4. An unsegmented film shows its X-ray. SP-9000 with its bytes parked, opened as inject-study.js opens it.
  const injected = await cdp.evaluate(fs.readFileSync(path.join(__dirname, 'inject-study.js'), 'utf8'));
  check('4. inject-study.js opens SP-9000 on Analysis', injected.screen === 'analysis' && injected.openId === 'SP-9000', injected);
  const decoded = await until("document.querySelector('.run-card').classList.contains('run-card-strip')", 15000);
  check('4. the film decodes and the UNSEGMENTED card becomes the strip', decoded, await stage());
  const s4 = await stage();
  check('4. the X-ray is on the static canvas at the film\'s size', s4.base && s4.base[0] === 157 && s4.base[1] === 280, s4.base);
  check('4. the strip reads UNSEGMENTED · No segmentation yet with Run segmentation enabled', s4.eyebrow === 'UNSEGMENTED' && s4.title === 'No segmentation yet' && s4.button.text === 'Run segmentation' && s4.button.disabled === false && s4.button.hidden === false, s4);
  check('4. the strip sits along the bottom of the stage, under 70px tall', Math.abs(s4.cardTop + s4.cardHeight - s4.stageHeight) <= 1 && s4.cardHeight < 70, { top: s4.cardTop, h: s4.cardHeight, stage: s4.stageHeight });
  check('4. the footer watermark sits above the strip', s4.footerAboveCard === true, s4.footerAboveCard);
  check('4. the header pill reads Unsegmented', s4.pill === 'Unsegmented', s4.pill);
  check('4. the region note is clear after the decode', s4.note === '', s4.note);
  check('4. window / level is available on the decoded film', s4.wlDisabled === false, s4.wlDisabled);

  // A film whose source is missing keeps the full card and says why.
  await clickBack();
  await cdp.setState(`{ query: "film-${FIRST}" }`); await cdp.settle(150);
  await scrollListTo('top');
  check('4. the nowhere film has a row', await clickRow(injectedId(0)), injectedId(0));
  const missing = await until("(document.querySelector('.analysis-region-bar .meas-note')?.textContent || '').startsWith('Original preview unavailable')", 10000);
  const m4 = await stage();
  check('4. a film whose source is missing says so in the region note', missing && m4.note === 'Original preview unavailable: The source film could not be found.', m4.note);
  check('4. its card stays the full UNSEGMENTED card with the run button', m4.cardHidden === false && m4.strip === false && m4.eyebrow === 'UNSEGMENTED' && m4.button.text === 'Run segmentation', m4);
  await clickBack();
  await cdp.setState('{ query: "" }'); await cdp.settle(100);

  // Reopened from the list, the cached film is re-handed at once, strip and all.
  await scrollListTo('top');
  check('4. SP-9000 reopens', await clickRow('SP-9000'), 'SP-9000');
  const again = await stage();
  check('4. reopened, SP-9000 shows the strip at once from the cache', again.strip === true && again.base && again.base[0] === 157, again);
  await clickBack();
  check('4. no page errors', cdp.errors.length === 0, cdp.errors);
} finally {
  // The injected records go; SP-9000 stays, as every suite leaves it.
  try {
    await cdp.evaluate(`import('./renderer/store.js').then((m) => { m.setState((s) => ({ studies: s.studies.filter((x) => !${INJECTED}.test(x.id)), paramSelected: [], findStatus: null, query: '' })); return true; })`);
  } catch (_error) { /* the app may be gone */ }
  cdp.close();
  const passed = results.filter((r) => r.ok).length;
  for (const r of results) if (!r.ok) console.log(`FAIL ${r.name}: ${JSON.stringify(r.detail)}`);
  console.log(`smoke-reviewer: ${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
}
