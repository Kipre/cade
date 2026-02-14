// @ts-check

import { FlatPart, getFaceOnLocatedFlatPart } from "../lib/flat.js";
import { Assembly } from "../lib/lib.js";
import { y3 } from "../tools/defaults.js";
import { Path } from "../tools/path.js";
import bro from "../tools/test/brotest/brotest.js";
import { a2m } from "../tools/transform.js";

bro.test("test simple location", () => {
  const path = Path.fromPolyline([[10, 50], [40, 100], [0, 200]]);
  const part = new FlatPart("test", 10, path);
  const assy = new Assembly("assy");
  assy.addChild(part, a2m([10, 20, 30], y3));

  bro
    .expect(getFaceOnLocatedFlatPart(assy.findChild(part), x => x[2]).toString())
    .toBe(
      "matrix3d(0.5144957554275266, 0, -0.8574929257125442, 0, 0, -1, 0, 0, -0.8574929257125442, 0, -0.5144957554275266, 0, 20, 20, -20, 1)"
    );
});

