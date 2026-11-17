# ライセンス

このプロジェクトは、ソフトウェアと音源・サンプル楽譜でライセンスを分けています。

| 対象 | ライセンス |
| --- | --- |
| 本プロジェクトが作成したコード・文書 | [MIT](./LICENSE) |
| MarkNが録音・作成した30音のOGG音源（`dist/audio/musicbox-30/*.ogg`） | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) |
| VSCO 2 CEのアップライトピアノから作成した88鍵のOGG音源（`dist/audio/vsco-piano/*.ogg`） | CC0 — [元のライセンス本文](./LICENSE-VSCO-2-CE.txt) |
| VSCO 2 CEのマリンバから作成した61音のOGG音源（`dist/audio/vsco-marimba/*.ogg`） | CC0 — [元のライセンス本文](./LICENSE-VSCO-2-CE.txt) |
| VSCO 2 CEの木琴から作成した32音のOGG音源（`dist/audio/vsco-xylophone/*.ogg`） | CC0 — [元のライセンス本文](./LICENSE-VSCO-2-CE.txt) |
| FreePats・Karoryfer由来のギター・ベース・電子ドラム音源（`dist/audio/freepats-*/*.ogg`） | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) |
| MuseScore General由来の補完音源（`dist/audio/musescore-*/*.ogg`） | [MIT・著作権表示・収録出典](./dist/vendor/LICENSE-musescore-general.md) |
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
- 変換：FFmpegの `asetrate`・`aresample`、48kHz・元録音のステレオを維持したOgg Opus 128kbps（VBR）。各元録音のピークを−3dBFSに揃え、50ms区間のRMSが元のピークより50dB以上小さい末尾を整理し、250msの余裕と最後50msのフェードを残す。発音の先頭は移動しない。最高音の録音 `_044.wav` は実測で約50〜70セント高いため、60セント下げて補正する（B7・C8）。
- 加工後の音源もCC0。ライセンス・出典はこのリポジトリに記録し、サイトの音源フォルダーには文書を追加しない。

## VSCO 2 CEのマリンバ音源

- 出典：[VSCO 2 Community Editionのマリンバ](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Marimba)。元録音はピアノと同じ版の `Marimba_hit_Outrigger_*_loud_01.wav` 10録音に固定し、Git blobハッシュと照合済み。元WAVは同梱しない。
- 音高対応は公式[Marimba.sfz](https://github.com/sgossner/VSCO-2-CE/blob/6dd651d55dde97fd4028699be9d4481f26917891/Marimba.sfz)に従う。元ファイル名のオクターブ表記ではなく `pitch_keycenter` のMIDI番号を使用する。元の範囲内では各 `lokey`〜`hikey` の録音を使い、外側は最寄りの録音で補う。C2〜E2はF2を最大5半音下げる。
- 変換はFFmpegの `asetrate`・`aresample`、48kHz・元録音のステレオを維持したOgg Opus 128kbps（VBR）。元録音のピークを−3dBFSに揃え、50ms区間のRMSが元のピークより50dB以上小さい末尾を整理し、元録音上で250msの余裕を残す。音高変換後の最後50msをフェードアウトし、発音の先頭は移動しない。自然減衰を使い、音を引き伸ばさない。
- 加工後の音源もCC0。ライセンス・出典はこのリポジトリに記録し、サイトの音源フォルダーには文書を追加しない。

## VSCO 2 CEの木琴音源

- 出典：[VSCO 2 Community Editionの木琴](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Xylo)。元録音はピアノと同じ版の `Xylo_Medium_{G4,C5,G5,C6,G6,C7}_ff_01_far.wav` 6録音に固定し、Git blobハッシュと照合済み。元WAVは同梱しない。
- 公式[Xylophone.sfz](https://github.com/sgossner/VSCO-2-CE/blob/6dd651d55dde97fd4028699be9d4481f26917891/Xylophone.sfz)の `pitch_keycenter` と `lokey`〜`hikey` は記譜音で、録音の実音は1オクターブ高い。MIDI番号を12半音上げ、最初500msのFFTで測った実音からA4=440Hzへ調律差（約13〜20セント）を補正する。対応範囲内の中間音を最大3半音移調し、録音範囲の外には拡張しない。マリンバと同じ変換条件でF5〜C8の32音を作り、自然減衰を使う。
- 加工後の音源もCC0。ライセンス・出典はこのリポジトリに記録し、サイトの音源フォルダーには文書を追加しない。

## VSCO 2 CEの追加音色

- 出典：Versilian Studios / Sam Gossner、Simon Dalzellの[VSCO 2 CE](https://github.com/sgossner/VSCO-2-CE/tree/6dd651d55dde97fd4028699be9d4481f26917891)、版 `6dd651d55dde97fd4028699be9d4481f26917891`。元録音・加工後ともCC0。元WAVは同梱しない。
- 対象：グロッケン、チューブラーベル、パイプオルガン、ヴァイオリン、ヴィオラ、チェロ、コントラバス、トレモロ/ピチカート/通常ストリングス、ハープ、ティンパニ、トランペット、トロンボーン、チューバ、弱音トランペット、ホルン、オーボエ、ファゴット、クラリネット、ピッコロ、フルート、打楽器。ヴィオラは合奏録音、チェロは後述の独奏録音へ差し替えた。ストリングス3種は各弦楽器の対応音を重ねて使用する。
- `node prepare-vsco.mjs` で再生成する。公式SFZと元録音のGit blobハッシュを照合し、ベロシティ90・同音録音1種類を選ぶ。音域はSFZの対応範囲と88鍵の共通部分に限定する。グロッケンとピッコロは録音の実音に合わせてSFZの記譜音を1オクターブ上げる。
- FFmpegで近い録音から各音を事前生成し、Ogg Opus・128kbps（VBR）・48kHzで元録音のチャンネル数を維持して圧縮する。元録音のピークを−6dBFSに揃え、50ms区間のRMSがピークより50dB以上低い末尾を整理し、250msの余裕と最後50msのフェードを残す。先頭の時刻は動かさない。持続音のループは後述の設定に従う。
- 打楽器はGM1に対応する16キー（36、38、49、51、54、56、59、62、63、64、73、75、76、77、80、81）。元の `GM-StylePerc.sfz` の独自配列をそのままGMとして使わず、ライド・低いコンガ・ギロを対応位置へ置き直す。不足分は以下のCC0録音で補う。

## FreePatsの追加音色

- ナイロン弦ギター：Robertoによる[Spanish classical guitar](https://github.com/freepats/spanish-classical-guitar/tree/6f4eb1b092acc88f5448cea1a0001bd07b971af8)、2019-06-18版。GM24（0始まり）。
- クリーン・エレキギター：[Electric Guitar FSBS clean](https://github.com/freepats/electric-guitar-FSBS-clean/tree/192cf0d9bf2c4ba6ead8e3524ba3f78818e4fe91)、2026-08-07版。GM27。
- 指弾き・ピック弾きベースは、音域の広いKaroryfer録音へ差し替えた。既存ID `freepats-finger-bass`・`freepats-picked-bass` を保持する。出典は次節。
- 電子ドラム：Robertoによる[Synthesizer percussion](https://github.com/freepats/synthesizer-percussion/tree/39bbabce8e0e10aa259d5d94fca329f668733185)、2022-07-18版。独自配列をGMのキック・スネア・クラップ・ハイハット・タム・シンバルの位置へ対応させ、VSCO打楽器に不足する13キーを補う。既存の16キーは保持し、混合バンクは従来の `vsco-percussion` IDで全29キーを扱う。
- すべてCC0。固定版のSFZ・録音とCC0ライセンスのGit blobハッシュを照合し、上記VSCOと同じ `node prepare-vsco.mjs` で元録音のチャンネル数を維持した48kHz・Ogg Opus 128kbps（VBR）へ変換する。元FLACは同梱しない。

## 音域を拡張したCC0音源

- コンサート用木琴：Versilian Studiosの[VCSL固定版](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e)、`Idiophones/Struck Idiophones/Xylophone/Medium Mallets` の8録音。実音G4・C5・G5・C6・G6・C7・G7・C8に対応させ、近接音からF4〜C8の44音を生成する。FFTで測った約12〜20セントの調律差を補正する。GM13の既定は `vsco-xylophone-concert` とし、従来の32鍵版も保持する。
- 指弾きベース：D. Smolken / Karoryfer Lecoldsの[Fashionbass固定版](https://github.com/sfzinstruments/karoryfer.fashionbass/tree/0703973b300a6bacb837602be9b588ab64732a72)、`fashionbass_clean.sfz` の通常音。GM33。
- ピック弾きベース：Karoryfer Lecoldsの[Growlybass固定版](https://github.com/sfzinstruments/karoryfer.growlybass/tree/4f483268fc66b5a6d5781d421c0d11b8d08d3fc6)、`growlybass_clean.sfz` のsustain録音。GM34。SFZの割り当てより実音が1オクターブ低いため、root・音域の番号を12半音下げて実音へ合わせる。rootを省略したC4領域はSFZ標準の60を使う。ノイズ・スクレイプ・リリース専用録音は使わない。
- ベース2種は実音B0〜G4。録音とCC0ライセンスをGit blobハッシュで照合し、上記と同じ生成処理でOgg Opus・128kbps（VBR）・48kHzで元録音のチャンネル数を維持して変換する。入力したMIDIノート自体は移調しない。
- チェロ：[Karoryfer x bigcat cello](https://github.com/sfzinstruments/karoryfer-bigcat.cello/tree/6fd75fbfc1dbb3109bf26220ba1adea46188a18b)。Kamila Borowiakの独奏録音でC2〜C6を用意する。`vc_arco_sus_map.sfz` の通常sustain・ベロシティ90・1録音を使い、ハーモニクス・ノイズを除く。SFZのroot/音域より録音実音が1オクターブ高いため12半音上げる。音源ID `vsco-cello` は保持する。

## GM打楽器の補完

- 上記29キーに不足する18キーを追加し、35〜81の全47キーを同じ `vsco-percussion` バンクから使う。既存の録音とキーは保持する。すべてCC0、固定版のライセンスと元録音をGit blobハッシュで照合し、同じ生成処理でOgg Opus 128kbps（VBR）・48kHzで元録音のチャンネル数を維持して圧縮する。
- [VCSL](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e)：ビブラスラップ・ボンゴ2種・アゴゴ2種・カバサ・ホイッスル2種・長いギロ。
- [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums/tree/9f04cf9a734527edfbb0a4eee1f674e45bbf71bc)：サイドスティック・ライドベル・ティンバレス2種・クイーカ2種。
- [Big Rusty Drums](https://github.com/sfzinstruments/karoryfer.big-rusty-drums/tree/f07ce00df34a46b6b08375be56fe116cf15782bc)：チャイナシンバル。[Swirly Drums](https://github.com/sfzinstruments/karoryfer.swirly-drums/tree/c40dafe0011cb2e54c0c220ff0fa308a11fc60f5)：スプラッシュシンバル。
- [FreePats World Percussion](https://github.com/freepats/world-percussion/tree/e54eb2912a0d6d4444ab205d52f778e27da0fc96)：マラカス。

## チェレスタ・ヴィブラフォン

- チェレスタ：stamperadamの[Celeste Samples](https://freesound.org/people/stamperadam/packs/6166/)。原作者がCC0公開した録音を、[Virtual Playing Orchestra 3.2の再配布物](https://archive.org/download/virtual-playing-orchestra-3-2-wave-files/Virtual-Playing-Orchestra3-2-wave-files.zip/)の `libs/stamperadam/samples/celesta` から取得する。同梱ライセンスと11録音のGit blobハッシュを固定する。G表記の4ファイルは実音G♯として扱い、FFTで測定した−5〜+61セントの調律差を補正する。GM8、実音C4〜G♯7。G♯6はsoft、それ以外はhard録音を使う。
- ヴィブラフォン：[VCSL固定版](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e)の `Vibraphone/Soft Mallets`、v2の11録音。GM11、実音F3〜E6。ファイル名のオクターブより実音が1オクターブ高いことをFFTで確認し、MIDI番号へ反映する。
- 両者とも録音の両端を超えて補完せず、間の音を近接録音から生成する。既存と同じ元録音のチャンネル数を維持した48kHz・Ogg Opus 128kbps（VBR）、離鍵後0.15秒の余韻を使う。録音はループで引き伸ばさない。新規分だけの再生成は `node prepare-vsco.mjs --only=stamperadam-celesta,vsco-vibraphone`。
- 2026-11-15のCC0調査では、弦合奏3種のD6より上、ピッコロのG5〜G7の外、トロンボーンのF4より上、通常のイングリッシュホルン録音は確保できていない。VSCO/VCSL、原作者のFreesound公開、SFZ Instrumentsのカタログを確認した。合唱候補の[SpectMorph](https://github.com/swesterfeld/spectmorph-instruments/tree/08eba76eadfdc16ded3209f65d3890bf1a2b8c0c)にはCC0の3歌手録音があるが、ソプラノ・テナーの指定クリップは約1秒で、録音を伸ばさない当時の方針では合唱の長音用途を満たせず保留する。

## MuseScore Generalによる補完（MIT）

- 追加元は[MuseScore General 0.2](https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/)の1音源集にまとめる。原著作権表示・MIT本文・収録出典一覧・生成ツールのライセンスを [LICENSE-musescore-general.md](./dist/vendor/LICENSE-musescore-general.md) にまとめて同梱し、サイト下部からリンクする。OGGにもMIT・出典・著作権者を記録する。
- Frank Wen（FluidR3）、Michael Cowgill（FluidR3Mono）、S. Christian Collins（MuseScore General）、Ethan Winer、Michael Schorschの表示を保持する。元の [License](https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General_License.md) と [Sample Sources](https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General_Sample_Sources.csv) を省略せず収録する。
- GMの未収録音色を補い、旋律128音色を用意する。音域不足のある弦・管、ハープ、チェレスタ、ヴィブラフォンなどは楽器単位で置換する。MuseScore由来のGM音色は実楽器の標準音域で制限せず、元SF2の対応範囲とA0〜C8の共通範囲を使う。パイプオルガンは最高域の元サンプルを最大1オクターブ上げてC8まで補い、A0〜C8に対応する。既存パートの楽器IDは保持し、録音ピアノ・オルゴール・マリンバ・木琴などは従来の音源を使う。従来のCC0バンクも残す。
- `node prepare-musescore.mjs` で生成する。`--extend` を付けると既存の音を維持し、未生成の音域だけ元SF2から追加する。SF2のSHA-256は `ee51d2c4b1525e70f19a45909c4fd7a2e26d91d115fa89dbf5a6bc413d8b9bf3`。生成時のみ[TinySoundFont固定版](https://github.com/schellingb/TinySoundFont/tree/853a0a171759f1ddba0de1442133a75912bbeffa)（MIT）とGCCを使用し、SF2・ヘッダー・ライセンス・出典一覧のハッシュを照合する。ブラウザの依存関係は増やさない。
- 音源の基本プリセットをベロシティ90でステレオ生成し、48kHz・Ogg Opus 128kbps（VBR）へ圧縮する。左右が同一の音はモノラルにする。持続音は元のアタックと定常部分を50msで接続し、圧縮前のPCMで40msのフェードイン／アウトを混合して区間長を保ち、ループの継ぎ目を整える。再生時はデコード後の末尾5msも補正する。アタックは最大8秒、定常部分の生成位置は最大30秒、単発音の自然減衰は最大12秒。SF2の長いエンベロープや複数ベロシティ層を完全再現するものではない。
- MML再生では弦・管・オルガン・合唱・持続型シンセなどを音価までループし、離鍵・ペダル解除後にフェードアウトする。既存CC0のチェロ・コントラバス・トランペットにも40msで継いだループを追加する。音色ごとのループ位置は `soundsets.json` に記録する。減衰型の楽器・打楽器はループしない。ピアノの離鍵後のフェードは0.5秒、それ以外の音価で離す音源は0.2秒とする。木琴・マリンバなどの自然減衰は維持する。
- 録音オルゴールは既存のOGGを維持する。他は配信用OGGから再圧縮せず、元WAV・FLAC・SF2から生成する。全音源の再生成は `prepare-vsco.mjs` → `prepare-musescore.mjs` → `prepare-string-sections.mjs` → `build-catalog.mjs` の順に行う。GM音色の対象ノートは各プロフィールと音源定義に記録し、途中で音高を折り返さない。

- スクエアリード（GM80）は従来のピーク基準から−3dBで生成する。`prepare-musescore.mjs --only=80` で再生成しても、この調整を維持する。

## 弦楽器の合奏音源（GM40〜43）

- ヴァイオリン・ヴィオラ・チェロは、上記固定版VSCO 2 CEの `Strings/Violin Section`・`Viola Section`・`Cello Section` の合奏録音と公式SFZを使う。CC0。録音範囲はそれぞれG3〜D6、C3〜D6、C2〜F5。元の対応音域を維持するため、範囲外は従来のMITのMuseScore General（GM40・41）またはCC0のKaroryferチェロ（GM42）を3声へ加工する。
- コントラバスはCC0のVSCO独奏録音（通常音とビブラート）を3声へ加工する。加工分は約−4／0／＋4セント、0／8／17ms、軽い左右位置の差を付ける。実際に複数人で録音した音源とは区別する。
- `node prepare-string-sections.mjs` で既存GM40〜43のファイルを置換する。音源ID・GM番号・音域・音源数は維持する。従来音源の持続部の音量に合わせ、ヴァイオリンだけ＋3dBとする。ヴァイオリンの合奏録音は先頭80msを詰め、5msでフェードインし、ループ位置も80ms前へ移す。適用済みの増幅量は `bakedGainDb` に記録し、再生成時の重複増幅を防ぐ。ピークを抑え、40msでループを継ぎ、離鍵後0.2秒で減衰する。録音のGit blobハッシュ、補完用SF2のSHA-256を照合する。CC0由来の加工音はCC0、MuseScore General由来の補完音はMITとし、既存の著作権表示とライセンス本文を保持する。

## FluidR3原版のイングリッシュホルン（MIT）

- GM69はFrank Wenの[FluidR3 3.1原版](https://deb.debian.org/debian/pool/main/f/fluid-soundfont/fluid-soundfont_3.1.orig.tar.gz)のステレオ音源を使用する。[作者のREADME・謝辞とMIT本文](./dist/vendor/LICENSE-fluidr3.md)を同梱する。旧ID・パス `musescore-gm069` とGM番号を維持し、他の音色は置換しない。
- `node prepare-musescore.mjs --only=69` で元SF2が対応するA0〜C♯6の65音を生成する。アーカイブのSHA-256は `2621acaa1c78e4abdb24bdd163230cc577e61276936d6aa6e3180582142f0343`、SF2は `74594e8f4250680adf590507a306655a299935343583256f3b722c48a1bc1cb0`。既存と同じピーク正規化・持続ループ・48kHz/Ogg Opus 128kbps（VBR）、離鍵後0.2秒で再生する。試聴用の冒頭＋6dB補正は適用しない。

## GM音色の音量補正

- Windowsの[Microsoft Software Synthesizer](https://learn.microsoft.com/en-us/windows-hardware/drivers/audio/synthesizers-and-wave-sinks)と `gm.dls` を測定の基準に使う。Windowsの音源は配布しない。
- 128音色・打楽器を44.1kHz、CC7=100、CC11=127、パン中央、エフェクトなしで比較する。ベロシティ64・90・127を確認し、補正値は90の2秒発音中の400ms区間のK特性エネルギーの最大値から求める。C3・C4・C5（音域外は最寄りの対応音）の中央値を使い、ピアノを基準にする。
- `soundsets.json` の `gainDb` をデコード後に一度適用する。補正は0.5dB刻み・最大±6dB、スクエアリードは追加増幅しない。配信用OGGは再圧縮せず、曲のベロシティ・制御値・音の立ち上がり・余韻は維持する。音源の再生成でも補正値を保持し、録音を差し替えた場合は再測定する。

## 同梱ライブラリ

第三者のライブラリとライセンス文書は、元の条件を保持して同梱しています。

| ライブラリ | ライセンスと文書 |
| --- | --- |
| VexFlow 4.2.5（簡易五線譜の描画） | MIT — [LICENSE-vexflow.txt](./dist/vendor/LICENSE-vexflow.txt)。公式npm配布物のBravura同梱版を使用し、出力時のみ読み込む。Bravura音楽フォントはSIL OFL 1.1 — [LICENSE-bravura.txt](./dist/vendor/LICENSE-bravura.txt)。 |
| @tonejs/midi | MIT — [LICENSE-midi.md](./dist/vendor/LICENSE-midi.md) |
| sakuramml 0.2.3（MML操作試作の変換器） | MIT — [LICENSE](./dist/vendor/sakura/LICENSE)。[公式ソースの固定版](https://github.com/kujirahand/sakuramml-rust/tree/bfefda9bca6b8ae6e9365be4525ce17e8f889a99)を `cargo build --release --target wasm32-unknown-unknown --lib`、wasm-bindgen 0.2.130の `--target web` でビルド。改変：`src/runner/meta.rs` の `exec_meta_text` で127バイトへの切り詰めを除去し、`exec_args(...)[0].to_s()` をそのまま書き込む。長い日本語のパート名を保持する。ソース内の実行時バージョン表記は0.2.2。 |
| midi-file 1.2.4 | MIT — [LICENSE-midi-file.md](./dist/vendor/LICENSE-midi-file.md)。MML版では同梱の解析器を使用し、CommonJSのexportのみES moduleへ変更。 |
| array-flatten | MIT — [LICENSE-array-flatten.txt](./dist/vendor/LICENSE-array-flatten.txt) |
| lamejs 1.2.1（LAMEのJavaScript移植） | LGPL-3.0 — [ライセンス案内とソース配布物](./dist/vendor/LICENSE-lamejs.md)、[LGPL本文](./dist/vendor/LICENSE-LGPL-3.0.txt)、[GPL本文](./dist/vendor/LICENSE-GPL-3.0.txt) |
| wasm-media-encoders 0.7.0・libogg・libvorbis（OGG Vorbis変換）と補助コード | [ライセンス案内](./dist/vendor/LICENSE-vorbis.md)、[MIT本文](./dist/vendor/LICENSE-wasm-media-encoders.txt)、BSDの[libogg](./dist/vendor/LICENSE-libogg.txt)・[libvorbis](./dist/vendor/LICENSE-libvorbis.txt)、[補助コードの原文](./dist/vendor/LICENSE-vorbis-runtime.txt) |

作者のホームページ：[markn2000.com](https://markn2000.com/)。
