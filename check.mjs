import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,mkdtemp,rm,rmdir} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {createContext,runInContext} from 'node:vm';
import {noteName,noteNumber,serialize,parseText,convertMidi,convertScore,suggestTranspositions,validateMidiHeader,rhythmMetadata,validateDefinitions,MAX_STEPS} from './dist/core.js';
import {catalogData} from './build-catalog.mjs';
import './check-resonite.mjs';
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const profiles=await json('dist/instruments.json'),sounds=await json('dist/audio/soundsets.json'),definitions=validateDefinitions(profiles,sounds);
const allowed=definitions.instruments.find(item=>item.id==='musicbox-30').allowed;
assert.equal(definitions.instruments[0].allowed.size,30);assert.equal(definitions.instruments[1].allowed.size,88);
assert.equal(definitions.instruments[0].defaultSoundset,'musicbox-30');
assert.equal(definitions.instruments[1].defaultSoundset,'vsco-piano');assert.deepEqual([...definitions.soundsets.find(item=>item.id==='vsco-piano').allowed],[...definitions.instruments[1].allowed],'録音ピアノは全88鍵を再生できる');
const piano61=definitions.instruments.find(item=>item.id==='piano-61');assert.equal(piano61.defaultSoundset,'vsco-piano');assert.deepEqual([...piano61.allowed],Array.from({length:61},(_,i)=>36+i),'61鍵ピアノはC2〜C7');
const marimba61=definitions.instruments.find(item=>item.id==='marimba-61');assert.equal(marimba61.defaultSoundset,'vsco-marimba');assert.deepEqual([...marimba61.allowed],Array.from({length:61},(_,i)=>36+i),'61音マリンバはC2〜C7');
assert.equal(piano61.arrangedFor,'piano61');assert.equal(marimba61.arrangedFor,piano61.arrangedFor,'同じ音域のピアノ・マリンバは編曲対象を共有する');
assert.deepEqual([...new Set(definitions.instruments.map(item=>item.arrangedFor))],['musicbox30','piano88','piano61','xylophone32']);
assert.throws(()=>validateDefinitions([{...profiles[0],arrangedFor:undefined}],sounds));
assert.throws(()=>validateDefinitions([{...profiles[0],arrangedFor:['musicbox30']}],sounds));
assert.throws(()=>validateDefinitions([{...profiles[0],arrangedFor:'musicbox-30'}],sounds));
assert.throws(()=>validateDefinitions([profiles[1],{...profiles[2],arrangedFor:'piano88'}],sounds),'同じ基準名に異なる音域を割り当てない');
assert.deepEqual([...definitions.soundsets.find(item=>item.id==='vsco-marimba').allowed],[...marimba61.allowed],'マリンバ音源は61音だけ用意する');
const xylophone32=definitions.instruments.find(item=>item.id==='xylophone-32');assert.equal(xylophone32.defaultSoundset,'vsco-xylophone');assert.deepEqual([...xylophone32.allowed],Array.from({length:32},(_,i)=>77+i),'32音木琴は学校用の実音F5〜C8');assert.deepEqual([...definitions.soundsets.find(item=>item.id==='vsco-xylophone').allowed],[...xylophone32.allowed],'木琴には専用音源の全32音を紐付ける');
for(let midi=0;midi<=127;midi++)assert.equal(noteNumber(noteName(midi)),midi);
const full=[{step:0,midi:0},{step:0,midi:127},{step:1,midi:66},{step:1,midi:66}],text=serialize(full,4,172,{title:'曲,%2C=値',extra:'100%',steps_per_quarter:'3',time_signature:'6/8'}),parsed=parseText(text);
assert.deepEqual(parsed.notes,[full[0],full[1],full[2]]);assert.equal(parsed.length,4);assert.equal(parsed.stepMs,172);assert.equal(parsed.metadata.title,'曲,%2C=値');assert.equal(parsed.metadata.extra,'100%');assert.equal(rhythmMetadata(parsed.metadata).beatsPerBar,3);
const titles={title:'Clair de lune',title_ja:'月の光,%',title_en:'Moonlight',title_fr:'Clair de lune'};assert.deepEqual(parseText(serialize([],1,125,titles)).metadata,{format:'stepscore',version:'1',step_ms:'125',...titles},'基本名と各言語の表示名を独立して保持');
for(const newline of ['\n','\r','\r\n'])assert.deepEqual(parseText('\uFEFF'+text.replaceAll('\n',newline)).notes,parsed.notes);
assert.equal(parseText(serialize([],3,125)).length,3);assert.equal(parseText('format=stepscore,version=1,step_ms=1\nC5\n').length,1);assert.equal(parseText('step_ms=1,version=1,format=stepscore\nC5\n\n').length,2);
for(const bad of ['stepscore,version=1,step_ms=1\nC5','format=stepscore,version=2,step_ms=1\nC5','format=stepscore,version=1,step_ms=0\nC5','format=stepscore,version=1,step_ms=1,title=%ab\nC5','format=stepscore,version=1,step_ms=1,title=x,title=y\nC5','format=stepscore,version=1,step_ms=1\nDb5','format=stepscore,version=1,step_ms=1\nC10'])assert.throws(()=>parseText(bad));
for(const meta of [{steps_per_quarter:'0'},{steps_per_quarter:'1.5'},{time_signature:'3/3'},{time_signature:'0/4'}])assert.throws(()=>serialize([],1,125,meta));
assert.throws(()=>serialize([],MAX_STEPS+1,125));assert.throws(()=>serialize([{step:1,midi:72}],1,125));assert.throws(()=>serialize([],1,Infinity));
const shifted=convertScore(parsed,{subdivision:6,transpose:0});assert.equal(shifted.length,8);assert.equal(shifted.notes[2].step,2);assert.throws(()=>convertScore(parsed,{subdivision:3,transpose:1}),'MIDI127を超える移調を拒否');
const neutral=suggestTranspositions([{midi:60},{midi:64},{midi:67}],definitions.instruments[1].allowed);assert.equal(neutral[0].transpose,0);assert.equal(neutral[0].outside,0);
for(const bad of [[{...profiles[0],id:undefined}], [{...profiles[0],range:[21,108]}], [{...profiles[0],defaultSoundset:'missing'}]])assert.throws(()=>validateDefinitions(bad,sounds));
assert.throws(()=>validateDefinitions(profiles,[{...sounds[0],base:'../private/'},sounds[1]]));
const expectedCatalog=await catalogData();assert.equal(await readFile('dist/samples/index.json','utf8'),expectedCatalog,'サンプルを編集したらnpm run buildで一覧を更新してください');
const catalog=JSON.parse(expectedCatalog),samples=catalog.songs.flatMap(song=>song.versions);
assert(!('samples' in catalog));assert(catalog.songs.every(song=>typeof song.song_id==='string'&&!('id' in song)));assert.equal(new Set(catalog.songs.map(song=>song.song_id)).size,catalog.songs.length);assert.equal(new Set(samples.map(version=>version.id)).size,samples.length);
// 実際の一覧生成で同一楽器の複数版・固定曲ID・ラベル補完と情報の衝突を確認する。
{
  await mkdir('.sites-runtime',{recursive:true});const directory=await mkdtemp('.sites-runtime/catalog-'),files=['a-easy.txt','demo-piano-88.txt','z-standard.txt','other-piano-88.txt'];
  const common={title:'Example',title_ja:'例の曲',composer:'Composer',composer_ja:'作曲者',composer_en:'Composer',reading_ja:'れいのきょく'},easy={...common,song_id:'demo',arranged_for:'musicbox30',label_ja:'オルゴール30(易)',label_en:'Music box 30 (Easy)'},standard={...common,song_id:'demo',arranged_for:'musicbox30',label:'オルゴール30(標準)'};
  const save=(file,metadata,midi=72)=>writeFile(directory+'/'+file,serialize([{step:0,midi}],2,200,Object.fromEntries(Object.entries(metadata).filter(([,value])=>value!==undefined))));
  try{
    await save(files[0],{...easy,title_ja:undefined});await save(files[1],{...common,arranged_for:'piano88'},36);await save(files[2],standard);await save(files[3],{...common,arranged_for:'piano88'},21);
    const result=JSON.parse(await catalogData(directory)),song=result.songs.find(song=>song.song_id==='demo');
    assert.equal(result.songs.length,2,'同名・同じ作曲者でも曲IDが異なれば分ける');assert.equal(song.title_ja,'例の曲','省略された訳名を他の版から補う');assert.deepEqual(song.versions.map(version=>version.id),['a-easy','demo-piano-88','z-standard']);
    assert.equal(song.versions.filter(version=>version.arranged_for==='musicbox30').length,2);assert.equal(song.versions[0].label_ja,'オルゴール30(易)');assert.equal(song.versions[0].label_en,'Music box 30 (Easy)');assert.equal(song.versions[1].label_ja,'ピアノ88');assert.equal(song.versions[1].label_en,'Piano 88');assert.equal(song.versions[2].label_en,standard.label);
    assert.deepEqual(song.versions[0].usedNotes,[72]);assert.equal(song.versions[0].length,2);assert.equal(song.versions[0].stepMs,200);assert(!('title' in song.versions[0]));assert(!('arranged_for' in song));
    await save(files[0],{...easy,label_ja:'オルゴール30(入門)',label_en:undefined});const changed=JSON.parse(await catalogData(directory));assert.notEqual(changed.revision,result.revision);assert.equal(changed.songs.find(song=>song.song_id==='demo').versions[0].label_en,'オルゴール30(入門)','他言語でも版の違いを残す');
    await save(files[0],{...easy,composer:'別の作者'});await assert.rejects(catalogData(directory),/情報が一致しません/);
    await save(files[0],{...easy,song_id:undefined});await assert.rejects(catalogData(directory),/曲ID/);
    await save(files[0],{...easy,song_id:'../demo'});await assert.rejects(catalogData(directory),/曲ID/);
    await save(files[0],{...easy,label:''});await assert.rejects(catalogData(directory),/版名/);
  }finally{for(const file of files)await rm(directory+'/'+file,{force:true});await rmdir(directory);}
}
// 実際の一覧の並べ替えを実行し、曲名から読み込む版とおすすめの共通順位を検査する。
{
  const app=await readFile('dist/app.js','utf8'),sort=app.split('\n').find(line=>line.includes('versions.sort('));assert(sort);
  const sizes=new Map(definitions.instruments.map(item=>[item.arrangedFor,item.allowed.size]));
  for(const [target,candidates,expected]of [
    ['piano88',['xylophone32','musicbox30'],'musicbox30'],
    ['piano61',['xylophone32','musicbox30'],'musicbox30'],
    ['xylophone32',['musicbox30','xylophone32'],'xylophone32'],
    ['musicbox30',['xylophone32','musicbox30'],'musicbox30'],
    ['piano88',['xylophone32','musicbox30','piano61'],'piano61'],
    ['piano88',['musicbox30','piano88'],'piano88'],
    ['piano88',['xylophone32'],'xylophone32'],
  ]){const versions=candidates.map(id=>({id,arranged_for:id}));runInContext(sort,createContext({versions,instrument:{arrangedFor:target},sizes}));assert.equal(versions[0].id,expected,'編曲版の優先順位：'+target+' '+candidates.join(','));}
  const versions=[{id:'z',arranged_for:'musicbox30'},{id:'a',arranged_for:'musicbox30'}];runInContext(sort,createContext({versions,instrument:{arrangedFor:'musicbox30'},sizes}));assert.deepEqual(versions.map(version=>version.id),['z','a'],'同じ楽器の版は配列順を保持する');
}
for(const entry of samples){const score=parseText(await readFile('dist/samples/'+entry.file,'utf8'));assert(entry.label_ja&&entry.label_en,'日英の表示ラベルを生成する');for(const key of ['source','listen','detail','work_id','pickup_steps'])assert(!(key in score.metadata),'削除した項目をサンプルTXTに残さない：'+key);for(const [key,value] of Object.entries(score.metadata).filter(([key])=>key.startsWith('title_')))assert(value&&value!==score.metadata.title,'基本名と同じ表示名は省略する：'+entry.file+' '+key);assert.deepEqual(parseText(serialize(score.notes,score.length,score.stepMs,score.metadata)),score);}
// 既存の対を検査し、追加のオルゴール版には木琴版を要求しない。
for(const entry of catalog.songs.flatMap(song=>song.versions.filter(version=>version.id===song.song_id+'-musicbox-30'))){
  const wood=samples.find(s=>s.id===entry.id.replace(/-musicbox-30$/,'-xylophone-32'));assert(wood,'木琴版がない：'+entry.id);
  const original=parseText(await readFile('dist/samples/'+entry.file,'utf8')),score=parseText(await readFile('dist/samples/'+wood.file,'utf8'));
  assert.equal(score.length,entry.id==='bach-toccata-fugue-musicbox-30'?100:original.length,'木琴版の末尾休符も含む長さ：'+wood.id);assert.equal(score.stepMs,original.stepMs,'木琴版の速度：'+wood.id);
  assert.deepEqual(score.metadata,{...original.metadata,arranged_for:'xylophone32'},'版を同じ曲として表示し拍単位を保つ：'+wood.id);
  const counts=new Map();for(const n of score.notes){assert(xylophone32.allowed.has(n.midi),'木琴の対応音：'+wood.id);counts.set(n.step,(counts.get(n.step)??0)+1);}assert(Math.max(...counts.values())<=2,'木琴は主旋律と簡単な伴奏で同時2音まで：'+wood.id);
}
// シューマンOp.54：通常の付点・八分音符を8分割で正確に保持し、タイは再発音しない。
{
 const score=parseText(await readFile('dist/samples/schumann-piano-concerto-first-musicbox-30.txt','utf8'));
 assert.equal(score.length,352);assert.equal(score.stepMs,55);assert.equal(score.metadata.steps_per_quarter,'8');
 const allowed=definitions.instruments.find(i=>i.arrangedFor==='musicbox30').allowed,counts=new Map();
 for(const n of score.notes){assert(allowed.has(n.midi));counts.set(n.step,(counts.get(n.step)??0)+1);}assert(Math.max(...counts.values())<=4);
 for(const [beat,name]of [[.75,'E6'],[1,'F6'],[2.75,'C#6'],[3,'D6'],[3.75,'A5'],[12,'C6'],[14,'B5'],[15.5,'A5'],[18.5,'A5'],[19,'B5'],[19.5,'C6'],[40,'G#5'],[41,'A5']])assert(score.notes.some(n=>n.step===beat*8&&n.midi===noteNumber(name)),'オルゴールの原譜の拍位置：'+beat+' '+name);
 for(const [beat,name]of [[5.75,'E5'],[7.75,'A4']])assert(score.notes.some(n=>n.step===beat*8&&n.midi===noteNumber(name)),'冒頭の下降旋律を内声の折り返しで覆わない');
 for(const [beat,name]of [[5.75,'G#5'],[7.75,'A5']])assert(!score.notes.some(n=>n.step===beat*8&&n.midi===noteNumber(name)),'余分な上の音を入れない');
 assert(!score.notes.some(n=>n.step===70),'対応外のG♯4の短い和音は折り返さず省略する');
 for(const [beat,name]of [[8,'A#4'],[9,'A4'],[9.75,'F4'],[10,'E4'],[11,'G#5'],[11,'A4']])assert(score.notes.some(n=>n.step===beat*8&&n.midi===noteNumber(name)),'第3小節の下降と原譜の最後の高い和音');
 for(const [beat,name]of [[18,'A5'],[24,'C6']])assert(!score.notes.some(n=>n.step===beat*8&&n.midi===noteNumber(name)),'管のタイを再発音しない');
 const piano=parseText(await readFile('dist/samples/schumann-piano-concerto-first-piano-88.txt','utf8'));
 assert.equal(piano.length,2160);assert.equal(piano.stepMs,55);assert.equal(piano.metadata.steps_per_quarter,'8');
 for(const [beat,name]of [[.75,'E6'],[1,'F6'],[2.75,'C#6'],[15.5,'A4'],[18.5,'A4'],[19.5,'C5'],[40,'G#4'],[41,'A4'],[180,'C#5'],[232,'E5'],[232,'C5'],[240,'G5'],[240,'C#5'],[249,'F5'],[253,'D5'],[255,'C5'],[264,'C2'],[264,'C4'],[264,'E4'],[264,'E5']])assert(piano.notes.some(n=>n.step===beat*8&&n.midi===noteNumber(name)),'88鍵版の旧譜の拍位置：'+beat+' '+name);
 for(const [beat,name]of [[12,'E6'],[244,'C#5']])assert(piano.notes.some(n=>n.step===beat*8&&n.midi===noteNumber(name)),'強奏の抜けと後半の臨時記号');
 for(const [beat,name]of [[124,'E1'],[124,'E2'],[128,'F4'],[244,'B4']])assert(!piano.notes.some(n=>n.step===beat*8&&n.midi===noteNumber(name)),'伴奏のタイと後半の読み違いを修正');
 for(const [beat,name]of [[18,'A4'],[24,'C5'],[56,'C6'],[62,'A6'],[252,'E5']])assert(!piano.notes.some(n=>n.step===beat*8&&n.midi===noteNumber(name)),'88鍵版のタイを再発音しない：'+beat+' '+name);
 // 五連符は休符と上行3音へ整理し、16分音符の間隔を揃える。
 for(const [offset,name]of [[2,'G3'],[4,'B3'],[6,'E4']])assert(piano.notes.some(n=>n.step===75*8+offset&&n.midi===noteNumber(name)));
 for(const [offset,name]of [[3,'B3'],[5,'E4'],[6,'G3']])assert(!piano.notes.some(n=>n.step===75*8+offset&&n.midi===noteNumber(name)));
 assert(piano.notes.every(n=>n.step<=2112&&definitions.instruments.find(i=>i.arrangedFor==='piano88').allowed.has(n.midi)),'88鍵の音域と最後の和音後の余韻');
}
// ユーザー提示の配置：A・A・B♭・Aを八分音符で並べ、同型の反復も揃える。
for(const [kind,octave]of [['musicbox-30',5],['xylophone-32',6]]){
 const score=parseText(await readFile(`dist/samples/grandfathers-clock-${kind}.txt`,'utf8'));
 assert.equal(score.length,256);assert.equal(score.stepMs,139);
 for(const base of [20,84,212]){
  for(const [offset,name]of [[0,'A'],[2,'A'],[4,'A#'],[6,'A']])assert(score.notes.some(n=>n.step===base+offset&&n.midi===noteNumber(name+octave)),'古時計の歌唱リズム：'+kind+' '+base);
  assert(!score.notes.some(n=>n.step===base+7&&n.midi===noteNumber('A'+octave)),'付点の末尾を八分位置へ移す');
 }
 assert(!score.notes.some(n=>n.step===213&&n.midi===noteNumber('A'+octave)),'余分な16分音符の打ち直しを省く');
}
// 2026-10-07：オルゴールだけ移調と範囲を修正。他楽器のトッカータは従来の100ステップ。
for(const [id,length,expected]of [
 ['military-march',128,[[0,'C5'],[6,'A4'],[24,'C4'],[27,'D4'],[112,'B5'],[114,'C6'],[116,'D6'],[119,'E6'],[120,'C6']]],
 ['sugar-plum-fairy',68,[[2,'F6'],[24,'A5'],[34,'F5'],[35,'D5'],[38,'E5'],[40,'A#5'],[44,'F6'],[48,'D#6'],[56,'C#6'],[64,'D6']]],
 ['bach-toccata-fugue',24,[[0,'A6'],[1,'G6'],[2,'A6'],[11,'G6'],[12,'F6'],[13,'E6'],[14,'D6'],[15,'C#6'],[16,'D6']]],
]){
 const score=parseText(await readFile(`dist/samples/${id}-musicbox-30.txt`,'utf8'));
 assert.equal(score.length,length,'オルゴール版の収録範囲');
 for(const [step,name]of expected)assert.equal(Math.max(...score.notes.filter(n=>n.step===step).map(n=>n.midi)),noteNumber(name),'原譜の一括移調と高低差：'+id+' '+step);
 const counts=new Map();for(const n of score.notes)counts.set(n.step,(counts.get(n.step)??0)+1);assert(Math.max(...counts.values())<=4,'オルゴールの伴奏を整理');
 if(id==='bach-toccata-fugue')assert(!score.notes.some(n=>n.step>16),'最初の音型の着地後は余韻');
}
// Primo第7〜22小節を連続採用。原譜の全音を同じ+10半音で移し、第58・62小節へ差し替えない。
const militaryWood=parseText(await readFile('dist/samples/military-march-xylophone-32.txt','utf8'));
for(const [step,name]of [[0,'G6'],[6,'E6'],[24,'G5'],[27,'A5'],[32,'G6'],[40,'A6'],[63,'C7'],[72,'E7'],[76,'G7'],[84,'F7'],[112,'F#7'],[114,'G7'],[116,'A7'],[119,'B7'],[120,'G7']])assert(militaryWood.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'木琴の原譜声部・調・句の高低差：'+step);
const sugarWood=parseText(await readFile('dist/samples/sugar-plum-fairy-xylophone-32.txt','utf8'));
for(const [step,name]of [[2,'G7'],[24,'B6'],[34,'G6'],[38,'F#6'],[40,'C7'],[42,'B6'],[44,'G7'],[48,'F7'],[56,'D#7'],[64,'E7']])assert(sugarWood.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'金平糖の原譜のオクターブ差と終止：'+step);
const twinkleWood=parseText(await readFile('dist/samples/twinkle-xylophone-32.txt','utf8'));
assert(twinkleWood.notes.some(n=>n.step===184&&n.midi===noteNumber('C6')),'木琴の最後の主音');assert(!twinkleWood.notes.some(n=>n.step===28&&n.midi===noteNumber('G6')),'長い旋律音を伴奏で打ち直さない');
for(const id of ['military-march','sugar-plum-fairy','bach-toccata-fugue']){
  const original=parseText(await readFile(`dist/samples/${id}-musicbox-30.txt`,'utf8')),score=parseText(await readFile(`dist/samples/${id}-piano-61.txt`,'utf8'));
  assert(samples.some(s=>s.id===id+'-piano-61'),'61鍵版の一覧');assert.equal(score.length,id==='bach-toccata-fugue'?100:original.length);assert.equal(score.stepMs,original.stepMs);assert.deepEqual(score.metadata,{...original.metadata,arranged_for:'piano61'});
  const counts=new Map();for(const n of score.notes){assert(piano61.allowed.has(n.midi));counts.set(n.step,(counts.get(n.step)??0)+1);}assert(Math.max(...counts.values())<=4);
  const expected=id==='military-march'?[[112,'F#6'],[114,'G6'],[116,'A6'],[119,'B6'],[120,'G6']]:id==='sugar-plum-fairy'?[[2,'G6'],[34,'G5'],[40,'C6'],[44,'G6'],[48,'F6'],[64,'E6']]:[[62,'D4'],[63,'C#4'],[64,'D4'],[72,'D3'],[72,'C#4'],[92,'G4'],[94,'E4'],[96,'F#4']];
  for(const [step,pitch]of expected)assert(score.notes.some(n=>n.step===step&&n.midi===noteNumber(pitch)),'61鍵版で音域制約の変更を復元：'+id+' step'+step);
  if(id==='sugar-plum-fairy')assert(!score.notes.some(n=>n.step===2&&n.midi===noteNumber('G5')),'変更前の旋律を同時に残さない');
}
// 原譜画像から読んだ低音・声部・終止と、ステップ間隔の下限を固定する。
for(const [id,length,expected]of [
  ['military-march',2160,[[0,'D3'],[0,'D4'],[48,'A5'],[160,'G#6'],[162,'A6'],[164,'B6'],[167,'C#7'],[168,'A6'],[2152,'D2'],[2152,'D7']]],
  ['burgmuller-arabesque',440,[[0,'A3'],[0,'C4'],[0,'E4'],[16,'A4'],[17,'B4'],[18,'C5'],[60,'D5'],[80,'A4'],[136,'C5'],[144,'E5'],[432,'C5'],[432,'A5']]],
  ['gymnopedie-1',1872,[[0,'G3'],[104,'F#6'],[104,'B4'],[104,'D5'],[104,'F#5'],[112,'A6'],[432,'E5'],[936,'G3'],[1848,'D3'],[1848,'F5'],[1848,'D6']]],
  ['chopin-prelude-7',392,[[0,'E4'],[8,'C#5'],[8,'E2'],[14,'D5'],[272,'A#4'],[272,'C#6'],[350,'A4'],[368,'A5']]],
  ['mozart-turkish-march',1788,[[0,'B4'],[1,'A4'],[2,'G#4'],[3,'A4'],[4,'C5'],[4,'A3'],[36,'B5'],[64,'B4'],[252,'A4'],[252,'A2'],[1780,'A2'],[1780,'C#5'],[1780,'A5']]],
]){
  const score=parseText(await readFile(`dist/samples/${id}-piano-88.txt`,'utf8')),original=parseText(await readFile(`dist/samples/${id}-musicbox-30.txt`,'utf8'));
  assert(samples.some(s=>s.id===id+'-piano-88'));assert.equal(score.length,length);assert(score.stepMs>50,'88鍵版の間隔は50msより長い');assert(score.notes.every(n=>n.midi>=21&&n.midi<=108));
  assert.deepEqual({...score.metadata,step_ms:original.metadata.step_ms,steps_per_quarter:original.metadata.steps_per_quarter},{...original.metadata,arranged_for:'piano88'},'同じ曲の88鍵版として扱う');
  for(const [step,pitch]of expected)assert(score.notes.some(n=>n.step===step&&n.midi===noteNumber(pitch)),id+' 原譜の音：'+step+' '+pitch);
  if(id==='gymnopedie-1')for(const step of [456,480])assert(!score.notes.some(n=>n.step===step&&n.midi===noteNumber('E5')),'タイを打ち直さない');
  if(id==='chopin-prelude-7')for(const step of [351,352])assert(!score.notes.some(n=>n.step===step&&n.midi===noteNumber('A4')),'終止の同音装飾を重ねて打ち直さない');
  if(id==='mozart-turkish-march'){assert(!score.notes.some(n=>n.step===36&&n.midi===noteNumber('G5')),'前打音を主音と同時の和音にしない');assert(!score.notes.some(n=>n.step>=1784),'原譜最後の1拍の休符を保持');}
}
for(const entry of samples.filter(s=>s.arranged_for==='piano88')){
  const score=parseText(await readFile('dist/samples/'+entry.file,'utf8'));
  assert(score.stepMs>50,'88鍵版の発音間隔は50msより長い：'+entry.id);
  assert(score.notes.every(n=>n.midi>=21&&n.midi<=108),'88鍵版の音域：'+entry.id);
  assert.equal(new Set(score.notes.map(n=>n.step+':'+n.midi)).size,score.notes.length,'88鍵版の重複：'+entry.id);
}
// Peters版の前打音を独立ステップで鳴らさず、後続和音を本来の拍へ戻す。
const danube88=parseText(await readFile('dist/samples/blue-danube-piano-88.txt','utf8'));
for(const [step,name]of [[20,'F#5'],[116,'G5'],[128,'C#5'],[128,'G5'],[164,'D5'],[212,'D6'],[1212,'C6'],[1228,'G5']])assert(danube88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'青きドナウ：前打音後の和音の拍位置');
for(const [step,name]of [[20,'A4'],[116,'C#5'],[129,'C#5'],[129,'G5'],[212,'D5'],[1212,'F5'],[1228,'A5']])assert(!danube88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'青きドナウ：独立した前打音・遅れた重複を除く');
const doll88=parseText(await readFile('dist/samples/dolls-dream-piano-88.txt','utf8'));
assert.equal(doll88.length,1324);assert.equal(doll88.stepMs,127);
for(const [step,name]of [[0,'E4'],[0,'G4'],[0,'C3'],[804,'E6'],[884,'F#5'],[1230,'E7'],[1308,'C4']])assert(doll88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'人形の夢と目覚め：旧譜の開始・踊り・8va・終止');
for(const [step,name]of [[804,'E6'],[805,'C6'],[806,'G5'],[808,'E6'],[809,'C6'],[810,'G5']])assert(doll88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'踊り：16分音符の間隔を一定にする');
assert(!doll88.notes.some(n=>n.step===804&&n.midi===noteNumber('G6')),'踊りの最初の加線を読み違えない');
assert(!doll88.notes.some(n=>n.step>1308),'最後の和音に2秒の余韻');
const hero88=parseText(await readFile('dist/samples/handel-see-conquering-hero-piano-88.txt','utf8'));
assert.equal(hero88.length,1232);assert.equal(hero88.stepMs,134);
for(const [step,name]of [[0,'A#5'],[0,'G5'],[8,'G5'],[14,'G#5']])assert(hero88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'見よ、勇者は帰る：底本の主題・付点の配置');
assert(!hero88.notes.some(n=>n.step>=1216),'最終小節後に4拍の余韻');
const spring88=parseText(await readFile('dist/samples/mendelssohn-spring-song-piano-88.txt','utf8'));
assert.equal(spring88.length,1442);assert.equal(spring88.stepMs,112);
for(const [step,name]of [[0,'C#5'],[0,'A1'],[4,'A4'],[8,'E4'],[10,'D5'],[12,'D#5'],[14,'E5'],[16,'A5'],[20,'E5'],[1380,'E4'],[1408,'A6'],[1424,'A1']])assert(spring88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'春の歌：原譜の通常音符・終止の発音位置');
assert(!spring88.notes.some(n=>n.step===8&&n.midi===noteNumber('C#5')),'春の歌：冒頭のタイを打ち直さない');
assert(!spring88.notes.some(n=>n.step===1376&&n.midi===noteNumber('A4')),'春の歌：87小節のタイを打ち直さない');
assert(!spring88.notes.some(n=>n.step===153),'春の歌：20拍目の2ステップ目は休符');
assert(!spring88.notes.some(n=>n.step>1424),'春の歌の最後に余韻を置く');
const cancan88=parseText(await readFile('dist/samples/offenbach-can-can-piano-88.txt','utf8'));
assert.equal(cancan88.length,1421);assert.equal(cancan88.stepMs,94);
for(const [step,name]of [[8,'F#6'],[9,'F6'],[151,'A4'],[153,'E5'],[155,'E5'],[157,'F#5'],[1391,'D5']])assert(cancan88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'ガロップ：導入の半音・器楽主題・終止');
assert(!cancan88.notes.some(n=>n.step>1391),'ガロップの終止後に余韻を残す');
const bogey88=parseText(await readFile('dist/samples/colonel-bogey-piano-88.txt','utf8'));
assert.equal(bogey88.length,2685);assert.equal(bogey88.stepMs,69);
for(const [step,name]of [[0,'D5'],[64,'A5'],[68,'F#5'],[96,'F#6'],[104,'F#6'],[112,'D6'],[2656,'G2'],[2656,'G3']])assert(bogey88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'ボギー大佐：原譜の導入・主題・独自終止');
assert(!bogey88.notes.some(n=>n.step===64&&n.midi===noteNumber('F#5')),'ボギー大佐：後続のF#5をA5と同時に発音しない');
assert.deepEqual(bogey88.notes.filter(n=>n.midi===noteNumber('D6')&&n.step>=112&&n.step<128).map(n=>n.step),[112],'ボギー大佐：主題の全音符は一度だけ発音する');
assert(!bogey88.notes.some(n=>n.midi>noteNumber('F#6')),'ボギー大佐：旧ロールの上方オクターブ重奏を除く');
assert(!bogey88.notes.some(n=>n.step>2656),'ボギー大佐の終止後の余韻');
// 全体を1オクターブ上げた版は61鍵の音域に収める。
for(const id of ["toy-soldiers","chanson-oignon","funiculi-funicula","gymnopedie-1","jesu-joy","jupiter","mars","mussorgsky-promenade","oborozukiyo","sakkijarven-polkka","schubert-ave-maria","soviet-anthem","yokohama-shika","yuki-no-shingun"]){
 const score=parseText(await readFile(`dist/samples/${id}-piano-88.txt`,'utf8'));
 assert(score.notes.every(n=>piano61.allowed.has(n.midi)),'一括移調後の61鍵音域：'+id);
}
const toy88=parseText(await readFile('dist/samples/toy-soldiers-piano-88.txt','utf8'));
assert.equal(toy88.length,1096);assert.equal(toy88.stepMs,128);assert.equal(toy88.metadata.steps_per_quarter,'4');assert.equal(toy88.metadata.time_signature,'2/4');
for(const [step,name]of [[6,'E5'],[7,'E5'],[8,'E5'],[40,'C#5'],[424,'A5'],[425,'D6'],[426,'F#5'],[428,'B5'],[430,'A5'],[552,'A5'],[648,'C#6'],[649,'F#6'],[1021,'C7'],[1072,'A2'],[1073,'A2'],[1073,'A5']])assert(toy88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'兵隊のマーチ：1905年簡易譜の弱起・主題・再現・終止');
for(const start of [64,288,928])for(const [offset,name]of ['E5','D#5','D5','C#5'].entries())assert(toy88.notes.some(n=>n.step===start+offset&&n.midi===noteNumber(name)),'兵隊のマーチ：半音下降の16分音符を等間隔にする');
assert(!toy88.notes.some(n=>n.step===424&&n.midi===noteNumber('D6')),'兵隊のマーチ：先行するA4へD5を重ねない');
assert.deepEqual(toy88.notes.filter(n=>n.midi===noteNumber('E5')&&n.step>=42&&n.step<48).map(n=>n.step),[42,44,46,47],'兵隊のマーチ：簡易譜の8分音符と2つの16分音符を保つ');
assert(!toy88.notes.some(n=>n.step<6||n.step>1073),'兵隊のマーチ：弱起前の休符と最終和音後の余韻');
assert(Math.max(...toy88.notes.map(n=>n.midi))<=noteNumber('C7'),'兵隊のマーチ：旧ロールの上方重奏を除く');
assert(Math.max(...Object.values(toy88.notes.reduce((counts,n)=>(counts[n.step]=(counts[n.step]??0)+1,counts),{})))<=4,'兵隊のマーチ：簡単な低音・和音に整理する');
const mars88=parseText(await readFile('dist/samples/mars-piano-88.txt','utf8'));
assert.equal(mars88.length,3072);assert.equal(mars88.stepMs,69);
for(const [step,name]of [[0,'F5'],[0,'C5'],[0,'G#4'],[3036,'C2'],[3036,'C3'],[3036,'G4']])assert(mars88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'火星：後半の開始と最終和音');
assert(!mars88.notes.some(n=>n.step>3036),'火星の終止後の余韻');
const csikos88=parseText(await readFile('dist/samples/csikos-post-piano-88.txt','utf8'));
assert.equal(csikos88.length,896);assert.equal(csikos88.stepMs,125);
for(const [step,name]of [[0,'A#6'],[48,'G6'],[54,'D#6'],[56,'A#5'],[70,'B5'],[864,'G#5'],[872,'D#6']])assert(csikos88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'クシコス・ポスト：旧譜の導入・主題・臨時記号・終止');
assert(!csikos88.notes.some(n=>n.step>872),'クシコス・ポストの終止後の余韻');
assert(csikos88.notes.some(n=>n.step===658&&n.midi===noteNumber('A#5')),'クシコス・ポストの三連符の開始音を保持');
for(const [step,name]of [[659,'D#6'],[659,'F6'],[667,'C6'],[667,'D#6'],[675,'A#5'],[675,'C6']])assert(!csikos88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'三連符の内音を同じマスへ丸めない');
const farandole88=parseText(await readFile('dist/samples/bizet-farandole-piano-88.txt','utf8'));
assert.equal(farandole88.length,944);assert.equal(farandole88.stepMs,125);
for(const [step,name]of [[8,'D5'],[144,'D5'],[152,'F5'],[704,'B5'],[706,'C#6'],[708,'D6'],[798,'D7'],[800,'C#7'],[924,'D2']])assert(farandole88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'ファランドール：導入・移行・舞曲・8va・終止');
assert(!farandole88.notes.some(n=>n.step>924),'ファランドールの終止後の余韻');
const moldau88=parseText(await readFile('dist/samples/smetana-moldau-piano-88.txt','utf8'));
assert.equal(moldau88.length,1612);assert.equal(moldau88.stepMs,82);
for(const [step,name]of [[4,'E5'],[736,'F#5'],[748,'D#5'],[772,'A5'],[796,'E5'],[804,'F#5'],[808,'G#5'],[844,'C6'],[1564,'E2']])assert(moldau88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'モルダウ：主題・臨時記号・連続部分・終止');
assert(!moldau88.notes.some(n=>n.step>1564),'モルダウの終止後の余韻');
const winter88=parseText(await readFile('dist/samples/vivaldi-winter-first-piano-88.txt','utf8'));
assert.equal(winter88.length,2040);assert.equal(winter88.stepMs,94);
for(const [step,name]of [[0,'F3'],[32,'G4'],[64,'C#5'],[96,'A#5'],[1984,'F2'],[1984,'G#3'],[1984,'F4']])assert(winter88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'冬：原譜の声部入口と終止');
assert(!winter88.notes.some(n=>n.step>1984),'冬の終止後の余韻');
// 原譜第30小節前半で終える。フーガ入口を含めず、最後に2拍の余韻を残す。
const toccata88=parseText(await readFile('dist/samples/bach-toccata-fugue-piano-88.txt','utf8'));
assert.equal(toccata88.length,960);assert.equal(toccata88.stepMs,125);
for(const name of ['D2','D3','A3','D4'])assert(toccata88.notes.some(n=>n.step===928&&n.midi===noteNumber(name)));
assert(!toccata88.notes.some(n=>n.step>=944),'トッカータ終止後の余韻');
// 底本で前打音に続く主音の記譜位置を確認。通常音・別声部のユニゾンも残す。
// 格子の間にある細かな音を次の拍へ移さず省略する。
for(const [id,step,name]of [['jupiter',23,'F5'],['carmen-prelude',1382,'E5'],['new-world-largo',659,'F4'],['new-world-largo',661,'G#4']]){
 const score=parseText(await readFile(`dist/samples/${id}-piano-88.txt`,'utf8'));
 assert(!score.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'細かな音を次の格子へ遅らせない: '+id);
}
for(const [id,on,off]of [
 ['radetzky-march',[[60,'F#5']],[[60,'G5'],[61,'F#5']]],
 ['mendelssohn-wedding-march',[[162,'F4'],[162,'G4'],[162,'D5']],[[162,'B4'],[163,'C5'],[164,'D5']]],
 ['wagner-bridal-chorus',[[756,'D#5']],[[756,'F5']]],
 ['new-world-fourth',[[448,'B5'],[608,'E3']],[[448,'G4'],[449,'B5'],[609,'E3']]],
 ['salut-damour',[[240,'C#5']],[[240,'E5'],[241,'C#5']]],
 ['mozart-figaro-overture',[[216,'C#6']],[[216,'D6'],[217,'B5'],[218,'C#6']]],
 ['nutcracker-march',[[284,'E5'],[284,'B5']],[[284,'A#5'],[285,'B5']]],
 ['chopin-nocturne-2',[[304,'G5']],[[304,'E5'],[305,'F5'],[305,'G5']]],
 ['air-on-g',[[80,'E5']],[[80,'F#5'],[81,'E5']]],
 ['eine-kleine',[[80,'G5']],[[80,'A5'],[81,'G5']]],
 ['toryanse',[[136,'C5'],[192,'G4']],[[140,'C5'],[204,'G4']]],
 ['mendelssohn-spring-song',[[152,'A4'],[184,'F#4'],[196,'D5'],[504,'F#4']],[[185,'F#4'],[197,'D5'],[185,'E4'],[505,'D#4']]],
]){
 const score=parseText(await readFile(`dist/samples/${id}-piano-88.txt`,'utf8'));
 const ratio=1;
 for(const [step,name]of on)assert(score.notes.some(n=>n.step===step*ratio&&n.midi===noteNumber(name)),id+'：主音・通常音を残す '+step+' '+name);
 for(const [step,name]of off)assert(!score.notes.some(n=>n.step===step*ratio&&n.midi===noteNumber(name)),id+'：前打音・遅れた重複を除く '+step+' '+name);
}
const march88=parseText(await readFile('dist/samples/nutcracker-march-piano-88.txt','utf8'));
for(const beat of [1,9,33,41,97,105,129,137,193,201,225,233,289,297,321,329]){
 for(const name of ['G4','B4','D5']){
  assert(march88.notes.some(n=>n.step===beat*4&&n.midi===noteNumber(name)),'行進曲：反復三連符の拍頭を保つ');
  for(const offset of [1,3])assert(!march88.notes.some(n=>n.step===beat*4+offset&&n.midi===noteNumber(name)),'行進曲：三連符を不均等な間隔で打ち直さない');
 }
}
const ode88=parseText(await readFile('dist/samples/ode-to-joy-piano-88.txt','utf8'));
const twinkle88=parseText(await readFile('dist/samples/twinkle-piano-88.txt','utf8'));
for(const [id,length,ms,expected]of [
 ['army-goes-rolling-along',528,69,[[0,'A#4'],[4,'G4'],[8,'A#4'],[232,'D#4'],[256,'A#4'],[260,'A#4'],[264,'D#5'],[488,'D#4'],[492,'D#6'],[504,'D#6']]],
 ['us-field-artillery',528,69,[[0,'A#4'],[4,'G4'],[8,'A#4'],[232,'D#4'],[256,'A#4'],[260,'A#4'],[264,'D#5'],[488,'D#4'],[492,'D#6'],[504,'D#6']]],
 ['shojoji',912,94,[[4,'C5'],[66,'E5'],[68,'D5'],[70,'C5'],[72,'A4'],[76,'G4'],[128,'C4'],[448,'C4'],[576,'C4'],[888,'C4']]],
 ['ravel-bolero',2772,69,[[0,'C2'],[0,'G3'],[144,'C5'],[792,'C5'],[1440,'A#4'],[2088,'A#5'],[2736,'C4']]],
 ['brahms-hungarian-dance-5',1186,114,[[0,'C#4'],[0,'F#2'],[6,'F#4'],[8,'A4'],[64,'C#5'],[1160,'F#2'],[1160,'F#5']]],
 ['grieg-morning',2104,83,[[0,'B4'],[0,'E3'],[4,'G#4'],[8,'F#4'],[12,'E4'],[2064,'E1']]],
 ['czardas',2230,100,[[0,'D6'],[80,'A3'],[760,'D5'],[1464,'D7'],[2198,'D4']]],
 ['maidens-prayer',1452,125,[[0,'D#3'],[0,'D#6'],[24,'G#4'],[24,'G#2'],[98,'A#4'],[98,'A#5'],[100,'D#6'],[102,'G6'],[1416,'D#6']]],
 ['soviet-anthem',1988,99,[[0,'C3'],[0,'C6'],[28,'G5'],[1952,'C3'],[1952,'C6']]],
 ['grandfathers-clock',784,69,[[0,'F4'],[8,'A#4'],[512,'F4'],[520,'A#4'],[744,'A#4']]],
 ['funiculi-funicula',2752,71,[[0,'A#3'],[0,'D6'],[226,'A#5'],[228,'D#6'],[2742,'D#2'],[2742,'D#6']]],
 ['sousa-washington-post',1830,83,[[0,'C6'],[4,'C#6'],[6,'D6'],[1818,'A#1'],[1818,'D5']]],
 ['radetzky-march',2242,83,[[0,'D3'],[0,'A3'],[0,'F#4'],[0,'D5'],[2232,'D5'],[2232,'F#3']]],
 ['carmen-prelude',2176,57,[[0,'A2'],[0,'A5'],[2144,'A6'],[2152,'A1']]],
 ['toryanse',624,94,[[8,'B4'],[16,'B4'],[192,'G4'],[516,'B3'],[560,'F#5'],[592,'B4']]],
 ['vivaldi-spring',1322,107,[[0,'E5'],[2,'G#5'],[0,'B4'],[0,'G#4'],[0,'E3'],[1306,'E5'],[1306,'E2']]],
 ['mendelssohn-wedding-march',4434,67,[[0,'C4'],[2,'C4'],[4,'C4'],[102,'A1'],[4374,'C2'],[4374,'C6']]],
 ['wagner-bridal-chorus',2088,89,[[0,'F4'],[0,'F5'],[48,'A#2'],[48,'A#3'],[48,'D4'],[2064,'D5'],[2064,'F5']]],
 ['little-fugue',2192,87,[[0,'G4'],[160,'D4'],[368,'G3'],[528,'D3'],[992,'D4'],[1072,'F3'],[2144,'G2'],[2144,'B3'],[2144,'D4'],[2144,'G5']]],
 ['blue-danube',1556,109,[[0,'D4'],[4,'F#4'],[8,'A4'],[1536,'D2'],[1536,'D5']]],
 ['new-world-fourth',2048,99,[[0,'B1'],[0,'B3'],[2032,'G1'],[2032,'G6']]],
 ['wagner-ride-of-valkyries',4608,72,[[0,'B1'],[3,'F#2'],[4593,'B3'],[4593,'B6']]],
 ['when-johnny',368,125,[[0,'E4'],[2,'A4'],[356,'A5']]],
 ['yuki-no-shingun',392,125,[[0,'D#6'],[4,'D#6'],[32,'D#5'],[128,'A#5'],[256,'A#5'],[376,'D#5']]],
 ['scotland-the-brave',264,125,[[0,'E5'],[2,'A4'],[10,'C#5'],[250,'A4']]],
 ['pomp-and-circumstance',2504,156,[[2488,'D2']]],
 ['swan-lake-scene',2256,82,[[32,'F#5'],[2208,'B1']]],
 ['salut-damour',1616,104,[[0,'E2'],[4,'G#4'],[1568,'E1']]],
 ['pachelbel-canon',1840,125,[[0,'D3'],[8,'A2'],[64,'F#5'],[1792,'D3'],[1792,'D5']]],
 ['nutcracker-march',1416,110,[[0,'D5'],[1404,'G2'],[1404,'G5']]],
 ['sakkijarven-polkka',1167,83,[[0,'A#5'],[1,'C6'],[2,'D6'],[3,'D#6']]],
 ['chanson-oignon',828,83,[[0,'D#3'],[42,'A#4'],[48,'D#5'],[804,'D#3']]],
 ['waltz-of-flowers',4232,83,[[0,'A3'],[4,'D4'],[8,'F#4'],[12,'G4'],[4212,'D1'],[4212,'D6']]],
 ['jesu-joy',1290,133,[[0,'G3'],[2,'G5'],[4,'A5'],[6,'B5'],[144,'B5'],[1260,'G2']]],
 ['sugar-plum-fairy',848,144,[[0,'E2'],[0,'E3'],[68,'E6']]],
 ['mussorgsky-promenade',1128,83,[[0,'G5'],[8,'F5'],[88,'G3'],[352,'F#2'],[400,'C#6'],[1104,'A#5']]],
 ['chopin-nocturne-2',1788,114,[[0,'A#4'],[4,'G5'],[4,'D#2'],[1748,'D#2'],[1748,'D#3'],[1748,'D#4']]],
 ['air-on-g',2336,125,[[0,'F#5'],[0,'D3'],[8,'D4'],[2272,'D2'],[2272,'D5']]],
 ['handel-hallelujah',1512,125,[[0,'D3'],[0,'F#4'],[0,'A4'],[0,'D5'],[1488,'D2'],[1488,'D3'],[1488,'A3'],[1488,'F#4'],[1488,'D5']]],
 ['silent-night',432,100,[[0,'F4'],[0,'D4'],[0,'A#3'],[0,'A#2'],[396,'A#3'],[396,'A#2']]],
 ['amazing-grace',384,82,[[0,'G2'],[0,'G3'],[0,'B3'],[0,'D4']]],
 ['momiji',512,82,[[0,'A4'],[8,'G4'],[12,'F4'],[480,'F4']]],
 ['oborozukiyo',384,104,[[0,'F#5'],[324,'E6'],[368,'D5']]],
]){
 const score=parseText(await readFile(`dist/samples/${id}-piano-88.txt`,'utf8'));
 const ratio=1;
 assert.equal(score.length,length*ratio);assert.equal(score.stepMs,Math.round(ms/ratio));
 for(const [step,name]of expected)assert(score.notes.some(n=>n.step===step*ratio&&n.midi===noteNumber(name)),id+' 原譜の節全体：'+step+' '+name);
}
assert.equal(twinkle88.length,3072);assert.equal(twinkle88.stepMs,75);
for(const [step,name]of [[0,'C5'],[768,'D5'],[1536,'C3'],[1632,'F2'],[2304,'C4'],[2408,'A5'],[3056,'C5'],[3064,'C3']])assert(twinkle88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'きらきら星の主題と第1〜3変奏：'+step+' '+name);
assert(!twinkle88.notes.some(n=>n.step===768+4*16&&n.midi===noteNumber('G5')),'第1変奏の小節をまたぐタイを打ち直さない');
assert.deepEqual(twinkle88.notes.filter(n=>n.step>=2304&&n.step<2320&&n.midi>=60).map(n=>[n.step,n.midi]),[[2304,60],[2312,72]],'第3変奏の三連符は拍上の音を残し、不均等な丸めを避ける');
assert.deepEqual(twinkle88.notes.filter(n=>n.step<128),twinkle88.notes.filter(n=>n.step>=128&&n.step<256).map(n=>({...n,step:n.step-128})),'主題前半8小節の反復');
const jingle88=parseText(await readFile('dist/samples/jingle-bells-piano-88.txt','utf8'));
assert.equal(jingle88.length,1024);assert.equal(jingle88.stepMs,64);
for(const [step,name]of [[0,'C4'],[4,'C4'],[8,'A4'],[12,'F3'],[84,'C5'],[252,'C5'],[260,'A4'],[298,'C5'],[300,'C#3'],[500,'F4'],[500,'F3'],[512,'C4']])assert(jingle88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'ジングルベルの二声譜：'+step+' '+name);
assert.equal(ode88.length,512);
for(const name of ['G3','D4','G4','B4'])assert(ode88.notes.some(n=>n.step===0&&n.midi===noteNumber(name)),'歓喜の歌の原調四声');
const fate88=parseText(await readFile('dist/samples/beethoven-fate-piano-88.txt','utf8'));
assert.equal(fate88.length,1984);
assert.deepEqual(fate88.notes.filter(n=>n.step<992),fate88.notes.filter(n=>n.step>=992).map(n=>({...n,step:n.step-992})),'提示部の反復を展開部と取り違えない');
const dies88=parseText(await readFile('dist/samples/mozart-dies-irae-piano-88.txt','utf8'));
assert.equal(dies88.length,1088);assert.equal(dies88.stepMs,83);
for(const [step,name]of [[116,'F5'],[116,'D5'],[452,'A5'],[452,'C5']])assert(!dies88.notes.some(n=>n.step===step&&n.midi===noteNumber(name)),'怒りの日：32分音符を次の拍へ遅らせず省く');
for(const name of ['D3','D4','D5','D6'])assert(dies88.notes.some(n=>n.step===1072&&n.midi===noteNumber(name)),'怒りの日の最終小節');
assert(!dies88.notes.some(n=>n.step>=1080),'怒りの日の最終2拍の休符');
const sakkijarven=parseText(await readFile('dist/samples/sakkijarven-polkka-musicbox-30.txt','utf8'));
for(const [step,name]of [[16,'B4'],[48,'B4'],[70,'A5'],[72,'A5'],[74,'A5'],[75,'B5'],[76,'A5'],[78,'G#5'],[80,'G#5'],[102,'A5'],[104,'A5'],[106,'A5'],[107,'B5'],[108,'A5'],[110,'G#5'],[112,'G#5'],[144,'B4'],[176,'B4']])assert.equal(Math.max(...sakkijarven.notes.filter(n=>n.step===step).map(n=>n.midi)),noteNumber(name),'サッキヤルヴェンの主旋律をCC0譜の音高に保つ：'+step);
for(const step of [18,50,146,178])assert(!sakkijarven.notes.some(n=>n.step===step&&n.midi===noteNumber('B4')),'主旋律の四分音符B4を伴奏で打ち直さない');
for(const sound of sounds){const hash=createHash('sha256');for(const file of Object.values(sound.files)){const bytes=await readFile('dist/'+sound.base+file);assert(bytes.length);if(file.endsWith('.ogg')){assert.equal(bytes.subarray(0,4).toString(),'OggS');if(sound.id.startsWith('vsco-')){const packet=27+bytes[26];assert.equal(bytes.subarray(packet,packet+7).toString(),'\x01vorbis');assert.equal(bytes[packet+11],2,'VSCO音源はステレオ：'+file);assert.equal(bytes.readUInt32LE(packet+12),44100);assert.equal(bytes.readInt32LE(packet+20),96000);}}hash.update(bytes);}assert.equal(hash.digest('hex').slice(0,16),sound.revision,'音源を変更したらnpm run buildで識別子を更新してください');}
const ja=await json('dist/locales/ja.json'),en=await json('dist/locales/en.json');assert.deepEqual(Object.keys(ja).sort(),Object.keys(en).sort());for(const key of Object.keys(ja))assert.deepEqual([...ja[key].matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort(),[...en[key].matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort(),key);
const {Midi}=createRequire(import.meta.url)('@tonejs/midi'),midi=new Midi();midi.header.setTempo(120);const track=midi.addTrack();track.addNote({midi:72,ticks:480,durationTicks:480});track.addCC({number:123,ticks:1920,value:0});const buffer=midi.toArray().buffer;
validateMidiHeader(buffer);assert.equal(convertMidi(midi,{tracks:[0],subdivision:4}).length,8);assert.equal(convertMidi(new Midi(buffer),{tracks:[0],subdivision:4}).length,16,'元ファイルの曲末イベントまでの休符を保持');assert.throws(()=>validateMidiHeader(new ArrayBuffer(2)));
const short=new Midi();short.addTrack().addNote({midi:72,ticks:0,durationTicks:120});assert.equal(convertMidi(short,{tracks:[0],subdivision:4}).length,1,'短いMIDIを16ステップまで伸ばさない');short.tracks[0].endOfTrackTicks=360;assert.equal(convertMidi(short,{tracks:[0],subdivision:4}).length,3,'短いMIDIの末尾休符も保持');
await mkdir('.sites-runtime',{recursive:true});
await writeFile('.sites-runtime/import-worker-check.mjs',`import {parentPort} from 'node:worker_threads';globalThis.self=globalThis;self.postMessage=data=>parentPort.postMessage(data);await import('../dist/import-worker.js');parentPort.on('message',data=>self.onmessage({data}));`);
const worker=new Worker(new URL('./.sites-runtime/import-worker-check.mjs',import.meta.url));
const request=data=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(data);});
try{
  let reply=await request({id:1,sourceId:1,kind:'text',buffer:new TextEncoder().encode(text).buffer,allowed:[...allowed]});assert(!reply.error,reply.error);assert.equal(reply.result.length,4);assert.equal(reply.summary.stepMs,172);assert.deepEqual(reply.result.notes,parsed.notes);assert.equal(reply.summary.tracks.length,0,'TXTのためにMIDIを生成しない');
  reply=await request({id:2,sourceId:1,kind:'text',settings:{tracks:[],subdivision:6,transpose:0},allowed:[...allowed]});assert(!reply.error,reply.error);assert.equal(reply.summary,null,'設定変更は保存済みデータから変換し、再解析しない');assert.equal(reply.result.length,8);
  reply=await request({id:3,sourceId:2,kind:'midi',buffer,subdivision:4,allowed:[...allowed]});assert(!reply.error,reply.error);assert.equal(reply.result.notes[0].step,4);assert.equal(reply.result.length,16);assert.equal(reply.summary.tracks[0].count,1);assert.equal(reply.summary.stepMs,125);
  reply=await request({id:5,sourceId:2,kind:'midi',settings:{tracks:[],subdivision:4,transpose:0},length:3,allowed:[...allowed]});assert(!reply.error,reply.error);assert.deepEqual(reply.result,{notes:[],length:3},'全トラック解除では現在の長さを保持');
  short.tracks[0].addCC({number:123,ticks:360,value:0});reply=await request({id:6,sourceId:4,kind:'midi',buffer:short.toArray().buffer,subdivision:4,allowed:[...allowed]});assert(!reply.error,reply.error);assert.equal(reply.result.length,3,'Worker取り込みでも短い曲末休符を保持');
  const large=new Midi(),largeTrack=large.addTrack();for(let step=0;step<16000;step++)for(let voice=0;voice<5;voice++)largeTrack.addNote({midi:21+(step+voice*13)%88,ticks:step*120,durationTicks:120});const largeBytes=large.toArray();await writeFile('.sites-runtime/large-import-check.mid',largeBytes);
  reply=await request({id:4,sourceId:3,kind:'midi',buffer:largeBytes.buffer,subdivision:4,allowed:[...definitions.instruments[1].allowed]});assert(!reply.error,reply.error);assert.equal(reply.result.notes.length,80000);assert.equal(reply.result.length,16000);console.log('80,000音のWorker処理（ms）:',reply.timing);
}finally{await worker.terminate();}
// 実際の再生処理を仮想時計で動かし、余韻中のループ切り替えとタイマー遅延を再現する。
{
  const app=await readFile('dist/app.js','utf8'),controls=new Map(['play','loop','rollViewport'].map(id=>[id,{pressed:'false',getAttribute(){return this.pressed;},setAttribute(name,value){if(name==='aria-pressed')this.pressed=value;}}])),audio={currentTime:10},events=[];let nextTick;
  const context=createContext({$:id=>controls.get(id),audio,player:null,playbackRequest:0,startStep:0,length:8,notes:Array.from({length:8},(_,step)=>({step,midi:72+step})),ALLOWED:new Set(Array.from({length:8},(_,i)=>72+i)),stepInterval:()=>125,t:key=>key,showError:message=>{if(message)throw new Error(message);},resumeAudio:async()=>{},loadTone:async()=>{},selectStart(){},markStep(){},ensureStepVisible(){},playTone:(midi,time)=>{events.push({midi,time,now:audio.currentTime});return time+3;},setTimeout:fn=>{nextTick=fn;return 1;},document:{addEventListener(){}}});
  context.stopPlayback=()=>{context.playbackRequest++;context.player=null;controls.get('play').pressed='false';};
  runInContext(app.slice(app.indexOf("$('play').onclick=async()=>{"),app.indexOf('let importWorker=null')),context);
  await controls.get('play').onclick();for(let tick=1;tick<=70;tick++){audio.currentTime=10+tick*.025;nextTick();}
  assert.equal(events.length,8,'ループOFFで次の周回を予約しない');assert.equal(context.player.next,8);assert(audio.currentTime<context.player.end,'譜面終了後も余韻を保持');
  for(let i=1;i<8;i++)assert(Math.abs(events[i].time-events[i-1].time-.125)<1e-9,'通常再生の間隔を維持');
  controls.get('loop').onclick();nextTick();assert.equal(events.length,9,'余韻中のループONで溜まった音を一斉に予約しない');assert.equal(events[8].midi,72,'先頭の音から再開');assert(Math.abs(events[8].time-audio.currentTime-.06)<1e-9);
  audio.currentTime=events[8].time+.01;nextTick();assert.equal(context.player.visual,0,'再開位置は先頭ステップ');
  audio.currentTime=12.6;nextTick();assert.equal(events.length,10,'タイマーが遅れても音を一斉に予約しない');assert.equal(events[9].midi,73,'次の音を飛ばさずに再開');assert(Math.abs(events[9].time-audio.currentTime-.06)<1e-9);
  controls.get('loop').onclick();for(let tick=1;tick<=200;tick++){audio.currentTime=12.6+tick*.025;nextTick();}
  assert.equal(events.length,16,'ループOFF後は現在の周回を最後まで再生');assert.equal(context.player,null,'余韻の終了で停止');assert(events.every(event=>event.time>=event.now),'過去時刻の発音を予約しない');
  for(let i=10;i<16;i++)assert(Math.abs(events[i].time-events[i-1].time-.125)<1e-9,'再開後も間隔を維持');
  console.log('確認成功：余韻中のループON・タイマー遅延・先頭からの再開・通常再生の間隔・余韻後の停止');
}
await import('./check-mp3.mjs');
console.log('確認成功：stepscore・サンプルの再入出力・楽器と音源・曲目一覧・翻訳・WorkerのTXT/MIDI変換');
