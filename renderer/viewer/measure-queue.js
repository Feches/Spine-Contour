import { debounce } from './interactions.js';

// The /measure round-trip, extracted from components/viewer.js so its bookkeeping is testable
// without a DOM: revisions are PER STUDY, the single debounce knows whose call it holds,
// committing on another study flushes the pending one instead of replacing it, replacing a
// study's geometry (a prediction, a reset) discards its pending or in-flight correction, and a
// failed round-trip discards its preview. Drafts live outside Study records:
// persistence and exports always see the last successfully measured pair.
export function createMeasureQueue({ measure, getState, setState, showToast, debounceMs = 150 }) {
  const revisions = new Map(); // studyId -> latest revision issued
  const measured = new Map();  // studyId -> the geometry the study's current measurements describe
  let pendingId = null;        // the study whose call sits in the debounce, or null

  function bump(studyId) {
    const next = (revisions.get(studyId) ?? 0) + 1;
    revisions.set(studyId, next);
    return next;
  }

  function writeStudy(studyId, patch) {
    setState((current) => {
      const measurementDrafts = { ...current.measurementDrafts };
      delete measurementDrafts[studyId];
      return {
        measurementDrafts,
        studies: current.studies.map((item) => (item.id === studyId ? { ...item, ...patch } : item)),
      };
    });
  }

  function discardDraft(studyId) {
    if (!getState().measurementDrafts?.[studyId]) return;
    setState((current) => {
      const measurementDrafts = { ...current.measurementDrafts };
      delete measurementDrafts[studyId];
      return { measurementDrafts };
    });
  }

  async function recalculate(studyId) {
    pendingId = null;
    const revision = bump(studyId);
    const study = getState().studies.find((item) => item.id === studyId);
    const geometry = getState().measurementDrafts?.[studyId];
    if (!study || !geometry) { discardDraft(studyId); return; }
    try {
      const result = await measure({
        vertebrae: geometry.vertebrae,
        s1_superior: geometry.s1_superior,
        femoral_circles: geometry.femoral_circles,
      });
      if (revision !== revisions.get(studyId)) return;
      const current = getState().studies.find((item) => item.id === studyId);
      if (!current || current.addedAt !== study.addedAt) { discardDraft(studyId); return; }
      measured.set(studyId, result.geometry);
      // The numbers a review was made over are being replaced, so the mark goes with them
      // (studies-table spec 2026-09-10, section 8.4). On the write, not derived: one line, one test.
      writeStudy(studyId, { measurements: result.measurements, geometry: result.geometry, reviewedAt: null,
        ...(result.qc?.coverage ? { qc: { ...current.qc, coverage: result.qc.coverage } } : {}) });
    } catch (error) {
      if (revision !== revisions.get(studyId)) return;
      const known = measured.get(studyId);
      discardDraft(studyId);
      if (known) {
        showToast(`The correction was not applied — could not update measurements: ${error.message}`);
      } else {
        showToast(`Could not update measurements: ${error.message}`);
      }
    }
  }

  const schedule = debounce(recalculate, debounceMs);

  // Previews an edited geometry as a NEW reference and schedules the re-measure. Every edit
  // path ends here: drag release, keyboard nudge, retrace fit. The bump supersedes any response
  // still in flight for this study -- after a commit, none of them describes the store's geometry.
  function commitGeometry(studyId, geometry) {
    bump(studyId);
    if (!getState().studies.some((item) => item.id === studyId)) return;
    setState((current) => ({ measurementDrafts: { ...current.measurementDrafts, [studyId]: geometry } }));
    if (pendingId !== null && pendingId !== studyId) {
      schedule.cancel();
      recalculate(pendingId);
    }
    pendingId = studyId;
    schedule(studyId);
  }

  // Drops any correction pending or in flight for ONE study, and records the geometry its
  // measurements now describe (a fresh prediction, a reset).
  function replaceMeasured(studyId, geometry) {
    bump(studyId);
    if (pendingId === studyId) {
      schedule.cancel();
      pendingId = null;
    }
    if (geometry) measured.set(studyId, geometry);
    else measured.delete(studyId);
    discardDraft(studyId);
  }

  return { commitGeometry, replaceMeasured };
}
