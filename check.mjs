import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {NOTE_NAMES,ALLOWED,noteName,noteNumber,serialize,convertMidi,validateMidiHeader,MAX_STEPS,MAX_NOTES} from './dist/core.js';
import {TEMPLATES,templateScore} from './dist/templates.js';
const require=createRequire(import.meta.url),{Midi}=require('@tonejs/midi');
assert.equal(NOTE_NAMES.length,30);assert.equal(ALLOWED.size,30);
for(const name of NOTE_NAMES)assert.equal(noteName(noteNumber(name)),name);
const audioHash=createHash('sha256');
for(const name of NOTE_NAMES){const ogg=await readFile(`dist/audio/${name}.ogg`);assert.equal(ogg.subarray(0,4).toString(),'OggS',`${name}の音源`);assert(ogg.length>100,`${name}の音源が空です`);audioHash.update(name).update(ogg);}
const audioRevision=audioHash.digest('hex').slice(0,16);
assert((await readFile('dist/app.js','utf8')).includes(`.ogg?v=${audioRevision}`),'音源URLの更新識別子が音源の内容と一致しません');
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
  assert.equal(serialize(score.notes,score.length).split('\n').length-1,length,id);
  score.notes[0].midi=0;assert.equal(noteName(templateScore(template).notes[0].midi),opening[0]);
}
assert.throws(()=>templateScore({melody:[['C5',0]]}),/長さ/);
assert.throws(()=>templateScore({melody:[['F#4',4]]}),/対応外/);
await mkdir('.sites-runtime',{recursive:true});await writeFile('.sites-runtime/check.mid',bytes);
const html=await readFile('dist/index.html','utf8');assert(html.includes(`src="app.js?v=${audioRevision}"`),'再生スクリプトURLの更新識別子が音源の内容と一致しません');
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(match[1].startsWith('data:')||match[1]==='./')continue;await readFile('dist/'+match[1].split('?')[0]);}
process.stdout.write('確認成功: 30音・OGG音源30ファイル・音源更新識別子・テンプレート4曲・休符・末尾改行・MIDI変換・重複・移調・三連符・上限・ローカル参照\n');
