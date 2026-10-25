import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flightProxy } from '../worker/handler.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2','.json':'application/json'};

export function createLocalServer({ directory = path.join(projectRoot, 'dist'), proxy = flightProxy } = {}) {
  const root = path.resolve(directory);
  const cache = new Map();
  const pending = new Map();
  return http.createServer(async (req, res) => {
    const send = (status, body, type = 'text/plain; charset=utf-8', extra = {}) => {
      res.writeHead(status, {'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    try {
      const port = req.socket.localPort;
      if (![`localhost:${port}`,`127.0.0.1:${port}`].includes(req.headers.host)) return send(421,'Local requests only');
      const origin = `http://${req.headers.host}`;
      if (req.headers.origin && req.headers.origin !== origin) return send(403,'Origin not allowed');
      if (!['GET','HEAD'].includes(req.method)) return send(405,'Method not allowed',undefined,{Allow:'GET, HEAD'});
      const url = new URL(req.url,origin);
      if (url.pathname === '/api/health') return send(200,JSON.stringify({app:'nebosvod',mode:'local'}),'application/json');
      if (url.pathname === '/local-config.js') return send(200,'window.__NEBOSVOD_LOCAL__ = true;','text/javascript');
      if (url.pathname === '/api/flights') {
        if (req.method !== 'GET') return send(405,'GET required');
        const upstream = new URL(url); upstream.pathname='/flights';
        upstream.searchParams.sort();
        const key = upstream.pathname+upstream.search;
        let hit = cache.get(key);
        if (!hit || hit.expires < Date.now()) {
          if (!pending.has(key)) pending.set(key,(async()=>{
            const response = await proxy(new Request(upstream));
            const entry = {body:await response.text(),status:response.status,expires:Date.now()+15000};
            if (response.ok) { if(cache.size>=100)cache.delete(cache.keys().next().value); cache.set(key,entry); }
            return entry;
          })().finally(()=>pending.delete(key)));
          hit = await pending.get(key);
        }
        return send(hit.status,hit.body,'application/json');
      }
      let decoded;
      try {decoded=decodeURIComponent(url.pathname);} catch {return send(400,'Invalid path');}
      if (decoded.includes('\\') || decoded.includes('\0')) return send(400,'Invalid path');
      const target=path.resolve(root, '.'+(decoded==='/'?'/index.html':decoded));
      if (!target.startsWith(root+path.sep)) return send(403,'Path not allowed');
      if (!mime[path.extname(target)]) return send(404,'Not found');
      if (!(await stat(target)).isFile()) return send(404,'Not found');
      let body=await readFile(target);
      if (path.basename(target)==='index.html') body=body.toString().replace('</head>','<script src="/local-config.js"></script></head>');
      send(200,body,mime[path.extname(target)]);
    } catch (error) {send(error.code==='ENOENT'?404:500,error.code==='ENOENT'?'Not found':'Local server error');}
  });
}

export async function listenLocal({port=4173,...options}={}) {
  const server=createLocalServer(options);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT || 4173);
  if (!Number.isInteger(port)||port<1024||port>65535) throw new Error('PORT must be between 1024 and 65535');
  const server=await listenLocal({port});
  console.log(`Небосвод: http://localhost:${server.address().port}/\nЛокальный сервер. Для остановки нажмите Ctrl+C.`);
}
