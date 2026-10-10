// Highlights the sentence being read, in the live page. Uses the CSS Custom
// Highlight API (no DOM changes); falls back to marking the whole block element
// where that API isn't available. Styles come from the manifest-injected CSS,
// which page CSPs can't block.

const HIGHLIGHT_NAME = 'readaloud-current';
const FALLBACK_ATTR = 'data-readaloud-current';
/** Don't fight the user: skip autoscroll for a while after they scroll themselves. */
const USER_SCROLL_GRACE_MS = 4000;

export class Highlighter {
  private readonly supported = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function';
  private fallbackEl: Element | null = null;
  private lastUserScroll = 0;
  private readonly onUserScroll = () => (this.lastUserScroll = Date.now());

  constructor() {
    window.addEventListener('wheel', this.onUserScroll, { passive: true });
    window.addEventListener('touchmove', this.onUserScroll, { passive: true });
  }

  show(range: Range | null, block: Element | null, opts: { autoscroll: boolean; bottomInset: number }) {
    this.clear();
    if (range && this.supported) {
      CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range));
    } else if (block) {
      block.setAttribute(FALLBACK_ATTR, '');
      this.fallbackEl = block;
    }
    if (opts.autoscroll && Date.now() - this.lastUserScroll > USER_SCROLL_GRACE_MS) {
      const rect = range?.getBoundingClientRect() ?? block?.getBoundingClientRect();
      if (rect && (rect.width || rect.height)) {
        // Only near the top can a sticky header be covering the sentence.
        const top = (rect.top < window.innerHeight * 0.55 ? stickyHeaderBottom() : 0) + 16;
        const bottom = window.innerHeight - opts.bottomInset - 24;
        if (rect.top < top || rect.bottom > bottom) {
          // Aim a third of the way into the visible area below any sticky header;
          // sentences taller than that area are aligned to its top.
          const room = bottom - top;
          const target = rect.height > room * 0.66 ? top : top + room / 3;
          window.scrollBy({ top: rect.top - target, behavior: 'smooth' });
        }
      }
    }
  }

  clear() {
    if (this.supported) CSS.highlights.delete(HIGHLIGHT_NAME);
    this.fallbackEl?.removeAttribute(FALLBACK_ATTR);
    this.fallbackEl = null;
  }

  destroy() {
    this.clear();
    window.removeEventListener('wheel', this.onUserScroll);
    window.removeEventListener('touchmove', this.onUserScroll);
  }
}

/** Bottom edge of fixed/sticky bars covering the top half of the viewport (0 if none). */
function stickyHeaderBottom(): number {
  const limit = window.innerHeight * 0.5;
  const seen = new Set<Element>();
  let bottom = 0;
  for (let y = 2; y < limit; y += 16) {
    for (const x of [window.innerWidth * 0.25, window.innerWidth * 0.5, window.innerWidth * 0.75]) {
      for (let el = document.elementFromPoint(x, y); el && el !== document.body && !seen.has(el); el = el.parentElement) {
        seen.add(el);
        const pos = getComputedStyle(el).position;
        if (pos === 'fixed' || pos === 'sticky') {
          const r = el.getBoundingClientRect();
          if (r.bottom < limit) bottom = Math.max(bottom, r.bottom);
          break;
        }
      }
    }
  }
  return bottom;
}
