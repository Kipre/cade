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
    .toBe("M 1 1 L 0 1 L 0 0 L 1 0 Z");
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
    .toBe("M 1 10 L 0 10 L 0 0 L 1 -5 L 5 4 Z");
});

bro.test("convex hull of aligned circles", () => {
  const radius = 12;
  const circles = [0, -50, -80].map((y) =>
    Path.makeCircle(radius).translate([0, y]),
  );

  bro
    .expect(convexHull(...circles).toString())
    .toBe(
      "M 12 0 A 12 12 0 0 1 -12 1.4695761589768238e-15 L -11.976320741139258 -80.75348623435175 A 12 12 0 0 1 11.976320741139258 -80.75348623435175 Z",
    );
});
