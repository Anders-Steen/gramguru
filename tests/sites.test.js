// End-to-end-ish tests: pull real recipe pages, extract their schema.org
// recipeIngredient list, run the converter on every line, and verify the
// Norwegian kitchen survives the encounter with metric.
//
// Live by default. If the network is unavailable, cached fixtures under
// tests/fixtures/ are used. Refresh them with: GRAMGURU_UPDATE_FIXTURES=1 node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { convertText } from "../src/convert.js";
const FIXTURES = new URL("./fixtures/", import.meta.url);
const UA = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";
const SITES = {
    leverpostei: "https://www.matprat.no/oppskrifter/tradisjon/leverpostei/",
    kylling: "https://meny.no/oppskrifter/kylling/helstekt-kylling-med-ovnsbakte-rotgronnsaker",
};
function extractRecipeIngredients(html) {
    const out = [];
    const blocks = html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
    const walk = (node) => {
        if (!node)
            return;
        if (Array.isArray(node))
            return node.forEach(walk);
        if (typeof node !== "object")
            return;
        const obj = node;
        if (obj["@type"] === "Recipe" &&
            Array.isArray(obj.recipeIngredient)) {
            out.push(...obj.recipeIngredient);
        }
        for (const value of Object.values(obj))
            walk(value);
    };
    for (const block of blocks) {
        try {
            walk(JSON.parse(block[1].trim()));
        }
        catch {
            /* ignore malformed blocks */
        }
    }
    return out;
}
async function loadIngredients(slug, url) {
    const fixture = new URL(`${slug}.json`, FIXTURES);
    try {
        const res = await fetch(url, { headers: { "User-Agent": UA } });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const list = extractRecipeIngredients(await res.text());
        if (list.length === 0)
            throw new Error("no recipe ingredients found");
        if (process.env.GRAMGURU_UPDATE_FIXTURES === "1") {
            mkdirSync(FIXTURES, { recursive: true });
            writeFileSync(fixture, JSON.stringify(list, null, 2) + "\n");
        }
        return list;
    }
    catch (err) {
        if (existsSync(fixture)) {
            return JSON.parse(readFileSync(fixture, "utf8"));
        }
        throw err;
    }
}
function convertAll(lines) {
    return lines.map((line) => ({ line, matches: convertText(line) }));
}
function metricFor(results, needle) {
    const hit = results.find((r) => r.line.includes(needle));
    assert.ok(hit, `no ingredient line containing ${JSON.stringify(needle)}`);
    return hit.matches.map((m) => m.metric);
}
test("matprat leverpostei converts", async () => {
    const results = convertAll(await loadIngredients("leverpostei", SITES.leverpostei));
    const convertible = results.filter((r) => r.matches.length > 0);
    assert.equal(convertible.length, 9);
    assert.deepEqual(metricFor(results, "3 ss hvetemel"), ["27 g"]);
    assert.deepEqual(metricFor(results, "1,5 dl melk"), ["150 g"]);
    assert.deepEqual(metricFor(results, "1,5 ts salt"), ["10.5 g"]);
    assert.deepEqual(metricFor(results, "0,5 ts pepper"), ["1.3 g"]);
    console.log("\n[leverpostei]");
    for (const r of results) {
        console.log(`  ${r.matches.length ? "✔" : " "} ${JSON.stringify(r.line)} -> ` +
            (r.matches.map((m) => m.metric).join(", ") || "(metric-free)"));
    }
});
test("meny roast chicken converts", async () => {
    const results = convertAll(await loadIngredients("kylling", SITES.kylling));
    const convertible = results.filter((r) => r.matches.length > 0);
    assert.equal(convertible.length, 10);
    assert.deepEqual(metricFor(results, "1 stk hel kylling"), ["1.5 kg"]);
    assert.deepEqual(metricFor(results, "3 stk gulrøtter"), ["270 g"]);
    assert.deepEqual(metricFor(results, "2 dl hvitvin"), ["200 g"]);
    assert.deepEqual(metricFor(results, "3 dl kyllingkraft"), ["300 g"]);
    console.log("\n[kylling]");
    for (const r of results) {
        console.log(`  ${r.matches.length ? "✔" : " "} ${JSON.stringify(r.line)} -> ` +
            (r.matches.map((m) => m.metric).join(", ") || "(metric-free)"));
    }
});
