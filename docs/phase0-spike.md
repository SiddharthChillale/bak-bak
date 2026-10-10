# Phase 0 spike: how to run and what to record

The spike answers four questions before the real player gets built:

1. **Voice**: which Indian-English voice(s) sound best for long-form reading (v4-flash vs v3)?
2. **Latency**: REST vs HTTP-stream: time to first byte and total, for a ~230-char passage.
3. **Playback path**: does `<audio>` + blob URL work in the page on every site, or do strict page CSPs
   (`media-src`) force the Web Audio fallback?
4. **Autoplay**: does audio start when triggered from the context menu or `Alt+Shift+R` (no click in the page)?

## Setup

```bash
pnpm install
pnpm build            # Chrome  → .output/chrome-mv3
pnpm build:firefox    # Firefox → .output/firefox-mv3
pnpm build:safari     # Safari  → .output/safari-mv3
```

- **Chrome**: `chrome://extensions` → Developer mode → *Load unpacked* → `.output/chrome-mv3`.
  (Or `pnpm dev` to launch a throwaway Chrome profile with hot reload.)
- **Firefox**: `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → `.output/firefox-mv3/manifest.json`.
  (Or `pnpm dev:firefox`.) Firefox isn't installed on this Mac yet.
- **Safari 26**: Settings → Advanced → enable *Show features for web developers*; then Settings → Developer →
  *Add Temporary Extension…* → `.output/safari-mv3`. Re-add after every Safari restart. Then allow it on
  websites when Safari asks.

Then open the extension's **options page** (Voice Lab), paste the Sarvam API key, and pick model/voice.

## Tests

| # | Where | Steps |
|---|---|---|
| A | Voice Lab | *Audition reading shortlist* (≈ ₹8 for v4-flash). Note your top 2–3. Switch model to v3 and repeat (≈ ₹5). |
| B | Voice Lab | *Latency test* (6 calls, ≈ ₹4). Note median first byte / total for REST vs stream. |
| C | Any article page | Click the toolbar icon → spike panel. Select a paragraph → *Speak (&lt;audio&gt;)*, then *Speak (Web Audio)*. |
| D | Same page | Reload, **don't click the page**, select text by keyboard or use the context menu *Read selection aloud (spike)*. Note if it plays or reports *autoplay blocked*. Repeat with `Alt+Shift+R`. |
| E | Strict-CSP sites | Repeat C on github.com (a README), x.com or mail.google.com, and a news site. Note any *media error*. |

CLI alternative for A/B (no browser):

```bash
SARVAM_API_KEY=… pnpm audition                     # writes auditions/*.mp3
SARVAM_API_KEY=… pnpm audition --model bulbul:v3
```

## Results

| Test | Chrome | Firefox | Safari |
|---|---|---|---|
| C: `<audio>` blob plays | | | |
| C: Web Audio plays | | | |
| D: context menu autoplay | | | |
| D: keyboard command autoplay | | | |
| E: github.com `<audio>` | | | |
| E: other strict-CSP site | | | |

- Preferred voices:
- REST median first byte / total:
- Stream median first byte / total:
- Notes:
