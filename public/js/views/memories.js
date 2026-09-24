// 会社の記憶（残す）：一覧・追加・編集・削除

import { h, append, button, field, toast, fmtDate } from '../ui.js';
import { state, save, addEntries } from '../state.js';
import { MEMORY_TYPES, MEMORY_TYPE_IDS, SOURCE_LABELS, bigrams, scoreEntry } from '../memory.js';
import { attachVoice } from '../voice.js';
import { pageHeader } from './common.js';

export function render(el) {
  let filter = 'すべて';
  let query = '';
  const list = h('div', { class: 'memory-list' });
  const count = h('p', { class: 'text-sub', role: 'status' });

  const chips = h(
    'div',
    { class: 'chips', role: 'group', 'aria-label': '種類で絞り込む' },
    ['すべて', ...MEMORY_TYPE_IDS].map((t) =>
      h('button', {
        type: 'button',
        class: 'chip',
        'aria-pressed': t === filter ? 'true' : 'false',
        onClick: (e) => {
          filter = t;
          chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', c === e.currentTarget ? 'true' : 'false'));
          renderList();
        },
        text: t,
      }),
    ),
  );
  const search = h('input', { type: 'search', class: 'input', placeholder: '言葉で探す（例：見積、採用）', onInput: (e) => ((query = e.target.value), renderList()) });

  function renderList() {
    let entries = state.data.entries.filter((e) => filter === 'すべて' || e.type === filter);
    if (query.trim()) {
      const q = bigrams(query);
      entries = entries.map((e) => ({ e, s: scoreEntry(q, e) })).filter((x) => x.s > 0.1).sort((a, b) => b.s - a.s).map((x) => x.e);
    }
    count.textContent = `${entries.length}件`;
    list.replaceChildren(...(entries.length ? entries.map(card) : [h('p', { class: 'empty' }, state.data.entries.length ? '該当する記憶はありません。' : 'まだ記憶がありません。「AIと話して残す」か、下のフォームから残しましょう。')]));
  }

  function card(entry) {
    const c = h(
      'article',
      { class: 'memory-card' },
      h('div', { class: 'memory-card__meta' }, h('span', { class: 'tag' }, entry.type), h('span', { class: 'text-sub text-small' }, `${SOURCE_LABELS[entry.source] || ''}／${fmtDate(entry.createdAt)}`)),
      h('h3', { class: 'memory-card__title' }, entry.title),
      h('p', { class: 'memory-card__body' }, entry.content),
      entry.tags?.length > 0 && h('p', { class: 'text-small text-sub' }, entry.tags.map((t) => '#' + t).join(' ')),
      h(
        'div',
        { class: 'row' },
        h('button', { type: 'button', class: 'btn btn--text', onClick: () => c.replaceWith(editor(entry)) }, '編集'),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--text btn--danger',
            onClick: () => {
              if (!confirm(`「${entry.title}」を削除しますか？`)) return;
              state.data.entries = state.data.entries.filter((e) => e.id !== entry.id);
              save();
              renderList();
              toast('削除しました');
            },
          },
          '削除',
        ),
      ),
    );
    return c;
  }

  function editor(entry) {
    const type = h('select', { class: 'input' }, MEMORY_TYPES.map((t) => h('option', { value: t.id, selected: t.id === entry.type }, `${t.id}（${t.desc}）`)));
    const title = h('input', { class: 'input', value: entry.title });
    const content = h('textarea', { class: 'input', rows: 5 }, entry.content);
    return h(
      'form',
      {
        class: 'memory-card memory-card--edit stack',
        onSubmit: (e) => {
          e.preventDefault();
          Object.assign(entry, { type: type.value, title: title.value.trim() || entry.title, content: content.value.trim(), updatedAt: new Date().toISOString() });
          save();
          renderList();
          toast('更新しました');
        },
      },
      field('種類', type),
      field('タイトル', title),
      field('内容', content),
      h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn btn--primary btn--md' }, h('span', { class: 'label' }, '保存')), h('button', { type: 'button', class: 'btn btn--secondary btn--md', onClick: renderList }, h('span', { class: 'label' }, 'やめる'))),
    );
  }

  // 追加フォーム
  const newType = h('select', { class: 'input' }, MEMORY_TYPES.map((t) => h('option', { value: t.id }, `${t.id}（${t.desc}）`)));
  newType.value = '判断';
  const newTitle = h('input', { class: 'input', placeholder: '例：値引きは5%まで' });
  const newContent = h('textarea', { class: 'input', rows: 4, placeholder: '理由や背景も一緒に書くと、AIや社員が判断の軸を理解できます。' });
  const voiceBtn = button('音声で入力', { variant: 'secondary', size: 'sm', iconName: 'mic', 'aria-pressed': 'false' });
  attachVoice(voiceBtn, newContent);

  append(el, 
    pageHeader('会社の記憶', '社長の判断・理念・業務手順。使うほど増えていく、会社の資産です。'),
    h(
      'details',
      { class: 'card add-memory' },
      h('summary', { class: 'h3' }, '記憶を追加する'),
      h(
        'form',
        {
          class: 'stack',
          onSubmit: (e) => {
            e.preventDefault();
            if (!newContent.value.trim()) return newContent.focus();
            addEntries([{ type: newType.value, title: newTitle.value, content: newContent.value }], 'manual');
            newTitle.value = '';
            newContent.value = '';
            renderList();
            toast('残しました');
          },
        },
        field('種類', newType),
        field('タイトル', newTitle, { hint: '空欄なら内容の先頭が使われます' }),
        field('内容', newContent, { required: true }),
        h('div', { class: 'row' }, voiceBtn, h('button', { type: 'submit', class: 'btn btn--primary btn--md' }, h('span', { class: 'label' }, '残す'))),
      ),
    ),
    h('div', { class: 'toolbar' }, chips, search),
    count,
    list,
  );
  renderList();
}
