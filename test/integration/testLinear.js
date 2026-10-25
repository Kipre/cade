import { LinearPart } from "../../lib/linear.js";
import { Path } from "../../tools/path.js";
import bro from "../../tools/test/brotest/brotest.js";

const profile = Path.makeRoundedRect(20, 30, 4).recenter();
const inner = Path.makeRoundedRect(18, 28, 2).recenter();

const part = new LinearPart("test", 50, profile, [inner]);
part.cutEdge("end", [1, 1, 3]);

bro.test("mirrors a simple assembly", async () => {
  const svg = await part.project();

  bro.expect(svg).toBe(
    `<svg xmlns="http://www.w3.org/2000/svg" transform="scale(1, -1)" viewBox="-15.223477 -3.7540565 30.446955 56.22123" style="background: #3392e6">
<g fill="none" stroke-width="1px">
<path d="M 0.6975529 52.467175 "/>
<path d="M 3.6865437 51.772804 "/>
<path d="M -15.223477 -1.3295617 A 0.95466876 4 -90 0 1 -13.517326 -2.111657L -3.6865437 -3.7540565 A 0.95466876 4 -90 0 1 1.8842335 -3.519428L 14.500405 0.78209513 A 0.95466876 4 -90 0 1 15.223477 1.3295617"/>
<path d="M -14.500405 40.115242 L -1.8842335 51.538174 "/>
<path d="M 3.6865437 51.772804 L 13.517326 46.246 "/>
<path d="M 14.500405 42.32683 "/>
<path d="M 14.500405 42.32683 L 1.8842335 30.903898 "/>
<path d="M -3.6865437 30.66927 "/>
<path d="M -3.6865437 30.66927 L -13.517326 36.196075 "/>
<path d="M -14.500405 40.115242 "/>
<path d="M 2.2938495 51.714146 "/>
<path d="M -14.254636 39.13545 L -0.49153915 51.596832 "/>
<path d="M -14.254636 39.13545 "/>
<path d="M -2.2938495 30.727928 L -13.763096 37.175865 "/>
<path d="M -2.2938495 30.727928 "/>
<path d="M 14.254636 43.306625 L 0.49153915 30.845242 "/>
<path d="M 14.254636 43.306625 "/>
<path d="M 2.2938495 51.714146 L 13.763096 45.266205 "/>
</g>
</svg>`,
  );
});
