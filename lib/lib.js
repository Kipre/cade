// @ts-check
import { displayScene } from "../display/main.js";

/** @typedef {{child: BasePart, placement: DOMMatrix}} LocatedPart */

export class BasePart {
  constructor(name) {
    this.name = name;
    this.mesh = null;
    this._id = Math.random().toString().slice(2);
  }

  async loadMesh() { }
  flatInstances() { }
}

export class Assembly extends BasePart {
  /** @type {LocatedPart[]} */
  children = [];

  addChild(child, placement) {
    const located = { child, placement };
    this.children.push(located);
    return located;
  }

  async loadMesh() {
    const flat = this.flatInstances();
    const result = [];
    for (const { item } of Object.values(flat)) {
      result.push(item.loadMesh());
    }
    await Promise.all(result);
  }

  flatInstances() {
    const result = {};
    for (const { child, placement } of this.children) {
      const geoms = child.flatInstances();
      const mat = placement ?? new DOMMatrix();
      mergeGeometries(result, geoms, mat);
    }
    return result;
  }

  async watch() {
    const flat = this.flatInstances();
    const geometries = Object.values(flat).map(({ item, instances }) => ({
      obj: item.mesh,
      instances,
    }));
    await displayScene(geometries);
  }

  /**
   * @param {BasePart} part
   * @returns {LocatedPart}
   */
  findChild(part) {
    const located = this.children.find(({ child }) => child === part);
    if (located != null) return located;

    for (const { child, placement } of this.children) {
      const mat = placement ?? new DOMMatrix();
      let result;
      try {
        result = child.findChild?.(part);
      } catch { }
      if (result != null)
        return {
          child: result.child,
          placement: mat.multiply(result.placement),
        };
    }

    throw new Error("coundn't find child");
  }
}

function mergeGeometries(acc, other, placement) {
  for (const [key, { item, instances }] of Object.entries(other)) {
    if (!(key in acc)) acc[key] = { item, instances: [] };
    acc[key].instances.push(...instances.map((mat) => placement.multiply(mat)));
  }
}

export class Model extends Assembly {
  async export(file) {
    const flat = this.flatInstances();
    const compact = Object.values(flat).map(({ item, instances }) => ({
      part: item.toJson(),
      instances: instances.map((m) => [...m.toFloat32Array()]),
    }));

    const body = JSON.stringify({ geometries: compact });
    await fetch(`/occ/export?file=${encodeURI(file)}`, {
      method: "POST",
      body,
    });
  }
}
