// Summary mode: Sarvam-105B condenses an article into a short spoken summary,
// which is then read aloud with the reading voice.

import { LLM_MODEL, MAX_ARTICLE_CHARS } from './podcast';
import { SARVAM_BASE_URL, SarvamError } from './sarvam';

export type SummaryLength = 'brief' | 'detailed';

export interface Summary {
  title: string;
  /** Spoken paragraphs, in order. */
  paragraphs: string[];
}

export interface SummaryRequest {
  title: string;
  /** Article text, paragraphs separated by blank lines. */
  text: string;
  length: SummaryLength;
}

const TARGET_WORDS: Record<SummaryLength, number> = { brief: 120, detailed: 300 };
const MAX_TOKENS = 1500;

export function buildSummaryMessages(req: SummaryRequest) {
  const words = TARGET_WORDS[req.length];
  const system = [
    'You summarise articles so they can be read aloud, in clear, natural Indian English.',
    'Rules:',
    '- Use only facts from the article. Do not invent numbers, names, quotes or claims.',
    '- Open with one sentence saying what the article is about, then cover the key points in order of importance, and end with the main takeaway.',
    '- Write flowing prose for the ear: short sentences, no headings, lists, bullet points, markdown, URLs or emojis.',
    '- Expand abbreviations the first time they appear.',
    `- Length: about ${words} words${req.length === 'detailed' ? ', in 2 to 4 short paragraphs separated by blank lines' : ', in one or two short paragraphs'}.`,
    'Output ONLY the summary text, with no preamble such as "Here is a summary".',
  ].join('\n');
  const article = req.text.length > MAX_ARTICLE_CHARS ? `${req.text.slice(0, MAX_ARTICLE_CHARS)}\n[…truncated]` : req.text;
  const user = `Article title: ${req.title}\n\nArticle:\n${article}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export async function generateSummary(apiKey: string, req: SummaryRequest, signal?: AbortSignal): Promise<Summary> {
  const res = await fetch(`${SARVAM_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: buildSummaryMessages(req),
      temperature: 0.3,
      max_tokens: MAX_TOKENS,
      reasoning_effort: null,
    }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const msg =
      res.status === 401 || res.status === 403
        ? 'Sarvam rejected the API key.'
        : res.status === 429
          ? 'Sarvam rate limit hit; try again shortly.'
          : `Sarvam error ${res.status} while writing the summary.`;
    throw new SarvamError(msg, res.status, body);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  return { title: req.title, paragraphs: parseSummary(json.choices?.[0]?.message?.content ?? '') };
}

/**
 * Turn the model output into speakable paragraphs. Tolerates reasoning blocks,
 * code fences, a preamble line, and markdown headings, bullets and emphasis.
 */
export function parseSummary(content: string): string[] {
  const text = content
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/^\s*(here is|here's|sure)[^\n]*:\s*$/im, '');
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .split('\n')
        .map((line) =>
          line
            .replace(/^\s*#{1,6}\s+/, '')
            .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
            .replace(/\*\*|__|(?<!\w)[*_](?=\S)|(?<=\S)[*_](?!\w)/g, ''),
        )
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    // A lone heading such as "Summary" isn't worth reading out.
    .filter((p) => p && !/^(summary|tl;?dr)[:.]?$/i.test(p));
  if (!paragraphs.length) throw new Error("Couldn't read the summary the model returned. Try again.");
  return paragraphs;
}
