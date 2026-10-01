importScripts('vendor/wasm-media-encoder-0.7.0.js');
let encoder,chunks=[];
self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){
      const response=await fetch('vendor/ogg-vorbis-0.7.0.wasm');
      if(!response.ok)throw new Error('Vorbis変換を読み込めませんでした。');
      encoder=await WasmMediaEncoder.createEncoder('audio/ogg',await response.arrayBuffer());
      encoder.configure({channels:2,sampleRate:44100,vbrQuality:4});chunks=[];
    }else if(data.type==='encode'){
      const {left,right}=data;
      if(!encoder||!(left instanceof Float32Array)||!(right instanceof Float32Array)||!left.length||left.length!==right.length||left.length>44100*30)throw new Error('音声データが不正です。');
      for(const channel of [left,right])for(let i=0;i<channel.length;i++){
        if(!Number.isFinite(channel[i]))throw new Error('音声データが不正です。');
        channel[i]=Math.max(-1,Math.min(1,channel[i]));
      }
      // encoderの出力領域は再利用されるため、次の変換前にBlobへコピーする。
      const encoded=encoder.encode([left,right]);if(encoded.length)chunks.push(new Blob([encoded]));
    }else if(data.type==='finish'){
      if(!encoder)throw new Error('OGG変換が開始されていません。');
      chunks.push(new Blob([encoder.finalize()]));
      // ponytail: 波形は30秒ずつ処理するがOGGはメモリに保持する。大容量の保存にはファイルへの逐次書き込みが必要。
      self.postMessage({blob:new Blob(chunks,{type:'audio/ogg'})});chunks=[];encoder=null;return;
    }else throw new Error('OGG変換の操作が不正です。');
    self.postMessage({});
  }catch(error){self.postMessage({error:error.message});}
};
