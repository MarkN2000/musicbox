import {MAX_NOTES} from './core.js';

export const PPQ=960;
export const MAX_TICKS=PPQ*4096;
export function demoScore(){
  const notes=[],add=(part,midi,beat,duration,velocity=90)=>notes.push({id:notes.length+1,part,midi,tick:Math.round(beat*PPQ),duration:Math.round(duration*PPQ),velocity});
  add(1,72,0,3,100);add(1,76,3,1);add(1,74,4,1.5);add(1,72,5.5,.5);add(1,71,6,2);
  [72,74,76,77,76,74].forEach((midi,i)=>add(1,midi,8+i/3,1/3));add(1,72,10,2);
  [76,74,72,71].forEach((midi,i)=>add(1,midi,12+i/4,.25));add(1,72,13,3);
  for(let b=0;b<16;b++)add(2,[48,55,60,55][b%4],b,.75,65);
  return {title:'長音・三連符・テンポ変更',ppq:PPQ,end:PPQ*20,signatures:[{tick:0,signature:[4,4]}],parts:[{id:1,name:'旋律'},{id:2,name:'伴奏'}],tempos:[{tick:0,bpm:120},{tick:PPQ*8,bpm:90}],notes};
}
export function validateScore(score){
  if(!Number.isInteger(score.ppq)||score.ppq<24||score.ppq>32767||!Number.isSafeInteger(score.end)||score.end<1||score.end>score.ppq*4096)throw Error('曲の長さ・時間分解能が範囲外です。');
  if(!Array.isArray(score.notes)||score.notes.length>MAX_NOTES)throw Error('音符は100,000音以内にしてください。');
  if(!score.parts.length||score.parts.length>64||new Set(score.parts.map(p=>p.id)).size!==score.parts.length)throw Error('パート数が範囲外です。');
  let previous=-1;
  for(const {tick,signature} of score.signatures){
    if(!Number.isInteger(tick)||tick<=previous||tick>=score.end)throw Error('拍子の変更点は重複しない曲内の位置にしてください。');
    if(!Number.isInteger(signature[0])||signature[0]<1||signature[0]>32||![1,2,4,8,16,32].includes(signature[1]))throw Error('拍子は分子1〜32、分母1・2・4・8・16・32で指定してください。');
    previous=tick;
  }
  if(score.signatures[0]?.tick!==0)throw Error('曲頭の拍子が必要です。');
  previous=-1;
  for(const tempo of score.tempos){if(!Number.isInteger(tempo.tick)||tempo.tick<=previous||tempo.tick>=score.end||!Number.isFinite(tempo.bpm)||tempo.bpm<20||tempo.bpm>400)throw Error('テンポは20〜400 BPM、位置は重複しない曲内の位置にしてください。');previous=tempo.tick;}
  if(score.tempos[0]?.tick!==0)throw Error('曲頭のテンポが必要です。');
  const ids=new Set();
  for(const n of score.notes){
    if(ids.has(n.id)||!score.parts.some(p=>p.id===n.part)||!Number.isInteger(n.midi)||n.midi<0||n.midi>127||!Number.isInteger(n.tick)||n.tick<0||!Number.isInteger(n.duration)||n.duration<1||n.tick+n.duration>score.end||!Number.isInteger(n.velocity)||n.velocity<1||n.velocity>127)throw Error('音符の位置・長さ・音高・強さが不正です。');
    ids.add(n.id);
  }
  return score;
}
export function scorePosition(score,tick){
  let bar=1;
  for(let i=0;i<score.signatures.length;i++){
    const s=score.signatures[i],next=score.signatures[i+1]?.tick??Infinity,beatTicks=score.ppq*4/s.signature[1],barTicks=beatTicks*s.signature[0];
    if(tick<next){const completed=Math.floor((tick-s.tick)/barTicks);return {bar:bar+completed,beat:(tick-s.tick-completed*barTicks)/beatTicks+1,barStart:s.tick+completed*barTicks,signature:s.signature};}
    // 小節途中の変更は不完全小節を残し、次のマーカーから新しい小節にする。
    bar+=Math.ceil((next-s.tick)/barTicks);
  }
}
export function secondsAt(score,tick){
  let seconds=0;
  for(let i=0;i<score.tempos.length;i++){
    const t=score.tempos[i],end=Math.min(tick,score.tempos[i+1]?.tick??tick);
    if(end>t.tick)seconds+=(end-t.tick)/score.ppq*60/t.bpm;
    if(end===tick)break;
  }
  return seconds;
}
export function tickAt(score,seconds){
  let elapsed=0;
  for(let i=0;i<score.tempos.length;i++){
    const t=score.tempos[i],next=score.tempos[i+1]?.tick??Infinity,span=(next-t.tick)/score.ppq*60/t.bpm;
    if(seconds<=elapsed+span)return t.tick+(seconds-elapsed)*score.ppq*t.bpm/60;
    elapsed+=span;
  }
}
export function moveNotes(notes,ids,deltaTick,deltaMidi,end){
  const chosen=notes.filter(n=>ids.has(n.id));if(!chosen.length)return notes;
  deltaTick=Math.max(-Math.min(...chosen.map(n=>n.tick)),Math.min(deltaTick,end-Math.max(...chosen.map(n=>n.tick+n.duration))));
  deltaMidi=Math.max(-Math.min(...chosen.map(n=>n.midi)),Math.min(deltaMidi,127-Math.max(...chosen.map(n=>n.midi))));
  return notes.map(n=>ids.has(n.id)?{...n,tick:n.tick+deltaTick,midi:n.midi+deltaMidi}:n);
}
export function resizeNotes(notes,ids,delta,end){
  const chosen=notes.filter(n=>ids.has(n.id));if(!chosen.length)return notes;
  delta=Math.max(1-Math.min(...chosen.map(n=>n.duration)),Math.min(delta,end-Math.max(...chosen.map(n=>n.tick+n.duration))));
  return notes.map(n=>ids.has(n.id)?{...n,duration:n.duration+delta}:n);
}
export function serializeMml(score){
  validateScore(score);
  const lines=[`// Musicbox title: ${encodeURIComponent(score.title)}`,`TimeBase(${score.ppq})`,`TR=1`];
  for(const s of score.signatures)lines.push(`Time(${s.tick}) TimeSignature(${s.signature.join(',')})`);
  for(const t of score.tempos)lines.push(`Time(${t.tick}) Tempo={${t.bpm}}`);
  lines.push(`Time(${score.end}) MetaText={Musicbox end}`);
  let track=1;
  for(const part of score.parts){
    const voices=[];
    for(const n of score.notes.filter(n=>n.part===part.id).sort((a,b)=>a.tick-b.tick||a.midi-b.midi)){
      let voice=voices.find(v=>(v.ends.get(n.midi)??0)<=n.tick);
      if(!voice){voice={ends:new Map(),notes:[]};voices.push(voice);}
      voice.notes.push(n);voice.ends.set(n.midi,n.tick+n.duration);
    }
    if(!voices.length)voices.push({notes:[]});
    for(const voice of voices){
      lines.push('',`TR=${++track}`,`TrackName={Musicbox:${part.id}:${encodeURIComponent(part.name)}}`,'q100');
      for(const n of voice.notes)lines.push(`Time(${n.tick}) n${n.midi},%${n.duration},100,${n.velocity}`);
      lines.push(`Time(${score.end}) MetaText={Musicbox end}`);
    }
  }
  return lines.join('\n')+'\n';
}

// ponytail: 試作の入力は基本MMLに限定する。構造的なマクロ・任意プログラムは構文木を保持する版で扱う。
export function prepareMml(source){
  if(source.length>200000)throw Error('MMLは200,000文字以内にしてください。');
  let clean='',i=0;
  while(i<source.length){
    if(source.startsWith('//',i)){const end=source.indexOf('\n',i);if(end<0)break;clean+='\n';i=end+1;}
    else if(source.startsWith('/*',i)){const end=source.indexOf('*/',i+2);if(end<0)throw Error('コメントが閉じられていません。');clean+='\n'.repeat(source.slice(i,end+2).split('\n').length-1)+' ';i=end+2;}
    else clean+=source[i++];
  }
  const named=/[A-Za-z_][A-Za-z_0-9]*/g;
  // 文字列の中を命令として検査しない。基本音名の連続は許可する。
  const forCheck=clean.replace(/(?:TrackName|MetaText)\s*=\s*\{[^{}]*\}/g,'');
  for(const match of forCheck.matchAll(named)){
    if(/^(?:[cdefgabrlovqn]\d*)+$/i.test(match[0])||['TimeBase','TR','Track','Time','Tempo','TimeSignature'].includes(match[0]))continue;
    const line=forCheck.slice(0,match.index).split('\n').length;throw Error(`${line}行付近：この試作では ${match[0]} に対応していません。基本音符・和音・連符・タイ・TR・Time・Tempoを使用してください。`);
  }
  if(/[\[\]$&@]/.test(forCheck))throw Error('この試作では繰り返し・マクロ・スラー・音色指定に対応していません。');
  const marker=' MetaText={Musicbox boundary} ';
  clean=clean.replace(/(?:TrackName|MetaText)\s*=\s*\{[^{}]*\}|\b(?:TR|Track)\s*(?:=\s*\d+|\(\s*\d+\s*\))/g,s=>/^(?:TR|Track)\s*(?:=|\()/.test(s)?marker+s:s);
  return clean+'\n'+marker;
}
export function fromMidi(midi,source=''){
  const ppq=midi.header.ppq,parts=[],notes=[];
  let nextId=1,end=0;
  const title=source.match(/^\/\/ Musicbox title: (.*)$/m);
  const score={title:title?decodeURIComponent(title[1]):midi.name||'読み込んだ楽譜',ppq,end:0,parts,notes,signatures:[],tempos:[]};
  const signatureMap=new Map([[0,[4,4]]]);
  for(const s of midi.header.timeSignatures)signatureMap.set(s.ticks,s.timeSignature);
  score.signatures=[...signatureMap].map(([tick,signature])=>({tick,signature})).sort((a,b)=>a.tick-b.tick);
  const tempoMap=new Map([[0,120]]);
  for(const t of midi.header.tempos)tempoMap.set(t.ticks,t.bpm);
  score.tempos=[...tempoMap].map(([tick,bpm])=>({tick,bpm})).sort((a,b)=>a.tick-b.tick);
  for(const track of midi.tracks){
    if(track.pitchBends.length||Object.values(track.controlChanges).some(events=>events.length))throw Error('この試作ではペダル・コントローラー・ピッチベンドを含むMIDIには対応していません。');
    end=Math.max(end,track.endOfTrackTicks??0);
    const tag=track.name.match(/^Musicbox:(\d+):(.*)$/);
    if(!track.notes.length&&!tag)continue;
    const part=tag?Number(tag[1]):Math.max(0,...parts.map(p=>p.id))+1;
    if(!parts.some(p=>p.id===part))parts.push({id:part,name:tag?decodeURIComponent(tag[2]):track.name||`パート${part}`});
    const ends=new Map();
    for(const n of [...track.notes].sort((a,b)=>a.ticks-b.ticks)){
      if((ends.get(n.midi)??0)>n.ticks)throw Error('入力に同じパート・同じ高さで重なる音があります。MMLでは別TRに分けてください。');
      ends.set(n.midi,n.ticks+n.durationTicks);
      notes.push({id:nextId++,part,midi:n.midi,tick:n.ticks,duration:n.durationTicks,velocity:Math.round(n.velocity*127)});
      end=Math.max(end,n.ticks+n.durationTicks);
    }
  }
  if(!parts.length)parts.push({id:1,name:'パート1'});
  score.end=Math.max(end,ppq,score.tempos.at(-1).tick+1,score.signatures.at(-1).tick+1);
  return validateScore(score);
}
