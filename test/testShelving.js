// @ts-check

import { FlatPart } from "../lib/flat.js";
import { Assembly } from "../lib/lib.js";
import { ShelfMaker } from "../lib/shelf.js";
import { nx3, x3 } from "../tools/defaults.js";
import { Path } from "../tools/path.js";
import { debugGeometry } from "../tools/svg.js";
import bro from "../tools/test/brotest/brotest.js";
import { a2m } from "../tools/transform.js";

const thickness = 5;
const roundingRadius = 5;

const advancement = 50;

const topClaw = new Assembly("top claw");

const spaceForRail = Path.makeRoundedRect(30, 60, roundingRadius).recenter();

const baseShelfPath = Path.makeRect(50, 130);

const topShelfPath = baseShelfPath.booleanDifference(
  spaceForRail.translate([0, advancement]),
);

const bottomShelfPath = baseShelfPath
  .cutOnLine([0, 30], [1, 30], true)
  .booleanDifference(spaceForRail.translate([0, advancement + 30]));

const topShelf = new FlatPart("top shelf", thickness, topShelfPath);
const locatedTop = topClaw.addChild(topShelf);

const bottomShelf = new FlatPart("bottom shelf", thickness, bottomShelfPath);
const locatedBottom = topClaw.addChild(bottomShelf, a2m([0, 0, 50]));

bro.test("makes simple butt shelf", () => {
  const baseButt = new ShelfMaker(a2m([50, 0, 0], x3), { thickness })
    .addFlatPart(locatedTop)
    .addFlatPart(locatedBottom)
    .make();

  bro
    .expect(baseButt.toString())
    .toBe("M 0 0 L 0 5 L 30 55 L 130 55 L 130 0 Z");
});

bro.test("makes simple inside shelf", () => {
  const baseInside = new ShelfMaker(a2m([40, 0, 0], x3), { thickness })
    .addFlatPart(locatedTop)
    .addFlatPart(locatedBottom)
    .make();
  bro.expect(baseInside.toString()).toBe("M 0 5 L 30 50 L 130 50 L 130 5 Z");
});

const onlyBigger = (x) => x[1] > 70;

bro.test("makes filtered inside shelf", () => {
  const halfInsideBigger = new ShelfMaker(a2m([5, 0, 0], nx3), { thickness })
    .addFlatPart(locatedTop, false, onlyBigger)
    .addFlatPart(locatedBottom, false, onlyBigger)
    .make();

  bro
    .expect(halfInsideBigger.toString())
    .toBe("M 80 -5 L 130 -5 L 130 -50 L 110 -50 Z");
});

bro.test("makes filtered butt shelf", () => {
  const halfButtBigger = new ShelfMaker(a2m([0, 0, 0], nx3), { thickness })
    .addFlatPart(locatedTop, false, onlyBigger)
    .addFlatPart(locatedBottom, false, onlyBigger)
    .make();

  bro
    .expect(halfButtBigger.toString())
    .toBe("M 80 -5 L 80 0 L 130 0 L 130 -55 L 110 -55 Z");
});

const onlyLower = (x) => x[1] < 70;

bro.test("makes another filtered inside shelf", () => {
  const halfInsideLower = new ShelfMaker(a2m([5, 0, 0], nx3), { thickness })
    .addFlatPart(locatedTop, false, onlyLower)
    .addFlatPart(locatedBottom, false, onlyLower)
    .make();

  bro
    .expect(halfInsideLower.toString())
    .toBe("M 1.5308084989341916e-16 -5 L 20 -5 L 50 -50 L 30 -50 Z");
});

bro.test("makes another filtered butt shelf", () => {
  const halfButtLower = new ShelfMaker(a2m([0, 0, 0], nx3), { thickness })
    .addFlatPart(locatedTop, false, onlyLower)
    .addFlatPart(locatedBottom, false, onlyLower)
    .make();

  bro
    .expect(halfButtLower.toString())
    .toBe("M 0 -5 L 0 0 L 20 0 L 50 -50 L 50 -55 L 30 -55 Z");
});
