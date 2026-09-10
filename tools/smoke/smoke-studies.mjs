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
// films, one unreadable film, and two films with a Stop — about three more real runs.
//
// Two consequences for whoever sequences the suites:
//   * NEVER run this between `smoke-persist.mjs --phase run` and `--phase restart`. Section 5
//     re-injects SP-9000 unsegmented, destroying the corrected geometry --phase restart
//     compares against.
//   * It leaves the app on Studies with SP-9000 segmented and nothing open on Analysis. Any
//     suite documented as "assumes a segmented study open on Analysis" needs its own
//     inject-study.js + run-and-wait.js pair after this one, not before it.
import fs from 'node:fs';
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
  check('the header row reads STUDY, SUBJECT, VIEW, WORKSPACE, FOLDER, DATE, STATUS',
    JSON.stringify(cellDetail.headers) === JSON.stringify(['STUDY', 'SUBJECT', 'VIEW', 'WORKSPACE', 'FOLDER', 'DATE', 'STATUS', '']),
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
      editDisabled: tool('Edit landmarks')?.disabled,
      rerunDisabled: tool('Re-run segmentation')?.disabled,
      headerPill: document.querySelector('.analysis-header .pill-demo')?.textContent,
      exportDisabled: exportButton ? exportButton.disabled : null,
      exportTitle: exportButton ? exportButton.title : null,
      confidence: document.querySelector('.confidence-value')?.textContent,
      l1paLabel: cell('L1PA', '.meas-label'), l1paValue: cell('L1PA', '.meas-value'),
      llLabel: cell('LL', '.meas-label'), llValue: cell('LL', '.meas-value'),
    };
  })()`);
  check('the demo card is visible with the DEMO STUDY eyebrow', demo.cardVisible === true && demo.eyebrow === 'DEMO STUDY' && demo.title === 'No film for a demo study', demo);
  check('the demo card offers no run button and no spinner', demo.runButtonHidden === true && demo.spinnerHidden === true, demo);
  check('edit and re-run are disabled for a demo study', demo.editDisabled === true && demo.rerunDisabled === true, demo);
  check('the Analysis header carries a DEMO pill', demo.headerPill === 'DEMO', demo.headerPill);
  check('Export CSV is disabled for a demo study and says why', demo.exportDisabled === true && demo.exportTitle === 'Demo studies are not exported', demo);
  check('FEMORAL FIT CONFIDENCE reads 96%', demo.confidence === '96%', demo.confidence);
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

  const backRect2 = await cdp.rect('.icon-btn[aria-label="Back to studies"]');
  await cdp.click(backRect2.cx, backRect2.cy);
  await cdp.settle();
  s = await cdp.state();
  const newRow = await cdp.evaluate(`(() => {
    const row = document.querySelector('.studies-row');
    if (!row) return null;
    return {
      id: row.dataset.studyId,
      badgeProc: Boolean(row.querySelector('.badge-proc')),
      badgeText: row.querySelector('.badge-proc')?.textContent,
      subject: row.querySelector('.studies-cell-subject')?.textContent.trim(),
      name: row.querySelector('.studies-cell-id')?.textContent,
      workspace: row.querySelector('.studies-cell-workspace')?.textContent,
      folder: row.querySelector('.studies-cell-folder')?.textContent,
      demoPill: Boolean(row.querySelector('.pill-demo')),
    };
  })()`);
  check('the new study is the first row, Processing, no DEMO pill', newRow && newRow.id === 'SP-9000' && newRow.badgeProc && newRow.badgeText === 'Processing' && newRow.subject === '—' && newRow.demoPill === false, newRow);
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

  // Back to Studies mid-run, the way a user would. NOTE: SP-9000 is unsegmented here, so
  // deriveStatus already returns 'proc' for it -- this pass proves the badge and the summary
  // agree during a run, and section 8 below is what actually proves the "or currently running"
  // rule, against a study deriveStatus calls 'seg'.
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
      queued: m ? Number(m[2]) : null,
      procRows: document.querySelectorAll('.studies-row .badge-proc').length,
    };
  })()`);
  check('the running study is badged Processing in the list', listWhileRunning.badgeProc === true && listWhileRunning.badgeText === 'Processing', listWhileRunning);
  check('the summary UNSEGMENTED count matches the Processing badges', listWhileRunning.queued !== null && listWhileRunning.queued === listWhileRunning.procRows && listWhileRunning.queued >= 1, listWhileRunning);

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
    editDisabled: document.querySelector('.viewer-tool[aria-label="Edit landmarks"]')?.disabled,
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
  // deriveStatus does NOT call 'proc'. Section 7's pass cannot fail if that rule is deleted --
  // an unsegmented study derives 'proc' anyway -- so the rule is only actually under test here,
  // on the SP-9000 section 7 just segmented. Deterministic for the same reason: its bytes are
  // still in this session's payload map, so the re-run starts.
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
      procRows: document.querySelectorAll('.studies-row .badge-proc').length,
    };
  })()`);
  check('a SEGMENTED study reads Processing while it is the running study', badgeWhileRerunning.proc === true && badgeWhileRerunning.text === 'Processing', badgeWhileRerunning);
  check('the summary counts the re-running study as unsegmented', badgeWhileRerunning.queued === badgeWhileRerunning.procRows && badgeWhileRerunning.queued >= 1, badgeWhileRerunning);

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
  // A select is driven by setting its value and dispatching change (cdp-lib's key() cannot pick).
  // A missing element returns null rather than throwing (see the comment above clickAt).
  const pick = (key, value) => cdp.evaluate(`(() => { const el = document.querySelector('[data-find-key="${key}"]'); if (!el) return null; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); return el.value; })()`);
  const summaryParts = async () => {
    const m = /^(\d+) STUDIES · (\d+) UNSEGMENTED \u00B7 (\d+) TO REVIEW$/.exec(((await text(cdp, '.studies-summary')) || '').trim());
    return m ? { studies: Number(m[1]), unsegmented: Number(m[2]) } : null;
  };
  // A missing element is a FAIL in the results, never a throw: the suite prints its results only at
  // the end, and a throw here would print nothing (HANDOFF's silent-suite trap).
  const clickAt = async (selector) => { const r = await cdp.rect(selector); if (r) await cdp.click(r.cx, r.cy); return Boolean(r); };
  const FILTERS_RESET = '{ workspace: null, folder: null, segmentedOnly: true, timepoint: null, view: null, subject: "", pairedOnly: false, pairedWith: "__any__" }';

  // 10. The filter bar and the ticks. SP-9001 sits under a workspace root, with no bytes and no
  // such file; SP-9000 is segmented (section 8).
  await cdp.setState(`{ screen: "studies", query: "", paramFilters: ${FILTERS_RESET}, paramSelected: [] }`);
  await cdp.settle(200);
  const countBefore10 = (await cdp.state()).studies.length;
  await injectFilm({ id: 'SP-9001', fileName: 'S001.png', filePath: 'C:\\smoke\\Fusion2025\\pre-op\\S001.png', workspaceFolder: 'C:\\smoke\\Fusion2025', base64: null });
  await cdp.settle(200);
  const bar10 = await cdp.evaluate(`(() => {
    const opts = (key) => [...document.querySelectorAll('[data-find-key="' + key + '"] option')].map((o) => o.textContent);
    return { workspace: opts('workspace'), folder: opts('folder'), rows: document.querySelectorAll('.studies-row').length };
  })()`);
  check('the Workspace select offers the injected root, then Added by hand', JSON.stringify(bar10.workspace) === JSON.stringify(['All workspaces', 'Fusion2025', 'Added by hand']), bar10.workspace);
  check('the Folder select offers every folder shown, first seen first', JSON.stringify(bar10.folder) === JSON.stringify(['All folders', 'pre-op', 'design_src']), bar10.folder);
  check('the injected film is a row', bar10.rows === countBefore10 + 1, bar10.rows);
  const bar10Plain = await readBar();
  check('with nothing ticked the button offers every visible unsegmented film', bar10Plain.label === 'Segment 1 unsegmented' && bar10Plain.disabled === false && bar10Plain.note === null, bar10Plain);

  await pick('workspace', 'C:\\smoke\\Fusion2025');
  await cdp.settle(150);
  const ws10 = await cdp.evaluate(`(() => {
    const el = document.querySelector('[data-find-key="workspace"]');
    return {
      rows: [...document.querySelectorAll('.studies-row')].map((r) => r.dataset.studyId),
      folder: [...document.querySelectorAll('[data-find-key="folder"] option')].map((o) => o.textContent),
      value: el ? el.value : null,
    };
  })()`);
  check('filtering by workspace leaves the one film under that root', JSON.stringify(ws10.rows) === JSON.stringify(['SP-9001']), ws10.rows);
  check('the Folder select narrows to that root and the select keeps its value across the rebuild', JSON.stringify(ws10.folder) === JSON.stringify(['All folders', 'pre-op']) && ws10.value === 'C:\\smoke\\Fusion2025', ws10);
  const summary10 = await summaryParts();
  check('the summary still describes the whole library', summary10 !== null && summary10.studies === countBefore10 + 1 && summary10.unsegmented === 1, summary10);
  const shared10 = (await cdp.state()).paramFilters;
  check('the filter lives in the shared paramFilters key', shared10.workspace === 'C:\\smoke\\Fusion2025' && shared10.folder === null, shared10);
  await pick('folder', 'pre-op');
  await cdp.settle(150);
  check('filtering by folder keeps the film in it', (await rowCount(cdp)) === 1, await rowCount(cdp));
  await clickAt('.studies-search');
  await cdp.typeText('zzzznomatch');
  await cdp.settle();
  const empty10 = (await text(cdp, '.studies-empty') || '').trim();
  check('with a filter set and nothing left, the empty state names the filters', empty10 === 'No studies match these filters.', empty10);
  await clearSearch(cdp);
  await pick('workspace', '');
  await cdp.settle(150);
  check('clearing the workspace clears the folder and restores every row', (await rowCount(cdp)) === countBefore10 + 1 && (await cdp.state()).paramFilters.folder === null, await rowCount(cdp));

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
  await cdp.setState('{ paramSelected: ["SP-9001"] }');
  await cdp.settle(150);
  const bar11 = await readBar();
  check('with the unreadable film ticked the button offers it', bar11.label === 'Segment 1 selected' && bar11.disabled === false, bar11);
  await clickAt('[data-find-key="segment"]');
  const failed11 = await waitForState('s.toast.startsWith("Segmented 0 of 1")', 15000);
  s = await cdp.state();
  const sp9001 = s.studies.find((x) => x.id === 'SP-9001');
  check('the batch ends with the film counted as failed and named in the toast', failed11 === true && s.toast === 'Segmented 0 of 1 film. · 1 could not be segmented: S001 (file not found)', s.toast);
  check('the unreadable film is untouched and the batch is cleared', s.batch === null && s.running === null && sp9001 && sp9001.measurements === null, { batch: s.batch, running: s.running });

  // 12. A real two-film batch (spec 9's worked example at fixture scale): the count, the badges,
  // the sidebar, the cards mid-batch, the toast, the ticks afterwards.
  await injectFilm({ id: 'SP-9002', fileName: 'batch-a.jpg', filePath: null, workspaceFolder: null, base64: SAMPLE_BASE64 });
  await injectFilm({ id: 'SP-9003', fileName: 'batch-b.jpg', filePath: null, workspaceFolder: null, base64: SAMPLE_BASE64 });
  await cdp.setState('{ paramSelected: [] }');
  await cdp.settle(200);
  const bar12Plain = await readBar();
  check('with nothing ticked the button counts every visible unsegmented film', bar12Plain.label === 'Segment 3 unsegmented' && bar12Plain.disabled === false, bar12Plain);
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
  check('the running, the queued and the unreadable film all read Processing', progress12a.procRows === 3, progress12a.procRows);

  // The cards mid-batch. The injected film segments in roughly 9 s; two openings take about 1 s.
  await clickAt('.studies-row[data-study-id="SP-9002"]');
  await cdp.settle(200);
  const queuedCard = await cdp.evaluate(`(() => ({
    eyebrow: document.querySelector('.run-eyebrow')?.textContent, title: document.querySelector('.run-title')?.textContent,
    disabled: document.querySelector('.run-button')?.disabled, buttonTitle: document.querySelector('.run-button')?.title,
  }))()`);
  check('a queued film opened mid-batch reads QUEUED, waiting for its turn, its run button disabled', queuedCard.eyebrow === 'QUEUED' && queuedCard.title === 'Waiting for its turn in the batch' && queuedCard.disabled === true && queuedCard.buttonTitle === 'Wait for the batch to finish', queuedCard);
  await clickAt('.icon-btn[aria-label="Back to studies"]');
  await cdp.settle(150);
  await clickAt('.studies-row[data-study-id="SP-9001"]');
  await cdp.settle(200);
  const outsideCard = await cdp.evaluate(`(() => ({ eyebrow: document.querySelector('.run-eyebrow')?.textContent, title: document.querySelector('.run-title')?.textContent, disabled: document.querySelector('.run-button')?.disabled, buttonTitle: document.querySelector('.run-button')?.title }))()`);
  check('an unsegmented film outside the batch reads UNSEGMENTED with its run button disabled for the batch', outsideCard.eyebrow === 'UNSEGMENTED' && outsideCard.title === 'No segmentation yet' && outsideCard.disabled === true && outsideCard.buttonTitle === 'Wait for the batch to finish', outsideCard);
  await clickAt('.icon-btn[aria-label="Back to studies"]');
  await cdp.settle(150);

  // Bounded to two minutes: one film, up to a minute on a cold backend. A missed window fails fast.
  const oneDone12 = await waitForState('s.batch !== null && s.batch.done === 1', 120000);
  const progress12b = await readProgress();
  check('after the first film the bar reads 1 of 2 done and the sidebar 1 OF 2 DONE', oneDone12 === true && progress12b.text === '1 of 2 done' && progress12b.sidebar === '1 OF 2 DONE', progress12b);
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
  await clickAt('[data-find-key="stop"]');
  await cdp.settle(150);
  const stopping13 = await readProgress();
  s = await cdp.state();
  check('Stop marks the batch stopping: the text, the disabled Stop and the sidebar say so', stopping13.text === 'Stopping after this film…' && stopping13.stopDisabled === true && stopping13.sidebar === 'STOPPING', stopping13);
  check('the film in flight keeps running after Stop', s.running === 'SP-9005' && s.batch && s.batch.stopping === true, { running: s.running, batch: s.batch });
  const finished13 = await waitForState('s.batch === null', 400000);
  s = await cdp.state();
  const c13 = s.studies.find((x) => x.id === 'SP-9004');
  const d13 = s.studies.find((x) => x.id === 'SP-9005');
  check('the batch ends after the film in flight, the other left unsegmented', finished13 === true && Boolean(d13 && d13.measurements) && c13 && c13.measurements === null, { c: Boolean(c13 && c13.measurements), d: Boolean(d13 && d13.measurements) });
  check('the toast says the batch stopped', s.toast === 'Segmented 1 of 2 films, then stopped.', s.toast);
  const bar13 = await readBar();
  check('the bar offers the film Stop left behind and notes the one it segmented', bar13.label === 'Segment 1 selected' && bar13.disabled === false && bar13.note === '1 already segmented', bar13);

  // 14. No new console errors or exceptions across the batch sections.
  check('no console errors or exceptions during the batch sections', cdp.errors.length === errorsAfter9, cdp.errors.slice(errorsAfter9));
  // ---------------------------------------------------------------------------------------------
  // 15-17 (2026-09-10, studies-table spec): sortable headers, the SUBJECT editor, Delete selected.
  // ---------------------------------------------------------------------------------------------
  const errorsAfter14 = cdp.errors.length;
  await cdp.setState(`{ screen: "studies", query: "", paramFilters: ${FILTERS_RESET}, paramSelected: [], findSort: { key: "date", dir: "desc" } }`);
  await cdp.settle(200);
  const badgeOrder = () => cdp.evaluate(`[...document.querySelectorAll('.studies-row')].map((r) => (r.querySelector('.badge') || {}).className || '')`);
  const rank = (c) => (c.includes('badge-proc') ? 0 : c.includes('badge-rev') ? 1 : c.includes('badge-seg') ? 2 : c.includes('badge-ok') ? 3 : 9);
  const activeKey = () => cdp.evaluate(`document.activeElement ? document.activeElement.getAttribute('data-find-key') : null`);

  // 15. Sort (spec 6). SP-9000 is segmented, SP-9001 unsegmented (section 10), the demos segmented.
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
} finally {
  cdp.close();
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${JSON.stringify(r.detail)}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
