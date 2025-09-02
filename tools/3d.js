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
