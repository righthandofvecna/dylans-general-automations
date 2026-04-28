import { MODULENAME, early_isGM, sleep, snapToGrid, listenFilepickerChange, getCombatsForScene } from "./utils.mjs";
import { UserPaintArea } from "./scripts.mjs";
import { FooterDialogPrompt, FooterDialogConfirm } from "./dialog.mjs";


/**
 * Apply the diagonal forbidding setting
 * @param {*} wrapped 
 * @param  {...any} args 
 */
function Scene_prepareBaseData(wrapped, ...args) {
  wrapped(...args);
  const hasCombat = getCombatsForScene(this.uuid).length > 0;
  if (this.getFlag(MODULENAME, "diagonals") && !(this.getFlag(MODULENAME, "outOfCombat") && hasCombat)) {
    this.grid.diagonals = CONST.GRID_DIAGONALS.ILLEGAL;
  }
}


/**
 * Add the puzzle button to the RegionConfig page
 * @param {*} regionConfig 
 * @param {*} html 
 */
async function OnRenderRegionConfig(regionConfig, html) {
  const behaviorControls = html.querySelector(".region-element.region-behavior .region-element-controls");
  if (behaviorControls.querySelector(".region-control.puzzle-control")) return;
  const puzzleLink = document.createElement("a");
  puzzleLink.classList = "region-control puzzle-control";
  puzzleLink.setAttribute("data-tooltip", "Automatic Behaviors");
  puzzleLink.setAttribute("aria-label", "Automatic Behaviors");
  const puzzleIcon = document.createElement("i");
  puzzleIcon.classList = "fa-solid fa-puzzle-piece";
  puzzleLink.appendChild(puzzleIcon);

  behaviorControls.appendChild(puzzleLink);

  const regionScripts = game.modules.get(MODULENAME).api.regionScripts;
  puzzleLink.addEventListener("click", async function (event) {
    event.preventDefault();
    const options = Object.entries(regionScripts).reduce((o, [k, v])=>o+`<option value="${k}">${v.label}</option>`, "");
    const option = await new Promise(async (resolve)=>{
      foundry.applications.api.DialogV2.wait({
        window: { title: 'Create Automatic Behavior' },
        content: `
            <div class="form-group">
              <label for="behavior">Behavior</label>
              <select name="behavior">${options}</select>
            </div>
        `,
        buttons: [{
          action: "ok",
          label: "OK",
          default: true,
          callback: (event, button, dialog) => resolve(button.form.elements.behavior?.value ?? null),
        }],
        close: () => resolve(null),
      }).catch(()=>{
        resolve(null);
      });
    });

    if (!option || !(option in regionScripts)) return;

    await regionScripts[option].callback(regionConfig);
  });
}


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

        //
        // set up drag and drop area
        //
        const dropZone = html.find('#item-drop-zone')[0];
        const itemsList = html.find('#dropped-items-list');
        const items = [];

        // Set up drag and drop handlers
        dropZone.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropZone.style.backgroundColor = '#f0f0f0';
        });

        dropZone.addEventListener('dragleave', (e) => {
          e.preventDefault();
          dropZone.style.backgroundColor = 'transparent';
        });

        dropZone.addEventListener('drop', async (e) => {
          e.preventDefault();
          dropZone.style.backgroundColor = 'transparent';
          
          const data = TextEditor.getDragEventData(e);
          const item = await (async ()=>{
            let item = await fromUuid(data.uuid);
            if (!item) return null;
            if (item instanceof RollTable) {
              let result = await item.roll();
              if (result.results.length != 1) {
                return null;
              } else {
                let r = result.results[0];
                let uuid = "";
                if (r.type == "pack") {
                  uuid = `Compendium.${r.documentCollection}.Item.${r.documentId}`;
                } else {
                  return null;
                }
                item = await fromUuid(uuid);
              }
            }
            return item;
          })()
          if (!item) return;

          items.push(item.uuid);
          itemsList.data('items', items);

          // Update visual list
          const itemElement = document.createElement('div');
          itemElement.innerHTML = `
            <div class="item" style="display: flex; align-items: center; margin: 5px 0;">
              <img src="${item.img}" width="24" height="24" style="margin-right: 8px;">
              <span>${item.name}</span>
              <a class="remove-item" style="margin-left: auto;"><i class="fas fa-times"></i></a>
            </div>
          `;

          // Add remove handler
          itemElement.querySelector('.remove-item').addEventListener('click', () => {
            const index = items.indexOf(item);
            if (index > -1) {
              items.splice(index, 1);
              itemsList.data('items', items);
              itemElement.remove();
            }
          });

          itemsList.append(itemElement);
        });
      }
    }

    const SOUNDS = game.modules.get(MODULENAME).api.SOUNDS ?? {};
    
    ItemDialog.wait({
      window: { title: 'Items / Actor Contained' },
      content: `
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
          <div class="form-group">
            <div id="item-drop-zone" style="min-height: 100px; border: 2px dashed #ccc; padding: 10px; margin-bottom: 10px;">
              <p class="drop-text">Drag and drop items or actors here</p>
              <div id="dropped-items-list"></div>
            </div>
          </div>
      `,
      buttons: [{
        action: "ok",
        label: "OK",
        default: true,
        callback: (event, button, dialog) => {
          const visibleDistance = button.form.elements.visibleDistance?.value ? parseInt(button.form.elements.visibleDistance.value) : null;
          const interactionSound = button.form.elements.interactionSound?.value ?? null;
          const items = $(dialog.element).find('#dropped-items-list').data('items') || [];
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
  const { x, y } = snapToGrid(canvas.mousePosition, canvas.grid);
  _handleTilePlacement(game.activeTool, x, y);
}

function TilesLayer_onDragLeftStart(wrapper, event) {
  const MODULE = game.modules.get(MODULENAME);
  const requiresConfig = MODULE.api.tileTools?.[game.activeTool]?.requiresConfig ?? true;
  if (requiresConfig) return wrapper(event);
  const origin = event.interactionData?.origin ?? canvas.mousePosition;
  const snapped = snapToGrid(origin, canvas.grid);
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
  const snapped = snapToGrid(canvas.mousePosition, canvas.grid);
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
          const snapped = snapToGrid(worldPoint, canvas.grid);
          _handleTilePlacement(toolName, snapped.x, snapped.y);
        }, { once: true, capture: true });
      });
    }
  });
}


/* ------------------------------------------------------------------------- */
/*                          Generic Region Controls                          */
/* ------------------------------------------------------------------------- */



async function SceneConfig_preparePartContext(wrapped, partId, context, options) {
  context = await wrapped(partId, context, options);
  if (partId === "puzzle") {
    const scene = context.document;
    context.flags = scene.flags[MODULENAME]
    context.MODULENAME = MODULENAME;
  }
  return context;
}

export function register() {
  libWrapper.register(MODULENAME, "Scene.prototype.prepareBaseData", Scene_prepareBaseData, "WRAPPER");
  Hooks.on("renderRegionConfig", OnRenderRegionConfig);
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

  // scene config controls
  const SceneConfig = foundry.applications.sheets.SceneConfig;
  SceneConfig.PARTS.puzzle = {
    template: `modules/${MODULENAME}/templates/scene-settings-page.hbs`
  };
  const footer = SceneConfig.PARTS.footer;
  delete SceneConfig.PARTS.footer;
  SceneConfig.PARTS.footer = footer;

  SceneConfig.TABS.sheet.tabs.push({
    id: "puzzle",
    icon: "fa-solid fa-puzzle-piece",
  });
  libWrapper.register(MODULENAME, "foundry.applications.sheets.SceneConfig.prototype._preparePartContext", SceneConfig_preparePartContext, "WRAPPER");
  

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
    }
  };
  MODULE.api.regionScripts = {
    ...(MODULE.api.regionScripts ?? {}),
  }

  MODULE.defaults ??= {};
  MODULE.defaults.signImg = `modules/${MODULENAME}/img/sign.png`;
  MODULE.defaults.itemImg = `modules/${MODULENAME}/img/treasure_chest.png`;
}