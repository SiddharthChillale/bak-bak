import { browser } from '#imports';
import { cacheClear, cacheStats, evict } from '@/lib/cache';
import { ALL_SITES } from '@/lib/inject';
import { VOICE_LAB } from '@/lib/features';
import type { SarvamModel, Transport } from '@/lib/sarvam';
import {
  SPEED_STEPS,
  apiKeyItem,
  autoDetectItem,
  cacheLimitMbItem,
  getPodcastPrefs,
  getPrefs,
  podcastItem,
  modelItem,
  paceItem,
  prefsItem,
  transportItem,
  voiceItem,
  type ReadingPrefs,
} from '@/lib/settings';
import { formatInr, monthKey, usageItem } from '@/lib/usage';
import { DEFAULT_VOICE, READING_SHORTLIST, prettyVoice, voicesFor } from '@/lib/voices';
import { initVoiceLab } from './voice-lab';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const apiKey = $<HTMLInputElement>('apiKey');
const model = $<HTMLSelectElement>('model');
const voice = $<HTMLSelectElement>('voice');
const transport = $<HTMLSelectElement>('transport');
const pace = $<HTMLSelectElement>('pace');
const saved = $<HTMLElement>('saved');
const cacheLimit = $<HTMLInputElement>('cacheLimitMb');
const podcastLength = $<HTMLSelectElement>('podcastLength');
const hostA = $<HTMLSelectElement>('hostA');
const hostB = $<HTMLSelectElement>('hostB');
const prefInputs = {
  sentencePauseMs: $<HTMLInputElement>('sentencePauseMs'),
  paragraphPauseMs: $<HTMLInputElement>('paragraphPauseMs'),
  prefetch: $<HTMLInputElement>('prefetch'),
  confirmAboveChars: $<HTMLInputElement>('confirmAboveChars'),
  resume: $<HTMLInputElement>('resume'),
  autoscroll: $<HTMLInputElement>('autoscroll'),
  skipCode: $<HTMLInputElement>('skipCode'),
  skipTables: $<HTMLInputElement>('skipTables'),
  skipEmbeds: $<HTMLInputElement>('skipEmbeds'),
  skipCaptions: $<HTMLInputElement>('skipCaptions'),
};

function fillVoices(m: SarvamModel, selected?: string) {
  const list = voicesFor(m);
  const shortlist = new Set(READING_SHORTLIST[m]);
  voice.replaceChildren(
    ...[...list]
      .sort((a, b) => Number(shortlist.has(b)) - Number(shortlist.has(a)) || a.localeCompare(b))
      .map((v) => new Option(`${shortlist.has(v) ? '★ ' : ''}${prettyVoice(v)}`, v)),
  );
  voice.value = selected && list.includes(selected) ? selected : DEFAULT_VOICE[m];
}

async function fillHosts() {
  const m = model.value as SarvamModel;
  const prefs = await getPodcastPrefs();
  for (const [sel, id] of [[hostA, prefs.hosts[m].A], [hostB, prefs.hosts[m].B]] as const) {
    sel.replaceChildren(new Option('Choose a voice…', ''), ...voicesFor(m).map((v) => new Option(prettyVoice(v), v)));
    sel.value = id;
  }
  podcastLength.value = prefs.length;
}

async function savePodcast() {
  const prefs = await getPodcastPrefs();
  const m = model.value as SarvamModel;
  await podcastItem.setValue({
    length: podcastLength.value === 'standard' ? 'standard' : 'short',
    hosts: { ...prefs.hosts, [m]: { A: hostA.value, B: hostB.value } },
  });
  saved.textContent = hostA.value === hostB.value ? 'Pick two different voices for the hosts.' : `Saved ${new Date().toLocaleTimeString()}`;
}

for (const el of [podcastLength, hostA, hostB]) el.addEventListener('change', savePodcast);

const autoDetect = $<HTMLInputElement>('autoDetect');

async function refreshAutoDetect() {
  const granted = await browser.permissions.contains(ALL_SITES).catch(() => false);
  autoDetect.checked = granted && (await autoDetectItem.getValue());
}

autoDetect.addEventListener('change', async () => {
  if (autoDetect.checked) {
    // Must run inside the click: browsers only show the permission prompt for a user gesture.
    const granted = await browser.permissions.request(ALL_SITES).catch(() => false);
    await autoDetectItem.setValue(granted);
    saved.textContent = granted
      ? 'Article detection is on. It applies to pages you open or reload from now on.'
      : 'Permission was not granted, so article detection stays off.';
  } else {
    await autoDetectItem.setValue(false);
    await browser.permissions.remove(ALL_SITES).catch(() => false);
    saved.textContent = 'Article detection is off.';
  }
  await refreshAutoDetect();
});
browser.permissions.onRemoved?.addListener(() => void refreshAutoDetect());

async function load() {
  apiKey.value = await apiKeyItem.getValue();
  model.value = await modelItem.getValue();
  fillVoices(model.value as SarvamModel, await voiceItem.getValue());
  transport.value = await transportItem.getValue();
  pace.replaceChildren(...SPEED_STEPS.map((p) => new Option(`${p}×`, String(p))));
  pace.value = String(await paceItem.getValue());
  const prefs = await getPrefs();
  prefInputs.sentencePauseMs.value = String(prefs.sentencePauseMs);
  prefInputs.paragraphPauseMs.value = String(prefs.paragraphPauseMs);
  prefInputs.prefetch.value = String(prefs.prefetch);
  prefInputs.confirmAboveChars.value = String(prefs.confirmAboveChars);
  prefInputs.resume.checked = prefs.resume;
  prefInputs.autoscroll.checked = prefs.autoscroll;
  prefInputs.skipCode.checked = prefs.skipCode;
  prefInputs.skipTables.checked = prefs.skipTables;
  prefInputs.skipEmbeds.checked = prefs.skipEmbeds;
  prefInputs.skipCaptions.checked = prefs.skipCaptions;
  cacheLimit.value = String(await cacheLimitMbItem.getValue());
  await fillHosts();
  await refreshAutoDetect();
  void refreshStats();
}

const num = (el: HTMLInputElement, lo: number, hi: number, fallback: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : fallback));

async function save() {
  const prefs: ReadingPrefs = {
    sentencePauseMs: num(prefInputs.sentencePauseMs, 0, 2000, 150),
    paragraphPauseMs: num(prefInputs.paragraphPauseMs, 0, 3000, 450),
    prefetch: Math.round(num(prefInputs.prefetch, 0, 5, 2)),
    confirmAboveChars: Math.round(num(prefInputs.confirmAboveChars, 0, 500_000, 30_000)),
    resume: prefInputs.resume.checked,
    autoscroll: prefInputs.autoscroll.checked,
    skipCode: prefInputs.skipCode.checked,
    skipTables: prefInputs.skipTables.checked,
    skipEmbeds: prefInputs.skipEmbeds.checked,
    skipCaptions: prefInputs.skipCaptions.checked,
  };
  await Promise.all([
    apiKeyItem.setValue(apiKey.value.trim()),
    modelItem.setValue(model.value as SarvamModel),
    voiceItem.setValue(voice.value),
    transportItem.setValue(transport.value as Transport),
    paceItem.setValue(Number(pace.value) || 1),
    prefsItem.setValue(prefs),
    cacheLimitMbItem.setValue(num(cacheLimit, 20, 2000, 200)),
  ]);
  saved.textContent = `Saved ${new Date().toLocaleTimeString()}`;
}

model.addEventListener('change', () => {
  fillVoices(model.value as SarvamModel);
  void fillHosts();
});
for (const el of [apiKey, model, voice, transport, pace, cacheLimit, ...Object.values(prefInputs)]) {
  el.addEventListener('change', save);
}
// Keep in sync when the player bar changes voice/speed.
voiceItem.watch((v) => (voice.value = v));
paceItem.watch((p) => (pace.value = String(p)));

async function refreshStats() {
  const usage = (await usageItem.getValue())[monthKey()] ?? { billedChars: 0, requests: 0, cachedChars: 0 };
  const stats = await cacheStats().catch(() => ({ entries: 0, bytes: 0 }));
  const statEl = (value: string, label: string) => {
    const div = document.createElement('div');
    div.className = 'stat';
    div.append(Object.assign(document.createElement('b'), { textContent: value }), Object.assign(document.createElement('span'), { textContent: label }));
    return div;
  };
  $('usage').replaceChildren(
    statEl(formatInr(usage.billedChars), 'estimated spend this month'),
    statEl(usage.billedChars.toLocaleString(), 'characters billed this month'),
    statEl(usage.requests.toLocaleString(), 'Sarvam requests this month'),
    statEl(usage.cachedChars.toLocaleString(), 'characters served from cache'),
  );
  $('cacheStats').textContent = `${stats.entries.toLocaleString()} sentences cached · ${(stats.bytes / 1024 / 1024).toFixed(1)} MB`;
}

usageItem.watch(() => void refreshStats());
$('clearCache').addEventListener('click', async () => {
  await cacheClear();
  void refreshStats();
});
cacheLimit.addEventListener('change', async () => {
  await evict(num(cacheLimit, 20, 2000, 200) * 1024 * 1024);
  void refreshStats();
});

void load().then(() => {
  if (VOICE_LAB) initVoiceLab({ apiKey, model, voice, transport, pace, saved });
  else $('voiceLab').remove();
});
