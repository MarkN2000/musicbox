importScripts('vendor/lame-1.2.1.js');
let encoder,chunks=[];
self.onmessage=({data})=>{
  try{
    if(data.type==='init'){
      encoder=new lamejs.Mp3Encoder(2,44100,128);chunks=[];
    }else if(data.type==='encode'){
      const {left,right}=data;
      if(!encoder||!(left instanceof Float32Array)||!(right instanceof Float32Array)||left.length!==right.length||left.length>44100*30)throw new Error('音声データが不正です。');
      const a=new Int16Array(1152),b=new Int16Array(1152),parts=[];
      for(let offset=0;offset<left.length;offset+=1152){
        const count=Math.min(1152,left.length-offset);
        for(let i=0;i<count;i++){
          const l=Math.max(-1,Math.min(1,left[offset+i])),r=Math.max(-1,Math.min(1,right[offset+i]));
          a[i]=l*(l<0?32768:32767);b[i]=r*(r<0?32768:32767);
        }
        const encoded=encoder.encodeBuffer(a.subarray(0,count),b.subarray(0,count));
        if(encoded.length)parts.push(encoded);
      }
      // ponytail: 波形は30秒ずつ処理するがMP3はメモリに保持する。大容量の保存にはファイルへの逐次書き込みが必要。
      if(parts.length)chunks.push(new Blob(parts));
    }else if(data.type==='finish'){
      if(!encoder)throw new Error('MP3変換が開始されていません。');
      chunks.push(new Blob([encoder.flush()]));
      self.postMessage({blob:new Blob(chunks,{type:'audio/mpeg'})});chunks=[];encoder=null;return;
    }else throw new Error('MP3変換の操作が不正です。');
    self.postMessage({});
  }catch(error){self.postMessage({error:error.message});}
};
