//@ts-check

import { eps, rotatePoint } from "./2d.js";
import { normalizeAngle } from "./circle.js";
import { zero2 } from "./defaults.js";
import { Path } from "./path.js";
import { modulo } from "./utils.js";

const TAU = 2 * Math.PI;

/**
 * @typedef {[] | [Panorama] | [Panorama, Panorama]} PanoOpResult
 */

/**
 * A helper to do arc-range operations: `start` and then rotate for
 * `span`, with span in [0, 2π] (0 is empty, 2π is full). Immutable: every
 * operation returns a new panorama (or one of its inputs, as is).
 */
export class Panorama {
  /**
   * @param {number} [start]
   * @param {number} [span]
   */
  constructor(start = 0, span = TAU) {
    /** @readonly */
    this.start = normalizeAngle(start);
    /** @readonly */
    this.span = span;
    Object.freeze(this);
  }

  /**
   * @param {number} start
   * @param {number} end
   */
  static fromPair(start, end) {
    return new Panorama(start, modulo(end - start, TAU));
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
    return this.span >= TAU - eps;
  }

  /** @param {number} angle */
  contains(angle) {
    return modulo(angle - this.start, TAU) <= this.span;
  }

  /**
   * @param {Panorama} other
   * @returns {PanoOpResult}
   */
  intersect(other) {
    if (this.empty() || other.empty()) return [];
    if (other.full()) return [this];
    if (this.full()) return [other];

    const S = this.span;
    const L = other.span;
    const o = modulo(other.start - this.start, TAU);

    if (o < S - eps && o + L - TAU > eps) {
      return [
        new Panorama(this.start, o + L - TAU),
        new Panorama(other.start, S - o),
      ];
    }

    // other starts after this ends: only its wrap over [0, ...] can overlap
    if (o > S - eps) {
      const span = Math.min(S, o + L - TAU);
      return span > eps ? [new Panorama(this.start, span)] : [];
    }

    return [new Panorama(other.start, Math.min(S - o, L))];
  }

  /**
   * @param {Panorama} other
   * @returns {PanoOpResult}
   */
  subtract(other) {
    if (this.empty()) return [];
    if (other.empty()) return [this];
    if (other.full()) return [];
    if (this.full()) {
      return [new Panorama(other.start + other.span, TAU - other.span)];
    }

    // work relative to this.start: this = [0, S], other = [o, o + L]
    const S = this.span;
    const L = other.span;
    const o = modulo(other.start - this.start, TAU);

    // other strictly inside this would leave [0, o] and [o + L, S];
    const residue = S - (o + L);
    if (o > eps && residue > eps) {
      return [
        new Panorama(this.start, o),
        new Panorama(this.start + o + L, residue),
      ];
    }

    // what survives is [head, tail]
    const startsAtZero = o <= eps;
    const head = startsAtZero ? L : Math.max(0, o + L - TAU);
    const tail = startsAtZero ? S : Math.min(S, o);

    if (tail - head < eps) return [];

    return [new Panorama(this.start + head, tail - head)];
  }

  /**
   * Widens both sides by `angle` (negative shrinks).
   * @param {number} angle
   * @returns {Panorama}
   */
  grow(angle) {
    if (this.full() && angle < 0) throw new Error("why shrink a full pano");

    // if (this.empty() && angle > 0) throw new Error("why grow an empty pano");

    return new Panorama(
      this.start - angle,
      Math.max(0, Math.min(TAU, this.span + 2 * angle)),
    );
  }

  /** @param {Panorama} other */
  includes(other) {
    if (this.full()) return true;
    const offset = modulo(other.start - this.start, TAU);
    return this.span - offset >= other.span - eps;
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
