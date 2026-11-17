import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {noteName,noteNumber} from './dist/core.js';

const root=resolve('dist'),cache=resolve('.sites-runtime/string-sections'),vsco=resolve('.sites-runtime/vsco-import'),ms=resolve('.sites-runtime/musescore-import');
const rate=48000,ffmpeg=process.env.FFMPEG??'ffmpeg',revision='6dd651d55dde97fd4028699be9d4481f26917891';
const tree=JSON.parse(await readFile(resolve(vsco,'tree.json'),'utf8')),plan=JSON.parse(await readFile(resolve(vsco,'plan.json'),'utf8'));
assert.equal(tree.sha,revision);assert.equal(plan.revision,revision);
await mkdir(resolve(cache,'raw'),{recursive:true});
function run(command,args,options={}){const result=spawnSync(command,args,{windowsHide:true,maxBuffer:32e6,...options});if(result.error)throw result.error;if(result.status)throw Error(String(result.stderr));return result.stdout;}
async function source(file){const entry=tree.tree.find(e=>e.path===file);assert(entry?.sha,'Missing source: '+file);const path=resolve(vsco,file);let bytes;try{bytes=await readFile(path);}catch(e){if(e.code!=='ENOENT')throw e;const response=await fetch('https://raw.githubusercontent.com/sgossner/VSCO-2-CE/'+revision+'/'+file.split('/').map(encodeURIComponent).join('/'));if(!response.ok)throw Error(file+': HTTP '+response.status);bytes=Buffer.from(await response.arrayBuffer());await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,bytes);}assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),entry.sha,file);return path;}
const opcodes=text=>Object.fromEntries([...text.matchAll(/([a-z][a-z_0-9]*)\s*=\s*(.*?)(?=\s+[a-z][a-z_0-9]*\s*=|\s*<|$)/gs)].map(m=>[m[1],m[2].trim()]));
async function regions(name){const text=(await readFile(await source(name+'.sfz'),'utf8')).replace(/\/\/[^\n]*/g,'');let base='',global={},group={};const result=[];for(const[,kind,body]of text.matchAll(/<(control|global|group|region)>\s*([^<]*)/g)){const values=opcodes(body);if(kind==='control')base=values.default_path.replaceAll('\\','/');else if(kind==='global')global=values;else if(kind==='group')group=values;else{const r={...global,...group,...values};if(90<Number(r.lovel??0)||90>Number(r.hivel??127)||Number(r.seq_position??1)!==1)continue;result.push({file:base+r.sample.replaceAll('\\','/'),lo:Number(r.lokey??r.key),hi:Number(r.hikey??r.key),center:Number(r.pitch_keycenter??r.key)});}}return result;}
const sets=new Map([[40,await regions('ViolinEnsSusVib')],[41,await regions('ViolaEnsSusVib')],[42,await regions('CelloEnsSusVib')],[43,[]]]),bassVibrato=await regions('ContrabassSusVB');
const initialProfiles=JSON.parse(await readFile(resolve(root,'instruments.json'),'utf8')),initialSounds=JSON.parse(await readFile(resolve(root,'audio/soundsets.json'),'utf8'));
const only=new Set((process.argv.find(arg=>arg.startsWith('--only='))?.slice(7)??'').split(',').filter(Boolean).map(Number));
for(const program of only)assert([40,41,42,43].includes(program),'Unknown string program: '+program);
const jobs=[40,41,42,43].filter(program=>!only.size||only.has(program)).map(program=>{const profile=initialProfiles.find(p=>p.gmProgram===program&&!p.percussion),sound=initialSounds.find(s=>s.id===profile.defaultSoundset);assert(sound);return {program,sound,notes:Object.keys(sound.files).map(noteNumber),loops:{},real:0,processed:0};});
const fallbacks=jobs.flatMap(j=>j.program<=41?j.notes.filter(midi=>!sets.get(j.program).some(r=>midi>=r.lo&&midi<=r.hi)).map(midi=>[j.program,midi]):[]);
if(fallbacks.length){
 const font=await readFile(resolve(ms,'MuseScore_General.sf2'));assert.equal(createHash('sha256').update(font).digest('hex'),'ee51d2c4b1525e70f19a45909c4fd7a2e26d91d115fa89dbf5a6bc413d8b9bf3');
 try{await access(resolve(cache,'MuseScore_General.sf2'));}catch{await copyFile(resolve(ms,'MuseScore_General.sf2'),resolve(cache,'MuseScore_General.sf2'));}
 await copyFile('prepare-musescore.c',resolve(cache,'render.c'));await copyFile(resolve(ms,'tsf.h'),resolve(cache,'tsf.h'));
 run(process.env.CC??'gcc',['-O2','render.c','-o','render.exe','-lm'],{cwd:cache});
 run(resolve(cache,'render.exe'),[],{cwd:cache,input:fallbacks.map(([gm,midi])=>`${gm} ${midi} 1\n`).join('')});
}
const decoded=new Map();
function decode(file){if(decoded.has(file))return decoded.get(file);const bytes=run(ffmpeg,['-v','error','-i',file,'-ar',String(rate),'-ac','2','-f','f32le','pipe:1']),pcm=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));if(file.startsWith(vsco))decoded.set(file,pcm);return pcm;}
function rms(pcm,from,to){const first=Math.round(from*rate)*2,last=Math.min(pcm.length,Math.round(to*rate)*2);let sum=0;for(let i=first;i<last;i++)sum+=pcm[i]**2;return Math.sqrt(sum/(last-first));}
function sample(pcm,frame,channel){const i=Math.floor(frame),f=frame-i;return i*2+channel+2<pcm.length?pcm[i*2+channel]*(1-f)+pcm[(i+1)*2+channel]*f:0;}
const log=[];
for(const job of jobs){
 const solo=plan.jobs.find(j=>j.id===(job.program===42?'vsco-cello':'vsco-contrabass'));
 for(const midi of job.notes){
  const note=noteName(midi),section=sets.get(job.program).find(r=>midi>=r.lo&&midi<=r.hi);let layers,license;
  if(section){layers=[{pcm:decode(await source(section.file)),ratio:2**((midi-section.center)/12),delay:0,pan:0}];license='CC0-1.0';job.real++;}
  else{
   let original,center;
   if(job.program<=41){original=resolve(cache,`raw/${String(job.program).padStart(3,'0')}-${String(midi).padStart(3,'0')}.wav`);center=midi;license='MIT';}
   else{const region=solo.notes.find(n=>n.midi===midi)?.layers[0];assert(region,'Missing solo region '+job.program+':'+midi);original=resolve(vsco,region.file);const bytes=await readFile(original);assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),region.sha);center=region.center;license='CC0-1.0';}
   const base=decode(original),second=job.program===43?bassVibrato.find(r=>midi>=r.lo&&midi<=r.hi):null;
   const alternate=second?decode(await source(second.file)):base,alternateCenter=second?.center??center;
   // ponytail: three fixed voices approximate a section; independent section recordings are preferred when available.
   layers=[{pcm:base,ratio:2**((midi-center-.04)/12),delay:0,pan:-.3},{pcm:alternate,ratio:2**((midi-alternateCenter)/12),delay:.008,pan:0},{pcm:base,ratio:2**((midi-center+.04)/12),delay:.017,pan:.3}];job.processed++;
  }
  const end=Math.min(3.5,...layers.map(l=>l.pcm.length/2/rate/l.ratio+l.delay-.15)),start=Math.max(.25,end-Math.min(1.5,(end-.25)*.7));assert(end-start>.08,'Recording too short '+job.program+':'+note);
  const frames=Math.round((end+.2)*rate),pcm=new Float32Array(frames*2);
  for(const l of layers)for(let frame=0;frame<frames;frame++){const time=frame/rate-l.delay;if(time<0)continue;const position=time*rate*l.ratio;pcm[frame*2]+=sample(l.pcm,position,0)*(l.pan>0?1-l.pan:1);pcm[frame*2+1]+=sample(l.pcm,position,1)*(l.pan<0?1+l.pan:1);}
  const before=decode(resolve(root,job.sound.base,job.sound.files[note])),oldLoop=job.sound.loops[note],reference=rms(before,oldLoop[0],oldLoop[1])/10**((job.sound.bakedGainDb??0)/20);assert(reference>1e-5,'Silent sample '+note);
  const cross=Math.round(.04*rate),last=Math.round(end*rate),first=Math.round(start*rate);
  for(let i=0;i<cross;i++)for(let ch=0;ch<2;ch++){const f=i/cross,index=(last-cross+i)*2+ch;pcm[index]=pcm[index]*(1-f)+pcm[(first-cross+i)*2+ch]*f;}
  for(let i=last;i<frames;i++)for(let ch=0;ch<2;ch++)pcm[i*2+ch]=pcm[(first+i-last)*2+ch]*(1-(i-last)/(frames-last));
  const level=rms(pcm,start,end);assert(level>1e-5,'Silent section '+note);let peak=0;for(const value of pcm)peak=Math.max(peak,Math.abs(value));const gain=Math.min(reference/level,.7/peak)*10**((job.program===40?3:0)/20);
  for(let i=0;i<pcm.length;i++)pcm[i]*=gain;
  const trim=job.program===40&&section?.08:0,output=trim?pcm.slice(Math.round(trim*rate)*2):pcm;
  if(trim)for(let frame=0;frame<Math.round(.005*rate);frame++)for(let channel=0;channel<2;channel++)output[frame*2+channel]*=frame/Math.round(.005*rate);
  const temporary=resolve(cache,`${job.program}-${midi}.ogg`);
  run(ffmpeg,['-v','error','-y','-f','f32le','-ar',String(rate),'-ac','2','-i','pipe:0','-c:a','libopus','-b:a','128k','-vbr','on','-metadata','LICENSE='+license,'-metadata','COMMENT=Section source: VSCO 2 CE; synthetic fallback: three layered voices; see LICENSES.md',temporary],{input:Buffer.from(output.buffer,output.byteOffset,output.byteLength)});
  job.loops[note]=[start-trim,end-trim];log.push({gm:job.program,midi,kind:section?'recorded section':'processed section',license,attackTrimSeconds:trim,loop:job.loops[note],referenceRms:reference,newRms:rms(output,start-trim,end-trim),peak:peak*gain});
 }
 console.log(`GM ${job.program}: ${job.real} recorded section notes, ${job.processed} processed notes`);
}
// Merge only these four banks into the latest manifest so concurrent work on other sounds is retained.
const latest=JSON.parse(await readFile(resolve(root,'audio/soundsets.json'),'utf8'));
for(const job of jobs){
 const sound=latest.find(s=>s.id===job.sound.id);assert.deepEqual(sound.files,job.sound.files);
 for(const midi of job.notes)await copyFile(resolve(cache,`${job.program}-${midi}.ogg`),resolve(root,sound.base,sound.files[noteName(midi)]));
 sound.loops=job.loops;sound.release=.2;if(job.program===40)sound.bakedGainDb=3;const hash=createHash('sha256');for(const file of Object.values(sound.files))hash.update(await readFile(resolve(root,sound.base,file)));sound.revision=hash.digest('hex').slice(0,16);
}
assert.equal(latest.length,initialSounds.length);await writeFile(resolve(root,'audio/soundsets.json'),JSON.stringify(latest,null,2)+'\n');
await writeFile(resolve(cache,'report.json'),JSON.stringify(log,null,2)+'\n');
console.log('Replaced GM40–43 samples in place; instrument IDs, note ranges and bank count retained.');
