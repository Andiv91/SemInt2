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
})();


