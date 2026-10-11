import { describe, expect, it } from 'vitest';
import { MAX_ARTICLE_CHARS } from '@/lib/podcast';
import { buildSummaryMessages, parseSummary } from '@/lib/summary';

describe('parseSummary', () => {
  it('splits paragraphs on blank lines and joins wrapped lines', () => {
    expect(parseSummary('First line\nstill first.\n\nSecond paragraph.')).toEqual(['First line still first.', 'Second paragraph.']);
  });

  it('drops reasoning, fences, preambles and markdown', () => {
    const content = [
      '<think>planning…</think>',
      "Here's a summary of the article:",
      '```',
      '## Summary',
      '',
      'The **new policy** cuts fees for snake_case_users by 5 * 3 percent.',
      '',
      '- It starts in *March*.',
      '1. Banks must comply.',
      '```',
    ].join('\n');
    expect(parseSummary(content)).toEqual([
      'The new policy cuts fees for snake_case_users by 5 * 3 percent.',
      'It starts in March. Banks must comply.',
    ]);
  });

  it('throws when nothing usable came back', () => {
    expect(() => parseSummary('  \n\n ')).toThrow(/summary/);
  });
});

describe('buildSummaryMessages', () => {
  it('sets the target length and truncates very long articles', () => {
    const brief = buildSummaryMessages({ title: 'T', text: 'x'.repeat(MAX_ARTICLE_CHARS + 10), length: 'brief' });
    expect(brief[0]!.content).toContain('about 120 words');
    expect(brief[1]!.content).toContain('[…truncated]');
    expect(brief[1]!.content.length).toBeLessThan(MAX_ARTICLE_CHARS + 200);
    const detailed = buildSummaryMessages({ title: 'T', text: 'body', length: 'detailed' });
    expect(detailed[0]!.content).toContain('about 300 words');
  });
});
