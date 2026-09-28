import { boundCalibration, studyRegion } from './cervical.js';

export const SEGMENTAL_PAIRS = {
  cervical: [['C2', 'C3'], ['C3', 'C4'], ['C4', 'C5'], ['C5', 'C6'], ['C6', 'C7']],
  lumbar: [['L1', 'L2'], ['L2', 'L3'], ['L3', 'L4'], ['L4', 'L5'], ['L5', 'S1']],
};
export function segmentalColumns(region) {
  const pairs = region === 'full_spine' ? [...SEGMENTAL_PAIRS.cervical, ...SEGMENTAL_PAIRS.lumbar]
    : SEGMENTAL_PAIRS[region] ?? [];
  return pairs.flatMap(([upper, lower]) => ['lordosis', 'angulation'].map(kind => ({
    key: `SEG_${kind}_${upper}-${lower}`, upper, lower, kind, unit: '°',
    label: `Segmental ${kind} ${upper}–${lower}`,
    exportLabel: `Segmental ${kind} ${upper}-${lower} (deg)`,
  })));
}
function validPlate(plate, geometry) {
  return Array.isArray(plate) && plate.length === 2 && plate.every(p =>
    Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)
    && p[0] >= 0 && p[1] >= 0
    && (!geometry.image_width || p[0] < geometry.image_width)
    && (!geometry.image_height || p[1] < geometry.image_height))
    && Math.hypot(plate[1][0] - plate[0][0], plate[1][1] - plate[0][1]) > 0;
}
export function segmentalEndplates(geometry, key) {
  const def = segmentalColumns('full_spine').find(column => column.key === key);
  if (!def || !geometry) return null;
  const upper = geometry.vertebrae?.[def.upper]?.[def.kind === 'lordosis' ? 'superior' : 'inferior'];
  const lower = def.lower === 'S1' ? geometry.s1_superior : geometry.vertebrae?.[def.lower]?.superior;
  return [upper, lower].every(p => validPlate(p, geometry)) ? [upper, lower] : null;
}
// Issue #15: superior/superior for lordosis; inferior/superior for disc angulation.
// As with the existing Cobb/LL results, report unsigned acute angles. Derive from
// saved geometry and current bound calibration so edits/reloads cannot retain stale values.
export function segmentalRows(study, selectedLevel = null) {
  const geometry = study?.geometry;
  const spacing = boundCalibration(geometry, study?.calibration)?.spacing;
  return segmentalColumns(studyRegion(study)).map(def => {
    const plates = study?.measurements && segmentalEndplates(geometry, def.key);
    let value = null;
    if (plates) {
      const vectors = plates.map(([a, b]) => [(b[0] - a[0]) * (spacing?.column_mm ?? 1),
        (b[1] - a[1]) * (spacing?.row_mm ?? 1)]);
      const [a, b] = vectors;
      value = Math.atan2(Math.abs(a[0] * b[1] - a[1] * b[0]),
        Math.abs(a[0] * b[0] + a[1] * b[1])) * 180 / Math.PI;
    }
    return { ...def, value, absent: value === null, highlight: selectedLevel === def.key };
  });
}
export function segmentalValues(study) {
  return Object.fromEntries(segmentalRows(study).map(row => [row.key, row.value]));
}
