import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const dataDir = resolve(root, process.env.DATA_DIR || "backend/data");
export const uploadDir = resolve(
  root,
  process.env.UPLOAD_DIR || "backend/uploads",
);
mkdirSync(dataDir, { recursive: true });
mkdirSync(uploadDir, { recursive: true });
export const db = new DatabaseSync(resolve(dataDir, "estate.sqlite"));
db.exec(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../sql/schema.sql"), "utf8"));
// Additive migration preserves existing installations and their requests.
const ticketColumns = db.prepare("PRAGMA table_info(tickets)").all();
if (!ticketColumns.some(column => column.name === "agent_id")) db.exec("ALTER TABLE tickets ADD COLUMN agent_id TEXT REFERENCES agents(id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_tickets_agent ON tickets(agent_id)");

const propertyColumns = new Set(db.prepare("PRAGMA table_info(properties)").all().map(c => c.name));
for (const [name, definition] of Object.entries({ latitude:"REAL", longitude:"REAL", place_type:"TEXT NOT NULL DEFAULT 'Other'" })) {
  if (!propertyColumns.has(name)) db.exec(`ALTER TABLE properties ADD COLUMN ${name} ${definition}`);
}

export const id = () => randomUUID();
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const value = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return value.length === expected.length && timingSafeEqual(value, expected);
}
export function audit(
  userId: string,
  action: string,
  targetId: string,
  details = "",
) {
  db.prepare(
    "INSERT INTO audit(user_id,action,target_id,details) VALUES(?,?,?,?)",
  ).run(userId, action, targetId, details);
}
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export type Role =
  | "head_admin"
  | "admin"
  | "approver"
  | "agent"
  | "team"
  | "member";
export type User = {
  id: string;
  name: string;
  email: string;
  mobile: string;
  password_hash: string;
  role: Role;
  permissions: string;
  avatar: string;
  active: number;
  google_sub?: string;
};
export const defaultPermissions: Record<Role, string[]> = {
  head_admin: [
    "approve",
    "review_documents",
    "manage_agents",
    "manage_content",
    "manage_services",
  ],
  admin: ["review_documents", "manage_agents", "manage_content"],
  approver: ["approve"],
  agent: [],
  team: [],
  member: [],
};
export function can(user: User | undefined, permission: string) {
  if (!user) return false;
  if (user.role === "head_admin") return true;
  if (permission === "review_documents" && user.role !== "admin") return false;
  if (permission === "approve" && !["admin", "approver"].includes(user.role))
    return false;
  const allowedRoles: Record<string, Role[]> = { approve:["admin","approver"], review_documents:["admin"], manage_agents:["admin","team"], manage_content:["admin","team"], manage_services:["admin","team"] };
  return !!allowedRoles[permission]?.includes(user.role) && JSON.parse(user.permissions).includes(permission);
}
export function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    avatar: user.avatar,
    permissions:
      user.role === "head_admin"
        ? defaultPermissions.head_admin
        : JSON.parse(user.permissions),
    active: !!user.active,
  };
}

export function seed() {
  const existing = db
    .prepare("SELECT id FROM users WHERE role='head_admin'")
    .get();
  if (!existing) {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (
      !email ||
      !password ||
      password.length < 12 ||
      password.startsWith("REPLACE_")
    )
      throw new Error(
        "Set ADMIN_EMAIL and a unique ADMIN_PASSWORD (12+ characters) in the root .env before starting.",
      );
    db.prepare(
      "INSERT INTO users(id,name,email,password_hash,role,permissions) VALUES(?,?,?,?,?,?)",
    ).run(
      id(),
      process.env.ADMIN_NAME || "Head Admin",
      email,
      hashPassword(password),
      "head_admin",
      JSON.stringify(defaultPermissions.head_admin),
    );
  }
  const settings: Record<string, string> = {
    brandName: "Beawar Estate",
    tagline: "Your city. Your next address.",
    contactEmail: "",
    contactPhone: "",
    logo: "",
    privacy:
      "We collect the details you submit to manage property listings and service requests. Property documents are private and accessible only to the submitter and authorized administrators. Approved listing details and images are public. Contact the property team to request correction or removal of your information.",
    terms:
      "Listings are provided by submitters. Confirm ownership, documents, pricing and availability independently before entering an agreement. Platform review does not constitute legal verification or a guarantee of title. Demo listings are illustrative and are not offers for sale.",
  };
  for (const [k, v] of Object.entries(settings))
    db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)").run(
      k,
      v,
    );
  if (
    process.env.SEED_DEMO !== "true" ||
    db.prepare("SELECT value FROM settings WHERE key='demo_seeded'").get()
  )
    return;
  const owner = db
    .prepare("SELECT id FROM users WHERE role='head_admin' LIMIT 1")
    .get()!.id as string;
  transaction(() => {
    const rows = [
      [
        "The Courtyard House",
        "House",
        "sale",
        8500000,
        2400,
        "Ajmer Road",
        3,
        3,
        "house-exterior.jpg",
        ["Parking", "Balcony", "Garden"],
      ],
      [
        "A little room for more",
        "Apartment",
        "sale",
        4200000,
        1450,
        "College Road",
        3,
        2,
        "apartment-interior.jpg",
        ["Parking", "Lift", "Balcony"],
      ],
      [
        "Your next beginning",
        "Plot",
        "sale",
        2800000,
        1800,
        "Sendra Road",
        0,
        0,
        "residential-neighborhood.jpg",
        ["Road access", "Corner plot"],
      ],
      [
        "Light-filled city apartment",
        "Apartment",
        "rent",
        15000,
        1100,
        "Chang Gate",
        2,
        2,
        "apartment-interior.jpg",
        ["Balcony", "Water supply"],
      ],
      [
        "A place to call your own",
        "House",
        "sale",
        6400000,
        1900,
        "Sendra Road",
        3,
        2,
        "house-exterior.jpg",
        ["Garden", "Parking"],
      ],
      [
        "Space for your next venture",
        "Commercial",
        "rent",
        25000,
        850,
        "Ajmer Road",
        0,
        1,
        "residential-neighborhood.jpg",
        ["Road access", "Parking"],
      ],
    ];
    rows.forEach((r, i) =>
      db
        .prepare(
          "INSERT INTO properties(id,owner_id,title,type,purpose,price,area,locality,bedrooms,bathrooms,images,amenities,address,description,status,is_demo,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'approved',1,?)",
        )
        .run(
          `demo-${i + 1}`,
          owner,
          r[0] as string,
          r[1] as string,
          r[2] as string,
          r[3] as number,
          r[4] as number,
          r[5] as string,
          r[6] as number,
          r[7] as number,
          JSON.stringify(["/images/" + r[8]]),
          JSON.stringify(r[9]),
          "Beawar, Rajasthan — illustrative location",
          "This is a sample listing for exploring the platform. The price, specifications and stock photograph are illustrative; this is not an actual property offered for sale or rent. Replace demo records with your own approved listings.",
          new Date(Date.now() - i * 86400000).toISOString(),
        ),
    );
    db.prepare(
      "INSERT INTO settings(key,value) VALUES('demo_seeded','true')",
    ).run();
  });
}

export const services = [
  {
    id: "survey",
    name: "Land survey & measurement",
    category: "Property essentials",
    description:
      "Request a site measurement, boundary survey or area calculation.",
    icon: "ruler",
    duration: "Schedule a site visit",
  },
  {
    id: "documents",
    name: "Document review",
    category: "Property essentials",
    description:
      "Ask the team to coordinate a property-document review with a qualified professional.",
    icon: "file",
    duration: "Scope confirmed by the team",
  },
  {
    id: "valuation",
    name: "Property valuation",
    category: "Buy & sell",
    description:
      "Request an assessment for your home, land or commercial space.",
    icon: "chart",
    duration: "Based on a property visit",
  },
  {
    id: "buy-sell",
    name: "Buying & selling assistance",
    category: "Buy & sell",
    description:
      "Get help shortlisting, visiting and discussing the right property.",
    icon: "home",
    duration: "Personal assistance",
  },
  {
    id: "rental",
    name: "Rental assistance",
    category: "Buy & sell",
    description:
      "Connect with the team for tenant search, viewings and rental coordination.",
    icon: "key",
    duration: "For owners & tenants",
  },
  {
    id: "construction",
    name: "Design & construction",
    category: "Home improvement",
    description:
      "Share your plans and request a consultation for design or renovation.",
    icon: "building",
    duration: "Consultation on request",
  },
];
