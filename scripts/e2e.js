// Real end-to-end test: launches headless Firefox, installs the extension as a
// temporary add-on over WebDriver BiDi (the same mechanism about:debugging
// uses), then verifies the actual injected marks on a local test page and on
// the real recipe sites.
//
// Run with: node scripts/e2e.js   (no build step)
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.GRAMGURU_BIDI_PORT ?? 9333);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TEST_PAGE = readFileSync(join(root, "devtest", "testpage.html"), "utf8");
const SITES = [
  {
    name: "testpage.html",
    url: null,
    expect: [
      { original: "3 ss hvetemel", shown: "27 g", emoji: "🧐", visible: "27 g hvetemel" },
      { original: "1,5 dl melk", shown: "150 g", visible: "150 g melk" },
      { original: "3 stk gulrøtter", shown: "270 g", visible: "270 g gulrøtter" },
      { original: "2 ss", shown: "30/18 g wet/dry", unknown: true },
      { original: "8 oz smør", shown: "226.8 g", emoji: "🔪", visible: "226.8 g smør" },
    ],
    minMarks: 10,
  },
  {
    name: "matprat leverpostei",
    url: "https://www.matprat.no/oppskrifter/tradisjon/leverpostei/",
    expect: [
      { original: "3 ss hvetemel", shown: "27 g", visible: "27 g hvetemel" },
      { original: "1,5 dl melk", shown: "150 g", visible: "150 g melk" },
      { original: "1 pk aspik", shown: "1 pk", unknown: true },
    ],
    minMarks: 10,
  },
  {
    name: "meny helstekt kylling",
    url: "https://meny.no/oppskrifter/kylling/helstekt-kylling-med-ovnsbakte-rotgronnsaker",
    expect: [
      { original: "2 dl hvitvin", shown: "200 g", visible: "200 g hvitvin" },
      { original: "3 dl kyllingkraft", shown: "300 g", visible: "300 g kyllingkraft" },
      { original: "1 stk hel kylling", shown: "1.5 kg", visible: "1.5 kg hel kylling" },
    ],
    minMarks: 10,
  },
  {
    name: "matprat bigos",
    url: "https://www.matprat.no/oppskrifter/gjester/bigos-polsk-gryte/",
    expect: [
      { original: "2 ss smør", shown: "30 g", visible: "30 g smør" },
      { original: "3 stk. løk", shown: "510 g", visible: "510 g løk" },
      { original: "5 dl kjøttkraft", shown: "500 g", visible: "500 g kjøttkraft" },
      { original: "0,5 ts salt", shown: "3.5 g", visible: "3.5 g salt" },
      { original: "2 stk. laurbærblad", shown: "2 stk.", unknown: true },
    ],
    minMarks: 9,
  },
  {
    name: "tine egg i form",
    url: "https://www.tine.no/oppskrifter/lunsj-og-smaretter/omeletter-og-pannekaker/egg-i-form",
    expect: [
      { original: "6 stk egg", shown: "330 g", visible: "330 g egg" },
      {
        original: "1 dl TINE® Lettmelk 1,0 % fett",
        shown: "100 g",
        visible: "100 g TINE® Lettmelk",
      },
      {
        original: "1 ts TINE® Meierismør til smøring av form",
        shown: "7 g",
        visible: "7 g TINE® Meierismør",
      },
      { original: "1 fedd hvitløk", shown: "55 g", visible: "55 g hvitløk" },
    ],
    minMarks: 7,
  },
  // Extra Norwegian sites
  {
    name: "godt kjøttkaker",
    url: "https://www.godt.no/oppskrifter/kjoett/kjoettdeig/7691/kjoettkaker-i-brun-saus",
    expect: [
      { original: "3 ss hvetemel", shown: "27 g" },
      { original: "1 stk egg", shown: "55 g" },
      { original: "2 dl melk", shown: "200 g" },
    ],
    minMarks: 9,
  },
  {
    name: "trinesmatblogg kyllinggryte",
    url: "https://trinesmatblogg.no/recipe/kremet-kyllinggryte-med-gnocchi-og-soltorkede-tomater/",
    expect: [{ original: "1 ½ liter", shown: "1500/825 g wet/dry", unknown: true }],
    minMarks: 4,
  },
  // International sites (US/UK units)
  {
    name: "bbc good food pancakes",
    url: "https://www.bbc.co.uk/food/recipes/how_to_make_pancakes_02824",
    expect: [{ original: "1 tbsp melted butter", shown: "15 g", emoji: "🔪" }],
    minMarks: 1,
  },
    {
      name: "bon appetit cookies",
      url: "https://www.bonappetit.com/recipe/bas-best-chocolate-chip-cookies",
      // Recipe states grams in parentheses, so (almost) nothing should convert.
      expect: [],
      minMarks: 0,
    },
  {
    name: "pioneer woman green bean casserole",
    url: "https://www.thepioneerwoman.com/food-cooking/recipes/a11889/green-bean-casserole/",
    expect: [
      { original: "2 lb. fresh green beans", shown: "907.2 g", emoji: "🔪" },
      { original: "4 Tbsp. all-purpose flour", shown: "36 g" },
      { original: "1 1/2 tsp. salt", shown: "10.5 g" },
    ],
    minMarks: 7,
  },
  {
    name: "foodnetwork uk prawns",
    url: "https://foodnetwork.co.uk/recipes/prawn-white-bean-and-feta-skillet-for-two",
    expect: [{ original: "1/2 teaspoon salt", shown: "3.5 g" }],
    minMarks: 1,
  },
  {
    name: "delish chicken parm soup",
    url: "https://www.delish.com/cooking/recipe-ideas/recipes/a44085/chicken-parm-soup-recipe/",
    expect: [
      { original: "8 oz. penne", shown: "226.8 g" },
      { original: "1 cup finely grated Parmesan", shown: "94.6 g" },
    ],
    minMarks: 6,
  },
];
class Bidi {
  constructor(ws) {
    this.nextId = 1;
    this.pending = new Map();
    this.ws = ws;
    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.type === "event" || msg.id === undefined) return;
      const entry = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (!entry) return;
      if (msg.type === "error") entry.reject(new Error(msg.message ?? msg.error ?? "BiDi error"));
      else entry.resolve(msg.result ?? {});
    };
  }
  static connect(url, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tryConnect = () => {
        const ws = new WebSocket(url);
        ws.onopen = () => resolve(new Bidi(ws));
        ws.onerror = () => {
          if (Date.now() - started > timeoutMs) reject(new Error("BiDi connect timeout"));
          else setTimeout(tryConnect, 400);
        };
      };
      tryConnect();
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    this.ws.close();
  }
}
function startServer() {
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(TEST_PAGE);
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ url: `http://127.0.0.1:${port}/testpage.html`, server });
    }),
  );
}
function launchFirefox(profile) {
  return spawn(
    "firefox",
    [
      "--headless",
      "--no-remote",
      "--profile",
      profile,
      "--remote-debugging-port",
      String(PORT),
      "--remote-allow-origins",
      "*",
      "--remote-allow-hosts",
      "*",
      "about:blank",
    ],
    { detached: true, stdio: "ignore" },
  );
}
async function evaluate(bidi, context, expression) {
  const result = await bidi.send("script.evaluate", {
    expression,
    target: { context },
    awaitPromise: true,
    resultOwnership: "none",
  });
  const value = result.result?.value;
  return value;
}
async function readMarks(bidi, context) {
  for (let i = 0; i < 40; i++) {
    const raw = await evaluate(
      bidi,
      context,
      `(() => {
        const groups = new Map();
        for (const el of document.querySelectorAll('.gg')) {
          const id = el.dataset.ggId || String(Math.random());
          const after = getComputedStyle(el, '::after').content || '';
          const marker = after.replace(/^"|"$/g, '');
          const g = groups.get(id) || { text: '', title: el.title, original: el.dataset.ggOriginal || '', cls: el.className, marker: '' };
          g.text += el.textContent;
          if (!g.marker && marker && marker !== 'none') g.marker = marker;
          groups.set(id, g);
        }
        return JSON.stringify([...groups.values()]);
      })()`,
    );
    const marks = typeof raw === "string" ? JSON.parse(raw) : [];
    if (marks.length > 0) return marks;
    await sleep(250);
  }
  return [];
}
async function readText(bidi, context) {
  const raw = await evaluate(
    bidi,
    context,
    `document.body ? document.body.innerText.replace(/\\s+/g, ' ').trim() : ''`,
  );
  return typeof raw === "string" ? raw : "";
}
// Simulate a tap/click on the first mark and check the floating tooltip shows.
async function tapFirstMark(bidi, context) {
  for (let i = 0; i < 12; i++) {
    const raw = await evaluate(
      bidi,
      context,
      `(() => {
            const el = document.querySelector('.gg');
            if (!el) return JSON.stringify(null);
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            const tip = document.getElementById('gg-tip');
            if (!tip) return JSON.stringify(null);
            return JSON.stringify({ display: getComputedStyle(tip).display, text: tip.textContent });
        })()`,
    );
    const val = typeof raw === "string" ? JSON.parse(raw) : null;
    if (val && val.display !== "none" && val.text) return val;
    await sleep(250);
  }
  return null;
}
function check(name, marks, pageText, site) {
  const problems = [];
  if (marks.length < site.minMarks) {
    problems.push(`expected >= ${site.minMarks} marks, got ${marks.length}`);
  }
  for (const expected of site.expect ?? []) {
    const hit = marks.find(
      (m) => (m.original || "").includes(expected.original) && m.text.trim() === expected.shown,
    );
    if (!hit) {
      problems.push(
        `missing mark: ${JSON.stringify(expected.original)} -> ${JSON.stringify(expected.shown)}`,
      );
      continue;
    }
    if (!hit.title.includes(expected.original)) {
      problems.push(
        `${JSON.stringify(expected.original)} tooltip ${JSON.stringify(
          hit.title,
        )} lacks the original`,
      );
    }
    if (expected.emoji && !hit.title.includes(expected.emoji)) {
      problems.push(`${JSON.stringify(expected.original)} tooltip lacks ${expected.emoji}`);
    }
    if (expected.unknown && !hit.cls.includes("gg-unknown")) {
      problems.push(`${JSON.stringify(expected.original)} should be marked unknown`);
    }
    if (expected.known && hit.cls.includes("gg-unknown")) {
      problems.push(`${JSON.stringify(expected.original)} should not be unknown`);
    }
    if (expected.visible && !pageText.includes(expected.visible)) {
      const at = pageText.indexOf(expected.shown);
      const near = at >= 0 ? pageText.slice(at, at + 70) : "(value not in visible text)";
      problems.push(
        `page text lacks the ingredient: expected ${JSON.stringify(
          expected.visible,
        )} | near: ${JSON.stringify(near)}`,
      );
    }
  }
  for (const absent of site.absent ?? []) {
    const hit = marks.find((m) => (m.original || "").includes(absent));
    if (hit)
      problems.push(
        `must not convert ${JSON.stringify(absent)} but produced ${JSON.stringify(hit.text)}`,
      );
  }
  // The inline marker emoji must match the emoji in the tooltip.
  for (const m of marks) {
    if (m.marker && m.title && !m.title.includes(m.marker)) {
      problems.push(
        `marker ${JSON.stringify(m.marker)} != tooltip emoji in ${JSON.stringify(m.title)}`,
      );
    }
  }
  const ok = problems.length === 0;
  console.log(`\n${ok ? "✔" : "✖"} ${name} (${marks.length} marks)`);
  for (const m of marks) console.log(`    ${JSON.stringify(m.text)} -> ${m.title}`);
  for (const p of problems) console.log(`    ! ${p}`);
  return ok;
}
async function main() {
  const profile = mkdtempSync(join(tmpdir(), "gramguru-ff-"));
  writeFileSync(
    join(profile, "user.js"),
    [
      'user_pref("browser.shell.checkDefaultBrowser", false);',
      'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
      'user_pref("toolkit.telemetry.enabled", false);',
      'user_pref("browser.startup.homepage", "about:blank");',
    ].join("\n"),
  );
  const { url: testUrl, server } = await startServer();
  const firefox = launchFirefox(profile);
  let ok = true;
  try {
    const bidi = await Bidi.connect(`ws://127.0.0.1:${PORT}/session`);
    await bidi.send("session.new", { capabilities: { alwaysMatch: {} } });
    const installed = await bidi.send("webExtension.install", {
      extensionData: { type: "path", path: root },
    });
    console.log(`installed extension: ${JSON.stringify(installed)}`);
    for (const site of SITES) {
      const { context } = await bidi.send("browsingContext.create", { type: "tab" });
      await bidi.send("browsingContext.navigate", {
        context,
        url: site.url ?? testUrl,
        wait: "complete",
      });
      const marks = await readMarks(bidi, context);
      const pageText = await readText(bidi, context);
      if (!check(site.name, marks, pageText, site)) ok = false;
      if (marks.length > 0) {
        const tip = await tapFirstMark(bidi, context);
        if (!tip || tip.display === "none" || !tip.text) {
          console.log(`    ! tap tooltip did not appear: ${JSON.stringify(tip)}`);
          ok = false;
        } else {
          console.log(`    tap tooltip: ${JSON.stringify(tip.text)}`);
        }
      }
      await bidi.send("browsingContext.close", { context });
    }
    bidi.close();
  } finally {
    try {
      if (firefox.pid) process.kill(-firefox.pid);
    } catch {
      firefox.kill();
    }
    server.close();
  }
  console.log(`\n${ok ? "E2E PASS ✅" : "E2E FAIL ❌"}`);
  process.exit(ok ? 0 : 1);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
