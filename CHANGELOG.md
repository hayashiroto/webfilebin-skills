# 変更履歴

このリポジトリで配布しているスキルの変更をまとめます。
日付は公開日（JST）です。

## webfilebin-file-ops

### 1.0.0 — 2026-08-26

初回公開。

- `upload` / `upload-folder` / `delete` / `list` / `whoami` / `clear-token` の6コマンド
- OAuth 2.0 client credentials（`Authorization: Basic`）でトークンを取得し、期限付きでローカルにキャッシュ
- スコープ `webfilebin/upload` / `webfilebin/delete` / `webfilebin/list` に対応
- Node.js 20 以上の組み込み `fetch` のみを使用し、外部依存なし
