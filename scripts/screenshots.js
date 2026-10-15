// Captures AMO listing screenshots with the extension running in headless
// Firefox. Run with: node scripts/screenshots.js
//
// Writes 1280x800 PNGs to ../screenshots/.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(root, "screenshots");
const PORT = Number(process.env.GRAMGURU_SHOT_PORT ?? 9444);
const WIDTH = 1280;
const HEIGHT = 800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TEST_PAGE = readFileSync(join(root, "devtest", "testpage.html"), "utf8");

// name, url (null = local test page), optional interaction
const SHOTS = [
  { file: "gramguru-1-testpage.png", url: null },
  { file: "gramguru-2-tooltip.png", url: null, tap: true },
  {
    file: "gramguru-3-matprat.png",
    url: "https://www.matprat.no/oppskrifter/tradisjon/leverpostei/",
  },
  {
    file: "gramguru-4-tine.png",
    url: "https://www.tine.no/oppskrifter/lunsj-og-smaretter/omeletter-og-pannekaker/egg-i-form",
  },
  {
    file: "gramguru-5-international.png",
    url: "https://www.delish.com/cooking/recipe-ideas/recipes/a44085/chicken-parm-soup-recipe/",
  },
];

class Bidi {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
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
      const attempt = () => {
        const ws = new WebSocket(url);
        ws.onopen = () => resolve(new Bidi(ws));
        ws.onerror = () => {
          if (Date.now() - started > timeoutMs) reject(new Error("BiDi connect timeout"));
          else setTimeout(attempt, 400);
        };
      };
      attempt();
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

async function evaluate(bidi, context, expression) {
  const r = await bidi.send("script.evaluate", {
    expression,
    target: { context },
    awaitPromise: true,
    resultOwnership: "none",
  });
  return r.result?.value;
}

async function waitForMarks(bidi, context) {
  for (let i = 0; i < 50; i++) {
    const n = await evaluate(
      bidi,
      context,
      `[...document.querySelectorAll('.gg')].filter((m) => {
      const r = m.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    }).length`,
    );
    if (typeof n === "number" && n > 0) return n;
    await sleep(300);
  }
  return 0;
}

async function dismissConsent(bidi, context) {
  await evaluate(
    bidi,
    context,
    `(() => {
    const accept = /\\b(accept all|accept|i agree|agree|allow all|got it|okay|godta alle|godta|godkjenn|aksepter|tillat alle|tillat|accepter|aceptar|acceptera|akzeptieren|toestaan)\\b/i;
    const dismiss = /\\b(close|decline|reject|no thanks|avslå alle|avslå|lukk|schließen|cerrar|fermer)\\b|×/i;
    const els = [...document.querySelectorAll('button, a, [role="button"]')]
      .filter((e) => e.offsetParent !== null && (e.textContent || '').trim().length < 40);
    const pick = els.find((e) => accept.test(e.textContent.trim())) || els.find((e) => dismiss.test(e.textContent.trim()));
    if (pick) pick.click();
    return true;
  })()`,
  );
  await sleep(600);
}

async function scrollToMarks(bidi, context) {
  const info = await evaluate(
    bidi,
    context,
    `(() => {
    const marks = [...document.querySelectorAll('.gg')].filter((m) => {
      const r = m.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    });
    if (!marks.length) return 'no visible marks';
    const counts = new Map();
    for (const m of marks) {
      let el = m.parentElement, depth = 0;
      while (el && depth < 8) {
        if (el.tagName !== 'BODY' && el.tagName !== 'HTML') {
          const rec = counts.get(el) || { n: 0, depth };
          rec.n++; counts.set(el, rec);
        }
        el = el.parentElement; depth++;
      }
    }
    let best = marks[0], bestN = -1, bestD = -1;
    for (const [el, rec] of counts) {
      if (rec.n > bestN || (rec.n === bestN && rec.depth > bestD)) { bestN = rec.n; bestD = rec.depth; best = el; }
    }
    // Aim at the first mark inside that list so the items themselves are shown.
    const firstMark = marks.find((m) => best.contains(m));
    if (firstMark) best = firstMark;
    // Scroll every scrollable ancestor so it works whether the page scrolls the
    // window or an inner container.
    let node = best;
    while (node) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
        const r = best.getBoundingClientRect(), nr = node.getBoundingClientRect();
        node.scrollTop += r.top - nr.top - 100;
      }
      node = node.parentElement;
    }
    const top = best.getBoundingClientRect().top + window.scrollY - 100;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
    return best.tagName + '.' + best.className + ' marks=' + bestN +
      ' scrollY=' + Math.round(window.scrollY) +
      ' rectTop=' + Math.round(best.getBoundingClientRect().top);
  })()`,
  );
  await sleep(900);
  return info;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "gramguru-shots-"));
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
  const firefox = spawn(
    "firefox",
    [
      "--headless",
      "--no-remote",
      "--profile",
      profile,
      "--width",
      String(WIDTH),
      "--height",
      String(HEIGHT),
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

  try {
    const bidi = await Bidi.connect(`ws://127.0.0.1:${PORT}/session`);
    await bidi.send("session.new", { capabilities: { alwaysMatch: {} } });
    await bidi.send("webExtension.install", { extensionData: { type: "path", path: root } });

    for (const shot of SHOTS) {
      const { context } = await bidi.send("browsingContext.create", { type: "tab" });
      try {
        await bidi.send("browsingContext.setViewport", {
          context,
          viewport: { width: WIDTH, height: HEIGHT },
          devicePixelRatio: 1,
        });
      } catch {
        /* older engines */
      }
      await bidi.send("browsingContext.navigate", {
        context,
        url: shot.url ?? testUrl,
        wait: "complete",
      });
      await waitForMarks(bidi, context);
      await dismissConsent(bidi, context);
      if (!shot.tap) console.log("   scroll:", await scrollToMarks(bidi, context));
      if (shot.tap) {
        await evaluate(
          bidi,
          context,
          `(() => { const el = document.querySelector('.gg[data-gg-marker]'); if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); return true; })()`,
        );
        await sleep(400);
      }
      const { data } = await bidi.send("browsingContext.captureScreenshot", { context });
      const out = join(OUT, shot.file);
      writeFileSync(out, Buffer.from(data, "base64"));
      console.log(`saved ${shot.file}`);
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
  console.log(`\nscreenshots -> ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
