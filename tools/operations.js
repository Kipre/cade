//@ts-check

/**
 * @import { Point } from './types'
 */

import { dot, eps, minus, norm, plus, rotatePoint } from "./2d.js";
import { getCircleCenter, isInPieSlice, normalizeAngle } from "./circle.js";
import { debugGeometry } from "./debug.js";
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

  return _assemblePieces(pieces);
}

/**
 * @param {Piece[]} pieces
 */
function _assemblePieces(pieces, debug = false) {
  const debugPaths = [];

  const sorted = pieces.toSorted(keyToComparison((x) => x.pano.start));
  const result = new Path();
  const { point, pano, radius } = sorted[0];
  result.moveTo(rotatePoint(point, plus(point, [radius, 0]), pano.start));

  for (const { point, pano, radius } of sorted) {
    if (debug) debugPaths.push(pano.toPath());

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

  if (debug) {
    console.log(
      pieces.map((x) => ({
        ...x,
        point: x.point.join(", "),
        pano: x.pano.toString(),
      })),
    );
    debugGeometry(result, ...debugPaths);
    throw new Error();
  }

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

  let newPano = [limits];

  for (const piece of pieces) {
    const { point, radius } = piece;
    const alpha = normalizeAngle(Math.atan2(...minus(p2, point).toReversed()));

    const d = norm(point, p2);
    let outsides;

    if (d < eps) {
      outsides = [piece.pano];
    } else {
      const ratio = (rad - radius) / norm(point, p2);
      const rDelta = Math.asin(Math.max(-1, Math.min(1, ratio)));
      outsides = new Panorama(alpha + Math.PI, 0)
        .grow(Math.PI / 2 - rDelta)
        .intersect(piece.pano);
    }

    let applicable = [new Panorama(alpha)];
    for (const out of outsides) {
      applicable = applicable.flatMap((p) => p.subtract(out));
    }

    if (!applicable.length) {
      newPieces.push(piece);
      continue;
    }

    const valid = [];
    for (const previous of newPano) {
      for (const current of applicable) {
        valid.push(...current.intersect(previous));
      }
    }

    newPano = valid;

    if (valid.length) {
      let reduced = [piece.pano];
      for (const current of valid) {
        reduced = reduced.flatMap((p) => p.subtract(current));
      }
      for (const pano of reduced) newPieces.push({ point, pano, radius });
    } else newPieces.push({ point, pano: piece.pano, radius });
  }

  for (const pano of newPano) newPieces.push({ point: p2, pano, radius: rad });

  // if (newPieces.length > 2) _assemblePieces(newPieces, true);
  return newPieces;
}
