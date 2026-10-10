import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {parseText,validateDefinitions} from './dist/core.js';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const defaultLabels={musicbox30:{ja:'オルゴール30',en:'Music box 30'},piano88:{ja:'ピアノ88',en:'Piano 88'},piano61:{ja:'ピアノ61',en:'Piano 61'},xylophone32:{ja:'木琴32',en:'Xylophone 32'}};
export async function catalogData(samplesRoot=resolve(root,'samples')){
  const instruments=JSON.parse(await readFile(resolve(root,'instruments.json'),'utf8')),sounds=JSON.parse(await readFile(resolve(root,'audio/soundsets.json'),'utf8'));
  const definitions=validateDefinitions(instruments,sounds),songs=new Map(),hash=createHash('sha256');
  for(const file of (await readdir(samplesRoot)).filter(file=>file.endsWith('.txt')).sort()){
    const id=file.slice(0,-4);if(!/^[a-z0-9][a-z0-9-]*$/.test(id))throw new Error('サンプルのファイル名が不正です：'+file);
    const text=await readFile(resolve(samplesRoot,file),'utf8'),score=parseText(text),usedNotes=[...new Set(score.notes.map(note=>note.midi))].sort((a,b)=>a-b);
    const {metadata}=score,profile=definitions.instruments.find(item=>item.arrangedFor===metadata.arranged_for);
    if(!['title','composer','composer_ja','composer_en','reading_ja'].every(key=>metadata[key])||!profile||!usedNotes.every(note=>profile.allowed.has(note)))throw new Error('サンプルの設定・対応音が不正です：'+file);
    const songId=metadata.song_id??id.replace(/-(musicbox-30|piano-88|piano-61|xylophone-32)$/,'');
    if(!/^[a-z0-9][a-z0-9-]*$/.test(songId)||(!metadata.song_id&&songId===id))throw new Error('曲IDをsong_idで指定してください：'+file);
    const keys=['title','title_ja','title_en','composer','composer_ja','composer_en','reading_ja'],common=Object.fromEntries(keys.filter(key=>metadata[key]!==undefined).map(key=>[key,metadata[key]]));
    if(!songs.has(songId))songs.set(songId,{id:songId,...common,versions:[]});
    const song=songs.get(songId);
    for(const [key,value] of Object.entries(common)){if(song[key]!==undefined&&song[key]!==value)throw new Error('同じ曲IDの情報が一致しません：'+songId+' '+key);song[key]=value;}
    const labels=Object.fromEntries(['label','label_ja','label_en'].filter(key=>metadata[key]!==undefined).map(key=>[key,metadata[key]]));
    if(Object.values(labels).some(value=>!value.trim()))throw new Error('版名を空にしないでください：'+file);
    const defaults=defaultLabels[metadata.arranged_for]??profile.name;
    song.versions.push({id,arranged_for:metadata.arranged_for,file,...labels,label_ja:labels.label_ja??labels.label??labels.label_en??defaults.ja,label_en:labels.label_en??labels.label??labels.label_ja??defaults.en,usedNotes,length:score.length,stepMs:score.stepMs});hash.update(file).update(text);
  }
  return JSON.stringify({revision:hash.update(JSON.stringify([...songs.values()])).digest('hex').slice(0,16),songs:[...songs.values()]})+'\n';
}
export async function build(){
  await writeFile(resolve(root,'samples/index.json'),await catalogData());
  const sounds=JSON.parse(await readFile(resolve(root,'audio/soundsets.json'),'utf8'));
  for(const sound of sounds){const hash=createHash('sha256');for(const file of Object.values(sound.files))hash.update(await readFile(resolve(root,sound.base,file)));sound.revision=hash.digest('hex').slice(0,16);}
  await writeFile(resolve(root,'audio/soundsets.json'),JSON.stringify(sounds,null,2)+'\n');
  const revision=async file=>createHash('sha256').update((await readFile(resolve(root,file),'utf8')).replace(/\r\n/g,'\n')).digest('hex').slice(0,16);
  const coreRevision=await revision('core.js'),i18nRevision=await revision('i18n.js');
  let worker=await readFile(resolve(root,'import-worker.js'),'utf8');worker=worker.replace(/from '\.\/core\.js(?:\?v=\w+)?'/,`from './core.js?v=${coreRevision}'`);await writeFile(resolve(root,'import-worker.js'),worker);
  let sheet=await readFile(resolve(root,'sheet.js'),'utf8');sheet=sheet.replace(/from '\.\/core\.js(?:\?v=\w+)?'/,`from './core.js?v=${coreRevision}'`);await writeFile(resolve(root,'sheet.js'),sheet);
  let app=await readFile(resolve(root,'app.js'),'utf8');app=app.replace(/from '\.\/core\.js(?:\?v=\w+)?'/,`from './core.js?v=${coreRevision}'`).replace(/from '\.\/i18n\.js(?:\?v=\w+)?'/,`from './i18n.js?v=${i18nRevision}'`).replace(/new URL\('\.\/import-worker\.js(?:\?v=\w+)?'/,`new URL('./import-worker.js?v=${await revision('import-worker.js')}'`);app=app.replace(/import\('\.\/sheet\.js(?:\?v=\w+)?'\)/,`import('./sheet.js?v=${await revision('sheet.js')}')`).replace(/import\('\.\/resonite\.js(?:\?v=\w+)?'\)/,`import('./resonite.js?v=${await revision('resonite.js')}')`);await writeFile(resolve(root,'app.js'),app);
  const style=await readFile(resolve(root,'style.css'),'utf8');
  const scriptHash=createHash('sha256').update(app);
  for(const file of ['core.js','import-worker.js','i18n.js','locales/ja.json','locales/en.json','instruments.json','audio/soundsets.json','samples/index.json'])scriptHash.update(await readFile(resolve(root,file)));
  const html=await readFile(resolve(root,'index.html'),'utf8');
  await writeFile(resolve(root,'index.html'),html.replace(/style\.css\?v=[\w]+/g,'style.css?v='+createHash('sha256').update(style).digest('hex').slice(0,16)).replace(/app\.js\?[^" ]+/g,'app.js?v='+scriptHash.digest('hex').slice(0,16)));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await build();
