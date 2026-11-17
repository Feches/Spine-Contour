// Reviewer navigation smoke (2026-10-19): the Studies list's scroll fix, its header filter menus (section 2, rewritten
// 2026-10-19 when the menus replaced the bar's status dropdown), the Analysis screen's previous / next (the arrow keys
// and the header group) over the list's filtered order, an unsegmented film's X-ray on the stage with the UNSEGMENTED
// strip, the REGION column after a run (section 5) and the import table's Unknown view default (section 6).
// Precondition: the app is running, any screen; the Python backend up (section 4 decodes a film through it, section 5
// runs one segmentation of the sample film, so the models must load). Forty unsegmented records SP-9500..SP-9539 are
// injected at the start, with paths that point nowhere (the scroll and navigation sections need rows, not films), and
// removed at the end; the first three carry the subjects RVW-NAV-0..2 for the SUBJECT menu. Section 2 makes one demo
// study Needs review in the store (demo studies are never saved) and restores it. Section 3 (2026-10-19, final review)
// marks every film the Segmented, Needs review and Hand-placed ticks keep reviewed, in the store, and puts each mark
// back as it was. Section 4 injects SP-9000 through inject-study.js, as the other suites do, and section 5 segments it;
// it is left, segmented, as smoke-studies.mjs leaves it. Section 6 seeds the Workspace screen's folder table and clears it.
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
// The header menus' filters with only STATUS ticked (none: no filter), as a store patch, for the steps taken on the
// Analysis screen, where the menus are not on screen.
const statusOnly = (...status) => `{ findFilters: { subject: '', region: [], view: [], workspace: [], folder: [], status: ${JSON.stringify(status)} } }`;
// The demo study section 2 makes Needs review, with its own qc, so the finally block can restore it.
let demoPatched = null;

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

// ---- The header filter menus (2026-10-19), driven as a person drives them -----------------------------------------
// A column's funnel: its names, whether its menu is open, and whether it reads active (the count and the title).
const funnel = (column) => cdp.evaluate(`(() => {
  const f = document.querySelector('[data-find-key="filter-${column}"]');
  if (!f) return null;
  return { label: f.getAttribute('aria-label'), popup: f.getAttribute('aria-haspopup'), expanded: f.getAttribute('aria-expanded'),
    active: f.classList.contains('is-active'), count: f.querySelector('.studies-filter-count')?.textContent ?? null, title: f.title };
})()`);
// The open menu, or null: its names, its tick boxes and sort items, and whether it is drawn whole -- inside the window,
// below the header row, and the topmost thing at its own centre (nothing clips it or paints over it).
const menu = () => cdp.evaluate(`(() => {
  const menus = document.querySelectorAll('.studies-filter-menu');
  const m = menus[0];
  if (!m) return null;
  const r = m.getBoundingClientRect();
  const head = document.querySelector('.studies-table-head').getBoundingClientRect();
  return { count: menus.length, column: m.dataset.filterMenu, role: m.getAttribute('role'), label: m.getAttribute('aria-label'),
    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], window: [innerWidth, innerHeight],
    inWindow: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    belowHeader: r.top >= head.bottom, onTop: m.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)),
    options: [...m.querySelectorAll('.menu-check')].map((l) => { const i = l.querySelector('input'); return [i.dataset.findKey, l.textContent, i.checked]; }),
    sorts: [...m.querySelectorAll('[data-find-key^="sort-"]')].map((b) => [b.dataset.findKey, b.textContent]) };
})()`);
const focusedKey = () => cdp.evaluate("document.activeElement?.getAttribute('data-find-key') ?? null");
// A click on the control keyed `key` (scrolled into the list's view first: the header row scrolls with the list).
async function press(key, selector = `[data-find-key="${key}"]`) {
  await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'nearest' })`);
  const r = await cdp.rect(selector);
  if (!r) return false;
  await cdp.click(r.cx, r.cy);
  await cdp.settle(150);
  return true;
}
// Opens a column's menu through its funnel, unless it is open already.
async function openMenu(column) {
  if ((await funnel(column))?.expanded !== 'true') await press(`filter-${column}`);
}
// A tick as a person makes one: the column's menu open, then a click on the value's row (the label round its box).
async function tick(column, value) {
  await openMenu(column);
  return press(null, `label:has(> [data-find-key="filter-${column}-${value}"])`);
}
const badges = () => cdp.evaluate("[...document.querySelectorAll('.studies-row')].map((r) => r.querySelector('.badge')?.className)");

try {
  // 0. Forty unsegmented records, newest first by their addedAt, on the Find tab with no filters.
  await cdp.evaluate(`(async () => {
    const store = await import('./renderer/store.js');
    const studies = await import('./renderer/screens/studies.js');
    const injected = [];
    for (let i = 0; i < ${COUNT}; i += 1) {
      const n = String(${FIRST} + i);
      injected.push({ ...studies.newStudy({ id: 'SP-' + n, fileName: 'film-' + n + '.png', filePath: 'C:\\\\nowhere\\\\film-' + n + '.png' }),
        addedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), subjectId: i < 3 ? 'RVW-NAV-' + i : null });
    }
    store.setState((s) => ({ ack: true, screen: 'studies', studiesTab: 'find', query: '', paramSelected: [],
      findSort: { key: 'date', dir: 'desc' }, findFilters: { subject: '', region: [], view: [], workspace: [], folder: [], status: [] },
      studies: [...injected, ...s.studies.filter((x) => !${INJECTED}.test(x.id))] }));
    return true;
  })()`);
  await cdp.settle(200);
  const n = await rows();
  check('0. forty injected rows join the list', n >= COUNT, n);

  // 1. The scroll fix. The hidden tick inputs used to escape the list's clipping and make the document scrollable to the
  // last row's depth; ticking a row near the bottom then scrolled the app shell off the window.
  // (2026-11-16, the final review, M1) The table now keeps its sideways scroll across repaints, so a suite run before this
  // one on the same launch (smoke-studies.mjs presses the FLAGS cells at the right-hand end) can leave it scrolled right,
  // with the tick boxes clipped off its left edge. Back to the start, as a person would scroll to reach the boxes.
  await cdp.evaluate(`(() => { const t = document.querySelector('.studies-table'); if (t) t.scrollLeft = 0; })()`);
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

  // 2. The header filter menus (header filters spec 2026-10-19, section 3.2): a funnel opens its column's menu, a tick
  // applies at once behind it, ticks OR within a column and AND across columns.
  await scrollListTo('top');
  await cdp.settle(100);
  const all = await rows();
  const headers = await cdp.evaluate("['study', 'subject', 'region', 'view', 'workspace', 'folder', 'date', 'status'].map((c) => Boolean(document.querySelector('[data-find-key=\"filter-' + c + '\"]')))");
  check('2. every header but STUDY and DATE has a funnel', JSON.stringify(headers) === JSON.stringify([false, true, true, true, true, true, false, true]), headers);
  // (2026-11-17, PR #86) The bar has one select now, Set region…; the Workspace, Folder and Status dropdowns stay gone.
  const barSelects = await cdp.evaluate("[...document.querySelectorAll('.studies-filters select')].map((e) => e.getAttribute('data-find-key'))");
  check('2. the bar has no Workspace, Folder or Status dropdown (its one select is Set region)', JSON.stringify(barSelects) === JSON.stringify(['region']), barSelects);
  let fn = await funnel('status');
  check('2. the STATUS funnel: Filter by status, a dialog popup, closed and plain', fn && fn.label === 'Filter by status' && fn.popup === 'dialog'
    && fn.expanded === 'false' && !fn.active && fn.title === 'Filter by status', fn);
  await press('filter-status');
  fn = await funnel('status');
  let m = await menu();
  check('2. the funnel opens the STATUS menu: aria-expanded true, one dialog named Filter by status', fn.expanded === 'true' && m && m.count === 1
    && m.column === 'status' && m.role === 'dialog' && m.label === 'Filter by status', { fn, m });
  check('2. focus lands on the menu\'s first control, All', (await focusedKey()) === 'filter-status-all', await focusedKey());
  check('2. the menu is drawn whole: inside the window, below the header row, nothing over it', m.inWindow && m.belowHeader && m.onTop, m);
  // (2026-10-19, final review; R13) The STATUS menu offers all seven pills, Processing included, whatever the library
  // holds: a tick on a status no film shows any more must not dissolve.
  const pills = [['unseg', 'Unsegmented'], ['proc', 'Processing'], ['fail', 'Failed'], ['rev', 'Needs review'], ['hand', 'Hand-placed'],
    ['seg', 'Segmented'], ['ok', 'Reviewed']].map(([value, label]) => [`filter-status-${value}`, label, false]);
  check('2. the options read the seven pills in workflow order, none ticked', JSON.stringify(m.options) === JSON.stringify(pills), { options: m.options, pills });
  check('2. the STATUS sort items read Workflow order and Reverse', JSON.stringify(m.sorts) === JSON.stringify([['sort-status-asc', 'Workflow order'], ['sort-status-desc', 'Reverse']]), m.sorts);

  await tick('status', 'unseg');
  const unsegRows = await badges();
  check('2. ticking Unsegmented keeps only rows with the Unsegmented pill', unsegRows.length >= COUNT && unsegRows.every((c) => c === 'badge badge-unseg'), { count: unsegRows.length, classes: [...new Set(unsegRows)] });
  fn = await funnel('status');
  check('2. the funnel reads active with count 1, its title naming the tick', fn.active && fn.count === '1' && fn.title === 'Filtered: Unsegmented', fn);
  check('2. the store holds the tick', JSON.stringify((await cdp.state()).findFilters.status) === '["unseg"]', (await cdp.state()).findFilters);
  m = await menu();
  check('2. the menu stays open behind the tick, the box ticked and focused', m?.column === 'status'
    && m.options.some(([key, , on]) => key === 'filter-status-unseg' && on) && (await focusedKey()) === 'filter-status-unseg', { m, focus: await focusedKey() });
  await tick('status', 'seg');
  const bothRows = await badges();
  check('2. ticking Segmented too shows both', bothRows.length > unsegRows.length && bothRows.includes('badge badge-seg') && bothRows.includes('badge badge-unseg')
    && bothRows.every((c) => c === 'badge badge-unseg' || c === 'badge badge-seg'), { count: bothRows.length, classes: [...new Set(bothRows)] });
  fn = await funnel('status');
  check('2. count 2, the title naming both in the menu\'s order', fn.count === '2' && fn.title === 'Filtered: Unsegmented, Segmented', fn);
  await press('filter-status-none');
  fn = await funnel('status');
  check('2. None clears the column: every row back, the funnel plain, the menu still open', (await rows()) === all && !fn.active
    && (await cdp.state()).findFilters.status.length === 0 && (await menu())?.column === 'status', { rows: await rows(), fn });
  await cdp.key('Escape'); await cdp.settle(150);
  check('2. Escape closes the menu and returns focus to the funnel', (await menu()) === null && (await funnel('status')).expanded === 'false'
    && (await focusedKey()) === 'filter-status', { menu: await menu(), focus: await focusedKey() });
  await press('filter-status');
  check('2. the funnel opens it again', (await menu())?.column === 'status', await menu());
  await press(null, '.studies-heading');
  check('2. a click outside closes it', (await menu()) === null && (await funnel('status')).expanded === 'false', await menu());

  // Escape from anywhere (ruling R11). The menu's own Escape handler covers focus inside it; a keyboard user whose focus
  // has left it (Shift+Tab from All) or whose focus is in the search box must be able to close it too, focus landing on
  // the funnel. A mouse click on the search box would be a press outside and close the menu by itself, so focus is
  // moved there the way a keyboard moves it, without a press.
  await press('filter-status');
  await cdp.key('Tab', { shift: true }); await cdp.settle(100);
  const strayed = await cdp.evaluate("(() => { const m = document.querySelector('.studies-filter-menu'); const a = document.activeElement; return { open: Boolean(m), inside: m ? m.contains(a) : null, active: a ? a.tagName + '.' + a.className : null }; })()");
  check('2. Shift+Tab from All takes focus out of the menu, which stays open', strayed.open && strayed.inside === false, strayed);
  await cdp.key('Escape'); await cdp.settle(150);
  check('2. Escape with focus outside the menu closes it and returns focus to the funnel', (await menu()) === null && (await funnel('status')).expanded === 'false'
    && (await focusedKey()) === 'filter-status', { menu: await menu(), focus: await focusedKey() });
  await press('filter-status');
  await cdp.evaluate("document.querySelector('.studies-search').focus()"); await cdp.settle(100);
  const inSearch = await cdp.evaluate("({ open: Boolean(document.querySelector('.studies-filter-menu')), search: document.activeElement === document.querySelector('.studies-search') })");
  check('2. with focus in the search box the menu is still open', inSearch.open && inSearch.search, inSearch);
  await cdp.key('Escape'); await cdp.settle(150);
  const afterSearchEscape = await cdp.evaluate("({ menu: document.querySelectorAll('.studies-filter-menu').length, expanded: document.querySelector('[data-find-key=\"filter-status\"]')?.getAttribute('aria-expanded'), active: document.activeElement?.getAttribute('data-find-key') ?? null })");
  check('2. Escape in the search box closes the menu and puts focus on the funnel, not in the box', afterSearchEscape.menu === 0 && afterSearchEscape.expanded === 'false'
    && afterSearchEscape.active === 'filter-status', afterSearchEscape);
  // A row click with a menu open (ruling R10): the outside press closes the menu and its rebuild replaces the row
  // before the click arrives, so the row is not opened.
  await press('filter-status');
  const clearRow = await cdp.evaluate(`(() => {
    for (const r of document.querySelectorAll('.studies-row')) {
      const c = r.querySelector('.studies-cell-view'); const b = c.getBoundingClientRect();
      if (b.width > 0 && r.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2))) return r.dataset.studyId;
    }
    return null;
  })()`);
  check('2. a row not covered by the open menu to click', Boolean(clearRow), clearRow);
  await clickRow(clearRow);
  await cdp.settle(200);
  check('2. a click on a row with a menu open closes the menu and does not open the row', (await menu()) === null && (await cdp.state()).screen === 'studies', { menu: await menu(), screen: (await cdp.state()).screen });
  // A click on a column header with a menu open (2026-10-19, final review; R16): the menu closes AND the header's sort
  // button does what it says on that one click, since only a press on the rows is swallowed by the rebuild.
  await press('filter-status');
  const sortBefore = (await cdp.state()).findSort;
  await press('sort-date');
  const sortAfter = (await cdp.state()).findSort;
  check('2. a click on a header\'s sort button with a menu open closes the menu and sorts on that one click',
    (await menu()) === null && (await funnel('status')).expanded === 'false' && sortBefore.key === 'date' && sortBefore.dir === 'desc'
    && sortAfter.key === 'date' && sortAfter.dir === 'asc', { menu: await menu(), sortBefore, sortAfter });
  await cdp.setState("{ findSort: { key: 'date', dir: 'desc' } }"); await cdp.settle(150);
  await press('filter-status');
  await press('filter-region');
  m = await menu();
  check('2. opening the REGION menu closes the STATUS menu: one menu at a time', m?.count === 1 && m.column === 'region'
    && (await funnel('status')).expanded === 'false' && (await funnel('region')).expanded === 'true', { m, status: await funnel('status') });

  // REGION: the none key, a tick, All, the close button. (2026-10-19, final review; R13) The menu offers all four regions,
  // Unknown under the none key, whatever the library holds.
  check('2. the REGION menu offers the four regions, Unknown under the none key', JSON.stringify(m.options.map(([key, label]) => [key, label]))
    === JSON.stringify([['filter-region-__unknown__', 'Unknown'], ['filter-region-lumbar', 'Lumbar'], ['filter-region-cervical', 'Cervical'], ['filter-region-full_spine', 'Full spine']]), m.options);
  await tick('region', '__unknown__');
  const unknownRows = await cdp.evaluate("[...document.querySelectorAll('.studies-row .studies-cell-region')].map((c) => [c.textContent, c.classList.contains('studies-cell-unknown')])");
  check('2. ticking Unknown keeps only rows whose REGION reads Unknown', unknownRows.length >= COUNT && unknownRows.every(([text, muted]) => text === 'Unknown' && muted), { count: unknownRows.length });
  fn = await funnel('region');
  check('2. the REGION funnel reads active with count 1', fn.active && fn.count === '1' && fn.title === 'Filtered: Unknown', fn);
  await press('filter-region-all');
  check('2. All clears the column too', (await rows()) === all && !(await funnel('region')).active, await rows());
  await press('filter-region-close');
  check('2. the close button closes the menu and returns focus to the funnel', (await menu()) === null && (await focusedKey()) === 'filter-region', await focusedKey());

  // SUBJECT: the text box in place of the ticks.
  await press('filter-subject');
  m = await menu();
  check('2. the SUBJECT menu holds the text box, focused, and no tick boxes', m?.column === 'subject' && m.options.length === 0
    && (await focusedKey()) === 'filter-subject-text', { m, focus: await focusedKey() });
  await cdp.typeText('rvw-'); await cdp.settle(150);
  await cdp.typeText('nav'); await cdp.settle(150);
  const subjects = await cdp.evaluate("[...document.querySelectorAll('.studies-row .studies-cell-subject')].map((c) => c.textContent)");
  check('2. the SUBJECT box narrows to the subjects that contain its text', subjects.length === 3 && subjects.every((s) => s.startsWith('RVW-NAV-')), subjects);
  const subjectBox = await cdp.evaluate("(() => { const b = document.querySelector('[data-find-key=\"filter-subject-text\"]'); return { value: b.value, focused: document.activeElement === b, caret: b.selectionStart }; })()");
  check('2. the box keeps its focus and caret through the rebuild each keystroke makes', subjectBox.value === 'rvw-nav' && subjectBox.focused && subjectBox.caret === 7, subjectBox);
  fn = await funnel('subject');
  check('2. the SUBJECT funnel reads active with a dot, its title quoting the text', fn.active && fn.count === '•' && fn.title === 'Filtered: "rvw-nav"', fn);
  // Emptied as the keyboard empties it: the box's value cleared, its input event fired.
  await cdp.evaluate("(() => { const b = document.querySelector('[data-find-key=\"filter-subject-text\"]'); b.value = ''; b.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await cdp.settle(150);
  check('2. emptied, the box filters nothing', (await rows()) === all && !(await funnel('subject')).active, await rows());
  await cdp.key('Escape'); await cdp.settle(100);

  // A sort item: Z to A on REGION sorts the list and closes the menu.
  await press('filter-region');
  m = await menu();
  check('2. the REGION menu sorts A to Z and Z to A', JSON.stringify(m?.sorts) === JSON.stringify([['sort-region-asc', 'A to Z'], ['sort-region-desc', 'Z to A']]), m?.sorts);
  await press('sort-region-desc');
  const sorted = (await cdp.state()).findSort;
  const regionOrder = await cdp.evaluate("[...document.querySelectorAll('.studies-row .studies-cell-region')].map((c) => c.textContent)");
  const known = regionOrder.filter((r) => r !== 'Unknown');
  const zToA = known.every((r, i) => i === 0 || known[i - 1].toLowerCase() >= r.toLowerCase())
    && regionOrder.slice(known.length).every((r) => r === 'Unknown');
  check('2. Z to A sorts the list by region descending, Unknown last', sorted.key === 'region' && sorted.dir === 'desc' && known.length > 0 && zToA,
    { sorted, first: regionOrder.slice(0, 2), last: regionOrder.slice(-2) });
  check('2. and closes the menu, focus on the funnel', (await menu()) === null && (await focusedKey()) === 'filter-region', await focusedKey());
  const sortButton = await cdp.evaluate("(() => { const b = document.querySelector('[data-find-key=\"sort-region\"]'); return { active: b.classList.contains('is-active'), mark: b.querySelector('.param-sort-mark').textContent }; })()");
  check('2. the header\'s own sort button reads the new sort', sortButton.active && sortButton.mark === ' ▾', sortButton);
  await cdp.setState("{ findSort: { key: 'date', dir: 'desc' } }"); await cdp.settle(150);

  // The list's previous / next follows the menus: ticked Needs review and Segmented, the arrows step through exactly
  // those rows in the list's order. One demo study is made Needs review for it (a low femoral confidence, in the store
  // only) and restored afterwards.
  demoPatched = await cdp.evaluate(`import('./renderer/store.js').then((m) => {
    const demo = m.getState().studies.find((x) => x.source === 'demo');
    if (!demo) return null;
    m.setState((s) => ({ studies: s.studies.map((x) => (x.id === demo.id ? { ...x, qc: { femoral: { confidence: 0.2 } } } : x)) }));
    return { id: demo.id, qc: demo.qc };
  })`);
  await cdp.settle(150);
  check('2. a demo study reads Needs review for the next steps', Boolean(demoPatched), demoPatched);
  await scrollListTo('top');
  await tick('status', 'rev');
  await tick('status', 'seg');
  await cdp.key('Escape'); await cdp.settle(100);
  const reviewOrder = await cdp.evaluate("[...document.querySelectorAll('.studies-row')].map((r) => ({ id: r.dataset.studyId, badge: r.querySelector('.badge')?.className }))");
  check('2. ticked Needs review and Segmented, the list shows exactly those pills', reviewOrder.length >= 2 && reviewOrder.some((r) => r.badge === 'badge badge-rev')
    && reviewOrder.every((r) => r.badge === 'badge badge-rev' || r.badge === 'badge badge-seg'), reviewOrder);
  await clickRow(reviewOrder[0].id);
  const stepped = [await openId()];
  for (let i = 1; i < reviewOrder.length; i += 1) { await cdp.key('ArrowRight'); await cdp.settle(150); stepped.push(await openId()); }
  await cdp.key('ArrowRight'); await cdp.settle(150);
  const pastEnd = await openId();
  check('2. the arrows step through exactly those rows, in the list\'s order, and stop at the last', JSON.stringify(stepped) === JSON.stringify(reviewOrder.map((r) => r.id))
    && pastEnd === stepped[stepped.length - 1], { stepped, expected: reviewOrder.map((r) => r.id), pastEnd });
  const h2 = await header();
  check('2. the position counts those rows', h2.position === `${reviewOrder.length} / ${reviewOrder.length}`, h2);
  await clickBack();

  // An impossible combination: the Unknown region (unsegmented films only) under Needs review and Segmented.
  await scrollListTo('top');
  await tick('region', '__unknown__');
  await cdp.key('Escape'); await cdp.settle(100);
  const empty = await cdp.evaluate("document.querySelector('.studies-empty')?.textContent ?? null");
  check('2. an impossible combination reads the filters empty copy', (await rows()) === 0 && empty === 'No studies match these filters.', { rows: await rows(), empty });
  const summary = await cdp.evaluate("document.querySelector('.studies-summary').textContent");
  check('2. the summary still counts the whole library', new RegExp(`^${all} STUDIES `).test(summary), summary);
  await press('filter-region'); await press('filter-region-all');
  await press('filter-status'); await press('filter-status-none');
  await cdp.key('Escape'); await cdp.settle(100);
  check('2. All and None bring every row back', (await rows()) === all && JSON.stringify((await cdp.state()).findFilters.status) === '[]'
    && JSON.stringify((await cdp.state()).findFilters.region) === '[]', await rows());
  await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: s.studies.map((x) => (x.id === ${JSON.stringify(demoPatched?.id)} ? { ...x, qc: ${JSON.stringify(demoPatched?.qc ?? null)} } : x)) })))`);
  demoPatched = null;
  await cdp.settle(100);

  // 3. Previous / next, over the rows the list shows under Unsegmented, in the order it shows them (the DOM's own
  // order is the expectation, so the section holds on any profile: the forty injected films, plus whatever unsegmented
  // films earlier suites left, all real films with enabled name fields). The tick goes through the STATUS menu, which
  // Escape then closes: a row click with a menu open would only close the menu.
  await scrollListTo('top');
  await cdp.settle(100);
  await tick('status', 'unseg');
  await cdp.key('Escape'); await cdp.settle(100);
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

  // The region bar's selects yield the arrows (2026-10-19, final review; R14): on a closed select an arrow is Chromium's
  // "pick the next option", whose change event ran changeRegion and wiped the film's result. With focus put on the
  // Region select the way the keyboard leaves it there, ArrowRight navigates and the film's region is untouched.
  const regionOf = (id) => cdp.evaluate(`import('./renderer/store.js').then((m) => { const s = m.getState().studies.find((x) => x.id === ${JSON.stringify(id)}); return s ? { region: s.region ?? null, anteriorSide: s.anteriorSide ?? null } : null; })`);
  const regionBefore = await regionOf(order[0].id);
  const regionFocus = await cdp.evaluate("(() => { const s = document.querySelector('.analysis-region-bar select'); if (!s) return null; s.focus(); return { focused: document.activeElement === s, label: s.getAttribute('aria-label'), value: s.value, index: s.selectedIndex, options: s.options.length, disabled: s.disabled }; })()");
  // The select must have a next option for the key to pick, or the check below would hold whatever the key did.
  check('3. focus is on the enabled Region select, which has a next option', regionFocus?.focused === true && regionFocus.label === 'Spine region'
    && regionFocus.disabled === false && regionFocus.index < regionFocus.options - 1, regionFocus);
  await cdp.key('ArrowRight'); await cdp.settle(200);
  check('3. ArrowRight on the Region select opens the next row', (await openId()) === order[1].id, { now: await openId(), expected: order[1].id });
  const regionAfter = await regionOf(order[0].id);
  check('3. and the film it left keeps its region: the select did not pick its next option', regionBefore !== null
    && JSON.stringify(regionAfter) === JSON.stringify(regionBefore), { regionBefore, regionAfter, select: regionFocus.value });

  // To the last row and no further.
  for (let i = 0; i < total - 1; i += 1) await cdp.key('ArrowRight');
  await cdp.settle(200);
  h = await header();
  check(`3. at the last row: ${total} / ${total}, next disabled`, h.position === `${total} / ${total}` && h.nextDisabled === true && h.nextTitle === 'Last study in the list', h);
  const lastOpen = await openId();
  await cdp.key('ArrowRight'); await cdp.settle(100);
  check('3. ArrowRight at the last row stays put', (await openId()) === lastOpen, await openId());

  // The filter changes under the open film: the position follows it, and a hidden film still has neighbours. The menus
  // are not on this screen, so the ticks are written to the store as the STATUS menu writes them.
  await cdp.setState(statusOnly()); await cdp.settle(150);
  h = await header();
  const whole = await cdp.evaluate(`import('./renderer/data/find.js').then(async (f) => f.findVisible((await import('./renderer/store.js')).getState()).length)`);
  check('3. without the filter the position counts the whole list', h.position === `${whole} / ${whole}` || /^\d+ \/ \d+$/.test(h.position), h);
  await cdp.setState(statusOnly('seg')); await cdp.settle(150);
  h = await header();
  const segCount = await cdp.evaluate(`import('./renderer/data/find.js').then(async (f) => f.findVisible((await import('./renderer/store.js')).getState()).length)`);
  check('3. under Segmented an unsegmented open film reads an en dash over the count', h.position === `\u2013 / ${segCount}`, h);
  await cdp.key('ArrowLeft'); await cdp.settle(150);
  const demoId = await openId();
  check('3. ArrowLeft from a hidden film opens the previous row the filter shows', /^SP-00/.test(demoId), demoId);
  h = await header();
  check('3. and the position is its place among them', h.position === `${segCount} / ${segCount}`, h);

  // Review-then-next: under the three results nobody has marked, ticked together (Segmented, Needs review,
  // Hand-placed; a tick no film shows keeps nothing, and the others still OR with it), the open film marked reviewed
  // leaves the list and its next still works.
  await cdp.setState(statusOnly('seg', 'rev', 'hand')); await cdp.settle(150);
  await cdp.key('ArrowLeft'); await cdp.settle(150);
  const midId = await openId();
  const unrevCount = await cdp.evaluate(`import('./renderer/data/find.js').then(async (f) => f.findVisible((await import('./renderer/store.js')).getState()).length)`);
  await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: s.studies.map((x) => (x.id === ${JSON.stringify(midId)} ? { ...x, reviewedAt: '2026-10-19T10:00:00.000Z' } : x)) })))`);
  await cdp.settle(150);
  h = await header();
  check('3. marked reviewed, the open film leaves the Segmented / Needs review / Hand-placed list', h.position === `\u2013 / ${unrevCount - 1}`, h);
  await cdp.key('ArrowRight'); await cdp.settle(150);
  check('3. ArrowRight from the reviewed film opens the next row those ticks keep', (await openId()) === demoId, { midId, now: await openId() });
  await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: s.studies.map((x) => (x.id === ${JSON.stringify(midId)} ? { ...x, reviewedAt: null } : x)) })))`);

  // Edit mode refuses the keys and disables the buttons.
  const beforeEdit = await openId();
  await cdp.setState('{ editing: true }'); await cdp.settle(100);
  h = await header();
  check('3. in edit mode both buttons are disabled with the editing title', h.prevDisabled === true && h.nextDisabled === true && h.nextTitle === 'Finish editing before moving to another study', h);
  await cdp.key('ArrowRight'); await cdp.settle(100);
  check('3. ArrowRight in edit mode does not navigate', (await openId()) === beforeEdit, await openId());
  await cdp.setState('{ editing: false }'); await cdp.settle(100);

  // The queue reviewed to its end (2026-10-19, final review; R13): every film the three ticks keep is marked reviewed,
  // through the store as above. The ticks stay -- the STATUS menu still offers what they name -- so the list is empty
  // rather than the whole library, the header reads – / 0 and neither arrow goes anywhere. The marks are put back after,
  // the ticks cleared through the menu, and the film reopened for the steps below.
  await cdp.setState(statusOnly('seg', 'rev', 'hand')); await cdp.settle(150);
  const queue3 = await cdp.evaluate(`import('./renderer/store.js').then(async (m) => {
    const f = await import('./renderer/data/find.js');
    const kept = f.findVisible(m.getState()).map((x) => [x.id, x.reviewedAt ?? null]);
    const ids = kept.map(([id]) => id);
    m.setState((s) => ({ studies: s.studies.map((x) => (ids.includes(x.id) ? { ...x, reviewedAt: '2026-10-19T10:00:00.000Z' } : x)) }));
    return kept;
  })`);
  await cdp.settle(150);
  h = await header();
  check('3. the last of the queue marked reviewed: the position reads – / 0 and both arrows are disabled', queue3.length > 0
    && h.position === '– / 0' && h.prevDisabled === true && h.nextDisabled === true, { queued: queue3.length, h });
  const stuck = await openId();
  await cdp.key('ArrowRight'); await cdp.settle(150);
  await cdp.key('ArrowLeft'); await cdp.settle(150);
  check('3. and the arrow keys stay on the open film', (await openId()) === stuck, { stuck, now: await openId() });
  check('3. the store still holds the three ticks', JSON.stringify((await cdp.state()).findFilters.status) === '["seg","rev","hand"]', (await cdp.state()).findFilters.status);
  await clickBack();
  const empty3 = await cdp.evaluate("document.querySelector('.studies-empty')?.textContent ?? null");
  fn = await funnel('status');
  check('3. back on the list: no rows, the filters empty copy, and the STATUS funnel still reads its three ticks', (await rows()) === 0
    && empty3 === 'No studies match these filters.' && fn.active && fn.count === '3', { rows: await rows(), empty3, fn });
  await cdp.evaluate(`import('./renderer/store.js').then((m) => { const was = new Map(${JSON.stringify(queue3)});
    m.setState((s) => ({ studies: s.studies.map((x) => (was.has(x.id) ? { ...x, reviewedAt: was.get(x.id) } : x)) })); return true; })`);
  await cdp.settle(150);
  await press('filter-status'); await press('filter-status-none');
  await cdp.key('Escape'); await cdp.settle(100);
  check('3. the marks put back and the ticks cleared, every row is back', (await rows()) === all && (await cdp.state()).findFilters.status.length === 0, await rows());
  await cdp.evaluate(`document.querySelector('.studies-row[data-study-id="${stuck}"]')?.scrollIntoView({ block: 'center' })`);
  await cdp.settle(100);
  check('3. the film reopens for the steps below', (await clickRow(stuck)) && (await openId()) === stuck && (await cdp.state()).screen === 'analysis', { stuck, now: await openId() });

  // Back after a run of arrows lands on the film last open, with the filter still showing.
  await cdp.setState(statusOnly('unseg')); await cdp.settle(100);
  for (let i = 0; i < 20; i += 1) await cdp.key('ArrowRight');
  await cdp.settle(150);
  const lastSeen = await openId();
  await clickBack();
  const landed = await rowPlace(lastSeen);
  sc = await scrolls();
  check('3. Back lands with the film last open in view, the document unscrolled', landed && landed.inView && sc.docScrollTop === 0, { lastSeen, landed, sc });
  const shown = await funnel('status');
  check('3. the STATUS funnel still reads the tick after the trip', shown.active && shown.count === '1' && shown.title === 'Filtered: Unsegmented', shown);
  await openMenu('status');
  const tickedKeys = (await menu())?.options.filter(([, , on]) => on).map(([key]) => key);
  check('3. and its menu shows Unsegmented ticked', JSON.stringify(tickedKeys) === '["filter-status-unseg"]', tickedKeys);
  check('3. no page errors', cdp.errors.length === 0, cdp.errors);
  await press('filter-status-none');
  await cdp.key('Escape'); await cdp.settle(100);

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
  // (2026-10-19, final review) The header's meta line reads the region as the REGION cell does: an Auto detect film no
  // run has placed is UNKNOWN there, not AUTO; its view is Unknown too.
  const meta4 = await cdp.evaluate("document.querySelector('.analysis-header > .analysis-meta:not(.analysis-editing)')?.textContent ?? null");
  check('4. the header meta line reads UNKNOWN for the undetected Auto detect film', typeof meta4 === 'string' && meta4.startsWith('UNKNOWN · UNKNOWN · '), meta4);
  // (2026-10-19, final review) The word Unknown typed in the drawer's VIEW cell is the Unknown view, null, not the word.
  // The film is given a view first, through the store, so the null is the typed word's doing.
  await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: s.studies.map((x) => (x.id === ${JSON.stringify(injectedId(0))} ? { ...x, view: 'Standing lateral' } : x)) })))`);
  await cdp.settle(150);
  const viewCell = await cdp.evaluate("(() => { const e = document.querySelector('.clinical-cell[data-kind=\"study\"][data-field=\"view\"]'); if (!e) return null; e.focus(); e.select(); return { value: e.value, focused: document.activeElement === e, disabled: e.disabled }; })()");
  await cdp.typeText('Unknown');
  await cdp.key('Tab'); await cdp.settle(200);
  const typedView = await cdp.evaluate(`import('./renderer/store.js').then((m) => { const s = m.getState().studies.find((x) => x.id === ${JSON.stringify(injectedId(0))}); return s ? { view: s.view } : null; })`);
  check('4. Unknown typed in the drawer\'s VIEW cell stores null, the Unknown view', viewCell?.value === 'Standing lateral' && viewCell.focused === true
    && typedView !== null && typedView.view === null, { viewCell, typedView });
  await clickBack();
  await cdp.setState('{ query: "" }'); await cdp.settle(100);

  // Reopened from the list, the cached film is re-handed at once, strip and all.
  await scrollListTo('top');
  check('4. SP-9000 reopens', await clickRow('SP-9000'), 'SP-9000');
  const again = await stage();
  check('4. reopened, SP-9000 shows the strip at once from the cache', again.strip === true && again.base && again.base[0] === 157, again);
  await clickBack();
  check('4. no page errors', cdp.errors.length === 0, cdp.errors);

  // 5. The REGION column after a run (2026-10-19, header filters; spec section 4). SP-9000 is unsegmented with its bytes
  // parked (section 4), so its REGION cell reads Unknown, muted. One real run of the sample film, through
  // run-and-wait.js as the other suites run it, and the cell reads Lumbar the moment the run is done: the completion
  // write sets geometry.region, and a result with none is lumbar (data/cervical.js regionKey). The REGION menu offers
  // Lumbar (it offers all four regions since the final review's R13; the tick below is what shows SP-9000 in it).
  const regionCell = (id) => cdp.evaluate(`(() => { const c = document.querySelector('.studies-row[data-study-id="${id}"] .studies-cell-region'); return c ? { text: c.textContent, muted: c.classList.contains('studies-cell-unknown') } : null; })()`);
  await scrollListTo('top');
  await cdp.settle(100);
  const before5 = await regionCell('SP-9000');
  check('5. before its run SP-9000 reads Unknown in its REGION cell, muted', before5 && before5.text === 'Unknown' && before5.muted === true, before5);
  check('5. SP-9000 opens', await clickRow('SP-9000'), 'SP-9000');
  const ran = await cdp.evaluate(fs.readFileSync(path.join(__dirname, 'run-and-wait.js'), 'utf8'));
  check('5. the run finishes with measurements', ran.result === 'done' && ran.measurements != null, { result: ran.result, seconds: ran.seconds, toast: ran.toast });
  await clickBack();
  await scrollListTo('top');
  await cdp.settle(150);
  const after5 = await regionCell('SP-9000');
  check('5. after the run SP-9000 reads Lumbar in its REGION cell, no longer muted', after5 && after5.text === 'Lumbar' && after5.muted === false, after5);
  await openMenu('region');
  m = await menu();
  check('5. the REGION menu offers Lumbar under its key', m?.column === 'region' && m.options.some(([key, label]) => key === 'filter-region-lumbar' && label === 'Lumbar'), m?.options);
  const rows5 = await rows();
  await tick('region', 'lumbar');
  const lumbarRows = await cdp.evaluate("[...document.querySelectorAll('.studies-row')].map((r) => [r.dataset.studyId, r.querySelector('.studies-cell-region').textContent])");
  check('5. ticking Lumbar keeps only rows whose REGION reads Lumbar, SP-9000 among them and the unsegmented films gone',
    lumbarRows.length > 0 && lumbarRows.every(([, text]) => text === 'Lumbar') && lumbarRows.some(([id]) => id === 'SP-9000') && !lumbarRows.some(([id]) => INJECTED.test(id)), lumbarRows.slice(0, 5));
  fn = await funnel('region');
  check('5. the REGION funnel reads active with count 1, its title naming Lumbar', fn.active && fn.count === '1' && fn.title === 'Filtered: Lumbar', fn);
  await press('filter-region-all');
  await cdp.key('Escape'); await cdp.settle(100);
  check('5. All brings every row back', (await rows()) === rows5, { rows: await rows(), rows5 });
  check('5. no page errors', cdp.errors.length === 0, cdp.errors);

  // 6. The import table's VIEW selects default to Unknown (2026-10-19, header filters; spec 5.1). The folder table is
  // seeded the way smoke-seeding.mjs seeds it, from folderRows over a file list that points nowhere: only the `flexion`
  // folder names a view, so its VIEW select reads Flexion lateral and the other folders' read Unknown, where they once
  // all read Standing lateral. The Unknown option's value is the empty string and the row model says null.
  const wsRoot = 'C:\\smoke\\reviewer-ws';
  const wsFiles = ['pre-op\\r1.png', 'pre-op\\r2.png', 'post-op\\r3.png', 'flexion\\r4.png'].map((f) => `${wsRoot}\\${f}`);
  await cdp.evaluate(`(async () => {
    const store = await import('./renderer/store.js');
    const seeding = await import('./renderer/data/seeding.js');
    const files = ${JSON.stringify(wsFiles)};
    store.setState({ wsFolder: ${JSON.stringify(wsRoot)}, wsFiles: files, wsFolderRows: seeding.folderRows(files, ${JSON.stringify(wsRoot)}), wsCsv: null, wsCsvHeaders: [], wsCsvRows: [], wsMapping: [] });
    store.setState({ screen: 'workspace' });
    return true;
  })()`);
  await cdp.settle(200);
  const table6 = await cdp.evaluate(`(() => {
    const selected = (s) => (s ? { value: s.value, text: s.options[s.selectedIndex]?.textContent ?? null } : null);
    return {
      rows: [...document.querySelectorAll('.workspace-folders tbody tr[data-ws-folder]')].map((r) => ({ folder: r.dataset.wsFolder, view: selected(r.querySelector('[data-ws-key^="view:"]')),
        options: [...(r.querySelector('[data-ws-key^="view:"]')?.options ?? [])].map((o) => o.textContent) })),
      all: [...(document.querySelector('[data-ws-key="all-view"]')?.options ?? [])].map((o) => o.textContent),
    };
  })()`);
  const VIEW_CHOICES = ['Unknown', 'Standing lateral', 'Supine lateral', 'Prone lateral', 'Flexion lateral', 'Extension lateral'];
  const viewOf = (folder) => table6.rows.find((r) => r.folder === folder)?.view;
  check('6. the folder table lists the three folders', JSON.stringify(table6.rows.map((r) => r.folder).sort()) === JSON.stringify(['flexion', 'post-op', 'pre-op']), table6.rows.map((r) => r.folder));
  check('6. the pre-op and post-op VIEW selects default to Unknown, the empty value',
    ['pre-op', 'post-op'].every((f) => viewOf(f)?.value === '' && viewOf(f)?.text === 'Unknown'), table6.rows);
  check('6. the flexion folder\'s name still sets its view', viewOf('flexion')?.value === 'Flexion lateral' && viewOf('flexion')?.text === 'Flexion lateral', viewOf('flexion'));
  check('6. each VIEW select offers Unknown first, then the five suggestions', table6.rows.every((r) => JSON.stringify(r.options) === JSON.stringify(VIEW_CHOICES)), table6.rows.map((r) => r.options));
  check('6. the Set all VIEW select offers Unknown after its placeholder', JSON.stringify(table6.all) === JSON.stringify(['Set all\u2026', ...VIEW_CHOICES]), table6.all);
  const wsRowsInStore = (await cdp.state()).wsFolderRows.map((r) => [r.folder, r.view]);
  check('6. the store\'s folder rows hold null for the folders that name no view', JSON.stringify(wsRowsInStore.sort()) === JSON.stringify([['flexion', 'Flexion lateral'], ['post-op', null], ['pre-op', null]]), wsRowsInStore);
  await cdp.setState('{ wsFolder: null, wsFiles: [], wsFolderRows: [], wsCsv: null, wsCsvHeaders: [], wsCsvRows: [], wsMapping: [], screen: "studies" }');
  await cdp.settle(150);
  check('6. no page errors', cdp.errors.length === 0, cdp.errors);

  // 7. (2026-11-16, study flags, Task 9; spec 3 and 4.4) The FLAGS block on the Analysis screen: `div.analysis-flags` between
  // the actions row and the comment block, its editor on `data-flags-key`, and what it does to the rest of the screen.
  // Films: three of the injected records (SP-9510 and SP-9511 for the editor, SP-9512 as the neighbour the filter and the
  // arrows move to) and SP-9000, segmented by section 5, for the checks that need a measurement row, the Similar tab and
  // edit mode. Flags go into the store where a check needs a starting library; everything under test is driven with
  // trusted clicks and keys.
  {
    const errorsBefore7 = cdp.errors.length;
    // The editor closes on blur, so the page must believe it has focus however the operating system's windows move during a long
    // run: two runs in the documented order read 5 and 3 failures (the editor did not stay open) while the same section alone passed.
    await cdp.send('Page.bringToFront');
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    const [FA, FB, FC] = [injectedId(10), injectedId(11), injectedId(12)];
    const SEG = 'SP-9000';
    const NO_FILTERS = '{ subject: "", region: [], view: [], workspace: [], folder: [], status: [], flags: [], flagsMatch: "any" }';
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const putFlags = (map) => cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: s.studies.map((x) => (Object.prototype.hasOwnProperty.call(${JSON.stringify(map)}, x.id) ? { ...x, flags: ${JSON.stringify(map)}[x.id] } : x)) })))`);
    const flagsOf = (id) => cdp.evaluate(`import('./renderer/store.js').then((m) => m.getState().studies.find((x) => x.id === ${JSON.stringify(id)})?.flags ?? null)`);
    const resetList = () => cdp.setState(`{ screen: "studies", openId: null, query: "", editing: false, tab: "meas", selectedLevel: null, deletingStudies: false, findSort: { key: "date", dir: "desc" }, findFilters: ${NO_FILTERS}, paramSelected: [] }`);
    const openFilm = async (id) => {
      await resetList();
      await cdp.settle(150);
      await cdp.evaluate(`document.querySelector('.studies-row[data-study-id="${id}"]')?.scrollIntoView({ block: 'center' })`);
      await cdp.settle(100);
      const ok = await clickRow(id);
      await cdp.settle(250);
      return ok && (await openId()) === id;
    };
    const clickSel = async (selector) => {
      await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'nearest' })`);
      await cdp.settle(60);
      const r = await cdp.rect(selector);
      if (r) await cdp.click(r.cx, r.cy);
      await cdp.settle(250);
      return Boolean(r);
    };
    // The block as the page shows it.
    const blockNow = () => cdp.evaluate(`(() => {
      const b = document.querySelector('.analysis-flags');
      if (!b) return null;
      const input = b.querySelector('[data-flags-key="analysis-flags-input"]');
      const add = b.querySelector('[data-flags-key="analysis-flags-add"]');
      const options = [...b.querySelectorAll('.flag-option')];
      const comment = document.querySelector('.analysis-comment');
      return {
        hidden: b.classList.contains('is-hidden') || getComputedStyle(b).display === 'none', label: b.querySelector('.analysis-comment-label')?.textContent ?? null,
        chips: [...b.querySelectorAll('.flag-chip-text')].map((c) => c.textContent),
        add: add ? { text: add.textContent, disabled: add.disabled, title: add.title } : null,
        editors: b.querySelectorAll('.flag-editor').length, input: input ? { value: input.value, focused: document.activeElement === input, start: input.selectionStart, end: input.selectionEnd } : null,
        options: options.map((o) => o.textContent), highlighted: options.map((o, i) => (o.classList.contains('is-active') ? i : -1)).filter((i) => i >= 0),
        active: document.activeElement?.getAttribute('data-flags-key') ?? null,
        beforeComment: Boolean(comment) && Boolean(b.compareDocumentPosition(comment) & Node.DOCUMENT_POSITION_FOLLOWING),
      };
    })()`);
    const openEditor = async () => { await clickSel('[data-flags-key="analysis-flags-add"]'); };
    const screenNow = async () => { const s = await cdp.state(); return { screen: s.screen, openId: s.openId }; };

    await resetList();   // its own starting list: no search, sort, filter or tick left by an earlier section or suite
    await cdp.settle(150);
    // 7.1 A real film with no flags shows the block on both tabs; the comment block below it is untouched.
    await putFlags({ [FA]: [], [FB]: ['bflag'], [FC]: [] });
    await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: s.studies.map((x) => (x.id === ${JSON.stringify(FB)} ? { ...x, labelComment: 'Cage at L4-5, screws L4-S1.' } : x)) })))`);
    check('7.1 the film opens', await openFilm(FA), await screenNow());
    let blk = await blockNow();
    check('7.1 a real film with no flags shows FLAGS and a lone "+ Add flag" button on the Measurements tab',
      Boolean(blk) && blk.hidden === false && blk.label === 'FLAGS' && same(blk.chips, []) && blk.add?.text === '+ Add flag' && blk.add.disabled === false && blk.editors === 0, blk);
    await cdp.setState('{ tab: "sim" }');
    await cdp.settle(200);
    blk = await blockNow();
    check('7.1 and on the Find similar tab', Boolean(blk) && blk.hidden === false && blk.add?.text === '+ Add flag', blk);
    await cdp.setState('{ tab: "meas" }');
    check('7.1 the block sits above the comment block', blk?.beforeComment === true, blk);
    check('7.1 the film opens with a comment', await openFilm(FB), await screenNow());
    const comment1 = await cdp.evaluate(`(() => { const c = document.querySelector('.analysis-comment'); return c ? { hidden: c.classList.contains('is-hidden') || getComputedStyle(c).display === 'none', text: c.textContent } : null; })()`);
    blk = await blockNow();
    check('7.1 a film with a comment shows both: its flags and, unchanged, its comment',
      Boolean(comment1) && comment1.hidden === false && comment1.text.includes('Cage at L4-5, screws L4-S1.') && Boolean(blk) && same(blk.chips, ['bflag']) && blk.beforeComment === true, { comment1, blk });

    // 7.2 Two flags added, a click on the panel saves them, and the Find row shows them.
    await openFilm(FA);
    await openEditor();
    blk = await blockNow();
    check('7.2 + Add flag opens the editor with focus in the box', Boolean(blk) && blk.editors === 1 && blk.input?.focused === true, blk);
    await cdp.typeText('f-one, f-two');
    await cdp.settle(250);
    blk = await blockNow();
    check('7.2 typing "f-one, f-two" makes two chips and empties the box', same(blk.chips, ['f-one', 'f-two']) && blk.input?.value === '' && same(await flagsOf(FA), []), blk);
    await clickSel('.analysis-flags .analysis-comment-label');
    blk = await blockNow();
    check('7.2 a click elsewhere on the panel saves both and closes the editor',
      same(await flagsOf(FA), ['f-one', 'f-two']) && blk.editors === 0 && same(blk.chips, ['f-one', 'f-two']), { stored: await flagsOf(FA), blk });
    await clickBack();
    const cell2 = await cdp.evaluate(`[...document.querySelectorAll('.studies-row[data-study-id="${FA}"] .studies-cell-flags .flag-chip-text')].map((c) => c.textContent)`);
    check('7.2 back on the Find list the film\'s FLAGS cell shows both', same(cell2, ['f-one', 'f-two']), cell2);

    // 7.3 Enter and the highlight; Escape.
    await openFilm(FA);
    await openEditor();
    await cdp.typeText('e-one,');
    await cdp.settle(200);
    blk = await blockNow();
    check('7.3 with the box empty nothing is highlighted', same(blk.highlighted, []) && blk.input?.value === '', blk);
    await cdp.key('Enter');
    await cdp.settle(250);
    blk = await blockNow();
    check('7.3 Enter in the empty box saves the draft and closes the editor, focus on + Add flag',
      same(await flagsOf(FA), ['f-one', 'f-two', 'e-one']) && blk.editors === 0 && blk.active === 'analysis-flags-add', { stored: await flagsOf(FA), blk });
    await openEditor();
    await cdp.typeText('bfl');
    await cdp.settle(250);
    blk = await blockNow();
    check('7.3 typing highlights the first suggestion (bflag, in use on another film) before Create',
      same(blk.options, ['bflag', 'Create "bfl"']) && same(blk.highlighted, [0]), blk);
    await cdp.key('Enter');
    await cdp.settle(250);
    blk = await blockNow();
    check('7.3 Enter with text typed adds the highlighted suggestion, the editor still open and nothing written yet',
      blk.editors === 1 && blk.chips.includes('bflag') && blk.input?.value === '' && !(await flagsOf(FA)).includes('bflag'), { blk, stored: await flagsOf(FA) });
    await cdp.key('Escape');
    await cdp.settle(250);
    blk = await blockNow();
    const where3 = await screenNow();
    check('7.3 Escape closes the box without saving, and the screen is still Analysis on the same film',
      blk.editors === 0 && !(await flagsOf(FA)).includes('bflag') && where3.screen === 'analysis' && where3.openId === FA && blk.active === 'analysis-flags-add', { blk, where3, stored: await flagsOf(FA) });

    // 7.4 The arrow keys: in the box they move the caret; after it closes, Right steps on as before.
    await openEditor();
    await cdp.typeText('abc');
    await cdp.settle(200);
    const hBefore = await header();
    await cdp.key('ArrowLeft'); await cdp.key('ArrowLeft'); await cdp.settle(150);
    blk = await blockNow();
    const mid4 = { start: blk.input?.start, end: blk.input?.end, open: await openId(), h: await header() };
    check('7.4 Left twice in the box moves the caret to 1 and does not change the open film or the position readout',
      mid4.start === 1 && mid4.end === 1 && mid4.open === FA && mid4.h.position === hBefore.position, { mid4, hBefore: hBefore.position });
    await cdp.key('ArrowRight'); await cdp.settle(150);
    blk = await blockNow();
    check('7.4 Right moves the caret on to 2 and the film stays', blk.input?.start === 2 && (await openId()) === FA && (await header()).position === hBefore.position, { start: blk.input?.start, open: await openId() });
    await cdp.key('Escape');
    await cdp.settle(200);
    const place4 = await cdp.evaluate(`import('./renderer/data/find.js').then(async (f) => { const s = (await import('./renderer/store.js')).getState(); return f.findNeighbour(s, ${JSON.stringify(FA)}, 1)?.id ?? null; })`);
    await cdp.key('ArrowRight'); await cdp.settle(250);
    check('7.4 with the box closed Right steps to the next film as before', place4 !== null && (await openId()) === place4, { expected: place4, now: await openId() });

    // 7.5 One click on a control the block's repaint could move or replace: it must save the draft AND receive its click.
    check('7.5 the segmented film opens on Measurements', await openFilm(SEG), await screenNow());
    await cdp.setState('{ tab: "meas", selectedLevel: null }');
    await putFlags({ [SEG]: [] });
    await cdp.settle(200);
    const rowKey = 'PI';
    await openEditor();
    await cdp.typeText('sw1, sw2');
    await cdp.settle(250);
    // The suggestion list hangs over the left of the rows under the block (it is placed in the block), so the row is pressed at
    // its right end, where nothing covers it.
    await cdp.evaluate(`document.querySelector('.meas-row[data-row-key="${rowKey}"]')?.scrollIntoView({ block: 'nearest' })`);
    const rowRect = await cdp.rect(`.meas-row[data-row-key="${rowKey}"]`);
    if (rowRect) await cdp.click(rowRect.left + rowRect.width - 14, rowRect.cy);
    await cdp.settle(250);
    const sel5 = (await cdp.state()).selectedLevel;
    blk = await blockNow();
    check('7.5 with two flags in the draft, ONE click on a measurement row BELOW the block saves both AND selects the row',
      same(await flagsOf(SEG), ['sw1', 'sw2']) && blk.editors === 0 && sel5 === 'PI', { stored: await flagsOf(SEG), editors: blk.editors, selectedLevel: sel5 });
    await cdp.setState('{ selectedLevel: null }');
    await openEditor();
    await cdp.typeText('sw3, sw4');
    await cdp.settle(250);
    await clickSel('.analysis-tab:last-child');
    check('7.5 with two more flags in the draft, ONE click on the Find similar tab ABOVE the block saves both AND switches the tab',
      same(await flagsOf(SEG), ['sw1', 'sw2', 'sw3', 'sw4']) && (await cdp.state()).tab === 'sim', { stored: await flagsOf(SEG), tab: (await cdp.state()).tab });
    await cdp.setState('{ tab: "meas" }');
    await cdp.settle(200);
    await openEditor();
    await cdp.typeText('sw5, sw6');
    await cdp.settle(250);
    const nextTarget = await cdp.evaluate(`import('./renderer/data/find.js').then(async (f) => { const s = (await import('./renderer/store.js')).getState(); return f.findNeighbour(s, ${JSON.stringify(SEG)}, 1)?.id ?? null; })`);
    await clickSel('.analysis-nav-next');
    check('7.5 with two more flags in the draft, ONE click on the header\'s Next button ABOVE the block saves both AND opens the next film',
      same(await flagsOf(SEG), ['sw1', 'sw2', 'sw3', 'sw4', 'sw5', 'sw6']) && nextTarget !== null && (await openId()) === nextTarget, { stored: await flagsOf(SEG), nextTarget, now: await openId() });

    // 7.6 Wrong-film safety: a draft on one film never lands on the film opened next without a mouse blur.
    await openFilm(FA);
    const storedA6 = await flagsOf(FA);
    const storedB6 = await flagsOf(FB);
    await openEditor();
    await cdp.typeText('draftA,');
    await cdp.settle(200);
    check('7.6 the draft is in the open editor', same((await blockNow()).chips, [...storedA6, 'draftA']), await blockNow());
    await cdp.setState(`{ openId: ${JSON.stringify(FB)} }`);
    await cdp.settle(300);
    blk = await blockNow();
    check('7.6 the other film shows its own flags at rest, no editor and none of the first film\'s draft',
      (await openId()) === FB && blk.editors === 0 && same(blk.chips, [...storedB6]) && !blk.chips.includes('draftA'), blk);
    check('7.6 neither film\'s flags changed in the store', same(await flagsOf(FA), storedA6) && same(await flagsOf(FB), storedB6), { a: await flagsOf(FA), b: await flagsOf(FB) });
    await cdp.setState(`{ openId: ${JSON.stringify(FA)} }`);
    await cdp.settle(300);
    blk = await blockNow();
    check('7.6 back on the first film the draft is gone: at rest, its saved flags only', blk.editors === 0 && same(blk.chips, [...storedA6]) && same(await flagsOf(FA), storedA6), blk);

    // 7.7 Edit mode. Through the store (no mouse blur), the draft is discarded and nothing is written; through the real
    // Edit button the press blurs the box first, which saves the draft as any click elsewhere does. DONE brings it back.
    check('7.7 the segmented film opens', await openFilm(SEG), await screenNow());
    const storedSeg7 = await flagsOf(SEG);
    await openEditor();
    await cdp.typeText('estore,');
    await cdp.settle(200);
    await cdp.setState('{ editing: true }');
    await cdp.settle(300);
    blk = await blockNow();
    check('7.7 edit mode started with a draft open (through the store): the block is hidden and no flag was written',
      blk.hidden === true && same(await flagsOf(SEG), storedSeg7), { hidden: blk.hidden, stored: await flagsOf(SEG) });
    await cdp.setState('{ editing: false }');
    await cdp.settle(300);
    blk = await blockNow();
    check('7.7 leaving edit mode brings the block back at rest, the discarded draft not resurrected', blk.hidden === false && blk.editors === 0 && !blk.chips.includes('estore'), blk);
    await openEditor();
    await cdp.typeText('eclick,');
    await cdp.settle(200);
    await clickSel('.viewer-tool[aria-label="Edit segmentation"]');
    await cdp.settle(300);
    blk = await blockNow();
    const editing7 = (await cdp.state()).editing;
    check('7.7 starting level editing with the real button while a draft is open hides the block', editing7 === true && blk.hidden === true, { editing7, hidden: blk.hidden });
    check('7.7 and that press saved the draft, as any click elsewhere does (nothing is lost)', (await flagsOf(SEG)).includes('eclick'), await flagsOf(SEG));
    const doneRect = await cdp.evaluate(`(() => { const b = [...document.querySelectorAll('.viewer-editbar button')].find((x) => x.textContent.trim() === 'DONE'); if (!b) return null; const r = b.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()`);
    if (doneRect) await cdp.click(doneRect.cx, doneRect.cy);
    await cdp.settle(500);
    blk = await blockNow();
    check('7.7 after DONE the block is back at rest', (await cdp.state()).editing === false && blk.hidden === false && blk.editors === 0 && blk.add?.text === '+ Add flag', { editing: (await cdp.state()).editing, blk });
    await putFlags({ [SEG]: [] });

    // 7.8 The refusal.
    await openFilm(FA);
    await cdp.setState('{ deletingStudies: true }');
    await cdp.settle(300);
    blk = await blockNow();
    await clickSel('[data-flags-key="analysis-flags-add"]');
    const refused8 = await blockNow();
    await cdp.setState('{ deletingStudies: false }');
    await cdp.settle(300);
    check('7.8 during a bulk delete + Add flag is disabled with the refusal sentence as its title, and pressing it opens nothing',
      blk.add?.disabled === true && blk.add.title.includes('Wait for the delete to finish.') && refused8.editors === 0, { add: blk.add, editors: refused8.editors });
    blk = await blockNow();
    check('7.8 and when the delete ends the button is enabled again', blk.add?.disabled === false, blk.add);

    // 7.9 A flag filter on the list that the open film stops matching: the position readout follows, as it does after Mark
    // reviewed under a STATUS filter, and Next still steps on.
    await putFlags({ [FA]: ['f-one'], [FB]: [], [FC]: ['f-one'] });
    await cdp.setState('{ screen: "studies", openId: null, query: "", findSort: { key: "date", dir: "asc" } }');
    await cdp.setState(`{ findFilters: { subject: "", region: [], view: [], workspace: [], folder: [], status: [], flags: ["f-one"], flagsMatch: "any" } }`);
    await cdp.settle(250);
    const listIds9 = await cdp.evaluate("[...document.querySelectorAll('.studies-row')].map((r) => r.dataset.studyId)");
    check('7.9 under the f-one filter the list holds exactly the two films that hold it', same([...listIds9].sort(), [FA, FC].sort()), listIds9);
    await cdp.evaluate(`document.querySelector('.studies-row[data-study-id="${FA}"]')?.scrollIntoView({ block: 'center' })`);
    await cdp.settle(100);
    check('7.9 the film opens from the filtered list', (await clickRow(FA)) && (await openId()) === FA, await openId());
    const posBefore = (await header()).position;
    check('7.9 its position reads its place among the two', /^[12] \/ 2$/.test(posBefore), posBefore);
    await openEditor();
    await clickSel(`[data-flags-key="analysis-flags-remove-0"]`);
    await cdp.key('Enter');
    await cdp.settle(300);
    h = await header();
    check('7.9 removing f-one here leaves the film: the position reads an en dash over the one film left, and Next is enabled',
      same(await flagsOf(FA), []) && h.position === '– / 1' && h.nextDisabled === false, { stored: await flagsOf(FA), h });
    await cdp.key('ArrowRight'); await cdp.settle(250);
    check('7.9 Right from the film that left steps to the film the filter still shows', (await openId()) === FC, await openId());
    h = await header();
    check('7.9 whose position reads 1 / 1', h.position === '1 / 1', h);

    // 7.10 (2026-11-16, the final review: I2, M3 with ruling 6 as amended, M2) The block's editor says why it refuses text
    // that cannot be a flag and keeps a refused piece in the box; Enter adds typed text when nothing is highlighted; the
    // arrows keep the highlighted suggestion inside the list's visible box.
    const LONG10 = 'r'.repeat(41);
    const hint10 = () => cdp.evaluate(`(() => { const h = document.querySelector('.analysis-flags .flag-popup-hint'); return h ? { text: h.textContent, refused: h.classList.contains('is-refused'), colour: getComputedStyle(h).color } : null; })()`);
    await putFlags({ [FA]: [], [FB]: [], [FC]: [] });
    check('7.10 the film opens', await openFilm(FB), await screenNow());
    await openEditor();
    const plain10 = await hint10();
    await cdp.typeText(LONG10);
    await cdp.settle(250);
    const long10 = await hint10();
    blk = await blockNow();
    check('7.10 (I2) 41 characters in the box: the hint reads 40 CHARACTERS AT MOST in another colour, nothing is offered',
      plain10?.text === 'ENTER ADDS · ESC CANCELS' && long10?.text === '40 CHARACTERS AT MOST' && long10.refused === true && long10.colour !== plain10.colour
      && same(blk.options, []) && blk.input?.value === LONG10, { plain10, long10, options: blk.options });
    await cdp.typeText(',');
    await cdp.settle(250);
    blk = await blockNow();
    check('7.10 (I2) a comma after it keeps the refused text in the box, with the hint, and adds nothing',
      blk.editors === 1 && same(blk.chips, []) && blk.input?.value === LONG10 && (await hint10())?.text === '40 CHARACTERS AT MOST', { blk, hint: await hint10() });
    await cdp.key('Escape');
    await cdp.settle(250);
    await openEditor();
    await cdp.typeText(`kept10, ${LONG10}`);
    await cdp.settle(250);
    blk = await blockNow();
    check('7.10 (I2) pasting "kept10, <41 characters>" makes one chip and leaves the refused piece in the box',
      same(blk.chips, ['kept10']) && blk.input?.value === LONG10, blk);
    await cdp.key('Escape');
    await cdp.settle(250);
    await openEditor();
    await cdp.typeText('typed10');
    await cdp.settle(200);
    await cdp.key('ArrowUp');
    await cdp.settle(200);
    const none10 = await blockNow();
    await cdp.key('Enter');
    await cdp.settle(250);
    blk = await blockNow();
    check('7.10 (ruling 6 amended) Enter with text and nothing highlighted adds the typed text, the editor still open and nothing written yet',
      same(none10.highlighted, []) && blk.editors === 1 && same(blk.chips, ['typed10']) && blk.input?.value === '' && same(await flagsOf(FB), []), { none10: none10.highlighted, blk });
    await cdp.typeText('TYPED10');
    await cdp.settle(200);
    await cdp.key('Enter');
    await cdp.settle(250);
    blk = await blockNow();
    check('7.10 (ruling 6 amended) Enter on text naming a flag the film already holds does nothing', blk.editors === 1 && same(blk.chips, ['typed10']) && blk.input?.value === 'TYPED10', blk);
    await cdp.key('Escape');
    await cdp.settle(250);
    const many10 = Array.from({ length: 12 }, (_, i) => `m${String(i + 1).padStart(2, '0')}`);
    await putFlags({ [FA]: many10, [FB]: [] });
    await cdp.settle(200);
    await openEditor();
    // Every scrolling ancestor of the block, and the window: none of them may move while the arrows walk the list.
    const scrolls10 = () => cdp.evaluate(`(() => { const out = [window.scrollY]; for (let e = document.querySelector('.analysis-flags'); e; e = e.parentElement) out.push(e.scrollTop); return out; })()`);
    const before10 = await scrolls10();
    for (let i = 0; i < many10.length; i += 1) { await cdp.key('ArrowDown'); await cdp.settle(60); }
    await cdp.settle(150);
    const walk10 = await cdp.evaluate(`(() => {
      const list = document.querySelector('.analysis-flags .flag-popup-options'); const active = list?.querySelector('.flag-option.is-active');
      if (!list || !active) return null;
      const l = list.getBoundingClientRect(); const a = active.getBoundingClientRect();
      return { options: list.querySelectorAll('.flag-option').length, text: active.textContent, inside: a.top >= l.top - 0.5 && a.bottom <= l.bottom + 0.5, scrollTop: list.scrollTop, overflows: list.scrollHeight > list.clientHeight };
    })()`);
    const after10 = await scrolls10();
    check('7.10 (M2) with twelve flags in use, ArrowDown to the last suggestion leaves it inside the list\'s visible box',
      Boolean(walk10) && walk10.options === 12 && walk10.text === 'm12' && walk10.overflows === true && walk10.inside === true && walk10.scrollTop > 0, walk10);
    check('7.10 (M2) and nothing else scrolled (the window and every ancestor of the block)', same(before10, after10), { before10, after10 });
    await cdp.key('Escape');
    await cdp.settle(250);
    await putFlags({ [FA]: [] });

    check('7.9 no page errors in section 7', cdp.errors.length === errorsBefore7, cdp.errors.slice(errorsBefore7));
    await cdp.setState(`{ screen: "studies", openId: null, findFilters: ${NO_FILTERS}, findSort: { key: "date", dir: "desc" } }`);
    await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: s.studies.map((x) => (x.flags?.length || x.labelComment ? { ...x, flags: [], labelComment: x.id === ${JSON.stringify(FB)} ? null : x.labelComment } : x)) })))`);
    await cdp.settle(200);
  }
} finally {
  // The injected records go, and a demo study section 2 left Needs review gets its own qc back; SP-9000 stays, as every
  // suite leaves it.
  try {
    await cdp.evaluate(`import('./renderer/store.js').then((m) => { m.setState((s) => ({
      studies: s.studies.filter((x) => !${INJECTED}.test(x.id)).map((x) => (x.id === ${JSON.stringify(demoPatched?.id ?? null)} ? { ...x, qc: ${JSON.stringify(demoPatched?.qc ?? null)} } : x)),
      paramSelected: [], query: '', findFilters: { subject: '', region: [], view: [], workspace: [], folder: [], status: [] },
      wsFolder: null, wsFiles: [], wsFolderRows: [], wsCsv: null, wsCsvHeaders: [], wsCsvRows: [], wsMapping: [] })); return true; })`);
  } catch (_error) { /* the app may be gone */ }
  cdp.close();
  const passed = results.filter((r) => r.ok).length;
  for (const r of results) if (!r.ok) console.log(`FAIL ${r.name}: ${JSON.stringify(r.detail)}`);
  console.log(`smoke-reviewer: ${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
}
