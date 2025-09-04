// @ts-check

import { projectToPlane } from "../3d.js";
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
