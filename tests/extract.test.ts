import { beforeEach, describe, expect, it } from 'vitest';
import { chunkRange, extractArticle, locate } from '@/lib/text/extract';

const para = (n: number) =>
  `<p>Paragraph ${n} talks about document processing on AWS. It explains how generative AI extracts fields from invoices, ` +
  `contracts and forms. Teams can review the output before it reaches downstream systems, which keeps a human in the loop.</p>`;

const OPTS = { skipCode: true, skipTables: true, skipEmbeds: true, skipCaptions: false };

beforeEach(() => {
  document.title = 'Accelerate document processing | Example Blog';
  document.body.innerHTML = `
    <nav><a href="/">Home</a> <a href="/blog">Blog</a></nav>
    <article>
      <h1>Accelerate document processing</h1>
      ${para(1)}${para(2)}
      <pre><code>const x = 1;</code></pre>
      ${para(3)}
      <ul><li>First point that is long enough to matter here.</li><li>Second point, also reasonably long.</li></ul>
      ${para(4)}
    </article>
    <footer>© Example</footer>`;
});

describe('extractArticle', () => {
  it('maps article blocks to live page elements without mutating the page', () => {
    const before = document.body.innerHTML;
    const doc = extractArticle(document, OPTS)!;
    expect(document.body.innerHTML).toBe(before);
    expect(doc.title).toBe('Accelerate document processing');
    expect(doc.blocks.every((b) => b.el && document.contains(b.el))).toBe(true);
    const texts = doc.blocks.map((b) => b.text);
    expect(texts[0]).toBe('Accelerate document processing');
    expect(texts.some((t) => t.startsWith('Paragraph 4'))).toBe(true);
    expect(texts.some((t) => t.includes('const x'))).toBe(false);
    expect(texts.some((t) => t.includes('Home'))).toBe(false);
  });

  it('produces sentence chunks with ranges in the live page', () => {
    const doc = extractArticle(document, OPTS)!;
    const c = doc.chunks.find((c) => c.display.startsWith('It explains'))!;
    expect(chunkRange(doc, c)!.toString().replace(/\s+/g, ' ')).toBe(c.display);
    expect(doc.speechChars).toBeGreaterThan(500);
  });

  it('locates the chunk under a DOM position', () => {
    const doc = extractArticle(document, OPTS)!;
    const p3 = Array.from(document.querySelectorAll('p')).find((p) => p.textContent!.startsWith('Paragraph 3'))!;
    const node = p3.firstChild!;
    const offset = node.textContent!.indexOf('Teams can');
    const idx = locate(doc, node, offset);
    expect(doc.chunks[idx]!.display).toMatch(/^Teams can review/);
    expect(doc.blocks[doc.chunks[idx]!.block]!.el).toBe(p3);
  });
});

describe('extractArticle embeds', () => {
  // A Medium link-preview card as served on a live article (classes stripped). Medium also
  // wraps it in divs, which Readability usually drops for link density; without them (as
  // on Substack, or when Readability retries without cleaning) the card survives Readability.
  const card = `
    <a href="https://argo-cd.readthedocs.io/en/stable/" target="_blank"><div><div>
      <h2>Argo CD - Declarative GitOps CD for Kubernetes</h2>
      <div><h3>Argo CD is a declarative, GitOps continuous delivery tool for Kubernetes.</h3></div>
      <div><p>argo-cd.readthedocs.io</p></div>
    </div><div><div></div></div></div></a>`;

  beforeEach(() => {
    document.title = 'Accelerate document processing';
    document.body.innerHTML = `
      <article>
        <h1>Accelerate document processing</h1>
        ${para(1)}
        <p>Inline links stay: see <a href="https://aws.amazon.com/textract/">Textract</a> for the OCR step, which ` +
      `turns scanned pages into text before any model looks at them.</p>
        ${card}
        ${para(2)}
        <p>Related: <a href="https://example.com/other-post">How we cut invoice processing time in half</a></p>
        <h2><a href="#results">Results</a></h2>
        <figure><img src="chart.png" alt=""><figcaption>Figure 1: Throughput before and after the change.</figcaption></figure>
        ${para(3)}
        <blockquote class="twitter-tweet"><p>Just shipped document processing on AWS!</p></blockquote>
        ${para(4)}
      </article>`;
  });

  const texts = (opts = OPTS) => extractArticle(document, opts)!.blocks.map((b) => b.text);

  it('skips link-preview cards, link-only lines and unrendered social embeds', () => {
    const t = texts();
    expect(t.some((x) => x.includes('Argo CD'))).toBe(false);
    expect(t.some((x) => x.includes('readthedocs'))).toBe(false);
    expect(t.some((x) => x.startsWith('Related:'))).toBe(false);
    expect(t.some((x) => x.includes('Just shipped'))).toBe(false);
  });

  it('keeps paragraphs with inline links, linked headings and article text', () => {
    const t = texts();
    expect(t.some((x) => x.startsWith('Inline links stay'))).toBe(true);
    expect(t).toContain('Results');
    expect(t.filter((x) => x.startsWith('Paragraph')).length).toBe(4);
    expect(t.some((x) => x.startsWith('Figure 1'))).toBe(true);
  });

  it('skips captions only when asked', () => {
    expect(texts({ ...OPTS, skipCaptions: true }).some((x) => x.startsWith('Figure 1'))).toBe(false);
  });

  it('reads embeds when the option is off', () => {
    const t = texts({ ...OPTS, skipEmbeds: false });
    expect(t.some((x) => x.includes('Argo CD'))).toBe(true);
    expect(t).toContain('argo-cd.readthedocs.io');
    expect(t.some((x) => x.startsWith('Related:'))).toBe(true);
    expect(t.some((x) => x.includes('Just shipped'))).toBe(true);
  });
});
