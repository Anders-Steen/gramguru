// Pure, DOM-free conversion engine. Shared by the content script and the tests.
//
// Philosophy: the world agreed on grams. Everything else is a rounding error.
import { MATPRAT_INGREDIENTS } from "./data.js";
import { ENGLISH_INGREDIENTS } from "./english.js";
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
    gallon: { key: "liter", generic: 3785, imperial: true, genericOnly: true },
    pints: { key: "milliliter", generic: 473, imperial: true, genericOnly: true },
    pint: { key: "milliliter", generic: 473, imperial: true, genericOnly: true },
    quarts: { key: "milliliter", generic: 946, imperial: true, genericOnly: true },
    quart: { key: "milliliter", generic: 946, imperial: true, genericOnly: true },
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
    // English names -> Norwegian entries, so international recipes resolve too.
    const ENGLISH_ALIASES = {
        "all purpose flour": "hvetemel",
        "all-purpose flour": "hvetemel",
        "plain flour": "hvetemel",
        "bread flour": "hvetemel",
        flour: "hvetemel",
        sugar: "sukker",
        "brown sugar": "sukker",
        "caster sugar": "sukker",
        "granulated sugar": "sukker",
        butter: "smør",
        "unsalted butter": "smør",
        milk: "melk",
        egg: "egg",
        eggs: "egg",
        salt: "salt",
        pepper: "pepper",
        water: "vann",
        honey: "honning",
        cream: "fløte",
        "heavy cream": "fløte",
        "double cream": "fløte",
        "baking powder": "bakepulver",
        "baking soda": "natron",
        "cocoa powder": "kakaopulver",
        cocoa: "kakaopulver",
        vanilla: "vanilje",
        "vanilla extract": "vanilje",
        oats: "havregryn",
        oatmeal: "havregryn",
        rice: "ris",
        breadcrumbs: "brødsmuler",
        "olive oil": "olivenolje",
        oil: "olje",
        yeast: "gjær",
        onion: "løk",
        garlic: "hvitløk",
        carrot: "gulrot",
        potato: "potet",
        potatoes: "potet",
        tomato: "tomat",
        "tomato paste": "tomatpuré",
        "chicken stock": "kyllingkraft",
        "chicken broth": "kyllingkraft",
        "vegetable stock": "grønnsakskraft",
        "beef stock": "oksekraft",
        "soy sauce": "soyasaus",
        mustard: "sennep",
        cornstarch: "maisenna",
        cornflour: "maisenna",
        "sharp cheddar": "ost",
        cheddar: "ost",
        cheese: "ost",
        parmesan: "parmesan",
        parmigiano: "parmesan",
        mozzarella: "mozzarella",
        "half and half": "fløte",
        "half-and-half": "fløte",
        "whipping cream": "fløte",
        parsley: "persille",
        "green onion": "vårløk",
        "spring onion": "vårløk",
        scallion: "vårløk",
        scallions: "vårløk",
        "bell pepper": "paprika",
        "red pepper flakes": "chiliflak",
        "chili flakes": "chiliflak",
        spinach: "spinat",
        prawns: "reker",
        prawn: "reker",
        shrimp: "reker",
        "ground beef": "kjøttdeig",
        "minced beef": "kjøttdeig",
        chicken: "kylling",
        "chicken breast": "kyllingfilet",
        "chicken breasts": "kyllingfilet",
        zucchini: "squash",
        courgette: "squash",
        mushrooms: "sjampinjong",
        mushroom: "sjampinjong",
    };
    for (const [en, no] of Object.entries(ENGLISH_ALIASES)) {
        const target = map.get(normalize(no));
        if (target)
            map.set(normalize(en), target);
    }
    // USDA English table fills the gaps (curated aliases and matprat win).
    for (const entry of ENGLISH_INGREDIENTS) {
        const key = normalize(entry.n);
        if (key && !map.has(key))
            map.set(key, entry.u);
    }
    return map;
})();
// Wheat flour is the "dry" reference for unknown volume units.
const FLOUR = INDEX.get("hvetemel");
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
    // Compound-word fallback: Norwegian heads are last, so "lettmelk" -> "melk",
    // "meierismør" -> "smør", "rørsukker" -> "sukker".
    for (const word of words) {
        for (let len = word.length - 1; len >= 4; len--) {
            const suffix = word.slice(word.length - len);
            const hit = INDEX.get(suffix);
            if (hit)
                return { units: hit, name: suffix };
        }
    }
    return null;
}
// How to treat a unit when the ingredient (or its weight) is unknown.
const MASS_KEYS = new Set(["ounce", "pound"]);
function unitKind(def) {
    if (def.key === "piece")
        return "count"; // stk, pk, skive, neve, fedd, ... — never guess
    if (MASS_KEYS.has(def.key))
        return "mass"; // exact constants
    return "volume"; // l, dl, ss, ts, kopp ... — water approximation is fine
}
function stripDescriptors(phrase) {
    return phrase
        .split(" ")
        .filter((w) => !DESCRIPTORS.has(w))
        .join(" ");
}
export function parseQuantity(raw) {
    const text = raw.trim().replace(/\s+/g, " ");
    if (UNICODE_FRACTIONS[text] !== undefined)
        return UNICODE_FRACTIONS[text];
    // "1 1/2"
    let m = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (m) {
        const denom = Number(m[3]);
        return denom === 0 ? null : Number(m[1]) + Number(m[2]) / denom;
    }
    // "1½"
    m = text.match(/^(\d+)\s*([½¼¾⅓⅔⅛⅜⅝⅞])$/);
    if (m)
        return Number(m[1]) + UNICODE_FRACTIONS[m[2]];
    // "1/2"
    m = text.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (m) {
        const denom = Number(m[2]);
        return denom === 0 ? null : Number(m[1]) / denom;
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
    `(\\d+\\s*[½¼¾⅓⅔⅛⅜⅝⅞]|\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+(?:[.,]\\d+)?|\\d+\\s*/\\s*\\d+|[½¼¾⅓⅔⅛⅜⅝⅞])\\s*` +
    `(${UNIT_ALTERNATION})\\b\\.?`, "giu");
const INGREDIENT_RE = /^[\s]+([\p{L}][\p{L}\p{N}-]*(?:\s+[\p{L}][\p{L}\p{N}-]*){0,3})/u;
// `fallbackIngredient` is the text of an adjacent cell on the same row (some
// sites put the amount and the ingredient in separate elements).
// A line that already states a mass (g/kg) is already metric — don't touch it.
const HAS_MASS = /(?:^|[^\p{L}\p{N}])\d+(?:[.,]\d+)?\s*(?:kg|g)\b/iu;
export function convertText(text, fallbackIngredient = "") {
    const matches = [];
    const alreadyMetric = HAS_MASS.test(text);
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
        if (alreadyMetric) {
            // e.g. "150g/5oz", "1 cup (200 g)" — the weight is already there.
            MATCH_RE.lastIndex = m.index + m[0].length;
            continue;
        }
        const after = text.slice(m.index + m[0].length);
        const ingredientMatch = after.match(INGREDIENT_RE);
        const trailingIngredient = ingredientMatch ? ingredientMatch[1] : "";
        const usedFallback = !trailingIngredient && Boolean(fallbackIngredient);
        const ingredientPhrase = trailingIngredient || fallbackIngredient;
        // Where the amount+unit part ends and the ingredient phrase (if any) begins.
        const unitEnd = m.index + m[0].length;
        let end = unitEnd;
        if (ingredientMatch)
            end += ingredientMatch[0].length;
        const baseText = text.slice(m.index, end);
        const rawText = usedFallback
            ? `${baseText} ${fallbackIngredient.trim()}`.replace(/\s+/g, " ").trim()
            : baseText;
        // genericOnly units (pint/quart/gallon) have no per-unit table column;
        // using the ingredient's per-ml/per-l weight here would be wrong.
        const found = def.genericOnly
            ? null
            : lookupIngredient(ingredientPhrase) ?? lookupIngredient(stripDescriptors(ingredientPhrase));
        let grams = null;
        let unknown = false;
        let estimates = null;
        let ingredientName = null;
        if (found && found.units[def.key] !== undefined) {
            grams = quantity * found.units[def.key] * (def.mul ?? 1);
            ingredientName = found.name;
        }
        else {
            const kind = unitKind(def);
            if (kind === "mass") {
                // oz/lb are exact constants regardless of ingredient.
                grams = quantity * def.generic * (def.mul ?? 1);
            }
            else {
                // Unknown ingredient: don't guess a single value. Keep the original
                // and offer liquid (water) + dry (flour) estimates instead.
                unknown = true;
                if (kind === "volume") {
                    const liquid = quantity * def.generic * (def.mul ?? 1);
                    const flourPer = FLOUR ? FLOUR[def.key] : undefined;
                    const dry = flourPer !== undefined ? quantity * flourPer * (def.mul ?? 1) : null;
                    estimates = { liquid: formatGrams(liquid), dry: dry !== null ? formatGrams(dry) : null };
                }
            }
        }
        const original = text.slice(m.index, unitEnd);
        const metric = unknown ? "" : formatGrams(grams);
        const imperial = Boolean(def.imperial);
        // One emoji, used in both the tooltip and the inline marker.
        const marker = unknown ? "🤷" : imperial ? "🔪" : "🧐";
        const note = buildNote({ rawText, metric, unknown, estimates, marker });
        matches.push({
            start: m.index,
            unitEnd,
            end,
            text: rawText,
            original,
            grams,
            metric,
            quantity,
            unitLabel: m[2],
            unitKey: def.key,
            unitMul: def.mul ?? 1,
            ingredient: ingredientName,
            unknown,
            estimates,
            imperial,
            marker,
            note,
        });
        MATCH_RE.lastIndex = end;
    }
    return matches;
}
function buildNote(args) {
    const raw = args.rawText.trim();
    if (args.unknown) {
        if (args.estimates) {
            const dry = args.estimates.dry ? ` · ${args.estimates.dry} (dry, like flour)` : "";
            return `${raw} ≈ ${args.estimates.liquid} (liquid, like water)${dry} ${args.marker}`;
        }
        return `${raw} — ingredient not recognised ${args.marker}`;
    }
    return `${raw} = ${args.metric} (exact) ${args.marker}`;
}
