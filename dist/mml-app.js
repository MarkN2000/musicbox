import {noteName,validateDefinitions} from './core.js';
import {demoScore,validateScore,serializeMml,secondsAt,tickAt,moveNotes,resizeNotes,scorePosition,midiPerformance} from './mml-score.js';
import {t,currentLanguage,preferredLanguage,loadLanguage,localized,translatePage} from './i18n.js';

await loadLanguage(preferredLanguage());

const $=id=>document.getElementById(id),clone=value=>structuredClone(value),ROW=20,KEY=84;
const HIGH=108,LOW=21;
let score=emptyScore(),activePart=1,selected=new Set(),px=120,cursor=0,gesture=null;
let history=[],future=[],sourceText=null,textEditing=false,clipboard=null,worker=null,importTimer=null;
let audio,playing=null,paused=false,playEpoch=0,markerTick=0;
let keyGesture=null;
let catalog=null;
let audioExporting=false;
let partProfiles=new Map();
const gmNames={};
const buffers=new Map(),voices=new Map();
const response=await Promise.all(['instruments.json','audio/soundsets.json'].map(async path=>{const r=await fetch(path);if(!r.ok)throw Error('楽器の設定を取得できません。');return r.json();}));
const defs=validateDefinitions(...response);let instrument=defs.instruments.find(i=>i.id==='piano-88')??defs.instruments[0];
function translateEditor(){
  translatePage();document.title=t('MML編集 — オルゴール譜');$('language').value=currentLanguage();
  Object.assign(gmNames,{0:t('ピアノ'),10:t('オルゴール'),12:t('マリンバ'),13:t('木琴')});
  for(const profile of defs.instruments){const key=profile.percussion?'drums':profile.gmProgram;if(key!==undefined&&![0,10,12,13].includes(key))gmNames[key]=profile.name[currentLanguage()];}
  $('instrument').replaceChildren(...Object.entries(gmNames).map(([program,name])=>new Option(name,program)));
  $('play').title=t(playing?'一時停止':'再生');$('play').setAttribute('aria-label',$('play').title);$('save').textContent=t(audioExporting?'保存中…':'保存 ▾');
}
function error(message=''){$('error').textContent=t(message);if(message)$('error').scrollIntoView({block:'nearest',inline:'nearest'});}
function emptyScore(profile){const s=demoScore();return {...s,title:t('新しい楽譜'),notes:[],tempos:[{tick:0,bpm:120}],parts:[{id:1,name:t('mmlPartName',{number:1}),program:profile?.gmProgram??0,instrumentId:profile?.id??'piano-88',...(profile?.percussion?{percussion:true}:{})}],end:s.ppq*8};}
function attempt(fn){try{fn();error();}catch(e){error(e.message);render();}}
function snapshot(){return {score:clone(score),sourceText,cursor,activePart};}
function editable(){return !textEditing&&sourceText===null;}
function remember(before){history.push(before);if(history.length>50)history.shift();future=[];}
function change(fn){if(!editable())return;const before=snapshot();stop();try{fn();validateScore(score);if(JSON.stringify(before.score)!==JSON.stringify(score))remember(before);error();render();}catch(e){restore(before);error(e.message);}}
function restore(s){score=clone(s.score);sourceText=s.sourceText;cursor=s.cursor;activePart=s.activePart;selected.clear();render();}
function undo(redo=false){if(textEditing||gesture)return;const list=redo?future:history;if(!list.length)return;stop();(redo?history:future).push(snapshot());restore(list.pop());error();}
function gridTicks(){return score.ppq*Number($('grid').value);}
function stepTick(t){return Math.round(t);}
function snapPosition(t,enabled=true){return Math.max(0,stepTick(enabled?Math.round(t/gridTicks())*gridTicks():t));}
function x(t){return t/score.ppq*px;}
function point(e){const b=$('noteArea').getBoundingClientRect();return {tick:Math.max(0,(e.clientX-b.left)/px*score.ppq),midi:Math.max(LOW,Math.min(HIGH,HIGH-Math.floor((e.clientY-b.top)/ROW))),x:e.clientX-b.left,y:e.clientY-b.top};}
function chosen(){return score.notes.filter(n=>n.part===activePart&&selected.has(n.id));}
function nextId(){return Math.max(0,...score.notes.map(n=>n.id))+1;}
function labelPosition(t){const p=scorePosition(score,t);return `${p.bar}:${p.beat.toFixed(2).replace(/\.00$/,'')}`;}
function source(){return sourceText??serializeMml(score);}
function profileFor(part){
  const profile=defs.instruments.find(i=>i.id===part.instrumentId);
  if(part.instrumentId&&!profile)return;
  return profile?.gmProgram===(part.program??0)&&!!profile.percussion===!!part.percussion?profile:defs.instruments.find(i=>i.gmProgram===(part.program??0)&&!!i.percussion===!!part.percussion);
}
function exportSource(){
  if(textEditing)throw Error('編集中のMMLを適用してから書き出してください。');
  return score.warnings?.length?serializeMml(score):source();
}
function partHue(part){return (210+(part.percussion?128:part.program??0)*137.508)%360;}
function renderNotes(){
  const viewport=$('viewport'),from=Math.max(0,(viewport.scrollLeft-KEY-200)/px*score.ppq),to=(viewport.scrollLeft+viewport.clientWidth+200)/px*score.ppq;
  const fragment=document.createDocumentFragment(),parts=new Map(score.parts.map(p=>[p.id,p]));
  for(const n of score.notes){
    if(n.tick+n.duration<from||n.tick>to||n.midi<LOW||n.midi>HIGH)continue;
    const el=document.createElement('div');el.className='midi-note';
    const reference=n.part!==activePart;el.classList.toggle('reference',reference);
    el.classList.toggle('selected',selected.has(n.id));el.classList.toggle('outside',!partProfiles.get(n.part)?.allowed.has(n.midi));
    el.dataset.id=n.id;el.dataset.tick=n.tick;el.dataset.duration=n.duration;el.dataset.midi=n.midi;el.dataset.part=n.part;
    el.style.cssText=`--part-hue:${partHue(parts.get(n.part))};left:${x(n.tick)}px;top:${(HIGH-n.midi)*ROW+1}px;width:${Math.max(4,x(n.duration))}px`;
    el.setAttribute('role','button');el.tabIndex=reference?-1:0;el.setAttribute('aria-disabled',String(reference));el.setAttribute('aria-selected',String(selected.has(n.id)));
    el.setAttribute('aria-label',t('mmlNoteLabel',{part:parts.get(n.part).name,note:noteName(n.midi),position:labelPosition(n.tick),duration:+(n.duration/score.ppq).toFixed(4),velocity:n.velocity}));el.title=el.getAttribute('aria-label');
    const handle=document.createElement('span');handle.className='handle';handle.setAttribute('aria-hidden','true');el.append(handle);fragment.append(el);
  }
  $('notes').replaceChildren(fragment);
}
function renderTimeline(){
  const width=x(score.end),head=64;$('viewport').style.setProperty('--head-height',`${head}px`);
  $('canvas').style.cssText=`width:${width+KEY+24}px;height:${(HIGH-LOW+1)*ROW+head}px`;
  $('noteArea').style.cssText=`width:${width}px;height:${(HIGH-LOW+1)*ROW}px`;$('ruler').style.width=width+'px';$('markerLane').style.width=width+'px';
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
  const end=document.createElement('span');end.className='end-marker';end.style.left=width+'px';end.textContent=t('終');labels.append(end);
  $('ruler').replaceChildren(labels);$('gridLines').setAttribute('width',width);$('gridLines').innerHTML=svg.join('');
  $('markerGrid').setAttribute('width',width);$('markerGrid').innerHTML=svg.join('');
  const changes=new Map(score.signatures.map(s=>[s.tick,s.signature.join('/')]));
  for(const t of score.tempos)changes.set(t.tick,[changes.get(t.tick),`${+t.bpm.toFixed(2)} BPM`].filter(Boolean).join(' · '));
  const markers=document.createDocumentFragment(),ticks=[...changes.keys()].sort((a,b)=>a-b);
  ticks.forEach((tick,i)=>{
    const b=document.createElement('button');b.textContent=changes.get(tick);b.dataset.tick=tick;
    b.style.cssText=`left:${x(tick)}px;max-width:${Math.max(4,x((ticks[i+1]??score.end)-tick)-2)}px`;
    b.title=`${labelPosition(tick)} · ${b.textContent}`;b.setAttribute('aria-label',t('mmlEditMarker',{marker:b.title}));markers.append(b);
  });$('markers').replaceChildren(markers);
  for(let i=1;i<score.signatures.length;i++){
    const s=score.signatures[i],previous=score.signatures[i-1],barTicks=score.ppq*4/previous.signature[1]*previous.signature[0],rest=(s.tick-previous.tick)%barTicks;
    if(rest){const fragment=document.createElement('span');fragment.className='fragment-bar';fragment.style.cssText=`left:${x(s.tick-rest)}px;width:${x(rest)}px`;fragment.title=t('拍子変更で短くなった小節（音符は移動しません）');$('markers').append(fragment);}
  }
  renderCursor();renderNotes();
}
function renderCursor(){
  $('playhead').style.left=x(cursor)+'px';$('position').textContent=t('mmlPosition',{position:labelPosition(cursor),seconds:secondsAt(score,cursor).toFixed(1)});
  if(playing){
    const viewport=$('viewport'),left=x(cursor);
    if(left<viewport.scrollLeft)viewport.scrollLeft=Math.floor(left);
    else if(left+2>viewport.scrollLeft+viewport.clientWidth-KEY)viewport.scrollLeft=Math.ceil(left+2-viewport.clientWidth+KEY);
  }
}
function renderProperties(){
  const notes=chosen(),first=notes[0];$('selectionLabel').textContent=notes.length?t('mmlSelectedNotes',{count:notes.length}):t('音符を選択して編集');
  $('noteProperties').hidden=!notes.length||textEditing||sourceText!==null;
  $('copyNotes').disabled=!notes.length||textEditing;$('pasteNotes').disabled=!clipboard||textEditing||sourceText!==null;
  for(const id of ['noteStart','noteDuration','noteVelocity','delete'])$(id).disabled=!notes.length||textEditing||sourceText!==null;
  for(const [id,value]of [['noteStart',first?first.tick/score.ppq:''],['noteDuration',first?first.duration/score.ppq:''],['noteVelocity',first?.velocity??'']]){if(document.activeElement!==$(id))$(id).value=value;}
}
function render(){
  partProfiles=new Map(score.parts.map(p=>[p.id,profileFor(p)]));if(!partProfiles.has(activePart))activePart=score.parts[0].id;
  const part=score.parts.find(p=>p.id===activePart);instrument=partProfiles.get(activePart);
  const totals=new Map(),numbers=new Map();
  for(const p of score.parts){const program=p.percussion?'drums':p.program??0;totals.set(program,(totals.get(program)??0)+1);}
  $('partTabs').replaceChildren(...score.parts.map(p=>{
    const program=p.percussion?'drums':p.program??0,number=(numbers.get(program)??0)+1;numbers.set(program,number);
    const tab=document.createElement('button');tab.id=`part-${p.id}`;tab.className='button';tab.dataset.part=p.id;
    tab.style.setProperty('--part-hue',partHue(p));
    tab.textContent=tab.title=(gmNames[program]??`GM ${program+1}`)+(totals.get(program)>1?number:'');
    tab.setAttribute('role','tab');tab.setAttribute('aria-controls','viewport');tab.setAttribute('aria-selected',String(p.id===activePart));tab.tabIndex=p.id===activePart?0:-1;tab.disabled=textEditing;return tab;
  }));
  $('viewport').setAttribute('role','tabpanel');$('viewport').setAttribute('aria-labelledby',`part-${activePart}`);
  const activeTab=$('partTabs').querySelector('[aria-selected=true]');
  if(activeTab.offsetLeft<$('partTabs').scrollLeft)$('partTabs').scrollLeft=activeTab.offsetLeft;
  else if(activeTab.offsetLeft+activeTab.offsetWidth>$('partTabs').scrollLeft+$('partTabs').clientWidth)$('partTabs').scrollLeft=activeTab.offsetLeft+activeTab.offsetWidth-$('partTabs').clientWidth;
  $('instrument').querySelector('option[data-unsupported]')?.remove();
  if(!Object.hasOwn(gmNames,part.percussion?'drums':part.program??0)){const option=new Option(t('mmlUnsupportedProgram',{program:(part.program??0)+1}),part.program);option.dataset.unsupported='';$('instrument').add(option);}
  $('instrument').value=part.percussion?'drums':String(part.program??0);
  const ranges=defs.instruments.filter(i=>i.gmProgram===(part.program??0)&&!!i.percussion===!!part.percussion);$('partRange').replaceChildren(...ranges.map(i=>new Option(i.name[currentLanguage()],i.id)));
  if(!instrument)$('partRange').add(new Option(t('未対応の音域'),'unsupported'));
  $('partRange').value=instrument?.id??'unsupported';$('partRange').disabled=$('partRange').options.length<2||textEditing||sourceText!==null;
  if(document.activeElement!==$('partName'))$('partName').value=part.name;
  $('partName').disabled=$('instrument').disabled=textEditing||sourceText!==null;
  $('addPart').disabled=score.parts.length>=64||textEditing||sourceText!==null;$('deletePart').disabled=score.parts.length===1||textEditing||sourceText!==null;
  $('scoreTitle').value=score.title;$('songEnd').value=+(score.end/score.ppq).toFixed(6);
  $('zoomLabel').textContent=Math.round(px/120*100)+'%';
  for(const id of ['templateButton','newScore','load','save','play','editMenuButton'])$(id).disabled=textEditing||id==='save'&&audioExporting;
  for(const id of ['scoreTitle','songEnd'])$(id).disabled=textEditing||sourceText!==null;
  $('sourceNotice').hidden=sourceText===null||textEditing;document.body.classList.toggle('source-editing',textEditing);
  $('importNotice').hidden=!score.warnings?.length;
  $('stats').textContent=t('mmlStats',{notes:score.notes.length,beats:+(score.end/score.ppq).toFixed(2),seconds:secondsAt(score,score.end).toFixed(1)});
  if(!textEditing)try{$('mml').value=source();}catch(e){$('mml').value='';error(e.message);}
  $('mml').readOnly=!textEditing;$('editMml').hidden=textEditing;$('editMml').disabled=!$('mml').value;$('applyMml').hidden=!textEditing;$('cancelMml').hidden=!textEditing;
  const keys=document.createDocumentFragment(),rows=document.createDocumentFragment();
  for(let midi=HIGH;midi>=LOW;midi--){const black=noteName(midi).includes('#'),outside=!instrument?.allowed.has(midi),key=document.createElement('button');key.className=`piano-key${black?' black':''}${outside?' outside':''}`;key.style.top=(HIGH-midi)*ROW+'px';key.textContent=noteName(midi);key.dataset.midi=midi;key.setAttribute('aria-label',t('previewNote',{note:noteName(midi)}));keys.append(key);const row=document.createElement('div');row.className=`pitch-row${black?' black':''}${outside?' outside':''}`;row.style.cssText=`top:${(HIGH-midi)*ROW}px;height:${ROW}px`;rows.append(row);}
  $('keyboard').replaceChildren(keys);$('pitchRows').replaceChildren(rows);renderTimeline();renderProperties();
}
function beginNote(e){
  if(e.button!==0||e.isPrimary===false||gesture||!editable())return;
  $('viewport').focus({preventScroll:true});stop();error();const p=point(e),target=e.target.closest('.midi-note'),before=snapshot();
  gesture={before,point:p,last:e,ids:new Set(selected),pointer:e.pointerId,raf:0,moved:false};
  if(target){
    const id=Number(target.dataset.id);if(score.notes.find(n=>n.id===id).part!==activePart){gesture=null;return;}
    if(e.shiftKey){selected.has(id)?selected.delete(id):selected.add(id);gesture=null;renderNotes();renderProperties();return;}
    if(!selected.has(id))selected=new Set([id]);gesture.ids=new Set(selected);gesture.kind=e.target.closest('.handle')?'resize':'move';gesture.anchor=score.notes.find(n=>n.id===id);
  }else{
    gesture.kind='box';gesture.place=!e.shiftKey;if(!e.shiftKey)selected.clear();gesture.ids=new Set(selected);
  }
  $('noteArea').setPointerCapture(e.pointerId);if(target||e.pointerType!=='touch')e.preventDefault();renderNotes();renderProperties();
}
function updateGesture(e){
  if(!gesture)return;gesture.last=e;const p=point(e),g=gesture,useSnap=!e.altKey;
  if(Math.abs(p.x-g.point.x)+Math.abs(p.y-g.point.y)>(e.pointerType==='touch'?8:3))g.moved=true;
  if(g.kind==='move'&&g.moved){const dt=p.tick-g.point.tick,delta=stepTick(useSnap?Math.round(dt/gridTicks())*gridTicks():dt);score.notes=moveNotes(g.before.score.notes,g.ids,delta,p.midi-g.point.midi,score.end);}
  if(g.kind==='resize'&&g.moved){const end=g.anchor.tick+g.anchor.duration+p.tick-g.point.tick;score.notes=resizeNotes(g.before.score.notes,g.ids,snapPosition(end,useSnap)-g.anchor.tick-g.anchor.duration,score.end);}
  if(g.kind==='box'&&g.moved&&e.pointerType!=='touch'){
    const left=Math.min(p.x,g.point.x),top=Math.min(p.y,g.point.y),width=Math.abs(p.x-g.point.x),height=Math.abs(p.y-g.point.y);
    $('selectionBox').hidden=false;$('selectionBox').style.cssText=`left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
    selected=new Set(g.ids);for(const n of score.notes)if(n.part===activePart&&x(n.tick)<left+width&&x(n.tick+n.duration)>left&&(HIGH-n.midi)*ROW<top+height&&(HIGH-n.midi+1)*ROW>top)selected.add(n.id);
  }
  renderNotes();renderProperties();
}
function autoScroll(){
  if(!gesture)return;const v=$('viewport'),r=v.getBoundingClientRect(),e=gesture.last;
  const dx=e.clientX>r.right-25?12:e.clientX<r.left+KEY+20?-12:0;
  if(gesture.moved&&!(gesture.kind==='box'&&e.pointerType==='touch')&&dx){v.scrollLeft+=dx;updateGesture(e);}
  gesture.raf=requestAnimationFrame(autoScroll);
}
function endGesture(cancel=false){
  if(!gesture)return;const g=gesture;gesture=null;cancelAnimationFrame(g.raf);$('selectionBox').hidden=true;
  try{$('noteArea').releasePointerCapture(g.pointer);}catch{}
  if(cancel){score=g.before.score;selected=new Set(g.ids);}
  else{
    if(g.kind==='box'&&!g.moved&&g.place){
      const unit=gridTicks(),tick=Math.min(score.end-1,Math.max(0,stepTick(!g.last.altKey?Math.floor(g.point.tick/unit)*unit:g.point.tick)));
      const note={id:nextId(),part:activePart,midi:g.point.midi,tick,duration:Math.max(1,Math.min(score.end-tick,stepTick(unit))),velocity:90};
      score.notes.push(note);selected=new Set([note.id]);
    }
    if(g.kind==='move'&&!g.moved){score.notes=score.notes.filter(n=>n.id!==g.anchor.id);selected.delete(g.anchor.id);}
    try{validateScore(score);if(JSON.stringify(score)!==JSON.stringify(g.before.score))remember(g.before);}
    catch(e){score=g.before.score;error(e.message);}
  }
  render();
}
$('noteArea').addEventListener('pointerdown',e=>{beginNote(e);if(gesture)gesture.raf=requestAnimationFrame(autoScroll);});
$('noteArea').addEventListener('pointermove',e=>{if(gesture?.pointer===e.pointerId){updateGesture(e);if(gesture.kind!=='box'||e.pointerType!=='touch')e.preventDefault();}});
$('noteArea').addEventListener('pointerup',e=>{if(gesture?.pointer===e.pointerId)endGesture();});$('noteArea').addEventListener('pointercancel',e=>{if(gesture?.pointer===e.pointerId)endGesture(true);});
$('ruler').onpointerdown=e=>{if(e.button!==0||textEditing)return;stop();cursor=Math.min(score.end,snapPosition((e.clientX-$('ruler').getBoundingClientRect().left)/px*score.ppq));renderCursor();};
for(const id of ['viewport','partTabs'])$(id).addEventListener('wheel',e=>{
  if(e.ctrlKey||e.metaKey||id==='viewport'&&!e.target.closest('#ruler,#markerLane,#corner'))return;
  const viewport=$(id),delta=Math.abs(e.deltaY)>Math.abs(e.deltaX)?e.deltaY:e.deltaX;
  const unit=e.deltaMode===1?ROW:e.deltaMode===2?viewport.clientWidth-(id==='viewport'?KEY:0):1;
  if(delta){e.preventDefault();viewport.scrollLeft+=delta*unit;}
},{passive:false});
let scrollFrame=0;$('viewport').onscroll=()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;renderTimeline();});};window.addEventListener('resize',()=>renderTimeline());
for(const [id,fn]of Object.entries({zoomIn:()=>px=Math.min(384,px*1.5),zoomOut:()=>px=Math.max(24,px/1.5)}))$(id).onclick=()=>{endGesture(true);fn();render();};
$('grid').onchange=()=>{endGesture(true);render();};
function selectPart(id){endGesture(true);endKeyGesture(true);activePart=id;selected.clear();render();$(`part-${id}`).focus({preventScroll:true});}
$('partTabs').onclick=e=>{const tab=e.target.closest('[role=tab]');if(tab&&!tab.disabled)selectPart(Number(tab.dataset.part));};
$('partTabs').onkeydown=e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||textEditing)return;
  e.preventDefault();e.stopPropagation();const index=score.parts.findIndex(p=>p.id===activePart);
  selectPart(score.parts[e.key==='Home'?0:e.key==='End'?score.parts.length-1:(index+(e.key==='ArrowRight'?1:-1)+score.parts.length)%score.parts.length].id);
};
$('instrument').onchange=()=>change(()=>{const part=score.parts.find(p=>p.id===activePart),percussion=$('instrument').value==='drums',profile=defs.instruments.find(i=>i.gmProgram===(percussion?0:Number($('instrument').value))&&!!i.percussion===percussion);if(profile){part.program=profile.gmProgram;part.instrumentId=profile.id;if(percussion)part.percussion=true;else delete part.percussion;}});
$('partRange').onchange=()=>change(()=>{score.parts.find(p=>p.id===activePart).instrumentId=$('partRange').value;});
$('partName').onchange=()=>change(()=>{score.parts.find(p=>p.id===activePart).name=$('partName').value.trim()||t('パート');});
$('addPart').onclick=()=>change(()=>{if(score.parts.length>=64)throw Error('追加できるパートは64までです。');const id=Math.max(...score.parts.map(p=>p.id))+1,{channel,port,...part}=score.parts.find(p=>p.id===activePart);score.parts.push({...(part.percussion?{program:0,instrumentId:'piano-88'}:part),id,name:t('mmlPartName',{number:id})});activePart=id;selected.clear();});
$('deletePart').onclick=()=>change(()=>{if(score.parts.length===1)return;score.notes=score.notes.filter(n=>n.part!==activePart);if(score.controllers)score.controllers=score.controllers.filter(c=>c.part!==activePart);score.parts=score.parts.filter(p=>p.id!==activePart);activePart=score.parts[0].id;selected.clear();});
$('scoreTitle').onchange=()=>change(()=>{score.title=$('scoreTitle').value;});
$('songEnd').onchange=()=>change(()=>{score.end=Math.round(Number($('songEnd').value)*score.ppq);cursor=Math.min(cursor,score.end);});
function renderMarkerMenu(){
  const tempo=score.tempos.find(t=>t.tick===markerTick),signature=score.signatures.find(s=>s.tick===markerTick);
  $('markerPosition').textContent=labelPosition(markerTick);
  $('tempoBpm').value=+(tempo??score.tempos.findLast(t=>t.tick<=markerTick)).bpm.toFixed(3);
  const meter=(signature??scorePosition(score,markerTick)).signature;
  $('signatureNumerator').value=meter[0];$('signatureDenominator').value=meter[1];
  $('removeTempo').hidden=markerTick===0||!tempo;$('removeSignature').hidden=markerTick===0||!signature;
  $('markerCell').style.cssText=`left:${x(markerTick)}px;width:${Math.max(2,x(gridTicks()))}px`;
}
function openMarker(tick){
  if(textEditing)return;stop();cursor=markerTick=tick;renderCursor();
  if(sourceText!==null)return;
  error();renderMarkerMenu();$('markerMenu').showPopover();positionMenus();
}
$('markerLane').onclick=e=>{
  const b=e.target.closest('button'),unit=gridTicks();
  const tick=b?Number(b.dataset.tick):Math.round(Math.floor(Math.max(0,(e.clientX-$('markerLane').getBoundingClientRect().left)/px*score.ppq)/unit)*unit);
  if(tick<score.end)openMarker(tick);
};
$('markerLane').onkeydown=e=>{if(e.target===$('markerLane')&&['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();openMarker(Math.min(cursor,score.end-1));}};
function updateMarker(type,value){
  if(value===null&&markerTick===0)return;
  change(()=>{
    score[type]=score[type].filter(m=>m.tick!==markerTick);
    if(value!==null)score[type].push(type==='tempos'?{tick:markerTick,bpm:value}:{tick:markerTick,signature:value});
    score[type].sort((a,b)=>a.tick-b.tick);
  });renderMarkerMenu();positionMenus();
}
$('tempoBpm').onchange=()=>{if($('tempoBpm').reportValidity())updateMarker('tempos',Number($('tempoBpm').value));};
for(const id of ['signatureNumerator','signatureDenominator'])$(id).onchange=()=>{if($('signatureNumerator').reportValidity())updateMarker('signatures',[Number($('signatureNumerator').value),Number($('signatureDenominator').value)]);};
$('removeTempo').onclick=()=>updateMarker('tempos',null);$('removeSignature').onclick=()=>updateMarker('signatures',null);
$('markerForm').onsubmit=e=>{e.preventDefault();};
$('noteStart').onchange=()=>change(()=>{const first=chosen()[0];if(first)score.notes=moveNotes(score.notes,selected,Math.round(Number($('noteStart').value)*score.ppq)-first.tick,0,score.end);});
$('noteDuration').onchange=()=>change(()=>{const first=chosen()[0];if(first)score.notes=resizeNotes(score.notes,selected,Math.round(Number($('noteDuration').value)*score.ppq)-first.duration,score.end);});
$('noteVelocity').onchange=()=>change(()=>{const velocity=Number($('noteVelocity').value);score.notes=score.notes.map(n=>selected.has(n.id)?{...n,velocity}:n);});
function removeNotes(){change(()=>{score.notes=score.notes.filter(n=>!selected.has(n.id));selected.clear();});}
$('delete').onclick=removeNotes;
function selectAllNotes(){selected=new Set(score.notes.filter(n=>n.part===activePart).map(n=>n.id));renderNotes();renderProperties();}
$('selectAll').onclick=selectAllNotes;
function copyNotes(){const notes=chosen();if(notes.length){const start=Math.min(...notes.map(n=>n.tick));clipboard=notes.map(n=>({...n,tick:n.tick-start}));renderProperties();}}
function pasteNotes(){if(!clipboard)return;change(()=>{let id=nextId();const copied=clipboard.map(n=>({...n,id:id++,part:activePart,tick:n.tick+Math.round(cursor)}));score.notes.push(...copied);selected=new Set(copied.map(n=>n.id));});}
$('copyNotes').onclick=copyNotes;$('pasteNotes').onclick=pasteNotes;
document.addEventListener('keydown',e=>{
  if(worker||e.isComposing||document.querySelector('[popover]:popover-open'))return;
  if(gesture){
    if(e.key==='Escape')endGesture(true);
    if(['Escape','Delete','Backspace','ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)||((e.ctrlKey||e.metaKey)&&['a','c','v','z'].includes(e.key.toLowerCase())))e.preventDefault();
    return;
  }
  if(textEditing||e.target.closest('input,textarea,[contenteditable],dialog'))return;
  if(e.target.closest('select')&&!((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'))return;
  if(e.altKey)return;
  const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
  if(mod&&key==='z'){e.preventDefault();undo(e.shiftKey);}
  else if(mod&&key==='c'){e.preventDefault();copyNotes();}
  else if(mod&&key==='v'){e.preventDefault();pasteNotes();}
  else if(mod&&key==='a'){e.preventDefault();selectAllNotes();}
  else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeNotes();}
  else if(e.code==='Space'&&!e.target.closest('button,summary')){e.preventDefault();playing?pause():void play();}
  else if(e.key==='Escape'){selected.clear();render();}
  else if(!mod&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&selected.size){e.preventDefault();change(()=>{score.notes=moveNotes(score.notes,selected,e.key==='ArrowLeft'?-Math.round(gridTicks()):e.key==='ArrowRight'?Math.round(gridTicks()):0,e.key==='ArrowUp'?(e.shiftKey?12:1):e.key==='ArrowDown'?(e.shiftKey?-12:-1):0,score.end);});}
});

function getAudio(){return audio??=new (window.AudioContext||window.webkitAudioContext)();}
async function loadBuffer(midi,sound){const key=sound.id+':'+midi;if(!buffers.has(key)){const file=sound.files[noteName(midi)];if(!file)throw Error('音源の範囲外です。');const r=await fetch((sound.base+file).split('/').map(encodeURIComponent).join('/')+'?v='+sound.revision);if(!r.ok)throw Error('音源を取得できません。');buffers.set(key,await getAudio().decodeAudioData(await r.arrayBuffer()));}return buffers.get(key);}
function voice(buffer,start,duration,velocity,sound,control={},ctx=getAudio(),pool=voices){
  const node=ctx.createBufferSource(),gain=ctx.createGain();node.buffer=buffer;node.connect(gain);gain.gain.setValueAtTime(velocity/127*.35,start);
  const loop=control.midi===undefined?null:sound.loops?.[noteName(control.midi)];
  if(loop){if(loop[0]>=buffer.duration)throw Error('音源のループ位置が録音の長さを超えています。');node.loop=true;node.loopStart=loop[0];node.loopEnd=Math.min(loop[1],buffer.duration);}
  const release=control.cut?0:sound.release??(sound.id==='vsco-piano'?.5:undefined),end=start+(release===undefined?buffer.duration??duration:duration+release);
  let volume,pan,lfo,depth;
  if(control.states){
    volume=ctx.createGain();pan=ctx.createStereoPanner();gain.connect(volume);volume.connect(pan);pan.connect(ctx.destination);
    const states=control.states,time=control.time;
    let low=0,high=states.length;
    while(low<high){const mid=(low+high)>>1;if(states[mid].time<=time)low=mid+1;else high=mid;}
    const first=Math.max(0,low-1);high=states.length;
    while(low<high){const mid=(low+high)>>1;if(states[mid].time<time+end-start)low=mid+1;else high=mid;}
    const changes=states.slice(first,low);
    if(changes.some(s=>s.modulation>0)){lfo=ctx.createOscillator();depth=ctx.createGain();lfo.frequency.value=6;lfo.connect(depth);depth.connect(node.detune);lfo.start(start);lfo.stop(end);}
    for(const s of changes){const at=start+Math.max(0,s.time-time);volume.gain.setValueAtTime(s.gain,at);pan.pan.setValueAtTime(s.pan,at);node.detune.setValueAtTime(s.detune,at);if(depth)depth.gain.setValueAtTime(s.modulation,at);}
  }else gain.connect(ctx.destination);
  if(control.group)for(const [previous,at] of pool)if(previous.midiGroup===control.group&&at<=start&&previous.cutAt>start){previous.stop(start+.015);previous.cutAt=start+.015;previous.midiEnvelope.gain.cancelScheduledValues(start);previous.midiEnvelope.gain.setValueAtTime(previous.midiGain,start);previous.midiEnvelope.gain.linearRampToValueAtTime(0,start+.015);}
  node.midiGroup=control.group;node.cutAt=end;node.midiEnvelope=gain;node.midiGain=velocity/127*.35;
  node.start(start);
  if(release!==undefined){gain.gain.setValueAtTime(velocity/127*.35,start+duration);gain.gain.linearRampToValueAtTime(0,start+duration+release);node.stop(start+duration+release+.01);}
  pool.set(node,start);node.onended=()=>{pool.delete(node);node.disconnect();gain.disconnect();volume?.disconnect();pan?.disconnect();depth?.disconnect();lfo?.stop();lfo?.disconnect();};
}
function audioEvents(score,profiles){
  const performance=midiPerformance(score),drumParts=new Set(score.parts.filter(p=>p.percussion).map(p=>p.id));
  for(const part of performance.values())part.states=part.states.map(s=>({...s,time:secondsAt(score,s.tick)}));
  return score.notes.filter(n=>profiles.get(n.part)?.allowed.has(n.midi)).map(n=>{const part=performance.get(n.part),time=secondsAt(score,n.tick);return {note:n,sound:defs.soundsets.find(s=>s.id===profiles.get(n.part).defaultSoundset),time,duration:secondsAt(score,part.ends.get(n.id)??n.tick+n.duration)-time,control:{midi:n.midi,states:part.states,time,cut:part.cuts.has(n.id),...(drumParts.has(n.part)&&[42,44,46].includes(n.midi)?{group:n.part+':hihat'}:{})}};}).sort((a,b)=>a.time-b.time);
}
function stop(cut=true){endKeyGesture(true);playEpoch++;paused=false;if(playing){clearInterval(playing.timer);cancelAnimationFrame(playing.frame);cursor=playing.startTick;playing=null;}if(cut){for(const node of voices.keys()){try{node.stop();}catch{}}voices.clear();}$('play').setAttribute('aria-pressed','false');$('play').textContent='▶';$('play').setAttribute('aria-label',t('再生'));$('play').title=t('再生');renderCursor();}
function pause(){if(!playing)return;const {start,span,endCycle}=playing,elapsed=Math.max(0,getAudio().currentTime-start),tick=tickAt(score,elapsed>=(endCycle+1)*span?span:elapsed%span);stop();cursor=tick;paused=true;renderCursor();}
async function play(){
  if(textEditing)return;
  const resume=paused;stop();const epoch=playEpoch;try{
    const events=audioEvents(score,partProfiles);if(!events.length)return;
    const ctx=getAudio();await ctx.resume();if(epoch!==playEpoch)return;
    const pitches=new Map(events.map(e=>[e.sound.id+':'+e.note.midi,e]));await Promise.all([...pitches.values()].map(e=>loadBuffer(e.note.midi,e.sound)));if(epoch!==playEpoch)return;
    const looping=$('loop').getAttribute('aria-pressed')==='true',from=looping&&!resume?0:Math.min(cursor,score.end-1),begin=secondsAt(score,from),span=secondsAt(score,score.end);
    const first=events.findIndex(e=>e.time>=begin),session={start:ctx.currentTime+.08-begin,startTick:from,span,next:first<0?events.length:first,eventCount:events.length,cycle:0,endCycle:looping?Infinity:0,timer:0,frame:0};
    // 途中再生では開始位置をまたぐ長音だけ残りの音長で鳴らす。
    for(const e of events)if(e.time<begin&&e.time+e.duration>begin)voice(buffers.get(e.sound.id+':'+e.note.midi),ctx.currentTime+.08,e.time+e.duration-begin,e.note.velocity,e.sound,{...e.control,time:begin});
    playing=session;$('play').setAttribute('aria-pressed','true');$('play').textContent='Ⅱ';$('play').setAttribute('aria-label',t('一時停止'));$('play').title=t('一時停止');error();
    function schedule(){
      if(playing!==session)return;
      let count=0;
      while(events.length&&count++<10000){
        if(session.next===events.length){if(session.cycle>=session.endCycle)break;session.next=0;session.cycle++;}
        const e=events[session.next],at=session.start+session.cycle*span+e.time;if(at>ctx.currentTime+.15)break;
        if(at>=ctx.currentTime-.02)voice(buffers.get(e.sound.id+':'+e.note.midi),Math.max(ctx.currentTime,at),e.duration,e.note.velocity,e.sound,e.control);
        session.next++;
      }
      if(ctx.currentTime>=session.start+(session.endCycle+1)*span+.1){stop(false);return;}
      if(ctx.currentTime-session.start>(session.cycle+2)*span){session.cycle=Math.floor((ctx.currentTime-session.start)/span);session.next=0;}
    }
    function frame(){if(playing!==session)return;const elapsed=Math.max(0,ctx.currentTime-session.start);cursor=tickAt(score,elapsed>=(session.endCycle+1)*span?span:elapsed%span);renderCursor();session.frame=requestAnimationFrame(frame);}
    schedule();session.timer=setInterval(schedule,25);frame();
  }catch(e){if(epoch===playEpoch){stop();error(e.message);}}
}
$('play').onclick=()=>playing?pause():void play();
$('stop').onclick=()=>{stop();cursor=0;renderCursor();};
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
async function previewKey(midi,session){
  if(keyGesture!==session||session.epoch!==playEpoch||!instrument?.allowed.has(midi))return;
  const sound=defs.soundsets.find(s=>s.id===instrument.defaultSoundset);
  try{
    await getAudio().resume();if(keyGesture!==session||session.epoch!==playEpoch)return;
    const buffer=await loadBuffer(midi,sound);
    if(keyGesture===session&&session.epoch===playEpoch)voice(buffer,getAudio().currentTime,.4,90,sound,{midi,...(instrument.percussion&&[42,44,46].includes(midi)?{group:activePart+':hihat'}:{})});
  }catch(e){if(keyGesture===session&&session.epoch===playEpoch)error(e.message);}
}
function endKeyGesture(cancel=false){
  const g=keyGesture;if(!g)return;const pointer=g.pointer;g.pointer=null;
  if(cancel||g.moved)keyGesture=null;
  if(pointer!==null)try{$('keyboard').releasePointerCapture(pointer);}catch{}
}
$('keyboard').onclick=e=>{if(e.detail!==0)return;const b=e.target.closest('.piano-key');if(b){const g=keyGesture={pointer:null,last:Number(b.dataset.midi),epoch:playEpoch};g.queue=previewKey(g.last,g);}};
$('keyboard').onpointerdown=e=>{
  const b=e.target.closest('.piano-key');if(!b||e.button!==0||e.isPrimary===false||keyGesture?.pointer!=null)return;
  e.preventDefault();b.focus({preventScroll:true});
  const g=keyGesture={pointer:e.pointerId,last:Number(b.dataset.midi),epoch:playEpoch};
  $('keyboard').setPointerCapture(e.pointerId);g.queue=previewKey(g.last,g);
};
$('keyboard').onpointermove=e=>{
  const g=keyGesture;if(!g||g.pointer!==e.pointerId)return;e.preventDefault();
  const b=document.elementFromPoint(e.clientX,e.clientY)?.closest('.piano-key'),midi=b?Number(b.dataset.midi):null;
  if(midi===g.last)return;g.moved=true;
  if(midi!==null){
    const from=g.last??midi,distance=Math.abs(midi-from);
    for(let i=distance?1:0;i<=distance;i++){const pitch=from+Math.sign(midi-from)*i;g.queue=g.queue.then(()=>previewKey(pitch,g));}
  }
  g.last=midi;
};
$('keyboard').onpointerup=e=>{if(keyGesture?.pointer===e.pointerId)endKeyGesture();};
for(const type of ['pointercancel','lostpointercapture'])$('keyboard').addEventListener(type,e=>{if(keyGesture?.pointer===e.pointerId)endKeyGesture(true);});
window.addEventListener('blur',()=>endKeyGesture(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});

function compile(input){
  if(worker)return Promise.reject(Error('変換中です。'));
  stop();document.querySelector('main').inert=true;error();
  return new Promise((resolve,reject)=>{
    const w=new Worker('./mml-worker.js',{type:'module'});worker=w;
    const done=(value,err)=>{clearTimeout(importTimer);w.terminate();worker=null;document.querySelector('main').inert=false;error();err?reject(Error(err)):resolve(value);};
    w.onmessage=e=>done(input.midiOnly?e.data.bytes:e.data.score,e.data.error);w.onerror=e=>done(null,e.message||'MML変換器の読み込みに失敗しました。');importTimer=setTimeout(()=>done(null,'変換に時間がかかりすぎたため中止しました。'),10000);w.postMessage({...input,language:currentLanguage()});
  });
}
function download(body,name,type){const url=URL.createObjectURL(new Blob([body],{type})),a=document.createElement('a');a.href=url;a.download=name.replace(/[<>:"/\\|?*]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function saveAudio(format){
  if(audioExporting||textEditing)return;
  audioExporting=true;stop();error();$('saveMenu').hidePopover();$('save').disabled=true;$('save').textContent=t('保存中…');$('save').setAttribute('aria-busy','true');
  let encoder;
  try{
    const current=clone(score),events=audioEvents(current,partProfiles),filename=current.title+'.'+format;
    const pitches=new Map(events.map(e=>[e.sound.id+':'+e.note.midi,e]));await Promise.all([...pitches.values()].map(e=>loadBuffer(e.note.midi,e.sound)));
    let duration=secondsAt(current,current.end);
    for(const e of events){const buffer=buffers.get(e.sound.id+':'+e.note.midi),release=e.control.cut?0:e.sound.release??(e.sound.id==='vsco-piano'?.5:undefined);duration=Math.max(duration,e.time+(release===undefined?buffer.duration:e.duration+release));}
    // ponytail: 曲全体のPCMをメモリに保持する。長時間の書き出しには分割レンダリングへ切り替える。
    const rate=44100,ctx=new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(2,Math.ceil((duration+.02)*rate),rate),pool=new Map();
    for(const e of events)voice(buffers.get(e.sound.id+':'+e.note.midi),e.time,e.duration,e.note.velocity,e.sound,e.control,ctx,pool);
    const rendered=await ctx.startRendering();encoder=new Worker('./'+format+'-worker.js');
    const request=(data,transfer=[])=>new Promise((resolve,reject)=>{encoder.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data);encoder.onerror=encoder.onmessageerror=()=>reject(Error('音声を書き出せませんでした。'));encoder.postMessage(data,transfer);});
    await request({type:'init'});
    for(let start=0;start<rendered.length;start+=rate*30){const left=rendered.getChannelData(0).slice(start,start+rate*30),right=rendered.getChannelData(1).slice(start,start+rate*30);await request({type:'encode',left,right},[left.buffer,right.buffer]);}
    const {blob}=await request({type:'finish'});download(blob,filename,blob.type);
  }catch(e){error(e.message);}
  finally{encoder?.terminate();audioExporting=false;$('save').disabled=textEditing;$('save').textContent=t('保存 ▾');$('save').setAttribute('aria-busy','false');}
}
$('saveMp3').onclick=()=>saveAudio('mp3');$('saveOgg').onclick=()=>saveAudio('ogg');
$('saveMml').onclick=()=>attempt(()=>{download(exportSource(),score.title+'.mml','text/plain;charset=utf-8');$('saveMenu').hidePopover();});
$('saveMidi').onclick=async()=>{try{const bytes=await compile({text:exportSource(),midiOnly:true});download(bytes,score.title+'.mid','audio/midi');$('saveMenu').hidePopover();}catch(e){error(e.message);}};
$('copyMml').onclick=async e=>{e.preventDefault();try{const text=exportSource();if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);else{const previous=$('mml').value;$('mmlPanel').open=true;try{$('mml').value=text;$('mml').select();if(!document.execCommand('copy'))throw Error('コピーできませんでした。「MMLを保存」で取得してください。');}finally{$('mml').value=previous;}}}catch(e){error(e.message);}};
$('editMml').onclick=()=>{stop();textEditing=true;render();$('mml').focus();};$('cancelMml').onclick=()=>{textEditing=false;render();error();};
$('applyMml').onclick=async()=>{const text=$('mml').value;$('applyMml').disabled=true;try{const parsed=await compile({text});const before=snapshot();score=parsed;sourceText=text;cursor=0;selected.clear();textEditing=false;remember(before);render();error();}catch(e){error(e.message);}finally{$('applyMml').disabled=false;}};
$('enableGui').onclick=()=>{remember(snapshot());sourceText=null;for(const part of score.parts){const profile=profileFor(part);if(profile)part.instrumentId=profile.id;}render();error();};
async function loadFile(file){
  if(!file||textEditing)return;
  try{if(!/\.(mml|midi?)$/i.test(file.name))throw Error('MMLまたはMIDIファイルを選んでください。');if(file.size>1024*1024)throw Error('試作では1MB以下のファイルを使用してください。');stop();const isMml=/\.mml$/i.test(file.name),text=isMml?await file.text():null,parsed=await compile(isMml?{text}:{buffer:await file.arrayBuffer()});remember(snapshot());score=parsed;sourceText=text;selected.clear();cursor=0;activePart=score.parts[0].id;render();error();}catch(e){error(e.message);}
}
$('load').onclick=()=>$('file').click();$('file').onchange=async()=>{await loadFile($('file').files[0]);$('file').value='';};
document.querySelector('.editor').ondragover=e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();};
document.querySelector('.editor').ondrop=e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();void loadFile(e.dataTransfer.files[0]);}};
$('newScore').onclick=()=>{if(textEditing)return;stop();remember(snapshot());score=emptyScore(instrument);activePart=1;cursor=0;selected.clear();sourceText=null;render();error();};
function normalizeSearch(value){return value.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g,char=>String.fromCharCode(char.charCodeAt(0)-0x60));}
function filterTemplates(){const query=normalizeSearch($('templateSearch').value.trim());let visible=0;for(const row of $('templateSongs').children){row.hidden=!row.dataset.search.includes(query);if(!row.hidden)visible++;}$('templateEmpty').textContent=t('該当する曲がありません');$('templateEmpty').hidden=!!visible;}
function populateTemplates(){
  const menu=$('templateSongs'),collator=new Intl.Collator(currentLanguage());menu.replaceChildren();
  for(const song of [...catalog].sort((a,b)=>collator.compare(currentLanguage()==='ja'?a.reading_ja||a.title:localized(a,'title'),currentLanguage()==='ja'?b.reading_ja||b.title:localized(b,'title')))){
    const best=song.versions.find(v=>v.arranged_for===instrument?.arrangedFor)??song.versions[0],row=document.createElement('div');row.className='template-song';
    const title=document.createElement('button');title.className='template-title';title.dataset.sample=best.id;title.append(document.createTextNode(localized(song,'title')+' '));
    const composer=document.createElement('span');composer.className='template-composer';composer.textContent=localized(song,'composer');title.append(composer);
    const versions=document.createElement('div');versions.className='template-versions';
    for(const item of song.versions){const button=document.createElement('button');button.className='button';button.dataset.sample=item.id;button.textContent=localized(item,'label');if(item.arranged_for===instrument?.arrangedFor)button.classList.add('matching');versions.append(button);}
    row.dataset.search=normalizeSearch([song.title,song.title_ja,song.title_en,song.composer,song.composer_ja,song.composer_en,song.reading_ja].filter(Boolean).join(' '));row.append(title,versions);menu.append(row);
  }
  filterTemplates();
}
$('templateSearch').oninput=()=>{if(catalog)filterTemplates();};
$('templateMenu').addEventListener('toggle',async e=>{
  if(e.newState!=='open')return;
  try{if(catalog===null){const r=await fetch('samples/mml-index.json',{cache:'no-cache'});if(!r.ok)throw Error('曲目一覧を読み込めませんでした。');catalog=(await r.json()).songs;}populateTemplates();positionMenus();if($('templateMenu').matches(':popover-open'))$('templateSearch').focus({preventScroll:true});}
  catch(e){$('templateEmpty').textContent=t(e.message);$('templateEmpty').hidden=false;}
});
$('templateMenu').onclick=async e=>{
  const id=e.target.closest('[data-sample]')?.dataset.sample;if(!id||!catalog||textEditing||worker||document.querySelector('main').inert)return;
  const song=catalog.find(s=>s.versions.some(v=>v.id===id)),item=song?.versions.find(v=>v.id===id);if(!item)return;
  $('templateMenu').hidePopover();stop();document.querySelector('main').inert=true;
  try{
    const r=await fetch('samples/'+encodeURIComponent(item.file),{cache:'no-cache',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('楽譜を読み込めませんでした。');const parsed=await compile({text:await r.text()});
    const parts=new Map(),ids=new Map(),controllers=[];
    for(const part of parsed.parts){
      const changes=(parsed.controllers??[]).filter(c=>c.part===part.id),key=`${part.program??0}:${part.instrumentId??''}:${JSON.stringify(changes.map(({part,...c})=>c))}`;
      if(!parts.has(key)){parts.set(key,{...part,name:gmNames[part.program??0]??part.name});controllers.push(...changes);}
      ids.set(part.id,parts.get(key).id);
    }
    parsed.parts=[...parts.values()];for(const note of parsed.notes)note.part=ids.get(note.part);
    if(parsed.controllers)parsed.controllers=controllers;
    remember(snapshot());score=parsed;score.title=localized(song,'title');sourceText=null;selected.clear();cursor=0;activePart=score.parts[0].id;render();$('viewport').scrollLeft=0;$('viewport').focus({preventScroll:true});error();
  }
  catch(e){error(e.message);}finally{document.querySelector('main').inert=false;}
};
const menus=[...document.querySelectorAll('[popovertarget]:not([popovertargetaction="hide"])')].map(button=>[$(button.getAttribute('popovertarget')),button]);
function positionMenus(){
  const markerMenu=$('markerMenu');
  if(markerMenu.matches(':popover-open')){
    const lane=$('markerLane').getBoundingClientRect(),viewport=$('viewport').getBoundingClientRect(),left=lane.left+x(markerTick);
    if(left<viewport.left+KEY||left>=viewport.left+$('viewport').clientWidth)markerMenu.hidePopover();
    else{
      markerMenu.style.left=Math.max(8,Math.min(left,document.documentElement.clientWidth-markerMenu.offsetWidth-8))+'px';
      markerMenu.style.top=Math.max(8,Math.min(lane.bottom+4,window.innerHeight-markerMenu.offsetHeight-8))+'px';
    }
  }
  for(const [menu,button] of menus){
    if(!menu.matches(':popover-open'))continue;
    const viewportWidth=document.documentElement.clientWidth;menu.style.maxWidth=Math.max(0,viewportWidth-16)+'px';
    const rect=button.getBoundingClientRect(),below=rect.bottom+5,width=menu.offsetWidth,height=menu.offsetHeight;
    menu.style.left=Math.max(8,Math.min(rect.right-width,viewportWidth-width-8))+'px';
    menu.style.top=Math.max(8,Math.min(below+height<=window.innerHeight-8?below:rect.top-height-5,window.innerHeight-height-8))+'px';
  }
}
for(const [menu,button] of menus){
  menu.addEventListener('toggle',e=>{if(e.newState==='open'){positionMenus();}});
  menu.addEventListener('click',e=>{if(e.target.closest('[data-close-menu]')){const focused=menu.contains(document.activeElement);menu.hidePopover();if(focused)button.focus({preventScroll:true});}});
}
window.addEventListener('resize',positionMenus);window.addEventListener('scroll',positionMenus,true);
$('language').onchange=async()=>{const control=$('language');control.disabled=true;try{await loadLanguage(control.value);translateEditor();render();if(catalog)populateTemplates();error();}catch(e){control.value=currentLanguage();error(e.message);}finally{control.disabled=false;}};
translateEditor();render();$('viewport').scrollLeft=0;
