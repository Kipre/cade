// @ts-check
import { ny3, y3, z3, zero3 } from "../defaults.js";
import { Path } from "../path.js";
import { a2m, atm, atm3, intersectPlanes, locateWithConstraints } from "../transform.js";
import bro from "./brotest/brotest.js";

bro.test("two simple constraints", () => {
  const m = locateWithConstraints(
    {
      from: new DOMMatrix([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 333, 0, 25, 1]),
      to: new DOMMatrix([0, -7.105427357601002e-17, 1, 0, 1, 0, 0, 0, 0, 1, 7.105427357601002e-17, 0, -80, 365, -100, 1])
    },
    {
      from: new DOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1]),
      to: new DOMMatrix([0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, -15, 0, 0, 1])
    }
  );

  bro.expect(m.toString()).toBe("matrix3d(0, 1, 7.105427357601002e-17, 0, 0, 7.105427357601002e-17, -1, 0, -1, 0, 0, 0, -15, 31.999999999999993, 2.2737367544323202e-15, 1)");
});

bro.test("one constraint", () => {
  const m = locateWithConstraints({
    from: a2m(zero3, y3),
    to: new DOMMatrix([0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, -15, 0, 0, 1])
  });

  bro.expect(m.toString()).toBe("matrix3d(0, 0, 1, 0, -1, 0, 0, 0, 0, -1, 0, 0, -15, 0, 0, 1)");
});

bro.test("intersect two planes", () => {
  const result = intersectPlanes(a2m(), a2m([0, 0, 10], [0, 0.5, 1]));

  const point = atm3(result, zero3);
  const normal = atm3(result, z3, true);
  bro.expect([point, normal]).toEqual([
    [0, 20, 0],
    [-1, 0, 0]
  ]);
});

