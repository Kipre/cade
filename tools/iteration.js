// @ts-check
/** @import * as types from './types' */

/**
 * @template T
 * @param {T[]} array
 * @returns {Generator<[T, T, number]>}
 */
export function* pairs(array, offset = 0, wrap = true) {
  const len = array.length;
  for (let i = 0; i < len - (1 - wrap); i++) {
    yield [array[(offset + i) % len], array[(offset + i + 1) % len], i];
  }
}

export function getSegment(array, index) {
  if (index > array.length - 1 || index < 0)
    throw new Error("index out of bounds");
  return [array[index], array[(index + 1) % array.length]];
}

export function normalizedPosition(length, position) {
  return (length + position) % length;
}
