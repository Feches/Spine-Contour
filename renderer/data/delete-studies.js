// Only remove a library record after deleting its saved prediction succeeds, and its label record
// (level editor, 2026-10-10) when it has one: a failure of either counts the study as failed and
// leaves it in the library. deleteLabelRecord is optional, so a caller that has none keeps working.
// Original radiographs are never passed to a file-deletion API. Demo studies are never among the
// targets -- they carry no tick and no trash button (studies-table spec 2026-09-10, section 5) -- and
// are skipped if handed in; showing and hiding them is renderer/demo-studies.js's business (spec 9).
export async function deleteStudyBatch(studies, { deletePrediction, deleteLabelRecord = async () => {} }) {
  const deleted = [];
  const failed = [];
  for (const study of studies.filter((study) => study.source === 'real')) {
    try {
      await deletePrediction(study.id);
      if (typeof study.labelFile === 'string' && study.labelFile !== '') await deleteLabelRecord(study.labelFile);
      deleted.push(study.id);
    }
    catch (error) { failed.push({ id: study.id, message: error.message }); }
  }
  return { deleted, failed };
}
