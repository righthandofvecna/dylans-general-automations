import * as door from "./door.mjs";
import * as oneWayJump from "./one-way-jump.mjs";
import * as slidingIce from "./sliding-ice.mjs";
import * as imageShow from "./image-show.mjs";


export function register() {
  door.register();
  oneWayJump.register();
  slidingIce.register();
  imageShow.register();
}
