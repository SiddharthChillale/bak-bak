// Playback state machine over a list of chunks (sentences). Synthesises a few
// chunks ahead, schedules them gaplessly on the audio clock, and supports
// pause/resume, seeking to any chunk, and paragraph navigation.

import type { AudioOut, Clip, Scheduled } from './audio';

export type Status = 'idle' | 'playing' | 'paused' | 'blocked' | 'ended' | 'error';

export interface PlayerState {
  status: Status;
  /** Chunk currently playing (or that will play next when paused). */
  index: number;
  total: number;
  /** Waiting on synthesis for the chunk that should be playing. */
  buffering: boolean;
  error?: string;
}

export interface ControllerChunk {
  block: number;
  speech: string;
}

export interface ControllerDeps {
  audio: AudioOut;
  /** Synthesise one chunk; returns encoded audio bytes. */
  synth(index: number, speech: string): Promise<ArrayBuffer>;
  /** Drop a pending synth request that is no longer needed. */
  cancel?(index: number): void;
  pauses(): { sentence: number; paragraph: number };
  prefetch(): number;
}

/** How long before a clip ends the next one gets scheduled (s). */
const LOOKAHEAD = 0.4;
const TICK_MS = 50;
/** Decoded clips kept behind the current chunk for quick "previous". */
const KEEP_BEHIND = 2;
/** A context that stays suspended this long after play() needs a user gesture. */
const BLOCKED_AFTER_MS = 600;

interface TimelineEntry {
  index: number;
  start: number;
  end: number;
  handle: Scheduled;
}

export class PlaybackController {
  private chunks: ControllerChunk[] = [];
  private clips = new Map<number, Promise<Clip>>();
  private settled = new Set<number>();
  private timeline: TimelineEntry[] = [];
  private gen = 0;
  /** Set when stopped mid-way (seek while paused): resume must restart the run loop. */
  private restartOnPlay = true;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private waiters: { gen: number; t: number; resolve: () => void }[] = [];
  private listeners = new Set<(s: PlayerState) => void>();
  private chunkListeners = new Set<(index: number | null) => void>();
  private shown: number | null = null;
  /** Chunk the run loop is waiting on synthesis for. */
  private awaiting: number | null = null;
  private scheduledEnd = -Infinity;
  private suspendedSince: number | null = null;
  private _state: PlayerState = { status: 'idle', index: 0, total: 0, buffering: false };

  constructor(private deps: ControllerDeps) {}

  get state(): PlayerState {
    return this._state;
  }

  onChange(cb: (s: PlayerState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Fires when the audible chunk changes (null when nothing is playing). */
  onChunk(cb: (index: number | null) => void): () => void {
    this.chunkListeners.add(cb);
    return () => this.chunkListeners.delete(cb);
  }

  load(chunks: ControllerChunk[]) {
    this.halt();
    this.dropClips();
    this.chunks = chunks;
    this.restartOnPlay = true;
    this.set({ status: 'idle', index: 0, total: chunks.length, buffering: false, error: undefined });
  }

  /** Start/resume. Pass an index to start from a specific chunk. */
  play(from?: number) {
    this.deps.audio.unlock();
    if (from != null) return this.startAt(from);
    const { status, index } = this._state;
    if (status === 'paused' && !this.restartOnPlay) {
      void this.deps.audio.resume();
      this.set({ status: 'playing' });
      return;
    }
    if (status === 'blocked') {
      // unlock() above resumes the context; the run loop is already waiting on it.
      return;
    }
    if (status === 'playing') return;
    this.startAt(status === 'ended' ? 0 : index);
  }

  pause() {
    if (this._state.status !== 'playing' && this._state.status !== 'blocked') return;
    void this.deps.audio.pause();
    this.set({ status: 'paused' });
  }

  toggle() {
    if (this._state.status === 'playing') this.pause();
    else this.play();
  }

  stop() {
    this.halt();
    this.restartOnPlay = true;
    this.set({ status: 'idle', buffering: false });
    this.showChunk(null);
  }

  /** Jump to a chunk; keeps playing if playing, stays paused if paused. */
  seek(index: number) {
    const i = clamp(index, 0, this.chunks.length - 1);
    const wasPlaying = this._state.status === 'playing' || this._state.status === 'blocked';
    if (wasPlaying) return this.startAt(i);
    this.halt();
    this.restartOnPlay = true;
    this.set({ index: i, status: 'paused', buffering: false, error: undefined });
    this.showChunk(i);
  }

  next() {
    this.seek(this._state.index + 1);
  }

  prev() {
    this.seek(this._state.index - 1);
  }

  nextBlock() {
    const cur = this.chunks[this._state.index]?.block;
    const i = this.chunks.findIndex((c, k) => k > this._state.index && c.block !== cur);
    if (i >= 0) this.seek(i);
  }

  /** Start of the current paragraph, or the previous one if already at its start. */
  prevBlock() {
    const { index } = this._state;
    const cur = this.chunks[index]?.block;
    let i = index;
    while (i > 0 && this.chunks[i - 1]!.block === cur) i--;
    if (i === index && i > 0) {
      const prevBlock = this.chunks[i - 1]!.block;
      while (i > 0 && this.chunks[i - 1]!.block === prevBlock) i--;
    }
    this.seek(i);
  }

  /** Voice or speed changed: throw away synthesised audio and restart the current chunk. */
  invalidateAudio() {
    const { status, index } = this._state;
    this.halt();
    this.dropClips();
    this.restartOnPlay = true;
    if (status === 'playing' || status === 'blocked') this.startAt(index);
  }

  destroy() {
    this.halt();
    this.dropClips();
    this.listeners.clear();
    this.chunkListeners.clear();
  }

  // ---- internals -----------------------------------------------------------

  private startAt(index: number) {
    if (!this.chunks.length) return;
    const i = clamp(index, 0, this.chunks.length - 1);
    this.halt();
    this.restartOnPlay = false;
    const gen = this.gen;
    void this.deps.audio.resume();
    this.suspendedSince = null;
    this.set({ status: 'playing', index: i, error: undefined, buffering: false });
    this.startTicker();
    void this.run(gen, i);
  }

  private async run(gen: number, from: number) {
    let prevEnd = -Infinity;
    let prevBlock: number | null = null;
    this.scheduledEnd = -Infinity;
    for (let i = from; i < this.chunks.length; i++) {
      if (gen !== this.gen) return;
      this.prefetchFrom(i);
      const chunk = this.chunks[i]!;
      this.awaiting = i;
      if (this.deps.audio.now >= prevEnd && !this.settled.has(i)) this.set({ buffering: true });
      let clip: Clip;
      try {
        clip = await this.clip(i);
      } catch (e) {
        if (gen !== this.gen) return;
        this.halt();
        this.restartOnPlay = true;
        this.set({ status: 'error', index: i, buffering: false, error: e instanceof Error ? e.message : String(e) });
        return;
      }
      if (gen !== this.gen) return;
      this.awaiting = null;
      this.set({ buffering: false });

      const { sentence, paragraph } = this.deps.pauses();
      const gap = prevBlock == null ? 0 : chunk.block !== prevBlock ? paragraph : sentence;
      const start = Math.max(this.deps.audio.now + 0.05, prevEnd + gap);
      const handle = this.deps.audio.schedule(clip, start);
      this.timeline.push({ index: i, start, end: start + clip.duration, handle });
      prevEnd = start + clip.duration;
      this.scheduledEnd = prevEnd;
      prevBlock = chunk.block;

      await this.waitUntil(gen, prevEnd - LOOKAHEAD);
    }
    await this.waitUntil(gen, prevEnd);
    if (gen !== this.gen) return;
    this.halt();
    this.restartOnPlay = true;
    this.set({ status: 'ended', buffering: false });
    this.showChunk(null);
  }

  private clip(i: number): Promise<Clip> {
    let p = this.clips.get(i);
    if (!p) {
      const chunk = this.chunks[i]!;
      p = this.deps.synth(i, chunk.speech).then((bytes) => this.deps.audio.decode(bytes));
      this.clips.set(i, p);
      p.then(
        () => this.settled.add(i),
        () => {
          // Forget failures so a later play() retries.
          if (this.clips.get(i) === p) this.clips.delete(i);
        },
      );
    }
    return p;
  }

  private prefetchFrom(i: number) {
    const ahead = Math.max(0, this.deps.prefetch());
    for (let k = i; k <= Math.min(i + ahead, this.chunks.length - 1); k++) void this.clip(k).catch(() => undefined);
    // Release decoded audio (and pending requests) outside the window.
    for (const k of [...this.clips.keys()]) {
      if (k < i - KEEP_BEHIND || k > i + ahead) {
        if (!this.settled.has(k)) this.deps.cancel?.(k);
        this.clips.delete(k);
        this.settled.delete(k);
      }
    }
  }

  private dropClips() {
    for (const k of this.clips.keys()) if (!this.settled.has(k)) this.deps.cancel?.(k);
    this.clips.clear();
    this.settled.clear();
  }

  /** Stop all scheduled audio and invalidate the run loop. */
  private halt() {
    this.gen++;
    this.awaiting = null;
    for (const e of this.timeline) e.handle.stop();
    this.timeline = [];
    this.stopTicker();
    for (const w of this.waiters) w.resolve();
    this.waiters = [];
  }

  private waitUntil(gen: number, t: number): Promise<void> {
    if (gen !== this.gen || this.deps.audio.now >= t) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push({ gen, t, resolve }));
  }

  private startTicker() {
    this.stopTicker();
    this.ticker = setInterval(() => this.tick(), TICK_MS);
  }

  private stopTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  private tick() {
    const now = this.deps.audio.now;
    const { status } = this._state;
    // Autoplay: a context that won't start without a gesture means we need a click.
    if (this.deps.audio.running) {
      this.suspendedSince = null;
      if (status === 'blocked') this.set({ status: 'playing' });
    } else if (status === 'playing') {
      this.suspendedSince ??= Date.now();
      if (Date.now() - this.suspendedSince > BLOCKED_AFTER_MS) this.set({ status: 'blocked' });
    }
    if (this.awaiting != null && now >= this.scheduledEnd && !this._state.buffering) this.set({ buffering: true });
    this.waiters = this.waiters.filter((w) => {
      if (w.gen !== this.gen || now >= w.t) {
        w.resolve();
        return false;
      }
      return true;
    });
    // Audible chunk = last scheduled entry that has started.
    let current: TimelineEntry | undefined;
    for (const e of this.timeline) if (e.start <= now + 0.01) current = e;
    if (current && current.index !== this._state.index) this.set({ index: current.index });
    if (current && current.index !== this.shown) this.showChunk(current.index);
    // Drop finished entries.
    this.timeline = this.timeline.filter((e) => e.end > now - 1 || e === current);
  }

  private showChunk(index: number | null) {
    this.shown = index;
    for (const cb of this.chunkListeners) cb(index);
  }

  private set(patch: Partial<PlayerState>) {
    const next = { ...this._state, ...patch };
    const changed = (Object.keys(next) as (keyof PlayerState)[]).some((k) => next[k] !== this._state[k]);
    if (!changed) return;
    this._state = next;
    for (const cb of this.listeners) cb(next);
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
