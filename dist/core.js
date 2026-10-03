export const NOTE_NAMES = 'F3 G3 C4 D4 E4 F4 G4 A4 A#4 B4 C5 C#5 D5 D#5 E5 F5 F#5 G5 G#5 A5 A#5 B5 C6 C#6 D6 D#6 E6 F6 G6 A6'.split(' ');
const PITCHES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export const MAX_STEPS = 16384;
export const MAX_NOTES = 100000;
export function noteName(midi) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) throw new Error('音の高さが不正です。');
  return PITCHES[midi % 12] + (Math.floor(midi / 12) - 1);
}
export function noteNumber(name) {
  const match = /^([A-G]#?)(-?\d+)$/.exec(name);
  if (!match) throw new Error('音名が不正です。');
  const pitch = PITCHES.indexOf(match[1]);
  const midi = (Number(match[2]) + 1) * 12 + pitch;
  if (pitch < 0 || midi < 0 || midi > 127) throw new Error('音名が不正です。');
  return midi;
}
export const ALLOWED = new Set(NOTE_NAMES.map(noteNumber));
export const keyOf = note => `${note.step}:${note.midi}`;
export function validateNote(note, length) {
  if (!Number.isInteger(note.step) || note.step < 0 || note.step >= length || !Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127) throw new Error('ステップまたは音の高さが不正です。');
}
export function serialize(notes, length, stepMs, metadata = {}) {
  if (!Number.isInteger(length) || length < 1 || length > MAX_STEPS) throw new Error('ステップ数が不正です。');
  if (!Number.isSafeInteger(stepMs) || stepMs <= 0) throw new Error('再生間隔は正の整数msにしてください。');
  const header = ['stepscore', 'version=1', `step_ms=${stepMs}`];
  for (const [key, value] of Object.entries(metadata)) {
    if (!key || /[,=\r\n]/.test(key) || typeof value !== 'string' || /[\r\n]/.test(value)) throw new Error('メタデータが不正です。改行は使えません。');
    if (!['version', 'step_ms'].includes(key)) header.push(`${key}=${value.replace(/%/g,'%25').replace(/,/g,'%2C')}`);
  }
  const rows = Array.from({length}, () => new Set());
  for (const note of notes) {
    validateNote(note, length);
    if (!ALLOWED.has(note.midi)) throw new Error('対応外の音を解決してから出力してください。');
    rows[note.step].add(note.midi);
  }
  return header.join(',') + '\n' + rows.map(row => [...row].sort((a,b)=>a-b).map(noteName).join(',')).join('\n') + '\n';
}
export function parseText(text) {
  const rows=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  if(rows.length>1&&rows.at(-1)==='')rows.pop();
  const fields=rows.shift().split(','),values=new Map();
  if(fields.shift()!=='stepscore')throw new Error('TXTの1行目にstepscoreのメタデータが必要です。');
  for(const field of fields){
    const separator=field.indexOf('='),key=field.slice(0,separator),value=field.slice(separator+1);
    if(separator<=0||values.has(key))throw new Error('メタデータの書式が不正か、キーが重複しています。');
    if(/%(?!25|2C)/.test(value))throw new Error('メタデータのエスケープが不正です。%25と%2Cを使ってください。');
    values.set(key,value.replace(/%25|%2C/g,escape=>escape==='%25'?'%':','));
  }
  const metadata=Object.fromEntries(values);
  if(!values.has('version'))throw new Error('stepscoreにはversionが必要です。');
  if(metadata.version!=='1')throw new Error('対応していないstepscoreのversionです。');
  const stepMs=Number(metadata.step_ms);
  if(!/^\d+$/.test(metadata.step_ms??'')||!Number.isSafeInteger(stepMs)||stepMs<=0)throw new Error('step_msは正の整数で指定してください。');
  if(!rows.length||rows.length>MAX_STEPS)throw new Error('TXTは1〜16,384ステップにしてください。');
  const unique=new Map();let sourceCount=0;
  for(const [step,row]of rows.entries()){
    if(!row.trim())continue;
    for(const name of row.split(',')){
      if(++sourceCount>MAX_NOTES)throw new Error('ノート数の上限（100,000音）を超えています。');
      let midi;try{midi=noteNumber(name.trim());}catch{throw new Error(`TXTの${step+2}行目の音名が不正です：${name.trim().slice(0,40)}`);}
      const note={step,midi};unique.set(keyOf(note),note);
    }
  }
  return {notes:[...unique.values()],length:rows.length,stepMs,metadata,sourceCount};
}
export function validateMidiHeader(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length > 10 * 1024 * 1024) throw new Error('MIDIは10MB以下にしてください。');
  if (bytes.length < 14 || String.fromCharCode(...bytes.slice(0,4)) !== 'MThd') throw new Error('MIDIファイルを選んでください。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4) !== 6 || view.getUint16(8) > 1 || view.getUint16(10) === 0) throw new Error('形式0または1のMIDIファイルに対応しています。');
  if (view.getUint16(12) & 0x8000) throw new Error('SMPTE時間形式のMIDIには対応していません。PPQ形式で書き出してください。');
  if (!view.getUint16(12)) throw new Error('MIDIの時間解像度が不正です。');
}
export function convertMidi(midi, {tracks, subdivision, transpose = 0, minimumSteps = 16}) {
  if (![1,2,3,4,6,8].includes(subdivision) || !Number.isInteger(transpose) || Math.abs(transpose) > 24) throw new Error('変換設定が不正です。');
  if(![1,16].includes(minimumSteps))throw new Error('最小ステップ数が不正です。');
  if (!Number.isFinite(midi.header.ppq) || midi.header.ppq <= 0 || !tracks.length || tracks.some(index => !Number.isInteger(index) || !midi.tracks[index])) throw new Error('トラックを選択してください。');
  const selected = tracks.flatMap(index=>midi.tracks[index].notes);
  if (selected.length > MAX_NOTES) throw new Error('ノート数の上限（100,000音）を超えています。');
  let endTick = tracks.reduce((end,index)=>Math.max(end,midi.tracks[index].endOfTrackTicks ?? 0),0);
  if (!Number.isFinite(endTick) || endTick < 0) throw new Error('MIDIの終端時刻が不正です。');
  const unique = new Map();
  for (const note of selected) {
    if (!Number.isFinite(note.ticks) || note.ticks < 0 || !Number.isFinite(note.durationTicks) || note.durationTicks < 0) throw new Error('MIDIの時刻が不正です。');
    const converted = {step:Math.round(note.ticks / midi.header.ppq * subdivision), midi:note.midi + transpose};
    validateNote(converted, MAX_STEPS);
    endTick = Math.max(endTick, note.ticks + note.durationTicks);
    unique.set(keyOf(converted), converted);
  }
  const notes = [...unique.values()];
  const length = notes.reduce((end,note)=>Math.max(end,note.step+1),Math.max(minimumSteps,Math.ceil(endTick / midi.header.ppq * subdivision)));
  if (length > MAX_STEPS) throw new Error('ステップ数の上限（16,384）を超えています。細かさを下げてください。');
  return {notes, length, sourceCount:selected.length, merged:selected.length-notes.length};
}
export function suggestMidiTranspositions(midi, settings) {
  const original=convertMidi(midi,{...settings,transpose:0}),counts=new Map(),candidates=[];
  for(const note of original.notes)counts.set(note.midi,(counts.get(note.midi)||0)+1);
  for(let transpose=-24;transpose<=24;transpose++){
    let outside=0,valid=true;
    for(const [pitch,count]of counts){
      const moved=pitch+transpose;if(moved<0||moved>127){valid=false;break;}
      if(!ALLOWED.has(moved))outside+=count;
    }
    if(valid)candidates.push({transpose,outside,total:original.notes.length});
  }
  return candidates.sort((a,b)=>a.outside-b.outside||Math.abs(a.transpose)-Math.abs(b.transpose)||a.transpose-b.transpose).slice(0,3);
}
