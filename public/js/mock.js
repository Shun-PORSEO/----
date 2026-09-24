// デモモード用の応答。APIキー未設定のサーバー、または静的ホスティングで動かすときに使う。
// 本物のAIではなく、画面の流れを体験してもらうための固定文。

import { SHEET_FIELDS } from './sheet.js';

const QUESTIONS = {
  philosophy: '会社を始めた（継いだ）とき、一番大事にしようと思ったことは何でしたか？ いまも変わらず大事にしていることがあれば教えてください。',
  strengths: 'お客様から「おたくに頼んでよかった」と言われるのは、どんなときですか？ 同業他社と比べて自信のある点を一つ挙げてください。',
  environment: 'ここ3年で、商売のまわりで一番大きく変わったことは何ですか？（人手不足、原材料、お客様の変化、デジタル化など）',
  pastValue: 'これまで、お客様にどんな「助かった」を届けてきましたか？ 代表的な仕事を一つ思い浮かべて教えてください。',
  pastModel: '売上の柱になっているのは、どのお客様に、どんな商品・サービスを、どう届けている部分ですか？',
  pastResources: '会社の強みを支えてきた人・技術・設備・つながりは何ですか？ 「これが無くなったら困る」ものを教えてください。',
  futureValue: '10年後、お客様や地域から「この会社があってよかった」と言われるとしたら、どんな理由であってほしいですか？',
  futureModel: '10年後も同じ儲け方で続けられそうですか？ 変えたい・増やしたい収益の柱があれば教えてください。',
  futureResources: 'その将来に向けて、いま足りない人材・技術・仕組みは何だと感じますか？',
  gap: '「これまで」から「これから」に移るうえで、やめたいこと・手放したいことはありますか？',
  strategy: 'この1年で、まず手をつけたい取り組みを一つ挙げるとしたら何ですか？ AIやITで楽にしたい業務があれば、それも教えてください。',
};

export function mockInterview({ answer = '', focusField } = {}) {
  const f = SHEET_FIELDS.find((x) => x.id === focusField) || SHEET_FIELDS[0];
  const nextIdx = (SHEET_FIELDS.indexOf(f) + 1) % SHEET_FIELDS.length;
  const next = SHEET_FIELDS[nextIdx];
  const trimmed = answer.trim();
  if (!trimmed) {
    return { reply: `（デモ）はじめましょう。${QUESTIONS[f.id]}`, sheetUpdates: [], memories: [] };
  }
  return {
    reply: `（デモ）ありがとうございます。「${f.label}」に反映しました。\n\n次に伺います。${QUESTIONS[next.id]}`,
    sheetUpdates: [{ field: f.id, text: trimmed }],
    memories: [{ type: f.id === 'philosophy' ? '理念' : f.id === 'strategy' ? '判断' : '事実', title: `${f.label}について`, content: trimmed }],
  };
}

export function mockAnswer({ question = '', context = [] } = {}) {
  const refs = context.length ? `\n\n参考にした会社の記憶:\n${context.map((c) => `・${c.title}`).join('\n')}` : '\n\n（まだ関連する会社の記憶がありません。「残す」から記憶を増やすと、回答が自社向けになります）';
  return `（デモ応答です。本番ではAIが会社の記憶に沿って回答します）\n\nご質問「${question.slice(0, 60)}」について、会社の記憶を踏まえると次の3点から考えるのがおすすめです。\n\n1. まず現状の手順を書き出す\n2. 時間がかかっている作業を1つ選ぶ\n3. その作業だけAIで試し、削減時間を記録する${refs}`;
}

export function mockResearch({ name = '御社' } = {}) {
  return `（デモ）${name}の公開情報の調査結果\n\n## 会社概要\n- ホームページ・求人情報・地域の記事から、事業内容と所在地を確認しました。\n\n## 事業の特徴\n- 地域のお客様との長い取引関係が強みと推測されます（要確認）。\n\n## 確認したいこと\n- 創業の経緯と、社長が大切にしている考え方\n- 売上の柱となっている取引先\n- 人手不足への対応状況`;
}

export function mockResearchStructure({ name = '' } = {}) {
  return {
    overview: `${name || '御社'}は北海道内で事業を営む会社です（デモ）。`,
    industry: '',
    memories: [
      { type: '事実', title: '公開情報から見た事業内容', content: 'ホームページに記載の事業内容（デモ）。内容を確認して修正してください。' },
      { type: '顧客', title: '主な取引先（推測）', content: '地域の法人・個人のお客様が中心と推測（要確認・デモ）。' },
    ],
    sheetUpdates: [{ field: 'pastValue', text: '地域のお客様に、確かな品質と迅速な対応を提供してきた（公開情報からの推測・要確認）。' }],
    questions: ['創業の経緯を教えてください', '売上の柱は何ですか'],
  };
}

export function mockStructureMemory({ text = '' } = {}) {
  const t = text.trim();
  const type = /手順|やり方|段取り|まず|次に/.test(t) ? '業務手順' : /決め|判断|方針|しない|する/.test(t) ? '判断' : /理念|想い|大切/.test(t) ? '理念' : /お客|顧客|取引/.test(t) ? '顧客' : /社員|採用|育成/.test(t) ? '人・組織' : '事実';
  return { type, title: t.slice(0, 24) || '無題の記憶', content: t, tags: [] };
}

export function mockNewsCommentary({ news = {} } = {}) {
  return `（デモ）「${news.title || 'このニュース'}」を御社に当てはめると、まず見積書・日報など定型文書の作成で試すのが現実的です。会社の記憶が増えるほど、解説が具体的になります。`;
}

export function mockConsultCheck({ text = '' } = {}) {
  const out = /資金|融資|借入|労務|給与|残業代|解雇|税|相続|登記|契約書の法的/.test(text);
  return out
    ? { inScope: false, category: '範囲外（経営・労務・税務など）', reason: '（デモ判定）IT・AI活用以外のご相談のようです。', suggestion: 'お近くの商工会議所の経営相談窓口、または北海道よろず支援拠点へのご相談をおすすめします。' }
    : { inScope: true, category: 'IT・AI活用', reason: '（デモ判定）IT・AI活用のご相談として受け付けられます。', suggestion: '' };
}

export function mockMonthlySummary({ stats = {} } = {}) {
  return `（デモ）今月は会社の記憶が${stats.added ?? 0}件増えました。社長の判断や手順が言葉になるほど、社員への引き継ぎとAIの回答精度が上がります。来月は「業務手順」を3件残すことを目標にしましょう。`;
}
