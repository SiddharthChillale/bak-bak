# Store submission notes

Drafts for the Chrome Web Store and Firefox Add-ons (AMO) listings, plus the decisions still open.

## Listing

**Name:** Bak-Bak

**Summary (≤ 132 chars):** Listen to any article in natural Indian-English voices. Sentence highlighting, jump anywhere, podcast mode.

**Description:**

> Bak-Bak turns web articles into natural-sounding speech using Sarvam AI's Bulbul voices, designed for Indian
> English.
>
> - Finds the article on the page and reads it sentence by sentence, highlighting as it goes.
> - Jump anywhere: press "Jump to" and click any line, Alt+click a sentence, or select text and choose "Read aloud from here".
> - Play/pause, sentence and paragraph skipping, speed control, dozens of voices.
> - Remembers where you stopped on each article.
> - Podcast mode: pick two hosts and turn the article into a short conversation, script first, audio on demand.
> - Summary mode: hear a one- or two-minute summary of the article instead of the whole thing.
> - Audio is cached on your device, so replaying never costs credits twice; see your estimated monthly spend.
>
> Requires your own Sarvam AI API key (sign up at dashboard.sarvam.ai; new accounts get free credits).
>
> Powered by Sarvam AI. Bak-Bak is an independent project and is not affiliated with Sarvam AI.

**Category:** Accessibility (Chrome) / Other or Education (AMO).

## Chrome Web Store: privacy tab

- **Single purpose:** Read web page text aloud using Sarvam AI text-to-speech.
- **Permission justifications:**
  - `storage`: save settings, the user's API key, reading positions and usage counters locally.
  - `contextMenus`: "Read this page aloud", "Read aloud from here", "Make a podcast from this page…" and "Summarize this page aloud" menu items.
  - `activeTab` + `scripting`: when the user clicks the toolbar button, a menu item or a shortcut, inject the player
    into that tab to extract the article, highlight the sentence being read and show the player.
  - Host permission `https://api.sarvam.ai/*`: send text to Sarvam's TTS and chat APIs.
  - Optional host permission `<all_urls>` (off by default, requested only if the user enables "Detect articles
    automatically" in Settings): mark readable pages with a dot on the toolbar icon. Runs locally; nothing is sent
    until the user presses play.
- **Data usage disclosure:** tick **Website content** (page text sent to Sarvam AI to synthesise speech, write
  podcast scripts and summaries) and **Authentication information** (the user's own Sarvam API key, sent only to
  Sarvam AI). Nothing else is collected. Certify all three: not sold or transferred to third parties outside the
  approved use, not used for unrelated purposes, not used for creditworthiness or lending.
- **Privacy policy URL:** `https://github.com/SiddharthChillale/bak-bak/blob/main/PRIVACY.md`. It
  covers what's collected, why, sharing (Sarvam AI only), retention and deletion, security, and the Limited Use
  statement the User Data Policy asks for.
- **Remote code:** none. All code is bundled.

## AMO

- `data_collection_permissions.required = ["websiteContent"]` is in the manifest (needed for new submissions since
  Nov 2025); `strict_min_version` is 140.
- Upload `pnpm zip:firefox` output: the extension zip and the sources zip (minified bundles need sources). Build
  instructions for reviewers: `pnpm install && pnpm build:firefox` (Node 22, pnpm 10).
- Choose an add-on ID you own before the first submission (currently `readaloud-sarvam@local`); it can't change later.

## Safari / Mac App Store

- Needs the Apple Developer Program ($99/yr), Xcode, and `pnpm package:safari` → archive and upload from Xcode,
  or try App Store Connect's web packager with `pnpm zip` output for Safari.

## Open decisions before publishing

1. **Who pays for Sarvam.** Today each user brings their own API key (BYOK). A hosted proxy with your key would
   need sign-in, quotas and billing, and the privacy policy would change (text would pass through your server).
2. ~~**Permission breadth.**~~ Done (2026-10-11): the extension uses `activeTab` + `scripting` and runs only when
   invoked; site-wide article detection is an opt-in setting with an optional permission.
3. **Listing assets.** Screenshots (1280×800), a promo tile (440×280) and a hosted privacy-policy URL.
4. ~~**Name/branding.**~~ Done (2026-10-29): renamed to Bak-Bak; the description says "Powered by Sarvam AI".
