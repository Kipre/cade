// @ts-check
/** @import * as lib from './lib' */
/** @import * as types from '../tools/types' */

import {
  computeVectorAngle,
  eps,
  intersectLines,
  minus,
  mult,
  norm,
  offsetPolyline,
  placeAlong,
  rotatePoint,
  slideLine,
} from "../tools/2d.js";
import { cross, minus3, proj2d } from "../tools/3d.js";
import { intersectLineAndCircle } from "../tools/circle.js";
import { Path } from "../tools/path.js";
import { BBox, debugGeometry, w3svg } from "../tools/svg.js";
import { a2m, transformPoint3 } from "../tools/transform.js";
import { nx3, ny3, nz3, x3, y3, z3, zero3 } from "./defaults.js";
import { Assembly, BasePart } from "./lib.js";
import { ConstructionPlywood } from "./materials.js";
import { extrusion } from "./operations.js";
import { Part } from "./part.js";
import { BaseSlot } from "./slots.js";

export class FlatPart extends Part {
  /**
   * @param {string} name
   * @param {number} thickness
   * @param {Path} outside
   * @param {Path[]} [insides]
   */
  constructor(name, thickness, outside, insides = []) {
    const shape = extrusion(a2m(), thickness, outside, ...insides);
    super(name, shape);
    this.material = new ConstructionPlywood(thickness);
    this.thickness = thickness;
    this.outside = outside;
    this.insides = this.shape[0].insides;
    this.pairings = {};
    this.symmetries = /** @type {types.Point3} */ ([NaN, NaN, this.thickness / 2]);
  }

  /**
   * @param {Path} path
   */
  assignOutsidePath(path) {
    this.outside = path;
    this.shape[0].outsides = [path];
  }

  /**
   * @param {types.Point | undefined} [p1]
   * @param {types.Point | undefined} [p2]
   */
  mirror(p1, p2) {
    if (p1 && p2) {
      const [segment] = this.outside.findSegmentsOnLine(p1, p2);
      if (segment == null) {
        debugGeometry(
          [
            p1,
            placeAlong(p1, p2, { fromStart: this.outside.bbox().size() / 2 }),
          ],
          this.outside,
        );
        throw new Error("couldn't find segment from provided mirror line");
      }
      this.assignOutsidePath(this.outside.moveClosingSegment(segment));
    }

    const [l1, l2] = this.outside.mirror();
    const vec = minus(l2, l1);
    const angle = Math.atan2(vec[1], vec[0]);
    const mat = new DOMMatrix()
      .translate(...l1)
      .rotate((angle * 180) / Math.PI)
      .scale(1, -1)
      .rotate((-angle * 180) / Math.PI)
      .translate(...mult(l1, -1));

    // indexed because length changes
    const length = this.insides.length;
    for (let i = 0; i < length; i++) {
      const path = this.insides[i];
      this.insides.push(path.transform(mat).invert());

      const pair = this.pairings[path.toString()];
      if (!pair) continue;

      const { locatedPart: peer, parent } = pair;
      const selfLocation = parent.findChild(this).placement;
      const newPoint = transformPoint3(
        peer.placement
          .inverse()
          .multiply(selfLocation)
          .multiply(mat)
          .multiply(selfLocation.inverse())
          .multiply(peer.placement),
        zero3,
      );
      parent.addChild(peer.child, peer.placement.multiply(a2m(newPoint)));
    }
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
}

/**
 * @param {DOMMatrix} coordTransform
 * @param {number} thickness
 * @returns {[types.Point, types.Point]}
 */
function projectCenterLine(coordTransform, thickness, halfLength = 1e6) {
  const [start, end] = [
    [0, 0, thickness / 2],
    [0, 0, 0],
  ].map((p) => proj2d(transformPoint3(coordTransform, p)));

  const oriented = rotatePoint(start, end, Math.PI / 2);

  return [
    placeAlong(start, oriented, { fromStart: -halfLength }),
    placeAlong(start, oriented, { fromEnd: halfLength }),
  ];
}

/**
 * @param {DOMMatrix} planeDef
 * @param {DOMMatrix} axes
 * @returns {[types.Point, types.Point]}
 */
export function projectPlane(planeDef, axes) {
  const [start, end] = [zero3, z3].map((p) =>
    proj2d(transformPoint3(axes.multiply(planeDef), p)),
  );

  const oriented = rotatePoint(start, end, Math.PI / 2);
  return [start, oriented];
}

/**
 * @param {DOMMatrix} planeMatrix
 * @param {number} joinThickness
 * @param {lib.LocatedPart[]} locatedFlatParts
 */
export function makeShelfOnPlane(
  planeMatrix,
  joinThickness,
  ...locatedFlatParts
) {
  const lines = [];
  for (const { child: part, placement } of locatedFlatParts) {
    if (!(part instanceof FlatPart))
      throw new TypeError("cannot join non flat parts");

    const planeToPart = (placement ?? new DOMMatrix())
      .inverse()
      .multiply(planeMatrix);
    const parttp = (p) => proj2d(transformPoint3(planeToPart.inverse(), p));

    const centerline = projectCenterLine(planeToPart, joinThickness);
    const line = part.outside.intersectLine(...centerline);

    if (line.length !== 2) {
      throw new Error();
    }

    lines.push(line.map((p) => parttp([...p.point, part.thickness / 2])));
  }

  const join = makePolygonFromLines(
    lines,
    locatedFlatParts.map((c) => c.child.thickness),
  );
  return new FlatPart("join", joinThickness, join);
}

/**
 * @param {[types.Point, types.Point][]} lines
 * @param {number[]?} lines
 */
export function makePolygonFromLines(lines, thicknesses) {
  const [first, second] = lines;
  let result = new Path();
  const offsets = [];

  let invert = false;
  const dist = [
    norm(first[0], second[0]),
    norm(first[0], second[1]),
    norm(first[1], second[0]),
    norm(first[1], second[1]),
  ];
  const minDist = Math.min(...dist);

  if (dist[0] === minDist || dist[1] === minDist) result.moveTo(first[1]);
  else result.moveTo(first[0]);

  if (dist[1] === minDist || dist[3] === minDist) invert = true;

  let n1, n2;
  for (let i = 0; i < lines.length - 1; i++) {
    [n1, n2] = lines[i + 1];

    const intersection = intersectLines(...lines[i], ...lines[i + 1]);
    const current = intersection ?? lines[i][invert ? 0 : 1];
    result.lineTo(current);
    offsets.push(thicknesses?.[i] ?? 0);

    invert = norm(current, n2) < norm(current, n1);
    if (intersection) continue;

    if (invert) result.lineTo(n2);
    else result.lineTo(n1);
    offsets.push(0);
  }

  result.lineTo(invert ? n1 : n2);
  offsets.push(thicknesses?.at(-1) ?? 0);

  result.close();
  offsets.push(0);

  if (!result.rotatesClockwise()) {
    result = result.invert();
  }

  result = result.offset(offsets.map((x) => -x / 2));
  return result;
}

/**
 * @param {lib.Assembly} parent
 * @param {FlatPart} toTab
 * @param {FlatPart} toSlot
 * @param {(BaseSlot[] | ((length: number) => BaseSlot[]))[]} layouts
 */
export function joinParts(parent, toTab, toSlot, ...layouts) {
  const toSlotPlacement = parent.findChild(toSlot).placement;
  const toTabPlacement = parent.findChild(toTab).placement;

  const tabToSlot = toSlotPlacement.inverse().multiply(toTabPlacement);

  const centerline = projectCenterLine(tabToSlot.inverse(), toSlot.thickness);

  const side1 = offsetPolyline(centerline, toSlot.thickness / 2);
  const side2 = offsetPolyline(centerline, -toSlot.thickness / 2);

  const segments = [
    ...toTab.outside.findSegmentsOnLine(...side1),
    ...toTab.outside.findSegmentsOnLine(...side2),
  ];

  if (segments.length === 0) {
    console.error("couldn't find a segment to slot");
    return;
  }

  for (let i = segments.length - 1; i >= 0; i--) {
    const segmentIdx = segments[i];

    const segmentLength =
      toTab.outside.getLengthInfo().info[segmentIdx - 1].length;

    const layoutIsDefault = !Array.isArray(layouts[i]);
    const layout = layoutIsDefault ? layouts[i](segmentLength) : layouts[i];

    // reversing for conserving the segment idx
    for (const slot of layout.toReversed()) {
      let place = slot.x;
      if (!layoutIsDefault) place = slot.x * segmentLength;

      const { path, fastener, slotPlacement } = slot.materializeOuter(
        toTab,
        segmentIdx,
        place,
      );

      const m = tabToSlot.multiply(slotPlacement);

      const centerOnOtherPart = transformPoint3(m, zero3);
      const center2d = proj2d(centerOnOtherPart);
      const center = [...center2d, toSlot.thickness / 2];
      const dir = minus(proj2d(transformPoint3(m, x3)), center2d);

      const rotation = computeVectorAngle(dir);
      const locatedPath = path.rotate(rotation).translate(center2d);
      toSlot.addInsides(locatedPath);

      if (fastener) {
        const zee = minus3(transformPoint3(m, z3), centerOnOtherPart);
        const why = minus3(transformPoint3(m, y3), centerOnOtherPart);

        const fastenerLocation = toSlotPlacement
          .multiply(a2m(center, zee, why))
          .multiply(a2m([0, 0, -toSlot.thickness / 2]));

        const locatedPart = parent.addChild(fastener, fastenerLocation);
        toSlot.pairings[locatedPath.toString()] = { locatedPart, parent };
      }
    }
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
  joinTheOtherWay = false,
) {
  if (!(part1 instanceof FlatPart) || !(part2 instanceof FlatPart))
    throw new TypeError("cannot join non flat parts");

  const part1ToPart2 = placement2.inverse().multiply(placement1);
  const p2tp1 = (p) => proj2d(transformPoint3(part1ToPart2.inverse(), p));
  const centerline = projectCenterLine(part1ToPart2, part1.thickness);

  const intersections = part2.outside.intersectLine(...centerline);
  if (intersections.length !== 2) throw new Error();

  const line = intersections.map((p) => p.point);

  let halfOverlapLine;
  let otherOverlapLine;

  const slideDistance = norm(...line) / 2;

  if (joinTheOtherWay) {
    halfOverlapLine = slideLine(...line, slideDistance).toReversed();
    otherOverlapLine = slideLine(...line, -slideDistance).map((p) =>
      p2tp1([...p, part2.thickness / 2]),
    );
  } else {
    halfOverlapLine = slideLine(...line, -slideDistance);
    otherOverlapLine = slideLine(...line, slideDistance)
      .map((p) => p2tp1([...p, part2.thickness / 2]))
      .toReversed();
  }

  const cutout = cutoutFromCenterline(...halfOverlapLine, part1.thickness);

  part2.outside = part2.outside.booleanDifference(cutout);

  const cutout2 = cutoutFromCenterline(...otherOverlapLine, part2.thickness);
  part1.outside = part1.outside.booleanDifference(cutout2);
}

/**
 * @param {Path} path
 * @param {types.Point} nextPoint
 * @param {number} radius
 */
export function spindleClearedLineTo(
  path,
  nextPoint,
  radius,
  onNextLine = false,
) {
  const [, lastPoint, type, p] = path.getSegmentAt(-1);
  if (type !== "lineTo") throw new Error("needs a line");

  function getIntermediatePoint(lp, p, np, radius) {
    const angle =
      Math.atan2(...minus(np, p).toReversed()) -
      Math.atan2(...minus(p, lp).toReversed());

    const center = rotatePoint(
      p,
      placeAlong(lp, p, { fromEnd: radius }),
      (Math.sign(angle) * Math.PI) / 2,
    );

    const roots = intersectLineAndCircle(p, np, center, radius);
    const root = norm(roots[0], p) < eps ? roots[1] : roots[0];
    const sweep = angle > 0 ? 1 : 0;
    return [root, sweep];
  }

  if (!onNextLine) {
    const [root, sweep] = getIntermediatePoint(lastPoint, p, nextPoint, radius);
    path.arc(root, radius, sweep);
    path.lineTo(nextPoint);
    return;
  }

  const [root, sweep] = getIntermediatePoint(nextPoint, p, lastPoint, radius);
  path.controls.at(-1)[1] = root;
  path.arc(p, radius, sweep ? 0 : 1);
  path.lineTo(nextPoint);
}

/**
 * @param {Assembly} parent
 * @param {BasePart} child
 * @param {DOMMatrix} transform
 */
export function cloneChildrenWithTransform(parent, child, transform) {
  const locatedParts = parent.findDirectChildren(child);
  for (const { child, placement } of locatedParts) {
    parent.addChild(child, transform.multiply(placement));
  }
}

/**
 * @param {lib.LocatedPart} located1
 * @param {lib.LocatedPart} located2
 */
export function findFlatPartIntersection(located1, located2, part1Top = false, part2Top = false) {
  const mat1 = located1.placement;
  const mat2 = located2.placement;

  const crossplane = a2m(zero3, cross(
    transformPoint3(mat1, z3, true),
    transformPoint3(mat2, z3, true),
  ));

  if (part1Top) mat1.translateSelf(0, 0, located1.child.thickness);
  if (part2Top) mat2.translateSelf(0, 0, located2.child.thickness);

  let hinge = intersectLines(
    ...projectPlane(mat1, crossplane),
    ...projectPlane(mat2, crossplane)
  );

  if (hinge == null) throw new Error("could not intersect flat parts");

  return transformPoint3(crossplane, [...hinge, 0]);
}
