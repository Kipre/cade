// @ts-check
/** @import * as types from '../tools/types' */

import {
  eps,
  norm,
  offsetPolyline,
  placeAlong,
  pointInsideLineBbox,
} from "../tools/2d.js";
import { proj2d } from "../tools/3d.js";
import { Path } from "../tools/path.js";
import { debugGeometry } from "../tools/svg.js";
import { a2m, atm, transformPoint3 } from "../tools/transform.js";
import { keyToComparison } from "../tools/utils.js";
import { nx3, nz3, y3, z3, zero3 } from "./defaults.js";
import { FlatPart } from "./flat.js";
import { Assembly, BasePart } from "./lib.js";
import { Part } from "./part.js";
import { locateOriginOnFlatPart, locateOriginsOnFlatPart } from "./utils.js";

/**
 * @typedef {{top: BasePart, bottom: BasePart}} FastenerKit
 * @typedef {(size: number, length: number, addLengthForNut?: boolean) => FastenerKit} FastenerKitGetter
 * @typedef {(part: Part) => Generator<{hole: Path, depth: number, transform: DOMMatrix}>} HoleProvider
 */

/**
 * @param {Assembly} parent
 * @param {Part} subpart
 * @param {FlatPart} part
 * @param {HoleProvider} holeIterator
 * @param {FastenerKitGetter} fastenerGetter
 */
export function fastenSubpartToFlatPart(
  parent,
  subpart,
  part,
  holeIterator,
  fastenerGetter,
) {
  const partPlacement = parent.findChild(part).placement;
  const result = [];

  for (const located of parent.findChildren(subpart)) {
    const subPlacement = located.placement;

    const subToPart = partPlacement.inverse().multiply(subPlacement);
    const fastenToTheFront =
      transformPoint3(subToPart, zero3)[2] > part.thickness / 2;

    for (const { hole, depth, transform: holeTransform } of holeIterator(
      subpart,
    )) {
      const [, p1, , p2] = hole.getSegmentAt(1);
      const diameter = norm(p1, p2);

      const requiredClampingLength = depth + part.thickness;
      const { top, bottom } = fastenerGetter(diameter, requiredClampingLength);

      const location = [...placeAlong(p1, p2, { fraction: 0.5 }), 0];
      const holeToSubToPart = subToPart.multiply(holeTransform);
      const loc = proj2d(transformPoint3(holeToSubToPart, location));

      const locatedPath = Path.makeCircle(diameter / 2).translate(loc);
      part.addInsides(locatedPath);

      const fastenerLocation = partPlacement.multiply(
        a2m(
          [...loc, fastenToTheFront ? 0 : part.thickness],
          fastenToTheFront ? nz3 : z3,
        ),
      );
      const topLocation = fastenerLocation.multiply(
        a2m([0, 0, -depth - part.thickness]),
      );

      const bottomLocation = fastenerLocation.multiply(a2m(zero3, nz3));
      const locatedTop = parent.addChild(top, topLocation);
      subpart.pairings.push({ ...locatedTop, parent });
      const locatedBottom = parent.addChild(bottom, bottomLocation);
      subpart.pairings.push({ ...locatedBottom, parent });

      result.push(locatedTop);
      result.push(locatedBottom);
    }
  }
  return result;
}

/**
 * @param {Assembly} parent
 * @param {Part} subpart
 * @param {FlatPart} part
 * @param {HoleProvider} holeIterator
 * @param {FastenerKitGetter} fastenerGetter
 */
export function boltThreadedSubpartToFlatPart(
  parent,
  subpart,
  part,
  holeIterator,
  fastenerGetter,
  { ignoreMisplacedHoles } = { ignoreMisplacedHoles: false },
) {
  const partPlacement = parent.findChild(part).placement;
  const result = [];

  for (const located of parent.findChildren(subpart)) {
    const subPlacement = located.placement;

    const subToPart = partPlacement.inverse().multiply(subPlacement);
    for (const { hole, depth, transform: holeTransform } of holeIterator(
      subpart,
    )) {
      const [, p1, , p2] = hole.getSegmentAt(1);
      const diameter = norm(p1, p2);
      const center = [...placeAlong(p1, p2, { fraction: 0.5 }), 0];
      const holeToSubToPart = subToPart.multiply(holeTransform);

      const holeInPart = transformPoint3(holeToSubToPart, center);
      const holeOnPart = proj2d(holeInPart);
      const requiredClampingLength = depth + part.thickness;

      const zee = holeInPart[2];

      if (Math.abs(zee) > requiredClampingLength) {
        if (!ignoreMisplacedHoles)
          console.error(
            `cannot fasten ${subpart.name} to ${part.name} because they are too far apart for hole ${holeInPart}`,
          );
        continue;
      }

      const { top } = fastenerGetter(diameter, requiredClampingLength, false);

      // TODO clearance holes
      const locatedPath = Path.makeCircle(diameter / 2).translate(holeOnPart);
      part.addInsides(locatedPath);

      if (Math.abs(zee) > eps && Math.abs(zee - part.thickness) > eps)
        throw new Error(
          `"${subpart.name}" does't seem to be properly located to bolt to "${part.name}"`,
        );

      const onTheOtherSide = Math.abs(zee - part.thickness) < eps;
      const fastenerLocation = partPlacement.multiply(
        a2m(
          [...holeOnPart, onTheOtherSide ? zee : 0],
          onTheOtherSide ? z3 : nz3,
        ),
      );
      const topLocation = fastenerLocation.multiply(
        a2m([0, 0, -part.thickness]),
      );

      const locatedTop = parent.addChild(top, topLocation);
      subpart.pairings.push({ ...locatedTop, parent });
      result.push(locatedTop.placement);
    }
  }
  return result;
}

/**
 * @param {Assembly} parent
 * @param {Part} subpart
 * @param {FlatPart} part
 * @param {HoleProvider} holeIterator
 * @param {FastenerKitGetter} fastenerGetter
 */
export function fastenSubpartToFlatPartEdge(
  parent,
  subpart,
  part,
  holeIterator,
  fastenerGetter,
) {
  const partPlacement = parent.findChild(part).placement;

  for (const located of parent.findChildren(subpart)) {
    const subPlacement = located.placement;

    const subToPart = partPlacement.inverse().multiply(subPlacement);

    for (const { hole, depth, transform: holeTransform } of holeIterator(
      subpart,
    )) {
      const cylinderNutOffset = 10;
      const [, p1, , p2] = hole.getSegmentAt(1);
      const diameter = norm(p1, p2);

      const cylinderDiameter = 10;
      const requiredClampingLength =
        depth + cylinderNutOffset + cylinderDiameter / 2;

      const { top, bottom } = fastenerGetter(
        diameter,
        requiredClampingLength,
        false,
      );

      const center = placeAlong(p1, p2, { fraction: 0.5 });

      const holeToSubToPart = subToPart.multiply(holeTransform);

      const holeStart = transformPoint3(holeToSubToPart, [...center, depth]);
      const holeEnd = transformPoint3(holeToSubToPart, [...center, 0]);
      const barrelCenter = placeAlong(holeStart, holeEnd, {
        fromEnd: cylinderNutOffset,
      });

      console.assert(
        Math.abs(holeStart[2] - part.thickness / 2) < eps,
        "hole is not centered",
      );

      const locatedPath = Path.makeCircle(cylinderDiameter / 2).translate(
        barrelCenter,
      );

      part.addInsides(locatedPath);

      const topLoc = partPlacement.multiply(a2m(holeStart, nx3));
      const bottomLoc = topLoc.multiply(
        a2m([0, 0, depth + cylinderNutOffset], z3, y3),
      );

      subpart.pairings.push({ ...parent.addChild(top, topLoc), parent });
      subpart.pairings.push({
        ...parent.addChild(bottom, bottomLoc),
        parent,
      });
    }
  }
}

/**
 * @deprecated
 */
export function clearBoltOnFlatPart(parent, flatPart, fastener, options = {}) {
  const radius = options.radius ?? 10;
  const ignore = !!options.ignore;
  const width = options.width ?? 30;
  const depth = options.depth ?? 15;

  const locations = locateOriginsOnFlatPart(parent, flatPart, fastener);
  const boltClearance = Path.makeRoundedRect(
    width,
    2 * depth,
    radius,
  ).recenter();

  for (const p of locations) {
    try {
      flatPart.assignOutsidePath(
        flatPart.outside.booleanDifference(boltClearance.translate(p)),
      );
    } catch (e) {
      if (!ignore) throw e;
    }
  }
}

/**
 * @param {Assembly} parent
 * @param {FlatPart} flatPart
 * @param {DOMMatrix[]} locations
 */
export function clearBoltOnFlatPart3(
  parent,
  flatPart,
  locations,
  options = {},
) {
  const radius = options.radius ?? 9;
  const width = options.width ?? 24;
  const depth = options.depth ?? 10;

  const flatLocation = parent.findChild(flatPart).placement;

  const points = [];
  for (const loc of locations) {
    const mat = flatLocation.inverse().multiply(loc);
    const point = proj2d(transformPoint3(mat, zero3));
    if (points.every((p) => norm(p, point) > eps)) points.push(point);
  }

  if (points.length === 1) points.push(points[0]);

  const [idx] = flatPart.outside.findSegmentsOnLine(...points.slice(0, 2));
  const [, p1, , p2] = flatPart.outside.getSegmentAt(idx);

  const sorted = points
    .filter((x) => pointInsideLineBbox(x, p1, p2))
    .toSorted(keyToComparison((x) => norm(p1, x)));

  const t1 = sorted[0];
  const t2 = sorted.at(-1);
  const v1 = placeAlong(p1, t1, { fromEnd: -width / 2 });
  const v2 = placeAlong(p1, t2, { fromEnd: width / 2 });

  const [a, b] = offsetPolyline([v1, v2], depth);
  const [d, c] = offsetPolyline([v1, v2], -depth);

  const path = Path.fromPolyline([a, b, c, d]);
  path.roundFilletAll(radius);
  // debugGeometry(path, flatPart.outside, points);

  flatPart.assignOutsidePath(flatPart.outside.booleanDifference(path));
}
