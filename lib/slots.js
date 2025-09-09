// @ts-check

import {
  computeVectorAngle,
  minus,
  placeAlong,
  rotatePoint,
} from "../tools/2d.js";
import { Path } from "../tools/path.js";
import { FlatPart } from "./flat.js";

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
   * @param {number?} place
   */
  materialize(part, segmentIdx, place) {}
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
   * @param {number?} place
   */
  materialize(part, segmentIdx, place) {
    const { spindleDiameter, length } = this;
    const { thickness } = part;

    // not efficient but whatever
    const mortise = new Path();
    mortise.moveTo([0, -thickness / 2]);
    mortise.lineTo([spindleDiameter - length / 2, -thickness / 2]);
    mortise.arc([-length / 2, -thickness / 2], spindleDiameter / 2, 0);
    mortise.lineTo([-length / 2, 0]);
    mortise.mirror([0, 0]);
    mortise.mirror();

    const tenon = new Path();
    tenon.moveTo([-spindleDiameter - length / 2, 0]);
    tenon.arc([-length / 2, 0], spindleDiameter / 2, 1);
    tenon.lineTo([-length / 2, thickness]);
    tenon.mirror([0, 0], [0, 1]);

    const path = part.outside;
    const start = path.evaluate(segmentIdx, 0);
    const end = path.evaluate(segmentIdx, 1);

    const location = placeAlong(start, end, { fromStart: place ?? this.x });
    const rotation = computeVectorAngle(minus(end, start));
    path.insert(segmentIdx, tenon.rotate(rotation).translate(location));

    return { path: mortise.rotate(rotation), location };
  }
}

export class CylinderNutFastener extends BaseSlot {
  /**
   * @param {number} x
   */
  constructor(x, offset = 10) {
    super(x);
    this.offset = offset;

    const holeRadius = 7 / 2;
    this.nutRadius = 10.2 / 2;

    this.boltHole = Path.makeCircle(holeRadius);
    this.nutHole = Path.makeCircle(this.nutRadius);
  }

  /**
   * @param {FlatPart} part
   * @param {number} segmentIdx
   * @param {number?} place
   */
  materialize(part, segmentIdx, place) {
    const path = part.outside;
    const start = path.evaluate(segmentIdx, 0);
    const end = path.evaluate(segmentIdx, 1);
    const location = placeAlong(start, end, { fromStart: place ?? this.x });
    const center = rotatePoint(
      location,
      placeAlong(start, location, { fromEnd: this.offset + this.nutRadius }),
      -Math.PI / 2,
    );

    part.addInsides(this.nutHole.translate(center));
    return { path: this.boltHole, location };
  }
}

/**
 * @param {number} length
 */
export function defaultSlotLayout(length) {
  const slots = [];

  const nbFasteners = Math.ceil(length / 250);
  const offset = 70;
  const fastenerPitch = (length - 2 * offset) / (nbFasteners - 1);

  let lastLocation = offset;

  slots.push(new CylinderNutFastener(lastLocation));

  for (let i = 1; i < nbFasteners; i++) {
    const location = offset + i * fastenerPitch;

    slots.push(new TenonMortise((lastLocation + location) / 2));
    slots.push(new CylinderNutFastener(location));

    lastLocation = location;
  }

  return slots;
}
