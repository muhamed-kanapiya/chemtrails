export const CITIES = [
  { name: 'Алматы', country: 'Казахстан', lat: 43.2389, lon: 76.8897, timezone: 'Asia/Almaty' },
  { name: 'Астана', country: 'Казахстан', lat: 51.1694, lon: 71.4491, timezone: 'Asia/Almaty' },
  { name: 'Лондон', country: 'Великобритания', lat: 51.5074, lon: -0.1278, timezone: 'Europe/London' },
  { name: 'Стамбул', country: 'Турция', lat: 41.0082, lon: 28.9784, timezone: 'Europe/Istanbul' },
  { name: 'Нью-Йорк', country: 'США', lat: 40.7128, lon: -74.006, timezone: 'America/New_York' },
];
export const finite = value => typeof value === 'number' && Number.isFinite(value);
export const fmt = (value, digits = 0) => finite(value) ? value.toLocaleString('ru-RU', { maximumFractionDigits: digits }) : '—';
export function localTime(unix, timezone = 'UTC', date = false) {
  if (!finite(unix)) return '—';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, hour: '2-digit', minute: '2-digit', ...(date ? { day: 'numeric', month: 'short' } : {}) }).format(new Date(unix * 1000));
}
export const bearingName = direction => finite(direction) ? ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'][Math.round(direction / 45) % 8] : '—';
export function distanceKm(a, b) {
  const r = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function destination(lat, lon, bearing, km) {
  const r = Math.PI / 180, d = km / 6371, b = bearing * r, p = lat * r;
  const nextLat = Math.asin(Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(b));
  const nextLon = lon * r + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p), Math.cos(d) - Math.sin(p) * Math.sin(nextLat));
  return [nextLat / r, ((nextLon / r + 540) % 360) - 180];
}
export function normalizeAircraft(raw, city, radiusKm) {
  const list = raw.ac || raw.aircraft || [];
  return list.filter(a => finite(a.lat) && finite(a.lon) && a.alt_baro !== 'ground' && finite(a.seen_pos) && a.seen_pos <= 60 && distanceKm(city, a) <= radiusKm).map(a => ({
    id: a.hex, callsign: a.flight?.trim() || a.r || a.hex?.toUpperCase(), registration: a.r || null,
    model: a.t || null, description: a.desc || null, lat: a.lat, lon: a.lon,
    altitude: finite(a.alt_baro) ? a.alt_baro * 0.3048 : finite(a.alt_geom) ? a.alt_geom * 0.3048 : null,
    altitudeSource: finite(a.alt_baro) ? 'Барометрическая' : 'Геометрическая',
    speed: finite(a.gs) ? a.gs * 1.852 : null, heading: finite(a.track) ? a.track : null,
    verticalRate: finite(a.baro_rate) ? a.baro_rate * 0.3048 / 60 : null,
    squawk: a.squawk || null, category: a.category || null, military: Boolean(a.dbFlags & 1),
    seen: a.seen_pos, distance: distanceKm(city, a), source: a.type || 'ADS-B',
  })).sort((a, b) => a.distance - b.distance);
}
export function aqiInfo(value) {
  if (!finite(value)) return { label: 'Нет данных', color: '#7a8990', note: 'Сервис пока не вернул оценку качества воздуха.' };
  if (value <= 50) return { label: 'Хороший', color: '#398b6b', note: 'Низкий уровень загрязнения по AQI. Риск для большинства людей невелик.' };
  if (value <= 100) return { label: 'Умеренный', color: '#a37c26', note: 'Качество воздуха приемлемое. Особенно чувствительные к загрязнению люди могут испытывать дискомфорт.' };
  if (value <= 150) return { label: 'Для чувствительных — вредный', color: '#c17738', note: 'У чувствительных групп возможны эффекты для здоровья. У большинства людей риск ниже.' };
  if (value <= 200) return { label: 'Вредный', color: '#c64d56', note: 'Возможны эффекты для здоровья у всех; у чувствительных групп риск выше.' };
  if (value <= 300) return { label: 'Очень вредный', color: '#945695', note: 'Риск эффектов для здоровья повышен для всех. Следите за рекомендациями местных служб.' };
  return { label: 'Опасный', color: '#8b354d', note: 'Уровень опасен для всех. Следуйте рекомендациям местных служб о защите от загрязнения.' };
}
export function weatherLabel(code) {
  if (code === 0) return 'Ясное небо';
  if ([1, 2].includes(code)) return 'Переменная облачность';
  if (code === 3) return 'Пасмурно';
  if ([45, 48].includes(code)) return 'Туман';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Снег';
  if (code >= 95) return 'Гроза';
  if (code >= 51) return 'Дождь';
  return 'Нет данных';
}
export function forecastRows(weather, now = Date.now() / 1000) {
  if (!weather?.hourly?.time) return [];
  return weather.hourly.time.map((time, i) => ({ time, temperature: weather.hourly.temperature_2m?.[i], probability: weather.hourly.precipitation_probability?.[i], precipitation: weather.hourly.precipitation?.[i], rain: (weather.hourly.rain?.[i] ?? 0) + (weather.hourly.showers?.[i] ?? 0), cloud: weather.hourly.cloud_cover?.[i] })).filter(row => row.time >= Math.floor(now / 3600) * 3600);
}
export const PRESSURE_LEVELS = [{ p: 1000, h: 110 }, { p: 925, h: 800 }, { p: 850, h: 1500 }, { p: 700, h: 3000 }, { p: 500, h: 5600 }, { p: 400, h: 7200 }, { p: 300, h: 9200 }, { p: 250, h: 10400 }, { p: 200, h: 11800 }];
export function windAtAltitude(weather, altitude) {
  if (!finite(altitude) || !weather?.hourly?.time?.length) return null;
  const times = weather.hourly.time;
  const now = weather.current?.time ?? Date.now() / 1000;
  const i = times.reduce((best, t, idx) => Math.abs(t - now) < Math.abs(times[best] - now) ? idx : best, 0);
  const levels = PRESSURE_LEVELS.map(level => ({ ...level, h: weather.hourly[`geopotential_height_${level.p}hPa`]?.[i] ?? level.h })).filter(level => finite(weather.hourly[`wind_speed_${level.p}hPa`]?.[i]) && finite(weather.hourly[`wind_direction_${level.p}hPa`]?.[i]));
  if (!levels.length) return null;
  const level = levels.reduce((best, v) => Math.abs(v.h - altitude) < Math.abs(best.h - altitude) ? v : best);
  return { speed: weather.hourly[`wind_speed_${level.p}hPa`][i], direction: weather.hourly[`wind_direction_${level.p}hPa`][i], height: level.h, pressure: level.p, time: times[i] };
}
// Educational horizontal Gaussian puff: constant wind, diffusion and first-order removal.
// No vertical mixing, chemistry, deposition, ground exposure or actual release inference.
export function simulatePuff({ lat, lon, windSpeed, windFrom, minutes, diffusion, halfLife }) {
  if (![lat, lon, windSpeed, windFrom, minutes, diffusion, halfLife].every(finite) || windSpeed < 0 || minutes < 0 || diffusion < 0 || halfLife <= 0) throw new Error('Некорректные параметры модели');
  const seconds = minutes * 60;
  const driftKm = windSpeed * seconds / 1000;
  const center = destination(lat, lon, (windFrom + 180) % 360, driftKm);
  const sigma = Math.sqrt(300 ** 2 + 2 * diffusion * seconds);
  const remaining = 2 ** (-minutes / halfLife);
  return { center, sigma, radius: 2.448 * sigma, driftKm, remaining, peakRelative: remaining * 300 ** 2 / sigma ** 2, timeToTenPercent: halfLife * Math.log2(10) };
}
export function exampleAircraft(city) {
  const seeds = [
    ['DEMO-01', 'A321', 10400, 820, 48, -.08, .13], ['DEMO-02', 'B789', 11280, 905, 115, .16, -.22],
    ['DEMO-03', 'C172', 1600, 185, 225, -.12, -.09], ['DEMO-04', 'GLF6', 12500, 880, 315, .24, .14],
    ['DEMO-05', 'B738', 6800, 720, 76, -.22, .31], ['DEMO-06', 'A359', 10900, 860, 190, .08, .42],
    ['DEMO-07', 'H145', 950, 210, 12, -.03, -.29], ['DEMO-08', 'A320', 4300, 620, 278, .31, -.37],
  ];
  return seeds.map(([callsign, model, altitude, speed, heading, dy, dx], i) => ({ id: `demo-${i}`, callsign, model, altitude, speed, heading, lat: city.lat + dy, lon: city.lon + dx, registration: 'Учебный борт', distance: distanceKm(city, { lat: city.lat + dy, lon: city.lon + dx }), seen: 0, altitudeSource: 'Условная', category: model === 'H145' ? 'A7' : 'A3', source: 'Синтетические данные', demo: true }));
}
