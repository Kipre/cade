// @ts-check
/** @import * as lib from './lib' */
/** @import * as types from '../tools/types' */

import { displayScene } from "../display/main.js";
import { eps } from "../tools/2d.js";
import { a2m, transformPoint3 } from "../tools/transform.js";
import { x3, z3, zero3 } from "./defaults.js";
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
    this.onAttach = [];
  }

  async loadMesh() { }
  flatInstances() { }
}

export class Assembly extends BasePart {
  /** @type {LocatedPart[]} */
  children = [];

  addChild(child, placement, runCallbacks = false) {
    const located = { child };
    if (placement) located.placement = placement;
    this.children.push(located);
    if (runCallbacks)
      for (const func of child.onAttach ?? []) {
        func(this, placement ?? a2m());
      }
    return located;
  }

  async loadMesh() {
    const flat = this.flatInstances();

    // name consistency check for proper mesh caching
    const uniqueNames = new Set();
    for (const { item } of Object.values(flat)) {
      if (uniqueNames.has(item.name)) throw new Error(`parts with conflicting names (${item.name}) will mess up mesh caching`);
      uniqueNames.add(item.name);
    }

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

  clone() {
    const result = new Assembly("cloned " + this.name);
    for (const { child, placement: m } of this.children) {
      result.addChild(child, m);
    }
    return result;
  }

  mirror(normal = [0, 0, 1]) {
    function mirrorChild(child, placement, normal) {
      const zero = transformPoint3(placement, zero3);
      const up = transformPoint3(placement.inverse(), normal, true);

      const upAxis = up.findIndex((x) => Math.abs(x) > eps);
      const others = [0, 1, 2].filter((x) => x !== upAxis);
      const sym = [upAxis, ...others].map((i) => child.symmetries[i]);

      if (!Object.is(NaN, sym[0])) {
        return new DOMMatrix()
          .translate(0, 0, -2 * (zero[2] + sym[0]))
          .multiply(placement);
      }

      if (!Object.is(NaN, sym[1])) {
        return new DOMMatrix()
          .translate(zero[0], zero[1] + sym[1])
          // bug here ?
          .rotate(180, 0, 0)
          .translate(-zero[0], -zero[1] - sym[1])
          .multiply(placement);
      }

      if (!Object.is(NaN, sym[2])) {
        return new DOMMatrix()
          .translate(zero[0], zero[1] + sym[2])
          .rotate(180, 0, 0)
          .translate(-zero[0], -zero[1] - sym[2])
          .multiply(placement);
      }

      console.error(`cannot mirror part (${child.name}) with no symmetries`);
      return placement;

    }
    const result = new Assembly(`mirrored ${this.name}`);
    for (const { child, placement: m } of this.children) {
      const placement = m ?? new DOMMatrix();

      const mirroredPlacement = mirrorChild(child, placement, normal);
      result.addChild(child, mirroredPlacement);

      for (const peer of Object.values(child.pairings ?? {})) {
        const { locatedPart, parent } = peer;
        if (parent === this) continue;
        const peerPlacement = locatedPart.placement;
        const selfPlacement = parent.findChild(this).placement

        const newPeerPlacement = selfPlacement.inverse().multiply(peerPlacement);
        const mirrored = mirrorChild(locatedPart.child, newPeerPlacement, normal);

        result.addAttachListener((parent, loc) => {
          parent.addChild(locatedPart.child, loc.multiply(mirrored), false);
        });
      }
    }
    return result;
  }

  addAttachListener(listener) {
    this.onAttach.push(listener);
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
   * @param {BasePart} child
   * @returns {LocatedPart[]}
   */
  findChildInstances(child) {
    const res = this.flatInstances()[child._id];
    if (res == null) throw new Error(`could not find ${child.name} in ${this.name}`);

    return res.instances.map(m => ({ child, placement: m }));
  }

  /**
   * @param {BasePart} part
   * @returns {LocatedPart}
   */
  findChild(part) {
    const located = this.children.find(({ child }) => child === part);
    if (located != null) {
      const result = { placement: a2m(), ...located };
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
