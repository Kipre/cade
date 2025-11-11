// @ts-check
/** @import * as lib from './lib' */
/** @import * as types from '../tools/types' */

import { areOnSameLine, eps, intersectLines, minus, norm, offsetPolyline, placeAlong, pointToLine, polygonCenter } from '../tools/2d.js';
import { cross, plus3, proj2d } from '../tools/3d.js';
import { x3, y3, zero2, zero3 } from '../tools/defaults.js';
import { pairs } from '../tools/iteration.js';
import { convexHull } from '../tools/operations.js';
import { Path } from '../tools/path.js';
import { debugGeometry } from '../tools/svg.js';
import { a2m, atm3, transformPoint3 } from '../tools/transform.js';
import { keyToComparison } from '../tools/utils.js';
import { FlatPart, projectCenterLine } from './flat.js';
import { Part } from './part.js';

export class ShelfMaker {
  /**
   * @param {DOMMatrix} placement
   * @param {{joinOffset?: number, woodThickness: number, zoneIndex?: number, zonePoint?: types.Point}} options
   */
  constructor(placement, options) {
    this.placement = placement;
    this.opts = options;
    this.locatedFlatParts = [];
    this.features = [];
  }

  /**
   * @param {lib.LocatedPart} locatedPart
   */
  addFlatPart(locatedPart) {
    if (!(locatedPart.child instanceof FlatPart))
      throw new TypeError("cannot use non flat parts");
    this.locatedFlatParts.push(locatedPart);
    return this;
  }

  /**
   * @param {Path} path
   * @param {DOMMatrix} placement
   */
  addFeature(path, placement) {
    this.features.push({ path, placement });
    return this;
  }

  make() {
    const geometries = [];
    for (const { child: part, placement } of this.locatedFlatParts) {

      const planeToPart = placement.inverse().multiply(this.placement);
      const parttp = (p) => proj2d(atm3(planeToPart.inverse(), p));

      const centerline = projectCenterLine(planeToPart, this.opts.woodThickness);
      const line = part.outside.intersectLine(...centerline);

      // normal case: intersection found
      if (line.length === 2) {
        // geometries.push({ pts: line.map((p) => parttp([...p.point, 0])), type: "cutting" });
        geometries.push({
          pts: line.map((p) => parttp([...p.point, part.thickness / 2])),
          type: "cutting",
          thickness: part.thickness,
        });
        continue;
      }

      // second case: edge
      const l1 = proj2d(atm3(planeToPart, zero3));
      const l2 = proj2d(atm3(planeToPart, plus3(x3, y3)));
      const idx = part.outside.findSegmentsOnLine(l1, l2)[0];
      if (line.length === 0 && idx != null) {
        const [, p1, , p2] = part.outside.getSegmentAt(idx);
        const segment = [p1, p2];
        const joinOffset = this.opts.joinOffset ?? 0;
        geometries.push({ pts: segment.map((p) => parttp([...p, -joinOffset])), type: "edge" });
        geometries.push({
          pts: segment.map((p) => parttp([...p, part.thickness + joinOffset])),
          type: "edge"
        });
        continue;
      }

      const err = new Error(`couldn't find how to use ${part.name} to make shelf`);
      console.error(err);
    }

    for (const { path, placement } of this.features) {
      const points = path.getPointsWithHalfArcs();

      const planeToPart = placement.inverse().multiply(this.placement);
      const parttp = (p) => proj2d(atm3(planeToPart.inverse(), p));

      for (const [p1, p2] of pairs(points)) {
        geometries.push({
          pts: [parttp([...p1, 0]), parttp([...p2, 0])],
          type: "edge"
        });
      }
    }

    const zones = findConvexZones(geometries);

    const hulls = zones.map(z => convexHull(...z.map(l => l.pts)))
    const centers = hulls.map(h => polygonCenter(h))

    if (zones.length > 1 && this.opts.zonePoint == null) {
      debugGeometry(...zones.map(z => convexHull(...z.map(l => l.pts))));
      debugGeometry(centers);
      console.log(centers);
    }

    let hull = hulls[0];

    if (this.opts.zonePoint != null) {
      const keyFunc = h => norm(polygonCenter(h), this.opts.zonePoint);
      hull = hulls.toSorted(keyToComparison(keyFunc))[0];
    }

    const result = Path.fromPolyline(hull);
    result.simplify();
    return result;
  }
}
/**
  * @typedef {{pts: [types.Point, types.Point], type: "cutting" | "edge"}} LineInfo
  */

/**
 * @param {DOMMatrix} planeMatrix
 * @param {{joinOffset?: number, woodThickness: number, zoneIndex?: number, zonePoint?: types.Point}} options
 * @param {lib.LocatedPart[]} locatedFlatParts
 */
export function makeShelfOnPlane(planeMatrix, options, ...locatedFlatParts) {
  let maker = new ShelfMaker(planeMatrix, options);
  for (const located of locatedFlatParts) {
    maker.addFlatPart(located)
  }
  return maker.make();
}

/**
 * @param {LineInfo[]} originalLines
 */
export function findConvexZones(originalLines) {
  const zones = [originalLines];

  let i = 0;
  while (i < zones.length) {
    const lines = zones[i];
    let inc = 1;
    for (const line of lines) {
      if (line.type !== "cutting") continue;

      const ups = [];
      const downs = [];

      for (const otherLine of lines) {
        if (line === otherLine) continue;

        const { pts, ...rest } = otherLine;
        const { up, down } = cut(line.pts, pts, line.thickness);

        if (up) ups.push({ pts: up, ...rest });
        if (down) downs.push({ pts: down, ...rest });
      }
      const upLine = { pts: offsetPolyline(line.pts, -line.thickness / 2), type: "edge" }
      const downLine = { pts: offsetPolyline(line.pts, line.thickness / 2), type: "edge" }

      if (ups.length && downs.length) {
        zones.splice(i, 1, [...downs, downLine], [...ups, upLine]);
        inc = 0;
        break;
      }

      // offset only the necessary one;
      const idx = lines.indexOf(line);
      lines[idx] = ups.length ? upLine : downLine;
    }
    i += inc;
  }
  return zones;
}

/**
 * @param {[types.Point, types.Point]} cutLine
 * @param {[types.Point, types.Point]} otherLine
 * @param {number} cutWidth
 */
export function cut(cutLine, otherLine, cutWidth) {
  const halfThickness = cutWidth / 2;
  const [c1, c2] = cutLine;
  const [o1, o2] = otherLine;

  const sign1 = cross(minus(c1, c2), minus(o1, c2))[2];
  const sign2 = cross(minus(c1, c2), minus(o2, c2))[2];

  if (sign1 >= 0 && sign2 >= 0) {
    return { up: otherLine };
  }

  if (sign1 < 0 && sign2 < 0) {
    return { down: otherLine };
  }

  const int = intersectLines(o1, o2, c1, c2);
  if (int === null) throw new Error();

  if (norm(int, o1) < eps) {
    return sign2 < 0 ? { up: otherLine } : { down: otherLine };
  }

  if (norm(int, o2) < eps) {
    return sign1 >= 0 ? { up: otherLine } : { down: otherLine };
  }

  if (sign1 >= 0 && sign2 < 0) {
    return {
      up: [o1, placeAlong(o1, int, { fromEnd: -halfThickness })],
      down: [placeAlong(int, o2, { fromStart: halfThickness }), o2],
    }
  }

  if (sign1 < 0 && sign2 >= 0) {
    return {
      down: [o1, placeAlong(o1, int, { fromEnd: -halfThickness })],
      up: [placeAlong(int, o2, { fromStart: halfThickness }), o2],
    }
  }

  throw new Error();
}
