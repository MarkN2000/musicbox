import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sheetData} from './dist/sheet.js';

const input={notes:[{step:0,midi:61},{step:1,midi:60},{step:2,midi:60},{step:4,midi:61},{step:4,midi:61}],length:8,subdivision:1,signature:[4,4],stepMs:500,title:'検査',footer:'自動生成の簡易譜面'};
const model=sheetData(input);assert.equal(model.bpm,120);assert.equal(model.events[4].length,1);assert.deepEqual(model.events[7],[]);
const held=sheetData({...input,subdivision:4,notes:[{step:0,midi:60},{step:4,midi:62}],length:8});assert.deepEqual(held.measures[0].parts[0].map(piece=>[piece.start,piece.end,piece.duration,piece.notes]),[[0,4,'4',[60]],[4,8,'4',[62]]],'空ステップは休符にせず音長にする');
const separate=sheetData({...input,subdivision:4,length:24,notes:[{step:0,midi:48},{step:0,midi:72},{step:2,midi:72},{step:8,midi:50},{step:8,midi:74}]});assert(separate.bass);assert.equal(separate.spans[1][0].end,8,'下段の音は上段の再発音で切らない');assert.equal(separate.spans[0][0].end,2,'同音の再発音も区切る');assert(separate.measures[0].parts[0].at(-1).tieOut);assert(separate.measures[1].parts[0][0].tieIn,'小節をまたぐ同じ発音はタイ');
for(const measure of separate.measures)for(const parts of measure.parts)assert.equal(parts.reduce((total,piece)=>total+piece.end-piece.start,0),measure.end-measure.start,'各段の音価の合計を保持する');
const empty=sheetData({...input,subdivision:4,length:32,notes:[]});assert(empty.measures.every(measure=>measure.parts[0].length===1&&measure.parts[0][0].fullRest));

assert.throws(()=>sheetData({...input,subdivision:7}));assert.throws(()=>sheetData({...input,signature:[3,8]}));assert.throws(()=>sheetData({...input,notes:[{step:8,midi:60}]}));assert.throws(()=>sheetData({...input,notes:[{step:0,midi:0}]}));assert.equal(sheetData({...input,signature:null}).bar,0);

let automation;try{automation=await import('playwright');}catch{automation=await import(pathToFileURL(resolve(dirname(process.execPath),'../node_modules/playwright/index.mjs')));}
const browser=await automation.chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto(process.argv[2]??'http://127.0.0.1:4173/');await page.waitForSelector('#instrument option',{state:'attached'});
  assert(!requests.some(url=>/sheet\.js|vexflow/.test(url)),'初期表示では譜面用ライブラリを読み込まない');
  const before=await page.locator('#txtPreview').inputValue();await page.locator('#save').click();await page.locator('#exportSheet').click();await page.locator('#sheetDialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#sheetCanvas').getAttribute('width'),'1448');assert.equal(await page.locator('#sheetCanvas').getAttribute('height'),'2048');assert.equal(await page.locator('#txtPreview').inputValue(),before);
  const downloadEvent=page.waitForEvent('download');await page.locator('#sheetSave').click();const download=await downloadEvent;assert(download.suggestedFilename().endsWith('-01.webp'));
  const bytes=await readFile(await download.path());assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');const chunks=[];for(let offset=12;offset<bytes.length;){chunks.push(bytes.subarray(offset,offset+4).toString());const size=bytes.readUInt32LE(offset+4);offset+=8+size+(size%2);}assert(chunks.includes('VP8 ')&&!chunks.includes('VP8L'),'不可逆WebPで保存する');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#sheetDialog').open);assert.equal(await page.evaluate(()=>document.activeElement.id),'save');
  // 三連符・極端な音域・複数ページを実際の描画で確認する。
  const rendered=await page.evaluate(async()=>{
    const {createSheet,drawSheetPage,sheetBlob}=await import('./sheet.js'),results=[];
    await createSheet({notes:[],length:1,subdivision:4,signature:[4,4],stepMs:150,title:'',footer:''});
    const VF=window.Vex.Flow,original=VF.Voice.prototype.addTickables,actual=[];
    VF.Voice.prototype.addTickables=function(notes){actual.push(notes.map(note=>note.getTicks().value()));return original.call(this,notes);};
    const verifyTicks=sheet=>{
      const expected=sheet.data.measures.flatMap(measure=>measure.parts.map(parts=>parts.map(piece=>VF.RESOLUTION*(piece.end-piece.start)/sheet.data.subdivision/4)));
      if(actual.length!==expected.length)throw new Error('段数が不一致');
      expected.forEach((notes,index)=>{if(notes.length!==actual[index].length||notes.some((ticks,note)=>Math.abs(ticks-actual[index][note])>1e-6))throw new Error('付点・三連符を含む実描画の音価が不一致');});actual.length=0;
    };
    const dotted=await createSheet({notes:[{step:0,midi:60},{step:6,midi:62},{step:8,midi:48},{step:9,midi:65}],length:32,subdivision:4,signature:[4,4],stepMs:150,title:'付点とタイ',footer:''});verifyTicks(dotted);
    const dotCanvas=document.createElement('canvas');dotted.pages.forEach((_,index)=>drawSheetPage(dotted,index,dotCanvas));verifyTicks(dotted);
    for(const subdivision of [1,2,3,4,6,8,12]){
      const notes=Array.from({length:80},(_,step)=>({step,midi:step%12===0?21:step%12===1?108:step%4===2?61:60})).filter(note=>subdivision<8||note.step%2===0),sheet=await createSheet({notes,length:81,subdivision,signature:[4,4],stepMs:150,title:'簡易五線譜の検査',footer:'自動生成の簡易譜面'}),canvas=document.createElement('canvas');
      if(!sheet.pages.length)throw new Error('ページなし');verifyTicks(sheet);
      for(let index=0;index<sheet.pages.length;index++)drawSheetPage(sheet,index,canvas);verifyTicks(sheet);
      const blob=await sheetBlob(canvas),png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      results.push({subdivision,pages:sheet.pages.length,type:blob.type,webp:blob.size,png:png.size,first:sheet.pages[0][0].start,last:sheet.pages.at(-1).at(-1).end});
      if(subdivision===6)window.sheetCheckCanvas=canvas;
    }
    VF.Voice.prototype.addTickables=original;return results;
  });
  for(const row of rendered){assert.equal(row.first,0);assert.equal(row.last,81);assert.equal(row.type,'image/webp');assert(row.pages>=1);}console.log('画像サイズ比較',rendered);
  const png=await page.evaluate(()=>sheetCheckCanvas.toDataURL('image/png').split(',')[1]);await writeFile('.sites-runtime/sheet-check.png',Buffer.from(png,'base64'));
  await page.selectOption('#instrument','piano-88');
  const text='format=stepscore,version=1,step_ms=150,steps_per_quarter=6,time_signature=3/4,title=三連符\n'+Array.from({length:480},(_,step)=>step%3===0?'C3,C5':step%3===1?'C#5':'').join('\n')+'\n';
  await page.locator('#fileInput').setInputFiles({name:'sheet.txt',mimeType:'text/plain',buffer:Buffer.from(text)});await page.waitForFunction(()=>document.querySelector('#scoreTitle').value==='三連符');
  const unchanged=await page.locator('#txtPreview').inputValue();await page.locator('#save').click();await page.locator('#exportSheet').click();await page.locator('#sheetDialog').waitFor({state:'visible'});
  assert(!(await page.locator('#sheetNext').isDisabled()));await page.locator('#sheetNext').click();assert((await page.locator('#sheetPage').textContent()).startsWith('2 /'));
  const secondDownload=page.waitForEvent('download');await page.locator('#sheetSave').click();assert.equal((await secondDownload).suggestedFilename(),'三連符-02.webp');await page.locator('#sheetPrevious').click();assert((await page.locator('#sheetPage').textContent()).startsWith('1 /'));await page.locator('#sheetClose').click();assert.equal(await page.locator('#txtPreview').inputValue(),unchanged,'前後移動と画像保存で編集内容を変えない');
  await page.setViewportSize({width:390,height:844});await page.locator('#save').click();await page.locator('#exportSheet').click();await page.locator('#sheetDialog').waitFor({state:'visible'});assert(await page.locator('#sheetDialog').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));await page.locator('#sheetClose').click();
  assert(!errors.length,errors.join('\n'));console.log('簡易五線譜確認成功：音価・休符・臨時記号・三連符・二段・複数ページ・WebP保存・遅延読み込み・モバイル');
}finally{await browser.close();}
