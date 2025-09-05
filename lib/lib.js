// @ts-check
import { displayScene } from "../display/main.js";

/** @typedef {{child: Part, placement: DOMMatrix}} LocatedPart */

export class Part {
  constructor(name) {
    this.name = name;
    this.mesh = null;
  }

  async loadMesh() {}
  geometries() {}
}

export class Assembly extends Part {
  /** @type {LocatedPart[]} */
  children = [];

  addChild(child, placement) {
    this.children.push({ child, placement });
  }

  async loadMesh() {
    const result = [];
    for (const { child } of this.children) {
      result.push(child.loadMesh());
    }
    await Promise.all(result);
  }

  geometries() {
    const result = {};
    for (const { child, placement } of this.children) {
      const geoms = child.geometries();
      mergeGeometries(result, geoms, placement);
    }
    return result;
  }
}

function mergeGeometries(acc, other, placement) {
  for (const [key, { obj, instances }] of Object.entries(other)) {
    if (!(key in acc)) acc[key] = { obj, instances: [] };
    acc[key].instances.push(...instances.map((mat) => mat.multiply(placement)));
  }
}

export class Model extends Assembly {
  async watch() {
    const geometries = this.geometries();
    await displayScene(Object.values(geometries));
  }

  toJson() {}
}
