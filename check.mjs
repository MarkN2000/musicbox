import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {createContext,runInContext} from 'node:vm';
import {noteName,noteNumber,serialize,parseText,convertMidi,convertScore,suggestTranspositions,validateMidiHeader,rhythmMetadata,validateDefinitions,MAX_STEPS} from './dist/core.js';
import {catalogData} from './build-catalog.mjs';
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
const catalog=JSON.parse(expectedCatalog);
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
  ]){const versions=candidates.map(id=>({id,metadata:{arranged_for:id}}));runInContext(sort,createContext({versions,instrument:{arrangedFor:target},sizes}));assert.equal(versions[0].id,expected,'編曲版の優先順位：'+target+' '+candidates.join(','));}
}
for(const entry of catalog.samples){const score=parseText(await readFile('dist/samples/'+entry.file,'utf8'));for(const key of ['source','listen','detail','work_id','pickup_steps'])assert(!(key in score.metadata),'削除した項目をサンプルTXTに残さない：'+key);for(const [key,value] of Object.entries(score.metadata).filter(([key])=>key.startsWith('title_')))assert(value&&value!==score.metadata.title,'基本名と同じ表示名は省略する：'+entry.file+' '+key);assert.deepEqual(parseText(serialize(score.notes,score.length,score.stepMs,score.metadata)),score);}
for(const entry of catalog.samples.filter(s=>s.metadata.arranged_for==='musicbox30')){
  const wood=catalog.samples.find(s=>s.id===entry.id.replace(/-musicbox-30$/,'-xylophone-32'));assert(wood,'木琴版がない：'+entry.id);
  const original=parseText(await readFile('dist/samples/'+entry.file,'utf8')),score=parseText(await readFile('dist/samples/'+wood.file,'utf8'));
  assert.equal(score.length,original.length,'木琴版の末尾休符も含む長さ：'+wood.id);assert.equal(score.stepMs,original.stepMs,'木琴版の速度：'+wood.id);
  assert.deepEqual(score.metadata,{...original.metadata,arranged_for:'xylophone32'},'版を同じ曲として表示し拍単位を保つ：'+wood.id);
  const counts=new Map();for(const n of score.notes){assert(xylophone32.allowed.has(n.midi),'木琴の対応音：'+wood.id);counts.set(n.step,(counts.get(n.step)??0)+1);}assert(Math.max(...counts.values())<=2,'木琴は同時2音まで：'+wood.id);
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
  assert(catalog.samples.some(s=>s.id===id+'-piano-61'),'61鍵版の一覧');assert.equal(score.length,original.length);assert.equal(score.stepMs,original.stepMs);assert.deepEqual(score.metadata,{...original.metadata,arranged_for:'piano61'});
  const counts=new Map();for(const n of score.notes){assert(piano61.allowed.has(n.midi));counts.set(n.step,(counts.get(n.step)??0)+1);}assert(Math.max(...counts.values())<=4);
  const expected=id==='military-march'?[[112,'F#6'],[114,'G6'],[116,'A6'],[119,'B6'],[120,'G6']]:id==='sugar-plum-fairy'?[[2,'G6'],[34,'G5'],[40,'C6'],[44,'G6'],[48,'F6'],[64,'E6']]:[[62,'D4'],[63,'C#4'],[64,'D4'],[72,'D3'],[72,'C#4'],[92,'G4'],[94,'E4'],[96,'F#4']];
  for(const [step,pitch]of expected)assert(score.notes.some(n=>n.step===step&&n.midi===noteNumber(pitch)),'61鍵版で音域制約の変更を復元：'+id+' step'+step);
  if(id==='sugar-plum-fairy')assert(!score.notes.some(n=>n.step===2&&n.midi===noteNumber('G5')),'変更前の旋律を同時に残さない');
}
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
