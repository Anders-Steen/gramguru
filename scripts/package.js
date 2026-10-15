// Packages the extension into a signed-ready .zip for AMO.
//
//   node scripts/package.js          # stable (listed) build — uses manifest.json
//   node scripts/package.js --beta   # beta channel build — same code, but a
//                                    # distinct add-on id + "GramGuru Beta" name
//
// No build step: the runtime files ship as-is. The beta variant only swaps the
// manifest metadata (id, name, version) so it registers as a separate add-on.
//
// Beta overrides (env): BETA_ADDON_ID, BETA_VERSION, BETA_UPDATE_URL.

import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const outDir = join(root, "web-ext-artifacts");
mkdirSync(outDir, { recursive: true });

const runtimeFiles = [
  "manifest.json",
  "content-loader.js",
  "content.css",
  "popup.html",
  "src",
  "icons",
];

const beta = process.argv.includes("--beta");

if (!beta) {
  const zipPath = join(outDir, `gramguru-${manifest.version}.zip`);
  rmSync(zipPath, { force: true });
  execFileSync("zip", ["-r", "-X", zipPath, ...runtimeFiles], {
    cwd: root,
    stdio: "inherit",
  });
  console.log(`\npackaged -> ${zipPath}`);
} else {
  const BETA_ID = process.env.BETA_ADDON_ID ?? "gramguru-beta@anderss";
  const BETA_VERSION = process.env.BETA_VERSION ?? "0.1.3";
  const staging = mkdtempSync(join(tmpdir(), "gramguru-beta-"));
  try {
    for (const file of runtimeFiles) {
      if (file === "manifest.json") continue;
      cpSync(join(root, file), join(staging, file), { recursive: true });
    }

    const gecko = { ...manifest.browser_specific_settings.gecko, id: BETA_ID };
    if (process.env.BETA_UPDATE_URL) gecko.update_url = process.env.BETA_UPDATE_URL;

    const betaManifest = {
      ...manifest,
      name: "GramGuru Beta 🧐",
      version: BETA_VERSION,
      browser_specific_settings: { ...manifest.browser_specific_settings, gecko },
    };
    writeFileSync(
      join(staging, "manifest.json"),
      JSON.stringify(betaManifest, null, 2) + "\n",
    );

    const zipPath = join(outDir, `gramguru-beta-${BETA_VERSION}.zip`);
    rmSync(zipPath, { force: true });
    execFileSync("zip", ["-r", "-X", zipPath, "."], {
      cwd: staging,
      stdio: "inherit",
    });
    console.log(`\npackaged beta -> ${zipPath}`);
    console.log(`  add-on id: ${BETA_ID}`);
    console.log(`  version:   ${BETA_VERSION}`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
