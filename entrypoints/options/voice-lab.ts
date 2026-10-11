// Voice lab: sample playback, voice audition and latency test, in every Bulbul language. Only
// included when the VOICE_LAB build flag is on (see lib/features.ts); otherwise tree-shaken out.
import { synthesize, type SarvamModel, type SynthResult, type Transport } from '@/lib/sarvam';
import { INR_PER_CHAR, recordUsage } from '@/lib/usage';
import {
  LANGUAGES,
  labLanguages,
  labShortlist,
  labVoices,
  prettyVoice,
  speakerAcrossLanguages,
  type LabLanguage,
} from '@/lib/voices';
import { syncWidgets, voiceMenu } from './widgets';

/** Default lab text per language; English comes from the textarea in index.html. */
const SAMPLES: Record<Exclude<LabLanguage, 'en'>, string> = {
  hi: 'इस साल मानसून जल्दी आ गया, और उसके साथ पूरे शहर में एक सुकून छा गया। सुबह साढ़े सात बजे दुकानें खुल गईं, और आठ बजे तक चाय की टपरियाँ भर गईं।',
  enhi: 'इस साल monsoon थोड़ा जल्दी आ गया, और honestly पूरे city में एक relief सा feel हो रहा है। सुबह 7:30 तक shops खुल गई थीं, और chai stalls भी full थे।',
  bn: 'এ বছর বর্ষা একটু আগেই এসেছে, আর তার সঙ্গে পুরো শহরে একটা শান্ত স্বস্তি নেমে এসেছে। সকাল সাড়ে সাতটায় দোকান খুলে গেল, আর আটটার মধ্যেই চায়ের দোকানগুলো ভরে উঠল।',
  gu: 'આ વર્ષે ચોમાસું વહેલું આવ્યું, અને તેની સાથે આખા શહેરમાં એક શાંત રાહત ફેલાઈ ગઈ. સવારે સાડા સાત વાગ્યે દુકાનો ખુલી ગઈ, અને આઠ વાગ્યા સુધીમાં ચાની લારીઓ ભરાઈ ગઈ.',
  kn: 'ಈ ವರ್ಷ ಮುಂಗಾರು ಬೇಗನೆ ಬಂದಿತು, ಅದರೊಂದಿಗೆ ಇಡೀ ನಗರದಲ್ಲಿ ಒಂದು ಶಾಂತ ನೆಮ್ಮದಿ ಮೂಡಿತು. ಬೆಳಿಗ್ಗೆ ಏಳೂವರೆಗೆ ಅಂಗಡಿಗಳು ತೆರೆದವು, ಎಂಟು ಗಂಟೆಯ ಹೊತ್ತಿಗೆ ಚಹಾ ಅಂಗಡಿಗಳು ತುಂಬಿದ್ದವು.',
  ml: 'ഈ വർഷം മൺസൂൺ നേരത്തെ എത്തി, അതോടൊപ്പം നഗരം മുഴുവൻ ഒരു ശാന്തമായ ആശ്വാസം പടർന്നു. രാവിലെ ഏഴരയ്ക്ക് കടകൾ തുറന്നു, എട്ടുമണിയോടെ ചായക്കടകൾ നിറഞ്ഞു.',
  mr: 'यंदा पावसाळा लवकर आला, आणि त्याच्यासोबत संपूर्ण शहरात एक शांत दिलासा पसरला. सकाळी साडेसात वाजता दुकाने उघडली, आणि आठ वाजेपर्यंत चहाच्या टपऱ्या भरल्या.',
  od: 'ଏ ବର୍ଷ ମୌସୁମୀ ଶୀଘ୍ର ଆସିଲା, ଆଉ ତା ସହିତ ସାରା ସହରରେ ଏକ ଶାନ୍ତ ଆଶ୍ୱସ୍ତି ଖେଳିଗଲା। ସକାଳ ସାଢ଼େ ସାତଟାରେ ଦୋକାନ ଖୋଲିଲା, ଏବଂ ଆଠଟା ସୁଦ୍ଧା ଚା ଦୋକାନ ଭରିଗଲା।',
  pa: 'ਇਸ ਸਾਲ ਮਾਨਸੂਨ ਜਲਦੀ ਆ ਗਿਆ, ਅਤੇ ਉਸ ਦੇ ਨਾਲ ਪੂਰੇ ਸ਼ਹਿਰ ਵਿੱਚ ਇੱਕ ਸ਼ਾਂਤ ਰਾਹਤ ਫੈਲ ਗਈ। ਸਵੇਰੇ ਸਾਢੇ ਸੱਤ ਵਜੇ ਦੁਕਾਨਾਂ ਖੁੱਲ੍ਹ ਗਈਆਂ, ਅਤੇ ਅੱਠ ਵਜੇ ਤੱਕ ਚਾਹ ਦੇ ਖੋਖੇ ਭਰ ਗਏ।',
  ta: 'இந்த ஆண்டு பருவமழை சீக்கிரமே வந்தது, அதனுடன் நகரம் முழுவதும் ஒரு அமைதியான நிம்மதி பரவியது. காலை ஏழரை மணிக்கு கடைகள் திறந்தன, எட்டு மணிக்குள் டீக்கடைகள் நிரம்பின.',
  te: 'ఈ సంవత్సరం వర్షాకాలం త్వరగా వచ్చింది, దానితో పాటు నగరమంతా ఒక ప్రశాంతమైన ఊరట వ్యాపించింది. ఉదయం ఏడున్నరకు దుకాణాలు తెరుచుకున్నాయి, ఎనిమిది గంటలకల్లా టీ కొట్లు నిండిపోయాయి.',
};

export interface VoiceLabControls {
  apiKey: HTMLInputElement;
  model: HTMLSelectElement;
  voice: HTMLSelectElement;
  transport: HTMLSelectElement;
  pace: HTMLSelectElement;
  saved: HTMLElement;
}

type Take = { voice: string; lang: LabLanguage; text: string };

export function initVoiceLab({ apiKey, model, voice, transport, pace, saved }: VoiceLabControls) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const sample = $<HTMLTextAreaElement>('sample');
  const results = $<HTMLTableSectionElement>('results');
  const cost = $<HTMLElement>('cost');
  const langs = $<HTMLElement>('labLangs');
  const langHint = $<HTMLElement>('labLangHint');
  const labVoice = $<HTMLSelectElement>('labVoice');
  const buttons = ['play', 'audition', 'everyLang', 'latency'].map((id) => $<HTMLButtonElement>(id));

  const sampleFor = (l: LabLanguage) => (l === 'en' ? sample.defaultValue : SAMPLES[l]);
  const currentModel = () => model.value as SarvamModel;
  let lang: LabLanguage = 'en';
  let current: HTMLAudioElement | null = null;
  let cancelled = false;

  function renderLanguages() {
    const m = currentModel();
    const available = labLanguages(m);
    if (!available.includes(lang)) setLanguage('en');
    langs.replaceChildren(
      ...available.map((l) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-pressed', String(l === lang));
        b.title = `${LANGUAGES[l].name} · ${LANGUAGES[l].code}`;
        b.append(LANGUAGES[l].native, Object.assign(document.createElement('small'), { textContent: String(labVoices(m, l).length) }));
        b.addEventListener('click', () => setLanguage(l));
        return b;
      }),
    );
    const { name, code } = LANGUAGES[lang];
    const count = labVoices(m, lang).length;
    langHint.textContent = `${name} · language_code ${code} · ${count} voice${count === 1 ? '' : 's'}`;
  }

  function fillVoices(preferred?: string) {
    const m = currentModel();
    const list = labVoices(m, lang);
    const shortlist = new Set(labShortlist(m, lang));
    const keep = preferred ?? labVoice.value;
    labVoice.replaceChildren(
      ...[...list]
        .sort((a, b) => Number(shortlist.has(b)) - Number(shortlist.has(a)) || a.localeCompare(b))
        .map((v) => new Option(`${shortlist.has(v) ? '★ ' : ''}${prettyVoice(v)}`, v)),
    );
    labVoice.value = list.includes(keep) ? keep : (labShortlist(m, lang)[0] ?? list[0] ?? '');
    syncWidgets();
  }

  function setLanguage(next: LabLanguage) {
    // Swap the sample text unless the user has written their own.
    const t = sample.value.trim();
    if (!t || t === sampleFor(lang).trim()) sample.value = sampleFor(next);
    lang = next;
    renderLanguages();
    fillVoices();
    updateCost();
  }

  function everyLanguageTakes(): Take[] {
    // Each language gets its own built-in sample; the textarea is in one language only.
    return speakerAcrossLanguages(currentModel(), labVoice.value).map(({ lang: l, voice: v }) => ({
      voice: v,
      lang: l,
      text: l === lang ? sample.value.trim() : sampleFor(l),
    }));
  }

  function updateCost() {
    const n = sample.value.trim().length;
    const shortlist = labShortlist(currentModel(), lang).length;
    const every = everyLanguageTakes().reduce((sum, t) => sum + t.text.length, 0);
    const inr = (chars: number) => `₹${(chars * INR_PER_CHAR).toFixed(2)}`;
    cost.textContent =
      `${n} chars ≈ ${inr(n)} per play · audition ≈ ${inr(n * shortlist)} · ` +
      `every language ≈ ${inr(every)} · latency test ≈ ${inr(n * 6)}`;
  }

  async function run(take: Take, t: Transport): Promise<{ row: HTMLTableRowElement; result?: SynthResult }> {
    const row = results.insertRow(0);
    const head = () => {
      row.replaceChildren();
      for (const text of [take.voice, LANGUAGES[take.lang].name, t]) row.insertCell().textContent = text;
    };
    head();
    Object.assign(row.insertCell(), { colSpan: 5, textContent: '…' });
    try {
      const result = await synthesize(apiKey.value.trim(), {
        text: take.text,
        model: currentModel(),
        speaker: take.voice,
        transport: t,
        pace: Number(pace.value) || 1,
        languageCode: LANGUAGES[take.lang].code,
      });
      void recordUsage(take.text.length, false);
      const { headersMs, firstByteMs, totalMs, bytes } = result.timings;
      head();
      for (const ms of [headersMs, firstByteMs, totalMs]) row.insertCell().textContent = `${Math.round(ms)} ms`;
      row.insertCell().textContent = `${(bytes / 1024).toFixed(0)} KB`;
      const url = URL.createObjectURL(new Blob([result.audio as BlobPart], { type: result.mime }));
      const btn = row.insertCell().appendChild(Object.assign(document.createElement('button'), { textContent: '▶' }));
      btn.addEventListener('click', () => play(url, row));
      (row as HTMLTableRowElement & { audioUrl?: string }).audioUrl = url;
      return { row, result };
    } catch (e) {
      head();
      Object.assign(row.insertCell(), { colSpan: 5, className: 'err', textContent: (e as Error).message });
      return { row };
    }
  }

  function play(url: string, row: HTMLTableRowElement): Promise<void> {
    current?.pause();
    results.querySelectorAll('tr.playing').forEach((r) => r.classList.remove('playing'));
    row.classList.add('playing');
    const audio = new Audio(url);
    current = audio;
    return new Promise((resolve) => {
      const done = () => {
        row.classList.remove('playing');
        resolve();
      };
      audio.addEventListener('ended', done, { once: true });
      audio.addEventListener('pause', done, { once: true });
      audio.play().catch(done);
    });
  }

  async function guarded(fn: () => Promise<void>) {
    if (!apiKey.value.trim()) {
      apiKey.focus();
      saved.textContent = 'Add your Sarvam API key first.';
      return;
    }
    cancelled = false;
    buttons.forEach((b) => (b.disabled = true));
    try {
      await fn();
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  async function playOne(take: Take) {
    const { row } = await run(take, transport.value as Transport);
    const url = (row as HTMLTableRowElement & { audioUrl?: string }).audioUrl;
    if (url) await play(url, row);
  }

  /** Play takes in order, synthesizing the next one while the current one plays. */
  async function playAll(takes: Take[]) {
    const [first, ...rest] = takes;
    if (!first) return;
    let next = run(first, 'stream');
    for (let i = 0; i <= rest.length && !cancelled; i++) {
      const { row } = await next;
      const upcoming = rest[i];
      if (upcoming) next = run(upcoming, 'stream');
      const url = (row as HTMLTableRowElement & { audioUrl?: string }).audioUrl;
      if (url && !cancelled) await play(url, row);
    }
  }

  const take = (v: string): Take => ({ voice: v, lang, text: sample.value.trim() });

  voiceMenu(labVoice, $('labVoiceMenu'), { onPreview: (v) => guarded(() => playOne(take(v))) });

  $('play').addEventListener('click', () => guarded(() => playOne(take(labVoice.value))));

  $('audition').addEventListener('click', () =>
    guarded(() => playAll(labShortlist(currentModel(), lang).map(take))),
  );

  $('everyLang').addEventListener('click', () => guarded(() => playAll(everyLanguageTakes())));

  $('latency').addEventListener('click', () =>
    guarded(async () => {
      for (let i = 0; i < 3 && !cancelled; i++) {
        for (const t of ['rest', 'stream'] as const) await run(take(labVoice.value), t);
      }
    }),
  );

  $('stop').addEventListener('click', () => {
    cancelled = true;
    current?.pause();
  });

  model.addEventListener('change', () => {
    renderLanguages();
    fillVoices();
    updateCost();
  });
  labVoice.addEventListener('change', updateCost);
  sample.addEventListener('input', updateCost);
  renderLanguages();
  fillVoices(voice.value);
  updateCost();
  $('voiceLab').hidden = false;
}
