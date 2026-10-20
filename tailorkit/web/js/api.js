let token = '';
try { token = localStorage.getItem('tk_token') || ''; } catch { /* storage blocked: stay signed in for this tab only */ }

export const getToken = () => token;
export function setToken(t) { token = t || ''; try { t ? localStorage.setItem('tk_token', t) : localStorage.removeItem('tk_token'); } catch { /* ignore */ } }

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try { res = await fetch(path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) }); }
  catch { throw new Error('Cannot reach the server. Is it running?'); }
  if (res.status === 401 && token) { setToken(''); location.hash = '#/login'; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; e.data = data; throw e; }
  return data;
}

export async function apiText(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error('Could not load preview.');
  return res.text();
}

export async function download(path, fallbackName) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Download failed.'); }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// POST that answers with server-sent events. Calls onEvent for each {type, ...} message.
export async function streamPost(path, body, onEvent, signal) {
  const res = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal });
  if (!res.ok) { const d = await res.json().catch(() => ({})); const e = new Error(d.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      if (chunk.startsWith('data: ')) { try { onEvent(JSON.parse(chunk.slice(6))); } catch { /* ignore a malformed event */ } }
    }
  }
}
