// @ts-check
/** @import * as types from '../tools/types' */

import {
  intersectLines,
  minus,
  norm,
  placeAlong,
  rotatePoint,
} from "../tools/2d.js";
import { proj2d } from "../tools/3d.js";
import { Path } from "../tools/path.js";
import { a2m, atm3 } from "../tools/transform.js";
import { y2, zero2 } from "./defaults.js";
import { FlatPart, projectCenterLine, spindleClearedLineTo } from "./flat.js";

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

/**
 * @param {number} width
 * @param {number} height
 * @param {number} supportHeight
 * @param {number} supportWidth
 * @param {number} spindleDiameter
 * @param {number} radius
 */
function makeSupportiveTenon(
  width,
  height,
  supportHeight,
  supportWidth,
  spindleDiameter,
  radius,
) {
  const p = new Path();
  p.moveTo([-spindleDiameter, 0]);
  p.arc([0, 0], spindleDiameter / 2, 1);
  p.lineTo([0, supportHeight]);
  p.lineTo([supportWidth, supportHeight]);
  p.arcTo([width, height], radius);
  p.lineTo([width, 0]);
  p.arc([spindleDiameter + width, 0], spindleDiameter / 2, 1);
  return p;
}

/**
 * @param {number} length
 * @param {number} thickness
 * @param {number} spindleDiameter
 */
export function makeMortise(length, thickness, spindleDiameter) {
  const p = new Path();
  p.moveTo([0, -thickness / 2]);
  p.lineTo([-length / 2, -thickness / 2]);
  spindleClearedLineTo(p, [-length / 2, 0], spindleDiameter / 2, true);
  p.mirror([0, 0]);
  p.mirror();
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
   * @param {types.Point} start
   * @param {types.Point} end
   * @param {number} place
   */
  materialize(part, start, end, place) { }

  /**
   * @param {FlatPart} part
   * @param {types.Point} start
   * @param {types.Point} end
   * @param {number} place
   */
  materializeOuter(part, start, end, place) {
    const result = this.materialize(part, start, end, place ?? this.x);

    const location = placeAlong(start, end, { fromStart: place ?? this.x });
    const vector = placeAlong(start, end, { fromStart: (place ?? this.x) + 1 });

    if (!result.slotPlacement)
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
  constructor(
    x,
    {
      spindleDiameter = 6,
      length = 30,
      clearance = 0,
      tenonExtension = 0,
    } = {},
  ) {
    super(x);

    this.spindleDiameter = spindleDiameter;
    this.length = length;
    this.clearance = clearance;
    this.tenonExtension = tenonExtension;
  }

  /**
   * @param {FlatPart} part
   * @param {types.Point} start
   * @param {types.Point} end
   * @param {number} place
   */
  materialize(part, start, end, place) {
    const { spindleDiameter, length } = this;
    const { thickness } = part;

    const [segmentIdx] = part.outside.findSegmentsOnLine(start, end, {
      includedInLine: true,
    });

    const mortise = makeMortise(
      length + this.clearance,
      thickness + this.clearance,
      spindleDiameter,
    );

    // should be looking at the thickness of the other part
    const tenon = makeTenon(
      length,
      thickness + this.tenonExtension,
      spindleDiameter,
      3,
    );

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
   * @param {types.Point} startPoint
   * @param {types.Point} endPoint
   * @param {number} place
   */
  materialize(part, startPoint, endPoint, place) {
    const { spindleDiameter, length, start } = this;
    const { thickness } = part;
    const [segmentIdx] = part.outside.findSegmentsOnLine(startPoint, endPoint, {
      includedInLine: true,
    });

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
   * @param {types.Point} startPoint
   * @param {types.Point} end
   * @param {number} place
   */
  materialize(part, startPoint, end, place) {
    const { spindleDiameter, length, start } = this;
    const { thickness } = part;

    const [segmentIdx] = part.outside.findSegmentsOnLine(startPoint, end, {
      includedInLine: true,
    });

    // not efficient but whatever
    let mortise = makeMortise(length, thickness, spindleDiameter);

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
  constructor(x, flipMortise = false, length = 30, spindleDiameter = 6) {
    super(x);

    this.spindleDiameter = spindleDiameter;
    this.length = length;
    this.flipMortise = flipMortise;
  }

  /**
   * @param {FlatPart} part
   * @param {types.Point} startPoint
   * @param {types.Point} end
   * @param {number} place
   */
  materialize(part, startPoint, end, place) {
    const [segmentIdx] = part.outside.findSegmentsOnLine(startPoint, end, {
      includedInLine: true,
    });
    const { spindleDiameter, length } = this;
    const { thickness } = part;

    // not efficient but whatever
    let mortise = new Path();
    mortise.moveTo([0, thickness / 2]);
    mortise.lineTo([length / 2, thickness / 2]);
    spindleClearedLineTo(
      mortise,
      [length / 2, -length],
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

export class ThroughAngleSupport extends BaseSlot {
  /**
   * @param {any} locatedEdgePart
   * @param {any} partToSupport
   */
  constructor(
    locatedEdgePart,
    partToSupport,
    otherSide = false,
    spindleDiameter = 6,
  ) {
    super(0);

    this.spindleDiameter = spindleDiameter;
    this.length = length;
    this.partToSupport = partToSupport;
    this.locatedEdgePart = locatedEdgePart;
    this.otherSide = otherSide;
  }

  /**
   * @param {FlatPart} part
   * @param {number} place
   */
  materialize(part, start, end, place) {
    const { spindleDiameter } = this;
    const { thickness } = part;

    const [segmentIdx] = part.outside.findSegmentsOnLine(start, end, {
      includedInLine: true,
    });

    const placement = this.partToSupport.placement;
    const third = this.partToSupport.child;
    const selfPlacement = this.locatedEdgePart.placement;

    const planeToPart = placement.inverse().multiply(selfPlacement);
    const parttp = (/** @type {any[]} */ p) =>
      proj2d(atm3(planeToPart.inverse(), p));

    const centerline = projectCenterLine(planeToPart, 0, 50);
    const line = third.outside.intersectLine(...centerline);
    const pts = line.map((/** @type {{ point: any; }} */ p) =>
      parttp([...p.point, this.otherSide ? part.thickness : 0]),
    );

    const length = 30;

    let tenon = makeSupportiveTenon(
      length,
      thickness,
      norm(...pts) + part.thickness,
      20,
      this.spindleDiameter,
      3,
    );

    const intersection = intersectLines(...pts, start, end);
    place = norm(start, intersection);

    const slotPlacement = this.makePlacement(
      [
        ...placeAlong(start, intersection, {
          fromEnd: this.otherSide ? length / 2 : -length / 2,
        }),
        part.thickness / 2,
      ],
      minus(end, start),
    );

    if (!this.otherSide) {
      tenon = tenon.scale(-1, 1).invert();
    }

    part.outside.insertFeature(tenon, segmentIdx, { fromStart: place });
    part.outside.simplify();

    const mortise = makeMortise(length, thickness, spindleDiameter);
    return { path: mortise, slotPlacement };
  }
}

export class GenericThroughAngleSupport extends BaseSlot {
  /**
   * @param {DOMMatrix} toSupportedSurface
   */
  constructor(
    toSupportedSurface,
    supportDepth = 0,
    { spindleDiameter = 6, length = 30, clearance = 0 } = {},
  ) {
    super(0);

    this.spindleDiameter = spindleDiameter;
    this.length = length;
    this.clearance = clearance;
    this.supportDepth = supportDepth;
    this.toSupportedSurface = toSupportedSurface;
  }

  /**
   * @param {FlatPart} part
   * @param {types.Point} start
   * @param {types.Point} end
   * @param {number} place
   */
  materialize(part, start, end, place) {
    const { spindleDiameter, length } = this;
    const { thickness } = part;

    const centerline = projectCenterLine(this.toSupportedSurface, 0, 50);
    const intersection = intersectLines(...centerline, start, end);

    place = norm(start, intersection);
    const [segmentIdx] = part.outside.findSegmentsOnLine(start, end, {
      includedInLine: true,
    });

    const mortise = makeMortise(
      length + this.clearance,
      thickness + this.clearance,
      spindleDiameter,
    );

    // should be looking at the thickness of the other part
    const tenon = makeSupportiveTenon(
      length,
      thickness,
      thickness + this.supportDepth,
      length / 2,
      spindleDiameter,
      3,
    );

    const slotPlacement = this.makePlacement(
      [
        ...placeAlong(start, intersection, { fromEnd: length / 2 }),
        part.thickness / 2,
      ],
      minus(end, start),
    );

    part.outside.insertFeature(tenon, segmentIdx, { fromStart: place });
    return { path: mortise, slotPlacement };
  }
}
