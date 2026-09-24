// AIとの対話で聞き出す（1回10分）。回答が経営デザインシートに反映される様子をその場で見せる。

import { h, append, button, notice, toast, progress, icon } from '../ui.js';
import { state, save, addEntries, updateSheet, writeExtra } from '../state.js';
import { aiJson } from '../api.js';
import { attachVoice, voiceSupported } from '../voice.js';
import { SHEET_SECTIONS, SHEET_FIELDS, fieldFill, sheetCompletion, nextFocusField } from '../sheet.js';
import { companyBrief, newId } from '../memory.js';
import { pageHeader } from './common.js';

const SESSION_SECONDS = 10 * 60;

export function render(el) {
  const history = [];
  const session = { id: newId(), startedAt: new Date().toISOString(), turns: 0, memories: 0, fields: new Set() };
  let started = false;
  let remaining = SESSION_SECONDS;
  let timerId = null;
  let busy = false;

  const timerEl = h('span', { class: 'timer', 'aria-live': 'off' }, '10:00');
  const log = h('div', { class: 'chat-log', 'aria-live': 'polite' });
  const input = h('textarea', { class: 'input', rows: 4, placeholder: 'ここに答えを入力（Ctrl+Enterで送信）', disabled: true });
  const voiceBtn = button('音声で入力', { variant: 'secondary', iconName: 'mic', 'aria-pressed': 'false', disabled: true });
  const voice = attachVoice(voiceBtn, input);
  const sendBtn = button('答える', { iconName: 'send', disabled: true });
  const endBtn = button('今日はここまで', { variant: 'secondary', disabled: true });
  const sheetPanel = h('div', { class: 'sheet-live' });
  const banner = h('div');

  function renderSheet(changed = []) {
    const pct = sheetCompletion(state.data.sheet);
    sheetPanel.replaceChildren(
      h('div', { class: 'sheet-live__head' }, h('h2', { class: 'h3' }, '経営デザインシート'), h('span', { class: 'sheet-live__pct' }, `${pct}%`)),
      progress(pct, '経営デザインシートの充足率'),
      ...SHEET_SECTIONS.map((s) =>
        h(
          'div',
          { class: 'sheet-live__section' },
          h('p', { class: 'sheet-live__section-label' }, s.label),
          s.fields.map((f) => {
            const text = state.data.sheet.fields[f.id]?.text || '';
            const isNew = changed.includes(f.id);
            return h(
              'div',
              { class: 'sheet-live__field' + (isNew ? ' is-updated' : '') },
              h('p', { class: 'sheet-live__label' }, f.label, isNew && h('span', { class: 'badge badge--success' }, icon('check', 14), '反映しました')),
              h('div', { class: 'mini-bar' }, h('div', { style: `width:${Math.round(fieldFill(text) * 100)}%` })),
              text && h('p', { class: 'sheet-live__text' }, text.length > 90 ? text.slice(0, 90) + '…' : text),
            );
          }),
        ),
      ),
    );
    const upd = sheetPanel.querySelector('.is-updated');
    upd?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function addBubble(role, text) {
    const b = h('div', { class: `bubble bubble--${role}` }, h('p', { class: 'bubble__who' }, role === 'assistant' ? 'AI' : '社長'), h('p', { class: 'bubble__text' }, text));
    log.append(b);
    log.scrollTop = log.scrollHeight;
    return b;
  }

  function tick() {
    remaining--;
    const m = Math.max(0, Math.floor(remaining / 60));
    const s = Math.max(0, remaining % 60);
    timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
    if (remaining === 0) {
      banner.replaceChildren(notice('info', '10分が経ちました', h('p', {}, 'おつかれさまでした。続けても構いませんし、「今日はここまで」で終えても大丈夫です。今日の分はもう保存されています。')));
      timerEl.classList.add('is-over');
    }
  }

  async function ask(answer) {
    if (busy) return;
    busy = true;
    sendBtn.disabled = true;
    const focus = nextFocusField(state.data.sheet);
    const thinking = addBubble('assistant', '考えています…');
    thinking.classList.add('is-pending');
    try {
      const r = await aiJson('interview', {
        company: companyBrief(state.data.company),
        sheet: state.data.sheet,
        history,
        answer,
        focusField: focus?.id,
      });
      if (answer) history.push({ role: 'user', text: answer });
      history.push({ role: 'assistant', text: r.reply });
      thinking.remove();
      addBubble('assistant', r.reply);
      const changed = updateSheet(r.sheetUpdates || []);
      changed.forEach((f) => session.fields.add(f));
      const added = addEntries(r.memories || [], 'interview');
      session.memories += added.length;
      if (added.length) toast(`会社の記憶が${added.length}件増えました`);
      renderSheet(changed);
    } catch (e) {
      thinking.remove();
      banner.replaceChildren(notice('error', 'AIとの通信に失敗しました', h('p', {}, e.message)));
      if (answer) input.value = answer; // 入力を失わない
    } finally {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  async function submit() {
    const text = input.value.trim();
    if (!text || busy) return;
    voice.stop();
    input.value = '';
    addBubble('user', text);
    session.turns++;
    await ask(text);
  }

  async function finish() {
    clearInterval(timerId);
    voice.stop();
    const minutes = Math.max(1, Math.round((SESSION_SECONDS - remaining) / 60));
    const rec = { id: session.id, startedAt: session.startedAt, endedAt: new Date().toISOString(), minutes, turns: session.turns, memories: session.memories, fields: [...session.fields] };
    state.data.interviews.push(rec);
    await save();
    if (history.length) {
      const d = new Date(session.startedAt);
      const name = `対話ログ/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.md`;
      const body = history.map((t) => `**${t.role === 'assistant' ? 'AI' : '社長'}**: ${t.text}`).join('\n\n');
      try {
        await writeExtra(name, `# AIとの対話 ${d.toLocaleString('ja-JP')}\n\n${body}\n`);
      } catch {
        /* ログの書き出しに失敗しても本体は保存済み */
      }
    }
    const fieldLabels = rec.fields.map((id) => SHEET_FIELDS.find((f) => f.id === id)?.label).filter(Boolean);
    el.replaceChildren(
      pageHeader('おつかれさまでした', `${minutes}分の対話で、会社の記憶が${rec.memories}件増えました。`),
      h(
        'section',
        { class: 'card stack' },
        h('h2', {}, '今日の成果'),
        h('ul', {}, h('li', {}, `会社の記憶: +${rec.memories}件`), h('li', {}, `経営デザインシートの更新: ${fieldLabels.length ? fieldLabels.join('、') : 'なし'}`), h('li', {}, `シートの充足率: ${sheetCompletion(state.data.sheet)}%`)),
        h('div', { class: 'row' }, h('a', { class: 'btn btn--primary btn--md', href: '#/sheet' }, h('span', { class: 'label' }, 'シートを見る')), h('a', { class: 'btn btn--secondary btn--md', href: '#/memories' }, h('span', { class: 'label' }, '増えた記憶を確認する'))),
      ),
    );
  }

  const startBtn = button('対話を始める', {
    size: 'lg',
    iconName: 'mic',
    onClick: () => {
      started = true;
      startBtn.remove();
      [input, voiceBtn, sendBtn, endBtn].forEach((x) => (x.disabled = false));
      timerId = setInterval(tick, 1000);
      ask('');
    },
  });

  sendBtn.addEventListener('click', submit);
  endBtn.addEventListener('click', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  });

  append(el, 
    h('div', { class: 'page-header page-header--row' }, h('div', {}, h('h1', {}, 'AIと話して残す'), h('p', { class: 'lead' }, 'AIの質問に答えるだけ。1回10分で区切ります。')), h('div', { class: 'timer-box' }, h('span', { class: 'text-sub' }, '残り'), timerEl)),
    banner,
    h(
      'div',
      { class: 'interview' },
      h(
        'div',
        { class: 'interview__chat card' },
        log,
        startBtn,
        h('div', { class: 'composer' }, input, h('div', { class: 'row row--between' }, h('div', { class: 'row' }, voiceBtn, sendBtn), endBtn)),
        voiceSupported && h('p', { class: 'text-small text-sub' }, '※ 音声入力はブラウザの機能を使うため、音声がブラウザ提供元（Google / Microsoft）で文字に変換される場合があります。気になる場合はキーボード入力か、PCの音声入力（Windows: Windowsキー+H）をお使いください。'),
      ),
      h('aside', { class: 'interview__sheet card', 'aria-label': '経営デザインシートの反映状況' }, sheetPanel),
    ),
  );
  renderSheet();

  return () => {
    clearInterval(timerId);
    voice.stop();
    if (started && session.turns > 0 && !state.data.interviews.some((i) => i.id === session.id)) {
      state.data.interviews.push({ id: session.id, startedAt: session.startedAt, endedAt: new Date().toISOString(), minutes: Math.max(1, Math.round((SESSION_SECONDS - remaining) / 60)), turns: session.turns, memories: session.memories, fields: [...session.fields] });
      save();
    }
  };
}
