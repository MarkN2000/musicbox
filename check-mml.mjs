import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import tone from '@tonejs/midi';
import midiFile from 'midi-file';
import {validateDefinitions,noteName} from './dist/core.js';
import {initSync,SakuraCompiler,get_version} from './dist/vendor/sakura/sakuramml.js';
import {t,currentLanguage,localized} from './dist/i18n.js';
import {demoScore,validateScore,serializeMml,prepareMml,fromMidi,secondsAt,tickAt,moveNotes,resizeNotes,scorePosition,midiPerformance} from './dist/mml-score.js';

initSync({module:await readFile(new URL('./dist/vendor/sakura/sakuramml_bg.wasm',import.meta.url))});
assert.equal(get_version(),'0.2.2'); // 固定した0.2.3ソース内の実行時バージョン表記。
function compile(source){const compiler=SakuraCompiler.new();try{const bytes=compiler.compile(prepareMml(source));assert.equal(compiler.get_log(),'');return fromMidi(bytes,source);}finally{compiler.free();}}
const musical=score=>score.notes.map(({part,midi,tick,duration,velocity})=>({part,midi,tick,duration,velocity})).sort((a,b)=>a.part-b.part||a.tick-b.tick||a.midi-b.midi||a.duration-b.duration);
const original=demoScore(),source=serializeMml(original),back=compile(source);
assert.deepEqual(musical(back),musical(original));assert.equal(back.end,original.end);assert.equal(back.title,original.title);assert.deepEqual(back.parts,original.parts);
assert.deepEqual(back.signatures,original.signatures);
const furusato=compile(await readFile(new URL('./dist/samples/furusato-musicbox-30.mml',import.meta.url),'utf8'));
assert.equal(furusato.notes.length,124);assert.equal(furusato.end,48*960);assert.equal(secondsAt(furusato,furusato.end),36);
assert.equal(furusato.notes[0].midi,72,'Sakuraのo6cはサイトのC5（MIDI72）');
assert.equal(furusato.notes.filter(n=>n.part===1).length,45);
for(const tick of [9,21,45])assert.equal(furusato.notes.find(n=>n.part===1&&n.tick===tick*960).duration,1920,'句末の二分音符を打ち直さない');
const furusatoBack=compile(serializeMml(furusato));assert.deepEqual(musical(furusatoBack),musical(furusato));assert.equal(furusatoBack.end,furusato.end);
const catalog=JSON.parse(await readFile(new URL('./dist/samples/mml-index.json',import.meta.url),'utf8')),instruments=validateDefinitions(JSON.parse(await readFile(new URL('./dist/instruments.json',import.meta.url),'utf8')),JSON.parse(await readFile(new URL('./dist/audio/soundsets.json',import.meta.url),'utf8'))).instruments;
const versions=catalog.songs.flatMap(s=>{assert.ok(s.song_id&&s.title&&s.composer&&s.versions.length);return s.versions;});
assert.equal(new Set(catalog.songs.map(s=>s.song_id)).size,catalog.songs.length);assert.equal(new Set(versions.map(v=>v.id)).size,versions.length);
for(const song of catalog.songs){assert.ok(!song.versions.some(v=>v.arranged_for.startsWith('piano'))||!song.versions.some(v=>v.arranged_for==='xylophone32'),song.song_id+'はピアノ版があれば木琴版を重複掲載しない');for(const version of song.versions)assert.ok(!/(オルゴール|ピアノ|木琴)\d|(?:Music box|Piano|Xylophone) \d/.test(version.label_ja+version.label_en),'楽器の表示名に鍵数を付けない');}
assert.deepEqual(versions.map(v=>v.file).sort(),(await readdir(new URL('./dist/samples/',import.meta.url))).filter(f=>f.endsWith('.mml')).sort(),'MML曲を曲選択の一覧から漏らさない');
for(const version of versions){
 const profile=instruments.find(i=>i.arrangedFor===version.arranged_for);assert.ok((profile||version.arranged_for==='gm')&&version.label_ja&&version.label_en);
 const score=compile(await readFile(new URL('./dist/samples/'+version.file,import.meta.url),'utf8'));
 for(const part of score.parts){const target=profile??instruments.find(i=>i.id===part.instrumentId);assert.ok(target&&part.program===target.gmProgram&&!!part.percussion===!!target.percussion&&part.instrumentId===target.id,version.id+'のGM音色と実機音域');assert.ok(score.notes.filter(n=>n.part===part.id).every(n=>target.allowed.has(n.midi)),version.id+'の対象楽器の音域');}
 if(version.arranged_for==='gm')assert.ok(new Set(score.parts.map(p=>`${p.program}:${!!p.percussion}`)).size>1,version.id+'は複数のGM楽器で演奏する');
 if(['musicbox30','xylophone32'].includes(version.arranged_for))for(const n of score.notes.filter(n=>n.part!==1))assert.ok(!score.notes.some(m=>m.part===1&&m.midi===n.midi&&m.tick<n.tick&&n.tick<m.tick+m.duration),version.id+'で伴奏が旋律の長音を打ち直さない');
 const restored=compile(serializeMml(score));assert.deepEqual(musical(restored),musical(score),version.id+'の全音長・拍位置の往復');assert.deepEqual(restored.parts,score.parts,version.id+'のパート・GM音色・音域の往復');assert.equal(restored.end,score.end);assert.deepEqual(restored.tempos.map(t=>t.tick),score.tempos.map(t=>t.tick));for(const [i,t]of score.tempos.entries())assert.ok(Math.abs(60000000/t.bpm-60000000/restored.tempos[i].bpm)<=1.000001,version.id+'のテンポをMIDIの1マイクロ秒精度で保持');assert.deepEqual(restored.signatures,score.signatures);
}
const twinkle=compile(await readFile(new URL('./dist/samples/twinkle-piano-88.mml',import.meta.url),'utf8'));
assert.deepEqual(twinkle.notes.filter(n=>n.part===1&&n.tick>=288*twinkle.ppq&&n.tick<290*twinkle.ppq).map(n=>[n.midi,n.tick-288*twinkle.ppq,n.duration]),[60,64,67,72,76,79].map((midi,i)=>[midi,i*320,320]),'第III変奏の通常三連符を間引かない');
assert.equal(twinkle.notes.find(n=>n.part===1&&n.midi===72&&n.tick===195*twinkle.ppq).duration,6*twinkle.ppq,'第II変奏のCの内声をタイの途中で打ち直さない');
const air=compile(await readFile(new URL('./dist/samples/air-on-g-piano-88.mml',import.meta.url),'utf8'));
for(const offset of [0,24]){assert.equal(air.notes.find(n=>n.midi===78&&n.tick===(18.75+offset)*air.ppq).duration,.5*air.ppq);assert.equal(air.notes.find(n=>n.midi===74&&n.tick===(20.75+offset)*air.ppq).duration,.75*air.ppq);}
for(const tick of [0,960,7680,8000,12000,19200]){
  assert.ok(Math.abs(secondsAt(back,tick)-secondsAt(original,tick))<.00002);
  assert.ok(Math.abs(tickAt(original,secondsAt(original,tick))-tick)<1e-8);
}
let previous=back;
for(let i=0;i<5;i++){const next=compile(serializeMml(previous));assert.deepEqual(musical(next),musical(original));assert.equal(next.end,original.end);assert.deepEqual(next.tempos,back.tempos);previous=next;}
const overlap=structuredClone(original);overlap.notes.push({id:999,part:1,midi:72,tick:480,duration:240,velocity:65});
const fractional=structuredClone(original);fractional.tempos[1].bpm=91.125;
const fractionalBack=compile(serializeMml(fractional));assert.ok(Math.abs(secondsAt(fractionalBack,fractionalBack.end)-secondsAt(fractional,fractional.end))<.00002);
assert.deepEqual(musical(compile(serializeMml(overlap))),musical(overlap),'同音の重なりを別声部に分けて保持');
const hand=compile('TimeBase(960) TR=1 q100 Tempo(120) o5 c4^8 {def}4 Tempo(90) g2 r4 TR=2 q100 o3 c1 r1');
assert.equal(hand.end,7680,'全パートの末尾休符を保持');assert.equal(hand.notes[0].duration,1440);assert.equal(hand.notes.filter(n=>n.duration===320).length,3);
assert.throws(()=>compile('TimeBase(960) q100 Time(0) n60,%1920 Time(480) n60,%240'),/重なる音/);
assert.throws(()=>prepareMml('Include(test.mml)'),/対応していません/);
assert.throws(()=>prepareMml('/* open'),/コメント/);
assert.throws(()=>prepareMml('[4 cde]'),/対応していません/);
const pedalMidi=new tone.Midi();pedalMidi.addTrack().addCC({number:64,ticks:0,value:1});assert.equal(fromMidi(pedalMidi).controllers[0].number,64,'ペダル入りMIDIを拒否せず保持する');
const empty={...structuredClone(original),notes:[]};assert.equal(compile(serializeMml(empty)).end,empty.end);
assert.deepEqual(compile(serializeMml(empty)).parts,empty.parts);
const selected=new Set(original.notes.filter(n=>n.part===1&&n.tick>=7680&&n.tick<9600).map(n=>n.id));
const moved=moveNotes(original.notes,selected,240,1,original.end);
for(const n of original.notes){const out=moved.find(x=>x.id===n.id);assert.equal(out.tick-n.tick,selected.has(n.id)?240:0);assert.equal(out.midi-n.midi,selected.has(n.id)?1:0);assert.equal(out.duration,n.duration);}
const resized=resizeNotes(original.notes,new Set([1,2]),-10000,original.end);assert.equal(Math.min(resized[0].duration,resized[1].duration),1);assert.equal(resized[0].duration-resized[1].duration,original.notes[0].duration-original.notes[1].duration);
assert.equal(resized[0].tick,original.notes[0].tick);
const crossing=structuredClone(original);crossing.notes=[{id:1,part:1,midi:60,tick:7*960,duration:2*960,velocity:100}];
assert.ok(Math.abs(secondsAt(crossing,9*960)-secondsAt(crossing,7*960)-(0.5+2/3))<1e-10,'テンポ変更をまたぐ長音');
assert.throws(()=>validateScore({...original,tempos:[{tick:0,bpm:120},{tick:0,bpm:90}]}),/テンポ/);
const meters=structuredClone(original);meters.signatures.push({tick:8*960,signature:[3,4]},{tick:14*960,signature:[6,8]});
for(const [beat,bar,inBar] of [[0,1,1],[4,2,1],[8,3,1],[10,3,3],[11,4,1],[14,5,1],[14.5,5,2],[16.5,5,6],[17,6,1]]){
  const position=scorePosition(meters,beat*960);assert.equal(position.bar,bar);assert.equal(position.beat,inBar);
  assert.equal(secondsAt(meters,beat*960),secondsAt(original,beat*960),'拍子変更で発音時刻は変わらない');
}
let meterBack=meters;
for(let i=0;i<3;i++){meterBack=compile(serializeMml(meterBack));assert.deepEqual(meterBack.signatures,meters.signatures);assert.deepEqual(musical(meterBack),musical(original));assert.equal(meterBack.end,original.end);}
const odd=structuredClone(original);odd.signatures=[{tick:0,signature:[7,8]}];
assert.equal(scorePosition(odd,3.5*960).bar,2);assert.equal(scorePosition(odd,3*960).beat,7);
assert.deepEqual(compile(serializeMml(odd)).signatures,odd.signatures);
const fragment=structuredClone(original);fragment.signatures.push({tick:4.5*960,signature:[3,8]});
assert.equal(scorePosition(fragment,4.5*960).bar,3);assert.equal(scorePosition(fragment,6*960).bar,4);
assert.deepEqual(compile(serializeMml(fragment)).signatures,fragment.signatures,'不完全小節の変更点を丸めない');
const handMeters=compile('TimeBase(960) q100 TimeSignature(4,4) c1 TimeSignature(3,4) d2. TimeSignature(6,8) e2.');
assert.deepEqual(handMeters.signatures,[{tick:0,signature:[4,4]},{tick:3840,signature:[3,4]},{tick:6720,signature:[6,8]}]);
const midiMeters=new tone.Midi();midiMeters.header.timeSignatures=[{ticks:1920,timeSignature:[5,8]}];
assert.deepEqual(fromMidi(midiMeters).signatures,[{tick:0,signature:[4,4]},{tick:1920,signature:[5,8]}]);
for(const signatures of [[],[{tick:1,signature:[4,4]}],[{tick:0,signature:[4,3]}],[{tick:0,signature:[4,4]},{tick:0,signature:[3,4]}],[{tick:0,signature:[4,4]},{tick:original.end,signature:[3,4]}]])assert.throws(()=>validateScore({...original,signatures}),/拍子/);
console.log('MML: 音符・声部・曲末・同音重なり・連符・タイ・テンポ・途中拍子・小節表示・編集操作の検証OK');
const gm=compile('TimeBase(960) TR=1 CH=1 @11 q100 o6 c4 TR=2 CH=2 Voice(13) q100 o5 e4 TR=3 CH=3 @41 q100 o5 g4');
assert.deepEqual(gm.parts.map(p=>p.program),[10,12,40]);assert.deepEqual(compile(serializeMml(gm)).parts,gm.parts,'対応していないGM番号も保持する');
const switched=compile('TimeBase(960) TR=1 CH=1 @1 q100 o6 c4 @11 d4');assert.deepEqual(switched.parts.map(p=>p.program),[0,10]);assert.deepEqual(switched.notes.map(n=>n.tick),[0,960],'途中の音色変更は時刻を保って別パートに分ける');
const ranges=structuredClone(original);ranges.parts[0]={...ranges.parts[0],program:0,instrumentId:'piano-61'};ranges.parts[1]={...ranges.parts[1],program:12,instrumentId:'marimba-61'};assert.deepEqual(compile(serializeMml(ranges)).parts,ranges.parts);
const tooMany={...original,parts:Array.from({length:16},(_,i)=>({id:i+1,name:String(i),program:i})),notes:Array.from({length:16},(_,i)=>({id:i+1,part:i+1,midi:60,tick:0,duration:960,velocity:90}))};
assert.throws(()=>serializeMml(tooMany,{singlePort:true}),/MIDIに書き出せません/,'MIDI出力で異なる音色が同時に15CHを超える場合だけ止める');
const sequential={...tooMany,end:16*960,notes:tooMany.notes.map((n,i)=>({...n,tick:i*960}))};assert.deepEqual(musical(compile(serializeMml(sequential,{singlePort:true}))),musical(sequential),'途中音色変更の16パートは安全にチャンネルを再利用して保持する');
const drums=new tone.Midi();drums.addTrack().channel=9;drums.tracks[0].addNote({midi:36,ticks:0,durationTicks:480,velocity:1});const drumScore=fromMidi(drums);assert.equal(drumScore.parts[0].percussion,true,'チャンネル10を打楽器として読み込む');
assert.deepEqual(compile(serializeMml(drumScore)).parts,drumScore.parts);assert.deepEqual(musical(compile(serializeMml(drumScore))),musical(drumScore),'打楽器の音と時刻をMML往復で保持する');
const overlappingDrums={...drumScore,notes:[...drumScore.notes,{...drumScore.notes[0],id:2,tick:120,duration:120}]};assert.deepEqual(musical(compile(serializeMml(overlappingDrums))),musical(overlappingDrums),'打楽器の同音再打鍵と音長の重なりを同じCH10で保持する');
const ensemble={...original,parts:[...original.parts,{id:3,name:'打楽器',program:0,percussion:true,instrumentId:'vsco-percussion'}],notes:[...original.notes,{id:999,part:3,midi:38,tick:0,duration:240,velocity:90}]};
assert.deepEqual(compile(serializeMml(ensemble)).parts,ensemble.parts,'ピアノと打楽器を別チャンネルで保持する');
assert.throws(()=>serializeMml({...ensemble,parts:[...ensemble.parts,{id:4,name:'打楽器2',program:0,percussion:true}]}),/打楽器パート/);
for(const profile of instruments){
  const source={...original,parts:[{id:1,name:profile.name.ja,program:profile.gmProgram,instrumentId:profile.id,...(profile.percussion?{percussion:true}:{})}],notes:[{id:1,part:1,midi:[...profile.allowed][Math.floor(profile.allowed.size/2)],tick:0,duration:960,velocity:90}]};
  const result=compile(serializeMml(source));assert.deepEqual(result.parts,source.parts,profile.id+'のGM番号・打楽器・実機設定を保持する');assert.deepEqual(musical(result),musical(source));
}
const splitDrums=new tone.Midi();for(const midi of [36,38]){const track=splitDrums.addTrack();track.channel=9;track.addNote({midi,ticks:0,durationTicks:240,velocity:1});}
assert.equal(fromMidi(splitDrums).parts.length,1,'複数の打楽器トラックは1つにまとめる');assert.equal(fromMidi(splitDrums).notes.length,2);
const longNames={...original,parts:original.parts.map(p=>({...p,name:'長い日本語のパート名'.repeat(5)}))};assert.deepEqual(compile(serializeMml(longNames)).parts,longNames.parts,'127バイトを超える名前を切らずに保持する');
const controlled={...structuredClone(original),controllers:[
  {part:1,tick:0,type:'cc',number:64,value:127},{part:1,tick:0,type:'cc',number:10,value:127},
  {part:1,tick:480,type:'cc',number:11,value:50},{part:1,tick:960,type:'pitchBend',value:4096},
  {part:1,tick:1920,type:'cc',number:64,value:0},
]};
assert.deepEqual(compile(serializeMml(controlled)).controllers,controlled.controllers,'CC・ピッチベンドをMMLから実際のMIDIイベントへ書き出して保持する');
const rawChannels=Uint8Array.from(midiFile.writeMidi({header:{format:1,numTracks:2,ticksPerBeat:960},tracks:[
  [{deltaTime:0,type:'noteOn',channel:2,noteNumber:60,velocity:90},{deltaTime:960,type:'noteOff',channel:2,noteNumber:60,velocity:0},{deltaTime:0,type:'noteOn',channel:2,noteNumber:62,velocity:80},{deltaTime:960,type:'noteOff',channel:2,noteNumber:62,velocity:0},{deltaTime:0,meta:true,type:'endOfTrack'}],
  [{deltaTime:0,type:'programChange',channel:2,programNumber:40},{deltaTime:0,type:'controller',channel:2,controllerType:7,value:65},{deltaTime:960,type:'programChange',channel:2,programNumber:73},{deltaTime:0,type:'pitchBend',channel:2,value:2048},{deltaTime:960,meta:true,type:'endOfTrack'}],
]}));
const channelScore=fromMidi(rawChannels);assert.deepEqual(channelScore.parts.map(p=>p.program),[40,73],'後方の別トラックの同一CH音色指定と途中変更を適用する');
assert.ok(channelScore.parts.every(p=>channelScore.controllers.some(c=>c.part===p.id&&c.number===7&&c.value===65)),'音色変更前後のパートに同じCHのコントローラーを引き継ぐ');
const midiBytes=tracks=>Uint8Array.from(midiFile.writeMidi({header:{format:1,numTracks:tracks.length,ticksPerBeat:960},tracks:tracks.map(events=>events.at(-1)?.type==='endOfTrack'?events:[...events,{deltaTime:0,meta:true,type:'endOfTrack'}])}));
const importTracks=[
  [{deltaTime:0,type:'sysEx',data:[0x7e,0x7f,9,1,0xf7]},{deltaTime:0,meta:true,type:'setTempo',microsecondsPerBeat:500000},{deltaTime:960,meta:true,type:'setTempo',microsecondsPerBeat:666667},{deltaTime:960,meta:true,type:'endOfTrack'}],
  [{deltaTime:0,meta:true,type:'trackName',text:'Piano lead'},{deltaTime:0,type:'programChange',channel:0,programNumber:0},{deltaTime:960,type:'noteOn',channel:0,noteNumber:60,velocity:90},{deltaTime:480,type:'noteOff',channel:0,noteNumber:60,velocity:0}],
  [{deltaTime:0,meta:true,type:'trackName',text:'Piano harmony'},{deltaTime:0,type:'programChange',channel:1,programNumber:0},{deltaTime:0,type:'noteOn',channel:1,noteNumber:67,velocity:75},{deltaTime:960,type:'noteOff',channel:1,noteNumber:67,velocity:0}],
  [{deltaTime:0,meta:true,type:'trackName',text:'Violin'},{deltaTime:0,type:'programChange',channel:2,programNumber:40},{deltaTime:240,type:'noteOn',channel:2,noteNumber:69,velocity:80},{deltaTime:960,type:'noteOff',channel:2,noteNumber:69,velocity:0}],
  [{deltaTime:0,meta:true,type:'trackName',text:'Drums'},{deltaTime:0,type:'noteOn',channel:9,noteNumber:36,velocity:95},{deltaTime:120,type:'noteOff',channel:9,noteNumber:36,velocity:0}],
];
for(const [bytes,name] of [[Buffer.from('8e638d9382c893568e6782cc8365815b835b','hex'),'残酷な天使のテーゼ'],[new TextEncoder().encode('日本語の曲名 🎵'),'日本語の曲名 🎵'],[new TextEncoder().encode('Piano'),'Piano']]){
  const named=fromMidi(midiBytes([[{deltaTime:0,meta:true,type:'trackName',text:String.fromCharCode(...bytes)},{deltaTime:0,type:'noteOn',channel:0,noteNumber:60,velocity:90},{deltaTime:960,type:'noteOff',channel:0,noteNumber:60,velocity:0}]]));
  assert.equal(named.title,name);assert.equal(named.parts[0].name,name);const restored=compile(serializeMml(named));assert.equal(restored.title,name);assert.equal(restored.parts[0].name,name,'文字コードを解釈した名前をMML往復でも保つ');
}
const importBytes=midiBytes(importTracks),importScore=fromMidi(importBytes);
const format0=fromMidi(Uint8Array.from(midiFile.writeMidi({header:{format:0,numTracks:1,ticksPerBeat:960},tracks:[[
  {deltaTime:0,type:'programChange',channel:0,programNumber:0},{deltaTime:0,type:'programChange',channel:1,programNumber:40},
  {deltaTime:0,type:'noteOn',channel:0,noteNumber:60,velocity:90},{deltaTime:0,type:'noteOn',channel:1,noteNumber:69,velocity:80},{deltaTime:0,type:'noteOn',channel:9,noteNumber:36,velocity:95},
  {deltaTime:960,type:'noteOff',channel:0,noteNumber:60,velocity:0},{deltaTime:0,type:'noteOff',channel:1,noteNumber:69,velocity:0},{deltaTime:0,type:'noteOff',channel:9,noteNumber:36,velocity:0},{deltaTime:0,meta:true,type:'endOfTrack'},
]]})));
assert.deepEqual(format0.parts.map(p=>p.program),[0,40,0]);assert.equal(format0.parts.at(-1).percussion,true);assert.equal(format0.notes.length,3,'SMF形式0もチャンネルごとに音色と打楽器を分けて読み込む');
const simultaneousPrograms=fromMidi(midiBytes([[{deltaTime:0,type:'programChange',channel:0,programNumber:0},{deltaTime:0,type:'noteOn',channel:0,noteNumber:60,velocity:90},{deltaTime:0,type:'programChange',channel:0,programNumber:40},{deltaTime:0,type:'noteOn',channel:0,noteNumber:64,velocity:80},{deltaTime:960,type:'noteOff',channel:0,noteNumber:60,velocity:0},{deltaTime:0,type:'noteOff',channel:0,noteNumber:64,velocity:0}]]));
assert.deepEqual(simultaneousPrograms.parts.map(p=>p.program),[0,40],'同時刻でも元トラック内の発音と音色変更の順序を逆転しない');
assert.deepEqual(importScore.parts.map(p=>p.name),['Piano lead','Piano harmony','Violin','Drums'],'発音順によらず元のトラック順を保ち、同じピアノでも別パートとして読み込む');
assert.deepEqual(importScore.parts.map(p=>p.program),[0,0,40,0]);assert.equal(importScore.parts.at(-1).percussion,true);
const importMml='TimeBase(960) TR=1 CH=1 @1 q100 Time(960) n60,%480,100,90 TR=2 CH=2 @1 q100 Time(0) n67,%960,100,75 TR=3 CH=3 @41 q100 Time(240) n69,%960,100,80 TR=4 CH=10 @1 q100 Time(0) n36,%120,100,95';
const importMmlScore=compile(importMml);assert.deepEqual(importMmlScore.parts.map(p=>p.program),[0,0,40,0]);assert.equal(importMmlScore.parts.at(-1).percussion,true);
assert.deepEqual(musical(compile(serializeMml(importScore))),musical(importScore),'外部GMの各パートと全音を再保存して保持する');
for(const number of [0,32]){
  const bank=fromMidi(midiBytes([[{deltaTime:0,type:'controller',channel:0,controllerType:number,value:1},...importTracks[1]]]));
  assert.equal(bank.notes.length,1);assert.equal(bank.parts[0].program,0);assert.ok(bank.warnings.some(w=>w.includes('拡張バンク')));assert.ok(!bank.controllers?.some(c=>c.number===0||c.number===32),'拡張バンクを保存に含めずGM基本音色へ近似する');
}
assert.doesNotThrow(()=>fromMidi(midiBytes([[{deltaTime:0,type:'controller',channel:0,controllerType:0,value:0},{deltaTime:0,type:'controller',channel:0,controllerType:32,value:0},...importTracks[1]]])));
for(const data of [[0x43,0x10,0x4c,0,0,0x7e,0,0xf7],[0x41,0x10,0x42,0x12,0x40,0,0x7f,0,0x41,0xf7],[0x7e,0x7f,9,3,0xf7]]){
  const reset=fromMidi(midiBytes([[{deltaTime:0,type:'sysEx',data},...importTracks[1]]]));assert.equal(reset.notes.length,1);assert.deepEqual(reset.sysex,[{tick:0,data:[126,127,9,1,247]}],'GS/XG/GM2初期化はGMとして受け入れ、GM以外の初期化を保存しない');assert.ok(reset.warnings.length);
}
const delayedReset=fromMidi(midiBytes([[{deltaTime:1,type:'sysEx',data:[0x7e,0x7f,9,1,0xf7]},...importTracks[1]]]));assert.equal(delayedReset.notes.length,1);assert.equal(delayedReset.sysex[0].tick,1);
const midReset=fromMidi(midiBytes([[{deltaTime:0,type:'noteOn',channel:0,noteNumber:60,velocity:90},{deltaTime:0,type:'sysEx',data:[0x7e,0x7f,9,1,0xf7]},{deltaTime:960,type:'noteOff',channel:0,noteNumber:60,velocity:0}]]));assert.equal(midReset.notes[0].duration,960);assert.equal(midReset.sysex,undefined);assert.ok(midReset.warnings.some(w=>w.includes('省略')),'途中の未対応設定だけを省略し、ファイル全体は拒否しない');
const masterVolume=fromMidi(midiBytes([[{deltaTime:0,type:'sysEx',data:[127,127,4,1,0,64,247]},...importTracks[1]]]));
assert.deepEqual(compile(serializeMml(masterVolume)).sysex,masterVolume.sysex,'再現できる全体音量は実際のSysExとしてMML/MIDI保存にも保持する');
assert.ok(Math.abs(midiPerformance(masterVolume).values().next().value.states.at(-1).gain-(100/127*8192/16383)**2)<1e-12,'GM Master Volumeをサイトの再生にも反映する');
const ignoredSettings=fromMidi(midiBytes([[{deltaTime:0,type:'sysEx',data:[65,16,66,18,64,1,48,80,63,247]},{deltaTime:0,type:'controller',channel:0,controllerType:91,value:127},{deltaTime:0,type:'controller',channel:0,controllerType:99,value:1},{deltaTime:0,type:'controller',channel:0,controllerType:98,value:32},{deltaTime:0,type:'controller',channel:0,controllerType:6,value:80},...importTracks[1]]]));
assert.equal(ignoredSettings.notes.length,1);assert.equal(ignoredSettings.sysex,undefined);assert.ok(!ignoredSettings.controllers.some(c=>[91,99,98,6].includes(c.number)),'反映できないSysEx・CC・NRPNを保存から除く');assert.ok(ignoredSettings.warnings.length);
assert.deepEqual(musical(compile(serializeMml(ignoredSettings))),musical(ignoredSettings),'設定の省略では音符を落とさない');
const splitSysEx=fromMidi(midiBytes([[{deltaTime:0,type:'sysEx',data:[127,127,4,1]},{deltaTime:240,type:'endSysEx',data:[0,64,247]},...importTracks[1]]]));assert.deepEqual(splitSysEx.sysex,[{tick:240,data:[127,127,4,1,0,64,247]}],'分割された全体音量メッセージも読み込む');
assert.doesNotThrow(()=>compile('ResetXG MasterVolume(64) TR=1 CH=1 @1 c4'));
assert.doesNotThrow(()=>compile('SysEx$=F0,7E,7F,09,01,F7; TR=1 CH=1 @1 c4'));
const workerMessages=[],mmlWorkerContext=createContext({t,currentLanguage,localized,init:async()=>{},SakuraCompiler,prepareMml,fromMidi,serializeMml,self:{postMessage:message=>workerMessages.push(message)}});
runInContext((await readFile(new URL('./dist/mml-worker.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,''),mmlWorkerContext);
async function importWorker(input){workerMessages.length=0;await mmlWorkerContext.self.onmessage({data:input});const result=workerMessages[0];if(result.error)throw Error(result.error);return result.score;}
assert.deepEqual(musical(await importWorker({buffer:importBytes.buffer})),musical(importScore));assert.deepEqual(musical(await importWorker({text:importMml})),musical(importMmlScore));
await assert.rejects(()=>importWorker({buffer:new Uint8Array([0]).buffer}),/Bad MIDI|Unexpected|End of file/i,'文字列をthrowするMIDI解析エラーもWorkerから正しく返す');
const performanceScore={...original,end:3840,notes:[{id:1,part:1,midi:60,tick:0,duration:960,velocity:90}],controllers:[{part:1,tick:480,type:'cc',number:64,value:127},{part:1,tick:2880,type:'cc',number:64,value:0}]};
assert.equal(midiPerformance(performanceScore).get(1).ends.get(1),2880,'サステインで音価を変えず、ペダルを離すまで再生を延ばす');assert.equal(performanceScore.notes[0].duration,960);
const sostenuto={...performanceScore,notes:[...performanceScore.notes,{id:2,part:1,midi:64,tick:960,duration:480,velocity:90}],controllers:[{part:1,tick:480,type:'cc',number:66,value:127},{part:1,tick:1200,type:'cc',number:66,value:127},{part:1,tick:2880,type:'cc',number:66,value:0}]};
const sostenutoEnds=midiPerformance(sostenuto).get(1).ends;assert.equal(sostenutoEnds.get(1),2880);assert.equal(sostenutoEnds.get(2),1440,'ソステヌートを押した後の音を保持しない');
const tuning={...performanceScore,controllers:[[101,0],[100,0],[6,12],[38,50]].map(([number,value])=>({part:1,tick:0,type:'cc',number,value})).concat({part:1,tick:480,type:'pitchBend',value:4096})};
assert.equal(midiPerformance(tuning).get(1).states.at(-1).detune,625,'RPNのベンド幅12半音50セントを反映する');
const cutScore={...performanceScore,parts:[{id:1,program:0,percussion:true}],controllers:[{part:1,tick:1920,type:'cc',number:120,value:0}]};assert.ok(midiPerformance(cutScore).get(1).cuts.has(1),'打楽器もノートオフ後の余韻をAll Sound Offで消す');
console.log('MIDI制御：グローバルCH解析・途中音色・CC往復・ペダル・ソステヌート・RPN・打楽器の強制消音を確認');

// 実際の再生処理を仮想時計で動かし、AudioBufferSourceへ渡す発音時刻を確認する。
const app=await readFile(new URL('./dist/mml-app.js',import.meta.url),'utf8');
const importError={textContent:'',scrolls:0,scrollIntoView(){this.scrolls++;}},errorContext=createContext({t,currentLanguage,localized,$:()=>importError});runInContext(app.slice(app.indexOf('function error('),app.indexOf('function emptyScore(')),errorContext);errorContext.error('読み込みエラー');assert.equal(importError.textContent,'読み込みエラー');assert.equal(importError.scrolls,1,'鍵盤の下までスクロールしなくても読み込みの失敗を確認できる');errorContext.error();assert.equal(importError.scrolls,1);
let sampleBefore;
const sampleErrors=[],sampleMain={inert:false},sampleControls=new Map([['templateMenu',{hidePopover(){}}],['viewport',{focus(){}}]]);
const sampleContext=createContext({t,currentLanguage,localized,catalog:catalog.songs,textEditing:false,worker:null,selected:new Set(),sourceText:null,cursor:0,activePart:1,
  gmNames:{0:'ピアノ',10:'オルゴール',12:'マリンバ',13:'木琴'},$:id=>sampleControls.get(id),document:{querySelector:()=>sampleMain},AbortSignal,
  fetch:async path=>({ok:true,text:()=>readFile(new URL('./dist/'+path,import.meta.url),'utf8')}),
  compile:async({text})=>{const parsed=compile(text);sampleBefore=structuredClone(parsed);return parsed;},
  stop(){},snapshot(){return {};},remember(){},render(){},error(message){if(message)sampleErrors.push(message);},
});
runInContext(app.slice(app.indexOf("$('templateMenu').onclick="),app.indexOf('const menus=')),sampleContext);
for(const version of versions){
  await sampleControls.get('templateMenu').onclick({target:{closest:()=>({dataset:{sample:version.id}})}});
  assert.deepEqual(sampleErrors,[],version.id);const score=sampleContext.score;
  assert.equal(score.parts.length,new Set(sampleBefore.parts.map(p=>`${p.program}:${p.instrumentId}:${!!p.percussion}`)).size,version.id+'は同じ楽器の声部をまとめ、異なる楽器を別タブに保つ');
  const partIds=new Map(sampleBefore.parts.map(p=>[p.id,score.parts.find(s=>s.program===p.program&&s.instrumentId===p.instrumentId&&!!s.percussion===!!p.percussion).id]));
  assert.deepEqual(JSON.parse(JSON.stringify(score.notes)),sampleBefore.notes.map(n=>({...n,part:partIds.get(n.part)})),version.id+'の全音・同音の重なり・発音位置・音長・強さを保持する');
  for(const key of ['ppq','end','tempos','signatures'])assert.deepEqual(JSON.parse(JSON.stringify(score[key])),sampleBefore[key],version.id+'の'+key);
  const restored=compile(serializeMml(score));assert.deepEqual(musical(restored),musical(score),version.id+'は1パートにまとめた後のMML/MIDI往復でも全音を保持する');assert.deepEqual(restored.parts,JSON.parse(JSON.stringify(score.parts)));
}
assert.equal(sampleMain.inert,false);assert.equal(sampleContext.sourceText,null);
console.log(`MML曲選択：全${versions.length}版の楽器別タブ・全音・曲末・テンポ・拍子を保持する`);
const exportOriginal=structuredClone(original),exportProfile=instruments.find(i=>i.id==='musicbox-30');exportOriginal.parts=exportOriginal.parts.map((p,i)=>i?{...p,program:127}:{...p,program:10,instrumentId:'musicbox-30'});const exportMml=serializeMml(exportOriginal);
const exportControls=new Map(['saveMml','saveMidi','saveMenu','copyMml','mmlPanel','mml'].map(id=>[id,{value:exportMml,hidePopover(){},select(){}}])),downloads=[],copied=[],exportErrors=[];
const exportContext=createContext({t,currentLanguage,localized,saveProgress(){},score:structuredClone(exportOriginal),sourceText:exportMml+'// original text\n',textEditing:false,instrument:instruments.find(i=>i.id==='musicbox-30'),partProfiles:new Map(exportOriginal.parts.map(p=>[p.id,exportProfile])),serializeMml,$:id=>exportControls.get(id),error:message=>exportErrors.push(message),render(){},download:(body,name)=>downloads.push({body,name}),navigator:{clipboard:{writeText:async text=>copied.push(text)}},window:{isSecureContext:true},document:{execCommand:()=>{copied.push(exportControls.get('mml').value);return true;}},compile:async input=>{const compiler=SakuraCompiler.new();try{return compiler.compile(prepareMml(input.midiOnly?serializeMml(compile(input.text),{singlePort:true}):input.text));}finally{compiler.free();}}});
runInContext(app.slice(app.indexOf('function attempt('),app.indexOf('function snapshot('))+app.slice(app.indexOf('function source('),app.indexOf('function renderNotes('))+app.slice(app.indexOf("$('saveMml').onclick="),app.indexOf("$('editMml').onclick=")),exportContext);
exportContext.defs={instruments};
assert.equal(exportContext.profileFor({program:0,instrumentId:'piano-61'}).id,'piano-61');
assert.equal(exportContext.profileFor({program:13}).id,'vsco-xylophone-concert','GM木琴の既定はコンサート用');
assert.equal(exportContext.profileFor({program:13,instrumentId:'xylophone-32'}).id,'xylophone-32','明示した32鍵の実機設定は保持する');
assert.equal(exportContext.profileFor({program:0,percussion:true}).id,'vsco-percussion','打楽器をGM0のピアノへ置き換えない');
assert.equal(exportContext.profileFor({program:0,percussion:true,instrumentId:'piano-61'}).id,'vsco-percussion');
assert.equal(exportContext.profileFor({program:12,instrumentId:'piano-61'}).id,'marimba-61','手書きで音色を変えた場合は対応する実機の音域を使う');
assert.equal(exportContext.profileFor({program:0,instrumentId:'unknown-profile'}),undefined,'不明な実機を別の音域へ置き換えない');
assert.equal(exportContext.profileFor({program:127}).gmProgram,127,'追加したGM128番も正しい音源へ対応する');
for(const profile of instruments){
  const expected=instruments.find(i=>i.gmProgram===profile.gmProgram&&!!i.percussion===!!profile.percussion);
  assert.equal(exportContext.profileFor({program:profile.gmProgram,...(profile.percussion?{percussion:true}:{})}).id,expected.id,profile.id+'は持ち込みGM楽譜に実機タグがなくても追加音源へ対応する');
}
let finishDrop;
const dropEditor={},dropControls=new Map([['load',{}],['file',{value:'',click(){}}]]),dropHistory=[],dropErrors=[];
const dropContext=createContext({t,currentLanguage,localized,score:structuredClone(original),textEditing:false,selected:new Set([1]),cursor:960,activePart:1,sourceText:null,
  $:id=>dropControls.get(id),document:{querySelector:()=>dropEditor},compile:importWorker,stop(){},snapshot:()=>({score:structuredClone(dropContext.score)}),remember:before=>dropHistory.push(before),
  render(){finishDrop?.();},error(message){if(message){dropErrors.push(message);finishDrop?.();}},
});
runInContext(app.slice(app.indexOf('async function loadFile('),app.indexOf("$('newScore').onclick=")),dropContext);
async function dropFile(file){let prevented=false;const done=new Promise(resolve=>{finishDrop=resolve;});dropEditor.ondrop({preventDefault(){prevented=true;},dataTransfer:{types:['Files'],files:[file]}});await done;finishDrop=null;assert.ok(prevented);}
await dropFile({name:'ensemble.mid',size:importBytes.length,arrayBuffer:async()=>importBytes.buffer});
assert.deepEqual(dropErrors,[]);
assert.deepEqual(musical(dropContext.score),musical(importScore));assert.deepEqual(dropContext.score.parts,importScore.parts);assert.equal(dropContext.sourceText,null);assert.equal(dropContext.cursor,0);assert.equal(dropContext.selected.size,0);
await dropFile({name:'ensemble.mml',size:importMml.length,text:async()=>importMml});
assert.deepEqual(musical(dropContext.score),musical(importMmlScore));assert.equal(dropContext.sourceText,importMml,'持ち込みMMLの原文を保持する');assert.equal(dropContext.score.parts.length,4,'同じ楽器の外部パートも別々に保持する');
const beforeBadDrop=JSON.stringify(dropContext.score);await dropFile({name:'bad.mid',size:1,arrayBuffer:async()=>new Uint8Array([0]).buffer});
assert.equal(JSON.stringify(dropContext.score),beforeBadDrop,'読み込みエラーで編集中の楽譜を失わない');assert.equal(dropHistory.length,2);assert.equal(dropErrors.length,1);
console.log('GMファイル読込：MIDI/MMLのドロップ・元のパート順・追加音源の選択・同じ楽器のパート分け・エラー時の編集保持を確認');
const beforeExport=JSON.stringify(exportContext.score);assert.ok(original.notes.some(n=>!exportContext.instrument.allowed.has(n.midi)));
exportControls.get('saveMml').onclick();await exportControls.get('saveMidi').onclick();await exportControls.get('copyMml').onclick({preventDefault(){}});
for(const result of [compile(downloads[0].body),fromMidi(downloads[1].body),compile(copied[0])]){
  assert.deepEqual(musical(result),musical(exportOriginal),'MML・MIDI・コピーは未対応の楽器と音域外も含め全音符の位置・音長・強さ・パートを保つ');assert.deepEqual(result.parts,exportOriginal.parts,'未対応のGM番号も保存する');
  assert.equal(result.end,original.end,'曲末休符を保つ');assert.deepEqual(result.signatures,original.signatures);
  assert.ok(Math.abs(secondsAt(result,result.end)-secondsAt(original,original.end))<.00002,'テンポを保つ');
}
assert.equal(downloads[0].body,exportContext.sourceText,'未対応音があっても元のMMLとコメントをそのまま保存する');
assert.equal(JSON.stringify(exportContext.score),beforeExport);assert.equal(exportContext.sourceText,exportMml+'// original text\n','書き出しても編集用の音域外ノートと元のMMLを消さない');
exportContext.window.isSecureContext=false;await exportControls.get('copyMml').onclick({preventDefault(){}});
assert.deepEqual(musical(compile(copied.at(-1))),musical(exportOriginal),'LAN環境のコピーも未対応の楽器と音域外の音を残す');assert.equal(exportControls.get('mml').value,exportMml,'コピー後も編集用MMLを保持する');
exportContext.document.execCommand=()=>false;await exportControls.get('copyMml').onclick({preventDefault(){}});assert.equal(exportControls.get('mml').value,exportMml,'コピー失敗でも編集用MMLを保持する');
exportContext.sourceText=null;exportContext.score.notes=[{...original.notes[0],midi:21}];
const silentExport=compile(exportContext.exportSource());assert.equal(silentExport.notes.length,1);assert.equal(silentExport.notes[0].midi,21);assert.equal(silentExport.end,original.end,'全音が無音でも音符と曲の長さを保存する');
exportContext.score=structuredClone(original);exportContext.score.parts[0]={...exportContext.score.parts[0],program:10,instrumentId:'musicbox-30'};exportContext.score.parts[1]={...exportContext.score.parts[1],program:0,instrumentId:'piano-88'};
exportContext.score.notes.push({...original.notes[0],id:999,midi:21});exportContext.sourceText=serializeMml(exportContext.score);
exportContext.partProfiles=new Map([[1,exportProfile],[2,instruments.find(i=>i.id==='piano-88')]]);
const mixedExport=compile(exportContext.exportSource());assert.deepEqual(musical(mixedExport),musical(exportContext.score),'異なる実機音域が混在しても全音を保存する');assert.deepEqual(mixedExport.parts,exportContext.score.parts,'混合音色・実機設定を書き出しでも保持する');
exportContext.partProfiles.set(2,undefined);exportContext.score.parts[1].program=127;delete exportContext.score.parts[1].instrumentId;exportContext.sourceText=null;
const unknownExport=compile(exportContext.exportSource());assert.deepEqual(musical(unknownExport),musical(exportContext.score));assert.equal(unknownExport.parts[1].program,127,'ノート編集後も未対応音色を削除・置換しない');
const unhandledMml='TimeBase(960) SysEx=240,65,16,66,18,64,1,48,80,63,247; CC(91,127) CH=1 @1 q100 c4';exportContext.score=compile(unhandledMml);exportContext.sourceText=unhandledMml;
const cleanedMml=exportContext.exportSource();assert.notEqual(cleanedMml,unhandledMml);assert.ok(!cleanedMml.includes('SysEx')&&!cleanedMml.includes('CC(91'),'元のMMLを保持していても書き出しでは未対応設定を戻さない');assert.deepEqual(musical(compile(cleanedMml)),musical(exportContext.score),'未対応設定だけを省略して全音符を保存する');
exportContext.textEditing=true;assert.throws(()=>exportContext.exportSource(),/適用/,'未適用のMMLから不正確な出力を作らない');
console.log('MML書き出し：未対応音色・音域外を含む全音符とGM番号・原文・時刻と音長と曲末をMML/MIDI/コピーで保持する');
const wheelHandlers=new Map(),wheelViewport={scrollLeft:0,clientWidth:500,addEventListener(type,handler){wheelHandlers.set('viewport',handler);}},wheelTabs={scrollLeft:0,clientWidth:200,addEventListener(type,handler){wheelHandlers.set('partTabs',handler);}};
runInContext(app.slice(app.indexOf("for(const id of ['viewport','partTabs'])"),app.indexOf('let scrollFrame=')),createContext({t,currentLanguage,localized,$:id=>id==='viewport'?wheelViewport:wheelTabs,ROW:20,KEY:84}));
function wheel(options={},id='viewport'){let prevented=false;wheelHandlers.get(id)({deltaX:0,deltaY:120,deltaMode:0,target:{closest:()=>({})},preventDefault(){prevented=true;},...options});return prevented;}
assert.ok(wheel());assert.equal(wheelViewport.scrollLeft,120,'青い行の縦ホイールを横スクロールへ変換する');
wheel({deltaY:3,deltaMode:1});assert.equal(wheelViewport.scrollLeft,180,'行単位のホイールをピクセルに換算する');
wheel({deltaY:1,deltaMode:2});assert.equal(wheelViewport.scrollLeft,596,'ページ単位のホイールは鍵盤を除いた横幅で進む');
wheel({deltaX:-50,deltaY:0});assert.equal(wheelViewport.scrollLeft,546,'横ホイールの向きと量を保つ');
wheel({deltaX:40,deltaY:5});assert.equal(wheelViewport.scrollLeft,586,'斜めの入力でスクロール量を二重加算しない');
for(const options of [{ctrlKey:true},{metaKey:true},{target:{closest:()=>null}},{deltaY:0}])assert.equal(wheel(options),false);
assert.equal(wheelViewport.scrollLeft,586,'ブラウザの拡大操作と青い行以外のスクロールを変えない');
assert.ok(wheel({target:{closest:()=>null}},'partTabs'));assert.equal(wheelTabs.scrollLeft,120,'楽器タブ上の縦ホイールでタブ列だけを横スクロールする');
wheel({deltaY:3,deltaMode:1},'partTabs');assert.equal(wheelTabs.scrollLeft,180);wheel({deltaY:1,deltaMode:2},'partTabs');assert.equal(wheelTabs.scrollLeft,380,'タブ列のページ単位は鍵盤幅を引かない');
wheel({deltaX:-50,deltaY:0},'partTabs');assert.equal(wheelTabs.scrollLeft,330);assert.equal(wheelViewport.scrollLeft,586,'タブ列のスクロールで楽譜を動かさない');
assert.equal(wheel({ctrlKey:true},'partTabs'),false);assert.equal(wheel({metaKey:true},'partTabs'),false);assert.equal(wheelTabs.scrollLeft,330);
console.log('MMLホイール：青い行の横スクロール・入力単位・横方向の維持・拡大操作と通常スクロールの保持を確認');
const markerControls=new Map(['markerLane','markerMenu','markerCell','markerPosition','markerForm','tempoBpm','signatureNumerator','signatureDenominator','removeTempo','removeSignature'].map(id=>[id,{value:'',style:{},reportValidity:()=>true,showPopover(){this.open=true;},getBoundingClientRect:()=>({left:100})}]));
const markerHistory=[],markerContext=createContext({t,currentLanguage,localized,score:structuredClone(original),markerTick:0,cursor:0,textEditing:false,sourceText:null,px:120,$:id=>markerControls.get(id),gridTicks:()=>240,x:tick=>tick/960*120,labelPosition:tick=>String(tick),scorePosition,editable:()=>true,stop(){},error(){},render(){},renderCursor(){},positionMenus(){},validateScore,snapshot:()=>({score:structuredClone(markerContext.score)}),remember:before=>markerHistory.push(before),restore:before=>{markerContext.score=before.score;}});
runInContext(app.slice(app.indexOf('function change('),app.indexOf('function restore('))+app.slice(app.indexOf('function renderMarkerMenu('),app.indexOf("$('noteStart').onchange")),markerContext);
const markerClick=(clientX,target=null)=>markerControls.get('markerLane').onclick({clientX,target:{closest:()=>target}});
markerClick(285);assert.equal(markerContext.markerTick,1440,'空白のシングルクリックは音符と同じく枠の左端を選ぶ');
assert.equal(markerContext.cursor,1440,'拍子・テンポのマスを開いた位置を再生開始位置にする');
assert.ok(markerControls.get('markerMenu').open);assert.equal(markerHistory.length,0,'編集メニューを開くだけで変更を追加しない');
assert.equal(markerControls.get('tempoBpm').value,120);assert.equal(markerControls.get('signatureNumerator').value,4);
markerControls.get('tempoBpm').value='105';markerControls.get('tempoBpm').onchange();
assert.equal(markerContext.score.tempos.find(t=>t.tick===1440).bpm,105);assert.equal(markerContext.score.signatures.length,1,'テンポだけの編集では拍子を追加しない');
markerControls.get('signatureNumerator').value='3';markerControls.get('signatureNumerator').onchange();
assert.deepEqual(JSON.parse(JSON.stringify(markerContext.score.signatures)),[{tick:0,signature:[4,4]},{tick:1440,signature:[3,4]}]);
assert.deepEqual(musical(markerContext.score),musical(original),'拍子・テンポの編集で音符を動かさない');
markerControls.get('removeTempo').onclick();assert.ok(!markerContext.score.tempos.some(t=>t.tick===1440));assert.ok(markerContext.score.signatures.some(s=>s.tick===1440),'テンポの削除で同じ位置の拍子を削除しない');
markerControls.get('removeSignature').onclick();assert.equal(markerContext.score.signatures.length,1);
markerClick(287,{dataset:{tick:'7680'}});assert.equal(markerContext.markerTick,7680,'既存マーカーはグリッドへ丸めず元の位置を編集する');assert.equal(markerControls.get('tempoBpm').value,90);
assert.equal(markerContext.cursor,7680,'既存のテンポ・拍子変更を押すとその位置へ移る');
markerContext.openMarker(0);assert.ok(markerControls.get('removeTempo').hidden&&markerControls.get('removeSignature').hidden);
const beforeStart=JSON.stringify(markerContext.score);markerControls.get('removeTempo').onclick();markerControls.get('removeSignature').onclick();assert.equal(JSON.stringify(markerContext.score),beforeStart,'曲頭の拍子・テンポは削除できない');
assert.ok(markerHistory.length>=4);assert.deepEqual(musical(markerHistory[0].score),musical(original),'変更前を取り消し履歴へ残す');
markerContext.score.tempos[0].bpm=88.000023;markerContext.openMarker(0);assert.equal(markerControls.get('tempoBpm').value,88);assert.equal(markerContext.score.tempos[0].bpm,88.000023,'テンポの表示を短くしても開くだけでは精度を変えない');
markerControls.get('markerMenu').open=false;markerContext.sourceText='original MML';markerClick(285);assert.equal(markerContext.cursor,1440);assert.equal(markerControls.get('markerMenu').open,false,'元MMLを保持する表示でも再生位置は選べるが、変更メニューは開かない');
markerContext.textEditing=true;markerClick(300);assert.equal(markerContext.cursor,1440,'MMLテキスト編集中は再生位置を変更しない');
console.log('MMLマーカー：1行のシングルクリック編集・枠への配置・独立した変更/削除・曲頭の保持・音符の保持を確認');
// 実際のキー処理で、メニュー・入力・ドラッグ中に背後の音符を編集しないことを確認する。
let keyHandler;
const keyContext=createContext({t,currentLanguage,localized,
  score:structuredClone(original),activePart:1,selected:new Set(original.notes.filter(n=>n.part===1).map(n=>n.id)),cursor:0,clipboard:null,
  worker:null,gesture:null,textEditing:false,menuOpen:false,
  document:{addEventListener(type,handler){keyHandler=handler;},querySelector:()=>keyContext.menuOpen},
  $:()=>({}),change(fn){fn();validateScore(keyContext.score);},renderNotes(){},renderProperties(){},
  gridTicks:()=>240,moveNotes,
  chosen:()=>keyContext.score.notes.filter(n=>n.part===keyContext.activePart&&keyContext.selected.has(n.id)),nextId:()=>Math.max(0,...keyContext.score.notes.map(n=>n.id))+1,
});
runInContext(app.slice(app.indexOf('function removeNotes('),app.indexOf('function getAudio(')),keyContext);
function press(key,options={}){keyHandler({key,code:key===' '?'Space':key,target:{closest:()=>null},preventDefault(){},...options});}
for(const state of [{menuOpen:true},{textEditing:true},{gesture:{pointer:1}}]){
  Object.assign(keyContext,state);press('Delete');press('ArrowUp');press('a',{ctrlKey:true});
  assert.deepEqual(musical(keyContext.score),musical(original),'他の操作中に背後の音符を変更しない');
  for(const key of Object.keys(state))keyContext[key]=key==='gesture'?null:false;
}
for(const options of [{isComposing:true},{target:{closest:()=>({})}},{altKey:true},{ctrlKey:true}]){
  press('ArrowUp',options);assert.deepEqual(musical(keyContext.score),musical(original),'入力欄・IME・別の修飾キーは音符移動へ流さない');
}
press('ArrowUp');press('ArrowDown',{shiftKey:true});
assert.deepEqual(musical(keyContext.score),musical({...original,notes:original.notes.map(n=>({...n,midi:n.midi-(n.part===1?11:0)}))}));
press('Delete');assert.deepEqual(musical(keyContext.score),musical({...original,notes:original.notes.filter(n=>n.part!==1)}),'選択パートだけを削除し、他パートを残す');
keyContext.score=structuredClone(original);press('a',{ctrlKey:true});press('c',{ctrlKey:true});press('v',{ctrlKey:true});
assert.deepEqual(musical(keyContext.score),musical({...original,notes:[...original.notes,...original.notes.filter(n=>n.part===1)]}),'選択パートの全音だけをコピーする');const beforePaste=keyContext.score.notes.length;keyContext.activePart=2;press('v',{ctrlKey:true});assert.ok(keyContext.score.notes.slice(beforePaste).every(n=>n.part===2),'別パートへの貼り付けは入力先に所属させる');
console.log('MML操作：メニュー・文字入力・IME・ドラッグと楽譜ショートカットの競合を確認');
const partControls=new Map([['partTabs',{}],...original.parts.map(p=>[`part-${p.id}`,{title:`Part ${p.id}`,focus(){}}])]),partPrompts=[],partHistory=[];let approvePart=false;
const partContext=createContext({t:(key,values)=>JSON.stringify({key,...values}),currentLanguage,localized,score:structuredClone(original),activePart:1,selected:new Set([1]),textEditing:false,sourceText:null,$:id=>partControls.get(id),window:{confirm(message){partPrompts.push(message);return approvePart;}},editable:()=>!partContext.textEditing&&partContext.sourceText===null,change(fn){partHistory.push(structuredClone(partContext.score));fn();validateScore(partContext.score);},endGesture(){},endKeyGesture(){},render(){}});
runInContext(app.slice(app.indexOf('function selectPart('),app.indexOf("$('instrument').onchange=")),partContext);
partControls.get('partTabs').onclick({target:{closest:selector=>selector==='[role=tab]'?{dataset:{part:'2'}}:null}});
assert.equal(partContext.activePart,2);assert.equal(partContext.selected.size,0);assert.deepEqual(musical(partContext.score),musical(original),'タブ切り替えは音符を変更しない');
for(const [key,id] of [['ArrowRight',1],['ArrowLeft',2],['Home',1],['End',2]]){let prevented=false,stopped=false;partControls.get('partTabs').onkeydown({key,preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});assert.equal(partContext.activePart,id);assert.ok(prevented&&stopped,'タブの矢印操作を音符の移動へ流さない');}
partContext.textEditing=true;partControls.get('partTabs').onkeydown({key:'Home'});assert.equal(partContext.activePart,2,'MML編集中はタブを切り替えない');
partContext.textEditing=false;partContext.activePart=1;partContext.selected=new Set([1]);partContext.score.controllers=[{part:1,tick:0,type:'cc',number:7,value:90},{part:2,tick:0,type:'cc',number:10,value:30}];
const closePart=id=>partControls.get('partTabs').onclick({target:{closest:selector=>selector==='[data-delete-part]'?{dataset:{deletePart:String(id)}}:null}}),beforePartDelete=JSON.stringify(partContext.score);
closePart(2);assert.equal(JSON.stringify(partContext.score),beforePartDelete,'削除確認のキャンセルでは音符・制御データを変更しない');assert.equal(partHistory.length,0);assert.equal(partContext.activePart,1);assert.ok(partPrompts.at(-1).includes('Part 2'));
approvePart=true;closePart(2);assert.equal(partContext.score.parts.length,1);assert.ok(partContext.score.notes.every(n=>n.part===1));assert.ok(partContext.score.controllers.every(c=>c.part===1));assert.equal(partContext.activePart,1);assert.ok(partContext.selected.has(1),'別パートの削除では現在の選択を保つ');
const promptCount=partPrompts.length;closePart(1);assert.equal(partPrompts.length,promptCount,'最後のパートは削除確認を出さず残す');
partContext.score=structuredClone(original);partContext.score.parts.push({id:3,name:'Part 3',program:0});partControls.set('part-3',{title:'Part 3',focus(){}});partContext.activePart=2;closePart(2);assert.equal(partContext.activePart,3,'選択中のパートを削除したら隣を選ぶ');assert.equal(partContext.selected.size,0);
partContext.sourceText='original MML';const readonlyParts=JSON.stringify(partContext.score);closePart(1);assert.equal(JSON.stringify(partContext.score),readonlyParts,'元MMLを保持するモードでは削除しない');

const pointerControls=new Map(['viewport','noteArea','selectionBox'].map(id=>[id,{scrollLeft:0,scrollTop:0,style:{},focus(){},setPointerCapture(){},releasePointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,right:500,bottom:500})}]));
const pointerContext=createContext({t,currentLanguage,localized,
  score:structuredClone(original),activePart:2,selected:new Set(),gesture:null,px:96,HIGH:108,LOW:21,ROW:20,KEY:72,
  $:id=>pointerControls.get(id),snapshot:()=>({score:structuredClone(pointerContext.score)}),editable:()=>true,stop(){},error(){},
  render(){},renderNotes(){},renderProperties(){},remember(){},validateScore,moveNotes,resizeNotes,
  requestAnimationFrame:()=>1,cancelAnimationFrame(){},
});
runInContext(app.slice(app.indexOf('function gridTicks('),app.indexOf('function labelPosition('))+app.slice(app.indexOf('function beginNote('),app.indexOf("$('noteArea').addEventListener('pointerdown'")),pointerContext);
pointerControls.set('grid',{value:'.25'});
const touchNote=original.notes.find(n=>n.part===2),touch={button:0,isPrimary:true,pointerType:'touch',pointerId:1,clientX:4,clientY:(108-touchNote.midi)*20+10,preventDefault(){},target:{closest:selector=>selector==='.midi-note'?{dataset:{id:String(touchNote.id)}}:null}};
const pointerHistory=[];pointerContext.remember=before=>pointerHistory.push(before);
for(const pointerType of ['mouse','touch']){
  const event={...touch,pointerType};pointerContext.score=structuredClone(original);pointerContext.selected=new Set(original.notes.filter(n=>n.part===2).map(n=>n.id));
  pointerContext.beginNote(event);pointerContext.updateGesture({...event,clientX:6,clientY:touch.clientY+1});pointerContext.endGesture();
  if(pointerType==='touch'){
    assert.deepEqual(musical(pointerContext.score),musical({...original,notes:original.notes.filter(n=>n.id!==touchNote.id)}),'タップは押した音だけを削除する');
    assert.deepEqual(musical(pointerHistory.at(-1).score),musical(original),'削除前を取り消し履歴に残す');
  }else{
    assert.deepEqual(musical(pointerContext.score),musical(original),'マウスクリックは音符を削除しない');assert.ok(pointerContext.selected.has(touchNote.id));assert.equal(pointerHistory.length,0,'選択だけでは編集履歴を増やさない');
    for(const key of ['Backspace','Delete']){keyContext.score=structuredClone(pointerContext.score);keyContext.activePart=2;keyContext.selected=new Set(pointerContext.selected);press(key);assert.deepEqual(musical(keyContext.score),musical({...original,notes:original.notes.filter(n=>!pointerContext.selected.has(n.id))}),key+'で選択音だけを削除する');}
  }
  pointerContext.score=structuredClone(original);pointerContext.selected.clear();pointerContext.beginNote(event);pointerContext.endGesture(true);
  assert.deepEqual(musical(pointerContext.score),musical(original),'操作中断では本体の音を削除しない');
  const handle={...event,target:{closest:selector=>selector==='.midi-note'?{dataset:{id:String(touchNote.id)}}:selector==='.handle'?{}:null}};
  pointerContext.beginNote(handle);pointerContext.endGesture();assert.deepEqual(musical(pointerContext.score),musical(original),'ハンドルのクリック・タップでは削除しない');
  pointerContext.beginNote(handle);pointerContext.updateGesture({...handle,clientX:28});pointerContext.endGesture();
  assert.equal(pointerContext.score.notes.length,original.notes.length);assert.equal(pointerContext.score.notes.find(n=>n.id===touchNote.id).duration,960,'ハンドルをドラッグして音長を変更できる');
  pointerContext.score=structuredClone(original);pointerContext.selected.clear();pointerContext.beginNote(event);pointerContext.updateGesture({...event,clientX:100,clientY:touch.clientY-20});pointerContext.endGesture();
  assert.deepEqual(musical(pointerContext.score),musical({...original,notes:moveNotes(original.notes,new Set([touchNote.id]),960,1,original.end)}),'本体ドラッグは削除せず移動する');
  pointerContext.score=structuredClone(original);pointerContext.selected.clear();pointerContext.beginNote({...event,shiftKey:true});
  assert.equal(pointerContext.gesture,null);assert.ok(pointerContext.selected.has(touchNote.id));assert.deepEqual(musical(pointerContext.score),musical(original),'Shift併用は選択だけを変更する');
}
const blank={...touch,clientX:400,clientY:10,target:{closest:()=>null}};
for(const pointerType of ['mouse','touch']){
  pointerContext.score=structuredClone(original);pointerContext.selected.clear();
  const event={...blank,pointerType};pointerContext.beginNote(event);pointerContext.autoScroll();
  assert.equal(pointerControls.get('viewport').scrollTop,0,'端を触っただけではスクロールしない');
  assert.deepEqual(musical(pointerContext.score),musical(original),'押した時点では音を追加しない');
  pointerContext.updateGesture({...event,clientX:402,clientY:11});pointerContext.endGesture();
  assert.equal(pointerContext.score.notes.length,original.notes.length+1,'空白のクリック・タップで1音を配置する');
  const added=pointerContext.score.notes.at(-1);assert.equal(added.tick,3840);assert.equal(added.duration,240);assert.equal(added.midi,108);
  pointerContext.score=structuredClone(original);pointerContext.beginNote(event);pointerContext.endGesture(true);
  assert.deepEqual(musical(pointerContext.score),musical(original),'中断された入力では音を追加しない');
}
const boxStart={...blank,pointerType:'mouse',clientX:0,clientY:(108-touchNote.midi)*20-1};
pointerContext.selected.clear();pointerContext.beginNote(boxStart);pointerContext.updateGesture({...boxStart,clientX:100,clientY:boxStart.clientY+21});pointerContext.endGesture();
assert.ok(pointerContext.selected.has(touchNote.id),'空白ドラッグで伴奏も範囲選択できる');assert.deepEqual(musical(pointerContext.score),musical(original),'範囲選択で音を追加しない');
const outside=original.notes.find(n=>n.part===2&&!pointerContext.selected.has(n.id));assert.ok(outside);
pointerContext.selected=new Set([outside.id]);pointerContext.beginNote({...boxStart,shiftKey:true});pointerContext.updateGesture({...boxStart,shiftKey:true,clientX:100,clientY:boxStart.clientY+21});pointerContext.endGesture();
assert.ok(pointerContext.selected.has(outside.id)&&pointerContext.selected.has(touchNote.id),'Shift併用の範囲選択は既存の選択を保持する');
const group=new Set(pointerContext.selected);pointerContext.beginNote({...touch,pointerType:'mouse'});pointerContext.updateGesture({...touch,pointerType:'mouse',clientX:100,clientY:touch.clientY-20});pointerContext.endGesture();
assert.deepEqual(musical(pointerContext.score),musical({...original,notes:moveNotes(original.notes,group,960,1,original.end)}),'範囲選択した音をまとめてドラッグできる');
pointerContext.score=structuredClone(original);pointerContext.selected.clear();pointerContext.beginNote(blank);pointerContext.updateGesture({...blank,clientX:420,clientY:40});pointerContext.autoScroll();pointerContext.endGesture();
assert.equal(pointerContext.selected.size,0);assert.equal(pointerControls.get('viewport').scrollTop,0);assert.deepEqual(musical(pointerContext.score),musical(original),'スマホの空白スワイプは配置・選択・自動スクロールしない');
const referenceNote=original.notes.find(n=>n.part===1);pointerContext.beginNote({...touch,target:{closest:selector=>selector==='.midi-note'?{dataset:{id:String(referenceNote.id)}}:null}});assert.equal(pointerContext.gesture,null);assert.deepEqual(musical(pointerContext.score),musical(original),'参考表示の他パートの音を編集しない');
console.log('MMLポインター操作：モードなしの配置・削除・範囲選択・移動・伸縮・タッチのスクロール競合を確認');
function keyboardPreview(load=async midi=>({midi})){
  const handlers=new Map(),played=[],keyboard={setPointerCapture(){},releasePointerCapture(){},addEventListener(type,fn){handlers.set(type,fn);}};
  let hovered;
  const key=midi=>({dataset:{midi:String(midi)},focus(){},closest(){return this;}});
  const context=createContext({t,currentLanguage,localized,$:()=>keyboard,keyGesture:null,playEpoch:0,instrument:{allowed:new Set([67,69,71,72]),defaultSoundset:'piano',arrangedFor:'piano88'},defs:{soundsets:[{id:'piano'}]},getAudio:()=>({currentTime:1,resume:async()=>{}}),loadBuffer:load,voice:buffer=>played.push(buffer.midi),error(message){throw Error(message);},document:{elementFromPoint:()=>hovered},window:{addEventListener(type,fn){handlers.set(type,fn);}}});
  runInContext(app.slice(app.indexOf('async function previewKey('),app.indexOf("document.addEventListener('visibilitychange'")),context);
  const event=(midi,options={})=>({button:0,isPrimary:true,pointerId:1,pointerType:'mouse',target:key(midi),preventDefault(){},...options});
  return {context,keyboard,played,handlers,event,down(midi,options={}){keyboard.onpointerdown(event(midi,options));return context.keyGesture;},move(midi,options={}){hovered=midi===null?null:key(midi);keyboard.onpointermove(event(midi,options));}};
}
for(const pointerType of ['mouse','touch']){
  const k=keyboardPreview(),g=k.down(72,{pointerType});await g.queue;assert.deepEqual(k.played,[72]);
  k.move(72,{pointerType});await g.queue;assert.deepEqual(k.played,[72],'同じ鍵盤上では連打しない');
  k.move(69,{pointerType});await g.queue;assert.deepEqual(k.played,[72,71,69],'速いドラッグも間の対応音を順に鳴らす');
  k.move(72,{pointerType});await g.queue;assert.deepEqual(k.played,[72,71,69,71,72],'戻る方向へなぞっても間のキーを鳴らす');
  k.move(null,{pointerType});k.move(67,{pointerType});await g.queue;assert.equal(k.played.at(-1),67);
  k.keyboard.onpointerup(k.event(67,{pointerType}));k.keyboard.onclick({...k.event(67),detail:1});assert.equal(k.played.length,6,'離したときのクリックで重ねて鳴らさない');
  k.move(69,{pointerType});assert.equal(k.played.length,6,'押していない移動では音を鳴らさない');
  k.keyboard.onclick({...k.event(69),detail:0});await k.context.keyGesture.queue;assert.equal(k.played.at(-1),69,'Enter/Spaceのクリックでも試聴できる');
}
for(const finish of ['up','pointercancel','lostpointercapture','blur','epoch']){
  let release,started;const loading=new Promise(resolve=>{started=resolve;});
  const k=keyboardPreview(()=>new Promise(resolve=>{release=resolve;started();})),g=k.down(72);
  await loading;k.move(69);
  if(finish==='up')k.keyboard.onpointerup(k.event(69));
  else if(finish==='epoch')k.context.playEpoch++;
  else k.handlers.get(finish)(k.event(69));
  release({midi:72});await g.queue;assert.deepEqual(k.played,[],finish+'後に読み込みが完了してもドラッグの音を遅れて鳴らさない');
}
let releaseTap,tapStarted;const tapLoading=new Promise(resolve=>{tapStarted=resolve;});
const tap=keyboardPreview(()=>new Promise(resolve=>{releaseTap=resolve;tapStarted();})),tapSession=tap.down(72);
await tapLoading;tap.keyboard.onpointerup(tap.event(72));releaseTap({midi:72});await tapSession.queue;assert.deepEqual(tap.played,[72],'初回の単音クリックは離してから読み込めても一度だけ鳴る');
const ignored=keyboardPreview();ignored.down(72,{button:2});ignored.down(72,{isPrimary:false});assert.equal(ignored.context.keyGesture,null,'右ボタンや別の指で試聴を始めない');
console.log('MML鍵盤：マウス/タッチの連続試聴・中間キー・対応音・単音クリック・キー操作・非同期読み込みと中断を確認');
const playback=app.slice(app.indexOf('function voice('),app.indexOf("$('keyboard').onclick="));
function player(looping,cursor){
  const controls=new Map(['play','stop','loop'].map(id=>[id,{'aria-pressed':id==='loop'?String(looping):'false',getAttribute(name){return this[name];},setAttribute(name,value){this[name]=value;}}])),events=[],buffers=new Map();
  controls.set('viewport',{scrollLeft:0,scrollTop:240,clientWidth:260});controls.set('playhead',{style:{}});controls.set('position',{});
  let timer,frame;
  const param=()=>({events:[],setValueAtTime(value,time){this.events.push({type:'set',value,time});},linearRampToValueAtTime(value,time){this.events.push({type:'ramp',value,time});},cancelScheduledValues(time){for(let i=this.events.length-1;i>=0;i--)if(this.events[i].time>=time)this.events.splice(i,1);}});
  const audio={currentTime:10,resume:async()=>{},destination:{},createGain(){const gain=param();return {envelope:gain.events,gain,connect(target){this.target=target;},disconnect(){}};},createStereoPanner(){return {pan:param(),connect(){},disconnect(){}};},createOscillator(){return {frequency:{},connect(){},start(){},stop(){},disconnect(){}};},createBufferSource(){return {detune:param(),connect(gain){this.gain=gain;},disconnect(){},start(time){this.event={midi:this.buffer.midi,soundId:this.buffer.soundId,time,stop:Infinity,loop:this.loop,loopStart:this.loopStart,loopEnd:this.loopEnd,envelope:this.gain.envelope,volume:this.gain.target?.gain?.events,volumeChannels:this.gain.target?.channelCount,pan:this.gain.target?.target?.pan?.events,detune:this.detune.events};events.push(this.event);},stop(time=audio.currentTime){this.event.stop=time;}};}};
  const score={...demoScore(),end:3840,tempos:[{tick:0,bpm:120},{tick:1920,bpm:60}],notes:[{id:1,midi:60,tick:0,duration:3840,velocity:90,part:1},{id:2,midi:62,tick:960,duration:960,velocity:90,part:2},{id:3,midi:64,tick:2880,duration:960,velocity:90,part:1}]};
  const profile={allowed:new Set([60,62,64]),defaultSoundset:'vsco-piano',arrangedFor:'piano88'};
  const context=createContext({t,currentLanguage,localized,$:id=>controls.get(id),getAudio:()=>audio,score,cursor,playing:null,paused:false,playEpoch:0,keyGesture:null,textEditing:false,voices:new Map(),buffers,KEY:84,x:tick=>tick/score.ppq*96,labelPosition:tick=>String(tick),instrument:profile,partProfiles:new Map(score.parts.map(p=>[p.id,profile])),defs:{soundsets:[{id:'vsco-piano'},{id:'vsco-marimba'}]},loadBuffer:async(midi,sound)=>buffers.set(sound.id+':'+midi,{midi,soundId:sound.id,duration:4,numberOfChannels:2}),secondsAt,tickAt,midiPerformance,noteName,error(message){if(message)throw Error(message);},setInterval(fn){timer=fn;return 1;},clearInterval(){timer=null;},requestAnimationFrame(fn){frame=fn;return 1;},cancelAnimationFrame(){frame=null;}});
  runInContext(app.slice(app.indexOf('function renderCursor('),app.indexOf('function renderProperties('))+playback,context);
  return {context,controls,events,audio,play:()=>runInContext('play()',context),advance(to){while(audio.currentTime<to){audio.currentTime=Math.min(to,audio.currentTime+.025);timer?.();frame?.();}}};
}
for(const looping of [false,true]){
  const p=player(looping,0),history=[];
  Object.assign(p.context,{clone:structuredClone,validateScore,sourceText:null,activePart:1,selected:new Set(),history,future:[],render(){p.context.partProfiles=new Map(p.context.score.parts.map(part=>[part.id,instruments.find(i=>i.id===part.instrumentId)??p.context.instrument]));}});
  for(const id of ['instrument','partRange'])p.controls.set(id,{value:id==='instrument'?'12':'marimba-61'});
  p.context.defs.instruments=instruments;
  runInContext(app.slice(app.indexOf('function snapshot('),app.indexOf('function gridTicks('))+app.slice(app.indexOf("$('instrument').onchange="),app.indexOf("$('partName').onchange=")),p.context);
  await p.play();p.advance(10.83);const tick=tickAt(p.context.score,.75),notes=JSON.stringify(p.context.score.notes),oldEvents=[...p.events];
  p.controls.get('instrument').onchange();await new Promise(setImmediate);
  assert.ok(Math.abs(p.context.playing.startTick-tick)<1e-8,'音色変更後も現在位置から再生する');assert.equal(p.context.playing.endCycle,looping?Infinity:0);assert.ok(oldEvents.every(e=>e.stop===10.83));assert.equal(p.events.at(-2).soundId,'vsco-marimba');assert.equal(p.events.at(-1).soundId,'vsco-piano','別パートの音色は変えない');assert.equal(JSON.stringify(p.context.score.notes),notes);assert.ok(Math.abs(history[0].cursor-tick)<1e-8);
  p.context.pause();p.controls.get('instrument').value='0';p.controls.get('instrument').onchange();assert.equal(p.context.playing,null,'一時停止中の音色変更で勝手に再生しない');assert.equal(p.context.paused,true);await p.play();assert.ok(Math.abs(p.context.playing.startTick-tick)<1e-8);
  p.controls.get('partRange').value='piano-61';p.controls.get('partRange').onchange();await new Promise(setImmediate);assert.equal(p.context.score.parts[0].instrumentId,'piano-61');assert.ok(p.context.playing,'実機音域の変更でも再生を続ける');
  const load=p.context.loadBuffer,releases=[];p.context.loadBuffer=async(midi,sound)=>{if(sound.id==='vsco-marimba')await new Promise(resolve=>releases.push(resolve));return load(midi,sound);};
  p.controls.get('instrument').value='12';p.controls.get('instrument').onchange();await new Promise(setImmediate);assert.equal(p.context.playPending,true);
  p.controls.get('instrument').value='0';p.controls.get('instrument').onchange();await new Promise(setImmediate);const latest=p.context.playing;assert.ok(latest);releases.splice(0).forEach(resolve=>resolve());await new Promise(setImmediate);assert.equal(p.context.playing,latest,'遅い音源の読み込みで古い音色に戻らない');
  p.controls.get('instrument').value='12';p.controls.get('instrument').onchange();await new Promise(setImmediate);p.controls.get('stop').onclick();releases.splice(0).forEach(resolve=>resolve());await new Promise(setImmediate);assert.equal(p.context.playing,null,'音色読み込み中の停止を尊重する');assert.equal(p.context.cursor,0);
  p.controls.get('instrument').value='0';p.controls.get('instrument').onchange();assert.equal(p.context.playing,null,'停止中の音色変更で勝手に再生しない');
}
console.log('MML音色変更：現在位置・ループ・別パート・一時停止・音域・連続変更・読み込み中の停止を確認');
const sharedVoices=player(false,0),sharedOutputs=new Map(),sharedStates=[{time:0,gain:.6,pan:0,detune:0,modulation:0},{time:.5,gain:.3,pan:.5,detune:0,modulation:0}];
for(const midi of [60,64])sharedVoices.context.voice({midi,numberOfChannels:2},10,2,90,{id:'vsco-piano'},{part:1,midi,time:0,states:sharedStates,outputs:sharedOutputs});
assert.equal(sharedVoices.events[0].volume,sharedVoices.events[1].volume,'同時刻の和音は同じ音量制御を共有する');assert.equal(sharedVoices.events[0].pan,sharedVoices.events[1].pan);
sharedVoices.context.voice({midi:60,numberOfChannels:2},10.25,1.75,90,{id:'vsco-piano'},{part:1,midi:60,time:.25,states:sharedStates,outputs:sharedOutputs});assert.notEqual(sharedVoices.events[0].volume,sharedVoices.events[2].volume,'制御開始の時刻が異なる音は個別処理を保つ');
const sharedBus=sharedOutputs.values().next().value;let disconnected=0;sharedBus.volume.disconnect=()=>disconnected++;const chordNodes=[...sharedVoices.context.voices.keys()];chordNodes[0].onended();assert.equal(disconnected,0,'和音の途中で共有の出力を切らない');chordNodes[1].onended();assert.equal(disconnected,1,'最後の音が終わったら共有の出力を解放する');
for(const mode of ['empty','unsupported','editing']){
  const p=player(false,0);if(mode==='empty')p.context.score.notes=[];if(mode==='unsupported')p.context.partProfiles.clear();if(mode==='editing')p.context.textEditing=true;
  p.context.getAudio=()=>{throw Error('再生対象のない操作で音声を初期化しない');};await p.play();assert.equal(p.context.playing,null);assert.equal(p.events.length,0);assert.equal(p.context.cursor,0,'通常の操作不能状態では案内を出さず楽譜を保つ');
}
const failedAudio=player(false,0),audioErrors=[];failedAudio.context.error=m=>{if(m)audioErrors.push(m);};failedAudio.context.loadBuffer=async()=>{throw Error('音源を取得できません。');};await failedAudio.play();assert.deepEqual(audioErrors,['音源を取得できません。'],'実際の音源読み込み失敗は表示する');
for(const looping of [false,true]){
  const p=player(looping,0);await p.play();assert.equal(p.controls.get('play')['aria-label'],'一時停止');p.advance(10.83);
  const tick=tickAt(p.context.score,.75);p.controls.get('play').onclick();assert.equal(p.context.playing,null);assert.ok(Math.abs(p.context.cursor-tick)<1e-8);assert.ok(p.events.every(e=>e.stop===p.audio.currentTime));assert.equal(p.controls.get('play')['aria-label'],'再生');
  p.advance(11.5);assert.ok(Math.abs(p.context.cursor-tick)<1e-8,'一時停止中は位置を保つ');await p.play();assert.ok(Math.abs(p.context.playing.startTick-tick)<1e-8,'ループ中も一時停止した位置から再開する');
  p.controls.get('viewport').scrollLeft=150;p.controls.get('stop').onclick();assert.equal(p.controls.get('viewport').scrollLeft,0,'停止ボタンで表示もすぐ先頭へ戻る');assert.equal(p.controls.get('viewport').scrollTop,240,'縦の表示位置は保つ');assert.equal(p.context.cursor,0);assert.equal(p.context.playing,null);assert.equal(p.context.paused,false);await p.play();assert.equal(p.context.playing.startTick,0);p.context.stop();
  p.context.cursor=1920;p.controls.get('viewport').scrollLeft=150;p.controls.get('stop').onclick();assert.equal(p.context.cursor,0,'停止中も停止ボタンで曲頭に戻る');assert.equal(p.controls.get('viewport').scrollLeft,0,'停止中も表示をすぐ先頭へ戻す');
}
const whole=player(true,1920);await whole.play();whole.advance(16);
for(const [midi,times] of [[60,[10.08,13.08,16.08]],[62,[10.58,13.58]],[64,[12.08,15.08]]]){
  const actual=whole.events.filter(e=>e.midi===midi).map(e=>e.time);assert.equal(actual.length,times.length);actual.forEach((time,i)=>assert.ok(Math.abs(time-times[i])<1e-8,'途中カーソルでも曲全体を同じテンポでループする'));
}
const toggled=player(false,1920);await toggled.play();toggled.advance(10.4);toggled.controls.get('loop').onclick();assert.ok(toggled.context.playing,'ループONで試聴を止めない');
toggled.advance(11.96);toggled.controls.get('loop').onclick();assert.ok(toggled.context.playing,'ループOFFでも曲末まで続ける');
assert.ok(toggled.events.filter(e=>e.time>=12.08).every(e=>e.stop<e.time),'次周に予約した音を取り消す');
toggled.controls.get('loop').onclick();toggled.advance(12.1);
assert.equal(toggled.events.filter(e=>e.midi===60&&Math.abs(e.time-12.08)<1e-8&&e.stop>e.time).length,1,'再度ONにすると次周の先頭を一度だけ予約する');
toggled.controls.get('loop').onclick();toggled.advance(15.3);assert.equal(toggled.context.playing,null,'OFFにした周の曲末で停止する');
const once=player(false,1920);await once.play();once.advance(12.3);assert.equal(once.context.playing,null);assert.deepEqual(once.events.map(e=>e.midi),[60,64],'通常の途中再生では開始位置をまたぐ長音だけ復元する');
for(const mode of ['start','middle','paused','loop']){
  const p=player(mode==='loop',mode==='middle'?1920:0);await p.play();p.advance(10.83);
  if(mode==='paused'){p.context.pause();await p.play();}
  if(mode==='loop')p.controls.get('loop').onclick();
  p.advance(20);assert.equal(p.context.playing,null);assert.equal(p.context.cursor,0,'曲末の自動停止では先頭へ戻る');assert.equal(p.context.paused,false);
  p.controls.get('play').onclick();await new Promise(setImmediate);assert.equal(p.context.playing.startTick,0,mode+'でも再生ボタンは曲頭から始まる');p.context.stop();
}
const limited=player(false,0);limited.context.instrument.allowed=new Set([60,64]);await limited.play();limited.advance(13.3);assert.deepEqual(limited.events.map(e=>e.midi),[60,64],'楽譜に音域外の音が残っていても再生しない');
const unsupportedPlayer=player(false,0);unsupportedPlayer.context.score.parts.find(p=>p.id===2).program=127;unsupportedPlayer.context.partProfiles.set(2,undefined);await unsupportedPlayer.play();unsupportedPlayer.advance(13.3);assert.deepEqual(unsupportedPlayer.events.map(e=>e.midi),[60,64],'未対応楽器の音符は保存に残しても別音色で発音しない');
const mixedPlayer=player(false,0);mixedPlayer.context.partProfiles.set(2,instruments.find(i=>i.id==='marimba-61'));await mixedPlayer.play();mixedPlayer.advance(13.3);
assert.deepEqual(mixedPlayer.events.map(e=>[e.midi,e.soundId]),[[60,'vsco-piano'],[62,'vsco-marimba'],[64,'vsco-piano']],'同時再生はパートごとの音源を使う');assert.equal(mixedPlayer.events.find(e=>e.midi===62).stop,Infinity,'混合再生でもマリンバの余韻を切らない');
const automation=player(false,0);automation.context.score.notes=[{id:1,midi:60,tick:0,duration:960,velocity:90,part:1}];automation.context.score.controllers=[
  {part:1,tick:0,type:'cc',number:64,value:127},{part:1,tick:0,type:'cc',number:10,value:127},
  {part:1,tick:960,type:'cc',number:11,value:0},{part:1,tick:960,type:'pitchBend',value:4096},{part:1,tick:1920,type:'cc',number:64,value:0},
];await automation.play();const automated=automation.events[0];assert.equal(automated.stop,11.59,'実際の音源ノードもペダルを離してから0.5秒で消える');
assert.ok(automated.volume.some(e=>e.value===0&&Math.abs(e.time-10.58)<1e-8),'発音後のExpressionを音量へ予約する');assert.equal(automated.pan[0].value,1);assert.ok(automated.detune.some(e=>e.value===100),'発音後のベンドを録音の再生音程へ予約する');
const sustainPlayer=player(false,0);sustainPlayer.context.score.end=20*960;sustainPlayer.context.score.tempos=[{tick:0,bpm:120}];sustainPlayer.context.score.notes=[{id:1,midi:60,tick:0,duration:20*960,velocity:90,part:1}];
sustainPlayer.context.defs.soundsets[0]={id:'vsco-piano',release:.2,loops:{C4:[.5,1.5]}};
await sustainPlayer.play();const sustained=sustainPlayer.events[0];assert.equal(sustained.loop,true,'持続音はAudioBufferSourceのループを有効にする');assert.equal(sustained.loopStart,.5);assert.equal(sustained.loopEnd,1.5);assert.ok(Math.abs(sustained.stop-20.29)<1e-8,'4秒の録音でも10秒の音価と余韻まで維持する');
sustainPlayer.context.stop();assert.equal(sustained.stop,sustainPlayer.audio.currentTime,'停止はループ音も直ちに止める');
const loopPedal=player(false,0);loopPedal.context.score.notes=[{id:1,midi:60,tick:0,duration:480,velocity:90,part:1}];loopPedal.context.score.controllers=[{part:1,tick:0,type:'cc',number:64,value:127},{part:1,tick:2880,type:'cc',number:64,value:0}];loopPedal.context.defs.soundsets[0]={id:'vsco-piano',release:.2,loops:{C4:[.5,1.5]}};await loopPedal.play();assert.equal(loopPedal.events[0].loop,true);assert.ok(Math.abs(loopPedal.events[0].stop-12.29)<1e-8,'ループ音もサステインペダルを離してから消音する');
const hats=player(false,0);hats.context.score.parts=[{id:1,name:'Drums',program:0,percussion:true}];hats.context.score.notes=[{id:1,part:1,midi:46,tick:0,duration:120,velocity:90},{id:2,part:1,midi:42,tick:960,duration:120,velocity:90}];
hats.context.partProfiles=new Map([[1,{allowed:new Set([42,46]),defaultSoundset:'vsco-marimba'}]]);await hats.play();hats.advance(10.6);assert.ok(Math.abs(hats.events[0].stop-10.595)<1e-8,'閉じたハイハットで開いたハイハットの余韻を15msで消す');assert.equal(hats.events[1].stop,Infinity,'閉じたハイハット自体は自然減衰する');
for(const sound of JSON.parse(await readFile(new URL('./dist/audio/soundsets.json',import.meta.url),'utf8')).filter(s=>s.release!==undefined)){
  const p=player(false,0);p.context.voice({midi:72},10,.5,90,sound);const event=p.events[0];
  assert.ok(Math.abs(event.stop-(10.51+sound.release))<1e-8,sound.id+'は音価と余韻に合わせて離す');
}
assert.ok(once.events.every(e=>Math.abs(e.stop-12.59)<1e-8),'曲末の自動停止でピアノの0.5秒の余韻を切らない');
once.context.stop();assert.ok(once.events.every(e=>e.stop===once.audio.currentTime),'明示的な停止は残っている音も止める');
for(const id of ['piano-88','piano-61','marimba-61','musicbox-30','xylophone-32']){
  const p=player(false,0);p.context.instrument=instruments.find(i=>i.id===id);p.context.voice({midi:60},10,1,90,{id:p.context.instrument.defaultSoundset});
  const event=p.events[0],ramps=event.envelope.filter(e=>e.type==='ramp');
  if(['piano-88','piano-61'].includes(id)){assert.equal(event.stop,11.51);assert.equal(ramps.length,1);assert.equal(ramps[0].time,11.5);assert.equal(ramps[0].value,0);}
  else{assert.equal(event.stop,Infinity,id+'は音長で切らず自然減衰させる');assert.equal(ramps.length,0);}
}
const follow=player(true,0),viewport=follow.controls.get('viewport');viewport.scrollLeft=200;
await follow.play();assert.equal(viewport.scrollLeft,0,'画面外の開始位置へ再生開始時に戻る');
follow.advance(12.5);assert.ok(viewport.scrollLeft>0,'再生が右端に達したら横スクロールする');
const scroll=viewport.scrollLeft;follow.advance(13.09);assert.ok(viewport.scrollLeft<scroll,'全曲ループで先頭に戻るカーソルへ追従する');
assert.equal(viewport.scrollTop,240,'再生中に縦の表示位置を変えない');
follow.context.stop();viewport.scrollLeft=150;follow.context.renderCursor();assert.equal(viewport.scrollLeft,150,'停止中は表示位置を動かさない');
const visible=player(false,0);await visible.play();visible.advance(10.5);assert.equal(visible.controls.get('viewport').scrollLeft,0,'カーソルが画面内なら表示位置を保つ');
console.log('MML再生：全曲ループ・途中テンポ・途中カーソル・再生中のON/OFF・次周予約の取消し・表示追従・楽器別の減衰と曲末の余韻を確認');

for(const format of ['mp3','ogg']){
  const p=player(true,1920),saved=[],failures=[],messages=[],encoders=[];p.context.score.end=64*960;p.context.score.notes[2].tick=0;if(format==='ogg'){p.context.partProfiles.set(2,{allowed:new Set([62]),defaultSoundset:'vsco-marimba'});p.context.score.controllers=[{part:2,tick:0,type:'pitchBend',value:-8192},{part:2,tick:5.75*960,type:'cc',number:7,value:30}];const load=p.context.loadBuffer;p.context.loadBuffer=async(midi,sound)=>{await load(midi,sound);p.context.buffers.get(sound.id+':'+midi).numberOfChannels=midi===60?1:2;};}const before=JSON.stringify(p.context.score);const frames=[];let workerError=false;
  for(const id of ['save','saveMenu','saveMp3','saveOgg'])p.controls.set(id,{hidePopover(){},setAttribute(name,value){this[name]=value;}});
  class Encoder{constructor(url){assert.equal(url,'./'+format+'-worker.js');encoders.push(this);}postMessage(data,transfer){messages.push(data);if(data.type==='encode'){assert.equal(data.left.length,data.right.length);assert.equal(transfer.length,2);if(workerError){queueMicrotask(()=>this.onmessage({data:{error:'変換エラー'}}));return;}if(messages.filter(m=>m.type==='encode').length===1){queueMicrotask(()=>{assert.equal(frames.length,2,'前区間の圧縮中に次の波形を生成する');this.onmessage({data:{}});});return;}}this.onmessage({data:data.type==='finish'?{blob:new Blob([format],{type:format==='mp3'?'audio/mpeg':'audio/ogg'})}:{}});}terminate(){this.terminated=true;}}
  const progressUpdates=[];Object.assign(p.context,{saveProgress:(key='',value=null,values={})=>progressUpdates.push({key,value,values}),audioExporting:false,clone:structuredClone,Worker:Encoder,download:(blob,name,type)=>saved.push({blob,name,type}),error:m=>{if(m)failures.push(m);},window:{OfflineAudioContext:class{constructor(channels,length,rate){assert.equal(channels,2);assert.equal(rate,44100);frames.push(length);p.audio.sampleRate=rate;p.audio.startRendering=async()=>({length,getChannelData:()=>new Float32Array(length)});return p.audio;}}}});
  runInContext(app.slice(app.indexOf('async function saveAudio('),app.indexOf("$('saveMml').onclick=")),p.context);
  await runInContext('saveAudio('+JSON.stringify(format)+')',p.context);
  const percentages=progressUpdates.filter(p=>p.key==='mmlSavingAudio').map(p=>p.value);assert.equal(percentages[0],0);assert.equal(percentages.at(-1),1);assert.ok(percentages.every((n,i)=>n>=0&&n<=1&&(!i||n>=percentages[i-1])));assert.equal(progressUpdates.at(-1).key,'');assert.ok(progressUpdates.some(p=>p.key==='mmlFinishingAudio'));assert.deepEqual(failures,[]);assert.equal(saved.length,1);assert.equal(saved[0].type,format==='mp3'?'audio/mpeg':'audio/ogg');assert.equal(saved[0].name,p.context.score.title+'.'+format);
  const block=Math.floor(44100*30/128)*128,total=Math.ceil(63.02*44100);assert.deepEqual(frames,[block,block,total-block*2],'波形の生成も約30秒ずつに分ける');assert.deepEqual(p.events.map(e=>[e.midi,e.time]),[[60,0],[64,0],[62,.5]],'選択パート・カーソル・ループに関わらず全パートを曲頭から書き出す');assert.equal(p.events[0].stop,3.51,'再生と同じピアノの余韻を保つ');assert.equal(p.context.voices.size,0,'書き出し用ノードを再生中の音と混ぜない');if(format==='mp3'){assert.equal(p.events[0].volume,p.events[1].volume,'同じパートは音量を共有する');assert.equal(p.events[0].pan,p.events[1].pan,'同じパートはパンを共有する');}else{assert.notEqual(p.events[0].volume,p.events[2].volume,'モノラルとステレオの音は分けて共有する');assert.equal(p.events[0].volumeChannels,1);assert.equal(p.events[1].volumeChannels,2);assert.equal(p.events[2].volume.length,1,'音程を下げた減衰音は従来の制御終了後に音量を変えない');}assert.notEqual(p.events[0].volume,p.events[2].volume,'同じ音色でも別パートの音量は独立する');
  assert.deepEqual(messages.filter(m=>m.type==='encode').map(m=>m.left.length),[block,block,total-block*2],'既存エンコーダーへ30秒ずつ渡す');assert.ok(encoders[0].terminated);assert.equal(p.controls.get('save').disabled,false);assert.equal(p.controls.get('save')['aria-busy'],'false');assert.equal(JSON.stringify(p.context.score),before);
  const originalLoad=p.context.loadBuffer;p.context.loadBuffer=async()=>{throw Error('音源を取得できません。');};await runInContext('saveAudio('+JSON.stringify(format)+')',p.context);assert.deepEqual(failures,['音源を取得できません。']);assert.equal(saved.length,1);assert.equal(p.context.audioExporting,false);assert.equal(p.controls.get('save').disabled,false);
  p.context.loadBuffer=originalLoad;workerError=true;failures.length=0;await runInContext('saveAudio('+JSON.stringify(format)+')',p.context);assert.deepEqual(failures,['変換エラー']);assert.equal(saved.length,1);assert.ok(encoders.at(-1).terminated);assert.equal(p.context.audioExporting,false);assert.equal(progressUpdates.at(-1).key,'');let releaseTone;p.context.loadBuffer=async midi=>{if(midi===60)await new Promise(resolve=>{releaseTone=resolve;});else throw Error('音源を取得できません。');};workerError=false;await runInContext('saveAudio('+JSON.stringify(format)+')',p.context);const count=progressUpdates.length;releaseTone();await Promise.resolve();await Promise.resolve();assert.equal(progressUpdates.length,count,'失敗後に遅い音源取得が終わっても進捗を再表示しない');
}
console.log('MML音声保存：MP3/Vorbis・全パート・テンポ・余韻・30秒の受け渡し・失敗後の復帰を確認');
