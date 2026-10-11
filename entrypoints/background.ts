import { browser, storage, type Browser } from '#imports';
import { cacheGet, cacheKey, cachePut } from '@/lib/cache';
import type { PlayerCommand, ToBackground, ToContent, TtsPortRequest, TtsPortResponse, VoiceSettings } from '@/lib/messages';
import { TTS_PORT } from '@/lib/messages';
import { generateScript, type PodcastScript, type ScriptRequest } from '@/lib/podcast';
import { SarvamError, bytesToBase64, synthesize } from '@/lib/sarvam';
import { generateSummary, type Summary, type SummaryRequest } from '@/lib/summary';
import { ensureInjected, syncAutoDetect } from '@/lib/inject';
import { apiKeyItem, autoDetectItem, cacheLimitMbItem, transportItem } from '@/lib/settings';
import { recordUsage } from '@/lib/usage';

const MENU_READ_PAGE = 'read-page';
const MENU_READ_FROM_HERE = 'read-from-selection';
const MENU_PODCAST = 'podcast';
const MENU_SUMMARIZE = 'summarize';
const LANG = 'en-IN';
/** Concurrent Sarvam requests across all tabs. */
const MAX_INFLIGHT = 2;

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({ id: MENU_READ_PAGE, title: 'Read this page aloud', contexts: ['page'] });
      browser.contextMenus.create({ id: MENU_READ_FROM_HERE, title: 'Read aloud from here', contexts: ['selection'] });
      browser.contextMenus.create({ id: MENU_PODCAST, title: 'Make a podcast from this page…', contexts: ['page'] });
      browser.contextMenus.create({ id: MENU_SUMMARIZE, title: 'Summarize this page aloud', contexts: ['page'] });
    });
  });

  // Opt-in article detection: keep the all-sites content script in step with the setting
  // and the permission (the user can revoke it from the browser's extension settings).
  void syncAutoDetect();
  autoDetectItem.watch(() => void syncAutoDetect());
  browser.permissions.onAdded.addListener(() => void syncAutoDetect());
  browser.permissions.onRemoved.addListener(() => void syncAutoDetect());

  browser.action.onClicked.addListener((tab) => void sendCommand(tab.id, 'toggle'));

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_READ_PAGE) void sendCommand(tab?.id, 'read-page');
    if (info.menuItemId === MENU_READ_FROM_HERE) void sendCommand(tab?.id, 'read-from-selection');
    if (info.menuItemId === MENU_PODCAST) void sendCommand(tab?.id, 'podcast');
    if (info.menuItemId === MENU_SUMMARIZE) void sendCommand(tab?.id, 'summarize');
  });

  browser.commands.onCommand.addListener(async (command, tab) => {
    const map: Record<string, PlayerCommand> = { 'toggle-reading': 'toggle', 'next-sentence': 'next', 'prev-sentence': 'prev' };
    const cmd = map[command];
    if (!cmd) return;
    const tabId = tab?.id ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    void sendCommand(tabId, cmd);
  });

  let playingTab: number | undefined;

  browser.runtime.onMessage.addListener((raw, sender) => {
    const msg = raw as ToBackground;
    const tabId = sender.tab?.id;
    if (msg.type === 'readerable' && tabId != null) setBadge(tabId, msg.value);
    if (msg.type === 'playing' && tabId != null) {
      if (playingTab != null && playingTab !== tabId) notifyTab(playingTab, 'pause');
      playingTab = tabId;
    }
    if (msg.type === 'open-options') void browser.runtime.openOptionsPage();
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === TTS_PORT) handleTtsPort(port);
  });
});

/** A user action on a tab (activeTab is granted): inject the content script if needed, then send. */
async function sendCommand(tabId: number | undefined, command: PlayerCommand) {
  if (tabId == null) return;
  if (!(await ensureInjected(tabId))) return;
  notifyTab(tabId, command);
}

/** Message a tab that may or may not have the content script; no injection. */
function notifyTab(tabId: number, command: PlayerCommand) {
  browser.tabs.sendMessage(tabId, { type: 'command', command } satisfies ToContent).catch(() => undefined);
}

function setBadge(tabId: number, readerable: boolean) {
  void browser.action.setBadgeText({ tabId, text: readerable ? '•' : '' }).catch(() => undefined);
  void browser.action.setBadgeBackgroundColor({ tabId, color: '#b4532a' }).catch(() => undefined);
  void browser.action
    .setTitle({ tabId, title: readerable ? 'Read Aloud: article detected (click to read)' : 'Read Aloud' })
    .catch(() => undefined);
}

// ---- Synthesis queue -------------------------------------------------------

interface Job {
  port: Browser.runtime.Port;
  id: number;
  text: string;
  voice: VoiceSettings;
}

const queue: Job[] = [];
let inflight = 0;

function handleTtsPort(port: Browser.runtime.Port) {
  let open = true;
  port.onDisconnect.addListener(() => {
    open = false;
    // Drop this tab's queued (not yet sent) jobs.
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i]!.port === port) queue.splice(i, 1);
  });
  port.onMessage.addListener((raw) => {
    const msg = raw as TtsPortRequest;
    if (msg.type === 'cancel') {
      const i = queue.findIndex((j) => j.port === port && j.id === msg.id);
      if (i >= 0) {
        queue.splice(i, 1);
        reply(port, { type: 'error', id: msg.id, message: 'cancelled', cancelled: true });
      }
      return;
    }
    if (msg.type === 'synthesize' && open) void serve({ port, id: msg.id, text: msg.text, voice: msg.voice });
    if (msg.type === 'script' && open) void writeScript(port, msg.id, msg.request, msg.cacheKey, msg.cacheOnly);
    if (msg.type === 'summary' && open) void writeSummary(port, msg.id, msg.request, msg.cacheKey, msg.cacheOnly);
  });
}

async function serve(job: Job) {
  // Cache hits skip the queue entirely.
  try {
    const key = await cacheKey({ ...job.voice, lang: LANG, text: job.text });
    const hit = await cacheGet(key);
    if (hit) {
      void recordUsage(job.text.length, true);
      reply(job.port, { type: 'audio', id: job.id, base64: bytesToBase64(hit.bytes), mime: hit.mime, cached: true });
      return;
    }
  } catch (e) {
    console.warn('[readaloud] cache read failed', e);
  }
  queue.push(job);
  pump();
}

function pump() {
  while (inflight < MAX_INFLIGHT && queue.length) {
    const job = queue.shift()!;
    inflight++;
    void run(job).finally(() => {
      inflight--;
      pump();
    });
  }
}

async function run(job: Job) {
  try {
    const apiKey = await apiKeyItem.getValue();
    if (!apiKey) throw new SarvamError('Add your Sarvam API key in the extension settings.', 401);
    const transport = await transportItem.getValue();
    const req = { text: job.text, ...job.voice, transport, languageCode: LANG };
    const result = await withRetry(() => synthesize(apiKey, req));
    reply(job.port, { type: 'audio', id: job.id, base64: bytesToBase64(result.audio), mime: result.mime, cached: false });
    void recordUsage(job.text.length, false);
    const key = await cacheKey({ ...job.voice, lang: LANG, text: job.text });
    const limit = (await cacheLimitMbItem.getValue()) * 1024 * 1024;
    await cachePut(key, result.audio, result.mime, limit).catch((e) => console.warn('[readaloud] cache write failed', e));
  } catch (e) {
    reply(job.port, {
      type: 'error',
      id: job.id,
      message: e instanceof Error ? e.message : String(e),
      status: e instanceof SarvamError ? e.status : undefined,
    });
  }
}

/** Retries rate limits, server errors and network failures with backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const status = e instanceof SarvamError ? e.status : 0;
      const retryable = status === 0 || status === 429 || status >= 500;
      if (!retryable || i >= attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
}

// ---- Podcast scripts and summaries (Sarvam-105B), cached by request ---------

const MAX_SCRIPTS = 30;
const scriptsItem = storage.defineItem<Record<string, { script: PodcastScript; at: number }>>('local:podcastScripts', {
  fallback: {},
});
const MAX_SUMMARIES = 50;
const summariesItem = storage.defineItem<Record<string, { summary: Summary; at: number }>>('local:summaries', {
  fallback: {},
});

function writeScript(port: Browser.runtime.Port, id: number, request: ScriptRequest, key: string, cacheOnly = false) {
  return writeCached(port, id, key, cacheOnly, {
    read: async (k) => (await scriptsItem.getValue())[k]?.script,
    generate: (apiKey) => generateScript(apiKey, request),
    reply: (script, cached) => ({ type: 'script', id, script, cached }),
    write: async (script) => {
      const all = { ...(await scriptsItem.getValue()), [key]: { script, at: Date.now() } };
      await scriptsItem.setValue(newest(all, MAX_SCRIPTS));
    },
  });
}

function writeSummary(port: Browser.runtime.Port, id: number, request: SummaryRequest, key: string, cacheOnly = false) {
  return writeCached(port, id, key, cacheOnly, {
    read: async (k) => (await summariesItem.getValue())[k]?.summary,
    generate: (apiKey) => generateSummary(apiKey, request),
    reply: (summary, cached) => ({ type: 'summary', id, summary, cached }),
    write: async (summary) => {
      const all = { ...(await summariesItem.getValue()), [key]: { summary, at: Date.now() } };
      await summariesItem.setValue(newest(all, MAX_SUMMARIES));
    },
  });
}

async function writeCached<T>(
  port: Browser.runtime.Port,
  id: number,
  key: string,
  cacheOnly: boolean,
  io: {
    read(key: string): Promise<T | undefined>;
    generate(apiKey: string): Promise<T>;
    reply(value: T, cached: boolean): TtsPortResponse;
    write(value: T): Promise<void>;
  },
) {
  try {
    const cached = await io.read(key);
    if (cached) {
      reply(port, io.reply(cached, true));
      return;
    }
    if (cacheOnly) {
      reply(port, { type: 'error', id, message: 'not cached', status: 404 });
      return;
    }
    const apiKey = await apiKeyItem.getValue();
    if (!apiKey) throw new SarvamError('Add your Sarvam API key in the extension settings.', 401);
    const value = await withRetry(() => io.generate(apiKey), 2);
    reply(port, io.reply(value, false));
    await io.write(value);
  } catch (e) {
    reply(port, {
      type: 'error',
      id,
      message: e instanceof Error ? e.message : String(e),
      status: e instanceof SarvamError ? e.status : undefined,
    });
  }
}

/** Keep the `max` most recent entries. */
function newest<T extends { at: number }>(all: Record<string, T>, max: number): Record<string, T> {
  const keys = Object.keys(all).sort((a, b) => all[b]!.at - all[a]!.at);
  for (const k of keys.slice(max)) delete all[k];
  return all;
}

function reply(port: Browser.runtime.Port, msg: TtsPortResponse) {
  try {
    port.postMessage(msg);
  } catch {
    // Tab went away.
  }
}
