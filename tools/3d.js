// @ts-check
/** @import * as types from './types' */

/**
 * @param {types.Point3} v
 * @returns {types.Point3}
 */
export function normalize3(v) {
  const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * @param {types.Point3} a
 * @param {types.Point3} b
 * @returns {types.Point3}
 */
export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * @param {types.Point3} p1
 * @param {types.Point3} p2
 * @returns {types.Point3}
 */
export function minus3(p1, p2) {
  return [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
}

/**
 * @param {types.Point3} p1
 * @param {types.Point3} p2
 * @returns {types.Point3}
 */
export function plus3(p1, p2) {
  return [p1[0] + p2[0], p1[1] + p2[1], p1[2] + p2[2]];
}

/**
 * @param {types.Point3} p
 * @param {number} x
 * @returns {types.Point3}
 */
export function mult3(p, x) {
  return [p[0] * x, p[1] * x, p[2] * x];
}

/**
 * @param {types.Point3} p1
 * @param {types.Point3} p2
 * @returns {number}
 */
export function dot3(p1, p2) {
  return p1[0] * p2[0] + p1[1] * p2[1] + (p1[2] ?? 0) * (p2[2] ?? 0);
}

/**
 * @param {types.Point3} p1
 * @param {types.Point3?} p2
 * @returns {number}
 */
export function norm3(p1, p2 = null) {
  p2 ??= [0, 0, 0];
  const p = minus3(p1, p2);
  return Math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2);
}

/**
 * @param {types.Point3} p
 * @returns {types.Point}
 */
export function proj2d(p) {
  return [p[0], p[1]];
}

/**
 * @param {types.Point3} p1
 * @param {types.Point3} p2
 * @returns {types.Point3}
 */
export function placeAlong3(p1, p2, param) {
  let fraction = 0;
  const total = norm3(minus3(p1, p2));
  if ("distance" in param && param.distance != null) {
    if (param.distance < 0) fraction = (total + param.distance) / total;
    else fraction = param.distance / total;
  } else if ("fromStart" in param && param.fromStart != null) {
    fraction = param.fromStart / total;
  } else if ("fromEnd" in param && param.fromEnd != null) {
    fraction = (total + param.fromEnd) / total;
  } else if ("fraction" in param) fraction = param.fraction;
  else throw new TypeError();

  return plus3(mult3(p1, 1 - fraction), mult3(p2, fraction));
}

/**
 * @param {types.Point3} p
 * @param {types.Point3} origin
 * @param {types.Point3} anyNormal
 * @returns {types.Point3}
 */
export function projectToPlane(p, origin, anyNormal) {
  const normal = normalize3(anyNormal);

  const toOrigin = minus3(origin, p);
  const distanceFromPlane = dot3(normal, toOrigin);
  return plus3(p, mult3(normal, distanceFromPlane));
}
