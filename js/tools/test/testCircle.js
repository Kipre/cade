// @ts-check

import { rotatePoint } from "../2d.js";
import {
  arcTangentAt,
  evaluateArc,
  isInPieSlice,
  pointCoordinateOnArc,
} from "../circle.js";
import bro from "./brotest/brotest.js";

bro.test("is in pie slice", () => {
  bro
    .expect(
      isInPieSlice(
        [585.7649282009756, 551.4235071799022],
        [550, 550],
        [550, 1450],
        450,
        0,
      ),
    )
    .toBe(false);
  bro
    .expect(
      isInPieSlice(
        [585.7649282009756, 551.4235071799022],
        [500, 600],
        [500, 400],
        100,
        1,
      ),
    )
    .toBe(false);
  bro
    .expect(
      isInPieSlice(
        [426.11625991783626, 567.3883740082163],
        [550, 550],
        [550, 1450],
        450,
        0,
      ),
    )
    .toBe(true);
  bro
    .expect(
      isInPieSlice(
        [426.11625991783626, 567.3883740082163],
        [500, 600],
        [500, 400],
        100,
        1,
      ),
    )
    .toBe(true);
  bro
    .expect(isInPieSlice([100, 1000], [550, 550], [550, 1450], 450, 0))
    .toBe(true);
  bro
    .expect(isInPieSlice([1000, 1000], [550, 550], [550, 1450], 450, 0))
    .toBe(false);

  bro
    .expect(
      isInPieSlice([500, 1447.213595499958], [550, 550], [550, 1450], 450, 0),
    )
    .toBe(true);
  bro
    .expect(
      isInPieSlice([500, 552.7864045000421], [550, 550], [550, 1450], 450, 0),
    )
    .toBe(true);
});

bro.test("point coordinate on arc", () => {
  bro
    .expect(
      pointCoordinateOnArc(
        rotatePoint([0, 0], [1, 0], 0.1 * Math.PI),
        [0, -1],
        [0, 1],
        1,
        0,
      ),
    )
    .toBe(-0.6);
});

bro.test("evaluate arc", () => {
  const eps = 1e-6;
  bro
    .expect(evaluateArc(0, [0, -1], [0, 1], 1, 0))
    .toRoughlyEqual([0, -1], eps);
  bro.expect(evaluateArc(1, [0, -1], [0, 1], 1, 0)).toRoughlyEqual([0, 1], eps);
  bro
    .expect(evaluateArc(0.5, [0, -1], [0, 1], 1, 0))
    .toRoughlyEqual([-1, 0], eps);
  bro
    .expect(evaluateArc(0.5, [0, -1], [0, 1], 1, 1))
    .toRoughlyEqual([1, 0], eps);
  bro
    .expect(evaluateArc(0.25, [0, -1], [0, 1], 1, 1))
    .toRoughlyEqual([Math.SQRT1_2, -Math.SQRT1_2], eps);
  bro
    .expect(evaluateArc(0.5, [-1, 0], [0, 1], 1, 0))
    .toRoughlyEqual([-Math.SQRT1_2, Math.SQRT1_2], eps);
  bro
    .expect(evaluateArc(0.5, [1, 0], [0, 1], 1, 1))
    .toRoughlyEqual([Math.SQRT1_2, Math.SQRT1_2], eps);
  bro
    .expect(evaluateArc(0.5, [1, 0], [0, 1], 1, 0))
    .toRoughlyEqual([1 - Math.SQRT1_2, 1 - Math.SQRT1_2], eps);
});

bro.test("find tangent", () => {
  const eps = 1e-6;
  bro.expect(arcTangentAt(0, [0, -1], [0, 1], 1, 0)).toRoughlyEqual(
    [
      [1, -1],
      [-1, -1],
    ],
    eps,
  );

  bro.expect(arcTangentAt(1, [0, -1], [0, 1], 1, 0)).toRoughlyEqual(
    [
      [-1, 1],
      [1, 1],
    ],
    eps,
  );
  bro.expect(arcTangentAt(0.5, [0, -1], [0, 1], 1, 0)).toRoughlyEqual(
    [
      [-1, -1],
      [-1, 1],
    ],
    eps,
  );
  bro.expect(arcTangentAt(0.5, [0, -1], [0, 1], 1, 1)).toRoughlyEqual(
    [
      [1, -1],
      [1, 1],
    ],
    eps,
  );
  bro.expect(arcTangentAt(0.25, [0, -1], [0, 1], 1, 1)).toRoughlyEqual(
    [
      [0, -1.4142135381698608],
      [1.4142135381698608, 0],
    ],
    eps,
  );
});
