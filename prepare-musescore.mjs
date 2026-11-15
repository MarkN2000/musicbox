import {readFile,writeFile,mkdir,unlink,stat,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {noteName,noteNumber} from './dist/core.js';

const root=resolve('dist'),cache=resolve('.sites-runtime/musescore-import'),ffmpeg=process.env.FFMPEG??'ffmpeg';
const base='https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/',tsf='853a0a171759f1ddba0de1442133a75912bbeffa';
await mkdir(resolve(cache,'raw'),{recursive:true});
async function download(name,url,hash){let bytes;try{bytes=await readFile(resolve(cache,name));}catch(e){if(e.code!=='ENOENT')throw e;const r=await fetch(url);if(!r.ok)throw Error(`${name}: HTTP ${r.status}`);bytes=Buffer.from(await r.arrayBuffer());await writeFile(resolve(cache,name),bytes);}if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Source hash mismatch: '+name);return bytes;}
await download('MuseScore_General.sf2',base+'MuseScore_General.sf2','ee51d2c4b1525e70f19a45909c4fd7a2e26d91d115fa89dbf5a6bc413d8b9bf3');
const license=await download('MuseScore_General_License.md',base+'MuseScore_General_License.md','5ad8d737e13c7f01f5b9674872a82a92b4ba253603e8ed14b9db12293550b4b9');
const sources=await download('MuseScore_General_Sample_Sources.csv',base+'MuseScore_General_Sample_Sources.csv','cbec757614fa47d2ba71a2f1276bf010918261d94987cfb678352e9755e9bdd4');
await download('tsf.h',`https://raw.githubusercontent.com/schellingb/TinySoundFont/${tsf}/tsf.h`,'70d55963c98f60ebb81518eaa1f25d46888d5180eb5f5289fd6b74ffc177d197');
const rendererLicense=await download('LICENSE',`https://raw.githubusercontent.com/schellingb/TinySoundFont/${tsf}/LICENSE`,'ef10cb839de73fb6d5d32ea7151979e87809a6df70dc7e7ee8457ae1c9e7aa7e');
await writeFile(resolve(root,'vendor/LICENSE-musescore-general.md'),license+'\n\n## TinySoundFont — generation tool\n\n'+rendererLicense+'\n\n## Original sample sources\n\n```csv\n'+sources+'\n```\n');
function run(command,args,cwd=cache){return new Promise((ok,fail)=>{const p=spawn(command,args,{cwd,windowsHide:true}),errors=[];p.stdout.on('data',()=>{});p.stderr.on('data',b=>errors.push(b));p.on('error',fail);p.on('close',code=>code?fail(Error(command+': '+Buffer.concat(errors))):ok());});}
await copyFile('prepare-musescore.c',resolve(cache,'render.c'));
await run(process.env.CC??'gcc',['-O2','render.c','-o','render.exe','-lm']);
const profiles=JSON.parse(await readFile(resolve(root,'instruments.json'))),sounds=JSON.parse(await readFile(resolve(root,'audio/soundsets.json')));
const replace=new Set([8,9,11,19,27,40,41,44,45,46,48,57,58,59,60,68,70,71,72,73]);
const looped=new Set([16,17,18,19,20,21,22,23,38,39,40,41,42,43,44,48,49,50,51,52,53,54,...Array.from({length:48},(_,i)=>56+i),109,110,111,122,125,126]);
const ja=[
 'グランドピアノ|ブライトピアノ|エレクトリックグランド|ホンキートンク|エレピ1|エレピ2|ハープシコード|クラビネット|チェレスタ|グロッケン|オルゴール|ヴィブラフォン|マリンバ|木琴|チューブラーベル|ダルシマー',
 'ドローバーオルガン|パーカッシブオルガン|ロックオルガン|パイプオルガン|リードオルガン|アコーディオン|ハーモニカ|バンドネオン|ナイロン弦ギター|スチール弦ギター|ジャズギター|クリーンギター|ミュートギター|オーバードライブギター|ディストーションギター|ギターハーモニクス',
 'アコースティックベース|指弾きベース|ピック弾きベース|フレットレスベース|スラップベース1|スラップベース2|シンセベース1|シンセベース2|ヴァイオリン|ヴィオラ|チェロ|コントラバス|トレモロ・ストリングス|ピチカート・ストリングス|ハープ|ティンパニ',
 'ストリングス|スローストリングス|シンセストリングス1|シンセストリングス2|合唱（アー）|合唱（ウー）|シンセボイス|オーケストラヒット|トランペット|トロンボーン|チューバ|弱音トランペット|ホルン|ブラスセクション|シンセブラス1|シンセブラス2',
 'ソプラノサックス|アルトサックス|テナーサックス|バリトンサックス|オーボエ|イングリッシュホルン|ファゴット|クラリネット|ピッコロ|フルート|リコーダー|パンフルート|ボトルブロー|尺八|ホイッスル|オカリナ',
 'スクエアリード|ソーリード|カリオペリード|チフリード|チャラング|ボイスリード|フィフスリード|ベース＆リード|ファンタジア|ウォームパッド|ポリシンセパッド|スペースボイス|ボウドパッド|メタリックパッド|ハローパッド|スイープパッド',
 'アイスレイン|サウンドトラック|クリスタル|アトモスフィア|ブライトネス|ゴブリン|エコー|スターテーマ|シタール|バンジョー|三味線|琴|カリンバ|バグパイプ|フィドル|シャナイ',
 'ティンカーベル|アゴゴ|スチールドラム|ウッドブロック|太鼓|メロディックタム|シンセドラム|リバースシンバル|フレットノイズ|ブレスノイズ|波|鳥の声|電話|ヘリコプター|拍手|銃声',
].join('|').split('|');
const en=(await readFile('node_modules/@tonejs/midi/src/InstrumentMaps.ts','utf8')).split('export const instrumentByPatchID = [')[1].split('];')[0].match(/"[^"]+"/g).map(s=>JSON.parse(s));
if(ja.length!==128||en.length!==128)throw Error('GM names are incomplete');
const only=new Set((process.argv.find(a=>a.startsWith('--only='))?.slice(7)??'').split(',').filter(Boolean).map(Number));
const programs=Array.from({length:128},(_,i)=>i).filter(gm=>(!only.size||only.has(gm))&&(replace.has(gm)||!profiles.some(p=>!p.percussion&&p.gmProgram===gm)||profiles.some(p=>!p.percussion&&p.gmProgram===gm&&p.defaultSoundset.startsWith('musescore-'))));
const jobs=programs.map(program=>{const id='musescore-gm'+String(program).padStart(3,'0'),existing=process.argv.includes('--extend')?sounds.find(s=>s.id===id):null;return {program,id,name:{ja:ja[program],en:en[program]},range:[21,108],files:{...existing?.files},loops:{...existing?.loops},release:existing?.release??0};});
const requests=jobs.flatMap(j=>Array.from({length:j.range[1]-j.range[0]+1},(_,i)=>({job:j,midi:j.range[0]+i})).filter(r=>!j.files[noteName(r.midi)])),lookup=new Map(jobs.map(j=>[j.program,j]));
for(const j of jobs)await mkdir(resolve(root,'audio',j.id),{recursive:true});
let next=0,completed=0,inflight=0,bytes=0,failure;
const child=spawn(resolve(cache,'render.exe'),[],{cwd:cache,windowsHide:true}),errors=[];child.stderr.on('data',b=>errors.push(b));
const done=new Promise((ok,fail)=>{child.on('error',fail);child.on('close',code=>code?fail(Error('SF2 renderer: '+Buffer.concat(errors))):ok());});
const encodings=new Set();
function pump(){while(!failure&&inflight<4&&next<requests.length){const {job,midi}=requests[next++];inflight++;child.stdin.write(`${job.program} ${midi} ${Number(looped.has(job.program))}\n`);}if(next===requests.length&&!child.stdin.writableEnded)child.stdin.end();}
async function encode(meta){
 const j=lookup.get(meta.program);if(meta.silent)return;
 const source=resolve(cache,`raw/${String(meta.program).padStart(3,'0')}-${String(meta.midi).padStart(3,'0')}.wav`),name=noteName(meta.midi),path=resolve(root,'audio',j.id,name+'.ogg');
 let filter;
 if(meta.loop){
  const start=meta.head+.1,end=start+1.5;
  filter=`[0:a]asplit[h][s];[h]atrim=end=${meta.head},asetpts=PTS-STARTPTS[a];[s]atrim=start=${meta.settle}:end=${meta.settle+2},asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=0.05:c1=tri:c2=tri[m];[m]asplit=4[x][y][z][w];[x]atrim=end=${end-.04},asetpts=PTS-STARTPTS[x1];[y]atrim=start=${end-.04}:end=${end},asetpts=PTS-STARTPTS[y1];[z]atrim=start=${start-.04}:end=${start},asetpts=PTS-STARTPTS[z1];[w]atrim=start=${start}:end=${start+.15},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=0.15[r];[y1][z1]acrossfade=d=0.04:c1=tri:c2=tri[t];[x1][t][r]concat=n=3:v=0:a=1[out]`;
  j.loops[name]=[Number(start.toFixed(6)),Number(end.toFixed(6))];
 }else filter=`[0:a]afade=t=out:st=${Math.max(0,meta.duration-.05)}:d=0.05[out]`;
 await run(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',source,'-filter_complex',filter,'-map','[out]','-ar','48000','-c:a','libopus','-b:a','128k','-vbr','on','-metadata','LICENSE=MIT','-metadata','COPYRIGHT=Frank Wen; Michael Cowgill; S. Christian Collins; Ethan Winer; Michael Schorsch','-metadata','SOURCE='+base+'MuseScore_General_License.md',path]);
 await unlink(source);j.files[name]=name+'.ogg';j.release=Math.max(j.release,Math.min(.1,meta.release));bytes+=(await stat(path)).size;
}
createInterface({input:child.stdout}).on('line',line=>{const p=encode(JSON.parse(line)).catch(e=>{failure??=e;child.kill();}).finally(()=>{encodings.delete(p);inflight--;completed++;if(completed%50===0)console.log(`Encoded ${completed}/${requests.length} (${(bytes/1048576).toFixed(1)} MiB)`);pump();});encodings.add(p);});
pump();await done;while(encodings.size)await Promise.all([...encodings]);if(failure)throw failure;
for(const j of jobs){
 const names=Object.keys(j.files).sort((a,b)=>noteNumber(a)-noteNumber(b));if(!names.length)throw Error('Silent instrument: '+j.program);
 const low=noteNumber(names[0]),high=noteNumber(names.at(-1));if(names.length!==high-low+1)throw Error('Discontinuous instrument range: '+j.program);
 const sound={id:j.id,name:j.name,kind:'samples',base:`audio/${j.id}/`,files:Object.fromEntries(names.map(n=>[n,j.files[n]])),...(looped.has(j.program)||![45,47,112,113,114,115,116,117,118,119,120,123,124,127].includes(j.program)?{release:j.program<=3?.5:j.release}:{}),...(Object.keys(j.loops).length?{loops:Object.fromEntries(names.filter(n=>j.loops[n]).map(n=>[n,j.loops[n]]))}:{})};
 const index=sounds.findIndex(s=>s.id===j.id);if(index<0)sounds.push(sound);else sounds[index]=sound;
 const existing=profiles.filter(p=>!p.percussion&&p.gmProgram===j.program);
 if(existing.length)for(const p of existing){p.range=[low,high];delete p.notes;p.defaultSoundset=j.id;}
 else profiles.push({id:j.id,name:j.name,range:[low,high],defaultSoundset:j.id,arrangedFor:'musescoregm'+j.program,gmProgram:j.program});
 console.log(`GM ${j.program}: ${ja[j.program]} ${noteName(low)}–${noteName(high)}, ${Object.keys(j.loops).length} looped notes`);
}
await writeFile(resolve(root,'instruments.json'),JSON.stringify(profiles,null,2)+'\n');await writeFile(resolve(root,'audio/soundsets.json'),JSON.stringify(sounds,null,2)+'\n');
console.log(`MuseScore General: ${jobs.length} programs, ${(bytes/1048576).toFixed(1)} MiB`);
