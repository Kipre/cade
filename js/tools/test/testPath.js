// @ts-check
import { plus, pointToLine, rotatePoint } from "../2d.js";
import { Path } from "../path.js";
import { debugGeometry } from "../svg.js";
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
      "M -1 0 L -1 -1 L 0.8 -1 A 0.2 0.2 0 0 1 1 -0.8 L 1.0000000000000009 0.8 A 0.2 0.2 0 0 1 0.8000000000000002 1 L -0.9999999999999999 1 L -1 0 Z",
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
    .toRoughlyEqual([1550.0970458984375, 586.5651245117188], 1e-6);
});

bro.test("subpath", () => {
  bro
    .expect(loop.subpath(3, 0.833, 5, 0.721).toString())
    .toBe(
      "M 1550.0970458984375 586.5651245117188 A 100 100 0 0 1 1500 600 L 1500.0000000000002 1000 L 1788.4 1000",
    );
  bro
    .expect(loop.subpath(3, 0.833, 5, 0.721, true).toString())
    .toBe(
      "M 1550.0970458984375 586.5651245117188 A 100 100 0 0 0 1500 400 L 500 400 A 100 100 0 0 0 500 600 L 500.00000000000006 1000 L 0 1000 L 0 0 L 2000 0 L 1900 1000 L 1788.4 1000",
    );
});

bro.test("subpath", () => {
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
      "M 500 600 L 500.00000000000006 1000 L 0 1000 L 0 0 L 2000 0 L 1900 1000 L 1500.0000000000002 1000 L 1500 600 A 100 100 0 0 0 1500 400 L 500 400 A 100 100 0 0 0 500 600 Z",
    );
});

bro.test("merge", () => {
  const path = loop.subpath(3, 0.833, 5, 0.721).invert();
  path.merge(loop.subpath(3, 0.833, 5, 0.721, true));

  bro
    .expect(path.toString())
    .toBe(
      "M 1788.4 1000 L 1500.0000000000002 1000 L 1500 600 A 100 100 0 0 0 1550.0970458984375 586.5651245117188 A 100 100 0 0 0 1500 400 L 500 400 A 100 100 0 0 0 500 600 L 500.00000000000006 1000 L 0 1000 L 0 0 L 2000 0 L 1900 1000 L 1788.4 1000 Z",
    );
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
  debugGeometry(intersection.toString());

  bro
    .expect(intersection.toString())
    .toEqual(
      "M 1549.9999999999998 586.6025403784439 L 1788.6751345948128 1000 L 1900 1000 L 1950 500 L 1600 500 A 100 100 0 0 1 1550.00634765625 586.6176147460938",
    );
});
