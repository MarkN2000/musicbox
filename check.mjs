import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {NOTE_NAMES,ALLOWED,noteName,noteNumber,serialize,convertMidi,suggestMidiTranspositions,validateMidiHeader,validateNote,keyOf,MAX_STEPS,MAX_NOTES} from './dist/core.js';
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
const coreRevision=createHash('sha256').update((await readFile('dist/core.js','utf8')).replace(/\r\n/g,'\n')).digest('hex').slice(0,16);
assert(app.includes(`from './core.js?v=${coreRevision}'`),'出力処理URLの更新識別子が内容と一致しません');
assert(app.includes(`.ogg?v=${audioRevision}`),'音源URLの更新識別子が音源の内容と一致しません');
assert(app.includes(`from './templates.js?v=${templatesRevision}'`),'テンプレートURLの更新識別子が内容と一致しません');
assert(!ALLOWED.has(noteNumber('F#4')));assert(!ALLOWED.has(noteNumber('F#6')));
assert.equal(serialize([{step:1,midi:72},{step:1,midi:79},{step:1,midi:72},{step:1,midi:76},{step:3,midi:74}],5),'\nC5,E5,G5\n\nD5\n\n');
assert.equal(serialize([],3),'\n\n\n');
assert.equal(serialize([{step:1,midi:72},{step:1,midi:76},{step:3,midi:74}],5,125),'step_ms=125\n\nC5,E5\n\nD5\n\n','設定行を加えても先頭・途中・末尾の休符を保つ');
assert.equal(serialize([],3,125),'step_ms=125\n\n\n\n');
for(const interval of [10,125.5,5000])assert.equal(serialize([],1,interval),`step_ms=${interval}\n\n`);
for(const interval of [0,9,5001,NaN,Infinity,'125',null])assert.throws(()=>serialize([],1,interval),/再生間隔/);
assert.throws(()=>serialize([{step:0,midi:66}],1),/対応外/);assert.throws(()=>serialize([{step:1,midi:72}],1),/不正/);
assert.throws(()=>validateMidiHeader(new Uint8Array(14).buffer),/MIDI/);
const midi=new Midi();midi.header.setTempo(120);const track=midi.addTrack();track.name='Melody';
track.addNote({midi:72,ticks:480,durationTicks:120});track.addNote({midi:76,ticks:480,durationTicks:120});track.addNote({midi:72,ticks:485,durationTicks:120});track.addNote({midi:66,ticks:720,durationTicks:120});track.addNote({midi:79,ticks:1200,durationTicks:960});
const drums=midi.addTrack();drums.channel=9;drums.name='Drums';drums.addNote({midi:36,ticks:0,durationTicks:100});
const bytes=midi.toArray();validateMidiHeader(bytes.buffer);const parsed=new Midi(bytes);assert(parsed.tracks[1].instrument.percussion);
const converted=convertMidi(parsed,{tracks:[0],subdivision:4});assert.equal(converted.notes.length,4);assert.equal(converted.merged,1);assert.equal(converted.notes[0].step,4);assert.equal(converted.length,18);assert(converted.notes.some(note=>!ALLOWED.has(note.midi)));
assert.equal(convertMidi(parsed,{tracks:[0],subdivision:3}).notes[0].step,3);
assert.equal(convertMidi(parsed,{tracks:[0],subdivision:4,transpose:12}).notes[0].midi,84);
const transposeSettings={tracks:[0],subdivision:4},suggested=suggestMidiTranspositions(parsed,transposeSettings);
assert.equal(suggested[0].transpose,-1);assert.equal(suggested[0].outside,0);assert.equal(suggested[0].total,4,'量子化後の重複を省かれる音数に含めない');
const singlePitch=pitch=>({header:{ppq:480},tracks:[{notes:[{midi:pitch,ticks:0,durationTicks:120}]}]});
assert.deepEqual(suggestMidiTranspositions(singlePitch(66),transposeSettings).map(candidate=>candidate.transpose),[-1,1,-2],'同数なら移動幅を優先し、同じ幅なら低い候補を先にする');
assert.equal(suggestMidiTranspositions(singlePitch(72),transposeSettings)[0].transpose,0);
assert.deepEqual(suggestMidiTranspositions({header:{ppq:480},tracks:[{notes:[{midi:0,ticks:0,durationTicks:1},{midi:127,ticks:480,durationTicks:1}]}]},transposeSettings).map(candidate=>candidate.transpose),[0],'MIDIの音高範囲を外れる候補は提示しない');
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
// 行進曲は原譜の指定主題を一巡し、以前の別の節や不完全な反復へ戻さない。
const marches=Object.fromEntries(TEMPLATES.filter(t=>t.category==='行進曲').map(t=>[t.id,t]));
const marchHeads={
 'british-grenadiers':['G5','C6','G5','C6','D6','E6','D6','E6','F6'],
 'us-field-artillery':['G5','G5','C6','C6','G5','G5','G5','A5','B5','C6','A5'],
 'when-johnny':['E5','A5','A5','A5','B5','C6','B5','C6','A5'],
 'battle-hymn':['G5','G5','G5','G5','F5','E5','G5','C6','D6'],
 'radetzky-march':['F5','F5','F5','F5','F5','F5','A5','G5','F5','E5'],
 'stars-and-stripes':['F5','E5','F5','D5','F5','G5','G#5','A5','A#5','B5'],
};
for(const [id,head]of Object.entries(marchHeads))assert.deepEqual(marches[id].melody.filter(([name])=>name).slice(0,head.length).map(([name])=>name),head,`${id}の指定主題の歌い出し`);
assert.equal(marches['british-grenadiers'].beatsPerBar,2);
assert.equal(marches['us-field-artillery'].melody.reduce((sum,[,span])=>sum+span,0),132,'野砲隊は弱起とコーラス16小節');
const fieldLead=templateScore({...marches['us-field-artillery'],accompaniment:[]}).notes;
for(const [step,name]of [[20,'A5'],[23,'B5'],[24,'C6'],[26,'A5'],[36,'C6'],[38,'C6'],[42,'B5'],[44,'A5'],[84,'A5'],[98,'F5'],[100,'G5'],[102,'F5'],[106,'D5']])assert(fieldLead.some(n=>n.step===step&&n.midi===noteNumber(name)),`野砲隊の原譜のコーラスの音程・調号 ${step}:${name}`);
assert(!marches['us-field-artillery'].melody.some(([name])=>name==='G#5'),'野砲隊に原譜にない嬰ト音を加えない');
assert.equal(marches['when-johnny'].bpm,120,'ジョニーは付点四分音符80で6/8の主題を演奏する');
assert.equal(marches['when-johnny'].melody.reduce((sum,[,span])=>sum+span,0),192,'ジョニーは歌い出しから結びまで16小節');
assert.deepEqual(marches['when-johnny'].melody.slice(-6),[['E5',2],['A5',2],['A5',2],['A5',4],['G#5',2],['A5',10]],'ジョニーの原譜の結びを残す');
assert.deepEqual(marches['battle-hymn'].melody.slice(-5),[['D6',1],['C6',4],['B5',4],['C6',8],['',6]],'リパブリックはコーラスへ進まず歌い出しの節で終止する');
assert.equal(marches['radetzky-march'].bpm/2,108,'ラデツキーの2/2は2分音符108で進み、半分の速さにしない');
assert.equal(marches['radetzky-march'].pickupBeats,0);assert.equal(templateScore(marches['radetzky-march']).length,208,'ラデツキーは導入4小節・主題8小節・終止1小節');
const radLead=templateScore({...marches['radetzky-march'],accompaniment:[]}).notes;
for(const [step,name]of [[160,'G5'],[164,'E6'],[168,'F5'],[172,'D6']])assert(radLead.some(n=>n.step===step&&n.midi===noteNumber(name)),`ラデツキーの主題末尾の跳躍を一括移調で残す ${step}:${name}`);
assert.equal(marches['stars-and-stripes'].bpm/2,112,'星条旗の2/2は2分音符112で進む');
assert.equal(templateScore(marches['stars-and-stripes']).length,320,'星条旗は導入4小節と第1主題16小節を終止まで一巡する');
assert.deepEqual(marches['stars-and-stripes'].melody.slice(12,18),[['A5',6],['A5',2],['A5',4],['A5',4],['A5',6],['A5',2]],'星条旗の1897年原譜の第1主題を使う');
assert.equal(createHash('sha256').update(JSON.stringify(templateScore({...marches['stars-and-stripes'],accompaniment:[]}).notes)).digest('hex'),'1424bf9799b539279b488bb74e08732b7d15be7b72a16f4d66381f3a60a65bd7','星条旗はPD浄書MIDIの冒頭20小節の主旋律・拍位置・一括移調と一致する');
const snow= marches['yuki-no-shingun'];
assert.equal(snow.bpm,120);assert.equal(snow.accompaniment.length,33,'雪の進軍の伴奏は装飾を減らし、基本1拍ごとの和音だけ');
assert(snow.accompaniment.every(([names,span])=>names.split(',').length===3&&names.split(',').every(name=>noteNumber(name)<=noteNumber('D5'))&&[2,4].includes(span)),'雪の進軍の伴奏に高い装飾音や細かい走句を加えない');
const snowScore=templateScore(snow);
assert.equal(snowScore.length,128,'雪の進軍は間隔を約半分に詰め、32拍・16秒にする');
for(const part of [snow.melody,snow.accompaniment])assert.equal(part.reduce((sum,[,span])=>sum+span,0),snowScore.length,'雪の進軍の末尾を短縮しない');
assert.equal(snowScore.length%(snow.beatsPerBar*4),0,'雪の進軍のループで小節位置がずれています');
assert.deepEqual(snow.melody.slice(0,7),[['C6',2],['C6',4],['A5',2],['G5',4],['G5',4],['C5',3],['D5',1]],'雪の進軍の音の間隔と付点リズム');
assert.deepEqual(serialize(snowScore.notes,128).split('\n').slice(124,128),['C4,E4,G4,C5','','',''],'雪の進軍の最後の和音から冒頭まで1拍を保つ');
const auld=TEMPLATES.find(t=>t.id==='auld-lang-syne'),auldBacking=templateScore({...auld,melody:[]}).notes;
assert.equal(auld.bpm,88);assert.equal(auld.pickupBeats,1);assert.equal(templateScore(auld).length,128);
assert.deepEqual(auld.melody.slice(5,9),[['D5',6],['C5',2],['D5',4],['E5',4]],'蛍の光の6〜9拍目の旋律を保つ');
assert.deepEqual(auld.melody.slice(19),[['D5',6],['C5',2],['D5',4],['E5',2],['D5',2],['C5',6],['A4',2],['A4',4],['G4',4],['C5',12]],'蛍の光の22拍目以降の旋律を保つ');
assert(auldBacking.filter(note=>(note.step>=20&&note.step<36)||note.step>=84).every(note=>note.midi<=noteNumber('C5')),'蛍の光の指定区間で伴奏が旋律より高くなっています');
const auldRows=serialize(auldBacking,128).split('\n');
for(const [step,chord]of [[20,'G3,D4'],[32,'C4,E4'],[84,'G3,D4'],[100,'F3,A4'],[108,'F3,A4'],[112,'G3,D4'],[116,'C4,E4'],[124,'C4,E4']])assert.equal(auldRows[step],chord,`蛍の光の和声の切り替え ${step}`);
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
for(const [id,length]of [['csikos-post',128],['burgmuller-arabesque',64],['carmen-prelude',128]])assert.equal(templateScore(TEMPLATES.find(t=>t.id===id)).length,length,`${id}は主題のまとまりで閉じる`);
const arabesque=TEMPLATES.find(t=>t.id==='burgmuller-arabesque'),arabesqueScore=templateScore(arabesque);
assert.equal(arabesque.bpm,108);
assert.deepEqual(arabesque.melody.slice(-2),[['C5',4],['E5',4]],'アラベスクは追加のA5を省いて元の抜粋でループにつなぐ');
assert.deepEqual(serialize(arabesqueScore.notes,64).split('\n').slice(60,64),['C4,C5,E5','','E4,G4',''],'アラベスクの最後に追加のイ短調の終止和音を入れない');
const prelude=TEMPLATES.find(t=>t.id==='chopin-prelude-7'),preludeScore=templateScore(prelude);
assert.equal(prelude.bpm,65);assert.equal(prelude.pickupBeats,1);assert.equal(preludeScore.length,92);
assert.deepEqual(prelude.melody.slice(0,9),[['C5',4],['A5',3],['A#5',1],['G5',4],['G5',4],['G5',8],['D6',4],['B5',3],['C6',1]],'プレリュードは主題が戻る第9小節の弱起から始め、付点を保つ');
assert.deepEqual(prelude.melody.slice(-3),[['F6',4],['F6',4],['F6',8]],'プレリュードの原譜の主和音までを使う');
for(const [step,chord]of [[40,'D4,C5,F#5,A6'],[64,'C4,E4,A#4,D6'],[88,'F3,C4,A4,F6']])assert.equal(serialize(preludeScore.notes,92).split('\n')[step],chord,'プレリュードの原譜の半音と主和音を残す');
const springSong=TEMPLATES.find(t=>t.id==='mendelssohn-spring-song'),springSongScore=templateScore(springSong);
assert.equal(springSong.bpm,84);assert.equal(springSongScore.length,64);
assert.deepEqual(springSong.melody.slice(0,8),[['A5',5],['A#5',1],['B5',1],['C6',1],['F6',2],['C6',2],['A#5',2],['A5',2]],'春の歌は高い音域の冒頭主題とタイを残す');
assert(!templateScore({...springSong,accompaniment:[]}).notes.some(note=>note.step===4||note.step===36),'春の歌のタイを同音で打ち直さない');
assert.deepEqual(springSong.melody.slice(12,20),[['G5',5],['F#5',1],['G5',1],['G#5',1],['A5',2],['C6',2],['A#5',2],['A5',2]],'春の歌の後半は半音の動きから上がる応答へつなぐ');
assert.equal(serialize(springSongScore.notes,64).split('\n')[48],'G3,B4,G5','春の歌の後半の属七の和音に長3度を残す');
assert.equal(serialize(springSongScore.notes,64).split('\n')[62],'F3,A4,C5,F5','春の歌は前の属和音から主和音に解決し、低い伴奏で結ぶ');
const nutMarch=TEMPLATES.find(t=>t.id==='nutcracker-march'),nutMarchScore=templateScore(nutMarch);
assert.equal(nutMarch.bpm,108);assert.equal(nutMarch.subdivision,6);assert.equal(nutMarchScore.length,192,'行進曲のループは8小節・32拍を保つ');
assert.deepEqual(nutMarch.melody.slice(0,14),[['C6',3],['',3],['C6',2],['C6',2],['C6',2],['D6',3],['',3],['D6',3],['',3],['E6',3],['',3],['C6',3],['',3],['D6',12]],'くるみ割り人形の行進曲の上がる音程と三連符を原譜に合わせる');
for(const step of [3,4,5,15,16,17,21,22,23,27,28,29,33,34,35,93,94])assert(!nutMarchScore.notes.some(note=>note.step===step),'行進曲のファンファーレの休符に伴奏を入れない');
const nutMarchLead=templateScore({...nutMarch,accompaniment:[]});
for(const [step,name]of [[95,'D5'],[96,'A#5'],[101,'C6'],[102,'A#5'],[107,'A5'],[108,'G5'],[144,'E5'],[168,'A#5'],[180,'C6'],[186,'G5'],[191,'A#5']])assert(nutMarchLead.notes.some(note=>note.step===step&&note.midi===noteNumber(name)),`行進曲は続く旋律から冒頭へ戻る弱起を添える ${step}:${name}`);
assert.deepEqual(nutMarch.melody.slice(-3),[['G5',3],['',2],['A#5',1]],'行進曲は最後の1拍だけを弱起に変える');
assert.equal(serialize(nutMarchScore.notes,192).split('\n')[189],'E4,A#4','行進曲の最後の属七の和音から冒頭の主和音に戻る');
assert.equal(serialize(nutMarchScore.notes,192).split('\n')[0],'F3,A4,C5,C6');
const carmen=TEMPLATES.find(t=>t.id==='carmen-prelude'),carmenScore=templateScore(carmen);
assert.equal(carmen.bpm,112);
assert.deepEqual(carmen.melody.slice(0,8),[['C6',2],['C6',1],['C6',1],['C6',1],['G5',1],['F5',1],['G5',1],['C6',2]],'カルメンの有名な速い主題を高い旋律で残す');
assert(carmenScore.notes.some(note=>note.step===96&&note.midi===noteNumber('D#5')),'カルメンの応答の変ホ長調の和声を残す');
assert.deepEqual(serialize(carmenScore.notes,128).split('\n').slice(124,128),['C4,E4,G4,C6','','',''],'カルメンは16小節の原譜の終止で旋律と伴奏を一緒に閉じる');
const csikos=TEMPLATES.find(t=>t.id==='csikos-post'),csikosScore=templateScore(csikos),csikosBacking=templateScore({...csikos,melody:[]});
assert.equal(csikos.bpm,128);
assert(csikosScore.notes.some(note=>note.step===98&&note.midi===noteNumber('D#5')),'クシコスの旋律の半音は残す');
assert(!csikosBacking.notes.some(note=>note.step>=96&&note.step<124&&note.midi===noteNumber('G#5')),'クシコスのホ短調の旋律にG#5の伴奏を重ねない');
for(const [step,chord]of [[96,'E4,E5'],[98,'G4,B4,D#5'],[114,'D#5,F#5'],[124,'E4,D5,E6'],[126,'B4,G#5'],[127,'B5']])assert.equal(serialize(csikosScore.notes,128).split('\n')[step],chord,'クシコスはホ短調を保ち、最後の1拍だけ冒頭へ戻る属七の和音にする');
assert.deepEqual(csikos.melody.slice(-3),[['E6',2],['G#5',1],['B5',1]],'クシコスの最後は冒頭A5に解決する上行の属和音');
assert.equal(csikos.melody[0][0],'A5');assert.equal(serialize(csikosScore.notes,128).split('\n')[0],'E4,A4,A5','クシコスのループ冒頭はイ短調の主音と第5音');
const sugar=TEMPLATES.find(t=>t.id==='sugar-plum-fairy'),sugarScore=templateScore(sugar);
assert.equal(sugar.bpm,80);assert.equal(sugarScore.length,68,'金平糖は導入を省き、主題と応答8小節を使う');
assert.deepEqual(sugar.melody.slice(0,6),[['',2],['G5',1],['E5',1],['G5',2],['F#5',2],['D#5',2]],'金平糖は8分休符の直後からチェレスタ主題を鳴らす');
assert.deepEqual(sugar.accompaniment.slice(0,4),[['E4,G4',2],['B4',2],['G4,E5',2],['B4',2]],'金平糖の伴奏は後半の分散和音の雰囲気を保つ');
assert.equal(serialize(sugarScore.notes,68).split('\n')[2],'B4,G5','金平糖の旋律が最初の半拍から聞こえる');
assert.deepEqual(sugar.melody.slice(-7),[['D#5',1],['F#5',1],['E5',1],['F#5',1],['D#5',2],['',2],['E5',4]],'金平糖は続く半音の応答を加えて主音へ解決する');
assert.equal(serialize(sugarScore.notes,68).split('\n')[64],'E4,G4,B4,E5','金平糖は8小節のあとに主和音で閉じる');
for(const [step,chord]of [[24,'E4,G4,B4'],[26,'A4,C5,E5'],[46,'G4,B4,G5'],[52,'E4,G4,E5'],[56,'B4,D#5,F#5'],[58,'A4,B4,E5']])assert.equal(serialize(sugarScore.notes,68).split('\n')[step],chord,'金平糖は半拍ごとの旋律に合わせて伴奏の濁りを抑える');
const flowers=TEMPLATES.find(t=>t.id==='waltz-of-flowers'),flowersScore=templateScore(flowers);
assert.equal(flowers.bpm,112);assert.equal(flowers.beatsPerBar,3);assert.equal(flowers.subdivision,8);assert.equal(flowersScore.length,396,'花のワルツは主題7小節と続く応答9小節、短い結びを使う');
assert.deepEqual(flowers.melody.slice(0,13),[['C5',8],['F5',8],['A5',8],['A#5',22],['A5',2],['A5',48],['',16],['A5',8],['A#5',8],['A5',14],['G5',2],['C6',16],['F5',8]],'花のワルツは承認された冒頭7小節をそのまま残す');
assert.deepEqual(flowers.melody.slice(13,19),[['',8],['A#4',4],['C5',4],['D5',4],['E5',4],['F#5',4]],'花のワルツは直後の上行する応答につなぎ、半音も残す');
const flowersLead=templateScore({...flowers,accompaniment:[]});
assert(!flowersLead.notes.some(note=>note.step>48&&note.step<96),'花のワルツの長いタイを途中で打ち直さない');
assert(flowersScore.notes.some(note=>note.step===80),'花のワルツの長い旋律音にワルツの伴奏を続ける');
assert.equal(flowers.listen,'https://youtu.be/k5Me3oZkk7s');
assert.equal(serialize(flowersScore.notes,396).split('\n')[160],'F3,A4,C5,F5','花のワルツの冒頭7小節の最後の和音を保つ');
assert.deepEqual(flowers.melody.slice(-9),[['A5',16],['G5',12],['F#5',4],['F5',4],['E5',4],['D5',4],['C#5',4],['C5',8],['F5',16]],'花のワルツは応答末尾のタイと半音下降を残し、主音へ戻る短い結びを添える');
assert(!flowersLead.notes.some(note=>note.step===360),'花のワルツの応答の小節をまたぐタイを打ち直さない');
assert.equal(serialize(flowersScore.notes,396).split('\n')[392],'F3,A4,C5,F5','花のワルツの最後の旋律音と主和音をそろえる');
const maiden=TEMPLATES.find(t=>t.id==='maidens-prayer'),maidenScore=templateScore(maiden);
assert.equal(maiden.bpm,78);assert.equal(maiden.subdivision,6);assert.equal(maidenScore.length,96,'乙女の祈りのループは4小節・16拍を保つ');
assert.deepEqual(maiden.melody.slice(0,8),[['G5',2],['C6',2],['E6',2],['G5',2],['C6',2],['E6',2],['G6',9],['E6',3]],'乙女の祈りは有名な第1主題から始め、三連符と付点を保つ');
assert.deepEqual(maiden.melody.slice(-9),[['G5',1],['G5',2],['F5',2],['E5',2],['D5',2],['C5',4],['E5',2],['G5',2],['E5',2]],'乙女の祈りは主音へ下がって分散和音から冒頭のG5に戻る');
assert.equal(maiden.listen,'https://www.youtube.com/watch?v=HDAofQTcwQE');
assert(!templateScore({...maiden,melody:[]}).notes.some(note=>note.step>=48&&note.step<72&&note.midi===noteNumber('F5')),'乙女の祈りの9拍目からの伴奏にF5を重ねない');
assert.equal(serialize(maidenScore.notes,96).split('\n')[90],'C4,E4,G4,E5','乙女の祈りの結びは主和音で支える');
assert.equal(serialize(maidenScore.notes,96).split('\n')[94],'E5','乙女の祈りの最後の三連符から冒頭へ等間隔で続く');
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
assert(!/templateInfo|templateDetails|templateSource|templateListen|templateCredit|templateLicense|showTemplateInfo|原曲を聴く|出典 ↗|credits\.html/.test(app+html),'曲説明・出典・試聴リンクを画面に残さない');
assert(!html.includes('id="fileName"')&&!app.includes("$('fileName')"),'曲名とは別のファイル名入力欄を残さない');
assert(!html.includes('id="interval"')&&!app.includes("$('interval')"),'間隔の直接入力や隠れた間隔欄を残さない');
assert(!html.includes('<summary>設定</summary>')&&html.includes('<summary>TXTプレビュー</summary>'));

// 最小限のDOMで、全ステップの描画と実際の履歴・リセット・キー操作を実行する。
const controls=new Map(),listeners=new Map(),windowListeners=new Map(),previewedKeys=[];let nodeCount=0,outputWrites=0,focusedNode;
const nodeMethods={
  get firstElementChild(){return this.children[0];},get lastElementChild(){return this.children.at(-1);},
  get classList(){const cell=this;return {toggle(name,on){const names=new Set(cell.className.split(' ').filter(Boolean));if(on??!names.has(name))names.add(name);else names.delete(name);cell.className=[...names].join(' ');},add(name){this.toggle(name,true);},remove(name){this.toggle(name,false);}};},
  setAttribute(name,value){this.attributes[name]=String(value);},getAttribute(name){return this.attributes[name]??null;},
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}},replaceChildren(){this.children=[];},
  remove(){const siblings=this.parent.children;if(siblings.at(-1)===this)siblings.pop();else siblings.splice(siblings.indexOf(this),1);this.parent=null;},
  querySelectorAll(selector){return this.children.flatMap(row=>row.children).filter(cell=>selector==='input:checked'?cell.checked:selector.split(',').some(name=>cell.className.split(' ').includes(name.slice(1))));},
  addEventListener(name,handler){(this.events??={})[name]=handler;},closest(selector){return this.className.split(' ').includes(selector.slice(1))?this:null;},focus(){focusedNode=this;},blur(){this.events?.blur?.();}
};
const node=()=>{nodeCount++;return Object.assign(Object.create(nodeMethods),{value:'',textContent:'',className:'',hidden:false,open:false,checked:false,scrollLeft:0,scrollWidth:2000,children:[],dataset:{},attributes:{}});};
const element=id=>{if(!controls.has(id))controls.set(id,node());return controls.get(id);};
for(const [id,value]of Object.entries({bpm:'84',subdivision:'6',transpose:'12'}))element(id).value=value;
element('scoreTitle').value=element('scoreTitle').dataset.before='編集したMIDI';element('rollViewport').scrollLeft=90;
const ui=runInNewContext(`
  let notes=[{step:9,midi:72},{step:45,midi:76},{step:46,midi:79},{step:49,midi:84}],length=50,beatsPerBar=3,pickupBeats=.5,history=[],sourceMidi={name:'MIDI'},appliedMidiSettings={tracks:[1,3],subdivision:6,transpose:12},currentCell={step:49,midi:72},focusedCell=null,drag=null,startStep=0;
  const pitches=Array.from({length:41},(_,i)=>93-i);
  ${app.slice(app.indexOf('function snapshot(){'),app.indexOf('function renderGrid(){'))}
  ${app.slice(app.indexOf('function renderGrid(){'),app.indexOf('function renderOutput(){'))}
  ${app.slice(app.indexOf('function paint('),app.indexOf("for(const [id,delta] of [['extend',4]"))}
  ${app.slice(app.indexOf("for(const [id,delta] of [['extend',4]"),app.indexOf('function undo(){'))}
  ${app.slice(app.indexOf('function undo(){'),app.indexOf('function downloadName('))}
  ${app.split('\n').find(line=>line.startsWith('function updateTiming(){'))}
  ${app.split('\n').find(line=>line.startsWith('function stepInterval(){'))}
  ({reset:()=>$('reset').onclick(),extend:()=>$('extend').onclick(),shrink:()=>$('shrink').onclick(),grid:renderGrid,cell:getCell,start:()=>startStep,interval:stepInterval,setScore:score=>{notes=score;},rhythm:(subdivision,beats,pickup)=>{$('subdivision').value=subdivision;beatsPerBar=beats;pickupBeats=pickup;},state:()=>({notes,length,beatsPerBar,pickupBeats,sourceMidi,currentCell,historyLength:history.length})});
`,{$:element,MAX_STEPS,ALLOWED,noteName,keyOf,TEMPLATES,templateScore,document:{createElement:node,addEventListener:(name,handler)=>listeners.set(name,handler)},window:{addEventListener:(name,handler)=>windowListeners.set(name,handler)},midiSettings:()=>({tracks:[1,3]}),renderTracks:tracks=>{element('trackList').restored=tracks;},updateMidiRecommendation(){},render(){},renderOutput(){outputWrites++;},previewTone:midi=>previewedKeys.push(midi),stopPlayback(){},announce(){}});
const originalUI=JSON.stringify(ui.state());element('loop').setAttribute('aria-pressed','true');ui.reset();assert.equal(ui.state().length,32);assert.equal(ui.state().notes.length,0);assert.equal(ui.state().sourceMidi,null);assert.equal(ui.interval(),125);assert.equal(element('loop').getAttribute('aria-pressed'),'true','リセットでループの選択を変えない');
let prevented=false;const key=meta=>({ctrlKey:!meta,metaKey:meta,shiftKey:false,altKey:false,key:'z',target:{closest:()=>null},preventDefault(){prevented=true;}});
listeners.get('keydown')(key(false));assert(prevented);assert.equal(JSON.stringify(ui.state()),originalUI);assert.equal(element('bpm').value,'84');assert.equal(element('scoreTitle').value,'編集したMIDI');assert.deepEqual(Array.from(element('trackList').restored),[1,3]);assert.equal(element('rollViewport').scrollLeft,90);
ui.reset();listeners.get('keydown')({...key(false),target:{closest:()=>({})}});assert.equal(ui.state().notes.length,0,'入力欄の標準取り消しを妨げています');listeners.get('keydown')(key(true));assert.equal(JSON.stringify(ui.state()),originalUI);
// 曲名の確定・取消・空欄・日本語変換と、テンプレート選択後の履歴を確認する。
const titleInput=element('scoreTitle'),titleKey=(key,isComposing=false)=>({key,isComposing,preventDefault(){}});
titleInput.value='  私のオルゴール  ';titleInput.events.keydown(titleKey('Enter'));assert.equal(titleInput.value,'私のオルゴール');assert.equal(ui.state().historyLength,1);assert.deepEqual(Array.from(ui.state().notes,note=>note.step),[9,45,46,49]);listeners.get('keydown')(key(false));assert.equal(titleInput.value,'編集したMIDI');assert.equal(JSON.stringify(ui.state()),originalUI);
titleInput.value='入力途中';titleInput.events.keydown(titleKey('Enter',true));assert.equal(ui.state().historyLength,0,'日本語変換中に曲名を確定しない');titleInput.events.keydown(titleKey('Escape'));assert.equal(titleInput.value,'編集したMIDI');assert.equal(ui.state().historyLength,0,'Escで不要な履歴を増やさない');
titleInput.value=' 編集したMIDI ';titleInput.blur();assert.equal(titleInput.value,'編集したMIDI');assert.equal(ui.state().historyLength,0,'同じ曲名で履歴を増やさない');titleInput.value=' ';titleInput.blur();assert.equal(titleInput.value,'新しい楽譜');listeners.get('keydown')(key(false));assert.equal(titleInput.value,'編集したMIDI');
titleInput.value='編集中の曲名';ui.extend();assert.equal(ui.state().historyLength,2);listeners.get('keydown')(key(false));assert.equal(titleInput.value,'編集中の曲名');assert.equal(ui.state().length,50,'曲名の編集中でも音の操作を先に取り消す');listeners.get('keydown')(key(false));assert.equal(titleInput.value,'編集したMIDI');assert.equal(JSON.stringify(ui.state()),originalUI);
element('templateSelect').value='british-grenadiers';element('templateSelect').onchange();assert.equal(titleInput.value,'ブリティッシュ・グレナディアーズ');assert.equal(element('templateSelect').value,'');listeners.get('keydown')(key(false));assert.equal(titleInput.value,'編集したMIDI');assert.equal(JSON.stringify(ui.state()),originalUI);
ui.shrink();assert.equal(ui.state().length,49);assert.deepEqual(Array.from(ui.state().notes,note=>note.step),[9,45,46],'削除した最後の1ステップだけの音を省く');assert.equal(ui.state().currentCell.step,48);assert.equal(serialize(ui.state().notes,ui.state().length).split('\n').length-1,49);
listeners.get('keydown')(key(false));assert.equal(JSON.stringify(ui.state()),originalUI,'削除した音や編集位置を復元できません');assert.equal(element('rollViewport').scrollLeft,90);
for(const start of [50,64,256]){
  if(start===64)ui.reset();
  while(ui.state().length<start)ui.extend();
  assert.equal(ui.state().length,start);
  const before=JSON.stringify({...ui.state(),historyLength:undefined}),oldLength=ui.state().length,oldScroll=element('rollViewport').scrollLeft;
  ui.extend();assert.equal(ui.state().length,oldLength+4);assert.equal(element('rollViewport').scrollLeft,element('rollViewport').scrollWidth);const extendedNotes=JSON.stringify(ui.state().notes);assert.equal(extendedNotes,JSON.stringify(JSON.parse(before).notes));
  ui.grid();const rows=element('roll').children;assert.equal(rows.length,42);assert(rows.every(row=>row.children.length===oldLength+5),'全ステップが描画されていません');assert.equal(Number(rows[0].children.at(-1).dataset.step),oldLength+3);
  assert.equal(serialize(ui.state().notes,ui.state().length).split('\n').length-1,oldLength+4);
  ui.shrink();assert.equal(ui.state().length,oldLength+3);assert.equal(JSON.stringify(ui.state().notes),extendedNotes,'空のステップ削除で既存の音が変わっています');listeners.get('keydown')(key(false));assert.equal(ui.state().length,oldLength+4);
  listeners.get('keydown')(key(false));assert.equal(JSON.stringify({...ui.state(),historyLength:undefined}),before);assert.equal(element('rollViewport').scrollLeft,oldScroll);
}
while(ui.state().length+4<=MAX_STEPS)ui.extend();const capped=JSON.stringify(ui.state());ui.extend();assert.equal(JSON.stringify(ui.state()),capped,'上限を超えて追加しています');
ui.grid();assert(element('extend').disabled,'上限で追加ボタンが無効になっていません');
ui.reset();while(ui.state().length>1)ui.shrink();assert.equal(ui.state().length,1);const minimum=JSON.stringify(ui.state());ui.shrink();assert.equal(JSON.stringify(ui.state()),minimum,'空の楽譜まで削除しています');ui.grid();assert(element('shrink').disabled);assert(!element('extend').disabled);
listeners.get('keydown')(key(false));assert.equal(ui.state().length,2);ui.grid();assert(!element('shrink').disabled);
for(let i=0;i<35;i++)ui.reset();assert.equal(ui.state().historyLength,30);
ui.grid();const firstCell=ui.cell(0,72),otherCell=ui.cell(1,72),row=element('roll').children[1];let created=nodeCount,writes=outputWrites;
const pointer=cell=>({target:cell,button:0,pointerType:'mouse',preventDefault(){}});
const keyButtons=element('roll').children.slice(1).flatMap(row=>row.children[0].children),beforeKeyPreview=JSON.stringify(ui.state());assert.equal(keyButtons.length,30,'対応30音だけを試聴ボタンにする');assert.equal(ui.cell(0,66).parent.children[0].children.length,0,'使用不可の鍵盤に試聴ボタンを置かない');
const whiteKey=firstCell.parent.children[0].children[0],blackKey=ui.cell(0,73).parent.children[0].children[0];
element('roll').events.pointerdown(pointer(whiteKey));element('roll').events.click({...pointer(whiteKey),detail:1});element('roll').events.click({...pointer(blackKey),pointerType:'touch',detail:1});element('roll').events.click({...pointer(whiteKey),detail:0});assert.deepEqual(previewedKeys,[72,73,72],'マウス・タッチ・キーボードで1回ずつ鍵盤の音を鳴らす');assert.equal(JSON.stringify(ui.state()),beforeKeyPreview,'鍵盤の試聴で楽譜や履歴を変更しない');assert.equal(outputWrites,writes);
element('roll').events.pointerdown(pointer(firstCell));element('roll').events.pointerover(pointer(otherCell));assert.equal(outputWrites,writes,'ドラッグ中に出力を毎回作り直しています');windowListeners.get('pointerup')();assert.equal(outputWrites,writes+1);
assert.equal(nodeCount,created,'音配置でマスを作り直しています');assert.equal(ui.cell(0,72),firstCell);assert.equal(firstCell.getAttribute('aria-pressed'),'true');assert.equal(otherCell.getAttribute('aria-pressed'),'true');
element('roll').events.keydown({...pointer(firstCell),key:'ArrowRight'});assert.equal(focusedNode,otherCell);assert.equal(firstCell.tabIndex,-1);assert.equal(otherCell.tabIndex,0);
element('roll').events.click({...pointer(ui.cell(2,72)),pointerType:'touch',detail:1});assert.equal(ui.cell(2,72).getAttribute('aria-pressed'),'true');assert.equal(focusedNode,ui.cell(2,72));
writes=outputWrites;element('roll').events.pointerdown(pointer(ui.cell(3,72)));windowListeners.get('pointercancel')();assert.equal(outputWrites,writes+1,'中断したドラッグの出力が更新されません');
ui.grid();assert.equal(nodeCount,created,'同じ構造の描画でマスを作り直しています');ui.extend();ui.grid();assert.equal(nodeCount-created,42*4,'末尾4列以外も作り直しています');created=nodeCount;ui.shrink();ui.grid();assert.equal(nodeCount,created);assert.equal(element('roll').children[1],row);assert.equal(ui.cell(0,72),firstCell);
ui.setScore([{step:0,midi:66},{step:0,midi:120}]);ui.grid();const outsideCell=ui.cell(0,66);assert.equal(outsideCell.disabled,false);assert.equal(outsideCell.getAttribute('aria-pressed'),'true');element('roll').events.click({...pointer(outsideCell),detail:0});assert.equal(outsideCell.disabled,true,'削除した対応外のマスが無効になりません');assert.match(outsideCell.getAttribute('aria-label'),/対応外/);assert.equal(firstCell.tabIndex,0);listeners.get('keydown')(key(false));ui.grid();assert.equal(outsideCell.disabled,false,'取り消した対応外の音を復元できません');
ui.rhythm(6,3,.5);ui.grid();assert.equal(nodeCount,created);assert.equal(element('roll').firstElementChild.children[7].textContent,'2');assert.match(firstCell.parent.children[4].className,/\bbar\b/,'拍子・弱起の変更で小節線を更新できません');ui.rhythm(4,4,0);ui.grid();
const header=element('roll').firstElementChild,emptyHeader=header.children[6],beforeSelection=JSON.stringify(ui.state());created=nodeCount;
element('roll').events.click({...pointer(emptyHeader),detail:1});assert.equal(ui.start(),5);assert.equal(emptyHeader.getAttribute('aria-selected'),'true');assert.equal(header.children[1].getAttribute('aria-selected'),'false');assert.equal(emptyHeader.tabIndex,0);assert.equal(header.children[1].tabIndex,-1);
element('roll').events.keydown({...pointer(emptyHeader),key:'ArrowRight'});assert.equal(ui.start(),6);assert.equal(focusedNode,header.children[7]);element('roll').events.click({...pointer(header.children[1]),detail:0});element('roll').events.keydown({...pointer(header.children[1]),key:'ArrowLeft'});assert.equal(ui.start(),0,'開始位置が先頭より前に移動しています');
element('roll').events.click({...pointer(header.lastElementChild),pointerType:'touch',detail:1});element('roll').events.keydown({...pointer(header.lastElementChild),key:'ArrowRight'});assert.equal(ui.start(),ui.state().length-1,'開始位置が楽譜の末尾を超えています');assert.equal(header.children.filter(cell=>cell.getAttribute('aria-selected')==='true').length,1);assert.equal(JSON.stringify(ui.state()),beforeSelection,'開始位置の選択で楽譜や履歴が変わっています');assert.equal(nodeCount,created,'開始位置の選択でマスを作り直しています');
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
  let notes=[],length=4,audio=null,player=null,playbackRequest=0,drag=null,startStep=0;const audioBuffers=new Map(),audioLoads=new Map(),activeVoices=new Set();
  ${app.slice(app.indexOf('function updateCell('),app.indexOf('function focusCell('))}
  ${app.slice(app.indexOf('function markStep('),app.indexOf('function renderOutput('))}
  ${app.slice(app.indexOf('function paint('),app.indexOf("$('roll').addEventListener('pointerdown'"))}
  ${app.slice(app.indexOf('function stopPlayback(){'),app.indexOf("$('play').onclick="))}
  ${app.slice(app.indexOf("$('play').onclick="),app.indexOf('function midiSettings(){'))}
  ${app.split('\n').find(line=>line.startsWith('function stepInterval(){'))}
  ({edit:(step,midi,on)=>{stopPlayback();paint({dataset:{step,midi},classList:{toggle(){}},setAttribute(){}},on);},stop:stopPlayback,select:step=>{stopPlayback();selectStart(step);},start:()=>startStep,preview:previewTone,load:loadTone,state:()=>notes,play:()=>$('play').onclick(),setScore:(score,steps)=>{notes=score;length=steps;},setTime:time=>{audio.currentTime=time;},time:()=>audio.currentTime,playback:()=>player});
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
element('loop').setAttribute('aria-pressed','false');const loadedCount=fetched.length;sound.setScore([{step:0,midi:93}],4);element('bpm').value=120;element('subdivision').value=4;await sound.play();assert.equal(fetched.length,loadedCount,'別の楽譜で準備済みの音源を再取得しています');sound.stop();
// 音源の余韻より短い曲でも、音声クロック上の同じ間隔で繰り返す。
response=resumeResult=undefined;sound.setScore([{step:0,midi:72},{step:3,midi:72}],4);element('bpm').value=120;element('subdivision').value=4;
const advance=time=>{while(sound.time()<time&&scheduledTick){sound.setTime(Math.min(time,sound.time()+.025));scheduledTick();}},near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,`再生時刻がずれています: ${actual} / ${expected}`);
let playCount=played.length;await sound.play();let start=sound.playback().start;advance(start+.5);assert.equal(played.length-playCount,2,'ループオフで繰り返しています');advance(start+1.3);assert(sound.playback(),'余韻を途中で止めています');advance(start+1.4);assert.equal(sound.playback(),null);
playCount=played.length;await sound.play();start=sound.playback().start;element('loop').onclick();advance(start+.45);advance(start+.95);
for(const [i,offset]of[0,.375,.5,.875,1].entries())near(played[playCount+i].time,start+offset);
assert.equal(sound.playback().visual,3,'2周目の表示位置が先頭に戻っていません');element('loop').onclick();advance(start+1.4);assert.equal(played.length-playCount,6,'オフにした周回を最後まで再生していません');advance(start+2.4);assert.equal(sound.playback(),null,'ループをオフにしても終了しません');
element('loop').onclick();await sound.play();const pendingTick=scheduledTick;sound.stop();playCount=played.length;pendingTick();assert.equal(played.length,playCount);assert.equal(sound.playback(),null);assert.equal(scheduledTick,null,'停止後もループのタイマーが残っています');
sound.setScore([{step:0,midi:72}],1);element('bpm').value=300;element('subdivision').value=8;await sound.play();start=sound.playback().start;advance(start+.02);assert(sound.playback().next>1,'1ステップの楽譜をループできません');sound.stop();element('loop').onclick();
// 雪の進軍の実データで、末尾の1拍と複数周の開始時刻を確認する。
sound.setScore(snowScore.notes,snowScore.length);element('bpm').value=120;element('subdivision').value=4;element('loop').onclick();playCount=played.length;await sound.play();start=sound.playback().start;advance(start+32.02);
assert.equal(played.length-playCount,snowScore.notes.length*2+4,'雪の進軍の2周と次の先頭和音');
for(let cycle=0;cycle<3;cycle++)near(played[playCount+cycle*snowScore.notes.length].time,start+cycle*16);
near(played[playCount+snowScore.notes.length-4].time,start+15.5);sound.stop();element('loop').onclick();
// 途中からの初回再生と、以降の全体ループは同じ音声クロックで進む。
sound.setScore([{step:0,midi:72},{step:2,midi:76},{step:3,midi:79}],4);element('bpm').value=120;element('subdivision').value=4;sound.select(2);playCount=played.length;await sound.play();let firstTime=sound.playback().start+.25;
assert.equal(sound.playback().visual,-1,'再生前に選択位置より前の列を表示しています');advance(firstTime+.01);assert.equal(sound.playback().visual,2);advance(firstTime+.25);assert.deepEqual(played.slice(playCount).map(voice=>voice.name),['E5','G5'],'選択位置より前の音が鳴っています');near(played[playCount].time,firstTime);near(played[playCount+1].time,firstTime+.125);advance(firstTime+1.2);assert.equal(sound.playback(),null);assert.equal(sound.start(),0);
element('loop').onclick();sound.select(2);playCount=played.length;await sound.play();firstTime=sound.playback().start+.25;advance(firstTime+.76);assert.deepEqual(played.slice(playCount).map(voice=>voice.name),['E5','G5','C5','E5','G5','C5']);for(const [i,offset]of[0,.125,.25,.5,.625,.75].entries())near(played[playCount+i].time,firstTime+offset);element('rollViewport').scrollLeft=300;await sound.play();assert.equal(sound.playback(),null);assert.equal(sound.start(),0);assert.equal(element('rollViewport').scrollLeft,0);assert(element('roll').children.every(row=>row.children.every(cell=>!cell.className.split(' ').includes('playing'))),'停止後に再生位置が残っています');element('loop').onclick();
sound.select(3);element('bpm').value=60;element('subdivision').value=1;playCount=played.length;await sound.play();firstTime=sound.playback().start+3;advance(firstTime+1.05);assert.equal(played.length-playCount,1,'末尾からの再生で別の音を鳴らしています');assert.equal(sound.playback(),null);
resumeResult=new Promise(resolve=>{finishResume=resolve;});sound.select(2);playCount=played.length;const pendingPlay=sound.play();await sound.play();finishResume();await pendingPlay;assert.equal(played.length,playCount,'準備中の停止後に音が鳴っています');assert.equal(sound.start(),0);assert.equal(sound.playback(),null);resumeResult=undefined;
// 実際の取り込み・設定イベントで、即時反映と変更前の設定への取り消しを確認する。
const midiControls=new Map(),midiMessages=[],midiElement=id=>{if(!midiControls.has(id))midiControls.set(id,node());return midiControls.get(id);};let midiRenders=0;
for(const [id,value]of Object.entries({bpm:'90',subdivision:'4',transpose:'0'}))midiElement(id).value=value;
midiElement('scoreTitle').value=midiElement('scoreTitle').dataset.before='取り込み前の楽譜';
const midiUI=runInNewContext(`
  let notes=[{step:1,midi:72}],length=5,history=[],beatsPerBar=3,pickupBeats=0,sourceMidi=null,appliedMidiSettings=null,currentCell={step:1,midi:72};
  ${app.slice(app.indexOf('function snapshot(){'),app.indexOf('function getCell('))}
  ${app.slice(app.indexOf('function undo(){'),app.indexOf("document.addEventListener('keydown'"))}
  ${app.slice(app.indexOf('function stepInterval(){'),app.indexOf('function stopPlayback(){'))}
  ${app.slice(app.indexOf('function midiSettings(){'),app.indexOf('const modelContext='))}
  ({import:importFile,settings:midiSettings,interval:stepInterval,state:()=>({notes,length,sourceMidi,history}),edit:()=>{notes.push({step:0,midi:72});},undo});
`,{$:midiElement,MAX_NOTES,ALLOWED,convertMidi,suggestMidiTranspositions,validateMidiHeader,window:{Midi},document:{createElement:node,addEventListener(){}},stopPlayback(){},announce:message=>midiMessages.push(message),render(){midiRenders++;},renderGrid(){},renderOutput(){}});
const midiFile={name:'選択用.mid',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
const beforeImport=JSON.stringify(midiUI.state());await midiUI.import(midiFile);
assert.equal(midiElement('scoreTitle').value,'選択用','MIDIの拡張子を除いた名前を曲名に使う');
assert.equal(midiUI.state().notes.length,4);assert.equal(midiUI.state().length,18);assert.equal(midiUI.state().history.length,1);assert.equal(midiElement('txtPreviewPanel').open,false);assert.equal(midiElement('midiTracks').open,false);
assert.deepEqual(Array.from(midiUI.settings().tracks),[0],'打楽器以外は選択済み、打楽器は未選択');assert.match(midiElement('trackList').children[0].children[1].textContent,/Melody.*acoustic grand piano.*5音/);
assert.equal(midiElement('suggest').textContent,'おすすめ：-1半音');midiElement('suggest').onclick();assert(midiUI.state().notes.every(note=>ALLOWED.has(note.midi)),'おすすめを押すと即座に楽譜が変わる');midiUI.undo();assert.equal(Number(midiElement('transpose').value),0);assert(midiUI.state().notes.some(note=>!ALLOWED.has(note.midi)));
const drumCheck=midiElement('trackList').children[1].children[0];drumCheck.checked=true;drumCheck.events.change();assert.deepEqual(Array.from(midiUI.settings().tracks),[0,1]);assert.equal(midiUI.state().notes.length,5,'トラック変更をその場で楽譜に反映する');midiUI.undo();assert.deepEqual(Array.from(midiUI.settings().tracks),[0],'取り消しで変更前のトラックを戻す');assert.equal(midiUI.state().notes.length,4);
midiElement('clearTracks').onclick();assert.equal(midiUI.state().notes.length,0);assert.equal(midiUI.state().length,18);assert(midiElement('suggest').disabled);midiUI.undo();assert.equal(midiUI.state().notes.length,4);
const retainedMidi=JSON.stringify(midiUI.state());for(const value of ['', '25', '0.5']){midiElement('transpose').value=value;midiElement('transpose').events.input();assert.equal(JSON.stringify(midiUI.state()),retainedMidi,'不正入力では楽譜と履歴を保持する');}
midiElement('transpose').value='12';midiElement('transpose').events.input();assert.deepEqual(Array.from(midiUI.state().notes,note=>note.midi),converted.notes.map(note=>note.midi+12));midiUI.undo();assert.equal(Number(midiElement('transpose').value),0);
const beforeSubdivisionRender=midiRenders;midiElement('subdivision').value='6';midiElement('subdivision').events.change();assert.equal(midiRenders,beforeSubdivisionRender+1,'MIDIのステップ単位変更を画面とプレビューに反映する');assert.equal(midiMessages.at(-1),'MIDI設定を更新しました。');assert.equal(midiUI.state().length,27);assert.equal(midiUI.interval(),83);midiUI.undo();assert.equal(midiUI.state().length,18);assert.equal(Number(midiElement('subdivision').value),4);assert.equal(midiUI.interval(),125,'取り消しでステップ単位から求める間隔を戻す');
midiElement('removeUnsupported').onclick();assert.equal(midiUI.state().notes.length,3);assert.equal(midiUI.state().length,18,'一括除外しても曲末と休符を保持する');midiUI.undo();assert.equal(midiUI.state().notes.length,4);
midiUI.undo();assert.equal(JSON.stringify(midiUI.state()),beforeImport,'取り込みを取り消すと適用前の曲を復元する');
assert.equal(midiElement('scoreTitle').value,'取り込み前の楽譜');
await midiUI.import(midiFile);midiUI.edit();const editedMidi=JSON.stringify(midiUI.state());midiElement('transpose').value='0';midiElement('transpose').events.input();midiElement('selectMelodic').onclick();assert.equal(JSON.stringify(midiUI.state()),editedMidi,'同じ設定への操作で手動編集を消さない');
await midiUI.import({name:'bad.mid',size:14,arrayBuffer:async()=>new ArrayBuffer(14)});assert.equal(JSON.stringify(midiUI.state()),editedMidi,'取り込み失敗で現在の楽譜を変えない');
assert(!/midiDialog|previewMidi|applyMidi\b/.test(app+html),'専用の前面画面や試聴・適用ボタンを残さない');
// 実際の保存・コピー・プレビューと、間隔変更のイベントを同じ出力で確認する。
let savedBlob,savedName,copiedText;const outputErrors=[],outputMessages=[];
const textOutput=runInNewContext(`
  let notes=[{step:1,midi:76},{step:1,midi:72},{step:3,midi:79}],length=5,sourceMidi=null,beatsPerBar=3;
  ${app.slice(app.indexOf('function renderOutput(){'),app.indexOf('function paint('))}
  ${app.slice(app.indexOf('function downloadName('),app.indexOf('function stopPlayback(){'))}
  ({render:renderOutput,save:()=>$('export').onclick(),saveMidi:()=>$('exportMidi').onclick(),copy:()=>$('copyText').onclick(),setScore:(score,size)=>{notes=score;length=size;renderOutput();},state:()=>({notes,length})});
`,{$:element,serialize,validateNote,keyOf,MAX_STEPS,ALLOWED,NOTE_NAMES,noteName,noteNumber,Blob,window:{Midi},URL:{createObjectURL:blob=>{savedBlob=blob;return 'blob:test';},revokeObjectURL(){}},navigator:{clipboard:{writeText:async text=>{copiedText=text;}}},document:{createElement:()=>({...node(),click(){savedName=this.download;}})},setTimeout(){},stopPlayback(){},renderGrid(){},previewConversion(){},announce:(message,error)=>{if(error)outputErrors.push(message);else outputMessages.push(message);}});
for(const [id,value]of Object.entries({bpm:120,subdivision:4,scoreTitle:'私のオルゴール'}))element(id).value=value;
textOutput.render();const expectedText='step_ms=125\n\nC5,E5\n\nG5\n\n';assert.equal(element('txtPreview').value,expectedText);
textOutput.save();await textOutput.copy();assert.equal(await savedBlob.text(),expectedText);assert.equal(copiedText,expectedText);
assert.equal(savedName,'私のオルゴール.txt');textOutput.saveMidi();assert.equal(savedName,'私のオルゴール.mid','TXTとMIDIは同じ曲名を使う');
element('scoreTitle').value='  編集した曲?  ';textOutput.save();assert.equal(savedName,'編集した曲_.txt');textOutput.saveMidi();assert.equal(savedName,'編集した曲_.mid');
element('bpm').value=60;element('bpm').events.change();assert.equal(element('txtPreview').value.replace(/^step_ms=.*\n/,''),expectedText.replace(/^step_ms=.*\n/,''));assert.match(element('txtPreview').value,/^step_ms=250\n/);
element('subdivision').value=8;element('subdivision').events.change();assert.match(element('txtPreview').value,/^step_ms=125\n/);
element('bpm').value=116;element('subdivision').value=3;element('bpm').events.change();assert.match(element('txtPreview').value,/^step_ms=172\n/);textOutput.save();await textOutput.copy();assert.equal(await savedBlob.text(),element('txtPreview').value);assert.equal(copiedText,element('txtPreview').value);
const retainedScore=JSON.stringify(textOutput.state()),previousBlob=savedBlob,previousCopy=copiedText;element('bpm').value='';element('bpm').events.change();assert.equal(element('txtPreview').value,'');textOutput.save();await textOutput.copy();assert.equal(savedBlob,previousBlob);assert.equal(copiedText,previousCopy);assert.match(outputErrors.at(-1),/テンポ/);assert.equal(JSON.stringify(textOutput.state()),retainedScore,'不正なBPMで楽譜が失われています');
element('bpm').value=120;element('subdivision').value=4;element('bpm').events.change();assert.equal(element('txtPreview').value,expectedText);
// 保存ボタンの実際の処理を実行し、生成したMIDIを読み直して内容と休符を確認する。
const midiExportScore=[{step:3,midi:72},{step:2,midi:72},{step:2,midi:76},{step:2,midi:76},{step:4,midi:66}];
for(const [bpm,subdivision]of [[20,1],[240,2],[116,3],[120,4],[120,6],[300,8]]){
  const interval=Math.round(60000/bpm/subdivision);element('bpm').value=bpm;element('subdivision').value=subdivision;element('scoreTitle').value='edited?score';textOutput.setScore(midiExportScore,7);
  const beforeMidiSave=JSON.stringify(textOutput.state());textOutput.saveMidi();
  assert.equal(savedBlob.type,'audio/midi');assert.equal(savedName,'edited_score.mid');assert.match(outputMessages.at(-1),/対応外の1音を省き/);
  assert.equal(JSON.stringify(textOutput.state()),beforeMidiSave,'MIDI保存で赤い音や楽譜を変更しない');assert(element('export').disabled);assert(!element('exportMidi').disabled,'赤い音が残っていてもMIDIを保存できる');
  const restored=new Midi(new Uint8Array(await savedBlob.arrayBuffer())),track=restored.tracks[0];
  assert.equal(restored.tracks.length,1);assert.equal(track.instrument.number,10);assert.deepEqual(restored.header.timeSignatures[0].timeSignature,[3,4]);
  assert.deepEqual(track.notes.map(note=>[Math.round(note.time*1000/interval),note.midi]),[[2,72],[2,76],[3,72]],'和音と同音連打を保持し、重複と赤い音だけを省く');
  for(const note of track.notes){assert(Math.abs(note.time-Math.round(note.time*1000/interval)*interval/1000)<1e-5);assert(Math.abs(note.duration-interval/1000)<1e-5);assert.equal(note.velocity,Math.floor(.8*127)/127);}
  assert(Math.abs(restored.header.ticksToSeconds(track.endOfTrackTicks)-7*interval/1000)<1e-5,'末尾の休符を保持する');
}
for(const score of [[],[{step:1,midi:66}]]){
  element('bpm').value=120;element('subdivision').value=4;element('scoreTitle').value=' ';textOutput.setScore(score,16);textOutput.saveMidi();
  const restored=new Midi(new Uint8Array(await savedBlob.arrayBuffer()));assert.equal(savedName,'新しい楽譜.mid');assert.equal(restored.tracks[0].notes.length,0);assert.equal(restored.header.ticksToSeconds(restored.tracks[0].endOfTrackTicks),2,'全休符の長さを保持する');
}
const previousMidiBlob=savedBlob;
for(const [bpm,subdivision,score,size]of [['',4,[],7],[19,4,[],7],[301,4,[],7],[Infinity,4,[],7],[120,5,[],7],[120,4,[],0],[120,4,[],MAX_STEPS+1],[120,4,[{step:7,midi:72}],7],[120,4,[{step:1,midi:128}],7]]){
  element('bpm').value=bpm;element('subdivision').value=subdivision;textOutput.setScore(score,size);const before=JSON.stringify(textOutput.state());textOutput.saveMidi();assert.equal(savedBlob,previousMidiBlob,'不正入力でファイルを保存しない');assert.equal(JSON.stringify(textOutput.state()),before);
}
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(match[1].startsWith('data:')||match[1]==='./')continue;await readFile('dist/'+match[1].split('?')[0]);}
process.stdout.write('確認成功: 30音・OGG音源・テンプレート42曲の音域と和音と余韻込み60秒以内・配置時の試聴と取り消し・音源キャッシュと失敗時の楽譜保持・ループ再生と途中の切り替え・更新識別子・TXT形式・MIDI変換・上限・UI参照・全ステップ描画・4ステップの追加と1ステップの削除・スクロール・削除した音の復元・リセット・Ctrl/Command+Z・MIDI設定と履歴の復元\n');
