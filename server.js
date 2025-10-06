require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const { OAuth2Client } = require('google-auth-library');
const path = require('path');

const app = express();
const port = process.env.PORT || 5173;

const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const allowedDomain = 'ufps.edu.co';
const sessionCookieName = 'sess';

const client = new OAuth2Client(googleClientId);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files
app.use(express.static(path.join(__dirname)));

// Public config endpoint for the frontend
app.get('/config', (req, res) => {
  res.json({ googleClientId });
});

async function verifyIdToken(idToken){
  const ticket = await client.verifyIdToken({ idToken, audience: googleClientId });
  const payload = ticket.getPayload();
  return payload; // contains email, email_verified, name, picture, sub, hd (hosted domain if workspace)
}

// Session info
app.get('/api/me', (req, res) => {
  const sess = req.cookies?.[sessionCookieName];
  if (!sess) return res.status(200).json({ authenticated: false });
  try {
    const decoded = JSON.parse(Buffer.from(sess, 'base64url').toString('utf8'));
    return res.json({ authenticated: true, email: decoded.email });
  } catch {
    return res.status(200).json({ authenticated: false });
  }
});

// Login: exchange Google ID token → set session cookie if domain matches
app.post('/api/login', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'missing_id_token' });
    const payload = await verifyIdToken(idToken);
    const email = payload?.email || '';
    const hd = payload?.hd || '';
    const verified = Boolean(payload?.email_verified);

    const domain = (email.split('@')[1] || '').toLowerCase();
    const domainAllowed = domain === allowedDomain || hd === allowedDomain;
    if (!verified || !domainAllowed) {
      return res.status(403).json({ error: 'domain_not_allowed' });
    }

    // Minimal opaque session. In real app use signed JWT or server store.
    const sessionValue = Buffer.from(JSON.stringify({ email, t: Date.now() })).toString('base64url');
    res.cookie(sessionCookieName, sessionValue, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // set true behind HTTPS/proxy
      maxAge: 1000 * 60 * 60 * 8
    });
    res.json({ ok: true, email });
  } catch (err) {
    res.status(401).json({ error: 'invalid_token' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie(sessionCookieName);
  res.json({ ok: true });
});

// Middleware to require session
function requireSession(req, res, next){
  const sess = req.cookies?.[sessionCookieName];
  if (!sess) return res.status(401).json({ error: 'unauthenticated' });
  try {
    const decoded = JSON.parse(Buffer.from(sess, 'base64url').toString('utf8'));
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid_session' });
  }
}

// Protected example: include company
app.post('/api/companies', requireSession, (req, res) => {
  const { companyName, contactName, phone } = req.body || {};
  if (!companyName) return res.status(400).json({ error: 'missing_company_name' });
  // For now, just echo back; later persist to DB
  res.json({ ok: true, by: req.user.email, companyName, contactName, phone });
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

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});


