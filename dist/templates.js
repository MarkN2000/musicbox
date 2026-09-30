import {noteNumber, serialize} from './core.js';

// 各組は音名と16分音符単位の長さ。空文字は休符。出典はSPEC.mdに記載。
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
    detail:'ハ長調 · 主題16小節 · メロディ版',
    source:'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528',
    melody:[...joyOpening,...joyEnding,
      ['D5',4],['D5',4],['E5',4],['C5',4], ['D5',4],['E5',2],['F5',2],['E5',4],['C5',4],
      ['D5',4],['E5',2],['F5',2],['E5',4],['D5',4], ['C5',4],['D5',4],['G4',8],
      ...joyEnding],
  },
  {
    id:'fur-elise',title:'エリーゼのために',composer:'ベートーヴェン',bpm:60,beatsPerBar:1.5,pickupBeats:.5,
    detail:'冒頭8小節＋弱起 · 1オクターブ上 · メロディ版',
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
  },
  {
    id:'twinkle',title:'きらきら星変奏曲の主題',composer:'モーツァルト（原旋律：フランス民謡）',bpm:112,beatsPerBar:2,pickupBeats:0,
    detail:'ハ長調 · 主題24小節 · メロディ版',
    source:'https://imslp.org/wiki/12_Variations_on_%27Ah,_vous_dirai-je_maman%27,_K.265/300e_(Mozart,_Wolfgang_Amadeus)',
    melody:[...twinkleOpening,...twinkleMiddle,...twinkleMiddle,...twinkleOpening],
  },
  {
    id:'minuet',title:'ト長調のメヌエット',composer:'ペツォールト',bpm:112,beatsPerBar:3,pickupBeats:0,
    detail:'ハ長調に移調 · 冒頭16小節 · メロディ版',
    source:'https://commons.wikimedia.org/wiki/File:IMSLP532968-PMLP357193-Pezold-BWV114a.pdf',
    melody:[...minuetOpening,
      ['B4',4],['C5',2],['D5',2],['E5',2],['C5',2], ['D5',12],
      ...minuetOpening,
      ['D5',4],['E5',2],['D5',2],['C5',2],['B4',2], ['C5',12]],
  },
];

export function templateScore(template){
  let length=0;const notes=[];
  for(const [name,span] of template.melody){
    if(!Number.isInteger(span)||span<1)throw new Error('テンプレートの音の長さが不正です。');
    if(name)notes.push({step:length,midi:noteNumber(name)});
    length+=span;
  }
  serialize(notes,length);
  return {notes,length};
}
