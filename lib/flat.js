// @ts-check
/** @import * as lib from './lib' */
/** @import * as types from '../tools/types' */

import {
  computeVectorAngle,
  minus,
  moveLine,
  norm,
  offsetPolyline,
  placeAlong,
  rotatePoint,
  slideLine,
} from "../tools/2d.js";
import { proj2d } from "../tools/3d.js";
import { Path } from "../tools/path.js";
import { BBox, debugGeometry, w3svg } from "../tools/svg.js";
import { transformPoint3 } from "../tools/transform.js";
import { Part } from "./lib.js";
import { BaseSlot, defaultSlotLayout } from "./slots.js";

export class FlatPart extends Part {
  /**
   * @param {number} thickness
   * @param {Path} outside
   * @param {Path[]} [insides]
   */
  constructor(thickness, outside, insides = []) {
    super();
    this.thickness = thickness;
    this.outside = outside;
    this.insides = insides;
    this._id = Math.random().toString().slice(2);
  }

  async loadMesh() {
    const body = JSON.stringify(this.toJson());
    const r = await fetch("/occ/thicken", { method: "POST", body });
    const file = await r.text();
    this.mesh = file;
  }

  flatInstances() {
    return { [this._id]: { item: this, instances: [new DOMMatrix()] } };
  }

  /**
   * @param {Path[]} insides
   */
  addInsides(...insides) {
    this.insides.push(...insides);
  }

  display() {
    const svg = document.createElementNS(w3svg, "svg");
    svg.setAttribute("transform", "scale(1, -1)");
    svg.id = this._id;
    document.body.appendChild(svg);

    const bbox = new BBox();

    for (const shape of [this.outside, ...this.insides]) {
      const path = document.createElementNS(w3svg, "path");
      path.setAttribute("d", shape.toString());
      path.setAttribute("stroke", "blue");
      path.setAttribute("style", "opacity: 0.8");
      path.setAttribute("fill", "none");

      const totalLength = path.getTotalLength();
      for (let i = 0; i < 1; i += 0.01) {
        const p = path.getPointAtLength(totalLength * i);
        bbox.include([p.x, p.y]);
      }
      svg.appendChild(path);
    }

    svg.setAttribute("viewBox", bbox.toViewBox());
  }

  toJson() {
    const result = {};
    result.outside = this.outside.toString();
    result.insides = this.insides.map((p) => p.toString());
    return result;
  }

}

/**
 * @param {DOMMatrix} coordTransform
 * @param {number} thickness
 * @returns {[types.Point, types.Point]}
 */
function projectCenterLine(coordTransform, thickness) {
  const [start, end] = [
    [0, 0, thickness / 2],
    [0, 0, 0],
  ].map((p) => proj2d(transformPoint3(coordTransform, p)));

  const oriented = rotatePoint(start, end, Math.PI / 2);

  return [
    placeAlong(start, oriented, { fromStart: -1e6 }),
    placeAlong(start, oriented, { fromEnd: 1e6 }),
  ];
}

/**
 * @param {lib.LocatedPart} child1
 * @param {lib.LocatedPart} child2
 * @param {DOMMatrix} planeMatrix
 * @param {number} joinThickness
 */
export function computeJoinShape(child1, child2, planeMatrix, joinThickness) {
  const lines = [];
  for (const { child: part, placement } of [child1, child2]) {
    if (!(part instanceof FlatPart))
      throw new TypeError("cannot join non flat parts");

    const planeToPart = placement.inverse().multiply(planeMatrix);
    const parttp = (p) => proj2d(transformPoint3(planeToPart.inverse(), p));

    const centerline = projectCenterLine(planeToPart, joinThickness);
    const line = part.outside.intersectLine(...centerline);

    if (line.length !== 2) throw new Error();

    lines.push(line.map((p) => parttp([...p.point, part.thickness / 2])));
  }

  // jsdoc doesn't typeguard in different scopes apparently
  if (
    !(child1.child instanceof FlatPart) ||
    !(child2.child instanceof FlatPart)
  )
    throw new TypeError("cannot join non flat parts");

  // correct offset from lines being in the middle of the thickness
  const [[one, two], [three, four]] = [
    offsetPolyline(lines[0], -child1.child.thickness / 2),
    offsetPolyline(lines[1], child2.child.thickness / 2),
  ];

  if (norm(moveLine(one, three, four), two) > 1e-6)
    throw new Error("problem with parrallelism or line orientation");

  const join = Path.fromPolyline([one, two, four, three]);
  return new FlatPart(joinThickness, join);
}

/**
 * @param {lib.LocatedPart} toTab
 * @param {lib.LocatedPart} toSlot
 * @param {BaseSlot[]} [maybeLayout]
 */
export function joinParts(
  { child: toTab, placement: toTabPlacement },
  { child: toSlot, placement: toSlotPlacement },
  maybeLayout,
) {
  if (!(toTab instanceof FlatPart) || !(toSlot instanceof FlatPart))
    throw new TypeError("cannot join non flat parts");

  const tabToSlot = toSlotPlacement.inverse().multiply(toTabPlacement);
  const tts = (p) => proj2d(transformPoint3(tabToSlot, p));

  const centerline = projectCenterLine(tabToSlot.inverse(), toSlot.thickness);

  const side1 = offsetPolyline(centerline, toSlot.thickness / 2);
  const side2 = offsetPolyline(centerline, -toSlot.thickness / 2);

  const segments = [
    ...toTab.outside.findSegmentsOnLine(...side1),
    ...toTab.outside.findSegmentsOnLine(...side2),
  ];

  if (segments.length === 0) throw new Error("couldn't find a segment to slot");

  if (segments.length !== 1)
    throw new Error("can't handle multiple slotting segments yet");

  const [segmentIdx] = segments;

  const segmentLength =
    toTab.outside.getLengthInfo().info[segmentIdx - 1].length;

  const layout = maybeLayout ?? defaultSlotLayout(segmentLength);

  // reversing for conserving the segment idx
  for (const slot of layout.toReversed()) {
    if (maybeLayout) slot.x = slot.x * segmentLength;
    const { path, location } = slot.materialize(toTab, segmentIdx);
    const center = tts([...location, toTab.thickness / 2]);
    toSlot.addInsides(path.translate(center));
  }
}

function cutoutFromCenterline(l1, l2, thickness, spindleDiameter = 6) {
  const length = norm(l1, l2);

  const result = new Path();
  result.moveTo([0, 0]);
  result.lineTo([-thickness / 2, 0]);
  result.arc([-thickness / 2, spindleDiameter], spindleDiameter / 2, 0);
  result.lineTo([-thickness / 2, length]);
  result.lineTo([0, length]);
  result.mirror();

  return result
    .rotate(computeVectorAngle(minus(l2, l1)) + Math.PI / 2)
    .translate(l2);
}

/**
 * @param {lib.LocatedPart} toTab
 * @param {lib.LocatedPart} toSlot
 */
export function halfLapCrossJoin(
  { child: part1, placement: placement1 },
  { child: part2, placement: placement2 },
) {
  if (!(part1 instanceof FlatPart) || !(part2 instanceof FlatPart))
    throw new TypeError("cannot join non flat parts");

  const part1ToPart2 = placement2.inverse().multiply(placement1);
  const p1tp2 = (p) => proj2d(transformPoint3(part1ToPart2, p));
  const p2tp1 = (p) => proj2d(transformPoint3(part1ToPart2.inverse(), p));
  const centerline = projectCenterLine(part1ToPart2, part1.thickness);

  const intersections = part2.outside.intersectLine(...centerline);
  if (intersections.length !== 2) throw new Error();

  const line = intersections.map((p) => p.point);
  const halfOverlapLine = slideLine(...line, -norm(...line) / 2);

  const cutout = cutoutFromCenterline(...halfOverlapLine, part1.thickness);

  part2.outside = part2.outside.booleanDifference(cutout);

  const otherOverlapLine = slideLine(...line, norm(...line) / 2)
    .map((p) => p2tp1([...p, part2.thickness / 2]))
    .toReversed();

  const cutout2 = cutoutFromCenterline(...otherOverlapLine, part2.thickness);
  // debugGeometry(part1.outside, cutout2);

  part1.outside = part1.outside.booleanDifference(cutout2);

  // const side1 = offsetPolyline([start, end], part1.thickness / 2);
  // const side2 = offsetPolyline([start, end], -part1.thickness / 2);

  // if (segments.length === 0) throw new Error("couldn't find a segment to slot");
  //
  // if (segments.length !== 1)
  //   throw new Error("can't handle multiple slotting segments yet");
  //
  // const [segmentIdx] = segments;
  //
  // const segmentLength =
  //   part1.outside.getLengthInfo().info[segmentIdx - 1].length;
  //
  // const layout = maybeLayout ?? defaultSlotLayout(segmentLength);
  //
  // // reversing for conserving the segment idx
  // for (const slot of layout.toReversed()) {
  //   if (maybeLayout) slot.x = slot.x * segmentLength;
  //   const { path, location } = slot.materialize(part1, segmentIdx);
  //   const center = p1tp2([...location, part1.thickness / 2]);
  //   part2.addInsides(path.translate(center));
  // }
}
