/* ===== SOCKR Documentation — main.js ===== */

/* ─── Theme ──────────────────────────────────────────────── */
(function initTheme() {
  const saved = localStorage.getItem('sockr-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
})();

document.addEventListener('DOMContentLoaded', () => {

  /* ─── Theme toggle ──────────────────────────────────────── */
  const themeBtn = document.querySelector('.theme-btn');
  if (themeBtn) {
    const updateIcon = () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      themeBtn.textContent = isLight ? '☽' : '☀︎';
      themeBtn.setAttribute('title', isLight ? 'Switch to dark mode' : 'Switch to light mode');
    };
    updateIcon();
    themeBtn.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('sockr-theme', 'dark');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('sockr-theme', 'light');
      }
      updateIcon();
    });
  }

  /* ─── Hamburger / Mobile Menu ───────────────────────────── */
  const hamburger = document.querySelector('.hamburger');
  const mobileMenu = document.querySelector('.mobile-menu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
      const isOpen = mobileMenu.classList.contains('open');
      hamburger.setAttribute('aria-expanded', isOpen);
    });
    document.addEventListener('click', (e) => {
      if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
        mobileMenu.classList.remove('open');
      }
    });
  }

  /* ─── Active Nav Link ───────────────────────────────────── */
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === path || (path === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  /* ─── Copy Code Buttons ─────────────────────────────────── */
  document.querySelectorAll('pre').forEach(pre => {
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'copy';
    pre.appendChild(btn);

    btn.addEventListener('click', async () => {
      const code = pre.querySelector('code');
      const text = code ? code.textContent : pre.textContent.replace(/copy$/, '').trim();
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = '✓ copied';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'copy';
          btn.classList.remove('copied');
        }, 2000);
      } catch {
        btn.textContent = 'error';
        setTimeout(() => { btn.textContent = 'copy'; }, 2000);
      }
    });
  });

  /* ─── Fade-in on scroll ─────────────────────────────────── */
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

  /* ─── Install tabs ──────────────────────────────────────── */
  document.querySelectorAll('.install-tabs').forEach(tabGroup => {
    const tabs = tabGroup.querySelectorAll('.install-tab');
    const block = tabGroup.closest('.install-block');
    const panels = block ? block.querySelectorAll('.install-panel') : [];

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        if (panels[i]) panels[i].classList.add('active');
      });
    });
  });

  /* ─── Sidebar active link on scroll ────────────────────── */
  const headings = document.querySelectorAll('.doc-content h2, .doc-content h3');
  const sidebarLinks = document.querySelectorAll('.sidebar-link');

  if (headings.length && sidebarLinks.length) {
    const headingObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          sidebarLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
          });
        }
      });
    }, { rootMargin: '-80px 0px -70% 0px' });

    headings.forEach(h => {
      if (h.id) headingObserver.observe(h);
    });
  }

});
