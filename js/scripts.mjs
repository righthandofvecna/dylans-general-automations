
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
async function TriggerPickUpItem(tileUuid, actorUuid, itemUuids, userId) {
  const tile = await fromUuid(tileUuid);
  if (!tile) throw new Error("Tile not found — already picked up.");
  await tile.delete(); // Acts as mutex: if already deleted, throws and awards are skipped

  const actor = await fromUuid(actorUuid);
  const awards = await Promise.all(itemUuids.map(uuid => fromUuid(uuid)));
  const itemObjects = awards.filter(a => a?.documentName === "Item").map(a => foundry.utils.mergeObject(a.toObject(), { _stats: {compendiumSource: a.uuid}}));
  const actorObjects = awards.filter(a => a?.documentName === "Actor");

  const { AwardItems, AssignActorToActor } = game.modules.get(MODULENAME)?.api?.scripts ?? {};
  await Promise.all([
    ...(itemObjects.length ? [AwardItems(actor, itemObjects)] : []),
    ...actorObjects.map(actorObj => AssignActorToActor(actorObj, actor)),
  ]);

  if (userId && game.settings.get(MODULENAME, "fairPickup")) {
    const counts = { ...game.settings.get(MODULENAME, "pickupCounts") };
    counts[userId] = (counts[userId] ?? 0) + 1;
    await game.settings.set(MODULENAME, "pickupCounts", counts);
  }
}

async function PickUpItem(tile, actor, items, message) {
  if (game.settings.get(MODULENAME, "fairPickup") && !game.user.isGM) {
    const counts = game.settings.get(MODULENAME, "pickupCounts");
    const myCount = counts[game.user.id] ?? 0;
    const otherActivePlayers = game.users.filter(u => u.active && !u.isGM && u.id !== game.user.id);
    if (otherActivePlayers.length > 0) {
      const playersWithFewerPickups = otherActivePlayers.filter(u => (counts[u.id] ?? 0) < myCount);
      if (playersWithFewerPickups.length > 0) {
        let names = playersWithFewerPickups.map(u => u.name);
        if (names.length > 2) {
          names = names.slice(0, -2).join(", ") + ", and " + names.at(-1);
        } else if (names.length == 2) {
          names = names.join(" and ");
        } else {
          names = names[0];
        }
        FooterDialogPrompt({ content: `You found something, but another player hasn't had a chance to pick up yet — wait for ${names} to catch up first!` });
        return;
      }
    }
  }

  FooterDialogPrompt({ content: message, callback: async ()=>{
    try {
      if (game.user.isGM) {
        await TriggerPickUpItem(tile.uuid, actor.uuid, items, game.user.id);
      } else {
        await socket.current().executeAsGM("pickUpItem", tile.uuid, actor.uuid, items, game.user.id);
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

function _cellAt(point) {
  const { sizeX, sizeY } = canvas.grid;
  return {
    x: Math.floor(point.x / sizeX) * sizeX,
    y: Math.floor(point.y / sizeY) * sizeY,
  };
}

export function UserPaintArea() {
  return new Promise((resolve, reject) => {
    if (!canvas?.ready) return reject(new Error("Canvas not ready"));
    const view = canvas.app.view;
    const { sizeX, sizeY } = canvas.grid;
    const color = Number(game.user.color ?? 0xffffff);

    const marker = new PIXI.Graphics();
    (canvas.controls ?? canvas.interface).addChild(marker);
    const draw = ({ x, y }) => {
      marker.clear()
        .lineStyle(3, color, 0.9)
        .beginFill(color, 0.25)
        .drawRect(x, y, sizeX, sizeY)
        .endFill();
    };
    const fromEvent = (e) => _cellAt(canvas.canvasCoordinatesFromClient({ x: e.clientX, y: e.clientY }));
    draw(_cellAt(canvas.mousePosition ?? { x: 0, y: 0 }));

    let swallowUp = false;
    const block = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };

    const onMove = (e) => { if (e.target === view) draw(fromEvent(e)); };
    const onDown = (e) => {
      if (e.target !== view) return; // UI clicks pass through
      block(e);
      swallowUp = true;
      if (e.button === 0) finish(true, fromEvent(e));
      else if (e.button === 2) finish(false);
    };
    const onUp = (e) => { if (swallowUp) { swallowUp = false; block(e); } };
    // Compat mouse events and the context menu must not reach the canvas either.
    const onCanvasOnly = (e) => { if (e.target === view) block(e); };
    const onKey = (e) => { if (e.key === "Escape") { block(e); finish(false); } };
    const onTearDown = () => finish(false);

    const listeners = [
      ["pointermove", onMove], ["pointerdown", onDown], ["pointerup", onUp],
      ["mousedown", onCanvasOnly], ["mouseup", onCanvasOnly], ["contextmenu", onCanvasOnly],
      ["keydown", onKey],
    ];

    let done = false;
    function finish(ok, cell) {
      if (done) return;
      done = true;
      for (const [type, fn] of listeners) window.removeEventListener(type, fn, { capture: true });
      Hooks.off("canvasTearDown", onTearDown);
      marker.destroy();
      if (ok) resolve(cell);
      else reject();
    }

    for (const [type, fn] of listeners) window.addEventListener(type, fn, { capture: true });
    Hooks.once("canvasTearDown", onTearDown);
  });
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
  MODULE.api.scripts.GetQuantity ??= (item)=>parseInt(item?.system?.quantity) || 1;

  socket.registerSocket("deleteTile", DeleteTile);
  socket.registerSocket("triggerTileBreak", async (tileId)=>TriggerTileBreak(await fromUuid(tileId)));

  socket.registerSocket("showPopup", ShowPopup);
  socket.registerSocket("pickUpItem", TriggerPickUpItem);
}