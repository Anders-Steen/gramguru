// Packages the runtime files into a signed-ready .zip for AMO.
// Run with: node scripts/package.js   (no build step — ships src/ as-is)
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const outDir = join(root, "web-ext-artifacts");
mkdirSync(outDir, { recursive: true });
const zipPath = join(outDir, `gramguru-${manifest.version}.zip`);
rmSync(zipPath, { force: true });
const runtimeFiles = [
    "manifest.json",
    "content-loader.js",
    "content.css",
    "popup.html",
    "src",
    "icons",
];
execFileSync("zip", ["-r", "-X", zipPath, ...runtimeFiles], {
    cwd: root,
    stdio: "inherit",
});
console.log(`\npackaged -> ${zipPath}`);
