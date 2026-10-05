import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ogg':'audio/ogg'};
function unpublishedStyles(current,published){
  const pattern=/(?:\bid|["']id["']):\s*['"]([a-z0-9-]+)['"]/g,existing=new Set([...published.matchAll(pattern)].map(match=>match[1]));
  return [...current.matchAll(pattern)].filter(match=>!existing.has(match[1])).map(match=>`#templateSelect option[value="${match[1]}"]{color:#a03529}`).join('\n');
}
createServer(async(req,res)=>{try{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),path=resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!path.startsWith(root.endsWith(sep)?root:root+sep))throw new Error('範囲外');
  let body=await readFile(path);
  if(path===resolve(root,'style.css')){
    try{
      const cwd=resolve(root,'..'),published=execFileSync('git',['-c',`safe.directory=${cwd}`,'show','@{upstream}:dist/templates.js'],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
      body=Buffer.concat([body,Buffer.from('\n'+unpublishedStyles(await readFile(resolve(root,'templates.js'),'utf8'),published))]);
    }catch{console.error('未プッシュ曲の比較に失敗しました。通常の色で表示します。');}
  }
  res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
}catch{res.writeHead(404);res.end('Not found');}}).listen(4173,process.argv.includes('--lan')?'0.0.0.0':'127.0.0.1',()=>process.stdout.write('Local: http://127.0.0.1:4173\n'));
