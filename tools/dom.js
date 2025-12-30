// DOMPoint Polyfill
class KindaDOMPoint {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  static fromPoint(point) {
    return new KindaDOMPoint(point.x, point.y, point.z, point.w);
  }

  matrixTransform(matrix) {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;

    const m = matrix.toFloat64Array();

    return new KindaDOMPoint(
      m[0] * x + m[4] * y + m[8] * z + m[12] * w,
      m[1] * x + m[5] * y + m[9] * z + m[13] * w,
      m[2] * x + m[6] * y + m[10] * z + m[14] * w,
      m[3] * x + m[7] * y + m[11] * z + m[15] * w,
    );
  }
}

// DOMMatrix Polyfill
class KindaDOMMatrix {
  constructor(init) {
    this.is2D = true;
    this.values = new Float64Array(16);

    if (!init) {
      this._setIdentity();
    } else if (typeof init === "string") {
      this._parseMatrix(init);
    } else if (Array.isArray(init)) {
      if (init.length === 6) {
        this._setFrom2DArray(init);
      } else if (init.length === 16) {
        this._setFrom3DArray(init);
      } else {
        throw new Error("Invalid array length for DOMMatrix construction");
      }
    }
  }

  _setIdentity() {
    const m = this.values;
    m[0] = 1;
    m[1] = 0;
    m[2] = 0;
    m[3] = 0;
    m[4] = 0;
    m[5] = 1;
    m[6] = 0;
    m[7] = 0;
    m[8] = 0;
    m[9] = 0;
    m[10] = 1;
    m[11] = 0;
    m[12] = 0;
    m[13] = 0;
    m[14] = 0;
    m[15] = 1;
  }

  _setFrom2DArray(arr) {
    const m = this.values;
    m[0] = arr[0];
    m[1] = arr[1];
    m[2] = 0;
    m[3] = 0;
    m[4] = arr[2];
    m[5] = arr[3];
    m[6] = 0;
    m[7] = 0;
    m[8] = 0;
    m[9] = 0;
    m[10] = 1;
    m[11] = 0;
    m[12] = arr[4];
    m[13] = arr[5];
    m[14] = 0;
    m[15] = 1;
  }

  _setFrom3DArray(arr) {
    this.is2D = false;
    this.values.set(arr);
  }

  _parseMatrix(str) {
    // Basic parsing of matrix() and matrix3d() functions
    str = str.trim();
    if (str.startsWith("matrix(")) {
      const values = str.slice(7, -1).split(",").map(Number);
      if (values.length === 6) {
        this._setFrom2DArray(values);
      }
    } else if (str.startsWith("matrix3d(")) {
      const values = str.slice(9, -1).split(",").map(Number);
      if (values.length === 16) {
        this._setFrom3DArray(values);
      }
    } else {
      throw new Error("Invalid string format for DOMMatrix construction");
    }
  }

  inverse() {
    if (this.is2D) {
      return this._inverse2D();
    }
    return this._inverse3D();
  }

  _inverse2D() {
    const m = this.values;
    const a = m[0],
      b = m[1],
      c = m[4],
      d = m[5],
      tx = m[12],
      ty = m[13];

    // Calculate determinant
    const det = a * d - b * c;

    if (Math.abs(det) < 1e-8) {
      throw new Error("Matrix is not invertible");
    }

    const invDet = 1 / det;

    const result = new KindaDOMMatrix();
    const r = result.values;

    // Calculate inverse
    r[0] = d * invDet;
    r[1] = -b * invDet;
    r[4] = -c * invDet;
    r[5] = a * invDet;

    // Calculate inverse translation
    r[12] = (c * ty - d * tx) * invDet;
    r[13] = (b * tx - a * ty) * invDet;

    return result;
  }

  _inverse3D() {
    const [
      m00,
      m01,
      m02,
      m03,
      m10,
      m11,
      m12,
      m13,
      m20,
      m21,
      m22,
      m23,
      m30,
      m31,
      m32,
      m33,
    ] = this.values;

    // Calculate cofactors
    const c00 =
      m11 * (m22 * m33 - m23 * m32) -
      m12 * (m21 * m33 - m23 * m31) +
      m13 * (m21 * m32 - m22 * m31);
    const c01 = -(
      m10 * (m22 * m33 - m23 * m32) -
      m12 * (m20 * m33 - m23 * m30) +
      m13 * (m20 * m32 - m22 * m30)
    );
    const c02 =
      m10 * (m21 * m33 - m23 * m31) -
      m11 * (m20 * m33 - m23 * m30) +
      m13 * (m20 * m31 - m21 * m30);
    const c03 = -(
      m10 * (m21 * m32 - m22 * m31) -
      m11 * (m20 * m32 - m22 * m30) +
      m12 * (m20 * m31 - m21 * m30)
    );

    const c10 = -(
      m01 * (m22 * m33 - m23 * m32) -
      m02 * (m21 * m33 - m23 * m31) +
      m03 * (m21 * m32 - m22 * m31)
    );
    const c11 =
      m00 * (m22 * m33 - m23 * m32) -
      m02 * (m20 * m33 - m23 * m30) +
      m03 * (m20 * m32 - m22 * m30);
    const c12 = -(
      m00 * (m21 * m33 - m23 * m31) -
      m01 * (m20 * m33 - m23 * m30) +
      m03 * (m20 * m31 - m21 * m30)
    );
    const c13 =
      m00 * (m21 * m32 - m22 * m31) -
      m01 * (m20 * m32 - m22 * m30) +
      m02 * (m20 * m31 - m21 * m30);

    const c20 =
      m01 * (m12 * m33 - m13 * m32) -
      m02 * (m11 * m33 - m13 * m31) +
      m03 * (m11 * m32 - m12 * m31);
    const c21 = -(
      m00 * (m12 * m33 - m13 * m32) -
      m02 * (m10 * m33 - m13 * m30) +
      m03 * (m10 * m32 - m12 * m30)
    );
    const c22 =
      m00 * (m11 * m33 - m13 * m31) -
      m01 * (m10 * m33 - m13 * m30) +
      m03 * (m10 * m31 - m11 * m30);
    const c23 = -(
      m00 * (m11 * m32 - m12 * m31) -
      m01 * (m10 * m32 - m12 * m30) +
      m02 * (m10 * m31 - m11 * m30)
    );

    const c30 = -(
      m01 * (m12 * m23 - m13 * m22) -
      m02 * (m11 * m23 - m13 * m21) +
      m03 * (m11 * m22 - m12 * m21)
    );
    const c31 =
      m00 * (m12 * m23 - m13 * m22) -
      m02 * (m10 * m23 - m13 * m20) +
      m03 * (m10 * m22 - m12 * m20);
    const c32 = -(
      m00 * (m11 * m23 - m13 * m21) -
      m01 * (m10 * m23 - m13 * m20) +
      m03 * (m10 * m21 - m11 * m20)
    );
    const c33 =
      m00 * (m11 * m22 - m12 * m21) -
      m01 * (m10 * m22 - m12 * m20) +
      m02 * (m10 * m21 - m11 * m20);

    // Calculate determinant
    const det = m00 * c00 + m01 * c01 + m02 * c02 + m03 * c03;

    // Check if matrix is invertible
    if (Math.abs(det) < 1e-10) {
      throw new Error("matrix is not invertible"); // Matrix is not invertible
    }

    // Calculate inverse by dividing adjugate by determinant
    const invDet = 1.0 / det;
    return new KindaDOMMatrix([
      c00 * invDet,
      c10 * invDet,
      c20 * invDet,
      c30 * invDet,
      c01 * invDet,
      c11 * invDet,
      c21 * invDet,
      c31 * invDet,
      c02 * invDet,
      c12 * invDet,
      c22 * invDet,
      c32 * invDet,
      c03 * invDet,
      c13 * invDet,
      c23 * invDet,
      c33 * invDet,
    ]);
  }

  multiply(other) {
    const a = this.values;
    const b = other.values;
    const result = new Float64Array(16);

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += a[i + k * 4] * b[k + j * 4];
        }
        result[i + j * 4] = sum;
      }
    }

    const matrix = new KindaDOMMatrix();
    matrix.values = result;
    matrix.is2D = this.is2D && other.is2D;
    return matrix;
  }

  multiplySelf(other) {
    const result = this.multiply(other);
    this.is2D = result.is2D;
    this.values = result.values;
  }

  translate(tx = 0, ty = 0, tz = 0) {
    if (tz !== 0) this.is2D = false;
    const matrix = new KindaDOMMatrix();
    const m = matrix.values;
    m[12] = tx;
    m[13] = ty;
    m[14] = tz;
    return this.multiply(matrix);
  }

  scale(sx = 1, sy = sx, sz = 1) {
    if (sz !== 1) this.is2D = false;
    const matrix = new KindaDOMMatrix();
    const m = matrix.values;
    m[0] = sx;
    m[5] = sy;
    m[10] = sz;
    return this.multiply(matrix);
  }

  rotate(angle = 0, x = 0, y = 0, z = 1) {
    if (x !== 0 || y !== 0 || z !== 1) this.is2D = false;
    const matrix = new KindaDOMMatrix();
    const m = matrix.values;

    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    if (this.is2D) {
      m[0] = cos;
      m[1] = sin;
      m[4] = -sin;
      m[5] = cos;
    } else {
      // 3D rotation implementation
      const len = Math.sqrt(x * x + y * y + z * z);
      x /= len;
      y /= len;
      z /= len;

      const c = 1 - cos;
      m[0] = x * x * c + cos;
      m[1] = x * y * c + z * sin;
      m[2] = x * z * c - y * sin;
      m[4] = y * x * c - z * sin;
      m[5] = y * y * c + cos;
      m[6] = y * z * c + x * sin;
      m[8] = z * x * c + y * sin;
      m[9] = z * y * c - x * sin;
      m[10] = z * z * c + cos;
    }

    return this.multiply(matrix);
  }

  transformPoint(point) {
    const x = point.x;
    const y = point.y;
    const z = point.z;
    const w = point.w;

    const m = this.values;

    return new KindaDOMPoint(
      m[0] * x + m[4] * y + m[8] * z + m[12] * w,
      m[1] * x + m[5] * y + m[9] * z + m[13] * w,
      m[2] * x + m[6] * y + m[10] * z + m[14] * w,
      m[3] * x + m[7] * y + m[11] * z + m[15] * w,
    );
  }

  toFloat64Array() {
    return this.values;
  }

  toString() {
    if (this.is2D) {
      return `matrix(${this.values[0]}, ${this.values[1]}, ${this.values[4]}, ${this.values[5]}, ${this.values[12]}, ${this.values[13]})`;
    }
    return `matrix3d(${Array.from(this.values).join(", ")})`;
  }
}

let Matrix, Point;
if (typeof window === "undefined") {
  Matrix = KindaDOMMatrix;
  Point = KindaDOMPoint;
} else {
  Matrix = DOMMatrix;
  Point = DOMPoint;
}

export { KindaDOMMatrix, KindaDOMPoint };
export { Matrix as DOMMatrix, Point as DOMPoint };
