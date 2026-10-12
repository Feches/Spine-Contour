import { CERVICAL_LEVELS } from '../data/cervical.js';
import { LEVELS, landmarkAt } from './geometry.js';

export const POINT_NAMES = { SA: 'superior anterior', SP: 'superior posterior', IA: 'inferior anterior', IP: 'inferior posterior', CENTROID: 'body centroid' };

// Only request absent points. Completed model endplates remain untouched.
export function annotationTargets(geometry) {
  if (!geometry) return [];
  const cervical = ['cervical', 'full_spine'].includes(geometry.region);
  const lumbar = geometry.region !== 'cervical';
  const targets = [];
  for (const level of [...(cervical ? CERVICAL_LEVELS : []), ...(lumbar ? [...LEVELS, 'S1'] : [])]) {
    const corners = level === 'C2' ? ['IA', 'IP'] : level === 'S1' ? ['SA', 'SP'] : ['SA', 'SP', 'IP', 'IA'];
    const missing = corners.filter(corner => !landmarkAt(geometry, level, corner));
    if (missing.length) targets.push({ id: level, level, corners: missing, label: `${level} · ${missing.length} missing points` });
  }
  for (const level of cervical ? (geometry.region === 'full_spine' ? ['C2', 'C7'] : ['C2']) : []) {
    if (!landmarkAt(geometry, level, 'CENTROID')) targets.push({ id: `${level}-centroid`, level, corners: ['CENTROID'], label: `${level} body centroid` });
  }
  return targets;
}

export function applyAnnotation(source, target, points) {
  const current = annotationTargets(source).find(item => item.id === target.id);
  if (!current || JSON.stringify(current.corners) !== JSON.stringify(target.corners)) throw new Error('The missing landmarks changed. Select the level again.');
  if (points.length !== target.corners.length || !points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) throw new Error('Place every requested point before applying.');
  const geometry = structuredClone(source);
  geometry.vertebrae ??= {};
  const { level } = target;
  points.forEach((point, i) => {
    const p = point.map((value, axis) => Math.max(0, Math.min((geometry[axis ? 'image_height' : 'image_width'] ?? Infinity) - 1, value)));
    const corner = target.corners[i];
    if (corner === 'CENTROID') { geometry[level === 'C2' ? 'c2_centroid' : 'c7_centroid'] = p; return; }
    if (level === 'S1') { geometry.s1_superior ??= [null, null]; geometry.s1_superior[corner === 'SA' ? 0 : 1] = p; return; }
    const body = geometry.vertebrae[level] ??= { superior: null, inferior: null, quadrilateral: null };
    const plate = corner.startsWith('S') ? 'superior' : 'inferior';
    body[plate] ??= [null, null];
    body[plate][corner.endsWith('A') ? 0 : 1] = p;
  });
  const body = geometry.vertebrae[level];
  for (const plate of level === 'S1' ? [geometry.s1_superior] : [body?.superior, body?.inferior]) {
    if (plate && Math.hypot(plate[0][0] - plate[1][0], plate[0][1] - plate[1][1]) < 1) throw new Error('Endplate points must be distinct. Undo the last point and place it again.');
  }
  if (!target.corners.includes('CENTROID') && body?.superior && body?.inferior) {
    body.quadrilateral = [body.superior[0], body.superior[1], body.inferior[1], body.inferior[0]];
    const turns = body.quadrilateral.map((a, i, polygon) => {
      const b = polygon[(i + 1) % 4], c = polygon[(i + 2) % 4];
      return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    });
    if (!turns.every(n => n > 0) && !turns.every(n => n < 0)) throw new Error('The corners must outline the body without crossing. Check the anterior and posterior points.');
    if (level === 'L1' || (level === 'C7' && geometry.region === 'full_spine')) geometry[level === 'L1' ? 'l1_center' : 'c7_centroid'] = [0, 1].map(axis => body.quadrilateral.reduce((sum, p) => sum + p[axis], 0) / 4);
  }
  delete geometry.manually_cleared;
  return geometry;
}
