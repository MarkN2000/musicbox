# ライセンス

このプロジェクトは、ソフトウェアと音源・サンプル楽譜でライセンスを分けています。

| 対象 | ライセンス |
| --- | --- |
| 本プロジェクトが作成したコード・文書 | [MIT](./LICENSE) |
| MarkNが録音・作成した30音のOGG音源（`dist/audio/musicbox-30/*.ogg`） | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) |
| VSCO 2 CEのアップライトピアノから作成した88鍵のOGG音源（`dist/audio/vsco-piano/*.ogg`） | CC0 — [元のライセンス本文](./LICENSE-VSCO-2-CE.txt) |
| 収録サンプルの編曲・楽譜データ（`dist/samples/*.txt` と曲目一覧） | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) |

## ソフトウェア：MIT

本プロジェクトのコード・文書はMITライセンスで公開します。改変・再配布・商用利用が可能です。再配布時は著作権表示と許諾文を保持してください。本文は [LICENSE](./LICENSE) にあります。

楽譜の読み込み・編集・曲目一覧の生成コードもMITです。同梱の第三者ライブラリには、後述の元のライセンスが適用されます。

## 音源・サンプル楽譜：CC0

MarkNは、上記の録音・編曲・楽譜データについて保有する著作権および関連する権利を、[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en) の条件に従って放棄します。法的に放棄できない範囲では、CC0の代替ライセンスを適用します。

改変・再配布・商用利用が可能で、クレジット表記は不要です。この指定は作者が保有する権利を対象とし、原曲や参照譜に対する第三者の権利を変更するものではありません。

利用者が取り込むMIDIや作成・編集する楽譜全般を、自動的にCC0またはMITへ変更するものではありません。

## VSCO 2 CEのピアノ音源

- 出典：[VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE)、版 [`440300901dfe9275fd84e0b7763af1f8443ae62e`](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e)。録音：Simon Dalzell / Ivy Audio、提供：Versilian Studios / Sam Gossner。[録音の説明](https://github.com/sgossner/VSCO-2-CE/blob/440300901dfe9275fd84e0b7763af1f8443ae62e/Keys/Upright%20Piano/Info.txt)。
- `Keys/Upright Piano/Player_dyn2_rr1_*.wav` の23録音だけを使用する。中間の強弱・同音の録音1種類に固定する。元WAVは配信・同梱しない。
- 元の `MappingChart.txt` に従い、MIDI21〜108の各音に最も近い録音を使う。同距離なら低い録音を選び、最大±2半音を再サンプリングして補う。元録音は固定した版のGit blobハッシュと照合済み。
- 変換：FFmpegの `asetrate`・`aresample`、44.1kHz・ステレオ・OGG Vorbis 96kbps。各元録音のピークを−3dBFSに揃え、50ms区間のRMSが元のピークより50dB以上小さい末尾を整理し、250msの余裕と最後50msのフェードを残す。発音の先頭は移動しない。最高音の録音 `_044.wav` は実測で約50〜70セント高いため、60セント下げて補正する（B7・C8）。
- 加工後の音源もCC0。ライセンス・出典はこのリポジトリに記録し、サイトの音源フォルダーには文書を追加しない。

## 同梱ライブラリ

第三者のライブラリとライセンス文書は、元の条件を保持して同梱しています。

| ライブラリ | ライセンスと文書 |
| --- | --- |
| @tonejs/midi | MIT — [LICENSE-midi.md](./dist/vendor/LICENSE-midi.md) |
| midi-file | MIT — [LICENSE-midi-file.md](./dist/vendor/LICENSE-midi-file.md) |
| array-flatten | MIT — [LICENSE-array-flatten.txt](./dist/vendor/LICENSE-array-flatten.txt) |
| lamejs 1.2.1（LAMEのJavaScript移植） | LGPL-3.0 — [ライセンス案内とソース配布物](./dist/vendor/LICENSE-lamejs.md)、[LGPL本文](./dist/vendor/LICENSE-LGPL-3.0.txt)、[GPL本文](./dist/vendor/LICENSE-GPL-3.0.txt) |
| wasm-media-encoders 0.7.0・libogg・libvorbis（OGG Vorbis変換）と補助コード | [ライセンス案内](./dist/vendor/LICENSE-vorbis.md)、[MIT本文](./dist/vendor/LICENSE-wasm-media-encoders.txt)、BSDの[libogg](./dist/vendor/LICENSE-libogg.txt)・[libvorbis](./dist/vendor/LICENSE-libvorbis.txt)、[補助コードの原文](./dist/vendor/LICENSE-vorbis-runtime.txt) |

作者のホームページ：[markn2000.com](https://markn2000.com/)。
