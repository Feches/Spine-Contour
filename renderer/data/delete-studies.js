// Only remove a library record after deleting its saved prediction succeeds.
// Original radiographs are never passed to a file-deletion API.
export async function deleteStudyBatch(studies, { deletePrediction, hideDemos }) {
  const deleted = [];
  const failed = [];
  if (studies.some(study => study.source === 'demo')) {
    try {
      await hideDemos();
      deleted.push(...studies.filter(study => study.source === 'demo').map(study => study.id));
    } catch (error) {
      failed.push(...studies.filter(study => study.source === 'demo').map(study => ({ id: study.id, message: error.message })));
    }
  }
  for (const study of studies.filter(study => study.source === 'real')) {
    try { await deletePrediction(study.id); deleted.push(study.id); }
    catch (error) { failed.push({ id: study.id, message: error.message }); }
  }
  return { deleted, failed };
}
