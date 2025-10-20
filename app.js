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

  async function checkSessionUI(){
    try{
      const r = await fetch('/api/me');
      const d = await r.json();
      if (d.authenticated){
        if (btnLogin) btnLogin.style.display='none';
        if (btnLogout) btnLogout.style.display='inline-flex';
        const cta = document.getElementById('btn-cta');
        if (cta) cta.style.display='none';
        const ctaStartBtn = document.getElementById('cta-start');
        if (ctaStartBtn) ctaStartBtn.style.display='none';
        if (btnUser){ btnUser.style.display='inline-flex'; btnUser.textContent = d.username || d.email; }
      } else {
        if (btnLogin) btnLogin.style.display='inline-flex';
        if (btnLogout) btnLogout.style.display='none';
        const cta = document.getElementById('btn-cta');
        if (cta) cta.style.display='inline-flex';
        const ctaStartBtn = document.getElementById('cta-start');
        if (ctaStartBtn) ctaStartBtn.style.display='inline-flex';
        if (btnUser){ btnUser.style.display='none'; btnUser.textContent=''; }
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
    if (res.ok){ window.location.href = '/modulos'; } else { setMsg(j.error||'Error'); }
  });
  if (btnRegister){ btnRegister.addEventListener('click', async () => {
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.username){ return setMsg('Ingresa un usuario para registrarte'); }
    const res = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email:data.email, username:data.username, password:data.password }) });
    const j = await res.json();
    if (res.ok){ window.location.href = '/modulos'; } else { setMsg(j.error||'Error'); }
  }); }
})();
