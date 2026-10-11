// Article detection and extraction. Readability decides *which* parts of the
// page are the article; we then read the text from the live page elements so
// highlighting and click-to-jump work in place.

import { Readability, isProbablyReaderable } from '@mozilla/readability';
import { chunkSpans, isSpeakable, toSpeech } from './segment';
import { TextMap } from './textmap';

export interface Block {
  /** Live page element the block's text lives in; null if it couldn't be mapped. */
  el: Element | null;
  map: TextMap | null;
  /** Range of the block inside `map.text` (or inside `text` when unmapped). */
  start: number;
  end: number;
  text: string;
  heading: boolean;
}

export interface Chunk {
  index: number;
  block: number;
  /** Offsets inside the block's map (or text) for highlighting. */
  start: number;
  end: number;
  display: string;
  speech: string;
}

export interface ArticleDoc {
  kind: 'article' | 'selection' | 'podcast';
  title: string;
  blocks: Block[];
  chunks: Chunk[];
  /** Total characters that will be sent for synthesis. */
  speechChars: number;
}

export interface ExtractOptions {
  skipCode: boolean;
  skipTables: boolean;
  /** Link-preview cards and social embeds: another page's headline, summary and domain. */
  skipEmbeds: boolean;
  skipCaptions: boolean;
  /** Elements to leave out of the clone Readability sees (e.g. our own UI host). */
  exclude?: Element[];
}

const ID_ATTR = 'data-readaloud-id';
const BLOCK_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'figcaption', 'dt', 'dd', 'td', 'th', 'div'];
const BLOCK_SELECTOR = BLOCK_TAGS.join(',');

/** A link to another page (not an in-page anchor like a heading permalink). */
const OUTBOUND_LINK = 'a[href]:not([href^="#"])';
/** Embed containers that aren't a single link, or whose script hasn't replaced them yet. */
const EMBED_SELECTOR = [
  '.embedded-post-wrap', // Substack
  '.kg-bookmark-card', // Ghost
  '.wp-block-embed', // WordPress
  'blockquote.twitter-tweet',
  'blockquote.instagram-media',
  'blockquote.tiktok-embed',
  'blockquote.reddit-embed-bq',
  'blockquote.bluesky-embed',
].join(',');
/** Short blocks that are mostly link text ("Related: …", a bare URL) count as embeds too. */
const LINK_ONLY_MAX_CHARS = 200;
const LINK_ONLY_DENSITY = 0.8;

export function isReaderable(doc: Document = document): boolean {
  try {
    return isProbablyReaderable(doc);
  } catch {
    return false;
  }
}

export function extractArticle(doc: Document, opts: ExtractOptions): ArticleDoc | null {
  const { clone, originals } = tagClone(doc, opts.exclude ?? []);
  const article = new Readability(clone, { serializer: (el: Node) => el as Element, charThreshold: 300 }).parse();
  if (!article?.content) return null;
  const root = article.content as unknown as Element;

  const blocks: Block[] = [];
  const ancestorMaps = new Map<Element, { map: TextMap; cursor: number }>();

  for (const leaf of leafBlocks(root)) {
    if (opts.skipCode && leaf.closest('pre, code')) continue;
    if (opts.skipTables && leaf.closest('table')) continue;
    if (opts.skipCaptions && leaf.closest('figcaption')) continue;
    const heading = /^H[1-6]$/.test(leaf.tagName.toUpperCase());
    if (opts.skipEmbeds && isEmbed(leaf, heading, originals)) continue;

    const ownId = leaf.getAttribute(ID_ATTR);
    const own = ownId != null ? originals[Number(ownId)] : undefined;
    if (own) {
      const map = TextMap.build(own);
      if (map.text) blocks.push({ el: own, map, start: 0, end: map.text.length, text: map.text, heading });
      continue;
    }

    // Readability created this element (e.g. wrapped loose text in a <p>):
    // find its text inside the nearest original ancestor.
    const text = normalize(leaf.textContent ?? '');
    if (!text) continue;
    const anc = leaf.parentElement?.closest(`[${ID_ATTR}]`);
    const ancEl = anc ? originals[Number(anc.getAttribute(ID_ATTR))] : undefined;
    if (ancEl) {
      let entry = ancestorMaps.get(ancEl);
      if (!entry) ancestorMaps.set(ancEl, (entry = { map: TextMap.build(ancEl), cursor: 0 }));
      const at = entry.map.text.indexOf(text, entry.cursor);
      if (at >= 0) {
        entry.cursor = at + text.length;
        blocks.push({ el: ancEl, map: entry.map, start: at, end: at + text.length, text, heading });
        continue;
      }
    }
    blocks.push({ el: null, map: null, start: 0, end: text.length, text, heading });
  }

  let title = normalize(article.title ?? doc.title ?? '');
  if (title && normalize(blocks[0]?.text ?? '') !== title) {
    const tb = titleBlock(doc, title);
    blocks.unshift(tb);
    // The on-page heading usually lacks the " | Site name" suffix of <title>.
    title = tb.text;
  }

  return buildDoc('article', title, blocks);
}

/** A document made of just the current selection (for pages that aren't articles). */
export function docFromSelection(sel: Selection): ArticleDoc | null {
  const blocks: Block[] = [];
  for (let i = 0; i < sel.rangeCount; i++) {
    const range = sel.getRangeAt(i);
    if (range.collapsed) continue;
    const container = range.commonAncestorContainer;
    const el = container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement;
    if (!el) continue;
    const map = TextMap.build(el);
    let start = Math.max(0, map.indexOf(range.startContainer, range.startOffset));
    let end = map.indexOf(range.endContainer, range.endOffset);
    if (end <= start) end = map.text.length;
    while (start < end && map.text[start] === ' ') start++;
    while (end > start && map.text[end - 1] === ' ') end--;
    if (end > start) blocks.push({ el, map, start, end, text: map.text.slice(start, end), heading: false });
  }
  if (!blocks.length) {
    const text = normalize(sel.toString());
    if (!text) return null;
    blocks.push({ el: null, map: null, start: 0, end: text.length, text, heading: false });
  }
  return buildDoc('selection', 'Selection', blocks);
}

/** A document from plain texts (not in the page), e.g. podcast turns: one block per text. */
export function docFromTexts(kind: ArticleDoc['kind'], title: string, texts: string[]): ArticleDoc {
  const blocks = texts.map((t) => {
    const text = normalize(t);
    return { el: null, map: null, start: 0, end: text.length, text, heading: false };
  });
  return buildDoc(kind, title, blocks);
}

/** Article text for the podcast writer: blocks as paragraphs, headings marked. */
export function articleText(doc: ArticleDoc): string {
  return doc.blocks
    .map((b) => {
      const text = (b.map ? b.map.text : b.text).slice(b.start, b.end);
      return b.heading ? `## ${text}` : text;
    })
    .join('\n\n');
}

/** Chunk index for a position in the live page, or -1 if it's outside the doc. */
export function locate(doc: ArticleDoc, node: Node, offset: number): number {
  for (let b = 0; b < doc.blocks.length; b++) {
    const block = doc.blocks[b]!;
    if (!block.map || !block.el?.contains(node) || !block.map.contains(node)) continue;
    const at = block.map.indexOf(node, offset);
    if (at < block.start || at >= block.end) continue;
    const inBlock = doc.chunks.filter((c) => c.block === b);
    const hit = inBlock.find((c) => at >= c.start && at < c.end) ?? inBlock.find((c) => c.start >= at) ?? inBlock.at(-1);
    if (hit) return hit.index;
  }
  return -1;
}

export function chunkRange(doc: ArticleDoc, chunk: Chunk): Range | null {
  const block = doc.blocks[chunk.block];
  return block?.map ? block.map.range(chunk.start, chunk.end) : null;
}

function buildDoc(kind: ArticleDoc['kind'], title: string, blocks: Block[]): ArticleDoc {
  const chunks: Chunk[] = [];
  let speechChars = 0;
  blocks.forEach((block, b) => {
    const source = block.map ? block.map.text : block.text;
    const text = source.slice(block.start, block.end);
    const spans = block.heading ? [{ start: 0, end: text.length }] : chunkSpans(text);
    for (const s of spans) {
      const display = text.slice(s.start, s.end);
      const speech = toSpeech(display);
      if (!isSpeakable(speech)) continue;
      speechChars += speech.length;
      chunks.push({ index: chunks.length, block: b, start: block.start + s.start, end: block.start + s.end, display, speech });
    }
  });
  return { kind, title, blocks, chunks, speechChars };
}

/**
 * Clone the document for Readability, tagging each cloned element with the index
 * of its original. The live page is never mutated: cloneNode is isomorphic, so
 * walking both trees in document order pairs every element with its copy.
 */
function tagClone(doc: Document, exclude: Element[]): { clone: Document; originals: Element[] } {
  const clone = doc.cloneNode(true) as Document;
  const originals = Array.from(doc.documentElement.querySelectorAll('*'));
  const copies = clone.documentElement.querySelectorAll('*');
  const n = Math.min(originals.length, copies.length);
  for (let i = 0; i < n; i++) copies[i]!.setAttribute(ID_ATTR, String(i));
  for (const ex of exclude) {
    const i = originals.indexOf(ex);
    if (i >= 0 && i < n) copies[i]!.remove();
  }
  return { clone, originals };
}

/**
 * Link-preview cards (Medium, Substack, Ghost…) wrap a whole headline/summary/domain
 * block in one link, whereas an inline link sits *inside* a paragraph. So a block with
 * an outbound-link ancestor is a card. Checked on the live element too, in case
 * Readability dropped the wrapper.
 */
function isEmbed(leaf: Element, heading: boolean, originals: Element[]): boolean {
  const tagged = leaf.closest(`[${ID_ATTR}]`);
  const live = tagged ? originals[Number(tagged.getAttribute(ID_ATTR))] : undefined;
  const sel = `${OUTBOUND_LINK},${EMBED_SELECTOR}`;
  if (leaf.closest(sel) || live?.closest(sel)) return true;

  if (heading || leaf.closest('li')) return false;
  const text = normalize(leaf.textContent ?? '');
  if (!text || text.length > LINK_ONLY_MAX_CHARS) return false;
  let linked = 0;
  for (const a of leaf.querySelectorAll(OUTBOUND_LINK)) linked += normalize(a.textContent ?? '').length;
  return linked / text.length >= LINK_ONLY_DENSITY;
}

function* leafBlocks(root: Element): Generator<Element> {
  for (const el of root.querySelectorAll(BLOCK_SELECTOR)) {
    if (!el.querySelector(BLOCK_SELECTOR)) yield el;
  }
  // The root itself can be a leaf when the article is a single block.
  if (!root.querySelector(BLOCK_SELECTOR)) yield root;
}

function titleBlock(doc: Document, title: string): Block {
  for (const h of doc.querySelectorAll('h1, h2')) {
    const map = TextMap.build(h);
    if (map.text === title || (map.text.length > 0 && title.includes(map.text) && map.text.length > title.length / 2)) {
      return { el: h, map, start: 0, end: map.text.length, text: map.text, heading: true };
    }
  }
  return { el: null, map: null, start: 0, end: title.length, text: title, heading: true };
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
