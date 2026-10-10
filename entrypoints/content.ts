// Phase 0 spike player. Verifies, per browser and per site:
//  - background → content-script audio delivery (base64 over a Port)
//  - playback via <audio> + blob URL vs Web Audio (page CSP can block blob: media)
//  - autoplay when started from an in-page click vs. context menu / keyboard command
//  - REST vs streaming latency

import { browser } from '#imports';
import { base64ToBytes, type Transport } from '@/lib/sarvam';
import { TTS_PORT, type SpeakCommand, type TtsPortRequest, type TtsPortResponse } from '@/lib/messages';

type PlayMethod = 'element' | 'webaudio';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let ui: SpikePanel | null = null;
    const getUi = () => (ui ??= new SpikePanel());

    browser.runtime.onMessage.addListener((raw) => {
      const msg = raw as SpeakCommand | { type: 'toggle-panel' };
      if (msg.type === 'toggle-panel') getUi().toggle();
      if (msg.type === 'speak') {
        const panel = getUi();
        panel.show();
        void panel.speak({ text: msg.text, method: 'element', trigger: msg.trigger });
      }
    });
  },
});

class SpikePanel {
  private host = document.createElement('readaloud-spike');
  private root = this.host.attachShadow({ mode: 'closed' });
  private log!: HTMLElement;
  private transport!: HTMLSelectElement;
  private port: Browser.runtime.Port | null = null;
  private nextId = 1;
  private pending = new Map<number, (r: TtsPortResponse) => void>();
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;

  constructor() {
    this.root.innerHTML = `
      <style>
        :host { all: initial; }
        .panel { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 380px;
          max-height: 60vh; display: flex; flex-direction: column; gap: 8px; padding: 12px;
          font: 13px/1.4 system-ui, sans-serif; color: #111; background: #fff;
          border: 1px solid #ccc; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.18); }
        .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
        button, select { font: inherit; padding: 4px 8px; border-radius: 6px; border: 1px solid #bbb;
          background: #f6f6f6; color: #111; cursor: pointer; }
        .title { font-weight: 600; flex: 1; }
        pre { margin: 0; padding: 8px; overflow: auto; background: #f3f3f3; border-radius: 6px;
          font: 11px/1.4 ui-monospace, monospace; white-space: pre-wrap; flex: 1; min-height: 80px; }
        @media (prefers-color-scheme: dark) {
          .panel { color: #eee; background: #1e1e1e; border-color: #444; }
          button, select { background: #2a2a2a; color: #eee; border-color: #555; }
          pre { background: #111; }
        }
      </style>
      <div class="panel">
        <div class="row"><span class="title">Read Aloud: Phase 0 spike</span>
          <button data-act="close" title="Close">✕</button></div>
        <div class="row">
          <select data-el="transport">
            <option value="">Transport: saved setting</option>
            <option value="stream">stream</option>
            <option value="rest">rest</option>
          </select>
        </div>
        <div class="row">
          <button data-act="element">▶ Speak (&lt;audio&gt;)</button>
          <button data-act="webaudio">▶ Speak (Web Audio)</button>
          <button data-act="stop">■ Stop</button>
          <button data-act="clear">Clear log</button>
        </div>
        <pre data-el="log">Select text (or leave nothing selected to use the page's first paragraphs), then press Speak.</pre>
      </div>`;
    this.log = this.root.querySelector('[data-el="log"]')!;
    this.transport = this.root.querySelector('[data-el="transport"]')!;
    this.root.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (act === 'close') this.hide();
      if (act === 'stop') this.stop();
      if (act === 'clear') this.log.textContent = '';
      if (act === 'element' || act === 'webaudio') {
        // Unlock Web Audio synchronously inside the click so the gesture counts.
        if (act === 'webaudio') this.ensureAudioCtx();
        void this.speak({ method: act, trigger: 'in-page click' });
      }
    });
    // Keep the current selection: clicking our buttons must not clear it first.
    this.root.addEventListener('mousedown', (e) => e.preventDefault());
    document.documentElement.append(this.host);
  }

  show() { this.host.style.display = ''; }
  hide() { this.stop(); this.host.style.display = 'none'; }
  toggle() { this.host.style.display === 'none' ? this.show() : this.hide(); }

  async speak(opts: { text?: string; method: PlayMethod; trigger: string }) {
    this.stop();
    const text = (opts.text ?? pickText()).trim();
    if (!text) return this.write('No text found on this page.');
    const transport = (this.transport.value || undefined) as Transport | undefined;
    const t0 = performance.now();
    this.write(`\n▶ ${opts.trigger} · ${opts.method} · ${transport ?? 'saved'} · ${text.length} chars`);
    this.write(`  "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`);

    const res = await this.request(text, transport ? { transport } : undefined);
    if (res.type === 'error') return this.write(`✗ ${res.message}${res.status ? ` (HTTP ${res.status})` : ''}`);

    const t = res.timings;
    this.write(
      `  ${res.model} / ${res.speaker}\n` +
        `  sarvam: headers ${ms(t.headersMs)}, first byte ${ms(t.firstByteMs)}, total ${ms(t.totalMs)}, ${(t.bytes / 1024).toFixed(1)} KB\n` +
        `  delivered to page after ${ms(performance.now() - t0)}`,
    );
    const bytes = base64ToBytes(res.base64);
    try {
      const duration =
        opts.method === 'element' ? await this.playElement(bytes, res.mime) : await this.playWebAudio(bytes);
      this.write(`✓ playing ${duration.toFixed(1)}s of audio; click→sound ${ms(performance.now() - t0)}`);
    } catch (e) {
      const err = e as Error;
      this.write(`✗ playback failed: ${err.name}: ${err.message}`);
      if (err.name === 'NotAllowedError') this.write('  → autoplay blocked: needs a user gesture on the page.');
    }
  }

  private request(text: string, overrides?: TtsPortRequest['overrides']): Promise<TtsPortResponse> {
    if (!this.port) {
      this.port = browser.runtime.connect({ name: TTS_PORT });
      this.port.onMessage.addListener((raw) => {
        const msg = raw as TtsPortResponse;
        this.pending.get(msg.id)?.(msg);
        this.pending.delete(msg.id);
      });
      this.port.onDisconnect.addListener(() => {
        this.port = null;
        this.pending.forEach((resolve, id) => resolve({ type: 'error', id, message: 'Background disconnected' }));
        this.pending.clear();
      });
    }
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.port!.postMessage({ type: 'synthesize', id, text, overrides } satisfies TtsPortRequest);
    });
  }

  private playElement(bytes: Uint8Array, mime: string): Promise<number> {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    const audio = new Audio();
    this.audioEl = audio;
    audio.preservesPitch = true;
    audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
    return new Promise((resolve, reject) => {
      audio.addEventListener(
        'error',
        () => reject(new Error(`media error code ${audio.error?.code} (CSP media-src may block blob:)`)),
        { once: true },
      );
      audio.src = url;
      audio.play().then(() => resolve(audio.duration), reject);
    });
  }

  private ensureAudioCtx(): AudioContext {
    this.audioCtx ??= new AudioContext();
    if (this.audioCtx.state === 'suspended') void this.audioCtx.resume();
    return this.audioCtx;
  }

  private async playWebAudio(bytes: Uint8Array): Promise<number> {
    const ctx = this.ensureAudioCtx();
    const buffer = await ctx.decodeAudioData(bytes.slice().buffer);
    if (ctx.state !== 'running') {
      const e = new Error(`AudioContext is ${ctx.state}`);
      e.name = 'NotAllowedError';
      throw e;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start();
    this.source = src;
    return buffer.duration;
  }

  private stop() {
    this.audioEl?.pause();
    this.audioEl = null;
    try {
      this.source?.stop();
    } catch {
      // already stopped
    }
    this.source = null;
  }

  private write(line: string) {
    this.log.textContent += `${line}\n`;
    this.log.scrollTop = this.log.scrollHeight;
  }
}

/** Selection if any, otherwise the first few paragraphs (capped well under Sarvam's 2,500-char limit). */
function pickText(): string {
  const sel = window.getSelection()?.toString().trim();
  if (sel) return sel.slice(0, 2000);
  const paras = Array.from(document.querySelectorAll('article p, main p, p'))
    .map((p) => p.textContent?.trim() ?? '')
    .filter((t) => t.length > 60);
  let out = '';
  for (const p of paras) {
    if (out.length + p.length > 600) break;
    out += (out ? ' ' : '') + p;
  }
  return out || (paras[0]?.slice(0, 600) ?? '');
}

const ms = (n: number) => (n < 0 ? 'n/a' : `${Math.round(n)} ms`);
