import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {noteName,noteNumber,serialize,parseText,convertMidi,convertScore,suggestTranspositions,validateMidiHeader,rhythmMetadata,validateDefinitions,MAX_STEPS} from './dist/core.js';
import {catalogData} from './build-catalog.mjs';
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const profiles=await json('dist/instruments.json'),sounds=await json('dist/audio/soundsets.json'),definitions=validateDefinitions(profiles,sounds);
const allowed=definitions.instruments.find(item=>item.id==='musicbox-30').allowed;
assert.equal(definitions.instruments[0].allowed.size,30);assert.equal(definitions.instruments[1].allowed.size,88);
for(let midi=0;midi<=127;midi++)assert.equal(noteNumber(noteName(midi)),midi);
const full=[{step:0,midi:0},{step:0,midi:127},{step:1,midi:66},{step:1,midi:66}],text=serialize(full,4,172,{title:'曲,%2C=値',extra:'100%',steps_per_quarter:'3',time_signature:'6/8'}),parsed=parseText(text);
assert.deepEqual(parsed.notes,[full[0],full[1],full[2]]);assert.equal(parsed.length,4);assert.equal(parsed.stepMs,172);assert.equal(parsed.metadata.title,'曲,%2C=値');assert.equal(parsed.metadata.extra,'100%');assert.equal(rhythmMetadata(parsed.metadata).beatsPerBar,3);
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
for(const entry of catalog.samples){const score=parseText(await readFile('dist/samples/'+entry.file,'utf8'));assert(!('pickup_steps' in score.metadata),'サンプルに廃止した弱起のメタデータを残さない');assert.deepEqual(parseText(serialize(score.notes,score.length,score.stepMs,score.metadata)),score);}
for(const sound of sounds.filter(item=>item.kind==='samples')){const hash=createHash('sha256');for(const file of Object.values(sound.files)){const bytes=await readFile('dist/'+sound.base+file);assert(bytes.length);if(file.endsWith('.ogg'))assert.equal(bytes.subarray(0,4).toString(),'OggS');hash.update(bytes);}assert.equal(hash.digest('hex').slice(0,16),sound.revision,'音源を変更したらnpm run buildで識別子を更新してください');}
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
await import('./check-mp3.mjs');
console.log('確認成功：stepscore・サンプルの再入出力・楽器と音源・曲目一覧・翻訳・WorkerのTXT/MIDI変換');
