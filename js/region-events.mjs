
import { MODULENAME, sleep, isFacing, getGridDirectionFromAngle } from "./utils.mjs";
import { Interact } from "./scripts.mjs";
import * as socket from "./socket.mjs";


function RegionBehaviorConfig_getFields(wrapped) {
  const fieldsets = wrapped();
  const eventFieldSet = fieldsets.find(fs=>fs.legend === "BEHAVIOR.TYPES.base.SECTIONS.events");
  if (eventFieldSet) {
    const eventField = eventFieldSet.fields[0];
    const doc = this.document;
    const hasTokenInteract = doc.getFlag(MODULENAME, "hasTokenInteract");
    if (hasTokenInteract) {
      eventField.value = [...eventField.value, "tokenInteract"];
    }
    eventField.field = foundry.utils.deepClone(eventField.field);
    eventField.field.element.choices.tokenInteract = "Token Interact";
  }
  return fieldsets;
}

function RegionBehaviorConfig_prepareSubmitData(wrapped, event, form, formData) {
  const submitData = wrapped(event, form, formData);
  submitData.flags ??= {};
  submitData.flags[MODULENAME] ??= {};
  if (submitData?.system?.events?.includes("tokenInteract")) {
    submitData.system.events.splice(submitData.system.events.indexOf("tokenInteract"));
    submitData.flags[MODULENAME].hasTokenInteract = true;
  } else {
    submitData.flags[MODULENAME].hasTokenInteract = false;
  }
  return submitData;
}

/**
   * Handle the Region event.
   * @param {RegionEvent} event    The Region event
   * @returns {Promise<void>}
   * @internal
   */
async function RegionBehavior_handleRegionEvent(wrapped, event) {
  await wrapped(event);
  const system = this.system;
  if ( !(system instanceof foundry.data.regionBehaviors.RegionBehaviorType) ) return;
  if (event.name !== "tokenInteract" || !this.getFlag(MODULENAME, "hasTokenInteract")) return;
  await system._handleRegionEvent(event);
}


export function register() {
  libWrapper.register(MODULENAME, "foundry.applications.sheets.RegionBehaviorConfig.prototype._getFields", RegionBehaviorConfig_getFields, "WRAPPER");
  libWrapper.register(MODULENAME, "foundry.applications.sheets.RegionBehaviorConfig.prototype._prepareSubmitData", RegionBehaviorConfig_prepareSubmitData, "WRAPPER");
  libWrapper.register(MODULENAME, "CONFIG.RegionBehavior.documentClass.prototype._handleRegionEvent", RegionBehavior_handleRegionEvent, "WRAPPER");
}