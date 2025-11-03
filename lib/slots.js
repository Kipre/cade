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
import { debugGeometry } from "../tools/svg.js";
import { a2m } from "../tools/transform.js";
import { y2, zero2 } from "./defaults.js";
import { FlatPart, spindleClearedLineTo } from "./flat.js";

/**
 * @param {number} width
 * @param {number} height
 * @param {number} spindleDiameter
 * @param {number} radius
 */
export function makeTenon(width, height, spindleDiameter, radius) {
  const p = new Path();
  p.moveTo([-spindleDiameter - width / 2, 0]);
  p.arc([-width / 2, 0], spindleDiameter / 2, 1);
  p.lineTo([-width / 2, height]);
  p.arcTo([0, height], radius);
  p.mirror(zero2, y2);

  return p;
}

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
   * @param {number} place
   */
  materialize(part, segmentIdx, place) { }

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

    const result = this.materialize(part, segmentIdx, place ?? this.x);

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
   * @param {number} place
   */
  materialize(part, segmentIdx, place) {
    const { spindleDiameter, length } = this;
    const { thickness } = part;

    // not efficient but whatever
    const mortise = new Path();
    mortise.moveTo([0, -thickness / 2]);
    mortise.lineTo([-length / 2, -thickness / 2]);
    spindleClearedLineTo(mortise, [-length / 2, 0], spindleDiameter / 2, true);
    mortise.mirror([0, 0]);
    mortise.mirror();

    // should be looking at the thickness of the other part
    const tenon = makeTenon(length, thickness, spindleDiameter, 3);

    const path = part.outside;

    path.insertFeature(tenon, segmentIdx, { fromStart: place });
    return { path: mortise };
  }
}

export class DrawerSlot extends BaseSlot {
  /**
   * @param {number} x
   */
  constructor(start = true, spindleDiameter = 6, length = 15) {
    super(start ? 0 : 1);

    this.start = start;
    this.spindleDiameter = spindleDiameter;
    this.length = length;
  }

  /**
   * @param {FlatPart} part
   * @param {number} segmentIdx
   * @param {number} place
   */
  materialize(part, segmentIdx, place) {
    const { spindleDiameter, length, start } = this;
    const { thickness } = part;

    // not efficient but whatever
    let mortise = new Path();
    mortise.moveTo([-10, -thickness / 2]);
    mortise.lineTo([length, -thickness / 2]);
    spindleClearedLineTo(mortise, [length, 0], spindleDiameter / 2, true);
    // mortise.lineTo([length / 2, 0]);
    mortise.mirror([0, 0]);
    mortise.close();

    const height = thickness;
    const radius = 3;

    let tenon = new Path();
    tenon.moveTo([0, 0]);
    tenon.lineTo([0, height]);
    // tenon.arcTo([length, height], radius);
    tenon.lineTo([length, height]);
    tenon.arcTo([length, 0], radius);
    tenon.arc([length + spindleDiameter, 0], spindleDiameter / 2, 1);

    if (!start) {
      tenon = tenon.scale(-1, 1).invert();
      mortise = mortise.scale(-1, 1);
    }

    const path = part.outside;

    path.insertFeature(tenon, segmentIdx, { fraction: start ? 0 : 1 });
    path.simplify();

    return { path: mortise, booleanDifference: true };
  }
}

export class HornSlot extends BaseSlot {
  /**
   * @param {number} x
   */
  constructor(start = true, spindleDiameter = 6, length = 20) {
    super(start ? 0 : 1);

    this.start = start;
    this.spindleDiameter = spindleDiameter;
    this.length = length;
  }

  /**
   * @param {FlatPart} part
   * @param {number} segmentIdx
   * @param {number} place
   */
  materialize(part, segmentIdx, place) {
    const { spindleDiameter, length, start } = this;
    const { thickness } = part;

    // not efficient but whatever
    let mortise = new Path();
    mortise.moveTo([0, -thickness / 2]);
    mortise.lineTo([-length / 2, -thickness / 2]);
    spindleClearedLineTo(mortise, [-length / 2, 0], spindleDiameter / 2, true);
    mortise.mirror([0, 0]);
    mortise.mirror();

    const height = thickness;
    const radius = 3;

    let tenon = new Path();
    tenon.moveTo([0, 0]);
    tenon.lineTo([0, height]);
    // tenon.arcTo([length, height], radius);
    tenon.lineTo([length, height]);
    tenon.arcTo([length, 0], radius);
    tenon.arc([length + spindleDiameter, 0], spindleDiameter / 2, 1);

    if (!start) {
      tenon = tenon.scale(-1, 1).invert();
      mortise = mortise.scale(-1, 1).translate([-length / 2, 0]);
    } else {
      mortise = mortise.translate([length / 2, 0]);
    }

    const path = part.outside;

    path.insertFeature(tenon, segmentIdx, { fraction: start ? 0 : 1 });
    path.simplify();

    return { path: mortise };
  }
}

export class CenterDrawerSlot extends BaseSlot {
  /**
   * @param {number} x
   */
  constructor(x, flipMortise = false, spindleDiameter = 6, length = 30) {
    super(x);

    this.spindleDiameter = spindleDiameter;
    this.length = length;
    this.flipMortise = flipMortise;
  }

  /**
   * @param {FlatPart} part
   * @param {number} segmentIdx
   * @param {number} place
   */
  materialize(part, segmentIdx, place) {
    const { spindleDiameter, length } = this;
    const { thickness } = part;

    // not efficient but whatever
    let mortise = new Path();
    mortise.moveTo([0, thickness / 2]);
    mortise.lineTo([length / 2, thickness / 2]);
    spindleClearedLineTo(
      mortise,
      [length / 2, -thickness],
      spindleDiameter / 2,
      true,
    );
    mortise.mirror(zero2, y2);
    mortise.close();
    if (this.flipMortise) mortise = mortise.rotate(Math.PI);

    const tenon = makeTenon(length, thickness + 1, spindleDiameter, 3);

    const path = part.outside;

    path.insertFeature(tenon, segmentIdx, { fromStart: place });
    path.simplify();

    return { path: mortise, booleanDifference: true };
  }
}
