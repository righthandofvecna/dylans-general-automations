import { MODULENAME } from "../utils.mjs";



/**
 * Add the puzzle button to the RegionConfig page
 * @param {*} regionConfig 
 * @param {*} html 
 */
async function OnRenderRegionConfig(regionConfig, html) {
  const regionScripts = game.modules.get(MODULENAME).api.regionScripts;
  if (!regionScripts || Object.keys(regionScripts).length === 0) return;

  const behaviorControls = html.querySelector(".region-element.region-behavior .region-element-controls");
  if (behaviorControls.querySelector(".region-control.puzzle-control")) return;
  const puzzleLink = document.createElement("a");
  puzzleLink.classList = "region-control puzzle-control";
  puzzleLink.setAttribute("data-tooltip", "Automatic Behaviors");
  puzzleLink.setAttribute("aria-label", "Automatic Behaviors");
  const puzzleIcon = document.createElement("i");
  puzzleIcon.classList = "fa-solid fa-puzzle-piece";
  puzzleLink.appendChild(puzzleIcon);
  behaviorControls.appendChild(puzzleLink);

  puzzleLink.addEventListener("click", async function (event) {
    event.preventDefault();
    const options = Object.entries(regionScripts).reduce((o, [k, v])=>o+`<option value="${k}">${v.label}</option>`, "");
    const option = await new Promise(async (resolve)=>{
      foundry.applications.api.DialogV2.wait({
        window: { title: 'Create Automatic Behavior' },
        content: `
            <div class="form-group">
              <label for="behavior">Behavior</label>
              <select name="behavior">${options}</select>
            </div>
        `,
        buttons: [{
          action: "ok",
          label: "OK",
          default: true,
          callback: (event, button, dialog) => resolve(button.form.elements.behavior?.value ?? null),
        }],
        close: () => resolve(null),
      }).catch(()=>{
        resolve(null);
      });
    });

    if (!option || !(option in regionScripts)) return;

    await regionScripts[option].callback(regionConfig);
  });
}


export function register() {
  Hooks.on("renderRegionConfig", OnRenderRegionConfig);
}
