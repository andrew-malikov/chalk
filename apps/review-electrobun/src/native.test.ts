import { expect, test, vi } from "vitest";
import { mkdtemp, writeFile, readFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sourceArguments, createQuitGate, externalURL, openVSCode } from "./native";
test("VS Code receives paths as separate arguments, with original line numbers",()=>{
 const file='/tmp/a "quote"; $(touch nope).ts';
 expect(sourceArguments({kind:"file",workspacePath:"/tmp/project space",filePath:file,range:{startLine:42,endLine:44}})).toEqual(["--goto",`${file}:42:1`]);
 expect(sourceArguments({kind:"diff",workspacePath:"/tmp/w",originalPath:"/tmp/old.ts",modifiedPath:"/tmp/new.ts"})).toEqual(["--diff","/tmp/old.ts","/tmp/new.ts"]);
 expect(()=>sourceArguments({kind:"file",workspacePath:"/tmp/w",filePath:"--flag"})).toThrow();
});
test("real CLI execution preserves literal Unicode and shell characters",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),"review-code-"));const oldPath=process.env.PATH;const log=path.join(root,"args.jsonl");
 const code=path.join(root,"code");
 await writeFile(code,`#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2))+'\\n');`);await chmod(code,0o700);
 process.env.PATH=`${root}:${oldPath}`;
 try {
  await openVSCode({kind:"file",workspacePath:"/tmp/work space",filePath:'/tmp/π "quoted"; $(touch nope).ts',range:{startLine:42,endLine:43}});
  expect((await readFile(log,"utf8")).trim().split("\n").map(line=>JSON.parse(line))).toEqual([["--new-window","/tmp/work space"],["--goto",'/tmp/π "quoted"; $(touch nope).ts:42:1']]);
 } finally {process.env.PATH=oldPath;await rm(root,{recursive:true,force:true});}
});
test("missing and failing VS Code launchers report failure",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),"review-code-fail-"));const oldPath=process.env.PATH;
 process.env.PATH=root;
 try {
  const request={kind:"workspace" as const,workspacePath:"/tmp/w"};
  await expect(openVSCode(request)).rejects.toThrow(/VS Code/);
  const code=path.join(root,"code");await writeFile(code,`#!${process.execPath}\nprocess.exit(7);`);await chmod(code,0o700);
  await expect(openVSCode(request)).rejects.toThrow(/VS Code/);
 } finally {process.env.PATH=oldPath;await rm(root,{recursive:true,force:true});}
});
test("external navigation permits web/mail URLs and rejects executable schemes",()=>{
 expect(externalURL({url:"https://example.com"})).toBe("https://example.com");
 expect(externalURL({url:"mailto:person@example.com"})).toBe("mailto:person@example.com");
 expect(()=>externalURL({url:"javascript:alert(1)"})).toThrow();
 expect(()=>externalURL({url:"file:///etc/passwd"})).toThrow();
});
test("synchronous quit cancellation awaits one cleanup and permits the retry",async()=>{
 let resolve!:()=>void;const pending=new Promise<void>(r=>resolve=r);const cleanup=vi.fn(()=>pending);const retry=vi.fn();
 const gate=createQuitGate(cleanup,retry);const first:{response?:unknown}={};gate(first);gate({});
 expect(first.response).toEqual({allow:false});expect(cleanup).toHaveBeenCalledTimes(1);expect(retry).not.toHaveBeenCalled();
 resolve();await pending;await Promise.resolve();
 expect(retry).toHaveBeenCalledTimes(1);const last:{response?:unknown}={};gate(last);expect(last.response).toBeUndefined();
});
