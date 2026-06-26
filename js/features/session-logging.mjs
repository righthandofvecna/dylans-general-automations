import { MODULENAME } from '../utils.mjs';

/** Flags */
const SESSION_LOG_ID = "sessionLogId";
const RECAP_ID = "recapId";
const REMEMBER_ID = "rememberId";
const NEW_ITEMS = "newlyAddedItems"

/** Other Constants */
const MINIMUM_LOG_WORD_COUNT = 13;

/**
 * Get the Campaign Bible journal folder, creating it if it doesn't exist.
 */
async function getCampaignBible() {
  // look for the Campaign Bible journal folder
  let campaignBible = game.journal.folders.find(f => f.name.toUpperCase() == "CAMPAIGN BIBLE" && f.type == "JournalEntry");
  if (!campaignBible) {
    // create the Campaign Bible folder
    campaignBible = (await Folder.createDocuments([{
      name: "Campaign Bible",
      type: "JournalEntry"
    }]))?.[0];
    if (!campaignBible) {
      ui.notifications.error("Could not create Campaign Bible folder.");
      return;
    }
  }
  return campaignBible;
}

/**
 * Kick off the post-session logging process, in the hopes that the DM will get the message to log the session
 */
export async function postSessionLogging() {
  let sessionLog = await fromUuid(game.settings.get(MODULENAME, SESSION_LOG_ID));
  if (!sessionLog) {
    // look for the Campaign Bible journal folder
    const campaignBible = await getCampaignBible();
    if (!campaignBible) {
      return;
    }
    // create the session log journal entry
    sessionLog = (await JournalEntry.createDocuments([{
      name: "Session Logs",
      folder: campaignBible.id,
    }]))?.[0];
    if (!sessionLog) {
      ui.notifications.error("Could not create session log journal entry.");
      return;
    }
    await game.settings.set(MODULENAME, SESSION_LOG_ID, sessionLog.uuid);
  }

  // get the new session number
  const lastSession = sessionLog.pages.contents.sort((a, b) => a.sort - b.sort).at(0);
  let session = lastSession?.name?.match(/Session (\d+)/)?.[1];
  if (!session) {
    session = 1;
  } else {
    session = parseInt(session) + 1;
  }

  // the current session date
  const date = (new Date()).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
  
  const addedItemsHtml = await (async ()=>{
    const newItems = game.settings.get(MODULENAME, NEW_ITEMS) ?? new Set();
    if (!newItems || newItems.size == 0) return "";
    let html = `<details open class="newlyAddedItems"><summary>The following new items were added this session:</summary><ul>`;
    for (const itemUuid of newItems) {
      const item = await fromUuid(itemUuid);
      if (!item) continue;
      html += `<li>${item.link} &mdash; ${item.parent?.name ?? "???"}</li>`;
    }
    html += `</ul></details>`;
    // clear the new items
    await game.settings.set(MODULENAME, NEW_ITEMS, new Set());
    return html;
  })();

  // create a new log for the session
  const sessionLogEntry = (await sessionLog.createEmbeddedDocuments("JournalEntryPage", [{
    name: `Session ${session}: ${date}`,
    text: {
      content: `<ul><li><p></p></li></ul><p class="postamble"><em>* Immediate effect on the adventure</em></p><p><em>** Remember for the future</em></p>${addedItemsHtml}`,
      format: 1,
    },
    sort: (lastSession?.sort ?? 100000) - 1000,
    flags: {
      core: {
        sheetClass: `${MODULENAME}.SessionLogSheet`,
      }
    }
  }]))?.[0];
  await sessionLogEntry.sheet?.render({ force: true });
}

/**
 * Check if the last session log is empty or near-empty, and warn the GM if it is.
 */
async function checkForEmptySessionLog() {
  if (!game.user.isGM) return;
  const sessionLog = await fromUuid(game.settings.get(MODULENAME, SESSION_LOG_ID));
  if (!sessionLog) return;

  const lastPage = sessionLog.pages.contents.sort((a, b) => a.sort - b.sort).at(0);
  if (!lastPage) return;

  await (async ()=>{
    const wordCount = lastPage.text.content
      .substring(0, lastPage.text.content.indexOf('<p class="postamble">')) // remove postamble
      .replace("</li>", " ")
      .replace(/<[^>]+>/g, "") // remove any remaining HTML tags
      .split(/\s+/).filter(s=>!!s).length;
    if (wordCount < MINIMUM_LOG_WORD_COUNT) {
      ui.notifications.warn(`The last session log is too short (${wordCount} words). Minimum is ${MINIMUM_LOG_WORD_COUNT} words.`);
      await lastPage?.sheet?.render({ force: true });
      return;
    }
  })();

  await (async ()=>{
    // check if any journal entry has a TODO
    const hasToDos = game.journal.contents.flatMap(j=>j.pages.contents).filter(p=>p.text?.content?.includes("TODO"));
    if (!hasToDos || hasToDos.length == 0) return;
    ui.notifications.warn("Some journal pages contain a TODO. Please remember to fill them in.");
    hasToDos.forEach(p=>p?.sheet?.render({ force: true }));
  })();

  await (async ()=>{
    // check if any rolltable result has a TODO
    const hasToDos = game.tables.contents.flatMap(t=>t.results.contents).filter(r=>r.description.includes("TODO"));
    if (!hasToDos || hasToDos.length == 0) return;
    ui.notifications.warn("Some rollable table results contain a TODO. Please remember to fill them in.");
    hasToDos.forEach(r=>r.sheet?.render({ force: true }));
  })();
}

/* ------------------------------------------------------------------------- */

function OnCreateItem(item, options, userId) {
  if (!game.user.isGM) return;
  const newItems = game.settings.get(MODULENAME, NEW_ITEMS) ?? new Set();
  // if this item has a parent that has a player owner, add it
  const parent = item.parent;
  if (!parent?.hasPlayerOwner) return;
  newItems.add(item.uuid);
  game.settings.set(MODULENAME, NEW_ITEMS, newItems);
}

/* ------------------------------------------------------------------------- */


class SessionLogSheet extends foundry.applications.sheets.journal.JournalEntryPageProseMirrorSheet {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    classes: [...(super.DEFAULT_OPTIONS.window.classes ?? []), "session-log"],
    actions: {
      "toRecap": SessionLogSheet.#toRecap,
    }
  }, { inplace: false });

  // /** @inheritDoc */
  // static VIEW_PARTS = foundry.utils.mergeObject(super.VIEW_PARTS, {
  //   footer: super.EDIT_PARTS.footer,
  // }, { inplace: false });

  /**
   * Prepare render context for the footer part.
   * @param {ApplicationRenderContext} context
   * @param {HandlebarsRenderOptions} options
   * @returns {Promise<void>}
   * @protected
   */
  async _prepareFooterContext(context, options) {
    await super._prepareFooterContext(context, options);
    context.buttons.unshift({
      type: "button",
      cssClass: "",
      action: "toRecap",
      icon: "fa-solid fa-arrow-up-right-from-square",
      label: "DGA.SessionLog.ToRecap",
    });
    // if (this.isView) {
    //   context.buttons = context.buttons.filter(b => b.type != "submit");
    // }
  }

  static #toRecap(event) {
    event.preventDefault();
    (async ()=>{
      let recap = await fromUuid(game.settings.get(MODULENAME, RECAP_ID));
      if (!recap) {
        // look for the Campaign Bible journal folder
        const campaignBible = await getCampaignBible();
        if (!campaignBible) {
          return;
        }
        // create the recap journal entry
        recap = (await JournalEntry.createDocuments([{
          name: "Recaps",
          folder: campaignBible.id,
        }]))?.[0];
        if (!recap) {
          ui.notifications.error("Could not create recap journal entry.");
          return;
        }
        await game.settings.set(MODULENAME, RECAP_ID, recap.uuid);
      }

      // check if a recap already exists for this session
      const existingRecap = recap.pages.contents.find(p => p.name == this.document.name);
      if (existingRecap) {
        await existingRecap.sheet?.render({ force: true });
        return;
      }
      
      // create a new recap page
      let sort = (Math.min(...recap.pages.contents.map(p => p.sort))) - 1000;
      if (!Number.isInteger(sort)) sort = 10000000;
      const recapPage = (await recap.createEmbeddedDocuments("JournalEntryPage", [{
        name: this.document.name,
        text: {
          content: `<p><strong>TODO:</strong> Write a recap for this session:</p>${this.document.text.content}<p></p>`,
          format: 1,
        },
        sort,
      }]))?.[0];
      if (!recapPage) {
        ui.notifications.error("Could not create recap page.");
        return;
      }
      await recapPage.sheet?.render({ force: true });
    })();
  }
}


/* ------------------------------------------------------------------------- */

export function register() {
  const MODULE = game.modules.get(MODULENAME);
  MODULE.api ??= {};
  MODULE.api.postSessionLogging = postSessionLogging;

  game.settings.register(MODULENAME, SESSION_LOG_ID, {
    name: "Session Log ID",
    default: null,
    type: String,
    scope: "world",
    config: false,
    hint: "The UUID of the session log journal that is used to store session logs."
  });

  game.settings.register(MODULENAME, RECAP_ID, {
    name: "Recap ID",
    default: null,
    type: String,
    scope: "world",
    config: false,
    hint: "The UUID of the recap journal that is used to store recaps."
  });

  game.settings.register(MODULENAME, NEW_ITEMS, {
    name: "New Items",
    default: new Set(),
    type: new foundry.data.fields.SetField(new foundry.data.fields.StringField()),
    scope: "world",
    config: false,
    hint: "The UUIDs of newly added items during the session."
  });

  game.settings.register(MODULENAME, REMEMBER_ID, {
    name: "Remember ID",
    default: null,
    type: String,
    scope: "world",
    config: false,
    hint: "The UUID of the remember journal that is used to store things to remember."
  });

  DocumentSheetConfig.registerSheet(JournalEntryPage, MODULENAME, SessionLogSheet, {
    label: "Session Log Sheet",
    makeDefault: false,
    types: ["text"],
  });

  Hooks.on("init", checkForEmptySessionLog);
  Hooks.on("createItem", OnCreateItem);
}
