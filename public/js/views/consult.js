// 月1回のお悩み相談（IT・AI活用のみ）。受付はフォーム（Google / Microsoft Forms）。

import { h, append, button, notice, toast, fmtDate } from '../ui.js';
import { state, save } from '../state.js';
import { aiJson, getConfig } from '../api.js';
import { monthKey } from '../memory.js';
import { attachVoice } from '../voice.js';
import { pageHeader } from './common.js';

const IN_SCOPE = ['業務へのAI導入（日報・見積・議事録・問い合わせ対応など）', 'ツール選び（ChatGPT / Claude / Copilot / 会計・勤怠クラウドなど）', '社内のIT環境・パソコン・ネットワークの整え方', 'データの活用、Excel業務の効率化', '情報セキュリティの基本（パスワード・バックアップ・社員ルール）'];
const OUT_SCOPE = ['資金繰り・融資・補助金の申請書作成', '労務・人事トラブル、給与・社会保険', '税務・会計処理', '契約・法律の判断', '事業承継・M&Aの手続き'];

export function render(el) {
  const cfg = getConfig();
  const thisMonth = monthKey(new Date());
  const used = state.data.consultations.find((c) => c.month === thisMonth);

  const text = h('textarea', { class: 'input', rows: 7, placeholder: '例：事務員2名で毎月の請求書発行に3日かかっています。AIやクラウドで短くできる方法はありますか？ 今は弥生会計とExcelを使っています。' });
  const voiceBtn = button('音声で入力', { variant: 'secondary', size: 'sm', iconName: 'mic', 'aria-pressed': 'false' });
  attachVoice(voiceBtn, text);
  const result = h('div', { 'aria-live': 'polite' });

  const checkBtn = button('相談できる内容か確認する', {
    onClick: async () => {
      if (!text.value.trim()) return text.focus();
      checkBtn.disabled = true;
      result.replaceChildren(h('p', { class: 'text-sub' }, '確認しています…'));
      try {
        const r = await aiJson('consult-check', { text: text.value });
        result.replaceChildren(r.inScope ? inScopeView(r) : outScopeView(r));
      } catch (e) {
        result.replaceChildren(notice('error', '確認できませんでした', h('p', {}, e.message), h('p', {}, 'そのままフォームから相談いただいても大丈夫です。')), formActions());
      }
      checkBtn.disabled = false;
    },
  });

  function formActions() {
    const copy = button('相談文をコピー', {
      variant: 'secondary',
      onClick: async () => {
        await navigator.clipboard.writeText(text.value);
        toast('コピーしました。フォームに貼り付けてください');
      },
    });
    const open = cfg.consultFormUrl
      ? h(
          'a',
          {
            class: 'btn btn--primary btn--md',
            href: cfg.consultFormUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
            onClick: () => {
              state.data.consultations.push({ month: thisMonth, submittedAt: new Date().toISOString(), summary: text.value.trim().slice(0, 60) });
              save();
            },
          },
          h('span', { class: 'label' }, '相談フォームを開く'),
        )
      : notice('warning', '相談フォームのURLが未設定です', h('p', {}, '運営者がサーバーに CONSULT_FORM_URL を設定すると、ここにボタンが表示されます。'));
    return h('div', { class: 'stack' }, h('ol', { class: 'steps' }, h('li', {}, '「相談文をコピー」を押す'), h('li', {}, '「相談フォームを開く」で開いたフォームに貼り付けて送信')), h('div', { class: 'row' }, copy, open));
  }

  function inScopeView(r) {
    return h('div', { class: 'stack' }, notice('success', '相談できる内容です', h('p', {}, r.reason), r.suggestion && h('p', {}, h('strong', {}, '書き足すと回答が的確になります：'), r.suggestion)), formActions());
  }

  function outScopeView(r) {
    return h(
      'div',
      { class: 'stack' },
      notice('warning', 'この内容はお受けできません', h('p', {}, r.reason), h('p', {}, h('strong', {}, 'おすすめの相談先：'), r.suggestion || 'お近くの商工会議所の経営相談窓口、または北海道よろず支援拠点')),
      h('p', { class: 'text-sub' }, 'IT・AI活用に関わる部分があれば、その部分に絞って書き直すとご相談いただけます。'),
    );
  }

  append(el, 
    pageHeader('お悩み相談（月1回）', 'IT・AI活用のお悩みに、AI活用の専門家が回答します。AIが先に回答案を作り、専門家が確認してからお返しします。'),
    used ? notice('info', `今月（${thisMonth.replace('-', '年')}月）はご相談済みです`, h('p', {}, `${fmtDate(used.submittedAt)}に送信しました。回答はメールでお届けします。追加のご相談は来月お受けします。`)) : null,
    h(
      'div',
      { class: 'grid-2' },
      h('section', { class: 'card' }, h('h2', { class: 'h3' }, 'ご相談いただける内容'), h('ul', {}, IN_SCOPE.map((x) => h('li', {}, x)))),
      h(
        'section',
        { class: 'card' },
        h('h2', { class: 'h3' }, 'お受けできない内容'),
        h('ul', {}, OUT_SCOPE.map((x) => h('li', {}, x))),
        h('p', { class: 'text-small' }, 'これらは、お近くの商工会議所の経営相談窓口、北海道よろず支援拠点、税理士・社会保険労務士・弁護士などの専門家にご相談ください。'),
      ),
    ),
    h(
      'section',
      { class: 'card stack' },
      h('h2', {}, '相談内容を書く'),
      h('p', { class: 'text-sub' }, '今の状況（使っているソフト、人数、かかっている時間）を書くと、回答が具体的になります。フォームに書いた内容は運営者に届きます。社員の個人情報やお客様の名前は書かないでください。'),
      text,
      h('div', { class: 'row' }, voiceBtn, checkBtn),
      result,
    ),
  );
}
