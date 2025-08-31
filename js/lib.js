import { Path } from "./tools/path.js";
import { BBox, debugGeometry, w3svg } from "./tools/svg.js";

export class Part {
  constructor(name) {
    this.name = name;
    this.mesh = null;
  }

  async loadMesh() { }
}

export class Assembly extends Part {
  children = [];

  addChild(child, placement) {
    this.children.push({ child, placement });
  }

  async loadMesh() {
    const result = [];
    for (const { child, placement } of this.children) {
      result.push(child.loadMesh());
    }
    await Promise.all(result);
  }
}

export class Model extends Assembly {
  watch() {
    console.log(this);
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
