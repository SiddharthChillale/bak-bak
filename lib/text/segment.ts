// Split a block's text into speakable chunks: one sentence each, so seeking and
// highlighting are exact. Very short sentences merge into the next one (better
// prosody, fewer requests); very long ones split at clause punctuation.

export interface Span {
  start: number;
  end: number;
}

export const MIN_CHUNK_CHARS = 25;
export const MAX_CHUNK_CHARS = 450;

let segmenter: Intl.Segmenter | null = null;

export function sentenceSpans(text: string, lang = 'en'): Span[] {
  segmenter ??= new Intl.Segmenter(lang, { granularity: 'sentence' });
  const spans: Span[] = [];
  for (const { index, segment } of segmenter.segment(text)) {
    const trimmed = trimSpan(text, index, index + segment.length);
    if (trimmed) spans.push(trimmed);
  }
  return spans;
}

export function chunkSpans(text: string, lang = 'en'): Span[] {
  const merged: Span[] = [];
  for (const s of sentenceSpans(text, lang)) {
    const prev = merged.at(-1);
    if (prev && prev.end - prev.start < MIN_CHUNK_CHARS && s.end - prev.start <= MAX_CHUNK_CHARS) {
      prev.end = s.end;
    } else {
      merged.push({ ...s });
    }
  }
  // A short trailing sentence joins the previous chunk instead of standing alone.
  const last = merged.at(-1);
  const beforeLast = merged.at(-2);
  if (last && beforeLast && last.end - last.start < MIN_CHUNK_CHARS && last.end - beforeLast.start <= MAX_CHUNK_CHARS) {
    beforeLast.end = last.end;
    merged.pop();
  }
  return merged.flatMap((s) => splitLong(text, s));
}

function splitLong(text: string, span: Span): Span[] {
  const out: Span[] = [];
  let { start } = span;
  while (span.end - start > MAX_CHUNK_CHARS) {
    const window = text.slice(start, start + MAX_CHUNK_CHARS);
    // Prefer a clause break in the back half of the window, then any space.
    let cut = -1;
    for (const re of [/[;:—–]\s/g, /,\s/g, /\s/g]) {
      for (const m of window.matchAll(re)) {
        if (m.index! > MAX_CHUNK_CHARS / 2) cut = m.index! + 1;
      }
      if (cut > 0) break;
    }
    if (cut <= 0) cut = MAX_CHUNK_CHARS;
    const piece = trimSpan(text, start, start + cut);
    if (piece) out.push(piece);
    start += cut;
  }
  const rest = trimSpan(text, start, span.end);
  if (rest) out.push(rest);
  return out;
}

function trimSpan(text: string, start: number, end: number): Span | null {
  while (start < end && /\s/.test(text[start]!)) start++;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  return end > start ? { start, end } : null;
}

/** Text actually sent to Sarvam for a chunk: drop citation markers, shorten URLs. */
export function toSpeech(display: string): string {
  return display
    .replace(/\[(?:\d+|[a-z]|citation needed|note \d+)(?:[,–-]\s?\d+)*\]/gi, '')
    .replace(/\bhttps?:\/\/(?:www\.)?([^\s/]+)\S*/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when a chunk has something worth speaking. */
export function isSpeakable(speech: string): boolean {
  return /[\p{L}\p{N}]/u.test(speech);
}
