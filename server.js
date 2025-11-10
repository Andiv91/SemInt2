require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const app = express();
const port = process.env.PORT || 5173;
const sessionCookieName = 'sess';
const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-change-me';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files
app.use(express.static(path.join(__dirname)));

// --- Minimal JSON file DB ---
const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'db.json');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({ users: [], topics: [], news: [], courses: [] }, null, 2));

function readDb(){
  try { return JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch { return { users: [], topics: [], news: [], courses: [] }; }
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

// Ensure owner roles are applied to existing users on startup
function ensureOwnerRoles(){
  const db = readDb();
  let changed = false;
  for (const u of db.users){
    const isOwnerEmail = ownerEmails.has(String(u.email || '').toLowerCase());
    if (isOwnerEmail && u.role !== 'owner'){ u.role = 'owner'; changed = true; }
    if (!isOwnerEmail && u.role === 'owner'){ u.role = 'admin'; changed = true; } // downgrade stray owners
  }
  if (changed) writeDb(db);
}

async function ensureSeedOnBoot(){
  try {
    const count = await prisma.topic.count();
    if (count === 0){
      const seed = require(path.join(__dirname, 'prisma', 'seed.js'));
      if (seed && typeof seed.run === 'function'){
        await seed.run();
        console.log('Seed completed on empty database.');
      }
    }
  } catch (e) {
    console.warn('Seed check failed:', e?.message || e);
  }
}
// Middleware to require session
function requireSession(req, res, next){
  const sess = req.cookies?.[sessionCookieName];
  const data = verifySession(sess);
  if (!data) return res.status(401).json({ error: 'unauthenticated' });
  req.user = data;
  return next();
}

// Role-based access control
const roleHierarchy = { 'user': 0, 'course_editor': 1, 'news_editor': 2, 'theme_editor': 3, 'admin': 4, 'owner': 5 };
const ownerEmails = new Set(['andiv0901@gmail.com', 'ghostpkiller@hotmail.com']);
function hasRole(requiredRole) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
      // Prefer Prisma user store
      let user = null;
      try {
        user = await prisma.user.findUnique({ where: { id: req.user.userId } });
      } catch {}
      if (!user) {
        // fallback JSON user (legacy)
        const db = readDb();
        user = db.users.find(u => u.id === req.user.userId);
      }
      if (!user) return res.status(404).json({ error: 'user_not_found' });
      const isOwner = ownerEmails.has(String(user.email || '').toLowerCase());
      const userRole = isOwner ? roleHierarchy['owner'] : (roleHierarchy[user.role] || 0);
      const required = roleHierarchy[requiredRole] || 0;
      if (userRole < required) return res.status(403).json({ error: 'insufficient_permissions' });
      next();
    } catch (e) {
      res.status(500).json({ error: 'role_check_failed' });
    }
  };
}

// ===== SESSION =====
app.get('/api/me', async (req, res) => {
  const sess = req.cookies?.[sessionCookieName];
  const data = verifySession(sess);
  if (!data) return res.json({ authenticated: false });
  // Prefer Prisma
  let user = null;
  try {
    user = await prisma.user.findUnique({ where: { id: data.userId } });
  } catch {}
  if (!user) {
    const db = readDb();
    user = db.users.find(u => u.id === data.userId);
  }
  if (!user) return res.json({ authenticated: false });
  const isOwner = ownerEmails.has(String(user.email || '').toLowerCase());
  const role = isOwner ? 'owner' : user.role;
  return res.json({ authenticated: true, email: user.email, username: user.username, userId: user.id, role });
});

// ===== AUTH =====
app.post('/api/register', async (req, res) => {
  const { email, username, password } = req.body || {};
  if (!email || !username || !password) return res.status(400).json({ error: 'missing_fields' });
  try {
    const exists = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (exists) return res.status(409).json({ error: 'email_exists' });
    const { salt, hash } = hashPassword(password);
    const role = ownerEmails.has(String(email).toLowerCase()) ? 'owner' : 'user';
    const user = await prisma.user.create({ data: { email: String(email).toLowerCase(), username, passwordHash: hash, salt, role } });
    const token = signSession({ userId: user.id, email: user.email, username: user.username, role: user.role, t: Date.now() });
    res.cookie(sessionCookieName, token, { httpOnly:true, sameSite:'lax', secure:false, maxAge:1000*60*60*8 });
    res.json({ ok:true, email:user.email, username:user.username, role: user.role });
  } catch (e) {
    res.status(500).json({ error: 'register_failed' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing_fields' });
  try {
    let user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (!user) {
      // fallback legacy json
      const db = readDb();
      user = db.users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
      if (!user) return res.status(401).json({ error: 'invalid_credentials' });
      if (!verifyPassword(password, user.salt, user.passwordHash)) return res.status(401).json({ error: 'invalid_credentials' });
      const isOwner = ownerEmails.has(String(user.email).toLowerCase());
      const role = isOwner ? 'owner' : user.role;
      const tokenLegacy = signSession({ userId: user.id, email: user.email, username: user.username, role, t: Date.now() });
      res.cookie(sessionCookieName, tokenLegacy, { httpOnly:true, sameSite:'lax', secure:false, maxAge:1000*60*60*8 });
      return res.json({ ok:true, email:user.email, username:user.username, role });
    }
    if (!verifyPassword(password, user.salt, user.passwordHash)) return res.status(401).json({ error: 'invalid_credentials' });
    const isOwner = ownerEmails.has(String(user.email).toLowerCase());
    const role = isOwner ? 'owner' : user.role;
    const token = signSession({ userId: user.id, email: user.email, username: user.username, role, t: Date.now() });
    res.cookie(sessionCookieName, token, { httpOnly:true, sameSite:'lax', secure:false, maxAge:1000*60*60*8 });
    res.json({ ok:true, email:user.email, username:user.username, role });
  } catch (e) {
    res.status(500).json({ error: 'login_failed' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(sessionCookieName);
  res.json({ ok: true });
});

// ===== TOPICS (TEMAS) =====
app.get('/api/topics', (req, res) => {
  const db = readDb();
  return res.json(db.topics);
});

app.get('/api/topics/:slug', (req, res) => {
  const db = readDb();
  const topic = db.topics.find(t => t.slug === req.params.slug);
  if (!topic) return res.status(404).json({ error: 'topic_not_found' });
  
  // Get news and courses for this topic
  const news = db.news.filter(n => n.topicId === topic.id);
  const courses = db.courses.filter(c => c.topicId === topic.id);
  
  return res.json({ ...topic, news, courses });
});

app.post('/api/topics', requireSession, hasRole('theme_editor'), (req, res) => {
  const { slug, title, description, logo, videoUrl } = req.body || {};
  if (!slug || !title) return res.status(400).json({ error: 'missing_fields' });
  const db = readDb();
  if (db.topics.find(t => t.slug === slug)) return res.status(409).json({ error: 'topic_exists' });
  const topic = {
    id: crypto.randomUUID(),
    slug,
    title,
    description: description || '',
    logo: logo || '',
    videoUrl: videoUrl || '',
    items: [],
    createdBy: req.user.userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.topics.push(topic);
  writeDb(db);
  res.json({ ok: true, topic });
});

app.put('/api/topics/:id', requireSession, hasRole('theme_editor'), (req, res) => {
  const { title, description, logo, videoUrl } = req.body || {};
  const db = readDb();
  const topic = db.topics.find(t => t.id === req.params.id);
  if (!topic) return res.status(404).json({ error: 'topic_not_found' });
  if (title) topic.title = title;
  if (description !== undefined) topic.description = description;
  if (logo !== undefined) topic.logo = logo;
  if (videoUrl !== undefined) topic.videoUrl = videoUrl;
  topic.updatedAt = new Date().toISOString();
  writeDb(db);
  res.json({ ok: true, topic });
});

app.delete('/api/topics/:id', requireSession, hasRole('admin'), (req, res) => {
  const db = readDb();
  const idx = db.topics.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'topic_not_found' });
  db.topics.splice(idx, 1);
  writeDb(db);
  res.json({ ok: true });
});

// ===== NEWS (NOTICIAS) =====
app.get('/api/topics/:slug/news', (req, res) => {
  const db = readDb();
  const topic = db.topics.find(t => t.slug === req.params.slug);
  if (!topic) return res.status(404).json({ error: 'topic_not_found' });
  const news = db.news.filter(n => n.topicId === topic.id);
  res.json(news);
});

app.post('/api/topics/:id/news', requireSession, hasRole('news_editor'), (req, res) => {
  const { title, url, description } = req.body || {};
  if (!title || !url) return res.status(400).json({ error: 'missing_fields' });
  const db = readDb();
  const topic = db.topics.find(t => t.id === req.params.id);
  if (!topic) return res.status(404).json({ error: 'topic_not_found' });
  const newsItem = {
    id: crypto.randomUUID(),
    topicId: topic.id,
    title,
    url,
    description: description || '',
    addedBy: req.user.userId,
    addedAt: new Date().toISOString()
  };
  db.news.push(newsItem);
  writeDb(db);
  res.json({ ok: true, news: newsItem });
});

app.put('/api/news/:id', requireSession, hasRole('news_editor'), (req, res) => {
  const { title, url, description } = req.body || {};
  const db = readDb();
  const newsItem = db.news.find(n => n.id === req.params.id);
  if (!newsItem) return res.status(404).json({ error: 'news_not_found' });
  if (req.user.role !== 'admin' && newsItem.addedBy !== req.user.userId) {
    return res.status(403).json({ error: 'not_your_news' });
  }
  if (title) newsItem.title = title;
  if (url) newsItem.url = url;
  if (description !== undefined) newsItem.description = description;
  writeDb(db);
  res.json({ ok: true, news: newsItem });
});

app.delete('/api/news/:id', requireSession, hasRole('admin'), (req, res) => {
  const db = readDb();
  const idx = db.news.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'news_not_found' });
  db.news.splice(idx, 1);
  writeDb(db);
  res.json({ ok: true });
});

// ===== COURSES (CURSOS) =====
app.get('/api/topics/:slug/courses', (req, res) => {
  const db = readDb();
  const topic = db.topics.find(t => t.slug === req.params.slug);
  if (!topic) return res.status(404).json({ error: 'topic_not_found' });
  const courses = db.courses.filter(c => c.topicId === topic.id);
  res.json(courses);
});

app.post('/api/topics/:id/courses', requireSession, hasRole('course_editor'), (req, res) => {
  const { title, url, description } = req.body || {};
  if (!title || !url) return res.status(400).json({ error: 'missing_fields' });
  const db = readDb();
  const topic = db.topics.find(t => t.id === req.params.id);
  if (!topic) return res.status(404).json({ error: 'topic_not_found' });
  const course = {
    id: crypto.randomUUID(),
    topicId: topic.id,
    title,
    url,
    description: description || '',
    addedBy: req.user.userId,
    addedAt: new Date().toISOString()
  };
  db.courses.push(course);
  writeDb(db);
  res.json({ ok: true, course });
});

app.put('/api/courses/:id', requireSession, hasRole('course_editor'), (req, res) => {
  const { title, url, description } = req.body || {};
  const db = readDb();
  const course = db.courses.find(c => c.id === req.params.id);
  if (!course) return res.status(404).json({ error: 'course_not_found' });
  if (req.user.role !== 'admin' && course.addedBy !== req.user.userId) {
    return res.status(403).json({ error: 'not_your_course' });
  }
  if (title) course.title = title;
  if (url) course.url = url;
  if (description !== undefined) course.description = description;
  writeDb(db);
  res.json({ ok: true, course });
});

app.delete('/api/courses/:id', requireSession, hasRole('admin'), (req, res) => {
  const db = readDb();
  const idx = db.courses.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'course_not_found' });
  db.courses.splice(idx, 1);
  writeDb(db);
  res.json({ ok: true });
});

// ===== NOTIFICATIONS =====
app.get('/api/notifications', requireSession, async (req, res) => {
  try {
    let settings = await prisma.notificationSetting.findUnique({ where: { userId: req.user.userId } });
    if (!settings) {
      settings = await prisma.notificationSetting.create({ data: { userId: req.user.userId } });
    }
    const subs = await prisma.topicSubscription.findMany({ where: { userId: req.user.userId }, select: { topicId: true } });
    res.json({ settings, subscriptions: subs.map(s => s.topicId) });
  } catch {
    res.status(500).json({ error: 'notifications_failed' });
  }
});

app.post('/api/notifications/subscribe', requireSession, async (req, res) => {
  const { topicId, topicSlug } = req.body || {};
  try {
    let resolvedTopicId = topicId;
    if (!resolvedTopicId && topicSlug) {
      const topic = await prisma.topic.findUnique({ where: { slug: topicSlug } });
      if (!topic) return res.status(404).json({ error: 'topic_not_found' });
      resolvedTopicId = topic.id;
    }
    if (!resolvedTopicId) return res.status(400).json({ error: 'missing_topic' });
    await prisma.topicSubscription.upsert({
      where: { userId_topicId: { userId: req.user.userId, topicId: resolvedTopicId } },
      update: {},
      create: { userId: req.user.userId, topicId: resolvedTopicId }
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'subscribe_failed' });
  }
});

app.post('/api/notifications/unsubscribe', requireSession, async (req, res) => {
  const { topicId, topicSlug } = req.body || {};
  try {
    let resolvedTopicId = topicId;
    if (!resolvedTopicId && topicSlug) {
      const topic = await prisma.topic.findUnique({ where: { slug: topicSlug } });
      if (!topic) return res.status(404).json({ error: 'topic_not_found' });
      resolvedTopicId = topic.id;
    }
    if (!resolvedTopicId) return res.status(400).json({ error: 'missing_topic' });
    await prisma.topicSubscription.deleteMany({ where: { userId: req.user.userId, topicId: resolvedTopicId } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'unsubscribe_failed' });
  }
});

// ===== PRISMA v2 API (DB-backed content) =====
// READ
app.get('/api/v2/topics', async (req, res) => {
  try {
    const topics = await prisma.topic.findMany({
      orderBy: { title: 'asc' },
      select: { id: true, slug: true, title: true, description: true, imagePath: true }
    });
    res.json(topics);
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});
app.get('/api/v2/topics/:slug', async (req, res) => {
  try {
    const topic = await prisma.topic.findUnique({
      where: { slug: req.params.slug },
      include: {
        videos: { orderBy: { order: 'asc' } },
        news: true,
        courses: true,
        questions: { include: { options: true } }
      }
    });
    if (!topic) return res.status(404).json({ error: 'not_found' });
    res.json(topic);
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});
// WRITE
app.post('/api/v2/topics', requireSession, hasRole('theme_editor'), async (req, res) => {
  const { slug, title, description, imagePath } = req.body || {};
  if (!slug || !title) return res.status(400).json({ error: 'missing_fields' });
  try {
    const created = await prisma.topic.create({ data: { slug, title, description: description || '', imagePath: imagePath || '' } });
    res.json({ ok: true, topic: created });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});
app.put('/api/v2/topics/:slug', requireSession, hasRole('theme_editor'), async (req, res) => {
  const { title, description, imagePath } = req.body || {};
  try {
    const updated = await prisma.topic.update({ where: { slug: req.params.slug }, data: { title, description, imagePath } });
    res.json({ ok: true, topic: updated });
  } catch {
    res.status(404).json({ error: 'not_found' });
  }
});
app.delete('/api/v2/topics/:slug', requireSession, hasRole('admin'), async (req, res) => {
  try {
    await prisma.video.deleteMany({ where: { topic: { slug: req.params.slug } } });
    await prisma.news.deleteMany({ where: { topic: { slug: req.params.slug } } });
    await prisma.course.deleteMany({ where: { topic: { slug: req.params.slug } } });
    await prisma.quizOption.deleteMany({ where: { question: { topic: { slug: req.params.slug } } } });
    await prisma.quizQuestion.deleteMany({ where: { topic: { slug: req.params.slug } } });
    await prisma.topic.delete({ where: { slug: req.params.slug } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'not_found' });
  }
});
app.post('/api/v2/topics/:slug/video', requireSession, hasRole('theme_editor'), async (req, res) => {
  const { title, url, provider, order } = req.body || {};
  try {
    const topic = await prisma.topic.findUnique({ where: { slug: req.params.slug } });
    if (!topic) return res.status(404).json({ error: 'not_found' });
    await prisma.video.deleteMany({ where: { topicId: topic.id } });
    const v = await prisma.video.create({ data: { topicId: topic.id, title: title || 'Video', url, provider: provider || 'youtube', order: order || 1 } });
    res.json({ ok: true, video: v });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});
app.post('/api/v2/topics/:slug/news', requireSession, hasRole('news_editor'), async (req, res) => {
  const { title, url, source, summary } = req.body || {};
  if (!title || !url) return res.status(400).json({ error: 'missing_fields' });
  try {
    const topic = await prisma.topic.findUnique({ where: { slug: req.params.slug } });
    if (!topic) return res.status(404).json({ error: 'not_found' });
    const item = await prisma.news.create({ data: { topicId: topic.id, title, url, source: source || '', summary: summary || '' } });
    res.json({ ok: true, news: item });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});
app.delete('/api/v2/news/:id', requireSession, hasRole('admin'), async (req, res) => {
  try {
    await prisma.news.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'not_found' });
  }
});
app.post('/api/v2/topics/:slug/courses', requireSession, hasRole('course_editor'), async (req, res) => {
  const { title, url, provider, summary } = req.body || {};
  if (!title || !url) return res.status(400).json({ error: 'missing_fields' });
  try {
    const topic = await prisma.topic.findUnique({ where: { slug: req.params.slug } });
    if (!topic) return res.status(404).json({ error: 'not_found' });
    const c = await prisma.course.create({ data: { topicId: topic.id, title, url, provider: provider || '', summary: summary || '' } });
    res.json({ ok: true, course: c });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});
app.delete('/api/v2/courses/:id', requireSession, hasRole('admin'), async (req, res) => {
  try {
    await prisma.course.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'not_found' });
  }
});
app.post('/api/v2/topics/:slug/questions', requireSession, hasRole('theme_editor'), async (req, res) => {
  const { text, options } = req.body || {};
  if (!text || !Array.isArray(options) || options.length === 0) return res.status(400).json({ error: 'missing_fields' });
  try {
    const topic = await prisma.topic.findUnique({ where: { slug: req.params.slug } });
    if (!topic) return res.status(404).json({ error: 'not_found' });
    const q = await prisma.quizQuestion.create({
      data: { topicId: topic.id, text, options: { create: options.map(o => ({ text: o.text, correct: !!o.correct })) } },
      include: { options: true }
    });
    res.json({ ok: true, question: q });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});
app.delete('/api/v2/questions/:id', requireSession, hasRole('admin'), async (req, res) => {
  try {
    await prisma.quizOption.deleteMany({ where: { questionId: req.params.id } });
    await prisma.quizQuestion.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'not_found' });
  }
});

// Upload topic image (store as Asset)
app.post('/api/v2/topics/:slug/image', requireSession, hasRole('theme_editor'), upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'missing_file' });
    const topic = await prisma.topic.findUnique({ where: { slug: req.params.slug } });
    if (!topic) return res.status(404).json({ error: 'not_found' });
    const asset = await prisma.asset.create({
      data: { filename: req.file.originalname || 'image', mimeType: req.file.mimetype || 'application/octet-stream', data: req.file.buffer }
    });
    await prisma.topic.update({ where: { id: topic.id }, data: { imageAssetId: asset.id } });
    res.json({ ok: true, assetId: asset.id });
  } catch {
    res.status(500).json({ error: 'upload_failed' });
  }
});

// Serve asset
app.get('/assets/:id', async (req, res) => {
  try {
    const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!asset) return res.status(404).send('Not found');
    res.setHeader('Content-Type', asset.mimeType || 'application/octet-stream');
    res.send(Buffer.from(asset.data));
  } catch {
    res.status(404).send('Not found');
  }
});
// ===== PRISMA V2 API (DB-backed) =====
app.get('/api/v2/topics', async (req, res) => {
  try {
    const topics = await prisma.topic.findMany({
      orderBy: { title: 'asc' },
      select: { slug: true, title: true, description: true, imagePath: true }
    });
    res.json(topics);
  } catch (e) {
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/v2/topics/:slug', async (req, res) => {
  try {
    const topic = await prisma.topic.findUnique({
      where: { slug: req.params.slug },
      include: {
        videos: { orderBy: { order: 'asc' } },
        news: true,
        courses: true,
        questions: { include: { options: true } }
      }
    });
    if (!topic) return res.status(404).json({ error: 'not_found' });
    res.json(topic);
  } catch (e) {
    res.status(500).json({ error: 'db_error' });
  }
});

// ===== PROFILE =====
app.put('/api/profile', requireSession, async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'missing_username' });
  try {
    let user = await prisma.user.update({ where: { id: req.user.userId }, data: { username } });
    const isOwner = ownerEmails.has(String(user.email).toLowerCase());
    const role = isOwner ? 'owner' : user.role;
    const token = signSession({ userId: user.id, email: user.email, username: user.username, role, t: Date.now() });
    res.cookie(sessionCookieName, token, { httpOnly:true, sameSite:'lax', secure:false, maxAge:1000*60*60*8 });
    res.json({ ok:true, username:user.username });
  } catch {
    res.status(404).json({ error: 'not_found' });
  }
});

app.put('/api/password', requireSession, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'missing_fields' });
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'not_found' });
    if (!verifyPassword(currentPassword, user.salt, user.passwordHash)) return res.status(401).json({ error: 'invalid_credentials' });
    const { salt, hash } = hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { salt, passwordHash: hash } });
    res.json({ ok:true });
  } catch {
    res.status(500).json({ error: 'change_password_failed' });
  }
});

// ===== USER MANAGEMENT (owners only) =====
app.get('/api/users', requireSession, hasRole('owner'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({ select: { id: true, email: true, username: true, role: true } });
    res.json(users);
  } catch {
    res.status(500).json({ error: 'users_list_failed' });
  }
});
app.put('/api/users/:id/role', requireSession, hasRole('owner'), async (req, res) => {
  const { role } = req.body || {};
  const allowed = ['user','course_editor','news_editor','theme_editor','admin']; // 'owner' no se asigna por UI
  if (!allowed.includes(role)) return res.status(400).json({ error: 'invalid_role' });
  try {
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { role } });
    res.json({ ok: true, id: user.id, role: user.role });
  } catch {
    res.status(404).json({ error: 'user_not_found' });
  }
});

// Owner-only: force seed
app.post('/api/admin/seed', requireSession, hasRole('owner'), async (req, res) => {
  try {
    const seed = require(path.join(__dirname, 'prisma', 'seed.js'));
    if (seed && typeof seed.run === 'function'){
      await seed.run();
      return res.json({ ok:true });
    }
    res.status(500).json({ error: 'seed_not_available' });
  } catch (e) {
    res.status(500).json({ error: 'seed_failed' });
  }
});
// ===== STATIC ROUTES =====
app.get('/temas', (req, res) => res.sendFile(path.join(__dirname, 'modulos.html')));
app.get('/modulos', (req, res) => res.sendFile(path.join(__dirname, 'modulos.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.get('/phishing', (req, res) => res.sendFile(path.join(__dirname, 'phishing.html')));
app.get('/ava', (req, res) => res.sendFile(path.join(__dirname, 'ava.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
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

// Generic module page
app.get('/m/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'module.html'));
});

// Apply owner role sync then start server
ensureOwnerRoles();
ensureSeedOnBoot().finally(() => {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
});
