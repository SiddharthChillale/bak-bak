import { storage } from '#imports';

// Last position per article, so reopening a page continues where you stopped.

export interface ResumeEntry {
  index: number;
  total: number;
  at: number;
}

const MAX_ENTRIES = 300;

const resumeItem = storage.defineItem<Record<string, ResumeEntry>>('local:resume', { fallback: {} });

/** Ignore query/hash: they're mostly tracking params and anchors. */
export function pageKey(loc: Location = location): string {
  return loc.origin + loc.pathname;
}

export async function getResume(key: string): Promise<ResumeEntry | null> {
  return (await resumeItem.getValue())[key] ?? null;
}

let queue = Promise.resolve();

function update(fn: (all: Record<string, ResumeEntry>) => void): Promise<void> {
  queue = queue.then(async () => {
    const all = { ...(await resumeItem.getValue()) };
    fn(all);
    const keys = Object.keys(all);
    if (keys.length > MAX_ENTRIES) {
      keys
        .sort((a, b) => all[a]!.at - all[b]!.at)
        .slice(0, keys.length - MAX_ENTRIES)
        .forEach((k) => delete all[k]);
    }
    await resumeItem.setValue(all);
  });
  return queue;
}

export function saveResume(key: string, index: number, total: number): Promise<void> {
  return update((all) => (all[key] = { index, total, at: Date.now() }));
}

export function clearResume(key: string): Promise<void> {
  return update((all) => delete all[key]);
}
