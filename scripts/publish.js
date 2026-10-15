// Publishes the packaged extension to addons.mozilla.org (AMO) via the
// Add-on Submission API v5, using a JWT signed with your API key.
//
//   node --env-file=.env scripts/publish.js [--channel listed|unlisted] [--zip path]
//
// Required env (see .env.example):
//   AMO_API_KEY      https://addons.mozilla.org/developers/addon/api/key/
//   AMO_API_SECRET
//   AMO_ADDON_ID     slug or GUID (defaults to the manifest GUID)
//   AMO_SLUG         listing slug to use when creating a brand-new listing
//
// If the listing does not exist yet, the script creates it (listed channel)
// with the metadata below. Otherwise it just adds a new version.
//
// Full guide: https://extensionworkshop.com/documentation/publish/submitting-an-add-on/
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, join } from "node:path";
const API = "https://addons.mozilla.org/api/v5";
const root = fileURLToPath(new URL("..", import.meta.url));
// Self-distributed add-ons aren't hosted on AMO, so the signed XPI is committed
// under beta/ and served over HTTPS from the public repo.
const REPO_RAW_BASE =
    process.env.REPO_RAW_BASE ??
        "https://raw.githubusercontent.com/Anders-Steen/gramguru/main";
const MANIFEST = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const LISTING = {
    slug: process.env.AMO_SLUG ?? "gramguru",
    name: { "en-US": MANIFEST.name },
    summary: {
        "en-US": "Converts Norwegian recipe units (ss, ts, dl, kopp) to grams. Metric only — no imperial survivors.",
    },
    categories: { firefox: ["other"] },
    version: { license: "MIT" },
};
function arg(name, fallback) {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const channel = arg("channel", "listed");
const zipPath = arg("zip") ?? join(root, "web-ext-artifacts", `gramguru-${MANIFEST.version}.zip`);
function base64url(input) {
    return Buffer.from(input)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}
function makeJwt(key, secret) {
    const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const now = Math.floor(Date.now() / 1000);
    const payload = base64url(JSON.stringify({ iss: key, jti: randomBytes(16).toString("hex"), iat: now, exp: now + 60 }));
    const signature = base64url(createHmac("sha256", secret).update(`${header}.${payload}`).digest());
    return `${header}.${payload}.${signature}`;
}
const auth = (token) => ({ Authorization: `JWT ${token}` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function upload(token, file) {
    const form = new FormData();
    form.append("upload", new Blob([new Uint8Array(file)], { type: "application/zip" }), basename(zipPath));
    form.append("channel", channel);
    const res = await fetch(`${API}/addons/upload/`, {
        method: "POST",
        headers: auth(token),
        body: form,
    });
    if (!res.ok)
        throw new Error(`upload failed: ${res.status} ${await res.text()}`);
    const data = (await res.json());
    console.log(`uploaded (uuid ${data.uuid}), waiting for validation ...`);
    return data.uuid;
}
async function waitForValidation(token, uuid) {
    for (let attempt = 0; attempt < 60; attempt++) {
        const res = await fetch(`${API}/addons/upload/${uuid}/`, { headers: auth(token) });
        if (!res.ok)
            throw new Error(`poll failed: ${res.status}`);
        const data = (await res.json());
        if (data.processed) {
            if (!data.valid) {
                throw new Error(`add-on failed validation:\n${JSON.stringify(data.validation, null, 2)}`);
            }
            console.log(`validated (warnings: ${data.validation?.warnings ?? 0}, errors: 0)`);
            return;
        }
        await sleep(5000);
    }
    throw new Error("timed out waiting for validation");
}
async function addonExists(token, addonId) {
    const res = await fetch(`${API}/addons/addon/${encodeURIComponent(addonId)}/`, {
        headers: auth(token),
    });
    if (res.status === 404)
        return false;
    if (!res.ok)
        throw new Error(`add-on lookup failed: ${res.status} ${await res.text()}`);
    return true;
}
async function createAddon(token, uuid) {
    const body = {
        ...LISTING,
        version: { ...LISTING.version, upload: uuid, release_notes: { "en-US": "Initial release." } },
    };
    const res = await fetch(`${API}/addons/addon/`, {
        method: "POST",
        headers: { ...auth(token), "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok)
        throw new Error(`add-on creation failed: ${res.status} ${await res.text()}`);
    return (await res.json());
}
async function createVersion(token, addonId, uuid) {
    const res = await fetch(`${API}/addons/addon/${encodeURIComponent(addonId)}/versions/`, {
        method: "POST",
        headers: { ...auth(token), "Content-Type": "application/json" },
        body: JSON.stringify({ upload: uuid }),
    });
    if (!res.ok)
        throw new Error(`version creation failed: ${res.status} ${await res.text()}`);
    return (await res.json());
}
// Unlisted signing is async: file.status goes unreviewed -> public and the
// url switches from .zip to .xpi. Wait for the signed .xpi before downloading.
async function waitForSigned(token, addonId, version, initialUrl) {
    let url = initialUrl;
    for (let i = 0; i < 40; i++) {
        if (url && url.endsWith(".xpi"))
            return url;
        await sleep(5000);
        const res = await fetch(`${API}/addons/addon/${encodeURIComponent(addonId)}/versions/${encodeURIComponent(version)}/`, { headers: auth(token) });
        if (res.ok) {
            const v = (await res.json());
            url = v.file?.url ?? url;
            if (v.file?.status === "public" && url.endsWith(".xpi"))
                return url;
        }
        else {
            console.log(`  waiting for signing ... (${res.status})`);
        }
    }
    throw new Error("timed out waiting for the signed XPI");
}
async function downloadSigned(url, version, token) {
    // The AMO download link for an unlisted add-on requires auth (it's the
    // developer copy), so send the JWT.
    const res = await fetch(url, { headers: auth(token) });
    if (!res.ok)
        throw new Error(`download failed: ${res.status}`);
    const dir = join(root, "beta");
    mkdirSync(dir, { recursive: true });
    const out = join(dir, `gramguru-beta-${version}.xpi`);
    writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    console.log(`signed add-on -> ${out}`);
    return out;
}
// Self-distributed (unlisted) add-ons update via an HTTPS update manifest.
// Record the freshly signed version so existing installs can find it.
const UPDATES_MANIFEST = join(root, "updates.json");
function recordUpdate(addonId, version, updateLink) {
    let doc = { addons: {} };
    try {
        doc = JSON.parse(readFileSync(UPDATES_MANIFEST, "utf8"));
    }
    catch {
        /* start fresh */
    }
    doc.addons ??= {};
    const entry = (doc.addons[addonId] ??= { updates: [] });
    entry.updates = (entry.updates ?? []).filter((u) => u.version !== version);
    entry.updates.push({ version, update_link: updateLink });
    entry.updates.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
    writeFileSync(UPDATES_MANIFEST, JSON.stringify(doc, null, 2) + "\n");
    console.log(`recorded ${version} in updates.json — commit & push to deliver the update`);
}
async function main() {
    const key = process.env.AMO_API_KEY;
    const secret = process.env.AMO_API_SECRET;
    const addonId = process.env.AMO_ADDON_ID ?? MANIFEST.browser_specific_settings?.gecko?.id;
    if (!key || !secret)
        throw new Error("Set AMO_API_KEY and AMO_API_SECRET (see .env.example).");
    if (!addonId)
        throw new Error("Set AMO_ADDON_ID (see .env.example).");
    const token = makeJwt(key, secret);
    const file = readFileSync(zipPath);
    console.log(`publishing ${basename(zipPath)} as ${channel} (add-on ${addonId}) ...`);
    const uuid = await upload(token, file);
    await waitForValidation(token, uuid);
    const exists = await addonExists(token, addonId);
    if (!exists) {
        if (channel !== "listed") {
            throw new Error(`add-on "${addonId}" does not exist; create it on AMO first (unlisted add-ons can't be auto-created).`);
        }
        const addon = (await createAddon(token, uuid));
        console.log(`created listing: ${addon.slug ?? addon.guid ?? addonId}`);
        console.log("submitted for review. Track status at https://addons.mozilla.org/developers/addons");
        return;
    }
    const version = (await createVersion(token, addonId, uuid));
    console.log(`created version ${version.version ?? "?"}`);
    if (channel === "listed") {
        console.log("submitted for review. Track status in the Developer Hub.");
    }
    else {
        const ver = version.version ?? MANIFEST.version;
        const signedUrl = await waitForSigned(token, addonId, ver, version.file?.url);
        const signedPath = await downloadSigned(signedUrl, ver, token);
        const updateLink = `${REPO_RAW_BASE}/beta/${basename(signedPath)}`;
        recordUpdate(addonId, ver, updateLink);
        console.log(`update_link -> ${updateLink}`);
        console.log("commit beta/ and updates.json, then push to deliver the update.");
    }
}
main().catch((err) => {
    console.error(`\n${String(err instanceof Error ? err.message : err)}`);
    process.exit(1);
});
