// Builds src/english.js from the USDA FoodData Central "SR Legacy" dataset.
//
// Optional dev tool: the generated file is committed, so this is never needed
// to build or ship. Run with: node scripts/build-english.js
//
// USDA gives, per food, household portions (1 cup / 1 tbsp / 1 oz / 1 lb / ...)
// with their gram weight — the same shape as the matprat table.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ZIP_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip";
const CACHE = join(tmpdir(), "gramguru-usda.zip");
const WORK = join(tmpdir(), "gramguru-usda");
const OUT = new URL("../src/english.js", import.meta.url);

const UNIT_KEYS = ["uscup", "tablespoon", "teaspoon", "ounce", "pound", "milliliter", "liter", "piece"];
const WANT_KEYS = ["uscup", "tablespoon", "teaspoon", "ounce", "pound", "piece"];
const STOP = new Set([
  "raw", "cooked", "frozen", "canned", "dried", "enriched", "fortified", "bleached",
  "unprepared", "prepared", "ready-to-eat", "roasted", "boiled", "baked", "grilled",
  "fried", "sliced", "chopped", "diced", "whole", "fresh", "salted", "unsalted",
  "dry", "wet", "solid", "liquid", "ns as to", "with salt", "without salt",
  "includes", "all varieties", "not further specified", "nfs",
]);

function cleanKey(segment) {
  const s = segment.replace(/\s+/g, " ").trim();
  if (s.length < 3 || s.length > 60) return null;
  if (s.startsWith("(") || /\d/.test(s) || !/[a-z]/i.test(s)) return null;
  if (STOP.has(s.toLowerCase())) return null;
  return s;
}

function dataKeys(modifier) {
  const m = modifier.toLowerCase().trim();
  if (!m) return null;
  if (m.startsWith("cup")) return "uscup";
  if (m === "tbsp" || m.startsWith("tablespoon")) return "tablespoon";
  if (m === "tbs") return "tablespoon";
  if (m === "tsp" || m.startsWith("teaspoon")) return "teaspoon";
  if (m === "oz" || m === "ounce" || m === "ounces") return "ounce";
  if (m === "lb" || m === "pound" || m === "pounds") return "pound";
  if (m === "ml" || m === "milliliter") return "milliliter";
  if (m === "l" || m === "liter") return "liter";
  if (/^(slice|piece|medium|large|small|unit|fillet|bar|can|jar|stalk|clove|whole|each|item|serving|bunch|head|leaf|leaves|sprig|link|patty|strip|wedge|spear|ear|cube|ball|cookie|cracker|chip|nugget)/.test(m))
    return "piece";
  return null;
}

// Minimal CSV parser (handles quoted fields and embedded newlines).
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function table(rows) {
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

async function main() {
  if (!existsSync(CACHE)) {
    console.log("downloading USDA SR Legacy ...");
    const res = await fetch(ZIP_URL);
    if (!res.ok) throw new Error(`download ${res.status}`);
    writeFileSync(CACHE, Buffer.from(await res.arrayBuffer()));
  }
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  execFileSync("unzip", ["-o", "-q", CACHE, "-d", WORK]);

  const dir = join(WORK, "FoodData_Central_sr_legacy_food_csv_2018-04");
  const foods = table(parseCsv(readFileSync(join(dir, "food.csv"), "utf8")));
  const portions = table(parseCsv(readFileSync(join(dir, "food_portion.csv"), "utf8")));

  const names = new Map(foods.map((f) => [f.fdc_id, (f.description || "").trim()]));
  const perFood = new Map(); // fdc_id -> { key: gramsPerUnit }
  for (const p of portions) {
    const key = dataKeys(p.modifier || "");
    if (!key) continue;
    const amount = Number(p.amount) || 1;
    const grams = Number(p.gram_weight);
    if (!Number.isFinite(grams) || grams <= 0) continue;
    const perUnit = Math.round((grams / amount) * 100) / 100;
    const units = perFood.get(p.fdc_id) ?? {};
    if (units[key] === undefined) units[key] = perUnit;
    perFood.set(p.fdc_id, units);
  }

  // One key per food's cleaned name segments; keep the candidate with the most
  // useful units when several foods map to the same key (e.g. many "flour"s).
  const best = new Map();
  // Prefer entries measured by volume (cups/tbsp/tsp) — how recipes actually use
  // these — over weight-only or odd piece weights.
  const score = (units) =>
    (units.uscup ? 8 : 0) +
    (units.tablespoon ? 4 : 0) +
    (units.teaspoon ? 2 : 0) +
    (units.ounce ? 1 : 0) +
    (units.pound ? 1 : 0);
  for (const [id, units] of perFood) {
    if (!Object.keys(units).some((k) => UNIT_KEYS.includes(k))) continue;
    const name = names.get(id);
    if (!name) continue;
    for (const segment of name.split(",")) {
      const key = cleanKey(segment);
      if (!key) continue;
      const norm = key.toLowerCase();
      const prev = best.get(norm);
      if (!prev || score(units) > score(prev.u)) best.set(norm, { n: key, u: units });
    }
  }

  const entries = [...best.values()].sort((a, b) => a.n.localeCompare(b.n));
  const banner = [
    "// English ingredient table from USDA FoodData Central (SR Legacy).",
    "// Household-portion gram weights per unit. Generated by scripts/build-english.js.",
    `// ${entries.length} entries.`,
    "",
  ].join("\n");
  writeFileSync(OUT, `${banner}export const ENGLISH_INGREDIENTS = ${JSON.stringify(entries)};\n`);
  console.log(`wrote ${OUT.pathname} — ${entries.length} entries (${((banner.length + JSON.stringify(entries).length) / 1024).toFixed(0)} KB)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
