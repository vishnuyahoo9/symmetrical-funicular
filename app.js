/* ========================================================
   app.js — updated: inline small-top toggle + collapsed thin nav
   - Maintains all previous behavior (expanded card observer, rAF-driven visibility engine, Read More toggles)
   - Nav now supports collapsed thin-column state (~50px) and an inline small-square toggle at top-right of the nav
   - Consolidated passive tracker and removed duplicate DOMContentLoaded handler
   - Made nav-toggle-inline the single source of truth for toggling navigation; set aria attributes and consolidated nav buttons
   - Restored visibility of the three integrated nav buttons by ensuring 'btn-visible' is applied
   ======================================================== */

const DEBUG = false; // toggle to true for console debug

/* ----------------------
   1) Basic config & helpers
   ---------------------- */
const log = (...args) => { if (DEBUG) console.debug('[app.js]', ...args); };

const now = () => (new Date()).getTime();
const getScrollTop = () => (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0);
const prefersReducedMotion = () => (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

let lastKnownScrollY = 0;
let rafScheduled = false;
let ignoreSnapUntil = 0; // guard for programmatic scrolls

const safeScrollTo = ({ top = 0, behavior = 'smooth' } = {}) => {
  const finalTop = Math.round(top || 0);
  if (prefersReducedMotion()) {
    window.scrollTo(0, finalTop);
  } else {
    try {
      window.scrollTo({ top: finalTop, behavior });
    } catch (err) {
      window.scrollTo(0, finalTop);
    }
  }
  ignoreSnapUntil = now() + 700;
};

/* ----------------------
   2) UI globals
   ---------------------- */
let scrollTopBtn = null;
let scrollTopTwoBtn = null;
let scrollTopThreeBtn = null;
let scrollTopFourBtn = null;
let navMenuStack = null;
let navToggleInline = null;

let currentExpandedCardElement = null;
let expandedObserver = null;
let userClosedNav = false;

/* ----------------------
   3) Visibility helpers (sync both controls consistently)
   ---------------------- */
const showControls = () => {
  scrollTopBtn?.classList.add('btn-visible');
  // ensure integrated nav buttons are visible when controls shown
  scrollTopTwoBtn?.classList.add('btn-visible');
  scrollTopThreeBtn?.classList.add('btn-visible');
  scrollTopFourBtn?.classList.add('btn-visible');

  if (navMenuStack && !userClosedNav) {
    navMenuStack.classList.remove('collapsed', 'stack-hidden', 'stack-hidden-force');
    navMenuStack.classList.add('stack-visible');
    document.body.classList.remove('nav-collapsed');
    document.body.classList.add('nav-visible');
    // ensure CSS var is set to expanded width
    document.body.style.setProperty('--nav-current-width', getComputedStyle(document.documentElement).getPropertyValue('--nav-width') || '308px');
    // accessibility
    navMenuStack.setAttribute('aria-hidden', 'false');
    if (navToggleInline) navToggleInline.setAttribute('aria-expanded', 'true');
  }
};

const hideControlsTemporarily = () => {
  scrollTopBtn?.classList.remove('btn-visible');
  // hide integrated nav buttons when controls hidden
  scrollTopTwoBtn?.classList.remove('btn-visible');
  scrollTopThreeBtn?.classList.remove('btn-visible');
  scrollTopFourBtn?.classList.remove('btn-visible');

  if (navMenuStack && !userClosedNav) {
    // temporarily hide (not collapsed) to avoid UI overlap
    navMenuStack.classList.remove('stack-visible');
    navMenuStack.classList.add('stack-hidden');
  }
};

/* ----------------------
   4) runVisibilityEngine: rAF-driven state reconciliation
   ---------------------- */
const runVisibilityEngine = () => {
  const scrollPos = lastKnownScrollY;
  const winH = window.innerHeight;
  const splash = document.getElementById('dashboard-splash-wrapper');

  // Splash fade behavior
  if (splash) {
    if (scrollPos <= winH) {
      const opacity = 1 - (scrollPos / winH);
      splash.style.opacity = String(opacity);
      splash.style.visibility = 'visible';
      splash.style.pointerEvents = 'auto';
    } else {
      splash.style.opacity = '0';
      splash.style.visibility = 'hidden';
      splash.style.pointerEvents = 'none';
    }
  }

  // Prioritize expanded card visibility
  if (currentExpandedCardElement) {
    const rect = currentExpandedCardElement.getBoundingClientRect();
    const fullyOut = (rect.bottom < 0 || rect.top > winH);
    if (!fullyOut) {
      // still visible -> hide controls (temporary)
      hideControlsTemporarily();
      return;
    } else {
      // out of view -> show controls (unless user explicitly closed)
      showControls();
      return;
    }
  }

  // Default behavior based on scroll position
  if (scrollPos > winH * 0.88) {
    showControls();
  } else {
    // near top
    scrollTopBtn?.classList.remove('btn-visible');
    // also ensure integrated buttons are hidden near top
    scrollTopTwoBtn?.classList.remove('btn-visible');
    scrollTopThreeBtn?.classList.remove('btn-visible');
    scrollTopFourBtn?.classList.remove('btn-visible');

    if (navMenuStack && !userClosedNav) {
      navMenuStack.classList.remove('stack-visible');
      navMenuStack.classList.add('stack-hidden');
    }
  }
};

/* ----------------------
   5) Scroll handler (rAF-throttled)
   ---------------------- */
const onScroll = () => {
  lastKnownScrollY = getScrollTop();
  if (!rafScheduled) {
    rafScheduled = true;
    window.requestAnimationFrame(() => {
      runVisibilityEngine();
      rafScheduled = false;
    });
  }
  // intentionally NOT auto-snapping to nearest on scroll
};

/* ----------------------
   6) IntersectionObserver for expanded card
   ---------------------- */
const initExpandedObserver = () => {
  if (typeof IntersectionObserver === 'undefined') return;
  if (expandedObserver) return;

  expandedObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!currentExpandedCardElement || entry.target !== currentExpandedCardElement) return;

      const outOfView = !entry.isIntersecting || entry.intersectionRatio < 0.05;
      if (outOfView) {
        log('observer: expanded out of view -> show controls');
        showControls();
      } else {
        log('observer: expanded in view -> hide controls temporarily');
        hideControlsTemporarily();
      }
    });
  }, { root: null, rootMargin: '0px', threshold: [0, 0.01, 0.05, 0.25, 0.5, 1] });
};

/* ----------------------
   7) Navigation controls init (robust ensureBtn)
   - toggle is a small box at top-right of the nav bar ('.nav-toggle-inline')
   - collapsing the nav applies class 'collapsed' to the nav to show thin column
   ---------------------- */
const initializeNavigationControls = () => {
  // Primary scroll-top button
  if (!document.querySelector('.scroll-top-btn')) {
    scrollTopBtn = document.createElement('button');
    scrollTopBtn.className = 'scroll-top-btn';
    scrollTopBtn.setAttribute('aria-label', 'Scroll to Top');
    document.body.appendChild(scrollTopBtn);
  } else {
    scrollTopBtn = document.querySelector('.scroll-top-btn');
  }

  // Nav stack container (if present in DOM use it, otherwise create)
  navMenuStack = document.querySelector('.left-nav-menu-stack');
  if (!navMenuStack) {
    navMenuStack = document.createElement('div');
    navMenuStack.className = 'left-nav-menu-stack';
    document.body.appendChild(navMenuStack);
  } else {
    // ensure starting classes
    navMenuStack.classList.remove('stack-hidden');
  }

  // Ensure nav toggle inline (small box top-right inside the nav) — single source of truth
  navToggleInline = navMenuStack.querySelector('.nav-toggle-inline');
  if (!navToggleInline) {
    navToggleInline = document.createElement('button');
    navToggleInline.className = 'nav-toggle-inline';
    navToggleInline.setAttribute('aria-label', 'Toggle navigation');
    navToggleInline.setAttribute('title', 'Show / Hide');
    navToggleInline.setAttribute('aria-expanded', 'false');
    navToggleInline.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="9" y1="3" x2="9" y2="21"></line>
      </svg>
    `; // clean geometric icon
    // positioned into nav: top-right
    navMenuStack.appendChild(navToggleInline);
  }
  // create backdrop used to dim page and close nav on outside click
  let backdrop = document.querySelector('.left-nav-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'left-nav-backdrop';
    document.body.appendChild(backdrop);
  }

  // helper to show/hide backdrop when nav open/closed
  const updateBackdrop = () => {
    if (!backdrop) return;
    if (navMenuStack.classList.contains('collapsed')) {
      backdrop.classList.remove('visible');
    } else {
      backdrop.classList.add('visible');
    }
  };

  // ensure we update backdrop when user toggles nav
  navToggleInline.addEventListener('click', (e) => {
    // small delay to let classes update
    setTimeout(updateBackdrop, 40);
  });

  // clicking backdrop closes nav (familiar cloud dashboard UX)
  backdrop.addEventListener('click', (e) => {
    if (navMenuStack && !navMenuStack.classList.contains('collapsed')) {
      navMenuStack.classList.add('collapsed');
      document.body.classList.remove('nav-visible');
      document.body.classList.add('nav-collapsed');
      navMenuStack.setAttribute('aria-hidden', 'true');
      if (navToggleInline) navToggleInline.setAttribute('aria-expanded', 'false');
      updateBackdrop();
    }
  });

  // Toggle function: switch between collapsed narrow strip and expanded nav
  const toggleNavVisibility = (forceState) => {
    // forceState: true->expand, false->collapse, undefined->toggle
    const isCollapsed = navMenuStack.classList.contains('collapsed');
    const shouldExpand = (typeof forceState === 'boolean') ? forceState : isCollapsed;

    if (shouldExpand) {
      // expand
      navMenuStack.classList.remove('collapsed', 'stack-hidden');
      navMenuStack.classList.add('stack-visible');
      document.body.classList.remove('nav-collapsed');
      document.body.classList.add('nav-visible');
      navToggleInline.classList.remove('collapsed');
      userClosedNav = false;
      // sync CSS var
      document.body.style.setProperty('--nav-current-width', getComputedStyle(document.documentElement).getPropertyValue('--nav-width') || '308px');
      navMenuStack.setAttribute('aria-hidden', 'false');
      navToggleInline.setAttribute('aria-expanded', 'true');
      log('nav -> expanded');
    } else {
      // collapse to thin column (50px)
      navMenuStack.classList.remove('stack-visible');
      navMenuStack.classList.add('collapsed');
      document.body.classList.remove('nav-visible');
      document.body.classList.add('nav-collapsed');
      navToggleInline.classList.add('collapsed');
      userClosedNav = true;
      // set CSS var to collapsed width (50px)
      document.body.style.setProperty('--nav-current-width', getComputedStyle(document.documentElement).getPropertyValue('--nav-collapsed-width') || '50px');
      navMenuStack.setAttribute('aria-hidden', 'true');
      navToggleInline.setAttribute('aria-expanded', 'false');
      log('nav -> collapsed');
    }
  };

  navToggleInline.addEventListener('click', (e) => {
    e.preventDefault();
    toggleNavVisibility();
  });

  // Helper: find-or-create button, attach handler once, ensure it lives inside navMenuStack
  const ensureBtn = (className, handler, labelText = '', iconChar = '') => {
    let btn = navMenuStack.querySelector(`.${className}`) || document.querySelector(`.${className}`);
    if (!btn) {
      btn = document.createElement('button');
      btn.className = `${className} nav-item-action-link btn-visible`;
      if (labelText) btn.setAttribute('aria-label', labelText);
      btn.setAttribute('type', 'button');
      // Simple text content instead of nested divs for proper CSS alignment
      btn.textContent = `${iconChar} ${labelText}`;
      navMenuStack.appendChild(btn);
    } else {
      // move into nav stack if somewhere else
      if (navMenuStack && btn.parentElement !== navMenuStack) {
        navMenuStack.appendChild(btn);
      }
      // ensure text/icon present
      if (!btn.textContent.trim()) {
        btn.textContent = `${iconChar} ${labelText}`;
      }
      // make visible if it exists but isn't
      btn.classList.add('btn-visible');
    }

    // Attach handler once
    if (!btn.dataset.hasHandler) {
      btn.addEventListener('click', handler);
      btn.dataset.hasHandler = '1';
    }

    // Ensure it's clickable
    btn.style.pointerEvents = 'auto';
    return btn;
  };

  const scrollToSection = (selector, fallbackText) => {
    let target = selector ? document.querySelector(selector) : null;
    if (!target && fallbackText) {
      target = Array.from(document.querySelectorAll('h1,h2,h3'))
        .find(h => (h.textContent || '').toLowerCase().includes(fallbackText.toLowerCase()))
        ?.closest('.section-wrapper');
    }
    if (target) {
      const absoluteTop = getScrollTop() + target.getBoundingClientRect().top;
      safeScrollTo({ top: Math.max(0, absoluteTop - 20), behavior: 'smooth' });
      // auto-collapse nav when a section is selected for cleaner UX
      if (navMenuStack) {
        navMenuStack.classList.add('collapsed');
        document.body.classList.remove('nav-visible');
        document.body.classList.add('nav-collapsed');
        navMenuStack.setAttribute('aria-hidden', 'true');
        if (navToggleInline) navToggleInline.setAttribute('aria-expanded', 'false');
      }
    }
  };

  // Create three integrated nav buttons (icons + text) — only three, no duplicates
  scrollTopTwoBtn = ensureBtn('scroll-top-two-btn', () => scrollToSection('#aviation-section', 'aviation'), 'Aviation', '✈');
  scrollTopThreeBtn = ensureBtn('scroll-top-three-btn', () => scrollToSection('#hydrogen-section', 'hydrogen'), 'Hydrogen', '⚡');
  scrollTopFourBtn = ensureBtn('scroll-top-four-btn', () => scrollToSection('#infrastructure-section', 'infrastructure'), 'Infrastructure', 'AI');

  // Ensure primary scrollTopBtn has handler too
  if (scrollTopBtn && !scrollTopBtn.dataset.hasHandler) {
    scrollTopBtn.addEventListener('click', () => safeScrollTo({ top: 0, behavior: 'smooth' }));
    scrollTopBtn.dataset.hasHandler = '1';
    scrollTopBtn.style.pointerEvents = 'auto';
  }

  // Default: set nav to expanded and CSS var accordingly (unless user previously collapsed)
  if (!navMenuStack.classList.contains('collapsed')) {
    document.body.classList.add('nav-visible');
    document.body.style.setProperty('--nav-current-width', getComputedStyle(document.documentElement).getPropertyValue('--nav-width') || '308px');
    navMenuStack.setAttribute('aria-hidden', 'false');
    if (navToggleInline) navToggleInline.setAttribute('aria-expanded', 'true');
  } else {
    document.body.classList.add('nav-collapsed');
    document.body.style.setProperty('--nav-current-width', getComputedStyle(document.documentElement).getPropertyValue('--nav-collapsed-width') || '50px');
    navMenuStack.setAttribute('aria-hidden', 'true');
    if (navToggleInline) navToggleInline.setAttribute('aria-expanded', 'false');
  }
};

/* ----------------------
   8) Accordion (Read More / Read Less) setup
   - dataset.expanded used for clear state
   - unobserve previous expanded element before observing new
   ---------------------- */
const setupCardAccordions = () => {
  const sections = document.querySelectorAll('.section-wrapper');
  sections.forEach(section => {
    const listContainer = section.querySelector('.collapsible-pipeline-list');
    if (!listContainer) return;

    const listItems = listContainer.querySelectorAll('li');
    if (listItems.length <= 3) return;

    if (section.querySelector('.pipeline-toggle-btn')) return;

    for (let i = 3; i < listItems.length; i++) listItems[i].classList.add('row-collapsed-node');

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'pipeline-toggle-btn';
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.innerHTML = '<span>+ Read More</span>';
    section.appendChild(toggleBtn);

    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isExpanded = toggleBtn.classList.contains('expanded');

      if (isExpanded) {
        // COLLAPSE
        for (let i = 3; i < listItems.length; i++) listItems[i].classList.add('row-collapsed-node');
        toggleBtn.classList.remove('expanded');
        toggleBtn.innerHTML = '<span>+ Read More</span>';
        toggleBtn.setAttribute('aria-expanded', 'false');

        // Unobserve if needed
        if (expandedObserver) {
          try { expandedObserver.unobserve(section); } catch (er) { /* ignore */ }
        }

        if (currentExpandedCardElement === section) currentExpandedCardElement = null;
        section.dataset.expanded = 'false';

        // Restore nav & controls immediately on Read Less
        if (navMenuStack) {
          navMenuStack.classList.remove('stack-hidden-force', 'stack-hidden');
          navMenuStack.classList.add('stack-visible');
          navMenuStack.setAttribute('aria-hidden', 'false');
          if (navToggleInline) navToggleInline.setAttribute('aria-expanded', 'true');
        }
        userClosedNav = false;
        scrollTopBtn?.classList.add('btn-visible');

        // Smooth scroll to the section top
        const cur = getScrollTop();
        const top = cur + section.getBoundingClientRect().top;
        safeScrollTo({ top: Math.max(0, top - 20), behavior: 'smooth' });

        setTimeout(() => runVisibilityEngine(), 80);
      } else {
        // EXPAND
        // Collapse any other expanded section first
        if (currentExpandedCardElement && currentExpandedCardElement !== section) {
          try {
            currentExpandedCardElement.dataset.expanded = 'false';
            if (expandedObserver) expandedObserver.unobserve(currentExpandedCardElement);
          } catch (er) { /* ignore */ }
          currentExpandedCardElement = null;
        }

        for (let i = 3; i < listItems.length; i++) listItems[i].classList.remove('row-collapsed-node');
        toggleBtn.classList.add('expanded');
        toggleBtn.innerHTML = '<span>- Read Less</span>';
        toggleBtn.setAttribute('aria-expanded', 'true');

        section.dataset.expanded = 'true';
        currentExpandedCardElement = section;

        // Hide controls immediately while viewing expanded card (unless user explicitly closed)
        if (navMenuStack && !userClosedNav) {
          navMenuStack.classList.remove('stack-visible');
          navMenuStack.classList.add('stack-hidden');
        }
        scrollTopBtn?.classList.remove('btn-visible');

        // Observe this section
        if (expandedObserver) {
          try { expandedObserver.observe(section); } catch (er) { /* ignore */ }
        }

        setTimeout(() => {
          const targetTop = getScrollTop() + section.getBoundingClientRect().top;
          safeScrollTo({ top: Math.max(0, targetTop - 20), behavior: 'smooth' });
          setTimeout(() => runVisibilityEngine(), 60);
        }, 50);
      }
    });
  });
};

/* ----------------------
   9) snapToNearest helper (kept but not auto-called on scroll)
   ---------------------- */
const snapToNearest = () => {
  if (now() < (ignoreSnapUntil || 0)) return;
  const snapPoints = Array.from(document.querySelectorAll('[data-snap-point]'));
  if (!snapPoints.length) return;

  const currentScroll = getScrollTop();
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  if (currentScroll >= (maxScroll - 32)) return; // don't force bottom snap

  const viewportCenterAbs = currentScroll + (window.innerHeight / 2);
  let bestEl = null;
  let bestDist = Infinity;

  for (const el of snapPoints) {
    if (el.classList && (el.classList.contains('footer-bleed-container') || el.closest('.footer-bleed-container'))) continue;
    const rect = el.getBoundingClientRect();
    if (!rect || rect.height === 0) continue;
    const absTop = currentScroll + rect.top;
    const elCenterAbs = absTop + rect.height / 2;
    const dist = Math.abs(elCenterAbs - viewportCenterAbs);
    if (dist < bestDist) { bestDist = dist; bestEl = el; }
  }

  if (!bestEl) return;
  const chosenRect = bestEl.getBoundingClientRect();
  const finalTop = Math.max(0, Math.min(currentScroll + chosenRect.top, maxScroll));
  if (Math.abs(finalTop - currentScroll) > 8) {
    if (prefersReducedMotion()) window.scrollTo(0, finalTop);
    else safeScrollTo({ top: finalTop, behavior: 'smooth' });
  }
};

/* ----------------------
   10) Mount: DOMContentLoaded wiring
   ---------------------- */
document.addEventListener('DOMContentLoaded', () => {
  initExpandedObserver();
  initializeNavigationControls();
  setupCardAccordions();

  lastKnownScrollY = getScrollTop();
  runVisibilityEngine();

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { lastKnownScrollY = getScrollTop(); runVisibilityEngine(); });

  // Splash click behaviour kept
  const splash = document.getElementById('dashboard-splash-wrapper');
  if (splash) {
    splash.addEventListener('click', () => {
      const header = document.getElementById('live-header-anchor');
      if (header) {
        const absoluteTop = getScrollTop() + header.getBoundingClientRect().top;
        ignoreSnapUntil = now() + 900;
        safeScrollTo({ top: Math.max(0, absoluteTop), behavior: 'smooth' });
      }
    });
  }

  // guard for internal anchor clicks
  document.body.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (a) ignoreSnapUntil = now() + 800;
  }, { passive: true });

  // Passive viewport tracker: keep splash/nav sync but avoid duplicating toggle creation
  (function() {
    const splashWrapper = document.getElementById('dashboard-splash-wrapper');
    if (!navMenuStack) return; // nothing to do

    const syncSplashStateWithScroll = () => {
      if (!splashWrapper) return;
      const splashBounding = splashWrapper.getBoundingClientRect();

      if (splashBounding.bottom > 50) {
        document.body.classList.add('splash-in-view');
        document.body.classList.remove('nav-visible', 'nav-collapsed');
      } else {
        document.body.classList.remove('splash-in-view');
        if (navMenuStack.classList.contains('collapsed')) {
          document.body.classList.remove('nav-visible');
          document.body.classList.add('nav-collapsed');
          navMenuStack.setAttribute('aria-hidden', 'true');
          if (navToggleInline) navToggleInline.setAttribute('aria-expanded', 'false');
        } else {
          document.body.classList.remove('nav-collapsed');
          document.body.classList.add('nav-visible');
          navMenuStack.setAttribute('aria-hidden', 'false');
          if (navToggleInline) navToggleInline.setAttribute('aria-expanded', 'true');
        }
      }
    };

    syncSplashStateWithScroll();
    window.addEventListener('scroll', syncSplashStateWithScroll, { passive: true });

  })();

  // cleanup
  window.addEventListener('beforeunload', () => {
    if (expandedObserver) {
      try { expandedObserver.disconnect(); } catch (e) { /* ignore */ }
      expandedObserver = null;
    }
  });
});