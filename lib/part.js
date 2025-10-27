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
    this.pairings = [];
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

  *getPairings() {
    yield* this.pairings;
  }

  toJson() {
    // normalize path orientations to make occt happy
    const shape = [];
    for (const item of this.shape) {
      const value = { ...item };
      if (value.type === "extrusion") {
        value.insides = value.insides.map((p) => {
          if (p.rotatesClockwise()) return p;
          return p.invert();
        });
        if (!value.outsides[0].rotatesClockwise())
          value.outsides = [value.outsides[0].invert()];
      }
      shape.push(value);
    }
    return {
      shape,
      name: this.name,
    };
  }

  flatInstances() {
    return { [this._id]: { item: this, instances: [new DOMMatrix()] } };
  }
}
