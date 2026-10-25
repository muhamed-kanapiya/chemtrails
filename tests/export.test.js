import test from 'node:test';
import assert from 'node:assert/strict';
import {captureSnapshot,describeCard,EXPORT_SIZES,EXPORT_TOPICS,imageFilename} from '../src/export-data.js';
import {renderSocialCard} from '../src/social-card.js';
const now=1793000000;
const aircraft={id:'demo',callsign:'DEMO-01',lat:43.2,lon:76.8,altitude:10000,speed:800,heading:90,distance:12,seen:0,demo:true};
const input={city:{name:'Алматы',lat:43.2,lon:76.8,timezone:'Asia/Almaty'},radius:75,demo:true,aircraft:[aircraft],selected:aircraft,
  weather:{data:{current:{time:now,temperature_2m:10,wind_speed_10m:4,cloud_cover:30},hourly:{time:[now,now+3600],temperature_2m:[10,11],precipitation_probability:[20,30]}}},
  air:{data:{current:{time:now,us_aqi:80,pm2_5:25,pm10:30}}},
  simulation:{source:{...aircraft,started:now},minutes:90,result:{remaining:.5,radius:1000,driftKm:20}},wind:{speed:10,pressure:250,time:now},halfLife:90,diffusion:150};
test('export snapshot remains fixed while live data changes; route metadata excluded',()=>{
  const original=structuredClone(input);original.details={route:{origin:'DO NOT EXPORT'}};
  const snapshot=captureSnapshot(original,now);original.air.data.current.us_aqi=400;
  assert.equal(snapshot.air.data.current.us_aqi,80);assert.equal(snapshot.capturedAt,now);assert.equal(snapshot.details,undefined);
});
test('missing and stale flight data never becomes a zero count or current position',()=>{
  const unavailable=captureSnapshot({...input,demo:false,flights:{data:null},aircraft:[]},now);
  assert.equal(describeCard(unavailable,'overview').metrics[0][1],'—');
  const stale=captureSnapshot({...input,demo:false,flights:{data:{sourceTime:now-120}},selected:{...aircraft,demo:false}},now);
  assert.equal(stale.aircraft.length,0);assert.equal(describeCard(stale,'flight').badge,'Устаревшая позиция');
  const zero=captureSnapshot({...input,demo:false,flights:{data:{sourceTime:now}},aircraft:[]},now);
  assert.equal(describeCard(zero,'overview').metrics[0][1],'0');
});
test('every size, content and theme renders exact dimensions and mandatory provenance',()=>{
  const snapshot=captureSnapshot(input,now);
  for(const size of EXPORT_SIZES)for(const topic of EXPORT_TOPICS)for(const theme of ['light','dark']){
    const svg=renderSocialCard(snapshot,{format:size.id,topic:topic.id,theme});
    assert.ok(svg.includes(`width="${size.width}" height="${size.height}"`));
    assert.ok(svg.includes('Снимок'));assert.ok(!/NaN|undefined/.test(svg));
    if(topic.id==='simulation'){assert.ok(svg.includes('Гипотетический сценарий'));assert.ok(svg.includes('Не свидетельство выброса'));}
    if(topic.id==='overview')assert.ok(svg.includes('Учебные борта'));
  }
});
test('SVG escapes user text and filenames cannot contain path separators',()=>{
  const snapshot=captureSnapshot(input,now);
  const svg=renderSocialCard(snapshot,{title:'<script>alert("test")</script> & город'});
  assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;script&gt;'));assert.ok(svg.includes('&amp;'));
  snapshot.city.name='../../Алматы\\:test';assert.ok(!/[\\/]/.test(imageFilename(snapshot,'air','square','jpeg')));
});
test('unavailable topics are rejected and incomplete weather has no fabricated numbers',()=>{
  const snapshot=captureSnapshot({...input,selected:null,simulation:null,weather:null,air:null},now);
  assert.throws(()=>renderSocialCard(snapshot,{topic:'flight'}));
  assert.throws(()=>renderSocialCard(snapshot,{topic:'simulation'}));
  assert.throws(()=>renderSocialCard(snapshot,{format:'giant'}));
  assert.equal(describeCard(snapshot,'air').badge,'Нет данных');
  assert.equal(describeCard(snapshot,'weather').metrics[0][1],'—');
});
