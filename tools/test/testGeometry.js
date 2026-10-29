import { intersectLineAndPlane } from "../geometry.js";
import { a2m } from "../transform.js";
import bro from "./brotest/brotest.js";

bro.test("simple line and plane intersection", () => {
  const line = a2m([-30, 1000, 0], [0, -1000, 2400]);

  const plane = a2m([0, 0, 2500]);
  bro
    .expect(intersectLineAndPlane(line, plane))
    .toEqual([-30, -41.666666666666515, 2500]);
});
