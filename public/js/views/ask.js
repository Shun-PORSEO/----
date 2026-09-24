// 自社専用AI（答える）：質問に関係する記憶だけを選んで送り、記憶に沿って答える

import { h, append, button, notice, markdown, toast } from '../ui.js';
import { state, addEntries } from '../state.js';
import { aiStream } from '../api.js';
import { attachVoice } from '../voice.js';
import { selectRelevant, toContext, companyBrief } from '../memory.js';
import { pageHeader, sentContextDetails } from './common.js';

const EXAMPLES = ['新人に見積もりの出し方を説明する文章を作って', 'うちの会社で最初にAIを使うならどの業務がいい？', '値上げをお客様にどう伝えるべきか、うちの考え方に沿って整理して'];

// 画面を離れても直近の会話は残す（ページ再読込で消える）
const history = [];

export function render(el) {
  const log = h('div', { class: 'qa-log' });
  const input = h('textarea', { class: 'input', rows: 3, placeholder: '質問を入力（Ctrl+Enterで送信）' });
  const voiceBtn = button('音声で入力', { variant: 'secondary', iconName: 'mic', 'aria-pressed': 'false' });
  const voice = attachVoice(voiceBtn, input);
  const sendBtn = button('質問する', { iconName: 'send' });
  let controller = null;

  function renderTurn(turn) {
    const answerEl = h('div', { class: 'ai-output' });
    answerEl.innerHTML = markdown(turn.answer || '');
    const saveBtn = h(
      'button',
      {
        type: 'button',
        class: 'btn btn--text',
        onClick: () => {
          addEntries([{ type: '判断', title: turn.question.slice(0, 24), content: `Q. ${turn.question}\n\nA. ${turn.answer}` }], 'answer');
          saveBtn.disabled = true;
          saveBtn.textContent = '記憶に残しました';
          toast('この回答を会社の記憶に残しました');
        },
      },
      'この回答を記憶に残す',
    );
    const block = h(
      'article',
      { class: 'qa' },
      h('div', { class: 'bubble bubble--user' }, h('p', { class: 'bubble__who' }, '社長'), h('p', { class: 'bubble__text' }, turn.question)),
      h('div', { class: 'bubble bubble--assistant' }, h('p', { class: 'bubble__who' }, '自社AI'), answerEl, turn.error && notice('error', 'エラー', h('p', {}, turn.error)), sentContextDetails(turn.context), turn.done && !turn.error && h('div', { class: 'row' }, saveBtn)),
    );
    return { block, answerEl };
  }

  async function submit(q) {
    const question = (q ?? input.value).trim();
    if (!question || controller) return;
    voice.stop();
    input.value = '';
    const picked = selectRelevant(state.data.entries, question);
    const context = toContext(picked);
    const turn = { question, answer: '', context, done: false };
    const { block, answerEl } = renderTurn(turn);
    log.append(block);
    block.scrollIntoView({ behavior: 'smooth', block: 'start' });
    controller = new AbortController();
    sendBtn.disabled = true;
    try {
      await aiStream(
        'answer',
        { question, context, company: companyBrief(state.data.company), history: history.flatMap((t) => [{ role: 'user', text: t.question }, { role: 'assistant', text: t.answer }]).slice(-8) },
        {
          signal: controller.signal,
          onDelta: (t) => {
            turn.answer += t;
            answerEl.innerHTML = markdown(turn.answer);
          },
        },
      );
    } catch (e) {
      turn.error = e.message;
    }
    turn.done = true;
    history.push(turn);
    block.replaceWith(renderTurn(turn).block);
    controller = null;
    sendBtn.disabled = false;
  }

  sendBtn.addEventListener('click', () => submit());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  });

  for (const t of history) log.append(renderTurn(t).block);

  append(el, 
    pageHeader('自社AIに聞く', '会社の記憶に沿って答えます。質問に関係する記憶だけをAIに送ります。'),
    state.data.entries.length < 5 && notice('info', '記憶が増えるほど、答えが御社らしくなります', h('p', {}, `いまの記憶は${state.data.entries.length}件です。「AIと話して残す」で増やしましょう。`)),
    log,
    h(
      'div',
      { class: 'card composer composer--sticky' },
      h('div', { class: 'chips' }, EXAMPLES.map((ex) => h('button', { type: 'button', class: 'chip', onClick: () => submit(ex) }, ex))),
      input,
      h('div', { class: 'row' }, voiceBtn, sendBtn),
    ),
  );

  return () => {
    controller?.abort();
    voice.stop();
  };
}
