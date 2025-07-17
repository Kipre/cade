// @ts-check
/** @import * as types from './types' */

import {
  areOnSameLine,
  computeAngleBetween,
  computeVectorAngle,
  intersectLines,
  minus,
  mirrorPoint,
  norm,
  offsetPolyline,
  placeAlong,
  plus,
  pointInsideLineBbox,
  pointToLine,
} from "./2d.js";
import { getCircleCenter } from "./circle.js";
import { debugGeometry } from "./svg.js";

const eps = 1e-5;

export class Path {
  constructor() {
    this.controls = [];
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

  mirror() {
    const [[first, firstPoint]] = this.controls;
    const [last, lastPoint] = this.controls.at(-1);

    if (first !== "moveTo") throw new Error("path not well formed");
    if (last === "close") throw new Error("can't mirror a closed path");

    for (let i = this.controls.length - 1; i > 0; i--) {
      const [type, point, maybeRadius, maybeSweepFlag] = this.controls[i];
      const [, p] = this.controls[i - 1];

      const mirrored = mirrorPoint(p, firstPoint, lastPoint);

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

    this.close();
    this.simplify();
  }

  /**
   * @param {types.Point} p1
   * @param {types.Point} p2
   * @param {boolean} checkBounds
   * @returns {types.Point[]}
   */
  intersect(p1, p2, checkBounds = true) {
    const result = [];
    let firstPoint;
    let lastPoint;

    for (let [type, p, ...rest] of this.controls) {
      switch (type) {
        case "moveTo":
          firstPoint = p;
          break;
        case "close": {
          if (Math.abs(norm(lastPoint, firstPoint)) < eps) break;
          p = firstPoint;
        }
        case "lineTo": {
          if (lastPoint == null) throw new Error();
          const int = intersectLines(lastPoint, p, p1, p2);
          if (int == null) break;
          if (
            pointInsideLineBbox(int, lastPoint, p) &&
            (!checkBounds || pointInsideLineBbox(int, p1, p2))
          )
            result.push(int);
          break;
        }
        case "arc": {
          const [radius, sweep] = rest;
          const center = getCircleCenter(lastPoint, p, radius, sweep);
          const [cx, cy] = center;
          if (pointToLine([cx, cy], p1, p2) > radius) break;

          const l1 = minus(p1, center);
          const l2 = minus(p2, center);
          const [dx, dy] = minus(l2, l1);
          const dr = norm([dx, dy]);
          const D = l1[0] * l2[1] - l2[0] * l1[1];

          const delta = radius ** 2 * dr ** 2 - D ** 2;

          const sgn = dy > 0 ? 1 : -1;
          const roots = [];
          if (Math.abs(delta) < eps || delta > 0) {
            const ix = (D * dy + sgn * dx * Math.sqrt(delta)) / dr ** 2;
            const iy = (-D * dx + Math.abs(dy) * Math.sqrt(delta)) / dr ** 2;
            roots.push(plus([ix, iy], center));
          }
          if (delta > 0) {
            const ix = (D * dy - sgn * dx * Math.sqrt(delta)) / dr ** 2;
            const iy = (-D * dx - Math.abs(dy) * Math.sqrt(delta)) / dr ** 2;
            roots.push(plus([ix, iy], center));
          }

          for (const root of roots) {
            const u = computeVectorAngle(minus(p, lastPoint));
            const v = computeVectorAngle(minus(root, lastPoint));
            const angleInBetween = sweep && (v - u) < 0;

            if (
              angleInBetween &&
              (!checkBounds || pointInsideLineBbox(root, p1, p2))
            )
              result.push(root);
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
}
