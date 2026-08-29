# WebFileBin Skills

[WebFileBin](https://webfilebin.com) を AI エージェントから操作するための公式スキル配布リポジトリです。
現在配布しているのは **`webfilebin-file-ops`**（アップロード / 削除 / 一覧 / パスワード保護）の1本です。

- 対象: WebFileBin の **Pro プラン**ユーザー
- 動作要件: **Node.js 20 以上**（組み込み `fetch` を使うため）
- 追加の npm パッケージは不要です（外部依存ゼロ）

---

## このスキルでできること

Claude Code や Cursor などのエージェントに入れておくと、ブラウザを開かずに次のことを頼めるようになります。

| 依頼の例 | 実行されるコマンド |
| --- | --- |
| 「このHTMLを公開して」 | `upload` |
| 「パスワード付きで共有して」 | `upload --password` または `protect` |
| 「この dist フォルダをまるごと公開して」 | `upload-folder`（フォルダにはパスワード不可） |
| 「いま公開してるファイルを一覧して」 | `list` |
| 「パスワードを外して」 | `unprotect` |
| 「あのページはもう消して」 | `delete` |

公開されたファイルには即座に共有URLが発行され、エージェントがそのURLをそのまま返してくれます。

---

## 使い方は3ステップ

1. [資格情報を発行する](#1-資格情報を発行する)（Web UI で1回だけ）
2. [スキルをインストールする](#2-スキルをインストールする)
3. [疎通確認する](#3-疎通確認する)

---

## 1. 資格情報を発行する

資格情報はユーザー本人が Web UI で発行します。エージェントに代理発行させることはできません。

1. <https://webfilebin.com> にサインインする
2. **Pro プラン**であることを確認する（無料プランでは「AI連携」タブは使えません）
3. **「AI連携」タブ**を開く
4. 用途名（例: `Claude Code`）を入力し、許可するスコープを選ぶ
5. **「資格情報を発行」** を押す

発行直後の画面に、そのままシェルへ貼れる形で環境変数が表示されます。

```bash
export WFB_API_BASE="https://xxxxxxxx.lambda-url.ap-northeast-1.on.aws"
export WFB_CLIENT_ID="wfb_c_xxxxxxxxxxxx"
export WFB_CLIENT_SECRET="wfb_cs_xxxxxxxxxxxxxxxxxxxx"
```

> **`client_secret` はこの1回しか表示されません。**
> サーバー側はハッシュしか保存していないため、控え忘れた場合は再発行するしかありません。
> 画面の「環境変数をまとめてコピー」ボタンを使うのが確実です。

`WFB_API_BASE` の値は環境ごとに異なります。**必ず「AI連携」タブに表示されている URL をコピーしてください**（このドキュメントには実際の値を書いていません）。

### 環境変数の設定先

| 使い方 | 設定場所 |
| --- | --- |
| 手元のシェルで試す | `export` をそのまま実行 |
| 常用する | `~/.zshrc` / `~/.bashrc` などに追記 |
| エージェントから使う | エージェントを起動するシェルの環境変数、または各ツールの設定ファイル |
| CI から使う | CI のシークレット（例: GitHub Actions の Repository secrets） |

`client_secret` はパスワードと同じ扱いです。リポジトリにコミットしないでください。

### スコープ

必要なものだけを付けるのが安全です。読み取りしかしないエージェントには `webfilebin/list` だけを渡してください。

| スコープ | 許可される操作 | 対応コマンド |
| --- | --- | --- |
| `webfilebin/upload` | ファイル・フォルダのアップロードと、あとからのパスワード設定 | `upload` / `upload-folder` / `protect` / `unprotect` |
| `webfilebin/delete` | 公開済みアイテムの削除 | `delete` |
| `webfilebin/list` | 公開中アイテムの一覧取得 | `list` |

スコープは発行時に固定されます。後から追加はできないので、必要になったら新しい資格情報を発行して、古いものを「AI連携」タブから失効させてください。

---

## 2. スキルをインストールする

用途に合わせて、どちらか好きな方法を選んでください。

### 方法A: パッケージ済みの `.skill` を1ファイル落とす（おすすめ）

`webfilebin-file-ops.skill` は ZIP です。スキルの読み込みに対応したエージェントなら、このファイルを1つ渡すだけで済みます。
`main` の最新内容が [Releases](https://github.com/hayashiroto/webfilebin-skills/releases/latest) に自動で貼られているので、下のURLは常に最新を指します。

```bash
curl -LO https://github.com/hayashiroto/webfilebin-skills/releases/latest/download/webfilebin-file-ops.skill
unzip webfilebin-file-ops.skill -d ~/.claude/skills/
```

展開すると `~/.claude/skills/webfilebin-file-ops/` ができます。展開先はお使いのエージェントのスキルディレクトリに読み替えてください。

### 方法B: リポジトリをクローンして使う

中身を確認しながら使いたい場合や、自分用に手を入れたい場合はこちら。

```bash
git clone https://github.com/hayashiroto/webfilebin-skills.git
cp -R webfilebin-skills/webfilebin-file-ops ~/.claude/skills/
```

手を入れたあとに `.skill` を作り直したくなったら、リポジトリ直下で次を実行します。

```bash
zip -X -r webfilebin-file-ops.skill webfilebin-file-ops
```

### 配置後のディレクトリ構成

```text
webfilebin-file-ops/
├── SKILL.md                     … エージェントが読む本体
├── references/
│   └── api-reference.md         … コマンド・HTTP・エラーコードの詳細
└── scripts/
    └── wfb.mjs                  … CLI クライアント（外部依存なし）
```

---

## 3. 疎通確認する

スキルを置いたディレクトリで実行します。

```bash
node webfilebin-file-ops/scripts/wfb.mjs whoami
```

次のように返れば準備完了です。

```json
{
  "userId": "...",
  "plan": "pro",
  "scopes": ["webfilebin/upload", "webfilebin/delete", "webfilebin/list"]
}
```

うまくいかない場合は下の[トラブルシュート](#トラブルシュート)を見てください。

---

## コマンド一覧

`scripts/wfb.mjs` は単体の CLI としても使えます。引数なし、または `--help` で使い方が出ます。

```bash
# 一覧（最大100件、既定20件）
node scripts/wfb.mjs list --limit 50

# 単一ファイルをアップロード
node scripts/wfb.mjs upload ./report.html --name report.html

# パスワード付きで公開（URLは同じ。知っている人だけが見られる）
node scripts/wfb.mjs upload ./report.html --password 'shared-secret'

# 同じ名前で差し替え
node scripts/wfb.mjs upload ./report.html --overwrite

# フォルダを一括アップロード（直下に index.html が必須）
node scripts/wfb.mjs upload-folder ./dist --name my-site

# あとからパスワードをかける / 外す
node scripts/wfb.mjs protect report.html --password 'shared-secret'
node scripts/wfb.mjs unprotect report.html

# 削除（ファイル名 / フォルダ名で指定）
node scripts/wfb.mjs delete report.html

# トークンキャッシュを破棄
node scripts/wfb.mjs clear-token
```

| コマンド | 必要スコープ | 説明 |
| --- | --- | --- |
| `whoami` | なし（有効なトークン） | 所有ユーザー・プラン・スコープを表示 |
| `list [--limit N] [--next TOKEN]` | `webfilebin/list` | 公開中アイテムの一覧 |
| `upload <path> [--name] [--overwrite] [--password PASS \| --public]` | `webfilebin/upload` | 単一ファイルのアップロード。`--password` で保護 |
| `upload-folder <dir> [--name] [--overwrite]` | `webfilebin/upload` | フォルダの一括アップロード。パスワードは不可 |
| `protect <name> --password PASS` | `webfilebin/upload` | あとからパスワードをかける / 差し替える |
| `unprotect <name>` | `webfilebin/upload` | パスワードを外して公開に戻す |
| `delete <name>` | `webfilebin/delete` | ファイル / フォルダの削除 |
| `clear-token` | — | ローカルのトークンキャッシュを破棄 |

対応拡張子は `.html` / `.htm` / `.jpg` / `.jpeg` / `.png` / `.mp4` です。
1リクエストの上限は 6MB（クライアント側で 5MB を超えると事前にエラーになります）。
パスワードは `--password` の代わりに環境変数 `WFB_SITE_PASSWORD` でも渡せます。フォルダにはパスワードを設定できません。

HTTP を直接叩きたい場合は [`webfilebin-file-ops/references/api-reference.md`](webfilebin-file-ops/references/api-reference.md) にエンドポイントとレスポンス例をまとめてあります。

---

## トラブルシュート

| 症状 | 原因と対処 |
| --- | --- |
| `環境変数 WFB_API_BASE が設定されていません` | `export` したシェルとエージェントを起動したシェルが違う可能性があります。`env \| grep WFB_` で確認してください |
| `(HTTP 401) [invalid_client]` | `client_id` / `client_secret` の取り違え、または失効済みです。「AI連携」タブで再発行してください |
| `(HTTP 403) [plan_required]` | Pro プランが有効ではありません。プラン状況を確認してください |
| `(HTTP 403) [insufficient_scope]` | その資格情報に必要なスコープがありません。スコープを付け直して再発行してください |
| `(HTTP 401) [invalid_token]` | 通常は自動で再取得されます。繰り返す場合は `node scripts/wfb.mjs clear-token` |
| `(HTTP 429) [rate_limited]` | レート上限です。表示された秒数だけ待ってから再試行してください |
| `(HTTP 400) [unsupported_file_type]` | 対応拡張子以外です。HTML などに変換してください |
| `フォルダ直下に index.html が必要です` | `upload-folder` は公開時のエントリポイントとして `index.html` を要求します |
| `SyntaxError` や `fetch is not defined` | Node.js が 20 未満です。`node --version` を確認してください |

---

## セキュリティについて

- `client_secret` はサーバーにハッシュしか保存されません。漏れた疑いがあれば「AI連携」タブから即座に失効させてください。失効は次のリクエストから有効になります。
- `wfb.mjs` はアクセストークンを一時ディレクトリ（`$TMPDIR/wfb-token-*.json`、パーミッション `600`）にキャッシュします。共有マシンで使う場合は作業後に `clear-token` を実行してください。
- 資格情報は `Authorization: Basic` ヘッダで送られます。コマンド履歴やプロセス一覧に平文が残らない作りです。
- サイトの閲覧パスワードはサーバーにハッシュしか保存されません。`--password` はシェル履歴に残るので、気になる場合は `WFB_SITE_PASSWORD` を使ってください。
- 操作対象は常にトークンの所有ユーザー配下に限定されます。他ユーザーのファイルを指定しても `404` になります。

---

## ライセンス

[MIT License](LICENSE)

## 関連リンク

- WebFileBin: <https://webfilebin.com>
- 不具合報告・要望: [Issues](https://github.com/hayashiroto/webfilebin-skills/issues)
- 変更履歴: [CHANGELOG.md](CHANGELOG.md)
