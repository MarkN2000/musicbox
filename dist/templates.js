import {noteNumber, serialize, keyOf} from './core.js';

// 各組は音名（和音はカンマ区切り）と16分音符単位の長さ。空文字は休符。出典はSPEC.mdに記載。
// 伴奏はこのサイト用の編曲。半小節の分散和音と、3拍子の低音・和音を組み合わせる。
const cArpeggio = [['C4,E4',2],['G4',2],['E4',2],['G4',2]];
const gArpeggio = [['G3,D4',2],['G4',2],['B4',2],['D4',2]];
const fArpeggio = [['F3,C4',2],['A4',2],['F4',2],['A4',2]];
const dmArpeggio = [['D4,F4',2],['A4',2],['F4',2],['A4',2]];
const cWaltz = [['C4',4],['E4,G4',4],['E4',2],['G4',2]];
const fWaltz = [['F3',4],['C4,A4',4],['F4',2],['A4',2]];
const gWaltz = [['G3',4],['D4,B4',4],['D4',2],['G4',2]];
const joyOpening = [
  ['E5',4],['E5',4],['F5',4],['G5',4], ['G5',4],['F5',4],['E5',4],['D5',4],
  ['C5',4],['C5',4],['D5',4],['E5',4], ['E5',6],['D5',2],['D5',8],
];
const joyEnding = [
  ['E5',4],['E5',4],['F5',4],['G5',4], ['G5',4],['F5',4],['E5',4],['D5',4],
  ['C5',4],['C5',4],['D5',4],['E5',4], ['D5',6],['C5',2],['C5',8],
];
const twinkleOpening = [
  ['C5',4],['C5',4],['G5',4],['G5',4],['A5',4],['A5',4],['G5',8],
  ['F5',4],['F5',4],['E5',4],['E5',4],['D5',4],['D5',4],['C5',8],
];
const twinkleMiddle = [['G5',4],['G5',4],['F5',4],['F5',4],['E5',4],['E5',4],['D5',8]];
const minuetOpening = [
  ['G5',4],['C5',2],['D5',2],['E5',2],['F5',2], ['G5',4],['C5',4],['C5',4],
  ['A5',4],['F5',2],['G5',2],['A5',2],['B5',2], ['C6',4],['C5',4],['C5',4],
  ['F5',4],['G5',2],['F5',2],['E5',2],['D5',2], ['E5',4],['F5',2],['E5',2],['D5',2],['C5',2],
];
export const TEMPLATES = [
  {
    id:'ode-to-joy',title:'歓喜の歌',composer:'ベートーヴェン',bpm:112,beatsPerBar:4,pickupBeats:0,
    detail:'ハ長調 · 主題16小節 · 和音と分散和音のオルゴール編曲',
    source:'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528',
    melody:[...joyOpening,...joyEnding,
      ['D5',4],['D5',4],['E5',4],['C5',4], ['D5',4],['E5',2],['F5',2],['E5',4],['C5',4],
      ['D5',4],['E5',2],['F5',2],['E5',4],['D5',4], ['C5',4],['D5',4],['G4',8],
      ...joyEnding],
    accompaniment:[
      ...cArpeggio,...cArpeggio, ...gArpeggio,...cArpeggio, ...cArpeggio,...cArpeggio, ...cArpeggio,...gArpeggio,
      ...cArpeggio,...cArpeggio, ...gArpeggio,...cArpeggio, ...cArpeggio,...cArpeggio, ...gArpeggio,...cArpeggio,
      ...dmArpeggio,...cArpeggio, ...dmArpeggio,...cArpeggio, ...gArpeggio,...gArpeggio, ...cArpeggio,...gArpeggio,
      ...cArpeggio,...cArpeggio, ...gArpeggio,...cArpeggio, ...cArpeggio,...cArpeggio, ...gArpeggio,['C4,E4,G4',8],
    ],
  },
  {
    id:'fur-elise',title:'エリーゼのために',composer:'ベートーヴェン',bpm:60,beatsPerBar:1.5,pickupBeats:.5,
    detail:'冒頭8小節＋弱起 · 1オクターブ上 · 分散和音のオルゴール編曲',
    source:'https://commons.wikimedia.org/wiki/File:IMSLP103834-PMLP14377-F%C3%BCr_Elise,_Beethoven-WoO.059,_1867.pdf',
    melody:[
      ['E6',1],['D#6',1],
      ['E6',1],['D#6',1],['E6',1],['B5',1],['D6',1],['C6',1],
      ['A5',2],['',1],['C5',1],['E5',1],['A5',1],
      ['B5',2],['',1],['E5',1],['G#5',1],['B5',1],
      ['C6',2],['',1],['E5',1],['E6',1],['D#6',1],
      ['E6',1],['D#6',1],['E6',1],['B5',1],['D6',1],['C6',1],
      ['A5',2],['',1],['C5',1],['E5',1],['A5',1],
      ['B5',2],['',1],['E5',1],['C6',1],['B5',1],
      ['A5',4],['',2],
    ],
    accompaniment:[
      ['',8],
      ['A4,C5',1],['E4',1],['A4',1],['',3],
      ['E4,G#5',1],['B4',1],['E4',1],['',3],
      ['A4,C5',1],['E4',1],['A4',1],['',3],
      ['',6],
      ['A4,C5',1],['E4',1],['A4',1],['',3],
      ['E4,G#5',1],['B4',1],['D5',1],['',3],
      ['A4,C5,E5',6],
    ],
  },
  {
    id:'twinkle',title:'きらきら星変奏曲の主題',composer:'モーツァルト（原旋律：フランス民謡）',bpm:112,beatsPerBar:2,pickupBeats:0,
    detail:'ハ長調 · 主題24小節 · 和音と分散和音のオルゴール編曲',
    source:'https://imslp.org/wiki/12_Variations_on_%27Ah,_vous_dirai-je_maman%27,_K.265/300e_(Mozart,_Wolfgang_Amadeus)',
    melody:[...twinkleOpening,...twinkleMiddle,...twinkleMiddle,...twinkleOpening],
    accompaniment:[
      ...cArpeggio,...cArpeggio,...fArpeggio,...cArpeggio,...fArpeggio,...cArpeggio,...gArpeggio,...cArpeggio,
      ...cArpeggio,...fArpeggio,...cArpeggio,...gArpeggio, ...cArpeggio,...fArpeggio,...cArpeggio,...gArpeggio,
      ...cArpeggio,...cArpeggio,...fArpeggio,...cArpeggio,...fArpeggio,...cArpeggio,...gArpeggio,['C4,E4,G4',8],
    ],
  },
  {
    id:'minuet',title:'ト長調のメヌエット',composer:'ペツォールト',bpm:112,beatsPerBar:3,pickupBeats:0,
    detail:'ハ長調に移調 · 冒頭16小節 · 3拍子のオルゴール編曲',
    source:'https://commons.wikimedia.org/wiki/File:IMSLP532968-PMLP357193-Pezold-BWV114a.pdf',
    melody:[...minuetOpening,
      ['B4',4],['C5',2],['D5',2],['E5',2],['C5',2], ['D5',12],
      ...minuetOpening,
      ['D5',4],['E5',2],['D5',2],['C5',2],['B4',2], ['C5',12]],
    accompaniment:[
      ...cWaltz,...cWaltz,...fWaltz,...cWaltz,...fWaltz,...cWaltz,...gWaltz,...gWaltz,
      ...cWaltz,...cWaltz,...fWaltz,...cWaltz,...fWaltz,...cWaltz,...gWaltz,['C4,E4,G4',12],
    ],
  },
];

export function templateScore(template){
  let length=0;const unique=new Map();
  for(const part of [template.melody,template.accompaniment??[]]){
    let step=0;
    for(const [names,span] of part){
      if(!Number.isInteger(span)||span<1)throw new Error('テンプレートの音の長さが不正です。');
      if(names)for(const name of names.split(',')){const note={step,midi:noteNumber(name)};unique.set(keyOf(note),note);}
      step+=span;
    }
    length=Math.max(length,step);
  }
  const notes=[...unique.values()];
  serialize(notes,length);
  return {notes,length};
}
