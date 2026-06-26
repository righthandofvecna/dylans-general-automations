import { MODULENAME } from "../utils.mjs"

// overrides ProseMirror.ProseMirrorMenu.prototype._insertImagePrompt
async function _insertImagePrompt(...args) {
  const state = this.view.state;
  const { $from, empty } = state.selection;
  const image = this.schema.nodes.image;
  const data = { src: "", alt: "", width: "", height: "", portrait: false };
  if ( !empty ) {
    const selected = state.doc.nodeAt($from.pos);
    Object.assign(data, selected?.attrs ?? {});
  }
  const dialog = await this._showDialog("image", `modules/${MODULENAME}/templates/insert-image.hbs`, { data });
  const form = dialog.querySelector("form");
  const src = form.elements.src;
  const filePicker = src.nextElementSibling;
  filePicker.addEventListener("click", () => {
    new FilePicker({field: src, type: "image", current: src.value ?? "", button: filePicker}).browse();
  });
  
  form.elements.save.addEventListener("click", () => {
    if ( !src.value ) return;
    const ni = image.create({
      src: src.value,
      alt: form.elements.alt.value,
      width: form.elements.width.value,
      height: form.elements.height.value,
    });

    // add class
    ni.attrs._preserve.class = form.elements.portrait.checked ? "portrait" : "";

    this.view.dispatch(this.view.state.tr.replaceSelectionWith(ni).scrollIntoView());
  });
}

/* -------------------------------------------------- */
/*  Background Color / Highlight                      */
/* -------------------------------------------------- */

const HIGHLIGHT_COLORS = [
  { value: "#ffff00", label: "Yellow" },
  { value: "#00ff00", label: "Green" },
  { value: "#00ffff", label: "Cyan" },
  { value: "#ff69b4", label: "Pink" },
  { value: "#ff8c00", label: "Orange" },
  { value: "#dda0dd", label: "Plum" },
  { value: "#ff6347", label: "Red" },
  { value: "#87ceeb", label: "Sky Blue" },
];

/** Session-cached custom color value. */
let _lastCustomColor = "#ffff00";

/**
 * Apply a background color to the current selection by wrapping it in a span mark
 * with a _preserve style for background-color.
 * @param {ProseMirrorMenu} menu    The ProseMirror menu instance.
 * @param {string} color            The CSS color value to apply.
 */
function _applyHighlight(menu, color) {
  const { state, dispatch } = menu.view;
  const { from, to, empty } = state.selection;
  if ( empty ) return;
  const spanMark = menu.schema.marks.span.create({
    _preserve: { style: `background-color: ${color}` }
  });
  dispatch(state.tr.addMark(from, to, spanMark).scrollIntoView());
}

/**
 * Remove background-color highlighting from the current selection.
 * Iterates through the selection and removes span marks whose _preserve.style
 * contains background-color, preserving other span marks.
 * @param {ProseMirrorMenu} menu    The ProseMirror menu instance.
 */
function _clearHighlight(menu) {
  const { state, dispatch } = menu.view;
  const { from, to, empty } = state.selection;
  if ( empty ) return;

  let tr = state.tr;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if ( !node.isInline ) return;
    for ( const mark of node.marks ) {
      if ( (mark.type === menu.schema.marks.span) && mark.attrs._preserve?.style?.includes("background-color") ) {
        const markFrom = Math.max(from, pos);
        const markTo = Math.min(to, pos + node.nodeSize);
        tr = tr.removeMark(markFrom, markTo, mark);
      }
    }
  });
  dispatch(tr.scrollIntoView());
}

/**
 * Show the highlight color picker dialog and handle user interactions.
 * @param {ProseMirrorMenu} menu    The ProseMirror menu instance.
 */
async function _highlightPrompt(menu) {
  const template = `modules/${MODULENAME}/templates/highlight-color.hbs`;
  const data = { colors: HIGHLIGHT_COLORS, customColor: _lastCustomColor };
  const dialog = await menu._showDialog("highlight", template, { data });
  const form = dialog.querySelector("form");

  // Preset color swatches
  for ( const swatch of form.querySelectorAll(".color-swatch") ) {
    swatch.addEventListener("click", () => {
      _applyHighlight(menu, swatch.dataset.color);
      dialog.remove();
      menu.view.focus();
    });
  }

  // Custom color
  form.elements["apply-custom"]?.addEventListener("click", () => {
    const color = form.elements["custom-color"].value;
    if ( color ) {
      _lastCustomColor = color;
      _applyHighlight(menu, color);
    }
    dialog.remove();
    menu.view.focus();
  });

  // Clear highlight
  form.elements.clear?.addEventListener("click", () => {
    _clearHighlight(menu);
    dialog.remove();
    menu.view.focus();
  });
}

/**
 * Register the highlight menu button via the getProseMirrorMenuItems hook.
 */
function _registerHighlightButton() {
  Hooks.on("getProseMirrorMenuItems", (menu, items) => {
    const idx = items.findIndex(i => ["source-code", "save"].includes(i.action));
    const entry = {
      action: "highlight",
      title: "Highlight",
      icon: '<i class="fa-solid fa-highlighter fa-fw"></i>',
      scope: "text",
      cmd: () => _highlightPrompt(menu)
    };
    if ( idx >= 0 ) items.splice(idx, 0, entry);
    else items.push(entry);
  });
}

/* -------------------------------------------------- */

export function register() {
  libWrapper.register(MODULENAME, "ProseMirror.ProseMirrorMenu.prototype._insertImagePrompt", _insertImagePrompt, "OVERRIDE");
  _registerHighlightButton();
}
