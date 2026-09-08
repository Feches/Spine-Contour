/**
 * Pure logic for batch segmentation (docs/superpowers/specs/2026-09-08-batch-segmentation-design.md,
 * "the spec" below): which films a click on the Find tab's segment button runs and what the button
 * says (spec 7.3), the batch object's transitions (8.1), the progress and sidebar texts (7.4, 9),
 * the closing toast (9), and the driver loop over injected dependencies (8.2). No DOM.
 * renderer/batch.js is the one wiring of createBatchDriver to the real store; screens/studies.js
 * renders what planBatch returns; components/viewer.js reads isQueued; test/batch.test.js pins it.
 */
import { selectedVisible, isSegmented } from './parameters.js';
import { studyName } from './labels.js';

// The toast's naming rule, as data/pairing.js applies it: up to five names, then an ellipsis.
const NAME_CAP = 5;
const ELLIPSIS = '\u2026';
const SEP = ' \u00B7 ';

export const STOPPING_TEXT = 'Stopping after this film\u2026';
export const WAIT_FOR_RUN = 'Wait for the current segmentation to finish';
export const WAIT_FOR_BATCH = 'Wait for the batch to finish';
export const UNSAVED_BATCH = 'Studies are not being saved this session; batch results will be lost when the app closes.';

// What the segment button runs and says (spec 7.3). `visible` is the Find tab's rows after the
// search and the two filters, in table order; `selected` is state.paramSelected; `running` is
// state.running. Only real, unsegmented, visible rows are ever run; "ticked" means ticked AND
// visible (HANDOFF decision 38). A single run in flight disables the button whatever the rows say.
export function planBatch({ visible, selected, running }) {
  const real = (visible ?? []).filter((study) => study.source === 'real');
  const chosen = selectedVisible(real, selected);
  const pool = chosen.length > 0 ? chosen : real;
  const ids = pool.filter((study) => !isSegmented(study)).map((study) => study.id);
  const already = pool.length - ids.length;
  const label = chosen.length > 0 ? `Segment ${ids.length} selected` : `Segment ${ids.length} unsegmented`;
  let note = null;
  if (running) {
    note = WAIT_FOR_RUN;
  } else if (chosen.length > 0) {
    if (ids.length === 0) note = 'All selected studies are segmented';
    else if (already > 0) note = `${already} already segmented`;
  } else if (ids.length === 0) {
    note = real.length === 0 ? 'Nothing to segment' : 'All visible studies are segmented';
  }
  return { ids, label, note, enabled: ids.length > 0 && !running };
}

// The batch object (spec 8.1). Every transition returns a NEW object: the store's gates compare
// by reference. `done` counts every turn that ended, so the count always reaches the total.
export function newBatch(ids) {
  return { ids: [...ids], done: 0, failed: [], warnings: [], skipped: 0, stopping: false };
}

// One turn ended. `outcome` is { skipped: true }, { ok: true, id, name, warning? } or
// { ok: false, id, name, reason }.
export function advance(batch, outcome) {
  const next = { ...batch, done: batch.done + 1, failed: [...batch.failed], warnings: [...batch.warnings] };
  if (outcome.skipped) {
    next.skipped = batch.skipped + 1;
  } else if (outcome.ok) {
    if (outcome.warning) next.warnings.push({ id: outcome.id, name: outcome.name, reason: outcome.warning });
  } else {
    next.failed.push({ id: outcome.id, name: outcome.name, reason: outcome.reason });
  }
  return next;
}

export function withStopping(batch) {
  return { ...batch, stopping: true };
}

// A film is "waiting in the batch" (spec 9) from the one whose turn is starting -- index `done`;
// state.running is what says it is in flight -- to the last. A film whose turn has ended sits
// below `done` and is not waiting.
export function isQueued(batch, studyId) {
  if (!batch) return false;
  return batch.ids.indexOf(studyId) >= batch.done;
}

// The filter bar's progress text (spec 7.4) and the Studies nav row's sublabel (spec 9).
export function progressText(batch) {
  return batch.stopping ? STOPPING_TEXT : `${batch.done} of ${batch.ids.length} done`;
}

export function sidebarText(batch) {
  return batch.stopping ? 'STOPPING' : `${batch.done} OF ${batch.ids.length} DONE`;
}

function names(entries) {
  return entries.slice(0, NAME_CAP).map((entry) => `${entry.name} (${entry.reason})`).join(', ')
    + (entries.length > NAME_CAP ? `, ${ELLIPSIS}` : '');
}

// The closing toast (spec 9): what was segmented, then one clause per thing that was not, each
// only when nonzero. "then stopped" only when Stop ended the batch before its last film.
export function batchMessage(batch) {
  const total = batch.ids.length;
  const ok = batch.done - batch.failed.length - batch.skipped;
  const stopped = batch.stopping && batch.done < total;
  let text = `Segmented ${ok} of ${total} ${total === 1 ? 'film' : 'films'}${stopped ? ', then stopped' : ''}.`;
  if (batch.failed.length > 0) text += `${SEP}${batch.failed.length} could not be segmented: ${names(batch.failed)}`;
  if (batch.warnings.length > 0) text += `${SEP}${batch.warnings.length} segmented without stored images: ${names(batch.warnings)}`;
  if (batch.skipped > 0) text += `${SEP}${batch.skipped} skipped (deleted, or segmented meanwhile)`;
  return text;
}

// The loop (spec 8.2), over injected dependencies so it is tested without a DOM, the way
// viewer/measure-queue.js takes an injected `measure`. `segment(studyId)` is the analysis screen's
// run core in batch mode: it resolves { ok: true, warning? } or { ok: false, reason } and promises
// never to reject; a rejection is still counted as a failure so state.batch can never be left
// stuck. Strictly serial: the next film starts only after the previous outcome is folded in.
export function createBatchDriver({ segment, getState, setState, showToast, persistenceDisabledReason }) {
  // Each id's addedAt at the click. Ids are max+1, so a deleted id is reused by the next film
  // added; the record's identity is addedAt, which a reused id never carries.
  const identity = new Map();

  async function startBatch(ids) {
    const state = getState();
    // deletingStudies as well: a bulk delete is removing the records these ids name, and the
    // first turn's segmentStudy would refuse anyway -- every film would be counted as a failure
    // and named in the closing toast. Refusing here means no batch was ever started.
    if (state.batch || state.running || state.deletingStudies || !Array.isArray(ids) || ids.length === 0) return false;
    identity.clear();
    for (const id of ids) {
      const study = state.studies.find((item) => item.id === id);
      identity.set(id, study ? study.addedAt : null);
    }
    // Before the first await, so nothing can start a run or a second batch in between.
    setState({ batch: newBatch(ids) });
    if (persistenceDisabledReason()) showToast(UNSAVED_BATCH);
    for (const id of ids) {
      const study = getState().studies.find((item) => item.id === id);
      let outcome;
      if (!study || study.addedAt !== identity.get(id) || study.measurements != null) {
        outcome = { skipped: true };
      } else {
        let result;
        try {
          result = await segment(id);
        } catch (error) {
          result = { ok: false, reason: error && error.message ? error.message : String(error) };
        }
        outcome = { ...result, id, name: studyName(study) };
      }
      setState((current) => ({ batch: advance(current.batch, outcome) }));
      if (getState().batch.stopping) break;
    }
    const finished = getState().batch;
    setState({ batch: null });
    showToast(batchMessage(finished));
    return true;
  }

  function stopBatch() {
    if (!getState().batch) return;
    setState((current) => ({ batch: withStopping(current.batch) }));
  }

  return { startBatch, stopBatch };
}
