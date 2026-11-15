import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import tone from '@tonejs/midi';
import {initSync,SakuraCompiler,get_version} from './dist/vendor/sakura/sakuramml.js';
import {demoScore,validateScore,serializeMml,prepareMml,fromMidi,secondsAt,tickAt,moveNotes,resizeNotes,scorePosition} from './dist/mml-score.js';

initSync({module:await readFile(new URL('./dist/vendor/sakura/sakuramml_bg.wasm',import.meta.url))});
assert.equal(get_version(),'0.2.2'); // 固定した0.2.3ソース内の実行時バージョン表記。
function compile(source){const compiler=SakuraCompiler.new();try{const bytes=compiler.compile(prepareMml(source));assert.equal(compiler.get_log(),'');return fromMidi(new tone.Midi(bytes),source);}finally{compiler.free();}}
const musical=score=>score.notes.map(({part,midi,tick,duration,velocity})=>({part,midi,tick,duration,velocity})).sort((a,b)=>a.part-b.part||a.tick-b.tick||a.midi-b.midi||a.duration-b.duration);
const original=demoScore(),source=serializeMml(original),back=compile(source);
assert.deepEqual(musical(back),musical(original));assert.equal(back.end,original.end);assert.equal(back.title,original.title);assert.deepEqual(back.parts,original.parts);
assert.deepEqual(back.signatures,original.signatures);
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
const pedalMidi=new tone.Midi();pedalMidi.addTrack().addCC({number:64,ticks:0,value:1});assert.throws(()=>fromMidi(pedalMidi),/ペダル/);
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

// 実際の再生処理を仮想時計で動かし、AudioBufferSourceへ渡す発音時刻を確認する。
const app=await readFile(new URL('./dist/mml-app.js',import.meta.url),'utf8');
// 実際のキー処理で、メニュー・入力・ドラッグ中に背後の音符を編集しないことを確認する。
let keyHandler;
const keyContext=createContext({
  score:structuredClone(original),selected:new Set(original.notes.map(n=>n.id)),cursor:0,clipboard:null,
  worker:null,gesture:null,textEditing:false,menuOpen:false,
  document:{addEventListener(type,handler){keyHandler=handler;},querySelector:()=>keyContext.menuOpen},
  $:()=>({}),change(fn){fn();validateScore(keyContext.score);},renderNotes(){},renderProperties(){},
  gridTicks:()=>240,moveNotes,
  chosen:()=>keyContext.score.notes.filter(n=>keyContext.selected.has(n.id)),nextId:()=>Math.max(0,...keyContext.score.notes.map(n=>n.id))+1,
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
assert.deepEqual(musical(keyContext.score),musical({...original,notes:original.notes.map(n=>({...n,midi:n.midi-11}))}));
press('Delete');assert.equal(keyContext.score.notes.length,0,'通常の選択音削除は機能する');
keyContext.score=structuredClone(original);press('a',{ctrlKey:true});press('c',{ctrlKey:true});press('v',{ctrlKey:true});
assert.equal(keyContext.score.notes.length,original.notes.length*2);assert.deepEqual(musical(keyContext.score).filter((_,i)=>i%2===0),musical(original),'全パートのコピーでも音と声部を保つ');
console.log('MML操作：メニュー・文字入力・IME・ドラッグと楽譜ショートカットの競合を確認');

const pointerControls=new Map(['viewport','noteArea','selectionBox'].map(id=>[id,{scrollLeft:0,scrollTop:0,style:{},focus(){},setPointerCapture(){},releasePointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,right:500,bottom:500})}]));
const pointerContext=createContext({
  score:structuredClone(original),selected:new Set(),gesture:null,mode:'draw',px:96,HIGH:108,LOW:21,ROW:24,KEY:72,
  $:id=>pointerControls.get(id),snapshot:()=>({score:structuredClone(pointerContext.score)}),editable:()=>true,stop(){},error(){},
  render(){},renderNotes(){},renderProperties(){},remember(){},validateScore,moveNotes,resizeNotes,
  requestAnimationFrame:()=>1,cancelAnimationFrame(){},
});
runInContext(app.slice(app.indexOf('function gridTicks('),app.indexOf('function labelPosition('))+app.slice(app.indexOf('function beginNote('),app.indexOf("$('noteArea').addEventListener('pointerdown'")),pointerContext);
pointerControls.set('grid',{value:'.25'});
const touchNote=original.notes.find(n=>n.part===2),touch={button:0,isPrimary:true,pointerType:'touch',pointerId:1,clientX:4,clientY:(108-touchNote.midi)*24+10,preventDefault(){},target:{closest:selector=>selector==='.midi-note'?{dataset:{id:String(touchNote.id)}}:null}};
pointerContext.beginNote(touch);pointerContext.updateGesture({...touch,clientX:7,clientY:touch.clientY+2});pointerContext.endGesture();
assert.ok(pointerContext.selected.has(touchNote.id),'伴奏もタップだけで選べる');assert.deepEqual(musical(pointerContext.score),musical(original),'タップ時の小さな指ぶれで音を動かさない');
pointerContext.beginNote({...touch,clientX:400,clientY:10,target:{closest:()=>null}});pointerContext.autoScroll();
assert.equal(pointerControls.get('viewport').scrollTop,0,'端の音を触っただけではスクロールしない');pointerContext.endGesture(true);
assert.deepEqual(musical(pointerContext.score),musical(original),'スクロールでタッチが中断されたら仮の入力を残さない');
console.log('MMLタッチ処理：全パートの選択・指ぶれ・端のタップ・スクロール中断を確認');
const playback=app.slice(app.indexOf('function voice('),app.indexOf("$('keyboard').onclick="));
function player(looping,cursor){
  const controls=new Map(['play','loop'].map(id=>[id,{'aria-pressed':id==='loop'?String(looping):'false',getAttribute(name){return this[name];},setAttribute(name,value){this[name]=value;}}])),events=[],buffers=new Map();
  let timer;
  const audio={currentTime:10,resume:async()=>{},destination:{},createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}}),createBufferSource(){return {connect(){},disconnect(){},start(time){this.event={midi:this.buffer.midi,time,stop:Infinity};events.push(this.event);},stop(time=audio.currentTime){this.event.stop=time;}};}};
  const score={...demoScore(),end:3840,tempos:[{tick:0,bpm:120},{tick:1920,bpm:60}],notes:[{midi:60,tick:0,duration:3840,velocity:90,part:1},{midi:62,tick:960,duration:960,velocity:90,part:2},{midi:64,tick:2880,duration:960,velocity:90,part:1}]};
  const context=createContext({$:id=>controls.get(id),getAudio:()=>audio,score,cursor,playing:null,playEpoch:0,textEditing:false,voices:new Map(),buffers,instrument:{allowed:new Set([60,62,64]),defaultSoundset:'piano',arrangedFor:'piano88'},defs:{soundsets:[{id:'piano'}]},loadBuffer:async midi=>buffers.set('piano:'+midi,{midi}),secondsAt,tickAt,renderCursor(){},error(message){if(message)throw Error(message);},setInterval(fn){timer=fn;return 1;},clearInterval(){timer=null;},requestAnimationFrame(){return 1;},cancelAnimationFrame(){}});
  runInContext(playback,context);
  return {context,controls,events,audio,play:()=>runInContext('play()',context),advance(to){while(audio.currentTime<to){audio.currentTime=Math.min(to,audio.currentTime+.025);timer?.();}}};
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
console.log('MML再生：全曲ループ・途中テンポ・途中カーソル・再生中のON/OFF・次周予約の取消しを確認');
