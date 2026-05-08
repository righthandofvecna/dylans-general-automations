import { MODULENAME, DATNAME, getFiles } from "./utils.mjs";

export function register() {

	game.settings.registerMenu(MODULENAME, "volume", {
		name: "Volume",
		label: "SFX Volume",
		icon: "fa-solid fa-volume",
		hint: "Volume settings for individual sound effects played by Dylan's General Automations.",
		restricted: false,
		type: VolumeSettings,
	});
	for (const vs of ["interact", "collide", "shatter"]) {
		VolumeSettings.addVolume(
			MODULENAME,
			vs,
			`DGA.Settings.Volume.${vs}.label`,
			`DGA.Settings.Volume.${vs}.hint`,
		);
	};

	game.settings.registerMenu(MODULENAME, "audio", {
		name: "Audio",
		label: "Audio Settings",
		icon: "fa-solid fa-volume",
		hint: "World settings to affect the playback of audio tracks and sound effects.",
		restricted: true,
		type: AudioSettings,
	});
	AudioSettings.initSettings();

	//
	// Hidden settings we don't want to show in the settings menu, but are used by the module
	//

	game.settings.register(MODULENAME, "persistedToolSettings", {
		name: "Persisted Tool Settings",
		default: {},
		type: Object,
		scope: "user",
		config: false,
		requiresReload: false,
	})

  game.settings.register(MODULENAME, "debug", {
    name: "Debug Mode",
    default: false,
    type: Boolean,
    scope: "world",
    requiresReload: false,
    config: false,
    hint: "Enable debug mode for additional logging and diagnostics."
	});

  game.settings.register(MODULENAME, "fairPickup", {
    name: "Fair Item Pickup",
    hint: "Prevent a player from picking up items if they have already picked up more than any other active non-GM player.",
    default: false,
    type: Boolean,
    scope: "world",
    config: true,
    requiresReload: false,
  });

  game.settings.register(MODULENAME, "pickupCounts", {
    name: "Pickup Counts",
    default: {},
    type: Object,
    scope: "world",
    config: false,
    requiresReload: false,
  });



	const MODULE = game.modules.get(MODULENAME);
	MODULE.api ??= {};
	MODULE.api.VolumeSettings = VolumeSettings;
	MODULE.api.AudioSettings = AudioSettings;
};

/**
 * A generic settings menu that can be used to create a settings menu for any arbitrary settings.
 * It will automatically generate fields for each setting in `SETTINGS_TO_INCLUDE`.
 * 
 * @extends {foundry.applications.api.HandlebarsApplicationMixin}
 */
export class ArbitrarySettingsMenu extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

	static SETTINGS_TO_INCLUDE = [];
	static OTHER_MODULE_SETTINGS_TO_INCLUDE = {};

	static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    super.DEFAULT_OPTIONS,
    {
			tag: "form",
      classes: ["sheet", "dga", "settings"],
      position: {
        height: 'auto',
        width: 550,
      },
      window: {
        minimizable: false,
        resizable: true,
      },
			form: {
					closeOnSubmit: true,
					submitOnChange: false,
					handler: ArbitrarySettingsMenu.#submit,
			},
    },
    { inplace: false }
  );

	static PARTS = {
		modifiers: {
				id: "generic-settings",
				template: `modules/${MODULENAME}/templates/generic-settings.hbs`,
		},
	};

	/**
	 * Auto-generates fields for each setting in `SETTINGS_TO_INCLUDE` and prepares the context for the template.
	 * @returns {Promise<object>} a context object to be used in the template
	 */
	async _prepareContext() {
		const settings = {};
		for (const [m, k] of Object.entries({
			[MODULENAME]: this.constructor.SETTINGS_TO_INCLUDE,
			...this.constructor.OTHER_MODULE_SETTINGS_TO_INCLUDE
		})) {
			const setting = game.settings.settings.get(`${m}.${k}`);
			if (!setting) {
				console.warn(`Setting ${k} not found in ${m}.`);
				continue;
			}

			settings[k] = {
				value: game.settings.get(m, k),
				field: null,
			}

			if (setting.type === Boolean) {
				settings[k].field = new foundry.data.fields.BooleanField({
					label: setting.label ?? setting.name,
					hint: setting.hint,
				});
			} else if (setting.type === String) {
				settings[k].field = new foundry.data.fields.StringField({
					label: setting.label ?? setting.name,
					hint: setting.hint,
				});
			} else if (setting.type instanceof foundry.data.fields.DataField) {
				settings[k].field = new setting.type.constructor({
					...(setting.type.toObject() ?? Object.fromEntries(Object.entries(setting.type))),
					label: setting.label ?? setting.name,
					hint: setting.hint,
				});
			}

			if (!settings[k].field) delete settings[k]; // If no field was created, remove the setting from the context
			else {
				settings[k].field.name = k;
			}
		}
    return {
			settings,
    }
	}

	static async #submit(event, form, formData) {
		let needsReload = false;
		for (const [key, value] of Object.entries(formData?.object ?? {})) {
			const oldValue = game.settings.get(MODULENAME, key);
			if (oldValue === value) continue; // No change, skip
			const setting = game.settings.settings.get(`${MODULENAME}.${key}`);
			if (setting?.requiresReload)  needsReload = true; // If the setting requires a reload, mark it
			await game.settings.set(MODULENAME, key, value);
		}
		if (needsReload) {
			foundry.applications.settings.SettingsConfig.reloadConfirm({ world: true });
		}
	}

	static addForeignSetting(module, key) {
		if (!game.settings.settings.get(`${module}.${key}`)) {
			console.warn(`Setting ${key} not found in ${module}. Cannot add to settings menu.`);
			return;
		}
		this.OTHER_MODULE_SETTINGS_TO_INCLUDE[module] = [...(this.OTHER_MODULE_SETTINGS_TO_INCLUDE[module] ?? []), key];
	}
}

/**
 * A settings menu for managing volume settings for various sound effects.
 */
export class VolumeSettings extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

	static SFX = {};

	static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    super.DEFAULT_OPTIONS,
    {
			tag: "form",
      classes: ["sheet", "dga", "settings", "volume"],
      position: {
        height: 'auto',
        width: 400,
      },
      window: {
				title: "Volume Settings",
        minimizable: false,
        resizable: false,
      },
			form: {
					closeOnSubmit: false,
					submitOnChange: true,
					handler: VolumeSettings.#submit,
			},
    },
    { inplace: false }
  );

	static PARTS = {
		modifiers: {
				id: "volume-settings",
				template: `modules/${MODULENAME}/templates/volume-settings.hbs`,
		},
	};

	async _prepareContext() {
		const sfx = {};
		for (const [k, v] of Object.entries(VolumeSettings.SFX)) {
			sfx[k] = {
				...v,
				value: game.settings.get(v.module, v.key),
			}
		}
    return {
			sfx,
    }
  }

	static getVolume(k) {
		// Convert from "perceived volume" to "power" (which is what sequencer's volume settings use for some reason)
		// normalized to a range [0.0, 1.0]
		const perceivedToPower = (perceivedVolume) => 10**perceivedVolume / 9 - (1 / 9);
		try {
			const perceivedVolume = game.settings.get(MODULENAME, `volume-${k}`);
			return perceivedToPower(perceivedVolume);
		} catch (e) {
			return perceivedToPower(0.5);
		}
	}

	static getRawVolume(k) {
		try {
			return game.settings.get(MODULENAME, `volume-${k}`);
		} catch (e) {
			return 0.5;
		}
	}

	static async #submit(event, form, formData) {
		for (const [key, value] of Object.entries(formData?.object ?? {})) {
			const { module } = VolumeSettings.SFX[key] ?? {};
			await game.settings.set(module, key, value);
		}
	}

	static addVolume(module, key, label, hint) {
		key = `volume-${key}`;
		hint ??= `The volume of the ${label} sound effect.`;
		if (VolumeSettings.SFX[key]) return;
		VolumeSettings.SFX[key] = {
			key,
			label,
			hint,
			module,
		};
		game.settings.register(module, key, {
			name: `SFX Volume: ${label}`,
			default: 0.5,
			type: Number,
			scope: "client",
			requiresReload: false,
			config: false,
			hint,
		});
	}

}

/**
 * A settings menu for managing world audio-related settings.
 */
export class AudioSettings extends ArbitrarySettingsMenu {
	static SETTINGS_TO_INCLUDE = [
		"autoPlayAudio",
		"playCollisionSound",
		"playInteractSound",
	];

	static DEFAULT_OPTIONS = foundry.utils.mergeObject(
		super.DEFAULT_OPTIONS,
		{
			classes: [...(super.DEFAULT_OPTIONS?.classes ?? []), "audio-settings"],
			window: {
				title: "Audio Settings",
			},
		},
		{ inplace: false }
	);

	static PARTS = {
		modifiers: {
				id: "audio-settings",
				template: `modules/${MODULENAME}/templates/generic-settings.hbs`,
		},
	};

	static initSettings() {
		game.settings.register(MODULENAME, "autoPlayAudio", {
			name: "Auto Play Audio",
			default: true,
			type: Boolean,
			scope: "world",
			requiresReload: false,
			config: false,
			hint: "Preload audio playlist when switching to a scene, and when a combat is completed, move to the next track."
		});

		game.settings.register(MODULENAME, "playCollisionSound", {
			name: "Play Collision Sound",
			default: true,
			type: Boolean,
			scope: "client",
			requiresReload: false,
			config: false,
			hint: "When you attempt to move into a wall or other obstruction using the keyboard, play a collision sound."
		});

		game.settings.register(MODULENAME, "playInteractSound", {
			name: "Play Interact Sound",
			default: true,
			type: Boolean,
			scope: "client",
			requiresReload: false,
			config: false,
			hint: "When you interact with a Scene Region with a \"Token Interaction\" trigger, play an interaction sound."
		});
	}
}
