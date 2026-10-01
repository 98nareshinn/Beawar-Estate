import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { resolve, extname, sep } from "node:path";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import {
  db,
  seed,
  root,
  uploadDir,
  id,
  audit,
  transaction,
  hashPassword,
  verifyPassword,
  can,
  publicUser,
  services,
  defaultPermissions,
  type User,
  type Role,
} from "./db.ts";
import {
  credentials,
  registration,
  account,
  propertyInput,
  agentInput,
  ticketInput,
  newsInput,
  mobile,
} from "./validation.ts";

import { handleMarketplace } from "./marketplace.ts";
import { getNewsFeed } from "./news-feed.ts";
import { configuredOrigins } from "./origins.ts";
import { markEntityRead, notificationList, notify, notifyUsers, staffUsers } from "./notifications.ts";

seed();
type Row = Record<string, any>;
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
const PORT = Number(process.env.PORT || 4000);
const origin = new URL(process.env.APP_ORIGIN || "http://localhost:5173").origin;
const allowedOrigins = configuredOrigins(origin, process.env.ADDITIONAL_ORIGINS);
const sessionHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const rateLimits = new Map<string, { count: number; until: number }>();
function rateLimit(req: IncomingMessage) {
  const key = req.socket.remoteAddress || "unknown";
  const entry = rateLimits.get(key);
  const now = Date.now();
  if (!entry || entry.until < now)
    rateLimits.set(key, { count: 1, until: now + 15 * 60000 });
  else if (++entry.count > 30)
    fail(429, "Too many attempts. Try again in 15 minutes.");
}
setInterval(() => {
  for (const [key, item] of rateLimits)
    if (item.until < Date.now()) rateLimits.delete(key);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}, 60000).unref();
function cookieToken(req: IncomingMessage) {
  return (
    (req.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("be_session="))
      ?.slice(11) || ""
  );
}
function currentUser(req: IncomingMessage): User | undefined {
  const token = cookieToken(req);
  if (!token) return;
  return db
    .prepare(
      "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1",
    )
    .get(sessionHash(token), Date.now()) as User | undefined;
}
function requireUser(user: User | undefined): User {
  return user || fail(401, "Please sign in to continue.");
}
function requirePermission(user: User | undefined, permission: string) {
  const u = requireUser(user);
  if (!can(u, permission))
    fail(403, "You do not have permission for this action.");
  return u;
}
function requireHead(user: User | undefined) {
  const u = requireUser(user);
  if (u.role !== "head_admin")
    fail(403, "Only the head admin can manage accounts and site settings.");
  return u;
}
function login(res: ServerResponse, userId: string) {
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
  ).run(sessionHash(token), userId, Date.now() + 7 * 86400000);
  res.setHeader(
    "Set-Cookie",
    `be_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
}
async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 9 * 1024 * 1024) fail(413, "Upload must be 6 MB or smaller.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return fail(400, "Invalid JSON request.");
  }
}
function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
function getSettings() {
  return Object.fromEntries(
    (
      db
        .prepare("SELECT key,value FROM settings WHERE key != 'demo_seeded'")
        .all() as Row[]
    ).map((r) => [r.key, r.value]),
  );
}
function propertyRow(row: Row): Row {
  const { password_hash, ...rest } = row;
  return {
    ...rest,
    images: JSON.parse(row.images),
    amenities: JSON.parse(row.amenities),
    is_demo: !!row.is_demo,
  };
}
const propSelect =
  "SELECT p.*,a.name AS agent_name,a.avatar AS agent_avatar,a.email AS agent_email,a.mobile AS agent_mobile,a.active AS agent_active,a.user_id AS agent_user_id FROM properties p LEFT JOIN agents a ON a.id=p.agent_id";
function getProperty(propertyId: string) {
  const p = db.prepare(propSelect + " WHERE p.id=?").get(propertyId) as
    | Row
    | undefined;
  return p || fail(404, "Property not found.");
}
function owns(user: User, p: Row) {
  return p.owner_id === user.id || user.role === "head_admin";
}
function safeProperty(p: Row) {
  const parsed = propertyRow(p);
  delete parsed.owner_id;
  delete parsed.review_note;
  delete parsed.agent_email;
  delete parsed.agent_mobile;
  delete parsed.agent_user_id;
  delete parsed.agent_active;
  if (!p.agent_active) { parsed.agent_name = null; parsed.agent_avatar = null; }
  return parsed;
}
function canRead(user: User | undefined, p: Row) {
  return (
    p.status === "approved" ||
    (!!user &&
      (owns(user, p) || can(user, "approve") || can(user, "review_documents") || can(user, "manage_agents") || p.agent_active && p.agent_user_id === user.id))
  );
}
function propertyDetail(p: Row, user: User | undefined) {
  if (!canRead(user, p)) fail(404, "Property not found.");
  const result = safeProperty(p);
  if (
    user &&
    (owns(user, p) || can(user, "approve") || can(user, "review_documents"))
  )
    result.review_note = p.review_note;
  if (user && (owns(user, p) || can(user, "review_documents")))
    result.documents = db
      .prepare(
        "SELECT id,name,size FROM files WHERE property_id=? AND kind='document'",
      )
      .all(p.id);
  if (user && p.agent_active && p.agent_id) result.assigned_agent = assignedContact(p);
  return result;
}
function assignedContact(p: Row) {
  return p.agent_id && p.agent_active ? { id: p.agent_id, name: p.agent_name, avatar: p.agent_avatar, email: p.agent_email || "", mobile: p.agent_mobile || "" } : null;
}
function reviewHistory(targetId: string, kind: "property" | "ticket") {
  return db.prepare("SELECT a.action,a.details,a.created_at,u.name AS actor FROM audit a LEFT JOIN users u ON u.id=a.user_id WHERE a.target_id=? AND a.action IN (?,?,?,?) ORDER BY a.id DESC").all(targetId,kind+".approved",kind+".rejected",kind+".changes_requested",kind+".resolved");
}
function ownSubmission(p: Row) {
  return {...safeProperty(p), review_note: p.review_note, assigned_agent: assignedContact(p), review_history: reviewHistory(p.id,"property")};
}
function ownTicket(t: Row) {
  const a = t.agent_id ? db.prepare("SELECT id,name,email,mobile,avatar FROM agents WHERE id=? AND active=1").get(t.agent_id) : t.property_id ? assignedContact(getProperty(t.property_id)) : null;
  return {...t, assigned_agent:a || null, review_history:reviewHistory(t.id,"ticket")};
}
function ticketAudience(t: Row) {
  const ids = [String(t.user_id)];
  const direct = t.agent_id ? db.prepare("SELECT user_id FROM agents WHERE id=? AND active=1").get(t.agent_id) as Row | undefined : undefined;
  if (direct?.user_id) ids.push(direct.user_id);
  if (t.property_id) {
    const property = getProperty(t.property_id);
    const assigned = property.agent_id ? db.prepare("SELECT user_id FROM agents WHERE id=? AND active=1").get(property.agent_id) as Row | undefined : undefined;
    if (assigned?.user_id) ids.push(assigned.user_id);
  }
  return [...new Set(ids)];
}
function ticketCanChat(t: Row, u: User) {
  if (t.user_id === u.id || can(u, "approve") || can(u, "review_documents") || can(u, "manage_agents")) return true;
  return ticketAudience(t).includes(u.id);
}
function chatThreads(u: User) {
  const rows = db.prepare(`SELECT t.*,p.title AS property_title,owner.name AS owner_name,a.name AS agent_name,a.mobile AS agent_mobile,a.user_id AS agent_user_id
    FROM tickets t LEFT JOIN properties p ON p.id=t.property_id JOIN users owner ON owner.id=t.user_id
    LEFT JOIN agents a ON a.id=t.agent_id`).all() as Row[];
  const tickets = rows.filter((t) => ticketCanChat(t, u)).map((t) => {
    const messages = (db.prepare("SELECT m.id,m.user_id,m.message,m.created_at,u.name AS sender FROM ticket_messages m JOIN users u ON u.id=m.user_id WHERE m.ticket_id=? ORDER BY m.id").all(t.id) as Row[]).map((m) => ({ id: String(m.id), sender_id: m.user_id, sender: m.sender, message: m.message, created_at: m.created_at, mine: m.user_id === u.id }));
    return { id: "ticket:" + t.id, type: "property", entity_id: t.id, subject: t.subject, title: t.property_title || t.subject, category: t.category, status: t.status, counterpart: t.user_id === u.id ? (t.agent_name || "Property team") : t.owner_name, counterpart_mobile: t.user_id === u.id ? (t.agent_mobile || "") : (t.mobile || ""), property_id: t.property_id, messages, unread: !!db.prepare("SELECT id FROM notifications WHERE user_id=? AND entity_type='ticket' AND entity_id=? AND read_at IS NULL LIMIT 1").get(u.id,t.id) };
  });
  const bookings = db.prepare(`SELECT b.*,customer.name AS customer_name,p.user_id AS provider_user_id FROM service_bookings b JOIN users customer ON customer.id=b.user_id JOIN service_providers p ON p.id=b.provider_id ${can(u,"manage_services") ? "" : "WHERE b.user_id=? OR p.user_id=?"} ORDER BY b.updated_at DESC`).all(...(can(u,"manage_services") ? [] : [u.id,u.id])) as Row[];
  return [...tickets, ...bookings.map((b) => {
    const messages = (db.prepare("SELECT m.id,m.user_id,m.message,m.created_at,u.name AS sender FROM booking_messages m JOIN users u ON u.id=m.user_id WHERE m.booking_id=? ORDER BY m.id").all(b.id) as Row[]).map((m) => ({ id: "b" + m.id, sender_id: m.user_id, sender: m.sender, message: m.message, created_at: m.created_at, mine: m.user_id === u.id }));
    const owner = b.user_id === u.id;
    return { id: "booking:" + b.id, type: "service", entity_id: b.id, subject: b.provider_name, title: b.provider_name, category: b.category, status: b.status, counterpart: owner ? b.provider_name : b.customer_name, counterpart_mobile: owner ? (db.prepare("SELECT mobile FROM service_providers WHERE id=?").get(b.provider_id) as Row | undefined)?.mobile || "" : b.mobile, property_id: null, messages, unread: !!db.prepare("SELECT id FROM notifications WHERE user_id=? AND entity_type='booking' AND entity_id=? AND read_at IS NULL LIMIT 1").get(u.id,b.id) };
  })];
}
function checkedPermissions(role: Role, permissions: string[]) {
  const allowed =
    role === "admin"
      ? ["approve", "review_documents", "manage_agents", "manage_content", "manage_services"]
      : role === "approver"
        ? ["approve"]
        : role === "team"
          ? ["manage_agents", "manage_content", "manage_services"]
          : [];
  if (permissions.some((p) => !allowed.includes(p)))
    fail(400, "Selected permissions are not available for this role.");
  return JSON.stringify(permissions);
}
function mediaAllowed(file: Row, user: User | undefined) {
  if (file.kind === "avatar" || file.kind === "logo") return true;
  if (user && file.owner_id === user.id) return true;
  if (!file.property_id) return false;
  const p = getProperty(file.property_id);
  if (file.kind === "document")
    return !!user && (owns(user, p) || can(user, "review_documents"));
  return canRead(user, p);
}
function syncAgent(user: User) {
  const a = db.prepare("SELECT id FROM agents WHERE user_id=?").get(user.id);
  if (user.role === "agent" && !a)
    db.prepare(
      "INSERT INTO agents(id,user_id,name,email,mobile,avatar) VALUES(?,?,?,?,?,?)",
    ).run(id(), user.id, user.name, user.email, user.mobile, user.avatar);
  if (a)
    db.prepare(
      "UPDATE agents SET name=?,email=?,mobile=?,avatar=?,active=? WHERE user_id=?",
    ).run(
      user.name,
      user.email,
      user.mobile,
      user.avatar,
      user.role === "agent" && user.active ? 1 : 0,
      user.id,
    );
}
function createProperty(user: User, body: any, existing?: Row) {
  const p = propertyInput.parse(body);
  const assignedId = existing && !can(user, "manage_agents") ? existing.agent_id : p.agentId;
  if (p.agentId && p.agentId !== existing?.agent_id) {
    const agent = db
      .prepare("SELECT * FROM agents WHERE id=? AND active=1")
      .get(p.agentId) as Row | undefined;
    if (!agent) fail(400, "Select an active agent.");
    if (
      !can(user, "manage_agents") &&
      user.role !== "head_admin" &&
      agent.user_id !== user.id
    )
      fail(403, "Only a manager can assign another agent.");
  }
  const fileIds = [...p.photoIds, ...p.documentIds];
  if (new Set(fileIds).size !== fileIds.length)
    fail(400, "A file can only be attached once.");
  for (const fileId of fileIds) {
    const f = db.prepare("SELECT * FROM files WHERE id=?").get(fileId) as
      | Row
      | undefined;
    const kind = p.photoIds.includes(fileId) ? "photo" : "document";
    if (
      !f ||
      f.owner_id !== user.id ||
      f.kind !== kind ||
      (f.property_id && f.property_id !== existing?.id)
    )
      fail(400, "Invalid or unavailable attachment.");
  }
  const propertyId = existing?.id || id();
  transaction(() => {
    const values = [
      p.title,
      p.description,
      p.type,
      p.purpose,
      p.price,
      p.area,
      p.locality,
      p.address,
      p.bedrooms,
      p.bathrooms,
      JSON.stringify(p.amenities),
      JSON.stringify(p.photoIds.map((f) => "/api/files/" + f)),
      assignedId,
      p.status,
      p.latitude, p.longitude, p.placeType,
    ];
    if (existing) {
      db.prepare(
        "UPDATE properties SET title=?,description=?,type=?,purpose=?,price=?,area=?,locality=?,address=?,bedrooms=?,bathrooms=?,amenities=?,images=?,agent_id=?,status=?,latitude=?,longitude=?,place_type=?,document_review='pending',review_note='',updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(...values, propertyId);
      db.prepare("UPDATE files SET property_id=NULL WHERE property_id=?").run(
        propertyId,
      );
    } else
      db.prepare(
        "INSERT INTO properties(title,description,type,purpose,price,area,locality,address,bedrooms,bathrooms,amenities,images,agent_id,status,latitude,longitude,place_type,id,owner_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run(...values, propertyId, user.id);
    for (const fileId of fileIds)
      db.prepare("UPDATE files SET property_id=? WHERE id=?").run(
        propertyId,
        fileId,
      );
    audit(
      user.id,
      existing ? "property.updated" : "property.submitted",
      propertyId,
      p.status,
    );
  });
  return propertyDetail(getProperty(propertyId), user);
}

export const server = createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com https://tile.openstreetmap.org; connect-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'",
  );
  try {
    const url = new URL(req.url || "/", origin);
    const path = url.pathname;
    const method = req.method || "GET";
    const user = currentUser(req);
    if (
      path.startsWith("/api/") &&
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      !allowedOrigins.has(req.headers.origin || "")
    )
      fail(403, "Request origin is not allowed.");
    if (method === "GET" && path === "/api/health")
      return json(res, { ok: true });
    if (method === "GET" && path === "/api/news-feed") {
      const scope = url.searchParams.get("scope") === "india" ? "india" : "beawar";
      return json(res, await getNewsFeed(scope));
    }
    if (await handleMarketplace(req,res,path,method,user,{json,readBody,fail,requireUser,requirePermission})) return;
    if (method === "GET" && path === "/api/public") {
      const properties = (
        db
          .prepare(
            propSelect +
              " WHERE p.status='approved' ORDER BY p.created_at DESC",
          )
          .all() as Row[]
      ).map(safeProperty);
      return json(res, {
        properties,
        agents: [],
        services,
        news: db
          .prepare(
            "SELECT id,title,category,body,source_url,source_name,published_at FROM news ORDER BY published_at DESC",
          )
          .all(),
        settings: getSettings(),
        googleClientId: process.env.GOOGLE_CLIENT_ID || "",
      });
    }
    if (method === "GET" && path === "/api/me")
      return json(res, { user: user ? publicUser(user) : null });
    if (method === "POST" && path === "/api/auth/login") {
      rateLimit(req);
      const body = credentials.parse(await readBody(req));
      const found = db
        .prepare("SELECT * FROM users WHERE email=? AND active=1")
        .get(body.email) as User | undefined;
      if (!found || !verifyPassword(body.password, found.password_hash))
        fail(401, "Email or password is incorrect.");
      login(res, found.id);
      return json(res, { user: publicUser(found) });
    }
    if (method === "POST" && path === "/api/auth/register") {
      rateLimit(req);
      const b = registration.parse(await readBody(req));
      if (db.prepare("SELECT id FROM users WHERE email=?").get(b.email))
        fail(409, "An account already exists for this email. Please sign in.");
      const uid = id();
      db.prepare(
        "INSERT INTO users(id,name,email,mobile,password_hash,role) VALUES(?,?,?,?,?,'member')",
      ).run(uid, b.name, b.email, b.mobile, hashPassword(b.password));
      login(res, uid);
      return json(
        res,
        {
          user: publicUser(
            db.prepare("SELECT * FROM users WHERE id=?").get(uid) as User,
          ),
        },
        201,
      );
    }
    if (method === "POST" && path === "/api/auth/google") {
      rateLimit(req);
      if (!process.env.GOOGLE_CLIENT_ID)
        fail(503, "Google sign-in is not configured. Use email and password.");
      const b = z
        .object({ credential: z.string().min(20).max(10000) })
        .parse(await readBody(req));
      let payload;
      try {
        ({ payload } = await jwtVerify(b.credential, googleKeys, {
          audience: process.env.GOOGLE_CLIENT_ID,
          issuer: ["https://accounts.google.com", "accounts.google.com"],
        }));
      } catch {
        return fail(401, "Google sign-in could not be verified.");
      }
      if (
        !payload.email_verified ||
        typeof payload.email !== "string" ||
        typeof payload.sub !== "string"
      )
        fail(401, "A verified Google email is required.");
      const email = (payload.email as string).toLowerCase();
      let found = db
        .prepare("SELECT * FROM users WHERE google_sub=? OR email=?")
        .get(payload.sub as string, email) as User | undefined;
      if (found && !found.active)
        fail(403, "Your account is inactive. Contact the head admin.");
      if (found && found.google_sub && found.google_sub !== payload.sub)
        fail(403, "This account is linked to a different Google identity.");
      if (
        found &&
        !found.google_sub &&
        !email.endsWith("@gmail.com") &&
        !payload.hd
      )
        fail(
          403,
          "Sign in with your password for this email. Google cannot link this account automatically.",
        );
      const picture =
        typeof payload.picture === "string" &&
        /^https:\/\/[^/]*googleusercontent\.com\//.test(payload.picture)
          ? payload.picture
          : "";
      if (!found) {
        const uid = id();
        db.prepare(
          "INSERT INTO users(id,name,email,password_hash,role,google_sub,avatar) VALUES(?,?,?,?,'member',?,?)",
        ).run(
          uid,
          String(payload.name || email).slice(0, 80),
          email,
          hashPassword(randomBytes(32).toString("hex")),
          payload.sub as string,
          picture,
        );
        found = db.prepare("SELECT * FROM users WHERE id=?").get(uid) as User;
      } else
        db.prepare("UPDATE users SET google_sub=?,avatar=? WHERE id=?").run(
          payload.sub as string,
          picture,
          found.id,
        );
      found = db
        .prepare("SELECT * FROM users WHERE id=?")
        .get(found.id) as User;
      syncAgent(found);
      login(res, found.id);
      return json(res, { user: publicUser(found) });
    }
    if (method === "POST" && path === "/api/auth/logout") {
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
        sessionHash(cookieToken(req)),
      );
      res.setHeader(
        "Set-Cookie",
        `be_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
      );
      return json(res, { ok: true });
    }
    if (method === "PATCH" && path === "/api/me") {
      const u = requireUser(user);
      const b = z
        .object({
          name: z.string().trim().min(2).max(80),
          mobile,
          avatarId: z.string().uuid().optional(),
        })
        .parse(await readBody(req));
      let avatar = u.avatar;
      if (b.avatarId) {
        const f = db
          .prepare(
            "SELECT id FROM files WHERE id=? AND owner_id=? AND kind='avatar'",
          )
          .get(b.avatarId, u.id);
        if (!f) fail(400, "Invalid profile photo.");
        avatar = "/api/files/" + b.avatarId;
      }
      db.prepare("UPDATE users SET name=?,mobile=?,avatar=? WHERE id=?").run(
        b.name,
        b.mobile,
        avatar,
        u.id,
      );
      const next = db
        .prepare("SELECT * FROM users WHERE id=?")
        .get(u.id) as User;
      syncAgent(next);
      return json(res, { user: publicUser(next) });
    }
    if (method === "POST" && path === "/api/me/password") {
      const u = requireUser(user);
      const b = z
        .object({
          currentPassword: z.string().max(128),
          newPassword: z.string().min(12).max(128),
        })
        .parse(await readBody(req));
      if (!verifyPassword(b.currentPassword, u.password_hash))
        fail(400, "Current password is incorrect.");
      transaction(() => {
        db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
          hashPassword(b.newPassword),
          u.id,
        );
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
        audit(u.id, "password.changed", u.id);
      });
      login(res, u.id);
      return json(res, { ok: true });
    }
    if (method === "GET" && path === "/api/me/workspace") {
      const u = requireUser(user);
      const review = can(u, "approve") || can(u, "review_documents");
      return json(res, {
        submissions: (
          db
            .prepare(
              propSelect + " WHERE p.owner_id=? ORDER BY p.created_at DESC",
            )
            .all(u.id) as Row[]
        ).map(ownSubmission),
        favorites: db
          .prepare("SELECT property_id FROM favorites WHERE user_id=?")
          .all(u.id)
          .map((r) => r.property_id),
        tickets: (db.prepare("SELECT * FROM tickets WHERE user_id=? ORDER BY created_at DESC").all(u.id) as Row[]).map(ownTicket),
        assignedProperties: u.role === "agent" ? (db.prepare(propSelect + " WHERE a.user_id=? AND a.active=1 ORDER BY p.created_at DESC").all(u.id) as Row[]).map(p => propertyDetail(p,u)) : [],
        queue: review
          ? (
              db
                .prepare(
                  propSelect +
                    " WHERE p.status IN ('pending','changes_requested') AND p.is_demo=0 ORDER BY p.created_at ASC",
                )
                .all() as Row[]
            ).map((p) => propertyDetail(p, u))
          : [],
        reviewTickets: can(u, "approve")
          ? db
              .prepare(
                "SELECT t.*,u.name AS submitter FROM tickets t JOIN users u ON u.id=t.user_id WHERE t.status='pending' ORDER BY t.created_at",
              )
              .all()
          : [],
        agents: can(u, "manage_agents")
          ? db
              .prepare(
                "SELECT a.*,COUNT(p.id) AS property_count FROM agents a LEFT JOIN properties p ON p.agent_id=a.id GROUP BY a.id ORDER BY a.created_at DESC",
              )
              .all()
          : db
              .prepare(
                "SELECT id,name FROM agents WHERE user_id=? AND active=1",
              )
              .all(u.id),
        users:
          u.role === "head_admin"
            ? (
                db
                  .prepare("SELECT * FROM users ORDER BY created_at DESC")
                  .all() as User[]
              ).map(publicUser)
            : [],
        audit:
          u.role === "head_admin"
            ? db
                .prepare(
                  "SELECT a.*,u.name AS actor FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 30",
                )
                .all()
            : [],
      });
    }
    if (method === "GET" && path === "/api/notifications") {
      return json(res, notificationList(requireUser(user)));
    }
    if (method === "POST" && path === "/api/notifications/read-all") {
      const u = requireUser(user);
      db.prepare("UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE user_id=?").run(u.id);
      return json(res, { ok: true });
    }
    const notification = path.match(/^\/api\/notifications\/([^/]+)\/read$/);
    if (method === "POST" && notification) {
      const u = requireUser(user);
      db.prepare("UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND user_id=?").run(notification[1], u.id);
      return json(res, { ok: true });
    }
    if (method === "POST" && path === "/api/notifications/read-thread") {
      const u = requireUser(user);
      const b = z.object({ entityType: z.enum(["ticket", "booking"]), entityId: z.string().min(1).max(120) }).parse(await readBody(req));
      markEntityRead(u, b.entityType, b.entityId);
      return json(res, { ok: true });
    }
    if (method === "GET" && path === "/api/chats") {
      return json(res, { threads: chatThreads(requireUser(user)) });
    }
    const ticketMessage = path.match(/^\/api\/tickets\/([^/]+)\/messages$/);
    if (method === "POST" && ticketMessage) {
      const u = requireUser(user);
      const t = db.prepare("SELECT * FROM tickets WHERE id=?").get(ticketMessage[1]) as Row | undefined;
      if (!t || !ticketCanChat(t, u)) fail(404, "Conversation not found.");
      const b = z.object({ message: z.string().trim().min(1).max(2000) }).parse(await readBody(req));
      db.prepare("INSERT INTO ticket_messages(ticket_id,user_id,message) VALUES(?,?,?)").run(t.id, u.id, b.message);
      notifyUsers(ticketAudience(t), "message", "New property message", b.message, "ticket", t.id, u.id);
      return json(res, { ok: true });
    }
    const propertyMatch = path.match(/^\/api\/properties\/([^/]+)$/);
    if (method === "GET" && propertyMatch)
      return json(res, {
        property: propertyDetail(getProperty(propertyMatch[1]), user),
      });
    if (method === "POST" && path === "/api/properties")
      return json(
        res,
        { property: createProperty(requireUser(user), await readBody(req)) },
        201,
      );
    if (method === "PATCH" && propertyMatch) {
      const u = requireUser(user),
        p = getProperty(propertyMatch[1]);
      if (p.owner_id !== u.id)
        fail(403, "Only the submitter can edit this property.");
      if (p.is_demo)
        fail(
          400,
          "Remove demo listings from Site settings and create a real listing.",
        );
      return json(res, { property: createProperty(u, await readBody(req), p) });
    }
    const decision = path.match(/^\/api\/properties\/([^/]+)\/decision$/);
    if (method === "POST" && decision) {
      const u = requirePermission(user, "approve");
      const p = getProperty(decision[1]);
      if (p.owner_id === u.id)
        fail(
          403,
          "You cannot approve your own submission. Ask another approver.",
        );
      if (p.status !== "pending" && p.status !== "changes_requested")
        fail(409, "This submission is no longer awaiting a decision.");
      const b = z
        .object({
          decision: z.enum(["approved", "rejected", "changes_requested"]),
          note: z.string().trim().max(2000),
        })
        .parse(await readBody(req));
      if (b.decision !== "approved" && b.note.length < 5)
        fail(400, "Please explain the changes needed or rejection.");
      if (
        b.decision === "approved" &&
        p.document_review !== "reviewed" &&
        db
          .prepare(
            "SELECT id FROM files WHERE property_id=? AND kind='document' LIMIT 1",
          )
          .get(p.id)
      )
        fail(409, "An authorized admin must review the documents first.");
      transaction(() => {
        db.prepare(
          "UPDATE properties SET status=?,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(b.decision, b.note, p.id);
        audit(u.id, "property." + b.decision, p.id, b.note);
      });
      notify(p.owner_id, "property", "Property review updated", b.note || `Your property is now ${b.decision}.`, "property", p.id);
      return json(res, { ok: true });
    }
    const review = path.match(/^\/api\/properties\/([^/]+)\/review-documents$/);
    if (method === "POST" && review) {
      const u = requirePermission(user, "review_documents");
      const p = getProperty(review[1]);
      if (p.owner_id === u.id)
        fail(403, "Another administrator must review your documents.");
      const b = z
        .object({ note: z.string().trim().min(5).max(2000) })
        .parse(await readBody(req));
      if (!["pending", "changes_requested"].includes(p.status))
        fail(409, "Only pending submissions can be reviewed.");
      transaction(() => {
        db.prepare(
          "UPDATE properties SET document_review='reviewed',review_note=? WHERE id=?",
        ).run(b.note, p.id);
        audit(u.id, "documents.reviewed", p.id, b.note);
      });
      notify(p.owner_id, "property", "Property documents reviewed", b.note, "property", p.id);
      return json(res, { ok: true });
    }
    const availability = path.match(
      /^\/api\/properties\/([^/]+)\/availability$/,
    );
    if (method === "PATCH" && availability) {
      const u = requireUser(user),
        p = getProperty(availability[1]);
      if (!owns(u, p))
        fail(403, "Only the submitter or head admin can update availability.");
      const b = z
        .object({ availability: z.enum(["available", "sold", "rented"]) })
        .parse(await readBody(req));
      if (
        (b.availability === "sold" && p.purpose !== "sale") ||
        (b.availability === "rented" && p.purpose !== "rent")
      )
        fail(400, "Availability must match the listing purpose.");
      db.prepare(
        "UPDATE properties SET availability=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(b.availability, p.id);
      audit(u.id, "property.availability", p.id, b.availability);
      return json(res, { ok: true });
    }
    const favorite = path.match(/^\/api\/favorites\/([^/]+)$/);
    if (favorite && ["POST", "DELETE"].includes(method)) {
      const u = requireUser(user),
        p = getProperty(favorite[1]);
      if (p.status !== "approved") fail(404, "Property not found.");
      if (method === "POST")
        db.prepare(
          "INSERT OR IGNORE INTO favorites(user_id,property_id) VALUES(?,?)",
        ).run(u.id, p.id);
      else
        db.prepare(
          "DELETE FROM favorites WHERE user_id=? AND property_id=?",
        ).run(u.id, p.id);
      return json(res, { ok: true });
    }
    if (method === "POST" && path === "/api/files") {
      const u = requireUser(user);
      const b = z
        .object({
          name: z.string().min(1).max(150),
          kind: z.enum(["photo", "document", "avatar", "logo"]),
          mime: z.enum([
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
          ]),
          data: z.string().max(8500000),
        })
        .parse(await readBody(req));
      if (b.kind === "logo") requireHead(u);
      if (b.mime === "application/pdf" && b.kind !== "document")
        fail(400, "Please choose a JPEG, PNG or WebP image.");
      const bytes = Buffer.from(b.data, "base64");
      if (!bytes.length || bytes.length > 6 * 1024 * 1024)
        fail(400, "File must be between 1 byte and 6 MB.");
      const valid =
        b.mime === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : b.mime === "image/png"
            ? bytes
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : b.mime === "image/webp"
              ? bytes.toString("ascii", 0, 4) === "RIFF" &&
                bytes.toString("ascii", 8, 12) === "WEBP"
              : bytes.toString("ascii", 0, 5) === "%PDF-";
      if (!valid) fail(400, "File contents do not match its type.");
      const fid = id(),
        disk =
          fid +
          {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "application/pdf": ".pdf",
          }[b.mime];
      writeFileSync(resolve(uploadDir, disk), bytes, { mode: 0o600 });
      try {
        db.prepare(
          "INSERT INTO files(id,owner_id,name,mime,kind,size,disk_name) VALUES(?,?,?,?,?,?,?)",
        ).run(fid, u.id, b.name, b.mime, b.kind, bytes.length, disk);
      } catch (e) {
        unlinkSync(resolve(uploadDir, disk));
        throw e;
      }
      return json(
        res,
        { id: fid, url: "/api/files/" + fid, name: b.name },
        201,
      );
    }
    const file = path.match(/^\/api\/files\/([^/]+)$/);
    if (method === "GET" && file) {
      const f = db.prepare("SELECT * FROM files WHERE id=?").get(file[1]) as
        | Row
        | undefined;
      if (!f || !mediaAllowed(f, user)) fail(404, "File not found.");
      const full = resolve(uploadDir, f.disk_name);
      if (!existsSync(full)) fail(404, "File is unavailable.");
      res.writeHead(200, {
        "Content-Type": f.mime,
        "Content-Length": f.size,
        "Cache-Control": "private, no-store",
        "Content-Disposition": `${f.kind === "document" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      });
      return res.end(readFileSync(full));
    }
    if (method === "POST" && path === "/api/tickets") {
      const u = requireUser(user);
      const b = ticketInput.parse(await readBody(req));
      if (b.propertyId) {
        const p = getProperty(b.propertyId);
        if (p.status !== "approved" || p.is_demo)
          fail(400, "Enquiries are available for real approved listings.");
        if (p.availability !== "available")
          fail(400, "This property is no longer available.");
      }
      const tid = id();
      db.prepare(
        "INSERT INTO tickets(id,user_id,property_id,category,subject,message,mobile) VALUES(?,?,?,?,?,?,?)",
      ).run(
        tid,
        u.id,
        b.propertyId,
        b.category,
        b.subject,
        b.message,
        b.mobile,
      );
      db.prepare("INSERT INTO ticket_messages(ticket_id,user_id,message) VALUES(?,?,?)").run(tid, u.id, b.message);
      const ticketRow = db.prepare("SELECT * FROM tickets WHERE id=?").get(tid) as Row;
      notifyUsers([...ticketAudience(ticketRow), ...staffUsers()], "request", "New property request", b.subject, "ticket", tid, u.id);
      audit(u.id, "ticket.created", tid, b.subject);
      return json(res, { id: tid }, 201);
    }
    const ticket = path.match(/^\/api\/tickets\/([^/]+)$/);
    if (method === "PATCH" && ticket) {
      const u = requirePermission(user, "approve");
      const t = db
        .prepare("SELECT * FROM tickets WHERE id=?")
        .get(ticket[1]) as Row | undefined;
      if (!t) fail(404, "Request not found.");
      if (t.user_id === u.id)
        fail(403, "Another approver must handle your request.");
      const b = z
        .object({
          status: z.enum(["approved", "rejected", "resolved"]),
          note: z.string().trim().min(3).max(2000),
        })
        .parse(await readBody(req));
      db.prepare("UPDATE tickets SET status=?,note=? WHERE id=?").run(
        b.status,
        b.note,
        t.id,
      );
      db.prepare("INSERT INTO ticket_messages(ticket_id,user_id,message) VALUES(?,?,?)").run(t.id, u.id, b.note);
      notifyUsers(ticketAudience(t), "message", "Reply on your property request", b.note, "ticket", t.id, u.id);
      audit(u.id, "ticket." + b.status, t.id, b.note);
      return json(res, { ok: true });
    }
    if (method === "POST" && path === "/api/users") {
      const u = requireHead(user);
      const b = account.parse(await readBody(req));
      const permissions = checkedPermissions(b.role, b.permissions);
      if (db.prepare("SELECT id FROM users WHERE email=?").get(b.email))
        fail(
          409,
          "This email already has an account. Edit its permissions instead.",
        );
      const uid = id();
      transaction(() => {
        db.prepare(
          "INSERT INTO users(id,name,email,mobile,password_hash,role,permissions) VALUES(?,?,?,?,?,?,?)",
        ).run(
          uid,
          b.name,
          b.email,
          b.mobile,
          hashPassword(b.password),
          b.role,
          permissions,
        );
        syncAgent(
          db.prepare("SELECT * FROM users WHERE id=?").get(uid) as User,
        );
        audit(u.id, "account.created", uid, b.role);
      });
      return json(res, { id: uid }, 201);
    }
    const member = path.match(/^\/api\/users\/([^/]+)$/);
    if (method === "PATCH" && member) {
      const u = requireHead(user);
      const target = db
        .prepare("SELECT * FROM users WHERE id=?")
        .get(member[1]) as User | undefined;
      if (!target) fail(404, "Account not found.");
      if (target.role === "head_admin")
        fail(
          400,
          "Head-admin access cannot be changed here. Use your profile settings.",
        );
      const b = z
        .object({
          role: z.enum(["admin", "approver", "agent", "team", "member"]),
          permissions: z.array(z.string()).max(5),
          active: z.boolean(),
          password: z.string().min(12).max(128).optional(),
        })
        .parse(await readBody(req));
      const perms = checkedPermissions(b.role, b.permissions);
      transaction(() => {
        db.prepare(
          "UPDATE users SET role=?,permissions=?,active=? WHERE id=?",
        ).run(b.role, perms, b.active ? 1 : 0, target.id);
        if (b.password)
          db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
            hashPassword(b.password),
            target.id,
          );
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(target.id);
        syncAgent(
          db.prepare("SELECT * FROM users WHERE id=?").get(target.id) as User,
        );
        audit(u.id, "account.updated", target.id, b.role);
      });
      return json(res, { ok: true });
    }
    if (method === "GET" && path === "/api/agents") {
      requirePermission(user,"manage_agents");
      return json(res,{agents:db.prepare("SELECT a.*,COUNT(p.id) AS property_count FROM agents a LEFT JOIN properties p ON p.agent_id=a.id GROUP BY a.id").all()});
    }
    if (method === "POST" && path === "/api/agents") {
      const u = requirePermission(user, "manage_agents");
      const b = agentInput.parse(await readBody(req));
      if (
        b.userId &&
        !db
          .prepare("SELECT id FROM users WHERE id=? AND role='agent'")
          .get(b.userId)
      )
        fail(400, "Select an agent account.");
      const aid = id();
      db.prepare(
        "INSERT INTO agents(id,user_id,name,email,mobile,areas,bio,active) VALUES(?,?,?,?,?,?,?,?)",
      ).run(
        aid,
        b.userId,
        b.name,
        b.email,
        b.mobile,
        b.areas,
        b.bio,
        b.active ? 1 : 0,
      );
      audit(u.id, "agent.created", aid);
      return json(res, { id: aid }, 201);
    }
    const agent = path.match(/^\/api\/agents\/([^/]+)$/);
    if (method === "PATCH" && agent) {
      const u = requirePermission(user, "manage_agents");
      const current = db
        .prepare("SELECT * FROM agents WHERE id=?")
        .get(agent[1]) as Row | undefined;
      if (!current) fail(404, "Agent not found.");
      const b = agentInput.parse(await readBody(req));
      db.prepare(
        "UPDATE agents SET name=?,email=?,mobile=?,areas=?,bio=?,active=? WHERE id=?",
      ).run(
        b.name,
        b.email,
        b.mobile,
        b.areas,
        b.bio,
        b.active ? 1 : 0,
        current.id,
      );
      audit(u.id, "agent.updated", current.id);
      return json(res, { ok: true });
    }
    const assignment = path.match(/^\/api\/properties\/([^/]+)\/agent$/);
    if (method === "PATCH" && assignment) {
      const u = requirePermission(user, "manage_agents");
      const p = getProperty(assignment[1]);
      const b = z
        .object({ agentId: z.string().uuid().nullable() })
        .parse(await readBody(req));
      if (
        b.agentId &&
        !db
          .prepare("SELECT id FROM agents WHERE id=? AND active=1")
          .get(b.agentId)
      )
        fail(400, "Select an active agent.");
      db.prepare("UPDATE properties SET agent_id=? WHERE id=?").run(
        b.agentId,
        p.id,
      );
      if (b.agentId) {
        const linked = db.prepare("SELECT user_id FROM agents WHERE id=? AND active=1").get(b.agentId) as Row | undefined;
        if (linked?.user_id) notify(linked.user_id, "property", "Property assigned to you", p.title, "property", p.id);
      }
      audit(u.id, "property.assigned", p.id, b.agentId || "Unassigned");
      return json(res, { ok: true });
    }
    if (method === "GET" && path === "/api/managed-properties") {
      requirePermission(user, "manage_agents");
      return json(res, {
        properties: (
          db.prepare(propSelect + " ORDER BY p.created_at DESC").all() as Row[]
        ).map(safeProperty),
      });
    }
    if (method === "GET" && path === "/api/managed-tickets") {
      requirePermission(user,"manage_agents");
      return json(res,{tickets:db.prepare("SELECT id,subject,status,agent_id FROM tickets ORDER BY created_at DESC").all()});
    }
    const ticketAssignment=path.match(/^\/api\/tickets\/([^/]+)\/agent$/);
    if (method === "PATCH" && ticketAssignment) {
      const u=requirePermission(user,"manage_agents");
      const b=z.object({agentId:z.string().uuid().nullable()}).parse(await readBody(req));
      if(!db.prepare("SELECT id FROM tickets WHERE id=?").get(ticketAssignment[1])) fail(404,"Request not found.");
      if(b.agentId&&!db.prepare("SELECT id FROM agents WHERE id=? AND active=1").get(b.agentId)) fail(400,"Select an active agent.");
      db.prepare("UPDATE tickets SET agent_id=? WHERE id=?").run(b.agentId,ticketAssignment[1]);
      if (b.agentId) {
        const linked = db.prepare("SELECT user_id FROM agents WHERE id=? AND active=1").get(b.agentId) as Row | undefined;
        if (linked?.user_id) notify(linked.user_id, "request", "Request assigned to you", ticketAssignment[1], "ticket", ticketAssignment[1]);
      }
      audit(u.id,"ticket.assigned",ticketAssignment[1],b.agentId||"Unassigned");
      return json(res,{ok:true});
    }
    if (method === "POST" && path === "/api/news") {
      const u = requirePermission(user, "manage_content");
      const b = newsInput.parse(await readBody(req));
      const nid = id();
      db.prepare(
        "INSERT INTO news(id,title,category,body,source_url,source_name,author_id) VALUES(?,?,?,?,?,?,?)",
      ).run(nid, b.title, b.category, b.body, b.sourceUrl, b.sourceName, u.id);
      audit(u.id, "news.published", nid, b.title);
      return json(res, { id: nid }, 201);
    }
    const news = path.match(/^\/api\/news\/([^/]+)$/);
    if (method === "DELETE" && news) {
      const u = requirePermission(user, "manage_content");
      db.prepare("DELETE FROM news WHERE id=?").run(news[1]);
      audit(u.id, "news.removed", news[1]);
      return json(res, { ok: true });
    }
    if (method === "PATCH" && path === "/api/settings") {
      const u = requireHead(user);
      const b = z
        .object({
          brandName: z.string().trim().min(2).max(60),
          tagline: z.string().trim().max(120),
          contactEmail: z.union([z.email(), z.literal("")]),
          contactPhone: mobile,
          privacy: z.string().trim().min(20).max(10000),
          terms: z.string().trim().min(20).max(10000),
          logoId: z.string().uuid().optional(),
        })
        .parse(await readBody(req));
      transaction(() => {
        for (const [k, v] of Object.entries(b)) {
          if (k === "logoId") continue;
          db.prepare(
            "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          ).run(k, v);
        }
        if (b.logoId) {
          if (
            !db
              .prepare(
                "SELECT id FROM files WHERE id=? AND owner_id=? AND kind='logo'",
              )
              .get(b.logoId, u.id)
          )
            fail(400, "Invalid logo file.");
          db.prepare("UPDATE settings SET value=? WHERE key='logo'").run(
            "/api/files/" + b.logoId,
          );
        }
        audit(u.id, "settings.updated", "site");
      });
      return json(res, { settings: getSettings() });
    }
    if (method === "DELETE" && path === "/api/demo") {
      const u = requireHead(user);
      transaction(() => {
        db.prepare("DELETE FROM properties WHERE is_demo=1").run();
        audit(u.id, "demo.removed", "site");
      });
      return json(res, { ok: true });
    }
    if (path.startsWith("/api/")) return fail(404, "Endpoint not found.");
    if (method !== "GET" && method !== "HEAD")
      return fail(405, "Method not allowed.");
    const dist = resolve(root, "frontend/dist");
    const requested = resolve(dist, "." + decodeURIComponent(path));
    if (!requested.startsWith(dist + sep) && requested !== dist)
      fail(400, "Invalid path.");
    const target =
      existsSync(requested) && statSync(requested).isFile()
        ? requested
        : resolve(dist, "index.html");
    if (!existsSync(target))
      return fail(
        404,
        "Frontend build not found. Start the frontend development server or run npm run build in frontend.",
      );
    const mime: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".jpg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
    };
    res.writeHead(200, {
      "Content-Type": mime[extname(target)] || "application/octet-stream",
      "Cache-Control":
        extname(target) === ".html" ? "no-cache" : "public, max-age=3600",
    });
    return res.end(method === "HEAD" ? undefined : readFileSync(target));
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        res,
        {
          issues: error.issues,
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    if (error instanceof HttpError)
      return json(res, { error: error.message }, error.status);
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    )
      return json(res, { error: "This record already exists." }, 409);
    console.error(error);
    return json(res, { error: "Something went wrong. Please try again." }, 500);
  }
});
server.listen(PORT, "0.0.0.0", () =>
  console.log(`Beawar Estate backend listening on port ${PORT}`),
);
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
