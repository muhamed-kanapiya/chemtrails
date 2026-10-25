// Only public flight data. A fixed upstream, bounded coordinates and radius;
// this is deliberately NOT an arbitrary URL proxy. No secrets in the browser.
export async function flightProxy(request, fetcher = fetch) {
  const url = new URL(request.url);
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15' };
  const fail = (message,status) => new Response(JSON.stringify({error:message}), {status,headers});
  if (request.method !== 'GET') return fail('Method not allowed',405);
  if (url.pathname !== '/flights') return fail('Not found',404);
  const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon')), radius = Number(url.searchParams.get('radius'));
  if (!['lat','lon','radius'].every(k=>url.searchParams.has(k)) || ![lat,lon,radius].every(Number.isFinite) || Math.abs(lat)>85 || Math.abs(lon)>180 || radius<1 || radius>250) return fail('Invalid location or radius',400);
  try {
    const upstream = await fetcher(`https://api.adsb.lol/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${Math.ceil(radius/1.852)}`, {signal:AbortSignal.timeout(12000),headers:{Accept:'application/json','User-Agent':'Nebosvod/1.0 (+https://github.com/muhamed-kanapiya/chemtrails)'},cf:{cacheTtl:15,cacheEverything:true}});
    if (!upstream.ok) return fail('Flight provider unavailable', upstream.status === 429 ? 429 : 502);
    const data = await upstream.json();
    if (!Array.isArray(data.ac || data.aircraft)) return fail('Invalid flight response',502);
    return new Response(JSON.stringify(data),{headers});
  } catch { return fail('Flight provider timeout',502); }
}
