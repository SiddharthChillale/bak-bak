// Podcast mode: Sarvam-105B turns an article into a two-host conversation
// script, which is then voiced turn by turn with two Bulbul voices.

import { SARVAM_BASE_URL, SarvamError } from './sarvam';

export type HostId = 'A' | 'B';

export interface PodcastTurn {
  speaker: HostId;
  text: string;
}

export interface PodcastScript {
  title: string;
  turns: PodcastTurn[];
}

export type PodcastLength = 'short' | 'standard';

export interface ScriptRequest {
  title: string;
  /** Article text, paragraphs separated by blank lines. */
  text: string;
  hosts: Record<HostId, string>;
  length: PodcastLength;
}

export const LLM_MODEL = 'sarvam-105b';
/** Article characters sent to the LLM (≈ 15k tokens; the model has a 128k context). */
export const MAX_ARTICLE_CHARS = 60_000;
const TARGET_WORDS: Record<PodcastLength, number> = { short: 700, standard: 1400 };
const TARGET_MINUTES: Record<PodcastLength, string> = { short: 'about 5 minutes', standard: 'about 10 minutes' };
/** Fits the Starter tier's 4,096 output-token cap with reasoning off. */
const MAX_TOKENS = 4000;

export function buildMessages(req: ScriptRequest) {
  const { A, B } = req.hosts;
  const words = TARGET_WORDS[req.length];
  const podcast_prompt = `Act as an expert AI podcast scriptwriter and audio director.
  Your task is to write a natural, engaging, two-person conversational podcast script (style similar to Google NotebookLM Audio Overviews or Google AI Studio multi-speaker formats).

  ### Context & Topic
  - Source Material: the article in the user message. Use only facts from it; do not invent numbers, names, quotes or claims.
  - Target Duration: ${TARGET_MINUTES[req.length]} of audio, about ${words} words in total.
  - Target Audience Level: curious general listeners, not experts. Explain jargon and expand abbreviations the first time they appear.
  - Language: natural Indian English.

  ### Host Roles & Voices
  - Speaker 1 (speaker "A", Host ${A} / Curious Lead): Energetic, asks the questions the listener is thinking, frames the big picture, uses relatable analogies.
  - Speaker 2 (speaker "B", Host ${B} / Subject Expert): Knowledgeable, breaks down complex ideas simply, reacts naturally, adds depth without sounding like a textbook.

  ### Formatting & Delivery
  - Every word of "text" is read aloud by a text-to-speech voice, so write only what the host says.
  - Use spoken-word formatting: short sentences, conversational interruptions ("Right," "Wait—so you're saying..."), natural reactions ("Ha!", "Hmm,") and brief thinking pauses.
  - Show pauses and tone through punctuation and word choice (commas, "...", an em dash), never with bracketed or parenthesised cues such as [pause], [chuckle] or (laughs), stage directions, sound effects, markdown, URLs or emojis.
  - Avoid formal essay structures, rigid bullet-point readouts, or robotic transitions ("In conclusion...", "Moving on to point number two...").

  ### Structure Requirements
  1. Cold Open: Jump straight into a surprising hook, a weird fact, or a relatable scenario from the source material—no generic "Welcome back to the show!".
  2. Context Setting: Quickly establish why this topic matters right now.
  3. Core Exploration: Back-and-forth breakdown of the 2-3 most important takeaways, using a real-world analogy.
  4. Perspective Shift: A moment where one host challenges an assumption or looks at the flip side of the topic.
  5. Reflective Close: A quick, punchy takeaway or actionable thought for the listener to walk away with.
  Output ONLY a JSON object, with no text before or after it:

  {"title": string, "turns": [{"speaker": "A" | "B", "text": string}]}`
  const system = podcast_prompt;
  const article = req.text.length > MAX_ARTICLE_CHARS ? `${req.text.slice(0, MAX_ARTICLE_CHARS)}\n[…truncated]` : req.text;
  const user = `Article title: ${req.title}\n\nArticle:\n${article}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export async function generateScript(apiKey: string, req: ScriptRequest, signal?: AbortSignal): Promise<PodcastScript> {
  const res = await fetch(`${SARVAM_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: buildMessages(req),
      temperature: 0.7,
      max_tokens: MAX_TOKENS,
      // Reasoning tokens count against max_tokens; the script needs the room.
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
          : `Sarvam error ${res.status} while writing the podcast script.`;
    throw new SarvamError(msg, res.status, body);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const content = json.choices?.[0]?.message?.content ?? '';
  return parseScript(content, req.hosts);
}

/**
 * Parse the model output into a script. Tolerates code fences, prose around the
 * JSON, host names instead of A/B, and a truncated tail (keeps complete turns).
 */
export function parseScript(content: string, hosts?: Record<HostId, string>): PodcastScript {
  const toSpeaker = (s: unknown): HostId | null => {
    const v = String(s ?? '').trim();
    if (v === 'A' || v === 'B') return v;
    if (hosts) {
      if (v.toLowerCase() === hosts.A.toLowerCase()) return 'A';
      if (v.toLowerCase() === hosts.B.toLowerCase()) return 'B';
    }
    return null;
  };
  const clean = (turns: unknown[]): PodcastTurn[] =>
    turns.flatMap((t) => {
      const turn = t as { speaker?: unknown; text?: unknown };
      const speaker = toSpeaker(turn.speaker);
      const text = typeof turn.text === 'string' ? spoken(turn.text) : '';
      return speaker && text ? [{ speaker, text }] : [];
    });

  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(content.slice(start, end + 1)) as { title?: unknown; turns?: unknown };
      if (Array.isArray(obj.turns)) {
        const turns = clean(obj.turns);
        if (turns.length) return { title: typeof obj.title === 'string' ? obj.title : '', turns };
      }
    } catch {
      // Fall through to the lenient scan (e.g. output cut off mid-JSON).
    }
  }

  const turns: PodcastTurn[] = [];
  const re = /"speaker"\s*:\s*"([^"]+)"\s*,\s*"text"\s*:\s*("(?:[^"\\]|\\.)*")/g;
  for (const m of content.matchAll(re)) {
    const speaker = toSpeaker(m[1]);
    let text = '';
    try {
      text = JSON.parse(m[2]!) as string;
    } catch {
      continue;
    }
    text = spoken(text);
    if (speaker && text) turns.push({ speaker, text });
  }
  if (!turns.length) throw new Error("Couldn't read the podcast script the model returned. Try again.");
  const title = /"title"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(content)?.[1];
  return { title: title ? (JSON.parse(title) as string) : '', turns };
}

/** Delivery cues the voice would read out literally: [pause], [empathetic tone], (laughs), *chuckles*. */
const CUE = /\[[^\]]*\]|\((?:laughs?|laughing|chuckles?|chuckling|giggles?|sighs?|pauses?|beat|smiles?|grins?)[^)]*\)|\*[^*]+\*/gi;

/** A turn's text as it should be spoken: cues removed, whitespace collapsed. */
function spoken(text: string): string {
  return text
    .replace(CUE, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Rough cost of voicing a script (Bulbul, per character). */
export function scriptChars(script: PodcastScript): number {
  return script.turns.reduce((n, t) => n + t.text.length, 0);
}
