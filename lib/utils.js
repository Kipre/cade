// @ts-check
/** @import * as types from '../tools/types' */


import { Path } from "../tools/path.js";
import { a2m } from "../tools/transform.js";
import { Assembly, FlatPart } from "./lib.js";

const arrowLength = 500

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
zee.moveTo([-7, 10])
zee.lineTo([5, 10])
zee.lineTo([-7, -10])
zee.lineTo([7, -10])
zee = zee.thickenAndClose(2);
zee = zee.translate([arrowLength - 25, 0]);

const exArrow = new FlatPart(arrow, [ex]);
const whyArrow = new FlatPart(arrow, [why]);
const zeeArrow = new FlatPart(arrow, [zee]);

export const axesArrows = new Assembly("axes arrows");
axesArrows.addChild(exArrow, a2m());
axesArrows.addChild(whyArrow, a2m(null, null, [0, 1, 0]));
axesArrows.addChild(zeeArrow, a2m(null, [1, 0, 0], [0, 0, 1]));

const zero3 = /** @type {types.Point3} */ ([0, 0, 0]);
const x3 = /** @type {types.Point3} */ ([1, 0, 0]);
const y3 = /** @type {types.Point3} */ ([0, 1, 0]);
const z3 = /** @type {types.Point3} */ ([0, 0, 1]);
const nx3 = /** @type {types.Point3} */ ([-1, 0, 0]);
const ny3 = /** @type {types.Point3} */ ([0, -1, 0]);
const nz3 = /** @type {types.Point3} */ ([0, 0, -1]);


export { zero3, x3, y3, z3, nx3, ny3, nz3 };
