export const calibrationMath = {
    distance(points, spacing) {
      if (!points || points.length !== 2) return null;
      const [a, b] = points;
      if (![...a, ...b].every(Number.isFinite)) return null;
      if (spacing && (![spacing.row_mm, spacing.column_mm].every(Number.isFinite)
        || spacing.row_mm <= 0 || spacing.column_mm <= 0)) return null;
      return Math.hypot((b[0] - a[0]) * (spacing?.column_mm ?? 1), (b[1] - a[1]) * (spacing?.row_mm ?? 1));
    },
    reference(points, value) {
      const length = calibrationMath.distance(points);
      if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(length) || length < 2) return null;
      return { row_mm: value / length, column_mm: value / length, source: 'manual_reference' };
    },
  };

// Compact, backwards-compatible study field: never persist preview image bytes here.
export function normalizeCalibration(value) {
  if (!value || value.version !== 1 || value.coordinate_space !== 'original_image'
    || !/^[a-f0-9]{64}$/.test(value.source_sha256 || '')
    || !Number.isInteger(value.width) || value.width <= 0
    || !Number.isInteger(value.height) || value.height <= 0
    || !['detected', 'dicom', 'corrected', 'not_found', 'ambiguous', 'conflicting', 'unavailable', 'cleared'].includes(value.status)
    || !Array.isArray(value.candidates) || value.candidates.length > 128) return null;
  if (value.review_revision != null && (!Number.isSafeInteger(value.review_revision) || value.review_revision < 1)) return null;
  const validPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)
    && p[0] >= 0 && p[0] < value.width && p[1] >= 0 && p[1] < value.height;
  for (const c of value.candidates) {
    if (!c || !Array.isArray(c.endpoints) || c.endpoints.length !== 2 || !c.endpoints.every(validPoint)
      || !Number.isFinite(c.value_mm) || c.value_mm <= 0
      || !Number.isFinite(c.length_px) || c.length_px < 2
      || Math.abs(calibrationMath.distance(c.endpoints) - c.length_px) > .001) return null;
  }
  const selected = value.selected_index;
  if (selected !== null && (!Number.isInteger(selected) || selected < 0 || selected >= value.candidates.length)) return null;
  const calibrated = ['detected', 'dicom', 'corrected'].includes(value.status);
  const spacing = value.spacing;
  if (calibrated) {
    if (!spacing || ![spacing.row_mm, spacing.column_mm].every(n => Number.isFinite(n) && n > 0)) return null;
    if (value.status === 'dicom') {
      if (spacing.source !== 'dicom_pixel_spacing') return null;
    } else {
      const c = value.candidates[selected];
      if (!c || c.status !== 'accepted') return null;
      const expected = c.value_mm / c.length_px;
      if (Math.abs(spacing.row_mm / expected - 1) > 1e-5
        || Math.abs(spacing.column_mm / expected - 1) > 1e-5
        || spacing.source !== (value.status === 'corrected' ? 'manual_reference' : 'printed_ruler')) return null;
    }
  } else if (spacing != null || selected !== null) return null;
  const { image_png, ...compact } = value;
  return structuredClone(compact);
}

export function calibrationSummary(value) {
  const c = normalizeCalibration(value);
  if (!c) return 'Image scale has not been checked. Run segmentation to detect it automatically.';
  if (!c.spacing) return c.message || 'No reliable image scale. Review the reference in Image calibration.';
  const s = c.spacing;
  const scale = Math.abs(s.row_mm - s.column_mm) < 1e-9
    ? `${s.row_mm.toFixed(5)} mm / pixel`
    : `${s.column_mm.toFixed(5)} × ${s.row_mm.toFixed(5)} mm / pixel (x, y)`;
  const reference = c.candidates[c.selected_index];
  return `${scale} · ${reference ? `${reference.value_mm} mm${reference.flag || ''} reference` : 'DICOM pixel spacing'}`;
}

export function preferReviewedCalibration(fresh, reviewed) {
  const current = normalizeCalibration(fresh);
  const saved = normalizeCalibration(reviewed);
  return current && saved && ['corrected', 'cleared'].includes(saved.status)
    && saved.source_sha256 === current.source_sha256 && saved.width === current.width && saved.height === current.height
    && (!['corrected', 'cleared'].includes(current.status) || (saved.review_revision ?? 0) >= (current.review_revision ?? 0))
    ? saved : current;
}

// Windows pickers/scanners may differ in drive/path case or separator. POSIX paths
// remain case-sensitive; a basename alone must never match another patient's image.
export function calibrationPathKey(filePath) {
  if (typeof filePath !== 'string') return null;
  return /^[a-z]:[\\/]|^\\\\|^\/\//i.test(filePath) ? filePath.replaceAll('\\', '/').toLowerCase() : filePath;
}
