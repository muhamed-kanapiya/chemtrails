import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Crosshair, Layers, Minus, Plus } from 'lucide-react';
import { destination, finite, fmt } from './domain';
import 'leaflet/dist/leaflet.css';

const planeSvg = '<svg viewBox="0 0 32 32" fill="currentColor"><path d="M17.5 3c0-2-3-2-3 0v8L3 19v3l11.5-4v7L10 28v2l6-2 6 2v-2l-4.5-3v-7L29 22v-3l-11.5-8z"/></svg>';
function iconFor(a, selected) {
  const wrapper = document.createElement('div');
  wrapper.className = `aircraft-pin ${selected ? 'selected' : ''} ${a.demo ? 'demo-pin' : ''}`;
  const shape = document.createElement('span');
  shape.style.transform = `rotate(${a.heading || 0}deg)`;
  shape.innerHTML = planeSvg;
  wrapper.append(shape);
  const label = document.createElement('b');
  label.textContent = a.callsign;
  wrapper.append(label);
  return L.divIcon({ html: wrapper, className: 'plane-marker', iconSize: [32,32], iconAnchor: [16,16] });
}
export default function MapView({ city, radius, aircraft, selected, onSelect, simulation, wind, showWind, focusSignal }) {
  const root = useRef(null), map = useRef(null), markers = useRef(new Map()), circle = useRef(null), cityMarker = useRef(null), plumes = useRef(null), paths = useRef(null), windLayer = useRef(null), tracks = useRef(new Map());
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const [base, setBase] = useState('light'), [tileError, setTileError] = useState(false);
  const tile = useRef(null);
  useEffect(() => {
    map.current = L.map(root.current, { zoomControl: false, attributionControl: true, minZoom: 3, maxZoom: 16, scrollWheelZoom: true }).setView([city.lat, city.lon], 9);
    plumes.current = L.layerGroup().addTo(map.current);
    paths.current = L.layerGroup().addTo(map.current);
    windLayer.current = L.layerGroup().addTo(map.current);
    circle.current = L.circle([city.lat,city.lon], { radius: radius * 1000, color: '#5d92a0', weight: 1, dashArray: '5 8', fillColor: '#a3c7ce', fillOpacity: .035, interactive: false }).addTo(map.current);
    cityMarker.current = L.circleMarker([city.lat, city.lon], { radius: 5, weight: 3, color: '#fff', fillColor: '#2b6c7d', fillOpacity: 1 }).addTo(map.current);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map.current);
    const observer = new ResizeObserver(() => map.current?.invalidateSize()); observer.observe(root.current);
    return () => { observer.disconnect(); map.current.remove(); map.current = null; markers.current.clear(); };
  }, []);
  useEffect(() => {
    if (tile.current) tile.current.remove();
    setTileError(false);
    root.current.classList.toggle('muted-map', base === 'light');
    tile.current = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map.current);
    tile.current.on('tileerror', () => setTileError(true));
    tile.current.on('load', () => setTileError(false));
  }, [base]);
  useEffect(() => {
    circle.current.setLatLng([city.lat,city.lon]).setRadius(radius * 1000);
    cityMarker.current.setLatLng([city.lat,city.lon]);
    map.current.fitBounds(circle.current.getBounds(), { padding: [24,24], animate: false });
    tracks.current.clear();
  }, [city, radius]);
  useEffect(() => {
    const alive = new Set(aircraft.map(a => a.id));
    markers.current.forEach((marker, id) => { if (!alive.has(id)) { marker.remove(); markers.current.delete(id); tracks.current.delete(id); } });
    aircraft.forEach(a => {
      let marker = markers.current.get(a.id);
      if (!marker) {
        marker = L.marker([a.lat,a.lon], { icon: iconFor(a, a.id === selected?.id), keyboard: true, title: `Выбрать ${a.callsign}` }).addTo(map.current);
        marker.on('click', () => selectRef.current(a.id));
        markers.current.set(a.id, marker);
      }
      marker.setLatLng([a.lat,a.lon]).setIcon(iconFor(a, a.id === selected?.id));
      marker.setZIndexOffset(a.id === selected?.id ? 1000 : 0);
      const track = tracks.current.get(a.id) || [];
      if (!track.length || track.at(-1)[0] !== a.lat || track.at(-1)[1] !== a.lon) track.push([a.lat,a.lon]);
      tracks.current.set(a.id, track.slice(-60));
    });
    paths.current.clearLayers();
    if (selected) {
      const track = tracks.current.get(selected.id) || [];
      if (track.length > 1) L.polyline(track, { color: '#167d8f', weight: 2, opacity: .6, interactive: false }).addTo(paths.current);
      if (finite(selected.heading) && finite(selected.speed)) L.polyline([[selected.lat,selected.lon],destination(selected.lat,selected.lon,selected.heading,selected.speed / 60 * 2)], { color: '#167d8f', weight: 1.5, dashArray: '4 6', interactive: false }).addTo(paths.current);
    }
  }, [aircraft, selected]);
  useEffect(() => {
    plumes.current.clearLayers();
    if (!simulation) return;
    const { result, source } = simulation;
    L.polyline([[source.lat,source.lon],result.center], { color: '#a478b0', dashArray: '5 5', weight: 1, interactive: false }).addTo(plumes.current);
    [2.448, 1.8, 1.2, .6].forEach(multiplier => L.circle(result.center, { radius: result.sigma * multiplier, color: '#9d77ad', weight: multiplier === 2.448 ? 1 : 0, fillColor: '#ab88b9', fillOpacity: Math.max(.015, .11 * result.remaining), interactive: false }).addTo(plumes.current));
    L.circleMarker([source.lat,source.lon], { radius: 5, color: '#996cab', weight: 2, fillColor: 'white', fillOpacity: 1 }).addTo(plumes.current).bindTooltip('Начальная точка условного выброса');
  }, [simulation]);
  useEffect(() => {
    windLayer.current.clearLayers();
    if (!showWind || !wind || !finite(wind.direction)) return;
    const spacing = radius / 111 / 2.2;
    for (let x=-2;x<=2;x++) for (let y=-2;y<=2;y++) {
      const arrow = document.createElement('span'); arrow.className = 'wind-arrow'; arrow.textContent = '↑'; arrow.style.transform = `rotate(${(wind.direction + 180) % 360}deg)`;
      L.marker([city.lat+y*spacing,city.lon+x*spacing/Math.cos(city.lat*Math.PI/180)], { icon: L.divIcon({html:arrow,className:'wind-marker',iconSize:[24,24]}), interactive:false }).addTo(windLayer.current);
    }
  }, [wind,showWind,city,radius]);
  useEffect(() => {
    if (!focusSignal) return;
    if (simulation) map.current.fitBounds(L.latLngBounds([simulation.source.lat,simulation.source.lon],simulation.result.center).extend(L.circle(simulation.result.center,{radius:simulation.result.radius}).getBounds()), {padding:[45,45],maxZoom:11});
    else if (selected) map.current.setView([selected.lat,selected.lon],11);
  }, [focusSignal]);
  return <div className="map-shell">
    <div className="map-canvas" ref={root} aria-label={`Карта самолётов: ${city.name}`} />
    <div className="map-label"><span className="map-label-dot" />{simulation ? 'Условная модель переноса' : 'Воздушное пространство'}<small>{simulation ? `Через ${fmt(simulation.minutes)} мин` : `Радиус ${radius} км`}</small></div>
    <div className="map-controls">
      <button title="Приблизить карту" aria-label="Приблизить карту" onClick={() => map.current.zoomIn()}><Plus size={18}/></button>
      <button title="Отдалить карту" aria-label="Отдалить карту" onClick={() => map.current.zoomOut()}><Minus size={18}/></button>
      <span/>
      <button title="Вернуться к городу" aria-label="Вернуться к городу" onClick={() => map.current.fitBounds(circle.current.getBounds())}><Crosshair size={18}/></button>
      <button title="Сменить подложку карты" aria-label="Сменить подложку карты" onClick={() => setBase(v => v === 'light' ? 'street' : 'light')}><Layers size={18}/></button>
    </div>
    {tileError && <div className="tile-warning">Не удалось загрузить часть карты. Попробуйте другую подложку.</div>}
    <div className="map-key"><span><i className="key-plane"/>Самолёты</span><span><i className="key-range"/>Область наблюдения</span>{simulation && <span><i className="key-plume"/>95% оставшейся примеси</span>}</div>
  </div>;
}
