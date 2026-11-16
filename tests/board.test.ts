import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";
import schema from "../convex/schema";
import { signature } from "../convex/signing";

const api = {
  browse: makeFunctionReference<"query">("board:browse"),
  loans: makeFunctionReference<"query">("board:loans"),
  save: makeFunctionReference<"mutation">("board:saveTool"),
  request: makeFunctionReference<"mutation">("board:request"),
  change: makeFunctionReference<"mutation">("board:change"),
};
const day = "2099-01-10";
const listing = {name:"Drill",category:"Power tools",condition:"Good",description:"Includes bits"};
const modules = import.meta.glob("../convex/**/*.ts");
modules["../convex/_generated/server.js"] = async () => ({});

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

test("public listing data is limited and other users cannot edit or approve", async () => {
  vi.useFakeTimers();
  const app=convexTest(schema,modules);
  const owner=app.withIdentity({subject:"owner"});
  const borrower=app.withIdentity({subject:"borrower"});
  const other=app.withIdentity({subject:"other"});
  const id=await owner.mutation(api.save,listing);
  expect((await app.query(api.browse,{})).tools[0]).toEqual({_id:id,name:"Drill",category:"Power tools",mine:false});
  await expect(other.mutation(api.save,{id,...listing,name:"Unauthorized"})).rejects.toThrow("own listings");
  await borrower.mutation(api.request,{id,start:day,end:day});
  const [loan]=await borrower.query(api.loans,{});
  expect(await other.query(api.loans,{})).toEqual([]);
  await expect(borrower.mutation(api.change,{id:loan._id,status:"Approved"})).rejects.toThrow("cannot make");
  await owner.mutation(api.change,{id:loan._id,status:"Approved"});
  expect((await app.query(api.browse,{})).tools).toEqual([]);
  await borrower.mutation(api.change,{id:loan._id,status:"Returned"});
  expect((await borrower.query(api.loans,{}))[0].status).toBe("Returned");
});

test("only one overlapping request can be approved", async ()=>{
  vi.useFakeTimers();
  const app=convexTest(schema,modules);
  const owner=app.withIdentity({subject:"owner"});
  const listingId=await owner.mutation(api.save,listing);
  for(const subject of ["first","second"]) await app.withIdentity({subject}).mutation(api.request,{id:listingId,start:day,end:day});
  const [first,second]=await owner.query(api.loans,{});
  await owner.mutation(api.change,{id:first._id,status:"Approved"});
  await expect(owner.mutation(api.change,{id:second._id,status:"Approved"})).rejects.toThrow("overlaps");
});

test("n8n callbacks require a signature and a reminder can only be recorded once",async ()=>{
  vi.useFakeTimers();
  vi.stubEnv("LENDLOOP_WEBHOOK_SECRET","development-test-secret");
  const app=convexTest(schema,modules);
  const id=await app.run(async ctx=>{
    const tool=await ctx.db.insert("tools",{...listing,owner:"owner"});
    return ctx.db.insert("loans",{tool,name:"Drill",owner:"owner",borrower:"borrower",start:"2020-01-01",end:"2020-01-02",status:"Approved"});
  });
  const fetch=(body:string,header:string)=>app.fetch("/automation/reminded",{method:"POST",body,headers:{"x-lendloop-signature":header}});
  const body=JSON.stringify({operation:"mark-reminded",timestamp:Date.now(),id});
  expect((await fetch(body,"0".repeat(64))).status).toBe(401);
  const signed=await signature(body);
  expect(await (await fetch(body,signed)).json()).toEqual({updated:true});
  expect(await (await fetch(body,signed)).json()).toEqual({updated:false});
});
