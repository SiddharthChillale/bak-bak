# Store submission notes

Drafts for the Chrome Web Store and Firefox Add-ons (AMO) listings, plus the decisions still open.

## Listing

**Name:** Read Aloud (Sarvam)

**Summary (≤ 132 chars):** Listen to any article in natural Indian-English voices. Sentence highlighting, jump anywhere, podcast mode.

**Description:**

> Read Aloud turns web articles into natural-sounding speech using Sarvam AI's Bulbul voices, designed for Indian
> English.
>
> - Finds the article on the page and reads it sentence by sentence, highlighting as it goes.
> - Jump anywhere: Alt+click a sentence, select text and choose "Read aloud from here", or drag the progress bar.
> - Play/pause, sentence and paragraph skipping, speed control, dozens of voices.
> - Remembers where you stopped on each article.
> - Podcast mode: turns an article into a short conversation between two hosts.
> - Audio is cached on your device, so replaying never costs credits twice; see your estimated monthly spend.
>
> Requires your own Sarvam AI API key (sign up at dashboard.sarvam.ai; new accounts get free credits).

**Category:** Accessibility (Chrome) / Other or Education (AMO).

## Chrome Web Store: privacy tab

- **Single purpose:** Read web page text aloud using Sarvam AI text-to-speech.
- **Permission justifications:**
  - `storage`: save settings, the user's API key, reading positions and usage counters locally.
  - `contextMenus`: "Read aloud from here", "Read this page aloud" and "Turn this page into a podcast" menu items.
  - Host permission `https://api.sarvam.ai/*`: send text to Sarvam's TTS and chat APIs.
  - Content script on all sites: detect readable articles (badge), extract text, highlight the sentence being read,
    and show the player. Runs locally; nothing is sent until the user starts reading.
- **Data usage disclosure:** "Website content" is collected (page text sent to Sarvam AI to synthesise speech).
  Not sold, not used for unrelated purposes, not used for creditworthiness. Privacy policy: PRIVACY.md (host it at
  a public URL before submitting).
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
2. **Permission breadth.** The content script runs on all sites to show the "article detected" badge. Switching to
   `activeTab` + `scripting` (inject on click) removes the "read and change all your data on all websites" install
   warning, at the cost of the automatic badge and Alt+click before opening the player.
3. **Listing assets.** Screenshots (1280×800), a promo tile (440×280) and a hosted privacy-policy URL.
4. **Name/branding.** Using "Sarvam" in the name may need Sarvam AI's permission; consider a neutral name with
   "Powered by Sarvam AI" in the description.
