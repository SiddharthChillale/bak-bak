import type { SarvamModel } from './sarvam';

// Sarvam has no voice-listing endpoint for stock voices, so these come from
// https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices (2026-10-10).

/** bulbul:v4-flash English (`_en_`) persona voices. */
export const V4_FLASH_EN_VOICES = [
  'aditi_en_stories', 'aparna_en_companion', 'aparna_en_edtech', 'ashwin_en_sports',
  'ashwin_en_sports_energetic', 'chandrika_en_stories', 'dev_en_recovery', 'dev_en_conversational',
  'deven_en_conversation', 'ishita_en_customer', 'ishita_en_medical', 'ishita_en_numbers',
  'ishita_en_social', 'ishita_en_stories', 'kalpit_en_edtech', 'nachiket_en_ads',
  'neha_en_customer', 'neha_en_latenight', 'nupur_en_kids', 'ojas_en_social', 'ritu_en_edtech',
  'ritu_en_latenight', 'ritu_en_medical', 'ritu_en_reels', 'rohan_en_recovery',
  'roopa_en_conversational', 'rustom_en_suspense', 'sanchita_en_companion',
  'sanchita_en_insurance', 'sanchita_en_recovery', 'sanchita_en_market', 'sanchita_en_social',
  'shabana_en_edtech', 'shalini_en_companion', 'shalini_en_customer', 'shubh_en_narration',
  'shubh_en_numbers', 'shubh_en_ads', 'shubh_en_recovery', 'shubh_en_audiobook',
  'shubh_en_narration_gentle', 'shubh_en_sports', 'simran_en_narration', 'simran_en_automobile',
  'simran_en_conversation', 'simran_en_customer', 'simran_en_edtech', 'simran_en_edtech_bot',
  'simran_en_sales', 'simran_en_recovery', 'simran_en_ads', 'simran_en_therapist',
  'sunny_en_social', 'varun_en_ads', 'varun_en_suspense', 'zarina_en_conversation',
  'amelia_en_conversational', 'sophia_en_conversational', 'girish_en_documentary',
  'girish_en_devotional', 'payal_en_edtech', 'sarang_en_narration',
] as const;

/** bulbul:v3 named speakers (all accept `en-IN`). */
export const V3_VOICES = [
  'shubh', 'aditya', 'ritu', 'priya', 'neha', 'rahul', 'pooja', 'rohan', 'simran', 'kavya',
  'amit', 'dev', 'ishita', 'shreya', 'ratan', 'varun', 'manan', 'sumit', 'roopa', 'kabir',
  'aayan', 'ashutosh', 'advait', 'anand', 'tanya', 'tarun', 'sunny', 'mani', 'gokul', 'vijay',
  'shruti', 'suhani', 'mohit', 'kavitha', 'rehan', 'soham', 'rupali',
] as const;

/** Voices whose style suggests long-form reading; audition these first. */
export const READING_SHORTLIST: Record<SarvamModel, readonly string[]> = {
  'bulbul:v4-flash': [
    'shubh_en_narration', 'shubh_en_audiobook', 'shubh_en_narration_gentle',
    'simran_en_narration', 'sarang_en_narration', 'girish_en_documentary',
    'aditi_en_stories', 'chandrika_en_stories', 'ishita_en_stories',
    'roopa_en_conversational', 'zarina_en_conversation', 'deven_en_conversation',
  ],
  'bulbul:v3': ['shubh', 'priya', 'aditya', 'ritu', 'kavya', 'rahul', 'simran', 'anand'],
};

export function voicesFor(model: SarvamModel): readonly string[] {
  return model === 'bulbul:v4-flash' ? V4_FLASH_EN_VOICES : V3_VOICES;
}

export const DEFAULT_VOICE: Record<SarvamModel, string> = {
  'bulbul:v4-flash': 'shubh_en_narration',
  'bulbul:v3': 'shubh',
};

/** shubh_en_narration → "Shubh · narration" */
export function prettyVoice(id: string): string {
  const [name = id, , ...style] = id.split('_');
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  return style.length ? `${cap} · ${style.join(' ')}` : cap;
}
