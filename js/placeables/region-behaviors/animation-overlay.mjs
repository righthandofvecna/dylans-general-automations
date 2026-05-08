import { MODULENAME } from "../../utils.mjs";

// ─── Canvas Manager ───────────────────────────────────────────────────────────

/**
 * Manages tiled animation overlays for Scene Regions with the animationOverlay behavior.
 *
 * Animations are rendered between the scene background color (WebGL clear) and the
 * scene map image by inserting a PIXI.Container into canvas.primary at the child
 * index just below canvas.primary.background.
 *
 * Frame synchronization across clients is achieved via wall-clock time
 * (performance.now()), requiring no socket communication.
 */
class AnimationOverlayCanvasManager {
  /** @type {PIXI.Container|null} */
  _container = null;

  /**
   * Per-region render state.
   * @type {Map<string, {container: PIXI.Container, frames: PIXI.Texture[], fps: number}>}
   */
  _regions = new Map();

  /** @type {Function|null} */
  _tickerCallback = null;

  /* -------------------------------------------- */

  /**
   * Initialize the root PIXI.Container and inject it between the scene background
   * color and the scene map image. Register the PIXI ticker for frame updates.
   */
  initialize() {
    this._container = new PIXI.Container();
    this._container.name = `${MODULENAME}.animationOverlay`;
    this._injectContainer();

    this._tickerCallback = () => this._tick();
    canvas.app.ticker.add(this._tickerCallback);
  }

  /* -------------------------------------------- */

  /**
   * Insert the root container just below canvas.primary.background so that it renders
   * after the WebGL clear color but before the scene map image.
   *
   * In canvas.primary's child list, lower index = rendered first (= drawn below).
   * addChildAt(container, bgIdx) shifts canvas.primary.background to bgIdx+1.
   */
  _injectContainer() {
    try {
      const bg = canvas.primary?.background;
      if (bg && canvas.primary.children.includes(bg)) {
        const bgIdx = canvas.primary.getChildIndex(bg);
        canvas.primary.addChildAt(this._container, bgIdx);
        return;
      }
    } catch (err) {
      console.warn(`[${MODULENAME}] | AnimationOverlay: could not locate background layer, falling back to addChild`, err);
    }
    // Fallback: appended last (renders on top) – only reached if canvas structure is unexpected
    canvas.primary?.addChild(this._container);
  }

  /* -------------------------------------------- */

  /**
   * Remove all PIXI objects and the ticker callback. Called on canvasTearDown.
   */
  destroy() {
    if (this._tickerCallback) {
      canvas.app?.ticker?.remove(this._tickerCallback);
      this._tickerCallback = null;
    }
    for (const { container } of this._regions.values()) {
      container.destroy({ children: true });
    }
    this._regions.clear();
    this._container?.destroy({ children: true });
    this._container = null;
  }

  /* -------------------------------------------- */

  /**
   * Rebuild all region overlay containers from the current scene's animationOverlay
   * behaviors. Safe to call repeatedly; clears and rebuilds from scratch each time.
   */
  async refresh() {
    if (!canvas.scene || !this._container) return;

    // Clear existing region containers
    for (const { container } of this._regions.values()) {
      container.destroy({ children: true });
    }
    this._regions.clear();
    this._container.removeChildren();

    for (const region of canvas.scene.regions) {
      for (const behavior of region.behaviors) {
        if (behavior.type !== `${MODULENAME}.animationOverlay`) continue;
        if (behavior.disabled) continue;
        try {
          await this._buildRegionContainer(region, behavior.system);
        } catch (err) {
          console.error(`[${MODULENAME}] | AnimationOverlay: failed to build overlay for region "${region.name}" (${region.id})`, err);
        }
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Load the spritesheet for one behavior and tile the animation across all
   * grid cells whose centers fall within the region's 2D footprint.
   *
   * @param {RegionDocument} regionDoc
   * @param {object}         system       The behavior's system data (animationSrc, fps)
   */
  async _buildRegionContainer(regionDoc, system) {
    const { animationSrc, fps } = system;
    if (!animationSrc) return;

    // Load the PIXI spritesheet (cached after first load by PIXI.Assets)
    const sheet = await PIXI.Assets.load(animationSrc);
    const animations = sheet?.animations ?? {};
    const frames = animations["play"] ?? Object.values(animations)[0];
    if (!frames?.length) {
      console.warn(`[${MODULENAME}] | AnimationOverlay: no animation frames found in "${animationSrc}"`);
      return;
    }

    const cells = this._getRegionGridCells(regionDoc);
    if (!cells.length) return;

    const { sizeX: cellW, sizeY: cellH } = canvas.scene.grid;

    const container = new PIXI.Container();
    container.name = `animationOverlay.${regionDoc.id}`;

    for (const { x, y } of cells) {
      const sprite = new PIXI.Sprite(frames[0]);
      sprite.x = x;
      sprite.y = y;
      sprite.width = cellW;
      sprite.height = cellH;
      container.addChild(sprite);
    }

    this._container.addChild(container);
    this._regions.set(regionDoc.id, { container, frames, fps: Math.max(1, fps ?? 8) });
  }

  /* -------------------------------------------- */

  /**
   * Return the top-left canvas coordinates of every grid cell whose center
   * falls within the 2D footprint of the given region (elevation is ignored
   * because this is a purely visual overlay).
   *
   * @param {RegionDocument} regionDoc
   * @returns {{ x: number, y: number }[]}
   */
  _getRegionGridCells(regionDoc) {
    const { sizeX: cellW, sizeY: cellH } = canvas.scene.grid;
    const cells = [];

    const shapes = regionDoc.shapes;
    if (!shapes?.length) return cells;

    // Compute the overall bounding box across all shapes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const shape of shapes) {
      const b = shape.bounds;
      if (!b) continue;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    if (!isFinite(minX)) return cells;

    const x0 = Math.floor(minX / cellW) * cellW;
    const x1 = Math.ceil(maxX / cellW) * cellW;
    const y0 = Math.floor(minY / cellH) * cellH;
    const y1 = Math.ceil(maxY / cellH) * cellH;

    // The region's bottom elevation (or 0) is used so testPoint's elevation
    // check passes regardless of the region's configured elevation range.
    const elevation = regionDoc.elevation?.bottom ?? 0;

    for (let x = x0; x < x1; x += cellW) {
      for (let y = y0; y < y1; y += cellH) {
        const cx = x + cellW / 2;
        const cy = y + cellH / 2;
        let covered = false;
        try {
          covered = regionDoc.testPoint({ x: cx, y: cy, elevation: elevation });
        } catch {
          // Fallback: a simple bounds-level check using each shape's PIXI.Rectangle bounds
          covered = shapes.some(s => s.bounds?.contains(cx, cy));
        }
        if (covered) cells.push({ x, y });
      }
    }
    return cells;
  }

  /* -------------------------------------------- */

  /**
   * PIXI ticker callback. Updates all sprite textures each frame using wall-clock
   * time so that every connected client shows the same animation frame.
   */
  _tick() {
    const now = performance.now();
    for (const { container, frames, fps } of this._regions.values()) {
      if (!frames.length) continue;
      const frameIdx = Math.floor(now / (1000 / fps)) % frames.length;
      const texture = frames[frameIdx];
      for (const sprite of container.children) {
        sprite.texture = texture;
      }
    }
  }
}

/* -------------------------------------------- */

/** @type {AnimationOverlayCanvasManager} */
const manager = new AnimationOverlayCanvasManager();

// ─── RegionBehaviorType ───────────────────────────────────────────────────────

/**
 * A region behavior that tiles a PIXI spritesheet animation across every grid cell
 * covered by the region. The animation is drawn between the scene background color
 * and the scene map image so that transparent areas of the map reveal it.
 */
class AnimationOverlayRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static _systemType = `${MODULENAME}.animationOverlay`;

  /** @override */
  static defineSchema() {
    return {
      animationSrc: new foundry.data.fields.FilePathField({
        required: false,
        label: `DGA.RegionBehaviorConfig.AnimationOverlay.animationSrc.label`,
        hint: `DGA.RegionBehaviorConfig.AnimationOverlay.animationSrc.hint`,
        categories: ["TEXT"],
      }),
      fps: new foundry.data.fields.NumberField({
        required: true,
        integer: true,
        min: 1,
        max: 60,
        initial: 8,
        label: `DGA.RegionBehaviorConfig.AnimationOverlay.fps.label`,
        hint: `DGA.RegionBehaviorConfig.AnimationOverlay.fps.hint`,
      }),
    };
  }

  /** @override */
  static events = {};
}

// ─── Config Sheet ─────────────────────────────────────────────────────────────

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

class AnimationOverlayRegionBehaviorConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  constructor(options) {
    super(options);
    this.options.window.icon = CONFIG.RegionBehavior.typeIcons[this.document.type];
  }

  /** @override */
  static PARTS = {
    form: {
      template: `modules/${MODULENAME}/templates/region-animation-overlay.hbs`,
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
    },
  }, { inplace: false });

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, {
      region: context.document,
      buttons: this._getButtons(),
    });
  }

  _getButtons() {
    return [
      { type: "submit", icon: "fa-solid fa-floppy-disk", label: "BEHAVIOR.ACTIONS.update" },
    ];
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

function _isAnimationOverlay(behavior) {
  return behavior.type === `${MODULENAME}.animationOverlay`;
}

export function register() {
  const RBT = AnimationOverlayRegionBehaviorType;
  CONFIG.RegionBehavior.dataModels[RBT._systemType] = RBT;
  CONFIG.RegionBehavior.typeLabels[RBT._systemType] = `TYPES.RegionBehavior.${RBT._systemType}`;
  CONFIG.RegionBehavior.typeIcons[RBT._systemType] = "fas fa-fire";

  DocumentSheetConfig.registerSheet(RegionBehavior, MODULENAME, AnimationOverlayRegionBehaviorConfig, {
    makeDefault: true,
    types: [RBT._systemType],
    label: "Animation Overlay Behavior",
  });

  Hooks.on("canvasReady", async () => {
    manager.initialize();
    await manager.refresh();
  });

  Hooks.on("canvasTearDown", () => {
    manager.destroy();
  });

  Hooks.on("createRegionBehavior", (behavior) => {
    if (_isAnimationOverlay(behavior)) manager.refresh();
  });

  Hooks.on("updateRegionBehavior", (behavior) => {
    if (_isAnimationOverlay(behavior)) manager.refresh();
  });

  Hooks.on("deleteRegionBehavior", (behavior) => {
    if (_isAnimationOverlay(behavior)) manager.refresh();
  });

  Hooks.on("updateRegion", (region) => {
    if (region.behaviors.some(_isAnimationOverlay)) manager.refresh();
  });
}
