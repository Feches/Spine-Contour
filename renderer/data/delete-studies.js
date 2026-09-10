// Only remove a library record after deleting its saved prediction succeeds. Original radiographs
// are never passed to a file-deletion API. Demo studies are never among the targets -- they carry
// no tick and no trash button (studies-table spec 2026-09-10, section 5) -- and are skipped if handed in;
// showing and hiding them is renderer/demo-studies.js's business (spec 9).
export async function deleteStudyBatch(studies, { deletePrediction }) {
  const deleted = [];
  const failed = [];
  for (const study of studies.filter((study) => study.source === 'real')) {
    try { await deletePrediction(study.id); deleted.push(study.id); }
    catch (error) { failed.push({ id: study.id, message: error.message }); }
  }
  return { deleted, failed };
}
