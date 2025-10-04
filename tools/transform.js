// @ts-check
/** @import * as types from './types' */

import { zero3 } from "../lib/defaults.js";
import { eps, norm } from "./2d.js";
import { cross, minus3, normalize3 } from "./3d.js";
// import { DOMMatrix, DOMPoint } from "./dom.js";
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

/**
 * @param {DOMMatrix} m
 * @param {types.Point3} p
 * @returns {types.Point3}
 */
export function transformPoint3(m, p, noTranslation = false) {
  const domp = new DOMPoint(p[0], p[1], p[2]);
  if (noTranslation) domp.w = 0;
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

/**
 * @param {DOMMatrix} m
 */
export function matrixToAxes(m) {
  const location = [m[12], m[13], m[14]];
  const up = [m[8], m[9], m[10]];
  const dir = [m[0], m[1], m[2]];
  return [location, up, dir];
}

/**
 * @param {DOMMatrix} mat
 * @param {DOMMatrix} transform
 */
export function transformOnlyOrigin(mat, transform) {
  const origin = transformPoint3(mat, zero3);
  return new DOMMatrix()
    .translate(...minus3(transformPoint3(transform, origin), origin))
    .multiply(mat);
}

/**
 * Stands for axes to matrix
 * @param {types.Point3?} maybeOrigin
 * @param {types.Point3?} maybeUp
 * @param {types.Point3?} maybeDir
 */
export function a2m(maybeOrigin = null, maybeUp = null, maybeDir = null) {
  const origin = maybeOrigin ?? [0, 0, 0];
  let dir = maybeDir ?? [1, 0, 0];
  const up = maybeUp ?? [0, 0, 1];
  if (norm(up, dir) < eps)
    dir = [0, 1, 0];

  const z = normalize3(up);
  const y = normalize3(cross(z, dir));
  const x = cross(y, z);

  // prettier-ignore
  const transform = new DOMMatrix([
    x[0],
    x[1],
    x[2],
    0,
    y[0],
    y[1],
    y[2],
    0,
    z[0],
    z[1],
    z[2],
    0,
    origin[0],
    origin[1],
    origin[2],
    1,
  ]);

  return transform;
}

export function computeTransformFromPoints(sourcePts, targetPts) {
  // First create a matrix from the source points
  const sourceMatrix = new DOMMatrix([
    sourcePts[1][0] - sourcePts[0][0], // x basis vector x
    sourcePts[1][1] - sourcePts[0][1], // x basis vector y
    sourcePts[2][0] - sourcePts[0][0], // y basis vector x
    sourcePts[2][1] - sourcePts[0][1], // y basis vector y
    sourcePts[0][0], // translation x
    sourcePts[0][1], // translation y
  ]);

  // Then create a matrix from the target points
  const targetMatrix = new DOMMatrix([
    targetPts[1][0] - targetPts[0][0],
    targetPts[1][1] - targetPts[0][1],
    targetPts[2][0] - targetPts[0][0],
    targetPts[2][1] - targetPts[0][1],
    targetPts[0][0],
    targetPts[0][1],
  ]);

  // The transformation matrix is target * inverse(source)
  return targetMatrix.multiply(sourceMatrix.inverse());
}
