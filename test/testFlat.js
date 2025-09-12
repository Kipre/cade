// @ts-check

import { makePolygonFromLines } from "../lib/flat.js";
import bro from "../tools/test/brotest/brotest.js";

bro.test("make polygon from parallel lines", () => {
  const lines = [
    [
      [53.210678118654755, 7.5],
      [600, 7.5],
    ],
    [
      [53.210678118654755, -77.5],
      [600, -77.5],
    ],
  ];

  bro
    .expect(makePolygonFromLines(lines, [15, 20]).toString())
    .toBe(
      "M 600 0 L 53.210678118654755 0 L 53.210678118654755 -67.5 L 600 -67.5 Z",
    );
});

bro.test("make polygon from three walls", () => {
  const lines = [
    [
      [-7.5, -85],
      [-7.5, 500],
    ],
    [
      [-15, -7.5],
      [-97.0034898277757, -7.5],
    ],
    [
      [-107.5, -110],
      [-107.5, 500],
    ],
  ];

  bro
    .expect(makePolygonFromLines(lines, [15, 15, 15]).toString())
    .toBe(
      "M 0 500 L 0 -15 L -115 -15 L -115 500 Z",
    );
});
