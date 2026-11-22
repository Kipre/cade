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
      "M -15 10 A 5 5 0 0 1 -12.169780164824171 5.495329752763739 L 20 -10 L 40 -10 L 40 38 A 2 2 0 0 1 38 40 L 22 40 A 2 2 0 0 1 20.792467518379297 39.59432283613795 L -13.018831204051757 13.985807090344867 A 5 5 0 0 1 -15 10.000000000000009 Z",
    );
});

bro.test("convex hull of two offset rounded rects", () => {
  const topJunctionOffset = 34.16666666666667;
  const smallerBeamProfile = Path.makeRoundedRect(30, 50, 4);
  const topRailProfile = Path.makeRoundedRect(30, 65, 4);
  bro
    .expect(
      convexHull(
        smallerBeamProfile.recenter({ x: "start", y: "start" }),
        topRailProfile
          .recenter({ x: "start", y: "start" })
          .translate([0, topJunctionOffset]),
      ).toString(),
    )
    .toBe(
      "M 1.7763568394002505e-15 3.999999999999999 A 4 4 0 0 1 4.000000000000001 4.440892098500626e-16 L 26 0 A 4 4 0 0 1 30 4 L 30 95.16666666666667 A 4 4 0 0 1 26 99.16666666666667 L 3.9999999999999933 99.16666666666667 A 4 4 0 0 1 0 95.16666666666667 Z",
    );
});

bro.test("hull of vertically aligned point and circle", () => {
  bro
    .expect(
      convexHull(
        Path.makeCircle(10),
        Path.makeRect(5).translate([0, -40]),
      ).toString(),
    )
    .toBe(
      "M -10 -1.2246467991473533e-15 A 10 10 0 0 1 -9.682458365518539 -2.500000000000011 L 0 -40 L 5 -40 L 9.920307293423576 -1.2599615883220452 A 10 10 0 0 1 10 -4.440892098500626e-15 A 10 10 0 0 1 -10 1.2246467991473533e-15 Z",
    );
});
