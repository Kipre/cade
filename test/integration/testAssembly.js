// @ts-check

import { x3, y3, z3, zero3 } from "../../lib/defaults.js";
import { Assembly } from "../../lib/lib.js";
import { cut, extrusion, fuse } from "../../lib/operations.js";
import { Part } from "../../lib/part.js";
import { Path } from "../../tools/path.js";
import bro from "../../tools/test/brotest/brotest.js";
import { a2m, intersectPlanes } from "../../tools/transform.js";


const length = 500;
const height = 1000;
const profile = Path.makeRect(30, 50).recenter();
const profile2 = Path.makeRect(50, 50).recenter();

const frame = new Assembly("bed frame");

const square = new Assembly("square");

const across = new Part("across", extrusion(a2m(), length, profile));
across.newSymmetries = [a2m(zero3, x3), a2m(zero3, y3)];
square.addChild(across, a2m([0, 0, height], y3));

const bottomSupport = new Assembly("bottom support");
const bottomRect = new Part("bottom rect", extrusion(a2m(), length, profile));
bottomRect.newSymmetries = [a2m(zero3, x3), a2m(zero3, y3), a2m([0, 0, length / 2], z3)];

bottomSupport.addChild(bottomRect);

const holderLength = 100;

const holderExtrusion = extrusion(a2m(), holderLength, profile2);
const railClearance = extrusion(
  a2m([0, -40, 50], y3),
  50 * 2,
  profile.recenter({ x: "start" }).offset(4)
);

const wheelHolder = new Part("wheel holder", cut(holderExtrusion, railClearance));
wheelHolder.newSymmetries = [a2m(zero3, y3), a2m(zero3, z3)];

bottomSupport.addChild(wheelHolder, a2m([0, 0, length]));

square.addChild(bottomSupport, a2m([0, length, height], [0, -length, -height / 2]));

frame.addChild(square);

const debug = new Assembly("debug");
frame.addChild(debug);

const mirror = a2m([200, 0, 0], x3);
const located = square.enantiometer(mirror);
console.log(located);
frame.addChild(located.child, located.placement);

bro.test("mirrors a simple assembly", async () => {
  const r = await frame.project();
  const svg = await r.text();

  bro
    .expect(svg)
    .toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" transform="scale(1, -1)" viewBox="-309.15714 465.49826 649.1384 531.9337" style="background: #3392e6">
<g fill="none" stroke-width="1px">
<path d="M -12.288479 997.43195 L -299.01965 899.67004 L -299.01965 875.3925 "/>
<path d="M 12.288479 944.7709 L -274.4427 847.009 "/>
<path d="M 12.288479 993.326 L -274.4427 895.5641 "/>
<path d="M 12.288479 944.7709 L 12.288479 993.326 "/>
<path d="M -274.4427 847.009 L -274.4427 895.5641 "/>
<path d="M 12.288479 993.326 L -12.288479 997.43195 "/>
<path d="M -274.4427 895.5641 L -299.01965 899.67004 "/>
<path d="M 315.4043 942.6853 L 28.673117 844.9234 L 28.673117 820.6459 "/>
<path d="M 339.98126 890.02423 L 53.250076 792.2623 "/>
<path d="M 339.98126 938.5793 L 53.250076 840.81744 "/>
<path d="M 339.98126 890.02423 L 339.98126 938.5793 "/>
<path d="M 53.250076 792.2623 L 53.250076 840.81744 "/>
<path d="M 339.98126 938.5793 L 315.4043 942.6853 "/>
<path d="M 53.250076 840.81744 L 28.673117 844.9234 "/>
<path d="M -309.15714 854.76935 L -106.40757 580.5612 "/>
<path d="M -309.15714 854.76935 L -299.01965 875.3925 "/>
<path d="M -264.3052 891.9097 L -61.55566 617.70166 "/>
<path d="M -284.58017 850.6633 L -81.83061 576.4552 "/>
<path d="M -264.3052 891.9097 L -284.58017 850.6633 "/>
<path d="M -61.55566 617.70166 L -81.83061 576.4552 "/>
<path d="M -284.58017 850.6633 L -309.15714 854.76935 "/>
<path d="M -81.83061 576.4552 L -106.40757 580.5612 "/>
<path d="M 63.387554 837.1631 L 266.13712 562.95496 "/>
<path d="M 43.1126 795.9167 L 245.86215 521.70856 "/>
<path d="M 63.387554 837.1631 L 43.1126 795.9167 "/>
<path d="M 266.13712 562.95496 L 245.86215 521.70856 "/>
<path d="M 18.535639 800.02264 L 221.2852 525.8146 "/>
<path d="M 43.1126 795.9167 L 18.535639 800.02264 "/>
<path d="M 245.86215 521.70856 L 221.2852 525.8146 "/>
<path d="M 18.535639 800.02264 L 28.673117 820.6459 "/>
<path d="M -114.59989 581.9299 L -74.04998 527.08826 "/>
<path d="M -114.59989 581.9299 L -111.73258 587.763 "/>
<path d="M -73.6383 575.08655 L -114.59989 581.9299 "/>
<path d="M -33.088383 520.24493 L -74.04998 527.08826 "/>
<path d="M -41.603867 531.76166 L -33.088383 520.24493 "/>
<path d="M -41.603867 531.76166 L -65.361595 535.7308 L -88.88054 567.53894 L -65.12282 563.5698 "/>
<path d="M -73.6383 575.08655 L -65.12282 563.5698 "/>
<path d="M -61.55566 617.70166 L -53.36334 616.33295 L -44.84786 604.8162 "/>
<path d="M -53.163063 587.90015 L -45.086636 576.97723 L -21.32891 573.0081 L -12.813429 561.49133 "/>
<path d="M -53.36334 616.33295 L -73.6383 575.08655 "/>
<path d="M -12.813429 561.49133 L -33.088383 520.24493 "/>
<path d="M -21.32891 573.0081 L -41.603867 531.76166 "/>
<path d="M -65.361595 535.7308 L -45.086636 576.97723 "/>
<path d="M -65.12282 563.5698 L -44.84786 604.8162 "/>
<path d="M 274.32944 561.5863 L 314.87933 506.7447 "/>
<path d="M 254.05447 520.3399 L 294.60437 465.49826 "/>
<path d="M 274.32944 561.5863 L 254.05447 520.3399 "/>
<path d="M 314.87933 506.7447 L 294.60437 465.49826 "/>
<path d="M 266.13712 562.95496 L 274.32944 561.5863 "/>
<path d="M 254.05447 520.3399 L 213.09288 527.1832 L 221.60835 515.6665 L 245.36609 511.69736 L 268.88504 479.88922 L 245.1273 483.85834 L 253.64279 472.3416 "/>
<path d="M 294.60437 465.49826 L 253.64279 472.3416 "/>
<path d="M 213.09288 527.1832 L 215.96019 533.01636 "/>
<path d="M 245.1273 483.85834 L 253.4425 500.7744 "/>
</g>
</svg>`,
    );
});

