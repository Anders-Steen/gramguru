// Classic content script: Firefox content scripts can't be ES modules
// directly, so we dynamic-import the module version of the content script.
// No build step: these are the same files that ship.
(async () => {
  try {
    await import(browser.runtime.getURL("src/content.js"));
  } catch (err) {
    console.error("[GramGuru] failed to load content script", err);
  }
})();
