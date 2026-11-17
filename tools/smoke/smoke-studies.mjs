// Studies screen smoke (Task 7 of plan 05): summary, demo pills/status badges, search
// filtering with caret/focus preservation, opening/leaving a study, adding an unsegmented
// study the way inject-study.js does, and confirming the unsegmented record round-trips
// through window.spineContour.loadStudies(). Task 9 adds the demo card (section 4b) and the
// running-id story (sections 7-8). Precondition: the app is running, any screen.
// The dropzone click (native picker) and a real file drop cannot be driven over CDP; those
// are Gate 1 steps.
//
// This suite SEGMENTS SP-9000 twice (sections 7 and 8), so it takes about 20 s longer than the
// DOM-only sections and needs the Python backend up. Both runs are deliberate: `state.running`
// is an id, and the only way to prove the list badges the RIGHT study is to watch a real run.
// Sections 10–14 (2026-09-08) add three batches over injected copies of the same film — two
// films, one unreadable film, and two films with a Stop — about three more real runs. Since
// 2026-10-01 (issue #39, the Failed-status port on 1.0.13) section 11 leaves the unreadable film
// Failed, section 14b reads that failure on its Analysis screen, and section 18 clears it through
// its Region select.
//
// Two consequences for whoever sequences the suites:
//   * NEVER run this between `smoke-persist.mjs --phase run` and `--phase restart`. Section 5
//     re-injects SP-9000 unsegmented, destroying the corrected geometry --phase restart
//     compares against.
//   * It leaves the app on Studies with SP-9000 segmented and nothing open on Analysis. Any
//     suite documented as "assumes a segmented study open on Analysis" needs its own
//     inject-study.js + run-and-wait.js pair after this one, not before it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

const rowCount = (cdp) => cdp.evaluate("document.querySelectorAll('.studies-row').length");
const text = (cdp, selector) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); return e ? e.textContent : null; })()`);
const clearSearch = (cdp) => cdp.evaluate("(() => { const el = document.querySelector('.studies-search'); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); })()");
// (2026-10-01, issue #39 port) A status pill as the page shows it: its classes, its label and its
// title, which only a Failed pill carries (getAttribute reads null when there is none). null with no
// pill.
const statusPill = (cdp, selector) => cdp.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); return b ? { cls: b.className, text: b.textContent.trim(), title: b.getAttribute('title') } : null; })()`);
// What section 11's batch `file not found` stores on SP-9001 (port spec 5, renderer/data/failure.js).
// The closing toast keeps the raw `file not found`.
const FILE_NOT_FOUND_REASON = 'The film was not found at its saved location. Run segmentation from its Analysis screen to choose its new location.';
// The Failed pill's title as failure.js failureTitle builds it (port spec 5): `Segmentation failed`,
// a middle dot and the date in reviewedLabel's format, a newline, then the reason; no date when `at`
// does not parse. The date is formatted here, in Node, from the record's own processingErrorAt, on
// the same machine and time zone as the app, so the check pins the format without guessing the
// moment.
const FAILED_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const failedTitle = (reason, at) => {
  const time = Date.parse(at ?? '');
  return `${Number.isNaN(time) ? 'Segmentation failed' : `Segmentation failed \u00B7 ${FAILED_DATE.format(new Date(time))}`}\n${reason}`;
};

const cdp = await connect();

// Polls the store through the page's own module instance, the way smoke-gate3.mjs does.
async function waitForState(predicateSource, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(`import('./renderer/store.js').then((m) => { const s = m.getState(); return Boolean(${predicateSource}); })`)) return true;
    await cdp.settle(150);
  }
  return false;
}

// Polls a DOM expression the same way; false at the deadline, never a throw.
async function waitForDom(expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return true;
    await cdp.settle(150);
  }
  return false;
}

try {
  // 1. Land on Studies with an empty query; heading, summary shape, row count.
  await cdp.setState('{ ack: true, screen: "studies", query: "" }');
  await cdp.settle();
  let s = await cdp.state();
  check('precondition: on the studies screen', s.screen === 'studies', s.screen);

  const heading = (await text(cdp, '.studies-heading') || '').trim();
  check('heading reads Studies', heading === 'Studies', heading);

  const summaryText = (await text(cdp, '.studies-summary') || '').trim();
  // (2026-09-10, studies-table spec 10) a third clause. The regex keeps the file's separator glyph
  // and writes the new one as an escape (HANDOFF's glyph trap); both match the same character.
  const summaryMatch = /^(\d+) STUDIES · (\d+) UNSEGMENTED \u00B7 (\d+) TO REVIEW$/.exec(summaryText);
  check('summary matches "{n} STUDIES · {m} UNSEGMENTED \u00B7 {k} TO REVIEW" with n >= 9', Boolean(summaryMatch) && Number(summaryMatch[1]) >= 9, summaryText);
  const n = summaryMatch ? Number(summaryMatch[1]) : null;
  const toReview0 = summaryMatch ? Number(summaryMatch[3]) : null;

  const initialRows = await rowCount(cdp);
  check('.studies-row count equals n', initialRows === n, { initialRows, n });

  // 2. Demo pills and status badges; the provenance cells and a date cell.
  const demoRows = await cdp.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.studies-row')].filter((r) => /^SP-00(3[0-9]|4[0-2])$/.test(r.dataset.studyId));
    return rows.map((r) => ({
      id: r.dataset.studyId,
      hasDemoPill: Boolean(r.querySelector('.pill-demo')),
      hasSegBadge: Boolean(r.querySelector('.badge-seg')),
    }));
  })()`);
  check('SP-0030..SP-0042 rows exist', demoRows.length > 0, demoRows.length);
  check('every SP-0030..SP-0042 row carries .pill-demo and .badge-seg', demoRows.every((r) => r.hasDemoPill && r.hasSegBadge), demoRows);

  const cellDetail = await cdp.evaluate(`(() => {
    const row = (id) => document.querySelector('.studies-row[data-study-id="' + id + '"]');
    const text = (id, cls) => row(id).querySelector(cls)?.textContent ?? null;
    return {
      lordosisGone: document.querySelectorAll('.studies-lordosis, .studies-lordosis-high, .studies-col-lordosis').length,
      // (2026-09-10) every header holds a sort button; strip its mark, as the grid's check does.
      headers: [...document.querySelectorAll('.studies-table-head > div')].map((d) => { const b = d.querySelector('.param-sort'); return (b ? b.textContent.replace(/[\u25B4\u25BE]/g, '') : d.textContent).trim(); }),
      sp0042Date: text('SP-0042', '.studies-cell-date'),
      // Demo records carry no filePath and no workspace, so both provenance cells are em dashes.
      sp0042Workspace: text('SP-0042', '.studies-cell-workspace'),
      sp0042Folder: text('SP-0042', '.studies-cell-folder'),
      // fileName is 'SP-0042.jpg', so the name defaults to the stem and reads the same as the id.
      sp0042Name: text('SP-0042', '.studies-cell-id'),
    };
  })()`);
  check('the LORDOSIS column is gone from the list', cellDetail.lordosisGone === 0, cellDetail.lordosisGone);
  // (2026-10-19, header filters) REGION sits between SUBJECT and VIEW.
  // (2026-11-16, study flags) FLAGS is the ninth header, after STATUS and before the trash cell's.
  check('the header row reads STUDY, SUBJECT, REGION, VIEW, WORKSPACE, FOLDER, DATE, STATUS, FLAGS',
    JSON.stringify(cellDetail.headers) === JSON.stringify(['STUDY', 'SUBJECT', 'REGION', 'VIEW', 'WORKSPACE', 'FOLDER', 'DATE', 'STATUS', 'FLAGS', '']),
    cellDetail.headers);
  check('SP-0042 date cell reads Aug 21, 2026', cellDetail.sp0042Date === 'Aug 21, 2026', cellDetail.sp0042Date);
  check('a demo study has an em dash for both workspace and folder',
    cellDetail.sp0042Workspace === '—' && cellDetail.sp0042Folder === '—',
    { workspace: cellDetail.sp0042Workspace, folder: cellDetail.sp0042Folder });
  check('the study cell shows the name derived from the filename', cellDetail.sp0042Name === 'SP-0042', cellDetail.sp0042Name);

  // 3. Search filtering: caret/focus preservation, diagnosis match, empty state, clear.
  const searchRect = await cdp.rect('.studies-search');
  check('search box has layout', Boolean(searchRect), searchRect);
  await cdp.click(searchRect.cx, searchRect.cy);
  await cdp.typeText('SP-0042');
  await cdp.settle();
  check('typing SP-0042 leaves one row', (await rowCount(cdp)) === 1, await rowCount(cdp));
  const afterType = await cdp.evaluate("(() => { const el = document.querySelector('.studies-search'); return { focused: document.activeElement === el, value: el.value, selectionStart: el.selectionStart }; })()");
  check('input keeps focus, value, and caret at the end', afterType.focused === true && afterType.value === 'SP-0042' && afterType.selectionStart === 7, afterType);
  const summaryAfterSearch = (await text(cdp, '.studies-summary') || '').trim();
  check('summary is unchanged while filtering', summaryAfterSearch === summaryText, summaryAfterSearch);

  await clearSearch(cdp);
  await cdp.typeText('meyerding');
  await cdp.settle();
  const dxRows = await cdp.evaluate("[...document.querySelectorAll('.studies-row')].map((r) => r.dataset.studyId)");
  check('searching a diagnosis phrase only SP-0042 carries leaves one row', dxRows.length === 1 && dxRows[0] === 'SP-0042', dxRows);

  await clearSearch(cdp);
  await cdp.typeText('zzzznomatch');
  await cdp.settle();
  const emptyText = (await text(cdp, '.studies-empty') || '').trim();
  check('a non-matching query shows the empty state', emptyText === 'No studies match that search.', emptyText);
  const summaryAfterEmpty = (await text(cdp, '.studies-summary') || '').trim();
  check('summary is unchanged for a non-matching query', summaryAfterEmpty === summaryText, summaryAfterEmpty);

  await clearSearch(cdp);
  await cdp.settle();
  check('clearing the query restores all n rows', (await rowCount(cdp)) === n, await rowCount(cdp));

  // 4. Opening a study resets the per-study view state; the back button returns to Studies.
  const sp0042Rect = await cdp.rect('.studies-row[data-study-id="SP-0042"]');
  check('SP-0042 row has layout', Boolean(sp0042Rect), sp0042Rect);
  await cdp.click(sp0042Rect.cx, sp0042Rect.cy);
  await cdp.settle();
  s = await cdp.state();
  check('clicking SP-0042 opens it with a fresh view', s.screen === 'analysis' && s.openId === 'SP-0042' && s.zoom === 1 && s.editing === false && s.selectedLevel === null, { screen: s.screen, openId: s.openId, zoom: s.zoom, editing: s.editing, selectedLevel: s.selectedLevel });

  const backRect = await cdp.rect('.icon-btn[aria-label="Back to studies"]');
  check('back button has layout', Boolean(backRect), backRect);
  await cdp.click(backRect.cx, backRect.cy);
  await cdp.settle();
  s = await cdp.state();
  check('back returns to Studies with all n rows', s.screen === 'studies' && (await rowCount(cdp)) === n, { screen: s.screen, rows: await rowCount(cdp) });

  // 4b. A demo study opens to the demo card (Task 9). A demo record has measurements but no
  // geometry and no film, so without its own branch it would read as an unprocessed real
  // study: an UNSEGMENTED card and a Run segmentation button whose only outcome is a toast.
  const demoRect = await cdp.rect('.studies-row[data-study-id="SP-0042"]');
  check('SP-0042 row has layout for the demo-open section', Boolean(demoRect), demoRect);
  await cdp.click(demoRect.cx, demoRect.cy);
  await cdp.settle(150);
  const demo = await cdp.evaluate(`(() => {
    const card = document.querySelector('.run-card');
    const runButton = document.querySelector('.run-button');
    const tool = (label) => document.querySelector('.viewer-tool[aria-label="' + label + '"]');
    const row = (key) => document.querySelector('.meas-row[data-row-key="' + key + '"]');
    const cell = (key, cls) => { const r = row(key); return r ? r.querySelector(cls).textContent : null; };
    const exportButton = document.querySelector('.analysis-export');
    return {
      cardVisible: Boolean(card) && !card.classList.contains('is-hidden'),
      eyebrow: document.querySelector('.run-eyebrow')?.textContent,
      title: document.querySelector('.run-title')?.textContent,
      runButtonHidden: Boolean(runButton) && runButton.classList.contains('is-hidden'),
      spinnerHidden: document.querySelector('.run-spinner')?.classList.contains('is-hidden'),
      editDisabled: tool('Edit segmentation')?.disabled,
      rerunDisabled: tool('Re-run segmentation')?.disabled,
      headerPill: document.querySelector('.analysis-header .pill-demo')?.textContent,
      exportDisabled: exportButton ? exportButton.disabled : null,
      exportTitle: exportButton ? exportButton.title : null,
      confidence: document.querySelector('.confidence-value')?.textContent,
      confidenceLabel: document.querySelector('.confidence-label')?.textContent,
      confidenceTone: document.querySelector('.confidence-details')?.dataset.tone,
      l1paLabel: cell('L1PA', '.meas-label'), l1paValue: cell('L1PA', '.meas-value'),
      llLabel: cell('LL', '.meas-label'), llValue: cell('LL', '.meas-value'),
    };
  })()`);
  check('the demo card is visible with the DEMO STUDY eyebrow', demo.cardVisible === true && demo.eyebrow === 'DEMO STUDY' && demo.title === 'No film for a demo study', demo);
  check('the demo card offers no run button and no spinner', demo.runButtonHidden === true && demo.spinnerHidden === true, demo);
  check('edit and re-run are disabled for a demo study', demo.editDisabled === true && demo.rerunDisabled === true, demo);
  check('the Analysis header carries a DEMO pill', demo.headerPill === 'DEMO', demo.headerPill);
  check('Export CSV is disabled for a demo study and says why', demo.exportDisabled === true && demo.exportTitle === 'Demo studies are not exported', demo);
  // v1.0.7 replaced the header's raw femoral-fit percentage with the OVERALL CONFIDENCE badge, an
  // assessment of the whole image. A demo record has no geometry and is never assessed, so the badge
  // reads an em dash with the unknown tone -- it must not borrow the study's stored femoral score
  // (0.96) and present it as an overall confidence the app never computed.
  check('OVERALL CONFIDENCE reads an em dash for a demo study, not its stored 96% fit score',
    demo.confidenceLabel === 'OVERALL CONFIDENCE' && demo.confidence === '\u2014' && demo.confidenceTone === 'unknown', demo);
  check('L1 PELVIC ANGLE reads an em dash, never a fabricated value', demo.l1paLabel === 'L1 PELVIC ANGLE' && demo.l1paValue === '—', demo);
  check('LUMBAR LORDOSIS · L1–S1 reads 48.2°', demo.llLabel === 'LUMBAR LORDOSIS · L1–S1' && demo.llValue === '48.2°', demo);

  const backRect3 = await cdp.rect('.icon-btn[aria-label="Back to studies"]');
  await cdp.click(backRect3.cx, backRect3.cy);
  await cdp.settle();
  s = await cdp.state();
  check('back from the demo study returns to Studies', s.screen === 'studies', s.screen);

  // 5. Add an unsegmented study the way inject-study.js does.
  const injectExpression = fs.readFileSync(path.join(__dirname, 'inject-study.js'), 'utf8');
  const injected = await cdp.evaluate(injectExpression);
  check('inject-study.js parks SP-9000 and opens Analysis', injected.screen === 'analysis' && injected.openId === 'SP-9000', injected);
  s = await cdp.state();
  const sp9000 = s.studies.find((x) => x.id === 'SP-9000');
  check('SP-9000 is unsegmented (measurements === null)', Boolean(sp9000) && sp9000.measurements === null, sp9000);
  const runCard = await cdp.evaluate("(() => { const card = document.querySelector('.run-card'); const btn = document.querySelector('.run-button'); return { visible: Boolean(card) && !card.classList.contains('is-hidden'), label: btn ? btn.textContent : null, eyebrow: document.querySelector('.run-eyebrow')?.textContent }; })()");
  check('the run card is visible, UNSEGMENTED, with a Run segmentation button', runCard.visible === true && runCard.label === 'Run segmentation' && runCard.eyebrow === 'UNSEGMENTED', runCard);
  // (2026-10-01, issue #39 port, P1) An idle film with no result reads Unsegmented -- Processing is
  // only the running film and the films waiting in a batch -- and its pill carries no title; only a
  // Failed pill does.
  const header5 = await statusPill(cdp, '.analysis-status .badge');
  check('the header pill of the idle unsegmented study reads Unsegmented, with no title', Boolean(header5) && header5.cls === 'badge badge-unseg' && header5.text === 'Unsegmented' && header5.title === null, header5);

  const backRect2 = await cdp.rect('.icon-btn[aria-label="Back to studies"]');
  await cdp.click(backRect2.cx, backRect2.cy);
  await cdp.settle();
  s = await cdp.state();
  const newRow = await cdp.evaluate(`(() => {
    const row = document.querySelector('.studies-row');
    if (!row) return null;
    return {
      id: row.dataset.studyId,
      badgeUnseg: Boolean(row.querySelector('.badge-unseg')),
      badgeText: row.querySelector('.badge-unseg')?.textContent,
      badgeTitle: row.querySelector('.badge')?.getAttribute('title') ?? null,
      subject: row.querySelector('.studies-cell-subject')?.textContent.trim(),
      name: row.querySelector('.studies-cell-id')?.textContent,
      workspace: row.querySelector('.studies-cell-workspace')?.textContent,
      folder: row.querySelector('.studies-cell-folder')?.textContent,
      demoPill: Boolean(row.querySelector('.pill-demo')),
    };
  })()`);
  // (2026-10-01, issue #39 port, P1) Unsegmented, not Processing: nothing is running it.
  check('the new study is the first row, Unsegmented with no title, no DEMO pill', newRow && newRow.id === 'SP-9000' && newRow.badgeUnseg && newRow.badgeText === 'Unsegmented' && newRow.badgeTitle === null && newRow.subject === '—' && newRow.demoPill === false, newRow);
  check('the injected study is named after its file, not its id',
    newRow && newRow.name === '13462cd9-a59f-4aab-9256-cbd723fb978c', newRow && newRow.name);
  // Added by hand: no workspace, but the folder is still derived from the film's own path.
  check('a study added by hand shows an em dash workspace and its containing folder',
    newRow && newRow.workspace === '—' && newRow.folder === 'design_src',
    newRow && { workspace: newRow.workspace, folder: newRow.folder });
  const summaryAfterAdd = (await text(cdp, '.studies-summary') || '').trim();
  check('summary reads n+1 studies, 1 unsegmented, the same to-review count', summaryAfterAdd === `${n + 1} STUDIES · 1 UNSEGMENTED \u00B7 ${toReview0} TO REVIEW`, summaryAfterAdd);

  // 6. The unsegmented record round-trips through the persisted store.
  const persisted = await cdp.evaluate(`(async () => {
    const start = Date.now();
    while (Date.now() - start < 5000) {
      const raw = await window.spineContour.loadStudies();
      const found = (raw.studies || []).find((x) => x.id === 'SP-9000');
      if (found) return { found: true, measurements: found.measurements };
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return { found: false };
  })()`);
  check('window.spineContour.loadStudies() persisted SP-9000 with measurements: null', persisted.found === true && persisted.measurements === null, persisted);

  // 7. state.running is the running STUDY'S ID (Task 9), not a boolean. Driven from SP-9000's
  // own run card, immediately after section 5 injected it: its bytes are in THIS session's
  // payload map (screens/analysis.js's filePayloads), so the run is deterministic on a fresh
  // scratch profile and this section needs no skip, no precondition and no optional branch.
  // It has to follow section 6, which asserts SP-9000 persisted with measurements: null.
  const RUNNING_ID = 'SP-9000';
  const sp9000Rect = await cdp.rect(`.studies-row[data-study-id="${RUNNING_ID}"]`);
  check('SP-9000 row has layout', Boolean(sp9000Rect), sp9000Rect);
  await cdp.click(sp9000Rect.cx, sp9000Rect.cy);
  await cdp.settle(150);
  // (2026-10-19, final review; R15) The film's decode starts only after a 150 ms settle, so it can land, and the full
  // UNSEGMENTED card collapse into the strip along the bottom of the stage, between reading the Run button's place and
  // clicking it: the click then hits the film. Wait for the strip first (SP-9000 is lumbar, its bytes parked).
  const settled7 = await waitForDom("document.querySelector('.run-card')?.classList.contains('run-card-strip') === true", 15000);
  check('SP-9000\'s X-ray lands and its card settles into the UNSEGMENTED strip', settled7 === true, settled7);
  const runCardButton = await cdp.evaluate(`(() => {
    const b = document.querySelector('.run-button');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, disabled: b.disabled, hidden: b.classList.contains('is-hidden'), label: b.textContent };
  })()`);
  check('SP-9000 opens to an enabled Run segmentation button', Boolean(runCardButton) && runCardButton.disabled === false && runCardButton.hidden === false && runCardButton.label === 'Run segmentation', runCardButton);
  await cdp.click(runCardButton.cx, runCardButton.cy);
  const started = await waitForState('s.running !== null', 5000);
  check('clicking Run segmentation puts a run in flight', started === true, [started, (await cdp.state()).running]);
  s = await cdp.state();
  check('state.running is the running study id, not a boolean', s.running === RUNNING_ID, s.running);
  const cardWhileRunning = await cdp.evaluate(`(() => ({
    eyebrow: document.querySelector('.run-eyebrow')?.textContent,
    spinnerHidden: document.querySelector('.run-spinner')?.classList.contains('is-hidden'),
    buttonLabel: document.querySelector('.run-button')?.textContent,
    buttonDisabled: document.querySelector('.run-button')?.disabled,
  }))()`);
  check("the running study's own card reads RUNNING with a spinner", cardWhileRunning.eyebrow === 'RUNNING' && cardWhileRunning.spinnerHidden === false && cardWhileRunning.buttonLabel === 'Working…' && cardWhileRunning.buttonDisabled === true, cardWhileRunning);
  // (2026-10-01, issue #39 port, P1) Processing is the running film's pill, and it carries no title.
  const headerWhileRunning = await statusPill(cdp, '.analysis-status .badge');
  check("the running study's header pill reads Processing, with no title", Boolean(headerWhileRunning) && headerWhileRunning.cls === 'badge badge-proc' && headerWhileRunning.text === 'Processing' && headerWhileRunning.title === null, headerWhileRunning);

  // Back to Studies mid-run, the way a user would. SP-9000 is unsegmented here; since the port
  // (2026-10-01, issue #39) an idle unsegmented film derives 'unseg', so its Processing pill is
  // already the "or currently running" rule at work, and this pass also proves the badges and the
  // summary agree during a run. Section 8 below proves the same rule against a study deriveStatus
  // calls 'seg'.
  const backRect4 = await cdp.rect('.icon-btn[aria-label="Back to studies"]');
  await cdp.click(backRect4.cx, backRect4.cy);
  await cdp.settle(200);
  const listWhileRunning = await cdp.evaluate(`(() => {
    const row = document.querySelector('.studies-row[data-study-id="${RUNNING_ID}"]');
    const summary = document.querySelector('.studies-summary')?.textContent || '';
    const m = /(\\d+) STUDIES · (\\d+) UNSEGMENTED/.exec(summary);
    return {
      badgeProc: Boolean(row && row.querySelector('.badge-proc')),
      badgeText: row ? row.querySelector('.badge')?.textContent : null,
      badgeTitle: row?.querySelector('.badge')?.getAttribute('title') ?? null,
      queued: m ? Number(m[2]) : null,
      // (2026-10-01, issue #39 port) UNSEGMENTED counts every film shown as Processing, Unsegmented
      // or Failed (port spec 3), so those are the badges it is compared with.
      unsegRows: document.querySelectorAll('.studies-row .badge-proc, .studies-row .badge-unseg, .studies-row .badge-fail').length,
    };
  })()`);
  check('the running study is badged Processing in the list, with no title', listWhileRunning.badgeProc === true && listWhileRunning.badgeText === 'Processing' && listWhileRunning.badgeTitle === null, listWhileRunning);
  check('the summary UNSEGMENTED count matches the Processing, Unsegmented and Failed badges', listWhileRunning.queued !== null && listWhileRunning.queued === listWhileRunning.unsegRows && listWhileRunning.queued >= 1, listWhileRunning);

  // The lie the id change exists to prevent: opening a DIFFERENT study mid-run must not make
  // that study's card read RUNNING. The `running` re-read is part of the assertion, not
  // decoration -- it is what makes this "mid-run" rather than "at some point after the click".
  const demoRect2 = await cdp.rect('.studies-row[data-study-id="SP-0042"]');
  await cdp.click(demoRect2.cx, demoRect2.cy);
  await cdp.settle(200);
  const runningWithDemoOpen = (await cdp.state()).running;
  const demoDuringRun = await cdp.evaluate(`(() => ({
    eyebrow: document.querySelector('.run-eyebrow')?.textContent,
    title: document.querySelector('.run-title')?.textContent,
    spinnerHidden: document.querySelector('.run-spinner')?.classList.contains('is-hidden'),
    runButtonHidden: document.querySelector('.run-button')?.classList.contains('is-hidden'),
    editDisabled: document.querySelector('.viewer-tool[aria-label="Edit segmentation"]')?.disabled,
  }))()`);
  check('a demo study opened mid-run shows the demo card, not RUNNING',
    runningWithDemoOpen === RUNNING_ID && demoDuringRun.eyebrow === 'DEMO STUDY'
    && demoDuringRun.title === 'No film for a demo study'
    && demoDuringRun.spinnerHidden === true && demoDuringRun.runButtonHidden === true,
    { runningWithDemoOpen, ...demoDuringRun });

  // Bounded: waitForState returns false at the deadline, it never hangs. The injected
  // 157x280 film segments in roughly 9 s; 400 s is the same ceiling run-and-wait.js uses.
  const finished = await waitForState('s.running === null', 400000);
  s = await cdp.state();
  const ran = (s.studies || []).find((x) => x.id === RUNNING_ID);
  check('the run finishes and running returns to null', finished === true && s.running === null, [finished, s.running, s.toast]);
  check('the run leaves SP-9000 with measurements and geometry', Boolean(ran && ran.measurements && ran.geometry), ran ? { hasMeas: Boolean(ran.measurements), hasGeom: Boolean(ran.geometry) } : null);

  // 8. The "or currently running" badge rule itself (studies.js buildRow), against a study
  // deriveStatus calls 'seg' or 'rev': the SP-9000 section 7 just segmented. (Since the port,
  // 2026-10-01, issue #39, section 7 exercises the rule too -- an idle unsegmented study derives
  // 'unseg', not 'proc' -- but only on an unsegmented film.) Deterministic: its bytes are still in
  // this session's payload map, so the re-run starts.
  await cdp.setState('{ screen: "studies" }');
  await cdp.settle(200);
  const badgeAtRest = await cdp.evaluate(`(() => {
    const row = document.querySelector('.studies-row[data-study-id="${RUNNING_ID}"]');
    return { proc: Boolean(row && row.querySelector('.badge-proc')), text: row ? row.querySelector('.badge')?.textContent : null };
  })()`);
  check('a segmented SP-9000 is not badged Processing at rest', badgeAtRest.proc === false && (badgeAtRest.text === 'Segmented' || badgeAtRest.text === 'Needs review'), badgeAtRest);

  const sp9000Rect2 = await cdp.rect(`.studies-row[data-study-id="${RUNNING_ID}"]`);
  await cdp.click(sp9000Rect2.cx, sp9000Rect2.cy);
  await cdp.settle(200);
  const rerunButton = await cdp.evaluate(`(() => {
    const b = document.querySelector('.viewer-tool[aria-label="Re-run segmentation"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, disabled: b.disabled };
  })()`);
  check('Re-run segmentation is enabled on the segmented SP-9000', Boolean(rerunButton) && rerunButton.disabled === false, rerunButton);
  await cdp.click(rerunButton.cx, rerunButton.cy);
  const rerunStarted = await waitForState('s.running !== null', 5000);
  check('clicking Re-run segmentation puts a run in flight', rerunStarted === true, [rerunStarted, (await cdp.state()).running]);
  s = await cdp.state();
  check('state.running is the re-running study id', s.running === RUNNING_ID, s.running);
  const backRect5 = await cdp.rect('.icon-btn[aria-label="Back to studies"]');
  await cdp.click(backRect5.cx, backRect5.cy);
  await cdp.settle(200);
  const badgeWhileRerunning = await cdp.evaluate(`(() => {
    const row = document.querySelector('.studies-row[data-study-id="${RUNNING_ID}"]');
    const summary = document.querySelector('.studies-summary')?.textContent || '';
    const m = /(\\d+) STUDIES · (\\d+) UNSEGMENTED/.exec(summary);
    return {
      proc: Boolean(row && row.querySelector('.badge-proc')),
      text: row ? row.querySelector('.badge')?.textContent : null,
      queued: m ? Number(m[2]) : null,
      // (2026-10-01, issue #39 port) As in section 7: Processing, Unsegmented and Failed all count.
      unsegRows: document.querySelectorAll('.studies-row .badge-proc, .studies-row .badge-unseg, .studies-row .badge-fail').length,
    };
  })()`);
  check('a SEGMENTED study reads Processing while it is the running study', badgeWhileRerunning.proc === true && badgeWhileRerunning.text === 'Processing', badgeWhileRerunning);
  check('the summary counts the re-running study as unsegmented', badgeWhileRerunning.queued === badgeWhileRerunning.unsegRows && badgeWhileRerunning.queued >= 1, badgeWhileRerunning);

  const rerunFinished = await waitForState('s.running === null', 400000);
  s = await cdp.state();
  check('the re-run finishes and running returns to null', rerunFinished === true && s.running === null, [rerunFinished, s.running, s.toast]);
  await cdp.settle(200);
  const badgeAfter = await cdp.evaluate(`(() => {
    const row = document.querySelector('.studies-row[data-study-id="${RUNNING_ID}"]');
    return { proc: Boolean(row && row.querySelector('.badge-proc')), text: row ? row.querySelector('.badge')?.textContent : null };
  })()`);
  check('the badge returns to its derived status once the run ends', badgeAfter.proc === false && (badgeAfter.text === 'Segmented' || badgeAfter.text === 'Needs review'), badgeAfter);

  // 9. No console errors or exceptions during the run.
  check('no console errors or exceptions during the run', cdp.errors.length === 0, cdp.errors);

  // ---------------------------------------------------------------------------------------------
  // 10–14 (2026-09-08, batch spec 7, 8, 9, 10, 11). The Find tab's filter bar and ticks, then three
  // real batches over films injected the way inject-study.js injects SP-9000. Every selector keys
  // on data-find-key; every store read goes through the page's own module.
  // ---------------------------------------------------------------------------------------------
  const errorsAfter9 = cdp.errors.length;
  // No check here: a null sample makes section 12's own checks FAIL by name (an injected film
  // with no bytes cannot segment) instead of throwing out of the try and printing nothing.
  const sampleMatch = /atob\('([^']+)'\)/.exec(injectExpression);
  const SAMPLE_BASE64 = sampleMatch ? sampleMatch[1] : null;

  // Parks bytes (when given) for a new unsegmented real study and front-inserts it, like addStudy,
  // without opening it. A filePath under a workspace root gives the Workspace select a root to
  // offer; no bytes and no such file is the batch's file-not-found case.
  const injectFilm = ({ id, fileName, filePath, workspaceFolder, base64 }) => cdp.evaluate(`(async () => {
    const store = await import('./renderer/store.js');
    const analysis = await import('./renderer/screens/analysis.js');
    const base64 = ${JSON.stringify(base64)};
    if (base64) {
      const bin = atob(base64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      analysis.setFilePayload(${JSON.stringify(id)}, bytes);
    }
    const record = { id: ${JSON.stringify(id)}, source: 'real', filePath: ${JSON.stringify(filePath)}, fileName: ${JSON.stringify(fileName)}, name: null, workspaceFolder: ${JSON.stringify(workspaceFolder)}, subjectId: null, timepoint: null, filmDate: null, addedAt: new Date().toISOString(), view: 'Standing lateral', thumbnail: null, measurements: null, geometry: null, qc: null, clinical: {} };
    store.setState((s) => ({ studies: [record, ...s.studies.filter((x) => x.id !== record.id)] }));
    return store.getState().studies.length;
  })()`);
  const readBar = () => cdp.evaluate(`(() => {
    const b = document.querySelector('[data-find-key="segment"]');
    return { label: b ? b.textContent : null, disabled: b ? b.disabled : null, note: document.querySelector('[data-find-key="segment-note"]')?.textContent ?? null };
  })()`);
  // (2026-09-10) '.studies-progress-text' nests a '.study-processing-detail' span inside itself
  // for the live backend stage/detail (upstream 63b3484, the low-memory live-progress feature);
  // textContent would include it, so clone the node and strip the nested span before reading.
  const readProgress = () => cdp.evaluate(`(() => ({
    text: (() => { const e = document.querySelector('[data-find-key="progress"] .studies-progress-text'); if (!e) return null; const c = e.cloneNode(true); c.querySelectorAll('.study-processing-detail').forEach((n) => n.remove()); return c.textContent.trim(); })(),
    stopDisabled: document.querySelector('[data-find-key="stop"]')?.disabled ?? null,
    segmentButton: Boolean(document.querySelector('[data-find-key="segment"]')),
    sidebar: document.querySelector('.nav-row[aria-label="Studies"] .nav-sublabel')?.textContent ?? null,
    procRows: document.querySelectorAll('.studies-row .badge-proc').length,
  }))()`);
  const summaryParts = async () => {
    const m = /^(\d+) STUDIES · (\d+) UNSEGMENTED \u00B7 (\d+) TO REVIEW$/.exec(((await text(cdp, '.studies-summary')) || '').trim());
    return m ? { studies: Number(m[1]), unsegmented: Number(m[2]) } : null;
  };
  // A missing element is a FAIL in the results, never a throw: the suite prints its results only at
  // the end, and a throw here would print nothing (HANDOFF's silent-suite trap).
  // (2026-09-29, issue #39) Scroll first: at the default window the Find table scrolls sideways and the STATUS header sits at its clipped edge.
  const clickAt = async (selector) => {
    await cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (e) e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); })()`);
    await cdp.settle(50);
    const r = await cdp.rect(selector); if (r) await cdp.click(r.cx, r.cy); return Boolean(r);
  };
  const FILTERS_RESET = '{ workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, subject: "", pairedOnly: false, pairedWith: "__any__" }';
  // (2026-10-19, header filters) The Find list's own filters (findFilters), at their default: the grid's paramFilters
  // above no longer reach the list.
  const FIND_RESET = '{ subject: "", region: [], view: [], workspace: [], folder: [], status: [] }';
  // The header menus, driven as a person drives them (smoke-reviewer.mjs section 2's idiom): a funnel opens its
  // column's menu, a click on a value's row (the label round its box) ticks it, All clears the column, Escape closes
  // the menu. A value key goes into an attribute selector, so a backslash in a root path is doubled for CSS.
  const cssKey = (key) => key.replace(/\\/g, '\\\\');
  const funnelOpen = (column) => cdp.evaluate(`document.querySelector('[data-find-key="filter-${column}"]')?.getAttribute('aria-expanded') === 'true'`);
  const openFilterMenu = async (column) => {
    if (!(await funnelOpen(column))) await clickAt(`[data-find-key="filter-${column}"]`);
    await cdp.settle(150);
  };
  const tickValue = async (column, value) => {
    await openFilterMenu(column);
    const ok = await clickAt(`label:has(> [data-find-key="${cssKey(`filter-${column}-${value}`)}"])`);
    await cdp.settle(150);
    return ok;
  };
  const menuLabels = () => cdp.evaluate(`[...document.querySelectorAll('.studies-filter-menu .menu-check')].map((l) => l.textContent)`);

  // 10. The filter bar and the ticks. SP-9001 sits under a workspace root, with no bytes and no
  // such file; SP-9000 is segmented (section 8).
  await cdp.setState(`{ screen: "studies", query: "", paramFilters: ${FILTERS_RESET}, findFilters: ${FIND_RESET}, paramSelected: [] }`);
  await cdp.settle(200);
  const countBefore10 = (await cdp.state()).studies.length;
  await injectFilm({ id: 'SP-9001', fileName: 'S001.png', filePath: 'C:\\smoke\\Fusion2025\\pre-op\\S001.png', workspaceFolder: 'C:\\smoke\\Fusion2025', base64: null });
  await cdp.settle(200);
  const rows10 = await rowCount(cdp);
  // (2026-10-19, header filters) The bar's Workspace and Folder selects are gone: the WORKSPACE and FOLDER header menus
  // offer the same values (the roots, then Added by hand; the folders in first-seen order) as tick boxes.
  check('the bar no longer holds the Workspace or Folder select', (await cdp.evaluate(`document.querySelectorAll('[data-find-key="workspace"], [data-find-key="folder"]').length`)) === 0);
  await openFilterMenu('workspace');
  const workspace10 = await menuLabels();
  check('the WORKSPACE menu offers the injected root, then Added by hand', JSON.stringify(workspace10) === JSON.stringify(['Fusion2025', 'Added by hand']), workspace10);
  // (2026-10-19, final review) A root's row names its full path on its title, as the bar's Workspace select did.
  const workspaceTitles10 = await cdp.evaluate(`[...document.querySelectorAll('.studies-filter-menu .menu-check')].map((l) => l.title)`);
  check('the WORKSPACE menu\'s root row carries the root\'s full path on its title, Added by hand none', JSON.stringify(workspaceTitles10) === JSON.stringify(['C:\\smoke\\Fusion2025', '']), workspaceTitles10);
  await openFilterMenu('folder');
  const folder10 = await menuLabels();
  check('the FOLDER menu offers every folder in the library, first seen first', JSON.stringify(folder10) === JSON.stringify(['pre-op', 'design_src']), folder10);
  check('the injected film is a row', rows10 === countBefore10 + 1, rows10);
  await cdp.key('Escape');
  await cdp.settle(100);
  const bar10Plain = await readBar();
  check('with nothing ticked the button offers every visible unsegmented film', bar10Plain.label === 'Segment 1 unsegmented' && bar10Plain.disabled === false && bar10Plain.note === null, bar10Plain);

  await tickValue('workspace', 'C:\\smoke\\Fusion2025');
  const ws10 = await cdp.evaluate(`(() => {
    const f = document.querySelector('[data-find-key="filter-workspace"]');
    return {
      rows: [...document.querySelectorAll('.studies-row')].map((r) => r.dataset.studyId),
      active: f ? f.classList.contains('is-active') : null, count: f?.querySelector('.studies-filter-count')?.textContent ?? null, title: f ? f.title : null,
    };
  })()`);
  check('ticking the root in the WORKSPACE menu leaves the one film under it', JSON.stringify(ws10.rows) === JSON.stringify(['SP-9001']), ws10.rows);
  check('the WORKSPACE funnel reads active with count 1, its title naming the root', ws10.active === true && ws10.count === '1' && ws10.title === 'Filtered: Fusion2025', ws10);
  await openFilterMenu('folder');
  const folder10Narrow = await menuLabels();
  check('the FOLDER menu narrows to the ticked root', JSON.stringify(folder10Narrow) === JSON.stringify(['pre-op']), folder10Narrow);
  const summary10 = await summaryParts();
  check('the summary still describes the whole library', summary10 !== null && summary10.studies === countBefore10 + 1 && summary10.unsegmented === 1, summary10);
  const shared10 = await cdp.state();
  check('the ticks live in the Find list\'s own findFilters key, and the grid\'s paramFilters are untouched',
    JSON.stringify(shared10.findFilters.workspace) === JSON.stringify(['C:\\smoke\\Fusion2025']) && shared10.findFilters.folder.length === 0
    && shared10.paramFilters.workspace === null && shared10.paramFilters.folder === null, { findFilters: shared10.findFilters, paramFilters: shared10.paramFilters });
  await tickValue('folder', 'pre-op');
  check('ticking the folder keeps the film in it', (await rowCount(cdp)) === 1, await rowCount(cdp));
  await clickAt('.studies-search');
  await cdp.typeText('zzzznomatch');
  await cdp.settle();
  const empty10 = (await text(cdp, '.studies-empty') || '').trim();
  check('with a filter set and nothing left, the empty state names the filters', empty10 === 'No studies match these filters.', empty10);
  await clearSearch(cdp);
  await openFilterMenu('workspace');
  await clickAt('[data-find-key="filter-workspace-all"]');
  await cdp.settle(150);
  check('All on WORKSPACE clears its ticks but the folder tick, still offered, keeps its one film',
    (await cdp.state()).findFilters.workspace.length === 0 && JSON.stringify((await cdp.state()).findFilters.folder) === JSON.stringify(['pre-op']) && (await rowCount(cdp)) === 1, await rowCount(cdp));
  await openFilterMenu('folder');
  await clickAt('[data-find-key="filter-folder-all"]');
  await cdp.settle(150);
  check('All on FOLDER restores every row', (await rowCount(cdp)) === countBefore10 + 1 && JSON.stringify((await cdp.state()).findFilters) === JSON.stringify({ subject: '', region: [], view: [], workspace: [], folder: [], status: [], flags: [], flagsMatch: 'any' }), await rowCount(cdp));
  await cdp.key('Escape');
  await cdp.settle(100);
  check('Escape closes the open menu', (await cdp.evaluate(`document.querySelectorAll('.studies-filter-menu').length`)) === 0);

  const tickRect = await cdp.rect('input[data-find-key="row-SP-9000"]');
  const demoTick = await cdp.evaluate(`Boolean(document.querySelector('input[data-find-key="row-SP-0042"]'))`);
  check('a real row carries a tick box and a demo row does not', Boolean(tickRect) && demoTick === false, { tickRect, demoTick });
  if (tickRect) await cdp.click(tickRect.cx, tickRect.cy);
  await cdp.settle(150);
  s = await cdp.state();
  check('ticking a row selects it without opening the study', s.screen === 'studies' && JSON.stringify(s.paramSelected) === JSON.stringify(['SP-9000']), { screen: s.screen, selected: s.paramSelected });
  const bar10Ticked = await readBar();
  check('with only a segmented row ticked the button is disabled and says so', bar10Ticked.label === 'Segment 0 selected' && bar10Ticked.disabled === true && bar10Ticked.note === 'All selected studies are segmented', bar10Ticked);
  const all10 = await cdp.evaluate(`(() => { const el = document.querySelector('input[data-find-key="select-all"]'); if (!el) return { checked: null, indeterminate: null }; return { checked: el.checked, indeterminate: el.indeterminate }; })()`);
  check('select-all is indeterminate with one of two real rows ticked', all10.checked === false && all10.indeterminate === true, all10);
  await clickAt('input[data-find-key="select-all"]');
  await cdp.settle(150);
  s = await cdp.state();
  check('an indeterminate select-all ticks every visible real row', s.paramSelected.length === 2 && s.paramSelected.includes('SP-9000') && s.paramSelected.includes('SP-9001'), s.paramSelected);
  const bar10Both = await readBar();
  check('with a segmented and an unsegmented row ticked the button runs one and notes the other', bar10Both.label === 'Segment 1 selected' && bar10Both.disabled === false && bar10Both.note === '1 already segmented', bar10Both);
  const focus10 = await cdp.evaluate(`document.activeElement ? document.activeElement.getAttribute('data-find-key') : null`);
  check('the rebuild hands focus back to the select-all box', focus10 === 'select-all', focus10);
  await clickAt('input[data-find-key="select-all"]');
  await cdp.settle(150);
  s = await cdp.state();
  check('a checked select-all clears every visible real row', s.paramSelected.length === 0, s.paramSelected);

  // 11. A batch over a film that is not on disk ends in seconds with the failure named (spec 10).
  // (2026-10-01, issue #39 port) The toast keeps the raw `file not found` (port spec P5); the record
  // keeps the failure as port spec 5's sentence with the time it was written, so from here SP-9001
  // reads Failed, dated, and still counts under UNSEGMENTED (port spec 3).
  await cdp.setState('{ paramSelected: ["SP-9001"] }');
  await cdp.settle(150);
  const bar11 = await readBar();
  check('with the unreadable film ticked the button offers it', bar11.label === 'Segment 1 selected' && bar11.disabled === false, bar11);
  const summaryBefore11 = await summaryParts();
  await clickAt('[data-find-key="segment"]');
  const failed11 = await waitForState('s.toast.startsWith("Segmented 0 of 1")', 15000);
  s = await cdp.state();
  const sp9001 = s.studies.find((x) => x.id === 'SP-9001');
  check('the batch ends with the film counted as failed and named in the toast', failed11 === true && s.toast === 'Segmented 0 of 1 film. · 1 could not be segmented: S001 (file not found)', s.toast);
  check('the unreadable film records the failure and its time, with no result, and the batch is cleared',
    s.batch === null && s.running === null && Boolean(sp9001) && sp9001.measurements === null
    && sp9001.processingError === FILE_NOT_FOUND_REASON && typeof sp9001.processingErrorAt === 'string' && !Number.isNaN(Date.parse(sp9001.processingErrorAt))
    && Math.abs(Date.now() - Date.parse(sp9001.processingErrorAt)) < 120000,
    { batch: s.batch, running: s.running, processingError: sp9001 ? sp9001.processingError : null, processingErrorAt: sp9001 ? sp9001.processingErrorAt : null });
  const pill11 = await statusPill(cdp, '.studies-row[data-study-id="SP-9001"] .badge');
  check('after its turn the unreadable film reads Failed, its tooltip the dated line and the stored reason',
    Boolean(pill11) && Boolean(sp9001) && pill11.cls === 'badge badge-fail' && pill11.text === 'Failed'
    && pill11.title === failedTitle(FILE_NOT_FOUND_REASON, sp9001.processingErrorAt) && /^Segmentation failed \u00B7 [A-Z][a-z]{2} \d{1,2}, \d{4}\n/.test(pill11.title),
    { pill11, processingErrorAt: sp9001 ? sp9001.processingErrorAt : null });
  const summary11 = await summaryParts();
  check('the summary keeps its three clauses and counts the Failed film under UNSEGMENTED',
    summaryBefore11 !== null && summary11 !== null && summary11.studies === summaryBefore11.studies && summary11.unsegmented === summaryBefore11.unsegmented,
    { summaryBefore11, summary11 });

  // 12. A real two-film batch (spec 9's worked example at fixture scale): the count, the badges,
  // the sidebar, the cards mid-batch, the toast, the ticks afterwards.
  await injectFilm({ id: 'SP-9002', fileName: 'batch-a.jpg', filePath: null, workspaceFolder: null, base64: SAMPLE_BASE64 });
  await injectFilm({ id: 'SP-9003', fileName: 'batch-b.jpg', filePath: null, workspaceFolder: null, base64: SAMPLE_BASE64 });
  await cdp.setState('{ paramSelected: [] }');
  await cdp.settle(200);
  const bar12Plain = await readBar();
  // (2026-10-01, issue #39 port, P6) SP-9001 is Failed since section 11 and a batch offers a Failed
  // film again, so the three are SP-9001, SP-9002 and SP-9003.
  check('with nothing ticked the button counts every visible unsegmented film, the Failed one included', bar12Plain.label === 'Segment 3 unsegmented' && bar12Plain.disabled === false, bar12Plain);
  await cdp.setState('{ paramSelected: ["SP-9002", "SP-9003"] }');
  await cdp.settle(150);
  const bar12 = await readBar();
  check('ticking the two real films offers exactly them', bar12.label === 'Segment 2 selected' && bar12.disabled === false && bar12.note === null, bar12);
  const summaryBefore12 = await summaryParts();
  await clickAt('[data-find-key="segment"]');
  const started12 = await waitForState('s.batch !== null && s.running !== null', 5000);
  s = await cdp.state();
  check('the click starts a batch over the ticked films in table order, the first in flight', started12 === true && s.batch && JSON.stringify(s.batch.ids) === JSON.stringify(['SP-9003', 'SP-9002']) && s.batch.done === 0 && s.running === 'SP-9003', { batch: s.batch, running: s.running });
  const progress12a = await readProgress();
  check('the bar shows 0 of 2 done, an enabled Stop and no segment button', progress12a.text === '0 of 2 done' && progress12a.stopDisabled === false && progress12a.segmentButton === false, progress12a);
  check('the sidebar Studies row reads 0 OF 2 DONE', progress12a.sidebar === '0 OF 2 DONE', progress12a.sidebar);
  // (2026-10-01, issue #39 port, P1) This check used to pin all three at Processing. Now the film in
  // flight and the film waiting its turn read Processing from the click, and the film the earlier
  // batch could not find reads Failed, its dated reason one hover away.
  const pills12 = {
    running: await statusPill(cdp, '.studies-row[data-study-id="SP-9003"] .badge'),
    queued: await statusPill(cdp, '.studies-row[data-study-id="SP-9002"] .badge'),
    failed: await statusPill(cdp, '.studies-row[data-study-id="SP-9001"] .badge'),
  };
  const sp9001at12 = s.studies.find((x) => x.id === 'SP-9001');
  check('the running and the queued film read Processing and the unreadable film reads Failed with its dated reason',
    progress12a.procRows === 2
    && pills12.running?.cls === 'badge badge-proc' && pills12.running.text === 'Processing' && pills12.running.title === null
    && pills12.queued?.cls === 'badge badge-proc' && pills12.queued.text === 'Processing' && pills12.queued.title === null
    && pills12.failed?.cls === 'badge badge-fail' && pills12.failed.text === 'Failed'
    && Boolean(sp9001at12) && pills12.failed.title === failedTitle(FILE_NOT_FOUND_REASON, sp9001at12.processingErrorAt),
    { procRows: progress12a.procRows, ...pills12 });

  // The cards mid-batch. The injected film segments in roughly 9 s; two openings take about 1 s.
  await clickAt('.studies-row[data-study-id="SP-9002"]');
  await cdp.settle(200);
  const queuedCard = await cdp.evaluate(`(() => ({
    eyebrow: document.querySelector('.run-eyebrow')?.textContent, title: document.querySelector('.run-title')?.textContent,
    disabled: document.querySelector('.run-button')?.disabled, buttonTitle: document.querySelector('.run-button')?.title,
  }))()`);
  check('a queued film opened mid-batch reads QUEUED, waiting for its turn, its run button disabled', queuedCard.eyebrow === 'QUEUED' && queuedCard.title === 'Waiting for its turn in the batch' && queuedCard.disabled === true && queuedCard.buttonTitle === 'Wait for the batch to finish', queuedCard);
  // (2026-10-01, issue #39 port, P1 and port spec 3) The card keeps its QUEUED wording; the header
  // pill passes state.batch to displayStatus as the list does, so it reads Processing (and still
  // would once the film's turn starts).
  const queuedHeader = await statusPill(cdp, '.analysis-status .badge');
  check("a queued film's Analysis header pill reads Processing, with no title", Boolean(queuedHeader) && queuedHeader.cls === 'badge badge-proc' && queuedHeader.text === 'Processing' && queuedHeader.title === null, queuedHeader);
  await clickAt('.icon-btn[aria-label="Back to studies"]');
  await cdp.settle(150);
  await clickAt('.studies-row[data-study-id="SP-9001"]');
  await cdp.settle(200);
  // (2026-10-01, issue #39 port, P4) SP-9001 is Failed since section 11: outside the batch its card
  // reads FAILED with the stored reason, and the same Run segmentation button is disabled for the
  // batch, by UNSEGMENTED's rules.
  const outsideCard = await cdp.evaluate(`(() => {
    const card = document.querySelector('.run-card');
    return {
      visible: Boolean(card) && !card.classList.contains('is-hidden'),
      eyebrow: document.querySelector('.run-eyebrow')?.textContent, title: document.querySelector('.run-title')?.textContent,
      body: document.querySelector('.run-body')?.textContent, label: document.querySelector('.run-button')?.textContent,
      disabled: document.querySelector('.run-button')?.disabled, buttonTitle: document.querySelector('.run-button')?.title,
    };
  })()`);
  check('a Failed film outside the batch reads FAILED with its stored reason, its run button disabled for the batch',
    outsideCard.visible === true && outsideCard.eyebrow === 'FAILED' && outsideCard.title === 'Segmentation failed' && outsideCard.body === FILE_NOT_FOUND_REASON
    && outsideCard.label === 'Run segmentation' && outsideCard.disabled === true && outsideCard.buttonTitle === 'Wait for the batch to finish', outsideCard);
  await clickAt('.icon-btn[aria-label="Back to studies"]');
  await cdp.settle(150);

  // Bounded to two minutes: one film, up to a minute on a cold backend. A missed window fails fast.
  const oneDone12 = await waitForState('s.batch !== null && s.batch.done === 1', 120000);
  const progress12b = await readProgress();
  check('after the first film the bar reads 1 of 2 done and the sidebar 1 OF 2 DONE', oneDone12 === true && progress12b.text === '1 of 2 done' && progress12b.sidebar === '1 OF 2 DONE', progress12b);
  // (2026-10-01, issue #39 port, P1) Each film changes to its result as its turn ends: the first has
  // left Processing for its own status, and the second, waiting or by now in flight, still reads
  // Processing.
  const pills12b = {
    first: await statusPill(cdp, '.studies-row[data-study-id="SP-9003"] .badge'),
    second: await statusPill(cdp, '.studies-row[data-study-id="SP-9002"] .badge'),
  };
  check('after the first turn the film it ran reads its result and the other still reads Processing',
    oneDone12 === true && Boolean(pills12b.first) && ['badge badge-seg', 'badge badge-rev'].includes(pills12b.first.cls)
    && pills12b.second?.cls === 'badge badge-proc' && pills12b.second.text === 'Processing', pills12b);
  const finished12 = await waitForState('s.batch === null', 400000);
  s = await cdp.state();
  const a12 = s.studies.find((x) => x.id === 'SP-9002');
  const b12 = s.studies.find((x) => x.id === 'SP-9003');
  check('both films carry measurements and geometry when the batch ends', finished12 === true && Boolean(a12 && a12.measurements && a12.geometry) && Boolean(b12 && b12.measurements && b12.geometry), { a: Boolean(a12 && a12.measurements), b: Boolean(b12 && b12.measurements) });
  check('the closing toast reports the batch', s.toast === 'Segmented 2 of 2 films.', s.toast);
  const after12 = await readProgress();
  check('running is clear, the sidebar sublabel is gone and the segment button is back', s.running === null && after12.sidebar === null && after12.segmentButton === true, { running: s.running, ...after12 });
  const summaryAfter12 = await summaryParts();
  check('the summary lost two unsegmented films', summaryBefore12 !== null && summaryAfter12 !== null && summaryAfter12.unsegmented === summaryBefore12.unsegmented - 2, { before: summaryBefore12, after: summaryAfter12 });
  const bar12After = await readBar();
  check('the ticks survive the batch and the button says every selected film is segmented', s.paramSelected.includes('SP-9002') && s.paramSelected.includes('SP-9003') && bar12After.label === 'Segment 0 selected' && bar12After.note === 'All selected studies are segmented', { selected: s.paramSelected, ...bar12After });

  // 13. Stop finishes the film in flight and starts no other (spec 11).
  await injectFilm({ id: 'SP-9004', fileName: 'batch-c.jpg', filePath: null, workspaceFolder: null, base64: SAMPLE_BASE64 });
  await injectFilm({ id: 'SP-9005', fileName: 'batch-d.jpg', filePath: null, workspaceFolder: null, base64: SAMPLE_BASE64 });
  await cdp.setState('{ paramSelected: ["SP-9004", "SP-9005"] }');
  await cdp.settle(200);
  await clickAt('[data-find-key="segment"]');
  const started13 = await waitForState('s.batch !== null && s.running !== null', 5000);
  const running13 = (await cdp.state()).running;
  check('the second batch starts with SP-9005 in flight', started13 === true && running13 === 'SP-9005', running13);
  // (2026-10-01, issue #39 port, P1) Both films read Processing from the click. On Stop the film still
  // waiting goes straight back to its own status (it will not run); the film in flight stays
  // Processing until it finishes. The pills are read BEFORE the state below, so `running` still
  // naming SP-9005 there proves it was in flight when they were read.
  const readPills13 = async () => ({
    inFlight: await statusPill(cdp, '.studies-row[data-study-id="SP-9005"] .badge'),
    waiting: await statusPill(cdp, '.studies-row[data-study-id="SP-9004"] .badge'),
  });
  const pills13a = await readPills13();
  await clickAt('[data-find-key="stop"]');
  await cdp.settle(150);
  const stopping13 = await readProgress();
  const pills13b = await readPills13();
  s = await cdp.state();
  check('Stop marks the batch stopping: the text, the disabled Stop and the sidebar say so', stopping13.text === 'Stopping after this film…' && stopping13.stopDisabled === true && stopping13.sidebar === 'STOPPING', stopping13);
  check('the film in flight keeps running after Stop', s.running === 'SP-9005' && s.batch && s.batch.stopping === true, { running: s.running, batch: s.batch });
  check('both films read Processing before Stop; after it the film left waiting reads Unsegmented and the film in flight still Processing',
    pills13a.inFlight?.cls === 'badge badge-proc' && pills13a.waiting?.cls === 'badge badge-proc'
    && s.running === 'SP-9005' && pills13b.inFlight?.cls === 'badge badge-proc' && pills13b.inFlight.text === 'Processing'
    && pills13b.waiting?.cls === 'badge badge-unseg' && pills13b.waiting.text === 'Unsegmented' && pills13b.waiting.title === null,
    { before: pills13a, after: pills13b, running: s.running });
  const finished13 = await waitForState('s.batch === null', 400000);
  s = await cdp.state();
  const c13 = s.studies.find((x) => x.id === 'SP-9004');
  const d13 = s.studies.find((x) => x.id === 'SP-9005');
  // (2026-10-01, issue #39 port) Stop is never a failure: the film it left behind is not Failed.
  check('the batch ends after the film in flight, the other left unsegmented and not Failed',
    finished13 === true && Boolean(d13 && d13.measurements) && Boolean(c13) && c13.measurements === null && (c13.processingError ?? null) === null && (c13.processingErrorAt ?? null) === null,
    { c: Boolean(c13 && c13.measurements), d: Boolean(d13 && d13.measurements), cError: c13 ? (c13.processingError ?? null) : null });
  check('the toast says the batch stopped', s.toast === 'Segmented 1 of 2 films, then stopped.', s.toast);
  const bar13 = await readBar();
  check('the bar offers the film Stop left behind and notes the one it segmented', bar13.label === 'Segment 1 selected' && bar13.disabled === false && bar13.note === '1 already segmented', bar13);

  // 14. No new console errors or exceptions across the batch sections.
  check('no console errors or exceptions during the batch sections', cdp.errors.length === errorsAfter9, cdp.errors.slice(errorsAfter9));

  // 14b (2026-10-01, issue #39 port, P3 and P4). The Failed film on its Analysis screen with no run and
  // no batch up: the header pill with its dated tooltip, the red region note and the FAILED card,
  // whose Run segmentation button is enabled now, by UNSEGMENTED's rules. Nothing on it is clicked:
  // SP-9001 has no bytes and no file, so a run would open the native relocate picker and wedge the
  // suite. SP-9001 is lumbar (injectFilm writes no region), so no original preview loads and nothing
  // follows the reason in the note. It stays Failed through sections 15-17, so section 15's sort meets
  // a Failed row; section 18 clears it.
  const errorsBefore14b = cdp.errors.length;
  const regionNote = () => cdp.evaluate(`(() => { const e = document.querySelector('.analysis-region-bar .meas-note'); return e ? { text: e.textContent, failed: e.classList.contains('is-failed') } : null; })()`);
  const runCardState = () => cdp.evaluate(`(() => {
    const card = document.querySelector('.run-card');
    return {
      visible: Boolean(card) && !card.classList.contains('is-hidden'),
      eyebrow: document.querySelector('.run-eyebrow')?.textContent ?? null, title: document.querySelector('.run-title')?.textContent ?? null,
      body: document.querySelector('.run-body')?.textContent ?? null, label: document.querySelector('.run-button')?.textContent ?? null,
      disabled: document.querySelector('.run-button')?.disabled ?? null,
    };
  })()`);
  await cdp.setState(`{ screen: "studies", query: "", paramFilters: ${FILTERS_RESET}, paramSelected: [] }`);
  await cdp.settle(200);
  await clickAt('.studies-row[data-study-id="SP-9001"]');
  await cdp.settle(200);
  s = await cdp.state();
  const sp9001at14b = s.studies.find((x) => x.id === 'SP-9001');
  const header14b = await statusPill(cdp, '.analysis-status .badge');
  check('SP-9001 opens with a Failed header pill titled with the dated line and its stored reason',
    s.screen === 'analysis' && s.openId === 'SP-9001' && Boolean(sp9001at14b) && Boolean(header14b) && header14b.cls === 'badge badge-fail' && header14b.text === 'Failed'
    && header14b.title === failedTitle(FILE_NOT_FOUND_REASON, sp9001at14b.processingErrorAt),
    { screen: s.screen, openId: s.openId, header14b });
  const note14b = await regionNote();
  check('the region note reads "Last run failed: " and the stored reason, in the failed colour',
    Boolean(note14b) && note14b.text === `Last run failed: ${FILE_NOT_FOUND_REASON}` && note14b.failed === true, note14b);
  const card14b = await runCardState();
  check('the stage card reads FAILED, Segmentation failed and the stored reason, with an enabled Run segmentation button',
    card14b.visible === true && card14b.eyebrow === 'FAILED' && card14b.title === 'Segmentation failed' && card14b.body === FILE_NOT_FOUND_REASON
    && card14b.label === 'Run segmentation' && card14b.disabled === false, card14b);
  await clickAt('.icon-btn[aria-label="Back to studies"]');
  await cdp.settle(200);
  check('no console errors or exceptions during section 14b', cdp.errors.length === errorsBefore14b, cdp.errors.slice(errorsBefore14b));
  // ---------------------------------------------------------------------------------------------
  // 15-17 (2026-09-10, studies-table spec): sortable headers, the SUBJECT editor, Delete selected.
  // ---------------------------------------------------------------------------------------------
  const errorsAfter14 = cdp.errors.length;
  await cdp.setState(`{ screen: "studies", query: "", paramFilters: ${FILTERS_RESET}, paramSelected: [], findSort: { key: "date", dir: "desc" } }`);
  await cdp.settle(200);
  const badgeOrder = () => cdp.evaluate(`[...document.querySelectorAll('.studies-row')].map((r) => (r.querySelector('.badge') || {}).className || '')`);
  // (2026-10-01, issue #39 port) find.js STATUS_RANK, port spec 3: fail 0, proc 1, unseg 2, rev 3,
  // seg 4, ok 5. (2026-10-15, annotation editor round 2, spec §4.2) Hand-placed between Needs review and
  // Segmented: fail 0, proc 1, unseg 2, rev 3, hand 4, seg 5, ok 6.
  const rank = (c) => (c.includes('badge-fail') ? 0 : c.includes('badge-proc') ? 1 : c.includes('badge-unseg') ? 2 : c.includes('badge-rev') ? 3
    : c.includes('badge-hand') ? 4 : c.includes('badge-seg') ? 5 : c.includes('badge-ok') ? 6 : 9);
  const activeKey = () => cdp.evaluate(`document.activeElement ? document.activeElement.getAttribute('data-find-key') : null`);

  // 15. Sort (spec 6). SP-9000 is segmented, SP-9001 Failed (section 11), SP-9004 Unsegmented (section
  // 13), the demos segmented: an ascending sort puts the Failed row first (port spec 3).
  const dateMark = await cdp.evaluate(`document.querySelector('[data-find-key="sort-date"]')?.textContent ?? null`);
  check('DATE carries the descending mark by default', typeof dateMark === 'string' && dateMark.includes('\u25BE'), dateMark);
  await clickAt('[data-find-key="sort-status"]');
  await cdp.settle(150);
  s = await cdp.state();
  check('clicking STATUS sorts ascending by status', s.findSort.key === 'status' && s.findSort.dir === 'asc', s.findSort);
  const badgesAsc = await badgeOrder();
  check('ascending status never puts a higher rank before a lower one', badgesAsc.length > 0 && badgesAsc.map(rank).every((r, i, a) => i === 0 || a[i - 1] <= r), badgesAsc);
  const statusMark = await cdp.evaluate(`document.querySelector('[data-find-key="sort-status"]')?.textContent ?? null`);
  check('the STATUS header carries the ascending mark and kept focus across the rebuild', typeof statusMark === 'string' && statusMark.includes('\u25B4') && (await activeKey()) === 'sort-status', { statusMark, active: await activeKey() });
  await clickAt('[data-find-key="sort-status"]');
  await cdp.settle(150);
  const badgesDesc = await badgeOrder();
  check('clicking STATUS again reverses it', (await cdp.state()).findSort.dir === 'desc' && badgesDesc.map(rank).every((r, i, a) => i === 0 || a[i - 1] >= r), badgesDesc);
  await clickAt('[data-find-key="sort-study"]');
  await cdp.settle(150);
  const namesAsc = await cdp.evaluate(`[...document.querySelectorAll('.studies-row .studies-name')].map((e) => e.textContent.toLowerCase())`);
  check('clicking STUDY sorts the names ascending, case-insensitively', (await cdp.state()).findSort.key === 'study' && namesAsc.length > 1 && namesAsc.every((v, i, a) => i === 0 || a[i - 1] <= v), namesAsc);
  await cdp.setState('{ findSort: { key: "date", dir: "desc" } }');
  await cdp.settle(150);

  // 16. The SUBJECT editor on a real row (spec 7.2). SP-9000 has no subject yet.
  const cell16 = await cdp.rect('[data-find-key="subject-SP-9000"]');
  const cellText16 = ((await text(cdp, '[data-find-key="subject-SP-9000"]')) || '').trim();
  check('a real row has a click-to-edit SUBJECT cell reading an em dash', Boolean(cell16) && cellText16 === '\u2014', { cell16, cellText16 });
  const demoCell16 = await cdp.evaluate(`Boolean(document.querySelector('[data-find-key="subject-SP-0042"]'))`);
  check('a demo row has no editor', demoCell16 === false, demoCell16);
  if (cell16) await cdp.click(cell16.cx, cell16.cy);
  await cdp.settle(150);
  s = await cdp.state();
  const editor16 = await cdp.evaluate(`(() => { const i = document.querySelector('[data-find-key="subject-input-SP-9000"]'); return i ? { focused: document.activeElement === i, value: i.value } : null; })()`);
  check('clicking the cell opens an editor with focus and does not open the study', s.screen === 'studies' && Boolean(editor16) && editor16.focused === true && editor16.value === '', { screen: s.screen, editor16 });
  await cdp.typeText('S-42');
  await cdp.key('Enter');
  await cdp.settle(200);
  s = await cdp.state();
  check('Enter stores the trimmed subject on the record', s.studies.find((x) => x.id === 'SP-9000')?.subjectId === 'S-42', s.studies.find((x) => x.id === 'SP-9000')?.subjectId ?? null);
  const after16 = await cdp.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.studies-row')];
    const i = rows.findIndex((r) => r.dataset.studyId === 'SP-9000');
    const below = rows.slice(i + 1).find((r) => r.querySelector('.studies-subject-editable, .studies-subject-input'));
    const active = document.activeElement;
    return { cell: document.querySelector('[data-find-key="subject-SP-9000"]')?.textContent.trim() ?? null, below: below ? below.dataset.studyId : null, active: active ? active.getAttribute('data-find-key') : null };
  })()`);
  check('the cell shows the new subject', after16.cell === 'S-42', after16);
  check("Enter opened the next real row's editor, or stayed on the cell when none is below", after16.below ? after16.active === `subject-input-${after16.below}` : after16.active === 'subject-SP-9000', after16);
  await cdp.key('Escape');
  await cdp.settle(150);
  const cell16b = await cdp.rect('[data-find-key="subject-SP-9000"]');
  if (cell16b) await cdp.click(cell16b.cx, cell16b.cy);
  await cdp.settle(150);
  const reopened16 = await cdp.evaluate(`(() => { const i = document.querySelector('[data-find-key="subject-input-SP-9000"]'); return i ? { value: i.value, selected: i.selectionStart === 0 && i.selectionEnd === i.value.length } : null; })()`);
  check('reopening pre-fills the stored subject with the text selected', Boolean(reopened16) && reopened16.value === 'S-42' && reopened16.selected === true, reopened16);
  await cdp.typeText('zzz');
  await cdp.key('Escape');
  await cdp.settle(150);
  s = await cdp.state();
  check('Escape discards the typed text and returns focus to the cell', s.studies.find((x) => x.id === 'SP-9000')?.subjectId === 'S-42' && (await activeKey()) === 'subject-SP-9000', { subject: s.studies.find((x) => x.id === 'SP-9000')?.subjectId, active: await activeKey() });

  // 16b (spec 7.3): a rebuild while the editor is open must re-create it with the text typed so
  // far, the focus and the caret. The rebuild is forced through a store key the Find tab reads but
  // this row does not -- another row's tick -- so nothing about SP-9000 changes underneath it.
  await clickAt('[data-find-key="subject-SP-9000"]');
  await cdp.settle(150);
  // The stored 'S-42' opens selected, so insertText REPLACES it: the draft is 'AB', caret at 2.
  await cdp.typeText('AB');
  await cdp.setState('{ paramSelected: ["SP-9001"] }');
  await cdp.settle(200);
  const rebuilt16 = await cdp.evaluate(`(() => {
    const i = document.querySelector('[data-find-key="subject-input-SP-9000"]');
    if (!i) return { exists: false, value: null, focused: false, start: null, end: null };
    return { exists: true, value: i.value, focused: document.activeElement === i, start: i.selectionStart, end: i.selectionEnd };
  })()`);
  check('a rebuild while the editor is open keeps the editor, the draft and the caret (spec 7.3)',
    rebuilt16.exists && rebuilt16.value === 'AB' && rebuilt16.focused && rebuilt16.start === 2 && rebuilt16.end === 2, rebuilt16);
  await cdp.key('Escape');
  await cdp.settle(150);
  s = await cdp.state();
  check('the rebuild, and the Escape after it, leave the stored subject alone', s.studies.find((x) => x.id === 'SP-9000')?.subjectId === 'S-42', s.studies.find((x) => x.id === 'SP-9000')?.subjectId ?? null);
  await cdp.setState('{ paramSelected: [] }');
  await cdp.settle(150);
  // If the deferred blur commit above fired, the record is holding the draft instead of the
  // stored subject. Put it back, so the checks below test what they have always tested; when the
  // editor survives a rebuild as spec 7.3 requires, this write changes nothing.
  await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: s.studies.map((x) => (x.id === 'SP-9000' ? { ...x, subjectId: 'S-42' } : x)) })))`);
  await cdp.settle(150);

  // 16c (spec 8.2): a study carrying reviewedAt badges Reviewed on the list and leaves the
  // summary's TO REVIEW clause -- if it was in it, which depends on what the real run produced,
  // so the expectation is computed from the badge the row had before. There is no control for the
  // mark on this screen; it is written through the store, the way the Analysis button writes it.
  const toReviewCount = async () => {
    const line = ((await text(cdp, '.studies-summary')) || '').trim();
    const m = /^(\d+) STUDIES \u00B7 (\d+) UNSEGMENTED \u00B7 (\d+) TO REVIEW$/.exec(line);
    return m ? Number(m[3]) : null;
  };
  const badgeOf9000 = () => cdp.evaluate(`(() => { const b = document.querySelector('.studies-row[data-study-id="SP-9000"] .badge'); return b ? { cls: b.className, text: b.textContent.trim() } : null; })()`);
  const review0 = await toReviewCount();
  const badge0 = await badgeOf9000();
  const mark = (value) => cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: s.studies.map((x) => (x.id === 'SP-9000' ? { ...x, reviewedAt: ${value} } : x)) })))`);
  await mark(`'2026-09-10T12:00:00.000Z'`);
  await cdp.settle(200);
  const badge1 = await badgeOf9000();
  check('a row carrying reviewedAt badges Reviewed on the list', Boolean(badge1) && badge1.cls === 'badge badge-ok' && badge1.text === 'Reviewed', { badge0, badge1 });
  // (2026-10-15, spec §4.2) Hand-placed counts in TO REVIEW as Needs review does, so marking either leaves it.
  const expected1 = badge0 && (badge0.cls.includes('badge-rev') || badge0.cls.includes('badge-hand')) ? review0 - 1 : review0;
  const review1 = await toReviewCount();
  check("the summary's TO REVIEW count follows the mark", typeof review0 === 'number' && review1 === expected1, { review0, expected1, review1, badge0 });
  await mark('null');
  await cdp.settle(200);
  const badge2 = await badgeOf9000();
  check('clearing the mark restores the derived badge', Boolean(badge0) && Boolean(badge2) && badge2.cls === badge0.cls && badge2.text === badge0.text, { badge0, badge2 });

  await cdp.setState('{ query: "S-42" }');
  await cdp.settle(150);
  check('the search box finds the study by its new subject', (await rowCount(cdp)) === 1, await rowCount(cdp));
  await clearSearch(cdp);
  await cdp.settle(150);

  // 17. Delete selected (spec 5). Two throwaway films, no bytes, no file: nothing to segment, and
  // no sidecar to delete, so deletePrediction's ENOENT-is-fine path is what runs.
  await injectFilm({ id: 'SP-9002', fileName: 'gone-a.png', filePath: 'C:\\smoke\\Fusion2025\\post-op\\gone-a.png', workspaceFolder: 'C:\\smoke\\Fusion2025', base64: null });
  await injectFilm({ id: 'SP-9003', fileName: 'gone-b.png', filePath: 'C:\\smoke\\Fusion2025\\post-op\\gone-b.png', workspaceFolder: 'C:\\smoke\\Fusion2025', base64: null });
  await cdp.setState('{ paramSelected: [], query: "gone" }');
  await cdp.settle(200);
  const countBefore17 = (await cdp.state()).studies.length;
  const readDelete = () => cdp.evaluate(`(() => { const b = document.querySelector('[data-find-key="delete"]'); return b ? { label: b.textContent, disabled: b.disabled, title: b.title } : null; })()`);
  const promptUp = () => cdp.evaluate(`Boolean(document.querySelector('[data-find-key="delete-prompt"]'))`);
  const d0 = await readDelete();
  check('with nothing ticked the bar reads Delete, disabled, and says to tick studies', Boolean(d0) && d0.label === 'Delete' && d0.disabled === true && d0.title === 'Tick studies to delete', d0);
  const deleteAllGone = await cdp.evaluate(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Delete all studies')`);
  check('no library-level Delete all studies control remains', deleteAllGone === false, deleteAllGone);
  await clickAt('input[data-find-key="select-all"]');
  await cdp.settle(150);
  s = await cdp.state();
  check('select-all over the searched rows ticks the two throwaway films', s.paramSelected.length === 2 && s.paramSelected.includes('SP-9002') && s.paramSelected.includes('SP-9003'), s.paramSelected);
  const d1 = await readDelete();
  check('the bar reads Delete 2 selected, enabled', Boolean(d1) && d1.label === 'Delete 2 selected' && d1.disabled === false, d1);
  await cdp.setState('{ query: "gone-a" }');
  await cdp.settle(150);
  const d2 = await readDelete();
  check('a tick hidden by the search is not counted: Delete 1 selected', Boolean(d2) && d2.label === 'Delete 1 selected', d2);
  await cdp.setState('{ query: "gone" }');
  await cdp.settle(150);
  await clickAt('[data-find-key="delete"]');
  await cdp.settle(150);
  const prompt17 = await cdp.evaluate(`(() => { const p = document.querySelector('[data-find-key="delete-prompt"]'); return p ? { text: p.querySelector('span')?.textContent, focus: document.activeElement?.getAttribute('data-find-key') } : null; })()`);
  check('Delete replaces the bar with a prompt naming two studies, focus on Cancel', Boolean(prompt17) && prompt17.text === 'Delete 2 studies, including their saved results? Original image files will be kept.' && prompt17.focus === 'delete-cancel', prompt17);
  await cdp.key('Escape');
  await cdp.settle(150);
  check('Escape withdraws the prompt and hands focus back to Delete', (await promptUp()) === false && (await activeKey()) === 'delete', { prompt: await promptUp(), active: await activeKey() });
  await clickAt('[data-find-key="delete"]');
  await cdp.settle(150);
  await clickAt('input[data-find-key="row-SP-9003"]');
  await cdp.settle(150);
  const d3 = await readDelete();
  check('changing a tick withdraws the prompt', (await promptUp()) === false && Boolean(d3) && d3.label === 'Delete 1 selected', d3);
  await clickAt('input[data-find-key="row-SP-9003"]');
  await cdp.settle(150);
  await clickAt('[data-find-key="delete"]');
  await cdp.settle(150);
  await clickAt('[data-find-key="delete-confirm"]');
  const gone17 = await waitForState(`s.studies.length === ${countBefore17 - 2} && !s.deletingStudies`, 5000);
  s = await cdp.state();
  check('Delete permanently removes the two records and nothing else', gone17 && !s.studies.some((x) => x.id === 'SP-9002' || x.id === 'SP-9003') && s.studies.some((x) => x.id === 'SP-9000'), { gone17, count: s.studies.length });
  check('their ticks are pruned and the search is untouched', s.paramSelected.length === 0 && s.query === 'gone', { selected: s.paramSelected, query: s.query });
  check('the toast reports the count', String(s.toast || '').startsWith('Deleted 2 studies.'), s.toast);
  await clearSearch(cdp);
  await cdp.settle(150);
  const summary17 = ((await text(cdp, '.studies-summary')) || '').trim();
  check('the summary carries the TO REVIEW clause after the delete', /^\d+ STUDIES \u00B7 \d+ UNSEGMENTED \u00B7 \d+ TO REVIEW$/.test(summary17), summary17);
  check('no console errors or exceptions during sections 15-17', cdp.errors.length === errorsAfter14, cdp.errors.slice(errorsAfter14));

  // 18 (2026-10-01, issue #39 port, P6). A Region or Orientation change clears the stored failure and
  // its time on the write, as it clears reviewedAt (1.0.13's changeRegion; port spec 4). It runs last
  // so that sections 15-17 met SP-9001 Failed, and after the batches because changeRegion refuses
  // while a batch or a run is up. SP-9001 is lumbar, which hides its Orientation select, so the Region
  // select is the one changed -- to Auto detect, its value set and `change` dispatched the way
  // smoke-cervical.mjs drives it. Auto detect then asks for the original preview, which this film
  // cannot give (no bytes, no file), so the note reads that message instead of the failure.
  const errorsBefore18 = cdp.errors.length;
  await cdp.setState(`{ screen: "studies", query: "", paramFilters: ${FILTERS_RESET}, paramSelected: [] }`);
  await cdp.settle(200);
  await clickAt('.studies-row[data-study-id="SP-9001"]');
  await cdp.settle(200);
  s = await cdp.state();
  const before18 = s.studies.find((x) => x.id === 'SP-9001');
  const region18 = await cdp.evaluate(`(() => { const e = document.querySelector('[aria-label="Spine region"]'); if (!e) return null; e.value = 'auto'; e.dispatchEvent(new Event('change', { bubbles: true })); return e.value; })()`);
  await cdp.settle(200);
  const after18 = (await cdp.state()).studies.find((x) => x.id === 'SP-9001');
  check('on the Failed SP-9001, changing the Region clears processingError and processingErrorAt and leaves the film unsegmented',
    s.openId === 'SP-9001' && Boolean(before18) && before18.processingError === FILE_NOT_FOUND_REASON && typeof before18.processingErrorAt === 'string'
    && region18 === 'auto' && Boolean(after18) && after18.region === 'auto' && after18.processingError === null && after18.processingErrorAt === null && after18.measurements === null,
    { openId: s.openId, before: before18 ? [before18.processingError, before18.processingErrorAt] : null, region18, after: after18 ? [after18.region, after18.processingError, after18.processingErrorAt] : null });
  const header18 = await statusPill(cdp, '.analysis-status .badge');
  const note18 = await regionNote();
  const card18 = await runCardState();
  check('the header pill reads Unsegmented with no title, and neither the region note nor the card carries the failure',
    Boolean(header18) && header18.cls === 'badge badge-unseg' && header18.text === 'Unsegmented' && header18.title === null
    && Boolean(note18) && !note18.text.startsWith('Last run failed') && note18.failed === false
    && card18.visible === true && card18.eyebrow === 'UNSEGMENTED',
    { header18, note18, card18 });
  await clickAt('.icon-btn[aria-label="Back to studies"]');
  await cdp.settle(200);
  const row18 = await statusPill(cdp, '.studies-row[data-study-id="SP-9001"] .badge');
  check('back on the list SP-9001 reads Unsegmented with no title', Boolean(row18) && row18.cls === 'badge badge-unseg' && row18.text === 'Unsegmented' && row18.title === null, row18);
  check('no console errors or exceptions during section 18', cdp.errors.length === errorsBefore18, cdp.errors.slice(errorsBefore18));

  // ---------------------------------------------------------------------------------------------
  // 19 (2026-11-16, study flags, Task 7; spec 3 and 4.3). The FLAGS column, its in-row editor and its header menu. Three
  // throwaway films, no bytes (the same injectFilm as sections 10-13), searched out of the list by the name they share
  // and sorted to the end of it by STUDY, so the last row of the list is a row this section may edit. Flags are set on
  // them through the store where a check needs a starting library; every edit being tested is driven with trusted
  // keys and clicks. The editor's draft lives in screens/studies.js, so each check reads the page and the store, not the
  // module. The window is resized (check 10) with the DevTools device-metrics override and put back in a finally.
  // ---------------------------------------------------------------------------------------------
  const errorsBefore19 = cdp.errors.length;
  // What the list looked like when section 19 began, put back when section 20 ends (the sort, filters, search and ticks these
  // sections change are the next suite's starting list when it runs on this launch).
  const listBefore19 = await cdp.evaluate(`import('./renderer/store.js').then((m) => { const s = m.getState(); return { query: s.query, findSort: s.findSort, findFilters: s.findFilters, paramFilters: s.paramFilters, paramSelected: s.paramSelected, studiesTab: s.studiesTab, screen: s.screen, openId: s.openId }; })`);
  const FLAG_RESET = '{ subject: "", region: [], view: [], workspace: [], folder: [], status: [], flags: [], flagsMatch: "any" }';
  const [FA, FB, FC] = ['SP-9101', 'SP-9102', 'SP-9103'];
  for (const [id, fileName] of [[FA, 'zzflag-a.png'], [FB, 'zzflag-b.png'], [FC, 'zzflag-c.png']]) {
    await injectFilm({ id, fileName, filePath: null, workspaceFolder: null, base64: null });
  }
  const resetFlagsView = (extra = '') => cdp.setState(`{ screen: "studies", openId: null, query: "zzflag", paramFilters: ${FILTERS_RESET}, findFilters: ${FLAG_RESET}, paramSelected: [], findSort: { key: "study", dir: "asc" }, navCollapsed: false${extra} }`);
  // Sets the flags of the named films straight in the store (the starting library for a check), one repaint.
  const putFlags = (map) => cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: s.studies.map((x) => (Object.prototype.hasOwnProperty.call(${JSON.stringify(map)}, x.id) ? { ...x, flags: ${JSON.stringify(map)}[x.id] } : x)) })))`);
  const flagsOf = (id) => cdp.evaluate(`import('./renderer/store.js').then((m) => m.getState().studies.find((x) => x.id === ${JSON.stringify(id)})?.flags ?? null)`);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const rowIds = () => cdp.evaluate(`[...document.querySelectorAll('.studies-row')].map((r) => r.dataset.studyId)`);
  // The open editor as the page shows it. `active` lists every highlighted option's index (none when nothing is).
  const editorNow = (id) => cdp.evaluate(`(() => {
    const input = document.querySelector('[data-find-key="flags-${id}-input"]');
    const editors = document.querySelectorAll('.flag-editor').length;
    if (!input) return { open: false, editors, active: document.activeElement?.getAttribute('data-find-key') ?? null };
    const popup = document.querySelector('.flag-popup');
    const options = popup ? [...popup.querySelectorAll('.flag-option')] : [];
    return {
      open: true, editors, value: input.value, focused: document.activeElement === input, start: input.selectionStart, end: input.selectionEnd,
      chips: [...document.querySelectorAll('.flag-editor .flag-chip-text')].map((c) => c.textContent),
      options: options.map((o) => o.textContent), highlighted: options.map((o, i) => (o.classList.contains('is-active') ? i : -1)).filter((i) => i >= 0),
    };
  })()`);
  const openFlags = async (id) => { await clickAt(`[data-find-key="flags-${id}"]`); await cdp.settle(200); };
  const rectOf = (selector) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; })()`);
  const sorted = (list) => [...list].sort();

  // 19.1 The column: last header with a funnel, a muted dash, ten tracks, a plain demo cell.
  await resetFlagsView(', query: ""');
  await putFlags({ [FA]: ['OLIF outcomes', 'hardware'], [FB]: [], [FC]: ['cement'] });
  await cdp.settle(250);
  const col1 = await cdp.evaluate(`(() => {
    const heads = [...document.querySelectorAll('.studies-table-head > div')];
    const labelOf = (d) => { const b = d.querySelector('.param-sort'); return (b ? b.textContent.replace(/[\\u25B4\\u25BE]/g, '') : d.textContent).trim(); };
    const dash = document.querySelector('.studies-row[data-study-id="${FB}"] .studies-cell-flags .flag-none');
    const name = document.querySelector('.studies-row[data-study-id="${FB}"] .studies-cell-id');
    const demo = document.querySelector('.studies-row[data-study-id="SP-0042"] .studies-cell-flags');
    return {
      labels: heads.map(labelOf),
      funnelIn: heads.findIndex((d) => d.querySelector('[data-find-key="filter-flags"]')),
      tracks: getComputedStyle(document.querySelector('.studies-table-head')).gridTemplateColumns.trim().split(/\\s+/).length,
      dash: dash ? dash.textContent : null, dashColour: dash ? getComputedStyle(dash).color : null, nameColour: name ? getComputedStyle(name).color : null,
      demoDash: demo ? demo.textContent.trim() : null, demoEditable: Boolean(document.querySelector('[data-find-key="flags-SP-0042"]')),
      chipsA: [...document.querySelectorAll('.studies-row[data-study-id="${FA}"] .studies-cell-flags .flag-chip-text')].map((c) => c.textContent),
    };
  })()`);
  check('FLAGS is the last labelled header, after STATUS, and carries a funnel',
    col1.labels.length === 10 && col1.labels[8] === 'FLAGS' && col1.labels[7] === 'STATUS' && col1.funnelIn === 8, col1);
  check('the list grid has ten tracks', col1.tracks === 10, col1.tracks);
  check('a film with no flags shows a muted dash, and a film with flags shows its chips', col1.dash === '—' && col1.dashColour !== col1.nameColour && same(col1.chipsA, ['OLIF outcomes', 'hardware']), col1);
  check('a demo row shows the dash and has no editable cell', col1.demoDash === '—' && col1.demoEditable === false, col1);

  await cdp.setState('{ query: "zzflag" }');
  await cdp.settle(200);

  // 19.2 A click opens the editor, not the study; the box has focus; the list offers the flags in use, none highlighted.
  await openFlags(FB);
  const open2 = await editorNow(FB);
  s = await cdp.state();
  check('clicking a FLAGS cell opens its editor with focus in the box and does not open the study',
    s.screen === 'studies' && s.openId === null && open2.open === true && open2.focused === true && open2.editors === 1, { screen: s.screen, openId: s.openId, open2 });
  check('the list under the empty box offers the flags in use, with nothing highlighted',
    same(sorted(open2.options || []), sorted(['OLIF outcomes', 'hardware', 'cement'])) && same(open2.highlighted, []), open2);

  // 19.3 Typing: a pasted list becomes chips, the box empties, `ce` offers Create and not cement, the first suggestion
  // is highlighted once there is text, Enter adds it; the x and Backspace remove.
  await cdp.typeText('#hardware, cement');
  await cdp.settle(200);
  const typed3 = await editorNow(FB);
  check('typing "#hardware, cement" makes two chips in the library\'s spelling and empties the box',
    typed3.open && same(typed3.chips, ['hardware', 'cement']) && typed3.value === '' && typed3.focused === true, typed3);
  check('with the box empty after an add nothing is highlighted', same(typed3.highlighted, []), typed3);
  await cdp.typeText('ce');
  await cdp.settle(200);
  const ce3 = await editorNow(FB);
  check('typing "ce" offers Create "ce" and does not offer cement, which is in the draft, with the first suggestion highlighted',
    same(ce3.options, ['Create "ce"']) && same(ce3.highlighted, [0]) && ce3.value === 'ce' && ce3.focused === true, ce3);
  await cdp.key('Enter');
  await cdp.settle(200);
  const added3 = await editorNow(FB);
  check('Enter with text typed adds the highlighted suggestion and empties the box, the editor still open',
    added3.open && same(added3.chips, ['hardware', 'cement', 'ce']) && added3.value === '' && same(added3.highlighted, []) && added3.focused === true, added3);
  check('the draft is not written until the editor closes', same(await flagsOf(FB), []), await flagsOf(FB));
  await clickAt(`[data-find-key="flags-${FB}-remove-2"]`);
  await cdp.settle(200);
  const removed3 = await editorNow(FB);
  check('the x on a chip removes it and the box keeps focus', removed3.open && same(removed3.chips, ['hardware', 'cement']) && removed3.focused === true, removed3);
  await cdp.key('Backspace');
  await cdp.settle(200);
  const back3 = await editorNow(FB);
  check('Backspace in the empty box removes the last chip', back3.open && same(back3.chips, ['hardware']) && back3.focused === true, back3);

  // 19.4 A click on another row's cell saves this row's draft and opens that row's editor. FA is above FB, so FB's own
  // list (which sits under its row) does not cover it.
  await openFlags(FA);
  const after4 = await editorNow(FA);
  check('ONE pointer click on another row\'s resting FLAGS cell saves the first row\'s draft and leaves the second row\'s editor open with focus in its box, one editor only',
    same(await flagsOf(FB), ['hardware']) && after4.open && after4.focused === true && after4.editors === 1 && !(await editorNow(FB)).open, { b: await flagsOf(FB), after4 });

  // 19.5 Esc, Enter in an empty box, Tab.
  await cdp.typeText('dropme,');
  await cdp.settle(200);
  check('a chip added in the open editor is only in the draft', same((await editorNow(FA)).chips, ['OLIF outcomes', 'hardware', 'dropme']) && same(await flagsOf(FA), ['OLIF outcomes', 'hardware']), await editorNow(FA));
  await cdp.key('Escape');
  await cdp.settle(200);
  const esc5 = await editorNow(FA);
  check('Escape throws the draft away: the stored flags are unchanged, the editor is gone and focus is on the cell',
    same(await flagsOf(FA), ['OLIF outcomes', 'hardware']) && esc5.open === false && esc5.active === `flags-${FA}`, { flags: await flagsOf(FA), esc5 });
  await openFlags(FA);
  await cdp.typeText('enterflag,');
  await cdp.settle(200);
  const hl5 = await editorNow(FA);
  await cdp.key('Enter');
  await cdp.settle(250);
  const enter5 = await editorNow(FA);
  check('Enter in an empty box (nothing highlighted) saves and closes, with focus on the cell',
    same(hl5.highlighted, []) && hl5.value === '' && same(await flagsOf(FA), ['OLIF outcomes', 'hardware', 'enterflag']) && enter5.open === false && enter5.active === `flags-${FA}`, { hl5, flags: await flagsOf(FA), enter5 });
  await openFlags(FB);
  await cdp.typeText('tabflag,');
  await cdp.settle(200);
  await cdp.key('Tab');
  await cdp.settle(250);
  const tab5 = await editorNow(FB);
  check('Tab saves the draft and closes the editor', same(await flagsOf(FB), ['hardware', 'tabflag']) && tab5.open === false && tab5.editors === 0, { flags: await flagsOf(FB), tab5 });
  // The padding of the field is not "elsewhere": a press on it keeps the editor open (the implementer's mousedown guard).
  await openFlags(FB);
  const fieldRect = await rectOf('.flag-editor');
  await cdp.click(fieldRect.left + 2, fieldRect.top + fieldRect.height / 2);
  await cdp.settle(200);
  const pad5 = await editorNow(FB);
  check('a click on the field\'s own padding keeps the editor open and the box focused', pad5.open === true && pad5.focused === true && pad5.editors === 1, pad5);
  await cdp.key('Escape');
  await cdp.settle(200);

  // 19.5b (2026-11-16, the click / Tab fix) A SUBJECT editor and a FLAGS editor hand over to each other. A pointer press on
  // a resting FLAGS cell opens it, from a SUBJECT editor on the same row or another and from a flags editor; Tab, which
  // only moves focus, leaves the FLAGS cell at rest. One trusted click each, no re-click.
  const subjectOpen = async (id) => { await clickAt(`[data-find-key="subject-${id}"]`); await cdp.settle(200); };
  const subjectOf = (id) => cdp.evaluate(`import('./renderer/store.js').then((m) => m.getState().studies.find((x) => x.id === ${JSON.stringify(id)})?.subjectId ?? null)`);
  const editorsAll = () => cdp.evaluate(`({ editors: document.querySelectorAll('.flag-editor').length, popups: document.querySelectorAll('.flag-popup').length, active: document.activeElement?.getAttribute('data-find-key') ?? null })`);
  await subjectOpen(FA);
  await cdp.typeText('SJ1');
  await clickAt(`[data-find-key="flags-${FA}"]`);
  await cdp.settle(250);
  const sameRow = await editorNow(FA);
  check('with a SUBJECT editor open, one click on the same row\'s FLAGS cell saves the subject and opens the flags editor with focus in its box',
    (await subjectOf(FA)) === 'SJ1' && sameRow.open === true && sameRow.focused === true && sameRow.editors === 1, { subject: await subjectOf(FA), sameRow });
  await cdp.key('Escape');
  await cdp.settle(200);
  await subjectOpen(FB);
  await cdp.typeText('SJ2');
  await clickAt(`[data-find-key="flags-${FC}"]`);
  await cdp.settle(250);
  const otherRow = await editorNow(FC);
  check('with a SUBJECT editor open, one click on another row\'s FLAGS cell saves the subject and opens that flags editor with focus in its box',
    (await subjectOf(FB)) === 'SJ2' && otherRow.open === true && otherRow.focused === true && otherRow.editors === 1 && !(await cdp.evaluate(`Boolean(document.querySelector('[data-find-key="subject-input-${FB}"]'))`)), { subject: await subjectOf(FB), otherRow });
  await cdp.key('Escape');
  await cdp.settle(200);
  // Tab out of a SUBJECT editor lands on the row\'s FLAGS cell at rest: no editor, no list. Enter on it then opens it.
  await subjectOpen(FA);
  await cdp.typeText('SJ3');
  await cdp.key('Tab');
  await cdp.settle(250);
  const tabSubject = await editorsAll();
  check('Tab out of a SUBJECT editor saves the subject, leaves focus on that row\'s FLAGS cell and opens no flags editor or list',
    (await subjectOf(FA)) === 'SJ3' && tabSubject.active === `flags-${FA}` && tabSubject.editors === 0 && tabSubject.popups === 0, { subject: await subjectOf(FA), tabSubject });
  await cdp.key('Enter');
  await cdp.settle(250);
  const enterCell = await editorNow(FA);
  check('Enter on the focused FLAGS cell opens its editor with focus in the box', enterCell.open === true && enterCell.focused === true && enterCell.editors === 1, enterCell);
  await cdp.key('Escape');
  await cdp.settle(200);
  // Tab out of a flags editor saves the draft and opens no editor on any row.
  await openFlags(FB);
  await cdp.typeText('tabagain,');
  await cdp.settle(200);
  await cdp.key('Tab');
  await cdp.settle(250);
  const tabFlags = await editorsAll();
  check('Tab out of a flags editor saves the draft and leaves no flags editor or list open on any row',
    (await flagsOf(FB)).includes('tabagain') && tabFlags.editors === 0 && tabFlags.popups === 0, { flags: await flagsOf(FB), tabFlags });
  // A stale press note: a resting cell opened the ordinary way, Esc, then a SUBJECT editor and Tab opens nothing.
  await openFlags(FB);
  await cdp.key('Escape');
  await cdp.settle(200);
  await subjectOpen(FA);
  await cdp.key('Tab');
  await cdp.settle(250);
  const stale = await editorsAll();
  check('a FLAGS cell opened and cancelled earlier leaves no note behind: a later SUBJECT editor on another row and Tab opens no flags editor',
    stale.editors === 0 && stale.popups === 0, stale);
  await putFlags({ [FB]: ['hardware', 'tabflag'] });
  await cdp.setState('{ paramSelected: [] }');
  await cdp.settle(100);

  // 19.6 A repaint the editor did not cause. One repaint per keystroke; the draft, focus and caret survive; nothing is
  // written; the last row's list is inside the host and not clipped.
  await openFlags(FB);
  await cdp.typeText('draftchip,');
  await cdp.settle(200);
  await cdp.evaluate(`(() => { window.__flagRepaints = 0; window.__flagObserver?.disconnect(); window.__flagObserver = new MutationObserver(() => { window.__flagRepaints += 1; }); window.__flagObserver.observe(document.querySelector('.studies-table-host'), { childList: true, subtree: true }); })()`);
  await cdp.typeText('h');
  await cdp.settle(250);
  const oneKey = await cdp.evaluate(`window.__flagRepaints`);
  check('one typed character repaints the list once', oneKey === 1, oneKey);
  await cdp.typeText('alf');
  await cdp.settle(200);
  await cdp.evaluate(`(() => { const i = document.querySelector('[data-find-key="flags-${FB}-input"]'); i.setSelectionRange(2, 2); })()`);
  await cdp.setState('{ paramSelected: ["SP-9001"] }');
  await cdp.settle(200);
  await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: s.studies.map((x) => (x.id === '${FC}' ? { ...x, subjectId: 'RP-1' } : x)) })))`);
  await cdp.settle(250);
  const rep6 = await editorNow(FB);
  check('after a repaint the editor did not cause (a tick, then another film changing) the draft chips, the typed text, focus and caret survive',
    rep6.open && same(rep6.chips, ['hardware', 'tabflag', 'draftchip']) && rep6.value === 'half' && rep6.focused === true && rep6.start === 2 && rep6.end === 2 && rep6.editors === 1, rep6);
  check('the repaint wrote nothing: the stored flags are still the saved ones', same(await flagsOf(FB), ['hardware', 'tabflag']), await flagsOf(FB));
  await cdp.key('Escape');
  await cdp.settle(200);
  check('Escape after the repaints still discards the draft', same(await flagsOf(FB), ['hardware', 'tabflag']) && !(await editorNow(FB)).open, await flagsOf(FB));
  await cdp.setState('{ paramSelected: [] }');
  const ids6 = await rowIds();
  check('the last row of the list is the last throwaway film', ids6[ids6.length - 1] === FC, ids6);
  await openFlags(FC);
  const pop6 = await cdp.evaluate(`(() => {
    const host = document.querySelector('.studies-table-host').getBoundingClientRect();
    const popup = document.querySelector('.flag-popup');
    const cell = document.querySelector('.studies-flags-editing');
    if (!popup || !cell) return null;
    const p = popup.getBoundingClientRect(); const c = cell.getBoundingClientRect();
    const hit = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2);
    const lastOption = [...popup.querySelectorAll('.flag-option')].pop();
    const o = lastOption ? lastOption.getBoundingClientRect() : null;
    const hitLast = o ? document.elementFromPoint(o.left + o.width / 2, o.top + o.height / 2) : null;
    return {
      inside: p.left >= host.left - 0.5 && p.right <= host.right + 0.5 && p.top >= host.top - 0.5 && p.bottom <= host.bottom + 0.5,
      popup: [p.left, p.top, p.right, p.bottom], host: [host.left, host.top, host.right, host.bottom],
      outsideTable: !popup.closest('.studies-table'), underCell: Math.abs(p.top - (c.bottom + 4)) <= 2,
      hitsPopup: Boolean(hit && popup.contains(hit)), lastOptionVisible: Boolean(hitLast && popup.contains(hitLast)),
    };
  })()`);
  check('the last row\'s suggestion list is mounted outside the table and a click at its centre and at its last option reaches it (not clipped)',
    Boolean(pop6) && pop6.outsideTable === true && pop6.hitsPopup === true && pop6.lastOptionVisible === true, pop6);
  // Reachable: each option, scrolled into view, is what a hit test at its own centre returns (nothing covers or clips it),
  // and a trusted click on the last option adds that flag.
  const reach6 = await cdp.evaluate(`(() => {
    const options = [...document.querySelectorAll('.flag-popup .flag-option')];
    return options.map((o) => { o.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = o.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { text: o.textContent, ok: Boolean(hit && o.contains(hit)) }; });
  })()`);
  check('every option of the last row\'s suggestion list is hit at its own centre once scrolled into view',
    reach6.length > 1 && reach6.every((o) => o.ok), reach6);
  const lastOpt = await cdp.evaluate(`(() => { const o = [...document.querySelectorAll('.flag-popup .flag-option')].pop(); if (!o) return null; o.scrollIntoView({ block: 'nearest' }); const r = o.getBoundingClientRect(); return { text: o.textContent, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()`);
  if (lastOpt) await cdp.click(lastOpt.cx, lastOpt.cy);
  await cdp.settle(250);
  const clicked6 = await editorNow(FC);
  check('a trusted click on the last option adds that flag to the draft and keeps the editor open',
    Boolean(lastOpt) && clicked6.open === true && clicked6.chips.includes(lastOpt.text) && clicked6.focused === true, { lastOpt, clicked6 });
  check('the list opens 4px under its cell', Boolean(pop6) && pop6.underCell === true, pop6);
  await cdp.key('Escape');
  await cdp.settle(200);

  // 19.6b Typing in the search box while the editor is open: the box blurs, so the draft is SAVED, not held.
  await openFlags(FB);
  await cdp.typeText('srchflag,');
  await cdp.settle(200);
  await clickAt('.studies-search');
  await cdp.settle(250);
  check('clicking the search box with a draft open saves the draft and closes the editor',
    same(await flagsOf(FB), ['hardware', 'tabflag', 'srchflag']) && !(await editorNow(FB)).open, { flags: await flagsOf(FB), editor: await editorNow(FB) });
  check('the search box holds the focus and the query is unchanged after the commit', (await cdp.evaluate(`document.activeElement === document.querySelector('.studies-search')`)) === true && (await cdp.state()).query === 'zzflag', (await cdp.state()).query);

  // 19.7 The FLAGS menu: two ticks, any / every, and No flags with a row that stays while its cell is open.
  await resetFlagsView();
  await putFlags({ [FA]: ['hardware', 'cement'], [FB]: ['hardware'], [FC]: [] });
  await cdp.settle(250);
  await tickValue('flags', 'hardware');
  await tickValue('flags', 'cement');
  const menu7 = await menuLabels();
  const any7 = await rowIds();
  const fun7 = await cdp.evaluate(`(() => { const f = document.querySelector('[data-find-key="filter-flags"]'); return { active: f.classList.contains('is-active'), count: f.querySelector('.studies-filter-count')?.textContent ?? null }; })()`);
  check('the FLAGS menu offers the flags in use A to Z, then No flags', same(menu7, ['cement', 'hardware', 'No flags']), menu7);
  check('with hardware and cement ticked (any) the films holding either stay, and the funnel reads active with count 2', same(any7, [FA, FB]) && fun7.active === true && fun7.count === '2', { any7, fun7 });
  await clickAt('[data-find-key="filter-flags-match-every"]');
  await cdp.settle(200);
  const every7 = await rowIds();
  const pressed7 = await cdp.evaluate(`({ any: document.querySelector('[data-find-key="filter-flags-match-any"]')?.getAttribute('aria-pressed'), every: document.querySelector('[data-find-key="filter-flags-match-every"]')?.getAttribute('aria-pressed'), mode: null })`);
  check('Every ticked flag narrows the rows to the film holding both, and is the pressed one', same(every7, [FA]) && pressed7.every === 'true' && pressed7.any !== 'true' && (await cdp.state()).findFilters.flagsMatch === 'every', { every7, pressed7 });
  await openFilterMenu('flags');
  await clickAt('[data-find-key="filter-flags-match-any"]');
  await cdp.settle(200);
  check('Any ticked flag brings the other film back', same(await rowIds(), [FA, FB]) && (await cdp.state()).findFilters.flagsMatch === 'any', await rowIds());
  await openFilterMenu('flags');
  await clickAt('[data-find-key="filter-flags-all"]');
  await cdp.settle(150);
  await tickValue('flags', '__no_flags__');
  await cdp.key('Escape');
  await cdp.settle(150);
  check('ticking No flags leaves the film with none', same(await rowIds(), [FC]) && same((await cdp.state()).findFilters.flags, ['__no_flags__']), { rows: await rowIds(), flags: (await cdp.state()).findFilters.flags });
  await openFlags(FC);
  await cdp.typeText('x1,x2,');
  await cdp.settle(250);
  const stay7 = { rows: await rowIds(), editor: await editorNow(FC), stored: await flagsOf(FC) };
  check('under No flags the row stays while its cell is open and holds a draft of two flags', same(stay7.rows, [FC]) && stay7.editor.open === true && same(stay7.editor.chips, ['x1', 'x2']) && same(stay7.stored, []), stay7);
  await cdp.key('Enter');
  await cdp.settle(300);
  const gone7 = { rows: await rowIds(), stored: await flagsOf(FC), empty: ((await text(cdp, '.studies-empty')) || '').trim() };
  check('closing the editor saves the two flags and the row leaves the No flags list', same(gone7.stored, ['x1', 'x2']) && same(gone7.rows, []) && gone7.empty === 'No studies match these filters.', gone7);

  // 19.8 Removing a ticked flag from its last film: the empty list, the funnel and the menu keep the tick.
  await resetFlagsView();
  await cdp.settle(200);
  await tickValue('flags', 'x1');
  await cdp.key('Escape');
  await cdp.settle(150);
  check('ticking x1 leaves the one film holding it', same(await rowIds(), [FC]), await rowIds());
  await openFlags(FC);
  await clickAt(`[data-find-key="flags-${FC}-remove-0"]`);
  await cdp.settle(200);
  await cdp.key('Enter');
  await cdp.settle(300);
  const empty8 = await cdp.evaluate(`(() => {
    const f = document.querySelector('[data-find-key="filter-flags"]');
    return { rows: document.querySelectorAll('.studies-row').length, empty: (document.querySelector('.studies-empty')?.textContent ?? '').trim(),
      active: f ? f.classList.contains('is-active') : null, count: f?.querySelector('.studies-filter-count')?.textContent ?? null };
  })()`);
  check('removing x1 from its last film leaves an empty list reading "No studies match these filters." and the film itself is saved without it',
    same(await flagsOf(FC), ['x2']) && empty8.rows === 0 && empty8.empty === 'No studies match these filters.', { empty8, flags: await flagsOf(FC) });
  check('the funnel still shows its count of 1', empty8.active === true && empty8.count === '1', empty8);
  await openFilterMenu('flags');
  const menu8 = await menuLabels();
  const tick8 = await cdp.evaluate(`document.querySelector('[data-find-key="filter-flags-x1"]')?.checked ?? null`);
  check('the menu still lists x1, ticked, beside the flags in use', menu8.includes('x1') && menu8.includes('x2') && tick8 === true, { menu8, tick8 });
  await clickAt('[data-find-key="filter-flags-all"]');
  await cdp.settle(150);
  await cdp.key('Escape');
  await cdp.settle(150);
  check('All on FLAGS clears the tick and the list returns', same(await rowIds(), [FA, FB, FC]) && (await cdp.state()).findFilters.flags.length === 0, await rowIds());

  // 19.9 The delete prompt covers WORKSPACE to the trash cell on one line, and FLAGS is not rendered under it.
  await clickAt(`[data-find-key="row-delete-${FA}"]`);
  await cdp.settle(200);
  const prompt9 = await cdp.evaluate(`(() => {
    const row = document.querySelector('.studies-row[data-study-id="${FA}"]');
    const cell = row.querySelector('.studies-cell-actions-confirming');
    if (!cell) return null;
    const heads = [...document.querySelectorAll('.studies-table-head > div')].map((d) => d.getBoundingClientRect());
    const c = cell.getBoundingClientRect(); const idCell = row.querySelector('.studies-cell-id').getBoundingClientRect();
    const span = cell.querySelector('.studies-delete-prompt');
    return {
      left: c.left, workspaceLeft: heads[4].left, right: c.right, trashRight: heads[9].right, top: c.top, idTop: idCell.top, idBottom: idCell.bottom,
      lines: span ? span.getClientRects().length : null, flagsCell: Boolean(row.querySelector('.studies-cell-flags')),
      siblings: [...row.children].filter((x) => !x.classList.contains('studies-cell-actions-confirming')).length,
    };
  })()`);
  check('the delete prompt starts under WORKSPACE and runs to the end of the row, on the first grid line',
    Boolean(prompt9) && Math.abs(prompt9.left - prompt9.workspaceLeft) <= 1.5 && Math.abs(prompt9.right - prompt9.trashRight) <= 1.5 && prompt9.top < prompt9.idBottom, prompt9);
  check('the prompt\'s own text sits on one line and no FLAGS cell is rendered under it', Boolean(prompt9) && prompt9.lines === 1 && prompt9.flagsCell === false && prompt9.siblings === 4, prompt9);
  await cdp.evaluate(`[...document.querySelectorAll('.studies-row[data-study-id="${FA}"] .studies-cell-actions-confirming button')].find((b) => /cancel/i.test(b.textContent))?.click()`);
  await cdp.settle(200);
  check('cancelling the prompt restores the FLAGS cell', (await cdp.evaluate(`Boolean(document.querySelector('[data-find-key="flags-${FA}"]'))`)) === true);

  // 19.10 A 1180px window with the sidebar collapsed (main.js opens the window at 1180). The window cannot be resized
  // over CDP from here, so the viewport is: Emulation.setDeviceMetricsOverride lays the page out at 1180 wide, which is
  // what the floors are measured against. Put back in the finally.
  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 860, deviceScaleFactor: 1, mobile: false });
    await cdp.setState('{ navCollapsed: true }');
    await cdp.settle(400);
    const narrow = await cdp.evaluate(`(() => {
      const t = document.querySelector('.studies-table');
      const trashHead = () => [...document.querySelectorAll('.studies-table-head > div')].pop().getBoundingClientRect();
      const trashCell = () => document.querySelector('.studies-row[data-study-id="${FA}"] .studies-cell-actions').getBoundingClientRect();
      const flagsHead = () => document.querySelectorAll('.studies-table-head > div')[8].getBoundingClientRect();
      const before = { scrollLeft: t.scrollLeft, head: trashHead().right, cell: trashCell().right, table: t.getBoundingClientRect().right };
      t.scrollLeft = t.scrollWidth;
      const after = { scrollLeft: t.scrollLeft, head: trashHead().right, cell: trashCell().right, table: t.getBoundingClientRect().right, flagsRight: flagsHead().right, flagsHeadLeft: flagsHead().left };
      return { innerWidth: window.innerWidth, scrollWidth: t.scrollWidth, clientWidth: t.clientWidth, before, after };
    })()`);
    check('at 1180px with the sidebar collapsed the table scrolls sideways (scroll width exceeds its client width)', narrow.innerWidth === 1180 && narrow.scrollWidth > narrow.clientWidth, narrow);
    check('the row\'s trash cell stays at the table\'s right edge both at rest and scrolled to the end, and FLAGS is reachable',
      Math.abs(narrow.before.cell - narrow.before.table) <= 1.5
      && narrow.after.scrollLeft > 0 && Math.abs(narrow.after.cell - narrow.after.table) <= 1.5
      && narrow.after.flagsRight <= narrow.after.table + 1.5, narrow);
    // The list is placed against the host: with the table scrolled, a cell's list still lands under the cell, inside the host.
    await openFlags(FC);
    const popN = await cdp.evaluate(`(() => {
      const host = document.querySelector('.studies-table-host').getBoundingClientRect();
      const popup = document.querySelector('.flag-popup'); const cell = document.querySelector('.studies-flags-editing');
      if (!popup || !cell) return null;
      const p = popup.getBoundingClientRect(); const c = cell.getBoundingClientRect();
      const wanted = Math.max(host.left, Math.min(c.left, host.right - p.width));
      return { inside: p.left >= host.left - 0.5 && p.right <= host.right + 0.5, leftOff: Math.abs(p.left - wanted), topOff: Math.abs(p.top - (c.bottom + 4)), cellLeft: c.left, popup: [p.left, p.top, p.right, p.bottom], host: [host.left, host.top, host.right, host.bottom] };
    })()`);
    check('with the table scrolled sideways the open cell\'s list sits under the cell, between the host\'s left and right edges',
      Boolean(popN) && popN.inside === true && popN.leftOff <= 2 && popN.topOff <= 2, popN);
    await cdp.key('Escape');
    await cdp.settle(200);

    // 19.10b (2026-11-16, the final review, M1) The sideways scroll survives a repaint: a tick, a commit of the flags
    // editor and a tick in the FLAGS menu each rebuild the table, which used to put scrollLeft back to 0. Every control is
    // pressed where it already is (no scrollIntoView, which would itself move the scroll), and the tick goes through the
    // store, since the row's box is off-screen at the right-hand end. The menu and the list are placed against the
    // scrolled cells.
    const scrollNow = () => cdp.evaluate(`document.querySelector('.studies-table')?.scrollLeft ?? null`);
    await cdp.evaluate(`(() => { const t = document.querySelector('.studies-table'); t.scrollLeft = t.scrollWidth; })()`);
    await cdp.settle(150);
    const scroll0 = await scrollNow();
    await cdp.setState(`{ paramSelected: ["${FA}"] }`);
    await cdp.settle(250);
    const scrollTick = await scrollNow();
    check('(M1) at the right-hand end of the narrow table, a tick repaints the list and the sideways scroll stays where it was',
      scroll0 > 0 && Math.abs(scrollTick - scroll0) <= 1.5, { scroll0, scrollTick });
    await cdp.setState('{ paramSelected: [] }');
    await cdp.settle(200);
    const cellFC = await cdp.rect(`[data-find-key="flags-${FC}"]`);
    if (cellFC) await cdp.click(cellFC.cx, cellFC.cy);
    await cdp.settle(250);
    const scrollOpen = await scrollNow();
    const popScrolled = await cdp.evaluate(`(() => {
      const popup = document.querySelector('.flag-popup'); const cell = document.querySelector('.studies-flags-editing');
      if (!popup || !cell) return null;
      const p = popup.getBoundingClientRect(); const c = cell.getBoundingClientRect(); const host = document.querySelector('.studies-table-host').getBoundingClientRect();
      const wanted = Math.max(host.left, Math.min(c.left, host.right - p.width));
      return { leftOff: Math.abs(p.left - wanted), topOff: Math.abs(p.top - (c.bottom + 4)), cellVisible: c.right <= host.right + 1 && c.left >= host.left - 1 };
    })()`);
    check('(M1) one click on a FLAGS cell at the scrolled end opens its editor without moving the scroll, its list under the cell',
      Boolean(cellFC) && Math.abs(scrollOpen - scroll0) <= 1.5 && Boolean(popScrolled) && popScrolled.leftOff <= 2 && popScrolled.topOff <= 2, { scrollOpen, scroll0, popScrolled });
    await cdp.typeText('scrollflag,');
    await cdp.settle(200);
    await cdp.key('Enter');
    await cdp.settle(300);
    const scrollCommit = await scrollNow();
    check('(M1) committing the editor (Enter in the empty box) saves the flag and the sideways scroll stays where it was',
      (await flagsOf(FC)).includes('scrollflag') && Math.abs(scrollCommit - scroll0) <= 1.5, { scrollCommit, scroll0, flags: await flagsOf(FC) });
    const funnelFlags = await cdp.rect('[data-find-key="filter-flags"]');
    if (funnelFlags) await cdp.click(funnelFlags.cx, funnelFlags.cy);
    await cdp.settle(250);
    const menuScrolled = await cdp.evaluate(`(() => {
      const menu = document.querySelector('.studies-filter-menu'); const th = document.querySelector('[data-find-key="filter-flags"]')?.closest('.studies-th');
      if (!menu || !th) return null;
      const host = document.querySelector('.studies-table-host').getBoundingClientRect(); const m = menu.getBoundingClientRect(); const t = th.getBoundingClientRect();
      const wanted = Math.max(host.left, Math.min(t.left, host.right - m.width));
      return { leftOff: Math.abs(m.left - wanted), inside: m.left >= host.left - 0.5 && m.right <= host.right + 0.5,
        overHeader: m.left <= t.left + 2 && m.right >= t.left, menu: [m.left, m.right], th: [t.left, t.right], host: [host.left, host.right] };
    })()`);
    // The menu opens from its header cell, kept inside the host (at the right-hand end it is clamped to the host's right
    // edge), so it overlaps the cell's left edge. Not compared to the pixel: opening the menu can add or remove the page's
    // vertical scrollbar after the menu is placed, which narrows or widens the table by the scrollbar's width and clamps
    // its scroll (seen on 2026-11-16: 15 px, the scroll going from 46.7 to 31.3 at its new maximum).
    check('(M1) the FLAGS menu opened at the scrolled end opens from its own header cell, inside the host, and the table stays scrolled to its end',
      Boolean(menuScrolled) && menuScrolled.overHeader && menuScrolled.inside
      && (await cdp.evaluate(`(() => { const t = document.querySelector('.studies-table'); return t.scrollLeft > 0 && Math.abs(t.scrollLeft - (t.scrollWidth - t.clientWidth)) <= 1.5; })()`)),
      { menuScrolled, scroll: await scrollNow() });
    const tickRect = await cdp.rect('label:has(> [data-find-key="filter-flags-scrollflag"])');
    const scrollBeforeTick = await scrollNow();
    if (tickRect) await cdp.click(tickRect.cx, tickRect.cy);
    await cdp.settle(300);
    const scrollMenuTick = await scrollNow();
    check('(M1) a tick in the FLAGS menu filters the list and the sideways scroll stays where it was',
      Boolean(tickRect) && same((await cdp.state()).findFilters.flags, ['scrollflag']) && scrollBeforeTick > 0 && Math.abs(scrollMenuTick - scrollBeforeTick) <= 1.5,
      { scrollMenuTick, scrollBeforeTick, scroll0, flags: (await cdp.state()).findFilters.flags });
    await cdp.key('Escape');
    await cdp.settle(150);
    await cdp.setState(`{ findFilters: ${FLAG_RESET} }`);
    await cdp.settle(200);
  } finally {
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await cdp.setState('{ navCollapsed: false }');
    await cdp.settle(300);
  }

  // 19.11 (2026-11-16, the final review: I2, M3 with ruling 6 as amended, M2) A row's editor says why it refuses text that
  // cannot be a flag, keeps a refused piece in the box, adds typed text on Enter when nothing is highlighted, and keeps
  // the highlighted suggestion in view when the arrows walk a long list.
  await resetFlagsView();
  await putFlags({ [FA]: [], [FB]: [], [FC]: [] });
  await cdp.settle(250);
  const LONG = 'p'.repeat(41);
  const hintNow = () => cdp.evaluate(`(() => { const h = document.querySelector('.flag-popup .flag-popup-hint'); return h ? { text: h.textContent, refused: h.classList.contains('is-refused'), colour: getComputedStyle(h).color } : null; })()`);
  await openFlags(FB);
  const plainHint = await hintNow();
  check('(I2) an empty box\'s hint reads ENTER ADDS · ESC CANCELS', Boolean(plainHint) && plainHint.text === 'ENTER ADDS · ESC CANCELS' && plainHint.refused === false, plainHint);
  await cdp.typeText(LONG);
  await cdp.settle(200);
  const longHint = await hintNow();
  const long11 = await editorNow(FB);
  check('(I2) 41 characters in a row\'s box: the hint reads 40 CHARACTERS AT MOST, in another colour than the plain hint, and nothing is offered',
    Boolean(longHint) && longHint.text === '40 CHARACTERS AT MOST' && longHint.refused === true && longHint.colour !== plainHint?.colour && same(long11.options, []) && long11.value === LONG, { longHint, long11 });
  await cdp.key('Enter');
  await cdp.settle(200);
  const enterLong = await editorNow(FB);
  check('(I2) Enter on the refused text adds nothing and leaves it in the box', enterLong.open && same(enterLong.chips, []) && enterLong.value === LONG, enterLong);
  await cdp.typeText(',');
  await cdp.settle(200);
  const commaLong = await editorNow(FB);
  check('(I2) a comma after it does not discard it: the refused text stays in the box, with the hint', commaLong.open && same(commaLong.chips, []) && commaLong.value === LONG && (await hintNow())?.text === '40 CHARACTERS AT MOST', { commaLong, hint: await hintNow() });
  await cdp.key('Escape');
  await cdp.settle(200);
  await openFlags(FB);
  await cdp.typeText(`goodflag, ${LONG}`);
  await cdp.settle(200);
  const pasted11 = await editorNow(FB);
  check('(I2) pasting "goodflag, <41 characters>": the flag becomes a chip and the refused piece stays in the box with the hint',
    pasted11.open && same(pasted11.chips, ['goodflag']) && pasted11.value === LONG && (await hintNow())?.text === '40 CHARACTERS AT MOST', { pasted11, hint: await hintNow() });
  await cdp.key('Tab');
  await cdp.settle(250);
  check('(I2) leaving the box saves the draft without the refused text and closes the editor', same(await flagsOf(FB), ['goodflag']) && (await editorsAll()).editors === 0, { flags: await flagsOf(FB) });
  await openFlags(FB);
  await cdp.typeText('typedone');
  await cdp.settle(200);
  await cdp.key('ArrowUp');
  await cdp.settle(200);
  const none11 = await editorNow(FB);
  await cdp.key('Enter');
  await cdp.settle(200);
  const typed11 = await editorNow(FB);
  check('(ruling 6 amended) Enter with text and nothing highlighted adds the typed text and empties the box, the editor still open',
    same(none11.highlighted, []) && typed11.open && same(typed11.chips, ['goodflag', 'typedone']) && typed11.value === '' && typed11.focused === true, { none11, typed11 });
  await cdp.typeText('GOODFLAG');
  await cdp.settle(200);
  await cdp.key('Enter');
  await cdp.settle(200);
  const held11 = await editorNow(FB);
  check('(ruling 6 amended) Enter on text naming a flag the film already holds does nothing', held11.open && same(held11.chips, ['goodflag', 'typedone']) && held11.value === 'GOODFLAG', held11);
  await cdp.key('Escape');
  await cdp.settle(200);
  // More than eight flags in use: ArrowDown to the last suggestion leaves it inside the list's visible box, and only the
  // list scrolls (the page and the table stay put).
  const many = Array.from({ length: 12 }, (_, i) => `f${String(i + 1).padStart(2, '0')}`);
  await putFlags({ [FA]: many, [FB]: [], [FC]: [] });
  await cdp.settle(250);
  await openFlags(FB);
  const pageScroll = () => cdp.evaluate(`({ page: document.querySelector('.studies-page')?.scrollTop ?? null, win: window.scrollY, table: document.querySelector('.studies-table')?.scrollLeft ?? null })`);
  const before11 = await pageScroll();
  for (let i = 0; i < many.length; i += 1) { await cdp.key('ArrowDown'); await cdp.settle(60); }
  await cdp.settle(150);
  const walk11 = await cdp.evaluate(`(() => {
    const list = document.querySelector('.flag-popup .flag-popup-options'); const active = list?.querySelector('.flag-option.is-active');
    if (!list || !active) return null;
    const l = list.getBoundingClientRect(); const a = active.getBoundingClientRect();
    return { options: list.querySelectorAll('.flag-option').length, text: active.textContent, inside: a.top >= l.top - 0.5 && a.bottom <= l.bottom + 0.5, scrollTop: list.scrollTop, overflows: list.scrollHeight > list.clientHeight };
  })()`);
  const after11 = await pageScroll();
  check('(M2) with twelve flags in use, ArrowDown to the last suggestion leaves it inside the list\'s visible box (the list scrolled)',
    Boolean(walk11) && walk11.options === 12 && walk11.text === 'f12' && walk11.overflows === true && walk11.inside === true && walk11.scrollTop > 0, walk11);
  check('(M2) and neither the page nor the table scrolled', same(before11, after11), { before11, after11 });
  await cdp.key('Escape');
  await cdp.settle(200);

  // Tidy: the throwaway films go, so a later suite on this profile does not meet them.
  await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ query: '', studies: s.studies.filter((x) => !['${FA}', '${FB}', '${FC}'].includes(x.id)) })))`);
  await cdp.settle(200);
  check('no console errors or exceptions during section 19', cdp.errors.length === errorsBefore19, cdp.errors.slice(errorsBefore19));

  // ---------------------------------------------------------------------------------------------
  // 20 (2026-11-16, study flags, Task 8; spec 3 and 4.3 "Flagging the ticked films"). The bar's Flag button and its list.
  // Throwaway films again (SP-9111..9114 searched out by `zzbulk`, SP-9115 held back by its name so it keeps `hardware`
  // in use while the others lose it, SP-9116 the one that runs). Starting flags go straight into the store; every click,
  // press and key being tested is trusted input. The label-record check seeds a record file the way the app would hold
  // one (any JSON object is a record to main.js) and reads it back from the scratch profile on disk.
  // ---------------------------------------------------------------------------------------------
  {
  const errorsBefore20 = cdp.errors.length;
  const [BA, BB, BC, BD, BE, BF] = ['SP-9111', 'SP-9112', 'SP-9113', 'SP-9114', 'SP-9115', 'SP-9116'];
  for (const [id, fileName] of [[BA, 'zzbulk-a.png'], [BB, 'zzbulk-b.png'], [BC, 'zzbulk-c.png'], [BD, 'zzbulk-d.png'], [BE, 'qqother.png']]) {
    await injectFilm({ id, fileName, filePath: null, workspaceFolder: null, base64: null });
  }
  const LABEL_DIR = path.join(os.tmpdir(), 'spine-contour-smoke', 'labels');
  const REC_NAME = 'zzbulk-a.label.json';
  const bulkView = (extra = '') => cdp.setState(`{ screen: "studies", openId: null, query: "zzbulk", paramFilters: ${FILTERS_RESET}, findFilters: ${FLAG_RESET}, paramSelected: [], findSort: { key: "study", dir: "asc" }, navCollapsed: false${extra} }`);
  const tick = (ids) => cdp.setState(`{ paramSelected: ${JSON.stringify(ids)} }`);
  const flagBtn = () => cdp.evaluate(`(() => { const b = document.querySelector('[data-find-key="flag-selected"]'); return b ? { label: b.textContent, disabled: b.disabled, title: b.title, expanded: b.getAttribute('aria-expanded'), popup: b.getAttribute('aria-haspopup') } : null; })()`);
  const listOpen = () => cdp.evaluate(`Boolean(document.querySelector('.studies-bulk-flags'))`);
  // The open list as the page shows it: every box by key with its state and its muted count (null when none is shown).
  const listNow = () => cdp.evaluate(`(() => {
    const list = document.querySelector('.studies-bulk-flags');
    if (!list) return null;
    const boxes = {};
    for (const input of list.querySelectorAll('input[type="checkbox"]')) {
      const key = input.getAttribute('data-find-key').replace(/^bulk-flag-/, '');
      boxes[key] = { checked: input.checked, indeterminate: input.indeterminate, count: input.closest('label')?.querySelector('.studies-bulk-count')?.textContent ?? null };
    }
    return {
      boxes, input: list.querySelector('[data-find-key="bulk-flag-input"]')?.value ?? null,
      focused: document.activeElement?.getAttribute('data-find-key') ?? null, role: list.getAttribute('role'),
      create: list.querySelector('[data-find-key="bulk-flag-create"]')?.textContent ?? null, caption: list.querySelector('.studies-filter-caption')?.textContent ?? null,
    };
  })()`);
  const clickBox = async (key) => { await clickAt(`label:has(> [data-find-key="bulk-flag-${key}"])`); await cdp.settle(250); };
  const toastNow = async () => (await cdp.state()).toast;
  const closeList = async () => { if (await listOpen()) { await cdp.key('Escape'); await cdp.settle(150); } };

  // 20.1 Nothing ticked.
  await bulkView();
  await putFlags({ [BA]: ['hardware', 'cement'], [BB]: ['cement'], [BC]: ['cement'], [BD]: ['hardware'], [BE]: ['hardware'] });
  await cdp.settle(250);
  const none1 = await flagBtn();
  check('with nothing ticked the bar reads Flag, disabled, titled "Tick studies to flag"',
    Boolean(none1) && none1.label === 'Flag' && none1.disabled === true && none1.title === 'Tick studies to flag', none1);

  // 20.2 Three ticked: the button, the list's counts and its two states.
  for (const id of [BA, BB, BC]) await clickAt(`input[data-find-key="row-${id}"]`);
  await cdp.settle(200);
  const three2 = await flagBtn();
  check('three ticked films: the button reads "Flag 3 selected", enabled, and announces a dialog',
    three2.label === 'Flag 3 selected' && three2.disabled === false && three2.popup === 'dialog' && three2.expanded === 'false', three2);
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(250);
  const open2 = await listNow();
  check('one click opens the list: a dialog, the box focused, the caption naming three films',
    Boolean(open2) && open2.role === 'dialog' && open2.focused === 'bulk-flag-input' && open2.caption === 'CHANGES THE 3 TICKED FILMS' && (await flagBtn()).expanded === 'true', open2);
  check('a flag all three hold reads "all 3" with its box checked',
    Boolean(open2) && open2.boxes.cement && open2.boxes.cement.checked === true && open2.boxes.cement.indeterminate === false && open2.boxes.cement.count === 'all 3', open2 && open2.boxes);
  check('a flag one of the three holds reads "1 of 3" with its box indeterminate (a dash)',
    Boolean(open2) && open2.boxes.hardware && open2.boxes.hardware.checked === false && open2.boxes.hardware.indeterminate === true && open2.boxes.hardware.count === '1 of 3', open2 && open2.boxes);
  await clickBox('hardware');
  const all2 = await listNow();
  const stored2 = [await flagsOf(BA), await flagsOf(BB), await flagsOf(BC), await flagsOf(BD)];
  check('clicking the dash puts the flag on all three (and not on the unticked film), the box reads "all 3" checked, the list stays open',
    all2 !== null && stored2.slice(0, 3).every((f) => f.some((x) => x.toLowerCase() === 'hardware')) && same(stored2[3], ['hardware'])
    && all2.boxes.hardware.checked === true && all2.boxes.hardware.indeterminate === false && all2.boxes.hardware.count === 'all 3', { all2: all2 && all2.boxes, stored2 });
  await clickBox('hardware');
  const gone2 = await listNow();
  const stored2b = [await flagsOf(BA), await flagsOf(BB), await flagsOf(BC)];
  check('clicking it again takes it off all three: the box is clear with no count (the unticked film keeps it in use)',
    gone2 !== null && stored2b.every((f) => !f.some((x) => x.toLowerCase() === 'hardware')) && gone2.boxes.hardware
    && gone2.boxes.hardware.checked === false && gone2.boxes.hardware.indeterminate === false && gone2.boxes.hardware.count === null, { gone2: gone2 && gone2.boxes, stored2b });
  check('every box state matches its films: cement stays "all 3" through the edits', Boolean(gone2) && gone2.boxes.cement.count === 'all 3' && gone2.boxes.cement.checked === true, gone2 && gone2.boxes);

  // 20.3 A new flag: typed, Enter, every ticked film takes it, the box clears, the list stays.
  await clickAt('[data-find-key="bulk-flag-input"]');
  await cdp.typeText('fresh');
  await cdp.settle(200);
  const typed3 = await listNow();
  check('typing a new flag offers Create "fresh"', Boolean(typed3) && typed3.create === 'Create "fresh"' && typed3.focused === 'bulk-flag-input', typed3);
  await cdp.key('Enter');
  await cdp.settle(300);
  const enter3 = await listNow();
  const stored3 = [await flagsOf(BA), await flagsOf(BB), await flagsOf(BC), await flagsOf(BD)];
  check('Enter adds it to all three ticked films, not the fourth; the box clears, keeps focus and the list is still open',
    stored3.slice(0, 3).every((f) => f.includes('fresh')) && !stored3[3].includes('fresh') && Boolean(enter3) && enter3.input === '' && enter3.focused === 'bulk-flag-input'
    && enter3.boxes.fresh && enter3.boxes.fresh.count === 'all 3', { stored3, enter3 });
  await clickAt('[data-find-key="bulk-flag-input"]');
  await cdp.typeText('viaclick');
  await cdp.settle(200);
  await clickAt('[data-find-key="bulk-flag-create"]');
  await cdp.settle(300);
  check('a click on Create adds the flag to every ticked film too', [await flagsOf(BA), await flagsOf(BB), await flagsOf(BC)].every((f) => f.includes('viaclick')) && (await listOpen()), await flagsOf(BA));
  await closeList();

  // 20.4 The films are fixed when the list opens: filter by a flag, tick every row, clear that flag in the list.
  await bulkView();
  await putFlags({ [BA]: ['hardware', 'cement'], [BB]: ['hardware'], [BC]: ['hardware'], [BD]: [], [BE]: ['hardware'] });
  await cdp.settle(250);
  await tickValue('flags', 'hardware');
  await cdp.key('Escape');
  await cdp.settle(150);
  check('filtered by hardware and searched, the list shows the three films that hold it', same(await rowIds(), [BA, BB, BC]), await rowIds());
  await clickAt('input[data-find-key="select-all"]');
  await cdp.settle(200);
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(250);
  const open4 = await listNow();
  check('with every row ticked the list opens over three films, hardware reading "all 3"', Boolean(open4) && open4.caption === 'CHANGES THE 3 TICKED FILMS' && open4.boxes.hardware.count === 'all 3', open4);
  await clickBox('hardware');
  const left4 = { rows: await rowIds(), list: await listNow(), stored: [await flagsOf(BA), await flagsOf(BB), await flagsOf(BC), await flagsOf(BE)] };
  check('clearing the filtered flag takes it off the three films: their rows leave the table and the list is still open, still over those three films',
    same(left4.rows, []) && left4.list !== null && left4.list.caption === 'CHANGES THE 3 TICKED FILMS'
    && left4.stored.slice(0, 3).every((f) => !f.includes('hardware')) && same(left4.stored[3], ['hardware']), left4);
  check('hardware now reads clear in the open list (another film keeps it in use)', left4.list !== null && left4.list.boxes.hardware && left4.list.boxes.hardware.checked === false && left4.list.boxes.hardware.count === null, left4.list && left4.list.boxes);
  await clickBox('hardware');
  const back4 = { rows: await rowIds(), stored: [await flagsOf(BA), await flagsOf(BB), await flagsOf(BC), await flagsOf(BD), await flagsOf(BE)] };
  check('ticking it again in the list puts it back on exactly those three films and the rows return',
    back4.stored.slice(0, 3).every((f) => f.includes('hardware')) && same(back4.stored[3], []) && same(back4.stored[4], ['hardware']) && same(back4.rows, [BA, BB, BC]), back4);
  await closeList();

  // 20.5 Escape returns focus to the button; a press on a row closes the list without opening the study.
  await bulkView();
  await tick([BA, BB]);
  await cdp.settle(200);
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(250);
  await cdp.key('Escape');
  await cdp.settle(250);
  check('Escape closes the list and focus is on the Flag button', (await listOpen()) === false && (await activeKey()) === 'flag-selected' && (await flagBtn()).expanded === 'false', { open: await listOpen(), active: await activeKey() });
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(250);
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(250);
  check('a second click on the button closes the list', (await listOpen()) === false, await listOpen());
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(250);
  await clickAt(`.studies-row[data-study-id="${BC}"] .studies-cell-date`);
  await cdp.settle(300);
  s = await cdp.state();
  check('a press on a table row closes the list and does not open the study (still the Studies screen, nothing open)',
    (await listOpen()) === false && s.screen === 'studies' && (s.openId ?? null) === null, { open: await listOpen(), screen: s.screen, openId: s.openId });
  if (s.screen !== 'studies') await cdp.setState('{ screen: "studies", openId: null }');
  await cdp.settle(200);

  // 20.6 A run or batch does not block the Flag button; Delete and Export are disabled. A real one-film batch.
  await injectFilm({ id: BF, fileName: 'zzbulk-z.png', filePath: null, workspaceFolder: null, base64: SAMPLE_BASE64 });
  await bulkView();
  await tick([BF]);
  await cdp.settle(250);
  await clickAt('[data-find-key="segment"]');
  const started20 = await waitForState('s.batch !== null && s.running !== null', 8000);
  const busy = await cdp.evaluate(`(() => {
    const q = (k) => { const b = document.querySelector('[data-find-key="' + k + '"]'); return b ? { disabled: b.disabled, title: b.title } : null; };
    return { delete: q('delete'), export: q('export-bundle'), flag: q('flag-selected') };
  })()`);
  check('with a batch in flight Delete and Export are disabled and the Flag button is enabled',
    started20 === true && busy.delete?.disabled === true && busy.export?.disabled === true && busy.flag?.disabled === false && busy.flag.title === '', { started20, busy });
  if (started20) {
    await clickAt('[data-find-key="flag-selected"]');
    await cdp.settle(250);
    check('and the list opens during the batch', (await listOpen()) === true, await listOpen());
    await closeList();
  }
  const done20 = await waitForState('s.batch === null && s.running === null', 400000);
  check('the batch finishes', done20 === true, done20);

  // 20.7 The implementer's two doubts.
  // (a) One click on the Flag button while a row editor holds a draft saves the draft and opens the list.
  await bulkView();
  await putFlags({ [BA]: ['cement'], [BB]: ['cement'], [BC]: ['cement'] });
  await tick([BA, BB, BC]);
  await cdp.settle(250);
  await openFlags(BB);
  await cdp.typeText('draftx,');
  await cdp.settle(200);
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(300);
  const after7a = { stored: await flagsOf(BB), open: await listOpen(), editors: (await editorsAll()).editors, list: await listNow() };
  check('with a row editor open and a draft in it, ONE click on the Flag button saves the draft and opens the list',
    same(after7a.stored, ['cement', 'draftx']) && after7a.open === true && after7a.editors === 0 && after7a.list !== null && after7a.list.focused === 'bulk-flag-input', after7a);
  await closeList();
  // (b) Every ticked film already holds 20 flags: an add changes no film, a toast says so, the box is not left checked.
  const fill = (prefix) => Array.from({ length: 20 }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);
  await bulkView();
  await putFlags({ [BA]: fill('aa'), [BB]: fill('bb'), [BC]: [], [BD]: [], [BE]: [] });
  await tick([BA, BB]);
  await cdp.settle(250);
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(250);
  const before7b = await listNow();
  check('two films holding twenty flags each: the list shows aa01 as "1 of 2", indeterminate',
    Boolean(before7b) && before7b.boxes.aa01 && before7b.boxes.aa01.indeterminate === true && before7b.boxes.aa01.count === '1 of 2', before7b && before7b.boxes.aa01);
  await cdp.setState('{ toast: null }');
  await clickBox('aa01');
  const after7b = { a: await flagsOf(BA), b: await flagsOf(BB), toast: await toastNow(), list: await listNow() };
  check('ticking it changes no film: both keep exactly their twenty flags',
    same(after7b.a, fill('aa')) && same(after7b.b, fill('bb')), { a: after7b.a.length, b: after7b.b.length, bHasAa01: after7b.b.includes('aa01') });
  check('a toast says one film already has 20 flags and was left out', after7b.toast === '1 film already has 20 flags and was left out.', after7b.toast);
  check('the box does not stay shown as checked: it still reads the films\' state (some, indeterminate, "1 of 2")',
    after7b.list !== null && after7b.list.boxes.aa01.checked === false && after7b.list.boxes.aa01.indeterminate === true && after7b.list.boxes.aa01.count === '1 of 2', after7b.list && after7b.list.boxes.aa01);
  await closeList();

  // 20.8 Task 7's leftover press note: a right press, and a primary press dragged off, then Tab out of a SUBJECT editor.
  await bulkView();
  await putFlags({ [BA]: [], [BB]: [], [BC]: [] });
  await cdp.settle(250);
  const cellAt = async (id) => { await cdp.evaluate(`document.querySelector('[data-find-key="flags-${id}"]').scrollIntoView({ block: 'nearest' })`); await cdp.settle(80); return cdp.rect(`[data-find-key="flags-${id}"]`); };
  const rightCell = await cellAt(BA);
  await cdp.click(rightCell.cx, rightCell.cy, 'right');
  await cdp.settle(250);
  await cdp.evaluate(`document.activeElement?.blur?.()`);
  await clickAt(`[data-find-key="subject-${BA}"]`);
  await cdp.settle(200);
  await cdp.key('Tab');
  await cdp.settle(250);
  const afterRight = await editorsAll();
  check('a right-button press on a resting FLAGS cell, then a SUBJECT editor on that row and Tab, opens no flags editor',
    afterRight.editors === 0 && afterRight.popups === 0 && afterRight.active === `flags-${BA}`, afterRight);
  const dragCell = await cellAt(BB);
  const header = await cdp.rect('[data-find-key="sort-study"]');
  await cdp.drag(dragCell.cx, dragCell.cy, header.cx, header.cy);
  await cdp.settle(250);
  s = await cdp.state();
  await cdp.setState(`{ query: "zzbulk", findSort: { key: "study", dir: "asc" } }`);
  await cdp.settle(200);
  await clickAt(`[data-find-key="subject-${BB}"]`);
  await cdp.settle(200);
  await cdp.key('Tab');
  await cdp.settle(250);
  const afterDrag = await editorsAll();
  check('a primary press on a resting FLAGS cell dragged off before release, then a SUBJECT editor on that row and Tab, opens no flags editor',
    afterDrag.editors === 0 && afterDrag.popups === 0 && afterDrag.active === `flags-${BB}`, afterDrag);

  // 20.9 The label record: a bulk add rewrites `flags` in the file and leaves `saved_at` byte-identical. The film is given
  // a record the way a saved edit leaves one (a JSON object under labels/, named by the study's labelFile).
  const SAVED_AT = '2026-01-02T03:04:05.678Z';
  await cdp.evaluate(`(async () => {
    await window.spineContour.saveLabelRecord(${JSON.stringify(REC_NAME)}, { version: 1, saved_at: ${JSON.stringify(SAVED_AT)}, app_version: '0.0.0-smoke', comment: 'smoke', flags: [], levels: {} });
    const store = await import('./renderer/store.js');
    store.setState((s) => ({ studies: s.studies.map((x) => (x.id === ${JSON.stringify(BA)} ? { ...x, labelFile: ${JSON.stringify(REC_NAME)} } : x)) }));
  })()`);
  const recPath = path.join(LABEL_DIR, REC_NAME);
  const rawBefore = fs.existsSync(recPath) ? fs.readFileSync(recPath, 'utf8') : null;
  check('the seeded label record is on disk in the scratch profile', rawBefore !== null && JSON.parse(rawBefore).saved_at === SAVED_AT, { recPath, exists: rawBefore !== null });
  await bulkView();
  await tick([BA, BB]);
  await cdp.settle(250);
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(250);
  await cdp.typeText('onrecord');
  await cdp.key('Enter');
  await cdp.settle(300);
  let rawAfter = null;
  for (let i = 0; i < 30; i += 1) {
    rawAfter = fs.readFileSync(recPath, 'utf8');
    if (rawAfter.includes('onrecord')) break;
    await cdp.settle(150);
  }
  const stamp = (raw) => (raw && /"saved_at"\s*:\s*"[^"]*"/.exec(raw)?.[0]) ?? null;
  let parsedAfter = null;
  try { parsedAfter = JSON.parse(rawAfter); } catch { parsedAfter = null; }
  check('a bulk add rewrites the record\'s flags on disk (and the film without a record gets none)', Boolean(parsedAfter) && same(parsedAfter.flags, ['onrecord']) && parsedAfter.comment === 'smoke', { flags: parsedAfter?.flags, comment: parsedAfter?.comment });
  check('and leaves saved_at byte-identical', stamp(rawBefore) !== null && stamp(rawBefore) === stamp(rawAfter) && parsedAfter?.saved_at === SAVED_AT, { before: stamp(rawBefore), after: stamp(rawAfter) });
  await closeList();


  // 20.10 (ruling 12) The Flag button from an open SUBJECT editor, and the keyboard side. The bar comes BEFORE the table in
  // the page, so Tab from an editor moves on into the table and never reaches the button, and Shift+Tab would cross every
  // earlier cell; a keyboard arrival is therefore made by focusing the button while the editor holds a draft, which blurs
  // the editor with the button as its relatedTarget exactly as a Tab onto it would.
  await bulkView();
  await putFlags({ [BA]: ['cement'], [BB]: ['cement'], [BC]: ['cement'], [BD]: [], [BE]: ['hardware'] });
  await tick([BA, BB, BC]);
  await cdp.settle(250);
  await subjectOpen(BB);
  await cdp.typeText('SJbulk');
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(300);
  const subj10 = { subject: await subjectOf(BB), open: await listOpen(), list: await listNow() };
  check('with a SUBJECT editor open and text in it, ONE click on the Flag button commits the subject and opens the list',
    subj10.subject === 'SJbulk' && subj10.open === true && subj10.list !== null && subj10.list.focused === 'bulk-flag-input', subj10);
  await closeList();
  // From a flags editor, then from a SUBJECT editor: focus arrives on the button without a press.
  await openFlags(BB);
  await cdp.typeText('kbdflag,');
  await cdp.settle(200);
  await cdp.evaluate(`document.querySelector('[data-find-key="flag-selected"]').focus()`);
  await cdp.settle(300);
  const kbdF = { open: await listOpen(), input: await cdp.evaluate(`Boolean(document.querySelector('[data-find-key="bulk-flag-input"]'))`), active: await activeKey(), stored: await flagsOf(BB), editors: (await editorsAll()).editors };
  check('moving focus onto the Flag button from an open flags editor saves the draft, leaves focus on the button and does not open the list',
    kbdF.open === false && kbdF.input === false && kbdF.active === 'flag-selected' && kbdF.stored.includes('kbdflag') && kbdF.editors === 0, kbdF);
  await cdp.key('Enter', { typed: true });
  await cdp.settle(300);
  const kbdEnter = await listOpen();
  check('Enter on the focused Flag button opens the list', kbdEnter === true, { kbdEnter });
  await closeList();
  // Space does the same from the button's own focus (a focused, untouched button).
  await cdp.evaluate(`document.querySelector('[data-find-key="flag-selected"]').focus()`);
  await cdp.key(' ', { typed: true });
  await cdp.settle(300);
  check('Space on the focused Flag button opens the list', (await listOpen()) === true, await listOpen());
  await closeList();
  await subjectOpen(BC);
  await cdp.typeText('SJkbd');
  await cdp.evaluate(`document.querySelector('[data-find-key="flag-selected"]').focus()`);
  await cdp.settle(300);
  const kbdS = { open: await listOpen(), subject: await subjectOf(BC), active: await activeKey(), editing: await cdp.evaluate(`Boolean(document.querySelector('[data-find-key="subject-input-${BC}"]'))`) };
  check('moving focus onto the Flag button from an open SUBJECT editor saves the subject, leaves focus on the button and does not open the list',
    kbdS.open === false && kbdS.subject === 'SJkbd' && kbdS.active === 'flag-selected' && kbdS.editing === false, kbdS);
  // Tab from each editor does not reach the bar: after the commit no list exists.
  await openFlags(BA);
  await cdp.typeText('tabn,');
  await cdp.key('Tab');
  await cdp.settle(250);
  const tabNoList = await cdp.evaluate(`Boolean(document.querySelector('[data-find-key="bulk-flag-input"]'))`);
  await subjectOpen(BA);
  await cdp.key('Tab');
  await cdp.settle(250);
  check('Tab out of a flags editor and out of a SUBJECT editor leaves no list behind (the button is not in Tab reach from a row)', tabNoList === false && (await listOpen()) === false, { tabNoList });
  await closeList();

  // 20.11 A stale press note on the button: a primary press dragged off before release, and a press while it is disabled.
  await bulkView();
  await tick([BA, BB, BC]);
  await cdp.settle(250);
  const btnRect = await cdp.rect('[data-find-key="flag-selected"]');
  const sortRect = await cdp.rect('[data-find-key="sort-study"]');
  await cdp.drag(btnRect.cx, btnRect.cy, sortRect.cx, sortRect.cy);
  await cdp.settle(250);
  await subjectOpen(BA);
  await cdp.key('Tab');
  await cdp.settle(250);
  check('a press on the Flag button dragged off before release, then a SUBJECT editor and Tab, opens no list', (await listOpen()) === false, await flagBtn());
  await cdp.setState('{ paramSelected: [] }');
  await cdp.settle(200);
  const disBtn = await cdp.rect('[data-find-key="flag-selected"]');
  await cdp.click(disBtn.cx, disBtn.cy);
  await cdp.settle(200);
  await subjectOpen(BB);
  await cdp.key('Tab');
  await cdp.settle(250);
  check('a press on the disabled Flag button (nothing ticked), then a SUBJECT editor and Tab, opens no list', (await flagBtn()).disabled === true && (await listOpen()) === false, await flagBtn());

  // 20.12 (ruling 11) A flag the list empties stays offered until the list closes. The ticked films are the only holders.
  await bulkView();
  await putFlags({ [BA]: ['zzf'], [BB]: ['zzf'], [BC]: ['zzf'], [BD]: [], [BE]: ['hardware'] });
  await tick([BA, BB, BC]);
  await cdp.settle(250);
  const holders = () => cdp.evaluate(`import('./renderer/store.js').then((m) => m.getState().studies.filter((x) => (x.flags || []).includes('zzf')).map((x) => x.id).sort())`);
  check('setup: the three ticked films are the only films in the library holding zzf', same(await holders(), [BA, BB, BC]), await holders());
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(250);
  await clickBox('zzf');
  const emptied = await listNow();
  check('clearing zzf from the last films that hold it leaves its row in the list, unchecked, with no count text',
    same(await holders(), []) && emptied !== null && Boolean(emptied.boxes.zzf) && emptied.boxes.zzf.checked === false && emptied.boxes.zzf.indeterminate === false && emptied.boxes.zzf.count === null, { holders: await holders(), zzf: emptied && emptied.boxes.zzf });
  await clickBox('zzf');
  check('ticking it again gives zzf to exactly those three films', same(await holders(), [BA, BB, BC]), await holders());
  await clickBox('zzf');
  await closeList();
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(250);
  const reopened = await listNow();
  check('closing the list and reopening it while no film holds zzf no longer offers it', same(await holders(), []) && reopened !== null && reopened.boxes.zzf === undefined, { holders: await holders(), boxes: reopened && Object.keys(reopened.boxes) });
  await closeList();

  // 20.13 A refused write: the list open, a bulk delete in flight (flagsRefusal reads state.deletingStudies), a box ticked.
  await bulkView();
  await putFlags({ [BA]: ['cement'], [BB]: [], [BC]: [], [BD]: [], [BE]: [] });
  await tick([BA, BB, BC]);
  await cdp.settle(250);
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(250);
  await cdp.setState('{ toast: null }');
  await cdp.setState('{ deletingStudies: true }');
  await cdp.settle(250);
  const stillOpen13 = await listOpen();
  await clickBox('cement');
  const refused13 = { stored: [await flagsOf(BA), await flagsOf(BB), await flagsOf(BC)], toast: await toastNow(), list: await listNow() };
  await cdp.setState('{ deletingStudies: false }');
  await cdp.settle(250);
  check('with the list open during a bulk delete, ticking a box says to wait, changes no film and shows the films\' real state (cement 1 of 3, indeterminate)',
    stillOpen13 === true && same(refused13.stored, [['cement'], [], []]) && refused13.toast === 'Wait for the delete to finish.'
    && refused13.list !== null && refused13.list.boxes.cement.checked === false && refused13.list.boxes.cement.indeterminate === true && refused13.list.boxes.cement.count === '1 of 3', { stillOpen13, refused13 });
  await closeList();

  // 20.14 (2026-11-16, the final review: I2, T8) The list's box says why it refuses text that cannot be a flag, and Enter
  // on the name of a flag in use puts that flag, in the library's spelling, on every film the list acts on.
  await bulkView();
  await putFlags({ [BA]: [], [BB]: [], [BC]: [], [BD]: [], [BE]: ['Hardware'] });
  await tick([BA, BB, BC]);
  await cdp.settle(250);
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(250);
  const bulkProblem = () => cdp.evaluate(`(() => { const h = document.querySelector('.studies-bulk-flags .studies-bulk-problem'); return h ? { text: h.textContent, refused: h.classList.contains('is-refused') } : null; })()`);
  const noProblem14 = await bulkProblem();
  await cdp.typeText('q'.repeat(41));
  await cdp.settle(200);
  const problem14 = await bulkProblem();
  check('(I2) 41 characters in the list\'s box: the line under it reads 40 CHARACTERS AT MOST (and nothing did before)',
    noProblem14 === null && Boolean(problem14) && problem14.text === '40 CHARACTERS AT MOST' && problem14.refused === true, { noProblem14, problem14 });
  await cdp.evaluate(`document.querySelector('[data-find-key="bulk-flag-input"]').select()`);
  await cdp.typeText('HARDWARE');
  await cdp.settle(200);
  const typed14 = await listNow();
  check('(T8) typing the name of a flag in use clears the refusal and offers no Create', (await bulkProblem()) === null && Boolean(typed14) && typed14.create === null && typed14.input === 'HARDWARE', typed14);
  await cdp.key('Enter');
  await cdp.settle(300);
  const enter14 = { stored: [await flagsOf(BA), await flagsOf(BB), await flagsOf(BC), await flagsOf(BD)], list: await listNow() };
  check('(T8) Enter on it puts "Hardware", the library\'s spelling, on the three ticked films and not the fourth; the box clears and the list stays open',
    same(enter14.stored, [['Hardware'], ['Hardware'], ['Hardware'], []]) && enter14.list !== null && enter14.list.input === '' && enter14.list.boxes.hardware?.count === 'all 3', enter14);

  // 20.15 (T8) One popup at a time by keyboard: a funnel opened with Enter while the list is open closes the list, and
  // the Flag button opened with Enter while a menu is open closes the menu.
  const popups = () => cdp.evaluate(`({ menus: document.querySelectorAll('.studies-filter-menu').length, lists: document.querySelectorAll('.studies-bulk-flags').length, active: document.activeElement?.getAttribute('data-find-key') ?? null })`);
  await cdp.evaluate(`document.querySelector('[data-find-key="filter-flags"]').focus()`);
  await cdp.key('Enter', { typed: true });
  await cdp.settle(300);
  const menuOverList = await popups();
  check('(T8) with the list open, Enter on a focused funnel opens its menu and closes the list: one popup', menuOverList.menus === 1 && menuOverList.lists === 0, menuOverList);
  await cdp.key('Escape');
  await cdp.settle(250);
  const afterEsc15 = await popups();
  check('(T8) one Escape then closes the menu and focus lands on its funnel', afterEsc15.menus === 0 && afterEsc15.lists === 0 && afterEsc15.active === 'filter-flags', afterEsc15);
  await cdp.key('Enter', { typed: true });
  await cdp.settle(250);
  await cdp.evaluate(`document.querySelector('[data-find-key="flag-selected"]').focus()`);
  await cdp.key('Enter', { typed: true });
  await cdp.settle(300);
  const listOverMenu = await popups();
  check('(T8) with a menu open, Enter on the focused Flag button opens the list and closes the menu: one popup', listOverMenu.menus === 0 && listOverMenu.lists === 1, listOverMenu);
  await closeList();

  // 20.16 (M4) The list closed by a press on a bar button, with another store notification landing between the press and
  // its release: the button's click still acts. Delete is pressed (its click opens the bar's prompt) and a toast is
  // written between mousedown and mouseup.
  await bulkView();
  await tick([BA, BB]);
  await cdp.settle(250);
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(250);
  const delRect = await cdp.rect('[data-find-key="delete"]');
  const opened16 = await listOpen();
  if (delRect) {
    await cdp.mouse('mouseMoved', delRect.cx, delRect.cy);
    await cdp.mouse('mousePressed', delRect.cx, delRect.cy, { button: 'left', buttons: 1, clickCount: 1 });
    await cdp.setState('{ toast: "a notification between press and release" }');
    await cdp.mouse('mouseReleased', delRect.cx, delRect.cy, { button: 'left', buttons: 0, clickCount: 1 });
  }
  await cdp.settle(300);
  const after16 = { list: await listOpen(), prompt: await cdp.evaluate(`Boolean(document.querySelector('[data-find-key="delete-cancel"]'))`) };
  check('(M4) a press on Delete closes the open list, and with a notification between press and release its click still opens the Delete prompt',
    opened16 === true && Boolean(delRect) && after16.list === false && after16.prompt === true, { opened16, delRect: Boolean(delRect), after16 });
  if (after16.prompt) { await clickAt('[data-find-key="delete-cancel"]'); await cdp.settle(200); }
  await cdp.setState('{ toast: null }');

  // 20.17 (I1) The record lock works both ways. 150 throwaway films, each with a label record seeded in the scratch
  // profile, are flagged through the list (trusted Enter); an export started at once, while the flag updates are still
  // walking the films, carries the new flag in every bundled record. A second change, then a row deleted at once: no
  // label file is left for it. Each operation's start is probed for writes still in flight (level-editor.js
  // recordWritesSettled not yet resolved), which is what makes the check mean anything.
  const SYNC_N = 150;   // enough films that their record writes outlast the clicks that start the export and the delete
  const SYNC_IDS = Array.from({ length: SYNC_N }, (_, i) => `SP-${8601 + i}`);
  const syncName = (i) => `zzsync-${String(i + 1).padStart(3, '0')}`;
  const SYNC_SAVED_AT = '2026-02-03T04:05:06.789Z';
  const EXPORT_PARENT = path.join(os.tmpdir(), 'spine-contour-smoke-a1-export');
  fs.rmSync(EXPORT_PARENT, { recursive: true, force: true });
  fs.mkdirSync(EXPORT_PARENT, { recursive: true });
  await cdp.evaluate(`(async () => {
    const ids = ${JSON.stringify(SYNC_IDS)};
    const names = ids.map((_, i) => 'zzsync-' + String(i + 1).padStart(3, '0'));
    for (const name of names) {
      await window.spineContour.saveLabelRecord(name + '.label.json', { version: 1, saved_at: ${JSON.stringify(SYNC_SAVED_AT)}, app_version: '0.0.0-smoke', comment: 'smoke', flags: [], levels: {} });
    }
    const store = await import('./renderer/store.js');
    const now = new Date().toISOString();
    const records = ids.map((id, i) => ({ id, source: 'real', filePath: null, fileName: names[i] + '.png', name: null, workspaceFolder: null, subjectId: null, timepoint: null, filmDate: null, addedAt: now, view: 'Standing lateral', thumbnail: null, measurements: null, geometry: null, qc: null, clinical: {}, flags: [], labelFile: names[i] + '.label.json' }));
    store.setState((s) => ({ studies: [...records, ...s.studies.filter((x) => !ids.includes(x.id))] }));
  })()`);
  await cdp.setState(`{ screen: "studies", openId: null, query: "zzsync", paramFilters: ${FILTERS_RESET}, findFilters: ${FLAG_RESET}, paramSelected: ${JSON.stringify(SYNC_IDS)}, findSort: { key: "study", dir: "asc" }, navCollapsed: false }`);
  await cdp.settle(400);
  check(`(I1) setup: ${SYNC_N} throwaway films with a label record each, all ticked and shown`, (await rowIds()).length === SYNC_N && fs.existsSync(path.join(LABEL_DIR, `${syncName(SYNC_N - 1)}.label.json`)), (await rowIds()).length);
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(250);
  await cdp.typeText('synced');
  await cdp.settle(150);
  // The in-flight probe: recordWritesSettled raced against one timer turn.
  const PROBE = `const lvl = await import('./renderer/level-editor.js'); let settled = false; lvl.recordWritesSettled().then(() => { settled = true; }); await new Promise((r) => setTimeout(r, 0)); const inFlight = !settled;`;
  await cdp.key('Enter');
  const exportStart = await cdp.evaluate(`(async () => {
    ${PROBE}
    const screen = await import('./renderer/screens/studies.js');
    window.__a1Export = screen.exportBundleTo(${JSON.stringify(EXPORT_PARENT)});
    return { inFlight };
  })()`);
  await cdp.evaluate('window.__a1Export');
  await cdp.settle(300);
  const bundleRecords = (() => {
    const found = [];
    const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/^zzsync-\d+\.label\.json$/.test(e.name)) found.push(p); } };
    try { walk(EXPORT_PARENT); } catch { /* none */ }
    return found.map((p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } });
  })();
  check('(I1) precondition: the export started while the flag updates were still writing label records', exportStart?.inFlight === true, exportStart);
  check(`(I1) an export started at once after a bulk flag change: all ${SYNC_N} bundled records carry the new flag, saved_at untouched`,
    bundleRecords.length === SYNC_N && bundleRecords.every((r) => r && Array.isArray(r.flags) && r.flags.includes('synced') && r.saved_at === SYNC_SAVED_AT),
    { count: bundleRecords.length, without: bundleRecords.filter((r) => !r?.flags?.includes('synced')).length });
  await closeList();
  // The second change, then the film whose record the updates reach FIRST (the first of them in library order: its record is
  // read while the delete starts, the interleaving the review reproduced with a stub) is deleted at once.
  const deletedId = SYNC_IDS[0];
  // The row's own trash button (trusted) shows its prompt; then, in one page call, the second change goes through the same
  // writer the bar uses (setStudyFlags, which starts the record writes and repaints the row with its prompt still up) and the
  // prompt's confirm button is pressed straight after, so the delete starts while the writes are certainly in flight. A
  // trusted click on the confirm button came too late in one of two runs (the writes for 150 films had ended).
  const trash = await cdp.evaluate(`(() => { const e = document.querySelector('[data-find-key="row-delete-${deletedId}"]'); if (!e) return null; e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = e.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()`);
  if (trash) await cdp.click(trash.cx, trash.cy);
  await cdp.settle(200);
  const deleteStart = await cdp.evaluate(`(async () => {
    const flags = await import('./renderer/study-flags.js');
    const store = await import('./renderer/store.js');
    const lvl = await import('./renderer/level-editor.js');
    const changes = store.getState().studies.filter((x) => ${JSON.stringify(SYNC_IDS)}.includes(x.id)).map((x) => ({ id: x.id, flags: [...(x.flags || []), 'synced2'] }));
    window.__a1Set = flags.setStudyFlags(changes);
    let settled = false; lvl.recordWritesSettled().then(() => { settled = true; });
    const confirm = document.querySelector('.studies-row[data-study-id="${deletedId}"] .studies-delete-confirm');
    if (confirm) confirm.click();
    await Promise.resolve();
    return { inFlight: !settled, confirm: Boolean(confirm) };
  })()`);
  const confirmRect = deleteStart?.confirm;
  await cdp.evaluate('window.__a1Set');
  let gone17 = false;
  for (let i = 0; i < 40 && !gone17; i += 1) {
    await cdp.settle(150);
    gone17 = !(await cdp.evaluate(`import('./renderer/store.js').then((m) => m.getState().studies.some((x) => x.id === '${deletedId}'))`));
  }
  await cdp.evaluate(`import('./renderer/level-editor.js').then((m) => m.recordWritesSettled())`);
  await cdp.settle(500);
  const deletedFile = path.join(LABEL_DIR, `${syncName(0)}.label.json`);
  const others17 = SYNC_IDS.slice(1).map((_, i) => { try { return JSON.parse(fs.readFileSync(path.join(LABEL_DIR, `${syncName(i + 1)}.label.json`), 'utf8')); } catch { return null; } });
  check('(I1) precondition: the delete was confirmed while the flag updates were still writing label records', Boolean(trash) && Boolean(confirmRect) && deleteStart?.inFlight === true, { trash: Boolean(trash), confirm: Boolean(confirmRect), deleteStart });
  check('(I1) a film deleted at once after a bulk flag change leaves no label file behind', gone17 === true && !fs.existsSync(deletedFile), { gone17, exists: fs.existsSync(deletedFile) });
  check('(I1) and every other record carries the second flag, saved_at untouched',
    others17.every((r) => r && r.flags.includes('synced2') && r.saved_at === SYNC_SAVED_AT), others17.filter((r) => !r?.flags?.includes('synced2')).length);
  await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ paramSelected: [], studies: s.studies.filter((x) => !${JSON.stringify(SYNC_IDS)}.includes(x.id)) })))`);
  for (let i = 0; i < SYNC_N; i += 1) { try { fs.rmSync(path.join(LABEL_DIR, `${syncName(i)}.label.json`), { force: true }); } catch { /* scratch */ } }
  fs.rmSync(EXPORT_PARENT, { recursive: true, force: true });
  await cdp.setState('{ toast: null }');

  // Tidy: the throwaway films and the record go.
  await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ query: '', paramSelected: [], studies: s.studies.filter((x) => !${JSON.stringify([BA, BB, BC, BD, BE, BF])}.includes(x.id)) })))`);
  await cdp.setState(JSON.stringify(listBefore19));
  try { fs.rmSync(recPath, { force: true }); } catch { /* the profile is scratch */ }
  await cdp.settle(200);
  check('no console errors or exceptions during section 20', cdp.errors.length === errorsBefore20, cdp.errors.slice(errorsBefore20));
  }

  // ---------------------------------------------------------------------------------------------
  // 21 (2026-11-17, the combined bar). PR #86's Set region select beside the flags work's Flag button: both changed the
  // Find bar, and this is the merged bar in the running app. Three throwaway films (SP-9121..9123, searched out by
  // `zzregion`). A native select's dropdown cannot be driven over CDP, so a choice arrives as the page receives it: the
  // value set and a `change` event dispatched on the select, and the press that closes the open flag list is a dispatched
  // pointerdown. Every click on a button or a tick box and every key is trusted input. "A saved result" is a
  // predictionId put straight into the store (region-change.js hasResult), so no model runs.
  // ---------------------------------------------------------------------------------------------
  {
  const errorsBefore21 = cdp.errors.length;
  const listBefore21 = await cdp.evaluate(`import('./renderer/store.js').then((m) => { const s = m.getState(); return { query: s.query, findSort: s.findSort, findFilters: s.findFilters, paramFilters: s.paramFilters, paramSelected: s.paramSelected, studiesTab: s.studiesTab, screen: s.screen, openId: s.openId }; })`);
  const [RA, RB, RC] = ['SP-9121', 'SP-9122', 'SP-9123'];
  for (const [id, fileName] of [[RA, 'zzregion-a.png'], [RB, 'zzregion-b.png'], [RC, 'zzregion-c.png']]) {
    await injectFilm({ id, fileName, filePath: null, workspaceFolder: null, base64: null });
  }
  const regionView = () => cdp.setState(`{ screen: "studies", openId: null, query: "zzregion", paramFilters: ${FILTERS_RESET}, findFilters: ${FLAG_RESET}, paramSelected: [], findSort: { key: "study", dir: "asc" }, navCollapsed: false }`);
  const tick21 = (ids) => cdp.setState(`{ paramSelected: ${JSON.stringify(ids)} }`);
  const regionSel = () => cdp.evaluate(`(() => { const e = document.querySelector('[data-find-key="region"]'); return e ? { tag: e.tagName, disabled: e.disabled, title: e.title, value: e.value, first: e.options[0]?.textContent ?? null, options: [...e.options].map((o) => o.value) } : null; })()`);
  const pick = async (value) => {
    await cdp.evaluate(`(() => { const e = document.querySelector('[data-find-key="region"]'); if (!e) return; e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await cdp.settle(250);
  };
  const film = (id) => cdp.evaluate(`import('./renderer/store.js').then((m) => { const x = m.getState().studies.find((y) => y.id === ${JSON.stringify(id)}); return x ? { region: x.region ?? null, predictionId: x.predictionId ?? null, reviewedAt: x.reviewedAt ?? null, regionHints: x.regionHints ?? null, flags: x.flags ?? null } : null; })`);
  // RA as a film with a saved result, a review date and crop marks (1.7.0, Mark crops).
  const MARKS = { s1: { x: 120, y: 340 }, neck: { x: 110, y: 60 } };
  const giveResult = () => cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ studies: s.studies.map((x) => (x.id === ${JSON.stringify(RA)} ? { ...x, predictionId: 'smoke-region', reviewedAt: '2026-01-02T03:04:05.000Z', regionHints: ${JSON.stringify(MARKS)} } : x)) })))`);
  const promptNow = () => cdp.evaluate(`(() => { const p = document.querySelector('[data-find-key="region-prompt"]'); return p ? { text: p.querySelector('span')?.textContent ?? null, focused: document.activeElement?.getAttribute('data-find-key') ?? null } : null; })()`);
  const barKeys = () => cdp.evaluate(`[...document.querySelectorAll('.studies-filters > [data-find-key]')].map((e) => e.getAttribute('data-find-key'))`);
  const listOpen21 = () => cdp.evaluate(`Boolean(document.querySelector('.studies-bulk-flags'))`);
  const toast21 = async () => (await cdp.state()).toast;

  // 21.1 The bar: Delete, Export, Flag, then the select; with nothing ticked it is disabled and says why.
  await regionView();
  await putFlags({ [RA]: ['keep me'], [RB]: ['keep me', 'second'], [RC]: [] });
  await cdp.settle(250);
  const keys1 = await barKeys();
  const none21 = await regionSel();
  check('the bar reads Delete, Export, Flag, Set region in that order', same(keys1, ['delete', 'export-bundle', 'flag-selected', 'region']), keys1);
  check('with nothing ticked the select is disabled, reads "Set region…" and is titled "Tick studies to set their region"',
    Boolean(none21) && none21.tag === 'SELECT' && none21.disabled === true && none21.first === 'Set region…' && none21.title === 'Tick studies to set their region'
    && same(none21.options, ['', 'auto', 'lumbar', 'cervical', 'full_spine']), none21);

  // 21.2 Two films with no result: the change applies at once, says so, and their flags stay.
  for (const id of [RA, RB]) await clickAt(`input[data-find-key="row-${id}"]`);
  await cdp.settle(200);
  const two2 = await regionSel();
  check('two ticked films: the select is enabled and reads "Set region of 2…"', Boolean(two2) && two2.disabled === false && two2.first === 'Set region of 2…', two2);
  await pick('cervical');
  const applied2 = { a: await film(RA), b: await film(RB), c: await film(RC), prompt: await promptNow(), toast: await toast21(), sel: await regionSel() };
  check('choosing Cervical with no result to clear applies at once: both films read cervical, the unticked one does not, no prompt',
    applied2.a.region === 'cervical' && applied2.b.region === 'cervical' && applied2.c.region !== 'cervical' && applied2.prompt === null, applied2);
  check('the toast says "Set 2 studies to Cervical." and the select is back on its label', applied2.toast === 'Set 2 studies to Cervical.' && applied2.sel.value === '' && applied2.sel.first === 'Set region of 2…', { toast: applied2.toast, sel: applied2.sel });
  check('a region change keeps each film\'s flags', same(applied2.a.flags, ['keep me']) && same(applied2.b.flags, ['keep me', 'second']), { a: applied2.a.flags, b: applied2.b.flags });
  await pick('cervical');
  check('choosing the region they already have changes nothing and says so', (await toast21()) === 'Set 0 studies to Cervical. 2 already were Cervical.', await toast21());

  // 21.3 A film with a saved result: the prompt takes the bar's place and closes the open flag list; Cancel and Escape
  // keep the result; Set region clears the result and the crop marks and keeps the flags.
  await giveResult();
  await cdp.settle(200);
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(250);
  const listBefore3 = await listOpen21();
  await pick('lumbar');
  const asked3 = { prompt: await promptNow(), list: await listOpen21(), keys: await barKeys(), a: await film(RA) };
  check('choosing Lumbar with one result to clear asks first, naming the count, with focus on Cancel',
    Boolean(asked3.prompt) && asked3.prompt.text === 'Set 2 studies to Lumbar? 1 of their saved results will be cleared; segment them again.' && asked3.prompt.focused === 'region-cancel', asked3.prompt);
  check('the prompt takes the bar\'s place and the open flag list closes with it', listBefore3 === true && asked3.list === false && same(asked3.keys, ['region-prompt']), { listBefore3, list: asked3.list, keys: asked3.keys });
  check('nothing changes while the prompt waits', asked3.a.region === 'cervical' && asked3.a.predictionId === 'smoke-region', asked3.a);
  await clickAt('[data-find-key="region-cancel"]');
  await cdp.settle(250);
  const cancelled3 = { prompt: await promptNow(), active: await activeKey(), a: await film(RA), keys: await barKeys() };
  check('Cancel withdraws the prompt, keeps the result and the marks, and returns focus to the select',
    cancelled3.prompt === null && cancelled3.active === 'region' && cancelled3.a.predictionId === 'smoke-region' && same(cancelled3.a.regionHints, MARKS)
    && same(cancelled3.keys, ['delete', 'export-bundle', 'flag-selected', 'region']), cancelled3);
  await pick('lumbar');
  await cdp.key('Escape');
  await cdp.settle(250);
  const escaped3 = { prompt: await promptNow(), active: await activeKey(), a: await film(RA) };
  check('Escape does the same', escaped3.prompt === null && escaped3.active === 'region' && escaped3.a.predictionId === 'smoke-region', escaped3);
  await pick('lumbar');
  await clickAt('[data-find-key="region-confirm"]');
  await cdp.settle(300);
  const set3 = { a: await film(RA), b: await film(RB), prompt: await promptNow(), toast: await toast21(), keys: await barKeys() };
  check('Set region applies it: both films read lumbar and the result and its review date are cleared',
    set3.a.region === 'lumbar' && set3.b.region === 'lumbar' && set3.a.predictionId === null && set3.a.reviewedAt === null && set3.prompt === null && set3.toast === 'Set 2 studies to Lumbar.', set3);
  check('the changed film loses its crop marks, as the Analysis Region select clears them', set3.a.regionHints === null, set3.a.regionHints);
  check('and both films still hold their flags', same(set3.a.flags, ['keep me']) && same(set3.b.flags, ['keep me', 'second']), { a: set3.a.flags, b: set3.b.flags });
  check('the bar is back with its four controls', same(set3.keys, ['delete', 'export-bundle', 'flag-selected', 'region']), set3.keys);

  // 21.4 The prompt is withdrawn when the ticked set no longer holds its films.
  await giveResult();
  await cdp.settle(200);
  await pick('cervical');
  const armed4 = await promptNow();
  await clickAt(`input[data-find-key="row-${RB}"]`);
  await cdp.settle(250);
  const after4 = { prompt: await promptNow(), a: await film(RA), keys: await barKeys() };
  check('unticking one of its films withdraws the prompt and changes nothing', Boolean(armed4) && after4.prompt === null && after4.a.region === 'lumbar' && after4.a.predictionId === 'smoke-region', { armed4, after4 });

  // 21.5 A press on the select closes the open flag list in place: the select itself is not rebuilt (a rebuilt select
  // would lose the press that opens its dropdown), and a later notification does not rebuild it either.
  await tick21([RA, RB]);
  await cdp.settle(200);
  await clickAt('[data-find-key="flag-selected"]');
  await cdp.settle(250);
  const open5 = await listOpen21();
  const pressed5 = await cdp.evaluate(`(() => {
    const e = document.querySelector('[data-find-key="region"]');
    if (!e) return null;
    e.__smokeKept = true;
    e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    const now = document.querySelector('[data-find-key="region"]');
    return { same: now === e && now.__smokeKept === true, list: Boolean(document.querySelector('.studies-bulk-flags')), expanded: document.querySelector('[data-find-key="flag-selected"]')?.getAttribute('aria-expanded') };
  })()`);
  check('a press on the select closes the open flag list and leaves the select node in place', open5 === true && Boolean(pressed5) && pressed5.same === true && pressed5.list === false && pressed5.expanded === 'false', { open5, pressed5 });
  await cdp.setState('{ toast: "a notification after the press" }');
  await cdp.settle(150);
  check('a notification after that press does not rebuild the select', (await cdp.evaluate(`document.querySelector('[data-find-key="region"]')?.__smokeKept === true`)) === true, await regionSel());
  await cdp.setState('{ toast: "" }');

  // 21.6 An open FLAGS editor holding typed text: moving focus to the select saves the text as a flag and focus lands
  // on the select.
  await openFlags(RC);
  await cdp.typeText('typed first');
  await cdp.settle(150);
  await cdp.evaluate(`document.querySelector('[data-find-key="region"]')?.focus()`);
  await cdp.settle(300);
  const moved6 = { flags: await flagsOf(RC), active: await activeKey(), editor: (await editorNow(RC)).open };
  check('focus moving from an open FLAGS editor to the select saves the typed flag, closes the editor and lands on the select',
    same(moved6.flags, ['typed first']) && moved6.active === 'region' && moved6.editor === false, moved6);

  // 21.7 A run in flight (simulated in the store): Set region is refused as Delete is, Flag is not.
  await cdp.setState(`{ running: ${JSON.stringify(RC)} }`);
  await cdp.settle(250);
  const during7 = { sel: await regionSel(), flag: await cdp.evaluate(`document.querySelector('[data-find-key="flag-selected"]')?.disabled ?? null`), del: await cdp.evaluate(`document.querySelector('[data-find-key="delete"]')?.disabled ?? null`) };
  check('during a run the select is disabled with the wait reason on its title, Delete is disabled, and Flag stays enabled',
    Boolean(during7.sel) && during7.sel.disabled === true && during7.sel.title !== '' && during7.sel.title !== 'Tick studies to set their region' && during7.del === true && during7.flag === false, during7);
  await cdp.setState('{ running: null }');
  await cdp.settle(250);
  check('and it is enabled again when the run ends', (await regionSel()).disabled === false, await regionSel());

  // Tidy: the throwaway films go and the list is put back.
  await cdp.evaluate(`import('./renderer/store.js').then((m) => m.setState((s) => ({ query: '', paramSelected: [], toast: '', studies: s.studies.filter((x) => !${JSON.stringify([RA, RB, RC])}.includes(x.id)) })))`);
  await cdp.setState(JSON.stringify(listBefore21));
  await cdp.settle(200);
  check('no console errors or exceptions during section 21', cdp.errors.length === errorsBefore21, cdp.errors.slice(errorsBefore21));
  }
} finally {
  cdp.close();
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${JSON.stringify(r.detail)}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
