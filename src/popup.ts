// Popup: one switch. On = grams. Off = the imperial system wins, briefly.

const checkbox = document.getElementById("enabled") as HTMLInputElement | null;
const statusEl = document.getElementById("status");

function render(enabled: boolean): void {
  if (checkbox) checkbox.checked = enabled;
  if (statusEl) {
    statusEl.textContent = enabled
      ? "On. Grams for everyone. 🧐"
      : "Paused. The imperialists celebrate. 🇺🇸";
  }
}

async function init(): Promise<void> {
  const { enabled = true } = await browser.storage.local.get("enabled");
  render(Boolean(enabled));

  checkbox?.addEventListener("change", async () => {
    const next = checkbox.checked;
    await browser.storage.local.set({ enabled: next });
    render(next);
  });
}

init().catch((err) => console.error("[GramGuru]", err));
