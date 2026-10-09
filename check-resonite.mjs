// 実行: node check-resonite.mjs
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {brotliDecompressSync} from 'node:zlib';
import {readPackage,inspectBson} from './prepare-resonite.mjs';
import {resonitePackage,scoreObject} from './dist/resonite.js';
import {serialize,parseText} from './dist/core.js';
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>new Response(await readFile(url));
try{
  await mkdir('.sites-runtime/resonite-export',{recursive:true});
  for(const [musicbox,id]of [[true,'musicbox'],[false,'sheetmusic']]){
    const template=JSON.parse(await readFile('dist/resonite/'+id+'.json','utf8'));
    const text=serialize([{step:0,midi:60},{step:2,midi:64}],5,125,{title:'確認 🎵 "曲"',custom:'改行なし'});
    const blob=await resonitePackage(text,musicbox),files=readPackage(Buffer.from(await blob.arrayBuffer())),record=JSON.parse(files.get('R-Main.record'));
    const hash=record.assetUri.split('/').at(-1),object=files.get('Assets/'+hash);
    assert.equal(createHash('sha256').update(object).digest('hex'),hash);
    assert.equal(object.subarray(0,9).toString('hex'),'467244540000000003');
    const before=inspectBson(Buffer.from(template.bson,'base64')).value,after=inspectBson(brotliDecompressSync(object.subarray(9))).value;
    assert.equal(after.Object.Components.Data['2'].Data.Value.Data,text);
    assert.equal(parseText(after.Object.Components.Data['2'].Data.Value.Data).length,5,'末尾休符を保持');
    after.Object.Components.Data['2'].Data.Value.Data=null;assert.deepEqual(after,before,'Value以外のフィールドを変更しない');
    assert.equal(files.size,template.resources.length+2);
    for(const name of template.resources)assert.deepEqual(files.get(name),await readFile('dist/resonite/'+name),'素材を保持：'+name);
    for(const [name,data]of files)if(name.startsWith('Assets/'))assert.equal(createHash('sha256').update(data).digest('hex'),name.slice(7),'全素材のハッシュ');
    for(const asset of record.assetManifest)assert.equal(files.get('Assets/'+asset.hash).length,asset.bytes,'素材のハッシュ・サイズ参照');
    assert.throws(()=>scoreObject({...template,patch:{...template.patch,typeAt:0}},text));
    for(const size of [1,65535,65536,65537,140000]){
      const long='あ'.repeat(size),decoded=inspectBson(brotliDecompressSync(scoreObject(template,long).subarray(9))).value;
      assert.equal(decoded.Object.Components.Data['2'].Data.Value.Data,long,'Brotliブロック境界と長い日本語');
    }
    await writeFile('.sites-runtime/resonite-export/'+id+'.resonitepackage',Buffer.from(await blob.arrayBuffer()));
  }
  globalThis.fetch=async()=>new Response('',{status:404});await assert.rejects(resonitePackage('test',true),/テンプレート/);
  globalThis.fetch=async url=>String(url).endsWith('.json')?new Response(await readFile(url)):new Response('',{status:404});
  await assert.rejects(resonitePackage('test',false),/素材/);
  console.log('Resonite：2種のValue、末尾休符、全素材、ハッシュ、取得失敗を確認');
}finally{globalThis.fetch=originalFetch;}
