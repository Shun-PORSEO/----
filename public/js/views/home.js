import { h, append, button, linkButton, progress, notice, toast } from '../ui.js';
import { state, addEntries } from '../state.js';
import { sheetCompletion, nextFocusField } from '../sheet.js';
import { monthlyStats } from '../memory.js';
import { aiJson } from '../api.js';
import { attachVoice } from '../voice.js';
import { privacyCard } from './common.js';

export function render(el, { go }) {
  const d = state.data;
  const stats = monthlyStats(d);
  const completion = sheetCompletion(d.sheet);
  const focus = nextFocusField(d.sheet);
  const daysSinceBackup = d.lastBackupAt ? Math.floor((Date.now() - new Date(d.lastBackupAt)) / 86400000) : null;

  const note = h('textarea', { rows: 4, class: 'input', placeholder: '例：見積もりは必ず2日以内に返す。遅れると失注するから。' });
  const voiceBtn = button('音声で入力', { variant: 'secondary', size: 'sm', iconName: 'mic', 'aria-pressed': 'false' });
  attachVoice(voiceBtn, note);
  const saveBtn = button('記憶に残す', {
    iconName: 'plus',
    onClick: async () => {
      const text = note.value.trim();
      if (!text) return note.focus();
      saveBtn.disabled = true;
      try {
        const m = await aiJson('structure-memory', { text });
        addEntries([m], 'manual');
        toast(`「${m.title}」を${m.type}として残しました`);
        note.value = '';
      } catch (e) {
        addEntries([{ type: '事実', title: text.slice(0, 20), content: text }], 'manual');
        toast('AIで整理できなかったため、そのまま残しました');
      } finally {
        saveBtn.disabled = false;
      }
    },
  });

  append(el, 
    h('p', { class: 'eyebrow' }, d.company.name || ''),
    h('h1', {}, 'ホーム'),
    (daysSinceBackup === null || daysSinceBackup > 30) &&
      d.entries.length > 0 &&
      notice('warning', daysSinceBackup === null ? 'まだバックアップがありません' : `最後のバックアップから${daysSinceBackup}日経ちました`, h('p', {}, 'PCの故障に備えて、暗号化バックアップを外付けディスクやUSBメモリに保存しましょう。'), h('a', { href: '#/settings' }, 'バックアップを作る')),
    h(
      'div',
      { class: 'stat-grid' },
      stat('会社の記憶', `${d.entries.length}`, '件'),
      stat('今月増えた記憶', `+${stats.added}`, '件', stats.prevAdded ? `先月 +${stats.prevAdded}件` : ''),
      stat('経営デザインシート', `${completion}`, '%', null, progress(completion, '経営デザインシートの充足率')),
      stat('今月の削減時間', `${Math.round(stats.minutesSaved / 6) / 10}`, '時間', '記録は月次レポートから'),
    ),
    h(
      'section',
      { class: 'card card--action' },
      h('h2', {}, '今日の10分'),
      focus
        ? h('p', {}, `AIが質問します。答えるだけで経営デザインシートの「${focus.label}」が埋まっていきます。音声でも答えられます。`)
        : h('p', {}, '経営デザインシートはひと通り埋まりました。気になる項目をさらに深めるか、最近の判断を残しましょう。'),
      button('10分だけAIと話す', { size: 'lg', iconName: 'mic', onClick: () => go('interview') }),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, '思いついたら、すぐ残す'),
      h('p', { class: 'text-sub' }, '判断の理由、仕事のコツ、お客様とのやりとりなど。AIが種類とタイトルを付けて整理します。'),
      note,
      h('div', { class: 'row' }, voiceBtn, saveBtn),
    ),
    h('div', { class: 'grid-2' }, h('section', { class: 'card' }, h('h2', {}, '自社AIに聞く'), h('p', {}, '会社の記憶に沿って答えます。社員への説明文づくりや、判断の整理にも。'), linkButton('質問する', '#/ask', { variant: 'secondary' })), privacyCard({ compact: true })),
  );
}

function stat(label, value, unit, sub, extra) {
  return h('div', { class: 'stat' }, h('p', { class: 'stat__label' }, label), h('p', { class: 'stat__value' }, value, h('span', { class: 'stat__unit' }, unit)), extra, sub && h('p', { class: 'stat__sub' }, sub));
}
