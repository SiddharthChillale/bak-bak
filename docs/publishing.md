# Publishing to the stores

How to get Bak-Bak into the **Chrome Web Store**, **Microsoft Edge Add-ons**, **Firefox Add-ons (AMO)** and
the **Mac App Store** (Safari). Listing copy and permission justifications are in [store-listing.md](store-listing.md).

_Researched 2026-10-11. Store rules change, so re-check each store's docs before submitting._

## At a glance

| | Chrome Web Store | Edge Add-ons | Firefox Add-ons | Mac App Store (Safari) |
|---|---|---|---|---|
| Account | Google account, Chrome Web Store developer registration | Microsoft account, Partner Center (Edge program) | Mozilla account | Apple Developer Program |
| Cost | $5 one-time | Free | Free | $99 / year |
| What you upload | `bak-bak-<v>-chrome.zip` | same Chrome zip (or `wxt zip -b edge`) | `…-firefox.zip` + `…-sources.zip` | `…-safari.zip` via App Store Connect's packager, or an Xcode archive |
| Review | Days; longer for broad host permissions and new developers | Up to ~7 business days | Automated signing is quick; listed add-ons can also get human review | Typically a few days; App Review guidelines apply |
| Updates can be automated | Yes (`wxt submit`) | Yes (`wxt submit`) | Yes (`wxt submit`) | Manual (or Xcode/CI tooling later) |

The **first** submission to each store is manual (it creates the listing and its ID). Later versions can be
pushed from the release workflow.

## 1. Before any store: blockers to clear

These affect every store; fix them once.

1. ~~**Name.**~~ Done (2026-10-29): renamed to **Bak-Bak**, which doesn't use Sarvam AI's name. Keep the
   "Powered by Sarvam AI" and "not affiliated" wording in the description.
2. **Privacy policy at a public URL.** [PRIVACY.md](../PRIVACY.md) has the contact email; link to it
   (e.g. `https://github.com/SiddharthChillale/bak-bak/blob/main/PRIVACY.md`, or publish it with
   GitHub Pages). Every store asks for this URL.
3. ~~**Permissions.**~~ Done: the extension runs only when invoked (`activeTab` + `scripting`); all-sites access
   is an optional permission requested only when the user turns on "Detect articles automatically". No broad
   install warning, and no in-depth review trigger for broad host permissions.
4. **Reviewers need to test it, and it needs your Sarvam key.** Create a separate Sarvam key with a small spend
   cap for reviewers, and put it plus step-by-step test instructions in each store's "notes for reviewer" field.
   Apple in particular rejects apps it can't fully exercise. Revoke and rotate the key after approval.
5. **Firefox add-on ID.** Pick the permanent ID now (it can never change), e.g. `read-aloud@siddharthchillale.dev`,
   in `wxt.config.ts` → `browser_specific_settings.gecko.id`.
6. **Support URL.** Use the GitHub issues page.
7. **Store assets** (make once, reuse):
   - Screenshots of the real extension on a real article (Read mode, Jump to, Podcast chat), at **1280×800**.
   - Chrome small promo tile **440×280** (marquee 1400×560 optional).
   - Edge logo **300×300**.
   - Mac App Store: app icon **1024×1024** and Mac screenshots (e.g. 1280×800 or 2880×1800).
8. **License** (for the public repo, not required by stores): choose one (MIT, Apache-2.0…).

## 2. Firefox Add-ons (do this first: free and quickest)

1. Sign in at <https://addons.mozilla.org/developers/> with a Mozilla account.
2. **Submit a New Add-on** → **On this site** (listed). (*On your own* = unlisted: signed but self-hosted, which
   is useful for private testers.)
3. Upload `bak-bak-<v>-firefox.zip`. The validator checks the manifest, including
   `data_collection_permissions` (we declare `websiteContent`) and `strict_min_version` 140.
4. When asked whether the code is minified, say **yes** and upload `bak-bak-<v>-sources.zip`. Build
   instructions for reviewers: Node 22, pnpm 10, `pnpm install && pnpm build:firefox`; output in
   `.output/firefox-mv3`.
5. Listing: name, summary, description (from store-listing.md), category, support URL, privacy policy, screenshots,
   reviewer notes with the test key.
6. Once signed, the add-on installs permanently in normal Firefox (unlike today's temporary install).

## 3. Microsoft Edge Add-ons

1. Register at Microsoft Partner Center for the **Microsoft Edge** program with a Microsoft account; wait for the
   verification email.
2. **Create new extension** → upload the Chrome zip (Edge runs Chromium extensions unchanged). Optional: add an
   `edge` build with `wxt zip -b edge` if Edge-specific tweaks are ever needed.
3. Fill in availability (markets), properties (category, privacy policy URL, support URL), store listing (description,
   300×300 logo, screenshots), and reviewer notes with the test key.
4. **Publish**. Status moves through review → "in the store".

## 4. Chrome Web Store

1. Open the developer dashboard (<https://chrome.google.com/webstore/devconsole>), register, and pay the one-time
   **$5** fee. Turn on 2-step verification for the Google account (required to publish).
2. **New item** → upload `bak-bak-<v>-chrome.zip`.
3. **Store listing:** description, category (Accessibility), icon (from the zip), screenshots, promo tile.
4. **Privacy practices:** single purpose ("Read web page text aloud using Sarvam AI text-to-speech"), a
   justification for each permission (see store-listing.md), data usage: *website content* is transmitted to
   Sarvam AI for the extension's core function and isn't sold or used otherwise, plus the privacy policy URL.
5. **Distribution:** public, all regions (or start with **Unlisted** to share a link first).
6. Submit for review.

## 5. Mac App Store (Safari)

Safari extensions ship inside a small macOS app (the "container app"). Two ways to build it:

**A. App Store Connect packager (no Xcode):**
1. Join the Apple Developer Program ($99/yr) as an individual or organisation.
2. In App Store Connect, create an app record (platform macOS; bundle ID e.g. `dev.siddharthchillale.readaloud`).
3. Upload `bak-bak-<v>-safari.zip` through the Safari web extension packager. Apple converts it into a
   container app build and makes it available in TestFlight.
4. Test via TestFlight, then attach the processed build to an App Store version. The upload alone doesn't release
   anything.

**B. Xcode (more control):**
1. `pnpm package:safari` (needs Xcode) creates the Xcode project in `.output/safari-xcode`.
2. Set your team under Signing & Capabilities, bump version/build, **Product → Archive** → Distribute → App Store
   Connect.

Then, either way:
- Fill in the App Store listing: name, subtitle, description, keywords, 1024×1024 icon, Mac screenshots, support
  URL, **privacy policy URL**, category (Productivity or Utilities), age rating.
- **App Privacy** questionnaire: declare that user content (web page text) is collected and sent to a third party
  (Sarvam AI) for app functionality, not linked to identity and not used for tracking.
- **Review notes:** how to enable the extension (Safari → Settings → Extensions), the test Sarvam key, and steps
  to read an article and make a podcast.
- Submit for review. iPhone/iPad Safari is possible later from the same build, but the player is designed for
  desktop, so start with macOS only.

## 6. After the first approval: automate updates

WXT can submit new versions to Chrome, Edge and Firefox in one step. Run once locally:

```bash
pnpm wxt submit init      # walks through the API credentials for each store and writes .env.submit
```

Add the values as GitHub repository secrets (`CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`,
`CHROME_REFRESH_TOKEN`, `FIREFOX_EXTENSION_ID`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`, and the Edge product,
client and API key values). Then a `wxt submit` step can run after `pnpm zip:all` in
[release.yml](../.github/workflows/release.yml) (try `--dry-run` first):

```bash
pnpm wxt submit \
  --chrome-zip .output/*-chrome.zip \
  --edge-zip .output/*-chrome.zip \
  --firefox-zip .output/*-firefox.zip --firefox-sources-zip .output/*-sources.zip
```

`.env.submit` must never be committed (it holds store credentials). Safari updates stay manual: upload the new
zip (or archive) and submit a new App Store version.

## Suggested order

1. Clear the blockers in section 1 (name, privacy URL, permissions, reviewer key, Firefox ID, screenshots).
2. Firefox (free, fast feedback from the validator).
3. Edge (free).
4. Chrome ($5).
5. Mac App Store ($99/yr, most setup).
6. Wire `wxt submit` into the release workflow.
