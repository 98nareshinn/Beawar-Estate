import type { Property } from './types.ts';
export interface SearchFilters { query:string;localities:string[];purpose:'all'|'sale'|'rent';priceMin:string;priceMax:string;areaMin:string;areaMax:string;types:string[];amenities:string[];bedrooms:string;available:boolean;saved:boolean }
export const emptySearch:SearchFilters={query:'',localities:[],purpose:'all',priceMin:'',priceMax:'',areaMin:'',areaMax:'',types:[],amenities:[],bedrooms:'',available:true,saved:false};
export const placeTypes=['Single family home','Townhouse','Apartment','Bungalow','Villa','Plot','Commercial space','Other'];
export function placeType(p:Property){return p.place_type&&p.place_type!=='Other'?p.place_type:({House:'Single family home',Apartment:'Apartment',Plot:'Plot',Commercial:'Commercial space'}[p.type]||'Other');}
export function filterProperties(rows:Property[],f:SearchFilters,favorites:string[]=[]){return rows.filter(p=>
 (!f.query||`${p.title} ${p.locality} ${p.address}`.toLowerCase().includes(f.query.toLowerCase().trim()))&&
 (!f.localities.length||f.localities.includes(p.locality))&&(f.purpose==='all'||p.purpose===f.purpose)&&
 (!f.priceMin||p.price>=Number(f.priceMin))&&(!f.priceMax||p.price<=Number(f.priceMax))&&(!f.areaMin||p.area>=Number(f.areaMin))&&(!f.areaMax||p.area<=Number(f.areaMax))&&
 (!f.types.length||f.types.includes(placeType(p)))&&f.amenities.every(a=>p.amenities.some(v=>v.toLowerCase()===a.toLowerCase()))&&(!f.bedrooms||p.bedrooms>=Number(f.bedrooms))&&
 (!f.available||p.availability==='available')&&(!f.saved||favorites.includes(p.id)));}
