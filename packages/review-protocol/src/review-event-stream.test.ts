import { expect, test, vi } from "vitest";
import { consumeReviewEventStream } from "./review-event-stream.js";
const encoder=new TextEncoder();
function bytes(chunks:string[]) {return new ReadableStream<Uint8Array>({start(controller){for(const chunk of chunks)controller.enqueue(encoder.encode(chunk));controller.close();}});}
test("decodes split UTF8, multiline JSON and ordered events",async()=>{
 const encoded=encoder.encode('data: {"text":"π"}\r\n\r\ndata: {"n":\ndata: 2}\n\n');
 const split=encoded.indexOf(0xcf)+1;
 const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(encoded.slice(0,split));c.enqueue(encoded.slice(split));c.close();}});
 const values:unknown[]=[];
 await consumeReviewEventStream(stream,async value=>{await Promise.resolve();values.push(value);},new AbortController().signal);
 expect(values).toEqual([{text:"π"},{n:2}]);expect(stream.locked).toBe(false);
});
test("bounds unterminated event data",async()=>{
 await expect(consumeReviewEventStream(bytes(["data: "+"x".repeat(30)]),()=>{},new AbortController().signal,{maxEventCharacters:16})).rejects.toThrow(/exceeded/);
});
test("single CRLF line endings do not reset the incomplete-event budget",async()=>{
 await expect(consumeReviewEventStream(bytes(["data: [\r\n",...Array(12).fill("data: 1,\r\n"),"data: 1]\r\n"]),()=>{},new AbortController().signal,{maxEventCharacters:16})).rejects.toThrow(/exceeded/);
});
test("abort stops dispatching already queued frames",async()=>{
 const abort=new AbortController();const seen:unknown[]=[];
 await consumeReviewEventStream(bytes(['data: 1\n\ndata: 2\n\n']),value=>{seen.push(value);abort.abort();},abort.signal);
 expect(seen).toEqual([1]);
});
test("EOF never fabricates a terminator for an incomplete event",async()=>{
 const seen:unknown[]=[];
 await consumeReviewEventStream(bytes(['data: {"n":1}']),value=>{seen.push(value);},new AbortController().signal);
 expect(seen).toEqual([]);
});
test("handler/ack failures are observable and release the reader",async()=>{
 const stream=bytes(['data: {"id":"frame"}\n\n']);
 await expect(consumeReviewEventStream(stream,()=>{throw new Error("ack failed");},new AbortController().signal)).rejects.toThrow("ack failed");
 expect(stream.locked).toBe(false);
});
test("aborting cancels and unlocks an open stream",async()=>{
 const cancel=vi.fn();const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(encoder.encode('data: {"n":1}\n\n'));},cancel});
 const abort=new AbortController();await consumeReviewEventStream(stream,()=>abort.abort(),abort.signal);
 expect(cancel).toHaveBeenCalled();expect(stream.locked).toBe(false);
});
