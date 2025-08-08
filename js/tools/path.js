// @ts-check
/** @import * as types from './types' */

import {
  areOnSameLine,
  computeAngleBetween,
  computeVectorAngle,
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
  evaluateArc,
  getCircleCenter,
  intersectLineAndArc,
  intersectLineAndCircle,
  intersectTwoArcs,
  intersectTwoCircles,
  isInPieSlice,
  pointCoordinateOnArc,
} from "./circle.js";
import { debugGeometry } from "./svg.js";

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
    const tokens = path.split(" ");
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
          throw new Error("unsupported command");
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
  roundFillet(radius) {
    const [type, p3] = this.controls.pop();
    const [preType, p2] = this.controls.pop();
    const [, p1] = this.controls.at(-1);

    if (type !== "lineTo" || preType !== "lineTo")
      throw new Error("round fillets need lines to operate");

    let [oStart, center] = offsetPolyline([p1, p2, p3], radius);
    if (norm(oStart, center) > norm(p1, p2))
      [, center] = offsetPolyline([p1, p2, p3], -radius);

    const start = pointToLine(center, p1, p2);
    const end = pointToLine(center, p2, p3);

    const angle = computeAngleBetween(minus(start, center), minus(end, center));
    const sweepFlag = (angle / Math.abs(angle) + 1) / 2;

    if (norm(p1, start) > eps) this.lineTo(start);

    this.controls.push(["arc", end, radius, sweepFlag]);

    if (norm(p3, end) > eps) this.lineTo(p3);
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
    const toRemove = [];
    const nbControls = this.controls.length - 1;
    for (let i = 1; i < nbControls - 1; i++) {
      const [[_, p0], [type1, p1], [type2, p2]] = this.controls.slice(i - 1);
      if (type1 === "lineTo" && type2 === "lineTo" && areOnSameLine(p0, p1, p2))
        toRemove.unshift(i);
    }

    for (const i of toRemove) {
      this.controls.splice(i, 1);
    }
  }

  mirror(l1 = null, l2 = null) {
    const [[first, firstPoint]] = this.controls;
    const [last, lastPoint] = this.controls.at(-1);

    if (first !== "moveTo") throw new Error("path not well formed");
    if (last === "close") throw new Error("can't mirror a closed path");

    for (let i = this.controls.length - 1; i > 0; i--) {
      const [type, point, maybeRadius, maybeSweepFlag] = this.controls[i];
      const [, p] = this.controls[i - 1];

      const mirrored = mirrorPoint(p, l1 ?? firstPoint, l2 ?? lastPoint);

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
   */
  booleanIntersection(other) {
    if (
      this.controls.at(-1)[0] !== "close" ||
      other.controls.at(-1)[0] !== "close"
    )
      throw new Error("boolean intersections require closed shapes");

    /** @type {PathIntersection[]} */
    const rawIntersections = [];
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
            rawIntersections.push({ point, other, self });
          }
          break;
        }
        case "arc": {
          const ints = other.intersectArc(lastPoint, p, radius, sweep);
          for (const { point, ...other } of ints) {
            const x = pointCoordinateOnArc(point, lastPoint, p, radius, sweep);
            const crossesFromTheRight = !other.crossesFromTheRight;
            const self = { segment: i, x, crossesFromTheRight };
            rawIntersections.push({ point, other, self });
          }
          break;
        }

        default:
          throw new Error("failed");
      }
      lastPoint = p;
    }

    // determine intersection loops
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
      const before = (((i - 1) % length) + length) % length;
      const after = (((i + 1) % length) + length) % length;
      for (const [info, ordered] of [
        [intersections[otherOrdered[i].index].other, otherOrdered],
        [intersections[selfOrdered[i].index].self, selfOrdered],
      ]) {
        info.order = i;
        info.after = ordered[after].index;
        info.before = ordered[before].index;
      }
    }

    const exploredPaths = {};
    let intersectionLoop = null;

    const rotation = {
      other: other.rotatesClockwise(),
      self: this.rotatesClockwise(),
    };

    for (let idx = 0; idx < length; idx++) {
      for (let side of ["self", "other"]) {
        const loop = [];

        let i = idx;
        let crossesFromTheRight = true;
        let counter = 0;

        do {
          const path = [i, side, !crossesFromTheRight];

          const key = path.toString();
          if (exploredPaths[key] !== undefined) {
            intersectionLoop = loops[exploredPaths[key]];
            break;
          }
          exploredPaths[key] = loops.length;

          loop.push(path);

          const info = intersections[i][side];
          i = crossesFromTheRight ? info.after : info.before;

          const rot = rotation[side];
          side = side === "self" ? "other" : "self";
          crossesFromTheRight = rot === info.crossesFromTheRight;
          counter++;
        } while (i !== idx && counter < 10);
        if (counter === 10) throw new Error("failed to find loop");

        if (intersectionLoop) break;
        if (loop.length) loops.push(loop);
      }
      if (intersectionLoop) break;
    }

    const loop = intersectionLoop;
    const result = [];
    // for (const loop of loops) {
    if (loop == null) throw new Error();
    const path = new Path();

    for (let i = 1; i <= loop.length; i++) {
      const idx = i % loop.length;
      const [from, side, invert] = loop[i - 1];
      const [to] = loop[idx];
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
    //   result.push(path);
    // }

    // console.log(intersections);
    // console.log(loops);
    // debugGeometry(
    //   this,
    //   other,
    //   ...result.slice(0, 1),
    //   intersections.map((int) => int.point),
    // );
    return path;
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

    if (this.controls.at(-1)[0] === "close")
      throw new Error("cannot merge to a closed path");

    if (norm(other.controls[0][1], this.controls.at(-1)[1]) > 1e-1)
      throw new Error("cannot merge");

    this.controls.push(...other.controls.slice(1));
    if (norm(this.controls[0][1], other.controls.at(-1)[1]) < eps) this.close();
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

  /**
   * @param {number} startSegment
   * @param {number} startX
   * @param {number} endSegment
   * @param {number} endX
   * @returns {Path}
   */
  subpath(startSegment, startX, endSegment, endX, invert = false) {
    const result = new Path();
    result.moveTo(this.evaluate(startSegment, startX));

    const length = this.controls.length;

    for (
      let i = startSegment;
      ;
      i = (((invert ? i - 1 : i + 1) % length) + length) % length
    ) {
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
      if (i === endSegment) break;
    }
    const end = this.evaluate(endSegment, endX);
    result.controls.at(-1)[1] = end;
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
        result.controls[i][1] = intersectLineAndArc(p2, p3, p0, p1, nr1, s1);
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
   * @param {number} offset
   */
  thickenAndClose(offset) {
    const result = this.clone();
    let end = this.invert();
    end = end.offset(offset);
    result.lineTo(end.controls[0][1]);
    result.merge(end);
    result.close();

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
          result += `pathToRename.moveTo([${x}, ${y}]);\n`;
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
}
