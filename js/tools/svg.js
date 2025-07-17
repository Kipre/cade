// @ts-check
/** @import * as types from '../types' */

import { Path } from "./path.js";

export const w3svg = "http://www.w3.org/2000/svg";

export class BBox {
  constructor(marginPercents = 5) {
    this.xMin = Number.POSITIVE_INFINITY;
    this.yMin = Number.POSITIVE_INFINITY;
    this.xMax = 0;
    this.yMax = 0;
    this.marginPercents = marginPercents;
  }

  include(point) {
    this.xMin = Math.min(this.xMin, point[0]);
    this.yMin = Math.min(this.yMin, point[1]);
    this.xMax = Math.max(this.xMax, point[0]);
    this.yMax = Math.max(this.yMax, point[1]);
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

  /**
   * @param {string?} viewBox
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
 * @param {types.Point[][] | string[]} shapes
 */
export function debugGeometry(...shapes) {
  if (typeof document === "undefined") return;

  const id = "debug-drawing";
  let svg = document.querySelector(`#${id}`);
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = id;
    document.body.appendChild(svg);
  }
  const bbox = BBox.fromViewBox(svg.getAttribute("viewBox"));
  const colors = ["red", "green", "blue", "purple", "brown"];

  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    const color = colors[i % shapes.length];

    let path;
    if (Array.isArray(shape)) {
      path = debugPolyline(shape, color);
      for (const p of shape) bbox.include(p);
    } else {
      path = document.createElementNS(w3svg, "path");
      path.setAttribute("d", shape);
      path.setAttribute("stroke", color);
      path.setAttribute("fill", "none");

      const totalLength = path.getTotalLength();
      for (let i = 0; i < 1; i += 0.01) {
        const p = path.getPointAtLength(totalLength * i);
        bbox.include([p.x, p.y]);
      }
    }
    svg.appendChild(path);
  }

  svg.setAttribute("viewBox", bbox.toViewBox());
  const size = Math.max(bbox.xMax - bbox.xMin, bbox.yMax - bbox.yMin);

  svg.setAttribute(
    "style",
    `stroke-width: ${size / 5e2}px; stroke-dasharray: ${size / 5e2} ${size / 5e2
    } ${(3 * size) / 5e2} ${size / 5e2};`,
  );
}
