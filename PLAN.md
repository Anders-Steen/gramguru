# GramGuru 🧐 — Plan

A Firefox (Manifest V3) extension that converts Norwegian recipe units
(`ss`, `ts`, `dl`, `kopp`, …) to **grams**, and drags imperial units into the
metric age too. Metric only. No survivors. 📏

> Status: MVP built. See README.md and AGENTS.md.

## Goal

Find cooking units on any web page and annotate them with the equivalent weight
in grams (auto-scaled to mg/g/kg), with a cheeky metric-vs-imperial tone.

## Decisions (locked)

- **Name:** `GramGuru 🧐` (emoji allowed in manifest `name` / AMO listing).
- **UX:** auto-annotate + hover/tap tooltip, **plus a visible marker** so it's
  obvious something happened — dashed underline, a colored `✳` superscript, a
  one-time pulse, and a toolbar count badge.
- **Data source (MVP):** matprat.no only.
  `https://www.matprat.no/api/IngredientMeasurement/GetAllIngredients`
  (needs `Referer: https://www.matprat.no/`) → 1726 ingredients with gram
  weights for `liter, deciliter, centiliter, milliliter, cup, uscup, teaspoon,
  tablespoon, piece, ounce, pound`.
  matvaretabellen.no is the noted **future** fallback:
  `https://www.matvaretabellen.no/api/nb/foods.json` (2121 foods; messy portions).
- **Imperial:** detected and converted too (`oz, lb, fl oz, cup, tbsp, tsp,
  gallon, pint, quart, stick`), with a jab.
- **Unknown ingredient:** assume water density, mark `≈` **and 🤷** `(approx)`.
- **Output:** grams only. Never ml. Ever.
- **Language:** English (README/UI/code).
- **Publishing:** automated via the AMO Submission API v5.

## Engineering constraints

- **No npm dependencies.** npm is broken on the dev machine; use Node built-ins.
- **Node runs TypeScript directly** (v26). `tsc` (~6.0.3) type-checks + emits.
- `.ts` import specifiers in source; `tsc` rewrites to `.js` on build.
- No `enum`/`namespace` (Node type-stripping rejects them).
- Keep the codebase small.

## Architecture

```
manifest.json          MV3 manifest (name "GramGuru 🧐")
content-loader.js      classic content script → dynamic-import dist/content.js
                       (Firefox content scripts can't be ES modules directly)
content.css            inline marker + tooltip styles
popup.html
src/convert.ts         PURE converter (no DOM) — shared by content script + tests
src/data.generated.ts  GENERATED matprat density table (do not edit by hand)
src/content.ts         DOM glue: TreeWalker + MutationObserver + badge count
src/background.ts      sets toolbar badge from content-script count
src/popup.ts           the one switch
src/globals.d.ts       minimal `browser` typings (dependency-free)
scripts/build-data.ts  fetch matprat → src/data.generated.ts
scripts/package.ts     zip runtime files → web-ext-artifacts/
scripts/publish.ts     AMO Submission API v5 upload + publish (JWT via node:crypto)
tests/convert.test.ts  pure unit tests
tests/sites.test.ts    live recipe-page tests (ld+json recipeIngredient)
tests/fixtures/        cached ingredient lists for offline test runs
```

## Conversion engine

1. Parse `number` (decimal comma, `1/2` fractions, `½` unicode) + `unit` +
   optional trailing ingredient phrase.
2. Normalize the ingredient (lowercase, strip diacritics, `ø→o`, `æ→ae`,
   parentheticals, descriptors) and match against the bundled density index:
   exact → suffix n-grams → singular/de-doubled variants.
3. Grams = quantity × per-ingredient unit weight; fall back to a generic
   water-density table (flagged 🤷) when the ingredient or unit is unknown.
4. Scale: `<1 g → mg`, `≥1000 g → kg`.
5. Word-boundary safe; requires a preceding number to avoid false positives.

## Automated tests

- `tests/convert.test.ts` — decimals, fractions, plurals/umlaut
  (`gulrøtter→gulrot`), unknown→🤷, imperial, scaling, and false-positive guards.
- `tests/sites.test.ts` — fetches the real pages, extracts `recipeIngredient`
  from `application/ld+json`, asserts grams. Offline fallback: `tests/fixtures/`.
  - <https://www.matprat.no/oppskrifter/tradisjon/leverpostei/>
  - <https://meny.no/oppskrifter/kylling/helstekt-kylling-med-ovnsbakte-rotgronnsaker>
  - Refresh fixtures: `GRAMGURU_UPDATE_FIXTURES=1 node --test tests/`

## Commands

```bash
node scripts/build-data.ts   # regenerate density table
node scripts/build.ts        # type-check + emit + bundle dist/
node --test tests/           # test suite
node scripts/e2e.ts          # real headless-Firefox end-to-end run
node scripts/package.ts      # build the zip
node scripts/publish.ts      # publish to AMO
```

## Publishing to AMO (TLDR)

1. Create a Mozilla account: <https://accounts.mozilla.org/>
2. DevHub → Submit a New Add-on → **On this site** (listed):
   <https://addons.mozilla.org/developers/>
3. Generate API keys: <https://addons.mozilla.org/developers/addon/api/key/>
4. `export AMO_API_KEY=… AMO_API_SECRET=… AMO_ADDON_ID=gramguru` then
   `tsc -p tsconfig.json && node scripts/package.ts && node scripts/publish.ts`
5. First submission is human-reviewed, then live.
   Guide: <https://extensionworkshop.com/documentation/publish/submitting-an-add-on/>

## Milestones

1. ✅ Scaffold + MIT + README/AGENTS warnings + icons.
2. ✅ `build-data.ts` + `data.generated.ts`.
3. ✅ `convert.ts` + `convert.test.ts` green.
4. ✅ `content.ts` + popup + manifest (temporary-load via `about:debugging`).
5. ✅ `sites.test.ts` green against both recipes.
6. ✅ `package.ts` + `publish.ts` + README publish TLDR.

## Open items

- ✅ Firefox end-to-end check (`scripts/e2e.ts`): installs the real temporary
  add-on over WebDriver BiDi and asserts marks on the test page + both real sites.
- Cross-node matching: recipe sites split units across inline `<span>`s, so the
  content script flattens each leaf block before converting.
- matvaretabellen.no as a secondary data source (future).
