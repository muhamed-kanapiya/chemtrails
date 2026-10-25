import { aqiInfo, bearingName, finite, fmt, forecastRows, localTime, weatherLabel } from './domain.js';

export const EXPORT_SIZES = [
  {id:'square',name:'Квадрат',ratio:'1:1',width:1080,height:1080},
  {id:'portrait',name:'Вертикальный пост',ratio:'4:5',width:1080,height:1350},
  {id:'story',name:'Сторис',ratio:'9:16',width:1080,height:1920},
  {id:'wide',name:'Широкий',ratio:'1,91:1',width:1200,height:630},
];
export const EXPORT_TOPICS = [
  {id:'overview',name:'Сводка города'}, {id:'air',name:'Качество воздуха'},
  {id:'weather',name:'Погода и осадки'}, {id:'flight',name:'Выбранный самолёт'},
  {id:'simulation',name:'Симуляция переноса'},
];
function resource(state) {return {data:state?.data??null,error:state?.error||'',updated:state?.updated??null};}
export function captureSnapshot(input, capturedAt = Date.now()/1000) {
  const sourceTime=input.flights?.data?.sourceTime;
  const fresh=finite(sourceTime)&&capturedAt-sourceTime<=60&&!input.flights?.error;
  // Deliberately excludes the adsbdb route database and registry metadata.
  return structuredClone({
    city:input.city,timezone:input.timezone||input.city.timezone||'UTC',radius:input.radius,
    capturedAt,demo:input.demo,flightTime:sourceTime??null,flightsAvailable:input.demo||fresh,
    aircraft:input.demo||fresh?(input.aircraft||[]).filter(a=>input.demo||(a.seen??0)+capturedAt-sourceTime<=60):[],
    selected:input.selected||null,weather:resource(input.weather),air:resource(input.air),
    simulation:input.simulation?{...input.simulation,wind:input.wind,halfLife:input.halfLife,diffusion:input.diffusion}:null,
  });
}
export function exportTopicAvailable(snapshot,topic) {
  if(topic==='flight')return Boolean(snapshot.selected);
  if(topic==='simulation')return Boolean(snapshot.simulation?.result);
  return EXPORT_TOPICS.some(t=>t.id===topic);
}
export function resourceStatus(resource,capturedAt,maxAge) {
  const time=resource.data?.current?.time;
  if(!finite(time))return 'Нет данных';
  if(resource.error||capturedAt-time>maxAge)return 'Устаревшие данные';
  return 'Модель';
}
export function describeCard(snapshot,topic) {
  const {weather,air,timezone,capturedAt}=snapshot;
  const w=weather.data?.current,a=air.data?.current;
  const weatherStatus=resourceStatus(weather,capturedAt,5400),airStatus=resourceStatus(air,capturedAt,10800);
  const flightsStatus=snapshot.demo?'Учебные борта':snapshot.flightsAvailable?'Позиции ADS-B':'Эфир недоступен';
  const observation=(name,ts)=>`${name}: ${localTime(ts,timezone,true)}`;
  const common={city:snapshot.city.name,date:localTime(capturedAt,timezone,true),timezone};
  if(topic==='air')return {...common,title:'Чем дышит город',subtitle:'Приземный воздух · US AQI',badge:airStatus==='Модель'?'Модель CAMS':airStatus,
    metrics:[['US AQI',fmt(a?.us_aqi),aqiInfo(a?.us_aqi).label],['PM₂.₅',fmt(a?.pm2_5,1),'мкг/м³'],['PM₁₀',fmt(a?.pm10,1),'мкг/м³'],['NO₂',fmt(a?.nitrogen_dioxide,1),'мкг/м³']],
    notes:['Модель для ячейки, не измерение локального датчика.','Не определяет источник загрязнения или личный риск.'],
    sources:'Open-Meteo / CAMS · CC BY 4.0 · шкала US AQI: AirNow',times:[observation('Воздух',a?.time)]};
  if(topic==='weather')return {...common,title:'Погода над городом',subtitle:weatherLabel(w?.weather_code),badge:weatherStatus==='Модель'?'Модель погоды':weatherStatus,
    metrics:[['Температура',fmt(w?.temperature_2m),'°C'],['Ветер у земли',fmt(w?.wind_speed_10m,1),`м/с · с ${bearingName(w?.wind_direction_10m)}`],['Облачность',fmt(w?.cloud_cover),'%'],['Влажность',fmt(w?.relative_humidity_2m),'%']],
    notes:['Осадки: вероятность по прогнозу, не гарантия дождя.'],sources:'Open-Meteo · CC BY 4.0',times:[observation('Погода',w?.time)]};
  if(topic==='flight') {
    const f=snapshot.selected;
    const fresh=snapshot.demo||(snapshot.flightsAvailable&&(f.seen??0)+capturedAt-snapshot.flightTime<=60);
    return {...common,title:f.callsign,subtitle:`${f.model||'Тип неизвестен'} · ${f.registration||'Регистрация неизвестна'}`,badge:f.demo?'Демонстрационный борт':fresh?'Позиция ADS-B':'Устаревшая позиция',
      metrics:[['Высота',fmt(f.altitude),'м'],['Скорость',fmt(f.speed),'км/ч'],['Курс',fmt(f.heading),`° · ${bearingName(f.heading)}`],['От центра',fmt(f.distance,1),'км']],
      notes:[f.demo?'Учебные данные. Это вымышленный самолёт.':'Высота не равна высоте над землёй. Покрытие приёмников неполное.'],
      sources:f.demo?'Синтетические данные Небосвода':'ADSB.lol · ODbL 1.0',times:f.demo?[]:[observation('Позиция',snapshot.flightTime-(f.seen??0))]};
  }
  if(topic==='simulation') {
    const sim=snapshot.simulation,r=sim.result;
    return {...common,title:'Куда унесёт ветром',subtitle:`${sim.source.callsign} · условный выброс на ${fmt(sim.source.altitude)} м`,badge:'Гипотетический сценарий',
      metrics:[['Прошло времени',fmt(sim.minutes),'мин'],['Смещение центра',fmt(r.driftKm,1),'км'],['Осталось примеси',fmt(r.remaining*100),'%'],['Область 95%',fmt(r.radius/1000,1),'км · радиус']],
      notes:['Не свидетельство выброса. Не прогноз опасности для здоровья.',`Постоянная высота; без оседания и вымывания. T½ = ${sim.halfLife} мин, K = ${sim.diffusion} м²/с.`],
      sources:`Учебная модель Небосвода · ветер: Open-Meteo / CC BY 4.0${sim.source.demo?' · учебный борт':''}`,
      times:[observation('Начальная точка',sim.source.started),observation('Ветер',sim.wind?.time)]};
  }
  return {...common,title:'Небо и воздух',subtitle:`Радиус наблюдения ${snapshot.radius} км`,badge:snapshot.demo?'Учебные борта · погода из API':flightsStatus,
    metrics:[['Самолёты',snapshot.flightsAvailable?fmt(snapshot.aircraft.length):'—',snapshot.demo?'демонстрация':'в радиусе'],['Температура',fmt(w?.temperature_2m),'°C'],['Ветер у земли',fmt(w?.wind_speed_10m,1),'м/с'],['Качество воздуха',fmt(a?.us_aqi),'US AQI']],
    notes:[`Погода: ${weatherStatus.toLowerCase()}. Воздух: ${airStatus.toLowerCase()}.`,`Схема позиций; ${snapshot.demo?'самолёты вымышленные.':'покрытие приёмников неполное.'}`],
    sources:`${snapshot.demo?'Учебные борта':'ADSB.lol / ODbL 1.0'} · Open-Meteo / CAMS / CC BY 4.0`,
    times:[...(snapshot.demo?[]:[observation('Борта',snapshot.flightTime)]),observation('Погода',w?.time),observation('Воздух',a?.time)]};
}
export function getForecastForCard(snapshot) {return forecastRows(snapshot.weather.data,snapshot.capturedAt).slice(0,24).filter((_,i)=>i%3===0);}
export function imageFilename(snapshot,topic,format,filetype) {
  const city=snapshot.city.name.replace(/[^\p{L}\p{N}_-]/gu,'-').replace(/-+/g,'-').slice(0,60)||'city';
  return `nebosvod-${city}-${topic}-${format}-${Math.round(snapshot.capturedAt)}.${filetype==='jpeg'?'jpg':filetype}`;
}
