// @ts-check

import { zAxisTravel, openArea, xRailSupportWidth } from "./dimensions.js";
import { Path } from "./tools/path.js";

const bridgeTopThickness = zAxisTravel;

const curve = new Path();

curve.moveTo([xRailSupportWidth + openArea.y / 2, openArea.z]);
curve.lineTo([xRailSupportWidth, openArea.z]);
curve.arcTo([xRailSupportWidth, 0], 30);
curve.lineTo([0, 0]);
curve.lineTo([0, openArea.z + bridgeTopThickness]);
curve.lineTo([
  xRailSupportWidth + openArea.y / 2,
  openArea.z + bridgeTopThickness,
]);
curve.fillet(150);
curve.mirror();

document.body.innerHTML += `
<svg height="1000" width="1500" transform="scale(1, -1)">
  <path fill="none" stroke="black" d="${curve}"/>
</svg>
`;
