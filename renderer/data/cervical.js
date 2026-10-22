import { normalizeCalibration } from './calibration.js';

export const CERVICAL_LEVELS = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'];
export const CERVICAL_COLUMNS = [
  { key: 'C2C7_COBB', label: 'C2–C7 Cobb', unit: '°' },
  { key: 'C2C7_SVA_MM', label: 'C2–C7 SVA (mm)', unit: 'mm' },
  { key: 'C2C7_SVA_PX', label: 'C2–C7 SVA (px)', unit: 'px' },
  { key: 'T1S', label: 'T1 slope', unit: '°' }, // (2026-10-22, spec P10)
];
// The requested mode persists independently of the region resolved by prediction.
export function requestedRegion(study) {
  return ['auto', 'lumbar', 'cervical', 'full_spine'].includes(study?.region) ? study.region
    : ['cervical', 'full_spine'].includes(study?.geometry?.region) ? study.geometry.region : 'lumbar';
}
export function studyRegion(study) {
  const requested = requestedRegion(study);
  return requested === 'auto' && ['lumbar', 'cervical', 'full_spine'].includes(study?.geometry?.region)
    ? study.geometry.region : requested;
}
export function studyRegionLabel(study) { return studyRegion(study).replace('_', ' '); }
// The region the Studies list shows, filters and sorts by (2026-10-19). Unlike the two helpers above, a
// study with nothing set and nothing detected is Unknown rather than lumbar, because the list should not
// claim a region nobody chose and no run found. The one exception is a study that already carries a result:
// only the old lumbar pipeline produced results without recording a region, so that result is lumbar.
export const REGION_KEYS = Object.freeze(['unknown', 'lumbar', 'cervical', 'full_spine']);
const REGION_LABELS = Object.freeze({ unknown: 'Unknown', lumbar: 'Lumbar', cervical: 'Cervical', full_spine: 'Full spine' });
const KNOWN_REGIONS = ['lumbar', 'cervical', 'full_spine'];
export function regionKey(study) {
  if (KNOWN_REGIONS.includes(study?.region)) return study.region;
  if (KNOWN_REGIONS.includes(study?.geometry?.region)) return study.geometry.region;
  return study?.measurements != null ? 'lumbar' : 'unknown';
}
export function regionLabel(key) { return Object.hasOwn(REGION_LABELS, key) ? REGION_LABELS[key] : 'Unknown'; }
export function requiresAnteriorSide(study) { return studyRegion(study) !== 'lumbar'; }
export function validAnteriorSide(side) { return side === 'left' || side === 'right'; }
export function regionRunReason(study) { return null; }
const point = p => Array.isArray(p) && p.length === 2 && p.every(value => Number.isFinite(value) && value >= 0);
const endplate = p => Array.isArray(p) && p.length === 2 && p.every(point)
  && Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]) > 0;

export function boundCalibration(geometry, value) {
  const calibration = normalizeCalibration(value);
  if (!calibration) return null;
  if (geometry?.source_sha256 && calibration.source_sha256 !== geometry.source_sha256) return null;
  if (geometry?.image_width && calibration.width !== geometry.image_width) return null;
  if (geometry?.image_height && calibration.height !== geometry.image_height) return null;
  return calibration;
}

// Always use the current source-bound study scale. Geometry may retain an older scale
// from inference, and an explicit calibration clear must not resurrect those millimetres.
//
// T1S (the T1 slope, 2026-10-22) is the exception: it is READ from the stored measurements, never recomputed. The
// backend computes it on every /measure path and nothing in the renderer duplicates the formula.
export function cervicalMeasurements(study) {
  // (Closing wave, F2; spec P3, section 7) The T1 slope is cervical-family: a lumbar film's stored T1S is not read.
  const stored = ['cervical', 'full_spine'].includes(studyRegion(study)) ? study?.measurements?.T1S : null;
  const empty = { region: 'cervical', C2C7_COBB: null, C2C7_SVA_PX: null, C2C7_SVA_MM: null,
    T1S: typeof stored === 'number' && Number.isFinite(stored) ? stored : null };
  if (!['cervical', 'full_spine'].includes(studyRegion(study)) || !study?.geometry) return empty;
  const g = study.geometry;
  const calibration = boundCalibration(g, study.calibration);
  const spacing = calibration?.spacing;
  const sx = spacing?.column_mm ?? 1;
  const sy = spacing?.row_mm ?? 1;
  const validPoint = p => point(p) && (!g.image_width || p[0] < g.image_width)
    && (!g.image_height || p[1] < g.image_height);
  const validPlate = plate => endplate(plate) && plate.every(validPoint);
  const c2 = g.vertebrae?.C2?.inferior;
  const c7 = g.vertebrae?.C7?.inferior;
  if (validPlate(c2) && validPlate(c7)) {
    const angle = plate => Math.atan2((plate[1][1] - plate[0][1]) * sy, (plate[1][0] - plate[0][0]) * sx);
    const degrees = Math.abs((angle(c2) - angle(c7)) * 180 / Math.PI) % 180;
    empty.C2C7_COBB = Math.min(degrees, 180 - degrees);
  }
  const centroid = g.c2_centroid;
  const posterior = g.vertebrae?.C7?.superior?.[1];
  if (validPoint(centroid) && validPlate(g.vertebrae?.C7?.superior) && validAnteriorSide(g.anterior_side)) {
    empty.C2C7_SVA_PX = (centroid[0] - posterior[0]) * (g.anterior_side === 'left' ? -1 : 1) || 0;
    const inside = p => p[0] >= 0 && p[0] < calibration.width && p[1] >= 0 && p[1] < calibration.height;
    if (spacing && inside(centroid) && inside(posterior)) empty.C2C7_SVA_MM = empty.C2C7_SVA_PX * sx;
  }
  return empty;
}
export function cervicalRows(study, selectedLevel = null) {
  const m = cervicalMeasurements(study);
  const mm = m.C2C7_SVA_MM !== null;
  return [
    { key: 'C2C7_COBB', label: 'C2–C7 COBB', value: m.C2C7_COBB, unit: '°' },
    { key: 'C2C7_SVA', label: mm ? 'C2–C7 SVA' : 'C2–C7 SVA · UNCALIBRATED', value: mm ? m.C2C7_SVA_MM : m.C2C7_SVA_PX, unit: mm ? 'mm' : 'px' },
    { key: 'T1S', label: 'T1 SLOPE', value: m.T1S, unit: '°' },
  ].map(row => ({ ...row, absent: row.value === null, highlight: row.key === selectedLevel }));
}
export function cervicalMeasureGeometry(geometry, calibration) {
  const scale = boundCalibration(geometry, calibration)?.spacing;
  return { ...geometry, pixel_spacing: scale ? [scale.row_mm, scale.column_mm] : null,
    spacing_source: scale?.source ?? null };
}
