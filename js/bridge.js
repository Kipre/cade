// @ts-check

import {
  zAxisTravel,
  openArea,
  xRailSupportWidth,
  woodThickness,
} from "./dimensions.js";
import { norm, placeAlong } from "./tools/2d.js";
import { Path } from "./tools/path.js";
import { debugGeometry } from "./tools/svg.js";

const bridgeTopThickness = zAxisTravel;
const bridgeTop = openArea.z + bridgeTopThickness;
const joinOffset = 10;
const bridgeJoinWidth = 100 - 2 * woodThickness;

class FlatPart {
  constructor(outside) {
    this.outside = outside;
    this.insides = [];
  }
}

const p = new Path();

p.moveTo([xRailSupportWidth + openArea.y / 2, openArea.z]);
p.lineTo([xRailSupportWidth, openArea.z]);
p.arcTo([xRailSupportWidth, 0], 30);
p.lineTo([0, 0]);
p.lineTo([0, bridgeTop]);
p.lineTo([xRailSupportWidth + openArea.y / 2, bridgeTop]);
p.fillet(150);
p.mirror();

const part1 = new FlatPart(p);
const part2 = new FlatPart(p);

const holeRadius = 7 / 2;
const fastenerHole = new Path();
fastenerHole.moveTo([holeRadius, 0]);
fastenerHole.arc([-holeRadius, 0], holeRadius, 0);
fastenerHole.arc([holeRadius, 0], holeRadius, 0);
fastenerHole.close();

const mortiseWidth = 30;
const spindleDiameter = 6;
const mortise = new Path();
mortise.moveTo([0, -woodThickness / 2]);
mortise.lineTo([spindleDiameter - mortiseWidth / 2, -woodThickness / 2]);
mortise.arc([-mortiseWidth / 2, -woodThickness / 2], spindleDiameter / 2, 0);
mortise.lineTo([- mortiseWidth / 2, 0]);
mortise.mirror([0, 0]);
mortise.mirror();

function addSimpleReinforcingJoin(part1, part2, l1, l2, width, thickness) {
  const cutouts = [];

  const length = norm(l2, l1);
  const nbFasteners = Math.ceil(length / 250);
  const offset = 50;
  const fastenerPitch = (length - 2 * offset) / (nbFasteners - 1);

    cutouts.push(fastenerHole.translate(placeAlong(l1, l2, {fromStart: offset})));
  let lastLocation = offset;

  for (let i = 1; i < nbFasteners; i++) {
    const location = offset + i * fastenerPitch;
    cutouts.push(fastenerHole.translate(placeAlong(l1, l2, {fromStart: location})));
    const mortiseLoc = (lastLocation + location) / 2;
    cutouts.push(mortise.translate(placeAlong(l1, l2, {fromStart: mortiseLoc})));
    lastLocation = location;
  }
  return cutouts;
}

const zJoin = bridgeTop - joinOffset - woodThickness / 2;
const [from, to] = p
  .intersectLine([-10, zJoin], [2 * xRailSupportWidth + openArea.y + 10, zJoin])
  .map((int) => int.point);

const join1 = addSimpleReinforcingJoin(
  part1,
  part2,
  from,
  to,
  bridgeJoinWidth,
  woodThickness,
);
debugGeometry(p);
for (const j of join1) debugGeometry(j);
