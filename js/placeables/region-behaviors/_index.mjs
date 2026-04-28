import * as door from "./door.mjs";
import * as oneWayJump from "./one-way-jump.mjs";
import * as slidingIce from "./sliding-ice.mjs";


export function register() {
  door.register();
  oneWayJump.register();
  slidingIce.register();
}
