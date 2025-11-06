//@ts-check

import { minus } from "./2d.js";
import { cross } from "./3d.js";

export function convexHull(...geometries) {
  const points = [];
  for (const geom of geometries) {
    points.push(...geom);
  }
  points.sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);

  const lower = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(minus(lower.at(-1), lower.at(-2)), minus(p, lower.at(-2)))[2] >= 0)
      lower.pop();
    lower.push(p);
  }

  const upper = [];
  for (const p of points.toReversed()) {
    while (upper.length >= 2 && cross(minus(upper.at(-1), upper.at(-2)), minus(p, upper.at(-2)))[2] >= 0)
      upper.pop();
    upper.push(p);
  }

  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
