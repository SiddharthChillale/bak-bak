import { browser } from '#imports';
import { cacheClear, cacheStats, evict } from '@/lib/cache';
import { ALL_SITES } from '@/lib/inject';
import { VOICE_LAB } from '@/lib/features';
import { synthesize, type SarvamModel, type Transport } from '@/lib/sarvam';
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
import { formatInr, monthKey, recordUsage, usageItem } from '@/lib/usage';
import { DEFAULT_VOICE, READING_SHORTLIST, prettyVoice, voicesFor } from '@/lib/voices';
import { initVoiceLab } from './voice-lab';
import { segmented, syncWidgets, voiceMenu } from './widgets';

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

// ---- widgets -------------------------------------------------------------

// The pace options never change, so fill them before the segmented control is built.
pace.replaceChildren(...SPEED_STEPS.map((p) => new Option(`${p}×`, String(p))));

const SAMPLE = 'The quiet return of the night train. Across Europe, sleeper services are filling up again.';
let previewAudio: HTMLAudioElement | null = null;
async function previewVoice(voiceId: string) {
  previewAudio?.pause();
  if (!apiKey.value.trim()) {
    saved.textContent = 'Add your Sarvam API key to preview voices.';
    return;
  }
  saved.textContent = 'Loading preview…';
  try {
    const result = await synthesize(apiKey.value.trim(), {
      text: SAMPLE,
      model: model.value as SarvamModel,
      speaker: voiceId,
      transport: transport.value as Transport,
      pace: Number(pace.value) || 1,
    });
    void recordUsage(SAMPLE.length, false);
    previewAudio = new Audio(URL.createObjectURL(new Blob([result.audio as BlobPart], { type: result.mime })));
    await previewAudio.play();
    saved.textContent = 'Playing preview';
  } catch (e) {
    saved.textContent = (e as Error).message;
  }
}

segmented(model, $('modelSeg'), { mono: true });
segmented(pace, $('paceSeg'), { accent: true });
segmented(transport, $('transportSeg'));
segmented(podcastLength, $('lengthSeg'));
voiceMenu(voice, $('voiceMenu'), { onPreview: previewVoice });
voiceMenu(hostA, $('hostAMenu'), { card: { caption: 'Host 1 · lead', tone: 'a' }, onPreview: previewVoice });
voiceMenu(hostB, $('hostBMenu'), { card: { caption: 'Host 2 · co-host', tone: 'b' }, onPreview: previewVoice });

const keyInput = apiKey;
$('toggleKey').addEventListener('click', () => {
  const show = keyInput.type === 'password';
  keyInput.type = show ? 'text' : 'password';
  $('toggleKey').textContent = show ? 'Hide' : 'Show';
});
function refreshKeyState() {
  const has = apiKey.value.trim().length > 0;
  $('keyBadge').classList.toggle('off', !has);
  $('keyBadgeText').textContent = has ? 'Key saved' : 'No key yet';
  $('step1').classList.toggle('done', has);
}
apiKey.addEventListener('input', refreshKeyState);

const prefetchInput = prefInputs.prefetch;
function refreshPrefetch() {
  $('preVal').textContent = prefetchInput.value;
}
for (const [id, d] of [['preDec', -1], ['preInc', 1]] as const) {
  $(id).addEventListener('click', () => {
    prefetchInput.value = String(Math.min(5, Math.max(0, (Number(prefetchInput.value) || 0) + d)));
    refreshPrefetch();
    prefetchInput.dispatchEvent(new Event('change'));
  });
}

// Sidebar: the highlight follows the section in view.
const navLinks = [...document.querySelectorAll<HTMLAnchorElement>('nav a')];
function setNav(i: number) {
  navLinks.forEach((a, j) => a.classList.toggle('on', j === i));
  $('navThumb').style.top = `${i * 36}px`;
}
const navTargets = () => navLinks.map((a) => document.getElementById(a.hash.slice(1))!);
function spy() {
  const targets = navTargets();
  let active = 0;
  targets.forEach((t, i) => {
    if (t && !t.hidden && t.getBoundingClientRect().top <= window.innerHeight * 0.35) active = i;
  });
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) active = targets.reduce((n, t, i) => (t ? i : n), 0);
  setNav(active);
}
window.addEventListener('scroll', spy, { passive: true });
setNav(0);

function fillVoices(m: SarvamModel, selected?: string) {
  const list = voicesFor(m);
  const shortlist = new Set(READING_SHORTLIST[m]);
  voice.replaceChildren(
    ...[...list]
      .sort((a, b) => Number(shortlist.has(b)) - Number(shortlist.has(a)) || a.localeCompare(b))
      .map((v) => new Option(`${shortlist.has(v) ? '★ ' : ''}${prettyVoice(v)}`, v)),
  );
  voice.value = selected && list.includes(selected) ? selected : DEFAULT_VOICE[m];
  syncWidgets();
}

async function fillHosts() {
  const m = model.value as SarvamModel;
  const prefs = await getPodcastPrefs();
  for (const [sel, id] of [[hostA, prefs.hosts[m].A], [hostB, prefs.hosts[m].B]] as const) {
    sel.replaceChildren(new Option('Choose a voice…', ''), ...voicesFor(m).map((v) => new Option(prettyVoice(v), v)));
    sel.value = id;
  }
  podcastLength.value = prefs.length;
  syncWidgets();
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
  refreshKeyState();
  refreshPrefetch();
  syncWidgets();
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
voiceItem.watch((v) => { voice.value = v; syncWidgets(); });
paceItem.watch((p) => { pace.value = String(p); syncWidgets(); });

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
    statEl(formatInr(usage.billedChars), 'Estimated spend'),
    statEl(usage.billedChars.toLocaleString(), 'Characters billed'),
    statEl(usage.requests.toLocaleString(), 'Sarvam requests'),
    statEl(usage.cachedChars.toLocaleString(), 'Served from cache'),
  );
  const limitMb = num(cacheLimit, 20, 2000, 200);
  const mb = stats.bytes / 1024 / 1024;
  $('month').textContent = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  $('cacheStats').textContent = `${stats.entries.toLocaleString()} sentences · ${mb.toFixed(1)} MB of ${limitMb} MB`;
  $('cacheBar').style.width = `${Math.min(100, (mb / limitMb) * 100)}%`;
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
  else {
    $('voiceLab').remove();
    $('navLab').remove();
  }
});
