import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const DAY = 24 * 3600 * 1000;
const sha = (s) => createHash('sha256').update(s).digest('hex');

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}

export function verifyPassword(password, salt, hash) {
  const a = Buffer.from(scryptSync(password, salt, 64).toString('hex'));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha(token), userId, Date.now() + 30 * DAY);
  return token;
}

export function userFromToken(db, token) {
  if (!token) return null;
  const row = db.prepare('SELECT u.id, u.email, u.plan, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').get(sha(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token)); return null; }
  return { id: row.id, email: row.email, plan: row.plan };
}

export const destroySession = (db, token) => db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));

// Small in-memory limiter for login/signup. Fine for one process; use a shared store when scaling out.
export function rateLimiter({ max = 10, windowMs = 60_000 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
    arr.push(now); hits.set(key, arr);
    next();
  };
}
