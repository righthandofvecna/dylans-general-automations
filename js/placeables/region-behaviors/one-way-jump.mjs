import { MODULENAME, centerTokenMovement } from "../../utils.mjs";

// const fu = foundry.utils;

/**
 * The OneWayJumpRegionBehaviorType class defines a region behavior that requires a token to jump in a specific direction when it enters or exits the region.
 */
class OneWayJumpRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static _systemType = `${MODULENAME}.oneWayJump`;
  
  /** @override */
  static defineSchema() {
    return {
      direction: new foundry.data.fields.StringField({ required: true, choices: Object.fromEntries(["up", "down", "left", "right"].map(choice => ([choice, choice]))), initial: "down" }),
    };
  }

  /* ---------------------------------------- */

  /** @override */
  static events = {
    [CONST.REGION_EVENTS.TOKEN_ENTER]: this.#onTokenMoveWithin,
    [CONST.REGION_EVENTS.TOKEN_MOVE_WITHIN]: this.#onTokenMoveWithin,
  };

  /* ---------------------------------------- */

  static async #onTokenMoveWithin(event) {
    const { region, scene } = this;
    const { data: { token, movement }, name: eventName, user } = event;

    
    if (user !== game.user || !token || !scene) return;
  
    const { sizeX, sizeY } = scene.grid;
  
    const renderedToken = token.object;
  
    const unlock = token.lockMovement();
    // wait until the token has finished animating
    await renderedToken.allAnimationsPromise;
    const startpos = centerTokenMovement(token, movement);
    if (!startpos) {
      unlock();
      return;
    }
  
    // check if the token is still inside the jump area
    if (!token.regions.has(region)) {
      unlock();
      return;
    }
    switch (this.direction) {
      case "down": 
        await token.update({ y: startpos.y + sizeY});
        break;
      case "left":
        await token.update({ x: startpos.x - sizeX});
        break;
      case "right":
        await token.update({ x: startpos.x + sizeX});
        break;
      case "up":
        await token.update({ y: startpos.y - sizeY});
        break;
    }
    unlock();
  }

}

export function register() {
  const OneWayJumpRBT = OneWayJumpRegionBehaviorType;
  CONFIG.RegionBehavior.dataModels[OneWayJumpRBT._systemType] = OneWayJumpRBT;
  CONFIG.RegionBehavior.typeLabels[OneWayJumpRBT._systemType] = `TYPES.RegionBehavior.${OneWayJumpRBT._systemType}`;
  CONFIG.RegionBehavior.typeIcons[OneWayJumpRBT._systemType] = "fas fa-arrow-up";
}