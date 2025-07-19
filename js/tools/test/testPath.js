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
  // debugGeometry(loop.toString(), [center, end], [[0, 0], ...intersections]);

  bro.expect(intersections).toEqual([
    {
      host: {
        segment: 3,
        x: 0.8128329581890014,
      },
      point: [1555.4700196225228, 583.2050294337844],
    },
    {
      point: [1833.3333333333333, 1000],
      host: {
        segment: 5,
        x: 0.833333333333333,
      },
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

  bro.expect(intersections).toEqual([
    {
      host: {
        segment: 1,
        x: 0.09249943128803638,
      },
      point: [426.11625991783626, 567.3883740082163],
    },
    {
      point: [100, 1000],
      host: {
        segment: 9,
        x: 0.19999999999999998,
      },
    },
  ]);
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

  debugGeometry(loop.toString(), s.toString());
  const intersection = loop.booleanIntersection(s);
  console.log(intersection);
  // debugGeometry(loop.toString(), s.toString(), intersection.toString());

  // bro.expect(intersection).toEqual([
  //   [1555.4700196225228, 583.2050294337844],
  //   [1833.3333333333333, 1000],
  // ]);
});
