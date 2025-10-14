// @ts-check

import { Path } from "../tools/path.js";

export const registry = [];

function validateArguments(...args) {
  for (const arg of args) {
    if (arg instanceof Path && !arg.isClosed())
      throw new Error("cannot make solid with open path");
  }
}

export class ShapeId {
  constructor(id) {
    this.id = id;
    this.type = "shapeid";
  }

  retreive() {
    return registry[this.id];
  }
}

/**
 * @param {DOMMatrix} placement
 * @param {number} length
 * @param {Path} outsidePath
 * @param {Path[]} insides
 * @returns {ShapeId}
 */
export function extrusion(placement, length, outsidePath, ...insides) {
  validateArguments(placement, length, outsidePath, ...insides);
  registry.push({
    type: "extrusion",
    placement,
    length,
    outsides: [outsidePath],
    insides: insides.map(p => p.rotatesClockwise() ? p.invert() : p),
  });
  return new ShapeId(registry.length - 1);
}

/**
 * @param {DOMMatrix} placement
 * @param {number} length
 * @param {Path[]} outsides
 * @returns {ShapeId}
 */
export function multiExtrusion(placement, length, ...outsides) {
  validateArguments(placement, length, ...outsides);
  const extrusions = []
  for (const path of outsides) extrusions.push(extrusion(placement, length, path));
  return fuse(...extrusions);
}

/**
 * @param {ShapeId[]} shapes
 * @returns {ShapeId}
 */
export function fuse(...shapes) {
  validateArguments(...shapes);
  registry.push({ type: "fuse", shapes });
  return new ShapeId(registry.length - 1);
}

/**
 * @param {ShapeId} shape
 * @param {ShapeId[]} cutouts
 * @returns {ShapeId}
 */
export function cut(shape, ...cutouts) {
  validateArguments(shape, ...cutouts);
  registry.push({ type: "cut", shape, cutouts });
  return new ShapeId(registry.length - 1);
}

/**
 * @param {ShapeId} shape
 */
export function retrieveOperations(shape) {
  const result = [];

  function inner(shape) {
    const item = { ...registry[shape.id] };

    for (const key in item) {
      const value = item[key];
      if (value?.type === "shapeid") {
        item[key] = inner(value);
        continue;
      }

      if (!Array.isArray(value) || !(value[0]?.type === "shapeid")) continue;

      item[key] = [...value];
      for (let i = 0; i < value.length; i++) {
        item[key][i] = inner(item[key][i]);
      }
    }
    result.push(item);
    return result.length - 1;
  }

  inner(shape);
  return result;
}

/**
 * @param {DOMMatrix} placement
 * @param {DOMMatrix} axis
 * @param {number} rotation
 * @param {Path} path
 * @returns {ShapeId}
 */
export function revolve(placement, axis, rotation, path) {
  validateArguments(placement, axis, rotation, path);
  registry.push({
    type: "revolve",
    placement,
    rotation,
    path,
    axis,
  });
  return new ShapeId(registry.length - 1);
}
