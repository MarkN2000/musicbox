import init,{SakuraCompiler} from './vendor/sakura/sakuramml.js';
import './vendor/midi.js';
import {prepareMml,fromMidi} from './mml-score.js';
const ready=init();
self.onmessage=async({data})=>{
  try{
    await ready;
    let bytes;
    if(data.buffer)bytes=new Uint8Array(data.buffer);
    else{
      const source=prepareMml(data.text),compiler=SakuraCompiler.new();
      try{compiler.set_language('ja');bytes=compiler.compile(source);const log=compiler.get_log();if(log.trim())throw Error(log);}
      finally{compiler.free();}
    }
    const score=fromMidi(new self.Midi(bytes),data.text??'');
    self.postMessage(data.midiOnly?{bytes}:{score});
  }catch(error){self.postMessage({error:error.message});}
};
