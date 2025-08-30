// @ts-check
/** @import * as types from './types' */

import { DOMPoint, DOMMatrix } from "./dom.js";
import { w3svg } from "./svg.js";

export function parseTransformFunction(transform) {
  const svg = document.createElementNS(w3svg, "svg");
  svg.setAttribute("transform", transform);
  const m = svg.transform.baseVal.consolidate().matrix;
  return new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]);
}

/**
 * @param {DOMMatrix} m
 * @param {types.Point} p
 * @returns {types.Point}
 */
export function applyTransformMatrix(m, p) {
  const domp = new DOMPoint(p[0], p[1]);
  const p2 = m.transformPoint(domp);
  return [p2.x, p2.y];
}

export function applyTransformMatrix3(m, p) {
  const domp = new DOMPoint(p[0], p[1], p[2]);
  const p2 = m.transformPoint(domp);
  return [p2.x, p2.y, p2.z];
}

export function makeTransformFunction(svgElement) {
  const matrix = svgElement.transform.baseVal.consolidate().matrix;
  return ([x, y]) => [
    matrix.a * x + matrix.c * y + matrix.e,
    matrix.b * x + matrix.d * y + matrix.f,
  ];
}
