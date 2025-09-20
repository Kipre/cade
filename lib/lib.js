// @ts-check
/** @import * as lib from './lib' */
/** @import * as types from '../tools/types' */

import { displayScene } from "../display/main.js";
import { transformPoint3 } from "../tools/transform.js";
import { zero3 } from "./defaults.js";
import { matrixAwareReplacer } from "./json.js";
import { defaultMaterial } from "./materials.js";

/** @typedef {{child: BasePart, placement: DOMMatrix}} LocatedPart */

export class BasePart {
  constructor(name) {
    this.name = name;
    this.mesh = null;
    this.material = defaultMaterial;
    this._id = Math.random().toString().slice(2);
    /** @type {types.Point3} */
    this.symmetries = [NaN, NaN, NaN];
  }

  async loadMesh() { }
  flatInstances() { }
}

export class Assembly extends BasePart {
  /** @type {LocatedPart[]} */
  children = [];

  addChild(child, placement) {
    const located = { child };
    if (placement) located.placement = placement;
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

  mirror(normal = [0, 0, 1]) {
    const result = new Assembly(`mirrored ${this.name}`);
    for (const { child, placement: m } of this.children) {
      const placement = m ?? new DOMMatrix();
      const zero = transformPoint3(placement, zero3);
      const up = transformPoint3(placement.inverse(), normal, true);

      const upAxis = up.findIndex((x) => x !== 0);
      const others = [0, 1, 2].filter((x) => x !== upAxis);
      const sym = [upAxis, ...others].map((i) => child.symmetries[i]);

      let mirroredPlacement;
      if (!Object.is(NaN, sym[0])) {
        mirroredPlacement = new DOMMatrix()
          .translate(0, 0, -2 * (zero[2] + sym[0]))
          .multiply(placement);
      } else if (!Object.is(NaN, sym[1])) {
        mirroredPlacement = new DOMMatrix()
          .translate(zero[0], zero[1] + sym[1])
          // bug here ?
          .rotate(180, 0, 0)
          .translate(-zero[0], -zero[1] - sym[1])
          .multiply(placement);
      } else if (!Object.is(NaN, sym[2])) {
        mirroredPlacement = new DOMMatrix()
          .translate(zero[0], zero[1] + sym[2])
          .rotate(180, 0, 0)
          .translate(-zero[0], -zero[1] - sym[2])
          .multiply(placement);
      } else {
        console.error(`cannot mirror part (${child.name}) with no symmetries`);
        continue;
      }

      result.addChild(child, mirroredPlacement);
    }
    return result;
  }

  async watch() {
    const flat = this.flatInstances();
    const geometries = Object.values(flat);
    await displayScene(geometries);
  }

  /**
   * @param {BasePart} part
   * @returns {LocatedPart[]}
   */
  findDirectChildren(part) {
    const result = [];
    for (const located of this.children) {
      if (Object.is(located.child, part)) result.push(located);
    }
    return result;
  }

  /**
   * @param {BasePart} part
   * @returns {LocatedPart}
   */
  findChild(part) {
    const located = this.children.find(({ child }) => child === part);
    if (located != null) {
      const result = { placement: new DOMMatrix(), ...located };
      return result;
    }

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
      instances,
    }));

    const body = JSON.stringify({ geometries: compact }, matrixAwareReplacer);
    await fetch(`/occ/export?file=${encodeURI(file)}`, {
      method: "POST",
      body,
    });
  }
}
