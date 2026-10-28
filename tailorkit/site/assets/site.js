// Waitlist form (progressive: the page works without JavaScript, the form just does nothing).
for (const form of document.querySelectorAll('form.waitlist')) {
  const msg = form.querySelector('.msg'); const btn = form.querySelector('button');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.querySelector('input[type=email]').value.trim();
    msg.className = 'msg'; msg.textContent = '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.className = 'msg err'; msg.textContent = 'Enter a valid email address.'; return; }
    const endpoint = form.dataset.endpoint;
    if (!endpoint) { msg.className = 'msg ok'; msg.textContent = 'Preview only: no waitlist is connected to this copy of the site, so nothing was saved.'; return; }
    btn.disabled = true;
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, source: form.dataset.source || '', website: form.querySelector('[name=website]')?.value || '' }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Something went wrong. Please try again.');
      msg.className = 'msg ok'; msg.textContent = 'You are on the list. We will email you when it opens.'; form.reset();
    } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; } finally { btn.disabled = false; }
  });
}
