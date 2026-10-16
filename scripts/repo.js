// Where the beta add-on's files are hosted. Self-distributed (unlisted) add-ons
// carry an `update_url` in the manifest pointing at updates.json; both that file
// and the signed XPI are published as assets on the GitHub Release tagged
// `beta` (prerelease). The manifest `version` must stay numeric (MV3 forbids
// letters); the "-b" lives in the GitHub tag/release.
export const REPO = process.env.GITHUB_REPOSITORY ?? "Anders-Steen/gramguru";
export const BETA_TAG = process.env.BETA_TAG ?? "beta";
export const RELEASES_URL = `https://github.com/${REPO}/releases/download/${BETA_TAG}`;
export const UPDATES_URL = `${RELEASES_URL}/updates.json`;
export const BETA_XPI_URL = `${RELEASES_URL}/gramguru-beta.xpi`;
