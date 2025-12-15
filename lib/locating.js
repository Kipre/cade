// @ts-check
/** @import * as types from './cade/tools/types' */

import { a2m } from "../tools/transform.js";
import { nz3, zero3 } from "./defaults.js";

export class Locator {
  constructor() {
    this.support = null;
    this.contact = null;
  }

  /**
   * @param {import("./lib.js").LocatedPart} locatedFlatPart
   * @param {boolean} otherSide
   */
  onFlatPart(locatedFlatPart, otherSide = false) {
    const { child, placement } = locatedFlatPart;
    if (otherSide)
      this.support = placement.multiply(a2m([0, 0, child.thickness]));
    else this.support = placement.multiply(a2m(zero3, nz3));

    return this;
  }

  coorientedWith(location) {
    return this;
  }



  onPerforatedSurface(holeIterator) {
    const { transform: plane, hole } = holeIterator().next().value;
    plane.multiplySelf(a2m(zero3, nz3));
    this.contact = plane;

    return this;
  }

  locate() {
    return this.support.multiply(this.contact.inverse());
  }
}
