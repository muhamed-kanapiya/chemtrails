import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, Image, RefreshCw, X } from 'lucide-react';
import { captureSnapshot, EXPORT_SIZES, EXPORT_TOPICS, exportTopicAvailable, imageFilename } from './export-data';
import { downloadImage, renderSocialCard, socialImageBlob } from './social-card';
import { localTime } from './domain';
import './export.css';

export default function SocialExport({input,onClose}) {
  const dialog=useRef(null);
  const [snapshot,setSnapshot]=useState(()=>captureSnapshot(input));
  const [topic,setTopic]=useState(input.simulation?'simulation':input.selected?'flight':'overview');
  const [format,setFormat]=useState('square'),[kind,setKind]=useState('png'),[theme,setTheme]=useState('light'),[title,setTitle]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  useEffect(()=>{dialog.current.showModal();},[]);
  const svg=useMemo(()=>renderSocialCard(snapshot,{format,topic,theme,title}),[snapshot,format,topic,theme,title]);
  const size=EXPORT_SIZES.find(s=>s.id===format);
  const imageUrl=useMemo(()=>`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,[svg]);
  useEffect(()=>{setSaved(false);setError('');},[svg,kind]);
  function refresh() {
    const fresh=captureSnapshot(input);
    if(!exportTopicAvailable(fresh,topic))setTopic('overview');
    setSnapshot(fresh);
  }
  async function save() {
    setBusy(true);setError('');
    try {
      const blob=await socialImageBlob(svg,kind);
      downloadImage(blob,imageFilename(snapshot,topic,format,kind));setSaved(true);
    } catch(e){setError(e.message||'Не удалось сохранить карточку. Попробуйте SVG.');}
    finally{setBusy(false);}
  }
  return <dialog className="export-dialog" ref={dialog} aria-labelledby="export-title" onCancel={onClose} onClick={e=>{if(e.target===dialog.current)onClose();}}>
    <header className="export-header"><div><span><Image size={18}/>Карточка для публикации</span><h2 id="export-title">Поделитесь тем, что над вами</h2></div><button className="icon-button" aria-label="Закрыть экспорт" onClick={onClose}><X size={21}/></button></header>
    <div className="export-layout"><div className="export-settings">
      <label className="export-field"><span>Что показать</span><select value={topic} onChange={e=>setTopic(e.target.value)} aria-label="Содержание карточки">{EXPORT_TOPICS.map(t=><option key={t.id} value={t.id} disabled={!exportTopicAvailable(snapshot,t.id)}>{t.name}{!exportTopicAvailable(snapshot,t.id)?' — выберите борт':''}</option>)}</select></label>
      <fieldset className="export-presets"><legend>Размер изображения</legend>{EXPORT_SIZES.map(s=><label className={s.id===format?'selected':''} key={s.id}><input type="radio" name="card-size" value={s.id} checked={s.id===format} onChange={()=>setFormat(s.id)}/><span className={`aspect-icon ${s.id}`}/><span><strong>{s.name}</strong><small>{s.width} × {s.height} · {s.ratio}</small></span>{s.id===format&&<Check size={15}/>}</label>)}</fieldset>
      <div className="export-pair"><label className="export-field"><span>Тип файла</span><select value={kind} aria-label="Тип файла" onChange={e=>setKind(e.target.value)}><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="svg">SVG</option></select></label><label className="export-field"><span>Оформление</span><select value={theme} aria-label="Оформление карточки" onChange={e=>setTheme(e.target.value)}><option value="light">Светлое</option><option value="dark">Тёмное</option></select></label></div>
      <label className="export-field"><span>Свой заголовок <small>необязательно</small></span><input aria-label="Заголовок карточки" placeholder="Автоматический заголовок" value={title} maxLength={72} onChange={e=>setTitle(e.target.value)}/></label>
      <p className="export-caption">Источники, время и отметки о модели сохраняются на изображении. Внешние карты не нужны для экспорта.</p>
      <button className="primary-button export-save" onClick={save} disabled={busy}>{busy?<RefreshCw className="export-spinner" size={17}/>:saved?<Check size={17}/>:<Download size={17}/>} {busy?'Создаём изображение…':`Скачать ${kind==='jpeg'?'JPEG':kind.toUpperCase()}`}</button>
      <div className="export-message" role="status">{error|| (saved?'Изображение передано в загрузки браузера.':'Файл сохраняется на устройство. Публикация — вручную.')}</div>
    </div><div className="export-preview-area"><div className="export-preview-meta"><span>Предпросмотр · {size.width} × {size.height}</span><button className="text-button" onClick={refresh}><RefreshCw size={13}/>Обновить данные</button></div><div className={`export-preview ${format}`}><img src={imageUrl} alt={`Карточка: ${EXPORT_TOPICS.find(t=>t.id===topic).name}, ${snapshot.city.name}`} width={size.width} height={size.height}/></div><p className="export-snapshot-time">Снимок зафиксирован {localTime(snapshot.capturedAt,snapshot.timezone,true)} · {snapshot.timezone}</p></div></div>
  </dialog>;
}
