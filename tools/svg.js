/**
 * @import { Point, Point3 } from "./types"
 */

export const w3svg = "http://www.w3.org/2000/svg";
const defaultMarginPercents = 5;

export class BBox {
  constructor(marginPercents = defaultMarginPercents) {
    this.left = [Number.POSITIVE_INFINITY, 0];
    this.bottom = [0, Number.POSITIVE_INFINITY];
    this.right = [Number.NEGATIVE_INFINITY, 0];
    this.top = [0, Number.NEGATIVE_INFINITY];

    this.zMin = Number.POSITIVE_INFINITY;
    this.zMax = Number.NEGATIVE_INFINITY;

    this.marginPercents = marginPercents;
    this.metadata = {};
  }

  /**
   * @param { Point | Point3 } point
   * @param { any } metadata
   */
  include(point, metadata = null) {
    if (metadata) this.metadata[point.toString()] = metadata;

    if (this.left[0] > point[0]) this.left = point;
    if (this.right[0] < point[0]) this.right = point;
    if (this.bottom[1] > point[1]) this.bottom = point;
    if (this.top[1] < point[1]) this.top = point;

    if (point[2] != null) {
      this.zMin = Math.min(this.zMin, point[2]);
      this.zMax = Math.max(this.zMax, point[2]);
    }
  }

  /**
   * @returns {Point | Point3}
   */
  extrema() {
    if (Number.isFinite(this.zMin))
      return [
        [this.left[0], this.bottom[1], this.zMin],
        [this.right[0], this.top[1], this.zMax],
      ];
    return [
      [this.left[0], this.bottom[1]],
      [this.right[0], this.top[1]],
    ];
  }

  /**
   * @param {BBox} other
   */
  combine(other) {
    for (const point of other.toPoints()) {
      this.include(point);
    }
    this.metadata = { ...this.metadata, ...other.metadata };

    if (Number.isFinite(other.zMax))
      for (const point of other.extrema()) {
        this.include(point);
      }
  }

  get xMax() {
    return this.right[0];
  }

  get xMin() {
    return this.left[0];
  }

  get yMax() {
    return this.top[1];
  }

  get yMin() {
    return this.bottom[1];
  }

  width() {
    return this.xMax - this.xMin;
  }

  height() {
    return this.yMax - this.yMin;
  }

  /** Returns the longest dimension in the cube */
  size() {
    const zSize = Object.is(Number.POSITIVE_INFINITY, this.zMin)
      ? 0
      : this.zMax - this.zMin;

    return Math.max(this.width(), this.height(), zSize);
  }

  /**
   * @returns {Point3 | Point}
   */
  center() {
    const result = [(this.xMax + this.xMin) / 2, (this.yMax + this.yMin) / 2];
    if (Object.is(Number.POSITIVE_INFINITY, this.zMin)) return result;
    return [...result, (this.zMax + this.zMin) / 2];
  }

  toViewBoxArray = (maybeMargin) => {
    const xDistance = Math.ceil(this.xMax - this.xMin);
    const yDistance = Math.ceil(this.yMax - this.yMin);
    const margin =
      maybeMargin ??
      (this.marginPercents / 100) * Math.max(xDistance, yDistance);
    return [
      Math.floor(this.xMin) - margin,
      Math.floor(this.yMin) - margin,
      xDistance + 2 * margin,
      yDistance + 2 * margin,
    ];
  };

  toViewBox = (maybeMargin) => {
    const values = this.toViewBoxArray(maybeMargin);
    return values.join(" ");
  };

  toDataset = (element) => {
    element.dataset.xMin = this.xMin;
    element.dataset.yMin = this.yMin;
    element.dataset.xMax = this.xMax;
    element.dataset.yMax = this.yMax;
  };

  toPoints = () => [this.bottom, this.right, this.top, this.left];

  static fromDataset(element) {
    const self = new BBox();
    const { xMin, yMin, xMax, yMax } = element.dataset;
    // a missing value means an empty box
    if ([xMin, yMin, xMax, yMax].includes(undefined)) return self;

    self.left = [Number.parseFloat(xMin), 0];
    self.bottom = [0, Number.parseFloat(yMin)];
    self.right = [Number.parseFloat(xMax), 0];
    self.top = [0, Number.parseFloat(yMax)];
    return self;
  }

  /**
   * @param {string?} viewBox
   *
   * Caution: will mess-up the margin
   */
  static fromViewBox(viewBox) {
    const self = new BBox();
    if (!viewBox) return self;

    const [xMin, yMin, xDistance, yDistance] = viewBox
      .split(" ")
      .map(Number.parseFloat);
    self.left = [xMin, 0];
    self.right = [xDistance + xMin, 0];
    self.bottom = [0, yMin];
    self.top = [0, yDistance + self.yMin];
    return self;
  }
}

export function addUse(href) {
  const use = document.createElementNS(w3svg, "use");
  use.setAttribute("href", href);
  return use;
}

export async function importDocument(path) {
  const r = await fetch(path);
  const doc = await r.text();
  const parser = new DOMParser();
  const mime = path.endsWith("html") ? "text/html" : "image/svg+xml";
  return parser.parseFromString(doc, mime);
}

/** @deprecated */
export function debugGeometry() { }
