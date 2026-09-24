// AIニュース：誰でも読めるまとめ + 会員向けに「自社に照らした解説」

import { h, append, button, markdown, notice, toast, fmtDate } from '../ui.js';
import { state, addEntries } from '../state.js';
import { aiStream, getConfig } from '../api.js';
import { selectRelevant, toContext, companyBrief } from '../memory.js';
import { pageHeader, sentContextDetails } from './common.js';

export async function loadNews() {
  const res = await fetch('news/index.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('ニュースを読み込めませんでした');
  return res.json();
}

export function render(el) {
  const cfg = getConfig();
  const list = h('div', { class: 'stack' }, h('p', { class: 'text-sub' }, '読み込み中…'));
  append(el, 
    pageHeader('AIニュース', '道内の社長向けに、今週押さえておきたいAIの話題をまとめています。「自社への影響を解説」で、会社の記憶に照らした解説が読めます。'),
    h('div', { class: 'row' }, cfg.podcastUrl && h('a', { class: 'btn btn--secondary btn--md', href: cfg.podcastUrl, target: '_blank', rel: 'noopener noreferrer' }, h('span', { class: 'label' }, 'ポッドキャストで聴く')), cfg.newsletterUrl && h('a', { class: 'btn btn--text', href: cfg.newsletterUrl, target: '_blank', rel: 'noopener noreferrer' }, 'メルマガの登録')),
    list,
  );

  loadNews()
    .then((data) => {
      list.replaceChildren(...data.issues.map(issueView));
    })
    .catch((e) => list.replaceChildren(notice('error', e.message)));
}

function issueView(issue) {
  return h(
    'section',
    { class: 'card news-issue' },
    h('p', { class: 'eyebrow' }, fmtDate(issue.date)),
    h('h2', {}, issue.title),
    issue.intro && h('p', {}, issue.intro),
    issue.podcast?.url && h('audio', { controls: true, preload: 'none', src: issue.podcast.url, class: 'audio' }),
    ...issue.items.map(itemView),
  );
}

function itemView(item) {
  const out = h('div', { class: 'ai-output' });
  const area = h('div');
  const btn = button('自社への影響を解説', {
    variant: 'secondary',
    size: 'sm',
    onClick: async () => {
      btn.disabled = true;
      const picked = selectRelevant(state.data.entries, `${item.title} ${item.summary}`, { limit: 6, maxChars: 4000 });
      const context = toContext(picked);
      let text = '';
      area.replaceChildren(out, sentContextDetails(context));
      try {
        await aiStream('news-commentary', { news: { title: item.title, body: item.body || item.summary }, context, company: companyBrief(state.data.company) }, { onDelta: (t) => ((text += t), (out.innerHTML = markdown(text))) });
        area.append(
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn--text',
              onClick: (e) => {
                addEntries([{ type: '判断', title: `AIニュース：${item.title}`.slice(0, 30), content: text }], 'news');
                e.currentTarget.disabled = true;
                toast('解説を会社の記憶に残しました');
              },
            },
            'この解説を記憶に残す',
          ),
        );
      } catch (e) {
        area.replaceChildren(notice('error', '解説できませんでした', h('p', {}, e.message)));
        btn.disabled = false;
      }
    },
  });
  return h(
    'article',
    { class: 'news-item' },
    h('h3', {}, item.title),
    h('div', { html: markdown(item.summary) }),
    item.source && h('p', { class: 'text-small' }, h('a', { href: item.source, target: '_blank', rel: 'noopener noreferrer' }, '出典を見る')),
    h('div', { class: 'row' }, btn),
    area,
  );
}
