/**
 * (Study flags, spec §4.8, 2026-11-16) The one writer of a study's `flags`. Every screen that changes flags, one film or
 * many, calls setStudyFlags: one store update for the whole change, then each changed film's label record is put in
 * step through level-editor.js's syncRecordFlags, which takes its turn with Save edits and Mark reviewed. The study's
 * flags are the truth and the record is the copy: a record that could not be updated is reported once, in one toast,
 * and the flags stand.
 *
 * A change is refused while a bulk delete, a bundle import or a bundle export runs (the import and the export say so
 * through setFlagsBusy), or while the library is not being saved.
 */
import { getState, setState } from './store.js';
import { persistenceDisabledReason } from './api.js';
import { showToast } from './components/toast.js';
import { cleanFlags, sameFlagList } from './data/flags.js';
import { syncRecordFlags } from './level-editor.js';

// 'import' or 'export' while a bundle import or export runs, else null.
let busy = null;

/** A bundle import or export starting (`'import'`, `'export'`) or ending (`null`). */
export function setFlagsBusy(kind) {
  busy = kind === 'import' || kind === 'export' ? kind : null;
}

/** Why flags cannot change now, as the sentence to show; `''` when they can. */
export function flagsRefusal(state = getState()) {
  if (state.deletingStudies) return 'Wait for the delete to finish.';
  if (busy === 'import') return 'Wait for the import to finish.';
  if (busy === 'export') return 'Wait for the export to finish.';
  const reason = persistenceDisabledReason();
  if (reason) return `Studies are not being saved: ${reason}`;
  return '';
}

/**
 * Sets each film's flags (`changes`: `{ id, flags }[]`). A demo study, an unknown id and a film whose flags already
 * match (ignoring cleaning) are left out; the rest are written in one store update, each as a new study with the cleaned
 * list, and their label records are then brought in step. Resolves with the ids changed and the ids whose record could
 * not be updated. When refused, says why and changes nothing.
 * @param {{id: string, flags: string[]}[]} changes
 * @returns {Promise<{changed: string[], failed: string[]}>}
 */
export async function setStudyFlags(changes) {
  const refusal = flagsRefusal();
  if (refusal) {
    showToast(refusal);
    return { changed: [], failed: [] };
  }
  const { studies } = getState();
  const next = new Map();
  for (const change of Array.isArray(changes) ? changes : []) {
    const study = studies.find((item) => item.id === change?.id);
    if (!study || study.source === 'demo') continue;
    const flags = cleanFlags(change.flags);
    if (sameFlagList(cleanFlags(study.flags), flags)) continue;
    next.set(study.id, flags);
  }
  if (next.size === 0) return { changed: [], failed: [] };
  setState((s) => ({ studies: s.studies.map((study) => (next.has(study.id) ? { ...study, flags: next.get(study.id) } : study)) }));
  const changed = [...next.keys()];
  const failed = await syncFlagsAndReport(changed);
  return { changed, failed };
}

/**
 * Brings the label records of `ids` in step with their studies' flags, and says once how many could not be updated.
 * Resolves with those ids (setStudyFlags hands them on).
 * @param {string[]} ids
 */
export async function syncFlagsAndReport(ids) {
  const { failed } = await syncRecordFlags(ids);
  const n = failed.length;
  if (n > 0) showToast(`Flags saved. The label record could not be updated for ${n} ${n === 1 ? 'film' : 'films'}.`);
  return failed;
}
