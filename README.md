# GramGuru 🧐

> **⚠️ VIBE-CODED ⚠️**
> This extension was written largely by an AI, late, while its human watched a
> movie and muttered "ss… but how many *grams*?" Treat it like a friendly
> labradoodle: delightful, mostly harmless, occasionally eats your slippers.
> Review before you trust it with your grandmother's kjøttkaker. 🍖

Converts Norwegian recipe units to **grams**. That's it. That's the whole idea.

`3 ss hvetemel` ➜ `27 g` · `1,5 dl melk` ➜ `150 g` · `1 pk aspill` ➜ `400 g 🤷`

It also drags imperial units, kicking and screaming, into the metric age:
`8 oz smør` ➜ `226.8 g 🔪 death to imperialism`.

## Why grams? 📏

Because the metric system is what happens when a civilization sits down and
says *"let's use powers of ten."* Meanwhile a "cup" of flour is 120 g, a "cup"
of water is 236 g, and a "cup" of your sanity is gone. 🫠

So: everything becomes grams. Kilograms when it's a lot. Milligrams when it's
homeopathy. Never ounces. Never ever cups. (We convert *from* them, out of
pity. 🇺🇸)

## What it actually does

- 🔎 Finds units like **ss, ts, dl, cl, ml, l, kopp, glass, skive, stk, pk,
  neve, fedd, bunt, boks** — plus imperial **oz, lb, fl oz, cup, tbsp, tsp,
  gallon, pint, quart**.
- 🧮 Looks up real per-ingredient densities from
  [matprat.no](https://www.matprat.no/) so `3 ss hvetemel` ≠ `3 ss sukker`.
- ✳️ Marks every conversion inline with a dashed underline, a colored asterisk,
  and a one-time pulse — so you *definitely* notice something happened.
- 🖱️ Hover (or tap) a mark to see `27 g (exact) 🧐` or `30 g (approx) 🤷`.
- 🔢 Shows a count badge on the toolbar icon.
- 🔌 **Zero network calls.** The density table is bundled. Your recipes stay
  yours. 🕵️

## Example output

| On the page | GramGuru |
| --- | --- |
| `3 ss hvetemel` | `27 g` |
| `1,5 dl melk` | `150 g` |
| `0,5 ts pepper` | `1.3 g` |
| `3 stk gulrøtter` | `270 g` |
| `2 ss` (no ingredient, so: shrug) | `30 g (approx) 🤷` |
| `8 oz smør` | `226.8 g (exact) 🔪 death to imperialism` |

## Install (development)

1. Firefox ➜ `about:debugging#/runtime/this-firefox` ➜ **Load Temporary Add-on…**
2. Pick `manifest.json` in this folder. Done. 🎉

No build step — the files that ship are the source. Plain JavaScript. 🍦

## Development

No npm, no bundler, no transpiler, no TypeScript. Just Node ≥ 20 and plain ES
modules that run as-is.

```bash
node --test tests/           # unit + (optionally live) recipe tests
node scripts/e2e.js          # REAL end-to-end run in headless Firefox
node scripts/package.js      # zip the extension into web-ext-artifacts/
node scripts/build-data.js   # optional: refresh src/data.js from matprat.no
```

`node --test` fetches the real recipe pages and asserts the conversions. Offline?
It falls back to cached fixtures in `tests/fixtures/`. Refresh fixtures with
`GRAMGURU_UPDATE_FIXTURES=1 node --test tests/`.

`node scripts/e2e.js` is the honest test: it launches headless Firefox, installs
the extension as a temporary add-on over WebDriver BiDi (the same mechanism
`about:debugging` uses), and checks the actually-injected marks on the local test
kitchen plus both real recipe sites. Results are printed per site. 🧪

Need Firefox on your PATH (it is, if `firefox --version` works). Real-site
checks need network; the local `devtest/testpage.html` does not.

## Publish to addons.mozilla.org (AMO) 🚀

**TL;DR:**

1. Create a Mozilla account: <https://accounts.mozilla.org/>
2. Open the Developer Hub: <https://addons.mozilla.org/developers/> ➜
   **Submit a New Add-on** ➜ choose **On this site** (listed).
3. Generate API keys: <https://addons.mozilla.org/developers/addon/api/key/>
4. Export them and publish:
   ```bash
   node scripts/package.js          # or: npm run package
   node --env-file=.env scripts/publish.js
   ```
5. First submission gets human-reviewed, then it's live. 🧐

Full guide: <https://extensionworkshop.com/documentation/publish/submitting-an-add-on/>

> The publish script uses the AMO Submission API v5 with a JWT. Creating the
> very first listing needs that one manual DevHub step; after that, uploads are
> scripted.

## Privacy

GramGuru has no analytics, no telemetry, and makes no network requests at
runtime. The ingredient densities ship inside the extension, sourced from
matprat.no. The manifest declares this honestly:
`browser_specific_settings.gecko.data_collection_permissions.required = ["none"]`
(required by AMO for all new extensions). See the source; it's small. 🔍

## License

MIT — see [LICENSE](./LICENSE). Made with 🇳🇴 and a deep distrust of fluid ounces. 🧐
