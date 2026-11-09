/**
 * Zorelle product card CTA (<card-actions>), rendered by snippets/product-card-actions.liquid.
 *
 * Size mode: the toggle reveals the size buttons (above 1024px on hover via CSS, otherwise
 * via the [open] attribute; up to 1024px as a popover above the cart icon). Choosing a size
 * writes its variant ID into the product form and submits it, so Horizon's
 * product-form-component handles the add to cart, then the picker closes after a moment.
 */
class CardActions extends HTMLElement {
  /** @type {AbortController | undefined} */
  #abortController;

  /** @type {ResizeObserver | undefined} */
  #resizeObserver;

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #scrollTimer;

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #closeTimer;

  /** How long the chosen size stays highlighted before the picker closes (ms). */
  static CLOSE_DELAY = 150;

  connectedCallback() {
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    const { signal } = this.#abortController;

    // Above 1024px the toggle is hidden while open; up to 1024px the cart icon stays
    // visible and a second tap closes the popover.
    this.toggleButton?.addEventListener('click', () => this.setOpen(!this.hasAttribute('open'), { focus: true }), {
      signal,
    });
    this.addEventListener('click', this.#handleSizeClick, { signal });
    this.addEventListener('keydown', this.#handleKeydown, { signal });
    // Mouse only: a touch tap always fires pointerleave right after pointerup, which
    // closed the picker before the tapped size or arrow received its click.
    this.addEventListener(
      'pointerleave',
      (event) => {
        if (event.pointerType === 'mouse') this.setOpen(false);
      },
      { signal }
    );
    // Touch: tapping anywhere outside the card CTA closes the picker.
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (this.hasAttribute('open') && event.target instanceof Node && !this.contains(event.target)) {
          this.setOpen(false);
        }
      },
      { signal, passive: true }
    );

    const track = this.track;
    if (track) {
      for (const button of this.querySelectorAll('[data-card-actions-scroll]')) {
        if (!(button instanceof HTMLButtonElement)) continue;
        const step = button.dataset.cardActionsScroll === 'prev' ? -1 : 1;
        button.addEventListener('click', () => this.#scrollSizes(step), { signal });
      }
      track.addEventListener('scroll', () => this.#updateScrollButton(), { signal, passive: true });
      track.addEventListener('scrollend', () => this.#updateScrollButton(), { signal });
      this.#resizeObserver = new ResizeObserver(() => this.#updateScrollButton());
      this.#resizeObserver.observe(track);
    }
  }

  disconnectedCallback() {
    this.#abortController?.abort();
    this.#resizeObserver?.disconnect();
    clearTimeout(this.#scrollTimer);
    clearTimeout(this.#closeTimer);
  }

  get toggleButton() {
    const button = this.querySelector('[data-card-actions-toggle]');
    return button instanceof HTMLButtonElement ? button : null;
  }

  get track() {
    const track = this.querySelector('[data-card-actions-track]');
    return track instanceof HTMLElement ? track : null;
  }

  /**
   * Opens or closes the size picker.
   * @param {boolean} open
   * @param {{ focus?: boolean }} [options]
   */
  setOpen(open, { focus = false } = {}) {
    const toggle = this.toggleButton;
    if (!toggle) return;

    clearTimeout(this.#closeTimer);
    if (open) {
      for (const button of this.querySelectorAll('[data-variant-id][data-added]')) button.removeAttribute('data-added');
    }
    this.toggleAttribute('open', open);
    toggle.setAttribute('aria-expanded', `${open}`);

    if (open) {
      this.#updateScrollButton();
      const firstSize = this.querySelector('[data-variant-id]:not(:disabled)');
      if (focus && firstSize instanceof HTMLButtonElement) firstSize.focus();
    }
  }

  /** @param {MouseEvent} event */
  #handleSizeClick = (event) => {
    if (!(event.target instanceof Element)) return;
    const sizeButton = event.target.closest('[data-variant-id]');
    if (!(sizeButton instanceof HTMLButtonElement) || sizeButton.disabled) return;

    const form = this.querySelector('form');
    const idInput = form?.querySelector('input[name="id"]');
    if (!(form instanceof HTMLFormElement) || !(idInput instanceof HTMLInputElement)) return;

    idInput.value = sizeButton.dataset.variantId ?? '';
    idInput.disabled = false;
    form.requestSubmit();

    // Show the chosen size as selected for a moment, then close the picker (it fades out
    // slowly via CSS). Focus returns to the toggle so it is not lost.
    for (const button of this.querySelectorAll('[data-variant-id][data-added]')) button.removeAttribute('data-added');
    sizeButton.setAttribute('data-added', '');
    const hadFocus = sizeButton.matches(':focus');
    clearTimeout(this.#closeTimer);
    this.#closeTimer = setTimeout(() => {
      this.setOpen(false);
      if (hadFocus && this.contains(document.activeElement)) this.toggleButton?.focus({ preventScroll: true });
      // Clear the selected look once the fade-out (0.5s in CSS) has finished.
      this.#closeTimer = setTimeout(() => sizeButton.removeAttribute('data-added'), 600);
    }, CardActions.CLOSE_DELAY);
  };

  /** @param {KeyboardEvent} event */
  #handleKeydown = (event) => {
    if (event.key !== 'Escape' || !this.hasAttribute('open')) return;
    this.setOpen(false);
    this.toggleButton?.focus();
  };

  /**
   * Scrolls the size list one step towards the end (1) or the start (-1).
   * @param {1 | -1} step
   */
  #scrollSizes(step) {
    const track = this.track;
    if (!track) return;
    const rtl = getComputedStyle(track).direction === 'rtl' ? -1 : 1;
    track.scrollBy({ left: track.clientWidth * 0.75 * step * rtl });
    // Fallback for browsers without scrollend: re-check once smooth scrolling settles.
    clearTimeout(this.#scrollTimer);
    this.#scrollTimer = setTimeout(() => this.#updateScrollButton(), 400);
  }

  /** Shows each arrow only when there are more sizes in that direction. */
  #updateScrollButton() {
    const track = this.track;
    if (!track) return;

    // scrollLeft is negative in RTL; use its distance from the start edge.
    const fromStart = Math.abs(track.scrollLeft);
    const canGoBack = fromStart > 1;
    const canGoForward = fromStart + track.clientWidth < track.scrollWidth - 1;

    for (const button of this.querySelectorAll('[data-card-actions-scroll]')) {
      if (!(button instanceof HTMLButtonElement)) continue;
      button.hidden = button.dataset.cardActionsScroll === 'prev' ? !canGoBack : !canGoForward;
    }
  }
}

if (!customElements.get('card-actions')) {
  customElements.define('card-actions', CardActions);
}
