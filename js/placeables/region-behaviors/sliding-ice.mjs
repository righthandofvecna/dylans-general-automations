import { MODULENAME } from "../../utils.mjs";

// const fu = foundry.utils;

/**
 * The SlidingIceRegionBehaviorType class defines a region behavior that requires sliding on ice when a token enters or exits the region.
 */
class SlidingIceRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static _systemType = `${MODULENAME}.slidingIce`;
  
  /** @override */
  static defineSchema() {
    return {};
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

    if (user?.id !== game.user.id || !token || !scene) return;

    if (token._sliding ?? false) return;
    token._sliding = true;
    const unlock = token.lockMovement(); // TODO add lockMovement if dylan's token animations isn't set up
    const stopped = token.stopMovement();

    const { sizeX, sizeY } = scene.grid;
    const elevation = token.elevation ?? 0;
    const lastWaypoint = token.movement.passed.waypoints.at(-1);
    const tokenSource = game.canvas.grid.getSnappedPoint({ x: lastWaypoint.x, y: lastWaypoint.y, elevation }, { mode: CONST.GRID_SNAPPING_MODES.CENTER });

    const renderedToken = token.object;

    // wait until the token has finished animating
    // await renderedToken.allAnimationsPromise;

    const { origin: src } = movement;
    const startpos = movement.passed?.waypoints?.at(-1) ?? { x: token.x, y: token.y };
    const dest = movement.passed?.waypoints?.at(-1) ?? movement?.pending?.waypoints?.at(0) ?? origin;

    const dx = Math.sign(dest.x - src.x) * sizeX;
    const dy = Math.sign(dest.y - src.y) * sizeY;

    let count = 1;
    let endpos = foundry.utils.deepClone(tokenSource);
    // check if the token is still inside the slide area
    while (count < 80 && (count == 1 || region.testPoint(endpos))) {
      // hitscan out!
      const pointSource = new foundry.canvas.sources.PointMovementSource({object: renderedToken});
      pointSource.initialize(renderedToken);
      const nextPos = { x: tokenSource.x + (dx * count), y: tokenSource.y + (dy * count), elevation };
      const stops = (CONFIG.Canvas.polygonBackends.move.testCollision(tokenSource, nextPos, {
        type: "move",
        mode: "all",
        source: pointSource
      }) ?? []);
      if (stops.length) break;
      endpos = nextPos;
      count++;
    }
    if (endpos.x != tokenSource.x || endpos.y != tokenSource.y) {
      endpos.x -= sizeX / 2;
      endpos.y -= sizeY / 2;

      // if we moved, update the token's position
      await token.update({
        x: endpos.x,
        y: endpos.y,
      });
    }
    await renderedToken.allAnimationsPromise; // TODO: add allAnimationPromise if dylan's token animations isn't set up
    token._sliding = false;
    unlock();
    renderedToken._refreshRotation();
  }

}

export function register() {
  const SlidingIceRBT = SlidingIceRegionBehaviorType;
  CONFIG.RegionBehavior.dataModels[SlidingIceRBT._systemType] = SlidingIceRBT;
  CONFIG.RegionBehavior.typeLabels[SlidingIceRBT._systemType] = `TYPES.RegionBehavior.${SlidingIceRBT._systemType}`;
  CONFIG.RegionBehavior.typeIcons[SlidingIceRBT._systemType] = "fas fa-ice-skate";
}