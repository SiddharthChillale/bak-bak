import { browser } from '#imports';
import { SarvamError, bytesToBase64, synthesize } from '@/lib/sarvam';
import { TTS_PORT, type SpeakCommand, type TtsPortRequest, type TtsPortResponse } from '@/lib/messages';
import { apiKeyItem, modelItem, paceItem, transportItem, voiceItem } from '@/lib/settings';

const MENU_READ_SELECTION = 'spike-read-selection';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: MENU_READ_SELECTION,
      title: 'Read selection aloud (spike)',
      contexts: ['selection'],
    });
  });

  browser.action.onClicked.addListener((tab) => {
    if (tab.id == null) return;
    browser.tabs
      .sendMessage(tab.id, { type: 'toggle-panel' })
      .catch((e) => console.warn('[spike] no content script', e));
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_READ_SELECTION || tab?.id == null) return;
    const msg: SpeakCommand = { type: 'speak', text: info.selectionText, trigger: 'context-menu' };
    browser.tabs.sendMessage(tab.id, msg).catch((e) => console.warn('[spike] no content script', e));
  });

  browser.commands.onCommand.addListener(async (command, tab) => {
    if (command !== 'spike-speak') return;
    const tabId = tab?.id ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (tabId == null) return;
    const msg: SpeakCommand = { type: 'speak', trigger: 'command' };
    browser.tabs.sendMessage(tabId, msg).catch((e) => console.warn('[spike] no content script', e));
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== TTS_PORT) return;
    const inflight = new Map<number, AbortController>();
    port.onDisconnect.addListener(() => inflight.forEach((c) => c.abort()));

    port.onMessage.addListener(async (raw) => {
      const msg = raw as TtsPortRequest;
      if (msg.type !== 'synthesize') return;
      const ctrl = new AbortController();
      inflight.set(msg.id, ctrl);
      let reply: TtsPortResponse;
      try {
        const apiKey = await apiKeyItem.getValue();
        if (!apiKey) throw new Error('No Sarvam API key set. Open the extension options to add one.');
        const [model, speaker, transport, pace] = await Promise.all([
          modelItem.getValue(),
          voiceItem.getValue(),
          transportItem.getValue(),
          paceItem.getValue(),
        ]);
        const req = { text: msg.text, model, speaker, transport, pace, ...msg.overrides };
        const result = await synthesize(apiKey, req, ctrl.signal);
        reply = {
          type: 'audio',
          id: msg.id,
          base64: bytesToBase64(result.audio),
          mime: result.mime,
          timings: result.timings,
          speaker: req.speaker,
          model: req.model,
        };
      } catch (e) {
        reply = {
          type: 'error',
          id: msg.id,
          message: e instanceof Error ? e.message : String(e),
          status: e instanceof SarvamError ? e.status : undefined,
        };
      } finally {
        inflight.delete(msg.id);
      }
      try {
        port.postMessage(reply);
      } catch {
        // Port closed (tab navigated away); nothing to deliver.
      }
    });
  });
});
