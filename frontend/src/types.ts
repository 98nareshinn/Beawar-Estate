import { tr, locale } from "./localization";
export type Role =
  | "head_admin"
  | "admin"
  | "approver"
  | "agent"
  | "team"
  | "member";
export interface User {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: Role;
  permissions: string[];
  avatar: string;
  active: boolean;
}
export interface AssignedAgent { id:string; name:string; avatar?:string; email:string; mobile:string }
export interface ReviewEvent { action:string; actor:string; details:string; created_at:string }
export interface Property {
  id: string;
  title: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  place_type: string;
  type: string;
  purpose: "sale" | "rent";
  price: number;
  area: number;
  locality: string;
  address: string;
  bedrooms: number;
  bathrooms: number;
  amenities: string[];
  images: string[];
  status: string;
  availability: string;
  document_review: string;
  review_note: string;
  is_demo: boolean;
  created_at: string;
  agent_id: string | null;
  agent_name?: string;
  assigned_agent?: AssignedAgent | null;
  review_history?: ReviewEvent[];
  owner_id?: string;
  documents?: { id: string; name: string; size: number }[];
}
export interface Agent {
  id: string;
  name: string;
  email?: string;
  mobile?: string;
  areas: string;
  bio: string;
  avatar: string;
  active?: boolean;
  property_count: number;
  user_id?: string;
}
export interface Service {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  duration: string;
}
export interface News {
  id: string;
  title: string;
  category: string;
  body: string;
  source_url: string;
  source_name: string;
  published_at: string;
}
export interface Ticket {
  assigned_agent?: AssignedAgent | null;
  review_history?: ReviewEvent[];
  agent_id?: string | null;
  id: string;
  subject: string;
  message: string;
  category: string;
  status: string;
  note: string;
  created_at: string;
  submitter?: string;
  user_id?: string;
}
export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  entity_type: "ticket" | "booking" | "property" | "";
  entity_id: string;
  read_at: string | null;
  created_at: string;
}
export interface ChatMessage {
  id: string;
  sender_id: string;
  sender: string;
  message: string;
  created_at: string;
  mine: boolean;
}
export interface ChatThread {
  id: string;
  type: "property" | "service";
  entity_id: string;
  subject: string;
  title: string;
  category: string;
  status: string;
  counterpart: string;
  counterpart_mobile: string;
  property_id: string | null;
  messages: ChatMessage[];
  unread: boolean;
}
export interface PublicData {
  properties: Property[];
  agents: Agent[];
  services: Service[];
  news: News[];
  settings: Record<string, string>;
  googleClientId: string;
}
export interface Workspace {
  assignedProperties: Property[];
  submissions: Property[];
  favorites: string[];
  tickets: Ticket[];
  queue: Property[];
  reviewTickets: Ticket[];
  agents: Agent[];
  users: User[];
  audit: {
    id: number;
    action: string;
    actor: string;
    details: string;
    created_at: string;
  }[];
}
export type Page =
  | "dashboard"
  | "services"
  | "properties"
  | "news"
  | "submissions"
  | "chat"
  | "approvals"
  | "agents"
  | "admin"
  | "settings";
export const roleLabel: Record<Role, string> = {
  head_admin: "Head admin",
  admin: "Admin",
  approver: "Approver",
  agent: "Agent",
  team: "Team member",
  member: "Member",
};
export const money = (n: number) =>
  n >= 10000000
    ? "₹" +
      (n / 10000000).toLocaleString(locale(), { maximumFractionDigits: 2 }) +
      " " + tr("Cr")
    : n >= 100000
      ? "₹" +
        (n / 100000).toLocaleString(locale(), { maximumFractionDigits: 2 }) +
        " " + tr("L")
      : "₹" + n.toLocaleString(locale());
export const date = (s: string) =>
  new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z").toLocaleDateString(
    locale(),
    { day: "numeric", month: "short", year: "numeric" },
  );
export const statusLabel = (s: string) =>
  tr(({
    changes_requested: "Changes requested",
    pending: "Awaiting review",
    approved: "Approved",
    rejected: "Rejected",
    draft: "Draft",
    available: "Available",
    sold: "Sold",
    rented: "Rented",
    resolved: "Resolved",
  })[s] || s);
