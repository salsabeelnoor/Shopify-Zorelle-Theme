import { Component } from '@theme/component';

/**
 * Zorelle Quick links row (sections/collection-quick-links.liquid).
 *
 * Shows the previous / next arrows only when the links overflow the row, disables each one
 * at its end, and slides the row by most of its visible width per click (smooth unless the
 * visitor prefers reduced motion). Works in left-to-right and right-to-left layouts.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} track - The scrolling list of links.
 * @property {HTMLElement} arrows - The arrow row.
 * @property {HTMLButtonElement} previous - The previous arrow.
 * @property {HTMLButtonElement} next - The next arrow.
 *
 * @extends Component<Refs>
 */
class QuickLinksScroller extends Component {
  requiredRefs = ['track', 'arrows', 'previous', 'next'];

  /** @type {AbortController | undefined} */
  #controller;

  /** @type {ResizeObserver | undefined} */
  #resizeObserver;

  connectedCallback() {
    super.connectedCallback();

    this.#controller?.abort();
    this.#controller = new AbortController();

    const { track } = this.refs;
    const { signal } = this.#controller;
    track.addEventListener('scroll', this.#update, { passive: true, signal });

    this.#resizeObserver?.disconnect();
    this.#resizeObserver = new ResizeObserver(this.#update);
    this.#resizeObserver.observe(track);

    // Page scroll (window or the .page-wrapper scroller) toggles the section's stuck state.
    document.addEventListener('scroll', this.#scheduleStuck, { passive: true, capture: true, signal });
    window.addEventListener('resize', this.#scheduleStuck, { passive: true, signal });

    this.#update();
    this.#updateStuck();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#controller?.abort();
    this.#resizeObserver?.disconnect();
    if (this.#stuckFrame) cancelAnimationFrame(this.#stuckFrame);
  }

  /** @type {number | undefined} */
  #stuckFrame;

  #scheduleStuck = () => {
    if (this.#stuckFrame) return;
    this.#stuckFrame = requestAnimationFrame(() => {
      this.#stuckFrame = undefined;
      this.#updateStuck();
    });
  };

  /**
   * Marks the sticky quick links section with data-stuck while it sits at its sticky
   * offset under the header, so CSS can give it a different background.
   */
  #updateStuck() {
    const section = this.closest('.section-quick-links');
    if (!(section instanceof HTMLElement)) return;

    const stickyTop = parseFloat(getComputedStyle(section).top);
    if (Number.isNaN(stickyTop)) return;

    const stuck = section.getBoundingClientRect().top <= stickyTop + 1;
    section.toggleAttribute('data-stuck', stuck);
  }

  /** Slides towards the start of the row. */
  previous() {
    this.#slide(-1);
  }

  /** Slides towards the end of the row. */
  next() {
    this.#slide(1);
  }

  /** @returns {number} 1 for left-to-right, -1 for right-to-left. */
  get #direction() {
    return getComputedStyle(this).direction === 'rtl' ? -1 : 1;
  }

  /** @param {1 | -1} step - Towards the end (1) or the start (-1). */
  #slide(step) {
    const { track } = this.refs;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollBy({
      left: step * this.#direction * track.clientWidth * 0.8,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }

  /** Shows the arrows when the row overflows and disables each at its end. */
  #update = () => {
    const { track, arrows, previous, next } = this.refs;
    const maxScroll = track.scrollWidth - track.clientWidth;
    const overflows = maxScroll > 1;

    arrows.hidden = !overflows;
    if (!overflows) return;

    // In RTL, scrollLeft runs from 0 to -maxScroll.
    const position = Math.abs(track.scrollLeft);
    previous.disabled = position <= 1;
    next.disabled = position >= maxScroll - 1;
  };
}

if (!customElements.get('quick-links-scroller')) {
  customElements.define('quick-links-scroller', QuickLinksScroller);
}
