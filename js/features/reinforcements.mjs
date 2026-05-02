
import { MODULENAME, snapToGrid } from "../utils.mjs";


async function _getSpawn(tile) {
  const uuids = foundry.utils.deepClone(tile.getFlag(MODULENAME, "reinforcements")?.uuids ?? []);
  // randomly pick one
  while (uuids.length > 0) {
    let uuid = uuids[Math.floor(Math.random() * uuids.length)];
    let obj = await fromUuid(uuid);
    // if the object doesn't exist, try again
    if (!obj) {
      uuids.remove(uuid);
      continue;
    }
    if (obj.documentName === "RollTable") {
      const result = await obj.roll();
      if (result.results.length !== 1) continue;
      const r = result.results[0];
      uuid = r.documentUuid;
      obj = await fromUuid(uuid);
      if (!obj) {
        uuids.remove(uuid); // remove the whole table
        continue;
      }
    }
    return obj;
  }
  return null;
}

export async function SpawnReinforcement(tile, { deleteOnSuccess=false, }={}) {
  const spawn = await _getSpawn(tile);
  if (!spawn) return;
  const { x, y } = snapToGrid(tile, tile.parent.grid);
  try {
    await tile.parent.createEmbeddedDocuments("Token", [await spawn.getTokenDocument({
      x,
      y,
    })]);
    if (deleteOnSuccess) {
      await tile.delete();
    }
  } catch (err) {
    console.error(`[${MODULENAME}]: Failed to spawn reinforcement`, err);
  }
}


async function OnCreateScene(scene) {
  const tiles = scene.tiles.filter(t=>{
    const rff = t.getFlag(MODULENAME, "reinforcements");
    return rff?.uuids?.length > 0 && rff.enabled && rff.trigger === "scene";
  });
  for (const tile of tiles) {
    await SpawnReinforcement(tile, { deleteOnSuccess: true, });
  }
}


export function register() {
  Hooks.on("createScene", OnCreateScene);

  const MODULE = game.modules.get(MODULENAME);

  MODULE.api ??= {};
  MODULE.api.scripts ??= {};
  MODULE.api.scripts.SpawnReinforcement = SpawnReinforcement;
}