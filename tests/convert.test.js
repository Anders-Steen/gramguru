import { test } from "node:test";
import assert from "node:assert/strict";
import { convertText, formatGrams, parseQuantity } from "../src/convert.js";
function first(text) {
  const matches = convertText(text);
  assert.ok(matches.length >= 1, `expected a match in ${JSON.stringify(text)}`);
  return matches[0];
}
function first2(text, fallback) {
  const matches = convertText(text, fallback);
  assert.ok(matches.length >= 1, `expected a match in ${JSON.stringify(text)}`);
  return matches[0];
}
test("tablespoon of flour uses ingredient density", () => {
  const m = first("3 ss hvetemel");
  assert.equal(m.grams, 27);
  assert.equal(m.metric, "27 g");
  assert.equal(m.unknown, false);
  assert.equal(m.ingredient, "hvetemel");
  assert.equal(m.note, "3 ss hvetemel = 27 g (exact) 🧐");
});
test("decimal comma deciliter of milk", () => {
  const m = first("1,5 dl melk");
  assert.equal(m.grams, 150);
  assert.equal(m.metric, "150 g");
});
test("teaspoon of salt", () => {
  const m = first("1,5 ts salt");
  assert.equal(m.grams, 10.5);
});
test("piece of onion resolves via singular form", () => {
  const m = first("2 stk. løk");
  assert.equal(m.grams, 340);
  assert.equal(m.ingredient, "lok");
});
test("piece of egg", () => {
  const m = first("1 stk. egg");
  assert.equal(m.grams, 55);
});
test("plural with umlaut collapses back to dictionary form", () => {
  const m = first("3 stk gulrøtter");
  assert.equal(m.ingredient, "gulrot");
  assert.equal(m.grams, 270);
});
test("unknown volume keeps the original and offers liquid + dry estimates", () => {
  const m = first("2 ss");
  assert.equal(m.unknown, true);
  assert.equal(m.metric, "");
  assert.equal(m.original, "2 ss");
  assert.deepEqual(m.estimates, { liquid: "30", dry: "18" });
  assert.equal(m.note, "2 ss\n30 g if wet\n18 g if dry 🤷");
});
test("unknown count units are ignored (avoids prose false positives)", () => {
  assert.equal(convertText("3 stk").length, 0);
  assert.equal(convertText("8.657 pakker").length, 0);
});

test("count units with a known ingredient convert exactly", () => {
  const m = first("6 stk egg");
  assert.equal(m.grams, 330);
  assert.equal(m.unknown, false);
});

test("adjacent-cell ingredient hint resolves a count unit", () => {
  const m = first2("6 stk ", "egg");
  assert.equal(m.grams, 330);
  assert.equal(m.ingredient, "egg");
  assert.equal(m.note, "6 stk egg = 330 g (exact) 🧐");
});

test("imperial ounces are dragged into the metric age", () => {
  const m = first("8 oz smør");
  assert.equal(m.imperial, true);
  assert.equal(m.grams, 226.8);
  assert.equal(m.note, "8 oz smør = 226.8 g (exact) 🔪");
});
test("pounds produce grams", () => {
  const m = first("1 lb potet");
  assert.equal(m.grams, 453.59);
});
test("kg scaling kicks in above 1000 g", () => {
  const m = first("3 l melk");
  assert.equal(m.metric, "3 kg");
});
test("mg scaling kicks in below 1 g", () => {
  const m = first("0,5 ml vann");
  assert.equal(m.metric, "500 mg");
});
test("unicode fractions are understood", () => {
  const m = first("½ dl melk");
  assert.equal(m.grams, 50);
});
test("already-metric grams are left alone", () => {
  assert.equal(convertText("150 g smør").length, 0);
  assert.equal(convertText("1 kg poteter").length, 0);
});
test("no false positives on ordinary words", () => {
  assert.equal(convertText("Adresse: Storgata 25").length, 0);
  assert.equal(convertText("klasse 2 vinner").length, 0);
  assert.equal(convertText("Vi møttes kl. 12").length, 0);
});
test("multiple units in one sentence", () => {
  const matches = convertText("Bland 3 ss hvetemel med 1,5 dl melk og 1 ts salt.");
  assert.equal(matches.length, 3);
});
test("parseQuantity handles decimals, fractions and unicode", () => {
  assert.equal(parseQuantity("1,5"), 1.5);
  assert.equal(parseQuantity("1/2"), 0.5);
  assert.equal(parseQuantity("½"), 0.5);
  assert.equal(parseQuantity("oops"), null);
});
test("formatGrams scales", () => {
  assert.equal(formatGrams(1500), "1.5 kg");
  assert.equal(formatGrams(27), "27 g");
  assert.equal(formatGrams(0.4), "400 mg");
});
