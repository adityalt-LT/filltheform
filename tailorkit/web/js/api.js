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
