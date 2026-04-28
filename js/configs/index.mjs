import * as tokenConfig from "./token-config.mjs";
import * as tileConfig from "./tile-config.mjs";

export function register() {
  tokenConfig.register();
  tileConfig.register();
}
