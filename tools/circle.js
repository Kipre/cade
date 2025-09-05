// @ts-check
/** @import * as types from './types' */

import { minus, mult, norm, placeAlong, plus, rotatePoint } from "./2d.js";
import { Path } from "./path.js";
import { debugGeometry } from "./svg.js";
import { modulo } from "./utils.js";

const eps = 1e-5;

/**
 * @param {number} a
 * @returns {number}
 */
export function normalizeAngle(a) {
  return modulo(a + Math.PI, 2 * Math.PI) - Math.PI;
}

/**
 * @param {types.Point} p1
 * @param {types.Point} p2
 * @param {number} radius
 * @param {number} sweep
 */
export function getCircleCenter(p1, p2, radius, sweep) {
  if (norm(p1, p2) > eps + 2 * radius) {
    console.error(p1, p2, radius, sweep);
    throw new Error("this arc does not exist");
  }

  const half = mult(plus(p1, p2), 1 / 2);
  const pToHalf = norm(p1, half);
  const halfToCenter = Math.sqrt(radius ** 2 - pToHalf ** 2);
  const center = placeAlong(half, rotatePoint(half, p2, Math.PI / 2), {
    fromStart: halfToCenter,
  });
  if (sweep) return center;
  return rotatePoint(half, center, Math.PI);
}

/**
 * @param {types.Point} p1
 * @param {types.Point} p2
 * @param {types.Point} start
 * @param {types.Point} end
 * @param {number} radius
 * @param {number} sweep
 * @param {boolean} softSelection
 * @returns {types.Point}
 */
export function intersectLineAndArc(
  p1,
  p2,
  start,
  end,
  radius,
  sweep,
  softSelection = false,
) {
  const center = getCircleCenter(start, end, radius, sweep);
  const roots = intersectLineAndCircle(p1, p2, center, radius);
  if (roots.length === 1) return roots[0];

  if (softSelection) {
    const middle = evaluateArc(0.5, start, end, radius, sweep);
    return norm(middle, roots[0]) < norm(middle, roots[1])
      ? roots[0]
      : roots[1];
  }

  for (const root of roots)
    if (isInPieSlice(root, start, end, radius, sweep)) return root;

  // debugGeometry([start, end], [p1, p2], Path.makeCircle(radius).translate(center));
  throw new Error("failed");
}

/**
 * @param {types.Point} p1
 * @param {types.Point} p2
 * @param {types.Point} center
 * @param {number} radius
 * @returns {types.Point[]}
 */
export function intersectLineAndCircle(p1, p2, center, radius) {
  const eps = 1e-4;

  const l1 = minus(p1, center);
  const l2 = minus(p2, center);
  const [dx, dy] = minus(l2, l1);
  const dr = norm([dx, dy]);
  const D = l1[0] * l2[1] - l2[0] * l1[1];

  let delta = radius ** 2 * dr ** 2 - D ** 2;
  // delta might be close to zero but negative
  if (delta < 0 && -eps < delta) delta = 0;

  const sgn = dy > 0 ? 1 : -1;
  const roots = [];
  if (Math.abs(delta) < eps || delta > 0) {
    const ix = (D * dy + sgn * dx * Math.sqrt(delta)) / dr ** 2;
    const iy = (-D * dx + Math.abs(dy) * Math.sqrt(delta)) / dr ** 2;
    roots.push(plus([ix, iy], center));
  }
  if (delta > 0) {
    const ix = (D * dy - sgn * dx * Math.sqrt(delta)) / dr ** 2;
    const iy = (-D * dx - Math.abs(dy) * Math.sqrt(delta)) / dr ** 2;
    roots.push(plus([ix, iy], center));
  }
  return roots;
}

/**
 * @param {types.Point} center
 * @param {number} radius
 * @param {types.Point} center2
 * @param {number} radius2
 * @returns {types.Point[]}
 */
export function intersectTwoCircles(center, radius, center2, radius2) {
  const roots = [];
  const d = norm(center, center2);

  if (d < eps) return [];

  const radical = (d ** 2 - radius2 ** 2 + radius ** 2) / (2 * d);

  const halfChord = Math.sqrt(radius ** 2 - radical ** 2);

  const inter = placeAlong(center, center2, { fromStart: radical });
  const preTurn = placeAlong(center, inter, { fromEnd: halfChord });
  const root = rotatePoint(inter, preTurn, Math.PI / 2);
  roots.push(root);

  if (halfChord > eps) {
    roots.push(rotatePoint(inter, preTurn, -Math.PI / 2));
  }
  return roots;
}

/**
 * @param {types.Point} start1
 * @param {types.Point} end1
 * @param {number} r1
 * @param {number} s1
 * @param {types.Point} start2
 * @param {types.Point} end2
 * @param {number} r2
 * @param {number} s2
 * @returns {types.Point}
 */
export function intersectTwoArcs(start1, end1, r1, s1, start2, end2, r2, s2) {
  const center1 = getCircleCenter(start1, end1, r1, s1);
  const center2 = getCircleCenter(start2, end2, r2, s2);
  const roots = intersectLineAndCircle(center1, r1, center2, r2);
  for (const root of roots)
    if (
      isInPieSlice(root, start1, end1, r1, s1) &&
      isInPieSlice(root, start2, end2, r2, s2)
    )
      return root;
  throw new Error("failed");
}

/**
 * @param {types.Point} p
 * @param {types.Point} start
 * @param {types.Point} end
 * @param {number} radius
 * @param {number} sweep
 * @returns {boolean}
 */
export function isInPieSlice(p, start, end, radius, sweep) {
  const x = pointCoordinateOnArc(p, start, end, radius, sweep);
  return 0 <= x && x <= 1;
}

/**
 * @param {types.Point} p
 * @param {types.Point} start
 * @param {types.Point} end
 * @param {number} radius
 * @param {number} sweep
 * @returns {number}
 */
export function pointCoordinateOnArc(p, start, end, radius, sweep) {
  const center = getCircleCenter(start, end, radius, sweep);

  const startAngle = Math.atan2(...minus(start, center));

  let angle = normalizeAngle(Math.atan2(...minus(p, center)) - startAngle);
  let endAngle = normalizeAngle(Math.atan2(...minus(end, center)) - startAngle);

  // will need some adjustment when long arcs will be possible
  if (Math.abs(endAngle + Math.PI) < eps && sweep === 0) endAngle = Math.PI;

  if (endAngle < 0) {
    endAngle *= -1;
    angle *= -1;
  }

  return angle / endAngle;
}

export function getArcAngularLength(start, end, radius, sweep) {
  const center = getCircleCenter(start, end, radius, sweep);
  const startAngle = Math.atan2(...minus(start, center).toReversed());
  const endAngle = Math.atan2(...minus(end, center).toReversed());
  return (sweep ? 1 : -1) * Math.abs(normalizeAngle(endAngle - startAngle));
}

/**
 * TODO
 *
 * @param {number} x
 * @param {types.Point} start
 * @param {types.Point} end
 * @param {number} radius
 * @param {number} sweep
 * @returns {types.Point}
 */
export function evaluateArc(x, start, end, radius, sweep) {
  // const path = document.createElementNS(w3svg, "path");
  // path.setAttribute("d", `M ${start} A ${radius} ${radius} 0 0 ${sweep} ${end.join(" ")}`);
  // const total = path.getTotalLength();
  // const point = path.getPointAtLength(total * x);
  // return [point.x, point.y];

  const center = getCircleCenter(start, end, radius, sweep);
  const opening = getArcAngularLength(start, end, radius, sweep);

  return rotatePoint(center, start, opening * x);
}

/**
 * @param {number} x
 * @param {types.Point} start
 * @param {types.Point} end
 * @param {number} radius
 * @param {number} sweep
 * @returns {[types.Point, types.Point]}
 */
export function arcTangentAt(x, start, end, radius, sweep) {
  const point = evaluateArc(x, start, end, radius, sweep);
  const center = getCircleCenter(start, end, radius, sweep);
  const t2 = rotatePoint(point, center, ((1 - 2 * sweep) * Math.PI) / 2);
  const t1 = rotatePoint(point, center, ((2 * sweep - 1) * Math.PI) / 2);
  return [t1, t2];
}

/**
 * @param {types.Point} from1
 * @param {types.Point} to1
 * @param {number} r1
 * @param {number} s1
 * @param {types.Point} from2
 * @param {types.Point} to2
 * @param {number} r2
 * @param {number} s2
 */
export function areOnSameCircle(from1, to1, r1, s1, from2, to2, r2, s2) {
  if (Math.abs(r1 - r2) > eps) return false;
  const center1 = getCircleCenter(from1, to1, r1, s1);
  const center2 = getCircleCenter(from2, to2, r2, s2);

  return norm(center1, center2) < eps;
}
