// 実行: node prepare-resonite.mjs "2in1.resonitepackage" "SheetMusic.resonitepackage"
// 提供パッケージの素材を共有し、楽譜のValueだけを更新できるテンプレートを作る。
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {brotliDecompressSync,inflateRawSync} from 'node:zlib';
import assert from 'node:assert/strict';

export function readPackage(zip){
  let end=zip.length-22;while(end>=Math.max(0,zip.length-65557)&&zip.readUInt32LE(end)!==0x06054b50)end--;
  assert(end>=0,'ZIPの終端がありません');
  const files=new Map();let pos=zip.readUInt32LE(end+16);
  for(let i=0;i<zip.readUInt16LE(end+10);i++){
    assert.equal(zip.readUInt32LE(pos),0x02014b50);
    const method=zip.readUInt16LE(pos+10),size=zip.readUInt32LE(pos+20),nameSize=zip.readUInt16LE(pos+28),local=zip.readUInt32LE(pos+42);
    const name=zip.toString('utf8',pos+46,pos+46+nameSize),start=local+30+zip.readUInt16LE(local+26)+zip.readUInt16LE(local+28),packed=zip.subarray(start,start+size);
    assert([0,8].includes(method));files.set(name,method===8?inflateRawSync(packed):packed);
    pos+=46+nameSize+zip.readUInt16LE(pos+30)+zip.readUInt16LE(pos+32);
  }
  return files;
}

export function inspectBson(bytes){
  const fields=new Map();
  function document(start,path,parents){
    const end=start+bytes.readInt32LE(start);assert(end<=bytes.length&&bytes[end-1]===0);
    let pos=start+4;const result={};
    while(pos<end-1){
      const typeAt=pos,type=bytes[pos++],keyEnd=bytes.indexOf(0,pos);assert(keyEnd<end);
      const key=bytes.toString('utf8',pos,keyEnd);pos=keyEnd+1;const valueAt=pos,full=path+'/'+key;let value;
      if(type===3||type===4){value=document(pos,full,[...parents,start]);pos+=bytes.readInt32LE(pos);}
      else if(type===2){const size=bytes.readInt32LE(pos);value=bytes.toString('utf8',pos+4,pos+3+size);pos+=4+size;}
      else if(type===1){value=bytes.readDoubleLE(pos);pos+=8;}
      else if(type===16){value=bytes.readInt32LE(pos);pos+=4;}
      else if(type===18||type===9){value=bytes.subarray(pos,pos+8).toString('hex');pos+=8;}
      else if(type===8)value=!!bytes[pos++];
      else if(type===10)value=null;
      else if(type===5){const size=bytes.readInt32LE(pos);value=bytes.subarray(pos+5,pos+5+size);pos+=5+size;}
      else throw Error('未対応のBSON型：'+type);
      fields.set(full,{typeAt,valueAt,end:pos,parents:[...parents,start]});result[key]=value;
    }
    assert.equal(pos,end-1);return result;
  }
  return {value:document(0,'',[]),fields};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,4,'2in1、SheetMusicの順にパッケージを指定してください');
  for(const [index,id]of ['musicbox','sheetmusic'].entries()){
    const files=readPackage(await readFile(process.argv[index+2])),record=JSON.parse(files.get('R-Main.record'));
    const main='Assets/'+record.assetUri.split('/').at(-1),original=files.get(main);assert.equal(original.subarray(0,9).toString('hex'),'467244540000000003');
    const bson=brotliDecompressSync(original.subarray(9)),{value,fields}=inspectBson(bson),matches=[];
    function find(node,path=''){
      if(!node||typeof node!=='object')return;
      if(node.VariableName?.Data==='StepScore/Score')matches.push(path+'/Value/Data');
      for(const [key,item]of Object.entries(node))find(item,path+'/'+key);
    }
    find(value);assert.equal(matches.length,1,'StepScore/Scoreが一意ではありません');
    const patch=fields.get(matches[0]);assert.equal(bson[patch.typeAt],10,'元のValueは空である必要があります');
    const componentPath=matches[0].replace(/\/Data\/Value\/Data$/,'');
    let component=value;for(const key of componentPath.split('/').filter(Boolean))component=component[key];
    assert.equal(value.Types[component.Type],'[FrooxEngine]FrooxEngine.DynamicValueVariable<string>');
    const resources=[];
    for(const [name,data]of files){
      if(name===main||name==='R-Main.record')continue;
      assert(/^(Assets|Metadata)\/[a-z0-9.]+$/.test(name),'想定外の素材パス');
      const target=resolve('dist/packages',name);await mkdir(dirname(target),{recursive:true});await writeFile(target,data);resources.push(name);
    }
    const template={record,bson:bson.toString('base64'),patch,resources};
    await writeFile('dist/packages/'+id+'.json',JSON.stringify(template)+'\n');
    console.log(id,matches[0],patch,resources.length+'素材');
  }
}
