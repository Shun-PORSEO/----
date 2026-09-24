// サーバー（AI中継）との通信。サーバーに届かない静的ホスティング時はブラウザ内デモ応答で動く。

import * as mock from './mock.js';

let config = null;
let offline = false;

export async function loadConfig() {
  if (config) return config;
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) throw new Error();
    config = await res.json();
  } catch {
    offline = true;
    config = { demo: true, staticDemo: true, serviceName: '会社の記憶帳', operatorName: 'PORSEO', requiresMemberCode: false };
  }
  return config;
}

export function getConfig() {
  return config || { demo: true };
}

export function memberCode() {
  try {
    return localStorage.getItem('memberCode') || '';
  } catch {
    return '';
  }
}

export function setMemberCode(code) {
  try {
    localStorage.setItem('memberCode', code.trim());
  } catch {
    /* 保存できない環境では毎回入力 */
  }
}

export async function checkMemberCode(code) {
  const res = await fetch('/api/auth/check', { method: 'POST', headers: { 'x-member-code': code } });
  const body = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, member: body.member } : { ok: false, message: body.error || '確認できませんでした' };
}

const LOCAL_MOCK = {
  interview: (b) => mock.mockInterview(b),
  'research-structure': (b) => mock.mockResearchStructure(b),
  'structure-memory': (b) => mock.mockStructureMemory(b),
  'consult-check': (b) => mock.mockConsultCheck(b),
  answer: (b) => mock.mockAnswer(b),
  research: (b) => mock.mockResearch(b),
  'news-commentary': (b) => mock.mockNewsCommentary(b),
  'monthly-summary': (b) => mock.mockMonthlySummary(b),
};

function headers() {
  return { 'Content-Type': 'application/json', 'x-member-code': memberCode() };
}

export async function aiJson(task, body) {
  if (offline) return LOCAL_MOCK[task](body);
  const res = await fetch(`/api/ai/${task}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'AIとの通信に失敗しました');
  return data.result;
}

// onDelta(text), onStatus(message)。完了時に全文を返す。
export async function aiStream(task, body, { onDelta, onStatus, signal } = {}) {
  if (offline) {
    const text = LOCAL_MOCK[task](body);
    for (let i = 0; i < text.length; i += 6) {
      if (signal?.aborted) break;
      onDelta?.(text.slice(i, i + 6));
      await new Promise((r) => setTimeout(r, 10));
    }
    return text;
  }
  const res = await fetch(`/api/ai/${task}`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'AIとの通信に失敗しました');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const event = /^event: (.*)$/m.exec(raw)?.[1];
      const dataLine = /^data: (.*)$/m.exec(raw)?.[1];
      if (!event || !dataLine) continue;
      const data = JSON.parse(dataLine);
      if (event === 'delta') {
        full += data.text;
        onDelta?.(data.text);
      } else if (event === 'status') onStatus?.(data.message);
      else if (event === 'error') throw new Error(data.message);
    }
  }
  return full;
}
