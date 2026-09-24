// 会社の記憶帳 サーバー
// - public/ の静的ファイル配信
// - /api/ai/* : Claude API への中継（社長のデータは保存しない・ログに出さない）
// 依存は @anthropic-ai/sdk のみ。

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig, publicConfig } from './config.js';
import { createAi, AiError } from './ai.js';
import * as P from './prompts.js';
import * as mock from '../public/js/mock.js';
import { SHEET_FIELDS } from '../public/js/sheet.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' https:; connect-src 'self'; frame-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https:",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
};

// ---------- 入力の整形（上限を設けて、必要な部分だけをAIに渡す） ----------

const clip = (s, n) => String(s ?? '').slice(0, n);
const clipList = (list, n) => (Array.isArray(list) ? list.slice(-n) : []);

function contextBlock(context) {
  const items = clipList(context, 20).map((c) => `<memory type="${clip(c.type, 10)}" date="${clip(c.date, 10)}">\n【${clip(c.title, 80)}】\n${clip(c.content, 3000)}\n</memory>`);
  return items.length ? `<company_memory>\n${items.join('\n')}\n</company_memory>` : '<company_memory>（関連する記憶はまだありません）</company_memory>';
}

function historyBlock(history, n = 12) {
  const turns = clipList(history, n).map((h) => `${h.role === 'assistant' ? 'AI' : '社長'}: ${clip(h.text, 1500)}`);
  return turns.length ? `<conversation>\n${turns.join('\n')}\n</conversation>` : '';
}

function sheetBlock(sheet) {
  const lines = SHEET_FIELDS.map((f) => `- ${f.id}（${f.label}）: ${clip(sheet?.fields?.[f.id]?.text, 600) || '（未記入）'}`);
  return `<design_sheet>\n${lines.join('\n')}\n</design_sheet>`;
}

const user = (text) => [{ role: 'user', content: text }];

// ---------- AIの各機能 ----------

const TASKS = {
  interview: {
    kind: 'json',
    mock: (b) => mock.mockInterview({ answer: b.answer, focusField: b.focusField }),
    build: (b) => {
      const focus = SHEET_FIELDS.find((f) => f.id === b.focusField);
      return {
        system: P.INTERVIEW_SYSTEM,
        schema: P.INTERVIEW_SCHEMA,
        effort: 'medium',
        messages: user(
          [
            `<company>\n${clip(b.company, 1500)}\n</company>`,
            sheetBlock(b.sheet),
            historyBlock(b.history),
            focus ? `重点項目(focus): ${focus.id}（${focus.label}）` : '重点項目: 全体を見て最も不足している項目',
            b.answer ? `社長の最新の回答:\n<answer>\n${clip(b.answer, 4000)}\n</answer>` : '対話の最初です。あいさつは短く、最初の質問をしてください。',
          ]
            .filter(Boolean)
            .join('\n\n'),
        ),
      };
    },
  },
  answer: {
    kind: 'stream',
    mock: (b) => mock.mockAnswer({ question: b.question, context: b.context || [] }),
    build: (b) => ({
      system: P.ANSWER_SYSTEM,
      effort: 'medium',
      messages: user([`<company>\n${clip(b.company, 1500)}\n</company>`, contextBlock(b.context), historyBlock(b.history, 8), `社長の質問:\n${clip(b.question, 4000)}`].filter(Boolean).join('\n\n')),
    }),
  },
  research: {
    kind: 'stream',
    webSearch: true,
    mock: (b) => mock.mockResearch({ name: b.name }),
    build: (b) => ({
      system: P.RESEARCH_SYSTEM,
      effort: 'high',
      messages: user(
        `次の会社を調べてください。\n会社名: ${clip(b.name, 100)}\nWebサイト: ${clip(b.url, 300) || '不明'}\n所在地: ${clip(b.address, 200) || '北海道内'}\n業種: ${clip(b.industry, 100) || '不明'}`,
      ),
    }),
  },
  'research-structure': {
    kind: 'json',
    mock: (b) => mock.mockResearchStructure({ name: b.name }),
    build: (b) => ({
      system: P.RESEARCH_STRUCTURE_SYSTEM,
      schema: P.RESEARCH_STRUCTURE_SCHEMA,
      effort: 'low',
      messages: user(`会社名: ${clip(b.name, 100)}\n\n<report>\n${clip(b.report, 30000)}\n</report>`),
    }),
  },
  'structure-memory': {
    kind: 'json',
    mock: (b) => mock.mockStructureMemory({ text: b.text }),
    build: (b) => ({
      system: P.STRUCTURE_MEMORY_SYSTEM,
      schema: P.STRUCTURE_MEMORY_SCHEMA,
      effort: 'low',
      messages: user(`<note>\n${clip(b.text, 6000)}\n</note>`),
    }),
  },
  'news-commentary': {
    kind: 'stream',
    mock: (b) => mock.mockNewsCommentary({ news: b.news }),
    build: (b) => ({
      system: P.NEWS_SYSTEM,
      effort: 'medium',
      messages: user([`<company>\n${clip(b.company, 1500)}\n</company>`, contextBlock(b.context), `<news>\nタイトル: ${clip(b.news?.title, 200)}\n${clip(b.news?.body, 6000)}\n</news>`].join('\n\n')),
    }),
  },
  'consult-check': {
    kind: 'json',
    mock: (b) => mock.mockConsultCheck({ text: b.text }),
    build: (b) => ({
      system: P.CONSULT_CHECK_SYSTEM,
      schema: P.CONSULT_CHECK_SCHEMA,
      effort: 'low',
      messages: user(`<consultation>\n${clip(b.text, 6000)}\n</consultation>`),
    }),
  },
  'monthly-summary': {
    kind: 'stream',
    mock: (b) => mock.mockMonthlySummary({ stats: b.stats }),
    build: (b) => ({
      system: P.MONTHLY_SYSTEM,
      effort: 'low',
      messages: user(`<stats>\n${clip(JSON.stringify(b.stats || {}), 4000)}\n</stats>\n<new_memory_titles>\n${clipList(b.titles, 40).map((t) => `・${clip(t, 80)}`).join('\n')}\n</new_memory_titles>`),
    }),
  },
};

// ---------- HTTP ユーティリティ ----------

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}

async function readBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new AiError('送信する内容が大きすぎます', 413);
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new AiError('リクエストの形式が正しくありません', 400);
  }
}

const isLoopback = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

function sseStart(res) {
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  return (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- アプリ本体 ----------

export function createServer(config = loadConfig()) {
  const ai = config.demo ? null : createAi(config);
  const usage = new Map(); // 会員コード → { count, resetAt }  （件数のみ。内容は持たない）

  function authorize(req) {
    if (config.demo) return { ok: true, member: 'demo' };
    const code = String(req.headers['x-member-code'] || '').trim();
    if (config.memberCodes.size === 0) {
      return isLoopback(req) ? { ok: true, member: 'local' } : { ok: false, status: 503, message: 'サーバーに会員コード（MEMBER_CODES）が設定されていません' };
    }
    if (!config.memberCodes.has(code)) return { ok: false, status: 401, message: '会員コードが正しくありません。設定画面で入力してください。' };
    const now = Date.now();
    const u = usage.get(code);
    if (!u || u.resetAt < now) usage.set(code, { count: 1, resetAt: now + 3600_000 });
    else if (++u.count > config.rateLimitPerHour) return { ok: false, status: 429, message: '短時間の利用回数が上限に達しました。しばらくしてからお試しください。' };
    return { ok: true, member: config.memberCodes.get(code) };
  }

  async function handleAi(req, res, taskName) {
    const task = TASKS[taskName];
    if (!task) return send(res, 404, { error: '不明な機能です' });
    const auth = authorize(req);
    if (!auth.ok) return send(res, auth.status, { error: auth.message });
    const body = await readBody(req);

    if (task.kind === 'json') {
      if (config.demo) return send(res, 200, { result: task.mock(body), demo: true });
      const { system, messages, schema, effort } = task.build(body);
      const result = await ai.json({ system, messages, schema, effort });
      return send(res, 200, { result });
    }

    const emit = sseStart(res);
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    try {
      if (config.demo) {
        const text = task.mock(body);
        emit('meta', { demo: true });
        if (task.webSearch) {
          emit('status', { message: '（デモ）Webで公開情報を検索しています…' });
          await sleep(600);
        }
        for (let i = 0; i < text.length && !abort.signal.aborted; i += 6) {
          emit('delta', { text: text.slice(i, i + 6) });
          await sleep(12);
        }
        emit('done', { stopReason: 'end_turn' });
      } else {
        const { system, messages, effort } = task.build(body);
        const stopReason = await ai.stream({
          system,
          messages,
          effort,
          webSearch: !!task.webSearch,
          signal: abort.signal,
          onDelta: (text) => emit('delta', { text }),
          onStatus: (message) => emit('status', { message }),
        });
        emit('done', { stopReason });
      }
    } catch (err) {
      if (!abort.signal.aborted) emit('error', { message: friendlyError(err) });
    }
    res.end();
  }

  async function serveStatic(req, res, urlPath) {
    let rel = decodeURIComponent(urlPath);
    if (rel === '/') rel = '/index.html';
    else if (rel === '/app') rel = '/app.html';
    else if (rel === '/news') rel = '/news.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');
    try {
      const st = await stat(file);
      if (!st.isFile()) throw new Error('not file');
      const data = await readFile(file);
      const ext = path.extname(file);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' || ext === '.json' ? 'no-cache' : 'public, max-age=300',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      send(res, 404, 'ページが見つかりません');
    }
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/healthz') return send(res, 200, { ok: true });
      if (url.pathname === '/api/config' && req.method === 'GET') return send(res, 200, publicConfig(config));
      if (url.pathname === '/api/auth/check' && req.method === 'POST') {
        const auth = authorize(req);
        return send(res, auth.ok ? 200 : auth.status, auth.ok ? { ok: true, member: auth.member } : { error: auth.message });
      }
      if (url.pathname.startsWith('/api/ai/') && req.method === 'POST') return await handleAi(req, res, url.pathname.slice('/api/ai/'.length));
      if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
      if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res, url.pathname);
      send(res, 405, 'Method Not Allowed');
    } catch (err) {
      if (!res.headersSent) send(res, err.status || 500, { error: friendlyError(err) });
      else res.end();
    }
  });
}

function friendlyError(err) {
  if (err instanceof AiError) return err.message;
  const status = err?.status;
  // 詳細（入力内容を含みうる）はログに出さず、種類だけ記録する
  console.error(`[ai-error] ${err?.name || 'Error'} status=${status ?? '-'}`);
  if (status === 429) return 'AIが混み合っています。少し時間をおいてお試しください。';
  if (status === 529 || status >= 500) return 'AIサービスが一時的に利用できません。少し時間をおいてお試しください。';
  if (status === 400) return 'AIへの依頼内容に問題がありました。内容を短くしてお試しください。';
  return 'エラーが発生しました。もう一度お試しください。';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  createServer(config).listen(config.port, config.host, () => {
    console.log(`${config.serviceName} を起動しました: http://localhost:${config.port}`);
    if (config.demo) console.log('※ ANTHROPIC_API_KEY が未設定のため、デモモード（固定応答）で動作しています');
    else console.log(`AIモデル: ${config.model}／会員コード: ${config.memberCodes.size}件`);
    if (!config.demo && config.memberCodes.size === 0) console.warn('※ MEMBER_CODES 未設定: このPC（localhost）からのみAIを利用できます');
  });
}
