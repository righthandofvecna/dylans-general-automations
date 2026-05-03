import { MODULENAME, listenFilepickerChange } from "../utils.mjs";
const { StringField } = foundry.data.fields;

/**
 * Prepare the puzzle context for the token
 * @param {*} wrapped 
 * @param {*} partId 
 * @param {*} context 
 * @param {*} options 
 * @returns 
 */
async function TokenConfig_preparePartContext(wrapped, partId, context, options) {
  context = await wrapped(partId, context, options);
  if (partId === "puzzle") {
    const token = context.document;
    const dga = token?.flags?.[MODULENAME] ?? {};
    dga.scriptField = new StringField({}, { parent: { fieldPath: `flags.${MODULENAME}.script` } });
    // permissions
    dga.permissions = {
      MACRO_SCRIPT: game.user.hasPermission("MACRO_SCRIPT"),
    }
    context.dga = dga;
  }
  return context;
}


function TokenConfig_attachPartListeners(wrapped, partId, htmlElement, options) {
  wrapped(partId, htmlElement, options);

  if (partId === "puzzle") {
    // Sounds
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

    // Dialogue/Script Switching
    $(htmlElement).find(`[name="flags.${MODULENAME}.dialogue"]`).on("change", function() {
      const dialogue = $(this).val();
      if (dialogue) {
        $(htmlElement).find(`[name="flags.${MODULENAME}.script"]`).closest(`fieldset`).hide();
      } else {
        $(htmlElement).find(`[name="flags.${MODULENAME}.script"]`).closest(`fieldset`).show();
      }
    });
  }
}




/**
 * @inheritDoc
 * 
 * Handles auto-signing the script content
 */
async function TokenConfig_processSubmitData(wrapped, event, form, submitData) {
  const oldScript = this.document?.flags?.[MODULENAME]?.script;
  const newScript = submitData?.flags?.[MODULENAME]?.script;
  if (newScript !== oldScript) {
    // sign it!
    const { signMessage } = game.modules.get(MODULENAME).api.crypto;
    const signature = JSON.stringify(await signMessage(newScript));
    submitData.flags[MODULENAME].signature = signature || "";
  }
  return wrapped(event, form, submitData);
}


export function register() {
  const TokenConfig = foundry.applications.sheets.TokenConfig;
  TokenConfig.PARTS.puzzle = {
    template: `modules/${MODULENAME}/templates/token-interaction-settings.hbs`
  }
  const footer = TokenConfig.PARTS.footer;
  delete TokenConfig.PARTS.footer;
  TokenConfig.PARTS.footer = footer;
  TokenConfig.TABS.sheet.tabs.push({
    id: "puzzle",
    icon: "fa-solid fa-puzzle-piece",
  });
  libWrapper.register(MODULENAME, "foundry.applications.sheets.TokenConfig.prototype._preparePartContext", TokenConfig_preparePartContext, "WRAPPER");
  libWrapper.register(MODULENAME, "foundry.applications.sheets.TokenConfig.prototype._attachPartListeners", TokenConfig_attachPartListeners, "WRAPPER");
  libWrapper.register(MODULENAME, "foundry.applications.sheets.TokenConfig.prototype._processSubmitData", TokenConfig_processSubmitData, "WRAPPER");
}
