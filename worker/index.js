import { flightProxy } from './handler.js';
export default {
  async fetch(request,env,ctx) {
    const origin=request.headers.get('Origin');
    const allowed=(env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) return new Response('Origin not allowed',{status:403});
    const cors={ ...(origin ? {'Access-Control-Allow-Origin':origin} : {}),'Vary':'Origin','Access-Control-Allow-Methods':'GET, OPTIONS','X-Content-Type-Options':'nosniff'};
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    const cache=caches.default;
    const key=new Request(request.url,{method:'GET'});
    let response=request.method==='GET'?await cache.match(key):null;
    if(!response){response=await flightProxy(request);if(response.ok)ctx.waitUntil(cache.put(key,response.clone()));}
    const result=new Response(response.body,response);
    for(const [k,v] of Object.entries(cors))result.headers.set(k,v);
    return result;
  }
};
