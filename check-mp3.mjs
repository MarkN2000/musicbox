import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createContext,runInContext,runInNewContext} from 'node:vm';
import {definitionNotes,validateNote,keyOf,MAX_STEPS} from './dist/core.js';
const ALLOWED=definitionNotes(JSON.parse(await readFile('dist/instruments.json','utf8')).find(item=>item.id==='musicbox-30'));

const translations=JSON.parse(await readFile('dist/locales/ja.json','utf8'));
const t=(key,values={})=>(translations[key]??key).replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??name));
const app=await readFile('dist/app.js','utf8'),worker=await readFile('dist/mp3-worker.js','utf8'),library=await readFile('dist/vendor/lame-1.2.1.js','utf8');
const revision=createHash('sha256').update(worker.replace(/\r\n/g,'\n')).digest('hex').slice(0,16);
assert(app.includes(`mp3-worker.js?v=${revision}`),'MP3処理の更新識別子が内容と一致しません');
const oggWorker=await readFile('dist/ogg-worker.js','utf8'),oggRevision=createHash('sha256').update(oggWorker.replace(/\r\n/g,'\n')).digest('hex').slice(0,16);
assert(app.includes(`ogg-worker.js?v=${oggRevision}`),'OGG処理の更新識別子が内容と一致しません');
for(const [file,hash]of [['wasm-media-encoder-0.7.0.js','dd4e17abf5377dfecc726d6ec5e7b72dab01cf3522974278e5347f4e68480fb3'],['ogg-vorbis-0.7.0.wasm','cd1f50349e58e650e33e3f0b850a785ed612c4abaa4756e520e50b2583cf07ed']])assert.equal(createHash('sha256').update(await readFile('dist/vendor/'+file)).digest('hex'),hash,'配布元のVorbis変換ライブラリを変更しない');
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
runtime.self.onmessage({data:{type:'encode',left:new Float32Array(1),right:new Float32Array(2)}});assert.match(reply.error,/不正/);

// 実際のWebAssemblyでVorbisを変換し、全OggページのCRC・連番・終端と音声ヘッダーを確認する。
const oggLibrary=await readFile('dist/vendor/wasm-media-encoder-0.7.0.js','utf8'),wasm=await readFile('dist/vendor/ogg-vorbis-0.7.0.wasm');
const oggRuntime=createContext({self:{postMessage:data=>{reply=data;}},Blob,Float32Array,WebAssembly,console,
  fetch:async path=>{assert.equal(path,'vendor/ogg-vorbis-0.7.0.wasm');return {ok:true,arrayBuffer:async()=>wasm.buffer.slice(wasm.byteOffset,wasm.byteOffset+wasm.byteLength)};}});
oggRuntime.importScripts=path=>{assert.equal(path,'vendor/wasm-media-encoder-0.7.0.js');runInContext(oggLibrary,oggRuntime);};
runInContext(oggWorker,oggRuntime);
const oggRequest=async data=>{reply=null;await oggRuntime.self.onmessage({data});assert(reply&&!reply.error,reply?.error);return reply;};
await oggRequest({type:'init'});
for(const [start,end]of [[0,13001],[13001,samples]])await oggRequest({type:'encode',left:left.slice(start,end),right:right.slice(start,end)});
const ogg=(await oggRequest({type:'finish'})).blob,oggBytes=Buffer.from(await ogg.arrayBuffer());
assert.equal(ogg.type,'audio/ogg');let pages=0,lastGranule,serial;
for(let offset=0;offset<oggBytes.length;pages++){
  assert.equal(oggBytes.toString('ascii',offset,offset+4),'OggS');assert.equal(oggBytes[offset+4],0);
  const segments=oggBytes[offset+26],header=27+segments,body=oggBytes.subarray(offset+27,offset+header).reduce((sum,value)=>sum+value,0),end=offset+header+body;
  assert(end<=oggBytes.length,'Oggページが欠けている');assert.equal(oggBytes.readUInt32LE(offset+18),pages);
  if(!pages){serial=oggBytes.readUInt32LE(offset+14);assert.equal(oggBytes[offset+5]&2,2);assert.equal(oggBytes[offset+header],1);assert.equal(oggBytes.toString('ascii',offset+header+1,offset+header+7),'vorbis');assert.equal(oggBytes[offset+header+11],2);assert.equal(oggBytes.readUInt32LE(offset+header+12),44100);}
  assert.equal(oggBytes.readUInt32LE(offset+14),serial);lastGranule=oggBytes.readBigInt64LE(offset+6);
  let crc=0;
  for(let i=offset;i<end;i++){crc^=(i>=offset+22&&i<offset+26?0:oggBytes[i])<<24;for(let bit=0;bit<8;bit++)crc=(crc<<1)^((crc&0x80000000)?0x04c11db7:0);}
  assert.equal(crc>>>0,oggBytes.readUInt32LE(offset+22),'再利用される出力領域をコピーし、Oggページの破損を防ぐ');
  if(end===oggBytes.length)assert.equal(oggBytes[offset+5]&4,4,'曲末');offset=end;
}
assert(pages>=3);assert.equal(lastGranule,44100n,'分割しても1秒分の全音声を保持');
for(const invalid of [{left:new Float32Array(1),right:new Float32Array(2)},{left:new Float32Array([NaN]),right:new Float32Array(1)},{left:new Float32Array(44100*30+1),right:new Float32Array(44100*30+1)}]){
  await oggRuntime.self.onmessage({data:{type:'encode',...invalid}});assert.match(reply.error,/不正/);
}
const failedFetch=createContext({self:{postMessage:data=>{reply=data;}},Blob,Float32Array,WebAssembly,fetch:async()=>({ok:false}),importScripts(){}});
runInContext(oggWorker,failedFetch);await failedFetch.self.onmessage({data:{type:'init'}});assert.match(reply.error,/読み込めません/);

function scenario({format='mp3',score=[{step:1,midi:72},{step:1,midi:76},{step:1,midi:76},{step:2,midi:66}],size=4,bpm=120,subdivision=4,duration=1,load=async()=>{},render=null,workerError=false,waiting=null}={}){
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
    constructor(url){assert.equal(url,`${format}-worker.js?v=${format==='mp3'?revision:oggRevision}`);this.calls=[];workers.push(this);}
    postMessage(data,transfer){
      this.calls.push(data);
      if(data.type==='encode'){assert.equal(data.left.length,data.right.length);assert(data.left.length<=44100*30);assert.equal(transfer.length,2);assert.equal(transfer[0],data.left.buffer);assert.equal(transfer[1],data.right.buffer);}
      if(waiting?.(data.type))return;
      queueMicrotask(()=>{if(this.terminated)return;if(workerError)this.onerror();else this.onmessage({data:data.type==='finish'?{blob:new Blob([format],{type:format==='mp3'?'audio/mpeg':'audio/ogg'})}:{}});});
    }
    terminate(){this.terminated=true;}
  }
  const buffers=new Map([...ALLOWED].map(midi=>[midi,{midi,duration}]));
  const api=runInNewContext(`
    let notes=initialScore,length=initialSize,exactStepMs=Math.round(60000/initialBpm/initialSubdivision),soundset={id:'original'};
    ${app.split('\n').find(line=>line.startsWith('function downloadName('))}
    ${app.split('\n').find(line=>line.startsWith('function stepInterval(){'))}
    ${app.split('\n').find(line=>line.startsWith('function timingFromInputs('))}
    ${app.slice(app.indexOf('let audioExportJob=null;'),app.indexOf('const saveMenu='))}
    ({save:()=>saveAudio(format),setScore:(score,size)=>{notes=score;length=size;},state:()=>JSON.stringify({notes,length})});
  `,{$,format,initialScore:score,initialSize:size,initialBpm:bpm,initialSubdivision:subdivision,t,window:{OfflineAudioContext:OfflineAudio,Worker},ALLOWED,validateNote,keyOf,MAX_STEPS,audioBuffers:buffers,loadTone:async midi=>{await load();return buffers.get(midi);},showError:(message='')=>messages.push(message),URL:{createObjectURL:blob=>{downloads.push({blob});return 'blob:mp3';},revokeObjectURL(){}},document:{createElement:()=>({click(){downloads.at(-1).name=this.download;}})},setTimeout(){}});
  return {...api,$,messages,contexts,workers,downloads};
}
const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
for(const format of ['mp3','ogg']){
const make=options=>scenario({...options,format});
let test=make();const original=test.state();await test.save();assert.equal(test.downloads.length,1,JSON.stringify(test.messages));
assert.equal(test.state(),original,'保存で楽譜を変えない');assert.equal(test.downloads[0].name,`私の曲_.${format}`);assert.equal(test.downloads[0].blob.type,format==='mp3'?'audio/mpeg':'audio/ogg');assert(!test.messages.some(Boolean),'音声保存の通常通知は表示しない');
assert.equal(test.contexts[0].frames,Math.ceil(1.125*44100),'最後の音の余韻を残す');assert.equal(test.contexts[0].channels,2);assert.equal(test.contexts[0].rate,44100);
assert.deepEqual(test.contexts[0].voices.map(v=>[v.buffer.midi,v.time,v.offset,v.gain.value]),[[72,.125,0,.5/Math.sqrt(2)],[76,.125,0,.5/Math.sqrt(2)]],'和音・重複統合・先頭休符・音量');
assert.equal(test.$('save')['aria-busy'],'false');assert(test.workers[0].terminated);

test=make({score:[{step:29,midi:72},{step:30,midi:76}],size:31,bpm:60,subdivision:1,duration:3});await test.save();
assert.deepEqual(test.contexts.map(c=>c.frames),[44100*30,44100*3],'30秒ずつ処理し最後の余韻を残す');
assert.deepEqual(test.contexts[1].voices.map(v=>[v.buffer.midi,v.time,v.offset]),[[72,0,1],[76,0,0]],'分割位置をまたぐ余韻と境界の発音');
test=make({score:[],size:33,bpm:60,subdivision:1});await test.save();assert.deepEqual(test.contexts.map(c=>c.frames),[44100*30,44100*3]);assert(test.contexts.every(c=>!c.voices.length),'全休符');
test=make({score:[{step:1,midi:72}],size:30,bpm:116,subdivision:3});await test.save();assert.equal(test.contexts[0].frames,Math.ceil(30*.172*44100),'三連符の丸めた間隔と末尾休符');

let finish;test=make({load:()=>new Promise(resolve=>{finish=resolve;}),score:[{step:1,midi:72}]});const pending=test.save();assert.equal(test.$('save')['aria-label'],`${format.toUpperCase()}保存を中止`);
test.$('scoreTitle').value='後の曲';test.$('bpm').value=60;test.setScore([],20);finish();await pending;
assert.equal(test.downloads[0].name,`私の曲_.${format}`);assert.equal(test.contexts[0].voices[0].time,.125,'開始時の設定を保持');assert.equal(test.state(),JSON.stringify({notes:[],length:20}),'作成中の編集を保持');

for(const phase of ['load','render','encode']){
  finish=null;const gate=()=>new Promise(resolve=>{finish=resolve;});
  test=make({score:[{step:0,midi:72}],load:phase==='load'?gate:undefined,render:phase==='render'?gate:null,waiting:type=>phase==='encode'&&type==='encode'});
  const pending=test.save();await settle();const retained=test.state();await test.save();finish?.();await pending;
  assert.equal(test.downloads.length,0,`${phase}中止後は保存しない`);assert.equal(test.state(),retained);assert.equal(test.$('save')['aria-busy'],'false');assert(!test.messages.some(Boolean),'中止の通知は表示しない');assert(test.workers.every(w=>w.terminated));
}
const releases=[];test=make({score:[{step:0,midi:72}],load:()=>new Promise(resolve=>releases.push(resolve))});
const cancelled=test.save();await test.save();const retry=test.save();releases[0]();await cancelled;
assert.equal(test.$('save')['aria-busy'],'true','古い処理の終了で新しい保存ボタンを戻さない');assert.equal(test.downloads.length,0);
releases[1]();await retry;assert.equal(test.downloads.length,1,'中止後も保存できる');
for(const settings of [{bpm:''},{bpm:0},{subdivision:0},{size:0},{size:MAX_STEPS+1},{score:[{step:4,midi:72}]},{score:[{step:1,midi:128}]},{load:async()=>{throw new Error('音源エラー');}},{render:async()=>{throw new Error('生成エラー');}},{workerError:true}]){
  test=make(settings);const retained=test.state();await test.save();assert.equal(test.downloads.length,0);assert(test.messages.at(-1));assert.equal(test.state(),retained);assert.equal(test.$('save')['aria-busy'],'false');
}
}
// メニューのキー移動、無効なTXTのスキップ、中止と画面端の位置を実際のUI処理で確認する。
const menuDocument={activeElement:null},menuWindow={innerWidth:320,innerHeight:200,addEventListener(){}},menuControls=new Map();let cancelled=0,prevented=0;
const control=id=>{
  if(!menuControls.has(id))menuControls.set(id,{id,style:{},attributes:{},offsetWidth:170,offsetHeight:162,
    setAttribute(name,value){this.attributes[name]=value;},focus(){menuDocument.activeElement=this;},
    matches(){return Boolean(this.open);},contains(node){return this.items?.includes(node);},querySelectorAll(){return this.items.filter(item=>!item.disabled);},
    getBoundingClientRect:()=>({top:32,bottom:70,right:312}),addEventListener(name,callback){this[name]=callback;},
    showPopover(){this.open=true;this.toggle({newState:'open'});},hidePopover(){this.open=false;this.toggle({newState:'closed'});}});
  return menuControls.get(id);
};
control('saveMenu').items=['export','exportMidi','exportMp3','exportOgg'].map(control);control('export').disabled=true;
const menuApi=runInNewContext(`let audioExportJob=null;function cancelAudioExport(){cancel();audioExportJob=null;}
${app.slice(app.indexOf('const saveMenu='))}
({busy:()=>{audioExportJob={};}});`,{$:control,window:menuWindow,document:menuDocument,cancel:()=>cancelled++});
const key=(target,key)=>control(target).onkeydown({key,preventDefault(){prevented++;}});
key('save','ArrowDown');assert.equal(menuDocument.activeElement.id,'exportMidi');assert.equal(control('save').attributes['aria-expanded'],'true');
key('saveMenu','ArrowUp');assert.equal(menuDocument.activeElement.id,'exportOgg');key('saveMenu','Home');assert.equal(menuDocument.activeElement.id,'exportMidi');key('saveMenu','End');assert.equal(menuDocument.activeElement.id,'exportOgg');
assert.equal(control('saveMenu').style.left,'142px');assert.equal(control('saveMenu').style.top,'8px','下に収まらないメニューも画面内に収める');
control('saveMenu').onclick({target:{closest:()=>control('exportOgg')}});assert.equal(control('save').attributes['aria-expanded'],'false');assert.equal(menuDocument.activeElement.id,'save');
key('save','ArrowUp');assert.equal(menuDocument.activeElement.id,'exportOgg');
key('save','ArrowUp');control('saveMenu').hidePopover();control('saveMenu').showPopover();assert.equal(menuDocument.activeElement.id,'exportMidi','開いている間の上矢印を次回のクリックへ持ち越さない');
menuDocument.activeElement=control('bpm');control('saveMenu').hidePopover();assert.equal(menuDocument.activeElement.id,'bpm','外側の操作先からフォーカスを奪わない');
key('save','ArrowDown');key('saveMenu','Tab');assert(!control('saveMenu').open);
menuApi.busy();control('save').onclick({preventDefault(){prevented++;}});assert.equal(cancelled,1);assert(!control('saveMenu').open);assert(prevented>0);
process.stdout.write('確認成功: 保存メニュー・MP3・Ogg Vorbis形式・44.1kHzステレオ・発音位置と音量・休符と余韻・30秒分割・編集の保持・中止・エラー\n');
