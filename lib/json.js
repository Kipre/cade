// @ts-check
import { Path } from "../tools/path.js";

export function matrixAwareReplacer(key, value) {
  if (value instanceof Path) return value.toString();
  // detect flattened dommatrix
  if (value.is2D !== undefined && value.isIdentity !== undefined) return [
    value.m11, value.m12, value.m13, value.m14,
    value.m21, value.m22, value.m23, value.m24,
    value.m31, value.m32, value.m33, value.m34,
    value.m41, value.m42, value.m43, value.m44,
  ];
  return value;
}
