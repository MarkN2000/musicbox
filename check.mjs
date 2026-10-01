import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {NOTE_NAMES,ALLOWED,noteName,noteNumber,serialize,convertMidi,validateMidiHeader,keyOf,MAX_STEPS,MAX_NOTES} from './dist/core.js';
import {TEMPLATES,templateScore} from './dist/templates.js';
const require=createRequire(import.meta.url),{Midi}=require('@tonejs/midi');
assert.equal(NOTE_NAMES.length,30);assert.equal(ALLOWED.size,30);
for(const name of NOTE_NAMES)assert.equal(noteName(noteNumber(name)),name);
const audioHash=createHash('sha256'),audioDurations=new Map();
for(const name of NOTE_NAMES){
  const ogg=await readFile(`dist/audio/${name}.ogg`);assert(ogg.length>100,`${name}の音源が空です`);audioHash.update(name).update(ogg);
  let offset=0,sampleRate=0,lastSample=0n;
  while(offset<ogg.length){
    assert.equal(ogg.subarray(offset,offset+4).toString(),'OggS',`${name}の音源`);
    const segmentCount=ogg[offset+26],body=offset+27+segmentCount;
    if(offset===0){assert.equal(ogg.subarray(body+1,body+7).toString(),'vorbis');sampleRate=ogg.readUInt32LE(body+12);}
    const sample=ogg.readBigUInt64LE(offset+6);if(sample!==0xffffffffffffffffn&&sample>lastSample)lastSample=sample;
    offset=body+ogg.subarray(offset+27,body).reduce((sum,size)=>sum+size,0);
  }
  assert(sampleRate>0&&lastSample>0n);audioDurations.set(noteNumber(name),Number(lastSample)/sampleRate);
}
const audioRevision=audioHash.digest('hex').slice(0,16);
const app=await readFile('dist/app.js','utf8'),templatesRevision=createHash('sha256').update((await readFile('dist/templates.js','utf8')).replace(/\r\n/g,'\n')).digest('hex').slice(0,16);
assert(app.includes(`.ogg?v=${audioRevision}`),'音源URLの更新識別子が音源の内容と一致しません');
assert(app.includes(`from './templates.js?v=${templatesRevision}'`),'テンプレートURLの更新識別子が内容と一致しません');
assert(!ALLOWED.has(noteNumber('F#4')));assert(!ALLOWED.has(noteNumber('F#6')));
assert.equal(serialize([{step:1,midi:72},{step:1,midi:79},{step:1,midi:72},{step:1,midi:76},{step:3,midi:74}],5),'\nC5,E5,G5\n\nD5\n\n');
assert.equal(serialize([],3),'\n\n\n');
assert.throws(()=>serialize([{step:0,midi:66}],1),/対応外/);assert.throws(()=>serialize([{step:1,midi:72}],1),/不正/);
assert.throws(()=>validateMidiHeader(new Uint8Array(14).buffer),/MIDI/);
const midi=new Midi();midi.header.setTempo(120);const track=midi.addTrack();track.name='Melody';
track.addNote({midi:72,ticks:480,durationTicks:120});track.addNote({midi:76,ticks:480,durationTicks:120});track.addNote({midi:72,ticks:485,durationTicks:120});track.addNote({midi:66,ticks:720,durationTicks:120});track.addNote({midi:79,ticks:1200,durationTicks:960});
const drums=midi.addTrack();drums.channel=9;drums.name='Drums';drums.addNote({midi:36,ticks:0,durationTicks:100});
const bytes=midi.toArray();validateMidiHeader(bytes.buffer);const parsed=new Midi(bytes);assert(parsed.tracks[1].instrument.percussion);
const converted=convertMidi(parsed,{tracks:[0],subdivision:4});assert.equal(converted.notes.length,4);assert.equal(converted.merged,1);assert.equal(converted.notes[0].step,4);assert.equal(converted.length,18);assert(converted.notes.some(note=>!ALLOWED.has(note.midi)));
assert.equal(convertMidi(parsed,{tracks:[0],subdivision:3}).notes[0].step,3);
assert.equal(convertMidi(parsed,{tracks:[0],subdivision:4,transpose:12}).notes[0].midi,84);
const oldEnd=parsed.tracks[0].endOfTrackTicks;parsed.tracks[0].endOfTrackTicks=480*6;assert.equal(convertMidi(parsed,{tracks:[0],subdivision:4}).length,24);parsed.tracks[0].endOfTrackTicks=oldEnd;
assert.throws(()=>convertMidi(parsed,{tracks:[],subdivision:4}),/トラック/);
assert.throws(()=>convertMidi(parsed,{tracks:[0],subdivision:5}),/設定/);
assert.throws(()=>convertMidi({header:{ppq:480},tracks:[{notes:[{midi:72,ticks:MAX_STEPS*480,durationTicks:120}]}]},{tracks:[0],subdivision:4}),/不正|上限/);
assert.throws(()=>convertMidi({header:{ppq:480},tracks:[{notes:Array(MAX_NOTES+1).fill({midi:72,ticks:0,durationTicks:1})}]},{tracks:[0],subdivision:4}),/上限/);
const smpte=bytes.slice();smpte[12]=0xe7;assert.throws(()=>validateMidiHeader(smpte.buffer),/SMPTE/);
assert.throws(()=>validateMidiHeader(new ArrayBuffer(10*1024*1024+1)),/10MB/);
const templateExpectations=[['ode-to-joy',252,['E5','E5','F5','G5']],['fur-elise',48,['E6','D#6','E6','D#6']],['twinkle',188,['C5','C5','G5','G5']],['minuet',184,['G5','C5','D5','E5']]];
assert.equal(TEMPLATES.length,42);assert.equal(new Set(TEMPLATES.map(template=>template.id)).size,42);
assert.deepEqual(TEMPLATES.reduce((counts,t)=>({...counts,[t.category]:(counts[t.category]??0)+1}),{}),{'クラシック':31,'行進曲':7,'民謡など':4});
assert(!TEMPLATES.some(t=>/悲愴|埴生|トロイメライ|セレナーデ|^白鳥$|月光|アニー|ロンドンデリー|ダニー|花の歌|紡ぎ歌|K\.545|ユーモレスク/.test(t.title)));
for(const template of TEMPLATES){
  const {id}=template,score=templateScore(template),length=score.length,subdivision=template.subdivision??4;
  const expectation=templateExpectations.find(row=>row[0]===id);
  if(expectation){assert.equal(length,expectation[1],id);assert.deepEqual(score.notes.slice(0,4).map(note=>noteName(note.midi)),expectation[2],id);}
  const lastStep=Math.max(...score.notes.map(note=>note.step));
  assert(length>lastStep&&length-lastStep<=4,`${id}の末尾の空行が3ステップを超えています`);
  const interval=Math.round(60000/template.bpm/subdivision)/1000;
  assert(Math.max(length*interval,...score.notes.map(note=>note.step*interval+audioDurations.get(note.midi)))<=60,`${id}が音源の余韻を含めて60秒を超えています`);
  assert([3,4,6,8].includes(subdivision),id);assert(template.listen.startsWith('https://'));
  assert(template.bpm>=20&&template.bpm<=300);assert(template.source.startsWith('https://'));
  assert(score.notes.every(note=>ALLOWED.has(note.midi)),id);
  const melody=templateScore({...template,accompaniment:[]}),keys=new Set(score.notes.map(note=>`${note.step}:${note.midi}`));
  assert(melody.notes.every(note=>keys.has(`${note.step}:${note.midi}`)),`${id}の旋律が失われています`);
  assert(score.notes.length>melody.notes.length*1.5,`${id}の伴奏が不足しています`);
  assert.equal(score.notes.length,keys.size,`${id}の同音重複`);
  const rows=serialize(score.notes,score.length).trimEnd().split('\n');
  assert(rows.filter(row=>row.includes(',')).length>=6,`${id}の和音が不足しています`);
  assert(rows.every(row=>!row||row.split(',').length<=4),`${id}の和音が多すぎます`);
  assert.equal(serialize(score.notes,score.length).split('\n').length-1,length,id);
  const first=score.notes[0].midi;score.notes[0].midi=0;assert.equal(templateScore(template).notes[0].midi,first);
}
const canon=TEMPLATES.find(template=>template.id==='pachelbel-canon');
assert.equal(canon.bpm,55,'カノンは参照MIDIのゆったりしたテンポ');assert.equal(canon.subdivision,8);assert.equal(templateScore(canon).length,192);
assert(templateScore(canon).notes.every(note=>note.step<24*8),'カノンの25拍目以降は含めない');
assert.deepEqual(canon.melody.slice(0,6),[['G6',2],['E6',1],['F6',1],['G6',2],['E6',1],['F6',1]],'カノンのよく知られた速い変奏');
const canonBacking=new Set(templateScore({...canon,melody:[]}).notes.map(keyOf));
for(let cycle=0;cycle<3;cycle++)['C5','G4','A4','E4','F4','C4','F4','G4'].forEach((name,beat)=>assert(canonBacking.has(`${cycle*64+beat*8}:${noteNumber(cycle===2&&beat===7?'G3':name)}`),'カノンの定型低声は原譜に合わせて1拍ごとに進む'));
assert.deepEqual(canon.melody.slice(-3),[['G5',2],['B5',2],['C6',4]],'カノンは24拍目の中で終止する');
assert.deepEqual(serialize(templateScore(canon).notes,192).split('\n').slice(188,192),['C4,E4,G4,C6','','',''],'カノンの最後の和音と余韻');
const air=TEMPLATES.find(template=>template.id==='air-on-g'),airScore=templateScore(air);
assert.equal(air.subdivision,8);assert.equal(airScore.length,196);
assert.deepEqual(air.melody.slice(0,4),[['B5',36],['E6',2],['C6',2],['A5',2]],'アリアの長い冒頭と装飾');
for(const [step,name]of [[0,'G3'],[8,'F#5'],[16,'E4'],[24,'D4'],[32,'C4'],[192,'G5']])assert(airScore.notes.some(note=>note.step===step&&note.midi===noteNumber(name)),`アリアの低声とト長調の終止 ${step}:${name}`);
assert.deepEqual(TEMPLATES.find(t=>t.id==='blue-danube').melody.slice(0,5),[['C5',4],['C5',4],['E5',4],['G5',4],['G5',8]],'ドナウの弱起と有名な分散和音');
assert.equal(TEMPLATES.find(t=>t.id==='blue-danube').pickupBeats,1);
assert.equal(templateScore(TEMPLATES.find(t=>t.id==='stars-and-stripes')).length,256,'星条旗の主題と結びの16小節');
const gymnopedie=TEMPLATES.find(t=>t.id==='gymnopedie-1'),gymnopedieScore=templateScore(gymnopedie);
assert.equal(gymnopedie.bpm,64);assert.equal(gymnopedieScore.length,52,'ジムノペディは後半に進まず13拍で閉じる');
assert.deepEqual(gymnopedie.melody.slice(-2),[['G5',12],['E5',4]],'ジムノペディの冒頭主題と直後の終止音');
assert.equal(serialize(gymnopedieScore.notes,52).split('\n')[48],'C4,G4,B4,E5','ジムノペディの長七の終止');
const nocturne=TEMPLATES.find(t=>t.id==='chopin-nocturne-2'),nocturneScore=templateScore(nocturne);
assert.equal(nocturne.bpm,66,'ノクターンは参照譜の8分音符132に相当するテンポ');assert.equal(nocturne.pickupBeats,.5);
assert.equal(nocturneScore.length,88,'ノクターンは最初の主題の終止まで');
assert.deepEqual(nocturne.melody.slice(0,7),[['C5',2],['A5',8],['G5',2],['A5',2],['G5',6],['F5',4],['C5',2]],'ノクターンの有名な歌い出しをヘ長調で残す');
assert.equal(serialize(nocturneScore.notes,88).split('\n')[86],'F3,A4,C5,F5','ノクターンは次の弱起へ進まず主和音で閉じる');
assert(nocturneScore.notes.some(note=>note.step===28&&note.midi===noteNumber('F#5')),'ノクターンの原譜の左手にある属七の半音を残す');
const aveMaria=TEMPLATES.find(t=>t.id==='schubert-ave-maria'),aveMariaScore=templateScore(aveMaria);
assert.equal(aveMaria.bpm,54);assert.equal(aveMariaScore.length,20,'アヴェ・マリアは歌い出しの5拍だけ');
assert.deepEqual(aveMaria.melody,[['C6',6],['B5',1],['C6',1],['E6',7],['D6',1],['C6',4]],'アヴェ・マリアの最初の呼びかけの旋律');
assert.equal(serialize(aveMariaScore.notes,20).split('\n')[16],'C4,E4,G4,C6','アヴェ・マリアの呼びかけを主和音で閉じる');
const newWorld=TEMPLATES.find(t=>t.id==='new-world-largo'),newWorldScore=templateScore(newWorld);
assert.equal(newWorld.bpm,52);assert.equal(newWorldScore.length,68,'新世界は有名な主題4小節と短い終止');
assert.deepEqual(newWorld.melody.slice(0,11),[['E6',3],['G6',1],['G6',4],['E6',3],['D6',1],['C6',4],['E6',3],['F6',1],['G6',3],['F6',1],['E6',8]],'家路の主題の音程と付点のリズム');
assert.deepEqual(newWorld.melody.slice(-2),[['D6',9],['C6',4]],'新世界のタイを打ち直さず、隣の主音で終止');
const eineKleine=TEMPLATES.find(t=>t.id==='eine-kleine'),eineScore=templateScore(eineKleine);
assert.equal(eineKleine.bpm,112);assert.equal(eineScore.length,68);
assert.deepEqual(eineKleine.melody.slice(0,9),[['C6',6],['G5',2],['C6',6],['G5',2],['C6',2],['G5',2],['C6',2],['E6',2],['G6',8]],'アイネ・クライネの有名な冒頭を高い旋律で残す');
for(const step of [4,5,12,13,28,29,30,31,36,37,44,45,60,61,62,63])assert(!eineScore.notes.some(n=>n.step===step),'アイネ・クライネの冒頭の休符に伴奏を入れない');
assert.equal(serialize(eineScore.notes,68).split('\n')[64],'C4,E4,G4,C6','アイネ・クライネの短い終止');
for(const [id,length]of [['salut-damour',68],['sugar-plum-fairy',68],['csikos-post',132],['burgmuller-arabesque',68],['carmen-prelude',68]])assert.equal(templateScore(TEMPLATES.find(t=>t.id===id)).length,length,`${id}は抜粋全体を引き伸ばす反復を加えない`);
const salut=TEMPLATES.find(t=>t.id==='salut-damour');
assert(templateScore({...salut,accompaniment:[]}).notes.some(n=>n.step===36&&n.midi===noteNumber('G#5')),'愛の挨拶の原譜の半音を別の音に置き換えない');
assert.deepEqual(salut.melody.slice(-3),[['D6',6],['D#6',2],['E6',4]],'愛の挨拶は半音上の主和音の音で締める');
assert.equal(templateScore({melody:[['C5',8]]}).length,4,'終止の1音＋7空行を1音＋3空行にする');
assert.equal(templateScore({melody:[['',5],['C5',8]]}).length,8,'弱起の後も4ステップ単位で末尾を詰める');
assert.equal(templateScore({melody:[['C5',3]]}).length,3,'元の長さを超えて空行を増やさない');
assert.equal(templateScore({melody:[['',8]]}).length,8,'全休符は保持する');
assert.equal(serialize(templateScore({melody:[['',2],['C5',2],['',4],['E5',8]]}).notes,12),'\n\nC5\n\n\n\n\n\nE5\n\n\n\n','先頭と途中の休符は詰めない');
assert.throws(()=>templateScore({melody:[['C5',0]]}),/長さ/);
assert.throws(()=>templateScore({melody:[['F#4',4]]}),/対応外/);
const layered=templateScore({melody:[['C5',2]],accompaniment:[['C4,C5,E4',1],['D4',1],['',2]]});
assert.equal(layered.length,4);assert.equal(layered.notes.length,4);assert.equal(serialize(layered.notes,layered.length),'C4,E4,C5\nD4\n\n\n');
assert.throws(()=>templateScore({melody:[['C5',4]],accompaniment:[['F#4',4]]}),/対応外/);
assert.throws(()=>templateScore({melody:[['C5',4]],accompaniment:[['C4',0]]}),/長さ/);
await mkdir('.sites-runtime',{recursive:true});await writeFile('.sites-runtime/check.mid',bytes);
const html=await readFile('dist/index.html','utf8'),uiRevision=createHash('sha256').update(app.replace(/\r\n/g,'\n')).digest('hex').slice(0,16),cssRevision=createHash('sha256').update((await readFile('dist/style.css','utf8')).replace(/\r\n/g,'\n')).digest('hex').slice(0,16);
assert(html.includes(`src="app.js?v=${audioRevision}&templates=${templatesRevision}&ui=${uiRevision}"`),'スクリプトURLの更新識別子が内容と一致しません');
assert(html.includes(`href="style.css?v=${cssRevision}"`),'スタイルURLの更新識別子が内容と一致しません');
for(const match of app.matchAll(/\$\('([^']+)'\)/g))assert(html.includes(`id="${match[1]}"`),`UIがありません: ${match[1]}`);
assert(!/confirmReplace|beforeunload|confirmDialog/.test(app+html),'不要な確認が残っています');
// 最小限のDOMで、全ステップの描画と実際の履歴・リセット・キー操作を実行する。
const controls=new Map(),listeners=new Map();
const node=()=>({value:'',textContent:'',hidden:false,open:false,scrollLeft:0,scrollTop:0,scrollWidth:2000,children:[],dataset:{},classList:{add(){},toggle(){}},setAttribute(){},append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},querySelector(){return {};},querySelectorAll(){return [];}});
const element=id=>{if(!controls.has(id))controls.set(id,node());return controls.get(id);};
for(const [id,value]of Object.entries({fileName:'edited',bpm:'84',subdivision:'6',interval:'119',transpose:'12'}))element(id).value=value;
element('scoreTitle').textContent='編集したMIDI';element('rollViewport').scrollLeft=90;element('rollViewport').scrollTop=180;
const ui=runInNewContext(`
  let notes=[{step:9,midi:72},{step:45,midi:76},{step:46,midi:79},{step:49,midi:84}],length=50,beatsPerBar=3,pickupBeats=.5,history=[],sourceMidi={name:'MIDI'},currentTemplate=null,currentCell={step:49,midi:72};
  const pitches=Array.from({length:41},(_,i)=>93-i);
  ${app.slice(app.indexOf('function snapshot(){'),app.indexOf('function renderGrid(){'))}
  ${app.slice(app.indexOf('function renderGrid(){'),app.indexOf('function renderOutput(){'))}
  ${app.slice(app.indexOf("for(const [id,delta] of [['extend',4]"),app.indexOf('function undo(){'))}
  ${app.slice(app.indexOf('function undo(){'),app.indexOf('for(const template of TEMPLATES)'))}
  ${app.split('\n').find(line=>line.startsWith('function updateInterval(){'))}
  ({reset:()=>$('reset').onclick(),extend:()=>$('extend').onclick(),shrink:()=>$('shrink').onclick(),grid:renderGrid,state:()=>({notes,length,beatsPerBar,pickupBeats,sourceMidi,currentCell,historyLength:history.length})});
`,{$:element,MAX_STEPS,ALLOWED,noteName,keyOf,document:{createElement:node,addEventListener:(name,handler)=>listeners.set(name,handler)},midiSettings:()=>({tracks:[1,3]}),renderTracks:tracks=>{element('trackList').restored=tracks;},previewConversion(){},showTemplateInfo(){},render(){},stopPlayback(){},announce(){}});
const originalUI=JSON.stringify(ui.state());ui.reset();assert.equal(ui.state().length,32);assert.equal(ui.state().notes.length,0);assert.equal(ui.state().sourceMidi,null);assert.equal(element('interval').value,125);
let prevented=false;const key=meta=>({ctrlKey:!meta,metaKey:meta,shiftKey:false,altKey:false,key:'z',target:{closest:()=>null},preventDefault(){prevented=true;}});
listeners.get('keydown')(key(false));assert(prevented);assert.equal(JSON.stringify(ui.state()),originalUI);assert.equal(element('bpm').value,'84');assert.equal(element('fileName').value,'edited');assert.deepEqual(Array.from(element('trackList').restored),[1,3]);assert.equal(element('rollViewport').scrollTop,180);
ui.reset();listeners.get('keydown')({...key(false),target:{closest:()=>({})}});assert.equal(ui.state().notes.length,0,'入力欄の標準取り消しを妨げています');listeners.get('keydown')(key(true));assert.equal(JSON.stringify(ui.state()),originalUI);
ui.shrink();assert.equal(ui.state().length,46);assert.deepEqual(Array.from(ui.state().notes,note=>note.step),[9,45],'削除範囲の音が残っています');assert.equal(ui.state().currentCell.step,45);assert.equal(serialize(ui.state().notes,ui.state().length).split('\n').length-1,46);
listeners.get('keydown')(key(false));assert.equal(JSON.stringify(ui.state()),originalUI,'削除した音や編集位置を復元できません');assert.equal(element('rollViewport').scrollLeft,90);
for(let i=0;i<12;i++)ui.shrink();assert.equal(ui.state().length,2);const shortScore=JSON.stringify(ui.state());ui.shrink();assert.equal(JSON.stringify(ui.state()),shortScore,'4の倍数でない楽譜を削除しすぎています');ui.grid();assert(element('shrink').disabled);
for(let i=0;i<12;i++)listeners.get('keydown')(key(false));assert.equal(JSON.stringify(ui.state()),originalUI);
for(const start of [50,64,256]){
  if(start===64)ui.reset();
  while(ui.state().length<start)ui.extend();
  assert.equal(ui.state().length,start);
  const before=JSON.stringify({...ui.state(),historyLength:undefined}),oldLength=ui.state().length,oldScroll=element('rollViewport').scrollLeft;
  ui.extend();assert.equal(ui.state().length,oldLength+4);assert.equal(element('rollViewport').scrollLeft,element('rollViewport').scrollWidth);const extendedNotes=JSON.stringify(ui.state().notes);assert.equal(extendedNotes,JSON.stringify(JSON.parse(before).notes));
  ui.grid();const rows=element('roll').children;assert.equal(rows.length,42);assert(rows.every(row=>row.children.length===oldLength+5),'全ステップが描画されていません');assert.equal(rows[0].children.at(-1).dataset.step,oldLength+3);
  assert.equal(serialize(ui.state().notes,ui.state().length).split('\n').length-1,oldLength+4);
  ui.shrink();assert.equal(ui.state().length,oldLength);assert.equal(JSON.stringify(ui.state().notes),extendedNotes,'空のステップ削除で既存の音が変わっています');listeners.get('keydown')(key(false));assert.equal(ui.state().length,oldLength+4);
  listeners.get('keydown')(key(false));assert.equal(JSON.stringify({...ui.state(),historyLength:undefined}),before);assert.equal(element('rollViewport').scrollLeft,oldScroll);
}
while(ui.state().length+4<=MAX_STEPS)ui.extend();const capped=JSON.stringify(ui.state());ui.extend();assert.equal(JSON.stringify(ui.state()),capped,'上限を超えて追加しています');
ui.grid();assert(element('extend').disabled,'上限で追加ボタンが無効になっていません');
ui.reset();while(ui.state().length>4)ui.shrink();assert.equal(ui.state().length,4);const minimum=JSON.stringify(ui.state());ui.shrink();assert.equal(JSON.stringify(ui.state()),minimum,'空の楽譜まで削除しています');ui.grid();assert(element('shrink').disabled);assert(!element('extend').disabled);
listeners.get('keydown')(key(false));assert.equal(ui.state().length,8);ui.grid();assert(!element('shrink').disabled);
for(let i=0;i<35;i++)ui.reset();assert.equal(ui.state().historyLength,30);
// 実際の配置・音源再生処理を、最小限のAudioContextで確認する。
const played=[],fetched=[],audioErrors=[];let response,resumeResult;
class TestAudio{
  currentTime=12;destination={};
  resume(){return resumeResult;}
  async decodeAudioData(data){return {...data,duration:1};}
  createBufferSource(){return {connect(){},disconnect(){},stop(){},start(time){played.push({name:this.buffer.name,time});}};}
  createGain(){return {gain:{},connect(){},disconnect(){}};}
}
const sound=runInNewContext(`
  let notes=[],audio=null,player=null,playbackRequest=0;const audioBuffers=new Map(),activeVoices=new Set();
  ${app.slice(app.indexOf('function paint('),app.indexOf("$('roll').addEventListener('pointerdown'"))}
  ${app.slice(app.indexOf('function stopPlayback(){'),app.indexOf("$('play').onclick="))}
  ({edit:(step,midi,on)=>{stopPlayback();paint({dataset:{step,midi},classList:{toggle(){}},setAttribute(){}},on);},stop:stopPlayback,preview:previewTone,state:()=>notes});
`,{$:element,ALLOWED,keyOf,noteName,window:{AudioContext:TestAudio},clearTimeout,renderOutput(){},announce:(message,error)=>{if(error)audioErrors.push(message);},fetch:async url=>{fetched.push(url);return response??{ok:true,arrayBuffer:async()=>({name:decodeURIComponent(url.split('/').at(-1).split('.ogg')[0])})};}});
const settle=()=>new Promise(setImmediate);
sound.edit(0,72,true);await settle();assert.deepEqual(played,[{name:'C5',time:12}]);assert.equal(sound.state().length,1);
sound.edit(0,72,true);sound.edit(0,72,false);await settle();assert.equal(played.length,1,'重複入力や削除で音が鳴っています');
sound.edit(0,72,true);await settle();assert.equal(played.length,2);assert.equal(fetched.length,1,'読み込み済みの音源を再取得しています');
sound.edit(0,66,true);await settle();assert.equal(played.length,2);assert.equal(sound.state().length,1,'対応外の音を配置しています');
let finishLoad;response=new Promise(resolve=>{finishLoad=resolve;});sound.edit(1,76,true);await settle();sound.stop();finishLoad({ok:true,arrayBuffer:async()=>({name:'E5'})});await settle();assert.equal(played.length,2,'停止した入力の音が後から鳴っています');
response={ok:false};sound.edit(2,79,true);await settle();assert.equal(played.length,2);assert.equal(sound.state().length,3,'音源エラーで楽譜が失われています');assert.match(audioErrors.at(-1),/G5の音源を読み込めません/);
let finishResume;resumeResult=new Promise(resolve=>{finishResume=resolve;});const previousFetches=fetched.length,pendingPreview=sound.preview(84);sound.stop();finishResume();await pendingPreview;assert.equal(fetched.length,previousFetches,'停止後に音源を読み込んでいます');
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(match[1].startsWith('data:')||match[1]==='./')continue;await readFile('dist/'+match[1].split('?')[0]);}
process.stdout.write('確認成功: 30音・OGG音源・テンプレート42曲の音域と和音と余韻込み60秒以内・配置時の試聴と取り消し・音源キャッシュと失敗時の楽譜保持・更新識別子・TXT形式・MIDI変換・上限・UI参照・全ステップ描画・4ステップの追加と削除・スクロール・削除した音の復元・リセット・Ctrl/Command+Z・MIDI設定と履歴の復元\n');
