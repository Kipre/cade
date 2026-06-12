// @ts-check

import { collinear3, projectToPlane } from "../3d.js";
import { nx3, x3 } from "../defaults.js";
import bro from "./brotest/brotest.js";

bro.test("projections to plane", () => {
  bro
    .expect(projectToPlane([1, 1, 1], [0, 0, 0], [0, 0, 1]))
    .toEqual([1, 1, 0]);

  bro
    .expect(projectToPlane([1, 1, 1], [0, 0, 0], [0, 0, -1]))
    .toEqual([1, 1, 0]);

  bro
    .expect(projectToPlane([1, 1, 1], [0, 0, 0], [0, 0, -40]))
    .toEqual([1, 1, 0]);
});

bro.test("collinearity", () => {
  bro.expect(collinear3(x3, x3)).toBe(true);
  bro.expect(collinear3(x3, nx3)).toBe(true);
});
