/*
 * Connects the Script Room to the site's sidebar. The page's own top bar stays
 * in the document, hidden, so its code keeps working. This file reports what
 * that bar shows and clicks its buttons when the sidebar asks.
 */
(() => {
  const STATE = "script-room-state";
  const COMMAND = "script-room-command";
  const TOOLS = new Set(["teachBtn", "dataBtn", "newBtn"]);

  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent =
      ".rail{height:0!important;min-height:0!important;padding:0!important;border:0!important;overflow:hidden;visibility:hidden}";
    document.head.append(style);

    const byId = (id) => document.getElementById(id);
    const sections = () => [...document.querySelectorAll("#railNav .nav-item")];

    const snapshot = () => ({
      type: STATE,
      room: document.querySelector('#roomMenu [aria-checked="true"]')?.dataset.room === "mof" ? "mof" : "tof",
      agent: document.querySelector(".ag-name")?.textContent || "Thirdy",
      busy: Boolean(byId("newBtn")?.disabled),
      sections: sections().map((item) => ({
        label: item.querySelector("span:not(.nav-ic):not(.nav-n)")?.textContent || "",
        count: item.querySelector(".nav-n")?.textContent || "",
        current: item.getAttribute("aria-current") === "page",
        disabled: item.disabled,
      })),
    });

    const closePanels = () => {
      byId("teachClose")?.click();
      document.querySelectorAll(".obs-modal, .obs-scrim").forEach((node) => node.remove());
    };

    let last = "";
    const report = () => {
      const state = snapshot();
      const json = JSON.stringify(state);
      if (json === last) return;
      last = json;
      window.parent.postMessage(state, location.origin);
    };

    new MutationObserver(report).observe(byId("rail"), {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });

    window.addEventListener("message", (event) => {
      if (event.origin !== location.origin || event.source !== window.parent) return;
      const { type, action, index, room, id, theme } = event.data || {};
      if (type !== COMMAND) return;
      if (action === "hello") {
        last = "";
        report();
      }
      if (action === "theme") document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
      // The sidebar sits outside this page's dim background, so it stays
      // clickable while a panel is open. Moving somewhere else closes the panel.
      if (action === "close" || action === "section" || action === "room" || id === "newBtn") closePanels();
      if (action === "section") sections()[index]?.click();
      if (action === "room") document.querySelector('#roomMenu [data-room="' + room + '"]')?.click();
      if (action === "tool" && TOOLS.has(id)) byId(id)?.click();
    });

    report();
  });
})();
