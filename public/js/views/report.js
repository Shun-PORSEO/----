// 月次レポート「今月増えた会社の記憶」と、削減時間の記録（試行期間の効果測定）

import { h, append, button, field, toast, markdown, fmtDate } from '../ui.js';
import { state, save } from '../state.js';
import { monthlyStats, monthKey, prevMonthKey, MEMORY_TYPE_IDS } from '../memory.js';
import { sheetCompletion } from '../sheet.js';
import { aiStream } from '../api.js';
import { downloadFile } from '../storage.js';
import { pageHeader } from './common.js';

export function render(el) {
  let key = monthKey(new Date());
  const body = h('div');

  const monthSelect = h('select', { class: 'input input--inline', 'aria-label': '対象月', onChange: (e) => ((key = e.target.value), draw()) });
  let k = monthKey(new Date());
  for (let i = 0; i < 12; i++) {
    const [y, m] = k.split('-');
    monthSelect.append(h('option', { value: k }, `${y}年${Number(m)}月`));
    k = prevMonthKey(k);
  }

  function draw() {
    const s = monthlyStats(state.data, key);
    const maxType = Math.max(1, ...Object.values(s.byType));
    const aiBox = h('div', { class: 'ai-output' });
    const summarize = button('AIにひとことでまとめてもらう', {
      variant: 'secondary',
      onClick: async () => {
        summarize.disabled = true;
        let text = '';
        try {
          await aiStream(
            'monthly-summary',
            { stats: { month: s.month, total: s.total, added: s.added, prevAdded: s.prevAdded, byType: s.byType, interviews: s.interviews, minutesSaved: s.minutesSaved, sheetCompletion: sheetCompletion(state.data.sheet), sheetFieldsUpdated: s.sheetFieldsUpdated }, titles: s.addedEntries.map((e) => e.title) },
            { onDelta: (t) => ((text += t), (aiBox.innerHTML = markdown(text))) },
          );
        } catch (e) {
          aiBox.textContent = e.message;
        }
        summarize.disabled = false;
      },
    });

    body.replaceChildren(
      h(
        'div',
        { class: 'stat-grid' },
        stat('今月増えた記憶', `+${s.added}`, '件', `先月 +${s.prevAdded}件`),
        stat('記憶の合計', `${s.total}`, '件'),
        stat('AIとの対話', `${s.interviews}`, '回', `${s.interviewMinutes}分`),
        stat('削減できた時間', `${Math.round(s.minutesSaved / 6) / 10}`, '時間', '下の記録から集計'),
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', {}, '種類ごとの増加'),
        h(
          'dl',
          { class: 'bar-list' },
          MEMORY_TYPE_IDS.map((t) => [h('dt', {}, t), h('dd', {}, h('span', { class: 'bar', style: `width:${(s.byType[t] / maxType) * 100}%` }), h('span', { class: 'bar-num' }, `${s.byType[t]}件`))]),
        ),
        s.sheetFieldsUpdated.length > 0 && h('p', {}, `経営デザインシートで更新された項目: ${s.sheetFieldsUpdated.join('、')}`),
      ),
      h('section', { class: 'card' }, h('h2', {}, '今月残した記憶'), s.addedEntries.length ? h('ul', { class: 'plain-list' }, s.addedEntries.map((e) => h('li', {}, h('span', { class: 'tag' }, e.type), ' ', e.title, h('span', { class: 'text-sub text-small' }, `（${fmtDate(e.createdAt)}）`)))) : h('p', { class: 'text-sub' }, 'この月に残した記憶はありません。')),
      h('section', { class: 'card stack' }, h('h2', {}, 'AIのひとこと'), aiBox, h('div', { class: 'row' }, summarize)),
      timeLogSection(key),
    );
  }

  function timeLogSection(key) {
    const logs = state.data.timeLogs.filter((l) => monthKey(l.date) === key).sort((a, b) => b.date.localeCompare(a.date));
    const date = h('input', { type: 'date', class: 'input', value: new Date().toISOString().slice(0, 10) });
    const minutes = h('input', { type: 'number', class: 'input', min: 5, step: 5, value: 30, inputmode: 'numeric' });
    const note = h('input', { class: 'input', placeholder: '例：日報のまとめをAIで作成' });
    return h(
      'section',
      { class: 'card stack' },
      h('h2', {}, '削減時間の記録'),
      h('p', { class: 'text-sub' }, 'AIや会社の記憶を使って短くなった時間を記録します。試行期間の効果測定に使います（このPCにだけ保存されます）。'),
      h(
        'form',
        {
          class: 'grid-3',
          onSubmit: (e) => {
            e.preventDefault();
            const min = Number(minutes.value);
            if (!min || min <= 0) return minutes.focus();
            state.data.timeLogs.push({ date: new Date(date.value).toISOString(), minutes: min, note: note.value.trim() });
            save();
            toast('記録しました');
            draw();
          },
        },
        field('日付', date),
        field('削減した時間（分）', minutes),
        field('内容', note),
        h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn btn--primary btn--md' }, h('span', { class: 'label' }, '記録する'))),
      ),
      logs.length
        ? h(
            'table',
            { class: 'table' },
            h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, '日付'), h('th', { scope: 'col' }, '分'), h('th', { scope: 'col' }, '内容'))),
            h('tbody', {}, logs.map((l) => h('tr', {}, h('td', {}, fmtDate(l.date)), h('td', {}, l.minutes), h('td', {}, l.note)))),
          )
        : h('p', { class: 'text-sub' }, 'この月の記録はまだありません。'),
      h(
        'div',
        { class: 'row' },
        button('運営への報告用CSVを書き出す', {
          variant: 'secondary',
          iconName: 'download',
          onClick: () => {
            const s = monthlyStats(state.data, key);
            const rows = [['月', '記憶の増加', '記憶の合計', '対話回数', '削減時間(分)', 'シート充足率(%)'], [key, s.added, s.total, s.interviews, s.minutesSaved, sheetCompletion(state.data.sheet)], [], ['日付', '削減時間(分)', '内容'], ...logs.map((l) => [l.date.slice(0, 10), l.minutes, l.note])];
            const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
            downloadFile(`削減時間_${key}.csv`, csv, 'text/csv;charset=utf-8');
          },
        }),
      ),
      h('p', { class: 'text-small text-sub' }, 'CSVには記憶の中身は含まれません（件数と削減時間のみ）。月1回のフィードバック面談の前に運営へお送りください。'),
    );
  }

  append(el, h('div', { class: 'page-header page-header--row' }, h('div', {}, h('h1', {}, '月次レポート'), h('p', { class: 'lead' }, '今月増えた会社の記憶と、AIで削減できた時間。')), monthSelect), body);
  draw();
}

function stat(label, value, unit, sub) {
  return h('div', { class: 'stat' }, h('p', { class: 'stat__label' }, label), h('p', { class: 'stat__value' }, value, h('span', { class: 'stat__unit' }, unit)), sub && h('p', { class: 'stat__sub' }, sub));
}
