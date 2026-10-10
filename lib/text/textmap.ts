// Whitespace-normalised text of a DOM subtree, with a per-character map back to
// the original text nodes. Lets us speak clean text while highlighting (and
// hit-testing clicks on) the exact characters in the live page.

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH', 'BUTTON', 'SELECT', 'TEXTAREA', 'IFRAME']);

export class TextMap {
  readonly text: string;
  private nodes: Text[];
  /** For each char of `text`: index into `nodes`. */
  private nodeIdx: Int32Array;
  /** For each char of `text`: offset inside that node. */
  private offset: Int32Array;

  private constructor(text: string, nodes: Text[], nodeIdx: Int32Array, offset: Int32Array) {
    this.text = text;
    this.nodes = nodes;
    this.nodeIdx = nodeIdx;
    this.offset = offset;
  }

  static build(root: Element, isVisible: (el: Element) => boolean = defaultIsVisible): TextMap {
    const nodes: Text[] = [];
    const chars: string[] = [];
    const idx: number[] = [];
    const off: number[] = [];
    let pendingSpace = false;

    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          if (SKIP_TAGS.has(el.tagName.toUpperCase()) || el.getAttribute('aria-hidden') === 'true') {
            return NodeFilter.FILTER_REJECT;
          }
          return isVisible(el) ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const node = n as Text;
      const data = node.data;
      let used = false;
      for (let i = 0; i < data.length; i++) {
        const ch = data[i]!;
        if (/\s/.test(ch)) {
          if (chars.length) pendingSpace = true;
          continue;
        }
        if (!used) {
          nodes.push(node);
          used = true;
        }
        if (pendingSpace) {
          // Attribute the collapsed space to the first char after it.
          chars.push(' ');
          idx.push(nodes.length - 1);
          off.push(i);
          pendingSpace = false;
        }
        chars.push(ch);
        idx.push(nodes.length - 1);
        off.push(i);
      }
      // Block-level boundaries inside the subtree (e.g. <br>, <li>) separate words.
      if (used && isBlockBoundaryAfter(node)) pendingSpace = true;
    }
    return new TextMap(chars.join(''), nodes, Int32Array.from(idx), Int32Array.from(off));
  }

  /** DOM Range covering normalised chars [start, end). */
  range(start: number, end: number): Range | null {
    if (start >= end || start < 0 || end > this.text.length) return null;
    const doc = this.nodes[0]?.ownerDocument;
    if (!doc) return null;
    const r = doc.createRange();
    r.setStart(this.nodes[this.nodeIdx[start]!]!, this.offset[start]!);
    r.setEnd(this.nodes[this.nodeIdx[end - 1]!]!, this.offset[end - 1]! + 1);
    return r;
  }

  /**
   * Normalised index of the first char at or after a DOM position (so it works as an
   * exclusive end too; may equal `text.length`), or -1 if the position isn't in this map.
   */
  indexOf(node: Node, offsetInNode: number): number {
    const k = this.nodes.indexOf(node as Text);
    if (k < 0) {
      // Element positions (e.g. selection anchored on an element): use its first mapped text node.
      for (let i = 0; i < this.nodes.length; i++) {
        if (node.contains(this.nodes[i]!)) return this.firstIndexOfNode(i);
      }
      return -1;
    }
    // Binary search the chars belonging to node k for the first with offset >= offsetInNode.
    let lo = this.firstIndexOfNode(k);
    let hi = lo;
    while (hi < this.text.length && this.nodeIdx[hi] === k) hi++;
    while (lo < hi && this.offset[lo]! < offsetInNode) lo++;
    return lo;
  }

  contains(node: Node): boolean {
    return this.nodes.some((n) => n === node || node.contains(n));
  }

  private firstIndexOfNode(k: number): number {
    let lo = 0;
    let hi = this.nodeIdx.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.nodeIdx[mid]! < k) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

function isBlockBoundaryAfter(node: Text): boolean {
  const next = node.nextSibling;
  return next?.nodeType === Node.ELEMENT_NODE && (next as Element).tagName === 'BR';
}

function defaultIsVisible(el: Element): boolean {
  if (el.hasAttribute('hidden')) return false;
  if (typeof el.checkVisibility === 'function') return el.checkVisibility();
  return true;
}
