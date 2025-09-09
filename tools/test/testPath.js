// @ts-check
import { plus, pointToLine, rotatePoint } from "../2d.js";
import { Path } from "../path.js";
import { debugGeometry, w3svg } from "../svg.js";
import bro from "./brotest/brotest.js";

bro.test("simple case", () => {
  const p = new Path();

  p.moveTo([-1, 0]);
  p.lineTo([-1, -1]);
  p.lineTo([1, -1]);
  p.arcTo([1, 1], 0.1);
  p.close();

  bro
    .expect(p.toString())
    .toEqual(
      "M -1 0 L -1 -1 L 0.8999999999999999 -1 A 0.1 0.1 0 0 1 1 -0.8999999999999999 L 1 1 Z",
    );
});

bro.test("mirror", () => {
  const p = new Path();

  p.moveTo([-1, 0]);
  p.lineTo([-1, -1]);
  p.lineTo([1, -1]);
  p.arcTo([1, 0], 0.2);
  p.mirror();

  // document.body.innerHTML += `
  // <svg height="1000" width="1000" viewBox="-2 -2 4 4" transform="rotate(-90)">
  //   <path fill="none" stroke="black" stroke-width="0.02" d="${p}"/>
  // </svg>
  // `

  bro
    .expect(p.toString())
    .toEqual(
      "M -1 0 L -1 -1 L 0.8 -1 A 0.2 0.2 0 0 1 1 -0.8 L 1.0000000000000009 0.8 A 0.2 0.2 0 0 1 0.8000000000000002 1 L -0.9999999999999999 1 Z",
    );
});

bro.test("mirror 2", () => {
  const spindleDiameter = 6;
  const mortiseWidth = 30;
  const woodThickness = 15;
  const path = new Path();
  path.moveTo([-spindleDiameter - mortiseWidth / 2, 0]);
  path.arc([-mortiseWidth / 2, 0], spindleDiameter / 2, 1);
  path.lineTo([-mortiseWidth / 2, woodThickness]);
  path.mirror([0, 0], [0, 1]);

  bro
    .expect(path.toString())
    .toEqual(
      "M -21 0 A 3 3 0 0 1 -15 0 L -15 15 L 15 15.000000000000005 L 15 0 A 3 3 0 0 1 21 0",
    );
});

const half = 500;
const radius = 100;
const interCenter = 1000;
const [bl, tl, tr, br] = [
  [0, 1000],
  [0, 0],
  [2000, 0],
  [1900, 1000],
];

const leftInnerEnd = pointToLine([half, 0], bl, br);
const loop = new Path();
loop.moveTo([half, half + radius]);
loop.arc([half, half - radius], radius, 1);
loop.lineTo([half + interCenter, half - radius]);
loop.arc([half + interCenter, half + radius], radius, 1);
loop.lineTo(pointToLine([half + interCenter, 0], bl, br));
loop.lineTo(br);
loop.lineTo(tr);
loop.lineTo(tl);
loop.lineTo(bl);
loop.lineTo(leftInnerEnd);
loop.close();

bro.test("intersect", () => {
  const center = [half + interCenter, half];
  const end = rotatePoint(center, [0, 1500], -Math.PI / 2);

  const intersections = loop.intersectLine(center, end);

  bro.expect(intersections).toEqual([
    {
      point: [1555.4700196225228, 583.2050294337844],
      segment: 3,
      x: 0.8128329581890014,
      crossesFromTheRight: false,
    },
    {
      point: [1833.3333333333333, 1000],
      segment: 5,
      x: 0.833333333333333,
      crossesFromTheRight: true,
    },
  ]);
});

bro.test("intersect arc", () => {
  const center = leftInnerEnd;
  const radius = 450;
  const start = plus(center, [50, -radius]);
  const end = plus(center, [50, radius]);
  const sweep = 0;

  const s = new Path();
  s.moveTo(start);
  s.arc(end, radius, sweep);
  s.close();

  const intersections = loop.intersectArc(start, end, radius, sweep);

  // debugGeometry(
  //   loop.toString(),
  //   s.toString(),
  //   intersections.map(int => int.point)
  // );

  bro.expect(intersections).toEqual([
    {
      point: [426.11625991783626, 567.3883740082163],
      segment: 1,
      x: 0.09249943128803638,
      crossesFromTheRight: false,
    },
    {
      point: [100, 1000],
      segment: 9,
      x: 0.19999999999999998,
      crossesFromTheRight: true,
    },
  ]);
});

bro.test("evaluate", () => {
  bro
    .expect(loop.evaluate(3, 0.833))
    .toRoughlyEqual([1550.090662536071, 586.5501330253019], 1e-6);
});

bro.test("get total length", () => {
  bro.expect(loop.getLengthInfo().length).toRoughlyEqual(7333.3, 1e-1);
});

bro.test("evaluate anywhere", () => {
  // const path = document.createElementNS(w3svg, "path");
  // path.setAttribute("d", loop.toString());
  // console.log(path.getPointAtLength(0.5 * 7333.3));
  bro
    .expect(loop.evaluateAnywhere(0.34))
    .toRoughlyEqual([1906.4682930709753, 935.3170692902487]);
  bro
    .expect(loop.evaluateAnywhere(0.5))
    .toRoughlyEqual([1766.6530464150237, 0]);
});

bro.test("subpath", () => {
  bro
    .expect(loop.subpath(3, 0.833, 5, 0.721).toString())
    .toBe(
      "M 1550.090662536071 586.5501330253019 A 100 100 0 0 1 1500 600 L 1500.0000000000002 1000 L 1788.4 1000",
    );
  bro
    .expect(loop.subpath(3, 0.833, 5, 0.721, true).toString())
    .toBe(
      "M 1550.090662536071 586.5501330253019 A 100 100 0 0 0 1500 400 L 500 400 A 100 100 0 0 0 500 600 L 500.00000000000006 1000 L 0 1000 L 0 0 L 2000 0 L 1900 1000 L 1788.4 1000",
    );

  const path = Path.fromD("M 0 0 L 0 10 L 10 10 L 10 0 Z");

  bro.expect(path.subpath(3, 0, 3, 1).toString()).toBe("M 10 10 L 10 0");
  bro.expect(path.subpath(3, 1, 3, 0, true).toString()).toBe("M 10 0 L 10 10");
  bro
    .expect(path.subpath(3, 0, 3, 1, true).toString())
    .toBe("M 10 10 L 0 10 L 0 0 L 10 0");
  bro
    .expect(path.subpath(3, 1, 3, 0).toString())
    .toBe("M 10 0 L 0 0 L 0 10 L 10 10");
  bro
    .expect(path.subpath(3, 0, 3, 1, true).toString())
    .toBe("M 10 10 L 0 10 L 0 0 L 10 0");
});

bro.test("more conmplex subpath", () => {
  const s = new Path();
  s.moveTo([0, 0]);
  s.lineTo([1, 0]);
  s.lineTo([1, 1]);
  s.arcTo([5, 4], 0.5);

  bro
    .expect(s.invert().toString())
    .toBe("M 5 4 L 1.2 1.15 A 0.5 0.5 0 0 1 1 0.7499999999999997 L 1 0 L 0 0");
  bro
    .expect(loop.invert().toString())
    .toBe(
      "M 500.00000000000006 1000 L 0 1000 L 0 0 L 2000 0 L 1900 1000 L 1500.0000000000002 1000 L 1500 600 A 100 100 0 0 0 1500 400 L 500 400 A 100 100 0 0 0 500 600 Z",
    );
});

bro.test("merge", () => {
  const path = loop.subpath(3, 0.833, 5, 0.721).invert();
  path.merge(loop.subpath(3, 0.833, 5, 0.721, true));

  bro
    .expect(path.toString())
    .toBe(
      "M 1788.4 1000 L 1500.0000000000002 1000 L 1500 600 A 100 100 0 0 0 1550.090662536071 586.5501330253019 A 100 100 0 0 0 1500 400 L 500 400 A 100 100 0 0 0 500 600 L 500.00000000000006 1000 L 0 1000 L 0 0 L 2000 0 L 1900 1000 L 1788.4 1000 Z",
    );
});

bro.test("from d", () => {
  const d =
    "M 1788.4 1000 L 1500.0000000000002 1000 L 1500 600 A 100 100 0 0 0 1550.090662536071 586.5501330253019 A 100 100 0 0 0 1500 400 L 500 400 A 100 100 0 0 0 500 600 L 500.00000000000006 1000 L 0 1000 L 0 0 L 2000 0 L 1900 1000 L 1788.4 1000 Z";
  const path = Path.fromD(d);
  bro.expect(path.toString()).toBe(d);

  const other =
    "M4375.3105556883547,4346.4491748110122 L4375.8378923837554,4346.5361921049107";

  bro
    .expect(Path.fromD(other).toString())
    .toBe(
      "M 4375.310555688355 4346.449174811012 L 4375.837892383755 4346.536192104911",
    );
});

bro.test("rotation direction", () => {
  const path = Path.fromD("M 0 1 L -1 0 L 0 -1 L 1 0 z");
  bro.expect(path.rotatesClockwise()).toBe(false);
  bro.expect(path.invert().rotatesClockwise()).toBe(true);
});

bro.test("boolean intersection", () => {
  const center = [half + interCenter, half];
  const end = plus(center, rotatePoint([0, 0], [1000, 0], Math.PI / 3));
  const end2 = plus(center, [1000, 0]);

  const s = new Path();
  s.moveTo(center);
  s.lineTo(end);
  s.lineTo(end2);
  s.close();

  const intersection = loop.booleanIntersection(s);

  bro
    .expect(intersection.toString())
    .toEqual(
      "M 1788.6751345948128 1000 L 1900 1000 L 1950 500 L 1600 500 A 100 100 0 0 1 1550 586.6025403784439 Z",
    );
});

bro.test("offset", () => {
  const path = Path.fromD(
    "M 900 700 A 200 200 0 0 0 900 1100 L 2020 1100 A 200 200 0 0 0 2020 700",
  );
  bro
    .expect(path.offset(100).toString())
    .toBe(
      "M 900 600 A 300 300 0 0 0 900 1200 L 2020 1200 A 300 300 0 0 0 2020 600",
    );
});

bro.test("negative offset", () => {
  const p = new Path();
  p.moveTo([719.8062264195162, -813.2232521764884]);
  p.arc([900, -700], 200, 0);
  p.lineTo([2020, -700]);
  p.arc([2200.193773580484, -986.7767478235116], 200, 0);
  p.lineTo([2809.035376609967, -1279.9794107166]);

  bro
    .expect(p.offset(10).toString())
    .toBe(
      "M 710.796537740492 -808.8844147853129 A 210 210 0 0 0 900.0000000000002 -689.9999999999999 L 2020.0000000000005 -689.9999999999999 A 210 210 0 0 0 2213.327661507556 -982.0025322537051 L 2813.3742140011427 -1270.969722037576",
    );
  bro
    .expect(p.offset(35).toString())
    .toBe(
      "M 688.2723160429315 -798.0373213073739 A 235 235 0 0 0 900.0000000000002 -665 L 2020 -665 A 235 235 0 0 0 2244.55217611936 -969.2915593709653 L 2824.2213074790816 -1248.4455003400149",
    );
  bro
    .expect(p.offset(-35).toString())
    .toBe(
      "M 751.3401367961009 -828.4091830456028 A 165 165 0 0 0 900 -735 L 2020 -735 A 165 165 0 0 0 2150.0909338553265 -1001.4955611278104 L 2793.8494457408524 -1311.513321093185",
    );
});

bro.test("simple line thicken", () => {
  let doorSpace = new Path();
  doorSpace.moveTo([0, 400]);
  doorSpace.lineTo([500, 400]);
  doorSpace = doorSpace.thickenAndClose(100);
  bro
    .expect(doorSpace.toString())
    .toBe("M 0 400 L 500 400 L 500 300 L 0 300 Z");
});

bro.test("thicken with rounding", () => {
  const doorSpace = new Path();
  doorSpace.moveTo([0, 400]);
  doorSpace.lineTo([500, 400]);
  const thicknened = doorSpace.thickenAndClose(100, true, true);
  const thicknened2 = doorSpace.invert().thickenAndClose(-100, false, true);
  bro
    .expect(thicknened.toString())
    .toBe("M 500 400 A 50 50 0 0 0 500 300 L 0 300 A 50 50 0 0 0 0 400 Z");

  bro
    .expect(thicknened2.toString())
    .toBe(
      "M 500 400 L 0 400 A 50 50 0 0 1 6.123233995736766e-15 300 L 500 300 Z",
    );
});

bro.test("thicken with rounding & scale", () => {
  let wallOutline = new Path();
  wallOutline.moveTo([0, 0]);
  wallOutline.lineTo([0, 300]);
  wallOutline = wallOutline.thickenAndClose(-50, false, true);
  wallOutline.scale(1, -1);
  bro
    .expect(wallOutline.toString())
    .toBe("M 0 0 L 0 300 A 25 25 0 0 1 -50 300 L -50 0 Z");
});

bro.test("issue with corners", () => {
  const radius = 5;
  const bigRadius = 15;
  const structThickness = 50;
  const structWidth = 70;

  let bottomProfile = new Path();
  bottomProfile.moveTo([-40, 0]);
  bottomProfile.lineTo([0, 0]);
  bottomProfile.arcTo([0, structThickness], radius);
  bottomProfile.arcTo([-structWidth, structThickness], radius);
  bottomProfile.arcTo([-structWidth, 0], bigRadius);
  bottomProfile.arcTo([-50, 0], bigRadius);
  bottomProfile.close();
  bottomProfile = bottomProfile.translate([0, 42]);

  bro
    .expect(bottomProfile.toString())
    .toBe(
      "M -40 42 L -5 42 A 5 5 0 0 1 0 47 L 0 87 A 5 5 0 0 1 -4.999999999999999 92 L -55 92 A 15 15 0 0 1 -70 77 L -70 57 A 15 15 0 0 1 -55 42 L -50 42 Z",
    );
});

bro.test("thicken", () => {
  const path = Path.fromD(
    "M 900 700 A 200 200 0 0 0 900 1100 L 2020 1100 A 200 200 0 0 0 2020 700",
  );
  bro
    .expect(path.thickenAndClose(100).toString())
    .toBe(
      "M 900 700 A 200 200 0 0 0 900 1100 L 2020 1100 A 200 200 0 0 0 2020 700 L 2020 800 A 100 100 0 0 1 2020 1000 L 900 1000 A 100 100 0 0 1 900 800 Z",
    );
});

bro.test("union", () => {
  const path = Path.fromD("M 0 0 L 0 10 L 10 10 L 10 0 Z");
  let path2 = Path.fromD("M 10 0 L 10 10 L 20 10 L 20 0 Z");

  bro
    .expect(path.booleanUnion(path2).toString())
    .toBe("M 10 0 L 0 0 L 0 10 L 20 10 L 20 0 Z");

  path2 = path2.invert();
  bro
    .expect(path.booleanUnion(path2).toString())
    .toBe("M 10 0 L 0 0 L 0 10 L 20 10 L 20 0 Z");
});

bro.test("union 2", () => {
  const path1 = new Path();
  path1.moveTo([2809.035376609967, -1279.9794107166]);
  path1.lineTo([2871.8921034601253, -900]);
  path1.lineTo([2220, -900]);
  path1.arc([2200.193773580484, -986.7767478235116], 200, 0);
  path1.close();

  const path2 = new Path();
  path2.moveTo([2871.892103460126, -900]);
  path2.lineTo([2945.630362317931, -454.2399111100681]);
  path2.lineTo([2200.193773580484, -813.2232521764884]);
  path2.arc([2220, -900], 200, 0);
  path2.close();

  bro
    .expect(path1.booleanUnion(path2).toString())
    .toBe(
      "M 2220 -900 A 200 200 0 0 0 2200.193773580484 -986.7767478235116 L 2809.035376609967 -1279.9794107166 L 2945.630362317931 -454.2399111100681 L 2200.193773580484 -813.2232521764884 A 200 200 0 0 0 2220 -900 Z",
    );
});

bro.test("rounded fillet", () => {
  const length = 400;
  const width = 300;

  const opening = new Path();
  opening.moveTo([0, 0]);
  opening.lineTo([length, 0]);
  opening.lineTo([length, width]);
  opening.roundFillet(10);
  opening.lineTo([0, width]);
  opening.roundFillet(10);
  opening.close();
  bro
    .expect(opening.toString())
    .toBe(
      "M 0 0 L 389.99999999999994 0 A 10 10 0 0 1 400 10.000000000000002 L 400 290.00000000000006 A 10 10 0 0 1 390 300 L 0 300 Z",
    );
});

bro.test("segment getter", () => {
  const path = new Path();
  path.moveTo([0, 0]);
  path.lineTo([10, 0]);
  path.lineTo([20, 30]);
  path.lineTo([0, 40]);
  path.close();

  bro.expect(path.getSegmentAt(0)).toEqual([4, [0, 40], "lineTo", [0, 0]]);
  bro.expect(path.getSegmentAt(1)).toEqual([1, [0, 0], "lineTo", [10, 0]]);
  bro.expect(path.getSegmentAt(2)).toEqual([2, [10, 0], "lineTo", [20, 30]]);
  bro.expect(path.getSegmentAt(3)).toEqual([3, [20, 30], "lineTo", [0, 40]]);
  bro.expect(path.getSegmentAt(-1)).toEqual([3, [20, 30], "lineTo", [0, 40]]);
  bro.expect(path.getSegmentAt(4)).toEqual([4, [0, 40], "lineTo", [0, 0]]);
});

bro.test("segment getter on open path", () => {
  const path = new Path();
  path.moveTo([0, 0]);
  path.lineTo([10, 0]);
  path.lineTo([20, 30]);
  path.lineTo([0, 40]);

  bro.expect(path.getSegmentAt(0)).toEqual([]);
  bro.expect(path.getSegmentAt(1)).toEqual([1, [0, 0], "lineTo", [10, 0]]);
  bro.expect(path.getSegmentAt(2)).toEqual([2, [10, 0], "lineTo", [20, 30]]);
  bro.expect(path.getSegmentAt(3)).toEqual([3, [20, 30], "lineTo", [0, 40]]);
  bro.expect(path.getSegmentAt(-1)).toEqual([3, [20, 30], "lineTo", [0, 40]]);
  bro.expect(path.getSegmentAt(4)).toEqual([]);
});

bro.test("juntion getter", () => {
  const path = new Path();
  path.moveTo([0, 0]);
  path.lineTo([10, 0]);
  path.lineTo([20, 30]);
  path.lineTo([0, 40]);
  path.close();

  bro.expect(path.getJunctionAt(0)).toEqual([
    [4, [0, 40], "lineTo", [0, 0]],
    [1, [0, 0], "lineTo", [10, 0]],
  ]);
  bro.expect(path.getJunctionAt(1)).toEqual([
    [1, [0, 0], "lineTo", [10, 0]],
    [2, [10, 0], "lineTo", [20, 30]],
  ]);
  bro.expect(path.getJunctionAt(2)).toEqual([
    [2, [10, 0], "lineTo", [20, 30]],
    [3, [20, 30], "lineTo", [0, 40]],
  ]);
  bro.expect(path.getJunctionAt(3)).toEqual([
    [3, [20, 30], "lineTo", [0, 40]],
    [4, [0, 40], "lineTo", [0, 0]],
  ]);
  bro.expect(path.getJunctionAt(4)).toEqual([
    [4, [0, 40], "lineTo", [0, 0]],
    [1, [0, 0], "lineTo", [10, 0]],
  ]);
  bro.expect(path.getJunctionAt(-1)).toEqual([
    [3, [20, 30], "lineTo", [0, 40]],
    [4, [0, 40], "lineTo", [0, 0]],
  ]);
});

bro.test("juntion getter", () => {
  const path = new Path();
  path.moveTo([0, 0]);
  path.lineTo([10, 0]);
  path.lineTo([20, 30]);
  path.lineTo([0, 40]);
  path.close();

  bro.expect([...path.iterateOverJunctions()]).toEqual([
    [
      [1, [0, 0], "lineTo", [10, 0]],
      [2, [10, 0], "lineTo", [20, 30]],
    ],
    [
      [2, [10, 0], "lineTo", [20, 30]],
      [3, [20, 30], "lineTo", [0, 40]],
    ],
    [
      [3, [20, 30], "lineTo", [0, 40]],
      [4, [0, 40], "lineTo", [0, 0]],
    ],
    [
      [4, [0, 40], "lineTo", [0, 0]],
      [1, [0, 0], "lineTo", [10, 0]],
    ],
  ]);
});

bro.test("rounded fillet all", () => {
  const length = 400;
  const width = 300;

  const opening = new Path();
  opening.moveTo([0, 0]);
  opening.lineTo([length, 0]);
  opening.lineTo([length, width]);
  opening.lineTo([0, width]);
  opening.close();
  opening.roundFilletAll(20);

  bro
    .expect(opening.toString())
    .toBe(
      "M 0 19.999999999999996 A 20 20 0 0 1 20.000000000000004 0 L 379.99999999999994 0 A 20 20 0 0 1 400 20.000000000000004 L 400 280 A 20 20 0 0 1 380 300 L 20.00000000000002 300 A 20 20 0 0 1 0 280 Z",
    );
});

bro.test("subpath", () => {
  const p = new Path();
  p.moveTo([775.3020396282533, -743.6337035063941]);
  p.arc([900, -700], 200, 0);
  p.lineTo([2020, -700]);
  p.arc([2200.193773580484, -986.7767478235116], 200, 0);
  p.lineTo([2809.035376609967, -1279.9794107166]);
  p.lineTo([3020.7713652560637, 0]);
  p.lineTo([4.686218540798811e-13, 0]);
  p.lineTo([-1.0023786182404826, -126.85785918685929]);
  p.lineTo([-52.8606882975925, -441.12647725640727]);
  p.lineTo([719.8062264195162, -813.2232521764884]);
  p.arc([775.3020396282533, -743.6337035063941], 200, 0);
  p.close();

  bro
    .expect(p.subpath(-2, 0, 4, 1).toString())
    .toBe(
      "M 719.8062264195162 -813.2232521764884 A 200 200 0 0 0 900 -700 L 2020 -700 A 200 200 0 0 0 2200.193773580484 -986.7767478235116 L 2809.035376609967 -1279.9794107166",
    );
});

bro.test("moves closing segment", () => {
  const p = Path.fromD("M 0 0 L 10 0 L 10 10 L 0 10 Z");

  bro
    .expect(p.moveClosingSegment(0).toString())
    .toBe("M 0 0 L 10 0 L 10 10 L 0 10 Z");
  bro
    .expect(p.moveClosingSegment(1).toString())
    .toBe("M 10 0 L 10 10 L 0 10 L 0 0 Z");
  bro
    .expect(p.moveClosingSegment(2).toString())
    .toBe("M 10 10 L 0 10 L 0 0 L 10 0 Z");
  bro
    .expect(p.moveClosingSegment(3).toString())
    .toBe("M 0 10 L 0 0 L 10 0 L 10 10 Z");
});
