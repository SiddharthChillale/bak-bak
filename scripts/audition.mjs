#!/usr/bin/env node
// Render a sample passage with several Sarvam voices into ./auditions/*.mp3 so they
// can be compared side by side, and print REST-vs-stream timings.
//
//   SARVAM_API_KEY=… pnpm audition                       # reading shortlist, bulbul:v4-flash
//   SARVAM_API_KEY=… pnpm audition --model bulbul:v3
//   SARVAM_API_KEY=… pnpm audition --voices shubh_en_narration,simran_en_narration
//
// Cost: about ₹30 per 10k characters, so the default run (~12 voices × ~230 chars) is roughly ₹8.

import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const SHORTLIST = {
  'bulbul:v4-flash': [
    'shubh_en_narration', 'shubh_en_audiobook', 'shubh_en_narration_gentle',
    'simran_en_narration', 'sarang_en_narration', 'girish_en_documentary',
    'aditi_en_stories', 'chandrika_en_stories', 'ishita_en_stories',
    'roopa_en_conversational', 'zarina_en_conversation', 'deven_en_conversation',
  ],
  'bulbul:v3': ['shubh', 'priya', 'aditya', 'ritu', 'kavya', 'rahul', 'simran', 'anand'],
};

const SAMPLE =
  'The monsoon arrived early this year, and with it came a quiet relief across the city. ' +
  'Shopkeepers rolled up their shutters at 7:30 a.m., chai stalls filled up by eight, and the ' +
  'traffic on MG Road was, for once, almost bearable.';

const { values } = parseArgs({
  options: {
    model: { type: 'string', default: 'bulbul:v4-flash' },
    voices: { type: 'string' },
    text: { type: 'string', default: SAMPLE },
    out: { type: 'string', default: 'auditions' },
  },
});

const apiKey = process.env.SARVAM_API_KEY;
if (!apiKey) {
  console.error('Set SARVAM_API_KEY in the environment.');
  process.exit(1);
}
const voices = values.voices?.split(',').map((v) => v.trim()) ?? SHORTLIST[values.model];
if (!voices) {
  console.error(`Unknown model ${values.model}; pass --voices explicitly.`);
  process.exit(1);
}

async function synth(speaker, transport) {
  const t0 = performance.now();
  const res = await fetch(
    `https://api.sarvam.ai/text-to-speech${transport === 'stream' ? '/stream' : ''}`,
    {
      method: 'POST',
      headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: values.text,
        language_code: 'en-IN',
        model: values.model,
        speaker,
        speech_sample_rate: 24000,
        output_audio_codec: 'mp3',
      }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  let firstByte = -1;
  let audio;
  if (transport === 'stream') {
    const chunks = [];
    for await (const chunk of res.body) {
      if (firstByte < 0) firstByte = performance.now() - t0;
      chunks.push(chunk);
    }
    audio = Buffer.concat(chunks);
  } else {
    const json = await res.json();
    firstByte = performance.now() - t0;
    audio = Buffer.concat(json.audios.map((b) => Buffer.from(b, 'base64')));
  }
  return { audio, firstByte, total: performance.now() - t0 };
}

await mkdir(values.out, { recursive: true });
console.log(`${values.model} · ${values.text.length} chars · ${voices.length} voices\n`);
const rows = [];
for (const v of voices) {
  try {
    const s = await synth(v, 'stream');
    const file = `${values.out}/${values.model.replace(':', '_')}__${v}.mp3`;
    await writeFile(file, s.audio);
    rows.push({ voice: v, firstByteMs: Math.round(s.firstByte), totalMs: Math.round(s.total), kb: Math.round(s.audio.length / 1024), file });
  } catch (e) {
    rows.push({ voice: v, error: e.message });
  }
}
console.table(rows);

// One REST call with the first voice for a transport comparison.
try {
  const r = await synth(voices[0], 'rest');
  console.log(`\nREST (${voices[0]}): body ${Math.round(r.firstByte)} ms, total ${Math.round(r.total)} ms`);
} catch (e) {
  console.log(`\nREST comparison failed: ${e.message}`);
}
