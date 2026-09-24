// 登録時：会社の基本情報 → 公開情報の調査（Deep Research）→ 社長が確認して取り込む → 聞き出しへ

import { h, append, button, field, notice, markdown, toast } from '../ui.js';
import { state, save, addEntries, updateSheet, writeExtra } from '../state.js';
import { aiStream, aiJson } from '../api.js';
import { SHEET_FIELDS } from '../sheet.js';
import { pageHeader } from './common.js';

export function render(el, { go }) {
  const c = state.data.company;
  const steps = h('ol', { class: 'step-nav', 'aria-label': '登録の手順' });
  const body = h('div');
  append(el, pageHeader('はじめての登録', '3つの手順で、AIが御社のことを学びます。所要時間は15分ほどです。'), steps, body);

  const setStep = (n) => {
    steps.replaceChildren(
      ...['会社の基本情報', '公開情報の調査', '内容の確認'].map((label, i) =>
        h('li', { class: i < n ? 'is-done' : i === n ? 'is-current' : '', 'aria-current': i === n ? 'step' : null }, h('span', { class: 'num' }, i + 1), label),
      ),
    );
  };

  // ---- 手順1 ----
  function step1() {
    setStep(0);
    const inputs = {
      name: h('input', { class: 'input', value: c.name, required: true, autocomplete: 'organization' }),
      url: h('input', { class: 'input', value: c.url, type: 'url', placeholder: 'https://' }),
      address: h('input', { class: 'input', value: c.address, placeholder: '例：北海道旭川市' }),
      industry: h('input', { class: 'input', value: c.industry, placeholder: '例：建設業（住宅リフォーム）' }),
      employees: h('input', { class: 'input', value: c.employees, placeholder: '例：12名' }),
      founded: h('input', { class: 'input', value: c.founded, placeholder: '例：1985年' }),
    };
    const err = h('div');
    body.replaceChildren(
      h(
        'form',
        {
          class: 'card stack',
          onSubmit: (e) => {
            e.preventDefault();
            if (!inputs.name.value.trim()) {
              err.replaceChildren(notice('error', '会社名を入力してください'));
              inputs.name.focus();
              return;
            }
            for (const [k, v] of Object.entries(inputs)) c[k] = v.value.trim();
            save();
            step2();
          },
        },
        h('h2', {}, '会社の基本情報'),
        err,
        field('会社名', inputs.name, { required: true }),
        field('ホームページ', inputs.url, { hint: 'あれば入力してください。調査の精度が上がります。' }),
        field('所在地', inputs.address),
        field('業種', inputs.industry),
        h('div', { class: 'grid-2' }, field('従業員数', inputs.employees), field('創業', inputs.founded)),
        h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn btn--primary btn--lg' }, h('span', { class: 'label' }, '次へ'))),
      ),
    );
  }

  // ---- 手順2 ----
  function step2() {
    setStep(1);
    const statusEl = h('p', { class: 'text-sub', role: 'status', 'aria-live': 'polite' });
    const out = h('div', { class: 'ai-output' });
    const err = h('div');
    const next = button('調査結果を確認する', { size: 'lg', disabled: true });
    const skip = h('button', { type: 'button', class: 'btn btn--text' }, '調査をとばして聞き出しから始める');
    skip.addEventListener('click', () => go('interview'));
    body.replaceChildren(
      h(
        'div',
        { class: 'card stack' },
        h('h2', {}, '公開情報の調査'),
        h('p', {}, `AIが「${c.name}」のホームページや求人情報、地域の記事などの公開情報を調べ、まとめます。数分かかることがあります。`),
        h('p', { class: 'text-sub' }, 'AIに送るのは会社名・ホームページ・所在地・業種だけです。'),
        statusEl,
        out,
        err,
        h('div', { class: 'row' }, next, skip),
      ),
    );
    let text = '';
    statusEl.textContent = '調査を始めています…';
    aiStream('research', { name: c.name, url: c.url, address: c.address, industry: c.industry }, {
      onStatus: (m) => (statusEl.textContent = m),
      onDelta: (t) => {
        text += t;
        out.innerHTML = markdown(text);
      },
    })
      .then(async () => {
        statusEl.textContent = '調査が完了しました。';
        state.data.researchReport = text;
        save();
        try {
          await writeExtra('調査レポート.md', `# ${c.name} 公開情報の調査\n\n${text}`);
        } catch {
          /* 本体データには保存済み */
        }
        next.disabled = false;
        next.addEventListener('click', () => step3(text));
      })
      .catch((e) => {
        statusEl.textContent = '';
        err.replaceChildren(notice('error', '調査できませんでした', h('p', {}, e.message), h('p', {}, '聞き出しから始めても問題ありません。')));
      });
  }

  // ---- 手順3 ----
  async function step3(report) {
    setStep(2);
    body.replaceChildren(h('div', { class: 'card' }, h('p', { role: 'status' }, 'AIが調査結果を整理しています…')));
    let r;
    try {
      r = await aiJson('research-structure', { name: c.name, report });
    } catch (e) {
      body.replaceChildren(notice('error', '整理できませんでした', h('p', {}, e.message)), button('聞き出しへ進む', { onClick: () => go('interview') }));
      return;
    }
    const memChecks = r.memories.map((m) => ({ m, cb: h('input', { type: 'checkbox', checked: true, class: 'checkbox' }) }));
    const sheetChecks = r.sheetUpdates.map((u) => ({ u, cb: h('input', { type: 'checkbox', checked: true, class: 'checkbox' }) }));
    const overview = h('textarea', { class: 'input', rows: 3 }, r.overview);
    body.replaceChildren(
      h(
        'div',
        { class: 'stack' },
        notice('info', '調査結果には推測が含まれます', h('p', {}, '正しいものだけにチェックを残してください。取り込んだ後でも修正・削除できます。')),
        h('section', { class: 'card stack' }, h('h2', {}, '会社概要'), field('概要', overview)),
        memChecks.length > 0 &&
          h(
            'section',
            { class: 'card' },
            h('h2', {}, '会社の記憶の候補'),
            h(
              'ul',
              { class: 'check-list' },
              memChecks.map(({ m, cb }) => h('li', {}, h('label', {}, cb, h('span', {}, h('span', { class: 'tag' }, m.type), ' ', h('strong', {}, m.title), h('br'), h('span', { class: 'text-sub' }, m.content))))),
            ),
          ),
        sheetChecks.length > 0 &&
          h(
            'section',
            { class: 'card' },
            h('h2', {}, '経営デザインシートへの反映'),
            h(
              'ul',
              { class: 'check-list' },
              sheetChecks.map(({ u, cb }) => h('li', {}, h('label', {}, cb, h('span', {}, h('strong', {}, SHEET_FIELDS.find((f) => f.id === u.field)?.label || u.field), h('br'), h('span', { class: 'text-sub' }, u.text))))),
            ),
          ),
        r.questions?.length > 0 && h('section', { class: 'card' }, h('h2', {}, 'このあとAIが確認したいこと'), h('ul', {}, r.questions.map((q) => h('li', {}, q)))),
        h(
          'div',
          { class: 'row' },
          button('取り込んで、AIとの対話へ進む', {
            size: 'lg',
            onClick: () => {
              c.overview = overview.value.trim();
              if (r.industry && !c.industry) c.industry = r.industry;
              addEntries(memChecks.filter((x) => x.cb.checked).map((x) => x.m), 'research');
              updateSheet(sheetChecks.filter((x) => x.cb.checked).map((x) => x.u));
              save();
              toast('取り込みました');
              go('interview');
            },
          }),
        ),
      ),
    );
  }

  step1();
}
