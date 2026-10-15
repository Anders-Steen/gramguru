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

- **Plain JavaScript, no build step.** The files that ship are the source, so the
  AMO answer to "do you use build tools?" is **No**.
- **No npm dependencies.** Use Node built-ins only.
- ES modules with explicit `.js` import specifiers.
- Keep the codebase small.

## Architecture

```
manifest.json          MV3 manifest (name "GramGuru 🧐")
content-loader.js      classic content script → dynamic-import src/content.js
                       (Firefox content scripts can't be ES modules directly)
content.css            inline marker + tooltip styles
popup.html
src/convert.js         PURE converter (no DOM) — shared by content script + tests
src/data.js            Committed matprat density table (plain data)
src/content.js         DOM glue: TreeWalker + MutationObserver + badge count
src/background.js      sets toolbar badge from content-script count
src/popup.js           the one switch
scripts/build-data.js  optional: fetch matprat → src/data.js
scripts/package.js     zip runtime files → web-ext-artifacts/
scripts/publish.js     AMO Submission API v5 upload + publish (JWT via node:crypto)
tests/convert.test.js  pure unit tests
tests/sites.test.js    live recipe-page tests (ld+json recipeIngredient)
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

- `tests/convert.test.js` — decimals, fractions, plurals/umlaut
  (`gulrøtter→gulrot`), unknown→🤷, imperial, scaling, and false-positive guards.
- `tests/sites.test.js` — fetches the real pages, extracts `recipeIngredient`
  from `application/ld+json`, asserts grams. Offline fallback: `tests/fixtures/`.
  - <https://www.matprat.no/oppskrifter/tradisjon/leverpostei/>
  - <https://meny.no/oppskrifter/kylling/helstekt-kylling-med-ovnsbakte-rotgronnsaker>
  - Refresh fixtures: `GRAMGURU_UPDATE_FIXTURES=1 node --test tests/`

## Commands

```bash
node --test tests/           # test suite
node scripts/e2e.js          # real headless-Firefox end-to-end run
node scripts/package.js      # build the zip
node scripts/publish.js      # publish to AMO
node scripts/build-data.js   # optional: refresh the density table
```

## Publishing to AMO (TLDR)

1. Create a Mozilla account: <https://accounts.mozilla.org/>
2. DevHub → Submit a New Add-on → **On this site** (listed):
   <https://addons.mozilla.org/developers/>
3. Generate API keys: <https://addons.mozilla.org/developers/addon/api/key/>
4. `export AMO_API_KEY=… AMO_API_SECRET=… AMO_ADDON_ID=gramguru` then
   `node scripts/package.js && node --env-file=.env scripts/publish.js`
5. First submission is human-reviewed, then live.
   Guide: <https://extensionworkshop.com/documentation/publish/submitting-an-add-on/>

## Milestones

1. ✅ Scaffold + MIT + README/AGENTS warnings + icons.
2. ✅ `build-data.js` + `src/data.js`.
3. ✅ `convert.js` + `convert.test.js` green.
4. ✅ `content.js` + popup + manifest (temporary-load via `about:debugging`).
5. ✅ `sites.test.js` green against both recipes.
6. ✅ `package.js` + `publish.js` + README publish TLDR.
7. ✅ Converted the whole project to plain JavaScript (no build step).

## Open items

- ✅ Firefox end-to-end check (`scripts/e2e.js`): installs the real temporary
  add-on over WebDriver BiDi and asserts marks on the test page + both real sites.
- Cross-node matching: recipe sites split units across inline `<span>`s, so the
  content script flattens each leaf block before converting.
- matvaretabellen.no as a secondary data source (future).
