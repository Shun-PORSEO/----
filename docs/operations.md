# 運営マニュアル

原則は「例外だけが人に上がってくる」。運営者は決まった時間にキューを処理します。

## 試行開始までのチェックリスト

- [ ] Anthropic Console で API キーを発行し、利用上限（月額）を設定
- [ ] Anthropic と ZDR の取り決め（[privacy-explanation.md](privacy-explanation.md) 参照）
- [ ] Render / Cloud Run などにデプロイし、HTTPS のURLを確認
- [ ] お悩み相談フォームを作成（下記の項目）→ `CONSULT_FORM_URL`
- [ ] 試行申し込みフォームを作成 → `TRIAL_FORM_URL`（または `CONTACT_EMAIL`）
- [ ] メルマガ・ポッドキャストの配信先 → `NEWSLETTER_URL` / `PODCAST_URL`
- [ ] 提携先（相談の代行者）1〜2名に、キューの見方を共有

### お悩み相談フォームの項目（Google Forms / Microsoft Forms）
1. 会社名（必須）
2. メールアドレス（必須・回答の送付先）
3. 相談内容（必須・段落）
4. 同意：「IT・AI活用以外のご相談にはお答えできません。社員の個人情報やお客様の名前は書かないでください。」（チェック）

回答はスプレッドシートに集め、CSV でダウンロードします。

## 会員（試行ユーザー）の発行

```bash
openssl rand -hex 6      # 例: 3f9a1c7b20de
```

`MEMBER_CODES` に `3f9a1c7b20de:株式会社サンプル` を追加して再デプロイし、以下をメールで送ります。

> アプリ：https://（本番URL）/app.html
> 会員コード：3f9a1c7b20de
> 対応ブラウザ：Windows / Mac の Chrome または Edge
> はじめに「会社の記憶」フォルダを作って選んでください。15分ほどで初回登録が終わります。

解約時はコードを削除して再デプロイ。社長のPCの記憶はそのまま残ります。

## 毎週の作業

### AIニュース（目安 1時間）
```bash
npm run news:draft                                   # 下書き（ops/data/news/）
# 出典URLを開いて事実確認。JSONの文言を直す
npm run news:publish -- ops/data/news/2026-09-29.json # 公開ページに反映
git commit -am "AIニュース 9/29号" && git push         # 再デプロイ
```
同じフォルダの `_メルマガ.txt` をメルマガに、`_ポッドキャスト台本.txt` を読み上げて録音。

## 毎月の作業

### お悩み相談（目安 月20〜30時間を上限に）
```bash
npm run consult:triage -- ~/Downloads/相談フォーム.csv
# ops/data/queue-YYYY-MM-DD.md を開く。⚠要確認 のものだけ回答を直す
# queue-YYYY-MM-DD.json の finalAnswer に確定回答を記入（空なら回答案をそのまま採用）
# 各社へメールで回答
npm run consult:commit -- ops/data/queue-YYYY-MM-DD.json   # 悩みと解決策プールへ
```
- 範囲外の相談は回答案に相談先が書かれているので、確認して送るだけ。
- プール（`ops/data/pool.jsonl`）は次回以降の回答案の材料になる。**会社名・メールは入らない。** `ops/data/` はリポジトリに含めない（`.gitignore` 済み）ので、別途バックアップする。

### 試行ユーザーのフィードバック面談（1社30分）
- 事前に「月次レポート」画面の **運営への報告用CSV** を送ってもらう（件数・削減時間のみ）。
- 聞くこと：今月いちばん役に立った場面／使わなかった理由／削減時間の実感と記録のズレ。
- 3ヶ月分のCSVを集計し、「月5時間の削減」の仮説を検証 → 金融機関向け提案資料に使う。

### 解約防止
- 面談時に「今月増えた記憶」が0件の会社は利用が止まっている兆候。10分の対話を一緒に1回やる。

## 障害時
- サーバー停止中も、社長の記憶はPCにあり閲覧・編集できる（AI機能のみ停止）。
- AI提供元の障害時は画面に「AIサービスが一時的に利用できません」と出る。
