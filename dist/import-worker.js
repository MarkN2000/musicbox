import {parseText,convertMidi,convertScore,suggestTranspositions,validateMidiHeader,MAX_NOTES} from './core.js?v=42e856d1d9211278';
let sourceId,source;
function midiConstructor(){return import('./vendor/midi.js').then(()=>self.Midi);}
self.onmessage=async({data})=>{
  const started=performance.now();
  try{
    if(data.buffer){
      sourceId=null;
      if(data.kind==='text'){
        let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(data.buffer);}catch{throw new Error('TXTはUTF-8で保存してください。');}
        source=parseText(text);
      }else{
        validateMidiHeader(data.buffer);const Midi=await midiConstructor();
        try{source=new Midi(data.buffer);}catch{throw new Error('MIDIを読み込めませんでした。別のファイルを試してください。');}
        const total=source.tracks.reduce((sum,track)=>sum+track.notes.length,0);
        if(total>MAX_NOTES)throw new Error('ノート数の上限（100,000音）を超えています。');
        if(!total)throw new Error('このMIDIには音符が含まれていません。');
      }
      sourceId=data.sourceId;
    }
    if(sourceId!==data.sourceId)throw new Error('取り込み元を再読み込みしてください。');
    const parsedAt=performance.now(),isText=data.kind==='text',rhythm=isText?Number(source.metadata.steps_per_quarter??4):4;
    const settings=data.settings??{tracks:isText?[]:source.tracks.map((track,index)=>!track.instrument.percussion&&track.notes.length?index:-1).filter(index=>index>=0),subdivision:isText?rhythm:data.subdivision,transpose:0};
    if(!isText&&!data.settings&&!settings.tracks.length)throw new Error('このMIDIには打楽器以外の音符がありません。メロディのあるMIDIを選んでください。');
    const result=isText?convertScore(source,settings):settings.tracks.length?convertMidi(source,settings):{notes:[],length:data.length??1};
    const convertedAt=performance.now();
    const original=result.notes.map(note=>({midi:note.midi-settings.transpose}));
    const recommendations=suggestTranspositions(original,new Set(data.allowed));
    self.postMessage({id:data.id,result,settings,recommendations,summary:data.buffer?{
      metadata:isText?source.metadata:{},stepMs:isText?source.stepMs:Math.max(1,Math.round(60000/(source.header.tempos[0]?.bpm??120)/settings.subdivision)),
      tracks:isText?[]:source.tracks.map(track=>({name:track.name,count:track.notes.length,instrument:{name:track.instrument.name,number:track.instrument.number,percussion:track.instrument.percussion}})),
      timeSignature:isText?null:source.header.timeSignatures[0]?.timeSignature
    }:null,timing:{parse:parsedAt-started,convert:convertedAt-parsedAt,recommend:performance.now()-convertedAt}});
  }catch(error){self.postMessage({id:data.id,error:error.message});}
};
