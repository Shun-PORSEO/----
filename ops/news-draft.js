// AIニュースの下書きを作る（運営側の自動化。社長のデータには触れない）
//
//   node ops/news-draft.js            … 今週の下書きを ops/data/news/ に作る
//   node ops/news-draft.js --publish ops/data/news/2026-09-29.json
//                                     … 確認済みの下書きを public/news/index.json の先頭に追加
//
// 下書きには「メルマガ本文」と「ポッドキャスト台本」も含まれる。公開前に必ず人が確認する。

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadConfig } from '../server/config.js';
import { createAi } from '../server/ai.js';

const INDEX = new URL('../public/news/index.json', import.meta.url);
const OUT_DIR = new URL('./data/news/', import.meta.url);

const SYSTEM = `あなたは北海道内の従業員6〜20名の会社の社長向けに、毎週のAIニュースをまとめる編集者です。
- 過去7日間の生成AI・AIツールの動きから、中小企業の社長が知っておくべき話題を3〜5件選びます。
- 技術的な話より「社長の仕事・会社の業務にどう関係するか」を優先します。道内・国内の中小企業に関係する話題（補助金・自治体・地銀の取り組み等）があれば優先します。
- 事実は必ずWeb検索で確認し、各話題に出典URLを付けます。確認できないことは書きません。
- 煽らず、平易な言葉で書きます。`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'intro', 'items', 'newsletter', 'podcastScript'],
  properties: {
    title: { type: 'string' },
    intro: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'summary', 'body', 'source'],
        properties: { title: { type: 'string' }, summary: { type: 'string' }, body: { type: 'string' }, source: { type: 'string' } },
      },
    },
    newsletter: { type: 'string' },
    podcastScript: { type: 'string' },
  },
};

async function draft() {
  const config = loadConfig();
  if (config.demo) throw new Error('ANTHROPIC_API_KEY を設定してください');
  const ai = createAi(config);
  const today = new Date().toISOString().slice(0, 10);
  let research = '';
  process.stdout.write('調査中');
  await ai.stream({
    system: SYSTEM,
    effort: 'high',
    webSearch: true,
    messages: [{ role: 'user', content: `今日は${today}です。今週のAIニュースを調べ、話題ごとに要点・社長への意味・出典URLを列挙してください。` }],
    onDelta: (t) => (research += t),
    onStatus: () => process.stdout.write('.'),
  });
  console.log('\n整理中…');
  const issue = await ai.json({
    system: `${SYSTEM}\n調査メモを、配信用の形式に整えます。summary は2〜3文（Markdownの箇条書き可）、body は自社向け解説用の詳しめの説明（300字程度）。newsletter はメール本文（挨拶・各話題・締め）、podcastScript は10分程度の読み上げ台本（1人語り）。`,
    schema: SCHEMA,
    effort: 'medium',
    messages: [{ role: 'user', content: `<research>\n${research}\n</research>` }],
  });
  const out = { id: today, date: today, podcast: { url: '', duration: '' }, ...issue, items: issue.items.map((it, i) => ({ id: `${today}-${i + 1}`, ...it })) };
  await mkdir(OUT_DIR, { recursive: true });
  const file = new URL(`${today}.json`, OUT_DIR);
  await writeFile(file, JSON.stringify(out, null, 2));
  await writeFile(new URL(`${today}_メルマガ.txt`, OUT_DIR), issue.newsletter);
  await writeFile(new URL(`${today}_ポッドキャスト台本.txt`, OUT_DIR), issue.podcastScript);
  console.log(`下書きを保存しました: ops/data/news/${today}.json（メルマガ本文・台本も同じフォルダ）`);
  console.log('内容と出典を確認してから --publish で公開してください。');
}

async function publish(path) {
  const issue = JSON.parse(await readFile(path, 'utf8'));
  delete issue.newsletter;
  delete issue.podcastScript;
  const index = JSON.parse(await readFile(INDEX, 'utf8'));
  index.issues = [issue, ...index.issues.filter((i) => i.id !== issue.id)];
  await writeFile(INDEX, JSON.stringify(index, null, 2) + '\n');
  console.log(`公開しました: ${issue.title}`);
}

const i = process.argv.indexOf('--publish');
(i > 0 ? publish(process.argv[i + 1]) : draft()).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
