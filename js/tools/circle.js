// @ts-check
/** @import * as types from './types' */

import { mult, norm, placeAlong, plus, rotatePoint } from "./2d.js";

/**
 * @param {types.Point} p1
 * @param {types.Point} p2
 * @param {number} radius
 * @param {number} sweep
 */
export function getCircleCenter(p1, p2, radius, sweep) {
  const half = mult(plus(p1, p2), 1 / 2);
  const pToHalf = norm(p1, half);
  const halfToCenter = Math.sqrt(radius ** 2 - pToHalf ** 2);
  const center = placeAlong(half, rotatePoint(half, p2, Math.PI / 2), {
    fromStart: halfToCenter,
  });
  if (sweep) return center;
  return rotatePoint(half, center, Math.PI);
}
