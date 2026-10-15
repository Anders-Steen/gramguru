// Real end-to-end test: launches headless Firefox, installs the extension as a
// temporary add-on over WebDriver BiDi (the same mechanism about:debugging
// uses), then verifies the actual injected marks on a local test page and on
// the real recipe sites.
//
// Run with: node scripts/e2e.ts   (build first: node scripts/build.ts)

import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.GRAMGURU_BIDI_PORT ?? 9333);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TEST_PAGE = readFileSync(join(root, "devtest", "testpage.html"), "utf8");

const SITES = [
  {
    name: "testpage.html",
    url: null as string | null,
    expect: [
      { text: "3 ss hvetemel", title: "27 g", emoji: "🧐" },
      { text: "1,5 dl melk", title: "150 g" },
      { text: "3 stk gulrøtter", title: "270 g" },
      { text: "2 ss", emoji: "🤷" },
      { text: "8 oz smør", emoji: "🔪" },
    ],
    minMarks: 10,
  },
  {
    name: "matprat leverpostei",
    url: "https://www.matprat.no/oppskrifter/tradisjon/leverpostei/",
    expect: [
      { text: "3 ss hvetemel", title: "27 g" },
      { text: "1,5 dl melk", title: "150 g" },
      { text: "1 pk aspik", emoji: "🤷" },
    ],
    minMarks: 10,
  },
  {
    name: "meny helstekt kylling",
    url: "https://meny.no/oppskrifter/kylling/helstekt-kylling-med-ovnsbakte-rotgronnsaker",
    expect: [
      { text: "2 dl hvitvin", title: "200 g" },
      { text: "3 dl kyllingkraft", title: "300 g" },
      { text: "1 stk hel kylling", title: "1.5 kg" },
    ],
    minMarks: 11,
  },
];

interface Mark {
  text: string;
  title: string;
  cls: string;
}

class Bidi {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }
  >();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data)) as {
        id?: number;
        type: string;
        result?: Record<string, unknown>;
        message?: string;
        error?: string;
      };
      if (msg.type === "event" || msg.id === undefined) return;
      const entry = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (!entry) return;
      if (msg.type === "error") entry.reject(new Error(msg.message ?? msg.error ?? "BiDi error"));
      else entry.resolve(msg.result ?? {});
    };
  }

  static connect(url: string, timeoutMs = 20000): Promise<Bidi> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tryConnect = (): void => {
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

  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close(): void {
    this.ws.close();
  }
}

function startServer(): Promise<{ url: string; server: Server }> {
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(TEST_PAGE);
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({ url: `http://127.0.0.1:${port}/testpage.html`, server });
    }),
  );
}

function launchFirefox(profile: string): ChildProcess {
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

async function evaluate(bidi: Bidi, context: string, expression: string): Promise<unknown> {
  const result = await bidi.send("script.evaluate", {
    expression,
    target: { context },
    awaitPromise: true,
    resultOwnership: "none",
  });
  const value = (result.result as { value?: unknown } | undefined)?.value;
  return value;
}

async function readMarks(bidi: Bidi, context: string): Promise<Mark[]> {
  for (let i = 0; i < 40; i++) {
    const raw = await evaluate(
      bidi,
      context,
      `(() => {
        const groups = new Map();
        for (const el of document.querySelectorAll('.gg')) {
          const id = el.dataset.ggId || String(Math.random());
          const g = groups.get(id) || { text: '', title: el.title, cls: el.className };
          g.text += el.textContent;
          groups.set(id, g);
        }
        return JSON.stringify([...groups.values()]);
      })()`,
    );
    const marks = typeof raw === "string" ? (JSON.parse(raw) as Mark[]) : [];
    if (marks.length > 0) return marks;
    await sleep(250);
  }
  return [];
}

function check(name: string, marks: Mark[], site: (typeof SITES)[number]): boolean {
  const problems: string[] = [];
  if (marks.length < site.minMarks) {
    problems.push(`expected >= ${site.minMarks} marks, got ${marks.length}`);
  }
  for (const expected of site.expect) {
    const hit = marks.find((m) => m.text.trim() === expected.text);
    if (!hit) {
      problems.push(`missing mark for ${JSON.stringify(expected.text)}`);
      continue;
    }
    if (expected.title && !hit.title.includes(expected.title)) {
      problems.push(`${JSON.stringify(expected.text)} title ${JSON.stringify(hit.title)} lacks ${expected.title}`);
    }
    if (expected.emoji && !hit.title.includes(expected.emoji)) {
      problems.push(`${JSON.stringify(expected.text)} title lacks ${expected.emoji}`);
    }
  }
  const ok = problems.length === 0;
  console.log(`\n${ok ? "✔" : "✖"} ${name} (${marks.length} marks)`);
  for (const m of marks) console.log(`    ${JSON.stringify(m.text)} -> ${m.title}`);
  for (const p of problems) console.log(`    ! ${p}`);
  return ok;
}

async function main(): Promise<void> {
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
      const { context } = (await bidi.send("browsingContext.create", { type: "tab" })) as {
        context: string;
      };
      await bidi.send("browsingContext.navigate", {
        context,
        url: site.url ?? testUrl,
        wait: "complete",
      });
      const marks = await readMarks(bidi, context);
      if (!check(site.name, marks, site)) ok = false;
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
