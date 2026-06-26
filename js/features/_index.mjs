import { MODULENAME } from "../utils.mjs";
import * as autoRunMacros from "./auto-run-macros.mjs";
import * as messageSigning from "./message-signing.mjs";
import * as reinforcements from "./reinforcements.mjs";
import * as sessionLogging from "./session-logging.mjs";
import * as prosemirror from "./prosemirror.mjs";

export { postSessionLogging } from "./session-logging.mjs";


const FEATURES = [
  ["autoRunMacros", autoRunMacros],
  ["messageSigning", messageSigning],
  ["reinforcements", reinforcements],
  ["sessionLogging", sessionLogging],
  ["prosemirror", prosemirror],
];


export function register() {
  for (const [featureName, feature] of FEATURES) {
    try {
      feature.register?.();
    } catch (err) {
      console.error(`[${MODULENAME}] | Failed to register feature ${featureName}`, err);
    }
  }
}

export function registerAfterDependencies() {
  for (const [featureName, feature] of FEATURES) {
    try {
      feature.registerAfterDependencies?.();
    } catch (err) {
      console.error(`[${MODULENAME}] | Failed to register feature ${featureName}`, err);
    }
  }
}