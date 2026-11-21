//@ts-check

/**
 * @import { Segment } from './path'
 * @import { Point } from './types'
 */

import { dot, eps, minus, norm, plus, rotatePoint } from "./2d.js";
import { getCircleCenter, isInPieSlice, normalizeAngle } from "./circle.js";
import { debugGeometry } from "./debug.js";
import { x2, zero2 } from "./defaults.js";
import { Panorama } from "./panorama.js";
import { Path } from "./path.js";
import { keyToComparison, modulo } from "./utils.js";

/**
 * @typedef {object} Piece
 * @property {Point} point
 * @property {number} radius
 * @property {Panorama} pano
 */

// TODO: remove when old shelf-maker is removed
/**
 * @deprecated
 */
export function convexHullOld(...geometries) {
  const paths = [];
  for (const geom of geometries) {
    paths.push(Path.fromPolyline(geom, false));
  }

  return convexHull(...paths);
}

/**
 * Operates on paths
 * @param {Path[]} paths
 * @returns {Path}
 */
export function convexHull(...paths) {
  /** @type {Piece[]} */
  let pieces = [];
  for (const path of paths) {
    for (const segment of path.iterateOverSegments()) {
      const [i, p1, type, p2, r, swp] = segment;

      // prefill the pieces with at least one point
      if (i === 0) pieces.push({ point: p1, pano: new Panorama(), radius: 0 });
      // single line paths need this
      else pieces = _stitch(pieces, p1);

      if (type === "arc") {
        if (r == null || swp == null) throw TypeError();
        const center = getCircleCenter(p1, p2, r, swp);
        const startAngle = normalizeAngle(
          Math.atan2(...minus(p1, center).toReversed()),
        );
        const endAngle = normalizeAngle(
          Math.atan2(...minus(p2, center).toReversed()),
        );

        const [S, E] = swp ? [startAngle, endAngle] : [endAngle, startAngle];
        const pano = Panorama.fromPair(S, E);
        pieces = _stitch(pieces, center, r, pano);
      } else if (type !== "lineTo") throw new Error();

      pieces = _stitch(pieces, p2);
    }
  }

  pieces.sort(keyToComparison((x) => x.pano.start));

  const result = new Path();
  const { point, pano, radius } = pieces[0];
  result.moveTo(rotatePoint(point, plus(point, [radius, 0]), pano.start));

  for (const { point, pano, radius } of pieces) {
    result.lineTo(rotatePoint(point, plus(point, [radius, 0]), pano.start));
    if (radius > eps) {
      result.arc(
        rotatePoint(point, plus(point, [radius, 0]), pano.start + pano.span),
        radius,
        1,
      );
    }
  }
  result.close();
  result.simplify();

  return result;
}

/**
 * @param {Piece[]} pieces
 * @param {Point} p2
 * @param {number | null} [maybeRadius]
 * @param {Panorama} [limits]
 */
function _stitch(pieces, p2, maybeRadius = null, limits = new Panorama()) {
  const newPieces = [];

  const rad = maybeRadius ?? 0;

  // skip a point that coincides with another
  if (pieces.some(({ point }) => norm(point, p2) + rad < eps)) {
    return pieces;
  }

  const newPano = new Panorama();

  for (const piece of pieces) {
    const { point, radius, pano } = piece;
    const alpha = normalizeAngle(Math.atan2(...minus(p2, point).toReversed()));

    const d = norm(point, p2);
    let outside;

    if (d < eps) {
      outside = pano.clone();
    } else {
      const rDelta = Math.asin((rad - radius) / norm(point, p2));
      outside = new Panorama(alpha + Math.PI, 0);
      outside.growSelf(Math.PI / 2 - rDelta);
    }

    const currentPano = new Panorama(alpha);
    currentPano.subtractSelf(outside);
    currentPano.intersectSelf(limits);
    currentPano.intersectSelf(newPano);

    newPano.intersectSelf(currentPano);
    pano.subtractSelf(currentPano);

    // skip a point that is no longer necessary
    if (pano.empty()) {
      continue;
    }

    newPieces.push({ point, pano, radius });
  }

  if (!newPano.empty())
    newPieces.push({ point: p2, pano: newPano, radius: rad });

  return newPieces;
}
