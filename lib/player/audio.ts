// Web Audio output. Unlike <audio> + blob: URLs, decoding bytes into an
// AudioBuffer isn't subject to the page's CSP `media-src`, and scheduling on the
// AudioContext clock lets sentences play back to back with exact gaps.

export interface Clip {
  readonly duration: number;
}

export interface Scheduled {
  stop(): void;
}

export interface AudioOut {
  /** Seconds on the output clock; frozen while paused. */
  readonly now: number;
  readonly running: boolean;
  /** Create/resume the context. Call synchronously inside a user gesture. */
  unlock(): void;
  decode(bytes: ArrayBuffer): Promise<Clip>;
  schedule(clip: Clip, when: number): Scheduled;
  pause(): Promise<void>;
  resume(): Promise<void>;
}

export class WebAudioOut implements AudioOut {
  private ctx: AudioContext | null = null;

  get now() {
    return this.ctx?.currentTime ?? 0;
  }

  get running() {
    return this.ctx?.state === 'running';
  }

  unlock() {
    const ctx = this.context();
    if (ctx.state === 'suspended') void ctx.resume();
  }

  decode(bytes: ArrayBuffer): Promise<Clip> {
    return this.context().decodeAudioData(bytes);
  }

  schedule(clip: Clip, when: number): Scheduled {
    const ctx = this.context();
    const src = ctx.createBufferSource();
    src.buffer = clip as AudioBuffer;
    src.connect(ctx.destination);
    src.start(when);
    return {
      stop: () => {
        try {
          src.stop();
        } catch {
          // already stopped
        }
        src.disconnect();
      },
    };
  }

  async pause() {
    if (this.ctx?.state === 'running') await this.ctx.suspend();
  }

  async resume() {
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  close() {
    void this.ctx?.close();
    this.ctx = null;
  }

  private context(): AudioContext {
    // Created lazily: outside a user gesture it starts suspended (autoplay policy).
    this.ctx ??= new AudioContext({ latencyHint: 'playback' });
    return this.ctx;
  }
}
