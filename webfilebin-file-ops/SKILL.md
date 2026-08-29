---
name: webfilebin-file-ops
description: WebFileBin（webfilebin.com）へHTML/画像/フォルダをOAuth経由でアップロード・削除・一覧し、公開URLにパスワードをかけるワークフロー。「このHTMLを公開して」「パスワード付きで共有して」「公開中のファイルを一覧して」「あのページを消して」のようにWebFileBinの公開ファイルを操作したいときに使用する。Proプランの資格情報が必要。フォルダにはパスワードを設定できない。
---

# WebFileBin File Ops

## 概要
WebFileBin はHTML・画像・フォルダをアップロードすると即座に公開URLが発行される共有サービス。このスキルは Pro ユーザー向けのエージェント API（OAuth 2.0 client credentials）を使い、ブラウザを開かずに `upload` / `delete` / `list` / `protect` を実行する。ユーザーから「この成果物を公開して」「パスワード付きで共有して」「公開URLを教えて」「もう使わないので消して」のような依頼を受けた場合、[scripts/wfb.mjs](scripts/wfb.mjs) を通して安全に操作する。
