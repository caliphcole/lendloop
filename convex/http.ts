import { httpActionGeneric, httpRouter, makeFunctionReference } from "convex/server";
import { validSignature } from "./signing";

const router=httpRouter();
async function authenticatedBody(request:Request) {
  const body=await request.text();
  if (body.length>8192 || !await validSignature(body,request.headers.get("x-lendloop-signature"))) return null;
  try {
    const data=JSON.parse(body);
    return typeof data.timestamp==="number" && Math.abs(Date.now()-data.timestamp)<=300_000 ? data : null;
  } catch { return null; }
}

router.route({path:"/automation/overdue",method:"POST",handler:httpActionGeneric(async(ctx,request)=>{
  const data=await authenticatedBody(request);
  if (!data || data.operation!=="list-overdue") return new Response("Unauthorized",{status:401});
  return Response.json(await ctx.runQuery(makeFunctionReference<"query">("delivery:due"),{}));
})});
router.route({path:"/automation/reminded",method:"POST",handler:httpActionGeneric(async(ctx,request)=>{
  const data=await authenticatedBody(request);
  if (!data || data.operation!=="mark-reminded" || typeof data.id!=="string") return new Response("Unauthorized",{status:401});
  return Response.json({updated:await ctx.runMutation(makeFunctionReference<"mutation">("delivery:reminded"),{id:data.id})});
})});
router.route({path:"/automation/notified",method:"POST",handler:httpActionGeneric(async(ctx,request)=>{
  const data=await authenticatedBody(request);
  if (!data || data.operation!=="record-notification" || typeof data.id!=="string") return new Response("Unauthorized",{status:401});
  return Response.json({updated:await ctx.runMutation(makeFunctionReference<"mutation">("delivery:recordNotification"),{id:data.id})});
})});
export default router;
