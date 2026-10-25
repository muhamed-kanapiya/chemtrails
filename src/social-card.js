import { aqiInfo, finite, fmt, localTime } from './domain.js';
import { describeCard, EXPORT_SIZES, exportTopicAvailable, getForecastForCard } from './export-data.js';

export const escapeXml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const palettes={light:{bg:'#f2f6f7',paper:'#ffffff',ink:'#254956',muted:'#667f8b',line:'#d5e2e6',accent:'#247c8f',tint:'#e5f0f3',purple:'#9272a6'},dark:{bg:'#172d38',paper:'#203c49',ink:'#ecf5f7',muted:'#adc3ce',line:'#365461',accent:'#93cbd5',tint:'#294e5c',purple:'#d3b6e5'}};
function wrap(text,maxChars,maxLines=3) {
  const words=String(text).split(/\s+/);const lines=[];let line='';
  for(const word of words){if(line&&`${line} ${word}`.length>maxChars){lines.push(line);line=word;}else line+=(line?' ':'')+word;}
  if(line)lines.push(line);
  if(lines.length>maxLines){lines.length=maxLines;lines[maxLines-1]=lines[maxLines-1].slice(0,maxChars-1)+'…';}
  return lines;
}
export function renderSocialCard(snapshot,{format='square',topic='overview',theme='light',title=''}={}) {
  const size=EXPORT_SIZES.find(s=>s.id===format);
  if(!size||!exportTopicAvailable(snapshot,topic))throw new Error('Недоступный формат или тема карточки');
  const c=palettes[theme]||palettes.light, {width:w,height:h}=size;
  const d=describeCard(snapshot,topic),wide=format==='wide',story=format==='story';
  const m=wide?54:64, bodyY=wide?234:330, footerY=h-(wide?83:165);
  const out=[];
  function text(x,y,value,font=22,color=c.ink,weight=400,anchor='start') {out.push(`<text x="${x}" y="${y}" fill="${color}" font-size="${font}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(value)}</text>`);}
  function box(x,y,width,height,fill=c.paper,r=20,stroke='none') {out.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`);}
  function line(x1,y1,x2,y2,color=c.line,dash='') {out.push(`<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="2" fill="none" ${dash?`stroke-dasharray="${dash}"`:''}/>`);}
  function paragraph(x,y,value,font,width,maxLines=3,color=c.muted) {wrap(value,Math.floor(width/(font*.52)),maxLines).forEach((t,i)=>text(x,y+i*font*1.35,t,font,color));}
  function plane(x,y,heading=0,color=c.accent,scale=1) {out.push(`<g transform="translate(${x} ${y}) rotate(${heading}) scale(${scale})"><path d="M2-17C2-21-2-21-2-17V-6L-17 5V9L-2 3V13L-8 17V20L0 17L8 20V17L2 13V3L17 9V5L2-6Z" fill="${color}"/></g>`);}
  function metric(x,y,width,height,entry) {
    const [label,value,unit]=entry;box(x,y,width,height);
    text(x+24,y+34,label,wide?16:20,c.muted);
    const font=Math.min(wide?42:story?65:48,(width-48)/Math.max(1,String(value).length)*1.6);
    text(x+24,y+height*.64,value,font,c.ink,600);
    paragraph(x+24,y+height-21,unit,wide?15:18,width-48,1);
  }
  function radar(x,y,width,height) {
    box(x,y,width,height,c.tint,24);
    const cx=x+width/2,cy=y+height/2+8,r=Math.min(width/2-45,height/2-46);
    for(const f of [1,.66,.33])out.push(`<circle cx="${cx}" cy="${cy}" r="${r*f}" fill="none" stroke="${c.line}" stroke-width="1.5" ${f===1?'stroke-dasharray="5 8"':''}/>`);
    line(cx-r,cy,cx+r,cy,c.line);line(cx,cy-r,cx,cy+r,c.line);
    text(cx,y+29,'С',14,c.muted,500,'middle');
    out.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="${c.accent}"/>`);
    const points=topic==='flight'?[snapshot.selected]:snapshot.aircraft.slice(0,100);
    points.forEach(a=>{
      const dx=((a.lon-snapshot.city.lon+540)%360-180)*111.32*Math.cos(snapshot.city.lat*Math.PI/180);
      const dy=(a.lat-snapshot.city.lat)*111.32;
      const px=cx+dx/snapshot.radius*r,py=cy-dy/snapshot.radius*r;
      if(Math.hypot(dx,dy)>snapshot.radius*1.02)return;
      plane(px,py,a.heading||0,c.accent,points.length>20?.45:.65);
      if(topic==='flight')text(Math.max(x+30,Math.min(px,x+width-110)),py+38,a.callsign,18,c.ink,600);
    });
    text(x+23,y+height-21,`${snapshot.radius} км · схема позиций`,wide?15:18,c.muted);
    if(!points.length)text(cx,cy+40,'Нет свежих позиций',wide?18:22,c.muted,400,'middle');
  }
  function airChart(x,y,width,height) {
    box(x,y,width,height,c.tint,24);
    const a=snapshot.air.data?.current,info=aqiInfo(a?.us_aqi);
    const font=wide?65:story?128:92;
    text(x+30,y+font+18,fmt(a?.us_aqi),font,c.accent,500);
    text(x+width-30,y+35,'US AQI',wide?16:20,c.muted,500,'end');
    paragraph(x+30,y+font+57,info.label,wide?20:28,width-60,2,c.ink);
    if(height>430)paragraph(x+30,y+font+125,info.note,story?32:26,width-60,4,c.muted);
    const extra=[['O₃',a?.ozone],['SO₂',a?.sulphur_dioxide],['CO',a?.carbon_monoxide]];
    const rowY=y+height-95;
    extra.forEach(([label,value],i)=>{const xx=x+30+i*(width-60)/3;text(xx,rowY,label,wide?17:20,c.muted);text(xx,rowY+37,fmt(value,1),wide?24:32,c.ink,500);});
    text(x+30,y+height-18,'Концентрации: мкг/м³',wide?13:17,c.muted);
  }
  function forecast(x,y,width,height) {
    box(x,y,width,height,c.tint,24);text(x+27,y+35,'Вероятность осадков · 24 часа',wide?17:22,c.ink,500);
    const rows=getForecastForCard(snapshot),bottom=y+height-54;
    if(!rows.length){text(x+27,y+100,'Нет прогноза',24,c.muted);return;}
    const available=height-132,cell=(width-54)/rows.length;
    rows.forEach((row,i)=>{
      const xx=x+27+i*cell;
      const bar=finite(row.probability)?Math.max(3,available*Math.min(100,Math.max(0,row.probability))/100):0;
      box(xx+cell*.22,bottom-bar,cell*.56,bar,c.accent,4);
      text(xx+cell/2,bottom-bar-13,finite(row.probability)?`${fmt(row.probability)}%`:'—',wide?12:17,c.ink,500,'middle');
      text(xx+cell/2,bottom+30,localTime(row.time,snapshot.timezone),wide?11:16,c.muted,400,'middle');
    });
  }
  function puff(x,y,width,height) {
    box(x,y,width,height,c.tint,24);
    const sim=snapshot.simulation;
    const sx=x+width*.2,sy=y+height*.65,ex=x+width*.72,ey=y+height*.38;
    line(sx,sy,ex,ey,c.purple,'5 7');plane(sx,sy,55,c.accent,.9);
    [1,.74,.49].forEach((r,i)=>out.push(`<ellipse cx="${ex}" cy="${ey}" rx="${width*.18*r}" ry="${Math.min(height*.25,width*.18)*r}" fill="${c.purple}" fill-opacity="${.09+i*.035}" stroke="${c.purple}" stroke-opacity=".35"/>`));
    text(ex,ey+9,`${fmt(sim.result.remaining*100)}%`,wide?26:36,c.ink,500,'middle');
    text(x+25,y+35,'Схема переноса · без географического масштаба',wide?13:18,c.muted);
    paragraph(x+25,y+height-50,`Ветер ${fmt(sim.wind?.speed,1)} м/с · уровень ${sim.wind?.pressure||'—'} гПа`,wide?15:21,width-50,1);
    text(x+25,y+height-22,`После условного выброса: ${sim.minutes} мин`,wide?14:18,c.muted);
  }
  const diagram=topic==='air'?airChart:topic==='weather'?forecast:topic==='simulation'?puff:radar;
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${escapeXml(d.title+' — '+d.city)}</title><rect width="${w}" height="${h}" fill="${c.bg}"/><g font-family="Arial, DejaVu Sans, sans-serif">`);
  out.push(`<path d="M${m} ${m+22}a15 15 0 0 1 30 0m-24 0a9 9 0 0 1 18 0m-12 0a3 3 0 0 1 6 0M${m} ${m+29}h30" stroke="${c.accent}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`);
  text(m+43,m+26,'небосвод.',28,c.ink,600);
  const badgeWidth=Math.min(w-m*2-245,d.badge.length*(wide?8:10)+30);
  box(w-m-badgeWidth,m-2,badgeWidth,42,c.tint,21);
  text(w-m-badgeWidth/2,m+25,d.badge,wide?15:18,topic==='simulation'?c.purple:c.accent,500,'middle');
  const heading=title.trim()||`${d.title}: ${d.city}`;
  const headingSize=Math.min(wide?50:64,(w-m*2)/Math.max(heading.length,1)*1.65);
  text(m,wide?163:193,heading,Math.max(26,headingSize),c.ink,600);
  paragraph(m,wide?202:243,d.subtitle,wide?21:25,w-m*2,2);
  if(wide) {
    const leftW=640,gap=14,cellW=(leftW-gap)/2,cellH=116;
    d.metrics.forEach((entry,i)=>metric(m+(i%2)*(cellW+gap),bodyY+Math.floor(i/2)*(cellH+gap),cellW,cellH,entry));
    diagram(m+leftW+22,bodyY,w-2*m-leftW-22,cellH*2+gap);
  } else {
    const bodyH=footerY-bodyY-85,metricH=story?208:format==='portrait'?170:139,gap=18;
    const diagramH=bodyH-(story?metricH*2+gap:metricH)-26;
    diagram(m,bodyY,w-2*m,diagramH);
    const y=bodyY+diagramH+26,cols=story?2:4,cellW=(w-2*m-(cols-1)*gap)/cols;
    d.metrics.forEach((entry,i)=>metric(m+(i%cols)*(cellW+gap),y+Math.floor(i/cols)*(metricH+gap),cellW,metricH,entry));
  }
  line(m,footerY-17,w-m,footerY-17);
  const noteSize=wide?12:18;
  const notesY=footerY+(wide?4:12);
  d.notes.slice(0,2).forEach((note,i)=>paragraph(m,notesY+i*(wide?17:27),note,noteSize,w-m*2,1,topic==='simulation'?c.purple:c.muted));
  text(m,h-(wide?36:66),d.sources,wide?11:15,c.muted);
  paragraph(m,h-(wide?20:43),d.times.join(' · '),wide?10:14,w-m*2,1);
  text(m,h-(wide?6:19),`Снимок ${d.date} · ${d.timezone}`,wide?10:14,c.muted);
  text(w-m,h-(wide?6:19),'nebosvod / открытые данные',wide?10:14,c.muted,400,'end');
  out.push('</g></svg>');return out.join('');
}

export async function socialImageBlob(svg,kind='png') {
  if(kind==='svg')return new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
  if(!['png','jpeg'].includes(kind))throw new Error('Неподдерживаемый формат');
  const source=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(source);
  try {
    const image=new Image();image.src=url;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Браузер не поддерживает экспорт изображения');
    ctx.drawImage(image,0,0);
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Не удалось создать изображение')),`image/${kind}`,0.95));
  } finally {URL.revokeObjectURL(url);}
}
export function downloadImage(blob,name) {
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
