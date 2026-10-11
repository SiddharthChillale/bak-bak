import { storage } from '#imports';
import type { PodcastLength } from './podcast';
import type { SarvamModel, Transport } from './sarvam';

// `local:` keeps everything (including the API key) on this device only; nothing is synced.
export const apiKeyItem = storage.defineItem<string>('local:sarvamApiKey', { fallback: '' });

export const modelItem = storage.defineItem<SarvamModel>('local:model', {
  fallback: 'bulbul:v4-flash',
});

export const voiceItem = storage.defineItem<string>('local:voice', {
  fallback: 'shubh_en_narration',
});

export const transportItem = storage.defineItem<Transport>('local:transport', {
  fallback: 'stream',
});

/** Sarvam `pace` (0.5–2.0); this is the playback speed control. */
export const paceItem = storage.defineItem<number>('local:pace', { fallback: 1 });

export interface ReadingPrefs {
  /** Silence between sentences in the same paragraph, ms. */
  sentencePauseMs: number;
  /** Silence between paragraphs/blocks, ms. */
  paragraphPauseMs: number;
  skipCode: boolean;
  skipTables: boolean;
  /** Sentences synthesised ahead of the one playing. */
  prefetch: number;
  autoscroll: boolean;
  /** Ask before reading an article longer than this many characters (0 = never ask). */
  confirmAboveChars: number;
  /** Continue from the last position when reopening an article. */
  resume: boolean;
}

export const DEFAULT_PREFS: ReadingPrefs = {
  sentencePauseMs: 150,
  paragraphPauseMs: 450,
  skipCode: true,
  skipTables: true,
  prefetch: 2,
  autoscroll: true,
  confirmAboveChars: 30_000,
  resume: true,
};

export const prefsItem = storage.defineItem<ReadingPrefs>('local:prefs', { fallback: DEFAULT_PREFS });

export async function getPrefs(): Promise<ReadingPrefs> {
  return { ...DEFAULT_PREFS, ...(await prefsItem.getValue()) };
}

export const cacheLimitMbItem = storage.defineItem<number>('local:cacheLimitMb', { fallback: 200 });

export const SPEED_STEPS = [0.75, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

export interface PodcastPrefs {
  length: PodcastLength;
  /** Host voices per model (A = lead host, B = co-host); '' until the user picks one. */
  hosts: Record<SarvamModel, { A: string; B: string }>;
}

export const DEFAULT_PODCAST: PodcastPrefs = {
  length: 'short',
  hosts: {
    'bulbul:v4-flash': { A: '', B: '' },
    'bulbul:v3': { A: '', B: '' },
  },
};

export const podcastItem = storage.defineItem<PodcastPrefs>('local:podcast', { fallback: DEFAULT_PODCAST });

export async function getPodcastPrefs(): Promise<PodcastPrefs> {
  const v = await podcastItem.getValue();
  return { ...DEFAULT_PODCAST, ...v, hosts: { ...DEFAULT_PODCAST.hosts, ...v.hosts } };
}

/**
 * Opt-in: detect readable articles on every site (toolbar dot, Alt+click before opening the
 * player). Needs the optional all-sites host permission; off by default.
 */
export const autoDetectItem = storage.defineItem<boolean>('local:autoDetect', { fallback: false });
