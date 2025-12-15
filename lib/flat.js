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
import {
  a2m,
  atm,
  computeTransformFromPoints,
  linearizationMatrix,
  transformPoint3,
} from "../tools/transform.js";
import { keyToComparison, keyToComparison2d } from "../tools/utils.js";
import { nx3, ny3, nz3, x2, x3, y2, y3, z3, zero2, zero3 } from "./defaults.js";
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
export function projectCenterLine(coordTransform, thickness, halfLength = 1e6) {
  const [start, end] = [
    [0, 0, thickness / 2],
    [0, 0, -1],
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
 * @param {lib.Assembly} parent
 * @param {FlatPart} edgePart
 * @param {FlatPart} otherPart
 * @param {(BaseSlot[] | ((length: number) => BaseSlot[]))[]} layouts
 */
export function joinParts(parent, edgePart, otherPart, ...layouts) {
  const otherInstances = [...parent.findChildren(otherPart)];
  const edgeInstances = [...parent.findChildren(edgePart)];
  // const edgePlacement = parent.findChild(edgePart).placement;
  const edgePlacement = edgeInstances[0].placement;
  const otherPlacement = otherInstances[0].placement;

  const edgeToOther = otherPlacement.inverse().multiply(edgePlacement);

  const [c1, c2] = projectCenterLine(edgeToOther, edgePart.thickness);
  const intersections = otherPart.outside.intersectLine(c1, c2);
  if (intersections.length % 2 !== 0)
    throw new Error("expected an even number of intersections");

  const v1 = normalize(minus(c2, c1));
  const keyFunc = (int) => dot(minus(int.point, c1), v1);
  const sortedIntersections = intersections.toSorted(keyToComparison(keyFunc));

  const segments = [];

  for (let i = 0; i < intersections.length; i += 2) {
    const line = sortedIntersections.slice(i, i + 2);

    const centerline = line.map((p) =>
      transformPoint3(edgeToOther.inverse(), [
        ...p.point,
        otherPart.thickness / 2,
      ]),
    );

    const side1 = offsetPolyline(centerline, otherPart.thickness / 2);
    const side2 = offsetPolyline(centerline, -otherPart.thickness / 2);

    for (const side of [side1, side2]) {
      for (const idx of edgePart.outside.findSegmentsOnLine(...side, true)) {
        // normalize coordinates to find overlapping segments
        const [, p1, , p2] = edgePart.outside.getSegmentAt(idx);
        const [s1, s2] = side;
        const m = linearizationMatrix(p1, p2);
        let [start, end] = [atm(m, s1)[0], atm(m, s2)[0]].toSorted(
          keyToComparison((v) => v),
        );
        start = Math.max(start, 0);
        end = Math.min(end, 1);
        if (Math.abs(end - start) < eps) continue;
        segments.push({ idx, start, end, startInSpace: p1 });
      }
    }
  }

  if (segments.length === 0) {
    const err = new Error("couldn't find a segment to slot");
    console.error(err);
    return;
  }

  if (segments.length !== layouts.length) {
    const err = new Error(
      `mismatch between nb of layouts and number of segments (found ${segments.length} segments)`,
    );
    console.error(err);
    return;
  }

  // ensure mapping consistency
  segments.sort(keyToComparison2d((v) => v.startInSpace));

  for (let i = segments.length - 1; i >= 0; i--) {
    const { idx, start, end } = segments[i];

    const width = end - start;
    const segmentLength = edgePart.outside.getLengthInfo().info[idx - 1].length;

    const layoutIsDefault = !Array.isArray(layouts[i]);
    const layout = layoutIsDefault
      ? layouts[i](width * segmentLength)
      : layouts[i];

    // reversing for conserving the segment idx
    for (const slot of layout.toReversed()) {
      let place = start * segmentLength + slot.x;
      if (!layoutIsDefault)
        place = (start + slot.x * (end - start)) * segmentLength;

      const { path, booleanDifference, fastener, slotPlacement } =
        slot.materializeOuter(edgePart, idx, place);

      for (const instance of edgeInstances) {
        const edgeToOther = otherPlacement
          .inverse()
          .multiply(instance.placement);
        const m = edgeToOther.multiply(slotPlacement);
        const centerOnOtherPart = transformPoint3(m, zero3);
        const center2d = proj2d(centerOnOtherPart);
        const center = [...center2d, otherPart.thickness / 2];
        const dir = minus(proj2d(transformPoint3(m, x3)), center2d);

        const rotation = computeVectorAngle(dir);
        const locatedPath = path.rotate(rotation).translate(center2d);

        if (booleanDifference)
          otherPart.assignOutsidePath(
            otherPart.outside.booleanDifference(locatedPath),
          );
        else otherPart.addInsides(locatedPath);

        if (!fastener) continue;

        const zee = minus3(transformPoint3(m, z3), centerOnOtherPart);
        const why = minus3(transformPoint3(m, y3), centerOnOtherPart);

        const fastenerLocation = otherPlacement
          .multiply(a2m(center, zee, why))
          .multiply(a2m([0, 0, -otherPart.thickness / 2]));

        const locatedPart = parent.addChild(fastener, fastenerLocation);
        otherPart.pairings.push({ ...locatedPart, parent });
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
  const m = linearizationMatrix(l1, l2);
  for (const [, lp, type, p] of flatPart.outside.iterateOverSegments()) {
    if (type !== "lineTo") continue;

    const start = atm(m, lp);
    const end = atm(m, p);
    if (Math.abs(start[1] - end[1]) > eps || start[0] > end[0]) continue;

    const zee = rotatePoint(lp, p, Math.PI / 2);
    return a2m([...lp, 0], [...minus(zee, lp), 0]);
  }

  debugGeometry([l1, placeAlong(l1, l2, {fraction: 10})], flatPart.outside);
  throw new Error("couldn't find the segment to make placement");
}
