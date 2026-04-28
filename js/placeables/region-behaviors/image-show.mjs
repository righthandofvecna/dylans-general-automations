import { MODULENAME } from "../../utils.mjs";
import { Interact } from "../../scripts.mjs";

/**
 * The ImageShowRegionBehaviorType class defines a region behavior that shows an
 * image popup when a token interacts while facing the specified direction(s).
 */
class ImageShowRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static _systemType = `${MODULENAME}.imageShow`;

  /** @override */
  static defineSchema() {
    return {
      imageSrc: new foundry.data.fields.FilePathField({ categories: ["IMAGE"], required: true, label: "Image Source" }),
      title: new foundry.data.fields.StringField({ required: true, label: "Title" }),
      directions: new foundry.data.fields.SchemaField({
        upleft:    new foundry.data.fields.BooleanField({ initial: false }),
        up:        new foundry.data.fields.BooleanField({ initial: true }),
        upright:   new foundry.data.fields.BooleanField({ initial: false }),
        left:      new foundry.data.fields.BooleanField({ initial: false }),
        right:     new foundry.data.fields.BooleanField({ initial: false }),
        downleft:  new foundry.data.fields.BooleanField({ initial: false }),
        down:      new foundry.data.fields.BooleanField({ initial: false }),
        downright: new foundry.data.fields.BooleanField({ initial: false }),
      }),
    };
  }

  /* ---------------------------------------- */

  /** @override */
  static events = {
    "tokenInteract": this.#onTokenInteract,
  };

  /* ---------------------------------------- */

  static async #onTokenInteract(event) {
    if (event.user !== game.user) return;

    const { token } = event.data;
    if (!token) return;

    const activeDirections = Object.entries(this.directions).filter(([, v]) => v).map(([k]) => k);
    if (activeDirections.length === 0) return;

    const TokenHasDirection = game.modules.get(MODULENAME)?.api?.scripts?.TokenHasDirection;
    if (!TokenHasDirection?.(token, activeDirections)) return;

    await Interact();
    new ImagePopout(this.imageSrc, { title: this.title }).render(true);
  }

}

/* -------------------------------------------- */

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The Image Show Region Behavior configuration application.
 * @extends DocumentSheetV2
 * @mixes HandlebarsApplication
 */
class ImageShowRegionBehaviorConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  constructor(options) {
    super(options);
    this.options.window.icon = CONFIG.RegionBehavior.typeIcons[this.document.type];
  }

  /** @override */
  static PARTS = {
    form: {
      template: `modules/${MODULENAME}/templates/region-image-show.hbs`,
      scrollable: [""],
    },
    footer: {
      template: "templates/generic/form-footer.hbs",
    },
  };

  /** @override */
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    actions: {
      ...super.DEFAULT_OPTIONS.actions,
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
      buttons: this._getButtons(),
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
      { type: "submit", icon: "fa-solid fa-floppy-disk", label: "BEHAVIOR.ACTIONS.update" },
    ];
  }
}

/* -------------------------------------------- */

export function register() {
  const ImageShowRBT = ImageShowRegionBehaviorType;
  CONFIG.RegionBehavior.dataModels[ImageShowRBT._systemType] = ImageShowRBT;
  CONFIG.RegionBehavior.typeLabels[ImageShowRBT._systemType] = `TYPES.RegionBehavior.${ImageShowRBT._systemType}`;
  CONFIG.RegionBehavior.typeIcons[ImageShowRBT._systemType] = "fas fa-image";

  DocumentSheetConfig.registerSheet(RegionBehavior, MODULENAME, ImageShowRegionBehaviorConfig, {
    makeDefault: true,
    types: [ImageShowRBT._systemType],
    label: "Image Show Behavior",
  });
}
