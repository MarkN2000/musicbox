import {noteName,validateDefinitions} from './core.js';
import {demoScore,validateScore,serializeMml,secondsAt,tickAt,moveNotes,resizeNotes,scorePosition} from './mml-score.js';

const $=id=>document.getElementById(id),clone=value=>structuredClone(value),ROW=24,KEY=72;
let HIGH=108,LOW=21;
let score=demoScore(),selected=new Set(),mode='draw',px=96,cursor=0,gesture=null;
let history=[],future=[],sourceText=null,textEditing=false,clipboard=null,worker=null,importTimer=null;
let audio,playing=null,playEpoch=0,tempoIndex=null,signatureIndex=null;
const buffers=new Map(),voices=new Map();
const response=await Promise.all(['instruments.json','audio/soundsets.json'].map(async path=>{const r=await fetch(path);if(!r.ok)throw Error('楽器の設定を取得できません。');return r.json();}));
const defs=validateDefinitions(...response);let instrument=defs.instruments.find(i=>i.id==='piano-88')??defs.instruments.find(i=>i.arrangedFor==='piano88');
if(!instrument)instrument=defs.instruments[0];
for(const item of defs.instruments)$('instrument').add(new Option(item.name.ja,item.id));
$('instrument').value=instrument.id;
function error(message=''){$('error').textContent=message;}
function attempt(fn){try{fn();error();}catch(e){error(e.message);render();}}
function snapshot(){return {score:clone(score),sourceText,cursor};}
function editable(){if(textEditing){error('MMLの編集を適用または取消ししてください。');return false;}if(sourceText!==null){error('「ノート編集へ」で展開したMMLに切り替えてください。');return false;}return true;}
function remember(before){history.push(before);if(history.length>50)history.shift();future=[];}
function change(fn){if(!editable())return;const before=snapshot();stop();try{fn();validateScore(score);if(JSON.stringify(before.score)!==JSON.stringify(score))remember(before);error();render();}catch(e){restore(before);error(e.message);}}
function restore(s){score=clone(s.score);sourceText=s.sourceText;cursor=s.cursor;selected.clear();render();}
function undo(redo=false){if(textEditing||gesture)return;const list=redo?future:history;if(!list.length)return;stop();(redo?history:future).push(snapshot());restore(list.pop());error();}
function gridTicks(){return score.ppq*Number($('grid').value);}
function stepTick(t){return Math.round(t);}
function snapPosition(t,enabled=true){return Math.max(0,stepTick(enabled?Math.round(t/gridTicks())*gridTicks():t));}
function x(t){return t/score.ppq*px;}
function point(e){const b=$('noteArea').getBoundingClientRect();return {tick:Math.max(0,(e.clientX-b.left)/px*score.ppq),midi:Math.max(LOW,Math.min(HIGH,HIGH-Math.floor((e.clientY-b.top)/ROW))),x:e.clientX-b.left,y:e.clientY-b.top};}
function chosen(){return score.notes.filter(n=>selected.has(n.id));}
function nextId(){return Math.max(0,...score.notes.map(n=>n.id))+1;}
function labelPosition(t){const p=scorePosition(score,t);return `${p.bar}:${p.beat.toFixed(2).replace(/\.00$/,'')}`;}
function source(){return sourceText??serializeMml(score);}
function renderNotes(){
  const viewport=$('viewport'),from=Math.max(0,(viewport.scrollLeft-KEY-200)/px*score.ppq),to=(viewport.scrollLeft+viewport.clientWidth+200)/px*score.ppq;
  const fragment=document.createDocumentFragment();
  for(const n of score.notes){
    if(n.tick+n.duration<from||n.tick>to||n.midi<LOW||n.midi>HIGH)continue;
    const el=document.createElement('div');el.className='midi-note';
    el.classList.toggle('selected',selected.has(n.id));el.classList.toggle('outside',!instrument.allowed.has(n.midi));
    el.dataset.id=n.id;el.dataset.tick=n.tick;el.dataset.duration=n.duration;el.dataset.midi=n.midi;el.dataset.part=n.part;
    el.style.cssText=`left:${x(n.tick)}px;top:${(HIGH-n.midi)*ROW+2}px;width:${Math.max(4,x(n.duration))}px`;
    el.setAttribute('role','button');el.tabIndex=0;el.setAttribute('aria-selected',String(selected.has(n.id)));
    el.setAttribute('aria-label',`${noteName(n.midi)} ${labelPosition(n.tick)} 長さ ${+(n.duration/score.ppq).toFixed(4)}♩ 強さ${n.velocity}`);el.title=el.getAttribute('aria-label');
    el.append(document.createTextNode(noteName(n.midi)));const handle=document.createElement('span');handle.className='handle';handle.setAttribute('aria-hidden','true');el.append(handle);fragment.append(el);
  }
  $('notes').replaceChildren(fragment);
}
function renderTimeline(){
  const width=x(score.end),head=98;$('viewport').style.setProperty('--head-height',`${head}px`);
  $('canvas').style.cssText=`width:${width+KEY+24}px;height:${(HIGH-LOW+1)*ROW+head}px`;
  $('noteArea').style.cssText=`width:${width}px;height:${(HIGH-LOW+1)*ROW}px`;$('ruler').style.width=width+'px';$('tempoLane').style.width=width+'px';$('signatureLane').style.width=width+'px';
  const viewport=$('viewport'),first=Math.max(0,Math.floor((viewport.scrollLeft-KEY)/px)),last=Math.min(score.end/score.ppq,Math.ceil((viewport.scrollLeft+viewport.clientWidth)/px)+1);
  let grid=Number($('grid').value);while(grid*px<6)grid*=2;
  const svg=[],labels=document.createDocumentFragment();
  // 補助線を間引いてもスナップ値は保持する。
  for(let b=Math.floor(first/grid)*grid;b<=last+1;b+=grid)svg.push(`<line x1="${b*px}" x2="${b*px}" y1="0" y2="100%"/>`);
  score.signatures.forEach((s,i)=>{
    const beatTicks=score.ppq*4/s.signature[1],next=score.signatures[i+1]?.tick??Infinity;
    for(let beat=Math.max(0,Math.ceil((first*score.ppq-s.tick)/beatTicks));;beat++){
      const tick=s.tick+beat*beatTicks;if(tick>=next||tick>last*score.ppq)break;
      const isBar=beat%s.signature[0]===0,left=x(tick);
      svg.push(`<line class="${isBar?'bar':'beat'}" x1="${left}" x2="${left}" y1="0" y2="100%"/>`);
      const label=document.createElement('span');label.style.left=left+'px';label.className=isBar?'bar':'';label.textContent=isBar?`${scorePosition(score,tick).bar}`:x(beatTicks)>=40?labelPosition(tick):'';labels.append(label);
    }
  });
  const end=document.createElement('span');end.className='end-marker';end.style.left=width+'px';end.textContent='終';labels.append(end);
  $('ruler').replaceChildren(labels);$('gridLines').setAttribute('width',width);$('gridLines').innerHTML=svg.join('');
  const tempos=document.createDocumentFragment();score.tempos.forEach((t,i)=>{const b=document.createElement('button');b.textContent=`${+t.bpm.toFixed(2)} BPM`;b.dataset.index=i;b.style.left=x(t.tick)+'px';b.title=`${labelPosition(t.tick)} のテンポを編集`;tempos.append(b);});$('tempoLane').replaceChildren(tempos);
  const signatures=document.createDocumentFragment();score.signatures.forEach((s,i)=>{const b=document.createElement('button');b.textContent=s.signature.join('/');b.dataset.index=i;b.style.left=x(s.tick)+'px';b.title=`${labelPosition(s.tick)} の拍子を編集`;signatures.append(b);});$('signatureLane').replaceChildren(signatures);
  for(let i=1;i<score.signatures.length;i++){
    const s=score.signatures[i],previous=score.signatures[i-1],barTicks=score.ppq*4/previous.signature[1]*previous.signature[0],rest=(s.tick-previous.tick)%barTicks;
    if(rest){const fragment=document.createElement('span');fragment.className='fragment-bar';fragment.style.cssText=`left:${x(s.tick-rest)}px;width:${x(rest)}px`;fragment.title='拍子変更で短くなった小節（音符は移動しません）';$('signatureLane').append(fragment);}
  }
  renderCursor();renderNotes();
}
function renderCursor(){
  $('playhead').style.left=x(cursor)+'px';$('position').textContent=`${labelPosition(cursor)} · ${secondsAt(score,cursor).toFixed(1)}秒`;
}
function renderProperties(){
  const notes=chosen(),first=notes[0];$('selectionLabel').textContent=notes.length?`${notes.length}音を選択`:'音符を選択して編集';
  $('noteProperties').hidden=!notes.length||textEditing||sourceText!==null;
  $('copyNotes').disabled=!notes.length||textEditing;$('pasteNotes').disabled=!clipboard||textEditing||sourceText!==null;
  for(const id of ['noteStart','noteDuration','noteVelocity','delete'])$(id).disabled=!notes.length||textEditing||sourceText!==null;
  for(const [id,value]of [['noteStart',first?first.tick/score.ppq:''],['noteDuration',first?first.duration/score.ppq:''],['noteVelocity',first?.velocity??'']]){if(document.activeElement!==$(id))$(id).value=value;}
}
function render(){
  const previousHigh=HIGH;HIGH=Math.max(...instrument.allowed);LOW=Math.min(...instrument.allowed);
  for(const n of score.notes){HIGH=Math.max(HIGH,n.midi);LOW=Math.min(LOW,n.midi);}
  $('noteArea').classList.toggle('selecting',mode==='select');
  $('scoreTitle').value=score.title;$('songEnd').value=+(score.end/score.ppq).toFixed(6);
  $('draw').setAttribute('aria-pressed',String(mode==='draw'));$('select').setAttribute('aria-pressed',String(mode==='select'));
  $('undo').disabled=!history.length||textEditing;$('redo').disabled=!future.length||textEditing;$('zoomLabel').textContent=Math.round(px/96*100)+'%';
  for(const id of ['newScore','load','save','play','editMenuButton'])$(id).disabled=textEditing;
  for(const id of ['scoreTitle','songEnd','draw','select'])$(id).disabled=textEditing||sourceText!==null;
  $('sourceNotice').hidden=sourceText===null||textEditing;document.body.classList.toggle('source-editing',textEditing);
  const outside=score.notes.filter(n=>!instrument.allowed.has(n.midi)).length;
  $('stats').textContent=`${score.notes.length}音 · ${+(score.end/score.ppq).toFixed(2)}♩ · ${secondsAt(score,score.end).toFixed(1)}秒${outside?` · 音域外${outside}音（試聴しません）`:''}`;
  if(!textEditing)$('mml').value=source();$('mml').readOnly=!textEditing;$('editMml').hidden=textEditing;$('applyMml').hidden=!textEditing;$('cancelMml').hidden=!textEditing;
  $('mmlHint').textContent=textEditing?'適用で楽譜を更新します。取消しで戻れます。':sourceText!==null?'読み込んだMMLを保持しています。':'ノート編集から生成したMMLです。';
  const keys=document.createDocumentFragment(),rows=document.createDocumentFragment();
  for(let midi=HIGH;midi>=LOW;midi--){const black=noteName(midi).includes('#'),outside=!instrument.allowed.has(midi),key=document.createElement('button');key.className=`piano-key${black?' black':''}${outside?' outside':''}`;key.style.top=(HIGH-midi)*ROW+'px';key.textContent=noteName(midi);key.dataset.midi=midi;key.setAttribute('aria-label',`${noteName(midi)}を試聴`);keys.append(key);const row=document.createElement('div');row.className=`pitch-row${black?' black':''}${outside?' outside':''}`;row.style.cssText=`top:${(HIGH-midi)*ROW}px;height:${ROW}px`;rows.append(row);}
  $('keyboard').replaceChildren(keys);$('pitchRows').replaceChildren(rows);renderTimeline();renderProperties();$('viewport').scrollTop+=(HIGH-previousHigh)*ROW;
}
function beginNote(e){
  if(e.button!==0||e.isPrimary===false||gesture||!editable())return;
  $('viewport').focus({preventScroll:true});stop();error();const p=point(e),target=e.target.closest('.midi-note'),before=snapshot();
  gesture={before,point:p,last:e,ids:new Set(selected),pointer:e.pointerId,raf:0,moved:false};
  if(target){
    const id=Number(target.dataset.id);if(e.shiftKey){selected.has(id)?selected.delete(id):selected.add(id);gesture=null;renderNotes();renderProperties();return;}
    if(!selected.has(id))selected=new Set([id]);gesture.ids=new Set(selected);gesture.kind=e.target.closest('.handle')?'resize':'move';gesture.anchor=score.notes.find(n=>n.id===id);
  }else if(mode==='select'||e.shiftKey){
    gesture.kind='box';if(!e.shiftKey)selected.clear();gesture.ids=new Set(selected);
  }else{
    gesture.kind='draw';const unit=gridTicks(),tick=Math.min(score.end-1,Math.max(0,stepTick(!e.altKey?Math.floor(p.tick/unit)*unit:p.tick)));
    const duration=Math.max(1,Math.min(score.end-tick,stepTick(unit)));
    gesture.anchor={id:nextId(),part:score.parts[0].id,midi:p.midi,tick,duration,velocity:90};score.notes.push(gesture.anchor);selected=new Set([gesture.anchor.id]);
  }
  $('noteArea').setPointerCapture(e.pointerId);e.preventDefault();renderNotes();renderProperties();
}
function updateGesture(e){
  if(!gesture)return;gesture.last=e;const p=point(e),g=gesture,useSnap=!e.altKey;
  if(Math.abs(p.x-g.point.x)+Math.abs(p.y-g.point.y)>(e.pointerType==='touch'?8:3))g.moved=true;
  if(g.kind==='move'&&g.moved){const dt=p.tick-g.point.tick,delta=stepTick(useSnap?Math.round(dt/gridTicks())*gridTicks():dt);score.notes=moveNotes(g.before.score.notes,g.ids,delta,p.midi-g.point.midi,score.end);}
  if(g.kind==='resize'&&g.moved){const end=g.anchor.tick+g.anchor.duration+p.tick-g.point.tick;score.notes=resizeNotes(g.before.score.notes,g.ids,snapPosition(end,useSnap)-g.anchor.tick-g.anchor.duration,score.end);}
  if(g.kind==='draw'&&g.moved&&e.pointerType!=='touch'){const end=snapPosition(p.tick,useSnap),duration=Math.max(1,Math.min(score.end-g.anchor.tick,end-g.anchor.tick));score.notes=score.notes.map(n=>n.id===g.anchor.id?{...n,duration}:n);}
  if(g.kind==='box'){
    const left=Math.min(p.x,g.point.x),top=Math.min(p.y,g.point.y),width=Math.abs(p.x-g.point.x),height=Math.abs(p.y-g.point.y);
    $('selectionBox').hidden=false;$('selectionBox').style.cssText=`left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
    selected=new Set(g.ids);for(const n of score.notes)if(x(n.tick)<left+width&&x(n.tick+n.duration)>left&&(HIGH-n.midi)*ROW<top+height&&(HIGH-n.midi+1)*ROW>top)selected.add(n.id);
  }
  renderNotes();renderProperties();
}
function autoScroll(){
  if(!gesture)return;const v=$('viewport'),r=v.getBoundingClientRect(),e=gesture.last;
  const dx=e.clientX>r.right-25?12:e.clientX<r.left+KEY+20?-12:0,dy=e.clientY>r.bottom-25?12:e.clientY<r.top+70?-12:0;
  if(gesture.moved&&!(gesture.kind==='draw'&&e.pointerType==='touch')&&(dx||dy)){v.scrollLeft+=dx;v.scrollTop+=dy;updateGesture(e);}
  gesture.raf=requestAnimationFrame(autoScroll);
}
function endGesture(cancel=false){
  if(!gesture)return;const g=gesture;gesture=null;cancelAnimationFrame(g.raf);$('selectionBox').hidden=true;
  try{$('noteArea').releasePointerCapture(g.pointer);}catch{}
  if(cancel){score=g.before.score;selected=new Set(g.ids);}
  else if(g.kind!=='box'){
    try{validateScore(score);if(JSON.stringify(score)!==JSON.stringify(g.before.score))remember(g.before);}
    catch(e){score=g.before.score;error(e.message);}
  }
  render();
}
$('noteArea').addEventListener('pointerdown',e=>{beginNote(e);if(gesture)gesture.raf=requestAnimationFrame(autoScroll);});
$('noteArea').addEventListener('pointermove',e=>{if(gesture?.pointer===e.pointerId){updateGesture(e);e.preventDefault();}});
$('noteArea').addEventListener('pointerup',e=>{if(gesture?.pointer===e.pointerId)endGesture();});$('noteArea').addEventListener('pointercancel',e=>{if(gesture?.pointer===e.pointerId)endGesture(true);});
$('ruler').onpointerdown=e=>{if(e.button!==0||textEditing)return;stop();cursor=Math.min(score.end,snapPosition((e.clientX-$('ruler').getBoundingClientRect().left)/px*score.ppq));renderCursor();};
let scrollFrame=0;$('viewport').onscroll=()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;renderTimeline();});};window.addEventListener('resize',()=>renderTimeline());
for(const [id,fn]of Object.entries({draw:()=>mode='draw',select:()=>mode='select',zoomIn:()=>px=Math.min(384,px*1.5),zoomOut:()=>px=Math.max(24,px/1.5)}))$(id).onclick=()=>{endGesture(true);fn();render();};
$('grid').onchange=()=>{endGesture(true);render();};
$('instrument').onchange=()=>{stop();instrument=defs.instruments.find(i=>i.id===$('instrument').value);render();};
$('scoreTitle').onchange=()=>change(()=>{score.title=$('scoreTitle').value;});
$('songEnd').onchange=()=>change(()=>{score.end=Math.round(Number($('songEnd').value)*score.ppq);cursor=Math.min(cursor,score.end);});
$('undo').onclick=()=>undo();$('redo').onclick=()=>undo(true);
function openTempo(index,tick=cursor){if(!editable())return;tempoIndex=index;$('tempoTick').value=(index!==null?score.tempos[index].tick:tick)/score.ppq;$('tempoTick').disabled=index===0;$('tempoBpm').value=index!==null?+score.tempos[index].bpm.toFixed(6):120;$('removeTempo').hidden=index===null||index===0;$('tempoDialog').showModal();}
$('tempoLane').onclick=e=>{const b=e.target.closest('button');if(b)openTempo(Number(b.dataset.index));};
$('tempoLane').ondblclick=e=>{if(!e.target.closest('button'))openTempo(null,snapPosition((e.clientX-$('tempoLane').getBoundingClientRect().left)/px*score.ppq));};$('addTempo').onclick=()=>openTempo(score.tempos.findIndex(t=>t.tick===cursor)>=0?score.tempos.findIndex(t=>t.tick===cursor):null);
$('tempoForm').onsubmit=e=>{if(e.submitter.value!=='apply')return;e.preventDefault();const tick=Math.round(Number($('tempoTick').value)*score.ppq),bpm=Number($('tempoBpm').value);change(()=>{if(score.tempos.some((t,i)=>i!==tempoIndex&&t.tick===tick))throw Error('この位置には既にテンポ変更があります。');if(tempoIndex!==null)score.tempos.splice(tempoIndex,1);score.tempos.push({tick,bpm});score.tempos.sort((a,b)=>a.tick-b.tick);});if(!$('error').textContent)$('tempoDialog').close();};
$('removeTempo').onclick=()=>{change(()=>score.tempos.splice(tempoIndex,1));$('tempoDialog').close();};
function openSignature(index,tick=cursor){
  if(!editable())return;signatureIndex=index;tick=index!==null?score.signatures[index].tick:tick;
  const signature=scorePosition(score,tick).signature;$('signatureTick').value=tick/score.ppq;$('signatureTick').disabled=index===0;$('signatureNumerator').value=signature[0];$('signatureDenominator').value=signature[1];$('removeSignature').hidden=index===null||index===0;$('signatureError').textContent='';$('signatureDialog').showModal();
}
$('signatureLane').onclick=e=>{const b=e.target.closest('button');if(b)openSignature(Number(b.dataset.index));};
$('signatureLane').ondblclick=e=>{if(!e.target.closest('button'))openSignature(null,snapPosition((e.clientX-$('signatureLane').getBoundingClientRect().left)/px*score.ppq));};
$('addSignature').onclick=()=>{const index=score.signatures.findIndex(s=>s.tick===cursor);openSignature(index<0?null:index);};
$('signatureForm').onsubmit=e=>{
  if(e.submitter.value!=='apply')return;e.preventDefault();const tick=Math.round(Number($('signatureTick').value)*score.ppq),signature=[Number($('signatureNumerator').value),Number($('signatureDenominator').value)];
  change(()=>{if(score.signatures.some((s,i)=>i!==signatureIndex&&s.tick===tick))throw Error('この位置には既に拍子変更があります。');if(signatureIndex!==null)score.signatures.splice(signatureIndex,1);score.signatures.push({tick,signature});score.signatures.sort((a,b)=>a.tick-b.tick);});
  $('signatureError').textContent=$('error').textContent;if(!$('signatureError').textContent)$('signatureDialog').close();
};
$('removeSignature').onclick=()=>{change(()=>score.signatures.splice(signatureIndex,1));$('signatureDialog').close();};
$('noteStart').onchange=()=>change(()=>{const first=chosen()[0];if(first)score.notes=moveNotes(score.notes,selected,Math.round(Number($('noteStart').value)*score.ppq)-first.tick,0,score.end);});
$('noteDuration').onchange=()=>change(()=>{const first=chosen()[0];if(first)score.notes=resizeNotes(score.notes,selected,Math.round(Number($('noteDuration').value)*score.ppq)-first.duration,score.end);});
$('noteVelocity').onchange=()=>change(()=>{const velocity=Number($('noteVelocity').value);score.notes=score.notes.map(n=>selected.has(n.id)?{...n,velocity}:n);});
function removeNotes(){change(()=>{score.notes=score.notes.filter(n=>!selected.has(n.id));selected.clear();});}
$('delete').onclick=removeNotes;
function selectAllNotes(){selected=new Set(score.notes.map(n=>n.id));renderNotes();renderProperties();}
$('selectAll').onclick=selectAllNotes;
function copyNotes(){const notes=chosen();if(notes.length){const start=Math.min(...notes.map(n=>n.tick));clipboard=notes.map(n=>({...n,tick:n.tick-start}));renderProperties();}}
function pasteNotes(){if(!clipboard)return;change(()=>{let id=nextId();const copied=clipboard.map(n=>({...n,id:id++,part:score.parts.some(p=>p.id===n.part)?n.part:score.parts[0].id,tick:n.tick+Math.round(cursor)}));score.notes.push(...copied);selected=new Set(copied.map(n=>n.id));});}
$('copyNotes').onclick=copyNotes;$('pasteNotes').onclick=pasteNotes;
document.addEventListener('keydown',e=>{
  if(worker||e.isComposing||document.querySelector('[popover]:popover-open'))return;
  if(gesture){
    if(e.key==='Escape')endGesture(true);
    if(['Escape','Delete','Backspace','ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)||((e.ctrlKey||e.metaKey)&&['a','c','v','z'].includes(e.key.toLowerCase())))e.preventDefault();
    return;
  }
  if(textEditing||e.target.closest('input,textarea,select,[contenteditable],dialog'))return;
  if(e.altKey)return;
  const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
  if(mod&&key==='z'){e.preventDefault();undo(e.shiftKey);}
  else if(mod&&key==='c'){e.preventDefault();copyNotes();}
  else if(mod&&key==='v'){e.preventDefault();pasteNotes();}
  else if(mod&&key==='a'){e.preventDefault();selectAllNotes();}
  else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeNotes();}
  else if(e.code==='Space'&&!e.target.closest('button,summary')){e.preventDefault();playing?stop():void play();}
  else if(e.key==='Escape'){selected.clear();render();}
  else if(!mod&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&selected.size){e.preventDefault();change(()=>{score.notes=moveNotes(score.notes,selected,e.key==='ArrowLeft'?-Math.round(gridTicks()):e.key==='ArrowRight'?Math.round(gridTicks()):0,e.key==='ArrowUp'?(e.shiftKey?12:1):e.key==='ArrowDown'?(e.shiftKey?-12:-1):0,score.end);});}
});

function getAudio(){return audio??=new (window.AudioContext||window.webkitAudioContext)();}
async function loadBuffer(midi,sound){const key=sound.id+':'+midi;if(!buffers.has(key)){const file=sound.files[noteName(midi)];if(!file)throw Error('音源の範囲外です。');const r=await fetch((sound.base+file).split('/').map(encodeURIComponent).join('/'));if(!r.ok)throw Error('音源を取得できません。');buffers.set(key,await getAudio().decodeAudioData(await r.arrayBuffer()));}return buffers.get(key);}
function voice(buffer,start,duration,velocity,piano){
  const ctx=getAudio(),node=ctx.createBufferSource(),gain=ctx.createGain();node.buffer=buffer;node.connect(gain);gain.connect(ctx.destination);gain.gain.setValueAtTime(velocity/127*.35,start);
  node.start(start);
  if(piano){gain.gain.setValueAtTime(velocity/127*.35,start+duration);gain.gain.linearRampToValueAtTime(0,start+duration+.08);node.stop(start+duration+.09);}
  voices.set(node,start);node.onended=()=>{voices.delete(node);node.disconnect();gain.disconnect();};
}
function stop(){playEpoch++;if(playing){clearInterval(playing.timer);cancelAnimationFrame(playing.frame);cursor=playing.startTick;playing=null;}for(const node of voices.keys()){try{node.stop();}catch{}}voices.clear();$('play').setAttribute('aria-pressed','false');$('play').textContent='▶';$('play').setAttribute('aria-label','再生');renderCursor();}
async function play(){
  if(textEditing){error('MMLの編集を適用または取消ししてください。');return;}
  stop();const epoch=playEpoch;try{
    const ctx=getAudio();await ctx.resume();if(epoch!==playEpoch)return;
    const active=score.notes.filter(n=>instrument.allowed.has(n.midi));
    if(!active.length)throw Error('試聴できる音符がありません。');const sound=defs.soundsets.find(s=>s.id===instrument.defaultSoundset),piano=instrument.arrangedFor.startsWith('piano');
    const pitches=[...new Set(active.map(n=>n.midi))];await Promise.all(pitches.map(n=>loadBuffer(n,sound)));if(epoch!==playEpoch)return;
    const looping=$('loop').getAttribute('aria-pressed')==='true',from=looping?0:Math.min(cursor,score.end-1),begin=secondsAt(score,from),span=secondsAt(score,score.end);
    const events=active.map(n=>({note:n,time:secondsAt(score,n.tick),duration:secondsAt(score,n.tick+n.duration)-secondsAt(score,n.tick)})).sort((a,b)=>a.time-b.time);
    const first=events.findIndex(e=>e.time>=begin),session={start:ctx.currentTime+.08-begin,startTick:from,span,next:first<0?events.length:first,eventCount:events.length,cycle:0,endCycle:looping?Infinity:0,timer:0,frame:0};
    // 途中再生では開始位置をまたぐ長音だけ残りの音長で鳴らす。
    for(const e of events)if(e.time<begin&&e.time+e.duration>begin)voice(buffers.get(sound.id+':'+e.note.midi),ctx.currentTime+.08,e.time+e.duration-begin,e.note.velocity,piano);
    playing=session;$('play').setAttribute('aria-pressed','true');$('play').textContent='■';$('play').setAttribute('aria-label','停止');error();
    function schedule(){
      if(playing!==session)return;
      let count=0;
      while(events.length&&count++<10000){
        if(session.next===events.length){if(session.cycle>=session.endCycle)break;session.next=0;session.cycle++;}
        const e=events[session.next],at=session.start+session.cycle*span+e.time;if(at>ctx.currentTime+.15)break;
        if(at>=ctx.currentTime-.02)voice(buffers.get(sound.id+':'+e.note.midi),Math.max(ctx.currentTime,at),e.duration,e.note.velocity,piano);
        session.next++;
      }
      if(ctx.currentTime>=session.start+(session.endCycle+1)*span+.1){stop();return;}
      if(ctx.currentTime-session.start>(session.cycle+2)*span){session.cycle=Math.floor((ctx.currentTime-session.start)/span);session.next=0;}
    }
    function frame(){if(playing!==session)return;const elapsed=Math.max(0,ctx.currentTime-session.start);cursor=tickAt(score,elapsed>=(session.endCycle+1)*span?span:elapsed%span);renderCursor();session.frame=requestAnimationFrame(frame);}
    schedule();session.timer=setInterval(schedule,25);frame();
  }catch(e){if(epoch===playEpoch){stop();error(e.message);}}
}
$('play').onclick=()=>playing?stop():void play();
$('loop').onclick=()=>{
  const on=$('loop').getAttribute('aria-pressed')!=='true';$('loop').setAttribute('aria-pressed',String(on));if(!playing)return;
  const session=playing,now=getAudio().currentTime,cycle=Math.max(0,Math.floor((now-session.start)/session.span));
  if(on){if(now>=session.start+(session.endCycle+1)*session.span){session.start=now+.08;session.startTick=0;session.cycle=0;session.next=0;}session.endCycle=Infinity;}
  else{
    session.endCycle=cycle;const end=session.start+(cycle+1)*session.span;
    for(const [node,start] of voices)if(start>=end){node.stop();voices.delete(node);}
    if(session.cycle>cycle){session.cycle=cycle;session.next=session.eventCount;}
  }
};
$('keyboard').onclick=async e=>{const b=e.target.closest('button');if(!b||!instrument.allowed.has(Number(b.dataset.midi)))return;const epoch=playEpoch;try{await getAudio().resume();const buffer=await loadBuffer(Number(b.dataset.midi),defs.soundsets.find(s=>s.id===instrument.defaultSoundset));if(epoch===playEpoch)voice(buffer,getAudio().currentTime,.4,90,instrument.arrangedFor.startsWith('piano'));}catch(e){error(e.message);}};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});

function compile(input){
  if(worker)return Promise.reject(Error('変換中です。'));
  stop();document.querySelector('main').inert=true;error('変換中…');
  return new Promise((resolve,reject)=>{
    const w=new Worker('./mml-worker.js',{type:'module'});worker=w;
    const done=(value,err)=>{clearTimeout(importTimer);w.terminate();worker=null;document.querySelector('main').inert=false;error();err?reject(Error(err)):resolve(value);};
    w.onmessage=e=>done(input.midiOnly?e.data.bytes:e.data.score,e.data.error);w.onerror=e=>done(null,e.message||'MML変換器の読み込みに失敗しました。');importTimer=setTimeout(()=>done(null,'変換に時間がかかりすぎたため中止しました。'),10000);w.postMessage(input);
  });
}
function download(body,name,type){const url=URL.createObjectURL(new Blob([body],{type})),a=document.createElement('a');a.href=url;a.download=name.replace(/[<>:"/\\|?*]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('saveMml').onclick=()=>{if(textEditing){error('編集中のMMLを適用してから保存してください。');return;}download(source(),score.title+'.mml','text/plain;charset=utf-8');$('saveMenu').hidePopover();};
$('saveMidi').onclick=async()=>{if(textEditing)return;try{const bytes=await compile({text:source(),midiOnly:true});download(bytes,score.title+'.mid','audio/midi');$('saveMenu').hidePopover();}catch(e){error(e.message);}};
$('copyMml').onclick=async e=>{e.preventDefault();const text=textEditing?$('mml').value:source();try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);else{$('mmlPanel').open=true;$('mml').value=text;$('mml').select();if(!document.execCommand('copy'))throw Error('MMLを選択しました。コピー操作で取得してください。');}}catch(e){error(e.message);}};
$('editMml').onclick=()=>{stop();textEditing=true;render();$('mml').focus();};$('cancelMml').onclick=()=>{textEditing=false;render();error();};
$('applyMml').onclick=async()=>{const text=$('mml').value;$('applyMml').disabled=true;try{const parsed=await compile({text});const before=snapshot();score=parsed;sourceText=text;cursor=0;selected.clear();textEditing=false;remember(before);render();error();}catch(e){error(e.message);}finally{$('applyMml').disabled=false;}};
$('enableGui').onclick=()=>{remember(snapshot());sourceText=null;render();error();};
async function loadFile(file){
  if(!file)return;if(textEditing){error('MMLの編集を適用または取消ししてください。');return;}
  try{if(!/\.(mml|midi?)$/i.test(file.name))throw Error('MMLまたはMIDIファイルを選んでください。');if(file.size>1024*1024)throw Error('試作では1MB以下のファイルを使用してください。');stop();const isMml=/\.mml$/i.test(file.name),text=isMml?await file.text():null,parsed=await compile(isMml?{text}:{buffer:await file.arrayBuffer()});remember(snapshot());score=parsed;sourceText=text;selected.clear();cursor=0;render();error();}catch(e){error(e.message);}
}
$('load').onclick=()=>$('file').click();$('file').onchange=async()=>{await loadFile($('file').files[0]);$('file').value='';};
document.querySelector('.editor').ondragover=e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();};
document.querySelector('.editor').ondrop=e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();void loadFile(e.dataTransfer.files[0]);}};
$('newScore').onclick=()=>{if(textEditing){error('MMLの編集を適用または取消ししてください。');return;}stop();remember(snapshot());score=demoScore();score.title='新しい楽譜';score.notes=[];score.tempos=[{tick:0,bpm:120}];score.parts=[{id:1,name:'パート1'}];score.end=score.ppq*16;cursor=0;selected.clear();sourceText=null;render();error();};
const menus=[...document.querySelectorAll('[popovertarget]')].map(button=>[$(button.getAttribute('popovertarget')),button]);
function positionMenus(){
  for(const [menu,button] of menus){
    if(!menu.matches(':popover-open'))continue;
    const rect=button.getBoundingClientRect(),below=rect.bottom+5,width=menu.offsetWidth,height=menu.offsetHeight;
    menu.style.left=Math.max(8,Math.min(rect.right-width,window.innerWidth-width-8))+'px';
    menu.style.top=Math.max(8,Math.min(below+height<=window.innerHeight-8?below:rect.top-height-5,window.innerHeight-height-8))+'px';
  }
}
for(const [menu,button] of menus){
  menu.addEventListener('toggle',e=>{if(e.newState==='open'){if(menu.id==='markerMenu')$('markerPosition').textContent=`追加位置 ${labelPosition(cursor)}`;positionMenus();}});
  menu.addEventListener('click',e=>{if(e.target.closest('[data-close-menu]')){const focused=menu.contains(document.activeElement);menu.hidePopover();if(focused)button.focus({preventScroll:true});}});
}
window.addEventListener('resize',positionMenus);window.addEventListener('scroll',positionMenus,true);
render();$('viewport').scrollTop=(HIGH-79)*ROW;$('viewport').scrollLeft=0;
