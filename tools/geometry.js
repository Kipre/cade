/**
 * @import { Point3 } from "./types"
 */
import { dot3, minus3, mult3, plus3 } from "./3d.js";
import { z3, zero3 } from "./defaults.js";
import { atm3 } from "./transform.js";

/**
 * @param {DOMMatrix} line - z axis is the vector and origin is origin
 * @param {DOMMatrix} plane - z is normal and origin is origin
 * @returns {Point3}
 */
export function intersectLineAndPlane(line, plane) {
  const p0 = atm3(plane, zero3);
  const normal = atm3(plane, z3, true);
  const l0 = atm3(line, zero3);
  const direct = atm3(line, z3, true);

  const t = dot3(normal, minus3(p0, l0)) / dot3(normal, direct);
  return plus3(l0, mult3(direct, t));
}
