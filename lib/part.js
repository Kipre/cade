// @ts-check
/** @import * as lib from './lib' */
/** @import * as types from '../tools/types' */

import { Path } from "../tools/path.js";
import { BasePart } from "./lib.js";
import { retrieveOperations, ShapeId } from "./operations.js";

export class Part extends BasePart {
  /**
   * @param {string} name
    * @param {ShapeId} shape
   */
  constructor(name, shape) {
    super(name);
    this.shape = retrieveOperations(shape);
  }

  async loadMesh() {
    const body = JSON.stringify(this.toJson(), replacer);
    console.log(body);
    const r = await fetch("/occ/solidify", { method: "POST", body });
    const file = await r.text();
    this.mesh = file;
  }
  
  toJson() {
    return {
      name: this.name,
      shape: this.shape, 
    }
  }

  flatInstances() {
    return { [this._id]: { item: this, instances: [new DOMMatrix()] } };
  }
}

function replacer(key, value) {
  if (value instanceof Path) return value.toString();
  // detect flattened dommatrix
  if (value.is2D !== undefined && value.isIdentity !== undefined) return [
    value.m11, value.m12, value.m13, value.m14,
    value.m21, value.m22, value.m23, value.m24,
    value.m31, value.m32, value.m33, value.m34,
    value.m41, value.m42, value.m43, value.m44,
  ];
  return value;
}
