"use strict";
// Popup: one switch. On = grams. Off = the imperial system wins, briefly.
const checkbox = document.getElementById("enabled");
const statusEl = document.getElementById("status");
function render(enabled) {
  if (checkbox) checkbox.checked = enabled;
  if (statusEl) {
    statusEl.textContent = enabled
      ? "On. Grams for everyone. 🧐"
      : "Paused. The imperialists celebrate. 🇺🇸";
  }
}
async function init() {
  const { enabled = true } = await browser.storage.local.get("enabled");
  render(Boolean(enabled));
  checkbox?.addEventListener("change", async () => {
    const next = checkbox.checked;
    await browser.storage.local.set({ enabled: next });
    render(next);
  });
}
init().catch((err) => console.error("[GramGuru]", err));
