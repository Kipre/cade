// @ts-check
import { Path } from "../path.js";
import { debugGeometry } from "../svg.js";
import bro from "./brotest/brotest.js";

const loop = Path.fromD(
  "M 900 1100 A 200 200 0 0 1 900 700 L 2020 700 A 200 200 0 0 1 2020 1100 L 2020 1800 L 2723.012841664187 1799.9999999999998 L 3020.7713652560633 0 L 0 0 L -5.03036317826557e-13 1800 L 899.9999999999999 1800 Z",
);

bro.test("first stair", () => {
  const d =
    "M 2020 900 L 3371.4533018536285 1550.8256086763372 L 2955.2347027881005 2072.7472237020447 Z";
  const path = Path.fromD(d);

  bro
    .expect(loop.booleanIntersection(path).toString())
    .toBe(
      "M 2200.193773580484 986.7767478235116 A 200 200 0 0 1 2144.697960371747 1056.366296493606 L 2725.540510909939 1784.7198172953433 L 2809.035376609966 1279.9794107165994 Z",
    );
});

const openPath = new Path();
openPath.moveTo([900, 735]);
openPath.arc([900, 1065], 165, 0);
openPath.lineTo([2020, 1065]);
openPath.arc([2020, 735], 165, 0);

bro.test("line intersection", () => {
  const closedPath = new Path();
  closedPath.moveTo([2725.5405109099393, 15.280182704656397]);
  closedPath.lineTo([2809.0353766099665, 520.0205892834003]);
  closedPath.lineTo([2137.1259528273144, 843.5951139147174]);
  closedPath.arc([2101.0536742416352, 798.3619072791562], 130, 0);
  closedPath.close();

  bro
    .expect(closedPath.intersectOpenPath(openPath).toString())
    .toBe(
      "M 2168.659863203899 828.4091830456026 A 165 165 0 0 0 2122.875817306691 770.9978053927749",
    );
});

bro.test("slightly more complex line intersection", () => {
  const closedPath = new Path();
  closedPath.moveTo([2020, 1030]);
  closedPath.arc([2048.927721414321, 1026.740628583637], 130, 0);
  closedPath.lineTo([2225.419126951135, 1800.0000000000002]);
  closedPath.lineTo([1908.0000000000002, 1800]);
  closedPath.lineTo([1908, 1030]);
  closedPath.close();

  bro
    .expect(closedPath.intersectOpenPath(openPath).toString())
    .toBe(
      "M 1908 1065 L 2020 1065 A 165 165 0 0 0 2056.715954102792 1060.8631055100009",
    );
});

bro.test("simple difference", () => {
  const firstPath = Path.fromD("M 0 0 L 0 10 L 10 10 L 10 0 Z");
  const secondPath = Path.fromD("M 5 5 L 5 20 L 8 20 L 8 5 Z");

  bro
    .expect(firstPath.booleanDifference(secondPath).toString())
    .toBe("M 10 10 L 10 0 L 0 0 L 0 10 L 5 10 L 5 5 L 8 5 L 8 10 Z");
});

bro.test("difference 1", () => {
  const firstPath = Path.fromD(
    "M 600 0 L 53.210678118654755 0 L 53.210678118654755 -70 L 600 -70 Z",
  );
  const secondPath = Path.fromD(
    "M 85 -35 A 3 3 0 0 0 85 -29 L 85 35 L 100 35 L 100 -29 A 3 3 0 0 0 100 -35 Z",
  );

  bro
    .expect(firstPath.booleanDifference(secondPath).toString())
    .toBe(
      "M 53.210678118654755 0 L 53.210678118654755 -70 L 600 -70 L 600 0 L 100 0 L 100 -29 A 3 3 0 0 0 100 -35 L 85 -35 A 3 3 0 0 0 85 -29 L 85 0 Z",
    );
});
