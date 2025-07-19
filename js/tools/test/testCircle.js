// @ts-check
import { rotatePoint } from "../2d.js";
import { isInPieSlice, pointCoordinateOnArc } from "../circle.js";
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
