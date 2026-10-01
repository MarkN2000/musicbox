import {NOTE_NAMES, ALLOWED, noteName, noteNumber, serialize, keyOf, MAX_STEPS, MAX_NOTES, convertMidi, suggestMidiTranspositions, validateMidiHeader, validateNote} from './core.js?v=9a09c8fd8cf2a413';
import {TEMPLATES, templateScore} from './templates.js?v=750d6f809c008f1d';
const $ = id => document.getElementById(id);
const pitches = Array.from({length:41}, (_,i)=>93-i);
const initialTemplate=TEMPLATES[0],sample=templateScore(initialTemplate);
let notes = sample.notes, length = sample.length, history = [], currentTemplate=initialTemplate;
let sourceMidi = null, drag = null, audio = null, player = null, activeVoices = new Set();
let pendingMidi = null, pendingSnapshot = null;
const audioBuffers = new Map();
const audioLoads = new Map();
let playbackRequest = 0;
let currentCell = {step:0,midi:72};
let startStep = 0;
let focusedCell = null;
let beatsPerBar=initialTemplate.beatsPerBar,pickupBeats=initialTemplate.pickupBeats;
function announce(text, error=false){$('status').textContent=text;$('status').classList.toggle('error',error);if(error&&$('midiDialog').open)$('conversionInfo').textContent=text;}
function snapshot(){return {notes:notes.map(note=>({...note})),length,beatsPerBar,pickupBeats,sourceMidi,currentTemplate,currentCell:{...currentCell},title:$('scoreTitle').textContent,values:Object.fromEntries(['fileName','bpm','subdivision','interval','transpose'].map(id=>[id,$(id).value])),tracks:sourceMidi?midiSettings().tracks:[],scrollLeft:$('rollViewport').scrollLeft};}
// ponytail: 取り消し履歴はメモリ内の直近30操作。長期の履歴が必要になったら保存形式を別途決める。
function remember(previous=snapshot()){history.push(previous);if(history.length>30)history.shift();}
function getCell(step,midi){return $('roll').children[pitches[0]-midi+1]?.children[step+1];}
function updateCell(cell,on){
  const midi=Number(cell.dataset.midi),allowed=ALLOWED.has(midi);
  cell.classList.toggle('active',on&&allowed);cell.classList.toggle('outside',on&&!allowed);
  cell.disabled=!allowed&&!on;cell.setAttribute('aria-disabled',String(cell.disabled));cell.setAttribute('aria-pressed',String(on));
  cell.setAttribute('aria-label',`${noteName(midi)}、ステップ${Number(cell.dataset.step)+1}${allowed?'':'、対応外'}${on?'、音あり':''}`);
}
function focusCell(cell,focus=false){
  if(!cell||cell.disabled)cell=getCell(Math.min(cell?Number(cell.dataset.step):currentCell.step,length-1),72);
  if(focusedCell)focusedCell.tabIndex=-1;focusedCell=cell;if(!cell)return;
  cell.tabIndex=0;currentCell={step:Number(cell.dataset.step),midi:Number(cell.dataset.midi)};if(focus)cell.focus();
}
// ponytail: 全マスの保持量は41×ステップ数。非常に長い楽譜でメモリが不足する場合は描画方式を見直す。
function renderGrid(){
  const roll=$('roll'),selected=new Set(notes.map(keyOf)),subdivision=Number($('subdivision').value);
  const rhythm=`${subdivision}:${beatsPerBar}:${pickupBeats}`,rhythmChanged=roll.dataset.rhythm!==rhythm;
  if(!roll.children.length){
    const header=document.createElement('div');header.className='grid-row header-row';header.setAttribute('role','row');
    const corner=document.createElement('div');corner.className='key';corner.textContent='音 / 拍';corner.setAttribute('role','columnheader');header.append(corner);roll.append(header);
    for(const midi of pitches){
      const allowed=ALLOWED.has(midi),black=noteName(midi).includes('#'),row=document.createElement('div');row.className='grid-row'+(!allowed?' unavailable':'');row.setAttribute('role','row');
      const key=document.createElement('div');key.className='key'+(black?' black':'')+(!allowed?' unavailable':'');key.textContent=noteName(midi);key.setAttribute('role','rowheader');key.setAttribute('aria-label',`${noteName(midi)}${allowed?'':'、使用不可'}`);row.append(key);roll.append(row);
    }
  }
  for(const [index,row]of Array.from(roll.children).entries()){
    const midi=pitches[index-1];
    while(row.children.length>length+1)row.lastElementChild.remove();
    const firstNew=row.children.length-1;
    for(let step=firstNew;step<length;step++){
      const cell=document.createElement('button');cell.dataset.step=step;cell.setAttribute('role',index?'gridcell':'columnheader');
      if(index){cell.className='cell'+(noteName(midi).includes('#')?' black':'')+(!ALLOWED.has(midi)?' unavailable':'');cell.dataset.midi=midi;cell.tabIndex=-1;updateCell(cell,selected.has(`${step}:${midi}`));}
      else{cell.className='step-label';cell.tabIndex=-1;cell.setAttribute('aria-selected','false');cell.setAttribute('aria-label',`ステップ${step+1}から試聴`);cell.title=`ステップ${step+1}から試聴`;}row.append(cell);
    }
    for(let step=rhythmChanged?0:firstNew;step<length;step++){
      const cell=row.children[step+1];cell.classList.toggle('beat',step%subdivision===0);cell.classList.toggle('bar',(step-pickupBeats*subdivision)%(subdivision*beatsPerBar)===0);
      if(!index)cell.textContent=step%subdivision===0?String(Math.floor(step/subdivision)+1):'';
    }
  }
  roll.dataset.rhythm=rhythm;
  for(const cell of roll.querySelectorAll('.active,.outside'))if(!selected.has(`${cell.dataset.step}:${cell.dataset.midi}`))updateCell(cell,false);
  for(const note of notes){const cell=getCell(note.step,note.midi);if(cell&&cell.getAttribute('aria-pressed')!=='true')updateCell(cell,true);}
  selectStart(Math.min(startStep,length-1));focusCell(getCell(currentCell.step,currentCell.midi));$('extend').disabled=length+4>MAX_STEPS;$('shrink').disabled=length<=4;
}
function markStep(step,on){if(step<0)return;for(const row of $('roll').children)row.children[step+1]?.classList.toggle('playing',on);}
function selectStart(step){
  const header=$('roll').firstElementChild;
  for(const [position,on]of[[startStep,false],[step,true]]){const cell=header?.children[position+1];if(cell){cell.classList.toggle('selected',on);cell.setAttribute('aria-selected',String(on));cell.tabIndex=on?0:-1;}}
  startStep=step;
}
function renderOutput(){
  const outside=notes.filter(note=>!ALLOWED.has(note.midi));
  $('noteStats').textContent=`${notes.length}音 · ${length}ステップ`;
  try{$('txtPreview').value=serialize(notes.filter(note=>ALLOWED.has(note.midi)),length,Number($('interval').value));}catch(error){$('txtPreview').value='';announce(error.message,true);}
  $('export').disabled=$('copyText').disabled=outside.length>0;$('exportWarning').hidden=!outside.length;
  $('exportWarning').textContent=`鳴らせない音が${outside.length}個あります。まとめて省くと保存できます。`;
  renderUnsupported(outside);
}
function renderUnsupported(outside){
  $('unsupportedPanel').hidden=!outside.length;
}
function render(){renderGrid();renderOutput();}
function paint(cell,on){
  const step=Number(cell.dataset.step),midi=Number(cell.dataset.midi),key=`${step}:${midi}`;
  if(!ALLOWED.has(midi)&&on)return;
  const has=notes.some(note=>keyOf(note)===key);if(has===on)return;
  if(on){notes.push({step,midi});void previewTone(midi);}else notes=notes.filter(note=>keyOf(note)!==key);
  updateCell(cell,on);if(!drag)renderOutput();
}
$('roll').addEventListener('pointerdown',event=>{const cell=event.target.closest('.cell');if(!cell||cell.disabled||event.button!==0)return;if(event.pointerType==='touch')return;event.preventDefault();stopPlayback();remember();const on=cell.getAttribute('aria-pressed')!=='true';drag={on,seen:new Set()};paint(cell,on);drag.seen.add(`${cell.dataset.step}:${cell.dataset.midi}`);focusCell(cell,true);});
$('roll').addEventListener('pointerover',event=>{const cell=event.target.closest('.cell');if(!drag||!cell||cell.disabled)return;const key=`${cell.dataset.step}:${cell.dataset.midi}`;if(drag.seen.has(key))return;drag.seen.add(key);paint(cell,drag.on);});
window.addEventListener('pointerup',()=>{if(drag){drag=null;renderOutput();}});window.addEventListener('pointercancel',()=>{if(drag){drag=null;renderOutput();}});
$('roll').addEventListener('click',event=>{const header=event.target.closest('.step-label');if(header){stopPlayback();selectStart(Number(header.dataset.step));return;}if(event.detail===0||event.pointerType==='touch'){const cell=event.target.closest('.cell');if(!cell||cell.disabled)return;stopPlayback();remember();paint(cell,cell.getAttribute('aria-pressed')!=='true');focusCell(cell,true);}});
$('roll').addEventListener('keydown',event=>{const header=event.target.closest('.step-label');if(header){if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const step=Number(header.dataset.step)+(event.key==='ArrowLeft'?-1:1);if(step<0||step>=length)return;stopPlayback();selectStart(step);$('roll').firstElementChild.children[step+1].focus();return;}const cell=event.target.closest('.cell');if(!cell)return;let step=Number(cell.dataset.step),midi=Number(cell.dataset.midi);if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();if(event.key==='ArrowLeft')step--;if(event.key==='ArrowRight')step++;if(event.key==='ArrowUp'||event.key==='ArrowDown'){const direction=event.key==='ArrowUp'?1:-1;do{midi+=direction;}while(midi>=53&&midi<=93&&!ALLOWED.has(midi));}if(step<0||step>=length||!ALLOWED.has(midi))return;focusCell(getCell(step,midi),true);});
for(const [id,delta] of [['extend',4],['shrink',-4]])$(id).onclick=()=>{
  if(length+delta<1||length+delta>MAX_STEPS)return;
  stopPlayback();remember();length+=delta;notes=notes.filter(note=>note.step<length);currentCell.step=Math.min(currentCell.step,length-1);
  render();$('rollViewport').scrollLeft=$('rollViewport').scrollWidth;
  announce(`4ステップ${delta>0?'追加':'削除'}しました。`);
};
function undo(){
  const previous=history.pop();if(!previous)return;stopPlayback();({notes,length,beatsPerBar,pickupBeats,sourceMidi,currentTemplate,currentCell}=previous);
  for(const [id,value] of Object.entries(previous.values))$(id).value=value;
  $('scoreTitle').textContent=previous.title;$('adjustMidi').hidden=!sourceMidi;$('suggestions').replaceChildren();
  if(sourceMidi){renderTracks(previous.tracks);previewConversion();}showTemplateInfo();render();$('rollViewport').scrollLeft=previous.scrollLeft;announce('取り消しました。');
}
document.addEventListener('keydown',event=>{if(!$('midiDialog').open&&(event.ctrlKey||event.metaKey)&&!event.shiftKey&&!event.altKey&&event.key.toLowerCase()==='z'&&!event.target.closest('input,textarea,select,[contenteditable]')){event.preventDefault();undo();}});
$('reset').onclick=()=>{stopPlayback();remember();notes=[];length=32;beatsPerBar=4;pickupBeats=0;currentCell={step:0,midi:72};sourceMidi=null;currentTemplate=null;$('adjustMidi').hidden=true;$('settings').open=false;$('scoreTitle').textContent='新しい楽譜';$('fileName').value='music-box';$('bpm').value=120;$('subdivision').value=4;updateInterval();showTemplateInfo();render();$('rollViewport').scrollLeft=0;announce('リセットしました。Ctrl+Zで戻せます。');};
for(const template of TEMPLATES){
  let group=[...$('templateSelect').children].find(item=>item.label===template.category);
  if(!group){group=document.createElement('optgroup');group.label=template.category;$('templateSelect').append(group);}
  const option=document.createElement('option');option.value=template.id;option.textContent=template.title;group.append(option);
}
function showTemplateInfo(){
  const template=currentTemplate;$('templateInfo').hidden=!template;if(!template)return;
  const score=templateScore(template),seconds=(score.length*Math.round(60000/template.bpm/(template.subdivision??4))/1000).toFixed(1);
  $('templateDetails').textContent=`${template.title} · ${template.composer} · ${template.detail} · 推奨 約${seconds}秒＋余韻`;
  $('templateSource').href=template.source;$('templateListen').href=template.listen;
  $('templateCredit').hidden=!template.credit;$('templateCredit').textContent=template.credit??'';
  $('templateLicense').hidden=!template.license;if(template.license){$('templateLicense').href=template.license;$('templateLicense').textContent=template.licenseLabel;}
}
showTemplateInfo();
$('templateSelect').onchange=()=>{
  try{
    const template=TEMPLATES.find(item=>item.id===$('templateSelect').value);if(!template)throw new Error('テンプレートを選択してください。');const score=templateScore(template);
    stopPlayback();remember();({notes,length}=score);sourceMidi=null;currentTemplate=template;beatsPerBar=template.beatsPerBar;pickupBeats=template.pickupBeats;currentCell={step:0,midi:notes[0].midi};
    $('adjustMidi').hidden=true;$('scoreTitle').textContent=template.title;$('fileName').value=template.id;$('bpm').value=template.bpm;$('subdivision').value=template.subdivision??4;updateInterval();showTemplateInfo();render();$('rollViewport').scrollLeft=0;
    announce(`「${template.title}」を読み込みました。`);
  }catch(error){announce(error.message,true);}finally{$('templateSelect').value='';}
};
$('export').onclick=()=>{try{const text=serialize(notes,length,Number($('interval').value));const blob=new Blob([text],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=($('fileName').value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'music-box')+'.txt';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce(`TXTを保存しました。間隔 ${$('interval').value}ms`);}catch(error){announce(error.message,true);}};
$('copyText').onclick=async()=>{
  let text;try{text=serialize(notes,length,Number($('interval').value));}catch(error){announce(error.message,true);return;}
  try{await navigator.clipboard.writeText(text);announce('コピーしました。');}
  catch{$('settings').open=true;$('txtPreview').focus();$('txtPreview').select();announce('コピーできませんでした。選択したテキストをCtrl+Cでコピーしてください。',true);}
};
function updateInterval(){const bpm=Number($('bpm').value);if(!Number.isFinite(bpm)||bpm<20||bpm>300)return;stopPlayback();$('interval').value=Math.round(60000/bpm/Number($('subdivision').value));renderOutput();}
$('bpm').addEventListener('change',updateInterval);$('subdivision').addEventListener('change',()=>{updateInterval();renderGrid();if(sourceMidi)previewConversion();});$('interval').addEventListener('change',()=>{stopPlayback();renderOutput();});
function stopPlayback(){playbackRequest++;if(player){clearTimeout(player.timer);markStep(player.visual,false);player=null;}for(const voice of activeVoices){try{voice.stop();}catch{}}activeVoices.clear();selectStart(0);$('play').textContent='▶ 試聴';$('play').setAttribute('aria-pressed','false');$('previewMidi').textContent='試聴';$('previewMidi').setAttribute('aria-pressed','false');}
function getAudio(){
  const AudioClass=window.AudioContext||window.webkitAudioContext;if(!AudioClass)throw new Error('このブラウザでは試聴できません。');
  return audio??=new AudioClass();
}
async function resumeAudio(){await getAudio().resume();}
function loadTone(midi){
  if(audioBuffers.has(midi))return Promise.resolve(audioBuffers.get(midi));
  if(!audioLoads.has(midi)){
    const loading=(async()=>{
      const name=noteName(midi),response=await fetch(`audio/${encodeURIComponent(name)}.ogg?v=01e82e8fcb28047e`);
      if(!response.ok)throw new Error(`${name}の音源を読み込めませんでした。もう一度試聴してください。`);
      const context=getAudio();let buffer;try{buffer=await context.decodeAudioData(await response.arrayBuffer());}catch{throw new Error(`${name}のOGG音源を再生できません。このブラウザのOGG対応を確認してください。`);}
      audioBuffers.set(midi,buffer);return buffer;
    })().finally(()=>audioLoads.delete(midi));audioLoads.set(midi,loading);
  }
  return audioLoads.get(midi);
}
function playTone(midi,time,volume){
  const voice=audio.createBufferSource(),gain=audio.createGain();voice.buffer=audioBuffers.get(midi);gain.gain.value=volume;voice.connect(gain);gain.connect(audio.destination);voice.start(time);activeVoices.add(voice);voice.onended=()=>{activeVoices.delete(voice);voice.disconnect();gain.disconnect();};
  return time+voice.buffer.duration;
}
async function previewTone(midi){
  const request=playbackRequest;
  try{
    await resumeAudio();if(request!==playbackRequest)return;
    await loadTone(midi);if(request===playbackRequest)playTone(midi,audio.currentTime,.5);
  }catch(error){if(request===playbackRequest)announce(error.message,true);}
}
async function playScore(preview=null){
  const button=preview?$('previewMidi'):$('play'),score=preview?.notes??notes,steps=preview?.length??length;
  if(button.getAttribute('aria-pressed')==='true'){stopPlayback();$('rollViewport').scrollLeft=0;announce('停止しました。');return;}
  let request;
  try{
    const interval=Number(preview?.interval??$('interval').value)/1000;if(!Number.isFinite(interval)||interval<.01||interval>5)throw new Error('再生間隔は10〜5000msにしてください。');
    if(!score.some(note=>ALLOWED.has(note.midi)))throw new Error('試聴する音を入力してください。');
    const first=preview?0:startStep;stopPlayback();if(!preview)selectStart(first);request=playbackRequest;button.textContent='■ 停止';button.setAttribute('aria-pressed','true');announce('音源を読み込んでいます…');await resumeAudio();if(request!==playbackRequest)return;
    const rows=new Map();for(const note of score.filter(note=>ALLOWED.has(note.midi))){if(!rows.has(note.step))rows.set(note.step,[]);rows.get(note.step).push(note.midi);}
    await Promise.all([...new Set([...rows.values()].flat())].map(loadTone));if(request!==playbackRequest)return;
    const start=audio.currentTime+.06-first*interval;player={start,next:first,visual:-1,timer:0,end:start+steps*interval};const session=player;
    const tick=()=>{
      if(player!==session)return;
      while(session.start+session.next*interval<audio.currentTime+.1){
        if(session.next>=steps&&session.next%steps===0&&(preview||!$('loop').checked))break;
        const row=rows.get(session.next%steps)||[];for(const midi of row)session.end=Math.max(session.end,playTone(midi,Math.max(audio.currentTime,session.start+session.next*interval),.5/Math.sqrt(Math.max(1,row.length))));session.next++;
        if(session.next%steps===0)session.end=Math.max(session.end,session.start+session.next*interval);
      }
      const elapsed=Math.floor((audio.currentTime-session.start)/interval),step=elapsed%steps;
      if(!preview&&elapsed>=first&&elapsed<session.next&&step!==session.visual){markStep(session.visual,false);markStep(step,true);session.visual=step;const header=$('roll').firstElementChild.children[step+1];if(header){const viewport=$('rollViewport');const left=header.offsetLeft;if(left<viewport.scrollLeft+84||left>viewport.scrollLeft+viewport.clientWidth-30)viewport.scrollLeft=Math.max(0,left-84);}}
      if(session.next>=steps&&session.next%steps===0&&(preview||!$('loop').checked)&&audio.currentTime>=session.end){stopPlayback();announce('試聴が終わりました。');return;}session.timer=setTimeout(tick,25);
    };tick();announce(score.some(note=>!ALLOWED.has(note.midi))?'鳴らせる音だけを試聴中':'試聴中');
  }catch(error){if(request!==undefined&&request!==playbackRequest)return;stopPlayback();announce(error.message,true);}
}
$('play').onclick=()=>playScore();document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlayback();});
function midiSettings(){return {tracks:[...$('trackList').querySelectorAll('input:checked')].map(input=>Number(input.value)),subdivision:Number($('subdivision').value),transpose:Number($('transpose').value)};}
function previewConversion(){
  const settings=midiSettings(),validPitch=String($('transpose').value).trim()!==''&&Number.isInteger(settings.transpose)&&Math.abs(settings.transpose)<=24;
  $('lowerPitch').disabled=!validPitch||settings.transpose<=-24;$('raisePitch').disabled=!validPitch||settings.transpose>=24;
  for(const button of $('suggestions').children)button.setAttribute('aria-pressed',String(Number(button.dataset.transpose)===settings.transpose&&validPitch));
  try{
    if(!validPitch)throw new Error('音の高さは−24〜＋24の整数で指定してください。');
    const result=convertMidi(pendingMidi?.midi??sourceMidi,settings),valid=result.notes.filter(note=>ALLOWED.has(note.midi)).length,outside=result.notes.length-valid;
    $('conversionInfo').textContent=`使える音 ${valid}個 / ${result.notes.length}個 · 省かれる音 ${outside}個${result.merged?` · 重複${result.merged}個を統合`:''}`;
    $('applyMidi').textContent=outside?`${outside}個を省いて取り込む`:'取り込む';$('applyMidi').disabled=$('previewMidi').disabled=!valid;
    return result;
  }catch(error){$('conversionInfo').textContent=error.message;$('applyMidi').textContent='取り込む';$('applyMidi').disabled=$('previewMidi').disabled=true;return null;}
}
function refreshMidiChoices(){
  stopPlayback();const container=$('suggestions');container.replaceChildren();
  try{
    const midi=pendingMidi?.midi??sourceMidi,settings=midiSettings(),candidates=suggestMidiTranspositions(midi,settings);
    if(!candidates.some(candidate=>candidate.transpose===0)){const original=convertMidi(midi,{...settings,transpose:0});candidates.push({transpose:0,outside:original.notes.filter(note=>!ALLOWED.has(note.midi)).length});}
    for(const [index,candidate]of candidates.entries()){
      const button=document.createElement('button');button.className='button'+(index===0?' recommended':'');button.dataset.transpose=candidate.transpose;
      const height=candidate.transpose===0?'原曲の高さ':`${Math.abs(candidate.transpose)}半音${candidate.transpose>0?'高く':'低く'}`;
      button.textContent=`${index===0?'おすすめ：':''}${height} · 省く音${candidate.outside}個`;
      button.onclick=()=>{stopPlayback();$('transpose').value=candidate.transpose;previewConversion();};container.append(button);
    }
  }catch{}previewConversion();
}
function renderTracks(selected=null){
  const list=$('trackList'),midi=pendingMidi?.midi??sourceMidi;list.replaceChildren();
  for(const [index,track]of midi.tracks.entries()){
    if(!track.notes.length)continue;const label=document.createElement('label');label.className='track-option';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=index;checkbox.checked=selected!==null?selected.includes(index):!track.instrument.percussion;const title=document.createElement('span');
    title.textContent=`${index+1}. ${track.name||'名前なし'} · ${track.instrument.name||'楽器不明'} · ${track.notes.length}音${track.instrument.percussion?'（打楽器）':''}`;
    checkbox.addEventListener('change',refreshMidiChoices);label.append(checkbox,title);list.append(label);
  }
}
function openMidiDialog(midi,name,newFile){
  stopPlayback();pendingSnapshot=snapshot();pendingMidi={midi,name,newFile};
  $('midiTitle').textContent=newFile?'MIDIを取り込む':'MIDIを調整';$('midiFileName').textContent=name;
  if(newFile)$('transpose').value=0;renderTracks(newFile?null:pendingSnapshot.tracks);refreshMidiChoices();$('midiDialog').showModal();
}
let importBusy=false;
async function importFile(file){
  if(importBusy||$('midiDialog').open)return;importBusy=true;$('pickFile').disabled=true;
  try{
    if(!file||file.size>10*1024*1024)throw new Error('MIDIは10MB以下にしてください。');
    const buffer=await file.arrayBuffer();validateMidiHeader(buffer);
    let parsed;try{parsed=new window.Midi(buffer);}catch{throw new Error('MIDIを読み込めませんでした。別のファイルを試してください。');}
    const total=parsed.tracks.reduce((sum,track)=>sum+track.notes.length,0);if(total>MAX_NOTES)throw new Error('ノート数の上限（100,000音）を超えています。');if(!total)throw new Error('このMIDIには音符が含まれていません。');
    const selected=parsed.tracks.map((track,index)=>({track,index})).filter(({track})=>track.notes.length&&!track.instrument.percussion).map(({index})=>index);
    if(!selected.length)throw new Error('このMIDIには打楽器以外の音符がありません。メロディのあるMIDIを選んでください。');
    openMidiDialog(parsed,file.name,true);
  }catch(error){announce(error.message,true);}finally{importBusy=false;$('pickFile').disabled=false;$('fileInput').value='';}
}
$('pickFile').onclick=()=>$('fileInput').click();$('fileInput').onchange=()=>{const file=$('fileInput').files[0];if(file)void importFile(file);};
let dragDepth=0;
document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});document.addEventListener('drop',event=>{if(!event.dataTransfer?.types.includes('Files'))return;event.preventDefault();dragDepth=0;$('dropZone').classList.remove('dragover');const files=event.dataTransfer.files;if(files.length!==1){announce('MIDIファイルを1つずつドロップしてください。',true);return;}void importFile(files[0]);});
$('dropZone').addEventListener('dragenter',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();dragDepth++;$('dropZone').classList.add('dragover');}});$('dropZone').addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('dropZone').classList.remove('dragover');});
$('transpose').addEventListener('input',()=>{stopPlayback();previewConversion();});
for(const [id,delta]of[['lowerPitch',-1],['raisePitch',1]])$(id).onclick=()=>{stopPlayback();$('transpose').value=Number($('transpose').value)+delta;previewConversion();};
$('selectMelodic').onclick=()=>{renderTracks();refreshMidiChoices();};$('clearTracks').onclick=()=>{renderTracks([]);refreshMidiChoices();};
$('cancelMidi').onclick=()=>{$('midiDialog').close();};
$('midiDialog').addEventListener('close',()=>{
  stopPlayback();pendingMidi=null;
  if(pendingSnapshot){$('transpose').value=pendingSnapshot.values.transpose;if(sourceMidi)renderTracks(pendingSnapshot.tracks);else $('trackList').replaceChildren();pendingSnapshot=null;announce('取り込みをキャンセルしました。');}
});
$('adjustMidi').onclick=()=>{if(sourceMidi)openMidiDialog(sourceMidi,$('scoreTitle').textContent,false);};
$('previewMidi').onclick=()=>{
  const result=previewConversion();if(!result||!pendingMidi)return;
  const tempo=pendingMidi.newFile?pendingMidi.midi.header.tempos[0]?.bpm:NaN,bpm=Number.isFinite(tempo)&&tempo>=20&&tempo<=300?Math.round(tempo):Number($('bpm').value);
  return playScore({...result,interval:pendingMidi.newFile?Math.round(60000/bpm/Number($('subdivision').value)):Number($('interval').value)});
};
$('applyMidi').onclick=()=>{
  const result=previewConversion();if(!result||!pendingMidi||!result.notes.some(note=>ALLOWED.has(note.midi)))return;
  stopPlayback();remember(pendingSnapshot);sourceMidi=pendingMidi.midi;currentTemplate=null;notes=result.notes.filter(note=>ALLOWED.has(note.midi));length=result.length;currentCell={step:0,midi:72};beatsPerBar=4;pickupBeats=0;
  if(pendingMidi.newFile){$('scoreTitle').textContent=$('fileName').value=pendingMidi.name.replace(/\.(mid|midi)$/i,'');const tempo=sourceMidi.header.tempos[0]?.bpm;if(Number.isFinite(tempo)&&tempo>=20&&tempo<=300)$('bpm').value=Math.round(tempo);updateInterval();}
  pendingSnapshot=null;$('midiDialog').close();$('adjustMidi').hidden=false;$('settings').open=true;showTemplateInfo();render();$('rollViewport').scrollLeft=0;
  const outside=result.notes.length-notes.length;announce(`MIDIを取り込みました。${outside?`${outside}個の鳴らせない音を省きました。`:''}Ctrl+Zで戻せます。`);
};
$('removeUnsupported').onclick=()=>{stopPlayback();const count=notes.filter(note=>!ALLOWED.has(note.midi)).length;if(!count)return;remember();notes=notes.filter(note=>ALLOWED.has(note.midi));render();announce(`対応外の${count}音を除外しました。`);};
const modelContext=document.modelContext;
if(modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tools=[
    {name:'read_music_box_score',title:'オルゴール楽譜を読む',description:'現在の楽譜、対応30音、ステップ数と再生間隔を返します。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({allowedNotes:NOTE_NAMES,length,notes:notes.map(note=>({step:note.step,note:noteName(note.midi)})),intervalMs:Number($('interval').value)})},
    {name:'set_music_box_notes',title:'音を入力・削除する',description:'0始まりのステップと対応音名の一覧を追加・削除し、編集画面とTXTプレビューを更新します。',inputSchema:{type:'object',properties:{notes:{type:'array',maxItems:1024,items:{type:'object',properties:{step:{type:'integer',minimum:0},note:{type:'string'},on:{type:'boolean'}},required:['step','note','on'],additionalProperties:false}}},required:['notes'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||!Array.isArray(input.notes)||input.notes.length>1024)throw new Error('入力一覧が不正です。');const changes=input.notes.map(item=>{if(!item||typeof item.on!=='boolean'||typeof item.note!=='string')throw new Error('入力が不正です。');const change={step:item.step,midi:noteNumber(item.note),on:item.on};validateNote(change,length);if(!ALLOWED.has(change.midi))throw new Error('対応30音から指定してください。');return change;});stopPlayback();remember();const map=new Map(notes.map(note=>[keyOf(note),note]));for(const change of changes){if(change.on)map.set(keyOf(change),{step:change.step,midi:change.midi});else map.delete(keyOf(change));}notes=[...map.values()];render();return{updated:changes.length,noteCount:notes.length};}}
  ];
  for(const tool of tools){try{Promise.resolve(modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
$('scoreTitle').textContent=initialTemplate.title;$('fileName').value=initialTemplate.id;$('bpm').value=initialTemplate.bpm;
void Promise.allSettled([...ALLOWED].map(loadTone));updateInterval();render();
