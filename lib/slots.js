// @ts-check
/** @import * as types from '../tools/types' */

import {
  computeVectorAngle,
  minus,
  placeAlong,
  rotatePoint,
} from "../tools/2d.js";
import { proj2d } from "../tools/3d.js";
import { Path } from "../tools/path.js";
import { a2m } from "../tools/transform.js";
import { FlatPart, spindleClearedLineTo } from "./flat.js";

export class BaseSlot {
  /**
   * @param {number} x
   */
  constructor(x) {
    this.x = x;
  }

  /**
   * @param {FlatPart} part
   * @param {number} segmentIdx
   * @param {types.Point} location
   * @param {types.Point} vector
   */
  materialize(part, segmentIdx, location, vector) { }

  /**
   * @param {FlatPart} part
   * @param {number} segmentIdx
   * @param {number?} place
   */
  materializeOuter(part, segmentIdx, place) {
    const path = part.outside;
    const start = path.evaluate(segmentIdx, 0);
    const end = path.evaluate(segmentIdx, 1);
    const location = placeAlong(start, end, { fromStart: place ?? this.x });
    const vector = placeAlong(start, end, { fromStart: (place ?? this.x) + 1 });

    const result = this.materialize(part, segmentIdx, location, vector);

    result.slotPlacement = this.makePlacement(
      [...location, part.thickness / 2],
      vector,
    );

    return result;
  }

  /**
   * @param {types.Point3} location
   * @param {types.Point} vector
   */
  makePlacement(location, vector) {
    const loc = proj2d(location);
    const center = rotatePoint(loc, vector, -Math.PI / 2);
    const zee = minus(center, loc);
    const eax = minus(vector, loc);
    return a2m(location, [...zee, 0], [...eax, 0]);
  }
}

export class TenonMortise extends BaseSlot {
  /**
   * @param {number} x
   */
  constructor(x, spindleDiameter = 6, length = 30) {
    super(x);

    this.spindleDiameter = spindleDiameter;
    this.length = length;
  }

  /**
   * @param {FlatPart} part
   * @param {number} segmentIdx
   * @param {types.Point} location
   * @param {types.Point} vector
   */
  materialize(part, segmentIdx, location, vector) {
    const { spindleDiameter, length } = this;
    const { thickness } = part;

    // not efficient but whatever
    const mortise = new Path();
    mortise.moveTo([0, -thickness / 2]);
    mortise.lineTo([-length / 2, -thickness / 2]);
    spindleClearedLineTo(mortise, [-length / 2, 0], spindleDiameter / 2, true);
    mortise.mirror([0, 0]);
    mortise.mirror();

    const tenon = new Path();
    tenon.moveTo([-spindleDiameter - length / 2, 0]);
    tenon.arc([-length / 2, 0], spindleDiameter / 2, 1);
    tenon.lineTo([-length / 2, thickness]);
    tenon.arcTo([0, thickness], 3);
    tenon.mirror([0, 0], [0, 1]);

    const path = part.outside;

    const rotation = computeVectorAngle(minus(vector, location));
    // TODO this does not work
    // if (!path.rotatesClockwise()) rotation += Math.PI;
    path.insert(segmentIdx, tenon.rotate(rotation).translate(location));
    return { path: mortise };
  }
}
