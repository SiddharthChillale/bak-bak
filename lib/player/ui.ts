// Floating player, docked bottom-right (articles are usually centred, so it stays
// clear of the text), isolated in a closed shadow root.

import type { SummaryLength } from '../summary';
import { prettyVoice } from '../voices';
import { loadPlayerFonts } from './fonts';
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
  /** Host 1 speaks on the left, host 2 on the right; summary paragraphs span the width. */
  side: 'left' | 'right' | 'full';
  text: string;
}

export type PlayerMode = 'article' | 'podcast' | 'summary';

/** Primary action button of a mode panel; null hides it. */
export interface PanelButton {
  label: string;
  tip: string;
  disabled: boolean;
  busy: boolean;
}

/** Podcast setup panel: pick hosts, write the script, then generate audio, all on demand. */
export interface PodcastPanel {
  voices: readonly string[];
  hostA: string;
  hostB: string;
  length: 'short' | 'standard';
  /** Primary button; null hides it (audio already generated). */
  button: PanelButton | null;
  /** Host/length pickers are locked while the script is being written. */
  locked: boolean;
}

/** Summary panel: pick a length, then summarise (the summary is read aloud once written). */
export interface SummaryPanel {
  length: SummaryLength;
  /** Primary button; null hides it (summary already written). */
  button: PanelButton | null;
  /** The length picker is locked while the summary is being written. */
  locked: boolean;
}

export interface PlayerView {
  title: string;
  mode: PlayerMode;
  podcast?: PodcastPanel | null;
  summary?: SummaryPanel | null;
  /** Podcast transcript as a chat, or summary paragraphs; each is clickable to play from there. */
  transcript?: TranscriptItem[] | null;
  /** Host names shown once above the chat (left host, right host). */
  hostNames?: { left: string; right: string } | null;
  /** Overrides the "now reading" line, with optional action buttons. */
  notice?: Notice | null;
  state: PlayerState;
  /** Display text of chunk i (for the "now reading" line). */
  chunkText(i: number): string;
  /** Shown on the "now reading" line while idle. */
  overview: string;
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
  setSummaryLength(length: SummaryLength): void;
  summaryAction(): void;
  openSettings(): void;
  close(): void;
}

const ICONS = {
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/>',
  prev: '<path d="M17 6.5v11a.8.8 0 0 1-1.25.66L8.5 13.1V17a1 1 0 0 1-2 0V7a1 1 0 0 1 2 0v3.9l7.25-5.06A.8.8 0 0 1 17 6.5Z"/>',
  next: '<path d="M7 6.5v11a.8.8 0 0 0 1.25.66l7.25-5.06V17a1 1 0 0 0 2 0V7a1 1 0 0 0-2 0v3.9L8.25 5.84A.8.8 0 0 0 7 6.5Z"/>',
  prevBlock: '<path d="M12 6.5v11a.8.8 0 0 1-1.25.66L3.6 12.66a.8.8 0 0 1 0-1.32l7.15-5.5A.8.8 0 0 1 12 6.5Zm9 0v11a.8.8 0 0 1-1.25.66l-7.15-5.5a.8.8 0 0 1 0-1.32l7.15-5.5A.8.8 0 0 1 21 6.5Z"/>',
  nextBlock: '<path d="M12 6.5v11a.8.8 0 0 0 1.25.66l7.15-5.5a.8.8 0 0 0 0-1.32l-7.15-5.5A.8.8 0 0 0 12 6.5Zm-9 0v11a.8.8 0 0 0 1.25.66l7.15-5.5a.8.8 0 0 0 0-1.32L4.25 5.84A.8.8 0 0 0 3 6.5Z"/>',
  read: '<path d="M4 5.5h16a1 1 0 1 1 0 2H4a1 1 0 0 1 0-2Zm0 5.5h16a1 1 0 1 1 0 2H4a1 1 0 1 1 0-2Zm0 5.5h10a1 1 0 1 1 0 2H4a1 1 0 1 1 0-2Z"/>',
  podcast: '<path d="M12 2.5a3.5 3.5 0 0 1 3.5 3.5v6a3.5 3.5 0 1 1-7 0V6A3.5 3.5 0 0 1 12 2.5Zm-6 9a1 1 0 0 1 1 1 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21h2.5a1 1 0 1 1 0 2h-7a1 1 0 1 1 0-2H11v-1.57A7 7 0 0 1 5 12.5a1 1 0 0 1 1-1Z"/>',
  summary: '<path d="M10 2.5a1 1 0 0 1 .95.68l1.35 4.02 4.02 1.35a1 1 0 0 1 0 1.9l-4.02 1.35-1.35 4.02a1 1 0 0 1-1.9 0L7.7 11.8 3.68 10.45a1 1 0 0 1 0-1.9L7.7 7.2l1.35-4.02A1 1 0 0 1 10 2.5Zm8 11a.8.8 0 0 1 .76.55l.62 1.87 1.87.62a.8.8 0 0 1 0 1.52l-1.87.62-.62 1.87a.8.8 0 0 1-1.52 0l-.62-1.87-1.87-.62a.8.8 0 0 1 0-1.52l1.87-.62.62-1.87A.8.8 0 0 1 18 13.5Z"/>',
  cursor: '<path d="M5.5 3.4v15.3a.7.7 0 0 0 1.2.48l3.5-3.6 2.25 5.2a.9.9 0 0 0 1.18.47l1.5-.66a.9.9 0 0 0 .47-1.18l-2.24-5.14 4.94-.32a.7.7 0 0 0 .44-1.2L6.7 2.92a.7.7 0 0 0-1.2.48Z"/>',
  settings: '<path d="M10.3 2.6a1 1 0 0 1 1-.6h1.4a1 1 0 0 1 1 .6l.6 1.7a7.6 7.6 0 0 1 1.6.9l1.8-.4a1 1 0 0 1 1.1.5l.7 1.2a1 1 0 0 1-.1 1.2l-1.2 1.3a7.7 7.7 0 0 1 0 1.9l1.2 1.3a1 1 0 0 1 .1 1.2l-.7 1.2a1 1 0 0 1-1.1.5l-1.8-.4a7.6 7.6 0 0 1-1.6.9l-.6 1.7a1 1 0 0 1-1 .6h-1.4a1 1 0 0 1-1-.6l-.6-1.7a7.6 7.6 0 0 1-1.6-.9l-1.8.4a1 1 0 0 1-1.1-.5l-.7-1.2a1 1 0 0 1 .1-1.2l1.2-1.3a7.7 7.7 0 0 1 0-1.9L4.1 8.1A1 1 0 0 1 4 6.9l.7-1.2a1 1 0 0 1 1.1-.5l1.8.4a7.6 7.6 0 0 1 1.6-.9l.6-1.7ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" transform="translate(0 1)"/>',
  minimize: '<rect x="5" y="11" width="14" height="2" rx="1"/>',
  expand: '<path d="M6.3 14.7a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1-1.4 1.4L12 10.4l-4.3 4.3a1 1 0 0 1-1.4 0Z"/>',
  close: '<path d="M6.3 6.3a1 1 0 0 1 1.4 0L12 10.6l4.3-4.3a1 1 0 1 1 1.4 1.4L13.4 12l4.3 4.3a1 1 0 0 1-1.4 1.4L12 13.4l-4.3 4.3a1 1 0 0 1-1.4-1.4l4.3-4.3-4.3-4.3a1 1 0 0 1 0-1.4Z"/>',
};

type Size = 'A' | 'B' | 'C';
type Corner = { x: 'left' | 'right'; y: 'top' | 'bottom' };
type Menu = null | 'pace' | 'voice' | 'hostA' | 'hostB';

const MODES: PlayerMode[] = ['article', 'podcast', 'summary'];
const TAB_LABEL: Record<PlayerMode, string> = { article: 'Reader', podcast: 'Podcast', summary: 'Summary' };
const TAB_ICON: Record<PlayerMode, keyof typeof ICONS> = { article: 'read', podcast: 'podcast', summary: 'summary' };
const PACE_WORDS = ['Slow', 'Relaxed', 'Natural', 'Steady', 'Brisk', 'Fast', 'Max'];

const icon = (name: keyof typeof ICONS) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
const grip = '<span class="grip" data-drag aria-hidden="true">' + '<i></i>'.repeat(6) + '</span>';
const playPause = `<span class="pp"><svg class="ic-pause" viewBox="0 0 24 24" aria-hidden="true">${ICONS.pause}</svg><svg class="ic-play" viewBox="0 0 24 24" aria-hidden="true">${ICONS.play}</svg></span>`;
const short = (id: string) => prettyVoice(id).split(' · ')[0] ?? id;

const CSS_TEXT = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.wrap {
  --solid: #fffdf9; --glass: rgba(255,253,249,.8); --fg: #1d1b19; --muted: #6f6a64; --faint: #a59f97;
  --line: rgba(29,27,25,.12); --chip: rgba(29,27,25,.06); --chip-hover: rgba(29,27,25,.06);
  --accent: #2790C4; --ink: #1d6f98; --soft: rgba(39,144,196,.14); --accent-fg: #fff; --err: #b3261e;
  --left: rgba(29,27,25,.06); --right: rgba(39,144,196,.13); --hl: rgba(39,144,196,.18);
  --ring: rgba(255,255,255,.55);
  position: fixed; z-index: 2147483647;
  --sans: "ReadAloud Sans", "Instrument Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --serif: "ReadAloud Serif", Newsreader, Georgia, serif;
  font: 13px/1.4 var(--sans);
  color: var(--fg); -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .wrap { --solid: #2a2723; --glass: rgba(31,29,27,.82); --fg: #f2eee8; --muted: #a59f97; --faint: #77716a;
    --line: rgba(255,255,255,.14); --chip: rgba(255,255,255,.09); --chip-hover: rgba(255,255,255,.09);
    --ink: #6cc0ea; --soft: rgba(39,144,196,.3); --err: #ff8a80;
    --left: rgba(255,255,255,.09); --right: rgba(39,144,196,.26); --hl: rgba(39,144,196,.35); --ring: rgba(255,255,255,.1); }
}
/* Anchored to one of the four viewport corners; the player grows and shrinks away from it. */
.wrap[data-x="right"] { right: 16px; } .wrap[data-x="left"] { left: 16px; }
.wrap[data-y="bottom"] { bottom: 16px; } .wrap[data-y="top"] { top: 16px; }
.wrap.dragging { cursor: grabbing; }
.wrap.snapping { transition: transform var(--snap-ms, 800ms) cubic-bezier(.33,1,.68,1); }
@media (prefers-reduced-motion: reduce) { .wrap.snapping { transition-duration: .12s; } }
button, select { font: inherit; color: inherit; border: 0; background: transparent; padding: 0; cursor: pointer; }
button { display: inline-grid; place-items: center; border-radius: 50%; transition: transform .15s ease, background .15s ease, opacity .2s ease; }
button:hover { background: var(--chip-hover); }
button:active { transform: scale(.9); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
button:disabled { opacity: .4; cursor: default; }
svg { fill: currentColor; }

.shell {
  position: relative; overflow: hidden; transform-origin: var(--ox, 100%) var(--oy, 100%);
  background: var(--glass); -webkit-backdrop-filter: blur(12px) saturate(1.4); backdrop-filter: blur(12px) saturate(1.4);
  border: 1px solid var(--ring);
  box-shadow: 0 0 0 1px rgba(29,27,25,.08), 0 14px 36px rgba(29,27,25,.2), 0 2px 6px rgba(29,27,25,.08);
  transition: width .5s cubic-bezier(.32,.72,0,1), height .5s cubic-bezier(.32,.72,0,1), border-radius .5s cubic-bezier(.32,.72,0,1), box-shadow .25s ease;
}
.wrap.dragging .shell { box-shadow: 0 0 0 1px rgba(29,27,25,.08), 0 24px 52px rgba(29,27,25,.26), 0 4px 12px rgba(29,27,25,.1); }
.wrap[data-x="left"] { --ox: 0%; } .wrap[data-y="top"] { --oy: 0%; }
.wrap[data-size="A"] .shell { width: 128px; height: 40px; border-radius: 20px; }
.wrap[data-size="B"] .shell { width: 300px; height: 56px; border-radius: 28px; }
.wrap[data-size="C"] .shell { width: min(340px, calc(100vw - 32px)); height: min(400px, calc(100vh - 32px)); border-radius: 22px; }
.wrap.picking .shell { width: 300px; height: 40px; border-radius: 20px; }

.layer { position: absolute; right: 0; bottom: 0; display: flex; opacity: 0; transform: scale(.96); pointer-events: none;
  transition: opacity .22s ease, transform .35s cubic-bezier(.32,.72,0,1); }
.wrap[data-x="left"] .layer { right: auto; left: 0; }
.wrap[data-y="top"] .layer { bottom: auto; top: 0; }
.wrap[data-size="A"] .la, .wrap[data-size="B"] .lb, .wrap[data-size="C"] .lc { opacity: 1; transform: none; pointer-events: auto; transition-delay: .14s; }
.wrap.picking .layer { opacity: 0; pointer-events: none; transition-delay: 0s; }
.wrap.picking .lp { opacity: 1; transform: none; pointer-events: auto; transition-delay: .14s; }

.grip { display: grid; grid-template-columns: 3px 3px; gap: 2px; cursor: grab; color: var(--faint); padding: 4px 2px; touch-action: none; }
.grip i { width: 3px; height: 3px; border-radius: 50%; background: currentColor; }
.grip:active { cursor: grabbing; }

.pp { position: relative; width: 100%; height: 100%; display: block; }
.pp svg { position: absolute; inset: 0; margin: auto; width: 46%; height: 46%; transition: opacity .2s ease, transform .35s cubic-bezier(.34,1.56,.64,1); }
.ic-play { opacity: 1; transform: none; }
.ic-pause { opacity: 0; transform: scale(.4) rotate(-90deg); }
.wrap.playing .ic-play { opacity: 0; transform: scale(.4) rotate(90deg); }
.wrap.playing .ic-pause { opacity: 1; transform: none; }
.go { background: var(--accent); color: var(--accent-fg); }
.go:hover { background: var(--accent); filter: brightness(1.07); }
.go.busy { animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .65; } }
.ib { width: 32px; height: 32px; flex: none; color: inherit; }
.ib svg { width: 18px; height: 18px; }
.ib.sm { width: 28px; height: 28px; color: var(--muted); }
.ib.sm svg { width: 16px; height: 16px; }
.ib.fill { background: var(--chip); }

/* A: tiny pill */
.la { width: 128px; height: 40px; align-items: center; gap: 6px; padding: 0 6px 0 10px; }
.la .go { width: 30px; height: 30px; flex: none; }
.eq { flex: 1; display: flex; justify-content: center; align-items: center; gap: 2px; height: 14px; }
.eq span { width: 3px; height: 14px; border-radius: 2px; background: var(--accent); opacity: .45; transform: scaleY(.3); transition: transform .3s ease, opacity .3s ease; }
.wrap.playing .eq span { opacity: 1; transform: none; animation: eq .9s ease-in-out infinite; }
.wrap.playing .eq span:nth-child(2) { animation-duration: .6s; animation-delay: -.2s; }
.wrap.playing .eq span:nth-child(3) { animation-duration: 1.1s; animation-delay: -.4s; }
.wrap.playing .eq span:nth-child(4) { animation-duration: .75s; animation-delay: -.6s; }
@keyframes eq { 0%,100% { transform: scaleY(.35); } 50% { transform: scaleY(1); } }

/* B: mini bar */
.lb { width: 300px; height: 56px; align-items: center; gap: 2px; padding: 0 10px 0 14px; }
.lb .grip { margin-right: 6px; }
.lb .go { width: 40px; height: 40px; flex: none; }
.vsep { width: 1px; height: 22px; background: var(--line); margin: 0 6px; flex: none; }
.tabchip { height: 30px; flex: none; border-radius: 999px; background: var(--chip); display: inline-flex; align-items: center; gap: 4px; padding: 0 8px; font-weight: 500; font-size: 12px; }
.tabchip:hover { background: var(--soft); }
.tabchip svg { width: 14px; height: 14px; fill: var(--accent); }
.tabchip svg.caret { width: 12px; height: 12px; fill: var(--muted); transform: rotate(180deg); }
.lb .fill { width: 38px; height: 38px; }
.flex1 { flex: 1; }
.xbtn { position: absolute; right: -10px; bottom: 43px; z-index: 2; width: 20px; height: 20px; border: 1.5px solid #fff; background: #e0392d; color: #fff;
  box-shadow: 0 2px 8px rgba(224,57,45,.4); opacity: 0; transform: scale(0); pointer-events: none;
  transition: opacity .18s ease, transform .45s cubic-bezier(.34,1.8,.64,1), background .15s ease; }
.xbtn:hover { background: #c42a1f; }
.xbtn svg { width: 12px; height: 12px; }
.wrap[data-size="B"].hover:not(.picking) .xbtn { opacity: 1; transform: scale(1); pointer-events: auto; transition-delay: .35s, .35s, 0s; }

/* picking */
.lp { width: 300px; height: 40px; align-items: center; gap: 8px; padding: 0 6px 0 14px; font-weight: 600; color: var(--ink); }
.lp span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* C: expanded */
.lc { width: min(340px, calc(100vw - 32px)); height: min(400px, calc(100vh - 32px)); flex-direction: column; gap: 12px; padding: 12px; }
.head { display: flex; align-items: center; gap: 8px; flex: none; }
.head .grip { padding: 0 2px; }
.head .ttl { flex: 1; min-width: 0; }
.head .t1 { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.head .t2 { font-size: 11.5px; color: var(--muted); }
.trow { display: flex; align-items: center; gap: 4px; flex: none; height: 46px; overflow: hidden; margin-bottom: 0;
  transition: height .4s cubic-bezier(.32,.72,0,1), opacity .2s ease, margin .4s cubic-bezier(.32,.72,0,1); }
.wrap[data-mode="podcast"] .trow { height: 0; opacity: 0; margin-bottom: -12px; pointer-events: none; }
.trow .ib { width: 34px; height: 34px; }
.trow .go { width: 46px; height: 46px; flex: none; box-shadow: 0 4px 12px rgba(39,144,196,.35); }
.pill { height: 28px; border-radius: 999px; background: var(--chip); display: inline-flex; align-items: center; gap: 2px; padding: 0 6px 0 10px; font-weight: 500; font-size: 12px; max-width: 116px; }
.pill:hover, .pill.on { background: var(--soft); }
.pill span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pill svg { width: 12px; height: 12px; flex: none; fill: var(--muted); transform: rotate(180deg); transition: transform .25s ease; }
.pill.on svg { transform: none; }
.stage { flex: 1; min-height: 0; position: relative; }
.pane { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 12px;
  transition: opacity .22s ease, transform .4s cubic-bezier(.32,.72,0,1); }
.pane.main { }
.pane.menu { opacity: 0; transform: translateX(18px); pointer-events: none; }
.wrap[data-menu="pace"] .pane.main, .wrap[data-menu="voice"] .pane.main, .wrap[data-menu="hostA"] .pane.main, .wrap[data-menu="hostB"] .pane.main
  { opacity: 0; transform: translateX(-18px); pointer-events: none; }
.wrap[data-menu="pace"] .pane.pacepane, .wrap[data-menu="voice"] .pane.voicepane, .wrap[data-menu="hostA"] .pane.voicepane, .wrap[data-menu="hostB"] .pane.voicepane
  { opacity: 1; transform: none; pointer-events: auto; transition-delay: .08s; }

.seg { position: relative; display: grid; padding: 3px; border-radius: 999px; background: var(--chip); flex: none; }
.seg .thumb { position: absolute; top: 3px; bottom: 3px; left: 3px; border-radius: 999px; background: var(--solid); box-shadow: 0 1px 3px rgba(0,0,0,.14);
  transition: left .45s cubic-bezier(.34,1.4,.64,1); }
.seg button { position: relative; height: 28px; border-radius: 999px; display: flex; align-items: center; justify-content: center; gap: 5px; font-weight: 500; font-size: 12px; color: var(--muted); transition: color .25s ease; }
.seg button:hover, .seg button:active { background: transparent; }
.seg button[aria-pressed="true"] { color: var(--ink); }
.seg button svg { width: 14px; height: 14px; }
.seg.plain button { color: var(--fg); }
.seg:has(button:disabled) { opacity: .6; }

.slider { overflow: hidden; flex: 1; min-height: 0; margin: 0 -12px; }
.track { width: 300%; height: 100%; display: flex; transition: transform .5s cubic-bezier(.32,.72,0,1); }
.slide { width: 33.333%; height: 100%; padding: 0 12px; display: flex; flex-direction: column; gap: 10px; min-height: 0; }

.notice { flex: none; font-size: 12px; padding: 8px 10px; border-radius: 12px; background: var(--chip); color: var(--muted); }
.notice.err { color: var(--err); background: rgba(179,38,30,.1); }
.notice.attn { color: var(--ink); background: var(--soft); font-weight: 600; }
.notice .acts { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.notice .acts:empty { display: none; }
.notice .acts button { height: 24px; padding: 0 10px; border-radius: 999px; background: var(--solid); color: var(--ink); font-weight: 600; font-size: 11.5px; }

.sents { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 10px; font: 16px/1.5 var(--serif); padding: 2px 4px; }
.sents .dim { color: var(--faint); }
.sents mark { background: var(--hl); color: inherit; padding: 1px 2px; border-radius: 3px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.sents .idle { color: var(--muted); font: 13px/1.45 var(--sans); }
.rfoot { display: flex; align-items: center; gap: 8px; flex: none; }
.chip { height: 28px; border-radius: 999px; background: var(--chip); display: inline-flex; align-items: center; gap: 5px; padding: 0 10px 0 8px; font-weight: 500; font-size: 12px; }
.chip:hover, .chip[aria-pressed="true"] { background: var(--soft); }
.chip[aria-pressed="true"] { color: var(--ink); }
.chip svg { width: 13px; height: 13px; }
.info { margin-left: auto; font-size: 11.5px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }

.primary { height: 36px; flex: none; width: 100%; border-radius: 999px; background: var(--accent); color: var(--accent-fg); font-weight: 600; font-size: 13px; }
.primary:hover { background: var(--accent); filter: brightness(1.06); }
.primary:active { transform: scale(.97); }
.primary[aria-disabled="true"] { opacity: .55; cursor: default; filter: none; }
.primary.busy { animation: pulse 1.2s ease-in-out infinite; }

.host { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 12px; background: var(--chip); flex: none; }
.host .av { width: 32px; height: 32px; border-radius: 50%; background: rgba(127,127,127,.2); display: grid; place-items: center; font-weight: 600; font-size: 13px; flex: none; }
.host.b .av { background: var(--soft); color: var(--ink); }
.host .who { flex: 1; min-width: 0; text-align: left; cursor: pointer; border-radius: 8px; display: block; place-items: start; }
.host .who:hover { background: transparent; }
.host .who small { display: block; font-size: 11px; color: var(--muted); }
.host .who b { display: flex; align-items: center; gap: 3px; font-size: 13px; font-weight: 500; }
.host .who svg { width: 11px; height: 11px; fill: var(--muted); transform: rotate(180deg); }
.host .pv { width: 28px; height: 28px; color: var(--accent); flex: none; }
.host .pv:hover { background: var(--soft); }
.host .pv svg { width: 14px; height: 14px; }
.setupfill { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }

.legend { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--muted); flex: none; }
.legend span.n { display: flex; align-items: center; gap: 5px; font-weight: 600; color: var(--fg); }
.legend i { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); }
.legend .n + span + .n i { background: var(--accent); }
.scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 6px; padding: 10px 2px;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%); }
.scroll::-webkit-scrollbar { width: 8px; background: transparent; }
.scroll::-webkit-scrollbar-thumb { background: rgba(127,127,127,.35); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
.scroll::-webkit-scrollbar-button, .scroll::-webkit-scrollbar-corner { display: none; }
.scroll { scrollbar-width: thin; }
.msg { all: unset; box-sizing: border-box; flex: none; max-width: 84%; padding: 7px 11px; font: 13px/1.45 var(--sans); cursor: pointer;
  opacity: .5; transition: opacity .3s ease, transform .35s cubic-bezier(.34,1.4,.64,1), box-shadow .3s ease; }
.msg.left { align-self: flex-start; background: var(--left); border-radius: 14px 14px 14px 4px; transform-origin: 0 50%; }
.msg.right { align-self: flex-end; background: var(--right); border-radius: 14px 14px 4px 14px; transform-origin: 100% 50%; }
.msg.left.on { box-shadow: 0 0 0 1.5px rgba(127,127,127,.5); }
.msg.right.on { box-shadow: 0 0 0 1.5px var(--accent); }
.msg:hover, .msg.on { opacity: 1; }
.msg.on { transform: scale(1.02); }
.msg:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.live { display: flex; align-items: center; gap: 4px; flex: none; }
.live .ib { width: 32px; height: 32px; }
.live .ib svg { width: 17px; height: 17px; }
.live .go { width: 42px; height: 42px; box-shadow: 0 4px 12px rgba(39,144,196,.35); }
.live .lbl { flex: 1; font-size: 11.5px; color: var(--muted); text-align: right; padding-right: 6px; }
.needs { display: flex; align-items: center; gap: 10px; flex: none; }
.needs .cost { font-size: 11.5px; color: var(--muted); line-height: 1.3; }
.needs .primary { flex: 1; width: auto; }

.sumhead { display: flex; align-items: center; gap: 8px; flex: none; }
.sumhead .meta { font-size: 11.5px; color: var(--muted); }
.readbtn { height: 28px; border-radius: 999px; background: var(--soft); color: var(--ink); font-weight: 600; font-size: 12px; display: inline-flex; align-items: center; gap: 5px; padding: 0 12px 0 10px; }
.readbtn:hover { background: var(--soft); filter: brightness(1.1); }
.readbtn svg { width: 12px; height: 12px; }
.bullets { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 9px; font: 14.5px/1.45 var(--serif); padding: 2px 4px 8px; }
.bullets::-webkit-scrollbar { width: 8px; background: transparent; }
.bullets::-webkit-scrollbar-thumb { background: rgba(127,127,127,.35); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
.bullets { scrollbar-width: thin; }
.bl { all: unset; box-sizing: border-box; display: flex; gap: 10px; cursor: pointer; border-radius: 6px; opacity: .6; transition: opacity .3s ease; }
.bl:hover, .bl.on { opacity: 1; }
.bl.on span:last-child { background: var(--hl); border-radius: 3px; }
.bl:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.bl i { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); margin-top: 9px; flex: none; }

.mhead { display: flex; align-items: center; gap: 6px; flex: none; }
.mhead .back { width: 28px; height: 28px; background: var(--chip); }
.mhead .back:hover { background: var(--soft); }
.mhead .back svg { width: 16px; height: 16px; transform: rotate(-90deg); }
.mhead b { font-size: 13px; font-weight: 600; }
.done { height: 28px; padding: 0 10px; border-radius: 999px; color: var(--ink); font-weight: 600; font-size: 12px; }
.done:hover { background: var(--soft); }
.bigpace { display: flex; align-items: baseline; gap: 10px; padding: 6px 4px 0; }
.bigpace b { font: 400 46px/1 var(--serif); font-variant-numeric: tabular-nums; }
.bigpace span { font-size: 14px; font-weight: 600; color: var(--ink); }
.slwrap { padding: 0 11px; }
.sl { position: relative; height: 40px; cursor: pointer; touch-action: none; }
.sl .rail { position: absolute; left: 0; right: 0; top: 17px; height: 6px; border-radius: 3px; background: var(--chip); }
.sl .fill { position: absolute; left: 0; top: 17px; height: 6px; border-radius: 3px; background: var(--accent); transition: width .4s cubic-bezier(.34,1.3,.64,1); }
.sl .knob { position: absolute; top: 9px; width: 22px; height: 22px; margin-left: -11px; border-radius: 50%; background: #fff; border: 2px solid var(--accent);
  box-shadow: 0 2px 8px rgba(39,144,196,.35); transition: left .4s cubic-bezier(.34,1.3,.64,1); }
.sl.drag .fill, .sl.drag .knob { transition-duration: .12s; }
.sl .stop { position: absolute; top: 18px; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: rgba(127,127,127,.5); transition: background .2s ease; }
.sl .stop.on { background: rgba(255,255,255,.9); }
.labels { position: relative; height: 18px; }
.labels span { position: absolute; transform: translateX(-50%); font-weight: 500; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; transition: color .2s ease; }
.labels span.on { color: var(--ink); }
.sf { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--muted); padding: 0 4px; }
.foot { margin-top: auto; font-size: 11.5px; color: var(--muted); padding: 0 4px; }
.vlist { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 2px; margin: 0 -4px; scrollbar-width: thin; }
.vrow { display: flex; align-items: center; gap: 4px; flex: none; border-radius: 10px; transition: background .2s ease; }
.vrow:hover, .vrow.on { background: var(--soft); }
.vrow .pick { flex: 1; min-width: 0; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: flex-start; gap: 10px; padding: 0 8px; font-weight: 500; font-size: 13px; text-align: left; white-space: nowrap; overflow: hidden; }
.vrow .pick:hover { background: transparent; }
.vrow .radio { width: 16px; height: 16px; flex: none; border-radius: 50%; border: 1.5px solid rgba(127,127,127,.6); display: grid; place-items: center; transition: border-color .2s ease; }
.vrow.on .radio { border-color: var(--accent); }
.vrow .radio i { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); transform: scale(0); transition: transform .3s cubic-bezier(.34,1.56,.64,1); }
.vrow.on .radio i { transform: scale(1); }
.vrow .pick em { font-style: normal; font-weight: 400; color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
.vrow .pv { width: 28px; height: 28px; margin-right: 4px; color: var(--accent); }
.vrow .pv svg { width: 11px; height: 11px; }
.more { font-size: 12px; color: var(--ink); cursor: pointer; padding: 0 4px; text-align: left; border-radius: 6px; display: block; }
.more:hover { background: transparent; text-decoration: underline; }

.tip { position: absolute; z-index: 3; pointer-events: none; max-width: 240px; width: max-content; padding: 5px 9px; border-radius: 7px; font-size: 12px; line-height: 1.35;
  background: var(--fg); color: var(--solid); box-shadow: 0 4px 14px rgba(0,0,0,.2); transform: translate(-50%, calc(-100% - 8px)); opacity: 0; transition: opacity .12s ease; }
.tip.on { opacity: 1; }
.tip.below { transform: translate(-50%, 8px); }
`;

const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

export class PlayerBar {
  readonly host = document.createElement('readaloud-player');
  private root = this.host.attachShadow({ mode: 'closed' });
  private els: Record<string, HTMLElement> = {};
  private wrap!: HTMLElement;
  private view: PlayerView | null = null;
  private size: Size = 'C';
  private lastSize: Size = 'C';
  private menu: Menu = null;
  private renderedTranscript: TranscriptItem[] | null = null;
  private renderedSummary: TranscriptItem[] | null = null;
  private activeTurn = -1;
  private pointerInTranscript = false;
  private lastNotice = '';
  private paceDrag = false;
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;
  private snapTimer: ReturnType<typeof setTimeout> | undefined;
  /** Re-anchors a visible tooltip after the layout changes. */
  private repositionTip: () => void = () => {};

  constructor(private h: PlayerHandlers) {
    this.host.style.display = 'none';
    attachStyles(this.root, CSS_TEXT);
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.dataset.size = 'C';
    wrap.dataset.mode = 'article';
    wrap.dataset.x = 'right';
    wrap.dataset.y = 'bottom';
    wrap.innerHTML = `
      <div class="shell" role="region" aria-label="Read aloud player">
        <div class="layer la">
          ${grip}
          <button class="go" data-act="toggle" aria-label="Play" data-tip="Play (Alt+Shift+R)">${playPause}</button>
          <div class="eq" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
          <button class="ib sm" data-act="toMini" aria-label="Expand player" data-tip="Expand">${icon('expand')}</button>
        </div>
        <div class="layer lb">
          ${grip}
          <button class="ib" data-act="prev" aria-label="Previous sentence" data-tip="Previous sentence (Alt+Shift+,)">${icon('prev')}</button>
          <button class="go" data-act="toggle" aria-label="Play" data-tip="Play (Alt+Shift+R)">${playPause}</button>
          <button class="ib" data-act="next" aria-label="Next sentence" data-tip="Next sentence (Alt+Shift+.)">${icon('next')}</button>
          <span class="vsep"></span>
          <button class="tabchip" data-act="toFull" data-tip="Open the full player"><span data-el="chipIcon"></span><span data-el="chipLabel"></span><svg class="caret" viewBox="0 0 24 24" aria-hidden="true">${ICONS.expand}</svg></button>
          <span class="flex1"></span>
          <button class="ib fill" data-act="toPill" aria-label="Minimize" data-tip="Minimize">${icon('minimize')}</button>
        </div>
        <div class="layer lp">
          <span>Click a sentence on the page · Esc to cancel</span>
          <button class="ib sm" data-act="pick" aria-label="Cancel jump" data-tip="Cancel jump (Esc)">${icon('close')}</button>
        </div>
        <div class="layer lc">
          <div class="head">
            ${grip}
            <div class="ttl"><div class="t1" data-el="title"></div><div class="t2" data-el="site"></div></div>
            <button class="ib sm" data-act="settings" aria-label="Settings" data-tip="Settings: API key, voices, usage, cache">${icon('settings')}</button>
            <button class="ib sm" data-act="toMini" aria-label="Minimize" data-tip="Minimize the player">${icon('minimize')}</button>
            <button class="ib sm" data-act="close" aria-label="Stop and close" data-tip="Stop reading and close the player">${icon('close')}</button>
          </div>
          <div class="trow" data-el="trow">
            <button class="ib" data-act="prev" aria-label="Previous sentence" data-tip="Previous sentence (Alt+Shift+,)">${icon('prev')}</button>
            <button class="go" data-act="toggle" aria-label="Play" data-tip="Play (Alt+Shift+R)">${playPause}</button>
            <button class="ib" data-act="next" aria-label="Next sentence" data-tip="Next sentence (Alt+Shift+.)">${icon('next')}</button>
            <span class="flex1"></span>
            <button class="pill" data-act="openPace" data-el="paceBtn" data-tip="Reading speed"><span data-el="paceLabel"></span><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.expand}</svg></button>
            <button class="pill" data-act="openVoice" data-el="voiceBtn" data-tip="Reading voice"><span data-el="voiceLabel"></span><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.expand}</svg></button>
          </div>
          <div class="stage">
            <div class="pane main">
              <div class="seg plain" data-el="tabs" style="grid-template-columns:repeat(3,1fr)" role="group" aria-label="Mode">
                <span class="thumb" data-el="tabThumb" style="width:calc((100% - 6px) / 3)"></span>
                ${MODES.map(
                  (m) =>
                    `<button data-act="mode-${m}" data-el="tab-${m}" aria-pressed="false" data-tip="${
                      { article: 'Read the page aloud, sentence by sentence', podcast: 'Two hosts discuss this page (you write the script first)', summary: 'Hear a short summary instead of the whole page' }[m]
                    }">${icon(TAB_ICON[m])}${TAB_LABEL[m]}</button>`,
                ).join('')}
              </div>
              <div class="slider"><div class="track" data-el="track">
                <div class="slide" data-el="slideRead">
                  <div class="notice" data-el="notice" hidden><div data-el="noticeText"></div><div class="acts" data-el="noticeActs"></div></div>
                  <div class="sents" data-el="sents" aria-live="polite"></div>
                  <div class="rfoot">
                    <button class="chip" data-act="pick" data-el="pick" aria-pressed="false" aria-label="Jump to a sentence"
                      data-tip="Jump to: click any sentence on the page to read from its start (Esc cancels; Alt+click works anytime)">${icon('cursor')}Jump to</button>
                    <span class="info" data-el="info"></span>
                  </div>
                </div>
                <div class="slide" data-el="slidePod">
                  <div class="notice" data-el="podNotice" hidden><div data-el="podNoticeText"></div><div class="acts" data-el="podNoticeActs"></div></div>
                  <div class="setupfill" data-el="podSetup">
                    <div class="host a">
                      <span class="av" data-el="avA"></span>
                      <button class="who" data-act="openHostA" data-tip="Choose the lead host's voice"><small>Host 1 · left</small><b><span data-el="nameA"></span><svg viewBox="0 0 24 24">${ICONS.expand}</svg></b></button>
                      <button class="pv" data-act="previewA" data-el="previewA" aria-label="Preview host 1 voice" data-tip="Hear a short sample of this voice">${icon('play')}</button>
                    </div>
                    <div class="host b">
                      <span class="av" data-el="avB"></span>
                      <button class="who" data-act="openHostB" data-tip="Choose the co-host's voice"><small>Host 2 · right</small><b><span data-el="nameB"></span><svg viewBox="0 0 24 24">${ICONS.expand}</svg></b></button>
                      <button class="pv" data-act="previewB" data-el="previewB" aria-label="Preview host 2 voice" data-tip="Hear a short sample of this voice">${icon('play')}</button>
                    </div>
                    <div class="seg plain" data-el="podLen" style="grid-template-columns:1fr 1fr" role="group" aria-label="Podcast length">
                      <span class="thumb" data-el="podLenThumb" style="width:calc((100% - 6px) / 2)"></span>
                      <button data-act="len-short" data-el="len-short" aria-pressed="false" data-tip="Target length of the conversation">Short · ~5 min</button>
                      <button data-act="len-standard" data-el="len-standard" aria-pressed="false" data-tip="Target length of the conversation">Standard · ~10 min</button>
                    </div>
                  </div>
                  <div class="setupfill" data-el="podScript" hidden>
                    <div class="legend"><span class="n"><i></i><span data-el="legA"></span></span><span>&amp;</span><span class="n"><i></i><span data-el="legB"></span></span></div>
                    <div class="scroll" data-el="transcript" role="list" aria-label="Podcast conversation"></div>
                    <div class="live" data-el="live" hidden>
                      <button class="ib" data-act="prevBlock" aria-label="Previous turn" data-tip="Previous turn (or start of this one)">${icon('prev')}</button>
                      <button class="go" data-act="toggle" aria-label="Play" data-tip="Play (Alt+Shift+R)">${playPause}</button>
                      <button class="ib" data-act="nextBlock" aria-label="Next turn" data-tip="Next turn">${icon('next')}</button>
                      <span class="lbl" data-el="turnLabel"></span>
                      <button class="pill" data-act="openPace" data-tip="Reading speed"><span data-el="paceLabel2"></span><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.expand}</svg></button>
                    </div>
                  </div>
                  <div class="needs" data-el="needs" hidden>
                    <span class="cost" data-el="needsCost"></span>
                    <button class="primary" data-act="podAction" data-el="podAction"></button>
                  </div>
                  <button class="primary" data-act="podAction" data-el="podWrite"></button>
                </div>
                <div class="slide" data-el="slideSum">
                  <div class="notice" data-el="sumNotice" hidden><div data-el="sumNoticeText"></div><div class="acts" data-el="sumNoticeActs"></div></div>
                  <div class="setupfill" data-el="sumSetup">
                    <div class="seg plain" data-el="sumLen" style="grid-template-columns:1fr 1fr" role="group" aria-label="Summary length">
                      <span class="thumb" data-el="sumLenThumb" style="width:calc((100% - 6px) / 2)"></span>
                      <button data-act="sum-brief" data-el="sum-brief" aria-pressed="false" data-tip="How long the summary should be">Brief · ~1 min</button>
                      <button data-act="sum-detailed" data-el="sum-detailed" aria-pressed="false" data-tip="How long the summary should be">Detailed · ~2 min</button>
                    </div>
                    <div class="foot" style="margin-top:0">Sarvam-105B summarises the page, then it's read aloud.</div>
                    <span class="flex1"></span>
                    <button class="primary" data-act="sumAction" data-el="sumAction"></button>
                  </div>
                  <div class="setupfill" data-el="sumDone" hidden>
                    <div class="sumhead"><span class="meta" data-el="sumMeta"></span><span class="flex1"></span>
                      <button class="readbtn" data-act="toggle" data-el="readBtn">${icon('play')}<span>Read</span></button></div>
                    <div class="bullets" data-el="bullets" role="list" aria-label="Summary"></div>
                  </div>
                </div>
              </div></div>
            </div>
            <div class="pane menu pacepane">
              <div class="mhead"><button class="back" data-act="closeMenu" aria-label="Back">${icon('expand')}</button><b>Reading speed</b><span class="flex1"></span><button class="done" data-act="closeMenu">Done</button></div>
              <div class="bigpace"><b data-el="bigPace"></b><span data-el="paceWord"></span></div>
              <div class="slwrap">
                <div class="sl" data-el="sl"><div class="rail"></div><div class="fill" data-el="slFill"></div><div data-el="slStops"></div><span class="knob" data-el="slKnob"></span></div>
                <div class="labels" data-el="slLabels"></div>
              </div>
              <div class="sf"><span>Slower</span><span>Faster</span></div>
              <div class="foot">Applies from the next sentence.</div>
            </div>
            <div class="pane menu voicepane">
              <div class="mhead"><button class="back" data-act="closeMenu" aria-label="Back">${icon('expand')}</button><b data-el="voiceTitle"></b><span class="flex1"></span><button class="done" data-act="closeMenu">Done</button></div>
              <div class="vlist" data-el="vlist" role="radiogroup"></div>
              <button class="more" data-act="settings">More voices in Settings…</button>
            </div>
          </div>
        </div>
      </div>
      <button class="xbtn" data-act="close" aria-label="Close player">${icon('close')}</button>
      <div class="tip" data-el="tip" aria-hidden="true"></div>`;
    this.root.append(wrap);
    this.wrap = wrap;
    for (const el of wrap.querySelectorAll<HTMLElement>('[data-el]')) this.els[el.dataset.el!] = el;

    wrap.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (!act) return;
      if (act.startsWith('mode-')) return this.h.setMode(act.slice(5) as PlayerMode);
      switch (act) {
        case 'toggle': return this.h.toggle();
        case 'prev': return this.h.prev();
        case 'next': return this.h.next();
        case 'prevBlock': return this.h.prevBlock();
        case 'nextBlock': return this.h.nextBlock();
        case 'pick': return this.h.togglePick();
        case 'settings': return this.h.openSettings();
        case 'close': return this.h.close();
        case 'toPill': return this.setSize('A');
        case 'toMini': return this.setSize('B');
        case 'toFull': return this.setSize('C');
        case 'openPace': return this.toggleMenu('pace');
        case 'openVoice': return this.toggleMenu('voice');
        case 'openHostA': return this.toggleMenu('hostA');
        case 'openHostB': return this.toggleMenu('hostB');
        case 'closeMenu': return this.toggleMenu(null);
        case 'podAction':
          if ((e.target as HTMLElement).closest('[aria-disabled="true"]')) return;
          return this.h.podcastAction();
        case 'sumAction':
          if (this.els.sumAction!.getAttribute('aria-disabled') === 'true') return;
          return this.h.summaryAction();
        case 'previewA': return this.h.previewVoice(this.view?.podcast?.hostA ?? '');
        case 'previewB': return this.h.previewVoice(this.view?.podcast?.hostB ?? '');
        case 'len-short': return this.h.setPodcastLength('short');
        case 'len-standard': return this.h.setPodcastLength('standard');
        case 'sum-brief': return this.h.setSummaryLength('brief');
        case 'sum-detailed': return this.h.setSummaryLength('detailed');
      }
    });

    wrap.addEventListener('pointerenter', () => { clearTimeout(this.hoverTimer); wrap.classList.add('hover'); });
    wrap.addEventListener('pointerleave', () => {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = setTimeout(() => wrap.classList.remove('hover'), 160);
    });
    this.els.transcript!.addEventListener('pointerenter', () => (this.pointerInTranscript = true));
    this.els.transcript!.addEventListener('pointerleave', () => (this.pointerInTranscript = false));
    this.setupSlider();
    this.setupDrag();
    this.setupTooltips(wrap);
    // Keep page shortcuts from firing while using the player.
    wrap.addEventListener('keydown', (e) => e.stopPropagation());

    this.syncInert();
    void loadPlayerFonts();
    document.documentElement.append(this.host);
  }

  /** The player's on-screen box, or null when hidden. */
  get rect(): DOMRect | null {
    if (this.host.style.display === 'none') return null;
    return (this.wrap.firstElementChild as HTMLElement | null)?.getBoundingClientRect() ?? null;
  }

  show() { this.host.style.display = ''; }
  hide() { this.host.style.display = 'none'; }
  remove() { this.host.remove(); }

  private setSize(size: Size) {
    this.size = size;
    this.lastSize = size;
    if (size !== 'C') this.menu = null;
    this.wrap.dataset.size = size;
    this.wrap.dataset.menu = this.menu ?? '';
    this.syncInert();
    this.repositionTip();
  }

  /** Layers that are faded out must not be reachable by keyboard. */
  private syncInert() {
    const picking = this.wrap.classList.contains('picking');
    for (const [cls, size] of [['.la', 'A'], ['.lb', 'B'], ['.lc', 'C']] as const) {
      this.wrap.querySelector(cls)!.toggleAttribute('inert', picking || this.size !== size);
    }
    this.wrap.querySelector('.lp')!.toggleAttribute('inert', !picking);
  }

  private toggleMenu(m: Menu) {
    this.menu = m === this.menu ? null : m;
    this.wrap.dataset.menu = this.menu ?? '';
    if (this.view) this.renderMenus(this.view);
    this.els.paceBtn!.classList.toggle('on', this.menu === 'pace');
    this.els.voiceBtn!.classList.toggle('on', this.menu === 'voice');
  }

  private setSeg(seg: HTMLElement, thumb: HTMLElement, index: number, n: number) {
    thumb.style.left = `calc(3px + ${index} * (100% - 6px) / ${n})`;
    seg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
  }

  render(v: PlayerView) {
    const wasPicking = this.view?.picking ?? false;
    const prevMode = this.view?.mode;
    this.view = v;
    const { state } = v;
    const wrap = this.wrap;
    const playing = state.status === 'playing';

    // Picking collapses the player to a slim hint bar; afterwards it returns to where it was.
    if (v.picking !== wasPicking) {
      wrap.classList.toggle('picking', v.picking);
      if (!v.picking) this.setSize(this.lastSize);
      else this.syncInert();
    }
    wrap.classList.toggle('playing', playing);
    wrap.dataset.mode = v.mode;
    this.els.title!.textContent = v.title;
    this.els.site!.textContent = location.hostname;
    for (const b of wrap.querySelectorAll<HTMLElement>('[data-act="toggle"]')) {
      const label = playing ? 'Pause' : 'Play';
      b.setAttribute('aria-label', label);
      b.dataset.tip = `${label} (Alt+Shift+R)`;
      b.classList.toggle('busy', state.buffering && playing);
    }
    this.els.chipIcon!.innerHTML = `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:#2790C4">${ICONS[TAB_ICON[v.mode]]}</svg>`;
    this.els.chipLabel!.textContent = TAB_LABEL[v.mode];

    // Tabs
    const idx = MODES.indexOf(v.mode);
    this.els.trow!.toggleAttribute('inert', v.mode === 'podcast');
    this.setSeg(this.els.tabs!, this.els.tabThumb!, idx, 3);
    (this.els.track as HTMLElement).style.transform = `translateX(-${idx * 33.333}%)`;
    // Only the active slide is reachable (the others are off-screen).
    (['slideRead', 'slidePod', 'slideSum'] as const).forEach((k, i) => this.els[k]!.toggleAttribute('inert', i !== idx));
    // Host pickers belong to the Podcast tab.
    if (prevMode !== v.mode && (this.menu === 'hostA' || this.menu === 'hostB')) {
      this.menu = null;
      wrap.dataset.menu = '';
    }

    this.els.paceLabel!.textContent = `${v.pace}×`;
    this.els.paceLabel2!.textContent = `${v.pace}×`;
    this.els.voiceLabel!.textContent = short(v.voice);

    this.renderReader(v);
    this.renderPodcast(v);
    this.renderSummary(v);
    this.renderMenus(v);

    // An error or a prompt that needs attention must not hide inside a collapsed player.
    const attention = v.notice && v.notice.tone !== 'info' ? v.notice.text : state.status === 'error' || state.status === 'blocked' ? state.status : '';
    if (attention && attention !== this.lastNotice && !v.picking) this.setSize('C');
    this.lastNotice = attention;
    this.repositionTip();
  }

  private statusLine(v: PlayerView): { text: string; tone: 'info' | 'attn' | 'err' } | null {
    const { state } = v;
    if (state.status === 'error') return { text: `${state.error ?? 'Something went wrong.'} Press ▶ to retry.`, tone: 'err' };
    if (state.status === 'blocked') return { text: 'Press ▶ to start: the browser needs a click on the page before it plays audio.', tone: 'attn' };
    return null;
  }

  private fillNotice(box: HTMLElement, text: HTMLElement, acts: HTMLElement, n: { text: string; tone: string; actions: Notice['actions'] } | null) {
    box.hidden = !n;
    acts.replaceChildren();
    if (!n) return;
    box.className = `notice${n.tone === 'info' ? '' : ' ' + n.tone}`;
    text.textContent = n.text;
    acts.replaceChildren(
      ...n.actions.map((a) => {
        const b = document.createElement('button');
        b.textContent = a.label;
        b.addEventListener('click', a.run);
        return b;
      }),
    );
  }

  private renderReader(v: PlayerView) {
    const { state } = v;
    const active = v.mode === 'article';
    // Info notices are hints for the other tabs' setup, which has its own wording; show them here only.
    const status = this.statusLine(v);
    const notice = v.notice && (active || v.notice.tone !== 'info' || v.notice.actions.length) ? v.notice : null;
    const shown = active ? (notice ?? (status ? { ...status, actions: [] } : null)) : null;
    this.fillNotice(this.els.notice!, this.els.noticeText!, this.els.noticeActs!, shown && { text: shown.text, tone: shown.tone, actions: shown.actions });

    const sents = this.els.sents!;
    const sentence = (i: number, cls: string) => {
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = v.chunkText(i);
      return d;
    };
    if (!state.total || state.status === 'idle' || state.status === 'ended') {
      const d = document.createElement('div');
      d.className = 'idle';
      d.textContent = state.status === 'ended' ? 'Finished. Press ▶ to start over.' : v.overview;
      sents.replaceChildren(d);
    } else {
      const i = Math.min(state.index, state.total - 1);
      const cur = document.createElement('div');
      const mark = document.createElement('mark');
      mark.textContent = (state.buffering && state.status === 'playing' ? '… ' : '') + v.chunkText(i);
      cur.append(mark);
      sents.replaceChildren(...(i > 0 ? [sentence(i - 1, 'dim')] : []), cur, ...(i < state.total - 1 ? [sentence(i + 1, 'dim')] : []));
    }
    this.els.pick!.hidden = !active;
    this.els.pick!.setAttribute('aria-pressed', String(v.picking));
    this.els.info!.textContent = state.total
      ? `${Math.min(state.index + 1, state.total)} / ${state.total} · ~${Math.max(1, Math.round(v.remainingMinutes))} min left`
      : '';
  }

  private renderPodcast(v: PlayerView) {
    const p = v.podcast ?? null;
    const active = v.mode === 'podcast';
    const items = active ? v.transcript ?? null : null;
    const hasScript = !!items?.length;
    this.fillNotice(
      this.els.podNotice!, this.els.podNoticeText!, this.els.podNoticeActs!,
      active && v.notice && (v.notice.tone !== 'info' || v.notice.actions.length) ? v.notice : active && this.statusLine(v) ? { ...this.statusLine(v)!, actions: [] } : null,
    );
    this.els.podSetup!.hidden = hasScript || !p;
    this.els.podScript!.hidden = !hasScript;
    if (!p) { this.els.podWrite!.hidden = true; this.els.needs!.hidden = true; return; }

    const nm = (id: string) => (id ? short(id) : 'Choose…');
    this.els.nameA!.textContent = nm(p.hostA);
    this.els.nameB!.textContent = nm(p.hostB);
    this.els.avA!.textContent = (p.hostA ? short(p.hostA) : '?').charAt(0);
    this.els.avB!.textContent = (p.hostB ? short(p.hostB) : '?').charAt(0);
    this.els.legA!.textContent = v.hostNames?.left || nm(p.hostA);
    this.els.legB!.textContent = v.hostNames?.right || nm(p.hostB);
    (this.els.previewA as HTMLButtonElement).disabled = !p.hostA;
    (this.els.previewB as HTMLButtonElement).disabled = !p.hostB;
    this.setSeg(this.els.podLen!, this.els.podLenThumb!, p.length === 'standard' ? 1 : 0, 2);
    this.els.podLen!.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = p.locked));

    // Without a script the one button writes it; with a script it is "Generate audio" beside a cost note.
    this.setPrimary(this.els.podWrite as HTMLButtonElement, hasScript ? null : p.button);
    this.els.needs!.hidden = !(hasScript && p.button);
    if (hasScript && p.button) {
      this.setPrimary(this.els.podAction as HTMLButtonElement, p.button);
      const [label, cost] = p.button.label.split(' · ');
      (this.els.podAction as HTMLButtonElement).textContent = label ?? p.button.label;
      this.els.needsCost!.textContent = `${items!.length} turns${cost ? '\n' + cost : ''}`;
      this.els.needsCost!.style.whiteSpace = 'pre-line';
    }
    this.els.live!.hidden = !(hasScript && !p.button);
    this.els.turnLabel!.textContent = hasScript ? `Turn ${this.turnIndex(items!, v.state.index) + 1} of ${items!.length}` : '';
    this.renderChat(items, v.state.index);
  }

  private turnIndex(items: TranscriptItem[], index: number) {
    let a = 0;
    for (let i = 0; i < items.length; i++) if (items[i]!.start <= index) a = i;
    return a;
  }

  private renderSummary(v: PlayerView) {
    const p = v.summary ?? null;
    const active = v.mode === 'summary';
    const items = active ? v.transcript ?? null : null;
    const done = !!items?.length;
    this.fillNotice(
      this.els.sumNotice!, this.els.sumNoticeText!, this.els.sumNoticeActs!,
      active && v.notice && (v.notice.tone !== 'info' || v.notice.actions.length) ? v.notice : active && this.statusLine(v) ? { ...this.statusLine(v)!, actions: [] } : null,
    );
    this.els.sumSetup!.hidden = done || !p;
    this.els.sumDone!.hidden = !done;
    if (p) {
      this.setSeg(this.els.sumLen!, this.els.sumLenThumb!, p.length === 'detailed' ? 1 : 0, 2);
      this.els.sumLen!.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = p.locked));
      this.setPrimary(this.els.sumAction as HTMLButtonElement, p.button);
    }
    const playing = v.state.status === 'playing';
    this.els.readBtn!.innerHTML = `${icon(playing ? 'pause' : 'play')}<span>${playing ? 'Pause' : 'Read'}</span>`;
    if (!done) return;
    this.els.sumMeta!.textContent = `${items!.length} key points`;
    if (items !== this.renderedSummary) {
      this.renderedSummary = items;
      this.els.bullets!.replaceChildren(
        ...items!.map((t) => {
          const b = document.createElement('button');
          b.className = 'bl';
          b.setAttribute('role', 'listitem');
          b.dataset.tip = 'Read from here';
          b.innerHTML = '<i></i><span></span>';
          b.lastElementChild!.textContent = t.text;
          b.addEventListener('click', () => this.h.playFrom(t.start));
          return b;
        }),
      );
    }
    const a = this.turnIndex(items!, v.state.index);
    this.els.bullets!.querySelectorAll('.bl').forEach((el, i) => el.classList.toggle('on', i === a && v.state.status !== 'idle'));
  }

  private setPrimary(btn: HTMLButtonElement, b: PanelButton | null) {
    btn.hidden = !b;
    if (!b) return;
    btn.textContent = b.label;
    btn.dataset.tip = b.tip;
    // aria-disabled (not disabled) so the tooltip can still explain why.
    btn.setAttribute('aria-disabled', String(b.disabled));
    btn.classList.toggle('busy', b.busy);
  }

  private renderMenus(v: PlayerView) {
    // Pace
    const paces = v.paces;
    const pi = Math.max(0, paces.indexOf(v.pace));
    const pct = (i: number) => (paces.length > 1 ? (i / (paces.length - 1)) * 100 : 0);
    this.els.bigPace!.textContent = `${v.pace}×`;
    this.els.paceWord!.textContent = paces.length === PACE_WORDS.length ? PACE_WORDS[pi]! : '';
    this.els.slFill!.style.width = `${pct(pi)}%`;
    this.els.slKnob!.style.left = `${pct(pi)}%`;
    if (this.els.slStops!.childElementCount !== paces.length) {
      this.els.slStops!.replaceChildren(...paces.map((_, i) => Object.assign(document.createElement('span'), { className: 'stop', style: `left:${pct(i)}%` })));
      this.els.slLabels!.replaceChildren(...paces.map((p, i) => Object.assign(document.createElement('span'), { textContent: `${p}×`, style: `left:${pct(i)}%` })));
    }
    this.els.slStops!.childNodes.forEach((n, i) => (n as HTMLElement).classList.toggle('on', i <= pi));
    this.els.slLabels!.childNodes.forEach((n, i) => (n as HTMLElement).classList.toggle('on', i === pi));

    // Voice list (reading voice or one of the podcast hosts)
    const m = this.menu;
    const host = m === 'hostA' || m === 'hostB';
    if (m !== 'voice' && !host) return;
    const selected = host ? (m === 'hostA' ? v.podcast?.hostA : v.podcast?.hostB) ?? '' : v.voice;
    const list = host ? v.podcast?.voices ?? [] : v.voices.includes(v.voice) ? v.voices : [v.voice, ...v.voices];
    this.els.voiceTitle!.textContent = m === 'hostA' ? 'Host 1 voice' : m === 'hostB' ? 'Host 2 voice' : 'Reading voice';
    const key = `${m}|${selected}|${list.length}`;
    const vlist = this.els.vlist!;
    if (vlist.dataset.key === key) return;
    vlist.dataset.key = key;
    const keepScroll = vlist.scrollTop;
    vlist.replaceChildren(
      ...list.map((id) => {
        const row = document.createElement('div');
        row.className = `vrow${id === selected ? ' on' : ''}`;
        const [name, ...style] = prettyVoice(id).split(' · ');
        row.innerHTML = '<button class="pick" role="radio"><span class="radio"><i></i></span><span class="nm"></span><em></em></button><button class="pv" aria-label="Preview voice">' + icon('play') + '</button>';
        q(row, '.nm').textContent = name ?? id;
        q(row, 'em').textContent = style.join(' · ');
        row.querySelector('.pick')!.setAttribute('aria-checked', String(id === selected));
        row.querySelector('.pick')!.addEventListener('click', () => {
          if (m === 'hostA') this.h.setHost('A', id);
          else if (m === 'hostB') this.h.setHost('B', id);
          else this.h.setVoice(id);
        });
        row.querySelector('.pv')!.addEventListener('click', () => this.h.previewVoice(id));
        return row;
      }),
    );
    vlist.scrollTop = keepScroll;
  }

  private setupSlider() {
    const sl = this.els.sl!;
    const pick = (e: PointerEvent) => {
      const paces = this.view?.paces ?? [];
      if (paces.length < 2) return;
      const r = sl.getBoundingClientRect();
      const i = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (paces.length - 1));
      if (paces[i] !== this.view?.pace) this.h.setPace(paces[i]!);
    };
    sl.addEventListener('pointerdown', (e) => {
      sl.setPointerCapture?.(e.pointerId);
      this.paceDrag = true;
      sl.classList.add('drag');
      pick(e);
    });
    sl.addEventListener('pointermove', (e) => this.paceDrag && pick(e));
    const end = () => { this.paceDrag = false; sl.classList.remove('drag'); };
    sl.addEventListener('pointerup', end);
    sl.addEventListener('pointercancel', end);
  }

  /**
   * Drag by any grip; on release the player snaps to the nearest viewport corner. A quick
   * flick carries it toward the corner it was thrown at. The drag itself is a transform over
   * the current anchor, and the snap is a FLIP from where it was dropped to the new anchor.
   */
  private setupDrag() {
    const wrap = this.wrap;
    this.wrap.addEventListener('pointerdown', (e) => {
      const grip = (e.target as HTMLElement).closest('[data-drag]');
      if (!grip || e.button !== 0) return;
      e.preventDefault();
      // Pick it up from wherever it is, even mid-snap.
      const seen = wrap.getBoundingClientRect();
      clearTimeout(this.snapTimer);
      wrap.classList.remove('snapping');
      wrap.style.transform = '';
      const base = wrap.getBoundingClientRect();
      const from = { x: seen.left - base.left, y: seen.top - base.top };
      if (from.x || from.y) wrap.style.transform = `translate(${from.x}px, ${from.y}px)`;
      const start = { x: e.clientX, y: e.clientY };
      let last = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      let v = { x: 0, y: 0 };
      let moved = false;

      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) < 3) return;
        moved = true;
        wrap.classList.add('dragging');
        const dt = ev.timeStamp - last.t;
        if (dt > 0) {
          v = { x: 0.7 * ((ev.clientX - last.x) / dt) + 0.3 * v.x, y: 0.7 * ((ev.clientY - last.y) / dt) + 0.3 * v.y };
          last = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp };
        }
        const tx = clamp(from.x + dx, -base.left, window.innerWidth - base.right);
        const ty = clamp(from.y + dy, -base.top, window.innerHeight - base.bottom);
        wrap.style.transform = `translate(${tx}px, ${ty}px) scale(1.02)`;
      };

      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (!moved && !from.x && !from.y) return;
        // A pause before letting go means "put it here", not a throw.
        if (ev.timeStamp - last.t > 90) v = { x: 0, y: 0 };
        const dropped = wrap.getBoundingClientRect();
        const cx = dropped.left + dropped.width / 2 + v.x * 180;
        const cy = dropped.top + dropped.height / 2 + v.y * 180;
        this.snapTo({ x: cx < window.innerWidth / 2 ? 'left' : 'right', y: cy < window.innerHeight / 2 ? 'top' : 'bottom' }, dropped);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
  }

  /** Re-anchor to a corner, animating from the box's current on-screen spot. */
  private snapTo(corner: Corner, from: DOMRect) {
    const wrap = this.wrap;
    wrap.dataset.x = corner.x;
    wrap.dataset.y = corner.y;
    wrap.style.transform = '';
    const to = wrap.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    wrap.style.transform = `translate(${dx}px, ${dy}px) scale(${from.width / to.width})`;
    // Longer trips get more time, so a cross-screen move doesn't feel rushed nor a short hop sluggish.
    const ms = Math.round(clamp(500 + Math.hypot(dx, dy) * 0.6, 600, 950));
    wrap.style.setProperty('--snap-ms', `${ms}ms`);
    void wrap.offsetWidth;
    wrap.classList.remove('dragging');
    wrap.classList.add('snapping');
    wrap.style.transform = '';
    this.snapTimer = setTimeout(() => wrap.classList.remove('snapping'), ms + 50);
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
      const half = tip.offsetWidth / 2;
      const x = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8);
      // Flip below the control when there's no room above (player docked at the top).
      const below = r.top - tip.offsetHeight - 8 < 4;
      tip.classList.toggle('below', below);
      tip.style.left = `${x - w.left}px`;
      tip.style.top = `${(below ? r.bottom : r.top) - w.top}px`;
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

  private renderChat(items: TranscriptItem[] | null, index: number) {
    const box = this.els.transcript!;
    if (items !== this.renderedTranscript) {
      this.renderedTranscript = items;
      this.activeTurn = -1;
      box.replaceChildren(
        ...(items ?? []).map((t) => {
          const b = document.createElement('button');
          b.className = `msg ${t.side === 'right' ? 'right' : 'left'}`;
          b.setAttribute('role', 'listitem');
          b.dataset.tip = 'Play from here';
          b.textContent = t.text;
          b.addEventListener('click', () => this.h.playFrom(t.start));
          return b;
        }),
      );
    }
    if (!items?.length) return;
    const active = this.turnIndex(items, index);
    if (active === this.activeTurn) return;
    box.children[this.activeTurn]?.classList.remove('on');
    const el = box.children[active] as HTMLElement | undefined;
    el?.classList.add('on');
    this.activeTurn = active;
    // Keep the current message in the clear (unfaded) area without scrolling the page.
    if (el && !this.pointerInTranscript) box.scrollTo({ top: el.offsetTop - box.clientHeight / 3, behavior: 'smooth' });
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

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
