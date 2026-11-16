import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { mutation, query, type ReadContext } from "./functions";

const categories = ["Power tools", "Garden", "Kitchen", "Hand tools"];
const day = () => new Date().toISOString().slice(0, 10);
const send = makeFunctionReference<"action">("delivery:send");
const fail = (message: string): never => { throw new ConvexError(message); };
async function identity(ctx: ReadContext) {
  const user = await ctx.auth.getUserIdentity();
  return user && { id: user.subject, admin: (process.env.LENDLOOP_ADMIN_SUBJECTS ?? "").split(",").map(id => id.trim()).includes(user.subject) };
}
async function requireUser(ctx: ReadContext) {
  return await identity(ctx) ?? fail("Sign in to continue.");
}
function validDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export const browse = query({ args: {}, handler: async ctx => {
  const user = await identity(ctx);
  const tools = (await ctx.db.query("tools").collect()).filter(tool => !tool.removed);
  const approved = await ctx.db.query("loans").withIndex("due", q => q.eq("status","Approved").gte("end",day())).collect();
  const booked = new Set(approved.map(loan => loan.tool));
  if (!user) return { signedIn: false, admin: false, tools: tools.filter(tool => !booked.has(tool._id)).map(({_id,name,category}) => ({_id,name,category,mine:false})) };
  const trusted = new Set((await ctx.db.query("trusted").collect()).map(lender => lender.owner));
  return { signedIn: true, admin: user.admin, tools: tools.map(({_id,name,category,condition,description,owner}) => ({
    _id,name,category,condition,description,mine:owner===user.id,booked:booked.has(_id),trusted:trusted.has(owner)
  })) };
}});
export const loans = query({ args: {}, handler: async ctx => {
  const user = await identity(ctx);
  if (!user) return [];
  const entries = user.admin ? await ctx.db.query("loans").collect() : [
    ...await ctx.db.query("loans").withIndex("owner",q=>q.eq("owner",user.id)).collect(),
    ...await ctx.db.query("loans").withIndex("borrower",q=>q.eq("borrower",user.id)).collect(),
  ];
  return entries.map(({_id,name,start,end,status,owner,borrower})=>({_id,name,start,end,status,incoming:owner===user.id,outgoing:borrower===user.id}));
}});
export const saveTool = mutation({ args: { id:v.optional(v.id("tools")), name:v.string(), category:v.string(), condition:v.string(), description:v.string() }, handler: async(ctx,{id, ...data})=>{
  const user = await requireUser(ctx);
  const fields={name:data.name.trim(),category:data.category,condition:data.condition.trim(),description:data.description.trim()};
  if (!categories.includes(fields.category) || Object.values(fields).some(value=>!value || value.length>500)) fail("Check the listing fields.");
  if (!id) return await ctx.db.insert("tools",{...fields,owner:user.id});
  const tool=await ctx.db.get(id);
  if (!tool || tool.removed || tool.owner!==user.id) fail("You can edit only your own listings.");
  await ctx.db.patch(id,fields);
}});
export const moderate = mutation({args:{id:v.id("tools"),operation:v.union(v.literal("remove"),v.literal("trust"))},handler:async(ctx,{id,operation})=>{
  const user=await requireUser(ctx);
  const tool=await ctx.db.get(id);
  if (!tool || tool.removed) return fail("Listing unavailable.");
  if (operation==="trust") {
    if (!user.admin) return fail("Administrator access required.");
    const existing=await ctx.db.query("trusted").withIndex("owner",q=>q.eq("owner",tool.owner)).unique();
    if (!existing) await ctx.db.insert("trusted",{owner:tool.owner});
    return;
  }
  if (!user.admin && tool.owner!==user.id) fail("You can remove only your own listings.");
  if (!user.admin && (await ctx.db.query("loans").withIndex("tool",q=>q.eq("tool",id)).collect()).some(loan=>loan.status==="Pending" || loan.status==="Approved")) fail("Resolve open loans before removing this tool.");
  await ctx.db.patch(id,{removed:true});
}});
export const request = mutation({args:{id:v.id("tools"),start:v.string(),end:v.string()},handler:async(ctx,{id,start,end})=>{
  const user=await requireUser(ctx);
  const tool=await ctx.db.get(id);
  if (!tool || tool.removed || tool.owner===user.id) return fail("This listing cannot be requested.");
  if (!validDay(start)||!validDay(end)||start<day()||end<start) fail("Choose a valid date range.");
  const existing=await ctx.db.query("loans").withIndex("tool",q=>q.eq("tool",id)).collect();
  if (existing.some(loan=>loan.status==="Approved"&&loan.start<=end&&loan.end>=start)) fail("The tool is booked for those dates.");
  if (existing.some(loan=>loan.borrower===user.id&&loan.status==="Pending"&&loan.start===start&&loan.end===end)) fail("You already requested those dates.");
  const loan=await ctx.db.insert("loans",{tool:id,name:tool.name,owner:tool.owner,borrower:user.id,start,end,status:"Pending"});
  const event=await ctx.db.insert("events",{loan,name:tool.name,status:"Pending",delivered:false});
  await ctx.scheduler.runAfter(0,send,{event});
}});
export const change = mutation({args:{id:v.id("loans"),status:v.union(v.literal("Approved"),v.literal("Declined"),v.literal("Returned"))},handler:async(ctx,{id,status})=>{
  const user=await requireUser(ctx);
  const loan=await ctx.db.get(id);
  if (!loan) return fail("Loan unavailable.");
  const allowed=status==="Returned" ? loan.status==="Approved" && (loan.owner===user.id || loan.borrower===user.id) : loan.status==="Pending" && loan.owner===user.id;
  if (!allowed) fail("You cannot make that change.");
  if (status==="Approved") {
    const tool=await ctx.db.get(loan.tool);
    if (!tool || tool.removed) fail("This listing was removed.");
    const existing=await ctx.db.query("loans").withIndex("tool",q=>q.eq("tool",loan.tool)).collect();
    if (existing.some(other=>other.status==="Approved"&&other.start<=loan.end&&other.end>=loan.start)) fail("An approved loan overlaps those dates.");
  }
  await ctx.db.patch(id,{status});
  const event=await ctx.db.insert("events",{loan:id,name:loan.name,status,delivered:false});
  await ctx.scheduler.runAfter(0,send,{event});
}});
