// @ts-check

import { nx3, ny3, nz3, x3, y3 } from "../lib/defaults.js";
import { FlatPart } from "../lib/flat.js";
import { Assembly } from "../lib/lib.js";
import { extrusion } from "../lib/operations.js";
import { Part } from "../lib/part.js";
import { cut } from "../lib/shelf.js";
import { Path } from "../tools/path.js";
import bro from "../tools/test/brotest/brotest.js";
import { a2m } from "../tools/transform.js";

bro.test("assembly mirroring", () => {
  const part1 = new Part(
    "test",
    extrusion(a2m([0, 0, -15]), 30, Path.makeCircle(10)),
  );
  part1.symmetries = [1, 1, 0];
  const part2 = new FlatPart("flat", 20, Path.makeRoundedRect(100, 50, 4));
  const temp = new Assembly("ass");

  temp.addChild(part1, a2m([50, 40, 36]));
  temp.addChild(part1, a2m([-16, 10, -10], x3, nz3));
  temp.addChild(part2, a2m([0, 0, 0]));
  temp.addChild(part2, a2m([100, 0, -50], y3, nx3));

  bro
    .expect(
      temp.mirror().children.map((c) => [...c.placement.toFloat32Array()]),
    )
    .toEqual([
      [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 52, 40, -36, 1],
      [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, -16, 10, 12, 1],
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -20, 1],
      [-1, 0, 0, 0, 0, 0, -1, 0, 0, -1, 0, 0, 100, 20, 50, 1]
    ]);
});
