import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./functions";
import { signature } from "./signing";

export const event = internalQuery({args:{id:v.id("events")},handler:(ctx,{id})=>ctx.db.get(id)});
export const send = internalAction({args:{event:v.id("events")},handler:async(ctx,{event})=>{
  const row=await ctx.runQuery(makeFunctionReference<"query">("delivery:event"),{id:event});
  if (!row || row.delivered) return;
  const url=process.env.N8N_REQUEST_WEBHOOK_URL;
  if (!url) throw new Error("N8N_REQUEST_WEBHOOK_URL is missing");
  const body=JSON.stringify({eventId:event,tool:row.name,status:row.status});
  const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({payload:body,signature:await signature(body)})});
  if (!response.ok) throw new Error("n8n rejected the notification: "+response.status);
}});
export const retry = internalMutation({args:{},handler:async ctx=>{
  const rows=await ctx.db.query("events").withIndex("delivery",q=>q.eq("delivered",false)).take(50);
  await Promise.all(rows.map(row=>ctx.scheduler.runAfter(0,makeFunctionReference<"action">("delivery:send"),{event:row._id})));
}});
export const due = internalQuery({args:{},handler:async ctx=>{
  const today=new Date().toISOString().slice(0,10);
  const rows=await ctx.db.query("loans").withIndex("due",q=>q.eq("status","Approved").lt("end",today)).collect();
  return rows.filter(row=>!row.reminded).slice(0,100).map(row=>({id:row._id, tool:row.name,end:row.end}));
}});
export const recordNotification = internalMutation({args:{id:v.id("events")},handler:async(ctx,{id})=>{
  const row=await ctx.db.get(id);
  if (!row) return false;
  if (row.delivered) return false;
  await ctx.db.patch(id,{delivered:true});
  return true;
}});
export const reminded = internalMutation({args:{id:v.id("loans")},handler:async(ctx,{id})=>{
  const row=await ctx.db.get(id);
  if (!row || row.status!=="Approved" || row.reminded || row.end>=new Date().toISOString().slice(0,10)) return false;
  await ctx.db.patch(id,{reminded:true});
  return true;
}});
