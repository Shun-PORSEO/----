// 経営デザインシート（内閣府 知的財産戦略推進事務局の枠組み）の項目定義と出力。
// ブラウザとサーバー（テスト）の両方から読み込めるよう、DOM に依存しない。

export const SHEET_SECTIONS = [
  {
    id: 'purpose',
    label: '自社の目的・特徴',
    fields: [
      { id: 'philosophy', label: '企業理念・存在意義', hint: '何のためにこの会社があるのか。創業の想い、社長が大切にしていること。' },
      { id: 'strengths', label: '自社の強み・特徴', hint: 'お客様に選ばれる理由。他社にない技術・関係・ノウハウ。' },
    ],
  },
  {
    id: 'environment',
    label: 'A 外部環境の変化',
    fields: [
      { id: 'environment', label: '外部環境の変化（機会と脅威）', hint: '人口減少、人手不足、原材料高、AI・デジタル化、道内の需要変化など。' },
    ],
  },
  {
    id: 'past',
    label: 'B これまで',
    fields: [
      { id: 'pastValue', label: '提供してきた価値', hint: 'お客様にどんな価値を届けてきたか。' },
      { id: 'pastModel', label: 'ビジネスモデル（儲け方）', hint: '誰に・何を・どう届けて・どう収益を得てきたか。' },
      { id: 'pastResources', label: '強みとなってきた資源', hint: '人材、技術、設備、顧客基盤、地域での信用、ノウハウなど。' },
    ],
  },
  {
    id: 'future',
    label: 'C これから（5〜10年後）',
    fields: [
      { id: 'futureValue', label: '提供したい価値', hint: '将来、誰にどんな価値を届けたいか。' },
      { id: 'futureModel', label: 'これからのビジネスモデル', hint: '将来の儲け方。新しい顧客、商品、届け方。' },
      { id: 'futureResources', label: '必要になる資源', hint: '将来のために必要な人材・技術・設備・関係。' },
    ],
  },
  {
    id: 'strategy',
    label: 'D 移行戦略',
    fields: [
      { id: 'gap', label: '「これまで」と「これから」のギャップ', hint: '足りないもの、やめるべきもの。' },
      { id: 'strategy', label: '移行のための取り組み', hint: 'いつまでに、何を、どうするか。AI・IT活用を含む。' },
    ],
  },
];

export const SHEET_FIELDS = SHEET_SECTIONS.flatMap((s) => s.fields.map((f) => ({ ...f, section: s.id, sectionLabel: s.label })));
export const SHEET_FIELD_IDS = SHEET_FIELDS.map((f) => f.id);

export function emptySheet() {
  return { fields: {}, updatedAt: null };
}

// 1項目あたり「60文字以上で充足」とみなす簡易指標
const FILLED_THRESHOLD = 60;

export function fieldFill(text) {
  const len = (text || '').trim().length;
  if (len === 0) return 0;
  return Math.min(1, len / FILLED_THRESHOLD);
}

export function sheetCompletion(sheet) {
  const fields = sheet?.fields || {};
  const total = SHEET_FIELD_IDS.reduce((sum, id) => sum + fieldFill(fields[id]?.text), 0);
  return Math.round((total / SHEET_FIELD_IDS.length) * 100);
}

// 聞き出しで次に深掘りする項目（最も埋まっていない項目）
export function nextFocusField(sheet) {
  const fields = sheet?.fields || {};
  let best = SHEET_FIELDS[0];
  let bestFill = Infinity;
  for (const f of SHEET_FIELDS) {
    const fill = fieldFill(fields[f.id]?.text);
    if (fill < bestFill) {
      best = f;
      bestFill = fill;
    }
  }
  return bestFill >= 1 ? null : best;
}

export function applySheetUpdates(sheet, updates, now = new Date().toISOString()) {
  const next = { fields: { ...(sheet?.fields || {}) }, updatedAt: sheet?.updatedAt || null };
  const changed = [];
  for (const u of updates || []) {
    if (!SHEET_FIELD_IDS.includes(u.field)) continue;
    const text = String(u.text || '').trim();
    if (!text || next.fields[u.field]?.text === text) continue;
    next.fields[u.field] = { text, updatedAt: now };
    changed.push(u.field);
  }
  if (changed.length) next.updatedAt = now;
  return { sheet: next, changed };
}

export function sheetToMarkdown(sheet, company = {}) {
  const lines = [`# 経営デザインシート　${company.name || ''}`.trimEnd(), ''];
  lines.push(`作成日: ${formatDate(new Date())}　充足率: ${sheetCompletion(sheet)}%`, '');
  for (const s of SHEET_SECTIONS) {
    lines.push(`## ${s.label}`, '');
    for (const f of s.fields) {
      lines.push(`### ${f.label}`, '', sheet?.fields?.[f.id]?.text?.trim() || '（未記入）', '');
    }
  }
  return lines.join('\n');
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cell = (sheet, id) => {
  const f = SHEET_FIELDS.find((x) => x.id === id);
  const text = sheet?.fields?.[id]?.text?.trim();
  return `<div class="c"><h3>${esc(f.label)}</h3><p class="${text ? '' : 'empty'}">${text ? esc(text).replace(/\n/g, '<br>') : '（未記入）'}</p></div>`;
};

// 印刷（PDF保存）用の単体HTML。A4横1枚に収まる構成。
export function sheetToPrintableHtml(sheet, company = {}) {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>経営デザインシート ${esc(company.name || '')}</title>
<style>
@page { size: A4 landscape; margin: 10mm; }
* { box-sizing: border-box; }
body { font-family: 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif; color: #1a1a1a; margin: 0; font-size: 9pt; line-height: 1.5; }
header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 3px solid #0017c1; padding-bottom: 4px; margin-bottom: 6px; }
header h1 { font-size: 15pt; margin: 0; }
header span { color: #4d4d4d; }
.grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
section { border: 1px solid #999; border-radius: 6px; padding: 6px 8px; }
section > h2 { font-size: 10pt; margin: 0 0 4px; color: #0017c1; }
.c h3 { font-size: 8.5pt; margin: 4px 0 1px; }
.c p { margin: 0; white-space: normal; }
.c p.empty { color: #999; }
.top { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
.strategy { grid-column: 1 / -1; }
.arrow { text-align: center; font-weight: 700; color: #0017c1; align-self: center; }
footer { margin-top: 6px; color: #666; font-size: 7.5pt; }
</style></head><body>
<header><h1>経営デザインシート　${esc(company.name || '')}</h1><span>作成日 ${formatDate(new Date())}／充足率 ${sheetCompletion(sheet)}%</span></header>
<div class="grid">
  <div class="top">
    <section><h2>自社の目的・特徴</h2>${cell(sheet, 'philosophy')}${cell(sheet, 'strengths')}</section>
    <section style="grid-column: span 2"><h2>A 外部環境の変化</h2>${cell(sheet, 'environment')}</section>
  </div>
  <section><h2>B これまで</h2>${cell(sheet, 'pastValue')}${cell(sheet, 'pastModel')}${cell(sheet, 'pastResources')}</section>
  <section><h2>D 移行戦略</h2>${cell(sheet, 'gap')}${cell(sheet, 'strategy')}</section>
  <section><h2>C これから（5〜10年後）</h2>${cell(sheet, 'futureValue')}${cell(sheet, 'futureModel')}${cell(sheet, 'futureResources')}</section>
</div>
<footer>経営デザインシートの枠組みは内閣府 知的財産戦略推進事務局の公開資料に基づきます。本シートは会社の記憶帳で作成しました（原本は社長のPCに保存されています）。</footer>
</body></html>`;
}

export function formatDate(d) {
  const x = new Date(d);
  return `${x.getFullYear()}年${x.getMonth() + 1}月${x.getDate()}日`;
}
