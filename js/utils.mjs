
export const MODULENAME = "dylans-general-automations";
export const DATNAME = "dylans-animated-tokens";

export const MYSTERY_MAN = "icons/svg/mystery-man.svg";

export function early_isGM() {
	const level = game.data.users.find(u => u._id == game.data.userId).role;
	const gmLevel = CONST.USER_ROLES.ASSISTANT;
	return level >= gmLevel;
}

export function isTheGM() {
	return game.user.isActiveGM;
}

export function isGMOnline() {
	return game.users.some(u=>u.active && u.isGM);
}

export async function sleep(ms) {
	return new Promise((resolve)=>setTimeout(resolve, ms))
}

export function snapToGrid({ x, y }, grid) {
	return {
		x: Math.floor(x / grid.sizeX) * grid.sizeX,
		y: Math.floor(y / grid.sizeY) * grid.sizeY,
	}
}

export function centerTokenMovement(token, movement) {
	return token?.parent?.grid?.getSnappedPoint(
		movement?.passed?.waypoints?.[0],
		{ mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER});
}

function _norm_angle(a) {
  return a < 0 ? a + 360 : (a >= 360 ? a - 360 : a);
}

export function angleDiff(a, b) {
	return Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
}

/**
 * 
 * @param {object} a the thing that has the rotation
 * @param {number} a.x
 * @param {number} a.y
 * @param {number} a.w
 * @param {number} a.h
 * @param {number} a.r
 * @param {object} b the thing we want to check for adjacency
 * @param {number} b.x
 * @param {number} b.y
 * @param {number} b.w
 * @param {number} b.h
 */
export function isFacing(a, b) {
	const direction = (Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) - 90;
  return Math.floor(_norm_angle(direction + 22.5) / 8) == Math.floor(_norm_angle(a.r + 22.5) / 8);
}

/**
 * 
 * @param {object} a the thing that has the rotation
 * @param {number} a.x
 * @param {number} a.y
 * @param {number} a.w
 * @param {number} a.h
 * @param {number} a.r
 * @param {object} b the thing we want to check for adjacency
 * @param {number} b.x
 * @param {number} b.y
 * @param {number} b.w
 * @param {number} b.h
 * @param {boolean} requireFacing whether or not we should require a to be facing b
 */
export function isAdjacent(a, b, requireFacing=true) {
  if (!((Math.abs(b.x - a.x) * 2 <= a.w + b.w) && (Math.abs(b.y - a.y) * 2 <= a.h + b.h))) {
    return false;
  }
  if (!requireFacing) return true;
  // check facing
  return isFacing(a, b);
}

export function tokenScene(token) {
	return token?.scene ?? token?.parent ?? game.scenes.active;
}

export function listenFilepickerChange(filepicker, onChange) {
	$(filepicker).on("change", "input[type='text']", function() {onChange(this.value)});
  // dumb workaround to listen on the filepicker button too
  $(filepicker).on("click", "button", function () {
    const filePicker = $(this).closest("file-picker")?.get(0)?.picker;
    if (!filePicker) return;
    filePicker.callback = ((callback)=>{
      return function () {
        if (callback) callback(...arguments);
        onChange(arguments[0]);
      }
    })(filePicker.callback);
  })
}

export async function getFiles(path) {
	if (!path) return [];
	if (path.startsWith("/")) path = path.slice(1);
	if (path.endsWith("/")) path = path.slice(0, -1);
	// The Forge needs `foundry.applications.apps.FilePicker.implementation`
	return (await foundry.applications.apps.FilePicker.implementation.browse("data", path).catch(()=>null))?.files ?? [];
}

export function getCombatsForScene(sceneId) {
	const combats = game.combats.filter(c=>c?.active && c?.scene?.uuid === sceneId) ?? [];
	if (combats.length > 0) return combats;
	// PTR 2e automatically disconnects the combat from the scene, so let's check the participants' scene IDs instead
	return game.combats.contents.filter(c=>c?.active && c?.combatants?.contents?.some(p=>p.sceneId === sceneId)) ?? [];
}

// Direction functions
export function getAngleFromDirection(d) {
	switch (d) {
		case "down": return 0;
		case "left": return 90;
		case "right": return 270;
		case "up": return 180;
		case "downleft": return 45;
		case "downright": return 315;
		case "upleft": return 135;
		case "upright": return 225;
	}
	return 0;
}

export function getDirectionFromAngle(angle) {
	switch (( 8 + Math.floor(((angle + 22.5) % 360) / 45) ) % 8) {
		case 0: return "down";
		case 1: return "downleft";
		case 2: return "left";
		case 3: return "upleft";
		case 4: return "up";
		case 5: return "upright";
		case 6: return "right";
		case 7: return "downright";
	}
	return "down";
}

export function getGridDirectionFromAngle(angle) {
	switch (( 8 + Math.floor(((angle + 22.5) % 360) / 45) ) % 8) {
	  case 0: return CONST.MOVEMENT_DIRECTIONS.DOWN;
		case 1: return CONST.MOVEMENT_DIRECTIONS.DOWN_LEFT;
		case 2: return CONST.MOVEMENT_DIRECTIONS.LEFT;
		case 3: return CONST.MOVEMENT_DIRECTIONS.UP_LEFT;
		case 4: return CONST.MOVEMENT_DIRECTIONS.UP;
		case 5: return CONST.MOVEMENT_DIRECTIONS.UP_RIGHT;
		case 6: return CONST.MOVEMENT_DIRECTIONS.RIGHT;
		case 7: return CONST.MOVEMENT_DIRECTIONS.DOWN_RIGHT;
	}
}


export function naturalJoin(arr, joiner) {
	if (arr.length === 0) return "";
	if (arr.length === 1) return arr[0];
	if (arr.length === 2) return `${arr[0]} ${joiner} ${arr[1]}`;
	return `${arr.slice(0, -1).join(", ")}${joiner} ${arr.slice(-1)}`;
}

