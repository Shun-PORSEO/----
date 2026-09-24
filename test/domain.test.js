import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeEntry, selectRelevant, monthlyStats, normalizeData, emptyData, dataToMarkdown, prevMonthKey } from '../public/js/memory.js';
import { applySheetUpdates, sheetCompletion, nextFocusField, emptySheet, sheetToPrintableHtml, SHEET_FIELD_IDS } from '../public/js/sheet.js';
import { encryptBackup, decryptBackup } from '../public/js/backup.js';

test('関係する記憶だけを選び、理念は判断の軸として添える', () => {
  const entries = [
    makeEntry({ type: '理念', title: 'お客様の家は自分の家', content: '自分の家だと思って直す' }),
    makeEntry({ type: '業務手順', title: '見積もりの出し方', content: '現地調査の翌日までに見積書を送る。水回りは部材の在庫を先に確認する' }),
    makeEntry({ type: '人・組織', title: '採用の考え方', content: '経験より素直さを重視する' }),
  ];
  const picked = selectRelevant(entries, '水回りの見積もりを新人に教えたい');
  assert.equal(picked[0].type, '理念');
  assert.ok(picked.some((e) => e.title === '見積もりの出し方'));
  assert.ok(!picked.some((e) => e.title === '採用の考え方'));
});

test('送信量の上限を超える記憶は送らない', () => {
  const long = 'あ'.repeat(5000);
  const entries = [makeEntry({ type: '事実', title: '見積', content: '見積 ' + long }), makeEntry({ type: '事実', title: '見積2', content: '見積 ' + long })];
  const picked = selectRelevant(entries, '見積', { maxChars: 6000 });
  assert.equal(picked.length, 1);
});

test('経営デザインシートの更新と充足率', () => {
  let sheet = emptySheet();
  assert.equal(sheetCompletion(sheet), 0);
  assert.equal(nextFocusField(sheet).id, 'philosophy');
  const r = applySheetUpdates(sheet, [{ field: 'philosophy', text: 'あ'.repeat(60) }, { field: 'unknown', text: 'x' }, { field: 'strengths', text: '  ' }]);
  assert.deepEqual(r.changed, ['philosophy']);
  sheet = r.sheet;
  assert.equal(sheetCompletion(sheet), Math.round(100 / SHEET_FIELD_IDS.length));
  assert.equal(nextFocusField(sheet).id, 'strengths');
  // 同じ内容では更新扱いにしない
  assert.deepEqual(applySheetUpdates(sheet, [{ field: 'philosophy', text: 'あ'.repeat(60) }]).changed, []);
});

test('印刷用HTMLは入力をエスケープする', () => {
  const html = sheetToPrintableHtml({ fields: { philosophy: { text: '<script>alert(1)</script>' } } }, { name: 'A&B' });
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('A&amp;B'));
});

test('月次レポートの集計', () => {
  const data = emptyData();
  data.entries.push(makeEntry({ type: '判断', content: '今月' }, '2026-09-10T00:00:00.000Z'));
  data.entries.push(makeEntry({ type: '理念', content: '先月' }, '2026-08-10T00:00:00.000Z'));
  data.timeLogs.push({ date: '2026-09-11T00:00:00.000Z', minutes: 90 });
  const s = monthlyStats(data, '2026-09');
  assert.equal(s.added, 1);
  assert.equal(s.prevAdded, 1);
  assert.equal(s.byType['判断'], 1);
  assert.equal(s.minutesSaved, 90);
  assert.equal(prevMonthKey('2026-01'), '2025-12');
});

test('壊れた・古いデータも読み込める', () => {
  const d = normalizeData({ company: { name: 'X' }, entries: 'bad' });
  assert.equal(d.company.name, 'X');
  assert.deepEqual(d.entries, []);
  assert.ok(dataToMarkdown(d).includes('# 会社の記憶　X'));
});

test('暗号化バックアップは合言葉がないと読めない', async () => {
  const data = { entries: [{ title: '秘密の手順' }] };
  const enc = await encryptBackup(data, 'correct horse');
  assert.ok(!enc.includes('秘密'));
  assert.deepEqual(await decryptBackup(enc, 'correct horse'), data);
  await assert.rejects(decryptBackup(enc, 'wrong pass'), /合言葉が違う/);
  await assert.rejects(encryptBackup(data, 'short'), /8文字以上/);
});

test('FormsのCSVを読める（改行・引用符入り）', async () => {
  const { parseCsv } = await import('../ops/consult-triage.js');
  const rows = parseCsv('﻿タイムスタンプ,会社名,相談内容\r\n2026/09/01,A社,"請求書を\n早く作りたい ""至急"""\r\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['相談内容'], '請求書を\n早く作りたい "至急"');
});
