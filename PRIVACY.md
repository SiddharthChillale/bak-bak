# Privacy policy: Bak-Bak

_Last updated: 29 October 2026_

Bak-Bak is a browser extension that reads web pages aloud using Sarvam AI's text-to-speech and language-model
APIs. This policy explains what data the extension handles, why, where it goes and how you can remove it. It
applies to every version of Bak-Bak, including the Chrome Web Store, Microsoft Edge, Firefox and Safari builds.

**In short:** the developer runs no servers and collects nothing. Text you choose to hear is sent directly from
your browser to Sarvam AI, using your own API key. Everything else stays on your device.

## Data the extension handles

| Data | Why | Where it goes |
|---|---|---|
| **Website content**: the text of the page (or the selection) you ask Bak-Bak to read, turn into a podcast or summarize | To turn it into speech, or to write a podcast script or summary | Sent over HTTPS to Sarvam AI (`api.sarvam.ai`) only after you press play, **Write script** or **Summarize** |
| **Authentication information**: your Sarvam API key | Sarvam requires it on every request | Stored in your browser's extension storage; sent only to `api.sarvam.ai` with each request |
| **Settings**: voice, speed and reading preferences | To remember your choices | Your device only |
| **Audio cache, podcast scripts and summaries** for pages you've listened to | So replaying doesn't use your Sarvam credits again | Your device only, capped at a size you choose |
| **Reading positions**: page address (without query string) and the last sentence you heard | So you can continue where you stopped | Your device only |
| **Usage counters**: characters and requests per month | To show an estimated cost in Settings | Your device only |

Bak-Bak does **not** collect personally identifiable information, health, financial or payment information,
personal communications, location, browsing history, user activity (clicks, keystrokes, mouse movement) or
advertising identifiers. It contains no analytics, tracking or advertising code, and it loads no remote code.

## When the extension can see a page

By default Bak-Bak can only access a page after you invoke it there: by clicking its toolbar button, choosing one
of its right-click menu items or pressing one of its keyboard shortcuts. It cannot read other pages.

If you turn on **Detect articles automatically** in Settings, your browser asks you to allow access to all sites.
Bak-Bak then checks each page in your browser to show a "readable article" dot on its icon. Nothing is sent
anywhere by that check; text is only sent when you press play. You can turn this off at any time in Settings or
in your browser's extension settings.

## Sharing

The only third party that receives any data is **Sarvam AI**, which provides the voices and language models.
Sarvam AI processes the text and your API key under its own terms and privacy policy:
<https://www.sarvam.ai/privacy-policy>. The developer never sees or receives this data.

The developer does not sell, rent or transfer user data to anyone, does not use or transfer it for purposes
unrelated to reading pages aloud, and does not use or transfer it to determine creditworthiness or for lending.

## Chrome Web Store Limited Use

The use of information received from Chrome APIs by Bak-Bak adheres to the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
including the Limited Use requirements.

## Retention and deletion

The developer retains no data, because none is received. Data stored on your device stays there until you remove
it:

- **Cached audio:** Settings → Usage & cache → **Clear cached audio**.
- **API key:** clear the key field in Settings.
- **Everything:** uninstall the extension, which deletes all of its storage.

How long Sarvam AI keeps the text it processes is governed by Sarvam AI's policy linked above.

## Security

All requests to Sarvam AI use HTTPS. Your API key is kept in the browser's extension storage, which other
websites cannot read.

## Children

Bak-Bak is not directed at children under 13 and does not knowingly collect any information from them.

## Changes to this policy

If this policy changes, the new version will be published at this address with a new "Last updated" date. If a
future version ever handles data in a new way, it will be described here before that version is released.

## Contact

Questions or requests: sidcp.work@gmail.com, or open an issue at
<https://github.com/SiddharthChillale/bak-bak/issues>.
