import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioOut, Clip } from '@/lib/player/audio';
import { PlaybackController, type ControllerChunk } from '@/lib/player/controller';

/** Audio clock driven by fake timers; clips are 1 s long. */
class FakeAudio implements AudioOut {
  scheduled: { index: number; when: number; stopped: boolean }[] = [];
  gestureAllowed = true;
  private base = 0;
  private runStart: number | null = null;
  private nextIndex: number[] = [];

  get now() {
    return this.base + (this.runStart != null ? (Date.now() - this.runStart) / 1000 : 0);
  }
  get running() {
    return this.runStart != null;
  }
  unlock() {
    this.gestureAllowed = true;
    void this.resume();
  }
  async decode(bytes: ArrayBuffer): Promise<Clip> {
    this.nextIndex.push(new Uint8Array(bytes)[0]!);
    return { duration: 1, index: new Uint8Array(bytes)[0] } as Clip;
  }
  schedule(clip: Clip, when: number) {
    const entry = { index: (clip as Clip & { index: number }).index, when, stopped: false };
    this.scheduled.push(entry);
    return { stop: () => (entry.stopped = true) };
  }
  async pause() {
    this.base = this.now;
    this.runStart = null;
  }
  async resume() {
    if (this.gestureAllowed && this.runStart == null) this.runStart = Date.now();
  }
}

const chunks: ControllerChunk[] = [
  { block: 0, speech: 'Title' },
  { block: 1, speech: 'One.' },
  { block: 1, speech: 'Two.' },
  { block: 2, speech: 'Three.' },
  { block: 2, speech: 'Four.' },
];

function setup(opts: { fail?: Set<number>; delayMs?: number } = {}) {
  const audio = new FakeAudio();
  const synthCalls: number[] = [];
  const ctrl = new PlaybackController({
    audio,
    synth: async (i) => {
      synthCalls.push(i);
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (opts.fail?.has(i)) throw new Error(`boom ${i}`);
      return new Uint8Array([i]).buffer;
    },
    pauses: () => ({ sentence: 0.15, paragraph: 0.45 }),
    prefetch: () => 1,
  });
  ctrl.load(chunks);
  const shown: (number | null)[] = [];
  ctrl.onChunk((i) => shown.push(i));
  return { audio, ctrl, synthCalls, shown };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('PlaybackController', () => {
  it('plays every chunk in order with sentence and paragraph gaps, then ends', async () => {
    const { audio, ctrl, shown } = setup();
    ctrl.play();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ctrl.state.status).toBe('ended');
    expect(audio.scheduled.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
    const starts = audio.scheduled.map((s) => s.when);
    const gaps = starts.slice(1).map((t, i) => +(t - starts[i]! - 1).toFixed(2));
    // block 0→1 paragraph, 1→1 sentence, 1→2 paragraph, 2→2 sentence
    expect(gaps).toEqual([0.45, 0.15, 0.45, 0.15]);
    expect(shown.filter((x) => x !== null)).toEqual([0, 1, 2, 3, 4]);
    expect(shown.at(-1)).toBeNull();
  });

  it('only synthesises a small window ahead', async () => {
    const { ctrl, synthCalls } = setup();
    ctrl.play();
    await vi.advanceTimersByTimeAsync(100);
    expect(Math.max(...synthCalls)).toBeLessThanOrEqual(1);
  });

  it('pauses and resumes without losing position', async () => {
    const { ctrl } = setup();
    ctrl.play();
    await vi.advanceTimersByTimeAsync(1600);
    ctrl.pause();
    const idx = ctrl.state.index;
    await vi.advanceTimersByTimeAsync(5000);
    expect(ctrl.state.status).toBe('paused');
    expect(ctrl.state.index).toBe(idx);
    ctrl.play();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ctrl.state.status).toBe('ended');
  });

  it('seeks while playing and keeps playing from the target', async () => {
    const { audio, ctrl } = setup();
    ctrl.play();
    await vi.advanceTimersByTimeAsync(300);
    ctrl.seek(3);
    await vi.advanceTimersByTimeAsync(300);
    expect(ctrl.state).toMatchObject({ status: 'playing', index: 3 });
    expect(audio.scheduled.filter((s) => !s.stopped).map((s) => s.index)[0]).toBe(3);
  });

  it('seeks while paused without starting audio', async () => {
    const { audio, ctrl, shown } = setup();
    ctrl.seek(2);
    expect(ctrl.state).toMatchObject({ status: 'paused', index: 2 });
    expect(shown.at(-1)).toBe(2);
    expect(audio.scheduled).toHaveLength(0);
    ctrl.play();
    await vi.advanceTimersByTimeAsync(200);
    expect(audio.scheduled[0]!.index).toBe(2);
  });

  it('navigates by paragraph', () => {
    const { ctrl } = setup();
    ctrl.seek(2);
    ctrl.nextBlock();
    expect(ctrl.state.index).toBe(3);
    ctrl.prevBlock();
    expect(ctrl.state.index).toBe(1);
    ctrl.seek(2);
    ctrl.prevBlock();
    expect(ctrl.state.index).toBe(1);
  });

  it('reports synthesis errors and retries on play', async () => {
    const fail = new Set([2]);
    const { ctrl } = setup({ fail });
    ctrl.play();
    await vi.advanceTimersByTimeAsync(5000);
    expect(ctrl.state).toMatchObject({ status: 'error', index: 2, error: 'boom 2' });
    fail.clear();
    ctrl.play();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ctrl.state.status).toBe('ended');
  });

  it('reports blocked when audio cannot start without a gesture', async () => {
    const { audio, ctrl } = setup();
    audio.gestureAllowed = false;
    // Simulate a start that didn't come from a click: unlock() is not honoured.
    audio.unlock = () => undefined;
    ctrl.play();
    await vi.advanceTimersByTimeAsync(1000);
    expect(ctrl.state.status).toBe('blocked');
    audio.gestureAllowed = true;
    await audio.resume();
    await vi.advanceTimersByTimeAsync(100);
    expect(ctrl.state.status).toBe('playing');
  });

  it('shows buffering while waiting on slow synthesis', async () => {
    const { ctrl } = setup({ delayMs: 3000 });
    ctrl.play();
    await vi.advanceTimersByTimeAsync(500);
    expect(ctrl.state.buffering).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(ctrl.state.buffering).toBe(false);
  });
});
