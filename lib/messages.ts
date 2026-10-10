import type { SynthRequest, SynthTimings } from './sarvam';

/** Port name for content-script ⇄ background synthesis traffic. */
export const TTS_PORT = 'tts';

/** Content script → background over the `tts` port. */
export type TtsPortRequest = {
  type: 'synthesize';
  id: number;
  text: string;
  /** Overrides on top of the saved settings. */
  overrides?: Partial<Omit<SynthRequest, 'text'>>;
};

/**
 * Background → content script over the `tts` port.
 * Audio travels as base64 because Chrome's extension messaging is JSON-only.
 */
export type TtsPortResponse =
  | { type: 'audio'; id: number; base64: string; mime: string; timings: SynthTimings; speaker: string; model: string }
  | { type: 'error'; id: number; message: string; status?: number };

/** Background → content script via tabs.sendMessage (context menu / keyboard command). */
export type SpeakCommand = {
  type: 'speak';
  /** Selection text from the context menu; absent for the keyboard command. */
  text?: string;
  trigger: 'context-menu' | 'command';
};
