import { describe, expect, it } from 'vitest';
import { MAX_ARTICLE_CHARS, buildMessages, parseScript } from '@/lib/podcast';

const hosts = { A: 'Simran', B: 'Deven' };

describe('parseScript', () => {
  it('parses plain JSON', () => {
    const s = parseScript('{"title":"T","turns":[{"speaker":"A","text":"Hi Deven."},{"speaker":"B","text":"Hi!"}]}');
    expect(s).toEqual({ title: 'T', turns: [{ speaker: 'A', text: 'Hi Deven.' }, { speaker: 'B', text: 'Hi!' }] });
  });

  it('strips code fences and surrounding prose, maps host names to A/B', () => {
    const content = 'Sure! Here it is:\n```json\n{"title":"T","turns":[{"speaker":"Simran","text":"Welcome."},{"speaker":"deven","text":"Thanks."}]}\n```';
    expect(parseScript(content, hosts).turns.map((t) => t.speaker)).toEqual(['A', 'B']);
  });

  it('keeps complete turns from truncated output', () => {
    const content = '{"title":"T","turns":[{"speaker":"A","text":"One \\"quoted\\" word."},{"speaker":"B","text":"Two."},{"speaker":"A","text":"Thr';
    const s = parseScript(content);
    expect(s.title).toBe('T');
    expect(s.turns).toEqual([
      { speaker: 'A', text: 'One "quoted" word.' },
      { speaker: 'B', text: 'Two.' },
    ]);
  });

  it('drops turns with unknown speakers or empty text', () => {
    const s = parseScript('{"turns":[{"speaker":"C","text":"x"},{"speaker":"A","text":"  "},{"speaker":"B","text":"ok"}]}');
    expect(s.turns).toEqual([{ speaker: 'B', text: 'ok' }]);
  });

  it('throws when nothing usable came back', () => {
    expect(() => parseScript('I cannot help with that.')).toThrow(/podcast script/);
  });
});

describe('buildMessages', () => {
  it('names both hosts and truncates very long articles', () => {
    const msgs = buildMessages({ title: 'T', text: 'x'.repeat(MAX_ARTICLE_CHARS + 10), hosts, length: 'short' });
    expect(msgs[0]!.content).toContain('Simran');
    expect(msgs[0]!.content).toContain('Deven');
    expect(msgs[1]!.content).toContain('[…truncated]');
    expect(msgs[1]!.content.length).toBeLessThan(MAX_ARTICLE_CHARS + 200);
  });
});
