# WebFileBin エージェント API リファレンス

`scripts/wfb.mjs` のコマンドと、その裏側の HTTP エンドポイントの対応表。素の HTTP を叩く必要が出たときにも参照できる。

## 環境変数

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `WFB_API_BASE` | ✓ | agent-api の Function URL。末尾スラッシュは付けても可 |
| `WFB_CLIENT_ID` | ✓ | Web UI「AI連携」タブで発行した `client_id` |
| `WFB_CLIENT_SECRET` | ✓ | 発行時に一度だけ表示される `client_secret` |
| `WFB_SCOPE` | | 要求スコープ（スペース区切り）。省略時はクライアントの全許可スコープ |

`client_secret` はサーバーにハッシュしか保存されない。紛失した場合は再発行するしかない。

## コマンド一覧

| コマンド | HTTP | 必要スコープ | 備考 |
| --- | --- | --- | --- |
| `whoami` | `GET /v1/me` | なし（有効なトークン） | 所有ユーザー・プラン・スコープの確認 |
| `list [--limit N] [--next TOKEN]` | `GET /v1/files` | `webfilebin/list` | `limit` は 1〜100（既定 20） |
| `upload <path> [--name] [--overwrite]` | `POST /v1/files` | `webfilebin/upload` | 拡張子で HTML/画像経路に自動振り分け |
| `upload-folder <dir> [--name] [--overwrite]` | `POST /v1/folders` | `webfilebin/upload` | 直下に `index.html` が必須 |
| `delete <name>` | `DELETE /v1/files/{name}` | `webfilebin/delete` | ファイル名 / フォルダ名で指定 |
| `clear-token` | — | — | ローカルのトークンキャッシュを破棄 |

## スコープ

| スコープ | 許可される操作 |
| --- | --- |
| `webfilebin/upload` | `POST /v1/files`, `POST /v1/folders` |
| `webfilebin/delete` | `DELETE /v1/files/{name}` |
| `webfilebin/list` | `GET /v1/files` |

スコープはクライアント発行時に固定される。後から追加はできないため、必要になったら新しい資格情報を発行して古いものを失効させる。

## トークン取得（`POST /oauth/token`）

OAuth 2.0 client credentials grant。`Authorization: Basic base64(client_id:client_secret)` を推奨（ボディに載せるとログに残りやすい）。

```bash
curl -sS -X POST "$WFB_API_BASE/oauth/token" \
  -u "$WFB_CLIENT_ID:$WFB_CLIENT_SECRET" \
  -d grant_type=client_credentials \
  -d scope="webfilebin/list"
```

```json
{
  "access_token": "wfb_at_...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "webfilebin/list"
}
```

以降のリクエストは `Authorization: Bearer <access_token>`。`wfb.mjs` はトークンを `$TMPDIR/wfb-token-<hash>.json` に期限付きでキャッシュし、401 を受けたら一度だけ自動再取得する。

## リクエスト/レスポンス例

### 一覧

```bash
curl -sS "$WFB_API_BASE/v1/files?limit=50" -H "Authorization: Bearer $TOKEN"
```

```json
{
  "items": [
    {
      "fileName": "report.html",
      "url": "https://webfilebin-share.com/<userId>/report.html",
      "itemType": "file",
      "status": "uploaded",
      "createdAt": "2026-08-26T00:00:00.000Z",
      "expiredAt": "none",
      "accessCount": 12,
      "primaryFile": null
    }
  ],
  "nextToken": null
}
```

`nextToken` が非 null なら `--next` に渡して続きを取得する。返るのは常に呼び出し元ユーザーのアイテムのみ。

### 単一ファイルのアップロード

```json
{
  "fileName": "report.html",
  "encoding": "text",
  "content": "<!doctype html>...",
  "overwrite": false
}
```

- `encoding`: `text`（HTML）または `base64`（画像・動画）。省略時は拡張子から推定。
- 対応拡張子: `.html`, `.htm`, `.jpg`, `.jpeg`, `.png`, `.mp4`。それ以外は `400 unsupported_file_type`。
- `fileName` にパス区切り文字は使えない。フォルダは `POST /v1/folders` を使う。

### フォルダのアップロード

```json
{
  "folderName": "my-site",
  "files": [
    { "path": "index.html", "content": "PGh0bWw+..." },
    { "path": "assets/app.css", "content": "Ym9keSB7..." }
  ],
  "overwrite": false
}
```

`content` は常に base64。`path` は `/` 区切りの相対パス。`overwrite: true` は既存フォルダを削除してから書き込む。

### 削除

```bash
curl -sS -X DELETE "$WFB_API_BASE/v1/files/report.html" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{ "deleted": true, "name": "report.html", "itemType": "file" }
```

削除対象はサーバー側でトークンの所有ユーザー配下から名前解決される。レコード ID は受け付けない。

## エラーコード

| status | code | 意味と対処 |
| --- | --- | --- |
| 400 | `invalid_request` | 必須フィールド不足や JSON 不正。ボディを見直す |
| 400 | `invalid_scope` | 許可されていないスコープを要求した |
| 400 | `unsupported_grant_type` | `grant_type` は `client_credentials` のみ |
| 400 | `unsupported_file_type` | 未対応の拡張子 |
| 401 | `invalid_client` | `client_id` / `client_secret` 不一致、または失効済み |
| 401 | `invalid_token` | トークンが無い / 期限切れ / 失効。再取得する |
| 403 | `insufficient_scope` | 必要スコープが無い。資格情報を再発行する |
| 403 | `plan_required` | 所有ユーザーが Pro でない。操作を中断する |
| 404 | `not_found` | 指定名のアイテムが自分の配下に無い |
| 404 | `unknown_route` | パスの綴り間違い |
| 405 | `method_not_allowed` | `Allow` ヘッダに使用可能なメソッドが入る |
| 429 | `rate_limited` | レート上限。`Retry-After` 秒待って再試行 |
| 500 | `server_error` | サーバー側エラー。時間をおいて再試行し、続く場合は報告する |

## 制限事項

- リクエストサイズは Lambda Function URL の上限 6MB。`wfb.mjs` は 5MB を超えると事前にエラーにする。
- レート制限はクライアント単位の分あたり固定ウィンドウ。既定は 60 リクエスト/分。
- 1 ユーザーが同時に持てる有効な資格情報は 5 件まで。
- 有効期限は所有ユーザーのプランに従う。Pro の間は無期限（`expiredAt: "none"`）だが、Pro が切れると既存ファイルの扱いも Web UI と同じルールになる。
