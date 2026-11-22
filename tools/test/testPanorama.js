import { Panorama } from "../panorama.js";
import bro from "./brotest/brotest.js";

const PI = Math.PI;

/** @param {Panorama[]} result */
const arcs = (result) =>
  result.map((p) => [p.start, p.span]).sort((a, b) => a[0] - b[0]);

bro.test("subtract", () => {
  const half = new Panorama(0, PI);
  // inside: splits in two
  bro.expect(arcs(half.subtract(new Panorama(PI / 4, PI / 4)))).toRoughlyEqual([
    [0, PI / 4],
    [PI / 2, PI / 2],
  ]);
  // over the tail, over the head (wrapping)
  bro
    .expect(arcs(half.subtract(new Panorama(PI / 2, PI))))
    .toRoughlyEqual([[0, PI / 2]]);
  bro
    .expect(arcs(half.subtract(new Panorama(-PI / 2, PI))))
    .toRoughlyEqual([[PI / 2, PI / 2]]);
  // disjoint, covering, from full
  bro
    .expect(arcs(half.subtract(new Panorama(-PI / 2, PI / 4))))
    .toRoughlyEqual([[0, PI]]);
  bro.expect(half.subtract(new Panorama(-PI / 4, 1.5 * PI))).toHaveLength(0);
  bro
    .expect(arcs(new Panorama().subtract(new Panorama(0, PI / 2))))
    .toRoughlyEqual([[PI / 2, 1.5 * PI]]);
});

bro.test("intersect", () => {
  const half = new Panorama(0, PI);
  bro
    .expect(arcs(half.intersect(new Panorama(PI / 2, PI))))
    .toRoughlyEqual([[PI / 2, PI / 2]]);
  bro.expect(arcs(half.intersect(new Panorama()))).toRoughlyEqual([[0, PI]]);
  bro.expect(half.intersect(new Panorama(-PI / 2, PI / 4))).toHaveLength(0);
  // overlapping at both ends: two arcs
  bro
    .expect(
      arcs(new Panorama(0, 1.5 * PI).intersect(new Panorama(PI, 1.5 * PI))),
    )
    .toRoughlyEqual([
      [-PI, PI / 2],
      [0, PI / 2],
    ]);
  // starts after, wraps back over the head
  const quarter = new Panorama(0, PI / 2);
  bro
    .expect(arcs(quarter.intersect(new Panorama(PI, 1.5 * PI))))
    .toRoughlyEqual([[0, PI / 2]]);
  bro
    .expect(arcs(quarter.intersect(new Panorama(PI, 1.25 * PI))))
    .toRoughlyEqual([[0, PI / 4]]);
});

bro.test("grow", () => {
  const p = new Panorama(PI / 2, PI / 2).grow(PI / 4);
  bro.expect([p.start, p.span]).toRoughlyEqual([PI / 4, PI]);
  bro.expect(new Panorama(PI, 0).grow(PI).span).toRoughlyEqual(2 * PI);
});
