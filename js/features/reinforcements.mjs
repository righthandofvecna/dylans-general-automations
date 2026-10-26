
import { MODULENAME, snapToGrid } from "../utils.mjs";

const ROUND_FLAG = "reinforcementRound";
const WAIT_OCCUPIED_FLAG = "waitWhileOccupied";

/** Round number from which this platform starts firing (default: 1). */
const startRound = (tile) => Math.max(1, Number(tile.getFlag(MODULENAME, ROUND_FLAG)) || 1);
/** Whether the platform should skip spawning when its cell is already occupied (default: true). */
const waitWhileOccupied = (tile) => tile.getFlag(MODULENAME, WAIT_OCCUPIED_FLAG) !== false;

function cellOccupied(scene, x, y) {
  const { sizeX, sizeY } = scene.grid;
  return scene.tokens.some((t) =>
    x < t.x + (t.width  ?? 1) * sizeX && t.x < x + sizeX &&
    y < t.y + (t.height ?? 1) * sizeY && t.y < y + sizeY
  );
}

/** Import a compendium actor into the world once and reuse it thereafter. */
async function toWorldActor(actor) {
  if (!actor.pack) return actor;
  const existing = game.actors.find(
    (a) => (a._stats?.compendiumSource ?? a.flags?.core?.sourceId) === actor.uuid
  );
  if (existing) return existing;
  return game.actors.importFromCompendium(game.packs.get(actor.pack), actor.id);
}


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

export async function SpawnReinforcement(tile, { deleteOnSuccess=false, combat=null }={}) {
  const spawn = await _getSpawn(tile);
  if (!spawn) return;
  const actor = await toWorldActor(spawn);
  if (!actor) return;
  const { x, y } = snapToGrid(tile, tile.parent.grid);
  try {
    const tokenData = (await actor.getTokenDocument({ x, y })).toObject();
    const [token] = await tile.parent.createEmbeddedDocuments("Token", [tokenData]);
    if (deleteOnSuccess) {
      await tile.delete();
    }
    if (token && combat) {
      await combat.createEmbeddedDocuments("Combatant", [{
        tokenId: token.id,
        sceneId: tile.parent.id,
        actorId: token.actorId,
        hidden: token.hidden,
      }]);
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

  // Round End trigger: fire once per round for each enabled platform.
  Hooks.on("updateCombat", async (combat, changed, _options) => {
    if (!("round" in changed)) return;
    if (!game.user || game.user !== game.users.activeGM) return;

    // Forward-only: advancing rounds fires, going back does not.
    const prev = combat.previous?.round ?? 0;
    const forward = _options?.direction !== undefined ? _options.direction > 0 : prev < changed.round;
    if (!forward) return;
    const ended = changed.round - 1;
    if (ended < 1) return; // round 0 -> 1 is combat starting, not a round ending

    const scene = combat.scene
      ?? combat.combatants.contents.find((c) => c.token)?.token?.parent;
    if (!scene) return;

    const platforms = scene.tiles.filter((t) => {
      const f = t.getFlag(MODULENAME, "reinforcements");
      return f?.enabled && f.trigger === "round" && f.uuids?.length && ended >= startRound(t);
    });
    for (const tile of platforms) {
      try {
        const { x, y } = snapToGrid(tile, scene.grid);
        if (waitWhileOccupied(tile) && cellOccupied(scene, x, y)) continue;
        await SpawnReinforcement(tile, { combat });
      } catch (err) {
        console.error(`[${MODULENAME}]: Round End reinforcement failed for tile ${tile.uuid}`, err);
      }
    }
  });

  const MODULE = game.modules.get(MODULENAME);

  MODULE.api ??= {};
  MODULE.api.scripts ??= {};
  MODULE.api.scripts.SpawnReinforcement = SpawnReinforcement;
}