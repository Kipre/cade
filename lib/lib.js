// @ts-check
/** @import * as lib from './lib' */
/** @import * as types from '../tools/types' */

import { displayScene } from "../display/main.js";
import { eps, plus } from "../tools/2d.js";
import { cross, dot3, mult3, norm3, normalize3, plus3 } from "../tools/3d.js";
import { a2m, transformPoint3 } from "../tools/transform.js";
import { x3, y3, z3, zero3 } from "./defaults.js";
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
  /**
   * @returns {Generator<LocatedPart & {parent: Assemby}>}
   */
  *getPairings() { }
  /**
   * @returns {BasePart}
   */
  clone() {
    throw new Error("not implemented");
  }
}

export class Assembly extends BasePart {
  /** @type {LocatedPart[]} */
  children = [];

  /**
   * @param {BasePart} child
   * @param {DOMMatrix?} placement
   * @returns {LocatedPart}
   */
  addChild(child, placement=null, runCallbacks = false) {
    placement ??= a2m();
    const located = { child, placement };
    this.children.push(located);
    if (runCallbacks)
      for (const func of child.onAttach ?? []) {
        func(this, placement);
      }
    return located;
  }

  async loadMesh() {
    const flat = this.flatInstances();

    // name consistency check for proper mesh caching
    const uniqueNames = new Set();
    for (const { item } of Object.values(flat)) {
      if (uniqueNames.has(item.name))
        throw new Error(
          `parts with conflicting names (${item.name}) will mess up mesh caching`,
        );
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

  *getPairings() {
    for (const { child, placement: m } of this.children) {
      yield* child.getPairings();
    }
  }

  forkChild(part) {
    const located = this.children.find(({ child }) => child === part);
    if (located == null) throw new Error("couldn't find child");
    const clone = located.child.clone();
    located.child = clone;
    return clone;
  }

  clone() {
    const result = new Assembly("cloned " + this.name);
    for (const { child, placement: m } of this.children) {
      result.addChild(child, m);
    }
    return result;
  }

  /**
   * @param {types.Point3} normal
   */
  mirror(normal = [0, 0, 1]) {
    function mirrorChild(child, placement) {
      const zero = transformPoint3(placement, zero3);

      let symmetryUnitVector = zero3;
      let symmetryOffset = 0;
      if (!Object.is(NaN, child.symmetries[0])) {
        symmetryUnitVector = x3;
        symmetryOffset = child.symmetries[0];
      } else if (!Object.is(NaN, child.symmetries[1])) {
        symmetryUnitVector = y3;
        symmetryOffset = child.symmetries[1];
      } else if (!Object.is(NaN, child.symmetries[2])) {
        symmetryUnitVector = z3;
        symmetryOffset = child.symmetries[2];
      } else {
        console.error(`cannot mirror part (${child.name}) with no symmetries`);
        return placement;
      }

      const outsideUnitVector = transformPoint3(
        placement,
        symmetryUnitVector,
        true,
      );
      const axis = cross(outsideUnitVector, normal);

      if (norm3(axis) < eps) {
        const translation = mult3(
          outsideUnitVector,
          -2 * (dot3(outsideUnitVector, zero) + symmetryOffset),
        );

        return new DOMMatrix().translate(...translation).multiply(placement);
      }

      return new DOMMatrix()
        .translate(zero[0], zero[1])
        .translate(...mult3(outsideUnitVector, symmetryOffset))
        .rotateAxisAngle(...axis, 180)
        .translate(...mult3(outsideUnitVector, -symmetryOffset))
        .translate(-zero[0], -zero[1])
        .multiply(placement);
    }

    const result = new Assembly(`mirrored ${this.name}`);
    for (const { child, placement: m } of this.children) {
      const placement = m ?? new DOMMatrix();

      const mirroredPlacement = mirrorChild(child, placement);
      result.addChild(child, mirroredPlacement);

      for (const peer of child.getPairings()) {
        const { parent, ...locatedPart } = peer;
        if (parent === this) continue;
        const peerPlacement = locatedPart.placement;
        let selfPlacement;
        try {
          selfPlacement = parent.findChild(this).placement;
        } catch {
          continue;
        }

        const newPeerPlacement = selfPlacement
          .inverse()
          .multiply(peerPlacement);
        const mirrored = mirrorChild(locatedPart.child, newPeerPlacement);

        result.addAttachListener((parent, loc) => {
          parent.addChild(locatedPart.child, loc.multiply(mirrored), false);
        });
      }
    }
    return result;
  }

  /**
   * @param {(parent: any, loc: any) => void} listener
   */
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
    if (res == null)
      throw new Error(`could not find ${child.name} in ${this.name}`);

    return res.instances.map((m) => ({ child, placement: m }));
  }

  /**
   * @param {BasePart} part
   * @returns {Generator<LocatedPart>}
   */
  *findChildren(part) {
    for (const { child, placement } of this.children) {
      const mat = placement ?? new DOMMatrix();
      if (child === part) yield { child, placement: placement ?? mat };
      else if (child instanceof Assembly)
        try {
          for (const { child: sub, placement } of child.findChildren(part)) {
            yield { child: sub, placement: mat.multiply(placement) };
          }
        } catch { }
    }
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

    throw new Error(`coundn't find child "${part.name}" in "${this.name}"`);
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
