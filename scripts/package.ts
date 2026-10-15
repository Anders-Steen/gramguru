// Packages the runtime files into a signed-ready .zip for AMO.
// Run with: node scripts/package.ts   (build first: tsc -p tsconfig.json)

import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as {
  version: string;
};

const outDir = join(root, "web-ext-artifacts");
mkdirSync(outDir, { recursive: true });

const zipPath = join(outDir, `gramguru-${manifest.version}.zip`);
rmSync(zipPath, { force: true });

const runtimeFiles = [
  "manifest.json",
  "content.css",
  "popup.html",
  "dist",
  "icons",
];

execFileSync("zip", ["-r", "-X", zipPath, ...runtimeFiles], {
  cwd: root,
  stdio: "inherit",
});

console.log(`\npackaged -> ${zipPath}`);
