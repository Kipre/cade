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

const nutRadius = 10.2 / 2;
const nutHoleOffset = -10 - nutRadius;
const nutHole = new Path();
nutHole.moveTo([nutRadius, nutHoleOffset]);
nutHole.arc([-nutRadius, nutHoleOffset], nutRadius, 0);
nutHole.arc([nutRadius, nutHoleOffset], nutRadius, 0);
nutHole.close();

const mortiseWidth = 30;
const spindleDiameter = 6;
const mortise = new Path();
mortise.moveTo([0, -woodThickness / 2]);
mortise.lineTo([spindleDiameter - mortiseWidth / 2, -woodThickness / 2]);
mortise.arc([-mortiseWidth / 2, -woodThickness / 2], spindleDiameter / 2, 0);
mortise.lineTo([-mortiseWidth / 2, 0]);
mortise.mirror([0, 0]);
mortise.mirror();

const maleMortise = new Path();
maleMortise.moveTo([-spindleDiameter - mortiseWidth / 2, 0]);
maleMortise.arc([-mortiseWidth / 2, 0], spindleDiameter / 2, 1);
maleMortise.lineTo([-mortiseWidth / 2, woodThickness]);
maleMortise.mirror([0, 0], [0, 1]);

function addSimpleReinforcingJoin(part1, part2, l1, l2, width, thickness) {
  const cutouts = [];
  const joinCutouts = [];

  const length = norm(l2, l1);
  const nbFasteners = Math.ceil(length / 250);
  const offset = 50;
  const fastenerPitch = (length - 2 * offset) / (nbFasteners - 1);

  const joinPart = new Path();
  joinPart.moveTo([0, width / 2]);

  const firstBolt = placeAlong(l1, l2, { fromStart: offset });
  cutouts.push(fastenerHole.translate(firstBolt));
  joinCutouts.push(nutHole.translate([offset, width / 2]));
  joinCutouts.push(nutHole.translate([offset, width / 2]).scale(1, -1));

  let lastLocation = offset;

  for (let i = 1; i < nbFasteners; i++) {
    const location = offset + i * fastenerPitch;

    const nextBolt = placeAlong(l1, l2, { fromStart: location });
    cutouts.push(fastenerHole.translate(nextBolt));
    joinCutouts.push(nutHole.translate([location, width / 2]));
    joinCutouts.push(nutHole.translate([location, width / 2]).scale(1, -1));

    const loc = (lastLocation + location) / 2;
    const nextMortise = placeAlong(l1, l2, { fromStart: loc });
    cutouts.push(mortise.translate(nextMortise));
    joinPart.merge(maleMortise.translate([loc, width / 2]));

    lastLocation = location;
  }

  joinPart.lineTo([length, width / 2]);
  joinPart.mirror([0, 0], [1, 0]);
  joinPart.close();

  return [cutouts, joinCutouts, joinPart];
}

const zJoin = bridgeTop - joinOffset - woodThickness / 2;
const [from, to] = p
  .intersectLine([-10, zJoin], [2 * xRailSupportWidth + openArea.y + 10, zJoin])
  .map((int) => int.point);

const [cutouts, joinCutouts, join] = addSimpleReinforcingJoin(
  part1,
  part2,
  from,
  to,
  bridgeJoinWidth,
  woodThickness,
);

debugGeometry(p, join);

for (const j of cutouts) debugGeometry(j);
for (const j of joinCutouts) debugGeometry(j);
