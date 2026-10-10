import './style.css';
import { browser, type Browser, type ContentScriptContext } from '#imports';
import type { PlayerCommand, ToBackground, ToContent, TtsPortRequest, TtsPortResponse, VoiceSettings } from '@/lib/messages';
import { TTS_PORT } from '@/lib/messages';
import { WebAudioOut } from '@/lib/player/audio';
import { PlaybackController } from '@/lib/player/controller';
import { Highlighter } from '@/lib/player/highlight';
import { PlayerBar } from '@/lib/player/ui';
import { base64ToBytes } from '@/lib/sarvam';
import { SPEED_STEPS, getPrefs, modelItem, paceItem, prefsItem, voiceItem, type ReadingPrefs } from '@/lib/settings';
import { type ArticleDoc, chunkRange, docFromSelection, extractArticle, isReaderable, locate } from '@/lib/text/extract';
import { formatInr } from '@/lib/usage';
import { READING_SHORTLIST } from '@/lib/voices';

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
  private pending = new Map<number, { index: number; resolve: (b: ArrayBuffer) => void; reject: (e: Error) => void }>();
  private voice: VoiceSettings = { model: 'bulbul:v4-flash', speaker: 'shubh_en_narration', pace: 1 };
  private prefs: ReadingPrefs | null = null;
  private jumpMode = false;
  private announcedPlaying = false;
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
      case 'next':
        return this.controller.next();
      case 'prev':
        return this.controller.prev();
      case 'pause':
        return this.controller.pause();
    }
  }

  reset() {
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

  private loadArticle(): boolean {
    const doc = extractArticle(document, {
      skipCode: this.prefs?.skipCode ?? true,
      skipTables: this.prefs?.skipTables ?? true,
      exclude: this.ui ? [this.ui.host] : [],
    });
    if (!doc?.chunks.length) return false;
    this.setDoc(doc);
    return true;
  }

  private setDoc(doc: ArticleDoc) {
    this.doc = doc;
    this.controller.load(doc.chunks.map((c) => ({ block: c.block, speech: c.speech })));
    if (this.jumpMode) this.markBlocks(true);
    this.ensureUi().show();
    this.render();
  }

  private startArticle(from: number) {
    if (!this.loadArticle()) {
      const sel = window.getSelection();
      const selDoc = sel && !sel.isCollapsed ? docFromSelection(sel) : null;
      if (selDoc?.chunks.length) {
        this.setDoc(selDoc);
      } else {
        this.showMessage("Couldn't find an article on this page. Select some text, right-click it and choose “Read aloud from here”.");
        return;
      }
    }
    this.controller.play(from);
  }

  private readFromSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return this.startArticle(0);
    const range = sel.getRangeAt(0);
    // Prefer continuing through the whole article from the selected sentence.
    if (!this.doc || this.doc.title === 'Selection') this.loadArticle();
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
    return new Promise((resolve, reject) => {
      this.pending.set(id, { index, resolve, reject });
      port.postMessage({ type: 'synthesize', id, text: speech, voice: { ...this.voice } } satisfies TtsPortRequest);
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
      if (msg.type === 'audio') {
        const bytes = base64ToBytes(msg.base64);
        p.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      } else p.reject(new Error(msg.message));
    });
    port.onDisconnect.addListener(() => {
      this.port = null;
      for (const p of this.pending.values()) p.reject(new Error('Lost connection to the extension. Reload the page.'));
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
      setPace: (p) => void paceItem.setValue(p),
      setVoice: (v) => void voiceItem.setValue(v),
      toggleJump: () => this.setJumpMode(!this.jumpMode),
      openSettings: () => send({ type: 'open-options' }),
      close: () => this.reset(),
    });
    return this.ui;
  }

  private showMessage(text: string) {
    const ui = this.ensureUi();
    ui.show();
    ui.render({
      ...this.viewBase(),
      title: 'Read Aloud',
      state: { status: 'idle', index: 0, total: 0, buffering: false },
      summary: text,
    });
  }

  private render() {
    if (!this.ui || !this.doc) return;
    this.ui.render(this.viewBase());
  }

  private viewBase() {
    const doc = this.doc;
    const state = this.controller.state;
    const remainingChars = doc ? doc.chunks.slice(state.index).reduce((n, c) => n + c.speech.length, 0) : 0;
    const minutes = (doc?.speechChars ?? 0) / CHARS_PER_SEC / this.voice.pace / 60;
    return {
      title: doc?.title || document.title || 'Read Aloud',
      state,
      chunkText: (i: number) => doc?.chunks[i]?.display ?? '',
      summary: doc
        ? `${doc.chunks.length} sentences · ~${Math.max(1, Math.round(minutes))} min · ≈ ${formatInr(doc.speechChars)} to synthesise (cached sentences are free)`
        : '',
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
