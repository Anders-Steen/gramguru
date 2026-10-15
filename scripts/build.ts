// Builds dist/. Runs tsc, then flattens the content ES module (and its static
// imports) into a single classic script, because Firefox content scripts
// cannot be ES modules.
//
// Run with: node scripts/build.ts

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));

console.log("tsc -p tsconfig.json");
execFileSync("tsc", ["-p", "tsconfig.json"], { cwd: root, stdio: "inherit" });

const entry = join(root, "dist", "content.js");
const seen = new Set<string>();
const chunks: string[] = [];

const IMPORT_RE = /^[ \t]*import\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["'];?[ \t]*$/gm;

function inline(file: string): void {
  const abs = resolve(file);
  if (seen.has(abs)) return;
  seen.add(abs);

  let src = readFileSync(abs, "utf8");
  const deps: string[] = [];
  let match: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(src))) deps.push(match[1]);

  for (const dep of deps) {
    if (!dep.startsWith(".")) {
      throw new Error(`unexpected bare import "${dep}" in ${abs}`);
    }
    inline(join(dirname(abs), dep));
  }

  src = src.replace(IMPORT_RE, "");
  src = src.replace(/^export\s+/gm, "");
  chunks.push(`// ---- ${abs.replace(root + "/", "")} ----\n${src.trim()}\n`);
}

inline(entry);
writeFileSync(entry, chunks.join("\n"));
console.log(`bundled -> dist/content.js (${chunks.length} modules inlined)`);
