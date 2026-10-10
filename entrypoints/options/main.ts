import { cacheClear, cacheStats, evict } from '@/lib/cache';
import { synthesize, type SarvamModel, type SynthResult, type Transport } from '@/lib/sarvam';
import {
  SPEED_STEPS,
  apiKeyItem,
  cacheLimitMbItem,
  getPodcastPrefs,
  getPrefs,
  podcastItem,
  modelItem,
  paceItem,
  prefsItem,
  transportItem,
  voiceItem,
  type ReadingPrefs,
} from '@/lib/settings';
import { INR_PER_CHAR, formatInr, monthKey, recordUsage, usageItem } from '@/lib/usage';
import { DEFAULT_VOICE, READING_SHORTLIST, prettyVoice, voicesFor } from '@/lib/voices';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const apiKey = $<HTMLInputElement>('apiKey');
const model = $<HTMLSelectElement>('model');
const voice = $<HTMLSelectElement>('voice');
const transport = $<HTMLSelectElement>('transport');
const pace = $<HTMLSelectElement>('pace');
const sample = $<HTMLTextAreaElement>('sample');
const results = $<HTMLTableSectionElement>('results');
const saved = $<HTMLElement>('saved');
const cost = $<HTMLElement>('cost');
const cacheLimit = $<HTMLInputElement>('cacheLimitMb');
const podcastLength = $<HTMLSelectElement>('podcastLength');
const hostA = $<HTMLSelectElement>('hostA');
const hostB = $<HTMLSelectElement>('hostB');
const buttons = ['play', 'audition', 'latency'].map((id) => $<HTMLButtonElement>(id));
const prefInputs = {
  sentencePauseMs: $<HTMLInputElement>('sentencePauseMs'),
  paragraphPauseMs: $<HTMLInputElement>('paragraphPauseMs'),
  prefetch: $<HTMLInputElement>('prefetch'),
  confirmAboveChars: $<HTMLInputElement>('confirmAboveChars'),
  resume: $<HTMLInputElement>('resume'),
  autoscroll: $<HTMLInputElement>('autoscroll'),
  skipCode: $<HTMLInputElement>('skipCode'),
  skipTables: $<HTMLInputElement>('skipTables'),
};

let current: HTMLAudioElement | null = null;
let cancelled = false;

function fillVoices(m: SarvamModel, selected?: string) {
  const list = voicesFor(m);
  const shortlist = new Set(READING_SHORTLIST[m]);
  voice.replaceChildren(
    ...[...list]
      .sort((a, b) => Number(shortlist.has(b)) - Number(shortlist.has(a)) || a.localeCompare(b))
      .map((v) => new Option(`${shortlist.has(v) ? '★ ' : ''}${prettyVoice(v)}`, v)),
  );
  voice.value = selected && list.includes(selected) ? selected : DEFAULT_VOICE[m];
}

function updateCost() {
  const n = sample.value.trim().length;
  const shortlist = READING_SHORTLIST[model.value as SarvamModel].length;
  cost.textContent =
    `${n} chars ≈ ₹${(n * INR_PER_CHAR).toFixed(2)} per play · ` +
    `audition ≈ ₹${(n * shortlist * INR_PER_CHAR).toFixed(2)} · latency test ≈ ₹${(n * 6 * INR_PER_CHAR).toFixed(2)}`;
}

async function fillHosts() {
  const m = model.value as SarvamModel;
  const prefs = await getPodcastPrefs();
  for (const [sel, id] of [[hostA, prefs.hosts[m].A], [hostB, prefs.hosts[m].B]] as const) {
    sel.replaceChildren(new Option('Choose a voice…', ''), ...voicesFor(m).map((v) => new Option(prettyVoice(v), v)));
    sel.value = id;
  }
  podcastLength.value = prefs.length;
}

async function savePodcast() {
  const prefs = await getPodcastPrefs();
  const m = model.value as SarvamModel;
  await podcastItem.setValue({
    length: podcastLength.value === 'standard' ? 'standard' : 'short',
    hosts: { ...prefs.hosts, [m]: { A: hostA.value, B: hostB.value } },
  });
  saved.textContent = hostA.value === hostB.value ? 'Pick two different voices for the hosts.' : `Saved ${new Date().toLocaleTimeString()}`;
}

for (const el of [podcastLength, hostA, hostB]) el.addEventListener('change', savePodcast);

async function load() {
  apiKey.value = await apiKeyItem.getValue();
  model.value = await modelItem.getValue();
  fillVoices(model.value as SarvamModel, await voiceItem.getValue());
  transport.value = await transportItem.getValue();
  pace.replaceChildren(...SPEED_STEPS.map((p) => new Option(`${p}×`, String(p))));
  pace.value = String(await paceItem.getValue());
  const prefs = await getPrefs();
  prefInputs.sentencePauseMs.value = String(prefs.sentencePauseMs);
  prefInputs.paragraphPauseMs.value = String(prefs.paragraphPauseMs);
  prefInputs.prefetch.value = String(prefs.prefetch);
  prefInputs.confirmAboveChars.value = String(prefs.confirmAboveChars);
  prefInputs.resume.checked = prefs.resume;
  prefInputs.autoscroll.checked = prefs.autoscroll;
  prefInputs.skipCode.checked = prefs.skipCode;
  prefInputs.skipTables.checked = prefs.skipTables;
  cacheLimit.value = String(await cacheLimitMbItem.getValue());
  await fillHosts();
  updateCost();
  void refreshStats();
}

const num = (el: HTMLInputElement, lo: number, hi: number, fallback: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : fallback));

async function save() {
  const prefs: ReadingPrefs = {
    sentencePauseMs: num(prefInputs.sentencePauseMs, 0, 2000, 150),
    paragraphPauseMs: num(prefInputs.paragraphPauseMs, 0, 3000, 450),
    prefetch: Math.round(num(prefInputs.prefetch, 0, 5, 2)),
    confirmAboveChars: Math.round(num(prefInputs.confirmAboveChars, 0, 500_000, 30_000)),
    resume: prefInputs.resume.checked,
    autoscroll: prefInputs.autoscroll.checked,
    skipCode: prefInputs.skipCode.checked,
    skipTables: prefInputs.skipTables.checked,
  };
  await Promise.all([
    apiKeyItem.setValue(apiKey.value.trim()),
    modelItem.setValue(model.value as SarvamModel),
    voiceItem.setValue(voice.value),
    transportItem.setValue(transport.value as Transport),
    paceItem.setValue(Number(pace.value) || 1),
    prefsItem.setValue(prefs),
    cacheLimitMbItem.setValue(num(cacheLimit, 20, 2000, 200)),
  ]);
  saved.textContent = `Saved ${new Date().toLocaleTimeString()}`;
}

model.addEventListener('change', () => {
  fillVoices(model.value as SarvamModel);
  updateCost();
  void fillHosts();
});
for (const el of [apiKey, model, voice, transport, pace, cacheLimit, ...Object.values(prefInputs)]) {
  el.addEventListener('change', save);
}
sample.addEventListener('input', updateCost);
// Keep in sync when the player bar changes voice/speed.
voiceItem.watch((v) => (voice.value = v));
paceItem.watch((p) => (pace.value = String(p)));

async function refreshStats() {
  const usage = (await usageItem.getValue())[monthKey()] ?? { billedChars: 0, requests: 0, cachedChars: 0 };
  const stats = await cacheStats().catch(() => ({ entries: 0, bytes: 0 }));
  const statEl = (value: string, label: string) => {
    const div = document.createElement('div');
    div.className = 'stat';
    div.append(Object.assign(document.createElement('b'), { textContent: value }), Object.assign(document.createElement('span'), { textContent: label }));
    return div;
  };
  $('usage').replaceChildren(
    statEl(formatInr(usage.billedChars), 'estimated spend this month'),
    statEl(usage.billedChars.toLocaleString(), 'characters billed this month'),
    statEl(usage.requests.toLocaleString(), 'Sarvam requests this month'),
    statEl(usage.cachedChars.toLocaleString(), 'characters served from cache'),
  );
  $('cacheStats').textContent = `${stats.entries.toLocaleString()} sentences cached · ${(stats.bytes / 1024 / 1024).toFixed(1)} MB`;
}

usageItem.watch(() => void refreshStats());
$('clearCache').addEventListener('click', async () => {
  await cacheClear();
  void refreshStats();
});
cacheLimit.addEventListener('change', async () => {
  await evict(num(cacheLimit, 20, 2000, 200) * 1024 * 1024);
  void refreshStats();
});

async function run(voiceId: string, t: Transport): Promise<{ row: HTMLTableRowElement; result?: SynthResult }> {
  const row = results.insertRow(0);
  row.innerHTML = `<td>${voiceId}</td><td>${t}</td><td colspan="5">…</td>`;
  try {
    const result = await synthesize(apiKey.value.trim(), {
      text: sample.value.trim(),
      model: model.value as SarvamModel,
      speaker: voiceId,
      transport: t,
      pace: Number(pace.value) || 1,
    });
    void recordUsage(sample.value.trim().length, false);
    const { headersMs, firstByteMs, totalMs, bytes } = result.timings;
    row.innerHTML =
      `<td>${voiceId}</td><td>${t}</td><td>${Math.round(headersMs)} ms</td>` +
      `<td>${Math.round(firstByteMs)} ms</td><td>${Math.round(totalMs)} ms</td>` +
      `<td>${(bytes / 1024).toFixed(0)} KB</td><td><button>▶</button></td>`;
    const url = URL.createObjectURL(new Blob([result.audio as BlobPart], { type: result.mime }));
    row.querySelector('button')!.addEventListener('click', () => play(url, row));
    (row as HTMLTableRowElement & { audioUrl?: string }).audioUrl = url;
    return { row, result };
  } catch (e) {
    row.innerHTML = `<td>${voiceId}</td><td>${t}</td><td colspan="5" class="err"></td>`;
    row.querySelector('.err')!.textContent = (e as Error).message;
    return { row };
  }
}

function play(url: string, row: HTMLTableRowElement): Promise<void> {
  current?.pause();
  results.querySelectorAll('tr.playing').forEach((r) => r.classList.remove('playing'));
  row.classList.add('playing');
  const audio = new Audio(url);
  current = audio;
  return new Promise((resolve) => {
    const done = () => {
      row.classList.remove('playing');
      resolve();
    };
    audio.addEventListener('ended', done, { once: true });
    audio.addEventListener('pause', done, { once: true });
    audio.play().catch(done);
  });
}

async function guarded(fn: () => Promise<void>) {
  if (!apiKey.value.trim()) {
    apiKey.focus();
    saved.textContent = 'Add your Sarvam API key first.';
    return;
  }
  cancelled = false;
  buttons.forEach((b) => (b.disabled = true));
  try {
    await fn();
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

$('play').addEventListener('click', () =>
  guarded(async () => {
    const { row } = await run(voice.value, transport.value as Transport);
    const url = (row as HTMLTableRowElement & { audioUrl?: string }).audioUrl;
    if (url) await play(url, row);
  }),
);

$('audition').addEventListener('click', () =>
  guarded(async () => {
    const [first, ...rest] = READING_SHORTLIST[model.value as SarvamModel];
    if (!first) return;
    // Synthesize the next voice while the current one plays.
    let next = run(first, 'stream');
    for (let i = 0; i <= rest.length && !cancelled; i++) {
      const { row } = await next;
      const upcoming = rest[i];
      if (upcoming) next = run(upcoming, 'stream');
      const url = (row as HTMLTableRowElement & { audioUrl?: string }).audioUrl;
      if (url && !cancelled) await play(url, row);
    }
  }),
);

$('latency').addEventListener('click', () =>
  guarded(async () => {
    for (let i = 0; i < 3 && !cancelled; i++) {
      for (const t of ['rest', 'stream'] as const) await run(voice.value, t);
    }
  }),
);

$('stop').addEventListener('click', () => {
  cancelled = true;
  current?.pause();
});

void load();
