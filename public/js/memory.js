// 「会社の記憶」のデータモデルと、質問に関係する記憶だけを選ぶ検索。
// DOM 非依存（ブラウザ・Node 両対応）。

import { emptySheet, SHEET_FIELDS, sheetToMarkdown } from './sheet.js';

export const MEMORY_TYPES = [
  { id: '理念', desc: '会社の存在意義・大切にしている価値観' },
  { id: '判断', desc: '社長が下した判断とその理由' },
  { id: '業務手順', desc: '仕事の進め方・段取り・コツ' },
  { id: '顧客', desc: 'お客様・取引先についての知識' },
  { id: '人・組織', desc: '社員・役割・育て方' },
  { id: '事実', desc: '会社の基本情報・数字・沿革' },
];
export const MEMORY_TYPE_IDS = MEMORY_TYPES.map((t) => t.id);

export const SOURCE_LABELS = {
  manual: '手入力',
  interview: 'AI聞き出し',
  research: '公開情報の調査',
  answer: 'AIとの相談',
  news: 'AIニュース',
};

export const DATA_VERSION = 1;

export function emptyData() {
  return {
    version: DATA_VERSION,
    createdAt: new Date().toISOString(),
    company: { name: '', url: '', address: '', industry: '', employees: '', founded: '', president: '', overview: '' },
    entries: [],
    sheet: emptySheet(),
    interviews: [],
    timeLogs: [],
    consultations: [],
    researchReport: '',
  };
}

export function normalizeData(raw) {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    company: { ...base.company, ...(raw.company || {}) },
    entries: Array.isArray(raw.entries) ? raw.entries : [],
    sheet: raw.sheet?.fields ? raw.sheet : emptySheet(),
    interviews: Array.isArray(raw.interviews) ? raw.interviews : [],
    timeLogs: Array.isArray(raw.timeLogs) ? raw.timeLogs : [],
    consultations: Array.isArray(raw.consultations) ? raw.consultations : [],
  };
}

export function newId() {
  const rnd = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);
  return rnd.replace(/-/g, '').slice(0, 16);
}

export function makeEntry({ type = '事実', title = '', content = '', tags = [], source = 'manual' }, now = new Date().toISOString()) {
  return {
    id: newId(),
    type: MEMORY_TYPE_IDS.includes(type) ? type : '事実',
    title: String(title).trim() || String(content).trim().slice(0, 30),
    content: String(content).trim(),
    tags: Array.isArray(tags) ? tags.filter(Boolean).map(String) : [],
    source,
    createdAt: now,
    updatedAt: now,
  };
}

// ---- 検索：日本語は分かち書きせず文字bigramで照合する（依存ゼロで十分な精度） ----

export function normalizeText(s) {
  return String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s、。，．・「」『』（）()［］\[\]【】!！?？:：;；"'`~〜ー\-_/\\|<>＜＞=＋+*＊#＃%％&＆@＠^]+/g, ' ');
}

export function bigrams(s) {
  const out = new Set();
  for (const chunk of normalizeText(s).split(' ')) {
    if (!chunk) continue;
    if (chunk.length === 1) out.add(chunk);
    for (let i = 0; i < chunk.length - 1; i++) out.add(chunk.slice(i, i + 2));
  }
  return out;
}

export function scoreEntry(queryGrams, entry) {
  if (!queryGrams.size) return 0;
  const titleGrams = bigrams(entry.title + ' ' + (entry.tags || []).join(' '));
  const bodyGrams = bigrams(entry.content);
  let hit = 0;
  for (const g of queryGrams) {
    if (titleGrams.has(g)) hit += 2;
    else if (bodyGrams.has(g)) hit += 1;
  }
  return hit / Math.sqrt(queryGrams.size * Math.max(8, bodyGrams.size) / 8);
}

// 質問に必要な部分だけを選ぶ。maxChars を超える分は送らない。
export function selectRelevant(entries, query, { limit = 8, maxChars = 6000, alwaysTypes = ['理念'] } = {}) {
  const q = bigrams(query);
  const scored = entries
    .map((e) => ({ e, s: scoreEntry(q, e) }))
    .filter((x) => x.s > 0.15)
    .sort((a, b) => b.s - a.s);
  const picked = [];
  const seen = new Set();
  // 理念は判断の軸なので、少しでも関連があれば優先、なければ最新1件を添える
  const anchor = entries.filter((e) => alwaysTypes.includes(e.type)).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];
  if (anchor) {
    picked.push(anchor);
    seen.add(anchor.id);
  }
  for (const { e } of scored) {
    if (picked.length >= limit) break;
    if (seen.has(e.id)) continue;
    picked.push(e);
    seen.add(e.id);
  }
  let used = 0;
  const result = [];
  for (const e of picked) {
    const size = e.title.length + e.content.length;
    if (used + size > maxChars) continue;
    used += size;
    result.push(e);
  }
  return result;
}

// AIに送る最小限の形
export function toContext(entries) {
  return entries.map((e) => ({ type: e.type, title: e.title, content: e.content, date: (e.updatedAt || e.createdAt || '').slice(0, 10) }));
}

export function companyBrief(company) {
  const c = company || {};
  return [
    c.name && `会社名: ${c.name}`,
    c.industry && `業種: ${c.industry}`,
    c.address && `所在地: ${c.address}`,
    c.employees && `従業員数: ${c.employees}`,
    c.founded && `創業: ${c.founded}`,
    c.overview && `概要: ${c.overview}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ---- 月次レポート「今月増えた会社の記憶」 ----

export function monthKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

export function prevMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return monthKey(d);
}

export function monthlyStats(data, key = monthKey(new Date())) {
  const inMonth = (iso) => iso && monthKey(iso) === key;
  const added = data.entries.filter((e) => inMonth(e.createdAt));
  const prevKey = prevMonthKey(key);
  const prevAdded = data.entries.filter((e) => e.createdAt && monthKey(e.createdAt) === prevKey);
  const byType = Object.fromEntries(MEMORY_TYPE_IDS.map((t) => [t, added.filter((e) => e.type === t).length]));
  const interviews = data.interviews.filter((i) => inMonth(i.startedAt));
  const minutesSaved = data.timeLogs.filter((l) => inMonth(l.date)).reduce((s, l) => s + (Number(l.minutes) || 0), 0);
  const sheetFieldsUpdated = SHEET_FIELDS.filter((f) => inMonth(data.sheet?.fields?.[f.id]?.updatedAt)).map((f) => f.label);
  return {
    month: key,
    total: data.entries.length,
    added: added.length,
    prevAdded: prevAdded.length,
    byType,
    addedEntries: added,
    interviews: interviews.length,
    interviewMinutes: interviews.reduce((s, i) => s + (i.minutes || 0), 0),
    minutesSaved,
    sheetFieldsUpdated,
  };
}

// 原本フォルダに一緒に書き出す、人が読める形のファイル
export function dataToMarkdown(data) {
  const lines = [`# 会社の記憶　${data.company.name || ''}`.trimEnd(), '', `最終更新: ${new Date().toLocaleString('ja-JP')}`, ''];
  const brief = companyBrief(data.company);
  if (brief) lines.push('## 会社の基本情報', '', brief, '');
  for (const t of MEMORY_TYPE_IDS) {
    const list = data.entries.filter((e) => e.type === t);
    if (!list.length) continue;
    lines.push(`## ${t}（${list.length}件）`, '');
    for (const e of list) {
      lines.push(`### ${e.title}`, '', e.content, '', `<small>${SOURCE_LABELS[e.source] || e.source}／${(e.createdAt || '').slice(0, 10)}</small>`, '');
    }
  }
  lines.push('---', '', sheetToMarkdown(data.sheet, data.company));
  return lines.join('\n');
}
