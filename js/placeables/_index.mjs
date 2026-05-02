import * as tile from "./tile.mjs";
import * as movement from "./token-movement.mjs";
import * as token from "./token.mjs";
import * as regionBehaviors from "./region-behaviors/_index.mjs";

export function register() {
  tile.register();
  movement.register();
  token.register();
  regionBehaviors.register();
}
