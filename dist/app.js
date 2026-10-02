import {NOTE_NAMES, ALLOWED, noteName, noteNumber, serialize, keyOf, MAX_STEPS, MAX_NOTES, convertMidi, suggestMidiTranspositions, validateMidiHeader, validateNote} from './core.js?v=9a09c8fd8cf2a413';
import {TEMPLATES, templateScore} from './templates.js?v=31a638e6d893c797';
const $ = id => document.getElementById(id);
const pitches = Array.from({length:41}, (_,i)=>93-i);
let notes = [], length = 32, history = [];
let sourceMidi = null, audio = null, player = null, activeVoices = new Set();
let appliedMidiSettings = null;
const audioBuffers = new Map();
const audioLoads = new Map();
let playbackRequest = 0;
let currentCell = {step:0,midi:72};
let startStep = 0;
let focusedCell = null;
let beatsPerBar=4,pickupBeats=0;
function announce(text, error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function snapshot(){return {notes:notes.map(note=>({...note})),length,beatsPerBar,pickupBeats,sourceMidi,currentCell:{...currentCell},title:$('scoreTitle').value,values:Object.fromEntries(['bpm','subdivision','transpose'].map(id=>[id,sourceMidi&&['subdivision','transpose'].includes(id)?String(appliedMidiSettings[id]):$(id).value])),tracks:sourceMidi?[...appliedMidiSettings.tracks]:[],scrollLeft:$('rollViewport').scrollLeft};}
// ponytail: 取り消し履歴はメモリ内の直近30操作。長期の履歴が必要になったら保存形式を別途決める。
function remember(previous){if(previous===undefined){commitTitle();previous=snapshot();}history.push(previous);if(history.length>30)history.shift();}
function setTitle(title){const input=$('scoreTitle');input.value=title.trim()||'新しい楽譜';input.dataset.before=input.value;}
function commitTitle(){const input=$('scoreTitle'),before=input.dataset.before,title=input.value.trim()||'新しい楽譜';if(title!==before)remember({...snapshot(),title:before});setTitle(title);}
$('scoreTitle').addEventListener('blur',commitTitle);
$('scoreTitle').addEventListener('keydown',event=>{if(event.isComposing||!['Enter','Escape'].includes(event.key))return;event.preventDefault();if(event.key==='Escape')setTitle($('scoreTitle').dataset.before);$('scoreTitle').blur();});
function getCell(step,midi){if(step<0||step>=length||midi<53||midi>93)return;return $('roll').children[pitches[0]-midi+1]?.children[step+1];}
function updateCell(cell,on){
  const midi=Number(cell.dataset.midi),allowed=ALLOWED.has(midi);
  cell.classList.toggle('active',on&&allowed);cell.classList.toggle('outside',on&&!allowed);
  cell.disabled=!allowed&&!on;cell.setAttribute('aria-disabled',String(cell.disabled));cell.setAttribute('aria-pressed',String(on));cell.setAttribute('aria-selected','false');
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
      const key=document.createElement('div');key.className='key'+(black?' black':'')+(!allowed?' unavailable':'');key.setAttribute('role','rowheader');key.setAttribute('aria-label',`${noteName(midi)}${allowed?'':'、使用不可'}`);
      if(allowed){const button=document.createElement('button');button.className='key-preview';button.dataset.midi=midi;button.textContent=noteName(midi);button.setAttribute('aria-label',`${noteName(midi)}を試聴`);button.title=`${noteName(midi)}を試聴`;key.append(button);}else key.textContent=noteName(midi);
      row.append(key);roll.append(row);
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
  selectStart(Math.min(startStep,length-1));focusCell(getCell(currentCell.step,currentCell.midi));$('extend').disabled=length+4>MAX_STEPS;$('shrink').disabled=length<=1;renderNoteSelection();
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
  try{$('txtPreview').value=serialize(notes.filter(note=>ALLOWED.has(note.midi)),length,stepInterval());}catch(error){$('txtPreview').value='';announce(error.message,true);}
  $('export').disabled=$('copyText').disabled=outside.length>0;$('exportWarning').hidden=!outside.length;
  $('exportWarning').textContent=`${outside.length}個の音は鳴らせません。`;
  renderUnsupported(outside);
}
function renderUnsupported(outside){
  $('unsupportedPanel').hidden=!outside.length;
}
function render(){renderGrid();renderOutput();}
let noteSelection=new Set(),selectionScore=notes,noteGesture=null,suppressNoteClick=false;
const selectionCells=new Set(),moveCells=new Set();
function clearMovePreview(){
  for(const cell of moveCells){cell.classList.remove('move-preview','move-invalid');}moveCells.clear();
  for(const cell of selectionCells)cell.classList.remove('moving');
}
function cancelNoteGesture(){
  const gesture=noteGesture;noteGesture=null;if(gesture){cancelAnimationFrame(gesture.frame);suppressNoteClick=true;try{gesture.cell.releasePointerCapture(gesture.pointerId);}catch{}}
  clearMovePreview();$('selectionBox').hidden=true;$('roll').classList.remove('selecting','moving-notes');
}
function clearNoteSelection(){
  cancelNoteGesture();noteSelection.clear();selectionScore=notes;
  for(const cell of selectionCells){cell.classList.remove('note-selected');cell.setAttribute('aria-selected','false');}selectionCells.clear();
}
function renderNoteSelection(){
  if(selectionScore!==notes)clearNoteSelection();
  const occupied=new Set(notes.map(keyOf));for(const key of noteSelection)if(!occupied.has(key))noteSelection.delete(key);
  for(const cell of selectionCells){cell.classList.remove('note-selected');cell.setAttribute('aria-selected','false');}selectionCells.clear();
  for(const key of noteSelection){const [step,midi]=key.split(':').map(Number),cell=getCell(step,midi);if(cell){cell.classList.add('note-selected');cell.setAttribute('aria-selected','true');selectionCells.add(cell);}}
}
function toggleNoteSelection(cell){
  const key=`${cell.dataset.step}:${cell.dataset.midi}`;if(cell.getAttribute('aria-pressed')!=='true')return;
  if(noteSelection.has(key))noteSelection.delete(key);else noteSelection.add(key);renderNoteSelection();announce(`${noteSelection.size}音を選択しました。`);
}
function selectionTarget(items,stepOffset,pitchOffset){
  const moved=items.map(note=>({step:note.step+stepOffset,midi:note.midi+pitchOffset}));
  const valid=moved.every((note,index)=>note.step>=0&&note.step<length&&note.midi>=53&&note.midi<=93&&(ALLOWED.has(note.midi)||note.midi===items[index].midi));
  return {moved,valid};
}
function moveNoteSelection(items,stepOffset,pitchOffset){
  if(!items.length||!stepOffset&&!pitchOffset)return;
  const {moved,valid}=selectionTarget(items,stepOffset,pitchOffset);
  if(!valid){announce('楽譜の範囲と対応30音の中へ移動してください。',true);return;}
  const selected=new Set(items.map(keyOf)),map=new Map(notes.filter(note=>!selected.has(keyOf(note))).map(note=>[keyOf(note),note]));
  remember();for(const note of moved)map.set(keyOf(note),note);notes=[...map.values()];selectionScore=notes;noteSelection=new Set(moved.map(keyOf));
  currentCell={...moved[0]};render();focusCell(getCell(currentCell.step,currentCell.midi),true);announce(`${items.length}音を移動しました。`);
}
function gesturePosition(event){
  const viewport=$('rollViewport'),rect=viewport.getBoundingClientRect(),first=getCell(0,93).getBoundingClientRect(),key=$('roll').children[1].children[0].getBoundingClientRect();
  const x=Math.max(rect.left+key.width,Math.min(rect.right-1,event.clientX));
  const step=Math.max(0,Math.min(length-1,Math.floor((x-first.left)/first.width)));
  const rows=Array.from($('roll').children).slice(1);let midi=53;
  for(const [index,row]of rows.entries())if(event.clientY<row.getBoundingClientRect().bottom){midi=pitches[index];break;}
  return {step,midi};
}
function updateNoteGesture(scroll=true){
  const gesture=noteGesture;if(!gesture)return;
  if(gesture.score!==notes){clearNoteSelection();return;}
  gesture.moved ||= Math.hypot(gesture.x-gesture.startX,gesture.y-gesture.startY)>=5;if(!gesture.moved)return;
  const viewport=$('rollViewport'),rect=viewport.getBoundingClientRect(),before=viewport.scrollLeft,keyWidth=$('roll').children[1].children[0].getBoundingClientRect().width;
  if(scroll){if(gesture.x>rect.right-24)viewport.scrollLeft+=12;else if(gesture.x<rect.left+keyWidth+24)viewport.scrollLeft-=12;}
  const position=gesturePosition({clientX:gesture.x,clientY:gesture.y});gesture.stepOffset=position.step-gesture.anchor.step;gesture.pitchOffset=position.midi-gesture.anchor.midi;
  if(gesture.kind==='select'){
    const loStep=Math.min(position.step,gesture.anchor.step),hiStep=Math.max(position.step,gesture.anchor.step),loMidi=Math.min(position.midi,gesture.anchor.midi),hiMidi=Math.max(position.midi,gesture.anchor.midi);
    noteSelection=new Set(gesture.add?gesture.previous:[]);
    for(const note of notes)if(note.step>=loStep&&note.step<=hiStep&&note.midi>=loMidi&&note.midi<=hiMidi)noteSelection.add(keyOf(note));renderNoteSelection();
    const a=getCell(loStep,hiMidi).getBoundingClientRect(),b=getCell(hiStep,loMidi).getBoundingClientRect(),box=$('selectionBox');
    box.hidden=false;Object.assign(box.style,{left:`${a.left-rect.left+viewport.scrollLeft}px`,top:`${a.top-rect.top}px`,width:`${b.right-a.left}px`,height:`${b.bottom-a.top}px`});
  }else{
    clearMovePreview();const {moved,valid}=selectionTarget(gesture.items,gesture.stepOffset,gesture.pitchOffset);
    if(gesture.stepOffset||gesture.pitchOffset){
      for(const cell of selectionCells)cell.classList.add('moving');
      for(const note of moved){const cell=getCell(note.step,note.midi);if(cell){cell.classList.add('move-preview');cell.classList.toggle('move-invalid',!valid);moveCells.add(cell);}}
    }
  }
  if(scroll&&viewport.scrollLeft!==before)scheduleNoteGesture();
}
function scheduleNoteGesture(){
  if(noteGesture&&!noteGesture.frame)noteGesture.frame=requestAnimationFrame(()=>{if(noteGesture){noteGesture.frame=0;updateNoteGesture();}});
}
function beginNoteGesture(event){
  suppressNoteClick=false;const cell=event.target.closest('.cell');
  if(!cell||event.button!==0||event.pointerType==='touch')return;
  event.preventDefault();stopPlayback();cancelNoteGesture();suppressNoteClick=false;
  const anchor={step:Number(cell.dataset.step),midi:Number(cell.dataset.midi)},previous=new Set(noteSelection),has=cell.getAttribute('aria-pressed')==='true';
  const kind=has&&!event.shiftKey?'move':'select';
  if(kind==='move'&&!noteSelection.has(keyOf(anchor)))noteSelection=new Set([keyOf(anchor)]);
  noteGesture={kind,cell,anchor,previous,add:event.shiftKey,items:notes.filter(note=>noteSelection.has(keyOf(note))),score:notes,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,moved:false,stepOffset:0,pitchOffset:0,frame:0};
  renderNoteSelection();focusCell(cell,true);cell.setPointerCapture(event.pointerId);$('roll').classList.add(kind==='select'?'selecting':'moving-notes');
}
function finishNoteGesture(event){
  const gesture=noteGesture;if(!gesture||gesture.pointerId!==event.pointerId)return;if(gesture.score!==notes){clearNoteSelection();return;}
  gesture.x=event.clientX;gesture.y=event.clientY;updateNoteGesture(false);cancelNoteGesture();suppressNoteClick=gesture.moved;
  if(!gesture.moved)return;
  if(gesture.kind==='move')moveNoteSelection(gesture.items,gesture.stepOffset,gesture.pitchOffset);else announce(`${noteSelection.size}音を選択しました。`);
}
function selectionKey(event,cell){
  if(event.key==='Escape'){event.preventDefault();clearNoteSelection();announce('選択を解除しました。');return true;}
  if(event.shiftKey&&['Enter',' '].includes(event.key)){event.preventDefault();toggleNoteSelection(cell);return true;}
  if(!noteSelection.size||event.ctrlKey||event.metaKey||event.altKey)return false;
  const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
  if(direction){event.preventDefault();stopPlayback();moveNoteSelection(notes.filter(note=>noteSelection.has(keyOf(note))),...direction);return true;}
  if(['Delete','Backspace'].includes(event.key)){event.preventDefault();stopPlayback();remember();notes=notes.filter(note=>!noteSelection.has(keyOf(note)));clearNoteSelection();render();announce('選択した音を削除しました。');return true;}
  return false;
}
function paint(cell,on){
  const step=Number(cell.dataset.step),midi=Number(cell.dataset.midi),key=`${step}:${midi}`;
  if(!ALLOWED.has(midi)&&on)return;
  const has=notes.some(note=>keyOf(note)===key);if(has===on)return;
  if(on){notes.push({step,midi});void previewTone(midi);}else notes=notes.filter(note=>keyOf(note)!==key);
  updateCell(cell,on);renderOutput();
}
$('roll').addEventListener('pointerdown',beginNoteGesture);
window.addEventListener('pointermove',event=>{if(!noteGesture||noteGesture.pointerId!==event.pointerId)return;noteGesture.x=event.clientX;noteGesture.y=event.clientY;scheduleNoteGesture();});
window.addEventListener('pointerup',finishNoteGesture);window.addEventListener('pointercancel',event=>{if(noteGesture&&noteGesture.pointerId===event.pointerId){noteSelection=noteGesture.previous;cancelNoteGesture();renderNoteSelection();}});
$('roll').addEventListener('lostpointercapture',()=>{if(noteGesture){noteSelection=noteGesture.previous;cancelNoteGesture();renderNoteSelection();}});
$('roll').addEventListener('click',event=>{if(suppressNoteClick&&event.detail!==0){suppressNoteClick=false;return;}const key=event.target.closest('.key-preview');if(key){const midi=Number(key.dataset.midi);if(ALLOWED.has(midi)){stopPlayback();void previewTone(midi);}return;}const header=event.target.closest('.step-label');if(header){stopPlayback();selectStart(Number(header.dataset.step));return;}const cell=event.target.closest('.cell');if(!cell||cell.disabled)return;if(event.shiftKey){toggleNoteSelection(cell);return;}clearNoteSelection();stopPlayback();remember();paint(cell,cell.getAttribute('aria-pressed')!=='true');focusCell(cell,true);});
$('roll').addEventListener('keydown',event=>{const header=event.target.closest('.step-label');if(header){if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const step=Number(header.dataset.step)+(event.key==='ArrowLeft'?-1:1);if(step<0||step>=length)return;stopPlayback();selectStart(step);$('roll').firstElementChild.children[step+1].focus();return;}const cell=event.target.closest('.cell');if(!cell)return;if(selectionKey(event,cell))return;let step=Number(cell.dataset.step),midi=Number(cell.dataset.midi);if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();if(event.key==='ArrowLeft')step--;if(event.key==='ArrowRight')step++;if(event.key==='ArrowUp'||event.key==='ArrowDown'){const direction=event.key==='ArrowUp'?1:-1;do{midi+=direction;}while(midi>=53&&midi<=93&&!ALLOWED.has(midi));}if(step<0||step>=length||!ALLOWED.has(midi))return;focusCell(getCell(step,midi),true);});
for(const [id,delta] of [['extend',4],['shrink',-1]])$(id).onclick=()=>{
  if(length+delta<1||length+delta>MAX_STEPS)return;
  stopPlayback();remember();length+=delta;notes=notes.filter(note=>note.step<length);currentCell.step=Math.min(currentCell.step,length-1);
  render();$('rollViewport').scrollLeft=$('rollViewport').scrollWidth;
  announce(`${Math.abs(delta)}ステップ${delta>0?'追加':'削除'}しました。`);
};
function undo(){
  const previous=history.pop();if(!previous)return;stopPlayback();({notes,length,beatsPerBar,pickupBeats,sourceMidi,currentCell}=previous);
  for(const [id,value] of Object.entries(previous.values))$(id).value=value;
  appliedMidiSettings=sourceMidi?{tracks:previous.tracks,subdivision:Number(previous.values.subdivision),transpose:Number(previous.values.transpose)}:null;
  setTitle(previous.title);$('midiPanel').hidden=!sourceMidi;
  if(sourceMidi){renderTracks(previous.tracks);updateMidiRecommendation();}render();$('rollViewport').scrollLeft=previous.scrollLeft;announce('取り消しました。');
}
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&!event.altKey&&event.key.toLowerCase()==='z'&&!event.target.closest('input,textarea,select,[contenteditable]')){event.preventDefault();undo();}});
$('reset').onclick=()=>{stopPlayback();remember();notes=[];length=32;beatsPerBar=4;pickupBeats=0;currentCell={step:0,midi:72};sourceMidi=null;appliedMidiSettings=null;$('midiPanel').hidden=true;$('txtPreviewPanel').open=false;setTitle('新しい楽譜');$('bpm').value=120;$('subdivision').value=4;updateTiming();render();$('rollViewport').scrollLeft=0;announce('リセットしました。Ctrl+Zで戻せます。');};
for(const category of ['クラシック・民謡','行進曲・軍歌']){
  const group=document.createElement('optgroup');group.label=category;$('templateSelect').append(group);
  for(const template of TEMPLATES.filter(item=>item.category===category).sort((a,b)=>a.reading.localeCompare(b.reading,'ja'))){
    const option=document.createElement('option');option.value=template.id;
    const label=document.createElement('span');label.className='template-label';label.textContent=template.title;
    const composer=document.createElement('span');composer.className='template-composer';composer.textContent=`／${template.composer}`;
    label.append(composer);option.append(label);group.append(option);
  }
}
$('templateSelect').onchange=()=>{
  try{
    const template=TEMPLATES.find(item=>item.id===$('templateSelect').value);if(!template)throw new Error('テンプレートを選択してください。');const score=templateScore(template);
    stopPlayback();remember();({notes,length}=score);sourceMidi=null;appliedMidiSettings=null;beatsPerBar=template.beatsPerBar;pickupBeats=template.pickupBeats;currentCell={step:0,midi:notes[0].midi};
    $('midiPanel').hidden=true;setTitle(template.title);$('bpm').value=template.bpm;$('subdivision').value=template.subdivision??4;updateTiming();render();$('rollViewport').scrollLeft=0;
    announce(`「${template.title}」を読み込みました。`);
  }catch(error){announce(error.message,true);}finally{$('templateSelect').value='';}
};
function downloadName(extension){return ($('scoreTitle').value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'新しい楽譜')+'.'+extension;}
$('export').onclick=()=>{try{const text=serialize(notes,length,stepInterval());const blob=new Blob([text],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=downloadName('txt');anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('TXTを保存しました。');}catch(error){announce(error.message,true);}};
$('exportMidi').onclick=()=>{
  try{
    const interval=stepInterval(),subdivision=Number($('subdivision').value);
    if(!Number.isInteger(length)||length<1||length>MAX_STEPS)throw new Error('ステップ数が不正です。');
    const midi=new window.Midi(),ticksPerStep=midi.header.ppq/subdivision;
    midi.header.setTempo(60000/(interval*subdivision));midi.header.timeSignatures=[{ticks:0,timeSignature:[beatsPerBar,4]}];
    const track=midi.addTrack(),unique=new Map();let omitted=0;track.name='Music Box';track.instrument.number=10;
    for(const note of notes){validateNote(note,length);if(ALLOWED.has(note.midi))unique.set(keyOf(note),note);else omitted++;}
    for(const note of [...unique.values()].sort((a,b)=>a.step-b.step||a.midi-b.midi))track.addNote({midi:note.midi,ticks:note.step*ticksPerStep,durationTicks:ticksPerStep,velocity:.8});
    // このライブラリは末尾の休符を自動出力しないため、曲末に音を鳴らさないイベントを置く。
    track.addCC({number:123,ticks:length*ticksPerStep,value:0});
    const blob=new Blob([midi.toArray()],{type:'audio/midi'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=downloadName('mid');anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    announce(`MIDIを保存しました。${omitted?`対応外の${omitted}音を省きました。`:''}`);
  }catch(error){announce(error.message,true);}
};
$('copyText').onclick=async()=>{
  let text;try{text=serialize(notes,length,stepInterval());}catch(error){announce(error.message,true);return;}
  try{await navigator.clipboard.writeText(text);announce('コピーしました。');}
  catch{$('txtPreviewPanel').open=true;$('txtPreview').focus();$('txtPreview').select();announce('コピーできませんでした。選択したテキストをCtrl+Cでコピーしてください。',true);}
};
function stepInterval(){const bpm=Number($('bpm').value),subdivision=Number($('subdivision').value);if(!Number.isFinite(bpm)||bpm<20||bpm>300)throw new Error('テンポは20〜300 BPMにしてください。');if(![1,2,3,4,6,8].includes(subdivision))throw new Error('ステップ単位が不正です。');return Math.round(60000/bpm/subdivision);}
function updateTiming(){stopPlayback();renderOutput();}
$('bpm').addEventListener('change',updateTiming);$('subdivision').addEventListener('change',()=>{if(sourceMidi)applyMidiSettings();else{updateTiming();renderGrid();}});
function stopPlayback(){playbackRequest++;if(player){clearTimeout(player.timer);markStep(player.visual,false);player=null;}for(const voice of activeVoices){try{voice.stop();}catch{}}activeVoices.clear();selectStart(0);$('play').textContent='▶';$('play').setAttribute('aria-label','試聴');$('play').title='試聴';$('play').setAttribute('aria-pressed','false');}
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
$('play').onclick=async()=>{
  if($('play').getAttribute('aria-pressed')==='true'){stopPlayback();$('rollViewport').scrollLeft=0;announce('停止しました。');return;}
  let request;
  try{
    const interval=stepInterval()/1000;
    if(!notes.some(note=>ALLOWED.has(note.midi)))throw new Error('試聴する音を入力してください。');
    const first=startStep;stopPlayback();selectStart(first);request=playbackRequest;$('play').textContent='■';$('play').setAttribute('aria-label','停止');$('play').title='停止';$('play').setAttribute('aria-pressed','true');announce('音源を読み込んでいます…');await resumeAudio();if(request!==playbackRequest)return;
    const rows=new Map();for(const note of notes.filter(note=>ALLOWED.has(note.midi))){if(!rows.has(note.step))rows.set(note.step,[]);rows.get(note.step).push(note.midi);}
    await Promise.all([...new Set([...rows.values()].flat())].map(loadTone));if(request!==playbackRequest)return;
    const start=audio.currentTime+.06-first*interval;player={start,next:first,visual:-1,timer:0,end:start+length*interval};const session=player;
    const tick=()=>{
      if(player!==session)return;
      while(session.start+session.next*interval<audio.currentTime+.1){
        if(session.next>=length&&session.next%length===0&&$('loop').getAttribute('aria-pressed')!=='true')break;
        const row=rows.get(session.next%length)||[];for(const midi of row)session.end=Math.max(session.end,playTone(midi,Math.max(audio.currentTime,session.start+session.next*interval),.5/Math.sqrt(Math.max(1,row.length))));session.next++;
        if(session.next%length===0)session.end=Math.max(session.end,session.start+session.next*interval);
      }
      const elapsed=Math.floor((audio.currentTime-session.start)/interval),step=elapsed%length;
      if(elapsed>=first&&elapsed<session.next&&step!==session.visual){markStep(session.visual,false);markStep(step,true);session.visual=step;const header=$('roll').firstElementChild.children[step+1];if(header){const viewport=$('rollViewport');const left=header.offsetLeft;if(left<viewport.scrollLeft+84||left>viewport.scrollLeft+viewport.clientWidth-30)viewport.scrollLeft=Math.max(0,left-84);}}
      if(session.next>=length&&session.next%length===0&&$('loop').getAttribute('aria-pressed')!=='true'&&audio.currentTime>=session.end){stopPlayback();announce('試聴が終わりました。');return;}session.timer=setTimeout(tick,25);
    };tick();announce(notes.some(note=>!ALLOWED.has(note.midi))?'対応する音だけを試聴中':'試聴中');
  }catch(error){if(request!==undefined&&request!==playbackRequest)return;stopPlayback();announce(error.message,true);}
};document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlayback();});
$('loop').onclick=()=>{$('loop').setAttribute('aria-pressed',String($('loop').getAttribute('aria-pressed')!=='true'));};
function midiSettings(){return {tracks:[...$('trackList').querySelectorAll('input:checked')].map(input=>Number(input.value)),subdivision:Number($('subdivision').value),transpose:Number($('transpose').value)};}
function updateMidiRecommendation(){
  const settings=midiSettings(),total=sourceMidi.tracks.filter(track=>track.notes.length).length;
  $('trackSummary').textContent=`トラック ${settings.tracks.length} / ${total}`;$('suggest').disabled=true;$('suggest').textContent='おすすめ';
  if(!settings.tracks.length)return;
  try{
    const best=suggestMidiTranspositions(sourceMidi,settings)[0];
    $('suggest').dataset.transpose=best.transpose;$('suggest').textContent=best.transpose===0?'おすすめ：原曲の高さ':`おすすめ：${best.transpose>0?'+':''}${best.transpose}半音`;
    $('suggest').title=`鳴らせない音 ${best.outside}個`;$('suggest').disabled=String($('transpose').value).trim()!==''&&settings.transpose===best.transpose;
  }catch{}
}
function applyMidiSettings(){
  if(!sourceMidi)return;
  try{
    const settings=midiSettings();if(String($('transpose').value).trim()===''||!Number.isInteger(settings.transpose)||Math.abs(settings.transpose)>24)throw new Error('音の高さは−24〜＋24の整数で指定してください。');
    if(JSON.stringify(settings)===JSON.stringify(appliedMidiSettings))return;
    const result=settings.tracks.length?convertMidi(sourceMidi,settings):{notes:[],length};
    stopPlayback();remember();notes=result.notes;length=result.length;appliedMidiSettings=settings;currentCell.step=Math.min(currentCell.step,length-1);
    render();updateMidiRecommendation();announce('MIDI設定を更新しました。');
  }catch(error){announce(error.message,true);}
}
function renderTracks(selected=null){
  const list=$('trackList');list.replaceChildren();
  for(const [index,track]of sourceMidi.tracks.entries()){
    if(!track.notes.length)continue;const label=document.createElement('label');label.className='track-option';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=index;checkbox.checked=selected!==null?selected.includes(index):!track.instrument.percussion;const title=document.createElement('span');title.textContent=`${index+1}. ${track.name||'名前なし'} · ${track.instrument.name||'楽器不明'} · ${track.notes.length}音${track.instrument.percussion?'（打楽器）':''}`;checkbox.addEventListener('change',()=>{applyMidiSettings();updateMidiRecommendation();});label.append(checkbox,title);list.append(label);
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
    stopPlayback();remember();sourceMidi=parsed;appliedMidiSettings={tracks:selected,subdivision:Number($('subdivision').value),transpose:0};notes=result.notes;length=result.length;currentCell={step:0,midi:72};beatsPerBar=4;pickupBeats=0;$('transpose').value=0;$('midiTracks').open=false;setTitle(file.name.replace(/\.(mid|midi)$/i,''));
    const tempo=parsed.header.tempos[0]?.bpm;if(Number.isFinite(tempo)&&tempo>=20&&tempo<=300)$('bpm').value=Math.round(tempo);updateTiming();renderTracks();$('midiPanel').hidden=false;updateMidiRecommendation();render();$('rollViewport').scrollLeft=0;
    announce(`${file.name}を読み込みました。`);
  }catch(error){announce(error.message,true);}finally{importBusy=false;$('pickFile').disabled=false;$('fileInput').value='';}
}
$('pickFile').onclick=()=>$('fileInput').click();$('fileInput').onchange=()=>{const file=$('fileInput').files[0];if(file)void importFile(file);};
let dragDepth=0;
document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});document.addEventListener('drop',event=>{if(!event.dataTransfer?.types.includes('Files'))return;event.preventDefault();dragDepth=0;$('dropZone').classList.remove('dragover');const files=event.dataTransfer.files;if(files.length!==1){announce('MIDIファイルを1つずつドロップしてください。',true);return;}void importFile(files[0]);});
$('dropZone').addEventListener('dragenter',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();dragDepth++;$('dropZone').classList.add('dragover');}});$('dropZone').addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('dropZone').classList.remove('dragover');});
$('transpose').addEventListener('input',()=>{applyMidiSettings();if(sourceMidi)updateMidiRecommendation();});
$('suggest').onclick=()=>{$('transpose').value=$('suggest').dataset.transpose;applyMidiSettings();};
$('selectMelodic').onclick=()=>{renderTracks();applyMidiSettings();updateMidiRecommendation();};$('clearTracks').onclick=()=>{renderTracks([]);applyMidiSettings();updateMidiRecommendation();};
$('removeUnsupported').onclick=()=>{stopPlayback();const count=notes.filter(note=>!ALLOWED.has(note.midi)).length;if(!count)return;remember();notes=notes.filter(note=>ALLOWED.has(note.midi));render();announce(`対応外の${count}音を除外しました。`);};
const modelContext=document.modelContext;
if(modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tools=[
    {name:'read_music_box_score',title:'オルゴール楽譜を読む',description:'現在の楽譜、対応30音、ステップ数と再生間隔を返します。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({allowedNotes:NOTE_NAMES,length,notes:notes.map(note=>({step:note.step,note:noteName(note.midi)})),intervalMs:stepInterval()})},
    {name:'set_music_box_notes',title:'音を入力・削除する',description:'0始まりのステップと対応音名の一覧を追加・削除し、編集画面とTXTプレビューを更新します。',inputSchema:{type:'object',properties:{notes:{type:'array',maxItems:1024,items:{type:'object',properties:{step:{type:'integer',minimum:0},note:{type:'string'},on:{type:'boolean'}},required:['step','note','on'],additionalProperties:false}}},required:['notes'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||!Array.isArray(input.notes)||input.notes.length>1024)throw new Error('入力一覧が不正です。');const changes=input.notes.map(item=>{if(!item||typeof item.on!=='boolean'||typeof item.note!=='string')throw new Error('入力が不正です。');const change={step:item.step,midi:noteNumber(item.note),on:item.on};validateNote(change,length);if(!ALLOWED.has(change.midi))throw new Error('対応30音から指定してください。');return change;});stopPlayback();remember();const map=new Map(notes.map(note=>[keyOf(note),note]));for(const change of changes){if(change.on)map.set(keyOf(change),{step:change.step,midi:change.midi});else map.delete(keyOf(change));}notes=[...map.values()];render();return{updated:changes.length,noteCount:notes.length};}}
  ];
  for(const tool of tools){try{Promise.resolve(modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
setTitle('新しい楽譜');
void Promise.allSettled([...ALLOWED].map(loadTone));updateTiming();render();

let audioExportJob=null;
function audioSaveButton(busy){
  const button=$('save'),label=busy?audioExportJob.label+'保存を中止':'保存形式を選ぶ';
  button.textContent=busy?'中止 ■':'保存 ▾';button.setAttribute('aria-label',label);
  button.setAttribute('aria-busy',String(busy));button.title=label;
}
function cancelAudioExport(){
  const job=audioExportJob;if(!job)return;
  job.cancelled=true;job.reject?.(new Error('中止'));job.worker?.terminate();audioExportJob=null;
  audioSaveButton(false);announce(job.label+'保存を中止しました。');
}
function audioRequest(job,message,transfer=[]){
  return new Promise((resolve,reject)=>{
    job.reject=reject;
    job.worker.onmessage=({data})=>{job.reject=null;data.error?reject(new Error(`${job.label}に変換できませんでした。${data.error}`)):resolve(data);};
    job.worker.onerror=job.worker.onmessageerror=()=>{job.reject=null;reject(new Error(`${job.label}変換を読み込めませんでした。ページを再読み込みしてお試しください。`));};
    job.worker.postMessage(message,transfer);
  });
}
async function saveAudio(format){
  if(audioExportJob){cancelAudioExport();return;}
  const label=format==='mp3'?'MP3':'OGG';
  const job={label,cancelled:false,worker:null,reject:null};audioExportJob=job;audioSaveButton(true);
  try{
    const OfflineAudio=window.OfflineAudioContext||window.webkitOfflineAudioContext;
    if(!OfflineAudio||!window.Worker)throw new Error(`このブラウザでは${label}を保存できません。`);
    if(!Number.isInteger(length)||length<1||length>MAX_STEPS)throw new Error('ステップ数が不正です。');
    const interval=stepInterval()/1000,size=length,filename=downloadName(format),unique=new Map();let omitted=0;
    for(const note of notes){validateNote(note,size);if(ALLOWED.has(note.midi))unique.set(keyOf(note),{...note});else omitted++;}
    const score=[...unique.values()].sort((a,b)=>a.step-b.step||a.midi-b.midi),counts=new Map();
    for(const note of score)counts.set(note.step,(counts.get(note.step)||0)+1);
    announce(`${label}作成中…音源を準備しています。`);
    await Promise.all([...new Set(score.map(note=>note.midi))].map(loadTone));
    if(job.cancelled)return;
    const duration=score.reduce((end,note)=>Math.max(end,note.step*interval+audioBuffers.get(note.midi).duration),size*interval);
    const total=Math.ceil(duration*44100),chunkFrames=44100*30;
    job.worker=new window.Worker(format==='mp3'?'mp3-worker.js?v=30d9a32e43822abe':'ogg-worker.js?v=fbfd8de2a1e68bb2');
    await audioRequest(job,{type:'init'});
    let nextNote=0,carry=[];
    for(let frame=0;frame<total;frame+=chunkFrames){
      if(job.cancelled)return;
      const frames=Math.min(chunkFrames,total-frame),start=frame/44100,end=(frame+frames)/44100;
      let rendered;
      try{
        const context=new OfflineAudio(2,frames,44100);
        while(nextNote<score.length&&score[nextNote].step*interval<end)carry.push(score[nextNote++]);
        carry=carry.filter(note=>note.step*interval+audioBuffers.get(note.midi).duration>start);
        for(const note of carry){
          const time=note.step*interval,voice=context.createBufferSource(),gain=context.createGain();
          voice.buffer=audioBuffers.get(note.midi);gain.gain.value=.5/Math.sqrt(counts.get(note.step));
          voice.connect(gain);gain.connect(context.destination);voice.start(Math.max(0,time-start),Math.max(0,start-time));
        }
        rendered=await context.startRendering();
      }catch{throw new Error(`音声を作成できませんでした。${label}保存をもう一度お試しください。`);}
      if(job.cancelled)return;
      const left=rendered.getChannelData(0).slice(),right=rendered.getChannelData(1).slice();
      await audioRequest(job,{type:'encode',left,right},[left.buffer,right.buffer]);
      if(job.cancelled)return;
      announce(`${label}作成中…${Math.round((frame+frames)/total*100)}%`);
    }
    const {blob}=await audioRequest(job,{type:'finish'});
    if(job.cancelled)return;
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    announce(omitted?`対応外の${omitted}音を省いて${label}を保存しました。`:`${label}を保存しました。`);
  }catch(error){if(!job.cancelled)announce(error.message,true);}
  finally{job.worker?.terminate();if(audioExportJob===job){audioExportJob=null;audioSaveButton(false);}}
}
$('exportMp3').onclick=()=>saveAudio('mp3');
$('exportOgg').onclick=()=>saveAudio('ogg');

const saveMenu=$('saveMenu'),saveButton=$('save');
let menuLast=false;
const menuItems=()=>[...saveMenu.querySelectorAll('button:not(:disabled)')];
function positionSaveMenu(){
  if(!saveMenu.matches(':popover-open'))return;
  const rect=saveButton.getBoundingClientRect(),width=saveMenu.offsetWidth,height=saveMenu.offsetHeight;
  saveMenu.style.left=Math.max(8,Math.min(rect.right-width,window.innerWidth-width-8))+'px';
  const below=rect.bottom+5;
  saveMenu.style.top=Math.max(8,Math.min(below+height<=window.innerHeight-8?below:rect.top-height-5,window.innerHeight-height-8))+'px';
}
saveButton.onclick=event=>{if(audioExportJob){event.preventDefault();cancelAudioExport();}};
saveButton.onkeydown=event=>{
  if(!['ArrowDown','ArrowUp'].includes(event.key)||audioExportJob)return;
  event.preventDefault();menuLast=event.key==='ArrowUp';
  if(saveMenu.matches(':popover-open')){const items=menuItems();items[menuLast?items.length-1:0]?.focus();menuLast=false;}
  else saveMenu.showPopover();
};
saveMenu.addEventListener('toggle',event=>{
  const open=event.newState==='open';saveButton.setAttribute('aria-expanded',String(open));
  if(open){positionSaveMenu();const items=menuItems();items[menuLast?items.length-1:0]?.focus();menuLast=false;}
  else if(saveMenu.contains(document.activeElement))saveButton.focus();
});
saveMenu.onclick=event=>{if(event.target.closest('button')){saveMenu.hidePopover();saveButton.focus();}};
saveMenu.onkeydown=event=>{
  const items=menuItems(),index=items.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
  }else if(event.key==='Tab')saveMenu.hidePopover();
};
window.addEventListener('resize',positionSaveMenu);
window.addEventListener('scroll',positionSaveMenu,true);
