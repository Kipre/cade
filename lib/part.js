// @ts-check
/** @import * as lib from './lib' */
/** @import * as types from '../tools/types' */

import { Path } from "../tools/path.js";
import { BasePart } from "./lib.js";
import { retrieveOperations, ShapeId } from "./operations.js";
import { matrixAwareReplacer } from "./json.js";

const encoder = new TextEncoder();

async function hashString(string) {
  const data = encoder.encode(string);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

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
    const hash = await hashString(body);
    const hashLine = `# ${hash}\n`;
    const key = `solidify__${this.name}`;
    const cache = sessionStorage.getItem(key);
    if (cache?.startsWith(hashLine)) {
      this.mesh = cache;
      return;
    }

    const r = await fetch("/occ/solidify", { method: "POST", body });
    const file = await r.text();
    sessionStorage.setItem(key, hashLine + file);
    this.mesh = file;
  }

  toJson() {
    return {
      name: this.name,
      shape: this.shape,
    };
  }

  flatInstances() {
    return { [this._id]: { item: this, instances: [new DOMMatrix()] } };
  }
}
