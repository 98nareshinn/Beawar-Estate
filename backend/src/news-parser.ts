import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { createHash } from 'node:crypto';
export interface FeedArticle { id:string; title:string; url:string; source:string; publishedAt:string; scope:'beawar'|'india' }
export function safeLink(value:unknown):string { try { const u=new URL(String(value));return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:''; }catch{return '';} }
export function parseFeed(xml:string,scope:'beawar'|'india'):FeedArticle[] {
 if(xml.length>2_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Invalid feed');
 if(XMLValidator.validate(xml)!==true)throw new Error('Invalid feed');
 const document=new XMLParser({ignoreAttributes:false,processEntities:true}).parse(xml);
 if(!document.rss?.channel)throw new Error('Invalid RSS feed');
 const items=document.rss.channel.item||[];
 return (Array.isArray(items)?items:[items]).map((item:any)=>{
  const source=String(item.source?.['#text']||item.source||'News publisher').replace(/<[^>]*>/g,'').trim();
  const title=String(item.title||'').replace(/<[^>]*>/g,'').trim();const url=safeLink(item.link);const time=Date.parse(item.pubDate);
  return {id:createHash('sha256').update(url).digest('hex').slice(0,24),title:title.endsWith(' - '+source)?title.slice(0,-source.length-3):title,url,source,publishedAt:Number.isFinite(time)?new Date(time).toISOString():'',scope};
 }).filter((a:FeedArticle)=>a.title&&a.url&&a.publishedAt).filter((a:FeedArticle,i:number,all:FeedArticle[])=>all.findIndex(v=>v.url===a.url)===i).sort((a:FeedArticle,b:FeedArticle)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,40);
}
