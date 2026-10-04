import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import Electrobun, { BrowserWindow, Utils } from "electrobun/main";
import { startServer } from "./server-host";

const window = new BrowserWindow({title:"Review",url:"views://mainview/index.html",frame:{width:1200,height:850}});
window.webview.setNavigationRules(["^*", "views://mainview/*"]);
const profile=process.env.DEV_REVIEW_HOME??path.join(homedir(),".dev-fast/review-electrobun");
const checkout=process.env.DEV_FAST_REVIEW_CHECKOUT!;
const key=`dev-electrobun-${createHash("sha256").update(checkout??"").digest("hex").slice(0,12)}`;
const abort=new AbortController();
const server=startServer({
  profile,key,checkout,nodePath:process.env.REVIEW_ELECTROBUN_NODE!,entry:process.env.DEV_FAST_REVIEW_SERVER_ENTRY!,signal:abort.signal,
  onState:state=>console.log("Review server",state.status,state.message),
});
void server.then(({discovery})=>console.log(`Review server: ${discovery.url}; DEV_REVIEW_HOME=${profile}; DEV_REVIEW_INSTANCE=${key}`)).catch(error=>console.error(String(error)));
let quitComplete=false;
let cleanup:Promise<void>|undefined;
Electrobun.events.on("before-quit",event=>{
 if(quitComplete) return;
 event.response={allow:false};
 cleanup??=(async()=>{
   abort.abort();await server.then(host=>host.stop(),()=>{});
   quitComplete=true;Utils.quit();
 })();
});
