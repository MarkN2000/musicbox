import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createContext,runInContext,runInNewContext} from 'node:vm';
import {ALLOWED,validateNote,keyOf,MAX_STEPS} from './dist/core.js';

const app=await readFile('dist/app.js','utf8'),worker=await readFile('dist/mp3-worker.js','utf8'),library=await readFile('dist/vendor/lame-1.2.1.js','utf8');
const revision=createHash('sha256').update(worker.replace(/\r\n/g,'\n')).digest('hex').slice(0,16);
assert(app.includes(`mp3-worker.js?v=${revision}`),'MP3処理の更新識別子が内容と一致しません');
assert.equal(createHash('sha512').update(await readFile('dist/vendor/lamejs-1.2.1-source.tgz')).digest('base64'),'s7bxvjvYthw6oPLCm5pFxvA84wUROODB8jEO2+CE1adhKgrIvVOlmMgY8zyugxGrvRaDHNJanOiS21/emty6dQ==','元のソース配布物を変更しない');

// 実際のエンコーダーで左右の異なる音を変換し、全MP3フレームと分割後の長さを確認する。
let reply;
const runtime=createContext({self:{postMessage:data=>{reply=data;}},Blob,Float32Array,Int16Array,console});
runtime.importScripts=path=>{assert.equal(path,'vendor/lame-1.2.1.js');runInContext(library,runtime);};
runInContext(worker,runtime);
const request=data=>{runtime.self.onmessage({data});assert(!reply.error,reply.error);return reply;};
request({type:'init'});
const samples=44100,left=Float32Array.from({length:samples},(_,i)=>.3*Math.sin(i*2*Math.PI*220/44100)),right=Float32Array.from({length:samples},(_,i)=>.2*Math.sin(i*2*Math.PI*660/44100));
for(const [start,end]of [[0,13001],[13001,samples]])request({type:'encode',left:left.slice(start,end),right:right.slice(start,end)});
const mp3=request({type:'finish'}).blob,bytes=Buffer.from(await mp3.arrayBuffer());
assert.equal(mp3.type,'audio/mpeg');let frames=0;
for(let offset=0;offset<bytes.length;frames++){
  assert.equal(bytes[offset],255);assert.equal(bytes[offset+1]&254,250,'MPEG-1 Layer III');
  assert.equal(bytes[offset+2]>>4,9,'128kbps');assert.equal((bytes[offset+2]>>2)&3,0,'44.1kHz');assert.notEqual(bytes[offset+3]>>6,3,'ステレオ');
  offset+=Math.floor(144*128000/44100)+((bytes[offset+2]>>1)&1);assert(offset<=bytes.length,'MP3フレームが欠けている');
}
assert(frames*1152/44100>=1&&frames*1152/44100<1.06,'分割で音声を落としたり無音を挿入しない');
await mkdir('.sites-runtime',{recursive:true});await writeFile('.sites-runtime/mp3-encoder-check.mp3',bytes);
runtime.self.onmessage({data:{type:'encode',left:new Float32Array(1),right:new Float32Array(2)}});assert.match(reply.error,/不正/);

function scenario({score=[{step:1,midi:72},{step:1,midi:76},{step:1,midi:76},{step:2,midi:66}],size=4,bpm=120,subdivision=4,duration=1,load=async()=>{},render=null,workerError=false,waiting=null}={}){
  const elements=new Map(),messages=[],contexts=[],workers=[],downloads=[];
  const $=id=>{if(!elements.has(id))elements.set(id,{value:'',setAttribute(name,value){this[name]=value;}});return elements.get(id);};
  $('bpm').value=bpm;$('subdivision').value=subdivision;$('scoreTitle').value='  私の曲?  ';
  class OfflineAudio{
    constructor(channels,frames,rate){this.channels=channels;this.frames=frames;this.rate=rate;this.voices=[];this.destination={};contexts.push(this);}
    createGain(){return {gain:{value:0},connect(){}};}
    createBufferSource(){const voice={connect(gain){this.gain=gain.gain;},start(time,offset){this.time=time;this.offset=offset;}};this.voices.push(voice);return voice;}
    async startRendering(){if(render)await render();return {getChannelData:()=>new Float32Array(this.frames)};}
  }
  class Worker{
    constructor(url){assert.equal(url,`mp3-worker.js?v=${revision}`);this.calls=[];workers.push(this);}
    postMessage(data,transfer){
      this.calls.push(data);
      if(data.type==='encode'){assert.equal(data.left.length,data.right.length);assert(data.left.length<=44100*30);assert.equal(transfer.length,2);assert.equal(transfer[0],data.left.buffer);assert.equal(transfer[1],data.right.buffer);}
      if(waiting?.(data.type))return;
      queueMicrotask(()=>{if(this.terminated)return;if(workerError)this.onerror();else this.onmessage({data:data.type==='finish'?{blob:new Blob(['MP3'],{type:'audio/mpeg'})}:{}});});
    }
    terminate(){this.terminated=true;}
  }
  const buffers=new Map([...ALLOWED].map(midi=>[midi,{midi,duration}]));
  const api=runInNewContext(`
    let notes=initialScore,length=initialSize;
    ${app.split('\n').find(line=>line.startsWith('function downloadName('))}
    ${app.split('\n').find(line=>line.startsWith('function stepInterval(){'))}
    ${app.slice(app.indexOf('let mp3Job=null;'))}
    ({save:()=>$('exportMp3').onclick(),setScore:(score,size)=>{notes=score;length=size;},state:()=>JSON.stringify({notes,length})});
  `,{$,initialScore:score,initialSize:size,window:{OfflineAudioContext:OfflineAudio,Worker},ALLOWED,validateNote,keyOf,MAX_STEPS,audioBuffers:buffers,loadTone:load,announce:(message,error)=>messages.push({message,error}),URL:{createObjectURL:blob=>{downloads.push({blob});return 'blob:mp3';},revokeObjectURL(){}},document:{createElement:()=>({click(){downloads.at(-1).name=this.download;}})},setTimeout(){}});
  return {...api,$,messages,contexts,workers,downloads};
}
const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
let test=scenario();const original=test.state();await test.save();assert.equal(test.downloads.length,1,JSON.stringify(test.messages));
assert.equal(test.state(),original,'保存で楽譜を変えない');assert.equal(test.downloads[0].name,'私の曲_.mp3');assert.equal(test.downloads[0].blob.type,'audio/mpeg');assert.match(test.messages.at(-1).message,/対応外の1音を省いて/);
assert.equal(test.contexts[0].frames,Math.ceil(1.125*44100),'最後の音の余韻を残す');assert.equal(test.contexts[0].channels,2);assert.equal(test.contexts[0].rate,44100);
assert.deepEqual(test.contexts[0].voices.map(v=>[v.buffer.midi,v.time,v.offset,v.gain.value]),[[72,.125,0,.5/Math.sqrt(2)],[76,.125,0,.5/Math.sqrt(2)]],'和音・重複統合・先頭休符・音量');
assert.equal(test.$('exportMp3')['aria-busy'],'false');assert(test.workers[0].terminated);

test=scenario({score:[{step:29,midi:72},{step:30,midi:76}],size:31,bpm:60,subdivision:1,duration:3});await test.save();
assert.deepEqual(test.contexts.map(c=>c.frames),[44100*30,44100*3],'30秒ずつ処理し最後の余韻を残す');
assert.deepEqual(test.contexts[1].voices.map(v=>[v.buffer.midi,v.time,v.offset]),[[72,0,1],[76,0,0]],'分割位置をまたぐ余韻と境界の発音');
test=scenario({score:[],size:33,bpm:60,subdivision:1});await test.save();assert.deepEqual(test.contexts.map(c=>c.frames),[44100*30,44100*3]);assert(test.contexts.every(c=>!c.voices.length),'全休符');
test=scenario({score:[{step:1,midi:72}],size:30,bpm:116,subdivision:3});await test.save();assert.equal(test.contexts[0].frames,Math.ceil(30*.172*44100),'三連符の丸めた間隔と末尾休符');

let finish;test=scenario({load:()=>new Promise(resolve=>{finish=resolve;}),score:[{step:1,midi:72}]});const pending=test.save();assert.equal(test.$('exportMp3')['aria-label'],'MP3保存を中止');
test.$('scoreTitle').value='後の曲';test.$('bpm').value=60;test.setScore([],20);finish();await pending;
assert.equal(test.downloads[0].name,'私の曲_.mp3');assert.equal(test.contexts[0].voices[0].time,.125,'開始時の設定を保持');assert.equal(test.state(),JSON.stringify({notes:[],length:20}),'作成中の編集を保持');

for(const phase of ['load','render','encode']){
  finish=null;const gate=()=>new Promise(resolve=>{finish=resolve;});
  test=scenario({score:[{step:0,midi:72}],load:phase==='load'?gate:undefined,render:phase==='render'?gate:null,waiting:type=>phase==='encode'&&type==='encode'});
  const pending=test.save();await settle();const retained=test.state();await test.save();finish?.();await pending;
  assert.equal(test.downloads.length,0,`${phase}中止後は保存しない`);assert.equal(test.state(),retained);assert.equal(test.$('exportMp3')['aria-busy'],'false');assert.match(test.messages.at(-1).message,/中止しました/);assert(test.workers.every(w=>w.terminated));
}
const releases=[];test=scenario({score:[{step:0,midi:72}],load:()=>new Promise(resolve=>releases.push(resolve))});
const cancelled=test.save();await test.save();const retry=test.save();releases[0]();await cancelled;
assert.equal(test.$('exportMp3')['aria-busy'],'true','古い処理の終了で新しい保存ボタンを戻さない');assert.equal(test.downloads.length,0);
releases[1]();await retry;assert.equal(test.downloads.length,1,'中止後も保存できる');
for(const settings of [{bpm:''},{bpm:301},{subdivision:5},{size:0},{size:MAX_STEPS+1},{score:[{step:4,midi:72}]},{score:[{step:1,midi:128}]},{load:async()=>{throw new Error('音源エラー');}},{render:async()=>{throw new Error('生成エラー');}},{workerError:true}]){
  test=scenario(settings);const retained=test.state();await test.save();assert.equal(test.downloads.length,0);assert(test.messages.at(-1).error);assert.equal(test.state(),retained);assert.equal(test.$('exportMp3')['aria-busy'],'false');
}
process.stdout.write('確認成功: MP3形式・44.1kHz/128kbpsステレオ・発音位置と音量・休符と余韻・30秒分割・編集の保持・中止・エラー\n');
