"use client";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { ConvexError, type GenericId } from "convex/values";
import { useState, type FormEvent } from "react";

type ToolID=GenericId<"tools">;
type LoanID=GenericId<"loans">;
type Tool={_id:ToolID;name:string;category:string;condition?:string;description?:string;mine:boolean;booked?:boolean;trusted?:boolean};
type Loan={_id:LoanID;name:string;start:string;end:string;status:string;incoming:boolean;outgoing:boolean};
type Edit={type:"listing";tool?:Tool}|{type:"request";tool:Tool}|{type:"remove";tool:Tool};
const categories=["Power tools","Garden","Kitchen","Hand tools"];
const browse=makeFunctionReference<"query",Record<string,never>,{signedIn:boolean;admin:boolean;tools:Tool[]}>("board:browse");
const loans=makeFunctionReference<"query",Record<string,never>,Loan[]>("board:loans");
const saveTool=makeFunctionReference<"mutation",{id?:ToolID;name:string;category:string;condition:string;description:string}>("board:saveTool");
const request=makeFunctionReference<"mutation",{id:ToolID;start:string;end:string}>("board:request");
const changeLoan=makeFunctionReference<"mutation",{id:LoanID;status:"Approved"|"Declined"|"Returned"}>("board:change");
const moderate=makeFunctionReference<"mutation",{id:ToolID;operation:"remove"|"trust"}>("board:moderate");
const day=()=>new Date().toISOString().slice(0,10);

export default function Home() {
  const board=useQuery(browse);
  const {isAuthenticated,isLoading}=useConvexAuth();
  const records=useQuery(loans,isAuthenticated?{}:"skip");
  const save=useMutation(saveTool), borrow=useMutation(request), change=useMutation(changeLoan), manage=useMutation(moderate);
  const [view,setView]=useState("Browse");
  const [category,setCategory]=useState("");
  const [editor,setEditor]=useState<Edit>();
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const admin=isAuthenticated && !!board?.admin;
  const tabs=admin?["Browse","My listings","My requests","Incoming requests","All loans"]:isAuthenticated?["Browse","My listings","My requests","Incoming requests"]:["Browse"];
  const current=tabs.includes(view)?view:"Browse";
  const showTools=current==="Browse" || current==="My listings";
  const tools=board?.tools.filter(tool=>(current!=="My listings"||tool.mine)&&(!category||tool.category===category));
  const visibleLoans=records?.filter(loan=>current==="All loans"||(current==="My requests"?loan.outgoing:loan.incoming));

  async function perform(action:()=>Promise<unknown>,message:string) {
    setBusy(true); setNotice("");
    try { await action(); setNotice(message); return true; }
    catch(error) {setNotice(error instanceof ConvexError ? String(error.data) : "The request failed. Try again.");return false;}
    finally {setBusy(false);}
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor||busy) return;
    const values=new FormData(event.currentTarget);
    const value=(name:string)=>String(values.get(name)??"");
    if(editor.type==="listing") {
      if(await perform(()=>save({...(editor.tool?{id:editor.tool._id}:{}),name:value("name"),category:value("category"),condition:value("condition"),description:value("description")}),"Listing saved.")) {setEditor(undefined);setView("My listings");}
    } else if(editor.type==="request") {
      if(await perform(()=>borrow({id:editor.tool._id,start:value("start"),end:value("end")}),"Request sent.")) {setEditor(undefined);setView("My requests");}
    } else if(await perform(()=>manage({id:editor.tool._id,operation:"remove"}),"Listing removed.")) setEditor(undefined);
  }
  return <>
    <header><div className="wrap top"><span className="brand">Lend<b>Loop</b></span><div className="top-actions">
      {isAuthenticated?<UserButton/>:isLoading?<span>Checking sign-in…</span>:<SignInButton mode="modal"><button>Sign in to lend or borrow</button></SignInButton>}
    </div></div></header>
    <main className="wrap">
      <section className="hero"><h1>Borrow tools from your neighbors.</h1><p>Find what you need for your next project, or lend a tool you already own.</p></section>
      <nav aria-label="Tool board">{tabs.map(tab=><button key={tab} aria-pressed={tab===current} className={tab===current?"active":""} onClick={()=>{setView(tab);setEditor(undefined);setNotice("");}}>{tab}</button>)}
        {isAuthenticated&&<button className="primary" onClick={()=>setEditor({type:"listing"})}>List a tool</button>}
      </nav>
      <div className="row"><h2>{current==="Browse"?"Available tools":current}</h2>{showTools&&<select value={category} onChange={event=>setCategory(event.target.value)} aria-label="Filter by category"><option value="">All categories</option>{categories.map(item=><option key={item}>{item}</option>)}</select>}</div>
      {editor&&isAuthenticated&&<form className="card editor" onSubmit={submit} key={editor.type+(editor.tool?editor.tool._id:"")}>
        <h3>{editor.type==="listing"?editor.tool?"Edit tool":"List a tool":editor.type==="request"?"Borrow "+editor.tool.name:"Remove "+editor.tool.name+"?"}</h3>
        {editor.type==="listing"&&<>
          <label>Tool name<input name="name" defaultValue={editor.tool?.name} maxLength={120} required/></label>
          <label>Category<select name="category" defaultValue={editor.tool?.category??categories[0]}>{categories.map(item=><option key={item}>{item}</option>)}</select></label>
          <label>Condition<input name="condition" defaultValue={editor.tool?.condition} maxLength={100} required/></label>
          <label>Short description<textarea name="description" defaultValue={editor.tool?.description} maxLength={500} required/></label>
        </>}
        {editor.type==="request"&&<><label>Start date<input type="date" name="start" min={day()} required/></label><label>Return date<input type="date" name="end" min={day()} required/></label></>}
        <div className="row"><button type="button" onClick={()=>setEditor(undefined)}>Cancel</button><button className="primary" disabled={busy}>{editor.type==="listing"?"Save listing":editor.type==="request"?"Send request":"Remove"}</button></div>
      </form>}
      <p className="notice" role="status">{notice}</p>
      <div className="grid">{showTools?tools?.length?tools.map(tool=><article className="card" key={tool._id}>
        <span className="category">{tool.category}</span><h3>{tool.name}</h3>
        {isAuthenticated&&board?.signedIn&&<><p>{tool.condition} · {tool.description}</p><span className="pill">{tool.booked?"Booked":"Available"}</span>{tool.trusted&&<span className="pill">Trusted lender</span>}
          <div className="row">
            {!tool.mine&&<button className="primary" onClick={()=>setEditor({type:"request",tool})}>Request</button>}
            {tool.mine&&<button onClick={()=>setEditor({type:"listing",tool})}>Edit</button>}
            {(tool.mine||admin)&&<button onClick={()=>setEditor({type:"remove",tool})}>Remove</button>}
            {admin&&!tool.trusted&&<button disabled={busy} onClick={()=>void perform(()=>manage({id:tool._id,operation:"trust"}),"Lender marked trusted.")}>Mark trusted</button>}
          </div></>}
      </article>):<p className="empty">{board?"No tools in this view yet.":"Loading tools…"}</p>:
      visibleLoans?.length?visibleLoans.map(loan=><article className="card" key={loan._id}>
        <span className="pill">{loan.status}</span><h3>{loan.name}</h3><p>{loan.start} to {loan.end}</p>
        <div className="row">{loan.incoming&&loan.status==="Pending"&&<>
          <button disabled={busy} className="primary" onClick={()=>void perform(()=>change({id:loan._id,status:"Approved"}),"Request approved.")}>Approve</button>
          <button disabled={busy} onClick={()=>void perform(()=>change({id:loan._id,status:"Declined"}),"Request declined.")}>Decline</button></>}
          {(loan.incoming||loan.outgoing)&&loan.status==="Approved"&&<button disabled={busy} onClick={()=>void perform(()=>change({id:loan._id,status:"Returned"}),"Tool marked returned.")}>Mark returned</button>}
        </div>
      </article>):<p className="empty">{records?"No loans in this view yet.":"Loading loans…"}</p>}</div>
    </main>
  </>;
}
