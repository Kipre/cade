// @ts-check
/** @import * as types from './types' */

/**
 * @param {number} a
 * @param {number} m
 * @returns {number}
 */
export function modulo(a, m) {
  return ((a % m) + m) % m;
}

export function keyToComparison(func) {
  return (a, b) => func(a) - func(b);
}
