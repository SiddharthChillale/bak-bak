# Contributing to Read Aloud

Thanks for helping out! Bug reports, fixes, new features, docs and testing on different sites and browsers
are all welcome.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help

- **Report a bug.** Open an [issue](https://github.com/SiddharthChillale/web-readaloud-extension/issues/new/choose)
  with the page URL, your browser and version, and what you expected to happen. Pages it reads badly
  (skips the story, reads the menu, highlights the wrong line) are especially useful.
- **Suggest a feature.** Open a feature request, or start a thread in
  [Discussions](https://github.com/SiddharthChillale/web-readaloud-extension/discussions) if it's still an idea.
- **Send a pull request.** Look for issues labelled `good first issue` or `help wanted`. For anything bigger
  than a small fix, open an issue first so we can agree on the approach before you spend time on it.
- **Report a security problem** privately, as described in [SECURITY.md](SECURITY.md). Please don't open a
  public issue for it.

## Set up

You need Node 22+ and [pnpm](https://pnpm.io) (the version is pinned in `package.json`; `corepack enable` picks
it up).

```bash
git clone https://github.com/<you>/web-readaloud-extension.git
cd web-readaloud-extension
pnpm install
pnpm dev              # Chrome with hot reload (pnpm dev:firefox for Firefox)
```

To try reading aloud you need your own [Sarvam AI API key](https://dashboard.sarvam.ai) (new accounts get free
credits). Paste it in the extension's Settings. The unit tests don't need a key and never call the API.

**Never commit an API key.** `.env` and `.env.*` are git-ignored; `scripts/audition.mjs` reads
`SARVAM_API_KEY` from the environment.

## Before you open a pull request

```bash
pnpm compile          # type-check
pnpm test             # unit tests (Vitest)
pnpm build            # make sure the production build still works
```

CI runs the same checks and builds Chrome, Firefox and Safari packs on every pull request.

Also:

- **Add or update tests** for logic changes. Tests live in `tests/`; text extraction, segmentation, the
  text map, the controller, podcast and summary logic all have suites there.
- **Try it in a browser** if you changed anything the user sees or hears. Say in the PR which browsers and
  sites you checked. A screenshot or short clip helps for UI changes.
- **Keep it private.** The extension only touches a page when the user invokes it and only sends text to
  Sarvam AI. Don't add analytics, tracking, remote code or new network destinations. If a change needs a new
  permission or sends new data anywhere, call it out in the PR and update [PRIVACY.md](PRIVACY.md).
- **Mind the cost.** Users pay Sarvam per character. Changes that send more text or skip the audio cache need
  a good reason.
- **Keep PRs focused.** One change per PR is easier to review and revert.

## Code style

- TypeScript, built with [WXT](https://wxt.dev). Match the style of the file you're editing; there's no
  formatter config, so keep diffs free of unrelated reformatting.
- Entry points are in `entrypoints/` (background, content script, options page); shared code is in `lib/`.
- New features that aren't ready for everyone can go behind a build-time flag (see `lib/features.ts` and
  *Feature flags* in the [README](README.md#feature-flags)).
- Commit messages: a short summary line (e.g. `Player: snap to the nearest viewport corner on drag`), then a
  blank line and a few lines on what changed and why.

## Project layout

```
entrypoints/   background.ts, content/ (player, highlighting), options/ (settings page)
lib/           Sarvam API, caching, text extraction and segmentation, player, podcast, summary
tests/         Vitest suites
scripts/       icon generation, Safari packaging, voice audition
docs/          publishing and store-listing notes
```

[PLAN.md](PLAN.md) has the design notes.

## License

Read Aloud is licensed under the [Apache License 2.0](LICENSE). By submitting a contribution you agree that it
is licensed under the same terms (section 5 of the license), and that you have the right to submit it.
