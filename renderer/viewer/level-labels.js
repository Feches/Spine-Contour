/**
 * (2026-10-13, gate feedback G7; plan D20, rulings R43 and R44) The level editor's label plates: where each one sits
 * and the pure parts of dragging one. Pure, with node:test coverage (test/level-labels.test.js); canvas.js draws the
 * plates from `labelPlacement`, and components/viewer.js, the only writer of `state.platePositions`, hit-tests and
 * drags them with the rest.
 *
 * R43, placement: a plate sits outside its level, on the posterior side. Its anchor is the posterior corner (the
 * middle of the posterior edge for a body), as before G7; `side` is the way the plate extends from it, away from the
 * level: +1 rightward, -1 leftward. Before G7 every plate went right, which on a film facing right (its posterior edge
 * on the left) put each plate inside its body, over the anatomy being checked.
 *
 * R44, dragging: `state.platePositions` maps a level's code to its plate's drag offset `[dx, dy]` in image pixels. It
 * is view state, like zoom and pan: FRESH_VIEW resets it when another film opens, entering and leaving edit mode keep
 * it, and it is never persisted and never in the label record.
 */
import { kindOf, hasCentroid } from '../data/levels.js';
import { validAnteriorSide } from '../data/cervical.js';
import { anteriorSideFrom } from '../data/level-projection.js';

// A difference in x under this many image pixels says nothing about a side: the film's side decides.
const SIDE_SLOP_PX = 1;

const isPoint = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const isPair = (pair) => Array.isArray(pair) && pair.length === 2 && isPoint(pair[0]) && isPoint(pair[1]);
const copy = (p) => [p[0], p[1]];
const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// The film's fallback: the posterior side is opposite the anterior one, and rightward when the side is unknown.
function filmSide(anteriorSide) {
  return anteriorSide === 'right' ? -1 : 1;
}

// The side a difference in x (posterior minus the level's middle) reads, or the film's when it is under 1 px.
function sideOf(difference, anteriorSide) {
  return Math.abs(difference) >= SIDE_SLOP_PX ? Math.sign(difference) : filmSide(anteriorSide);
}

// The geometry a level's kind needs for a plate; anything else (a bad record, a head) has none.
function hasPlateGeometry(code, geometry) {
  if (!geometry) return false;
  switch (kindOf(code)) {
    // (2026-10-21, partial endplates, spec §5) a body needs one pair; C2 its pair or its centroid
    // (2026-10-22, round 2, spec §12 N9) C7 also has a plate with only its centroid
    case 'body': return isPair(geometry.superior) || isPair(geometry.inferior) || (hasCentroid(code) && isPoint(geometry.centroid));
    case 'c2': return isPair(geometry.inferior) || isPoint(geometry.centroid);
    case 'endplate': return isPair(geometry.superior);
    case 'centroid': return isPoint(geometry.centroid);
    default: return false;
  }
}

/**
 * A plate's anchor, as before G7: a body's posterior-edge midpoint (SP and IP), C2's IP, an endplate's SP, T4's
 * centroid; (2026-10-22, the final review, M5) a one-endplate body anchors on that endplate's posterior corner (SP or
 * IP), and C2 without its pair on its centroid; null for a femoral head (no plate) or a geometry that is not what its kind says. A fresh point.
 * @returns {[number, number]|null}
 */
export function labelAnchor(code, geometry) {
  if (!hasPlateGeometry(code, geometry)) return null;
  switch (kindOf(code)) {
    case 'body':
      if (isPair(geometry.superior) && isPair(geometry.inferior)) return midpoint(geometry.superior[1], geometry.inferior[1]);
      if (!isPair(geometry.superior) && !isPair(geometry.inferior)) return copy(geometry.centroid);
      return copy((isPair(geometry.superior) ? geometry.superior : geometry.inferior)[1]);
    case 'c2': return isPair(geometry.inferior) ? copy(geometry.inferior[1]) : copy(geometry.centroid);
    case 'endplate': return copy(geometry.superior[1]);
    default: return copy(geometry.centroid);
  }
}

/**
 * Where a level's plate goes (R43): `{anchor, side}`, or null when the level has no plate (a femoral head, a bad
 * geometry). `side` is the direction the plate extends from the anchor, away from the level: for a body the sign of
 * (the posterior-edge midpoint x - the mean x of its four corners); for C2 the sign of (IP x - the centroid x); for an
 * endplate the sign of (SP x - SA x). When that difference is under 1 px, and always for T4's centroid, the film's
 * side decides: the plate goes opposite `anteriorSide` ('right' -> -1, 'left' -> +1), and +1 when it is unknown.
 *
 * @param {string} code a level code
 * @param {object|null} geometry the level's geometry (renderer/data/levels.js)
 * @param {'left'|'right'|null|undefined} anteriorSide the film's anterior side (plateAnteriorSide)
 * @returns {{anchor: [number, number], side: 1|-1}|null}
 */
export function labelPlacement(code, geometry, anteriorSide) {
  const anchor = labelAnchor(code, geometry);
  if (!anchor) return null;
  switch (kindOf(code)) {
    case 'body': {
      if (!isPair(geometry.superior) && !isPair(geometry.inferior)) return { anchor, side: filmSide(anteriorSide) };
      if (!(isPair(geometry.superior) && isPair(geometry.inferior))) {
        const pair = isPair(geometry.superior) ? geometry.superior : geometry.inferior;
        return { anchor, side: sideOf(pair[1][0] - pair[0][0], anteriorSide) };
      }
      const corners = [...geometry.superior, ...geometry.inferior];
      const meanX = corners.reduce((sum, point) => sum + point[0], 0) / corners.length;
      return { anchor, side: sideOf(anchor[0] - meanX, anteriorSide) };
    }
    case 'c2':
      if (!isPair(geometry.inferior)) return { anchor, side: filmSide(anteriorSide) };
      if (!isPoint(geometry.centroid)) return { anchor, side: sideOf(geometry.inferior[1][0] - geometry.inferior[0][0], anteriorSide) };
      return { anchor, side: sideOf(geometry.inferior[1][0] - geometry.centroid[0], anteriorSide) };
    case 'endplate': return { anchor, side: sideOf(geometry.superior[1][0] - geometry.superior[0][0], anteriorSide) };
    default: return { anchor, side: filmSide(anteriorSide) };
  }
}

/**
 * The film's anterior side for the plates' fallback, in projectGeometry's order (renderer/data/level-projection.js):
 * the stored geometry's side, then the study's chosen one (each only when 'left' or 'right'), then what the editor's
 * placed levels show (anteriorSideFrom); else null. A side is never guessed.
 * @returns {'left'|'right'|null}
 */
export function plateAnteriorSide(study, editor) {
  const stored = [study?.geometry?.anterior_side, study?.anteriorSide].find(validAnteriorSide);
  if (stored) return stored;
  return editor ? anteriorSideFrom(editor, null) : null;
}

/**
 * A level's plate offset from `state.platePositions`, as a fresh `[dx, dy]` in image pixels; `[0, 0]` when it has
 * none or the entry is not a pair of finite numbers.
 * @returns {[number, number]}
 */
export function plateOffset(positions, code) {
  const offset = positions?.[code];
  return Array.isArray(offset) && offset.length === 2 && offset.every(Number.isFinite) ? [offset[0], offset[1]] : [0, 0];
}

/**
 * The plate under an image point among `plates` (drawLevelEditor's return value, `{code, x, y, width, height}` in
 * image pixels), edges included, or null. The last one drawn is on top, so it wins where two overlap.
 */
export function plateAt(plates, point) {
  if (!Array.isArray(plates) || !isPoint(point)) return null;
  for (let index = plates.length - 1; index >= 0; index -= 1) {
    const plate = plates[index];
    if (point[0] >= plate.x && point[0] <= plate.x + plate.width && point[1] >= plate.y && point[1] <= plate.y + plate.height) {
      return plate;
    }
  }
  return null;
}

/**
 * `positions` with `code`'s plate moved, on a new object: its offset at the press (`start`) plus the pointer's travel
 * since, `from` (the image point at the press) to `to` (the image point now). The old map is not changed.
 */
export function movePlate(positions, code, start, from, to) {
  return { ...(positions ?? {}), [code]: [start[0] + to[0] - from[0], start[1] + to[1] - from[1]] };
}

/**
 * `positions` without `code`'s offset (a double-click on the plate puts it back), on a new object; the same map when it
 * had none, so nothing repaints for a reset that changes nothing.
 */
export function resetPlate(positions, code) {
  if (!positions || !Object.hasOwn(positions, code)) return positions;
  const { [code]: _reset, ...rest } = positions;
  return rest;
}
