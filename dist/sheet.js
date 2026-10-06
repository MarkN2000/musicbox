import {MAX_STEPS, MAX_NOTES, validateNote, rhythmMetadata, noteName} from './core.js?v=45fa6b2982902f00';

const WIDTH=1448,HEIGHT=2048,SCALE=1.2,PAGE_WIDTH=WIDTH/SCALE,PAGE_HEIGHT=HEIGHT/SCALE,LEFT=40,RIGHT=PAGE_WIDTH-40;
let library;
async function getLibrary(){return library??=import('./vendor/vexflow-bravura-4.2.5.js').then(()=>window.Vex.Flow).catch(error=>{library=null;throw error;});}

// ponytail: 音長のないStepScoreは段単位で補完する。独立声部の復元には音長を持つ入力が必要。
export function sheetData({notes,length,subdivision,signature,stepMs,title,footer}){
  if(!Number.isSafeInteger(length)||length<1||length>MAX_STEPS||notes.length>MAX_NOTES||!Number.isSafeInteger(stepMs)||stepMs<1)throw new Error('楽譜の設定が不正です。');
  if(![1,2,3,4,6,8,12].includes(subdivision))throw new Error('このステップ単位は五線譜画像に対応していません。');
  const rhythm=rhythmMetadata({steps_per_quarter:String(subdivision),...(signature?{time_signature:signature.join('/')}:{})}),bar=signature?rhythm.beatsPerBar*subdivision:0;
  if(bar&&!Number.isSafeInteger(bar))throw new Error('小節境界がステップの途中に来るため、五線譜画像にできません。');
  const steps=Array.from({length},()=>new Set());
  for(const note of notes){validateNote(note,length);if(note.midi<21||note.midi>108)throw new Error('音の高さが不正です。');steps[note.step].add(note.midi);}
  const events=steps.map(step=>[...step].sort((a,b)=>a-b)),bass=notes.some(note=>note.midi<60),spans=[];
  for(let staff=0;staff<(bass?2:1);staff++){
    const list=[];
    events.forEach((event,step)=>{const pitches=event.filter(midi=>staff===0?midi>=60:midi<60);if(!pitches.length)return;
      if(list.length)list.at(-1).end=step;else if(step)list.push({start:0,end:step,notes:[]});list.push({start:step,end:length,notes:pitches});
    });
    spans.push(list.length?list:[{start:0,end:length,notes:[]}]);
  }
  const treble=notes.filter(note=>note.midi>=60).map(note=>note.midi),shift=treble.length&&treble.every(midi=>midi>=72)&&treble.some(midi=>midi>=93)?12:0;
  const data={events,length,subdivision,signature,bar,title,footer,bpm:Math.max(1,Math.round(60000/stepMs/subdivision)),bass,shift,spans,measures:[]};
  const durations=[];
  for(const denominator of [1,2,4,8,16,32]){
    for(const dots of [0,1]){const size=subdivision*4/denominator*(dots?1.5:1);if(Number.isInteger(size))durations.push({size,duration:String(denominator),dots,triplet:false});}
    const size=subdivision*4/denominator*2/3;if(subdivision%3===0&&Number.isInteger(size))durations.push({size,duration:String(denominator),dots:0,triplet:true});
  }
  durations.sort((a,b)=>b.size-a.size||Number(a.triplet)-Number(b.triplet));
  const positions=spans.map(()=>0),measureSize=bar||subdivision*4;
  for(let start=0;start<length;start+=measureSize){
    const end=Math.min(length,start+measureSize),parts=[];
    for(let staff=0;staff<spans.length;staff++){
      const pieces=[],list=spans[staff];while(list[positions[staff]].end<=start)positions[staff]++;
      for(let index=positions[staff];index<list.length&&list[index].start<end;index++){
        const span=list[index];let cursor=Math.max(start,span.start),stop=Math.min(end,span.end);
        if(!span.notes.length&&cursor===start&&stop===end&&end-start===measureSize){pieces.push({start,end,notes:[],duration:'1',dots:0,triplet:false,fullRest:true});continue;}
        while(cursor<stop){
          const limit=cursor%subdivision?Math.min(stop,cursor+subdivision-cursor%subdivision):stop,choice=durations.find(value=>value.size<=limit-cursor);
          if(!choice)throw new Error('このステップ単位は五線譜画像に対応していません。');
          const next=cursor+choice.size;pieces.push({...choice,start:cursor,end:next,notes:span.notes,onset:span.start,tieIn:span.notes.length>0&&cursor>span.start,tieOut:span.notes.length>0&&next<span.end});cursor=next;
        }
      }
      parts.push(pieces);
    }
    data.measures.push({start,end,parts});
  }
  return data;
}

function makeMeasure(VF,data,measure){
  const beams=[],tuplets=[],items=[];
  const voices=measure.parts.map((pieces,staff)=>{
    const notes=[],entries=[];let tuple=[];
    const finishTuple=()=>{if(tuple.length)tuplets.push(new VF.Tuplet(tuple,{num_notes:3,notes_occupied:2}));tuple=[];};
    for(const piece of pieces){
      const rest=!piece.notes.length,clef=staff===0?'treble':'bass',keys=rest?[staff===0?'b/4':'d/3']:piece.notes.map(midi=>noteName(midi-(staff===0?data.shift:0)).replace(/(-?\d+)$/,'/$1').toLowerCase());
      const note=new VF.StaveNote({clef,keys,duration:piece.duration+(piece.dots?'d':'')+(rest?'r':''),auto_stem:true,align_center:!!piece.fullRest});
      if(piece.fullRest)note.setIntrinsicTicks(VF.RESOLUTION*(piece.end-piece.start)/data.subdivision/4);
      if(piece.dots)VF.Dot.buildAndAttach([note],{all:true});
      if(!piece.triplet||piece.start%data.subdivision===0)finishTuple();if(piece.triplet)tuple.push(note);
      notes.push(note);entries.push({note,piece});
    }
    finishTuple();
    beams.push(...VF.Beam.generateBeams(notes,{groups:[new VF.Fraction(1,4)],beam_rests:false}));
    items.push(entries);return new VF.Voice({num_beats:4,beat_value:4}).setMode(VF.Voice.Mode.SOFT).addTickables(notes);
  });
  VF.Accidental.applyAccidentals(voices,'C');
  return {voices,beams,tuplets,items};
}
function formatterFor(VF,voices){const formatter=new VF.Formatter();voices.forEach(voice=>formatter.joinVoices([voice],{align_rests:false}));return formatter;}

function rowGeometry(data,measures){
  const diatonic=midi=>Math.floor(midi/12)*7+[0,0,1,1,2,3,3,4,4,5,5,6][midi%12];
  const extents=Array.from({length:data.bass?2:1},(_,staff)=>{
    const top=staff===0?77:57,bottom=staff===0?64:43,pitches=measures.flatMap(measure=>measure.parts[staff].flatMap(piece=>piece.notes)).map(midi=>midi-(staff===0?data.shift:0));
    const high=pitches.reduce((a,b)=>Math.max(a,b),top),low=pitches.reduce((a,b)=>Math.min(a,b),bottom);
    return {above:Math.max(0,diatonic(high)-diatonic(top))*5+35,below:Math.max(0,diatonic(bottom)-diatonic(low))*5+40};
  });
  const gap=data.bass?40+extents[0].below+extents[1].above+8:0;
  return {above:extents[0].above,gap,height:extents[0].above+gap+40+extents.at(-1).below+28};
}

export async function createSheet(input){
  const data=sheetData(input),VF=await getLibrary(),rows=[];
  // 小節単位で幅を測り、描画用オブジェクトは保持しない。
  for(let index=0;index<data.measures.length;index++){
    const measure=data.measures[index],made=makeMeasure(VF,data,measure);measure.minimum=formatterFor(VF,made.voices).format(made.voices,0).getMinTotalWidth()+24;
    let row=rows.at(-1);
    if(!row||row.measures.length===4||row.minimum+measure.minimum+80>RIGHT-LEFT){row={measures:[],minimum:0};rows.push(row);}
    if(measure.minimum+80>RIGHT-LEFT)throw new Error('音が密集しているため、五線譜画像の幅に収まりません。');
    row.measures.push(measure);row.minimum+=measure.minimum;
    if(index%16===15)await new Promise(resolve=>setTimeout(resolve,0));
  }
  const pages=[[]];let y=115;
  for(const row of rows){
    Object.assign(row,rowGeometry(data,row.measures));row.start=row.measures[0].start;row.end=row.measures.at(-1).end;
    const extra=(RIGHT-LEFT-80-row.minimum)/row.measures.length;row.widths=row.measures.map((measure,index)=>measure.minimum+extra+(index===0?80:0));
    if(y+row.height>PAGE_HEIGHT-50&&pages.at(-1).length){pages.push([]);y=90;}row.y=y;pages.at(-1).push(row);y+=row.height;
  }
  return {data,VF,pages};
}

export function drawSheetPage(sheet,page,canvas){
  const {data,VF,pages}=sheet;if(!pages[page])throw new Error('楽譜の設定が不正です。');
  canvas.width=WIDTH;canvas.height=HEIGHT;
  const context=new VF.Renderer(canvas,VF.Renderer.Backends.CANVAS).getContext();context.scale(SCALE,SCALE);context.setFillStyle('#fff');context.fillRect(0,0,PAGE_WIDTH,PAGE_HEIGHT);context.setFillStyle('#111');context.setStrokeStyle('#111');
  const text=canvas.getContext('2d');text.textAlign='center';text.font='26px serif';text.fillText(data.title,PAGE_WIDTH/2,45,RIGHT-LEFT);text.textAlign='left';text.font='18px serif';text.fillText(`♩ = ${data.bpm}`,LEFT,80);
  text.font='16px sans-serif';text.fillText(data.footer,LEFT,PAGE_HEIGHT-22);text.font='10px sans-serif';text.textAlign='right';text.fillText(`${page+1} / ${pages.length}`,RIGHT,PAGE_HEIGHT-22);text.textAlign='left';
  for(const row of pages[page]){
    let x=LEFT;const previous=[];
    if(data.bar){text.font='10px serif';text.fillText(String(row.start/data.bar+1),LEFT-8,row.y+row.above-10);}
    row.measures.forEach((measure,index)=>{
      const y=row.y+row.above-40,staves=measure.parts.map((_,staff)=>{
        const stave=new VF.Stave(x,y+staff*row.gap,row.widths[index]);
        if(index===0)stave.addClef(staff===0?'treble':'bass','default',staff===0&&data.shift?'8va':undefined);else stave.setBegBarType(VF.Barline.type.NONE);
        if(page===0&&row===pages[0][0]&&index===0&&data.signature)stave.addTimeSignature(data.signature.join('/'));
        stave.setEndBarType(!data.bar?VF.Barline.type.NONE:measure.end===data.length?VF.Barline.type.END:VF.Barline.type.SINGLE);stave.setContext(context).draw();return stave;
      });
      const noteX=Math.max(...staves.map(stave=>stave.getNoteStartX()));staves.forEach(stave=>stave.setNoteStartX(noteX));
      if(data.bass){if(index===0)new VF.StaveConnector(staves[0],staves[1]).setType(VF.StaveConnector.type.BRACE).setContext(context).draw();if(data.bar)new VF.StaveConnector(staves[0],staves[1]).setType(VF.StaveConnector.type.SINGLE_RIGHT).setContext(context).draw();}
      const made=makeMeasure(VF,data,measure);formatterFor(VF,made.voices).formatToStave(made.voices,staves[0],{align_rests:false});made.voices.forEach((voice,staff)=>voice.draw(context,staves[staff]));made.beams.forEach(beam=>beam.setContext(context).draw());made.tuplets.forEach(tuplet=>tuplet.setContext(context).draw());
      made.items.forEach((items,staff)=>{for(const item of items){
        const {piece,note}=item,indices=piece.notes.map((_,i)=>i);
        if(piece.tieIn)new VF.StaveTie({first_note:previous[staff]?.piece.onset===piece.onset?previous[staff].note:undefined,last_note:note,first_indices:indices,last_indices:indices}).setContext(context).draw();
        previous[staff]=piece.notes.length?item:null;
      }});
      x+=row.widths[index];
    });
    for(const item of previous){if(item?.piece.tieOut){const indices=item.piece.notes.map((_,i)=>i);new VF.StaveTie({first_note:item.note,first_indices:indices,last_indices:indices}).setContext(context).draw();}}
  }
}

export async function sheetBlob(canvas){
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.95));if(!blob||blob.type!=='image/webp')throw new Error('このブラウザではWebP画像を保存できません。');return blob;
}
