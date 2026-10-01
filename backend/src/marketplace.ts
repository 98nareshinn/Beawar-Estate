import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { db, id, audit, can, transaction, type User } from './db.ts';
import { mobile } from './validation.ts';
import { notifyUsers } from './notifications.ts';
type Row = Record<string, any>;
type Helpers = { json:(res:ServerResponse,data:unknown,status?:number)=>unknown; readBody:(req:IncomingMessage)=>Promise<any>; fail:(status:number,message:string)=>never; requireUser:(user:User|undefined)=>User; requirePermission:(user:User|undefined,permission:string)=>User };
const categories = ['plumber','electrician','architect','carpenter'] as const;
const providerInput = z.object({
 name:z.string().trim().min(2).max(80), category:z.enum(categories), tier:z.enum(['budget','standard','premium']),
 startingPrice:z.number().min(0).max(1e7).refine(v=>Number.isInteger(Math.round(v*100)), 'Enter a valid amount'),
 priceUnit:z.enum(['visit','hour','project']), mobile:mobile.refine(v=>v.length>=7,'Enter a valid mobile number'),
 email:z.union([z.email(),z.literal('')]).default(''), areas:z.string().trim().min(2).max(300), bio:z.string().trim().min(10).max(1200),
 experience:z.number().int().min(0).max(70), active:z.boolean(), userId:z.string().uuid().nullable().default(null),
});
const listingSelect = `SELECT p.*, COALESCE(r.rating,0) AS rating,COALESCE(r.review_count,0) AS review_count,COALESCE(b.completed_count,0) AS completed_count
 FROM service_providers p LEFT JOIN (SELECT provider_id,AVG(rating) AS rating,COUNT(*) AS review_count FROM provider_reviews GROUP BY provider_id) r ON r.provider_id=p.id
 LEFT JOIN (SELECT provider_id,COUNT(*) AS completed_count FROM service_bookings WHERE status='completed' GROUP BY provider_id) b ON b.provider_id=p.id`;
function providerView(p:Row, contact=false) { const result:Row={...p,starting_price:p.starting_price/100,active:!!p.active}; if(!contact){ delete result.mobile;delete result.email;delete result.user_id; }return result; }
function paid(bookingId:string):number { return Number(db.prepare("SELECT COALESCE(SUM(CASE WHEN kind='refund' THEN -amount ELSE amount END),0) AS amount FROM booking_payments WHERE booking_id=?").get(bookingId)!.amount); }
function bookingAudience(b:Row) {
 const ids=[String(b.user_id)];
 const provider=db.prepare('SELECT user_id FROM service_providers WHERE id=?').get(b.provider_id) as Row|undefined;
 if(provider?.user_id)ids.push(provider.user_id);
 const managers=db.prepare("SELECT id FROM users WHERE active=1 AND (role='head_admin' OR (role IN ('admin','team') AND permissions LIKE '%manage_services%'))").all() as Row[];
 ids.push(...managers.map(v=>v.id));
 return [...new Set(ids)];
}
function bookingView(b:Row) {
 const provider=db.prepare('SELECT * FROM service_providers WHERE id=?').get(b.provider_id) as Row;
 return {...b,quoted_amount:b.quoted_amount/100,paid_amount:paid(b.id)/100,provider:providerView(provider,true),
  events:db.prepare('SELECT status,note,created_at FROM booking_events WHERE booking_id=? ORDER BY id').all(b.id),
  payments:db.prepare('SELECT id,amount,kind,method,reference,note,created_at FROM booking_payments WHERE booking_id=? ORDER BY created_at').all(b.id).map(p=>({...p,amount:Number(p.amount)/100})),
  messages:db.prepare('SELECT m.id,m.user_id,m.message,m.created_at,u.name AS sender FROM booking_messages m JOIN users u ON u.id=m.user_id WHERE booking_id=? ORDER BY m.id').all(b.id),
  review:db.prepare('SELECT rating,comment,created_at FROM provider_reviews WHERE booking_id=?').get(b.id)||null};
}
export async function handleMarketplace(req:IncomingMessage,res:ServerResponse,path:string,method:string,user:User|undefined,h:Helpers):Promise<boolean> {
 const {json,readBody,requireUser,requirePermission}=h;
 const fail:Helpers["fail"]=h.fail;
 const url=new URL(req.url||'/', 'http://local');
 if(method==='GET'&&path==='/api/providers') { const manager=can(user,'manage_services')&&url.searchParams.get('managed')==='1'; json(res,{providers:(db.prepare(listingSelect+(manager?'':' WHERE p.active=1')+' ORDER BY p.starting_price,p.name').all() as Row[]).map(p=>providerView(p,manager))});return true; }
 const reviews=path.match(/^\/api\/providers\/([^/]+)\/reviews$/);
 if(method==='GET'&&reviews){json(res,{reviews:(db.prepare('SELECT r.rating,r.comment,r.created_at,u.name FROM provider_reviews r JOIN users u ON u.id=r.user_id WHERE r.provider_id=? ORDER BY r.created_at DESC LIMIT 50').all(reviews[1]) as Row[]).map(r=>({...r,name:r.name.split(' ')[0]}))});return true;}
 const providerMatch=path.match(/^\/api\/providers\/([^/]+)$/);
 if((method==='POST'&&path==='/api/providers')||(method==='PATCH'&&providerMatch)){
  const u=requirePermission(user,'manage_services'), b=providerInput.parse(await readBody(req));const pid=providerMatch?.[1]||id();
  if(providerMatch&&!db.prepare('SELECT id FROM service_providers WHERE id=?').get(pid))fail(404,'Provider not found.');
  if(b.userId){if(u.role!=='head_admin')fail(403,'Only the head admin can link provider accounts.');if(!db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role IN ('agent','team','admin')").get(b.userId))fail(400,'Select an active team or agent account.');}
  const old=providerMatch?db.prepare('SELECT user_id FROM service_providers WHERE id=?').get(pid):null;
  const linkedUser=u.role==='head_admin'?b.userId:old?.user_id||null;
  const values=[b.name,b.category,b.tier,Math.round(b.startingPrice*100),b.priceUnit,b.mobile,b.email,b.areas,b.bio,b.experience,b.active?1:0,linkedUser];
  if(providerMatch) db.prepare('UPDATE service_providers SET name=?,category=?,tier=?,starting_price=?,price_unit=?,mobile=?,email=?,areas=?,bio=?,experience=?,active=?,user_id=? WHERE id=?').run(...values,pid);
  else db.prepare('INSERT INTO service_providers(name,category,tier,starting_price,price_unit,mobile,email,areas,bio,experience,active,user_id,id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...values,pid);
  audit(u.id,providerMatch?'provider.updated':'provider.created',pid);json(res,{id:pid},providerMatch?200:201);return true;
 }
 if(method==='GET'&&path==='/api/bookings'){
  const u=requireUser(user),managed=url.searchParams.get('managed')==='1';if(managed)requirePermission(u,'manage_services');
  const rows=db.prepare(`SELECT b.*,u.name AS customer_name FROM service_bookings b JOIN users u ON u.id=b.user_id ${managed?'':"WHERE b.user_id=? OR b.provider_id IN (SELECT id FROM service_providers WHERE user_id=?)"} ORDER BY b.created_at DESC`).all(...(managed?[]:[u.id,u.id])) as Row[];
  json(res,{bookings:rows.map(bookingView)});return true;
 }
 if(method==='POST'&&path==='/api/bookings'){
  const u=requireUser(user);const b=z.object({providerId:z.string().uuid(),scheduledDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),timeSlot:z.enum(['09:00–12:00','12:00–15:00','15:00–18:00']),address:z.string().trim().min(8).max(400),mobile:mobile.refine(v=>v.length>=7,'Enter a valid mobile number'),message:z.string().trim().min(10).max(2000)}).parse(await readBody(req));
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const dt=new Date(b.scheduledDate+'T00:00:00Z');if(!Number.isFinite(dt.getTime())||dt.toISOString().slice(0,10)!==b.scheduledDate||b.scheduledDate<today)fail(400,'Choose today or a future date.');
  const p=db.prepare('SELECT * FROM service_providers WHERE id=? AND active=1').get(b.providerId) as Row|undefined;if(!p)fail(404,'Provider is unavailable.');if(p.user_id===u.id)fail(400,'You cannot book your own service.');
  const bid=id();transaction(()=>{db.prepare('INSERT INTO service_bookings(id,user_id,provider_id,category,provider_name,scheduled_date,time_slot,address,mobile,message,quoted_amount,price_unit) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(bid,u.id,p.id,p.category,p.name,b.scheduledDate,b.timeSlot,b.address,b.mobile,b.message,p.starting_price,p.price_unit);db.prepare('INSERT INTO booking_events(booking_id,user_id,status,note) VALUES(?,?,?,?)').run(bid,u.id,'requested','Booking requested');audit(u.id,'booking.created',bid);});
  notifyUsers(bookingAudience({user_id:u.id,provider_id:p.id}), 'booking', 'New service booking', `${p.name} · ${b.scheduledDate}`, 'booking', bid, u.id);
  json(res,{id:bid},201);return true;
 }
 const match=path.match(/^\/api\/bookings\/([^/]+)\/(status|payments|messages|review|quote)$/);
 if(method==='POST'&&match){
  const u=requireUser(user);const b=db.prepare('SELECT * FROM service_bookings WHERE id=?').get(match[1]) as Row|undefined;if(!b)fail(404,'Booking not found.');
  const p=db.prepare('SELECT user_id FROM service_providers WHERE id=?').get(b.provider_id);const manager=can(u,'manage_services'),owner=b.user_id===u.id,provider=p?.user_id===u.id;
  if(!owner&&!manager&&!provider)fail(404,'Booking not found.');const data=await readBody(req);
  if(match[2]==='messages') {const v=z.object({message:z.string().trim().min(1).max(2000)}).parse(data);db.prepare('INSERT INTO booking_messages(booking_id,user_id,message) VALUES(?,?,?)').run(b.id,u.id,v.message);notifyUsers(bookingAudience(b),'message','New service message',v.message,'booking',b.id,u.id);}
  if(match[2]==='status'){
   const v=z.object({status:z.enum(['confirmed','in_progress','completed','cancelled']),note:z.string().trim().max(1500).default('')}).parse(data);
   if(!manager&&!provider&&!(owner&&v.status==='cancelled'&&['requested','confirmed'].includes(b.status)))fail(403,'Only the provider or service manager can update this status.');
   const allowed:Record<string,string[]>={requested:['confirmed','cancelled'],confirmed:['in_progress','cancelled'],in_progress:['completed'],completed:[],cancelled:[]};
   if(!allowed[b.status]?.includes(v.status))fail(409,'This booking status has already changed. Refresh and try again.');
   transaction(()=>{db.prepare('UPDATE service_bookings SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(v.status,b.id);db.prepare('INSERT INTO booking_events(booking_id,user_id,status,note) VALUES(?,?,?,?)').run(b.id,u.id,v.status,v.note);audit(u.id,'booking.'+v.status,b.id,v.note);});
   notifyUsers(bookingAudience(b),'booking','Service booking updated',v.note||`Booking status: ${v.status}`,'booking',b.id,u.id);
  }
  if(match[2]==='quote'){
   if(!manager&&!provider)fail(403,'You do not have permission for this action.');if(!['requested','confirmed'].includes(b.status))fail(409,'The quote can only change before work starts.');
   const v=z.object({amount:z.number().min(0).max(1e7),note:z.string().trim().min(3).max(500)}).parse(data);const amount=Math.round(v.amount*100);if(amount<paid(b.id))fail(400,'The quote cannot be lower than the amount already paid.');
   transaction(()=>{db.prepare('UPDATE service_bookings SET quoted_amount=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(amount,b.id);db.prepare('INSERT INTO booking_events(booking_id,user_id,status,note) VALUES(?,?,?,?)').run(b.id,u.id,'quote_updated',v.note);audit(u.id,'booking.quote_updated',b.id);});
   notifyUsers(bookingAudience(b),'booking','Service quote updated',v.note,'booking',b.id,u.id);
  }
  if(match[2]==='payments'){
   requirePermission(u,'manage_services');const v=z.object({amount:z.number().positive().max(1e7),kind:z.enum(['payment','refund']),method:z.enum(['cash','upi','bank']),reference:z.string().trim().min(3).max(100),note:z.string().trim().max(500).default('')}).parse(data);const amount=Math.round(v.amount*100);if(amount<1)fail(400,'Enter a valid amount.');
   transaction(()=>{const balance=paid(b.id);if(v.kind==='payment'&&b.status==='cancelled')fail(409,'Cancelled bookings can only receive refunds.');if(v.kind==='payment'&&balance+amount>b.quoted_amount)fail(400,'Payment exceeds the remaining balance.');if(v.kind==='refund'&&amount>balance)fail(400,'Refund exceeds the amount paid.');db.prepare('INSERT INTO booking_payments(id,booking_id,recorded_by,amount,kind,method,reference,note) VALUES(?,?,?,?,?,?,?,?)').run(id(),b.id,u.id,amount,v.kind,v.method,v.reference,v.note);audit(u.id,'booking.'+v.kind,b.id,v.reference);});
  }
  if(match[2]==='review'){
   if(!owner||provider||manager)fail(403,'Only the customer can rate this completed booking.');if(b.status!=='completed')fail(409,'Complete the booking before leaving a review.');
   const v=z.object({rating:z.number().int().min(1).max(5),comment:z.string().trim().max(1000).default('')}).parse(data);db.prepare('INSERT INTO provider_reviews(booking_id,provider_id,user_id,rating,comment) VALUES(?,?,?,?,?)').run(b.id,b.provider_id,u.id,v.rating,v.comment);audit(u.id,'booking.reviewed',b.id);
  }
  json(res,{booking:bookingView(db.prepare('SELECT * FROM service_bookings WHERE id=?').get(b.id) as Row)});return true;
 }
 return false;
}
