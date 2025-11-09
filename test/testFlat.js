// @ts-check

import { spindleCleared2LineTo, spindleClearedLineTo } from "../lib/flat.js";
import { findConvexZones, makePolygonFromLines } from "../lib/shelf.js";
import { convexHull } from "../tools/operations.js";
import { Path } from "../tools/path.js";
import { debugGeometry } from "../tools/svg.js";
import bro from "../tools/test/brotest/brotest.js";

bro.test("make polygon from parallel lines", () => {
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

bro.test("make polygon from three walls", () => {
  const lines = [
    [[1.3827732205958862e-15, -111.5], [350, -111.5]],
    [[0, -7.5], [223.5, -7.5]],
  ];

  bro
    .expect(makePolygonFromLines(lines, [15, 15]).toString())
    .toBe("M 2.1245770866179924e-15 -15 L 223.5 -15 L 350 -104 L 3.5073503072138786e-15 -104 Z");
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

bro.test("make polygon from four walls", () => {
  const lines = [
    [[-67.5, -72.5], [82.50000000000003, -72.5]],
    [[65, -65], [65, 20]],
    [[92.49999999999997, 27.5], [-67.50000000000003, 27.5]],
    [[-50, -65], [-50, 20]]
  ];

  bro
    .expect(makePolygonFromLines(lines, [15, 15, 15, 15]).toString())
    .toBe("M -42.5 -65 L -42.5 20 L 57.5 20 L 57.5 -65 Z");
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

bro.test("make polygon from two walls", () => {
  const lines = [
    [[-7.5, -85], [-7.5, 500],],
    [[-15, -7.5], [-97.0034898277757, -7.5],],
    [[-107.5, -110], [-107.5, 500],],
  ];

  bro
    .expect(makePolygonFromLines(lines, [15, 15, 15]).toString())
    .toBe("M -100 1.2363986669178672e-15 L -100 500 L -15 500 L -15 1.2363986669178672e-15 Z");
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
    .toBe("M -170.62276185659434 107.5 L -15 107.5 L -15 7.5 L -85 7.5 Z");

  bro
    .expect(Path.fromPolyline(hulls[1]).toString())
    .toBe("M 0 15.000000000000002 L 0 100 L 9.769962616701378e-15 107.5 L 1018 107.50000000000001 L 1018 7.5 L 2.042810365310288e-14 7.5 Z");

  bro
    .expect(Path.fromPolyline(hulls[2]).toString())
    .toBe("M 1033 7.5 L 1033 107.5 L 1128 107.5 L 1103 7.5 Z");
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


bro.test("shelf cutting", () => {
  const cutLine = [[-15, 100], [-170.62276185659434, 100]];
  const line = [[-15, 15], [-15, 100]];

  bro
    .expect(cut(cutLine, line, 0))
    .toEqual({ up: [[-15, 15], [-15, 100]] });

  bro
    .expect(cut(
      [[1025.5, 15], [1025.5, 100]],
      [[1103, 7.5], [2.042810365310288e-14, 7.5]],
      15
    ))
    .toEqual({
      "up": [
        [1103, 7.5],
        [1033, 7.5]
      ],
      "down": [
        [1018, 7.5],
        [2.042810365310288e-14, 7.5]
      ]
    });

});
