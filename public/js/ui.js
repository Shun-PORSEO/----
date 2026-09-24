// 画面部品（デジタル庁デザインシステムの部品に準拠したクラスを付けて生成する）

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// 条件付きの子要素（false / null）を読み飛ばして追加する
export function append(el, ...children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 最小限のMarkdown表示（AI応答用）。HTMLはすべてエスケープする。
export function markdown(src) {
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(^|[\s（(])(https?:\/\/[^\s<）)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  const out = [];
  let list = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of String(src || '').split('\n')) {
    const t = line.trim();
    let m;
    if (!t) {
      closeList();
      continue;
    }
    if ((m = /^(#{1,4})\s+(.*)$/.exec(t))) {
      closeList();
      const lv = Math.min(4, m[1].length + 2);
      out.push(`<h${lv}>${inline(m[2])}</h${lv}>`);
    } else if ((m = /^(?:[-*・]\s*)(.*)$/.exec(t))) {
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = /^\d+[.)．]\s*(.*)$/.exec(t))) {
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else {
      closeList();
      out.push(`<p>${inline(t)}</p>`);
    }
  }
  closeList();
  return out.join('');
}

const ICONS = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1a7 7 0 0 0 6-6.9z',
  book: 'M5 3h11a3 3 0 0 1 3 3v15H7a2 2 0 0 1-2-2zm2 14v2h10v-2z',
  chat: 'M4 4h16v12H8l-4 4z',
  sheet: 'M4 3h16v18H4zM6 7h12v2H6zm0 4h12v2H6zm0 4h8v2H6z',
  chart: 'M4 20V10h3v10zm6 0V4h3v16zm6 0v-7h3v7z',
  help: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 16h-2v-2h2zm2.1-7.7-.9.9A3 3 0 0 0 13 14h-2v-.5a4 4 0 0 1 1.2-2.8l1.2-1.3A2 2 0 1 0 10 8H8a4 4 0 1 1 7.1 2.3z',
  news: 'M4 5h13v14H5a1 1 0 0 1-1-1zm15 3h2v10a1 1 0 0 1-2 0zM7 8h7v2H7zm0 4h7v2H7z',
  gear: 'M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L15 3.5h-4L10.6 6a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v10H5V11a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z',
  warn: 'M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z',
  send: 'M3 20l18-8L3 4v6l12 2-12 2z',
  play: 'M8 5v14l11-7z',
  download: 'M11 4h2v9l3.5-3.5 1.4 1.4L12 16.8l-5.9-5.9 1.4-1.4L11 13zM5 18h14v2H5z',
};

export function icon(name, size = 24) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name] || ICONS.info);
  p.setAttribute('fill', 'currentColor');
  svg.append(p);
  return svg;
}

// 通知バナー（type: info | success | warning | error）
export function notice(type, title, ...body) {
  const iconName = { info: 'info', success: 'check', warning: 'warn', error: 'warn' }[type];
  return h('div', { class: `notice notice--${type}`, role: type === 'error' ? 'alert' : 'status' }, icon(iconName), h('div', { class: 'notice__body' }, title && h('p', { class: 'notice__title' }, title), ...body));
}

export function button(label, { variant = 'primary', size = 'md', iconName, ...attrs } = {}) {
  return h('button', { type: 'button', class: `btn btn--${variant} btn--${size}`, ...attrs }, iconName && icon(iconName, 20), h('span', { class: 'label' }, label));
}

export function linkButton(label, href, { variant = 'primary', size = 'md', iconName, ...attrs } = {}) {
  return h('a', { href, class: `btn btn--${variant} btn--${size}`, ...attrs }, iconName && icon(iconName, 20), h('span', { class: 'label' }, label));
}

export function field(label, control, { hint, required, id } = {}) {
  const cid = id || control.id || 'f-' + Math.random().toString(36).slice(2, 8);
  control.id = cid;
  const hintId = hint ? cid + '-hint' : null;
  if (hintId) control.setAttribute('aria-describedby', hintId);
  return h(
    'div',
    { class: 'form-field' },
    h('label', { for: cid, class: 'form-field__label' }, label, required && h('span', { class: 'req' }, '必須')),
    hint && h('p', { class: 'form-field__hint', id: hintId }, hint),
    control,
  );
}

let toastTimer;
export function toast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), 3200);
}

export function progress(value, label) {
  return h(
    'div',
    { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': value, 'aria-label': label },
    h('div', { class: 'progress__bar', style: `width:${value}%` }),
  );
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
