import { PRESSURE_LEVELS, normalizeAircraft } from './domain';
export async function getJson(url, signal) {
  const timeout = AbortSignal.timeout(18000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error(response.status === 429 ? 'Лимит запросов. Повторим позже.' : `Сервис недоступен (HTTP ${response.status}).`);
  return response.json();
}
export async function getAircraft(city, radius, signal) {
  const proxy = import.meta.env.VITE_FLIGHT_PROXY;
  const base = proxy ? `${proxy.replace(/\/$/,'')}/flights?lat=${city.lat}&lon=${city.lon}&radius=${radius}` : import.meta.env.DEV ? `/api/flights?lat=${city.lat}&lon=${city.lon}&radius=${radius}` : null;
  if (!base) throw new Error('Прямой эфир ещё не подключён. Используйте демо или откройте живую карту ADSB.lol.');
  const data = await getJson(base, signal);
  if (!Array.isArray(data.ac || data.aircraft)) throw new Error('Источник не вернул список самолётов.');
  return { aircraft: normalizeAircraft(data, city, radius), sourceTime: typeof data.now === 'number' ? (data.now > 1e12 ? data.now / 1000 : data.now) : Date.now() / 1000 };
}
export async function getWeather(city, signal) {
  const current = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
  const hourly = ['temperature_2m','precipitation_probability','precipitation','rain','showers','cloud_cover', ...PRESSURE_LEVELS.flatMap(({p}) => [`wind_speed_${p}hPa`,`wind_direction_${p}hPa`,`geopotential_height_${p}hPa`])].join(',');
  return getJson(`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=${current}&hourly=${hourly}&forecast_hours=72&wind_speed_unit=ms&timeformat=unixtime&timezone=auto`, signal);
}
export function getAir(city, signal) {
  return getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${city.lat}&longitude=${city.lon}&current=us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide,dust&hourly=us_aqi,pm2_5&forecast_days=2&timeformat=unixtime&timezone=auto`, signal);
}
export async function searchCities(query, signal) {
  const data = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=7&language=ru&format=json`, signal);
  return (data.results || []).map(c => ({ name: c.name, country: [c.admin1, c.country].filter(Boolean).join(', '), lat: c.latitude, lon: c.longitude, timezone: c.timezone || 'UTC' }));
}
const detailsCache = new Map();
export async function getDetails(aircraft, signal) {
  if (aircraft.demo) return { aircraft: { manufacturer: 'Демонстрационный пример', type: aircraft.model, registered_owner: 'Вымышленный борт', registered_owner_country_name: 'Не применяется' }, route: null, demo: true };
  const key = `${aircraft.id}:${aircraft.callsign}`;
  if (detailsCache.has(key)) return detailsCache.get(key);
  const callsign = /^[A-Z]{3}\d[A-Z0-9]*$/i.test(aircraft.callsign) ? aircraft.callsign : null;
  const results = await Promise.allSettled([
    getJson(`https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(aircraft.id)}`, signal),
    callsign ? getJson(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`, signal) : Promise.resolve(null),
  ]);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const result = { aircraft: results[0].status === 'fulfilled' ? results[0].value?.response?.aircraft : null, route: results[1].status === 'fulfilled' ? results[1].value?.response?.flightroute : null };
  if (result.aircraft || result.route) detailsCache.set(key, result);
  return result;
}
