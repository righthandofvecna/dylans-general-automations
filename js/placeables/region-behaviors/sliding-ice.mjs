import { MODULENAME } from "../../utils.mjs";

const ANIMATION_TIMEOUT_MS = 5000;

/**
 * Race a promise against a timeout so we never hang waiting for an animation
 * that stalls or was already settled.
 */
function settle(promise) {
  return Promise.race([
    Promise.resolve(promise).catch(() => {}),
    new Promise((r) => setTimeout(r, ANIMATION_TIMEOUT_MS)),
  ]);
}

/**
 * Test whether moving a token's centre from `origin` to `dest` would collide.
 * Prefers the Token object's own checkCollision when available (V14+).
 */
function collides(tokenObj, origin, dest) {
  if (typeof tokenObj?.checkCollision === "function") {
    return !!tokenObj.checkCollision(dest, { origin, type: "move", mode: "any" });
  }
  const source = new foundry.canvas.sources.PointMovementSource({ object: tokenObj });
  source.initialize({ x: origin.x, y: origin.y, elevation: origin.elevation });
  const hits = CONFIG.Canvas.polygonBackends.move.testCollision(origin, dest, { type: "move", mode: "any", source });
  return Array.isArray(hits) ? hits.length > 0 : !!hits;
}

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
    const { data: { token, movement }, user } = event;

    if (user?.id !== game.user.id || !token || !scene) return;
    if (token._sliding) return;

    token._sliding = true;
    const unlock = typeof token.lockMovement === "function" ? token.lockMovement() : null; // TODO: add lockMovement if dylan's animated tokens isn't enabled
    try {
      // Cancel any remaining pending waypoints from a multi-step drag
      if (movement?.pending?.waypoints?.length) token.stopMovement?.();

      // Wait for the triggering step to finish before moving again
      await settle(token.object?.allAnimationsPromise);

      // Bail if the token left the region while we were waiting
      if (token.regions && !token.regions.has(region)) return;

      const { sizeX, sizeY } = scene.grid;
      const elevation = token.elevation ?? 0;

      // Determine slide direction from the last movement segment
      const waypoints = movement?.passed?.waypoints ?? [];
      const last = waypoints.at(-1) ?? { x: token.x, y: token.y };
      let prev = waypoints.at(-2);
      if (!prev || (prev.x === last.x && prev.y === last.y)) prev = movement?.origin ?? last;

      const dx = Math.sign(last.x - prev.x) * sizeX;
      const dy = Math.sign(last.y - prev.y) * sizeY;
      if (!dx && !dy) return;

      // Collision checks are done in cell centres; convert back at the end.
      // Snap to the nearest cell centre so a misaligned token doesn't drift.
      const hx = ((token.width ?? 1) * sizeX) / 2;
      const hy = ((token.height ?? 1) * sizeY) / 2;
      const rawCenter = { x: last.x + hx, y: last.y + hy };
      const snappedCenter = canvas.grid.getSnappedPoint(rawCenter, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
      const tokenCenter = { x: snappedCenter.x, y: snappedCenter.y, elevation };
      const renderedToken = token.object;

      let endCenter = tokenCenter;
      for (let n = 1; n < 80; n++) {
        if (n > 1 && !region.testPoint(endCenter, elevation)) break; // stepped off ice
        const nextCenter = { x: tokenCenter.x + dx * n, y: tokenCenter.y + dy * n, elevation };
        if (collides(renderedToken, tokenCenter, nextCenter)) break;
        endCenter = nextCenter;
      }

      if (endCenter === tokenCenter) return;

      const dest = { x: endCenter.x - hx, y: endCenter.y - hy, elevation };
      if (typeof token.move === "function") {
        const action = last.action ?? token.movementAction;
        await token.move([{ ...dest, ...(action ? { action } : {}) }], { constrainOptions: { ignoreCost: true } });
      } else {
        await token.update({ x: dest.x, y: dest.y });
      }
      await settle(token.object?.allAnimationsPromise);

    } catch (err) {
      console.error(`${MODULENAME} | Sliding Ice failed for ${token.name}; token released.`, err);
    } finally {
      token._sliding = false;
      unlock?.();
      token.object?._refreshRotation?.();
    }
  }

}

export function register() {
  const SlidingIceRBT = SlidingIceRegionBehaviorType;
  CONFIG.RegionBehavior.dataModels[SlidingIceRBT._systemType] = SlidingIceRBT;
  CONFIG.RegionBehavior.typeLabels[SlidingIceRBT._systemType] = `TYPES.RegionBehavior.${SlidingIceRBT._systemType}`;
  CONFIG.RegionBehavior.typeIcons[SlidingIceRBT._systemType] = "fas fa-ice-skate";
}