import { MODULENAME } from "./utils.mjs";


/**
 * Custom DialogV2 wrapper that applies pop-up styling, adds keyboard navigation for buttons, and ensures a button is always focused.
 */

class FooterDialog extends foundry.applications.api.DialogV2 {
  constructor(options = {}) {
    super(options);
    this._keydownHandler = null;
    this._buttonFocusInterval = null;
  }

  /* -------------------------------------------- */

  /**
   * @override
   */
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    super.DEFAULT_OPTIONS,
    {
      classes: ["dga", "footer-dialog"],
      window: {
        positioned: true,
      },
      position: {
        width: "auto",
        height: "auto",
      },
    },
    { inplace: false }
  );

  /* -------------------------------------------- */

  /**
   * @override
   */
  _onRender(context, options) {
    super._onRender(context, options);

    // Add dialog-prompt or dialog-choices class based on button count
    const buttonCount = Object.keys(this.options.buttons ?? {}).length;
    if (buttonCount <= 1) {
      this.element.classList.add("dialog-prompt");
    } else {
      this.element.classList.add("dialog-choices");
    }

    const getButtons = () => Array.from(this.element.querySelectorAll("button:not(.header-control)"));

    // --- Interval to steal focus back to a button if none are focused ---
    if (!this._buttonFocusInterval) {
      this._buttonFocusInterval = setInterval(() => {
        // If none of the dialog's buttons are focused, refocus default/first
        const active = document.activeElement;
        const buttons = getButtons();
        const defaultBtn = buttons.find(btn => btn.classList.contains("default")) ?? buttons.at(0);
        if (!buttons.includes(active)) {
          defaultBtn.focus({ focusVisible: true });
        }
      }, 250);
    }
     

    // --- Up/Down arrow navigation for buttons ---
    if (!this._keydownHandler) {
      this._keydownHandler = (ev) => {
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          const buttons = getButtons();
          if (!buttons.length) return;
          const active = document.activeElement;
          let idx = buttons.indexOf(active);
          if (ev.key === "ArrowDown") {
            idx = (idx + 1) % buttons.length;
          } else if (ev.key === "ArrowUp") {
            idx = (idx - 1 + buttons.length) % buttons.length;
          }
          buttons[idx].focus({ focusVisible: true });
          ev.preventDefault();
        }
      };
      this.element.addEventListener("keydown", this._keydownHandler, true);
    }
  }

  /* -------------------------------------------- */

  /**
   * @override
   */
  async render(options={}, _options={}) {
    if ( typeof options === "boolean" ) options = Object.assign(_options, {force: options});
    return super.render({
      ...options,
      animate: false,
    });
  }

  /* -------------------------------------------- */

  /**
   * @override
   */
  async close(options={}) {
    // Clean up key handler
    if (this._keydownHandler && this.element && this.element[0]) {
      this.element[0].removeEventListener("keydown", this._keydownHandler, true);
      this._keydownHandler = null;
    }
    // Clean up button focus interval
    if (this._buttonFocusInterval) {
      clearInterval(this._buttonFocusInterval);
      this._buttonFocusInterval = null;
    }
    return super.close({
      ...options,
      animate: false,
    });
  }
}

/**
 * Footer-styled prompt dialog
  */
async function FooterDialogPrompt({ title, content, label = "OK", callback, rejectClose = false, options = {} } = {}) {
  const dialogOptions = foundry.utils.mergeObject(
    {
      window: {
        title: title ?? "Prompt",
      },
      content: `<div class="dialog-content">${content}</div>`,
      buttons: [
        {
          action: "ok",
          label: label,
          icon: "fa-solid fa-arrow-right",
          default: true,
          callback: callback ?? ((event, button, dialog) => true),
        },
      ],
      rejectClose,
    },
    options
  );

  return FooterDialog.wait(dialogOptions);
}

/**
 * Footer-styled confirm dialog
 */
async function FooterDialogConfirm({
  title,
  content,
  yes = () => true,
  no = () => false,
  defaultYes = true,
  rejectClose = true,
  options = {},
} = {}) {
  const dialogOptions = foundry.utils.mergeObject(
    {
      window: {
        title: title ?? "Confirm",
      },
      content: `<div class="dialog-content">${content}</div>`,
      buttons: [
        {
          action: "yes",
          label: "Yes",
          default: defaultYes,
          callback: (event, button, dialog) => {
            const result = yes instanceof Function ? yes(event, button, dialog) : yes;
            return result;
          },
        },
        {
          action: "no",
          label: "No",
          default: !defaultYes,
          callback: (event, button, dialog) => {
            const result = no instanceof Function ? no(event, button, dialog) : no;
            return result;
          },
        },
      ],
      rejectClose,
    },
    options
  );

  return FooterDialog.wait(dialogOptions);
}

/**
 * Wrapper for backward compatibility with old Dialog.prompt API
 * Automatically uses Footer styling if options.footer === true
 */
async function Dialog_prompt_wrapper(wrapped, config = {}) {
  if (config.options?.footer !== true) return wrapped(config);

  const { title, content, label, callback, rejectClose, options } = config;
  
  // Handle the callback - in the old API it receives (html)
  const wrappedCallback = callback
    ? (event, button, dialog) => {
        // For compatibility, pass the form element like the old API
        return callback(button.form);
      }
    : undefined;

  return FooterDialogPrompt({ title, content, label, callback: wrappedCallback, rejectClose, options });
}

/**
 * Wrapper for backward compatibility with old Dialog.confirm API
 * Automatically uses Footer styling if options.footer === true
 */
async function Dialog_confirm_wrapper(wrapped, config = {}) {
  if (config.options?.footer !== true) return wrapped(config);

  const { title, content, yes, no, defaultYes, rejectClose, options } = config;
  return FooterDialogConfirm({ title, content, yes, no, defaultYes, rejectClose, options });
}

export function register() {
  const MODULE = game.modules.get(MODULENAME);

  MODULE.api ??= {};
  MODULE.api.FooterDialog = FooterDialog;
  MODULE.api.scripts ??= {};
  MODULE.api.scripts.FooterDialogPrompt = FooterDialogPrompt;
  MODULE.api.scripts.FooterDialogConfirm = FooterDialogConfirm;

  libWrapper.register(MODULENAME, "Dialog.prompt", Dialog_prompt_wrapper, "MIXED");
  libWrapper.register(MODULENAME, "Dialog.confirm", Dialog_confirm_wrapper, "MIXED");
}

// Export for direct use
export { FooterDialog, FooterDialogPrompt, FooterDialogConfirm };