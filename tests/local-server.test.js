import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { listenLocal } from '../scripts/server.mjs';

test('local distribution injects runtime configuration, protects paths and caches flight requests',async t=>{
  let calls=0;
  const server=await listenLocal({port:0,directory:fileURLToPath(new URL('./fixtures/site/',import.meta.url)),proxy:async()=>{calls++;return Response.json({ac:[],now:Date.now()});}});
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const base=`http://127.0.0.1:${server.address().port}`;
  const html=await (await fetch(base)).text();
  assert.match(html,/<script src="\/local-config.js"><\/script><\/head>/);
  assert.match(await (await fetch(base+'/local-config.js')).text(),/__NEBOSVOD_LOCAL__ = true/);
  assert.equal((await (await fetch(base+'/api/health')).json()).mode,'local');
  assert.equal((await fetch(base+'/api/health',{headers:{Origin:'https://example.com'}})).status,403);
  const spoofed=await new Promise((resolve,reject)=>{http.get(base+'/api/health',{headers:{Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject);});
  assert.equal(spoofed,421);
  assert.equal((await fetch(base+'/api/health',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/%2e%2e%2fpackage.json')).status,403);
  assert.equal((await fetch(base+'/%5c..%5cpackage.json')).status,400);
  assert.equal((await fetch(base+'/.env')).status,404);
  assert.equal((await fetch(base+'/missing.js')).status,404);
  const head=await fetch(base,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  await Promise.all([fetch(base+'/api/flights?lat=43&lon=76&radius=75'),fetch(base+'/api/flights?radius=75&lon=76&lat=43')]);
  assert.equal(calls,1);
});
