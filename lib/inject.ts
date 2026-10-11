import { browser } from '#imports';
import { autoDetectItem } from './settings';

// The content script runs only where the user invokes the extension (activeTab), unless
// they opt in to automatic article detection on every site.

const SCRIPT = '/content-scripts/content.js';
const STYLE = '/content-scripts/content.css';
const AUTO_ID = 'readaloud-auto';
export const ALL_SITES = { origins: ['<all_urls>'] };

/** Make sure the content script is in the tab; returns false where extensions can't run. */
export async function ensureInjected(tabId: number): Promise<boolean> {
  try {
    if ((await browser.tabs.sendMessage(tabId, { type: 'ping' })) === 'pong') return true;
  } catch {
    // Not injected yet.
  }
  try {
    await browser.scripting.insertCSS({ target: { tabId }, files: [STYLE] });
    await browser.scripting.executeScript({ target: { tabId }, files: [SCRIPT] });
    return true;
  } catch (e) {
    // Browser pages, store pages, PDFs viewers…
    console.warn('[readaloud] cannot run on this page', e);
    return false;
  }
}

/** Register or unregister the all-sites content script to match the opt-in and the permission. */
export async function syncAutoDetect(): Promise<void> {
  const [wanted, granted] = await Promise.all([
    autoDetectItem.getValue(),
    browser.permissions.contains(ALL_SITES).catch(() => false),
  ]);
  const registered = await browser.scripting
    .getRegisteredContentScripts({ ids: [AUTO_ID] })
    .then((s) => s.length > 0)
    .catch(() => false);
  if (wanted && granted && !registered) {
    await browser.scripting
      .registerContentScripts([{ id: AUTO_ID, matches: ['<all_urls>'], js: [SCRIPT], css: [STYLE], runAt: 'document_idle' }])
      .catch((e) => console.warn('[readaloud] could not enable article detection', e));
  } else if ((!wanted || !granted) && registered) {
    await browser.scripting.unregisterContentScripts({ ids: [AUTO_ID] }).catch(() => undefined);
  }
}
