# オルゴール楽譜エディター

公開サイト：**[musicbox.markn2000.com](https://musicbox.markn2000.com)**

30音オルゴールや88鍵の楽器向けに、楽譜を編集・試聴してTXT・Resoniteパッケージ・MIDI・MP3・OGG（Vorbis）を書き出すWebアプリです。

- マス目を押した瞬間に音を配置・削除できます。押したままなぞると連続入力でき、音のあるマスから始めると連続削除できます。ひと続きの操作はCtrl／Command＋Zでまとめて戻せます。
- 左の鍵盤で音を試聴できます。曲の再生中も音を重ねて鳴らせ、マウスで押したままなぞると連続して鳴らせます。
- Shift＋ドラッグで範囲選択し、Shiftを押して選択済みの音を掴むとまとめて移動できます。離すと選択を解除します。Shift＋クリックで選択を追加・解除、Shift＋矢印キーで微調整、Deleteで一括削除、Escで解除できます。
- 上部の各マスをクリックすると、そのステップを再生開始位置に設定します。ドラッグで範囲を選び、「削除」で音だけ消すか、「削除して詰める」で後ろを詰められます。Delete／Backspaceは音だけ削除、Shiftを加えると後ろを詰めます。左右矢印で1ステップずつ移動、Escで範囲選択解除、Ctrl／Command＋Zで取り消せます。
- 「移調 ↓ ↑」をクリックすると半音、Shift＋クリックで1オクターブ動かせます。音やステップ範囲を選択していればその音だけ、未選択なら全音が対象になり、Ctrl／Command＋Zで1クリックずつ取り消せます。非対応音も保持します。
- MIDI・stepscore形式のTXTをファイル選択やドラッグ＆ドロップで読み込み、ステップ単位を調整できます。MIDIはトラックも選べ、全体移調を引き継ぎます。部分移調後は取り込み元との連動を外して編集結果を保ちます。
- サンプルは日本語の五十音順・英語の曲名順で選べます。曲名を押すと現在の音域に合う版を読み込み、下の「オルゴール30」「ピアノ88」などの版ボタンでは直接選べます。選択した楽器で演奏できる編曲だけを表示します。
- MIDI・TXTの読み込みと変換はブラウザ内で行い、入力ファイルをサーバーに送信しません。
- 「TXTコピー」と「保存」は対応音だけを使用します。88鍵の音を保存したい場合は楽器をピアノに切り替えます。書き出しはTXT・Resoniteパッケージ・MIDI・MP3・OGG（Vorbis）から選べます。Resoniteはオルゴールなら2in1、それ以外ならSheetMusicの `StepScore/Score` に楽譜を入れます。音声は試聴と同じ音色で、先頭から1回分と余韻をブラウザ内で生成します。作成中は中止できます。
- 楽器は30弁オルゴール・88鍵ピアノ・61鍵ピアノ（C2〜C7）・61音マリンバ（C2〜C7）・32音木琴（F5〜C8）を切り替えられます。全88鍵で編集でき、非対応音は赤色と×印で表示します。楽器を選ぶだけで対応する録音音源を使います。ピアノ・マリンバ・木琴には、それぞれの楽器を録音したVSCO 2 CEのCC0音源を使用します。
- TXTは `format=stepscore,version=1,step_ms=125,title=曲名` のヘッダーと、1行1ステップの音名・休符で構成します。読み込み時の項目順は任意です。旧TXT形式には対応しません。

サンプルの正本は **`dist/samples/*.txt`**。手で編集後、`npm run build` で一覧を更新できます。`npm start` でも一覧を更新します。楽器定義は `dist/instruments.json`、音源は `dist/audio/`、翻訳は `dist/locales/` にあります。

Resoniteテンプレートは `dist/packages/`。更新は `node prepare-resonite.mjs "2in1.resonitepackage" "SheetMusic.resonitepackage"` で行います。同梱素材とライセンス表記は元パッケージのものを保持します。

MIDIはWorkerで取り込み、TXTは直接解析します。取り込み中も操作でき、中止・失敗時は編集中の楽譜を保持します。マス目は表示範囲だけを描画し、MIDIライブラリ・サンプル本文・音源は必要時に読み込みます。

詳しい操作は [SPEC.md](./SPEC.md)、テキスト形式の仕様は [StepScore v1](https://github.com/MarkN2000/stepscore/blob/v1.0.1/SPEC.ja.md) を参照してください。
2026年10月の追加曲の底本・抜粋・移調・検証は [TEMPLATE_SOURCES.md](./TEMPLATE_SOURCES.md) に記録しています。

## ローカルで使う

Node.jsを用意し、次のコマンドを実行します。

```sh
npm ci
npm run build
npm test
npm start
```

ブラウザで `http://127.0.0.1:4173` を開きます。

同じLANの別端末で確認する場合は `npm start -- --lan` で起動し、別端末のブラウザで `http://PCのIPv4アドレス:4173/` を開きます。PCのアドレスはWindowsの `ipconfig` で確認できます。

ブラウザの操作確認は、サーバーを起動した状態で `node check-browser.mjs` を実行します。事前に `npm test` が生成した大きなMIDIを使い、保存・再取り込み・編集・言語・楽器・中止・モバイル表示を確認します。既存のPlaywrightまたはCodex同梱ランタイムが必要です。Windowsではインストール済みのEdgeを使用します。

## 楽譜と音源を編集する

サンプルは `dist/samples/` のTXTを直接編集します。1行目に題名・作曲者・編曲対象・拍子など、2行目以降に音符を記録します。編曲はファイル名で区別します。編集後は `npm run build`、続いて `npm test` を実行します。曲目一覧の `index.json` は手で編集しません。作曲者・編曲対象・拍子などのサンプル用項目は、サイトのTXT書き出しには含めません。

曲目一覧は [samples/index.json](https://musicbox.markn2000.com/samples/index.json) の `songs` に曲名・作曲者を、各曲の `versions` に楽器・ファイル名・使用音をまとめています。StepScoreのURLは `https://musicbox.markn2000.com/samples/` に各版の `file` をつなげたものです。

同じ曲の各版は曲ID・曲名・作曲者をそろえ、`arranged_for` で音域を指定します。既存の曲IDはファイル名から楽器の末尾を除いた値です。同じ楽器向けに追加する版は別ファイルにし、例えば `air-on-g-musicbox-30-easy.txt` のヘッダーに `song_id=air-on-g,label_ja=オルゴール30(易),label_en=Music box 30 (Easy)` を追加します。ラベルはそのまま表示する短い名前で、難易度以外の違いにも使えます。省略時は一覧生成で対象楽器の短いラベルを補うため、表示側は `label_ja` または `label_en` を使うだけです。同じ楽器では一覧の配列順（生成時はファイル名順）の先頭を優先します。ピアノ61鍵とマリンバ61音は `piano61` を共有します。曲ID・ラベルはサイトのTXT書き出しには含めません。

楽器の対応音・編曲対象（`arrangedFor`）と音源ID（`defaultSoundset`）は `dist/instruments.json`、音源一覧は `dist/audio/soundsets.json` で指定します。録音ファイルは `dist/audio/<音源ID>/` に置き、音源一覧の `files` に音名とファイル名を対応付けます。変更後はビルドしてキャッシュ識別子を更新します。

## 構成

- `dist/`：配信するHTML・CSS・JavaScript・楽器定義・多言語データ・音源。アプリのソースもこの中にあります。
- `build-catalog.mjs`：サンプルの検証、曲目一覧・キャッシュ識別子の生成。
- `check.mjs`：TXT形式、MIDI・TXTのWorker変換、楽器定義、音源、翻訳、収録曲と生成一覧の確認。
- `check-mp3.mjs`：MP3・OGG変換と保存メニュー・保存操作の確認。`npm test` で併せて実行します。
- `check-browser.mjs`：実際のブラウザでの操作・取り込み・描画・応答性の確認。
- `serve.mjs`：ローカル確認用の静的ファイルサーバー。
- `SPEC.md`：操作・出力・データ管理の仕様。
- `TEMPLATE_SOURCES.md`：サンプルの底本・権利確認・編曲の記録。
- `wrangler.json`：Cloudflare Workersで `dist/` を配信する設定。

## 公開

公開サイトは [musicbox.markn2000.com](https://musicbox.markn2000.com) です。

ソースと変更履歴は [MarkN2000/musicbox](https://github.com/MarkN2000/musicbox) で管理します。Cloudflare Workersの静的アセットとして `dist/` を配信します。サンプルの一覧は `npm run build` で生成します。配信時のWorkerのJavaScriptコードは不要です。

WorkersのGit連携にこのGitHubリポジトリを接続し、次の設定にします。

- Worker名：`musicbox`
- 本番ブランチと自動ビルド対象：`main`
- ルートディレクトリ：空欄（リポジトリのルート）
- ビルドコマンド：`npm run build && npm test`
- デプロイコマンド：`npx wrangler deploy`

配信対象は `wrangler.json` の `assets.directory` で `./dist` に指定します。`name` はCloudflare上のWorker名と一致させます。Wranglerの互換日付は `2026-09-30` とします。ドメインはWorkersの「ドメインとルート」で設定します。

`npm test` に成功した更新を公開します。ローカルでは `npx wrangler deploy --dry-run` で配信設定を確認でき、実際の公開は行いません。

## 更新

GitHubの `main` を本番のソースとし、変更後は `npm run build` と `npm test` で確認してコミットします。WorkersのGit連携と `main` の自動ビルドが有効なら、GitHubを指す `origin` に `git push origin main` するとCloudflareがテストとデプロイを実行します。公開完了はCloudflareのビルド履歴と公開サイトで確認します。

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
