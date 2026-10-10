import { beforeEach, describe, expect, it } from 'vitest';
import { chunkRange, extractArticle, locate } from '@/lib/text/extract';

const para = (n: number) =>
  `<p>Paragraph ${n} talks about document processing on AWS. It explains how generative AI extracts fields from invoices, ` +
  `contracts and forms. Teams can review the output before it reaches downstream systems, which keeps a human in the loop.</p>`;

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
    const doc = extractArticle(document, { skipCode: true, skipTables: true })!;
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
    const doc = extractArticle(document, { skipCode: true, skipTables: true })!;
    const c = doc.chunks.find((c) => c.display.startsWith('It explains'))!;
    expect(chunkRange(doc, c)!.toString().replace(/\s+/g, ' ')).toBe(c.display);
    expect(doc.speechChars).toBeGreaterThan(500);
  });

  it('locates the chunk under a DOM position', () => {
    const doc = extractArticle(document, { skipCode: true, skipTables: true })!;
    const p3 = Array.from(document.querySelectorAll('p')).find((p) => p.textContent!.startsWith('Paragraph 3'))!;
    const node = p3.firstChild!;
    const offset = node.textContent!.indexOf('Teams can');
    const idx = locate(doc, node, offset);
    expect(doc.chunks[idx]!.display).toMatch(/^Teams can review/);
    expect(doc.blocks[doc.chunks[idx]!.block]!.el).toBe(p3);
  });
});
