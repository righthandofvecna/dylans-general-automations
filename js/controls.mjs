import { MODULENAME, early_isGM, sleep, snapToGrid, listenFilepickerChange, getCombatsForScene, titleCase } from "./utils.mjs";
import { UserPaintArea } from "./scripts.mjs";
import { FooterDialogPrompt, FooterDialogConfirm } from "./dialog.mjs";



function OnGetSceneControlButtons(controls) {
  const tiles = controls["tiles"];//.find(c=>c.name === "tiles");
  const regions = controls["regions"];//.find(c=>c.name === "regions");
  const MODULE = game.modules.get(MODULENAME);

  //
  // Tile tools
  //
  for (const [key, tool] of Object.entries(MODULE.api.tileTools)) {
    const toolData = {
      icon: tool.icon,
      name: tool.name,
      title: tool.title,
      toolclip: {
        heading: tool.title,
        items: [
          {
            heading: "Place",
            reference: "CONTROLS.DoubleClick",
          }
        ]
      }
    }
    if (!tool.requiresConfig) {
      toolData.toolclip.items.push({
        heading: "Paint",
        paragraph: "Click and drag to place multiple.",
      });
    }
    tiles.tools[key] = toolData;
  }
}


function _placeTileFragileObject(x, y) {
  canvas.scene.createEmbeddedDocuments("Tile", [{
    [`flags.${MODULENAME}.solid`]: true,
    [`flags.${MODULENAME}.fragile`]: true,
    width: canvas.grid.sizeX,
    height: canvas.grid.sizeY,
    texture: {
      src: `modules/${MODULENAME}/img/fragile_object.png`,
    },
    x,
    y,
  }]);
}


function _placeTileMovableBoulder(x, y) {
  canvas.scene.createEmbeddedDocuments("Tile", [{
    [`flags.${MODULENAME}.solid`]: true,
    [`flags.${MODULENAME}.pushable`]: true,
    width: canvas.grid.sizeX,
    height: canvas.grid.sizeY,
    texture: {
      src: `modules/${MODULENAME}/img/movable_boulder.png`,
    },
    x,
    y,
  }]);
}

function _placeTileSign(x, y) {
  (new Promise(async (resolve)=>{
    foundry.applications.api.DialogV2.wait({
      window: { title: 'Text to Display' },
      content: `
          <div class="form-group">
            <label for="text">Text to Display</label>
            <input name="text" type="text" />
          </div>
      `,
      buttons: [{
        action: "ok",
        label: "OK",
        default: true,
        callback: (event, button, dialog) => resolve(button.form.elements.text?.value ?? null),
      }],
      close: () => resolve(null),
    }).catch(()=>{
      resolve(null);
    });
  })).then((text)=>{
    if (!text) return;
    const DefaultInteractionSound = game.modules.get(MODULENAME).defaults?.interactionSound;
    const DefaultSignImg = game.modules.get(MODULENAME).defaults?.signImg;
    canvas.scene.createEmbeddedDocuments("Tile", [{
      [`flags.${MODULENAME}.solid`]: true,
      [`flags.${MODULENAME}.interactionSound`]: DefaultInteractionSound,
      [`flags.${MODULENAME}.script`]: `game.modules.get("${MODULENAME}")?.api?.scripts?.FooterDialogPrompt({ content: ${JSON.stringify(text)}});`,
      width: canvas.grid.sizeX,
      height: canvas.grid.sizeY,
      texture: {
        src: DefaultSignImg,
      },
      x,
      y,
    }])
  });
}

function _placeTileItem(x, y) {
  const persistedToolSettings = game.settings.get(MODULENAME, "persistedToolSettings")?.placeTileItem ?? {};
  const DefaultItemImg = game.modules.get(MODULENAME).defaults?.itemImg;
  (new Promise(async (resolve, reject)=>{
    class ItemDialog extends foundry.applications.api.DialogV2 {
      _onRender(context, options) {
        super._onRender(context, options);
        const html = $(this.element);
        
        html.find(`select[name="interactionSound"]`).on("change", function() {
          const custom = $(this).find("option.custom-interaction").get(0).value;
          const customInput = html.find(`.custom-interaction[type=text], .custom-interaction [type=text]`).get(0);
          if (this.value === custom) {
            html.find(`.custom-sound`).show();
            if (this.value == "custom") {
              customInput.value = "";
            } else {
              customInput.value = this.value;
            }
          } else {
            html.find(`.custom-sound`).hide();
            customInput.value = "";
          }
        });
      
        listenFilepickerChange(html.find(`.custom-interaction`), function(value) {
          const custom = html.find("option.custom-interaction").get(0);
          const select = html.find(`select[name="flags.${MODULENAME}.interactionSound"]`).get(0);
          if (!value) {
            select.value = "custom";
          } else {
            custom.value = value;
          }
        });
      }
    }

    const SOUNDS = game.modules.get(MODULENAME).api.SOUNDS ?? {};

    const content = document.createElement('div');
    content.innerHTML = `
          <div class="form-group">
            <label>Visible Distance</label>
            <div class="form-fields">
              <input type="number" name="visibleDistance" value="${persistedToolSettings.visibleDistance ?? ""}" min="0" step="1" />
            </div>
            <p class="hint">The number of grid spaces away the tile's texture can be seen from. Unset for infinite, 0 for always invisible.</p>
          </div>
          <div class="form-group">
            <label>Interact Sound</label>
            <div class="form-fields">
              <select name="interactionSound">
                <option value="">None</option>
                ${Object.entries(SOUNDS).map(([k, v], i)=>`<option value="${k}" ${i == 0 ? "default selected" : ""}>${v}</option>`).reduce((a, b)=> a + b)}
                <option class="custom-interaction" value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div class="form-group custom-sound" style='display:none'>
            <label>Custom Interaction Sound</label>
            <div class="form-fields">
              <file-picker class="custom-interaction" type="audio" value=""></file-picker>
            </div>
          </div>
          <div class="form-group-stacked">
            <label>Items / Actors to Award</label>
            <item-drop-zone></item-drop-zone>
          </div>
    `;

    ItemDialog.wait({
      window: { title: 'Items / Actor Contained' },
      content,
      buttons: [{
        action: "ok",
        label: "OK",
        default: true,
        callback: (event, button, dialog) => {
          const visibleDistance = button.form.elements.visibleDistance?.value ? parseInt(button.form.elements.visibleDistance.value) : null;
          const interactionSound = button.form.elements.interactionSound?.value ?? null;
          const items = dialog.element.querySelector('item-drop-zone').items;
          resolve({items, interactionSound, visibleDistance});
        },
      }],
      close: () => reject(null),
    }).catch(()=>{
      reject(null);
    });
  })).then(async ({items, interactionSound, visibleDistance})=>{
    if (!items) return;
    const itemFrequency = items.reduce((l,i)=>({...l, [i]: (l[i] ?? 0) + 1}), {});
    const itemObjects = await Promise.all(Object.keys(itemFrequency).map(uuid=>fromUuid(uuid)));
    const itemTexts = itemObjects.map((item, i)=>itemFrequency[item.uuid] > 1 ? `${itemFrequency[item.uuid]}&times; ${item.name}` : ("aeiou".includes(item.name.toLowerCase()[0]) ? `an ${item.name}` : `a ${item.name}`));
    // do a natural join of the item names (eg, "a, b, and c" or "a and b")
    if (itemTexts.length > 1) {
      itemTexts[itemTexts.length - 2] += " and " + itemTexts.pop();
    }
    const message = `You found ${itemTexts.join(", ")}!`;
    canvas.scene.createEmbeddedDocuments("Tile", [{
      [`flags.${MODULENAME}.solid`]: true,
      [`flags.${MODULENAME}.interactionSound`]: interactionSound ?? null,
      [`flags.${MODULENAME}.visibleDistance`]: visibleDistance ?? null,
      [`flags.${MODULENAME}.script`]: `const items = [${items.reduce((l,i)=>l+'"'+i+'",', "")}];\ngame.modules.get("${MODULENAME}")?.api?.scripts?.PickUpItem?.(self, actor, items, ${JSON.stringify(message)});`,
      width: canvas.grid.sizeX,
      height: canvas.grid.sizeY,
      texture: {
        src: DefaultItemImg,
        scaleX: 0.5,
        scaleY: 0.5,
      },
      x,
      y,
    }])
    // update the persistent tool settings
    game.settings.set(MODULENAME, "persistedToolSettings", {
      ...foundry.utils.deepClone(game.settings.get(MODULENAME, "persistedToolSettings")),
      placeTileItem: {
        visibleDistance,
      },
    });
  }).catch((err)=>{
    if (err) console.error(`[${MODULENAME}]: Failed to place Item tile`, err);
  });
}

function _placeTileReinforcementsPlatform(x, y) {
  (new Promise(async (resolve, reject)=>{
    const content = document.createElement('div');
    content.innerHTML = `
      <div class="form-group-stacked">
        <label for="text">Reinforcements to Spawn</label>
        <item-drop-zone allowed="Actor" allow-rolltables></item-drop-zone>
      </div>
      <div class="form-group">
        <label>Trigger</label>
        <div class="form-fields">
          <select name="trigger" data-dtype="String">
            <option value="script" default>Via Script</option>
            <option value="scene">Scene Creation</option>
            <option value="round">Round End</option>
          </select>
        </div>
      </div>
    `
    foundry.applications.api.DialogV2.wait({
      window: { title: 'Actors To Spawn' },
      content,
      buttons: [{
        action: "ok",
        label: "OK",
        default: true,
        callback: (event, button, dialog) => {
          const reinforcements = dialog.element.querySelector('item-drop-zone').items;
          const trigger = dialog.element.querySelector('select[name="trigger"]').value;
          if (reinforcements.length === 0) {
            ui.notifications.warn("No reinforcements were added. Please add at least one reinforcement to spawn.");
            reject("No reinforcements added");
          }
          resolve({ reinforcements, trigger });
        },
      }],
      close: () => resolve(null),
    }).catch(()=>{
      resolve(null);
    });
  })).then(async ({ reinforcements, trigger })=>{
    if (!reinforcements) return;
    const reinforcementObjs = (await Promise.all(reinforcements.map(async uuid => {
      const obj = await fromUuid(uuid);
      if (!obj) return [];
      if (obj.documentName === "RollTable") {
        const results = await Promise.all(obj.results.contents.map(rtr => fromUuid(rtr.documentUuid)));
        return results.filter(r => r?.documentName === "Actor");
      }
      return [obj];
    }))).flatMap(r=>r);

    const dispositions = new Set(reinforcementObjs.map(r => r?.prototypeToken?.disposition ?? 0));
    dispositions.delete(CONST.TOKEN_DISPOSITIONS.SECRET);
    const disposition = (()=>{
      if (dispositions.size !== 1) return "mixed";
      const disp = dispositions.values().next().value;
      if (disp === CONST.TOKEN_DISPOSITIONS.FRIENDLY) return "friendly";
      if (disp === CONST.TOKEN_DISPOSITIONS.NEUTRAL) return "neutral";
      if (disp === CONST.TOKEN_DISPOSITIONS.HOSTILE) return "hostile";
      return "mixed";
    })();
    return canvas.scene.createEmbeddedDocuments("Tile", [{
      [`flags.${MODULENAME}.reinforcements`]: {
        uuids: reinforcements,
        trigger,
        enabled: true,
      },
      name: `${titleCase(disposition)} Reinforcements Platform`,
      hidden: true,
      width: canvas.grid.sizeX,
      height: canvas.grid.sizeY,
      texture: {
        src: `modules/${MODULENAME}/img/reinforcements/rf-${disposition}-all.svg`,
      },
      x,
      y,
    }])
  }).catch((err)=>console.error(`[${MODULENAME}]: Failed to place Reinforcements Platform tile`, err));
}

//
// Generic Placement Logic
//

function _handleTilePlacement(toolName, x, y) {
  const MODULE = game.modules.get(MODULENAME);
  MODULE.api.tileTools?.[toolName]?.callback(x, y);
}

let _tilePaintDragState = null;

function TilesLayer_onClickLeft2(wrapper, event) {
  wrapper(event);
  const { x, y } = snapToGrid(canvas.mousePosition, canvas.grid, { isTile: true });
  _handleTilePlacement(game.activeTool, x, y);
}

function TilesLayer_onDragLeftStart(wrapper, event) {
  const MODULE = game.modules.get(MODULENAME);
  const requiresConfig = MODULE.api.tileTools?.[game.activeTool]?.requiresConfig ?? true;
  if (requiresConfig) return wrapper(event);
  const origin = event.interactionData?.origin ?? canvas.mousePosition;
  const snapped = snapToGrid(origin, canvas.grid, { isTile: true });
  if (!requiresConfig) {
    _tilePaintDragState = {
      tool: game.activeTool,
      lastCell: `${snapped.x},${snapped.y}`,
    };
    _handleTilePlacement(game.activeTool, snapped.x, snapped.y);
  } else {
    _tilePaintDragState = {
      tool: game.activeTool,
      isDialogTool: true,
      origin: snapped,
    };
  }
}

function TilesLayer_onDragLeftMove(wrapper, event) {
  if (!_tilePaintDragState || _tilePaintDragState.isDialogTool) return wrapper(event);
  const snapped = snapToGrid(canvas.mousePosition, canvas.grid, { isTile: true });
  const cellKey = `${snapped.x},${snapped.y}`;
  if (cellKey !== _tilePaintDragState.lastCell) {
    _tilePaintDragState.lastCell = cellKey;
    _handleTilePlacement(_tilePaintDragState.tool, snapped.x, snapped.y);
  }
}

function TilesLayer_onDragLeftDrop(wrapper, event) {
  const state = _tilePaintDragState;
  _tilePaintDragState = null;
  if (!state) return wrapper(event);
  if (state.isDialogTool) {
    _handleTilePlacement(state.tool, state.origin.x, state.origin.y);
  }
}

function TilesLayer_onDragLeftCancel(wrapper, event) {
  _tilePaintDragState = null;
  return wrapper(event);
}

/**
 * Convert client (viewport) coordinates to canvas world coordinates.
 */
function _clientToCanvasWorld(clientX, clientY) {
  const canvasEl = document.querySelector("canvas#board");
  const bounds = canvasEl.getBoundingClientRect();
  return canvas.stage.toLocal({ x: clientX - bounds.left, y: clientY - bounds.top });
}

/**
 * Attach a document-level listener so that pressing and dragging a custom tile
 * tool button directly onto the canvas places a tile at the drop position.
 * Uses the renderSceneControls hook to attach directly to each button element,
 * avoiding any event propagation or delegation issues.
 */
function _setupToolbarDragHandling() {
  Hooks.on("renderSceneControls", (app, element) => {
    const MODULE = game.modules.get(MODULENAME);
    for (const toolName of Object.keys(MODULE.api.tileTools ?? {})) {
      const btn = element.querySelector(`[data-tool="${toolName}"]`);
      if (!btn) continue;

      btn.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        let leftButton = false;

        const onLeave = () => { leftButton = true; };
        btn.addEventListener("pointerleave", onLeave, { once: true });

        document.addEventListener("pointerup", (ev) => {
          btn.removeEventListener("pointerleave", onLeave);
          if (!leftButton) return; // Normal click, not a drag — let Foundry handle it
          if (!canvas?.stage) return;

          const canvasEl = document.querySelector("canvas#board");
          const canvasBounds = canvasEl.getBoundingClientRect();
          if (ev.clientX < canvasBounds.left || ev.clientX > canvasBounds.right ||
              ev.clientY < canvasBounds.top  || ev.clientY > canvasBounds.bottom) return;

          canvas.tiles.activate({ tool: toolName });
          const worldPoint = _clientToCanvasWorld(ev.clientX, ev.clientY);
          const snapped = snapToGrid(worldPoint, canvas.grid, { isTile: true });
          _handleTilePlacement(toolName, snapped.x, snapped.y);
        }, { once: true, capture: true });
      });
    }
  });
}


export function register() {
  if (early_isGM()) {
    Hooks.on("getSceneControlButtons", OnGetSceneControlButtons);
    libWrapper.register(MODULENAME, "foundry.canvas.layers.TilesLayer.prototype._onClickLeft2", TilesLayer_onClickLeft2, "WRAPPER");
    libWrapper.register(MODULENAME, "foundry.canvas.layers.TilesLayer.prototype._onDragLeftStart", TilesLayer_onDragLeftStart, "MIXED");
    libWrapper.register(MODULENAME, "foundry.canvas.layers.TilesLayer.prototype._onDragLeftMove", TilesLayer_onDragLeftMove, "MIXED");
    libWrapper.register(MODULENAME, "foundry.canvas.layers.TilesLayer.prototype._onDragLeftDrop", TilesLayer_onDragLeftDrop, "MIXED");
    libWrapper.register(MODULENAME, "foundry.canvas.layers.TilesLayer.prototype._onDragLeftCancel", TilesLayer_onDragLeftCancel, "MIXED");
    // libWrapper.register(MODULENAME, "foundry.canvas.layers.RegionLayer.prototype._onClickLeft2", RegionLayer_onClickLeft2, "WRAPPER");
    _setupToolbarDragHandling();
  }
  
  const MODULE = game.modules.get(MODULENAME);
  MODULE.api ??= {};
  MODULE.api.tileTools = {
    ...(MODULE.api.tileTools ?? {}),
    "fragile-object": {
      icon: "fa-solid fa-wine-glass-crack",
      name: "fragile-object",
      title: "Place Fragile Object",
      requiresConfig: false,
      callback: _placeTileFragileObject,
    },
    "movable-boulder": {
      icon: "fa-solid fa-curling-stone",
      name: "movable-boulder",
      title: "Place Movable Boulder",
      requiresConfig: false,
      callback: _placeTileMovableBoulder,
    },
    "sign": {
      icon: "fa-solid fa-sign-post",
      name: "sign",
      title: "Place Sign",
      requiresConfig: true,
      callback: _placeTileSign,
    },
    "item": {
      icon: "fa-solid fa-box",
      name: "item",
      title: "Place Item",
      requiresConfig: true,
      callback: _placeTileItem,
    },
    "reinforcements-platform": {
      icon: "fa-solid fa-person-from-portal",
      name: "reinforcements-platform",
      title: "Place Reinforcements Platform",
      requiresConfig: true,
      callback: _placeTileReinforcementsPlatform,
    },
  };
  MODULE.api.regionScripts = {
    ...(MODULE.api.regionScripts ?? {}),
  }

  MODULE.defaults ??= {};
  MODULE.defaults.signImg = `modules/${MODULENAME}/img/sign.png`;
  MODULE.defaults.itemImg = `modules/${MODULENAME}/img/treasure_chest.png`;
}