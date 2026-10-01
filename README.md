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

## 公開

公開サイトは [musicbox.markn2000.com](https://musicbox.markn2000.com) です。

ソースと変更履歴は [MarkN2000/musicbox](https://github.com/MarkN2000/musicbox) で管理します。Cloudflare PagesでこのGitHubリポジトリを接続し、次の設定で `dist/` を配信します。ビルドによるファイル生成は不要です。

- 本番ブランチ：`main`
- フレームワーク：なし
- ビルドコマンド：`npm test`
- 出力ディレクトリ：`dist`

`npm test` に成功した更新を公開します。ドメインはCloudflare Pagesのカスタムドメインで設定します。

## 更新

GitHubの `main` を本番のソースとし、変更後は `npm test` で確認してコミットします。GitHubを指す `origin` に `git push origin main` すると、Cloudflare Pagesが自動で公開を更新します。

今後の公開先はCloudflare Pagesに統一します。旧Sitesの公開用設定はリポジトリから除外しています。

## 利用ライブラリ

MIDI解析ライブラリのライセンス文書は `dist/vendor/` に同梱しています。
