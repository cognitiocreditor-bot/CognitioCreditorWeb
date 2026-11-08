/**
 * MÓDULO DE MOVIMIENTO Y MICRO-INTERACCIONES — COGNITIO CREDITOR
 * Estándar: Emil Kowalski & Linear Design Engineering
 * Implementación de alto rendimiento: Entradas escalonadas (Stagger),
 * elevación física de tarjetas, microinteracciones táctiles y
 * pestañas con indicador flotante deslizante (layoutId="activeIndicator").
 */

export const MotionOrchestrator = {
  /**
   * Inicializa todos los sistemas de animación en el DOM.
   */
  init() {
    this.initStaggerReveals();
    this.initFloatingNavIndicator();
    this.initProofPillIndicator();
    this.initButtonHaptics();
  },

  /**
   * 1. ENTRADAS FLUIDAS Y ESCALONADAS (Staggered Reveal)
   * Observa contenedores y aplica entrada física con spring curve y staggerChildren: 0.08s
   */
  initStaggerReveals() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const staggerContainers = document.querySelectorAll(
      '.hero-content, .institutional-grid, .events-grid, .social-hub-grid, .faq-accordion, [data-motion-stagger]'
    );

    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -40px 0px',
      threshold: 0.12
    };

    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.staggerChildren(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    staggerContainers.forEach(container => {
      // Asignar estado inicial a elementos hijos
      this.prepareStaggerChildren(container);
      revealObserver.observe(container);
    });
  },

  /**
   * Prepara los hijos para el reveal escalonado { initial: { opacity: 0, y: 16 } }
   * @param {HTMLElement} container
   */
  prepareStaggerChildren(container) {
    const children = Array.from(container.children).filter(el => {
      // Ignorar indicadores absolutos u overlays
      return !el.classList.contains('nav-active-indicator') &&
             !el.classList.contains('proof-pill-indicator') &&
             !el.getAttribute('aria-hidden');
    });

    children.forEach((child, index) => {
      child.classList.add('motion-stagger-item');
      child.style.setProperty('--stagger-index', index);
    });
  },

  /**
   * Dispara la animación escalonada con física spring { animate: { opacity: 1, y: 0 } }
   * @param {HTMLElement} container
   */
  staggerChildren(container) {
    container.classList.add('motion-stagger-active');
  },

  /**
   * Permite re-animar contenedores dinámicos (ej. cuando cargan eventos de la API)
   * @param {HTMLElement|string} target
   */
  animateDynamicGrid(target) {
    const container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!container) return;

    this.prepareStaggerChildren(container);
    // Micro-delay para permitir repintado inicial
    requestAnimationFrame(() => {
      this.staggerChildren(container);
    });
  },

  /**
   * 4. INDICADOR FLOTANTE EN NAVEGACIÓN (layoutId="activeIndicator")
   * Desliza fluidamente una cápsula activa detrás de los enlaces al pasar el cursor o cambiar de sección.
   */
  initFloatingNavIndicator() {
    const nav = document.querySelector('.nav-desktop');
    if (!nav) return;

    // Crear indicador si no existe
    let indicator = nav.querySelector('.nav-active-indicator');
    if (!indicator) {
      indicator = document.createElement('span');
      indicator.className = 'nav-active-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      nav.appendChild(indicator);
    }

    const navLinks = Array.from(nav.querySelectorAll('.nav-link:not(.btn)'));

    const moveIndicatorTo = (target) => {
      if (!target) {
        indicator.style.opacity = '0';
        return;
      }
      const navRect = nav.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      const left = targetRect.left - navRect.left;
      const width = targetRect.width;
      const height = targetRect.height;
      const top = targetRect.top - navRect.top;

      indicator.style.opacity = '1';
      indicator.style.width = `${width}px`;
      indicator.style.height = `${height}px`;
      indicator.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    };

    // Posicionar en el elemento activo inicial
    const currentActive = nav.querySelector('.nav-link.active') || navLinks[0];
    if (currentActive) {
      // Esperar render de fuentes para cálculo exacto de ancho
      setTimeout(() => moveIndicatorTo(currentActive), 80);
    }

    // Efecto magnético hover (Emil Kowalski / Linear navigation style)
    navLinks.forEach(link => {
      link.addEventListener('mouseenter', () => moveIndicatorTo(link));
      link.addEventListener('focus', () => moveIndicatorTo(link));
      link.addEventListener('click', () => {
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        moveIndicatorTo(link);
      });
    });

    nav.addEventListener('mouseleave', () => {
      const activeLink = nav.querySelector('.nav-link.active');
      moveIndicatorTo(activeLink);
    });

    window.addEventListener('resize', () => {
      const activeLink = nav.querySelector('.nav-link.active');
      moveIndicatorTo(activeLink);
    });
  },

  /**
   * 4b. INDICADOR FLOTANTE EN PESTAÑAS DEMO (proof-pill-nav)
   * Desliza fluidamente la píldora blanca activa al alternar entre muestras.
   */
  initProofPillIndicator() {
    const pillNav = document.querySelector('.proof-pill-nav');
    if (!pillNav) return;

    let indicator = pillNav.querySelector('.proof-pill-indicator');
    if (!indicator) {
      indicator = document.createElement('span');
      indicator.className = 'proof-pill-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      pillNav.prepend(indicator);
    }

    const pillButtons = Array.from(pillNav.querySelectorAll('.proof-pill-btn'));

    const updatePill = (btn) => {
      if (!btn) return;
      const navRect = pillNav.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();

      const left = btnRect.left - navRect.left;
      const width = btnRect.width;
      const height = btnRect.height;
      const top = btnRect.top - navRect.top;

      indicator.style.opacity = '1';
      indicator.style.width = `${width}px`;
      indicator.style.height = `${height}px`;
      indicator.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    };

    const initialActive = pillNav.querySelector('.proof-pill-btn.active') || pillButtons[0];
    if (initialActive) {
      setTimeout(() => updatePill(initialActive), 60);
    }

    pillButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        updatePill(btn);
      });
    });

    window.addEventListener('resize', () => {
      const active = pillNav.querySelector('.proof-pill-btn.active');
      updatePill(active);
    });
  },

  /**
   * 3. BOTONES Y MICRO-INTERACCIONES TÁCTILES
   * Soporte táctil y destellos sutiles de alta fidelidad.
   */
  initButtonHaptics() {
    // Añade soporte visual y auditivo/táctil a botones
    document.querySelectorAll('.btn').forEach(btn => {
      btn.classList.add('btn-motion');
    });
  }
};
