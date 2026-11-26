(function (root) {
  const segmenter = new Intl.Segmenter(undefined,{granularity:'grapheme'});
  function move(text, position, motion) {
    const p = Math.max(0, Math.min(text.length, position));
    if (motion === 'Left' || motion === 'Right') {
      const segments = segmenter.segment(text);
      if (motion === 'Left') return p ? segments.containing(p - 1).index : 0;
      const part = segments.containing(p);
      return part ? part.index + part.segment.length : text.length;
    }
    const start = p ? text.lastIndexOf('\n', p - 1) + 1 : 0;
    const end = text.indexOf('\n', p);
    const lineEnd = end < 0 ? text.length : end;
    if (motion === 'Start') return start;
    if (motion === 'End') return lineEnd;
    if (motion === 'First') return 0;
    if (motion === 'Last') return text.length;
    if (motion === 'Word') {
      const tail = text.slice(p);
      const match = /^\s*\S+\s*/u.exec(tail);
      return Math.min(text.length, p + (match?.[0].length ?? 1));
    }
    if (motion === 'BackWord') {
      const match = /\S+\s*$/u.exec(text.slice(0, p));
      return match?.index ?? 0;
    }
    if (motion === 'Down') {
      if (end < 0) return p;
      const nextEnd = text.indexOf('\n', end + 1);
      return Math.min(nextEnd < 0 ? text.length : nextEnd, end + 1 + p - start);
    }
    if (motion === 'Up') {
      if (!start) return p;
      const previousStart = text.lastIndexOf('\n', start - 2) + 1;
      return Math.min(start - 1, previousStart + p - start);
    }
    return p;
  }
  function line(text, position) {
    const start = move(text, position, 'Start'), end = move(text, position, 'End');
    return [start, end < text.length ? end + 1 : end];
  }
  const api = {move,line};
  if (typeof module !== 'undefined') module.exports = api;
  else root.Motions = api;
})(globalThis);
