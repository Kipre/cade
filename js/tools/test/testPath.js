// @ts-check
import { Path } from "../path.js";
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
