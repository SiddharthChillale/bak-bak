import { synthesize, type SarvamModel, type SynthResult, type Transport } from '@/lib/sarvam';
import { apiKeyItem, modelItem, paceItem, transportItem, voiceItem } from '@/lib/settings';
import { DEFAULT_VOICE, READING_SHORTLIST, voicesFor } from '@/lib/voices';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const apiKey = $<HTMLInputElement>('apiKey');
const model = $<HTMLSelectElement>('model');
const voice = $<HTMLSelectElement>('voice');
const transport = $<HTMLSelectElement>('transport');
const pace = $<HTMLInputElement>('pace');
const sample = $<HTMLTextAreaElement>('sample');
const results = $<HTMLTableSectionElement>('results');
const saved = $<HTMLElement>('saved');
const cost = $<HTMLElement>('cost');
const buttons = ['play', 'audition', 'latency'].map((id) => $<HTMLButtonElement>(id));

// ₹30 per 10k characters (Bulbul v3 list price; v4-flash price not published as of 2026-10-10).
const INR_PER_CHAR = 30 / 10_000;

let current: HTMLAudioElement | null = null;
let cancelled = false;

function fillVoices(m: SarvamModel, selected?: string) {
  const list = voicesFor(m);
  const shortlist = new Set(READING_SHORTLIST[m]);
  voice.replaceChildren(
    ...[...list]
      .sort((a, b) => Number(shortlist.has(b)) - Number(shortlist.has(a)) || a.localeCompare(b))
      .map((v) => new Option(shortlist.has(v) ? `★ ${v}` : v, v)),
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

async function load() {
  apiKey.value = await apiKeyItem.getValue();
  model.value = await modelItem.getValue();
  fillVoices(model.value as SarvamModel, await voiceItem.getValue());
  transport.value = await transportItem.getValue();
  pace.value = String(await paceItem.getValue());
  updateCost();
}

async function save() {
  await Promise.all([
    apiKeyItem.setValue(apiKey.value.trim()),
    modelItem.setValue(model.value as SarvamModel),
    voiceItem.setValue(voice.value),
    transportItem.setValue(transport.value as Transport),
    paceItem.setValue(Math.min(2, Math.max(0.5, Number(pace.value) || 1))),
  ]);
  saved.textContent = `Saved ${new Date().toLocaleTimeString()}`;
}

model.addEventListener('change', () => {
  fillVoices(model.value as SarvamModel);
  updateCost();
});
for (const el of [apiKey, model, voice, transport, pace]) el.addEventListener('change', save);
sample.addEventListener('input', updateCost);

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
