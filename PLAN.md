# Web Read-Aloud Extension — Plan (v2)

Status: Phase 0 spike in progress (see docs/phase0-spike.md) · revised 2026-10-10

## 1. Scope

A browser extension for **Chrome, Firefox and (if cheap) Safari** that:

1. Detects when the current page is article-like ("reader-able") and extracts the clean text.
2. Reads it aloud with **natural Indian-English voices from Sarvam AI (Bulbul)**: one engine, no local models.
3. Has playback controls and lets the user jump to any point in the text and continue from there.
4. *Later:* a "podcast mode" that turns the article into a two-host conversation.

Out of scope for now: local / on-device models, browser built-in voices, Indic-language UI.
Keep the engine interface small so another engine can be added later without rework.

Audience: personal use first; keep it store-ready (Chrome Web Store, Firefox Add-ons, maybe Mac App Store).

## 2. Research findings

### 2.1 Sarvam Bulbul (TTS)
- Models: **`bulbul:v4-flash`** (latest, recommended, 200+ persona voices, IDs like `simran_en_customer`,
  `<name>_<lang>_<style>`) and **`bulbul:v3`** (stable default, 30+ named speakers: shubh, priya, aditya, ritu…).
  Both support **`en-IN`** (Indian English). v4-flash also has `enhi` (Hinglish).
- Endpoints (base `https://api.sarvam.ai`, header `api-subscription-key`):
  - REST `POST /text-to-speech`: ≤2,500 chars; sample rates up to 48 kHz.
  - HTTP stream `POST /text-to-speech/stream`: ≤3,500 chars, returns raw audio bytes (e.g. `audio/mpeg`) as generated; ≤24 kHz.
  - WebSocket: for incremental text; not needed for reading fixed text.
- Useful params: `pace` 0.5–2.0, `temperature` (v3 expressiveness), `enable_preprocessing` (normalises
  English numbers/words), `output_audio_codec` (`mp3`), `dict_id` (pronunciation dictionary, v3).
- No SSML, **no word timestamps**, so highlighting is per sentence.
- **CORS is open** (`Access-Control-Allow-Origin: *`, allows the `api-subscription-key` header). Verified with a preflight on 2026-10-10.
- **Pricing**: Bulbul v3 costs ₹30 per 10k characters; new accounts get ₹100 of free credit; v4-flash price not listed.
  A 2,000-word article is about 12k chars, roughly **₹36 per article**, so the free credit covers about 3 articles.
  Avoiding paying twice for the same text (caching) is therefore a core feature, not polish.
- Sarvam also offers LLMs (**Sarvam-105B** and others) via an OpenAI-compatible chat API. Relevant to podcast mode.

### 2.2 Safari
- Safari supports MV3 Web Extensions; WXT can build a `safari` target.
- **Personal use**: Safari 26 → Settings → Developer → **"Add Temporary Extension…"** loads an unpacked
  folder with no Xcode needed, but it **is removed when Safari quits**. Persistent alternative: wrap with
  `xcrun safari-web-extension-packager` and run the Xcode-signed app locally.
- **Publishing**: must ship inside a Mac (and iOS) app via the App Store. Needs the Apple Developer Program
  ($99/yr). App Store Connect has a web-based packager that converts a ZIP, but reports of it working are mixed.
- API gaps that matter: **no `offscreen`, no `sidePanel`**. Background audio from a hidden context is
  unreliable. The design below avoids all of these. Prefer non-persistent `background.scripts` on
  Safari (service-worker background can't be debugged in Safari 26).
- Verdict: **supported, cheap to add**, as long as audio plays in the page (content script), not the background.

### 2.3 Google "web page → podcast" APIs
- **NotebookLM Enterprise Podcast API** (`discoveryengine.googleapis.com/v1/.../podcasts`): turns text into an MP3
  podcast of about 4–5 or about 10 minutes, input under 100k tokens. **Deprecated, and Google isn't allowlisting new customers.** Not usable.
- **Gemini API TTS** (`gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts`, older `gemini-3.1-flash-tts-preview`):
  native **multi-speaker (max 2 speakers)** in one request, style tags (`<laugh>`, pauses, backchannels),
  output 24 kHz PCM. Google's own sample: `gemini-3.8-flash` writes a two-host script, then the TTS model voices it.
  This is the DIY "NotebookLM-style" route. Indian-English accent isn't listed as a voice locale; would need testing.
- **Sarvam-native alternative**: Sarvam-105B writes the two-host script, then Bulbul voices each turn with two
  different `en-IN` voices, and we concatenate. Keeps one API key and authentic Indian voices; less natural
  overlap/backchannel than Gemini.

## 3. Architecture

The big simplification from dropping local models: **no offscreen document and no workers**. Audio plays in the
content script, which works the same in Chrome, Firefox and Safari.

```
┌─────────────── Content script (per tab) ────────────────┐
│ Readability detect/extract → Segmenter → Chunk planner  │
│ PlaybackController (state machine, queue, seek)         │
│ AudioPlayer (Web Audio only; decodes Sarvam MP3 bytes)  │
│ Highlighter (CSS Custom Highlight API, fallback spans)  │
│ Floating player UI (Shadow DOM) + click-to-seek         │
└───────────────▲─────────────────────────────────────────┘
                │ runtime.Port: synth requests / audio (base64)
┌───────────────┴─────────────────────────────────────────┐
│ Background (SW on Chrome; event page on FF/Safari)      │
│ SarvamClient (holds API key, retries, rate limit)       │
│ AudioCache (IndexedDB, key = hash(text,voice,model,pace))│
│ Context menu "Read from here", keyboard commands        │
└─────────────────────────────────────────────────────────┘
Options page: API key, model, voice (with preview), default speed, cache size/clear, usage meter.
Popup: open player, readerable status, quick voice/speed.
```

Why the API key and fetch live in the background even though CORS is open: the key never enters the page's
process, the page's CSP can't block requests, and caching is shared across tabs.

### 3.1 Text → chunks
- `isProbablyReaderable()` sets the action badge; `Readability.parse()` extracts the article on demand.
- Map the extracted text back to **DOM Ranges in the original page**, so we can highlight in place and the user
  can click any sentence on the real page. If mapping fails for a sentence, fall back to an overlay reader view.
- Sentences via `Intl.Segmenter`. **Chunk = 1–3 sentences, about 150–400 chars**: small enough for fast
  start and seeking, large enough for natural prosody. Hard cap well below 2,500.
- Text cleanup: strip footnote markers, expand/skip URLs, skip code blocks, optional image captions.
  Rely on `enable_preprocessing` for numbers.

### 3.2 Playback
- States: `idle → buffering → playing ⇄ paused → ended`, plus `error`.
- **Prefetch 2 chunks ahead** (cost-aware, configurable); `AbortController` cancels on seek or voice change.
- **Output path: Web Audio only** (`decodeAudioData` + `AudioBufferSourceNode`) in the content script; no
  `<audio>` element and no fallback. It only plays Sarvam's audio; there is no non-Sarvam voice.
  Spike finding (2026-10-10): `<audio>` with a `blob:` URL is blocked by strict page CSPs (media error code 4) on
  aws.amazon.com (CSP in a `<meta>` tag) and github.com (CSP header), while Web Audio decodes and plays the same bytes
  on those pages because no media URL is loaded. Web Audio also gives sample-accurate scheduling, so chunks play back-to-back
  without gaps and highlight timing is exact. Create/resume the `AudioContext` inside the user's click.
- **Speed**: buffer `playbackRate` would shift pitch, so speed uses Sarvam `pace` (natural, model-side). A speed
  change applies from the next chunk not yet synthesised (cache key includes pace). If instant speed change turns
  out to matter, add an offline JS time-stretch (WSOLA) on the decoded PCM; no AudioWorklet, since loading a worklet
  module is subject to page `script-src`.
- Highlight the current chunk; estimate the sentence within the chunk by character-proportional timing.
- Autoplay: playback starts from a click in our in-page player, so the click counts as page user activation.
  Context-menu or keyboard starts rely on sticky activation; verify in the spike.

### 3.3 Controls & "jump to point"
- Play/Pause, Stop, ◀︎ / ▶︎ sentence, ◀︎◀︎ / ▶︎▶︎ paragraph, speed (0.75–2×), voice, progress bar by chunk with
  hover preview, auto-scroll toggle, "N min left" estimate.
- Jump: **click any sentence** (click-to-seek mode), **select text → "Read from here"** (context menu),
  drag the progress bar, keyboard commands (`commands` API).
- Resume: remember the last chunk per URL.

### 3.4 Cost controls
- Persistent IndexedDB audio cache (re-listening and seeking backwards cost nothing), with an LRU size cap.
- Usage meter: characters sent this month and estimated ₹. Optional confirm prompt when an article is over N chars.
- Optionally try Sarvam's `enable_cached_responses` (beta).

## 4. Podcast mode (Phase 3)
1. Extract the article, then send it to an LLM with a prompt for a two-host script: JSON `[{speaker, text}]`, target length.
2. Voice each turn with that speaker's voice, reusing the same chunk/prefetch/cache pipeline.
3. Show the transcript in the player; jumping works per turn instead of per article sentence.

Engine choice to evaluate in a spike: **Sarvam (105B + Bulbul en-IN)** is the default because it gives Indian voices
and needs one key; **Gemini 3.8 Flash + Flash TTS** is the comparison (more conversational, 2-speaker native, accent unknown).

## 5. Tech stack
- **WXT** + TypeScript, targets `chrome`, `firefox`, `safari` (one codebase, per-browser manifests).
- `@mozilla/readability`; UI with Preact (small bundle inside Shadow DOM).
- Vitest for segmenter, chunk planner and controller; Playwright with the unpacked extension for Chrome E2E;
  `web-ext run` for Firefox.

## 6. Roadmap
**Phase 0: Spike (1–2 days)**
- Sarvam call from the background, audio sent to the content script, playback in Chrome, Firefox, Safari (temporary extension).
- Audition en-IN voices (v3 vs v4-flash), pick defaults; measure time-to-first-audio REST vs stream.
- Confirm autoplay behaviour for context-menu and keyboard starts.

**Phase 1: MVP (Chrome + Firefox)**
- Detection/extraction, segmentation and DOM mapping, Sarvam engine, cache, player UI, click-to-seek,
  "Read from here", keyboard commands, options page (key, voice, model).

**Phase 2: Safari + polish**
- Safari build and packager wrapper for persistent local install; resume position; usage meter; error UX (bad key,
  out of credits, 429s).

**Phase 3: Podcast mode** (section 4).

**Phase 4: Store readiness** (when it proves useful)
- Permissions: personal build uses `<all_urls>` content script (auto badge). Store build could switch to
  `activeTab` + `scripting` (inject on click) to avoid scary install warnings, at the cost of the auto badge.
- Privacy policy (page text is sent to Sarvam; key stored locally only), listing assets, AMO source submission,
  Apple Developer account if Safari.
- Distribution question: BYOK (user's own Sarvam key) vs. a hosted proxy with our key (needs billing/auth).

## 7. Risks
| Risk | Mitigation |
|---|---|
| Cost per article (~₹36) | Cache, limited prefetch, usage meter, long-article confirm |
| Readability misses or garbles content | "Read selection" fallback; overlay reader view |
| DOM mapping breaks on complex/SPA pages | Overlay reader fallback; re-extract on URL change |
| Autoplay blocked when started from menu/shortcut | Show "click to start" in player; verify in spike |
| Safari temporary extension resets on quit | Use packager + local signed build for daily use |
| No word timestamps | Sentence-level highlight via proportional timing |
| Page CSP blocks `blob:` media (confirmed on aws.amazon.com, github.com) | Web Audio playback only (no media URL) |
| Sarvam model/voice IDs change (v4 is new) | Fetch voice list at runtime; IDs in config, not code |
