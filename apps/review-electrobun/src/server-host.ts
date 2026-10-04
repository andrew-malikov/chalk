import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { ReviewDesktopDiscoverySchema, type ReviewDesktopDiscovery } from "@dev.fast/review-protocol";

export interface ServerOptions {
  nodePath: string;
  entry: string;
  checkout: string;
  profile: string;
  key: string;
  env?: NodeJS.ProcessEnv;
  startupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  signal?: AbortSignal;
  appSessionId?: string;
  onState?(state:{status:"starting"|"error"|"disconnected";message:string}):void;
}

export async function startServer(options: ServerOptions):Promise<{discovery:ReviewDesktopDiscovery;stop():Promise<void>}> {
  if(options.signal?.aborted) throw new Error("Review server startup cancelled.");
  const discoveryFile=path.join(options.profile,"review-desktop/instances",`${options.key}.json`);
  async function readRecord() {
    try { return ReviewDesktopDiscoverySchema.parse(JSON.parse(await readFile(discoveryFile,"utf8"))); }
    catch(error) { if(error instanceof Error && "code" in error && error.code==="ENOENT") return null; throw error; }
  }
  await mkdir(options.profile,{recursive:true,mode:0o700});
  const previous=await readRecord();
  if(previous) {
    let occupied=false;
    try {
      const response=await fetch(`${previous.url}/health`,{headers:{"x-review-token":previous.token},redirect:"error",signal:AbortSignal.timeout(1500)});
      const health=await response.json();
      occupied=response.ok && health.ok===true && health.instanceId===previous.instanceId && health.serverPid===previous.serverPid;
    } catch { /* A stale discovery record does not occupy the profile. */ }
    if(occupied) throw new Error("Review is already running with this profile and instance key.");
  }
  const token=randomBytes(32).toString("hex");
  const instanceId=randomUUID();
  if(options.signal?.aborted) throw new Error("Review server startup cancelled.");
  const child=spawn(options.nodePath,[options.entry],{
    stdio:["ignore","pipe","pipe"],
    env:{...process.env,...options.env,
      DEV_REVIEW_HOME:options.profile,
      DEV_FAST_REVIEW_CHECKOUT:options.checkout,
      DEV_FAST_REVIEW_INSTANCE_KEY:options.key,
      DEV_FAST_REVIEW_SERVER_PORT:"0",DEV_FAST_REVIEW_APP_PID:String(process.pid),
      DEV_FAST_REVIEW_SERVER_TOKEN:token,DEV_FAST_REVIEW_INSTANCE_ID:instanceId,
      DEV_FAST_REVIEW_DESKTOP_HOST_AUTOSTART:"1",DEV_FAST_REVIEW_TELEMETRY_DISABLED:"1",
      DEV_FAST_REVIEW_CLI_RUNTIME:options.nodePath,DEV_FAST_REVIEW_RELEASE_CHANNEL:"dev",
      DEV_FAST_REVIEW_APP_SESSION_ID:options.appSessionId??randomUUID(),DEV_FAST_REVIEW_APP_VERSION:"0.2.0",
    },
  });
  let stopping=false;
  let ready=false;
  let stderr="";
  const exited=new Promise<void>(resolve=>child.once("close",()=>resolve()));
  let stopPromise:Promise<void>|undefined;
  function stop() {
    stopping=true;
    return stopPromise??=(async()=>{
      if(child.exitCode===null && child.signalCode===null) {
        child.kill("SIGTERM");
        const timer=setTimeout(()=>child.kill("SIGKILL"),options.shutdownTimeoutMs??5000);
        await exited;clearTimeout(timer);
      }
      const record=await readRecord();
      if(record?.instanceId===instanceId) await rm(discoveryFile,{force:true});
    })();
  }
  let abortListener:(()=>void)|undefined;
  try {
    const discovery=await new Promise<ReviewDesktopDiscovery>((resolve,reject)=>{
      let pending="";
      const timer=setTimeout(()=>reject(new Error("Review server startup timed out.")),options.startupTimeoutMs??120000);
      function fail(error:Error) { clearTimeout(timer);reject(error); }
      abortListener=()=>fail(new Error("Review server startup cancelled."));
      options.signal?.addEventListener("abort",abortListener,{once:true});
      child.once("error",error=>fail(new Error(`Cannot start Node sidecar: ${error.message}`)));
      child.once("exit",(code,signal)=>{
        const message=`Review server exited (${signal??code}). ${stderr}`.trim();
        if(!ready) fail(new Error(message));
        else if(!stopping) options.onState?.({status:"disconnected",message});
      });
      child.stderr!.on("data",chunk=>{stderr=(stderr+String(chunk)).slice(-8000);});
      child.stdout!.on("data",chunk=>{
        if(ready) return;
        pending+=String(chunk);
        if(pending.length>1024*1024) {fail(new Error("Review startup output exceeded its limit."));return;}
        let end:number;
        while((end=pending.indexOf("\n"))!==-1) {
          const line=pending.slice(0,end);pending=pending.slice(end+1);
          if(!line.trim()) continue;
          try {
            const value=JSON.parse(line);
            if(value.event==="migration" && typeof value.message==="string") options.onState?.({status:"starting",message:value.message});
            else if(value.event==="ready") {
              const result=ReviewDesktopDiscoverySchema.parse(value);
              if(result.token!==token || result.instanceId!==instanceId || result.serverPid!==child.pid || result.appPid!==process.pid || result.key!==options.key) throw new Error("Ready identity mismatch.");
              ready=true;clearTimeout(timer);resolve(result);return;
            }
          } catch {fail(new Error("Invalid Review server ready/startup payload."));return;}
        }
      });
    });
    return {discovery,stop};
  } catch(error) {
    await stop();
    options.onState?.({status:"error",message:error instanceof Error?error.message:String(error)});
    throw error;
  } finally {
    if(abortListener) options.signal?.removeEventListener("abort",abortListener);
  }
}
