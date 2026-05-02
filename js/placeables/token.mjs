import { MODULENAME, DATNAME, getCombatsForScene } from "../utils.mjs";


function Token_canDrag(wrapped) {
  if (wrapped(...arguments) === false) return false;
  try {
    const scene = this?.document?.parent;
    const hasCombat = getCombatsForScene(scene?.uuid).length > 0;
    if (!game.user.isGM && (scene.getFlag(MODULENAME, "disableDrag") && !(scene.getFlag(MODULENAME, "outOfCombat") && hasCombat)))
      return false;
  } catch { }
  return true;
}

export function register() {
  libWrapper.register(MODULENAME, "CONFIG.Token.objectClass.prototype._canDrag", Token_canDrag, "WRAPPER");
}
