// Custom controls for the settings page. Each one drives a hidden native <select>, which stays
// the source of truth (main.ts and the voice lab read/write its value as before).

const refreshers = new Set<() => void>();

/** Re-read every hidden select; call after changing a select's value or options in code. */
export function syncWidgets() {
  for (const r of refreshers) r();
}

function commit(select: HTMLSelectElement, value: string) {
  if (select.value === value) return;
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  syncWidgets();
}

/** Pill segmented control with a sliding thumb. */
export function segmented(select: HTMLSelectElement, host: HTMLElement, opts: { accent?: boolean; mono?: boolean } = {}) {
  host.className = `seg${opts.accent ? ' accent' : ''}${opts.mono ? ' mono' : ''} ${host.className}`.trim();
  const options = [...select.options];
  host.style.gridTemplateColumns = `repeat(${options.length}, 1fr)`;
  const thumb = document.createElement('span');
  thumb.className = 'thumb';
  thumb.style.width = `calc((100% - 6px) / ${options.length})`;
  host.append(thumb);
  const buttons = options.map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = o.text;
    b.addEventListener('click', () => commit(select, o.value));
    host.append(b);
    return b;
  });
  const refresh = () => {
    const i = Math.max(0, options.findIndex((o) => o.value === select.value));
    thumb.style.left = `calc(3px + ${i} * (100% - 6px) / ${options.length})`;
    buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
  };
  refreshers.add(refresh);
  select.addEventListener('change', refresh);
  refresh();
}

export interface MenuOptions {
  /** Card style used for the podcast hosts. */
  card?: { caption: string; tone: 'a' | 'b' };
  onPreview: (value: string) => void;
}

const split = (text: string) => {
  const starred = text.startsWith('★');
  const [name = '', ...style] = text.replace(/^★\s*/, '').split(' · ');
  return { starred, name, style: style.join(' · ') };
};

/** Dropdown of voices with a preview button on every row. */
export function voiceMenu(select: HTMLSelectElement, host: HTMLElement, { card, onPreview }: MenuOptions) {
  host.classList.add('vmenu');
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const label = document.createElement('span');
  label.className = 'vlabel';
  const caret = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.3 14.7a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1-1.4 1.4L12 10.4l-4.3 4.3a1 1 0 0 1-1.4 0Z"/></svg>';
  const play = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>';
  let avatar: HTMLElement | null = null;
  let preview: HTMLButtonElement | null = null;

  if (card) {
    host.classList.add('hostcard', card.tone);
    avatar = document.createElement('span');
    avatar.className = 'avatar';
    trigger.className = 'who';
    trigger.innerHTML = `<small>${card.caption}</small>`;
    const line = document.createElement('b');
    line.append(label);
    line.insertAdjacentHTML('beforeend', caret);
    trigger.append(line);
    preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'pv';
    preview.setAttribute('aria-label', 'Preview voice');
    preview.innerHTML = play;
    preview.addEventListener('click', () => select.value && onPreview(select.value));
    host.append(avatar, trigger, preview);
  } else {
    trigger.className = 'vfield';
    trigger.append(label);
    trigger.insertAdjacentHTML('beforeend', caret);
    host.append(trigger);
  }

  const pop = document.createElement('div');
  pop.className = 'vpop';
  pop.hidden = true;
  host.append(pop);

  const refresh = () => {
    const o = select.selectedOptions[0];
    const { name, style } = split(o?.text ?? '');
    label.textContent = '';
    if (!o || !o.value) {
      label.textContent = 'Choose a voice…';
    } else {
      label.append(name);
      if (style) label.append(Object.assign(document.createElement('span'), { className: 'muted', textContent: ` · ${style}` }));
    }
    if (avatar) avatar.textContent = o?.value ? name.charAt(0) : '?';
    if (preview) preview.disabled = !o?.value;
  };

  const close = () => {
    pop.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const outside = (e: Event) => {
    if (!host.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const open = () => {
    const opts = [...select.options].filter((o) => o.value);
    const hasStars = opts.some((o) => o.text.startsWith('★'));
    pop.replaceChildren();
    if (hasStars) pop.append(Object.assign(document.createElement('div'), { className: 'vhint', textContent: '★ Recommended for long reads' }));
    const list = document.createElement('div');
    list.className = 'vlist';
    list.setAttribute('role', 'listbox');
    for (const o of opts) {
      const { starred, name, style } = split(o.text);
      const row = document.createElement('div');
      row.className = `vrow${o.value === select.value ? ' on' : ''}`;
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.setAttribute('role', 'option');
      pick.setAttribute('aria-selected', String(o.value === select.value));
      pick.innerHTML = '<span class="star"></span><span class="nm"></span><span class="st muted"></span>';
      pick.children[0]!.textContent = starred ? '★' : '';
      pick.children[1]!.textContent = name;
      pick.children[2]!.textContent = style ? ` · ${style}` : '';
      pick.addEventListener('click', () => {
        commit(select, o.value);
        close();
      });
      const pv = document.createElement('button');
      pv.type = 'button';
      pv.className = 'pv';
      pv.setAttribute('aria-label', `Preview ${name}`);
      pv.innerHTML = play;
      pv.addEventListener('click', () => onPreview(o.value));
      row.append(pick, pv);
      list.append(row);
    }
    pop.append(list);
    pop.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onKey, true);
  };
  trigger.addEventListener('click', () => (pop.hidden ? open() : close()));
  refreshers.add(refresh);
  select.addEventListener('change', refresh);
  refresh();
}
