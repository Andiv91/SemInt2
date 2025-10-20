require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 5173;
const sessionCookieName = 'sess';
const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-change-me';

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files
app.use(express.static(path.join(__dirname)));

// --- Minimal JSON file DB ---
const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'db.json');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({ users: [] }, null, 2));

function readDb(){
  try { return JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch { return { users: [] }; }
}
function writeDb(db){ fs.writeFileSync(dbFile, JSON.stringify(db, null, 2)); }

function hashPassword(password, salt){
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return { salt: s, hash };
}
function verifyPassword(password, salt, hash){
  const { hash: test } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}

function signSession(payload){
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifySession(token){
  const [body, sig] = String(token||'').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', sessionSecret).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
}

// Session info
app.get('/api/me', (req, res) => {
  const sess = req.cookies?.[sessionCookieName];
  const data = verifySession(sess);
  if (!data) return res.json({ authenticated: false });
  return res.json({ authenticated: true, email: data.email, username: data.username, userId: data.userId });
});

// Register
app.post('/api/register', (req, res) => {
  const { email, username, password } = req.body || {};
  if (!email || !username || !password) return res.status(400).json({ error: 'missing_fields' });
  const db = readDb();
  if (db.users.find(u => u.email.toLowerCase() === String(email).toLowerCase())){
    return res.status(409).json({ error: 'email_exists' });
  }
  const { salt, hash } = hashPassword(password);
  const user = { id: crypto.randomUUID(), email, username, passwordHash: hash, salt };
  db.users.push(user);
  writeDb(db);
  const token = signSession({ userId: user.id, email: user.email, username: user.username, t: Date.now() });
  res.cookie(sessionCookieName, token, { httpOnly:true, sameSite:'lax', secure:false, maxAge:1000*60*60*8 });
  res.json({ ok:true, email:user.email, username:user.username });
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing_fields' });
  const db = readDb();
  const user = db.users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || !verifyPassword(password, user.salt, user.passwordHash)){
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  const token = signSession({ userId: user.id, email: user.email, username: user.username, t: Date.now() });
  res.cookie(sessionCookieName, token, { httpOnly:true, sameSite:'lax', secure:false, maxAge:1000*60*60*8 });
  res.json({ ok:true, email:user.email, username:user.username });
});

// Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie(sessionCookieName);
  res.json({ ok: true });
});

// Middleware to require session
function requireSession(req, res, next){
  const sess = req.cookies?.[sessionCookieName];
  const data = verifySession(sess);
  if (!data) return res.status(401).json({ error: 'unauthenticated' });
  req.user = data;
  return next();
}

// Protected example: include company
app.post('/api/companies', requireSession, (req, res) => {
  const { companyName, contactName, phone } = req.body || {};
  if (!companyName) return res.status(400).json({ error: 'missing_company_name' });
  // For now, just echo back; later persist to DB
  res.json({ ok: true, by: req.user.email, companyName, contactName, phone });
});

// Profile update
app.put('/api/profile', requireSession, (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'missing_username' });
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'not_found' });
  user.username = username;
  writeDb(db);
  const token = signSession({ userId: user.id, email: user.email, username: user.username, t: Date.now() });
  res.cookie(sessionCookieName, token, { httpOnly:true, sameSite:'lax', secure:false, maxAge:1000*60*60*8 });
  res.json({ ok:true, username:user.username });
});

// Change password
app.put('/api/password', requireSession, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'missing_fields' });
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'not_found' });
  if (!verifyPassword(currentPassword, user.salt, user.passwordHash)) return res.status(401).json({ error: 'invalid_credentials' });
  const { salt, hash } = hashPassword(newPassword);
  user.salt = salt;
  user.passwordHash = hash;
  writeDb(db);
  res.json({ ok:true });
});

// Clean routes for static pages
app.get('/modulos', (req, res) => {
  res.sendFile(path.join(__dirname, 'modulos.html'));
});
app.get('/phishing', (req, res) => {
  res.sendFile(path.join(__dirname, 'phishing.html'));
});
app.get('/ava', (req, res) => {
  res.sendFile(path.join(__dirname, 'ava.html'));
});
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});
// Slide and video pages
app.get('/slide-seguridad-fisica.html', (req, res) => res.sendFile(path.join(__dirname, 'slide-seguridad-fisica.html')));
app.get('/slide-servicios-externos.html', (req, res) => res.sendFile(path.join(__dirname, 'slide-servicios-externos.html')));
app.get('/slide-links-archivos.html', (req, res) => res.sendFile(path.join(__dirname, 'slide-links-archivos.html')));
app.get('/slide-servidores.html', (req, res) => res.sendFile(path.join(__dirname, 'slide-servidores.html')));
app.get('/slide-general.html', (req, res) => res.sendFile(path.join(__dirname, 'slide-general.html')));
app.get('/video-seguridad-fisica.html', (req, res) => res.sendFile(path.join(__dirname, 'video-seguridad-fisica.html')));
app.get('/video-servicios-externos.html', (req, res) => res.sendFile(path.join(__dirname, 'video-servicios-externos.html')));
app.get('/video-links-archivos.html', (req, res) => res.sendFile(path.join(__dirname, 'video-links-archivos.html')));
app.get('/video-servidores.html', (req, res) => res.sendFile(path.join(__dirname, 'video-servidores.html')));
app.get('/video-general.html', (req, res) => res.sendFile(path.join(__dirname, 'video-general.html')));
app.get('/sobre.html', (req, res) => res.sendFile(path.join(__dirname, 'sobre.html')));
app.get('/contacto.html', (req, res) => res.sendFile(path.join(__dirname, 'contacto.html')));

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});


