import { base } from "./base.js";
import { Model } from "./lib.js";

export default 1;


const model = new Model("cnc");
model.addChild(base);

model.watch();
