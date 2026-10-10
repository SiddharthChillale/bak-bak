// Floating player, docked bottom-right (articles are usually centred, so it stays
// clear of the text), isolated in a closed shadow root.

import { prettyVoice } from '../voices';
import type { PlayerState } from './controller';

export interface Notice {
  text: string;
  tone: 'info' | 'attn' | 'err';
  actions: { label: string; run: () => void }[];
}

export interface TranscriptItem {
  block: number;
  /** First chunk index of this item. */
  start: number;
  /** Host 1 speaks on the left, host 2 on the right. */
  side: 'left' | 'right';
  text: string;
}

export type PlayerMode = 'article' | 'podcast';

/** Podcast setup panel: pick hosts, write the script, then generate audio, all on demand. */
export interface PodcastPanel {
  voices: readonly string[];
  hostA: string;
  hostB: string;
  length: 'short' | 'standard';
  /** Primary button; null hides it (audio already generated). */
  button: { label: string; tip: string; disabled: boolean; busy: boolean } | null;
  /** Host/length pickers are locked while the script is being written. */
  locked: boolean;
}

export interface PlayerView {
  title: string;
  mode: PlayerMode;
  podcast?: PodcastPanel | null;
  /** Podcast transcript as a chat; each message is clickable to play from there. */
  transcript?: TranscriptItem[] | null;
  /** Host names shown once above the chat (left host, right host). */
  hostNames?: { left: string; right: string } | null;
  /** Overrides the "now reading" line, with optional action buttons. */
  notice?: Notice | null;
  state: PlayerState;
  /** Display text of chunk i (for the "now reading" line). */
  chunkText(i: number): string;
  summary: string;
  remainingMinutes: number;
  pace: number;
  paces: readonly number[];
  voice: string;
  voices: readonly string[];
  /** "Jump to" pick mode is active: the user is choosing a sentence on the page. */
  picking: boolean;
}

export interface PlayerHandlers {
  toggle(): void;
  prev(): void;
  next(): void;
  prevBlock(): void;
  nextBlock(): void;
  /** Play from a chunk (chat message clicks). */
  playFrom(index: number): void;
  setPace(pace: number): void;
  setVoice(voice: string): void;
  /** Start/stop "Jump to" pick mode. */
  togglePick(): void;
  setMode(mode: PlayerMode): void;
  setHost(which: 'A' | 'B', voice: string): void;
  setPodcastLength(length: 'short' | 'standard'): void;
  podcastAction(): void;
  previewVoice(voice: string): void;
  openSettings(): void;
  close(): void;
}

const MORE_VOICES = '__more__';

const ICONS = {
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/>',
  prev: '<path d="M17 6.5v11a.8.8 0 0 1-1.25.66L8.5 13.1V17a1 1 0 0 1-2 0V7a1 1 0 0 1 2 0v3.9l7.25-5.06A.8.8 0 0 1 17 6.5Z"/>',
  next: '<path d="M7 6.5v11a.8.8 0 0 0 1.25.66l7.25-5.06V17a1 1 0 0 0 2 0V7a1 1 0 0 0-2 0v3.9L8.25 5.84A.8.8 0 0 0 7 6.5Z"/>',
  prevBlock: '<path d="M12 6.5v11a.8.8 0 0 1-1.25.66L3.6 12.66a.8.8 0 0 1 0-1.32l7.15-5.5A.8.8 0 0 1 12 6.5Zm9 0v11a.8.8 0 0 1-1.25.66l-7.15-5.5a.8.8 0 0 1 0-1.32l7.15-5.5A.8.8 0 0 1 21 6.5Z"/>',
  nextBlock: '<path d="M12 6.5v11a.8.8 0 0 0 1.25.66l7.15-5.5a.8.8 0 0 0 0-1.32l-7.15-5.5A.8.8 0 0 0 12 6.5Zm-9 0v11a.8.8 0 0 0 1.25.66l7.15-5.5a.8.8 0 0 0 0-1.32L4.25 5.84A.8.8 0 0 0 3 6.5Z"/>',
  read: '<path d="M4 5.5h16a1 1 0 1 1 0 2H4a1 1 0 0 1 0-2Zm0 5.5h16a1 1 0 1 1 0 2H4a1 1 0 1 1 0-2Zm0 5.5h10a1 1 0 1 1 0 2H4a1 1 0 1 1 0-2Z"/>',
  podcast: '<path d="M12 2.5a3.5 3.5 0 0 1 3.5 3.5v6a3.5 3.5 0 1 1-7 0V6A3.5 3.5 0 0 1 12 2.5Zm-6 9a1 1 0 0 1 1 1 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21h2.5a1 1 0 1 1 0 2h-7a1 1 0 1 1 0-2H11v-1.57A7 7 0 0 1 5 12.5a1 1 0 0 1 1-1Z"/>',
  cursor: '<path d="M5.5 3.4v15.3a.7.7 0 0 0 1.2.48l3.5-3.6 2.25 5.2a.9.9 0 0 0 1.18.47l1.5-.66a.9.9 0 0 0 .47-1.18l-2.24-5.14 4.94-.32a.7.7 0 0 0 .44-1.2L6.7 2.92a.7.7 0 0 0-1.2.48Z"/>',
  settings: '<path d="M10.3 2.6a1 1 0 0 1 1-.6h1.4a1 1 0 0 1 1 .6l.6 1.7a7.6 7.6 0 0 1 1.6.9l1.8-.4a1 1 0 0 1 1.1.5l.7 1.2a1 1 0 0 1-.1 1.2l-1.2 1.3a7.7 7.7 0 0 1 0 1.9l1.2 1.3a1 1 0 0 1 .1 1.2l-.7 1.2a1 1 0 0 1-1.1.5l-1.8-.4a7.6 7.6 0 0 1-1.6.9l-.6 1.7a1 1 0 0 1-1 .6h-1.4a1 1 0 0 1-1-.6l-.6-1.7a7.6 7.6 0 0 1-1.6-.9l-1.8.4a1 1 0 0 1-1.1-.5l-.7-1.2a1 1 0 0 1 .1-1.2l1.2-1.3a7.7 7.7 0 0 1 0-1.9L4.1 8.1A1 1 0 0 1 4 6.9l.7-1.2a1 1 0 0 1 1.1-.5l1.8.4a7.6 7.6 0 0 1 1.6-.9l.6-1.7ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" transform="translate(0 1)"/>',
  minimize: '<rect x="5" y="11" width="14" height="2" rx="1"/>',
  expand: '<path d="M6.3 14.7a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1-1.4 1.4L12 10.4l-4.3 4.3a1 1 0 0 1-1.4 0Z"/>',
  close: '<path d="M6.3 6.3a1 1 0 0 1 1.4 0L12 10.6l4.3-4.3a1 1 0 1 1 1.4 1.4L13.4 12l4.3 4.3a1 1 0 0 1-1.4 1.4L12 13.4l-4.3 4.3a1 1 0 0 1-1.4-1.4l4.3-4.3-4.3-4.3a1 1 0 0 1 0-1.4Z"/>',
};

const icon = (name: keyof typeof ICONS) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

const CSS_TEXT = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.wrap {
  --bg: #fffdf9; --fg: #1d1b19; --muted: #6f6a64; --line: #e7e1d8; --chip: #f4efe7;
  --accent: #b4532a; --accent-fg: #fff; --err: #b3261e;
  --bubble-left: #f1ece4; --bubble-right: #f6e3d8;
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  width: min(440px, calc(100vw - 32px));
  font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--fg); -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .wrap { --bg: #1f1d1b; --fg: #f2eee8; --muted: #a59f97; --line: #3a3632; --chip: #2b2825; --accent: #e8875c; --accent-fg: #1d1b19; --err: #ff8a80;
    --bubble-left: #2c2926; --bubble-right: #3a2a22; }
}
.bar {
  background: var(--bg); border: 1px solid var(--line); border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.08);
  padding: 10px 12px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px;
  /* Never taller than the window: the chat shrinks first, then the bar scrolls. */
  max-height: calc(100vh - 32px); overflow: auto; overscroll-behavior: contain;
}
.top { display: flex; gap: 6px; align-items: flex-start; }
.meta { flex: 1; min-width: 0; }
.title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.now { color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 1.4em; }
.now.err { color: var(--err); display: block; }
.now.attn { color: var(--accent); font-weight: 600; display: block; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.actions:empty { display: none; }
.actions button { width: auto; height: auto; padding: 3px 10px; border: 1px solid var(--line); border-radius: 999px; font-size: 12px; }
.actions button:first-child { border-color: var(--accent); color: var(--accent); }
button, select {
  font: inherit; color: inherit; background: transparent; border: 0; border-radius: 8px; cursor: pointer;
}
button { display: inline-grid; place-items: center; width: 32px; height: 32px; padding: 0; }
button svg { width: 18px; height: 18px; fill: currentColor; }
button:hover, select:hover { background: var(--chip); }
button:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
button.main { width: 40px; height: 40px; border-radius: 50%; background: var(--accent); color: var(--accent-fg); }
button.main:hover { filter: brightness(1.08); background: var(--accent); }
button.main svg { width: 20px; height: 20px; }
button.main.busy { animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .65; } }
.controls { display: flex; align-items: center; gap: 4px; }
.transport { display: flex; align-items: center; gap: 2px; }
.info { color: var(--muted); font-variant-numeric: tabular-nums; margin-left: auto; white-space: nowrap; font-size: 12px; }
.options { display: flex; align-items: center; gap: 6px; }
.options select { flex: none; }
select { padding: 6px 6px; background: var(--chip); max-width: 170px; }
button.text { width: auto; padding: 0 10px 0 8px; gap: 5px; display: inline-flex; align-items: center; background: var(--chip); font-weight: 500; }
button.text svg { width: 15px; height: 15px; }
button.text[aria-pressed="true"] { background: var(--accent); color: var(--accent-fg); }
.options .end { margin-left: auto; }
.modes { display: inline-flex; gap: 2px; padding: 2px; background: var(--chip); border-radius: 999px; flex: none; }
button.mode { width: auto; height: 28px; padding: 0 10px 0 8px; gap: 4px; display: inline-flex; align-items: center; border-radius: 999px; font-size: 12px; font-weight: 500; color: var(--muted); }
button.mode svg { width: 15px; height: 15px; }
button.mode:hover { background: transparent; color: var(--fg); }
button.mode[aria-pressed="true"] { background: var(--bg); color: var(--accent); box-shadow: 0 1px 3px rgba(0,0,0,.14); }
.pod { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; align-items: end;
  border: 1px solid var(--line); border-radius: 10px; padding: 8px; }
.pod[hidden] { display: none; }
.pod label { display: grid; gap: 3px; min-width: 0; font-size: 12px; color: var(--muted); }
.pod .pick { display: flex; gap: 4px; align-items: center; min-width: 0; }
.pod .pick select { flex: 1; width: 0; min-width: 0; max-width: none; }
.pod .pick button { width: 28px; height: 28px; flex: none; }
.pod .pick button svg { width: 14px; height: 14px; }
.pod button:disabled { opacity: .4; cursor: default; }
.pod > label:nth-of-type(3) select { width: 100%; max-width: none; }
button.primary { width: 100%; height: 34px; padding: 0 14px; border-radius: 999px; background: var(--accent); color: var(--accent-fg); font-weight: 600; white-space: nowrap; }
button.primary:hover { background: var(--accent); filter: brightness(1.08); }
button.primary[aria-disabled="true"] { opacity: .5; cursor: default; filter: none; }
button.primary.busy { animation: pulse 1.2s ease-in-out infinite; }
.chat[hidden] { display: none; }
.chat { display: grid; gap: 4px; }
.chathead { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: var(--muted); padding: 0 4px; }
.chathead span:last-child { text-align: right; }
.transcript {
  position: relative; max-height: clamp(140px, calc(100vh - 420px), 340px); overflow: auto; display: flex; flex-direction: column; gap: 6px;
  padding: 22px 2px; scrollbar-width: thin;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%);
}
.msg { all: unset; box-sizing: border-box; max-width: 82%; padding: 7px 11px; line-height: 1.45; cursor: pointer;
  opacity: .62; transition: opacity .2s ease; }
.msg.left { align-self: flex-start; background: var(--bubble-left); border-radius: 14px 14px 14px 4px; }
.msg.right { align-self: flex-end; background: var(--bubble-right); border-radius: 14px 14px 4px 14px; }
.msg:hover, .msg.on { opacity: 1; }
.msg:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.pill {
  display: none; align-items: center; gap: 8px; margin-left: auto; width: max-content; max-width: 100%;
  background: var(--bg); border: 1px solid var(--line); border-radius: 999px; padding: 4px 6px 4px 4px;
  box-shadow: 0 6px 20px rgba(0,0,0,.16);
}
.pill .title { max-width: 260px; font-weight: 500; }
.pill .hint { display: none; font-weight: 600; color: var(--accent); max-width: 260px; }
.wrap.picking .pill .title { display: none; }
.wrap.picking .pill .hint { display: inline; }
.wrap.min .bar { display: none; }
.wrap.min .pill { display: flex; }
.wrap.min { width: auto; }
.tip {
  position: absolute; z-index: 1; pointer-events: none; max-width: 260px; width: max-content;
  padding: 5px 9px; border-radius: 7px; font-size: 12px; line-height: 1.35;
  background: var(--fg); color: var(--bg); box-shadow: 0 4px 14px rgba(0,0,0,.2);
  transform: translate(-50%, calc(-100% - 8px)); opacity: 0; transition: opacity .12s ease;
}
.tip.on { opacity: 1; }
`;

export class PlayerBar {
  readonly host = document.createElement('readaloud-player');
  private root = this.host.attachShadow({ mode: 'closed' });
  private els: Record<string, HTMLElement> = {};
  private view: PlayerView | null = null;
  private renderedTranscript: TranscriptItem[] | null = null;
  private activeTurn = -1;
  private pointerInTranscript = false;
  /** Whether the user minimized the bar themselves (restored after picking). */
  private userMinimized = false;
  /** Re-anchors a visible tooltip after the bar's layout changes. */
  private repositionTip: () => void = () => {};

  constructor(private h: PlayerHandlers) {
    this.host.style.display = 'none';
    attachStyles(this.root, CSS_TEXT);
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML = `
      <div class="bar" role="region" aria-label="Read aloud player">
        <div class="top">
          <div class="meta">
            <div class="title" data-el="title"></div>
            <div class="now" data-el="now" aria-live="polite"></div>
            <div class="actions" data-el="actions"></div>
          </div>
          <div class="modes" role="group" aria-label="Mode">
            <button class="mode" data-act="mode-article" data-el="modeArticle" aria-pressed="true"
              data-tip="Read mode: read the page aloud, sentence by sentence">${icon('read')}Read</button>
            <button class="mode" data-act="mode-podcast" data-el="modePodcast" aria-pressed="false"
              data-tip="Podcast mode: two hosts discuss this page (you write the script first)">${icon('podcast')}Podcast</button>
          </div>
          <button data-act="minimize" aria-label="Minimize player" data-tip="Minimize the player">${icon('minimize')}</button>
          <button data-act="close" aria-label="Stop and close" data-tip="Stop reading and close the player">${icon('close')}</button>
        </div>
        <div class="pod" data-el="pod" hidden>
          <label>Host 1 (left)
            <span class="pick">
              <select data-el="hostA" aria-label="Host 1 voice" data-tip="Voice of the lead host"></select>
              <button data-act="previewA" data-el="previewA" aria-label="Preview host 1 voice" data-tip="Hear a short sample of this voice">${icon('play')}</button>
            </span>
          </label>
          <label>Host 2 (right)
            <span class="pick">
              <select data-el="hostB" aria-label="Host 2 voice" data-tip="Voice of the co-host"></select>
              <button data-act="previewB" data-el="previewB" aria-label="Preview host 2 voice" data-tip="Hear a short sample of this voice">${icon('play')}</button>
            </span>
          </label>
          <label>Length
            <select data-el="podLength" aria-label="Podcast length" data-tip="Target length of the conversation">
              <option value="short">Short (~5 min)</option>
              <option value="standard">Standard (~10 min)</option>
            </select>
          </label>
          <button class="primary" data-act="podAction" data-el="podAction"></button>
        </div>
        <div class="chat" data-el="chat" hidden>
          <div class="chathead"><span data-el="nameLeft"></span><span data-el="nameRight"></span></div>
          <div class="transcript" data-el="transcript" role="list" aria-label="Podcast conversation"></div>
        </div>
        <div class="controls">
          <div class="transport">
            <button data-act="prevBlock" aria-label="Previous paragraph" data-tip="Previous paragraph (or start of this one)">${icon('prevBlock')}</button>
            <button data-act="prev" aria-label="Previous sentence" data-tip="Previous sentence (Alt+Shift+,)">${icon('prev')}</button>
            <button class="main" data-act="toggle" data-el="toggle" aria-label="Play" data-tip="Play (Alt+Shift+R)">${icon('play')}</button>
            <button data-act="next" aria-label="Next sentence" data-tip="Next sentence (Alt+Shift+.)">${icon('next')}</button>
            <button data-act="nextBlock" aria-label="Next paragraph" data-tip="Next paragraph">${icon('nextBlock')}</button>
          </div>
          <span class="info" data-el="info"></span>
        </div>
        <div class="options">
          <button class="text" data-act="pick" data-el="pick" aria-pressed="false" aria-label="Jump to a sentence"
            data-tip="Jump to: click any sentence on the page to read from its start (Esc cancels; Alt+click works anytime)">${icon('cursor')}Jump to</button>
          <select data-el="pace" aria-label="Speed" data-tip="Reading speed (applies from the next sentence)"></select>
          <select data-el="voice" aria-label="Voice" data-tip="Reading voice (podcast hosts are chosen in Podcast mode)"></select>
          <button class="end" data-act="settings" aria-label="Settings" data-tip="Settings: API key, voices, usage, cache">${icon('settings')}</button>
        </div>
      </div>
      <div class="pill" role="region" aria-label="Read aloud player (minimized)">
        <button class="main" data-act="toggle" data-el="toggle2" aria-label="Play" data-tip="Play (Alt+Shift+R)">${icon('play')}</button>
        <span class="title" data-el="title2"></span>
        <span class="hint">Click a sentence on the page · Esc to cancel</span>
        <button data-act="expand" data-el="expand" aria-label="Expand player" data-tip="Expand the player">${icon('expand')}</button>
      </div>
      <div class="tip" data-el="tip" aria-hidden="true"></div>`;
    this.root.append(wrap);
    for (const el of wrap.querySelectorAll<HTMLElement>('[data-el]')) this.els[el.dataset.el!] = el;
    this.els.wrap = wrap;

    wrap.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      switch (act) {
        case 'toggle': return this.h.toggle();
        case 'prev': return this.h.prev();
        case 'next': return this.h.next();
        case 'prevBlock': return this.h.prevBlock();
        case 'nextBlock': return this.h.nextBlock();
        case 'pick': return this.h.togglePick();
        case 'settings': return this.h.openSettings();
        case 'close': return this.h.close();
        case 'mode-article': return this.h.setMode('article');
        case 'mode-podcast': return this.h.setMode('podcast');
        case 'podAction':
          if (this.els.podAction!.getAttribute('aria-disabled') === 'true') return;
          return this.h.podcastAction();
        case 'previewA': return this.h.previewVoice((this.els.hostA as HTMLSelectElement).value);
        case 'previewB': return this.h.previewVoice((this.els.hostB as HTMLSelectElement).value);
        case 'minimize':
          this.userMinimized = true;
          return wrap.classList.add('min');
        case 'expand':
          // While picking, the expand button cancels picking (which restores the bar).
          if (this.view?.picking) return this.h.togglePick();
          this.userMinimized = false;
          return wrap.classList.remove('min');
      }
    });

    this.els.pace!.addEventListener('change', (e) => this.h.setPace(Number((e.target as HTMLSelectElement).value)));
    this.els.voice!.addEventListener('change', (e) => {
      const sel = e.target as HTMLSelectElement;
      if (sel.value === MORE_VOICES) {
        sel.value = this.view?.voice ?? '';
        this.h.openSettings();
      } else this.h.setVoice(sel.value);
    });
    this.els.hostA!.addEventListener('change', (e) => this.h.setHost('A', (e.target as HTMLSelectElement).value));
    this.els.hostB!.addEventListener('change', (e) => this.h.setHost('B', (e.target as HTMLSelectElement).value));
    this.els.podLength!.addEventListener('change', (e) =>
      this.h.setPodcastLength((e.target as HTMLSelectElement).value === 'standard' ? 'standard' : 'short'),
    );
    // Don't auto-scroll the chat out from under the pointer.
    this.els.transcript!.addEventListener('pointerenter', () => (this.pointerInTranscript = true));
    this.els.transcript!.addEventListener('pointerleave', () => (this.pointerInTranscript = false));
    this.setupTooltips(wrap);
    // Keep page shortcuts from firing while using the bar.
    wrap.addEventListener('keydown', (e) => e.stopPropagation());

    document.documentElement.append(this.host);
  }

  /** The player's on-screen box (bar or minimized pill), or null when hidden. */
  get rect(): DOMRect | null {
    if (this.host.style.display === 'none') return null;
    const wrap = this.els.wrap!;
    const visible = wrap.classList.contains('min') ? wrap.querySelector('.pill') : wrap.firstElementChild;
    return (visible as HTMLElement | null)?.getBoundingClientRect() ?? null;
  }

  show() {
    this.host.style.display = '';
  }

  hide() {
    this.host.style.display = 'none';
  }

  remove() {
    this.host.remove();
  }

  render(v: PlayerView) {
    const wasPicking = this.view?.picking ?? false;
    this.view = v;
    const { state } = v;
    const wrap = this.els.wrap!;
    const playing = state.status === 'playing';
    this.els.title!.textContent = v.title;
    this.els.title2!.textContent = v.title;

    // Picking collapses the bar to the pill so it covers less of the page.
    if (v.picking !== wasPicking) {
      wrap.classList.toggle('picking', v.picking);
      wrap.classList.toggle('min', v.picking || this.userMinimized);
      this.els.expand!.dataset.tip = v.picking ? 'Cancel jump (Esc)' : 'Expand the player';
      this.els.expand!.setAttribute('aria-label', v.picking ? 'Cancel jump' : 'Expand player');
    }

    for (const key of ['toggle', 'toggle2'] as const) {
      const btn = this.els[key]!;
      btn.innerHTML = icon(playing ? 'pause' : 'play');
      const label = playing ? 'Pause' : 'Play';
      btn.setAttribute('aria-label', label);
      btn.dataset.tip = `${label} (Alt+Shift+R)`;
      btn.classList.toggle('busy', state.buffering && playing);
    }

    const now = this.els.now!;
    now.className = 'now';
    const actions = this.els.actions!;
    actions.replaceChildren(
      ...(v.notice?.actions ?? []).map((a) => {
        const b = document.createElement('button');
        b.textContent = a.label;
        b.addEventListener('click', a.run);
        return b;
      }),
    );
    if (v.notice) {
      if (v.notice.tone !== 'info') now.classList.add(v.notice.tone);
      now.textContent = v.notice.text;
    } else if (state.status === 'error') {
      now.classList.add('err');
      now.textContent = `${state.error ?? 'Something went wrong.'} Press ▶ to retry.`;
    } else if (state.status === 'blocked') {
      now.classList.add('attn');
      now.textContent = 'Press ▶ to start: the browser needs a click on the page before it plays audio.';
    } else if (state.status === 'idle') {
      now.textContent = v.summary;
    } else if (state.status === 'ended') {
      now.textContent = 'Finished. Press ▶ to start over.';
    } else {
      const prefix = state.buffering && playing ? 'Loading audio… ' : '';
      now.textContent = prefix + v.chunkText(state.index);
    }

    this.els.info!.textContent = state.total
      ? `${Math.min(state.index + 1, state.total)} / ${state.total} · ~${Math.max(1, Math.round(v.remainingMinutes))} min left`
      : '';

    const pace = this.els.pace as HTMLSelectElement;
    if (pace.options.length !== v.paces.length || !pace.matches(':focus')) {
      pace.replaceChildren(...v.paces.map((p) => new Option(`${p}×`, String(p))));
      pace.value = String(v.paces.includes(v.pace) ? v.pace : 1);
    }
    const voice = this.els.voice as HTMLSelectElement;
    if (!voice.matches(':focus')) {
      const list = v.voices.includes(v.voice) ? v.voices : [v.voice, ...v.voices];
      voice.replaceChildren(...list.map((id) => new Option(prettyVoice(id), id)), new Option('More voices…', MORE_VOICES));
      voice.value = v.voice;
    }
    // Page sentences belong to Read mode; in Podcast mode, the chat messages are the jump targets.
    this.els.pick!.hidden = v.mode === 'podcast';
    this.els.voice!.hidden = v.mode === 'podcast';
    this.els.pick!.setAttribute('aria-pressed', String(v.picking));
    this.els.modeArticle!.setAttribute('aria-pressed', String(v.mode === 'article'));
    this.els.modePodcast!.setAttribute('aria-pressed', String(v.mode === 'podcast'));
    this.renderPodcast(v.podcast ?? null);
    this.renderChat(v.transcript ?? null, v.hostNames ?? null, state.index);
    this.repositionTip();
  }

  private renderPodcast(p: PodcastPanel | null) {
    const box = this.els.pod!;
    box.hidden = !p;
    if (!p) return;
    for (const [key, value] of [['hostA', p.hostA], ['hostB', p.hostB]] as const) {
      const sel = this.els[key] as HTMLSelectElement;
      if (sel.options.length !== p.voices.length + 1) {
        sel.replaceChildren(new Option('Choose a voice…', ''), ...p.voices.map((id) => new Option(prettyVoice(id), id)));
      }
      if (!sel.matches(':focus')) sel.value = value;
      sel.disabled = p.locked;
    }
    (this.els.previewA as HTMLButtonElement).disabled = !p.hostA;
    (this.els.previewB as HTMLButtonElement).disabled = !p.hostB;
    const len = this.els.podLength as HTMLSelectElement;
    len.value = p.length;
    len.disabled = p.locked;
    const btn = this.els.podAction as HTMLButtonElement;
    btn.hidden = !p.button;
    if (p.button) {
      btn.textContent = p.button.label;
      btn.dataset.tip = p.button.tip;
      // aria-disabled (not disabled) so the tooltip can still explain why.
      btn.setAttribute('aria-disabled', String(p.button.disabled));
      btn.classList.toggle('busy', p.button.busy);
    }
  }

  /**
   * Quick custom tooltips for every control with `data-tip` (native `title` tooltips are slow
   * and unreliable inside an injected shadow root). Shown on hover after a short delay and
   * immediately on keyboard focus.
   */
  private setupTooltips(wrap: HTMLElement) {
    const tip = this.els.tip!;
    let target: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const hide = () => {
      clearTimeout(timer);
      target = null;
      tip.classList.remove('on');
    };
    const place = (el: HTMLElement) => {
      tip.textContent = el.dataset.tip ?? '';
      const w = wrap.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      // Centre above the control, kept inside the viewport.
      const half = tip.offsetWidth / 2;
      const x = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8);
      tip.style.left = `${x - w.left}px`;
      tip.style.top = `${r.top - w.top}px`;
    };
    const show = (el: HTMLElement, delay: number) => {
      clearTimeout(timer);
      target = el;
      timer = setTimeout(() => {
        if (target !== el || !el.dataset.tip) return;
        place(el);
        tip.classList.add('on');
      }, delay);
    };
    this.repositionTip = () => {
      if (!target || !tip.classList.contains('on')) return;
      if (!target.isConnected || !target.offsetParent) return hide();
      place(target);
    };

    wrap.addEventListener('pointerover', (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-tip]');
      if (el && el !== target) show(el, 350);
      else if (!el) hide();
    });
    wrap.addEventListener('pointerleave', hide);
    wrap.addEventListener('pointerout', (e) => {
      const to = e.relatedTarget as Node | null;
      if (!to || !wrap.contains(to)) hide();
    });
    wrap.addEventListener('pointerdown', hide);
    wrap.addEventListener('focusin', (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-tip]');
      if (el?.matches(':focus-visible')) show(el, 0);
    });
    wrap.addEventListener('focusout', hide);
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hide();
    });
  }

  private renderChat(items: TranscriptItem[] | null, names: { left: string; right: string } | null, index: number) {
    const chat = this.els.chat!;
    const box = this.els.transcript!;
    chat.hidden = !items?.length;
    this.els.nameLeft!.textContent = names?.left ?? '';
    this.els.nameRight!.textContent = names?.right ?? '';
    if (items !== this.renderedTranscript) {
      this.renderedTranscript = items;
      this.activeTurn = -1;
      box.replaceChildren(
        ...(items ?? []).map((t) => {
          const b = document.createElement('button');
          b.className = `msg ${t.side}`;
          b.setAttribute('role', 'listitem');
          b.dataset.tip = 'Play from here';
          b.textContent = t.text;
          b.addEventListener('click', () => this.h.playFrom(t.start));
          return b;
        }),
      );
    }
    if (!items?.length) return;
    let active = 0;
    for (let i = 0; i < items.length; i++) if (items[i]!.start <= index) active = i;
    if (active === this.activeTurn) return;
    box.children[this.activeTurn]?.classList.remove('on');
    const el = box.children[active] as HTMLElement | undefined;
    el?.classList.add('on');
    this.activeTurn = active;
    // Keep the current message in the clear (unfaded) area without scrolling the page.
    if (el && !this.pointerInTranscript) box.scrollTo({ top: el.offsetTop - box.clientHeight / 3, behavior: 'smooth' });
  }
}

function attachStyles(root: ShadowRoot, css: string) {
  // Constructed stylesheets aren't subject to the page's CSP style-src; fall back to <style>
  // where content scripts can't adopt them (older Firefox).
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];
    return;
  } catch {
    // fall through
  }
  const style = document.createElement('style');
  style.textContent = css;
  root.append(style);
}
