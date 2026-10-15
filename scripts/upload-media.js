// Uploads the add-on icon and listing screenshots to AMO via the Add-on API v5.
//
//   node --env-file=.env scripts/upload-media.js
//
// Required env (see .env.example): AMO_API_KEY, AMO_API_SECRET, AMO_ADDON_ID.
// Icon:        PATCH /api/v5/addons/addon/{id}/            (multipart "icon")
// Screenshots: POST  /api/v5/addons/addon/{id}/previews/   (multipart "image")
//
// AMO throttles these (HTTP 429); requests are retried with the server's hint.

import { createHmac, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, join } from "node:path";

const API = "https://addons.mozilla.org/api/v5";
const root = fileURLToPath(new URL("..", import.meta.url));
const SHOTS_DIR = join(root, "screenshots");

const addonId = process.env.AMO_ADDON_ID ?? "gramguru@anderss";
const iconPath = join(root, "icons", "icon-512.png");
const addonUrl = `${API}/addons/addon/${encodeURIComponent(addonId)}/`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function freshAuth() {
  const key = process.env.AMO_API_KEY;
  const secret = process.env.AMO_API_SECRET;
  if (!key || !secret) throw new Error("Set AMO_API_KEY and AMO_API_SECRET (see .env.example).");
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({ iss: key, jti: randomBytes(16).toString("hex"), iat: now, exp: now + 60 }),
  );
  const signature = base64url(createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  return { Authorization: `JWT ${header}.${payload}.${signature}` };
}

// Max seconds we're willing to wait out a 429. AMO can escalate the throttle to
// many hours after repeated writes; bail out instead of hanging.
const MAX_WAIT_S = 300;

// Runs a request, honouring AMO's 429 throttle by retrying after the hinted delay.
async function send(init, label) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(init.url, {
      method: init.method,
      headers: freshAuth(),
      body: init.body,
    });
    if (res.status !== 429) return res;
    const retryAfter = Number(res.headers.get("retry-after") || 0);
    const detail = await res
      .json()
      .then((b) => b.detail ?? "")
      .catch(() => "");
    const secs = retryAfter || Number((/in (\d+) seconds/.exec(detail) ?? [])[1] ?? 60);
    if (secs > MAX_WAIT_S) {
      throw new Error(`${label}: throttled for ${secs}s — too long to wait; retry later.`);
    }
    console.log(`  throttled on ${label}; waiting ${secs}s ...`);
    await sleep((secs + 2) * 1000);
  }
  throw new Error(`${label}: still throttled after retries`);
}

function pngForm(field, path) {
  const form = new FormData();
  form.append(
    field,
    new Blob([new Uint8Array(readFileSync(path))], { type: "image/png" }),
    basename(path),
  );
  return form;
}

async function existingPreviews() {
  const res = await send({ url: addonUrl, method: "GET" }, "lookup");
  if (!res.ok) throw new Error(`add-on lookup failed: ${res.status}`);
  return (await res.json()).previews ?? [];
}

async function main() {
  const shots = readdirSync(SHOTS_DIR)
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map((f) => join(SHOTS_DIR, f));
  if (shots.length === 0) throw new Error(`no screenshots in ${SHOTS_DIR}`);

  console.log(`add-on ${addonId}: icon + ${shots.length} screenshots`);

  // Replace existing previews so re-runs are idempotent.
  for (const p of await existingPreviews()) {
    await send({ url: `${addonUrl}previews/${p.id}/`, method: "DELETE" }, `delete preview ${p.id}`);
    console.log(`removed existing preview ${p.id}`);
    await sleep(1000);
  }

  const icon = await send(
    { url: addonUrl, method: "PATCH", body: pngForm("icon", iconPath) },
    "icon",
  );
  if (!icon.ok) throw new Error(`icon upload failed: ${icon.status} ${await icon.text()}`);
  console.log(`icon uploaded: ${basename(iconPath)}`);
  await sleep(1500);

  for (let i = 0; i < shots.length; i++) {
    const form = pngForm("image", shots[i]);
    form.append("position", String(i));
    const res = await send(
      { url: `${addonUrl}previews/`, method: "POST", body: form },
      basename(shots[i]),
    );
    if (!res.ok) throw new Error(`preview upload failed: ${res.status} ${await res.text()}`);
    console.log(`screenshot uploaded: ${basename(shots[i])} (position ${i})`);
    await sleep(1500);
  }

  console.log("\ndone — icon and screenshots are on the listing.");
}

main().catch((err) => {
  console.error(`\n${String(err instanceof Error ? err.message : err)}`);
  process.exit(1);
});
