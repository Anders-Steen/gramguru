// Single source of truth for the public location of the extension's files
// (beta XPIs + the update manifest). Shared by package.js and publish.js.
// Override with REPO_RAW_BASE if you fork/host elsewhere.
export const REPO_RAW_BASE =
  process.env.REPO_RAW_BASE ?? "https://raw.githubusercontent.com/Anders-Steen/gramguru/main";
export const UPDATES_URL = `${REPO_RAW_BASE}/updates.json`;
