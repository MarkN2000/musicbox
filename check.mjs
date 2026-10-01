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
assert.equal(aveMaria.bpm,54);assert.equal(aveMaria.subdivision,8);assert.equal(aveMariaScore.length,188,'アヴェ・マリアは続く旋律も含め、テンポを保って23.5拍');
assert.deepEqual(aveMaria.melody.slice(0,13),[['G5',12],['F#5',2],['G5',2],['B5',14],['A5',2],['G5',8],['',8],['A5',8],['G5',2],['F#5',2],['E5',2],['F#5',2],['G5',8]],'アヴェ・マリアの呼びかけと続く旋律の音程・休符');
assert.deepEqual(aveMaria.melody.slice(-8),[['A5',9],['E5',2],['F#5',1],['G5',1],['F#5',2],['E5',1],['D5',8],['G5',4]],'アヴェ・マリアは下降する旋律から終止し、次の句の弱起を入れない');
for(const [step,name]of [[12,'C#5'],[94,'C#6'],[96,'G4'],[104,'A#5'],[112,'D#5'],[144,'F#5'],[152,'G#5']])assert(aveMariaScore.notes.some(note=>note.step===step&&note.midi===noteNumber(name)),`アヴェ・マリアの旋律と伴奏の半音を残す ${step}:${name}`);
assert(aveMariaScore.notes.some(note=>note.step===40),'アヴェ・マリアの歌唱の休符には伴奏を続ける');
assert.equal(serialize(aveMariaScore.notes,188).split('\n')[184],'G3,B4,D5,G5','アヴェ・マリアをト長調の主和音で閉じる');
const newWorld=TEMPLATES.find(t=>t.id==='new-world-largo'),newWorldScore=templateScore(newWorld);
assert.equal(newWorld.bpm,52);assert.equal(newWorldScore.length,68,'新世界は有名な主題4小節と短い終止');
assert.deepEqual(newWorld.melody.slice(0,11),[['E6',3],['G6',1],['G6',4],['E6',3],['D6',1],['C6',4],['E6',3],['F6',1],['G6',3],['F6',1],['E6',8]],'家路の主題の音程と付点のリズム');
assert.deepEqual(newWorld.melody.slice(-2),[['D6',9],['C6',4]],'新世界のタイを打ち直さず、隣の主音で終止');
const eineKleine=TEMPLATES.find(t=>t.id==='eine-kleine'),eineScore=templateScore(eineKleine);
assert.equal(eineKleine.bpm,112);assert.equal(eineScore.length,76);
assert.deepEqual(eineKleine.melody.slice(0,9),[['C6',6],['G5',2],['C6',6],['G5',2],['C6',2],['G5',2],['C6',2],['E6',2],['G6',8]],'アイネ・クライネの有名な冒頭を高い旋律で残す');
for(const step of [4,5,12,13,28,29,30,31,36,37,44,45])assert(!eineScore.notes.some(n=>n.step===step),'アイネ・クライネの冒頭の休符に伴奏を入れない');
assert.deepEqual(eineKleine.melody.slice(-6),[['G5',4],['B5',2],['D6',2],['C6',4],['G5',4],['C5',4]],'アイネ・クライネは属和音から主音に解決し、低い主音で締める');
assert.equal(serialize(eineScore.notes,76).split('\n')[72],'C4,E4,G4,C5','アイネ・クライネの最後の主和音');
for(const [id,length]of [['csikos-post',132],['burgmuller-arabesque',68],['carmen-prelude',68]])assert.equal(templateScore(TEMPLATES.find(t=>t.id===id)).length,length,`${id}は抜粋全体を引き伸ばす反復を加えない`);
const sugar=TEMPLATES.find(t=>t.id==='sugar-plum-fairy'),sugarScore=templateScore(sugar);
assert.equal(sugar.bpm,80);assert.equal(sugarScore.length,68);
assert.deepEqual(sugar.melody.slice(0,7),[['',32],['',2],['G5',1],['E5',1],['G5',2],['F#5',2],['D#5',2]],'金平糖は4小節の導入から原曲のチェレスタ主題へ入る');
assert.equal(serialize(sugarScore.notes,68).split('\n')[2],'G4,B4,E5','金平糖の冒頭の刻む和音');
assert.equal(serialize(sugarScore.notes,68).split('\n')[64],'E4,G4,B4,E5','金平糖はホ短調の主和音で閉じる');
const flowers=TEMPLATES.find(t=>t.id==='waltz-of-flowers'),flowersScore=templateScore(flowers);
assert.equal(flowers.bpm,112);assert.equal(flowers.beatsPerBar,3);assert.equal(flowers.subdivision,6);assert.equal(flowersScore.length,272);
assert.deepEqual(flowers.melody.slice(0,8),[['C5',6],['F5',6],['A5',6],['A#5',16],['A5',2],['A5',18],['A5',18],['',12]],'花のワルツはホルンの主題から始め、長音を小節ごとに鳴らす');
assert.deepEqual(flowers.melody.slice(14,20),[['A5',12],['F5',6],['G5',12],['E5',6],['F5',12],['D5',6]],'花のワルツは続く有名な主題もヘ長調で残す');
assert.equal(serialize(flowersScore.notes,272).split('\n')[270],'F3,A4,C5,F5','花のワルツの主和音の終止');
const maiden=TEMPLATES.find(t=>t.id==='maidens-prayer'),maidenScore=templateScore(maiden);
assert.equal(maiden.bpm,78);assert.equal(maiden.subdivision,6);assert.equal(maidenScore.length,100);
assert.deepEqual(maiden.melody.slice(0,8),[['E6',6],['D6',6],['C6',6],['B5',6],['A5',6],['G5',6],['F5',6],['E5',6]],'乙女の祈りは冒頭の下降する旋律から始める');
assert.deepEqual(maiden.melody.slice(8,16),[['G5',2],['C6',2],['E6',2],['G5',2],['C6',2],['E6',2],['G6',9],['E6',3]],'乙女の祈りの有名な第1主題まで含め、三連符と付点を保つ');
assert.deepEqual(maiden.melody.slice(-4),[['G5',2],['B5',2],['D6',2],['C6',4]],'乙女の祈りは属和音から主音へ戻して閉じる');
assert.equal(maiden.listen,'https://www.youtube.com/watch?v=HDAofQTcwQE');
assert.equal(serialize(maidenScore.notes,100).split('\n')[96],'C4,E4,G4,C6','乙女の祈りは主和音で短く閉じる');
const salut=TEMPLATES.find(t=>t.id==='salut-damour'),salutScore=templateScore(salut);
assert.equal(salut.bpm,76);assert.equal(salutScore.length,76,'愛の挨拶は主題8小節に短い結びを添える');
assert(templateScore({...salut,accompaniment:[]}).notes.some(n=>n.step===36&&n.midi===noteNumber('G#5')),'愛の挨拶の原譜の半音を別の音に置き換えない');
assert.deepEqual(salut.melody.slice(-6),[['D6',6],['B5',2],['C6',4],['G5',2],['E5',2],['C5',4]],'愛の挨拶は主音へ解決した後、分散和音を下降して締める');
assert.equal(serialize(salutScore.notes,76).split('\n')[72],'C4,E4,G4,C5','愛の挨拶の最後はハ長調の主和音');
const swanLake=TEMPLATES.find(t=>t.id==='swan-lake-scene'),swanLakeScore=templateScore(swanLake);
assert.equal(swanLake.bpm,72);assert.equal(swanLake.pickupBeats,0);assert.equal(swanLakeScore.length,52,'白鳥の湖は主題3小節と次の終止音に絞る');
assert.deepEqual(swanLake.melody.slice(0,9),[['E6',8],['A5',2],['B5',2],['C6',2],['D6',2],['E6',6],['C6',2],['E6',6],['C6',2]],'白鳥の湖の高い長音から始まる有名なオーボエの音程とリズム');
assert.deepEqual(swanLake.melody.slice(-7),[['E6',6],['C6',2],['D6',2],['C6',2],['B5',2],['D6',2],['A5',4]],'白鳥の湖の主題から次の落ち着く音まで');
assert.equal(serialize(swanLakeScore.notes,52).split('\n')[48],'A4,C5,E5,A5','白鳥の湖のイ短調の終止');
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
const controls=new Map(),listeners=new Map(),windowListeners=new Map();let nodeCount=0,outputWrites=0,focusedNode;
const nodeMethods={
  get firstElementChild(){return this.children[0];},get lastElementChild(){return this.children.at(-1);},
  get classList(){const cell=this;return {toggle(name,on){const names=new Set(cell.className.split(' ').filter(Boolean));if(on??!names.has(name))names.add(name);else names.delete(name);cell.className=[...names].join(' ');},add(name){this.toggle(name,true);},remove(name){this.toggle(name,false);}};},
  setAttribute(name,value){this.attributes[name]=String(value);},getAttribute(name){return this.attributes[name]??null;},
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}},replaceChildren(){this.children=[];},
  remove(){const siblings=this.parent.children;if(siblings.at(-1)===this)siblings.pop();else siblings.splice(siblings.indexOf(this),1);this.parent=null;},
  querySelectorAll(selector){return this.children.flatMap(row=>row.children).filter(cell=>selector.split(',').some(name=>cell.className.split(' ').includes(name.slice(1))));},
  addEventListener(name,handler){(this.events??={})[name]=handler;},closest(){return this;},focus(){focusedNode=this;}
};
const node=()=>{nodeCount++;return Object.assign(Object.create(nodeMethods),{value:'',textContent:'',className:'',hidden:false,open:false,checked:false,scrollLeft:0,scrollWidth:2000,children:[],dataset:{},attributes:{}});};
const element=id=>{if(!controls.has(id))controls.set(id,node());return controls.get(id);};
for(const [id,value]of Object.entries({fileName:'edited',bpm:'84',subdivision:'6',interval:'119',transpose:'12'}))element(id).value=value;
element('scoreTitle').textContent='編集したMIDI';element('rollViewport').scrollLeft=90;
const ui=runInNewContext(`
  let notes=[{step:9,midi:72},{step:45,midi:76},{step:46,midi:79},{step:49,midi:84}],length=50,beatsPerBar=3,pickupBeats=.5,history=[],sourceMidi={name:'MIDI'},currentTemplate=null,currentCell={step:49,midi:72},focusedCell=null,drag=null;
  const pitches=Array.from({length:41},(_,i)=>93-i);
  ${app.slice(app.indexOf('function snapshot(){'),app.indexOf('function renderGrid(){'))}
  ${app.slice(app.indexOf('function renderGrid(){'),app.indexOf('function renderOutput(){'))}
  ${app.slice(app.indexOf('function paint('),app.indexOf("for(const [id,delta] of [['extend',4]"))}
  ${app.slice(app.indexOf("for(const [id,delta] of [['extend',4]"),app.indexOf('function undo(){'))}
  ${app.slice(app.indexOf('function undo(){'),app.indexOf('for(const template of TEMPLATES)'))}
  ${app.split('\n').find(line=>line.startsWith('function updateInterval(){'))}
  ({reset:()=>$('reset').onclick(),extend:()=>$('extend').onclick(),shrink:()=>$('shrink').onclick(),grid:renderGrid,cell:getCell,setScore:score=>{notes=score;},rhythm:(subdivision,beats,pickup)=>{$('subdivision').value=subdivision;beatsPerBar=beats;pickupBeats=pickup;},state:()=>({notes,length,beatsPerBar,pickupBeats,sourceMidi,currentCell,historyLength:history.length})});
`,{$:element,MAX_STEPS,ALLOWED,noteName,keyOf,document:{createElement:node,addEventListener:(name,handler)=>listeners.set(name,handler)},window:{addEventListener:(name,handler)=>windowListeners.set(name,handler)},midiSettings:()=>({tracks:[1,3]}),renderTracks:tracks=>{element('trackList').restored=tracks;},previewConversion(){},showTemplateInfo(){},render(){},renderOutput(){outputWrites++;},previewTone(){},stopPlayback(){},announce(){}});
const originalUI=JSON.stringify(ui.state());ui.reset();assert.equal(ui.state().length,32);assert.equal(ui.state().notes.length,0);assert.equal(ui.state().sourceMidi,null);assert.equal(element('interval').value,125);
let prevented=false;const key=meta=>({ctrlKey:!meta,metaKey:meta,shiftKey:false,altKey:false,key:'z',target:{closest:()=>null},preventDefault(){prevented=true;}});
listeners.get('keydown')(key(false));assert(prevented);assert.equal(JSON.stringify(ui.state()),originalUI);assert.equal(element('bpm').value,'84');assert.equal(element('fileName').value,'edited');assert.deepEqual(Array.from(element('trackList').restored),[1,3]);assert.equal(element('rollViewport').scrollLeft,90);
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
  ui.grid();const rows=element('roll').children;assert.equal(rows.length,42);assert(rows.every(row=>row.children.length===oldLength+5),'全ステップが描画されていません');assert.equal(Number(rows[0].children.at(-1).dataset.step),oldLength+3);
  assert.equal(serialize(ui.state().notes,ui.state().length).split('\n').length-1,oldLength+4);
  ui.shrink();assert.equal(ui.state().length,oldLength);assert.equal(JSON.stringify(ui.state().notes),extendedNotes,'空のステップ削除で既存の音が変わっています');listeners.get('keydown')(key(false));assert.equal(ui.state().length,oldLength+4);
  listeners.get('keydown')(key(false));assert.equal(JSON.stringify({...ui.state(),historyLength:undefined}),before);assert.equal(element('rollViewport').scrollLeft,oldScroll);
}
while(ui.state().length+4<=MAX_STEPS)ui.extend();const capped=JSON.stringify(ui.state());ui.extend();assert.equal(JSON.stringify(ui.state()),capped,'上限を超えて追加しています');
ui.grid();assert(element('extend').disabled,'上限で追加ボタンが無効になっていません');
ui.reset();while(ui.state().length>4)ui.shrink();assert.equal(ui.state().length,4);const minimum=JSON.stringify(ui.state());ui.shrink();assert.equal(JSON.stringify(ui.state()),minimum,'空の楽譜まで削除しています');ui.grid();assert(element('shrink').disabled);assert(!element('extend').disabled);
listeners.get('keydown')(key(false));assert.equal(ui.state().length,8);ui.grid();assert(!element('shrink').disabled);
for(let i=0;i<35;i++)ui.reset();assert.equal(ui.state().historyLength,30);
ui.grid();const firstCell=ui.cell(0,72),otherCell=ui.cell(1,72),row=element('roll').children[1];let created=nodeCount,writes=outputWrites;
const pointer=cell=>({target:cell,button:0,pointerType:'mouse',preventDefault(){}});
element('roll').events.pointerdown(pointer(firstCell));element('roll').events.pointerover(pointer(otherCell));assert.equal(outputWrites,writes,'ドラッグ中に出力を毎回作り直しています');windowListeners.get('pointerup')();assert.equal(outputWrites,writes+1);
assert.equal(nodeCount,created,'音配置でマスを作り直しています');assert.equal(ui.cell(0,72),firstCell);assert.equal(firstCell.getAttribute('aria-pressed'),'true');assert.equal(otherCell.getAttribute('aria-pressed'),'true');
element('roll').events.keydown({...pointer(firstCell),key:'ArrowRight'});assert.equal(focusedNode,otherCell);assert.equal(firstCell.tabIndex,-1);assert.equal(otherCell.tabIndex,0);
element('roll').events.click({...pointer(ui.cell(2,72)),pointerType:'touch',detail:1});assert.equal(ui.cell(2,72).getAttribute('aria-pressed'),'true');assert.equal(focusedNode,ui.cell(2,72));
writes=outputWrites;element('roll').events.pointerdown(pointer(ui.cell(3,72)));windowListeners.get('pointercancel')();assert.equal(outputWrites,writes+1,'中断したドラッグの出力が更新されません');
ui.grid();assert.equal(nodeCount,created,'同じ構造の描画でマスを作り直しています');ui.extend();ui.grid();assert.equal(nodeCount-created,42*4,'末尾4列以外も作り直しています');created=nodeCount;ui.shrink();ui.grid();assert.equal(nodeCount,created);assert.equal(element('roll').children[1],row);assert.equal(ui.cell(0,72),firstCell);
ui.setScore([{step:0,midi:66},{step:0,midi:120}]);ui.grid();const outsideCell=ui.cell(0,66);assert.equal(outsideCell.disabled,false);assert.equal(outsideCell.getAttribute('aria-pressed'),'true');element('roll').events.click({...pointer(outsideCell),detail:0});assert.equal(outsideCell.disabled,true,'削除した対応外のマスが無効になりません');assert.match(outsideCell.getAttribute('aria-label'),/対応外/);assert.equal(firstCell.tabIndex,0);listeners.get('keydown')(key(false));ui.grid();assert.equal(outsideCell.disabled,false,'取り消した対応外の音を復元できません');
ui.rhythm(6,3,.5);ui.grid();assert.equal(nodeCount,created);assert.equal(element('roll').firstElementChild.children[7].textContent,'2');assert.match(firstCell.parent.children[4].className,/\bbar\b/,'拍子・弱起の変更で小節線を更新できません');ui.rhythm(4,4,0);ui.grid();
// 実際の配置・音源再生処理を、最小限のAudioContextで確認する。
const played=[],fetched=[],audioErrors=[];let response,resumeResult,scheduledTick;
class TestAudio{
  currentTime=12;destination={};
  resume(){return resumeResult;}
  async decodeAudioData(data){return {...data,duration:1};}
  createBufferSource(){return {connect(){},disconnect(){},stop(){},start(time){played.push({name:this.buffer.name,time});}};}
  createGain(){return {gain:{},connect(){},disconnect(){}};}
}
const sound=runInNewContext(`
  let notes=[],length=4,audio=null,player=null,playbackRequest=0,drag=null;const audioBuffers=new Map(),audioLoads=new Map(),activeVoices=new Set();
  ${app.slice(app.indexOf('function updateCell('),app.indexOf('function focusCell('))}
  ${app.slice(app.indexOf('function markStep('),app.indexOf('function renderOutput('))}
  ${app.slice(app.indexOf('function paint('),app.indexOf("$('roll').addEventListener('pointerdown'"))}
  ${app.slice(app.indexOf('function stopPlayback(){'),app.indexOf("$('play').onclick="))}
  ${app.slice(app.indexOf("$('play').onclick="),app.indexOf('function midiSettings(){'))}
  ({edit:(step,midi,on)=>{stopPlayback();paint({dataset:{step,midi},classList:{toggle(){}},setAttribute(){}},on);},stop:stopPlayback,preview:previewTone,load:loadTone,state:()=>notes,play:()=>$('play').onclick(),setScore:(score,steps)=>{notes=score;length=steps;},setTime:time=>{audio.currentTime=time;},time:()=>audio.currentTime,playback:()=>player});
`,{$:element,ALLOWED,keyOf,noteName,window:{AudioContext:TestAudio},document:{addEventListener(){}},setTimeout:tick=>{scheduledTick=tick;return 1;},clearTimeout:()=>{scheduledTick=null;},renderOutput(){},announce:(message,error)=>{if(error)audioErrors.push(message);},fetch:async url=>{fetched.push(url);return response??{ok:true,arrayBuffer:async()=>({name:decodeURIComponent(url.split('/').at(-1).split('.ogg')[0])})};}});
const settle=()=>new Promise(setImmediate);
sound.edit(0,72,true);await settle();assert.deepEqual(played,[{name:'C5',time:12}]);assert.equal(sound.state().length,1);
sound.edit(0,72,true);sound.edit(0,72,false);await settle();assert.equal(played.length,1,'重複入力や削除で音が鳴っています');
sound.edit(0,72,true);await settle();assert.equal(played.length,2);assert.equal(fetched.length,1,'読み込み済みの音源を再取得しています');
sound.edit(0,66,true);await settle();assert.equal(played.length,2);assert.equal(sound.state().length,1,'対応外の音を配置しています');
let finishLoad;response=new Promise(resolve=>{finishLoad=resolve;});const loadsBefore=fetched.length;sound.edit(1,76,true);await settle();assert.equal(sound.load(76),sound.load(76),'読み込み中の音源を共有していません');assert.equal(fetched.length,loadsBefore+1);sound.stop();finishLoad({ok:true,arrayBuffer:async()=>({name:'E5'})});await settle();assert.equal(played.length,2,'停止した入力の音が後から鳴っています');
response={ok:false};sound.edit(2,79,true);await settle();assert.equal(played.length,2);assert.equal(sound.state().length,3,'音源エラーで楽譜が失われています');assert.match(audioErrors.at(-1),/G5の音源を読み込めません/);
let finishResume;resumeResult=new Promise(resolve=>{finishResume=resolve;});const previousFetches=fetched.length,pendingPreview=sound.preview(84);sound.stop();finishResume();await pendingPreview;assert.equal(fetched.length,previousFetches,'停止後に音源を読み込んでいます');
response=resumeResult=undefined;const silentCount=played.length;await Promise.all([...ALLOWED].map(sound.load));assert.equal(played.length,silentCount,'先読みで音を鳴らしています');assert.equal(new Set(fetched).size,30,'共通30音源を準備できません');assert.equal(fetched.filter(url=>url.includes('/G5.ogg')).length,2,'失敗した音源を再試行できません');
const loadedCount=fetched.length;sound.setScore([{step:0,midi:93}],4);element('interval').value=125;await sound.play();assert.equal(fetched.length,loadedCount,'別の楽譜で準備済みの音源を再取得しています');sound.stop();
// 音源の余韻より短い曲でも、音声クロック上の同じ間隔で繰り返す。
response=resumeResult=undefined;sound.setScore([{step:0,midi:72},{step:3,midi:72}],4);element('interval').value=125;
const advance=time=>{while(sound.time()<time&&scheduledTick){sound.setTime(Math.min(time,sound.time()+.025));scheduledTick();}},near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,`再生時刻がずれています: ${actual} / ${expected}`);
let playCount=played.length;await sound.play();let start=sound.playback().start;advance(start+.5);assert.equal(played.length-playCount,2,'ループオフで繰り返しています');advance(start+1.3);assert(sound.playback(),'余韻を途中で止めています');advance(start+1.4);assert.equal(sound.playback(),null);
playCount=played.length;await sound.play();start=sound.playback().start;element('loop').checked=true;advance(start+.45);advance(start+.95);
for(const [i,offset]of[0,.375,.5,.875,1].entries())near(played[playCount+i].time,start+offset);
assert.equal(sound.playback().visual,3,'2周目の表示位置が先頭に戻っていません');element('loop').checked=false;advance(start+1.4);assert.equal(played.length-playCount,6,'オフにした周回を最後まで再生していません');advance(start+2.4);assert.equal(sound.playback(),null,'ループをオフにしても終了しません');
element('loop').checked=true;await sound.play();const pendingTick=scheduledTick;sound.stop();playCount=played.length;pendingTick();assert.equal(played.length,playCount);assert.equal(sound.playback(),null);assert.equal(scheduledTick,null,'停止後もループのタイマーが残っています');
sound.setScore([{step:0,midi:72}],1);element('interval').value=10;await sound.play();start=sound.playback().start;advance(start+.02);assert(sound.playback().next>1,'1ステップの楽譜をループできません');sound.stop();element('loop').checked=false;
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(match[1].startsWith('data:')||match[1]==='./')continue;await readFile('dist/'+match[1].split('?')[0]);}
process.stdout.write('確認成功: 30音・OGG音源・テンプレート42曲の音域と和音と余韻込み60秒以内・配置時の試聴と取り消し・音源キャッシュと失敗時の楽譜保持・ループ再生と途中の切り替え・更新識別子・TXT形式・MIDI変換・上限・UI参照・全ステップ描画・4ステップの追加と削除・スクロール・削除した音の復元・リセット・Ctrl/Command+Z・MIDI設定と履歴の復元\n');
