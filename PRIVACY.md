# Privacy policy: Read Aloud (Sarvam)

_Last updated: 11 October 2026_

Read Aloud reads web pages aloud using Sarvam AI's text-to-speech service. This policy explains what data the
extension handles.

## What is sent, and to whom

- **Page text you ask it to read.** When you start reading (or create a podcast), the extension sends the text of
  the article, sentence by sentence, to Sarvam AI (`api.sarvam.ai`) to turn it into speech. For podcast mode it
  also sends the article text to Sarvam AI's language model to write the conversation script.
- **Your Sarvam API key** is sent to Sarvam AI with each request, as Sarvam requires.

Nothing is sent until you start reading.

## When the extension can see a page

By default the extension can only access a page after you invoke it there: by clicking its toolbar button,
choosing one of its right-click menu items, or using one of its keyboard shortcuts. It cannot read other pages.

If you turn on **Detect articles automatically** in Settings, your browser will ask you to allow access to all
sites. The extension then checks each page locally to show a "readable article" dot on its icon. That check
happens in your browser; nothing is transmitted unless you press play. You can turn this off at any time in
Settings or in your browser's extension settings.

Sarvam AI processes this data under its own terms and privacy policy: https://www.sarvam.ai/privacy-policy

## What is stored on your device

All of this stays in your browser's extension storage and is never sent to the developer:

- Your Sarvam API key and settings (voice, speed, reading preferences).
- Synthesised audio for sentences you've listened to (so replaying doesn't cost credits again), capped at a size
  you choose; clear it any time from the settings page.
- Podcast scripts for recently converted pages.
- Your last reading position per article (page address without query string) so you can resume.
- Monthly usage counters (characters and requests) for the cost estimate.

## What is not collected

The developer runs no servers and receives no data: no analytics, no tracking, no browsing history, no
advertising identifiers.

## Contact

Questions or requests: sidcp.work@gmail.com
