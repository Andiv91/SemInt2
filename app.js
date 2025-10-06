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

  // Google Identity + protected flow
  let configLoaded = false;
  let googleClientId = null;
  const btnLogin = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');
  const ctaStart = document.getElementById('cta-start');
  const ctaNav = document.getElementById('btn-cta');
  const modal = document.getElementById('modal-company');
  const form = document.getElementById('companyForm');

  function openModal(){ if (modal){ modal.style.display='block'; modal.setAttribute('aria-hidden','false'); } }
  function closeModal(){ if (modal){ modal.style.display='none'; modal.setAttribute('aria-hidden','true'); } }
  document.querySelectorAll('[data-close]').forEach(el=> el.addEventListener('click', closeModal));

  async function loadConfig(){
    if (configLoaded) return;
    try {
      const res = await fetch('/config');
      const data = await res.json();
      window.__CONFIG__ = data;
      googleClientId = data.googleClientId;
      configLoaded = true;
    } catch (e) {
      console.error('Config load failed', e);
    }
  }

  async function checkSessionUI(){
    try{
      const r = await fetch('/api/me');
      const d = await r.json();
      if (d.authenticated){
        if (btnLogin) btnLogin.style.display='none';
        if (btnLogout) btnLogout.style.display='inline-flex';
      } else {
        if (btnLogin) btnLogin.style.display='inline-flex';
        if (btnLogout) btnLogout.style.display='none';
      }
    }catch{}
  }

  async function ensureConfigAndGis(){
    await loadConfig();
    // wait for GIS script
    if (!window.google || !window.google.accounts || !window.google.accounts.id){
      await new Promise(resolve => {
        const id = setInterval(()=>{
          if (window.google && window.google.accounts && window.google.accounts.id){
            clearInterval(id); resolve();
          }
        }, 50);
      });
    }
  }

  async function signIn(){
    await ensureConfigAndGis();
    if (!googleClientId){
      alert('Falta configurar GOOGLE_CLIENT_ID');
      throw new Error('missing_client_id');
    }
    return new Promise((resolve, reject) => {
      try{
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response) => {
            try {
              const res = await fetch('/api/login', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ idToken: response.credential })
              });
              const data = await res.json();
              if (!res.ok){
                alert('Acceso restringido a @ufps.edu.co');
                return reject(new Error(data.error||'login_failed'));
              }
              resolve(data);
            } catch (e) { reject(e); }
          },
          ux_mode: 'popup',
          auto_select: false
        });
        // Mostrar One Tap / selector de cuenta sin alertas adicionales
        window.google.accounts.id.prompt();
      }catch(e){ reject(e); }
    });
  }

  if (btnLogin){ btnLogin.addEventListener('click', async () => { await signIn(); await checkSessionUI(); }); }
  if (btnLogout){ btnLogout.addEventListener('click', async () => { await fetch('/api/logout', {method:'POST'}); await checkSessionUI(); }); }
  async function handleProtectedCta(e){
    e.preventDefault();
    const me = await fetch('/api/me').then(r=>r.json()).catch(()=>({authenticated:false}));
    if (!me.authenticated){
      try { await signIn(); } catch {}
      const me2 = await fetch('/api/me').then(r=>r.json()).catch(()=>({authenticated:false}));
      if (!me2.authenticated){ return; }
    }
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

  checkSessionUI();
})();


