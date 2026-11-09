/**
 * Zorelle Product showcase carousel (<product-showcase-slider>),
 * rendered by sections/product-showcase.liquid when the layout is "Carousel".
 *
 * The track is a native horizontal scroller with scroll snapping (swipe and trackpad
 * work without JS). This adds the prev/next arrows (one card per click) and keeps the
 * progress pagination below the track in sync with the scroll position.
 */
class ProductShowcaseSlider extends HTMLElement {
  /** @type {AbortController | undefined} */
  #abortController;

  /** @type {ResizeObserver | undefined} */
  #resizeObserver;

  connectedCallback() {
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    const { signal } = this.#abortController;

    const track = this.track;
    if (!track) return;

    this.prevButton?.addEventListener('click', () => this.#step(-1), { signal });
    this.nextButton?.addEventListener('click', () => this.#step(1), { signal });
    // A few layout reads per scroll event; cheap enough to run directly.
    track.addEventListener('scroll', () => this.#update(), { signal, passive: true });

    this.#resizeObserver?.disconnect();
    this.#resizeObserver = new ResizeObserver(() => this.#update());
    this.#resizeObserver.observe(track);

    this.#update();
  }

  disconnectedCallback() {
    this.#abortController?.abort();
    this.#resizeObserver?.disconnect();
  }

  get track() {
    const track = this.querySelector('[data-showcase-track]');
    return track instanceof HTMLElement ? track : null;
  }

  get prevButton() {
    const button = this.querySelector('[data-showcase-prev]');
    return button instanceof HTMLButtonElement ? button : null;
  }

  get nextButton() {
    const button = this.querySelector('[data-showcase-next]');
    return button instanceof HTMLButtonElement ? button : null;
  }

  /**
   * Scrolls one card towards the end (1) or the start (-1).
   * @param {1 | -1} direction
   */
  #step(direction) {
    const track = this.track;
    if (!track) return;

    const item = track.querySelector('[data-showcase-item]');
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const distance = (item instanceof HTMLElement ? item.offsetWidth : track.clientWidth) + gap;
    const rtl = getComputedStyle(track).direction === 'rtl' ? -1 : 1;

    track.scrollBy({ left: distance * direction * rtl });
  }

  /** Arrow states and the pagination thumb (size = visible share, offset = scroll progress). */
  #update() {
    const track = this.track;
    if (!track) return;

    const maxScroll = track.scrollWidth - track.clientWidth;
    // scrollLeft is negative in RTL; use the distance from the start edge.
    const fromStart = Math.abs(track.scrollLeft);
    const scrollable = maxScroll > 1;

    this.toggleAttribute('data-static', !scrollable);

    if (this.prevButton) this.prevButton.disabled = !scrollable || fromStart <= 1;
    if (this.nextButton) this.nextButton.disabled = !scrollable || fromStart >= maxScroll - 1;

    const size = scrollable ? track.clientWidth / track.scrollWidth : 1;
    const progress = scrollable ? Math.min(1, fromStart / maxScroll) : 0;
    this.style.setProperty('--showcase-thumb-size', size.toFixed(4));
    this.style.setProperty('--showcase-thumb-offset', (progress * (1 - size)).toFixed(4));
  }
}

if (!customElements.get('product-showcase-slider')) {
  customElements.define('product-showcase-slider', ProductShowcaseSlider);
}
