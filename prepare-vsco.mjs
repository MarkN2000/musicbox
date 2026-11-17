import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve,posix} from 'node:path';
import {noteName,noteNumber} from './dist/core.js';

const revision='6dd651d55dde97fd4028699be9d4481f26917891';
const vcsl='c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e';
const fashionbass='0703973b300a6bacb837602be9b588ab64732a72',growlybass='4f483268fc66b5a6d5781d421c0d11b8d08d3fc6';
const bigcat='6fd75fbfc1dbb3109bf26220ba1adea46188a18b',virtuosity='9f04cf9a734527edfbb0a4eee1f674e45bbf71bc',rusty='f07ce00df34a46b6b08375be56fe116cf15782bc',swirly='c40dafe0011cb2e54c0c220ff0fa308a11fc60f5';
const freepats={
  'spanish-classical-guitar':'6f4eb1b092acc88f5448cea1a0001bd07b971af8',
  'electric-guitar-FSBS-clean':'192cf0d9bf2c4ba6ead8e3524ba3f78818e4fe91',
  'synthesizer-percussion':'39bbabce8e0e10aa259d5d94fca329f668733185',
  'world-percussion':'e54eb2912a0d6d4444ab205d52f778e27da0fc96',
};
const pats=(repo,name)=>`freepats/${repo}/${freepats[repo]}/${name}`;
const celesta=[
  ['c4-hard-PB.wav',60,'3105863b4124f843a67baf870b82edb09850ec1f',9.10],
  ['e4-hard-PB.wav',64,'27493e447ac97393d3bb70bc800e603f1830e387',-5.14],
  ['g4-hard-PB.wav',68,'31cf8be2c8ad0c114aa8c555e51d2ab0b5d52025',-2.87],
  ['e5-hard-PB.wav',76,'3d5429c3e9fcc7cb75f5e5db92aa0e7cf4ff29b6',6.23],
  ['g5-hard-PB.wav',80,'463878c4cba279ec058c89aaf3f2bc944ee32d40',3.53],
  ['c6-hard-PB.wav',84,'22db3572327d5f44d82bbd9983b05c22b67816ae',3.76],
  ['e6-hard-PB.wav',88,'95287406975c5fd3b270953865ff794828367217',5.26],
  ['g6-soft-PB.wav',92,'0f53ec379a4c5d11b556a4651c262931922b5c3c',27.93],
  ['c7-hard-PB.wav',96,'fde653f46ce14300187cbab5d55e416b30fb0083',24.21],
  ['e7-hard-PB.wav',100,'98d15119269b81568d06d2eda948bdb1aefc11c2',40.64],
  ['g7-hard-PB.wav',104,'35abd14a082e323e9d09f0232c4e848b6cde5428',61.30],
];
const cache=resolve('.sites-runtime/vsco-import'),root=resolve('dist'),ffmpeg=process.env.FFMPEG??'ffmpeg';
// One velocity layer and one round robin keep this browser sample bank small.
const instruments=[
  ['piano','アップライトピアノ','Upright piano',0,['UprightPiano'],false],
  ['marimba','マリンバ','Marimba',12,['Marimba'],false],
  ['xylophone','木琴','Xylophone',13,['LegacyXylophone'],false],
  ['stamperadam-celesta','チェレスタ','Celesta',8,['StamperadamCelesta'],true],
  ['glockenspiel','グロッケン','Glockenspiel',9,['Glockenspiel'],false],
  ['tubular-bells','チューブラーベル','Tubular bells',14,['TubularBells'],false],
  ['vibraphone','ヴィブラフォン','Vibraphone',11,['VCSLVibraphone'],true],
  ['church-organ','パイプオルガン','Church organ',19,['OrganLoud'],true],
  ['violin','ヴァイオリン','Violin',40,['SViolinVib'],true],
  ['viola','ヴィオラ','Viola',41,['ViolaEnsSusVib'],true],
  ['cello','チェロ','Cello',42,[`sfzinstruments/karoryfer-bigcat.cello/${bigcat}/Programs/vc_arco_sus_map`],true],
  ['contrabass','コントラバス','Contrabass',43,['ContrabassSusNV'],true],
  ['tremolo-strings','トレモロ・ストリングス','Tremolo strings',44,['ContrabassTrem','CelloEnsTrem','ViolaEnsTrem','ViolinEnsTrem'],true],
  ['pizzicato-strings','ピチカート・ストリングス','Pizzicato strings',45,['ContrabassPizz','CelloEnsPizz','ViolaEnsPizz','ViolinEnsPizz'],false],
  ['harp','ハープ','Harp',46,['Harp'],false],
  ['timpani','ティンパニ','Timpani',47,['Timpani'],false],
  ['strings','ストリングス','Strings',48,['ContrabassSusVB','CelloEnsSusVib','ViolaEnsSusVib','ViolinEnsSusVib'],true],
  ['trumpet','トランペット','Trumpet',56,['TrumpetSus'],true],
  ['trombone','トロンボーン','Trombone',57,['TromboneSus'],true],
  ['tuba','チューバ','Tuba',58,['TubaSus'],true],
  ['muted-trumpet','弱音トランペット','Muted trumpet',59,['TrumpetStraightMuteSus'],true],
  ['french-horn','ホルン','French horn',60,['FHornSus'],true],
  ['oboe','オーボエ','Oboe',68,['OboeSusNV'],true],
  ['bassoon','ファゴット','Bassoon',70,['BassoonSus'],true],
  ['clarinet','クラリネット','Clarinet',71,['ClarinetSus'],true],
  ['piccolo','ピッコロ','Piccolo',72,['PiccoloSus'],true],
  ['flute','フルート','Flute',73,['FluteSusNV'],true],
  ['percussion','打楽器','Percussion',0,['GM-StylePerc'],false,true],
  ['xylophone-concert','44音木琴','44-note xylophone',13,['VCSLXylophone'],false],
  ['freepats-nylon-guitar','ナイロン弦ギター','Nylon-string guitar',24,[pats('spanish-classical-guitar','SpanishClassicalGuitar-20190618')],true],
  ['freepats-clean-guitar','クリーン・エレキギター','Clean electric guitar',27,[pats('electric-guitar-FSBS-clean','EGuitarFSBS-clean bridge 20260807')],true],
  ['freepats-finger-bass','指弾きベース','Fingered bass',33,[`sfzinstruments/karoryfer.fashionbass/${fashionbass}/fashionbass_clean`],true],
  ['freepats-picked-bass','ピック弾きベース','Picked bass',34,[`sfzinstruments/karoryfer.growlybass/${growlybass}/growlybass_clean`],true],
  ['freepats-drums','電子ドラム','Electronic drums',0,[pats('synthesizer-percussion','SynthesizerPercussion-20220718')],false,true],
  ['percussion-extra','追加打楽器','Additional percussion',0,['CC0Drums'],false,true],
];
// The upstream percussion layout contains effects in GM drum positions.
// Only matching GM1 instruments are exposed; unsupported keys stay silent.
const drumKeys=new Map([[36,36],[38,38],[49,49],[51,59],[54,54],[56,56],[59,59],[62,62],[63,63],[64,65],[73,72],[75,75],[76,76],[77,77],[80,80],[81,81]]);
const electronicDrumKeys=new Map([[35,48],[40,51],[42,52],[44,53],[46,54],[57,56],[41,57],[43,58],[45,59],[47,60],[48,61],[50,62],[39,63]]);
const ranges={piano:[21,108],marimba:[36,96],xylophone:[77,108],'freepats-finger-bass':[23,67],'freepats-picked-bass':[23,67],cello:[36,84]};
const extraDrums=[
  [37,`sfzinstruments/virtuosity_drums/${virtuosity}/Samples/oh/snare/oh_snare_crossstick_vl12.flac`],
  [52,`sfzinstruments/karoryfer.big-rusty-drums/${rusty}/Samples/china_18/cn/cl/cn_vl4_rr1.flac`],
  [53,`sfzinstruments/virtuosity_drums/${virtuosity}/Samples/oh/ride/oh_ride_bell_vl3_rr1.flac`],
  [55,`sfzinstruments/karoryfer.swirly-drums/${swirly}/Samples/splash/splash_vl9_rr1.wav`],
  [58,`sgossner/VCSL/${vcsl}/Idiophones/Struck Idiophones/Vibraslap/Legacy/vibraslap_rr1.wav`],
  [60,`sgossner/VCSL/${vcsl}/Membranophones/Struck Membranophones/Bongos/BongoH_Hit1_v3_rr1_Mid.wav`],
  [61,`sgossner/VCSL/${vcsl}/Membranophones/Struck Membranophones/Bongos/BongoL_Hit1_v2_rr1_Mid.wav`],
  [65,`sfzinstruments/virtuosity_drums/${virtuosity}/Samples/perc/oh/timbales/timb13_vl4_rr1.wav`],
  [66,`sfzinstruments/virtuosity_drums/${virtuosity}/Samples/perc/oh/timbales/timb14_vl3_rr1.wav`],
  [67,`sgossner/VCSL/${vcsl}/Idiophones/Struck Idiophones/Agogo Bells/Agogo_High_v2_rr1_Mid.wav`],
  [68,`sgossner/VCSL/${vcsl}/Idiophones/Struck Idiophones/Agogo Bells/Agogo_Low_v2_rr1_Mid.wav`],
  [69,`sgossner/VCSL/${vcsl}/Idiophones/Struck Idiophones/Cabasa/Cabasa1_Rub_v2_rr1_Mid.wav`],
  [70,`freepats/world-percussion/${freepats['world-percussion']}/samples/Maracas/01_01.flac`],
  [71,`sgossner/VCSL/${vcsl}/Aerophones/Edge-blown Aerophones/Ball Whistle/Main_BallWhistle_Short-001.wav`],
  [72,`sgossner/VCSL/${vcsl}/Aerophones/Edge-blown Aerophones/Ball Whistle/Main_BallWhistle_Long-001.wav`],
  [74,`sgossner/VCSL/${vcsl}/Idiophones/Struck Idiophones/Guiro/Guiro_Slow_rr2_Mid.wav`],
  [78,`sfzinstruments/virtuosity_drums/${virtuosity}/Samples/perc/oh/cuica/Long_p7_Main_vl1_rr1.wav`],
  [79,`sfzinstruments/virtuosity_drums/${virtuosity}/Samples/perc/oh/cuica/Long_p2_Main_vl1_rr1.wav`],
];
await mkdir(cache,{recursive:true});
async function download(path,sha){
  const file=resolve(cache,path);let data;
  try{data=await readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!data){
    const remote=/^(?:freepats|sgossner|sfzinstruments)\//.test(path)?path:`sgossner/VSCO-2-CE/${revision}/${path}`;
    const url=path.startsWith('stamperadam/')?'https://archive.org/download/virtual-playing-orchestra-3-2-wave-files/Virtual-Playing-Orchestra3-2-wave-files.zip/'+encodeURIComponent('Virtual-Playing-Orchestra3/libs/'+path):`https://raw.githubusercontent.com/${remote.split('/').map(encodeURIComponent).join('/')}`;
    const response=await fetch(url);
    if(!response.ok)throw Error(`${path}: HTTP ${response.status}`);
    data=Buffer.from(await response.arrayBuffer());await mkdir(resolve(file,'..'),{recursive:true});await writeFile(file,data);
  }
  if(sha&&createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex')!==sha)throw Error(`Source hash mismatch: ${path}`);
  return data;
}
let tree;
try{tree=JSON.parse(await readFile(resolve(cache,'tree.json'),'utf8'));}
catch(e){if(e.code!=='ENOENT')throw e;const response=await fetch(`https://api.github.com/repos/sgossner/VSCO-2-CE/git/trees/${revision}?recursive=1`);if(!response.ok)throw Error(`Source tree: HTTP ${response.status}`);tree=await response.json();await writeFile(resolve(cache,'tree.json'),JSON.stringify(tree));}
if(tree.sha!==revision||tree.truncated)throw Error('Unexpected VSCO source revision');
const files=new Map(tree.tree.filter(f=>f.type==='blob').map(f=>[f.path.toLowerCase(),f]));
for(const [name,,sha] of celesta){const path='stamperadam/samples/celesta/'+name;files.set(path.toLowerCase(),{path,sha});}
await download('stamperadam/samples/celesta/_readme_and_license.txt','354977b32eb1e602a904d5bbf78a120204918c43');
for(const [repo,sha] of Object.entries({...Object.fromEntries(Object.entries(freepats).map(([repo,sha])=>['freepats/'+repo,sha])),'sgossner/VCSL':vcsl,'sfzinstruments/karoryfer.fashionbass':fashionbass,'sfzinstruments/karoryfer.growlybass':growlybass,'sfzinstruments/karoryfer-bigcat.cello':bigcat,'sfzinstruments/virtuosity_drums':virtuosity,'sfzinstruments/karoryfer.big-rusty-drums':rusty,'sfzinstruments/karoryfer.swirly-drums':swirly})){
  const file=resolve(cache,repo.replace('/','-')+'-tree.json');let tree;
  try{tree=JSON.parse(await readFile(file,'utf8'));}
  catch(e){if(e.code!=='ENOENT')throw e;const response=await fetch(`https://api.github.com/repos/${repo}/git/trees/${sha}?recursive=1`);if(!response.ok)throw Error(`${repo}: HTTP ${response.status}`);tree=await response.json();await writeFile(file,JSON.stringify(tree));}
  if(tree.sha!==sha||tree.truncated)throw Error(`Unexpected FreePats source revision: ${repo}`);
  for(const item of tree.tree.filter(f=>f.type==='blob')){const f={...item,path:`${repo}/${sha}/${item.path}`};files.set(f.path.toLowerCase(),f);}
  const license=tree.tree.find(f=>/^LICENSE(?:\.txt)?$/i.test(f.path));
  if(license.sha!=='0e259d42c996742e9e3cba14c677129b2c1b6311')throw Error(`Unexpected CC0 license: ${repo}`);
  await download(`${repo}/${sha}/${license.path}`,license.sha);
}
const sourceFile=path=>{const file=files.get(posix.normalize(path.replaceAll('\\','/')).toLowerCase());if(!file)throw Error(`Source file missing: ${path}`);return file;};
const opcodes=text=>Object.fromEntries([...text.matchAll(/([a-z][a-z_0-9]*)\s*=\s*(.*?)(?=\s+[a-z][a-z_0-9]*\s*=|\s*<|$)/gs)].map(m=>[m[1],m[2].trim()]));
const definitions=new Map();
for(const name of new Set(instruments.flatMap(i=>i[4]))){
  if(name==='UprightPiano'||name==='LegacyXylophone'){
    const piano=name==='UprightPiano';
    const keys=piano?Array.from({length:23},(_,i)=>[String(i*2).padStart(3,'0'),Math.min(108,21+i*4),i===22?60:0]):[['G4',79,13.95],['C5',84,15.31],['G5',91,16.16],['C6',96,16.69],['G6',103,20.21],['C7',108,15.73]];
    definitions.set(name,keys.map(([note,center,cents],i)=>{
      const wav=sourceFile(piano?`Keys/Upright Piano/Player_dyn2_rr1_${note}.wav`:`Percussion/Xylo/Xylo_Medium_${note}_ff_01_far.wav`);
      return {file:wav.path,sha:wav.sha,center,cents,target:10**(-3/20),lo:i?Math.floor((keys[i-1][1]+center)/2)+1:piano?21:77,hi:i<keys.length-1?Math.floor((center+keys[i+1][1])/2):108,release:0};
    }));continue;
  }
  if(name==='CC0Drums'){
    definitions.set(name,extraDrums.map(([midi,path])=>{const file=sourceFile(path);return {file:file.path,sha:file.sha,lo:midi,hi:midi,center:midi,release:0};}));continue;
  }
  if(name==='StamperadamCelesta'){
    definitions.set(name,celesta.map(([note,center,sha,cents],i)=>({file:'stamperadam/samples/celesta/'+note,sha,center,cents,lo:i?Math.floor((celesta[i-1][1]+center)/2)+1:center,hi:i<celesta.length-1?Math.floor((center+celesta[i+1][1])/2):center,release:.15})));continue;
  }
  if(name==='VCSLXylophone'||name==='VCSLVibraphone'){
    const xylophone=name==='VCSLXylophone';
    const keys=xylophone?[['G3',67,13.22],['C4',72,12],['G4',79,13.95],['C5',84,15.31],['G5',91,16.16],['C6',96,16.69],['G6',103,20.21],['C7',108,15.73]]:['F2','A2','C3','E3','G3','B3','D4','F4','A4','C5','E5'].map(note=>[note,noteNumber(note)+12,0]);
    definitions.set(name,keys.map(([note,center,cents],i)=>{
      const wav=sourceFile(`sgossner/VCSL/${vcsl}/Idiophones/Struck Idiophones/`+(xylophone?`Xylophone/Medium Mallets/Xylo_Medium_${note}_ff_01_far.wav`:`Vibraphone/Soft Mallets/Vibes_soft_${note}_v2_rr1_Main.wav`));
      return {file:wav.path,sha:wav.sha,lo:i?Math.floor((keys[i-1][1]+center)/2)+1:xylophone?65:center,hi:i<keys.length-1?Math.floor((center+keys[i+1][1])/2):xylophone?108:center,center,cents,release:xylophone?0:.15};
    }));continue;
  }
  const file=sourceFile(name+'.sfz'),text=(await download(file.path,file.sha)).toString().replace(/\/\/[^\n]*/g,'');
  let global={},group={},base=file.path.slice(0,file.path.lastIndexOf('/')+1);const regions=[];
  for(const [,kind,body] of text.matchAll(/<(control|global|group|region)>\s*([^<]*)/g)){
    const values=opcodes(body);
    if(kind==='control')base=values.default_path.replaceAll('\\','/');
    else if(kind==='global')global=values;
    else if(kind==='group')group=values;
    else{
      const r={...global,...group,...values};
      if(/karoryfer\.(?:fashionbass|growlybass)\//.test(name)&&!/^(?:notes|sustain)[\\/]/.test(r.sample))continue;
      if(name.includes('karoryfer-bigcat.cello/')&&!/^\.\.[\\/]Samples[\\/]sus[\\/]/.test(r.sample))continue;
      if(Number(r.lovel??0)>90||Number(r.hivel??127)<90||Number(r.seq_position??1)!==1||Number(r.lorand??0)>.125||Number(r.hirand??1)<=.125)continue;
      if(Number(r.transpose??0)||Number(r.tune??0))throw Error(`Unexpected source tuning: ${name}`);
      const wav=sourceFile(base+r.sample);
      // Glockenspiel and piccolo mappings use written pitches, an octave below the recordings.
      const octave=['Glockenspiel','PiccoloSus'].includes(name)||name.includes('karoryfer-bigcat.cello/')?12:name.includes('karoryfer.growlybass/')?-12:0;
      regions.push({file:wav.path,sha:wav.sha,lo:name==='Marimba'&&Number(r.lokey)===41?36:Number(r.lokey??r.key)+octave,hi:Number(r.hikey??r.key)+octave,center:Number(r.pitch_keycenter??r.key??60)+octave,release:Number(r.ampeg_release??.2),...(name==='Marimba'?{target:10**(-3/20)}:{})});
    }
  }
  definitions.set(name,regions);
}
const allJobs=instruments.map(([id,ja,en,program,names,sustain,percussion=false])=>{
  const notes=[];
  const [low,high]=ranges[id]??[21,108];
  for(let midi=low;midi<=high;midi++){
    const key=percussion&&id!=='percussion-extra'?(id.startsWith('freepats-')?electronicDrumKeys:drumKeys).get(midi):midi;if(key===undefined)continue;
    const layers=names.flatMap(name=>{const matches=definitions.get(name).filter(r=>key>=r.lo&&key<=r.hi);if(matches.length>1)throw Error(`Ambiguous region: ${name} ${midi}`);return matches;});
    if(layers.length)notes.push({midi,layers});
  }
  return {id:/^(?:freepats|stamperadam)-/.test(id)?id:'vsco-'+id,name:{ja,en},program,names,sustain,percussion,notes};
});
const only=new Set((process.argv.find(arg=>arg.startsWith('--only='))?.slice(7)??'').split(',').filter(Boolean));
for(const id of only)if(!allJobs.some(j=>j.id===id))throw Error(`Unknown instrument: ${id}`);
if(allJobs.some(j=>j.percussion&&only.has(j.id)))for(const job of allJobs.filter(j=>j.percussion))only.add(job.id);
const jobs=allJobs.filter(j=>!only.size||only.has(j.id));
const sources=new Map(jobs.flatMap(j=>j.notes.flatMap(n=>n.layers.map(r=>[r.file,r]))));
let completed=0;const pending=[...sources.values()];
await Promise.all(Array.from({length:6},async()=>{while(pending.length){const r=pending.shift();await download(r.file,r.sha);if(++completed%25===0)console.log(`Downloaded ${completed}/${sources.size}`);}}));
await writeFile(resolve(cache,'plan.json'),JSON.stringify({revision,jobs:allJobs},null,2)+'\n');
console.log(jobs.map(j=>`${j.id}: ${j.notes.length} notes, ${noteName(j.notes[0].midi)}–${noteName(j.notes.at(-1).midi)}`).join('\n'));
if(process.argv.includes('--inspect'))process.exit(0);
function run(args){return new Promise((ok,fail)=>{const child=spawn(ffmpeg,['-hide_banner','-loglevel','error',...args],{windowsHide:true});const chunks=[],errors=[];child.stdout.on('data',d=>chunks.push(d));child.stderr.on('data',d=>errors.push(d));child.on('error',fail);child.on('close',code=>code?fail(Error(Buffer.concat(errors).toString())):ok(Buffer.concat(chunks)));});}
const audio=new Map();
for(const r of sources.values()){
  const pcm=await run(['-i',resolve(cache,r.file),'-ar','44100','-c:a','pcm_f32le','-f','wav','pipe:1']);
  let channels,data;
  for(let offset=12;offset+8<=pcm.length;offset+=8+pcm.readUInt32LE(offset+4)+(pcm.readUInt32LE(offset+4)&1)){const type=pcm.toString('ascii',offset,offset+4);if(type==='fmt ')channels=pcm.readUInt16LE(offset+10);if(type==='data'){data=offset+8;break;}}
  const samples=new Float32Array(pcm.buffer.slice(pcm.byteOffset+data,pcm.byteOffset+pcm.length));let peak=0;
  for(const value of samples)peak=Math.max(peak,Math.abs(value));
  if(!peak)throw Error(`Silent source: ${r.file}`);
  let last=samples.length;
  for(;last>2205*channels;last-=2205*channels){let sum=0;for(let i=last-2205*channels;i<last;i++)sum+=samples[i]**2;if(Math.sqrt(sum/(2205*channels))>peak*.0031623)break;}
  const end=Math.min(samples.length,last+11025*channels)/(44100*channels),gain=(r.target??.5)/peak;
  const normalized=resolve(cache,r.file+'.normalized.wav');
  await run(['-y','-i',resolve(cache,r.file),'-af',`atrim=end=${end},volume=${gain}`,'-ar','44100','-c:a','pcm_f32le',normalized]);
  audio.set(r.file,{file:normalized,end});
}
const profiles=[],sounds=[];let outputBytes=0;
for(const job of jobs){
  const dir=resolve(root,'audio',job.id);await mkdir(dir,{recursive:true});
  const files={},loops={};const queue=[...job.notes];
  await Promise.all(Array.from({length:4},async()=>{while(queue.length){
    const note=queue.shift(),args=[],filters=[],ends=[];
    for(const [i,r] of note.layers.entries()){
      const source=audio.get(r.file),ratio=job.percussion?1:2**((note.midi-r.center-(r.cents??0)/100)/12);ends.push(source.end/ratio);
      args.push('-i',source.file);filters.push(`[${i}:a]asetrate=${44100*ratio},aresample=44100[a${i}]`);
    }
    const end=Math.max(...ends),labels=note.layers.map((_,i)=>`[a${i}]`).join('');
    const hold=[19,40,41,42,43,44,48,56,57,58,59,60,68,70,71,72,73].includes(job.program);
    if(hold){
      const last=Math.min(end-.15,3.5),first=Math.max(.2,last-Math.min(1.5,(last-.2)*.7));if(last-first<=.08)throw Error(`Recording too short for a sustain loop: ${job.id} ${note.midi}`);
      filters.push(`${labels}amix=inputs=${note.layers.length}:normalize=1,asplit=4[x][y][z][w];[x]atrim=end=${last-.04},asetpts=PTS-STARTPTS[x1];[y]atrim=start=${last-.04}:end=${last},asetpts=PTS-STARTPTS[y1];[z]atrim=start=${first-.04}:end=${first},asetpts=PTS-STARTPTS[z1];[w]atrim=start=${first}:end=${first+.15},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=0.15[r];[y1]afade=t=out:st=0:d=0.04[yo];[z1]afade=t=in:st=0:d=0.04[zi];[yo][zi]amix=inputs=2:duration=shortest:normalize=0[t];[x1][t][r]concat=n=3:v=0:a=1[out]`);
      loops[noteName(note.midi)]=[Number(first.toFixed(6)),Number(last.toFixed(6))];
    }else filters.push(`${labels}amix=inputs=${note.layers.length}:normalize=1,afade=t=out:st=${Math.max(0,end-.05)}:d=0.05[out]`);
    const filename=noteName(note.midi)+'.ogg',file=resolve(dir,filename);
    await run(['-y',...args,'-filter_complex',filters.join(';'),'-map','[out]','-ar','48000','-c:a','libopus','-b:a','128k','-vbr','on',file]);
    const size=(await stat(file)).size;outputBytes+=size;files[noteName(note.midi)]=filename;
  }}));
  const ordered=Object.fromEntries(job.notes.map(n=>[noteName(n.midi),files[noteName(n.midi)]]));
  if(['vsco-piano','vsco-marimba','vsco-xylophone'].includes(job.id)){
    sounds.push({...JSON.parse(await readFile(resolve(root,'audio/soundsets.json'))).find(s=>s.id===job.id),files:ordered});
    console.log(`Encoded ${job.id}: ${Object.keys(files).length} notes`);continue;
  }
  const profile={id:job.id,name:job.name,...(job.percussion?{notes:Object.keys(ordered)}:{range:[job.notes[0].midi,job.notes.at(-1).midi]}),defaultSoundset:job.id,arrangedFor:job.id.replaceAll('-',''),gmProgram:job.program,...(job.percussion?{percussion:true}:{})};
  const release=.2;
  profiles.push(profile);sounds.push({id:job.id,name:job.name,kind:'samples',base:`audio/${job.id}/`,files:ordered,...(job.sustain?{release}:{} ),...(Object.keys(loops).length?{loops:Object.fromEntries(job.notes.map(n=>[noteName(n.midi),loops[noteName(n.midi)]]))}:{})});
  console.log(`Encoded ${job.id}: ${Object.keys(files).length} notes`);
}
// Fill unrecorded GM drum keys without replacing the existing acoustic hits.
const kit=sounds.find(s=>s.id==='vsco-percussion'),electronic=sounds.find(s=>s.id==='freepats-drums'),extra=sounds.find(s=>s.id==='vsco-percussion-extra');
if(kit){
const kitFiles={};
for(const sound of [electronic,extra,kit])for(const [note,file] of Object.entries(sound.files))kitFiles[note]=sound.id+'/'+file;
kit.files=Object.fromEntries(Object.entries(kitFiles).sort(([a],[b])=>noteNumber(a)-noteNumber(b)));
kit.base='audio/';profiles.find(p=>p.id===kit.id).notes=Object.keys(kit.files);
profiles.splice(profiles.findIndex(p=>p.id===electronic.id),1);sounds.splice(sounds.indexOf(electronic),1);
profiles.splice(profiles.findIndex(p=>p.id===extra.id),1);sounds.splice(sounds.indexOf(extra),1);
}
for(const [path,added] of [['instruments.json',profiles],['audio/soundsets.json',sounds]]){
  const file=resolve(root,path),existing=JSON.parse(await readFile(file,'utf8')),ids=new Set(added.map(i=>i.id));
  if(path==='audio/soundsets.json')for(const sound of added){const gainDb=existing.find(s=>s.id===sound.id)?.gainDb;if(gainDb!==undefined)sound.gainDb=gainDb;}
  const combined=[...existing.filter(i=>!ids.has(i.id)),...added];
  if(path==='instruments.json'){const concert=combined.splice(combined.findIndex(i=>i.id==='vsco-xylophone-concert'),1)[0];combined.splice(combined.findIndex(i=>i.id==='xylophone-32'),0,concert);}
  await writeFile(file,JSON.stringify(combined,null,2)+'\n');
}
console.log(`Total: ${jobs.length} instruments, ${jobs.reduce((n,j)=>n+j.notes.length,0)} notes, ${(outputBytes/1048576).toFixed(1)} MiB`);
