import type { NativeOpenRequest } from "./rpc";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
const absolutePath=z.string().refine(path.isAbsolute,"Expected an absolute path.");
const range=z.strictObject({startLine:z.number().int().positive(),endLine:z.number().int().positive(),side:z.enum(["base","head"]).optional()});
const openSchema=z.discriminatedUnion("kind",[
 z.strictObject({kind:z.literal("workspace"),workspacePath:absolutePath}),
 z.strictObject({kind:z.literal("file"),workspacePath:absolutePath,filePath:absolutePath,range:range.optional()}),
 z.strictObject({kind:z.literal("diff"),workspacePath:absolutePath,originalPath:absolutePath,modifiedPath:absolutePath}),
]);
export function sourceArguments(input:NativeOpenRequest):string[] {
 const request=openSchema.parse(input);
 if(request.kind==="workspace") return ["--new-window",request.workspacePath];
 if(request.kind==="diff") return ["--diff",request.originalPath,request.modifiedPath];
 return ["--goto",request.range?`${request.filePath}:${request.range.startLine}:1`:request.filePath];
}
export function createQuitGate(cleanup:()=>Promise<void>,retry:()=>void) {
 let done=false;let pending:Promise<void>|undefined;
 return (event:{response?:unknown})=>{
  if(done) return;
  event.response={allow:false};
  pending??=cleanup().then(()=>{done=true;retry();});
 };
}
export function externalURL(input:unknown):string {
 const {url}=z.strictObject({url:z.string().url()}).parse(input);
 if(!["http:","https:","mailto:"].includes(new URL(url).protocol)) throw new Error("Unsupported external URL scheme.");
 return url;
}
const execute=promisify(execFile);
export async function openVSCode(request:NativeOpenRequest):Promise<void> {
 const args=sourceArguments(request);
 const env={...process.env};
 delete env.ELECTRON_RUN_AS_NODE;delete env.VSCODE_IPC_HOOK_CLI;delete env.VSCODE_PORTABLE;delete env.NODE_OPTIONS;
 const run=async(args:string[])=>{
  try {await execute("code",args,{env});}
  catch(error) {throw new Error(`Cannot open VS Code. Ensure its code command is on PATH. ${String(error)}`);}
 };
 if(request.kind!=="workspace") await run(["--new-window",request.workspacePath]);
 await run(args);
}
