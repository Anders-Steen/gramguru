// Sets the toolbar badge to the number of conversions on the active page.
// Classic script (no imports) — loaded directly by the manifest.

browser.runtime.onMessage.addListener((message, sender) => {
  const msg = message as { type?: string; count?: number } | null;
  if (!msg || msg.type !== "gg-count") return;
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;

  const count = typeof msg.count === "number" ? msg.count : 0;
  void browser.action.setBadgeText({
    tabId,
    text: count > 0 ? String(count) : "",
  });
  if (count > 0) {
    void browser.action.setBadgeBackgroundColor({ tabId, color: "#2e7d32" });
  }
});
