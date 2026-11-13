/** @import * as types from './types' */

/**
 * @param {number} a
 * @param {number} m
 * @returns {number}
 */
export function modulo(a, m) {
  return ((a % m) + m) % m;
}

/**
 * @template T
 * @param {(x: T) => number} func
 * returns {(a: T, b: T) => number} func
 */
export function keyToComparison(func) {
  return (/** @type {T} */ a, /** @type {T} */ b) => func(a) - func(b);
}

export const keyToComparison2d = (func) => (a, b) => {
  const va = func(a);
  const vb = func(b);
  return va[0] !== vb[0] ? va[0] - vb[0] : va[1] - vb[1];
};
