// Floating player bar, isolated in a closed shadow root.

import { prettyVoice } from '../voices';
import type { PlayerState } from './controller';

export interface PlayerView {
  title: string;
  state: PlayerState;
  /** Display text of chunk i (for the "now reading" line and seek preview). */
  chunkText(i: number): string;
  summary: string;
  remainingMinutes: number;
  pace: number;
  paces: readonly number[];
  voice: string;
  voices: readonly string[];
  jumpMode: boolean;
}

export interface PlayerHandlers {
  toggle(): void;
  prev(): void;
  next(): void;
  prevBlock(): void;
  nextBlock(): void;
  seek(index: number): void;
  setPace(pace: number): void;
  setVoice(voice: string): void;
  toggleJump(): void;
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
  jump: '<path d="M12 3a1 1 0 0 1 1 1v1.07A7 7 0 0 1 18.93 11H20a1 1 0 1 1 0 2h-1.07A7 7 0 0 1 13 18.93V20a1 1 0 1 1-2 0v-1.07A7 7 0 0 1 5.07 13H4a1 1 0 1 1 0-2h1.07A7 7 0 0 1 11 5.07V4a1 1 0 0 1 1-1Zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/>',
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
.wrap {
  --bg: #fffdf9; --fg: #1d1b19; --muted: #6f6a64; --line: #e7e1d8; --chip: #f4efe7;
  --accent: #b4532a; --accent-fg: #fff; --err: #b3261e;
  position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 2147483647;
  width: min(720px, calc(100vw - 32px));
  font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--fg); -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .wrap { --bg: #1f1d1b; --fg: #f2eee8; --muted: #a59f97; --line: #3a3632; --chip: #2b2825; --accent: #e8875c; --accent-fg: #1d1b19; --err: #ff8a80; }
}
.bar {
  background: var(--bg); border: 1px solid var(--line); border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.08);
  padding: 10px 12px 10px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px;
}
.top { display: flex; gap: 8px; align-items: flex-start; }
.meta { flex: 1; min-width: 0; }
.title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.now { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 1.4em; }
.now.err { color: var(--err); white-space: normal; }
.now.attn { color: var(--accent); font-weight: 600; }
button, select {
  font: inherit; color: inherit; background: transparent; border: 0; border-radius: 8px; cursor: pointer;
}
button { display: inline-grid; place-items: center; width: 32px; height: 32px; padding: 0; }
button svg { width: 18px; height: 18px; fill: currentColor; }
button:hover, select:hover { background: var(--chip); }
button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
button[aria-pressed="true"] { background: var(--chip); color: var(--accent); }
button.main { width: 40px; height: 40px; border-radius: 50%; background: var(--accent); color: var(--accent-fg); }
button.main:hover { filter: brightness(1.08); background: var(--accent); }
button.main svg { width: 20px; height: 20px; }
button.main.busy { animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .65; } }
.controls { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.transport { display: flex; align-items: center; gap: 2px; }
.info { color: var(--muted); font-variant-numeric: tabular-nums; margin: 0 6px; white-space: nowrap; }
.spacer { flex: 1; }
select { padding: 6px 6px; background: var(--chip); max-width: 170px; }
input[type=range] { width: 100%; margin: 0; accent-color: var(--accent); height: 18px; }
.preview { color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: none; }
.preview.on { display: block; }
.pill {
  display: none; align-items: center; gap: 8px; margin-left: auto; width: max-content; max-width: 100%;
  background: var(--bg); border: 1px solid var(--line); border-radius: 999px; padding: 4px 6px 4px 4px;
  box-shadow: 0 6px 20px rgba(0,0,0,.16);
}
.pill .title { max-width: 260px; font-weight: 500; }
.wrap.min .bar { display: none; }
.wrap.min .pill { display: flex; }
.wrap.min { width: auto; left: auto; right: 16px; transform: none; }
`;

export class PlayerBar {
  readonly host = document.createElement('readaloud-player');
  private root = this.host.attachShadow({ mode: 'closed' });
  private els: Record<string, HTMLElement> = {};
  private dragging = false;
  private view: PlayerView | null = null;

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
          </div>
          <button data-act="minimize" aria-label="Minimize player" title="Minimize">${icon('minimize')}</button>
          <button data-act="close" aria-label="Stop and close" title="Stop and close">${icon('close')}</button>
        </div>
        <input type="range" data-el="progress" min="0" max="0" step="1" value="0" aria-label="Position (sentence)" />
        <div class="preview" data-el="preview"></div>
        <div class="controls">
          <div class="transport">
            <button data-act="prevBlock" aria-label="Previous paragraph" title="Previous paragraph">${icon('prevBlock')}</button>
            <button data-act="prev" aria-label="Previous sentence" title="Previous sentence (Alt+Shift+,)">${icon('prev')}</button>
            <button class="main" data-act="toggle" data-el="toggle" aria-label="Play" title="Play / pause (Alt+Shift+R)">${icon('play')}</button>
            <button data-act="next" aria-label="Next sentence" title="Next sentence (Alt+Shift+.)">${icon('next')}</button>
            <button data-act="nextBlock" aria-label="Next paragraph" title="Next paragraph">${icon('nextBlock')}</button>
          </div>
          <span class="info" data-el="info"></span>
          <span class="spacer"></span>
          <select data-el="pace" aria-label="Speed" title="Speed (applies from the next sentence)"></select>
          <select data-el="voice" aria-label="Voice" title="Voice"></select>
          <button data-act="jump" data-el="jump" aria-pressed="false" aria-label="Click text to jump" title="Click any sentence on the page to read from there (or Alt+click anytime)">${icon('jump')}</button>
          <button data-act="settings" aria-label="Settings" title="Settings">${icon('settings')}</button>
        </div>
      </div>
      <div class="pill" role="region" aria-label="Read aloud player (minimized)">
        <button class="main" data-act="toggle" data-el="toggle2" aria-label="Play">${icon('play')}</button>
        <span class="title" data-el="title2"></span>
        <button data-act="expand" aria-label="Expand player" title="Expand">${icon('expand')}</button>
      </div>`;
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
        case 'jump': return this.h.toggleJump();
        case 'settings': return this.h.openSettings();
        case 'close': return this.h.close();
        case 'minimize': return wrap.classList.add('min');
        case 'expand': return wrap.classList.remove('min');
      }
    });

    const progress = this.els.progress as HTMLInputElement;
    progress.addEventListener('input', () => {
      this.dragging = true;
      const i = Number(progress.value);
      this.els.preview!.textContent = `Jump to ${i + 1}: ${this.view?.chunkText(i) ?? ''}`;
      this.els.preview!.classList.add('on');
    });
    progress.addEventListener('change', () => {
      this.dragging = false;
      this.els.preview!.classList.remove('on');
      this.h.seek(Number(progress.value));
    });

    this.els.pace!.addEventListener('change', (e) => this.h.setPace(Number((e.target as HTMLSelectElement).value)));
    this.els.voice!.addEventListener('change', (e) => {
      const sel = e.target as HTMLSelectElement;
      if (sel.value === MORE_VOICES) {
        sel.value = this.view?.voice ?? '';
        this.h.openSettings();
      } else this.h.setVoice(sel.value);
    });
    // Keep page shortcuts from firing while using the bar.
    wrap.addEventListener('keydown', (e) => e.stopPropagation());

    document.documentElement.append(this.host);
  }

  get height(): number {
    return this.host.style.display === 'none' ? 0 : (this.els.wrap!.firstElementChild as HTMLElement).offsetHeight + 16;
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
    this.view = v;
    const { state } = v;
    const playing = state.status === 'playing' || state.status === 'blocked';
    this.els.title!.textContent = v.title;
    this.els.title2!.textContent = v.title;

    for (const key of ['toggle', 'toggle2'] as const) {
      const btn = this.els[key]!;
      btn.innerHTML = icon(playing && state.status !== 'blocked' ? 'pause' : 'play');
      btn.setAttribute('aria-label', playing && state.status !== 'blocked' ? 'Pause' : 'Play');
      btn.classList.toggle('busy', state.buffering && state.status === 'playing');
    }

    const now = this.els.now!;
    now.className = 'now';
    if (state.status === 'error') {
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
      const prefix = state.buffering && state.status === 'playing' ? 'Loading audio… ' : '';
      now.textContent = prefix + v.chunkText(state.index);
    }

    const progress = this.els.progress as HTMLInputElement;
    progress.max = String(Math.max(0, state.total - 1));
    if (!this.dragging) progress.value = String(state.index);
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
    this.els.jump!.setAttribute('aria-pressed', String(v.jumpMode));
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
