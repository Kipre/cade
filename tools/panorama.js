//@ts-check

import { eps, rotatePoint } from "./2d.js";
import { normalizeAngle } from "./circle.js";
import { debugGeometry } from "./debug.js";
import { zero2 } from "./defaults.js";
import { Path } from "./path.js";
import { modulo } from "./utils.js";

/**
 * A helper to do arc-range operations: `start` and then rotate for
 * `span`, with span in [0, 2π] (0 is empty, 2π is full).
 */
export class Panorama {
  /**
   * @param {number} [start]
   * @param {number} [span]
   */
  constructor(start = 0, span = 2 * Math.PI) {
    this.start = start;
    this.span = span;
  }

  /**
   * @param {number} start
   * @param {number} end
   */
  static fromPair(start, end) {
    return new Panorama(
      normalizeAngle(start),
      modulo(end - start, 2 * Math.PI),
    );
  }

  /**
   * Debug drawing: spoke to `start`, then the arc.
   * @param {number} [radius]
   */
  toPath(radius = 10) {
    const result = new Path();
    result.moveTo([0, 0]);
    result.lineTo(rotatePoint(zero2, [radius, 0], this.start));
    if (this.empty()) return result;
    result.arc(
      rotatePoint(zero2, [radius, 0], this.start + this.span / 2),
      radius,
      1,
    );
    result.arc(
      rotatePoint(zero2, [radius, 0], this.start + this.span),
      radius,
      1,
    );
    return result;
  }

  empty() {
    return this.span < eps;
  }

  full() {
    return this.span >= 2 * Math.PI - eps;
  }

  /** @param {number} angle */
  contains(angle) {
    return modulo(angle - this.start, 2 * Math.PI) <= this.span;
  }

  /**
   * Throws if the result would be two arcs.
   * @param {Panorama} other
   */
  intersectSelf(other) {
    if (other.full()) return;
    if (this.full()) {
      this.start = other.start;
      this.span = other.span;
      return;
    }

    const offset = modulo(other.start - this.start, 2 * Math.PI);

    if (offset < this.span - eps && offset + other.span - 2 * Math.PI > eps) {
      // console.log("intersect", this.toString(), "with", other.toString());
      // debugGeometry(this.toPath(10), other.toPath(12));
      throw new Error("panorama intersection results in two");
    }

    if (offset > this.span - eps) {
      this.span = Math.max(
        0,
        Math.min(this.span, offset + other.span - 2 * Math.PI),
      );
      return;
    }

    this.start = other.start;
    this.span = Math.min(this.span - offset, other.span);
  }

  /**
   * Throws if the result would be two arcs.
   * @param {Panorama} other
   */
  subtractSelf(other) {
    const TAU = 2 * Math.PI;
    if (this.empty() || other.empty()) return;
    if (other.full()) {
      this.span = 0;
      return;
    }
    if (this.full()) {
      this.start = normalizeAngle(other.start + other.span);
      this.span = TAU - other.span;
      return;
    }

    // work relative to this.start: this = [0, S], other = [o, o + L]
    const S = this.span;
    const L = other.span;
    const o = modulo(other.start - this.start, TAU);

    // other strictly inside this would leave [0, o] and [o + L, S]; the
    // second piece is dropped if it's only a sliver
    const dropped = S - (o + L);
    if (o > eps && dropped > 1e-3)
      throw new Error("panorama subtraction results in two");

    // what survives is [head, tail]
    const startsAtZero = o <= eps;
    const head = startsAtZero ? L : Math.max(0, o + L - TAU);
    const tail = startsAtZero ? S : Math.min(S, o);

    this.start = normalizeAngle(this.start + head);
    this.span = Math.max(0, tail - head);
  }

  /**
   * Widens both sides by `angle` (negative shrinks).
   * @param {number} angle
   */
  growSelf(angle) {
    if (this.full() && angle < 0) throw new Error("why shrink a full pano");

    // if (this.empty() && angle > 0) throw new Error("why grow an empty pano");

    this.start = normalizeAngle(this.start - angle);
    this.span = Math.max(0, Math.min(2 * Math.PI, this.span + 2 * angle));
  }

  /** @param {Panorama} other */
  includes(other) {
    if (this.full()) return true;
    const offset = modulo(other.start - this.start, 2 * Math.PI);
    return this.span - offset >= other.span - eps;
  }

  clone() {
    return new Panorama(this.start, this.span);
  }

  toString() {
    const fmt = new Intl.NumberFormat("en", { maximumFractionDigits: 3 });
    const pi = (/** @type {number} */ a) => `${fmt.format(a / Math.PI)}π`;
    const s = pi(this.start);
    const e = pi(this.start + this.span);
    const span = pi(this.span);
    if (this.empty()) return `EmptyPano(${s})`;
    if (this.full()) return `FullPano(${s})`;
    return `Panorama(${s} to ${e}, [${span}])`;
  }
}
