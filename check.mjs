import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {NOTE_NAMES,ALLOWED,noteName,noteNumber,serialize,convertMidi,validateMidiHeader,MAX_STEPS,MAX_NOTES} from './dist/core.js';
import {TEMPLATES,templateScore} from './dist/templates.js';
const require=createRequire(import.meta.url),{Midi}=require('@tonejs/midi');
assert.equal(NOTE_NAMES.length,30);assert.equal(ALLOWED.size,30);
for(const name of NOTE_NAMES)assert.equal(noteName(noteNumber(name)),name);
const audioHash=createHash('sha256');
for(const name of NOTE_NAMES){const ogg=await readFile(`dist/audio/${name}.ogg`);assert.equal(ogg.subarray(0,4).toString(),'OggS',`${name}の音源`);assert(ogg.length>100,`${name}の音源が空です`);audioHash.update(name).update(ogg);}
const audioRevision=audioHash.digest('hex').slice(0,16);
const app=await readFile('dist/app.js','utf8'),templatesRevision=createHash('sha256').update((await readFile('dist/templates.js','utf8')).replace(/\r\n/g,'\n')).digest('hex').slice(0,16);
assert(app.includes(`.ogg?v=${audioRevision}`),'音源URLの更新識別子が音源の内容と一致しません');
assert(app.includes(`from './templates.js?v=${templatesRevision}'`),'テンプレートURLの更新識別子が内容と一致しません');
assert(!ALLOWED.has(noteNumber('F#4')));assert(!ALLOWED.has(noteNumber('F#6')));
assert.equal(serialize([{step:1,midi:72},{step:1,midi:79},{step:1,midi:72},{step:1,midi:76},{step:3,midi:74}],5),'\nC5,E5,G5\n\nD5\n\n');
assert.equal(serialize([],3),'\n\n\n');
assert.throws(()=>serialize([{step:0,midi:66}],1),/対応外/);assert.throws(()=>serialize([{step:1,midi:72}],1),/不正/);
assert.throws(()=>validateMidiHeader(new Uint8Array(14).buffer),/MIDI/);
const midi=new Midi();midi.header.setTempo(120);const track=midi.addTrack();track.name='Melody';
track.addNote({midi:72,ticks:480,durationTicks:120});track.addNote({midi:76,ticks:480,durationTicks:120});track.addNote({midi:72,ticks:485,durationTicks:120});track.addNote({midi:66,ticks:720,durationTicks:120});track.addNote({midi:79,ticks:1200,durationTicks:960});
const drums=midi.addTrack();drums.channel=9;drums.name='Drums';drums.addNote({midi:36,ticks:0,durationTicks:100});
const bytes=midi.toArray();validateMidiHeader(bytes.buffer);const parsed=new Midi(bytes);assert(parsed.tracks[1].instrument.percussion);
const converted=convertMidi(parsed,{tracks:[0],subdivision:4});assert.equal(converted.notes.length,4);assert.equal(converted.merged,1);assert.equal(converted.notes[0].step,4);assert.equal(converted.length,18);assert(converted.notes.some(note=>!ALLOWED.has(note.midi)));
assert.equal(convertMidi(parsed,{tracks:[0],subdivision:3}).notes[0].step,3);
assert.equal(convertMidi(parsed,{tracks:[0],subdivision:4,transpose:12}).notes[0].midi,84);
const oldEnd=parsed.tracks[0].endOfTrackTicks;parsed.tracks[0].endOfTrackTicks=480*6;assert.equal(convertMidi(parsed,{tracks:[0],subdivision:4}).length,24);parsed.tracks[0].endOfTrackTicks=oldEnd;
assert.throws(()=>convertMidi(parsed,{tracks:[],subdivision:4}),/トラック/);
assert.throws(()=>convertMidi(parsed,{tracks:[0],subdivision:5}),/設定/);
assert.throws(()=>convertMidi({header:{ppq:480},tracks:[{notes:[{midi:72,ticks:MAX_STEPS*480,durationTicks:120}]}]},{tracks:[0],subdivision:4}),/不正|上限/);
assert.throws(()=>convertMidi({header:{ppq:480},tracks:[{notes:Array(MAX_NOTES+1).fill({midi:72,ticks:0,durationTicks:1})}]},{tracks:[0],subdivision:4}),/上限/);
const smpte=bytes.slice();smpte[12]=0xe7;assert.throws(()=>validateMidiHeader(smpte.buffer),/SMPTE/);
assert.throws(()=>validateMidiHeader(new ArrayBuffer(10*1024*1024+1)),/10MB/);
const templateExpectations=[['ode-to-joy',256,['E5','E5','F5','G5']],['fur-elise',50,['E6','D#6','E6','D#6']],['twinkle',192,['C5','C5','G5','G5']],['minuet',192,['G5','C5','D5','E5']]];
assert.equal(TEMPLATES.length,4);assert.equal(new Set(TEMPLATES.map(template=>template.id)).size,4);
for(const [id,length,opening] of templateExpectations){
  const template=TEMPLATES.find(item=>item.id===id),score=templateScore(template);
  assert.equal(score.length,length,id);assert.deepEqual(score.notes.slice(0,4).map(note=>noteName(note.midi)),opening,id);
  assert.equal((length-template.pickupBeats*4)%(template.beatsPerBar*4),0,id);
  assert(template.bpm>=20&&template.bpm<=300);assert(template.source.startsWith('https://'));
  assert(score.notes.every(note=>ALLOWED.has(note.midi)),id);
  const melody=templateScore({...template,accompaniment:[]}),keys=new Set(score.notes.map(note=>`${note.step}:${note.midi}`));
  assert(melody.notes.every(note=>keys.has(`${note.step}:${note.midi}`)),`${id}の旋律が失われています`);
  assert(score.notes.length>melody.notes.length*1.5,`${id}の伴奏が不足しています`);
  assert.equal(score.notes.length,keys.size,`${id}の同音重複`);
  const rows=serialize(score.notes,score.length).trimEnd().split('\n');
  assert(rows.filter(row=>row.includes(',')).length>=6,`${id}の和音が不足しています`);
  assert(rows.every(row=>!row||row.split(',').length<=4),`${id}の和音が多すぎます`);
  assert.equal(serialize(score.notes,score.length).split('\n').length-1,length,id);
  score.notes[0].midi=0;assert.equal(noteName(templateScore(template).notes[0].midi),opening[0]);
}
assert.throws(()=>templateScore({melody:[['C5',0]]}),/長さ/);
assert.throws(()=>templateScore({melody:[['F#4',4]]}),/対応外/);
const layered=templateScore({melody:[['C5',2]],accompaniment:[['C4,C5,E4',1],['D4',1],['',2]]});
assert.equal(layered.length,4);assert.equal(layered.notes.length,4);assert.equal(serialize(layered.notes,layered.length),'C4,E4,C5\nD4\n\n\n');
assert.throws(()=>templateScore({melody:[['C5',4]],accompaniment:[['F#4',4]]}),/対応外/);
assert.throws(()=>templateScore({melody:[['C5',4]],accompaniment:[['C4',0]]}),/長さ/);
await mkdir('.sites-runtime',{recursive:true});await writeFile('.sites-runtime/check.mid',bytes);
const html=await readFile('dist/index.html','utf8'),uiRevision=createHash('sha256').update(app.replace(/\r\n/g,'\n')).digest('hex').slice(0,16),cssRevision=createHash('sha256').update((await readFile('dist/style.css','utf8')).replace(/\r\n/g,'\n')).digest('hex').slice(0,16);
assert(html.includes(`src="app.js?v=${audioRevision}&templates=${templatesRevision}&ui=${uiRevision}"`),'スクリプトURLの更新識別子が内容と一致しません');
assert(html.includes(`href="style.css?v=${cssRevision}"`),'スタイルURLの更新識別子が内容と一致しません');
for(const match of app.matchAll(/\$\('([^']+)'\)/g))assert(html.includes(`id="${match[1]}"`),`UIがありません: ${match[1]}`);
assert(!/confirmReplace|beforeunload|confirmDialog/.test(app+html),'不要な確認が残っています');
// 描画と音声を外し、実際の履歴・リセット・キー操作を実行する。
const controls=new Map(),listeners=new Map();
const element=id=>{if(!controls.has(id))controls.set(id,{value:'',textContent:'',hidden:false,open:false,scrollLeft:0,scrollTop:0,replaceChildren(){}});return controls.get(id);};
for(const [id,value]of Object.entries({fileName:'edited',bpm:'84',subdivision:'6',interval:'119',transpose:'12'}))element(id).value=value;
element('scoreTitle').textContent='編集したMIDI';element('rollViewport').scrollLeft=90;element('rollViewport').scrollTop=180;
const ui=runInNewContext(`
  let notes=[{step:9,midi:72}],length=50,page=0,beatsPerBar=3,pickupBeats=.5,history=[],sourceMidi={name:'MIDI'},currentTemplate=null,currentCell={step:9,midi:72};
  ${app.slice(app.indexOf('function snapshot(){'),app.indexOf('function renderGrid(){'))}
  ${app.slice(app.indexOf('function undo(){'),app.indexOf('for(const template of TEMPLATES)'))}
  ${app.split('\n').find(line=>line.startsWith('function updateInterval(){'))}
  ({reset:()=>$('reset').onclick(),state:()=>({notes,length,beatsPerBar,pickupBeats,sourceMidi,currentCell,historyLength:history.length})});
`,{$:element,document:{addEventListener:(name,handler)=>listeners.set(name,handler)},midiSettings:()=>({tracks:[1,3]}),renderTracks:tracks=>{element('trackList').restored=tracks;},previewConversion(){},showTemplateInfo(){},render(){},stopPlayback(){},announce(){}});
const originalUI=JSON.stringify(ui.state());ui.reset();assert.equal(ui.state().length,32);assert.equal(ui.state().notes.length,0);assert.equal(ui.state().sourceMidi,null);assert.equal(element('interval').value,125);
let prevented=false;const key=meta=>({ctrlKey:!meta,metaKey:meta,shiftKey:false,altKey:false,key:'z',target:{closest:()=>null},preventDefault(){prevented=true;}});
listeners.get('keydown')(key(false));assert(prevented);assert.equal(JSON.stringify(ui.state()),originalUI);assert.equal(element('bpm').value,'84');assert.equal(element('fileName').value,'edited');assert.deepEqual(Array.from(element('trackList').restored),[1,3]);assert.equal(element('rollViewport').scrollTop,180);
ui.reset();listeners.get('keydown')({...key(false),target:{closest:()=>({})}});assert.equal(ui.state().notes.length,0,'入力欄の標準取り消しを妨げています');listeners.get('keydown')(key(true));assert.equal(JSON.stringify(ui.state()),originalUI);
for(let i=0;i<35;i++)ui.reset();assert.equal(ui.state().historyLength,30);
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(match[1].startsWith('data:')||match[1]==='./')continue;await readFile('dist/'+match[1].split('?')[0]);}
process.stdout.write('確認成功: 30音・OGG音源・更新識別子・テンプレート4曲・TXT形式・MIDI変換・上限・UI参照・リセット・Ctrl/Command+Z・MIDI設定と履歴の復元\n');
