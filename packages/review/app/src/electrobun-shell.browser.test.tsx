import { afterEach, expect, test, vi } from "vitest";
import { act } from "react";
import { mountElectrobunShell } from "../../../../apps/review-electrobun/src/shell";
import { defaultPreferences } from "../../../../apps/review-electrobun/src/rpc";
import { fixtureReviewBridge, libavoidWasmUrl } from "./fixture-review-bridge";
import type { HostState, AppRPCClient } from "../../../../apps/review-electrobun/src/rpc";
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
const summaries=[{reviewId:a,title:"Alpha",version:0,repositoryName:"demo",viewedAt:null,dismissedAt:null},{reviewId:b,title:"Beta",version:0,repositoryName:"demo",viewedAt:null,dismissedAt:null}];
const fixtures=new Map(summaries.map(summary=>[summary.reviewId,fixtureReviewBridge({snapshot:{...summary,createdAt:1,document:[{id:"paragraph",type:"markdown",markdown:summary.title+" document"}]}})]));
let mounted:ReturnType<typeof mountElectrobunShell>|undefined;let container:HTMLDivElement;let activeStreams=0;
afterEach(async()=>{await act(async()=>mounted?.dispose());container?.remove();vi.unstubAllGlobals();});
async function setup(reviewIds:string[]=[],activeReviewId:string|null=null) {
 activeStreams=0;let preferences={...defaultPreferences,reviewIds,activeReviewId};
 const rpc:AppRPCClient={request:{getState:async()=>state,setPreferences:vi.fn(async patch=>(preferences={...preferences,...patch})),openSource:vi.fn(async()=>{}),openExternal:vi.fn(async()=>{}),focusWindow:vi.fn(async()=>{})},send:{diagnostic:vi.fn()}};
 const state:Extract<HostState,{status:"ready"}>={status:"ready",discovery:{version:3,url:"http://127.0.0.1:5570",token:"test",instanceId:"test",appPid:1,serverPid:2,startedAt:1},preferences,appSessionId:"test"};
 vi.stubGlobal("fetch",async(input:string|URL,init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.pathname==="/control"||url.pathname.endsWith("/watch")){
   let ended=false;let controller:ReadableStreamDefaultController<Uint8Array>;activeStreams++;
   const end=()=>{if(ended)return;ended=true;activeStreams--;};
   const stream=new ReadableStream<Uint8Array>({start(c){controller=c;},cancel:end});
   init?.signal?.addEventListener("abort",()=>{if(!ended){controller.close();end();}},{once:true});return new Response(stream);
  }
  if(url.pathname==="/reviews-api/commands")return Response.json({ok:true});
  if(url.pathname==="/reviews-api"||url.pathname==="/reviews-api/")return Response.json(summaries);
  const id=url.pathname.split("/")[2];const fixture=fixtures.get(id??"");
  if(fixture)return fixture.request(url.href,init);
  return Response.json({error:"not found"},{status:404});
 });
 container=document.createElement("div");container.style.height="700px";document.body.append(container);
 await act(async()=>{mounted=mountElectrobunShell(container,{state,rpc,wasmUrl:libavoidWasmUrl});});
 return rpc;
}
test("opens singleton review tabs and closes to Home",async()=>{
 const rpc=await setup();await expect.poll(()=>container.textContent).toContain("Alpha");
 await act(async()=>{Array.from(container.querySelectorAll("button")).find(el=>el.textContent?.includes("Alpha"))?.click();});
 await expect.poll(()=>container.querySelectorAll('[role="tab"][aria-label="Alpha"]').length).toBe(1);
 await act(async()=>mounted?.command("home"));
 await act(async()=>{Array.from(container.querySelectorAll("button")).find(el=>el.textContent?.includes("Alpha"))?.click();});
 expect(container.querySelectorAll('[role="tab"][aria-label="Alpha"]').length).toBe(1);
 await act(async()=>mounted?.command("closeTab"));
 expect(container.querySelector('[role="tab"][aria-label="Home"]')?.getAttribute("aria-selected")).toBe("true");expect(rpc.request.setPreferences).toHaveBeenCalled();
});
test("restores only catalog-present tabs and their active selection",async()=>{
 await setup([a,"missing",b],b);await expect.poll(()=>container.querySelector('[role="tab"][aria-label="Beta"]')?.getAttribute("aria-selected")).toBe("true");
 expect(container.querySelectorAll('[role="tab"]').length).toBe(3);expect(container.textContent).not.toContain("missing");
});
test("disposing the shell cancels application and canvas streams",async()=>{
 await setup([a],a);await expect.poll(()=>activeStreams).toBeGreaterThan(0);await act(async()=>mounted?.dispose());mounted=undefined;
 await expect.poll(()=>activeStreams).toBe(0);expect(container.childElementCount).toBe(0);
});
