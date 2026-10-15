// Content script: walks the page, wraps convertible units in markers, and
// reports the conversion count for the toolbar badge.
//
// Recipe sites love to split "1,5 dl melk" across three inline <span>s, so we
// match across a whole leaf block (li/p/td/...) rather than per text node.

import { convertText, type ConversionMatch } from "./convert.ts";

const MARK = "gg";
const HAS_NUMBER = /\d|[½¼¾⅓⅔⅛⅜⅝⅞]/;

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "OPTION",
  "CODE",
  "PRE",
  "KBD",
  "SAMP",
  "SVG",
  "MATH",
]);

// Tags treated as inline (not block boundaries). Everything else ends a block.
const INLINE = new Set([
  "A", "ABBR", "B", "BDI", "BDO", "BIG", "BR", "CITE", "CODE", "DATA", "DFN",
  "EM", "FONT", "I", "KBD", "LABEL", "MARK", "Q", "RP", "RT", "RUBY", "S",
  "SAMP", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "TIME", "TT", "U", "VAR",
  "WBR",
]);

const processedBlocks = new WeakSet<Element>();
let observer: MutationObserver | null = null;
let scheduled = false;
let total = 0;
let markSeq = 0;

interface Portion {
  from: number;
  to: number;
  match: ConversionMatch;
  id: string;
  isEnd: boolean;
}

function isSkipped(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  if (SKIP_TAGS.has(parent.tagName)) return true;
  if (parent.closest("." + MARK)) return true;
  return parent.isContentEditable;
}

function collectLeafBlocks(root: Element, out: Element[]): void {
  if (SKIP_TAGS.has(root.tagName)) return;
  const blockChildren = Array.from(root.children).filter(
    (child) => !INLINE.has(child.tagName),
  );
  if (blockChildren.length === 0) {
    if (root.textContent && root.textContent.trim() !== "") out.push(root);
    return;
  }
  for (const child of blockChildren) collectLeafBlocks(child, out);
}

function makeSpan(match: ConversionMatch, portion: Portion, content: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className =
    MARK +
    (portion.isEnd ? " gg-end" : "") +
    (match.approximate ? " gg-approx" : "") +
    (match.imperial ? " gg-imperial" : "");
  span.dataset.ggId = portion.id;
  span.dataset.gg = match.metric;
  span.title = match.note;
  span.setAttribute("aria-label", match.note);
  span.textContent = content;
  return span;
}

function annotateBlock(block: Element): number {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node as Text;
      if (!text.nodeValue || text.nodeValue.length > 400) {
        return NodeFilter.FILTER_REJECT;
      }
      return isSkipped(text) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  if (nodes.length === 0) return 0;

  // Flatten the block's inline text, remembering where each node lives.
  const map: { node: Text; start: number; end: number }[] = [];
  let joined = "";
  for (const textNode of nodes) {
    const value = textNode.nodeValue ?? "";
    map.push({ node: textNode, start: joined.length, end: joined.length + value.length });
    joined += value;
  }
  if (!HAS_NUMBER.test(joined)) return 0;

  const matches = convertText(joined);
  if (matches.length === 0) return 0;

  const portions = new Map<Text, Portion[]>();
  for (const match of matches) {
    const id = `${block.tagName}#${markSeq++}`;
    for (const entry of map) {
      if (entry.start >= match.end || entry.end <= match.start) continue;
      const from = Math.max(match.start, entry.start) - entry.start;
      const to = Math.min(match.end, entry.end) - entry.start;
      const isEnd = entry.start + to === match.end;
      const list = portions.get(entry.node) ?? [];
      list.push({ from, to, match, id, isEnd });
      portions.set(entry.node, list);
    }
  }

  for (const [textNode, list] of portions) {
    list.sort((a, b) => a.from - b.from);
    const value = textNode.nodeValue ?? "";
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const portion of list) {
      if (portion.from > cursor) {
        fragment.appendChild(document.createTextNode(value.slice(cursor, portion.from)));
      }
      fragment.appendChild(
        makeSpan(portion.match, portion, value.slice(portion.from, portion.to)),
      );
      cursor = portion.to;
    }
    if (cursor < value.length) {
      fragment.appendChild(document.createTextNode(value.slice(cursor)));
    }
    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  return matches.length;
}

function scan(root: Element): void {
  if (!root.isConnected) return;
  const blocks: Element[] = [];
  collectLeafBlocks(root, blocks);

  let added = 0;
  for (const block of blocks) {
    if (processedBlocks.has(block)) continue;
    processedBlocks.add(block);
    added += annotateBlock(block);
  }

  if (added > 0) {
    total += added;
    report();
  }
}

function report(): void {
  void browser.runtime.sendMessage({ type: "gg-count", count: total }).catch(() => {
    /* no background listener; ignore */
  });
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    scan(document.body);
  }, 500);
}

function start(): void {
  scan(document.body);
  observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.addedNodes.length > 0)) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function stop(): void {
  observer?.disconnect();
  observer = null;
  for (const el of document.querySelectorAll("." + MARK)) {
    el.parentNode?.replaceChild(document.createTextNode(el.textContent ?? ""), el);
  }
  total = 0;
  report();
}

async function init(): Promise<void> {
  const { enabled = true } = await browser.storage.local.get("enabled");
  if (enabled) start();

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !("enabled" in changes)) return;
    if (changes.enabled.newValue) {
      if (!observer) start();
    } else {
      stop();
    }
  });
}

const ggWindow = window as unknown as { __gramGuruLoaded?: boolean };
if (!ggWindow.__gramGuruLoaded) {
  ggWindow.__gramGuruLoaded = true;
  init().catch((err) => console.error("[GramGuru]", err));
}
