// @ts-check

import bro from "../tools/test/brotest/brotest.js";

bro.test("test simple location", () => {
  const lines = [
    [[53.210678118654755, 7.5], [600, 7.5],],
    [[53.210678118654755, -77.5], [600, -77.5],],
  ];

  bro
    .expect(makePolygonFromLines(lines, [15, 20]).toString())
    .toBe(
      "M 53.210678118654755 -67.5 L 53.210678118654755 0 L 600 0 L 600 -67.5 Z",
    );
});

