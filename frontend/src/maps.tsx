import { useEffect,useRef,useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin,LocateFixed,ExternalLink } from 'lucide-react';
import type { Property } from './types';
import { money } from './types';
import { tr } from './localization';
import { Button,Field } from './ui';
export type Coordinates={latitude:number;longitude:number};
const city:[number,number]=[26.1012,74.3203];
export const hasCoordinates=<T extends {latitude?:number|null;longitude?:number|null}>(p:T):p is T & Coordinates => typeof p.latitude==='number'&&typeof p.longitude==='number'&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude);
export const directionsUrl=(p:Coordinates)=>'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(`${p.latitude},${p.longitude}`);
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function PropertyMap({properties=[],selectedId,onSelect,value,onChange,height=320}: {properties?:Property[];selectedId?:string;onSelect?:(p:Property)=>void;value?:Coordinates|null;onChange?:(p:Coordinates)=>void;height?:number|string}) {
 const element=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layer=useRef<L.LayerGroup|null>(null),editMarker=useRef<L.Marker|null>(null);
 const callbacks=useRef({onSelect,onChange});callbacks.current={onSelect,onChange};const [failed,setFailed]=useState(false);
 useEffect(()=>{
  if(!element.current)return;
  const m=L.map(element.current,{scrollWheelZoom:false,zoomControl:true}).setView(city,13);map.current=m;layer.current=L.layerGroup().addTo(m);
  const tile=L.tileLayer(import.meta.env.VITE_MAP_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(m);
  tile.on('tileerror',()=>setFailed(true));tile.on('tileload',()=>setFailed(false));
  m.on('click',(e:L.LeafletMouseEvent)=>callbacks.current.onChange?.({latitude:+e.latlng.lat.toFixed(6),longitude:+e.latlng.lng.toFixed(6)}));
  const observer=new ResizeObserver(()=>m.invalidateSize());observer.observe(element.current);requestAnimationFrame(()=>m.invalidateSize());
  return()=>{observer.disconnect();m.remove();map.current=null;};
 },[]);
 const points=properties.filter(hasCoordinates);
 const signature=points.map(p=>`${p.id}:${p.latitude}:${p.longitude}:${p.price}`).join('|');
 useEffect(()=>{
  const m=map.current,l=layer.current;if(!m||!l)return;l.clearLayers();
  for(const p of points){const marker=L.marker([p.latitude,p.longitude],{icon:L.divIcon({className:'price-pin '+(selectedId===p.id?'selected':''),html:escape(money(p.price)),iconSize:[86,30],iconAnchor:[43,36]}),title:p.title,keyboard:true}).addTo(l);marker.on('click',()=>callbacks.current.onSelect?.(p));}
  if(points.length&&!selectedId)m.fitBounds(L.latLngBounds(points.map(p=>[p.latitude,p.longitude] as [number,number])),{padding:[45,45],maxZoom:15,animate:false});
 },[signature,selectedId,tr('Price')]);
 useEffect(()=>{const p=points.find(p=>p.id===selectedId);if(p&&map.current)map.current.setView([p.latitude,p.longitude],16,{animate:!window.matchMedia('(prefers-reduced-motion: reduce)').matches});},[selectedId,signature]);
 useEffect(()=>{
  const m=map.current;if(!m)return;editMarker.current?.remove();editMarker.current=null;
  if(value&&hasCoordinates(value)){
   const marker=L.marker([value.latitude,value.longitude],{draggable:!!onChange,title:tr('Property location'),icon:L.divIcon({className:'location-pin',html:'<span></span>',iconSize:[28,34],iconAnchor:[14,34]})}).addTo(m);editMarker.current=marker;
   marker.on('dragend',()=>{const p=marker.getLatLng();callbacks.current.onChange?.({latitude:+p.lat.toFixed(6),longitude:+p.lng.toFixed(6)});});m.setView([value.latitude,value.longitude],Math.max(m.getZoom(),16),{animate:false});
  }
 },[value?.latitude,value?.longitude,!!onChange]);
 return <div className="map-frame"><div ref={element} className="property-map" style={{height}} role="region" aria-label={tr(onChange?'Select property location on map':'Property locations map')} />{failed&&<div className="map-message">{tr('Map tiles could not load. Check your internet connection. Coordinates and directions still work.')}</div>}</div>;
}
export function LocationPicker({value,onChange}:{value:Coordinates|null;onChange:(v:Coordinates|null)=>void}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[lat,setLat]=useState(value?String(value.latitude):''),[lng,setLng]=useState(value?String(value.longitude):'');
 function select(v:Coordinates){onChange(v);setLat(String(v.latitude));setLng(String(v.longitude));setError('');}
 function update(a:string,b:string){setLat(a);setLng(b);if(a.trim()&&b.trim()&&Number.isFinite(+a)&&Number.isFinite(+b)&&Math.abs(+a)<=90&&Math.abs(+b)<=180)onChange({latitude:+a,longitude:+b});else onChange(null);}
 return <section className="location-picker"><div className="section-heading"><h3><MapPin size={18}/>{tr('Pin the exact location')}</h3><Button type="button" variant="outline" busy={busy} onClick={()=>{setError('');if(!navigator.geolocation){setError('Location is unavailable. Drop a pin on the map.');return;}setBusy(true);navigator.geolocation.getCurrentPosition(p=>{select({latitude:+p.coords.latitude.toFixed(6),longitude:+p.coords.longitude.toFixed(6)});setBusy(false);},()=>{setError('Location permission was denied or unavailable. Drop a pin or enter coordinates.');setBusy(false);},{timeout:12000,enableHighAccuracy:true});}}><LocateFixed size={16}/>{tr('Use my location')}</Button></div>
 <p className="muted">{tr('Click the map or drag the pin. Confirm the property location, not your current location if you are elsewhere.')}</p>
 <PropertyMap value={value} onChange={select} height={270}/>
 <div className="form-grid"><Field label={tr('Latitude')}><input type="number" name="latitude" value={lat} min={-90} max={90} step="any" required onChange={e=>update(e.target.value,lng)} placeholder="26.1012"/></Field><Field label={tr('Longitude')}><input type="number" name="longitude" value={lng} min={-180} max={180} step="any" required onChange={e=>update(lat,e.target.value)} placeholder="74.3203"/></Field></div>
 {error&&<p className="error" role="alert">{tr(error)}</p>}<p className="map-help">{tr('Approved listings appear on the public map. Drafts and pending locations remain private.')}</p></section>;
}
export function PropertyLocation({p}:{p:Property}){return <section className="property-location"><div className="section-heading"><h3>{tr('Property location')}</h3>{hasCoordinates(p)&&<a className="btn outline" href={directionsUrl(p)} target="_blank" rel="noreferrer"><ExternalLink size={15}/>{tr('Get directions')}</a>}</div>{hasCoordinates(p)?<><PropertyMap value={p} height={260}/><small className="muted">{p.latitude.toFixed(6)}, {p.longitude.toFixed(6)} · {p.address}</small></>:<p className="notice">{tr('Exact map location has not been added to this older listing yet.')}</p>}</section>}
