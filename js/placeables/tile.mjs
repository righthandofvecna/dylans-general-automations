import { MODULENAME } from "../utils.mjs";
import { registerSocket } from "../socket.mjs";


function Tile_initializeEdges({deleted=false}={}) {
  // the tile has been deleted
  if ( deleted ) {
    [...canvas.edges.keys()].filter(k=>k.startsWith(`${this.id}_`)).forEach(eid=>canvas.edges.delete(eid));
    return;
  }

  if (!this?.document?.flags?.[MODULENAME]?.solid) return;

  const polygon = this?.bounds?.toPolygon()?.points;
  if (!polygon) return;
  polygon.push(polygon[0], polygon[1]);
  for (let e=0; e < 4; e++) {
    const eid = `${this.id}_${e}`;
    const pIdx = e * 2;
    canvas.edges.set(eid, new foundry.canvas.geometry.edges.Edge({x: polygon[pIdx + 0], y: polygon[pIdx + 1]}, {x: polygon[pIdx + 2], y: polygon[pIdx + 3]}, {
      id: eid,
      object: this,
      type: "wall",
      direction: CONST.WALL_DIRECTIONS.LEFT,
      light: CONST.WALL_SENSE_TYPES.NONE,
      sight: CONST.WALL_SENSE_TYPES.NONE,
      sound: CONST.WALL_SENSE_TYPES.NONE,
      move: CONST.WALL_MOVEMENT_TYPES.NORMAL,
      threshold: {
        light: 0,
        sight: 0,
        sound: 0,
        attenuation: false,
      }
    }));
  }
}

/** @inheritDoc */
function Tile_onCreate(wrapper, data, options, userId) {
  wrapper(data, options, userId);
  this.initializeEdges();
}

/** @inheritDoc */
function Tile_onUpdate(wrapper, changed, options, userId) {
  wrapper(changed, options, userId);
  if ("flags" in changed && MODULENAME in changed.flags) {
    this.initializeEdges({ deleted: !(changed?.flags[MODULENAME]?.solid ?? this?.document?.flags[MODULENAME]?.solid) });
  } else if ("x" in changed || "y" in changed || "width" in changed || "height" in changed) {
    this.initializeEdges();
  }

  if (("x" in changed || "y" in changed) && options.animate === true) {
    this.animate({ x: changed.x ?? this.x, y: changed.y ?? this.y }, options.animation);
  }
}

/** @inheritDoc */
function Tile_onDelete(wrapper, options, userId) {
  wrapper(options, userId);
  this.initializeEdges({deleted: true});
}


//
// Tile Visibility Logic
//

function _applyTileVisibility(tileDocument, markVisible=true) {
  const visibleDistance = tileDocument?.flags?.[MODULENAME]?.visibleDistance;
  let isVisible = tileDocument._pa_wasVisible ?? tileDocument.alpha > 0;
  let shouldBeVisible = tileDocument._source.alpha > 0;
  if (visibleDistance == 0) {
    shouldBeVisible = false;
  } else if (visibleDistance) {
    shouldBeVisible = false;
    for (const token of canvas.tokens?.controlled ?? []) {
      if (shouldBeVisible) break;
      const distance = Math.max(Math.abs(token.center.x - tileDocument.object.center.x), Math.abs(token.center.y - tileDocument.object.center.y)) / canvas.grid.size;
      shouldBeVisible ||= distance <= visibleDistance;
    }
  }

  if (markVisible) tileDocument._pa_wasVisible = shouldBeVisible;
  if (isVisible == shouldBeVisible) return false;
  tileDocument.alpha = shouldBeVisible ? tileDocument._source.alpha : (game.user.isGM ? 0.25 : 0);
  return true;
}

async function _redrawTile(tileDocument) {
  const obj = tileDocument.object;
  if (!obj) return;
  obj.renderable=true;
  obj.clear();
  await obj.draw();
}

function TileDocument_prepareDerivedData(wrapped) {
  wrapped.call(this);
  _applyTileVisibility(this, false);
}

// whenever a token is refreshed, check all the tile visibilities and redraw if necessary
function OnRefreshToken(tokenObj, options) {
  game.canvas.scene.tiles.contents.filter(t=>(t.flags?.[MODULENAME]?.visibleDistance ?? null) !== null).forEach(t=>{
    const needsUpdate = _applyTileVisibility(t);
    if (needsUpdate) {
      _redrawTile(t);
    }
  });
}


//
// Tile Pushing Logic
//

async function PushTile(tileUuid, dx, dy) {
  const tile = await fromUuid(tileUuid);
  if (!tile) return;
  // check if the tile is pushable
  if (!tile?.flags?.[MODULENAME]?.pushable) return;
  // try pushing the tile
  const shifted = tile.object._getShiftedPosition(dx, dy);
  if (shifted.x !== tile.x || shifted.y !== tile.y) {
    await tile.update(shifted, { animate: true, animation: { easing: "easeOutExpo", duration: 600 } });
  }
}

function Tile_getShiftedPosition(wrapped, dx, dy) {
  const shifted = wrapped(dx, dy);
  if (!this.document?.flags?.[MODULENAME]?.pushable) return shifted;

  const origin = this.center;
  const delta = { x: origin.x - this.document._source.x, y: origin.y - this.document._source.y };
  const source = new foundry.canvas.sources.PointMovementSource({object: this});
  source.initialize({x: origin.x, y: origin.y, elevation: this.document.elevation});
  const collides = CONFIG.Canvas.polygonBackends.move.testCollision(origin, {x: shifted.x + delta.x, y: shifted.y + delta.y }, {type: "move", mode: "any", source});
  return collides ? {x: this.document._source.x, y: this.document._source.y} : shifted;
}

async function Tile_animate(to, { duration, easing, name, ontick, ...options }={}) {
  // restrict "to" to x and y
  to = { x: to.x, y: to.y };
  
  this._animating = true;
  const animationData = { x: this.x, y: this.y };
  const priorAnimationData = foundry.utils.deepClone(animationData);
  const animateFrame = (context) => {
    if ( context.time >= context.duration ) foundry.utils.mergeObject(animationData, context.to);
    const changes = foundry.utils.diffObject(priorAnimationData, animationData);
    foundry.utils.mergeObject(priorAnimationData, animationData);
    foundry.utils.mergeObject(this.document, animationData, {insertKeys: false});
    const positionChanged = ("x" in changes) || ("y" in changes);
    this.renderFlags.set({
      refreshPosition: positionChanged,
    });
  };

  let context = {};
  context.to = to;

  const changes = foundry.utils.diffObject(animationData, to);
  const attributes = [...Object.keys(changes)].map(k=>({ attribute: k, parent: animationData, to: changes[k] }));

  duration ??= 100;
  animateFrame(context);
  // Dispatch the animation
  context.promise = CanvasAnimation.animate(attributes, {
    name: "move",
    context: this,
    duration,
    easing,
    priority: PIXI.UPDATE_PRIORITY.OBJECTS + 1, // Before perception updates and Token render flags
    ontick: (dt, anim) => {
      context.time = anim.time;
      if ( ontick ) ontick(dt, anim, animationData);
      animateFrame(context);
    }
  });
  await context.promise.finally(() => {
    this._animating = false;
  });
}


/** 
 * Initialize all the edges for tiles when the canvas refreshes
 */
function OnInitializeEdges() {
  // Token edges are deprecated - Tiles still use edges for collision detection
  for (const tile of canvas.tiles.placeables) {
    tile?.initializeEdges?.();
  }
}

/**
 * The tiles are not ready during initializeEdges in foundry v14
 */
function OnCanvasReady() {
  OnInitializeEdges();
}


export function register() {
  Hooks.on("initializeEdges", OnInitializeEdges);
  Hooks.on("canvasReady", OnCanvasReady);

  CONFIG.Tile.objectClass.prototype.initializeEdges = Tile_initializeEdges;
  libWrapper.register(MODULENAME, "CONFIG.Tile.objectClass.prototype._onCreate", Tile_onCreate, "WRAPPER");
  libWrapper.register(MODULENAME, "CONFIG.Tile.objectClass.prototype._onUpdate", Tile_onUpdate, "WRAPPER");
  libWrapper.register(MODULENAME, "CONFIG.Tile.objectClass.prototype._onDelete", Tile_onDelete, "WRAPPER");
  libWrapper.register(MODULENAME, "CONFIG.Tile.objectClass.prototype._getShiftedPosition", Tile_getShiftedPosition, "WRAPPER");
  libWrapper.register(MODULENAME, "CONFIG.Tile.documentClass.prototype.prepareDerivedData", TileDocument_prepareDerivedData, "WRAPPER");
  CONFIG.Tile.objectClass.prototype.animate = Tile_animate;

  Hooks.on("refreshToken", OnRefreshToken);

  // register Push Tile socket
  registerSocket("pushTile", PushTile);
}