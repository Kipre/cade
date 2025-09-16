// @ts-check
/** @import * as lib from './lib' */
/** @import * as types from '../tools/types' */

import { Path } from "../tools/path.js";
import { BasePart } from "./lib.js";
import { retrieveOperations, ShapeId } from "./operations.js";
import { matrixAwareReplacer } from "./json.js";

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
    const body = JSON.stringify(this.toJson(), matrixAwareReplacer);
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

