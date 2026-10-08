# ピアノ88鍵版のタイミング点検（2026-10-08）

全90曲を対象に、収録範囲全体の発音位置を点検。44曲を修正、46曲は今回の照合では変更不要と判断した。収録範囲は保持し、50ms以下のステップや修正のための細分化は用いていない。

## 確認方法

- **XML（38曲）**：底本MusicXMLの通常音符・休符・タイ・反復・声部を読み、選択したMIDI声部と対応させて発音位置を再構成。トレモロや装飾のMIDI実現を長音の打ち直しとして採用しない。格子に収まらない内音は省略。
- **Lily（28曲）**：楽譜から生成されたMIDIの拍位置と通常音符の格子を照合。LilyPondの装飾・MIDI専用定義も調べ、アイネ・クライネの両ヴァイオリンのトリルを印刷側の主音へ戻した。
- **転記（24曲）**：既存の読譜配列の音価・小節長・弱起・反復を照合。春の歌、乙女の祈り、日本の歌唱譜、ジングルベル、きらきら星等の原譜画像も再読。マクドナルドは独立したCC0 MusicXML全16小節と照合。

全曲の音域・重複・step_ms > 50と、主要な拍位置・タイ・省略箇所を `node check.mjs` で検査した。全曲の原譜画像を全声部逐音照合したという意味ではなく、縮約・独自伴奏・終止は残る。**実音の試聴は未実施**のため、聴感上の完成を保証するものではない。底本の版・出典・収録範囲は [TEMPLATE_SOURCES.md](TEMPLATE_SOURCES.md) を参照。

## 固定ステップでの速度近似

可変テンポの4曲は、音ごとの演奏時刻の丸めを廃止し、区間内の四分音符を一定の整数ステップにした。細かな音を省いて次の拍を動かさず、範囲と速度区間の順序を保持する。

| 曲 | ステップ | 区間の四分音符（ステップ数） | 長さ |
| --- | ---: | --- | ---: |
| ハンガリー舞曲第5番 | 114ms | 4 / 8（約132 / 66 BPM） | 135.204秒 |
| チャルダッシュ | 100ms | 4 / 6 / 8 / 10（150 / 100 / 75 / 60 BPM） | 223秒 |
| カンカン | 94ms | 4 / 5 / 9（約160 / 128 / 71 BPM） | 133.574秒 |
| 人形の夢と目覚め | 127ms | 子守歌3 / 夢6 / 踊り4（約157 / 79 / 118 BPM） | 168.148秒 |

「人形の夢と目覚め」は原譜の144 / 88 / 112 BPMに対して約+9％ / −11％ / +5％の速度近似。等しい音価の長短交替を避け、ステップを細かくしないための編曲上の近似である。

## 曲別結果

「保持」は今回の確認範囲で変更不要だった曲。「XML」「Lily」「転記」は上記の確認方法を示す。

| 曲 | 方法 | 結果 | 間隔 | 主な確認・修正 |
| --- | --- | --- | ---: | --- |
| [G線上のアリア](dist/samples/air-on-g-piano-88.txt) | XML | 修正 | 125ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [haru-no-ogawa](dist/samples/haru-no-ogawa-piano-88.txt) | 転記 | 保持 | 144ms | 通常音の拍位置・休符・反復を保持。 |
| [momiji](dist/samples/momiji-piano-88.txt) | 転記 | 保持 | 82ms | 通常音の拍位置・休符・反復を保持。 |
| [oborozukiyo](dist/samples/oborozukiyo-piano-88.txt) | 転記 | 保持 | 104ms | 通常音の拍位置・休符・反復を保持。 |
| [sakura-sakura](dist/samples/sakura-sakura-piano-88.txt) | 転記 | 保持 | 139ms | 通常音の拍位置・休符・反復を保持。 |
| [shojoji](dist/samples/shojoji-piano-88.txt) | 転記 | 保持 | 94ms | 通常音の拍位置・休符・反復を保持。 |
| [toryanse](dist/samples/toryanse-piano-88.txt) | 転記 | 修正 | 94ms | 第5・7小節のタイの打ち直し2音を除去。 |
| [yokohama-shika](dist/samples/yokohama-shika-piano-88.txt) | 転記 | 保持 | 78ms | 通常音の拍位置・休符・反復を保持。 |
| [yuki-no-shingun](dist/samples/yuki-no-shingun-piano-88.txt) | 転記 | 保持 | 125ms | 通常音の拍位置・休符・反復を保持。 |
| [アイネ・クライネ・ナハトムジークより「第1楽章」](dist/samples/eine-kleine-piano-88.txt) | Lily | 修正 | 104ms | 印刷譜と異なるMIDIのトリル71群を主音に戻す。 |
| [アヴェ・マリア D.839](dist/samples/schubert-ave-maria-piano-88.txt) | Lily | 修正 | 104ms | 格子の間にある装飾・細かな音を省略。 |
| [アマリリス](dist/samples/amaryllis-piano-88.txt) | Lily | 保持 | 104ms | 通常音の拍位置・休符・反復を保持。 |
| [アメイジング・グレイス](dist/samples/amazing-grace-piano-88.txt) | Lily | 保持 | 82ms | 通常音の拍位置・休符・反復を保持。 |
| [アメリカ野砲隊](dist/samples/us-field-artillery-piano-88.txt) | 転記 | 保持 | 69ms | 通常音の拍位置・休符・反復を保持。 |
| [アラベスク Op.100-2](dist/samples/burgmuller-arabesque-piano-88.txt) | Lily | 保持 | 139ms | 通常音の拍位置・休符・反復を保持。 |
| [ウィリアム・テル序曲](dist/samples/william-tell-piano-88.txt) | XML | 修正 | 99ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [エリーゼのために](dist/samples/fur-elise-piano-88.txt) | Lily | 修正 | 104ms | 格子の間にある装飾・細かな音を省略。 |
| [おもちゃの兵隊のマーチ](dist/samples/toy-soldiers-piano-88.txt) | 転記 | 保持 | 128ms | 確認済みの簡易譜編曲・全体+12半音を保持。 |
| [カノン](dist/samples/pachelbel-canon-piano-88.txt) | XML | 保持 | 125ms | 通常音の拍位置・休符・反復を保持。 |
| [カルメンより「第1幕への前奏曲」](dist/samples/carmen-prelude-piano-88.txt) | XML | 修正 | 57ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [きよしこの夜](dist/samples/silent-night-piano-88.txt) | Lily | 保持 | 100ms | 通常音の拍位置・休符・反復を保持。 |
| [きらきら星変奏曲](dist/samples/twinkle-piano-88.txt) | 転記 | 修正 | 75ms | 第3変奏の三連符を拍上の音へ整理。 |
| [クシコス・ポスト](dist/samples/csikos-post-piano-88.txt) | 転記 | 修正 | 125ms | 三連符の内音6音を省略。 |
| [グリーンスリーブス](dist/samples/greensleeves-piano-88.txt) | Lily | 保持 | 94ms | 通常音の拍位置・休符・反復を保持。 |
| [くるみ割り人形より「花のワルツ」](dist/samples/waltz-of-flowers-piano-88.txt) | XML | 修正 | 83ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [くるみ割り人形より「金平糖の精の踊り」](dist/samples/sugar-plum-fairy-piano-88.txt) | XML | 修正 | 144ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [くるみ割り人形より「行進曲」](dist/samples/nutcracker-march-piano-88.txt) | XML | 修正 | 110ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [サッキヤルヴェン・ポルカ](dist/samples/sakkijarven-polkka-piano-88.txt) | XML | 保持 | 83ms | 通常音の拍位置・休符・反復を保持。 |
| [ジ・エンターテイナー](dist/samples/the-entertainer-piano-88.txt) | Lily | 保持 | 104ms | 通常音の拍位置・休符・反復を保持。 |
| [ジムノペディ第1番](dist/samples/gymnopedie-1-piano-88.txt) | Lily | 保持 | 117ms | 通常音の拍位置・休符・反復を保持。 |
| [ジョニーが凱旋するとき](dist/samples/when-johnny-piano-88.txt) | XML | 保持 | 125ms | 通常音の拍位置・休符・反復を保持。 |
| [ジングルベル](dist/samples/jingle-bells-piano-88.txt) | 転記 | 保持 | 64ms | 通常音の拍位置・休符・反復を保持。 |
| [ソビエト国歌](dist/samples/soviet-anthem-piano-88.txt) | XML | 修正 | 99ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [チャルダッシュ](dist/samples/czardas-piano-88.txt) | XML | 修正 | 100ms | 速度区間ごとの拍長を統一。細かな音を省略。 |
| [トッカータとフーガ BWV.565](dist/samples/bach-toccata-fugue-piano-88.txt) | Lily | 修正 | 125ms | 格子の間にある装飾・細かな音を省略。 |
| [トルコ行進曲](dist/samples/mozart-turkish-march-piano-88.txt) | Lily | 修正 | 134ms | 格子の間にある装飾・細かな音を省略。 |
| [ノクターン第2番 Op.9-2](dist/samples/chopin-nocturne-2-piano-88.txt) | XML | 修正 | 114ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [ハレルヤ](dist/samples/handel-hallelujah-piano-88.txt) | Lily | 保持 | 125ms | 通常音の拍位置・休符・反復を保持。 |
| [ハンガリー舞曲第5番](dist/samples/brahms-hungarian-dance-5-piano-88.txt) | XML | 修正 | 114ms | 速度区間ごとの拍長を統一。 |
| [ピアノ協奏曲イ短調 Op.54 第1楽章](dist/samples/schumann-piano-concerto-first-piano-88.txt) | 転記 | 修正 | 55ms | 五連符を休符と上行3音の等しい16分音符へ整理。 |
| [ファランドール](dist/samples/bizet-farandole-piano-88.txt) | 転記 | 保持 | 125ms | 通常音の拍位置・休符・反復を保持。 |
| [フィガロの結婚より「序曲」](dist/samples/mozart-figaro-overture-piano-88.txt) | XML | 修正 | 75ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [フニクリ・フニクラ](dist/samples/funiculi-funicula-piano-88.txt) | XML | 保持 | 71ms | 通常音の拍位置・休符・反復を保持。 |
| [プレリュード第7番 Op.28-7](dist/samples/chopin-prelude-7-piano-88.txt) | Lily | 保持 | 115ms | 通常音の拍位置・休符・反復を保持。 |
| [プロムナード](dist/samples/mussorgsky-promenade-piano-88.txt) | XML | 保持 | 83ms | 通常音の拍位置・休符・反復を保持。 |
| [ボギー大佐](dist/samples/colonel-bogey-piano-88.txt) | 転記 | 保持 | 69ms | 既存の原譜による縮約・反復・終止を保持。 |
| [ボレロ](dist/samples/ravel-bolero-piano-88.txt) | XML | 保持 | 69ms | 通常音の拍位置・休符・反復を保持。 |
| [メヌエット](dist/samples/minuet-piano-88.txt) | Lily | 修正 | 107ms | 格子の間にある装飾・細かな音を省略。 |
| [モルダウ](dist/samples/smetana-moldau-piano-88.txt) | XML | 保持 | 82ms | 通常音の拍位置・休符・反復を保持。 |
| [ラデツキー行進曲](dist/samples/radetzky-march-piano-88.txt) | XML | 修正 | 83ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [リパブリック讃歌](dist/samples/battle-hymn-piano-88.txt) | XML | 保持 | 115ms | 通常音の拍位置・休符・反復を保持。 |
| [ワシントン・ポスト](dist/samples/sousa-washington-post-piano-88.txt) | XML | 修正 | 83ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [ワルキューレの騎行](dist/samples/wagner-ride-of-valkyries-piano-88.txt) | XML | 修正 | 72ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [愛の挨拶](dist/samples/salut-damour-piano-88.txt) | XML | 保持 | 104ms | 通常音の拍位置・休符・反復を保持。 |
| [威風堂々 第1番](dist/samples/pomp-and-circumstance-piano-88.txt) | XML | 修正 | 156ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [運命](dist/samples/beethoven-fate-piano-88.txt) | Lily | 保持 | 78ms | 通常音の拍位置・休符・反復を保持。 |
| [乙女の祈り](dist/samples/maidens-prayer-piano-88.txt) | 転記 | 修正 | 125ms | 60小節を旧譜の音価から再配置。前打音・トリル・ロールの演奏時刻を整理。 |
| [歓喜の歌](dist/samples/ode-to-joy-piano-88.txt) | Lily | 保持 | 75ms | 通常音の拍位置・休符・反復を保持。 |
| [玉葱の歌](dist/samples/chanson-oignon-piano-88.txt) | XML | 保持 | 83ms | 通常音の拍位置・休符・反復を保持。 |
| [軍隊行進曲 第1番](dist/samples/military-march-piano-88.txt) | Lily | 修正 | 125ms | 格子の間にある装飾・細かな音を省略。 |
| [蛍の光](dist/samples/auld-lang-syne-piano-88.txt) | Lily | 保持 | 104ms | 通常音の拍位置・休符・反復を保持。 |
| [結婚行進曲](dist/samples/mendelssohn-wedding-march-piano-88.txt) | XML | 修正 | 67ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [月の光](dist/samples/clair-de-lune-piano-88.txt) | Lily | 修正 | 125ms | 格子の間にある装飾・細かな音を省略。 |
| [見よ、勇者は帰る](dist/samples/handel-see-conquering-hero-piano-88.txt) | XML | 修正 | 134ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [婚礼の合唱](dist/samples/wagner-bridal-chorus-piano-88.txt) | XML | 修正 | 89ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [山の魔王の宮殿にて](dist/samples/hall-of-mountain-king-piano-88.txt) | Lily | 修正 | 109ms | 格子の間にある装飾・細かな音を省略。 |
| [四季より「春」第1楽章](dist/samples/vivaldi-spring-piano-88.txt) | XML | 修正 | 107ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [四季より「冬」第1楽章](dist/samples/vivaldi-winter-first-piano-88.txt) | 転記 | 保持 | 94ms | 通常音の拍位置・休符・反復を保持。 |
| [子守歌 Op.49-4](dist/samples/brahms-lullaby-piano-88.txt) | Lily | 修正 | 125ms | 格子の間にある装飾・細かな音を省略。 |
| [主よ、人の望みの喜びよ](dist/samples/jesu-joy-piano-88.txt) | XML | 修正 | 133ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [春の歌](dist/samples/mendelssohn-spring-song-piano-88.txt) | 転記 | 修正 | 112ms | 通常音の拍位置を復元、余分な装飾17音を整理。 |
| [小フーガ](dist/samples/little-fugue-piano-88.txt) | XML | 修正 | 87ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [小犬のワルツ](dist/samples/minute-waltz-piano-88.txt) | Lily | 修正 | 107ms | 格子の間にある装飾・細かな音を省略。 |
| [埴生の宿](dist/samples/home-sweet-home-piano-88.txt) | Lily | 保持 | 83ms | 通常音の拍位置・休符・反復を保持。 |
| [新世界より「第2楽章」](dist/samples/new-world-largo-piano-88.txt) | XML | 保持 | 144ms | 通常音の拍位置・休符・反復を保持。 |
| [新世界より「第4楽章」](dist/samples/new-world-fourth-piano-88.txt) | XML | 修正 | 99ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [人形の夢と目覚め](dist/samples/dolls-dream-piano-88.txt) | 転記 | 修正 | 127ms | 3つの速度区間の拍長を一定にし、16分音符の間隔を統一。 |
| [星条旗よ永遠なれ](dist/samples/stars-and-stripes-piano-88.txt) | Lily | 修正 | 63ms | 格子の間にある装飾・細かな音を省略。 |
| [大きな古時計](dist/samples/grandfathers-clock-piano-88.txt) | XML | 保持 | 69ms | 通常音の拍位置・休符・反復を保持。 |
| [朝](dist/samples/grieg-morning-piano-88.txt) | Lily | 保持 | 83ms | 通常音の拍位置・休符・反復を保持。 |
| [天国と地獄より「序曲」](dist/samples/offenbach-can-can-piano-88.txt) | XML | 修正 | 94ms | 速度区間ごとの拍長を統一。 |
| [怒りの日](dist/samples/mozart-dies-irae-piano-88.txt) | Lily | 保持 | 83ms | 通常音の拍位置・休符・反復を保持。 |
| [猫踏んじゃった](dist/samples/neko-funjatta-piano-88.txt) | 転記 | 保持 | 125ms | 通常音の拍位置・休符・反復を保持。 |
| [白鳥の湖より「情景」](dist/samples/swan-lake-scene-piano-88.txt) | XML | 修正 | 82ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [美しく青きドナウ](dist/samples/blue-danube-piano-88.txt) | XML | 保持 | 109ms | 通常音の拍位置・休符・反復を保持。 |
| [愉快な牧場](dist/samples/old-macdonald-piano-88.txt) | 転記 | 保持 | 114ms | 通常音の拍位置・休符・反復を保持。 |
| [勇敢なるスコットランド](dist/samples/scotland-the-brave-piano-88.txt) | 転記 | 保持 | 125ms | 通常音の拍位置・休符・反復を保持。 |
| [陸軍は進んで行く](dist/samples/army-goes-rolling-along-piano-88.txt) | 転記 | 保持 | 69ms | 通常音の拍位置・休符・反復を保持。 |
| [惑星より「火星」](dist/samples/mars-piano-88.txt) | XML | 修正 | 69ms | 記譜された通常音の位置・タイへ戻し、装飾の打ち直し・丸めを整理。 |
| [惑星より「木星」](dist/samples/jupiter-piano-88.txt) | Lily | 保持 | 100ms | 通常音の拍位置・休符・反復を保持。 |
