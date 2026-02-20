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
    insides: insides,
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
  const extrusions = [];
  for (const path of outsides)
    extrusions.push(extrusion(placement, length, path));
  return fuse(...extrusions);
}
/**
 * @typedef {{placement: DOMMatrix?; shape: ShapeId}} ShapeInstance
 */

/**
 * @param {(ShapeId | ShapeInstance)[]} shapes
 * @returns {ShapeId}
 */
export function fuse(...shapes) {
  validateArguments(...shapes);
  registry.push({
    type: "fuse",
    shapes: shapes.map((v) => (v instanceof ShapeId ? { shape: v } : v)),
  });
  return new ShapeId(registry.length - 1);
}

/**
 * @param {(ShapeId | ShapeInstance)[]} shapes
 * @returns {ShapeId}
 */
export function intersect(...shapes) {
  validateArguments(...shapes);
  registry.push({
    type: "intersect",
    shapes: shapes.map((v) => (v instanceof ShapeId ? { shape: v } : v)),
  });
  return new ShapeId(registry.length - 1);
}

/**
 * @param {ShapeId} shape
 * @param {(ShapeId | ShapeInstance)[]} cutouts
 * @returns {ShapeId}
 */
export function cut(shape, ...cutouts) {
  validateArguments(shape, ...cutouts);
  registry.push({
    type: "cut",
    shape,
    cutouts: cutouts.map((v) => (v instanceof ShapeId ? { shape: v } : v)),
  });
  return new ShapeId(registry.length - 1);
}

/**
 * @param {ShapeId} shape
 */
export function retrieveOperations(shape) {
  const result = [];

  const retrievedShapes = {};

  function walkObject(item) {
    for (const key in item) {
      const value = item[key];
      if (value?.type === "shapeid") {
        item[key] = inner(value);
        continue;
      }

      if (!Array.isArray(value)) continue;

      item[key] = [...value];
      for (let i = 0; i < value.length; i++) {
        if (value[i]?.type === "shapeid") {
          item[key][i] = inner(value[i]);
        } else if (Object.getPrototypeOf(value[i]) === Object.prototype) {
          item[key][i] = { ...value[i] };
          walkObject(item[key][i]);
        } else {
          walkObject(value[i]);
        }
      }
    }
  }

  function inner(shape) {
    if (shape.id in retrievedShapes) return retrievedShapes[shape.id];

    const item = { ...registry[shape.id] };
    walkObject(item);
    result.push(item);

    const ret = result.length - 1;
    retrievedShapes[shape.id] = ret;
    return ret;
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

/**
 * @param {DOMMatrix} placement
 * @param {Path} directrix
 * @param {Path} outsidePath
 * @param {Path[]} insides
 * @returns {ShapeId}
 */
export function sweep(placement, directrix, outsidePath, ...insides) {
  validateArguments(placement, outsidePath, ...insides);
  registry.push({
    type: "sweep",
    placement,
    directrix,
    outsides: [outsidePath],
    insides: insides.map((p) => (p.rotatesClockwise() ? p.invert() : p)),
  });
  return new ShapeId(registry.length - 1);
}
