import init,{SakuraCompiler} from './vendor/sakura/sakuramml.js';
import {prepareMml,fromMidi,serializeMml} from './mml-score.js';
const ready=init();
function compile(text,language='ja'){
  const compiler=SakuraCompiler.new();
  try{compiler.set_language(language);const bytes=compiler.compile(prepareMml(text)),log=compiler.get_log();if(log.trim())throw Error(log);return bytes;}
  finally{compiler.free();}
}
self.onmessage=async({data})=>{
  try{
    await ready;
    let bytes=data.buffer?new Uint8Array(data.buffer):compile(data.text,data.language);
    const score=fromMidi(bytes,data.text??'');
    if(data.midiOnly)bytes=compile(serializeMml(score,{singlePort:true}),data.language);
    self.postMessage(data.midiOnly?{bytes}:{score});
  }catch(error){self.postMessage({error:error.message??String(error)});}
};
