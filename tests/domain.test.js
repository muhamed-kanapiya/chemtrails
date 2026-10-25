import test from 'node:test';
import assert from 'node:assert/strict';
import { aqiInfo, bearingName, destination, distanceKm, forecastRows, normalizeAircraft, simulatePuff, windAtAltitude } from '../src/domain.js';
import { flightProxy } from '../worker/handler.js';

test('null air readings remain unknown; AQI category boundaries',()=>{
  assert.equal(aqiInfo(null).label,'Нет данных');
  for(const [value,label] of [[0,'Хороший'],[50,'Хороший'],[51,'Умеренный'],[100,'Умеренный'],[151,'Вредный'],[201,'Очень вредный'],[301,'Опасный']])assert.equal(aqiInfo(value).label,label);
});
test('metres, km/h and m/s conversions; exclude ground, stale and distant aircraft',()=>{
  const base={hex:'abcd',flight:'TEST1  ',lat:0,lon:0,alt_baro:10000,gs:100,baro_rate:600,seen_pos:5,track:90};
  const result=normalizeAircraft({ac:[base,{...base,alt_baro:'ground'},{...base,seen_pos:61},{...base,lat:20}]},{lat:0,lon:0},75);
  assert.equal(result.length,1);assert.equal(result[0].altitude,3048);assert.equal(result[0].speed,185.20000000000002);assert.equal(result[0].verticalRate,3.048);assert.equal(result[0].callsign,'TEST1');
});
test('unknown altitude is not coerced to zero',()=>{
  const [a]=normalizeAircraft({ac:[{hex:'a',lat:0,lon:0,seen_pos:0,alt_baro:null}]},{lat:0,lon:0},75);
  assert.equal(a.altitude,null);assert.equal(a.speed,null);
});
test('geodesic distance and destination work across the date line',()=>{
  const [lat,lon]=destination(0,179.9,90,100);
  assert.ok(lon<0);assert.ok(Math.abs(distanceKm({lat:0,lon:179.9},{lat,lon})-100)<.001);
});
test('wind FROM north transports tracer south; mass halves at half life',()=>{
  const result=simulatePuff({lat:43,lon:76,windSpeed:10,windFrom:0,minutes:60,diffusion:100,halfLife:60});
  assert.ok(result.center[0]<43);assert.equal(result.driftKm,36);assert.equal(result.remaining,.5);assert.ok(result.radius>300);assert.ok(Math.abs(result.timeToTenPercent-199.3156857)<.001);
});
test('zero wind and zero elapsed time have no movement or artificial loss',()=>{
  const result=simulatePuff({lat:43,lon:76,windSpeed:0,windFrom:180,minutes:0,diffusion:100,halfLife:60});
  assert.equal(result.driftKm,0);assert.equal(result.remaining,1);assert.equal(result.sigma,300);assert.equal(result.peakRelative,1);
  assert.throws(()=>simulatePuff({lat:0,lon:0,windSpeed:0,windFrom:0,minutes:30,diffusion:20,halfLife:0}));
});
test('closest pressure level uses forecast geopotential height and m/s wind',()=>{
  const weather={current:{time:100},hourly:{time:[100,3700],wind_speed_250hPa:[30,40],wind_direction_250hPa:[270,280],geopotential_height_250hPa:[10500,10400],wind_speed_850hPa:[2,3],wind_direction_850hPa:[100,120],geopotential_height_850hPa:[1500,1400]}};
  const wind=windAtAltitude(weather,10000);assert.equal(wind.pressure,250);assert.equal(wind.speed,30);assert.equal(wind.direction,270);assert.equal(windAtAltitude(weather,null),null);
});
test('rain combines rain and showers, excludes old hours and keeps future timestamps',()=>{
  const rows=forecastRows({hourly:{time:[0,3600,7200],rain:[0,0,.3],showers:[0,.2,0]}},4000);
  assert.equal(rows.length,2);assert.equal(rows[0].rain,.2);assert.equal(rows[0].time,3600);assert.equal(bearingName(359),'С');assert.equal(bearingName(null),'—');
});
test('proxy rejects arbitrary URLs, out-of-range inputs and non-GET requests',async()=>{
  for(const path of ['/flights?url=https://example.com','/flights?lat=90&lon=0&radius=10','/flights?lat=0&lon=0&radius=251','/flights?lat=NaN&lon=0&radius=10'])assert.equal((await flightProxy(new Request('https://worker.test'+path))).status,400);
  assert.equal((await flightProxy(new Request('https://worker.test/elsewhere'))).status,404);
  assert.equal((await flightProxy(new Request('https://worker.test/flights',{method:'POST'}))).status,405);
});
test('proxy fetches only fixed aviation upstream and propagates rate limiting',async()=>{
  let target;
  const request=new Request('https://worker.test/flights?lat=43&lon=76&radius=75');
  const response=await flightProxy(request,async url=>{target=url;return Response.json({ac:[],now:1});});
  assert.equal(target,'https://api.adsb.lol/v2/point/43.0000/76.0000/41');assert.equal(response.status,200);
  assert.equal((await flightProxy(request,async()=>new Response('',{status:429}))).status,429);
});
