# Read Aloud (Sarvam)

Browser extension (Chrome, Firefox, Safari) that reads web articles aloud with natural
Indian-English voices from [Sarvam AI](https://www.sarvam.ai/) (Bulbul).

- Detects article pages (badge on the toolbar icon) and extracts the article with Mozilla Readability.
- Reads sentence by sentence, highlighting the sentence in the page and following it as it scrolls.
- Jump anywhere: Alt+click a sentence, toggle **click-to-jump** mode, select text → *Read aloud from here*,
  or drag the progress bar.
- Controls: play/pause, previous/next sentence, previous/next paragraph, speed, voice.
- Audio is cached locally (IndexedDB), so replaying or going back never costs credits twice; the settings page
  shows estimated monthly spend, and long articles ask before starting (threshold configurable).
- Remembers where you stopped on each article and continues from there (with a *Start over* option).

See [PLAN.md](PLAN.md) for the design and roadmap.

## Develop

```bash
pnpm install
pnpm dev              # Chrome with hot reload
pnpm dev:firefox
pnpm test             # unit tests
pnpm compile          # type-check
```

## Build and load

```bash
pnpm build            # → .output/chrome-mv3
pnpm build:firefox    # → .output/firefox-mv3
pnpm build:safari     # → .output/safari-mv3
```

- **Chrome**: `chrome://extensions` → Developer mode → *Load unpacked* → `.output/chrome-mv3`.
- **Firefox**: `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → `.output/firefox-mv3/manifest.json`.
- **Safari 26**: Settings → Developer → *Add Temporary Extension…* → `.output/safari-mv3` (re-add after restarting Safari).
  To keep it installed, `pnpm package:safari` wraps it in a macOS app (needs full Xcode; see the script header).

Then open the extension's settings, paste your Sarvam API key and pick a voice.

## Use

| Action | How |
|---|---|
| Read the article / play-pause | Toolbar button, or `Alt+Shift+R` |
| Next / previous sentence | `Alt+Shift+.` / `Alt+Shift+,`, or the player buttons |
| Read from a sentence | Alt+click it, or turn on click-to-jump (target icon) and click it |
| Read from a selection | Select text → right-click → *Read aloud from here* |
| Read a page that isn't an article | Select text → *Read aloud from here* |

Starting from the keyboard or context menu before you've clicked anywhere on the page can be blocked by the
browser's autoplay policy; the player then asks you to press ▶ once.
