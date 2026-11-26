const base = 'https://api.capy.ai/api/v1/';

function api(key, fetcher = fetch, signal) {
  async function request(path, query = {}, body, method = body ? 'POST' : 'GET') {
    if (!key) throw new Error('Connect an API key first.');
    const url = new URL(path, base);
    for (const [name, value] of Object.entries(query)) {
      if (value != null) url.searchParams.set(name, value);
    }
    const headers = { Authorization: 'Bearer ' + key };
    if (body) headers['Content-Type'] = 'application/json';
    signal?.throwIfAborted();
    const response = await fetcher(url, {
      method, headers, redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), body: body && JSON.stringify(body)
    });
    if (!response.ok) {
      if(body && path.endsWith('/message') && response.status===400){
        const error=await response.json().catch(()=>({}));
        if(error._tag==='ModelSelection.Rejected')throw Error('Selected model was rejected. Reload models and choose again. Your draft and next-message choice are preserved.');
      }
      if (response.status === 429 && !body) {
        const seconds = Number(response.headers.get('retry-after'));
        throw Object.assign(Error('Capy API rate limited. Retry after ' + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) : 5) + ' seconds.'),{code:'rate-limited'});
      }
      if(body && path==='threads') {
        const error=await response.json().catch(()=>({}));
        const reasons={'ModelSelection.Rejected':'Selected model is unavailable. Refresh models or choose the account default.','capy/ProjectNotFound':'Project is no longer available.','capy/PaidFeatureUnavailable':'This choice requires a paid feature.','capy/RateLimited':'Rate limited. Wait before retrying with the same request ID.','capy/InvalidRequest':'The server rejected these options. Review project, model and cloud size.','capy/Forbidden':'Your API principal cannot create this thread.','capy/CrewRefused':'Captain access refused.'};
        if(reasons[error._tag]) throw Error(reasons[error._tag]);
      }
      throw Object.assign(new Error('Capy API returned HTTP ' + response.status + '.'),{code:response.status===401?'unauthorized':response.status===403?'forbidden':response.status===429?'rate-limited':'provider'});
    }
    return response.json();
  }
  function messages(id) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid thread ID.');
    return 'threads/' + id;
  }
  return {
    projects: () => request('projects'),
    captains: cursor => request('captains', {limit:30, cursor}),
    captain: id => request('captains/' + messages(id).slice(8)),
    models: () => request('models'),
    create: body => request('threads', {}, body),
    threads: (projectId, cursor) => request('threads', { projectId, cursor, limit: 30 }),
    thread: id => request(messages(id)),
    receipt: (id, action, eventId) => {
      if (!['read','unread'].includes(action) || action === 'read' && (typeof eventId !== 'string' || !/^[A-Za-z0-9]{26}$/.test(eventId))) throw Error('Invalid read receipt.');
      return request(messages(id) + '/' + action, {}, action === 'read' ? {eventId} : undefined, 'PUT');
    },
    messages: (id, page) => {
      const query=typeof page==='string'?{before:page}:page??{};
      if(query.before&&query.after)throw Error('Choose one transcript direction.');
      return request(messages(id) + '/messages', { before:query.before, after:query.after, limit:30 });
    },
    attachment: (id, fileId) => {
      if (typeof fileId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(fileId)) throw new Error('Invalid file ID.');
      return request(messages(id) + '/attachments/' + fileId + '/download');
    },
    send: (id, text, clientKey, model) => request(messages(id) + '/message', {}, { text, delivery: 'queue', clientKey, ...(model?{model}:{}) })
  };
}
module.exports = { api };
