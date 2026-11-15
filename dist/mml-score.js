import {MAX_NOTES} from './core.js';
import parseMidi from './vendor/midi-parser.js';

export const PPQ=960;
export const MAX_TICKS=PPQ*4096;
export function demoScore(){
  const notes=[],add=(part,midi,beat,duration,velocity=90)=>notes.push({id:notes.length+1,part,midi,tick:Math.round(beat*PPQ),duration:Math.round(duration*PPQ),velocity});
  add(1,72,0,3,100);add(1,76,3,1);add(1,74,4,1.5);add(1,72,5.5,.5);add(1,71,6,2);
  [72,74,76,77,76,74].forEach((midi,i)=>add(1,midi,8+i/3,1/3));add(1,72,10,2);
  [76,74,72,71].forEach((midi,i)=>add(1,midi,12+i/4,.25));add(1,72,13,3);
  for(let b=0;b<16;b++)add(2,[48,55,60,55][b%4],b,.75,65);
  return {title:'長音・三連符・テンポ変更',ppq:PPQ,end:PPQ*20,signatures:[{tick:0,signature:[4,4]}],parts:[{id:1,name:'旋律',program:0},{id:2,name:'伴奏',program:0}],tempos:[{tick:0,bpm:120},{tick:PPQ*8,bpm:90}],notes};
}
export function validateScore(score){
  if(!Number.isInteger(score.ppq)||score.ppq<24||score.ppq>32767||!Number.isSafeInteger(score.end)||score.end<1||score.end>score.ppq*4096)throw Error('曲の長さ・時間分解能が範囲外です。');
  if(!Array.isArray(score.notes)||score.notes.length>MAX_NOTES)throw Error('音符は100,000音以内にしてください。');
  if(!score.parts.length||score.parts.length>64||new Set(score.parts.map(p=>p.id)).size!==score.parts.length)throw Error('パート数が範囲外です。');
  for(const part of score.parts)if(part.program!==undefined&&(!Number.isInteger(part.program)||part.program<0||part.program>127)||part.instrumentId!==undefined&&(typeof part.instrumentId!=='string'||!/^[a-z0-9-]+$/.test(part.instrumentId))||part.percussion!==undefined&&typeof part.percussion!=='boolean')throw Error('パートの音色・音域設定が不正です。');
  for(const part of score.parts)if(part.channel!==undefined&&(!Number.isInteger(part.channel)||part.channel<0||part.channel>15)||part.port!==undefined&&(!Number.isInteger(part.port)||part.port<0||part.port>255))throw Error('MIDIチャンネルの情報が不正です。');
  if(score.parts.filter(p=>p.percussion).length>1)throw Error('打楽器パートは1つまでです。');
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
  if((score.controllers?.length??0)>1000000)throw Error('MIDI制御イベントが多すぎます。');
  for(const c of score.controllers??[])if(!score.parts.some(p=>p.id===c.part)||!Number.isInteger(c.tick)||c.tick<0||c.tick>score.end||!Number.isInteger(c.value)||(c.type==='cc'?(!Number.isInteger(c.number)||c.number<0||c.number>127||c.value<0||c.value>127):c.type==='pitchBend'?(c.value< -8192||c.value>8191):true))throw Error('MIDI制御データが不正です。');
  for(const e of score.sysex??[])if(!Number.isInteger(e.tick)||e.tick<0||e.tick>score.end||!Array.isArray(e.data)||!e.data.length||e.data.at(-1)!==247||e.data.some(b=>!Number.isInteger(b)||b<0||b>255))throw Error('SysExデータが不正です。');
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
export function serializeMml(score,{singlePort=false}={}){
  validateScore(score);
  const lines=[`// Musicbox title: ${encodeURIComponent(score.title)}`,`TimeBase(${score.ppq})`,`TR=1`];
  for(const s of score.signatures)lines.push(`Time(${s.tick}) TimeSignature(${s.signature.join(',')})`);
  for(const t of score.tempos)lines.push(`Time(${t.tick}) Tempo={${t.bpm}}`);
  lines.push(`Time(${score.end}) MetaText={Musicbox end}`);
  for(const e of score.sysex??[])lines.push(`Time(${e.tick}) SysEx=${[240,...e.data].join(',')};`);
  // ponytail: MIDI保存だけ単一ポートの15旋律CHまで。MMLはパートごとのポートで独立させる。
  let track=1;const channels=[];
  for(const [port,part] of score.parts.entries()){
    const voices=[];
    for(const n of score.notes.filter(n=>n.part===part.id).sort((a,b)=>a.tick-b.tick||a.midi-b.midi)){
      let voice=voices.find(v=>(v.ends.get(n.midi)??0)<=n.tick);
      if(!voice){voice={ends:new Map(),notes:[]};voices.push(voice);}
      voice.notes.push(n);voice.ends.set(n.midi,n.tick+n.duration);
    }
    if(!voices.length)voices.push({notes:[]});
    for(const voice of voices){
      const controls=(score.controllers??[]).filter(c=>c.part===part.id).map(({part,...c})=>c),key=JSON.stringify(controls),program=part.program??0,start=voice.notes[0]?.tick??(singlePort?score.end:0);
      let end=voice.notes.length?start:score.end;for(const n of voice.notes)end=Math.max(end,n.tick+n.duration);
      const route=part.channel===undefined?null:`${part.port??0}:${part.channel}`;
      let lane=!singlePort?channels.find(l=>l.part===part.id):channels.find(l=>l.percussion===!!part.percussion&&l.key===key&&(route!==null?l.route===route&&voice.notes.every(n=>!l.onsets.has(n.tick)||l.onsets.get(n.tick)===program):l.spans.every(s=>s.program===program||s.end<=start||end<=s.start)&&(part.percussion||voice.notes.every(n=>{
        const existing=l.pitches.get(n.midi)??[];let low=0,high=existing.length;
        while(low<high){const mid=(low+high)>>1;if(existing[mid].tick<n.tick+n.duration)low=mid+1;else high=mid;}
        return !low||existing[low-1].tick+existing[low-1].duration<=n.tick;
      }))));
      if(!lane&&singlePort&&!voice.notes.length&&!controls.length)lane={port:0,channel:part.percussion?10:1,spans:[],pitches:new Map(),onsets:new Map()};
      if(!lane){
        const count=channels.filter(l=>!l.percussion).length;if(singlePort&&!part.percussion&&count>=15)throw Error('MIDIに書き出せません（チャンネル数の上限）。');
        lane={part:part.id,port:singlePort?0:port,channel:part.percussion?10:!singlePort?1:count>=9?count+2:count+1,percussion:!!part.percussion,route,key,controls,spans:[],pitches:new Map(),onsets:new Map()};channels.push(lane);
      }
      lane.spans.push({start,end,program});
      for(const n of voice.notes){const pitches=lane.pitches.get(n.midi)??[];pitches.push(n);lane.pitches.set(n.midi,pitches);lane.onsets.set(n.tick,program);}
      for(const pitches of lane.pitches.values())pitches.sort((a,b)=>a.tick-b.tick);
      lines.push('',`TR=${++track}`,`Port(${lane.port}) CH=${lane.channel} Time(${start}) @${program+1}`,`TrackName={Musicbox:${part.id}:${part.instrumentId?`instrument=${part.instrumentId}:`:''}${route===null?'':`route=${route.replace(':',',')}:`}${encodeURIComponent(part.name)}}`,'q100');
      for(const n of voice.notes)lines.push(`Time(${n.tick}) ${singlePort?`@${program+1} `:''}n${n.midi},%${n.duration},100,${n.velocity}`);
      lines.push(`Time(${score.end}) MetaText={Musicbox end}`);
    }
  }
  for(const lane of channels)if(lane.controls.length){
    lines.push('',`TR=${++track}`,`Port(${lane.port}) CH=${lane.channel}`);
    for(const c of lane.controls)lines.push(`Time(${c.tick}) ${c.type==='cc'?`CC(${c.number},${c.value})`:`PitchBend(${c.value})`}`);
  }
  return lines.join('\n')+'\n';
}

// ponytail: 試作の入力は基本MMLに限定する。構造的なマクロ・任意プログラムは構文木を保持する版で扱う。
export function prepareMml(source){
  if(source.length>1000000)throw Error('MMLは1,000,000文字以内にしてください。');
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
    if(/^(?:[cdefgabrlovqn]\d*)+$/i.test(match[0])||['TimeBase','TR','Track','CH','Channel','Voice','Port','Time','Tempo','TimeSignature','CC','PitchBend','BendRange','SysEx','ResetGM','ResetGS','ResetXG','MasterVolume','RPN','NRPN'].includes(match[0]))continue;
    const line=forCheck.slice(0,match.index).split('\n').length;throw Error(`${line}行付近：この試作では ${match[0]} に対応していません。基本音符・和音・連符・タイ・TR・Time・Tempoを使用してください。`);
  }
  if(/[\[\]$&]/.test(forCheck.replace(/\bSysEx\$/g,'SysEx')))throw Error('この試作では繰り返し・マクロ・スラーに対応していません。');
  const marker=' MetaText={Musicbox boundary} ';
  clean=clean.replace(/(?:TrackName|MetaText)\s*=\s*\{[^{}]*\}|\b(?:TR|Track)\s*(?:=\s*\d+|\(\s*\d+\s*\))/g,s=>/^(?:TR|Track)\s*(?:=|\()/.test(s)?marker+s:s);
  return clean+'\n'+marker;
}
export function fromMidi(midi,source=''){
  const raw=parseMidi(midi.toArray?midi.toArray():midi),ppq=raw.header.ticksPerBeat,parts=[],notes=[],controllers=[];
  if(!ppq||raw.header.format>1)throw Error('MIDIは拍単位のSMF形式0または1を使用してください。');
  const tracks=raw.tracks.map(events=>{
    const bytes=Uint8Array.from(events.find(e=>e.type==='trackName')?.text??'',c=>c.charCodeAt(0));
    let name;try{name=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{name=new TextDecoder('shift_jis').decode(bytes);}
    const tag=name.match(/^Musicbox:(\d+):(?:instrument=([a-z0-9-]+):)?(?:route=(\d+),(\d+):)?(.*)$/);
    return {events,name,tag,channels:new Set()};
  });
  const taggedParts=new Map(),partChannels=new Map(),partTracks=new Map(),events=[],warnings=new Set();
  let nextPart=Math.max(0,...tracks.map(t=>Number(t.tag?.[1]??0)))+1,nextId=1,end=Math.max(0,...(midi.tracks??[]).map(t=>t.endOfTrackTicks??0));
  const title=source.match(/^\/\/ Musicbox title: (.*)$/m);
  const score={title:title?decodeURIComponent(title[1]):tracks[0]?.name||'読み込んだ楽譜',ppq,end:0,parts,notes,signatures:[],tempos:[]};
  const signatureMap=new Map([[0,[4,4]]]),tempoMap=new Map([[0,120]]),programs=new Map(),held=new Map();
  const priority=e=>e.type==='noteOff'?1:e.type==='noteOn'?2:0;
  const supportedCC=new Set([1,6,7,10,11,38,64,66,67,96,97,100,101,120,121,123]),rpn=new Map();
  for(const [track,t] of tracks.entries()){
    let tick=0,rank=0,previousPriority=0,pendingSysEx=null,port=0;const pending=new Map();
    for(const [order,e] of t.events.entries()){
      if(e.deltaTime)rank=0;else if(priority(e)<previousPriority)rank+=3;
      previousPriority=priority(e);
      if(e.type==='portPrefix')port=e.port;
      tick+=e.deltaTime;const event={...e,tick,track,order,port,priority:rank+previousPriority};events.push(event);end=Math.max(end,tick);
      if(e.type==='sysEx'&&e.data.at(-1)!==247){pendingSysEx=Array.from(e.data);event.skip=true;}
      else if(e.type==='endSysEx'&&pendingSysEx){pendingSysEx=pendingSysEx.concat(Array.from(e.data));if(pendingSysEx.at(-1)===247){event.type='sysEx';event.data=pendingSysEx;pendingSysEx=null;}else event.skip=true;}
      const key=port+':'+e.channel+':'+e.noteNumber;
      if(e.type==='noteOn'){const queue=pending.get(key)??[];queue.push(event);pending.set(key,queue);}
      else if(e.type==='noteOff'){const on=pending.get(key)?.shift();if(on){event.pairedOn=on;if(on.tick===tick){on.zeroLength=true;event.zeroLength=true;}}}
      if(e.channel!==undefined){t.channels.add(e.channel);t.firstPort??=port;}
    }
    if(pendingSysEx)warnings.add('不完全なSysEx設定を省略して、音符を読み込みました。');
  }
  function partFor(track,port,channel,program){
    const {tag,name}=tracks[track],percussion=channel===9;
    if(percussion)program=0;
    const key=percussion?'percussion':`${tag?`tag:${tag[1]}`:`track:${track}:${port}:${channel}`}:${program}:${tag?.[2]??''}`;
    let part=taggedParts.get(key);
    if(!part){
      const id=tag&&!parts.some(p=>p.id===Number(tag[1]))?Number(tag[1]):nextPart++;
      part={id,name:tag?decodeURIComponent(tag[5]):name||(percussion?'打楽器':`パート${id}`),program,...(tag?.[2]?{instrumentId:tag[2]}:{}),...(percussion?{percussion:true}:{}),...(tag?.[3]!==undefined?{port:Number(tag[3]),channel:Number(tag[4])}:!tag?{port,channel}:{})};parts.push(part);taggedParts.set(key,part);partChannels.set(id,{port,channel});
    }
    partTracks.set(part.id,Math.min(partTracks.get(part.id)??track,track));
    return part;
  }
  for(const [i,t] of tracks.entries())if(t.tag)partFor(i,t.firstPort??0,[...t.channels][0]??0,t.events.find(e=>e.type==='programChange')?.programNumber??0);
  // 同一トラック内の命令順を保ち、別トラックの同時刻のチャンネル設定を先に適用する。
  events.sort((a,b)=>a.tick-b.tick||a.priority-b.priority||a.track-b.track||a.order-b.order);
  for(const e of events){
    if(e.zeroLength||e.skip)continue;
    const {tick,channel,port}=e;
    if(!programs.has(port))programs.set(port,Array(16).fill(0));
    if(!rpn.has(port))rpn.set(port,Array.from({length:16},()=>[127,127]));
    if(e.type==='setTempo')tempoMap.set(tick,60000000/e.microsecondsPerBeat);
    else if(e.type==='timeSignature')signatureMap.set(tick,[e.numerator,e.denominator]);
    else if(e.type==='sysEx'||e.type==='endSysEx'){
      const data=Array.from(e.data),gm=data.length===5&&data[0]===0x7e&&data[2]===9&&(data[3]===1||data[3]===3),gs=data.length===10&&data[0]===0x41&&data[2]===0x42&&data[3]===0x12&&data.slice(4,9).join(',')==='64,0,127,0,65',xg=data.length===8&&data[0]===0x43&&data[2]===0x4c&&data.slice(3,7).join(',')==='0,0,126,0',volume=data.length===7&&data[0]===127&&data[2]===4&&data[3]===1;
      if(e.type==='sysEx'&&data.at(-1)===247){
        if((gm||gs||xg)&&!notes.length){
          const reset=[126,127,9,1,247];score.sysex=[{tick,data:reset}];for(const values of programs.values())values.fill(0);controllers.length=0;for(const values of rpn.values())for(const selection of values)selection.fill(127);
          if(data.join(',')!==reset.join(','))warnings.add('音源の初期化をGM標準の初期化に揃えました。');
        }else if(volume)(score.sysex??=[]).push({tick,data});
        else warnings.add('再現できない音源固有の設定を省略しました。保存にも含めませんが、音符は保持しています。');
      }else warnings.add('分割・特殊なSysEx設定の一部を省略して、音符を読み込みました。');
    }
    else if(e.type==='programChange')programs.get(port)[channel]=e.programNumber;
    else if(e.type==='controller'){
      const number=e.controllerType,selection=rpn.get(port)[channel];
      if(number===0||number===32){if(e.value)warnings.add('拡張バンクの音色はGM基本音色で再生・保存します。音符は保持しています。');continue;}
      if(number===99||number===98){selection.fill(127);controllers.push({port,channel,tick,type:'cc',number:101,value:127},{port,channel,tick,type:'cc',number:100,value:127});warnings.add('再現できない音源固有の設定を省略しました。保存にも含めませんが、音符は保持しています。');continue;}
      if(number===101)selection[0]=e.value;if(number===100)selection[1]=e.value;if(number===121)selection.fill(127);
      if(!supportedCC.has(number)||[6,38,96,97].includes(number)&&(selection[0]!==0||selection[1]>2)){
        if(![6,38,96,97].includes(number)||selection.some(v=>v!==127))warnings.add('再現できない音源固有の設定を省略しました。保存にも含めませんが、音符は保持しています。');continue;
      }
      controllers.push({port,channel,tick,type:'cc',number,value:e.value});
    }
    else if(e.type==='pitchBend')controllers.push({port,channel,tick,type:'pitchBend',value:e.value});
    else if(e.type==='noteOn'){
      const part=partFor(e.track,port,channel,programs.get(port)[channel]),key=port+':'+channel+':'+e.noteNumber,queue=held.get(key)??[];
      if(source&&queue.length&&!part.percussion&&!tracks[e.track].tag)throw Error('入力に同じチャンネル・同じ高さで重なる音があります。MMLでは別CHに分けてください。');
      const n={id:nextId++,part:part.id,midi:e.noteNumber,tick,duration:1,velocity:e.velocity};
      e.note=n;queue.push(n);held.set(key,queue);notes.push(n);
    }else if(e.type==='noteOff'){
      const queue=held.get(port+':'+channel+':'+e.noteNumber)??[],index=e.pairedOn?.note?queue.indexOf(e.pairedOn.note):0,n=index<0?null:queue.splice(index,1)[0];if(n)n.duration=Math.max(1,tick-n.tick);
    }
  }
  for(const queue of held.values())for(const n of queue)n.duration=Math.max(1,end-n.tick);
  if(!parts.length)partFor(0,controllers[0]?.port??0,controllers[0]?.channel??0,0);
  parts.sort((a,b)=>partTracks.get(a.id)-partTracks.get(b.id));
  for(const part of parts){
    for(const {port,channel,...c} of controllers)if(channel===partChannels.get(part.id).channel&&port===partChannels.get(part.id).port){
      if((score.controllers?.length??0)>=1000000)throw Error('MIDI制御イベントが多すぎます。');
      (score.controllers??=[]).push({part:part.id,...c});
    }
  }
  score.signatures=[...signatureMap].map(([tick,signature])=>({tick,signature})).sort((a,b)=>a.tick-b.tick);
  score.tempos=[...tempoMap].map(([tick,bpm])=>({tick,bpm})).sort((a,b)=>a.tick-b.tick);
  for(const n of notes)end=Math.max(end,n.tick+n.duration);
  score.end=Math.max(end,ppq,score.tempos.at(-1).tick+1,score.signatures.at(-1).tick+1);
  if(warnings.size)score.warnings=[...warnings];
  return validateScore(score);
}

export function midiPerformance(score){
  const parts=new Map();
  const masterVolumes=(score.sysex??[]).filter(e=>e.data.length===7&&e.data[0]===127&&e.data[2]===4&&e.data[3]===1).map(e=>({tick:e.tick,type:'masterVolume',value:e.data[4]+e.data[5]*128}));
  for(const part of score.parts){
    const changes=(score.controllers??[]).filter(c=>c.part===part.id).concat(masterVolumes).sort((a,b)=>a.tick-b.tick),states=[];
    let volume=100,expression=127,pan=64,modulation=0,soft=0,bend=0,range=2,cents=0,fine=8192,coarse=64,rpnMSB=127,rpnLSB=127,master=1;
    const state=tick=>({tick,gain:(volume/127*expression/127*master)**2*(soft?0.7:1),pan:(pan-64)/(pan<64?64:63),detune:bend/8192*(range*100+cents)+(fine-8192)/8192*100+(coarse-64)*100,modulation:modulation/127*50});
    states.push(state(0));
    const ends=new Map(),cuts=new Set(),held=new Set(),sounding=new Set(),captured=new Set();let sustain=false,sostenuto=false;
    const timeline=[...score.notes.filter(n=>n.part===part.id).flatMap(note=>[{tick:note.tick,type:'on',note},{tick:note.tick+note.duration,type:'off',note}]),...changes];
    timeline.sort((a,b)=>a.tick-b.tick||(a.type==='cc'?-1:a.type==='on'?1:0)-(b.type==='cc'?-1:b.type==='on'?1:0));
    const release=(note,tick)=>{ends.set(note.id,tick);sounding.delete(note);captured.delete(note);};
    for(const e of timeline){
      if(e.type==='on'){held.add(e.note);sounding.add(e.note);}
      else if(e.type==='off'){held.delete(e.note);if(!part.percussion&&sounding.has(e.note)&&!sustain&&!captured.has(e.note))release(e.note,e.tick);}
      else if(e.type==='pitchBend'){bend=e.value;states.push(state(e.tick));}
      else if(e.type==='masterVolume'){master=e.value/16383;states.push(state(e.tick));}
      else if(e.type==='cc'){
        const {number,value,tick}=e;
        if(number===7)volume=value;else if(number===11)expression=value;else if(number===10)pan=value;else if(number===1)modulation=value;else if(number===67)soft=value>=64;
        else if(number===101)rpnMSB=value;else if(number===100)rpnLSB=value;else if(number===99||number===98){rpnMSB=127;rpnLSB=127;}
        else if(number===6||number===38||number===96||number===97){
          if(rpnMSB===0&&rpnLSB<=2){
            const increment=number===96?1:-1;
            if(rpnLSB===0){if(number===6)range=value;else if(number===38)cents=value;else range=Math.max(0,Math.min(127,range+increment));}
            else if(rpnLSB===1)fine=number===6?value*128+fine%128:number===38?Math.floor(fine/128)*128+value:Math.max(0,Math.min(16383,fine+increment));
            else if(number!==38)coarse=number===6?value:Math.max(0,Math.min(127,coarse+increment));
          }
        }else if(number===64)sustain=value>=64;
        else if(number===66){if(value>=64&&!sostenuto)for(const n of held)captured.add(n);sostenuto=value>=64;if(!sostenuto)captured.clear();}
        else if(number===120){for(const n of sounding){release(n,tick);cuts.add(n.id);}held.clear();}
        else if(number===123){held.clear();if(!part.percussion&&!sustain)for(const n of sounding)if(!captured.has(n))release(n,tick);}
        else if(number===121){expression=127;modulation=0;soft=0;bend=0;sustain=false;sostenuto=false;captured.clear();rpnMSB=127;rpnLSB=127;}
        if(!part.percussion&&[64,66,121].includes(number))for(const n of sounding)if(!held.has(n)&&!sustain&&!captured.has(n))release(n,tick);
        states.push(state(tick));
      }
    }
    if(!part.percussion)for(const n of sounding)ends.set(n.id,score.end);
    parts.set(part.id,{states,ends,cuts});
  }
  return parts;
}
