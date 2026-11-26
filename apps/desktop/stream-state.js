(function(root) {
  class Record {
    constructor() { this.committed = new Map(); this.delivered = new Set(); this.live = new Map(); this.turn = new Set(); this.settled = new Set(); this.overflow = false; this.bytes=0;this.historyLimited=false;this.cursors=new Map();this.partial=new Set();this.boundary=null; }
    accept(frame) {
      const {event,data:d} = frame;
      if(event==='boundary'){this.boundary=d.messageId;return true;}
      if (event === 'transcript') {
        const bytes=new TextEncoder().encode(JSON.stringify(d)).byteLength, prior=this.committed.get(d.id);
        const total=this.bytes+bytes-(prior?new TextEncoder().encode(JSON.stringify(prior)).byteLength:0);
        if(total>6000000 || !prior && this.committed.size>=3000) {this.historyLimited=true;return false;}
        this.bytes=total;
        this.committed.set(d.id,d);
        if(d.partial)this.partial.add(d.id);
        if(frame.id)this.cursors.set(d.id,frame.id);
        const call = d.source === 'assistant' ? d.callId : d.source === 'tool' ? d.id : null;
        if(call&&this.live.has(call)&&!d.partial)this.delivered.add(d.id);
        if (call) {this.live.delete(call);this.settled.add(call);if(this.settled.size>6000)this.settled.delete(this.settled.values().next().value);}
        return true;
      }
      if (event === 'assistant' || event === 'tool_call') {
        if (this.settled.has(d.callId)) return false;
        if(d.limited) {this.live.delete(d.callId);this.settled.add(d.callId);this.overflow=true;return true;}
        const prior = this.live.get(d.callId);
        if (this.live.size >= 8 && !prior) {this.overflow = true;return false;}
        const text = event === 'assistant' ? (prior?.text || '') + d.text : d.text;
        if (text.length > 200000) {this.live.delete(d.callId);this.settled.add(d.callId);this.overflow = true;return true;}
        this.live.set(d.callId,{id:'preview-' + d.callId,callId:d.callId,source:event === 'assistant' ? 'assistant' : 'tool',text});
        this.turn.add(d.callId);return true;
      }
      if (event === 'turn' && d.phase === 'start') this.turn.clear();
      if (event === 'turn' && ['aborted','dropped'].includes(d.outcome)) {for (const id of this.turn) this.live.delete(id);this.turn.clear();return true;}
      if(event==='run'&&d.phase==='start')this.overflow=false;
      if (event === 'reset' || event === 'done' || event === 'run' && d.phase === 'end' || event === 'connection' && ['access','offline','unavailable','reconnecting','limited'].includes(d.state)) {this.live.clear();this.turn.clear();return true;}
      return false;
    }
    visible(items) {
      const result=[...this.merge(items)],ids=new Set(result.map(item=>item.id));
      for(const id of this.delivered)if(!ids.has(id))result.push({...this.committed.get(id),liveDelivery:true});
      return result;
    }
    unplaced(items) {const ids=new Set(this.merge(items).map(item=>item.id));return [...this.committed.keys()].some(id=>!ids.has(id));}
    merge(items) {
      const ids = new Map(items.map((i,index)=>[i.id,index]));
      for (const item of items) {
        this.partial.delete(item.id);
        const call = item.source === 'assistant' ? item.callId : item.source === 'tool' ? item.id : null;
        if (call) {this.live.delete(call);this.settled.add(call);}
      }
      while(this.settled.size>6000)this.settled.delete(this.settled.values().next().value);
      const result=[];let position=0,pending=[];
      const stream=[...this.committed.values()];
      if(!stream.some(i=>ids.has(i.id)) && items.length) {
        const boundary=ids.get(this.boundary);
        if(boundary!==undefined)return [...items.slice(0,boundary+1),...stream,...items.slice(boundary+1)];
        return items;
      }
      for(const item of stream) {
        const index=ids.get(item.id);
        if(index===undefined){pending.push(item);continue;}
        if(index<position)continue;
        result.push(...items.slice(position,index),...pending,item.partial?items[index]:item);pending=[];position=index+1;
      }
      result.push(...items.slice(position),...pending);
      return result;
    }
  }
  if (typeof module !== 'undefined') module.exports = {Record}; else root.StreamRecord = Record;
})(globalThis);
