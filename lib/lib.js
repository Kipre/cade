import { displayScene } from "../display/main.js";
import { Path } from "../tools/path.js";
import { BBox, w3svg } from "../tools/svg.js";

/** @typedef {{child: Part, placement: DOMMatrix}} LocatedPart */

export class Part {
  constructor(name) {
    this.name = name;
    this.mesh = null;
  }

  async loadMesh() { }
  geometries() { }
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

  geometries() {
    const result = {};
    for (const { child, placement } of this.children) {
      const geoms = child.geometries();
      mergeGeometries(result, geoms, placement);
    }
    return result;
  }
}

function mergeGeometries(acc, other, placement) {
  for (const [key, { obj, instances }] of Object.entries(other)) {
    if (!(key in acc)) acc[key] = { obj, instances: [] };
    acc[key].instances.push(...instances.map((mat) => mat.multiply(placement)));
  }
}

export class Model extends Assembly {
  async watch() {
    const geometries = this.geometries();
    await displayScene(Object.values(geometries));
  }

  toJson() { }
}

export class FlatPart extends Part {
  /**
   * @param {Path} outside
   * @param {Path[]} [insides]
   */
  constructor(outside, insides = []) {
    super();
    this.outside = outside;
    this.insides = insides;
    this._id = Math.random().toString().slice(2);
  }

  async loadMesh() {
    const body = this.toJson();
    const r = await fetch("/occ/thicken", { method: "POST", body });
    const file = await r.text();
    this.mesh = file;
    // displayOBJItem(file);
  }

  geometries() {
    return { [this._id]: { obj: this.mesh, instances: [new DOMMatrix()] } };
  }

  /**
   * @param {Path[]} insides
   */
  addInsides(...insides) {
    this.insides.push(...insides);
  }

  display() {
    const svg = document.createElementNS(w3svg, "svg");
    svg.setAttribute("transform", "scale(1, -1)");
    svg.id = this._id;
    document.body.appendChild(svg);

    const bbox = new BBox();

    for (const shape of [this.outside, ...this.insides]) {
      const path = document.createElementNS(w3svg, "path");
      path.setAttribute("d", shape.toString());
      path.setAttribute("stroke", "blue");
      path.setAttribute("style", "opacity: 0.8");
      path.setAttribute("fill", "none");

      const totalLength = path.getTotalLength();
      for (let i = 0; i < 1; i += 0.01) {
        const p = path.getPointAtLength(totalLength * i);
        bbox.include([p.x, p.y]);
      }
      svg.appendChild(path);
    }

    svg.setAttribute("viewBox", bbox.toViewBox());
  }

  toJson() {
    const result = {};
    result.outside = this.outside.toString();
    result.insides = this.insides.map((p) => p.toString());
    return JSON.stringify(result);
  }
}
