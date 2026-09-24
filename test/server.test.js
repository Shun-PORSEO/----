import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { createServer } from '../server/index.js';
import { loadConfig } from '../server/config.js';

// Claude API の代わりに受信内容を記録する偽サーバー
let captured = [];
const fakeApi = http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const json = JSON.parse(body);
  captured.push({ headers: req.headers, body: json });
  const text = json.output_config?.format ? JSON.stringify({ reply: 'こんにちは', sheetUpdates: [{ field: 'philosophy', text: '理念' }], memories: [] }) : '回答です';
  const message = { id: 'msg_1', type: 'message', role: 'assistant', model: json.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
  if (!json.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(message));
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  ev('message_start', { message: { ...message, content: [], stop_reason: null } });
  ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
  ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text } });
  ev('content_block_stop', { index: 0 });
  ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } });
  ev('message_stop', {});
  res.end();
});

let demo, live, demoUrl, liveUrl;

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${srv.address().port}`)));

before(async () => {
  const apiUrl = await listen(fakeApi);
  process.env.ANTHROPIC_BASE_URL = apiUrl;
  demo = createServer(loadConfig({}));
  live = createServer(loadConfig({ ANTHROPIC_API_KEY: 'test-key', MEMBER_CODES: 'good:株式会社テスト', CONSULT_FORM_URL: 'https://forms.example/x' }));
  demoUrl = await listen(demo);
  liveUrl = await listen(live);
});

after(() => {
  demo.close();
  live.close();
  fakeApi.close();
});

test('設定APIは秘密情報を返さない', async () => {
  const cfg = await (await fetch(liveUrl + '/api/config')).json();
  assert.equal(cfg.demo, false);
  assert.equal(cfg.requiresMemberCode, true);
  assert.equal(cfg.consultFormUrl, 'https://forms.example/x');
  assert.ok(!JSON.stringify(cfg).includes('test-key'));
  assert.ok(!JSON.stringify(cfg).includes('good'));
});

test('静的ファイルを配信し、フォルダ外は読めない', async () => {
  const res = await fetch(demoUrl + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(demoUrl + '/app')).status, 200);
  assert.notEqual((await fetch(demoUrl + '/..%2f..%2fpackage.json')).status, 200);
  assert.equal((await fetch(demoUrl + '/nope.html')).status, 404);
});

test('デモモードは固定応答を返す', async () => {
  const r = await fetch(demoUrl + '/api/ai/interview', { method: 'POST', body: JSON.stringify({ answer: '創業の想い', focusField: 'philosophy' }) });
  const body = await r.json();
  assert.equal(body.demo, true);
  assert.equal(body.result.sheetUpdates[0].field, 'philosophy');
  const s = await (await fetch(demoUrl + '/api/ai/answer', { method: 'POST', body: '{"question":"q"}' })).text();
  assert.match(s, /event: done/);
});

test('会員コードがないとAIを使えない', async () => {
  const r = await fetch(liveUrl + '/api/ai/answer', { method: 'POST', body: '{}' });
  assert.equal(r.status, 401);
  const ok = await fetch(liveUrl + '/api/auth/check', { method: 'POST', headers: { 'x-member-code': 'good' } });
  assert.deepEqual(await ok.json(), { ok: true, member: '株式会社テスト' });
});

test('聞き出し：構造化出力とフォールバックを指定してAIを呼ぶ', async () => {
  captured = [];
  const r = await fetch(liveUrl + '/api/ai/interview', {
    method: 'POST',
    headers: { 'x-member-code': 'good' },
    body: JSON.stringify({ company: '会社名: テスト', sheet: { fields: {} }, history: [], answer: '祖父が創業', focusField: 'philosophy' }),
  });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.result.reply, 'こんにちは');
  const sent = captured[0];
  assert.equal(sent.body.model, 'claude-opus-5');
  assert.equal(sent.body.fallbacks, 'default');
  assert.match(sent.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(sent.body.output_config.format.type, 'json_schema');
  assert.deepEqual(sent.body.thinking, { type: 'adaptive' });
  assert.ok(!('betas' in sent.body));
  assert.match(sent.body.messages[0].content, /祖父が創業/);
});

test('自社AI：送られた記憶だけをAIに渡し、ストリームで返す', async () => {
  captured = [];
  const r = await fetch(liveUrl + '/api/ai/answer', {
    method: 'POST',
    headers: { 'x-member-code': 'good' },
    body: JSON.stringify({ question: '見積の出し方は？', context: [{ type: '業務手順', title: '見積', content: '翌日までに送る', date: '2026-09-01' }], company: '会社名: テスト' }),
  });
  const text = await r.text();
  assert.match(text, /event: delta\ndata: \{"text":"回答です"\}/);
  assert.match(text, /event: done/);
  const content = captured[0].body.messages[0].content;
  assert.match(content, /翌日までに送る/);
  assert.equal(captured[0].body.stream, true);
});
