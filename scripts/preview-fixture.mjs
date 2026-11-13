// Explicitly separate from the production server. No real Supabase requests or accounts.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('docs');
http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  try{
    let source,type='text/javascript; charset=utf-8';
    if(pathname==='/config.js')source="export const config={supabaseUrl:'https://fixture.supabase.co',publishableKey:'sb_publishable_fixture'};";
    else if(pathname==='/fixture.js')source=await readFile('tests/fixture.js');
    else {
      const file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
      if(!file.startsWith(root+path.sep))throw new Error('outside root');
      source=await readFile(file);
      type=path.extname(file)==='.html'?'text/html; charset=utf-8':path.extname(file)==='.css'?'text/css; charset=utf-8':type;
      if(pathname==='/app.js')source="import {installMock} from './fixture.js';installMock();\n"+source;
    }
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(source);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(4174,'127.0.0.1',()=>console.log('Mock-data UI preview only: http://127.0.0.1:4174'));
