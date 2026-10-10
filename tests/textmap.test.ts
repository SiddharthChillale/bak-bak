import { beforeEach, describe, expect, it } from 'vitest';
import { TextMap } from '@/lib/text/textmap';

describe('TextMap', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <p id="p">  Hello   <b>brave</b>
        new <i>world</i>.<script>ignored()</script><span hidden>secret</span> Bye<br>now</p>`;
  });

  it('collapses whitespace and skips scripts and hidden elements', () => {
    const map = TextMap.build(document.getElementById('p')!);
    expect(map.text).toBe('Hello brave new world. Bye now');
  });

  it('maps a normalised span back to a DOM range', () => {
    const map = TextMap.build(document.getElementById('p')!);
    const start = map.text.indexOf('brave new');
    const range = map.range(start, start + 'brave new world'.length)!;
    expect(range.toString().replace(/\s+/g, ' ')).toBe('brave new world');
  });

  it('maps a DOM position back to a normalised index', () => {
    const p = document.getElementById('p')!;
    const map = TextMap.build(p);
    const world = p.querySelector('i')!.firstChild!;
    expect(map.indexOf(world, 2)).toBe(map.text.indexOf('world') + 2);
    // End-of-text position works as an exclusive end.
    const now = p.lastChild!;
    expect(map.indexOf(now, 3)).toBe(map.text.length);
  });
});
