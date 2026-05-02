import { naturalJoin } from "./utils.mjs";

/**
 * A custom element that renders a drag-and-drop zone for Foundry items/actors.
 *
 * Usage:
 *   <item-drop-zone></item-drop-zone>
 *
 * API:
 *   element.items  → string[]  (array of UUIDs of dropped items, in order)
 */
export class ItemDropZone extends HTMLElement {
  #items = [];
  #dropZone = null;
  #itemsList = null;

  connectedCallback() {
    const allowedTypes = naturalJoin(this.allowed.map(type => `${type}s`), "or");
    this.innerHTML = `
      <div class="drop-zone" style="min-height: 100px; border: 2px dashed #ccc; padding: 10px; margin-bottom: 10px;">
        <p class="drop-text">Drag and drop ${allowedTypes} here</p>
        <div class="items-list"></div>
      </div>
    `;

    this.#dropZone = this.querySelector('.drop-zone');
    this.#itemsList = this.querySelector('.items-list');

    this.#dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.#dropZone.style.backgroundColor = '#f0f0f0';
    });

    this.#dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      this.#dropZone.style.backgroundColor = 'transparent';
    });

    this.#dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      this.#dropZone.style.backgroundColor = 'transparent';

      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(e);
      const item = await this.#resolveItem(data);
      if (!item) return;

      if (!this.allowed.includes("RollTable") && item.documentName === "RollTable" && this.allowRolltables) {
        // check that all the rollTable results are of an allowed type
        const allResults = await Promise.all(item.results.contents.map(r => fromUuid(r.documentUuid)));
        if (!allResults.every(i => this.allowed.includes(i.documentName))) {
          ui.notifications.warn(`Only RollTables with results of type ${allowedTypes} can be dropped here.`);
          return;
        }
      } else if (!this.allowed.includes(item.documentName)) {
        ui.notifications.warn(`Only ${allowedTypes} can be dropped here.`);
        return;
      }

      this.#items.push(item.uuid);
      this.#renderItem(item);
    });
  }

  get allowed() {
    return this.getAttribute('allowed')?.split(',').map(s => s.trim()) ?? ["Item", "Actor"];
  }

  get allowRolltables() {
    return this.hasAttribute('allow-rolltables');
  }

  /** Returns a copy of the current list of dropped item UUIDs. */
  get items() {
    return [...this.#items];
  }

  async #resolveItem(data) {
    let item = await (async () => {
      if (!data?.uuid && data?.data?._id) {
        // handle world objects that don't return a uuid for some reason
        if (data.type === "Item") return game.items.get(data.data._id);
        if (data.type === "Actor") return game.actors.get(data.data._id);
        if (data.type === "RollTable") return game.tables.get(data.data._id);
        return null;
      }
      return await fromUuid(data.uuid);
    })();
    if (!item) return null;
    if (item.documentName === "RollTable" && !this.allowRolltables) {
      const result = await item.roll();
      if (result.results.length !== 1) return null;
      const r = result.results[0];
      return fromUuid(r.documentUuid);
    }
    return item;
  }

  #renderItem(item) {
    const img = document.createElement('img');
    img.src = item.img;
    img.width = 24;
    img.height = 24;
    img.style.marginRight = '8px';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = item.name;

    const removeBtn = document.createElement('a');
    removeBtn.className = 'remove-item';
    removeBtn.style.marginLeft = 'auto';
    removeBtn.innerHTML = '<i class="fas fa-times"></i>';

    const row = document.createElement('div');
    row.className = 'item';
    row.style.cssText = 'display: flex; align-items: center; margin: 5px 0;';
    row.append(img, nameSpan, removeBtn);

    const wrapper = document.createElement('div');
    wrapper.append(row);

    removeBtn.addEventListener('click', () => {
      const index = this.#items.indexOf(item.uuid);
      if (index > -1) {
        this.#items.splice(index, 1);
        wrapper.remove();
      }
    });

    this.#itemsList.append(wrapper);
  }
}

export function register() {
  customElements.define('item-drop-zone', ItemDropZone);
}
