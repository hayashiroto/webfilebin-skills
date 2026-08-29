# 変更履歴

このリポジトリで配布しているスキルの変更をまとめます。
日付は公開日（JST）です。

## webfilebin-file-ops

### 1.1.0 — 2026-08-30

公開URLにパスワードをかけられるようにした。

- `upload --password` でアップロードと同時に保護
- `protect` / `unprotect` であとから設定・差し替え・解除
- `list` の各アイテムに `accessMode`（`public` / `password`）を表示
- フォルダにはパスワードを設定できない（配下のアセットが個別配信されるため）
- パスワードは `--password` の代わりに `WFB_SITE_PASSWORD` でも渡せる

### 1.0.0 — 2026-08-26

初回公開。

- `upload` / `upload-folder` / `delete` / `list` / `whoami` / `clear-token` の6コマンド
- OAuth 2.0 client credentials（`Authorization: Basic`）でトークンを取得し、期限付きでローカルにキャッシュ
- スコープ `webfilebin/upload` / `webfilebin/delete` / `webfilebin/list` に対応
- Node.js 20 以上の組み込み `fetch` のみを使用し、外部依存なし
