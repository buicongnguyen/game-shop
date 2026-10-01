import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.json':'application/json','.webmanifest':'application/manifest+json'};
// Root files besides index.html: the web manifest and the service worker (it must live at the
// root so its scope covers the whole app).
const rootFiles = new Set(['index.html', 'manifest.webmanifest', 'sw.js']);
http.createServer((req,res)=>{
  let url;
  try { url = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if (url.includes('\0')) { res.writeHead(400).end('Invalid path'); return; }
  if (url === '/') url = '/index.html';
  const relative = url.replace(/^\/+/, '');
  const allowed = (rootFiles.has(relative) || /^(?:src|assets)\//.test(relative)) && !relative.split('/').includes('..') && !relative.includes('\\');
  const file = path.resolve(root, relative.startsWith('assets/') ? 'public/'+relative : relative);
  if (!allowed || !file.startsWith(root+path.sep)) { res.writeHead(404).end('Not found'); return; }
  fs.readFile(file,(error,data)=>{
    if(error){res.writeHead(404).end('Not found');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(data);
  });
}).listen(port,'127.0.0.1',()=>console.log(`Tiệm Mì Cay is ready at http://localhost:${port}`));
