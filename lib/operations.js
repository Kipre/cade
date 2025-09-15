export const registry = [];

export class ShapeId {
  constructor(id) {
    this.id = id;
    this.type = "shapeid";
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
  registry.push({
    type: "extrusion",
    placement,
    length,
    outside: outsidePath,
    insides,
  });
  return new ShapeId(registry.length - 1);
}

/**
 * @param {ShapeId[]} shapes
 * @returns {ShapeId}
 */
export function fuse(...shapes) {
  registry.push({ type: "fuse", shapes });
  return new ShapeId(registry.length - 1);
}

/**
 * @param {ShapeId} shape
 * @param {ShapeId[]} cutouts
 * @returns {ShapeId}
 */
export function cut(shape, ...cutouts) {
  registry.push({ type: "cut", shape, cutouts });
  return new ShapeId(registry.length - 1);
}

/**
 * @param {ShapeId} shape
 */
export function retrieveOperations(shape) {
  const result = [];

  function inner(shape) {
    const item = {...registry[shape.id]};

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
