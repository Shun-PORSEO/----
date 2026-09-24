# 会社の記憶帳（仮称）

**道内社長のAI活用パートナー** — 北海道の従業員6〜20名の会社の社長向けに、「自社を理解したAI」と「AI活用の専門家への毎月の相談」をセットで提供するSaaSです。

> 社長の判断を、会社の資産に。

| 機能 | 内容 | 画面 |
|---|---|---|
| **残す** | AIとの対話（1回10分・音声入力可）やメモで、判断・理念・業務手順を「会社の記憶」として**社長のPCのフォルダ**に保存 | AIと話して残す／会社の記憶／ホーム |
| **答える** | 質問に関係する記憶だけを選んでAIに送り、記憶に沿って答える自社専用AI | 自社AIに聞く |
| **出す** | 経営デザインシート（A4横1枚、PDF / HTML / Markdown） | 経営デザインシート |
| オンボーディング | 会社名などから公開情報をWeb調査（Deep Research）→ 社長が確認して取り込み → 対話で不足分を聞き出す | はじめての登録 |
| お悩み相談 | 月1回・IT/AI活用のみ。AIが範囲を事前判定し、範囲外は相談先を案内。受付はForms | お悩み相談 |
| AIニュース | 無料公開ページ（集客）＋会員は自社の記憶に照らした解説 | AIニュース／`/news.html` |
| 月次レポート | 「今月増えた会社の記憶」、削減時間の記録と運営への報告CSV | 月次レポート |
| バックアップ | 合言葉による暗号化バックアップ（AES-GCM）と復元 | 設定・バックアップ |

画面はすべて[デジタル庁デザインシステム](https://www.digital.go.jp/policies/servicedesign/designsystem)の公式デザイントークン（`@digital-go-jp/design-tokens`、MIT）と部品の考え方に準拠しています。

---

## すぐに動かす

```bash
npm install
npm start          # http://localhost:8787
```

- `ANTHROPIC_API_KEY` が未設定の間は **デモモード**（AI応答が固定の見本）で全画面を体験できます。
- 本番のAIを使うには `.env.example` を `.env` にコピーして `ANTHROPIC_API_KEY` を設定します。
- アプリは `http://localhost:8787/app.html`、紹介ページは `/`、公開ニュースは `/news.html`。
- **対応ブラウザ：Windows / Mac の Chrome・Edge**（PCフォルダへの保存に File System Access API を使用）。Safari 等では「お試しモード」（ブラウザ内保存）で動きます。

```bash
npm test           # ドメインロジック・サーバー・AI呼び出し形式のテスト
```

## 本番に出す（試行版）

File System Access API は **HTTPS 必須**（localhost は例外）です。以下のどれでも、そのまま動きます。

- **Render**：GitHub 連携で `render.yaml` を読み込み、環境変数を入力するだけ。
- **Docker**（Cloud Run / Fly.io / さくらのVPS など）：`docker build -t kioku . && docker run -p 8787:8787 --env-file .env kioku`
- **Node が動くサーバー**：`npm ci --omit=dev && npm start`（前段に HTTPS のリバースプロキシ）

最低限の環境変数：

| 変数 | 説明 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API キー（Anthropic Console で発行） |
| `MEMBER_CODES` | 試行ユーザーの会員コード。`コード:会社名` をカンマ区切り（例 `a1b2c3d4e5f6:株式会社サンプル`）。未設定だと localhost からしかAIを使えません |
| `CONSULT_FORM_URL` | お悩み相談フォーム（Google Forms / Microsoft Forms）のURL |
| `TRIAL_FORM_URL` または `CONTACT_EMAIL` | 紹介ページの申し込み先 |

その他は `.env.example` を参照。

## 仕組み（データを預からない設計）

```
 社長のPC（Chrome / Edge）                         中継サーバー（このリポジトリ）         Anthropic API
┌───────────────────────────┐   質問＋関係する記憶だけ   ┌──────────────────┐        ┌──────────┐
│ 会社の記憶フォルダ（原本）   │ ─────────────────────▶ │ 保存しない・ログに │ ─────▶ │ 学習に    │
│  kioku.json / 会社の記憶.md │ ◀───────────────────── │ 出さない          │ ◀───── │ 使わない  │
│  対話ログ/ 出力/            │     回答（ストリーム）    └──────────────────┘        └──────────┘
└───────────────────────────┘
```

- 原本は社長が選んだPCのフォルダにだけ置く（`public/js/storage.js`）。フォルダの許可は IndexedDB にハンドルを保存し、次回は「開く」ボタン1回で再開（Chrome の「毎回許可」にも対応）。
- AIに送るのは、質問に関係する記憶だけ（`public/js/memory.js` の `selectRelevant`。文字 bigram 照合、上限 6,000 字）。各画面で「今回AIに送った会社の記憶」を確認できる。
- 中継サーバー（`server/`）は受け取った内容をメモリ上で Claude API に渡すだけ。ディスク・ログには書かない。エラー時も種類とステータスだけを記録。
- 運営側のAIエージェント（`ops/`）は、社長のデータに触れない業務（ニュース作成、Forms で届いた相談の一次処理）だけを自動化。

詳しくは [docs/privacy-explanation.md](docs/privacy-explanation.md)。

## ディレクトリ

```
server/            中継サーバー（Node 標準 http + @anthropic-ai/sdk）
  index.js         ルーティング・静的配信・会員コード・回数制限
  ai.js            Claude API 呼び出し（構造化出力／ストリーム／Web検索）
  prompts.js       各機能の指示文とJSONスキーマ
public/            画面（ビルド不要の ES Modules）
  index.html       紹介ページ（LP）
  app.html         アプリ本体
  news.html        無料AIニュース（集客用）
  css/dads-tokens.css  デジタル庁デザイントークン（公式配布物）
  js/storage.js    PCフォルダ保存（File System Access API）
  js/memory.js     記憶のデータモデル・検索・月次集計
  js/sheet.js      経営デザインシートの項目・出力
  js/backup.js     暗号化バックアップ
  js/views/        各画面
  news/index.json  ニュース配信データ
ops/               運営の自動化（ニュース下書き、相談の振り分け）
docs/              要件の補完・説明文・運用手順
test/              テスト
```

## ドキュメント

- [要件定義の補完と未決事項への提案](docs/requirements-supplement.md)
- [社長への説明文とデータ設計](docs/privacy-explanation.md)
- [運営マニュアル（会員発行・相談処理・ニュース配信・試行の計測）](docs/operations.md)
