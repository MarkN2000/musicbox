# オルゴール楽譜エディター

公開サイト：**[musicbox.markn2000.com](https://musicbox.markn2000.com)**

30音のオルゴール向けに、楽譜を編集・試聴してTXT・MIDI・MP3・OGG（Vorbis）を書き出すWebアプリです。

- マス目を押した瞬間に音を配置・削除し、実際のオルゴール音源で試聴できます。押したままなぞると連続入力でき、音のあるマスから始めると連続削除できます。ひと続きの操作はCtrl／Command＋Zでまとめて戻せます。
- 左の鍵盤で音を試聴できます。曲の再生中も音を重ねて鳴らせ、マウスで押したままなぞると連続して鳴らせます。
- Shift＋ドラッグで範囲選択し、Shiftを押して選択済みの音を掴むとまとめて移動できます。離すと選択を解除します。Shift＋クリックで選択を追加・解除、Shift＋矢印キーで微調整、Deleteで一括削除、Escで解除できます。
- MIDI・stepscore形式のTXTをファイル選択やドラッグ＆ドロップで読み込み、音の高さ・ステップ単位を調整できます。MIDIはトラックも選べます。
- 全97曲のオルゴール編曲を「クラシック・民謡」「行進曲・軍歌」にまとめ、曲名の読みの五十音順で選べます。
- MIDI・TXTの読み込みと変換はブラウザ内で行い、入力ファイルをサーバーに送信しません。
- 「コピー」でテキストをコピーし、「保存 ▾」からTXT・MIDI・MP3・OGG（Vorbis）を選べます。MP3・OGGは試聴と同じ音色で、先頭から1回分と余韻をブラウザ内で生成します。作成中は「中止 ■」で中止できます。
- TXTは `format=stepscore,version=1,step_ms=125,title=曲名` のヘッダーと、1行1ステップの音名・休符で構成します。読み込み時の項目順は任意です。旧TXT形式には対応しません。

詳しい操作は [SPEC.md](./SPEC.md)、テキスト形式の仕様は [STEPSCORE.md](./STEPSCORE.md) を参照してください。
2026年10月の追加曲の底本・抜粋・移調・検証は [TEMPLATE_SOURCES.md](./TEMPLATE_SOURCES.md) に記録しています。

## ローカルで使う

Node.jsを用意し、次のコマンドを実行します。

```sh
npm ci
npm test
npm start
```

ブラウザで `http://127.0.0.1:4173` を開きます。

同じLANの別端末で確認する場合は `npm start -- --lan` で起動し、別端末のブラウザで `http://PCのIPv4アドレス:4173/` を開きます。PCのアドレスはWindowsの `ipconfig` で確認できます。

## 構成

- `dist/`：配信するHTML・CSS・JavaScript・30音のOGG音源。アプリのソースもこの中にあります。
- `check.mjs`：TXT形式、MIDI変換、編集操作、試聴、音源、収録曲などの確認。
- `check-mp3.mjs`：MP3・OGG変換と保存メニュー・保存操作の確認。`npm test` で併せて実行します。
- `serve.mjs`：ローカル確認用の静的ファイルサーバー。
- `SPEC.md`：操作・出力・収録曲の仕様。
- `STEPSCORE.md`：楽器に依存しないstepscore形式の仕様。
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

## ライセンス

- 本プロジェクトのコード・文書：[MIT](./LICENSE)。
- 作者が録音・作成した30音のOGG音源と、収録サンプルの編曲・楽譜データ：[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)。

適用範囲と同梱ライブラリの条件は [LICENSES.md](./LICENSES.md) に記載しています。利用者が取り込むMIDIや作成する楽譜には、この指定を自動で適用しません。

作者のホームページ：[markn2000.com](https://markn2000.com/)。

## 利用ライブラリ

MIDI解析ライブラリのライセンス文書は `dist/vendor/` に同梱しています。MP3変換には [lamejs 1.2.1](https://github.com/zhuker/lamejs)（[LAME](https://lame.sourceforge.io/) のJavaScript移植、LGPL-3.0）を変更せず利用します。ライセンスと元のソース配布物も同梱し、詳細は `dist/vendor/LICENSE-lamejs.md` に記載しています。

OGG（Vorbis）変換には [wasm-media-encoders 0.7.0](https://github.com/arseneyr/wasm-media-encoders)とlibogg／libvorbisを利用します。配布元のJavaScriptとWebAssemblyを変更せず同梱し、外部CDNへの接続は不要です。ライセンスと配布物の識別子は `dist/vendor/LICENSE-vorbis.md` に記載しています。
