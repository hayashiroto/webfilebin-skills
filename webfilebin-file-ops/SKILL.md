---
name: webfilebin-file-ops
description: WebFileBin（webfilebin.com）へHTML/画像/フォルダをOAuth経由でアップロード・削除・一覧し、公開URLにパスワードをかけるワークフロー。「このHTMLを公開して」「パスワード付きで共有して」「公開中のファイルを一覧して」「あのページを消して」のようにWebFileBinの公開ファイルを操作したいときに使用する。Proプランの資格情報が必要。フォルダにはパスワードを設定できない。
---

# WebFileBin File Ops

## 概要
WebFileBin はHTML・画像・フォルダをアップロードすると即座に公開URLが発行される共有サービス。このスキルは Pro ユーザー向けのエージェント API（OAuth 2.0 client credentials）を使い、ブラウザを開かずに `upload` / `delete` / `list` / `protect` を実行する。ユーザーから「この成果物を公開して」「パスワード付きで共有して」「公開URLを教えて」「もう使わないので消して」のような依頼を受けた場合、[scripts/wfb.mjs](scripts/wfb.mjs) を通して安全に操作する。

## クイックワークフロー
1. `node scripts/wfb.mjs whoami` で資格情報とスコープを確認する。未設定なら下の「初回セットアップ」をユーザーに案内する。
2. 依頼内容から操作を決める。判断に迷ったら [references/api-reference.md](references/api-reference.md) のコマンド表を参照する。
3. コマンドを実行し、返ってきた JSON の `url` をユーザーへ共有する。
4. 削除は取り消せないため、実行前に必ず対象名を提示して確認を取る。

## 初回セットアップ（ユーザーに依頼する手順）
資格情報はユーザー本人が Web UI で発行する。エージェントが代理発行することはできない。

1. https://webfilebin.com にサインインし、Pro プランであることを確認する。
2. 「AI連携」タブ（Pro 限定）を開き、用途名（例: `Claude Code`）と許可するスコープを選んで「資格情報を発行」を押す。
3. 表示された環境変数をそのままシェルに設定する。**client_secret はこの1回しか表示されない。**

```bash
export WFB_API_BASE="https://xxxxxxxx.lambda-url.ap-northeast-1.on.aws"
export WFB_CLIENT_ID="wfb_c_..."
export WFB_CLIENT_SECRET="wfb_cs_..."
```

4. `node scripts/wfb.mjs whoami` が `{"userId": ..., "plan": "pro", ...}` を返せば準備完了。

スコープは必要なものだけ渡すのが望ましい。読み取りしかしないエージェントには `webfilebin/list` だけを付ける。

## 入力解釈ガイド
### 操作の判定
- 「公開して」「アップして」「共有URLをちょうだい」→ `upload`（単一ファイル）または `upload-folder`（`index.html` を含むディレクトリ）。
- 「パスワード付きで」「鍵をかけて」「知っている人だけに」→ 単一ファイルなら `upload --password` またはあとから `protect`。フォルダには設定できないので、その旨を伝える。
- 「パスワードを外して」「公開に戻して」→ `unprotect`。
- 「一覧」「何を公開してる？」「URLを教えて」→ `list`。`accessMode` が `password` なら保護中。
- 「消して」「もう不要」→ `delete`。必ず確認を取る。「非公開にして」は削除ではなく `protect` の可能性があるので確認する。
- 「差し替えて」「更新して」→ 同じ `fileName` で `upload --overwrite`。保護を維持したいだけなら `--password` は不要。外したいときだけ `--public`。

### 対象の決定
- ファイル名が明示されない場合はローカルのファイル名をそのまま使う。`--name` で公開名を変えられる。
- 拡張子は `.html` / `.htm` / `.jpg` / `.jpeg` / `.png` / `.mp4` のみ対応。それ以外は事前にユーザーへ伝える。
- フォルダを公開する場合は直下に `index.html` が必須。無い場合は作成を提案する。

### 実行モード
- 既存名と衝突する可能性があるときは、まず `list` で確認してから `--overwrite` の要否をユーザーに尋ねる。
- 削除・上書きの前には対象名と公開URLを提示し、承認を得てから実行する。

## 実行手順
### 1. 事前チェック
- `node --version` が 20 以上であること（組み込み `fetch` を使用）。
- `env | grep WFB_` で3つの環境変数が揃っているか確認。
- `node scripts/wfb.mjs whoami` で `plan: "pro"` とスコープを確認。`plan_required` が返る場合は Pro が失効している。

### 2. コマンド構築
```bash
# 一覧（最大50件）
node scripts/wfb.mjs list --limit 50

# 単一ファイル
node scripts/wfb.mjs upload ./report.html --name report.html

# パスワード付きで公開（URLは同じ。知っている人だけが見られる）
node scripts/wfb.mjs upload ./report.html --password 'shared-secret'

# 差し替え
node scripts/wfb.mjs upload ./report.html --overwrite

# あとからパスワードをかける / 外す
node scripts/wfb.mjs protect report.html --password 'shared-secret'
node scripts/wfb.mjs unprotect report.html

# フォルダ（直下に index.html が必要）
node scripts/wfb.mjs upload-folder ./dist --name my-site

# 削除（ファイル名 / フォルダ名で指定）
node scripts/wfb.mjs delete report.html
```

### 3. 監視すべき出力
- `upload` 成功時: `url`（公開URL）と `expiredAt`、`accessMode`。Pro なら `expiredAt` は `none`（無期限）。`accessMode` が `password` なら、URL を開くとパスワード入力画面になる。
- `list` 成功時: `items[].fileName` / `url` / `itemType`（`file` か `folder`）/ `accessCount` / `accessMode`、続きがある場合は `nextToken`。
- `delete` 成功時: `{ "deleted": true, "name": ..., "itemType": ... }`。
- エラーは `エラー (HTTP nnn) [code]: メッセージ` 形式で stderr に出る。`ヒント:` 行があればそれに従う。

### 4. 完了確認・共有
- アップロード後は `url` をそのままユーザーへ共有する。`accessMode` が `password` なら、パスワードも一緒に伝える（サーバーには残っていないので、ここで渡さないと共有相手が開けない）。反映まで数秒かかることがあるので、すぐに 403/404 なら少し待って再確認する。
- 複数ファイルを扱った場合は「名前 → URL」の対応表としてまとめて報告する。
- 削除後は `list` で消えていることを確認してから完了を伝える。

## トラブルシュート
- **`invalid_client` (401)**: `client_id` / `client_secret` の取り違え、または Web UI で失効済み。ユーザーに再発行を依頼する。
- **`plan_required` (403)**: 所有ユーザーの Pro が切れている。プラン状況の確認を依頼し、操作は中断する。
- **`insufficient_scope` (403)**: その資格情報に必要なスコープが無い。付け直した資格情報の再発行を依頼する（既存の資格情報にスコープを追加する操作は無い）。
- **`invalid_token` (401)**: トークンの期限切れ。スクリプトが自動再取得するが、繰り返す場合は `node scripts/wfb.mjs clear-token` でキャッシュを破棄する。
- **`rate_limited` (429)**: クライアント単位のレート上限。`ヒント:` に出る秒数だけ待ってから再試行する。連続アップロードは間隔を空ける。
- **`unsupported_file_type` (400)**: 未対応の拡張子。HTML へ変換するか、対応拡張子に変えるようユーザーへ提案する。
- **リクエストが大きすぎる**: Function URL の上限は 6MB。大きいフォルダはサブセットに分けて複数回 `upload-folder` する、または画像を圧縮する。
- **`not_found` (404) で削除できない**: `list` で正確な `fileName` を確認する。フォルダは `index.html` ではなくフォルダ名を指定する。

## 参考リソース
- [references/api-reference.md](references/api-reference.md): コマンド一覧、HTTP エンドポイント、スコープ、エラーコード表。
- [scripts/wfb.mjs](scripts/wfb.mjs): クライアント本体。外部依存なし、Node.js 20+ の組み込み `fetch` のみを使用。
