const encoder=new TextEncoder();
const crcTable=Uint32Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=(crc>>>8)^crcTable[(crc^byte)&255];return (crc^0xffffffff)>>>0;}

// Brotliの非圧縮メタブロックで包む。ブラウザにBrotliエンコーダーを追加せず、元と同じFrDT形式で保存する。
function brotliStore(bytes){
  const parts=[];let first=true;
  for(let offset=0;offset<bytes.length;offset+=65536){
    const chunk=bytes.subarray(offset,offset+65536),header=new Uint8Array(3);let bit=0;
    const write=(value,count)=>{for(let i=0;i<count;i++,bit++)header[bit>>>3]|=((value>>>i)&1)<<(bit&7);};
    if(first){write(11,4);first=false;} // WBITS=22
    write(0,1);write(0,2);write(chunk.length-1,16);write(1,1);parts.push(header,chunk);
  }
  const size=parts.reduce((sum,part)=>sum+part.length,10),result=new Uint8Array(size);result.set([70,114,68,84,0,0,0,0,3]);let offset=9;
  for(const part of parts){result.set(part,offset);offset+=part.length;}result[offset]=3; // ISLAST=1、ISLASTEMPTY=1
  return result;
}

// 提供テンプレートだけを扱う。BSON全体を再変換せず、Valueと祖先のサイズだけを更新する。
export function scoreObject(template,text){
  const bytes=Uint8Array.from(atob(template.bson),char=>char.charCodeAt(0)),{typeAt,valueAt,end,parents}=template.patch;
  if(bytes[typeAt]!==10||valueAt!==end||valueAt!==typeAt+6||new TextDecoder().decode(bytes.subarray(typeAt+1,valueAt))!=='Data\0')throw Error('Resoniteテンプレートが不正です。');
  const value=encoder.encode(text),extra=new Uint8Array(4+value.length+1);new DataView(extra.buffer).setInt32(0,value.length+1,true);extra.set(value,4);
  const object=new Uint8Array(bytes.length+extra.length);object.set(bytes.subarray(0,valueAt));object[typeAt]=2;object.set(extra,valueAt);object.set(bytes.subarray(end),valueAt+extra.length);
  const view=new DataView(object.buffer),before=new DataView(bytes.buffer);
  for(const parent of parents)view.setInt32(parent,before.getInt32(parent,true)+extra.length,true);
  return brotliStore(object);
}

// ponytail: ZIP64なしの4GiB未満の提供素材に限定。大容量素材を追加する際はZIP64対応へ切り替える。
function packageZip(files){
  const parts=[],directory=[];let offset=0;
  for(const [name,data]of files){
    const filename=encoder.encode(name),header=new Uint8Array(30+filename.length),view=new DataView(header.buffer),crc=crc32(data);
    view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint16(12,0x21,true);
    view.setUint32(14,crc,true);view.setUint32(18,data.length,true);view.setUint32(22,data.length,true);view.setUint16(26,filename.length,true);header.set(filename,30);
    const entry=new Uint8Array(46+filename.length),central=new DataView(entry.buffer);
    central.setUint32(0,0x02014b50,true);central.setUint16(4,20,true);central.setUint16(6,20,true);central.setUint16(8,0x800,true);central.setUint16(14,0x21,true);
    central.setUint32(16,crc,true);central.setUint32(20,data.length,true);central.setUint32(24,data.length,true);central.setUint16(28,filename.length,true);central.setUint32(42,offset,true);entry.set(filename,46);
    parts.push(header,data);directory.push(entry);offset+=header.length+data.length;
  }
  const end=new Uint8Array(22),view=new DataView(end.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,files.length,true);view.setUint16(10,files.length,true);view.setUint32(12,directory.reduce((size,item)=>size+item.length,0),true);view.setUint32(16,offset,true);
  return new Blob([...parts,...directory,end],{type:'application/octet-stream'});
}

export async function resonitePackage(text,musicbox){
  const root=new URL('./resonite/',import.meta.url),response=await fetch(new URL(musicbox?'musicbox.json':'sheetmusic.json',root),{cache:'no-cache'});
  if(!response.ok)throw Error('Resoniteテンプレートを読み込めませんでした。');
  const template=await response.json(),object=scoreObject(template,text),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',object)),byte=>byte.toString(16).padStart(2,'0')).join('');
  const record=structuredClone(template.record),oldHash=record.assetUri.split('/').at(-1);record.assetUri='packdb:///'+hash;
  for(const asset of record.assetManifest??[])if(asset.hash===oldHash){asset.hash=hash;asset.bytes=object.length;}
  const resources=await Promise.all(template.resources.map(async name=>{
    if(!/^(Assets|Metadata)\/[a-z0-9.]+$/.test(name))throw Error('Resoniteテンプレートが不正です。');
    const response=await fetch(new URL(name,root));if(!response.ok)throw Error('Resoniteの素材を読み込めませんでした。');return [name,new Uint8Array(await response.arrayBuffer())];
  }));
  return packageZip([...resources,['Assets/'+hash,object],['R-Main.record',encoder.encode(JSON.stringify(record))]]);
}
