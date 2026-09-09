import { calibrationMath, normalizeCalibration } from './calibration.js';

export const DISC_LEVEL_PAIRS = [['L1', 'L2'], ['L2', 'L3'], ['L3', 'L4'], ['L4', 'L5'], ['L5', 'S1']];
export const DISC_POSITIONS = ['anterior', 'middle', 'posterior'];

function validEndplate(points, calibration) {
  return Array.isArray(points) && points.length === 2 && [points[0], points[1]].every(p =>
    Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)
    && p[0] >= 0 && p[0] < calibration.width && p[1] >= 0 && p[1] < calibration.height)
    && calibrationMath.distance(points) > 0;
}

function midpoint([a, p]) {
  return [(a[0] + p[0]) / 2, (a[1] + p[1]) / 2];
}

// Derived from the current saved original-image geometry and this film's scale each
// time, so landmark edits, calibration corrections and reloads cannot leave stale heights.
// Endplates are anatomically ordered [anterior, posterior], regardless of image facing.
// These are point-to-point distances, not perpendicular gaps or vertebral body heights.
export function discRows(study) {
  const calibration = normalizeCalibration(study?.calibration);
  const geometry = study?.geometry;
  return DISC_LEVEL_PAIRS.map(([upper, lower]) => {
    const row = { key: `${upper}-${lower}`, label: `${upper}–${lower}`, unit: 'mm',
      anterior: null, middle: null, posterior: null };
    if (!calibration?.spacing || !geometry) return row;
    const top = geometry.vertebrae?.[upper]?.inferior;
    const bottom = lower === 'S1' ? geometry.s1_superior : geometry.vertebrae?.[lower]?.superior;
    if (!validEndplate(top, calibration) || !validEndplate(bottom, calibration)) return row;
    const distance = (a, b) => {
      const mm = calibrationMath.distance([a, b], calibration.spacing);
      return Number.isFinite(mm) ? mm : null;
    };
    row.middle = distance(midpoint(top), midpoint(bottom));
    // U-Net has no anatomical A/P reference when S1 is absent. Midpoints
    // remain measurable, but endpoint indices alone cannot name A/P heights.
    if (geometry.vertebrae?.[upper]?.anterior_confirmed !== false
        && geometry.vertebrae?.[lower]?.anterior_confirmed !== false) {
      row.anterior = distance(top[0], bottom[0]);
      row.posterior = distance(top[1], bottom[1]);
    }
    return row;
  });
}
