import { MODULENAME, DATNAME } from "../../utils.mjs";
import { VolumeSettings } from "../../settings.mjs";

// const fu = foundry.utils;

/**
 * The DoorRegionBehaviorType class defines a region behavior that represents a door between scenes.
 */
class DoorRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static _systemType = `${MODULENAME}.door`;
  
  /** @override */
  static defineSchema() {
    return {
      destinationSceneId: new foundry.data.fields.DocumentIdField({ required: true }),
      destinationPosition: new foundry.data.fields.SchemaField({
        x: new foundry.data.fields.NumberField({ required: true }),
        y: new foundry.data.fields.NumberField({ required: true }),
      }, { required: true }),
    };
  }

  /* ---------------------------------------- */

  get destinationScene() {
    return game.scenes.get(this.destinationSceneId);
  }

  /* ---------------------------------------- */

  /** @override */
  static events = {
    [CONST.REGION_EVENTS.TOKEN_ENTER]: this.#onTokenEnter
  };

  /* ---------------------------------------- */

  static async #onTokenEnter(event) {
    const { region, scene, destinationScene } = this;
    const { data: { token, movement }, name: eventName, user } = event;
    if (!destinationScene || !scene || !token) return;
    if (!game.user.isActiveGM) return;

    const tokenData = {
      ...token.toObject(),
      x: this.destinationPosition.x,
      y: this.destinationPosition.y,
    };

    const tokensToMove = [token];
    const enableFollow = game.modules.get(DATNAME)?.active && game.settings.get(DATNAME, "enableFollow");
    if (enableFollow) {
      const getAllFollowing = game.modules.get(DATNAME)?.api?.getAllFollowing ?? function() { return []; };
      tokensToMove.push(...getAllFollowing(token));
    }
    const createData = tokensToMove.map(t=>({
      ...t.toObject(),
      x: this.destinationPosition.x,
      y: this.destinationPosition.y,
    }));

    const createdTokens = await destinationScene.createEmbeddedDocuments("Token", createData, { teleport: true });
    // update following
    if (enableFollow && tokensToMove.length > 1) {
      const idMap = {};
      createdTokens.forEach((t, idx)=>{
        idMap[tokensToMove[idx].id] = t.id;
      });
      await destinationScene.updateEmbeddedDocuments("Token", createdTokens.map(t=>({
        _id: t.id,
        [`flags.${MODULENAME}.following.who`]: idMap[t?.getFlag(MODULENAME, "following")?.who] ?? null,
      })));
    }
    
    await scene.deleteEmbeddedDocuments("Token", tokensToMove.map(t=>t.id));

    await new Sequence({ moduleName: MODULENAME, softFail: true })
      .sound()
        .file(game.modules.get(MODULENAME).defaults?.doorSound)
        .volume(VolumeSettings.getVolume("exit"))
        .forUsers([user.id])
        .async()
      .play();
    await game.socket.emit("pullToScene", destinationScene.id, user.id);
  }

}

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api; 

/**
 * The Scene Region configuration application.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
class DoorRegionBehaviorConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  constructor(options) {
    super(options);
    this.options.window.icon = CONFIG.RegionBehavior.typeIcons[this.document.type];
  }

  /** @override */
  static PARTS = {
    form: {
      template: `modules/${MODULENAME}/templates/region-door.hbs`,
      scrollable: [""]
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /** @override */
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    actions: {
      ...super.DEFAULT_OPTIONS.actions,
      pickLocation: DoorRegionBehaviorConfig.#pickLocation,
    }
  }, { inplace: false });

  /* -------------------------------------------- */
  /*  Context Preparation                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, {
      region: context.document,
      buttons: this._getButtons()
    });
  }


  /* -------------------------------------------- */

  /**
   * Get footer buttons for this behavior config sheet.
   * @returns {FormFooterButton[]}
   * @protected
   */
  _getButtons() {
    return [
      {type: "submit", icon: "fa-solid fa-floppy-disk", label: "BEHAVIOR.ACTIONS.update"}
    ];
  }

  /* -------------------------------------------- */

  static async #pickLocation(event, target) {
    const currentScene = this.document.scene;
    const destScene = this.document.system.destinationScene;
    if (!destScene) {
      ui.notifications.warn("Set a destination scene before picking a location.");
      return;
    }
    await destScene.view();
    try {
      const location = await game.modules.get(MODULENAME).api.scripts.UserPaintArea();
      if (location) {
        await this.document.update({ "system.destinationPosition": { x: location.x, y: location.y } });
      }
    } finally {
      await currentScene?.view();
    }
  }
}


export function register() {
  const DoorRBT = DoorRegionBehaviorType;
  CONFIG.RegionBehavior.dataModels[DoorRBT._systemType] = DoorRBT;
  CONFIG.RegionBehavior.typeLabels[DoorRBT._systemType] = `TYPES.RegionBehavior.${DoorRBT._systemType}`;
  CONFIG.RegionBehavior.typeIcons[DoorRBT._systemType] = "fas fa-door-closed";

  DocumentSheetConfig.registerSheet(RegionBehavior, MODULENAME, DoorRegionBehaviorConfig, {
    makeDefault: true,
    types: [DoorRBT._systemType],
    label: "Door Behavior",
  });
}