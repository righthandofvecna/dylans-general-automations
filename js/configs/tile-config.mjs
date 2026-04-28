import { MODULENAME, listenFilepickerChange } from "../utils.mjs";

const { StringField } = foundry.data.fields;

async function TileConfig_preparePartContext(wrapped, partId, context, options) {
  context = await wrapped(partId, context, options);
  if (partId === "puzzle") {
    const tile = context.document;
    const MODULE = game.modules.get(MODULENAME);
    const dga = foundry.utils.deepClone(tile?.flags?.[MODULENAME] ?? {});
    dga.visibleDistance ??= "";
    dga.BooleanTileSettings = foundry.utils.deepClone(MODULE.api.BooleanTileSettings);
    for (const [name, config] of Object.entries(MODULE.api.BooleanTileSettings)) {
      dga.BooleanTileSettings[name].value = foundry.utils.getProperty(tile ?? {}, config.key);
    }
    const SOUNDS = MODULE.api.SOUNDS ?? {};
    dga.isCustomSound = dga.interactionSound && !Object.keys(SOUNDS).some(v=>v === dga.interactionSound);
    dga.sounds = SOUNDS;
    dga.scriptField = new StringField({}, { parent: { fieldPath: `flags.${MODULENAME}.script` } });
    // permissions
    dga.permissions = {
      MACRO_SCRIPT: game.user.hasPermission("MACRO_SCRIPT"),
    }
    context.dga = dga;
    context.MODULENAME = MODULENAME;
    console.log("Prepared tile config context", MODULE.api.BooleanTileSettings, dga);
  }
  return context;
}


function TileConfig_attachPartListeners(wrapped, partId, htmlElement, options) {
  wrapped(partId, htmlElement, options);

  if (partId === "puzzle") {
    $(htmlElement).find(`select[name="flags.${MODULENAME}.interactionSound"]`).on("change", function() {
      const custom = $(htmlElement).find("option.custom-interaction").get(0).value;
      const customInput = $(htmlElement).find(`.custom-interaction[type=text], .custom-interaction [type=text]`).get(0);
      if (this.value === custom) {
        $(htmlElement).find(`.custom-sound`).show();
        if (this.value == "custom") {
          customInput.value = "";
        } else {
          customInput.value = this.value;
        }
      } else {
        $(htmlElement).find(`.custom-sound`).hide();
        customInput.value = "";
      }
    });

    listenFilepickerChange($(htmlElement).find(`.custom-interaction`), function(value) {
      const custom = $(htmlElement).find("option.custom-interaction").get(0);
      const select = $(htmlElement).find(`select[name="flags.${MODULENAME}.interactionSound"]`).get(0);
      if (!value) {
        select.value = "custom";
      } else {
        custom.value = value;
      }
    });
  }
}



export function register() {
  const TileConfig = foundry.applications.sheets.TileConfig;
  TileConfig.PARTS.puzzle = {
    template: `modules/${MODULENAME}/templates/tile-settings.hbs`
  }
  const footer = TileConfig.PARTS.footer;
  delete TileConfig.PARTS.footer;
  TileConfig.PARTS.footer = footer;

  TileConfig.TABS.sheet.tabs.push({
    id: "puzzle",
    icon: "fa-solid fa-puzzle-piece",
  });
  libWrapper.register(MODULENAME, "foundry.applications.sheets.TileConfig.prototype._preparePartContext", TileConfig_preparePartContext, "WRAPPER");
  libWrapper.register(MODULENAME, "foundry.applications.sheets.TileConfig.prototype._attachPartListeners", TileConfig_attachPartListeners, "WRAPPER");

  const MODULE = game.modules.get(MODULENAME);
  MODULE.api ??= {};
  MODULE.api.BooleanTileSettings = {
    solid: {
      label: "Acts as a Wall",
      hint: "Whether this tile blocks movement like an invisible wall.",
      key: `flags.${MODULENAME}.solid`,
    },
    pushable: {
      label: "Pushable",
      hint: "Whether this tile can be pushed by a token.",
      key: `flags.${MODULENAME}.pushable`,
    }
  }
}