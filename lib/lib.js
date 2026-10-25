/**
 * @import * as types from '../tools/types'
 * @import {Part} from './part.js'
 */

import { displayScene } from "../display/main.js";
import { eps } from "../tools/2d.js";
import {
  collinear3,
  cross,
  dot3,
  mult3,
  norm3,
  project3,
} from "../tools/3d.js";
import {
  a2m,
  atm3,
  computeAngleBetweenVectors,
  intersectPlanes,
  transformPoint3,
} from "../tools/transform.js";
import { x3, y3, z3, zero3 } from "./defaults.js";
import { matrixAwareReplacer } from "./json.js";
import { defaultMaterial } from "./materials.js";

/**
 * @template {BasePart} [T=Part]
 * @typedef {{child: T, placement: DOMMatrix}} LocatedPart
 */

/**
 * @typedef { Record < string, { item: Part, instances: DOMMatrix[] } >} FlatInstances
 */

export class BasePart {
  /**
   * @param {string} name
   */
  constructor(name) {
    this.name = name;
    this.mesh = null;
    this.material = defaultMaterial;
    this._id = Math.random().toString().slice(2);
    // this is deprecated
    /** @type {types.Point3} */
    this.symmetries = [NaN, NaN, NaN];
    this.newSymmetries = [];
    this.onAttach = [];
    this.pairings = [];
  }

  async loadMesh() {}

  /**
   * @returns {FlatInstances}
   */
  flatInstances() {
    return {};
  }

  /**
   * @param {DOMMatrix[]} symmetries
   */
  addSymmetries(...symmetries) {
    this.newSymmetries.push(...symmetries);
  }

  getSymmetries() {
    return this.newSymmetries;
  }

  /**
   * @param {DOMMatrix} normal
   * @returns {LocatedPart<this>}
   */
  enantiometer(normal) {
    const [symmetry] = this.getSymmetries();
    if (!symmetry) throw new Error(`cannot mirror part ${this.name}`);

    if (collinear3(atm3(normal, z3, true), atm3(symmetry, z3, true))) {
      const planeToPlane = atm3(normal.inverse().multiply(symmetry), zero3)[2];
      return {
        placement: normal
          .translate(0, 0, -2 * planeToPlane)
          .multiply(normal.inverse()),
        child: this,
      };
    }

    const intersectionAxis = intersectPlanes(normal, symmetry);
    const n1 = atm3(normal, z3, true);
    const n2 = atm3(symmetry, z3, true);
    const angle = computeAngleBetweenVectors(n1, n2);

    const placement = intersectionAxis
      .rotate(0, 0, (-2 * 180 * angle) / Math.PI)
      .multiply(intersectionAxis.inverse());

    return { placement, child: this };
  }

  /**
   * @returns {Generator<LocatedPart & {parent: Assembly}>}
   */
  *getPairings() {}

  /**
   * @returns {BasePart}
   */
  clone() {
    throw new Error("not implemented");
  }

  /**
   * @param {string?} path -- to save this file on the server
   * @returns {Promise<string>}
   */

  async project(path = null) {
    const flat = this.flatInstances();
    const compact = Object.values(flat).map(({ item, instances }) => ({
      part: item.toJson(),
      instances,
    }));

    const params = new URLSearchParams();
    if (path) params.append("file", path);

    const body = JSON.stringify({ geometries: compact }, matrixAwareReplacer);
    const response = await fetch(`/occ/project?${params}`, {
      method: "POST",
      body,
    });
    return await response.text();
  }
}
