// Publishes the packaged extension to addons.mozilla.org (AMO) via the
// Add-on Submission API v5, using a JWT signed with your API key.
//
//   export AMO_API_KEY=...       # https://addons.mozilla.org/developers/addon/api/key/
//   export AMO_API_SECRET=...
//   export AMO_ADDON_ID=...      # slug or GUID as shown in your DevHub URL
//   node scripts/publish.ts [--channel listed|unlisted] [--zip path/to.zip]
//
// Full guide: https://extensionworkshop.com/documentation/publish/submitting-an-add-on/

import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, join } from "node:path";

const API = "https://addons.mozilla.org/api/v5";
const root = fileURLToPath(new URL("..", import.meta.url));

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const channel = arg("channel", "listed") as "listed" | "unlisted";
const zipPath =
  arg("zip") ??
  join(root, "web-ext-artifacts", `gramguru-${manifestVersion()}.zip`);

function manifestVersion(): string {
  return (
    JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as {
      version: string;
    }
  ).version;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeJwt(key: string, secret: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      iss: key,
      jti: randomBytes(16).toString("hex"),
      iat: now,
      exp: now + 60,
    }),
  );
  const signature = base64url(
    createHmac("sha256", secret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function upload(token: string, file: Buffer): Promise<string> {
  const form = new FormData();
  form.append(
    "upload",
    new Blob([new Uint8Array(file)], { type: "application/zip" }),
    basename(zipPath),
  );
  form.append("channel", channel);

  const res = await fetch(`${API}/addons/upload/`, {
    method: "POST",
    headers: { Authorization: `JWT ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { uuid: string; url: string };
  console.log(`uploaded (uuid ${data.uuid}), waiting for validation ...`);
  return data.uuid;
}

async function waitForValidation(token: string, uuid: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const res = await fetch(`${API}/addons/upload/${uuid}/`, {
      headers: { Authorization: `JWT ${token}` },
    });
    if (!res.ok) throw new Error(`poll failed: ${res.status}`);
    const data = (await res.json()) as {
      processed: boolean;
      valid: boolean;
      validation?: { errors?: number; warnings?: number; messages?: unknown[] };
    };
    if (data.processed) {
      if (!data.valid) {
        throw new Error(
          `add-on failed validation:\n${JSON.stringify(data.validation, null, 2)}`,
        );
      }
      console.log(
        `validated (warnings: ${data.validation?.warnings ?? 0}, errors: 0)`,
      );
      return;
    }
    await sleep(5000);
  }
  throw new Error("timed out waiting for validation");
}

async function createVersion(token: string, addonId: string, uuid: string): Promise<unknown> {
  const res = await fetch(
    `${API}/addons/addon/${encodeURIComponent(addonId)}/versions/`,
    {
      method: "POST",
      headers: {
        Authorization: `JWT ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ upload: uuid }),
    },
  );
  if (res.status === 404) {
    throw new Error(
      `add-on "${addonId}" was not found on AMO.\n` +
        `Create the listing once in the Developer Hub ` +
        `(https://addons.mozilla.org/developers/addons -> Submit a New Add-on), ` +
        `then set AMO_ADDON_ID to its slug and re-run.`,
    );
  }
  if (!res.ok) {
    throw new Error(`version creation failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function downloadSigned(url: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const dir = join(root, "web-ext-artifacts");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `gramguru-${manifestVersion()}-signed.xpi`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`signed add-on -> ${out}`);
}

async function main(): Promise<void> {
  const key = process.env.AMO_API_KEY;
  const secret = process.env.AMO_API_SECRET;
  const addonId = process.env.AMO_ADDON_ID;
  if (!key || !secret) {
    throw new Error("Set AMO_API_KEY and AMO_API_SECRET (see .env.example).");
  }
  if (!addonId) throw new Error("Set AMO_ADDON_ID (see .env.example).");

  const token = makeJwt(key, secret);
  const file = readFileSync(zipPath);
  console.log(`publishing ${basename(zipPath)} as ${channel} ...`);

  const uuid = await upload(token, file);
  await waitForValidation(token, uuid);
  const version = (await createVersion(token, addonId, uuid)) as {
    version?: string;
    file?: { url?: string };
  };
  console.log(`created version ${version.version ?? "?"}`);

  if (channel === "listed") {
    console.log("submitted for review. Track status in the Developer Hub.");
  } else if (version.file?.url) {
    await downloadSigned(version.file.url);
  }
}

main().catch((err) => {
  console.error(`\n${String(err instanceof Error ? err.message : err)}`);
  process.exit(1);
});
