// Simple JS for interactions (menu toggle, year, carousel)
(function(){
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const navToggle = document.getElementById('navToggle');
  const mainNav = document.querySelector('.main-nav');
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const visible = getComputedStyle(mainNav).display !== 'none';
      mainNav.style.display = visible ? 'none' : 'block';
    });
  }

  // Testimonials carousel
  const track = document.getElementById('testimonialTrack');
  const prev = document.getElementById('prevTestimonial');
  const next = document.getElementById('nextTestimonial');
  function scrollByCard(direction){
    if (!track) return;
    const card = track.querySelector('.testimonial-card');
    const amount = card ? (card.clientWidth + 28) : 320;
    track.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }
  if (prev) prev.addEventListener('click', () => scrollByCard(-1));
  if (next) next.addEventListener('click', () => scrollByCard(1));

  // Local auth + protected flow
  const btnLogin = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');
  const btnUser = document.getElementById('btn-user');
  const ctaStart = document.getElementById('cta-start');
  const ctaNav = document.getElementById('btn-cta');
  const modal = document.getElementById('modal-company');
  const modalProfile = document.getElementById('modal-profile');
  const form = document.getElementById('companyForm');
  const profileForm = document.getElementById('profileForm');
  const passwordForm = document.getElementById('passwordForm');

  function openModal(){ if (modal){ modal.style.display='block'; modal.setAttribute('aria-hidden','false'); } }
  function closeModal(){ if (modal){ modal.style.display='none'; modal.setAttribute('aria-hidden','true'); } }
  function openProfile(){ if (modalProfile){ modalProfile.style.display='block'; modalProfile.setAttribute('aria-hidden','false'); seedProfile(); } }
  function closeProfile(){ if (modalProfile){ modalProfile.style.display='none'; modalProfile.setAttribute('aria-hidden','true'); } }
  document.querySelectorAll('[data-close]').forEach(el=> el.addEventListener('click', closeModal));
  document.querySelectorAll('[data-close]').forEach(el=> el.addEventListener('click', closeProfile));
  async function seedProfile(){
    try{
      const r = await fetch('/api/me');
      const d = await r.json();
      if (d.authenticated && profileForm){
        const input = profileForm.querySelector('input[name="username"]');
        if (input) input.value = d.username || '';
      }
    }catch{}
  }

  let currentUser = null;
  
  async function checkSessionUI(){
    try{
      const r = await fetch('/api/me');
      const d = await r.json();
      currentUser = d;
      if (d.authenticated){
        if (btnLogin) btnLogin.style.display='none';
        if (btnLogout) btnLogout.style.display='inline-flex';
        const cta = document.getElementById('btn-cta');
        if (cta) cta.style.display='none';
        const ctaStartBtn = document.getElementById('cta-start');
        if (ctaStartBtn) ctaStartBtn.style.display='none';
        if (btnUser){ btnUser.style.display='inline-flex'; btnUser.textContent = d.username || d.email; }
        
        // Mostrar botones de admin si es necesario
        if (d.role && (d.role === 'owner' || d.role === 'admin' || d.role === 'theme_editor' || d.role === 'news_editor' || d.role === 'course_editor')) {
          let adminBtn = document.getElementById('btn-admin');
          if (!adminBtn) {
            // Crear botón si no existe
            const navActions = document.querySelector('.nav-actions');
            if (navActions) {
              adminBtn = document.createElement('a');
              adminBtn.id = 'btn-admin';
              adminBtn.className = 'btn btn-primary';
              adminBtn.href = '/admin';
              adminBtn.textContent = 'Administración';
              navActions.insertBefore(adminBtn, navActions.firstChild);
            }
          } else {
            adminBtn.style.display = 'inline-flex';
          }
        } else {
          const adminBtn = document.getElementById('btn-admin');
          if (adminBtn) adminBtn.style.display = 'none';
        }
      } else {
        if (btnLogin) btnLogin.style.display='inline-flex';
        if (btnLogout) btnLogout.style.display='none';
        const cta = document.getElementById('btn-cta');
        if (cta) cta.style.display='inline-flex';
        const ctaStartBtn = document.getElementById('cta-start');
        if (ctaStartBtn) ctaStartBtn.style.display='inline-flex';
        if (btnUser){ btnUser.style.display='none'; btnUser.textContent=''; }
        const adminBtn = document.getElementById('btn-admin');
        if (adminBtn) adminBtn.style.display = 'none';
      }
    }catch{}
  }

  async function openLogin(){ window.location.href = '/login.html'; }

  if (btnLogin){ btnLogin.addEventListener('click', openLogin); }
  if (btnLogout){ btnLogout.addEventListener('click', async () => { await fetch('/api/logout', {method:'POST'}); await checkSessionUI(); }); }
  if (btnUser){ btnUser.addEventListener('click', openProfile); }
  async function handleProtectedCta(e){
    e.preventDefault();
    const me = await fetch('/api/me').then(r=>r.json()).catch(()=>({authenticated:false}));
    if (!me.authenticated){ return openLogin(); }
    openModal();
  }

  if (ctaStart){ ctaStart.addEventListener('click', handleProtectedCta); }
  if (ctaNav){ ctaNav.addEventListener('click', handleProtectedCta); }
  document.querySelectorAll('a[href="#cta"]').forEach(a => a.addEventListener('click', handleProtectedCta));

  if (form){ form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    const res = await fetch('/api/companies', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const data = await res.json();
    if (res.ok){
      alert('Enviado ✓');
      form.reset();
      closeModal();
    } else {
      alert('Error: ' + (data.error||'desconocido'));
    }
  }); }

  if (profileForm){ profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(profileForm).entries());
    const res = await fetch('/api/profile', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    const j = await res.json();
    if (res.ok){ alert('Perfil actualizado'); closeProfile(); checkSessionUI(); } else { alert('Error: '+(j.error||'desconocido')); }
  }); }

  if (passwordForm){ passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(passwordForm).entries());
    const res = await fetch('/api/password', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    const j = await res.json();
    if (res.ok){ alert('Contraseña actualizada'); passwordForm.reset(); } else { alert('Error: '+(j.error||'desconocido')); }
  }); }

  // Quiz generic handling: score and feedback
  document.querySelectorAll('form.quiz').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const resultEl = form.querySelector('.quiz-result');
      const answers = {};
      new FormData(form).forEach((v, k) => { answers[k] = v; });
      // Simple placeholder key per topic (2 preguntas por demo)
      const topic = form.getAttribute('data-topic');
      const keys = {
        'seguridad-fisica': { q1:'b', q2:'a', q3:'c', q4:'b', q5:'a', q6:'c', q7:'b', q8:'a', q9:'c', q10:'b' },
        'servicios-externos': { q1:'b', q2:'a', q3:'c', q4:'b', q5:'a', q6:'b', q7:'c', q8:'a', q9:'b', q10:'c' },
        'links-archivos': { q1:'b', q2:'b', q3:'c', q4:'a', q5:'b', q6:'c', q7:'a', q8:'b', q9:'c', q10:'a' },
        'servidores': { q1:'a', q2:'b', q3:'c', q4:'a', q5:'b', q6:'c', q7:'a', q8:'b', q9:'c', q10:'a' },
        'general': { q1:'b', q2:'b', q3:'a', q4:'c', q5:'b', q6:'a', q7:'c', q8:'b', q9:'a', q10:'c' }
      }[topic] || {};
      let score = 0, total = Object.keys(keys).length;
      for (const k in keys){ if (answers[k] === keys[k]) score++; }
      let msg = `Resultado: ${score}/${total}. `;
      if (score <= 3) msg += 'Nivel bajo. Te invitamos a comenzar con los cursos recomendados y el video del tema.';
      else if (score <= 6) msg += 'Nivel medio. ¡Buen progreso! Refuerza con los cursos recomendados para afianzar conceptos.';
      else msg += 'Nivel alto. ¡Excelente! Si deseas profundizar más, explora los cursos recomendados.';
      if (resultEl) resultEl.textContent = msg;
    });
  });

  checkSessionUI();
})();

// Login page JS
(function(){
  const form = document.getElementById('loginForm');
  const btnRegister = document.getElementById('btnRegister');
  const msg = document.getElementById('loginMsg');
  if (!form) return;
  function setMsg(t){ if (msg) msg.textContent = t || ''; }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email:data.email, password:data.password }) });
    const j = await res.json();
    if (res.ok){ 
      console.log('Login exitoso. Rol:', j.role);
      window.location.href = '/temas'; 
    } else { setMsg(j.error||'Error'); }
  });
  if (btnRegister){ btnRegister.addEventListener('click', async () => {
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.username){ return setMsg('Ingresa un usuario para registrarte'); }
    const res = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email:data.email, username:data.username, password:data.password }) });
    const j = await res.json();
    if (res.ok){ 
      console.log('Registro exitoso. Rol:', j.role);
      window.location.href = '/temas'; 
    } else { setMsg(j.error||'Error'); }
  }); }
})();
