/**
 * Crop marks (no DOM): the points a person places on the film so the models read the crop they mean instead of the
 * region detector's. Two marks, each two points in original-film pixels, the shape backend/region_hints.py accepts:
 *
 *   s1:   the superior endplate of S1 (its two superior corners). The lumbar crop is framed from it the way the
 *         training films were cut around S1, on lumbar and full-spine films alike.
 *   neck: the top of C2 and the bottom of C7. The neck crop is the square on that span.
 *
 * The previews here mirror the backend's geometry (framing.reframe and region_hints.neck_box) so the stage can show
 * the crop a mark will give before it is run; the backend computes the crop it actually uses.
 */
export const MARKS = Object.freeze({
  s1: { label: 'S1 ENDPLATE', help: 'Click the two superior corners of S1.' },
  neck: { label: 'C2–C7', help: 'Click the top of C2, then the bottom of C7.' },
});
export const EMPTY_MARKS = Object.freeze({ s1: null, neck: null });

// backend/framing.py CROP_ABOVE_L, CROP_BELOW_L and CROP_ASPECT, and the +15% superior extension the lumbar crops get.
const ABOVE = 8.7, BELOW = 5.3, ASPECT = 1.5, LUMBAR_UP = 0.15;

const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const span = (points) => Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);

// A stored or incoming value as { s1, neck }, each two points or null; null when it holds no complete mark.
export function normalizeMarks(value) {
  if (!value || typeof value !== 'object') return null;
  const pair = (points) => (Array.isArray(points) && points.length === 2 && points.every(isPoint)
    ? points.map((p) => [p[0], p[1]]) : null);
  const marks = { s1: pair(value.s1), neck: pair(value.neck) };
  return marks.s1 || marks.neck ? marks : null;
}

function clip(cx, cy, w, h, width, height) {
  const left = Math.round(Math.max(0, Math.min(width - 2, cx - w / 2)));
  const top = Math.round(Math.max(0, Math.min(height - 2, cy - h / 2)));
  return [left, top, Math.round(Math.max(left + 1, Math.min(width, cx + w / 2))),
    Math.round(Math.max(top + 1, Math.min(height, cy + h / 2)))];
}

// The neck crop's square, as the backend builds it from the C2–C7 span.
export function neckBox(points, width, height) {
  const side = span(points);
  const cx = (points[0][0] + points[1][0]) / 2, cy = (points[0][1] + points[1][1]) / 2;
  return [Math.max(0, Math.round(cx - side / 2)), Math.max(0, Math.round(cy - side / 2)),
    Math.min(width, Math.round(cx + side / 2)), Math.min(height, Math.round(cy + side / 2))];
}

// The lumbar crop framed around an S1 endplate (framing.reframe), extended 15% upward as the crops are read.
export function s1Frame(points, width, height) {
  const length = span(points);
  if (!(length >= 4)) return null;
  const h = (ABOVE + BELOW) * length;
  const cx = (points[0][0] + points[1][0]) / 2, cy = (points[0][1] + points[1][1]) / 2;
  const [l, t, r, b] = clip(cx, cy - (ABOVE - BELOW) / 2 * length, h / ASPECT, h, width, height);
  return [l, Math.max(0, Math.round(t - LUMBAR_UP * (b - t))), r, b];
}

// The region to run marked crops with: a neck mark means both regions are on the film, so full spine; an S1 mark
// alone keeps the requested region, except cervical, which is read whole and so goes back to Auto detect.
export function regionForMarks(requested, marks) {
  if (marks?.neck) return 'full_spine';
  return requested === 'cervical' ? 'auto' : requested;
}

// One click while placing `target`: the first or second point of that mark; a third click starts it again.
export function addMarkPoint(draft, target, point) {
  const current = draft[target] ?? [];
  const next = current.length >= 2 ? [point] : [...current, point];
  return { ...draft, [target]: next };
}

// What the bar says it will do, '' when nothing is complete.
export function marksSummary(marks) {
  const parts = [];
  if (marks?.s1?.length === 2) parts.push('lumbar crop from S1');
  if (marks?.neck?.length === 2) parts.push('neck crop from C2–C7');
  return parts.join(' and ');
}
