// @ts-check

import { nz3, x3, zero2 } from "../lib/defaults.js";
import { Assembly } from "../lib/lib.js";
import { blackMetalMaterial, metalMaterial } from "../lib/materials.js";
import { cut, extrusion, fuse } from "../lib/operations.js";
import { Part } from "../lib/part.js";
import { rotatePoint } from "../tools/2d.js";
import { Path } from "../tools/path.js";
import { a2m } from "../tools/transform.js";

const washerThickness = 1;

const isoFastenerSizes = {
  M3: {
    headSize: 5.5,
    pitch: 0.5,
    diameter: 3,
    boltHeadThickness: 2,
    nutThickness: 2.4,
    washerOuterDiameter: 7,
    washerInnerDiameter: 3.2,
    hexOuter: 5.5,
    hexSize: 2.5,
    hexHeadHeight: 3,
    lengths: [5, 6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 50],
  },
  M4: {
    headSize: 7,
    pitch: 0.7,
    diameter: 4,
    boltHeadThickness: 2.8,
    nutThickness: 3.2,
    washerOuterDiameter: 9,
    washerInnerDiameter: 4.3,
    hexOuter: 7,
    hexSize: 3,
    hexHeadHeight: 4,
    lengths: [6, 8, 10, 12, 14, 16, 18, 20, 25, 30, 35, 40, 45, 50, 55, 60],
  },
  M5: {
    headSize: 8,
    pitch: 0.8,
    diameter: 5,
    boltHeadThickness: 3.5,
    nutThickness: 4,
    washerOuterDiameter: 10,
    washerInnerDiameter: 5.3,
    hexOuter: 8.5,
    hexSize: 4,
    hexHeadHeight: 5,
    lengths: [
      6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 30, 35, 40, 45, 50, 55, 60, 70, 100,
    ],
  },
  M6: {
    headSize: 10,
    pitch: 1,
    diameter: 6,
    boltHeadThickness: 4,
    nutThickness: 5,
    washerOuterDiameter: 12,
    washerInnerDiameter: 6.4,
    hexOuter: 10,
    hexSize: 5,
    hexHeadHeight: 6,
    lengths: [
      8, 10, 12, 14, 16, 18, 20, 22, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75,
      80, 90, 100, 110, 130, 150,
    ],
  },
  M8: {
    headSize: 13,
    pitch: 1.25,
    diameter: 8,
    boltHeadThickness: 5.3,
    nutThickness: 6.5,
    washerOuterDiameter: 16,
    washerInnerDiameter: 8.4,
    hexOuter: 13,
    hexSize: 6,
    hexHeadHeight: 8,
    lengths: [
      8, 10, 12, 14, 16, 18, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80,
      90, 100, 110, 120, 140, 150, 180,
    ],
  },
};

/**
 * @param {"M3" | "M4" | "M5" | "M6" | "M8"} size
 * @param {number} length
 */
function makeBolt(size, length) {
  const { diameter, headSize, boltHeadThickness } = isoFastenerSizes[size];
  const headPath = Path.fromPolyline(
    Array.from({ length: 6 }, (_, i) =>
      rotatePoint(zero2, [headSize / 2, 0], (i * 2 * Math.PI) / 6),
    ),
  );

  const head = extrusion(
    a2m([0, 0, -boltHeadThickness]),
    boltHeadThickness,
    headPath,
  );
  const shank = extrusion(a2m(), length, Path.makeCircle(diameter / 2));

  const bolt = new Part(`${size} bolt ${length}`, fuse(head, shank));
  bolt.material = metalMaterial;
  bolt.symmetries = [0, 0, NaN];
  return bolt;
}

/**
 * @param {"M3" | "M4" | "M5" | "M6" | "M8"} size
 * @param {number} length
 */
function makeHexBolt(size, length) {
  const { diameter, hexOuter, hexSize, hexHeadHeight } = isoFastenerSizes[size];
  const headInner = Path.fromPolyline(
    Array.from({ length: 6 }, (_, i) =>
      rotatePoint(zero2, [hexSize / 2, 0], (i * 2 * Math.PI) / 6),
    ),
  );

  const head = cut(
    extrusion(
      a2m([0, 0, -hexHeadHeight]),
      hexHeadHeight,
      Path.makeCircle(hexOuter / 2),
    ),
    extrusion(a2m([0, 0, -hexHeadHeight]), (hexHeadHeight * 2) / 3, headInner),
  );
  const shank = extrusion(a2m(), length, Path.makeCircle(diameter / 2));

  const bolt = new Part(`${size} hex bolt ${length}`, fuse(head, shank));
  bolt.material = blackMetalMaterial;
  bolt.symmetries = [0, 0, NaN];
  return bolt;
}

/**
 * @param {"M3" | "M4" | "M5" | "M6" | "M8"} size
 */
function makeNut(size) {
  const { diameter, headSize, nutThickness } = isoFastenerSizes[size];
  const headPath = Path.fromPolyline(
    Array.from({ length: 6 }, (_, i) =>
      rotatePoint(zero2, [headSize / 2, 0], (i * 2 * Math.PI) / 6),
    ),
  );

  const head = extrusion(
    a2m([0, 0, -nutThickness]),
    nutThickness,
    headPath,
    Path.makeCircle(diameter / 2),
  );

  const nut = new Part(`${size} nut`, head);
  nut.material = metalMaterial;
  nut.symmetries = [0, 0, NaN];
  return nut;
}

const cylinderLength = 13;
export const cylinderDiameter = 10;

const cylinder = extrusion(
  a2m([-cylinderLength / 2, 0, 0], x3, nz3),
  cylinderLength,
  Path.makeCircle(cylinderDiameter / 2),
);

const m6hole = extrusion(
  a2m([0, 0, -cylinderDiameter]),
  cylinderDiameter * 2,
  Path.makeCircle(6 / 2),
);

const m5hole = extrusion(
  a2m([0, 0, -cylinderDiameter]),
  cylinderDiameter * 2,
  Path.makeCircle(5 / 2),
);

export const cylinderNut = new Part("m6 cylinder nut", cut(cylinder, m6hole));
cylinderNut.material = metalMaterial;

export const m5CylinderNut = new Part("m5 cylinder nut", cut(cylinder, m5hole));
m5CylinderNut.material = metalMaterial;

/**
 * @param {"M3" | "M4" | "M5" | "M6" | "M8"} size
 */
function makeWasher(size) {
  const { washerOuterDiameter, washerInnerDiameter } = isoFastenerSizes[size];

  const washerShape = extrusion(
    a2m([0, 0, -washerThickness]),
    washerThickness,
    Path.makeCircle(washerOuterDiameter / 2).invert(),
    Path.makeCircle(washerInnerDiameter / 2),
  );

  const washer = new Part(`${size} washer`, washerShape);
  washer.material = metalMaterial;
  washer.symmetries = [0, 0, NaN];
  return washer;
}

const tops = {};
const bottoms = {};

function getISOSize(size, length, addLengthForNut = true) {
  let mSize = "M3";
  if (size > 4) mSize = "M4";
  if (size > 5) mSize = "M5";
  if (size > 6) mSize = "M6";
  if (size > 8) mSize = "M8";
  if (size > 9 || size < 3)
    throw new Error(`we don't have bolts this size yet: size: ${size}`);

  const iso = isoFastenerSizes[mSize];
  let requiredLength = length;
  if (addLengthForNut) requiredLength += 2 + iso.nutThickness + 3;

  const availableLength = iso.lengths.find((x) => x >= requiredLength);
  const key = `${mSize}_${availableLength}`;
  return { key, mSize, availableLength };
}

export function getFastenerKit(size, length, addLengthForNut = true) {
  const { key, mSize, availableLength } = getISOSize(
    size,
    length,
    addLengthForNut,
  );

  let bottom = bottoms[mSize];
  if (bottom == null) {
    const nut = makeNut(mSize);
    const washer = makeWasher(mSize);
    bottom = new Assembly(`iso bottom ${mSize}`);
    bottom.addChild(nut, a2m([0, 0, -washerThickness]));
    bottom.addChild(washer);
    bottom.symmetries = [0, 0, NaN];
    bottoms[mSize] = bottom;
  }

  let top = tops[key];
  if (top == null) {
    const bolt = makeBolt(mSize, availableLength);
    const washer = bottom.children[1].child;
    top = new Assembly(`iso top ${key}`);
    top.addChild(bolt, a2m([0, 0, -washerThickness]));
    top.addChild(washer);
    top.symmetries = [0, 0, NaN];
    tops[key] = top;
  }

  return { top, bottom };
}

export function getHexFastener(size, length, addLengthForNut = true) {
  const {
    key: rawKey,
    mSize,
    availableLength,
  } = getISOSize(size, length, addLengthForNut);
  const { bottom } = getFastenerKit(size, length, addLengthForNut);

  const key = `hex ${rawKey}`;

  let top = tops[key];
  if (top == null) {
    top = makeHexBolt(mSize, availableLength);
    tops[key] = top;
  }

  return { top, bottom };
}

export function getHexAndBarrelNut(...args) {
  return { top: getHexFastener(...args).top, bottom: cylinderNut };
}

export function getBoltAndBarrelNut(...args) {
  return { top: getFastenerKit(...args).top, bottom: cylinderNut };
}

export const { top: m5Top } = getFastenerKit(5.3, 22);

export const { top: m6Top } = getFastenerKit(6.3, 26);

