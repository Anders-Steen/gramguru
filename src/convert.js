// Pure, DOM-free conversion engine. Shared by the content script and the tests.
//
// Philosophy: the world agreed on grams. Everything else is a rounding error.
import { MATPRAT_INGREDIENTS } from "./data.js";
// alias (lowercase) -> definition. Longest aliases win at match time.
const UNITS = {
    // Norwegian household measures
    spiseskje: { key: "tablespoon", generic: 15 },
    spiseskjeer: { key: "tablespoon", generic: 15 },
    spsk: { key: "tablespoon", generic: 15 },
    ss: { key: "tablespoon", generic: 15 },
    teskje: { key: "teaspoon", generic: 5 },
    teskjeer: { key: "teaspoon", generic: 5 },
    tsk: { key: "teaspoon", generic: 5 },
    ts: { key: "teaspoon", generic: 5 },
    desiliter: { key: "deciliter", generic: 100 },
    desilitre: { key: "deciliter", generic: 100 },
    dl: { key: "deciliter", generic: 100 },
    centiliter: { key: "centiliter", generic: 10 },
    cl: { key: "centiliter", generic: 10 },
    milliliter: { key: "milliliter", generic: 1 },
    ml: { key: "milliliter", generic: 1 },
    liter: { key: "liter", generic: 1000 },
    litre: { key: "liter", generic: 1000 },
    l: { key: "liter", generic: 1000 },
    kopper: { key: "cup", generic: 250 },
    kopp: { key: "cup", generic: 250 },
    krus: { key: "cup", generic: 250 },
    glass: { key: "deciliter", mul: 2, generic: 200 },
    skiver: { key: "piece", generic: 30 },
    skive: { key: "piece", generic: 30 },
    stykker: { key: "piece", generic: 100 },
    stykke: { key: "piece", generic: 100 },
    stykk: { key: "piece", generic: 100 },
    stk: { key: "piece", generic: 100 },
    pakker: { key: "piece", generic: 400 },
    pakke: { key: "piece", generic: 400 },
    pk: { key: "piece", generic: 400 },
    never: { key: "piece", generic: 30 },
    neve: { key: "piece", generic: 30 },
    hvitløksfedd: { key: "piece", generic: 5 },
    fedd: { key: "piece", generic: 5 },
    bunter: { key: "piece", generic: 15 },
    bunt: { key: "piece", generic: 15 },
    dusk: { key: "piece", generic: 5 },
    bokser: { key: "piece", generic: 400 },
    boks: { key: "piece", generic: 400 },
    // Imperial units, converted on the way in. Metric does not negotiate.
    tablespoons: { key: "tablespoon", generic: 15, imperial: true },
    tablespoon: { key: "tablespoon", generic: 15, imperial: true },
    tbsp: { key: "tablespoon", generic: 15, imperial: true },
    teaspoons: { key: "teaspoon", generic: 5, imperial: true },
    teaspoon: { key: "teaspoon", generic: 5, imperial: true },
    tsp: { key: "teaspoon", generic: 5, imperial: true },
    cups: { key: "uscup", generic: 236.6, imperial: true },
    cup: { key: "uscup", generic: 236.6, imperial: true },
    ounces: { key: "ounce", generic: 28.35, imperial: true },
    ounce: { key: "ounce", generic: 28.35, imperial: true },
    uncer: { key: "ounce", generic: 28.35, imperial: true },
    unse: { key: "ounce", generic: 28.35, imperial: true },
    oz: { key: "ounce", generic: 28.35, imperial: true },
    pounds: { key: "pound", generic: 453.6, imperial: true },
    pound: { key: "pound", generic: 453.6, imperial: true },
    pund: { key: "pound", generic: 453.6, imperial: true },
    lb: { key: "pound", generic: 453.6, imperial: true },
    gallon: { key: "liter", generic: 3785, imperial: true },
    pints: { key: "milliliter", generic: 473, imperial: true },
    pint: { key: "milliliter", generic: 473, imperial: true },
    quarts: { key: "milliliter", generic: 946, imperial: true },
    quart: { key: "milliliter", generic: 946, imperial: true },
    sticks: { key: "piece", generic: 113, imperial: true },
    stick: { key: "piece", generic: 113, imperial: true },
};
const UNICODE_FRACTIONS = {
    "½": 0.5,
    "¼": 0.25,
    "¾": 0.75,
    "⅓": 1 / 3,
    "⅔": 2 / 3,
    "⅛": 0.125,
    "⅜": 0.375,
    "⅝": 0.625,
    "⅞": 0.875,
};
const DESCRIPTORS = new Set([
    "hel",
    "hele",
    "helt",
    "fersk",
    "ferske",
    "malt",
    "stor",
    "store",
    "liten",
    "lite",
    "små",
    "hakket",
    "revet",
    "kuttet",
    "grov",
    "fin",
    "tørr",
    "tørket",
    "kokt",
    "stekt",
    "saltet",
    "usaltet",
    "økologisk",
    "delt",
    "skåret",
    "most",
    "knust",
    "ren",
    "renset",
    "rød",
    "røde",
    "gul",
    "gule",
    "grønn",
    "grønne",
    "hvit",
    "hvite",
    "svart",
    "sorte",
    "av",
    "med",
    "til",
    "og",
    "eller",
]);
export function normalize(input) {
    return input
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ø/g, "o")
        .replace(/æ/g, "ae")
        .replace(/\([^)]*\)/g, " ")
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function singularForms(word) {
    const out = [];
    for (const suffix of ["ene", "er", "en", "et", "a", "e", "r", "s"]) {
        if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
            out.push(word.slice(0, -suffix.length));
        }
    }
    return out;
}
// All plausible ways a Norwegian word might map back to its dictionary form.
// "gulrøtter" -> "gulrotter" -> "gulroter" -> "gulrot".
function variants(word) {
    const set = new Set([word]);
    set.add(word.replace(/([a-z])\1/g, "$1"));
    for (const w of [...set])
        for (const s of singularForms(w))
            set.add(s);
    return [...set];
}
const INDEX = (() => {
    const map = new Map();
    for (const entry of MATPRAT_INGREDIENTS) {
        const key = normalize(entry.n);
        if (key)
            map.set(key, entry.u);
    }
    return map;
})();
function lookupIngredient(phrase) {
    const norm = normalize(phrase);
    if (!norm)
        return null;
    const words = norm.split(" ").filter(Boolean);
    const candidates = [];
    for (let i = 0; i < words.length; i++)
        candidates.push(words.slice(i).join(" "));
    for (const w of words)
        candidates.push(w);
    const seen = new Set();
    for (const candidate of candidates) {
        if (!candidate)
            continue;
        for (const form of variants(candidate)) {
            if (seen.has(form))
                continue;
            seen.add(form);
            const hit = INDEX.get(form);
            if (hit)
                return { units: hit, name: form };
        }
    }
    return null;
}
function stripDescriptors(phrase) {
    return phrase
        .split(" ")
        .filter((w) => !DESCRIPTORS.has(w))
        .join(" ");
}
export function parseQuantity(raw) {
    const text = raw.trim();
    if (UNICODE_FRACTIONS[text] !== undefined)
        return UNICODE_FRACTIONS[text];
    const fraction = text.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (fraction) {
        const denom = Number(fraction[2]);
        return denom === 0 ? null : Number(fraction[1]) / denom;
    }
    const num = Number(text.replace(",", "."));
    return Number.isFinite(num) ? num : null;
}
export function formatGrams(grams) {
    if (grams >= 1000)
        return `${round(grams / 1000, 2)} kg`;
    if (grams < 1)
        return `${Math.round(grams * 1000)} mg`;
    return `${round(grams, 1)} g`;
}
function round(n, digits) {
    const f = 10 ** digits;
    return Math.round(n * f) / f;
}
const ALIASES = Object.keys(UNITS).sort((a, b) => b.length - a.length);
const UNIT_ALTERNATION = ALIASES.map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
// number (decimal, fraction, or unicode fraction) + unit (+ optional ingredient)
const MATCH_RE = new RegExp(`(?<![\\p{L}\\p{N}])` +
    `(\\d+(?:[.,]\\d+)?|\\d+\\s*/\\s*\\d+|[½¼¾⅓⅔⅛⅜⅝⅞])\\s*` +
    `(${UNIT_ALTERNATION})\\b\\.?`, "giu");
const INGREDIENT_RE = /^[\s]+([\p{L}][\p{L}\p{N}-]*(?:\s+[\p{L}][\p{L}\p{N}-]*){0,3})/u;
export function convertText(text) {
    const matches = [];
    MATCH_RE.lastIndex = 0;
    let m;
    while ((m = MATCH_RE.exec(text)) !== null) {
        const quantity = parseQuantity(m[1]);
        if (quantity === null)
            continue;
        const alias = m[2].toLowerCase();
        const def = UNITS[alias];
        if (!def)
            continue;
        const after = text.slice(m.index + m[0].length);
        const ingredientMatch = after.match(INGREDIENT_RE);
        let ingredientPhrase = ingredientMatch ? ingredientMatch[1] : "";
        // Where the amount+unit part ends and the ingredient phrase (if any) begins.
        const unitEnd = m.index + m[0].length;
        let end = unitEnd;
        if (ingredientMatch)
            end += ingredientMatch[0].length;
        const found = lookupIngredient(ingredientPhrase) ?? lookupIngredient(stripDescriptors(ingredientPhrase));
        let grams;
        let approximate;
        let ingredientName = null;
        if (found && found.units[def.key] !== undefined) {
            grams = quantity * found.units[def.key] * (def.mul ?? 1);
            approximate = false;
            ingredientName = found.name;
        }
        else {
            grams = quantity * def.generic * (def.mul ?? 1);
            approximate = true;
        }
        const metric = formatGrams(grams);
        const note = buildNote({
            rawText: text.slice(m.index, end),
            metric,
            approximate,
            imperial: Boolean(def.imperial),
            ingredientName,
        });
        matches.push({
            start: m.index,
            unitEnd,
            end,
            text: text.slice(m.index, end),
            grams,
            metric,
            quantity,
            unitLabel: m[2],
            unitKey: def.key,
            ingredient: ingredientName,
            approximate,
            imperial: Boolean(def.imperial),
            note,
        });
        MATCH_RE.lastIndex = end;
    }
    return matches;
}
function buildNote(args) {
    const raw = args.rawText.trim();
    if (args.approximate) {
        return `${raw} ≈ ${args.metric} (approx) 🤷`;
    }
    if (args.imperial) {
        return `${raw} = ${args.metric} (exact) 🔪 death to imperialism`;
    }
    return `${raw} = ${args.metric} (exact) 🧐`;
}
