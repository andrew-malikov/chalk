import type { RPCSchema } from "electrobun/main";
import type { ReviewDesktopDiscovery, ReviewInlineEditorRange, ReviewDiffLayout } from "@dev.fast/review-protocol";
import { z } from "zod";

export const preferencesSchema=z.strictObject({theme:z.enum(["system","light","dark"]),diffLayout:z.enum(["split","unified"]),reviewIds:z.array(z.string().min(1)),activeReviewId:z.string().min(1).nullable()});
export type ShellPreferences=z.infer<typeof preferencesSchema>;
export const defaultPreferences:ShellPreferences={theme:"system",diffLayout:"split",reviewIds:[],activeReviewId:null};
export type HostState={status:"starting";message?:string}|{status:"ready";discovery:ReviewDesktopDiscovery;preferences:ShellPreferences;appSessionId:string}|{status:"error"|"disconnected";message:string};
export type NativeOpenRequest={kind:"workspace";workspacePath:string}|{kind:"file";workspacePath:string;filePath:string;range?:ReviewInlineEditorRange}|{kind:"diff";workspacePath:string;originalPath:string;modifiedPath:string};
export type ShellCommand="find"|"home"|"settings"|"closeTab";
export type AppRPC={
 bun:RPCSchema<{requests:{getState:{params:void;response:HostState};setPreferences:{params:Partial<ShellPreferences>;response:ShellPreferences};openSource:{params:NativeOpenRequest;response:void};openExternal:{params:{url:string};response:void};focusWindow:{params:void;response:void}};messages:{diagnostic:{level:"error"|"warning";message:string}}}>;
 webview:RPCSchema<{requests:{};messages:{hostState:HostState;command:ShellCommand}}>
};
export type DiffLayout=ReviewDiffLayout;
