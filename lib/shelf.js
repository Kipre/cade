// @ts-check
/** @import * as lib from './lib' */
/** @import * as types from '../tools/types' */

import {
  dot,
  eps,
  intersectLines,
  minus,
  norm,
  offsetPolyline,
  placeAlong,
  polygonCenter,
  rotatePoint,
} from "../tools/2d.js";
import { cross, plus3, proj2d } from "../tools/3d.js";
import { x3, y2, y3, z3, zero2, zero3 } from "../tools/defaults.js";
import { pairs } from "../tools/iteration.js";
import { convexHull } from "../tools/operations.js";
import { Path } from "../tools/path.js";
import { BBox, debugGeometry } from "../tools/svg.js";
import { atm3 } from "../tools/transform.js";
import { keyToComparison } from "../tools/utils.js";
import { FlatPart, projectCenterLine } from "./flat.js";

// TODO: rewrite this as a tool that produces a set of paths that represent the
// slices of the different parts that it encounters; then these paths can be
// assigned different roles (should be included, should touch but be excluded,
// should cut...); this will also require more advanced convex hull functions
export class ShelfMaker {
  /**
   * @param {DOMMatrix} placement
   * @param {{joinOffset?: number, thickness: number, zoneIndex?: number, zonePoint?: types.Point}} options
   */
  constructor(placement, options) {
    this.placement = placement;
    this.opts = options;
    this.locatedFlatParts = [];
    this.features = [];
  }

  /**
   * @param {lib.LocatedPart} locatedPart
   * @param {boolean} onlyCutting
   * @param {(x: SimpleIntersection) => SimpleInstersection[]} onlyCutting
   */
  addFlatPart(locatedPart, onlyCutting = false, extractor = null) {
    if (!(locatedPart.child instanceof FlatPart))
      throw new TypeError("cannot use non flat parts");
    this.locatedFlatParts.push({
      locatedPart,
      type: onlyCutting ? "onlyCutting" : "normal",
      extractor,
    });
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

  /**
   * @param {lib.LocatedPart} locatedPart
   */
  addSingleSideOfPart(locatedPart, otherSide = false) {
    this.locatedFlatParts.push({
      locatedPart,
      type: otherSide ? "leftSide" : "rightSide",
    });
    return this;
  }

  getSurfaceIntersections(part, placement, type, selfPlacement = null) {
    if (selfPlacement == null) selfPlacement = this.placement;
    const planeToPart = placement.inverse().multiply(selfPlacement);
    const parttp = (p) => proj2d(atm3(planeToPart.inverse(), p));
    const centerline = projectCenterLine(planeToPart, this.opts.thickness);

    let line = part.outside.intersectLine(...centerline);

    if (line.length < 2) return [];

    const ordered = line.toSorted(
      keyToComparison((x) => norm(x.point, centerline[0])),
    );
    line = [ordered[0], ordered.at(-1)];

    const result = [];
    for (let i = 0; i < ordered.length; i += 2) {
      const line = [ordered[i], ordered[i + 1]];
      if (type === "normal" || type === "onlyCutting") {
        result.push({
          pts: line.map((p) => parttp([...p.point, part.thickness / 2])),
          type: type === "onlyCutting" ? "onlyCutting" : "cutting",
          thickness: part.thickness,
        });
      }

      const zee = minus(parttp(z3), parttp(zero2));
      if (type === "leftSide") {
        result.push({
          pts: line.map((p) => parttp([...p.point, 0])),
          type: "edge",
          pairing: "left",
          zee,
        });
      }

      if (type === "rightSide") {
        result.push({
          pts: line.map((p) => parttp([...p.point, part.thickness])),
          type: "edge",
          pairing: "right",
          zee,
        });
      }
    }

    return result;
  }

  getEdgeIntersections(part, placement) {
    const planeToPart = placement.inverse().multiply(this.placement);
    const parttp = (p) => proj2d(atm3(planeToPart.inverse(), p));
    const centerline = projectCenterLine(planeToPart, this.opts.thickness);

    // second case: edge
    const l1 = proj2d(atm3(planeToPart, zero3));
    const l2 = proj2d(atm3(planeToPart, plus3(x3, y3)));

    const beforeFilter = [];
    for (const idx of part.outside.findSegmentsOnLine(l1, l2)) {
      const [, p1, , p2] = part.outside.getSegmentAt(idx);
      beforeFilter.push(p1, p2);
    }

    const ordered = beforeFilter.toSorted(
      keyToComparison((x) => norm(x, centerline[0])),
    );

    if (ordered.length < 2) return [];
    const joinOffset = this.opts.joinOffset ?? 0;

    const result = [];
    for (let i = 0; i < ordered.length; i += 2) {
      const segment = [ordered[i], ordered[i + 1]];
      result.push(
        {
          pts: segment.map((p) => parttp([...p, -joinOffset])),
          type: "edge",
        },
        {
          pts: segment.map((p) => parttp([...p, part.thickness + joinOffset])),
          type: "edge",
        },
      );
    }
    return result;
  }

  make(debug = false) {
    const geometries = [];

    for (const { locatedPart, type, extractor: maybeExtractor } of this
      .locatedFlatParts) {
      const { child: part, placement } = locatedPart;
      const planeToPart = placement.inverse().multiply(this.placement);
      const surface = this.getSurfaceIntersections(part, placement, type);
      const edge = this.getEdgeIntersections(part, placement);
      const extractor = maybeExtractor ?? ((x) => true);

      const both = [...surface, ...edge];
      if (debug) {
        console.log(both);
        // if (surface.length) debugGeometry(surface.flatMap((x) => x.pts));
        // if (edge.length) debugGeometry(edge.flatMap((x) => x.pts));
      }

      if (both.length !== 0) {
        geometries.push(...both.filter((g) => g.pts.every(extractor)));
        continue;
      }

      const centerline2 = projectCenterLine(
        planeToPart,
        this.opts.thickness,
        100,
      );
      debugGeometry(centerline2, part.outside);
      const err = new Error(
        `couldn't find how to use ${part.name} to make shelf`,
      );
      console.error(err);
    }

    for (const { path, placement } of this.features) {
      const points = path.getPointsWithHalfArcs();

      const planeToPart = placement.inverse().multiply(this.placement);
      const parttp = (p) => proj2d(atm3(planeToPart.inverse(), p));

      for (const [p1, p2] of pairs(points)) {
        geometries.push({
          pts: [parttp([...p1, 0]), parttp([...p2, 0])],
          type: "edge",
        });
      }
    }

    if (debug) {
      for (const geom of geometries) {
        debugGeometry(geom.pts);
      }
    }

    const zones = findConvexZones(geometries);

    const hulls = zones.map((z) => convexHull(...z.map((l) => l.pts)));
    const centers = hulls.map(polygonCenter);

    if (zones.length > 1 && this.opts.zonePoint == null) {
      debugGeometry(...zones.map((z) => convexHull(...z.map((l) => l.pts))));
      debugGeometry(centers);
      console.error(centers);
      throw new Error("A zone needs to be chosen");
    }

    let hull = hulls[0];

    if (this.opts.zonePoint != null) {
      const keyFunc = (h) => norm(polygonCenter(h), this.opts.zonePoint);
      hull = hulls.toSorted(keyToComparison(keyFunc))[0];
    }

    // add remaining points for paired geometries
    for (const geom of geometries) {
      if (!geom.pairing) continue;
      const onY = Math.abs(dot(y2, geom.zee)) > eps;
      const [a, b] = geom.pts;
      for (let i = 0; i < hull.length; i++) {
        const p = hull[i];
        if (geom.pairing === "left" && norm(b, p) < eps) {
          hull.splice(i + (onY ? 0 : 1), 0, a);
          break;
        }
        if (geom.pairing === "right" && norm(b, p) < eps) {
          hull.splice(i + (onY ? 1 : 0), 0, a);
          break;
        }
      }
    }

    const result = Path.fromPolyline(hull);
    result.simplify();

    if (result.controls.length === 2) throw new Error("couldn't build a shelf");

    return result;
  }
}

/**
 * @typedef {{pts: [types.Point, types.Point], type: "cutting" | "edge" | "onlyCutting"}} LineInfo
 */

/**
 * @param {DOMMatrix} planeMatrix
 * @param {{joinOffset?: number, thickness: number, zoneIndex?: number, zonePoint?: types.Point}} options
 * @param {lib.LocatedPart[]} locatedFlatParts
 */
export function makeShelfOnPlane(planeMatrix, options, ...locatedFlatParts) {
  const maker = new ShelfMaker(planeMatrix, options);
  for (const located of locatedFlatParts) {
    maker.addFlatPart(located);
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
      if (line.type !== "cutting" && line.type !== "onlyCutting") continue;

      const ups = [];
      const downs = [];

      for (const otherLine of lines) {
        if (line === otherLine) continue;

        const { pts, ...rest } = otherLine;
        const { up, down } = cut(line.pts, pts, line.thickness);

        if (up) ups.push({ pts: up, ...rest });
        if (down) downs.push({ pts: down, ...rest });
      }

      const upLine = {
        pts: offsetPolyline(line.pts, -line.thickness / 2),
        type: "edge",
      };
      const downLine = {
        pts: offsetPolyline(line.pts, line.thickness / 2),
        type: "edge",
      };

      if (ups.length && downs.length && line.type !== "onlyCutting") {
        zones.splice(i, 1, [...downs, downLine], [...ups, upLine]);
        inc = 0;
        break;
      } else if (line.type === "onlyCutting") {
        zones.splice(i, 1, downs, ups);
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
    };
  }

  if (sign1 < 0 && sign2 >= 0) {
    return {
      down: [o1, placeAlong(o1, int, { fromEnd: -halfThickness })],
      up: [placeAlong(int, o2, { fromStart: halfThickness }), o2],
    };
  }

  throw new Error();
}

export function makeClearance(shelf, thickness) {
  const [{ locatedPart, type }] = shelf.locatedFlatParts;

  const { child: part, placement } = locatedPart;
  const [{ pts: pts1 }] = shelf.getSurfaceIntersections(part, placement, type);
  const [{ pts: pts2 }] = shelf.getSurfaceIntersections(
    part,
    placement,
    type,
    shelf.placement.translate(0, 0, thickness),
  );

  const [p0, p1] = pts1;
  const [x, y] = minus(p1, p0);
  const angle = Math.atan2(y, x);

  const all = [...pts1, ...pts2].map((p) => rotatePoint(p0, p, -angle));
  const bbox = new BBox();
  for (const p of all) 
    bbox.include(p);
  

  const result = Path.fromPolyline(
    [
      [bbox.xMin, bbox.yMin],
      [bbox.xMax, bbox.yMin],
      // [bbox.xMax, bbox.yMax],
      // [bbox.xMin, bbox.yMax],
    ].map((p) => rotatePoint(p0, p, angle)),
    false,
  );

  return result.thickenAndClose(3, { centered: true });
}
