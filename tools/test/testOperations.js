// @ts-check
import { convexHull } from "../operations.js";
import { Path } from "../path.js";
import bro from "./brotest/brotest.js";

bro.test("simple convex hull", () => {

  const geometries = [
    [[0, 0], [0, 1]], 
    [[1, 0], [1, 1]], 
  ]
  bro
    .expect(Path.fromPolyline(convexHull(...geometries)).toString())
    .toBe(
      "M 0 0 L 0 1 L 1 1 L 1 0 Z",
    );
});

bro.test("another convex hull", () => {

  const geometries = [
    [[0, 0], [0, 10]], 
    [[1, 0], [1, 10]], 
    [[1, 4], [1, -5]], 
    [[0, 9], [1, 0]], 
    [[5, 4], [1, 0]], 
  ]
  bro
    .expect(Path.fromPolyline(convexHull(...geometries)).toString())
    .toBe(
      "M 0 0 L 0 10 L 1 10 L 5 4 L 1 -5 Z",
    );
});

