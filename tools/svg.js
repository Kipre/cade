// @ts-check
/** @import * as types from './types' */

import { Path } from "./path.js";

export const w3svg = "http://www.w3.org/2000/svg";
const defaultMarginPercents = 5;

export class BBox {
  constructor(marginPercents = defaultMarginPercents) {
    this.left = [Number.POSITIVE_INFINITY, 0];
    this.bottom = [0, Number.POSITIVE_INFINITY];
    this.right = [Number.NEGATIVE_INFINITY, 0];
    this.top = [0, Number.NEGATIVE_INFINITY];

    this.zMin = Number.POSITIVE_INFINITY;
    this.zMax = Number.NEGATIVE_INFINITY;

    this.marginPercents = marginPercents;
    this.metadata = {};
  }

  /**
   * @param { types.Point | types.Point3 } point
   * @param { any } metadata
   */
  include(point, metadata = null) {
    if (metadata) this.metadata[point.toString()] = metadata;

    if (this.left[0] > point[0]) this.left = point;
    if (this.right[0] < point[0]) this.right = point;
    if (this.bottom[1] > point[1]) this.bottom = point;
    if (this.top[1] < point[1]) this.top = point;

    if (point[2] != null) {
      this.zMin = Math.min(this.zMin, point[2]);
      this.zMax = Math.max(this.zMax, point[2]);
    }
  }

  /**
   * @returns {types.Point | types.Point3}
   */
  extrema() {
    if (Number.isFinite(this.zMin))
      return [
        [this.left[0], this.bottom[1], this.zMin],
        [this.right[0], this.top[1], this.zMax],
      ];
    return [
      [this.left[0], this.bottom[1]],
      [this.right[0], this.top[1]],
    ];
  }

  /**
   * @param {BBox} other
   */
  combine(other) {
    for (const point of other.toPoints()) {
      this.include(point);
    }
    this.metadata = { ...this.metadata, ...other.metadata };

    if (Number.isFinite(other.zMax))
      for (const point of other.extrema()) {
        this.include(point);
      }
  }

  get xMax() {
    return this.right[0];
  }

  get xMin() {
    return this.left[0];
  }

  get yMax() {
    return this.top[1];
  }

  get yMin() {
    return this.bottom[1];
  }

  /** Returns the longest dimension in the cube */
  size() {
    const xSize = this.xMax - this.xMin;
    const ySize = this.yMax - this.yMin;
    const zSize = Object.is(Number.POSITIVE_INFINITY, this.zMin)
      ? 0
      : this.zMax - this.zMin;

    return Math.max(xSize, ySize, zSize);
  }

  /**
   * @returns {types.Point3 | types.Point}
   */
  center() {
    const result = [(this.xMax + this.xMin) / 2, (this.yMax + this.yMin) / 2];
    if (Object.is(Number.POSITIVE_INFINITY, this.zMin)) return result;
    return [...result, (this.zMax + this.zMin) / 2];
  }

  toViewBoxArray = (maybeMargin) => {
    const xDistance = Math.ceil(this.xMax - this.xMin);
    const yDistance = Math.ceil(this.yMax - this.yMin);
    const margin =
      maybeMargin ??
      (this.marginPercents / 100) * Math.max(xDistance, yDistance);
    return [
      Math.floor(this.xMin) - margin,
      Math.floor(this.yMin) - margin,
      xDistance + 2 * margin,
      yDistance + 2 * margin,
    ];
  };

  toViewBox = (maybeMargin) => {
    const values = this.toViewBoxArray(maybeMargin);
    return values.join(" ");
  };

  toDataset = (element) => {
    element.dataset.xMin = this.xMin;
    element.dataset.yMin = this.yMin;
    element.dataset.xMax = this.xMax;
    element.dataset.yMax = this.yMax;
  };

  toPoints = () => [this.bottom, this.right, this.top, this.left];

  static fromDataset(element) {
    const self = new BBox();
    self.left = [
      Number.parseFloat(element.dataset.xMin) || Number.POSITIVE_INFINITY,
      0,
    ];
    self.bottom = [
      Number.parseFloat(element.dataset.yMin) || Number.POSITIVE_INFINITY,
      0,
    ];
    self.right = [Number.parseFloat(element.dataset.xMax) || 0, 0];
    self.top = [0, Number.parseFloat(element.dataset.yMax) || 0];
    return self;
  }

  /**
   * @param {string?} viewBox
   *
   * Caution: will mess-up the margin
   */
  static fromViewBox(viewBox) {
    const self = new BBox();
    if (!viewBox) return self;

    const [xMin, yMin, xDistance, yDistance] = viewBox
      .split(" ")
      .map(Number.parseFloat);
    self.left = [xMin, 0];
    self.right = [xDistance + xMin, 0];
    self.bottom = [0, yMin];
    self.top = [0, yDistance + self.yMin];
    return self;
  }
}

export function addUse(href) {
  const use = document.createElementNS(w3svg, "use");
  use.setAttribute("href", href);
  return use;
}

export async function importDocument(path) {
  const r = await fetch(path);
  const doc = await r.text();
  const parser = new DOMParser();
  const mime = path.endsWith("html") ? "text/html" : "image/svg+xml";
  return parser.parseFromString(doc, mime);
}

export function logOnSVG(x, y, msg) {
  const text = document.createElementNS(w3svg, "text");
  text.setAttribute("x", x);
  text.setAttribute("y", y);
  text.innerHTML = msg;
  return text;
}

export function logVector(x0, y0, x1, y1, color) {
  const line = document.createElementNS(w3svg, "line");
  if (color) line.style.stroke = color;
  line.setAttribute("x1", x0);
  line.setAttribute("y1", y0);
  line.setAttribute("x2", x1);
  line.setAttribute("y2", y1);
  svg.appendChild(line);
}

export function debugPolyline(poly, color = "red", strokeWidth = null) {
  const g = document.createElementNS(w3svg, "g");
  const p = document.createElementNS(w3svg, "path");
  const d = new Path();
  const [p0, ...rest] = poly;
  d.moveTo(p0);

  for (const pn of rest) {
    d.lineTo(pn);
    const point = document.createElementNS(w3svg, "circle");
    point.setAttribute("cx", pn[0]);
    point.setAttribute("cy", pn[1]);
    point.setAttribute("r", "1em");
    g.appendChild(point);
  }

  p.setAttribute("d", d.toString());
  p.setAttribute("stroke", color);
  if (strokeWidth) p.setAttribute("stroke-width", strokeWidth);
  p.setAttribute("fill", "none");

  g.insertBefore(p, [...g.children][0]);
  return g;
}

export function debugArc(start, end, radius, sweep) {
  const d = new Path();
  d.moveTo(start);
  d.arc(end, radius, sweep);
  return d;
}

/**
 * @param {(types.Point[] | string | Path)[]} shapes
 */
export function debugGeometry(...shapes) {
  if (typeof document === "undefined") return;

  const id = "debug-drawing";
  let svg = document.querySelector(`#${id}`);
  if (!svg) {
    svg = document.createElementNS(w3svg, "svg");
    svg.innerHTML = `
<defs>
  <marker
    id="circle"
    markerWidth="10"
    markerHeight="10"
    refX="5"
    refY="5"
    markerUnits="strokeWidth">
    <circle cx="5" cy="5" r="3" stroke-width="1" stroke="context-stroke" fill="context-fill" />
  </marker>
    <marker
      id="arrow"
      viewBox="0 0 10 10"
      refX="1"
      refY="5"
      markerUnits="strokeWidth"
      markerWidth="5"
      markerHeight="10"
      orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
    </marker>
    <marker
      id="start-line"
      viewBox="0 0 10 10"
      refX="1"
      refY="5"
      markerUnits="strokeWidth"
      markerWidth="5"
      markerHeight="10"
      orient="auto">
      <path d="M 4 0 L 4 10 L 6 10 L 6 0 Z" fill="context-stroke" />
    </marker>
</defs>`;
    svg.id = id;
    document.body.appendChild(svg);
  }
  const bbox = BBox.fromDataset(svg);
  const colors = ["red", "green", "blue", "purple", "brown"];

  for (let i = 0; i < shapes.length; i++) {
    let shape = shapes[i];
    const color = colors[i % shapes.length];

    let marker = "url(#arrow)";
    let path;
    if (Array.isArray(shape)) {
      const [first, ...points] = shape;
      shape = new Path();
      shape.moveTo(first);
      for (const point of points) shape.lineTo(point);
      shape.close();
      marker = "url(#circle)";
    }

    path = document.createElementNS(w3svg, "path");
    path.setAttribute("d", shape.toString());
    path.setAttribute("stroke", color);
    path.setAttribute("style", "opacity: 0.8");
    path.setAttribute("fill", "none");
    path.setAttribute("marker-start", "url(#start-line)");
    path.setAttribute("marker-mid", marker);
    // path.setAttribute("marker-end", "url(#arrow)");

    const totalLength = path.getTotalLength();
    for (let i = 0; i < 1; i += 0.01) {
      const p = path.getPointAtLength(totalLength * i);
      bbox.include([p.x, p.y]);
    }
    svg.appendChild(path);
  }

  bbox.toDataset(svg);
  svg.setAttribute("viewBox", bbox.toViewBox());
  const size = bbox.size();

  const mgn = size / 20;

  for (const el of svg.querySelectorAll(".axes")) el.remove();
  svg.innerHTML = `
  <line class="axes" x1="${bbox.xMin - mgn / 2}" x2=${bbox.xMax + mgn / 2
    } stroke="black" marker-end="url(#arrow)"/>
  <line class="axes" y1="${bbox.yMin - mgn / 2}" y2=${bbox.yMax + mgn / 2
    } stroke="black" marker-end="url(#arrow)"/>
   ${svg.innerHTML}`;
  svg.setAttribute(
    "style",
    `font-size: ${size / 100
    }; stroke-width: 0.2em; transform: scale(1, -1); max-height: 100vh;`,
  );
}
