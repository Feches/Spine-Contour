export const TRAINING_TARGETS = [
  ['lumbar_landmarks', 'Lumbar landmarks'],
  ['lumbar_segmentation', 'Lumbar segmentation from corner polygons'],
  ['cervical_landmarks', 'Cervical landmarks'],
];

export function trainingReason(study, target, drafts = {}) {
  if (study.source !== 'real') return 'Demo study';
  if (!study.reviewedAt || study.processingError) return 'Review the study first';
  if (drafts[study.id]) return 'Finish and review pending landmark edits';
  if (!study.subjectId?.trim()) return 'Assign a Subject ID';
  const g = study.geometry;
  if (!g || !study.filePath || !g.source_sha256 || g.coordinate_space !== 'original_image') return 'Reprocess and review the source image';
  const region = g.region || 'lumbar';
  if (!(target === 'cervical_landmarks' ? ['cervical', 'full_spine'] : ['lumbar', 'full_spine']).includes(region)) return 'Different spine region';
  const framing = study.qc?.framing;
  const key = region === 'full_spine' ? (target === 'cervical_landmarks' ? 'cervical_window' : 'lumbar_window') : 'window';
  if (!Array.isArray(framing?.[key])) return 'Reprocess to save the model crop';
  if (target === 'lumbar_segmentation' && !['L1', 'L2', 'L3', 'L4', 'L5'].every(level => {
    const body = g.vertebrae?.[level];
    return body?.superior?.length === 2 && body?.inferior?.length === 2;
  })) return 'Segmentation requires all L1–L5 corners';
  return null;
}

export function trainingSnapshot(studies, ids, target, drafts = {}) {
  const selected = studies.filter(study => ids.has(study.id));
  if (!selected.length) throw new Error('Select reviewed studies.');
  for (const study of selected) {
    const reason = trainingReason(study, target, drafts);
    if (reason) throw new Error(`${study.id}: ${reason}`);
  }
  if (new Set(selected.map(study => study.subjectId.trim())).size < 5) throw new Error('Select at least five distinct subjects.');
  return structuredClone(selected.map(({ id, source, subjectId, filePath, geometry, qc, reviewedAt, processingError }) =>
    ({ id, source, subjectId, filePath, geometry, qc, reviewedAt, processingError })));
}

export function trainingProgress(status) {
  if (!status || status.stage === 'idle') return 'No training run started.';
  const seconds = status.elapsed_seconds ?? (status.startedAt ? (Date.now()-status.startedAt)/1000 : 0);
  const elapsed = `${Math.floor(seconds/60)}m ${Math.floor(seconds%60)}s elapsed`;
  const remaining = status.stage === 'training' && Number.isFinite(status.remaining_seconds)
    ? ` · about ${Math.ceil(status.remaining_seconds/60)}m remaining (estimate)` : '';
  return `${status.message || status.stage} · ${elapsed}${remaining}`;
}
