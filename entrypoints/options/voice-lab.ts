// Voice lab: sample playback, voice audition and latency test. Only included when the
// VOICE_LAB build flag is on (see lib/features.ts); otherwise tree-shaken out of the build.
import { synthesize, type SarvamModel, type SynthResult, type Transport } from '@/lib/sarvam';
import { INR_PER_CHAR, recordUsage } from '@/lib/usage';
import { READING_SHORTLIST } from '@/lib/voices';

export interface VoiceLabControls {
  apiKey: HTMLInputElement;
  model: HTMLSelectElement;
  voice: HTMLSelectElement;
  transport: HTMLSelectElement;
  pace: HTMLSelectElement;
  saved: HTMLElement;
}

export function initVoiceLab({ apiKey, model, voice, transport, pace, saved }: VoiceLabControls) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const sample = $<HTMLTextAreaElement>('sample');
  const results = $<HTMLTableSectionElement>('results');
  const cost = $<HTMLElement>('cost');
  const buttons = ['play', 'audition', 'latency'].map((id) => $<HTMLButtonElement>(id));

  let current: HTMLAudioElement | null = null;
  let cancelled = false;

  function updateCost() {
    const n = sample.value.trim().length;
    const shortlist = READING_SHORTLIST[model.value as SarvamModel].length;
    cost.textContent =
      `${n} chars ≈ ₹${(n * INR_PER_CHAR).toFixed(2)} per play · ` +
      `audition ≈ ₹${(n * shortlist * INR_PER_CHAR).toFixed(2)} · latency test ≈ ₹${(n * 6 * INR_PER_CHAR).toFixed(2)}`;
  }

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

  model.addEventListener('change', updateCost);
  sample.addEventListener('input', updateCost);
  updateCost();
  $('voiceLab').hidden = false;
}
