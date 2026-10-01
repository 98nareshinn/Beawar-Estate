import { z } from "zod";
const text = (min = 1, max = 200) => z.string().trim().min(min).max(max);
export const mobile = z
  .string()
  .trim()
  .max(20)
  .refine(
    (v) => !v || /^\+?[\d\s-]{7,20}$/.test(v),
    "Enter a valid mobile number",
  );
export const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});
export const registration = credentials.extend({
  name: text(2, 80),
  mobile,
  password: z.string().min(12).max(128),
});
export const account = registration.extend({
  role: z.enum(["admin", "approver", "agent", "team", "member"]),
  permissions: z
    .array(
      z.enum([
        "approve",
        "review_documents",
        "manage_agents",
        "manage_content",
        "manage_services",
      ]),
    )
    .max(5)
    .default([]),
});
export const propertyInput = z.object({
  title: text(5, 120),
  description: text(20, 5000),
  type: z.enum(["House", "Apartment", "Plot", "Commercial"]),
  placeType: z.enum(["Single family home", "Townhouse", "Apartment", "Bungalow", "Villa", "Plot", "Commercial space", "Other"]).default("Other"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  purpose: z.enum(["sale", "rent"]),
  price: z.number().positive().max(1e12),
  area: z.number().positive().max(1e9),
  locality: text(2, 100),
  address: text(5, 300),
  bedrooms: z.number().int().min(0).max(100),
  bathrooms: z.number().int().min(0).max(100),
  amenities: z.array(text(1, 60)).max(20).default([]),
  photoIds: z.array(z.string().uuid()).max(10).default([]),
  documentIds: z.array(z.string().uuid()).max(10).default([]),
  agentId: z.string().uuid().nullable().default(null),
  status: z.enum(["draft", "pending"]).default("pending"),
});
export const agentInput = z.object({
  name: text(2, 80),
  email: z.union([z.email(), z.literal("")]).default(""),
  mobile,
  areas: text(0, 300),
  bio: text(0, 1000),
  userId: z.string().uuid().nullable().default(null),
  active: z.boolean().default(true),
});
export const ticketInput = z.object({
  category: z.enum([
    "survey",
    "documents",
    "valuation",
    "buy-sell",
    "rental",
    "construction",
    "viewing",
    "enquiry",
  ]),
  subject: text(3, 180),
  message: text(10, 3000),
  mobile,
  propertyId: z.string().nullable().default(null),
});
export const newsInput = z.object({
  title: text(5, 160),
  category: z.enum(["City news", "Market update", "Community", "Announcement"]),
  body: text(20, 6000),
  sourceUrl: z.union([
    z.url().refine((v) => v.startsWith("https://"), "Use an HTTPS source link"),
    z.literal(""),
  ]),
  sourceName: text(0, 100),
});
