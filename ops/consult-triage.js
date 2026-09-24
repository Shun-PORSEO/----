// お悩み相談の一次処理（運営側）。「例外だけが人に上がってくる」ための振り分け。
//
//   node ops/consult-triage.js responses.csv
//     … Forms の回答CSVを読み、各相談について「範囲判定・分類・回答案・自信度」を作る。
//       結果: ops/data/queue-YYYY-MM-DD.json と .md（運営者が確認するキュー）
//
//   node ops/consult-triage.js --commit ops/data/queue-YYYY-MM-DD.json
//     … キューの finalAnswer を記入したものを「お悩みと解決策プール」(ops/data/pool.jsonl) に追加。
//
// CSVの列名は「相談内容」「会社名」「メールアドレス」「タイムスタンプ」を想定（部分一致で探す）。

import '../server/env.js';
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { loadConfig } from '../server/config.js';
import { createAi } from '../server/ai.js';
import { bigrams } from '../public/js/memory.js';

const DATA = new URL('./data/', import.meta.url);
const POOL = new URL('pool.jsonl', DATA);

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x !== '')) rows.push(row);
      (row = []), (cell = '');
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

const pick = (row, key) => Object.entries(row).find(([k]) => k.includes(key))?.[1] || '';

function similarity(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  let hit = 0;
  for (const g of A) if (B.has(g)) hit++;
  return hit / Math.max(1, Math.sqrt(A.size * B.size));
}

async function loadPool() {
  try {
    return (await readFile(POOL, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

const SYSTEM = `あなたは「会社の記憶帳」のお悩み相談の一次担当です。北海道内の中小企業の社長からの相談に、回答案を作ります。
- 受け付けるのはIT・AI活用の相談のみ。資金繰り・労務・税務・法務などは範囲外とし、商工会議所の経営相談窓口・北海道よろず支援拠点・士業などの相談先を案内する文面を作ります。
- 類似事例（過去の回答）があれば、それを踏まえて一貫した回答にします。
- confidence は、この回答案を運営者が手直しなしで送れる自信（0〜1）。前例がない・状況が不明確・誤ると損害が大きい場合は低くします。
- 回答案は社長向けに平易に、具体的な次の一歩を含めて600字以内。`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['inScope', 'category', 'confidence', 'draftAnswer', 'reasonForHuman'],
  properties: {
    inScope: { type: 'boolean' },
    category: { type: 'string' },
    confidence: { type: 'number' },
    draftAnswer: { type: 'string' },
    reasonForHuman: { type: 'string' },
  },
};

async function triage(csvPath) {
  const config = loadConfig();
  if (config.demo) throw new Error('ANTHROPIC_API_KEY を設定してください');
  const ai = createAi(config);
  const rows = parseCsv(await readFile(csvPath, 'utf8'));
  const pool = await loadPool();
  const queue = [];
  for (const [i, row] of rows.entries()) {
    const question = pick(row, '相談');
    if (!question) continue;
    const similar = pool
      .map((p) => ({ p, s: similarity(question, p.question) }))
      .filter((x) => x.s > 0.2)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3);
    const r = await ai.json({
      system: SYSTEM,
      schema: SCHEMA,
      effort: 'medium',
      messages: [
        {
          role: 'user',
          content: `<similar_cases>\n${similar.map(({ p }) => `Q: ${p.question}\nA: ${p.answer}`).join('\n---\n') || 'なし'}\n</similar_cases>\n\n<consultation>\n${question}\n</consultation>`,
        },
      ],
    });
    // 例外判定：範囲外・自信が低い・前例なし は人が見る
    const needsHuman = !r.inScope ? false : r.confidence < 0.7 || similar.length === 0;
    queue.push({ id: i + 1, receivedAt: pick(row, 'タイムスタンプ'), company: pick(row, '会社'), email: pick(row, 'メール'), question, ...r, similarCount: similar.length, needsHuman, finalAnswer: '' });
    console.log(`#${i + 1} ${r.inScope ? r.category : '範囲外'} 自信度${r.confidence.toFixed(2)} ${needsHuman ? '→ 要確認' : ''}`);
  }
  await mkdir(DATA, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  await writeFile(new URL(`queue-${day}.json`, DATA), JSON.stringify(queue, null, 2));
  const md = [`# 相談キュー ${day}`, '', `全${queue.length}件／要確認 ${queue.filter((q) => q.needsHuman).length}件／範囲外 ${queue.filter((q) => !q.inScope).length}件`, ''];
  for (const q of [...queue].sort((a, b) => Number(b.needsHuman) - Number(a.needsHuman))) {
    md.push(`## #${q.id} ${q.company}（${q.inScope ? q.category : '範囲外'}）${q.needsHuman ? ' ⚠要確認' : ''}`, '', `**相談**: ${q.question}`, '', `**回答案**（自信度 ${q.confidence}）:`, '', q.draftAnswer, '', q.needsHuman ? `**人が見る理由**: ${q.reasonForHuman || (q.similarCount ? '' : '前例なし')}` : '', '');
  }
  await writeFile(new URL(`queue-${day}.md`, DATA), md.join('\n'));
  console.log(`キューを保存しました: ops/data/queue-${day}.md`);
}

async function commit(queuePath) {
  const queue = JSON.parse(await readFile(queuePath, 'utf8'));
  let n = 0;
  for (const q of queue) {
    const answer = (q.finalAnswer || (!q.needsHuman ? q.draftAnswer : '')).trim();
    if (!answer || !q.inScope) continue;
    // プールには会社名・メールを残さない（事例として再利用するため）
    await appendFile(POOL, JSON.stringify({ category: q.category, question: q.question, answer, answeredAt: new Date().toISOString() }) + '\n');
    n++;
  }
  console.log(`プールに${n}件追加しました（ops/data/pool.jsonl）`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const i = process.argv.indexOf('--commit');
  (i > 0 ? commit(process.argv[i + 1]) : triage(process.argv[2])).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
