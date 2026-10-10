import type { SarvamModel } from './sarvam';

/** Port name for content-script ⇄ background synthesis traffic. */
export const TTS_PORT = 'tts';

export interface VoiceSettings {
  model: SarvamModel;
  speaker: string;
  pace: number;
}

/** Content script → background over the `tts` port. */
export type TtsPortRequest =
  | { type: 'synthesize'; id: number; text: string; voice: VoiceSettings }
  /** Drop a request that hasn't been sent to Sarvam yet (no-op once in flight). */
  | { type: 'cancel'; id: number };

/**
 * Background → content script over the `tts` port.
 * Audio travels as base64 because Chrome's extension messaging is JSON-only.
 */
export type TtsPortResponse =
  | { type: 'audio'; id: number; base64: string; mime: string; cached: boolean }
  | { type: 'error'; id: number; message: string; status?: number; cancelled?: boolean };

export type PlayerCommand =
  /** Toolbar button / Alt+Shift+R: start reading the article, or play/pause. */
  | 'toggle'
  | 'read-page'
  | 'read-from-selection'
  | 'next'
  | 'prev'
  /** Another tab started reading. */
  | 'pause';

/** Background → content script via tabs.sendMessage. */
export type ToContent = { type: 'command'; command: PlayerCommand };

/** Content script / options page → background via runtime.sendMessage. */
export type ToBackground =
  | { type: 'readerable'; value: boolean }
  /** This tab started playing; pause any other tab. */
  | { type: 'playing' }
  | { type: 'open-options' };
