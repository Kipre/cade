import { norm, rotatePoint } from "../tools/2d.js";
import { mult3, norm3, plus3 } from "../tools/3d.js";
import { Path } from "../tools/path.js";
import { debugGeometry } from "../tools/svg.js";
import { a2m } from "../tools/transform.js";
import { z3, zero2 } from "./defaults.js";
import { cut, extrusion } from "./operations.js";
import { Part } from "./part.js";

export class LinearPart extends Part {
  /**
   * @param {string} name
   * @param {number} length
   * @param {import("../tools/path.js").Path} outside
   * @param {import("../tools/path.js").Path[]} insides
   */
  constructor(name, length, outside, insides = []) {
    const shape = extrusion(a2m(), length, outside, ...insides);
    super(name, shape);
    this.length = length;
    this.outside = outside;
    this.insides = this.shape.retreive().insides;
    this.addSymmetries(a2m([0, 0, length / 2], z3));
  }

  height = () => this.outside.bbox().height();
  width = () => this.outside.bbox().width();

  /**
   * @param {import("../lib/operations.js").ShapeId[]} shapes
   */
  cut(...shapes) {
    this.shape = cut(this.shape, ...shapes);
    return this;
  }

  /*
   * Normal vector decides the orientation of the cut, [0, 0, 1] is straight
   * @param {"start" | "end" | "both"} side
   * @param {Point3} normal
   * @param {(Point | Point3)?} maybeStart -- allows for deciding where the cut should start
   * if omitted, the cut should be done to match the overall length;
   * TODO: implement extending the length if the cut requires it
   */
  cutEdge(side, normal, maybeStart) {
    const twoD = normal.slice(0, 2);
    // find the highest point
    const angle = Math.atan2(...twoD.toReversed());

    let startOne = maybeStart;
    let startTwo = maybeStart;

    const bbox = this.outside.rotate(-angle).bbox();
    if (!maybeStart) {
      startOne = [...rotatePoint(zero2, bbox.left, angle), 0];
      startTwo = [...rotatePoint(zero2, bbox.right, angle), 0];
    }

    const size = 2 * Math.max(this.length, bbox.size());

    const cuts = [];
    if (side === "start" || side === "both")
      cuts.push(
        extrusion(
          a2m(startTwo, mult3(normal, -1)),
          size,
          Path.makeRect(size).recenter(),
        ),
      );
    if (side === "end" || side === "both")
      cuts.push(
        extrusion(
          a2m(plus3(startOne, [0, 0, this.length]), normal),
          size,
          Path.makeRect(size).recenter(),
        ),
      );
    this.cut(...cuts);
    this.newSymmetries = [];
  }
}
