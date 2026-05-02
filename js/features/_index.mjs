import { MODULENAME } from "../utils.mjs";
import * as messageSigning from "./message-signing.mjs";
import * as reinforcements from "./reinforcements.mjs";


const FEATURES = [
  ["messageSigning", messageSigning],
  ["reinforcements", reinforcements],
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