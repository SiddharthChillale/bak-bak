// The player's typefaces (Instrument Sans, Newsreader), bundled in public/fonts (SIL OFL).
// @font-face rules inside a shadow root are ignored, so the faces are added to the page's
// document.fonts instead. They are built from fetched bytes (not a URL), so the page's CSP
// font-src doesn't apply, and registered under private names so they can't clash with the
// page's own fonts.

import { browser } from '#imports';

const FACES = [
  { family: 'ReadAloud Sans', file: 'fonts/instrument-sans.woff2', weight: '400 600' },
  { family: 'ReadAloud Serif', file: 'fonts/newsreader.woff2', weight: '400 500' },
] as const;

let loading: Promise<void> | null = null;

/** Loads the player fonts once per page; failures just leave the system fallbacks. */
export function loadPlayerFonts(): Promise<void> {
  loading ??= (async () => {
    if (typeof FontFace === 'undefined' || !document.fonts) return;
    await Promise.all(
      FACES.map(async ({ family, file, weight }) => {
        try {
          // `getURL` is typed for known public paths only; these files live in public/fonts.
          const res = await fetch(browser.runtime.getURL(`/${file}` as '/'));
          if (!res.ok) return;
          const face = new FontFace(family, await res.arrayBuffer(), { weight, display: 'swap' });
          document.fonts.add(await face.load());
        } catch {
          // Fall back to the system fonts in the CSS stack.
        }
      }),
    );
  })();
  return loading;
}
