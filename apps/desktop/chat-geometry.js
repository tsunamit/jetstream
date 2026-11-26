(function(root) {
  const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
  const center = rect => (rect.top+rect.bottom)/2;
  const sameRow = (a,b) => Math.abs(center(a)-center(b))<Math.min(a.bottom-a.top,b.bottom-b.top)/2;
  function boundary(length,position,direction,predicate) {
    let inside=position, distance=1, outside;
    for(;;) {
      const probe=Math.max(0,Math.min(length-1,position+direction*distance));
      if(!predicate(probe)){outside=probe;break;}
      inside=probe;
      if(probe===0||probe===length-1)return {inside,outside:null};
      distance*=2;
    }
    while(Math.abs(outside-inside)>1) {
      const mid=Math.floor((inside+outside)/2);
      if(predicate(mid))inside=mid;else outside=mid;
    }
    return {inside,outside};
  }
  function adjacent(length,position,direction,rect) {
    if(!length)return null;
    const current=rect(position);
    if(!current)return null;
    const edge=boundary(length,position,direction,p=>sameRow(current,rect(p)));
    if(edge.outside===null)return null;
    const target=rect(edge.outside);
    return {from:boundary(length,edge.outside,-1,p=>sameRow(target,rect(p))).inside,
      to:boundary(length,edge.outside,1,p=>sameRow(target,rect(p))).inside,rect:target};
  }
  class Controller {
    constructor(host) {this.host=host;this.segments=new WeakMap();this.reset();}
    reset() {this.x=null;this.position=null;}
    move(projection,position,direction) {
      const {pieces}=projection;
      if(!pieces.length)return position;
      const length=pieces.at(-1).end;
      const pieceAt=p=>{
        let low=0,high=pieces.length-1;
        while(low<high){const mid=(low+high)>>1;if(pieces[mid].end<=p)low=mid+1;else high=mid;}
        return pieces[low];
      };
      const cache=new Map();
      const rectAt=p=>{
        p=Math.max(0,Math.min(length-1,p));
        if(cache.has(p))return cache.get(p);
        const piece=pieceAt(p);
        let offset=Math.max(0,p-piece.start),rect;
        if(piece.object)rect=piece.node.getBoundingClientRect();
        else {
          const text=piece.node.textContent;
          let record=this.segments.get(piece.node);
          if(record?.text!==text){record={text,segments:segmenter.segment(text)};this.segments.set(piece.node,record);}
          const grapheme=record.segments.containing(offset);offset=grapheme.index;
          const range=document.createRange();range.setStart(piece.node,offset);range.setEnd(piece.node,offset+grapheme.segment.length);
          rect=range.getClientRects()[0]??range.getBoundingClientRect();
        }
        const value={top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,position:piece.start+offset};
        cache.set(p,value);return value;
      };
      const current=rectAt(position);
      if(this.position!==position||this.x===null)this.x=(current.left+current.right)/2;
      const row=adjacent(length,position,direction,rectAt);
      if(!row)return position;
      let target=row.rect;
      const bounds=this.host.getBoundingClientRect();
      if(target.top<bounds.top||target.bottom>bounds.bottom) {
        this.host.scrollTop+=target.top-bounds.top-bounds.height/3;
        cache.clear();target=rectAt(row.from);
      }
      let best=rectAt(row.from),distance=Math.abs((best.left+best.right)/2-this.x);
      const choose=p=>{
        if(p<row.from||p>row.to)return;
        const rect=rectAt(p);
        if(!sameRow(rect,target))return;
        const next=Math.abs((rect.left+rect.right)/2-this.x);
        if(next<distance){best=rect;distance=next;}
      };
      let low=row.from,high=row.to;
      while(low<high){const mid=(low+high)>>1;const rect=rectAt(mid);choose(mid);if((rect.left+rect.right)/2<this.x)low=mid+1;else high=mid;}
      choose(low);choose(low-1);choose(row.to);
      for(let index=pieces.indexOf(pieceAt(row.from));index<pieces.length&&pieces[index].start<=row.to;index++) {
        const piece=pieces[index];
        if(piece.object){choose(piece.start);continue;}
        const from=Math.max(row.from,piece.start),to=Math.min(row.to+1,piece.end);
        const range=document.createRange();range.setStart(piece.node,from-piece.start);range.setEnd(piece.node,to-piece.start);
        for(const rect of range.getClientRects()) {
          if(!sameRow(rect,target))continue;
          const x=Math.max(rect.left+0.1,Math.min(rect.right-0.1,this.x));
          const caret=document.caretPositionFromPoint(x,(rect.top+rect.bottom)/2);
          if(caret?.offsetNode!==piece.node)continue;
          const p=piece.start+caret.offset;choose(p);choose(p-1);
        }
      }
      this.position=best.position;
      return best.position;
    }
  }
  const api={adjacent,Controller};
  if(typeof module!=='undefined')module.exports=api;else root.ChatGeometry=api;
})(globalThis);
