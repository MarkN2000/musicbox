# オルゴール楽譜エディター

公開サイト：**[musicbox.markn2000.com](https://musicbox.markn2000.com)**

30音のオルゴール向けに、楽譜を編集・試聴してTXTやMIDIを書き出すWebアプリです。

- マス目をクリック・ドラッグして音を配置し、実際のオルゴール音源で試聴できます。
- MIDIを読み込み、トラック・音の高さ・ステップ単位を調整できます。
- クラシック・行進曲・民謡など42曲のオルゴール編曲を収録しています。
- MIDIの読み込みと変換はブラウザ内で行い、入力ファイルをサーバーに送信しません。

詳しい操作と出力形式は [SPEC.md](./SPEC.md) を参照してください。

## ローカルで使う

Node.jsを用意し、次のコマンドを実行します。

```sh
npm ci
npm test
npm start
```

ブラウザで `http://127.0.0.1:4173` を開きます。

## 構成

- `dist/`：配信するHTML・CSS・JavaScript・30音のOGG音源。アプリのソースもこの中にあります。
- `check.mjs`：TXT形式、MIDI変換、編集操作、試聴、音源、収録曲などの確認。
- `serve.mjs`：ローカル確認用の静的ファイルサーバー。
- `SPEC.md`：操作・出力・収録曲の仕様。
- `wrangler.json`：Cloudflare Workersで `dist/` を配信する設定。

## 公開

公開サイトは [musicbox.markn2000.com](https://musicbox.markn2000.com) です。

ソースと変更履歴は [MarkN2000/musicbox](https://github.com/MarkN2000/musicbox) で管理します。Cloudflare Workersの静的アセットとして `dist/` を配信します。ビルドによるファイル生成やWorkerのJavaScriptコードは不要です。

WorkersのGit連携にこのGitHubリポジトリを接続し、次の設定にします。

- Worker名：`musicbox`
- 本番ブランチと自動ビルド対象：`main`
- ルートディレクトリ：空欄（リポジトリのルート）
- ビルドコマンド：`npm test`
- デプロイコマンド：`npx wrangler deploy`

配信対象は `wrangler.json` の `assets.directory` で `./dist` に指定します。`name` はCloudflare上のWorker名と一致させます。Wranglerの互換日付は `2026-09-30` とします。ドメインはWorkersの「ドメインとルート」で設定します。

`npm test` に成功した更新を公開します。ローカルでは `npx wrangler deploy --dry-run` で配信設定を確認でき、実際の公開は行いません。

## 更新

GitHubの `main` を本番のソースとし、変更後は `npm test` で確認してコミットします。WorkersのGit連携と `main` の自動ビルドが有効なら、GitHubを指す `origin` に `git push origin main` するとCloudflareがテストとデプロイを実行します。公開完了はCloudflareのビルド履歴と公開サイトで確認します。

GitHub連携の設定時は、Cloudflare Workers and Pagesアプリに `MarkN2000/musicbox` へのアクセスを許可してください。連携を復旧した後は、最新の `main` のビルドとデプロイが成功したことを確認します。

公開先はCloudflare Workersとします。旧Sitesの公開用設定はリポジトリから除外しています。

## 利用ライブラリ

MIDI解析ライブラリのライセンス文書は `dist/vendor/` に同梱しています。
