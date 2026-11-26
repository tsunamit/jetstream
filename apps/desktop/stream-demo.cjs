async function demoFetch(url, {signal}) {
  const {setTimeout:delay} = require('node:timers/promises');
  const id = new URL(url).pathname.split('/').at(-2);
  const encode = new TextEncoder();
  const body = new ReadableStream({async start(controller) {
    const emit = (event,data,cursor) => controller.enqueue(encode.encode((cursor ? 'id: '+cursor+'\n' : '')+'event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n'));
    try {
      emit('status',{threadId:id,status:'working'}); emit('run',{phase:'start'}); emit('turn',{phase:'start'});
      const text = 'This is a local streaming fixture, not API activity.\n\n```mermaid\nflowchart LR\n  Input --> Stream --> Reply\n```\n\nThe committed reply safely renders the diagram.';
      for (const fragment of text.match(/.{1,12}|\n/g)) {await delay(120,undefined,{signal});emit('assistant',{callId:'demo-delivery',text:fragment});}
      emit('turn',{phase:'end',outcome:'settled'});
      emit('transcript',{id:'demo-stream-committed',source:'assistant',callId:'demo-delivery',text,createdAt:new Date().toISOString()},'01DEMO00000000000000000000');
      emit('run',{phase:'end'});emit('status',{threadId:id,status:'idle'});
      while (!signal.aborted) {await delay(15000,undefined,{signal});emit('heartbeat',{});}
    } catch {} finally {try {controller.close();} catch {}}
  }});
  return new Response(body,{headers:{'Content-Type':'text/event-stream'}});
}
module.exports = {demoFetch};
