import './style.css';
import { browser, type Browser, type ContentScriptContext } from '#imports';
import type { PlayerCommand, ToBackground, ToContent, TtsPortRequest, TtsPortResponse, VoiceSettings } from '@/lib/messages';
import { TTS_PORT } from '@/lib/messages';
import { WebAudioOut, type Scheduled } from '@/lib/player/audio';
import { PlaybackController } from '@/lib/player/controller';
import { Highlighter } from '@/lib/player/highlight';
import { PlayerBar, type Notice, type PlayerMode, type PodcastPanel, type SummaryPanel, type TranscriptItem } from '@/lib/player/ui';
import type { PodcastLength, PodcastScript, ScriptRequest } from '@/lib/podcast';
import { clearResume, getResume, pageKey, saveResume } from '@/lib/resume';
import { base64ToBytes } from '@/lib/sarvam';
import {
  SPEED_STEPS,
  getPodcastPrefs,
  getPrefs,
  modelItem,
  paceItem,
  podcastItem,
  prefsItem,
  summaryLengthItem,
  voiceItem,
  type ReadingPrefs,
} from '@/lib/settings';
import type { Summary, SummaryLength, SummaryRequest } from '@/lib/summary';
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
import { READING_SHORTLIST, prettyVoice, voicesFor } from '@/lib/voices';

/** Rough speaking rate used for time estimates at pace 1 (chars/second). */
const CHARS_PER_SEC = 15;
/** Sarvam-105B cost for one script is tiny; shown so the button isn't a surprise. */
const SCRIPT_COST_TEXT = 'about ₹0.25';
/** A summary reads the whole article but writes far less than a script. */
const SUMMARY_COST_TEXT = 'about ₹0.10';

export default defineContentScript({
  // Injected by the background when the user invokes the extension (activeTab), or
  // registered on all sites only if the user opts in to automatic article detection.
  registration: 'runtime',
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main(ctx) {
    // Both routes can inject into the same tab: run once, unless the earlier copy belongs to
    // an extension version that has since been reloaded or updated (its context is invalid).
    const w = window as Window & { __readAloudCtx?: ContentScriptContext };
    if (w.__readAloudCtx?.isValid) return;
    w.__readAloudCtx = ctx;

    const app = new ReaderApp(ctx);

    browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
      const msg = raw as ToContent;
      if (msg.type === 'ping') {
        sendResponse('pong');
        return;
      }
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

/**
 * Podcast mode runs step by step, each step on the user's button press:
 * setup (pick hosts) → writing → scripted (transcript shown) → voiced (audio generated).
 */
type PodStage = 'setup' | 'writing' | 'scripted' | 'voiced';

interface PodState {
  stage: PodStage;
  hosts: { A: string; B: string };
  length: PodcastLength;
  /** Script for the current article + hosts + length, once written. */
  doc: ArticleDoc | null;
  voices: VoiceSettings[];
  transcript: TranscriptItem[];
  error: string | null;
  /** Host names used in the current script (shown above the chat). */
  names: { A: string; B: string };
  /** Invalidates in-flight script requests when the setup changes. */
  token: number;
}

/** Summary mode: setup (pick length) → writing → ready (summary shown and read aloud). */
type SumStage = 'setup' | 'writing' | 'ready';

interface SumState {
  stage: SumStage;
  length: SummaryLength;
  /** Whether `length` has been loaded from settings. */
  loaded: boolean;
  /** Summary for the current article + length, once written. */
  doc: ArticleDoc | null;
  transcript: TranscriptItem[];
  error: string | null;
  /** Invalidates in-flight summary requests when the setup changes. */
  token: number;
}

class ReaderApp {
  private mode: PlayerMode = 'article';
  /** What the controller is playing (article, selection, podcast script or summary). */
  private doc: ArticleDoc | null = null;
  /** Extracted article, kept so switching modes doesn't re-extract. */
  private articleDoc: ArticleDoc | null = null;
  private articleTextCache: { doc: ArticleDoc; text: string; hash: string } | null = null;
  private positions: Record<PlayerMode, number> = { article: 0, podcast: 0, summary: 0 };
  private sum: SumState = { stage: 'setup', length: 'brief', loaded: false, doc: null, transcript: [], error: null, token: 0 };
  private pod: PodState = {
    stage: 'setup',
    hosts: { A: '', B: '' },
    length: 'short',
    doc: null,
    voices: [],
    transcript: [],
    error: null,
    names: { A: '', B: '' },
    token: 0,
  };
  private preview: Scheduled | null = null;

  private audio = new WebAudioOut();
  private controller: PlaybackController;
  private highlighter = new Highlighter();
  private ui: PlayerBar | null = null;
  private port: Browser.runtime.Port | null = null;
  private nextId = 1;
  /** In-flight port requests; index is the chunk for audio requests, -1 otherwise. */
  private pending = new Map<number, { index: number; handle: (msg: TtsPortResponse) => void }>();
  /** A standalone message (e.g. no article found). */
  private message: { title: string; notice: Notice } | null = null;
  private voice: VoiceSettings = { model: 'bulbul:v4-flash', speaker: 'shubh_en_narration', pace: 1 };
  private prefs: ReadingPrefs | null = null;
  /** "Jump to" pick mode: the next click on an article sentence starts reading there. */
  private picking = false;
  private hoverIndex = -1;
  private hoverFrame = 0;
  private lastPointer: { x: number; y: number } | null = null;
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
      // Loading a doc resets to idle at 0; only real positions count.
      if (this.doc && s.status !== 'idle') this.positions[this.mode] = s.index;
      this.persistPosition();
      this.render();
    });
    this.controller.onChunk((i) => this.highlight(i));

    void this.loadSettings();
    const onVoiceChange = () => void this.loadSettings().then(() => this.controller.invalidateAudio());
    this.unwatch.push(
      voiceItem.watch(onVoiceChange),
      paceItem.watch(onVoiceChange),
      modelItem.watch(() => {
        onVoiceChange();
        // Host voices are per model.
        void this.loadPodcastPrefs().then(() => this.podSetupChanged());
      }),
      prefsItem.watch(() => void this.loadSettings()),
    );

    ctx.addEventListener(document, 'click', (e) => this.onPageClick(e as MouseEvent), { capture: true });
  }

  async command(cmd: PlayerCommand) {
    await this.loadSettings();
    switch (cmd) {
      case 'toggle':
        if (this.doc || this.mode !== 'article') {
          this.ensureUi().show();
          return this.onToggle();
        }
        return this.startArticle(0);
      case 'read-page':
        return this.startArticle(0);
      case 'read-from-selection':
        return this.readFromSelection();
      case 'podcast':
        return this.setMode('podcast');
      case 'summarize':
        return this.summarizeAndPlay();
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
    this.articleDoc = null;
    this.articleTextCache = null;
    this.mode = 'article';
    this.positions = { article: 0, podcast: 0, summary: 0 };
    this.pod = { ...this.pod, stage: 'setup', doc: null, voices: [], transcript: [], error: null, token: this.pod.token + 1 };
    this.sum = { ...this.sum, stage: 'setup', doc: null, transcript: [], error: null, token: this.sum.token + 1 };
    this.highlighter.clear();
    this.stopPick();
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

  // ---- modes ---------------------------------------------------------------

  /** Switch between reading the page, the podcast and the summary. Never starts synthesis by itself. */
  private setMode(mode: PlayerMode): Promise<void> | void {
    this.ensureUi().show();
    if (mode === this.mode && (this.doc || mode !== 'article')) return this.render();
    this.stopPreview();
    this.controller.stop();
    this.highlighter.clear();
    this.notice = null;
    this.message = null;
    this.mode = mode;

    if (mode === 'article') {
      const doc = this.articleDoc ?? this.extract();
      if (!doc) {
        this.doc = null;
        this.controller.load([]);
        return this.showMessage("Couldn't find an article on this page. Select some text, right-click it and choose “Read aloud from here”.");
      }
      this.articleDoc = doc;
      this.setDoc(doc);
      if (this.positions.article > 0) this.controller.seek(this.positions.article);
      return;
    }
    return mode === 'podcast' ? this.openPodcast() : this.openSummary();
  }

  private async openPodcast() {
    const article = this.articleDoc ?? this.extract();
    if (!article) {
      this.doc = null;
      this.controller.load([]);
      return this.showMessage("Couldn't find an article on this page to turn into a podcast.");
    }
    this.articleDoc = article;
    if (!this.pod.hosts.A && !this.pod.hosts.B) await this.loadPodcastPrefs();
    if (this.mode !== 'podcast') return;

    if (this.pod.doc) {
      this.setDoc(this.pod.doc, { voices: this.pod.voices, transcript: this.pod.transcript });
      if (this.positions.podcast > 0) this.controller.seek(this.positions.podcast);
      return;
    }
    this.doc = null;
    this.controller.load([]);
    this.render();
    await this.findCachedScript();
  }

  private async loadPodcastPrefs() {
    const prefs = await getPodcastPrefs();
    this.pod.hosts = { ...prefs.hosts[this.voice.model] };
    this.pod.length = prefs.length;
  }

  private hostsValid(): boolean {
    const { A, B } = this.pod.hosts;
    return !!A && !!B && A !== B;
  }

  /** Hosts or length changed: any existing script no longer matches. */
  private podSetupChanged() {
    this.pod.token++;
    this.pod.error = null;
    this.notice = null;
    if (this.pod.doc) {
      this.pod.doc = null;
      this.pod.voices = [];
      this.pod.transcript = [];
      this.positions.podcast = 0;
      if (this.mode === 'podcast') {
        this.controller.stop();
        this.controller.load([]);
        this.doc = null;
      }
    }
    this.pod.stage = 'setup';
    this.render();
    if (this.mode === 'podcast') void this.findCachedScript();
  }

  private setHost(which: 'A' | 'B', voice: string) {
    this.pod.hosts = { ...this.pod.hosts, [which]: voice };
    void this.savePodcastPrefs();
    this.podSetupChanged();
  }

  private setPodcastLength(length: PodcastLength) {
    this.pod.length = length;
    void this.savePodcastPrefs();
    this.podSetupChanged();
  }

  private async savePodcastPrefs() {
    const prefs = await getPodcastPrefs();
    await podcastItem.setValue({
      length: this.pod.length,
      hosts: { ...prefs.hosts, [this.voice.model]: { ...this.pod.hosts } },
    });
  }

  /** The panel's single button: write the script, then (same button) generate the audio. */
  private podcastAction() {
    if (this.pod.stage === 'setup') return void this.writeScript();
    if (this.pod.stage === 'scripted') return this.generateAudio(this.positions.podcast);
  }

  /** Article text for the LLM, with a hash for cache keys. */
  private articleSource(): { article: ArticleDoc; text: string; hash: string } | null {
    const article = this.articleDoc;
    if (!article) return null;
    if (this.articleTextCache?.doc !== article) {
      const text = articleText(article);
      this.articleTextCache = { doc: article, text, hash: hashString(text) };
    }
    return { article, text: this.articleTextCache.text, hash: this.articleTextCache.hash };
  }

  private scriptRequest(): { request: ScriptRequest; key: string } | null {
    const source = this.hostsValid() ? this.articleSource() : null;
    if (!source) return null;
    const { article, text, hash } = source;
    const names = { A: hostName(this.pod.hosts.A), B: hostName(this.pod.hosts.B) };
    if (names.A === names.B) names.B = `${names.B} Two`;
    return {
      request: { title: article.title, text, hosts: names, length: this.pod.length },
      key: `${pageKey()}|${this.pod.length}|${this.pod.hosts.A}|${this.pod.hosts.B}|${hash}`,
    };
  }

  /** A script for this exact setup may already exist (written earlier); show it without spending anything. */
  private async findCachedScript() {
    const req = this.scriptRequest();
    if (!req) return;
    const token = this.pod.token;
    try {
      const script = await this.requestScript(req.request, req.key, true);
      if (token === this.pod.token && this.mode === 'podcast' && this.pod.stage === 'setup') this.applyScript(script, req.request);
    } catch {
      // Not written yet: stay in setup.
    }
  }

  private async writeScript() {
    const req = this.scriptRequest();
    if (!req) return;
    const token = ++this.pod.token;
    this.pod.stage = 'writing';
    this.pod.error = null;
    this.notice = null;
    this.render();
    try {
      const script = await this.requestScript(req.request, req.key, false);
      if (token !== this.pod.token) return;
      this.applyScript(script, req.request);
    } catch (e) {
      if (token !== this.pod.token) return;
      this.pod.stage = 'setup';
      this.pod.error = (e as Error).message;
      this.render();
    }
  }

  private applyScript(script: PodcastScript, request: ScriptRequest) {
    const doc = docFromTexts('podcast', script.title || request.title, script.turns.map((t) => t.text));
    const voiceOf = (block: number) => ({ ...this.voice, speaker: this.pod.hosts[script.turns[block]!.speaker] });
    const transcript: TranscriptItem[] = [];
    for (const c of doc.chunks) {
      if (transcript.at(-1)?.block === c.block) continue;
      transcript.push({
        block: c.block,
        start: c.index,
        side: script.turns[c.block]!.speaker === 'A' ? 'left' : 'right',
        text: doc.blocks[c.block]!.text,
      });
    }
    this.pod = {
      ...this.pod,
      stage: 'scripted',
      doc,
      voices: doc.chunks.map((c) => voiceOf(c.block)),
      transcript,
      names: { ...request.hosts },
      error: null,
    };
    this.positions.podcast = 0;
    if (this.mode === 'podcast') this.setDoc(doc, { voices: this.pod.voices, transcript });
  }

  // ---- summary -------------------------------------------------------------

  private async openSummary() {
    const article = this.articleDoc ?? this.extract();
    if (!article) {
      this.doc = null;
      this.controller.load([]);
      return this.showMessage("Couldn't find an article on this page to summarise.");
    }
    this.articleDoc = article;
    if (!this.sum.loaded) {
      this.sum.length = await summaryLengthItem.getValue();
      this.sum.loaded = true;
    }
    if (this.mode !== 'summary') return;

    if (this.sum.doc) {
      this.setDoc(this.sum.doc, { transcript: this.sum.transcript });
      if (this.positions.summary > 0) this.controller.seek(this.positions.summary);
      return;
    }
    this.doc = null;
    this.controller.load([]);
    this.render();
    await this.findCachedSummary();
  }

  /** Context menu: open Summary mode and read the summary, writing it first if needed. */
  private async summarizeAndPlay() {
    await this.setMode('summary');
    if (this.mode !== 'summary') return;
    if (this.sum.stage === 'ready') return this.controller.play(this.positions.summary);
    if (this.sum.stage === 'setup') return this.writeSummary();
  }

  private summaryRequest(): { request: SummaryRequest; key: string } | null {
    const source = this.articleSource();
    if (!source) return null;
    const { article, text, hash } = source;
    return {
      request: { title: article.title, text, length: this.sum.length },
      key: `${pageKey()}|${this.sum.length}|${hash}`,
    };
  }

  /** A summary for this article and length may already exist; show it without spending anything. */
  private async findCachedSummary() {
    const req = this.summaryRequest();
    if (!req) return;
    const token = this.sum.token;
    try {
      const summary = await this.requestSummary(req.request, req.key, true);
      if (token === this.sum.token && this.mode === 'summary' && this.sum.stage === 'setup') this.applySummary(summary);
    } catch {
      // Not written yet: stay in setup.
    }
  }

  /** Write the summary, then read it aloud (if the user is still in Summary mode). */
  private async writeSummary() {
    const req = this.summaryRequest();
    if (!req) return;
    // Still inside the click: let audio start later without another press.
    this.audio.unlock();
    const token = ++this.sum.token;
    this.sum.stage = 'writing';
    this.sum.error = null;
    this.notice = null;
    this.render();
    try {
      const summary = await this.requestSummary(req.request, req.key, false);
      if (token !== this.sum.token) return;
      this.applySummary(summary);
      if (this.mode === 'summary') this.controller.play(0);
    } catch (e) {
      if (token !== this.sum.token) return;
      this.sum.stage = 'setup';
      this.sum.error = (e as Error).message;
      this.render();
    }
  }

  private applySummary(summary: Summary) {
    const doc = docFromTexts('summary', summary.title, summary.paragraphs);
    const transcript: TranscriptItem[] = [];
    for (const c of doc.chunks) {
      if (transcript.at(-1)?.block === c.block) continue;
      transcript.push({ block: c.block, start: c.index, side: 'full', text: doc.blocks[c.block]!.text });
    }
    this.sum = { ...this.sum, stage: 'ready', doc, transcript, error: null };
    this.positions.summary = 0;
    if (this.mode === 'summary') this.setDoc(doc, { transcript });
  }

  private setSummaryLength(length: SummaryLength) {
    this.sum.length = length;
    this.sum.loaded = true;
    void summaryLengthItem.setValue(length);
    this.sum.token++;
    this.sum.error = null;
    this.notice = null;
    if (this.sum.doc) {
      this.sum.doc = null;
      this.sum.transcript = [];
      this.positions.summary = 0;
      if (this.mode === 'summary') {
        this.controller.stop();
        this.controller.load([]);
        this.doc = null;
      }
    }
    this.sum.stage = 'setup';
    this.render();
    if (this.mode === 'summary') void this.findCachedSummary();
  }

  private summaryAction() {
    if (this.sum.stage === 'setup') void this.writeSummary();
  }

  private generateAudio(from: number) {
    if (!this.pod.doc) return;
    this.pod.stage = 'voiced';
    if (this.doc !== this.pod.doc) this.setDoc(this.pod.doc, { voices: this.pod.voices, transcript: this.pod.transcript });
    this.controller.play(from);
  }

  /**
   * Play/pause button and Alt+Shift+R. In podcast mode, nothing is generated before its button is
   * pressed; in summary mode, play before a summary exists writes one.
   */
  private onToggle() {
    if (this.mode === 'summary' && this.sum.stage !== 'ready') {
      if (this.sum.stage === 'setup') return void this.writeSummary();
      return;
    }
    if (this.mode === 'podcast') {
      if (this.pod.stage === 'scripted') return this.generateAudio(this.controller.state.index);
      if (this.pod.stage !== 'voiced') {
        this.notice = {
          text: this.pod.stage === 'writing' ? 'The script is still being written…' : 'Choose the two host voices, then press “Write script”.',
          tone: 'attn',
          actions: [],
          clearWhen: 'playing',
          at: 0,
        };
        return this.render();
      }
    }
    if (!this.doc) return void this.startArticle(0);
    this.controller.toggle();
  }

  private onTranscriptClick(index: number) {
    if (this.mode === 'podcast' && this.pod.stage === 'scripted') return this.generateAudio(index);
    this.controller.play(index);
  }

  /** Short sample of a voice so hosts can be chosen by ear (cached after the first play). */
  private async previewVoice(voice: string) {
    if (!voice) return;
    this.audio.unlock();
    this.controller.pause();
    this.stopPreview();
    const name = hostName(voice);
    try {
      const bytes = await this.requestAudio(`Hi, I'm ${name}. Welcome to the show.`, { ...this.voice, speaker: voice }, -1);
      const clip = await this.audio.decode(bytes);
      this.preview = this.audio.schedule(clip, this.audio.now + 0.02);
    } catch (e) {
      this.pod.error = `Couldn't play the sample: ${(e as Error).message}`;
      this.render();
    }
  }

  private stopPreview() {
    this.preview?.stop();
    this.preview = null;
  }

  // ---- loading -------------------------------------------------------------

  private extract(): ArticleDoc | null {
    const doc = extractArticle(document, {
      skipCode: this.prefs?.skipCode ?? true,
      skipTables: this.prefs?.skipTables ?? true,
      skipEmbeds: this.prefs?.skipEmbeds ?? true,
      skipCaptions: this.prefs?.skipCaptions ?? false,
      exclude: this.ui ? [this.ui.host] : [],
    });
    return doc?.chunks.length ? doc : null;
  }

  private loadArticle(): boolean {
    const doc = this.articleDoc ?? this.extract();
    if (!doc) return false;
    this.articleDoc = doc;
    this.mode = 'article';
    this.setDoc(doc);
    return true;
  }

  private setDoc(doc: ArticleDoc, extra?: { voices?: VoiceSettings[]; transcript: TranscriptItem[] }) {
    this.doc = doc;
    this.message = null;
    this.chunkVoices = extra?.voices ?? null;
    this.transcript = extra?.transcript ?? null;
    this.controller.load(doc.chunks.map((c) => ({ block: c.block, speech: c.speech })));
    this.ensureUi().show();
    this.render();
  }

  /** Per-chunk voice overrides (podcast hosts); null = use the reading voice. */
  private chunkVoices: VoiceSettings[] | null = null;
  private transcript: TranscriptItem[] | null = null;

  private async startArticle(from: number) {
    this.stopPreview();
    if (this.mode !== 'article') this.controller.stop();
    if (!this.loadArticle()) {
      const sel = window.getSelection();
      const selDoc = sel && !sel.isCollapsed ? docFromSelection(sel) : null;
      if (selDoc?.chunks.length) {
        this.mode = 'article';
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

  /** Remember the position for articles (not selections or podcasts), debounced. */
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

  private readFromSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return this.startArticle(0);
    const range = sel.getRangeAt(0);
    this.stopPreview();
    // Prefer continuing through the whole article from the selected sentence.
    if (this.doc?.kind !== 'article') {
      this.controller.stop();
      this.loadArticle();
    }
    const idx = this.doc?.kind === 'article' ? locate(this.doc, range.startContainer, range.startOffset) : -1;
    if (idx >= 0) return this.controller.play(idx);
    const selDoc = docFromSelection(sel);
    if (!selDoc?.chunks.length) return;
    this.mode = 'article';
    this.setDoc(selDoc);
    this.controller.play(0);
  }

  // ---- requests over the background port -----------------------------------

  private synth(index: number, speech: string): Promise<ArrayBuffer> {
    return this.requestAudio(speech, this.chunkVoices?.[index] ?? this.voice, index);
  }

  private requestAudio(text: string, voice: VoiceSettings, index: number): Promise<ArrayBuffer> {
    const port = this.connect();
    const id = this.nextId++;
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
      port.postMessage({ type: 'synthesize', id, text, voice: { ...voice } } satisfies TtsPortRequest);
    });
  }

  private requestScript(request: ScriptRequest, cacheKey: string, cacheOnly: boolean): Promise<PodcastScript> {
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
      port.postMessage({ type: 'script', id, request, cacheKey, cacheOnly } satisfies TtsPortRequest);
    }).finally(() => clearInterval(keepAlive));
  }

  private requestSummary(request: SummaryRequest, cacheKey: string, cacheOnly: boolean): Promise<Summary> {
    const port = this.connect();
    const id = this.nextId++;
    const keepAlive = setInterval(() => {
      try {
        this.port?.postMessage({ type: 'ping' } satisfies TtsPortRequest);
      } catch {
        // port closed; the pending request is rejected on disconnect
      }
    }, 20_000);
    return new Promise<Summary>((resolve, reject) => {
      this.pending.set(id, {
        index: -1,
        handle: (msg) => (msg.type === 'summary' ? resolve(msg.summary) : reject(new Error(msg.type === 'error' ? msg.message : 'Unexpected reply'))),
      });
      port.postMessage({ type: 'summary', id, request, cacheKey, cacheOnly } satisfies TtsPortRequest);
    }).finally(() => clearInterval(keepAlive));
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

  /** Alt+click anytime, or any click while "Jump to" is active: read from that sentence's start. */
  private onPageClick(e: MouseEvent) {
    if (!(this.picking || e.altKey) || e.button !== 0) return;
    if (this.ui && e.composedPath().includes(this.ui.host)) return;
    // While picking, page clicks (links included) never act on the page.
    if (this.picking) {
      e.preventDefault();
      e.stopPropagation();
    }
    const pos = caretFromPoint(e.clientX, e.clientY);
    const hit = pos ? this.locateInArticle(pos.node, pos.offset, true) : null;
    if (!hit) {
      if (this.picking) {
        this.notice = { text: 'That isn’t part of the article. Click a highlighted sentence, or press Esc to cancel.', tone: 'attn', actions: [], clearWhen: 'playing', at: 0 };
        this.render();
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.stopPick();
    this.notice = null;
    // Clicking the page always means "read the page from here", even from podcast mode.
    if (this.doc !== hit.doc) {
      this.stopPreview();
      this.controller.stop();
      this.mode = 'article';
      this.setDoc(hit.doc);
    }
    this.controller.play(hit.index);
  }

  /**
   * Find the sentence at a page position. If the page has re-rendered since extraction
   * (stale nodes), re-extract once and try again.
   */
  private locateInArticle(node: Node, offset: number, allowRefresh: boolean): { doc: ArticleDoc; index: number } | null {
    const article = this.doc?.kind === 'article' ? this.doc : (this.articleDoc ?? this.extract());
    if (!article) return null;
    this.articleDoc = article;
    const index = locate(article, node, offset);
    if (index >= 0) return { doc: article, index };
    if (!allowRefresh || !node.isConnected || !(node.textContent ?? '').trim()) return null;
    const fresh = this.extract();
    if (!fresh) return null;
    const again = locate(fresh, node, offset);
    if (again < 0) return null;
    this.articleDoc = fresh;
    if (this.picking) this.markBlocks(fresh, true);
    return { doc: fresh, index: again };
  }

  private togglePick() {
    if (this.picking) return this.stopPick();
    const article = this.doc?.kind === 'article' ? this.doc : (this.articleDoc ?? this.extract());
    if (!article) {
      return this.showMessage("Couldn't find an article on this page to jump around in. Select text and right-click → “Read aloud from here” instead.");
    }
    this.articleDoc = article;
    this.picking = true;
    this.hoverIndex = -1;
    document.documentElement.setAttribute('data-readaloud-pick', '');
    this.markBlocks(article, true);
    window.addEventListener('pointermove', this.onPickMove, { passive: true });
    window.addEventListener('scroll', this.onPickScroll, { passive: true, capture: true });
    window.addEventListener('keydown', this.onPickKey, { capture: true });
    this.render();
  }

  private stopPick() {
    if (!this.picking) return;
    this.picking = false;
    cancelAnimationFrame(this.hoverFrame);
    document.documentElement.removeAttribute('data-readaloud-pick');
    if (this.articleDoc) this.markBlocks(this.articleDoc, false);
    window.removeEventListener('pointermove', this.onPickMove);
    window.removeEventListener('scroll', this.onPickScroll, { capture: true });
    window.removeEventListener('keydown', this.onPickKey, { capture: true });
    this.highlighter.clearHover();
    if (this.notice?.tone === 'attn' && this.notice.text.startsWith('That isn’t part')) this.notice = null;
    this.render();
  }

  private readonly onPickMove = (e: PointerEvent) => {
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.scheduleHover();
  };

  /** Scrolling moves text under a still pointer. */
  private readonly onPickScroll = () => this.scheduleHover();

  private readonly onPickKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    this.stopPick();
  };

  private scheduleHover() {
    cancelAnimationFrame(this.hoverFrame);
    this.hoverFrame = requestAnimationFrame(() => this.updateHover());
  }

  /** Preview where reading would start: the whole sentence under the pointer. */
  private updateHover() {
    const article = this.articleDoc;
    const p = this.lastPointer;
    if (!this.picking || !article || !p) return;
    const pos = caretFromPoint(p.x, p.y);
    const overUi = this.ui && document.elementFromPoint(p.x, p.y) === this.ui.host;
    const index = pos && !overUi ? locate(article, pos.node, pos.offset) : -1;
    if (index === this.hoverIndex) return;
    this.hoverIndex = index;
    const chunk = article.chunks[index];
    if (!chunk) return this.highlighter.clearHover();
    this.highlighter.hover(chunkRange(article, chunk), article.blocks[chunk.block]?.el ?? null);
  }

  private markBlocks(doc: ArticleDoc, on: boolean) {
    for (const b of doc.blocks) {
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
      avoid: this.ui?.rect ?? null,
    });
  }

  // ---- UI ------------------------------------------------------------------

  private ensureUi(): PlayerBar {
    this.ui ??= new PlayerBar({
      toggle: () => this.onToggle(),
      prev: () => this.controller.prev(),
      next: () => this.controller.next(),
      prevBlock: () => this.controller.prevBlock(),
      nextBlock: () => this.controller.nextBlock(),
      playFrom: (i) => this.onTranscriptClick(i),
      setPace: (p) => void paceItem.setValue(p),
      setVoice: (v) => void voiceItem.setValue(v),
      togglePick: () => this.togglePick(),
      openSettings: () => send({ type: 'open-options' }),
      setMode: (m) => this.setMode(m),
      setHost: (which, v) => this.setHost(which, v),
      setPodcastLength: (l) => this.setPodcastLength(l),
      podcastAction: () => this.podcastAction(),
      setSummaryLength: (l) => this.setSummaryLength(l),
      summaryAction: () => this.summaryAction(),
      previewVoice: (v) => void this.previewVoice(v),
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
        podcast: null,
        summary: null,
      });
    } else if (this.doc || this.mode !== 'article') {
      this.ui.render(this.viewBase());
    }
  }

  private podcastPanel(): PodcastPanel {
    const { stage, hosts, length } = this.pod;
    const valid = this.hostsValid();
    const button: PodcastPanel['button'] =
      stage === 'setup'
        ? {
            label: 'Write script',
            tip: valid
              ? `Sarvam-105B writes a conversation between the two hosts from this page (${SCRIPT_COST_TEXT})`
              : 'Choose two different host voices first',
            disabled: !valid,
            busy: false,
          }
        : stage === 'writing'
          ? { label: 'Writing script…', tip: 'Usually takes 20–60 seconds', disabled: true, busy: true }
          : stage === 'scripted'
            ? {
                label: `Generate audio · ≈ ${formatInr(this.pod.doc?.speechChars ?? 0)}`,
                tip: 'Voice the script with the two hosts (sentences already generated are free)',
                disabled: false,
                busy: false,
              }
            : null;
    return { voices: voicesFor(this.voice.model), hostA: hosts.A, hostB: hosts.B, length, button, locked: stage === 'writing' };
  }

  private podcastNotice(): Notice | null {
    if (this.pod.error) {
      return {
        text: this.pod.error,
        tone: 'err',
        actions: /key|settings|credit/i.test(this.pod.error) ? [{ label: 'Open settings', run: () => send({ type: 'open-options' }) }] : [],
      };
    }
    const text =
      this.pod.stage === 'setup'
        ? this.hostsValid()
          ? 'Ready: press “Write script” to have the two hosts discuss this page.'
          : 'Choose two host voices (use ▶ to hear them), then press “Write script”.'
        : this.pod.stage === 'writing'
          ? `Writing the script with Sarvam-105B (${hostName(this.pod.hosts.A)} and ${hostName(this.pod.hosts.B)})… usually 20–60 seconds.`
          : this.pod.stage === 'scripted' && this.controller.state.status === 'idle'
            ? 'Script ready. Read it below, then press “Generate audio” to hear it.'
            : null;
    return text ? { text, tone: 'info', actions: [] } : null;
  }

  private summaryPanel(): SummaryPanel {
    const { stage, length } = this.sum;
    const button: SummaryPanel['button'] =
      stage === 'setup'
        ? {
            label: 'Summarize',
            tip: `Sarvam-105B summarises this page (${SUMMARY_COST_TEXT}), then it's read aloud`,
            disabled: false,
            busy: false,
          }
        : stage === 'writing'
          ? { label: 'Summarizing…', tip: 'Usually takes 5–20 seconds', disabled: true, busy: true }
          : null;
    return { length, button, locked: stage === 'writing' };
  }

  private summaryNotice(): Notice | null {
    if (this.sum.error) {
      return {
        text: this.sum.error,
        tone: 'err',
        actions: /key|settings|credit/i.test(this.sum.error) ? [{ label: 'Open settings', run: () => send({ type: 'open-options' }) }] : [],
      };
    }
    const text =
      this.sum.stage === 'setup'
        ? 'Press “Summarize” (or ▶) to hear a short summary of this page instead of all of it.'
        : this.sum.stage === 'writing'
          ? 'Summarising the page with Sarvam-105B… usually 5–20 seconds.'
          : null;
    return text ? { text, tone: 'info', actions: [] } : null;
  }

  private viewBase() {
    const doc = this.doc;
    const state = this.controller.state;
    const podcastMode = this.mode === 'podcast';
    const summaryMode = this.mode === 'summary';
    const remainingChars = doc ? doc.chunks.slice(state.index).reduce((n, c) => n + c.speech.length, 0) : 0;
    const minutes = (doc?.speechChars ?? 0) / CHARS_PER_SEC / this.voice.pace / 60;
    const errorNotice: Notice | null =
      state.status === 'error'
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
        : null;
    const notice = this.notice ?? errorNotice ?? (podcastMode ? this.podcastNotice() : summaryMode ? this.summaryNotice() : null);
    const speakerOf = (i: number) => {
      const block = doc?.chunks[i]?.block;
      const side = this.transcript?.find((t) => t.block === block)?.side;
      return side ? this.pod.names[side === 'left' ? 'A' : 'B'] : undefined;
    };
    const articleTitle = this.articleDoc?.title || document.title || 'Read Aloud';
    return {
      title: podcastMode ? `Podcast · ${articleTitle}` : summaryMode ? `Summary · ${articleTitle}` : doc?.title || articleTitle,
      mode: this.mode,
      podcast: podcastMode ? this.podcastPanel() : null,
      summary: summaryMode ? this.summaryPanel() : null,
      notice,
      state,
      chunkText: (i: number) => {
        const text = doc?.chunks[i]?.display ?? '';
        const who = podcastMode ? speakerOf(i) : undefined;
        return who ? `${who}: ${text}` : text;
      },
      overview: doc
        ? `${podcastMode ? `${this.transcript?.length ?? 0} turns` : `${doc.chunks.length} sentences`} · ~${Math.max(1, Math.round(minutes))} min · ≈ ${formatInr(doc.speechChars)} to synthesise (cached sentences are free)`
        : '',
      transcript: this.mode === 'article' ? null : this.transcript,
      hostNames: podcastMode && this.transcript?.length ? { left: this.pod.names.A, right: this.pod.names.B } : null,
      remainingMinutes: remainingChars / CHARS_PER_SEC / this.voice.pace / 60,
      pace: this.voice.pace,
      paces: SPEED_STEPS,
      voice: this.voice.speaker,
      voices: READING_SHORTLIST[this.voice.model],
      picking: this.picking,
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
