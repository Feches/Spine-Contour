// The model's mask outline per level, for the label record's `contour` (handoff §9; plan 2026-10-10 Task 12).
//
// The backend's `mask_png` holds one label id per pixel (L1 = 20 ... L5 = 24); the viewer decodes it to an RGBA
// buffer whose red channel is that id. `traceLabel` walks the outer boundary of one label's largest piece, `simplify`
// thins that staircase to a handful of vertices, and `levelContours` does both for every level the record may carry
// a contour for. Pure: no DOM, no store, and nothing here changes its inputs.
//
// Points are [x, y] in PIXEL-CORNER coordinates of the stored image: pixel (x, y) covers [x, x+1] x [y, y+1], so an
// outline ranges over 0..width and 0..height. (The record's other points are pixel positions; the contour is the
// edge of the mask, which lies between pixels.)

import { LEVEL_CODES, kindOf, levelState } from './levels.js';

// Headings, in the order a right turn steps through them: east, south, west, north (x right, y down).
const STEP_X = [1, 0, -1, 0];
const STEP_Y = [0, 1, 0, -1];

// Flood the 4-connected run of `labelId` pixels that holds `seed`, marking `visited`; returns its pixel count.
// An explicit stack, so a vertebra a few hundred thousand pixels large cannot overflow the call stack. A pixel is
// marked when it is pushed, so the stack never holds more than the component.
function fill(maskPixels, width, height, labelId, seed, visited) {
  const stack = [seed];
  visited[seed] = 1;
  let count = 0;
  const visit = (index) => {
    if (visited[index] === 0 && maskPixels[index * 4] === labelId) {
      visited[index] = 1;
      stack.push(index);
    }
  };
  while (stack.length > 0) {
    const index = stack.pop();
    count += 1;
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) visit(index - 1);
    if (x < width - 1) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y < height - 1) visit(index + width);
  }
  return count;
}

/**
 * The outer boundary of the largest 4-connected component of the pixels whose red channel equals `labelId`, as a
 * closed polygon in pixel-corner coordinates, clockwise on screen, starting at the component's top-left corner and
 * keeping only the corners where the outline turns (the first point is not repeated at the end). Holes are ignored.
 * A component that touches itself only at a corner is outlined once, around its outside. Null when the largest
 * component has fewer than 3 pixels or there is none. `maskPixels` is an RGBA buffer `width * height * 4` long.
 * @returns {Array<[number, number]>|null}
 */
export function traceLabel(maskPixels, width, height, labelId) {
  const visited = new Uint8Array(width * height);
  let seed = -1;
  let size = 0;
  // A raster scan meets a component first at its top-most, left-most pixel, so the winning seed is the walk's start.
  for (let index = 0; index < visited.length; index += 1) {
    if (visited[index] === 0 && maskPixels[index * 4] === labelId) {
      const count = fill(maskPixels, width, height, labelId, index, visited);
      if (count > size) {
        size = count;
        seed = index;
      }
    }
  }
  if (size < 3) return null;

  // Mark the winner alone: the same buffer, cleared and filled again from its seed.
  visited.fill(0);
  fill(maskPixels, width, height, labelId, seed, visited);
  const member = (x, y) => x >= 0 && y >= 0 && x < width && y < height && visited[y * width + x] === 1;

  // The directed boundary edge leaving corner (x, y) toward `heading`, with the component on its right-hand side:
  // the component pixel there is a member, the pixel across the edge is not.
  const hasEdge = (x, y, heading) => {
    switch (heading) {
      case 0: return member(x, y) && !member(x, y - 1);
      case 1: return member(x - 1, y) && !member(x, y);
      case 2: return member(x - 1, y - 1) && !member(x - 1, y);
      default: return member(x, y - 1) && !member(x - 1, y - 1);
    }
  };

  const startX = seed % width;
  const startY = (seed - startX) / width;
  const points = [];
  let x = startX;
  let y = startY;
  // Arriving at the start corner up the seed pixel's left edge; the first choice below is the turn east along its top.
  let heading = 3;
  do {
    // Right turn first, then straight, then left. Where two diagonal pixels meet at a corner, the right turn keeps
    // to the pixel the walk is on, so a 4-connected component is never joined to a piece it does not touch.
    // Every corner has at least one such edge, and the walk is a permutation of the boundary edges, so it returns
    // to the start.
    const next = [(heading + 1) % 4, heading, (heading + 3) % 4].find((candidate) => hasEdge(x, y, candidate));
    if (next !== heading) points.push([x, y]);
    heading = next;
    x += STEP_X[heading];
    y += STEP_Y[heading];
  } while (x !== startX || y !== startY);
  return points;
}

// Distance from `point` to the line through `a` and `b` (to the point `a` when they coincide).
function chordDistance(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  return Math.abs(dx * (point[1] - a[1]) - dy * (point[0] - a[0])) / length;
}

/**
 * Douglas-Peucker thinning of a closed polygon: it is split at its two farthest-apart points, each of the two open
 * chains is simplified to `tolerance` pixels, and the kept points are rejoined in their original order. A polygon of
 * fewer than 4 points comes back unchanged; a longer one never loses its third vertex (a sliver thinner than the
 * tolerance keeps the point farthest from its chord). The input is not changed and the result shares nothing with it.
 * @param {Array<[number, number]>} points
 * @param {number} [tolerance]
 * @returns {Array<[number, number]>}
 */
export function simplify(points, tolerance = 1.5) {
  const n = points.length;
  if (n < 4) return points;

  let a = 0;
  let b = 1;
  let farthest = -1;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const squared = (points[i][0] - points[j][0]) ** 2 + (points[i][1] - points[j][1]) ** 2;
      if (squared > farthest) {
        farthest = squared;
        a = i;
        b = j;
      }
    }
  }

  const keep = new Uint8Array(n);
  keep[a] = 1;
  keep[b] = 1;
  // Chain one runs a..b; chain two runs b..a around the end of the array (indices past n wrap).
  const ranges = [[a, b], [b, a + n]];
  while (ranges.length > 0) {
    const [low, high] = ranges.pop();
    let worst = -1;
    let at = -1;
    for (let k = low + 1; k < high; k += 1) {
      const distance = chordDistance(points[k % n], points[low % n], points[high % n]);
      if (distance > worst) {
        worst = distance;
        at = k;
      }
    }
    if (at >= 0 && worst > tolerance) {
      keep[at % n] = 1;
      ranges.push([low, at], [at, high]);
    }
  }

  // Two points are a line, not an outline: add back the one farthest from their chord.
  if (keep.reduce((sum, flag) => sum + flag, 0) < 3) {
    let worst = -1;
    let at = -1;
    for (let k = 0; k < n; k += 1) {
      if (keep[k] === 1) continue;
      const distance = chordDistance(points[k], points[a], points[b]);
      if (distance > worst) {
        worst = distance;
        at = k;
      }
    }
    keep[at] = 1;
  }
  return points.filter((_, index) => keep[index] === 1).map((point) => [point[0], point[1]]);
}

/**
 * The record's `contour` for every level code: the simplified outline of the model's mask for a body level whose
 * state is `segmented` (ruling R10: an edited or manual level no longer is the model's, so it has none), null for
 * every other code, for a level with no label id or no pixels of it, and for all codes when the mask or the label
 * map is missing. `labels` is the prediction's `{ L1: 20, ... }` map; `editor` is the level editor state.
 * @returns {Object<string, Array<[number, number]>|null>}
 */
export function levelContours(maskPixels, width, height, labels, editor) {
  const contours = Object.fromEntries(LEVEL_CODES.map((code) => [code, null]));
  if (!maskPixels || !labels) return contours;
  for (const code of LEVEL_CODES) {
    const labelId = labels[code];
    if (kindOf(code) !== 'body' || typeof labelId !== 'number') continue;
    if (levelState(editor.levels[code], editor.model[code]) !== 'segmented') continue;
    const outline = traceLabel(maskPixels, width, height, labelId);
    if (outline) contours[code] = simplify(outline, 1.5);
  }
  return contours;
}
