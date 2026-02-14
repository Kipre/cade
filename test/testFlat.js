// @ts-check

import { FlatPart, getFaceOnLocatedFlatPart, spindleCleared2LineTo, spindleClearedLineTo } from "../lib/flat.js";
import { Assembly } from "../lib/lib.js";
import { findConvexZones, ShelfMaker } from "../lib/shelf.js";
import { convexHull } from "../tools/operations.js";
import { Path } from "../tools/path.js";
import { debugGeometry } from "../tools/svg.js";
import bro from "../tools/test/brotest/brotest.js";
import { a2m } from "../tools/transform.js";

bro.test("make polygon from parallel lines", () => {
  const shelf = new ShelfMaker(a2m(), { woodThickness: 10 })
    .addFeature(Path.fromPolyline([[53.210678118654755, 7.5], [600, 7.5]], false).thickenAndClose(7.5), a2m())
    .addFeature(Path.fromPolyline([[53.210678118654755, -77.5], [600, -77.5]], false).thickenAndClose(10), a2m())

  bro
    .expect(shelf.make().toString())
    .toBe(
      "M 53.210678118654755 -87.5 L 53.210678118654755 7.5 L 600 7.5 L 600 -87.5 Z",
    );
});

bro.test("clears spindle in angles", () => {
  const r = 2;
  const p = new Path();
  p.moveTo([0, 0]);
  p.lineTo([10, 0]);
  spindleClearedLineTo(p, [10, 10], r);
  spindleClearedLineTo(p, [20, 10], r);
  spindleClearedLineTo(p, [20, 0], r, true);
  spindleClearedLineTo(p, [30, 0], r, true);
  spindleClearedLineTo(p, [40, 10], r);

  bro
    .expect(p.toString())
    .toBe(
      "M 0 0 L 10 0 A 2 2 0 0 1 10 4 L 10 10 A 2 2 0 0 0 14 10 L 16 10 A 2 2 0 0 0 20 10 L 20 4 A 2 2 0 0 1 20 0 L 30 0 A 2 2 0 0 1 32 2 L 40 10",
    );
});

bro.test("clears spindle in mortise", () => {
  const thickness = 15;
  const spindleDiameter = 6;
  const length = 30;

  const mortise = new Path();
  mortise.moveTo([0, -thickness / 2]);
  mortise.lineTo([-length / 2, -thickness / 2]);
  spindleClearedLineTo(mortise, [-length / 2, 0], spindleDiameter / 2, true);
  mortise.mirror([0, 0]);
  mortise.mirror();

  bro
    .expect(mortise.toString())
    .toBe(
      "M -9 -7.5 A 3 3 0 0 0 -15 -7.5 L -14.999999999999995 7.5 A 3 3 0 0 0 -8.999999999999998 7.5 L 8.999999999999991 7.499999999999999 A 3 3 0 0 0 14.999999999999988 7.499999999999995 L 15 -7.500000000000009 A 3 3 0 0 0 9 -7.500000000000003 Z",
    );
});

bro.test("clears spindle in angles with minimal angle", () => {
  const r = 2;
  const p = new Path();
  p.moveTo([0, 0]);
  p.lineTo([10, 0]);
  spindleCleared2LineTo(p, [10, 10], r);
  spindleCleared2LineTo(p, [20, 10], r);
  spindleCleared2LineTo(p, [20, 0], r);
  spindleCleared2LineTo(p, [30, 0], r);
  spindleCleared2LineTo(p, [40, 10], r);

  bro
    .expect(p.toString())
    .toBe(
      "M 0 0 L 7.171572875253809 -2.220446049250313e-16 A 2 2 0 0 1 10 2.8284271247461894 L 10 7.17157287525381 A 2 2 0 0 0 12.82842712474619 10 L 17.17157287525381 10 A 2 2 0 0 0 20 7.17157287525381 L 20 2.8284271247461894 A 2 2 0 0 1 22.82842712474619 -2.220446049250313e-16 L 28.46926627053964 -2.220446049250313e-16 A 2 2 0 0 1 31.082392200292396 1.0823922002923951 L 40 10",
    );
});

bro.test("clears spindle in angles with minimal angle", () => {
  const length = 15;
  const thickness = 15;
  const spindleDiameter = 6;
  const p = new Path();
  p.moveTo([-10, -thickness / 2]);
  p.lineTo([length, -thickness / 2]);
  spindleClearedLineTo(p, [length, 0], spindleDiameter / 2, true);
  p.mirror([0, 0]);
  p.close();

  bro
    .expect(p.toString())
    .toBe(
      "M -10 -7.5 L 9 -7.5 A 3 3 0 0 1 15 -7.5 L 14.999999999999998 7.5 A 3 3 0 0 1 8.999999999999998 7.5 L -9.999999999999998 7.5 Z",
    );
});

bro.test("find convex zones", () => {
  const lines = [
    {
      "pts": [[1103, 7.5], [-85, 7.5]],
      "type": "cutting",
      "thickness": 15
    },
    {
      "pts": [[-7.5, 15], [-7.5, 100]],
      "type": "cutting",
      "thickness": 15
    },
    {
      "pts": [[1128, 107.5], [-170.62276185659434, 107.5]],
      "type": "cutting",
      "thickness": 15
    },
    {
      "pts": [[1025.5, 15], [1025.5, 100]],
      "type": "cutting",
      "thickness": 15
    }
  ]

  const zones = findConvexZones(lines);
  const hulls = zones.map(z => convexHull(...z.map(l => l.pts)))
  bro.expect(hulls).toHaveLength(3);

  bro
    .expect(Path.fromPolyline(hulls[0]).toString())
    .toBe("M -170.62276185659434 100 L -15 100 L -15 15 L -85 15 Z");

  bro
    .expect(Path.fromPolyline(hulls[1]).toString())
    .toBe("M 0 15.000000000000002 L 0 100 L 1018 100 L 1018 15 L 2.042810365310288e-14 15 Z");

  bro
    .expect(Path.fromPolyline(hulls[2]).toString())
    .toBe("M 1033 15 L 1033 100 L 1128 100 L 1103 15 Z");
});

bro.test("find convex zones 2", () => {
  const lines = [
    {
      "pts": [[-67.5, -72.5], [82.50000000000003, -72.5]],
      "type": "cutting",
      "thickness": 15
    },
    {
      "pts": [[65, 27.5], [65, -72.5]],
      "type": "cutting",
      "thickness": 15
    },
    {
      "pts": [[82.5, 27.5], [-67.50000000000001, 27.5]],
      "type": "cutting",
      "thickness": 15
    },
    {
      "pts": [[-50, 27.5], [-50, -72.5]],
      "type": "cutting",
      "thickness": 15
    }
  ];

  bro
    .expect(findConvexZones(lines))
    .toEqual([
      [
        {
          "pts": [[72.5, -65], [82.50000000000003, -65]],
          "type": "edge"
        },
        {
          "pts": [[82.5, 20], [72.5, 20]],
          "type": "edge"
        },
        {
          "pts": [[72.5, 27.499999999999996], [72.5, -72.5]],
          "type": "edge"
        }
      ],
      [
        {
          "pts": [[-42.5, -65], [57.5, -65]],
          "type": "edge"
        },
        {
          "pts": [[57.5, 20.00000000000001], [-42.5, 20.00000000000001]],
          "type": "edge"
        },
        {
          "pts": [[57.5, 27.499999999999996], [57.5, -72.5]],
          "type": "edge"
        },
        {
          "pts": [[-42.5, 27.499999999999996], [-42.5, -72.5]],
          "type": "edge"
        }
      ],
      [
        {
          "pts": [[-67.5, -65], [-57.5, -65]],
          "type": "edge"
        },
        {
          "pts": [[-57.5, 20.00000000000001], [-67.50000000000001, 20.000000000000007]],
          "type": "edge"
        },
        {
          "pts": [[-57.5, 27.499999999999996], [-57.5, -72.5]],
          "type": "edge"
        }
      ]
    ]);
});

bro.test("makes simple shelf", () => {

  const part1 = new FlatPart("one", 10, Path.makeRect(100));
  const part2 = new FlatPart("two", 10, Path.makeRect(100));

  const assy = new Assembly("assy");
  assy.addChild(part1);
  assy.addChild(part2, a2m([0, 0, 100]));

  const loc = getFaceOnLocatedFlatPart(assy.findChild(part1), x => x[0]);

  const shelf = new ShelfMaker(loc, { woodThickness: 10 })
    .addFlatPart(assy.findChild(part1))
    .addFlatPart(assy.findChild(part2));

  bro
    .expect(shelf.make().toString())
    .toBe("M -100 0 L -100 110 L 0 110 L 0 0 Z");

  const shelf2 = new ShelfMaker(loc.translate(0, 0, -20), { woodThickness: 10 })
    .addFlatPart(assy.findChild(part1))
    .addFlatPart(assy.findChild(part2));

  bro
    .expect(shelf2.make().toString())
    .toBe("M -100 10 L -100 100 L -3.061616997868383e-16 100 L -3.061616997868383e-16 10 Z");
});


// bro.test("makes shelf", () => {
//   const part1 = new FlatPart("one", 10, Path.makeRect(100));
//   const part2 = new FlatPart("two", 10, Path.makeRect(100));
//   const part3 = new FlatPart("three", 10, Path.makeRect(100));
//   const part4 = new FlatPart("four", 10, Path.makeRect(100));
//
//   const assy = new Assembly("assy");
//   assy.addChild(part1);
//   assy.addChild(part2, a2m([0, 0, 100]));
//   assy.addChild(part3, a2m([0, 0, 200]));
//   assy.addChild(part4, a2m([0, 0, 300]));
//
//   const loc = getFaceOnLocatedFlatPart(assy.findChild(part1), x => x[0]);
//
//   const shelf = new ShelfMaker(loc, { woodThickness: 10 })
//     .addFlatPart(assy.findChild(part1))
//     .addFlatPart(assy.findChild(part2))
//     .addFlatPart(assy.findChild(part3))
//     .addFlatPart(assy.findChild(part4));
//
//   bro
//     .expect(shelf.make().toString())
//     .toBe(
//       "M 0 0 L 7.171572875253809 -2.220446049250313e-16 A 2 2 0 0 1 10 2.8284271247461894 L 10 7.17157287525381 A 2 2 0 0 0 12.82842712474619 10 L 17.17157287525381 10 A 2 2 0 0 0 20 7.17157287525381 L 20 2.8284271247461894 A 2 2 0 0 1 22.82842712474619 -2.220446049250313e-16 L 28.46926627053964 -2.220446049250313e-16 A 2 2 0 0 1 31.082392200292396 1.0823922002923951 L 40 10",
//     );
// });
