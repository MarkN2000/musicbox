import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import midiFile from 'midi-file';
import {initSync,SakuraCompiler} from './dist/vendor/sakura/sakuramml.js';
import {t,currentLanguage,localized} from './dist/i18n.js';
import {demoScore,serializeMml,prepareMml,fromMidi,midiPerformance} from './dist/mml-score.js';

initSync({module:await readFile(new URL('./dist/vendor/sakura/sakuramml_bg.wasm',import.meta.url))});
function compile(text){const c=SakuraCompiler.new();try{const bytes=c.compile(prepareMml(text));assert.equal(c.get_log(),'');return {bytes,score:fromMidi(bytes,text)};}finally{c.free();}}
const notes=s=>s.notes.map(({part,midi,tick,duration,velocity})=>({part,midi,tick,duration,velocity})).sort((a,b)=>a.part-b.part||a.tick-b.tick||a.midi-b.midi||a.duration-b.duration);
const original=demoScore();
const large={...original,parts:Array.from({length:16},(_,i)=>({id:i+1,name:`Part ${i}`,program:i})),notes:Array.from({length:16},(_,i)=>({id:i+1,part:i+1,midi:60,tick:0,duration:960,velocity:90})),controllers:Array.from({length:16},(_,i)=>({part:i+1,tick:0,type:'cc',number:7,value:70+i}))};
const largeMml=serializeMml(large),largeBack=compile(largeMml).score;
assert.deepEqual(largeBack.parts,large.parts);assert.deepEqual(notes(largeBack),notes(large));assert.deepEqual(largeBack.controllers,large.controllers);
assert.throws(()=>serializeMml(large,{singlePort:true}),/MIDIに書き出せません/,'MMLの保存・往復にはMIDIのチャンネル上限を適用しない');

const tracks=[];
for(let i=0;i<15;i++)for(const offset of [0,120]){
  const channel=i<9?i:i+1;
  tracks.push([{deltaTime:0,meta:true,type:'trackName',text:`Voice ${tracks.length}`},{deltaTime:0,type:'programChange',channel,programNumber:i},...(offset?[]:[{deltaTime:0,type:'controller',channel,controllerType:7,value:70+i}]),{deltaTime:offset,type:'noteOn',channel,noteNumber:60,velocity:90},{deltaTime:offset?120:960,type:'noteOff',channel,noteNumber:60,velocity:0},{deltaTime:0,meta:true,type:'endOfTrack'}]);
}
const input=Uint8Array.from(midiFile.writeMidi({header:{format:1,numTracks:tracks.length,ticksPerBeat:960},tracks})),routed=fromMidi(input);
assert.equal(routed.parts.length,30);assert.equal(new Set(routed.parts.map(p=>p.channel)).size,15);
const savedMml=serializeMml(routed),mmlBack=compile(savedMml).score;
assert.deepEqual(mmlBack.parts,routed.parts);assert.deepEqual(notes(mmlBack),notes(routed));assert.deepEqual(mmlBack.controllers,routed.controllers);
const savedMidi=compile(serializeMml(mmlBack,{singlePort:true})),midiBack=fromMidi(savedMidi.bytes);
assert.deepEqual(midiBack.parts,routed.parts);assert.deepEqual(notes(midiBack),notes(routed));assert.deepEqual(midiBack.controllers,routed.controllers);
assert.equal(new Set(midiFile.parseMidi(savedMidi.bytes).tracks.flat().filter(e=>e.type==='noteOn').map(e=>e.channel)).size,15,'元15CHの30パート・同音重なりを余分なCHなしで保持する');

const switchSource='TimeBase(960) TR=1 CH=1 @1 q100 Time(0) n60,%1920,100,90 Time(480) @41 n64,%240,100,80 Time(960) @1 n67,%240,100,85';
const switched=compile(switchSource).score,switchBack=compile(serializeMml(switched,{singlePort:true})).score;
assert.deepEqual(switchBack.parts,switched.parts);assert.deepEqual(notes(switchBack),notes(switched),'元CHの途中音色変更を共有しても各発音時の音色を保つ');
const isolated=compile('TimeBase(960) TR=1 Port(0) CH=1 @1 RPN(0,0,12) PitchBend(4096) q100 c4 TR=2 Port(1) CH=1 @41 RPN(0,0,2) PitchBend(4096) q100 e4').score;
assert.deepEqual(isolated.parts.map(p=>p.program),[0,40]);assert.deepEqual([...midiPerformance(isolated).values()].map(p=>p.states.at(-1).detune),[600,100],'MMLの各ポートの音色・制御状態を混ぜない');
const empty={...large,notes:[],controllers:undefined};assert.equal(compile(serializeMml(empty,{singlePort:true})).score.parts.length,16,'空パートだけでチャンネルを消費しない');

const replies=[],worker=createContext({t,currentLanguage,localized,init:async()=>{},SakuraCompiler,prepareMml,fromMidi,serializeMml,self:{postMessage:m=>replies.push(m)}});
runInContext((await readFile(new URL('./dist/mml-worker.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,''),worker);
await worker.self.onmessage({data:{text:largeMml}});assert.equal(replies.at(-1).score.parts.length,16);assert.equal(replies.at(-1).error,undefined);
await worker.self.onmessage({data:{text:largeMml,midiOnly:true}});assert.match(replies.at(-1).error,/MIDIに書き出せません/,'上限エラーはMIDI書き出し時だけにする');
await worker.self.onmessage({data:{text:savedMml,midiOnly:true}});assert.equal(replies.at(-1).error,undefined);assert.deepEqual(notes(fromMidi(replies.at(-1).bytes)),notes(routed));
const app=await readFile(new URL('./dist/mml-app.js',import.meta.url),'utf8'),controls=new Map(['saveMml','saveMidi','saveMenu','copyMml'].map(id=>[id,{hidePopover(){}}])),downloads=[],errors=[],copied=[];
const ui=createContext({t,currentLanguage,localized,saveProgress(){},score:large,sourceText:null,textEditing:false,serializeMml,$:id=>controls.get(id),error:m=>errors.push(m),render(){},download:body=>downloads.push(body),navigator:{clipboard:{writeText:async text=>copied.push(text)}},window:{isSecureContext:true},compile:async data=>{await worker.self.onmessage({data});const reply=replies.at(-1);if(reply.error)throw Error(reply.error);return reply.bytes;}});
runInContext(app.slice(app.indexOf('function attempt('),app.indexOf('function snapshot('))+app.slice(app.indexOf('function source('),app.indexOf('function renderNotes('))+app.slice(app.indexOf("$('saveMml').onclick="),app.indexOf("$('editMml').onclick=")),ui);
controls.get('saveMml').onclick();await controls.get('copyMml').onclick({preventDefault(){}});assert.equal(downloads[0],largeMml);assert.equal(copied[0],largeMml);assert.ok(!errors.some(Boolean),'MML保存・コピーではMIDI制限を表示しない');
await controls.get('saveMidi').onclick();assert.match(errors.at(-1),/MIDIに書き出せません/);assert.equal(downloads.length,1);assert.deepEqual(ui.score,large);
controls.get('saveMml').onclick();assert.equal(downloads[1],largeMml,'MIDI書き出し失敗後もMML保存できる');
console.log('MML/MIDI再変換：MML16パート往復・元15CH/30パートの共有・同音重なり・制御分離・途中音色・MIDI出力時だけの制限を確認');
