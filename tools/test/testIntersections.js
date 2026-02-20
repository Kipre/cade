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
      "M 2809.0353766099665 1279.9794107165994 L 2725.5405109099383 1784.719817295343 L 2144.697960371747 1056.366296493606 A 200 200 0 0 0 2200.193773580484 986.7767478235116 Z",
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
    .toBe("M 5 5 L 8 5 L 8 10 L 10 10 L 10 0 L 0 0 L 0 10 L 5 10 Z");
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
      "M 85.00000000000003 0 L 53.210678118654755 0 L 53.210678118654755 -70 L 600 -70 L 600 0 L 100 0 L 100 -29 A 3 3 0 0 0 100 -35 L 85 -35 A 3 3 0 0 0 85 -29 Z",
    );
});


bro.test("intersect two halved circle", () => {
  const rollerThickness = 40;
  const rollerWidth = 52;
  const ballScrewPlateDiameter = 48;

  const rollerBbox = Path.makeRect(rollerWidth, rollerThickness).translate([-rollerWidth / 2, -rollerThickness / 2]);

  const result = Path.makeCircle(ballScrewPlateDiameter / 2)
    .booleanIntersection(rollerBbox);

  bro
    .expect(result.toString())
    .toBe(
      "M 13.2664991614216 20 A 24 24 0 0 0 13.266499161421601 -20 L -13.2664991614216 -20 A 24 24 0 0 0 -13.266499161421601 20 Z",
    );
});

bro.test("cut on line", () => {
  const p = new Path();
  p.moveTo([0, 0]);
  p.lineTo([0, 149]);
  p.lineTo([93.93398282201788, 149]);
  p.lineTo([200, 42.93398282201788]);
  p.lineTo([200, 0]);
  p.close();

  const l1 = [200, 35];
  const l2 = [199, 35];

  bro
    .expect(p.cutOnLine(l1, l2).toString())
    .toBe(
      "M 0 35 L 0 149 L 93.93398282201788 149 L 200 42.93398282201788 L 200 35 Z",
    );
});

bro.test("difference on round", () => {

  const p = new Path();
  p.moveTo([0, 35]);
  p.lineTo([0, 130]);
  p.lineTo([86, 130]);
  p.lineTo([86, 35]);
  p.lineTo([47.5, 35]);
  p.lineTo([47.5, 40]);
  p.arc([37.5, 50], 10, 1);
  p.lineTo([27.5, 50]);
  p.arc([17.5, 40], 10, 1);
  p.lineTo([17.5, 35]);
  p.close();

  const other = new Path();
  other.moveTo([1.5000000000000036, 20]);
  other.arc([-8.5, 29.999999999999996], 10, 0);
  other.lineTo([-8.5, 40]);
  other.arc([1.5000000000000018, 50], 10, 0);
  other.lineTo([11.500000000000004, 50]);
  other.arc([21.5, 40], 10, 0);
  other.lineTo([21.5, 30]);
  other.arc([11.5, 20], 10, 0);
  other.close();


  bro
    .expect(p.booleanDifference(other).toString())
    .toBe(
      "M 0 130 L 86 130 L 86 35 L 47.5 35 L 47.5 40 A 10 10 0 0 1 37.5 50 L 27.5 50 A 10 10 0 0 1 19.499999999999993 46.00000000000001 A 10 10 0 0 1 11.500000000000004 50 L 1.5000000000000018 50 A 10 10 0 0 1 -3.552713678800501e-15 49.886859966642604 Z",
    );
});

bro.test("simple union", () => {
  const firstPath = Path.fromD("M 0 0 L 0 10 L 10 10 L 10 0 Z");
  const secondPath = Path.fromD("M 5 5 L 5 20 L 8 20 L 8 5 Z");

  bro
    .expect(firstPath.realBooleanUnion(secondPath).toString())
    .toBe("M 0 10 L 0 0 L 10 0 L 10 10 L 8 10 L 8 20 L 5 20 L 5 10 Z");
});

bro.test("double difference", () => {
  const path = new Path();
  path.moveTo([-25, 0]);
  path.lineTo([-25, 61.40000000000001]);
  path.lineTo([90, 61.4]);
  path.arc([100, 71.4], 10, 1);
  path.lineTo([100, 118.6]);
  path.arc([90, 128.6], 10, 1);
  path.lineTo([-25, 128.60000000000002]);
  path.lineTo([-25, 170]);
  path.lineTo([155, 170]);
  path.lineTo([155, 125]);
  path.lineTo([200, 124.99999999999997]);
  path.lineTo([200, 2.2737367544323206e-13]);
  path.close();


  const other = new Path();
  other.moveTo([2.465190328815662e-32, 52.43923078108367]);
  other.arc([0, 46.43923078108367], 3, 0);
  other.lineTo([-8.999999999999993, 46.43923078108367]);
  other.arc([-15, 46.43923078108367], 3, 0);
  other.lineTo([-15, 137.5607692189163]);
  other.arc([-15, 143.5607692189163], 3, 0);
  other.lineTo([0, 143.5607692189163]);
  other.close();

  bro
    .expect(path.booleanDifference(other).toString())
    .toBe("M -15 46.43923078108367 A 3 3 0 0 1 -8.999999999999993 46.43923078108367 L 0 46.43923078108367 A 3 3 0 0 1 2.465190328815662e-32 52.43923078108367 L 2.2227668360177165e-32 61.40000000000001 L 90 61.4 A 10 10 0 0 1 100 71.4 L 100 118.6 A 10 10 0 0 1 90 128.6 L -3.552713678800501e-15 128.60000000000002 L 0 143.5607692189163 L -15 143.5607692189163 A 3 3 0 0 1 -15 137.5607692189163 L -15 128.60000000000002 L -25 128.60000000000002 L -25 170 L 155 170 L 155 125 L 200 124.99999999999997 L 200 2.2737367544323206e-13 L -25 0 L -25 61.40000000000001 L -15.000000000000004 61.40000000000002 Z");
});

bro.test("difference with overlapping lines", () => {
  const outer = new Path();
  outer.moveTo([-15, -99.5]);
  outer.lineTo([-15, 1099.5]);
  outer.lineTo([215, 1099.5]);
  outer.lineTo([215, -99.5]);
  outer.close();

  const inner = new Path();
  inner.moveTo([4.175860475189809e-15, 0]);
  inner.lineTo([1.1786269819680582e-13, 1000]);
  inner.lineTo([215.0000000000001, 1000]);
  inner.lineTo([215, 0]);
  inner.close();
  bro
    .expect(outer.booleanDifference(inner).toString())
    .toBe(
      "M 1.1786269819680582e-13 1000 L 4.175860475189809e-15 0 L 215 0 L 215 -99.5 L -15 -99.5 L -15 1099.5 L 215 1099.5 L 215 999.9999999999999 Z",
    );
});


bro.test("union with overlapping line", () => {
  const path = new Path();
  path.moveTo([115.99999999999997, -109.5]);
  path.lineTo([-55, -109.5]);
  path.lineTo([-55, 1109.5]);
  path.lineTo([115.99999999999991, 1109.5]);
  path.lineTo([115.99999999999999, 1000.0000000000001]);
  path.lineTo([-9.999999999999883, 1000]);
  path.lineTo([-9.999999999999883, 0]);
  path.lineTo([115.99999999999994, 0]);
  path.close();

  const chainSupport = Path.makeRect(55, 120).translate([-55, 1100]);
  bro
    .expect(path.realBooleanUnion(chainSupport).toString())
    .toBe(
      "M -55 -109.5 L 115.99999999999997 -109.5 L 115.99999999999994 0 L -9.999999999999883 0 L -9.999999999999883 1000 L 115.99999999999999 1000.0000000000001 L 115.99999999999991 1109.5 L -7.105427357601002e-15 1109.5 L 0 1220 L -55 1220 L -55 1099.9999999999998 Z",
    );
});

