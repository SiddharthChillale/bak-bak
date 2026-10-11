<p align="center">
  <img src="public/icon/128.png" width="96" height="96" alt="Read Aloud icon" />
</p>

<h1 align="center">Read Aloud</h1>

<p align="center">
  <b>Listen to any article in natural Indian-English voices.</b><br />
  A browser extension for Chrome, Firefox and Safari, powered by <a href="https://www.sarvam.ai/">Sarvam AI</a>.
</p>

<p align="center">
  <a href="https://github.com/SiddharthChillale/web-readaloud-extension/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/SiddharthChillale/web-readaloud-extension?include_prereleases&label=release" /></a>
  <a href="https://github.com/SiddharthChillale/web-readaloud-extension/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/SiddharthChillale/web-readaloud-extension/actions/workflows/ci.yml/badge.svg" /></a>
  <img alt="Chrome" src="https://img.shields.io/badge/Chrome-supported-4285F4" />
  <img alt="Firefox" src="https://img.shields.io/badge/Firefox-140%2B-FF7139" />
  <img alt="Safari" src="https://img.shields.io/badge/Safari-26%2B-0FB5EE" />
</p>

---

Most read-aloud tools sound robotic, or like they're reading to someone else. **Read Aloud** uses Sarvam AI's
Bulbul voices, built for Indian English, so long reads sound like a person you'd actually listen to. Open an
article, press play, and it reads the story (not the menus, ads or comments) while highlighting each sentence
as it goes.

Want a different take? Switch to **Podcast** mode and two hosts of your choosing talk the article through, or to
**Summary** mode to hear just the gist in a minute or two.

## Highlights

- **Reads the article, not the page.** Finds the main story with Mozilla Readability (the engine behind Firefox
  Reader View) and skips navigation, ads, code blocks, tables and link-preview cards.
- **Follow along.** The sentence being read is highlighted in place and the page scrolls with it, staying clear
  of sticky headers and the player.
- **Jump to any line.** Press **Jump to**, scroll anywhere, and click a line: reading starts from the beginning of
  that sentence. Alt+click a sentence once the player is open, or select text → *Read aloud from here*.
- **Natural Indian-English voices.** 60+ Bulbul v4 voices (narration, audiobook, conversational…) plus the
  classic v3 speakers, with speed from 0.75× to 2×.
- **Podcast mode, on your terms.** Pick two hosts (▶ previews each voice), press **Write script** to have
  Sarvam-105B turn the article into a conversation you can read first, then press **Generate audio** to hear it.
  The transcript plays out as a chat, host 1 on the left and host 2 on the right; click any message to jump there.
- **Summary mode for the short version.** Press **Summarize** and Sarvam-105B condenses the article into a brief
  (~1 min) or detailed (~2 min) summary, shown in the player and read aloud in your reading voice.
- **Pay once per sentence.** Every sentence's audio is cached on your device, so replaying, going back or
  re-jumping never costs credits twice. Long articles ask before starting and show the estimated cost.
- **Picks up where you left off.** Reopen an article and it continues from your last sentence, with a *Start
  over* option.
- **Stays out of the way.** The player docks bottom-right, clear of centred article text, and collapses to a
  small pill.
- **Only runs when you ask.** It touches a page only when you click its button, menu or shortcut. Want a dot on
  the toolbar icon for readable pages? Turn on *Detect articles automatically* in Settings (opt-in).
- **Works on strict sites.** Audio plays through Web Audio, so sites with tight security policies (AWS, GitHub…)
  don't block playback.

## Get started

1. **Get a Sarvam API key** at [dashboard.sarvam.ai](https://dashboard.sarvam.ai). New accounts get free credits.
2. **Download the pack for your browser** from the [latest release](https://github.com/SiddharthChillale/web-readaloud-extension/releases/latest):

   | Browser | Pack | Install |
   |---|---|---|
   | Chrome, Edge, Brave | `…-chrome.zip` | Unzip → `chrome://extensions` → **Developer mode** on → **Load unpacked** → pick the folder |
   | Firefox 140+ | `…-firefox.zip` | `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick the zip (until restart) |
   | Safari 26+ | `…-safari.zip` | Unzip → Settings → Advanced → **Show features for web developers** → Developer → **Add Temporary Extension…** (until Safari quits) |

3. **Open the extension's Settings**, paste your key, and pick a voice. Then open any article and press the
   toolbar button (or `Alt+Shift+R`).

Chrome Web Store, Firefox Add-ons and Mac App Store listings are planned.

## Using it

| To… | Do this |
|---|---|
| Read the article / play-pause | Toolbar button or `Alt+Shift+R` |
| Next / previous sentence | `Alt+Shift+.` / `Alt+Shift+,` or the player buttons |
| Next / previous paragraph | ⏭ / ⏮ on the player |
| Start from a particular line | **Jump to**, then click the line (Esc cancels) · or Alt+click it while the player is open |
| Read only a selection | Select text → right-click → *Read aloud from here* |
| Make a podcast | **Podcast** switch → choose two hosts → **Write script** → **Generate audio** |
| Hear a summary | **Summary** switch → choose a length → **Summarize** · or right-click → *Summarize this page aloud* |
| Back to reading the page | **Read** switch |

Every control has a tooltip; hover or tab to it.

## What it costs

Read Aloud is free; you pay Sarvam AI directly for what you listen to, with your own key.

| | Sarvam price | Typical |
|---|---|---|
| Reading (Bulbul) | ₹30 per 10,000 characters | ~₹36 for a 2,000-word article |
| Podcast script (Sarvam-105B) | per token | ~₹0.25 per article |
| Podcast audio (Bulbul) | ₹30 per 10,000 characters | ~₹13–25 for a 5–10 min episode |
| Summary (Sarvam-105B + Bulbul) | as above | ~₹2–6 per article |

Cached sentences are free to replay. The Settings page shows your estimated spend this month.

## Privacy

The extension only sees a page after you invoke it there, and nothing leaves your browser until you press play (or **Write script** / **Summarize**). Then only the text being read is sent to Sarvam AI for speech
(and, in podcast and summary modes, to write the script or summary). Your key, settings, cached audio and reading positions stay in your
browser's extension storage. There's no server, analytics or tracking. See [PRIVACY.md](PRIVACY.md).

## Under the hood

```
Page ──► Readability picks the article ──► sentences mapped back to the live page
                                                 │
  Player (shadow DOM) ◄── Web Audio playback ◄───┤ prefetch 2 ahead, gapless scheduling
                                                 │
  Background ── cache hit? ── IndexedDB audio ───┘
       └─ miss ──► Sarvam Bulbul TTS (and Sarvam-105B for podcast scripts and summaries)
```

Built with [WXT](https://wxt.dev) and TypeScript, [Mozilla Readability](https://github.com/mozilla/readability),
the CSS Custom Highlight API and Web Audio. Design notes are in [PLAN.md](PLAN.md).

## Develop

```bash
pnpm install
pnpm dev              # Chrome with hot reload (pnpm dev:firefox for Firefox)
pnpm test             # unit tests (Vitest)
pnpm compile          # type-check
pnpm zip:all          # release packs for Chrome, Firefox, Safari → .output/
```

`pnpm package:safari` wraps the Safari build in a macOS app (needs Xcode) so it stays installed.

### Releasing

Bump `version` in `package.json`, commit, then tag and push:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

The [Release workflow](.github/workflows/release.yml) checks the tag matches the version, runs the tests, builds
all three packs plus the Firefox source bundle, and publishes them on the
[Releases page](https://github.com/SiddharthChillale/web-readaloud-extension/releases).

## Credits

Voices and podcast scripts by [Sarvam AI](https://www.sarvam.ai/). Article extraction by
[Mozilla Readability](https://github.com/mozilla/readability). Not affiliated with Sarvam AI.
