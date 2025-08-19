// @ts-check
/** @import * as types from './types' */

import { Path } from "./path.js";

export const w3svg = "http://www.w3.org/2000/svg";
const defaultMarginPercents = 5;

export class BBox {
  constructor(marginPercents = defaultMarginPercents) {
    this.xMin = Number.POSITIVE_INFINITY;
    this.yMin = Number.POSITIVE_INFINITY;
    this.zMin = Number.POSITIVE_INFINITY;
    this.xMax = Number.NEGATIVE_INFINITY;
    this.yMax = Number.NEGATIVE_INFINITY;
    this.zMax = Number.NEGATIVE_INFINITY;
    this.marginPercents = marginPercents;
  }

  /**
   * @param {types.Point | [number, number, number] } point
   */
  include(point) {
    this.xMin = Math.min(this.xMin, point[0]);
    this.xMax = Math.max(this.xMax, point[0]);
    this.yMin = Math.min(this.yMin, point[1]);
    this.yMax = Math.max(this.yMax, point[1]);

    if (point[2] != null) {
      this.zMin = Math.min(this.zMin, point[2]);
      this.zMax = Math.max(this.zMax, point[2]);
    }
  }

  size() {
    const xSize = this.xMax - this.xMin;
    const ySize = this.yMax - this.yMin;
    const zSize = Object.is(Number.POSITIVE_INFINITY, this.zMin)
      ? 0
      : this.zMax - this.zMin;

    return Math.max(xSize, ySize, zSize);
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

  static fromDataset(element) {
    const self = new BBox();
    self.xMin =
      Number.parseFloat(element.dataset.xMin) || Number.POSITIVE_INFINITY;
    self.yMin =
      Number.parseFloat(element.dataset.yMin) || Number.POSITIVE_INFINITY;
    self.xMax = Number.parseFloat(element.dataset.xMax) || 0;
    self.yMax = Number.parseFloat(element.dataset.yMax) || 0;
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

    let xDistance;
    let yDistance;
    [self.xMin, self.yMin, xDistance, yDistance] = viewBox
      .split(" ")
      .map(Number.parseFloat);
    self.xMax = xDistance + self.xMin;
    self.yMax = yDistance + self.yMin;
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
    path.setAttribute("marker-mid", marker);
    path.setAttribute("marker-end", "url(#arrow)");

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
  <line class="axes" x1="${bbox.xMin - mgn / 2}" x2=${bbox.xMax + mgn / 2} stroke="black" marker-end="url(#arrow)"/>
  <line class="axes" y1="${bbox.yMin - mgn / 2}" y2=${bbox.yMax + mgn / 2} stroke="black" marker-end="url(#arrow)"/>
   ${svg.innerHTML}`;
  svg.setAttribute(
    "style",
    `font-size: ${size / 100}; stroke-width: 0.2em; transform: scale(1, -1); max-height: 100vh;`,
  );
}
