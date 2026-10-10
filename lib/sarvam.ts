// Minimal Sarvam Bulbul client. Runs in any extension context with fetch
// (background service worker / event page, extension pages).

export const SARVAM_BASE_URL = 'https://api.sarvam.ai';

export type SarvamModel = 'bulbul:v4-flash' | 'bulbul:v3';
export type Transport = 'rest' | 'stream';

export interface SynthRequest {
  text: string;
  model: SarvamModel;
  speaker: string;
  transport: Transport;
  pace?: number;
  temperature?: number;
  languageCode?: string;
  sampleRate?: 8000 | 16000 | 22050 | 24000;
}

export interface SynthTimings {
  /** ms from request start until response headers arrived */
  headersMs: number;
  /** ms from request start until the first audio byte (stream) or the JSON body (rest) arrived */
  firstByteMs: number;
  /** ms from request start until all audio bytes were available */
  totalMs: number;
  bytes: number;
}

export interface SynthResult {
  audio: Uint8Array;
  mime: string;
  timings: SynthTimings;
}

export class SarvamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'SarvamError';
  }
}

export async function synthesize(
  apiKey: string,
  req: SynthRequest,
  signal?: AbortSignal,
): Promise<SynthResult> {
  const body = {
    text: req.text,
    language_code: req.languageCode ?? 'en-IN',
    model: req.model,
    speaker: req.speaker,
    pace: req.pace ?? 1,
    temperature: req.temperature,
    speech_sample_rate: req.sampleRate ?? 24000,
    output_audio_codec: 'mp3',
  };
  const path = req.transport === 'stream' ? '/text-to-speech/stream' : '/text-to-speech';

  const t0 = performance.now();
  const res = await fetch(SARVAM_BASE_URL + path, {
    method: 'POST',
    headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const headersMs = performance.now() - t0;

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new SarvamError(describeError(res.status, text), res.status, text);
  }

  if (req.transport === 'rest') {
    const json = (await res.json()) as { audios: string[] };
    const firstByteMs = performance.now() - t0;
    const audio = concat(json.audios.map(base64ToBytes));
    return {
      audio,
      mime: 'audio/mpeg',
      timings: { headersMs, firstByteMs, totalMs: performance.now() - t0, bytes: audio.byteLength },
    };
  }

  // Streaming: read the raw audio byte stream, noting when the first chunk lands.
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let firstByteMs = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (firstByteMs < 0) firstByteMs = performance.now() - t0;
    chunks.push(value);
  }
  const audio = concat(chunks);
  return {
    audio,
    mime: res.headers.get('content-type') ?? 'audio/mpeg',
    timings: { headersMs, firstByteMs, totalMs: performance.now() - t0, bytes: audio.byteLength },
  };
}

function describeError(status: number, body: string): string {
  if (status === 401 || status === 403) return 'Sarvam rejected the API key.';
  if (status === 429) return 'Sarvam rate limit hit; try again shortly.';
  if (status === 402) return 'Sarvam account is out of credits.';
  let detail = '';
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.error?.message ?? parsed?.detail ?? '';
  } catch {
    detail = body.slice(0, 200);
  }
  return `Sarvam error ${status}${detail ? `: ${detail}` : ''}`;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}
