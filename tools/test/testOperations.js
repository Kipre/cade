import { convexHull, convexHullOld } from "../operations.js";
import { Path } from "../path.js";
import bro from "./brotest/brotest.js";

bro.test("simple convex hull", () => {
  const geometries = [
    [
      [0, 0],
      [0, 1],
    ],
    [
      [1, 0],
      [1, 1],
    ],
  ];
  bro
    .expect(convexHullOld(...geometries).toString())
    .toBe("M 0 0 L 1 0 L 1 1 L 0 1 Z");
});

bro.test("another convex hull", () => {
  const geometries = [
    [
      [0, 0],
      [0, 10],
    ],
    [
      [1, 0],
      [1, 10],
    ],
    [
      [1, 4],
      [1, -5],
    ],
    [
      [0, 9],
      [1, 0],
    ],
    [
      [5, 4],
      [1, 0],
    ],
  ];
  bro
    .expect(convexHullOld(...geometries).toString())
    .toBe("M 0 0 L 1 -5 L 5 4 L 1 10 L 0 10 Z");
});

bro.test("convex hull of aligned circles", () => {
  const radius = 12;
  const circles = [0, -50, -80].map((y) =>
    Path.makeCircle(radius).translate([0, y]),
  );

  bro
    .expect(convexHull(...circles).toString())
    .toBe(
      "M -12 -80 A 12 12 0 0 1 12 -80 L 12 0 A 12 12 0 0 1 -12 1.4695761589768238e-15 Z",
    );
});

bro.test("convex hull from a few paths", () => {
  bro
    .expect(
      convexHull(
        Path.makeCircle(5).translate([-10, 10]),
        Path.makeRoundedRect(20, 30, 2).translate([20, 10]),
        Path.makeRect(20, 10).translate([20, -10]),
      ).toString(),
    )
    .toBe(
      "M -15 10 A 5 5 0 0 1 -12.169780164824171 5.495329752763739 L 20 -10 L 40 -10 L 40 38 A 2 2 0 0 1 38 40 L 22 40 A 2 2 0 0 1 20.792467518379297 39.59432283613795 L -13.018831204051757 13.985807090344867 A 5 5 0 0 1 -15 9.999999999999996 Z",
    );
});
