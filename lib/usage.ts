import { storage } from '#imports';

// Characters billed by Sarvam (cache misses) vs. served from cache, per month.

export interface MonthUsage {
  billedChars: number;
  requests: number;
  cachedChars: number;
}

export const usageItem = storage.defineItem<Record<string, MonthUsage>>('local:usage', { fallback: {} });

/** ₹30 per 10k characters (Bulbul v3 list price; v4-flash price unpublished as of 2026-10-10). */
export const INR_PER_CHAR = 30 / 10_000;

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

let queue = Promise.resolve();

/** Serialised so concurrent requests don't lose increments. */
export function recordUsage(chars: number, cached: boolean): Promise<void> {
  queue = queue.then(async () => {
    const all = await usageItem.getValue();
    const key = monthKey();
    const m = all[key] ?? { billedChars: 0, requests: 0, cachedChars: 0 };
    if (cached) m.cachedChars += chars;
    else {
      m.billedChars += chars;
      m.requests += 1;
    }
    await usageItem.setValue({ ...all, [key]: m });
  });
  return queue;
}

export function formatInr(chars: number): string {
  const inr = chars * INR_PER_CHAR;
  return `₹${inr < 10 ? inr.toFixed(2) : Math.round(inr)}`;
}
