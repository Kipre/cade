/**
 * @import { Point, Point3 } from "../tools/types"
 */

import { norm, rotatePoint } from "../tools/2d.js";
import { mult3, norm3, plus3 } from "../tools/3d.js";
import { Path } from "../tools/path.js";
import { debugGeometry } from "../tools/svg.js";
import { a2m } from "../tools/transform.js";
import { z3, zero2 } from "./defaults.js";
import { cut, extrusion } from "./operations.js";
import { Part } from "./part.js";

export class LinearPart extends Part {
  /** the base shape */
  #retrieved;

  /**
   * @param {string} name
   * @param {number} length
   * @param {import("../tools/path.js").Path} outside
   * @param {import("../tools/path.js").Path[]} insides
   */
  constructor(name, length, outside, insides = []) {
    const shape = extrusion(a2m(), length, outside, ...insides);
    super(name, shape);
    this.length = length;
    this.outside = outside;
    this.#retrieved = this.shape.retreive();
    this.insides = this.#retrieved.insides;
    this.addSymmetries(a2m([0, 0, length / 2], z3));
  }

  height = () => this.outside.bbox().height();
  width = () => this.outside.bbox().width();

  /**
   * @param {import("../lib/operations.js").ShapeId[]} shapes
   */
  cut(...shapes) {
    this.shape = cut(this.shape, ...shapes);
    return this;
  }

  /**
   * lengthen the profile but at the start
   * @param {number} length
   */
  #extendStart(length) {
    this.#retrieved.placement.translateSelf(0, 0, -length);
    this.#retrieved.length += length;
  }

  /**
   * Normal vector decides the orientation of the cut, [0, 0, 1] is straight
   * @param {"start" | "end" | "both"} side
   * @param {Point3} normal
   * @param {Point | Point3 | undefined} maybeStart allows for deciding where the cut should start
   * if omitted, the cut should be done to match the overall length;
   * @returns {DOMMatrix[]} the location for the cuts;
   */
  cutEdge(side, normal, maybeStart) {
    const [x, y, z] = normal;
    // find the highest point
    // const angle = Math.atan2(z, norm([x, y]));
    const azimut = Math.atan2(y, x);

    let startOne = maybeStart;
    let startTwo = maybeStart;

    const bbox = this.outside.rotate(-azimut).bbox();
    if (!maybeStart) {
      startOne = [...rotatePoint(zero2, bbox.left, azimut), 0];
      startTwo = [...rotatePoint(zero2, bbox.right, azimut), 0];
    } else {
      const extension = norm([x, y]) * bbox.size() / z;
      this.#extendStart(extension);
      // extendEnd
      this.#retrieved.length += extension;
    }

    const size = 2 * Math.max(this.length, bbox.size());

    /** @type {DOMMatrix[]} */
    const result = [];
    const cuts = [];
    if (side === "start" || side === "both") {
      const loc = a2m(startTwo, mult3(normal, -1));
      result.push(loc);
      cuts.push(extrusion(loc, size, Path.makeRect(size).recenter()));
    }
    if (side === "end" || side === "both") {
      const loc = a2m(plus3(startOne, [0, 0, this.length]), normal);
      result.push(loc);
      cuts.push(extrusion(loc, size, Path.makeRect(size).recenter()));
    }
    this.cut(...cuts);
    this.newSymmetries = [];
    return result;
  }
}
