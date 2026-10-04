import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { defaultPreferences, preferencesSchema, type ShellPreferences } from "./rpc";
export async function createPreferencesStore(file:string) {
 let value={...defaultPreferences};
 try {value=preferencesSchema.parse(JSON.parse(await readFile(file,"utf8")));}
 catch(error) {
  if(error instanceof Error && "code" in error && error.code!=="ENOENT") throw error;
  if(!(error instanceof Error && "code" in error && error.code==="ENOENT")) console.warn("Review preferences were invalid; using system theme, split layout, and Home.");
 }
 let queue=Promise.resolve(value);
 const update=(patch:Partial<ShellPreferences>)=>{
  const action=async()=>{
   const checked=preferencesSchema.partial().parse(patch);
   const next=preferencesSchema.parse({...value,...checked});
   await mkdir(path.dirname(file),{recursive:true,mode:0o700});
   await writeFile(`${file}.tmp`,JSON.stringify(next),{mode:0o600});
   await rename(`${file}.tmp`,file);value=next;return value;
  };
  return queue=queue.then(action,action);
 };
 return {get:()=>value,update,flush:()=>queue.then(()=>{})};
}
