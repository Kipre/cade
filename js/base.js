import { Assembly } from "./lib.js";
import { woodenBase } from "./woodenBase.js";

export const base = new Assembly("complete frame");

base.addChild(woodenBase);
