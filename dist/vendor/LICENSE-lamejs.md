# lamejs 1.2.1

MP3変換には、Alex Zhukovによる [lamejs](https://github.com/zhuker/lamejs) を利用します。[LAME](https://lame.sourceforge.net/) のJavaScript移植です。npmパッケージのライセンス指定は LGPL-3.0 です。

- `lame-1.2.1.js`：配布物の `lame.all.js` を変更せず、独立したスクリプトとして使用。
- `lamejs-1.2.1-source.tgz`：元のnpm配布物。JavaScriptとJavaのソース、ビルド手順、作者の文書を含みます。
- `LICENSE-lamejs-upstream.txt`：元の配布物に含まれるライセンス案内。
- `LICENSE-LGPL-3.0.txt` と `LICENSE-GPL-3.0.txt`：ライセンス本文。

元の配布物：https://registry.npmjs.org/lamejs/-/lamejs-1.2.1.tgz

配布物のSHA-512（Base64）：`s7bxvjvYthw6oPLCm5pFxvA84wUROODB8jEO2+CE1adhKgrIvVOlmMgY8zyugxGrvRaDHNJanOiS21/emty6dQ==`

MP3変換専用のWeb Workerから読み込むため、利用者が独自のlamejsに差し替えて動作を確認できます。生成したMP3にライブラリのソースは含まれません。
