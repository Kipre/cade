//@ts-check

/**
 * @import { Segment } from './path'
 */

import { dot, eps, minus, norm, plus, rotatePoint } from "./2d.js";
import { getCircleCenter, isInPieSlice } from "./circle.js";
import { x2, zero2 } from "./defaults.js";
import { Path } from "./path.js";

// TODO: remove when old shelf-maker is removed
/**
 * @deprecated
 */
export function convexHullOld(...geometries) {
  const paths = [];
  for (const geom of geometries) {
    paths.push(Path.fromPolyline(geom, false));
  }

  return convexHull(...paths);
}

/**
 * Operates on paths
 * @param {Path[]} paths
 * @returns {Path}
 */
export function convexHull(...paths) {
  let lastSegment = null;
  let lastPoint = null;
  const result = new Path();

  const allSegments = [];
  for (const p of paths) {
    for (const segment of p.iterateOverSegments()) {
      allSegments.push(segment);
    }
  }

  const fractions = 100;

  for (const theta of Array.from(
    { length: fractions },
    (_, i) => (i * (2 * Math.PI)) / fractions,
  )) {
    const dir = rotatePoint(zero2, x2, theta);
    let best = null;
    let bestAt = -Infinity;
    let bestPoint = null;
    for (const segment of allSegments) {
      const p = support(segment, theta);
      const peak = dot(dir, p);
      if (peak > bestAt) {
        best = segment;
        bestAt = peak;
        bestPoint = p;
      }
    }
    const [, p1, type, p2, r, sweep] = best;

    if (result.controls.length === 0) {
      result.moveTo(bestPoint);
      lastPoint = bestPoint;
      lastSegment = best;
      continue;
    }

    if (type === "lineTo") {
      if (norm(lastPoint, bestPoint) < eps) {
        continue;
      }
      result.lineTo(bestPoint);
      lastPoint = bestPoint;
      lastSegment = best;
      continue;
    }

    if (type === "arc" && best === lastSegment) {
      if (result.controls.at(-1)[0] === "arc") {
        result.controls.pop();
      }
      const s =
        dot(minus(lastPoint, bestPoint), minus(p1, p2)) > 0 ? sweep : 1 - sweep;
      result.arc(bestPoint, r, s);
      lastPoint = bestPoint;
      continue;
    }

    if (type === "arc") {
      result.lineTo(bestPoint);
      lastPoint = bestPoint;
      lastSegment = best;
      continue;
    }
    throw new Error("segment not supported");
  }

  result.close();
  result.simplify();
  return result;
}

/**
 * @param {Segment} segment
 * @param {number} theta
 */
function support(segment, theta) {
  const [, p1, type, p2, r, sweep] = segment;

  if (type === "arc") {
    const center = getCircleCenter(p1, p2, r, sweep);
    const p = rotatePoint(center, plus(center, [r, 0]), theta);
    if (isInPieSlice(p, p1, p2, r, sweep)) {
      return p;
    }
  }

  if (type !== "lineTo" && type !== "arc")
    throw new Error("unknown segment type");

  const dir = rotatePoint(zero2, x2, theta);

  if (dot(p1, dir) > dot(p2, dir)) return p1;
  return p2;
}
