import * as regionConfig from "./region-config.mjs";
import * as sceneConfig from "./scene-config.mjs";
import * as tokenConfig from "./token-config.mjs";
import * as tileConfig from "./tile-config.mjs";

export function register() {
  regionConfig.register();
  sceneConfig.register();
  tokenConfig.register();
  tileConfig.register();
}
