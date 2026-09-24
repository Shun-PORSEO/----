// 公開ニュースページ（無料・集客用）

import { loadConfig } from './api.js';
import { h, markdown, fmtDate } from './ui.js';

const cfg = await loadConfig();
const sub = document.getElementById('subscribe');
if (cfg.newsletterUrl) sub.append(h('a', { class: 'btn btn--primary btn--md', href: cfg.newsletterUrl, target: '_blank', rel: 'noopener noreferrer' }, h('span', { class: 'label' }, 'メルマガに登録（無料）')));
if (cfg.podcastUrl) sub.append(h('a', { class: 'btn btn--secondary btn--md', href: cfg.podcastUrl, target: '_blank', rel: 'noopener noreferrer' }, h('span', { class: 'label' }, 'ポッドキャストを聴く')));

const box = document.getElementById('issues');
try {
  const res = await fetch('news/index.json', { cache: 'no-cache' });
  const data = await res.json();
  box.replaceChildren(
    ...data.issues.map((issue) =>
      h(
        'article',
        { class: 'card news-issue' },
        h('p', { class: 'eyebrow' }, fmtDate(issue.date)),
        h('h2', {}, issue.title),
        issue.intro && h('p', {}, issue.intro),
        issue.podcast?.url && h('audio', { controls: true, preload: 'none', src: issue.podcast.url, class: 'audio' }),
        ...issue.items.map((item) =>
          h('section', { class: 'news-item' }, h('h3', {}, item.title), h('div', { html: markdown(item.summary) }), item.source && h('p', { class: 'text-small' }, h('a', { href: item.source, target: '_blank', rel: 'noopener noreferrer' }, '出典を見る'))),
        ),
      ),
    ),
  );
} catch {
  box.replaceChildren(h('p', {}, 'ニュースを読み込めませんでした。'));
}
