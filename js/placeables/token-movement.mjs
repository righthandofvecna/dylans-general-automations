import { MODULENAME, angleDiff, getDirectionFromAngle } from "../utils.mjs";
import { VolumeSettings } from "../settings.mjs";
import * as socket from "../socket.mjs";


/**
 * Turn the character and update the rotation when a collision occurs.
 * @param {*} wrapped 
 * @param {*} changed 
 * @param {*} options 
 * @param {*} user 
 * @returns 
 */
async function TokenDocument_preUpdate(wrapped, changed, options, user) {
  await wrapped(changed, options, user);
  const bumpSound = game.modules.get(MODULENAME).defaults?.bumpSound;
  const lwp = options.movement?.[this.id]?.waypoints?.at(-1) ?? changed;
  if (!lwp || options?._movement?.[this.id]?.pending?.waypoints?.length > 0) return;
  const obj = this.object;
  // update direction
  const dx = lwp.x - this.x;
  const dy = lwp.y - this.y;
  const angle = ((a)=>isNaN(a) ? this.rotation : a)(((Math.atan2(-dx, dy) * 180 / Math.PI) + 360) % 360);
  const stopped = lwp.x != changed.x || lwp.y != changed.y;
  const bumped = stopped && (angleDiff(angle, this.rotation) < 45 || !obj?.hasFacing);
  if (stopped) { 
    if (game.settings.get("core", "tokenAutoRotate") || obj?.isSpritesheet) { changed.rotation = angle; }
    else if (obj) {
      obj.direction = getDirectionFromAngle(angle);
    }
  }
  if (bumped && this._pushing) this.object._tryPush?.(dx, dy);
  if (bumped && game.settings.get(MODULENAME, "playCollisionSound")) {
    new Sequence({ moduleName: MODULENAME, softFail: true })
      .sound()
        .file(bumpSound)
        .volume(VolumeSettings.getVolume("collide"))
        .locally(true)
        .async()
      .play();
  };
}



function SpritesheetToken_tryPush(dx, dy) {
  dx = Math.round(dx / Math.max(Math.abs(dx), Math.abs(dy)));
  dy = Math.round(dy / Math.max(Math.abs(dx), Math.abs(dy)));
  if (dx === 0 && dy === 0) return;
  const shifted = PlaceableObject.prototype._getShiftedPosition.bind(this)(dx, dy);
  const collides = this.checkCollision(this.getCenterPoint(shifted), { mode: "closest" });
  if (!collides) return;
  const walls = collides.edges.filter(e=>e.object instanceof Wall);
  // check if we collided with a tile that can be pushed
  if (walls.size === 0) {
    const pushables = collides.edges.filter(e=>e.object instanceof Tile && e.object?.document?.flags?.[MODULENAME]?.pushable).map(e=>e.object);
    pushables.forEach(tile=>socket.current().executeAsGM("pushTile", tile?.document?.uuid, dx, dy))
  }
}


// function PlaceablesLayer_getMovableObjects(wrapped, ids, includeLocked) {
//   return wrapped(ids, includeLocked).filter(t=>includeLocked || (t?.document?.movable ?? true));
// }


// function TokenDocument_lockMovement() {
//   const lockId = foundry.utils.randomID();
//   if (this._movementLocks === undefined)
//     this._movementLocks = new Set();
//   this._movementLocks.add(lockId);
//   const thisToken = this;
//   return function () {
//     thisToken._movementLocks.delete(lockId);
//   };
// }


export function register() {
  libWrapper.register(MODULENAME, "CONFIG.Token.documentClass.prototype._preUpdate", TokenDocument_preUpdate, "WRAPPER");
  // libWrapper.register(MODULENAME, "foundry.canvas.layers.PlaceablesLayer.prototype._getMovableObjects", PlaceablesLayer_getMovableObjects, "WRAPPER");
  
  // CONFIG.Token.documentClass.prototype.lockMovement = TokenDocument_lockMovement;
  CONFIG.Token.objectClass.prototype._tryPush = SpritesheetToken_tryPush;
}
