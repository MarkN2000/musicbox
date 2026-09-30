import {NOTE_NAMES, ALLOWED, noteName, noteNumber, serialize, keyOf, MAX_STEPS, MAX_NOTES, convertMidi, validateMidiHeader, validateNote} from './core.js';
import {TEMPLATES, templateScore} from './templates.js?v=d540075d3389abdc';
const $ = id => document.getElementById(id);
const pitches = Array.from({length:41}, (_,i)=>93-i);
const initialTemplate=TEMPLATES[0],sample=templateScore(initialTemplate);
let notes = sample.notes, length = sample.length, history = [], currentTemplate=initialTemplate;
let sourceMidi = null, drag = null, audio = null, player = null, activeVoices = new Set();
const audioBuffers = new Map();
let playbackRequest = 0;
let currentCell = {step:0,midi:72};
let beatsPerBar=initialTemplate.beatsPerBar,pickupBeats=initialTemplate.pickupBeats;
function announce(text, error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function snapshot(){return {notes:notes.map(note=>({...note})),length,beatsPerBar,pickupBeats,sourceMidi,currentTemplate,currentCell:{...currentCell},title:$('scoreTitle').textContent,values:Object.fromEntries(['fileName','bpm','subdivision','interval','transpose'].map(id=>[id,$(id).value])),tracks:sourceMidi?midiSettings().tracks:[],scrollLeft:$('rollViewport').scrollLeft,scrollTop:$('rollViewport').scrollTop};}
// ponytail: 取り消し履歴はメモリ内の直近30操作。長期の履歴が必要になったら保存形式を別途決める。
function remember(){history.push(snapshot());if(history.length>30)history.shift();}
// ponytail: 全マスの描画量は41×ステップ数。実測で重くなった場合に可視範囲の描画を検討する。
function renderGrid(){
  const roll=$('roll');roll.replaceChildren();
  const selected=new Set(notes.map(keyOf));
  const subdivision=Number($('subdivision').value);
  const header=document.createElement('div');header.className='grid-row header-row';header.setAttribute('role','row');
  const corner=document.createElement('div');corner.className='key';corner.textContent='音 / 拍';corner.setAttribute('role','columnheader');header.append(corner);
  for(let step=0;step<length;step++){const label=document.createElement('div');label.className='step-label';label.dataset.step=step;label.setAttribute('role','columnheader');if(step%subdivision===0){label.classList.add('beat');label.textContent=String(Math.floor(step/subdivision)+1);}if((step-pickupBeats*subdivision)%(subdivision*beatsPerBar)===0)label.classList.add('bar');header.append(label);}
  roll.append(header);
  for(const midi of pitches){
    const allowed=ALLOWED.has(midi), black=noteName(midi).includes('#');
    const row=document.createElement('div');row.className='grid-row'+(!allowed?' unavailable':'');row.setAttribute('role','row');
    const key=document.createElement('div');key.className='key'+(black?' black':'')+(!allowed?' unavailable':'');key.textContent=noteName(midi);key.setAttribute('role','rowheader');key.setAttribute('aria-label',`${noteName(midi)}${allowed?'':'、使用不可'}`);row.append(key);
    for(let step=0;step<length;step++){
      const cell=document.createElement('button'),has=selected.has(`${step}:${midi}`);
      cell.className='cell'+(black?' black':'')+(!allowed?' unavailable':'')+(has?(allowed?' active':' outside'):'');
      if(step%subdivision===0)cell.classList.add('beat');if((step-pickupBeats*subdivision)%(subdivision*beatsPerBar)===0)cell.classList.add('bar');
      cell.dataset.step=step;cell.dataset.midi=midi;cell.setAttribute('role','gridcell');cell.setAttribute('aria-label',`${noteName(midi)}、ステップ${step+1}${allowed?'':'、対応外'}${has?'、音あり':''}`);cell.setAttribute('aria-pressed',String(has));
      cell.tabIndex=allowed&&step===currentCell.step&&midi===currentCell.midi?0:-1;
      if(!allowed&&!has){cell.disabled=true;cell.setAttribute('aria-disabled','true');}
      row.append(cell);
    }roll.append(row);
  }
  if(!roll.querySelector('[tabindex="0"]')){const first=roll.querySelector('.cell:not(:disabled):not(.unavailable)');if(first)first.tabIndex=0;}
  $('extend').disabled=length+4>MAX_STEPS;$('shrink').disabled=length<=4;
}
function renderOutput(){
  const outside=notes.filter(note=>!ALLOWED.has(note.midi));
  $('noteStats').textContent=`${notes.length}音 · ${length}ステップ`;
  $('txtPreview').value=serialize(notes.filter(note=>ALLOWED.has(note.midi)),length);
  $('export').disabled=$('copyText').disabled=outside.length>0;$('exportWarning').hidden=!outside.length;
  $('exportWarning').textContent=`対応外 ${outside.length}音：置換か除外で保存できます。`;
  renderUnsupported(outside);
}
function renderUnsupported(outside){
  $('unsupportedPanel').hidden=!outside.length;const list=$('unsupportedList');list.replaceChildren();
  const groups=new Map();for(const note of outside)groups.set(note.midi,(groups.get(note.midi)||0)+1);
  for(const [midi,count]of[...groups].sort((a,b)=>a[0]-b[0])){
    const row=document.createElement('div');row.className='unsupported-item';const text=document.createElement('span');text.textContent=`${noteName(midi)} · ${count}音`;
    const select=document.createElement('select');select.setAttribute('aria-label',`${noteName(midi)}の置換先`);const initial=document.createElement('option');initial.textContent='置換先';initial.value='';select.append(initial);
    for(const name of NOTE_NAMES){const option=document.createElement('option');option.textContent=name;option.value=noteNumber(name);select.append(option);}
    select.addEventListener('change',()=>{if(select.value==='')return;stopPlayback();remember();const target=Number(select.value);notes=[...new Map(notes.map(note=>{const updated=note.midi===midi?{...note,midi:target}:note;return[keyOf(updated),updated];})).values()];render();announce(`${noteName(midi)}を${noteName(target)}に置き換えました。`);});row.append(text,select);list.append(row);
  }
}
function render(){renderGrid();renderOutput();}
function scrollToPitch(midi){$('rollViewport').scrollTop=$('roll').querySelector(`[data-step="0"][data-midi="${midi}"]`).offsetTop-$('roll').firstElementChild.offsetHeight;}
function paint(cell,on){
  const step=Number(cell.dataset.step),midi=Number(cell.dataset.midi),key=`${step}:${midi}`;
  if(!ALLOWED.has(midi)&&on)return;
  const has=notes.some(note=>keyOf(note)===key);if(has===on)return;
  if(on){notes.push({step,midi});void previewTone(midi);}else notes=notes.filter(note=>keyOf(note)!==key);
  cell.classList.toggle('active',on&&ALLOWED.has(midi));cell.classList.toggle('outside',on&&!ALLOWED.has(midi));cell.setAttribute('aria-pressed',String(on));cell.setAttribute('aria-label',`${noteName(midi)}、ステップ${step+1}${on?'、音あり':''}`);
  renderOutput();
}
$('roll').addEventListener('pointerdown',event=>{const cell=event.target.closest('.cell');if(!cell||cell.disabled||event.button!==0)return;if(event.pointerType==='touch')return;event.preventDefault();stopPlayback();remember();const on=cell.getAttribute('aria-pressed')!=='true';drag={on,seen:new Set()};paint(cell,on);drag.seen.add(`${cell.dataset.step}:${cell.dataset.midi}`);currentCell={step:Number(cell.dataset.step),midi:Number(cell.dataset.midi)};cell.focus();});
$('roll').addEventListener('pointerover',event=>{const cell=event.target.closest('.cell');if(!drag||!cell||cell.disabled)return;const key=`${cell.dataset.step}:${cell.dataset.midi}`;if(drag.seen.has(key))return;drag.seen.add(key);paint(cell,drag.on);});
window.addEventListener('pointerup',()=>{if(drag){drag=null;render();$('roll').querySelector(`[data-step="${currentCell.step}"][data-midi="${currentCell.midi}"]`)?.focus({preventScroll:true});}});window.addEventListener('pointercancel',()=>{drag=null;});
$('roll').addEventListener('click',event=>{if(event.detail===0||event.pointerType==='touch'){const cell=event.target.closest('.cell');if(!cell||cell.disabled)return;stopPlayback();remember();paint(cell,cell.getAttribute('aria-pressed')!=='true');}});
$('roll').addEventListener('keydown',event=>{const cell=event.target.closest('.cell');if(!cell)return;let step=Number(cell.dataset.step),midi=Number(cell.dataset.midi);if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();if(event.key==='ArrowLeft')step--;if(event.key==='ArrowRight')step++;if(event.key==='ArrowUp'||event.key==='ArrowDown'){const direction=event.key==='ArrowUp'?1:-1;do{midi+=direction;}while(midi>=53&&midi<=93&&!ALLOWED.has(midi));}if(step<0||step>=length||!ALLOWED.has(midi))return;currentCell={step,midi};for(const other of $('roll').querySelectorAll('.cell'))other.tabIndex=-1;const target=$('roll').querySelector(`[data-step="${step}"][data-midi="${midi}"]`);if(target){target.tabIndex=0;target.focus();}});
for(const [id,delta] of [['extend',4],['shrink',-4]])$(id).onclick=()=>{
  if(length+delta<1||length+delta>MAX_STEPS)return;
  stopPlayback();remember();length+=delta;notes=notes.filter(note=>note.step<length);currentCell.step=Math.min(currentCell.step,length-1);
  render();$('rollViewport').scrollLeft=$('rollViewport').scrollWidth;
  announce(`4ステップ${delta>0?'追加':'削除'}しました。`);
};
function undo(){
  const previous=history.pop();if(!previous)return;stopPlayback();({notes,length,beatsPerBar,pickupBeats,sourceMidi,currentTemplate,currentCell}=previous);
  for(const [id,value] of Object.entries(previous.values))$(id).value=value;
  $('scoreTitle').textContent=previous.title;$('midiPanel').hidden=!sourceMidi;$('suggestions').replaceChildren();
  if(sourceMidi){renderTracks(previous.tracks);previewConversion();}showTemplateInfo();render();$('rollViewport').scrollLeft=previous.scrollLeft;$('rollViewport').scrollTop=previous.scrollTop;announce('取り消しました。');
}
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&!event.altKey&&event.key.toLowerCase()==='z'&&!event.target.closest('input,textarea,select,[contenteditable]')){event.preventDefault();undo();}});
$('reset').onclick=()=>{stopPlayback();remember();notes=[];length=32;beatsPerBar=4;pickupBeats=0;currentCell={step:0,midi:72};sourceMidi=null;currentTemplate=null;$('midiPanel').hidden=true;$('settings').open=false;$('scoreTitle').textContent='新しい楽譜';$('fileName').value='music-box';$('bpm').value=120;$('subdivision').value=4;updateInterval();showTemplateInfo();render();$('rollViewport').scrollLeft=0;announce('リセットしました。Ctrl+Zで戻せます。');};
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
    $('midiPanel').hidden=true;$('scoreTitle').textContent=template.title;$('fileName').value=template.id;$('bpm').value=template.bpm;$('subdivision').value=template.subdivision??4;updateInterval();showTemplateInfo();render();$('rollViewport').scrollLeft=0;scrollToPitch(Math.min(93,Math.max(...notes.map(note=>note.midi))+2));
    announce(`「${template.title}」を読み込みました。`);
  }catch(error){announce(error.message,true);}finally{$('templateSelect').value='';}
};
$('export').onclick=()=>{try{const text=serialize(notes,length);const blob=new Blob([text],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=($('fileName').value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'music-box')+'.txt';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce(`TXTを保存しました。間隔 ${$('interval').value}ms`);}catch(error){announce(error.message,true);}};
$('copyText').onclick=async()=>{
  let text;try{text=serialize(notes,length);}catch(error){announce(error.message,true);return;}
  try{await navigator.clipboard.writeText(text);announce('コピーしました。');}
  catch{$('settings').open=true;$('txtPreview').focus();$('txtPreview').select();announce('コピーできませんでした。選択したテキストをCtrl+Cでコピーしてください。',true);}
};
function updateInterval(){const bpm=Number($('bpm').value);if(!Number.isFinite(bpm)||bpm<20||bpm>300)return;stopPlayback();$('interval').value=Math.round(60000/bpm/Number($('subdivision').value));}
$('bpm').addEventListener('change',updateInterval);$('subdivision').addEventListener('change',()=>{updateInterval();renderGrid();if(sourceMidi)previewConversion();});$('interval').addEventListener('change',stopPlayback);
function stopPlayback(){playbackRequest++;if(player){clearTimeout(player.timer);player=null;}for(const voice of activeVoices){try{voice.stop();}catch{}}activeVoices.clear();$('play').textContent='▶ 試聴';$('play').setAttribute('aria-pressed','false');for(const cell of $('roll').querySelectorAll('.playing'))cell.classList.remove('playing');}
async function resumeAudio(){
  const AudioClass=window.AudioContext||window.webkitAudioContext;if(!AudioClass)throw new Error('このブラウザでは試聴できません。');
  audio??=new AudioClass();await audio.resume();
}
async function loadTone(midi){
  if(audioBuffers.has(midi))return audioBuffers.get(midi);
  const name=noteName(midi);
  const response=await fetch(`audio/${encodeURIComponent(name)}.ogg?v=01e82e8fcb28047e`);
  if(!response.ok)throw new Error(`${name}の音源を読み込めませんでした。もう一度試聴してください。`);
  let buffer;try{buffer=await audio.decodeAudioData(await response.arrayBuffer());}catch{throw new Error(`${name}のOGG音源を再生できません。このブラウザのOGG対応を確認してください。`);}
  audioBuffers.set(midi,buffer);return buffer;
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
$('play').onclick=async()=>{
  if($('play').getAttribute('aria-pressed')==='true'){stopPlayback();announce('停止しました。');return;}
  let request;
  try{
    const interval=Number($('interval').value)/1000;if(!Number.isFinite(interval)||interval<.01||interval>5)throw new Error('再生間隔は10〜5000msにしてください。');
    if(!notes.some(note=>ALLOWED.has(note.midi)))throw new Error('試聴する音を入力してください。');
    stopPlayback();request=playbackRequest;$('play').textContent='■ 停止';$('play').setAttribute('aria-pressed','true');announce('音源を読み込んでいます…');await resumeAudio();if(request!==playbackRequest)return;
    const rows=new Map();for(const note of notes.filter(note=>ALLOWED.has(note.midi))){if(!rows.has(note.step))rows.set(note.step,[]);rows.get(note.step).push(note.midi);}
    await Promise.all([...new Set([...rows.values()].flat())].map(loadTone));if(request!==playbackRequest)return;
    player={start:audio.currentTime+.06,next:0,visual:-1,timer:0,end:audio.currentTime+.06+length*interval};const session=player;
    const tick=()=>{
      if(player!==session)return;
      while(session.next<length&&session.start+session.next*interval<audio.currentTime+.1){const row=rows.get(session.next)||[];for(const midi of row)session.end=Math.max(session.end,playTone(midi,Math.max(audio.currentTime,session.start+session.next*interval),.5/Math.sqrt(Math.max(1,row.length))));session.next++;}
      const step=Math.floor((audio.currentTime-session.start)/interval);
      if(step>=0&&step<length&&step!==session.visual){session.visual=step;for(const cell of $('roll').querySelectorAll('.playing'))cell.classList.remove('playing');for(const cell of $('roll').querySelectorAll(`[data-step="${step}"]`))cell.classList.add('playing');const header=$('roll').querySelector(`.step-label[data-step="${step}"]`);if(header){const viewport=$('rollViewport');const left=header.offsetLeft;if(left<viewport.scrollLeft+84||left>viewport.scrollLeft+viewport.clientWidth-30)viewport.scrollLeft=Math.max(0,left-84);}}
      if(session.next>=length&&audio.currentTime>=session.end){stopPlayback();announce('試聴が終わりました。');return;}session.timer=setTimeout(tick,25);
    };tick();announce(notes.some(note=>!ALLOWED.has(note.midi))?'対応する音だけを試聴中':'試聴中');
  }catch(error){if(request!==undefined&&request!==playbackRequest)return;stopPlayback();announce(error.message,true);}
};document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlayback();});
function midiSettings(){return {tracks:[...$('trackList').querySelectorAll('input:checked')].map(input=>Number(input.value)),subdivision:Number($('subdivision').value),transpose:Number($('transpose').value)};}
function previewConversion(){try{const result=convertMidi(sourceMidi,midiSettings());const valid=result.notes.filter(note=>ALLOWED.has(note.midi)).length;$('conversionInfo').textContent=`適用後：${result.notes.length}音のうち${valid}音が対応 · ${result.length}ステップ${result.merged?` · 重複${result.merged}音を統合`:''}`;$('applyMidi').disabled=false;return result;}catch(error){$('conversionInfo').textContent=error.message;$('applyMidi').disabled=true;return null;}}
function renderTracks(selected=null){
  const list=$('trackList');list.replaceChildren();
  const melodic=sourceMidi.tracks.map((track,index)=>({track,index})).filter(({track})=>track.notes.length&&!track.instrument.percussion);
  for(const [index,track]of sourceMidi.tracks.entries()){
    if(!track.notes.length)continue;const label=document.createElement('label');label.className='track-option';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=index;checkbox.checked=selected?selected.includes(index):melodic.some(item=>item.index===index);const title=document.createElement('span');title.textContent=`${track.name||`トラック${index+1}`} · ${track.notes.length}音${track.instrument.percussion?'（打楽器）':''}`;checkbox.addEventListener('change',previewConversion);label.append(checkbox,title);list.append(label);
  }
}
let importBusy=false;
async function importFile(file){
  if(importBusy)return;importBusy=true;$('pickFile').disabled=true;
  try{
    if(!file||file.size>10*1024*1024)throw new Error('MIDIは10MB以下にしてください。');
    const buffer=await file.arrayBuffer();validateMidiHeader(buffer);
    let parsed;try{parsed=new window.Midi(buffer);}catch{throw new Error('MIDIを読み込めませんでした。別のファイルを試してください。');}
    const total=parsed.tracks.reduce((sum,track)=>sum+track.notes.length,0);if(total>MAX_NOTES)throw new Error('ノート数の上限（100,000音）を超えています。');if(!total)throw new Error('このMIDIには音符が含まれていません。');
    const selected=parsed.tracks.map((track,index)=>({track,index})).filter(({track})=>track.notes.length&&!track.instrument.percussion).map(({index})=>index);
    if(!selected.length)throw new Error('このMIDIには打楽器以外の音符がありません。メロディのあるMIDIを選んでください。');
    const result=convertMidi(parsed,{tracks:selected,subdivision:Number($('subdivision').value),transpose:0});
    stopPlayback();remember();sourceMidi=parsed;currentTemplate=null;notes=result.notes;length=result.length;currentCell={step:0,midi:72};beatsPerBar=4;pickupBeats=0;$('transpose').value=0;$('suggestions').replaceChildren();$('scoreTitle').textContent=file.name.replace(/\.(mid|midi)$/i,'');$('fileName').value=file.name.replace(/\.(mid|midi)$/i,'');
    const tempo=parsed.header.tempos[0]?.bpm;if(Number.isFinite(tempo)&&tempo>=20&&tempo<=300)$('bpm').value=Math.round(tempo);updateInterval();renderTracks();$('midiPanel').hidden=false;$('settings').open=true;previewConversion();showTemplateInfo();render();$('rollViewport').scrollLeft=0;
    announce(`${file.name}を読み込みました。`);
  }catch(error){announce(error.message,true);}finally{importBusy=false;$('pickFile').disabled=false;$('fileInput').value='';}
}
$('pickFile').onclick=()=>$('fileInput').click();$('fileInput').onchange=()=>{const file=$('fileInput').files[0];if(file)void importFile(file);};
let dragDepth=0;
document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});document.addEventListener('drop',event=>{if(!event.dataTransfer?.types.includes('Files'))return;event.preventDefault();dragDepth=0;$('dropZone').classList.remove('dragover');const files=event.dataTransfer.files;if(files.length!==1){announce('MIDIファイルを1つずつドロップしてください。',true);return;}void importFile(files[0]);});
$('dropZone').addEventListener('dragenter',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();dragDepth++;$('dropZone').classList.add('dragover');}});$('dropZone').addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('dropZone').classList.remove('dragover');});
$('transpose').addEventListener('input',()=>{if(sourceMidi)previewConversion();});
$('applyMidi').onclick=()=>{const result=previewConversion();if(!result)return;stopPlayback();remember();notes=result.notes;length=result.length;render();announce('MIDI設定を適用しました。');};
$('suggest').onclick=()=>{
  const settings=midiSettings();if(!settings.tracks.length)return;const candidates=[];
  for(let transpose=-24;transpose<=24;transpose++){try{const result=convertMidi(sourceMidi,{...settings,transpose});const valid=result.notes.filter(note=>ALLOWED.has(note.midi)).length;candidates.push({transpose,valid,total:result.notes.length});}catch{}}
  candidates.sort((a,b)=>b.valid-a.valid||Math.abs(a.transpose)-Math.abs(b.transpose));const container=$('suggestions');container.replaceChildren();
  for(const candidate of candidates.slice(0,3)){const button=document.createElement('button');button.className='button';button.textContent=`${candidate.transpose>0?'+':''}${candidate.transpose} / ${candidate.total?Math.round(candidate.valid/candidate.total*100):0}%対応`;button.onclick=()=>{$('transpose').value=candidate.transpose;previewConversion();};container.append(button);}
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
updateInterval();render();requestAnimationFrame(()=>scrollToPitch(84));
