// @ts-check

// import { eps } from "../tools/2d.js";

export const NB_COLORS_PER_MATERIAL = 3;
const eps = 1;

const plasticLayerColor = [0.4 ,0.4, 0.4];
const woodColor = [0.640625, 0.453125, 0.28515625];
export const metalColor = [0.6, 0.65, 0.65];

export class Material {
  constructor(name) {
    this.name = name;
    this.colors = [0, 0.5, 0.5, 0.5, 0, 0.5, 0.5, 0.5, 0, 0.5, 0.5, 0.5];
  }
}

export class ConstructionPlywood extends Material {
  /**
   * @param {number} thickness
   */
  constructor(thickness) {
    super("construction plywood");
    this.colors = [
      eps,
      ...plasticLayerColor,
      thickness - eps,
      ...woodColor,
      0,
      ...plasticLayerColor,
    ];
  }
}

export class PlainColorMaterial extends Material {
  /**
   * @param {[number, number, number]} color
   */
  constructor(color) {
    super(`plain color ${color.toString()}`);
    this.colors = [0, ...color, 0, ...color, 0, ...color];
  }
}

export const metalMaterial = new PlainColorMaterial(metalColor);
export const defaultMaterial = new PlainColorMaterial([1, 0.5, 0.31]);
