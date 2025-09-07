// @ts-check
import { displayScene } from "../display/main.js";

/** @typedef {{child: Part, placement: DOMMatrix}} LocatedPart */

export class Part {
  constructor(name) {
    this.name = name;
    this.mesh = null;
  }

  async loadMesh() { }
  flatInstances() { }
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

  flatInstances() {
    const result = {};
    for (const { child, placement } of this.children) {
      const geoms = child.flatInstances();
      mergeGeometries(result, geoms, placement);
    }
    return result;
  }
}

function mergeGeometries(acc, other, placement) {
  for (const [key, { item, instances }] of Object.entries(other)) {
    if (!(key in acc)) acc[key] = { item, instances: [] };
    acc[key].instances.push(...instances.map((mat) => mat.multiply(placement)));
  }
}

export class Model extends Assembly {
  async watch() {
    const flat = this.flatInstances();
    const geometries = Object.values(flat).map(({ item, instances }) => ({
      obj: item.mesh,
      instances,
    }));
    console.log(geometries);
    await displayScene(geometries);
  }

  async export(file) {
    const flat = this.flatInstances();
    const compact = Object.values(flat).map(({ item, instances }) => ({
      part: item.toJson(),
      instances: instances.map(m => [...m.toFloat32Array()]),
    }));

    const body = JSON.stringify({geometries: compact});
    await fetch(`/occ/export?file=${encodeURI(file)}`, { method: "POST", body });
  }
}
