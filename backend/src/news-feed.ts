import { db } from './db.ts';
import { parseFeed, safeLink, type FeedArticle } from './news-parser.ts';
import { createHash } from 'node:crypto';
type Scope='beawar'|'india';
type FeedResult={articles:FeedArticle[]; fetchedAt:string|null; stale:boolean; error:string; source:'rss'|'gnews'};
const ttl=10*60_000, inflight=new Map<Scope,Promise<FeedResult>>(),retryAfter=new Map<Scope,number>();
async function boundedText(response:Response){
 if(!response.ok||!response.body)throw new Error('Upstream unavailable');
 const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();throw new Error('Feed too large');}chunks.push(value);}
 return Buffer.concat(chunks).toString('utf8');
}
export async function getNewsFeed(scope:Scope):Promise<FeedResult>{
 const cached=db.prepare('SELECT payload,fetched_at FROM feed_cache WHERE scope=?').get(scope);
 const source=process.env.GNEWS_API_KEY?'gnews':'rss';
 const previous=():FeedResult=>({articles:cached?JSON.parse(String(cached.payload)):[],fetchedAt:cached?String(cached.fetched_at):null,stale:true,error:'Live news is temporarily unavailable. Please try again later.',source});
 if(cached&&Date.now()-Date.parse(String(cached.fetched_at))<ttl)return {...previous(),stale:false,error:''};
 if(inflight.has(scope))return inflight.get(scope)!;
 if((retryAfter.get(scope)||0)>Date.now())return previous();
 const run=(async()=>{
  try{
   let articles:FeedArticle[];
   if(process.env.GNEWS_API_KEY){
    const url=new URL('https://gnews.io/api/v4/search');url.search=new URLSearchParams({q:scope==='beawar'?'Beawar OR ब्यावर':'India',lang:'hi',country:'in',max:'10',sortby:'publishedAt',apikey:process.env.GNEWS_API_KEY}).toString();
    const data=JSON.parse(await boundedText(await fetch(url,{signal:AbortSignal.timeout(12000)})));
    articles=(data.articles||[]).map((a:any)=>({id:createHash('sha256').update(String(a.url)).digest('hex').slice(0,24),title:String(a.title||''),url:safeLink(a.url),source:String(a.source?.name||'News publisher'),publishedAt:a.publishedAt,scope})).filter((a:FeedArticle)=>a.title&&a.url&&Number.isFinite(Date.parse(a.publishedAt)));
   }else{
    const fallback='https://news.google.com/rss/search?'+new URLSearchParams({q:scope==='beawar'?'Beawar OR ब्यावर when:30d':'India when:2d',hl:'hi',gl:'IN',ceid:'IN:hi'});
    const url=process.env[scope==='beawar'?'NEWS_BEAWAR_RSS_URL':'NEWS_INDIA_RSS_URL']||fallback;
    const parsed=new URL(url);if(parsed.protocol!=='https:'&&process.env.NODE_ENV!=='test')throw new Error('HTTPS required');
    articles=parseFeed(await boundedText(await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'BeawarEstate/2.0 local-news-reader'}})),scope);
   }
   const fetchedAt=new Date().toISOString();db.prepare('INSERT INTO feed_cache(scope,payload,fetched_at) VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').run(scope,JSON.stringify(articles),fetchedAt);
   return {articles,fetchedAt,stale:false,error:'',source} as FeedResult;
  }catch{retryAfter.set(scope,Date.now()+60_000);return previous();}finally{inflight.delete(scope);}
 })();inflight.set(scope,run);return run;
}
