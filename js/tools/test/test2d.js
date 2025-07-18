// @ts-check
import { KindaDOMMatrix, KindaDOMPoint } from "../dom.js";
import {
    computeVectorAngle,
  intersectLines,
  isToTheLeft,
  mirrorPoint,
  norm,
  offsetPolyline,
  placeAlong,
  rotatePoint,
} from "../2d.js";
import bro from "./brotest/brotest.js";

bro.test("offset polyline", () => {
  const points = [
    [10, 20],
    [30, 0],
    [10, -20],
    [-25, 0],
  ];
  bro.expect(offsetPolyline(points, 3, true)).toEqual([
    [10.50106468772176, 23.741575999397526],
    [34.24264068711929, -7.105427357601002e-15],
    [10.501064687721762, -23.74157599939753],
    [-31.04669331122391, 0],
  ]);

  bro.expect(offsetPolyline(points, -3, true)).toRoughlyEqual(
    [
      [9.498935312278242, 16.258424000602474],
      [25.757359312880716, 0],
      [9.498935312278244, -16.258424000602474],
      [-18.953306688776088, 0],
    ],
    1e-10,
  );
});

bro.test("intersectLines", () => {
  const inter = intersectLines(
    [349.99999999999994, -300],
    [349.99999999999875, -4562.377134371247],
    [308.1405485343463, -4513.044270380192],
    [6683.477192969745, -5565.055712210156],
  );

  bro.expect(inter).toRoughlyEqual([350, -4519.95], 1e-2);
});

bro.test("placeAlong", () => {
  bro
    .expect(placeAlong([0, 0], [2, 0], { fromStart: 1 }))
    .toRoughlyEqual([1, 0], 1e-2);
  bro
    .expect(placeAlong([0, 0], [2, 0], { fromStart: -1 }))
    .toRoughlyEqual([-1, 0], 1e-2);
  bro
    .expect(placeAlong([0, 0], [2, 0], { fromEnd: 1 }))
    .toRoughlyEqual([3, 0], 1e-2);
  bro
    .expect(placeAlong([0, 0], [2, 0], { fromEnd: -1 }))
    .toRoughlyEqual([1, 0], 1e-2);
});

bro.test("matrix and point polyfill", () => {
  const transform = (m) => m.scale(-1, 2).rotate(35);
  const mat = transform(new DOMMatrix());
  const other = transform(new KindaDOMMatrix());

  bro
    .expect([...other.values])
    .toRoughlyEqual([
      mat.m11,
      mat.m12,
      mat.m13,
      mat.m14,
      mat.m21,
      mat.m22,
      mat.m23,
      mat.m24,
      mat.m31,
      mat.m32,
      mat.m33,
      mat.m34,
      mat.m41,
      mat.m42,
      mat.m43,
      mat.m44,
    ]);

  const m = mat.inverse();
  bro
    .expect([...other.inverse().values])
    .toRoughlyEqual([
      m.m11,
      m.m12,
      m.m13,
      m.m14,
      m.m21,
      m.m22,
      m.m23,
      m.m24,
      m.m31,
      m.m32,
      m.m33,
      m.m34,
      m.m41,
      m.m42,
      m.m43,
      m.m44,
    ]);

  const b1 = new DOMMatrix().scale(1e3, -1e3).rotate(-35).translate(1, 234);

  const b2 = new KindaDOMMatrix()
    .scale(1e3, -1e3)
    .rotate(-35)
    .translate(1, 234);

  const coords = [-0.5948, 0.9154];
  const pre1 = new DOMPoint(...coords);
  const pre2 = new KindaDOMPoint(...coords);

  const p1 = pre1.matrixTransform(b1);
  const p2 = pre2.matrixTransform(b2);

  const other1 = b1.transformPoint(pre1);
  const other2 = b2.transformPoint(pre2);

  const show = (p) => [p.x, p.y, p.z, p.w];
  bro.expect({ ...p2 }).toRoughlyEqual({ x: p1.x, y: p1.y, z: p1.z, w: p1.w });
  bro.expect(show(other1)).toRoughlyEqual(show(p1));
  bro.expect(show(other2)).toRoughlyEqual(show(p1));
  bro.expect(show(other2)).toRoughlyEqual(show(p2));

  bro
    .expect(
      show(b1.inverse().transformPoint(b1.transformPoint(new DOMPoint()))),
    )
    .toRoughlyEqual([0, 0, 0, 1]);
  bro
    .expect(
      show(b2.inverse().transformPoint(b2.transformPoint(new KindaDOMPoint()))),
    )
    .toRoughlyEqual([0, 0, 0, 1]);
  bro.expect(b2.inverse().toString()).toEqual(b1.inverse().toString());

  const mat5 = new KindaDOMMatrix(
    "matrix3d(0.9866572798210999, -0.16281097068695297, 0, 0, 0.16281097068695297, 0.9866572798210999, 0, 0, 0, 0, 1, 0, 3487.668322217699, -5088.382855286229, 2710.055321025207, 1)",
  );

  bro
    .expect(mat5.inverse().toString())
    .toEqual(
      "matrix3d(0.9866572798210999, 0.16281097068695297, 0, 0, -0.16281097068695297, 0.9866572798210999, 0, 0, 0, 0, 1, 0, -4269.577891613534, 4452.659321710632, -2710.055321025207, 1)",
    );
});

bro.test("rotates point", () => {
  bro
    .expect(norm(rotatePoint([0, 0], [1, 0], Math.PI / 2), [0, 1]))
    .toBeLessThan(1e-10);

  bro
    .expect(norm(rotatePoint([0, 0], [1, 1], Math.PI / 2), [-1, 1]))
    .toBeLessThan(1e-10);

  bro
    .expect(norm(rotatePoint([0, 0], [432.43, 1.2343], 0.34235), [406.92,146.33]))
    .toBeLessThan(1e-2);

  bro
    .expect(norm(rotatePoint([0, 0], [432.43, 1.2343], 0), [432.43, 1.2343]))
    .toBeLessThan(1e-10);

});

bro.test("computes angle", () => {
  bro
    .expect(Math.abs(computeVectorAngle([ 0, -402.3543409078357 ]) - Math.PI * 1.5) % (2  * Math.PI))
    .toBeLessThan(1e-10);

  bro
    .expect(Math.abs(computeVectorAngle([ 0, 402.3543409078357 ]) - Math.PI / 2) % (2  * Math.PI))
    .toBeLessThan(1e-10);

  bro
    .expect(() => computeVectorAngle([ 0, 0 ]))
    .toThrow();
});

bro.test("mirrorPoint", () => {
  bro
    .expect(mirrorPoint([0, -1], [0, 0], [1, 0]))
    .toRoughlyEqual([0, 1], 1e-5);

  bro
    .expect(mirrorPoint([0, 0.5], [0, 0], [1, 0]))
    .toRoughlyEqual([0, -0.5], 1e-5);

  bro
    .expect(mirrorPoint([1, 0], [0, 0], [1, 0]))
    .toRoughlyEqual([1, 0], 1e-5);

  bro
    .expect(mirrorPoint([0, 0], [0, 0], [1, 0]))
    .toRoughlyEqual([0, 0], 1e-5);

  bro
    .expect(mirrorPoint([1, -0.8], [0, 0], [1, 0]))
    .toRoughlyEqual([1, 0.8], 1e-5);
});

bro.test("is to the left", () => {
  bro
    .expect(isToTheLeft([1, 1], [0, 0], [2, 0]))
    .toBe(true);
  bro
    .expect(isToTheLeft([1, -1], [0, 0], [2, 0]))
    .toBe(false);
});
