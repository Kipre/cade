// @ts-check
/** @import * as lib from './lib' */
/** @import * as types from '../tools/types' */

import {
  computeVectorAngle,
  eps,
  intersectLines,
  minus,
  dot,
  mult,
  norm,
  normalize,
  offsetPolyline,
  placeAlong,
  rotatePoint,
  slideLine,
  pointToLine,
  polygonCenter,
  areOnSameLine,
} from "../tools/2d.js";
import {
  cross,
  minus3,
  norm3,
  normalize3,
  plus3,
  proj2d,
} from "../tools/3d.js";
import { intersectLineAndCircle, normalizeAngle } from "../tools/circle.js";
import { Path } from "../tools/path.js";
import { convexHull } from "../tools/operations.js";
import { BBox, debugGeometry, w3svg } from "../tools/svg.js";
import { a2m, transformPoint3 } from "../tools/transform.js";
import { keyToComparison } from "../tools/utils.js";
import { nx3, ny3, nz3, x3, y3, z3, zero2, zero3 } from "./defaults.js";
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
    this.symmetries = /** @type {types.Point3} */ ([
      NaN,
      NaN,
      this.thickness / 2,
    ]);
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
    }

    for (const pair of this.getPairings()) {
      const { parent, ...peer } = pair;
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
      for (let i = 0; i < 1; i += 0.05) {
        const p = path.getPointAtLength(totalLength * i);
        bbox.include([p.x, p.y]);
      }
      svg.appendChild(path);
    }

    svg.setAttribute("viewBox", bbox.toViewBox());
  }

  /**
   * @returns {FlatPart}
   */
  clone() {
    const name = `cloned ${this.name}`;
    return new FlatPart(
      name,
      this.thickness,
      this.outside.clone(),
      this.insides.map((x) => x.clone()),
    );
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
 * @param {{joinOffset?: number, woodThickness: number, zoneIndex?: number, zonePoint?: types.Point}} options
 * @param {lib.LocatedPart[]} locatedFlatParts
 */
export function makeShelfOnPlane(planeMatrix, options, ...locatedFlatParts) {
  const lines = [];
  const thicknesses = [];
  for (const { child: part, placement } of locatedFlatParts) {
    if (!(part instanceof FlatPart))
      throw new TypeError("cannot join non flat parts");

    const planeToPart = (placement ?? a2m()).inverse().multiply(planeMatrix);
    const parttp = (p) => proj2d(transformPoint3(planeToPart.inverse(), p));

    const centerline = projectCenterLine(planeToPart, options.woodThickness);
    const line = part.outside.intersectLine(...centerline);

    // normal case: intersection found
    if (line.length === 2) {
      lines.push(line.map((p) => parttp([...p.point, part.thickness / 2])));
      thicknesses.push(part.thickness);
      continue;
    }

    // second case: edge
    const l1 = proj2d(transformPoint3(planeToPart, zero3));
    const l2 = proj2d(transformPoint3(planeToPart, plus3(x3, y3)));
    const idx = part.outside.findSegmentsOnLine(l1, l2, true)[0];
    if (line.length === 0 && idx != null) {
      const [, p1, , p2] = part.outside.getSegmentAt(idx);
      lines.push([
        parttp([...p1, part.thickness / 2]),
        parttp([...p2, part.thickness / 2]),
      ]);
      thicknesses.push(-part.thickness - 2 * (options.joinOffset ?? 0));
      continue;
    }

    debugGeometry(...lines);
    throw new Error(`couldn't find how to use ${part.name} to make shelf`);
  }

  function getLineThickness(line) {
    const idx = lines.findIndex(
      ([l1, l2]) =>
        areOnSameLine(l1, l2, line[0]) && areOnSameLine(l1, l2, line[0]),
    );
    if (idx === -1) {
      console.log(line);
      throw new Error("thickness not found");
    }
    return thicknesses[idx] / 2;
  }

  const zones = findConvexZones(lines, getLineThickness);
  let zone = zones[options.zoneIndex ?? 0];
  if (options.zonePoint != null) {
    zone = zones.toSorted(
      keyToComparison((z) =>
        norm(polygonCenter(convexHull(...z)), options.zonePoint),
      ),
    )[0];
  }
  return makePolygonFromLines(zone, getLineThickness);
}

/**
 * @param {[types.Point, types.Point][]} originalLines
 * @param {(arg0: [types.Point, types.Point]) => number} getLineThickness
 */
export function findConvexZones(originalLines, getLineThickness) {
  const processedLines = new Set();
  const zones = [originalLines];

  let i = 0;
  while (i < zones.length) {
    const lines = zones[i];
    let inc = 1;
    for (const line of lines) {
      if (processedLines.has(line.toString())) continue;
      processedLines.add(line.toString());

      const [l1, l2] = line;
      const up = [];
      const down = [];
      for (const otherLine of lines) {
        const [o1, o2] = otherLine;
        if (line === otherLine) continue;
        const sign1 = cross(minus(l1, l2), minus(o1, l2))[2];
        const sign2 = cross(minus(l1, l2), minus(o2, l2))[2];
        const halfThickness = getLineThickness(line);

        if (sign1 >= 0 && sign2 >= 0) {
          up.push(otherLine);
        } else if (sign1 < 0 && sign2 < 0) {
          down.push(otherLine);
        } else if (sign1 >= 0 && sign2 < 0) {
          const int = intersectLines(o1, o2, ...line);
          up.push([o1, placeAlong(o1, int, { fromEnd: -halfThickness })]);
          down.push([placeAlong(int, o2, { fromStart: halfThickness }), o2]);
        } else if (sign1 < 0 && sign2 >= 0) {
          const int = intersectLines(o1, o2, ...line);
          down.push([o1, placeAlong(o1, int, { fromEnd: -halfThickness })]);
          up.push([placeAlong(int, o2, { fromStart: halfThickness }), o2]);
        }
      }

      if (up.length && down.length) {
        zones.splice(i, 1, [...down, line], [...up, line]);
        inc = 0;
        break;
      }
    }
    i += inc;
  }
  return zones;
}

/**
 * @param {[types.Point, types.Point][]} lines
 * @param {(arg0: [types.Point, types.Point]) => number} getLineThickness
 */
export function makePolygonFromLines(lines, getLineThickness) {
  const firstHull = convexHull(...lines);
  const center = polygonCenter(firstHull);
  const offsetLines = [];
  for (const line of lines) {
    const off = getLineThickness(line);
    const offPlus = offsetPolyline(line, off);
    const toPlus = norm(center, pointToLine(center, ...offPlus));
    const offMinus = offsetPolyline(line, -off);
    const toMinus = norm(center, pointToLine(center, ...offMinus));

    if (off > 0 === toPlus > toMinus) offsetLines.push(offMinus);
    else offsetLines.push(offPlus);
  }

  const result = Path.fromPolyline(convexHull(...offsetLines));
  result.simplify();
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

  const [c1, c2] = projectCenterLine(tabToSlot, toTab.thickness);
  const intersections = toSlot.outside.intersectLine(c1, c2);
  if (intersections.length % 2 !== 0)
    throw new Error("expected an even number of intersections");

  const v1 = normalize(minus(c2, c1));
  const keyFunc = (int) => dot(minus(int.point, c1), v1);
  const sortedIntersections = intersections.toSorted(keyToComparison(keyFunc));

  const segments = [];

  for (let i = 0; i < intersections.length; i += 2) {
    const line = sortedIntersections.slice(i, i + 2);

    const centerline = line.map((p) =>
      transformPoint3(tabToSlot.inverse(), [...p.point, toSlot.thickness / 2]),
    );

    const side1 = offsetPolyline(centerline, toSlot.thickness / 2);
    const side2 = offsetPolyline(centerline, -toSlot.thickness / 2);

    segments.push(
      ...toTab.outside.findSegmentsOnLine(...side1, true),
      ...toTab.outside.findSegmentsOnLine(...side2, true),
    );
  }

  if (segments.length === 0) {
    const err = new Error("couldn't find a segment to slot");
    console.error(err);
    return;
  }

  if (segments.length !== layouts.length) {
    const err = new Error(
      "mismatch between nb of layouts and number of segments",
    );
    console.error(err);
    console.error(segments.length, layouts.length);
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

      const { path, booleanDifference, fastener, slotPlacement } =
        slot.materializeOuter(toTab, segmentIdx, place);

      const m = tabToSlot.multiply(slotPlacement);

      const centerOnOtherPart = transformPoint3(m, zero3);
      const center2d = proj2d(centerOnOtherPart);
      const center = [...center2d, toSlot.thickness / 2];
      const dir = minus(proj2d(transformPoint3(m, x3)), center2d);

      const rotation = computeVectorAngle(dir);
      const locatedPath = path.rotate(rotation).translate(center2d);
      if (booleanDifference)
        toSlot.assignOutsidePath(toSlot.outside.booleanDifference(locatedPath));
      else toSlot.addInsides(locatedPath);

      if (fastener) {
        const zee = minus3(transformPoint3(m, z3), centerOnOtherPart);
        const why = minus3(transformPoint3(m, y3), centerOnOtherPart);

        const fastenerLocation = toSlotPlacement
          .multiply(a2m(center, zee, why))
          .multiply(a2m([0, 0, -toSlot.thickness / 2]));

        const locatedPart = parent.addChild(fastener, fastenerLocation);
        toSlot.pairings.push({ ...locatedPart, parent });
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
  part2.assignOutsidePath(part2.outside.booleanDifference(cutout));

  const cutout2 = cutoutFromCenterline(...otherOverlapLine, part2.thickness);
  part1.assignOutsidePath(part1.outside.booleanDifference(cutout2));
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
    const angle = normalizeAngle(
      Math.atan2(...minus(np, p).toReversed()) -
      Math.atan2(...minus(p, lp).toReversed()),
    );

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
 * @param {Path} path
 * @param {types.Point} nextPoint
 * @param {number} radius
 */
export function spindleCleared2LineTo(path, np, radius) {
  const [, lp, type, p] = path.getSegmentAt(-1);
  if (type !== "lineTo") throw new Error("needs a line");

  const angle = normalizeAngle(
    Math.atan2(...minus(np, p).toReversed()) -
    Math.atan2(...minus(lp, p).toReversed()),
  );

  const center = rotatePoint(
    p,
    placeAlong(lp, p, { fromEnd: radius }),
    Math.PI + angle / 2,
  );

  const roots1 = intersectLineAndCircle(lp, p, center, radius);
  const p0 = norm(roots1[0], lp) < norm(roots1[1], lp) ? roots1[0] : roots1[1];
  path.controls.at(-1)[1] = p0;

  const roots2 = intersectLineAndCircle(np, p, center, radius);
  const p1 = norm(roots2[0], np) < norm(roots2[1], np) ? roots2[0] : roots2[1];
  const sweep = angle > 0 ? 0 : 1;
  path.arc(p1, radius, sweep);

  path.lineTo(np);
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
 * @param {Assembly} parent
 * @param {BasePart} child
 * @param {types.Point3} normal
 */
export function cloneAndMirrorChildren(parent, child, normal) {
  const locatedParts = parent.findDirectChildren(child);
  const temp = new Assembly("temp");
  for (const { child, placement } of locatedParts)
    temp.addChild(child, placement);

  const mirrored = temp.mirror(normal);
  for (const { child, placement } of mirrored.children)
    parent.addChild(child, placement);
}

/**
 * @param {lib.LocatedPart} located1
 * @param {lib.LocatedPart} located2
 */
export function findFlatPartIntersection(
  located1,
  located2,
  part1Top = false,
  part2Top = false,
) {
  let mat1 = located1.placement;
  let mat2 = located2.placement;

  const crossplane = a2m(
    zero3,
    cross(transformPoint3(mat1, z3, true), transformPoint3(mat2, z3, true)),
  );

  if (part1Top) mat1 = mat1.translate(0, 0, located1.child.thickness);
  if (part2Top) mat2 = mat2.translate(0, 0, located2.child.thickness);

  const hinge = intersectLines(
    ...projectPlane(mat1, crossplane),
    ...projectPlane(mat2, crossplane),
  );

  if (hinge == null) throw new Error("could not intersect flat parts");

  return transformPoint3(crossplane, [...hinge, 0]);
}

/**
 * @param {Assembly} parent
 * @param {FlatPart} partToTrim
 * @param {FlatPart} otherPart
 */
export function trimFlatPartWithAnother(
  parent,
  partToTrim,
  otherPart,
  other = false,
) {
  const otherPlacement = parent.findChild(otherPart).placement;
  const toTrimPlacement = parent.findChild(partToTrim).placement;
  const plane = toTrimPlacement.inverse().multiply(otherPlacement);

  const l1 = proj2d(transformPoint3(plane, zero3));
  const l2 = proj2d(transformPoint3(plane, plus3(x3, y3)));

  partToTrim.assignOutsidePath(partToTrim.outside.cutOnLine(l1, l2, other));
}

export function getFacePlacement(flatPart, l1, l2) {
  for (const [i, lp, type, p] of flatPart.outside.iterateOverSegments()) {
    if (type !== "lineTo") continue;

    if (cross(minus(l2, l1), minus(p, lp))[2] > eps) continue;
    const zee = rotatePoint(lp, p, Math.PI / 2);

    return a2m([...lp, 0], [...minus(zee, lp), 0]);
  }
  throw new Error("couldn't find the segment to make placement");
}
