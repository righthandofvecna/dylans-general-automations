import { MODULENAME, getCombatsForScene } from "../utils.mjs";


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
}