// @ts-check
/** @import * as types from '../tools/types' */

import {
  computeVectorAngle,
  minus,
  norm,
  offsetPolyline,
  placeAlong,
  pointToLine,
  rotatePoint,
} from "../tools/2d.js";
import { proj2d } from "../tools/3d.js";
import { Path } from "../tools/path.js";
import { debugGeometry } from "../tools/svg.js";
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

/**
 * @deprecated
 */
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

    const result = this.materialize(part, segmentIdx, place ?? this.x);

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

export class NoSegmentIndexBaseSlot {
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

    const mortise = makeMortise(length, thickness, spindleDiameter);

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

export class HornSlot extends NoSegmentIndexBaseSlot {
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

export class TroughAngleSupport extends BaseSlot {
  /**
   * @param {number} x
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
   * @param {number} segmentIdx
   * @param {number} place
   */
  materialize(part, segmentIdx, place) {
    const { spindleDiameter } = this;
    const { thickness } = part;

    const placement = this.partToSupport.placement;
    const third = this.partToSupport.child;
    const selfPlacement = this.locatedEdgePart.placement;

    const planeToPart = placement.inverse().multiply(selfPlacement);
    const parttp = (p) => proj2d(atm3(planeToPart.inverse(), p));

    const centerline = projectCenterLine(planeToPart, part.thickness, 50);
    const line = third.outside.intersectLine(...centerline);
    const pts = line.map((p) => parttp([...p.point, part.thickness / 2]));

    const bbox = part.outside.bbox();
    const ordered =
      norm(pts[0], bbox.center()) < norm(pts[1], bbox.center())
        ? pts
        : pts.toReversed();

    const [, s1, , s2] = part.outside.getSegmentAt(segmentIdx);

    const offset = offsetPolyline(
      ordered,
      ((this.otherSide ? -1 : 1) * third.thickness) / 2,
    );
    const off = 20;
    const p3 = placeAlong(ordered[1], offset[1], { fromEnd: off });
    const p4 = placeAlong(ordered[0], offset[0], { fromEnd: norm(...pts) });
    const p5 = pointToLine(p4, s1, s2);
    const p1 = pointToLine(offset[0], s1, s2);
    const p0 = placeAlong(p1, p5, { fromStart: -10 });
    const p6 = placeAlong(p1, p5, { fromEnd: 10 });
    const angleCenter = placeAlong(p1, p5, { fraction: 0.5 });

    const length = norm(p1, p5);

    // not efficient but whatever
    let angle = new Path();
    angle.moveTo(p0);
    angle.lineTo(p1);
    spindleClearedLineTo(angle, offset[0], spindleDiameter / 2, true);
    angle.lineTo(offset[1]);
    angle.lineTo(p3);
    angle.lineTo(p4);
    angle.lineTo(p5);
    spindleClearedLineTo(angle, p6, spindleDiameter / 2);
    if (!this.otherSide) angle = angle.invert();

    const path = part.outside;

    path.insert(segmentIdx, angle);
    path.simplify();

    const slotPlacement = this.makePlacement(
      [...angleCenter, part.thickness / 2],
      minus(s2, s1),
    );

    const mortise = makeMortise(length, thickness, spindleDiameter);
    return { path: mortise, slotPlacement };
  }
}
