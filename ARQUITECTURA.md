# Documento Técnico: CSECV
## Explicación de Implementación

**Proyecto:** CSECV - Sistema de Capacitación en Ciberseguridad  
**Fecha:** Enero 2025

---

## 1. ¿QUÉ ES ESTE PROYECTO?

Una plataforma web educativa donde usuarios pueden:
- Registrarse y autenticarse
- Ver módulos de ciberseguridad con videos de YouTube
- Realizar quizzes y recibir feedback
- Ver noticias y cursos recomendados
- Incluir datos de empresa (funcionalidad protegida)

---

## 2. BASE DE DATOS

### 2.1 ¿Qué se usó?
**Archivo JSON:** `data/db.json`

No se usó MySQL, PostgreSQL ni MongoDB. Se implementó una base de datos simple con archivos JSON.

### 2.2 Estructura de la Base de Datos

```json
{
  "users": [
    {
      "id": "481c4b93-4968-4ccd-b846-f5003bc1dcbf",
      "email": "andiv0901@gmail.com",
      "username": "AngelD9",
      "passwordHash": "d57e01b762b354e879a2919abea30265ec99110c674cd0eca23119270e2c8165f46a85d5b02b6120eb0968762052eda7d439b9884ea50289139bc4bbc9f51690",
      "salt": "e32e3bf5dd1d5c3098d74ecbed8fe577"
    }
  ]
}
```

### 2.3 ¿Qué significa cada campo?

**`id`:** UUID v4 generado con `crypto.randomUUID()`. Identificador único del usuario.

**`email`:** Correo del usuario (se guarda en minúsculas para búsquedas sin importar mayúsculas).

**`username`:** Nombre de usuario (se puede cambiar después).

**`passwordHash`:** Contraseña encriptada usando Scrypt (128 caracteres hexadecimales).

**`salt`:** Valor aleatorio de 32 caracteres hexadecimales que se usa para encriptar la contraseña de forma única.

### 2.4 ¿Cómo se guarda la información?

En el archivo `server.js` se usan estas funciones:

```javascript
// Leer base de datos
function readDb() {
  try {
    return JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
  } catch {
    return { users: [] };
  }
}

// Escribir base de datos
function writeDb(db) {
  fs.writeFileSync('data/db.json', JSON.stringify(db, null, 2));
}
```

**¿Qué hace?**
- `fs.readFileSync()`: Lee el archivo JSON completo desde disco
- `fs.writeFileSync()`: Escribe todo el archivo JSON de nuevo
- No hay tablas, solo un array `users[]`

---

## 3. BACKEND

### 3.1 ¿Qué se usó?

- **Node.js 25.0.0**
- **Express.js 4.21.1**
- **cookie-parser** (para manejar cookies)
- **crypto** nativo de Node.js (para encriptar contraseñas y sesiones)
- **dotenv** (para variables de entorno)

### 3.2 ¿Cómo funciona el servidor?

El archivo `server.js` tiene 177 líneas. Se ejecuta así:

```bash
node server.js
```

**Puerto:** 5173 (por defecto, configurable en `.env`)

### 3.3 ¿Cómo se encriptan las contraseñas?

**Algoritmo:** Scrypt (funciona en memoria, no solo en CPU)

```javascript
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return { salt: s, hash };
}
```

**¿Qué hace?**
1. Genera un número aleatorio de 16 bytes (32 caracteres hexadecimales)
2. Mezcla la contraseña con ese número aleatorio usando Scrypt
3. Obtiene 64 bytes (128 caracteres) de hash
4. Retorna el hash y el salt (número aleatorio)

**¿Por qué Scrypt?**
- Resistente a ataques de fuerza bruta con GPUs
- Requiere mucha memoria, lo que hace más difícil los ataques

### 3.4 ¿Cómo funcionan las sesiones?

**No se usa JWT.** Se implementó un sistema propio similar a JWT.

**Formato del token de sesión:**
```
{datos_en_base64}.{firma_hmac_sha256}
```

**Ejemplo:**
```
eyJ1c2VySWQiOiI...username...timestamp}.signatura_sha256_aqui
```

**¿Cómo se crea una sesión?**

```javascript
function signSession(payload) {
  // 1. Convierte los datos a base64
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  // 2. Firma con HMAC-SHA256
  const sig = crypto.createHmac('sha256', SESSION_SECRET)
    .update(body)
    .digest('base64url');
  
  // 3. Une payload y firma
  return `${body}.${sig}`;
}
```

**¿Qué datos contiene el token?**
- `userId`: ID del usuario
- `email`: Email del usuario
- `username`: Nombre de usuario
- `t`: Timestamp de creación

**¿Cómo se valida una sesión?**

```javascript
function verifySession(token) {
  // 1. Separa el token por el punto
  const [body, sig] = token.split('.');
  
  // 2. Calcula la firma esperada
  const expected = crypto.createHmac('sha256', SESSION_SECRET)
    .update(body)
    .digest('base64url');
  
  // 3. Compara las firmas (timing-safe)
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null; // Firma inválida
  }
  
  // 4. Decodifica los datos
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}
```

### 3.5 ¿Cómo se manejan las cookies?

**Configuración de cookies:**

```javascript
res.cookie('sess', token, {
  httpOnly: true,          // No accesible desde JavaScript
  sameSite: 'lax',        // Protección CSRF básica
  secure: false,           // Solo HTTP (cambiar a true en producción)
  maxAge: 1000*60*60*8    // 8 horas
});
```

**¿Qué significa cada opción?**
- `httpOnly: true`: Solo el navegador puede leer la cookie, no JavaScript (previene XSS)
- `sameSite: 'lax'`: La cookie solo se envía en requests "normales" (reduce CSRF)
- `secure: false`: Funciona en HTTP (por eso está en false en desarrollo)
- `maxAge`: La cookie expira en 8 horas (28800000 milisegundos)

### 3.6 APIs del Backend

**Todas están en:** `server.js`

#### 3.6.1 GET `/api/me`
**¿Qué hace?** Dice si el usuario está autenticado.

```javascript
app.get('/api/me', (req, res) => {
  const sess = req.cookies?.[sessionCookieName];
  const data = verifySession(sess);
  if (!data) return res.json({ authenticated: false });
  return res.json({ 
    authenticated: true, 
    email: data.email, 
    username: data.username, 
    userId: data.userId 
  });
});
```

**¿Cómo se usa?** El frontend llama esto para saber si hay alguien logueado.

#### 3.6.2 POST `/api/register`
**¿Qué hace?** Registra un nuevo usuario.

**Input:**
```json
{
  "email": "usuario@example.com",
  "username": "Juan",
  "password": "mipassword123"
}
```

**Proceso:**
1. Valida que email, username y password existan
2. Verifica que el email no esté registrado
3. Encripta la contraseña con Scrypt
4. Crea un nuevo usuario con UUID
5. Guarda en `data/db.json`
6. Genera una sesión y crea una cookie
7. Responde con `{ok: true, email, username}`

**Código:**
```javascript
app.post('/api/register', (req, res) => {
  const { email, username, password } = req.body || {};
  
  // Validar campos
  if (!email || !username || !password) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  
  // Verificar email duplicado
  const db = readDb();
  if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'email_exists' });
  }
  
  // Encriptar contraseña
  const { salt, hash } = hashPassword(password);
  
  // Crear usuario
  const user = {
    id: crypto.randomUUID(),
    email,
    username,
    passwordHash: hash,
    salt
  };
  
  // Guardar
  db.users.push(user);
  writeDb(db);
  
  // Crear sesión
  const token = signSession({ 
    userId: user.id, 
    email: user.email, 
    username: user.username, 
    t: Date.now() 
  });
  
  // Enviar cookie
  res.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000*60*60*8
  });
  
  res.json({ ok: true, email: user.email, username: user.username });
});
```

#### 3.6.3 POST `/api/login`
**¿Qué hace?** Autentica un usuario existente.

**Input:**
```json
{
  "email": "usuario@example.com",
  "password": "mipassword123"
}
```

**Proceso:**
1. Valida email y password
2. Busca el usuario en la base de datos
3. Verifica la contraseña (comparación timing-safe)
4. Si es correcta, crea sesión y cookie
5. Responde con datos del usuario

**Código:**
```javascript
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  
  // Validar
  if (!email || !password) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  
  // Buscar usuario
  const db = readDb();
  const user = db.users.find(u => 
    u.email.toLowerCase() === String(email).toLowerCase()
  );
  
  // Verificar contraseña
  if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  
  // Crear sesión y responder
  const token = signSession({
    userId: user.id,
    email: user.email,
    username: user.username,
    t: Date.now()
  });
  
  res.cookie(sessionCookieName, token, {/* ... */});
  res.json({ ok: true, email: user.email, username: user.username });
});
```

#### 3.6.4 POST `/api/logout`
**¿Qué hace?** Cierra la sesión.

```javascript
app.post('/api/logout', (req, res) => {
  res.clearCookie(sessionCookieName);
  res.json({ ok: true });
});
```

**¿Cómo funciona?** Simplemente borra la cookie del navegador.

#### 3.6.5 POST `/api/companies` (Protegida)
**¿Qué hace?** Permite enviar datos de empresa (requiere estar logueado).

**Input:**
```json
{
  "companyName": "Mi Empresa",
  "contactName": "Juan Pérez",
  "phone": "1234567890"
}
```

**Middleware de protección:**
```javascript
function requireSession(req, res, next) {
  const sess = req.cookies?.[sessionCookieName];
  const data = verifySession(sess);
  if (!data) return res.status(401).json({ error: 'unauthenticated' });
  req.user = data;  // Inyecta datos del usuario
  return next();
}
```

**Endpoint:**
```javascript
app.post('/api/companies', requireSession, (req, res) => {
  const { companyName, contactName, phone } = req.body || {};
  
  if (!companyName) {
    return res.status(400).json({ error: 'missing_company_name' });
  }
  
  // Por ahora solo hace echo (no guarda en DB)
  res.json({
    ok: true,
    by: req.user.email,
    companyName,
    contactName,
    phone
  });
});
```

#### 3.6.6 PUT `/api/profile` (Protegida)
**¿Qué hace?** Actualiza el nombre de usuario.

```javascript
app.put('/api/profile', requireSession, (req, res) => {
  const { username } = req.body || {};
  
  if (!username) return res.status(400).json({ error: 'missing_username' });
  
  // Buscar usuario
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'not_found' });
  
  // Actualizar
  user.username = username;
  writeDb(db);
  
  // Reescribir sesión con nuevo username
  const token = signSession({
    userId: user.id,
    email: user.email,
    username: user.username,  // Nuevo
    t: Date.now()
  });
  
  res.cookie(sessionCookieName, token, {/* ... */});
  res.json({ ok: true, username: user.username });
});
```

#### 3.6.7 PUT `/api/password` (Protegida)
**¿Qué hace?** Cambia la contraseña del usuario.

```javascript
app.put('/api/password', requireSession, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  
  // Buscar usuario
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'not_found' });
  
  // Verificar contraseña actual
  if (!verifyPassword(currentPassword, user.salt, user.passwordHash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  
  // Generar nuevo hash
  const { salt, hash } = hashPassword(newPassword);
  user.salt = salt;
  user.passwordHash = hash;
  
  // Guardar
  writeDb(db);
  res.json({ ok: true });
});
```

---

## 4. FRONTEND

### 4.1 ¿Qué se usó?

- **HTML5** (sin framework)
- **CSS3** (custom properties)
- **JavaScript Vanilla** (sin React, Vue, Angular)

### 4.2 ¿Qué archivos hay?

**21 archivos HTML:**
- `index.html` - Página principal
- `login.html` - Login/registro
- `modulos.html` - Catálogo de temas
- `phishing.html` - Módulo phishing
- `slide-seguridad-fisica.html` - Módulo con quiz
- `slide-servicios-externos.html`
- `slide-links-archivos.html`
- `slide-servidores.html`
- `slide-general.html`
- `video-*.html` (5 archivos) - Versiones con solo video
- `ava.html` - Aula virtual
- `sobre.html`, `contacto.html`

**2 archivos de código:**
- `app.js` - Lógica JavaScript (179 líneas)
- `styles.css` - Estilos (180 líneas)

### 4.3 ¿Cómo funciona el JavaScript (`app.js`)?

#### 4.3.1 Gestión de Sesión

El código revisa si hay alguien logueado:

```javascript
async function checkSessionUI() {
  try {
    const r = await fetch('/api/me');
    const d = await r.json();
    
    if (d.authenticated) {
      // Muestra botón de logout y oculta login
      btnLogout.style.display = 'inline-flex';
      btnLogin.style.display = 'none';
      btnUser.textContent = d.username;
    } else {
      // Muestra botón de login y oculta logout
      btnLogin.style.display = 'inline-flex';
      btnLogout.style.display = 'none';
    }
  } catch {}
}
```

**¿Cuándo se ejecuta?** Al cargar cada página.

#### 4.3.2 Carousel de Testimonios

**¿Qué hace?** Navega testimonios de clientes.

```javascript
function scrollByCard(direction) {
  const card = track.querySelector('.testimonial-card');
  const amount = card ? (card.clientWidth + 28) : 320;
  track.scrollBy({ left: direction * amount, behavior: 'smooth' });
}
```

**¿Cómo funciona?**
- Mide el ancho de una card
- Hace scroll suave por esa cantidad
- Prev (-1): va a la izquierda
- Next (+1): va a la derecha

#### 4.3.3 Sistema de Quiz

**¿Cómo funciona?** Evalúa respuestas localmente (en el navegador, no en el servidor).

**Claves de respuestas (hardcodeadas):**

```javascript
const keys = {
  'seguridad-fisica': { q1:'b', q2:'a', q3:'c', q4:'b', q5:'a', q6:'c', q7:'b', q8:'a', q9:'c', q10:'b' },
  'servicios-externos': { q1:'b', q2:'a', q3:'c', q4:'b', q5:'a', q6:'b', q7:'c', q8:'a', q9:'b', q10:'c' },
  'links-archivos': { q1:'b', q2:'b', q3:'c', q4:'a', q5:'b', q6:'c', q7:'a', q8:'b', q9:'c', q10:'a' },
  'servidores': { q1:'a', q2:'b', q3:'c', q4:'a', q5:'b', q6:'c', q7:'a', q8:'b', q9:'c', q10:'a' },
  'general': { q1:'b', q2:'b', q3:'a', q4:'c', q5:'b', q6:'a', q7:'c', q8:'b', q9:'a', q10:'c' }
};
```

**¿Cómo calcula el score?**

```javascript
let score = 0;
for (const k in keys) {
  if (answers[k] === keys[k]) score++;
}

// Feedback según puntuación
if (score <= 3) msg = 'Nivel bajo. Te invitamos a comenzar con los cursos recomendados.';
else if (score <= 6) msg = 'Nivel medio. ¡Buen progreso!';
else msg = 'Nivel alto. ¡Excelente!';
```

**¿Dónde está definido?** `app.js` líneas 128-152

#### 4.3.4 Formularios

**Formulario de Empresa:**

```javascript
companyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Obtener datos del form
  const formData = new FormData(companyForm);
  const payload = Object.fromEntries(formData.entries());
  
  // Enviar a servidor
  const res = await fetch('/api/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const data = await res.json();
  
  if (res.ok) {
    alert('Enviado ✓');
    form.reset();
    closeModal();
  } else {
    alert('Error: ' + data.error);
  }
});
```

**Formulario de Login:**

```javascript
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const data = Object.fromEntries(new FormData(form).entries());
  
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: data.email, password: data.password })
  });
  
  const j = await res.json();
  
  if (res.ok) {
    window.location.href = '/temas';  // Redirigir
  } else {
    setMsg(j.error || 'Error');
  }
});
```

### 4.4 ¿Cómo funciona el CSS (`styles.css`)?

**Variables CSS (líneas 1-11):**
```css
:root {
  --bg: #0e0e11;          /* Fondo oscuro */
  --card: #1a1625;        /* Color de cards */
  --brand: #7c4dff;       /* Morado principal */
  --text: #e7e7ea;        /* Texto principal */
  --muted: #b7b7c2;       /* Texto secundario */
}
```

**¿Qué es esto?** Colores centralizados que se usan en toda la página.

**Uso:**
```css
.btn-primary {
  background: var(--brand);  /* Usa el morado */
  color: var(--white);
}
```

**Responsive:**
```css
@media (max-width: 960px) {
  .modules-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 720px) {
  .modules-grid { grid-template-columns: 1fr; }
  .main-nav { display: none; }
  .nav-toggle { display: block; }
}
```

**¿Qué hace?**
- En pantallas grandes: 3 columnas
- En tablets (960px): 2 columnas
- En móviles (720px): 1 columna + menú hamburguesa

---

## 5. SERVICIOS EXTERNOS QUE SE USAN

### 5.1 Google Fonts

**URL:** `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800`

**¿Dónde se usa?** En el `<head>` de cada HTML:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
```

**¿Qué hace?** Carga la fuente Inter con pesos 400, 500, 600, 700 y 800.

### 5.2 YouTube

**¿Qué hace?** Muestra videos embebidos en iframes.

**Ejemplo (slide-seguridad-fisica.html):**
```html
<iframe 
  src="https://www.youtube.com/embed/FGNGRvKr6oE" 
  allowfullscreen 
  title="Seguridad física" 
  loading="lazy">
</iframe>
```

**Videos usados:**
- `FGNGRvKr6oE` - Seguridad física
- `lCmazsF3LDg` - Servicios externos
- `TlB-vGW-xLQ` - Links y archivos
- (Otros módulos tienen sus IDs)

### 5.3 Unsplash

**¿Qué hace?** Proporciona imágenes hero gratuitas.

**Ejemplo (index.html):**
```html
<img src="https://images.unsplash.com/photo-1555255707-c07966088b7b?q=80&w=1600&auto=format&fit=crop" alt="Tablero electrónico" />
```

**Parámetros:**
- `q=80` - Calidad 80%
- `w=1600` - Ancho 1600px
- `auto=format` - Formato automático (WebP si compatible)
- `fit=crop` - Recortar para llenar

**¿Por qué se usa?** Imágenes profesionales sin pagar.

### 5.4 Enlaces Externos

Cada módulo tiene enlaces a:
- **Noticias:** Federal News Network, InfoSecurity Watch, Cybersecurity Dive
- **Cursos:** Cybrary, SANS, CDSE, ASIS, Cisco, Virginia Tech

**Ejemplo:**
```html
<a href="https://www.cybrary.it/course/phishing" target="_blank" rel="noopener">
  Cybrary: Phishing
</a>
```

**¿Por qué `target="_blank" rel="noopener"`?**
- `target="_blank"` abre en nueva pestaña
- `rel="noopener"` previene tabnabbing (ataque de seguridad)

---

## 6. ¿CÓMO FUNCIONA EL SISTEMA COMPLETO?

### 6.1 Flujo de Registro

```
1. Usuario llena formulario en login.html
   ↓
2. JavaScript: app.js envía POST /api/register
   ↓
3. Backend: server.js valida campos
   ↓
4. Backend: Verifica email no duplicado
   ↓
5. Backend: Encripta contraseña con Scrypt
   ↓
6. Backend: Guarda usuario en data/db.json
   ↓
7. Backend: Crea token de sesión con HMAC-SHA256
   ↓
8. Backend: Envía cookie al navegador
   ↓
9. Frontend: Redirige a /temas
```

### 6.2 Flujo de Login

```
1. Usuario ingresa email y password
   ↓
2. JavaScript: POST /api/login
   ↓
3. Backend: Busca usuario por email
   ↓
4. Backend: Verifica contraseña con Scrypt
   ↓
5. Si correcto: Crea sesión + cookie
   ↓
6. Frontend: Redirige a /temas
```

### 6.3 Flujo de Acceso Protegido

```
1. Usuario click en "Incluir Empresa"
   ↓
2. JavaScript: Verifica autenticación con GET /api/me
   ↓
3. Si no autenticado: Redirige a login.html
   ↓
4. Si autenticado: Abre modal
   ↓
5. Usuario llena formulario
   ↓
6. JavaScript: POST /api/companies
   ↓
7. Backend: Middleware verifica cookie
   ↓
8. Backend: Valida firma HMAC
   ↓
9. Backend: Responde con datos
```

### 6.4 Flujo de Quiz

```
1. Usuario responde 10 preguntas
   ↓
2. JavaScript: app.js captura respuestas
   ↓
3. JavaScript: Compara con claves hardcodeadas
   ↓
4. JavaScript: Calcula score
   ↓
5. JavaScript: Muestra feedback según puntuación
```

**Importante:** El quiz NO se envía al servidor, todo se hace localmente en el navegador.

---

## 7. RESUMEN TÉCNICO

### 7.1 ¿Qué se usó en el Backend?

| Componente | Tecnología |
|------------|-----------|
| Servidor | Node.js 25.0.0 + Express.js 4.21.1 |
| Base de datos | JSON file-based (no SQL) |
| Autenticación | Cookies HTTP-Only con HMAC-SHA256 |
| Encriptación | Scrypt (crypto nativo de Node.js) |
| Variables de entorno | dotenv |
| Cookies | cookie-parser |
| Body parsing | express.json() |

### 7.2 ¿Qué se usó en el Frontend?

| Componente | Tecnología |
|------------|-----------|
| HTML | HTML5 semántico |
| CSS | CSS3 con custom properties |
| JavaScript | Vanilla JavaScript (sin frameworks) |
| Fuentes | Google Fonts (Inter) |
| Imágenes | Unsplash CDN |
| Videos | YouTube embeds |

### 7.3 ¿Qué hace el sistema?

1. **Registro y login** de usuarios
2. **Temas educativos** con videos y contenido
3. **Quizzes interactivos** con feedback
4. **Enlaces externos** a noticias y cursos
5. **Gestión de perfiles** (cambiar username/password)
6. **Formulario protegido** para empresas

### 7.4 Endpoints API

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| GET | `/api/me` | Estado de sesión | No |
| POST | `/api/register` | Registrar usuario | No |
| POST | `/api/login` | Autenticar usuario | No |
| POST | `/api/logout` | Cerrar sesión | No |
| POST | `/api/companies` | Incluir empresa | **Sí** |
| PUT | `/api/profile` | Actualizar perfil | **Sí** |
| PUT | `/api/password` | Cambiar contraseña | **Sí** |

---

## 8. DEPENDENCIAS DEL PROYECTO

**package.json:**

```json
{
  "dependencies": {
    "bcryptjs": "^2.4.3",           // Declarado pero NO usado
    "cookie-parser": "^1.4.6",      // Para cookies
    "dotenv": "^16.4.5",             // Variables de entorno
    "express": "^4.21.1",            // Framework web
    "google-auth-library": "^9.14.2", // Declarado pero NO usado
    "jsonwebtoken": "^9.0.2"         // Declarado pero NO usado
  },
  "devDependencies": {
    "nodemon": "^3.1.7"              // Auto-reload en desarrollo
  }
}
```

**¿Qué se usa realmente?**
- ✅ `express` - Servidor web
- ✅ `cookie-parser` - Manejo de cookies
- ✅ `dotenv` - Variables de entorno
- ✅ `nodemon` - Desarrollo con auto-reload
- ❌ `bcryptjs` - No se usa (se usa crypto nativo)
- ❌ `google-auth-library` - No se usa
- ❌ `jsonwebtoken` - No se usa (sesiones custom)

---

## 9. INSTRUCCIONES PARA EJECUTAR

### 9.1 Instalación

```bash
cd C:\ProyectosProg\SemInt2
npm install
```

### 9.2 Ejecución

```bash
npm start
```

### 9.3 Acceso

- **URL:** http://localhost:5173
- **API:** http://localhost:5173/api/me

---

## 10. CONCLUSIÓN

Este proyecto usa:
- **Backend:** Node.js + Express con JSON como base de datos
- **Frontend:** HTML/CSS/JavaScript sin frameworks
- **Autenticación:** Cookies con HMAC-SHA256
- **Encriptación:** Scrypt para contraseñas
- **Servicios externos:** Google Fonts, YouTube, Unsplash

**Archivos principales:**
- `server.js` - Backend (177 líneas)
- `app.js` - Frontend JavaScript (179 líneas)
- `styles.css` - Estilos (180 líneas)
- `data/db.json` - Base de datos

No se usaron frameworks de frontend ni bases de datos SQL. Es un sistema simple y funcional.