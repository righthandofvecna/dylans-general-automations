import { MODULENAME, early_isGM } from "../utils.mjs";



export function register() {
  game.settings.register(MODULENAME, "autoRunMacros", {
    name: "Auto-Run Macros",
    default: new Set(),
    type: new foundry.data.fields.SetField(new foundry.data.fields.StringField()),
    scope: "world",
    config: early_isGM(),
    hint: "Which macros should be automatically run when the world is loaded. This will run the macro for each User who loads. Use the macro UUID.",
    requiresReload: true,
  });
  
  Hooks.on("ready", async ()=>{
    // Auto-run macros
    const macrosToRun = game.settings.get(MODULENAME, "autoRunMacros");
    macrosToRun.forEach(async (uuid)=>{
      const macro = await fromUuid(uuid);
      if(macro?.type === "script") {
        try {
          const fn = new foundry.utils.AsyncFunction(`{${macro.command}\n}`);
          await fn.call(this);
        } catch(e) {
          console.error(`Error auto-running macro ${macro.name} (${macro.uuid}):`, e);
        }
      } else if (macro) {
        try {
          macro.execute({ speaker: ChatMessage.getSpeaker() });
        } catch(e) {
          console.error(`Error auto-running macro ${macro.name} (${macro.uuid}):`, e);
        }
      } else {
        console.warn(`Could not find macro with UUID ${uuid} to auto-run.`);
      }
    });
  });
}