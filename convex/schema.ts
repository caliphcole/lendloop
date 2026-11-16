import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export const status = v.union(v.literal("Pending"), v.literal("Approved"), v.literal("Declined"), v.literal("Returned"));
export default defineSchema({
  tools: defineTable({ owner: v.string(), name: v.string(), category: v.string(), condition: v.string(), description: v.string(), removed: v.optional(v.boolean()) }).index("owner", ["owner"]),
  loans: defineTable({ tool: v.id("tools"), owner: v.string(), borrower: v.string(), name: v.string(), start: v.string(), end: v.string(), status, reminded: v.optional(v.boolean()) })
    .index("tool", ["tool"]).index("owner", ["owner"]).index("borrower", ["borrower"]).index("due", ["status","end"]),
  trusted: defineTable({ owner: v.string() }).index("owner", ["owner"]),
  events: defineTable({ loan: v.id("loans"), name: v.string(), status, delivered: v.boolean() }).index("delivery", ["delivered"]),
});
