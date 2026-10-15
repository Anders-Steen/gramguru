// Refreshes src/data.js from the matprat.no ingredient-measurement API.
//
// Optional dev tool: the data file is committed, so running this is never
// required to build or ship the extension.
//
//   node scripts/build-data.js
//
// The API returns, per ingredient, the weight in grams of one unit
// (deciliter, tablespoon, ounce, ...) — exactly the density table we need to
// turn "3 ss hvetemel" into grams.

import { writeFileSync } from "node:fs";

const API = "https://www.matprat.no/api/IngredientMeasurement/GetAllIngredients";
const OUT = new URL("../src/data.js", import.meta.url);

const KEEP_UNITS = [
  "liter",
  "deciliter",
  "centiliter",
  "milliliter",
  "cup", // Norwegian "kopp"
  "uscup", // American "kopp"
  "teaspoon", // ts
  "tablespoon", // ss
  "piece", // stk.
  "ounce", // unse
  "pound", // pund
];

const round = (n) => Math.round(n * 100) / 100;

async function main() {
  const res = await fetch(API, {
    headers: { Referer: "https://www.matprat.no/", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`matprat API responded ${res.status}`);

  const rows = await res.json();
  const ingredients = [];
  let keptUnits = 0;

  for (const row of rows) {
    const name = (row.name ?? "").trim().toLowerCase();
    if (!name) continue;
    const u = {};
    for (const key of KEEP_UNITS) {
      const info = row.units?.[key];
      if (!info || typeof info.weight !== "number" || info.weight <= 0) continue;
      u[key] = round(info.weight);
    }
    if (Object.keys(u).length === 0) continue;
    keptUnits += Object.keys(u).length;
    ingredients.push({ n: name, u });
  }

  const banner = [
    "// Ingredient density table: grams per unit, per ingredient.",
    "// Data source: https://www.matprat.no/api/IngredientMeasurement/GetAllIngredients",
    `// Refreshed: ${new Date().toISOString()} — ${
      ingredients.length
    } ingredients, ${keptUnits} unit weights.`,
    "// Refresh with: node scripts/build-data.js (data file is committed; not a build step).",
    "",
  ].join("\n");

  const body = `export const MATPRAT_INGREDIENTS = ${JSON.stringify(ingredients)};\n`;

  writeFileSync(OUT, banner + body);
  console.log(
    `wrote ${OUT.pathname} — ${ingredients.length} ingredients (${(
      (banner.length + body.length) /
      1024
    ).toFixed(0)} KB)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
