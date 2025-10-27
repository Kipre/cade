// @ts-check
/** @import * as types from '../tools/types' */

import { proj2d } from "../tools/3d.js";
import { Path } from "../tools/path.js";
import { a2m, transformPoint3 } from "../tools/transform.js";
import { zero3 } from "./defaults.js";
import { FlatPart } from "./flat.js";
import { Assembly, BasePart } from "./lib.js";
import { multiExtrusion } from "./operations.js";

const arrowLength = 500;

const arrow = new Path();
arrow.moveTo([0, 0]);
arrow.lineTo([0, 25]);
arrow.lineTo([arrowLength, 25]);
arrow.lineTo([arrowLength, 50]);
arrow.lineTo([arrowLength + 50, 0]);
arrow.mirror();

let ex = new Path();
ex.moveTo([-1, 0]);
ex.lineTo([-7, 10]);
ex.lineTo([-5, 10]);
ex.lineTo([0, 1]);
ex.mirror([0, 0], [0, 1]);
ex.mirror([0, 0], [1, 0]);
ex = ex.translate([arrowLength - 25, 0]);

let why = new Path();
why.moveTo([-1, -10]);
why.lineTo([-1, 0]);
why.lineTo([-7, 10]);
why.lineTo([-5, 10]);
why.lineTo([0, 1]);
why.mirror([0, 0], [0, 1]);
why.close();
why = why.translate([arrowLength - 25, 0]);

let zee = new Path();
zee.moveTo([-7, 10]);
zee.lineTo([5, 10]);
zee.lineTo([-7, -10]);
zee.lineTo([7, -10]);
zee = zee.thickenAndClose(2);
zee = zee.translate([arrowLength - 25, 0]);

const exArrow = new FlatPart("X", 10, arrow, [ex]);
const whyArrow = new FlatPart("Y", 10, arrow, [why]);
const zeeArrow = new FlatPart("Z", 10, arrow, [zee]);

export const axesArrows = new Assembly("axes arrows");
axesArrows.addChild(exArrow, a2m());
axesArrows.addChild(whyArrow, a2m(null, null, [0, 1, 0]));
axesArrows.addChild(zeeArrow, a2m(null, [1, 0, 0], [0, 0, 1]));

/**
 * @param {DOMMatrix} centerPlacement
 * @param {number} size
 * @param {number} depth
 * @param {types.Point} position
 */
export function makeFourDrills(centerPlacement, size, depth, position) {
  const paths = [];
  const threadHole = Path.makeCircle(size / 2);

  for (const xSign of [1, -1]) {
    for (const ySign of [1, -1]) {
      paths.push(
        threadHole.translate([xSign * position[0], ySign * position[1]]),
      );
    }
  }

  return multiExtrusion(
    centerPlacement.translate(0, 0, depth),
    2 * depth,
    ...paths,
  );
}

/**
 * @param {Assembly} parent
 * @param {BasePart} flatPart
 * @param {BasePart} otherPart
 */
export function locateOriginOnFlatPart(parent, flatPart, otherPart) {
  const place1 = parent.findChild(flatPart).placement;
  const place2 = parent.findChild(otherPart).placement;

  const point = proj2d(transformPoint3(place1.inverse().multiply(place2), zero3));
  return point
}

