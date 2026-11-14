/**
 * @import { LocatedPart } from './lib'
 * @import { Point, Point3 } from '../tools/types'
 * @import { SimpleIntersection } from '../tools/path';
 */

import {
  dot,
  eps,
  intersectLines,
  minus,
  norm,
  offsetPolyline,
  placeAlong,
  pointToLine,
  polygonCenter,
  rotatePoint,
} from "../tools/2d.js";
import { cross, plus3, pointToLine3, proj2d } from "../tools/3d.js";
import { x3, y2, y3, z3, zero2, zero3 } from "../tools/defaults.js";
import { pairs } from "../tools/iteration.js";
import { convexHull } from "../tools/operations.js";
import { Path } from "../tools/path.js";
import { BBox, debugGeometry } from "../tools/svg.js";
import { a2m, atm3, intersectPlanes } from "../tools/transform.js";
import { keyToComparison } from "../tools/utils.js";
import { Assembly } from "./assembly.js";
import { FlatPart, projectCenterLine } from "./flat.js";

/**
 * @deprecated
 */
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
   * @param {LocatedPart} locatedPart
   * @param {boolean} onlyCutting
   * @param {(x: SimpleIntersection) => SimpleIntersection[]} extractor this
   * allows filtering out some points that we might like to avoid
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
 * @param {[Point, Point]} cutLine
 * @param {[Point, Point]} otherLine
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

/**
 * @deprecated in favor of makeSimpleMortise
 */
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
  for (const p of all) bbox.include(p);

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

/**
 * @param {Assembly} parent
 * @param {FlatPart} partWithTenon
 * @param {FlatPart} partToMortise
 */
export function makeSimpleMortise(parent, partWithTenon, partToMortise) {
  const shelfLoc = parent.findChild(partToMortise).placement;

  for (const located of parent.findChildren(partWithTenon)) {
    const maker = new ShelfMaker2(shelfLoc, {
      thickness: partToMortise.thickness,
    });
    maker.addFlatPart(located, keepBothSides, withoutTags("edge"));

    const [a, b] = maker.features;
    // tilted surfaces need both the upper and lower intersection
    if (maker.features.length === 2) {
      partToMortise.insides.push(a.path.realBooleanUnion(b.path).invert());
    } else if (maker.features.length === 1) {
      partToMortise.insides.push(a.path.invert());
    } else throw new Error("multiple mortises are not implemented yet");
  }
}

/**
 * @typedef {"partA" | "partB" | "shelfA" | "shelfB" | "cut" | "edge"} FeatureOriginTag
 * the [part|shelf][A|B] are the sides A / B
 */

/**
 * @typedef {object} ExtractedFeature
 * @property {Path} path
 * @property {FeatureOriginTag[]} tags
 */

export class ShelfMaker2 {
  /**
   * @param {DOMMatrix} placement
   * @param {{thickness: number}} options
   */
  constructor(placement, options) {
    this.placement = placement;
    this.opts = options;

    /** @type {ExtractedFeature[]} */
    this.features = [];
  }

  /**
   * @returns {Path}
   */
  make(debug = false) {
    const hull = convexHull(
      this.features.flatMap((z) => z.path.getPointsWithHalfArcs()),
    );

    if (debug) {
      debugGeometry(hull, ...this.features.map((f) => f.path));
    }

    let result = Path.fromPolyline(hull);

    // cut what needs to be cut
    for (const { path, tags } of this.features) {
      if (!tags.includes("cut")) continue;
      if (path.isClosed()) {
        result = result.booleanDifference(path);
        continue;
      }
      // TODO: define a cleaner api: here we assume a path is a line that cuts
      // and keeps the bigger half
      const [p1, p2] = path.getPointsWithHalfArcs();

      const candidate1 = result.cutOnLine(p1, p2, true);
      const candidate2 = result.cutOnLine(p1, p2);
      // TODO: use surface instead of perimeter
      if (candidate1.getLengthInfo().length > candidate2.getLengthInfo().length)
        result = candidate1;
      else result = candidate2;
    }
    return result;
  }

  /**
   * @callback FeatureFilter
   * @param {ExtractedFeature} feature
   * @returns {boolean}
   */

  /**
   * @param {LocatedPart<FlatPart>} locatedPart
   * @param {...FeaturePostprocessStep} steps
   */
  addFlatPart(locatedPart, ...steps) {
    // default step to filter out the second side
    if (steps.length === 0) steps.push(withTags("shelfA"));

    const { child: part, placement } = locatedPart;
    let features = this.#getFlatPartFeatures(part, placement);

    for (const step of steps) {
      features = features.flatMap(step);
    }

    this.features.push(...features);
    return this;
  }

  /**
   * @param {Path} path
   * @param {DOMMatrix} placement
   */
  addFeature(path, placement) {
    const loc = proj2d(atm3(placement, zero3));
    this.features.push({ path: path.translate(loc), tags: [] });
    return this;
  }

  /**
   * @param {FlatPart} part
   * @param {DOMMatrix} placement
   * @returns {ExtractedFeature[]}
   */
  #getFlatPartFeatures(part, placement) {
    const result = [];

    const shelfToPart = placement.inverse().multiply(this.placement);
    const shelfTopToPart = shelfToPart.translate(0, 0, this.opts.thickness);

    // derive four hinges
    const botbot = intersectPlanes(a2m(), shelfToPart);
    const topbot = intersectPlanes(a2m(), shelfTopToPart);

    const bottop = intersectPlanes(a2m([0, 0, part.thickness]), shelfToPart);
    const toptop = intersectPlanes(a2m([0, 0, part.thickness]), shelfTopToPart);

    for (const [hinge, otherHinge] of [
      [botbot, bottop],
      [topbot, toptop],
    ]) {
      const side = hinge === botbot ? "shelfA" : "shelfB";

      // first look for actual intersections
      const path = part.outside;
      const line = path.intersectLine(
        proj2d(atm3(hinge, zero3)),
        proj2d(atm3(hinge, z3)),
        false,
      );

      if (line.length < 2) continue;

      /** @type {[Point3, Point3]} */
      const returnLine = [atm3(otherHinge, zero3), atm3(otherHinge, z3)];

      const v = minus(line[1].point, line[0].point);
      if (norm(v) < eps) throw new Error("cannot sort intersections");

      const sorted = line.toSorted(
        keyToComparison((x) => dot(minus(x.point, line[0].point), v)),
      );

      for (const [one, two] of pairs(sorted, 0, false)) {
        /** @type {FeatureOriginTag[]} */
        const tags = [side];
        const [p1, p2] = [one.point, two.point];

        if (norm(p1, p2) < eps) {
          console.warn("intersections are too close");
          continue;
        }

        if (
          norm(p1, path.evaluate(one.segment + 1, 0)) +
          norm(p2, path.evaluate(one.segment + 1, 1)) <
          eps ||
          norm(p1, path.evaluate(two.segment + 1, 0)) +
          norm(p2, path.evaluate(two.segment + 1, 1)) <
          eps ||
          norm(p2, path.evaluate(one.segment + 1, 0)) +
          norm(p1, path.evaluate(one.segment + 1, 1)) <
          eps ||
          norm(p2, path.evaluate(two.segment + 1, 0)) +
          norm(p1, path.evaluate(two.segment + 1, 1)) <
          eps
        )
          tags.push("edge");

        /** @type {Point3[]} */
        const quad = [
          [...p1, 0],
          [...p2, 0],
          pointToLine3([...p2, 0], ...returnLine),
          pointToLine3([...p1, 0], ...returnLine),
        ];
        result.push({
          tags,
          path: Path.fromPolyline(
            quad.map((x) => proj2d(atm3(shelfToPart.inverse(), x))),
          ),
        });
      }
    }

    return result;
  }
}

/**
 * @callback FeaturePostprocessStep
 * @param {ExtractedFeature} feature
 * @param {number} i
 * @param {ExtractedFeature[]} full
 * @returns {ExtractedFeature[]}
 */

/** @type {FeaturePostprocessStep} */
export function separateSides({ path, tags }) {
  return [
    { path: path.subpath(1, 0, 1, 1), tags: [...tags, "partA"] },
    { path: path.subpath(3, 0, 3, 1), tags: [...tags, "partB"] },
  ];
}

/**
 * @template {unknown[]} T
 * @typedef {(...params: T) => FeaturePostprocessStep} PostprocessorBuilder
 */

/** @type {PostprocessorBuilder<FeatureOriginTag[]>} */
export function withTags(...tags) {
  return (f) => (tags.every((t) => f.tags.includes(t)) ? [f] : []);
}

/** @type {PostprocessorBuilder<FeatureOriginTag[]>} */
export function withoutTags(...tags) {
  return (f) => (tags.some((t) => f.tags.includes(t)) ? [] : [f]);
}

/** @type {PostprocessorBuilder<FeatureOriginTag[]>} */
export function removeTags(...tags) {
  return (f) => {
    f.tags = f.tags.filter((t) => !tags.includes(t));
    return [f];
  };
}

/** @type {PostprocessorBuilder<FeatureOriginTag[]>} */
export function addTags(...tags) {
  return (f) => {
    f.tags.push(...tags);
    return [f];
  };
}

/** @type {FeaturePostprocessStep} */
export const dontCut = removeTags("cut");

/** @type {FeaturePostprocessStep} */
export const doCut = addTags("cut");

// otherwise the default step will be to remove one side
/** @type {FeaturePostprocessStep} */
export const keepBothSides = (x) => [x];

/**
 * Cuts a flat part at the base of the other part, so that it edges nicely
 *
 * Parent part can eventually be removed, and "otherPart" too ?
 * @param {Assembly} parent
 * @param {FlatPart} partToTrim
 * @param {FlatPart} otherPart
 *
 */
export function trimFlatPartWithAnother2(
  parent,
  partToTrim,
  otherPart,
  other = false,
) {
  const { placement } = parent.findChild(partToTrim);

  const maker = new ShelfMaker2(placement, {
    thickness: partToTrim.thickness,
  }).addFlatPart(parent.findChild(otherPart), keepBothSides);

  if (maker.features.length !== 2)
    throw new Error("expected to have only two features here");

  let cutter = maker.features[0].path.realBooleanUnion(maker.features[1].path);

  if (!cutter.rotatesClockwise()) cutter = cutter.invert();

  const candidate1 = partToTrim.outside.cutOnLine(
    cutter.evaluate(1, 0),
    cutter.evaluate(1, 1),
    true,
  );
  const candidate2 = partToTrim.outside.cutOnLine(
    cutter.evaluate(3, 0),
    cutter.evaluate(3, 1),
    true,
  );

  if (
    candidate1.getLengthInfo().length > candidate2.getLengthInfo().length &&
    !other
  )
    partToTrim.assignOutsidePath(candidate1);
  else partToTrim.assignOutsidePath(candidate2);
}
