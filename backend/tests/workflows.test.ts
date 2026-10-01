import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { parseFeed } from "../src/news-parser.ts";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const dir = mkdtempSync(join(tmpdir(), "beawar-test-"));
const port = 14000 + Math.floor(Math.random() * 2000),
  base = `http://127.0.0.1:${port}`;
const password = "Test-" + randomBytes(16).toString("hex");
let proc: ChildProcess,
  admin = "",
  owner = "",
  approver = "",
  reviewer = "",
  agent = "",
  other = "",
  property = "",
  documentId = "",
  userId = "";
async function call(path: string, method = "GET", body?: unknown, cookie = "") {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      Origin: base,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (r.headers.get("Content-Type") || "").includes(
    "application/json",
  )
    ? await r.json()
    : await r.text();
  return {
    status: r.status,
    data,
    cookie: r.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
async function login(email: string) {
  const r = await call("/auth/login", "POST", { email, password });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.cookie;
}
const listing = {
  title: "Test courtyard home",
  latitude:26.1012,longitude:74.3203,placeType:"Single family home",
  description:
    "A test property with sufficient description for approval testing.",
  type: "House",
  purpose: "sale",
  price: 4500000,
  area: 1800,
  locality: "Ajmer Road",
  address: "Test address in Beawar",
  bedrooms: 3,
  bathrooms: 2,
  amenities: ["Parking"],
  photoIds: [],
  documentIds: [],
  agentId: null,
  status: "pending",
};
let feedRequests=0, feedOffline=false;
const feedFixture = '<rss version="2.0"><channel><title>Test feed</title><item><title>Test headline - Test publisher</title><link>https://example.test/story</link><source>Test publisher</source><pubDate>Thu, 01 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>';
const feedServer=createServer((_req,res)=>{feedRequests++;res.writeHead(feedOffline?503:200,{'Content-Type':'application/rss+xml'});res.end(feedOffline?'Unavailable':feedFixture);});
before(async () => {
  await new Promise<void>(done=>feedServer.listen(0,'127.0.0.1',done));
  const address=feedServer.address();
  if(!address || typeof address==='string')throw new Error('Fixture failed');
  const feedUrl=`http://127.0.0.1:${address.port}/rss`;
  proc = spawn(process.execPath, ["src/server.ts"], {
    cwd: resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      APP_ORIGIN: base,
      ADMIN_EMAIL: "head@example.test",
      ADMIN_PASSWORD: password,
      DATA_DIR: join(dir, "data"),
      UPLOAD_DIR: join(dir, "uploads"),
      SEED_DEMO: "false",
      NODE_ENV: "test",
      GNEWS_API_KEY:"", NEWS_BEAWAR_RSS_URL:feedUrl, NEWS_INDIA_RSS_URL:feedUrl,
    },
    stdio: "pipe",
  });
  let logs = "";
  proc.stderr?.on("data", (d) => (logs += d));
  for (let i = 0; i < 70; i++) {
    try {
      if ((await call("/health")).status === 200) return;
    } catch {}
    await delay(100);
  }
  throw new Error("Backend failed to start: " + logs);
});
after(async () => {
  feedServer.close();
  proc?.kill("SIGTERM");
  await delay(250);
  rmSync(dir, { recursive: true, force: true });
});

test("Public visitors only receive public data and cannot submit", async () => {
  assert.equal((await call("/public")).status, 200);
  assert.equal((await call("/me/workspace")).status, 401);
  assert.equal((await call("/properties", "POST", listing)).status, 401);
});
test("Register members; head admin alone creates privileged accounts", async () => {
  admin = await login("head@example.test");
  for (const email of ["owner@example.test", "other@example.test"]) {
    const r = await call("/auth/register", "POST", {
      email,
      password,
      name: email.split("@")[0],
      mobile: "+919999999999",
    });
    assert.equal(r.status, 201);
    if (email.startsWith("owner")) {
      owner = r.cookie;
      userId = r.data.user.id;
    } else other = r.cookie;
    assert.equal(r.data.user.role, "member");
  }
  assert.equal(
    (
      await call(
        "/users",
        "POST",
        {
          name: "Fake admin",
          email: "fake@example.test",
          password,
          mobile: "",
          role: "admin",
          permissions: ["approve"],
        },
        owner,
      )
    ).status,
    403,
  );
  for (const [name, role, permissions] of [
    ["approver", "approver", ["approve"]],
    ["reviewer", "admin", ["review_documents"]],
    ["agent", "agent", []],
  ] as const) {
    const r = await call(
      "/users",
      "POST",
      {
        name,
        email: name + "@example.test",
        password,
        mobile: "+919999999999",
        role,
        permissions,
      },
      admin,
    );
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
  approver = await login("approver@example.test");
  reviewer = await login("reviewer@example.test");
  agent = await login("agent@example.test");
  assert.equal(
    (
      await call(
        "/users",
        "POST",
        {
          name: "Bad agent",
          email: "bad@example.test",
          password,
          mobile: "",
          role: "agent",
          permissions: ["approve"],
        },
        admin,
      )
    ).status,
    400,
  );
});
test("Private documents are inaccessible to visitors, other members and approvers", async () => {
  const upload = await call(
    "/files",
    "POST",
    {
      name: "ownership.pdf",
      kind: "document",
      mime: "application/pdf",
      data: Buffer.from("%PDF-1.4\n test fixture\n%%EOF").toString("base64"),
    },
    owner,
  );
  assert.equal(upload.status, 201);
  documentId = upload.data.id;
  const create = await call(
    "/properties",
    "POST",
    { ...listing, documentIds: [documentId] },
    owner,
  );
  assert.equal(create.status, 201, JSON.stringify(create.data));
  property = create.data.property.id;
  assert.equal((await call("/properties/" + property)).status, 404);
  for (const cookie of ["", other, approver])
    assert.equal(
      (await call("/files/" + documentId, "GET", undefined, cookie)).status,
      404,
    );
  for (const cookie of [owner, reviewer, admin])
    assert.equal(
      (await call("/files/" + documentId, "GET", undefined, cookie)).status,
      200,
    );
  const details = await call(
    "/properties/" + property,
    "GET",
    undefined,
    approver,
  );
  assert.equal(details.status, 200);
  assert.equal(details.data.property.documents, undefined);
  assert.equal(
    (await call("/properties/" + property, "PATCH", listing, other)).status,
    403,
  );
});
test("Agents cannot approve; approver must wait for admin document review", async () => {
  for (const cookie of [agent, owner, reviewer])
    assert.equal(
      (
        await call(
          "/properties/" + property + "/decision",
          "POST",
          { decision: "approved", note: "" },
          cookie,
        )
      ).status,
      403,
    );
  assert.equal(
    (
      await call(
        "/properties/" + property + "/review-documents",
        "POST",
        { note: "Checked supplied document." },
        approver,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/properties/" + property + "/decision",
        "POST",
        { decision: "approved", note: "" },
        approver,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        "/properties/" + property + "/review-documents",
        "POST",
        { note: "Checked supplied document." },
        reviewer,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/properties/" + property + "/decision",
        "POST",
        { decision: "approved", note: "Approved after review." },
        approver,
      )
    ).status,
    200,
  );
  const pub = await call("/public");
  assert.equal(pub.data.properties.length, 1);
  assert.equal(pub.data.properties[0].id, property);
  assert.equal(pub.data.properties[0].documents, undefined);
  assert.equal(pub.data.properties[0].owner_id, undefined);
  assert.equal(
    (await call("/files/" + documentId, "GET", undefined, approver)).status,
    404,
  );
});
test("Saved properties, service requests and edits persist with ownership checks", async () => {
  assert.equal(
    (await call("/favorites/" + property, "POST", undefined, other)).status,
    200,
  );
  const saved = await call("/me/workspace", "GET", undefined, other);
  assert.deepEqual(saved.data.favorites, [property]);
  const req = await call(
    "/tickets",
    "POST",
    {
      category: "viewing",
      subject: "Visit property",
      message: "Please arrange a viewing next week.",
      mobile: "+919999999999",
      propertyId: property,
    },
    other,
  );
  assert.equal(req.status, 201);
  assert.equal(
    (
      await call(
        "/tickets/" + req.data.id,
        "PATCH",
        { status: "approved", note: "Contacting you to schedule." },
        agent,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/tickets/" + req.data.id,
        "PATCH",
        { status: "approved", note: "Contacting you to schedule." },
        approver,
      )
    ).status,
    200,
  );
  const ws = await call("/me/workspace", "GET", undefined, other);
  assert.equal(ws.data.tickets[0].status, "approved");
  const ownerNotifications = await call("/notifications", "GET", undefined, other);
  assert.equal(ownerNotifications.status, 200);
  assert.equal(ownerNotifications.data.notifications.some((n:any) => n.entity_type === "ticket" && n.entity_id === req.data.id), true);
  const ownerChats = await call("/chats", "GET", undefined, other);
  assert.equal(ownerChats.data.threads.some((t:any) => t.id === "ticket:" + req.data.id && t.messages.length >= 2), true);
  assert.equal((await call("/tickets/" + req.data.id + "/messages", "POST", {message:"I can visit tomorrow afternoon."}, other)).status, 200);
  assert.equal((await call("/notifications", "GET", undefined, approver)).data.notifications.some((n:any) => n.entity_type === "ticket" && n.entity_id === req.data.id), true);
  assert.equal((await call("/notifications/read-thread", "POST", {entityType:"ticket",entityId:req.data.id}, other)).status, 200);
  assert.equal((await call("/notifications", "GET", undefined, other)).data.notifications.some((n:any) => n.entity_type === "ticket" && n.entity_id === req.data.id && !n.read_at), false);
  assert.equal(
    (
      await call(
        "/properties/" + property + "/availability",
        "PATCH",
        { availability: "sold" },
        other,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/properties/" + property + "/availability",
        "PATCH",
        { availability: "rented" },
        owner,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/properties/" + property + "/availability",
        "PATCH",
        { availability: "sold" },
        owner,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/properties/" + property,
        "PATCH",
        {
          ...listing,
          documentIds: [documentId],
          title: "Updated test courtyard home",
        },
        owner,
      )
    ).status,
    200,
  );
  assert.equal(
    (await call("/public")).data.properties.length,
    0,
    "Editing an approved property must trigger a new review.",
  );
});
test("Cross-origin mutations, invalid content and forged identities are rejected", async () => {
  const csrf = await fetch(base + "/api/settings", {
    method: "PATCH",
    headers: {
      Origin: "https://attacker.example",
      Cookie: admin,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(csrf.status, 403);
  const fake = await fetch(base + "/api/me/workspace", {
    headers: { "X-User-Role": "head_admin", "X-User-Id": userId },
  });
  assert.equal(fake.status, 401);
  assert.equal(
    (
      await call(
        "/files",
        "POST",
        {
          name: "fake.png",
          kind: "avatar",
          mime: "image/png",
          data: Buffer.from("<script>alert(1)</script>").toString("base64"),
        },
        owner,
      )
    ).status,
    400,
  );
  assert.equal(
    (await call("/properties", "POST", { ...listing, price: -1 }, owner))
      .status,
    400,
  );
  assert.equal(
    (await call("/auth/google", "POST", { credential: "invalid" }, owner))
      .status,
    503,
  );
});
test("Head admin manages directory assignments, publishing and session revocation", async () => {
  const a = await call(
    "/agents",
    "POST",
    {
      name: "Directory agent",
      mobile: "+919999999999",
      email: "directory@example.test",
      areas: "Ajmer Road",
      bio: "Local property support",
      userId: null,
      active: true,
    },
    admin,
  );
  assert.equal(a.status, 201);
  assert.equal(
    (
      await call(
        "/properties/" + property + "/agent",
        "PATCH",
        { agentId: a.data.id },
        agent,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/properties/" + property + "/agent",
        "PATCH",
        { agentId: a.data.id },
        admin,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/news",
        "POST",
        {
          title: "Team office update",
          category: "Announcement",
          body: "Our team is available for property enquiries this week.",
          sourceUrl: "",
          sourceName: "Property team",
        },
        approver,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/news",
        "POST",
        {
          title: "Team office update",
          category: "Announcement",
          body: "Our team is available for property enquiries this week.",
          sourceUrl: "",
          sourceName: "Property team",
        },
        admin,
      )
    ).status,
    201,
  );
  assert.equal((await call("/public")).data.news.length, 1);
  assert.equal(
    (
      await call(
        "/users/" + userId,
        "PATCH",
        { role: "member", permissions: [], active: false },
        admin,
      )
    ).status,
    200,
  );
  assert.equal(
    (await call("/me/workspace", "GET", undefined, owner)).status,
    401,
  );
  assert.equal(
    (
      await call("/auth/login", "POST", {
        email: "owner@example.test",
        password,
      })
    ).status,
    401,
  );
});

test('Agents directory is permission gated and map locations follow publication', async()=>{
 for(const cookie of ['',other,agent,approver]) assert.equal((await call('/agents','GET',undefined,cookie)).status,cookie?403:401);
 assert.deepEqual((await call('/public')).data.agents,[]);
 const invalid={...listing,latitude:undefined,longitude:undefined};
 assert.equal((await call('/properties','POST',invalid,other)).status,400);
 assert.equal((await call('/properties','POST',{...listing,latitude:91},other)).status,400);
 const created=await call('/properties','POST',{...listing,title:'Map location property',placeType:'Townhouse',latitude:26.109,longitude:74.325},other);
 assert.equal(created.status,201,JSON.stringify(created.data));const pid=created.data.property.id;
 assert.equal((await call('/properties/'+pid)).status,404);
 assert.equal((await call('/public')).data.properties.some((p:any)=>p.id===pid),false);
 const directory=(await call('/agents','GET',undefined,admin)).data.agents;
 const linked=directory.find((a:any)=>a.email==='agent@example.test');
 assert.equal((await call('/properties/'+pid+'/agent','PATCH',{agentId:linked.id},admin)).status,200);
 assert.equal((await call('/properties/'+pid+'/decision','POST',{decision:'approved',note:'Checked map listing'},approver)).status,200);
 const published=(await call('/properties/'+pid)).data.property;
 assert.equal(published.latitude,26.109);assert.equal(published.longitude,74.325);assert.equal(published.place_type,'Townhouse');
 assert.equal(published.review_history,undefined);assert.equal(published.review_note,undefined);assert.equal(published.assigned_agent,undefined);
 const own=(await call('/me/workspace','GET',undefined,other)).data.submissions.find((p:any)=>p.id===pid);
 assert.equal(own.assigned_agent.name,'agent');assert.equal(own.review_history[0].actor,'approver');
 assert.equal((await call('/properties/'+pid,'GET',undefined,other)).data.property.assigned_agent.mobile,'+919999999999');
 assert.equal((await call('/me/workspace','GET',undefined,agent)).data.assignedProperties.some((p:any)=>p.id===pid),true);
 assert.equal((await call('/properties/'+pid,'PATCH',{...listing,title:'Updated location property',agentId:null},other)).status,200);
 const edited=(await call('/properties/'+pid,'GET',undefined,other)).data.property;assert.equal(edited.agent_id,linked.id,'An owner edit must retain the manager assignment.');
});

let providerId='',bookingId='',serviceTeam='',serviceTeamId='';
const professional={name:'Test plumbing professional',category:'plumber',tier:'budget',startingPrice:350,priceUnit:'visit',mobile:'+919999999999',email:'plumber@example.test',areas:'Beawar, Ajmer Road',bio:'Test provider for the booking workflow.',experience:7,active:true,userId:null};
test('Service directory uses actual providers, limited management access and computed reviews',async()=>{
 const team=await call('/users','POST',{name:'Service team',email:'services@example.test',password,mobile:'+919999999999',role:'team',permissions:['manage_services']},admin);
 assert.equal(team.status,201,JSON.stringify(team.data));serviceTeamId=team.data.id;serviceTeam=await login('services@example.test');
 assert.equal((await call('/agents','GET',undefined,serviceTeam)).status,403);
 for(const cookie of [other,agent,approver])assert.equal((await call('/providers','POST',professional,cookie)).status,403);
 const a=await call('/providers','POST',professional,serviceTeam);assert.equal(a.status,201,JSON.stringify(a.data));providerId=a.data.id;
 const pub=(await call('/providers')).data.providers[0];assert.equal(pub.starting_price,350);assert.equal(pub.rating,0);assert.equal(pub.review_count,0);assert.equal(pub.mobile,undefined);assert.equal(pub.user_id,undefined);
 const providers=(await call('/providers?managed=1','GET',undefined,serviceTeam)).data.providers;assert.equal(providers[0].mobile,professional.mobile);
 const agentUser=(await call('/me','GET',undefined,agent)).data.user;
 assert.equal((await call('/providers/'+providerId,'PATCH',{...professional,userId:agentUser.id},admin)).status,200);
 assert.equal((await call('/providers/'+providerId,'PATCH',{...professional,userId:agentUser.id},serviceTeam)).status,403);
});
test('Bookings keep contacts, messages, state transitions and customer ownership private',async()=>{
 const payload={providerId,scheduledDate:'2099-12-20',timeSlot:'09:00–12:00',address:'Test service address, Beawar',mobile:'+919999999999',message:'Please repair the bathroom water fitting.'};
 assert.equal((await call('/bookings','POST',payload)).status,401);
 assert.equal((await call('/bookings','POST',{...payload,scheduledDate:'2020-01-01'},other)).status,400);
 const booked=await call('/bookings','POST',payload,other);assert.equal(booked.status,201,JSON.stringify(booked.data));bookingId=booked.data.id;
 const serviceNotifications=await call('/notifications','GET',undefined,serviceTeam);assert.equal(serviceNotifications.data.notifications.some((n:any)=>n.entity_type==='booking'&&n.entity_id===bookingId),true);
 const serviceChats=await call('/chats','GET',undefined,serviceTeam);assert.equal(serviceChats.data.threads.some((t:any)=>t.id==='booking:'+bookingId),true);
 assert.equal((await call('/bookings?managed=1','GET',undefined,other)).status,403);
 assert.equal((await call('/bookings','GET',undefined,approver)).data.bookings.length,0);
 const mine=(await call('/bookings','GET',undefined,other)).data.bookings[0];assert.equal(mine.provider.mobile,professional.mobile);assert.equal(mine.quoted_amount,350);assert.equal(mine.status,'requested');
 assert.equal((await call('/bookings','GET',undefined,agent)).data.bookings[0].id,bookingId);
 assert.equal((await call('/bookings/'+bookingId+'/status','POST',{status:'completed'},other)).status,403);
 assert.equal((await call('/bookings/'+bookingId+'/messages','POST',{message:'Unauthorized'},approver)).status,404);
 assert.equal((await call('/bookings/'+bookingId+'/messages','POST',{message:'Please call before arriving.'},other)).status,200);
 assert.equal((await call('/bookings/'+bookingId+'/messages','POST',{message:'We will call before the visit.'},agent)).status,200);
 assert.equal((await call('/bookings/'+bookingId+'/review','POST',{rating:5,comment:'Too early'},other)).status,409);
 assert.equal((await call('/bookings/'+bookingId+'/status','POST',{status:'completed'},agent)).status,409);
 assert.equal((await call('/bookings/'+bookingId+'/status','POST',{status:'confirmed',note:'Appointment confirmed'},agent)).status,200);
 assert.equal((await call('/bookings/'+bookingId+'/quote','POST',{amount:500,note:'Includes replacement fitting'},agent)).status,200);
});
test('SQL ledger prevents overpayments, duplicate receipts and excess refunds; genuine completed reviews aggregate',async()=>{
 const payment={amount:300,kind:'payment',method:'upi',reference:'TEST-UPI-001',note:'Test received payment'};
 assert.equal((await call('/bookings/'+bookingId+'/payments','POST',payment,other)).status,403);
 assert.equal((await call('/bookings/'+bookingId+'/payments','POST',payment,agent)).status,403);
 assert.equal((await call('/bookings/'+bookingId+'/payments','POST',{...payment,amount:600},serviceTeam)).status,400);
 assert.equal((await call('/bookings/'+bookingId+'/payments','POST',payment,serviceTeam)).status,200);
 assert.equal((await call('/bookings/'+bookingId+'/payments','POST',{...payment,amount:50},serviceTeam)).status,409);
 assert.equal((await call('/bookings/'+bookingId+'/payments','POST',{...payment,kind:'refund',reference:'REFUND-TOO-MUCH',amount:301},serviceTeam)).status,400);
 assert.equal((await call('/bookings/'+bookingId+'/payments','POST',{...payment,kind:'refund',reference:'REFUND-001',amount:50},serviceTeam)).status,200);
 const before=(await call('/bookings','GET',undefined,other)).data.bookings[0];assert.equal(before.paid_amount,250);assert.equal(before.payments.length,2);assert.equal(before.messages.length,2);
 assert.equal((await call('/bookings/'+bookingId+'/status','POST',{status:'in_progress'},agent)).status,200);
 assert.equal((await call('/bookings/'+bookingId+'/quote','POST',{amount:200,note:'Late quote'},agent)).status,409);
 assert.equal((await call('/bookings/'+bookingId+'/status','POST',{status:'completed'},agent)).status,200);
 assert.equal((await call('/bookings/'+bookingId+'/review','POST',{rating:5,comment:'Completed work test review.'},agent)).status,403);
 assert.equal((await call('/bookings/'+bookingId+'/review','POST',{rating:4,comment:'Completed work test review.'},other)).status,200);
 assert.equal((await call('/bookings/'+bookingId+'/review','POST',{rating:5,comment:'Duplicate review'},other)).status,409);
 const pub=(await call('/providers')).data.providers[0];assert.equal(pub.rating,4);assert.equal(pub.review_count,1);assert.equal(pub.completed_count,1);
 const reviews=(await call('/providers/'+providerId+'/reviews')).data.reviews;assert.equal(reviews.length,1);assert.equal(reviews[0].rating,4);
});

test('Live news parses safe links, caches responses and retains headlines during upstream outages',async()=>{
 const parsed=parseFeed(feedFixture,'beawar');assert.equal(parsed.length,1);assert.equal(parsed[0].title,'Test headline');
 assert.equal(parseFeed(feedFixture.replace('https://example.test/story','javascript:alert(1)'),'beawar').length,0);
 assert.throws(()=>parseFeed('<!DOCTYPE rss [<!ENTITY external SYSTEM "file:///etc/passwd">]><rss/>','beawar'));
 assert.throws(()=>parseFeed('<html>Upstream error</html>','beawar'));
 const first=(await call('/news-feed?scope=beawar')).data;assert.equal(first.articles.length,1);assert.equal(first.stale,false);assert.equal(feedRequests,1);
 await call('/news-feed?scope=beawar');assert.equal(feedRequests,1,'Fresh SQL cache avoids another upstream request');
 const testDb=new DatabaseSync(join(dir,'data','estate.sqlite'));testDb.prepare("UPDATE feed_cache SET fetched_at=? WHERE scope=?").run('2000-01-01T00:00:00Z','beawar');testDb.close();
 feedOffline=true;
 const stale=(await call('/news-feed?scope=beawar')).data;assert.equal(stale.stale,true);assert.equal(stale.articles.length,1);assert.match(stale.error,/temporarily unavailable/);
 const unavailable=(await call('/news-feed?scope=india')).data;assert.equal(unavailable.stale,true);assert.equal(unavailable.articles.length,0);
});
