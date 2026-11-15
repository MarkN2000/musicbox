import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import tone from '@tonejs/midi';
import {validateDefinitions} from './dist/core.js';
import {initSync,SakuraCompiler,get_version} from './dist/vendor/sakura/sakuramml.js';
import {demoScore,validateScore,serializeMml,prepareMml,fromMidi,secondsAt,tickAt,moveNotes,resizeNotes,scorePosition} from './dist/mml-score.js';

initSync({module:await readFile(new URL('./dist/vendor/sakura/sakuramml_bg.wasm',import.meta.url))});
assert.equal(get_version(),'0.2.2'); // 固定した0.2.3ソース内の実行時バージョン表記。
function compile(source){const compiler=SakuraCompiler.new();try{const bytes=compiler.compile(prepareMml(source));assert.equal(compiler.get_log(),'');return fromMidi(new tone.Midi(bytes),source);}finally{compiler.free();}}
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
assert.deepEqual(versions.map(v=>v.file).sort(),(await readdir(new URL('./dist/samples/',import.meta.url))).filter(f=>f.endsWith('.mml')).sort(),'MML曲を曲選択の一覧から漏らさない');
for(const version of versions){
 const profile=instruments.find(i=>i.arrangedFor===version.arranged_for);assert.ok(profile&&version.label_ja&&version.label_en);
 const score=compile(await readFile(new URL('./dist/samples/'+version.file,import.meta.url),'utf8')),allowed=profile.allowed;assert.ok(score.notes.every(n=>allowed.has(n.midi)),version.id+'の対象楽器の音域');
 if(['musicbox30','xylophone32'].includes(version.arranged_for))for(const n of score.notes.filter(n=>n.part!==1))assert.ok(!score.notes.some(m=>m.part===1&&m.midi===n.midi&&m.tick<n.tick&&n.tick<m.tick+m.duration),version.id+'で伴奏が旋律の長音を打ち直さない');
 const restored=compile(serializeMml(score));assert.deepEqual(musical(restored),musical(score),version.id+'の全音長・拍位置の往復');assert.equal(restored.end,score.end);assert.deepEqual(restored.tempos.map(t=>t.tick),score.tempos.map(t=>t.tick));for(const [i,t]of score.tempos.entries())assert.ok(Math.abs(60000000/t.bpm-60000000/restored.tempos[i].bpm)<=1.000001,version.id+'のテンポをMIDIの1マイクロ秒精度で保持');assert.deepEqual(restored.signatures,score.signatures);
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
const markerControls=new Map(['markerLane','markerMenu','markerCell','markerPosition','markerForm','tempoBpm','signatureNumerator','signatureDenominator','removeTempo','removeSignature'].map(id=>[id,{value:'',style:{},reportValidity:()=>true,showPopover(){this.open=true;},getBoundingClientRect:()=>({left:100})}]));
const markerHistory=[],markerContext=createContext({score:structuredClone(original),markerTick:0,cursor:0,px:120,$:id=>markerControls.get(id),gridTicks:()=>240,x:tick=>tick/960*120,labelPosition:tick=>String(tick),scorePosition,editable:()=>true,stop(){},error(){},render(){},positionMenus(){},validateScore,snapshot:()=>({score:structuredClone(markerContext.score)}),remember:before=>markerHistory.push(before),restore:before=>{markerContext.score=before.score;}});
runInContext(app.slice(app.indexOf('function change('),app.indexOf('function restore('))+app.slice(app.indexOf('function renderMarkerMenu('),app.indexOf("$('noteStart').onchange")),markerContext);
const markerClick=(clientX,target=null)=>markerControls.get('markerLane').onclick({clientX,target:{closest:()=>target}});
markerClick(285);assert.equal(markerContext.markerTick,1440,'空白のシングルクリックは音符と同じく枠の左端を選ぶ');
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
markerContext.openMarker(0);assert.ok(markerControls.get('removeTempo').hidden&&markerControls.get('removeSignature').hidden);
const beforeStart=JSON.stringify(markerContext.score);markerControls.get('removeTempo').onclick();markerControls.get('removeSignature').onclick();assert.equal(JSON.stringify(markerContext.score),beforeStart,'曲頭の拍子・テンポは削除できない');
assert.ok(markerHistory.length>=4);assert.deepEqual(musical(markerHistory[0].score),musical(original),'変更前を取り消し履歴へ残す');
markerContext.score.tempos[0].bpm=88.000023;markerContext.openMarker(0);assert.equal(markerControls.get('tempoBpm').value,88);assert.equal(markerContext.score.tempos[0].bpm,88.000023,'テンポの表示を短くしても開くだけでは精度を変えない');
console.log('MMLマーカー：1行のシングルクリック編集・枠への配置・独立した変更/削除・曲頭の保持・音符の保持を確認');
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
  score:structuredClone(original),selected:new Set(),gesture:null,px:96,HIGH:108,LOW:21,ROW:20,KEY:72,
  $:id=>pointerControls.get(id),snapshot:()=>({score:structuredClone(pointerContext.score)}),editable:()=>true,stop(){},error(){},
  render(){},renderNotes(){},renderProperties(){},remember(){},validateScore,moveNotes,resizeNotes,
  requestAnimationFrame:()=>1,cancelAnimationFrame(){},
});
runInContext(app.slice(app.indexOf('function gridTicks('),app.indexOf('function labelPosition('))+app.slice(app.indexOf('function beginNote('),app.indexOf("$('noteArea').addEventListener('pointerdown'")),pointerContext);
pointerControls.set('grid',{value:'.25'});
const touchNote=original.notes.find(n=>n.part===2),touch={button:0,isPrimary:true,pointerType:'touch',pointerId:1,clientX:4,clientY:(108-touchNote.midi)*20+10,preventDefault(){},target:{closest:selector=>selector==='.midi-note'?{dataset:{id:String(touchNote.id)}}:null}};
const pointerHistory=[];pointerContext.remember=before=>pointerHistory.push(before);
for(const pointerType of ['mouse','touch']){
  const event={...touch,pointerType};pointerContext.score=structuredClone(original);pointerContext.selected=new Set(original.notes.map(n=>n.id));
  pointerContext.beginNote(event);pointerContext.updateGesture({...event,clientX:6,clientY:touch.clientY+1});pointerContext.endGesture();
  assert.deepEqual(musical(pointerContext.score),musical({...original,notes:original.notes.filter(n=>n.id!==touchNote.id)}),'本体クリック・タップは押した音だけを削除する');
  assert.deepEqual(musical(pointerHistory.at(-1).score),musical(original),'削除前を取り消し履歴に残す');
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
const outside=original.notes.find(n=>!pointerContext.selected.has(n.id));assert.ok(outside);
pointerContext.selected=new Set([outside.id]);pointerContext.beginNote({...boxStart,shiftKey:true});pointerContext.updateGesture({...boxStart,shiftKey:true,clientX:100,clientY:boxStart.clientY+21});pointerContext.endGesture();
assert.ok(pointerContext.selected.has(outside.id)&&pointerContext.selected.has(touchNote.id),'Shift併用の範囲選択は既存の選択を保持する');
const group=new Set(pointerContext.selected);pointerContext.beginNote({...touch,pointerType:'mouse'});pointerContext.updateGesture({...touch,pointerType:'mouse',clientX:100,clientY:touch.clientY-20});pointerContext.endGesture();
assert.deepEqual(musical(pointerContext.score),musical({...original,notes:moveNotes(original.notes,group,960,1,original.end)}),'範囲選択した音をまとめてドラッグできる');
pointerContext.score=structuredClone(original);pointerContext.selected.clear();pointerContext.beginNote(blank);pointerContext.updateGesture({...blank,clientX:420,clientY:40});pointerContext.autoScroll();pointerContext.endGesture();
assert.equal(pointerContext.selected.size,0);assert.equal(pointerControls.get('viewport').scrollTop,0);assert.deepEqual(musical(pointerContext.score),musical(original),'スマホの空白スワイプは配置・選択・自動スクロールしない');
console.log('MMLポインター操作：モードなしの配置・削除・範囲選択・移動・伸縮・タッチのスクロール競合を確認');
const playback=app.slice(app.indexOf('function voice('),app.indexOf("$('keyboard').onclick="));
function player(looping,cursor){
  const controls=new Map(['play','loop'].map(id=>[id,{'aria-pressed':id==='loop'?String(looping):'false',getAttribute(name){return this[name];},setAttribute(name,value){this[name]=value;}}])),events=[],buffers=new Map();
  controls.set('viewport',{scrollLeft:0,scrollTop:240,clientWidth:260});controls.set('playhead',{style:{}});controls.set('position',{});
  let timer,frame;
  const audio={currentTime:10,resume:async()=>{},destination:{},createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}}),createBufferSource(){return {connect(){},disconnect(){},start(time){this.event={midi:this.buffer.midi,time,stop:Infinity};events.push(this.event);},stop(time=audio.currentTime){this.event.stop=time;}};}};
  const score={...demoScore(),end:3840,tempos:[{tick:0,bpm:120},{tick:1920,bpm:60}],notes:[{midi:60,tick:0,duration:3840,velocity:90,part:1},{midi:62,tick:960,duration:960,velocity:90,part:2},{midi:64,tick:2880,duration:960,velocity:90,part:1}]};
  const context=createContext({$:id=>controls.get(id),getAudio:()=>audio,score,cursor,playing:null,playEpoch:0,textEditing:false,voices:new Map(),buffers,KEY:84,x:tick=>tick/score.ppq*96,labelPosition:tick=>String(tick),instrument:{allowed:new Set([60,62,64]),defaultSoundset:'piano',arrangedFor:'piano88'},defs:{soundsets:[{id:'piano'}]},loadBuffer:async midi=>buffers.set('piano:'+midi,{midi}),secondsAt,tickAt,error(message){if(message)throw Error(message);},setInterval(fn){timer=fn;return 1;},clearInterval(){timer=null;},requestAnimationFrame(fn){frame=fn;return 1;},cancelAnimationFrame(){frame=null;}});
  runInContext(app.slice(app.indexOf('function renderCursor('),app.indexOf('function renderProperties('))+playback,context);
  return {context,controls,events,audio,play:()=>runInContext('play()',context),advance(to){while(audio.currentTime<to){audio.currentTime=Math.min(to,audio.currentTime+.025);timer?.();frame?.();}}};
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
const follow=player(true,0),viewport=follow.controls.get('viewport');viewport.scrollLeft=200;
await follow.play();assert.equal(viewport.scrollLeft,0,'画面外の開始位置へ再生開始時に戻る');
follow.advance(12.5);assert.ok(viewport.scrollLeft>0,'再生が右端に達したら横スクロールする');
const scroll=viewport.scrollLeft;follow.advance(13.09);assert.ok(viewport.scrollLeft<scroll,'全曲ループで先頭に戻るカーソルへ追従する');
assert.equal(viewport.scrollTop,240,'再生中に縦の表示位置を変えない');
follow.context.stop();viewport.scrollLeft=150;follow.context.renderCursor();assert.equal(viewport.scrollLeft,150,'停止中は表示位置を動かさない');
const visible=player(false,0);await visible.play();visible.advance(10.5);assert.equal(visible.controls.get('viewport').scrollLeft,0,'カーソルが画面内なら表示位置を保つ');
console.log('MML再生：全曲ループ・途中テンポ・途中カーソル・再生中のON/OFF・次周予約の取消し・カーソルへの表示追従を確認');
