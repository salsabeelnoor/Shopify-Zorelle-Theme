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
    track.addEventListener('scroll', this.#update, { passive: true, signal: this.#controller.signal });

    this.#resizeObserver?.disconnect();
    this.#resizeObserver = new ResizeObserver(this.#update);
    this.#resizeObserver.observe(track);

    this.#update();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#controller?.abort();
    this.#resizeObserver?.disconnect();
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
