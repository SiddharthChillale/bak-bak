import { describe, expect, it } from 'vitest';
import { MAX_CHUNK_CHARS, chunkSpans, isSpeakable, toSpeech } from '@/lib/text/segment';

const slice = (text: string) => chunkSpans(text).map((s) => text.slice(s.start, s.end));

describe('chunkSpans', () => {
  it('splits into sentences', () => {
    expect(slice('The monsoon arrived early this year. Shops opened at 7:30 a.m. on MG Road, as usual.')).toEqual([
      'The monsoon arrived early this year.',
      'Shops opened at 7:30 a.m. on MG Road, as usual.',
    ]);
  });

  it('merges very short sentences into the next one', () => {
    expect(slice('Yes. That is exactly what happened in the end.')).toEqual(['Yes. That is exactly what happened in the end.']);
  });

  it('merges a short trailing sentence into the previous chunk', () => {
    expect(slice('That is exactly what happened in the end. Really.')).toEqual([
      'That is exactly what happened in the end. Really.',
    ]);
  });

  it('splits very long sentences at clause boundaries, under the max', () => {
    const long = Array.from({ length: 40 }, (_, i) => `clause number ${i} goes here`).join(', ') + '.';
    const parts = slice(long);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(long);
  });

  it('trims surrounding whitespace from spans', () => {
    expect(slice('  Hello there, how are you doing today?   ')).toEqual(['Hello there, how are you doing today?']);
  });
});

describe('toSpeech', () => {
  it('drops citation markers and shortens URLs', () => {
    expect(toSpeech('Rainfall rose 12%[3][4] (see https://www.imd.gov.in/pages/monsoon.php for data).')).toBe(
      'Rainfall rose 12% (see imd.gov.in for data).',
    );
  });

  it('flags chunks without letters or digits as unspeakable', () => {
    expect(isSpeakable('— • —')).toBe(false);
    expect(isSpeakable('42')).toBe(true);
  });
});
