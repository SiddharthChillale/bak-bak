import './style.css';
import { browser, type Browser, type ContentScriptContext } from '#imports';
import type { PlayerCommand, ToBackground, ToContent, TtsPortRequest, TtsPortResponse, VoiceSettings } from '@/lib/messages';
import { TTS_PORT } from '@/lib/messages';
import { WebAudioOut } from '@/lib/player/audio';
import { PlaybackController } from '@/lib/player/controller';
import { Highlighter } from '@/lib/player/highlight';
import { PlayerBar, type Notice, type TranscriptItem } from '@/lib/player/ui';
import type { PodcastScript, ScriptRequest } from '@/lib/podcast';
import { clearResume, getResume, pageKey, saveResume } from '@/lib/resume';
import { base64ToBytes } from '@/lib/sarvam';
import { SPEED_STEPS, getPodcastPrefs, getPrefs, modelItem, paceItem, prefsItem, voiceItem, type ReadingPrefs } from '@/lib/settings';
import {
  type ArticleDoc,
  articleText,
  chunkRange,
  docFromSelection,
  docFromTexts,
  extractArticle,
  isReaderable,
  locate,
} from '@/lib/text/extract';
import { formatInr } from '@/lib/usage';
import { READING_SHORTLIST, prettyVoice } from '@/lib/voices';

/** Rough speaking rate used for time estimates at pace 1 (chars/second). */
const CHARS_PER_SEC = 15;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main(ctx) {
    const app = new ReaderApp(ctx);

    browser.runtime.onMessage.addListener((raw) => {
      const msg = raw as ToContent;
      if (msg.type === 'command') void app.command(msg.command);
    });

    const reportReaderable = () => send({ type: 'readerable', value: isReaderable(document) });
    ctx.setTimeout(reportReaderable, 300);
    ctx.addEventListener(window, 'wxt:locationchange', () => {
      app.reset();
      ctx.setTimeout(reportReaderable, 1000);
    });
    ctx.onInvalidated(() => app.destroy());
  },
});

function send(msg: ToBackground) {
  browser.runtime.sendMessage(msg).catch(() => undefined);
}

class ReaderApp {
  private doc: ArticleDoc | null = null;
  private audio = new WebAudioOut();
  private controller: PlaybackController;
  private highlighter = new Highlighter();
  private ui: PlayerBar | null = null;
  private port: Browser.runtime.Port | null = null;
  private nextId = 1;
  /** In-flight port requests; index is the chunk for audio requests, -1 otherwise. */
  private pending = new Map<number, { index: number; handle: (msg: TtsPortResponse) => void }>();
  /** Per-chunk voice overrides (podcast hosts); null = use the reading voice. */
  private chunkVoices: VoiceSettings[] | null = null;
  private transcript: TranscriptItem[] | null = null;
  /** A standalone message (no document to show yet, or a podcast being written). */
  private message: { title: string; notice: Notice } | null = null;
  private voice: VoiceSettings = { model: 'bulbul:v4-flash', speaker: 'shubh_en_narration', pace: 1 };
  private prefs: ReadingPrefs | null = null;
  private jumpMode = false;
  private announcedPlaying = false;
  private notice: (Notice & { clearWhen: 'playing' | 'moved'; at: number }) | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private unwatch: (() => void)[] = [];

  constructor(private ctx: ContentScriptContext) {
    this.controller = new PlaybackController({
      audio: this.audio,
      synth: (index, speech) => this.synth(index, speech),
      cancel: (index) => this.cancel(index),
      pauses: () => ({
        sentence: (this.prefs?.sentencePauseMs ?? 150) / 1000,
        paragraph: (this.prefs?.paragraphPauseMs ?? 450) / 1000,
      }),
      prefetch: () => this.prefs?.prefetch ?? 2,
    });
    this.controller.onChange((s) => {
      if (s.status === 'playing' && !this.announcedPlaying) send({ type: 'playing' });
      this.announcedPlaying = s.status === 'playing';
      const n = this.notice;
      if (n && ((n.clearWhen === 'playing' && s.status === 'playing') || (n.clearWhen === 'moved' && s.index > n.at + 1))) {
        this.notice = null;
      }
      this.persistPosition();
      this.render();
    });
    this.controller.onChunk((i) => this.highlight(i));

    void this.loadSettings();
    const onVoiceChange = () => void this.loadSettings().then(() => this.controller.invalidateAudio());
    this.unwatch.push(
      voiceItem.watch(onVoiceChange),
      modelItem.watch(onVoiceChange),
      paceItem.watch(onVoiceChange),
      prefsItem.watch(() => void this.loadSettings()),
    );

    ctx.addEventListener(document, 'click', (e) => this.onPageClick(e as MouseEvent), { capture: true });
  }

  async command(cmd: PlayerCommand) {
    await this.loadSettings();
    switch (cmd) {
      case 'toggle':
        if (this.doc) return this.controller.toggle();
        return this.startArticle(0);
      case 'read-page':
        return this.startArticle(0);
      case 'read-from-selection':
        return this.readFromSelection();
      case 'podcast':
        return this.startPodcast();
      case 'next':
        return this.controller.next();
      case 'prev':
        return this.controller.prev();
      case 'pause':
        return this.controller.pause();
    }
  }

  reset() {
    this.notice = null;
    this.message = null;
    this.controller.stop();
    this.controller.load([]);
    this.doc = null;
    this.highlighter.clear();
    this.setJumpMode(false);
    this.ui?.hide();
  }

  destroy() {
    this.reset();
    this.controller.destroy();
    this.highlighter.destroy();
    this.audio.close();
    this.port?.disconnect();
    this.ui?.remove();
    this.unwatch.forEach((u) => u());
  }

  // ---- loading -------------------------------------------------------------

  private extract(): ArticleDoc | null {
    const doc = extractArticle(document, {
      skipCode: this.prefs?.skipCode ?? true,
      skipTables: this.prefs?.skipTables ?? true,
      exclude: this.ui ? [this.ui.host] : [],
    });
    return doc?.chunks.length ? doc : null;
  }

  private loadArticle(): boolean {
    const doc = this.extract();
    if (!doc) return false;
    this.setDoc(doc);
    return true;
  }

  private setDoc(doc: ArticleDoc, extra?: { voices: VoiceSettings[]; transcript: TranscriptItem[] }) {
    this.doc = doc;
    this.message = null;
    this.chunkVoices = extra?.voices ?? null;
    this.transcript = extra?.transcript ?? null;
    this.controller.load(doc.chunks.map((c) => ({ block: c.block, speech: c.speech })));
    if (this.jumpMode) this.markBlocks(true);
    this.ensureUi().show();
    this.render();
  }

  private async startArticle(from: number) {
    if (!this.loadArticle()) {
      const sel = window.getSelection();
      const selDoc = sel && !sel.isCollapsed ? docFromSelection(sel) : null;
      if (selDoc?.chunks.length) {
        this.setDoc(selDoc);
        return this.controller.play(0);
      }
      this.showMessage("Couldn't find an article on this page. Select some text, right-click it and choose “Read aloud from here”.");
      return;
    }
    const doc = this.doc!;
    const total = doc.chunks.length;

    if (from === 0 && this.prefs?.resume) {
      const saved = await getResume(pageKey());
      if (saved && saved.total === total && saved.index > 0 && saved.index < total - 1) {
        from = saved.index;
        this.notice = {
          text: `Continuing from sentence ${from + 1} of ${total}, where you stopped last time.`,
          tone: 'info',
          actions: [{ label: 'Start over', run: () => this.dismissNoticeAnd(() => this.controller.play(0)) }],
          clearWhen: 'moved',
          at: from,
        };
      }
    }

    this.confirmThenPlay(from, 'Long article');
  }

  /** Play from `from`, first asking when the rest of the doc is above the cost threshold. */
  private confirmThenPlay(from: number, what: string) {
    const doc = this.doc;
    if (!doc) return;
    const remaining = doc.chunks.slice(from).reduce((n, c) => n + c.speech.length, 0);
    const limit = this.prefs?.confirmAboveChars ?? 0;
    if (limit > 0 && remaining > limit) {
      const minutes = Math.round(remaining / CHARS_PER_SEC / this.voice.pace / 60);
      this.notice = {
        text: `${what}: ~${minutes} min of audio, about ${formatInr(remaining)} to synthesise (already-cached sentences are free).`,
        tone: 'attn',
        actions: [
          { label: 'Read it', run: () => this.dismissNoticeAnd(() => this.controller.play(from)) },
          { label: 'Cancel', run: () => this.reset() },
        ],
        clearWhen: 'playing',
        at: from,
      };
      this.controller.seek(from);
      this.render();
      return;
    }
    this.controller.play(from);
  }

  private dismissNoticeAnd(fn: () => void) {
    this.notice = null;
    fn();
    this.render();
  }

  /** Remember the position for articles (not ad-hoc selections), debounced. */
  private persistPosition() {
    const doc = this.doc;
    if (doc?.kind !== 'article') return;
    const { status, index, total } = this.controller.state;
    if (status === 'idle' || !total) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    const key = pageKey();
    if (status === 'ended') {
      void clearResume(key);
      return;
    }
    this.saveTimer = setTimeout(() => void saveResume(key, index, total), 1000);
  }

  private async startPodcast() {
    // From the bar this runs inside a click: unlock audio now, since playback starts after the script arrives.
    this.audio.unlock();
    const article = this.doc?.kind === 'article' ? this.doc : this.extract();
    if (!article) {
      this.showMessage("Couldn't find an article on this page to turn into a podcast.");
      return;
    }
    const podcast = await getPodcastPrefs();
    const voices = podcast.hosts[this.voice.model];
    const names = { A: hostName(voices.A), B: hostName(voices.B) };
    if (names.A === names.B) names.B = `${names.B} Two`;
    const text = articleText(article);
    const request: ScriptRequest = { title: article.title, text, hosts: names, length: podcast.length };
    const key = `${pageKey()}|${podcast.length}|${names.A}|${names.B}|${hashString(text)}`;

    this.controller.stop();
    this.showMessage(`Writing a ${podcast.length} podcast script with Sarvam-105B (${names.A} and ${names.B})… this takes about 20–60 seconds.`, {
      title: `Podcast · ${article.title}`,
    });

    let script: PodcastScript;
    try {
      script = await this.requestScript(request, key);
    } catch (e) {
      this.showMessage(`Couldn't write the podcast: ${(e as Error).message}`, {
        title: `Podcast · ${article.title}`,
        tone: 'err',
        actions: [{ label: 'Try again', run: () => void this.startPodcast() }],
      });
      return;
    }

    const doc = docFromTexts('podcast', script.title || article.title, script.turns.map((t) => t.text));
    const turnVoice = (block: number) => ({ ...this.voice, speaker: voices[script.turns[block]!.speaker] });
    const transcript: TranscriptItem[] = [];
    for (const c of doc.chunks) {
      if (transcript.at(-1)?.block === c.block) continue;
      transcript.push({ block: c.block, start: c.index, label: names[script.turns[c.block]!.speaker], text: doc.blocks[c.block]!.text });
    }
    this.notice = null;
    this.setDoc(doc, { voices: doc.chunks.map((c) => turnVoice(c.block)), transcript });
    this.confirmThenPlay(0, 'Podcast ready');
  }

  private requestScript(request: ScriptRequest, cacheKey: string): Promise<PodcastScript> {
    const port = this.connect();
    const id = this.nextId++;
    // Chrome may stop an idle service worker after ~30 s; port traffic keeps it alive.
    const keepAlive = setInterval(() => {
      try {
        this.port?.postMessage({ type: 'ping' } satisfies TtsPortRequest);
      } catch {
        // port closed; the pending request is rejected on disconnect
      }
    }, 20_000);
    return new Promise<PodcastScript>((resolve, reject) => {
      this.pending.set(id, {
        index: -1,
        handle: (msg) => (msg.type === 'script' ? resolve(msg.script) : reject(new Error(msg.type === 'error' ? msg.message : 'Unexpected reply'))),
      });
      port.postMessage({ type: 'script', id, request, cacheKey } satisfies TtsPortRequest);
    }).finally(() => clearInterval(keepAlive));
  }

  private readFromSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return this.startArticle(0);
    const range = sel.getRangeAt(0);
    // Prefer continuing through the whole article from the selected sentence.
    if (this.doc?.kind !== 'article') this.loadArticle();
    const idx = this.doc ? locate(this.doc, range.startContainer, range.startOffset) : -1;
    if (idx >= 0) return this.controller.play(idx);
    const selDoc = docFromSelection(sel);
    if (!selDoc?.chunks.length) return;
    this.setDoc(selDoc);
    this.controller.play(0);
  }

  // ---- synthesis over the background port ----------------------------------

  private synth(index: number, speech: string): Promise<ArrayBuffer> {
    const port = this.connect();
    const id = this.nextId++;
    const voice = this.chunkVoices?.[index] ?? this.voice;
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        index,
        handle: (msg) => {
          if (msg.type === 'audio') {
            const bytes = base64ToBytes(msg.base64);
            resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
          } else reject(new Error(msg.type === 'error' ? msg.message : 'Unexpected reply'));
        },
      });
      port.postMessage({ type: 'synthesize', id, text: speech, voice: { ...voice } } satisfies TtsPortRequest);
    });
  }

  private cancel(index: number) {
    for (const [id, p] of this.pending) {
      if (p.index === index) this.port?.postMessage({ type: 'cancel', id } satisfies TtsPortRequest);
    }
  }

  private connect(): Browser.runtime.Port {
    if (this.port) return this.port;
    const port = browser.runtime.connect({ name: TTS_PORT });
    port.onMessage.addListener((raw) => {
      const msg = raw as TtsPortResponse;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      p.handle(msg);
    });
    port.onDisconnect.addListener(() => {
      this.port = null;
      for (const [id, p] of this.pending) p.handle({ type: 'error', id, message: 'Lost connection to the extension. Reload the page.' });
      this.pending.clear();
    });
    this.port = port;
    return port;
  }

  // ---- settings ------------------------------------------------------------

  private async loadSettings() {
    const [model, speaker, pace, prefs] = await Promise.all([
      modelItem.getValue(),
      voiceItem.getValue(),
      paceItem.getValue(),
      getPrefs(),
    ]);
    this.voice = { model, speaker, pace };
    this.prefs = prefs;
    this.render();
  }

  // ---- page interaction ----------------------------------------------------

  private onPageClick(e: MouseEvent) {
    if (!(this.jumpMode || e.altKey) || e.button !== 0) return;
    if (this.ui && e.composedPath().includes(this.ui.host)) return;
    const pos = caretFromPoint(e.clientX, e.clientY);
    if (!pos) return;
    // Alt+click works even before the player has been opened.
    if (!this.doc && e.altKey && !this.loadArticle()) return;
    if (!this.doc) return;
    const idx = locate(this.doc, pos.node, pos.offset);
    if (idx < 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.controller.play(idx);
  }

  private setJumpMode(on: boolean) {
    this.jumpMode = on;
    this.markBlocks(on);
    this.render();
  }

  private markBlocks(on: boolean) {
    const html = document.documentElement;
    if (on) html.setAttribute('data-readaloud-jump', '');
    else html.removeAttribute('data-readaloud-jump');
    for (const b of this.doc?.blocks ?? []) {
      if (!b.el) continue;
      if (on) b.el.setAttribute('data-readaloud-block', '');
      else b.el.removeAttribute('data-readaloud-block');
    }
  }

  private highlight(index: number | null) {
    const chunk = index == null ? null : this.doc?.chunks[index];
    if (!chunk || !this.doc) return this.highlighter.clear();
    const block = this.doc.blocks[chunk.block];
    this.highlighter.show(chunkRange(this.doc, chunk), block?.el ?? null, {
      autoscroll: this.prefs?.autoscroll ?? true,
      bottomInset: this.ui?.height ?? 0,
    });
  }

  // ---- UI ------------------------------------------------------------------

  private ensureUi(): PlayerBar {
    this.ui ??= new PlayerBar({
      toggle: () => this.controller.toggle(),
      prev: () => this.controller.prev(),
      next: () => this.controller.next(),
      prevBlock: () => this.controller.prevBlock(),
      nextBlock: () => this.controller.nextBlock(),
      seek: (i) => this.controller.seek(i),
      seekAndPlay: (i) => this.controller.play(i),
      setPace: (p) => void paceItem.setValue(p),
      setVoice: (v) => void voiceItem.setValue(v),
      toggleJump: () => this.setJumpMode(!this.jumpMode),
      openSettings: () => send({ type: 'open-options' }),
      podcast: () => void this.startPodcast(),
      close: () => this.reset(),
    });
    return this.ui;
  }

  private showMessage(text: string, opts: { title?: string; tone?: Notice['tone']; actions?: Notice['actions'] } = {}) {
    this.message = {
      title: opts.title ?? 'Read Aloud',
      notice: { text, tone: opts.tone ?? 'info', actions: opts.actions ?? [] },
    };
    this.ensureUi().show();
    this.render();
  }

  private render() {
    if (!this.ui) return;
    if (this.message) {
      this.ui.render({
        ...this.viewBase(),
        title: this.message.title,
        notice: this.message.notice,
        state: { status: 'idle', index: 0, total: 0, buffering: false },
        transcript: null,
      });
    } else if (this.doc) {
      this.ui.render(this.viewBase());
    }
  }

  private viewBase() {
    const doc = this.doc;
    const state = this.controller.state;
    const remainingChars = doc ? doc.chunks.slice(state.index).reduce((n, c) => n + c.speech.length, 0) : 0;
    const minutes = (doc?.speechChars ?? 0) / CHARS_PER_SEC / this.voice.pace / 60;
    const notice: Notice | null =
      this.notice ??
      (state.status === 'error'
        ? {
            text: state.error ?? 'Something went wrong.',
            tone: 'err',
            actions: [
              { label: 'Retry', run: () => this.controller.play() },
              ...(/key|settings|credit/i.test(state.error ?? '')
                ? [{ label: 'Open settings', run: () => send({ type: 'open-options' }) }]
                : []),
            ],
          }
        : null);
    const podcast = doc?.kind === 'podcast';
    const speakerOf = (i: number) => {
      const block = doc?.chunks[i]?.block;
      return this.transcript?.find((t) => t.block === block)?.label;
    };
    return {
      title: podcast ? `Podcast · ${doc!.title}` : doc?.title || document.title || 'Read Aloud',
      notice,
      state,
      chunkText: (i: number) => {
        const text = doc?.chunks[i]?.display ?? '';
        const who = podcast ? speakerOf(i) : undefined;
        return who ? `${who}: ${text}` : text;
      },
      summary: doc
        ? `${podcast ? `${this.transcript?.length ?? 0} turns` : `${doc.chunks.length} sentences`} · ~${Math.max(1, Math.round(minutes))} min · ≈ ${formatInr(doc.speechChars)} to synthesise (cached sentences are free)`
        : '',
      transcript: this.transcript,
      remainingMinutes: remainingChars / CHARS_PER_SEC / this.voice.pace / 60,
      pace: this.voice.pace,
      paces: SPEED_STEPS,
      voice: this.voice.speaker,
      voices: READING_SHORTLIST[this.voice.model],
      jumpMode: this.jumpMode,
    };
  }
}

function caretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof doc.caretPositionFromPoint === 'function') {
    const p = doc.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  const r = doc.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

/** "simran_en_conversation" → "Simran" */
function hostName(voiceId: string): string {
  return prettyVoice(voiceId).split(' · ')[0] ?? voiceId;
}

/** FNV-1a; just a cache key (crypto.subtle is unavailable on http: pages). */
function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16) + s.length.toString(16);
}
