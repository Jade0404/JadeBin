/* ===== main.js ===== */

/* Active nav link */
(function () {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href').split('/').pop();
    if (href === path) a.classList.add('active');
    else a.classList.remove('active');
  });
})();

/* Scroll reveal */
function checkReveal() {
  document.querySelectorAll('.reveal').forEach(el => {
    if (el.getBoundingClientRect().top < window.innerHeight - 80)
      el.classList.add('visible');
  });
}
window.addEventListener('scroll', checkReveal, { passive: true });
setTimeout(checkReveal, 200);
