// @ts-check

import { nx3, ny3, nz3, x3, y3 } from "../lib/defaults.js";
import { FlatPart } from "../lib/flat.js";
import { Assembly } from "../lib/lib.js";
import { cut, extrusion, fuse, retrieveOperations } from "../lib/operations.js";
import { Part } from "../lib/part.js";
import { makeFourDrills } from "../lib/utils.js";
import { Path } from "../tools/path.js";
import bro from "../tools/test/brotest/brotest.js";
import { a2m } from "../tools/transform.js";

bro.test("retrieves operations", () => {
  const railProfile = Path.makeRect(20, 10);
  const holeDepth = 6
  const bigDiameter = 6;
  const smallDiameter = 4;

  const hole = fuse(
    extrusion(a2m([0, 0, holeDepth], nz3), 10, Path.makeCircle(bigDiameter / 2)),
    extrusion(a2m([0, 0, holeDepth]), 10, Path.makeCircle(smallDiameter / 2)),
  );

  const holes = [];
  for (let x = 10; x < 1000; x += 25) {
    holes.push({ location: a2m([0, 0, x]), shape: hole });
  }

  const shape = cut(extrusion(a2m([0, 0, 0]), 1000, railProfile), ...holes);
  const part = new Part(
    "part",
    shape,
  );

  bro
    .expect(part.shape.length)
    .toBe(5);
});


bro.test("retrieves operations for drilling", () => {
  const holeSize = 5;
  const chariotHoleDepth = 10;
  const drillsTransform = a2m([0, 10, 20 / 2], y3);
  const drills = makeFourDrills(
    drillsTransform,
    holeSize,
    chariotHoleDepth,
    [28 / 2, 26 / 2],
  );
  bro
    .expect(retrieveOperations(drills))
    .toHaveLength(5);

  bro
    .expect(retrieveOperations(drills))
    .toHaveLength(5);
});
