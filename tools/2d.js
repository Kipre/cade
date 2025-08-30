// @ts-check
/** @import * as types from './types' */

const eps = 1e-5;

import { pairs } from "./iteration.js";
import { debugGeometry } from "./svg.js";

/**
 * @param {types.Point} p1
 * @param {types.Point} p2
 * @returns {types.Point}
 */
export function plus(p1, p2) {
  return [p1[0] + p2[0], p1[1] + p2[1]];
}

/**
 * @param {types.Point} p
 * @param {number} scalar
 * @returns {types.Point}
 */
export function mult(p, scalar) {
  return [p[0] * scalar, p[1] * scalar];
}

/**
 * @param {types.Point} p1
 * @param {types.Point} p2
 * @returns {types.Point}
 */
export function minus(p1, p2) {
  return [p1[0] - p2[0], p1[1] - p2[1]];
}

export function areOnSameLine(p1, p2, p3) {
  const u = minus(p1, p2);
  const v = minus(p1, p3);
  return Math.abs(u[1] * v[0] - v[1] * u[0]) < 1e-6;
}

/**
 * Rotates p2 around p1 by alpha radian
 *
 * @param {types.Point} p1
 * @param {types.Point} p2
 * @param {number} alpha
 * @returns {types.Point}
 */
export function rotatePoint([x0, y0], [x1, y1], alpha) {
  const [u, v] = [x1 - x0, y1 - y0];
  const [sinA, cosA] = [Math.sin(alpha), Math.cos(alpha)];
  return [u * cosA - v * sinA + x0, u * sinA + v * cosA + y0];
}

export function mirrorPoint(p, l1, l2) {
  if (norm(p, l1) < eps) return p;
  const mid = pointToLine(p, l1, l2);
  return rotatePoint(mid, p, Math.PI);
}

export function norm(p1, p2) {
  p2 ??= [0, 0];
  const [u, v] = minus(p2, p1);
  return Math.sqrt(u ** 2 + v ** 2);
}

export function degs(angle) {
  return (180 * angle) / Math.PI;
}

export function signedArea(poly) {
  let result = 0;
  const nbPoints = poly.length;
  for (let i = 0; i < nbPoints; i++) {
    const [p, n] = [i, (i + 1) % nbPoints];
    result += poly[p][0] * poly[n][1] - poly[p][1] * poly[n][0];
  }
  return result;
}

export function polygonArea(poly) {
  return Math.abs(signedArea(poly)) / 2;
}

export function polylinePerimeter(poly, closed = false) {
  let result = 0;
  const nbPoints = poly.length;
  for (let i = 0; i < nbPoints - (1 - closed); i++) {
    const [p, n] = [i, (i + 1) % nbPoints];
    result += norm(poly[p], poly[n]);
  }
  return result;
}

export function polygonCenter(poly) {
  return mult(
    poly.reduce((a, v) => plus(a, v)),
    1 / poly.length,
  );
}

export function normalizePolygon(poly) {
  const center = [0, 0];
  for (const p of poly) {
    center[0] += p[0];
    center[1] += p[1];
  }
  center[0] /= poly.length;
  center[1] /= poly.length;
  return poly.toSorted(
    (a, b) =>
      computeVectorAngle(minus(a, center)) -
      computeVectorAngle(minus(b, center)),
  );
}

/**
 * @param {types.Point[]} pts
 * @param {number} p
 * @returns {types.Point}
 */
export function getInterpolation([[x0, y0], [x1, y1]], p) {
  return [x0 * (1 - p) + x1 * p, y0 * (1 - p) + y1 * p];
}

/**
 * @param {types.Point} u
 * @param {types.Point} v
 * @returns {number}
 */
export function computeAngleBetween(u, v) {
  const a1 = computeVectorAngle(u);
  const a2 = computeVectorAngle(v);
  return a2 - a1;
}

/**
 * @param {types.Point} v
 * @returns {number}
 */
export function computeVectorAngle(v) {
  if (!norm([0, 0], v)) throw new TypeError();
  if (v[0] === 0) return (0.5 * Math.PI * v[1]) / Math.abs(v[1]);
  let angle = Math.atan(v[1] / v[0]);
  if (v[0] < 0) angle += Math.PI;
  else if (v[1] < 0) angle += 2 * Math.PI;
  return angle;
}

/**
 * @param {types.Point} p0
 * @param {types.Point} p1
 * @param {types.Point} l0
 * @param {types.Point} l1
 * @returns {types.Point | null}
 */
export function intersectLines(p0, p1, l0, l1) {
  let [u, v] = [p1[0] - p0[0], p1[1] - p0[1]];
  let [m, n] = [l1[0] - l0[0], l1[1] - l0[1]];
  if (u === 0 && m === 0) return null;
  if (m === 0) [u, v, m, n, p0, p1, l0, l1] = [m, n, u, v, l0, l1, p0, p1];

  const penteL = n / m;
  const biasL = l0[1] - penteL * l0[0];

  if (Math.abs(u) < eps) {
    return [p0[0], p0[0] * penteL + biasL];
  }

  const penteP = v / u;
  if (penteP === penteL) return null;

  const biasP = p0[1] - penteP * p0[0];
  const x = (biasL - biasP) / (penteP - penteL);
  const y = penteP * x + biasP;
  return [x, y];
}

/**
 * Checks if a point is within a bbox defined by two points.
 * Useful for determining if an intersection in in the relevant.
 *
 * @param {types.Point} p
 * @param {types.Point} l1
 * @param {types.Point} l2
 * @returns {boolean}
 */
export function pointInsideLineBbox(p, l1, l2) {
  const [minX1, maxX1, minY1, maxY1] = [
    Math.min(l1[0], l2[0]),
    Math.max(l1[0], l2[0]),
    Math.min(l1[1], l2[1]),
    Math.max(l1[1], l2[1]),
  ];
  return (
    minX1 <= p[0] + eps &&
    p[0] - eps <= maxX1 &&
    minY1 <= p[1] + eps &&
    p[1] - eps <= maxY1
  );
}

/**
 * @param {types.Point[]} poly1
 * @param {types.Point[]} poly2
 * @param {boolean} wrap
 * @returns {types.Point?}
 */
export function intersect(poly1, poly2, wrap = false) {
  for (const [a, b] of pairs(poly1, 0, wrap && poly1.length > 2)) {
    for (const [c, d] of pairs(poly2, 0, wrap && poly2.length > 2)) {
      const int = intersectLines(a, b, c, d);
      if (int == null) continue;
      if (pointInsideLineBbox(int, a, b) && pointInsideLineBbox(int, c, d))
        return int;
    }
  }
  console.error(poly1, poly2);
  throw new Error("no intersection");
}

export function moveLine(p, l1, l2) {
  return plus(p, minus(l2, l1));
}

export function pointToLine(p, l1, l2) {
  if (norm(p, l1) < eps || norm(p, l1) < eps) return p;
  const angle = computeAngleBetween(minus(l1, l2), minus(l1, p));
  const fraction = (norm(l1, p) * Math.cos(angle)) / norm(l1, l2);
  return placeAlong(l1, l2, { fraction });
}

/**
 * @param {types.Point} p1
 * @param {types.Point} p2
 * @param {{distance: number} | {fromStart: number} | {fromEnd: number} | {fraction: number}} param
 * @returns {types.Point}
 */
export function placeAlong(p1, p2, param) {
  let fraction = 0;
  const total = norm(p1, p2);
  if ("distance" in param && param.distance != null) {
    if (param.distance < 0) fraction = (total + param.distance) / total;
    else fraction = param.distance / total;
  } else if ("fromStart" in param && param.fromStart != null) {
    fraction = param.fromStart / total;
  } else if ("fromEnd" in param && param.fromEnd != null) {
    fraction = (total + param.fromEnd) / total;
  } else if ("fraction" in param) fraction = param.fraction;
  else throw new TypeError();

  return plus(mult(p1, 1 - fraction), mult(p2, fraction));
}

/**
 * @param {types.Point[]} polyline
 * @param {number | number[]} offset
 * @param {boolean} wraps
 * @returns {types.Point[]}
 */
export function offsetPolyline(polyline, offset, wraps = false) {
  function offsetSegment(t0, t1, offset) {
    const distance = Math.abs(offset);
    const folded = placeAlong(t0, t1, { distance });
    const p2 = rotatePoint(
      t0,
      folded,
      (offset * Math.PI) / 2 / (distance || 1),
    );
    return [p2, plus(minus(p2, t0), t1)];
  }

  const result = [];
  let p0, p1;

  const nbPoints = polyline.length;
  const nbSegments = nbPoints - 1 + wraps;

  const offsets = Array.isArray(offset)
    ? [...offset]
    : Array.from({ length: nbSegments }, () => offset);

  if (offsets.length < nbSegments) throw new Error("missing offsets in array");

  for (let i = 1; i < nbPoints; i++) {
    const [p2, p3] = offsetSegment(
      polyline[i - 1],
      polyline[i],
      offsets[i - 1],
    );

    if (p1) result.push(intersectLines(p0, p1, p2, p3));
    else result.push(p2);

    p0 = p2;
    p1 = p3;
  }

  result.push(p1);

  if (wraps) {
    const [p2, p3] = offsetSegment(
      polyline.at(-1),
      polyline[0],
      offsets.at(-1),
    );
    result[0] = intersectLines(p2, p3, result[0], result[1]);
    result[nbPoints - 1] = intersectLines(p2, p3, p0, p1);
  }

  return result;
}

/**
 * @param {types.Point[]} poly
 * @param {number | number[]} offset
 */
export function inflatePolyline(poly, offset) {
  return [...poly, ...offsetPolyline(poly, offset).toReversed()];
}

/**
 * @param {types.Point} p
 * @param {types.Point} l1
 * @param {types.Point} l2
 * @returns {boolean}
 */
export function isToTheLeft(p, l1, l2) {
  const u = minus(l2, l1);
  const v = minus(p, l1);
  return (u[0] * v[1] - u[1] * v[0]) > 0; 
}

/**
 * @param {types.Point} p
 * @param {types.Point} l1
 * @param {types.Point} l2
 * @returns {number}
 */
export function pointCoordinateOnLine(p, l1, l2) {
  const length = norm(l1, l2);
  const fromStart = norm(l1, p);
  const fromEnd = norm(l2, p);

  const direction = fromStart < fromEnd && fromEnd > length ? -1 : 1;
  return (direction * fromStart) / length;
}
