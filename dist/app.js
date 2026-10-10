import {noteName,noteNumber,serialize,parseText,convertScore,keyOf,MAX_STEPS,MAX_NOTES,validateNote,rhythmMetadata,validateDefinitions} from './core.js?v=45fa6b2982902f00';
import {t,currentLanguage,preferredLanguage,loadLanguage,localized,translatePage} from './i18n.js?v=2f127a12b3570584';
const $=id=>document.getElementById(id);
const json=async path=>{const response=await fetch(path,{cache:'no-cache'});if(!response.ok)throw new Error('設定を読み込めませんでした。');return response.json();};
let definitions,catalog;
try{await loadLanguage(preferredLanguage());const [profiles,sounds,index]=await Promise.all([json('instruments.json'),json('audio/soundsets.json'),json('samples/index.json')]);definitions=validateDefinitions(profiles,sounds);catalog=index;}
catch(error){$('errorMessage').textContent=t(error.message);throw error;}
let instrument=definitions.instruments[0],ALLOWED=instrument.allowed,soundset=definitions.soundsets.find(item=>item.id===instrument.defaultSoundset);
let pitches=[],notes=[],length=32,history=[],metadata={time_signature:'4/4'},exactStepMs=125;
let sourceMidi=null,audio=null,player=null,activeVoices=new Set(),appliedMidiSettings=null;
let audioBuffers=new Map();const audioLoads=new Map(),toneCache=new Map();
let playbackRequest=0,currentCell={step:0,midi:72},startStep=0,focusedCell=null,beatsPerBar=4;
const cells=new Map(),headers=new Map();let gridSignature='',gridNotes=null,gridNoteCount=-1,occupied=new Set(),renderFrame=0;
function showError(text=''){$('errorMessage').textContent=t(text);}
function snapshot(){return {notes:notes.map(note=>({...note})),length,beatsPerBar,sourceMidi,appliedMidiSettings,metadata:{...metadata},exactStepMs,currentCell:{...currentCell},values:Object.fromEntries(['bpm','subdivision'].map(id=>[id,sourceMidi&&id==='subdivision'?String(appliedMidiSettings.subdivision):$(id).value])),scrollLeft:$('rollViewport').scrollLeft};}
// ponytail: 取り消しはメモリ内の直近30操作。長期保存は必要になった時点で別途決める。
function remember(previous){if(previous===undefined){commitTitle();previous=snapshot();}history.push(previous);if(history.length>30)history.shift();}
function setTitle(title){const input=$('scoreTitle');input.value=title.trim()||t('新しい楽譜');input.dataset.before=input.value;}
function titleMetadata(){const title=$('scoreTitle').value.trim()||t('新しい楽譜'),edited=title!==localized(metadata,'title',t('新しい楽譜'));return {...Object.fromEntries(Object.entries(metadata).filter(([key])=>!edited||!key.startsWith('title_'))),title:edited?title:metadata.title||title};}
function commitTitle(){const input=$('scoreTitle'),before=input.dataset.before,title=input.value.trim()||t('新しい楽譜');if(title!==before){remember(snapshot());metadata=titleMetadata();}setTitle(title);if(title!==before)renderOutput();}
$('scoreTitle').addEventListener('input',renderOutput);
$('scoreTitle').addEventListener('blur',commitTitle);
$('scoreTitle').addEventListener('keydown',event=>{if(event.isComposing||!['Enter','Escape'].includes(event.key))return;event.preventDefault();if(event.key==='Escape')setTitle($('scoreTitle').dataset.before);$('scoreTitle').blur();renderOutput();});
function outputMetadata(){return Object.fromEntries(Object.entries(titleMetadata()).filter(([key])=>!['song_id','label','label_ja','label_en','source','listen','detail','work_id','steps_per_quarter','time_signature','arranged_for','reading_ja','category','composer','composer_ja','composer_en'].includes(key)));}
function getCell(step,midi){return cells.get(`${step}:${midi}`);}
function updateCell(cell,on){
  const midi=Number(cell.dataset.midi),allowed=ALLOWED.has(midi);
  cell.classList.toggle('active',on&&allowed);cell.classList.toggle('outside',on&&!allowed);
  cell.setAttribute('aria-pressed',String(on));cell.setAttribute('aria-selected','false');
  cell.setAttribute('aria-label',t('cellLabel',{note:noteName(midi),step:Number(cell.dataset.step)+1})+(allowed?'':t('outsideLabel'))+(on?t('noteOnLabel'):''));
}
function ensureStepVisible(step){const viewport=$('rollViewport'),width=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell'))||30,key=$('roll').firstElementChild.firstElementChild.getBoundingClientRect().width,left=step*width;if(left<viewport.scrollLeft)viewport.scrollLeft=left;else if(left+width>viewport.scrollLeft+viewport.clientWidth-key)viewport.scrollLeft=Math.max(0,left-viewport.clientWidth+key+width);renderGrid();}
function focusCell(cell,focus=false){
  if(focusedCell)focusedCell.tabIndex=-1;focusedCell=cell;if(!cell)return;
  cell.tabIndex=0;currentCell={step:Number(cell.dataset.step),midi:Number(cell.dataset.midi)};if(focus){cell.focus({preventScroll:true});cell.scrollIntoView({block:'nearest',inline:'nearest'});}
}
function renderGrid(){
  const began=performance.now(),roll=$('roll'),viewport=$('rollViewport'),subdivision=Number($('subdivision').value),width=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell'))||30;
  const supported=[...ALLOWED],lo=$('showAll').checked?21:Math.max(21,Math.min(...supported)),hi=$('showAll').checked?108:Math.min(108,Math.max(...supported));
  pitches=Array.from({length:hi-lo+1},(_,i)=>hi-i);
  const first=Math.min(length-1,Math.max(0,Math.floor(viewport.scrollLeft/width)-3)),last=Math.min(length-1,Math.ceil((viewport.scrollLeft+viewport.clientWidth)/width)+3);
  if(gridNotes!==notes||gridNoteCount!==notes.length){occupied=new Set(notes.map(keyOf));gridNotes=notes;gridNoteCount=notes.length;}
  const signature=[first,last,length,lo,hi,subdivision,beatsPerBar,instrument.id,currentLanguage()].join(':');
  if(signature!==gridSignature){
    gridSignature=signature;cells.clear();headers.clear();const fragment=document.createDocumentFragment();
    for(const midi of [null,...pitches]){
      const header=midi===null,allowed=header||ALLOWED.has(midi),black=!header&&noteName(midi).includes('#'),row=document.createElement('div');row.className='grid-row'+(header?' header-row':!allowed?' unavailable':'');row.setAttribute('role','row');if(!header)row.dataset.midi=midi;
      const key=document.createElement('div');key.className='key'+(black?' black':'')+(!allowed?' unavailable':'');key.setAttribute('role',header?'columnheader':'rowheader');
      if(header)key.textContent=t('音 / 拍');
      else if(allowed){const button=document.createElement('button');button.className='key-preview';button.dataset.midi=midi;button.textContent=noteName(midi);button.setAttribute('aria-label',t('previewNote',{note:noteName(midi)}));button.title=t('previewNote',{note:noteName(midi)});key.append(button);}
      else{key.textContent=noteName(midi);key.setAttribute('aria-label',noteName(midi)+t('outsideLabel'));}
      row.append(key);
      const spacer=size=>{const space=document.createElement('div');space.className='grid-spacer';space.style.flex=`0 0 ${size*width}px`;space.setAttribute('aria-hidden','true');row.append(space);};
      spacer(first);
      for(let step=first;step<=last;step++){
        const cell=document.createElement('button');cell.dataset.step=step;cell.tabIndex=-1;cell.setAttribute('role',header?'columnheader':'gridcell');
        cell.className=header?'step-label':'cell'+(black?' black':'')+(!allowed?' unavailable':'');
        cell.classList.toggle('beat',step%subdivision===0);cell.classList.toggle('bar',!!beatsPerBar&&step%(subdivision*beatsPerBar)===0);
        if(header){cell.textContent=step%subdivision===0?String(Math.floor(step/subdivision)+1):'';cell.setAttribute('aria-label',t('selectStepAt',{step:step+1}));cell.title=t('selectStepAt',{step:step+1});headers.set(step,cell);}
        else{cell.dataset.midi=midi;updateCell(cell,occupied.has(`${step}:${midi}`));cells.set(`${step}:${midi}`,cell);}row.append(cell);
      }
      spacer(length-last-1);fragment.append(row);
    }
    roll.replaceChildren(fragment);roll.setAttribute('aria-rowcount',pitches.length+1);roll.setAttribute('aria-colcount',length+1);
  }else for(const [key,cell]of cells){const on=occupied.has(key);if(cell.getAttribute('aria-pressed')!==String(on))updateCell(cell,on);}
  selectStart(Math.min(startStep,length-1));focusCell(getCell(currentCell.step,currentCell.midi)??getCell(Math.min(last,Math.ceil(viewport.scrollLeft/width)),Math.min(hi,Math.max(lo,currentCell.midi))));$('extend').disabled=length+4>MAX_STEPS;$('shrink').disabled=length<=1;renderNoteSelection();
  renderTimeSelection();if(player)markStep(player.visual,true);
  roll.dataset.renderMs=(performance.now()-began).toFixed(2);roll.dataset.cells=String(cells.size);
}
$('rollViewport').addEventListener('scroll',()=>{if(!renderFrame)renderFrame=requestAnimationFrame(()=>{renderFrame=0;renderGrid();});});
window.addEventListener('resize',()=>{gridSignature='';renderGrid();});
function markStep(step,on){if(step<0)return;headers.get(step)?.classList.toggle('playing',on);for(const midi of pitches)getCell(step,midi)?.classList.toggle('playing',on);}
function selectStart(step){for(const [position,on]of[[startStep,false],[step,true]]){const cell=headers.get(position);if(cell){cell.classList.toggle('selected',on);cell.setAttribute('aria-selected',String(on));cell.tabIndex=on?0:-1;}}startStep=step;}
function renderOutput(){
  const outside=notes.filter(note=>!ALLOWED.has(note.midi));$('noteStats').textContent=t('noteStats',{notes:notes.length,steps:length});
  try{$('txtPreview').value=serialize(notes.filter(note=>ALLOWED.has(note.midi)),length,stepInterval(),outputMetadata());}catch(error){$('txtPreview').value='';showError(error.message);}
  $('exportWarning').hidden=!outside.length;
  $('exportWarning').textContent=t('omittedWarning',{count:outside.length});
  $('unsupportedPanel').hidden=!outside.length;
}
function render(){renderGrid();renderOutput();}
let noteSelection=new Set(),selectionScore=notes,noteGesture=null,suppressNoteClick=false,timeSelection=null,timeSelectionScore=notes;
const selectionCells=new Set(),moveCells=new Set();
function clearTimeSelection(){if(noteGesture?.kind==='time')cancelNoteGesture();timeSelection=null;renderTimeSelection();}
function renderTimeSelection(){
  if(timeSelectionScore!==notes)timeSelection=null;
  const selected=step=>!!timeSelection&&step>=timeSelection.from&&step<timeSelection.to;
  for(const cell of cells.values()){const on=selected(Number(cell.dataset.step));cell.classList.toggle('time-selected',on);cell.setAttribute('aria-selected',String(on||cell.classList.contains('note-selected')));}
  for(const [step,cell]of headers){const on=selected(step);cell.classList.toggle('time-selected',on);cell.setAttribute('aria-selected',String(on||step===startStep));}
  $('deleteRange').disabled=$('collapseRange').disabled=!timeSelection;
}
function selectTimeRange(first,last=first){
  timeSelection={from:Math.max(0,Math.min(first,last)),to:Math.min(length,Math.max(first,last)+1)};timeSelectionScore=notes;renderTimeSelection();
}
function deleteTimeRange(closeGap){
  if(!timeSelection)return;const {from,to}=timeSelection,count=to-from;
  cancelImport();stopPlayback();remember();notes=notes.filter(note=>note.step<from||note.step>=to);
  if(closeGap){notes=notes.map(note=>({...note,step:note.step>=to?note.step-count:note.step}));length=Math.max(1,length-count);}
  sourceMidi=null;appliedMidiSettings=null;$('midiPanel').hidden=true;currentCell.step=Math.min(from,length-1);clearTimeSelection();applyRhythm();render();ensureStepVisible(currentCell.step);selectStart(currentCell.step);headers.get(currentCell.step)?.focus();showError();
}
$('deleteRange').onclick=()=>deleteTimeRange(false);
$('collapseRange').onclick=()=>deleteTimeRange(true);
function clearMovePreview(){
  for(const cell of moveCells){cell.classList.remove('move-preview','move-invalid');}moveCells.clear();
  for(const cell of selectionCells)cell.classList.remove('moving');
}
function cancelNoteGesture(){
  const gesture=noteGesture;noteGesture=null;if(gesture){cancelAnimationFrame(gesture.frame);suppressNoteClick=true;try{$("roll").releasePointerCapture(gesture.pointerId);}catch{}if(gesture.kind==='edit')renderOutput();}
  clearMovePreview();$('selectionBox').hidden=true;$('roll').classList.remove('selecting','moving-notes');
}
function clearNoteSelection(){
  cancelNoteGesture();noteSelection.clear();selectionScore=notes;
  for(const cell of selectionCells){cell.classList.remove('note-selected');cell.setAttribute('aria-selected','false');}selectionCells.clear();
}
function cancelGestureSelection(){const gesture=noteGesture;if(!gesture)return;noteSelection=gesture.previous;cancelNoteGesture();if(gesture.kind==='time')timeSelection=null;renderNoteSelection();renderTimeSelection();}
function renderNoteSelection(){
  if(selectionScore!==notes)clearNoteSelection();
  const occupied=new Set(notes.map(keyOf));for(const key of noteSelection)if(!occupied.has(key))noteSelection.delete(key);
  for(const cell of selectionCells){cell.classList.remove('note-selected');cell.setAttribute('aria-selected','false');}selectionCells.clear();
  for(const key of noteSelection){const [step,midi]=key.split(':').map(Number),cell=getCell(step,midi);if(cell){cell.classList.add('note-selected');cell.setAttribute('aria-selected','true');selectionCells.add(cell);}}
}
function toggleNoteSelection(cell){
  clearTimeSelection();
  const key=`${cell.dataset.step}:${cell.dataset.midi}`;if(cell.getAttribute('aria-pressed')!=='true')return;
  if(noteSelection.has(key))noteSelection.delete(key);else noteSelection.add(key);renderNoteSelection();showError();
}
function selectionTarget(items,stepOffset,pitchOffset){
  const moved=items.map(note=>({step:note.step+stepOffset,midi:note.midi+pitchOffset}));
  const valid=moved.every(note=>note.step>=0&&note.step<length&&note.midi>=21&&note.midi<=108);
  return {moved,valid};
}
function moveNoteSelection(items,stepOffset,pitchOffset){
  if(!items.length||!stepOffset&&!pitchOffset)return;
  const {moved,valid}=selectionTarget(items,stepOffset,pitchOffset);
  if(!valid){showError('楽譜の88鍵とステップ範囲内へ移動してください。');return;}
  const selected=new Set(items.map(keyOf)),map=new Map(notes.filter(note=>!selected.has(keyOf(note))).map(note=>[keyOf(note),note]));
  remember();for(const note of moved)map.set(keyOf(note),note);notes=[...map.values()];selectionScore=notes;noteSelection=new Set(moved.map(keyOf));
  currentCell={...moved[0]};if(!pitches.includes(currentCell.midi))$('showAll').checked=true;const target={...currentCell};render();ensureStepVisible(target.step);focusCell(getCell(target.step,target.midi),true);showError();
}
function transposeScore(amount,all=false){
  if(!Number.isInteger(amount)||Math.abs(amount)>127)throw new Error('移調は−127〜＋127の整数で指定してください。');
  if(!amount)return;
  const partial=!all&&(noteSelection.size>0||timeSelection!==null),items=notes.filter(note=>!partial||(noteSelection.size?noteSelection.has(keyOf(note)):note.step>=timeSelection.from&&note.step<timeSelection.to));
  if(!items.length)return;
  const moved=convertScore({notes:items,length,metadata},{subdivision:rhythmMetadata(metadata).subdivision,transpose:amount}).notes;
  const selected=new Set(items.map(keyOf)),map=new Map(notes.filter(note=>!selected.has(keyOf(note))).map(note=>[keyOf(note),note]));for(const note of moved)map.set(keyOf(note),note);
  if(partial||workerRequests.size||!$('cancelImport').hidden)cancelImport();else sampleRequest++;
  stopPlayback();remember();notes=[...map.values()];
  if(partial){
    sourceMidi=null;appliedMidiSettings=null;$('midiPanel').hidden=true;
    if(noteSelection.size){selectionScore=notes;noteSelection=new Set(moved.map(keyOf));if(moved.some(note=>note.midi>=21&&note.midi<=108&&!pitches.includes(note.midi)))$('showAll').checked=true;}
    if(timeSelection)timeSelectionScore=notes;
  }else if(sourceMidi){appliedMidiSettings={...appliedMidiSettings,transpose:appliedMidiSettings.transpose+amount};updateMidiRecommendation();}
  render();showError();
}
for(const [id,direction]of [['transposeDown',-1],['transposeUp',1]])$(id).onclick=event=>{try{transposeScore(direction*(event.shiftKey?12:1));}catch(error){showError(error.message);}};
function gridRect(step,midi){const viewport=$('rollViewport'),rect=viewport.getBoundingClientRect(),row=[...$('roll').children].find(row=>Number(row.dataset.midi)===midi),key=row.firstElementChild.getBoundingClientRect(),bounds=row.getBoundingClientRect(),width=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell'))||30;const left=rect.left+key.width+step*width-viewport.scrollLeft;return {left,right:left+width,top:bounds.top,bottom:bounds.bottom,width};}
function gesturePosition(event){
  const viewport=$('rollViewport'),rect=viewport.getBoundingClientRect(),key=$('roll').children[1].children[0].getBoundingClientRect(),width=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell'))||30;
  const x=Math.max(rect.left+key.width,Math.min(rect.right-1,event.clientX));
  const step=Math.max(0,Math.min(length-1,Math.floor((x-rect.left-key.width+viewport.scrollLeft)/width)));
  const rows=Array.from($('roll').children).slice(1);let midi=pitches.at(-1);
  for(const [index,row]of rows.entries())if(event.clientY<row.getBoundingClientRect().bottom){midi=pitches[index];break;}
  return {step,midi};
}
function updateNoteGesture(scroll=true){
  const gesture=noteGesture;if(!gesture)return;
  if(gesture.score!==notes){clearNoteSelection();return;}
  if(gesture.kind==='preview'){
    const key=document.elementFromPoint(gesture.x,gesture.y)?.closest('.key-preview');
    if(!key){gesture.last=null;return;}
    const midi=Number(key.dataset.midi);
    if(midi!==gesture.last){
      const from=gesture.last??midi,distance=Math.abs(midi-from);
      for(let i=distance?1:0;i<=distance;i++){const pitch=from+Math.sign(midi-from)*i;if(ALLOWED.has(pitch))void previewTone(pitch);}
      gesture.last=midi;
    }
    return;
  }
  if(gesture.kind==='time'){gesture.moved ||= Math.abs(gesture.x-gesture.startX)>=3;if(!gesture.moved)return;if(!$('roll').hasPointerCapture(gesture.pointerId))$('roll').setPointerCapture(gesture.pointerId);}
  else if(gesture.kind!=='edit'){
    const origin=gesture.origin;
    gesture.moved ||= Math.hypot(gesture.x-gesture.startX,gesture.y-gesture.startY)>=10&&(gesture.x<origin.left||gesture.x>=origin.right||gesture.y<origin.top||gesture.y>=origin.bottom);
    if(!gesture.moved)return;
  }
  const viewport=$('rollViewport'),rect=viewport.getBoundingClientRect(),before=viewport.scrollLeft,keyWidth=$('roll').children[1].children[0].getBoundingClientRect().width;
  if(scroll){if(gesture.x>rect.right-24)viewport.scrollLeft+=12;else if(gesture.x<rect.left+keyWidth+24)viewport.scrollLeft-=12;}
  if(gesture.kind==='time')selectTimeRange(gesture.anchor.step,gesturePosition({clientX:gesture.x,clientY:gesture.y}).step);
  else if(gesture.kind==='edit'){
    const cell=document.elementFromPoint(gesture.x,gesture.y)?.closest('.cell');
    if(cell){
      const position={step:Number(cell.dataset.step),midi:Number(cell.dataset.midi)},from=gesture.last??position,distance=Math.max(Math.abs(position.step-from.step),Math.abs(position.midi-from.midi));
      for(let i=0;i<=distance;i++){
        const target=getCell(Math.round(from.step+(position.step-from.step)*(distance?i/distance:0)),Math.round(from.midi+(position.midi-from.midi)*(distance?i/distance:0)));
        if(target&&!target.disabled)paint(target,gesture.on,false);
      }
      gesture.last=position;gesture.score=selectionScore=notes;focusCell(cell);
    }else gesture.last=null;
  }else{
    const position=gesturePosition({clientX:gesture.x,clientY:gesture.y});gesture.stepOffset=position.step-gesture.anchor.step;gesture.pitchOffset=position.midi-gesture.anchor.midi;
    if(gesture.kind==='select'){
      const loStep=Math.min(position.step,gesture.anchor.step),hiStep=Math.max(position.step,gesture.anchor.step),loMidi=Math.min(position.midi,gesture.anchor.midi),hiMidi=Math.max(position.midi,gesture.anchor.midi);
      noteSelection=new Set(gesture.previous);
      for(const note of notes)if(note.step>=loStep&&note.step<=hiStep&&note.midi>=loMidi&&note.midi<=hiMidi)noteSelection.add(keyOf(note));renderNoteSelection();
      const a=gridRect(loStep,hiMidi),b=gridRect(hiStep,loMidi),box=$('selectionBox');
      box.hidden=false;Object.assign(box.style,{left:`${a.left-rect.left+viewport.scrollLeft}px`,top:`${a.top-rect.top}px`,width:`${b.right-a.left}px`,height:`${b.bottom-a.top}px`});
    }else{
      clearMovePreview();const {moved,valid}=selectionTarget(gesture.items,gesture.stepOffset,gesture.pitchOffset);
      if(gesture.stepOffset||gesture.pitchOffset){
        for(const cell of selectionCells)cell.classList.add('moving');
        for(const note of moved){const cell=getCell(note.step,note.midi);if(cell){cell.classList.add('move-preview');cell.classList.toggle('move-invalid',!valid);moveCells.add(cell);}}
      }
    }
  }
  if(scroll&&viewport.scrollLeft!==before)scheduleNoteGesture();
}
function scheduleNoteGesture(){
  if(noteGesture&&!noteGesture.frame)noteGesture.frame=requestAnimationFrame(()=>{if(noteGesture){noteGesture.frame=0;updateNoteGesture();}});
}
function beginNoteGesture(event){
  suppressNoteClick=false;if(event.button!==0)return;
  const header=event.target.closest('.step-label');
  if(header){event.preventDefault();stopPlayback();clearNoteSelection();const step=Number(header.dataset.step);clearTimeSelection();selectStart(step);header.focus({preventScroll:true});noteGesture={kind:'time',cell:header,anchor:{step},previous:new Set(),score:notes,pointerId:event.pointerId,startX:event.clientX,x:event.clientX,y:event.clientY,moved:false,frame:0};return;}
  if(event.pointerType==='touch')return;
  const key=event.target.closest('.key-preview');
  if(key){
    const midi=Number(key.dataset.midi);if(!ALLOWED.has(midi))return;
    event.preventDefault();cancelNoteGesture();suppressNoteClick=false;
    noteGesture={kind:'preview',cell:key,previous:new Set(noteSelection),score:notes,pointerId:event.pointerId,x:event.clientX,y:event.clientY,last:midi,frame:0};
    key.focus({preventScroll:true});$('roll').setPointerCapture(event.pointerId);void previewTone(midi);return;
  }
  const cell=event.target.closest('.cell');if(!cell)return;
  clearTimeSelection();
  event.preventDefault();stopPlayback();cancelNoteGesture();suppressNoteClick=false;
  const anchor={step:Number(cell.dataset.step),midi:Number(cell.dataset.midi)},previous=new Set(noteSelection),has=cell.getAttribute('aria-pressed')==='true';
  const kind=!event.shiftKey?'edit':has&&noteSelection.has(keyOf(anchor))?'move':'select';
  if(kind==='edit'){clearNoteSelection();remember();paint(cell,!has,false);selectionScore=notes;}
  noteGesture={kind,cell,origin:cell.getBoundingClientRect(),anchor,previous:kind==='edit'?new Set():previous,on:!has,last:anchor,items:notes.filter(note=>noteSelection.has(keyOf(note))),score:notes,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,moved:false,stepOffset:0,pitchOffset:0,frame:0};
  renderNoteSelection();focusCell(cell,true);$('roll').setPointerCapture(event.pointerId);$('roll').classList.toggle('shift-editing',!!event.shiftKey);
  if(kind!=='edit')$('roll').classList.add(kind==='select'?'selecting':'moving-notes');
}
function finishNoteGesture(event){
  const gesture=noteGesture;if(!gesture||gesture.pointerId!==event.pointerId)return;if(gesture.score!==notes){clearNoteSelection();return;}
  gesture.x=event.clientX;gesture.y=event.clientY;updateNoteGesture(false);cancelNoteGesture();suppressNoteClick=gesture.kind==='preview'||gesture.kind==='edit'||gesture.moved;
  if(gesture.kind==='time'){suppressNoteClick=true;headers.get(gesture.anchor.step)?.focus({preventScroll:true});return;}
  if(gesture.kind==='preview')return;
  if(gesture.kind==='edit'){focusCell(getCell(currentCell.step,currentCell.midi),true);return;}
  if(!gesture.moved){toggleNoteSelection(gesture.cell);suppressNoteClick=true;return;}
  if(gesture.kind==='move'){moveNoteSelection(gesture.items,gesture.stepOffset,gesture.pitchOffset);clearNoteSelection();}
  else showError();
}
function selectionKey(event,cell){
  if(event.key==='Escape'){event.preventDefault();clearNoteSelection();showError();return true;}
  if(event.shiftKey&&['Enter',' '].includes(event.key)){event.preventDefault();toggleNoteSelection(cell);return true;}
  if(!noteSelection.size||event.ctrlKey||event.metaKey||event.altKey)return false;
  const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
  if(direction&&event.shiftKey){event.preventDefault();stopPlayback();moveNoteSelection(notes.filter(note=>noteSelection.has(keyOf(note))),...direction);return true;}
  if(['Delete','Backspace'].includes(event.key)){event.preventDefault();stopPlayback();remember();notes=notes.filter(note=>!noteSelection.has(keyOf(note)));clearNoteSelection();render();showError();return true;}
  return false;
}
function paint(cell,on,output=true){
  const step=Number(cell.dataset.step),midi=Number(cell.dataset.midi),key=`${step}:${midi}`;
  const has=notes.some(note=>keyOf(note)===key);if(has===on)return;
  if(on&&notes.length>=MAX_NOTES){showError('ノート数の上限（100,000音）を超えています。');return;}
  if(on){notes.push({step,midi});if(ALLOWED.has(midi))void previewTone(midi);}else notes=notes.filter(note=>keyOf(note)!==key);
  updateCell(cell,on);if(output)renderOutput();
}
$('roll').addEventListener('pointerdown',beginNoteGesture);
window.addEventListener('keydown',event=>{
  if(event.key==='Shift')$('roll').classList.add('shift-editing');if(event.target.closest?.('[popover]'))return;if(event.key==='Escape'&&timeSelection){event.preventDefault();clearTimeSelection();showError();}
  if(timeSelection&&!event.defaultPrevented&&!event.isComposing&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.target.closest?.('input,textarea,select,[contenteditable]')&&['Delete','Backspace'].includes(event.key)){event.preventDefault();deleteTimeRange(event.shiftKey);}
});
window.addEventListener('keyup',event=>{if(event.key==='Shift')$('roll').classList.remove('shift-editing');});
window.addEventListener('blur',()=>{$('roll').classList.remove('shift-editing');});
window.addEventListener('pointermove',event=>{if(!noteGesture||noteGesture.pointerId!==event.pointerId)return;noteGesture.x=event.clientX;noteGesture.y=event.clientY;if(noteGesture.kind==='edit'||noteGesture.kind==='preview')updateNoteGesture();else scheduleNoteGesture();});
window.addEventListener('pointerup',finishNoteGesture);window.addEventListener('pointercancel',event=>{if(noteGesture&&noteGesture.pointerId===event.pointerId)cancelGestureSelection();});
$('roll').addEventListener('lostpointercapture',()=>{if(noteGesture&&!$('roll').hasPointerCapture(noteGesture.pointerId))cancelGestureSelection();});
$('roll').addEventListener('click',event=>{if(suppressNoteClick&&event.detail!==0){suppressNoteClick=false;return;}const key=event.target.closest('.key-preview');if(key){const midi=Number(key.dataset.midi);if(ALLOWED.has(midi))void previewTone(midi);return;}const header=event.target.closest('.step-label');if(header){stopPlayback();clearNoteSelection();const step=Number(header.dataset.step);clearTimeSelection();selectStart(step);return;}const cell=event.target.closest('.cell');if(!cell)return;clearTimeSelection();if(event.shiftKey){toggleNoteSelection(cell);return;}clearNoteSelection();stopPlayback();remember();paint(cell,cell.getAttribute('aria-pressed')!=='true');focusCell(cell,true);});
$('roll').addEventListener('keydown',event=>{const header=event.target.closest('.step-label');if(header){const step=Number(header.dataset.step);if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const next=Math.max(0,Math.min(length-1,step+(event.key==='ArrowLeft'?-1:1)));stopPlayback();clearNoteSelection();clearTimeSelection();selectStart(next);ensureStepVisible(next);headers.get(next)?.focus();return;}const cell=event.target.closest('.cell');if(!cell)return;if(selectionKey(event,cell))return;let step=Number(cell.dataset.step),midi=Number(cell.dataset.midi);if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();if(event.key==='ArrowLeft')step--;if(event.key==='ArrowRight')step++;if(event.key==='ArrowUp')midi++;if(event.key==='ArrowDown')midi--;if(step<0||step>=length||!pitches.includes(midi))return;ensureStepVisible(step);focusCell(getCell(step,midi),true);});
for(const [id,delta] of [['extend',4],['shrink',-1]])$(id).onclick=()=>{
  if(length+delta<1||length+delta>MAX_STEPS)return;
  stopPlayback();remember();length+=delta;notes=notes.filter(note=>note.step<length);currentCell.step=Math.min(currentCell.step,length-1);
  render();$('rollViewport').scrollLeft=$('rollViewport').scrollWidth;
  showError();
};
function undo(){
  const previous=history.pop();if(!previous)return;cancelImport();stopPlayback();({notes,length,beatsPerBar,sourceMidi,appliedMidiSettings,currentCell,metadata,exactStepMs}=previous);
  for(const [id,value]of Object.entries(previous.values))$(id).value=value;
  setTitle(localized(metadata,'title',t('新しい楽譜')));$('midiPanel').hidden=!sourceMidi;if(sourceMidi){renderTracks(appliedMidiSettings.tracks);void refreshRecommendation();}render();$('rollViewport').scrollLeft=previous.scrollLeft;showError();
}
window.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){if(document.activeElement===$('scoreTitle'))return;event.preventDefault();undo();}});
$('reset').onclick=()=>{cancelImport();stopPlayback();remember();notes=[];length=32;metadata={time_signature:'4/4'};exactStepMs=125;beatsPerBar=4;currentCell={step:0,midi:72};sourceMidi=null;appliedMidiSettings=null;$('midiPanel').hidden=true;$('txtPreviewPanel').open=false;setTitle(t('新しい楽譜'));$('bpm').value=120;setSubdivision(4);render();$('rollViewport').scrollLeft=0;showError();};
function setSubdivision(value){let option=[...$('subdivision').options].find(option=>Number(option.value)===value);if(!option){option=document.createElement('option');option.value=value;option.dataset.custom='true';$('subdivision').append(option);}if(option.dataset.custom)option.textContent=t('customSubdivision',{count:value});$('subdivision').value=value;}
function applyRhythm(){const rhythm=rhythmMetadata(metadata);beatsPerBar=rhythm.beatsPerBar;setSubdivision(rhythm.subdivision);$('bpm').value=Math.max(1,Math.round(60000/exactStepMs/rhythm.subdivision));}
function populateDefinitions(){
  const language=currentLanguage();$('instrument').replaceChildren();for(const item of definitions.instruments){const option=document.createElement('option');option.value=item.id;option.textContent=item.name[language];$('instrument').append(option);}$('instrument').value=instrument.id;
  $('language').value=language;
}
$('instrument').onchange=()=>{if(workerRequests.size||!$('cancelImport').hidden)cancelImport();sampleRequest++;stopPlayback();instrument=definitions.instruments.find(item=>item.id===$('instrument').value);ALLOWED=instrument.allowed;soundset=definitions.soundsets.find(item=>item.id===instrument.defaultSoundset);audioBuffers=new Map();populateDefinitions();populateTemplates();gridSignature='';render();if(sourceMidi)void refreshRecommendation();};
$('showAll').onchange=()=>{gridSignature='';renderGrid();};
$('language').onchange=async()=>{
  $('language').disabled=true;stopPlayback();
  try{await loadLanguage($('language').value);translatePage();setSubdivision(Number($('subdivision').value));setTitle(localized(metadata,'title',t('新しい楽譜')));populateDefinitions();populateTemplates();if(sourceMidi){renderTracks(midiSettings().tracks);updateMidiRecommendation();}$('errorMessage').textContent='';gridSignature='';render();audioSaveButton(!!audioExportJob);}
  catch(error){showError(error.message);}finally{$('language').disabled=false;}
};
function populateTemplates(){
  const menu=$('templateSongs'),sizes=new Map(definitions.instruments.map(item=>[item.arrangedFor,item.allowed.size]));menu.replaceChildren();
  const language=currentLanguage(),collator=new Intl.Collator(language),sortName=song=>language==='ja'?song.reading_ja||localized(song,'title'):localized(song,'title');
  const songs=catalog.songs.map(song=>({...song,versions:song.versions.filter(item=>item.usedNotes.every(note=>ALLOWED.has(note)))})).filter(song=>song.versions.length).sort((a,b)=>collator.compare(sortName(a),sortName(b))||collator.compare(localized(a,'composer'),localized(b,'composer')));
  for(const song of songs){
    const versions=song.versions;
    versions.sort((a,b)=>(a.arranged_for!==instrument.arrangedFor)-(b.arranged_for!==instrument.arrangedFor)||(a.arranged_for==='xylophone32')-(b.arranged_for==='xylophone32')||sizes.get(b.arranged_for)-sizes.get(a.arranged_for)||a.arranged_for.localeCompare(b.arranged_for));
    const best=versions[0],row=document.createElement('div');row.className='template-song';
    const title=document.createElement('button');title.className='template-title';title.dataset.sample=best.id;title.append(document.createTextNode(localized(song,'title',best.file)+' '));
    const composer=document.createElement('span');composer.className='template-composer';composer.textContent=localized(song,'composer');title.append(composer);
    const buttons=document.createElement('div');buttons.className='template-versions';
    for(const item of versions){const button=document.createElement('button');button.className='button';button.dataset.sample=item.id;button.textContent=localized(item,'label');if(item.arranged_for===instrument.arrangedFor)button.classList.add('matching');if(item===best){button.title=t('おすすめ');button.setAttribute('aria-label',button.textContent+' ('+t('おすすめ')+')');}buttons.append(button);}
    row.dataset.search=normalizeSearch(Object.entries(song).filter(([key])=>/^(title|composer)(_|$)|^reading_ja$/.test(key)).map(([,value])=>value).join(' '));
    row.append(title,buttons);menu.append(row);
  }
  $('templateButton').disabled=!songs.length;
  $('templateSearch').placeholder=t('曲名・作曲者で検索');filterTemplates();
}
function normalizeSearch(value){return value.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g,char=>String.fromCharCode(char.charCodeAt(0)-0x60));}
function filterTemplates(){const query=normalizeSearch($('templateSearch').value.trim());let visible=0;for(const row of $('templateSongs').children){row.hidden=!row.dataset.search.includes(query);if(!row.hidden)visible++;}$('templateEmpty').hidden=!!visible;}
$('templateSearch').oninput=filterTemplates;
let sampleRequest=0;
async function loadTemplate(item){
  cancelImport();const request=++sampleRequest;
  try{const response=await fetch(`samples/${encodeURIComponent(item.file)}?v=${catalog.revision}`);if(!response.ok)throw new Error('楽譜を読み込めませんでした。');const score=parseText(await response.text());if(request!==sampleRequest)return;
    stopPlayback();remember();notes=score.notes;length=score.length;metadata=score.metadata;exactStepMs=score.stepMs;sourceMidi=null;appliedMidiSettings=null;currentCell={step:0,midi:72};$('midiPanel').hidden=true;setTitle(localized(metadata,'title',item.file));applyRhythm();$('rollViewport').scrollLeft=0;render();showError();
  }catch(error){if(request===sampleRequest)showError(error.message);}
}
$('templateMenu').onclick=event=>{const id=event.target.closest('[data-sample]')?.dataset.sample;for(const song of catalog.songs){const item=song.versions.find(version=>version.id===id);if(item){void loadTemplate(item);break;}}};
function downloadName(extension){return ($('scoreTitle').value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||t('新しい楽譜'))+'.'+extension;}
function downloadText(){try{const text=serialize(notes.filter(note=>ALLOWED.has(note.midi)),length,stepInterval(),outputMetadata());const blob=new Blob([text],{type:'text/plain;charset=utf-8'});download(blob,'txt');showError();}catch(error){showError(error.message);}}
function download(blob,extension,name=downloadName(extension)){const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').onclick=downloadText;
$('exportResonite').onclick=async()=>{
  const button=$('exportResonite');button.disabled=true;button.setAttribute('aria-busy','true');
  try{
    const text=serialize(notes.filter(note=>ALLOWED.has(note.midi)),length,stepInterval(),outputMetadata()),musicbox=instrument.id==='musicbox-30',name=downloadName('resonitepackage');
    const {resonitePackage}=await import('./resonite.js?v=9dd3671d9d373aaf');download(await resonitePackage(text,musicbox),'resonitepackage',name);showError();
  }catch(error){showError(error.message);}finally{button.disabled=false;button.removeAttribute('aria-busy');}
};
let midiLibrary;
function getMidiLibrary(){return midiLibrary??=import('./vendor/midi.js').then(()=>window.Midi).catch(error=>{midiLibrary=null;throw error;});}
$('exportMidi').onclick=async()=>{
  try{const interval=stepInterval(),subdivision=Number($('subdivision').value),score=notes.map(note=>({...note})),size=length,profile=instrument,allowed=ALLOWED,name=downloadName('mid'),signature=rhythmMetadata(metadata).signature;
    const ppq=480%subdivision===0?480:subdivision,tempo=interval*subdivision*1000;if(ppq>32767||!Number.isSafeInteger(tempo)||tempo>0xffffff||signature?.[0]>255)throw new Error('この間隔・単位・拍子はMIDIで表現できません。TXTで保存してください。');
    const Midi=await getMidiLibrary(),midi=new Midi();midi.header.fromJSON({...midi.header.toJSON(),ppq});const ticksPerStep=ppq/subdivision;
    midi.header.setTempo(60000/(interval*subdivision));if(signature)midi.header.timeSignatures=[{ticks:0,timeSignature:signature}];const track=midi.addTrack(),unique=new Map();track.name=profile.name[currentLanguage()];track.instrument.number=profile.id.startsWith('piano-')?0:profile.id.startsWith('marimba-')?12:profile.id.startsWith('xylophone-')?13:10;
    for(const note of score){validateNote(note,size);if(allowed.has(note.midi))unique.set(keyOf(note),note);}
    for(const note of [...unique.values()].sort((a,b)=>a.step-b.step||a.midi-b.midi))track.addNote({midi:note.midi,ticks:note.step*ticksPerStep,durationTicks:ticksPerStep,velocity:.8});
    track.addCC({number:123,ticks:size*ticksPerStep,value:0});download(new Blob([midi.toArray()],{type:'audio/midi'}),'mid',name);showError();
  }catch(error){showError(error.message);}
};
let sheetModule,sheetPreview,sheetPage=0;
function showSheetPage(){
  sheetModule.drawSheetPage(sheetPreview,sheetPage,$('sheetCanvas'));$('sheetPage').textContent=`${sheetPage+1} / ${sheetPreview.pages.length}`;
  $('sheetPrevious').disabled=sheetPage===0;$('sheetNext').disabled=sheetPage===sheetPreview.pages.length-1;
  $('sheetDialog').querySelector('.sheet-preview').scrollTop=0;
}
$('exportSheet').onclick=async()=>{
  const button=$('exportSheet');button.disabled=true;button.setAttribute('aria-busy','true');
  try{
    const name=downloadName('webp').replace(/\.webp$/,''),input={notes:notes.filter(note=>ALLOWED.has(note.midi)).map(note=>({...note})),length,subdivision:Number($('subdivision').value),signature:rhythmMetadata(metadata).signature,stepMs:stepInterval(),title:$('scoreTitle').value.trim()||t('新しい楽譜'),footer:t('自動生成の簡易譜面')};
    sheetModule??=await import('./sheet.js?v=49e29bb96426da46');const sheet=await sheetModule.createSheet(input);sheet.name=name;
    sheetPreview=sheet;sheetPage=0;showSheetPage();$('sheetDialog').showModal();showError();
  }catch(error){showError(error.message);}finally{button.disabled=false;button.setAttribute('aria-busy','false');}
};
$('sheetPrevious').onclick=()=>{if(sheetPage>0){sheetPage--;showSheetPage();}};
$('sheetNext').onclick=()=>{if(sheetPage<sheetPreview.pages.length-1){sheetPage++;showSheetPage();}};
$('sheetDialog').onkeydown=event=>event.stopPropagation();
$('sheetClose').onclick=()=>$('sheetDialog').close();
$('sheetDialog').addEventListener('close',()=>{sheetPreview=null;$('sheetCanvas').width=0;$('sheetCanvas').height=0;$('save').focus();});
$('sheetSave').onclick=async()=>{
  const button=$('sheetSave');button.disabled=true;
  try{const name=`${sheetPreview.name}-${String(sheetPage+1).padStart(2,'0')}.webp`,blob=await sheetModule.sheetBlob($('sheetCanvas'));download(blob,'webp',name);}catch(error){$('sheetDialog').close();showError(error.message);}finally{button.disabled=false;}
};
$('copyText').onclick=async()=>{let text;try{text=serialize(notes.filter(note=>ALLOWED.has(note.midi)),length,stepInterval(),outputMetadata());}catch(error){showError(error.message);return;}try{await navigator.clipboard.writeText(text);showError();}catch{$('txtPreviewPanel').open=true;$('txtPreview').focus();$('txtPreview').select();showError('コピーできませんでした。選択したテキストをCtrl+Cでコピーしてください。');}};
function stepInterval(){return timingFromInputs(exactStepMs);}
function timingFromInputs(interval){const bpm=Number($('bpm').value),subdivision=Number($('subdivision').value);interval??=Math.round(60000/bpm/subdivision);if(!Number.isFinite(bpm)||bpm<=0||!Number.isSafeInteger(subdivision)||subdivision<1||!Number.isSafeInteger(interval)||interval<1)throw new Error('テンポ・ステップ単位が不正です。');return interval;}
function updateTiming(event){try{stopPlayback();if(event.target.id==='bpm'){timingFromInputs();$('bpm').value=Math.max(1,Math.round(Number($('bpm').value)));exactStepMs=timingFromInputs();}else exactStepMs=timingFromInputs(Math.max(1,Math.round(exactStepMs*(Number(metadata.steps_per_quarter??4)/Number($('subdivision').value)))));metadata.steps_per_quarter=$('subdivision').value;applyRhythm();render();}catch(error){showError(error.message);}}
$('bpm').addEventListener('change',updateTiming);$('subdivision').addEventListener('change',event=>{if(sourceMidi)void applyMidiSettings();else updateTiming(event);});
function stopPlayback(){playbackRequest++;if(player){clearTimeout(player.timer);markStep(player.visual,false);player=null;}for(const voice of activeVoices){try{voice.stop();}catch{}}activeVoices.clear();selectStart(0);$('play').textContent='▶';$('play').setAttribute('aria-label',t('試聴'));$('play').title=t('試聴');$('play').setAttribute('aria-pressed','false');}
function getAudio(){
  const AudioClass=window.AudioContext||window.webkitAudioContext;if(!AudioClass)throw new Error('このブラウザでは試聴できません。');
  return audio??=new AudioClass();
}
async function resumeAudio(){await getAudio().resume();}
function loadTone(midi,selected=soundset){
  const key=`${selected.id}:${selected.revision??'1'}:${midi}`;
  const remember=buffer=>{if(selected.id===soundset.id)audioBuffers.set(midi,buffer);return buffer;};
  if(toneCache.has(key))return Promise.resolve(remember(toneCache.get(key)));
  if(!audioLoads.has(key)){
    const loading=(async()=>{
      const context=getAudio(),file=selected.files[noteName(midi)];if(!file)throw new Error('音源に対応する音がありません。');
      const path=(selected.base+file).split('/').map(encodeURIComponent).join('/'),response=await fetch(`${path}?v=${selected.revision}`);
      if(!response.ok)throw new Error(t('toneLoadError',{note:noteName(midi)}));
      let buffer;try{buffer=await context.decodeAudioData(await response.arrayBuffer());}catch{throw new Error(t('toneDecodeError',{note:noteName(midi)}));}
      toneCache.set(key,buffer);return buffer;
    })().finally(()=>audioLoads.delete(key));audioLoads.set(key,loading);
  }
  return audioLoads.get(key).then(remember);
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
  }catch(error){if(request===playbackRequest)showError(error.message);}
}
$('play').onclick=async()=>{
  if($('play').getAttribute('aria-pressed')==='true'){stopPlayback();$('rollViewport').scrollLeft=0;showError();return;}
  let request;
  try{
    const interval=stepInterval()/1000;
    if(!notes.some(note=>ALLOWED.has(note.midi)))throw new Error('試聴する音を入力してください。');
    const first=startStep;stopPlayback();selectStart(first);request=playbackRequest;$('play').textContent='■';$('play').setAttribute('aria-label',t('停止'));$('play').title=t('停止');$('play').setAttribute('aria-pressed','true');showError();await resumeAudio();if(request!==playbackRequest)return;
    const rows=new Map();for(const note of notes.filter(note=>ALLOWED.has(note.midi))){if(!rows.has(note.step))rows.set(note.step,[]);rows.get(note.step).push(note.midi);}
    await Promise.all([...new Set([...rows.values()].flat())].map(midi=>loadTone(midi)));if(request!==playbackRequest)return;
    const start=audio.currentTime+.06-first*interval;player={start,next:first,visual:-1,timer:0,end:start+length*interval};const session=player;
    const tick=()=>{
      if(player!==session)return;
      while(session.start+session.next*interval<audio.currentTime+.1){
        if(session.next>=length&&session.next%length===0&&$('loop').getAttribute('aria-pressed')!=='true')break;
        if(session.start+session.next*interval<audio.currentTime)session.start=audio.currentTime+.06-session.next*interval;
        const row=rows.get(session.next%length)||[];for(const midi of row)session.end=Math.max(session.end,playTone(midi,session.start+session.next*interval,.5/Math.sqrt(Math.max(1,row.length))));session.next++;
        if(session.next%length===0)session.end=Math.max(session.end,session.start+session.next*interval);
      }
      const elapsed=Math.floor((audio.currentTime-session.start)/interval),step=elapsed%length;
      if(elapsed>=first&&elapsed<session.next&&step!==session.visual){markStep(session.visual,false);session.visual=step;ensureStepVisible(step);markStep(step,true);}
      if(session.next>=length&&session.next%length===0&&$('loop').getAttribute('aria-pressed')!=='true'&&audio.currentTime>=session.end){stopPlayback();return;}session.timer=setTimeout(tick,25);
    };tick();
  }catch(error){if(request!==undefined&&request!==playbackRequest)return;stopPlayback();showError(error.message);}
};document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlayback();});
$('loop').onclick=()=>{$('loop').setAttribute('aria-pressed',String($('loop').getAttribute('aria-pressed')!=='true'));};
let importWorker=null,workerSourceId=null,workerSerial=0,importEpoch=0;const workerRequests=new Map();
function cancelImport(){
  importEpoch++;sampleRequest++;importWorker?.terminate();importWorker=null;workerSourceId=null;
  for(const request of workerRequests.values())request.reject(new Error('取り込みを中止しました。'));workerRequests.clear();$('cancelImport').hidden=true;$('fileInput').value='';
  if(sourceMidi&&appliedMidiSettings){setSubdivision(appliedMidiSettings.subdivision);renderTracks(appliedMidiSettings.tracks);}
}
$('cancelImport').onclick=()=>cancelImport();
function workerRequest(source,settings){
  if(!importWorker){
    importWorker=new Worker(new URL('./import-worker.js?v=40d46b720d32f182',import.meta.url),{type:'module'});
    importWorker.onmessage=({data})=>{const request=workerRequests.get(data.id);if(!request)return;workerRequests.delete(data.id);if(data.error)request.reject(new Error(data.error));else{workerSourceId=request.sourceId;request.resolve(data);}};
    importWorker.onerror=importWorker.onmessageerror=()=>{for(const request of workerRequests.values())request.reject(new Error('取り込み処理を読み込めませんでした。'));workerRequests.clear();importWorker?.terminate();importWorker=null;workerSourceId=null;};
  }
  const id=++workerSerial,message={id,sourceId:source.id,kind:source.isText?'text':'midi',allowed:[...ALLOWED],subdivision:Number($('subdivision').value),settings,length};
  if(workerSourceId!==source.id)message.buffer=source.buffer.slice(0);
  return new Promise((resolve,reject)=>{workerRequests.set(id,{resolve,reject,sourceId:source.id});importWorker.postMessage(message,message.buffer?[message.buffer]:[]);});
}
let recommendations=[];
function midiSettings(){return {tracks:sourceMidi?.isText?[]:[...$('trackList').querySelectorAll('input:checked')].map(input=>Number(input.value)),subdivision:Number($('subdivision').value),transpose:appliedMidiSettings?.transpose??0};}
function updateMidiRecommendation(){
  const settings=midiSettings(),total=sourceMidi.tracks.filter(track=>track.count).length;$('trackSummary').textContent=t('trackSummary',{count:settings.tracks.length,total});
  const best=recommendations[0];$('suggest').disabled=!best;$('suggest').textContent=t('おすすめ');if(!best)return;
  const amount=best.transpose-settings.transpose;$('suggest').dataset.transpose=amount;$('suggest').textContent=best.transpose===0?t('originalPitch'):t('recommendTranspose',{amount:(amount>0?'+':'')+amount});$('suggest').title=t('omittedCount',{count:best.outside});$('suggest').disabled=!notes.length||amount===0;
}
async function refreshRecommendation(){if(!sourceMidi)return;const epoch=++importEpoch;try{const data=await workerRequest(sourceMidi,appliedMidiSettings);if(epoch!==importEpoch)return;recommendations=data.recommendations;updateMidiRecommendation();}catch(error){if(epoch===importEpoch)showError(error.message);}}
async function applyMidiSettings(){
  if(!sourceMidi)return;const epoch=++importEpoch;
  try{
    const settings=midiSettings();
    if(JSON.stringify(settings)===JSON.stringify(appliedMidiSettings)){updateMidiRecommendation();return;}
    timingFromInputs(exactStepMs);$('cancelImport').hidden=false;
    const data=await workerRequest(sourceMidi,settings);if(epoch!==importEpoch)return;
    const interval=timingFromInputs(Math.max(1,Math.round(exactStepMs*(Number(metadata.steps_per_quarter??4)/settings.subdivision))));
    stopPlayback();remember();notes=data.result.notes;length=data.result.length;appliedMidiSettings=settings;metadata.steps_per_quarter=String(settings.subdivision);exactStepMs=interval;currentCell.step=Math.min(currentCell.step,length-1);recommendations=data.recommendations;
    applyRhythm();render();updateMidiRecommendation();showError();
  }catch(error){if(epoch===importEpoch){setSubdivision(appliedMidiSettings.subdivision);renderTracks(appliedMidiSettings.tracks);showError(error.message);}}
  finally{if(epoch===importEpoch)$('cancelImport').hidden=true;}
}
function renderTracks(selected=null){
  $('midiTracks').hidden=sourceMidi.isText;const list=$('trackList');list.replaceChildren();
  for(const [index,track]of sourceMidi.tracks.entries()){
    if(!track.count)continue;const label=document.createElement('label');label.className='track-option';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=index;checkbox.checked=selected!==null?selected.includes(index):!track.instrument.percussion;
    const title=document.createElement('span');title.textContent=t('trackLabel',{index:index+1,name:track.name||t('名前なし'),instrument:track.instrument.name||t('楽器不明'),count:track.count})+(track.instrument.percussion?t('percussionLabel'):'');checkbox.addEventListener('change',()=>void applyMidiSettings());label.append(checkbox,title);list.append(label);
  }
}
async function importFile(file){
  cancelImport();const epoch=++importEpoch;$('cancelImport').hidden=false;showError();
  try{
    if(!file||file.size>10*1024*1024)throw new Error('MIDI・TXTは10MB以下にしてください。');if(!/\.(mid|midi|txt)$/i.test(file.name))throw new Error('MIDIまたはTXTファイルを選んでください。');
    const buffer=await file.arrayBuffer();if(epoch!==importEpoch)return;
    const source={id:++workerSerial,isText:/\.txt$/i.test(file.name),buffer,name:file.name,tracks:[]};
    const data=await workerRequest(source);if(epoch!==importEpoch)return;
    const nextMetadata={...data.summary.metadata,steps_per_quarter:String(data.settings.subdivision)};nextMetadata.title ||= localized(nextMetadata,'title',file.name.replace(/\.(mid|midi|txt)$/i,''));
    if(!source.isText&&data.summary.timeSignature)nextMetadata.time_signature=data.summary.timeSignature.join('/');rhythmMetadata(nextMetadata);
    stopPlayback();remember();source.tracks=data.summary.tracks;sourceMidi=source;appliedMidiSettings=data.settings;notes=data.result.notes;length=data.result.length;metadata=nextMetadata;exactStepMs=data.summary.stepMs;currentCell={step:0,midi:72};$('midiTracks').open=false;setTitle(localized(metadata,'title'));applyRhythm();renderTracks(data.settings.tracks);$('midiPanel').hidden=false;recommendations=data.recommendations;updateMidiRecommendation();$('rollViewport').scrollLeft=0;render();
    for(const [key,value]of Object.entries(data.timing))$('roll').dataset[key+'Ms']=value.toFixed(2);showError();
  }catch(error){if(epoch===importEpoch)showError(error.message);}finally{if(epoch===importEpoch){$('cancelImport').hidden=true;$('fileInput').value='';}}
}
$('pickFile').onclick=()=>$('fileInput').click();$('fileInput').onchange=()=>{const file=$('fileInput').files[0];if(file)void importFile(file);};
let dragDepth=0;
document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});document.addEventListener('drop',event=>{if(!event.dataTransfer?.types.includes('Files'))return;event.preventDefault();dragDepth=0;$('dropZone').classList.remove('dragover');const files=event.dataTransfer.files;if(files.length!==1){showError('MIDI・TXTファイルを1つずつドロップしてください。');return;}void importFile(files[0]);});
$('dropZone').addEventListener('dragenter',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();dragDepth++;$('dropZone').classList.add('dragover');}});$('dropZone').addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('dropZone').classList.remove('dragover');});
$('suggest').onclick=()=>{try{transposeScore(Number($('suggest').dataset.transpose),true);}catch(error){showError(error.message);}};
$('selectMelodic').onclick=()=>{renderTracks();void applyMidiSettings();};$('clearTracks').onclick=()=>{renderTracks([]);void applyMidiSettings();};
$('removeUnsupported').onclick=()=>{stopPlayback();const count=notes.filter(note=>!ALLOWED.has(note.midi)).length;if(!count)return;remember();notes=notes.filter(note=>ALLOWED.has(note.midi));render();showError();};
const modelContext=document.modelContext;
if(modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tools=[
    {name:'read_music_box_score',title:'オルゴール楽譜を読む',description:'現在の楽譜、選択楽器の対応音、ステップ数と再生間隔を返します。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({instrument:instrument.id,allowedNotes:[...ALLOWED].map(noteName),length,notes:notes.map(note=>({step:note.step,note:noteName(note.midi)})),intervalMs:stepInterval()})},
    {name:'set_music_box_notes',title:'音を入力・削除する',description:'0始まりのステップと88鍵内の音名の一覧を追加・削除し、編集画面とTXTプレビューを更新します。',inputSchema:{type:'object',properties:{notes:{type:'array',maxItems:1024,items:{type:'object',properties:{step:{type:'integer',minimum:0},note:{type:'string'},on:{type:'boolean'}},required:['step','note','on'],additionalProperties:false}}},required:['notes'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||!Array.isArray(input.notes)||input.notes.length>1024)throw new Error('入力一覧が不正です。');const changes=input.notes.map(item=>{if(!item||typeof item.on!=='boolean'||typeof item.note!=='string')throw new Error('入力が不正です。');const change={step:item.step,midi:noteNumber(item.note),on:item.on};validateNote(change,length);if(change.on&&(change.midi<21||change.midi>108))throw new Error('88鍵の範囲内で指定してください。');return change;});const map=new Map(notes.map(note=>[keyOf(note),note]));for(const change of changes){if(change.on)map.set(keyOf(change),{step:change.step,midi:change.midi});else map.delete(keyOf(change));}if(map.size>MAX_NOTES)throw new Error('ノート数の上限（100,000音）を超えています。');stopPlayback();remember();notes=[...map.values()];render();return{updated:changes.length,noteCount:notes.length};}}
  ];
  for(const tool of tools){try{Promise.resolve(modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
setTitle(t('新しい楽譜'));
translatePage();populateDefinitions();populateTemplates();render();

let audioExportJob=null;
function audioSaveButton(busy){
  const button=$('save'),label=busy?t('audioCancelLabel',{format:audioExportJob.label}):t('保存');
  button.textContent=busy?t('停止')+' ■':t('保存 ▾');button.setAttribute('aria-label',label);
  button.setAttribute('aria-busy',String(busy));button.title=label;
}
function cancelAudioExport(){
  const job=audioExportJob;if(!job)return;
  job.cancelled=true;job.reject?.(new Error('中止'));job.worker?.terminate();audioExportJob=null;
  audioSaveButton(false);
}
function audioRequest(job,message,transfer=[]){
  return new Promise((resolve,reject)=>{
    job.reject=reject;
    job.worker.onmessage=({data})=>{job.reject=null;data.error?reject(new Error(t('audioEncodeError',{format:job.label,error:t(data.error)}))):resolve(data);};
    job.worker.onerror=job.worker.onmessageerror=()=>{job.reject=null;reject(new Error(t('audioWorkerError',{format:job.label})));};
    job.worker.postMessage(message,transfer);
  });
}
async function saveAudio(format){
  if(audioExportJob){cancelAudioExport();return;}
  const label=format==='mp3'?'MP3':'OGG';
  const job={label,cancelled:false,worker:null,reject:null};audioExportJob=job;audioSaveButton(true);
  try{
    const OfflineAudio=window.OfflineAudioContext||window.webkitOfflineAudioContext;
    if(!OfflineAudio||!window.Worker)throw new Error(t('audioUnavailable',{format:label}));
    if(!Number.isInteger(length)||length<1||length>MAX_STEPS)throw new Error('ステップ数が不正です。');
    const interval=stepInterval()/1000,size=length,filename=downloadName(format),unique=new Map();
    for(const note of notes){validateNote(note,size);if(ALLOWED.has(note.midi))unique.set(keyOf(note),{...note});}
    const score=[...unique.values()].sort((a,b)=>a.step-b.step||a.midi-b.midi),counts=new Map();
    for(const note of score)counts.set(note.step,(counts.get(note.step)||0)+1);
    showError();
    const selectedSoundset=soundset,tones=new Map(await Promise.all([...new Set(score.map(note=>note.midi))].map(async midi=>[midi,await loadTone(midi,selectedSoundset)])));
    if(job.cancelled)return;
    const duration=score.reduce((end,note)=>Math.max(end,note.step*interval+tones.get(note.midi).duration),size*interval);
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
        carry=carry.filter(note=>note.step*interval+tones.get(note.midi).duration>start);
        for(const note of carry){
          const time=note.step*interval,voice=context.createBufferSource(),gain=context.createGain();
          voice.buffer=tones.get(note.midi);gain.gain.value=.5/Math.sqrt(counts.get(note.step));
          voice.connect(gain);gain.connect(context.destination);voice.start(Math.max(0,time-start),Math.max(0,start-time));
        }
        rendered=await context.startRendering();
      }catch{throw new Error(t('audioRenderError',{format:label}));}
      if(job.cancelled)return;
      const left=rendered.getChannelData(0).slice(),right=rendered.getChannelData(1).slice();
      await audioRequest(job,{type:'encode',left,right},[left.buffer,right.buffer]);
      if(job.cancelled)return;
    }
    const {blob}=await audioRequest(job,{type:'finish'});
    if(job.cancelled)return;
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){if(!job.cancelled)showError(error.message);}
  finally{job.worker?.terminate();if(audioExportJob===job){audioExportJob=null;audioSaveButton(false);}}
}
$('exportMp3').onclick=()=>saveAudio('mp3');
$('exportOgg').onclick=()=>saveAudio('ogg');

const saveMenu=$('saveMenu'),saveButton=$('save'),menus=[[saveMenu,saveButton],[$('templateMenu'),$('templateButton')]];
function positionMenu(menu,button){
  if(!menu.matches(':popover-open'))return;
  const rect=button.getBoundingClientRect(),below=rect.bottom+5;
  if(menu.id==='templateMenu')menu.style.maxHeight=Math.max(0,window.innerHeight-below-8)+'px';
  const width=menu.offsetWidth,height=menu.offsetHeight;
  menu.style.left=Math.max(8,Math.min(rect.right-width,window.innerWidth-width-8))+'px';
  if(menu.id==='templateMenu'){menu.style.top=below+'px';return;}
  menu.style.top=Math.max(8,Math.min(below+height<=window.innerHeight-8?below:rect.top-height-5,window.innerHeight-height-8))+'px';
}
saveButton.onclick=event=>{if(audioExportJob){event.preventDefault();cancelAudioExport();}};
for(const [menu,button]of menus){
  let last=false;const items=()=>[...menu.querySelectorAll('button:not(:disabled)')].filter(item=>!item.closest('[hidden]'));
  button.onkeydown=event=>{
    if(!['ArrowDown','ArrowUp'].includes(event.key)||button===saveButton&&audioExportJob)return;
    event.preventDefault();last=event.key==='ArrowUp';
    if(menu.matches(':popover-open')){const list=items();list[last?list.length-1:0]?.focus();last=false;}
    else menu.showPopover();
  };
  menu.addEventListener('toggle',event=>{
    const open=event.newState==='open';button.setAttribute('aria-expanded',String(open));
    if(open){positionMenu(menu,button);const list=items();list[last?list.length-1:0]?.focus({preventScroll:true});menu.scrollTop=last?menu.scrollHeight:0;last=false;}
    else if(menu.contains(document.activeElement))button.focus();
  });
  menu.addEventListener('click',event=>{if(event.target.closest('button')){menu.hidePopover();button.focus();}});
  menu.onkeydown=event=>{
    const list=items(),index=list.indexOf(document.activeElement);
    if(event.target===$('templateSearch')&&!['ArrowDown','ArrowUp'].includes(event.key))return;
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();list[event.key==='Home'?0:event.key==='End'?list.length-1:index<0?(event.key==='ArrowDown'?0:list.length-1):(index+(event.key==='ArrowDown'?1:-1)+list.length)%list.length]?.focus();
    }else if(event.key==='Tab'&&menu===saveMenu)menu.hidePopover();
  };
  menu.addEventListener('focusout',event=>{if(event.relatedTarget&&event.relatedTarget!==button&&!menu.contains(event.relatedTarget))menu.hidePopover();});
}
const positionMenus=()=>{for(const [menu,button]of menus)positionMenu(menu,button);};
window.addEventListener('resize',positionMenus);
window.addEventListener('scroll',positionMenus,true);
