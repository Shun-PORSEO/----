import { h, icon } from '../ui.js';

export function pageHeader(title, lead) {
  return h('div', { class: 'page-header' }, h('h1', {}, title), lead && h('p', { class: 'lead' }, lead));
}

// 社長への約束（平易な言葉で3つ）
export const PROMISES = [
  { title: '原本はあなたのPCだけ', body: '会社の記憶は、社長のPCの中のフォルダにだけ保存します。私たちのサーバーには保存しません。' },
  { title: 'AIに送るのは質問時の必要部分だけ', body: '質問や対話のときに、関係のある記憶だけを選んでAIに送ります。何を送ったかは画面で確認できます。' },
  { title: 'AIの学習には使いません', body: 'AI提供元（Anthropic社）の設定で、学習への利用をしない契約のサービスを使っています。送った内容は回答が終われば中継サーバーにも残りません。' },
];

export function privacyCard({ compact = false } = {}) {
  return h(
    'section',
    { class: 'card card--privacy', 'aria-labelledby': 'privacy-title' },
    h('h2', { id: 'privacy-title', class: compact ? 'h3' : '' }, icon('lock'), ' 3つのお約束'),
    h(
      'ol',
      { class: 'promise-list' },
      PROMISES.map((p) => h('li', {}, h('strong', {}, p.title), !compact && h('p', {}, p.body))),
    ),
  );
}

export function sentContextDetails(context) {
  if (!context) return null;
  return h(
    'details',
    { class: 'sent-context' },
    h('summary', {}, `今回AIに送った会社の記憶（${context.length}件）`),
    context.length
      ? h(
          'ul',
          {},
          context.map((c) => h('li', {}, h('span', { class: 'tag' }, c.type), ' ', c.title)),
        )
      : h('p', {}, '記憶は送っていません（会社の基本情報と質問のみ）。'),
  );
}
