// @ts-check
/** @import * as lib from './lib' */
/** @import * as types from '../tools/types' */

import { areOnSameLine, intersectLines, minus, norm, offsetPolyline, placeAlong, pointToLine, polygonCenter } from '../tools/2d.js';
import { cross, plus3, proj2d } from '../tools/3d.js';
import { x3, y3, zero3 } from '../tools/defaults.js';
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
        const pts = [
          ...line.map((p) => parttp([...p.point, 0])),
          ...line.map((p) => parttp([...p.point, part.thickness])).toReversed(),
        ];
        geometries.push({ pts, type: "cutting" });
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
        const pts = [
          ...segment.map((p) => parttp([...p, -joinOffset])),
          ...segment
            .map((p) => parttp([...p, part.thickness + joinOffset]))
            .toReversed(),
        ];
        geometries.push({ pts, type: "edge" });
        continue;
      }

      throw new Error(`couldn't find how to use ${part.name} to make shelf`);
    }

    for (const { path, placement } of this.features) {
      const points = path.getPointsWithHalfArcs();

      const planeToPart = placement.inverse().multiply(this.placement);
      const parttp = (p) => proj2d(atm3(planeToPart.inverse(), p));

      const pts = points.map((p) => parttp([...p, 0]))
      geometries.push({ pts, type: "custom" });
    }

    return Path.fromPolyline(convexHull(...geometries.map(v => v.pts)));
  }

  makeLegacy() {
    const planeMatrix = this.placement;
    const options = this.opts;
    const locatedFlatParts = this.locatedFlatParts;
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
}

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
  return maker.makeLegacy()
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

