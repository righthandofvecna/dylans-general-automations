
import { isTheGM, MODULENAME, sleep, snapToGrid, tokenScene, centerTokenMovement } from "./utils.mjs";
import { VolumeSettings } from "./settings.mjs";
import * as socket from "./socket.mjs";
import { FooterDialogPrompt, FooterDialogConfirm } from "./dialog.mjs";


/**
 * 
 * @param {*} tile 
 * @param {*} actor 
 * @param {*} items 
 * @param {*} message 
 */
async function TriggerPickUpItem(tileUuid, actorUuid, itemUuids) {
  const tile = await fromUuid(tileUuid);
  if (!tile) throw new Error("Tile not found — already picked up.");
  await tile.delete(); // Acts as mutex: if already deleted, throws and awards are skipped

  const actor = await fromUuid(actorUuid);
  const awards = await Promise.all(itemUuids.map(uuid => fromUuid(uuid)));
  const itemObjects = awards.filter(a => a?.documentName === "Item").map(a => a.toObject());
  const actorObjects = awards.filter(a => a?.documentName === "Actor");

  const { AwardItems, AssignActorToActor } = game.modules.get(MODULENAME)?.api?.scripts ?? {};
  await Promise.all([
    ...(itemObjects.length ? [AwardItems(actor, itemObjects)] : []),
    ...actorObjects.map(actorObj => AssignActorToActor(actorObj, actor)),
  ]);
}

async function PickUpItem(tile, actor, items, message) {
  FooterDialogPrompt({ content: message, callback: async ()=>{
    try {
      if (game.user.isGM) {
        await TriggerPickUpItem(tile.uuid, actor.uuid, items);
      } else {
        await socket.current().executeAsGM("pickUpItem", tile.uuid, actor.uuid, items);
      }
    } catch(e) {
      console.log("Error picking up item:", e);
      FooterDialogPrompt({
        content: `Oops! Someone else grabbed ${items.length > 1 ? "them" : "it"} first!`,
      });
    }
  }});
}

/**
 * Play the interaction sound!
 */
export async function Interact(options = {}) {
  if (game.settings.get(MODULENAME, "playInteractSound")) {
    await new Sequence({ moduleName: MODULENAME, softFail: true })
      .sound()
        .file(options?.sound ?? game.modules.get(MODULENAME).defaults?.interactionSound)
        .volume(VolumeSettings.getVolume("interact"))
        .locally(true)
        .waitUntilFinished()
      .play();
  }
}

async function DeleteTile(tileUuid) {
  if (!game.user.isGM) return socket.current().executeAsGM("deleteTile", tileUuid);
  const tile = await fromUuid(tileUuid);
  await tile.delete();
}

/**
 * Play the Rock Smash animation and destroy the tile.
 * @param {TileDocument} tile the tile document to destroy using Rock Smash
 */
async function TriggerTileBreak(tile) {
  if (!game.user.isGM) return;

  const shatterSound = game.modules.get(MODULENAME).defaults?.shatterSound;

  await sleep(300);
  await new Sequence()
    .sound()
      .file(shatterSound)
      .volume(VolumeSettings.getVolume("shatter"))
    .animation()
      .on(tile)
      .opacity(0.5)
      .duration(125)
      .waitUntilFinished()
    .animation()
      .on(tile)
      .opacity(1)
      .duration(125)
      .waitUntilFinished()
    .animation()
      .on(tile)
      .opacity(0.5)
      .duration(125)
      .waitUntilFinished()
    .animation()
      .on(tile)
      .opacity(1)
      .duration(125)
      .waitUntilFinished()
    .play();
  await tile.delete();
}



/**
 * Check if the token is facing one of the given directions
 * @param {SpritesheetToken} token 
 * @param {array} directions 
 * @returns 
 */
function TokenHasDirection(token, directions) {
  return !token?.object?.isSpritesheet || directions.includes(token?.object?.direction);
}

/**
 * A template for target-painting an area
 */
class PainterTemplate extends MeasuredTemplate {
  #initialLayer;
  #events;
  #moveTime;

  /**
   * Creates a preview of the template.
   * @returns {Promise}  A promise that resolves with the final template if created.
   */
  drawPreview() {
    const initialLayer = canvas.activeLayer;

    // Draw the template and switch to the template layer
    this.draw();
    this.layer.activate();
    this.layer.preview.addChild(this);

    // Hide the sheet that originated the preview
    // this.actorSheet?.minimize();

    // Activate interactivity
    return this.activatePreviewListeners(initialLayer);
  }

  /** @override */
  async _draw(options) {

    // Load Fill Texture
    if ( this.document.texture ) {
      this.texture = await loadTexture(this.document.texture, {fallback: "icons/svg/hazard.svg"});
    } else {
      this.texture = null;
    }

    // Template Shape
    this.template = this.addChild(new PIXI.Graphics());

    // Enable highlighting for this template
    canvas.interface.grid.addHighlightLayer(this.highlightId);
  }

  /**
   * Refresh the displayed state of the MeasuredTemplate.
   * This refresh occurs when the user interaction state changes.
   * @protected
   */
  _refreshState() {

    // Template Visibility
    const wasVisible = this.visible;
    this.visible = this.isVisible && !this.hasPreview;
    if ( this.visible !== wasVisible ) MouseInteractionManager.emulateMoveEvent();

    // Sort on top of others on hover
    this.zIndex = this.hover ? 1 : 0;

    // Control Icon Visibility
    const isHidden = this.document.hidden;

    // Alpha transparency
    const alpha = isHidden ? 0.5 : 1;
    this.template.alpha = alpha;
    const highlightLayer = canvas.interface.grid.getHighlightLayer(this.highlightId);
    highlightLayer.visible = this.visible;
    // FIXME the elevation is not considered in sort order of the highlight layers
    highlightLayer.zIndex = this.document.sort;
    highlightLayer.alpha = alpha;
    this.alpha = this._getTargetAlpha();
  }

  _refreshRulerText() { }

  _refreshElevation() { }

  /* -------------------------------------------- */

  /**
   * Activate listeners for the template preview
   * @param {CanvasLayer} initialLayer  The initially active CanvasLayer to re-activate after the workflow is complete
   * @returns {Promise}                 A promise that resolves with the final measured template if created.
   */
  activatePreviewListeners(initialLayer) {
    return new Promise((resolve, reject) => {
      this.#initialLayer = initialLayer;
      this.#events = {
        cancel: this._onCancelPlacement.bind(this),
        confirm: this._onConfirmPlacement.bind(this),
        move: this._onMovePlacement.bind(this),
        resolve,
        reject,
      };

      // Activate listeners
      canvas.stage.on("mousemove", this.#events.move);
      canvas.stage.on("mousedown", this.#events.confirm);
      canvas.app.view.oncontextmenu = this.#events.cancel;
    });
  }

  /* -------------------------------------------- */

  /**
   * Shared code for when template placement ends by being confirmed or canceled.
   * @param {Event} event  Triggering event that ended the placement.
   */
  async _finishPlacement(event) {
    this.layer._onDragLeftCancel(event);
    canvas.stage.off("mousemove", this.#events.move);
    canvas.stage.off("mousedown", this.#events.confirm);
    canvas.app.view.oncontextmenu = null;
    canvas.app.view.onwheel = null;
    this.#initialLayer.activate();
    // await this.actorSheet?.maximize();
  }

  /* -------------------------------------------- */

  /**
   * Move the template preview when the mouse moves.
   * @param {Event} event  Triggering mouse event.
   */
  _onMovePlacement(event) {
    event.stopPropagation();
    const now = Date.now(); // Apply a 20ms throttle
    if ( now - this.#moveTime <= 20 ) return;
    const center = event.data.getLocalPosition(this.layer);
    const snapped = snapToGrid(center, canvas.grid);
    this.document.updateSource({x: snapped.x, y: snapped.y});
    this.refresh();
    this.#moveTime = now;
  }

  /* -------------------------------------------- */

  /**
   * Confirm placement when the left mouse button is clicked.
   * @param {Event} event  Triggering mouse event.
   */
  async _onConfirmPlacement(event) {
    await this._finishPlacement(event);
    const destination = snapToGrid(this.document, canvas.grid);
    this.document.updateSource(destination);
    this.#events.resolve(this.document.toObject());
  }

  /* -------------------------------------------- */

  /**
   * Cancel placement when the right mouse button is clicked.
   * @param {Event} event  Triggering mouse event.
   */
  async _onCancelPlacement(event) {
    await this._finishPlacement(event);
    this.#events.reject();
  }
}

/**
 * @returns {Promise}  A promise that resolves with the final location selected.
 */
export async function UserPaintArea() {
  const cls = CONFIG.MeasuredTemplate.documentClass;
  const template = new cls({
    t: "rect",
    user: game.user.id,
    distance: Math.hypot(1, 1),
    width: 1,
    direction: 45,
    x: 0,
    y: 0,
    fillColor: game.user.color
  }, {parent: canvas.scene});
  const location = await (new PainterTemplate(template)).drawPreview();
  if (!location) return null;

  const { x, y } = location;
  return { x, y };
}

async function UserChooseDirections({ prompt, directions } = { prompt: "Select a direction", directions: ["all"] }) {
  const isAll = directions.includes("all") || directions.length >= 8;
  if (isAll) {
    directions = ["upleft", "up", "upright", "left", "right", "downleft", "down", "downright"];
  }
  const selectedDirections = await new Promise(async (resolve)=>{
    foundry.applications.api.DialogV2.wait({
      window: { title: 'Select Directions' },
      content: `
          <p>${prompt}</p>
          <div class="directional-chooser">
            <label class="upleft"><input type="checkbox" name="upleft" ${directions.includes("upleft") ? "checked" : ""}><span><i class="fa-solid fa-arrow-up-left"></i></span></label>
            <label class="up"><input type="checkbox" name="up" ${directions.includes("up") ? "checked" : ""}><span><i class="fa-solid fa-arrow-up"></i></span></label>
            <label class="upright"><input type="checkbox" name="upright" ${directions.includes("upright") ? "checked" : ""}><span><i class="fa-solid fa-arrow-up-right"></i></span></label>
            <label class="left"><input type="checkbox" name="left" ${directions.includes("left") ? "checked" : ""}><span><i class="fa-solid fa-arrow-left"></i></span></label>
            <span class="center"></span>
            <label class="right"><input type="checkbox" name="right" ${directions.includes("right") ? "checked" : ""}><span><i class="fa-solid fa-arrow-right"></i></span></label>
            <label class="downleft"><input type="checkbox" name="downleft" ${directions.includes("downleft") ? "checked" : ""}><span><i class="fa-solid fa-arrow-down-left"></i></span></label>
            <label class="down"><input type="checkbox" name="down" ${directions.includes("down") ? "checked" : ""}><span><i class="fa-solid fa-arrow-down"></i></span></label>
            <label class="downright"><input type="checkbox" name="downright" ${directions.includes("downright") ? "checked" : ""}><span><i class="fa-solid fa-arrow-down-right"></i></span></label>
          </div>
      `,
      buttons: [{
        action: "ok",
        label: "OK",
        default: true,
        callback: (event, button, dialog) => {
          const checked = $(dialog.element).find('.directional-chooser input[type="checkbox"]:checked').toArray().map(el=>el.name).filter(n=>n!=="all");
          resolve(checked ?? null);
        },
      }],
      close: () => resolve(null),
    }).catch(()=>{
      resolve(null);
    });
  });

  return selectedDirections;
}

async function ShowPopup(username, message) {
  return foundry.applications.api.DialogV2.prompt({
    window: { title: `Message From: ${username}` },
    content: message,
  });
}

async function ShowGMPopup(message) {
  if (game.user.isGM) {
    return ShowPopup("Yourself", message);
  }
  return socket.current().executeAsGM("showPopup", game.user.name, message);
}

export async function RefreshTokenIndicators() {
  return socket.current().executeForEveryone("refreshTokenIndicators");
}

export async function AssignActorToActor(actorToAssign, targetActor) {
  // do nothing. This is a placeholder for other modules to override
}



export function register() {
  const MODULE = game.modules.get(MODULENAME);
  MODULE.api ??= {};
  MODULE.api.scripts = {
    ...(MODULE.api.scripts ?? {}),
    Interact,
    TokenHasDirection,
    UserPaintArea,
    UserChooseDirections,
    TriggerTileBreak,
    PickUpItem,
    ShowGMPopup,
    RefreshTokenIndicators,
    AssignActorToActor,
  };
  MODULE.api.scripts.AwardItems ??= (actor, item)=>actor.createEmbeddedDocuments("Item", item instanceof Array ? item : [item]);

  socket.registerSocket("deleteTile", DeleteTile);
  socket.registerSocket("triggerTileBreak", async (tileId)=>TriggerTileBreak(await fromUuid(tileId)));

  socket.registerSocket("showPopup", async (username, message)=>ShowPopup(await fromUuid(tileId)));
  socket.registerSocket("pickUpItem", TriggerPickUpItem);
}