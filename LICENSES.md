# ライセンス

このプロジェクトは、ソフトウェアと音源・サンプル楽譜でライセンスを分けています。

| 対象 | ライセンス |
| --- | --- |
| 本プロジェクトが作成したコード・文書 | [MIT](./LICENSE) |
| MarkNが録音・作成した30音のOGG音源（`dist/audio/*.ogg`） | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) |
| 収録サンプルの旋律・伴奏・編曲・楽譜データ（`dist/templates.js` のデータ部分） | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) |

## ソフトウェア：MIT

本プロジェクトのコード・文書はMITライセンスで公開します。改変・再配布・商用利用が可能です。再配布時は著作権表示と許諾文を保持してください。本文は [LICENSE](./LICENSE) にあります。

`dist/templates.js` に含まれるデータの展開などの処理コードもMITです。同梱の第三者ライブラリには、後述の元のライセンスが適用されます。

## 音源・サンプル楽譜：CC0

MarkNは、上記の録音・編曲・楽譜データについて保有する著作権および関連する権利を、[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en) の条件に従って放棄します。法的に放棄できない範囲では、CC0の代替ライセンスを適用します。

改変・再配布・商用利用が可能で、クレジット表記は不要です。この指定は作者が保有する権利を対象とし、原曲や参照譜に対する第三者の権利を変更するものではありません。

利用者が取り込むMIDIや作成・編集する楽譜全般を、自動的にCC0またはMITへ変更するものではありません。

## 同梱ライブラリ

第三者のライブラリとライセンス文書は、元の条件を保持して同梱しています。

| ライブラリ | ライセンスと文書 |
| --- | --- |
| @tonejs/midi | MIT — [LICENSE-midi.md](./dist/vendor/LICENSE-midi.md) |
| midi-file | MIT — [LICENSE-midi-file.md](./dist/vendor/LICENSE-midi-file.md) |
| array-flatten | MIT — [LICENSE-array-flatten.txt](./dist/vendor/LICENSE-array-flatten.txt) |
| lamejs 1.2.1（LAMEのJavaScript移植） | LGPL-3.0 — [ライセンス案内とソース配布物](./dist/vendor/LICENSE-lamejs.md)、[LGPL本文](./dist/vendor/LICENSE-LGPL-3.0.txt)、[GPL本文](./dist/vendor/LICENSE-GPL-3.0.txt) |

作者のホームページ：[markn2000.com](https://markn2000.com/)。
