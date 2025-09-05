// @ts-check
/** @import * as types from './types' */

import {
  areOnSameLine,
  computeAngleBetween,
  intersectLines,
  isToTheLeft,
  minus,
  mirrorPoint,
  norm,
  offsetPolyline,
  placeAlong,
  plus,
  pointCoordinateOnLine,
  pointInsideLineBbox,
  pointToLine,
  rotatePoint,
  signedArea,
} from "./2d.js";
import {
  arcTangentAt,
  areOnSameCircle,
  evaluateArc,
  getArcAngularLength,
  getCircleCenter,
  intersectLineAndArc,
  intersectLineAndCircle,
  intersectTwoArcs,
  intersectTwoCircles,
  normalizeAngle,
  pointCoordinateOnArc,
} from "./circle.js";
import { debugGeometry } from "./svg.js";
import { modulo } from "./utils.js";

const eps = 1e-5;

/**
 * @typedef {{segment: number; x: number; crossesFromTheRight: boolean}} IntersectionLocation
 * @typedef {{point: types.Point} & IntersectionLocation} SimpleIntersection
 * @typedef {{point: types.Point; self: IntersectionLocation, other: IntersectionLocation}} PathIntersection
 */

export class Path {
  constructor() {
    this.controls = [];
  }

  static fromD(path) {
    const result = new Path();
    const tokens = path
      .replaceAll(",", " ")
      .replaceAll(/[A-Za-z]\d/g, (match) => `${match[0]} ${match.slice(1)}`)
      .split(" ");
    let i = 0;

    while (i < tokens.length) {
      switch (tokens[i++]) {
        case "":
          break;
        case "M":
          result.moveTo([
            Number.parseFloat(tokens[i++]),
            Number.parseFloat(tokens[i++]),
          ]);
          break;
        case "L":
          result.lineTo([
            Number.parseFloat(tokens[i++]),
            Number.parseFloat(tokens[i++]),
          ]);
          break;
        case "A": {
          const rx = Number.parseFloat(tokens[i++]);
          const ry = Number.parseFloat(tokens[i++]);
          const angle = Number.parseFloat(tokens[i++]);
          const bigArc = Number.parseInt(tokens[i++]);
          const sweep = Number.parseInt(tokens[i++]);
          const x = Number.parseFloat(tokens[i++]);
          const y = Number.parseFloat(tokens[i++]);
          if (rx !== ry) throw new Error("unsupported command");
          result.arc([x, y], rx, sweep);
          break;
        }
        case "Z":
        case "z":
          result.close();
          break;
        default:
          throw new Error(`unsupported command: ${tokens[i - 1]}`);
      }
    }
    return result;
  }

  isEmpty() {
    return this.controls.length === 0;
  }

  /**
   * @param {types.Point} p
   */
  moveTo(p) {
    if (this.controls.length)
      throw new Error("cannot move when curve already on the way");
    this.controls.push(["moveTo", p]);
  }

  /**
   * @param {types.Point} p
   */
  lineTo(p) {
    this.controls.push(["lineTo", p]);
  }

  close() {
    this.controls.push(["close", []]);
  }

  /**
   * @param {number} radius
   */
  roundFillet(radius, maybeIndex = null) {
    const length = this.controls.length;
    const index = maybeIndex ?? length - 1;

    const [[, p1, preType, p2], [, , type, p3]] = this.getJunctionAt(index - 1);

    if (type !== "lineTo" || preType !== "lineTo")
      throw new Error("round fillets need lines to operate");

    let [oStart, center] = offsetPolyline([p1, p2, p3], radius);
    if (norm(oStart, center) > norm(p1, p2))
      [, center] = offsetPolyline([p1, p2, p3], -radius);

    const start = pointToLine(center, p1, p2);
    const end = pointToLine(center, p2, p3);

    const angle1 = Math.atan2(...minus(start, center).toReversed());
    const angle2 = Math.atan2(...minus(end, center).toReversed());
    const angle = normalizeAngle(angle2 - angle1);

    const sweepFlag = angle > 0 ? 1 : 0;

    const toInsert = [];
    if (norm(p1, start) > eps)
      toInsert.push([index === 1 ? "moveTo" : "lineTo", start]);

    toInsert.push(["arc", end, radius, sweepFlag]);

    if (norm(p3, end) > eps)
      toInsert.push(
        index + 1 === length && this.isClosed()
          ? ["close", [0, 0]]
          : ["lineTo", p3],
      );

    this.controls.splice(index - 1, 2, ...toInsert);
  }

  /**
   * @param {number} radius
   */
  roundFilletAll(radius) {
    for (let i = 0; i < this.controls.length; i++) {
      try {
        this.roundFillet(radius, i + 1);
      } catch (e) {}
    }
  }

  /**
   * @param {types.Point} p
   * @param {number} radius
   */
  arcTo(p, radius) {
    this.lineTo(p);
    this.roundFillet(radius);
  }

  /**
   * @param {types.Point} p
   * @param {number} radius
   * @param {number} sweepFlag
   */
  arc(p, radius, sweepFlag) {
    this.controls.push(["arc", p, radius, sweepFlag]);
  }

  /**
   * @param {number} width
   */
  fillet(width) {
    const [type, p3] = this.controls.pop();
    const [preType, p2] = this.controls.pop();
    const [, p1] = this.controls.at(-1);

    if (type !== "lineTo" || preType !== "lineTo")
      throw new Error("fillets need lines to operate");

    const angle = computeAngleBetween(minus(p1, p2), minus(p3, p2));
    const offset = Math.abs(width / (2 * Math.sin(angle / 2)));

    const start = placeAlong(p2, p1, { fromStart: offset });
    const end = placeAlong(p2, p3, { fromStart: offset });

    this.lineTo(start);
    this.lineTo(end);
    this.lineTo(p3);
  }

  simplify() {
    let nbControlsToCheck = this.controls.length - 1;
    if (this.isClosed()) nbControlsToCheck--;

    for (let i = 1; i < nbControlsToCheck - 1; i++) {
      const [[, p0, type1, p1, r1, s1], [index, , type2, p2, r2, s2]] =
        this.getJunctionAt(i);

      if (!index || this.controls[index][0] === "close") break;

      if (!type1 || !type2) continue;

      if (norm(p1, p2) < eps) {
        this.controls.splice(i + 1, 1);
        i--;
        continue;
      }

      if (type1 === "lineTo" && type2 === "lineTo" && areOnSameLine(p0, p1, p2))
        this.controls.splice(i, 1);

      if (
        type1 === "arc" &&
        type2 === "arc" &&
        areOnSameCircle(p0, p1, r1, s1, p1, p2, r2, s2)
      )
        this.controls.splice(i, 1);
    }

    // if close is zero length and first segment is a line
    if (
      this.isClosed() &&
      norm(this.controls[0][1], this.controls.at(-2)[1]) < eps &&
      this.controls[1][0] === "lineTo"
    ) {
      this.controls.shift();
      this.controls[0][0] = "moveTo";
    }
  }

  /**
   * @param {types.Point?} l1
   * @param {types.Point?} l2
   */
  mirror(l1 = null, l2 = null) {
    const [[first, firstPoint]] = this.controls;
    const [last, lastPoint] = this.controls.at(-1);

    if (first !== "moveTo") throw new Error("path not well formed");
    if (last === "close") throw new Error("can't mirror a closed path");

    let checkedFirstPoint = false;
    for (let i = this.controls.length - 1; i > 0; i--) {
      const [type, point, maybeRadius, maybeSweepFlag] = this.controls[i];
      const [, p] = this.controls[i - 1];

      const mirrored = mirrorPoint(p, l1 ?? firstPoint, l2 ?? lastPoint);
      if (!checkedFirstPoint) {
        checkedFirstPoint = true;
        const firstMirrored = mirrorPoint(
          point,
          l1 ?? firstPoint,
          l2 ?? lastPoint,
        );
        if (norm(point, firstMirrored) > eps) this.lineTo(firstMirrored);
      }

      switch (type) {
        case "lineTo":
          this.lineTo(mirrored);
          break;

        case "arc":
          this.arc(mirrored, maybeRadius, maybeSweepFlag);
          break;

        default:
          throw new Error("failed");
      }
    }

    if (norm(this.controls[0][1], this.controls.at(-1)[1]) < eps) this.close();
    this.simplify();
  }

  /**
   * @param {number} nbItems
   */
  pop(nbItems = 1) {
    const result = [];
    for (let i = 0; i < nbItems; i++) {
      result.unshift(this.controls.pop());
    }
    return result;
  }

  /**
   * @param {types.Point} start
   * @param {types.Point} end
   * @param {number} radius
   * @param {number} sweep
   * @returns {SimpleIntersection[]}
   */
  intersectArc(start, end, radius, sweep) {
    const result = [];
    let lastPoint;

    const center = getCircleCenter(start, end, radius, sweep);

    const nbControls = this.controls.length;
    for (let i = 0; i < nbControls; i++) {
      let [type, p, ...rest] = this.controls[i];
      switch (type) {
        case "moveTo":
          break;

        // biome-ignore lint/suspicious/noFallthroughSwitchClause: it's fine
        case "close":
          p = this.controls[0][1];
          if (Math.abs(norm(lastPoint, p)) < eps) break;
        case "lineTo": {
          if (pointToLine(center, lastPoint, p) > radius) break;

          const roots = intersectLineAndCircle(lastPoint, p, center, radius);

          for (const point of roots) {
            const xA = pointCoordinateOnArc(point, start, end, radius, sweep);
            const xL = pointCoordinateOnLine(point, lastPoint, p);

            if (!(0 < xA && xA < 1 && 0 < xL && xL < 1)) continue;

            const [, tangent] = arcTangentAt(xA, start, end, radius, sweep);
            const crossesFromTheRight = isToTheLeft(tangent, lastPoint, p);

            result.push({ point, segment: i, x: xL, crossesFromTheRight });
          }
          break;
        }
        case "arc": {
          const [radius2, sweep2] = rest;
          const center2 = getCircleCenter(lastPoint, p, radius2, sweep2);
          if (norm(center, center2) > radius + radius2) break;

          const roots = intersectTwoCircles(center, radius, center2, radius2);

          for (const point of roots) {
            // for self and other
            const xS = pointCoordinateOnArc(point, lastPoint, p, radius, sweep);
            const xO = pointCoordinateOnArc(point, start, end, radius, sweep);

            if (!(0 < xS && xS < 1 && 0 < xO && xO < 1)) continue;

            const [, tOther] = arcTangentAt(xO, start, end, radius, sweep);
            const selfTangent = arcTangentAt(xS, lastPoint, p, radius2, sweep2);
            const crossesFromTheRight = isToTheLeft(tOther, ...selfTangent);

            result.push({ point, segment: i, x: xS, crossesFromTheRight });
          }
          break;
        }
        default:
          throw new Error();
      }
      lastPoint = p;
    }
    return result;
  }

  /**
   * @param {types.Point} p1
   * @param {types.Point} p2
   * @returns {SimpleIntersection[]}
   */
  intersectLine(p1, p2) {
    const result = [];
    let firstPoint;
    let lastPoint;

    if (norm(p1, p2) < eps)
      throw new Error("cannot intersect zero length line");

    const nbControls = this.controls.length;
    for (let i = 0; i < nbControls; i++) {
      let [type, p, ...rest] = this.controls[i];
      switch (type) {
        case "moveTo":
          firstPoint = p;
          break;

        // biome-ignore lint/suspicious/noFallthroughSwitchClause: it's fine
        case "close":
          p = firstPoint;
        case "lineTo": {
          if (lastPoint == null) throw new Error();
          const int = intersectLines(lastPoint, p, p1, p2);
          if (
            int == null ||
            !pointInsideLineBbox(int, lastPoint, p) ||
            !pointInsideLineBbox(int, p1, p2)
          )
            break;

          const crossesFromTheRight = isToTheLeft(p2, lastPoint, p);
          const x = pointCoordinateOnLine(int, lastPoint, p);
          result.push({ point: int, segment: i, x, crossesFromTheRight });
          break;
        }
        case "arc": {
          const [radius, sweep] = rest;
          const center = getCircleCenter(lastPoint, p, radius, sweep);
          if (norm(center, pointToLine(center, p1, p2)) > radius) break;

          const roots = intersectLineAndCircle(p1, p2, center, radius);

          for (const point of roots) {
            const x = pointCoordinateOnArc(point, lastPoint, p, radius, sweep);

            const pointOnLine = pointInsideLineBbox(point, p1, p2);
            if (!(0 < x && x < 1 && pointOnLine)) continue;

            const tangent = arcTangentAt(x, lastPoint, p, radius, sweep);
            const crossesFromTheRight = isToTheLeft(p2, ...tangent);
            result.push({ point, segment: i, x, crossesFromTheRight });
          }
          break;
        }
        default:
          throw new Error();
      }
      lastPoint = p;
    }
    return result;
  }

  /**
   * @param {Path} other
   * @returns {PathIntersection[]}
   */
  findPathIntersections(other) {
    /** @type {PathIntersection[]} */
    const intersections = [];
    let lastPoint = null;

    const nbControls = this.controls.length;
    for (let i = 0; i < nbControls; i++) {
      let [type, p, radius, sweep] = this.controls[i];

      switch (type) {
        case "moveTo":
          break;

        // biome-ignore lint/suspicious/noFallthroughSwitchClause: it's fine
        case "close":
          p = this.controls[0][1];

        case "lineTo": {
          const ints = other.intersectLine(lastPoint, p);
          for (const { point, ...other } of ints) {
            const x = pointCoordinateOnLine(point, lastPoint, p);
            const crossesFromTheRight = !other.crossesFromTheRight;
            const self = { segment: i, x, crossesFromTheRight };
            intersections.push({ point, other, self });
          }
          break;
        }
        case "arc": {
          const ints = other.intersectArc(lastPoint, p, radius, sweep);
          for (const { point, ...other } of ints) {
            const x = pointCoordinateOnArc(point, lastPoint, p, radius, sweep);
            const crossesFromTheRight = !other.crossesFromTheRight;
            const self = { segment: i, x, crossesFromTheRight };
            intersections.push({ point, other, self });
          }
          break;
        }

        default:
          throw new Error("failed");
      }
      lastPoint = p;
    }

    return intersections;
  }

  /**
   * @param {Path} other
   */
  intersectOpenPath(other) {
    if (
      this.controls.at(-1)[0] !== "close" ||
      other.controls.at(-1)[0] === "close"
    )
      throw new Error("this should be closed and other shoud be open");

    const intersections = this.findPathIntersections(other);

    if (intersections.length !== 2)
      throw new Error("expected exactly two intersections");

    let start = intersections[0].other;
    let end = intersections[1].other;

    if (
      start.segment > end.segment ||
      (start.segment === end.segment && start.x > end.x)
    )
      [start, end] = [end, start];

    return other.subpath(start.segment, start.x, end.segment, end.x);
  }

  /**
   * @param {Path} other
   */
  #findIntersectionLoops(other) {
    if (!this.isClosed() || !other.isClosed())
      throw new Error("boolean intersections require closed shapes");

    const rawIntersections = this.findPathIntersections(other);

    const loops = [];

    function sortIntersections(left, right, forSide) {
      const n1 = 10 * left[forSide].segment + left[forSide].x;
      const n2 = 10 * right[forSide].segment + right[forSide].x;
      return n1 - n2;
    }

    const length = rawIntersections.length;

    const intersections = [];

    for (let i = 0; i < length; i++) {
      const int = rawIntersections[i];
      intersections.push({ ...int, index: i });
    }

    const selfOrdered = intersections.toSorted((i1, i2) =>
      sortIntersections(i1, i2, "self"),
    );
    const otherOrdered = intersections.toSorted((i1, i2) =>
      sortIntersections(i1, i2, "other"),
    );

    for (let i = 0; i < length; i++) {
      const before = modulo(i - 1, length);
      const after = modulo(i + 1, length);
      for (const [info, ordered] of [
        [intersections[otherOrdered[i].index].other, otherOrdered],
        [intersections[selfOrdered[i].index].self, selfOrdered],
      ]) {
        info.order = i;
        info.after = ordered[after].index;
        info.before = ordered[before].index;
      }
    }

    const rotation = {
      other: other.rotatesClockwise(),
      self: this.rotatesClockwise(),
    };

    // walk loops
    for (let idx = 0; idx < length; idx++) {
      for (let side of ["self", "other"]) {
        const loop = [];

        let i = idx;
        let crossesFromTheRight = true;
        let counter = 0;

        do {
          const path = [i, side, !crossesFromTheRight];
          loop.push(path);

          const info = intersections[i][side];
          i = crossesFromTheRight ? info.after : info.before;

          const rot = rotation[side];
          side = side === "self" ? "other" : "self";
          crossesFromTheRight = rot === info.crossesFromTheRight;
          counter++;
        } while (i !== idx && counter < 10);
        if (counter === 10) throw new Error("failed to find loop");
        if (loop.length) loops.push(loop);
      }
    }

    return { loops, intersections };
  }

  /**
   * @param {Path} other
   */
  booleanDifference(other) {
    const { loops, intersections } = this.#findIntersectionLoops(other);

    if (loops.length === 0) throw new Error();
    // TODO: fix this bs
    let loop = loops[2];

    return this.fromIntersectionLoop(other, loop, intersections);
  }

  /**
   * @param {Path} other
   */
  booleanIntersection(other) {
    const { loops, intersections } = this.#findIntersectionLoops(other);

    const exploredPaths = {};

    // find intersection loop:
    // using an indexed loop because for legacy testing reasons we want to
    // return the first loop
    let loop;

    for (let i = 0; i < loops.length; i++) {
      loop = loops[i];
      for (const crossing of loop) {
        const key = crossing.toString();
        if (key in exploredPaths) {
          loop = loops[exploredPaths[key]];
          break;
        }
        exploredPaths[key] = i;
      }
    }

    if (loop === loops.at(-1) || loop == null) throw new Error();

    return this.fromIntersectionLoop(other, loop, intersections);
  }

  rotatesClockwise() {
    if (this.controls.at(-1)[0] !== "close")
      throw new Error("cannot determine rotation direction of an open path");

    const points = this.controls.slice(0, -1).map((c) => c[1]);
    return signedArea(points) < 0;
  }

  /**
   * @param {Path} other
   */
  merge(other) {
    if (this.controls.length === 0) {
      this.controls.push(...other.controls);
      return;
    }

    if (this.isClosed()) throw new Error("cannot merge to a closed path");

    if (norm(other.controls[0][1], this.controls.at(-1)[1]) > 1e-1) {
      this.lineTo(other.controls[0][1]);
      this.controls.push(...other.controls.slice(1));
    } else this.controls.push(...other.controls.slice(1));

    if (norm(this.controls[0][1], other.controls.at(-1)[1]) < eps) this.close();
  }

  /**
   * Inserts open subpath into self. No safety checks
   * @param {number} idx
   * @param {Path} other
   */
  insert(idx, other) {
    if (this.controls.length === 0) {
      this.controls.push(...other.controls);
      return;
    }

    if (other.isClosed()) throw new Error("cannot insert a closed path");
    const [firstControl, ...rest] = other.controls;

    if (firstControl[0] !== "moveTo") throw new Error();

    firstControl[0] = "lineTo";

    this.controls.splice(idx, 0, firstControl, ...rest);
  }

  invert() {
    const path = new Path();
    const [type, point] = this.controls.at(-1);
    path.moveTo(type === "close" ? this.controls[0][1] : point);

    const length = this.controls.length;

    for (let i = length - 1; i > 0; i--) {
      const [, lastPoint] = this.controls[i - 1];
      const [type, , maybeRadius, maybeSweep] = this.controls[i];

      switch (type) {
        case "close":
        case "lineTo":
          path.lineTo(lastPoint);
          break;
        case "arc":
          path.arc(lastPoint, maybeRadius, maybeSweep ? 0 : 1);
          break;
        default:
          throw new Error();
      }
    }
    if (type === "close") path.close();
    return path;
  }

  /**
   * @param {number} segment
   * @param {number} x
   */
  evaluate(segment, x) {
    let [[, lastPoint], [type, p, maybeRadius, maybeSweep]] =
      this.controls.slice(segment - 1);
    switch (type) {
      // biome-ignore lint/suspicious/noFallthroughSwitchClause: <explanation>
      case "close":
        p = this.controls[0][1];
      case "lineTo":
        return placeAlong(lastPoint, p, { fraction: x });
      case "arc":
        return evaluateArc(x, lastPoint, p, maybeRadius, maybeSweep);
      default:
        throw new Error();
    }
  }

  getLengthInfo() {
    let result = 0;
    const mapping = [];
    for (const [
      ,
      lp,
      type,
      p,
      maybeRadius,
      maybeSweep,
    ] of this.iterateOverSegments()) {
      const before = result;
      let length = 0;
      switch (type) {
        case "lineTo": {
          length = norm(lp, p);
          break;
        }
        case "arc": {
          length =
            Math.abs(getArcAngularLength(lp, p, maybeRadius, maybeSweep)) *
            maybeRadius;
          break;
        }
        default:
          throw new Error();
      }
      result += length;
      mapping.push({ startsAt: before, endsAt: result, length });
    }
    return { length: result, info: mapping };
  }

  /**
   * @param {number} radius
   */
  static makeCircle(radius) {
    const result = new Path();
    result.moveTo([-radius, 0]);
    result.arc([radius, 0], radius, 0);
    result.arc([-radius, 0], radius, 0);
    result.close();
    return result;
  }

  /**
   * @param {types.Point[]} polyline
   */
  static fromPolyline(polyline) {
    const result = new Path();
    const [first, ...rest] = polyline;
    result.moveTo(first);
    for (const p of rest) result.lineTo(p);
    result.close();
    return result;
  }

  /**
   * @param {number} x
   */
  evaluateAnywhere(x) {
    if (x < 0 || x > 1) throw new TypeError();

    const { length, info } = this.getLengthInfo();
    const pos = length * x;

    const i = info.findIndex(({ endsAt }) => endsAt >= pos);
    const { startsAt, endsAt } = info[i];

    if (endsAt === startsAt) throw new Error("problem");

    const localPos = (pos - startsAt) / (endsAt - startsAt);
    return this.evaluate(i + 1, localPos);
  }

  /**
   * @param {number} startSegment
   * @param {number} startX
   * @param {number} endSegment
   * @param {number} endX
   * @returns {Path}
   *
   * TODO index at zero
   */
  subpath(startSegment, startX, endSegment, endX, invert = false) {
    const result = new Path();
    result.moveTo(this.evaluate(startSegment, startX));

    const length = this.controls.length;
    startSegment = modulo(startSegment, length);
    endSegment = modulo(endSegment, length);

    let shouldSkip = startSegment === endSegment && startX > endX === !invert;
    for (let i = startSegment; ; i = modulo(invert ? i - 1 : i + 1, length)) {
      if (i === 0) continue;

      const [, lastPoint] = this.controls[i - 1];
      const [type, point, maybeRadius, maybeSweep] = this.controls[i];
      let p = invert ? lastPoint : point;

      switch (type) {
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: <explanation>
        case "close":
          p = invert ? lastPoint : this.controls[0][1];
        case "lineTo":
          result.lineTo(p);
          break;
        case "arc":
          result.arc(p, maybeRadius, invert !== !!maybeSweep ? 1 : 0);
          break;
        default:
          throw new Error();
      }
      if (i === endSegment && !shouldSkip) break;
      shouldSkip = false;
    }
    const end = this.evaluate(endSegment, endX);
    result.controls.at(-1)[1] = end;
    result.simplify();
    return result;
  }

  /**
   * @param {types.Point} p
   * @returns {Path}
   */
  translate(p) {
    const result = new Path();
    result.controls = this.controls.map((control) => {
      const result = [...control];
      if (!result[1]) return result;
      result[1] = plus(result[1], p);
      return result;
    });
    return result;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {Path}
   */
  scale(x, y) {
    const result = new Path();
    result.controls = this.controls.map((control) => {
      const result = [...control];
      if (!result[1]) return result;
      result[1] = [result[1][0] * x, result[1][1] * y];
      if (result[3] != null && x * y < 0) result[3] = result[3] === 0 ? 1 : 0;
      return result;
    });
    return result;
  }

  /**
   * @param {number} angle
   * @param {types.Point} center
   * @returns {Path}
   */
  rotate(angle, center = [0, 0]) {
    const result = new Path();
    result.controls = this.controls.map((control) => {
      const result = [...control];
      if (!result[1]) return result;
      result[1] = rotatePoint(center, control[1], angle);
      return result;
    });
    return result;
  }

  toString() {
    let result = "";
    for (const [type, [x, y], maybeRadius, maybeFlag] of this.controls) {
      switch (type) {
        case "moveTo":
          result += `M ${x} ${y}`;
          break;

        case "lineTo":
          result += ` L ${x} ${y}`;
          break;

        case "arc":
          result += ` A ${maybeRadius} ${maybeRadius} 0 0 ${maybeFlag} ${x} ${y}`;
          break;

        case "close":
          result += " Z";
          break;
        default:
          throw new Error("failed");
      }
    }
    return result;
  }

  clone() {
    const result = new Path();
    result.controls = structuredClone(this.controls);
    return result;
  }

  isClosed() {
    return this.controls.at(-1)[0] === "close";
  }

  /**
   * @param {number} offset
   */
  offset(offset) {
    function offsetSegment(t0, t1, offset) {
      const distance = Math.abs(offset);
      const folded = placeAlong(t0, t1, { distance });
      const p2 = rotatePoint(
        t0,
        folded,
        (offset * Math.PI) / 2 / (distance || 1),
      );
      return [p2, plus(minus(p2, t0), t1)];
    }

    function offsetArc(lastPoint, point, radius, sweep, offset) {
      const center = getCircleCenter(lastPoint, point, radius, sweep);
      const delta = offset * (2 * sweep - 1);
      const start = placeAlong(lastPoint, center, { fromStart: delta });
      const end = placeAlong(point, center, { fromStart: delta });
      return [start, end, radius - delta, sweep];
    }
    const result = this.clone();

    const length = this.controls.length;

    for (let i = 1; i < length; i++) {
      const [lastType, lp] = this.controls[i - 1];
      const [type, p, r1, s1] = this.controls[i];
      const [nextType, np, r2, s2] = this.controls[i + 1] ?? [];

      let p0, p1, p2, p3;
      let nr1, nr2;

      if (type === "lineTo" && nextType == null) {
        [p0, p1] = offsetSegment(lp, p, offset);
        result.controls[i][1] = p1;
      } else if (type === "lineTo" && nextType === "lineTo") {
        [p0, p1] = offsetSegment(lp, p, offset);
        [p2, p3] = offsetSegment(p, np, offset);
        result.controls[i][1] = intersectLines(p0, p1, p2, p3);
      } else if (type === "lineTo" && nextType === "arc") {
        [p0, p1] = offsetSegment(lp, p, offset);
        [p2, p3, nr2] = offsetArc(p, np, r2, s2, offset);
        result.controls[i][1] = intersectLineAndArc(p0, p1, p2, p3, nr2, s2);
      } else if (type === "arc" && nextType === "lineTo") {
        [p0, p1, nr1] = offsetArc(lp, p, r1, s1, offset);
        [p2, p3] = offsetSegment(p, np, offset);
        result.controls[i][1] = intersectLineAndArc(
          p2,
          p3,
          p0,
          p1,
          nr1,
          s1,
          true,
        );
        result.controls[i][2] = nr1;
      } else if (type === "arc" && nextType === "arc") {
        [p0, p1, nr1] = offsetArc(lp, p, r1, s1, offset);
        [p2, p3, nr2] = offsetArc(lp, p, r2, s2, offset);
        result.controls[i][1] = intersectTwoArcs(
          p0,
          p1,
          nr1,
          s1,
          p2,
          p3,
          nr2,
          s2,
        );
        result.controls[i][2] = nr1;
      }

      if (lastType === "moveTo") {
        result.controls[i - 1][1] = p0;
      }

      if (i + 2 === length) {
        result.controls[i + 1][1] = p3;
        if (nextType === "arc") result.controls[i + 1][2] = nr2;
      }
    }

    return result;
  }

  /**
   * @param {types.Point} l1
   * @param {types.Point} l2
   */
  findSegmentsOnLine(l1, l2) {
    const result = [];
    for (const [i, lp, type, p] of this.iterateOverSegments()) {
      if (type !== "lineTo") continue;
      if (!areOnSameLine(l1, l2, lp) || !areOnSameLine(l1, l2, p)) continue;
      result.push(i);
    }
    return result;
  }

  /**
   * @param {number} rawIndex
   */
  getSegmentAt(rawIndex) {
    const isClosed = this.isClosed();
    const length = this.controls.length + (isClosed ? -1 : 0);
    const prev = modulo(rawIndex - 1, length);
    const next = modulo(prev + 1, length);

    if (!isClosed && next === 0) return [];

    const [, lastPoint] = this.controls[prev];
    let [type, ...rest] = this.controls[next];
    if (type === "close")
      return [prev + 1, lastPoint, "lineTo", this.controls[0][1]];
    if (type === "moveTo") type = "lineTo";
    return [prev + 1, lastPoint, type, ...rest];
  }

  *iterateOverSegments() {
    const length = this.controls.length - 1;

    for (let i = 0; i < length; i++) {
      yield this.getSegmentAt(i + 1);
    }
  }

  *iterateOverJunctions() {
    const iterator = this.iterateOverSegments();
    const first = iterator.next().value;
    let lastOne = first;

    for (const info of iterator) {
      yield [lastOne, info];
      lastOne = info;
    }

    yield [lastOne, first];
  }

  getJunctionAt(index) {
    return [this.getSegmentAt(index), this.getSegmentAt(index + 1)];
  }

  /**
   * @param {Path} other
   *
   * Very limited functionnality for now, only merging paths with common lines
   */
  booleanUnion(other) {
    if (!this.isClosed() || !other.isClosed())
      throw new Error("paths should be closed to do boolean operations");

    for (const [seg, lastPoint, type, point] of this.iterateOverSegments()) {
      if (type !== "lineTo") continue;

      for (const [otherSeg, lp2, type, p2] of other.iterateOverSegments()) {
        if (type !== "lineTo") continue;

        if (norm(lastPoint, lp2) < eps && norm(point, p2) < eps) {
          const part = this.subpath(seg, 1, seg, 0);
          part.merge(other.subpath(otherSeg, 0, otherSeg, 1, true));
          part.simplify();
          return part;
        }

        if (norm(lastPoint, p2) > eps || norm(point, lp2) > eps) continue;

        const part = this.subpath(seg, 1, seg, 0);
        const part2 = other.subpath(otherSeg, 1, otherSeg, 0);
        part.merge(part2);
        part.simplify();
        return part;
      }
    }

    throw new Error("did not find a common line");
  }

  /**
   * @param {number} offset
   * @param {boolean} roundStart
   * @param {boolean} roundEnd
   */
  thickenAndClose(offset, roundStart = false, roundEnd = false) {
    const result = this.clone();
    let end = this.invert();
    end = end.offset(offset);

    const sweep = offset > 0 ? 0 : 1;
    const diameter = Math.abs(offset) / 2;
    if (roundEnd) result.arc(end.controls[0][1], diameter, sweep);
    else result.lineTo(end.controls[0][1]);

    result.merge(end);

    if (roundStart) result.arc(result.controls[0][1], diameter, sweep);

    result.close();
    result.simplify();

    return result;
  }

  repr() {
    let result = "const pathToRename = new Path();\n";
    for (const [type, [x, y], maybeRadius, maybeFlag] of this.controls) {
      switch (type) {
        case "moveTo":
          result += `pathToRename.moveTo([${x}, ${y}]);\n`;
          break;

        case "lineTo":
          result += `pathToRename.lineTo([${x}, ${y}]);\n`;
          break;

        case "arc":
          result += `pathToRename.arc([${x}, ${y}], ${maybeRadius}, ${maybeFlag});\n`;
          break;

        case "close":
          result += "pathToRename.close();";
          break;
        default:
          throw new Error("failed");
      }
    }
    return result;
  }

  fromIntersectionLoop(other, loop, intersections) {
    const path = new Path();

    for (let i = 1; i <= loop.length; i++) {
      const idx = i % loop.length;
      const [from, side, invert] = loop[i - 1];
      const [to] = loop[idx];
      // TODO: change loop datatype
      const { segment: startSegment, x: startX } = intersections[from][side];
      const { segment: endSegment, x: endX } = intersections[to][side];

      const sub = (side === "self" ? this : other).subpath(
        startSegment,
        startX,
        endSegment,
        endX,
        invert,
      );
      path.merge(sub);
    }

    path.simplify();
    return path;
  }
}
