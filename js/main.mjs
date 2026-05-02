
import { MODULENAME, DATNAME } from "./utils.mjs";
import * as settings from "./settings.mjs";
import * as audio from "./audio.mjs";
import * as components from "./components.mjs";
import * as controls from "./controls.mjs";
import * as dialog from "./dialog.mjs";
import * as placeables from "./placeables/_index.mjs";
import * as configs from "./configs/index.mjs";
import * as scripts from "./scripts.mjs";
import * as regionEvents from "./region-events.mjs";
import * as interact from "./interact.mjs";
import * as features from "./features/_index.mjs";
import * as socket from "./socket.mjs";

const SUBMODULES = [
  ["settings", settings],
  ["audio", audio],
  ["components", components],
  ["controls", controls],
  ["dialog", dialog],
  ["placeables", placeables],
  ["configs", configs],
  ["scripts", scripts],
  ["regionEvents", regionEvents],
  ["interact", interact],
  ["features", features],
  ["socket", socket],
];

function runForAll(fnId) {
  for (const [name, m] of SUBMODULES) {
    try {
      m[fnId]?.();
    } catch (e) {
      console.error(`[${MODULENAME}] | Error Initializing - ${name}.${fnId}():`, e);
    }
  }
}

Hooks.on("init", async ()=>{
  runForAll("register");

  const DAT = game.modules.get(DATNAME);
  if (!DAT || !DAT.active) {
    ui.notifications.error(`"Dylan's Animated Tokens" module is not active. Please activate it to use animated tokens.`, { permanent: true });
    return;
  }
  await (async ()=>{
    if (DAT?.initialized) {
      return Promise.resolve();
    } else {
      return new Promise(resolve => Hooks.once(`${DATNAME}.init`, resolve));
    }
  })();
  runForAll("registerAfterDependencies");
  
  const MODULE = game.modules.get(MODULENAME);
  Hooks.callAll(`${MODULENAME}.init`);
  MODULE.initialized = true;
});
