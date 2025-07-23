// @ts-check
/** @import * as types from './types' */

import {
  computeVectorAngle,
  isToTheLeft,
  minus,
  mult,
  norm,
  placeAlong,
  plus,
  rotatePoint,
} from "./2d.js";
import { debugGeometry, w3svg } from "./svg.js";

const eps = 1e-5;

/**
 * @param {types.Point} p1
 * @param {types.Point} p2
 * @param {number} radius
 * @param {number} sweep
 */
export function getCircleCenter(p1, p2, radius, sweep) {
  if (norm(p1, p2) > 2 * radius) {
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
 * @param {types.Point} center
 * @param {number} radius
 * @returns {types.Point[]}
 */
export function intersectLineAndCircle(p1, p2, center, radius) {
  const l1 = minus(p1, center);
  const l2 = minus(p2, center);
  const [dx, dy] = minus(l2, l1);
  const dr = norm([dx, dy]);
  const D = l1[0] * l2[1] - l2[0] * l1[1];

  const delta = radius ** 2 * dr ** 2 - D ** 2;

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
 * @param {types.Point} p
 * @param {types.Point} start
 * @param {types.Point} end
 * @param {number} radius
 * @param {number} sweep
 * @returns {boolean}
 */
export function isInPieSlice(p, start, end, radius, sweep) {
  const x = pointCoordinateOnArc(p, start, end, radius, sweep);
  return 0 < x && x < 1;
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
  const modulo = (a, m) => ((a % m) + m) % m;
  const normalize = (a) => modulo(a + Math.PI, 2 * Math.PI) - Math.PI;

  const center = getCircleCenter(start, end, radius, sweep);

  const startAngle = Math.atan2(...minus(start, center));

  let angle = normalize(Math.atan2(...minus(p, center)) - startAngle);
  let endAngle = normalize(Math.atan2(...minus(end, center)) - startAngle);

  // will need some adjustment when long arcs will be possible
  if (Math.abs(endAngle + Math.PI) < eps && sweep === 0) endAngle = Math.PI;

  if (endAngle < 0) {
    endAngle *= -1;
    angle *= -1;
  }

  return angle / endAngle;
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
  const path = document.createElementNS(w3svg, "path");
  path.setAttribute("d", `M ${start} A ${radius} ${radius} 0 0 ${sweep} ${end.join(" ")}`);
  const total = path.getTotalLength();
  const point = path.getPointAtLength(total * x);
  return [point.x, point.y];
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
  const t2 = rotatePoint(point, center, (1 - 2 * sweep) * Math.PI / 2);
  const t1 = rotatePoint(point, center, (2 * sweep - 1) * Math.PI / 2);
  return [t1, t2]
}
