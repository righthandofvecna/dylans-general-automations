
import { MODULENAME, early_isGM } from "./utils.mjs";

async function playlistOnce() {
  return game.scenes.active.playlist.stopAll();
}

async function doPreloadScenePlaylist(scene) {
  if (!game.settings.get(MODULENAME, "autoPlayAudio")) return;
  // stop the music from the current scene
  const oldScene = game.scenes.active;
  if (oldScene !== scene) {
    oldScene.playlist?.stopAll();
  };

  const playlist = scene.playlist;
  if (!playlist) {
    return;
  }

  // wait for the audio system to be ready to load audio
  if (game.audio.locked) await game.audio.unlock;

  // remove playlistOnce listeners
  // and preload all members of the playlist
  const loaded = [];
  for (const sound of playlist?.sounds?.contents ?? []) {
    // kick off an async preload
    loaded.push(sound.load().then(()=>{
      sound.sound.removeEventListener("end", playlistOnce);
    }));
  };
  await Promise.all(loaded);

  // if the last sound is set not to repeat, then add the playlistOnce listener
  const sound = playlist.sounds.get(playlist.playbackOrder[playlist.playbackOrder.length - 1]);
  const playlistHasEnd = sound && !sound.repeat;
  scene.setFlag(MODULENAME, "playlistHasEnd", playlistHasEnd);
  if (playlistHasEnd) {
    if (!sound.sound) {
      console.error(`Preloaded all scene playlist sounds, but sound "${sound.id}" is not preloaded`);
      return;
    }
    sound.sound.addEventListener("end", playlistOnce);
  }
}

function OnPreUpdateScene(scene, changes, data, id) {
  if (!changes.active) return;
  doPreloadScenePlaylist(scene);
}

function OnReady() {
  doPreloadScenePlaylist(game.scenes.active);
}

function OnDeleteCombat(tracker, info, id) {
  const scene = tracker?.scene;
  if (scene && scene.getFlag(MODULENAME, "playlistHasEnd") && scene.playlist) {
    if (!game.settings.get(MODULENAME, "autoPlayAudio")) return;
    scene.playlist.playNext();
  }
}

const SOUNDS = {
  [`modules/${MODULENAME}/audio/interact.mp3`]: "Default Interaction",
  [`modules/${MODULENAME}/audio/pickup.mp3`]: "Pick Up Item",
};

export function register() {
  const MODULE = game.modules.get(MODULENAME);
  MODULE.api ??= {};
  MODULE.api.SOUNDS = SOUNDS;

  MODULE.defaults ??= {};
  MODULE.defaults.bumpSound = `modules/${MODULENAME}/audio/bump.mp3`;
  MODULE.defaults.interactionSound = `modules/${MODULENAME}/audio/interact.mp3`;
  MODULE.defaults.pickupSound = `modules/${MODULENAME}/audio/pickup.mp3`;
  MODULE.defaults.shatterSound = `modules/${MODULENAME}/audio/shatter.mp3`;
  MODULE.defaults.doorSound = `modules/${MODULENAME}/audio/door.mp3`;

  if (!early_isGM()) return;

  Hooks.on("ready", OnReady);
  Hooks.on("preUpdateScene", OnPreUpdateScene);
  Hooks.on("deleteCombat", OnDeleteCombat);
}