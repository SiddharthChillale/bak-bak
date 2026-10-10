import { storage } from '#imports';
import type { SarvamModel, Transport } from './sarvam';

// `local:` keeps the API key on this device only (never synced).
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

export const paceItem = storage.defineItem<number>('local:pace', { fallback: 1 });
